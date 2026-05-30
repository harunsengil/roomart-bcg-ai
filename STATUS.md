# STATUS.md — Canlı Durum Defteri

> Code ve Chat'in ortak "şu an neredeyiz" defteri. Code her iş bitiminde günceller.
> Raw: `https://raw.githubusercontent.com/harunsengil/roomart-bcg-ai/main/STATUS.md`

---

## Son Güncelleme
- **Tarih:** 2026-05-30
- **Güncelleyen:** Code
- **Aktif branch:** main

## Sistem Durumu (özet)
- Workflow'lar aktif: scrape (günlük 05:00 UTC), analyze (data push'ta),
  roundtable (günlük 06:00 UTC), deploy (Pages).
- Firestore yazımı çalışıyor (`roomart-bcg-dev/latest`).
- Dashboard yayında: https://harunsengil.github.io/roomart-bcg-ai/

## Şu An Çalışılan
- Pipeline'ın gerçek veriyle uçtan uca doğrulanması bitti (İş A). Sıradaki: scraper'ı
  gerçek Trendyol'a yöneltmek (İş C) ve [skip ci] tetik kopukluğunu çözmek (İş B).

## Bekleyen / Bloke
- [ ] İş B: scrape.yml commit'i `[skip ci]` içerdiği için analyze.yml veri push'unda
      tetiklenmiyor → BCG skorları otomatik güncellenmiyor. Çözülmeli.
- [ ] İş C: scraper.py gerçek Trendyol yerine demo/template üretiyor; çıktısı
      (products.json) analyzer tarafından okunmuyor (orphan). Gerçek snapshot yazmalı.
- [ ] Eksik dosyalar: backend/snapshot_utils.py (delta mimarisi) ve data/category_map.json
      (DİĞER override'ları) referanslı ama yok; analyzer şimdilik tek-dosya + boş map'e düşüyor.

## Son Tamamlananlar
- [x] Tam otomatik pipeline + Pages deploy kuruldu.
- [x] analyzer.py gerçek-veri BCG skor motoruna geçirildi (sahte alanlar kaldırıldı).
- [x] roundtable.py (Anthropic API) entegre edildi.
- [x] **(2026-05-30) İş A:** analyzer.py gerçek snapshot (192 ROOMART ürünü, 2026-05-18)
      üzerinde çalıştırıldı. bcg_scores.json artık dolu: 156 skorlu ürün, 36 DİĞER.
      Kadran (kategori bazlı): 4 STAR, 1 QM, 0 CASH_COW, 0 DOG. Firestore latest güncellendi,
      canlı dashboard gerçek veriyi gösteriyor.

## Sıradaki Adımlar
1. İş B — scrape→analyze tetik zincirini onar ([skip ci] kaldır veya workflow_dispatch/chain).
2. İş C — scraper.py'yi gerçek Trendyol ROOMART sayfalarından snapshots.json yazacak şekilde
   yeniden yaz; günlük snapshot biriktirmeyi başlat.
3. snapshot_utils.py + category_map.json'u ekle (delta arşiv + DİĞER atama arayüzü).

## Bilinen Sorunlar / Riskler
- Tek snapshot günü (2026-05-18) var → momentum ölçülemiyor, büyüme ekseni ayrıştırmıyor;
  bu yüzden matris şu an tek yanlı (yalnız STAR/QM, hiç CASH_COW/DOG). ≥14 gün biriktikçe düzelir.
  Kodda growth_axis_active / days_until_confident bayraklarıyla dürüstçe işaretli.
- scraper.py demo üretiyor ve çıktısı analyzer'a girmiyor; gerçek veri elle yüklenmiş
  (snapshots.json + trends_sonuc.json, 2026-05-18) ve otomatik tazelenmiyor. → İş C kritik.

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
