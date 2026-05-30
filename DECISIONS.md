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

- **2026-05-30 — [Teşhis: BCG Matrix]** Matris **kategori-bazlı** çiziyor (App.jsx
  `BCGMatrix categories={data?.categories}`), ürün-bazlı değil. Gözlenen "~6 nokta" =
  5 gerçek kategori balonu (beklenen, **bug değil, tasarım**). 156 skorlu ürün bu 5 balona
  toplulaşıyor; 36 DİĞER tümüyle dışarıda. Ek bulgu: matris yalnız Firestore'dan çalışıyor —
  `bcg_scores.json`'da `categories` anahtarı yok, JSON fallback'te matris boş kalır.

- **2026-05-30 — [Teşhis: Veri katmanı boşlukları]** İleri sekmeler (DİĞER atama UI +
  Excel ürün tablosu) için üç eksik: (1) `products` dizisi frontend payload'unda ve
  `useData`'da YOK — frontend'in per-product veriye hiç erişimi yok; (2) 36 DİĞER ürün
  hiçbir yerde yapısal **persist edilmiyor** (`bcg_scores.json` yalnız skorlu 156'yı içerir),
  yalnız `snapshots.json`'da ham halde; (3) `category_map.json`'a **yazma kanalı yok** —
  dashboard statik Pages (salt-okunur), repoya yazmak için ayrı kanal (GitHub API/admin/elle)
  gerekir. Karar: önce veri katmanı açılır (payload'a `products` 192 + `is_unassigned`),
  yazma kanalı en sona bırakılır.

- **2026-05-30 — [Firebase proje uyuşmazlığı / kök neden]** Bu makinedeki lokal
  `FIREBASE_SERVICE_ACCOUNT` env `project_id: roomart-bcg-dev`'i gösteriyor; dashboard ve CI
  ise `roomart-bcg-ai` projesini kullanır (koleksiyon adı `roomart-bcg-dev` ile karışmasın).
  Sonuç: yerel `analyzer.py` Firestore yazımları YANLIŞ projeye gider; dashboard'un okuduğu
  `roomart-bcg-ai/.../latest`'i güncellemez ("Firestore write OK" yanıltıcı). Dashboard'da
  "0 products" bunun sonucuydu — frontend kodu doğru. KARAR: Dashboard Firestore'unu yalnız
  **CI `analyze.yml`** (gerçek roomart-bcg-ai secret) günceller; yerel çalıştırma sadece
  `data/*.json` üretmek/denetlemek için. Doğrulama: `roomart-bcg-ai` REST okuması.

- **2026-05-30 — [Scraping: gömülü JSON]** Trendyol ürün verisi (puan/deg/fiyat) DOM
  widget'ından DEĞİL, sayfanın initial HTML'indeki gömülü JSON state'ten parse edilir
  (`"ratingScore":{"averageRating","totalCount"}`, `"sellingPrice":{"value"}`). Gerekçe:
  CI'daki headless-shell Chromium review widget DOM'unu render etmiyordu (puan/deg=0);
  gömülü JSON JS-render'dan bağımsız ve daha hızlı. `ad` DOM h1'den kalır. Kalite guard:
  deg>0 oranı <%40 ise snapshot yazılmaz. Scraper v1 = seed-refresh (mağaza enumerate yok).

- **2026-05-30 — [CI verimlilik ilkesi]** Pahalı/tekrarlı CI adımları sürüm-anahtarlı
  cache'lenir (Playwright browser binary'leri), cache-hit'te ağır indirme atlanır. Tüm
  süreçlerde varsayılan mercek. Detay: memory/ci-resource-efficiency.md.

<!-- Yeni kararları buraya ekle -->
