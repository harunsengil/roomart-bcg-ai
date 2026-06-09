"""Trendyol Marketplace API istemcisi (RoomArt / Supplier 362387).

Kimlik bilgileri YALNIZCA ortam değişkenlerinden okunur — koda/Git'e asla gömülmez:
  TRENDYOL_SUPPLIER_ID   (örn. 362387)
  TRENDYOL_API_KEY
  TRENDYOL_API_SECRET

Base URL: https://apigw.trendyol.com  (eski api.trendyol.com kullanımdan kalkıyor)
Auth    : Basic base64(apiKey:apiSecret)
Header  : User-Agent "<supplierId> - SelfIntegration" zorunlu (yoksa 403).

Yerel test:
  TRENDYOL_SUPPLIER_ID=... TRENDYOL_API_KEY=... TRENDYOL_API_SECRET=... \
    python backend/trendyol_api.py
"""
from __future__ import annotations

import base64
import logging
import os
import sys
import time

import requests

logger = logging.getLogger(__name__)

BASE_URL = "https://apigw.trendyol.com"

# Geçici hatalar (rate-limit / sunucu) için yeniden deneme.
RETRY_STATUSES = {429, 500, 502, 503, 504}
MAX_RETRIES = 4
BACKOFF_BASE = 1.5  # sn; üstel: 1.5, 3, 6, 12


class TrendyolAuthError(RuntimeError):
    """401/403 — kimlik/secret geçersiz veya token bayatlamış (rotasyon sonrası).
    Bunu YUTMA: pazar payının sessizce deg'e düşmesi bu hatayla AYIRT edilebilir."""


def _config() -> tuple[str, str, str]:
    supplier_id = os.environ.get("TRENDYOL_SUPPLIER_ID", "").strip()
    api_key = os.environ.get("TRENDYOL_API_KEY", "").strip()
    api_secret = os.environ.get("TRENDYOL_API_SECRET", "").strip()
    missing = [
        name
        for name, val in (
            ("TRENDYOL_SUPPLIER_ID", supplier_id),
            ("TRENDYOL_API_KEY", api_key),
            ("TRENDYOL_API_SECRET", api_secret),
        )
        if not val
    ]
    if missing:
        raise SystemExit(
            "Eksik ortam değişkeni: " + ", ".join(missing) + "\n"
            "Bunları env/GitHub Secret olarak ver; koda gömme."
        )
    return supplier_id, api_key, api_secret


def make_session() -> tuple[requests.Session, str]:
    # Token doğrudan verilirse onu kullan (l/I/0/O karışmasına karşı en güvenli yol).
    token = os.environ.get("TRENDYOL_TOKEN", "").strip()
    supplier_id = os.environ.get("TRENDYOL_SUPPLIER_ID", "").strip()
    if token:
        if not supplier_id:
            raise SystemExit("TRENDYOL_TOKEN verildi ama TRENDYOL_SUPPLIER_ID eksik.")
    else:
        supplier_id, api_key, api_secret = _config()
        token = base64.b64encode(f"{api_key}:{api_secret}".encode()).decode()
    sess = requests.Session()
    sess.headers.update(
        {
            "Authorization": f"Basic {token}",
            "User-Agent": f"{supplier_id} - SelfIntegration",
            "Content-Type": "application/json",
        }
    )
    return sess, supplier_id


def _request(sess: requests.Session, path: str, *, timeout: int = 60, **params):
    """GET + geçici-hata retry (üstel backoff) + net auth hatası.
    401/403 → TrendyolAuthError (yutulmaz). 429/5xx → MAX_RETRIES kez yeniden dener."""
    url = f"{BASE_URL}{path}"
    last_exc = None
    for attempt in range(1, MAX_RETRIES + 1):
        try:
            r = sess.get(url, params=params, timeout=timeout)
        except requests.RequestException as exc:  # ağ/timeout → retry
            last_exc = exc
            if attempt < MAX_RETRIES:
                time.sleep(BACKOFF_BASE ** attempt)
                continue
            raise
        if r.status_code in (401, 403):
            raise TrendyolAuthError(
                f"Trendyol auth reddetti (HTTP {r.status_code}) {path} — "
                "TRENDYOL_TOKEN/secret geçersiz veya bayat. Secret yenilendiyse "
                "TRENDYOL_TOKEN'ı yeni base64(key:secret) ile GÜNCELLE."
            )
        if r.status_code in RETRY_STATUSES and attempt < MAX_RETRIES:
            wait = BACKOFF_BASE ** attempt
            logger.warning(f"HTTP {r.status_code} {path} — {wait:.0f}s sonra yeniden ({attempt}/{MAX_RETRIES})")
            time.sleep(wait)
            continue
        r.raise_for_status()
        return r
    raise last_exc if last_exc else RuntimeError(f"İstek başarısız: {path}")


def _get(sess: requests.Session, path: str, **params):
    return _request(sess, path, timeout=30, **params)


# ── Sayfalı çekim ──────────────────────────────────────────────────────────────
def _paged(sess: requests.Session, path: str, page_size: int = 200, max_pages=None, **params):
    """`content`+`totalPages` döndüren uçlarda tüm sayfaları dolaş (generator)."""
    page = 0
    while True:
        r = _request(sess, path, timeout=60, **{**params, "page": page, "size": page_size})
        data = r.json()
        content = data.get("content", []) or []
        for item in content:
            yield item
        total_pages = data.get("totalPages", 1)
        page += 1
        if not content or page >= total_pages or (max_pages and page >= max_pages):
            break


def fetch_all_products(sess: requests.Session, supplier_id: str, **filters) -> list:
    """Mağazadaki tüm ürünleri çek (fiyat/stok/barkod/kategori)."""
    return list(_paged(sess, f"/integration/product/sellers/{supplier_id}/products", **filters))


def fetch_all_orders(sess: requests.Session, supplier_id: str, **filters) -> list:
    """Siparişleri çek. İsteğe bağlı: status, startDate/endDate (epoch ms; aralık ≤ 2 hafta).

    Müşteri PII'si sipariş üst seviyesindedir; satış agregasyonu yalnız `lines`'ı kullanmalı.
    """
    return list(_paged(sess, f"/integration/order/sellers/{supplier_id}/orders", **filters))


def fetch_orders_lifetime(
    sess: requests.Session,
    supplier_id: str,
    *,
    window_days: int = 14,
    max_days: int = 730,
    empty_stop: int = 3,
    now_ms: int | None = None,
    **filters,
) -> tuple[list, dict]:
    """Ömür-boyu siparişleri çek: şimdiden geriye `window_days`'lik pencerelerle ilerle.

    Trendyol orders ucu tek istekte ≤ 2 haftalık aralık kabul eder; daha geriye gitmek için
    pencereleri elle kaydırmak gerekir. Durma koşulu (ikisinden biri):
      • ardışık `empty_stop` boş pencere (mağaza geçmişinin başına ulaşıldı), VEYA
      • `max_days` tavanı (CI maliyet sınırı — aşırı çağrıyı engeller).

    `orderDate` filtresi `startDate`/`endDate` (epoch ms) iledir. Aynı sipariş bitişik
    pencerelerin sınırında iki kez gelebileceğinden `id` ile tekilleştirilir.
    Döndürür: (orders, stats) — stats: {windows, oldest_order_ms, max_days, hit_cap}.
    """
    if now_ms is None:
        now_ms = int(time.time() * 1000)
    win_ms = window_days * 24 * 3600 * 1000
    floor_ms = now_ms - max_days * 24 * 3600 * 1000

    by_id: dict = {}
    oldest = None
    windows = 0
    consecutive_empty = 0
    end = now_ms
    hit_cap = False

    while end > floor_ms:
        start = max(end - win_ms, floor_ms)
        chunk = list(
            _paged(
                sess,
                f"/integration/order/sellers/{supplier_id}/orders",
                startDate=start,
                endDate=end,
                **filters,
            )
        )
        windows += 1
        if chunk:
            consecutive_empty = 0
            for o in chunk:
                oid = o.get("id")
                by_id[oid if oid is not None else len(by_id)] = o
                od = o.get("orderDate")
                if od and (oldest is None or od < oldest):
                    oldest = od
        else:
            consecutive_empty += 1
            if consecutive_empty >= empty_stop:
                break
        if start <= floor_ms:
            hit_cap = True
            break
        end = start

    stats = {
        "windows": windows,
        "oldest_order_ms": oldest,
        "max_days": max_days,
        "hit_cap": hit_cap,
    }
    return list(by_id.values()), stats


def test_connection() -> None:
    sess, sid = make_session()

    checks = [
        ("Ürünler (V2)", f"/integration/product/sellers/{sid}/products", {"size": 5}),
        ("Siparişler", f"/integration/order/sellers/{sid}/orders", {"size": 5}),
        ("Markalar", "/integration/product/brands", {"size": 3}),
        ("Kategoriler", "/integration/product/product-categories", {}),
    ]

    print(f"== Trendyol API testi — Supplier {sid} ==\n")
    for label, path, params in checks:
        try:
            r = _get(sess, path, **params)
        except TrendyolAuthError as exc:
            print(f"[AUTH ] {label:14s} → {exc}")
            continue
        except requests.RequestException as exc:  # ağ hatası
            print(f"[HATA ] {label:14s} → {exc}")
            continue

        if r.status_code != 200:
            body = r.text[:200].replace("\n", " ")
            print(f"[{r.status_code:>4}] {label:14s} → {body}")
            continue

        data = r.json()
        # Ortak şekiller: {"content": [...], "totalElements": N} veya {"content/categories": [...]}
        items = data.get("content")
        if items is None:
            items = data.get("categories") or data.get("brands") or []
        total = data.get("totalElements", len(items) if isinstance(items, list) else "?")
        sample_keys = sorted(items[0].keys())[:12] if items and isinstance(items[0], dict) else []
        print(f"[ 200] {label:14s} → toplam={total}, örnek_alanlar={sample_keys}")

    print("\nBitti. 401/403 → kimlik/secret veya User-Agent sorunu; 556/429 → rate limit.")


if __name__ == "__main__":
    try:
        test_connection()
    except SystemExit as exc:
        print(exc, file=sys.stderr)
        raise
