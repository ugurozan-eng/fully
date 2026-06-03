'use client';

import React, { useState, useEffect } from 'react';
import Header from '@/components/Header';
import { StorageManager } from '@/lib/storage';
import { Lead, Appointment, Property } from '@/lib/types';
import { 
  Plus, Phone, Calendar, Trash2, Edit, Check, X, 
  AlertTriangle, AlertCircle, Share2, QrCode, Search, 
  RefreshCw, Briefcase, MapPin, Heart, DollarSign, MessageCircle,
  CheckCircle2
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';

export default function Home() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Excel Import States
  const [excelWorkbook, setExcelWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelRows, setExcelRows] = useState<any[][]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({
    name: '',
    phone: '',
    source: '',
    property_type: '',
    room_count: '',
    current_location: '',
    target_region: '',
    notes: '',
    warmth_outcome: '',
    appointment_date: '',
    budget: '',
  });
  const [importing, setImporting] = useState<boolean>(false);
  const [importSuccess, setImportSuccess] = useState<boolean>(false);
  const [importCount, setImportCount] = useState<number>(0);

  const parseSheet = (wb: XLSX.WorkBook, sheetName: string) => {
    try {
      const ws = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];

      if (data.length === 0) {
        alert('Seçilen sayfa boş görünüyor.');
        return;
      }

      // Smart header row finder
      let headerRowIdx = 0;
      let found = false;

      for (let i = 0; i < Math.min(data.length, 25); i++) {
        const row = data[i] || [];
        const hasName = row.some(cell => {
          const val = String(cell || '').toLowerCase();
          return val.includes('isim') || val.includes('ad soyad') || val.includes('adısayadı');
        });
        const hasPhone = row.some(cell => {
          const val = String(cell || '').toLowerCase();
          return val === 'tel' || val.includes('telefon') || val.includes('gsm') || val.includes('telno');
        });

        if (hasName && hasPhone) {
          headerRowIdx = i;
          found = true;
          break;
        }
      }

      // Fallback: If not found, use the first row that has at least 3 non-empty values
      if (!found) {
        for (let i = 0; i < Math.min(data.length, 10); i++) {
          const row = data[i] || [];
          const nonCount = row.filter(cell => cell !== undefined && String(cell).trim() !== '').length;
          if (nonCount >= 3) {
            headerRowIdx = i;
            break;
          }
        }
      }

      const headers = (data[headerRowIdx] || []).map(h => String(h || '').trim());
      const rows = data.slice(headerRowIdx + 1);

      setExcelHeaders(headers);
      setExcelRows(rows);
      setSelectedSheet(sheetName);
      setImportSuccess(false);

      // Auto mapping logic
      const newMap = {
        name: '', phone: '', source: '', property_type: '', room_count: '',
        current_location: '', target_region: '', notes: '', warmth_outcome: '',
        appointment_date: '', budget: '',
      };
      
      headers.forEach((h) => {
        const lowerH = h.toLowerCase();
        if (lowerH.includes('isim') || lowerH.includes('ad soyad') || lowerH.includes('adısayadı')) newMap.name = h;
        else if (lowerH === 'tel' || lowerH.includes('telefon') || lowerH.includes('gsm')) newMap.phone = h;
        else if (lowerH.includes('kaynak') || lowerH.includes('kanal') || lowerH.includes('kategori')) newMap.source = h;
        else if (lowerH.includes('daire') || lowerH.includes('emlak tipi') || lowerH.includes('ilgilen')) newMap.room_count = h;
        else if (lowerH === 'il' || lowerH.includes('şehir') || lowerH.includes('yaşadığı')) newMap.current_location = h;
        else if (lowerH.includes('bölge') || lowerH.includes('konum')) newMap.target_region = h;
        else if (lowerH.includes('not') || lowerH.includes('açıklama')) newMap.notes = h;
        else if (lowerH.includes('sonuç') || lowerH.includes('durum') || lowerH.includes('aksiyon')) newMap.warmth_outcome = h;
        else if (lowerH.includes('randevu')) newMap.appointment_date = h;
        else if (lowerH.includes('bütçe') || lowerH.includes('fiyat')) newMap.budget = h;
      });
      setColumnMap(newMap);
    } catch (err) {
      console.error(err);
      alert('Sayfa okunurken bir hata oluştu.');
    }
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt?.target?.result;
        if (!bstr) return;
        const wb = XLSX.read(bstr, { type: 'binary' });
        setExcelWorkbook(wb);
        setSheetNames(wb.SheetNames);

        // Find the best sheet containing Lead data
        let bestSheetName = wb.SheetNames[0];
        for (const name of wb.SheetNames) {
          const ws = wb.Sheets[name];
          const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
          
          let hasName = false;
          let hasPhone = false;
          
          // Check first 15 rows of the sheet
          for (let i = 0; i < Math.min(data.length, 15); i++) {
            const row = data[i] || [];
            const nMatch = row.some(cell => {
              const val = String(cell || '').toLowerCase();
              return val.includes('isim') || val.includes('ad soyad') || val.includes('adısayadı');
            });
            const pMatch = row.some(cell => {
              const val = String(cell || '').toLowerCase();
              return val === 'tel' || val.includes('telefon') || val.includes('gsm');
            });
            if (nMatch) hasName = true;
            if (pMatch) hasPhone = true;
          }

          if (hasName && hasPhone) {
            bestSheetName = name;
            break;
          }
        }

        parseSheet(wb, bestSheetName);
      } catch (err) {
        console.error(err);
        alert('Excel dosyası okunurken hata oluştu. Lütfen dosya formatını kontrol edin.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const runImport = async () => {
    if (!columnMap.name || !columnMap.phone) {
      alert('Lütfen en azından "Adı Soyadı" ve "Telefon Numarası" kolonlarını eşleştirin.');
      return;
    }

    setImporting(true);
    let imported = 0;

    const nameIdx = excelHeaders.indexOf(columnMap.name);
    const phoneIdx = excelHeaders.indexOf(columnMap.phone);
    const sourceIdx = columnMap.source ? excelHeaders.indexOf(columnMap.source) : -1;
    const roomCountIdx = columnMap.room_count ? excelHeaders.indexOf(columnMap.room_count) : -1;
    const currentLocationIdx = columnMap.current_location ? excelHeaders.indexOf(columnMap.current_location) : -1;
    const targetRegionIdx = columnMap.target_region ? excelHeaders.indexOf(columnMap.target_region) : -1;
    const notesIdx = columnMap.notes ? excelHeaders.indexOf(columnMap.notes) : -1;
    const warmthIdx = columnMap.warmth_outcome ? excelHeaders.indexOf(columnMap.warmth_outcome) : -1;
    const appDateIdx = columnMap.appointment_date ? excelHeaders.indexOf(columnMap.appointment_date) : -1;
    const budgetIdx = columnMap.budget ? excelHeaders.indexOf(columnMap.budget) : -1;

    for (const row of excelRows) {
      const nameVal = String(row[nameIdx] || '').trim();
      const phoneVal = String(row[phoneIdx] || '').trim();

      if (!nameVal || !phoneVal) continue; // Skip rows without name or phone

      // Extract details
      const sourceVal = sourceIdx >= 0 ? String(row[sourceIdx] || '') : 'Excel Yükleme';
      const roomCountVal = roomCountIdx >= 0 ? String(row[roomCountIdx] || '') : '';
      const currentLocationVal = currentLocationIdx >= 0 ? String(row[currentLocationIdx] || '') : '';
      const targetRegionVal = targetRegionIdx >= 0 ? String(row[targetRegionIdx] || '') : '';
      
      // Combine multiple context if needed
      let notesVal = notesIdx >= 0 ? String(row[notesIdx] || '') : '';
      
      // Smart warmth parser based on status column
      let warmthVal: 'cold' | 'warm' | 'hot' = 'warm';
      if (warmthIdx >= 0) {
        const rawWarmth = String(row[warmthIdx] || '').toLowerCase();
        if (rawWarmth.includes('red') || rawWarmth.includes('iptal') || rawWarmth.includes('olumsuz')) {
          warmthVal = 'cold';
        } else if (rawWarmth.includes('randevu') || rawWarmth.includes('sıcak') || rawWarmth.includes('kapatıldı') || rawWarmth.includes('olumlu')) {
          warmthVal = 'hot';
        }
      }

      const budgetVal = budgetIdx >= 0 ? Number(String(row[budgetIdx] || '').replace(/\D/g, '')) || 0 : 0;
      
      // Create lead
      const leadId = crypto.randomUUID();
      const newLead: Lead = {
        id: leadId,
        name: nameVal,
        phone: phoneVal,
        email: '',
        source: sourceVal,
        property_type: 'Daire', // Default
        room_count: roomCountVal || '2+1',
        purpose: 'Oturumluk',
        target_region: targetRegionVal,
        current_location: currentLocationVal,
        marital_status: 'Evli',
        occupation: '',
        budget: budgetVal,
        warmth: warmthVal,
        is_alert_active: true,
        notes: notesVal,
        created_at: new Date().toISOString(),
      };

      await StorageManager.saveLead(newLead);

      // Create appointment if appointment date is valid
      if (appDateIdx >= 0 && row[appDateIdx]) {
        const rawAppDate = String(row[appDateIdx]).trim();
        if (rawAppDate && rawAppDate !== 'Bilinmiyor') {
          // Attempt to parse date in dd.mm.yyyy format
          let formattedDateStr = '';
          const parts = rawAppDate.split('.');
          if (parts.length === 3) {
            // Convert dd.mm.yyyy to yyyy-mm-dd
            formattedDateStr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}T12:00`;
          } else {
            const dateObj = new Date(rawAppDate);
            if (!isNaN(dateObj.getTime())) {
              formattedDateStr = dateObj.toISOString().slice(0, 16);
            }
          }

          if (formattedDateStr) {
            const newApp: Appointment = {
              id: crypto.randomUUID(),
              lead_id: leadId,
              date_time: formattedDateStr,
              location: 'Ofis / Yerinde Gösterim',
              status: 'pending',
              notes: `Excel'den otomatik oluşturuldu. Orijinal tarih: ${rawAppDate}`,
            };
            await StorageManager.saveAppointment(newApp);
          }
        }
      }

      imported++;
    }

    setImportCount(imported);
    setImportSuccess(true);
    setImporting(false);
    setExcelHeaders([]);
    setExcelRows([]);
    await loadAllData();
  };

  // Form States
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [newLead, setNewLead] = useState<Partial<Lead>>({
    name: '',
    phone: '',
    email: '',
    source: 'Instagram',
    property_type: 'Daire',
    room_count: '2+1',
    purpose: 'Oturumluk',
    target_region: '',
    current_location: '',
    marital_status: 'Evli',
    occupation: '',
    budget: 0,
    warmth: 'warm',
    is_alert_active: true,
    notes: '',
  });

  const [newApp, setNewApp] = useState<Partial<Appointment>>({
    lead_id: '',
    date_time: '',
    location: '',
    status: 'pending',
    notes: '',
  });

  const [newProperty, setNewProperty] = useState<Partial<Property>>({
    title: '',
    price: 0,
    region: '',
    type: 'Daire',
    room_count: '2+1',
  });

  // Load Data
  const loadAllData = async () => {
    setLoading(true);
    try {
      const dbLeads = await StorageManager.getLeads();
      const dbApps = await StorageManager.getAppointments();
      const dbProps = await StorageManager.getProperties();
      setLeads(dbLeads);
      setAppointments(dbApps);
      setProperties(dbProps);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Save Lead
  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLead.name || !newLead.phone) {
      alert('Lütfen Ad ve Telefon numarası alanlarını doldurun.');
      return;
    }
    const leadToSave: Lead = {
      id: editingLead ? editingLead.id : crypto.randomUUID(),
      name: newLead.name,
      phone: newLead.phone,
      email: newLead.email || '',
      source: newLead.source || 'Instagram',
      property_type: newLead.property_type || 'Daire',
      room_count: newLead.room_count || '2+1',
      purpose: newLead.purpose || 'Oturumluk',
      target_region: newLead.target_region || '',
      current_location: newLead.current_location || '',
      marital_status: newLead.marital_status || 'Evli',
      occupation: newLead.occupation || '',
      budget: Number(newLead.budget) || 0,
      warmth: newLead.warmth as 'cold' | 'warm' | 'hot' || 'warm',
      is_alert_active: newLead.is_alert_active !== undefined ? newLead.is_alert_active : true,
      notes: newLead.notes || '',
      created_at: editingLead ? editingLead.created_at : new Date().toISOString(),
    };

    await StorageManager.saveLead(leadToSave);
    await loadAllData();
    
    // Reset state
    setEditingLead(null);
    setNewLead({
      name: '',
      phone: '',
      email: '',
      source: 'Instagram',
      property_type: 'Daire',
      room_count: '2+1',
      purpose: 'Oturumluk',
      target_region: '',
      current_location: '',
      marital_status: 'Evli',
      occupation: '',
      budget: 0,
      warmth: 'warm',
      is_alert_active: true,
      notes: '',
    });
    setActiveTab('dashboard');
  };

  // Start Editing Lead
  const startEditLead = (lead: Lead) => {
    setEditingLead(lead);
    setNewLead(lead);
    setActiveTab('add-lead');
  };

  // Delete Lead
  const handleDeleteLead = async (id: string) => {
    if (confirm('Bu müşteriyi silmek istediğinizden emin misiniz?')) {
      await StorageManager.deleteLead(id);
      loadAllData();
    }
  };

  // Save Appointment
  const handleSaveApp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newApp.lead_id || !newApp.date_time) {
      alert('Lütfen Müşteri ve Tarih/Saat alanlarını doldurun.');
      return;
    }
    const appToSave: Appointment = {
      id: crypto.randomUUID(),
      lead_id: newApp.lead_id,
      date_time: newApp.date_time,
      location: newApp.location || '',
      status: 'pending',
      notes: newApp.notes || '',
    };
    await StorageManager.saveAppointment(appToSave);
    await loadAllData();

    setNewApp({
      lead_id: '',
      date_time: '',
      location: '',
      status: 'pending',
      notes: '',
    });
  };

  // Change Appointment Status
  const handleAppStatus = async (app: Appointment, nextStatus: 'pending' | 'completed' | 'cancelled') => {
    const updated = { ...app, status: nextStatus };
    await StorageManager.saveAppointment(updated);
    loadAllData();
  };

  // Delete Appointment
  const handleDeleteApp = async (id: string) => {
    if (confirm('Bu randevuyu silmek istediğinizden emin misiniz?')) {
      await StorageManager.deleteAppointment(id);
      loadAllData();
    }
  };

  // Save Property
  const handleSaveProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProperty.title || !newProperty.price) {
      alert('Lütfen Mülk Başlığı ve Fiyat alanlarını doldurun.');
      return;
    }
    const propToSave: Property = {
      id: crypto.randomUUID(),
      title: newProperty.title,
      price: Number(newProperty.price) || 0,
      region: newProperty.region || '',
      type: newProperty.type || 'Daire',
      room_count: newProperty.room_count || '2+1',
    };
    await StorageManager.saveProperty(propToSave);
    await loadAllData();

    setNewProperty({
      title: '',
      price: 0,
      region: '',
      type: 'Daire',
      room_count: '2+1',
    });
  };

  // Delete Property
  const handleDeleteProperty = async (id: string) => {
    if (confirm('Bu mülkü silmek istediğinizden emin misiniz?')) {
      await StorageManager.deleteProperty(id);
      loadAllData();
    }
  };

  // Dynamic public intake url (points to /public/intake page)
  const getIntakeUrl = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/public/intake`;
    }
    return 'https://fully-crm.vercel.app/public/intake';
  };

  // Generate boss report text
  const generateBossReport = () => {
    const today = new Date().toLocaleDateString('tr-TR');
    
    // Stats calculation
    const todayStart = new Date();
    todayStart.setHours(0,0,0,0);
    
    const newLeadsCount = leads.length; // Simply count all or filter by creation date
    const pendingAppsCount = appointments.filter(a => a.status === 'pending').length;
    const completedAppsCount = appointments.filter(a => a.status === 'completed').length;
    const hotLeadsCount = leads.filter(l => l.warmth === 'hot').length;

    return `📢 *GÜNLÜK EMLAK SATIŞ RAPORU* - ${today}\n\n` +
           `👤 *Toplam Kayıtlı Müşteri:* ${newLeadsCount}\n` +
           `🔥 *Sıcak (Hot) Lead Adedi:* ${hotLeadsCount}\n` +
           `📅 *Bekleyen Randevular:* ${pendingAppsCount}\n` +
           `✅ *Gerçekleşen Sunum/Randevu:* ${completedAppsCount}\n\n` +
           `📝 *Not:* Sistem verileri otomatik derlenmiştir. Dilediğiniz gibi güncelleyebilirsiniz.`;
  };

  const [reportText, setReportText] = useState<string>('');
  const [bossPhone, setBossPhone] = useState<string>('');

  useEffect(() => {
    setReportText(generateBossReport());
  }, [leads, appointments]);

  const handleSendReport = () => {
    const encodedText = encodeURIComponent(reportText);
    const cleanPhone = bossPhone.replace(/\D/g, ''); // numbers only
    const url = cleanPhone 
      ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedText}`
      : `https://api.whatsapp.com/send?text=${encodedText}`;
    window.open(url, '_blank');
  };

  // Filter leads by search query
  const filteredLeads = leads.filter(l => 
    l.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (l.phone && l.phone.includes(searchQuery)) ||
    (l.target_region && l.target_region.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Split leads by warmth for CRM columns
  const coldLeads = filteredLeads.filter(l => l.warmth === 'cold');
  const warmLeads = filteredLeads.filter(l => l.warmth === 'warm');
  const hotLeads = filteredLeads.filter(l => l.warmth === 'hot');

  // Format currency helper
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(val);
  };

  return (
    <div className="main-container" style={{ maxWidth: '1400px', width: '100%', margin: '0 auto', padding: '0 1rem 3rem 1rem' }}>
      <Header activeTab={activeTab} setActiveTab={(tab) => {
        if (tab !== 'add-lead') setEditingLead(null);
        setActiveTab(tab);
      }} />

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', flexDirection: 'column', gap: '1rem' }}>
          <RefreshCw className="animate-spin" size={40} style={{ color: 'var(--color-primary)' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Veriler yükleniyor...</p>
        </div>
      ) : (
        <main className="animate-fade-in">
          {/* Quick Stats Banner */}
          {activeTab === 'dashboard' && (
            <div className="stats-grid" style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '1.25rem',
              marginBottom: '2rem'
            }}>
              <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--color-primary)' }}>
                <div style={{ background: 'rgba(167, 139, 250, 0.1)', color: 'var(--color-primary)', padding: '0.75rem', borderRadius: '12px' }}>
                  <Briefcase size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Toplam Lead</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{leads.length}</div>
                </div>
              </div>

              <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--color-danger)' }}>
                <div style={{ background: 'rgba(248, 113, 113, 0.1)', color: 'var(--color-danger)', padding: '0.75rem', borderRadius: '12px' }}>
                  <Heart size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Sıcak Müşteri</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{leads.filter(l => l.warmth === 'hot').length}</div>
                </div>
              </div>

              <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--color-success)' }}>
                <div style={{ background: 'rgba(52, 211, 153, 0.1)', color: 'var(--color-success)', padding: '0.75rem', borderRadius: '12px' }}>
                  <Calendar size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Aktif Randevu</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{appointments.filter(a => a.status === 'pending').length}</div>
                </div>
              </div>

              <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', gap: '1rem', borderLeft: '4px solid var(--color-accent)' }}>
                <div style={{ background: 'rgba(34, 211, 238, 0.1)', color: 'var(--color-accent)', padding: '0.75rem', borderRadius: '12px' }}>
                  <DollarSign size={24} />
                </div>
                <div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Aktif Portföy</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800 }}>{properties.length}</div>
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div>
              {/* Search Bar */}
              <div className="glass-panel" style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '2rem', padding: '0.75rem 1.5rem' }}>
                <Search size={20} style={{ color: 'var(--text-muted)' }} />
                <input
                  type="text"
                  placeholder="Müşteri adı, telefon numarası veya bölge arayın..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    color: 'var(--text-primary)',
                    width: '100%',
                    fontSize: '1rem',
                  }}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                    <X size={18} />
                  </button>
                )}
              </div>

              {/* CRM swimlanes */}
              <div className="crm-columns-grid" style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                gap: '1.5rem',
                alignItems: 'start'
              }}>
                {/* 1. HOT LEADS COLUMN */}
                <div className="glass-panel" style={{ background: 'rgba(248, 113, 113, 0.02)', borderColor: 'rgba(248, 113, 113, 0.15)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-danger)' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-danger)' }}></span>
                      Sıcak Takip (Hot)
                    </h3>
                    <span className="badge badge-hot">{hotLeads.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {hotLeads.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>Müşteri bulunmuyor.</p>
                    ) : (
                      hotLeads.map(l => renderLeadCard(l))
                    )}
                  </div>
                </div>

                {/* 2. WARM LEADS COLUMN */}
                <div className="glass-panel" style={{ background: 'rgba(251, 191, 36, 0.02)', borderColor: 'rgba(251, 191, 36, 0.15)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-warning)' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-warning)' }}></span>
                      Potansiyel (Warm)
                    </h3>
                    <span className="badge badge-warm">{warmLeads.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {warmLeads.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>Müşteri bulunmuyor.</p>
                    ) : (
                      warmLeads.map(l => renderLeadCard(l))
                    )}
                  </div>
                </div>

                {/* 3. COLD LEADS COLUMN */}
                <div className="glass-panel" style={{ background: 'rgba(59, 130, 246, 0.02)', borderColor: 'rgba(59, 130, 246, 0.15)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#60a5fa' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }}></span>
                      Bilgi Alındı (Cold)
                    </h3>
                    <span className="badge badge-cold">{coldLeads.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {coldLeads.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>Müşteri bulunmuyor.</p>
                    ) : (
                      coldLeads.map(l => renderLeadCard(l))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: ADD/EDIT LEAD */}
          {activeTab === 'add-lead' && (
            <div className="glass-panel" style={{ maxWidth: '800px', margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>
                  {editingLead ? 'Müşteri Bilgilerini Düzenle' : 'Yeni Lead / Müşteri Kaydı'}
                </h2>
                {editingLead && (
                  <button 
                    onClick={() => {
                      setEditingLead(null);
                      setNewLead({
                        name: '', phone: '', email: '', source: 'Instagram', property_type: 'Daire',
                        room_count: '2+1', purpose: 'Oturumluk', target_region: '', current_location: '',
                        marital_status: 'Evli', occupation: '', budget: 0, warmth: 'warm', is_alert_active: true, notes: '',
                      });
                      setActiveTab('dashboard');
                    }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem', cursor: 'pointer' }}
                  >
                    <X size={18} /> İptal Et
                  </button>
                )}
              </div>

              <form onSubmit={handleSaveLead}>
                <div className="form-columns-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem' }}>
                  {/* Left Column */}
                  <div>
                    <div className="form-group">
                      <label>Adı Soyadı *</label>
                      <input 
                        type="text" 
                        required
                        className="form-control" 
                        placeholder="Örn: Uğur Ozan" 
                        value={newLead.name}
                        onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label>Telefon Numarası *</label>
                      <input 
                        type="text" 
                        required
                        className="form-control" 
                        placeholder="Örn: 905XXXXXXXXX" 
                        value={newLead.phone}
                        onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label>E-posta Adresi</label>
                      <input 
                        type="email" 
                        className="form-control" 
                        placeholder="mail@example.com" 
                        value={newLead.email}
                        onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label>Nereden Geldi? (Lead Kaynağı)</label>
                      <select 
                        className="form-control"
                        value={newLead.source}
                        onChange={(e) => setNewLead({ ...newLead, source: e.target.value })}
                      >
                        <option value="Instagram">Instagram</option>
                        <option value="WhatsApp">WhatsApp</option>
                        <option value="Sahibinden">Sahibinden</option>
                        <option value="Referans">Referans</option>
                        <option value="Telefon">Telefon Görüşmesi</option>
                        <option value="Acenta Ofis">Fiziksel Ofis</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Sıcaklık Seviyesi (Warmth)</label>
                      <select 
                        className="form-control"
                        value={newLead.warmth}
                        onChange={(e) => setNewLead({ ...newLead, warmth: e.target.value as any })}
                      >
                        <option value="hot">🔥 Sıcak (Hot)</option>
                        <option value="warm">⚡ Potansiyel (Warm)</option>
                        <option value="cold">❄️ Bilgi Alındı (Cold)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Bütçe (TL) *</label>
                      <input 
                        type="number" 
                        required
                        className="form-control" 
                        placeholder="Maksimum Bütçe" 
                        value={newLead.budget || ''}
                        onChange={(e) => setNewLead({ ...newLead, budget: Number(e.target.value) })}
                      />
                    </div>
                  </div>

                  {/* Right Column */}
                  <div>
                    <div className="form-group">
                      <label>İlgilendiği Emlak Tipi</label>
                      <select 
                        className="form-control"
                        value={newLead.property_type}
                        onChange={(e) => setNewLead({ ...newLead, property_type: e.target.value })}
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
                      <label>Oda İhtiyacı</label>
                      <select 
                        className="form-control"
                        value={newLead.room_count}
                        onChange={(e) => setNewLead({ ...newLead, room_count: e.target.value })}
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
                      <label>Alım Amacı</label>
                      <select 
                        className="form-control"
                        value={newLead.purpose}
                        onChange={(e) => setNewLead({ ...newLead, purpose: e.target.value })}
                      >
                        <option value="Oturumluk">Kendi Oturacak (Oturumluk)</option>
                        <option value="Yatırımlık">Yatırım Amaçlı (Yatırımlık)</option>
                        <option value="Yazlık">Yaz Dönemi İçin (Yazlık)</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Aradığı / İlgilendiği Bölge</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="Örn: Altınoluk Sahil, Güre" 
                        value={newLead.target_region}
                        onChange={(e) => setNewLead({ ...newLead, target_region: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label>Müşterinin Yaşadığı Yer</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="Örn: İstanbul, Almanya" 
                        value={newLead.current_location}
                        onChange={(e) => setNewLead({ ...newLead, current_location: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label>Medeni Hali & Aile Yapısı</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="Örn: Evli - 2 Çocuklu" 
                        value={newLead.marital_status}
                        onChange={(e) => setNewLead({ ...newLead, marital_status: e.target.value })}
                      />
                    </div>

                    <div className="form-group">
                      <label>Mesleği</label>
                      <input 
                        type="text" 
                        className="form-control" 
                        placeholder="Örn: Emekli Mühendis, Esnaf" 
                        value={newLead.occupation}
                        onChange={(e) => setNewLead({ ...newLead, occupation: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label>Müşteri Özel Notları</label>
                  <textarea 
                    className="form-control" 
                    placeholder="Örn: Bahçeli istiyor, giriş kat sevmiyor, kredi uygunluğu önemli..."
                    value={newLead.notes}
                    onChange={(e) => setNewLead({ ...newLead, notes: e.target.value })}
                  />
                </div>

                <div className="form-group" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.75rem', marginTop: '1rem', marginBottom: '1.5rem' }}>
                  <input 
                    type="checkbox" 
                    id="is_alert_active"
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                    checked={newLead.is_alert_active}
                    onChange={(e) => setNewLead({ ...newLead, is_alert_active: e.target.checked })}
                  />
                  <label htmlFor="is_alert_active" style={{ cursor: 'pointer', fontSize: '0.95rem' }}>
                    **Fiyat Düşüşü Alarmı Aktif:** Ev fiyatlarında indirim olduğunda bu müşteriye ulaşalım.
                  </label>
                </div>

                <button type="submit" className="glow-btn" style={{ width: '100%', justifyContent: 'center' }}>
                  <Check size={18} /> {editingLead ? 'Bilgileri Güncelle' : 'Müşteriyi Kaydet'}
                </button>
              </form>
            </div>
          )}

          {/* TAB CONTENT: APPOINTMENTS */}
          {activeTab === 'appointments' && (
            <div className="appointments-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
              {/* Form Side */}
              <div className="glass-panel" style={{ height: 'fit-content' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.25rem' }}>Yeni Randevu Planla</h3>
                <form onSubmit={handleSaveApp}>
                  <div className="form-group">
                    <label>Müşteri Seçin *</label>
                    <select 
                      className="form-control"
                      required
                      value={newApp.lead_id}
                      onChange={(e) => setNewApp({ ...newApp, lead_id: e.target.value })}
                    >
                      <option value="">-- Müşteri Seçin --</option>
                      {leads.map(l => (
                        <option key={l.id} value={l.id}>{l.name} ({l.phone})</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Randevu Tarih ve Saati *</label>
                    <input 
                      type="datetime-local" 
                      required
                      className="form-control"
                      value={newApp.date_time}
                      onChange={(e) => setNewApp({ ...newApp, date_time: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Randevu Yeri / Mülk Adresi</label>
                    <input 
                      type="text" 
                      className="form-control"
                      placeholder="Örn: Altınoluk 3+1 Daire Yerinde Gösterim"
                      value={newApp.location}
                      onChange={(e) => setNewApp({ ...newApp, location: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Açıklama / Özel Notlar</label>
                    <textarea 
                      className="form-control"
                      placeholder="Müşterinin özel beklentileri veya yanındaki ek döküman notları..."
                      value={newApp.notes}
                      onChange={(e) => setNewApp({ ...newApp, notes: e.target.value })}
                    />
                  </div>

                  <button type="submit" className="glow-btn" style={{ width: '100%', justifyContent: 'center' }}>
                    <Plus size={18} /> Randevu Ekle
                  </button>
                </form>
              </div>

              {/* List Side */}
              <div className="glass-panel" style={{ flexGrow: 1 }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.25rem' }}>Planlanmış Randevular</h3>
                {appointments.length === 0 ? (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '4rem 0' }}>Planlanmış randevu bulunmuyor.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {appointments.map(a => (
                      <div key={a.id} className="glass-panel" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                          <div>
                            <h4 style={{ fontWeight: 700, fontSize: '1.05rem' }}>{a.lead_name}</h4>
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
                              <Calendar size={12} /> {new Date(a.date_time).toLocaleString('tr-TR')}
                            </p>
                            {a.location && (
                              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginTop: '0.2rem' }}>
                                <MapPin size={12} /> {a.location}
                              </p>
                            )}
                          </div>
                          <span className={`badge ${
                            a.status === 'completed' ? 'badge-hot' : a.status === 'cancelled' ? 'badge-cold' : 'badge-warm'
                          }`} style={{ background: a.status === 'completed' ? 'rgba(52, 211, 153, 0.1)' : undefined, color: a.status === 'completed' ? 'var(--color-success)' : undefined }}>
                            {a.status === 'completed' ? 'Tamamlandı' : a.status === 'cancelled' ? 'İptal Edildi' : 'Bekliyor'}
                          </span>
                        </div>
                        {a.notes && (
                          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.75rem', background: 'rgba(0,0,0,0.1)', padding: '0.5rem', borderRadius: '6px' }}>
                            {a.notes}
                          </p>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem', borderTop: '1px solid var(--glass-border)', paddingTop: '0.75rem' }}>
                          {a.status === 'pending' && (
                            <>
                              <button 
                                onClick={() => handleAppStatus(a, 'completed')}
                                className="glow-btn" 
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', background: 'var(--success-gradient)', boxShadow: 'none' }}
                              >
                                Tamamla
                              </button>
                              <button 
                                onClick={() => handleAppStatus(a, 'cancelled')}
                                className="glow-btn" 
                                style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', background: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)', boxShadow: 'none' }}
                              >
                                İptal Et
                              </button>
                            </>
                          )}
                          <button 
                            onClick={() => handleDeleteApp(a.id)}
                            style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '0.25rem' }}
                            title="Randevuyu Sil"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB CONTENT: MATCHMAKER (SMART MATCHING) */}
          {activeTab === 'matchmaker' && (
            <div className="matchmaker-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem' }}>
              {/* Add Property Form */}
              <div className="glass-panel" style={{ height: 'fit-content' }}>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.25rem' }}>Satışa Çıkan Gayrimenkul Girişi</h3>
                <form onSubmit={handleSaveProperty}>
                  <div className="form-group">
                    <label>Mülk Başlığı / Portföy İsmi *</label>
                    <input 
                      type="text" 
                      required
                      className="form-control"
                      placeholder="Örn: Altınoluk Sahilinde Dubleks"
                      value={newProperty.title}
                      onChange={(e) => setNewProperty({ ...newProperty, title: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Satış Fiyatı (TL) *</label>
                    <input 
                      type="number" 
                      required
                      className="form-control"
                      placeholder="Gayrimenkul Fiyatı"
                      value={newProperty.price || ''}
                      onChange={(e) => setNewProperty({ ...newProperty, price: Number(e.target.value) })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Bölge *</label>
                    <input 
                      type="text" 
                      required
                      className="form-control"
                      placeholder="Örn: Altınoluk"
                      value={newProperty.region}
                      onChange={(e) => setNewProperty({ ...newProperty, region: e.target.value })}
                    />
                  </div>

                  <div className="form-group">
                    <label>Oda Sayısı</label>
                    <select 
                      className="form-control"
                      value={newProperty.room_count}
                      onChange={(e) => setNewProperty({ ...newProperty, room_count: e.target.value })}
                    >
                      <option value="1+1">1+1</option>
                      <option value="2+1">2+1</option>
                      <option value="3+1">3+1</option>
                      <option value="4+1">4+1</option>
                      <option value="4+2">4+2</option>
                    </select>
                  </div>

                  <button type="submit" className="glow-btn" style={{ width: '100%', justifyContent: 'center' }}>
                    <Plus size={18} /> Gayrimenkul Kaydet
                  </button>
                </form>
              </div>

              {/* Matching Panel */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', flexGrow: 1 }}>
                <div className="glass-panel">
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.25rem' }}>Kayıtlı Portföyler & Akıllı Bütçe Eşleşmeleri</h3>
                  {properties.length === 0 ? (
                    <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '4rem 0' }}>Kayıtlı portföy bulunmuyor.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                      {properties.map(p => {
                        // Find matching leads whose budget >= property price and flag is active
                        const matchedLeads = leads.filter(l => l.budget >= p.price && l.is_alert_active);

                        return (
                          <div key={p.id} className="glass-panel" style={{ background: 'rgba(255,255,255,0.02)', padding: '1rem', borderLeft: `4px solid ${matchedLeads.length > 0 ? 'var(--color-success)' : 'var(--text-muted)'}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div>
                                <h4 style={{ fontWeight: 800, fontSize: '1.1rem' }}>{p.title}</h4>
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.2rem', flexWrap: 'wrap' }}>
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>📍 {p.region}</span>
                                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>🏠 {p.room_count}</span>
                                </div>
                                <p style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--color-primary)', marginTop: '0.5rem' }}>
                                  {formatCurrency(p.price)}
                                </p>
                              </div>
                              <button 
                                onClick={() => handleDeleteProperty(p.id)}
                                style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer' }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>

                            {/* Match alert section */}
                            <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--glass-border)' }}>
                              {matchedLeads.length > 0 ? (
                                <div>
                                  <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.5rem' }}>
                                    <Check size={16} /> Bütçesi Uyan Sıcak Müşteriler ({matchedLeads.length})
                                  </p>
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                    {matchedLeads.map(l => (
                                      <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(52, 211, 153, 0.05)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid rgba(52, 211, 153, 0.1)' }}>
                                        <div>
                                          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{l.name}</div>
                                          <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Maksimum Bütçe: {formatCurrency(l.budget)}</div>
                                        </div>
                                        <a 
                                          href={`https://api.whatsapp.com/send?phone=${l.phone.replace(/\D/g, '')}&text=Merhaba ${l.name}, istediğiniz bütçeye uygun yeni bir portföyümüz geldi: ${p.title}. Detayları görüşmek ister misiniz?`}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="glow-btn"
                                          style={{ padding: '0.35rem 0.75rem', fontSize: '0.75rem', background: 'var(--success-gradient)', boxShadow: 'none' }}
                                        >
                                          WhatsApp'tan Ulaş
                                        </a>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Bu mülk bütçesine uyan ve fiyat alarmı açık olan bir müşteri henüz bulunmuyor.</p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB CONTENT: DAILY REPORTS */}
          {activeTab === 'reports' && (
            <div className="glass-panel" style={{ maxWidth: '700px', margin: '0 auto' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '1.25rem' }}>Patron Bilgilendirme Raporu</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                Günlük emlak satış ve lead hareketleri özetini düzenleyip doğrudan WhatsApp üzerinden patrona gönderebilirsiniz.
              </p>

              <div className="form-group">
                <label>Patron Telefon Numarası (İsteğe Bağlı)</label>
                <input 
                  type="text" 
                  className="form-control" 
                  placeholder="Örn: 905XXXXXXXXX" 
                  value={bossPhone}
                  onChange={(e) => setBossPhone(e.target.value)}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Boş bırakırsanız WhatsApp genel paylaşım ekranı açılır.</span>
              </div>

              <div className="form-group">
                <label>Hazırlanan Rapor İçeriği (Düzenleyebilirsiniz)</label>
                <textarea 
                  className="form-control" 
                  style={{ minHeight: '220px', fontFamily: 'monospace', fontSize: '0.95rem', lineHeight: '1.5' }}
                  value={reportText}
                  onChange={(e) => setReportText(e.target.value)}
                />
              </div>

              <button onClick={handleSendReport} className="glow-btn" style={{ width: '100%', justifyContent: 'center', gap: '0.5rem', background: 'var(--success-gradient)' }}>
                <MessageCircle size={20} />
                WhatsApp ile Raporu Gönder
              </button>
            </div>
          )}

          {/* TAB CONTENT: QR INTAKE FORM GENERATOR */}
          {activeTab === 'qr-intake' && (
            <div className="glass-panel" style={{ maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '1rem' }}>Müşteri Giriş Formu QR Kodu</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '2rem' }}>
                Aşağıdaki QR kodu müşterilerinize taratarak kendi bilgilerini, bütçelerini ve aradıkları ev detaylarını sisteme girmelerini sağlayabilirsiniz. Gelen bilgiler doğrudan CRM panelinize düşer.
              </p>

              <div style={{
                background: '#fff',
                padding: '2rem',
                borderRadius: '16px',
                display: 'inline-block',
                boxShadow: 'var(--shadow-card)',
                marginBottom: '1.5rem'
              }}>
                <QRCodeSVG value={getIntakeUrl()} size={200} level="H" />
              </div>

              <div style={{ marginTop: '1rem' }}>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', userSelect: 'all', background: 'rgba(0,0,0,0.1)', padding: '0.75rem', borderRadius: '8px', fontFamily: 'monospace' }}>
                  {getIntakeUrl()}
                </p>
                <a 
                  href={getIntakeUrl()} 
                  target="_blank" 
                  rel="noreferrer"
                  className="glow-btn"
                  style={{ marginTop: '1.5rem', background: 'var(--secondary-gradient)' }}
                >
                  Formu Yeni Sekmede Aç
                </a>
              </div>
            </div>
          )}

          {/* TAB CONTENT: EXCEL / CSV IMPORT */}
          {activeTab === 'import' && (
            <div className="glass-panel" style={{ maxWidth: '850px', margin: '0 auto' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, marginBottom: '0.5rem' }}>Excel / CSV Dosyasından Veri Yükle</h2>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
                Eski müşteri verilerinizi sisteme toplu olarak aktarın. Kolonları eşleştirerek Excel dosyanızın biçimini bozmadan doğrudan yükleme yapabilirsiniz.
              </p>

              {/* Step 1: File Upload */}
              {excelHeaders.length === 0 && !importSuccess && (
                <div style={{
                  border: '2px dashed var(--glass-border)',
                  borderRadius: '16px',
                  padding: '3rem 2rem',
                  textAlign: 'center',
                  background: 'rgba(0,0,0,0.1)',
                  cursor: 'pointer',
                  position: 'relative'
                }}>
                  <input
                    type="file"
                    accept=".xlsx, .xls, .csv"
                    onChange={handleExcelUpload}
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      height: '100%',
                      opacity: 0,
                      cursor: 'pointer'
                    }}
                  />
                  <QrCode size={48} style={{ color: 'var(--color-primary)', marginBottom: '1rem', opacity: 0.7 }} />
                  <h4 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.5rem' }}>Dosyayı Seçin veya Sürükleyin</h4>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Desteklenen formatlar: **.xlsx, .xls, .csv**
                  </p>
                  <div style={{
                    marginTop: '1.5rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    background: 'rgba(52, 211, 153, 0.1)',
                    color: 'var(--color-success)',
                    border: '1px solid rgba(52, 211, 153, 0.2)'
                  }}>
                    <span>Mükerrer Kayıt Politikası: **Mükerrer Kayıtlara İzin Verilir (Keep Both)**</span>
                  </div>
                </div>
              )}

              {/* Step 2: Column Mapping */}
              {excelHeaders.length > 0 && (
                <div>
                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--glass-border)' }}>
                    <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                      ✓ **{excelRows.length} adet veri satırı algılandı.** Lütfen aşağıdaki CRM alanlarının Excel tablonuzda hangi kolona denk geldiğini eşleştirin.
                    </p>
                  </div>

                  {sheetNames.length > 1 && (
                    <div className="form-group" style={{ marginBottom: '1.5rem', maxWidth: '300px' }}>
                      <label style={{ fontWeight: 'bold', color: 'var(--color-primary)' }}>Aktif Sayfa (Sheet)</label>
                      <select 
                        className="form-control"
                        value={selectedSheet}
                        onChange={(e) => {
                          if (excelWorkbook) {
                            parseSheet(excelWorkbook, e.target.value);
                          }
                        }}
                      >
                        {sheetNames.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                    {/* CRM Field Selectors */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>Zorunlu Alanlar</h4>
                      
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontWeight: 'bold' }}>Adı Soyadı (Müşteri İsmi) *</label>
                        <select 
                          className="form-control"
                          required
                          value={columnMap.name}
                          onChange={(e) => setColumnMap({ ...columnMap, name: e.target.value })}
                        >
                          <option value="">-- Kolon Seçin --</option>
                          {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label style={{ fontWeight: 'bold' }}>Telefon Numarası *</label>
                        <select 
                          className="form-control"
                          required
                          value={columnMap.phone}
                          onChange={(e) => setColumnMap({ ...columnMap, phone: e.target.value })}
                        >
                          <option value="">-- Kolon Seçin --</option>
                          {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginTop: '1rem' }}>Randevu & Bütçe Alanları</h4>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Randevu Tarihi (Varsa otomatik randevu açılır)</label>
                        <select 
                          className="form-control"
                          value={columnMap.appointment_date}
                          onChange={(e) => setColumnMap({ ...columnMap, appointment_date: e.target.value })}
                        >
                          <option value="">-- Eşleştirme Yok (Atla) --</option>
                          {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Tahmini Müşteri Bütçesi</label>
                        <select 
                          className="form-control"
                          value={columnMap.budget}
                          onChange={(e) => setColumnMap({ ...columnMap, budget: e.target.value })}
                        >
                          <option value="">-- Eşleştirme Yok (Atla) --</option>
                          {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Column 2 details */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>İlgi & Profil Alanları</h4>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Müşteri Kaynağı (Instagram, WhatsApp vb.)</label>
                        <select 
                          className="form-control"
                          value={columnMap.source}
                          onChange={(e) => setColumnMap({ ...columnMap, source: e.target.value })}
                        >
                          <option value="">-- Eşleştirme Yok (Atla) --</option>
                          {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>İlgilendiği Daire Tipi / Oda Sayısı</label>
                        <select 
                          className="form-control"
                          value={columnMap.room_count}
                          onChange={(e) => setColumnMap({ ...columnMap, room_count: e.target.value })}
                        >
                          <option value="">-- Eşleştirme Yok (Atla) --</option>
                          {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Yaşadığı Şehir</label>
                        <select 
                          className="form-control"
                          value={columnMap.current_location}
                          onChange={(e) => setColumnMap({ ...columnMap, current_location: e.target.value })}
                        >
                          <option value="">-- Eşleştirme Yok (Atla) --</option>
                          {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>İlgilendiği Bölge (Altınoluk, Akçay vb.)</label>
                        <select 
                          className="form-control"
                          value={columnMap.target_region}
                          onChange={(e) => setColumnMap({ ...columnMap, target_region: e.target.value })}
                        >
                          <option value="">-- Eşleştirme Yok (Atla) --</option>
                          {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Sıcaklık Durumu (Lead Sonucu / Aksiyon)</label>
                        <select 
                          className="form-control"
                          value={columnMap.warmth_outcome}
                          onChange={(e) => setColumnMap({ ...columnMap, warmth_outcome: e.target.value })}
                        >
                          <option value="">-- Eşleştirme Yok (Atla) --</option>
                          {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label>Müşteri Özel Notları / Açıklamalar</label>
                        <select 
                          className="form-control"
                          value={columnMap.notes}
                          onChange={(e) => setColumnMap({ ...columnMap, notes: e.target.value })}
                        >
                          <option value="">-- Eşleştirme Yok (Atla) --</option>
                          {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Excel Preview Block */}
                  <div style={{ marginBottom: '2rem' }}>
                    <h5 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Veri Önizleme (İlk 3 Satır)</h5>
                    <div style={{ overflowX: 'auto', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--glass-border)' }}>
                            {excelHeaders.map(h => (
                              <th key={h} style={{ padding: '0.5rem 0.75rem', fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {excelRows.slice(0, 3).map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: idx < 2 ? '1px solid var(--glass-border)' : 'none' }}>
                              {excelHeaders.map((_, cIdx) => (
                                <td key={cIdx} style={{ padding: '0.5rem 0.75rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '150px' }}>
                                  {row[cIdx] !== undefined ? String(row[cIdx]) : '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                      onClick={() => {
                        setExcelHeaders([]);
                        setExcelRows([]);
                      }}
                      className="glow-btn"
                      style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', boxShadow: 'none' }}
                      disabled={importing}
                    >
                      Dosyayı İptal Et
                    </button>
                    <button
                      onClick={runImport}
                      className="glow-btn"
                      style={{ flexGrow: 1, justifyContent: 'center' }}
                      disabled={importing}
                    >
                      {importing ? (
                        <>
                          <RefreshCw className="animate-spin" size={18} /> Veriler Aktarılıyor...
                        </>
                      ) : (
                        <>
                          <Check size={18} /> {excelRows.length} Müşteriyi CRM'e Aktar
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Step 3: Success Screen */}
              {importSuccess && (
                <div style={{ textAlign: 'center', padding: '2rem 0' }}>
                  <div style={{ display: 'inline-flex', background: 'rgba(52, 211, 153, 0.1)', color: 'var(--color-success)', padding: '1rem', borderRadius: '50%', marginBottom: '1.5rem' }}>
                    <CheckCircle2 size={40} style={{ color: 'var(--color-success)' }} />
                  </div>
                  <h3 style={{ fontSize: '1.3rem', fontWeight: 800, marginBottom: '0.5rem' }}>Aktarım Başarıyla Tamamlandı!</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    **{importCount} adet müşteri kaydı** Excel'den başarıyla CRM veritabanınıza yüklenmiştir. Randevu tarihleri bulunan müşteriler için otomatik olarak randevular planlanmıştır.
                  </p>
                  <button
                    onClick={() => {
                      setImportSuccess(false);
                      setActiveTab('dashboard');
                    }}
                    className="glow-btn"
                  >
                    Müşteri Listesine (CRM) Dön
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      )}
    </div>
  );

  // Render Lead Card Helper
  function renderLeadCard(lead: Lead) {
    return (
      <div 
        key={lead.id} 
        className="glass-panel animate-fade-in" 
        style={{ 
          background: 'var(--bg-tertiary)', 
          padding: '1.25rem',
          borderLeft: `4px solid ${
            lead.warmth === 'hot' ? 'var(--color-danger)' : lead.warmth === 'warm' ? 'var(--color-warning)' : '#3b82f6'
          }`
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <div>
            <h4 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0 }}>{lead.name}</h4>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>📍 {lead.target_region || 'Bölge Belirtilmedi'}</span>
          </div>
          <span className="badge" style={{
            background: lead.source === 'Instagram' ? 'linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)' : 
                        lead.source === 'WhatsApp' ? 'rgba(34, 211, 238, 0.1)' : 'rgba(255,255,255,0.05)',
            color: lead.source === 'Instagram' ? '#fff' : 
                   lead.source === 'WhatsApp' ? 'var(--color-accent)' : 'var(--text-secondary)',
            fontSize: '0.65rem'
          }}>
            {lead.source}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          {lead.occupation && (
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Briefcase size={12} /> {lead.occupation} ({lead.marital_status || 'Evlilik Durumu Bilinmiyor'})
            </p>
          )}
          {lead.current_location && (
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <MapPin size={12} /> Yaşadığı Şehir: {lead.current_location}
            </p>
          )}
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            <DollarSign size={12} /> Bütçe: {formatCurrency(lead.budget)}
          </p>
          {lead.notes && (
            <p style={{ fontStyle: 'italic', background: 'rgba(0,0,0,0.1)', padding: '0.4rem', borderRadius: '4px', marginTop: '0.4rem', color: 'var(--text-secondary)' }}>
              📝 {lead.notes}
            </p>
          )}
        </div>

        {/* Card Actions */}
        <div className="lead-card-actions" style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          borderTop: '1px solid var(--glass-border)', 
          paddingTop: '0.75rem',
          marginTop: '0.5rem',
          flexWrap: 'wrap',
          gap: '0.5rem'
        }}>
          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <a 
              href={`tel:${lead.phone}`}
              className="glow-btn"
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', background: 'var(--secondary-gradient)', boxShadow: 'none' }}
              title="Müşteriyi Ara"
            >
              <Phone size={12} />
            </a>
            <a 
              href={`https://api.whatsapp.com/send?phone=${lead.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noreferrer"
              className="glow-btn"
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', background: 'var(--success-gradient)', boxShadow: 'none' }}
              title="WhatsApp'tan Yaz"
            >
              <MessageCircle size={12} />
            </a>
          </div>

          <div style={{ display: 'flex', gap: '0.4rem' }}>
            <button 
              onClick={() => {
                setNewApp(prev => ({ ...prev, lead_id: lead.id }));
                setActiveTab('appointments');
              }}
              className="glow-btn"
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', boxShadow: 'none' }}
              title="Randevu Planla"
            >
              <Calendar size={12} />
            </button>
            <button 
              onClick={() => startEditLead(lead)}
              className="glow-btn"
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', boxShadow: 'none' }}
              title="Düzenle"
            >
              <Edit size={12} />
            </button>
            <button 
              onClick={() => handleDeleteLead(lead.id)}
              style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', padding: '0.25rem' }}
              title="Sil"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  }
}
