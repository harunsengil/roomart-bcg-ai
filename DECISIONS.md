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

- **2026-05-30 — [Veri kaynağı netleşti]** Analiz gerçek kaynağı `snapshots.json`
  (`{gün: {pid: {ad,fiyat,puan,deg,url}}}`) + `trends_sonuc.json`'dır; bunlar 2026-05-18'de
  elle yüklendi. `scraper.py` ise demo/template üretip `products.json`'a yazıyor ve bu çıktı
  analyzer tarafından OKUNMUYOR (orphan). Karar: scraper gerçek Trendyol'a yöneltilene dek
  (İş C) yerel testlerde scraper ÇALIŞTIRILMAZ; pipeline doğrulaması doğrudan analyzer ile yapılır.

- **2026-05-30 — [Pipeline tetik kopukluğu]** `scrape.yml` commit mesajı `[skip ci]` içerdiği
  için `analyze.yml` veri push'unda tetiklenmiyor; BCG skorları otomatik güncellenmiyor (İş B).
  Çözülene dek analyzer manuel/yerel çalıştırılıp sonuç commit edilir.

- **2026-05-30 — [CI tetikleme]** Workflow'lar arası geçiş explicit `workflow_dispatch`
  (`actions/github-script` + `createWorkflowDispatch`) ile yapılır; push-path cascade'ine
  GÜVENİLMEZ. Gerekçe: varsayılan GITHUB_TOKEN ile yapılan bot push'ları başka workflow'ların
  push trigger'larını tetiklemez (GitHub recursion koruması). roundtable→deploy bu pattern'i
  zaten kullanıyordu; scrape→analyze ve analyze→deploy de aynıya geçirildi. Dispatch yalnız
  commit gerçekten atıldığında yapılır (boş deploy/analyze önlenir). analyze.yml artık gerçek
  analyzer girdilerini (snapshots.json/trends_sonuc.json/category_map.json) izler; eski
  orphan dosyaları (products/trendyol/trends.json) değil.

- **2026-05-30 — [Branch modeli]** Tek geliştirici; doğrudan `main`'e çalışılır. Gerekçe:
  workflow_dispatch/cross-workflow dispatch yalnız default branch (main) tanımını okur, bu
  yüzden CI değişikliklerinin canlı olması için zaten main'de olması gerekir; PR akışı sadece
  geciktirir.

<!-- Yeni kararları buraya ekle -->
