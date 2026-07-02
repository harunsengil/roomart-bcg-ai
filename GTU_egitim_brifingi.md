# Eğitim Tasarım Brifingi
## Yapay Zeka Destekli Stratejik Karar Zekâsı Sistemi (SKZS)
### Gebze Teknik Üniversitesi — Sürekli Eğitim Merkezi

> **Bu doküman kimler içindir?**
> ChatGPT Plus ve Claude Chat başta olmak üzere AI asistanlarının 8 saatlik eğitim içeriğini
> bağımsız olarak tasarlayıp geliştirebilmesi için hazırlanmış bir brifingdir.
> Ön bağlam yoktur; tüm bağlam burada verilmektedir.

---

## 1. Eğitimin Özeti

Bu eğitim, **gerçek iş verisini toplayıp analiz eden ve stratejik kararları otomatik olarak
görselleştiren bir sistem** tasarlamayı öğretir.

Temel soru: *Bir marka, kendi verisine dayanarak hangi ürününe yatırım yapmalı, hangisini
piyasaya sürmeli, hangisinden çıkmalıdır?*

Bu soruyu yanıtlamak için klasik **BCG Matrisi** (Boston Consulting Group, 1970) çerçevesi
alınır; modern veri kaynaklarıyla (API, web scraping, trend analizi) beslenir; açık kaynak
araçlarla otomatikleştirilir; interaktif bir karar panosuyla son kullanıcıya sunulur.

**Eğitim süresi:** 8 saat (önerilen: 2 × 4 saat, ardışık günler)
**Format:** Kavram dersi + canlı demo + uygulamalı atölye
**Yer:** GTÜ Sürekli Eğitim Merkezi

---

## 2. İlham Kaynağı: Gerçek Bir Proje

Bu framework, **RoomArt** (Akar Mutfak Mobilyaları, Bursa) için geliştirilen ve aktif
olarak çalışan bir sistemden damıtılmıştır. Sistem:

- Trendyol Marketplace API'sini çekerek kendi satış verisini alıyor
- Rakiplerin Trendyol mağazalarını scrape ederek fiyat/puan/yorum verisi toplanıyor
- Google Trends üzerinden pazar büyüme trendi alınıyor
- Tüm bu veriler BCG matrisi algoritmasına besleniyor
- Sonuçlar gerçek zamanlı dashboard'da görselleştiriliyor
- Her adım GitHub Actions ile günlük otomatik çalışıyor
- Sistem URL'si (GitHub Pages, canlı): https://harunsengil.github.io/roomart-bcg-ai/

Bu gerçek proje, eğitimin **vaka çalışması ve canlı demo kaynağı** olarak kullanılacaktır.

---

## 3. Genelleştirilmiş Framework: SKZS

**Stratejik Karar Zekâsı Sistemi (SKZS)** adını verdiğimiz framework şu mantıkla çalışır:

```
[Veri Kaynakları]
      ↓
 Toplayıcılar (Scraper / API / CSV)
      ↓
  Normalleştirme & Temizleme
      ↓
  Analiz Motoru (Karar Matrisi)
      ↓
   Görselleştirme (Dashboard)
      ↓
  [Stratejik Karar]
```

### Framework'ün 5 Katmanı

**Katman 1 — Veri Kaynakları**
- Kendi iç veri kaynakları: ERP, CRM, POS, e-ticaret sistemi API'leri
- Dış veri kaynakları: Rakip fiyat ve ürün scraping, Google Trends, sektör raporları
- Sektör bağımsız uygulanabilir: perakende, üretim, hizmet, kamu

**Katman 2 — Toplayıcılar**
- Python ile API istemcileri yazımı (REST, SOAP, GraphQL)
- Web scraping (BeautifulSoup, Playwright)
- Veri formatı normalizasyonu (JSON, CSV, XML → ortak şema)

**Katman 3 — Analiz Motoru**
- BCG Matrisi algoritması (pazar payı × büyüme hızı)
- Alternatif matrisler: GE-McKinsey (9 hücre), Ansoff Matrisi, SWOT → sayısal skor
- Metrik tasarımı: "Pazar payı" nasıl ölçülür? "Büyüme" hangi kaynaktan?
- Eşik belirleme: sabit mi, portföy medyanı mı, dinamik mi?
- Güven skoru (confidence): veri kalitesinin karara katkısı

**Katman 4 — Görselleştirme**
- React + Recharts/D3 ile interaktif dashboard
- Scatter plot → matris görünümü
- Tablo, trend grafiği, uyarı paneli
- Firestore gerçek zamanlı senkronizasyon

**Katman 5 — Otomasyon**
- GitHub Actions ile zamanlama (cron)
- Scraping → analiz → deploy pipeline'ı
- Veri arşivleme ve tarihsel karşılaştırma

---

## 4. Karar Matrisleri (Teorik Arka Plan)

Eğitimde önce teori, sonra uygulama:

### 4a. BCG Matrisi (temel)
- 2×2 matris: Pazar Payı (X) × Büyüme Hızı (Y)
- 4 kadran: Star (invest), Cash Cow (harvest), Question Mark (decide), Dog (divest)
- Zayıflığı: pazar payı ve büyümeyi tek boyuta indirgeme
- Gücü: sadelik, hızlı portföy tarama

### 4b. GE-McKinsey Matrisi (orta düzey)
- 3×3 matris: Endüstri Çekiciliği × Rekabetçi Güç
- Her boyut birden fazla faktörün ağırlıklı toplamı
- BCG'den daha nüanslı, daha karmaşık

### 4c. Veri ile Matris Doldurmak
- Hangi veri kaynağı → hangi metriği besler?
- Örnek: `Google Trends büyümesi → BCG Y ekseni`
- Örnek: `Kategori içi yorum payı → rakip analizi BCG'si`
- Örnek: `Kendi satış birimi payı → gerçek BCG X ekseni`
- Yapay zeka veriyi nasıl normalleştirir? (0–100 ölçek, medyan eşiği)

---

## 5. Hedef Kitle

| Profil | Ön Bilgi | Beklenti |
|---|---|---|
| Girişimci / KOBİ sahibi | İş zekâsı kavramları | Kendi iş kararlarını veriye dayandırmak |
| Pazarlama yöneticisi | Excel, temel veri | Portföy analizi otomasyonu |
| İş geliştirme uzmanı | Strateji çerçeveleri | Sayısal karar modeli kurmak |
| Teknik olmayan orta kademe yönetici | Yok | Sistemi anlayıp yönetmek |
| Junior veri analisti | Python başlangıç | Gerçek proje deneyimi |

**Ortak payda:** Python'u ya az bilen ya hiç bilmiyor, ama iş sonuçlarına odaklılar.
**Dil seviyesi:** Teknik detay mümkün olduğunca soyutlanır; kavramsal anlama öncelikli.

---

## 6. Öğrenme Çıktıları

Eğitim sonunda katılımcı:
1. BCG ve alternatif karar matrislerini sayısal veriyle doldurabilir
2. Kendi sektörü için hangi veri kaynaklarının hangi metrikleri beslediğini tasarlayabilir
3. Python'da basit bir API istemcisi yazabilir veya var olanı anlayabilir
4. GitHub Actions ile günlük otomatik veri akışını kurabilir
5. Temel bir dashboard'u konfigüre edebilir
6. AI araçlarını (ChatGPT, Claude) sistem geliştirme sürecinde kodlama asistanı olarak kullanabilir

---

## 7. Önerilen 8 Saatlik Müfredat Çerçevesi

### Blok 1 (2 saat) — Strateji Neden Veriyle Desteklenmeli?

**Kavramsal (45 dk)**
- Karar matrislerinin tarihi ve mantığı (BCG, GE-McKinsey, Ansoff)
- "Hissiyatla karar" vs "veriyle karar" karşılaştırmalı örnekler
- Gerçek BCG hatası: soru işaretini neden dog ilan ettik?

**Vaka Açıklaması (45 dk)**
- RoomArt örneği: mobilya markasının 5 kategorisi nasıl konumlandı?
- Dashboard canlı gösterimi (harunsengil.github.io/roomart-bcg-ai)
- Hangi veri ne anlama geliyor?

**Atölye (30 dk)**
- Katılımcılar kendi sektörlerinde 3–5 ürün/hizmet seçiyor
- Kâğıt üstünde BCG matrisi doldurma (tahmini veriyle)
- Grup tartışması: tahmini veri ile gerçek verinin farkı

### Blok 2 (2 saat) — Veri Nereden Gelir?

**Kavramsal (30 dk)**
- Veri kaynakları taksonomisi: iç kaynak / dış kaynak / karma
- API nedir? Web scraping nedir? Farkları ve yasal sınırları
- Sektör örnekleri: e-ticaret, turizm, finans, perakende

**Teknik Demo (60 dk)**
- Python ile Trendyol API çağrısı — canlı (terminal gösterimi)
- Google Trends verisi çekimi — pytrends demo
- Rakip fiyat scraping — 1 mağaza, 10 ürün canlı demo
- Verilerin JSON olarak kaydedilmesi

**Atölye (30 dk)**
- Katılımcılar kendi sektörlerinde veri kaynağı eşleştirmesi:
  "Büyüme hızım için hangi veriyi kullanabilirim?"
- Örnek doldurma: veri kaynağı → metrik → BCG ekseni tablosu

### Blok 3 (2 saat) — Analiz Motoru Tasarımı

**Kavramsal (30 dk)**
- Metrik tasarımı: ham veri → anlam → skor
- Normalize etmek ne demek? (0–100 ölçek, medyan eşiği)
- Ağırlıklandırma kararları: hangi kaynak ne kadar güvenilir?
- Güven skoru: az veriyle güçlü karar verilir mi?

**Kod Walkthroughı (60 dk)**
- `analyzer.py` okuma ve anlama (yorum satırları Türkçe)
- BCG skoru hesaplama mantığı adım adım
- "Eşik neden sabit 50 değil, medyan?" tartışması
- Kategori bazlı analiz, ürün bazlı analiz ayrımı

**Atölye (30 dk)**
- Basit bir skor hesaplama egzersizi (Python notebook veya Excel)
- Ağırlık değiştirince kadran nasıl değişiyor?

### Blok 4 (2 saat) — Sistem Bütünleştirme ve Otomasyon

**Kavramsal (20 dk)**
- Veri akışı pipeline'ı: topla → analiz et → görselleştir → arşivle
- Zamanlama ve otomasyon: cron job nedir, GitHub Actions nasıl çalışır?
- Deployment: GitHub Pages ücretsiz hosting mantığı

**Mimari Demo (40 dk)**
- GitHub Actions workflow dosyası okuma (scrape.yml, analyze.yml, deploy.yml)
- "Bir push nasıl tüm sistemi tetikler?"
- Firestore veri tabanı: gerçek zamanlı dashboard senkronizasyonu
- Dashboard'u konfigure etme: hangi kolonu göster, hangiyi gizle

**AI ile Sistem Geliştirme (30 dk)**
- ChatGPT ve Claude'u kodlama asistanı olarak kullanmak
- "Prompt mühendisliği for developers": verimli soru sormak
- Hata ayıklama, yeni özellik ekleme, dokümantasyon üretimi

**Kapanış Atölyesi (30 dk)**
- Katılımcılar kendi sektörleri için tam sistem tasarımı çizer:
  veri kaynakları → analiz metrikleri → kadranlar → otomasyon sıklığı
- Grup sunumları (2–3 dk/grup)
- Sonraki adım planı: "Sistemi kurmak için ne lazım?"

---

## 8. Teknik Stack (Eğitimde Kullanılacak)

| Katman | Araç | Neden? |
|---|---|---|
| Programlama | Python 3.11 | Veri ekosisteminin fiilisi; AI asistanları en iyi Python yazar |
| Veri toplama | requests, BeautifulSoup, Playwright | Kademeli karmaşıklık; gerçek dünya ihtiyaçları |
| Trend verisi | pytrends (Google Trends API) | Ücretsiz, giriş kolaylığı |
| Analiz | pandas, json | Standart; her yerde çalışır |
| Frontend | React + Recharts | Modern; template üzerinden değiştirme kolaylığı |
| Veritabanı | Firebase Firestore | Ücretsiz tier; gerçek zamanlı; şema gerektirmez |
| Otomasyon | GitHub Actions | Ücretsiz 2000 dk/ay; depo içinde yaşar |
| Hosting | GitHub Pages | Ücretsiz; anlık deploy |
| AI asistan | ChatGPT Plus + Claude Chat | Kodlama partneri rolünde |

**Kurulum gereksinimleri (katılımcı için):**
- Python 3.11+ yüklü bilgisayar
- GitHub hesabı (ücretsiz)
- Metin editörü (VS Code önerilir)
- Tarayıcı

---

## 9. Vaka Çalışmaları

Eğitimde kullanılacak üç seviyeli vaka çalışması:

### Seviye 1: Hâlihazırda Çalışan Sistem (Canlı Demo)
**RoomArt Mobilya** — Trendyol üzerinde 5 mobilya kategorisi
- Neden bu vaka: gerçek veri, gerçek kararlar, çalışan sistem
- Ne gösterilir: scraping → analiz → BCG → dashboard zinciri
- Ne tartışılır: API verisi ile scraper verisi neden farklı?

### Seviye 2: Sektör Uyarlaması (Atölye Vakası)
**Turizm:** Bir otel zincirinin oda tiplerini BCG matrisine oturtmak
- Star: yüksek doluluk + büyüyen segment (butik oda)
- Cash Cow: sürekli dolu, büyüme yok (standart oda)
- Question Mark: yeni konsept, az doluluk
- Dog: düşen segment (silindirik oda, iş seyahatçisi azaldı)
- Veri kaynakları: PMS sistemi (iç) + Booking.com rating (dış) + booking.com fiyat scraping

**Üretim (B2B):** Bir plastik enjeksiyon firmasının ürün portföyü
- Hacim, marj, pazar büyüme hızı
- Veri: ERP (iç) + sektör derneği raporu (dış)

**E-ticaret:** Çoklu pazaryeri (Trendyol + Hepsiburada + n11) entegrasyonu
- Platform bazı fiyat farkı analizi
- EAN-barcode ile ürün eşleştirme (cross-platform)

### Seviye 3: Sıfırdan Tasarım (Kâğıt Prototipi)
Katılımcılar kendi iş sektörleri için sistem tasarlar.
Kısıt: Kodlama yok, sadece sistem mimarisi ve veri akışı çizimi.

---

## 10. Egzersizler ve Değerlendirme

### Bireysel Egzersizler (her blok sonrası, ~10 dk)
1. "Kendi portföyüm için BCG kadranlama" (kâğıt)
2. "Sektörüm için veri kaynak haritası çizimi"
3. "Bir metriği tasarla: büyüme hızımı nasıl ölçerim?"
4. "Sistemi hangi sıklıkta çalıştırmalıyım ve neden?"

### Grup Çalışmaları (orta yerde, ~20 dk)
1. "Bu kadran kararı doğru mu?" — RoomArt verileri üzerinden tartışma
2. "Biz olsak hangi kaynağı kullanırdık?" — Sektör vaka çalışması
3. "Sistem nerede kırılır?" — Risk ve kısıtlar analizi

### Kapanış Değerlendirmesi
Her katılımcı veya grup, kendi sektörüne uygulanabilir bir SKZS taslağı sunar:
- Hangi ürün/hizmetler analiz edilecek?
- Hangi veri kaynakları kullanılacak?
- X ekseni ve Y ekseni nasıl tanımlanacak?
- Otomasyon ne sıklıkla çalışacak?
- Dashboard'da kim ne görecek?

---

## 11. Öğretim Teknikleri Önerileri

- **Ters eğitim (flipped):** Blok 1 teorisi öncesinde kısa video gönderilebilir
- **Canlı kodlama:** Terminal açık, katılımcılar aynı anda takip eder
- **Hata yapma teşviki:** "Şimdi bilerek yanlış yapıyorum, ne oldu?" gösterimi
- **AI partneri:** Eğitim sırasında ChatGPT veya Claude chat kullanımı teşvik edilir ("Bu hatayı AI'a soralım")
- **Gerçek hata örnekleri:** RoomArt'ta yaşanan gerçek sorunlar (fiyat tutarsızlığı, API rate limit, bot engeli) paylaşılır
- **Sektör çeşitliliği:** Katılımcı sektörleri farklıysa grup atamaları buna göre yapılır

---

## 12. Materyaller

### Eğitimci İçin
- RoomArt canlı dashboard erişimi (harunsengil.github.io/roomart-bcg-ai)
- GitHub repo kopyası (demo için)
- Python notebook'lar (her blok için hazır)
- Sunum şablonları (blok başına)

### Katılımcıya Verilecekler
- Eğitim el kitabı (PDF): kavramlar + kod örnekleri + vaka özetleri
- GitHub repository template (kendi projelerini başlatmak için)
- Kaynak listesi: kitaplar, makaleler, açık veri kaynakları
- "Sonraki Adım" checklist: eğitim sonrası ne yapmalıyım?

---

## 13. Sık Sorulan Sorular (Öngörülen)

**"Bu sistemi kurmak için programcı olmak gerekiyor mu?"**
Hayır. Kodun mantığını anlamak yeterli. Template'i konfigüre etmek için komut satırı temeli yeterli. Asıl değer: doğru soruyu sormak ve sistemi yönetmek.

**"API yoksa ne yapılır?"**
CSV export + Python CSV okuma. Her ERP sisteminden CSV alınabilir. Aynı mantık çalışır.

**"Rakip verisi çekmek yasal mı?"**
Kamuya açık fiyat ve ürün bilgisi çekmek genel olarak yasal. Kişisel veri, engelli içerik, ticari veritabanı kopyalama farklı. Eğitimde yasal sınırlar ele alınır.

**"Google Trends yeterince doğru mu?"**
Göreceli trend verir, mutlak hacim vermez. BCG Y ekseni için bir proxy. Gerçek pazar büyümesi için sektör raporlarıyla desteklenmeli.

**"Firebase ücretsiz kalır mı?"**
Spark (ücretsiz) plan: 1 GiB depolama, 50K okuma/gün. Küçük-orta portföy için yeterli.

---

## 14. AI Asistanlara Görevler

*Bu brifingı okuyan ChatGPT veya Claude, aşağıdaki görevlerden birini üstlenebilir:*

### Görev A — Müfredat Detaylandırma
Her 2 saatlik bloğun dakika dakika planını çıkar. Örnek: "Blok 1, dakika 0-5: açılış sorusu, dakika 5-20: BCG matrisi kısa tarihi..."

### Görev B — Egzersiz ve Soru Bankası
Her blok için 5 çoktan seçmeli soru, 2 açık uçlu tartışma sorusu ve 1 vaka çalışması üret. Cevap anahtarı dahil.

### Görev C — El Kitabı Taslağı
Katılımcıya verilecek 20–30 sayfalık el kitabının taslağını yaz. Bölümler: Kavramlar, Örnekler, Nasıl Yapılır Kılavuzları, Sözlük.

### Görev D — Sektör Uyarlaması
Verilen bir sektör için (örn. turizm, gıda perakende, sağlık, kamu) aynı SKZS mantığını özelleştir: hangi veri kaynakları, hangi metrikler, hangi kadranlar?

### Görev E — Sunum İskeleti
Her blok için başlık, alt başlık, anahtar mesaj, görsel önerisi ve geçiş cümlelerinden oluşan sunum iskeleti çıkar. (Mümkünse marpdown veya PowerPoint outline formatında.)

### Görev F — Değerlendirme Rubriği
Kapanış sunumu için değerlendirme rubriği: hangi boyutlar, hangi ağırlıklar, hangi puanlama ölçeği?

---

## 15. Bağlam Notları (AI Asistana)

- Eğitim dili **Türkçe**; örnekler Türk piyasasından (Trendyol, Hepsiburada, Türk firmaları)
- Soyut kavramlar somut iş senaryosuna bağlanmalı
- Kod örnekleri gösterilebilir ama eğitim programlama kursu değil, karar zekâsı kursu
- Hedef kitlede teknik olmayan katılımcılar var; jargon açıklanmalı
- Her blok sonunda katılımcı "şimdi ne yapabilirim?" sorusuna somut yanıt bulmalı
- Eğitimci not: RoomArt dashboard canlı, erişilebilir, gösterilebilir bir referans
- Framework evrensel: aynı mantık mobilyada, turizmde, üretimde, B2B'de uygulanabilir
- BCG matrisi başlangıç noktası; eğitim ilerledikçe alternatiflere geçilebilir
- AI araçlarının (ChatGPT, Claude) eğitim sürecinin parçası olması kasıtlı; "AI ile nasıl çalışılır" da öğretilmektedir

---

*Belge sonu. Bu brifing, içerik tasarımı için yeterli bağlam içermektedir.*
*Hazırlayan: Harun Şengil / RoomArt BCG AI Projesi bağlamından damıtılmıştır.*
*Tarih: Temmuz 2026*
