'use client';

import React, { useState, useEffect } from 'react';
import { StorageManager } from '@/lib/storage';
import { Lead } from '@/lib/types';
import { CheckCircle2, Send, Home, DollarSign, MapPin, Briefcase } from 'lucide-react';

export default function PublicIntake() {
  const [submitted, setSubmitted] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const [formData, setFormData] = useState<Partial<Lead>>({
    name: '',
    phone: '',
    email: '',
    source: 'Referans', // Marked as Reference or QR Form
    property_type: 'Daire',
    room_count: '2+1',
    purpose: 'Oturumluk',
    target_region: '',
    current_location: '',
    marital_status: 'Evli',
    occupation: '',
    budget: 0,
    warmth: 'warm', // Default warmth for incoming leads
    is_alert_active: true,
    notes: '',
  });

  useEffect(() => {
    // Make sure we have the theme applied on the public page
    const savedTheme = localStorage.getItem('fully-theme') || 'midnight-neon';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      alert('Lütfen Ad Soyad ve Telefon numarası alanlarını doldurun.');
      return;
    }
    setLoading(true);

    const newLead: Lead = {
      id: crypto.randomUUID(),
      name: formData.name,
      phone: formData.phone,
      email: formData.email || '',
      source: 'QR Kod Formu',
      property_type: formData.property_type || 'Daire',
      room_count: formData.room_count || '2+1',
      purpose: formData.purpose || 'Oturumluk',
      target_region: formData.target_region || '',
      current_location: formData.current_location || '',
      marital_status: formData.marital_status || 'Evli',
      occupation: formData.occupation || '',
      budget: Number(formData.budget) || 0,
      warmth: 'warm',
      is_alert_active: true,
      notes: formData.notes || '',
      created_at: new Date().toISOString(),
    };

    try {
      await StorageManager.saveLead(newLead);
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      alert('Kayıt sırasında bir hata oluştu. Lütfen tekrar deneyin.');
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        background: 'var(--bg-primary)'
      }}>
        <div className="glass-panel animate-fade-in" style={{ maxWidth: '500px', width: '100%', textAlign: 'center', padding: '3rem 2rem' }}>
          <div style={{ display: 'inline-flex', background: 'rgba(52, 211, 153, 0.1)', color: 'var(--color-success)', padding: '1rem', borderRadius: '50%', marginBottom: '1.5rem' }}>
            <CheckCircle2 size={48} />
          </div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '1rem' }}>Talebiniz Alındı!</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: '1.6', marginBottom: '2rem' }}>
            Aradığınız emlak kriterleri ve bütçe bilgileriniz başarıyla satış ekibimize iletilmiştir. Sizin için en uygun portföyleri hazırlayıp en kısa sürede iletişime geçeceğiz.
          </p>
          <button 
            onClick={() => {
              setSubmitted(false);
              setFormData({
                name: '', phone: '', email: '', source: 'Referans', property_type: 'Daire',
                room_count: '2+1', purpose: 'Oturumluk', target_region: '', current_location: '',
                marital_status: 'Evli', occupation: '', budget: 0, warmth: 'warm', is_alert_active: true, notes: '',
              });
            }}
            className="glow-btn"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            Yeni Form Doldur
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      padding: '2rem 1rem',
      background: 'var(--bg-primary)',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div className="glass-panel animate-fade-in" style={{ maxWidth: '650px', width: '100%', padding: '2rem' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, letterSpacing: '-0.5px' }}>
            Emlak Talep & <span className="gradient-text">İletişim Formu</span>
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            Lütfen aradığınız gayrimenkul detaylarını ve bilgilerinizi giriniz.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1.25rem' }}>
            {/* Column 1 */}
            <div>
              <div className="form-group">
                <label>Adınız Soyadınız *</label>
                <input 
                  type="text" 
                  required
                  className="form-control"
                  placeholder="Örn: Uğur Ozan"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Telefon Numaranız *</label>
                <input 
                  type="text" 
                  required
                  className="form-control"
                  placeholder="Örn: 05XXXXXXXXX"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>E-posta Adresiniz</label>
                <input 
                  type="email" 
                  className="form-control"
                  placeholder="mail@example.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Yaşadığınız Şehir/Ülke</label>
                <input 
                  type="text" 
                  className="form-control"
                  placeholder="Örn: İstanbul, Almanya"
                  value={formData.current_location}
                  onChange={(e) => setFormData({ ...formData, current_location: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Mesleğiniz</label>
                <input 
                  type="text" 
                  className="form-control"
                  placeholder="Örn: Doktor, Emekli vb."
                  value={formData.occupation}
                  onChange={(e) => setFormData({ ...formData, occupation: e.target.value })}
                />
              </div>
            </div>

            {/* Column 2 */}
            <div>
              <div className="form-group">
                <label>İlgilendiğiniz Emlak Tipi</label>
                <select 
                  className="form-control"
                  value={formData.property_type}
                  onChange={(e) => setFormData({ ...formData, property_type: e.target.value })}
                >
                  <option value="Daire">Daire</option>
                  <option value="Dubleks">Dubleks</option>
                  <option value="Villa">Villa</option>
                  <option value="Müstakil Ev">Müstakil Ev</option>
                  <option value="Arsa">Arsa</option>
                  <option value="Ticari">Ticari / İş Yeri</option>
                </select>
              </div>

              <div className="form-group">
                <label>Oda İhtiyacınız</label>
                <select 
                  className="form-control"
                  value={formData.room_count}
                  onChange={(e) => setFormData({ ...formData, room_count: e.target.value })}
                >
                  <option value="1+1">1+1</option>
                  <option value="2+1">2+1</option>
                  <option value="3+1">3+1</option>
                  <option value="4+1">4+1</option>
                  <option value="4+2">4+2</option>
                  <option value="Villa/Arsa">Villa/Arsa Tipi (Oda Yok)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Maksimum Bütçeniz (TL) *</label>
                <input 
                  type="number" 
                  required
                  className="form-control"
                  placeholder="Maksimum Bütçeniz"
                  value={formData.budget || ''}
                  onChange={(e) => setFormData({ ...formData, budget: Number(e.target.value) })}
                />
              </div>

              <div className="form-group">
                <label>Alım Amacınız</label>
                <select 
                  className="form-control"
                  value={formData.purpose}
                  onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                >
                  <option value="Oturumluk">Kendi Oturumunuz İçin</option>
                  <option value="Yatırımlık">Yatırım Amaçlı</option>
                  <option value="Yazlık">Yazlık Kullanım</option>
                </select>
              </div>

              <div className="form-group">
                <label>İlgilendiğiniz Bölge / Konum</label>
                <input 
                  type="text" 
                  className="form-control"
                  placeholder="Örn: Altınoluk Sahil, Güre"
                  value={formData.target_region}
                  onChange={(e) => setFormData({ ...formData, target_region: e.target.value })}
                />
              </div>
            </div>
          </div>

          <div className="form-group" style={{ marginTop: '1rem' }}>
            <label>Özel İstekleriniz / Notlar</label>
            <textarea 
              className="form-control"
              placeholder="Örn: Havuzlu site içi, denize yakın, bahçe dubleksi..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            />
          </div>

          <button 
            type="submit" 
            disabled={loading}
            className="glow-btn" 
            style={{ width: '100%', justifyContent: 'center', marginTop: '1rem' }}
          >
            <Send size={18} /> {loading ? 'Gönderiliyor...' : 'Bilgilerimi Gönder'}
          </button>
        </form>
      </div>
    </div>
  );
}
