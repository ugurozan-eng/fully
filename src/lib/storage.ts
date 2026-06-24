import { Lead, Appointment, Property } from './types';
import * as actions from '@/app/actions';

// Check if window object is available (client-side)
const isClient = () => typeof window !== 'undefined';

// LocalStorage helpers
const getLocal = <T>(key: string, defaultValue: T): T => {
  if (!isClient()) return defaultValue;
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return defaultValue;
    const parsed = JSON.parse(stored);
    if (Array.isArray(defaultValue) && !Array.isArray(parsed)) {
      return defaultValue;
    }
    return parsed as T;
  } catch (e) {
    console.error(`Error parsing localStorage key "${key}":`, e);
    return defaultValue;
  }
};

const setLocal = (key: string, data: any) => {
  if (isClient()) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error(`Error writing to localStorage key "${key}":`, e);
    }
  }
};

// Unified storage manager
export const StorageManager = {
  // Check if DB is active
  async isDbActive(): Promise<boolean> {
    try {
      const conn = await actions.checkDatabaseConnection();
      return conn.configured;
    } catch {
      return false;
    }
  },

  // Initialize DB if configured
  async init(): Promise<boolean> {
    try {
      const res = await actions.initDatabase();
      return res.success;
    } catch {
      return false;
    }
  },

  /* LEADS SERVICE */
  async getLeads(): Promise<Lead[]> {
    const dbActive = await this.isDbActive();
    if (dbActive) {
      const res = await actions.getLeads();
      if (res.success) {
        // Sync local storage so it's cached/available offline
        setLocal('fully-leads', res.data);
        return res.data;
      }
    }
    // Fallback to local storage
    return getLocal<Lead[]>('fully-leads', []);
  },

  async saveLead(lead: Lead): Promise<boolean> {
    const dbActive = await this.isDbActive();
    
    // Save to local storage first (always keep copy)
    const localLeads = getLocal<Lead[]>('fully-leads', []);
    const index = localLeads.findIndex((l) => l.id === lead.id);
    if (index >= 0) {
      localLeads[index] = lead;
    } else {
      localLeads.unshift(lead);
    }
    setLocal('fully-leads', localLeads);

    if (dbActive) {
      const res = await actions.saveLead(lead);
      return res.success;
    }
    return true;
  },

  async deleteLead(id: string): Promise<boolean> {
    const dbActive = await this.isDbActive();

    // Delete locally
    const localLeads = getLocal<Lead[]>('fully-leads', []);
    const filtered = localLeads.filter((l) => l.id !== id);
    setLocal('fully-leads', filtered);

    if (dbActive) {
      const res = await actions.deleteLead(id);
      return res.success;
    }
    return true;
  },

  /* APPOINTMENTS SERVICE */
  async getAppointments(): Promise<Appointment[]> {
    const dbActive = await this.isDbActive();
    if (dbActive) {
      const res = await actions.getAppointments();
      if (res.success) {
        setLocal('fully-appointments', res.data);
        return res.data;
      }
    }
    // Fallback to local storage
    const localApps = getLocal<Appointment[]>('fully-appointments', []);
    // Map lead names from local leads if we are in local fallback
    const localLeads = getLocal<Lead[]>('fully-leads', []);
    return localApps.map(app => {
      const lead = localLeads.find(l => l.id === app.lead_id);
      return {
        ...app,
        lead_name: lead ? lead.name : app.lead_name || 'Bilinmeyen Müşteri'
      };
    });
  },

  async saveAppointment(app: Appointment): Promise<boolean> {
    const dbActive = await this.isDbActive();

    // Save to local storage
    const localApps = getLocal<Appointment[]>('fully-appointments', []);
    const index = localApps.findIndex((a) => a.id === app.id);
    if (index >= 0) {
      localApps[index] = app;
    } else {
      localApps.unshift(app);
    }
    setLocal('fully-appointments', localApps);

    if (dbActive) {
      const res = await actions.saveAppointment(app);
      return res.success;
    }
    return true;
  },

  async deleteAppointment(id: string): Promise<boolean> {
    const dbActive = await this.isDbActive();

    // Delete locally
    const localApps = getLocal<Appointment[]>('fully-appointments', []);
    const filtered = localApps.filter((a) => a.id !== id);
    setLocal('fully-appointments', filtered);

    if (dbActive) {
      const res = await actions.deleteAppointment(id);
      return res.success;
    }
    return true;
  },

  /* PROPERTIES SERVICE */
  async getProperties(): Promise<Property[]> {
    const dbActive = await this.isDbActive();
    if (dbActive) {
      const res = await actions.getProperties();
      if (res.success) {
        setLocal('fully-properties', res.data);
        return res.data;
      }
    }
    return getLocal<Property[]>('fully-properties', []);
  },

  async saveProperty(prop: Property): Promise<boolean> {
    const dbActive = await this.isDbActive();

    // Save to local storage
    const localProps = getLocal<Property[]>('fully-properties', []);
    const index = localProps.findIndex((p) => p.id === prop.id);
    if (index >= 0) {
      localProps[index] = prop;
    } else {
      localProps.unshift(prop);
    }
    setLocal('fully-properties', localProps);

    if (dbActive) {
      const res = await actions.saveProperty(prop);
      return res.success;
    }
    return true;
  },

  async deleteProperty(id: string): Promise<boolean> {
    const dbActive = await this.isDbActive();

    // Delete locally
    const localProps = getLocal<Property[]>('fully-properties', []);
    const filtered = localProps.filter((p) => p.id !== id);
    setLocal('fully-properties', filtered);

    if (dbActive) {
      const res = await actions.deleteProperty(id);
      return res.success;
    }
    return true;
  },

  async clearProperties(): Promise<boolean> {
    const dbActive = await this.isDbActive();
    setLocal('fully-properties', []);

    if (dbActive) {
      const res = await actions.clearProperties();
      return res.success;
    }
    return true;
  }
};
