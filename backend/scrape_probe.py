#!/usr/bin/env python3
"""
CI fizibilite probu (İş C öncesi go/no-go):
GitHub Actions datacenter IP'sinden + headless Chromium ile Trendyol ürün
DETAY sayfası 200 mü 403 mü dönüyor, fiyat/puan/deg parse edilebiliyor mu?

Mağaza listesi (403'lük kısım) DENENMEZ — yalnız tek bir ürün detay sayfası.
snapshots.json son günün ilk ürününü seed alır. Hiçbir dosya yazmaz, salt teşhis.
"""
import json
import re
import sys
from pathlib import Path

DATA = Path(__file__).parent.parent / "data" / "snapshots.json"
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
      "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")


def seed_url():
    d = json.load(open(DATA, encoding="utf-8"))
    day = sorted(d.keys())[-1]
    pid, rec = next(iter(d[day].items()))
    return rec.get("url"), pid, day


def main():
    from playwright.sync_api import sync_playwright

    url, pid, day = seed_url()
    print(f"[PROBE] seed günü={day} pid={pid}")
    print(f"[PROBE] URL: {url}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context(user_agent=UA).new_page()
        resp = page.goto(url, wait_until="domcontentloaded", timeout=45000)
        status = resp.status if resp else None
        print(f"[PROBE] HTTP STATUS: {status}")
        page.wait_for_timeout(2500)
        try:
            page.keyboard.press("Escape")
        except Exception:
            pass

        try:
            ad = page.get_by_test_id("product-title").inner_text().strip()
        except Exception:
            ad = None
        puan_el = page.query_selector("span.reviews-summary-average-rating")
        puan = puan_el.inner_text().strip() if puan_el else None
        try:
            deg_raw = page.get_by_test_id("review-info-link").inner_text()
            deg = re.sub(r"[^\d]", "", deg_raw) or None
        except Exception:
            deg = None

        print(f"[PROBE] product-title: {ad}")
        print(f"[PROBE] puan: {puan} | deg: {deg}")
        browser.close()

    ok = status == 200 and bool(ad)
    print(f"[PROBE] SONUÇ: {'OK — CI scraping uygulanabilir (200 + veri)' if ok else f'BLOKLU/EKSİK (status={status}, ad={ad}) → plan B: lokal çalıştır'}")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
