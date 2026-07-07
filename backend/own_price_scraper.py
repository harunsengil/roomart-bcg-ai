"""Kendi ürünlerimizin n11 (SEPETTE) + Trendyol (kampanya) SON fiyatlarını Playwright ile çeker.

Satıcı API'leri son/sepet fiyatını VERMEZ (kanıtlandı: HB pricings boş, n11/TY kampanya alanı yok)
→ müşterinin ödeyeceği fiyat yalnız ÜRÜN SAYFASINDA. curl 403'ler; Playwright (gerçek tarayıcı,
Mac residential IP) n11+TY'yi aşar. HB DAHİL DEĞİL (Akamai headless'ı da 403'ler). RS zaten API'den doğru.

Girdi:  data/product_registry_public.json (platforms.n11.url, platforms.trendyol.url)
Çıktı:  data/own_final_prices.json → {stock_code: {n11, n11_list, trendyol, trendyol_list, scraped_at}}

Mac + HAFTALIK (scrape.yml). EŞZAMANLI (async, varsayılan 5 paralel).
Test: python3 backend/own_price_scraper.py --limit 8 --verbose
"""
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
REGISTRY = DATA_DIR / "product_registry_public.json"
OUT_FILE = DATA_DIR / "own_final_prices.json"

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")

_PRICE_RE = re.compile(r"(\d{1,3}(?:\.\d{3})*,\d{2})")   # "1.234,56"

def _to_float(tr_price: str) -> float | None:
    try:
        return float(tr_price.replace(".", "").replace(",", "."))
    except (ValueError, AttributeError):
        return None

def _all_prices(text: str) -> list[float]:
    return [v for v in (_to_float(m) for m in _PRICE_RE.findall(text or "")) if v]


# ── Saf parser'lar (sayfa I/O'dan bağımsız → test edilebilir) ───────────────────
def _parse_n11(body: str) -> dict:
    """'SEPETTE X' varsa müşterinin ödeyeceği; yoksa gösterilen satış fiyatı. Kurulum hizmetini dışla."""
    head = body.split("Ek Hizmetler")[0].split("Ürüne Özel Kuponlar")[0]
    out = {"n11": None, "n11_list": None}
    m = re.search(r"SEPETTE\s*" + _PRICE_RE.pattern, head)
    prices = _all_prices(head)
    if m:
        out["n11"] = _to_float(m.group(1))
        pre = _all_prices(head[:m.start()])
        out["n11_list"] = max(pre) if pre else None
    elif prices:
        out["n11"] = min(prices)
        out["n11_list"] = max(prices) if max(prices) > min(prices) else None
    return out

def _parse_ty(state, jsonld_texts, body) -> dict:
    """Görünen satış fiyatı (kampanya dahil). Öncelik: gömülü state → JSON-LD → metin."""
    out = {"trendyol": None, "trendyol_list": None}
    if state:
        pr = ((state.get("product") or {}).get("price")) or {}
        def _val(x): return (x.get("value") or x.get("text")) if isinstance(x, dict) else x
        d, s = _val(pr.get("discountedPrice") or pr.get("sellingPrice")), _val(pr.get("sellingPrice") or pr.get("originalPrice"))
        try:
            if d: out["trendyol"] = float(str(d).replace(",", "."))
            if s: out["trendyol_list"] = float(str(s).replace(",", "."))
        except (ValueError, TypeError):
            pass
        if out["trendyol"]:
            return out
    for t in jsonld_texts or []:
        try:
            data = json.loads(t)
            offers = data.get("offers") if isinstance(data, dict) else None
            p = offers.get("price") if isinstance(offers, dict) else None
            if p:
                out["trendyol"] = float(str(p).replace(",", "."))
                return out
        except Exception:
            pass
    prices = _all_prices((body or "").split("Benzer")[0][:6000])
    if prices:
        out["trendyol"] = min(prices)
        out["trendyol_list"] = max(prices) if max(prices) > min(prices) else None
    return out


# ── async sayfa okuyucular ─────────────────────────────────────────────────────
async def _fetch_n11(page) -> dict:
    return _parse_n11(await page.inner_text("body"))

async def _fetch_ty(page) -> dict:
    state = await page.evaluate("() => window.__PRODUCT_DETAIL_APP_INITIAL_STATE__ || null")
    jsonld = []
    if not (state and ((state.get("product") or {}).get("price"))):
        for sc in await page.query_selector_all('script[type="application/ld+json"]'):
            try:
                jsonld.append(await sc.inner_text())
            except Exception:
                pass
    return _parse_ty(state, jsonld, await page.inner_text("body"))


# ── senkron test yardımcıları (--limit ile doğrulama) ──────────────────────────
def extract_n11(page) -> dict:
    return _parse_n11(page.inner_text("body"))

def extract_ty(page) -> dict:
    state = page.evaluate("() => window.__PRODUCT_DETAIL_APP_INITIAL_STATE__ || null")
    jsonld = [s.inner_text() for s in page.query_selector_all('script[type="application/ld+json"]')]
    return _parse_ty(state, jsonld, page.inner_text("body"))


def load_targets(limit: int | None = None) -> list[dict]:
    doc = json.loads(REGISTRY.read_text(encoding="utf-8"))
    # Yalnız dashboard'da GÖSTERİLEN ürünler (bcg_scores) — koşu süresini makul tut.
    scored = None
    bcg = DATA_DIR / "bcg_scores.json"
    if bcg.exists():
        try:
            scored = {str(p.get("kod") or "").strip()
                      for p in json.loads(bcg.read_text(encoding="utf-8")).get("products", [])}
            scored.discard("")
        except Exception:
            scored = None
    targets = []
    for sc, e in doc.get("products", {}).items():
        if scored is not None and sc not in scored:
            continue
        plats = e.get("platforms", {})
        n11_url = (plats.get("n11") or {}).get("url", "")
        ty_url  = (plats.get("trendyol") or {}).get("url", "")
        n11_url = n11_url if "/urun/" in n11_url else ""
        ty_url  = ty_url if ("/roomart/" in ty_url or "-p-" in ty_url) else ""
        if n11_url or ty_url:
            targets.append({"sc": sc, "name": e.get("name", ""), "n11": n11_url, "ty": ty_url})
    if limit:
        targets = targets[:limit]
    return targets


async def _run_async(targets: list[dict], concurrency: int, verbose: bool, wait_ms: int, delay_ms: int) -> dict:
    """SIRALI + KİBAR. Anti-bot gerçeği: eşzamanlı/hızlı istek IP'yi throttle'lar (kanıtlandı).
    concurrency=1 + ürünler arası gecikme → haftalık koşuda engellenmez. Yüksek concurrency ÖNERİLMEZ."""
    from playwright.async_api import async_playwright
    result, done = {}, [0]
    sem = asyncio.Semaphore(concurrency)
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=["--disable-blink-features=AutomationControlled"])

        async def one(t):
            async with sem:
                ctx = await browser.new_context(user_agent=UA, viewport={"width": 1440, "height": 900},
                                                locale="tr-TR", extra_http_headers={"Accept-Language": "tr-TR,tr;q=0.9"})
                await ctx.add_init_script("Object.defineProperty(navigator,'webdriver',{get:()=>undefined})")
                page = await ctx.new_page()
                rec = {"scraped_at": datetime.now(timezone.utc).isoformat()}
                for plat, url, fn in (("n11", t["n11"], _fetch_n11), ("trendyol", t["ty"], _fetch_ty)):
                    if not url:
                        continue
                    try:
                        r = await page.goto(url, timeout=30000, wait_until="domcontentloaded")
                        await page.wait_for_timeout(wait_ms)
                        if r and r.status == 200:
                            rec.update(await fn(page))
                        else:
                            logger.warning(f"  {t['sc']} {plat}: status {r.status if r else '?'}")
                    except Exception as e:
                        logger.warning(f"  {t['sc']} {plat}: {str(e)[:60]}")
                    await page.wait_for_timeout(delay_ms)   # kibar aralık (throttle önleme)
                await ctx.close()
                result[t["sc"]] = rec
                done[0] += 1
                if verbose:
                    logger.info(f"[{done[0]}/{len(targets)}] {t['sc']} {t['name'][:26]}: "
                                f"n11={rec.get('n11')} · TY={rec.get('trendyol')}")

        await asyncio.gather(*[one(t) for t in targets])
        await browser.close()
    return result


def run(limit: int | None = None, verbose: bool = False, concurrency: int = 1,
        wait_ms: int = 2000, delay_ms: int = 1200) -> None:
    targets = load_targets(limit)
    logger.info(f"Hedef ürün: {len(targets)} (SIRALI, bekleme {wait_ms}ms, aralık {delay_ms}ms)")
    result = asyncio.run(_run_async(targets, concurrency, verbose, wait_ms, delay_ms))
    n11_ok = sum(1 for r in result.values() if r.get("n11"))
    ty_ok  = sum(1 for r in result.values() if r.get("trendyol"))
    out = {"metadata": {"scraped_at": datetime.now(timezone.utc).isoformat(),
                        "count": len(result), "n11_filled": n11_ok, "trendyol_filled": ty_ok,
                        "platforms": ["n11", "trendyol"],
                        "note": "Müşterinin ödeyeceği SON fiyat (n11 sepette / TY kampanya). HB dahil değil (Akamai 403)."},
           "by_stock_code": result}
    OUT_FILE.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    logger.info(f"Kaydedildi: {OUT_FILE} ({len(result)} ürün · n11 {n11_ok} · TY {ty_ok})")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=None)
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--concurrency", type=int, default=1, help="SIRALI önerilir (yüksek=throttle riski)")
    ap.add_argument("--wait", type=int, default=2000, help="sayfa başı bekleme (ms)")
    ap.add_argument("--delay", type=int, default=1200, help="istekler arası kibar aralık (ms)")
    args = ap.parse_args()
    run(limit=args.limit, verbose=args.verbose, concurrency=args.concurrency,
        wait_ms=args.wait, delay_ms=args.delay)
