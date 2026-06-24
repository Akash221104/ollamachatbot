'use client';

import { useState, useEffect } from 'react';
import { ChatbotSettings } from '../../../types';

export default function SettingsPage() {
  const [name, setName] = useState('AI Assistant');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  
  // Toast notifications
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          const settings: ChatbotSettings = data.settings;
          setName(settings.name);
          setDescription(settings.description || '');
          setSystemPrompt(settings.system_prompt);
        } else {
          setErrorMsg('Failed to load settings from server.');
        }
      } catch (err) {
        setErrorMsg('Network error fetching settings.');
      } finally {
        setLoading(false);
      }
    }
    fetchSettings();
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      setSuccessMsg(message);
      setTimeout(() => setSuccessMsg(''), 4000);
    } else {
      setErrorMsg(message);
      setTimeout(() => setErrorMsg(''), 4000);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !systemPrompt.trim()) {
      showToast('error', 'Chatbot Name and System Prompt are required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description,
          system_prompt: systemPrompt
        })
      });

      if (res.ok) {
        showToast('success', 'Settings updated successfully.');
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('error', err.error || 'Failed to update settings.');
      }
    } catch (err) {
      showToast('error', 'Network error saving settings.');
    } finally {
      setSubmitting(false);
    }
  };

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
          Settings
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>Manage the system prompt and general chatbot metadata configurations.</p>
      </div>

      {successMsg && (
        <div className="glass-card" style={{ padding: '14px 20px', borderLeft: '4px solid #10B981', color: '#10B981', background: 'rgba(16, 185, 129, 0.1)', fontSize: '0.9rem' }}>
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="glass-card" style={{ padding: '14px 20px', borderLeft: '4px solid #EF4444', color: '#EF4444', background: 'rgba(239, 68, 68, 0.1)', fontSize: '0.9rem' }}>
          {errorMsg}
        </div>
      )}

      {/* Settings Form */}
      <div className="glass-card" style={{ padding: '32px', maxWidth: '800px' }}>
        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div className="login-input-group">
            <label className="login-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Chatbot Name</label>
            <input
              type="text"
              className="login-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="AI Assistant"
              required
              disabled={submitting}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                color: 'white',
                outline: 'none',
                transition: 'border-color 0.2s',
                fontFamily: 'var(--font-sans)'
              }}
            />
          </div>

          <div className="login-input-group">
            <label className="login-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Description</label>
            <input
              type="text"
              className="login-input"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Enterprise Multi-User RAG Portal Chatbot"
              disabled={submitting}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                color: 'white',
                outline: 'none',
                transition: 'border-color 0.2s',
                fontFamily: 'var(--font-sans)'
              }}
            />
          </div>

          <div className="login-input-group">
            <label className="login-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>System Prompt</label>
            <textarea
              className="login-input"
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are an enterprise AI assistant..."
              required
              disabled={submitting}
              rows={8}
              style={{
                width: '100%',
                padding: '16px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                color: 'white',
                outline: 'none',
                transition: 'border-color 0.2s',
                fontFamily: 'var(--font-sans)',
                lineHeight: '1.6',
                resize: 'vertical'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '16px', marginTop: '10px' }}>
            <button
              type="submit"
              className="login-submit-btn"
              disabled={submitting}
              style={{
                padding: '12px 28px',
                width: 'auto',
                background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                border: 'none',
                borderRadius: '10px',
                color: 'white',
                fontWeight: '600',
                cursor: submitting ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
              }}
            >
              {submitting ? 'Saving Settings...' : 'Save Settings 💾'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
