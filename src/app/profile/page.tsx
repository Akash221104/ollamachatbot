'use client';

import { useState, useEffect } from 'react';
import { Document, User } from '../../types';

export default function ProfilePage() {
  const [user, setUser] = useState<User | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function loadProfile() {
      try {
        const userRes = await fetch('/api/auth/me');
        const docsRes = await fetch('/api/documents');

        if (userRes.ok && docsRes.ok) {
          const userData = await userRes.json();
          const docsData = await docsRes.json();
          setUser(userData.user);
          setDocuments(docsData.documents);
        } else {
          setErrorMsg('Failed to load profile data.');
        }
      } catch (err) {
        setErrorMsg('Network error loading profile.');
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, []);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0', color: 'var(--text-secondary)' }}>
        <div className="typing-indicator">
          <div className="typing-dot" />
          <div className="typing-dot" />
          <div className="typing-dot" />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', animation: 'fadeIn 0.5s ease-out' }}>
      <div>
        <h1 className="dashboard-title" style={{ fontSize: '2.2rem', fontWeight: '800', textAlign: 'left', marginBottom: '8px' }}>
          My Profile
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>View your account credentials and assigned database files.</p>
      </div>

      {errorMsg && (
        <div className="glass-card" style={{ padding: '14px 20px', borderLeft: '4px solid #EF4444', color: '#EF4444', background: 'rgba(239, 68, 68, 0.1)' }}>
          {errorMsg}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '30px', alignItems: 'start' }}>
        {/* Profile Card */}
        <div className="glass-card" style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--primary), var(--accent))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.75rem',
              fontWeight: '700',
              color: 'white'
            }}>
              {user ? user.name[0].toUpperCase() : 'U'}
            </div>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '700', color: 'white', margin: 0 }}>{user?.name}</h2>
              <span className="badge" style={{ marginTop: '6px', padding: '2px 10px', fontSize: '0.75rem' }}>{user?.role}</span>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Email Address:</span>
              <span style={{ color: 'white', fontWeight: '600' }}>{user?.email}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Account Status:</span>
              <span style={{ color: '#34D399', fontWeight: '600' }}>{user?.is_active ? 'Active' : 'Inactive'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>Member Since:</span>
              <span style={{ color: 'white', fontWeight: '600' }}>
                {user ? new Date(user.created_at).toLocaleDateString() : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Assigned Documents Card */}
        <div className="glass-card" style={{ padding: '32px' }}>
          <h3 className="section-title" style={{ fontSize: '1.25rem', borderLeftColor: 'var(--accent)', marginBottom: '20px' }}>
            Assigned Documents Set
          </h3>
          
          {documents.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0', fontSize: '0.9rem' }}>
              You have no documents assigned. Contact your administrator.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {documents.map((doc) => {
                const assignDate = new Date(doc.created_at).toLocaleDateString();
                return (
                  <div key={doc.id} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'rgba(255, 255, 255, 0.02)',
                    border: '1px solid var(--border-color)',
                    padding: '12px 16px',
                    borderRadius: '10px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.25rem' }}>📄</span>
                      <span style={{ fontWeight: '600', color: 'white', fontSize: '0.92rem' }}>{doc.filename}</span>
                    </div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Assigned: {assignDate}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
