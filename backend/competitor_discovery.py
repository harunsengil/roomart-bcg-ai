#!/usr/bin/env python3
"""
RoomArt BCG — Rakip KEŞİF (veriyle, tahmin değil)
=================================================
Her iş kategorisi için Trendyol aramasını tarar, ürünlerin SATICI (merchant) bilgisini
gömülü JSON'dan çıkarır ve mağaza bazında YORUM HACMİNE göre en güçlü rakipleri sıralar.
Amaç: data/competitors.json'u tahmin yerine VERİYLE kurmak (mevcut 8'i de süzgeçten geçir).

Çıktı (gitignored, reports/):
  reports/competitor_discovery_<tarih>.json  — kategori → [{merchant, id, urun, yorum, puan, ornek}]
  reports/competitor_discovery_<tarih>.md    — okunur özet (kategori başına top mağazalar)

Bu script CI'da KOŞMAZ — liste bakımı için elle çalıştırılır (yerel, Playwright).
Çalıştırma (repo kökünden):  python3 backend/competitor_discovery.py

NOT: Trendyol DOM/anti-bot değişebilir; gömülü JSON çıkarımı DOM selektöründen sağlamdır.
"""
from __future__ import annotations

import json
import re
import sys
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import sync_playwright

REPO = Path(__file__).parent.parent
REPORTS = REPO / "reports"
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
ROOMART_MERCHANT_ID = 362387   # kendi mağazamız — keşiften hariç tut

# Kategori → Trendyol arama sorgusu (analyzer.CATEGORIES ile hizalı).
SEARCH_KEYWORDS = {
    "Çamaşır Makinesi Dolabı": "çamaşır makinesi dolabı",
    "Banyo Dolabı": "lavabolu banyo dolabı",
    "Mutfak Adası": "mutfak adası bar masası",
    "Kitaplıklı Çalışma Masası": "kitaplıklı çalışma masası",
    "Sehpa": "orta sehpa",
    "Kahve Köşesi": "kahve köşesi dolap",
}
PER_CATEGORY = 40       # kategori başına incelenecek ürün (≈2 arama sayfası)
TOP_N = 10              # raporda kategori başına gösterilecek mağaza


def _merchant(html):
    """Gömülü JSON'dan satıcı (mağaza) {id, name}. Yoksa (None, None)."""
    m = re.search(r'"merchant":\{"id":(\d+),"name":"([^"]{1,80})"', html)
    if m:
        return int(m.group(1)), m.group(2).strip()
    return None, None


def _rating_price(html):
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


def _collect_search_urls(page, query, limit):
    """Arama sonucundan ürün URL'leri topla (scroll + 2. sayfa)."""
    urls = []
    for sayfa in (1, 2):
        url = f"https://www.trendyol.com/sr?q={query.replace(' ', '%20')}&pi={sayfa}"
        page.goto(url, wait_until="domcontentloaded", timeout=30000)
        time.sleep(1.0)
        for _ in range(5):
            page.keyboard.press("End")
            time.sleep(0.6)
        for a in page.query_selector_all("a[href*='-p-']"):
            h = a.get_attribute("href")
            if not h:
                continue
            full = "https://www.trendyol.com" + h if h.startswith("/") else h
            if full not in urls:
                urls.append(full)
        if len(urls) >= limit:
            break
    return urls[:limit]


def discover_category(page, category, query):
    """Bir kategoride satıcı-bazlı yorum/ürün toplamı → sıralı mağaza listesi."""
    print(f"\n── {category}  (q='{query}')")
    urls = _collect_search_urls(page, query, PER_CATEGORY)
    print(f"  {len(urls)} ürün taranıyor...")
    agg = defaultdict(lambda: {"name": "", "products": 0, "reviews": 0,
                               "rating_sum": 0.0, "rated": 0, "sample": ""})
    for i, url in enumerate(urls, 1):
        try:
            r = page.goto(url, wait_until="domcontentloaded", timeout=30000)
            if r and r.status >= 400:
                continue
            time.sleep(0.8)
            html = page.content()
        except Exception:
            continue
        mid, mname = _merchant(html)
        if not mid or mid == ROOMART_MERCHANT_ID:
            continue
        puan, deg, _ = _rating_price(html)
        a = agg[mid]
        a["name"] = mname
        a["products"] += 1
        a["reviews"] += deg
        if puan > 0:
            a["rating_sum"] += puan
            a["rated"] += 1
        if not a["sample"]:
            a["sample"] = url
        if i % 10 == 0:
            print(f"    {i}/{len(urls)}")
    rows = []
    for mid, a in agg.items():
        rows.append({
            "merchant_id": mid,
            "merchant": a["name"],
            "products_seen": a["products"],
            "total_reviews": a["reviews"],
            "avg_rating": round(a["rating_sum"] / a["rated"], 2) if a["rated"] else None,
            "sample_url": a["sample"],
        })
    rows.sort(key=lambda x: -x["total_reviews"])
    return rows


def main():
    REPORTS.mkdir(parents=True, exist_ok=True)
    date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    result = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_context(user_agent=USER_AGENT).new_page()
        page.set_default_timeout(8000)
        only = sys.argv[1] if len(sys.argv) > 1 else None   # tek kategori test: arg=kategori adı
        for cat, q in SEARCH_KEYWORDS.items():
            if only and only.lower() not in cat.lower():
                continue
            result[cat] = discover_category(page, cat, q)
        browser.close()

    (REPORTS / f"competitor_discovery_{date}.json").write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [f"# Rakip Keşif — {date}", "",
             "Kategori başına Trendyol aramasında YORUM hacmine göre en güçlü mağazalar.",
             "competitors.json'u veriyle kurmak için (RoomArt hariç).", ""]
    for cat, rows in result.items():
        lines.append(f"## {cat}")
        lines.append("| # | Mağaza | merchant_id | Ürün | Toplam Yorum | Ort. Puan |")
        lines.append("|---|---|---|---|---|---|")
        for i, r in enumerate(rows[:TOP_N], 1):
            lines.append(f"| {i} | {r['merchant']} | {r['merchant_id']} | "
                         f"{r['products_seen']} | {r['total_reviews']} | {r['avg_rating']} |")
        lines.append("")
    (REPORTS / f"competitor_discovery_{date}.md").write_text("\n".join(lines), encoding="utf-8")
    print(f"\n[TAMAM] reports/competitor_discovery_{date}.md + .json")


if __name__ == "__main__":
    main()
