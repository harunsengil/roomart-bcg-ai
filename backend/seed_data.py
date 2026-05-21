"""
RoomArt BCG Intelligence - Demo Data Seeder
Generates realistic, rich demo data for immediate dashboard use.
Run this to populate data/ without needing live scrapers.
"""
import json
import math
import random
from datetime import datetime, timedelta
from pathlib import Path

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

random.seed(42)

CATEGORIES = [
    {
        "id": "akustik-panel",
        "category": "Akustik Panel",
        "slug": "akustik-panel",
        "trend_profile": {"base": 72, "growth": 28, "volatility": 12},
        "market_profile": {"share": 74, "price_range": (350, 1400), "review_range": (80, 950)},
        "bcg_target": "STAR",
    },
    {
        "id": "duvar-dekor",
        "category": "Duvar Dekor",
        "slug": "duvar-dekor",
        "trend_profile": {"base": 80, "growth": 22, "volatility": 15},
        "market_profile": {"share": 61, "price_range": (90, 550), "review_range": (300, 6000)},
        "bcg_target": "STAR",
    },
    {
        "id": "tv-unitesi",
        "category": "TV Ünitesi",
        "slug": "tv-unitesi",
        "trend_profile": {"base": 68, "growth": 6, "volatility": 10},
        "market_profile": {"share": 78, "price_range": (900, 5500), "review_range": (25, 450)},
        "bcg_target": "CASH_COW",
    },
    {
        "id": "metal-raf",
        "category": "Metal Raf",
        "slug": "metal-raf",
        "trend_profile": {"base": 52, "growth": 3, "volatility": 8},
        "market_profile": {"share": 71, "price_range": (120, 750), "review_range": (120, 2500)},
        "bcg_target": "CASH_COW",
    },
    {
        "id": "konsol-masa",
        "category": "Konsol Masa",
        "slug": "konsol-masa",
        "trend_profile": {"base": 48, "growth": 18, "volatility": 11},
        "market_profile": {"share": 38, "price_range": (650, 3200), "review_range": (10, 280)},
        "bcg_target": "QUESTION_MARK",
    },
    {
        "id": "kitaplik",
        "category": "Kitaplık",
        "slug": "kitaplik",
        "trend_profile": {"base": 58, "growth": 12, "volatility": 9},
        "market_profile": {"share": 42, "price_range": (400, 2200), "review_range": (30, 600)},
        "bcg_target": "QUESTION_MARK",
    },
    {
        "id": "ayna",
        "category": "Ayna",
        "slug": "ayna",
        "trend_profile": {"base": 38, "growth": -5, "volatility": 7},
        "market_profile": {"share": 28, "price_range": (180, 1100), "review_range": (20, 350)},
        "bcg_target": "DOG",
    },
    {
        "id": "abajur",
        "category": "Abajur",
        "slug": "abajur",
        "trend_profile": {"base": 30, "growth": -8, "volatility": 6},
        "market_profile": {"share": 22, "price_range": (140, 700), "review_range": (15, 200)},
        "bcg_target": "DOG",
    },
]

BCG_META = {
    "STAR": {"quadrant": "STAR", "emoji": "⭐", "color": "#F59E0B", "description": "High market share in a fast-growing category"},
    "CASH_COW": {"quadrant": "CASH_COW", "emoji": "🐄", "color": "#10B981", "description": "High market share in a stable/declining category"},
    "QUESTION_MARK": {"quadrant": "QUESTION_MARK", "emoji": "❓", "color": "#3B82F6", "description": "Low market share in a fast-growing category"},
    "DOG": {"quadrant": "DOG", "emoji": "🐕", "color": "#EF4444", "description": "Low market share in a slow-growing category"},
}

RECOMMENDATIONS = {
    "STAR": {
        "action": "INVEST",
        "priority": "HIGH",
        "rationale": "Dominant position in a fast-growing market. Maximize investment to build sustainable lead.",
        "tactics": ["Increase inventory depth by 40%", "Launch targeted Trendyol ad campaigns", "Expand color/size variations", "Negotiate exclusive supplier agreements"],
        "budget_allocation": "20-25% of marketing budget",
    },
    "CASH_COW": {
        "action": "HARVEST",
        "priority": "MEDIUM",
        "rationale": "Reliable revenue source in a mature market. Optimize margins and extract cash for reinvestment.",
        "tactics": ["Reduce marketing spend 20%", "Focus on margin optimization", "Automate fulfillment processes", "Use cash flow to fund STAR products"],
        "budget_allocation": "3-5% of marketing budget",
    },
    "QUESTION_MARK": {
        "action": "TEST",
        "priority": "MEDIUM",
        "rationale": "High-growth category with unclear market position. Run targeted experiments.",
        "tactics": ["A/B test pricing strategies", "Launch 3-month advertising trial", "Analyze top competitor strategies", "Set 90-day revenue milestones"],
        "budget_allocation": "8-12% of marketing budget",
    },
    "DOG": {
        "action": "EXIT",
        "priority": "HIGH",
        "rationale": "Low performance in a declining market. Liquidate inventory and reallocate resources.",
        "tactics": ["Run clearance pricing campaign", "Do not reorder stock", "Reallocate shelf space to STAR products", "Analyze failure factors"],
        "budget_allocation": "0% - liquidate",
    },
}


def jitter(value, pct=0.12):
    """Add realistic jitter to a value."""
    return value * (1 + random.uniform(-pct, pct))


def generate_trend_series(profile, weeks=26):
    """Generate realistic trend time series."""
    base = profile["base"]
    growth = profile["growth"]
    vol = profile["volatility"]
    values = []
    v = base * 0.7
    for w in range(weeks):
        seasonal = math.sin(w / 26 * 2 * math.pi) * vol * 0.5
        trend_delta = growth / 52
        noise = random.uniform(-vol * 0.4, vol * 0.4)
        v = max(5, min(100, v + trend_delta + seasonal + noise))
        values.append({"week": w, "value": round(v, 1)})
    return values


def seed_data():
    print("🌱 Seeding RoomArt BCG Intelligence demo data...")

    # ── TRENDS ──────────────────────────────────────────────
    trends = []
    for cat in CATEGORIES:
        tp = cat["trend_profile"]
        series = generate_trend_series(tp)
        recent_avg = sum(d["value"] for d in series[-4:]) / 4
        older_avg = sum(d["value"] for d in series[:4]) / 4
        growth_rate = (recent_avg - older_avg) / older_avg * 100
        trends.append({
            "category": cat["category"],
            "slug": cat["slug"],
            "keyword": cat["category"].lower(),
            "trend_score": round(recent_avg, 1),
            "growth_rate": round(growth_rate, 1),
            "peak_interest": round(max(d["value"] for d in series), 1),
            "data_points": series,
            "fetched_at": datetime.now().isoformat(),
        })

    with open(DATA_DIR / "trends.json", "w", encoding="utf-8") as f:
        json.dump({"generated_at": datetime.now().isoformat(), "trends": trends}, f, ensure_ascii=False, indent=2)
    print(f"  ✓ Trends: {len(trends)} categories")

    # ── BCG SCORES ──────────────────────────────────────────
    categories_output = []
    quadrant_counts = {}

    for cat in CATEGORIES:
        mp = cat["market_profile"]
        bcg_t = cat["bcg_target"]

        # Share/growth scores with realistic noise
        if bcg_t == "STAR":
            share_score = round(jitter(mp["share"], 0.08), 2)
            growth_score = round(jitter(72, 0.10), 2)
        elif bcg_t == "CASH_COW":
            share_score = round(jitter(mp["share"], 0.08), 2)
            growth_score = round(jitter(32, 0.12), 2)
        elif bcg_t == "QUESTION_MARK":
            share_score = round(jitter(mp["share"], 0.08), 2)
            growth_score = round(jitter(66, 0.10), 2)
        else:  # DOG
            share_score = round(jitter(mp["share"], 0.08), 2)
            growth_score = round(jitter(28, 0.12), 2)

        share_score = max(10, min(95, share_score))
        growth_score = max(10, min(95, growth_score))

        trend_data = next((t for t in trends if t["slug"] == cat["slug"]), {})
        avg_price = round(random.uniform(*mp["price_range"]), 2)
        avg_reviews = random.randint(*mp["review_range"])

        quadrant_counts[bcg_t] = quadrant_counts.get(bcg_t, 0) + 1

        categories_output.append({
            "id": cat["slug"],
            "category": cat["category"],
            "slug": cat["slug"],
            "product_count": random.randint(12, 45),
            "share_score": share_score,
            "growth_score": growth_score,
            "bcg": BCG_META[bcg_t],
            "recommendation": RECOMMENDATIONS[bcg_t],
            "top_product": f"{cat['category']} Premium Edition",
            "avg_price": avg_price,
            "avg_rating": round(random.uniform(3.9, 4.8), 1),
            "total_reviews": avg_reviews,
            "trend_score": trend_data.get("trend_score", 50),
            "trend_growth": trend_data.get("growth_rate", 0),
        })

    kpis = {
        "total_categories": len(CATEGORIES),
        "total_products": sum(c["product_count"] for c in categories_output),
        "star_products": quadrant_counts.get("STAR", 0),
        "cash_cows": quadrant_counts.get("CASH_COW", 0),
        "question_marks": quadrant_counts.get("QUESTION_MARK", 0),
        "dogs": quadrant_counts.get("DOG", 0),
        "risk_products": quadrant_counts.get("DOG", 0) + quadrant_counts.get("QUESTION_MARK", 0),
        "avg_trend_score": round(sum(t["trend_score"] for t in trends) / len(trends), 1),
        "high_priority_alerts": 3,
    }

    bcg_output = {
        "generated_at": datetime.now().isoformat(),
        "kpis": kpis,
        "categories": categories_output,
        "quadrant_distribution": quadrant_counts,
    }

    with open(DATA_DIR / "bcg_scores.json", "w", encoding="utf-8") as f:
        json.dump(bcg_output, f, ensure_ascii=False, indent=2)
    print(f"  ✓ BCG Scores: {len(categories_output)} categories classified")

    # ── ALERTS ──────────────────────────────────────────────
    alerts = [
        {
            "id": "alert_1",
            "type": "OPPORTUNITY",
            "severity": "HIGH",
            "category": "Akustik Panel",
            "message": "Akustik Panel gaining STAR momentum — accelerate inventory",
            "detail": "Growth score 74 | Share 72 | Trend: +28% YoY | Action: INVEST",
            "timestamp": datetime.now().isoformat(),
        },
        {
            "id": "alert_2",
            "type": "RISK",
            "severity": "HIGH",
            "category": "Abajur",
            "message": "Abajur category declining — DOG territory confirmed",
            "detail": "Growth -8% | Share 22 | Action: EXIT recommended",
            "timestamp": datetime.now().isoformat(),
        },
        {
            "id": "alert_3",
            "type": "QUADRANT_CHANGE",
            "severity": "HIGH",
            "category": "Duvar Dekor",
            "message": "Duvar Dekor shifted QUESTION MARK → STAR",
            "detail": "Growth score crossed 70 threshold | Scale investment immediately",
            "timestamp": (datetime.now() - timedelta(hours=6)).isoformat(),
        },
        {
            "id": "alert_4",
            "type": "INFO",
            "severity": "MEDIUM",
            "category": "TV Ünitesi",
            "message": "TV Ünitesi confirmed as primary CASH COW — optimize margins",
            "detail": "Market share 78 | Stable growth | Revenue extraction phase",
            "timestamp": (datetime.now() - timedelta(hours=12)).isoformat(),
        },
        {
            "id": "alert_5",
            "type": "OPPORTUNITY",
            "severity": "MEDIUM",
            "category": "Konsol Masa",
            "message": "Konsol Masa showing 18% growth signal — test investment",
            "detail": "QUESTION MARK with high growth velocity | 90-day trial recommended",
            "timestamp": (datetime.now() - timedelta(hours=18)).isoformat(),
        },
        {
            "id": "alert_6",
            "type": "INFO",
            "severity": "LOW",
            "category": "Metal Raf",
            "message": "Metal Raf stable CASH COW — low volatility confirmed",
            "detail": "Predictable revenue stream | Maintain current strategy",
            "timestamp": (datetime.now() - timedelta(days=1)).isoformat(),
        },
    ]

    with open(DATA_DIR / "alerts.json", "w", encoding="utf-8") as f:
        json.dump({"generated_at": datetime.now().isoformat(), "alerts": alerts}, f, ensure_ascii=False, indent=2)
    print(f"  ✓ Alerts: {len(alerts)} strategic alerts")

    # ── HISTORY ─────────────────────────────────────────────
    history = []
    base_date = datetime.now() - timedelta(days=30)
    for i in range(30):
        ts = base_date + timedelta(days=i)
        noise = lambda: random.randint(-1, 1)
        history.append({
            "timestamp": ts.isoformat(),
            "kpis": {**kpis, "avg_trend_score": round(kpis["avg_trend_score"] + random.uniform(-3, 3), 1)},
            "quadrant_distribution": {
                "STAR": max(0, quadrant_counts.get("STAR", 0) + noise()),
                "CASH_COW": max(0, quadrant_counts.get("CASH_COW", 0) + noise()),
                "QUESTION_MARK": max(0, quadrant_counts.get("QUESTION_MARK", 0) + noise()),
                "DOG": max(0, quadrant_counts.get("DOG", 0) + noise()),
            },
        })

    with open(DATA_DIR / "history.json", "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, indent=2)
    print(f"  ✓ History: {len(history)} snapshots")

    print("\n✅ Seed complete! Data ready in /data/")
    print(f"   STARs: {quadrant_counts.get('STAR',0)}  |  CASH COWs: {quadrant_counts.get('CASH_COW',0)}  |  QMs: {quadrant_counts.get('QUESTION_MARK',0)}  |  DOGs: {quadrant_counts.get('DOG',0)}")


if __name__ == "__main__":
    seed_data()
