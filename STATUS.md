# STATUS.md — Canlı Durum Defteri

> Code ve Chat'in ortak "şu an neredeyiz" defteri. Code her iş bitiminde günceller.
> Raw: `https://raw.githubusercontent.com/harunsengil/roomart-bcg-ai/main/STATUS.md`

---

## Son Güncelleme
- **Tarih:** 2026-05-30
- **Güncelleyen:** Code
- **Aktif branch:** main (doğrudan main'e çalışıyoruz; tek geliştirici)

## Sistem Durumu (özet)
- **Pipeline OTONOM ve uçtan uca doğrulandı (2026-05-30):** scrape (gerçek Trendyol,
  Playwright, günlük 05:00 UTC) → analyze → deploy zinciri explicit dispatch ile çalışıyor.
- Firestore yazımı CI'da doğru projeye (`roomart-bcg-ai`) gidiyor; **yerel** analyzer
  `roomart-bcg-dev` projesine yazar (prod'u güncellemez) — bkz Bilinen Sorunlar.
- Dashboard yayında: https://harunsengil.github.io/roomart-bcg-ai/ (Overview, Products, Assign,
  Trends, Alerts, AI Strategy, Batch sekmeleri).
- snapshots.json artık **2 gün** (2026-05-18, 2026-05-30); momentum ekseni aktif
  (`growth_axis_active=true`, `days_until_confident=12`).

## Şu An Çalışılan
- a+b+c (v1) tamamlandı ve canlı. Sistem günlük otonom akıyor; aktif bir görev yok.
  Sıradaki opsiyonlar "Sıradaki Adımlar"da.

## Bekleyen / Bloke
- [ ] Gürültü temizliği: iPhone vb. mobilya-dışı ürünler DİĞER'de. Assign sekmesinden
      "Hariç Tut" (`__EXCLUDE__`) ile category_map.json'a eklenip commit edilmeli.
- [ ] backend/snapshot_utils.py (delta arşiv) — snapshots.json günlük büyüyor; ileride.
- [ ] v2: yeni-ürün keşfi (mağaza enumerate Playwright'la; haftalik_snapshot.py'de vardı).
      Şu an seed sabit (snapshots.json son günü), yeni ürün otomatik gelmiyor.

## Son Tamamlananlar
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

## Sıradaki Adımlar
1. Gürültü temizliği: Assign sekmesinden mobilya-dışı ürünleri "Hariç Tut" → category_map.json commit.
2. v2: yeni-ürün keşfi (mağaza enumerate, Playwright; 403'ü gerçek tarayıcı geçiyordu).
3. snapshot_utils.py (delta arşiv) — snapshots.json büyümesi için.
4. (Düşük öncelik) Actions Node20 deprecation yükseltmesi; roundtable failure (Anthropic) incelemesi.

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
