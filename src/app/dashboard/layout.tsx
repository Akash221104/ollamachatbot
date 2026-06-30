'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [adminName, setAdminName] = useState('Admin');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkAuth() {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          if (data.user.role !== 'ADMIN') {
            router.push('/chat');
          } else {
            setAdminName(data.user.name);
          }
        } else {
          router.push('/login');
        }
      } catch (err) {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }
    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        router.push('/login');
      }
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0B0F19',
        color: 'var(--text-secondary)'
      }}>
        <div className="typing-indicator">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
      </div>
    );
  }

  const menuItems = [
    { name: 'Dashboard', path: '/dashboard', icon: '📊' },
    { name: 'Users', path: '/dashboard/users', icon: '👥' },
    { name: 'Documents', path: '/dashboard/documents', icon: '📂' },
    { name: 'Integrations', path: '/dashboard/integrations', icon: '🔌' },
    { name: 'External Users', path: '/dashboard/external-users', icon: '🌐' },
    { name: 'Settings', path: '/dashboard/settings', icon: '⚙️' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0B0F19', color: 'white' }}>
      {/* Sidebar Navigation */}
      <aside style={{
        width: '260px',
        background: 'rgba(17, 24, 39, 0.95)',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '24px 16px',
        position: 'sticky',
        top: 0,
        height: '100vh'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
          {/* Logo / Brand Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '12px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '1rem',
              color: 'white'
            }}>RAG</div>
            <span style={{ fontWeight: '800', fontSize: '1.1rem', letterSpacing: '0.05em' }}>ABC Admin</span>
          </div>

          {/* Nav list */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {menuItems.map((item) => {
              const isActive = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 16px',
                    borderRadius: '10px',
                    color: isActive ? 'white' : 'var(--text-secondary)',
                    background: isActive ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                    border: isActive ? '1px solid rgba(99, 102, 241, 0.3)' : '1px solid transparent',
                    fontWeight: isActive ? '600' : '400',
                    transition: 'all 0.2s',
                    textDecoration: 'none'
                  }}
                >
                  <span style={{ fontSize: '1.1rem' }}>{item.icon}</span>
                  <span>{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer info */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingLeft: '12px' }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.9rem',
              fontWeight: '700'
            }}>
              {adminName[0].toUpperCase()}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: '600' }}>{adminName}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Administrator</span>
            </div>
          </div>

          <button
            onClick={handleLogout}
            style={{
              width: '100%',
              padding: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#F87171',
              borderRadius: '10px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'background 0.2s'
            }}
          >
            Logout 🚪
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '40px', overflowY: 'auto', minHeight: '100vh' }}>
        {children}
      </main>
    </div>
  );
}
