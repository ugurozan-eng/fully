export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: string; // Instagram, WhatsApp, Sahibinden, Referans, Telefon, Diğer
  property_type: string; // Daire, Dubleks, Villa, Arsa, İş Yeri, Diğer
  room_count: string; // 1+1, 2+1, 3+1, 4+2, Arsa/Ticari vb.
  purpose: string; // Oturumluk, Yatırımlık, Yazlık
  target_region: string; // Altınoluk, Akçay vb.
  current_location: string; // İstanbul, Almanya vb.
  marital_status: string; // Evli, Bekar, Evli - 1 Çocuklu, Evli - 2 Çocuklu vb.
  occupation: string; // Emekli, Doktor, Esnaf vb.
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
}

export interface Property {
  id: string;
  title: string;
  price: number; // TL cinsinden
  region: string;
  type: string; // Dubleks, Villa vb.
  room_count: string;
  created_at?: string;
}
