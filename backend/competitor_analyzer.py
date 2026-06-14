#!/usr/bin/env python3
"""
RoomArt BCG — Rakip Rekabet Analizi (kategori + ürün eşleştirme)
================================================================
GERÇEK-SATIŞ BCG matrisine DOKUNMAZ — ayrı bir "Rekabet" katmanı üretir.

Girdi:
  data/competitor_snapshots.json  {gün: {pid: {ad,fiyat,puan,deg,url,marka}}}  (competitor_bot)
  data/bcg_scores.json            kendi ürünlerimiz (kategori/fiyat/puan/yorum/url...)

Çıktı:
  data/competitive.json (public-ok; rakip verisi onların açık fiyat/puan/yorumu):
    {
      "metadata": {...},
      "categories": [ {category, brands:[{brand,is_roomart,product_count,avg_price,
                       median_price,avg_rating,total_reviews,review_share,review_velocity,
                       price_index}], roomart_rank, leader} ],
      "matches":   [ {our_id, our_name, category, our_price, our_rating, our_reviews,
                      competitors:[{brand,name,price,rating,reviews,url,score,
                       price_delta_pct,rating_delta,review_delta}]} ],
      "alerts":    [ {type, severity, title, message} ]
    }

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
from datetime import datetime, timezone
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

TOP_PER_CATEGORY = 60     # kategori başına en çok yorumlu N rakip ürün (gürültü/uzun-kuyruk kırpma)
MATCHES_PER_PRODUCT = 3   # her ürün için en yakın N rakip
HIGH_RETURN = None        # (kullanılmıyor; rakipte iade yok)

# Eşleştirme/skor stopword'leri (ayırt edici olmayan kelimeler).
_STOP = {"ve", "ile", "cm", "adet", "yeni", "model", "rani", "roomart", "bofigo",
         "mobilya", "home", "dekoratif", "modern", "lux", "kaliteli"}


def _norm(s: str) -> str:
    s = (s or "").lower()
    for a, b in (("ç", "c"), ("ş", "s"), ("ğ", "g"), ("ı", "i"), ("ö", "o"), ("ü", "u"), ("â", "a")):
        s = s.replace(a, b)
    return s


def _tokens(name: str) -> set:
    """Ad → ayırt edici token kümesi. Ölçü/sayı token'ları (60, 80, 2, 4) korunur (önemli)."""
    t = set(re.findall(r"[a-z0-9]+", _norm(name)))
    return {w for w in t if (w.isdigit() or len(w) >= 3) and w not in _STOP}


def _similarity(our_name, our_price, c_name, c_price):
    """0-1 benzerlik: ad-token Jaccard (0.6) + fiyat yakınlığı (0.4)."""
    a, b = _tokens(our_name), _tokens(c_name)
    jac = len(a & b) / len(a | b) if (a or b) else 0.0
    if our_price and c_price and our_price > 0:
        prox = max(0.0, 1.0 - abs(our_price - c_price) / our_price)
    else:
        prox = 0.0
    return round(0.6 * jac + 0.4 * prox, 4)


def load_competitors():
    """En güncel rakip snapshot'ı + bir önceki (yorum-hızı için). Kategorize + kırp."""
    if not COMP_SNAP.exists():
        return None, {}, []
    snap = json.load(open(COMP_SNAP, encoding="utf-8"))
    days = sorted(snap)
    if not days:
        return None, {}, []
    latest = snap[days[-1]]
    prev = snap[days[-2]] if len(days) >= 2 else {}
    comps = []
    for pid, r in latest.items():
        cat = categorize(r.get("ad", ""))
        if cat not in CATEGORIES:          # "Diğer" → rakibin alakasız ürünü, ele
            continue
        deg = int(r.get("deg", 0) or 0)
        prev_deg = int(prev.get(pid, {}).get("deg", deg) or deg)
        comps.append({
            "pid": pid,
            "name": r.get("ad", ""),
            "brand": r.get("marka", "?"),
            "price": float(r.get("fiyat", 0) or 0),
            "rating": float(r.get("puan", 0) or 0),
            "reviews": deg,
            "review_delta": max(0, deg - prev_deg),   # haftalık yorum artışı (hız vekili)
            "url": r.get("url", ""),
            "category": cat,
        })
    return latest, prev, comps


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
            "bcg_class": p.get("bcg_class"),
        })
    return out


def load_store_urls():
    """competitors.json → marka → temiz mağaza linki (pi/sst eklentileri olmadan)."""
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


def _brand_row(brand, items, is_roomart, cat_total_reviews):
    prices = [i["price"] for i in items if i["price"] > 0]
    ratings = [i["rating"] for i in items if i["rating"] > 0]
    reviews = sum(i["reviews"] for i in items)
    vel = sum(i.get("review_delta", 0) for i in items) if not is_roomart else None
    return {
        "brand": brand,
        "is_roomart": is_roomart,
        "store_url": _STORE_URLS.get(brand),    # marka adına tıklayınca mağazaya gider
        "product_count": len(items),
        "avg_price": round(statistics.mean(prices), 0) if prices else None,
        "median_price": round(statistics.median(prices), 0) if prices else None,
        "avg_rating": round(statistics.mean(ratings), 2) if ratings else None,
        "total_reviews": reviews,
        "review_share": round(reviews / cat_total_reviews * 100, 1) if cat_total_reviews else 0.0,
        "review_velocity": vel,        # haftalık yorum artışı (None=RoomArt/ilk hafta)
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
        # fiyat endeksi: marka ort. fiyatı / kategori ort. fiyatı
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


def build_matches(ours, comps):
    by_cat = {}
    for c in comps:
        by_cat.setdefault(c["category"], []).append(c)
    matches = []
    for o in ours:
        cands = by_cat.get(o["category"], [])
        scored = sorted(
            ({**c, "score": _similarity(o["name"], o["price"], c["name"], c["price"])} for c in cands),
            key=lambda x: -x["score"])[:MATCHES_PER_PRODUCT]
        scored = [s for s in scored if s["score"] > 0.05]
        if not scored:
            continue
        matches.append({
            "our_id": o["id"], "our_name": o["name"], "category": o["category"],
            "our_url": o.get("url", ""),
            "our_price": round(o["price"]) or None, "our_rating": o["rating"], "our_reviews": o["reviews"],
            "bcg_class": o["bcg_class"],
            "competitors": [{
                "brand": s["brand"], "name": s["name"], "price": round(s["price"]) or None,
                "rating": s["rating"], "reviews": s["reviews"], "url": s["url"], "score": s["score"],
                "price_delta_pct": round((s["price"] - o["price"]) / o["price"] * 100) if o["price"] else None,
                "rating_delta": round(s["rating"] - o["rating"], 1),
                "review_delta": s["reviews"] - o["reviews"],
            } for s in scored],
        })
    return matches


def build_alerts(categories, matches):
    alerts = []
    now = datetime.now(timezone.utc).isoformat()

    def add(typ, sev, title, msg):
        alerts.append({"id": f"comp-{len(alerts)+1}", "type": typ, "severity": sev,
                       "title": title, "message": msg, "timestamp": now})

    # (a) Eşleşen üründe rakip BİZDEN UCUZ (fiyatta altımıza inen) — en belirginler
    undercut = []
    for m in matches:
        for c in m["competitors"]:
            if c["score"] >= 0.3 and (c["price_delta_pct"] or 0) <= -10:
                undercut.append((m, c))
    for m, c in sorted(undercut, key=lambda mc: mc[1]["price_delta_pct"])[:3]:
        add("PRICE", "HIGH", f"{m['category']} — fiyatta altımızda rakip",
            f"{c['brand']} '{c['name'][:46]}' %{abs(c['price_delta_pct'])} daha ucuz "
            f"(bizim {m['our_name'][:36]}).")

    # (b) Kategori liderliği rakipte (yorum payında geride)
    for cat in categories:
        if cat["roomart_rank"] and cat["roomart_rank"] > 1 and cat["leader"]:
            rm = next((b for b in cat["brands"] if b["is_roomart"]), None)
            ld = cat["brands"][0]
            if rm and ld["total_reviews"] > rm["total_reviews"] * 1.5:
                add("MARKET", "INFO", f"{cat['category']} — yorum lideri {cat['leader']}",
                    f"{cat['leader']} {ld['total_reviews']} yorum vs bizim {rm['total_reviews']} "
                    f"(sıra {cat['roomart_rank']}/{len(cat['brands'])}).")

    # (c) Hızlı büyüyen rakip (yüksek yorum-hızı)
    fast = []
    for cat in categories:
        for b in cat["brands"]:
            if not b["is_roomart"] and (b["review_velocity"] or 0) > 0:
                fast.append((cat["category"], b))
    for catname, b in sorted(fast, key=lambda cb: -(cb[1]["review_velocity"] or 0))[:2]:
        add("MOMENTUM", "INFO", f"{catname} — hızlı büyüyen rakip",
            f"{b['brand']} bu hafta +{b['review_velocity']} yorum (talep ivmesi).")
    return alerts


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


def main():
    latest, prev, comps = load_competitors()
    if not comps:
        logger.warning("competitor_snapshots.json yok/boş — rekabet analizi atlanıyor.")
        return
    ours = load_ours()
    global _STORE_URLS
    _STORE_URLS = load_store_urls()
    days = sorted(json.load(open(COMP_SNAP, encoding="utf-8")).keys())
    categories = build_categories(ours, comps)
    matches = build_matches(ours, comps)
    alerts = build_alerts(categories, matches)
    payload = {
        "metadata": {
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "snapshot_days": len(days),
            "latest_snapshot": days[-1] if days else None,
            "has_velocity": len(days) >= 2,
            "competitor_products": len(comps),
            "our_products": len(ours),
            "note": "Rakip metriği YORUM tabanlı (gerçek satış değil); BCG'den ayrı.",
        },
        "categories": categories,
        "matches": matches,
        "alerts": alerts,
    }
    OUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info(f"Kaydedildi: {OUT_FILE} — {len(categories)} kategori, {len(matches)} eşleşme, "
                f"{len(alerts)} uyarı.")
    save_firestore(payload)


if __name__ == "__main__":
    main()
