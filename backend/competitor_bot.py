#!/usr/bin/env python3
"""
RoomArt BCG — Rakip Mağaza Scraper (parametrik)
================================================
rani_bot.py temel alınarak PARAMETRİK hale getirildi: mağaza URL'i artık
dışarıdan (data/competitors.json) gelir. Excel yerine JSON yazar.

Girdi : data/competitors.json
        {"kategoriler": {"<kat>": [{"marka", "magaza_url", "aktif"}]}}
        magaza_url içinde "{}" placeholder vardır (sayfa no .format için).

Çıktı : data/competitor_snapshots.json — snapshots.json ile AYNI format:
        {"YYYY-MM-DD": {urun_id: {ad, fiyat, puan, deg, url, marka}}}
        ("marka" alanı göreceli pay gruplaması için eklenir.)

NOT:
  • aktif=true olan rakipler scrape edilir. Aynı magaza_url birden çok kategoride
    geçebilir → TEKİLLEŞTİRİLİR, her mağaza yalnızca BİR kez çekilir.
  • Bu dosya analyzer'a HENÜZ bağlı değildir (ayrı PR).
  • rani_bot.py referans olarak korunur; bu dosya onun parametrik kopyasıdır.
"""

from playwright.sync_api import sync_playwright
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path

# data/ deposu repo kökünde (analyzer.py ile aynı çözümleme)
DATA_DIR = Path(__file__).parent.parent / "data"
COMPETITORS_FILE = DATA_DIR / "competitors.json"
OUTPUT_FILE = DATA_DIR / "competitor_snapshots.json"

HEADLESS = True
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
MAX_PAGES = 5         # mağaza başına sayfa tavanı (CI maliyeti + kibarlık).
                      # Trendyol "Önerilen" sırası popüler/çok-yorumlu ürünleri öne alır →
                      # ilk 5 sayfa rakibin güçlü ürünlerini yakalar; en-çok-yorumlu seçimi
                      # ayrıca competitor_analyzer'da kategori başına top-N ile yapılır.


def parse_rating_price(html):
    """Gömülü JSON state'ten puan/deg/fiyat çıkar — RENDER BAĞIMSIZ (scraper.py ile aynı
    sağlam desen; DOM selektöründen güvenilir). deg = totalCount (Değerlendirme sayısı)."""
    puan, deg, fiyat = 0.0, 0, 0.0
    rs = re.search(r'"ratingScore":\s*\{([^}]*)\}', html)
    if rs:
        a = re.search(r'"averageRating":\s*([0-9.]+)', rs.group(1))
        t = re.search(r'"totalCount":\s*(\d+)', rs.group(1))
        if a:
            puan = round(float(a.group(1)), 1)
        if t:
            deg = int(t.group(1))
    pr = re.search(r'"sellingPrice":\s*\{\s*"value":\s*([0-9.]+)', html)
    if pr:
        fiyat = float(pr.group(1))
    return puan, deg, fiyat


# ── Girdi: rakip mağaza listesi (tekilleştirilmiş) ────────────────────────────
def load_competitor_stores():
    """
    competitors.json'dan aktif=true rakipleri oku, magaza_url'e göre TEKİLLEŞTİR.
    Aynı mağaza birden çok kategoride geçtiğinden gereksiz tekrar scrape önlenir.
    Dönüş: [{"marka": ..., "magaza_url": ...}, ...] (her mağaza bir kez).
    """
    doc = json.load(open(COMPETITORS_FILE, encoding="utf-8"))
    seen = {}  # magaza_url -> marka
    for kategori, rakipler in doc.get("kategoriler", {}).items():
        for r in rakipler:
            if not r.get("aktif"):
                continue
            url = r.get("magaza_url", "")
            if not url or "{}" not in url:
                continue
            seen.setdefault(url, r.get("marka", "?"))
    return [{"marka": marka, "magaza_url": url} for url, marka in seen.items()]


# ── Sayfa yardımcıları (rani_bot.py'den taşındı) ──────────────────────────────
def sayfa_temizle(page):
    time.sleep(2)
    page.keyboard.press("Escape")
    time.sleep(0.5)
    try:
        page.get_by_role("button", name="Tümünü Reddet").click(timeout=2000)
        time.sleep(0.5)
    except Exception:
        pass
    page.keyboard.press("Escape")
    time.sleep(0.5)


def urlleri_topla(page, magaza_url):
    """Mağazanın tüm sayfalarını gez, ürün URL'lerini topla. magaza_url '{}' içerir."""
    tum_urller = []
    sayfa = 1

    while True:
        url = magaza_url.format(sayfa)
        print(f"  [Sayfa {sayfa}] {url}")
        page.goto(url, wait_until="domcontentloaded", timeout=45000)
        sayfa_temizle(page)
        # Ürün ızgarası SPA ile sonradan render olur (headless/CI'da domcontentloaded YETMEZ) →
        # ürün linki GÖRÜNENE kadar açıkça bekle; gelmezse networkidle + JS-scroll ile zorla.
        try:
            page.wait_for_selector("a[href*='-p-']", timeout=15000)
        except Exception:
            try:
                page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass
        # JS scroll (keyboard End headless'ta focus gerektirir; window.scrollTo daha güvenilir)
        for _ in range(6):
            page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            time.sleep(0.7)
        page.evaluate("window.scrollTo(0, 0)")
        time.sleep(0.5)

        yeni = []
        for link in page.query_selector_all("a[href*='-p-']"):
            href = link.get_attribute("href")
            if not href:
                continue
            tam = "https://www.trendyol.com" + href if href.startswith("/") else href
            if tam not in tum_urller:
                yeni.append(tam)

        if not yeni:
            print(f"  → Sayfa {sayfa} boş, tamamlandı.")
            break

        tum_urller.extend(yeni)
        print(f"  → {len(yeni)} URL eklendi. Toplam: {len(tum_urller)}")

        sonraki = page.query_selector("a[title='Sonraki Sayfa'], li.pagination-next a")
        if not sonraki:
            print("  → Son sayfa.")
            break
        if sayfa >= MAX_PAGES:
            print(f"  → Sayfa tavanı ({MAX_PAGES}) — duruldu.")
            break

        sayfa += 1
        time.sleep(1)

    return list(dict.fromkeys(tum_urller))


def ozellikleri_cek(page):
    """
    Ürün özniteliklerini çek (Fonksiyon/Materyal/Kapak vb.). rani_bot.py'den taşındı.
    NOT: competitor_snapshots.json şeması (snapshots.json ile pariteli) bu alanları
    İÇERMEZ; fonksiyon ileride zenginleştirme için referans olarak korunur.
    """
    hedef = {"Fonksiyon": "", "Materyal": "", "Kapak Sayısı": "",
             "Dolap Ölçüsü": "", "Stil": "", "Tema / Stil": "", "Özellik": ""}
    try:
        for kart in page.query_selector_all("div.attribute-item"):
            try:
                k_el = kart.query_selector("div.name")
                v_el = kart.query_selector("div.value")
                if k_el and v_el:
                    k = k_el.inner_text().strip()
                    v = v_el.inner_text().strip()
                    if k in hedef:
                        hedef[k] = v
            except Exception:
                continue
    except Exception:
        pass
    return hedef


def _ad_from_json(html):
    """DOM başlık alınamazsa gömülü JSON-LD / state'ten ürün adı (yedek)."""
    m = re.search(r'"@type":"Product"[^{]*?"name":"([^"]{3,200})"', html)
    if not m:
        m = re.search(r'"productName":"([^"]{3,200})"', html)
    return m.group(1).strip() if m else None


def urun_verisi_cek(page, url, marka, retries=1):
    """
    Tek ürün detay sayfasından snapshot kaydı çek (RENDER BAĞIMSIZ — gömülü JSON).
    Dönüş: {ad, fiyat, puan, deg, url, marka} (snapshots.json formatıyla pariteli).
    ad alınamazsa None (kötü/yönlendirilmiş sayfa) → çağıran atlar; %başarı eşiğine düşer.
    """
    for attempt in range(retries + 1):
        try:
            resp = page.goto(url, wait_until="domcontentloaded", timeout=30000)
            if resp and resp.status >= 400:
                return None
            time.sleep(1.2)
            # ad: DOM başlık (server-render), yoksa gömülü JSON'a düş
            try:
                ad = page.get_by_test_id("product-title").inner_text().strip()
            except Exception:
                ad = ""
            html = page.content()
            if not ad:
                ad = _ad_from_json(html) or ""
            puan, deg, fiyat = parse_rating_price(html)
            # fiyat JSON'dan gelmezse DOM'a düş (yedek)
            if fiyat == 0.0:
                try:
                    el = page.query_selector("span.discounted") or page.query_selector("span.prc-dsc")
                    if el:
                        fiyat = float(re.sub(r"[^\d,]", "", el.inner_text()).replace(",", ".") or "0")
                except Exception:
                    pass
            if not ad:
                if attempt < retries:
                    continue          # transient → tek tekrar
                return None            # ad yok → güvenilmez, atla
            return {"ad": ad[:160], "fiyat": fiyat, "puan": puan, "deg": deg,
                    "url": url, "marka": marka}
        except Exception as e:
            if attempt < retries:
                time.sleep(1.0)
                continue
            print(f"    [HATA] {str(e)[:80]}")
            return None


def extract_product_id(url):
    """Trendyol URL'sinden ürün ID'sini çıkar (...-p-XXXXXX?...)."""
    m = re.search(r"-p-(\d+)", url or "")
    return m.group(1) if m else None


# ── Mağaza bazında scrape ─────────────────────────────────────────────────────
def scrape_store(page, magaza_url, marka):
    """Tek mağazanın tüm ürünlerini çek → {urun_id: kayit}."""
    print(f"\n── Mağaza: {marka} ──")
    print("  Aşama 1: URL toplama")
    urller = urlleri_topla(page, magaza_url)
    print(f"  → {len(urller)} ürün bulundu.")

    sonuc = {}
    print("  Aşama 2: Detay çekme")
    for i, url in enumerate(urller, 1):
        pid = extract_product_id(url)
        if not pid:
            continue
        print(f"  [{i}/{len(urller)}]", end=" ")
        veri = urun_verisi_cek(page, url, marka)
        if not veri:
            print("Atlandı.")
            continue
        sonuc[pid] = veri
        print(f"{veri['ad'][:50]} | {veri['fiyat']} TL | {veri['puan']}★ | {veri['deg']} değ.")
        time.sleep(1)
    print(f"  [{marka}] {len(sonuc)} ürün kaydedildi.")
    return sonuc


def load_existing_output():
    if OUTPUT_FILE.exists():
        try:
            return json.load(open(OUTPUT_FILE, encoding="utf-8"))
        except Exception:
            return {}
    return {}


# ── REFRESH modu (CI, korumaya takılmaz — scrape.yml/scraper.py ile AYNI desen) ──
# Mağaza LİSTELEME sayfaları SPA/arama-API olduğu için GitHub Actions IP'lerinde boş döner
# (bot-koruması). Ama ÜRÜN-DETAY sayfaları server-render → CI'da sorunsuz açılır (scrape.yml
# kanıtı). Bu yüzden CI'da listeleme YAPMAYIZ; bilinen rakip ürün URL'lerini (seed) gezip
# fiyat/puan/yorum tazeleriz. Seed'i `collect` modu (yerel/residential) üretir/genişletir.
MIN_SUCCESS_RATIO = 0.5


def load_seed():
    """En güncel snapshot gününü seed al: {pid: {url, marka}} (URL'i olan ürünler)."""
    data = load_existing_output()
    # En son DOLU günü seed al (boş/engellenmiş refresh günü seed'i bozmasın).
    days = [d for d in sorted(data) if data.get(d)]
    if not days:
        return {}, data
    last = data[days[-1]]
    seed = {pid: {"url": r.get("url"), "marka": r.get("marka", "?")}
            for pid, r in last.items() if r.get("url")}
    return seed, data


def refresh_run():
    """CI haftalık: seed ürün URL'lerini gez, detay sayfasından tazele (listeleme YOK)."""
    seed, data = load_seed()
    if not seed:
        print("[UYARI] Seed yok (competitor_snapshots.json boş). Önce yerelde "
              "`python backend/competitor_bot.py collect` ile seed kur.")
        return
    tarih = datetime.now().strftime("%Y-%m-%d")
    gun = data.get(tarih, {})        # aynı gün resume
    print(f"REFRESH modu — seed {len(seed)} rakip ürün → {tarih}")

    def _flush():
        data[tarih] = gun
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    ok = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        page = browser.new_context(user_agent=USER_AGENT).new_page()
        page.set_default_timeout(8000)
        items = [(pid, s) for pid, s in seed.items() if pid not in gun]
        for i, (pid, s) in enumerate(items, 1):
            veri = urun_verisi_cek(page, s["url"], s["marka"])
            if veri:
                gun[pid] = veri
                ok += 1
            if i % 25 == 0:
                _flush()
                print(f"  {i}/{len(items)} ({ok} taze)")
        browser.close()
    _flush()
    ratio = ok / len(seed) if seed else 0
    print(f"\n[REFRESH TAMAM] {tarih}: {ok}/{len(seed)} ürün tazelendi (oran {ratio:.0%}).")
    if ratio < MIN_SUCCESS_RATIO:
        print(f"[UYARI] başarı {ratio:.0%} < %{int(MIN_SUCCESS_RATIO*100)} — sayfalar engellenmiş olabilir.")


def calistir():
    stores = load_competitor_stores()
    # Dev/test: `collect N` → ilk N mağaza ile sınırla.
    if len(sys.argv) > 2 and sys.argv[2].isdigit():
        n = int(sys.argv[2])
        stores = stores[:n]
        print(f"[DEV] mağaza limiti: ilk {n}")
    print(f"Tekilleştirilmiş aktif rakip mağaza sayısı: {len(stores)}")
    for s in stores:
        print(f"  • {s['marka']}: {s['magaza_url']}")

    if not stores:
        print("[UYARI] Aktif rakip mağaza yok.")
        return

    tarih = datetime.now().strftime("%Y-%m-%d")
    data = load_existing_output()
    gun_snapshot = data.get(tarih, {})       # aynı gün tekrar koşarsa devam et (idempotent/resume)
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    def _flush():
        """Her mağaza sonrası ARTIMLI yaz — çökme/internet kesintisi ilerlemeyi kaybetmesin."""
        data[tarih] = gun_snapshot
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    done = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        page = browser.new_context(user_agent=USER_AGENT).new_page()
        for s in stores:
            try:
                urunler = scrape_store(page, s["magaza_url"], s["marka"])
                gun_snapshot.update(urunler)
                done += 1
                _flush()                      # mağaza bitince hemen diske yaz
            except Exception as e:            # bir mağaza çökse (ör. ağ) diğerlerine devam
                print(f"  [MAĞAZA HATA] {s['marka']}: {str(e)[:90]} — atlandı, devam.")
                _flush()
        browser.close()

    print(f"\n{'─' * 55}")
    print(f"[TAMAMLANDI] {tarih}: {len(gun_snapshot)} rakip ürün, {done}/{len(stores)} mağaza → {OUTPUT_FILE}")


if __name__ == "__main__":
    # Mod: `collect` (listeleme; seed kur/genişlet — YEREL/residential, CI'da bot-koruması engeller)
    #      varsayılan `refresh` (seed ürün URL'lerini detay sayfasından tazele — CI-uyumlu)
    mode = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].isdigit() else "refresh"
    if mode == "collect":
        print("RoomArt Rakip Scraper — COLLECT (listeleme, yerel/residential)\n")
        calistir()
    else:
        print("RoomArt Rakip Scraper — REFRESH (ürün-detay, CI-uyumlu)\n")
        refresh_run()
