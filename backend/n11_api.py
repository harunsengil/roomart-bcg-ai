"""n11 Marketplace SOAP API istemcisi (RoomArt satıcı hesabı).

Kimlik bilgileri YALNIZCA ortam değişkenlerinden okunur:
  N11_APP_KEY     — n11 Satıcı Paneli → API Entegrasyonu → App Key
  N11_APP_SECRET  — n11 Satıcı Paneli → API Entegrasyonu → App Secret

n11 API SOAP tabanlı; requests + xml.etree ile çalışır, zeep gerekmez.

Yerel test:
  source backend/.env.n11.local && python3 backend/n11_api.py
"""
from __future__ import annotations

import logging
import os
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta

import requests

logger = logging.getLogger(__name__)

BASE_URL    = "https://api.n11.com/ws"
PRODUCT_SVC = f"{BASE_URL}/ProductService"
ORDER_SVC   = f"{BASE_URL}/OrderService"

RETRY_STATUSES = {429, 500, 502, 503, 504}
MAX_RETRIES    = 3
BACKOFF_BASE   = 2.0

NS = "http://www.n11.com/ws/schemas"


class N11AuthError(RuntimeError):
    """appKey/appSecret geçersiz veya hesap API erişimine kapalı."""


def _config() -> tuple[str, str]:
    key    = os.environ.get("N11_APP_KEY", "").strip()
    secret = os.environ.get("N11_APP_SECRET", "").strip()
    missing = [n for n, v in [("N11_APP_KEY", key), ("N11_APP_SECRET", secret)] if not v]
    if missing:
        raise SystemExit("Eksik ortam değişkeni: " + ", ".join(missing))
    return key, secret


def _auth_header(key: str, secret: str) -> str:
    return f"""<sch:auth xmlns:sch="{NS}">
      <sch:appKey>{key}</sch:appKey>
      <sch:appSecret>{secret}</sch:appSecret>
    </sch:auth>"""


def _soap_envelope(header_xml: str, body_xml: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:sch="{NS}">
  <soapenv:Header>{header_xml}</soapenv:Header>
  <soapenv:Body>{body_xml}</soapenv:Body>
</soapenv:Envelope>"""


def _post(endpoint: str, body_xml: str, key: str, secret: str) -> ET.Element:
    envelope = _soap_envelope(_auth_header(key, secret), body_xml)
    headers  = {"Content-Type": "text/xml; charset=UTF-8", "SOAPAction": ""}
    for attempt in range(MAX_RETRIES + 1):
        try:
            r = requests.post(endpoint, data=envelope.encode("utf-8"),
                              headers=headers, timeout=30)
            if r.status_code in (401, 403):
                raise N11AuthError(f"n11 auth hatası {r.status_code}: {r.text[:300]}")
            if r.status_code in RETRY_STATUSES and attempt < MAX_RETRIES:
                time.sleep(BACKOFF_BASE ** attempt)
                continue
            r.raise_for_status()
            root = ET.fromstring(r.content)
            # Hata kodu kontrolü (n11 200 döndürüp body'de hata bildirebilir)
            err = root.find(".//{%s}errorCode" % NS) or root.find(".//errorCode")
            if err is not None and err.text not in (None, "0", ""):
                msg_el = root.find(".//{%s}errorMessage" % NS) or root.find(".//errorMessage")
                raise RuntimeError(f"n11 API hatası {err.text}: {msg_el.text if msg_el is not None else ''}")
            return root
        except (N11AuthError, RuntimeError):
            raise
        except Exception as e:
            if attempt < MAX_RETRIES:
                time.sleep(BACKOFF_BASE ** attempt)
                continue
            raise RuntimeError(f"n11 isteği başarısız: {e}") from e
    return ET.Element("empty")


def _text(el: ET.Element | None) -> str:
    return (el.text or "").strip() if el is not None else ""


def _find(root: ET.Element, *tags: str) -> ET.Element | None:
    for tag in tags:
        el = root.find(f".//{{{NS}}}{tag}") or root.find(f".//{tag}")
        if el is not None:
            return el
    return None


# ── Ürün kataloğu ─────────────────────────────────────────────────────────────

def fetch_products(key: str, secret: str) -> list[dict]:
    """Tüm onaylı ürünleri sayfalayarak çek."""
    products, page, page_size = [], 0, 100
    logger.info("n11 ürün kataloğu çekiliyor...")
    while True:
        body = f"""<sch:GetProductListRequest>
          <sch:pagingData>
            <sch:currentPage>{page}</sch:currentPage>
            <sch:pageSize>{page_size}</sch:pageSize>
          </sch:pagingData>
        </sch:GetProductListRequest>"""
        root = _post(PRODUCT_SVC, body, key, secret)

        items = root.findall(f".//{{{NS}}}product") or root.findall(".//product")
        if not items:
            break

        for item in items:
            def t(tag: str) -> str: return _text(_find(item, tag))
            # Barkod: n11'de birden fazla olabilir → ilkini al
            barcodes = item.findall(f".//{{{NS}}}barcode") or item.findall(".//barcode")
            barcode  = _text(barcodes[0]) if barcodes else ""
            price_raw = t("displayPrice") or t("price") or t("buyingPrice") or "0"
            try:
                price = float(str(price_raw).replace(",", "."))
            except ValueError:
                price = 0.0

            products.append({
                "product_id":   t("id"),
                "product_code": t("productCode"),   # satıcı SKU kodu
                "barcode":      barcode,
                "title":        t("title") or t("displayName"),
                "price":        price,
                "stock":        t("stockAmount") or t("quantity"),
                "status":       t("status") or t("approvalStatus"),
                "url":          t("productUrl") or t("canonicalUrl"),
            })

        logger.info(f"  sayfa {page}: {len(items)} ürün ({len(products)} toplam)")
        if len(items) < page_size:
            break
        page += 1
        time.sleep(0.4)

    logger.info(f"n11 katalog toplam: {len(products)} ürün")
    return products


# ── Siparişler ────────────────────────────────────────────────────────────────

def fetch_orders(key: str, secret: str, days_back: int = 90) -> list[dict]:
    """Son N günlük siparişleri çek."""
    end   = datetime.now(timezone.utc)
    begin = end - timedelta(days=days_back)
    fmt   = "%d/%m/%Y %H:%M:%S"

    orders, page, page_size = [], 0, 100
    logger.info(f"n11 siparişler çekiliyor ({begin.strftime('%Y-%m-%d')} → {end.strftime('%Y-%m-%d')})...")
    while True:
        body = f"""<sch:GetOrderListRequest>
          <sch:searchData>
            <sch:period>
              <sch:startDate>{begin.strftime(fmt)}</sch:startDate>
              <sch:endDate>{end.strftime(fmt)}</sch:endDate>
            </sch:period>
            <sch:sortForUpdateDate>true</sch:sortForUpdateDate>
          </sch:searchData>
          <sch:pagingData>
            <sch:currentPage>{page}</sch:currentPage>
            <sch:pageSize>{page_size}</sch:pageSize>
          </sch:pagingData>
        </sch:GetOrderListRequest>"""
        root = _post(ORDER_SVC, body, key, secret)

        items = root.findall(f".//{{{NS}}}order") or root.findall(".//order")
        if not items:
            break

        for order in items:
            def t(el: ET.Element, tag: str) -> str: return _text(_find(el, tag))
            lines = order.findall(f".//{{{NS}}}orderItem") or order.findall(".//orderItem")
            orders.append({
                "order_id":   t(order, "id"),
                "order_date": t(order, "createDate"),
                "status":     t(order, "status"),
                "lines": [{
                    "product_id":   t(ln, "productId"),
                    "product_code": t(ln, "productCode"),
                    "product_name": t(ln, "name") or t(ln, "productName"),
                    "quantity":     t(ln, "quantity"),
                    "unit_price":   t(ln, "unitPrice") or t(ln, "price"),
                    "status":       t(ln, "status"),
                } for ln in lines],
            })

        logger.info(f"  sayfa {page}: {len(items)} sipariş ({len(orders)} toplam)")
        total_el = _find(root, "totalCount") or _find(root, "totalRecord")
        total    = int(_text(total_el) or "0")
        if len(orders) >= total or len(items) < page_size:
            break
        page += 1
        time.sleep(0.4)

    logger.info(f"n11 sipariş toplam: {len(orders)}")
    return orders


# ── Doğrulama testi ───────────────────────────────────────────────────────────

if __name__ == "__main__":
    import json
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    key, secret = _config()
    logger.info("n11 API bağlantı testi...")

    prods = fetch_products(key, secret)
    if prods:
        logger.info(f"İlk ürün: {json.dumps(prods[0], ensure_ascii=False, indent=2)}")
    else:
        logger.warning("Ürün bulunamadı.")

    orders = fetch_orders(key, secret, days_back=30)
    if orders:
        logger.info(f"İlk sipariş: {json.dumps(orders[0], ensure_ascii=False, indent=2)}")
    else:
        logger.warning("Sipariş bulunamadı.")
