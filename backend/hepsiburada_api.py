"""Hepsiburada Marketplace API istemcisi (RoomArt satıcı hesabı).

Kimlik bilgileri YALNIZCA ortam değişkenlerinden okunur:
  HB_MERCHANT_ID   — Hepsiburada Satıcı ID
  HB_USERNAME      — API kullanıcı adı
  HB_PASSWORD      — API şifresi

Auth: Basic base64(username:password)

Yerel test:
  source backend/.env.hb.local && python backend/hepsiburada_api.py
"""
from __future__ import annotations

import base64
import logging
import os
import time
from datetime import datetime, timezone, timedelta

import requests

logger = logging.getLogger(__name__)

BASE_LISTING = "https://listing-external.hepsiburada.com"
BASE_ORDER   = "https://merchant-order-info.hepsiburada.com"

RETRY_STATUSES = {429, 500, 502, 503, 504}
MAX_RETRIES    = 4
BACKOFF_BASE   = 1.5


class HBAuthError(RuntimeError):
    """401/403 — kimlik/şifre geçersiz veya hesap askıya alınmış."""


def _config() -> tuple[str, str, str]:
    mid  = os.environ.get("HB_MERCHANT_ID", "").strip()
    user = os.environ.get("HB_USERNAME", "").strip()
    pwd  = os.environ.get("HB_PASSWORD", "").strip()
    missing = [n for n, v in [("HB_MERCHANT_ID", mid), ("HB_USERNAME", user), ("HB_PASSWORD", pwd)] if not v]
    if missing:
        raise SystemExit("Eksik ortam değişkeni: " + ", ".join(missing))
    return mid, user, pwd


def make_session() -> tuple[requests.Session, str]:
    mid, user, pwd = _config()
    token = base64.b64encode(f"{user}:{pwd}".encode()).decode()
    sess = requests.Session()
    sess.headers.update({
        "Authorization": f"Basic {token}",
        "Content-Type":  "application/json",
        "Accept":        "application/json",
    })
    return sess, mid


def _get(sess: requests.Session, url: str, params: dict | None = None) -> dict:
    for attempt in range(MAX_RETRIES + 1):
        try:
            r = sess.get(url, params=params, timeout=30)
            if r.status_code in (401, 403):
                raise HBAuthError(f"HB auth hatası {r.status_code}: {r.text[:200]}")
            if r.status_code in RETRY_STATUSES and attempt < MAX_RETRIES:
                time.sleep(BACKOFF_BASE ** attempt)
                continue
            r.raise_for_status()
            return r.json()
        except HBAuthError:
            raise
        except Exception as e:
            if attempt < MAX_RETRIES:
                time.sleep(BACKOFF_BASE ** attempt)
                continue
            raise RuntimeError(f"HB API isteği başarısız: {url} → {e}") from e
    return {}


# ── Ürün kataloğu ─────────────────────────────────────────────────────────────

def fetch_listings(sess: requests.Session, merchant_id: str) -> list[dict]:
    """Tüm aktif/pasif listeleri çek (fiyat, stok, barkod, SKU, durum)."""
    listings, offset, limit = [], 0, 100
    logger.info("HB ürün kataloğu çekiliyor...")
    while True:
        data = _get(sess, f"{BASE_LISTING}/listings/merchantid/{merchant_id}",
                    params={"offset": offset, "limit": limit})
        items = data.get("listings") or data.get("data") or []
        if not items:
            break
        listings.extend(items)
        logger.info(f"  → {len(listings)} ürün")
        if len(items) < limit:
            break
        offset += limit
        time.sleep(0.3)
    logger.info(f"HB katalog toplam: {len(listings)} ürün")
    return listings


# ── Siparişler ────────────────────────────────────────────────────────────────

def fetch_orders(sess: requests.Session, merchant_id: str,
                 days_back: int = 90) -> list[dict]:
    """Son N günlük siparişleri çek (PII'siz agregat için satır verileri)."""
    end   = datetime.now(timezone.utc)
    begin = end - timedelta(days=days_back)
    fmt   = "%Y-%m-%dT%H:%M:%SZ"

    orders, offset, limit = [], 0, 100
    logger.info(f"HB siparişler çekiliyor ({begin.strftime('%Y-%m-%d')} → {end.strftime('%Y-%m-%d')})...")
    while True:
        data = _get(sess, f"{BASE_ORDER}/order/api/orders/merchantid/{merchant_id}",
                    params={
                        "beginDate": begin.strftime(fmt),
                        "endDate":   end.strftime(fmt),
                        "offset":    offset,
                        "limit":     limit,
                    })
        items = data.get("data") or data.get("orders") or []
        if not items:
            break
        orders.extend(items)
        logger.info(f"  → {len(orders)} sipariş")
        total = data.get("totalCount") or data.get("total") or 0
        if len(orders) >= total or len(items) < limit:
            break
        offset += limit
        time.sleep(0.3)
    logger.info(f"HB sipariş toplam: {len(orders)}")
    return orders


# ── Doğrulama testi ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import json
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    sess, mid = make_session()
    logger.info(f"Merchant ID: {mid}")

    listings = fetch_listings(sess, mid)
    logger.info(f"İlk ürün örneği: {json.dumps(listings[0], ensure_ascii=False, indent=2) if listings else 'YOK'}")

    orders = fetch_orders(sess, mid, days_back=30)
    logger.info(f"İlk sipariş örneği: {json.dumps(orders[0], ensure_ascii=False, indent=2) if orders else 'YOK'}")
