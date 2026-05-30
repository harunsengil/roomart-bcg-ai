# STATUS.md — Canlı Durum Defteri

> Code ve Chat'in ortak "şu an neredeyiz" defteri. Code her iş bitiminde günceller.
> Raw: `https://raw.githubusercontent.com/harunsengil/roomart-bcg-ai/main/STATUS.md`

---

## Son Güncelleme
- **Tarih:** 2026-05-30
- **Güncelleyen:** Code
- **Aktif branch:** main (doğrudan main'e çalışıyoruz; tek geliştirici)

## Sistem Durumu (özet)
- Workflow'lar aktif: scrape (günlük 05:00 UTC), analyze (data push'ta),
  roundtable (günlük 06:00 UTC), deploy (Pages).
- Firestore yazımı çalışıyor (`roomart-bcg-dev/latest`).
- Dashboard yayında: https://harunsengil.github.io/roomart-bcg-ai/

## Şu An Çalışılan
- İş B (tetik zinciri) kodlaması bitti, main'e push edildi. Kalan: zincirin canlı
  doğrulaması (Actions UI'dan analyze tetikle → deploy otomatik mi). Sıradaki büyük iş: İş C.

## Bekleyen / Bloke
- [ ] İş B doğrulama: Actions UI'dan `BCG Analysis` → "Run workflow" tetikle; loglarda
      "Dashboard deploy tetiklendi" + `Deploy Dashboard` otomatik koşuyor mu teyit et.
      (Yerelde `gh` CLI kurulu değil; doğrulama UI'dan yapılacak.)
- [ ] İş C: scraper.py gerçek Trendyol yerine demo/template üretiyor; çıktısı
      (products.json) analyzer tarafından okunmuyor (orphan). Gerçek `snapshots.json` yazmalı.
      Bunu yazınca scrape→analyze halkası kendiliğinden canlanır (zincir hazır).
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
- [x] **(2026-05-30) İş B:** GitHub Actions tetik zinciri onarıldı. Kök neden: GITHUB_TOKEN
      push'ları başka workflow tetiklemiyor (push-path cascade çalışmaz). Çözüm: roundtable'daki
      explicit `createWorkflowDispatch` pattern'i eksik halkalara uygulandı —
      scrape→analyze ve analyze→deploy. Dispatch yalnız commit gerçekten atıldığında
      (`steps.commit.outputs.changed`) tetiklenir. analyze.yml push paths gerçek girdilere
      (snapshots.json/trends_sonuc.json/category_map.json) çevrildi; iki workflow'a `actions: write` eklendi.

## Sıradaki Adımlar
1. İş B'yi Actions UI'dan canlı doğrula (yukarıdaki Bekleyen maddesi).
2. İş C — scraper.py'yi gerçek Trendyol ROOMART sayfalarından snapshots.json yazacak şekilde
   yeniden yaz; günlük snapshot biriktirmeyi başlat. (Tetik zinciri hazır; scraper snapshot
   yazınca scrape→analyze→deploy uçtan uca akar.)
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
