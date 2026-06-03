#!/usr/bin/env python3
"""
RoomArt BCG — Trendyol API senkronu (kendi mağaza verisi)
=========================================================
Resmî Trendyol Marketplace API'sinden RoomArt'ın (Supplier 362387) KENDİ
ürün + sipariş verisini çeker, müşteri PII'sini AYIKLAR ve kategori bazında
agregatlar → data/trendyol_sales.json.

Neden ayrı modül (scraper.py'a gömülmedi):
  • scraper.py Playwright ile ürün YORUM verisini (puan/deg) çeker — API'de yok.
  • Bu modül API ile gerçek FİYAT/STOK + gerçek SATIŞ (adet/ciro) getirir.
  İkisi farklı kaynak/bağımlılık; ayrı tutmak CI'da da temiz (API adımı Playwright'sız).

Çıktı (data/trendyol_sales.json) tamamen PII'sizdir: yalnız ürün/adet/ciro agregatı.
BCG'ye bağlama (deg-payı yerine gerçek satış-payı) AYRI bir karar — bu script
yalnız veriyi üretir, analyzer'ı DEĞİŞTİRMEZ.

Kimlik bilgisi YALNIZCA env'den (bkz. trendyol_api.py):
  TRENDYOL_SUPPLIER_ID, ve (TRENDYOL_TOKEN) ya da (TRENDYOL_API_KEY + TRENDYOL_API_SECRET)

Yerel çalıştırma (repo kökünden):
  TRENDYOL_SUPPLIER_ID=... TRENDYOL_TOKEN=... python backend/trendyol_sync.py
"""
from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

import trendyol_api as ty

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
OUT_FILE = DATA_DIR / "trendyol_sales.json"

# Net satıştan düşülen sipariş kalemi durumları (iptal/iade satış sayılmaz).
EXCLUDED_LINE_STATUSES = {"Cancelled", "Returned", "UnDelivered", "UnSupplied"}


def _categorize(name: str) -> str:
    """analyzer.py'daki kategori eşleştirmesini yeniden kullan (tek doğruluk kaynağı)."""
    try:
        from analyzer import categorize
        return categorize(name)
    except Exception:
        return "Diğer"


def aggregate_products(products: list) -> tuple[dict, dict]:
    """
    Ürünleri `productContentId` (= snapshot/dashboard ürün pid'i) anahtarıyla otoriter
    fiyat/stok tablosuna indir (PII'siz). Ayrıca barcode→contentId köprü haritasını döndür
    (sipariş satırları kataloğa SADECE barcode ile %100 bağlanıyor — doğrulandı 2026-06-02).
    """
    table, barcode_to_content = {}, {}
    for p in products:
        cid = str(p.get("productContentId") or p.get("id"))
        bc = p.get("barcode")
        if bc:
            barcode_to_content[str(bc)] = cid
        table[cid] = {
            "barcode": bc,
            "title": p.get("title"),
            "category": _categorize(p.get("title", "")),
            "sale_price": p.get("salePrice"),
            "list_price": p.get("listPrice"),
            "stock": p.get("quantity"),
            "on_sale": p.get("onSale"),
            "approved": p.get("approved"),
        }
    return table, barcode_to_content


def aggregate_sales(orders: list, barcode_to_content: dict) -> tuple[dict, dict, dict]:
    """
    Sipariş `lines`'ından (PII'siz) satışı agregatla; ürün anahtarı = `productContentId`
    (barcode köprüsüyle çözülür → analyzer snapshot pid'iyle birebir bağlanır).
    Döndürür: (by_product, by_category, status_breakdown)
      • gross_* = tüm kalemler; net_* = iptal/iade hariç.
    """
    by_product, by_category = {}, {}
    status_breakdown = {}

    for order in orders:
        for ln in order.get("lines", []) or []:
            bc = str(ln.get("barcode") or "")
            # contentId (= snapshot pid) barcode köprüsünden; çözülemezse barcode'a düş
            code = barcode_to_content.get(bc) or bc or str(ln.get("productCode") or "?")
            name = ln.get("productName", "")
            cat = _categorize(name)
            qty = int(ln.get("quantity", 0) or 0)
            amount = float(ln.get("amount", 0) or 0)
            status = ln.get("orderLineItemStatusName", "?")
            status_breakdown[status] = status_breakdown.get(status, 0) + qty
            is_net = status not in EXCLUDED_LINE_STATUSES

            bp = by_product.setdefault(code, {
                "product_name": name, "barcode": ln.get("barcode"), "category": cat,
                "gross_units": 0, "gross_amount": 0.0, "net_units": 0, "net_amount": 0.0,
                "order_lines": 0,
            })
            bp["gross_units"] += qty
            bp["gross_amount"] = round(bp["gross_amount"] + amount, 2)
            bp["order_lines"] += 1
            if is_net:
                bp["net_units"] += qty
                bp["net_amount"] = round(bp["net_amount"] + amount, 2)

            bc = by_category.setdefault(cat, {
                "gross_units": 0, "gross_amount": 0.0, "net_units": 0, "net_amount": 0.0,
                "order_lines": 0, "products": set(),
            })
            bc["gross_units"] += qty
            bc["gross_amount"] = round(bc["gross_amount"] + amount, 2)
            bc["order_lines"] += 1
            bc["products"].add(code)
            if is_net:
                bc["net_units"] += qty
                bc["net_amount"] = round(bc["net_amount"] + amount, 2)

    # set → sayı (JSON serileştirilebilir)
    for c in by_category.values():
        c["distinct_products"] = len(c.pop("products"))
    return by_product, by_category, status_breakdown


def save_to_firestore(payload: dict) -> None:
    """Ham satış agregatını PRIVATE Firestore'a yaz (public repo'ya değil).
    FIREBASE_SERVICE_ACCOUNT yoksa sessizce atlanır."""
    import os
    sa = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not sa:
        logger.info("FIREBASE_SERVICE_ACCOUNT yok — Firestore yazımı atlanıyor.")
        return
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as fs
        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(json.loads(sa)))
        db = fs.client()
        # Ham satış PRIVATE kalsın: ayrı doc; frontend latest payload'ına karışmaz.
        db.collection("roomart-bcg-dev").document("sales_latest").set(payload)
        logger.info("Firestore yazıldı: roomart-bcg-dev/sales_latest (private).")
    except Exception as e:
        logger.error(f"Firestore yazımı başarısız: {e}")


def main() -> None:
    logger.info("Trendyol API senkronu başlıyor...")
    sess, sid = ty.make_session()

    products = ty.fetch_all_products(sess, sid)
    logger.info(f"Ürün çekildi: {len(products)}")
    orders = ty.fetch_all_orders(sess, sid)
    logger.info(f"Sipariş çekildi: {len(orders)}")

    prod_table, barcode_to_content = aggregate_products(products)
    by_product, by_category, status_breakdown = aggregate_sales(orders, barcode_to_content)

    payload = {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "supplier_id": sid,
            "products_total": len(products),
            "orders_total": len(orders),
            "status_breakdown": status_breakdown,
            "note": "Müşteri PII'si hariç tutuldu; yalnız ürün/adet/ciro agregatı.",
        },
        "products": prod_table,
        "sales_by_product": by_product,
        "sales_by_category": by_category,
    }
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    logger.info(f"Kaydedildi: {OUT_FILE}")

    save_to_firestore(payload)

    # Özet log
    top = sorted(by_category.items(), key=lambda kv: -kv[1]["net_units"])[:6]
    logger.info("Kategori satış (net adet):")
    for cat, c in top:
        logger.info(f"  {cat:32s} {c['net_units']:>5} adet | {c['net_amount']:>12,.0f} TL")


if __name__ == "__main__":
    # repo kökünden veya backend/'den çalışsın diye analyzer importu için path
    sys.path.insert(0, str(Path(__file__).parent))
    # Sync, BCG analizini ASLA bozmamalı (analyzer dosya yoksa deg'e düşer) → her
    # durumda exit 0. Ama hata türünü AYIRT et: eksik secret BEKLENEN (warning),
    # auth reddi ALARM (error annotation) — sessiz düşüşü görünür kılar.
    try:
        main()
    except SystemExit as exc:
        logger.info(f"Atlanıyor: {exc}")
        print("::warning title=Trendyol sync::Secrets yok — pazar payı 'reviews' (deg) tabanına düşecek.")
    except ty.TrendyolAuthError as exc:
        logger.error(str(exc))
        print(f"::error title=Trendyol auth::{exc}")
    except Exception as exc:  # noqa: BLE001 — analizi bozmadan görünür hata bırak
        logger.error(f"Sync başarısız: {exc}")
        print(f"::error title=Trendyol sync::{type(exc).__name__}: {exc}")
