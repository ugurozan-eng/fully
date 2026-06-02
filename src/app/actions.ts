'use server';

import { sql } from '@vercel/postgres';
import { Lead, Appointment, Property } from '@/lib/types';

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
        room_count VARCHAR(50),
        purpose VARCHAR(100),
        target_region VARCHAR(100),
        current_location VARCHAR(100),
        marital_status VARCHAR(100),
        occupation VARCHAR(100),
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;

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
    const { rows } = await sql`SELECT * FROM leads ORDER BY created_at DESC`;
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
      target_region: r.target_region || '',
      current_location: r.current_location || '',
      marital_status: r.marital_status || '',
      occupation: r.occupation || '',
      budget: Number(r.budget),
      warmth: r.warmth,
      is_alert_active: r.is_alert_active,
      notes: r.notes || '',
      created_at: r.created_at,
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
    await sql`
      INSERT INTO leads (
        id, name, phone, email, source, property_type, room_count, purpose, 
        target_region, current_location, marital_status, occupation, budget, 
        warmth, is_alert_active, notes
      ) VALUES (
        ${lead.id}, ${lead.name}, ${lead.phone}, ${lead.email}, ${lead.source}, ${lead.property_type}, ${lead.room_count}, ${lead.purpose},
        ${lead.target_region}, ${lead.current_location}, ${lead.marital_status}, ${lead.occupation}, ${lead.budget},
        ${lead.warmth}, ${lead.is_alert_active}, ${lead.notes}
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        phone = EXCLUDED.phone,
        email = EXCLUDED.email,
        source = EXCLUDED.source,
        property_type = EXCLUDED.property_type,
        room_count = EXCLUDED.room_count,
        purpose = EXCLUDED.purpose,
        target_region = EXCLUDED.target_region,
        current_location = EXCLUDED.current_location,
        marital_status = EXCLUDED.marital_status,
        occupation = EXCLUDED.occupation,
        budget = EXCLUDED.budget,
        warmth = EXCLUDED.warmth,
        is_alert_active = EXCLUDED.is_alert_active,
        notes = EXCLUDED.notes;
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
      INSERT INTO appointments (id, lead_id, date_time, location, status, notes)
      VALUES (${app.id}, ${app.lead_id}, ${app.date_time}, ${app.location}, ${app.status}, ${app.notes})
      ON CONFLICT (id) DO UPDATE SET
        lead_id = EXCLUDED.lead_id,
        date_time = EXCLUDED.date_time,
        location = EXCLUDED.location,
        status = EXCLUDED.status,
        notes = EXCLUDED.notes;
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
      created_at: r.created_at,
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
      INSERT INTO properties (id, title, price, region, type, room_count)
      VALUES (${prop.id}, ${prop.title}, ${prop.price}, ${prop.region}, ${prop.type}, ${prop.room_count})
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        price = EXCLUDED.price,
        region = EXCLUDED.region,
        type = EXCLUDED.type,
        room_count = EXCLUDED.room_count;
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
