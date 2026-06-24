'use client';

import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, UserPlus, Calendar, Sparkles, 
  BarChart3, QrCode, Upload, Database, Activity, Sun, Moon, ArrowLeftRight
} from 'lucide-react';
import { StorageManager } from '@/lib/storage';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isOpenMobile?: boolean;
  setIsOpenMobile?: (open: boolean) => void;
}

export default function Sidebar({ activeTab, setActiveTab, isOpenMobile, setIsOpenMobile }: SidebarProps) {
  const [theme, setTheme] = useState<string>('midnight-neon');
  const [dbStatus, setDbStatus] = useState<{ active: boolean; checked: boolean }>({
    active: false,
    checked: false,
  });

  useEffect(() => {
    // Load theme from localStorage
    let savedTheme = 'midnight-neon';
    try {
      savedTheme = localStorage.getItem('fully-theme') || 'midnight-neon';
    } catch (e) {
      console.error('Failed to read theme from localStorage:', e);
    }
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Check DB connection
    const checkConn = async () => {
      const active = await StorageManager.isDbActive();
      if (active) {
        await StorageManager.init();
      }
      setDbStatus({ active, checked: true });
    };
    checkConn();
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'midnight-neon' ? 'forest-ocean' : 'midnight-neon';
    setTheme(nextTheme);
    try {
      localStorage.setItem('fully-theme', nextTheme);
    } catch (e) {
      console.error('Failed to save theme to localStorage:', e);
    }
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const navItems = [
    { id: 'dashboard', label: 'CRM Paneli', icon: LayoutDashboard },
    { id: 'add-lead', label: 'Yeni Müşteri', icon: UserPlus },
    { id: 'appointments', label: 'Randevular', icon: Calendar },
    { id: 'matchmaker', label: 'Eşleştirici', icon: Sparkles },
    { id: 'reports', label: 'Raporlama', icon: BarChart3 },
    { id: 'qr-intake', label: 'QR Giriş', icon: QrCode },
    { id: 'import', label: 'Excel/Veri Yükle', icon: Upload },
  ];

  return (
    <aside className={`sidebar-wrapper ${isOpenMobile ? 'mobile-open' : ''}`}>
      <div>
        {/* Brand Logo Section */}
        <div className="nav-logo-section">
          <div style={{
            background: 'var(--primary-gradient)',
            width: '36px',
            height: '36px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-glow)',
            fontWeight: 800,
            fontSize: '1.2rem',
            color: '#fff'
          }}>
            F
          </div>
          <div>
            <h1 style={{ fontSize: '1.35rem', fontWeight: '800', letterSpacing: '-0.5px', color: '#fff', margin: 0 }}>
              Fully<span style={{ color: 'var(--color-primary)' }}>CRM</span>
            </h1>
            <p style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '-2px' }}>
              Emlak Satış Yöneticisi
            </p>
          </div>
        </div>

        {/* Navigation Menu */}
        <nav>
          <ul className="nav-menu-list">
            {navItems.map((item) => {
              const IconComponent = item.icon;
              return (
                <li key={item.id}>
                  <button
                    onClick={() => {
                      setActiveTab(item.id);
                      if (setIsOpenMobile) setIsOpenMobile(false);
                    }}
                    className={`nav-menu-item-btn ${activeTab === item.id ? 'active' : ''}`}
                  >
                    <IconComponent size={18} />
                    <span>{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      {/* Footer Section */}
      <div className="sidebar-footer">
        {/* Database Status indicator */}
        {dbStatus.checked ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 0.75rem',
            borderRadius: '8px',
            fontSize: '0.75rem',
            fontWeight: 500,
            background: dbStatus.active ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)',
            color: dbStatus.active ? 'var(--color-success)' : 'var(--color-warning)',
            border: `1px solid ${dbStatus.active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)'}`
          }}>
            <Database size={13} />
            <span style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
              {dbStatus.active ? 'Bulut SQL Aktif' : 'Offline Depolama'}
            </span>
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            padding: '0.5rem 0.75rem',
            borderRadius: '8px',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            background: 'rgba(255, 255, 255, 0.03)'
          }}>
            <Activity size={13} className="animate-pulse" />
            <span>Bağlanıyor...</span>
          </div>
        )}

        {/* Theme Toggle Button */}
        <button 
          onClick={toggleTheme}
          className="nav-menu-item-btn"
          style={{
            padding: '0.5rem 0.75rem',
            fontSize: '0.8rem',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid var(--glass-border)',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '0.5rem'
          }}
          title="Temayı Değiştir"
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ArrowLeftRight size={13} />
            Tema Değiştir
          </span>
          {theme === 'midnight-neon' ? (
            <Sun size={13} style={{ color: 'var(--color-warning)' }} />
          ) : (
            <Moon size={13} style={{ color: 'var(--color-primary)' }} />
          )}
        </button>
      </div>
    </aside>
  );
}
