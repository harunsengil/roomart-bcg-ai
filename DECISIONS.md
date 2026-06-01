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

- **2026-05-31 — [Çalışma protokolü / Model seçimi (Seviye 2)]** Code her yeni göreve
  başlamadan tek satır model önerir: `MODEL: <Opus 4.8|Sonnet 4.6|Haiku 4.5> — gerekçe`.
  Geçişi kullanıcı `/model` ile yapar (Code değiştiremez). Sınıflandırma: Opus = çok-dosyalı
  bağımlı/mimari/kök-neden/belirsiz; Sonnet = tek-dosya/bilinen pattern/test/net tarif;
  Haiku = format/küçük düzeltme/hızlı soru (şüphede üst kademe). Seviye-2 onay durakları:
  (1) model önerisi, (2) 3+ dosyalı yapısal iş kısa plan+onay, (3) riskli/geri-dönülemez
  (force-push, silme, history rewrite, prod/dashboard etkileyen, şema/CI/secret). Rutin
  tek-dosyada onay yok. İlke: işe başlamadan `git pull --rebase`, CI'da cache. (Chat ile
  uzlaşıldı; Code uygular.)

- **2026-06-01 — [UI: BCG Matrix ürün-bazlı]** Matris artık kategori-balonu yerine TÜM
  ürünleri tek tek nokta olarak çizer (App.jsx `BCGMatrix products=...`). 2026-05-30'daki
  "kategori-bazlı tasarım" teşhisini **bilinçli olarak geçersiz kılar** — kullanıcı ürün
  seviyesi dağılım istedi. Yığılma jitter ile açıldı; noktaya tıklama sağ panelde ürün kartı
  (Trendyol link) gösterir. Kategori balonları kaldırıldı.

- **2026-06-01 — [UI: App-shell sabit viewport]** Uygulama kabuğu tam-viewport sabit kolon:
  outer `h-screen + overflow-hidden`, `main` `flex-1 + min-h-0 + overflow-y-auto`; header/
  sekme/footer `flex-shrink-0` ile pinli, SADECE main içeride kayar. Gerekçe: eski
  `min-h-screen` + Header `sticky top-0` + sekme `relative z-200` kombinasyonunda body kayınca
  sekmeler header'ın üstüne biniyor, footer tarayıcıya göre farklı yerde duruyordu. Uzun
  içerikli sekmeler (Products/Assign) kendi iç scroll'larını yönetir (ProductTable: sınırlı-
  yükseklik kutu + sticky thead + çift-rAF smooth sayfa scroll'u). İlke: tek scroll otoritesi = main.

- **2026-06-01 — [UI: opak yüzey değişkeni]** Floating panel/popup/tooltip arka planları
  `bg-navy-900/98` gibi Tailwind'de TANIMSIZ renk sınıfları yerine opak `var(--bg-secondary)`
  inline style kullanır. Gerekçe: `navy-900` config'de yoktu → sınıf no-op → popuplar şeffaf
  görünüyordu. `--bg-secondary` her iki temada (dark/light) opak.

- **2026-06-01 — [BÜYÜK RESİM: Mimari göç kararı (Aşama 2, ayrı oturum)]** RoomArt,
  "statik GitHub Pages + JSON + GitHub Actions" mimarisinden standart iskelete göçecek:
  **Next.js (App Router) + Supabase Auth + Supabase Postgres + Vercel.** Hedef: çok-projeli,
  çok-kullanıcılı, yazılabilir temel. Veri Postgres'te (products, snapshots, bcg_scores,
  category_assignments, profiles + rol/yetki + RLS). Kategori atama = API→DB anlık yazma
  (commit/pipeline yok). scrape/analiz = zamanlanmış job→Postgres. GitHub yalnız kod+CI/CD.
  Admin panelinden kullanıcı/yetki; Assign yalnız yetkili kullanıcıya. analyzer BCG mantığı +
  categorize() + scraper gömülü-JSON yöntemi Python/mantık olarak taşınır, sadece çıktı
  Postgres'e gider. Gerekçe: statik site yazılamaz; token/Worker/Firebase ara çözümleri
  çok-kullanıcılı güvenli yazma için ya güvensiz ya ağır → kalıcı çözüm DB+Auth.
  NOT: Bu oturumda KOD YAZILMADI; yalnız karar kaydı.

- **2026-06-01 — [Göç öncesi DONDURMA + iki tag]** JSON+Actions mimarisinin son tam sürümü
  dondurma noktası olarak işaretlendi. İki git tag: **`v1-full-pre-cleanup`** (Assign+Batch
  dahil tam-özellikli eski hal; DİĞER matris-dışı eski davranış burada donar — geri dönüş
  noktası) ve **`v1-frozen-pre-supabase`** (Aşama 1 sadeleştirmesi sonrası: DİĞER skorlu,
  Assign/Batch yok, deploy OK — Supabase/Next.js göçü başlangıç noktası).

- **2026-06-01 — [DAVRANIŞ DEĞİŞİKLİĞİ: DİĞER artık skorlanır]** Eşleşmeyen ürünler DİĞER
  bucket'ında kalır ama **analiz dışı bırakılmaz** — DİĞER tek kategori gibi BCG'de skorlanır,
  matriste 6. grup olur. X = DİĞER-içi deg payı; Y = Trends köprüsü yok → nötr (Sehpa/Mutfak
  Adası gibi, momentum aktif). Bu, 2026-05-30'daki "DİĞER atanana dek analiz dışı / is_unassigned"
  kararını **geçersiz kılar**. `is_unassigned` alanı + matris-dışı mantık kaldırıldı; payload'da
  tüm ürünler (DİĞER dahil) skorlu. **EXCLUDE ≠ DİĞER korunur:** category_map `__EXCLUDE__`
  (iPhone/mobilya-dışı) tümüyle analiz dışı; DİĞER'e DÜŞMEZ.

- **2026-06-01 — [Assign + Batch UI kaldırıldı]** Yarım kalan kategori-atama yazma-kanalı
  (token/Worker/Supabase auth) planları temizlendi; **yerine ara altyapı kurulmadı** (göçte DB
  gelecek). Assign + BatchRunner sekmeleri/bileşenleri silindi. `category_map.json` dosya olarak
  kalır, analyzer okumaya devam eder (manuel düzenleme + EXCLUDE çalışır); UI'dan atama yok.

- **2026-06-01 — [Göç notu — kategori modeli]** Postgres'e geçişte kategoriler için görünen-ad
  (label, ör. 'Diğer') ile iç-anahtar/slug (ör. 'other') AYRILMALI. Mevcut JSON mimaride ikisi
  tek string ('Diğer') olarak birleşik; bu çalışıyor çünkü frontend display-map kullanmıyor. DB
  modelinde key/slug stabil tutulup label ayrı sütun olmalı — etiket değişiklikleri veriyi/eşleşmeyi
  kırmasın.

<!-- Yeni kararları buraya ekle -->
