"""Shopify senkronu — ürün kataloğu + sipariş agregası → data/shopify_sales.json

Diğer platform sync modülleriyle aynı yapı.
Çıktı PII'sizdir. data/shopify_sales.json gitignored.

Yerel çalıştırma (repo kökünden):
  source backend/.env.shopify.local && python3 backend/shopify_sync.py
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

import shopify_api as sh

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
OUT_FILE = DATA_DIR / "shopify_sales.json"

MOMENTUM_WINDOW_DAYS = 7
SERIES_WEEKS         = 13

# Shopify finansal durum: iade/iptal sayılmayanlar
EXCLUDED_FINANCIAL = {"refunded", "partially_refunded", "voided"}
EXCLUDED_FULFILLMENT = set()   # "cancelled" fulfillment satırı zaten refund ile işaretlenir


def _categorize(name: str) -> str:
    try:
        from analyzer import categorize
        return categorize(name)
    except Exception:
        return "Diğer"


def aggregate_products(variants: list) -> dict:
    """Varyant listesini barkod (EAN) → {fiyat, sku, url, ...} tablosuna indir.
    Barkod yoksa SKU anahtarı kullanılır (ileride registry ile birleştirilir)."""
    table = {}
    for v in variants:
        barcode = str(v.get("barcode") or "").strip()
        sku     = str(v.get("sku") or "").strip()
        key     = barcode or sku
        if not key or v.get("status") == "archived":
            continue
        # compare_at_price > price → liste fiyatı (Shopify standart indirim gösterimi)
        price        = v.get("price") or 0.0
        compare      = v.get("compare_at_price")
        list_price   = compare if (compare and compare > price) else None
        discount_pct = round(100 * (1 - price / list_price)) if list_price else None

        table[key] = {
            "product_id":  v.get("product_id"),
            "variant_id":  v.get("variant_id"),
            "sku":         sku,
            "barcode":     barcode,
            "name":        v.get("title") or sku,
            "variant":     v.get("variant") or "",
            "category":    _categorize(v.get("title") or ""),
            "price":       price,
            "list_price":  list_price,
            "discount":    discount_pct,
            "status":      v.get("status") or "",
            "image":       v.get("image") or "",
            "url":         v.get("url") or "",
        }
    return table


def aggregate_sales(orders: list, product_table: dict) -> tuple[dict, dict]:
    """PII'siz sipariş satırlarından ürün + kategori bazında agregat üret."""
    now      = datetime.now(timezone.utc)
    now_ms   = now.timestamp() * 1000
    c_recent = (now - timedelta(days=MOMENTUM_WINDOW_DAYS)).timestamp() * 1000
    c_prior  = (now - timedelta(days=2 * MOMENTUM_WINDOW_DAYS)).timestamp() * 1000
    week_ms  = 7 * 24 * 3600 * 1000

    by_product, by_category = {}, {}

    for order in orders:
        fin_status = (order.get("financial_status") or "").lower()
        is_order_net = fin_status not in EXCLUDED_FINANCIAL

        od_raw = order.get("created_at") or ""
        try:
            od = datetime.fromisoformat(od_raw.replace("Z", "+00:00")).timestamp() * 1000
        except Exception:
            od = 0

        for ln in order.get("line_items") or []:
            sku     = str(ln.get("sku") or "").strip()
            name    = ln.get("name") or ln.get("title") or sku
            qty     = int(ln.get("quantity") or 0)
            price   = float(ln.get("price") or 0)
            amount  = qty * price
            is_net  = is_order_net  # Shopify'da satır bazı iptal varsa refund_line_items'ta

            prod    = product_table.get(sku, {})
            barcode = prod.get("barcode") or sku
            cat     = prod.get("category") or _categorize(name)
            key     = barcode or sku or "?"

            win = "recent" if od >= c_recent else ("prior" if od >= c_prior else None)

            bp = by_product.setdefault(key, {
                "name": name, "barcode": barcode, "sku": sku, "category": cat,
                "gross_units": 0, "gross_amount": 0.0,
                "net_units": 0,   "net_amount": 0.0,
                "units_recent": 0, "units_prior": 0,
                "risk_units": 0,
                "_series": [0] * SERIES_WEEKS,
            })
            bp["gross_units"]  += qty
            bp["gross_amount"] += amount
            if not is_net:
                bp["risk_units"] += qty
            else:
                bp["net_units"]   += qty
                bp["net_amount"]  += amount
                if win == "recent": bp["units_recent"] += qty
                elif win == "prior": bp["units_prior"]  += qty
                if od:
                    widx = int((now_ms - od) // week_ms)
                    if 0 <= widx < SERIES_WEEKS:
                        bp["_series"][widx] += qty

            bc = by_category.setdefault(cat, {
                "net_units": 0, "net_amount": 0.0,
                "gross_units": 0, "gross_amount": 0.0,
            })
            bc["gross_units"] += qty
            if is_net:
                bc["net_units"]   += qty
                bc["net_amount"]  += amount

    for bp in by_product.values():
        series = list(reversed(bp.pop("_series")))
        recent, prior = bp["units_recent"], bp["units_prior"]
        if recent == 0 and prior == 0:
            momentum = None
        elif prior == 0:
            momentum = 65.0
        else:
            raw = (recent - prior) / prior
            momentum = round(max(0.0, min(100.0, (raw + 0.30) / 0.60 * 100)), 2)
        bp["sales_momentum"] = momentum
        bp["risk_rate"]      = round(100 * bp["risk_units"] / bp["gross_units"], 1) if bp["gross_units"] else 0.0
        bp["sales_series"]   = series

    return by_product, by_category


def run() -> None:
    logger.info("Shopify senkronu başlıyor...")
    store, cid, secret = sh._config()
    token = sh.get_access_token(store, cid, secret)
    sess = sh.make_session(token)

    variants      = sh.fetch_products_paginated(sess, store)
    product_table = aggregate_products(variants)
    logger.info(f"Katalog: {len(product_table)} ürün/varyant (barkod/SKU anahtarlı)")

    orders = sh.fetch_orders(sess, store, days_back=90)
    by_product, by_category = aggregate_sales(orders, product_table)

    for cat, bc in sorted(by_category.items(), key=lambda x: -x[1]["net_units"]):
        logger.info(f"  {cat:<35} {bc['net_units']:>5} adet | {bc['net_amount']:>12,.0f} TL")

    out = {
        "meta": {
            "synced_at":     datetime.now(timezone.utc).isoformat(),
            "platform":      "shopify",
            "store":         store,
            "variant_count": len(product_table),
            "order_count":   len(orders),
        },
        "products":    product_table,   # barcode/SKU → fiyat/url/kategori
        "by_product":  by_product,      # barcode/SKU → satış agregası
        "by_category": by_category,     # kategori → net adet/tutar
    }
    DATA_DIR.mkdir(exist_ok=True)
    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    logger.info(f"Kaydedildi: {OUT_FILE}")


if __name__ == "__main__":
    run()
