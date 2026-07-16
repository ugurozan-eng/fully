'use client';

import React, { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import { StorageManager } from '@/lib/storage';
import { seedLeadsFromExcel, runWarmthMigration } from '@/app/actions';
import { Lead, Appointment, Property } from '@/lib/types';
import { 
  Plus, Phone, Calendar, Trash2, Edit, Check, X, 
  AlertTriangle, AlertCircle, Share2, QrCode, Search, 
  RefreshCw, Briefcase, MapPin, Heart, DollarSign, MessageCircle,
  CheckCircle2, Menu, Info, ChevronUp, ChevronDown, BarChart3, Users, Sparkles, Filter, Database, Download
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import * as XLSX from 'xlsx';

// Turkish-aware string normalizer for robust excel header matching
function cleanStringForCompare(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/[^a-z0-9]/g, '');
}

// Robust price parser for Turkish and US formats
function cleanPrice(val: any): number {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  
  let str = String(val).trim();
  str = str.replace(/[^0-9,\.]/g, '');
  
  if (str === '') return 0;
  
  const lastDot = str.lastIndexOf('.');
  const lastComma = str.lastIndexOf(',');
  
  if (lastDot !== -1 && lastComma !== -1) {
    if (lastComma > lastDot) {
      str = str.replace(/\./g, '').replace(/,/g, '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const parts = str.split(',');
    if (parts[parts.length - 1].length === 3) {
      str = str.replace(/,/g, '');
    } else {
      str = str.replace(/,/g, '.');
    }
  } else if (lastDot !== -1) {
    const parts = str.split('.');
    if (parts[parts.length - 1].length === 3 || parts.length > 2) {
      str = str.replace(/\./g, '');
    }
  }
  
  const parsed = parseFloat(str);
  return isNaN(parsed) ? 0 : Math.round(parsed);
}

// Helper to format raw numbers to Turkish dot separators format (e.g. 5.000.000)
function formatNumberWithDots(val: any): string {
  if (val === undefined || val === null || val === '') return '';
  const numStr = String(val).replace(/\D/g, '');
  if (numStr === '') return '';
  return numStr.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateToShow(dateStr: string | undefined): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    
    // Check if it represents UTC midnight (pure date) to avoid local timezone shifts
    if (typeof dateStr === 'string' && dateStr.includes('T00:00:00')) {
      const day = String(d.getUTCDate()).padStart(2, '0');
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const year = d.getUTCFullYear();
      return `${day}.${month}.${year}`;
    } else {
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}.${month}.${year}`;
    }
  } catch (err) {
    return dateStr;
  }
}

function isSameDay(date1: Date, date2Str: string | undefined): boolean {
  if (!date2Str) return false;
  try {
    const d2 = new Date(date2Str);
    return date1.getFullYear() === d2.getFullYear() &&
           date1.getMonth() === d2.getMonth() &&
           date1.getDate() === d2.getDate();
  } catch {
    return false;
  }
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Calendar States
  const [calendarView, setCalendarView] = useState<'day' | 'week' | 'month'>('month');
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [hoveredAppId, setHoveredAppId] = useState<string | null>(null);
  
  // Modal states
  const [showAddAppModal, setShowAddAppModal] = useState<boolean>(false);
  const [showEditAppModal, setShowEditAppModal] = useState<boolean>(false);
  const [selectedAppToEdit, setSelectedAppToEdit] = useState<Appointment | null>(null);
  
  // Search state inside Modal
  const [appSearchQuery, setAppSearchQuery] = useState<string>('');
  const [selectedLeadForApp, setSelectedLeadForApp] = useState<Lead | null>(null);
  const [showSearchDropdown, setShowSearchDropdown] = useState<boolean>(false);

  // Form states inside Modal
  const [appDateTime, setAppDateTime] = useState<string>('');
  const [appLocation, setAppLocation] = useState<string>('');
  const [appNotes, setAppNotes] = useState<string>('');
  const [appType, setAppType] = useState<string>('');
  const [appStatus, setAppStatusState] = useState<'pending' | 'completed' | 'cancelled'>('pending');
  
  // Design Layout / Navigation States
  const [isOpenMobile, setIsOpenMobile] = useState<boolean>(false);
  const [selectedMetric, setSelectedMetric] = useState<'total' | 'hot' | 'appointments' | 'properties'>('total');
  
  // New Matchmaker & Import States
  const [importType, setImportType] = useState<'leads' | 'properties'>('leads');
  const [matchmakerSubTab, setMatchmakerSubTab] = useState<'matching' | 'portfolio' | 'database'>('matching');
  const [selectedLeadId, setSelectedLeadId] = useState<string>('');
  const [leadDbSearchQuery, setLeadDbSearchQuery] = useState<string>('');

  // Excel-like Column Filters & Sorting
  const [reportFilters, setReportFilters] = useState<Record<string, string[]>>({});
  const [reportSort, setReportSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [reportSearchTerms, setReportSearchTerms] = useState<Record<string, string>>({});
  const [reportDateFilter, setReportDateFilter] = useState<string>('all');
  const [reportStartDate, setReportStartDate] = useState<string>('');
  const [reportEndDate, setReportEndDate] = useState<string>('');
  const [dbFilters, setDbFilters] = useState<Record<string, string[]>>({});
  const [dbSort, setDbSort] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [dbSearchTerms, setDbSearchTerms] = useState<Record<string, string>>({});
  const [openPopoverId, setOpenPopoverId] = useState<string | null>(null);
  const [showAddPropForm, setShowAddPropForm] = useState<boolean>(false);
  const [propertySearchQuery, setPropertySearchQuery] = useState<string>('');
  const [showAllColumns, setShowAllColumns] = useState<boolean>(false);
  const [expandedPropRows, setExpandedPropRows] = useState<Record<string, boolean>>({});

  // Excel Import States
  const [excelWorkbook, setExcelWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [excelHeaders, setExcelHeaders] = useState<string[]>([]);
  const [excelRows, setExcelRows] = useState<any[][]>([]);
  const [leadsImportMode, setLeadsImportMode] = useState<'append' | 'overwrite'>('append');
  const [importFormatError, setImportFormatError] = useState<boolean>(false);
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
      setImportFormatError(false);
      const ws = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];

      if (data.length === 0) {
        alert('Seçilen sayfa boş görünüyor.');
        return;
      }

      // Smart header row finder
      let headerRowIdx = 0;
      let found = false;

      if (importType === 'leads') {
        for (let i = 0; i < Math.min(data.length, 25); i++) {
          const row = data[i] || [];
          const hasName = row.some(cell => {
            const val = String(cell || '').toLowerCase();
            return val.includes('isim') || val.includes('ad soyad') || val.includes('adı soyadı') || val.includes('adısayadı');
          });
          const hasPhone = row.some(cell => {
            const val = String(cell || '').toLowerCase();
            return val === 'tel' || val.includes('telefon') || val.includes('gsm') || val.includes('telno') || val.includes('gsmno');
          });

          if (hasName && hasPhone) {
            headerRowIdx = i;
            found = true;
            break;
          }
        }
      } else {
        // Properties header finder
        for (let i = 0; i < Math.min(data.length, 25); i++) {
          const row = data[i] || [];
          const hasParsel = row.some(cell => String(cell || '').toLowerCase().includes('parsel'));
          const hasBagBol = row.some(cell => {
            const val = String(cell || '').toLowerCase();
            return val.includes('bağ') || val.includes('bag') || val.includes('böl') || val.includes('bol') || val.includes('blok');
          });

          if (hasParsel || hasBagBol) {
            headerRowIdx = i;
            found = true;
            break;
          }
        }
      }

      if (!found) {
        setImportFormatError(true);
        setExcelHeaders([]);
        setExcelRows([]);
        return;
      }

      const headers = (data[headerRowIdx] || []).map(h => String(h || '').trim());
      const rows = data.slice(headerRowIdx + 1);

      setExcelHeaders(headers);
      setExcelRows(rows);
      setSelectedSheet(sheetName);
      setImportSuccess(false);

      if (importType === 'leads') {
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
      } else {
        // Properties Auto mapping logic
        const newMap = {
          parsel: '', bag_bol_no: '', kat: '', kull_amaci: '', room_count: '',
          kapali_alan: '', acik_alan: '', price: '', portfoy_adi: '',
          extra_ozellik: '', portfoy_kimde: '', daire_sahibi: ''
        };
        
        headers.forEach((h) => {
          const cleanH = cleanStringForCompare(h);
          if (cleanH.includes('parsel')) newMap.parsel = h;
          else if (cleanH.includes('bagbol') || cleanH.includes('bagimsiz') || cleanH.includes('bolum') || cleanH.includes('daireno') || cleanH === 'no' || cleanH.includes('kapino')) newMap.bag_bol_no = h;
          else if (cleanH.includes('kat')) newMap.kat = h;
          else if (cleanH.includes('kullamaci') || cleanH.includes('kullanim') || cleanH.includes('mesken') || cleanH.includes('amaci')) newMap.kull_amaci = h;
          else if (cleanH.includes('dairetipi') || cleanH === 'tip' || cleanH.includes('odano') || cleanH.includes('odasayisi') || cleanH.includes('oda')) newMap.room_count = h;
          else if (cleanH.includes('kapalian') || cleanH.includes('kapali')) newMap.kapali_alan = h;
          else if (cleanH.includes('acikalan') || cleanH.includes('acik')) newMap.acik_alan = h;
          else if (cleanH.includes('fiyat') || cleanH.includes('tutar') || cleanH.includes('bedel')) newMap.price = h;
          else if (cleanH.includes('portfoy') || cleanH.includes('ad')) newMap.portfoy_adi = h;
          else if (cleanH.includes('ozellik') || cleanH.includes('extra')) newMap.extra_ozellik = h;
          else if (cleanH.includes('kimde') || cleanH.includes('durum')) newMap.portfoy_kimde = h;
          else if (cleanH.includes('sahibi') || cleanH.includes('malik')) newMap.daire_sahibi = h;
        });
        setColumnMap(newMap);
      }
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

        // Find the best sheet
        let bestSheetName = wb.SheetNames[0];
        if (importType === 'leads') {
          for (const name of wb.SheetNames) {
            const ws = wb.Sheets[name];
            const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
            
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
        } else {
          for (const name of wb.SheetNames) {
            const lowerName = name.toLowerCase();
            if (lowerName.includes('portfoy') || lowerName.includes('portföy') || lowerName.includes('daire') || lowerName.includes('envanter') || lowerName.includes('list')) {
              bestSheetName = name;
              break;
            }
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

  const runPropertiesImport = async () => {
    setImporting(true);
    let imported = 0;

    if (!excelWorkbook || !selectedSheet) {
      alert('Seçili workbook veya sayfa bulunamadı.');
      setImporting(false);
      return;
    }

    try {
      // Clear existing properties before importing a new spreadsheet to prevent duplicates
      await StorageManager.clearProperties();

      const parselIdx = columnMap.parsel ? excelHeaders.indexOf(columnMap.parsel) : -1;
      const bagBolNoIdx = columnMap.bag_bol_no ? excelHeaders.indexOf(columnMap.bag_bol_no) : -1;
      const katIdx = columnMap.kat ? excelHeaders.indexOf(columnMap.kat) : -1;
      const kullAmaciIdx = columnMap.kull_amaci ? excelHeaders.indexOf(columnMap.kull_amaci) : -1;
      const daireTipiIdx = columnMap.room_count ? excelHeaders.indexOf(columnMap.room_count) : -1;
      const kapaliAlanIdx = columnMap.kapali_alan ? excelHeaders.indexOf(columnMap.kapali_alan) : -1;
      const acikAlanIdx = columnMap.acik_alan ? excelHeaders.indexOf(columnMap.acik_alan) : -1;
      const netAlanIdx = columnMap.net_alan ? excelHeaders.indexOf(columnMap.net_alan) : -1;
      const brutAlanIdx = columnMap.brut_alan ? excelHeaders.indexOf(columnMap.brut_alan) : -1;
      const portfoyAdiIdx = columnMap.portfoy_adi ? excelHeaders.indexOf(columnMap.portfoy_adi) : -1;
      const extraOzellikIdx = columnMap.extra_ozellik ? excelHeaders.indexOf(columnMap.extra_ozellik) : -1;
      const portfoyKimdeIdx = columnMap.portfoy_kimde ? excelHeaders.indexOf(columnMap.portfoy_kimde) : -1;
      const priceIdx = columnMap.price ? excelHeaders.indexOf(columnMap.price) : -1;
      const merdivenAlanIdx = columnMap.merdiven_alan ? excelHeaders.indexOf(columnMap.merdiven_alan) : -1;
      const ortakAlanIdx = columnMap.ortak_alan ? excelHeaders.indexOf(columnMap.ortak_alan) : -1;
      const kapaliAcikAlanIdx = columnMap.kapali_acik_alan ? excelHeaders.indexOf(columnMap.kapali_acik_alan) : -1;
      const daireSahibiIdx = columnMap.daire_sahibi ? excelHeaders.indexOf(columnMap.daire_sahibi) : -1;

      for (const row of excelRows) {
        const parselVal = parselIdx >= 0 ? row[parselIdx] : undefined;
        const bagBolNoVal = bagBolNoIdx >= 0 ? row[bagBolNoIdx] : undefined;

        // If we don't have parsel and bag_bol_no, skip
        if (parselVal === undefined || bagBolNoVal === undefined || String(parselVal).trim() === '' || String(bagBolNoVal).trim() === '') continue;

        const katVal = katIdx >= 0 ? String(row[katIdx] || '') : '';
        const kullAmaciVal = kullAmaciIdx >= 0 ? String(row[kullAmaciIdx] || '') : '';
        const daireTipiVal = daireTipiIdx >= 0 ? String(row[daireTipiIdx] || '') : '1+1';
        
        const kapaliAlanVal = kapaliAlanIdx >= 0 ? Number(row[kapaliAlanIdx]) || 0 : 0;
        const acikAlanVal = acikAlanIdx >= 0 ? Number(row[acikAlanIdx]) || 0 : 0;
        const netAlanVal = netAlanIdx >= 0 ? Number(row[netAlanIdx]) || 0 : 0;
        const brutAlanVal = brutAlanIdx >= 0 ? Number(row[brutAlanIdx]) || 0 : 0;
        
        const portfoyAdiVal = portfoyAdiIdx >= 0 ? String(row[portfoyAdiIdx] || '') : `${parselVal}_${bagBolNoVal}`;
        const extraOzellikVal = extraOzellikIdx >= 0 ? String(row[extraOzellikIdx] || '') : '';
        const portfoyKimdeVal = portfoyKimdeIdx >= 0 ? String(row[portfoyKimdeIdx] || '') : 'Kapalı';
        
        const rawPrice = priceIdx >= 0 ? row[priceIdx] : 0;
        const priceVal = cleanPrice(rawPrice);

        const merdivenAlanVal = merdivenAlanIdx >= 0 ? Number(row[merdivenAlanIdx]) || 0 : 0;
        const ortakAlanVal = ortakAlanIdx >= 0 ? Number(row[ortakAlanIdx]) || 0 : 0;
        const kapaliAcikAlanVal = kapaliAcikAlanIdx >= 0 ? Number(row[kapaliAcikAlanIdx]) || 0 : 0;
        const daireSahibiVal = daireSahibiIdx >= 0 ? String(row[daireSahibiIdx] || '') : '';

        const propId = crypto.randomUUID();
        const newProp: Property = {
          id: propId,
          title: `Parsel ${parselVal} - Daire ${bagBolNoVal}`,
          price: priceVal,
          region: 'Öntaş Vadi Evleri',
          type: kullAmaciVal || 'Mesken',
          room_count: daireTipiVal,
          parsel: String(parselVal),
          bag_bol_no: String(bagBolNoVal),
          kat: katVal,
          kull_amaci: kullAmaciVal,
          kapali_alan: kapaliAlanVal,
          acik_alan: acikAlanVal,
          net_alan: netAlanVal,
          brut_alan: brutAlanVal,
          portfoy_adi: portfoyAdiVal,
          extra_ozellik: extraOzellikVal,
          portfoy_kimde: portfoyKimdeVal,
          merdiven_alan: merdivenAlanVal,
          ortak_alan: ortakAlanVal,
          kapali_acik_alan: kapaliAcikAlanVal,
          daire_sahibi: daireSahibiVal,
          created_at: new Date().toISOString()
        };

        await StorageManager.saveProperty(newProp);
        imported++;
      }

      setImportCount(imported);
      setImportSuccess(true);
    } catch (err: any) {
      console.error(err);
      alert('Portföy içeri aktarılırken hata oluştu: ' + (err?.message || err));
    } finally {
      setImporting(false);
      setExcelHeaders([]);
      setExcelRows([]);
      await loadAllData();
    }
  };

  const runImport = async () => {
    if (importType === 'properties') {
      if (!columnMap.parsel || !columnMap.bag_bol_no) {
        alert('Lütfen en azından "Parsel Numarası" ve "Bağımsız Bölüm (Daire) No" kolonlarını eşleştirin.');
        return;
      }
      await runPropertiesImport();
      return;
    }

    if (!columnMap.name || !columnMap.phone) {
      alert('Lütfen en azından "Adı Soyadı" ve "Telefon Numarası" kolonlarını eşleştirin.');
      return;
    }

    setImporting(true);
    
    try {
      if (leadsImportMode === 'overwrite') {
        try {
          await StorageManager.clearLeadsAndAppointments();
        } catch (clearErr) {
          console.error('Failed to clear data before overwrite import:', clearErr);
        }
      }

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
          if (rawWarmth.includes('beklemede')) {
            warmthVal = 'hot';
          } else if (rawWarmth.includes('red') || rawWarmth.includes('iptal') || rawWarmth.includes('olumsuz')) {
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
          customer_question: '',
          lead_status: '',
          rejection_reason: '',
          target_region: targetRegionVal,
          current_location: currentLocationVal,
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
    } catch (err: any) {
      console.error(err);
      alert('Müşteriler içeri aktarılırken hata oluştu: ' + (err?.message || err));
    } finally {
      setImporting(false);
      setExcelHeaders([]);
      setExcelRows([]);
      await loadAllData();
    }
  };

  // Form States
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [newLead, setNewLead] = useState<Partial<Lead>>({
    name: '',
    phone: '',
    email: '',
    source: 'Instagram',
    property_type: 'Daire',
    room_count: '',
    purpose: 'Oturumluk',
    customer_question: '',
    lead_status: '',
    rejection_reason: '',
    target_region: '',
    current_location: '',
    marital_status: '',
    occupation: '',
    budget: 0,
    warmth: '' as any,
    is_alert_active: true,
    notes: '',
    created_at: getTodayDateString(),
  });

  const [newApp, setNewApp] = useState<Partial<Appointment>>({
    lead_id: '',
    date_time: '',
    location: '',
    status: 'pending',
    notes: '',
  });

  const [newProperty, setNewProperty] = useState<Partial<Property>>({
    parsel: '',
    bag_bol_no: '',
    room_count: '',
    kat: '',
    kull_amaci: 'Mesken',
    kapali_alan: 0,
    acik_alan: 0,
    net_alan: 0,
    brut_alan: 0,
    portfoy_adi: '',
    extra_ozellik: '',
    portfoy_kimde: 'Açık',
    price: 0,
    region: 'Öntaş Vadi Evleri',
    type: 'Daire',
    title: '',
    merdiven_alan: 0,
    ortak_alan: 0,
    kapali_acik_alan: 0,
    daire_sahibi: ''
  });

  // Load Data
  const loadAllData = async () => {
    setLoading(true);
    try {
      const dbLeads = await StorageManager.getLeads();
      const dbApps = await StorageManager.getAppointments();
      const dbProps = await StorageManager.getProperties();
      setLeads(dbLeads);
      setReportLeads(dbLeads);
      setAppointments(dbApps);
      setProperties(dbProps);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const initAndLoad = async () => {
      // Load data immediately to prevent blocking the UI
      loadAllData();

      // Run warmth migration asynchronously in the background
      if (typeof window !== 'undefined') {
        try {
          const migrated = localStorage.getItem('fully-warmth-migrated-v1');
          if (migrated !== 'true') {
            runWarmthMigration()
              .then((res) => {
                if (res.success) {
                  try {
                    localStorage.setItem('fully-warmth-migrated-v1', 'true');
                  } catch (writeErr) {
                    console.error('Failed to write migration flag:', writeErr);
                  }
                  // Reload data to reflect migrated state
                  loadAllData();
                }
              })
              .catch((err) => {
                console.error('Failed to run warmth migration on mount:', err);
              });
          }
        } catch (readErr) {
          console.error('Failed to read migration flag:', readErr);
          // Safe fallback: run the migration without reading/writing flag if storage is disabled
          runWarmthMigration()
            .then((res) => {
              if (res.success) {
                loadAllData();
              }
            })
            .catch((err) => {
              console.error('Failed to run warmth migration on mount fallback:', err);
            });
        }
      }
    };
    initAndLoad();
  }, []);

  // Save Lead
  const handleSaveLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLead.name || !newLead.phone || !newLead.warmth) {
      alert('Lütfen Ad, Telefon ve Sıcaklık Seviyesi (Warmth) alanlarını doldurun.');
      return;
    }
    const isNewLead = !editingLead;
    const leadId = editingLead ? editingLead.id : crypto.randomUUID();
    const leadToSave: Lead = {
      id: leadId,
      name: newLead.name,
      phone: newLead.phone,
      email: newLead.email || '',
      source: newLead.source || 'Instagram',
      property_type: newLead.property_type || 'Daire',
      room_count: newLead.room_count || '',
      purpose: newLead.purpose || 'Oturumluk',
      customer_question: newLead.customer_question || '',
      lead_status: newLead.lead_status || '',
      rejection_reason: newLead.rejection_reason || '',
      target_region: newLead.target_region || '',
      current_location: newLead.current_location || '',
      marital_status: newLead.marital_status || '',
      occupation: newLead.occupation || '',
      budget: Number(newLead.budget) || 0,
      warmth: (newLead.lead_status === 'Beklemede' ? 'hot' : newLead.warmth) as 'cold' | 'warm' | 'hot',
      is_alert_active: newLead.is_alert_active !== undefined ? newLead.is_alert_active : true,
      notes: newLead.notes || '',
      created_at: newLead.created_at ? new Date(newLead.created_at).toISOString() : new Date().toISOString(),
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
      room_count: '',
      purpose: 'Oturumluk',
      customer_question: '',
      lead_status: '',
      rejection_reason: '',
      target_region: '',
      current_location: '',
      marital_status: '',
      occupation: '',
      budget: 0,
      warmth: '' as any,
      is_alert_active: true,
      notes: '',
      created_at: getTodayDateString(),
    });

    if (isNewLead) {
      setActiveTab('matchmaker');
      setMatchmakerSubTab('matching');
      setSelectedLeadId(leadId);
    } else {
      setActiveTab('dashboard');
    }
  };

  // Start Editing Lead
  const startEditLead = (lead: Lead) => {
    setEditingLead(lead);
    
    // Format created_at to YYYY-MM-DD for date input field
    let formattedDate = getTodayDateString();
    if (lead.created_at) {
      try {
        const d = new Date(lead.created_at);
        // Avoid timezone shift if it represents UTC midnight (pure date)
        if (typeof lead.created_at === 'string' && lead.created_at.includes('T00:00:00')) {
          const year = d.getUTCFullYear();
          const month = String(d.getUTCMonth() + 1).padStart(2, '0');
          const day = String(d.getUTCDate()).padStart(2, '0');
          formattedDate = `${year}-${month}-${day}`;
        } else {
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          formattedDate = `${year}-${month}-${day}`;
        }
      } catch (err) {
        console.error('Error parsing lead created_at:', err);
      }
    }

    setNewLead({
      ...lead,
      created_at: formattedDate
    });
    setActiveTab('add-lead');
  };

  // Delete Lead
  const handleDeleteLead = async (id: string) => {
    if (confirm('Bu müşteriyi silmek istediğinizden emin misiniz?')) {
      await StorageManager.deleteLead(id);
      loadAllData();
    }
  };

  // Helper to find the best matching property for a lead using matchmaker logic
  const getMatchedPropertyForLead = (lead: Lead): Property | null => {
    if (!lead) return null;
    const leadRoom = String(lead.room_count || '').trim().toLowerCase();
    const budget = Number(lead.budget) || 0;
    const maxFlexibleBudget = budget * 1.10; // +10% flexibility

    const leadNotes = String(lead.notes || '').toLowerCase();
    const leadRooms = leadRoom ? leadRoom.split(',').map(s => s.trim().toLowerCase()) : [];

    const activeProps = (properties || []).filter(p => {
      if (!p) return false;
      if (p.is_sold) return false;
      const isClosed = String(p.portfoy_kimde || '').trim().toLowerCase() === 'kapalı';
      if (isClosed) return false;
      const price = Number(p.price) || 0;
      if (price <= 0) return false;

      // Keyword matching
      if (leadNotes.includes('bahçe') || leadNotes.includes('bahceli') || leadNotes.includes('bahçeli')) {
        const propExtra = String(p.extra_ozellik || '').toLowerCase();
        const propTitle = String(p.title || '').toLowerCase();
        const propHasGarden = propExtra.includes('bahçe') || propExtra.includes('bahçeli') || propExtra.includes('bahceli') ||
                              propTitle.includes('bahçe') || propTitle.includes('bahçeli') || propTitle.includes('bahceli');
        if (!propHasGarden) return false;
      }
      if (leadNotes.includes('dubleks') || leadNotes.includes('dublex')) {
        const propExtra = String(p.extra_ozellik || '').toLowerCase();
        const propTitle = String(p.title || '').toLowerCase();
        const propType = String(p.type || '').toLowerCase();
        const propKullAmaci = String(p.kull_amaci || '').toLowerCase();
        const propHasDuplex = propExtra.includes('dubleks') || propExtra.includes('dublex') ||
                              propTitle.includes('dubleks') || propTitle.includes('dublex') ||
                              propType.includes('dubleks') || propType.includes('dublex') ||
                              propKullAmaci.includes('dubleks') || propKullAmaci.includes('dublex');
        if (!propHasDuplex) return false;
      }
      return true;
    });

    // Exact matches first
    const exactMatches = activeProps.filter(p => {
      const propRoom = String(p.room_count || '').trim().toLowerCase();
      const price = Number(p.price) || 0;
      const isRoomMatch = leadRooms.length === 0 || leadRooms.includes(propRoom);
      return isRoomMatch && price <= budget;
    });
    if (exactMatches.length > 0) return exactMatches[0];

    // Flexible matches next
    const flexibleMatches = activeProps.filter(p => {
      const propRoom = String(p.room_count || '').trim().toLowerCase();
      const price = Number(p.price) || 0;
      const isRoomMatch = leadRooms.length === 0 || leadRooms.includes(propRoom);
      return isRoomMatch && price > budget && price <= maxFlexibleBudget;
    });
    if (flexibleMatches.length > 0) return flexibleMatches[0];

    return null;
  };

  // Open creation modal
  const openAddAppModal = (initialDate?: Date, initialHour?: number) => {
    let dtStr = '';
    const date = initialDate ? new Date(initialDate) : new Date();
    if (initialHour !== undefined) {
      date.setHours(initialHour);
      date.setMinutes(0);
    } else {
      date.setHours(9);
      date.setMinutes(0);
    }
    
    // Format to local YYYY-MM-DDTHH:MM
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    dtStr = `${year}-${month}-${day}T${hours}:${minutes}`;

    setAppDateTime(dtStr);
    setAppLocation('Ofis / Yerinde Gösterim');
    setAppNotes('');
    setAppType(''); // Empty initially, user must select (required)
    setAppStatusState('pending');
    setSelectedLeadForApp(null);
    setAppSearchQuery('');
    setShowSearchDropdown(false);
    setShowAddAppModal(true);
  };

  // Open edit modal
  const openEditAppModal = (app: Appointment) => {
    setSelectedAppToEdit(app);
    setAppDateTime(app.date_time);
    setAppLocation(app.location || '');
    setAppNotes(app.notes || '');
    setAppType(app.appointment_type || '');
    setAppStatusState(app.status);
    
    const lead = leads.find(l => l.id === app.lead_id);
    setSelectedLeadForApp(lead || null);
    setAppSearchQuery(lead ? `${lead.name} (${lead.phone})` : '');
    setShowSearchDropdown(false);
    setShowEditAppModal(true);
  };

  // Navigate Calendar date
  const navigateCalendar = (dir: number) => {
    const newDate = new Date(calendarDate);
    if (calendarView === 'month') {
      newDate.setMonth(newDate.getMonth() + dir);
    } else if (calendarView === 'week') {
      newDate.setDate(newDate.getDate() + (dir * 7));
    } else {
      newDate.setDate(newDate.getDate() + dir);
    }
    setCalendarDate(newDate);
  };

  // Calendar title helper
  const getCalendarTitle = () => {
    const monthNames = [
      'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
      'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
    ];
    if (calendarView === 'month') {
      return `${monthNames[calendarDate.getMonth()]} ${calendarDate.getFullYear()}`;
    } else if (calendarView === 'week') {
      const start = new Date(calendarDate);
      const day = start.getDay();
      const diff = start.getDate() - day + (day === 0 ? -6 : 1);
      start.setDate(diff);
      
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      
      if (start.getMonth() === end.getMonth()) {
        return `${start.getDate()} - ${end.getDate()} ${monthNames[start.getMonth()]} ${start.getFullYear()}`;
      } else if (start.getFullYear() === end.getFullYear()) {
        return `${start.getDate()} ${monthNames[start.getMonth()]} - ${end.getDate()} ${monthNames[end.getMonth()]} ${start.getFullYear()}`;
      } else {
        return `${start.getDate()} ${monthNames[start.getMonth()]} ${start.getFullYear()} - ${end.getDate()} ${monthNames[end.getMonth()]} ${end.getFullYear()}`;
      }
    } else {
      return `${calendarDate.getDate()} ${monthNames[calendarDate.getMonth()]} ${calendarDate.getFullYear()}`;
    }
  };

  // Save or Update Appointment from Modal
  const handleSaveAppModalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeadForApp || !appDateTime) {
      alert('Lütfen Müşteri ve Tarih/Saat alanlarını doldurun.');
      return;
    }
    if (!appType) {
      alert('Lütfen Randevu Tipi seçin.');
      return;
    }
    const appToSave: Appointment = {
      id: selectedAppToEdit ? selectedAppToEdit.id : crypto.randomUUID(),
      lead_id: selectedLeadForApp.id,
      date_time: appDateTime,
      location: appLocation,
      status: appStatus,
      notes: appNotes,
      appointment_type: appType,
    };
    await StorageManager.saveAppointment(appToSave);
    await loadAllData();
    
    // Close & reset
    setShowAddAppModal(false);
    setShowEditAppModal(false);
    setSelectedAppToEdit(null);
    setSelectedLeadForApp(null);
  };

  // Change Appointment Status
  const handleAppStatus = async (app: Appointment, nextStatus: 'pending' | 'completed' | 'cancelled') => {
    const updated = { ...app, status: nextStatus };
    await StorageManager.saveAppointment(updated);
    loadAllData();
  };

  // Delete Appointment with Double Confirmation
  const handleDeleteApp = async (id: string) => {
    if (confirm('Bu randevuyu silmek istediğinizden emin misiniz?')) {
      if (confirm('DİKKAT: Randevu tamamen silinecektir. Devam etmek istediğinizden emin misiniz?')) {
        await StorageManager.deleteAppointment(id);
        loadAllData();
        setShowEditAppModal(false);
        setSelectedAppToEdit(null);
      }
    }
  };

  // Hover Popover details helper
  const renderHoverCard = (a: Appointment) => {
    const lead = leads.find(l => l.id === a.lead_id);
    const matchedProp = lead ? getMatchedPropertyForLead(lead) : null;
    return (
      <div className="tooltip-content" style={{
        position: 'absolute',
        bottom: '110%',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '290px',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--glass-border)',
        borderRadius: '8px',
        padding: '0.85rem',
        boxShadow: 'var(--shadow-card)',
        zIndex: 1000,
        pointerEvents: 'none',
        fontSize: '0.8rem',
        color: 'var(--text-secondary)',
        display: hoveredAppId === a.id ? 'block' : 'none',
        textAlign: 'left',
        whiteSpace: 'normal'
      }}>
        <h5 style={{ fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.4rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.2rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>Randevu Detayı</span>
          {a.appointment_type && <span style={{ fontSize: '0.65rem', color: 'var(--color-primary)' }}>{a.appointment_type}</span>}
        </h5>
        <p style={{ marginBottom: '0.25rem', color: 'var(--text-primary)' }}>👤 <strong>İsim Soyisim:</strong> {a.lead_name}</p>
        {lead && (
          <>
            <p style={{ marginBottom: '0.25rem' }}>📞 <strong>Telefon:</strong> {lead.phone}</p>
            <p style={{ marginBottom: '0.25rem' }}>🏠 <strong>Talep Ettiği Daire:</strong> {lead.room_count || 'Belirtilmedi'} Oda ({lead.property_type || 'Belirtilmedi'})</p>
            {matchedProp ? (
              <div style={{ marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '1px dotted var(--glass-border)' }}>
                <p style={{ color: 'var(--color-primary)', fontWeight: 700, marginBottom: '0.2rem', fontSize: '0.75rem' }}>🎯 Eşleşen Daire:</p>
                <p style={{ marginBottom: '0.15rem', color: 'var(--text-primary)' }}>🏢 <strong>Parsel:</strong> {matchedProp.parsel || '-'} / <strong>Daire No:</strong> {matchedProp.bag_bol_no || '-'}</p>
                <p style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: '0.85rem' }}>💰 <strong>Daire Fiyatı (DB):</strong> {formatCurrency(matchedProp.price)}</p>
              </div>
            ) : (
              <p style={{ fontStyle: 'italic', marginTop: '0.4rem', color: 'var(--text-muted)', fontSize: '0.7rem' }}>⚠️ Bütçeye/Odaya uygun eşleşen daire bulunamadı.</p>
            )}
          </>
        )}
        {a.notes && (
          <p style={{ marginTop: '0.4rem', background: 'rgba(0,0,0,0.15)', padding: '0.3rem', borderRadius: '4px', fontStyle: 'italic', fontSize: '0.75rem' }}>
            📝 Not: {a.notes}
          </p>
        )}
      </div>
    );
  };

  // Calendar render functions
  const renderMonthView = () => {
    const startOfMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
    const endOfMonth = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0);
    const daysInMonth = endOfMonth.getDate();
    
    let startDayIdx = startOfMonth.getDay();
    startDayIdx = startDayIdx === 0 ? 6 : startDayIdx - 1;
    
    const cells: { date: Date; isCurrentMonth: boolean }[] = [];
    const prevMonthEnd = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 0).getDate();
    for (let i = startDayIdx - 1; i >= 0; i--) {
      cells.push({
        date: new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, prevMonthEnd - i),
        isCurrentMonth: false
      });
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      cells.push({
        date: new Date(calendarDate.getFullYear(), calendarDate.getMonth(), i),
        isCurrentMonth: true
      });
    }
    
    const totalCells = cells.length > 35 ? 42 : 35;
    const nextMonthPadding = totalCells - cells.length;
    for (let i = 1; i <= nextMonthPadding; i++) {
      cells.push({
        date: new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, i),
        isCurrentMonth: false
      });
    }

    const weekDays = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

    return (
      <div style={{ width: '100%', overflowX: 'auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', minWidth: '700px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '8px' }}>
            {weekDays.map(wd => (
              <div key={wd} style={{ fontWeight: 600, fontSize: '0.85rem', color: 'var(--text-secondary)', padding: '0.4rem' }}>
                {wd}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', background: 'var(--glass-border)', padding: '4px', borderRadius: '8px' }}>
            {cells.map((cell, idx) => {
              const dateKey = cell.date.toDateString();
              const dayApps = appointments.filter(a => isSameDay(cell.date, a.date_time));
              const isToday = new Date().toDateString() === dateKey;

              return (
                <div 
                  key={idx}
                  onClick={() => openAddAppModal(cell.date)}
                  style={{
                    minHeight: '120px',
                    background: isToday ? 'rgba(255, 106, 0, 0.05)' : cell.isCurrentMonth ? 'var(--bg-secondary)' : 'rgba(255,255,255,0.01)',
                    border: isToday ? '1px solid var(--color-primary)' : '1px solid var(--glass-border)',
                    borderRadius: '6px',
                    padding: '0.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.35rem',
                    cursor: 'pointer',
                    position: 'relative'
                  }}
                >
                  <span style={{ 
                    fontSize: '0.85rem', 
                    fontWeight: isToday ? 800 : 500, 
                    color: isToday ? 'var(--color-primary)' : cell.isCurrentMonth ? 'var(--text-primary)' : 'var(--text-muted)' 
                  }}>
                    {cell.date.getDate()}
                  </span>
                  
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }} onClick={(e) => e.stopPropagation()}>
                    {dayApps.slice(0, 3).map(a => (
                      <div 
                        key={a.id}
                        onClick={() => openEditAppModal(a)}
                        onMouseEnter={() => setHoveredAppId(a.id)}
                        onMouseLeave={() => setHoveredAppId(null)}
                        style={{
                          padding: '0.25rem 0.4rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background: a.status === 'completed' ? 'rgba(16, 185, 129, 0.15)' : a.status === 'cancelled' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: a.status === 'completed' ? 'var(--color-success)' : a.status === 'cancelled' ? 'var(--color-danger)' : 'var(--color-warning)',
                          border: `1px solid ${a.status === 'completed' ? 'rgba(16, 185, 129, 0.25)' : a.status === 'cancelled' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          position: 'relative'
                        }}
                      >
                        {new Date(a.date_time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} - {a.lead_name}
                        {renderHoverCard(a)}
                      </div>
                    ))}
                    {dayApps.length > 3 && (
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        +{dayApps.length - 3} randevu daha
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderWeekView = () => {
    const startOfWeek = new Date(calendarDate);
    const day = startOfWeek.getDay();
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1);
    startOfWeek.setDate(diff);

    const weekDays: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(d.getDate() + i);
      weekDays.push(d);
    }

    const hours: number[] = [];
    for (let i = 8; i <= 20; i++) {
      hours.push(i);
    }

    const weekDayNames = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%', overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)', gap: '4px', textAlign: 'center', marginBottom: '8px', minWidth: '800px' }}>
          <div></div>
          {weekDays.map((wd, idx) => {
            const isToday = new Date().toDateString() === wd.toDateString();
            return (
              <div key={idx} style={{ 
                padding: '0.5rem', 
                background: isToday ? 'rgba(255, 106, 0, 0.05)' : 'transparent',
                borderRadius: '6px',
                border: isToday ? '1px solid var(--color-primary)' : 'none'
              }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{weekDayNames[idx]}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: isToday ? 'var(--color-primary)' : 'var(--text-primary)' }}>{wd.getDate()}</div>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--glass-border)', padding: '4px', borderRadius: '8px', minWidth: '800px' }}>
          {hours.map(hour => (
            <div key={hour} style={{ display: 'grid', gridTemplateColumns: '80px repeat(7, 1fr)', gap: '4px', alignItems: 'stretch' }}>
              <div style={{ 
                fontSize: '0.8rem', 
                color: 'var(--text-secondary)', 
                textAlign: 'right', 
                paddingRight: '0.75rem', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'flex-end',
                height: '60px',
                background: 'rgba(255,255,255,0.01)'
              }}>
                {String(hour).padStart(2, '0')}:00
              </div>
              
              {weekDays.map((wd, dayIdx) => {
                const hourApps = appointments.filter(a => {
                  try {
                    const ad = new Date(a.date_time);
                    return ad.toDateString() === wd.toDateString() && ad.getHours() === hour;
                  } catch {
                    return false;
                  }
                });

                return (
                  <div 
                    key={dayIdx}
                    onClick={() => openAddAppModal(wd, hour)}
                    style={{
                      height: '60px',
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '4px',
                      padding: '0.25rem',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.2rem',
                      overflowY: 'auto'
                    }}
                  >
                    {hourApps.map(a => (
                      <div 
                        key={a.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditAppModal(a);
                        }}
                        onMouseEnter={() => setHoveredAppId(a.id)}
                        onMouseLeave={() => setHoveredAppId(null)}
                        style={{
                          padding: '0.15rem 0.3rem',
                          borderRadius: '3px',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                          background: a.status === 'completed' ? 'rgba(16, 185, 129, 0.15)' : a.status === 'cancelled' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                          color: a.status === 'completed' ? 'var(--color-success)' : a.status === 'cancelled' ? 'var(--color-danger)' : 'var(--color-warning)',
                          border: `1px solid ${a.status === 'completed' ? 'rgba(16, 185, 129, 0.25)' : a.status === 'cancelled' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          position: 'relative'
                        }}
                      >
                        {new Date(a.date_time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} - {a.lead_name}
                        {renderHoverCard(a)}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDayView = () => {
    const hours: number[] = [];
    for (let i = 8; i <= 20; i++) {
      hours.push(i);
    }
    const isToday = new Date().toDateString() === calendarDate.toDateString();

    return (
      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        <div style={{ 
          padding: '0.75rem', 
          background: isToday ? 'rgba(255, 106, 0, 0.05)' : 'rgba(255,255,255,0.02)',
          borderRadius: '8px',
          border: isToday ? '1px solid var(--color-primary)' : '1px solid var(--glass-border)',
          textAlign: 'center',
          marginBottom: '1rem'
        }}>
          <h4 style={{ fontWeight: 800, fontSize: '1.25rem', color: isToday ? 'var(--color-primary)' : 'var(--text-primary)' }}>
            {calendarDate.toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </h4>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', background: 'var(--glass-border)', padding: '4px', borderRadius: '8px' }}>
          {hours.map(hour => {
            const hourApps = appointments.filter(a => {
              try {
                const ad = new Date(a.date_time);
                return ad.toDateString() === calendarDate.toDateString() && ad.getHours() === hour;
              } catch {
                return false;
              }
            });

            return (
              <div key={hour} style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '4px', alignItems: 'stretch' }}>
                <div style={{ 
                  fontSize: '0.8rem', 
                  color: 'var(--text-secondary)', 
                  textAlign: 'right', 
                  paddingRight: '0.75rem', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'flex-end',
                  height: '60px',
                  background: 'rgba(255,255,255,0.01)'
                }}>
                  {String(hour).padStart(2, '0')}:00
                </div>

                <div 
                  onClick={() => openAddAppModal(calendarDate, hour)}
                  style={{
                    height: '60px',
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--glass-border)',
                    borderRadius: '4px',
                    padding: '0.4rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    overflowX: 'auto'
                  }}
                >
                  {hourApps.map(a => (
                    <div 
                      key={a.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditAppModal(a);
                      }}
                      onMouseEnter={() => setHoveredAppId(a.id)}
                      onMouseLeave={() => setHoveredAppId(null)}
                      style={{
                        padding: '0.35rem 0.75rem',
                        borderRadius: '4px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        background: a.status === 'completed' ? 'rgba(16, 185, 129, 0.15)' : a.status === 'cancelled' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                        color: a.status === 'completed' ? 'var(--color-success)' : a.status === 'cancelled' ? 'var(--color-danger)' : 'var(--color-warning)',
                        border: `1px solid ${a.status === 'completed' ? 'rgba(16, 185, 129, 0.25)' : a.status === 'cancelled' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        position: 'relative',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      <strong style={{ borderRight: '1px solid rgba(255,255,255,0.1)', paddingRight: '0.4rem' }}>
                        {new Date(a.date_time).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                      </strong>
                      <span>{a.lead_name}</span>
                      {a.appointment_type && (
                        <span style={{ fontSize: '0.7rem', opacity: 0.8, background: 'rgba(255,255,255,0.1)', padding: '0.1rem 0.3rem', borderRadius: '3px' }}>
                          {a.appointment_type}
                        </span>
                      )}
                      {renderHoverCard(a)}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Save Property
  const handleSaveProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProperty.parsel || !newProperty.bag_bol_no) {
      alert('Lütfen Parsel ve Bağımsız Bölüm No alanlarını doldurun.');
      return;
    }
    const propToSave: Property = {
      id: crypto.randomUUID(),
      title: newProperty.title || `Parsel ${newProperty.parsel} - Daire ${newProperty.bag_bol_no}`,
      price: Number(newProperty.price) || 0,
      region: newProperty.region || 'Öntaş Vadi Evleri',
      type: newProperty.kull_amaci || 'Mesken',
      room_count: newProperty.room_count || '2+1',
      parsel: String(newProperty.parsel),
      bag_bol_no: String(newProperty.bag_bol_no),
      kat: newProperty.kat || '',
      kull_amaci: newProperty.kull_amaci || 'Mesken',
      kapali_alan: Number(newProperty.kapali_alan) || 0,
      acik_alan: Number(newProperty.acik_alan) || 0,
      net_alan: Number(newProperty.net_alan) || 0,
      brut_alan: Number(newProperty.brut_alan) || 0,
      portfoy_adi: newProperty.portfoy_adi || `${newProperty.parsel}_${newProperty.bag_bol_no}`,
      extra_ozellik: newProperty.extra_ozellik || '',
      portfoy_kimde: newProperty.portfoy_kimde || 'Açık',
      merdiven_alan: Number(newProperty.merdiven_alan) || 0,
      ortak_alan: Number(newProperty.ortak_alan) || 0,
      kapali_acik_alan: Number(newProperty.kapali_acik_alan) || 0,
      daire_sahibi: newProperty.daire_sahibi || '',
      created_at: new Date().toISOString(),
    };
    await StorageManager.saveProperty(propToSave);
    await loadAllData();
    setShowAddPropForm(false);

    setNewProperty({
      parsel: '',
      bag_bol_no: '',
      room_count: '2+1',
      kat: '',
      kull_amaci: 'Mesken',
      kapali_alan: 0,
      acik_alan: 0,
      net_alan: 0,
      brut_alan: 0,
      portfoy_adi: '',
      extra_ozellik: '',
      portfoy_kimde: 'Açık',
      price: 0,
      region: 'Öntaş Vadi Evleri',
      type: 'Daire',
      title: '',
      merdiven_alan: 0,
      ortak_alan: 0,
      kapali_acik_alan: 0,
      daire_sahibi: ''
    });
  };

  const [reportLeads, setReportLeads] = useState<Lead[] | null>(null);

  // Inline update for leads
  const handleInlineLeadUpdate = async (lead: Lead, field: keyof Lead, value: any) => {
    let finalValue = value;
    if (field === 'budget') {
      finalValue = Number(value) || 0;
    }
    const updated = {
      ...lead,
      [field]: finalValue
    };
    await StorageManager.saveLead(updated);
    await loadAllData();
    // Also update reportLeads if it's currently generated
    if (reportLeads) {
      setReportLeads(prev => {
        if (!prev) return null;
        return prev.map(l => l.id === lead.id ? { ...l, ...updated } : l);
      });
    }
  };

  // Excel-like Column Filters Popover Renderer
  const renderFilterPopover = (
    tableType: 'report' | 'db',
    columnKey: string,
    columnTitle: string,
    allItems: Lead[],
    getValueFn: (item: Lead) => string
  ) => {
    const popoverId = `${tableType}-${columnKey}`;
    if (openPopoverId !== popoverId) return null;

    const activeFilters = tableType === 'report' ? reportFilters : dbFilters;
    const setActiveFilters = tableType === 'report' ? setReportFilters : setDbFilters;
    const sortConfig = tableType === 'report' ? reportSort : dbSort;
    const setSortConfig = tableType === 'report' ? setReportSort : setDbSort;
    const searchTerms = tableType === 'report' ? reportSearchTerms : dbSearchTerms;
    const setSearchTerms = tableType === 'report' ? setReportSearchTerms : setDbSearchTerms;

    const selectedValues = activeFilters[columnKey] || [];
    const searchTerm = (searchTerms[columnKey] || '').toLowerCase();

    // Gather unique values from the column
    const uniqueValues = Array.from(
      new Set(allItems.map(getValueFn).map(v => (v || '').trim() || '-'))
    ).sort((a, b) => a.localeCompare(b, 'tr'));

    // Filter unique values by search input inside the popover
    const filteredUniqueValues = uniqueValues.filter(val => 
      val.toLowerCase().includes(searchTerm)
    );

    const handleCheckboxChange = (value: string, checked: boolean) => {
      setActiveFilters(prev => {
        const current = prev[columnKey] || [];
        const next = checked 
          ? [...current, value] 
          : current.filter(v => v !== value);
        return {
          ...prev,
          [columnKey]: next.length > 0 ? next : []
        };
      });
    };

    const handleSelectAll = (checked: boolean) => {
      setActiveFilters(prev => {
        const next = { ...prev };
        if (checked) {
          next[columnKey] = [...uniqueValues];
        } else {
          delete next[columnKey];
        }
        return next;
      });
    };

    const handleSort = (direction: 'asc' | 'desc') => {
      setSortConfig({ key: columnKey, direction });
      setOpenPopoverId(null);
    };

    const handleClear = () => {
      setActiveFilters(prev => {
        const next = { ...prev };
        delete next[columnKey];
        return next;
      });
      setOpenPopoverId(null);
    };

    return (
      <div 
        className="glass-panel"
        style={{ 
          position: 'absolute', 
          top: '100%', 
          left: 0, 
          zIndex: 999, 
          background: 'var(--bg-secondary)', 
          border: '1px solid var(--glass-border)', 
          borderRadius: '8px', 
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.7), var(--shadow-glow)', 
          width: '220px',
          padding: '0.75rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
          marginTop: '0.25rem',
          color: '#fff',
          fontWeight: 'normal',
          textAlign: 'left'
        }}
      >
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{columnTitle} Filtrele</span>
          {selectedValues.length > 0 && (
            <button onClick={handleClear} style={{ background: 'none', border: 'none', color: 'var(--color-danger)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}>
              Temizle
            </button>
          )}
        </div>

        {/* Sort Actions */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            type="button"
            onClick={() => handleSort('asc')}
            style={{ 
              flex: 1, 
              padding: '0.35rem', 
              fontSize: '0.75rem', 
              background: sortConfig?.key === columnKey && sortConfig.direction === 'asc' ? 'var(--primary-gradient)' : 'rgba(255,255,255,0.05)', 
              border: '1px solid var(--glass-border)',
              borderRadius: '4px',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.25rem',
              fontWeight: 600
            }}
          >
            A-Z Sırala
          </button>
          <button 
            type="button"
            onClick={() => handleSort('desc')}
            style={{ 
              flex: 1, 
              padding: '0.35rem', 
              fontSize: '0.75rem', 
              background: sortConfig?.key === columnKey && sortConfig.direction === 'desc' ? 'var(--primary-gradient)' : 'rgba(255,255,255,0.05)', 
              border: '1px solid var(--glass-border)',
              borderRadius: '4px',
              color: '#fff',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.25rem',
              fontWeight: 600
            }}
          >
            Z-A Sırala
          </button>
        </div>

        {/* Search Input */}
        <input
          type="text"
          placeholder="Ara..."
          value={searchTerms[columnKey] || ''}
          onChange={(e) => setSearchTerms(prev => ({ ...prev, [columnKey]: e.target.value }))}
          style={{
            width: '100%',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--glass-border)',
            borderRadius: '4px',
            padding: '0.25rem 0.5rem',
            color: '#fff',
            fontSize: '0.75rem',
            outline: 'none'
          }}
        />

        {/* Values Checkbox List */}
        <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.35rem', padding: '0.25rem 0' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', cursor: 'pointer' }}>
            <input 
              type="checkbox" 
              checked={selectedValues.length > 0 && selectedValues.length === uniqueValues.length}
              onChange={(e) => handleSelectAll(e.target.checked)}
            />
            <span>(Tümünü Seç)</span>
          </label>
          {filteredUniqueValues.map(val => (
            <label key={val} style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={selectedValues.includes(val)}
                onChange={(e) => handleCheckboxChange(val, e.target.checked)}
              />
              <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={val}>{val}</span>
            </label>
          ))}
        </div>
      </div>
    );
  };

  // Get distribution statistics for reports charts, excluding empty/unknown and grouping after limit
  const getDistributionData = (leadsList: Lead[], key: keyof Lead, limit = 5) => {
    const counts: Record<string, number> = {};
    let totalValid = 0;

    leadsList.forEach(lead => {
      const rawVal = lead[key];
      if (rawVal === undefined || rawVal === null) return;
      let strVal = String(rawVal).trim();

      if (strVal === '' || strVal === '-' || strVal.toLowerCase() === 'bilinmiyor' || strVal.toLowerCase() === 'unknown') {
        return;
      }

      if (key === 'warmth') {
        if (strVal === 'hot') strVal = '🔥 Hot';
        else if (strVal === 'warm') strVal = '⚡ Warm';
        else if (strVal === 'cold') strVal = '❄️ Cold';
      }

      counts[strVal] = (counts[strVal] || 0) + 1;
      totalValid++;
    });

    const sortedEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

    let data = [];
    if (sortedEntries.length > limit) {
      const topEntries = sortedEntries.slice(0, limit - 1);
      const otherEntries = sortedEntries.slice(limit - 1);
      const otherCount = otherEntries.reduce((sum, [, count]) => sum + count, 0);

      data = topEntries.map(([label, count]) => ({
        label,
        count,
        percentage: totalValid > 0 ? (count / totalValid) * 100 : 0
      }));

      data.push({
        label: 'Diğer',
        count: otherCount,
        percentage: totalValid > 0 ? (otherCount / totalValid) * 100 : 0
      });
    } else {
      data = sortedEntries.map(([label, count]) => ({
        label,
        count,
        percentage: totalValid > 0 ? (count / totalValid) * 100 : 0
      }));
    }

    return { data, totalValid };
  };

  // Get processed leads for reports table (filtered and sorted)
  const getProcessedReportLeads = () => {
    if (!reportLeads) return [];
    let result = [...reportLeads];

    // Apply date filter
    if (reportDateFilter !== 'all') {
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

      result = result.filter(lead => {
        if (!lead.created_at) return false;
        const leadDate = new Date(lead.created_at);

        if (reportDateFilter === 'today') {
          return leadDate >= todayStart && leadDate <= todayEnd;
        }
        if (reportDateFilter === 'yesterday') {
          const yesterdayStart = new Date(todayStart);
          yesterdayStart.setDate(yesterdayStart.getDate() - 1);
          const yesterdayEnd = new Date(todayEnd);
          yesterdayEnd.setDate(yesterdayEnd.getDate() - 1);
          return leadDate >= yesterdayStart && leadDate <= yesterdayEnd;
        }
        if (reportDateFilter === 'this-week') {
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1);
          const monday = new Date(now.getFullYear(), now.getMonth(), diff);
          monday.setHours(0, 0, 0, 0);
          return leadDate >= monday;
        }
        if (reportDateFilter === 'this-month') {
          const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          return leadDate >= firstDayOfMonth;
        }
        if (reportDateFilter === 'custom') {
          if (!reportStartDate) return true;
          const start = new Date(reportStartDate);
          start.setHours(0, 0, 0, 0);
          const end = reportEndDate ? new Date(reportEndDate) : new Date();
          end.setHours(23, 59, 59, 999);
          return leadDate >= start && leadDate <= end;
        }
        return true;
      });
    }

    // Apply column filters
    Object.entries(reportFilters).forEach(([key, selectedVals]) => {
      if (selectedVals.length === 0) return;
      result = result.filter(lead => {
        let val = '';
        if (key === 'name') val = lead.name;
        else if (key === 'phone') val = lead.phone;
        else if (key === 'current_location') val = lead.current_location || '-';
        else if (key === 'created_at') val = lead.created_at ? new Date(lead.created_at).toLocaleDateString('tr-TR') : '-';
        else if (key === 'warmth') val = lead.warmth === 'hot' ? '🔥 Hot' : (lead.warmth === 'warm' ? '⚡ Warm' : '❄️ Cold');
        else if (key === 'source') val = lead.source || '-';
        else if (key === 'room_count') val = lead.room_count || '-';
        else if (key === 'lead_status') val = lead.lead_status || '-';
        else if (key === 'customer_question') val = lead.customer_question || '-';
        else if (key === 'notes') val = lead.notes || '-';
        else if (key === 'budget') val = lead.budget ? formatNumberWithDots(lead.budget) : '-';
        else if (key === 'updated_at') val = lead.last_update_info && lead.updated_at ? new Date(lead.updated_at).toLocaleDateString('tr-TR') : '-';
        else if (key === 'last_update_info') val = lead.last_update_info || '-';

        return selectedVals.includes((val || '').trim() || '-');
      });
    });

    // Apply sorting
    if (reportSort) {
      const { key, direction } = reportSort;
      result.sort((a, b) => {
        let valA: any = '';
        let valB: any = '';

        if (key === 'name') { valA = a.name; valB = b.name; }
        else if (key === 'phone') { valA = a.phone; valB = b.phone; }
        else if (key === 'current_location') { valA = a.current_location || ''; valB = b.current_location || ''; }
        else if (key === 'created_at') { valA = a.created_at || ''; valB = b.created_at || ''; }
        else if (key === 'warmth') { valA = a.warmth; valB = b.warmth; }
        else if (key === 'source') { valA = a.source || ''; valB = b.source || ''; }
        else if (key === 'room_count') { valA = a.room_count || ''; valB = b.room_count || ''; }
        else if (key === 'lead_status') { valA = a.lead_status || ''; valB = b.lead_status || ''; }
        else if (key === 'customer_question') { valA = a.customer_question || ''; valB = b.customer_question || ''; }
        else if (key === 'notes') { valA = a.notes || ''; valB = b.notes || ''; }
        else if (key === 'budget') { valA = a.budget; valB = b.budget; }
        else if (key === 'updated_at') { valA = a.updated_at || ''; valB = b.updated_at || ''; }
        else if (key === 'last_update_info') { valA = a.last_update_info || ''; valB = b.last_update_info || ''; }

        if (typeof valA === 'string') {
          return direction === 'asc' ? valA.localeCompare(valB, 'tr') : valB.localeCompare(valA, 'tr');
        } else {
          return direction === 'asc' ? valA - valB : valB - valA;
        }
      });
    }

    return result;
  };

  // Get processed leads for DB table (filtered and sorted)
  const getProcessedDbLeads = () => {
    // Start with basic search filter
    let result = (leads || []).filter(lead => {
      if (!lead) return false;
      const name = String(lead.name || '').toLowerCase();
      const cleanPhone = String(lead.phone || '').replace(/\D/g, '');
      const cleanQuery = leadDbSearchQuery.replace(/\D/g, '');
      const phoneMatch = cleanQuery !== '' && cleanPhone.includes(cleanQuery);
      const loc = String(lead.current_location || '').toLowerCase();
      const query = leadDbSearchQuery.toLowerCase();
      return name.includes(query) || phoneMatch || loc.includes(query);
    });

    // Apply column filters
    Object.entries(dbFilters).forEach(([key, selectedVals]) => {
      if (selectedVals.length === 0) return;
      result = result.filter(lead => {
        let val = '';
        if (key === 'name') val = lead.name;
        else if (key === 'phone') val = lead.phone;
        else if (key === 'current_location') val = lead.current_location || '-';
        else if (key === 'created_at') val = lead.created_at ? new Date(lead.created_at).toLocaleDateString('tr-TR') : '-';
        else if (key === 'warmth') val = lead.warmth === 'hot' ? '🔥 Hot' : (lead.warmth === 'warm' ? '⚡ Warm' : '❄️ Cold');
        else if (key === 'source') val = lead.source || '-';
        else if (key === 'room_count') val = lead.room_count || '-';
        else if (key === 'lead_status') val = lead.lead_status || '-';
        else if (key === 'customer_question') val = lead.customer_question || '-';
        else if (key === 'notes') val = lead.notes || '-';
        else if (key === 'budget') val = lead.budget ? formatNumberWithDots(lead.budget) : '-';
        else if (key === 'updated_at') val = lead.last_update_info && lead.updated_at ? new Date(lead.updated_at).toLocaleDateString('tr-TR') : '-';
        else if (key === 'last_update_info') val = lead.last_update_info || '-';

        return selectedVals.includes((val || '').trim() || '-');
      });
    });

    // Apply sorting
    if (dbSort) {
      const { key, direction } = dbSort;
      result.sort((a, b) => {
        let valA: any = '';
        let valB: any = '';

        if (key === 'name') { valA = a.name; valB = b.name; }
        else if (key === 'phone') { valA = a.phone; valB = b.phone; }
        else if (key === 'current_location') { valA = a.current_location || ''; valB = b.current_location || ''; }
        else if (key === 'created_at') { valA = a.created_at || ''; valB = b.created_at || ''; }
        else if (key === 'warmth') { valA = a.warmth; valB = b.warmth; }
        else if (key === 'source') { valA = a.source || ''; valB = b.source || ''; }
        else if (key === 'room_count') { valA = a.room_count || ''; valB = b.room_count || ''; }
        else if (key === 'lead_status') { valA = a.lead_status || ''; valB = b.lead_status || ''; }
        else if (key === 'customer_question') { valA = a.customer_question || ''; valB = b.customer_question || ''; }
        else if (key === 'notes') { valA = a.notes || ''; valB = b.notes || ''; }
        else if (key === 'budget') { valA = a.budget; valB = b.budget; }
        else if (key === 'updated_at') { valA = a.updated_at || ''; valB = b.updated_at || ''; }
        else if (key === 'last_update_info') { valA = a.last_update_info || ''; valB = b.last_update_info || ''; }

        if (typeof valA === 'string') {
          return direction === 'asc' ? valA.localeCompare(valB, 'tr') : valB.localeCompare(valA, 'tr');
        } else {
          return direction === 'asc' ? valA - valB : valB - valA;
        }
      });
    }

    return result;
  };

  // Inline update for properties
  const handleInlinePropertyUpdate = async (prop: Property, field: keyof Property, value: any) => {
    const updated = {
      ...prop,
      [field]: field === 'price' ? (Number(value) || 0) : value
    };
    await StorageManager.saveProperty(updated);
    await loadAllData();
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

  // Export current filtered report leads to Excel (.xlsx) file
  const handleExportToExcel = () => {
    const reportFilteredLeads = getProcessedReportLeads();
    if (reportFilteredLeads.length === 0) {
      alert("Aktarılacak veri bulunamadı.");
      return;
    }

    const dataToExport = reportFilteredLeads.map(lead => {
      let warmthText = 'Cold';
      if (lead.warmth === 'hot') warmthText = '🔥 Hot';
      else if (lead.warmth === 'warm') warmthText = '⚡ Warm';
      else if (lead.warmth === 'cold') warmthText = '❄️ Cold';

      return {
        "Müşteri Adı Soyadı": lead.name || '',
        "Cep Telefonu": lead.phone || '',
        "Oturduğu Yer": lead.current_location || '',
        "Database Eklenme Tr.": lead.created_at ? new Date(lead.created_at).toLocaleDateString('tr-TR') : '',
        "Sıcaklık": warmthText,
        "Kanal": lead.source || '',
        "Oda Talebi": lead.room_count || '',
        "Mevcut Durum": lead.lead_status || '',
        "Müşteri Sorusu": lead.customer_question || '',
        "Son Not": lead.notes || '',
        "Bütçe": lead.budget || 0,
        "Son Güncelleme": lead.updated_at ? new Date(lead.updated_at).toLocaleDateString('tr-TR') : '',
        "Güncelleme Detayı": lead.last_update_info || ''
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Filtreli Müşteriler");

    // Auto-fit column widths
    const maxLens = Object.keys(dataToExport[0]).map(key => {
      let maxVal = key.length;
      dataToExport.forEach(row => {
        const val = String((row as any)[key] || '');
        if (val.length > maxVal) maxVal = val.length;
      });
      return { wch: maxVal + 3 };
    });
    ws['!cols'] = maxLens;

    XLSX.writeFile(wb, "Rapor_Filtreli_Musteriler.xlsx");
  };

  // Generate and download a sample Excel template in memory
  const handleDownloadSampleTemplate = (type: 'leads' | 'properties') => {
    let headers: Record<string, any>[] = [];
    let filename = '';

    if (type === 'leads') {
      filename = 'ornek_musteri_listesi_sablonu.xlsx';
      headers = [
        {
          "İsim Soyisim": "Ahmet Yılmaz",
          "Tel": "+905554443322",
          "Lead Kanal": "Instagram",
          "İlgilendiği Daire Tipi": "3+1",
          "Yaşadığı Yer": "İstanbul",
          "Bölge/Konum": "Kartal",
          "Not": "Deniz manzaralı daire arıyor.",
          "Durum/Aksiyon": "Sıcak",
          "Randevu Tarihi": "15.07.2026",
          "Bütçe": "5500000"
        },
        {
          "İsim Soyisim": "Ayşe Kaya",
          "Tel": "+905321112233",
          "Lead Kanal": "Sahibinden.com",
          "İlgilendiği Daire Tipi": "2+1",
          "Yaşadığı Yer": "Ankara",
          "Bölge/Konum": "Pendik",
          "Not": "Yatırımlık bakıyor.",
          "Durum/Aksiyon": "Sıcak",
          "Randevu Tarihi": "",
          "Bütçe": "4200000"
        }
      ];
    } else {
      filename = 'ornek_daire_portfoyu_sablonu.xlsx';
      headers = [
        {
          "Parsel": "1024",
          "BağBöl No": "12",
          "Kat": "3",
          "KullAmacı": "Konut",
          "DaireTipi": "3+1",
          "KapalıAlan (m2)": "120",
          "Fiyat": "6500000"
        },
        {
          "Parsel": "1024",
          "BağBöl No": "15",
          "Kat": "4",
          "KullAmacı": "Konut",
          "DaireTipi": "2+1",
          "KapalıAlan (m2)": "95",
          "Fiyat": "5200000"
        }
      ];
    }

    const ws = XLSX.utils.json_to_sheet(headers);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Örnek Şablon");

    // Auto-fit column widths
    const maxLens = Object.keys(headers[0]).map(key => {
      let maxVal = key.length;
      headers.forEach(row => {
        const val = String(row[key] || '');
        if (val.length > maxVal) maxVal = val.length;
      });
      return { wch: maxVal + 4 };
    });
    ws['!cols'] = maxLens;

    XLSX.writeFile(wb, filename);
  };

  // Filter leads by search query
  const filteredLeads = (leads || []).filter(l => {
    if (!l) return false;
    const name = l.name ? String(l.name).toLowerCase() : '';
    const phone = l.phone ? String(l.phone) : '';
    const targetRegion = l.target_region ? String(l.target_region).toLowerCase() : '';
    const query = searchQuery ? searchQuery.toLowerCase() : '';
    return name.includes(query) || phone.includes(query) || targetRegion.includes(query);
  });

  // Split leads by warmth for CRM columns
  const coldLeads = filteredLeads.filter(l => l.warmth === 'cold');
  const warmLeads = filteredLeads.filter(l => l.warmth === 'warm');
  const hotLeads = filteredLeads.filter(l => l.warmth === 'hot');

  // Render distribution card helper for reports charts
  const renderDistributionCard = (title: string, dataKey: keyof Lead, leadsList: Lead[]) => {
    const { data, totalValid } = getDistributionData(leadsList, dataKey);

    return (
      <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', minHeight: '280px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0 }}>
          <span>{title}</span>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 400 }}>{totalValid} geçerli veri</span>
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', flex: 1, justifyContent: 'center' }}>
          {data.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', margin: 0 }}>Geçerli veri bulunmamaktadır.</p>
          ) : (
            data.map((item, idx) => {
              let barColor = 'var(--primary-gradient)';
              if (dataKey === 'warmth') {
                if (item.label.toLowerCase() === 'hot' || item.label.includes('🔥')) barColor = 'var(--color-danger)';
                else if (item.label.toLowerCase() === 'warm' || item.label.includes('⚡')) barColor = 'var(--color-warning)';
                else barColor = '#60a5fa';
              } else {
                const colors = [
                  'linear-gradient(90deg, #a855f7 0%, #ec4899 100%)',
                  'linear-gradient(90deg, #06b6d4 0%, #3b82f6 100%)',
                  'linear-gradient(90deg, #10b981 0%, #14b8a6 100%)',
                  'linear-gradient(90deg, #f59e0b 0%, #ef4444 100%)',
                  'linear-gradient(90deg, #6366f1 0%, #a855f7 100%)'
                ];
                barColor = colors[idx % colors.length];
              }

              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    <span style={{ fontWeight: 500, color: '#fff' }}>{item.label}</span>
                    <span>{item.count} Müşteri ({item.percentage.toFixed(0)}%)</span>
                  </div>
                  <div style={{ height: '8px', background: 'rgba(255, 255, 255, 0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      background: barColor,
                      width: `${item.percentage}%`,
                      borderRadius: '4px',
                      transition: 'width 0.5s ease-out'
                    }}></div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    );
  };

  // Format currency helper
  const formatCurrency = (val: any) => {
    const num = Number(val);
    if (isNaN(num) || num === 0) return '0 TL';
    const sign = num < 0 ? '-' : '';
    const formatted = String(Math.round(Math.abs(num))).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${sign}${formatted} TL`;
  };



  return (
    <div className="app-container">
      {/* Mobile Top Bar */}
      <div className="mobile-top-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{
            background: 'var(--primary-gradient)',
            width: '28px',
            height: '28px',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            fontSize: '0.95rem',
            color: '#fff'
          }}>
            F
          </div>
          <span style={{ fontWeight: 800, fontSize: '1.1rem', letterSpacing: '-0.5px' }}>FullyCRM</span>
        </div>
        <button 
          onClick={() => setIsOpenMobile(!isOpenMobile)}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', cursor: 'pointer' }}
        >
          <Menu size={22} />
        </button>
      </div>

      {/* Mobile Sidebar Backdrop */}
      {isOpenMobile && (
        <div 
          onClick={() => setIsOpenMobile(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            background: 'rgba(0, 0, 0, 0.55)',
            zIndex: 190,
          }}
        />
      )}

      {/* Sidebar Component */}
      <Sidebar 
        activeTab={activeTab} 
        setActiveTab={(tab) => {
          if (tab !== 'add-lead') setEditingLead(null);
          setActiveTab(tab);
        }}
        isOpenMobile={isOpenMobile}
        setIsOpenMobile={setIsOpenMobile}
      />

      <div className="main-content-wrapper">
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '300px', flexDirection: 'column', gap: '1rem' }}>
            <RefreshCw className="animate-spin" size={40} style={{ color: 'var(--color-primary)' }} />
            <p style={{ color: 'var(--text-secondary)' }}>Veriler yükleniyor...</p>
          </div>
        ) : (
          <main className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem', width: '100%' }}>
            {/* Dashboard Header with Genel Rapor button */}
            {activeTab === 'dashboard' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.25rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#fff', margin: 0 }}>
                    CRM Paneli
                  </h2>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Müşteri takibi ve satış aktiviteleri genel görünümü
                  </p>
                </div>
                <button 
                  onClick={() => setActiveTab('reports-general')}
                  className="glow-btn"
                  style={{ gap: '0.5rem' }}
                >
                  <BarChart3 size={18} />
                  Genel Rapor
                </button>
              </div>
            )}

            {/* Quick Stats Banner */}
            {activeTab === 'dashboard' && (
              <div className="stats-cards-row">
                {/* Card 1: Toplam Lead */}
                <div 
                  className={`glass-panel stats-mini-card ${selectedMetric === 'total' ? 'card-highlight-orange' : ''}`}
                  onClick={() => setSelectedMetric('total')}
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', position: 'relative' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Users size={16} style={{ color: selectedMetric === 'total' ? 'var(--color-primary)' : 'var(--text-secondary)' }} />
                      Toplam Müşteri
                    </span>
                    <span title="Sistemde kayıtlı toplam müşteri adedi" style={{ display: 'inline-flex', cursor: 'help' }}><Info size={14} style={{ color: 'var(--text-muted)' }} /></span>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                      <span className="stats-value-display">{leads.length}</span>
                      <span className="stats-trend-badge stats-trend-up">
                        <ChevronUp size={12} />
                        +{leads.filter(l => {
                          const tenDaysAgo = new Date();
                          tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
                          return l.created_at && new Date(l.created_at) > tenDaysAgo;
                        }).length}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Son 10 günde eklenenler</p>
                  </div>
                </div>

                {/* Card 2: Sıcak Takip */}
                <div 
                  className={`glass-panel stats-mini-card ${selectedMetric === 'hot' ? 'card-highlight-orange' : ''}`}
                  onClick={() => setSelectedMetric('hot')}
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Heart size={16} style={{ color: selectedMetric === 'hot' ? 'var(--color-primary)' : 'var(--text-secondary)' }} />
                      Hot
                    </span>
                    <span title="Hot takip kategorisindeki yüksek potansiyelli müşteriler" style={{ display: 'inline-flex', cursor: 'help' }}><Info size={14} style={{ color: 'var(--text-muted)' }} /></span>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                      <span className="stats-value-display">{leads.filter(l => l.warmth === 'hot').length}</span>
                      <span className="stats-trend-badge stats-trend-up" style={{ background: 'rgba(255, 106, 0, 0.1)', color: 'var(--color-primary)' }}>
                        {((leads.filter(l => l.warmth === 'hot').length / Math.max(leads.length, 1)) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Toplam içindeki oranı</p>
                  </div>
                </div>

                {/* Card 3: Aktif Randevular */}
                <div 
                  className={`glass-panel stats-mini-card ${selectedMetric === 'appointments' ? 'card-highlight-orange' : ''}`}
                  onClick={() => setSelectedMetric('appointments')}
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Calendar size={16} style={{ color: selectedMetric === 'appointments' ? 'var(--color-primary)' : 'var(--text-secondary)' }} />
                      Aktif Randevu
                    </span>
                    <span title="Görüşme veya sunum bekleyen aktif randevular" style={{ display: 'inline-flex', cursor: 'help' }}><Info size={14} style={{ color: 'var(--text-muted)' }} /></span>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                      <span className="stats-value-display">{appointments.filter(a => a.status === 'pending').length}</span>
                      <span className="stats-trend-badge stats-trend-up" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--color-success)' }}>
                        Tamamlanan: {appointments.filter(a => a.status === 'completed').length}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Sonuçlanmayı bekleyen görüşmeler</p>
                  </div>
                </div>

                {/* Card 4: Aktif Portföy */}
                <div 
                  className={`glass-panel stats-mini-card ${selectedMetric === 'properties' ? 'card-highlight-orange' : ''}`}
                  onClick={() => setSelectedMetric('properties')}
                  style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                      <Sparkles size={16} style={{ color: selectedMetric === 'properties' ? 'var(--color-primary)' : 'var(--text-secondary)' }} />
                      Aktif Portföy
                    </span>
                    <span title="Satışta olan mülk portföyü adedi" style={{ display: 'inline-flex', cursor: 'help' }}><Info size={14} style={{ color: 'var(--text-muted)' }} /></span>
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
                      <span className="stats-value-display">{properties.length}</span>
                      <span className="stats-trend-badge stats-trend-up">
                        <ChevronUp size={12} />
                        +{properties.filter(p => {
                          const tenDaysAgo = new Date();
                          tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
                          return p.created_at && new Date(p.created_at) > tenDaysAgo;
                        }).length}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>Toplam mülk portföyü</p>
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
              <div className="crm-columns-grid">
                {/* 1. HOT LEADS COLUMN */}
                <div className="glass-panel" style={{ background: 'rgba(248, 113, 113, 0.02)', borderColor: 'rgba(248, 113, 113, 0.15)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-danger)' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-danger)' }}></span>
                      Hot
                    </h3>
                    <span className="badge badge-hot">{hotLeads.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {hotLeads.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>Müşteri bulunmuyor.</p>
                    ) : (
                      hotLeads.filter(Boolean).map(l => renderLeadCard(l))
                    )}
                  </div>
                </div>

                {/* 2. WARM LEADS COLUMN */}
                <div className="glass-panel" style={{ background: 'rgba(251, 191, 36, 0.02)', borderColor: 'rgba(251, 191, 36, 0.15)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-warning)' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-warning)' }}></span>
                      Warm
                    </h3>
                    <span className="badge badge-warm">{warmLeads.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {warmLeads.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>Müşteri bulunmuyor.</p>
                    ) : (
                      warmLeads.filter(Boolean).map(l => renderLeadCard(l))
                    )}
                  </div>
                </div>

                {/* 3. COLD LEADS COLUMN */}
                <div className="glass-panel" style={{ background: 'rgba(59, 130, 246, 0.02)', borderColor: 'rgba(59, 130, 246, 0.15)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#60a5fa' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#3b82f6' }}></span>
                      Cold
                    </h3>
                    <span className="badge badge-cold">{coldLeads.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {coldLeads.length === 0 ? (
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', padding: '2rem 0' }}>Müşteri bulunmuyor.</p>
                    ) : (
                      coldLeads.filter(Boolean).map(l => renderLeadCard(l))
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
                        room_count: '', purpose: 'Oturumluk', customer_question: '', lead_status: '', rejection_reason: '', target_region: '', current_location: '',
                        marital_status: '', occupation: '', budget: 0, warmth: '' as any, is_alert_active: true, notes: '',
                        created_at: getTodayDateString(),
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
                        <option value="Müteahhit Yönlendirmesi">Müteahhit Yönlendirmesi</option>
                        <option value="ajans">Ajans</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Sıcaklık Seviyesi (Warmth) *</label>
                      <select 
                        required
                        className="form-control"
                        value={newLead.warmth || ''}
                        onChange={(e) => setNewLead({ ...newLead, warmth: e.target.value as any })}
                      >
                        <option value="">Seçiniz</option>
                        <option value="hot">🔥 Hot</option>
                        <option value="warm">⚡ Warm</option>
                        <option value="cold">❄️ Cold</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Bütçe (TL) *</label>
                      <input 
                        type="text" 
                        required
                        className="form-control" 
                        placeholder="Maksimum Bütçe" 
                        value={formatNumberWithDots(newLead.budget)}
                        onChange={(e) => {
                          const rawVal = e.target.value.replace(/\D/g, '');
                          setNewLead({ ...newLead, budget: Number(rawVal) || 0 });
                        }}
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
                      <label style={{ display: 'block', marginBottom: '0.5rem' }}>Oda İhtiyacı</label>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(3, 1fr)',
                        gap: '0.75rem',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: '10px',
                        padding: '0.8rem 1rem',
                        marginTop: '0.25rem'
                      }}>
                        {['4+1', '3+1', '2+1', '1+1', 'Villa'].map((room) => {
                          const selectedRooms = newLead.room_count
                            ? newLead.room_count.split(',').map(s => s.trim())
                            : [];
                          const isChecked = selectedRooms.includes(room);
                          
                          return (
                            <label
                              key={room}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                cursor: 'pointer',
                                fontSize: '0.9rem',
                                color: isChecked ? 'var(--text-primary)' : 'var(--text-secondary)',
                                fontWeight: isChecked ? 600 : 400,
                                userSelect: 'none'
                              }}
                            >
                              <input
                                type="checkbox"
                                value={room}
                                checked={isChecked}
                                style={{
                                  width: '16px',
                                  height: '16px',
                                  cursor: 'pointer',
                                  accentColor: 'var(--color-primary)'
                                }}
                                onChange={(e) => {
                                  let newRooms = [...selectedRooms];
                                  if (e.target.checked) {
                                    if (!newRooms.includes(room)) {
                                      newRooms.push(room);
                                    }
                                  } else {
                                    newRooms = newRooms.filter(r => r !== room);
                                  }
                                  const orderedRooms = ['4+1', '3+1', '2+1', '1+1', 'Villa'].filter(r => newRooms.includes(r));
                                  setNewLead({
                                    ...newLead,
                                    room_count: orderedRooms.join(', ')
                                  });
                                }}
                              />
                              {room}
                            </label>
                          );
                        })}
                      </div>
                    </div>

                    <div className="form-group">
                      <label>Müşteriden Gelen Sorular</label>
                      <select 
                        className="form-control"
                        value={newLead.customer_question || ''}
                        onChange={(e) => setNewLead({ ...newLead, customer_question: e.target.value })}
                      >
                        <option value="">Seçiniz</option>
                        <option value="Fiyat Bilgisi">Fiyat Bilgisi</option>
                        <option value="Konum">Konum</option>
                        <option value="Takas İmkanı">Takas İmkanı</option>
                        <option value="Deniz mesafesi">Deniz mesafesi</option>
                        <option value="Ebeveyn Banyosu">Ebeveyn Banyosu</option>
                        <option value="Ödeme Seçenekleri">Ödeme Seçenekleri</option>
                        <option value="Finansman Şirketine Uygunluk">Finansman Şirketine Uygunluk</option>
                        <option value="Çatı Dubleksi">Çatı Dubleksi</option>
                        <option value="Pazarlık Payı">Pazarlık Payı</option>
                        <option value="Teslim Tarihi">Teslim Tarihi</option>
                        <option value="Takas Teklifi-Konum">Takas Teklifi-Konum</option>
                        <option value="Taksit İmkanı">Taksit İmkanı</option>
                        <option value="Mesafe Sorgusu">Mesafe Sorgusu</option>
                        <option value="Ara Kat Bilgisi">Ara Kat Bilgisi</option>
                        <option value="M2 Bilgisi">M2 Bilgisi</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Lead Mevcut Durum *</label>
                      <select 
                        required
                        className="form-control"
                        value={newLead.lead_status || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updates: Partial<Lead> = { lead_status: val };
                          if (val === 'Beklemede') {
                            updates.warmth = 'hot';
                          }
                          setNewLead({ ...newLead, ...updates });
                        }}
                      >
                        <option value="">Seçiniz</option>
                        <option value="Beklemede">Beklemede</option>
                        <option value="Güncel Katalog Gönderildi,Davet Yapıldı">Güncel Katalog Gönderildi,Davet Yapıldı</option>
                        <option value="Katalog Gönderimi Sonrası İletişim Devam">Katalog Gönderimi Sonrası İletişim Devam</option>
                        <option value="Randevu Alındı">Randevu Alındı</option>
                        <option value="Red">Red</option>
                        <option value="Red/Fikri değişebilir">Red/Fikri değişebilir</option>
                        <option value="İlk temas">İlk temas</option>
                        <option value="Ulaşılamadı">Ulaşılamadı</option>
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
                      <label>Red Nedeni</label>
                      <select 
                        className="form-control"
                        value={newLead.rejection_reason || ''}
                        onChange={(e) => setNewLead({ ...newLead, rejection_reason: e.target.value })}
                      >
                        <option value="">Seçiniz</option>
                        <option value="Mimariyi Beğenmediğinden">Mimariyi Beğenmediğinden</option>
                        <option value="Farklı Proje Nedeniyle Red">Farklı Proje Nedeniyle Red</option>
                        <option value="Bütçe Aşımı Nedeniyle Red">Bütçe Aşımı Nedeniyle Red</option>
                        <option value="Denize Uzaklık Nedeniyle Red">Denize Uzaklık Nedeniyle Red</option>
                        <option value="Yatırımdan Vazgeçti">Yatırımdan Vazgeçti</option>
                        <option value="Ebeveyn Banyosu Olmaması">Ebeveyn Banyosu Olmaması</option>
                        <option value="Sebep belirtmedi">Sebep belirtmedi</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label>Lead Geliş Tarihi</label>
                      <input 
                        type="date" 
                        className="form-control" 
                        value={newLead.created_at || ''}
                        onChange={(e) => setNewLead({ ...newLead, created_at: e.target.value })}
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
            <div className="glass-panel animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
              {/* Header Navigation controls */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                {/* Left: View buttons */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button 
                    type="button"
                    onClick={() => setCalendarView('month')}
                    className="glow-btn"
                    style={{
                      background: calendarView === 'month' ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid var(--glass-border)',
                      boxShadow: calendarView === 'month' ? 'var(--shadow-glow)' : 'none',
                      padding: '0.45rem 1.15rem',
                      borderRadius: '8px',
                      fontWeight: 600,
                      color: calendarView === 'month' ? '#fff' : 'var(--text-secondary)',
                      fontSize: '0.85rem'
                    }}
                  >
                    Ay Görünümü
                  </button>
                  <button 
                    type="button"
                    onClick={() => setCalendarView('week')}
                    className="glow-btn"
                    style={{
                      background: calendarView === 'week' ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid var(--glass-border)',
                      boxShadow: calendarView === 'week' ? 'var(--shadow-glow)' : 'none',
                      padding: '0.45rem 1.15rem',
                      borderRadius: '8px',
                      fontWeight: 600,
                      color: calendarView === 'week' ? '#fff' : 'var(--text-secondary)',
                      fontSize: '0.85rem'
                    }}
                  >
                    Hafta Görünümü
                  </button>
                  <button 
                    type="button"
                    onClick={() => setCalendarView('day')}
                    className="glow-btn"
                    style={{
                      background: calendarView === 'day' ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid var(--glass-border)',
                      boxShadow: calendarView === 'day' ? 'var(--shadow-glow)' : 'none',
                      padding: '0.45rem 1.15rem',
                      borderRadius: '8px',
                      fontWeight: 600,
                      color: calendarView === 'day' ? '#fff' : 'var(--text-secondary)',
                      fontSize: '0.85rem'
                    }}
                  >
                    Gün Görünümü
                  </button>
                </div>

                {/* Middle: Date title & navigation */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <button 
                    type="button"
                    onClick={() => navigateCalendar(-1)}
                    className="glow-btn"
                    style={{ padding: '0.4rem 0.85rem', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}
                  >
                    Geri
                  </button>
                  <span style={{ fontSize: '1.2rem', fontWeight: 800, minWidth: '160px', textAlign: 'center' }}>
                    {getCalendarTitle()}
                  </span>
                  <button 
                    type="button"
                    onClick={() => navigateCalendar(1)}
                    className="glow-btn"
                    style={{ padding: '0.4rem 0.85rem', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}
                  >
                    İleri
                  </button>
                  <button 
                    type="button"
                    onClick={() => setCalendarDate(new Date())}
                    className="glow-btn"
                    style={{ padding: '0.4rem 0.85rem', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.85rem', marginLeft: '0.5rem' }}
                  >
                    Bugün
                  </button>
                </div>

                {/* Right: Add App Button */}
                <button 
                  type="button"
                  onClick={() => openAddAppModal()}
                  className="glow-btn"
                  style={{ background: 'var(--success-gradient)', padding: '0.45rem 1.15rem', borderRadius: '8px', fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                >
                  <Plus size={16} /> Randevu Planla
                </button>
              </div>

              {/* Render Selected View */}
              {calendarView === 'month' && renderMonthView()}
              {calendarView === 'week' && renderWeekView()}
              {calendarView === 'day' && renderDayView()}
            </div>
          )}

          {/* TAB CONTENT: MATCHMAKER (SMART MATCHING) */}
          {activeTab === 'matchmaker' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
              {/* Matchmaker Sub-Navigation */}
              <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.75rem' }}>
                <button
                  onClick={() => setMatchmakerSubTab('matching')}
                  className="glow-btn animate-fade-in"
                  style={{
                    background: matchmakerSubTab === 'matching' ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--glass-border)',
                    boxShadow: matchmakerSubTab === 'matching' ? 'var(--shadow-glow)' : 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '8px',
                    fontWeight: 600,
                    color: matchmakerSubTab === 'matching' ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <Sparkles size={16} /> Müşteri Eşleştirici
                </button>
                <button
                  onClick={() => setMatchmakerSubTab('portfolio')}
                  className="glow-btn animate-fade-in"
                  style={{
                    background: matchmakerSubTab === 'portfolio' ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--glass-border)',
                    boxShadow: matchmakerSubTab === 'portfolio' ? 'var(--shadow-glow)' : 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '8px',
                    fontWeight: 600,
                    color: matchmakerSubTab === 'portfolio' ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <Briefcase size={16} /> Portföy & Daire Yönetimi
                </button>
                <button
                  onClick={() => setMatchmakerSubTab('database')}
                  className="glow-btn animate-fade-in"
                  style={{
                    background: matchmakerSubTab === 'database' ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--glass-border)',
                    boxShadow: matchmakerSubTab === 'database' ? 'var(--shadow-glow)' : 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '8px',
                    fontWeight: 600,
                    color: matchmakerSubTab === 'database' ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem'
                  }}
                >
                  <Database size={16} /> Müşteri Veritabanı
                </button>
              </div>

              {/* Sub-tab 1: Müşteri Eşleştirici */}
              {matchmakerSubTab === 'matching' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  <div className="glass-panel animate-fade-in" style={{ padding: '1.5rem' }}>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1rem', color: 'var(--color-primary)' }}>Eşleştirilecek Müşteriyi Seçin</h3>
                    <select
                      className="form-control"
                      style={{ maxWidth: '450px' }}
                      value={selectedLeadId}
                      onChange={(e) => setSelectedLeadId(e.target.value)}
                    >
                      <option value="">-- Müşteri Seçin --</option>
                      {(leads || []).filter(Boolean).map(l => (
                        <option key={l.id} value={l.id}>
                          {l.name} ({l.room_count || 'Belirsiz'} Oda - Bütçe: {formatCurrency(l.budget)}) - {l.warmth === 'hot' ? '🔥 Hot' : l.warmth === 'warm' ? '⚡ Warm' : '❄️ Cold'}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const selectedLead = leads.find(l => l.id === selectedLeadId);
                    if (!selectedLead) {
                      return (
                        <div className="glass-panel" style={{ padding: '3rem 2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                          <Users size={36} style={{ marginBottom: '0.75rem', opacity: 0.5, color: 'var(--color-primary)' }} />
                          <p>Lütfen daire eşleştirmesi yapmak istediğiniz müşteriyi yukarıdan seçin.</p>
                        </div>
                      );
                    }

                    const leadRoom = String(selectedLead.room_count || '').trim().toLowerCase();
                    const budget = Number(selectedLead.budget) || 0;
                    const maxFlexibleBudget = budget * 1.10; // +10% budget flexibility

                    // Filter properties that are active, have a valid price, and match notes keywords
                    const activeProps = (properties || []).filter(p => {
                      if (!p) return false;
                      if (p.is_sold) return false;
                      
                      // 1. Exclude Kapalı properties
                      const isClosed = String(p.portfoy_kimde || '').trim().toLowerCase() === 'kapalı';
                      if (isClosed) return false;
                      
                      // 2. Safeguard: Price must be greater than 0
                      const price = Number(p.price) || 0;
                      if (price <= 0) return false;

                      // 3. Keyword matching between lead notes and property features
                      const leadNotes = String(selectedLead.notes || '').toLowerCase();
                      
                      // Check for "bahçe" or "bahçeli" keyword in lead notes
                      if (leadNotes.includes('bahçe') || leadNotes.includes('bahceli') || leadNotes.includes('bahçeli')) {
                        const propExtra = String(p.extra_ozellik || '').toLowerCase();
                        const propTitle = String(p.title || '').toLowerCase();
                        const propHasGarden = propExtra.includes('bahçe') || propExtra.includes('bahçeli') || propExtra.includes('bahceli') ||
                                              propTitle.includes('bahçe') || propTitle.includes('bahçeli') || propTitle.includes('bahceli');
                        if (!propHasGarden) return false;
                      }

                      // Check for "dubleks" or "dublex" keyword in lead notes
                      if (leadNotes.includes('dubleks') || leadNotes.includes('dublex')) {
                        const propExtra = String(p.extra_ozellik || '').toLowerCase();
                        const propTitle = String(p.title || '').toLowerCase();
                        const propType = String(p.type || '').toLowerCase();
                        const propKullAmaci = String(p.kull_amaci || '').toLowerCase();
                        const propHasDuplex = propExtra.includes('dubleks') || propExtra.includes('dublex') ||
                                              propTitle.includes('dubleks') || propTitle.includes('dublex') ||
                                              propType.includes('dubleks') || propType.includes('dublex') ||
                                              propKullAmaci.includes('dubleks') || propKullAmaci.includes('dublex');
                        if (!propHasDuplex) return false;
                      }

                      return true;
                    });

                    const leadRooms = leadRoom ? leadRoom.split(',').map(s => s.trim().toLowerCase()) : [];

                    // Split into exact and flexible budget matching
                    const exactMatches = activeProps.filter(p => {
                      const propRoom = String(p.room_count || '').trim().toLowerCase();
                      const price = Number(p.price) || 0;
                      const isRoomMatch = leadRooms.length === 0 || leadRooms.includes(propRoom);
                      return isRoomMatch && price <= budget;
                    });

                    const flexibleMatches = activeProps.filter(p => {
                      const propRoom = String(p.room_count || '').trim().toLowerCase();
                      const price = Number(p.price) || 0;
                      const isRoomMatch = leadRooms.length === 0 || leadRooms.includes(propRoom);
                      return isRoomMatch && price > budget && price <= maxFlexibleBudget;
                    });

                    return (
                      <div className="animate-fade-in" style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1.5rem' }}>
                        {/* Lead Details Card */}
                        <div className="glass-panel" style={{ background: 'var(--bg-tertiary)', borderLeft: '4px solid var(--color-primary)' }}>
                          <h4 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.75rem' }}>Müşteri Talebi ve Kriterleri</h4>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
                            <div>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Müşteri Adı:</span>
                              <p style={{ fontWeight: 700 }}>{selectedLead.name}</p>
                            </div>
                            <div>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>İstediği Oda Sayısı:</span>
                              <p style={{ fontWeight: 700, color: 'var(--color-primary)' }}>🏠 {selectedLead.room_count || 'Belirtilmedi'}</p>
                            </div>
                            <div>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Maksimum Bütçe:</span>
                              <p style={{ fontWeight: 700, color: 'var(--color-success)' }}>💰 {formatCurrency(selectedLead.budget)}</p>
                            </div>
                            <div>
                              <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Esnek Limit (+%10):</span>
                              <p style={{ fontWeight: 700, color: 'var(--color-warning)' }}>⚡ {formatCurrency(maxFlexibleBudget)}</p>
                            </div>
                          </div>
                        </div>

                        {/* Matching Results Columns */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '1.5rem' }}>
                          
                          {/* Col 1: Exact Matches */}
                          <div className="glass-panel">
                            <h4 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-success)' }}>
                              <CheckCircle2 size={18} /> Tam Uyan Daireler ({exactMatches.length})
                            </h4>

                            {exactMatches.length === 0 ? (
                              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic', padding: '1rem 0' }}>Bütçe sınırları içinde tam uyan daire bulunamadı.</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {exactMatches.map(p => {
                                  const shareText = `Merhaba ${selectedLead.name},\n\nAradığınız kriterlere (${selectedLead.room_count}) ve bütçenize tam uygun bir dairemiz mevcuttur:\n🏢 Parsel ${p.parsel || '-'} / Daire No: ${p.bag_bol_no || '-'}\n📐 Net Alan: ${p.net_alan || '-'} m² / Kat: ${p.kat || '-'}\n💰 Fiyat: ${formatCurrency(p.price)}\n${p.extra_ozellik ? `✨ Özellik: ${p.extra_ozellik}\n` : ''}\nDetaylı bilgi ve sunum için görüşebiliriz.`;
                                  const whatsappUrl = `https://api.whatsapp.com/send?phone=${(selectedLead.phone || '').replace(/\D/g, '')}&text=${encodeURIComponent(shareText)}`;

                                  return (
                                    <div key={p.id} style={{ background: 'rgba(16, 185, 129, 0.03)', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '8px', padding: '1rem' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                          <h5 style={{ fontWeight: 800, fontSize: '1rem' }}>Parsel {p.parsel} - Daire {p.bag_bol_no}</h5>
                                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Kat: {p.kat || '-'} | Alan: {p.net_alan || '-'}m² Net / {p.brut_alan || '-'}m² Brüt</span>
                                          {p.extra_ozellik && <p style={{ fontSize: '0.75rem', color: 'var(--color-primary)', marginTop: '0.2rem' }}>✨ {p.extra_ozellik}</p>}
                                          <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-success)', marginTop: '0.5rem' }}>{formatCurrency(p.price)}</p>
                                        </div>
                                        <a href={whatsappUrl} target="_blank" rel="noreferrer" className="glow-btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: 'var(--success-gradient)' }}>
                                          Teklif Et
                                        </a>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {/* Col 2: Flexible Matches */}
                          <div className="glass-panel">
                            <h4 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-warning)' }}>
                              <AlertTriangle size={18} /> Esnek Bütçeli Alternatifler (+%10) ({flexibleMatches.length})
                            </h4>

                            {flexibleMatches.length === 0 ? (
                              <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', fontStyle: 'italic', padding: '1rem 0' }}>Bütçe esneklik limiti (+%10) dahilinde başka daire bulunamadı.</p>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {flexibleMatches.map(p => {
                                  const exceedPercent = Math.round(((Number(p.price) - budget) / budget) * 100);
                                  const shareText = `Merhaba ${selectedLead.name},\n\nAradığınız kriterlere (${selectedLead.room_count}) uyan, bütçenizi çok az esneterek sahip olabileceğiniz alternatif bir dairemiz mevcuttur:\n🏢 Parsel ${p.parsel || '-'} / Daire No: ${p.bag_bol_no || '-'}\n📐 Net Alan: ${p.net_alan || '-'} m² / Kat: ${p.kat || '-'}\n💰 Fiyat: ${formatCurrency(p.price)}\n${p.extra_ozellik ? `✨ Özellik: ${p.extra_ozellik}\n` : ''}\nDetaylı bilgi ve sunum için görüşebiliriz.`;
                                  const whatsappUrl = `https://api.whatsapp.com/send?phone=${(selectedLead.phone || '').replace(/\D/g, '')}&text=${encodeURIComponent(shareText)}`;

                                  return (
                                    <div key={p.id} style={{ background: 'rgba(245, 158, 11, 0.03)', border: '1px solid rgba(245, 158, 11, 0.15)', borderRadius: '8px', padding: '1rem' }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                        <div>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                            <h5 style={{ fontWeight: 800, fontSize: '1rem' }}>Parsel {p.parsel} - Daire {p.bag_bol_no}</h5>
                                            <span style={{ fontSize: '0.65rem', background: 'rgba(245, 158, 11, 0.15)', color: 'var(--color-warning)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 600 }}>Bütçeyi %{exceedPercent} Aşıyor</span>
                                          </div>
                                          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Kat: {p.kat || '-'} | Alan: {p.net_alan || '-'}m² Net / {p.brut_alan || '-'}m² Brüt</span>
                                          {p.extra_ozellik && <p style={{ fontSize: '0.75rem', color: 'var(--color-primary)', marginTop: '0.2rem' }}>✨ {p.extra_ozellik}</p>}
                                          <p style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--color-warning)', marginTop: '0.5rem' }}>{formatCurrency(p.price)}</p>
                                        </div>
                                        <a href={whatsappUrl} target="_blank" rel="noreferrer" className="glow-btn" style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: 'var(--success-gradient)' }}>
                                          Teklif Et
                                        </a>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* Sub-tab 2: Portföy & Daire Yönetimi */}
              {matchmakerSubTab === 'portfolio' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
                  
                  {/* Search and Action Bar */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', gap: '0.5rem', flexGrow: 1, maxWidth: '400px', position: 'relative' }}>
                      <input
                        type="text"
                        placeholder="Parsel, Daire No, Oda Tipi veya Özellik Ara..."
                        className="form-control"
                        style={{ paddingLeft: '2.5rem' }}
                        value={propertySearchQuery}
                        onChange={(e) => setPropertySearchQuery(e.target.value)}
                      />
                      <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)', userSelect: 'none' }}>
                        <input
                          type="checkbox"
                          checked={showAllColumns}
                          onChange={(e) => setShowAllColumns(e.target.checked)}
                          style={{ width: '16px', height: '16px', accentColor: 'var(--color-primary)', cursor: 'pointer' }}
                        />
                        <span>Detaylı Görünüm (17 Kolon)</span>
                      </label>

                      <button
                        onClick={async () => {
                          if (confirm('Tüm portföy envanterini silmek istediğinizden emin misiniz? Bu işlem geri alınamaz.')) {
                            await StorageManager.clearProperties();
                            await loadAllData();
                            alert('Tüm portföy başarıyla silindi.');
                          }
                        }}
                        className="glow-btn"
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#f87171',
                          boxShadow: 'none'
                        }}
                      >
                        <Trash2 size={18} /> Tüm Portföyü Temizle
                      </button>

                      <button
                        onClick={() => setShowAddPropForm(!showAddPropForm)}
                        className="glow-btn"
                      >
                        {showAddPropForm ? <X size={18} /> : <Plus size={18} />} {showAddPropForm ? 'Formu Kapat' : 'Yeni Daire Ekle (Satır Insert)'}
                      </button>
                    </div>
                  </div>

                  {/* Add Property Form */}
                  {showAddPropForm && (
                    <div className="glass-panel animate-fade-in" style={{ background: 'var(--bg-tertiary)' }}>
                      <h3 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '1.25rem', color: 'var(--color-primary)' }}>Yeni Daire Bilgileri</h3>
                      <form onSubmit={handleSaveProperty}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
                          <div className="form-group">
                            <label>Parsel No *</label>
                            <input
                              type="text"
                              required
                              className="form-control"
                              placeholder="Örn: 24"
                              value={newProperty.parsel || ''}
                              onChange={(e) => setNewProperty({ ...newProperty, parsel: e.target.value })}
                            />
                          </div>
                          
                          <div className="form-group">
                            <label>Bağımsız Bölüm No (Daire No) *</label>
                            <input
                              type="text"
                              required
                              className="form-control"
                              placeholder="Örn: 4"
                              value={newProperty.bag_bol_no || ''}
                              onChange={(e) => setNewProperty({ ...newProperty, bag_bol_no: e.target.value })}
                            />
                          </div>

                          <div className="form-group">
                            <label>Daire Tipi (Oda Sayısı) *</label>
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

                          <div className="form-group">
                            <label>Bulunduğu Kat</label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Örn: ZEMİN KAT"
                              value={newProperty.kat || ''}
                              onChange={(e) => setNewProperty({ ...newProperty, kat: e.target.value })}
                            />
                          </div>

                          <div className="form-group">
                            <label>Kullanım Amacı</label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Örn: DUBLEKS MESKEN"
                              value={newProperty.kull_amaci || ''}
                              onChange={(e) => setNewProperty({ ...newProperty, kull_amaci: e.target.value })}
                            />
                          </div>

                          <div className="form-group">
                            <label>Net Alan (m²)</label>
                            <input
                              type="number"
                              className="form-control"
                              placeholder="Örn: 85"
                              value={newProperty.net_alan || ''}
                              onChange={(e) => setNewProperty({ ...newProperty, net_alan: Number(e.target.value) || 0 })}
                            />
                          </div>

                          <div className="form-group">
                            <label>Brüt Alan (m²)</label>
                            <input
                              type="number"
                              className="form-control"
                              placeholder="Örn: 120"
                              value={newProperty.brut_alan || ''}
                              onChange={(e) => setNewProperty({ ...newProperty, brut_alan: Number(e.target.value) || 0 })}
                            />
                          </div>

                          <div className="form-group">
                            <label>Fiyat (TL) *</label>
                            <input
                              type="text"
                              required
                              className="form-control"
                              placeholder="Satış Fiyatı"
                              value={formatNumberWithDots(newProperty.price)}
                              onChange={(e) => {
                                const rawVal = e.target.value.replace(/\D/g, '');
                                setNewProperty({ ...newProperty, price: Number(rawVal) || 0 });
                              }}
                            />
                          </div>

                          <div className="form-group">
                            <label>Statü / Portföy Kimde *</label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Açık, Kapalı, NOVA, İsim"
                              value={newProperty.portfoy_kimde || ''}
                              onChange={(e) => setNewProperty({ ...newProperty, portfoy_kimde: e.target.value })}
                            />
                          </div>

                          <div className="form-group">
                            <label>Ekstra Özellik</label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Örn: BAHÇELİ, ŞÖMİNELİ"
                              value={newProperty.extra_ozellik || ''}
                              onChange={(e) => setNewProperty({ ...newProperty, extra_ozellik: e.target.value })}
                            />
                          </div>

                          <div className="form-group">
                            <label>Merdiven Alanı (m²)</label>
                            <input
                              type="number"
                              className="form-control"
                              placeholder="Örn: 3.75"
                              value={newProperty.merdiven_alan || ''}
                              onChange={(e) => setNewProperty({ ...newProperty, merdiven_alan: Number(e.target.value) || 0 })}
                            />
                          </div>

                          <div className="form-group">
                            <label>Ortak Alan Payı (m²)</label>
                            <input
                              type="number"
                              className="form-control"
                              placeholder="Örn: 18.65"
                              value={newProperty.ortak_alan || ''}
                              onChange={(e) => setNewProperty({ ...newProperty, ortak_alan: Number(e.target.value) || 0 })}
                            />
                          </div>

                          <div className="form-group">
                            <label>Kapalı+Açık Alan (m²)</label>
                            <input
                              type="number"
                              className="form-control"
                              placeholder="Örn: 97.5"
                              value={newProperty.kapali_acik_alan || ''}
                              onChange={(e) => setNewProperty({ ...newProperty, kapali_acik_alan: Number(e.target.value) || 0 })}
                            />
                          </div>

                          <div className="form-group">
                            <label>Daire Sahibi (İsim Soyisim)</label>
                            <input
                              type="text"
                              className="form-control"
                              placeholder="Mülk Sahibi İsim Soyisim"
                              value={newProperty.daire_sahibi || ''}
                              onChange={(e) => setNewProperty({ ...newProperty, daire_sahibi: e.target.value })}
                            />
                          </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            onClick={() => setShowAddPropForm(false)}
                            className="glow-btn"
                            style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', border: '1px solid var(--glass-border)', boxShadow: 'none' }}
                          >
                            Vazgeç
                          </button>
                          <button
                            type="submit"
                            className="glow-btn"
                          >
                            Kaydet ve Ekle
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Properties Table List */}
                  <div className="glass-panel animate-fade-in" style={{ overflowX: 'auto', padding: '1rem' }}>
                    {(() => {
                      const activeProps = (properties || []).filter(p => !p.is_sold);
                      const soldProps = (properties || []).filter(p => !!p.is_sold);

                      const filterFn = (p: Property) => {
                        if (!p) return false;
                        const parsel = String(p.parsel || '').toLowerCase();
                        const bag = String(p.bag_bol_no || '').toLowerCase();
                        const room = String(p.room_count || '').toLowerCase();
                        const extra = String(p.extra_ozellik || '').toLowerCase();
                        const kimde = String(p.portfoy_kimde || '').toLowerCase();
                        const query = propertySearchQuery.toLowerCase();
                        return parsel.includes(query) || bag.includes(query) || room.includes(query) || extra.includes(query) || kimde.includes(query);
                      };

                      const filteredActiveProps = activeProps.filter(filterFn);
                      const filteredSoldProps = soldProps.filter(filterFn);

                      const renderTable = (list: Property[], isSoldTable: boolean) => {
                        if (list.length === 0) {
                          return (
                            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-secondary)' }}>
                              {isSoldTable ? 'Kriterlere uyan satılmış daire bulunamadı.' : 'Kayıtlı aktif daire bulunamadı.'}
                            </div>
                          );
                        }

                        return (
                          <div style={{ overflowX: 'auto', width: '100%' }}>
                            <table style={{ width: '100%', minWidth: showAllColumns ? '1800px' : '100%', borderCollapse: 'collapse', fontSize: '0.85rem', textAlign: 'left' }}>
                              <thead>
                                <tr style={{ borderBottom: '2px solid var(--glass-border)', color: isSoldTable ? 'var(--text-muted)' : 'var(--color-primary)' }}>
                                  {!showAllColumns && <th style={{ padding: '0.75rem 0.5rem', width: '40px' }}></th>}
                                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Parsel</th>
                                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Daire No</th>
                                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Kat</th>
                                  {showAllColumns && <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Kull. Amacı</th>}
                                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Daire Tipi</th>
                                  {showAllColumns && (
                                    <>
                                      <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Kapalı Alan</th>
                                      <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Açık Alan</th>
                                      <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Merdiven Alan</th>
                                      <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Ortak Alan Payı</th>
                                      <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Net Alan</th>
                                      <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Kapalı+Açık Alan</th>
                                      <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Daire Sahibi</th>
                                      <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Brüt Alan</th>
                                      <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Portföy Adı</th>
                                      <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Ekstra Özellik</th>
                                    </>
                                  )}
                                  {!showAllColumns && <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Alan (Net / Brüt)</th>}
                                  {!showAllColumns && <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700 }}>Ekstra Özellik</th>}
                                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700, width: '130px' }}>Fiyat</th>
                                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700, width: '120px' }}>Durum</th>
                                  <th style={{ padding: '0.75rem 0.5rem', fontWeight: 700, textAlign: 'center', width: '80px' }}>Satıldı</th>
                                </tr>
                              </thead>
                              <tbody>
                                {list.map((p, idx) => {
                                  const isExpanded = !!expandedPropRows[p.id];
                                  return (
                                    <React.Fragment key={p.id}>
                                      <tr
                                        style={{
                                          borderBottom: isExpanded ? 'none' : '1px solid var(--glass-border)',
                                          background: idx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)',
                                          transition: 'background 0.2s',
                                          opacity: isSoldTable ? 0.65 : 1
                                        }}
                                      >
                                        {!showAllColumns && (
                                          <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                                            <button
                                              type="button"
                                              onClick={() => setExpandedPropRows({
                                                ...expandedPropRows,
                                                [p.id]: !isExpanded
                                              })}
                                              style={{
                                                background: 'none',
                                                border: 'none',
                                                color: 'var(--color-primary)',
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                padding: '0.2rem',
                                                transition: 'transform 0.2s'
                                              }}
                                            >
                                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                            </button>
                                          </td>
                                        )}
                                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{p.parsel}</td>
                                        <td style={{ padding: '0.75rem 0.5rem', fontWeight: 600 }}>{p.bag_bol_no}</td>
                                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{p.kat || '-'}</td>
                                        {showAllColumns && <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{p.kull_amaci || '-'}</td>}
                                        <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>{p.room_count}</td>
                                        {showAllColumns && (
                                          <>
                                            <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{p.kapali_alan ? `${p.kapali_alan} m²` : '-'}</td>
                                            <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{p.acik_alan ? `${p.acik_alan} m²` : '-'}</td>
                                            <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{p.merdiven_alan ? `${p.merdiven_alan} m²` : '-'}</td>
                                            <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{p.ortak_alan ? `${p.ortak_alan} m²` : '-'}</td>
                                            <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{p.net_alan ? `${p.net_alan} m²` : '-'}</td>
                                            <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{p.kapali_acik_alan ? `${p.kapali_acik_alan} m²` : '-'}</td>
                                            <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-primary)', fontWeight: 500 }}>{p.daire_sahibi || '-'}</td>
                                            <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{p.brut_alan ? `${p.brut_alan} m²` : '-'}</td>
                                            <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{p.portfoy_adi || '-'}</td>
                                            <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>{p.extra_ozellik || '-'}</td>
                                          </>
                                        )}
                                        {!showAllColumns && (
                                          <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>
                                            {p.net_alan ? `${p.net_alan}m²` : '-'} / {p.brut_alan ? `${p.brut_alan}m²` : '-'}
                                          </td>
                                        )}
                                        {!showAllColumns && (
                                          <td style={{ padding: '0.75rem 0.5rem', color: 'var(--color-primary)', fontSize: '0.75rem', fontWeight: 600 }}>
                                            {p.extra_ozellik || '-'}
                                          </td>
                                        )}
                                        <td style={{ padding: '0.5rem 0.5rem' }}>
                                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                            <input
                                              key={p.id + '-' + p.price}
                                              type="text"
                                              defaultValue={formatNumberWithDots(p.price)}
                                              onChange={(e) => {
                                                e.target.value = formatNumberWithDots(e.target.value);
                                              }}
                                              onBlur={async (e) => {
                                                const newVal = Number(e.target.value.replace(/\D/g, '')) || 0;
                                                if (newVal !== p.price) {
                                                  await handleInlinePropertyUpdate(p, 'price', newVal);
                                                }
                                              }}
                                              onKeyDown={async (e) => {
                                                if (e.key === 'Enter') {
                                                  const input = e.target as HTMLInputElement;
                                                  const newVal = Number(input.value.replace(/\D/g, '')) || 0;
                                                  if (newVal !== p.price) {
                                                    await handleInlinePropertyUpdate(p, 'price', newVal);
                                                    input.blur();
                                                  }
                                                }
                                              }}
                                              className="form-control"
                                              style={{ padding: '0.25rem 0.5rem', height: '28px', fontSize: '0.85rem', width: '100px' }}
                                            />
                                          </div>
                                        </td>
                                        <td style={{ padding: '0.5rem 0.5rem' }}>
                                          <input
                                            type="text"
                                            defaultValue={p.portfoy_kimde || ''}
                                            placeholder="Açık/Kapalı/NOVA"
                                            onBlur={async (e) => {
                                              const newVal = e.target.value.trim();
                                              if (newVal !== (p.portfoy_kimde || '')) {
                                                await handleInlinePropertyUpdate(p, 'portfoy_kimde', newVal);
                                              }
                                            }}
                                            onKeyDown={async (e) => {
                                              if (e.key === 'Enter') {
                                                const input = e.target as HTMLInputElement;
                                                const newVal = input.value.trim();
                                                if (newVal !== (p.portfoy_kimde || '')) {
                                                  await handleInlinePropertyUpdate(p, 'portfoy_kimde', newVal);
                                                  input.blur();
                                                }
                                              }
                                            }}
                                            className="form-control"
                                            style={{
                                              padding: '0.25rem 0.5rem',
                                              height: '28px',
                                              fontSize: '0.85rem',
                                              width: '100px',
                                              color: String(p.portfoy_kimde).toLowerCase() === 'kapalı' ? 'var(--color-danger)' : 
                                                     String(p.portfoy_kimde).toLowerCase() === 'nova' ? 'var(--color-warning)' : 'var(--color-success)'
                                            }}
                                          />
                                        </td>
                                        <td style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>
                                          <input
                                            type="checkbox"
                                            checked={!!p.is_sold}
                                            onChange={async (e) => {
                                              await handleInlinePropertyUpdate(p, 'is_sold', e.target.checked);
                                            }}
                                            style={{
                                              width: '18px',
                                              height: '18px',
                                              cursor: 'pointer',
                                              accentColor: 'var(--color-primary)'
                                            }}
                                          />
                                        </td>
                                      </tr>
                                      {isExpanded && !showAllColumns && (
                                        <tr style={{ background: 'rgba(255, 255, 255, 0.015)' }}>
                                          <td colSpan={10} style={{ padding: '1.25rem', borderBottom: '1px solid var(--glass-border)' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', color: 'var(--text-secondary)' }}>
                                              <div><span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Kullanım Amacı:</span> {p.kull_amaci || '-'}</div>
                                              <div><span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Kapalı Alan:</span> {p.kapali_alan ? `${p.kapali_alan} m²` : '-'}</div>
                                              <div><span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Açık Alan:</span> {p.acik_alan ? `${p.acik_alan} m²` : '-'}</div>
                                              <div><span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Merdiven Alanı:</span> {p.merdiven_alan ? `${p.merdiven_alan} m²` : '-'}</div>
                                              <div><span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Ortak Alan Payı:</span> {p.ortak_alan ? `${p.ortak_alan} m²` : '-'}</div>
                                              <div><span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Net Alan:</span> {p.net_alan ? `${p.net_alan} m²` : '-'}</div>
                                              <div><span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Kapalı+Açık Alan:</span> {p.kapali_acik_alan ? `${p.kapali_acik_alan} m²` : '-'}</div>
                                              <div><span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Daire Sahibi:</span> {p.daire_sahibi || '-'}</div>
                                              <div><span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>Portföy Adı:</span> {p.portfoy_adi || '-'}</div>
                                            </div>
                                          </td>
                                        </tr>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        );
                      };

                      return (
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          {renderTable(filteredActiveProps, false)}
                          
                          {soldProps.length > 0 && (
                            <div style={{ marginTop: '2.5rem', borderTop: '1px dashed var(--glass-border)', paddingTop: '1.5rem' }}>
                              <h3 style={{ 
                                fontSize: '1.15rem', 
                                fontWeight: 800, 
                                marginBottom: '1.25rem', 
                                color: 'var(--text-muted)', 
                                display: 'flex', 
                                alignItems: 'center', 
                                gap: '0.4rem' 
                              }}>
                                <CheckCircle2 size={18} style={{ color: 'var(--text-muted)' }} />
                                Satılan Daireler ({filteredSoldProps.length})
                              </h3>
                              {renderTable(filteredSoldProps, true)}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Sub-tab 3: Müşteri Veritabanı */}
              {matchmakerSubTab === 'database' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                  
                  {/* Search Bar */}
                  <div style={{ display: 'flex', gap: '0.5rem', maxWidth: '400px', position: 'relative' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Müşteri adı, telefon veya konum ara..."
                      value={leadDbSearchQuery}
                      onChange={(e) => setLeadDbSearchQuery(e.target.value)}
                      style={{ paddingLeft: '2.5rem' }}
                    />
                    <Search size={16} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-secondary)' }} />
                  </div>

                  {/* Müşteri Database Tablosu */}
                  <div className="glass-panel animate-fade-in" style={{ overflowX: 'auto', padding: '1rem' }}>
                    {(() => {
                      const processedDbLeads = getProcessedDbLeads();

                      if (processedDbLeads.length === 0) {
                        return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Müşteri bulunamadı.</div>;
                      }

                      return (
                        <div style={{ overflowX: 'auto' }}>
                          <table className="crm-table" style={{ width: '100%', minWidth: '1700px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--glass-border)' }}>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '160px', position: 'relative', cursor: 'pointer', userSelect: 'none' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'db-name' ? null : 'db-name')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Müşteri Adı Soyadı</span>
                                    <Filter size={12} style={{ color: dbFilters['name'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: dbFilters['name'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('db', 'name', 'Müşteri Adı Soyadı', leads, l => l.name)}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '140px', position: 'relative', cursor: 'pointer', userSelect: 'none' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'db-phone' ? null : 'db-phone')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Cep Telefonu</span>
                                    <Filter size={12} style={{ color: dbFilters['phone'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: dbFilters['phone'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('db', 'phone', 'Cep Telefonu', leads, l => l.phone)}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '120px', position: 'relative', cursor: 'pointer', userSelect: 'none' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'db-current_location' ? null : 'db-current_location')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Oturduğu Yer</span>
                                    <Filter size={12} style={{ color: dbFilters['current_location'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: dbFilters['current_location'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('db', 'current_location', 'Oturduğu Yer', leads, l => l.current_location || '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '120px', position: 'relative', cursor: 'pointer', userSelect: 'none' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'db-created_at' ? null : 'db-created_at')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Database Eklenme Tr.</span>
                                    <Filter size={12} style={{ color: dbFilters['created_at'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: dbFilters['created_at'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('db', 'created_at', 'Eklenme Tarihi', leads, l => l.created_at ? new Date(l.created_at).toLocaleDateString('tr-TR') : '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '110px', position: 'relative', cursor: 'pointer', userSelect: 'none' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'db-warmth' ? null : 'db-warmth')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Sıcaklık</span>
                                    <Filter size={12} style={{ color: dbFilters['warmth'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: dbFilters['warmth'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('db', 'warmth', 'Sıcaklık', leads, l => l.warmth === 'hot' ? '🔥 Hot' : (l.warmth === 'warm' ? '⚡ Warm' : '❄️ Cold'))}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '110px', position: 'relative', cursor: 'pointer', userSelect: 'none' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'db-source' ? null : 'db-source')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Kanal</span>
                                    <Filter size={12} style={{ color: dbFilters['source'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: dbFilters['source'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('db', 'source', 'Kanal', leads, l => l.source || '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '110px', position: 'relative', cursor: 'pointer', userSelect: 'none' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'db-room_count' ? null : 'db-room_count')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Talep Oda Tipi</span>
                                    <Filter size={12} style={{ color: dbFilters['room_count'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: dbFilters['room_count'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('db', 'room_count', 'Oda Talebi', leads, l => l.room_count || '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '120px', position: 'relative', cursor: 'pointer', userSelect: 'none' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'db-lead_status' ? null : 'db-lead_status')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Mevcut Durum</span>
                                    <Filter size={12} style={{ color: dbFilters['lead_status'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: dbFilters['lead_status'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('db', 'lead_status', 'Mevcut Durum', leads, l => l.lead_status || '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '150px', position: 'relative', cursor: 'pointer', userSelect: 'none' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'db-customer_question' ? null : 'db-customer_question')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Müşteri Sorusu</span>
                                    <Filter size={12} style={{ color: dbFilters['customer_question'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: dbFilters['customer_question'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('db', 'customer_question', 'Müşteri Sorusu', leads, l => l.customer_question || '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '220px', position: 'relative', cursor: 'pointer', userSelect: 'none' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'db-notes' ? null : 'db-notes')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Son Not</span>
                                    <Filter size={12} style={{ color: dbFilters['notes'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: dbFilters['notes'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('db', 'notes', 'Son Not', leads, l => l.notes || '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '130px', position: 'relative', cursor: 'pointer', userSelect: 'none' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'db-budget' ? null : 'db-budget')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Bütçe</span>
                                    <Filter size={12} style={{ color: dbFilters['budget'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: dbFilters['budget'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('db', 'budget', 'Bütçe', leads, l => l.budget ? formatNumberWithDots(l.budget) : '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '120px', position: 'relative', cursor: 'pointer', userSelect: 'none' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'db-updated_at' ? null : 'db-updated_at')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Son Güncelleme Tr.</span>
                                    <Filter size={12} style={{ color: dbFilters['updated_at'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: dbFilters['updated_at'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('db', 'updated_at', 'Son Güncelleme', leads, l => l.last_update_info && l.updated_at ? new Date(l.updated_at).toLocaleDateString('tr-TR') : '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', position: 'relative', cursor: 'pointer', userSelect: 'none' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'db-last_update_info' ? null : 'db-last_update_info')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Güncelleme Bilgisi</span>
                                    <Filter size={12} style={{ color: dbFilters['last_update_info'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: dbFilters['last_update_info'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('db', 'last_update_info', 'Güncelleme Detayı', leads, l => l.last_update_info || '-')}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {processedDbLeads.map((lead) => (
                                <tr key={lead.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <input
                                      type="text"
                                      defaultValue={lead.name}
                                      onFocus={(e) => {
                                        e.target.style.borderColor = 'var(--glass-border)';
                                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                      }}
                                      onBlur={async (e) => {
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.backgroundColor = 'transparent';
                                        const val = e.target.value.trim();
                                        if (val && val !== lead.name) {
                                          await handleInlineLeadUpdate(lead, 'name', val);
                                        }
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        transition: 'border-color 0.15s, background-color 0.15s',
                                        fontWeight: 600
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <input
                                      type="text"
                                      defaultValue={lead.phone}
                                      onFocus={(e) => {
                                        e.target.style.borderColor = 'var(--glass-border)';
                                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                      }}
                                      onBlur={async (e) => {
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.backgroundColor = 'transparent';
                                        const val = e.target.value.trim();
                                        if (val && val !== lead.phone) {
                                          await handleInlineLeadUpdate(lead, 'phone', val);
                                        }
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        transition: 'border-color 0.15s, background-color 0.15s'
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <input
                                      type="text"
                                      defaultValue={lead.current_location || ''}
                                      placeholder="-"
                                      onFocus={(e) => {
                                        e.target.style.borderColor = 'var(--glass-border)';
                                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                      }}
                                      onBlur={async (e) => {
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.backgroundColor = 'transparent';
                                        const val = e.target.value.trim();
                                        if (val !== (lead.current_location || '')) {
                                          await handleInlineLeadUpdate(lead, 'current_location', val);
                                        }
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        transition: 'border-color 0.15s, background-color 0.15s'
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>
                                    {lead.created_at ? new Date(lead.created_at).toLocaleDateString('tr-TR') : '-'}
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <select
                                      value={lead.warmth}
                                      onChange={async (e) => {
                                        await handleInlineLeadUpdate(lead, 'warmth', e.target.value);
                                      }}
                                      style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid var(--glass-border)',
                                        color: lead.warmth === 'hot' ? 'var(--color-primary)' : lead.warmth === 'warm' ? 'var(--color-warning)' : '#94a3b8',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none'
                                      }}
                                    >
                                      <option value="hot">🔥 Hot</option>
                                      <option value="warm">⚡ Warm</option>
                                      <option value="cold">❄️ Cold</option>
                                    </select>
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <select
                                      value={lead.source}
                                      onChange={async (e) => {
                                        await handleInlineLeadUpdate(lead, 'source', e.target.value);
                                      }}
                                      style={{
                                        background: 'rgba(255,255,255,0.03)',
                                        border: '1px solid var(--glass-border)',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none'
                                      }}
                                    >
                                      <option value="Instagram">Instagram</option>
                                      <option value="WhatsApp">WhatsApp</option>
                                      <option value="Sahibinden">Sahibinden</option>
                                      <option value="Referans">Referans</option>
                                      <option value="Telefon">Telefon</option>
                                      <option value="Diğer">Diğer</option>
                                    </select>
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <input
                                      type="text"
                                      defaultValue={lead.room_count || ''}
                                      placeholder="-"
                                      onFocus={(e) => {
                                        e.target.style.borderColor = 'var(--glass-border)';
                                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                      }}
                                      onBlur={async (e) => {
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.backgroundColor = 'transparent';
                                        const val = e.target.value.trim();
                                        if (val !== (lead.room_count || '')) {
                                          await handleInlineLeadUpdate(lead, 'room_count', val);
                                        }
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        transition: 'border-color 0.15s, background-color 0.15s'
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <input
                                      type="text"
                                      defaultValue={lead.lead_status || ''}
                                      placeholder="-"
                                      onFocus={(e) => {
                                        e.target.style.borderColor = 'var(--glass-border)';
                                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                      }}
                                      onBlur={async (e) => {
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.backgroundColor = 'transparent';
                                        const val = e.target.value.trim();
                                        if (val !== (lead.lead_status || '')) {
                                          await handleInlineLeadUpdate(lead, 'lead_status', val);
                                        }
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        transition: 'border-color 0.15s, background-color 0.15s'
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <input
                                      type="text"
                                      defaultValue={lead.customer_question || ''}
                                      placeholder="-"
                                      onFocus={(e) => {
                                        e.target.style.borderColor = 'var(--glass-border)';
                                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                      }}
                                      onBlur={async (e) => {
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.backgroundColor = 'transparent';
                                        const val = e.target.value.trim();
                                        if (val !== (lead.customer_question || '')) {
                                          await handleInlineLeadUpdate(lead, 'customer_question', val);
                                        }
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        transition: 'border-color 0.15s, background-color 0.15s'
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <input
                                      type="text"
                                      defaultValue={lead.notes || ''}
                                      placeholder="-"
                                      onFocus={(e) => {
                                        e.target.style.borderColor = 'var(--glass-border)';
                                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                      }}
                                      onBlur={async (e) => {
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.backgroundColor = 'transparent';
                                        const val = e.target.value.trim();
                                        if (val !== (lead.notes || '')) {
                                          await handleInlineLeadUpdate(lead, 'notes', val);
                                        }
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        transition: 'border-color 0.15s, background-color 0.15s'
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <input
                                      type="text"
                                      defaultValue={formatNumberWithDots(lead.budget)}
                                      onChange={(e) => {
                                        e.target.value = formatNumberWithDots(e.target.value);
                                      }}
                                      onFocus={(e) => {
                                        e.target.style.borderColor = 'var(--glass-border)';
                                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                      }}
                                      onBlur={async (e) => {
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.backgroundColor = 'transparent';
                                        const val = Number(e.target.value.replace(/\D/g, '')) || 0;
                                        if (val !== lead.budget) {
                                          await handleInlineLeadUpdate(lead, 'budget', val);
                                        }
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        transition: 'border-color 0.15s, background-color 0.15s',
                                        fontWeight: 600
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>
                                    {lead.last_update_info && lead.updated_at ? new Date(lead.updated_at).toLocaleDateString('tr-TR') : '-'}
                                  </td>
                                  <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>
                                    {lead.last_update_info || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB CONTENT: GENERAL REPORTS & ANALYTICS */}
          {activeTab === 'reports-general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%' }}>
              
              {/* Date Filters Header */}
              <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#fff', margin: 0 }}>Genel Analiz Raporları</h2>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    CRM veritabanındaki müşteri dağılımları ve kazanım analizleri
                  </p>
                </div>
                
                {/* Date Filter Buttons */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  {[
                    { id: 'all', label: 'Tüm Zamanlar' },
                    { id: 'today', label: 'Bugün' },
                    { id: 'yesterday', label: 'Dün' },
                    { id: 'this-week', label: 'Bu Hafta' },
                    { id: 'this-month', label: 'Bu Ay' },
                    { id: 'custom', label: 'Tarih Aralığı' }
                  ].map(btn => (
                    <button
                      key={btn.id}
                      onClick={() => setReportDateFilter(btn.id)}
                      className="glow-btn"
                      style={{
                        padding: '0.4rem 0.85rem',
                        fontSize: '0.85rem',
                        background: reportDateFilter === btn.id ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid var(--glass-border)',
                        boxShadow: reportDateFilter === btn.id ? 'var(--shadow-glow)' : 'none',
                        color: reportDateFilter === btn.id ? '#fff' : 'var(--text-secondary)'
                      }}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Date Inputs (Conditional) */}
              {reportDateFilter === 'custom' && (
                <div className="glass-panel animate-fade-in" style={{ padding: '1.25rem', display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ margin: 0, flex: '1', minWidth: '180px' }}>
                    <label style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Başlangıç Tarihi</label>
                    <input
                      type="date"
                      className="form-control"
                      value={reportStartDate}
                      onChange={(e) => setReportStartDate(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0, flex: '1', minWidth: '180px' }}>
                    <label style={{ fontSize: '0.75rem', marginBottom: '0.25rem' }}>Bitiş Tarihi</label>
                    <input
                      type="date"
                      className="form-control"
                      value={reportEndDate}
                      onChange={(e) => setReportEndDate(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Charts Grid */}
              {(() => {
                const reportFilteredLeads = getProcessedReportLeads();
                
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
                      {renderDistributionCard('Müşteri Sıcaklık Dağılımı', 'warmth', reportFilteredLeads)}
                      {renderDistributionCard('Edinme Kanalları Dağılımı', 'source', reportFilteredLeads)}
                      {renderDistributionCard('Oda Sayısı Talebi', 'room_count', reportFilteredLeads)}
                      {renderDistributionCard('Şehir/Ülke Dağılımı', 'current_location', reportFilteredLeads)}
                      {renderDistributionCard('Müşteri Talepleri / Soruları', 'customer_question', reportFilteredLeads)}
                    </div>

                    {/* Table Section */}
                    <div className="glass-panel animate-fade-in" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, margin: 0, color: 'var(--color-primary)' }}>Rapor Filtreli Müşteri Listesi</h3>
                        <button
                          onClick={handleExportToExcel}
                          className="glow-btn"
                          style={{
                            background: 'var(--success-gradient)',
                            padding: '0.45rem 1rem',
                            fontSize: '0.85rem',
                            borderRadius: '8px',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem'
                          }}
                        >
                          <Download size={16} /> Excel'e Aktar
                        </button>
                      </div>
                      <div style={{ overflowX: 'auto' }}>
                        {reportFilteredLeads.length === 0 ? (
                          <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>Bu kriterlerde müşteri kaydı bulunamadı.</div>
                        ) : (
                          <table className="crm-table" style={{ width: '100%', minWidth: '1700px', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                              <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--glass-border)' }}>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '160px', position: 'relative', cursor: 'pointer', userSelect: 'none', zIndex: openPopoverId === 'report-name' ? 1000 : 'auto' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'report-name' ? null : 'report-name')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Müşteri Adı Soyadı</span>
                                    <Filter size={12} style={{ color: reportFilters['name'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: reportFilters['name'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('report', 'name', 'Müşteri Adı Soyadı', reportLeads || leads, l => l.name)}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '140px', position: 'relative', cursor: 'pointer', userSelect: 'none', zIndex: openPopoverId === 'report-phone' ? 1000 : 'auto' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'report-phone' ? null : 'report-phone')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Cep Telefonu</span>
                                    <Filter size={12} style={{ color: reportFilters['phone'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: reportFilters['phone'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('report', 'phone', 'Cep Telefonu', reportLeads || leads, l => l.phone)}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '120px', position: 'relative', cursor: 'pointer', userSelect: 'none', zIndex: openPopoverId === 'report-current_location' ? 1000 : 'auto' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'report-current_location' ? null : 'report-current_location')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Oturduğu Yer</span>
                                    <Filter size={12} style={{ color: reportFilters['current_location'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: reportFilters['current_location'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('report', 'current_location', 'Oturduğu Yer', reportLeads || leads, l => l.current_location || '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '120px', position: 'relative', cursor: 'pointer', userSelect: 'none', zIndex: openPopoverId === 'report-created_at' ? 1000 : 'auto' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'report-created_at' ? null : 'report-created_at')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Database Eklenme Tr.</span>
                                    <Filter size={12} style={{ color: reportFilters['created_at'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: reportFilters['created_at'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('report', 'created_at', 'Eklenme Tarihi', reportLeads || leads, l => l.created_at ? new Date(l.created_at).toLocaleDateString('tr-TR') : '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '110px', position: 'relative', cursor: 'pointer', userSelect: 'none', zIndex: openPopoverId === 'report-warmth' ? 1000 : 'auto' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'report-warmth' ? null : 'report-warmth')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Sıcaklık</span>
                                    <Filter size={12} style={{ color: reportFilters['warmth'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: reportFilters['warmth'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('report', 'warmth', 'Sıcaklık', reportLeads || leads, l => l.warmth === 'hot' ? '🔥 Hot' : (l.warmth === 'warm' ? '⚡ Warm' : '❄️ Cold'))}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '120px', position: 'relative', cursor: 'pointer', userSelect: 'none', zIndex: openPopoverId === 'report-source' ? 1000 : 'auto' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'report-source' ? null : 'report-source')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Kanal</span>
                                    <Filter size={12} style={{ color: reportFilters['source'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: reportFilters['source'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('report', 'source', 'Kanal', reportLeads || leads, l => l.source || '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '110px', position: 'relative', cursor: 'pointer', userSelect: 'none', zIndex: openPopoverId === 'report-room_count' ? 1000 : 'auto' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'report-room_count' ? null : 'report-room_count')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Oda Talebi</span>
                                    <Filter size={12} style={{ color: reportFilters['room_count'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: reportFilters['room_count'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('report', 'room_count', 'Oda Talebi', reportLeads || leads, l => l.room_count || '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '130px', position: 'relative', cursor: 'pointer', userSelect: 'none', zIndex: openPopoverId === 'report-lead_status' ? 1000 : 'auto' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'report-lead_status' ? null : 'report-lead_status')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Mevcut Durum</span>
                                    <Filter size={12} style={{ color: reportFilters['lead_status'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: reportFilters['lead_status'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('report', 'lead_status', 'Mevcut Durum', reportLeads || leads, l => l.lead_status || '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '150px', position: 'relative', cursor: 'pointer', userSelect: 'none', zIndex: openPopoverId === 'report-customer_question' ? 1000 : 'auto' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'report-customer_question' ? null : 'report-customer_question')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Müşteri Sorusu</span>
                                    <Filter size={12} style={{ color: reportFilters['customer_question'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: reportFilters['customer_question'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('report', 'customer_question', 'Müşteri Sorusu', reportLeads || leads, l => l.customer_question || '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '180px', position: 'relative', cursor: 'pointer', userSelect: 'none', zIndex: openPopoverId === 'report-notes' ? 1000 : 'auto' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'report-notes' ? null : 'report-notes')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Son Not</span>
                                    <Filter size={12} style={{ color: reportFilters['notes'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: reportFilters['notes'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('report', 'notes', 'Son Not', reportLeads || leads, l => l.notes || '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '140px', position: 'relative', cursor: 'pointer', userSelect: 'none', zIndex: openPopoverId === 'report-budget' ? 1000 : 'auto' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'report-budget' ? null : 'report-budget')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Bütçe</span>
                                    <Filter size={12} style={{ color: reportFilters['budget'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: reportFilters['budget'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('report', 'budget', 'Bütçe', reportLeads || leads, l => l.budget ? formatNumberWithDots(l.budget) : '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '140px', position: 'relative', cursor: 'pointer', userSelect: 'none', zIndex: openPopoverId === 'report-updated_at' ? 1000 : 'auto' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'report-updated_at' ? null : 'report-updated_at')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Son Güncelleme</span>
                                    <Filter size={12} style={{ color: reportFilters['updated_at'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: reportFilters['updated_at'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('report', 'updated_at', 'Son Güncelleme', reportLeads || leads, l => l.last_update_info && l.updated_at ? new Date(l.updated_at).toLocaleDateString('tr-TR') : '-')}
                                </th>
                                <th 
                                  style={{ padding: '0.75rem 0.5rem', textAlign: 'left', width: '180px', position: 'relative', cursor: 'pointer', userSelect: 'none', zIndex: openPopoverId === 'report-last_update_info' ? 1000 : 'auto' }}
                                  onClick={() => setOpenPopoverId(openPopoverId === 'report-last_update_info' ? null : 'report-last_update_info')}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                    <span>Güncelleme Detayı</span>
                                    <Filter size={12} style={{ color: reportFilters['last_update_info'] ? 'var(--color-primary)' : 'var(--text-secondary)', opacity: reportFilters['last_update_info'] ? 1 : 0.5 }} />
                                  </div>
                                  {renderFilterPopover('report', 'last_update_info', 'Güncelleme Detayı', reportLeads || leads, l => l.last_update_info || '-')}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {reportFilteredLeads.map((lead, idx) => (
                                <tr key={lead.id} style={{ 
                                  borderBottom: '1px solid var(--glass-border)',
                                  background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent',
                                  transition: 'background-color 0.15s'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent'; }}
                                >
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <input
                                      type="text"
                                      defaultValue={lead.name}
                                      onFocus={(e) => {
                                        e.target.style.borderColor = 'var(--glass-border)';
                                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                      }}
                                      onBlur={async (e) => {
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.backgroundColor = 'transparent';
                                        const val = e.target.value.trim();
                                        if (val && val !== lead.name) {
                                          await handleInlineLeadUpdate(lead, 'name', val);
                                        }
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        transition: 'border-color 0.15s, background-color 0.15s',
                                        fontWeight: 600
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <input
                                      type="text"
                                      defaultValue={lead.phone}
                                      onFocus={(e) => {
                                        e.target.style.borderColor = 'var(--glass-border)';
                                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                      }}
                                      onBlur={async (e) => {
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.backgroundColor = 'transparent';
                                        const val = e.target.value.trim();
                                        if (val && val !== lead.phone) {
                                          await handleInlineLeadUpdate(lead, 'phone', val);
                                        }
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        transition: 'border-color 0.15s, background-color 0.15s'
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <input
                                      type="text"
                                      defaultValue={lead.current_location || ''}
                                      placeholder="-"
                                      onFocus={(e) => {
                                        e.target.style.borderColor = 'var(--glass-border)';
                                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                      }}
                                      onBlur={async (e) => {
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.backgroundColor = 'transparent';
                                        const val = e.target.value.trim();
                                        if (val !== (lead.current_location || '')) {
                                          await handleInlineLeadUpdate(lead, 'current_location', val);
                                        }
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        transition: 'border-color 0.15s, background-color 0.15s'
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>
                                    {lead.created_at ? new Date(lead.created_at).toLocaleDateString('tr-TR') : '-'}
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <select
                                      defaultValue={lead.warmth}
                                      onChange={async (e) => {
                                        const val = e.target.value;
                                        await handleInlineLeadUpdate(lead, 'warmth', val);
                                      }}
                                      style={{
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid var(--glass-border)',
                                        color: '#fff',
                                        borderRadius: '4px',
                                        padding: '0.25rem 0.4rem',
                                        outline: 'none',
                                        cursor: 'pointer',
                                        width: '100%'
                                      }}
                                    >
                                      <option value="hot" style={{ background: '#120f24', color: 'var(--color-danger)' }}>🔥 Hot</option>
                                      <option value="warm" style={{ background: '#120f24', color: 'var(--color-warning)' }}>⚡ Warm</option>
                                      <option value="cold" style={{ background: '#120f24', color: '#60a5fa' }}>❄️ Cold</option>
                                    </select>
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <select
                                      defaultValue={lead.source || ''}
                                      onChange={async (e) => {
                                        const val = e.target.value;
                                        await handleInlineLeadUpdate(lead, 'source', val);
                                      }}
                                      style={{
                                        background: 'rgba(255,255,255,0.04)',
                                        border: '1px solid var(--glass-border)',
                                        color: '#fff',
                                        borderRadius: '4px',
                                        padding: '0.25rem 0.4rem',
                                        outline: 'none',
                                        cursor: 'pointer',
                                        width: '100%'
                                      }}
                                    >
                                      <option value="" style={{ background: '#120f24' }}>- Seçin -</option>
                                      <option value="Instagram" style={{ background: '#120f24' }}>Instagram</option>
                                      <option value="WhatsApp" style={{ background: '#120f24' }}>WhatsApp</option>
                                      <option value="Sahibinden" style={{ background: '#120f24' }}>Sahibinden</option>
                                      <option value="Referans" style={{ background: '#120f24' }}>Referans</option>
                                      <option value="Telefon" style={{ background: '#120f24' }}>Telefon</option>
                                      <option value="Diğer" style={{ background: '#120f24' }}>Diğer</option>
                                    </select>
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <input
                                      type="text"
                                      defaultValue={lead.room_count || ''}
                                      placeholder="-"
                                      onFocus={(e) => {
                                        e.target.style.borderColor = 'var(--glass-border)';
                                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                      }}
                                      onBlur={async (e) => {
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.backgroundColor = 'transparent';
                                        const val = e.target.value.trim();
                                        if (val !== (lead.room_count || '')) {
                                          await handleInlineLeadUpdate(lead, 'room_count', val);
                                        }
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        transition: 'border-color 0.15s, background-color 0.15s'
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <input
                                      type="text"
                                      defaultValue={lead.lead_status || ''}
                                      placeholder="-"
                                      onFocus={(e) => {
                                        e.target.style.borderColor = 'var(--glass-border)';
                                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                      }}
                                      onBlur={async (e) => {
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.backgroundColor = 'transparent';
                                        const val = e.target.value.trim();
                                        if (val !== (lead.lead_status || '')) {
                                          await handleInlineLeadUpdate(lead, 'lead_status', val);
                                        }
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        transition: 'border-color 0.15s, background-color 0.15s'
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <input
                                      type="text"
                                      defaultValue={lead.customer_question || ''}
                                      placeholder="-"
                                      onFocus={(e) => {
                                        e.target.style.borderColor = 'var(--glass-border)';
                                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                      }}
                                      onBlur={async (e) => {
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.backgroundColor = 'transparent';
                                        const val = e.target.value.trim();
                                        if (val !== (lead.customer_question || '')) {
                                          await handleInlineLeadUpdate(lead, 'customer_question', val);
                                        }
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        transition: 'border-color 0.15s, background-color 0.15s'
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <input
                                      type="text"
                                      defaultValue={lead.notes || ''}
                                      placeholder="-"
                                      onFocus={(e) => {
                                        e.target.style.borderColor = 'var(--glass-border)';
                                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                      }}
                                      onBlur={async (e) => {
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.backgroundColor = 'transparent';
                                        const val = e.target.value.trim();
                                        if (val !== (lead.notes || '')) {
                                          await handleInlineLeadUpdate(lead, 'notes', val);
                                        }
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        transition: 'border-color 0.15s, background-color 0.15s'
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.35rem 0.5rem' }}>
                                    <input
                                      type="text"
                                      defaultValue={formatNumberWithDots(lead.budget)}
                                      onChange={(e) => {
                                        e.target.value = formatNumberWithDots(e.target.value);
                                      }}
                                      onFocus={(e) => {
                                        e.target.style.borderColor = 'var(--glass-border)';
                                        e.target.style.backgroundColor = 'rgba(255,255,255,0.03)';
                                      }}
                                      onBlur={async (e) => {
                                        e.target.style.borderColor = 'transparent';
                                        e.target.style.backgroundColor = 'transparent';
                                        const val = Number(e.target.value.replace(/\D/g, '')) || 0;
                                        if (val !== lead.budget) {
                                          await handleInlineLeadUpdate(lead, 'budget', val);
                                        }
                                      }}
                                      style={{
                                        background: 'transparent',
                                        border: '1px solid transparent',
                                        color: '#fff',
                                        width: '100%',
                                        padding: '0.25rem 0.4rem',
                                        borderRadius: '4px',
                                        outline: 'none',
                                        transition: 'border-color 0.15s, background-color 0.15s',
                                        fontWeight: 600
                                      }}
                                    />
                                  </td>
                                  <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>
                                    {lead.last_update_info && lead.updated_at ? new Date(lead.updated_at).toLocaleDateString('tr-TR') : '-'}
                                  </td>
                                  <td style={{ padding: '0.75rem 0.5rem', color: 'var(--text-secondary)' }}>
                                    {lead.last_update_info || '-'}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

            </div>
          )}

          {/* TAB CONTENT: DAILY REPORTS (INFO) */}
          {activeTab === 'reports-info' && (
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
                Verilerinizi sisteme toplu olarak aktarın. Kolonları eşleştirerek veya otomatik şablonlarla Excel dosyanızın biçimini bozmadan doğrudan yükleme yapabilirsiniz.
              </p>

              {/* Seeding Section */}
              <div style={{
                background: 'rgba(255, 106, 0, 0.05)',
                border: '1px solid rgba(255, 106, 0, 0.15)',
                borderRadius: '12px',
                padding: '1.25rem',
                marginBottom: '1.5rem',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '1rem'
              }}>
                <div style={{ flex: '1', minWidth: '280px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <RefreshCw size={16} /> Sistemi Demo Verileriyle Sıfırla (Müşteri & Randevu)
                  </h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.25rem 0 0 0' }}>
                    <strong>Dikkat:</strong> Bu işlem sistemdeki tüm müşteri ve randevu kayıtlarını kalıcı olarak siler ve sunucudaki varsayılan <code>NarlıVadiEvleri_Lead Dashboard.xlsx</code> dosyasındaki demo müşteri verilerini yükler. Kendi dosyanızı yüklemek istiyorsanız lütfen aşağıdaki alanı kullanın.
                  </p>
                </div>
                <button
                  onClick={async () => {
                    if (confirm('Sistemdeki tüm mevcut müşteri ve randevu verileri KALICI OLARAK SİLİNECEK ve demo verileri yüklenecektir. Emin misiniz?')) {
                      if (confirm('Lütfen bu işlemin geri alınamayacağını unutmayın. Devam etmek istiyor musunuz?')) {
                        try {
                          setImporting(true);
                          const res = await seedLeadsFromExcel();
                          if (res.success) {
                            alert(res.message);
                            await loadAllData(); // Reload UI state
                          } else {
                            alert('Hata: ' + res.message);
                          }
                        } catch (err: any) {
                          alert('Hata oluştu: ' + err.message);
                        } finally {
                          setImporting(false);
                        }
                      }
                    }
                  }}
                  disabled={importing}
                  className="glow-btn"
                  style={{
                    background: 'var(--primary-gradient)',
                    padding: '0.6rem 1.25rem',
                    borderRadius: '8px',
                    fontWeight: 700
                  }}
                >
                  {importing ? 'Aktarılıyor...' : 'Demo Müşteri Verilerini Yükle'}
                </button>
              </div>

              {/* Import Type Toggle */}
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '1rem' }}>
                <button
                  onClick={() => { setImportType('leads'); setExcelHeaders([]); setExcelRows([]); setImportSuccess(false); setImportFormatError(false); }}
                  className="glow-btn animate-fade-in"
                  style={{
                    background: importType === 'leads' ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--glass-border)',
                    boxShadow: importType === 'leads' ? 'var(--shadow-glow)' : 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '8px',
                    fontWeight: 600,
                    color: importType === 'leads' ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Müşteri Listesi Yükle (Leads)
                </button>
                <button
                  onClick={() => { setImportType('properties'); setExcelHeaders([]); setExcelRows([]); setImportSuccess(false); setImportFormatError(false); }}
                  className="glow-btn animate-fade-in"
                  style={{
                    background: importType === 'properties' ? 'var(--primary-gradient)' : 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--glass-border)',
                    boxShadow: importType === 'properties' ? 'var(--shadow-glow)' : 'none',
                    padding: '0.5rem 1.25rem',
                    borderRadius: '8px',
                    fontWeight: 600,
                    color: importType === 'properties' ? '#fff' : 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  Daire Portföyü Yükle (Properties)
                </button>
              </div>

              {/* Format Error Warning Box */}
              {importFormatError && excelHeaders.length === 0 && !importSuccess && (
                <div style={{
                  background: 'rgba(239, 68, 68, 0.05)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--color-danger)' }}>
                    <AlertCircle size={20} />
                    <h4 style={{ fontWeight: 700, margin: 0 }}>Format Hatası! Yükleme Başarısız Oldu.</h4>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: 0 }}>
                    Yüklediğiniz Excel dosyasının kolon formatı sistem tarafından tanınamadı. Lütfen dosyanızda aşağıdaki zorunlu kolonların yer aldığından emin olun veya örnek şablonu indirin:
                  </p>
                  <ul style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 0 1.25rem', padding: 0 }}>
                    {importType === 'leads' ? (
                      <>
                        <li><strong>İsim / Ad Soyadı / Adı Soyadı:</strong> Müşteri adını içeren sütun</li>
                        <li><strong>Tel / Telefon / GSM / TelNo:</strong> Müşteri telefon numarasını içeren sütun</li>
                      </>
                    ) : (
                      <>
                        <li><strong>Parsel:</strong> Daire parsel numarasını içeren sütun</li>
                        <li><strong>BağBöl / Bagbol / Blok:</strong> Bağımsız bölüm / blok numarasını içeren sütun</li>
                      </>
                    )}
                  </ul>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                    <button
                      onClick={() => handleDownloadSampleTemplate(importType)}
                      className="glow-btn"
                      style={{
                        background: 'var(--primary-gradient)',
                        padding: '0.45rem 1rem',
                        fontSize: '0.8rem',
                        borderRadius: '6px',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem'
                      }}
                    >
                      <Download size={14} /> Hazır Örnek Şablonu İndir
                    </button>
                    <button
                      onClick={() => setImportFormatError(false)}
                      className="glow-btn"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        padding: '0.45rem 1rem',
                        borderRadius: '6px',
                        fontWeight: 600
                      }}
                    >
                      Yeniden Dene
                    </button>
                  </div>
                </div>
              )}

              {/* Leads Overwrite / Append Selector Box */}
              {importType === 'leads' && excelHeaders.length === 0 && !importSuccess && (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: '12px',
                  padding: '1.25rem',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>
                    Müşteri Yükleme Yöntemi Seçin:
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                      <input
                        type="radio"
                        name="leadsImportMode"
                        checked={leadsImportMode === 'append'}
                        onChange={() => setLeadsImportMode('append')}
                        style={{ accentColor: 'var(--color-primary)', width: '16px', height: '16px' }}
                      />
                      <span><strong>Mevcut Verilerin Üzerine Ekle (Önerilen):</strong> İçerideki müşteri datası silinmez, yeni yüklenenler ek olarak eklenir.</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontSize: '0.85rem' }}>
                      <input
                        type="radio"
                        name="leadsImportMode"
                        checked={leadsImportMode === 'overwrite'}
                        onChange={() => setLeadsImportMode('overwrite')}
                        style={{ accentColor: 'var(--color-primary)', width: '16px', height: '16px' }}
                      />
                      <span><strong>Sistemdekileri Sil ve Sıfırdan Yükle:</strong> Mevcut tüm müşteri ve randevular silinerek sıfırdan yükleme yapılır.</span>
                    </label>
                  </div>
                </div>
              )}

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
                      cursor: 'pointer',
                      zIndex: 10
                    }}
                  />
                  <QrCode size={48} style={{ color: 'var(--color-primary)', marginBottom: '1rem', opacity: 0.7 }} />
                  <h4 style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.75rem' }}>{importType === 'leads' ? 'Müşteri Excel Dosyasını Seçin' : 'Daire/Portföy Excel Dosyasını Seçin'}</h4>
                  
                  {/* Görsel Yükleme Butonu */}
                  <div 
                    className="glow-btn"
                    style={{ 
                      display: 'inline-flex', 
                      alignItems: 'center', 
                      gap: '0.5rem', 
                      background: 'var(--primary-gradient)', 
                      padding: '0.6rem 1.5rem', 
                      borderRadius: '8px', 
                      fontWeight: 700, 
                      fontSize: '0.9rem', 
                      color: '#fff', 
                      marginBottom: '0.5rem',
                      pointerEvents: 'none' // Click passes through to the underlying file input
                    }}
                  >
                    <Plus size={16} /> Excel Dosyası Seç & Yükle
                  </div>

                  {/* Örnek Şablon İndirme Butonu */}
                  <div style={{ marginTop: '0.25rem', marginBottom: '1.25rem', position: 'relative', zIndex: 20 }}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownloadSampleTemplate(importType);
                      }}
                      className="glow-btn"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--text-secondary)',
                        fontSize: '0.8rem',
                        padding: '0.35rem 0.75rem',
                        borderRadius: '6px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.3rem'
                      }}
                    >
                      <Download size={14} /> Örnek Şablonu İndir (.xlsx)
                    </button>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Sürükleyip bırakabilir veya tıklayarak dosya seçebilirsiniz.
                  </p>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                    Desteklenen formatlar: <strong>.xlsx, .xls, .csv</strong>
                  </p>

                  {/* Dinamik Politika Bilgilendirme Badge */}
                  <div style={{
                    marginTop: '1.5rem',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.5rem 1rem',
                    borderRadius: '20px',
                    fontSize: '0.8rem',
                    background: importType === 'properties' || (importType === 'leads' && leadsImportMode === 'overwrite')
                      ? 'rgba(239, 68, 68, 0.1)'
                      : 'rgba(52, 211, 153, 0.1)',
                    color: importType === 'properties' || (importType === 'leads' && leadsImportMode === 'overwrite')
                      ? 'var(--color-danger)'
                      : 'var(--color-success)',
                    border: importType === 'properties' || (importType === 'leads' && leadsImportMode === 'overwrite')
                      ? '1px solid rgba(239, 68, 68, 0.2)'
                      : '1px solid rgba(52, 211, 153, 0.2)'
                  }}>
                    <span>
                      Politika: <strong>
                        {importType === 'properties'
                          ? 'İçerideki tüm daire verileri silinir ve yeni yüklediğiniz dosyadaki veriler eklenir.'
                          : leadsImportMode === 'overwrite'
                            ? 'Mevcut tüm müşteri ve randevular silinerek sıfırdan yükleme yapılacaktır.'
                            : 'İçerideki müşteri datası silinmez, üzerine eklenir.'
                        }
                      </strong>
                    </span>
                  </div>
                </div>
              )}

              {/* Step 2: Column Mapping / Preview */}
              {excelHeaders.length > 0 && (
                <div>
                  <div style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1rem', borderRadius: '8px', marginBottom: '1.5rem', border: '1px solid var(--glass-border)' }}>
                    <p style={{ fontSize: '0.9rem', fontWeight: 600 }}>
                      ✓ **{excelRows.length} adet veri satırı algılandı.** {importType === 'leads' ? 'Lütfen aşağıdaki CRM alanlarının Excel tablonuzda hangi kolona denk geldiğini eşleştirin.' : 'Daire portföyü için kolon eşleştirme otomatik yapılacaktır.'}
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

                  {importType === 'properties' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
                      {/* Column 1: Required Fields */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>Zorunlu Alanlar</h4>
                        
                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontWeight: 'bold' }}>Parsel Numarası *</label>
                          <select 
                            className="form-control"
                            required
                            value={columnMap.parsel}
                            onChange={(e) => setColumnMap({ ...columnMap, parsel: e.target.value })}
                          >
                            <option value="">-- Kolon Seçin --</option>
                            {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label style={{ fontWeight: 'bold' }}>Bağımsız Bölüm (Daire) No *</label>
                          <select 
                            className="form-control"
                            required
                            value={columnMap.bag_bol_no}
                            onChange={(e) => setColumnMap({ ...columnMap, bag_bol_no: e.target.value })}
                          >
                            <option value="">-- Kolon Seçin --</option>
                            {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>

                        <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem', marginTop: '1rem' }}>Daire Özellikleri</h4>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Kat</label>
                          <select 
                            className="form-control"
                            value={columnMap.kat}
                            onChange={(e) => setColumnMap({ ...columnMap, kat: e.target.value })}
                          >
                            <option value="">-- Eşleştirme Yok (Atla) --</option>
                            {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Kullanım Amacı (Konut/Mesken/Dükkan)</label>
                          <select 
                            className="form-control"
                            value={columnMap.kull_amaci}
                            onChange={(e) => setColumnMap({ ...columnMap, kull_amaci: e.target.value })}
                          >
                            <option value="">-- Eşleştirme Yok (Atla) --</option>
                            {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Column 2: Dimensions & Details */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <h4 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.5rem' }}>Alan & Fiyat Bilgileri</h4>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Daire Tipi (3+1, 2+1 vb.)</label>
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
                          <label>Fiyat (Fiyat/Bedel Kolonu)</label>
                          <select 
                            className="form-control"
                            value={columnMap.price}
                            onChange={(e) => setColumnMap({ ...columnMap, price: e.target.value })}
                          >
                            <option value="">-- Eşleştirme Yok (Atla) --</option>
                            {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Kapalı Alan (m²)</label>
                          <select 
                            className="form-control"
                            value={columnMap.kapali_alan}
                            onChange={(e) => setColumnMap({ ...columnMap, kapali_alan: e.target.value })}
                          >
                            <option value="">-- Eşleştirme Yok (Atla) --</option>
                            {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Açık Alan (m²)</label>
                          <select 
                            className="form-control"
                            value={columnMap.acik_alan}
                            onChange={(e) => setColumnMap({ ...columnMap, acik_alan: e.target.value })}
                          >
                            <option value="">-- Eşleştirme Yok (Atla) --</option>
                            {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>

                        <div className="form-group" style={{ marginBottom: 0 }}>
                          <label>Daire Sahibi / Malik</label>
                          <select 
                            className="form-control"
                            value={columnMap.daire_sahibi}
                            onChange={(e) => setColumnMap({ ...columnMap, daire_sahibi: e.target.value })}
                          >
                            <option value="">-- Eşleştirme Yok (Atla) --</option>
                            {excelHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {importType === 'leads' && (
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
                  )}

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
                          <Check size={18} /> {excelRows.length} {importType === 'leads' ? 'Müşteriyi CRM\'e Aktar' : 'Daireyi Portföye Aktar'}
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
                    {importType === 'leads' 
                      ? `**${importCount} adet müşteri kaydı** Excel'den başarıyla CRM veritabanınıza yüklenmiştir. Randevu tarihleri bulunan müşteriler için otomatik olarak randevular planlanmıştır.`
                      : `**${importCount} adet daire portföy kaydı** Excel'den başarıyla envanter veritabanınıza yüklenmiştir.`
                    }
                  </p>
                  <button
                    onClick={() => {
                      setImportSuccess(false);
                      setActiveTab(importType === 'leads' ? 'dashboard' : 'matchmaker');
                    }}
                    className="glow-btn"
                  >
                    {importType === 'leads' ? 'Müşteri Listesine (CRM) Dön' : 'Portföy & Eşleştiriciye Git'}
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      )}
        {/* ADD APPOINTMENT MODAL */}
        {showAddAppModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 2000,
            padding: '1rem'
          }} onClick={() => setShowAddAppModal(false)}>
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--glass-border)',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              position: 'relative'
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Yeni Randevu Planla</h3>
                <button 
                  type="button"
                  onClick={() => setShowAddAppModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveAppModalSubmit}>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label>Müşteri Seçin *</label>
                  <input 
                    type="text" 
                    required
                    className="form-control"
                    placeholder="Müşteri İsim veya Telefon Ara..."
                    value={appSearchQuery}
                    onChange={(e) => {
                      setAppSearchQuery(e.target.value);
                      setShowSearchDropdown(true);
                      setSelectedLeadForApp(null);
                    }}
                    onFocus={() => setShowSearchDropdown(true)}
                  />
                  {showSearchDropdown && appSearchQuery.trim() !== '' && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      boxShadow: 'var(--shadow-card)',
                      zIndex: 2100,
                      maxHeight: '200px',
                      overflowY: 'auto'
                    }}>
                      {leads
                        .filter(l => 
                          l.name.toLowerCase().includes(appSearchQuery.toLowerCase()) || 
                          l.phone.includes(appSearchQuery)
                        )
                        .slice(0, 10)
                        .map(l => (
                          <div 
                            key={l.id}
                            onClick={() => {
                              setSelectedLeadForApp(l);
                              setAppSearchQuery(`${l.name} (${l.phone})`);
                              setShowSearchDropdown(false);
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            style={{
                              padding: '0.6rem 0.85rem',
                              cursor: 'pointer',
                              borderBottom: '1px solid var(--glass-border)',
                              fontSize: '0.85rem',
                              transition: 'background 0.2s'
                            }}
                          >
                            <strong>{l.name}</strong> - <span>{l.phone}</span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                  {selectedLeadForApp && (() => {
                    const matchedProp = getMatchedPropertyForLead(selectedLeadForApp);
                    return (
                      <div style={{
                        marginTop: '0.75rem',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--glass-border)',
                        padding: '1rem',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.3rem' }}>
                          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Seçilen Müşteri Bilgileri</span>
                          <button 
                            type="button" 
                            onClick={() => {
                              setSelectedLeadForApp(null);
                              setAppSearchQuery('');
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--color-danger)',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}
                          >
                            Temizle
                          </button>
                        </div>
                        <p style={{ margin: '0 0 0.25rem 0' }}>👤 <strong>İsim Soyisim:</strong> <span style={{ color: 'var(--text-primary)' }}>{selectedLeadForApp.name}</span></p>
                        <p style={{ margin: '0 0 0.25rem 0' }}>📞 <strong>Telefon:</strong> <span style={{ color: 'var(--text-primary)' }}>{selectedLeadForApp.phone}</span></p>
                        <p style={{ margin: '0 0 0.5rem 0' }}>🏠 <strong>Talep Ettiği Daire:</strong> <span style={{ color: 'var(--text-primary)' }}>{selectedLeadForApp.room_count || 'Belirtilmedi'} Oda ({selectedLeadForApp.property_type || 'Belirtilmedi'})</span></p>
                        
                        {matchedProp ? (
                          <div style={{
                            padding: '0.5rem',
                            background: 'rgba(16, 185, 129, 0.08)',
                            border: '1px solid rgba(16, 185, 129, 0.15)',
                            borderRadius: '6px',
                            marginTop: '0.5rem'
                          }}>
                            <span style={{ color: 'var(--color-success)', fontWeight: 700, display: 'block', fontSize: '0.75rem', marginBottom: '0.2rem' }}>🎯 Eşleşen Daire:</span>
                            <p style={{ margin: '0 0 0.15rem 0' }}>🏢 <strong>Parsel:</strong> {matchedProp.parsel || '-'} / <strong>Daire No:</strong> {matchedProp.bag_bol_no || '-'}</p>
                            <p style={{ margin: '0', color: 'var(--color-success)', fontWeight: 700, fontSize: '0.85rem' }}>💰 <strong>Daire Fiyatı (DB):</strong> {formatCurrency(matchedProp.price)}</p>
                          </div>
                        ) : (
                          <div style={{
                            padding: '0.5rem',
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.15)',
                            borderRadius: '6px',
                            marginTop: '0.5rem',
                            fontSize: '0.75rem',
                            fontStyle: 'italic',
                            color: 'var(--color-danger)'
                          }}>
                            ⚠️ Bütçeye/Odaya uygun eşleşen daire bulunamadı.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="form-group">
                  <label>Randevu Tarih ve Saati *</label>
                  <input 
                    type="datetime-local" 
                    required
                    className="form-control"
                    value={appDateTime}
                    onChange={(e) => setAppDateTime(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Randevu Tipi *</label>
                  <select 
                    required
                    className="form-control"
                    value={appType}
                    onChange={(e) => setAppType(e.target.value)}
                  >
                    <option value="">-- Randevu Tipi Seçin --</option>
                    <option value="Şantiyede gösterim">Şantiyede gösterim</option>
                    <option value="Ofiste Proje Tanıtım">Ofiste Proje Tanıtım</option>
                    <option value="Sözleşme Randevusu">Sözleşme Randevusu</option>
                    <option value="Rutin/Tekrarlayan Ziyaret">Rutin/Tekrarlayan Ziyaret</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Randevu Yeri / Mülk Adresi</label>
                  <input 
                    type="text" 
                    className="form-control"
                    placeholder="Örn: Altınoluk 3+1 Daire Yerinde Gösterim"
                    value={appLocation}
                    onChange={(e) => setAppLocation(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Açıklama / Özel Notlar</label>
                  <textarea 
                    className="form-control"
                    placeholder="Özel beklentiler..."
                    value={appNotes}
                    onChange={(e) => setAppNotes(e.target.value)}
                  />
                </div>

                <button type="submit" className="glow-btn" style={{ width: '100%', justifyContent: 'center', marginTop: '1.5rem' }}>
                  <Check size={18} /> Randevu Kaydet
                </button>
              </form>
            </div>
          </div>
        )}

        {/* EDIT APPOINTMENT MODAL */}
        {showEditAppModal && selectedAppToEdit && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 2000,
            padding: '1rem'
          }} onClick={() => setShowEditAppModal(false)}>
            <div style={{
              background: 'var(--bg-secondary)',
              border: '1px solid var(--glass-border)',
              borderRadius: '12px',
              padding: '2rem',
              maxWidth: '500px',
              width: '100%',
              maxHeight: '90vh',
              overflowY: 'auto',
              position: 'relative'
            }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>Randevu Düzenle</h3>
                <button 
                  type="button"
                  onClick={() => setShowEditAppModal(false)}
                  style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSaveAppModalSubmit}>
                <div className="form-group" style={{ position: 'relative' }}>
                  <label>Müşteri Seçin *</label>
                  <input 
                    type="text" 
                    required
                    className="form-control"
                    placeholder="Müşteri İsim veya Telefon Ara..."
                    value={appSearchQuery}
                    onChange={(e) => {
                      setAppSearchQuery(e.target.value);
                      setShowSearchDropdown(true);
                      setSelectedLeadForApp(null);
                    }}
                    onFocus={() => setShowSearchDropdown(true)}
                  />
                  {showSearchDropdown && appSearchQuery.trim() !== '' && (
                    <div style={{
                      position: 'absolute',
                      top: '100%',
                      left: 0,
                      right: 0,
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--glass-border)',
                      borderRadius: '8px',
                      boxShadow: 'var(--shadow-card)',
                      zIndex: 2100,
                      maxHeight: '200px',
                      overflowY: 'auto'
                    }}>
                      {leads
                        .filter(l => 
                          l.name.toLowerCase().includes(appSearchQuery.toLowerCase()) || 
                          l.phone.includes(appSearchQuery)
                        )
                        .slice(0, 10)
                        .map(l => (
                          <div 
                            key={l.id}
                            onClick={() => {
                              setSelectedLeadForApp(l);
                              setAppSearchQuery(`${l.name} (${l.phone})`);
                              setShowSearchDropdown(false);
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            style={{
                              padding: '0.6rem 0.85rem',
                              cursor: 'pointer',
                              borderBottom: '1px solid var(--glass-border)',
                              fontSize: '0.85rem',
                              transition: 'background 0.2s'
                            }}
                          >
                            <strong>{l.name}</strong> - <span>{l.phone}</span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                  {selectedLeadForApp && (() => {
                    const matchedProp = getMatchedPropertyForLead(selectedLeadForApp);
                    return (
                      <div style={{
                        marginTop: '0.75rem',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--glass-border)',
                        padding: '1rem',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)'
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem', borderBottom: '1px solid var(--glass-border)', paddingBottom: '0.3rem' }}>
                          <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>Seçilen Müşteri Bilgileri</span>
                          <button 
                            type="button" 
                            onClick={() => {
                              setSelectedLeadForApp(null);
                              setAppSearchQuery('');
                            }}
                            style={{
                              background: 'none',
                              border: 'none',
                              color: 'var(--color-danger)',
                              cursor: 'pointer',
                              fontSize: '0.75rem',
                              fontWeight: 600
                            }}
                          >
                            Temizle
                          </button>
                        </div>
                        <p style={{ margin: '0 0 0.25rem 0' }}>👤 <strong>İsim Soyisim:</strong> <span style={{ color: 'var(--text-primary)' }}>{selectedLeadForApp.name}</span></p>
                        <p style={{ margin: '0 0 0.25rem 0' }}>📞 <strong>Telefon:</strong> <span style={{ color: 'var(--text-primary)' }}>{selectedLeadForApp.phone}</span></p>
                        <p style={{ margin: '0 0 0.5rem 0' }}>🏠 <strong>Talep Ettiği Daire:</strong> <span style={{ color: 'var(--text-primary)' }}>{selectedLeadForApp.room_count || 'Belirtilmedi'} Oda ({selectedLeadForApp.property_type || 'Belirtilmedi'})</span></p>
                        
                        {matchedProp ? (
                          <div style={{
                            padding: '0.5rem',
                            background: 'rgba(16, 185, 129, 0.08)',
                            border: '1px solid rgba(16, 185, 129, 0.15)',
                            borderRadius: '6px',
                            marginTop: '0.5rem'
                          }}>
                            <span style={{ color: 'var(--color-success)', fontWeight: 700, display: 'block', fontSize: '0.75rem', marginBottom: '0.2rem' }}>🎯 Eşleşen Daire:</span>
                            <p style={{ margin: '0 0 0.15rem 0' }}>🏢 <strong>Parsel:</strong> {matchedProp.parsel || '-'} / <strong>Daire No:</strong> {matchedProp.bag_bol_no || '-'}</p>
                            <p style={{ margin: '0', color: 'var(--color-success)', fontWeight: 700, fontSize: '0.85rem' }}>💰 <strong>Daire Fiyatı (DB):</strong> {formatCurrency(matchedProp.price)}</p>
                          </div>
                        ) : (
                          <div style={{
                            padding: '0.5rem',
                            background: 'rgba(239, 68, 68, 0.08)',
                            border: '1px solid rgba(239, 68, 68, 0.15)',
                            borderRadius: '6px',
                            marginTop: '0.5rem',
                            fontSize: '0.75rem',
                            fontStyle: 'italic',
                            color: 'var(--color-danger)'
                          }}>
                            ⚠️ Bütçeye/Odaya uygun eşleşen daire bulunamadı.
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                <div className="form-group">
                  <label>Randevu Tarih ve Saati *</label>
                  <input 
                    type="datetime-local" 
                    required
                    className="form-control"
                    value={appDateTime}
                    onChange={(e) => setAppDateTime(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Randevu Durumu *</label>
                  <select 
                    className="form-control"
                    value={appStatus}
                    onChange={(e) => setAppStatusState(e.target.value as any)}
                  >
                    <option value="pending">Bekliyor</option>
                    <option value="completed">Tamamlandı</option>
                    <option value="cancelled">İptal Edildi</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Randevu Tipi *</label>
                  <select 
                    required
                    className="form-control"
                    value={appType}
                    onChange={(e) => setAppType(e.target.value)}
                  >
                    <option value="">-- Randevu Tipi Seçin --</option>
                    <option value="Şantiyede gösterim">Şantiyede gösterim</option>
                    <option value="Ofiste Proje Tanıtım">Ofiste Proje Tanıtım</option>
                    <option value="Sözleşme Randevusu">Sözleşme Randevusu</option>
                    <option value="Rutin/Tekrarlayan Ziyaret">Rutin/Tekrarlayan Ziyaret</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Randevu Yeri / Mülk Adresi</label>
                  <input 
                    type="text" 
                    className="form-control"
                    value={appLocation}
                    onChange={(e) => setAppLocation(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Açıklama / Özel Notlar</label>
                  <textarea 
                    className="form-control"
                    value={appNotes}
                    onChange={(e) => setAppNotes(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginTop: '2rem' }}>
                  <button 
                    type="button" 
                    onClick={() => handleDeleteApp(selectedAppToEdit.id)}
                    style={{
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      color: 'var(--color-danger)',
                      padding: '0.5rem 1rem',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      fontSize: '0.85rem'
                    }}
                  >
                    Randevuyu Sil
                  </button>
                  <button type="submit" className="glow-btn" style={{ flexGrow: 1, justifyContent: 'center' }}>
                    <Check size={18} /> Güncelle
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // Render Lead Card Helper
  function renderLeadCard(lead: Lead) {
    return (
      <div 
        key={lead.id} 
        className="glass-panel" 
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
          <p style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <Calendar size={12} style={{ color: 'var(--color-primary)' }} /> 
            <span>Geliş Tarihi: </span>
            <strong style={{ color: 'var(--text-primary)' }}>{formatDateToShow(lead.created_at)}</strong>
          </p>
          {lead.lead_status && (
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--color-primary)' }}></span>
              <span>Durum: </span>
              <strong style={{ color: 'var(--text-primary)' }}>{lead.lead_status}</strong>
            </p>
          )}
          {lead.customer_question && (
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span>❓ Soru: </span>
              <span style={{ color: 'var(--text-primary)' }}>{lead.customer_question}</span>
            </p>
          )}
          {lead.rejection_reason && (
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ color: 'var(--color-danger)' }}>🚫 Red Nedeni: </span>
              <span style={{ color: 'var(--text-primary)' }}>{lead.rejection_reason}</span>
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
              href={`https://api.whatsapp.com/send?phone=${(lead.phone || '').replace(/\D/g, '')}`}
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
