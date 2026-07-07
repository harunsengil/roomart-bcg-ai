#!/usr/bin/env python3
"""
Google Trends → data/trends_sonuc.json
Her kategori AYRI sorgulanır → her biri kendi 0-100 ölçeğinde normalize edilir
(toplu sorguda düşük hacimli kategoriler eziliyor).

Çalıştır: python3 backend/trends_fetch.py
CI: scrape.yml Mac runner'da Pazartesi çalışır.
"""
import json, time, logging, sys
from datetime import datetime
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"

# Kategori adı → Google Trends TR arama terimi
# Her anahtar kelime kendi ölçeğinde (0-100) ayrı ayrı sorgulanır.
KEYWORDS = {
    "banyo dolabı":              "banyo dolabı",
    "çamaşır makinesi dolabı":   "çamaşır makinesi dolabı",
    "mutfak adası":              "mutfak adası",
    "çalışma masası":            "çalışma masası",
    "sehpa":                     "sehpa",
    "kiler dolabı":              "kiler dolabı",
}

def fetch_one(pt, keyword: str, retries: int = 3):
    """Tek anahtar kelime için son 12 haftalık Google Trends verisi (günlük → haftalık resample).
    429 (rate-limit) durumunda artan bekleme ile yeniden dener."""
    for attempt in range(retries + 1):
        try:
            pt.build_payload([keyword], cat=0, timeframe="today 3-m", geo="TR", gprop="")
            df = pt.interest_over_time()
            break
        except Exception as e:
            if "429" in str(e) and attempt < retries:
                wait = 20 * (attempt + 1)   # 20s, 40s, 60s
                log.warning(f"  {keyword}: 429 rate-limit → {wait}s bekleniyor (deneme {attempt + 1}/{retries})")
                time.sleep(wait)
                continue
            log.error(f"  {keyword}: {e}")
            return None
    try:
        if df.empty or keyword not in df.columns:
            log.warning(f"  {keyword}: boş yanıt")
            return None
        # Günlük → haftalık ortalama, son 12 hafta
        weekly = df[keyword].resample("W").mean().round(1)
        vals = [round(v, 1) for v in weekly.tolist()[-12:]]
        if not vals:
            return None
        ortalama = round(sum(v for v in vals if v) / len(vals), 1)
        maks = max(vals)
        buyume = round((vals[-1] - vals[0]) / max(vals[0], 1) * 100, 1) if vals[0] > 0 else 0
        trend = "Yükseliyor" if vals[-1] > vals[0] else ("Düşüyor" if vals[-1] < vals[0] else "Sabit")
        return {
            "keyword": keyword,
            "ortalama": ortalama,
            "maks": maks,
            "buyume_yuzde": buyume,
            "trend": trend,
            "haftalik": vals,
        }
    except Exception as e:
        log.error(f"  {keyword}: {e}")
        return None

def main():
    try:
        from pytrends.request import TrendReq
    except ImportError:
        log.error("pytrends kurulu değil: pip install pytrends")
        sys.exit(1)

    pt = TrendReq(hl="tr-TR", tz=180, timeout=(10, 30))

    # MEVCUT veriyi yükle → başarısız fetch'ler eski veriyi KAYBETMESİN (merge).
    outpath = DATA_DIR / "trends_sonuc.json"
    kategoriler: dict = {}
    if outpath.exists():
        try:
            kategoriler = json.load(open(outpath, encoding="utf-8")).get("kategoriler", {})
            log.info(f"Mevcut {len(kategoriler)} kategori korunuyor (merge).")
        except Exception:
            kategoriler = {}

    for key, kw in KEYWORDS.items():
        log.info(f"Fetching: {kw} …")
        data = fetch_one(pt, kw)
        if data:
            kategoriler[key] = data   # güncelle (yeni veri eskiyi geçersiz kılar)
            log.info(f"  ✓ avg={data['ortalama']}, trend={data['trend']}, vals={data['haftalik']}")
        else:
            log.warning(f"  ✗ {key} atlandı (mevcut veri korunur)")
        time.sleep(6)  # Rate-limit önlemi (429 riskini azalt)

    if not kategoriler:
        log.error("Hiç veri alınamadı — çıkılıyor.")
        sys.exit(1)

    out = {
        "tarih": datetime.now().strftime("%Y-%m-%d"),
        "geo": "TR",
        "zaman": "last 3 months (bireysel sorgular, kendi ölçeğinde)",
        "kategoriler": kategoriler,
    }
    outpath = DATA_DIR / "trends_sonuc.json"
    with open(outpath, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    log.info(f"✓ {outpath} güncellendi ({len(kategoriler)} kategori)")

if __name__ == "__main__":
    main()
