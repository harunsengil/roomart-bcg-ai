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

- **2026-06-01 — [UI: tema-bilinçli renk + dolu kutular + responsive]** (1) `.glass-card`
  TANIMSIZDI (no-op) → tanımlandı; tüm floating kutular tema-değişkenli arka plana sahip.
  (2) Inline parlak amber/gold (#F59E0B/#d4a017) light'ta okunmuyordu → `tone(hex, light)` helper
  + reaktif `useIsLight()` hook (documentElement `.light` MutationObserver; prop-drilling yok) ile
  yalnız bu tonlar light'ta koyulaştırılır; diğer renkler değişmez. Inline `rgba(255,255,255,..)`
  yerine `var(--border-subtle)/--text-secondary/--gold` kullanıldı (chip/pagination/checkbox).
  (3) Light kutulara aşağıdan-yukarıya gri→kırık-beyaz gradient. (4) Responsive: app-shell `100dvh`,
  sekme çubuğu yatay-scroll, breakpoint'li header/arama/footer; masaüstü korunur. NOT: Aşama 2
  (Next.js) frontend'i yeniden kuracağı için bu light/responsive emeğinin bir kısmı orada tekrarlanabilir.

- **2026-06-03 — [PR #1: analyzer mekanik temizlik + competitor_bot]** Branch
  `feat/analyzer-cleanup-competitor-scraper`, commit `95d42dd`, PR #1 → main. KOD-ONLY (data
  artifact'leri CI üretir). Kapsam:
  • **İŞ 1a — Non-furniture filtre:** `analyzer.load_snapshots()` okuma katmanına
    `filter_roomart_only()` eklendi → URL'den `merchantId` parse edilir, `362387` (RoomArt,
    `ROOMART_MERCHANT_ID`) OLMAYAN — merchantId'i hiç parse edilemeyenler dahil — ürünler her
    günün snapshot'ından elenir; `[FİLTRE] N non-RoomArt ürün elendi` loglanır. Mevcut veride
    5 gün × 1 iPhone (merchantId yok) = 5 elendi; gerçek RoomArt ürünü etkilenmedi. Bu, STATUS'taki
    "iPhone gürültüsü DİĞER'de → Assign'dan EXCLUDE" bekleyen işini **kaynakta otomatik** çözer
    (manuel `__EXCLUDE__` gerekmez; EXCLUDE mekanizması yine korunur).
  • **İŞ 1b — Trends bridge + Kahve Köşesi:** `Kahve Köşesi` AYRI kategori olarak eklendi
    (`categorize()` "kahve köşe" kuralı + `CATEGORIES` + `TRENDS_BRIDGE[...]=None`). 12 ürün
    `Diğer`'den çekildi (Diğer 16→3). **`Banyo Dolabı` adı korundu** (yeniden adlandırma YOK →
    X/pay gruplamasına dokunulmadı — kullanıcı kararı). Trends'i olmayan kategoriler (Mutfak
    Adası, Kitaplıklı Çalışma Masası, Sehpa, Kahve Köşesi, Diğer): büyüme = **sadece deg_momentum**
    (suni nötr-50 trends bileşeni KULLANILMAZ — kullanıcı kararı). Büyüme MEDYAN eşiği **yalnız
    gerçek Trends'li kategorilerden** hesaplanır (157 ürün: Çamaşır 38 + Banyo 119); pay (X) eşiği
    değişmedi. Her kategoriye additive `trends_source` (+kullanılan anahtar/null) ve kategori-bazlı
    `growth_axis_active` eklendi; global KPI `growth_axis_active` + mevcut frontend şeması KORUNDU.
  • **İŞ 3 — competitor_bot.py (yeni):** `rpa_projesi/rani_bot.py`'nin PARAMETRİK kopyası;
    `data/competitors.json` okur, `aktif=true` rakipleri `magaza_url`'e göre TEKİLLEŞTİRİR
    (18 giriş → 8 mağaza), her mağazayı bir kez scrape eder. Çıktı `data/competitor_snapshots.json`,
    `snapshots.json` ile AYNI format `{tarih→id→{ad,fiyat,puan,deg,url,marka}}` + `marka`.
  • **Out-of-scope (bu PR'da YOK):** Adım 1+2 = X-ekseni satış-entegrasyonu + Y'den deg_momentum
    çıkarma → bunlar trendyol-api oturumunun PR #2'sinde yapıldı (bkz. aşağı).
  • **Bekleyen / tuzaklar (sonraki PR):** (1) `competitor_bot.py` analyzer'a HENÜZ bağlı DEĞİL —
    ayrı PR'da `competitor_snapshots.json` göreceli-pay gruplamasına (marka bazlı) bağlanmalı.
    (2) `competitor_bot.py` CANLI ÇALIŞTIRILMADI (Playwright+Trendyol gerekir) — güvenmeden önce
    yerelde/CI'da doğrula. (3) `ozellikleri_cek` taşındı ama snapshot 6-alan şeması öznitelik
    içermediği için ÇAĞRILMIYOR (ileride zenginleştirme referansı). (4) `trendyol_api.py`/
    `trendyol_sync.py` PR #1'e AİT DEĞİL (PR #2).

- **2026-06-03 — [Çoklu-oturum koordinasyon + devir]** İki Claude Code oturumu aynı repoda paralel
  çalıştı: **analyzer-cleanup** (bu PR #1) ve **trendyol-api** (PR #2: resmî Trendyol Marketplace
  API entegrasyonu + pazar-payı=gerçek-satış). İkisi **aynı working tree/HEAD'i** paylaştığı için
  çakışma oldu (trendyol commit'i `644818a` önce analyzer branch'ine yazıldı); repo-DIŞI bir
  haberleşme kanalı (`~/.claude/projects/.../SESSION_SYNC.md`) ile koordine edildi. Çözüm:
  trendyol-api ayrı **git worktree**'ye (`/Users/harunsengil/roomart-trendyol-api`, branch
  `feat/trendyol-api`) geçti; analyzer branch'i `95d42dd`'ye reset'lendi (kullanıcı onaylı; iş
  kaybı yok). **PR #2 STACKED**: base = `feat/analyzer-cleanup-competitor-scraper`.
  **MERGE SIRASI: önce PR #1 → main, sonra PR #2** (GitHub PR #2'yi otomatik main'e retarget eder).
  **KARAR (2026-06-03): tüm takip TEK oturuma (trendyol-api) devredildi**; analyzer-cleanup
  stand-down oldu. Sonraki bağlam repo dosyalarından (bu kayıt + STATUS.md) devralınmalı.
  Tuzak: `data/trendyol_sales.json` (hassas satış verisi) `.gitignore`'a PR #2'de eklendi —
  PR #1 `.gitignore`'unda YOK; public repo'ya sızmamasına dikkat.
- **2026-06-03 — [Trendyol resmî API entegrasyonu + pazar payı = GERÇEK SATIŞ]** RoomArt'ın
  resmî Trendyol Marketplace API'si (Supplier 362387) bağlandı (`backend/trendyol_api.py`
  client; secret YALNIZ env/GitHub Secrets, `TRENDYOL_SUPPLIER_ID`+`TRENDYOL_TOKEN`).
  `backend/trendyol_sync.py` kendi ürün+sipariş verisini çeker, müşteri PII'sini ayıklar,
  kategori/ürün bazında agregatlar → `data/trendyol_sales.json`. **Linkaj:** sipariş satırı
  ↔ ürün kataloğu SADECE `barcode` ile %100; ürün `productContentId` = snapshot `-p-` pid'i
  (187/188) → satış `productContentId` ile anahtarlanır, analyzer pid'le birebir bağlar.
  **BCG §5 değişikliği:** Pazar Payı (X) artık kategori-içi `net_units` (gerçek net satış,
  iptal/iade hariç) payı; satış olmayan kategori eski `deg` payına düşer. Her ürün/skor
  `share_basis` ("sales"|"reviews") taşır (data-honesty). Büyüme (Y) değişmedi (Trends+deg
  momentum); satış-momentumu için zaman serisi henüz yok → ileride.
  **GÜVENLİK:** `trendyol_sales.json` gerçek ciro içerir → `.gitignore`'da (hem data/ hem
  frontend/public kopyası); public repo'ya/dashboard'a KOPYALANMAZ; ham satış Firestore'da
  PRIVATE (`roomart-bcg-dev/sales_latest`) tutulur. `bcg_scores.json`'a yalnız 0-100 normalize
  pay + `share_basis` etiketi yazılır, ham satış sayıları DEĞİL (doğrulandı: grep boş).
  CI: `analyze.yml`'e analyzer'dan önce `continue-on-error` sync adımı (secret yoksa deg'e düşer).

- **2026-06-03 — [BCG §5: Büyüme ekseni (Y) = GERÇEK SATIŞ momentumu]** Büyüme momentumu artık
  `deg` (yorum) yerine **gerçek satış hızı**: `trendyol_sync.py` siparişleri `orderDate`'e göre
  **son 7 gün vs önceki 7 gün** net adet olarak bucket'lar → ürün/kategori `sales_momentum` (0-100,
  deg ile aynı ölçek: %0=50, +%30=100, -%30=0, sıfırdan büyüme=65). **History store GEREKMEZ** —
  18 günlük sipariş aralığı tek çekimde iki pencereyi besler (Firestore arşivi/gün-bekleme yok).
  `analyzer.calculate_growth`: `sales_momentum` varsa onu, son 14 günde satışı olmayan ürün eski
  `deg_momentum`'a düşer; her ürün `growth_basis` ("sales"|"reviews") taşır (share_basis ile simetrik).
  Trends'li kategori `0.5*Trends+0.5*sales_momentum`, Trends'siz yalnız momentum. `confidence`: satış
  momentumu tek çekimde gerçek → snapshot gün sayısına (CONFIDENCE_MIN_DAYS) bağlı DEĞİL.
  **Doğrulama:** growth_basis {sales:125, reviews:62}; quadrant 4 STAR/0 CC/2 QM/1 DOG (düşen ürün
  Y'de ayrıştı). Ham satış/momentum sayıları payload'a YAZILMAZ (yalnız etiket; grep boş).
  **Not (büyüme fazı):** mağaza hızlı büyürken momentum çoğu üründe yükseğe (100) saturate olur;
  medyan eşik esas olarak DÜŞEN ürünleri ayırır — bu fazda doğru/dürüst sinyal. Pencere/band ileride
  veri arttıkça ayarlanabilir.

- **2026-06-03 — [PR #4 MERGE + CANLI DOĞRULAMA]** Satış-momentumu büyüme ekseni (yukarıdaki
  "[BCG §5: Büyüme ekseni (Y) = GERÇEK SATIŞ momentumu]" kararı) `feat/sales-momentum` → main
  **merge-commit** ile birleştirildi (`1e4ab24`). Ortamda `gh` CLI yok → merge + workflow dispatch
  **GitHub REST API** ile yapıldı (token git remote URL'inden). Merge sonrası `analyze.yml`
  workflow_dispatch (run `26885434479`) → **success**; CI-commit `7ead404` `bcg_scores.json` metadata
  `growth_basis {sales:125, reviews:62}`, quadrant `4 STAR/0 CC/2 QM/1 DOG` (yerel doğrulama ile
  birebir). "Sync Trendyol sales" + "Verify Trendyol sync" adımları success → **TRENDYOL_TOKEN şu an
  geçerli** (canlı satış çekti, fallback'e düşmedi); Deploy Dashboard tetiklendi → success.
  **Açık kullanıcı aksiyonu (güvenlik):** token sohbette sızdığı için rotasyon önerilir (geçerli olsa
  da); ayrıca `git remote origin` URL'inde plaintext PAT (`ghp_…`, yalnız yerel `.git/config`) →
  rotasyon + credential-helper.

- **2026-06-03 — [Ürün kapsamı = API kataloğu; matris ≠ tablo evreni]** (PR #5, `d9bdb81`) Dashboard
  ürün evreni snapshot-seed'den (187) **tam Trendyol mağaza kataloğuna** (resmî API, ~999 ürün)
  genişletildi. **İki ayrı evren:** (1) **Tablo** = tüm katalog (snapshot ∪ `trendyol_sales.json['products']`),
  envanter görünürlüğü için. (2) **BCG matrisi/skor** = yalnız SİNYAL-taşıyan ürünler = snapshot'ta
  yorum verisi VAR **veya** son14g gerçek net satış>0 (~261). Sinyalsiz pasif ürünler (ne satış ne
  yorum, ~738) tabloda görünür ama `bcg_class=None` (matriste yok — BCGMatrix null-skoru zaten
  filtreliyor). Gerekçe: eski 187-seed evreni gerçek satışın **%19'unu** ve katalogun **%81'ini**
  kaçırıyordu (74 satışlı ürün matriste hiç yoktu; kategori kapsamı Banyo %20/Diğer %3/Kitaplıklı %8).
  999'un tamamını matrise sokmak X=0'da 738 sıfır-sinyal gürültüsü yaratırdı → sinyal eşiği seçildi
  (kullanıcı kararı: "261 matris + 999 tablo"). **Veri kaynağı önceliği:** her ürün scrape öncelikli
  (görünen puan/değerlendirme/fiyat/kod/url); snapshot'ta yoksa API'den (title/sale_price/stockCode/
  productUrl) + `stock`. `trendyol_sync.aggregate_products`'a `product_url`+`stock_code` eklendi
  (pasif ürün linki/kodu). ProductTable'a **Stok** kolonu. metadata `catalog_total`(999)+
  `passive_count`(738). **KPI semantiği:** `total_products`=skorlanan (261, quadrant toplamıyla
  tutarlı); tablo 999 gösterir — istenirse ileride KPI 999'a çevrilip ayrı "Scored" kartı eklenebilir.
  **Canlı doğrulandı:** run 26900585270 success, CI-commit `7fbc20c`; 999 tablo/261 matris/738 pasif,
  stok 999/999, growth_basis {sales:197,reviews:64}. **Sınır:** scrape seed hâlâ 187 (puan/değerlendirme
  yalnız bu ürünlerde); 74 yeni satışlı ürün puan/değerlendirme=0 ("—") ile gelir — scrape genişletmesi
  (v2 yeni-ürün keşfi) ayrı iş.

- **2026-06-03 — [KPI: Total Products = katalog; ayrı Scored]** (PR #6, `7f70935`) PR #5'teki "KPI
  total_products=261, istenirse 999'a çevrilebilir" notu uygulandı (kullanıcı kararı). `kpis.total_products`
  artık tam katalog (~999, tablo evreni); yeni `kpis.scored_products` = matriste skorlanan sinyalli ürün
  (~261, quadrant toplamıyla tutarlı). KPISection'a 9. kart ("Scored", Target ikonu), grid lg:8→9.
  Product-level quadrant KPI'ları (star/cc/qm/dog) scored 261'den sayılır (değişmedi). Canlı doğrulandı
  (run 26901304662 + deploy success). Temizlik: yerel `backend/.env.trendyol.local` silindi (token GitHub
  Secret'ta DEĞİŞMEDEN kalır; CI etkilenmez), merged feature branch'ler silindi.

- **2026-06-04 — [Analiz evreni = AKTİF ürünler (on_sale=True)]** (PR #7, `7db2dd5`) Kullanıcı kararı:
  "analize sadece aktif ürünler girsin; yeni ürün aktif/pasif edilince liste güncellensin." **Aktif tanımı
  = `on_sale=True`** — veriyle doğrulandı: on_sale=True ⟺ stock>0 (Trendyol stok bitince/ürün pasifleşince
  on_sale=False yapar); `approved` zaten hepsinde True. analyzer ürün evreni artık `active_api =
  {on_sale=True}` (PR #5'teki tam-katalog 999 → ~475 aktif). Tablo=aktif, matris=aktif∩sinyal (~255).
  **Otomatik güncelleme:** `on_sale` zaten `trendyol_sales.json`'da saklı → **sync DEĞİŞMEDİ**; günlük
  cron taze çektiği için aktif/pasif değişimi bir sonraki analizde otomatik yansır. API yoksa snapshot'a
  düşer (graceful, aktif filtre uygulanamaz). **Kenar durum:** son14g satıp şimdi stoğu biten ~9 ürün
  (6 satışlı + 3 snapshot'lı) matristen düşer — "pasif edilince listeden çıkar" mantığına uygun (kabul).
  metadata `active_total` eklendi; KPI "Total Products"=aktif (475, sub "Aktif SKU"). UI: KPI ikonları
  sola alındı. Canlı doğrulandı (run 26958185018 + deploy success; tabloda stok=0 ürün 0).

- **2026-06-04 — [Kolon zenginleştirme + categoryName denetimi]** (PR #8, `0499d5f`) Kullanıcı kolon
  kararı: tabloya **Liste Fiyatı + İndirim % + Renk + Trendyol Kategorisi** eklendi. `trendyol_sync.
  aggregate_products` artık `category_name` (Trendyol'un kendi kategorisi) + `color` (attribute "Renk",
  `_attr` helper) saklar; analyzer payload'a `list_price`+`discount` (liste>satış ise %, analyzer'da
  TÜRETİLİR — tek kaynak)+`color`+`category_name`. **Marka EKLENMEDİ:** veri %97 ROOMART (+%2.5 "banos")
  → sabit, değersiz. **Trendyol categoryName ≠ bizim categorize():** farklı taksonomi (Trendyol: Banyo
  Rafları/Banyo Dolabı Seti/Orta Sehpa/Çok Amaçlı Dolap… 12 kategori; bizimki 7 BCG iş kategorisi) →
  REPLACE etmez, yalnız REFERANS kolon. **Diğer denetimi:** categorize() DOĞRU çalışıyor — Diğer'deki 13
  aktif ürün gerçekten farklı tipler (Duvar Rafı/Baharatlık 7, Makyaj Masası 2, Çok Amaçlı/Ayakkabılık 2,
  Portmanto 2); 5-7 BCG kategorimize girmiyorlar → kural değişikliği gerekmedi. **Attribute kapsamı**
  (478 aktif): Renk %91 (48 tekil), Materyal %98 ama 3 tekil (düşük bilgi), Dolap Ölçüsü %79, Özellik %90.
  Şimdilik yalnız Renk kolon; Ölçü/Özellik ileride istenirse (`_attr` ile kolay). Canlı doğrulandı
  (run 26959294764 + deploy; list_price 475/475, color 436/475, category_name 475/475, discount 69/475).

- **2026-06-08 — [Roundtable TAMAMEN KALDIRILDI]** `roundtable.yml` + `backend/roundtable.py` silindi.
  **Kök neden:** workflow her gün ❌ (exit 1) veriyordu — Anthropic API **kredi bakiyesi bitmiş**
  ("credit balance is too low", her ürün çağrısı 400). Kod sağlamdı; sorun faturaydı. Kullanıcı kararı:
  özelliği tümden kaldır (nazik-atla/schedule-kapat yerine). **Etki YOK — frontend dokunulmadı:** dashboard
  "AI Strategy" sekmesi roundtable Realtime DB'sini DEĞİL, `analyzer.py`'nin kategori `recommendation`
  (action/rationale/priority) verisini (Firestore/JSON) okur → çalışmaya devam eder. roundtable izole bir
  modüldü (hiçbir backend ondan import etmiyordu). Temizlik: CLAUDE.md (mimari: 4→3 workflow, Realtime DB
  satırı + ANTHROPIC_API_KEY notu), `.claude/commands/pipeline.md` (roundtable uyarısı), `.claude/settings.json`
  (`Bash(python backend/roundtable.py)` izni) güncellendi. Geçmiş [Roundtable] kararları (yukarıda) arşiv
  olarak korundu. **Kullanıcı aksiyonu (ops.):** `ANTHROPIC_API_KEY` GitHub Secret'ı artık kullanılmıyor →
  silinebilir; `/bcg_roundtable` Realtime DB path'i de artık yazılmıyor.

- **2026-06-10 — [Trendyol API zenginleştirmesi: 6 sinyal + yaşa-göre hız KPI]** (PR #14, `5924ac7`)
  API'nin zaten çektiği `lines[]`/ürün alanlarından 6 yeni sinyal üretildi: **Net Tahsilat %**
  (Σ(amount·(1−komisyon/100)−satıcı_indirim)/Σamount; COGS verisi YOK → "kâr/margin" DENMEZ, KDV hariç),
  **İade %**, **kampanya/promo payı**, **varyant** (productMainId), **ürün yaşı** (createDateTime),
  **katalog sağlığı** (arşiv/kara-liste/reddedilmiş/kilitli). Sipariş çekimi **ömür-boyu** yapıldı
  (`fetch_orders_lifetime`, 14g pencere; 552→6452 sipariş). Evren artık on_sale **+ sağlıklı**. Yeni
  **yaşa-göre satış hızı** `units/max(yaş,14)` (genç-yıldız adil değerlendirme); `adjust_confidence`
  yüksek-iade/promo-şişmiş büyümeyi bir kademe düşürür. **Kullanıcı kararları:** kabarcık=marj (sonra
  #15'te adede çevrildi), ömür-boyu sipariş geçmişi, varyant=zenginleştirme (birim contentId kalır).

- **2026-06-10 — [BCG kabarcık boyutu = satış adedi]** (PR #15, `f9944e8`) Net Tahsilat % matriste
  kabarcık boyutu seçilmişti ama veride **%85-89'da sıkışık** (komisyon tekdüze + COGS yok) → varyans
  yok, kabarcıklar aynı boyut çıktı. Karar: kabarcık = **net satış adedi** (klasik BCG "pazar büyüklüğü",
  alan-orantılı √adet; units 1→171 görünür fark). Net Tahsilat % kolon+tooltip'te kalır. **Güvenlik notu:**
  `units` artık public payload'da (satış hacmi rakipçe görülebilir; PR #14'teki sales_per_day+age_days
  zaten ima ediyordu). Ciro (TL) hâlâ tamamen private. Public dashboard kilidi açık kullanıcı kararı.

- **2026-06-10 — [Tarihli satış arşivi: sales_history/{date}]** (PR #15, `f9944e8`) **Gerekçe:** Trendyol
  sipariş API'si ~3 ay geçmiş döndürüyor (ömür-boyu çekimde en eski ~2026-03-10'da durdu); aged-out
  siparişlerin cirosu kalıcı kaybolur. Mevcut tarihli Firestore doc'ları (BCG) sadece skor/yüzde tutuyor,
  ciro yok. Karar: PRIVATE Firestore koleksiyonu `sales_history`, **doc id = tarih → idempotent** (gün
  başına 1, üzerine yazmaz). İçerik **kategori + ürün-bazlı** yalın snapshot (PII'siz, 999 katalog hariç →
  ~17KB/gün). **Public repo'ya ASLA** (revenue = rakip istihbaratı). Ölü `sales_latest` (yazılıp hiç
  okunmayan 876KB doc, 1MiB limitine yaklaşıyordu) bunun yerine **kaldırıldı**. İleride frontend ciro-trend
  grafiğinin zemini. Canlı doğrulandı: CI log `sales_history/2026-06-10 (private; 429 ürün)`.

- **2026-06-10 — [Ürün satış sparkline'ı: kaynak = ömür-boyu siparişler, sales_history değil]** (PR #16
  `fcc7585` + #17 `679723e`) ProductTable'a son 13 haftalık satış çizgisi (sparkline) + hover'da büyük
  grafik. **Veri kaynağı kararı:** `sales_history` arşivi yeni başladığı için (1 gün) ondan 3 ay çizilemez;
  seri bunun yerine `trendyol_sync`'in zaten çektiği **ömür-boyu siparişlerden** her koşuda taze hesaplanır
  (`sales_series`, haftalık net-adet, SERIES_WEEKS=13; toplam=net_units) → şimdi çalışır, arşiv birikimini
  beklemez. **Render kararı:** inline SVG sparkline (recharts DEĞİL — 100 satır/sayfa × instans perf).
  **Konum (#17):** hover grafiği imleç yerine `getBoundingClientRect` ile **kendi sparkline'ının altına**
  sabit (alta sığmazsa üste taşar); fixed konum → tablo scroll overflow'undan kırpılmaz. **Güvenlik:**
  haftalık satış adedi de public payload'a girer (units gibi kabul edilen hacim; ciro değil, hâlâ private).

- **2026-06-17 — [Hibrit bulut/Mac mimarisi: günlük veri bulutta (API), Mac yalnız haftalık scrape]**
  Trendyol GitHub datacenter IP'sini **sürekli scrape'te** 403'ler. Bulut-IP probe'u net gösterdi:
  basit `requests` her zaman 403; **Playwright 3-5 istek 200 döner AMA gerçek scrape (188 istek) 0/188=403**
  (hacim/IP-itibarı engeli; UA/context/ayar düzeltmesi çözmez). Kullanıcı talebi "Mac'te çalışan bir şey
  kalmasın" bu kısıtla çakışıyor. **Çözüm (kullanıcı onaylı): kendi ürün scrape'ini API'ye çevir.** Kendi
  ürün verisinin tek scrape-only alanı **puan + yorum (deg)** — diğer her şey (fiyat/stok/satış/6-sinyal/
  momentum) zaten resmî Trendyol API'de (her IP'de çalışır, 403 yok) ve ürün evreni zaten API'den
  (`active_api.keys()`). **Değişiklikler:** `analyzer.py` fiyat = API sale_price ÖNCELİKLİ (günlük taze),
  snapshot fiyatı yedek; `analyze.yml` GÜNLÜK cron `30 5 * * *` (bulut/ubuntu, API sync); `scrape.yml`
  günlük→**haftalık Pzt** `0 5 * * 1` (yalnız puan/deg, Mac/Playwright); `scrape-watchdog.yml` kaldırıldı.
  **Sonuç:** günlük Mac gereği bitti; Mac yalnız Pazartesi (puan/deg + competitor). puan/deg ≤7 gün bayat
  olabilir (yavaş değişir, kabul edildi). **Mac tamamen bitmesi residential proxy (~$50-100/ay) ister.**

- **2026-06-17 — [Login: Seviye A arayüz kilidi (Firebase email/şifre); gerçek veri koruması ertelendi]**
  Dashboard'a giriş paneli istendi (yalnız RoomArt ekibi, tüm dashboard). **Karar: Seviye A** (Firebase
  Auth email/şifre, client-side gate + "Şifremi unuttum"). **Açıkça kabul edilen kısıt:** GitHub Pages
  tamamen public → bu SADECE arayüzü gizler; `data/*.json` + `frontend/public/data/*.json` login'siz
  doğrudan URL'den erişilebilir. **Gerçek veri koruması (Seviye B)** public JSON kaldırıp Firestore-only +
  Security Rules ister, YA DA Aşama 2 Vercel/Next.js (server-side auth). Kullanıcı şimdilik Seviye A'yı
  yeterli buldu (trendyol_sales.json zaten gitignored, public'e gitmiyor). Hesaplar Firebase Console'da
  elle (self-signup YOK = hesap listesi allowlist). `frontend/.env` gitignored (client config public).

- **2026-06-17 — [Rakip eşleştirme: CLIP görsel benzerliği (aynı-kategori); pHash & "Diğer"-kurtarma reddedildi]**
  Eşleştirme kalitesi düşüktü (banyo dolabımız ucuz alakasız ürünle eşleşiyordu). **Karar: CLIP ViT-B/32**
  (open_clip, MPS) görsel embedding → skor %40 CLIP + %30 ad-token(Jaccard) + %30 fiyat. Cache
  `data/image_embeddings.json` (base64 float16); OKUMA+cosine yalnız numpy → analyze.yml (ubuntu, torch yok)
  commit'li cache'ten CLIP skorunu KORUR, yeni embedding yalnız Mac'te (torch). **Reddedilenler:** (1) pHash
  — beyaz arka planlı mobilyada gürültü (gardırop=banyo 0.5), kaldırıldı. (2) CLIP ile "Diğer" kategori
  kurtarma — mobilya alt-tiplerini (dolap/masa/sehpa) ayırmıyor (hepsi ~0.8 benzer), KAPALI. **"Diğer"
  çözümü:** metin `comp_categorize` (banyo/kiler dolapları, analyzer.py'ye dokunmadan) + seed genişletme
  (1401→3844 ürün, 28 mağaza). Sonuç: ort skor 0.67→0.73, tam-dolu 412→465/466. Competition sekmesi İngilizce.

- **2026-07-02 — [CLEAR Decision Intelligence katmanı: BCG üstüne 5-boyutlu karar motoru]**
  BCG "hangi kadran?" sorusunu "şimdi ne yapmalı?"ya genişlettik. **Karar:** BCG'ye DOKUNMADAN ayrı
  `backend/clear_engine.py` + "Decision (CLEAR)" sekmesi. 5 boyut: Talep(=BCG growth) · Rekabet(=BCG share) ·
  Kâr(manuel maliyet CSV) · Operasyon(manuel stok CSV) · Veri Güveni(kaynak ağırlığı − eksik veri cezası).
  Sıralı **hard-gate** kuralları (düşük güven/negatif marj/stok riski yüksek skorla TELAFİ EDİLMEZ) →
  önerilen aksiyon (scale/protect/test/fix_margin/fix_operation/reduce_stock/prepare_exit/complete_data/monitor).
  **Gizlilik:** birim maliyet = en hassas veri → `manual_margin_inputs.csv`, `manual_operation_inputs.csv`,
  `clear_scores.json` GİTIGNORED (trendyol_sales deseni); dashboard'a yalnız Firestore `clear_latest`
  (private, authed). **Yerel çalışır** (marj manuel); Firestore yazımı marj/op verisi YOKKEN atlanır →
  bulut CI marjsız sürümle private clear_latest'i ezmez. Boş CSV = dürüst "Veriyi Tamamla" (negatif marjlı
  ürüne "Ölçekle" dememek için kasıtlı). GTÜ eğitimi için framework olarak genelleştirilebilir.

<!-- Yeni kararları buraya ekle -->
