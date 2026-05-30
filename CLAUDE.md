# CLAUDE.md — RoomArt BCG Intelligence Platform

> Hem Claude Code hem Claude Chat için ortak bağlam. Repo kökünde tutulur.
> **Tek doğruluk kaynağı = bu repo.** Veri elle taşınmaz; iki taraf da repodan okur.
> Raw: `https://raw.githubusercontent.com/harunsengil/roomart-bcg-ai/main/CLAUDE.md`

---

## 1. Proje

Furniture markası **RoomArt** (Akar Mutfak Mobilyaları, Bursa/Mustafakemalpaşa) için
tam otomatik **BCG Matrisi Pazar Zekâsı** platformu. Konsept:
"Bloomberg Terminal × McKinsey Dashboard × Amazon Seller Analytics".
GitHub Actions + GitHub Pages üzerinde çalışır.

- **Repo:** `harunsengil/roomart-bcg-ai` (public)
- **Firebase projectId:** `roomart-bcg-ai`
- **Firestore koleksiyonu:** `roomart-bcg-dev` (doc: `latest` + tarihli)
- **Realtime DB (roundtable):** `roomart-bcg-ai-default-rtdb.europe-west1`, path `/bcg_roundtable`
- **Dashboard:** https://harunsengil.github.io/roomart-bcg-ai/

---

## 2. Teknoloji Yığını

| Katman | Teknoloji |
|---|---|
| Frontend | React + Vite + TailwindCSS |
| Veri okuma | Firestore (öncelik) → `data/*.json` (fallback) |
| Backend | Python 3.11 |
| CI / otomasyon | GitHub Actions (4 workflow) |
| Hosting | GitHub Pages |
| Trend | pytrends; Scrape | requests + beautifulsoup4 + lxml |
| AI analiz | Anthropic API (roundtable) |

---

## 3. Gerçek Repo Yapısı

```
.github/workflows/
  scrape.yml       # günlük 05:00 UTC → backend/scraper.py → data/ güncelle
  analyze.yml      # data/*.json push'unda → backend/analyzer.py → bcg_scores + Firestore
  roundtable.yml   # günlük 06:00 UTC → backend/roundtable.py → Realtime DB + deploy tetikle
  deploy.yml       # frontend/** veya data/** push → Vite build → Pages
backend/
  scraper.py       # ürün/trendyol/trends verisi toplar → data/ + Firestore
  analyzer.py      # BCG skor motoru (gerçek veri) → data/bcg_scores.json + Firestore
  roundtable.py    # Anthropic API ile kategori analizi → Realtime DB
  seed_data.py     # demo veri üreticisi (scraper'sız dashboard doldurma)
  requirements.txt
data/                # products, trendyol, trends, trends_sonuc, bcg_scores, alerts,
                     # history, snapshots .json — tek kaynak
frontend/
  src/firebase.js          # Firestore init (env: VITE_FIREBASE_*)
  src/hooks/useData.js     # Firestore→JSON fallback veri yükleme
  src/components/*.jsx      # BCGMatrix, KPICards, TrendChart, ProductTable, ...
  public/data/*.json        # build'e kopyalanan veri (analyze/deploy adımı kopyalar)
README.md, .gitignore
```

---

## 4. Veri Akışı

1. `scrape.yml` (günlük) → `scraper.py` → `data/*.json` günceller, Firestore'a yazar, commit.
2. `data/*.json` değişince `analyze.yml` tetiklenir → `analyzer.py` BCG skorlarını hesaplar
   → `data/bcg_scores.json` + Firestore `roomart-bcg-dev/latest`, sonra `frontend/public/data/`'ya kopyalar.
3. `roundtable.yml` (günlük) → `roundtable.py` Anthropic API ile kategori yorumu → Realtime DB,
   ardından `deploy.yml`'i tetikler.
4. `deploy.yml` → Vite build → GitHub Pages.
5. Dashboard `useData.js` ile önce Firestore (`roomart-bcg-dev/latest`), olmazsa `data/*.json` okur.

---

## 5. BCG Metrik Tasarımı (analyzer.py — onaylı)

- **Pazar Payı (X):** kategori-içi değerlendirme (deg) payı, 0–100 normalize.
- **Büyüme (Y):** 0.5 × Trends_büyüme + 0.5 × deg_momentum (momentum yoksa nötr 50).
- **Eşik:** portföy MEDYANI (sabit 50 değil, göreli).
- **Kadran:** STAR / CASH_COW / QUESTION_MARK / DOG.
- Sahte alanlar (revenue, monthly_sales, margin vb.) KALDIRILDI; sadece gerçek
  Trendyol verisi (fiyat + puan + deg) ve Trends kullanılır.
- Her ürün/kategoride `confidence` + gün sayısı; güven için ≥14 farklı snapshot günü.

---

## 6. İş Kategorileri (5 gerçek)

Çamaşır Makinesi Dolabı · Lavabolu Banyo Dolabı · Mutfak Adası ·
Kitaplıklı Çalışma Masası · Sehpa
(Trends köprüsü yalnız ilk ikisinde var; diğerleri nötr.)

**Rakipler:** Rani Mobilya · Kenzlife · Bofigo

---

## 7. GitHub Secrets (kurulu)

- `FIREBASE_SERVICE_ACCOUNT` — Firestore yazımı (scraper + analyzer `os.environ`'dan okur).
- `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID` — frontend build.
- `ANTHROPIC_API_KEY` — roundtable analizi.

> Not: Bu mekanizma **zaten çalışıyor**. Secret JSON'u `json.loads` ile okunur; ayrı bir
> sync script'i veya `service_account.json` dosyasına gerek yoktur.

---

## 8. Mevcut Durum

- Sistem ayakta: 84+ commit, günlük otomatik veri akışı, Pages deploy aktif.
- Firebase entegrasyonu ve secret'lar kurulu, Firestore'a yazım çalışıyor.

> Detaylı/canlı durum için **STATUS.md**'ye bak. Bu bölüm yalnızca özet.

---

## 9. Code ⇄ Chat Çalışma Protokolü

**Claude Code (uygulama):** kod/dosya düzenleme, `backend/` script çalıştırma & debug,
workflow ayarı, `git commit/push`. İş bitince `STATUS.md`'yi günceller.

**Claude Chat (düşünme):** BCG mantığı, kategori/rakip stratejisi, veri yorumu,
mimari tartışma. Güncel dosyaları raw URL ile okur (elle yapıştırma yok).

**Senkron:**
- Code push yapar → Chat `raw.githubusercontent.com/.../main/<dosya>` ile okur.
- Yeni karar çıkınca → `DECISIONS.md`'ye tarihli satır (Code ekler).
- Branch farklıysa raw URL'de branch belirt.

**Çalışma dizini uyarısı:** `backend/` scriptleri repo kökünden veri yolunu
`Path(__file__).parent.parent / "data"` ile çözer. Workflow'lar repo kökünden çalışır,
`pip install -r backend/requirements.txt` kullanır. Yerelde de kökten çalıştır.
