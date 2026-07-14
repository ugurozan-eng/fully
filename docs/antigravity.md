# Antigravity Proje Takip Belgesi

Bu dosya, projedeki en güncel durumu ve çalışma geçmişini takip etmek için kullanılır. Her yeni oturum (session) veya devir teslim (handoff) durumunda ilk olarak bu belge okunmalıdır.

## Temel Kurallar (Ground Rules)
1. **Dosya Silme:** İzin alınmadan hiçbir dosya silinmeyecektir (Never delete files before permission).
2. **Faz Sonu Güncellemesi:** Her faz bittiğinde [handoff.md](file:///c:/Claude%20Projects/Fully/docs/handoff.md) güncellenecektir. Bu kural hem bu dosyada hem de sistem talimatlarında sabitlenmiştir.
3. **Süreklilik:** Bu proje başka bir geliştiriciye devredilse dahi, en son nerede kalındığı bu dosya aracılığıyla kolayca takip edilebilecektir.

## Mevcut Durum (Current Status)
* **Tarih:** 2026-07-14
* **Faz:** Excel İçe Aktarma İyileştirmeleri (Tamamlandı)
* **Son Durum:** Excel/CSV yükleme ekranına dinamik politikalar (sekmeye ve seçime göre), Müşteri Yükleme Modu (Üzerine Ekle / Sil ve Sıfırdan Yükle), kolon format uyuşmazlığı kontrolü ve in-memory oluşturulan Excel şablon indirme özellikleri başarıyla eklendi. Production build testi sorunsuz tamamlandı.

## Yapılacaklar Listesi (To-Do)
- [x] Kullanıcıdan gelen soru cevaplarına göre mimariyi netleştirmek.
- [x] Faz 1: Proje Kurulumu ve Vercel Deploy.
- [x] Faz 2: Excel / CSV Veri İçe Aktarma.
- [x] Faz 3: Mobil Uyum ve Optimizasyon (Yatay kayan menü, 2x2 stats kartı, dikey sıralama).
- [x] Faz 4: Matchmaker ve WhatsApp Raporlama.
- [x] Faz 5: Raporlama/Info Sol Sidebar Menü ve Müşteri Düzenleme Grid Tablosu.
- [x] Faz 6: Satış Durumu ve Ayrı Tablo Listeleme, Varsayılan Oda Tipi Seçimi Düzeltmeleri.
- [x] Raporlama Sekmesi ve Analitik Grafiklerin Düzeltilmesi (Tarih filtreleri, 6 dağılım grafiği ve Excel huni filtreli rapor listesi).
- [x] Excel/CSV Yükleme Akışı Revizyonu (Dinamik politikalar, seçmeli müşteri yükleme modu, hata bildirimi ve Excel örnek şablonları).
