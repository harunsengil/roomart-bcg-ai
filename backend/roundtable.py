#!/usr/bin/env python3
"""
RoomArt BCG Intelligence — AI Roundtable Batch Runner
3 Ajan: Pazarlama Direktörü + IT Direktörü + Strateji Direktörü
Sonuçlar Firebase Realtime Database'e yazılır.
"""

import json
import logging
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
FIREBASE_URL = "https://roomart-bcg-ai-default-rtdb.europe-west1.firebasedatabase.app"
FIREBASE_PATH = "/bcg_roundtable"

SIRKET = "Akar Mutfak Mobilyaları (Bursa/Mustafakemalpaşa)"
RAKIPLER = "Rani Mobilya, Kenzlife, Bofigo"

PRODUCTS = [
    "Çamaşır Makinesi Dolabı",
    "Banyo Dolabı",
    "Mutfak Adası",
    "Kitaplıklı Çalışma Masası",
    "Sehpa",
]

AGENT_SYSTEMS = {
    "mkt": f"""Sen {SIRKET} şirketinin Pazarlama Direktörüsün.
Türk mobilya e-ticaret pazarını yakından takip ediyorsun. Rakipler: {RAKIPLER}.
Görevin: Verilen ürün kategorisi için pazar büyüme tahmini (%),
rekabetçi konumlama ve göreli pazar payı analizi yap.
2 kısa paragraf, somut sayısal tahminlerle. Türkçe yaz.""",

    "it": f"""Sen {SIRKET} şirketinin IT Direktörüsün.
Firebase Firestore tabanlı bir BCG Intelligence dashboard'u inşa ediyorsunuz.
Görevin: Pazarlama direktörünün analizindeki veri güvenilirliğini değerlendir.
Hangi veriler güvenilir, hangileri eksik veya tahmini?
Dashboard'da görüntülenebilecek metrikleri sırala.
2 kısa paragraf. Türkçe yaz.""",

    "cso": f"""Sen {SIRKET} şirketinin Strateji Direktörüsün. BCG Growth-Share Matrix uzmanısın.
YALNIZCA aşağıdaki JSON formatında yanıt ver, başka hiçbir şey yazma:
{{
  "bcg": "Star|Cash Cow|Question Mark|Dog",
  "gerekce": "max 1 cümle",
  "strateji": "max 1 cümle",
  "metrikler": ["metrik1", "metrik2", "metrik3"]
}}""",
}


def call_claude(api_key: str, system: str, messages: list, retries: int = 3) -> str:
    headers = {
        "Content-Type": "application/json",
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
    }
    payload = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 1000,
        "system": system,
        "messages": messages,
    }
    for attempt in range(retries):
        try:
            resp = requests.post(ANTHROPIC_API_URL, headers=headers, json=payload, timeout=60)
            resp.raise_for_status()
            return resp.json()["content"][0]["text"]
        except requests.HTTPError as e:
            err = resp.json().get("error", {})
            logger.error(f"Claude API error (attempt {attempt+1}): {err.get('message', e)}")
            if resp.status_code == 429:
                time.sleep(30)
            elif attempt == retries - 1:
                raise
        except Exception as e:
            logger.error(f"Request error (attempt {attempt+1}): {e}")
            if attempt == retries - 1:
                raise
            time.sleep(5)
    return ""


def parse_bcg(text: str) -> str:
    t = text.upper()
    if "STAR" in t or "YILDIZ" in t:
        return "Star"
    if "CASH" in t or "NAKİT" in t or "NAKIT" in t:
        return "Cash Cow"
    if "QUESTION" in t or "SORU" in t:
        return "Question Mark"
    return "Dog"


def analyze_product(api_key: str, product: str) -> dict:
    logger.info(f"  [Tur 1] Pazarlama Direktörü — {product}")
    mkt = call_claude(
        api_key,
        AGENT_SYSTEMS["mkt"],
        [{"role": "user", "content": f'BCG analizi için: "{product}" — pazar büyümesi ve rekabetçi konum değerlendirmesi.'}],
    )

    logger.info(f"  [Tur 2] IT Direktörü — {product}")
    it = call_claude(
        api_key,
        AGENT_SYSTEMS["it"],
        [{"role": "user", "content": f'Ürün: "{product}"\n\nPazarlama analizi:\n{mkt}\n\nVeri güvenilirliği ve eksiklikleri değerlendir.'}],
    )

    logger.info(f"  [Tur 3] Strateji Direktörü — {product}")
    cso_raw = call_claude(
        api_key,
        AGENT_SYSTEMS["cso"],
        [{"role": "user", "content": f'Ürün: "{product}"\nPazarlama: {mkt[:400]}\nIT: {it[:300]}\n\nBCG kararı ver.'}],
    )

    try:
        clean = cso_raw.replace("```json", "").replace("```", "").strip()
        cso = json.loads(clean)
    except json.JSONDecodeError:
        logger.warning(f"  JSON parse hatası, fallback kullanılıyor")
        cso = {
            "bcg": parse_bcg(cso_raw),
            "gerekce": cso_raw[:150],
            "strateji": "—",
            "metrikler": [],
        }

    return {
        "product": product,
        "bcgSquare": cso.get("bcg", parse_bcg(cso.get("gerekce", ""))),
        "rationale": cso.get("gerekce", ""),
        "strategy": cso.get("strateji", ""),
        "metrics": cso.get("metrikler", []),
        "mktSummary": mkt[:600],
        "itSummary": it[:400],
        "analyzedAt": datetime.now(timezone.utc).isoformat(),
    }


def write_firebase(data: dict, product: str) -> bool:
    key = product.replace(" ", "_").replace("ç", "c").replace("Ç", "C") \
                 .replace("ğ", "g").replace("Ğ", "G").replace("ı", "i") \
                 .replace("İ", "I").replace("ö", "o").replace("Ö", "O") \
                 .replace("ş", "s").replace("Ş", "S").replace("ü", "u").replace("Ü", "U")
    url = f"{FIREBASE_URL}{FIREBASE_PATH}/{key}.json"
    try:
        resp = requests.put(url, json=data, timeout=15)
        return resp.ok
    except Exception as e:
        logger.error(f"Firebase write error: {e}")
        return False


def write_firebase_summary(results: list) -> bool:
    summary = {
        "products": results,
        "totalAnalyzed": len(results),
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "bcgDistribution": {
            "Star": sum(1 for r in results if r.get("bcgSquare") == "Star"),
            "Cash Cow": sum(1 for r in results if r.get("bcgSquare") == "Cash Cow"),
            "Question Mark": sum(1 for r in results if r.get("bcgSquare") == "Question Mark"),
            "Dog": sum(1 for r in results if r.get("bcgSquare") == "Dog"),
        },
    }
    url = f"{FIREBASE_URL}{FIREBASE_PATH}/summary.json"
    try:
        resp = requests.put(url, json=summary, timeout=15)
        return resp.ok
    except Exception as e:
        logger.error(f"Firebase summary write error: {e}")
        return False


def main():
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise ValueError("ANTHROPIC_API_KEY environment variable is not set")

    logger.info("=" * 60)
    logger.info("RoomArt BCG Roundtable — Batch Analysis başlıyor")
    logger.info(f"Ürün sayısı: {len(PRODUCTS)}")
    logger.info("=" * 60)

    results = []
    success = 0
    errors = 0

    for i, product in enumerate(PRODUCTS):
        logger.info(f"\n[{i+1}/{len(PRODUCTS)}] {product}")
        try:
            result = analyze_product(api_key, product)
            results.append(result)

            ok = write_firebase(result, product)
            if ok:
                logger.info(f"  ✓ Firebase yazıldı → {FIREBASE_PATH}/{product[:20]}…")
            else:
                logger.warning(f"  ⚠ Firebase yazma başarısız")

            logger.info(f"  BCG: {result['bcgSquare']} | Strateji: {result['strategy'][:60]}…")
            success += 1

        except Exception as e:
            logger.error(f"  ✗ Hata: {e}")
            errors += 1

        if i < len(PRODUCTS) - 1:
            logger.info("  ⏳ 5 sn bekleniyor (rate limit)…")
            time.sleep(5)

    if results:
        ok = write_firebase_summary(results)
        if ok:
            logger.info(f"\n✓ Summary Firebase'e yazıldı → {FIREBASE_PATH}/summary")

    logger.info("\n" + "=" * 60)
    logger.info(f"Batch tamamlandı — {success} başarı, {errors} hata")
    logger.info(f"Firebase: {FIREBASE_URL}{FIREBASE_PATH}")
    logger.info("=" * 60)

    if errors > 0:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
