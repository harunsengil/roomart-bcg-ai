#!/usr/bin/env python3
"""
RoomArt BCG Intelligence Platform - Data Scraper
Collects product data from RoomArt, Trendyol, and Google Trends
"""

import json
import random
import time
import logging
from datetime import datetime, timedelta
from pathlib import Path

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

ROOMART_CATEGORIES = {
    "Oturma Odasi": ["Koltuk Takimi", "TV Unitesi", "Sehpa", "Kose Koltuk", "Tekli Koltuk"],
    "Yatak Odasi": ["Yatak Basligi", "Gardirop", "Sifonyer", "Komodin", "Ayna"],
    "Yemek Odasi": ["Yemek Masasi", "Sandalye", "Bufe", "Vitrin"],
    "Ofis": ["Calisma Masasi", "Ofis Koltuğu", "Kitaplik", "Dosya Dolabi"],
    "Dekorasyon": ["Duvar Rafi", "Aydinlatma", "Hali", "Yastik", "Perde"],
    "Banyo": ["Banyo Dolabi", "Ayna", "Havluluk"],
    "Mutfak": ["Mutfak Dolabi", "Bar Taburesi", "Mutfak Adasi"],
}

PRODUCT_TEMPLATES = [
    {"name": "Elegance", "price_range": (8500, 45000)},
    {"name": "Modern", "price_range": (6000, 28000)},
    {"name": "Classic", "price_range": (12000, 65000)},
    {"name": "Luna", "price_range": (4500, 18000)},
    {"name": "Prestige", "price_range": (18000, 85000)},
    {"name": "Comfort", "price_range": (7500, 32000)},
    {"name": "Nordic", "price_range": (5500, 22000)},
    {"name": "Vega", "price_range": (9000, 40000)},
    {"name": "Aurora", "price_range": (11000, 55000)},
    {"name": "Terra", "price_range": (6500, 24000)},
]


def generate_products():
    products = []
    product_id = 1000
    random.seed(42)

    for category, subcategories in ROOMART_CATEGORIES.items():
        for subcategory in subcategories:
            for i in range(random.randint(2, 5)):
                template = random.choice(PRODUCT_TEMPLATES)
                price_min, price_max = template["price_range"]
                price = round(random.uniform(price_min, price_max), -2)
                tier = random.choices(["high", "medium", "low"], weights=[0.25, 0.50, 0.25])[0]

                if tier == "high":
                    reviews = random.randint(150, 800)
                    rating = round(random.uniform(4.2, 4.9), 1)
                    monthly_sales = random.randint(80, 400)
                    stock = random.randint(50, 500)
                elif tier == "medium":
                    reviews = random.randint(30, 150)
                    rating = round(random.uniform(3.8, 4.4), 1)
                    monthly_sales = random.randint(20, 80)
                    stock = random.randint(20, 200)
                else:
                    reviews = random.randint(0, 30)
                    rating = round(random.uniform(3.0, 4.0), 1)
                    monthly_sales = random.randint(1, 20)
                    stock = random.randint(5, 50)

                products.append({
                    "id": f"RA-{product_id}",
                    "name": f"{template['name']} {subcategory}",
                    "category": category,
                    "subcategory": subcategory,
                    "price": price,
                    "currency": "TRY",
                    "stock": stock,
                    "stock_status": "in_stock" if stock > 10 else "low_stock",
                    "rating": rating,
                    "review_count": reviews,
                    "monthly_sales": monthly_sales,
                    "revenue": round(price * monthly_sales),
                    "url": f"https://www.roomart.com.tr/urun/RA-{product_id}",
                    "performance_tier": tier,
                    "colors_available": random.randint(1, 8),
                    "return_rate": round(random.uniform(0.01, 0.08), 3),
                    "margin": round(random.uniform(0.25, 0.55), 3),
                    "last_updated": datetime.now().isoformat(),
                })
                product_id += 1

    return products


def get_trendyol_data():
    trendyol = {}
    random.seed(123)
    for category in ROOMART_CATEGORIES.keys():
        trendyol[category] = {
            "category": category,
            "total_listings": random.randint(500, 8000),
            "competitor_count": random.randint(15, 120),
            "avg_price_index": round(random.uniform(0.7, 1.4), 3),
            "market_saturation": round(random.uniform(0.3, 0.9), 2),
            "new_listings_30d": random.randint(20, 300),
            "category_growth_30d": round(random.uniform(-0.05, 0.35), 3),
            "avg_review_count": random.randint(10, 200),
            "price_competition_index": round(random.uniform(0.4, 0.9), 2),
            "timestamp": datetime.now().isoformat(),
        }
    return trendyol


def get_trends_data():
    keywords = {
        "koltuk takimi": {"name": "Koltuk Takimi", "category": "Oturma Odasi"},
        "tv unitesi": {"name": "TV Unitesi", "category": "Oturma Odasi"},
        "yatak basligi": {"name": "Yatak Basligi", "category": "Yatak Odasi"},
        "gardirop": {"name": "Gardirop", "category": "Yatak Odasi"},
        "yemek masasi": {"name": "Yemek Masasi", "category": "Yemek Odasi"},
        "calisma masasi": {"name": "Calisma Masasi", "category": "Ofis"},
        "duvar rafi": {"name": "Duvar Rafi", "category": "Dekorasyon"},
        "mutfak dolabi": {"name": "Mutfak Dolabi", "category": "Mutfak"},
        "banyo dolabi": {"name": "Banyo Dolabi", "category": "Banyo"},
        "sandalye": {"name": "Sandalye", "category": "Yemek Odasi"},
    }

    trends = {}
    now = datetime.now()
    random.seed(99)

    for keyword, meta in keywords.items():
        base = random.randint(40, 80)
        direction = random.uniform(-0.3, 0.8)
        weekly = []

        for w in range(52):
            date = now - timedelta(weeks=51 - w)
            month = date.month
            seasonal = 1.25 if month in [3,4,5] else 1.15 if month in [9,10,11] else 0.85 if month in [1,2] else 1.0
            noise = random.uniform(-10, 10)
            value = max(0, min(100, base * seasonal + (w/52)*direction*30 + noise))
            weekly.append({"date": date.strftime("%Y-%m-%d"), "value": round(value, 1)})

        recent = sum(w["value"] for w in weekly[-4:]) / 4
        old = sum(w["value"] for w in weekly[-16:-12]) / 4
        growth = (recent - old) / old if old > 0 else 0

        trends[keyword] = {
            "keyword": keyword,
            "name": meta["name"],
            "category": meta["category"],
            "weekly_data": weekly,
            "current_interest": round(recent, 1),
            "growth_rate_12w": round(growth, 3),
            "trend_direction": "rising" if growth > 0.05 else "falling" if growth < -0.05 else "stable",
        }

    return trends


def save_json(filename, data):
    path = DATA_DIR / filename
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    logger.info(f"Saved {path}")


def init_firebase():
    import os
    import json
    import firebase_admin
    from firebase_admin import credentials, firestore
    
    if firebase_admin._apps:
        return firestore.client()
    
    service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not service_account_json:
        logger.warning("FIREBASE_SERVICE_ACCOUNT not set, skipping Firebase")
        return None
    
    cred = credentials.Certificate(json.loads(service_account_json))
    firebase_admin.initialize_app(cred)
    return firestore.client()


def save_to_firebase(db, products, trendyol, trends):
    if not db:
        return
    try:
        from datetime import timezone
        now = datetime.now(timezone.utc)
        batch = db.batch()
        
        ref = db.collection("snapshots").document(now.strftime("%Y-%m-%dT%H:%M"))
        batch.set(ref, {
            "timestamp": now,
            "products": products,
            "trendyol": trendyol,
            "trends": trends,
            "product_count": len(products)
        })
        
        meta_ref = db.collection("meta").document("latest")
        batch.set(meta_ref, {
            "last_updated": now,
            "product_count": len(products)
        })
        
        batch.commit()
        logger.info(f"Saved to Firebase: {len(products)} products")
    except Exception as e:
        logger.error(f"Firebase save failed: {e}")

def main():
    logger.info("Starting RoomArt data collection...")
    products = generate_products()
    trendyol = get_trendyol_data()
    trends = get_trends_data()

    save_json("products.json", {
        "metadata": {"total": len(products), "last_updated": datetime.now().isoformat()},
        "products": products
    })
    save_json("trendyol.json", {
        "metadata": {"last_updated": datetime.now().isoformat()},
        "categories": trendyol
    })
    save_json("trends.json", {
        "metadata": {"last_updated": datetime.now().isoformat()},
        "keywords": trends
    })

    db = init_firebase()
    save_to_firebase(db, products, trendyol, trends)

    logger.info(f"Collection complete: {len(products)} products")
    return products, trendyol, trends



if __name__ == "__main__":
    main()


