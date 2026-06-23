export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: string; // Instagram, WhatsApp, Sahibinden, Referans, Telefon, Diğer
  property_type: string; // Daire, Dubleks, Villa, Arsa, İş Yeri, Diğer
  room_count: string; // 1+1, 2+1, 3+1, 4+2, Arsa/Ticari vb.
  purpose?: string; // Oturumluk, Yatırımlık, Yazlık
  customer_question?: string; // Fiyat Bilgisi, Konum, vb.
  lead_status?: string; // Beklemede, Güncel Katalog vb.
  target_region: string; // Altınoluk, Akçay vb.
  current_location: string; // İstanbul, Almanya vb.
  marital_status?: string; // Evli, Bekar, Evli - 1 Çocuklu, Evli - 2 Çocuklu vb.
  occupation?: string; // Emekli, Doktor, Esnaf vb.
  rejection_reason?: string; // Mimariyi Beğenmediğinden, Farklı Proje vb.
  budget: number; // TL cinsinden
  warmth: 'cold' | 'warm' | 'hot';
  is_alert_active: boolean; // Fiyat düşerse aranacaklar listesinde olsun mu?
  notes: string;
  created_at: string;
}

export interface Appointment {
  id: string;
  lead_id: string;
  lead_name?: string; // Kolay arayüz gösterimi için
  date_time: string;
  location: string;
  status: 'pending' | 'completed' | 'cancelled';
  notes: string;
  appointment_type?: string;
}

export interface Property {
  id: string;
  title: string;
  price: number; // TL cinsinden
  region: string;
  type: string; // Dubleks, Villa vb.
  room_count: string;
  parsel?: number | string;
  bag_bol_no?: number | string;
  kat?: string;
  kull_amaci?: string;
  kapali_alan?: number;
  acik_alan?: number;
  net_alan?: number;
  brut_alan?: number;
  portfoy_adi?: string;
  extra_ozellik?: string;
  merdiven_alan?: number;
  ortak_alan?: number;
  kapali_acik_alan?: number;
  daire_sahibi?: string;
  portfoy_kimde?: string;
  created_at?: string;
}
