#!/usr/bin/env python3
"""
RoomArt BCG Intelligence Platform - Scoring & Analysis Engine
Calculates BCG quadrant classifications and strategic recommendations
"""

import json
import logging
import math
import os
import os
from datetime import datetime, timezone
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"


def load_json(filename):
    path = DATA_DIR / filename
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(filename, data):
    path = DATA_DIR / filename
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"Saved {path}")


def normalize(value, min_val, max_val):
    """Normalize value to 0-100 range"""
    if max_val == min_val:
        return 50.0
    return max(0, min(100, (value - min_val) / (max_val - min_val) * 100))


def calculate_market_share_score(product, all_products, trendyol_cats):
    """
    Market Share Score = weighted composite of revenue, reviews, trend visibility,
    search ranking, organic strength, conversion estimate
    """
    cat = product["category"]
    cat_products = [p for p in all_products if p["category"] == cat]

    # Revenue rank within category (0-100)
    revenues = sorted([p["revenue"] for p in cat_products], reverse=True)
    rev_rank = revenues.index(product["revenue"]) if product["revenue"] in revenues else len(revenues) - 1
    revenue_score = normalize(len(revenues) - rev_rank, 0, len(revenues)) * 0.25

    # Review count score (0-100)
    max_reviews = max(p["review_count"] for p in cat_products) if cat_products else 1
    review_score = normalize(product["review_count"], 0, max_reviews) * 0.20

    # Price positioning (mid-range = better conversion)
    prices = [p["price"] for p in cat_products]
    avg_price = sum(prices) / len(prices)
    price_factor = 1 - abs(product["price"] - avg_price) / avg_price if avg_price > 0 else 0.5
    price_score = max(0, price_factor * 100) * 0.10

    # Rating signal
    rating_score = normalize(product["rating"], 3.0, 5.0) * 0.15

    # Stock health
    stock_score = min(100, product["stock"] / 2) * 0.10

    # Competition pressure from Trendyol
    td = trendyol_cats.get(cat, {})
    competition = td.get("price_competition_index", 0.5)
    competition_score = (1 - competition) * 100 * 0.10

    # Margin proxy
    margin_score = normalize(product["margin"], 0.20, 0.60) * 0.10

    total = revenue_score + review_score + price_score + rating_score + stock_score + competition_score + margin_score
    return round(total, 2)


def calculate_growth_score(product, trends, trendyol_cats):
    """
    Growth Score = trend growth + category momentum + review growth proxy +
    competitor increase + search volume growth
    """
    cat = product["category"]
    td = trendyol_cats.get(cat, {})

    # Category growth from Trendyol
    cat_growth = td.get("category_growth_30d", 0)
    cat_growth_score = normalize(cat_growth, -0.10, 0.40) * 0.25

    # New listings = market interest
    new_listings = td.get("new_listings_30d", 50)
    listing_score = normalize(new_listings, 0, 300) * 0.10

    # Google Trends keyword growth for category
    cat_keywords = [v for v in trends.values() if v.get("category") == cat]
    if cat_keywords:
        avg_trend_growth = sum(k["growth_rate_12w"] for k in cat_keywords) / len(cat_keywords)
        avg_interest = sum(k["current_interest"] for k in cat_keywords) / len(cat_keywords)
    else:
        avg_trend_growth = 0
        avg_interest = 50

    trend_growth_score = normalize(avg_trend_growth, -0.30, 0.80) * 0.30
    trend_interest_score = normalize(avg_interest, 0, 100) * 0.20

    # Product-level momentum (reviews proxy)
    review_momentum = min(100, product["review_count"] / 5)
    review_score = review_momentum * 0.15

    total = cat_growth_score + listing_score + trend_growth_score + trend_interest_score + review_score
    return round(total, 2)


def classify_bcg(share_score, growth_score):
    """Classify into BCG quadrant"""
    high_share = share_score >= 50
    high_growth = growth_score >= 50

    if high_share and high_growth:
        return "STAR"
    elif high_share and not high_growth:
        return "CASH_COW"
    elif not high_share and high_growth:
        return "QUESTION_MARK"
    else:
        return "DOG"


def generate_recommendation(product, bcg_class, share_score, growth_score, trendyol_cats):
    """AI decision engine - generate strategic recommendation"""
    cat = product["category"]
    td = trendyol_cats.get(cat, {})
    margin = product["margin"]
    return_rate = product["return_rate"]
    competition = td.get("market_saturation", 0.5)

    # Decision tree
    if bcg_class == "STAR":
        if margin > 0.40 and competition < 0.6:
            action = "INVEST"
            rationale = "High growth with strong margins and manageable competition. Aggressive investment recommended."
            priority = 1
        elif margin > 0.30:
            action = "SCALE"
            rationale = "Strong growth position. Scale marketing and distribution to capture market share."
            priority = 1
        else:
            action = "OPTIMIZE"
            rationale = "Good market position but thin margins. Optimize cost structure before scaling."
            priority = 2

    elif bcg_class == "CASH_COW":
        if return_rate < 0.04 and margin > 0.35:
            action = "HARVEST"
            rationale = "Mature category with solid profitability. Harvest cash flow to fund Stars."
            priority = 2
        elif competition > 0.7:
            action = "DEFEND"
            rationale = "Strong position under competitive pressure. Defend share through loyalty and differentiation."
            priority = 2
        else:
            action = "HARVEST"
            rationale = "Stable cash generator. Maintain with minimal investment."
            priority = 3

    elif bcg_class == "QUESTION_MARK":
        if growth_score > 65 and margin > 0.35:
            action = "INVEST"
            rationale = "High-potential opportunity in growing market. Invest to capture share before maturity."
            priority = 1
        elif growth_score > 55:
            action = "TEST"
            rationale = "Market growing but position uncertain. Run targeted tests to validate investment case."
            priority = 2
        else:
            action = "MONITOR"
            rationale = "Weak position in moderately growing market. Monitor closely before committing resources."
            priority = 3

    else:  # DOG
        if margin < 0.25 and return_rate > 0.06:
            action = "EXIT"
            rationale = "Low growth, low share, poor margins and high returns. Plan exit strategy."
            priority = 4
        elif return_rate > 0.05:
            action = "RESTRUCTURE"
            rationale = "Underperforming product. Reduce SKU complexity or discontinue low-margin variants."
            priority = 3
        else:
            action = "OPTIMIZE"
            rationale = "Weak position but salvageable margins. Optimize before deciding to exit."
            priority = 3

    return {
        "action": action,
        "rationale": rationale,
        "priority": priority,
    }


def detect_alerts(scored_products):
    """Generate strategic alerts from analysis"""
    alerts = []
    now = datetime.now().isoformat()

    # Find products changing quadrant trajectory
    stars = [p for p in scored_products if p["bcg_class"] == "STAR"]
    dogs = [p for p in scored_products if p["bcg_class"] == "DOG"]
    question_marks = [p for p in scored_products if p["bcg_class"] == "QUESTION_MARK"]
    cash_cows = [p for p in scored_products if p["bcg_class"] == "CASH_COW"]

    # High-opportunity alerts
    rising_qm = [p for p in question_marks if p["growth_score"] > 65]
    for p in rising_qm[:3]:
        alerts.append({
            "id": f"alert-{len(alerts)+1}",
            "type": "OPPORTUNITY",
            "severity": "HIGH",
            "title": f"{p['subcategory']} becoming STAR",
            "message": f"{p['name']} shows rising trend momentum ({p['growth_score']:.0f}/100 growth score). Consider investment.",
            "product_id": p["id"],
            "timestamp": now,
        })

    # Risk alerts
    declining_cows = [p for p in cash_cows if p["growth_score"] < 25]
    for p in declining_cows[:2]:
        alerts.append({
            "id": f"alert-{len(alerts)+1}",
            "type": "WARNING",
            "severity": "MEDIUM",
            "title": f"{p['category']} category losing momentum",
            "message": f"{p['name']} growth declining. Plan harvest strategy before market deteriorates.",
            "product_id": p["id"],
            "timestamp": now,
        })

    # Exit candidates
    exit_dogs = [p for p in dogs if p["recommendation"]["action"] == "EXIT"]
    for p in exit_dogs[:2]:
        alerts.append({
            "id": f"alert-{len(alerts)+1}",
            "type": "RISK",
            "severity": "HIGH",
            "title": f"Exit candidate detected in {p['category']}",
            "message": f"{p['name']} has poor margins ({p['margin']*100:.0f}%) and high returns. Initiate exit review.",
            "product_id": p["id"],
            "timestamp": now,
        })

    # Positive alerts
    top_stars = sorted(stars, key=lambda x: x["share_score"] + x["growth_score"], reverse=True)[:2]
    for p in top_stars:
        alerts.append({
            "id": f"alert-{len(alerts)+1}",
            "type": "SUCCESS",
            "severity": "INFO",
            "title": f"{p['subcategory']} is top STAR product",
            "message": f"{p['name']} leads category with {p['share_score']:.0f} share score and {p['growth_score']:.0f} growth score.",
            "product_id": p["id"],
            "timestamp": now,
        })

    return alerts


def compute_category_summary(scored_products):
    """Aggregate stats per category"""
    categories = {}
    for p in scored_products:
        cat = p["category"]
        if cat not in categories:
            categories[cat] = {
                "category": cat,
                "products": [],
                "stars": 0, "cash_cows": 0, "question_marks": 0, "dogs": 0,
                "total_revenue": 0,
                "avg_growth_score": 0,
                "avg_share_score": 0,
            }
        categories[cat]["products"].append(p["id"])
        categories[cat][p["bcg_class"].lower().replace("_", "_")] = categories[cat].get(p["bcg_class"].lower(), 0) + 1
        categories[cat]["total_revenue"] += p["revenue"]
        categories[cat]["avg_growth_score"] += p["growth_score"]
        categories[cat]["avg_share_score"] += p["share_score"]

    for cat, data in categories.items():
        n = len(data["products"])
        data["avg_growth_score"] = round(data["avg_growth_score"] / n, 1)
        data["avg_share_score"] = round(data["avg_share_score"] / n, 1)
        data["product_count"] = n

        # Classify category health
        if data["avg_growth_score"] >= 55 and data["avg_share_score"] >= 55:
            data["health"] = "STRONG"
        elif data["avg_growth_score"] < 35 and data["avg_share_score"] < 35:
            data["health"] = "WEAK"
        else:
            data["health"] = "MIXED"

    return list(categories.values())


def main():
    logger.info("Starting BCG analysis engine...")

    products_data = load_json("products.json")
    trendyol_data = load_json("trendyol.json")
    trends_data = load_json("trends.json")

    products = products_data["products"]
    trendyol_cats = trendyol_data["categories"]
    trends = trends_data["keywords"]

    scored_products = []

    for p in products:
        share_score = calculate_market_share_score(p, products, trendyol_cats)
        growth_score = calculate_growth_score(p, trends, trendyol_cats)
        bcg_class = classify_bcg(share_score, growth_score)
        rec = generate_recommendation(p, bcg_class, share_score, growth_score, trendyol_cats)

        scored = {**p,
            "share_score": share_score,
            "growth_score": growth_score,
            "bcg_class": bcg_class,
            "recommendation": rec,
            "composite_score": round((share_score + growth_score) / 2, 1),
        }
        scored_products.append(scored)

    # Summary stats
    total = len(scored_products)
    stars = sum(1 for p in scored_products if p["bcg_class"] == "STAR")
    cash_cows = sum(1 for p in scored_products if p["bcg_class"] == "CASH_COW")
    question_marks = sum(1 for p in scored_products if p["bcg_class"] == "QUESTION_MARK")
    dogs = sum(1 for p in scored_products if p["bcg_class"] == "DOG")
    invest_actions = sum(1 for p in scored_products if p["recommendation"]["action"] == "INVEST")

    alerts = detect_alerts(scored_products)
    category_summary = compute_category_summary(scored_products)

    bcg_scores = {
        "metadata": {
            "last_updated": datetime.now().isoformat(),
            "total_products": total,
            "stars": stars,
            "cash_cows": cash_cows,
            "question_marks": question_marks,
            "dogs": dogs,
            "invest_candidates": invest_actions,
            "avg_portfolio_score": round(sum(p["composite_score"] for p in scored_products) / total, 1),
        },
        "products": scored_products,
        "category_summary": category_summary,
    }

    alerts_output = {
        "metadata": {"last_updated": datetime.now().isoformat(), "total_alerts": len(alerts)},
        "alerts": alerts,
    }

    save_json("bcg_scores.json", bcg_scores)
    save_json("alerts.json", alerts_output)

    # Write to Firestore if secret is available
    db_client = init_firebase()
    save_to_firestore(db_client, bcg_scores, alerts_output, trends_data)

    logger.info(f"Analysis complete: {stars} Stars, {cash_cows} Cash Cows, {question_marks} Question Marks, {dogs} Dogs")
    logger.info(f"Generated {len(alerts)} alerts")



# ── FIREBASE INTEGRATION ──────────────────────────────────────────────────────

def init_firebase():
    """Initialize Firebase Admin SDK from FIREBASE_SERVICE_ACCOUNT env secret."""
    service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not service_account_json:
        logger.warning("FIREBASE_SERVICE_ACCOUNT not set — skipping Firestore write")
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


def build_frontend_payload(bcg_scores, alerts_output, trends_data):
    """Convert analyzer output to frontend-compatible format (seed_data.py schema)."""
    products = bcg_scores.get("products", [])
    meta = bcg_scores.get("metadata", {})

    # Build category-level summaries from scored products
    cat_map = {}
    for p in products:
        cat = p["category"]
        if cat not in cat_map:
            cat_map[cat] = {
                "id": cat.lower().replace(" ", "-"),
                "category": cat,
                "slug": cat.lower().replace(" ", "-"),
                "product_count": 0,
                "share_scores": [],
                "growth_scores": [],
                "prices": [],
                "ratings": [],
                "reviews": [],
                "bcg_classes": [],
            }
        c = cat_map[cat]
        c["product_count"] += 1
        c["share_scores"].append(p["share_score"])
        c["growth_scores"].append(p["growth_score"])
        c["prices"].append(p.get("price", 0))
        c["ratings"].append(p.get("rating", 4.0))
        c["reviews"].append(p.get("review_count", 0))
        c["bcg_classes"].append(p["bcg_class"])

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

    categories = []
    quadrant_dist = {"STAR": 0, "CASH_COW": 0, "QUESTION_MARK": 0, "DOG": 0}
    for cat, c in cat_map.items():
        n = c["product_count"]
        avg_share = round(sum(c["share_scores"]) / n, 2)
        avg_growth = round(sum(c["growth_scores"]) / n, 2)
        top_bcg = max(set(c["bcg_classes"]), key=c["bcg_classes"].count)
        quadrant_dist[top_bcg] = quadrant_dist.get(top_bcg, 0) + 1

        # Trend data for this category
        cat_trends = [v for v in trends_data.get("keywords", {}).values()
                      if v.get("category") == cat]
        trend_score = round(sum(k.get("current_interest", 50) for k in cat_trends) / len(cat_trends), 1) if cat_trends else 50
        trend_growth = round(sum(k.get("growth_rate_12w", 0) for k in cat_trends) / len(cat_trends) * 100, 1) if cat_trends else 0

        categories.append({
            "id": c["id"],
            "category": cat,
            "slug": c["slug"],
            "product_count": n,
            "share_score": avg_share,
            "growth_score": avg_growth,
            "bcg": BCG_META[top_bcg],
            "recommendation": {"action": REC_MAP.get(
                max(products, key=lambda p: p.get("composite_score", 0) if p["category"] == cat else 0
                ).get("recommendation", {}).get("action", "TEST"), "TEST")
            },
            "avg_price": round(sum(c["prices"]) / n, 2),
            "avg_rating": round(sum(c["ratings"]) / n, 1),
            "total_reviews": sum(c["reviews"]),
            "trend_score": trend_score,
            "trend_growth": trend_growth,
        })

    total_prods = len(products)
    kpis = {
        "total_categories": len(categories),
        "total_products": total_prods,
        "star_products": quadrant_dist.get("STAR", 0),
        "cash_cows": quadrant_dist.get("CASH_COW", 0),
        "question_marks": quadrant_dist.get("QUESTION_MARK", 0),
        "dogs": quadrant_dist.get("DOG", 0),
        "risk_products": quadrant_dist.get("DOG", 0) + quadrant_dist.get("QUESTION_MARK", 0),
        "avg_trend_score": round(sum(c.get("trend_score", 50) for c in categories) / len(categories), 1) if categories else 50,
        "high_priority_alerts": sum(1 for a in alerts_output.get("alerts", []) if a.get("severity") == "HIGH"),
    }

    # Build trends in frontend-expected format
    trends_list = []
    for cat, c in cat_map.items():
        cat_trends = [v for v in trends_data.get("keywords", {}).values()
                      if v.get("category") == cat]
        for kw_data in cat_trends:
            trends_list.append({
                "category": cat,
                "slug": c["slug"],
                "keyword": kw_data.get("keyword", cat.lower()),
                "trend_score": kw_data.get("current_interest", 50),
                "growth_rate": round(kw_data.get("growth_rate_12w", 0) * 100, 1),
                "data_points": kw_data.get("weekly_data", []),
                "fetched_at": datetime.now().isoformat(),
            })
        if not cat_trends:
            trends_list.append({
                "category": cat, "slug": c["slug"],
                "keyword": cat.lower(), "trend_score": 50, "growth_rate": 0.0,
                "data_points": [], "fetched_at": datetime.now().isoformat(),
            })

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "kpis": kpis,
        "categories": categories,
        "quadrant_distribution": quadrant_dist,
        "trends": trends_list,
        "alerts": alerts_output.get("alerts", []),
    }


def save_to_firestore(db_client, bcg_scores, alerts_output, trends_data):
    """Write BCG results to Firestore 'roomart-bcg-dev' collection (frontend schema)."""
    if not db_client:
        return
    try:
        now = datetime.now(timezone.utc)
        doc_id = now.strftime("%Y-%m-%dT%H:%M")
        doc_data = build_frontend_payload(bcg_scores, alerts_output, trends_data)
        db_client.collection("roomart-bcg-dev").document(doc_id).set(doc_data)
        db_client.collection("roomart-bcg-dev").document("latest").set(doc_data)
        logger.info(f"Firestore write OK: roomart-bcg-dev/{doc_id}")
    except Exception as e:
        logger.error(f"Firestore write failed: {e}")

if __name__ == "__main__":
    main()
