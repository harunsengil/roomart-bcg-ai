"""CLEAR Decision Intelligence motoru — BCG üstüne karar katmanı.

Mevcut BCG çıktısını (data/bcg_scores.json) BOZMADAN okur; her ürün için
5 boyutlu skor + hard-gate kuralları ile önerilen aksiyon üretir.

5 boyut (CLEAR):
  demand_score       Talep İvmesi        ← bcg_scores.growth_score (mevcut)
  competition_score  Rekabet Gücü        ← bcg_scores.share_score  (mevcut; rakip analizi gelince güçlenir)
  profit_score       Kâr Kalitesi        ← data/manual_margin_inputs.csv (manuel)
  operation_score    Operasyonel Uygunluk ← data/manual_operation_inputs.csv (manuel)
  confidence_score   Veri Güveni          ← kaynak güveni − eksik veri cezaları

Çıktı: data/clear_scores.json (+ frontend/public/data/) + Firestore roomart-bcg-dev/clear_latest.

CSV'ler doldurulmadan sistem dürüst davranır: profit/operation=None → güven düşer →
aksiyon "Veriyi Tamamla". Bu KASITLI (negatif marjlı ürüne "Ölçekle" dememek için).

Yerel çalıştırma (repo kökünden):
  python3 backend/clear_engine.py
"""
from __future__ import annotations

import csv
import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR   = Path(__file__).parent.parent / "data"
PUBLIC_DIR = Path(__file__).parent.parent / "frontend" / "public" / "data"

BCG_FILE        = DATA_DIR / "bcg_scores.json"
MARGIN_CSV      = DATA_DIR / "manual_margin_inputs.csv"
OPERATION_CSV   = DATA_DIR / "manual_operation_inputs.csv"
OUT_FILE        = DATA_DIR / "clear_scores.json"

# ── Aksiyon seti (sistem etiketi → Türkçe) ────────────────────────────────────
ACTIONS = {
    "scale":         "Ölçekle",
    "protect":       "Koru ve Güçlendir",
    "test":          "Kontrollü Test Et",
    "fix_margin":    "Marjı Onar",
    "fix_operation": "Önce Operasyonu Onar",
    "reduce_stock":  "Stoku Azalt",
    "prepare_exit":  "Çıkışa Hazırla",
    "complete_data": "Veriyi Tamamla",
    "monitor":       "İzle ve Derinleştir",
}

# Aksiyon kuyruğu öncelik sırası (1 = en acil). "Para kanaması" ve engeller önce.
PRIORITY = {
    "fix_margin":    1,   # negatif marj — kanama
    "fix_operation": 2,   # stok yok / operasyon bloke
    "scale":         3,   # fırsat — güçlü ürün
    "reduce_stock":  4,
    "prepare_exit":  5,
    "test":          6,
    "protect":       7,
    "complete_data": 8,
    "monitor":       9,
}

# ── Kaynak güven katsayıları (doküman §12.2) ──────────────────────────────────
SRC_CONF = {
    "own_api":       0.95,   # kendi Trendyol satış/katalog verisi
    "manual_margin": 0.80,   # manuel doğrulanmış maliyet
    "manual_op":     0.75,   # manuel operasyon
    "competitor":    0.55,   # rakip scraping
    "trends":        0.50,   # Google Trends / proxy
    "estimated":     0.35,   # tahmini
}

# Eksik kritik veri cezaları (doküman §12.3)
PENALTY = {
    "margin_data":                   15,
    "stock_data":                    10,
    "competitor_match_verification": 10,
    "growth_data":                    5,
}

# Kritik marj eşiği (yüzde) — altındaysa "Marjı Onar"
MARGIN_CRITICAL_PCT = 5.0


# ── CSV okuyucular ────────────────────────────────────────────────────────────
def _read_csv(path: Path) -> dict[str, dict]:
    """SKU anahtarlı satır sözlüğü döndür. Dosya yoksa boş dict."""
    if not path.exists():
        logger.warning(f"{path.name} yok — ilgili boyut None kalacak (kullanıcı doldurmalı).")
        return {}
    rows = {}
    with path.open(encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            sku = (row.get("sku") or "").strip()
            if sku and not sku.startswith("#"):
                rows[sku] = row
    logger.info(f"{path.name}: {len(rows)} satır okundu.")
    return rows


def _f(row: dict, key: str, default: float = 0.0) -> float:
    """CSV hücresini güvenli float'a çevir (virgül/boş toleranslı)."""
    raw = (row.get(key) or "").strip().replace(",", ".")
    try:
        return float(raw) if raw else default
    except ValueError:
        return default


def _has(row: dict, key: str) -> bool:
    """Hücre gerçekten dolu mu? (Boş ≠ 0 — boş 'veri yok' demektir.)"""
    return bool((row.get(key) or "").strip())


# ── Marj / kâr modülü ─────────────────────────────────────────────────────────
def compute_margin(row: dict | None) -> dict:
    """Manuel maliyet satırından katkı marjı + profit_score üret.
    Veri yoksa profit_score=None (missing_data'ya margin_data eklenecek)."""
    if not row:
        return {"profit_score": None, "cm_tl": None, "cm_pct": None, "has_margin": False}

    sale = _f(row, "sale_price")
    # Kritik maliyet girdisi (birim maliyet) DOLU olmalı — yoksa marj bilinemez.
    # (Şablon satırı SKU+fiyat ile ön-dolu gelir; kullanıcı maliyeti girmeden marj YOK.)
    if sale <= 0 or not _has(row, "unit_cost"):
        return {"profit_score": None, "cm_tl": None, "cm_pct": None, "has_margin": False}

    unit_cost = _f(row, "unit_cost")
    commission = _f(row, "commission_tl")
    if commission <= 0:
        commission = sale * _f(row, "commission_rate")
    costs = (unit_cost + commission + _f(row, "shipping_cost") + _f(row, "payment_cost")
             + _f(row, "return_cost") + _f(row, "ad_cost") + _f(row, "discount_cost"))
    cm_tl  = round(sale - costs, 2)
    cm_pct = round(100 * cm_tl / sale, 1)

    # Eşik tablosu (doküman §10.6)
    if cm_pct < 0:      score = 10
    elif cm_pct < 10:   score = 32
    elif cm_pct < 20:   score = 50
    elif cm_pct < 30:   score = 70
    else:               score = 90
    return {"profit_score": score, "cm_tl": cm_tl, "cm_pct": cm_pct, "has_margin": True}


# ── Operasyon modülü ──────────────────────────────────────────────────────────
def compute_operation(row: dict | None, fallback_risk: float | None,
                      fallback_retention: float | None) -> dict:
    """Manuel operasyon satırından operation_score + stock_risk üret.
    Manuel veri yoksa: gerçek iade sinyalinden (risk_rate/net_retention) ZAYIF
    türev üretilir ama stok/tedarik bilinmediği için operation_score None kalır."""
    # Kritik operasyon girdisi (mevcut stok) DOLU olmalı — yoksa operasyon bilinemez.
    if not row or not _has(row, "current_stock"):
        return {"operation_score": None, "stock_risk": "unknown",
                "operation_risk": "unknown", "has_operation": False}

    stock  = _f(row, "current_stock", -1)
    dos    = _f(row, "days_of_stock", -1)          # days_of_stock (elde varsa)
    monthly = _f(row, "monthly_sales_units")
    if dos < 0 and monthly > 0 and stock >= 0:
        dos = stock / (monthly / 30.0)             # türet

    lead   = _f(row, "lead_time_days")
    ret    = _f(row, "return_rate")
    dmg    = _f(row, "damage_rate")
    fissue = (row.get("fulfillment_issue") or "").strip().lower() in ("1", "true", "yes", "evet", "var")
    cap_flag = (row.get("production_capacity_flag") or "").strip().lower() in ("1", "true", "yes", "evet", "var")

    # Stok riski (doküman §11.5)
    if stock == 0:            stock_risk = "high"
    elif 0 <= dos < 15:      stock_risk = "high"
    elif 15 <= dos < 30:     stock_risk = "medium"
    elif dos >= 30:          stock_risk = "low"
    else:                    stock_risk = "unknown"

    # Operasyon skoru — 100'den kırılma
    score = 100
    if stock == 0:                 score -= 45
    elif stock_risk == "high":     score -= 30
    elif stock_risk == "medium":   score -= 12
    if lead > 30:                  score -= 12
    elif lead > 15:                score -= 6
    if ret > 15:                   score -= 15
    elif ret > 8:                  score -= 7
    if dmg > 5:                    score -= 8
    if fissue:                     score -= 12
    if cap_flag:                   score -= 20   # kapasite problemi → ölçekleme bloke edilir
    score = max(0, min(100, score))

    op_risk = "high" if score < 45 else ("medium" if score < 65 else "low")
    return {"operation_score": score, "stock_risk": stock_risk,
            "operation_risk": op_risk, "has_operation": True,
            "capacity_blocked": cap_flag}


# ── Veri güveni ───────────────────────────────────────────────────────────────
def compute_confidence(bcg_conf: str | None, has_margin: bool, has_operation: bool,
                       has_competitor: bool, has_growth: bool) -> tuple[int, list[str]]:
    """Mevcut BCG güven etiketini taban al, eksik kritik veriden ceza düş."""
    base = {"high": 90, "medium": 70, "low": 50}.get(bcg_conf, 40)
    missing = []
    score = base
    if not has_margin:
        score -= PENALTY["margin_data"];                   missing.append("margin_data")
    if not has_operation:
        score -= PENALTY["stock_data"];                    missing.append("operation_data")
    if not has_competitor:
        score -= PENALTY["competitor_match_verification"]; missing.append("competitor_match_verification")
    if not has_growth:
        score -= PENALTY["growth_data"];                   missing.append("growth_data")
    return max(0, min(100, score)), missing


# ── Hard-gate karar kuralları (doküman §9) ────────────────────────────────────
def decide(demand, competition, profit, operation, confidence,
           cm_tl, cm_pct, stock_risk, capacity_blocked) -> str:
    """Sıralı hard-gate. Riskler yüksek skorlarla telafi EDİLMEZ."""
    # 1. Veri güveni düşük
    if confidence < 50:
        return "complete_data"
    # 2. Negatif / kritik marj (marj biliniyorsa)
    if cm_tl is not None and (cm_tl < 0 or (cm_pct is not None and cm_pct < MARGIN_CRITICAL_PCT)):
        return "fix_margin"
    # 3. Operasyon zayıf / stok yok / kapasite bloke
    if capacity_blocked or stock_risk == "high" or (operation is not None and operation < 45):
        return "fix_operation"
    # 4. Ölçekle (tüm boyutlar güçlü) — profit/operation None ise buraya GİRİLEMEZ
    if (demand >= 70 and competition >= 65 and profit is not None and profit >= 65
            and operation is not None and operation >= 65 and confidence >= 70):
        return "scale"
    # 5. Koru ve Güçlendir
    if (competition >= 65 and profit is not None and profit >= 65
            and operation is not None and operation >= 60 and 45 <= demand < 70):
        return "protect"
    # 6. Kontrollü Test Et
    if demand >= 70 and competition < 65 and confidence >= 60:
        return "test"
    # 7. Çıkışa Hazırla
    if (demand < 45 and competition < 45 and profit is not None and profit < 45
            and confidence >= 65):
        return "prepare_exit"
    # 8. Stoku Azalt
    if demand < 50 and stock_risk in ("medium", "high"):
        return "reduce_stock"
    # 9. Net karar yok
    return "monitor"


# ── Karar gerekçesi üretimi ───────────────────────────────────────────────────
def build_reason(action, demand, competition, profit, operation, confidence,
                 cm_pct, missing) -> tuple[str, str, str]:
    """(decision_reason, blocking_issue, first_step) döndür."""
    d = lambda s: "güçlü" if s is not None and s >= 65 else ("orta" if s is not None and s >= 45 else "zayıf")

    reasons = {
        "complete_data": (
            f"Veri güveni düşük ({confidence}); sistem güçlü büyütme veya çıkış kararı önermiyor. "
            f"Eksik: {', '.join(missing) or 'kritik veri'}.",
            "Eksik veri", "Maliyet ve operasyon verisini tamamla"),
        "fix_margin": (
            f"Talep {d(demand)}, rekabet {d(competition)}; ancak katkı marjı düşük "
            f"({cm_pct if cm_pct is not None else '?'}%). Ölçekleme öncesi marj onarılmalı.",
            "Negatif/düşük marj", "Fiyat, maliyet, komisyon ve kargo kırılımını kontrol et"),
        "fix_operation": (
            f"Talep {d(demand)} olsa da operasyon zayıf (stok/tedarik/iade). "
            f"Önce operasyonel süreklilik sağlanmalı.",
            "Stok/operasyon riski", "Stok ve tedarik durumunu düzelt"),
        "scale": (
            f"Talep {d(demand)}, rekabet {d(competition)}, kâr {d(profit)}, operasyon {d(operation)}; "
            f"veri güveni yeterli. Ürün kontrollü ölçeklenebilir.",
            "", "Stok, reklam ve görünürlüğü artır"),
        "protect": (
            f"Rekabet {d(competition)} ve kâr {d(profit)} güçlü, talep dengeli. "
            f"Mevcut pozisyon korunmalı.",
            "", "Fiyat ve stok istikrarını koru, yorum topla"),
        "test": (
            f"Talep {d(demand)} güçlü fakat rekabet pozisyonu belirsiz. "
            f"Küçük bütçeli test yapılmalı.",
            "", "Küçük bütçeli fiyat/reklam/içerik testi başlat"),
        "reduce_stock": (
            f"Talep {d(demand)} düşük ve stok riski mevcut. Stok azaltılmalı.",
            "Düşük talep + stok", "Fiyat indirimi/kampanya ile stok erit"),
        "prepare_exit": (
            f"Talep {d(demand)}, rekabet {d(competition)}, kâr {d(profit)} — hepsi zayıf. "
            f"Ürün portföyden çıkışa hazırlanmalı.",
            "", "Yeni alım durdur, mevcut stoğu tüket"),
        "monitor": (
            f"Net karar için yeterli sinyal yok (talep {d(demand)}, rekabet {d(competition)}). "
            f"İzleme sürmeli.",
            "", "Veri birikimini izle, 2 hafta sonra tekrar değerlendir"),
    }
    return reasons.get(action, ("", "", "İzle"))


# ── Ana akış ──────────────────────────────────────────────────────────────────
def build_clear() -> dict:
    bcg = json.loads(BCG_FILE.read_text(encoding="utf-8"))
    products = bcg.get("products", [])
    logger.info(f"BCG'den {len(products)} ürün okundu.")

    margin_rows = _read_csv(MARGIN_CSV)
    op_rows     = _read_csv(OPERATION_CSV)

    out_products = []
    for p in products:
        sku = (p.get("kod") or "").strip()
        demand      = p.get("growth_score")
        competition = p.get("share_score")
        # share_score bazen 0-100 dışı olabilir → kırp
        if isinstance(competition, (int, float)):
            competition = max(0, min(100, competition))

        m = compute_margin(margin_rows.get(sku))
        o = compute_operation(op_rows.get(sku), p.get("risk_rate"), p.get("net_retention_pct"))

        has_growth = (p.get("growth_basis") or "") not in ("", "neutral", "none", None)
        conf, missing = compute_confidence(
            p.get("confidence"), m["has_margin"], o["has_operation"],
            has_competitor=False, has_growth=has_growth)

        d_val = demand if isinstance(demand, (int, float)) else 0
        c_val = competition if isinstance(competition, (int, float)) else 0

        action = decide(d_val, c_val, m["profit_score"], o["operation_score"], conf,
                        m["cm_tl"], m["cm_pct"], o["stock_risk"], o.get("capacity_blocked", False))
        reason, blocking, first_step = build_reason(
            action, d_val, c_val, m["profit_score"], o["operation_score"], conf, m["cm_pct"], missing)

        data_sources = ["own_api"]
        if m["has_margin"]:    data_sources.append("manual_margin")
        if o["has_operation"]: data_sources.append("manual_op")
        if has_growth:         data_sources.append("trends")

        out_products.append({
            "product_id":   p.get("id"),
            "sku":          sku,
            "product_name": p.get("name"),
            "category":     p.get("category"),
            "url":          p.get("url"),

            "bcg_quadrant":       p.get("bcg_class"),
            "current_bcg_action": (p.get("recommendation") or {}).get("action"),

            "demand_score":      round(d_val, 1) if isinstance(demand, (int, float)) else None,
            "competition_score": round(c_val, 1) if isinstance(competition, (int, float)) else None,
            "profit_score":      m["profit_score"],
            "operation_score":   o["operation_score"],
            "confidence_score":  conf,

            "recommended_action":     action,
            "recommended_action_tr":  ACTIONS[action],
            "action_priority":        PRIORITY[action],
            "decision_reason":        reason,
            "blocking_issue":         blocking,
            "first_step":             first_step,
            "missing_data":           missing,

            "contribution_margin_tl":  m["cm_tl"],
            "contribution_margin_pct": m["cm_pct"],

            "stock_risk":     o["stock_risk"],
            "operation_risk": o["operation_risk"],

            "match_confidence": None,   # rakip analizi bağlanınca dolar
            "data_sources":     data_sources,
        })

    # Özet sayaçları
    summary = {a: 0 for a in ACTIONS}
    for op in out_products:
        summary[op["recommended_action"]] += 1
    confs = [op["confidence_score"] for op in out_products if op["confidence_score"] is not None]
    avg_conf = round(sum(confs) / len(confs), 1) if confs else 0
    # "veri var mı" = GERÇEKTEN skor üretilmiş ürün var mı (boş CSV satırı sayılmaz)
    n_margin = sum(1 for op in out_products if op["profit_score"] is not None)
    n_op     = sum(1 for op in out_products if op["operation_score"] is not None)

    return {
        "metadata": {
            "generated_at":  datetime.now(timezone.utc).isoformat(),
            "total_products": len(out_products),
            "action_summary": summary,
            "avg_confidence": avg_conf,
            "margin_filled_count": n_margin,
            "operation_filled_count": n_op,
            "has_margin_data": n_margin > 0,
            "has_operation_data": n_op > 0,
            "note": "CLEAR karar katmanı — BCG üstüne. profit/operation manuel CSV ister.",
        },
        "products": out_products,
    }


def save_to_firestore(payload: dict) -> None:
    sa = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not sa:
        logger.warning("FIREBASE_SERVICE_ACCOUNT yok — Firestore yazımı atlanıyor.")
        return
    # KORUMA: Marj/operasyon verisi YOKKEN Firestore'a yazma. CSV'ler yerel+gizli;
    # bulut CI'da CSV olmadığı için CLEAR marjsız üretilir → yereldeki (marjlı) sürümü
    # EZMEMELİ. Anlamlı yazım yalnız gerçek manuel veriyle (yerel çalıştırma) yapılır.
    m = payload.get("metadata", {})
    if not (m.get("has_margin_data") or m.get("has_operation_data")):
        logger.warning("Marj/operasyon verisi yok — Firestore yazımı atlanıyor "
                       "(marjsız sürüm private clear_latest'i ezmesin).")
        return
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as fs
        if not firebase_admin._apps:
            firebase_admin.initialize_app(credentials.Certificate(json.loads(sa)))
        db = fs.client()
        db.collection("roomart-bcg-dev").document("clear_latest").set(payload)
        logger.info("Firestore write OK: roomart-bcg-dev/clear_latest")
    except Exception as e:
        logger.error(f"Firestore write failed: {e}")


def run() -> None:
    logger.info("CLEAR motoru başlıyor...")
    payload = build_clear()

    DATA_DIR.mkdir(exist_ok=True)
    OUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info(f"Kaydedildi: {OUT_FILE}")

    if PUBLIC_DIR.exists():
        (PUBLIC_DIR / "clear_scores.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info(f"Kopyalandı: {PUBLIC_DIR / 'clear_scores.json'}")

    s = payload["metadata"]["action_summary"]
    logger.info("Aksiyon dağılımı:")
    for a, n in sorted(s.items(), key=lambda x: PRIORITY[x[0]]):
        if n:
            logger.info(f"  {ACTIONS[a]:<22} {n:>4}")
    logger.info(f"Ortalama veri güveni: {payload['metadata']['avg_confidence']}")

    save_to_firestore(payload)


if __name__ == "__main__":
    run()
