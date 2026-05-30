---
description: Veri pipeline'ını yerelde çalıştır ve çıktıları doğrula
---

Hepsini repo kökünden çalıştır (scriptler data/ yolunu köke göre çözer).

1. Bağımlılık: `pip install -r backend/requirements.txt`
2. `python backend/scraper.py` → `data/products.json`, `data/trendyol.json`,
   `data/trends.json` güncellendi mi kontrol et. (FIREBASE_SERVICE_ACCOUNT yoksa
   Firestore yazımı atlanır, lokal test için normal.)
3. `python backend/analyzer.py` → `data/bcg_scores.json` üretildi mi, kategori sayısı,
   kadran dağılımı, `confidence` alanları mantıklı mı bak.
4. İstersen frontend'i lokal gör: `cd frontend && npm install && npm run dev`.
5. Hata çıkarsa tam traceback'i göster, nedenini (veri şeması, pytrends rate limit,
   eksik env) belirt ve düzeltme öner.

Uyarı: `backend/roundtable.py` Anthropic API kullanır (ücret/kota). Sadece açıkça
istenirse ve `ANTHROPIC_API_KEY` ayarlıyken çalıştır.
