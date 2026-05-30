# DECISIONS.md — Karar Günlüğü

> Önemli mimari/stratejik kararlar. Tarih atarak ekle, geçmişi silme.
> Format: `YYYY-MM-DD — [BAĞLAM] Karar. Gerekçe.`
> Raw: `https://raw.githubusercontent.com/harunsengil/roomart-bcg-ai/main/DECISIONS.md`

---

- **2026-05-29 — [Çalışma modeli]** Code + Chat paralel. Tek doğruluk kaynağı repo;
  senkron raw URL + CLAUDE.md/STATUS.md üzerinden, elle veri transferi yok.

- **(geçmiş) — [BCG metrik]** Sahte alanlar (revenue, monthly_sales, margin, return_rate,
  stock, performance_tier) KALDIRILDI. Skorlar yalnız gerçek Trendyol verisi (fiyat+puan+deg)
  ve Google Trends büyümesine dayanır. Eşik portföy medyanı (göreli).

- **(geçmiş) — [Veri katmanı]** Frontend önce Firestore `roomart-bcg-dev/latest`'i okur,
  başarısızsa `data/*.json` fallback. Çift kaynak: hem Firestore hem repo JSON güncel tutulur.

- **(geçmiş) — [Roundtable]** Kategori yorumları Anthropic API ile üretilip Realtime DB'ye
  (`/bcg_roundtable`) yazılıyor; Firestore'dan ayrı tutuldu.

<!-- Yeni kararları buraya ekle -->
