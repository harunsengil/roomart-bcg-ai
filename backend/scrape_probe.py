#!/usr/bin/env python3
"""
CI selector TANI probu (İş C debug):
scraper'la AYNI ortamda (playwright==1.49.0, headless-shell) tek bir ürün detay
sayfasını açar ve puan/deg için hangi selector'ların eşleştiğini + scroll'dan
önce/sonra durumu + gerçek 'rating'/'review' markup'ını döker.

Amaç: scraper'da puan/deg neden 0 geliyor — selector mı değişti, lazy-load mu,
headless-shell render farkı mı? Hiçbir dosya yazmaz.
"""
import json
from pathlib import Path

DATA = Path(__file__).parent.parent / "data" / "snapshots.json"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

RATING_SELECTORS = [
    "span.reviews-summary-average-rating",
    "div.product-rating-score span",
    "span.ratingScore",
    '[class*="rating-score"]',
    '[class*="rating-line-count"]',
    '[data-testid="rating-score"]',
]
REVIEW_SELECTORS = [
    '[data-testid="review-info-link"]',
    "a.reviews-summary-reviews-detail",
    '[class*="review"] a',
    '[class*="total-review"]',
]
DUMP_JS = """() => {
  const out = [];
  const els = document.querySelectorAll(
    '[class*="rating"],[class*="review"],[class*="Rating"],[class*="Review"],[data-testid*="rating"],[data-testid*="review"]'
  );
  for (const e of els) {
    const id = e.getAttribute('data-testid') || e.getAttribute('class') || e.tagName;
    const txt = (e.innerText || '').trim().slice(0, 40).replace(/\\s+/g, ' ');
    out.push(`${e.tagName}[${id}] :: ${txt}`);
    if (out.length >= 25) break;
  }
  return out;
}"""


def seed_url():
    d = json.load(open(DATA, encoding="utf-8"))
    day = sorted(d.keys())[-1]
    pid, rec = next(iter(d[day].items()))
    return rec.get("url"), pid, day


def try_selectors(page, selectors, label):
    print(f"  -- {label} --")
    for sel in selectors:
        try:
            el = page.query_selector(sel)
            txt = el.inner_text().strip()[:30] if el else None
        except Exception as e:
            txt = f"ERR {str(e)[:30]}"
        print(f"    {sel!r:55} -> {txt}")


def main():
    from playwright.sync_api import sync_playwright

    url, pid, day = seed_url()
    print(f"[PROBE] seed={day} pid={pid}")
    print(f"[PROBE] URL: {url}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context(user_agent=UA).new_page()
        page.set_default_timeout(8000)
        resp = page.goto(url, wait_until="domcontentloaded", timeout=45000)
        print(f"[PROBE] HTTP STATUS: {resp.status if resp else None}")
        page.wait_for_timeout(2500)
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass

        try:
            ad = page.get_by_test_id("product-title").inner_text().strip()
        except Exception:
            ad = None
        print(f"[PROBE] ad: {ad}")

        print("\n[PROBE] === SCROLL ÖNCESİ ===")
        try_selectors(page, RATING_SELECTORS, "rating")
        try_selectors(page, REVIEW_SELECTORS, "review")

        # Yorumlar bölümü lazy-load olabilir → aşağı kaydır
        for _ in range(5):
            page.keyboard.press("End")
            page.wait_for_timeout(500)
        page.wait_for_timeout(1500)

        print("\n[PROBE] === SCROLL SONRASI ===")
        try_selectors(page, RATING_SELECTORS, "rating")
        try_selectors(page, REVIEW_SELECTORS, "review")

        print("\n[PROBE] === GERÇEK rating/review elementleri (markup) ===")
        try:
            for line in page.evaluate(DUMP_JS):
                print("   ", line)
        except Exception as e:
            print("   dump hatası:", str(e)[:80])

        browser.close()


if __name__ == "__main__":
    main()
