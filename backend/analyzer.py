#!/usr/bin/env python3
"""
RoomArt BCG Intelligence Platform - Scoring & Analysis Engine (REAL DATA)
=========================================================================
Tamamen gerçek Trendyol verisine (fiyat + puan + değerlendirme) ve
Google Trends kategori büyümesine dayanır. Sahte alanlar
(revenue / monthly_sales / margin / return_rate / stock / performance_tier /
colors_available) KALDIRILDI.

BCG metrik tasarımı (onaylı):
  • Pazar Payı (X)  = kategori-içi değerlendirme (deg) payı, 0-100 normalize
  • Büyüme (Y)      = 0.5 * Trends_büyüme + 0.5 * deg_momentum
                       (momentum verisi yoksa nötr 50; snapshot biriktikçe gerçekleşir)
  • Eşik (threshold) = portföyün MEDYANI (sabit 50 değil, göreli)
  • Quadrant:
        STAR          = yüksek pay + yüksek büyüme
        CASH_COW      = yüksek pay + düşük büyüme
        QUESTION_MARK = düşük pay + yüksek büyüme
        DOG           = düşük pay + düşük büyüme

Öneri motoru gerçek alanlara dayanır: puan (kalite) + fiyat konumu (kategori-içi).
Erken dönem dürüstlük: her ürün/kategori için `confidence` alanı ve gün sayısı.
"""

import json
import logging
import os
import re
import statistics
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# data/ deposu repo kökünde (data/snapshots/, data/trends_sonuc.json ...)
DATA_DIR = Path(__file__).parent.parent / "data"

# Büyüme güveninin "yeterli" sayılması için gereken farklı snapshot günü
CONFIDENCE_MIN_DAYS = 14

# ── 5 gerçek kategori + Trends köprüsü ────────────────────────────────────────
# Sehpa ve Kitaplıklı Çalışma Masası'nın Trends karşılığı YOK -> nötr (None).
CATEGORIES = [
    "Çamaşır Makinesi Dolabı",
    "Lavabolu Banyo Dolabı",
    "Mutfak Adası",
    "Kitaplıklı Çalışma Masası",
    "Sehpa",
]
OTHER_CATEGORY = "DİĞER"
# category_map.json'da bir ürünü analizden tamamen çıkarmak için sentinel
# (mobilya dışı gürültü: telefon, vb.). Atama UI'ı "Hariç Tut" seçilince bunu yazar.
EXCLUDE_TOKEN = "__EXCLUDE__"

# Roomart kategorisi -> trends_sonuc.json anahtarı (eşleşmeyen = None = nötr)
TRENDS_BRIDGE = {
    "Çamaşır Makinesi Dolabı": "çamaşır makinesi dolabı",
    "Lavabolu Banyo Dolabı": "lavabolu banyo dolabı",
    "Mutfak Adası": None,
    "Kitaplıklı Çalışma Masası": None,
    "Sehpa": None,
}


# ── IO yardımcıları ───────────────────────────────────────────────────────────
def load_json(filename, default=None):
    path = DATA_DIR / filename
    if not path.exists():
        if default is not None:
            logger.warning(f"{path} bulunamadı, varsayılan kullanılıyor.")
            return default
        raise FileNotFoundError(path)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(filename, data):
    path = DATA_DIR / filename
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"Saved {path}")


# ── Kategori sınıflandırma (ad bazlı, arayüzden düzenlenebilir override) ───────
def _norm(s):
    """
    Türkçe-dayanıklı normalize: İ/I/ı/i ayrımını tek 'i'ye indir, sonra casefold.
    Neden: Python .lower() Türkçe casing'i yanlış yapar ("I".lower()='i' noktalı;
    pattern'ler dotless 'ı' içerir) → BÜYÜK HARFLİ adlar ("ÇALIŞMA MASASI") eşleşmezdi.
    """
    s = (s or "").replace("İ", "i").replace("I", "i").replace("ı", "i")
    return s.casefold()


def categorize(ad, category_map=None):
    """
    Ürün adından 5 gerçek kategoriye eşle. category_map (product_id -> kategori)
    varsa onu önceliklendir — bu, 'DİĞER atama arayüzü'nün yazdığı elle override'tır.
    Eşleştirme _norm ile büyük/küçük harf ve Türkçe i-varyantlarından bağımsızdır.
    """
    a = _norm(ad)

    def has(*kws):
        return any(_norm(k) in a for k in kws)

    if has("çamaşır", "kurutma makinesi"):
        return "Çamaşır Makinesi Dolabı"
    if has("lavabolu", "banyo dolab", "banyo alt", "banyo üst", "banyo boy"):
        return "Lavabolu Banyo Dolabı"
    if has("bar masas", "mutfak adas"):
        return "Mutfak Adası"
    if has("çalışma masas", "bilgisayar masas", "ofis masas", "kitaplık"):
        return "Kitaplıklı Çalışma Masası"
    if has("sehpa"):
        return "Sehpa"
    return OTHER_CATEGORY


def extract_product_id(url):
    """Trendyol URL'sinden ürün ID'sini çıkar (...-p-XXXXXX?...)."""
    m = re.search(r"-p-(\d+)", url or "")
    return m.group(1) if m else None


def normalize(value, min_val, max_val):
    if max_val == min_val:
        return 50.0
    return max(0.0, min(100.0, (value - min_val) / (max_val - min_val) * 100))


# ── Snapshot okuma + reconstruct ──────────────────────────────────────────────
def load_snapshots():
    """
    Snapshot kaynağını yükle. İki formatı destekler:
      (a) Tek dosya  data/snapshots.json  -> {"YYYY-MM-DD": {pid: {...}}}
      (b) Delta dosyalar data/snapshots/YYYY-MM.json (snapshot_utils.reconstruct)
    snapshot_utils henüz yoksa (a)'ya düşer.
    """
    # (b) delta mimarisi: snapshot_utils.reconstruct varsa onu kullan
    try:
        import snapshot_utils  # backend/snapshot_utils.py (iş #2'de yazılacak)
        if hasattr(snapshot_utils, "reconstruct"):
            days = snapshot_utils.reconstruct(DATA_DIR / "snapshots")
            if days:
                logger.info(f"snapshot_utils.reconstruct: {len(days)} gün yüklendi.")
                return days
    except Exception as e:
        logger.info(f"snapshot_utils yok/atlandı ({e}); tek-dosya formatına düşülüyor.")

    # (a) tek dosya
    data = load_json("snapshots.json", default={})
    return data


def latest_day(snapshots):
    if not snapshots:
        return None, {}
    key = sorted(snapshots.keys())[-1]
    return key, snapshots[key]


# ── deg momentum (snapshot biriktikçe gerçekleşir) ────────────────────────────
def compute_deg_momentum(pid, snapshots, day_keys):
    """
    Bir ürünün değerlendirme sayısındaki momentum'u 0-100 skorla.
    En az 2 farklı gün gerekir; yoksa nötr 50 döner.
    deg yorum sayısı monotonik arttığı için: pozitif delta -> >50.
    """
    if len(day_keys) < 2:
        return 50.0, False  # (skor, gerçekleşti_mi)

    first_key, last_key = day_keys[0], day_keys[-1]
    first = snapshots.get(first_key, {}).get(pid)
    last = snapshots.get(last_key, {}).get(pid)
    if not first or not last:
        return 50.0, False

    d0 = first.get("deg", 0) or 0
    d1 = last.get("deg", 0) or 0
    if d0 <= 0:
        # sıfırdan artış: pozitif ama orijinsiz -> ılımlı pozitif
        return (65.0 if d1 > 0 else 50.0), True

    # yüzde büyüme -> skor. %0=50, +%30 ve üzeri -> 100, -%30 -> 0
    pct = (d1 - d0) / d0
    return normalize(pct, -0.30, 0.30), True


# ── Trends büyüme skoru ───────────────────────────────────────────────────────
def trends_growth_score(category, trends_cats):
    """
    Kategorinin Trends büyüme yüzdesini 0-100 skora çevir.
    Eşleşme yoksa (Sehpa, Çalışma Masası) nötr 50 + has_trends=False döner.
    """
    key = TRENDS_BRIDGE.get(category)
    if not key or key not in trends_cats:
        return 50.0, False
    pct = trends_cats[key].get("buyume_yuzde", 0.0)
    # büyüme yüzdesi: -30%=0, 0%=50, +30%=100 (uç değerler clamp)
    return normalize(pct, -30.0, 30.0), True


# ── Skorlama ──────────────────────────────────────────────────────────────────
def calculate_market_share(product, cat_products):
    """
    Pazar Payı (X) = ürünün kategori-içi değerlendirme (deg) payı, 0-100.
    En çok yorumlu ürün ~100'e yaklaşır.
    """
    total_deg = sum(p["deg"] for p in cat_products)
    if total_deg <= 0:
        return 0.0
    share = product["deg"] / total_deg
    # tek kategoride pay çok küçülebilir; kategori-içi maks'a göre normalize et
    max_deg = max(p["deg"] for p in cat_products)
    if max_deg <= 0:
        return 0.0
    return round(normalize(product["deg"], 0, max_deg), 2)


def calculate_growth(product, category, snapshots, day_keys, trends_cats):
    """
    Büyüme (Y) = 0.5 * Trends_büyüme + 0.5 * deg_momentum
    """
    t_score, has_trends = trends_growth_score(category, trends_cats)
    pid = extract_product_id(product["url"])
    m_score, has_momentum = compute_deg_momentum(pid, snapshots, day_keys)
    growth = 0.5 * t_score + 0.5 * m_score
    return round(growth, 2), has_trends, has_momentum


def classify_bcg(share, growth, share_thr, growth_thr):
    high_share = share >= share_thr
    high_growth = growth >= growth_thr
    if high_share and high_growth:
        return "STAR"
    if high_share and not high_growth:
        return "CASH_COW"
    if not high_share and high_growth:
        return "QUESTION_MARK"
    return "DOG"


def confidence_level(has_trends, has_momentum, n_days):
    """
    Büyüme güveni. momentum gerçekleşmediyse veya yeterli gün yoksa düşük.
    """
    if has_momentum and n_days >= CONFIDENCE_MIN_DAYS:
        return "high" if has_trends else "medium"
    if has_trends:
        return "medium"
    return "low"


# ── Öneri motoru (GERÇEK alanlar: puan + fiyat konumu) ────────────────────────
def generate_recommendation(product, bcg_class, cat_products):
    """
    Öneri = quadrant + kalite (puan) + kategori-içi fiyat konumu.
    """
    puan = product["puan"]
    prices = [p["fiyat"] for p in cat_products if p["fiyat"] > 0]
    avg_price = statistics.mean(prices) if prices else product["fiyat"]
    # fiyat konumu: ucuz < 0.85*ort, premium > 1.15*ort
    if avg_price > 0:
        ratio = product["fiyat"] / avg_price
    else:
        ratio = 1.0
    position = "premium" if ratio > 1.15 else ("value" if ratio < 0.85 else "mid")

    high_quality = puan >= 4.5
    weak_quality = puan > 0 and puan < 4.0

    if bcg_class == "STAR":
        if high_quality:
            action, rationale, priority = ("INVEST",
                "Yüksek pay + yüksek büyüme ve güçlü puan. Stok/görünürlük yatırımı önerilir.", 1)
        else:
            action, rationale, priority = ("SCALE",
                "Güçlü konum; puan ortalama. Kalite iyileştirmesiyle ölçeklen.", 1)

    elif bcg_class == "CASH_COW":
        if high_quality:
            action, rationale, priority = ("HARVEST",
                "Olgun, yüksek paylı ve kaliteli. Nakit akışını koru, Star'ları fonla.", 2)
        else:
            action, rationale, priority = ("DEFEND",
                "Paylı ama büyüme düşük; puanı güçlendirerek payı savun.", 2)

    elif bcg_class == "QUESTION_MARK":
        if high_quality and position != "premium":
            action, rationale, priority = ("INVEST",
                "Büyüyen pazarda kaliteli ama düşük paylı. Pay kapmak için yatırım yap.", 1)
        else:
            action, rationale, priority = ("TEST",
                "Büyüme var, konum belirsiz. Hedefli testle yatırım kararını doğrula.", 2)

    else:  # DOG
        if weak_quality:
            action, rationale, priority = ("EXIT",
                "Düşük pay + düşük büyüme + zayıf puan. Çıkış/listeden kaldırmayı değerlendir.", 4)
        elif position == "premium":
            action, rationale, priority = ("RESTRUCTURE",
                "Zayıf konum ama premium fiyat; fiyat/konumlandırmayı yeniden gözden geçir.", 3)
        else:
            action, rationale, priority = ("OPTIMIZE",
                "Zayıf konum, kabul edilebilir kalite. Çıkmadan önce optimize et.", 3)

    return {"action": action, "rationale": rationale, "priority": priority,
            "price_position": position}


# ── Uyarılar ──────────────────────────────────────────────────────────────────
def detect_alerts(scored):
    alerts = []
    now = datetime.now(timezone.utc).isoformat()

    def add(typ, sev, title, msg, pid):
        alerts.append({
            "id": f"alert-{len(alerts)+1}", "type": typ, "severity": sev,
            "title": title, "message": msg, "product_id": pid, "timestamp": now,
        })

    stars = [p for p in scored if p["bcg_class"] == "STAR"]
    dogs = [p for p in scored if p["bcg_class"] == "DOG"]
    qms = [p for p in scored if p["bcg_class"] == "QUESTION_MARK"]

    for p in sorted(qms, key=lambda x: -x["growth_score"])[:3]:
        if p["confidence"] != "low":
            add("OPPORTUNITY", "HIGH", f"{p['category']} — yükselen fırsat",
                f"{p['name'][:60]} büyüme momentumu yüksek ({p['growth_score']:.0f}/100).",
                p["id"])

    for p in [d for d in dogs if d["recommendation"]["action"] == "EXIT"][:2]:
        add("RISK", "HIGH", f"{p['category']} — çıkış adayı",
            f"{p['name'][:60]} zayıf puan ({p['puan']}) ve düşük pay. İnceleme önerilir.",
            p["id"])

    for p in sorted(stars, key=lambda x: -(x["share_score"] + x["growth_score"]))[:2]:
        add("SUCCESS", "INFO", f"{p['category']} — lider STAR",
            f"{p['name'][:60]} pay {p['share_score']:.0f}, büyüme {p['growth_score']:.0f}.",
            p["id"])

    return alerts


# ── Frontend payload (mevcut şemayı KORUR) ────────────────────────────────────
BCG_META = {
    "STAR": {"quadrant": "STAR", "emoji": "⭐", "color": "#F59E0B"},
    "CASH_COW": {"quadrant": "CASH_COW", "emoji": "🐄", "color": "#10B981"},
    "QUESTION_MARK": {"quadrant": "QUESTION_MARK", "emoji": "❓", "color": "#3B82F6"},
    "DOG": {"quadrant": "DOG", "emoji": "🐕", "color": "#EF4444"},
}
REC_MAP = {
    "INVEST": "INVEST", "SCALE": "INVEST", "HARVEST": "HARVEST",
    "DEFEND": "HARVEST", "TEST": "TEST", "MONITOR": "TEST",
    "OPTIMIZE": "TEST", "EXIT": "EXIT", "RESTRUCTURE": "EXIT",
}


def slugify(s):
    return (s.lower().replace("ç", "c").replace("ş", "s").replace("ğ", "g")
            .replace("ı", "i").replace("ö", "o").replace("ü", "u")
            .replace(" ", "-"))


def build_frontend_payload(scored, alerts, trends_cats, n_days):
    cat_map = {}
    for p in scored:
        cat = p["category"]
        c = cat_map.setdefault(cat, {
            "share": [], "growth": [], "prices": [], "ratings": [],
            "reviews": [], "bcg": [], "confidences": [],
        })
        c["share"].append(p["share_score"])
        c["growth"].append(p["growth_score"])
        c["prices"].append(p["price"])
        c["ratings"].append(p["rating"])
        c["reviews"].append(p["review_count"])
        c["bcg"].append(p["bcg_class"])
        c["confidences"].append(p["confidence"])

    categories = []
    quadrant_dist = {"STAR": 0, "CASH_COW": 0, "QUESTION_MARK": 0, "DOG": 0}
    for cat, c in cat_map.items():
        n = len(c["share"])
        top_bcg = max(set(c["bcg"]), key=c["bcg"].count)
        quadrant_dist[top_bcg] = quadrant_dist.get(top_bcg, 0) + 1

        tkey = TRENDS_BRIDGE.get(cat)
        if tkey and tkey in trends_cats:
            td = trends_cats[tkey]
            trend_score = round(min(100.0, td.get("ortalama", 50)), 1)
            trend_growth = round(td.get("buyume_yuzde", 0.0), 1)
        else:
            trend_score, trend_growth = 50.0, 0.0

        cat_prods = [p for p in scored if p["category"] == cat]
        top_prod = max(cat_prods, key=lambda p: (p["share_score"] + p["growth_score"]))
        top_rec = top_prod["recommendation"]
        top_action = top_rec["action"]
        # ürün priority'si int (1-4) → kategori önerisi için etiket (frontend HIGH/MEDIUM/LOW bekler)
        prio_label = {1: "HIGH", 2: "MEDIUM", 3: "LOW", 4: "LOW"}.get(top_rec.get("priority"), "MEDIUM")

        # kategori güveni: en düşük güven seviyesi baskın
        conf_rank = {"low": 0, "medium": 1, "high": 2}
        cat_conf = min(c["confidences"], key=lambda x: conf_rank[x])

        categories.append({
            "id": slugify(cat), "category": cat, "slug": slugify(cat),
            "product_count": n,
            "share_score": round(statistics.mean(c["share"]), 2),
            "growth_score": round(statistics.mean(c["growth"]), 2),
            "bcg": BCG_META[top_bcg],
            # action + rationale + priority (kategorinin lider ürününden); tactics/budget
            # üretilmiyor (eski sahte-veri kalıntısı), frontend'den de kaldırıldı.
            "recommendation": {
                "action": REC_MAP.get(top_action, "TEST"),
                "rationale": top_rec.get("rationale", ""),
                "priority": prio_label,
            },
            "avg_price": round(statistics.mean(c["prices"]), 2),
            "avg_rating": round(statistics.mean([r for r in c["ratings"] if r > 0] or [0]), 1),
            "total_reviews": sum(c["reviews"]),
            "trend_score": trend_score,
            "trend_growth": trend_growth,
            "confidence": cat_conf,
        })

    kpis = {
        "total_categories": len(categories),
        "total_products": len(scored),
        "star_products": quadrant_dist["STAR"],
        "cash_cows": quadrant_dist["CASH_COW"],
        "question_marks": quadrant_dist["QUESTION_MARK"],
        "dogs": quadrant_dist["DOG"],
        "risk_products": quadrant_dist["DOG"] + quadrant_dist["QUESTION_MARK"],
        "avg_trend_score": round(statistics.mean([c["trend_score"] for c in categories]), 1) if categories else 50,
        "high_priority_alerts": sum(1 for a in alerts if a.get("severity") == "HIGH"),
        "data_days": n_days,
        "growth_confident": n_days >= CONFIDENCE_MIN_DAYS,
        # Erken dönem dürüstlüğü: momentum henüz ölçülemediğinden büyüme ekseni
        # ürünleri tam ayıramaz; bazı quadrant'lar boş kalabilir. Frontend bu
        # bayrakla "X gün veri bekleniyor, matris henüz tam değil" notunu gösterir.
        "growth_axis_active": n_days >= 2,
        "days_until_confident": max(0, CONFIDENCE_MIN_DAYS - n_days),
    }

    trends_list = []
    for cat in cat_map:
        tkey = TRENDS_BRIDGE.get(cat)
        if tkey and tkey in trends_cats:
            td = trends_cats[tkey]
            haftalik = td.get("haftalik", [])
            trends_list.append({
                "category": cat, "slug": slugify(cat), "keyword": tkey,
                "trend_score": round(min(100.0, td.get("ortalama", 50)), 1),
                "growth_rate": round(td.get("buyume_yuzde", 0.0), 1),
                # frontend recharts {value} objesi bekler (ham sayı değil)
                "data_points": [{"week": i + 1, "value": v} for i, v in enumerate(haftalik)],
                "peak_interest": td.get("maks", max(haftalik) if haftalik else 0),
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "has_trends": True,
            })
        else:
            trends_list.append({
                "category": cat, "slug": slugify(cat), "keyword": cat.lower(),
                "trend_score": 50.0, "growth_rate": 0.0, "data_points": [],
                "peak_interest": 0,
                "fetched_at": datetime.now(timezone.utc).isoformat(),
                "has_trends": False,
            })

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "kpis": kpis,
        "categories": categories,
        "quadrant_distribution": quadrant_dist,
        "trends": trends_list,
        "alerts": alerts,
    }


# ── Firebase ──────────────────────────────────────────────────────────────────
def init_firebase():
    service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not service_account_json:
        logger.warning("FIREBASE_SERVICE_ACCOUNT not set — Firestore yazımı atlanıyor")
        return None
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as fs
        if not firebase_admin._apps:
            cred = credentials.Certificate(json.loads(service_account_json))
            firebase_admin.initialize_app(cred)
        return fs.client()
    except Exception as e:
        logger.error(f"Firebase init failed: {e}")
        return None


def save_to_firestore(db_client, payload):
    if not db_client:
        return
    try:
        doc_id = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M")
        db_client.collection("roomart-bcg-dev").document(doc_id).set(payload)
        db_client.collection("roomart-bcg-dev").document("latest").set(payload)
        logger.info(f"Firestore write OK: roomart-bcg-dev/{doc_id}")
    except Exception as e:
        logger.error(f"Firestore write failed: {e}")


# ── Ana akış ──────────────────────────────────────────────────────────────────
def run_analysis():
    snapshots = load_snapshots()
    day_keys = sorted(snapshots.keys())
    n_days = len(day_keys)
    cur_key, current = latest_day(snapshots)
    logger.info(f"{n_days} gün snapshot; en güncel: {cur_key}; {len(current)} ürün.")

    trends_doc = load_json("trends_sonuc.json", default={"kategoriler": {}})
    trends_cats = trends_doc.get("kategoriler", {})

    category_map = load_json("category_map.json", default={})  # iş #4 override'ları

    # Ürünleri normalize et + kategoriye ata
    products = []
    excluded = 0
    for pid, raw in current.items():
        mapped = category_map.get(pid)
        if mapped == EXCLUDE_TOKEN:
            excluded += 1            # mobilya dışı/gürültü: analizden tamamen çıkar
            continue
        cat = mapped or categorize(raw["ad"])
        products.append({
            "id": pid,
            "name": raw["ad"],
            "category": cat,
            "price": raw.get("fiyat", 0.0),
            "rating": raw.get("puan", 0.0),
            "review_count": raw.get("deg", 0),
            "url": raw.get("url", ""),
            # iç hesaplama alanları (frontend'e gitmez)
            "fiyat": raw.get("fiyat", 0.0),
            "puan": raw.get("puan", 0.0),
            "deg": raw.get("deg", 0),
        })

    # DİĞER hariç gerçek kategorilerde skorla; DİĞER atanana dek analiz dışı
    scored = []
    analyzable = [p for p in products if p["category"] != OTHER_CATEGORY]
    by_cat = {}
    for p in analyzable:
        by_cat.setdefault(p["category"], []).append(p)

    for p in analyzable:
        cat_products = by_cat[p["category"]]
        share = calculate_market_share(p, cat_products)
        growth, has_trends, has_momentum = calculate_growth(
            p, p["category"], snapshots, day_keys, trends_cats)
        p["_share"], p["_growth"] = share, growth
        p["_has_trends"], p["_has_momentum"] = has_trends, has_momentum

    # Göreli eşik = portföy medyanı (analiz edilebilir tüm ürünler)
    share_thr = statistics.median([p["_share"] for p in analyzable]) if analyzable else 50
    growth_thr = statistics.median([p["_growth"] for p in analyzable]) if analyzable else 50
    logger.info(f"Eşikler (medyan): pay={share_thr:.1f}, büyüme={growth_thr:.1f}")

    for p in analyzable:
        bcg = classify_bcg(p["_share"], p["_growth"], share_thr, growth_thr)
        rec = generate_recommendation(p, bcg, by_cat[p["category"]])
        conf = confidence_level(p["_has_trends"], p["_has_momentum"], n_days)
        scored.append({
            "id": p["id"], "name": p["name"], "category": p["category"],
            "price": p["price"], "rating": p["rating"], "review_count": p["review_count"],
            "url": p["url"], "puan": p["puan"],
            "share_score": p["_share"], "growth_score": p["_growth"],
            "bcg_class": bcg, "recommendation": rec,
            "composite_score": round((p["_share"] + p["_growth"]) / 2, 1),
            "confidence": conf,
        })

    # ── Birleşik ürün dizisi (192 hepsi; DİĞER dahil) — frontend tablo/atama için ──
    # Skorlanmış ürünleri id ile indeksle, ham ürün listesi (DİĞER dahil) üzerinden birleştir.
    scored_by_id = {p["id"]: p for p in scored}
    products_payload = []
    for p in products:
        sc = scored_by_id.get(p["id"])
        products_payload.append({
            # ortak alanlar (192 hepsi)
            "id": p["id"],
            "name": p["name"],
            "category": p["category"],
            "price": p["price"],
            "rating": p["rating"],
            "review_count": p["review_count"],
            "url": p["url"],
            "is_unassigned": p["category"] == OTHER_CATEGORY,
            # skor alanları: skorlanmışta dolu, DİĞER'de None (henüz atanmadı)
            "share_score": sc["share_score"] if sc else None,
            "growth_score": sc["growth_score"] if sc else None,
            "bcg_class": sc["bcg_class"] if sc else None,
            # action'ı REC_MAP'ten geçir → tooltip/tablo kategori paneliyle TUTARLI
            # (ör. SCALE→INVEST); rationale/priority korunur.
            "recommendation": ({**sc["recommendation"],
                                "action": REC_MAP.get(sc["recommendation"]["action"],
                                                      sc["recommendation"]["action"])}
                               if sc else None),
            "composite_score": sc["composite_score"] if sc else None,
            "confidence": sc["confidence"] if sc else None,
        })

    alerts = detect_alerts(scored)
    payload = build_frontend_payload(scored, alerts, trends_cats, n_days)
    payload["products"] = products_payload

    # Ham skor dosyası (debug/denetim için)
    bcg_scores = {
        "metadata": {
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "total_products": len(scored),          # skorlanan (DİĞER hariç)
            "total_all": len(products_payload),      # tüm ürünler (DİĞER dahil, EXCLUDE hariç)
            "other_unassigned": sum(1 for p in products if p["category"] == OTHER_CATEGORY),
            "excluded_count": excluded,              # category_map ile "Hariç Tut" edilen

            "data_days": n_days,
            "thresholds": {"share": round(share_thr, 1), "growth": round(growth_thr, 1)},
            "quadrant_distribution": payload["quadrant_distribution"],
        },
        # Firestore ile parite: 192 ürünün tamamı (is_unassigned bayrağıyla)
        "products": products_payload,
    }
    return bcg_scores, payload, alerts


def main():
    logger.info("BCG analiz motoru (gerçek veri) başlıyor...")
    bcg_scores, payload, alerts = run_analysis()

    save_json("bcg_scores.json", bcg_scores)
    save_json("alerts.json", {"metadata": {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "total_alerts": len(alerts)}, "alerts": alerts})

    db = init_firebase()
    save_to_firestore(db, payload)

    q = bcg_scores["metadata"]["quadrant_distribution"]
    logger.info(f"Tamamlandı: {q['STAR']} Star, {q['CASH_COW']} Cash Cow, "
                f"{q['QUESTION_MARK']} Question Mark, {q['DOG']} Dog; "
                f"{len(alerts)} uyarı; "
                f"{bcg_scores['metadata']['other_unassigned']} DİĞER (atanmadı).")


if __name__ == "__main__":
    main()
