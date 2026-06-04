#!/usr/bin/env python3
"""
RoomArt BCG Intelligence Platform - Scoring & Analysis Engine (REAL DATA)
=========================================================================
Tamamen gerçek Trendyol verisine (fiyat + puan + değerlendirme) ve
Google Trends kategori büyümesine dayanır. Sahte alanlar
(revenue / monthly_sales / margin / return_rate / stock / performance_tier /
colors_available) KALDIRILDI.

BCG metrik tasarımı (onaylı, 2026-06-03 güncellemesi):
  • Pazar Payı (X)  = kategori-içi GERÇEK SATIŞ (net_units) payı, 0-100 normalize
                       (Trendyol API → trendyol_sales.json). Satış yoksa kategori
                       eski değerlendirme (deg) payına düşer; her ürün `share_basis`
                       ("sales"|"reviews") ile hangi tabanı kullandığını belirtir.
  • Büyüme (Y)      = 0.5 * Trends_büyüme + 0.5 * SATIŞ_momentum (Trends'siz: yalnız momentum)
                       Momentum = gerçek satış hızı (son 7g vs önceki 7g net adet,
                       trendyol_sync.py). Son 14 günde satışı olmayan ürün eski
                       deg_momentum'a düşer; her ürün `growth_basis` ("sales"|"reviews").
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

# RoomArt'ın Trendyol merchantId'si. Snapshot okuma katmanında bu merchantId'e
# sahip OLMAYAN tüm ürünler (mobilya dışı gürültü: iPhone vb.) elenir.
ROOMART_MERCHANT_ID = "362387"

# ── Gerçek kategoriler + Trends köprüsü ───────────────────────────────────────
# Mutfak Adası / Kitaplıklı Çalışma Masası / Sehpa / Kahve Köşesi'nin Trends
# karşılığı YOK -> bu kategoriler büyüme ekseninde momentum-only (bkz. TRENDS_BRIDGE).
CATEGORIES = [
    "Çamaşır Makinesi Dolabı",
    "Banyo Dolabı",
    "Mutfak Adası",
    "Kitaplıklı Çalışma Masası",
    "Sehpa",
    "Kahve Köşesi",
]
OTHER_CATEGORY = "Diğer"
# category_map.json'da bir ürünü analizden tamamen çıkarmak için sentinel
# (mobilya dışı gürültü: telefon, vb.). Atama UI'ı "Hariç Tut" seçilince bunu yazar.
EXCLUDE_TOKEN = "__EXCLUDE__"

# Roomart kategorisi -> trends_sonuc.json anahtarı.
# None = bu kategorinin gerçek Trends verisi YOK -> büyüme momentum-only hesaplanır
# ve kategori MEDYAN eşik hesabından HARİÇ tutulur (suni nötr-50 medyanı bozmasın).
TRENDS_BRIDGE = {
    "Çamaşır Makinesi Dolabı": "çamaşır makinesi dolabı",
    "Banyo Dolabı": "lavabolu banyo dolabı",
    "Mutfak Adası": None,
    "Kitaplıklı Çalışma Masası": None,
    "Sehpa": None,
    "Kahve Köşesi": None,
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

    # Kahve Köşesi'ni önce yakala: adında "Kiler/Mutfak Dolabı" gibi başka anahtarlar
    # da geçebildiği için yüksek öncelikli kontrol et.
    if has("kahve köşe"):
        return "Kahve Köşesi"
    if has("çamaşır", "kurutma makinesi"):
        return "Çamaşır Makinesi Dolabı"
    if has("lavabolu", "banyo dolab", "banyo alt", "banyo üst", "banyo boy"):
        return "Banyo Dolabı"
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


def extract_merchant_id(url):
    """Trendyol URL'sinden merchantId'yi çıkar (...&merchantId=XXXXXX&...)."""
    m = re.search(r"merchantId=(\d+)", url or "")
    return m.group(1) if m else None


def filter_roomart_only(snapshots):
    """
    NON-FURNITURE FİLTRE: merchantId'i RoomArt'a (362387) ait OLMAYAN tüm ürünleri
    her günün snapshot'ından ele. merchantId hiç parse edilemeyen ürünler de elenir
    (mobilya dışı gürültü: iPhone gibi farklı satıcı/URL'den sızanlar).
    Okuma katmanında yapılır ki kaynak (tek-dosya veya delta) ne olursa olsun yakalansın.
    """
    dropped = 0
    cleaned = {}
    for day, products in snapshots.items():
        kept = {}
        for pid, raw in products.items():
            if extract_merchant_id(raw.get("url", "")) == ROOMART_MERCHANT_ID:
                kept[pid] = raw
            else:
                dropped += 1
        cleaned[day] = kept
    if dropped:
        logger.info(f"[FİLTRE] {dropped} non-RoomArt ürün elendi")
    return cleaned


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
                return filter_roomart_only(days)
    except Exception as e:
        logger.info(f"snapshot_utils yok/atlandı ({e}); tek-dosya formatına düşülüyor.")

    # (a) tek dosya
    data = load_json("snapshots.json", default={})
    return filter_roomart_only(data)


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
def category_share_basis(cat_products):
    """
    Kategorinin pazar-payı tabanını seç:
      • "sales"   : kategoride GERÇEK satış (net_units) varsa → satış payı (tercih).
      • "reviews" : satış yoksa → eski deg (yorum sayısı) payına düş (geri uyumlu).
    Trendyol API satış verisi (trendyol_sales.json) yoksa tüm kategoriler "reviews"a düşer.
    """
    return "sales" if sum(p.get("units", 0) for p in cat_products) > 0 else "reviews"


def calculate_market_share(product, cat_products, basis):
    """
    Pazar Payı (X), 0-100. Taban kategoriye göre (bkz. category_share_basis):
      • "sales"  : kategori-içi net satış adedi payı (en çok satan ~100).
      • "reviews": kategori-içi değerlendirme (deg) payı (eski davranış).
    Kategori-içi maksimuma göre normalize edilir.
    """
    key = "units" if basis == "sales" else "deg"
    max_v = max((p.get(key, 0) for p in cat_products), default=0)
    if max_v <= 0:
        return 0.0
    return round(normalize(product.get(key, 0), 0, max_v), 2)


def calculate_growth(product, category, snapshots, day_keys, trends_cats):
    """
    Büyüme (Y):
      • Momentum kaynağı: GERÇEK SATIŞ momentumu (sales_momentum = son7g vs önceki7g
        satış adedi, trendyol_sync.py) varsa onu; yoksa eski deg_momentum (yorum
        sayısı). Hangisinin kullanıldığı `growth_basis` ("sales"|"reviews") ile işaretlenir.
      • Gerçek Trends'i olan kategori : 0.5 * Trends_büyüme + 0.5 * momentum
      • Trends'i OLMAYAN kategori     : sadece momentum (suni nötr-50 Trends bileşeni
        KULLANILMAZ; bu kategoriler ayrıca medyan eşikten hariç tutulur)
    """
    t_score, has_trends = trends_growth_score(category, trends_cats)
    sm = product.get("sales_momentum")
    if sm is not None:                       # gerçek satış momentumu (tercih)
        m_score, has_momentum, growth_basis = float(sm), True, "sales"
    else:                                    # geri uyum: yorum (deg) momentumu
        pid = extract_product_id(product["url"])
        m_score, has_momentum = compute_deg_momentum(pid, snapshots, day_keys)
        growth_basis = "reviews"
    if has_trends:
        growth = 0.5 * t_score + 0.5 * m_score
    else:
        growth = m_score
    return round(growth, 2), has_trends, has_momentum, growth_basis


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


def confidence_level(has_trends, has_momentum, n_days, growth_basis="reviews"):
    """
    Büyüme güveni. SATIŞ momentumu tek çekimde gerçektir (snapshot gün sayısına bağlı
    değil) → yüksek güven. deg momentumu ise yeterli snapshot günü ister.
    """
    if growth_basis == "sales":
        return "high" if has_trends else "medium"
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
        has_real_trends = bool(tkey and tkey in trends_cats)
        if has_real_trends:
            td = trends_cats[tkey]
            trend_score = round(min(100.0, td.get("ortalama", 50)), 1)
            trend_growth = round(td.get("buyume_yuzde", 0.0), 1)
        else:
            trend_score, trend_growth = 50.0, 0.0
        # trends_source: kullanılan trends_sonuc anahtarı (yoksa null).
        # growth_axis_active (kategori-bazlı): büyüme ekseni gerçek Trends'e mi dayanıyor?
        trends_source = tkey if has_real_trends else None
        cat_growth_axis_active = has_real_trends

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
            "trends_source": trends_source,
            "growth_axis_active": cat_growth_axis_active,
            "confidence": cat_conf,
        })

    # KPI kadran sayıları ÜRÜN-bazlı (matris ürün-bazlı; "STAR PRODUCTS" = STAR ürün sayısı).
    # quadrant_dist kategori-bazlıydı → KPI ile matris çelişiyordu (QM 0 ama matris dolu).
    prod_q = {"STAR": 0, "CASH_COW": 0, "QUESTION_MARK": 0, "DOG": 0}
    for p in scored:
        prod_q[p["bcg_class"]] = prod_q.get(p["bcg_class"], 0) + 1

    kpis = {
        "total_categories": len(categories),
        "total_products": len(scored),
        "star_products": prod_q["STAR"],
        "cash_cows": prod_q["CASH_COW"],
        "question_marks": prod_q["QUESTION_MARK"],
        "dogs": prod_q["DOG"],
        "risk_products": prod_q["DOG"] + prod_q["QUESTION_MARK"],
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

    # Gerçek satış verisi (Trendyol API → trendyol_sync.py). PUBLIC repo'ya commit
    # EDİLMEZ (.gitignore); CI'da analiz öncesi üretilir. Yoksa pay deg'e düşer.
    sales_doc = load_json("trendyol_sales.json", default={})
    sales_by_product = sales_doc.get("sales_by_product", {})
    if sales_by_product:
        logger.info(f"Satış verisi yüklendi: {len(sales_by_product)} ürün (pazar payı = gerçek satış).")
    else:
        logger.warning("trendyol_sales.json yok/boş — pazar payı YORUM (deg) tabanına düşüyor.")

    # ── Ürün evreni = AKTİF Trendyol kataloğu (on_sale=True), snapshot ile zenginleştirilir ──
    # AKTİF filtre: yalnız satışta (on_sale=True) ürünler analize girer. Trendyol'da bir ürün
    # pasif edilince veya stoğu bitince on_sale=False olur → günlük sync TAZE çektiği için
    # aktif/pasif değişimi otomatik yansır (yeni ürün aktifse listeye girer, pasifse düşer).
    # Tablo = tüm aktif ürünler; BCG matrisi = aktif ∩ SİNYAL-taşıyan (snapshot'ta yorum VEYA
    # gerçek satış). Aktif ama sinyalsiz ürünler tabloda görünür, skoru None'dur.
    api_products = sales_doc.get("products", {})  # contentId → {title, sale_price, stock, on_sale, ...}
    active_api = {pid: a for pid, a in api_products.items() if a.get("on_sale") is True}
    if api_products:
        logger.info(f"API kataloğu: {len(api_products)} ürün → {len(active_api)} AKTİF (on_sale=True); "
                    f"{len(api_products) - len(active_api)} pasif/stoksuz analiz DIŞI.")

    # Evren = aktif API ürünleri. API yoksa (sync başarısız) snapshot'a düş — aktif filtre
    # uygulanamaz ama analiz çökmesin (graceful degradation).
    all_pids = set(active_api.keys()) if active_api else set(current.keys())
    products = []
    excluded = 0
    for pid in all_pids:
        mapped = category_map.get(pid)
        if mapped == EXCLUDE_TOKEN:
            excluded += 1            # mobilya dışı/gürültü: analizden tamamen çıkar
            continue
        raw = current.get(pid)            # snapshot (scrape) — varsa puan/deg/fiyat/kod/url
        api = api_products.get(pid, {})   # API katalog — fiyat/stok/title/stockCode/url
        name = (raw["ad"] if raw and raw.get("ad") else api.get("title")) or ""
        cat = mapped or categorize(name)
        # satış net adedi + momentum (pid = productContentId = sales_by_product anahtarı)
        srec = sales_by_product.get(pid, {})
        units = int(srec.get("net_units", 0) or 0)
        sales_momentum = srec.get("sales_momentum")  # None ise büyüme deg'e düşer
        # scrape öncelikli (görünen fiyat/yorum); snapshot'ta yoksa API'den
        price = (raw.get("fiyat") if raw else None) or api.get("sale_price") or 0.0
        rating = raw.get("puan", 0.0) if raw else 0.0
        review_count = raw.get("deg", 0) if raw else 0
        kod = (raw.get("kod") if raw else None) or api.get("stock_code")
        url = (raw.get("url") if raw else None) or api.get("product_url") or ""
        stock = api.get("stock")          # API quantity (snapshot'ta yok); None → tabloda "—"
        # SİNYAL: snapshot'ta var (yorum verisi) VEYA gerçek satış>0 → matriste skorlanır.
        has_signal = (raw is not None) or units > 0
        products.append({
            "id": pid,
            "name": name,
            "category": cat,
            "price": price,
            "rating": rating,
            "review_count": review_count,
            "kod": kod,                       # Trendyol ürün kodu (scrape v1.1 veya API stockCode)
            "url": url,
            "stock": stock,                   # API stok adedi (envanter görünürlüğü)
            # iç hesaplama alanları (frontend'e gitmez)
            "fiyat": price,
            "puan": rating,
            "deg": review_count,
            "units": units,                   # gerçek net satış adedi (pazar payı tabanı)
            "sales_momentum": sales_momentum, # gerçek satış momentumu (büyüme tabanı; None→deg)
            "_signal": has_signal,            # True → matriste skorlanır; False → pasif (tablo-only)
        })

    # Matris/skor evreni = sinyalli ürünler (DİĞER de tek kategori gibi yer alır; Trends köprüsü
    # yok → büyüme nötr). Sinyalsiz pasif ürünler skorlanmaz (payload'da bcg_class=None).
    # EXCLUDE edilenler zaten yukarıda `products`'a hiç girmedi (EXCLUDE ≠ DİĞER ≠ pasif).
    scored = []
    analyzable = [p for p in products if p["_signal"]]
    passive_count = len(products) - len(analyzable)
    logger.info(f"Ürün evreni: {len(products)} AKTİF tablo | {len(analyzable)} sinyalli "
                f"(matris/skor) | {passive_count} aktif-pasif (tablo-only, skorsuz).")
    by_cat = {}
    for p in analyzable:
        by_cat.setdefault(p["category"], []).append(p)

    # Pazar-payı tabanı kategori bazında (satış varsa "sales", yoksa "reviews")
    cat_basis = {cat: category_share_basis(cps) for cat, cps in by_cat.items()}

    for p in analyzable:
        cat_products = by_cat[p["category"]]
        basis = cat_basis[p["category"]]
        share = calculate_market_share(p, cat_products, basis)
        growth, has_trends, has_momentum, growth_basis = calculate_growth(
            p, p["category"], snapshots, day_keys, trends_cats)
        p["_share"], p["_growth"] = share, growth
        p["_share_basis"] = basis
        p["_growth_basis"] = growth_basis
        p["_has_trends"], p["_has_momentum"] = has_trends, has_momentum

    # Göreli eşik = portföy medyanı.
    #   • Pay (X): tüm analiz edilebilir ürünlerin medyanı (X eksenine dokunulmaz).
    #   • Büyüme (Y): SADECE gerçek Trends verisi olan kategorilerin medyanı; Trends'siz
    #     kategoriler (momentum-only) eşiği bozmasın diye hariç. Hiç Trends'li ürün
    #     yoksa tüm ürünlere düş (defensive).
    share_thr = statistics.median([p["_share"] for p in analyzable]) if analyzable else 50
    trends_growths = [p["_growth"] for p in analyzable if p["_has_trends"]]
    if trends_growths:
        growth_thr = statistics.median(trends_growths)
    elif analyzable:
        growth_thr = statistics.median([p["_growth"] for p in analyzable])
    else:
        growth_thr = 50
    logger.info(f"Eşikler (medyan): pay={share_thr:.1f}, büyüme={growth_thr:.1f} "
                f"(büyüme medyanı {len(trends_growths)} Trends'li üründen)")

    for p in analyzable:
        bcg = classify_bcg(p["_share"], p["_growth"], share_thr, growth_thr)
        rec = generate_recommendation(p, bcg, by_cat[p["category"]])
        conf = confidence_level(p["_has_trends"], p["_has_momentum"], n_days, p["_growth_basis"])
        scored.append({
            "id": p["id"], "name": p["name"], "category": p["category"],
            "price": p["price"], "rating": p["rating"], "review_count": p["review_count"],
            "url": p["url"], "puan": p["puan"],
            "share_score": p["_share"], "growth_score": p["_growth"],
            "share_basis": p["_share_basis"],   # "sales" | "reviews" (ham satış değil)
            "growth_basis": p["_growth_basis"], # "sales" | "reviews" (momentum kaynağı)
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
            "kod": p.get("kod"),
            "url": p["url"],
            "stock": p.get("stock"),         # API stok adedi (envanter; pasif üründe de dolu)
            # skor alanları — sinyalli ürünler skorlu; pasif (sinyalsiz) ürünlerde None
            "share_score": sc["share_score"] if sc else None,
            "growth_score": sc["growth_score"] if sc else None,
            "share_basis": sc["share_basis"] if sc else None,
            "growth_basis": sc["growth_basis"] if sc else None,
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
    # KPI ayrımı: "Total Products" = tam katalog (tablo evreni, ~999);
    # "Scored" = matriste skorlanan sinyalli ürünler (~261; quadrant toplamıyla tutarlı).
    payload["kpis"]["total_products"] = len(products_payload)
    payload["kpis"]["scored_products"] = len(scored)

    # Ham skor dosyası (debug/denetim için)
    bcg_scores = {
        "metadata": {
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "total_products": len(scored),          # SİNYALLİ = matriste skorlanan (~254)
            "total_all": len(products_payload),      # tablo = AKTİF ürünler (on_sale=True, ~475)
            "catalog_total": len(products_payload),  # aktif ürün sayısı (tablo evreni)
            "active_total": len(products_payload),   # aktif (on_sale=True) — açık ad
            "passive_count": passive_count,          # aktif ama sinyalsiz (skorsuz; tablo-only)
            "other_count": sum(1 for p in analyzable if p["category"] == OTHER_CATEGORY),  # DİĞER (skorlu)
            "excluded_count": excluded,              # category_map "Hariç Tut" (analiz dışı; DİĞER değil)

            "data_days": n_days,
            "thresholds": {"share": round(share_thr, 1), "growth": round(growth_thr, 1)},
            "quadrant_distribution": payload["quadrant_distribution"],
            # Pazar payı tabanı dökümü (ham satış değil; yalnız "sales"/"reviews" sayısı)
            "growth_basis": {
                "sales": sum(1 for p in scored if p.get("growth_basis") == "sales"),
                "reviews": sum(1 for p in scored if p.get("growth_basis") == "reviews"),
            },
            "share_basis": {
                "sales": sum(1 for p in scored if p.get("share_basis") == "sales"),
                "reviews": sum(1 for p in scored if p.get("share_basis") == "reviews"),
            },
        },
        # Firestore ile parite: tüm ürünler (DİĞER dahil, hepsi skorlu; EXCLUDE hariç)
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
                f"{bcg_scores['metadata']['other_count']} DİĞER (skorlu).")


if __name__ == "__main__":
    main()
