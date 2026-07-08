"""Koçtaş senkronu — Mirakl offers (katalog+fiyat) + orders (satış) → data/koctas_sales.json

Eşleştirme: Koçtaş `shop_sku` bizim stok kodu DEĞİL (Koçtaş-atanmış). Ürünler **BARKOD (EAN)**
ile eşlenir → registry_builder barkod-köprüsüyle bizim stok koduna bağlar (%93 örtüşme).
İndirimli (Sepette) fiyat API'de YOK (platform kampanyası) → own_price_scraper çeker.

Çıktı PII'sizdir. data/koctas_sales.json gitignored (gelir = rekabetçi istihbarat).

Yerel: source backend/.env.koctas.local && python3 backend/koctas_sync.py
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

import koctas_api as koctas

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
OUT_FILE = DATA_DIR / "koctas_sales.json"
SHOP_ID  = "2262"   # RoomArt Koçtaş mağaza no

MOMENTUM_WINDOW_DAYS = 7
SERIES_WEEKS         = 13

# İptal/iade sayılmayan Mirakl sipariş durumları
EXCLUDED_STATES = {"REFUSED", "CANCELED", "CANCELLED", "RECEIVED", "CLOSED"}

_TR_MAP = str.maketrans("ıİşŞğĞüÜöÖçÇ", "iissgguuoocc")

def _slug(text: str) -> str:
    s = (text or "").translate(_TR_MAP).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:120]

def _categorize(name: str) -> str:
    try:
        from analyzer import categorize
        return categorize(name)
    except Exception:
        return "Diğer"

def _ean(offer: dict) -> str:
    for r in offer.get("product_references") or []:
        if (r.get("reference_type") == "EAN") and r.get("reference"):
            return str(r["reference"]).strip()
    return ""


def aggregate_offers(offers: list) -> dict:
    """Aktif teklifleri BARKOD (EAN) → {fiyat, url, ...} tablosuna indir (registry EAN köprüsü)."""
    table = {}
    for o in offers:
        if not o.get("active"):
            continue
        ean = _ean(o)
        product_sku = str(o.get("product_sku") or "").strip()   # Koçtaş katalog kodu = URL id
        shop_sku    = str(o.get("shop_sku") or "").strip()
        key = ean or shop_sku
        if not key:
            continue
        name = o.get("product_title") or ""
        ap = o.get("applicable_pricing") or {}
        price = ap.get("price") or o.get("price") or o.get("total_price") or 0.0
        url = (f"https://www.koctas.com.tr/{_slug(name)}/p/{product_sku}?shop={SHOP_ID}"
               if product_sku else "")
        table[key] = {
            "shop_sku":    shop_sku,       # Koçtaş SKU (bizim stok kodu DEĞİL)
            "product_sku": product_sku,    # Koçtaş katalog kodu (URL id)
            "barcode":     ean,            # EAN → registry eşleşme anahtarı
            "name":        name,
            "category":    _categorize(name),
            "price":       float(price) if price else 0.0,   # API LİSTE fiyatı (Sepette scrape'ten)
            "list_price":  o.get("price"),
            "quantity":    o.get("quantity"),
            "url":         url,
            "offer_id":    str(o.get("offer_id") or ""),
        }
    return table


def aggregate_sales(orders: list, offer_table: dict) -> tuple[dict, dict]:
    """Siparişleri BARKOD/stok bazında agregatla (PII'siz). Mirakl satırları offer_sku taşır."""
    now      = datetime.now(timezone.utc)
    now_ms   = now.timestamp() * 1000
    c_recent = (now - timedelta(days=MOMENTUM_WINDOW_DAYS)).timestamp() * 1000
    c_prior  = (now - timedelta(days=2 * MOMENTUM_WINDOW_DAYS)).timestamp() * 1000
    week_ms  = 7 * 24 * 3600 * 1000
    # shop_sku → EAN köprüsü (sipariş satırı shop_sku taşır; EAN'a çevir)
    sku_to_ean = {v["shop_sku"]: k for k, v in offer_table.items() if v.get("shop_sku")}

    by_product, by_category = {}, {}
    for order in orders:
        od_raw = order.get("created") or ""
        try:
            od = datetime.fromisoformat(od_raw.replace("Z", "+00:00")).timestamp() * 1000
        except Exception:
            od = 0
        for ln in order.get("lines") or []:
            sku    = str(ln.get("stock_code") or "").strip()   # Mirakl offer_sku = shop_sku
            ean    = sku_to_ean.get(sku, "")
            key    = ean or sku or "?"
            name   = ln.get("product_name") or sku
            status = ln.get("status") or order.get("state") or ""
            is_net = status not in EXCLUDED_STATES
            try:
                qty   = int(float(ln.get("quantity") or 0))
                price = float(ln.get("unit_price") or 0)
            except (ValueError, TypeError):
                qty, price = 0, 0.0
            amount = qty * price
            cat = offer_table.get(key, {}).get("category") or _categorize(name)
            win = "recent" if od >= c_recent else ("prior" if od >= c_prior else None)

            bp = by_product.setdefault(key, {
                "name": name, "barcode": ean, "sku": sku, "category": cat,
                "gross_units": 0, "gross_amount": 0.0, "net_units": 0, "net_amount": 0.0,
                "units_recent": 0, "units_prior": 0, "risk_units": 0, "_series": [0] * SERIES_WEEKS,
            })
            bp["gross_units"] += qty
            bp["gross_amount"] += amount
            if not is_net:
                bp["risk_units"] += qty
            else:
                bp["net_units"] += qty
                bp["net_amount"] += amount
                if win == "recent": bp["units_recent"] += qty
                elif win == "prior": bp["units_prior"] += qty
                if od:
                    widx = int((now_ms - od) // week_ms)
                    if 0 <= widx < SERIES_WEEKS:
                        bp["_series"][widx] += qty
            bc = by_category.setdefault(cat, {"net_units": 0, "net_amount": 0.0,
                                              "gross_units": 0, "gross_amount": 0.0})
            bc["gross_units"] += qty
            if is_net:
                bc["net_units"] += qty
                bc["net_amount"] += amount

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
        bp["risk_rate"] = round(100 * bp["risk_units"] / bp["gross_units"], 1) if bp["gross_units"] else 0.0
        bp["sales_series"] = series
    return by_product, by_category


def run() -> None:
    logger.info("Koçtaş senkronu başlıyor...")
    key, _, _ = koctas._config()
    offers = koctas.fetch_offers(key)
    offer_table = aggregate_offers(offers)
    logger.info(f"Katalog: {len(offer_table)} aktif ürün (EAN anahtarlı)")

    orders = koctas.fetch_orders(key, days_back=90)
    by_product, by_category = aggregate_sales(orders, offer_table)
    for cat, bc in sorted(by_category.items(), key=lambda x: -x[1]["net_units"]):
        logger.info(f"  {cat:<35} {bc['net_units']:>5} adet | {bc['net_amount']:>12,.0f} TL")

    out = {
        "meta": {
            "synced_at":     datetime.now(timezone.utc).isoformat(),
            "platform":      "koctas",
            "shop_id":       SHOP_ID,
            "product_count": len(offer_table),
            "order_count":   len(orders),
            "match_key":     "barcode (EAN) — shop_sku bizim stok kodu değil",
        },
        "products":    offer_table,   # EAN → fiyat/url/kategori
        "by_product":  by_product,
        "by_category": by_category,
    }
    DATA_DIR.mkdir(exist_ok=True)
    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2))
    logger.info(f"Kaydedildi: {OUT_FILE}")


if __name__ == "__main__":
    run()
