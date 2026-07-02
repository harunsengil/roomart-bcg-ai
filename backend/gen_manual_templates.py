"""Manuel CSV şablonlarını bcg_scores.json'dan üret (SKU + ad + güncel fiyat ön-dolu).

Kullanıcı yalnız maliyet/operasyon kolonlarını doldurur. Katalog değişince yeniden
çalıştırılabilir; MEVCUT doldurulmuş değerleri KORUR (yeni ürün ekler, eskiyi silmez).

  python3 backend/gen_manual_templates.py
"""
from __future__ import annotations

import csv
import json
from pathlib import Path

DATA_DIR  = Path(__file__).parent.parent / "data"
BCG_FILE  = DATA_DIR / "bcg_scores.json"
MARGIN    = DATA_DIR / "manual_margin_inputs.csv"
OPERATION = DATA_DIR / "manual_operation_inputs.csv"

MARGIN_COLS = ["sku", "product_name", "sale_price", "unit_cost", "commission_rate",
               "commission_tl", "shipping_cost", "payment_cost", "return_cost",
               "ad_cost", "discount_cost", "updated_at", "source_note"]

OP_COLS = ["sku", "product_name", "current_stock", "monthly_sales_units",
           "days_of_stock", "lead_time_days", "return_rate", "damage_rate",
           "fulfillment_issue", "production_capacity_flag", "updated_at", "source_note"]


def _load_existing(path: Path) -> dict[str, dict]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8-sig") as f:
        return {(r.get("sku") or "").strip(): r for r in csv.DictReader(f)
                if (r.get("sku") or "").strip()}


def _write(path: Path, cols: list[str], rows: list[dict]) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r.get(c, "") for c in cols})


def run() -> None:
    bcg = json.loads(BCG_FILE.read_text(encoding="utf-8"))
    # Yalnız aktif + SKU'lu ürünler (BCG sınıfı olan = sinyal taşıyan)
    prods = [p for p in bcg.get("products", []) if (p.get("kod") or "").strip()]

    for path, cols, prefill in [
        (MARGIN, MARGIN_COLS, lambda p: {"sale_price": p.get("price") or ""}),
        (OPERATION, OP_COLS, lambda p: {}),
    ]:
        existing = _load_existing(path)
        rows, seen = [], set()
        for p in prods:
            sku = (p.get("kod") or "").strip()
            if sku in seen:
                continue
            seen.add(sku)
            base = {"sku": sku, "product_name": (p.get("name") or "")[:80]}
            base.update(prefill(p))
            if sku in existing:                 # doldurulmuş değerleri koru
                for c in cols:
                    v = (existing[sku].get(c) or "").strip()
                    if v:
                        base[c] = v
            rows.append(base)
        _write(path, cols, rows)
        kept = sum(1 for s in seen if s in existing)
        print(f"{path.name}: {len(rows)} satır ({kept} mevcut değer korundu)")


if __name__ == "__main__":
    run()
