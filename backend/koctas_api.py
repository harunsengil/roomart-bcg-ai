"""Koçtaş Marketplace API istemcisi (RoomArt satıcı hesabı, shop 2262).

Koçtaş **Mirakl** platformu üzerinde. Seller (Shop) API:
  Base:  https://koctas.mirakl.net
  Auth:  Authorization: {API_KEY} header (Mirakl front API — Bearer YOK, ham key).
  Teklifler (katalog+fiyat):  GET /api/offers   (OF11) — shop_sku = bizim STOK KODU
  Siparişler (satış):         GET /api/orders   (OR11)

Kimlik YALNIZCA ortamdan:
  KOCTAS_API_KEY   — satıcı paneli → Profil → API (Authorization header)
  KOCTAS_USERNAME  — (varsa) panel/entegrasyon kullanıcı adı
  KOCTAS_PASSWORD  — (varsa) şifre
  (Mirakl front API genelde yalnız API_KEY ister; username/password gerekirse eklenir.)

Yerel test:
  source backend/.env.koctas.local && python3 backend/koctas_api.py
"""
from __future__ import annotations

import logging
import os
import time
from datetime import datetime, timezone, timedelta

import requests

logger = logging.getLogger(__name__)

BASE_URL   = "https://koctas.mirakl.net"
OFFERS_URL = f"{BASE_URL}/api/offers"
ORDERS_URL = f"{BASE_URL}/api/orders"

RETRY_STATUSES = {429, 500, 502, 503, 504}
MAX_RETRIES    = 3
BACKOFF_BASE   = 2.0


class KoctasAuthError(RuntimeError):
    """401/403 — API key geçersiz veya hesap API erişimine kapalı."""


def _config() -> tuple[str, str, str]:
    key  = os.environ.get("KOCTAS_API_KEY", "").strip()
    user = os.environ.get("KOCTAS_USERNAME", "").strip()
    pwd  = os.environ.get("KOCTAS_PASSWORD", "").strip()
    if not key:
        raise SystemExit("Eksik ortam değişkeni: KOCTAS_API_KEY")
    return key, user, pwd


def _headers(key: str) -> dict:
    # Mirakl front API: API key doğrudan Authorization header'ında (Bearer YOK).
    return {"Authorization": key, "Accept": "application/json"}


def _get(url: str, headers: dict, params: dict) -> dict:
    for attempt in range(MAX_RETRIES + 1):
        try:
            r = requests.get(url, headers=headers, params=params, timeout=40)
            if r.status_code in (401, 403):
                raise KoctasAuthError(f"Koçtaş auth hatası {r.status_code}: {r.text[:200]}")
            if r.status_code in RETRY_STATUSES and attempt < MAX_RETRIES:
                time.sleep(BACKOFF_BASE ** attempt)
                continue
            r.raise_for_status()
            return r.json()
        except KoctasAuthError:
            raise
        except Exception as e:
            if attempt < MAX_RETRIES:
                time.sleep(BACKOFF_BASE ** attempt)
                continue
            raise RuntimeError(f"Koçtaş isteği başarısız: {url} → {e}") from e
    return {}


# ── Teklifler (katalog + fiyat) ────────────────────────────────────────────────
def fetch_offers(key: str) -> list[dict]:
    """Tüm teklifleri HAM Mirakl offer olarak sayfalayarak çek (offset/max). Eşleme/mapping
    koctas_sync'te yapılır (raw alanlar: shop_sku, product_sku, product_references[EAN],
    product_title, active, applicable_pricing, price, quantity)."""
    headers = _headers(key)
    offers, offset, limit = [], 0, 100
    logger.info("Koçtaş teklifleri (offers) çekiliyor...")
    while True:
        data = _get(OFFERS_URL, headers, {"max": limit, "offset": offset})
        items = data.get("offers") or data.get("offer") or []
        offers.extend(items)
        total = data.get("total_count", data.get("total", 0))
        logger.info(f"  offset {offset}: {len(items)} teklif ({len(offers)} toplam / {total})")
        if not items or len(offers) >= (total or 0) or len(items) < limit:
            break
        offset += limit
        time.sleep(0.3)
    logger.info(f"Koçtaş teklif toplam: {len(offers)}")
    return offers


# ── Siparişler ─────────────────────────────────────────────────────────────────
def fetch_orders(key: str, days_back: int = 90) -> list[dict]:
    """Son N günlük siparişleri çek (Mirakl OR11). PII satırda ayıklanır."""
    headers = _headers(key)
    start = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%dT%H:%M:%SZ")
    orders, offset, limit = [], 0, 100
    logger.info(f"Koçtaş siparişleri çekiliyor (son {days_back} gün)...")
    while True:
        data = _get(ORDERS_URL, headers, {"max": limit, "offset": offset, "start_date": start})
        items = data.get("orders") or []
        for o in items:
            lines = o.get("order_lines") or o.get("orderLines") or []
            orders.append({
                "order_id":   str(o.get("order_id") or ""),
                "created":    o.get("created_date") or o.get("date_created") or "",
                "state":      o.get("order_state") or o.get("state") or "",
                "lines": [{
                    "stock_code":   str(ln.get("offer_sku") or ln.get("shop_sku") or ln.get("product_sku") or "").strip(),
                    "product_name": ln.get("product_title") or ln.get("product_name") or "",
                    "quantity":     ln.get("quantity") or 0,
                    "unit_price":   (ln.get("price_unit") or ln.get("price") or 0),
                    "status":       ln.get("order_line_state") or ln.get("status") or "",
                } for ln in lines],
            })
        total = data.get("total_count", data.get("total", 0))
        logger.info(f"  offset {offset}: {len(items)} sipariş ({len(orders)} toplam / {total})")
        if not items or len(orders) >= (total or 0) or len(items) < limit:
            break
        offset += limit
        time.sleep(0.3)
    logger.info(f"Koçtaş sipariş toplam: {len(orders)}")
    return orders


# ── Doğrulama testi (ham yanıt döker → gerçek şemayı görürüz) ──────────────────
if __name__ == "__main__":
    import json
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    key, user, pwd = _config()
    logger.info(f"Koçtaş Mirakl API testi (base {BASE_URL})...")

    # HAM ilk sayfa — gerçek alan adlarını görmek için
    raw = _get(OFFERS_URL, _headers(key), {"max": 3, "offset": 0})
    logger.info("=== HAM /api/offers (ilk sayfa, 3 kayıt) ===")
    print(json.dumps(raw, ensure_ascii=False, indent=2)[:3000])

    offers = fetch_offers(key)
    if offers:
        logger.info(f"İlk teklif (eşlenmiş): {json.dumps(offers[0], ensure_ascii=False)}")
    orders = fetch_orders(key, days_back=90)
    if orders and orders[0]["lines"]:
        logger.info(f"İlk sipariş satırı: {json.dumps(orders[0]['lines'][0], ensure_ascii=False)}")
