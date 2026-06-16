#!/usr/bin/env python3
"""
RoomArt BCG — Rakip Rekabet Analizi (kategori + ürün eşleştirme)
================================================================
GERÇEK-SATIŞ BCG matrisine DOKUNMAZ — ayrı bir "Rekabet" katmanı üretir.

Girdi:
  data/competitor_snapshots.json  {gün: {pid: {ad,fiyat,puan,deg,url,marka,gorsel}}}
  data/bcg_scores.json            kendi ürünlerimiz (kategori/fiyat/puan/yorum/url/image...)

Çıktı:
  data/competitive.json (public-ok; rakip verisi onların açık fiyat/puan/yorumu):
    {
      "metadata": {...},
      "categories": [ {category, brands:[{brand,is_roomart,product_count,avg_price,
                       median_price,avg_rating,total_reviews,review_share,review_velocity,
                       price_index}], roomart_rank, leader} ],
      "matches":   [ {our_id, our_name, category, our_price, our_rating, our_reviews,
                      competitors:[{brand,name,price,rating,reviews,url,image,score,
                       price_delta_pct,rating_delta,review_delta}]} ],
      "alerts":    [ {type, severity, title, message} ]
    }

Görsel eşleştirme (pHash):
  Pillow + imagehash kuruluysa aktif (requirements.txt'te var).
  Hash'ler data/image_hashes.json'a cache'lenir → CI her seferinde indirmez.
  "Diğer" kategorisine düşen rakip ürünler görsel benzerlikle kurtarılır (MIN_IMG_SIM_RESCUE eşiği).

KISIT: Rakipte GERÇEK satış yok (units alınamaz). Rakip "gücü" = yorum sayısı + yorum-hızı
(talep vekili). Bu kendi gerçek-satış metriğimizle aynı sınıf DEĞİL → karıştırılmaz, ayrı sunulur.

Çalıştırma (repo kökünden):  python3 backend/competitor_analyzer.py
analyze.yml'de competitor_snapshots.json VARSA çalışır (yoksa atla — graceful).
"""
from __future__ import annotations

import json
import logging
import os
import re
import statistics
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

# analyzer'ın kategori mantığını yeniden kullan (tek doğruluk kaynağı)
sys.path.insert(0, str(Path(__file__).parent))
from analyzer import categorize, CATEGORIES  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DATA = Path(__file__).parent.parent / "data"
COMP_SNAP = DATA / "competitor_snapshots.json"
BCG_FILE = DATA / "bcg_scores.json"
OUT_FILE = DATA / "competitive.json"
IMG_HASH_FILE = DATA / "image_hashes.json"

TOP_PER_CATEGORY = 60     # kategori başına en çok yorumlu N rakip ürün (gürültü/uzun-kuyruk kırpma)
MATCHES_PER_PRODUCT = 3   # her ürün için en yakın N rakip
PRICE_BAND = (0.5, 2.0)   # fiyat-bandı kapısı (rakip fiyatı bu aralığın dışındaysa eşleşme adayı olamaz)
MIN_MATCH_SCORE = 0.35    # minimum eşleşme skoru
MIN_IMG_SIM_RESCUE = 0.65 # "Diğer" kurtarma: sadece görsel skorla, yüksek eşik

# Görsel ağırlıklar (Pillow/imagehash kuruluysa)
IMG_W = 0.50    # görsel benzerlik
TXT_W = 0.25    # token Jaccard
PRC_W = 0.25    # fiyat yakınlığı
IMG_FETCH_TIMEOUT = 5
IMG_FETCH_WORKERS = 20

# pHash bağımlılığı (opsiyonel; yoksa text+price fallback)
_PHASH_AVAILABLE = False
try:
    from PIL import Image
    import imagehash as _ihash
    _PHASH_AVAILABLE = True
except ImportError:
    logger.warning("Pillow/imagehash kurulu değil — görsel eşleştirme devre dışı. "
                   "pip install Pillow imagehash")

# Eşleştirme/skor stopword'leri (ayırt edici olmayan kelimeler).
_STOP = {"ve", "ile", "cm", "adet", "yeni", "model", "rani", "roomart", "bofigo",
         "mobilya", "home", "dekoratif", "modern", "lux", "kaliteli"}


# ── Metin benzerliği ──────────────────────────────────────────────────────────

def _norm(s: str) -> str:
    s = (s or "").lower()
    for a, b in (("ç", "c"), ("ş", "s"), ("ğ", "g"), ("ı", "i"), ("ö", "o"), ("ü", "u"), ("â", "a")):
        s = s.replace(a, b)
    return s


def _tokens(name: str) -> set:
    """Ad → ayırt edici token kümesi. Ölçü/sayı token'ları (60, 80, 2, 4) korunur (önemli)."""
    t = set(re.findall(r"[a-z0-9]+", _norm(name)))
    return {w for w in t if (w.isdigit() or len(w) >= 3) and w not in _STOP}


# ── Görsel hash cache ─────────────────────────────────────────────────────────

def _load_img_cache() -> dict:
    if IMG_HASH_FILE.exists():
        try:
            return json.load(open(IMG_HASH_FILE, encoding="utf-8"))
        except Exception:
            return {}
    return {}


def _save_img_cache(cache: dict) -> None:
    IMG_HASH_FILE.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")


def _phash_url(url: str) -> str | None:
    """URL'den pHash hesapla. Başarısızlıkta None."""
    if not url or not _PHASH_AVAILABLE:
        return None
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        data = urllib.request.urlopen(req, timeout=IMG_FETCH_TIMEOUT).read()
        img = Image.open(BytesIO(data)).convert("RGB")
        return str(_ihash.phash(img))
    except Exception:
        return None


def _build_hash_cache(urls: list, cache: dict) -> None:
    """Eksik URL'leri paralel indir, cache'i in-place doldur."""
    missing = [u for u in urls if u and u not in cache]
    if not missing:
        return
    logger.info(f"Görsel hash hesaplanıyor: {len(missing)} yeni URL (paralel {IMG_FETCH_WORKERS} iş)...")
    with ThreadPoolExecutor(max_workers=IMG_FETCH_WORKERS) as ex:
        futs = {ex.submit(_phash_url, u): u for u in missing}
        for fut in as_completed(futs):
            cache[futs[fut]] = fut.result()
    valid = sum(1 for v in cache.values() if v)
    logger.info(f"  hash cache: {valid} geçerli / {len(cache)} toplam URL")


def _img_sim(h1: str | None, h2: str | None) -> float:
    """0-1 görsel benzerlik. 0=tamamen farklı, 1=aynı görüntü."""
    if not h1 or not h2 or not _PHASH_AVAILABLE:
        return 0.0
    try:
        d = _ihash.hex_to_hash(h1) - _ihash.hex_to_hash(h2)
        return max(0.0, 1.0 - d / 32.0)
    except Exception:
        return 0.0


# ── Eşleştirme skoru ─────────────────────────────────────────────────────────

def _similarity(our_name, our_price, c_name, c_price, our_h=None, c_h=None) -> float:
    """0-1 eşleştirme skoru: 50% token Jaccard + 50% fiyat yakınlığı.
    Görsel (pHash) beyaz arka planlı mobilya fotoğraflarında gürültü eklediği için
    temel skora dahil edilmez; sadece çok benzer görsellerde (>0.70) küçük bonus verilir."""
    a, b = _tokens(our_name), _tokens(c_name)
    jac = len(a & b) / len(a | b) if (a or b) else 0.0
    if our_price and c_price and our_price > 0:
        prox = max(0.0, 1.0 - abs(our_price - c_price) / our_price)
    else:
        prox = 0.0
    base = 0.5 * jac + 0.5 * prox
    img = _img_sim(our_h, c_h)
    # Yalnız yüksek görsel benzerlikte (+0.10 max) bonus — düşük img_sim temel skoru düşürmesin.
    if img > 0.70:
        base = min(1.0, base + 0.10 * img)
    return round(base, 4)


# ── Veri yükleme ─────────────────────────────────────────────────────────────

def load_competitors():
    """En güncel rakip snapshot'ı + bir önceki (yorum-hızı için).

    Döndürür: (latest_raw, prev_raw, comps_categorized, comps_diger)
      comps_categorized : metin-kategorize edilmiş rakip ürünler (6 kategori)
      comps_diger       : "Diğer" düşen ürünler — görsel benzerlikle kurtarılabilir
    """
    if not COMP_SNAP.exists():
        return None, {}, [], []
    snap = json.load(open(COMP_SNAP, encoding="utf-8"))
    days = [d for d in sorted(snap) if snap.get(d)]
    if not days:
        return None, {}, [], []
    latest = snap[days[-1]]
    prev = snap[days[-2]] if len(days) >= 2 else {}
    comps, comps_diger = [], []
    for pid, r in latest.items():
        cat = categorize(r.get("ad", ""))
        deg = int(r.get("deg", 0) or 0)
        prev_deg = int(prev.get(pid, {}).get("deg", deg) or deg)
        item = {
            "pid": pid,
            "name": r.get("ad", ""),
            "brand": r.get("marka", "?"),
            "price": float(r.get("fiyat", 0) or 0),
            "rating": float(r.get("puan", 0) or 0),
            "reviews": deg,
            "review_delta": max(0, deg - prev_deg),
            "url": r.get("url", ""),
            "image": r.get("gorsel"),
            "category": cat,
        }
        if cat not in CATEGORIES:
            comps_diger.append(item)
        else:
            comps.append(item)
    logger.info(f"Rakip ürünler: {len(comps)} kategorili + {len(comps_diger)} Diğer")
    return latest, prev, comps, comps_diger


def load_ours():
    """bcg_scores.json'dan kendi ürünlerimiz (6 gerçek kategori)."""
    bcg = json.load(open(BCG_FILE, encoding="utf-8"))
    out = []
    for p in bcg.get("products", []):
        if p.get("category") not in CATEGORIES:
            continue
        out.append({
            "id": p["id"], "name": p.get("name", ""), "category": p["category"],
            "price": float(p.get("price", 0) or 0), "rating": float(p.get("rating", 0) or 0),
            "reviews": int(p.get("review_count", 0) or 0), "url": p.get("url", ""),
            "image": p.get("image"),
            "bcg_class": p.get("bcg_class"),
        })
    return out


def load_store_urls():
    """competitors.json → marka → temiz mağaza linki."""
    f = DATA / "competitors.json"
    out = {"ROOMART": "https://www.trendyol.com/magaza/roomart-m-362387"}
    if not f.exists():
        return out
    try:
        doc = json.load(open(f, encoding="utf-8"))
        for rakipler in doc.get("kategoriler", {}).values():
            for r in rakipler:
                marka, url = r.get("marka"), r.get("magaza_url", "")
                if marka and url:
                    out.setdefault(marka, url.split("?")[0])
    except Exception:
        pass
    return out


_STORE_URLS = {}


# ── Kategori özeti ────────────────────────────────────────────────────────────

def _brand_row(brand, items, is_roomart, cat_total_reviews):
    prices = [i["price"] for i in items if i["price"] > 0]
    ratings = [i["rating"] for i in items if i["rating"] > 0]
    reviews = sum(i["reviews"] for i in items)
    vel = sum(i.get("review_delta", 0) for i in items) if not is_roomart else None
    return {
        "brand": brand,
        "is_roomart": is_roomart,
        "store_url": _STORE_URLS.get(brand),
        "product_count": len(items),
        "avg_price": round(statistics.mean(prices), 0) if prices else None,
        "median_price": round(statistics.median(prices), 0) if prices else None,
        "avg_rating": round(statistics.mean(ratings), 2) if ratings else None,
        "total_reviews": reviews,
        "review_share": round(reviews / cat_total_reviews * 100, 1) if cat_total_reviews else 0.0,
        "review_velocity": vel,
    }


def build_categories(ours, comps):
    cats = []
    for cat in CATEGORIES:
        our_c = [o for o in ours if o["category"] == cat]
        comp_c = sorted([c for c in comps if c["category"] == cat],
                        key=lambda x: -x["reviews"])[:TOP_PER_CATEGORY]
        if not our_c and not comp_c:
            continue
        cat_total = sum(i["reviews"] for i in our_c) + sum(i["reviews"] for i in comp_c)
        brands = [_brand_row("ROOMART", our_c, True, cat_total)] if our_c else []
        by_brand = {}
        for c in comp_c:
            by_brand.setdefault(c["brand"], []).append(c)
        for brand, items in by_brand.items():
            brands.append(_brand_row(brand, items, False, cat_total))
        cat_prices = [b["avg_price"] for b in brands if b["avg_price"]]
        cat_avg = statistics.mean(cat_prices) if cat_prices else 0
        for b in brands:
            b["price_index"] = round(b["avg_price"] / cat_avg, 2) if (b["avg_price"] and cat_avg) else None
        brands.sort(key=lambda b: -b["total_reviews"])
        roomart_rank = next((i + 1 for i, b in enumerate(brands) if b["is_roomart"]), None)
        cats.append({
            "category": cat,
            "brands": brands,
            "roomart_rank": roomart_rank,
            "leader": brands[0]["brand"] if brands else None,
            "competitor_brands": len(by_brand),
        })
    return cats


# ── Ürün eşleştirme ───────────────────────────────────────────────────────────

def build_matches(ours, comps, comps_diger=None, img_cache=None):
    """
    İki aşamalı eşleştirme:
      Yol 1 — metin-kategorili adaylar: text + price + görsel skoru.
      Yol 2 — "Diğer" kurtarma (PHASH_AVAILABLE ise): sadece görsel (MIN_IMG_SIM_RESCUE eşiği).
    Sonuçlar birleştirilir, tekilleştirilir, en iyi 3 seçilir.
    """
    img_cache = img_cache or {}
    by_cat: dict = {}
    for c in comps:
        by_cat.setdefault(c["category"], []).append(c)

    rescued_total = 0
    matches = []
    for o in ours:
        our_h = img_cache.get(o.get("image")) if o.get("image") else None

        # Yol 1: metin-kategorili adaylar
        cands = by_cat.get(o["category"], [])
        if o["price"] and o["price"] > 0:
            lo, hi = o["price"] * PRICE_BAND[0], o["price"] * PRICE_BAND[1]
            cands = [c for c in cands if c["price"] and lo <= c["price"] <= hi]
        scored1 = []
        for c in cands:
            c_h = img_cache.get(c.get("image")) if c.get("image") else None
            s = _similarity(o["name"], o["price"], c["name"], c["price"], our_h, c_h)
            scored1.append({**c, "score": s, "_rescued": False})

        # Yol 2: "Diğer" görsel kurtarma
        scored2 = []
        if _PHASH_AVAILABLE and our_h and comps_diger:
            if o["price"] and o["price"] > 0:
                lo2, hi2 = o["price"] * PRICE_BAND[0], o["price"] * PRICE_BAND[1]
                diger_bant = [c for c in comps_diger if c["price"] and lo2 <= c["price"] <= hi2]
            else:
                diger_bant = list(comps_diger)
            for c in diger_bant:
                c_h = img_cache.get(c.get("image")) if c.get("image") else None
                img = _img_sim(our_h, c_h)
                if img >= MIN_IMG_SIM_RESCUE:
                    prox = (max(0.0, 1.0 - abs(o["price"] - c["price"]) / o["price"])
                            if o["price"] else 0.0)
                    # "Diğer" kurtarma: sadece görsel+fiyat (metin eşleşmesi beklenmez)
                    s = round(0.70 * img + 0.30 * prox, 4)
                    scored2.append({**c, "score": s, "category": o["category"], "_rescued": True})

        # Birleştir, tekilleştir, sırala, en iyi 3
        seen_pids: set = set()
        top = []
        for s in sorted(scored1 + scored2, key=lambda x: -x["score"]):
            pid = s.get("pid", s.get("name", ""))
            if pid in seen_pids or s["score"] < MIN_MATCH_SCORE:
                continue
            seen_pids.add(pid)
            top.append(s)
            if len(top) >= MATCHES_PER_PRODUCT:
                break

        if not top:
            continue

        rescued = [t for t in top if t.get("_rescued")]
        rescued_total += len(rescued)

        matches.append({
            "our_id": o["id"], "our_name": o["name"], "category": o["category"],
            "our_url": o.get("url", ""), "our_image": o.get("image"),
            "our_price": round(o["price"]) or None, "our_rating": o["rating"], "our_reviews": o["reviews"],
            "bcg_class": o["bcg_class"],
            "competitors": [{
                "brand": s["brand"], "name": s["name"], "price": round(s["price"]) or None,
                "rating": s["rating"], "reviews": s["reviews"], "url": s["url"],
                "image": s.get("image"), "score": s["score"],
                "rescued": s.get("_rescued", False),
                "price_delta_pct": round((s["price"] - o["price"]) / o["price"] * 100) if o["price"] else None,
                "rating_delta": round(s["rating"] - o["rating"], 1),
                "review_delta": s["reviews"] - o["reviews"],
            } for s in top],
        })

    logger.info(f"Görsel kurtarma: {rescued_total} eşleşme 'Diğer' kategorisinden kurtarıldı.")
    return matches


# ── Uyarılar ──────────────────────────────────────────────────────────────────

def build_alerts(categories, matches):
    alerts = []
    now = datetime.now(timezone.utc).isoformat()

    def add(typ, sev, title, msg):
        alerts.append({"id": f"comp-{len(alerts)+1}", "type": typ, "severity": sev,
                       "title": title, "message": msg, "timestamp": now})

    undercut = []
    for m in matches:
        for c in m["competitors"]:
            if c["score"] >= 0.3 and (c["price_delta_pct"] or 0) <= -10:
                undercut.append((m, c))
    for m, c in sorted(undercut, key=lambda mc: mc[1]["price_delta_pct"])[:3]:
        add("PRICE", "HIGH", f"{m['category']} — fiyatta altımızda rakip",
            f"{c['brand']} '{c['name'][:46]}' %{abs(c['price_delta_pct'])} daha ucuz "
            f"(bizim {m['our_name'][:36]}).")

    for cat in categories:
        if cat["roomart_rank"] and cat["roomart_rank"] > 1 and cat["leader"]:
            rm = next((b for b in cat["brands"] if b["is_roomart"]), None)
            ld = cat["brands"][0]
            if rm and ld["total_reviews"] > rm["total_reviews"] * 1.5:
                add("MARKET", "INFO", f"{cat['category']} — yorum lideri {cat['leader']}",
                    f"{cat['leader']} {ld['total_reviews']} yorum vs bizim {rm['total_reviews']} "
                    f"(sıra {cat['roomart_rank']}/{len(cat['brands'])}).")

    fast = []
    for cat in categories:
        for b in cat["brands"]:
            if not b["is_roomart"] and (b["review_velocity"] or 0) > 0:
                fast.append((cat["category"], b))
    for catname, b in sorted(fast, key=lambda cb: -(cb[1]["review_velocity"] or 0))[:2]:
        add("MOMENTUM", "INFO", f"{catname} — hızlı büyüyen rakip",
            f"{b['brand']} bu hafta +{b['review_velocity']} yorum (talep ivmesi).")
    return alerts


# ── Firestore ─────────────────────────────────────────────────────────────────

def save_firestore(payload):
    sa = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not sa:
        logger.info("FIREBASE_SERVICE_ACCOUNT yok — Firestore yazımı atlanıyor.")
        return
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as fs
        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(json.loads(sa)))
        fs.client().collection("roomart-bcg-dev").document("competitive_latest").set(payload)
        logger.info("Firestore yazıldı: roomart-bcg-dev/competitive_latest.")
    except Exception as e:
        logger.error(f"Firestore yazımı başarısız: {e}")


# ── Ana akış ──────────────────────────────────────────────────────────────────

def main():
    latest, prev, comps, comps_diger = load_competitors()
    if not comps and not comps_diger:
        logger.warning("competitor_snapshots.json yok/boş — rekabet analizi atlanıyor.")
        return
    ours = load_ours()
    global _STORE_URLS
    _STORE_URLS = load_store_urls()

    # Görsel hash cache — eksik URL'leri indir, cache'i güncelle
    img_cache = {}
    if _PHASH_AVAILABLE:
        img_cache = _load_img_cache()
        all_urls = (
            [o.get("image") for o in ours] +
            [c.get("image") for c in comps] +
            [c.get("image") for c in comps_diger]
        )
        _build_hash_cache(all_urls, img_cache)
        _save_img_cache(img_cache)

    snap_raw = json.load(open(COMP_SNAP, encoding="utf-8"))
    days = [d for d in sorted(snap_raw) if snap_raw.get(d)]
    categories = build_categories(ours, comps)
    matches = build_matches(ours, comps, comps_diger=comps_diger, img_cache=img_cache)
    alerts = build_alerts(categories, matches)

    rescued = sum(1 for m in matches for c in m["competitors"] if c.get("rescued"))
    payload = {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "snapshot_days": len(days),
            "latest_snapshot": days[-1] if days else None,
            "has_velocity": len(days) >= 2,
            "competitor_products": len(comps),
            "competitor_diger": len(comps_diger),
            "competitor_rescued": rescued,
            "our_products": len(ours),
            "image_matching": _PHASH_AVAILABLE,
            "image_hashes_cached": sum(1 for v in img_cache.values() if v),
            "note": "Rakip metriği YORUM tabanlı (gerçek satış değil); BCG'den ayrı.",
        },
        "categories": categories,
        "matches": matches,
        "alerts": alerts,
    }
    OUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info(
        f"Kaydedildi: {OUT_FILE} — {len(categories)} kategori, {len(matches)} eşleşme "
        f"({rescued} görsel kurtarma), {len(alerts)} uyarı."
    )
    save_firestore(payload)


if __name__ == "__main__":
    main()
