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

# Ürün-başına son ~3 ay satış serisi (sparkline): N haftalık net-adet kovası.
# Ömür-boyu çekilen siparişlerden tek seferde hesaplanır (history store gerekmez).
SERIES_WEEKS = 13


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


def _attr(attributes, name: str):
    """attributes[] listesinden adı verilen özniteliğin İLK değerini döndür (yoksa None).
    Trendyol'da aynı ad birden çok kez gelebilir (ör. iki 'Renk') → ilki alınır."""
    for a in attributes or []:
        if a.get("attributeName") == name:
            return a.get("attributeValue")
    return None


def aggregate_products(products: list) -> tuple[dict, dict]:
    """
    Ürünleri `productContentId` (= snapshot/dashboard ürün pid'i) anahtarıyla otoriter
    fiyat/stok tablosuna indir (PII'siz). Ayrıca barcode→contentId köprü haritasını döndür
    (sipariş satırları kataloğa SADECE barcode ile %100 bağlanıyor — doğrulandı 2026-06-02).
    """
    table, barcode_to_content = {}, {}
    # Varyant sayımı: aynı productMainId'i (ör. "DEFNE90") paylaşan renk/beden kardeşleri.
    main_counts: dict = {}
    for p in products:
        mid = p.get("productMainId")
        if mid:
            main_counts[mid] = main_counts.get(mid, 0) + 1
    for p in products:
        cid = str(p.get("productContentId") or p.get("id"))
        bc = p.get("barcode")
        if bc:
            barcode_to_content[str(bc)] = cid
        mid = p.get("productMainId")
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
            # Kolon zenginleştirme: Trendyol'un kendi kategorisi (referans) + Renk (attribute).
            "category_name": p.get("categoryName"),
            "color": _attr(p.get("attributes"), "Renk"),
            "image": (p.get("images") or [{}])[0].get("url"),   # ilk ürün görseli (hover önizleme)
            # API zenginleştirme: ürün yaşı (createDateTime, epoch ms) → analyzer'da age_days/hız;
            # kampanya bayrağı; varyant modeli + kardeş sayısı; katalog-sağlığı bayrakları (evren filtresi).
            "created_at": p.get("createDateTime"),
            "has_campaign": bool(p.get("hasActiveCampaign")),
            "product_main_id": mid,
            "variant_count": main_counts.get(mid, 1) if mid else 1,
            "archived": bool(p.get("archived")),
            "blacklisted": bool(p.get("blacklisted")),
            "rejected": bool(p.get("rejected")),
            "locked": bool(p.get("locked")),
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
    now_ms = now.timestamp() * 1000
    c_recent = (now - timedelta(days=MOMENTUM_WINDOW_DAYS)).timestamp() * 1000
    c_prior = (now - timedelta(days=2 * MOMENTUM_WINDOW_DAYS)).timestamp() * 1000
    week_ms = 7 * 24 * 3600 * 1000  # sparkline haftalık kova genişliği

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
            commission = float(ln.get("commission", 0) or 0)        # Trendyol komisyon %
            seller_disc = float(ln.get("lineSellerDiscount", 0) or 0)  # satıcı-finanse promo
            status = ln.get("orderLineItemStatusName", "?")
            status_breakdown[status] = status_breakdown.get(status, 0) + qty
            is_net = status not in EXCLUDED_LINE_STATUSES
            # momentum yalnız NET satıştan; pencere kovası
            win = "recent" if od >= c_recent else ("prior" if od >= c_prior else None)

            bp = by_product.setdefault(code, {
                "product_name": name, "barcode": ln.get("barcode"), "category": cat,
                "gross_units": 0, "gross_amount": 0.0, "net_units": 0, "net_amount": 0.0,
                "order_lines": 0, "units_recent": 0, "units_prior": 0,
                # Net Tahsilat % + risk + promo için biriktiriciler (yalnız NET kalemlerden)
                "_comm_w": 0.0, "_seller_disc": 0.0, "risk_units": 0, "promo_units": 0,
                # son SERIES_WEEKS haftalık net-adet kovası (sparkline); idx0=en yeni hafta
                "_series": [0] * SERIES_WEEKS,
            })
            bp["gross_units"] += qty
            bp["gross_amount"] = round(bp["gross_amount"] + amount, 2)
            bp["order_lines"] += 1
            if not is_net:
                bp["risk_units"] += qty
            if is_net:
                bp["net_units"] += qty
                bp["net_amount"] = round(bp["net_amount"] + amount, 2)
                bp["_comm_w"] += amount * commission          # amount-ağırlıklı komisyon payı
                bp["_seller_disc"] += seller_disc
                if seller_disc > 0:
                    bp["promo_units"] += qty
                if win == "recent":
                    bp["units_recent"] += qty
                elif win == "prior":
                    bp["units_prior"] += qty
                # sparkline: siparişin kaç hafta öncesine düştüğü (idx0=en yeni)
                if od:
                    widx = int((now_ms - od) // week_ms)
                    if 0 <= widx < SERIES_WEEKS:
                        bp["_series"][widx] += qty

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
        # Net Tahsilat %: komisyon+satıcı-promo sonrası satıcıya kalan oran (COGS HARİÇ — kâr değil).
        # = Σ(amount·(1−komisyon/100) − satıcı_indirim) / Σ(amount) × 100, NET kalemlerden.
        net_amt = d.get("net_amount", 0.0)
        comm_w = d.pop("_comm_w", 0.0)
        seller_disc = d.pop("_seller_disc", 0.0)
        if net_amt > 0:
            kept = net_amt - comm_w / 100.0 - seller_disc
            d["net_retention_pct"] = round(max(0.0, min(100.0, kept / net_amt * 100)), 1)
        else:
            d["net_retention_pct"] = None
        # İade/iptal oranı: gross adetin içinde iptal/iade/teslim-edilemeyen payı.
        gu = d.get("gross_units", 0)
        d["risk_rate"] = round(d["risk_units"] / gu * 100, 1) if gu > 0 else 0.0
        # Promo payı: satıcı-indirimli net adet / net adet (kampanya-şişmesi sinyali).
        nu = d.get("net_units", 0)
        d["promo_share"] = round(d.get("promo_units", 0) / nu * 100, 1) if nu > 0 else 0.0
        # Sparkline serisi: eski→yeni (soldan sağa zaman); satış yoksa None.
        series = list(reversed(d.pop("_series", [])))
        d["sales_series"] = series if any(series) else None
    for c in by_category.values():
        c["distinct_products"] = len(c.pop("products"))
        c["sales_momentum"] = _momentum_score(c["units_recent"], c["units_prior"])
    return by_product, by_category, status_breakdown


def build_sales_snapshot(payload: dict, date: str) -> dict:
    """Tarihli arşiv için YALIN satış snapshot'ı kur (kategori + ürün-bazlı, PII'siz).

    Neden: Trendyol sipariş API'si ~3 ay geçmiş döndürüyor; aged-out siparişlerin cirosu
    kalıcı kaybolur. Bu snapshot her dönemin satışını düşmeden önce arşivler → ciro trendi.
    999'luk statik katalog tablosu DAHİL EDİLMEZ (zaman içinde değişmiyor); yalnız satış agregatı.
    """
    md = payload.get("metadata", {})
    by_category = {}
    for cat, c in payload.get("sales_by_category", {}).items():
        by_category[cat] = {
            "net_units": c.get("net_units", 0),
            "net_amount": c.get("net_amount", 0.0),
            "gross_units": c.get("gross_units", 0),
            "distinct_products": c.get("distinct_products", 0),
            "sales_momentum": c.get("sales_momentum"),
        }
    by_product, tot_nu, tot_na = {}, 0, 0.0
    for pid, p in payload.get("sales_by_product", {}).items():
        nu, na = p.get("net_units", 0), p.get("net_amount", 0.0)
        tot_nu += nu
        tot_na += na
        by_product[pid] = {"u": nu, "a": round(na, 2)}   # slim: units + amount
    return {
        "date": date,
        "generated_at": md.get("generated_at"),
        "supplier_id": md.get("supplier_id"),
        "orders_total": md.get("orders_total"),
        "order_windows": md.get("order_windows"),
        "oldest_order_date": md.get("oldest_order_date"),
        "totals": {"net_units": tot_nu, "net_amount": round(tot_na, 2)},
        "by_category": by_category,
        "by_product": by_product,
    }


def save_sales_snapshot(payload: dict) -> None:
    """Tarihli satış arşivini PRIVATE Firestore'a yaz: sales_history/{YYYY-MM-DD}.
    doc id = tarih → gün başına 1, idempotent (aynı gün tekrar koşarsa o günü günceller),
    geçmişi bozmaz. Public repo'ya ASLA (revenue = rakip istihbaratı).
    FIREBASE_SERVICE_ACCOUNT yoksa sessizce atlanır."""
    import os
    sa = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not sa:
        logger.info("FIREBASE_SERVICE_ACCOUNT yok — satış arşivi yazımı atlanıyor.")
        return
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as fs
        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(json.loads(sa)))
        db = fs.client()
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        snap = build_sales_snapshot(payload, date)
        db.collection("sales_history").document(date).set(snap)
        logger.info(f"Firestore yazıldı: sales_history/{date} (private; {len(snap['by_product'])} ürün).")
    except Exception as e:
        logger.error(f"Satış arşivi yazımı başarısız: {e}")


def main() -> None:
    logger.info("Trendyol API senkronu başlıyor...")
    sess, sid = ty.make_session()

    products = ty.fetch_all_products(sess, sid)
    logger.info(f"Ürün çekildi: {len(products)}")
    # Ömür-boyu sipariş: 14 günlük pencerelerle geriye; boş-pencere/tavanla dur (CI maliyet sınırı).
    orders, ostats = ty.fetch_orders_lifetime(sess, sid)
    oldest_iso = None
    if ostats.get("oldest_order_ms"):
        oldest_iso = datetime.fromtimestamp(ostats["oldest_order_ms"] / 1000, timezone.utc).isoformat()
    logger.info(
        f"Sipariş çekildi: {len(orders)} | pencere={ostats['windows']} "
        f"| en eski={oldest_iso} | tavan={ostats['max_days']}g hit={ostats['hit_cap']}"
    )

    prod_table, barcode_to_content = aggregate_products(products)
    by_product, by_category, status_breakdown = aggregate_sales(orders, barcode_to_content)

    payload = {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "supplier_id": sid,
            "products_total": len(products),
            "orders_total": len(orders),
            "order_windows": ostats["windows"],
            "oldest_order_date": oldest_iso,
            "order_history_capped": ostats["hit_cap"],
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

    save_sales_snapshot(payload)

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
