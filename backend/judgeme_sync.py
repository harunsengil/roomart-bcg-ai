"""Judge.me yorum senkronu — roomartstore.com.tr (Shopify) yorumları.

Judge.me API'sinden tüm yorumları çeker, ürün (handle) bazında rating + yorum
sayısı hesaplar, Shopify handle→stok kodu köprüsüyle registry'ye bağlar.

Çıktı: data/platform_reviews.json → by_stock_code[SC]["shopify"] (n11 ile aynı yapı, gitignored)

Kimlik: backend/.env.judgeme.local
  JUDGEME_SHOP_DOMAIN, JUDGEME_API_TOKEN

Yerel çalıştırma:
  source backend/.env.judgeme.local && python3 backend/judgeme_sync.py
"""
from __future__ import annotations

import json
import logging
import os
import time
import urllib.request
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
OUT_FILE = DATA_DIR / "platform_reviews.json"

API_BASE = "https://judge.me/api/v1"
PER_PAGE = 100


def _config() -> tuple[str, str]:
    shop  = os.environ.get("JUDGEME_SHOP_DOMAIN", "").strip()
    token = os.environ.get("JUDGEME_API_TOKEN", "").strip()
    if not shop or not token or "BURAYA" in token:
        raise SystemExit("Eksik: JUDGEME_SHOP_DOMAIN / JUDGEME_API_TOKEN (.env.judgeme.local)")
    return shop, token


def _get(path: str, params: dict) -> dict:
    url = f"{API_BASE}/{path}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"User-Agent": "roomart-bcg/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode())


def fetch_all_reviews(shop: str, token: str) -> list[dict]:
    """Tüm yorumları sayfalayarak çek."""
    reviews, page = [], 1
    logger.info("Judge.me yorumları çekiliyor...")
    while True:
        data = _get("reviews", {
            "shop_domain": shop, "api_token": token,
            "page": page, "per_page": PER_PAGE,
        })
        batch = data.get("reviews", [])
        if not batch:
            break
        reviews.extend(batch)
        logger.info(f"  sayfa {page}: {len(batch)} yorum ({len(reviews)} toplam)")
        if len(batch) < PER_PAGE:
            break
        page += 1
        time.sleep(0.3)
    logger.info(f"Judge.me toplam: {len(reviews)} yorum")
    return reviews


def aggregate_by_handle(reviews: list[dict]) -> dict:
    """Yorumları ürün handle'ına göre topla: rating ort + sayı + son tarih.
    Yalnız yayınlanmış (published) yorumlar sayılır; shop-review'ı atla."""
    by_handle = {}
    for r in reviews:
        handle = (r.get("product_handle") or "").strip()
        if not handle or handle == "judgeme-shop-reviews":
            continue
        if r.get("hidden") or not r.get("published", True):
            continue
        h = by_handle.setdefault(handle, {
            "product_title": r.get("product_title") or "",
            "ratings": [], "last_review": "",
        })
        rating = r.get("rating")
        if isinstance(rating, (int, float)):
            h["ratings"].append(rating)
        created = r.get("created_at") or ""
        if created > h["last_review"]:
            h["last_review"] = created
    return by_handle


def build_shopify_handle_map() -> dict:
    """Shopify ürünlerinden handle→stok kodu (sku) köprüsü."""
    p = DATA_DIR / "shopify_sales.json"
    if not p.exists():
        logger.warning("shopify_sales.json yok — handle eşleşmesi yapılamaz.")
        return {}
    prods = json.loads(p.read_text(encoding="utf-8")).get("products", {})
    handle_to_sku = {}
    for v in prods.values():
        url = v.get("url", "")
        if "/products/" in url:
            handle = url.split("/products/")[-1].strip("/")
            if handle and v.get("sku"):
                handle_to_sku[handle] = str(v["sku"]).strip()
    return handle_to_sku


def run() -> None:
    shop, token = _config()
    reviews = fetch_all_reviews(shop, token)
    by_handle = aggregate_by_handle(reviews)
    logger.info(f"Yorumlu ürün (handle): {len(by_handle)}")

    handle_to_sku = build_shopify_handle_map()
    logger.info(f"Shopify handle→sku köprüsü: {len(handle_to_sku)} kayıt")

    # Mevcut platform_reviews.json'a ekle (n11 verisini koru)
    existing = {}
    if OUT_FILE.exists():
        existing = json.loads(OUT_FILE.read_text(encoding="utf-8"))
    by_sc = existing.get("by_stock_code", {})

    matched, unmatched = 0, []
    for handle, agg in by_handle.items():
        sku = handle_to_sku.get(handle)
        ratings = agg["ratings"]
        if not sku:
            unmatched.append(handle)
            continue
        avg = round(sum(ratings) / len(ratings), 2) if ratings else None
        by_sc.setdefault(sku, {})["shopify"] = {
            "platform":     "shopify",
            "source":       "judgeme",
            "stock_code":   sku,
            "handle":       handle,
            "title":        agg["product_title"],
            "rating":       avg,
            "review_count": len(ratings),
            "last_review":  agg["last_review"][:10],
            "scraped_at":   datetime.now(timezone.utc).isoformat(),
        }
        matched += 1

    logger.info(f"Eşleşen: {matched} ürün | eşleşmeyen handle: {len(unmatched)}")
    if unmatched:
        logger.info(f"  Eşleşmeyen örnek: {unmatched[:5]}")

    n11_count = sum(1 for v in by_sc.values() if "n11" in v)
    sh_count  = sum(1 for v in by_sc.values() if "shopify" in v)
    out = {
        "metadata": {
            "updated_at":  datetime.now(timezone.utc).isoformat(),
            "n11_count":   n11_count,
            "shopify_count": sh_count,
            "total_skus":  len(by_sc),
        },
        "by_stock_code": by_sc,
    }
    DATA_DIR.mkdir(exist_ok=True)
    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info(f"Kaydedildi: {OUT_FILE} (n11={n11_count}, shopify={sh_count})")


if __name__ == "__main__":
    run()
