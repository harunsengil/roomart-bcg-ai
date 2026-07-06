"""Çok-platform yorum/yıldız scraper — kendi ürünlerimiz için.

Trendyol zaten ana scraper'da (scraper.py) kapsanıyor.
Bu script n11 (ve ileride HB/Shopify) sayfalarından
rating + review_count çeker ve stock_code ile eşleştirir.

Çıktı: data/platform_reviews.json (gitignored)

Yerel çalıştırma:
  python3 backend/platform_review_scraper.py [--platform n11] [--limit 50]
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import time
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
OUT_FILE = DATA_DIR / "platform_reviews.json"

# ── Yardımcılar ───────────────────────────────────────────────────────────────

def _load_json(name: str, default=None):
    p = DATA_DIR / name
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding="utf-8"))


def _title_similarity(a: str, b: str) -> float:
    """İki başlık arasında kelime örtüşme skoru (0-1)."""
    def tokens(s):
        return set(re.sub(r'[^\w\s]', ' ', s.lower()).split())
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def _extract_jsonld_rating(html: str) -> tuple[float | None, int | None]:
    """JSON-LD'den aggregateRating al — Vue hash bağımsız, en güvenilir yöntem."""
    blocks = re.findall(r'application/ld\+json[^>]*>(.*?)</script>', html, re.DOTALL)
    for block in blocks:
        if 'aggregateRating' not in block:
            continue
        try:
            d = json.loads(block)
            ar = d.get('aggregateRating', {})
            rating = float(ar.get('ratingValue') or ar.get('ratingScore') or 0) or None
            count  = int(ar.get('ratingCount') or ar.get('reviewCount') or 0) or None
            if rating or count:
                return rating, count
        except Exception:
            pass
    return None, None


# ── n11 Scraper ───────────────────────────────────────────────────────────────

N11_STORE_URL = "https://www.n11.com/magaza/roomart"
N11_PAGE_DELAY = 1.2   # saniye — saygılı hız
N11_DETAIL_DELAY = 0.8


def _n11_store_pages(page, limit_pages: int = 0) -> list[dict]:
    """Mağaza listesinden tüm ürün URL + başlıklarını topla."""
    products = []
    pg = 1
    while True:
        url = f"{N11_STORE_URL}?pg={pg}"
        logger.info(f"  n11 mağaza sayfa {pg}: {url}")
        try:
            page.goto(url, wait_until="networkidle", timeout=30000)
            page.wait_for_timeout(1500)
        except Exception as e:
            logger.warning(f"  Sayfa {pg} yüklenemedi: {e}")
            break

        links = page.query_selector_all("a[href*='/urun/']")
        if not links:
            logger.info(f"  Sayfa {pg}: ürün linki yok — bitti.")
            break

        added = 0
        for link in links:
            href = (link.get_attribute("href") or "").split("?")[0].strip()
            if not href or "/urun/" not in href:
                continue
            # Başlık: anchor içindeki uzun metin satırı
            inner = link.inner_text() or ""
            lines = [l.strip() for l in inner.split("\n") if l.strip() and len(l.strip()) > 10
                     and not l.strip().isupper() and "TL" not in l]
            title = lines[0] if lines else ""
            # Yorum sayısı: (N) pattern
            review_match = re.search(r'\((\d+)\)', inner)
            review_count = int(review_match.group(1)) if review_match else None

            if href not in {p["url"] for p in products}:
                products.append({
                    "url":          href,
                    "n11_title":    title,
                    "review_count": review_count,  # mağaza kartından — detaylı sayfa önceliği alır
                })
                added += 1

        logger.info(f"  Sayfa {pg}: {added} ürün eklendi ({len(products)} toplam)")
        if limit_pages and pg >= limit_pages:
            break
        pg += 1
        time.sleep(N11_PAGE_DELAY)

    return products


def _n11_detail(page, url: str) -> tuple[float | None, int | None, str]:
    """Ürün detay sayfasından JSON-LD ile rating + review_count çek."""
    try:
        page.goto(url, wait_until="domcontentloaded", timeout=25000)
        page.wait_for_timeout(1200)
        html = page.content()
        rating, count = _extract_jsonld_rating(html)
        return rating, count, url
    except Exception as e:
        logger.debug(f"  Detail hata {url}: {e}")
        return None, None, url


def scrape_n11(limit_pages: int = 0, limit_products: int = 0,
               skip_no_reviews: bool = True) -> dict:
    """n11 mağaza sayfalarını tara, ürün detaylarını çek, stock_code ile eşleştir."""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        raise SystemExit("playwright yüklü değil: pip install playwright && playwright install chromium")

    n11_prods = _load_json("n11_sales.json", {}).get("products", {})
    if not n11_prods:
        logger.warning("n11_sales.json boş — önce n11_sync.py çalıştır.")

    # stock_code → title sözlüğü (eşleştirme için)
    sc_to_title = {sc: v.get("name", "") for sc, v in n11_prods.items()}

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            locale="tr-TR",
        )
        page = ctx.new_page()

        # 1. Mağaza sayfaları → ürün listesi
        logger.info("n11 mağaza sayfaları taranıyor...")
        store_items = _n11_store_pages(page, limit_pages=limit_pages)
        if limit_products:
            store_items = store_items[:limit_products]
        logger.info(f"Mağaza listesi: {len(store_items)} ürün")

        # 2. Detay sayfaları → rating (yalnız yorumu olan ürünler)
        results = {}
        to_scrape = store_items
        if skip_no_reviews:
            to_scrape = [s for s in store_items if s.get("review_count")]
            skipped = len(store_items) - len(to_scrape)
            logger.info(f"Yorumu olmayan {skipped} ürün atlandı, {len(to_scrape)} ürün taranacak")

        for i, item in enumerate(to_scrape, 1):
            rating, count, _ = _n11_detail(page, item["url"])
            # Detay sayfası daha güvenilir — mağaza kartı sayısı yedek
            final_count = count or item.get("review_count")
            final_rating = rating

            # stock_code eşleştirme: başlık benzerliği
            best_sc, best_score = None, 0.0
            n11_t = item.get("n11_title") or ""
            for sc, our_title in sc_to_title.items():
                score = _title_similarity(n11_t, our_title)
                if score > best_score:
                    best_score, best_sc = score, sc

            if best_score >= 0.25 and best_sc:
                results[best_sc] = {
                    "platform":     "n11",
                    "stock_code":   best_sc,
                    "n11_url":      item["url"],
                    "n11_title":    n11_t,
                    "rating":       final_rating,
                    "review_count": final_count,
                    "match_score":  round(best_score, 3),
                    "scraped_at":   datetime.now(timezone.utc).isoformat(),
                }
                if i <= 5 or i % 20 == 0:
                    logger.info(f"  [{i}/{len(to_scrape)}] {n11_t[:40]!r} → {best_sc} (sim={best_score:.2f}) ★{final_rating} ({final_count} yorum)")
            else:
                logger.debug(f"  [{i}/{len(to_scrape)}] Eşleşme yok: {n11_t[:50]!r} (max_sim={best_score:.2f})")

            time.sleep(N11_DETAIL_DELAY)

        browser.close()

    logger.info(f"n11: {len(results)} ürün eşleşti / {len(to_scrape)} scrape edildi")
    return results


# ── HB Scraper (stub — HB aktive olunca doldurulacak) ────────────────────────

def scrape_hb(limit_products: int = 0) -> dict:
    """Hepsiburada ürün sayfalarından rating + review_count (HB API aktive olunca)."""
    hb_prods = _load_json("hb_sales.json", {}).get("products", {})
    if not hb_prods:
        logger.warning("hb_sales.json yok — HB API aktive olunca çalıştır.")
        return {}
    logger.warning("HB scraper henüz implemente edilmedi — HB sayfası yapısı keşfedilecek.")
    return {}


# ── Ana akış ──────────────────────────────────────────────────────────────────

def run(platforms: list[str], limit_pages: int = 0, limit_products: int = 0) -> None:
    # Mevcut çıktıyı yükle (artımlı güncelleme)
    existing = _load_json("platform_reviews.json") or {"metadata": {}, "by_stock_code": {}}
    by_sc = existing.get("by_stock_code", {})

    if "n11" in platforms:
        logger.info("=== n11 scrape başlıyor ===")
        n11_results = scrape_n11(limit_pages=limit_pages, limit_products=limit_products)
        for sc, data in n11_results.items():
            if sc not in by_sc:
                by_sc[sc] = {}
            by_sc[sc]["n11"] = data

    if "hb" in platforms:
        logger.info("=== HB scrape başlıyor ===")
        hb_results = scrape_hb(limit_products=limit_products)
        for sc, data in hb_results.items():
            if sc not in by_sc:
                by_sc[sc] = {}
            by_sc[sc]["hb"] = data

    # Özet
    n11_count = sum(1 for v in by_sc.values() if "n11" in v)
    hb_count  = sum(1 for v in by_sc.values() if "hb" in v)
    logger.info(f"Toplam eşleşen: n11={n11_count}, hb={hb_count}")

    out = {
        "metadata": {
            "updated_at":  datetime.now(timezone.utc).isoformat(),
            "n11_count":   n11_count,
            "hb_count":    hb_count,
            "total_skus":  len(by_sc),
        },
        "by_stock_code": by_sc,
    }
    DATA_DIR.mkdir(exist_ok=True)
    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info(f"Kaydedildi: {OUT_FILE}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Platform yorum/yıldız scraper")
    parser.add_argument("--platform",  nargs="+", default=["n11"], choices=["n11", "hb"],
                        help="Hangi platformları tara")
    parser.add_argument("--limit-pages",    type=int, default=0, help="Mağaza sayfa limiti (0=tümü)")
    parser.add_argument("--limit-products", type=int, default=0, help="Ürün sayfa limiti (0=tümü)")
    args = parser.parse_args()

    run(platforms=args.platform, limit_pages=args.limit_pages,
        limit_products=args.limit_products)
