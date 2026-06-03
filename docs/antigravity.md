# Antigravity Proje Takip Belgesi

Bu dosya, projedeki en güncel durumu ve çalışma geçmişini takip etmek için kullanılır. Her yeni oturum (session) veya devir teslim (handoff) durumunda ilk olarak bu belge okunmalıdır.

## Temel Kurallar (Ground Rules)
1. **Dosya Silme:** İzin alınmadan hiçbir dosya silinmeyecektir (Never delete files before permission).
2. **Faz Sonu Güncellemesi:** Her faz bittiğinde [handoff.md](file:///c:/Claude%20Projects/Fully/docs/handoff.md) güncellenecektir. Bu kural hem bu dosyada hem de sistem talimatlarında sabitlenmiştir.
3. **Süreklilik:** Bu proje 2 ay sonra başka bir geliştiriciye devredilse dahi, en son nerede kalındığı bu dosya aracılığıyla kolayca takip edilebilecektir.

## Mevcut Durum (Current Status)
* **Tarih:** 2026-06-03
* **Faz:** Faz 2 - Excel / CSV Veri İçe Aktarma (Import) Modülü (Planlama Aşaması)
* **Son Durum:** Giriş paneli (Login) talebi kullanıcının kararıyla ertelendi. Mevcut müşteri listelerinin sisteme yüklenebilmesi için Excel (.xlsx, .xls) ve CSV yükleme modülü planlamasına geçildi. Plan kullanıcıya iletildi.

## Yapılacaklar Listesi (To-Do)
- [x] Kullanıcıdan gelen soru cevaplarına göre mimariyi netleştirmek.
- [x] Faz 1: Proje Kurulumu ve Vercel Deploy.
- [ ] Faz 2: Excel / CSV Veri İçe Aktarma.
  - [ ] Kullanıcıdan Excel kolon isimlerini ve mükerrer kayıt kurallarını öğrenmek.
  - [ ] `xlsx` kütüphanesini projeye eklemek.
  - [ ] Kolon Eşleştirme (Column Mapping) arayüzünü tasarlamak.
  - [ ] Toplu kayıt ekleme motorunu ve mükerrer kontrolünü yazmak.
  - [ ] walkthrough.md ve handoff.md güncellemek.
