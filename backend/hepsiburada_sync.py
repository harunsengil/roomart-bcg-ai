"""Hepsiburada senkronu — ürün kataloğu + sipariş agregası → data/hb_sales.json

Trendyol_sync.py ile aynı yapı:
  • Çıktı PII'sizdir (müşteri verisi yok; yalnız ürün/adet/tutar agregası).
  • Barkod → contentId köprüsü (ileride product_registry ile birleştirilecek).
  • data/hb_sales.json gitignore'a eklenecek (gelir = rekabetçi istihbarat).

Yerel çalıştırma (repo kökünden):
  source backend/.env.hb.local && python backend/hepsiburada_sync.py
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import hepsiburada_api as hb

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
OUT_FILE = DATA_DIR / "hb_sales.json"

MOMENTUM_WINDOW_DAYS = 7   # son 7g vs önceki 7g (Trendyol ile aynı pencere)
SERIES_WEEKS         = 13  # sparkline hafta sayısı

# İptal/iade sayılmayan HB sipariş durumları (Trendyol EXCLUDED_LINE_STATUSES karşılığı)
EXCLUDED_STATUSES = {
    "Cancelled", "CancelledBySeller", "CancelledByCustomer",
    "Returned", "ReturnAccepted", "ReturnReceived",
    "UnDelivered", "DeliveryFailed",
}


def _categorize(name: str) -> str:
    try:
        from analyzer import categorize
        return categorize(name)
    except Exception:
        return "Diğer"


def aggregate_listings(listings: list) -> dict:
    """HB ürün listesini barkod → {fiyat, stok, durum, sku, url} tablosuna indir."""
    table = {}
    for item in listings:
        # HB API alan adları: merchantSku, barcode, price, availableStock, status, productName
        barcode = str(item.get("barcode") or item.get("Barcode") or "")
        sku     = item.get("merchantSku") or item.get("MerchantSku") or ""
        price   = item.get("price") or item.get("Price") or 0.0
        try:
            price = float(str(price).replace(",", "."))
        except (ValueError, TypeError):
            price = 0.0
        stock  = item.get("availableStock") or item.get("AvailableStock")
        status = item.get("status") or item.get("Status") or ""
        name   = item.get("productName") or item.get("ProductName") or sku
        # HB ürün sayfası linki (listing varsa hb.com/p/... formatı)
        listing_id = item.get("listingId") or item.get("ListingId") or ""
        url = f"https://www.hepsiburada.com/{listing_id}" if listing_id else ""

        if barcode:
            table[barcode] = {
                "sku":      sku,
                "name":     name,
                "category": _categorize(name),
                "price":    price,
                "stock":    stock,
                "status":   status,
                "url":      url,
                "listing_id": listing_id,
            }
    return table


def aggregate_sales(orders: list, listing_table: dict) -> tuple[dict, dict]:
    """Siparişleri ürün + kategori bazında agregatla (PII'siz)."""
    now    = datetime.now(timezone.utc)
    now_ms = now.timestamp() * 1000
    c_recent = (now - timedelta(days=MOMENTUM_WINDOW_DAYS)).timestamp() * 1000
    c_prior  = (now - timedelta(days=2 * MOMENTUM_WINDOW_DAYS)).timestamp() * 1000
    week_ms  = 7 * 24 * 3600 * 1000

    by_product, by_category = {}, {}

    for order in orders:
        # HB sipariş tarihi (ISO veya epoch ms olabilir)
        od_raw = order.get("orderDate") or order.get("createdDate") or 0
        if isinstance(od_raw, str):
            try:
                od = datetime.fromisoformat(od_raw.replace("Z", "+00:00")).timestamp() * 1000
            except Exception:
                od = 0
        else:
            od = float(od_raw or 0)

        lines = order.get("orderlines") or order.get("lines") or order.get("items") or []
        for ln in lines:
            barcode  = str(ln.get("barcode") or ln.get("Barcode") or "")
            sku      = ln.get("merchantSku") or ln.get("sku") or barcode
            name     = ln.get("productName") or ln.get("name") or sku
            qty      = int(ln.get("quantity") or ln.get("Quantity") or 0)
            amount   = float(ln.get("price") or ln.get("Price") or 0) * qty
            status   = ln.get("status") or ln.get("Status") or ""
            is_net   = status not in EXCLUDED_STATUSES

            # Barkod üzerinden kategori (listing_table'dan; yoksa isimden)
            listing = listing_table.get(barcode, {})
            cat     = listing.get("category") or _categorize(name)
            key     = barcode or sku

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

    # Finalize ürün kayıtları
    for key, bp in by_product.items():
        series = list(reversed(bp.pop("_series")))  # eski→yeni
        recent, prior = bp["units_recent"], bp["units_prior"]
        if recent == 0 and prior == 0:
            momentum = None
        elif prior == 0:
            momentum = 65.0
        else:
            raw = (recent - prior) / prior
            momentum = round(max(0.0, min(100.0, (raw + 0.30) / 0.60 * 100)), 2)
        risk = round(100 * bp["risk_units"] / bp["gross_units"], 1) if bp["gross_units"] else 0.0
        bp["sales_momentum"] = momentum
        bp["risk_rate"]      = risk
        bp["sales_series"]   = series

    return by_product, by_category


def run() -> None:
    logger.info("Hepsiburada senkronu başlıyor...")
    sess, mid = hb.make_session()

    listings     = hb.fetch_listings(sess, mid)
    listing_table = aggregate_listings(listings)
    logger.info(f"Katalog: {len(listing_table)} ürün (barkod anahtarlı)")

    orders = hb.fetch_orders(sess, mid, days_back=90)
    by_product, by_category = aggregate_sales(orders, listing_table)

    # Kategori özeti log
    for cat, bc in sorted(by_category.items(), key=lambda x: -x[1]["net_units"]):
        logger.info(f"  {cat:<35} {bc['net_units']:>5} adet | {bc['net_amount']:>12,.0f} TL")

    out = {
        "meta": {
            "synced_at":     datetime.now(timezone.utc).isoformat(),
            "merchant_id":   mid,
            "platform":      "hepsiburada",
            "listing_count": len(listing_table),
            "order_count":   len(orders),
        },
        "listings":    listing_table,      # barkod → fiyat/stok/url
        "by_product":  by_product,         # barkod/sku → satış agregası
        "by_category": by_category,        # kategori → net adet/tutar
    }
    DATA_DIR.mkdir(exist_ok=True)
    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    logger.info(f"Kaydedildi: {OUT_FILE}")


if __name__ == "__main__":
    run()
