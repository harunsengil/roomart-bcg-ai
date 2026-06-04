# STATUS.md — Canlı Durum Defteri

> Code ve Chat'in ortak "şu an neredeyiz" defteri. Code her iş bitiminde günceller.
> Raw: `https://raw.githubusercontent.com/harunsengil/roomart-bcg-ai/main/STATUS.md`

---

## Son Güncelleme
- **Tarih:** 2026-06-03
- **Güncelleyen:** Code (VS Code Claude Code eklentisi — PR #4 + PR #5 merge + canlı doğrulama)
- **Aktif branch:** `main` (PR #4 + #5 merge oldu; working tree main'de, temiz). Geliştirme **VS Code
  Claude Code eklentisi** (sürücü) + Chat (düşünme) ile sürüyor. ⚠️ Aynı repoda eklenti + terminal
  claude'u **AYNI ANDA** aktif session'la çalıştırma (paylaşılan working tree → çakışma).

> **▶️ SIRADAKİ OTURUM BURADAN DEVAM ETSİN:**
> - **Açık kod işi yok** — PR #1/#3/#4/#5 main'de. Satış-tabanlı pazar payı + satış-momentumu büyüme
>   ekseni + **API-katalog ürün kapsamı** (999 tablo / 261 sinyalli matris) canlı ve doğrulandı.
> - **Adaylar (kullanıcı sırası):** kolon zenginleştirme (liste fiyatı/indirim, marka,
>   attributes renk/ölçü); kategori kaynağı = Trendyol `categoryName` ile categorize() uyumu;
>   competitor_bot.py'yi analyzer'a bağla; BCG Roundtable failure; Aşama 2 (Supabase/Next.js).
>   (KPI 999/261 ayrımı + Scored kartı PR #6 ile YAPILDI.)
> - 🟡 **Bekleyen kullanıcı aksiyonu (güvenlik, opsiyonel-acil):** Trendyol API Secret'ı yenile →
>   `TRENDYOL_TOKEN`'ı güncelle (eski token sohbette göründü). **Token ŞU AN geçerli** (2026-06-03
>   CI'da satış çekti), ama sızdığı için rotasyon önerilir. Bayat token'da `analyze.yml`'in
>   "Verify Trendyol sync" adımı görünür `::warning::` verir (hardening mevcut).
> - ⚠️ **Güvenlik (lokal):** `git remote origin` URL'inde plaintext GitHub PAT (`ghp_…`) var
>   (yalnız yerel `.git/config`, commit'li değil) → rotasyon + credential-helper önerilir.
> - **Diğer adaylar:** `competitor_bot.py`'yi analyzer'a bağla (göreceli-pay, marka bazlı; CANLI
>   doğrulanmamış); BCG Roundtable workflow failure incelemesi; Aşama 2 (Supabase/Next.js göçü).

> **✅ MERGE TAMAM (2026-06-03):**
> - **PR #1** (analyzer mekanik temizlik: non-furniture filtre + Kahve Köşesi + momentum-only
>   None-trends + parametrik `competitor_bot.py`) → main `aebec6b`.
> - **PR #3** (resmî Trendyol API + pazar-payı=GERÇEK SATIŞ + CI hardening; kapanan PR #2'nin yerine)
>   → main `9a72638`.
> - **PR #4** (BCG büyüme ekseni Y = gerçek satış momentumu, son7g vs önceki7g; history store yok)
>   → main `1e4ab24`. **Canlı doğrulandı:** `analyze.yml` dispatch (run 26885434479) success;
>   CI-commit `7ead404` `bcg_scores.json` metadata `growth_basis {sales:125, reviews:62}`,
>   quadrant `4 STAR/0 CC/2 QM/1 DOG` (yerel ile birebir); Trendyol sync+verify adımları success
>   (token geçerli, satış kullanıldı); Deploy Dashboard tetiklendi → success.
> Detay + çoklu-oturum koordinasyon: DECISIONS.md (2026-06-03).

> **🆕 Pazar payı + büyüme artık GERÇEK SATIŞ:** `trendyol_api.py`+`trendyol_sync.py` kendi mağaza
> verisini çeker → `data/trendyol_sales.json` (PII'siz, **gitignored**, ciro public'e gitmez; ham satış
> private Firestore). analyzer X eksenini kategori-içi net satış adedine (`share_basis`), Y eksenini
> satış momentumuna (`growth_basis`; satış yoksa ikisi de deg'e düşer) bağlar. Secrets
> (`TRENDYOL_SUPPLIER_ID`/`TRENDYOL_TOKEN`) kurulu ✅; rotasyon bekliyor (yukarı).

> **🧊 DONDURMA NOKTASI:** Bu, JSON+Actions mimarisinin son tam sürümü; **Supabase + Next.js +
> Vercel göçü** (Aşama 2, ayrı oturum) öncesi dondurma. Tag'ler: `v1-full-pre-cleanup` (Assign+Batch
> dahil tam-özellikli, DİĞER matris-dışı eski hal), `v1-frozen-pre-supabase` (Aşama 1 sonrası:
> DİĞER skorlu, Assign/Batch yok). Göç kararı + davranış değişikliği için bkz DECISIONS.md (2026-06-01).

## Sistem Durumu (özet)
- **Pipeline OTONOM ve uçtan uca doğrulandı (2026-05-30):** scrape (gerçek Trendyol,
  Playwright, günlük 05:00 UTC) → analyze → deploy zinciri explicit dispatch ile çalışıyor.
- Firestore yazımı CI'da doğru projeye (`roomart-bcg-ai`) gidiyor; **yerel** analyzer
  `roomart-bcg-dev` projesine yazar (prod'u güncellemez) — bkz Bilinen Sorunlar.
- Dashboard yayında: https://harunsengil.github.io/roomart-bcg-ai/ (Overview, Products, Assign,
  Trends, Alerts, AI Strategy, Batch sekmeleri).
- snapshots.json artık **4 gün**; momentum ekseni aktif (`growth_axis_active=true`,
  `days_until_confident≈10`). Günlük cron biriktiriyor.

## Şu An Çalışılan
- **(2026-06-03) PR #4 merge + canlı doğrulama tamamlandı.** Aktif kod görevi yok. Satış-tabanlı
  pazar payı (X) + satış-momentumu büyüme (Y) main'de ve dashboard'da canlı. Bekleyen tek şey
  kullanıcı aksiyonu: `TRENDYOL_TOKEN` rotasyonu (güvenlik). Sonraki büyük adım: **Aşama 2 =
  Supabase/Next.js göçü (ayrı oturum)**.

## Bekleyen / Bloke
- [x] ~~Gürültü temizliği: iPhone vb. mobilya-dışı ürünler DİĞER'de.~~ **PR #1 ile çözüldü:**
      `analyzer.filter_roomart_only()` okuma katmanında merchantId≠362387'yi otomatik eler
      (manuel EXCLUDE gerekmez; EXCLUDE yine çalışır). PR #1 merge olunca canlı olur.
- [ ] **competitor_bot.py'yi analyzer'a bağla (ayrı PR):** `competitor_snapshots.json` göreceli-pay
      gruplamasına (marka bazlı) bağlanmalı; competitor_bot CANLI doğrulanmalı (Playwright+Trendyol).
- [ ] backend/snapshot_utils.py (delta arşiv) — snapshots.json günlük büyüyor; ileride.
- [ ] v2: yeni-ürün keşfi (mağaza enumerate Playwright'la; haftalik_snapshot.py'de vardı).
      Şu an seed sabit (snapshots.json son günü), yeni ürün otomatik gelmiyor.

## Son Tamamlananlar
- [x] **(2026-06-04) PR #7 — analize sadece AKTİF ürünler (`on_sale=True`) + KPI ikon sol** (`7db2dd5`).
      Analiz evreni artık aktif Trendyol kataloğu; pasif/stoksuf (~524) ürünler dışı. `on_sale` zaten
      saklı → **sync değişmedi**; günlük taze sync ile aktif/pasif değişimi otomatik yansır (yeni ürün
      aktif→listeye girer, pasif/stok bitti→düşer). Tablo 999→**475**, matris 262→**255**. KPI ikonları
      sola; "Total Products" alt yazısı "Aktif SKU". Canlı doğrulandı (run 26958185018 success; stok=0
      ürün 0). Kenar: stoğu biten ama yakın satışlı ~9 ürün düşer (direktife uygun). Detay: DECISIONS.
- [x] **(2026-06-03) PR #6 — KPI: Total Products=katalog (999) + Scored kartı (261)** (`7f70935`).
      `kpis.total_products`=tam katalog, yeni `kpis.scored_products`=matris; KPISection 9. kart
      (Target ikonu, grid lg:8→9). Canlı doğrulandı (run 26901304662 success, deploy success).
      Ayrıca: yerel `.env.trendyol.local` silindi (token GitHub Secret'ta kalır), merged branch'ler
      (`feat/catalog-coverage`, `feat/kpi-catalog-scored`) silindi.
- [x] **(2026-06-03) PR #5 — ürün kapsamı = API kataloğu** (`feat/catalog-coverage` → main `d9bdb81`,
      merge-commit). Dashboard tablosu artık tüm Trendyol mağaza kataloğunu (API ~999) gösterir; BCG
      matrisi yalnız SİNYAL-taşıyan (snapshot'ta yorum VEYA gerçek satış, ~261) ürünleri skorlar.
      Eski 187-seed evreni satışın %19'unu + katalogun %81'ini kaçırıyordu. `analyzer` evreni =
      `snapshot ∪ trendyol_sales.json['products']`; pasif (sinyalsiz, 738) ürün tabloda görünür
      `bcg_class=None`. `trendyol_sync`'e `product_url`+`stock_code`; ProductTable'a **Stok** kolonu
      (0→kırmızı, None→"—"). metadata `catalog_total`+`passive_count`. **Canlı doğrulandı** (run
      26900585270 success, CI-commit `7fbc20c`): 999 tablo / 261 matris / 738 pasif, stok 999/999.
      NOT (KPI): `total_products`=261 (skorlanan); tablo 999. Detay: DECISIONS 2026-06-03.
- [x] **(2026-06-03) PR #4 — büyüme ekseni (Y) = gerçek satış momentumu** (`feat/sales-momentum`
      → main `1e4ab24`, merge-commit). `trendyol_sync.py` siparişleri son7g vs önceki7g net adede
      bucket'lar → `sales_momentum` (0-100, deg ölçeği; ikisi-0→None); `analyzer.calculate_growth`
      satış momentumu varsa onu, yoksa eski `deg_momentum`'a düşer (`growth_basis` "sales"|"reviews").
      `bc`→`bcat` gölge temizliği. **Canlı doğrulandı** (REST API merge + `analyze.yml` dispatch,
      run 26885434479 success): CI-commit `7ead404` `growth_basis {sales:125, reviews:62}`,
      quadrant 4 STAR/0 CC/2 QM/1 DOG; sync+verify success (token geçerli); Deploy success.
- [x] **(2026-06-03) PR #1 — analyzer mekanik temizlik + competitor_bot** (`feat/analyzer-cleanup-
      competitor-scraper` @ `95d42dd`, kod-only, push'lı, merge'e hazır): non-furniture merchantId
      filtresi (5 iPhone elendi) + Kahve Köşesi ayrı kategori (Diğer 16→3) + None-trends momentum-only
      + medyan yalnız Trends'li kategorilerden + per-kategori `trends_source`/`growth_axis_active`
      (şema korundu); parametrik `competitor_bot.py` (8 tekil mağaza → `competitor_snapshots.json`,
      analyzer'a henüz bağlı değil). Detay: DECISIONS.md 2026-06-03.
- [x] **(2026-06-03) Çoklu-oturum koordinasyon:** analyzer-cleanup ↔ trendyol-api repo-dışı
      SESSION_SYNC kanalı + ayrı worktree ile izole edildi; PR #2 stacked açıldı; takip trendyol-api'ye
      devredildi (bu oturum stand-down).
- [x] Tam otomatik pipeline + Pages deploy kuruldu.
- [x] analyzer.py gerçek-veri BCG skor motoruna geçirildi (sahte alanlar kaldırıldı).
- [x] roundtable.py (Anthropic API) entegre edildi.
- [x] **(2026-05-30) İş A:** analyzer.py gerçek snapshot (192 ROOMART ürünü, 2026-05-18)
      üzerinde çalıştırıldı. bcg_scores.json artık dolu: 156 skorlu ürün, 36 DİĞER.
      Kadran (kategori bazlı): 4 STAR, 1 QM, 0 CASH_COW, 0 DOG. Firestore latest güncellendi,
      canlı dashboard gerçek veriyi gösteriyor.
- [x] **(2026-05-30) İş B:** GitHub Actions tetik zinciri onarıldı. Kök neden: GITHUB_TOKEN
      push'ları başka workflow tetiklemiyor (push-path cascade çalışmaz). Çözüm: roundtable'daki
      explicit `createWorkflowDispatch` pattern'i eksik halkalara uygulandı —
      scrape→analyze ve analyze→deploy. Dispatch yalnız commit gerçekten atıldığında
      (`steps.commit.outputs.changed`) tetiklenir. analyze.yml push paths gerçek girdilere
      (snapshots.json/trends_sonuc.json/category_map.json) çevrildi; iki workflow'a `actions: write` eklendi.
- [x] **(2026-05-30) Teşhis (B/C):** BCG Matrix kategori-bazlı (5 balon = 5 kategori; tasarım,
      bug değil; DİĞER matriste yok). Veri katmanı boşlukları DECISIONS.md'ye yazıldı.
- [x] **(2026-05-30) Veri katmanı:** analyzer payload + bcg_scores.json 192 ürünü
      (`is_unassigned`) taşıyor; metadata `total_products:156` + `total_all:192`; useData
      `products` expose ediyor. Matris akışı aynen çalışıyor (categories=5 değişmedi),
      frontend build OK. ProductTable henüz bağlı değil (görsel değişiklik yok).
- [x] **(2026-05-30) Config:** .claude/settings.json allow listesine find/grep/cat/ls/Read eklendi.
- [x] **(2026-05-30) İş C v1 (scraper):** backend/scraper.py sahte demo'dan **gerçek
      Playwright seed-refresh** scraper'a çevrildi — snapshots.json son günü seed alır,
      her ürün detay sayfasını tazeler, snapshots.json[bugün]'e append (idempotent,
      %60 başarı eşiği, kibar gecikme). CI probe: Trendyol detay sayfası 200+veri.
      scrape.yml'e Playwright Chromium kurulumu + playwright requirements eklendi.
      Mağaza enumerate (403) yapılmaz; yeni ürün keşfi seed-genişletme/sonraki sürüm.
- [x] **(2026-05-30) UI:** ProductTable yeni "Products" sekmesine bağlandı (192 ürün,
      data.products'tan). Import bug düzeltildi (BCG_CONFIG/ACTION_COLORS → QUADRANT_META/ACTION_META).
      Revenue→Price; DİĞER ürünler "∅ ATANMADI" rozeti + "—" skor; "Atanmadı" filtre çipi. Build OK.
- [x] **(2026-05-30) (a) UI fix:** kategori detayında NaN/undefined düzeltildi
      (normalizeCategories avg_price/avg_rating/trend_score/trend_growth eşliyor).
- [x] **(2026-05-30) (b) Assign sekmesi:** DİĞER ürünleri kategoriye ata / "Hariç Tut" →
      category_map.json indir/kopyala (sıfır altyapı yazma kanalı). analyzer EXCLUDE
      (`__EXCLUDE__`) desteği + metadata.excluded_count.
- [x] **(2026-05-30) (c) İş C v1 — gerçek scraper UÇTAN UCA DOĞRULANDI:** backend/scraper.py
      Playwright seed-refresh; puan/deg/fiyat **gömülü JSON**'dan (headless-shell render-bağımsız,
      kök neden buydu). CI koşusu: 188/192 ürün (%98), 2026-05-30 günü eklendi (Toplam gün: 2) →
      analyze → deploy zinciri **success**; roomart-bcg-ai Firestore `data_days=2`,
      `growth_axis_active=true`, kadran STAR 4 / DOG 1 (momentum ayrıştırması başladı).
- [x] **(2026-05-30) CI verimlilik:** scrape.yml Playwright Chromium'u sürüm-anahtarlı
      cache'liyor (cache-hit'te ~100MB indirme yok). İlke: memory/ci-resource-efficiency.md.
- [x] **(2026-05-31) Gürültü + categorize:** iPhone category_map ile hariç tutuldu;
      categorize() Türkçe casing bug'ı düzeltildi (_norm) → DİĞER 34→30, 3 ROMA çalışma masası kurtarıldı.
- [x] **(2026-05-31) Dashboard denetim düzeltmeleri:** (P1) trends `data_points` artık
      `{week,value}` (grafikler boş çiziliyordu) + `peak_interest`; kategori önerisine
      `rationale`+`priority` eklendi (CategoryPanel/AI Recommendations yarı-boştu),
      üretilmeyen tactics/budget UI'dan kaldırıldı. (P2) 4 ölü komponent silindi
      (RecommendationsPanel/CategoryHeatmap/KPICards/TrendChart — sahte alan/kırık import içeriyordu).
      (P3) Overview'a "veri olgunlaşıyor X/14 gün" banner'ı + kategori confidence rozeti. Build OK.
- [x] **(2026-06-01) BCG Matrix → ürün-scatter:** kategori-balonu yerine TÜM ürünler nokta
      olarak çizilir (jitter ile yığılma açıldı, zoom, action filtre çipleri, noktaya tıkla →
      sağ panelde ürün kartı + Trendyol link). Medyan eşikleri korunur.
- [x] **(2026-06-01) Overview sadeleştirme:** Strategic Alerts + Performance Radar kaldırıldı
      (Alerts & Signals sekmesinde zaten var). KPI dekoratif accent katmanları silindi
      (kalıcı "sarı loading çizgisi" artefaktıydı) + TOTAL CATEGORIES hover popup'ı.
- [x] **(2026-06-01) Products sekmesi (tam donanım):** No/Kategori/Kod/Puan/Değerlendirme
      sütunları, tüm-sütun arama (binlik-ayraç duyarsız), sıralanabilir başlıklar, Excel tarzı
      çoklu-seçim sütun filtreleri (filtre-içi arama + Tümü/✕), BCG+Action çipleri, Excel/CSV
      export, ürün adı→Trendyol link, 100 satır/sayfa, ilk/son ok + pencere. Sayısal arama
      operatörleri: `>3500`, `<2000`, `>=N`, `1000-5000` (aralık) → fiyata uygulanır.
- [x] **(2026-06-01) App-shell layout fix:** outer `h-screen+overflow-hidden`, `main`
      `flex-1+min-h-0+overflow-y-auto` → SADECE main içeride kayar; header/sekme/footer pinli.
      Kök neden: Header `sticky top-0` + sekme `relative z-200` → body kayınca sekmeler
      header'a biniyordu; `min-h-screen` footer'ı tarayıcıya göre kaydırıyordu. Tüm sekmelerde.
- [x] **(2026-06-01) ProductTable scroll/popup:** sticky thead (sınırlı-yükseklik scroll
      kutusu; `overflow-x-auto`→sticky-trap kök nedeni çözüldü), sayfa değişiminde çift-rAF
      smooth scroll (clamp/smooth yarışı → ileri sayfa en alta atıyordu, düzeldi). Popup
      şeffaflığı: `bg-navy-900/98` (geçersiz class) → opak `var(--bg-secondary)` (filtre
      popup + KPI + matris tooltip üçü birden).
- [x] **(2026-06-01) 'Banyo Dolabı' rename + Assign UI** (ad→link, Link sütunu kaldır, herhangi
      ürünü getirme) — sonra Assign UI tümüyle kaldırıldı (aşağı).
- [x] **(2026-06-01) Aşama 1 — dondur + sadeleştir:** İki tag (`v1-full-pre-cleanup`,
      `v1-frozen-pre-supabase`). Assign + Batch sekmeleri/bileşenleri silindi (yazma-kanalı ara
      altyapısı kurulmadı — göçte DB gelecek). **Diğer artık skorlanır** (analyzer `analyzable=products`):
      matriste 6. grup, X=Diğer-içi deg payı, Y=trends-yok→nötr; `is_unassigned`/UNASSIGNED mantığı
      (BCGMatrix/ProductTable) temizlendi. EXCLUDE≠Diğer korundu. Canlı: 187 skorlu, 6 kategori
      (Banyo 119/Çamaşır 38/Diğer 17/Kitaplıklı 5/Mutfak 5/Sehpa 3), excluded 1. "DİĞER"→"Diğer" rename.
- [x] **(2026-06-01) UI: kategori filtre ayrımı + radar:** Overview ve AI Strategy kategori panelleri
      ayrı state (`selectedCategory` / `strategyCategory`) → birbirini etkilemez. Performance Radar
      (ScoreRadarChart) kolonu doldurur (h-full + flex-1) + tema-bilinçli grid/etiket.
- [x] **(2026-06-01) Light-mode kapsamlı revizyon:** **kök neden** `.glass-card` TANIMSIZDI (kutuların
      arka planı yoktu) → tanımlandı, tüm kutular dolgulu. Parlaklık azaltıldı (gri zemin + opak/gradient
      beyaz kartlar); gold/amber metin `.light`'ta koyulaştırıldı. Tema-bilinçli `tone()`+`useIsLight()`
      (MutationObserver, prop-drilling yok) → INVEST/STAR rozet, chip, pagination, güven noktaları, radar
      light'ta okunur. Products **zebra** satır (var(--row-alt)/--row-hover). Beyaz kutulara aşağıdan-
      yukarıya gri→kırık-beyaz **gradient**.
- [x] **(2026-06-01) Responsive (mobil dahil):** h-[100dvh]; sekme çubuğu yatay-scroll; header/arama/
      footer breakpoint'li; matris çipleri sarılır; Products tablosu yatay kaydırma. Tüm özellikler
      her ekranda çalışır.

## Sıradaki Adımlar
1. **Aşama 2 — Mimari göç (ayrı oturum):** Next.js + Supabase (Auth/Postgres/RLS) + Vercel.
   Kategori atama API→DB anlık; scrape/analiz job→Postgres; analyzer/categorize/scraper mantığı
   taşınır. Detay: DECISIONS.md (2026-06-01).
2. (Göç kapsamında) Gürültü/atama yönetimi DB+Auth'lu admin panelinden; v2 yeni-ürün keşfi;
   snapshot delta arşiv; ürün-kodu kapsamı; Actions Node20 yükseltmesi.

## Bilinen Sorunlar / Riskler
- Momentum güveni için ≥14 farklı gün gerek. Şu an 2 gün (growth_axis_active=true ama
  days_until_confident=12). Günlük cron biriktikçe `growth_confident=true` olacak. Erken
  dönem kadranlar henüz tam oturmadı (kodda bayraklarla dürüstçe işaretli).
- v1 scraper yalnız mevcut seed'i (snapshots.json son günü) tazeler; **yeni ROOMART
  ürünlerini otomatik keşfetmez**. Katalog genişletme seed-genişletme/v2 ister.
- **[Teknik borç]** Deploy Dashboard çalışıyor ama actions/checkout@v4, configure-pages@v4,
  deploy-pages@v4 Node.js 20 deprecation uyarısı veriyor. İleride en güncel sürümlere
  yükseltilmeli (workflow kırılmadan önce).
- **[Kök neden — çözüldü]** Lokal FIREBASE_SERVICE_ACCOUNT `roomart-bcg-dev` projesini
  gösteriyor; dashboard/CI `roomart-bcg-ai`. Yerel analyzer Firestore yazımları prod'u
  güncellemiyordu → dashboard "0 products". Çözüm: CI analyze (doğru proje) çalıştır.
  Detay: memory/firebase-project-mismatch.md. Yerel Firestore yazımına güvenme; CI gerekir.

---

### Güncelleme Şablonu
```
## Son Güncelleme
- Tarih: YYYY-MM-DD
- Güncelleyen: Code
- Aktif branch: main

## Şu An Çalışılan
- ...
## Son Tamamlananlar
- [x] ...
## Sıradaki Adımlar
1. ...
```
