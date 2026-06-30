'use client';

import { useState, useEffect } from 'react';

interface Integration {
  id: string;
  name: string;
  allowed_origins: string[];
  is_active: boolean;
  created_at: string;
  api_key: string;
}

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [orgName, setOrgName] = useState('My Company');
  const [apiKey, setApiKey] = useState('');
  const [revealKey, setRevealKey] = useState(false);
  const [loading, setLoading] = useState(true);

  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showScriptModal, setShowScriptModal] = useState(false);
  
  // Form states
  const [newName, setNewName] = useState('');
  const [newOrigins, setNewOrigins] = useState('');
  const [editId, setEditId] = useState('');
  const [editName, setEditName] = useState('');
  const [editOrigins, setEditOrigins] = useState('');
  const [editActive, setEditActive] = useState(true);

  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchIntegrations = async () => {
    try {
      const res = await fetch('/api/integrations');
      if (res.ok) {
        const data = await res.json();
        setIntegrations(data.integrations || []);
        if (data.integrations && data.integrations.length > 0) {
          setApiKey(data.integrations[0].api_key);
        }
      }
    } catch (err) {
      showToast('error', 'Failed to load integrations.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
    // Fetch organization info
    async function fetchOrg() {
      try {
        const res = await fetch('/api/widget/chat', { method: 'OPTIONS' }); // check if up
        // We'll just fetch integrations which returns the api key. For organization name, let's load it from a simple config or just hardcode/default it
        // Or we can get it from the seeded database. Since org seeded is linked to integrations, the GET api/integrations returns it.
      } catch (e) {}
    }
    fetchOrg();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    try {
      const originsArray = newOrigins
        .split(',')
        .map(o => o.trim())
        .filter(o => o.length > 0);

      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, allowed_origins: originsArray })
      });

      if (res.ok) {
        showToast('success', 'Integration created successfully.');
        setNewName('');
        setNewOrigins('');
        setShowCreateModal(false);
        setShowScriptModal(true); // Show embed script modal next
        fetchIntegrations();
      } else {
        const data = await res.json();
        showToast('error', data.error || 'Failed to create integration.');
      }
    } catch (err) {
      showToast('error', 'Network error creating integration.');
    }
  };

  const handleEditInit = (integration: Integration) => {
    setEditId(integration.id);
    setEditName(integration.name);
    setEditOrigins(integration.allowed_origins.join(', '));
    setEditActive(integration.is_active);
    setShowEditModal(true);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const originsArray = editOrigins
        .split(',')
        .map(o => o.trim())
        .filter(o => o.length > 0);

      const res = await fetch(`/api/integrations/${editId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editName,
          allowed_origins: originsArray,
          is_active: editActive
        })
      });

      if (res.ok) {
        showToast('success', 'Integration updated.');
        setShowEditModal(false);
        fetchIntegrations();
      } else {
        const data = await res.json();
        showToast('error', data.error || 'Failed to update integration.');
      }
    } catch (err) {
      showToast('error', 'Network error updating integration.');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this integration?')) return;

    try {
      const res = await fetch(`/api/integrations/${id}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('success', 'Integration deleted.');
        fetchIntegrations();
      } else {
        showToast('error', 'Failed to delete integration.');
      }
    } catch (err) {
      showToast('error', 'Network error deleting integration.');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    showToast('success', `${label} copied to clipboard!`);
  };

  const hostUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';

  const embedScript = `<!-- Paste this in your application -->
<script src="${hostUrl}/widget.js"></script>
<script>
  AIChatbot.init({
    apiKey: "${apiKey || 'ORG_YOUR_API_KEY_HERE'}",
    userId: "{{YOUR_LOGGED_IN_USER_ID}}",
    userName: "{{YOUR_LOGGED_IN_USER_NAME}}",
    apiUrl: "${hostUrl}"
  });
</script>`;

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
    <div style={{ maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '32px' }}>
      
      {/* Toast Alert */}
      {toast && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          background: toast.type === 'success' ? '#10B981' : '#EF4444',
          color: 'white',
          padding: '12px 24px',
          borderRadius: '10px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
          zIndex: 100000,
          animation: 'fadeInUp 0.3s ease-out',
          fontWeight: '600'
        }}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div>
        <h1 className="dashboard-title" style={{ fontSize: '2.2rem', fontWeight: '800', textAlign: 'left', marginBottom: '8px' }}>
          Widget Integrations
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>Configure embeddable chat widgets for external applications.</p>
      </div>

      {/* API Key Box */}
      <div className="glass-card" style={{
        padding: '28px',
        background: 'linear-gradient(135deg, rgba(30, 41, 59, 0.7), rgba(15, 23, 42, 0.7))',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '4px' }}>Organization API Key</h3>
            <span style={{ fontSize: '0.85rem', color: '#10B981', fontWeight: '600' }}>Active Organization</span>
          </div>
          <button 
            onClick={() => setShowScriptModal(true)}
            className="action-btn"
            style={{ padding: '8px 16px', background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.3)', color: 'var(--secondary)' }}
          >
            📋 View Embed Script
          </button>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: 'rgba(0,0,0,0.2)',
          padding: '14px 18px',
          borderRadius: '10px',
          border: '1px solid rgba(255, 255, 255, 0.05)'
        }}>
          <code style={{
            flex: 1,
            fontSize: '1rem',
            letterSpacing: '1px',
            color: revealKey ? '#F1F5F9' : 'var(--text-muted)',
            fontFamily: 'monospace'
          }}>
            {revealKey ? apiKey : apiKey.replace(/(?<=.{4}).(?=.{4})/g, '*')}
          </code>
          <button
            onClick={() => setRevealKey(!revealKey)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'white' }}
            title={revealKey ? "Hide API Key" : "Show API Key"}
          >
            {revealKey ? '👁️' : '🕶️'}
          </button>
          <button
            onClick={() => copyToClipboard(apiKey, 'API Key')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.2rem', color: 'white' }}
            title="Copy API Key"
          >
            📋
          </button>
        </div>

        <div style={{ color: '#EF4444', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          ⚠️ <strong>Keep this key secret.</strong> Anyone with this key can query your chatbot or access retrieval systems.
        </div>
      </div>

      {/* Integrations Table Section */}
      <div className="glass-card" style={{ padding: '24px', borderRadius: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Active Integrations</h3>
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="action-btn"
            style={{ background: 'var(--primary)', color: 'white', border: 'none' }}
          >
            + Create Integration
          </button>
        </div>

        {integrations.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
            No integrations created yet. Click "Create Integration" to configure your first widget.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                <th style={{ padding: '12px' }}>Name</th>
                <th style={{ padding: '12px' }}>Origins</th>
                <th style={{ padding: '12px' }}>Status</th>
                <th style={{ padding: '12px' }}>Created</th>
                <th style={{ padding: '12px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {integrations.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', fontSize: '0.9rem' }}>
                  <td style={{ padding: '16px 12px', fontWeight: '600' }}>{item.name}</td>
                  <td style={{ padding: '16px 12px' }}>
                    {item.allowed_origins.length === 0 ? (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', background: 'rgba(255,255,255,0.05)', padding: '2px 6px', borderRadius: '4px' }}>All (*)</span>
                    ) : (
                      item.allowed_origins.map((org, index) => (
                        <span key={index} style={{ background: 'rgba(99, 102, 241, 0.1)', color: 'var(--secondary)', padding: '2px 8px', borderRadius: '4px', marginRight: '6px', fontSize: '0.8rem' }}>
                          {org}
                        </span>
                      ))
                    )}
                  </td>
                  <td style={{ padding: '16px 12px' }}>
                    <span style={{
                      padding: '4px 10px',
                      borderRadius: '12px',
                      fontSize: '0.75rem',
                      fontWeight: '700',
                      background: item.is_active ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                      color: item.is_active ? '#10B981' : '#EF4444'
                    }}>
                      {item.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td style={{ padding: '16px 12px', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                    {new Date(item.created_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                    <button 
                      onClick={() => handleEditInit(item)}
                      style={{ background: 'none', border: 'none', color: 'var(--secondary)', marginRight: '16px', cursor: 'pointer', fontWeight: '600' }}
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDelete(item.id)}
                      style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontWeight: '600' }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.6)', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '450px', padding: '28px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '20px' }}>Create Integration</h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Integration Name</label>
                <input
                  type="text"
                  placeholder="e.g. Spring Boot Portal"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ padding: '10px 14px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: 'white', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Allowed Origins (CORS)</label>
                <input
                  type="text"
                  placeholder="e.g. http://localhost:8080, https://app.company.com"
                  value={newOrigins}
                  onChange={(e) => setNewOrigins(e.target.value)}
                  style={{ padding: '10px 14px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: 'white', outline: 'none' }}
                />
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Comma separated. Leave empty to allow all origins (*) during V1 setup.</span>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="submit" className="action-btn" style={{ flex: 1, background: 'var(--primary)', border: 'none', color: 'white' }}>
                  Create
                </button>
                <button type="button" onClick={() => setShowCreateModal(false)} className="action-btn" style={{ flex: 1, background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.6)', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '450px', padding: '28px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '20px' }}>Edit Integration</h3>
            <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Integration Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  style={{ padding: '10px 14px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: 'white', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Allowed Origins (CORS)</label>
                <input
                  type="text"
                  value={editOrigins}
                  onChange={(e) => setEditOrigins(e.target.value)}
                  style={{ padding: '10px 14px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: 'white', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  id="edit_active_check"
                  checked={editActive}
                  onChange={(e) => setEditActive(e.target.checked)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <label htmlFor="edit_active_check" style={{ fontSize: '0.9rem', cursor: 'pointer' }}>Active (Allows widget traffic)</label>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="submit" className="action-btn" style={{ flex: 1, background: 'var(--primary)', border: 'none', color: 'white' }}>
                  Save Changes
                </button>
                <button type="button" onClick={() => setShowEditModal(false)} className="action-btn" style={{ flex: 1, background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EMBED SCRIPT MODAL */}
      {showScriptModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.6)', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '650px', padding: '28px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h3 style={{ fontSize: '1.3rem', fontWeight: '700' }}>Embed Chatbot Widget</h3>
              <button 
                onClick={() => setShowScriptModal(false)} 
                style={{ background: 'none', border: 'none', color: 'white', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                &times;
              </button>
            </div>

            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Copy the code block below and paste it in the body section of any webpage or application dashboard where you want to embed the floating chat widget.
            </p>

            <div style={{ position: 'relative', marginBottom: '16px' }}>
              <pre style={{
                background: 'rgba(0,0,0,0.4)',
                border: '1px solid rgba(255,255,255,0.08)',
                padding: '16px',
                borderRadius: '8px',
                color: '#818cf8',
                fontSize: '0.85rem',
                fontFamily: 'monospace',
                overflowX: 'auto',
                lineHeight: '1.5'
              }}>
                {embedScript}
              </pre>
              <button
                onClick={() => copyToClipboard(embedScript, 'Embed script')}
                className="action-btn"
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  background: 'rgba(99, 102, 241, 0.2)',
                  border: '1px solid rgba(99, 102, 241, 0.3)',
                  color: 'white',
                  padding: '4px 10px',
                  fontSize: '0.75rem'
                }}
              >
                Copy Code
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.03)', padding: '12px', borderRadius: '8px', borderLeft: '4px solid var(--primary)' }}>
              ℹ️ <strong>Deployment Instruction:</strong> Replace <code>{"{{YOUR_LOGGED_IN_USER_ID}}"}</code> with your application's logged-in user ID. This links their session to their custom document access scoped in the database.
            </div>

            <div style={{ textAlign: 'right', marginTop: '20px' }}>
              <button onClick={() => setShowScriptModal(false)} className="action-btn" style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '8px 24px' }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
