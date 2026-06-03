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
from datetime import datetime, timezone, timedelta
from pathlib import Path

import trendyol_api as ty

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
OUT_FILE = DATA_DIR / "trendyol_sales.json"

# Net satıştan düşülen sipariş kalemi durumları (iptal/iade satış sayılmaz).
EXCLUDED_LINE_STATUSES = {"Cancelled", "Returned", "UnDelivered", "UnSupplied"}

# Satış-momentumu penceresi: son N gün vs önceki N gün (sipariş orderDate'ine göre).
# History store GEREKMEZ — tek çekimde iki pencere kıyaslanır.
MOMENTUM_WINDOW_DAYS = 7


def _normalize(value, lo, hi):
    if hi == lo:
        return 50.0
    return max(0.0, min(100.0, (value - lo) / (hi - lo) * 100))


def _momentum_score(recent: int, prior: int):
    """Satış-momentumu 0-100. Son 14 günde hiç satış yoksa None (analyzer deg'e düşer).
    deg_momentum ile aynı ölçek: %0=50, +%30=100, -%30=0; sıfırdan büyüme=65."""
    if recent == 0 and prior == 0:
        return None
    if prior == 0:
        return 65.0
    return round(_normalize((recent - prior) / prior, -0.30, 0.30), 2)


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
            # Katalog-kapsamı: analyzer ürün evrenini snapshot+API birleşimine genişletir;
            # snapshot'ta OLMAYAN pasif ürünler için Trendyol linki + ürün kodu buradan gelir.
            "product_url": p.get("productUrl"),
            "stock_code": p.get("stockCode"),
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

    # Momentum pencereleri (UTC, epoch ms): [now-7g, now] vs [now-14g, now-7g]
    now = datetime.now(timezone.utc)
    c_recent = (now - timedelta(days=MOMENTUM_WINDOW_DAYS)).timestamp() * 1000
    c_prior = (now - timedelta(days=2 * MOMENTUM_WINDOW_DAYS)).timestamp() * 1000

    for order in orders:
        od = order.get("orderDate", 0) or 0
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
            # momentum yalnız NET satıştan; pencere kovası
            win = "recent" if od >= c_recent else ("prior" if od >= c_prior else None)

            bp = by_product.setdefault(code, {
                "product_name": name, "barcode": ln.get("barcode"), "category": cat,
                "gross_units": 0, "gross_amount": 0.0, "net_units": 0, "net_amount": 0.0,
                "order_lines": 0, "units_recent": 0, "units_prior": 0,
            })
            bp["gross_units"] += qty
            bp["gross_amount"] = round(bp["gross_amount"] + amount, 2)
            bp["order_lines"] += 1
            if is_net:
                bp["net_units"] += qty
                bp["net_amount"] = round(bp["net_amount"] + amount, 2)
                if win == "recent":
                    bp["units_recent"] += qty
                elif win == "prior":
                    bp["units_prior"] += qty

            bcat = by_category.setdefault(cat, {
                "gross_units": 0, "gross_amount": 0.0, "net_units": 0, "net_amount": 0.0,
                "order_lines": 0, "products": set(), "units_recent": 0, "units_prior": 0,
            })
            bcat["gross_units"] += qty
            bcat["gross_amount"] = round(bcat["gross_amount"] + amount, 2)
            bcat["order_lines"] += 1
            bcat["products"].add(code)
            if is_net:
                bcat["net_units"] += qty
                bcat["net_amount"] = round(bcat["net_amount"] + amount, 2)
                if win == "recent":
                    bcat["units_recent"] += qty
                elif win == "prior":
                    bcat["units_prior"] += qty

    # momentum skoru (ürün + kategori); set → sayı
    for d in by_product.values():
        d["sales_momentum"] = _momentum_score(d["units_recent"], d["units_prior"])
    for c in by_category.values():
        c["distinct_products"] = len(c.pop("products"))
        c["sales_momentum"] = _momentum_score(c["units_recent"], c["units_prior"])
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
