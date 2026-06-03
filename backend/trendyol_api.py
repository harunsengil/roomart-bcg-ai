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
import os
import sys

import requests

BASE_URL = "https://apigw.trendyol.com"


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


def _get(sess: requests.Session, path: str, **params):
    url = f"{BASE_URL}{path}"
    r = sess.get(url, params=params, timeout=30)
    return r


# ── Sayfalı çekim ──────────────────────────────────────────────────────────────
def _paged(sess: requests.Session, path: str, page_size: int = 200, max_pages=None, **params):
    """`content`+`totalPages` döndüren uçlarda tüm sayfaları dolaş (generator)."""
    page = 0
    while True:
        r = sess.get(
            f"{BASE_URL}{path}",
            params={**params, "page": page, "size": page_size},
            timeout=60,
        )
        r.raise_for_status()
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
