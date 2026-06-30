"""Shopify Admin API istemcisi (roomartstore.com.tr).

Kimlik bilgileri YALNIZCA ortam değişkenlerinden okunur:
  SHOPIFY_STORE_URL    — örn. roomartstore.myshopify.com (veya roomartstore.com.tr)
  SHOPIFY_ADMIN_TOKEN  — Admin API access token (shpat_...)

REST Admin API v2024-01 kullanılır.

Yerel test:
  source backend/.env.shopify.local && python3 backend/shopify_api.py
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone, timedelta

import requests

logger = logging.getLogger(__name__)

API_VERSION = "2024-01"
RETRY_STATUSES = {429, 500, 502, 503, 504}
MAX_RETRIES    = 4
BACKOFF_BASE   = 1.5


class ShopifyAuthError(RuntimeError):
    """401/403 — token geçersiz veya yetersiz scope."""


def _config() -> tuple[str, str]:
    store = os.environ.get("SHOPIFY_STORE_URL", "").strip().rstrip("/")
    token = os.environ.get("SHOPIFY_ADMIN_TOKEN", "").strip()
    missing = [n for n, v in [("SHOPIFY_STORE_URL", store), ("SHOPIFY_ADMIN_TOKEN", token)] if not v]
    if missing:
        raise SystemExit("Eksik ortam değişkeni: " + ", ".join(missing))
    # myshopify.com veya özel domain — her ikisi de çalışır
    if not store.startswith("http"):
        store = f"https://{store}"
    return store, token


def make_session(token: str) -> requests.Session:
    sess = requests.Session()
    sess.headers.update({
        "X-Shopify-Access-Token": token,
        "Content-Type": "application/json",
    })
    return sess


def _get(sess: requests.Session, url: str, params: dict | None = None) -> dict:
    for attempt in range(MAX_RETRIES + 1):
        try:
            r = sess.get(url, params=params, timeout=30)
            if r.status_code in (401, 403):
                raise ShopifyAuthError(f"Shopify auth hatası {r.status_code}: {r.text[:200]}")
            # Rate limit: 429 + Retry-After header
            if r.status_code == 429:
                wait = float(r.headers.get("Retry-After", 2))
                logger.warning(f"Rate limit — {wait}s bekleniyor")
                time.sleep(wait)
                continue
            if r.status_code in RETRY_STATUSES and attempt < MAX_RETRIES:
                time.sleep(BACKOFF_BASE ** attempt)
                continue
            r.raise_for_status()
            return r.json()
        except ShopifyAuthError:
            raise
        except Exception as e:
            if attempt < MAX_RETRIES:
                time.sleep(BACKOFF_BASE ** attempt)
                continue
            raise RuntimeError(f"Shopify isteği başarısız: {url} → {e}") from e
    return {}


def _base(store: str) -> str:
    return f"{store}/admin/api/{API_VERSION}"


# ── Ürün kataloğu ─────────────────────────────────────────────────────────────

def fetch_products(sess: requests.Session, store: str) -> list[dict]:
    """Tüm ürünleri ve varyantlarını çek (barkod/EAN dahil)."""
    products, page_info = [], None
    base = _base(store)
    logger.info("Shopify ürün kataloğu çekiliyor...")

    while True:
        params = {"limit": 250, "fields": "id,title,status,variants,images"}
        if page_info:
            params = {"limit": 250, "page_info": page_info}

        data = _get(sess, f"{base}/products.json", params)
        items = data.get("products", [])
        if not items:
            break

        for prod in items:
            img_url = (prod.get("images") or [{}])[0].get("src", "")
            for var in prod.get("variants") or []:
                # Her varyant ayrı SKU/barkod taşır
                price_raw = var.get("price") or "0"
                try:
                    price = float(str(price_raw).replace(",", "."))
                except ValueError:
                    price = 0.0
                compare_raw = var.get("compare_at_price")
                try:
                    compare_price = float(str(compare_raw).replace(",", ".")) if compare_raw else None
                except ValueError:
                    compare_price = None

                products.append({
                    "product_id":  str(prod["id"]),
                    "variant_id":  str(var["id"]),
                    "title":       prod.get("title", ""),
                    "variant":     var.get("title", ""),       # renk/beden
                    "sku":         var.get("sku") or "",
                    "barcode":     var.get("barcode") or "",   # EAN/GTIN
                    "price":       price,
                    "compare_at_price": compare_price,         # liste fiyatı (üstü çizili)
                    "stock":       var.get("inventory_quantity"),
                    "status":      prod.get("status", ""),     # active/draft/archived
                    "image":       img_url,
                    "url":         f"{store}/products/{prod.get('handle', '')}",
                })

        logger.info(f"  {len(products)} varyant ({len(items)} ürün bu sayfa)")

        # Cursor tabanlı sayfalama (Link header)
        link = sess.get(f"{base}/products.json",
                        params={"limit": 1}).headers.get("Link", "") if False else ""
        # Shopify cursor: response header'dan "page_info" parse et
        import re
        last_resp_headers = getattr(sess, "_last_headers", {})
        # Gerçek sayfalama: doğrudan header'dan okuruz
        break  # ilk çağrıda tüm ürünler 250 limit ile gelir; büyük katalog için cursor ekle

    logger.info(f"Shopify katalog toplam: {len(products)} varyant")
    return products


def fetch_products_paginated(sess: requests.Session, store: str) -> list[dict]:
    """Büyük katalog için cursor-tabanlı sayfalama."""
    products, url = [], f"{_base(store)}/products.json"
    logger.info("Shopify ürün kataloğu çekiliyor (sayfalı)...")

    params = {"limit": 250, "fields": "id,title,status,variants,images"}
    while url:
        r = sess.get(url, params=params, timeout=30)
        if r.status_code == 429:
            time.sleep(float(r.headers.get("Retry-After", 2)))
            continue
        r.raise_for_status()
        data = r.json()

        for prod in data.get("products", []):
            img_url = (prod.get("images") or [{}])[0].get("src", "")
            for var in prod.get("variants") or []:
                try:   price = float(var.get("price") or 0)
                except ValueError: price = 0.0
                try:   compare_price = float(var.get("compare_at_price") or 0) or None
                except ValueError: compare_price = None
                products.append({
                    "product_id":       str(prod["id"]),
                    "variant_id":       str(var["id"]),
                    "title":            prod.get("title", ""),
                    "variant":          var.get("title", ""),
                    "sku":              var.get("sku") or "",
                    "barcode":          var.get("barcode") or "",
                    "price":            price,
                    "compare_at_price": compare_price,
                    "stock":            var.get("inventory_quantity"),
                    "status":           prod.get("status", ""),
                    "image":            img_url,
                    "url":              f"{store}/products/{prod.get('handle', '')}",
                })

        # Cursor: Link header → <url>; rel="next"
        link_header = r.headers.get("Link", "")
        import re
        nxt = re.search(r'<([^>]+)>;\s*rel="next"', link_header)
        url    = nxt.group(1) if nxt else None
        params = {}  # cursor URL tüm parametreleri taşıyor
        logger.info(f"  {len(products)} varyant (devam: {'evet' if url else 'hayır'})")
        time.sleep(0.2)

    logger.info(f"Shopify toplam: {len(products)} varyant")
    return products


# ── Siparişler ────────────────────────────────────────────────────────────────

def fetch_orders(sess: requests.Session, store: str, days_back: int = 90) -> list[dict]:
    """Son N günlük tüm siparişleri çek (PII içerir — sync'te ayıklanır)."""
    begin = (datetime.now(timezone.utc) - timedelta(days=days_back)).isoformat()
    orders, url = [], f"{_base(store)}/orders.json"
    params = {
        "limit":        250,
        "status":       "any",
        "created_at_min": begin,
        "fields":       "id,created_at,financial_status,fulfillment_status,line_items,total_price",
    }
    logger.info(f"Shopify siparişler çekiliyor (son {days_back} gün)...")

    while url:
        r = sess.get(url, params=params, timeout=30)
        if r.status_code == 429:
            time.sleep(float(r.headers.get("Retry-After", 2)))
            continue
        r.raise_for_status()
        data  = r.json()
        items = data.get("orders", [])
        orders.extend(items)
        logger.info(f"  {len(orders)} sipariş")

        import re
        link_header = r.headers.get("Link", "")
        nxt    = re.search(r'<([^>]+)>;\s*rel="next"', link_header)
        url    = nxt.group(1) if nxt else None
        params = {}
        time.sleep(0.2)

    logger.info(f"Shopify sipariş toplam: {len(orders)}")
    return orders


# ── Doğrulama testi ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import json
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    store, token = _config()
    sess = make_session(token)
    logger.info(f"Shopify bağlantı testi → {store}")

    products = fetch_products_paginated(sess, store)
    if products:
        logger.info(f"İlk varyant örneği:\n{json.dumps(products[0], ensure_ascii=False, indent=2)}")
    else:
        logger.warning("Ürün bulunamadı — store URL ve token scope'larını kontrol edin.")

    orders = fetch_orders(sess, store, days_back=30)
    if orders:
        # PII olmayan alanlar göster
        o = orders[0]
        logger.info(f"İlk sipariş: id={o.get('id')} tarih={o.get('created_at')} "
                    f"durum={o.get('financial_status')} toplam={o.get('total_price')}")
        if o.get("line_items"):
            logger.info(f"  İlk satır: {json.dumps(o['line_items'][0], ensure_ascii=False, indent=2)}")
    else:
        logger.warning("Sipariş bulunamadı.")
