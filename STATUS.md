# STATUS.md — Canlı Durum Defteri

> Code ve Chat'in ortak "şu an neredeyiz" defteri. Code her iş bitiminde günceller.
> Raw: `https://raw.githubusercontent.com/harunsengil/roomart-bcg-ai/main/STATUS.md`

---

## Son Güncelleme
- **Tarih:** 2026-07-08
- **Güncelleyen:** Code (SON FİYAT scraper 5 platform + HB + Koçtaş tam entegrasyon — hepsi main'de + deploy)
- **Aktif branch:** `main` (son commit `4af6c32`).

> **▶️ SIRADAKİ OTURUM BURADAN DEVAM ETSİN:**
>
> **✅ MÜŞTERİNİN ÖDEYECEĞİ SON FİYAT — 5 PLATFORM CANLI (2026-07-08, PR #38/#39):**
> Satıcı API'leri platform kampanya/sepet fiyatını VERMEZ → `own_price_scraper.py` (Playwright, **gerçek
> Chrome `channel="chrome"`** — Akamai'yi aşar) ürün sayfasından çeker: **n11 sepette · TY kampanya · HB
> sepete özel · Koçtaş sepette**; RS API'den doğru. **SIRALI (concurrency=1) + kibar aralık + devam-edebilir**
> (eşzamanlı/hızlı istek IP throttle'lar — kanıtlandı; ara-kayıt/15, yeniden başta platform-bazlı dolu-atla).
> Backfill: n11 449·TY 468·HB 328·KO 389 / 468. `scrape.yml` haftalık Mac adımı günceller. Wiring:
> registry+analyzer own_final'ı API'ye tercih eder (`price_final` bayrağı → ProductTable ✓). Detay: [[own-final-prices]].
>
> **✅ KOÇTAŞ = 5. PLATFORM (PR #39):** Koçtaş=**Mirakl** (`koctas.mirakl.net`, API Key `Authorization`)
> → 437 aktif ürün, günlük `koctas_sync`. **`shop_sku` bizim stok kodu DEĞİL → BARKOD(EAN) köprüsü %93
> (408/437)**. `KO` (kırmızı) fiyat kolonu; URL `/{slug}/p/{product_sku}?shop=2262`. Sepette fiyat scrape.
> Secrets: `KOCTAS_API_KEY/USERNAME/PASSWORD`. Detay: [[koctas-integration]].
>
> **✅ FİYAT/URL DÜZELTME ARKI (2026-07-07, PR #33-#37 merged):** günlük 4-platform sync (analyze.yml, 11
> secret, registry Firestore'a yazmaz) · n11 URL=**groupId** · HB=`/{slug}-p-{hepsiburadaSku}` · Shopify
> `?variant={id}` · TY kampanya 🏷️. Detay: [[daily-platform-sync]] · [[platform-product-url-formats]].
>
> **⏭️ AÇIK İŞLER:**
> - **HB/KO son-fiyat kapsamı:** HB 328, KO 389 (bazı üründe URL yok/scrape başarısız); haftalık scrape doldurur.
> - **Private repo (ASKIDA):** Free → private Pages'i kapatır; yerel-server göçüyle çözülecek. [[repo-visibility-decision]].
> - **CLEAR** (PR #32): CSV doldur → merge.
>
> **🟡 Bekleyen (güvenlik):** `TRENDYOL_TOKEN` rotasyonu; `git remote` plaintext PAT; Firestore rules deploy.
> `.env.*.local` gitignored (HB/n11/Shopify/Judge.me/**Koçtaş** creds). gh CLI `~/.local/bin/gh` (brew yok).

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
- **(2026-06-19) Tüm planlı UI işleri tamamlandı.** Aktif kod görevi yok. Sistem canlı ve otonom
  (günlük bulut API + haftalık Mac puan/deg + rakip). Sonraki büyük iş: firmaya teslim planı
  (Google Auth, client server scraper, gözlem kopyası) — ayrı oturum/plan gerekir.

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
- [x] **(2026-06-19) Dashboard UI — kapsamlı iyileştirme paketi** (commit `2d65ffb` + önceki):
  - **Competition sekmesi:** tüm kategori/ürün başlıklarında sıralama; `HI_CELL=text-gold-400` (tek ton);
    en düşük fiyat ve en yüksek puan gold-400 vurgusu; `HoverImgPopup` forwardRef + DOM-direct (400+ satır ×
    4 → sıfır React re-render); mobile overflow-x-auto + min-w wrapper; Fiyat Endeksi kapsamlı tooltip.
  - **Alerts & Signals:** Strategic + Competitor alertler ayrı collapsible section; AlertCard/CompAlertCard
    "Ürüne git →" butonu; RecommendationsPanel tıklanabilir kartlar (→ Overview kategori seçili).
  - **Navigasyon:** alert.product_id → `data.products.find(p.id)` → Products tab arama; AI Strategy →
    Overview kategori pre-seçili; CategoryPanel BCG rozeti yanına "tabloda gör" butonu (Products tab, Trendyol değil).
  - **BCGMatrix:** tooltip'te ürün görseli (90px); eksen etiketlerine Türkçe alt yazı.
  - **Trends sayfası:** `trends_fetch.py` (YENİ) 6 kategoriyi bağımsız sorgular (her biri kendi 0-100);
    `data/trends_sonuc.json` gerçek veriyle dolduruldu; TRENDS_BRIDGE "Banyo Dolabı" düzeltildi (avg 3.6→68.8);
    `if tkey is None: continue` ile "Diğer" filtresi; `scrape.yml`'e Trends adımı eklendi.
  - **Login animasyonu:** 32 noktalı BCGMatrix SVG arka plan (4 kadran rengi, sonar pulse, deterministic).
  - **Mobil uyum:** `xs:480px` Tailwind breakpoint; KPISection `md:grid-cols-5`; ProductTable `overflow-x-auto +
    min-w-[960px]`; BCGMatrix `bcg-plot` CSS class; tab shortLabel'ları; `p-2 xs:p-3 sm:p-5`; alerts `xl:h-[...]`.
  - **Light mode:** index.css bg-white/[0.015..0.04] / border-white / text renk override'ları.
  - **Güvenlik:** `firestore.rules` (auth required, write:false); `analyze.yml` satış dosyası sızma guard.
  - **Excel export:** `reports/roomart_stok_20260619_1504.xlsx` (979 aktif ürün, gitignored).
  - **Küçük düzeltmeler:** QUADRANT_META icon fix (AI Strategy); ProductTable Net Tah.% tooltip; BCG
    eksen Türkçe alt yazı; alert→Products arama ID/isim uyuşmazlığı düzeltmesi.

- [x] **(2026-06-17) Hibrit bulut/Mac mimarisi — günlük veri buluta (API).** Trendyol bulut IP'sini
      sürekli scrape'te 403'ler (probe kanıtı: Playwright 3 istek 200 AMA 188 istek 0/188=403; hacim/IP
      itibarı, UA çözmez). Çözüm: kendi ürün fiyat/stok/satış/sinyal/momentum **resmî API**'den (her IP'de
      çalışır) → `analyze.yml` GÜNLÜK cron 05:30 UTC, bulutta. `analyzer.py` fiyat artık API sale_price
      öncelikli (snapshot yedek). `scrape.yml` günlük→**haftalık Pzt** (yalnız puan/deg, API vermez,
      Mac/Playwright şart). `scrape-watchdog.yml` kaldırıldı. **Günlük Mac gereği bitti**; Mac yalnız Pzt.
- [x] **(2026-06-17) Login paneli (Seviye A) + şifre sıfırlama.** Firebase email/şifre arayüz kilidi:
      `useAuth.js`, `LoginScreen.jsx`, `App.jsx` auth gate (giriş yapılmadan Dashboard+useData render
      edilmez), Header çıkış butonu, "Şifremi unuttum" (sendPasswordResetEmail). Hesaplar Console'da elle
      (2 kullanıcı). `frontend/.env` lokal (gitignored). KISIT: Pages public → data/*.json hâlâ açık.
- [x] **(2026-06-17) Rakip eşleştirme: CLIP görsel + comp_categorize + seed.** competitor_analyzer skoru
      %40 CLIP(ViT-B/32, MPS) + %30 ad-token + %30 fiyat; cache `data/image_embeddings.json` (torch'suz
      CI'da okunur). `comp_categorize` banyo/kiler dolaplarını kurtarır (analyzer.py'ye dokunmadan).
      Seed 1401→**3844 ürün** (28 mağaza, Rani sınırsız sayfa, MAX_PAGES 5→10). Skor 0.67→0.73, tam-dolu
      412→465/466. **Başarısız denemeler:** pHash (gürültü), CLIP-"Diğer"-kurtarma (mobilya alt-tipi
      ayırmıyor) → kapalı. Competition sekmesi başlık/etiket İngilizce.
- [x] **(2026-06-15/16) Competitor pipeline uçtan uca doğrulandı.** Self-hosted Mac runner
      (residential IP, Trendyol 403 engeli aşıldı) → launchd kalıcı servis kuruldu (terminal
      bağımsız, Mac yeniden başlatmada otomatik). Competitor refresh: 1401/1401 ürün başarılı
      (seed 06-14 + refresh 06-15, 1400 görselli). `competitive.json` main'de: **6 kategori,
      466 ürün eşleşmesi** (RoomArt ürünü başına en yakın 3 rakip, token+fiyat benzerliği),
      **11 rekabet uyarısı**. ROOMART her kategoride görünüyor. Firestore'a da yazıldı.
      runner: `~/actions-runner`, launchd plist: `~/Library/LaunchAgents/`.
- [x] **(2026-06-10) PR #16 + #17 — ürün satış sparkline'ı (son 13 hafta) + hover grafik** (`fcc7585`,
      `679723e`). ProductTable'a **'Satış 3a'** kolonu (Sat. Hızı yanı): bağımlılıksız inline SVG
      sparkline (recharts değil, 402 satır perf); hover'da **fixed-position büyük grafik** (alan+nokta+
      "Son 13 hafta · toplam N adet") — #17 ile imleç yerine **kendi sparkline'ının hemen altına**
      sabitlendi (getBoundingClientRect, alta sığmazsa üste taşar). Veri: `trendyol_sync` ürün başına
      **haftalık net-adet serisi** (SERIES_WEEKS=13), ömür-boyu siparişlerden tek seferde (history
      beklemez; toplam=net_units ✓); `analyzer` → `sales_series` payload'da. colgroup 22→23 %100; CSV'ye
      seri. **Canlı doğrulandı** (run 27277800125 success; sales_series 401/473; deploy success).
- [x] **(2026-06-10) PR #15 — kabarcık=satış adedi + tarihli satış arşivi** (`f9944e8`). (1) BCG
      kabarcık boyutu Net Tahsilat %'ten **net satış adedine** çevrildi (marj %85-89'da varyanssızdı,
      kabarcıklar aynı boyuttaydı); `analyzer` payload'a `units`, `BCGMatrix.dotSize` alan-orantılı
      (√adet; units 1→171). (2) **sales_history/{YYYY-MM-DD}** Firestore private arşivi: `trendyol_sync.
      build_sales_snapshot` (yalın kategori+ürün, 17KB) + `save_sales_snapshot`; ölü `sales_latest`
      (876KB, yazılıp hiç okunmuyordu) kaldırıldı. Gerekçe: Trendyol API ~3 ay geçmiş döndürüyor →
      aged-out ciro arşivlenmezse kaybolur. **Canlı doğrulandı** (run 27275983962 success): CI log
      `sales_history/2026-06-10 (private; 429 ürün)`, units 401/max171, deploy success. DECISIONS 2026-06-10.
- [x] **(2026-06-10) PR #14 — Trendyol API zenginleştirmesi (6 sinyal + yaşa-göre hız KPI)** (`5924ac7`).
      `trendyol_api.fetch_orders_lifetime` (14g pencere, boş-pencere/max_days tavanı) → **ömür-boyu sipariş
      552→6452**, en eski ~2026-03-10. `trendyol_sync`: Net Tahsilat % (komisyon+promo sonrası, COGS hariç),
      İade %, promo payı, kampanya, varyant (Model+#), ürün yaşı, katalog-sağlığı bayrakları. `analyzer`:
      evren = on_sale **+ sağlıklı** (arşiv/kara-liste/reddedilmiş/kilitli hariç); yaşa-göre hız
      `units/max(yaş,14)`; `adjust_confidence` (yüksek iade/promo-şişmiş büyüme bir kademe düşürür); yeni
      KPI avg_sales_velocity/avg_net_retention/high_return_count; yeni uyarı (yüksek iade + kârsız hacim).
      Frontend: ProductTable +5 kolon (17→22, %100) + kampanya 🏷️; KPISection "Ort. Satış Hızı" (grid 9→10).
      **Sonuç:** satışı olan ürün 214→430, sinyalli 261→402, ürün-BCG STAR140/CC64/QM87/DOG112 (268-DOG bitti).
      **Canlı doğrulandı** (run 27269783973 success). Kararlar (kullanıcı): kabarcık=marj→(sonra adet),
      ömür-boyu sipariş, varyant=zenginleştirme. DECISIONS 2026-06-10.
- [x] **(2026-06-08) Products tablo layout — sayfaya sığar** (PR #10, `4574235`). `table-fixed`+`colgroup`
      (17 kolon %100) → yatay scroll yok; ürün adı `line-clamp-3` (max 3 satır, Product %17 en geniş);
      Category/Trendyol/Renk + başlıklar wrap; padding küçültüldü; BCG rozeti kısa kod (QM/CC, tam ad
      title); **"Değerlendirme" başlığı → "Yorum"**. ANTHROPIC_API_KEY secret'ı kullanıcı tarafından silindi.
- [x] **(2026-06-08) Roundtable TAMAMEN kaldırıldı** (`roundtable.yml`+`roundtable.py` silindi).
      Kök neden: günlük ❌ = Anthropic API kredisi bitmiş (kod değil, fatura). Frontend'e dokunulmadı —
      AI Strategy sekmesi analyzer önerilerini okuyor, çalışmaya devam ediyor. Doc/config temizlendi.
      ANTHROPIC_API_KEY secret'ı artık kullanılmıyor (silinebilir). Detay: DECISIONS 2026-06-08.
- [x] **(2026-06-04) PR #8 — kolon zenginleştirme: Liste/İndirim/Renk/Trendyol Kat.** (`0499d5f`).
      Tabloya 4 kolon: `Trendyol Kat.` (API categoryName, referans), `Renk` (attribute), `Liste`
      (üstü çizili list_price), `İndirim` (−%, türetilen). `trendyol_sync`'e category_name+color;
      analyzer payload'a list_price/discount/color/category_name. Marka EKLENMEDİ (%97 ROOMART).
      **Diğer denetimi:** categorize() DOĞRU — 13 Diğer ürünü gerçek diğer tipler (Duvar Rafı 7/
      Makyaj Masası 2/Çok Amaçlı 2/Portmanto 2); kural değişmedi, Trendyol Kat. kolonu gösterir.
      Canlı: list_price 475/475, color 436/475, category_name 475/475, discount 69/475. Detay: DECISIONS.
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
1. **Firmaya teslim planı (sonraki oturum):** Google Workspace Auth (Firebase + Google provider);
   scraper Mac→firma server'ı (self-hosted runner veya cron VM); benim hesapta gözlem kopyası
   (fork veya ikinci deployment). Detay ayrı plan oturumunda çıkarılacak.
2. **Firestore rules deploy:** `firebase deploy --only firestore:rules` (rules repo'da hazır, deploy'u henüz yapılmadı).
3. **Seed tamamlama (opsiyonel):** Sehpa/Mutfak Adası/Kitaplıklı kategorilerinde rakip ürün sayısı az;
   yeni mağaza ekle → `competitors.json` güncelle.
4. **Aşama 2 — Mimari göç:** Next.js + Supabase (Auth/Postgres/RLS) + Vercel (ayrı oturum/firma teslimi kapsamında).

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
