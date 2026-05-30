# STATUS.md — Canlı Durum Defteri

> Code ve Chat'in ortak "şu an neredeyiz" defteri. Code her iş bitiminde günceller.
> Raw: `https://raw.githubusercontent.com/harunsengil/roomart-bcg-ai/main/STATUS.md`

---

## Son Güncelleme
- **Tarih:** 2026-05-29
- **Güncelleyen:** Harun (ilk kurulum)
- **Aktif branch:** main

## Sistem Durumu (özet)
- Workflow'lar aktif: scrape (günlük 05:00 UTC), analyze (data push'ta),
  roundtable (günlük 06:00 UTC), deploy (Pages).
- Firestore yazımı çalışıyor (`roomart-bcg-dev/latest`).
- Dashboard yayında: https://harunsengil.github.io/roomart-bcg-ai/

## Şu An Çalışılan
- (buraya yaz)

## Bekleyen / Bloke
- [ ] (buraya yaz)

## Son Tamamlananlar
- [x] Tam otomatik pipeline + Pages deploy kuruldu.
- [x] analyzer.py gerçek-veri BCG skor motoruna geçirildi (sahte alanlar kaldırıldı).
- [x] roundtable.py (Anthropic API) entegre edildi.

## Sıradaki Adımlar
1. (buraya yaz)

## Bilinen Sorunlar / Riskler
- Snapshot momentum güveni için ≥14 farklı gün gerekiyor; erken dönemde büyüme nötr (50).
- scraper.py şu an demo/template ürün üretiyor mu, gerçek Trendyol mü — netleştir.

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
