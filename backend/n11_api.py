"""n11 Marketplace REST API istemcisi (RoomArt satıcı hesabı).

n11 ESKİ SOAP API'sini (api.n11.com/ws) kapattı → YENİ REST API kullanılır.
Kimlik: appkey + appsecret HTTP HEADER olarak (Authorization YOK).

Kimlik bilgileri YALNIZCA ortam değişkenlerinden okunur:
  N11_APP_KEY     — n11 Satıcı Paneli → Hesabım → API İşlemleri → App Key
  N11_APP_SECRET  — App Secret

Endpoint'ler:
  Ürünler:    GET  https://api.n11.com/ms/product-query        (Spring sayfalama)
  Siparişler: GET  https://api.n11.com/rest/delivery/v1/shipmentPackages  (page/totalPages)

Yerel test:
  source backend/.env.n11.local && python3 backend/n11_api.py
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone, timedelta

import requests

logger = logging.getLogger(__name__)

BASE_URL    = "https://api.n11.com"
PRODUCT_URL = f"{BASE_URL}/ms/product-query"
ORDER_URL   = f"{BASE_URL}/rest/delivery/v1/shipmentPackages"

RETRY_STATUSES = {429, 500, 502, 503, 504}
MAX_RETRIES    = 3
BACKOFF_BASE   = 2.0


class N11AuthError(RuntimeError):
    """appkey/appsecret geçersiz veya hesap API erişimine kapalı."""


def _config() -> tuple[str, str]:
    key    = os.environ.get("N11_APP_KEY", "").strip()
    secret = os.environ.get("N11_APP_SECRET", "").strip()
    missing = [n for n, v in [("N11_APP_KEY", key), ("N11_APP_SECRET", secret)] if not v]
    if missing:
        raise SystemExit("Eksik ortam değişkeni: " + ", ".join(missing))
    return key, secret


def _headers(key: str, secret: str) -> dict:
    # DİKKAT: header adları küçük harf 'appkey'/'appsecret'; Authorization YOK.
    return {"appkey": key, "appsecret": secret, "Content-Type": "application/json"}


def _get(url: str, headers: dict, params: dict) -> dict:
    for attempt in range(MAX_RETRIES + 1):
        try:
            r = requests.get(url, headers=headers, params=params, timeout=40)
            if r.status_code in (401, 403):
                raise N11AuthError(f"n11 auth hatası {r.status_code}: {r.text[:200]}")
            if r.status_code in RETRY_STATUSES and attempt < MAX_RETRIES:
                time.sleep(BACKOFF_BASE ** attempt)
                continue
            r.raise_for_status()
            return r.json()
        except N11AuthError:
            raise
        except Exception as e:
            if attempt < MAX_RETRIES:
                time.sleep(BACKOFF_BASE ** attempt)
                continue
            raise RuntimeError(f"n11 isteği başarısız: {url} → {e}") from e
    return {}


# ── Ürün kataloğu ─────────────────────────────────────────────────────────────
def fetch_products(key: str, secret: str) -> list[dict]:
    """Tüm ürünleri sayfalayarak çek (Spring sayfalama: number/totalPages/last)."""
    headers = _headers(key, secret)
    products, page, size = [], 0, 100
    logger.info("n11 ürün kataloğu çekiliyor (REST)...")
    while True:
        data = _get(PRODUCT_URL, headers, {"page": page, "size": size})
        items = data.get("content", [])
        for it in items:
            imgs = it.get("imageUrls") or []
            products.append({
                "product_id":   str(it.get("n11ProductId") or ""),
                "stock_code":   str(it.get("stockCode") or "").strip(),
                "barcode":      str(it.get("barcode") or "").strip(),
                "title":        it.get("title") or "",
                "price":        it.get("salePrice") or 0.0,
                "list_price":   it.get("listPrice"),
                "stock":        it.get("quantity"),
                "status":       it.get("status") or it.get("saleStatus") or "",
                "commission":   it.get("commissionRate"),
                "image":        imgs[0] if imgs else "",
                "url":          f"https://www.n11.com/urun/-{it.get('n11ProductId')}",
            })
        logger.info(f"  sayfa {page}: {len(items)} ürün ({len(products)} toplam)")
        if data.get("last") or not items or page + 1 >= data.get("totalPages", 1):
            break
        page += 1
        time.sleep(0.3)
    logger.info(f"n11 katalog toplam: {len(products)} ürün")
    return products


# ── Siparişler ────────────────────────────────────────────────────────────────
def _created_ms(pkg: dict) -> int:
    """packageHistories içindeki 'Created' kaydından sipariş epoch ms'i."""
    for h in pkg.get("packageHistories") or []:
        if h.get("status") == "Created" and h.get("createdDate"):
            return int(h["createdDate"])
    # yedek: ilk history
    hist = pkg.get("packageHistories") or []
    return int(hist[0].get("createdDate")) if hist and hist[0].get("createdDate") else 0


def fetch_orders(key: str, secret: str, days_back: int = 90) -> list[dict]:
    """shipmentPackages sayfalarını çek, days_back'e göre süz. PII satırda AYIKLANIR."""
    headers = _headers(key, secret)
    cutoff  = (datetime.now(timezone.utc) - timedelta(days=days_back)).timestamp() * 1000
    orders, page, size = [], 0, 100
    logger.info(f"n11 siparişler çekiliyor (son {days_back} gün)...")
    while True:
        data = _get(ORDER_URL, headers, {"page": page, "size": size})
        items = data.get("content", [])
        if not items:
            break
        stop = False
        for pkg in items:
            od = _created_ms(pkg)
            if od and od < cutoff:
                stop = True   # sayfalar tarih azalanına yakın; eski görülünce dur
                continue
            orders.append({
                "order_id":   str(pkg.get("id") or ""),
                "order_no":   str(pkg.get("orderNumber") or ""),
                "order_ms":   od,
                "status":     pkg.get("shipmentPackageStatus") or "",
                "lines": [{
                    "stock_code":   str(ln.get("stockCode") or "").strip(),
                    "barcode":      str(ln.get("barcode") or "").strip(),
                    "product_name": ln.get("productName") or "",
                    "quantity":     ln.get("quantity") or 0,
                    # net satış fiyatı: satıcı indirimli fiyat > price
                    "unit_price":   ln.get("sellerDiscountedPrice") or ln.get("price") or 0.0,
                    "status":       ln.get("orderItemLineItemStatusName") or "",
                } for ln in (pkg.get("lines") or [])],
            })
        total_pages = data.get("totalPages", 1)
        logger.info(f"  sayfa {page}: {len(items)} paket ({len(orders)} toplam)")
        if stop or page + 1 >= total_pages:
            break
        page += 1
        time.sleep(0.3)
    logger.info(f"n11 sipariş toplam: {len(orders)}")
    return orders


# ── Doğrulama testi ───────────────────────────────────────────────────────────
if __name__ == "__main__":
    import json
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    key, secret = _config()
    logger.info("n11 REST API bağlantı testi...")

    prods = fetch_products(key, secret)
    if prods:
        logger.info(f"İlk ürün: {json.dumps(prods[0], ensure_ascii=False)[:200]}")

    orders = fetch_orders(key, secret, days_back=90)
    if orders:
        logger.info(f"İlk sipariş satırı: {json.dumps(orders[0]['lines'][0], ensure_ascii=False)}")
    else:
        logger.warning("Sipariş bulunamadı.")
