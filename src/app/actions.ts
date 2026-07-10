'use server';

// Alias STORAGE_ environment variables to POSTGRES_ if custom prefix was used in Vercel
if (process.env.STORAGE_URL && !process.env.POSTGRES_URL) {
  process.env.POSTGRES_URL = process.env.STORAGE_URL;
  process.env.POSTGRES_URL_NON_POOLING = process.env.STORAGE_URL_NON_POOLING;
  process.env.POSTGRES_USER = process.env.STORAGE_USER;
  process.env.POSTGRES_HOST = process.env.STORAGE_HOST;
  process.env.POSTGRES_PASSWORD = process.env.STORAGE_PASSWORD;
  process.env.POSTGRES_DATABASE = process.env.STORAGE_DATABASE;
}

import { sql } from '@vercel/postgres';
import { Lead, Appointment, Property } from '@/lib/types';
import { formatPhone } from '@/lib/utils';

// Helper to check if DB is configured
const isDbConfigured = () => {
  return !!process.env.POSTGRES_URL;
};

export async function checkDatabaseConnection() {
  if (!isDbConfigured()) {
    return { configured: false, message: 'POSTGRES_URL is not defined in environment variables.' };
  }
  try {
    // Simple test query
    await sql`SELECT 1`;
    return { configured: true, message: 'Database connected successfully.' };
  } catch (error: any) {
    console.error('Database connection test failed:', error);
    return { configured: false, message: error.message || 'Database connection error.' };
  }
}

export async function initDatabase() {
  if (!isDbConfigured()) {
    return { success: false, message: 'Database not configured. Falling back to LocalStorage.' };
  }

  try {
    // Enable uuid-ossp if not enabled
    await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;

    // Create Leads Table
    await sql`
      CREATE TABLE IF NOT EXISTS leads (
        id UUID PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        email VARCHAR(255),
        source VARCHAR(100),
        property_type VARCHAR(100),
        room_count VARCHAR(255),
        purpose VARCHAR(100),
        customer_question VARCHAR(255),
        lead_status VARCHAR(100),
        target_region VARCHAR(100),
        current_location VARCHAR(100),
        marital_status VARCHAR(100),
        occupation VARCHAR(100),
        rejection_reason VARCHAR(255),
        budget DECIMAL(15, 2) NOT NULL,
        warmth VARCHAR(20) NOT NULL,
        is_alert_active BOOLEAN DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Create Appointments Table
    await sql`
      CREATE TABLE IF NOT EXISTS appointments (
        id UUID PRIMARY KEY,
        lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
        date_time VARCHAR(100) NOT NULL,
        location VARCHAR(255),
        status VARCHAR(20) NOT NULL,
        notes TEXT
      );
    `;

    // Create Properties Table
    await sql`
      CREATE TABLE IF NOT EXISTS properties (
        id UUID PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        price DECIMAL(15, 2) NOT NULL,
        region VARCHAR(100),
        type VARCHAR(100),
        room_count VARCHAR(50),
        parsel VARCHAR(50),
        bag_bol_no VARCHAR(50),
        kat VARCHAR(100),
        kull_amaci VARCHAR(100),
        kapali_alan DECIMAL(10, 2),
        acik_alan DECIMAL(10, 2),
        net_alan DECIMAL(10, 2),
        brut_alan DECIMAL(10, 2),
        portfoy_adi VARCHAR(100),
        extra_ozellik VARCHAR(255),
        portfoy_kimde VARCHAR(100),
        merdiven_alan DECIMAL(10, 2),
        ortak_alan DECIMAL(10, 2),
        kapali_acik_alan DECIMAL(10, 2),
        daire_sahibi VARCHAR(255),
        is_sold BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

    // Database migration: Add columns to existing properties table if they do not exist
    try {
      await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS is_sold BOOLEAN DEFAULT FALSE;`;
      await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS parsel VARCHAR(50);`;
      await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS bag_bol_no VARCHAR(50);`;
      await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS kat VARCHAR(100);`;
      await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS kull_amaci VARCHAR(100);`;
      await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS kapali_alan DECIMAL(10, 2);`;
      await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS acik_alan DECIMAL(10, 2);`;
      await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS net_alan DECIMAL(10, 2);`;
      await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS brut_alan DECIMAL(10, 2);`;
      await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS portfoy_adi VARCHAR(100);`;
      await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS extra_ozellik VARCHAR(255);`;
      await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS portfoy_kimde VARCHAR(100);`;
      await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS merdiven_alan DECIMAL(10, 2);`;
      await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS ortak_alan DECIMAL(10, 2);`;
      await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS kapali_acik_alan DECIMAL(10, 2);`;
      await sql`ALTER TABLE properties ADD COLUMN IF NOT EXISTS daire_sahibi VARCHAR(255);`;
      await sql`ALTER TABLE leads ALTER COLUMN room_count TYPE VARCHAR(255);`;
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS customer_question VARCHAR(255);`;
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_status VARCHAR(100);`;
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(255);`;
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;`;
      try {
        await sql`UPDATE leads SET updated_at = created_at WHERE updated_at IS NULL;`;
      } catch (updErr) {
        console.warn('Failed to backfill updated_at:', updErr);
      }
      // Format phone numbers starting with 05 to +905
      try {
        await sql`UPDATE leads SET phone = '+90' || SUBSTRING(phone FROM 2) WHERE phone LIKE '05%';`;
        await sql`UPDATE leads SET phone = '+90' || SUBSTRING(phone FROM 2) WHERE phone LIKE '0 5%';`;
        await sql`UPDATE leads SET phone = '+90' || SUBSTRING(phone FROM 2) WHERE phone LIKE '0(5%';`;
        await sql`UPDATE leads SET phone = '+90' || SUBSTRING(phone FROM 2) WHERE phone LIKE '0 (5%';`;
      } catch (phoneErr) {
        console.warn('Failed to format phone numbers:', phoneErr);
      }
      await sql`ALTER TABLE appointments ADD COLUMN IF NOT EXISTS appointment_type VARCHAR(100);`;
      await sql`ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_update_info VARCHAR(255);`;
    } catch (migErr) {
      console.warn('Migration warnings (non-fatal):', migErr);
    }

    return { success: true, message: 'Tables initialized successfully.' };
  } catch (error: any) {
    console.error('Failed to initialize database tables:', error);
    return { success: false, message: error.message || 'Database initialization failed.' };
  }
}

/* LEADS SERVER ACTIONS */

export async function getLeads(): Promise<{ success: boolean; data: Lead[]; message?: string }> {
  if (!isDbConfigured()) return { success: false, data: [] };
  try {
    const { rows } = await sql`SELECT * FROM leads ORDER BY COALESCE(updated_at, created_at) DESC, created_at DESC`;
    // Map database fields to standard types if needed
    const leads: Lead[] = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      email: r.email || '',
      source: r.source || '',
      property_type: r.property_type || '',
      room_count: r.room_count || '',
      purpose: r.purpose || '',
      customer_question: r.customer_question || '',
      lead_status: r.lead_status || '',
      target_region: r.target_region || '',
      current_location: r.current_location || '',
      marital_status: r.marital_status || '',
      occupation: r.occupation || '',
      rejection_reason: r.rejection_reason || '',
      budget: Number(r.budget),
      warmth: r.warmth,
      is_alert_active: r.is_alert_active,
      notes: r.notes || '',
      created_at: r.created_at,
      updated_at: r.updated_at || r.created_at,
      last_update_info: r.last_update_info || '',
    }));
    return { success: true, data: leads };
  } catch (error: any) {
    console.error('Failed to fetch leads:', error);
    return { success: false, data: [], message: error.message };
  }
}

export async function saveLead(lead: Lead) {
  if (!isDbConfigured()) return { success: false, message: 'Database not configured.' };
  try {
    const finalWarmth = lead.lead_status === 'Beklemede' ? 'hot' : lead.warmth;
    const updatedAt = lead.updated_at || new Date().toISOString();
    const formattedPhone = formatPhone(lead.phone);
    
    // Fetch old lead if exists to calculate change description
    let lastUpdateInfo = lead.last_update_info || '';
    const oldRes = await sql`SELECT * FROM leads WHERE id = ${lead.id}`;
    if (oldRes.rows.length > 0) {
      const old = oldRes.rows[0];
      const changes: string[] = [];
      if (old.name !== lead.name) changes.push('İsim güncellendi');
      if (old.phone !== formattedPhone) changes.push('Telefon güncellendi');
      if (old.email !== lead.email) changes.push('E-posta güncellendi');
      if (old.source !== lead.source) changes.push('Kaynak güncellendi');
      if (old.property_type !== lead.property_type) changes.push('Emlak tipi güncellendi');
      if (old.room_count !== lead.room_count) changes.push('Oda ihtiyacı güncellendi');
      if (old.purpose !== lead.purpose) changes.push('Alım amacı güncellendi');
      if (old.customer_question !== lead.customer_question) changes.push('Soru güncellendi');
      if (old.lead_status !== lead.lead_status) {
        changes.push(`Durum güncellendi (${old.lead_status || 'Boş'} -> ${lead.lead_status || 'Boş'})`);
      }
      if (old.rejection_reason !== lead.rejection_reason) changes.push('Red nedeni güncellendi');
      if (Number(old.budget) !== Number(lead.budget)) changes.push('Bütçe güncellendi');
      if (old.warmth !== finalWarmth) {
        changes.push(`Sıcaklık güncellendi (${old.warmth} -> ${finalWarmth})`);
      }
      if (old.notes !== lead.notes) changes.push('Notlar güncellendi');
      
      if (changes.length > 0) {
        lastUpdateInfo = changes.join(', ');
      } else {
        lastUpdateInfo = old.last_update_info || '';
      }
    }

    await sql`
      INSERT INTO leads (
        id, name, phone, email, source, property_type, room_count, purpose, customer_question, lead_status,
        target_region, current_location, marital_status, occupation, rejection_reason, budget, 
        warmth, is_alert_active, notes, created_at, updated_at, last_update_info
      ) VALUES (
        ${lead.id}, ${lead.name}, ${formattedPhone}, ${lead.email}, ${lead.source}, ${lead.property_type}, ${lead.room_count}, ${lead.purpose}, ${lead.customer_question || ''}, ${lead.lead_status || ''},
        ${lead.target_region}, ${lead.current_location}, ${lead.marital_status || ''}, ${lead.occupation || ''}, ${lead.rejection_reason || ''}, ${lead.budget},
        ${finalWarmth}, ${lead.is_alert_active}, ${lead.notes}, ${lead.created_at}, ${updatedAt}, ${lastUpdateInfo}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        source = EXCLUDED.source,
        property_type = EXCLUDED.property_type,
        room_count = EXCLUDED.room_count,
        purpose = EXCLUDED.purpose,
        customer_question = EXCLUDED.customer_question,
        lead_status = EXCLUDED.lead_status,
        target_region = EXCLUDED.target_region,
        current_location = EXCLUDED.current_location,
        marital_status = EXCLUDED.marital_status,
        occupation = EXCLUDED.occupation,
        rejection_reason = EXCLUDED.rejection_reason,
        budget = EXCLUDED.budget,
        warmth = EXCLUDED.warmth,
        is_alert_active = EXCLUDED.is_alert_active,
        notes = EXCLUDED.notes,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at,
        last_update_info = EXCLUDED.last_update_info;
    `;
    return { success: true };
  } catch (error: any) {
    console.error('Failed to save lead:', error);
    return { success: false, message: error.message };
  }
}

export async function deleteLead(id: string) {
  if (!isDbConfigured()) return { success: false, message: 'Database not configured.' };
  try {
    await sql`DELETE FROM leads WHERE id = ${id}`;
    return { success: true };
  } catch (error: any) {
    console.error('Failed to delete lead:', error);
    return { success: false, message: error.message };
  }
}

/* APPOINTMENTS SERVER ACTIONS */

export async function getAppointments(): Promise<{ success: boolean; data: Appointment[]; message?: string }> {
  if (!isDbConfigured()) return { success: false, data: [] };
  try {
    // Perform a join to fetch the lead's name for display convenience
    const { rows } = await sql`
      SELECT a.*, l.name as lead_name 
      FROM appointments a 
      LEFT JOIN leads l ON a.lead_id = l.id
      ORDER BY a.date_time ASC
    `;
    const appointments: Appointment[] = rows.map((r: any) => ({
      id: r.id,
      lead_id: r.lead_id,
      lead_name: r.lead_name || 'Bilinmeyen Müşteri',
      date_time: r.date_time,
      location: r.location || '',
      status: r.status,
      notes: r.notes || '',
      appointment_type: r.appointment_type || '',
    }));
    return { success: true, data: appointments };
  } catch (error: any) {
    console.error('Failed to fetch appointments:', error);
    return { success: false, data: [], message: error.message };
  }
}

export async function saveAppointment(app: Appointment) {
  if (!isDbConfigured()) return { success: false, message: 'Database not configured.' };
  try {
    await sql`
      INSERT INTO appointments (id, lead_id, date_time, location, status, notes, appointment_type)
      VALUES (${app.id}, ${app.lead_id}, ${app.date_time}, ${app.location}, ${app.status}, ${app.notes}, ${app.appointment_type || ''})
      ON CONFLICT (id) DO UPDATE SET
        lead_id = EXCLUDED.lead_id,
        date_time = EXCLUDED.date_time,
        location = EXCLUDED.location,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes,
        appointment_type = EXCLUDED.appointment_type;
    `;
    return { success: true };
  } catch (error: any) {
    console.error('Failed to save appointment:', error);
    return { success: false, message: error.message };
  }
}

export async function deleteAppointment(id: string) {
  if (!isDbConfigured()) return { success: false, message: 'Database not configured.' };
  try {
    await sql`DELETE FROM appointments WHERE id = ${id}`;
    return { success: true };
  } catch (error: any) {
    console.error('Failed to delete appointment:', error);
    return { success: false, message: error.message };
  }
}

/* PROPERTIES SERVER ACTIONS */

export async function getProperties(): Promise<{ success: boolean; data: Property[]; message?: string }> {
  if (!isDbConfigured()) return { success: false, data: [] };
  try {
    const { rows } = await sql`SELECT * FROM properties ORDER BY created_at DESC`;
    const properties: Property[] = rows.map((r: any) => ({
      id: r.id,
      title: r.title,
      price: Number(r.price),
      region: r.region || '',
      type: r.type || '',
      room_count: r.room_count || '',
      parsel: r.parsel || '',
      bag_bol_no: r.bag_bol_no || '',
      kat: r.kat || '',
      kull_amaci: r.kull_amaci || '',
      kapali_alan: r.kapali_alan ? Number(r.kapali_alan) : undefined,
      acik_alan: r.acik_alan ? Number(r.acik_alan) : undefined,
      net_alan: r.net_alan ? Number(r.net_alan) : undefined,
      brut_alan: r.brut_alan ? Number(r.brut_alan) : undefined,
      portfoy_adi: r.portfoy_adi || '',
      extra_ozellik: r.extra_ozellik || '',
      portfoy_kimde: r.portfoy_kimde || '',
      merdiven_alan: r.merdiven_alan ? Number(r.merdiven_alan) : undefined,
      ortak_alan: r.ortak_alan ? Number(r.ortak_alan) : undefined,
      kapali_acik_alan: r.kapali_acik_alan ? Number(r.kapali_acik_alan) : undefined,
      daire_sahibi: r.daire_sahibi || '',
      created_at: r.created_at,
      is_sold: !!r.is_sold,
    }));
    return { success: true, data: properties };
  } catch (error: any) {
    console.error('Failed to fetch properties:', error);
    return { success: false, data: [], message: error.message };
  }
}

export async function saveProperty(prop: Property) {
  if (!isDbConfigured()) return { success: false, message: 'Database not configured.' };
  try {
    await sql`
      INSERT INTO properties (
        id, title, price, region, type, room_count,
        parsel, bag_bol_no, kat, kull_amaci,
        kapali_alan, acik_alan, net_alan, brut_alan,
        portfoy_adi, extra_ozellik, portfoy_kimde,
        merdiven_alan, ortak_alan, kapali_acik_alan, daire_sahibi, is_sold
      )
      VALUES (
        ${prop.id}, ${prop.title}, ${prop.price}, ${prop.region}, ${prop.type}, ${prop.room_count},
        ${prop.parsel || null}, ${prop.bag_bol_no || null}, ${prop.kat || null}, ${prop.kull_amaci || null},
        ${prop.kapali_alan || null}, ${prop.acik_alan || null}, ${prop.net_alan || null}, ${prop.brut_alan || null},
        ${prop.portfoy_adi || null}, ${prop.extra_ozellik || null}, ${prop.portfoy_kimde || null},
        ${prop.merdiven_alan || null}, ${prop.ortak_alan || null}, ${prop.kapali_acik_alan || null}, ${prop.daire_sahibi || null},
        ${prop.is_sold || false}
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        price = EXCLUDED.price,
        region = EXCLUDED.region,
        type = EXCLUDED.type,
        room_count = EXCLUDED.room_count,
        parsel = EXCLUDED.parsel,
        bag_bol_no = EXCLUDED.bag_bol_no,
        kat = EXCLUDED.kat,
        kull_amaci = EXCLUDED.kull_amaci,
        kapali_alan = EXCLUDED.kapali_alan,
        acik_alan = EXCLUDED.acik_alan,
        net_alan = EXCLUDED.net_alan,
        brut_alan = EXCLUDED.brut_alan,
        portfoy_adi = EXCLUDED.portfoy_adi,
        extra_ozellik = EXCLUDED.extra_ozellik,
        portfoy_kimde = EXCLUDED.portfoy_kimde,
        merdiven_alan = EXCLUDED.merdiven_alan,
        ortak_alan = EXCLUDED.ortak_alan,
        kapali_acik_alan = EXCLUDED.kapali_acik_alan,
        daire_sahibi = EXCLUDED.daire_sahibi,
        is_sold = EXCLUDED.is_sold;
    `;
    return { success: true };
  } catch (error: any) {
    console.error('Failed to save property:', error);
    return { success: false, message: error.message };
  }
}

export async function deleteProperty(id: string) {
  if (!isDbConfigured()) return { success: false, message: 'Database not configured.' };
  try {
    await sql`DELETE FROM properties WHERE id = ${id}`;
    return { success: true };
  } catch (error: any) {
    console.error('Failed to delete property:', error);
    return { success: false, message: error.message };
  }
}

export async function clearProperties() {
  if (!isDbConfigured()) return { success: false, message: 'Database not configured.' };
  try {
    await sql`DELETE FROM properties`;
    return { success: true };
  } catch (error: any) {
    console.error('Failed to clear properties:', error);
    return { success: false, message: error.message };
  }
}

export async function seedLeadsFromExcel() {
  if (!isDbConfigured()) return { success: false, message: 'Database not configured.' };

  let pool: any = null;
  try {
    const fs = require('fs');
    const path = require('path');
    const XLSX = require('xlsx');
    const crypto = require('crypto');
    const { createPool } = require('@vercel/postgres');
    pool = createPool({
      connectionString: process.env.POSTGRES_URL
    });

    let buffer;
    try {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://fully-delta.vercel.app';
      const fileUrl = `${baseUrl}/Narl%C4%B1VadiEvleri_Lead%20Dashboard.xlsx`;
      console.log('Fetching Excel file from URL:', fileUrl);
      const response = await fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } catch (fetchErr: any) {
      console.log('Fetch failed, falling back to local file:', fetchErr.message);
      const filepath = path.join(process.cwd(), 'public', 'NarlıVadiEvleri_Lead Dashboard.xlsx');
      if (fs.existsSync(filepath)) {
        buffer = fs.readFileSync(filepath);
      } else {
        return { success: false, message: `Excel dosyası ne URL'den ne de yerel dosyadan okunabildi: ${fetchErr.message}` };
      }
    }

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = 'Data';
    if (!workbook.SheetNames.includes(sheetName)) {
      return { success: false, message: `Sayfa bulunamadı: ${sheetName}` };
    }

    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as any[];

    // Clear existing data
    await sql`DELETE FROM appointments`;
    await sql`DELETE FROM leads`;

    let leadCount = 0;
    let appointmentCount = 0;

    // Helper functions
    const parseExcelDate = (val: any): Date => {
      if (val === undefined || val === null || val === '') return new Date();
      if (typeof val === 'number') {
        return new Date(Math.round((val - 25569) * 86400 * 1000));
      }
      const str = String(val).trim();
      if (!str || str === '-') return new Date();
      const parts = str.split('.');
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        return new Date(year, month, day);
      }
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d;
      return new Date();
    };

    const parseBudget = (val: any): number => {
      if (val === undefined || val === null || val === '') return 0;
      if (typeof val === 'number') return val;
      const str = String(val).replace(/[^0-9]/g, '');
      return parseInt(str, 10) || 0;
    };

    const leadsToInsert: any[] = [];
    const appointmentsToInsert: any[] = [];

    for (const row of rawRows) {
      const name = String(row['İsim Soyisim'] || '').trim();
      const phone = formatPhone(String(row['Tel'] || '').trim());

      if (!name && !phone) continue;

      const leadId = crypto.randomUUID();
      const source = String(row['Lead Kanal'] || '').trim();
      const createdAt = parseExcelDate(row['Tarih']);
      const roomCount = String(row['İlgilendiği Daire Tipi'] || '').trim();
      const customerQuestion = String(row['Soru'] || '').trim();
      const currentLocation = String(row['İl'] || '').trim();
      const leadStatus = String(row['Lead Mevcut Durum'] || '').trim();
      const rejectionReason = String(row['Red Nedenleri'] || '').trim();
      const notes = String(row['Notlar'] || '').trim();
      const budget = parseBudget(row['Bütçe']);

      let warmth = 'warm';
      const statusLower = leadStatus.toLowerCase();
      if (statusLower.includes('beklemede')) {
        warmth = 'hot';
      } else if (statusLower.includes('red') || statusLower.includes('fikri değişebilir') || rejectionReason) {
        warmth = 'cold';
      } else if (statusLower.includes('randevu') || statusLower.includes('alındı')) {
        warmth = 'hot';
      }

      leadsToInsert.push({
        id: leadId,
        name: name || 'İsimsiz Müşteri',
        phone: phone || '-',
        source: source || 'Diğer',
        room_count: roomCount || '1+1',
        customer_question: customerQuestion || 'Seçiniz',
        lead_status: leadStatus || 'İlk temas',
        current_location: currentLocation || 'Belirtilmedi',
        rejection_reason: rejectionReason || '',
        budget,
        warmth,
        is_alert_active: true,
        notes,
        created_at: createdAt.toISOString()
      });

      // Create appointment if randevu tarihi is present
      const appDateVal = row['Randevu Tarihi'];
      if (appDateVal !== undefined && appDateVal !== null && String(appDateVal).trim() !== '' && String(appDateVal).trim() !== '-') {
        const appDate = parseExcelDate(appDateVal);
        appDate.setHours(12);
        appDate.setMinutes(0);
        appDate.setSeconds(0);
        appDate.setMilliseconds(0);

        const year = appDate.getFullYear();
        const month = String(appDate.getMonth() + 1).padStart(2, '0');
        const day = String(appDate.getDate()).padStart(2, '0');
        const dateTimeStr = `${year}-${month}-${day}T12:00`;

        const appointmentId = crypto.randomUUID();
        
        let appType = 'Ofiste Proje Tanıtım';
        if (notes.toLowerCase().includes('şantiye') || notes.toLowerCase().includes('santiye') || notes.toLowerCase().includes('yerinde')) {
          appType = 'Şantiyede gösterim';
        }

        appointmentsToInsert.push({
          id: appointmentId,
          lead_id: leadId,
          date_time: dateTimeStr,
          location: 'Ofis / Yerinde Gösterim',
          status: 'pending',
          notes: notes ? `Randevu Notu: ${notes}` : '',
          appointment_type: appType
        });
      }
    }

    // Bulk insert leads
    if (leadsToInsert.length > 0) {
      const values: any[] = [];
      const valueRows: string[] = [];
      let paramIdx = 1;

      for (const lead of leadsToInsert) {
        valueRows.push(`($${paramIdx}, $${paramIdx+1}, $${paramIdx+2}, $${paramIdx+3}, $${paramIdx+4}, $${paramIdx+5}, $${paramIdx+6}, $${paramIdx+7}, $${paramIdx+8}, $${paramIdx+9}, $${paramIdx+10}, $${paramIdx+11}, $${paramIdx+12}, $${paramIdx+13}, $${paramIdx+14})`);
        values.push(
          lead.id, lead.name, lead.phone, lead.source, lead.room_count, lead.customer_question,
          lead.lead_status, lead.current_location, lead.rejection_reason, lead.budget, lead.warmth,
          lead.is_alert_active, lead.notes, lead.created_at, lead.created_at
        );
        paramIdx += 15;
      }

      const queryText = `
        INSERT INTO leads (
          id, name, phone, source, room_count, customer_question, lead_status,
          current_location, rejection_reason, budget, warmth, is_alert_active, notes, created_at, updated_at
        ) VALUES ${valueRows.join(', ')}
      `;

      await pool.query(queryText, values);
    }

    // Bulk insert appointments
    if (appointmentsToInsert.length > 0) {
      const appValues: any[] = [];
      const appValueRows: string[] = [];
      let appParamIdx = 1;

      for (const app of appointmentsToInsert) {
        appValueRows.push(`($${appParamIdx}, $${appParamIdx+1}, $${appParamIdx+2}, $${appParamIdx+3}, $${appParamIdx+4}, $${appParamIdx+5}, $${appParamIdx+6})`);
        appValues.push(
          app.id, app.lead_id, app.date_time, app.location, app.status, app.notes, app.appointment_type
        );
        appParamIdx += 7;
      }

      const appQueryText = `
        INSERT INTO appointments (
          id, lead_id, date_time, location, status, notes, appointment_type
        ) VALUES ${appValueRows.join(', ')}
      `;

      await pool.query(appQueryText, appValues);
    }

    return {
      success: true,
      message: `Başarıyla ${leadsToInsert.length} müşteri ve ${appointmentsToInsert.length} randevu aktarıldı.`
    };

  } catch (error: any) {
    console.error('Seeding error:', error);
    return { success: false, message: error.message };
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

export async function runWarmthMigration() {
  if (!isDbConfigured()) return { success: false, message: 'Database not configured.' };
  try {
    await sql`UPDATE leads SET warmth = 'hot' WHERE lead_status = 'Beklemede'`;
    return { success: true, message: 'Beklemede durumundaki tüm müşteriler Hot (Sıcak) yapıldı.' };
  } catch (error: any) {
    console.error('Migration error:', error);
    return { success: false, message: error.message };
  }
}
