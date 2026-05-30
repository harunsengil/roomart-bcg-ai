---
description: İş bitiminde STATUS.md güncelle, commit & push, raw URL ver
---

1. Bu oturumda ne yaptığımızı kısaca özetle.
2. `STATUS.md`'yi güncelle: tarih bugüne, Güncelleyen: Code; "Son Tamamlananlar",
   "Şu An Çalışılan", "Sıradaki Adımlar" güncel hale gelsin.
3. Mimari/stratejik karar verildiyse `DECISIONS.md`'ye tarihli satır ekle.
4. `git add -A && git commit -m "<anlamlı mesaj>" && git push`.
   Not: data/ veya frontend/ değiştiyse ilgili workflow (analyze/deploy) otomatik tetiklenir;
   commit mesajında otomasyonu durdurmak istemiyorsan `[skip ci]` KULLANMA.
5. Push edilen commit hash'ini ve Chat'in okuması gereken raw URL'leri bana ver.
