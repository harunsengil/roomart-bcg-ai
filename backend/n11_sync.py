"""n11 senkronu — ürün kataloğu + sipariş agregası → data/n11_sales.json

Hepsiburada/Trendyol sync modülleriyle aynı yapı.
Çıktı PII'sizdir. data/n11_sales.json gitignored.

Yerel çalıştırma (repo kökünden):
  source backend/.env.n11.local && python3 backend/n11_sync.py
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path

import n11_api as n11

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
OUT_FILE = DATA_DIR / "n11_sales.json"

MOMENTUM_WINDOW_DAYS = 7
SERIES_WEEKS         = 13

EXCLUDED_STATUSES = {
    "Cancelled", "CancelledBySeller", "CancelledByCustomer",
    "Returned", "ReturnInitiated", "ReturnInProgress", "ReturnCompleted",
    "Rejected",
}


def _categorize(name: str) -> str:
    try:
        from analyzer import categorize
        return categorize(name)
    except Exception:
        return "Diğer"


def aggregate_products(products: list) -> dict:
    """n11 ürünlerini STOK KODU → {fiyat, stok, url} tablosuna indir (registry anahtarı)."""
    table = {}
    for p in products:
        stock_code = str(p.get("stock_code") or "").strip()
        barcode    = str(p.get("barcode") or "").strip()
        key        = stock_code or barcode
        if not key:
            continue
        table[key] = {
            "product_id": p.get("product_id"),
            "sku":        stock_code,
            "barcode":    barcode,
            "name":       p.get("title") or stock_code,
            "category":   _categorize(p.get("title") or ""),
            "price":      p.get("price") or 0.0,
            "list_price": p.get("list_price"),
            "status":     p.get("status") or "",
            "url":        p.get("url") or "",
        }
    return table


def aggregate_sales(orders: list, product_table: dict) -> tuple[dict, dict]:
    """Siparişleri ürün + kategori bazında agregatla (PII'siz)."""
    from datetime import datetime, timezone, timedelta
    now      = datetime.now(timezone.utc)
    now_ms   = now.timestamp() * 1000
    c_recent = (now - timedelta(days=MOMENTUM_WINDOW_DAYS)).timestamp() * 1000
    c_prior  = (now - timedelta(days=2 * MOMENTUM_WINDOW_DAYS)).timestamp() * 1000
    week_ms  = 7 * 24 * 3600 * 1000

    by_product, by_category = {}, {}

    for order in orders:
        od = order.get("order_ms") or 0   # REST'te zaten epoch ms

        for ln in order.get("lines") or []:
            stock_code = str(ln.get("stock_code") or "").strip()   # registry anahtarı
            barcode    = str(ln.get("barcode") or "").strip()
            name       = ln.get("product_name") or stock_code
            status     = ln.get("status") or order.get("status") or ""
            is_net     = status not in EXCLUDED_STATUSES
            try:
                qty    = int(float(ln.get("quantity") or 0))
                price  = float(str(ln.get("unit_price") or "0").replace(",", "."))
            except (ValueError, TypeError):
                qty, price = 0, 0.0
            amount = qty * price

            # Kategori: önce product_table'dan (stok kodu), yoksa isimden
            key    = stock_code or barcode or "?"
            prod   = product_table.get(key, {})
            cat    = prod.get("category") or _categorize(name)

            win = "recent" if od >= c_recent else ("prior" if od >= c_prior else None)

            bp = by_product.setdefault(key, {
                "name": name, "barcode": barcode, "sku": stock_code, "category": cat,
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
    logger.info("n11 senkronu başlıyor...")
    key, secret = n11._config()

    products      = n11.fetch_products(key, secret)
    product_table = aggregate_products(products)
    logger.info(f"Katalog: {len(product_table)} ürün")

    orders = n11.fetch_orders(key, secret, days_back=90)
    by_product, by_category = aggregate_sales(orders, product_table)

    for cat, bc in sorted(by_category.items(), key=lambda x: -x[1]["net_units"]):
        logger.info(f"  {cat:<35} {bc['net_units']:>5} adet | {bc['net_amount']:>12,.0f} TL")

    out = {
        "meta": {
            "synced_at":     datetime.now(timezone.utc).isoformat(),
            "platform":      "n11",
            "product_count": len(product_table),
            "order_count":   len(orders),
        },
        "products":    product_table,
        "by_product":  by_product,
        "by_category": by_category,
    }
    DATA_DIR.mkdir(exist_ok=True)
    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    logger.info(f"Kaydedildi: {OUT_FILE}")


if __name__ == "__main__":
    run()
