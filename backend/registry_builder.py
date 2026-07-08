"""Çok-platform ürün kütüğü — ürünleri STOK KODUNDA birleştir.

Her platformun (Trendyol, Shopify, ileride HB/n11) ürün + satış verisini okur,
ortak STOK KODU (stockCode / Shopify sku) anahtarında tek ürüne birleştirir.
Barkod (EAN) ikincil kimlik + yedek eşleşme anahtarıdır.

Ampirik: RoomArt aynı stok kodunu platformlar arası tutar → stok kodu örtüşmesi (608)
barkod örtüşmesinden (471) yüksek. Bu yüzden birincil anahtar = stok kodu.

Çıktı: data/product_registry.json (gitignored — ciro içerir, yalnız yerel) +
       data/product_registry_public.json (committable — fiyat+yorum+url, ciro'suz) +
       Firestore registry_latest (PUBLIC-safe payload — dashboard client-side okur).
Platformlar arası fiyat farkı (price_spread) da raporlanır.

  python3 backend/registry_builder.py
"""
from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR   = Path(__file__).parent.parent / "data"
PUBLIC_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data"
OUT_FILE   = DATA_DIR / "product_registry.json"
# Public-safe: fiyat + yorum + url (ciro/satış YOK) → committable, dashboard kolonları için.
PUBLIC_OUT = DATA_DIR / "product_registry_public.json"

PRICE_CONFLICT_PCT = 5.0   # platformlar arası fiyat farkı bu %'yi aşarsa "çakışma"


def _load(name: str) -> dict | None:
    p = DATA_DIR / name
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception as e:
        logger.warning(f"{name} okunamadı: {e}")
        return None


def _norm(code) -> str:
    return str(code or "").strip()


_TR_MAP = str.maketrans("ıİşŞğĞüÜöÖçÇ", "iissgguuoocc")

def _slugify(text: str) -> str:
    """Pazaryeri URL slug'ı: Türkçe karakterleri sadeleştir → küçük harf → alfanümerik dışı '-'.
    HB/n11 sondaki id/sku'ya göre kanonik URL'e yönlendirir; slug yaklaşık olabilir."""
    s = (text or "").translate(_TR_MAP).lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:120]


# ── Platform yükleyiciler → {stock_code: {kanonik ürün + satış}} ───────────────
def load_trendyol() -> dict:
    """Trendyol: products (barcode-anahtarlı, stock_code taşır) + sales_by_product (barcode ile eşle)."""
    doc = _load("trendyol_sales.json")
    if not doc:
        logger.info("trendyol_sales.json yok — Trendyol atlanıyor.")
        return {}
    products = doc.get("products", {})
    sales    = doc.get("sales_by_product", {})
    # barcode → satış agregası
    sales_by_bc = {}
    for v in sales.values():
        bc = _norm(v.get("barcode"))
        if bc:
            sales_by_bc[bc] = v

    out = {}
    for v in products.values():
        sc = _norm(v.get("stock_code"))
        bc = _norm(v.get("barcode"))
        if not sc and not bc:
            continue
        key = sc or bc
        s = sales_by_bc.get(bc, {})
        out[key] = {
            "stock_code": sc,
            "barcode":    bc,
            "name":       v.get("title") or "",
            "category":   v.get("category") or "",
            "price":      v.get("sale_price") or 0.0,
            "list_price": v.get("list_price"),
            "url":        v.get("product_url") or "",
            "on_sale":    bool(v.get("on_sale")),
            "image":      v.get("image") or "",
            "units_90d":  s.get("net_units", 0),
            "amount_90d": round(s.get("net_amount", 0.0)),
            "momentum":   s.get("sales_momentum"),
        }
    logger.info(f"Trendyol: {len(out)} ürün (stok kodu anahtarlı).")
    return out


def load_shopify() -> dict:
    """Shopify: products (sku=stok kodu) + by_product (sku/barkod ile satış)."""
    doc = _load("shopify_sales.json")
    if not doc:
        logger.info("shopify_sales.json yok — Shopify atlanıyor.")
        return {}
    products = doc.get("products", {})
    sales    = doc.get("by_product", {})
    # sku VE barcode → satış (ikisiyle de eşleşebilsin)
    sales_idx = {}
    for v in sales.values():
        for k in (_norm(v.get("sku")), _norm(v.get("barcode"))):
            if k:
                sales_idx[k] = v

    out = {}
    for v in products.values():
        sc = _norm(v.get("sku"))
        bc = _norm(v.get("barcode"))
        if not sc and not bc:
            continue
        key = sc or bc
        s = sales_idx.get(sc) or sales_idx.get(bc) or {}
        # aynı stok kodu birden çok varyantta olabilir → satışı topla, ilk ürün bilgisini tut
        if key in out:
            out[key]["units_90d"]  += s.get("net_units", 0)
            out[key]["amount_90d"] += round(s.get("net_amount", 0.0))
            continue
        # Shopify URL'i temiz alan adına çevir (myshopify.com → roomartstore.com.tr)
        url = (v.get("url") or "").replace("roomartstore-com-tr.myshopify.com", "roomartstore.com.tr")
        out[key] = {
            "stock_code": sc,
            "barcode":    bc,
            "name":       v.get("name") or "",
            "category":   v.get("category") or "",
            "price":      v.get("price") or 0.0,
            "list_price": v.get("list_price"),
            "url":        url,
            "on_sale":    (v.get("status") == "active"),
            "image":      v.get("image") or "",
            "units_90d":  s.get("net_units", 0),
            "amount_90d": round(s.get("net_amount", 0.0)),
            "momentum":   s.get("sales_momentum"),
        }
    logger.info(f"Shopify: {len(out)} ürün (stok kodu anahtarlı).")
    return out


def load_hb() -> dict:
    """Hepsiburada — hb_sales.json hazır olunca doldurulacak (aktivasyon bekliyor)."""
    doc = _load("hb_sales.json")
    if not doc:
        return {}
    # HB sync 'listings' anahtarına yazar (merchantSku=stok kodu; barkod YOK)
    products = doc.get("listings", {}) or doc.get("products", {})
    sales    = doc.get("by_product", {})
    out = {}
    for key0, v in products.items():
        sc = _norm(v.get("sku") or v.get("merchant_sku") or key0)
        if not sc:
            continue
        s = sales.get(sc) or {}
        out[sc] = {
            "stock_code": sc, "barcode": "",
            "name": v.get("name") or "", "category": v.get("category") or "",
            "price": v.get("price") or 0.0, "list_price": v.get("list_price"),
            "url": v.get("url") or "", "on_sale": (v.get("status") != "Suspended"),
            "image": v.get("image") or "",
            "hb_sku": v.get("hb_sku") or "",   # hepsiburadaSku → URL kanonik slug'ı için
            "units_90d": s.get("net_units", 0), "amount_90d": round(s.get("net_amount", 0.0)),
            "momentum": s.get("sales_momentum"),
        }
    logger.info(f"Hepsiburada: {len(out)} ürün.")
    return out


def load_n11() -> dict:
    """n11 — n11_sales.json hazır olunca doldurulacak (aktivasyon bekliyor)."""
    doc = _load("n11_sales.json")
    if not doc:
        return {}
    products = doc.get("products", {})
    sales    = doc.get("by_product", {})
    out = {}
    for v in products.values():
        sc = _norm(v.get("sku"))
        bc = _norm(v.get("barcode"))
        key = sc or bc
        if not key:
            continue
        s = sales.get(sc) or sales.get(bc) or {}
        out[key] = {
            "stock_code": sc, "barcode": bc,
            "name": v.get("name") or "", "category": v.get("category") or "",
            "price": v.get("price") or 0.0, "list_price": v.get("list_price"),
            "url": v.get("url") or "", "on_sale": True, "image": v.get("image") or "",
            "units_90d": s.get("net_units", 0), "amount_90d": round(s.get("net_amount", 0.0)),
            "momentum": s.get("sales_momentum"),
        }
    logger.info(f"n11: {len(out)} ürün.")
    return out


def load_koctas() -> dict:
    """Koçtaş — koctas_sales.json. shop_sku bizim stok kodu DEĞİL → BARKOD (EAN) ile köprülenir
    (build_registry bc_to_sc köprüsü EAN'ı bizim stok kodumuza bağlar, %93 örtüşme)."""
    doc = _load("koctas_sales.json")
    if not doc:
        return {}
    products = doc.get("products", {})
    sales    = doc.get("by_product", {})
    out = {}
    for key0, v in products.items():
        bc = _norm(v.get("barcode"))          # EAN — birincil eşleşme anahtarı
        if not bc:
            continue
        s = sales.get(key0) or sales.get(bc) or {}
        out[bc] = {
            "stock_code": "",                 # Koçtaş shop_sku bizim değil → boş; barkodla köprü
            "barcode":    bc,
            "name":       v.get("name") or "", "category": v.get("category") or "",
            "price":      v.get("price") or 0.0, "list_price": v.get("list_price"),
            "url":        v.get("url") or "", "on_sale": True, "image": "",
            "units_90d":  s.get("net_units", 0), "amount_90d": round(s.get("net_amount", 0.0)),
            "momentum":   s.get("sales_momentum"),
        }
    logger.info(f"Koçtaş: {len(out)} ürün.")
    return out


PLATFORM_LOADERS = {
    "trendyol": load_trendyol,
    "shopify":  load_shopify,
    "hb":       load_hb,
    "n11":      load_n11,
    "koctas":   load_koctas,
}


def build_registry() -> dict:
    per_platform = {name: fn() for name, fn in PLATFORM_LOADERS.items()}
    active = [p for p, d in per_platform.items() if d]
    logger.info(f"Aktif platformlar: {active}")

    # barkod → stok kodu köprüsü (bir platformda stok kodu yoksa barkodla birleştir)
    bc_to_sc = {}
    for d in per_platform.values():
        for key, v in d.items():
            sc, bc = v.get("stock_code"), v.get("barcode")
            if sc and bc:
                bc_to_sc[bc] = sc

    registry = {}
    for platform, prods in per_platform.items():
        for key, v in prods.items():
            # Birleştirme anahtarı: stok kodu > (barkod→stok kodu köprüsü) > barkod
            sc = v.get("stock_code")
            bc = v.get("barcode")
            merge_key = sc or bc_to_sc.get(bc) or bc or key

            entry = registry.setdefault(merge_key, {
                "stock_code": sc or "",
                "barcode":    bc or "",
                "name":       v["name"],
                "category":   v["category"],
                "image":      v.get("image", ""),
                "platforms":  {},
            })
            # Kanonik ad/kategori/barkod boşsa doldur
            if not entry["stock_code"] and sc: entry["stock_code"] = sc
            if not entry["barcode"] and bc:    entry["barcode"] = bc
            if not entry["name"] and v["name"]: entry["name"] = v["name"]
            if (not entry["category"] or entry["category"] == "Diğer") and v["category"]:
                entry["category"] = v["category"]
            if not entry["image"] and v.get("image"): entry["image"] = v["image"]

            entry["platforms"][platform] = {
                "price":      v["price"],
                "list_price": v["list_price"],
                "url":        v["url"],
                "on_sale":    v["on_sale"],
                "hb_sku":     v.get("hb_sku", ""),   # yalnız HB'de dolu; URL slug'ı için (post-merge)
                "units_90d":  v["units_90d"],
                "amount_90d": v["amount_90d"],
                "momentum":   v["momentum"],
            }

    # Yorum/yıldız verisi (platform_reviews.json → stok kodu bazlı)
    reviews_doc = _load("platform_reviews.json") or {}
    reviews_by_sc = reviews_doc.get("by_stock_code", {})

    # SON/SEPET fiyatı (own_price_scraper, Mac haftalık): n11 sepette + TY kampanya.
    # Satıcı API'leri son fiyatı vermez → müşterinin ödeyeceği fiyat yalnız scrape'ten.
    final_doc = _load("own_final_prices.json") or {}
    final_by_sc = final_doc.get("by_stock_code", {})

    # Türev alanlar: present_on, fiyat aralığı, toplam satış, yorum
    conflicts = 0
    for sc, e in registry.items():
        present = sorted(e["platforms"].keys())
        e["present_on"] = present
        e["platform_count"] = len(present)
        # Son fiyat scrape'i API fiyatını EZER (n11 sepette, TY kampanya) → müşterinin ödeyeceği.
        fin = final_by_sc.get(sc, {})
        for _plat, _key in (("n11", "n11"), ("trendyol", "trendyol"), ("hb", "hb"), ("koctas", "koctas")):
            _fp = fin.get(_key)
            if _fp and _plat in e["platforms"]:
                e["platforms"][_plat]["price"] = _fp
                e["platforms"][_plat]["price_final"] = True   # sepette/kampanya/sepete özel (son fiyat)
        prices = [p["price"] for p in e["platforms"].values() if p["price"]]
        e["price_min"] = min(prices) if prices else None
        e["price_max"] = max(prices) if prices else None
        e["price_spread_pct"] = (round(100 * (max(prices) - min(prices)) / min(prices), 1)
                                 if len(prices) >= 2 and min(prices) else None)
        if e["price_spread_pct"] and e["price_spread_pct"] > PRICE_CONFLICT_PCT:
            e["price_conflict"] = True
            conflicts += 1
        else:
            e["price_conflict"] = False
        e["total_units_90d"]  = sum(p["units_90d"] for p in e["platforms"].values())
        e["total_amount_90d"] = sum(p["amount_90d"] for p in e["platforms"].values())

        # Platform yorumları: her platformun rating + review_count'unu ekle
        rev = reviews_by_sc.get(sc, {})
        e["reviews"] = {}
        for plat, rdata in rev.items():
            e["reviews"][plat] = {
                "rating":       rdata.get("rating"),
                "review_count": rdata.get("review_count"),
            }
        # HB ürün URL'i: kanonik ad slug'ı + hepsiburadaSku → /{slug}-p-{sku}. HB listing API
        # ürün adı VERMİYOR → slug'ı stok-kodu ortak üründen (kanonik ad) kur (HB -p-{sku}'ya
        # göre kanoniğe yönlendirir). n11 URL'i zaten n11_api'de groupId ile doğru (URL id=groupId,
        # doğrulandı 7/8; eski scraper-override/mağaza-fallback KALDIRILDI → daha güvenilir).
        hb = e["platforms"].get("hb")
        if hb and hb.get("hb_sku"):
            slug = _slugify(e.get("name") or "")
            hb["url"] = (f"https://www.hepsiburada.com/{slug}-p-{hb['hb_sku']}"
                         if slug else f"https://www.hepsiburada.com/-p-{hb['hb_sku']}")
        # Toplam yorum sayısı (platformlar arası)
        e["total_reviews"] = sum((r.get("review_count") or 0) for r in e["reviews"].values())

    multi = sum(1 for e in registry.values() if e["platform_count"] >= 2)
    by_platform_count = {p: sum(1 for e in registry.values() if p in e["platforms"]) for p in active}

    return {
        "metadata": {
            "generated_at":        datetime.now(timezone.utc).isoformat(),
            "merge_key":           "stock_code (yedek: barcode)",
            "platforms":           active,
            "total_products":      len(registry),
            "multi_platform_count": multi,
            "by_platform_count":   by_platform_count,
            "price_conflict_count": conflicts,
        },
        "products": registry,
    }


def save_to_firestore(payload: dict) -> None:
    sa = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not sa:
        logger.warning("FIREBASE_SERVICE_ACCOUNT yok — Firestore yazımı atlanıyor.")
        return
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as fs
        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(json.loads(sa)))
        fs.client().collection("roomart-bcg-dev").document("registry_latest").set(payload)
        logger.info("Firestore write OK: roomart-bcg-dev/registry_latest")
    except Exception as e:
        logger.error(f"Firestore write failed: {e}")


def build_public(payload: dict) -> dict:
    """Ciro/satış alanlarını (units_90d, amount_90d, momentum, total_*) ATARAK
    public-safe registry üret. Fiyat + yorum + url pazaryerlerinde zaten herkese açık."""
    pub = {}
    for sc, e in payload["products"].items():
        plats = {}
        for k, pd in e["platforms"].items():
            plats[k] = {
                "price":      pd.get("price"),
                "list_price": pd.get("list_price"),
                "url":        pd.get("url"),
                "on_sale":    pd.get("on_sale"),
                "price_final": pd.get("price_final", False),   # sepette/son fiyat mı (scrape) → ✓ işareti
            }
        pub[sc] = {
            "stock_code":       e.get("stock_code"),
            "name":             e.get("name"),
            "category":         e.get("category"),
            "platforms":        plats,
            "reviews":          e.get("reviews", {}),
            "total_reviews":    e.get("total_reviews", 0),
            "present_on":       e.get("present_on", []),
            "platform_count":   e.get("platform_count", 0),
            "price_min":        e.get("price_min"),
            "price_max":        e.get("price_max"),
            "price_spread_pct": e.get("price_spread_pct"),
            "price_conflict":   e.get("price_conflict", False),
        }
    return {"metadata": {**payload["metadata"], "public_safe": True,
                         "note": "Ciro/satış YOK — yalnız public fiyat+yorum+url."},
            "products": pub}


def run() -> None:
    logger.info("Ürün kütüğü (stok kodu birleştirme) başlıyor...")
    payload = build_registry()
    DATA_DIR.mkdir(exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    m = payload["metadata"]
    logger.info(f"Kaydedildi: {OUT_FILE}")
    logger.info(f"Toplam ürün: {m['total_products']} | çok-platform: {m['multi_platform_count']} "
                f"| fiyat çakışması: {m['price_conflict_count']}")
    logger.info(f"Platform başına: {m['by_platform_count']}")

    # Public-safe sürüm (committable) → data/ + frontend/public/data/
    public = build_public(payload)
    pub_json = json.dumps(public, ensure_ascii=False, indent=2)
    PUBLIC_OUT.write_text(pub_json, encoding="utf-8")
    if PUBLIC_DIR.exists():
        (PUBLIC_DIR / "product_registry_public.json").write_text(pub_json, encoding="utf-8")
    logger.info(f"Public-safe kaydedildi: {PUBLIC_OUT} (ciro'suz)")

    # Firestore'a registry YAZILMAZ: 1130 ürünlük doküman Firestore'un doküman-başı index-entry
    # limitini aşıyor (INDEX_ENTRIES_COUNT_LIMIT_EXCEEDED). Ayrıca committed public JSON zaten
    # her gün taze deploy oluyor → Firestore kopyası gereksiz. Dashboard registry'yi doğrudan
    # product_registry_public.json'dan okur (useData.js). save_to_firestore korunur (ileride
    # size-safe/blob tasarımıyla yeniden kullanılabilir) ama artık çağrılmaz.


if __name__ == "__main__":
    run()
