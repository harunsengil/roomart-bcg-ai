#!/usr/bin/env python3
"""
RoomArt BCG — Scraper v1 (seed-refresh, Playwright)
===================================================
Trendyol ROOMART ürünlerinin GÜNLÜK snapshot'ını alır → data/snapshots.json.

Tasarım (İş C v1):
  • Mağaza listesini (trendyol.com/magaza/...) DOLAŞMAZ — o sayfa anti-bot ile
    403/000 verir. Bunun yerine snapshots.json SON GÜNÜN ürün URL'lerini "seed"
    alır ve her ürün DETAY sayfasını tek tek tazeler (detay sayfası 200 dönüyor,
    CI'da da doğrulandı).
  • Yeni ürün KEŞFİ yoktur; katalog genişletmek için seed elle güncellenir
    (ya da ileride enumerate modu eklenir).
  • Çıktı: snapshots.json[bugün] = {pid: {ad, fiyat, puan, deg, url}} (append, idempotent).
    Bugün için snapshot zaten varsa tekrar çekmez.

Kibarlık & dayanıklılık: istek-arası gecikme, Escape/"Tümünü Reddet", ürün başına
hata toleransı (bir pid bozulursa o gün kırılmaz). Çok fazla ürün başarısız olursa
(yarım/bozuk gün) snapshot YAZILMAZ — momentum verisi kirlenmesin.

Selector'lar rpa_projesi/haftalik_snapshot.py + roomart_bot.py'den alınmıştır.
"""

import json
import logging
import os
import re
import time
from datetime import datetime
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
SNAPSHOT_FILE = DATA_DIR / "snapshots.json"

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
REQUEST_DELAY = 0.8          # ürünler arası kibar gecikme (sn)
NAV_TIMEOUT_MS = 45000       # sayfa yükleme zaman aşımı
MIN_SUCCESS_RATIO = 0.6      # seed'in en az %60'ı çekilmeli, yoksa gün yazılmaz


# ── IO ────────────────────────────────────────────────────────────────────────
def load_snapshots():
    if SNAPSHOT_FILE.exists():
        with open(SNAPSHOT_FILE, encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_snapshots(data):
    SNAPSHOT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(SNAPSHOT_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"Kaydedildi: {SNAPSHOT_FILE}")


def seed_products(snapshots):
    """snapshots.json son günün {pid: kayıt} sözlüğünü döndür (seed)."""
    if not snapshots:
        return {}
    last_day = sorted(snapshots.keys())[-1]
    logger.info(f"Seed günü: {last_day} ({len(snapshots[last_day])} ürün)")
    return snapshots[last_day]


def extract_pid(url):
    if url and "-p-" in url:
        return url.split("-p-")[-1].split("?")[0]
    return None


# ── Playwright yardımcıları ─────────────────────────────────────────────────--
def parse_product(page, url):
    """Ürün detay sayfasından {ad, fiyat, puan, deg} çıkar. Hata → None."""
    resp = page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
    status = resp.status if resp else None
    if status and status >= 400:
        logger.warning(f"  HTTP {status} — atlandı")
        return None
    # puan/deg JS ile geç render olur; probe'da 2500ms bekleme çalıştı (4.8★/39 deg).
    page.wait_for_timeout(2500)
    try:
        page.keyboard.press("Escape")
    except Exception:
        pass

    try:
        ad = page.get_by_test_id("product-title").inner_text().strip()
    except Exception:
        ad = "—"

    try:
        fiyat_el = (
            page.query_selector("span.discounted")
            or page.query_selector("span.prc-dsc")
            or page.get_by_test_id("lowest-price")
        )
        fiyat = float(re.sub(r"[^\d,]", "", fiyat_el.inner_text()).replace(",", ".") or "0") if fiyat_el else 0.0
    except Exception:
        fiyat = 0.0

    try:
        puan_el = (
            page.query_selector("span.reviews-summary-average-rating")
            or page.query_selector("div.product-rating-score span")
            or page.query_selector("span.ratingScore")
        )
        puan = float(puan_el.inner_text().strip()) if puan_el else 0.0
    except Exception:
        puan = 0.0

    try:
        deg_raw = page.get_by_test_id("review-info-link").inner_text()
        deg = int(re.sub(r"[^\d]", "", deg_raw) or "0")
    except Exception:
        deg = 0

    # Ad alınamadıysa sayfa muhtemelen bozuk/yönlendirilmiş → güvenilmez
    if ad == "—":
        return None

    return {"ad": ad[:60], "fiyat": fiyat, "puan": puan, "deg": deg, "url": url}


def scrape(seed):
    """Seed'deki her ürünü tazele. {pid: kayıt} döndür."""
    from playwright.sync_api import sync_playwright

    urunler = {}
    total = len(seed)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(user_agent=USER_AGENT)
        page = context.new_page()
        # Eksik element auto-wait'i 30s yerine ≤6s olsun (yoksa her üründe takılır)
        page.set_default_timeout(6000)

        for i, (pid, rec) in enumerate(seed.items(), 1):
            url = rec.get("url")
            if not url:
                continue
            try:
                logger.info(f"  [{i}/{total}] {pid}")
                veri = parse_product(page, url)
                if veri:
                    urunler[pid] = veri
                    logger.info(f"      ✓ {veri['ad'][:40]} | {veri['fiyat']} TL | {veri['puan']}★ | {veri['deg']} deg")
                else:
                    logger.warning(f"      atlandı (veri yok): {pid}")
            except Exception as e:
                logger.warning(f"      [HATA] {pid}: {str(e)[:80]}")
            time.sleep(REQUEST_DELAY)

        browser.close()
    return urunler


# ── Ana akış ────────────────────────────────────────────────────────────────--
def main():
    logger.info("RoomArt scraper v1 (seed-refresh) başlıyor...")
    snapshots = load_snapshots()
    today = datetime.now().strftime("%Y-%m-%d")

    if today in snapshots:
        logger.info(f"Bugün ({today}) için snapshot zaten var — atlanıyor.")
        return

    seed = seed_products(snapshots)
    if not seed:
        logger.error("Seed bulunamadı (snapshots.json boş). Önce bir ilk gün gerekir.")
        return

    urunler = scrape(seed)
    ratio = len(urunler) / len(seed) if seed else 0
    logger.info(f"Çekilen: {len(urunler)}/{len(seed)} ürün (oran {ratio:.0%})")

    if ratio < MIN_SUCCESS_RATIO:
        logger.error(
            f"Başarı oranı {ratio:.0%} < {MIN_SUCCESS_RATIO:.0%} — yarım/bozuk gün, "
            "snapshot YAZILMADI (momentum kirlenmesin)."
        )
        return

    # Kalite guard: puan/deg parse'ı sessizce kırılırsa ürünler "başarılı" görünür
    # ama deg=0 olur → momentum zehirlenir. Çoğu üründe deg>0 beklenir; değilse yazma.
    nonzero_deg = sum(1 for v in urunler.values() if v.get("deg", 0) > 0)
    deg_ratio = nonzero_deg / len(urunler) if urunler else 0
    if deg_ratio < 0.4:
        logger.error(
            f"deg parse şüpheli: yalnız {deg_ratio:.0%} üründe deg>0 — selector kırık "
            "olabilir, snapshot YAZILMADI (momentum kirlenmesin)."
        )
        return

    snapshots[today] = urunler
    save_snapshots(snapshots)
    logger.info(f"Tamamlandı: {today} → {len(urunler)} ürün eklendi. Toplam gün: {len(snapshots)}")


if __name__ == "__main__":
    main()
