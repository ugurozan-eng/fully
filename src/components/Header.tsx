'use client';

import React, { useState, useEffect } from 'react';
import { Sun, Moon, Database, HelpCircle, Activity } from 'lucide-react';
import { StorageManager } from '@/lib/storage';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Header({ activeTab, setActiveTab }: HeaderProps) {
  const [theme, setTheme] = useState<string>('midnight-neon');
  const [dbStatus, setDbStatus] = useState<{ active: boolean; checked: boolean }>({
    active: false,
    checked: false,
  });

  useEffect(() => {
    // Load theme from localStorage
    const savedTheme = localStorage.getItem('fully-theme') || 'midnight-neon';
    setTheme(savedTheme);
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Check DB connection
    const checkConn = async () => {
      const active = await StorageManager.isDbActive();
      // If DB is active, initialize tables automatically
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
    localStorage.setItem('fully-theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
  };

  const navItems = [
    { id: 'dashboard', label: 'CRM Paneli' },
    { id: 'add-lead', label: 'Yeni Müşteri' },
    { id: 'appointments', label: 'Randevular' },
    { id: 'matchmaker', label: 'Eşleştirici' },
    { id: 'reports', label: 'Raporlama' },
    { id: 'qr-intake', label: 'QR Giriş' },
    { id: 'import', label: 'Excel/Veri Yükle' },
  ];

  return (
    <header className="glass-panel app-header" style={{ borderBottomLeftRadius: '24px', borderBottomRightRadius: '24px', marginBottom: '2rem', padding: '1rem 2rem' }}>
      <div className="app-header-top" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        {/* Brand Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            background: 'var(--primary-gradient)',
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: 'var(--shadow-glow)',
            fontWeight: 'bold',
            fontSize: '1.25rem',
            color: '#fff'
          }}>
            F
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: '800', letterSpacing: '-0.5px', margin: 0 }}>
              Fully<span className="gradient-text">CRM</span>
            </h1>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '-2px' }}>
              Emlak Satış Yöneticisi
            </p>
          </div>
        </div>

        {/* Database Status Badge & Theme Select */}
        <div className="app-header-controls" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {dbStatus.checked ? (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.8rem',
              borderRadius: '20px',
              fontSize: '0.8rem',
              fontWeight: 500,
              background: dbStatus.active ? 'rgba(52, 211, 153, 0.1)' : 'rgba(251, 191, 36, 0.1)',
              color: dbStatus.active ? 'var(--color-success)' : 'var(--color-warning)',
              border: `1px solid ${dbStatus.active ? 'rgba(52, 211, 153, 0.2)' : 'rgba(251, 191, 36, 0.2)'}`
            }}>
              <Database size={14} />
              <span>{dbStatus.active ? 'Vercel Postgres Bulut Aktif' : 'Tarayıcı Depolama (Offline)'}</span>
            </div>
          ) : (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.4rem 0.8rem',
              borderRadius: '20px',
              fontSize: '0.8rem',
              color: 'var(--text-secondary)',
              background: 'rgba(255, 255, 255, 0.05)'
            }}>
              <Activity size={14} className="animate-pulse" />
              <span>Bağlantı kontrol ediliyor...</span>
            </div>
          )}

          {/* Theme Selector Toggle */}
          <button 
            onClick={toggleTheme}
            className="glow-btn"
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.85rem',
              borderRadius: '20px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--glass-border)',
              color: 'var(--text-primary)',
              boxShadow: 'none',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
            title="Temayı Değiştir"
          >
            {theme === 'midnight-neon' ? (
              <>
                <Sun size={15} style={{ color: 'var(--color-warning)' }} />
                <span style={{ fontSize: '0.8rem' }}>Zümrüt Yeşil</span>
              </>
            ) : (
              <>
                <Moon size={15} style={{ color: 'var(--color-primary)' }} />
                <span style={{ fontSize: '0.8rem' }}>Gece Kedisi</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <nav className="mobile-nav-tabs" style={{ 
        display: 'flex', 
        gap: '0.5rem', 
        marginTop: '1.25rem', 
        borderTop: '1px solid var(--glass-border)', 
        paddingTop: '1rem',
        overflowX: 'auto',
        whiteSpace: 'nowrap'
      }}>
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            style={{
              background: activeTab === item.id ? 'var(--primary-gradient)' : 'transparent',
              color: activeTab === item.id ? '#fff' : 'var(--text-secondary)',
              border: 'none',
              padding: '0.6rem 1.2rem',
              borderRadius: '10px',
              fontWeight: '600',
              fontSize: '0.9rem',
              cursor: 'pointer',
              boxShadow: activeTab === item.id ? 'var(--shadow-glow)' : 'none',
              transform: activeTab === item.id ? 'scale(1.03)' : 'none',
              transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </header>
  );
}
