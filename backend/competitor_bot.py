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
        page.goto(url)
        page.wait_for_load_state("domcontentloaded")
        sayfa_temizle(page)

        # Lazy load scroll
        for _ in range(6):
            page.keyboard.press("End")
            time.sleep(0.7)
        page.keyboard.press("Home")
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


def urun_verisi_cek(page, url, marka):
    """
    Tek ürün detay sayfasından snapshot kaydı çek.
    Dönüş: {ad, fiyat, puan, deg, url, marka} (snapshots.json formatıyla pariteli).
    """
    try:
        page.goto(url)
        page.wait_for_load_state("domcontentloaded")
        time.sleep(1.5)
        page.keyboard.press("Escape")
        # Konum seç tooltip'ini kapat
        try:
            page.get_by_role("button", name="Anladım").click(timeout=2000)
        except Exception:
            pass

        try:
            ad = page.get_by_test_id("product-title").inner_text().strip()
        except Exception:
            ad = "—"

        try:
            # Önce indirimli fiyat (span.discounted), sonra normal fiyat
            fiyat_el = (
                page.query_selector("span.discounted") or
                page.query_selector("span.prc-dsc") or
                page.get_by_test_id("lowest-price")
            )
            fiyat_raw = fiyat_el.inner_text() if fiyat_el else "0"
            fiyat = float(re.sub(r"[^\d,]", "", fiyat_raw).replace(",", ".") or "0")
        except Exception:
            fiyat = 0.0

        try:
            puan_el = (
                page.query_selector("span.reviews-summary-average-rating") or
                page.query_selector("div.product-rating-score span") or
                page.query_selector("span.ratingScore")
            )
            puan = float(puan_el.inner_text().strip()) if puan_el else 0.0
        except Exception:
            puan = 0.0

        try:
            deg_raw = page.get_by_test_id("review-info-link").inner_text()
            deg = int(re.sub(r"[^\d]", "", deg_raw) or "0")
        except Exception:
            deg = 0

        # snapshots.json ile AYNI alanlar + marka
        return {"ad": ad, "fiyat": fiyat, "puan": puan, "deg": deg,
                "url": url, "marka": marka}
    except Exception as e:
        print(f"    [HATA] {e}")
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


def calistir():
    stores = load_competitor_stores()
    print(f"Tekilleştirilmiş aktif rakip mağaza sayısı: {len(stores)}")
    for s in stores:
        print(f"  • {s['marka']}: {s['magaza_url']}")

    if not stores:
        print("[UYARI] Aktif rakip mağaza yok.")
        return

    tarih = datetime.now().strftime("%Y-%m-%d")
    gun_snapshot = {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=HEADLESS)
        page = browser.new_context(user_agent=USER_AGENT).new_page()
        for s in stores:
            urunler = scrape_store(page, s["magaza_url"], s["marka"])
            gun_snapshot.update(urunler)
        browser.close()

    data = load_existing_output()
    data[tarih] = gun_snapshot

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"\n{'─' * 55}")
    print(f"[TAMAMLANDI] {tarih}: {len(gun_snapshot)} rakip ürün → {OUTPUT_FILE}")


if __name__ == "__main__":
    print("RoomArt Rakip Scraper — Trendyol Mağaza (parametrik)\n")
    calistir()
