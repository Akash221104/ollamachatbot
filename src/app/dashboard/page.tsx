'use client';

import { useState, useEffect } from 'react';
import { AuditLog } from '../../types';

interface Metrics {
  totalUsers: number;
  totalDocuments: number;
  failedEmbeddings: number;
  ollamaStatus: string;
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const fetchOverview = async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) {
        const data = await res.json();
        setMetrics(data.metrics);
        setLogs(data.auditLogs);
      } else {
        setErrorMsg('Failed to load dashboard metrics.');
      }
    } catch (err) {
      setErrorMsg('Error connecting to overview API.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 10000); // refresh metrics every 10 seconds
    return () => clearInterval(interval);
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
          Overview
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>System status, usage statistics, and real-time security events.</p>
      </div>

      {errorMsg && (
        <div className="login-error-msg" style={{ padding: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', borderRadius: '8px', color: '#F87171' }}>
          {errorMsg}
        </div>
      )}

      {/* Metrics Summary Grid */}
      <div className="grid-cards" style={{ margin: 0, gap: '20px' }}>
        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>
            Total Users
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'white' }}>
            {metrics?.totalUsers ?? 0}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>
            Total Documents
          </div>
          <div style={{ fontSize: '2.5rem', fontWeight: '800', color: 'white' }}>
            {metrics?.totalDocuments ?? 0}
          </div>
        </div>

        <div className="glass-card" style={{ 
          padding: '24px', 
          borderLeft: metrics && metrics.failedEmbeddings > 0 ? '4px solid #EF4444' : '1px solid var(--border-color)' 
        }}>
          <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>
            Failed Embeddings
          </div>
          <div style={{ 
            fontSize: '2.5rem', 
            fontWeight: '800', 
            color: metrics && metrics.failedEmbeddings > 0 ? '#EF4444' : 'white' 
          }}>
            {metrics?.failedEmbeddings ?? 0}
          </div>
        </div>

        <div className="glass-card" style={{ padding: '24px' }}>
          <div style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-secondary)', textTransform: 'uppercase', marginBottom: '8px' }}>
            Ollama Status
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
            <span style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: metrics?.ollamaStatus === 'online' ? '#10B981' : '#EF4444'
            }}></span>
            <span style={{ fontSize: '1.5rem', fontWeight: '800', color: 'white', textTransform: 'capitalize' }}>
              {metrics?.ollamaStatus ?? 'offline'}
            </span>
          </div>
        </div>
      </div>

      {/* Audit Log Activity Feed */}
      <div className="glass-card" style={{ padding: '32px' }}>
        <h2 className="section-title" style={{ fontSize: '1.4rem', borderLeftColor: 'var(--secondary)', marginBottom: '24px' }}>
          Recent Activity Feed
        </h2>
        
        {logs.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
            No recent activity recorded.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {logs.map((log) => {
              const formattedDate = new Date(log.created_at).toLocaleString();
              const metaText = log.metadata ? JSON.stringify(log.metadata) : '';
              return (
                <div key={log.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                  paddingBottom: '14px'
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ 
                        fontWeight: '700', 
                        color: log.action.includes('Failed') ? '#F87171' : 'var(--secondary)',
                        fontSize: '0.95rem'
                      }}>
                        {log.action}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {log.userName || log.userEmail || 'System'}
                      </span>
                    </div>
                    {metaText && (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                        {metaText}
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {formattedDate}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
