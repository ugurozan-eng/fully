const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { createPool } = require('@vercel/postgres');
const crypto = require('crypto');

// 1. Manually parse .env.local file to populate process.env
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      const key = match[1];
      let value = match[2] || '';
      // Remove surrounding quotes if any
      if (value.length > 0 && value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
        value = value.substring(1, value.length - 1);
      }
      process.env[key] = value.trim();
    }
  });
  console.log('Loaded environment variables from .env.local');
} else {
  console.warn('Warning: .env.local file not found. Running with current system process environment variables.');
}

if (!process.env.POSTGRES_URL) {
  console.error('Error: POSTGRES_URL is not set. Please make sure .env.local is present.');
  process.exit(1);
}

// 2. Initialize database pool
const pool = createPool({
  connectionString: process.env.POSTGRES_URL
});

// Helper to parse Excel dates (both serial numbers and strings)
function parseExcelDate(val) {
  if (val === undefined || val === null || val === '') return new Date();
  if (typeof val === 'number') {
    // Excel serial number (days since 1900-01-01)
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return date;
  }
  const str = String(val).trim();
  if (!str || str === '-') return new Date();

  // Handle DD.MM.YYYY format
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
}

// Helper to parse budget (removes non-numeric characters)
function parseBudget(val) {
  if (val === undefined || val === null || val === '') return 0;
  if (typeof val === 'number') return val;
  const str = String(val).replace(/[^0-9]/g, '');
  return parseInt(str, 10) || 0;
}

// Format Date as local YYYY-MM-DD
function formatDateToLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function main() {
  try {
    // 3. Read the Excel File
    const filepath = path.join(__dirname, '..', 'NarlıVadiEvleri_Lead Dashboard.xlsx');
    if (!fs.existsSync(filepath)) {
      console.error(`Error: Excel file not found at ${filepath}`);
      process.exit(1);
    }
    
    console.log('Reading Excel file...');
    const workbook = XLSX.readFile(filepath);
    const sheetName = 'Data';
    if (!workbook.SheetNames.includes(sheetName)) {
      console.error(`Error: Sheet "${sheetName}" not found in workbook.`);
      console.log('Available sheets:', workbook.SheetNames);
      process.exit(1);
    }

    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
    console.log(`Successfully parsed ${rawRows.length} raw rows from "${sheetName}".`);

    // 4. Clean existing data
    console.log('Connecting to database...');
    await pool.query('SELECT 1');
    console.log('Clearing existing leads and appointments from database...');
    await pool.query('DELETE FROM appointments');
    await pool.query('DELETE FROM leads');
    console.log('Database tables cleared successfully.');

    // 5. Iterate and insert
    let leadCount = 0;
    let appointmentCount = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];

      // Extract and clean fields
      const name = String(row['İsim Soyisim'] || '').trim();
      const phone = String(row['Tel'] || '').trim();

      // If both name and phone are empty, this is likely an empty row padding
      if (!name && !phone) {
        continue;
      }

      // Generate UUIDs
      const leadId = crypto.randomUUID();

      // Mapping variables
      const source = String(row['Lead Kanal'] || '').trim();
      const rawDate = row['Tarih'];
      const createdAt = parseExcelDate(rawDate);
      const roomCount = String(row['İlgilendiği Daire Tipi'] || '').trim();
      const customerQuestion = String(row['Soru'] || '').trim();
      const current_location = String(row['İl'] || '').trim();
      const leadStatus = String(row['Lead Mevcut Durum'] || '').trim();
      const rejectionReason = String(row['Red Nedenleri'] || '').trim();
      const notes = String(row['Notlar'] || '').trim();
      const budget = parseBudget(row['Bütçe']);

      // Deduce warmth
      let warmth = 'warm';
      const statusLower = leadStatus.toLowerCase();
      if (statusLower.includes('beklemede')) {
        warmth = 'hot';
      } else if (statusLower.includes('red') || statusLower.includes('fikri değişebilir') || rejectionReason) {
        warmth = 'cold';
      } else if (statusLower.includes('randevu') || statusLower.includes('alındı')) {
        warmth = 'hot';
      }

      // Insert Lead
      await pool.query(
        `INSERT INTO leads (
          id, name, phone, source, room_count, customer_question, lead_status,
          current_location, rejection_reason, budget, warmth, is_alert_active, notes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          leadId,
          name || 'İsimsiz Müşteri',
          phone || '-',
          source || 'Diğer',
          roomCount || '1+1',
          customerQuestion || 'Seçiniz',
          leadStatus || 'İlk temas',
          current_location || 'Belirtilmedi',
          rejectionReason || '',
          budget,
          warmth,
          true,
          notes,
          createdAt
        ]
      );
      leadCount++;

      // Check for appointment date
      const appDateVal = row['Randevu Tarihi'];
      if (appDateVal !== undefined && appDateVal !== null && String(appDateVal).trim() !== '' && String(appDateVal).trim() !== '-') {
        const appDate = parseExcelDate(appDateVal);
        // Default time is 12:00
        appDate.setHours(12);
        appDate.setMinutes(0);
        appDate.setSeconds(0);
        appDate.setMilliseconds(0);

        // Format to YYYY-MM-DDTHH:MM format
        const dateStr = formatDateToLocal(appDate);
        const dateTimeStr = `${dateStr}T12:00`;

        const appointmentId = crypto.randomUUID();
        
        // Default appointment type based on status, default to 'Ofiste Proje Tanıtım'
        let appType = 'Ofiste Proje Tanıtım';
        if (notes.toLowerCase().includes('şantiye') || notes.toLowerCase().includes('santiye') || notes.toLowerCase().includes('yerinde')) {
          appType = 'Şantiyede gösterim';
        }

        await pool.query(
          `INSERT INTO appointments (
            id, lead_id, date_time, location, status, notes, appointment_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            appointmentId,
            leadId,
            dateTimeStr,
            'Ofis / Yerinde Gösterim',
            'pending',
            notes ? `Randevu Notu: ${notes}` : '',
            appType
          ]
        );
        appointmentCount++;
      }
    }

    console.log(`\nImport Summary:`);
    console.log(`- Imported ${leadCount} Leads.`);
    console.log(`- Created ${appointmentCount} Appointments.`);
    console.log('Database import completed successfully!');

  } catch (error) {
    console.error('Fatal error during import:', error);
  } finally {
    await pool.end();
    console.log('Database pool connection closed.');
  }
}

main();
