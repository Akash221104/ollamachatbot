'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const errorParam = searchParams.get('error');
    if (errorParam === 'inactive') {
      setErrorMsg('Your account has been deactivated. Contact your administrator.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please fill in all fields.');
      return;
    }

    setLoading(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        const data = await res.json();
        const user = data.user;
        if (user.role === 'ADMIN') {
          router.push('/dashboard');
        } else {
          router.push('/chat');
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        if (errData.error === 'Account deactivated') {
          setErrorMsg('Your account has been deactivated. Contact your administrator.');
        } else {
          setErrorMsg('Invalid email or password.');
        }
      }
    } catch (err) {
      setErrorMsg('Failed to connect to authentication services.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="login-page-container" style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      padding: '20px',
      overflow: 'hidden'
    }}>
      {/* Dynamic Glow Circles */}
      <div className="glow-bg">
        <div className="glow-circle-1" style={{ width: '40vw', height: '40vw', top: '10%', right: '15%' }}></div>
        <div className="glow-circle-2" style={{ width: '45vw', height: '45vw', bottom: '5%', left: '10%' }}></div>
      </div>

      <div className="glass-card" style={{
        width: '100%',
        maxWidth: '420px',
        padding: '40px 32px',
        animation: 'fadeInUp 0.6s ease-out',
        display: 'flex',
        flexDirection: 'column',
        gap: '24px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
      }}>
        <div style={{ textAlign: 'center' }}>
          <span className="badge" style={{ marginBottom: '12px' }}>Enterprise Portal</span>
          <h1 className="login-form-title" style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '8px' }}>
            Company Sign In
          </h1>
          <p className="login-form-subtitle" style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            Enter your credentials to access your assigned documents
          </p>
        </div>

        {errorMsg && (
          <div className="login-error-msg" style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid rgba(239, 68, 68, 0.2)',
            color: '#F87171',
            padding: '12px 16px',
            borderRadius: '8px',
            fontSize: '0.85rem',
            lineHeight: '1.4',
            animation: 'fadeIn 0.3s ease'
          }}>
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div className="login-input-group">
            <label className="login-label" style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Email Address
            </label>
            <input
              type="email"
              className="login-input"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              required
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
            <label className="login-label" style={{ fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase', color: 'var(--text-secondary)' }}>
              Password
            </label>
            <input
              type="password"
              className="login-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              required
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

          <button
            type="submit"
            className="login-submit-btn"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
              border: 'none',
              borderRadius: '12px',
              color: 'white',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.3)',
              transition: 'transform 0.2s, box-shadow 0.2s',
              marginTop: '10px'
            }}
          >
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div className="login-credentials-tip" style={{
          textAlign: 'center',
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
          background: 'rgba(255, 255, 255, 0.02)',
          padding: '10px',
          borderRadius: '8px',
          border: '1px solid var(--border-color)'
        }}>
          Default Admin: <strong>admin@company.com</strong> / <strong>admin123</strong>
        </div>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
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
    }>
      <LoginForm />
    </Suspense>
  );
}
