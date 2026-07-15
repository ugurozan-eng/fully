# Handoff Report: Fully CRM (Emlak Satış & Lead Takip CRM)

Bu doküman, Fully CRM projesinin tüm gelişim geçmişini, mimari kararlarını, veri şemalarını, işlevsel modüllerini ve geliştirme yönergelerini new conversation bağlamındaki yeni acenteye eksiksiz aktarmak için hazırlanmıştır.

---

## 1. Teknolojik Altyapı & Mimari
* **Framework**: Next.js (App Router, v14/15+) + TypeScript.
* **Tasarım & Stil**: Vanilla CSS (Tailwind CSS kullanılmamıştır). Premium Midnight Neon (Koyu mor ve neon pembeler) ve Forest Ocean (Koyu yeşil ve teal tonları) temaları mevcuttur.
* **Tarayıcı & Mobil Uyumluluk**: iOS WebKit/Safari ve mobil tarayıcı çökme sorunlarını engellemek için `backdrop-filter` kaldırılmış, tüm `localStorage` işlemleri güvenli try-catch blokları ile sarılmıştır. Dokunmatik alanlar mobil uyumluluk için en az `48px` boyutundadır.
* **Veritabanı Katmanı**:
  * **Bulut (Vercel Postgres)**: `@neondatabase/serverless` istemcisi ile Neon altyapısı.
  * **Çevrimdışı/Yerel Yedek (Offline Fallback)**: Veritabanı bağlantısı olmadığında veya yerel çalışırken `src/lib/storage.ts` (`StorageManager`) üzerinden tamamen LocalStorage yedekleme sistemi devreye girer.

---

## 2. Veri Şemaları (Data Schemas)

### A. Müşteri (Lead) Arayüzü
```typescript
export interface Lead {
  id: string;
  name: string;
  phone: string;
  current_location?: string;
  warmth: 'hot' | 'warm' | 'cold';
  source?: string;
  room_count?: string;
  lead_status?: string;
  customer_question?: string;
  notes?: string;
  budget?: number;
  purpose?: string;
  target_region?: string;
  appointment_date?: string;
  last_update_info?: string;
  created_at?: string;
  updated_at?: string;
}
```

### B. Daire / Portföy (Property) Arayüzü
```typescript
export interface Property {
  id: string;
  title: string;
  price: number;
  region: string;
  type: string; // Kullanım amacı (Mesken, Ofis, Dükkan vb.)
  room_count: string;
  parsel: string;
  bag_bol_no: string;
  kat: string;
  kull_amaci?: string;
  kapali_alan?: number;
  acik_alan?: number;
  net_alan?: number;
  brut_alan?: number;
  portfoy_adi?: string;
  extra_ozellik?: string;
  portfoy_kimde?: string;
  merdiven_alan?: number;
  ortak_alan?: number;
  kapali_acik_alan?: number;
  daire_sahibi?: string;
  is_sold?: boolean; // Satış durumu
}
```

### C. Randevu (Appointment) Arayüzü
```typescript
export interface Appointment {
  id: string;
  lead_id?: string;
  lead_name: string;
  lead_phone: string;
  date_time: string;
  location?: string;
  notes?: string;
  type: string;
  status: 'pending' | 'completed' | 'cancelled';
  created_at?: string;
}
```

---

## 3. Tamamlanan Modüller & İşlevler

### 1. CRM Paneli (Dashboard)
* **KPI Özet Kartları**: Toplam müşteri, sıcak (hot) müşteriler, bekleyen randevular ve aktif dairelerin sayısını gösteren mobil uyumlu `2x2` grid düzen.
* **Trend Grafik**: Gün bazında müşteri kazanım ivmesini ve randevu sıklığını gösteren saf SVG grafik yapısı.
* **Günün Randevuları**: Saat sıralı olarak günün aktif randevularını listeler.
* **Soğuk (Cold) Leads Takibi**: Düşük sıcaklıktaki müşterileri listeleyen hızlı takip alanı.

### 2. Excel İçe Aktarma & Kolon Eşleştirme (Excel Import)
* **Çoklu Sayfa Desteği**: `xlsx` kütüphanesi yardımıyla kullanıcı dosyasındaki sayfaları süzüp en uygun sayfayı otomatik seçer.
* **Turkish-Aware Kolon Fuzzy Finder**: Kolon başlıklarını Türkçe karakter duyarsızlaştırarak normalleştirir (`cleanStringForCompare`) ve otomatik eşler (örneğin: `Görüşme Detayı` -> `notes`).
* **Conflict Resolution**: Eşlenemeyen kolonlar için kullanıcının manuel eşleme yapabildiği ve verileri yüklemeden önce önizleyebildiği UI tablosu.

### 3. Matchmaker (Akıllı Eşleştirici)
Eşleştirici ekranı horizontal sub-tab yapısına sahiptir:
* **Müşteri Eşleştirici**: Seçilen müşteriyi bütçesinin **+%10 üst tolerans sınırına** göre ve oda talebi/not anahtar kelimeleriyle (`bahçeli`, `dubleks`) aktif mülklerle eşler. **Satılan daireler eşleşmelerden tamamen hariç tutulur.** Tek tıkla pre-filled WhatsApp mesaj şablonu oluşturarak paylaşma imkanı sunar.
* **Portföy & Daire Yönetimi**: Aktif mülkleri listeler. Daire silmek yerine **"Satıldı"** seçeneği getirilmiştir. Satılan daireler, listenin en altında ayrı bir **"Satılan Daireler"** tablosuna taşınır ve opacity `0.65` ile soluk renkte listelenir.
* **Müşteri Veritabanı (Restored)**: Tüm leads veritabanını listeleyen tablo. Gelişmiş inline düzenleme sunar: Girdiler odak kaybında (`onBlur`) otomatik kaydedilir; Sıcaklık ve Kanal açılır seçim kutuları (`<select>`) anında veriyi günceller. Her kolon başlığında Excel tarzı popover filtreleme (benzersiz değer listesi, metin süzme ve A-Z / Z-A sıralama) mevcuttur. Stacking context sorununu gidermek amacıyla aktif popover açıldığında `<th>` z-index değeri dinamik olarak `1000` yapılır.

### 4. Raporlama ve Analiz
* **Info (Boss Daily Report)**: Günlük CRM aktivite özetini patrona WhatsApp üzerinden doğrudan göndermek için şablonlu text üreteç.
* **Raporlar (CRM Raporları)**: Rapor leads tablosu üzerinde Excel tipi filtreleme ve sıralama sistemi. Tarih filtreleri ("Tüm Zamanlar", "Bugün", "Dün", "Bu Hafta", "Bu Ay", "Tarih Aralığı") ile veriyi süzme. Başlığın yanındaki "Excel'e Aktar" butonu ile filtrelenmiş ve sıralanmış güncel verileri otomatik kolon genişlikleri ve sayısal bütçe formatı ile doğrudan `.xlsx` formatında dışa aktarma.
* **KPI Grafikleri**: Alt kısımdaki 5 adet dağılım grafiği (Sıcaklık, Müşteri Edinme Kanalları, Oda İhtiyacı vb. - Alım Amacı grafiği kaldırılmıştır) **bilinmeyen, blank (`""`) veya `"-"` değerleri oransal hesaplamaya dahil etmeyecek** şekilde güncellenmiştir.

### 5. Yeni Kayıt Formları & Boş Başlangıç
* Yeni Müşteri Ekleme ve Daire Ekleme formlarında `room_count` varsayılan değeri `'2+1'` yerine boş string `''` yapılmıştır. Kullanıcının herhangi bir varsayılan seçim görmeden sıfırdan seçim yapması sağlanmıştır.

### 6. QR Giriş (Public Intake)
* `/public/intake` adresinde, projeyi ziyaret eden dış kullanıcıların kendi telefon ve taleplerini girmelerini sağlayan public form. Midnight Neon ve Forest Ocean temalarını destekler. Kayıt başarılı olduğunda özel bir teşekkür sayfasına yönlendirir.

### 7. Excel/CSV Veri Yükleme Revizyonları
* **Dinamik Politika Uyarısı:** Aktif sekmeye göre yeşil/kırmızı renkli dinamik politika rozetleri eklendi (Daire yüklemesinde silinerek yükleneceği, müşteri yüklemesinde seçime göre silineceği veya üzerine yazılacağı uyarısı verilir).
* **Müşteri Yükleme Modu:** Müşteri yüklemeleri için "Mevcut Verilerin Üzerine Ekle" (varsayılan) ve "Sistemdekileri Sil ve Sıfırdan Yükle" seçenekleri eklendi.
* **Kolon Format Doğrulaması:** Excel yüklendiğinde gerekli kolonlar bulunamazsa işlem durdurularak şık bir format hatası uyarısı ve zorunlu şablon sütunları listelenmektedir.
* **Manuel Sütun Eşleştirme (Daire Portföyü):** Müşteri importunda olduğu gibi Daire Portföyü (Properties) için de manuel kolon eşleştirme dropdown'ları eklendi. Eşleşme problemleri elle kolon seçilerek giderilebilmektedir.
* **Bellekte Örnek Excel Üretimi:** Arayüze "Örnek Şablonu İndir (.xlsx)" butonları eklendi. Bu butonlar dosya gereksinimi duymadan `xlsx` kütüphanesi ile çalışma zamanında örnek dosya üretip indirmektedir.

---

## 4. Bir Sonraki Oturumda Yapılacaklar & Eksiklikler (Sonraki Adım)
Bir sonraki geliştirme oturumunda doğrudan ele alınacak bilinen sorunlar ve eksiklikler şunlardır:
1. **Müşteri Veritabanı Tablo Filtreleri**: Müşteri Veritabanı tablosundaki sütun başlığı filtreleri (Excel huni filtre popover'ları) arayüzde fiziksel olarak yer almaktadır ancak işlevsel olarak süzme işlemini gerçekleştirmemektedir. Sonraki adımda bu filtrelerin çalışır hale getirilmesi planlanmaktadır.
2. [TAMAMLANDI] **Raporlama/Info Sekmeleri**: Sol menüdeki "Raporlama/Info" sekmesi altındaki **Raporlar** (`reports-general`) ve **Info** (`reports-info`) alt sekmeleri tamamen çalışır durumdadır. Tarih aralığı filtreleri, 6 dağılım grafiği (boş veriler hariç) ve Excel tipi popover filtreli leads listesi entegre edilmiştir.

---

## 5. Geliştirici & Test Yönergeleri
* **Geliştirme Sunucusu**: `npm run dev`
* **TypeScript & Derleme Kontrolü**: `npm run build` (Hataları kontrol etmek için production build alınmalıdır).
* **Canlı Ortam**: Proje Vercel production üzerinde çalışmaktadır.
  * **Üretim Linki**: [https://fully-delta.vercel.app](https://fully-delta.vercel.app)
