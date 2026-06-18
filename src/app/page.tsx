'use client';

import { useState, useEffect, useRef } from 'react';

interface Message {
  role: 'assistant' | 'user' | 'system';
  content: string;
}

function renderTableBlock(rows: string[][], key: string) {
  // Check if rows contain a separator row like |---|---|
  const filteredRows = rows.filter(row => {
    const rowStr = row.join('');
    return !/^[:\-\s\d|]+$/.test(rowStr) || rowStr.trim() === '';
  });

  if (filteredRows.length === 0) return null;

  const headerRow = filteredRows[0];
  const bodyRows = filteredRows.slice(1);

  return (
    <div key={key} className="table-responsive-chat" style={{ overflowX: 'auto', margin: '12px 0' }}>
      <table style={{
        width: '100%',
        borderCollapse: 'collapse',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        fontSize: '0.8rem',
        borderRadius: '8px',
        overflow: 'hidden'
      }}>
        <thead>
          <tr style={{ background: 'rgba(255, 255, 255, 0.06)' }}>
            {headerRow.map((cell, cellIdx) => (
              <th key={`th-${cellIdx}`} style={{
                padding: '6px 10px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                textAlign: 'left',
                fontWeight: '600',
                color: 'var(--text-primary)'
              }}>
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bodyRows.map((row, rowIdx) => (
            <tr key={`tr-${rowIdx}`} style={{
              background: rowIdx % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.02)'
            }}>
              {row.map((cell, cellIdx) => (
                <td key={`td-${cellIdx}`} style={{
                  padding: '6px 10px',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  color: 'var(--text-secondary)'
                }}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderMessageContent(content: string) {
  const lines = content.split('\n');
  const renderedElements: React.ReactNode[] = [];
  
  let currentTable: string[][] = [];
  let inTable = false;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    const isTableLine = line.trim().startsWith('|');

    if (isTableLine) {
      if (!inTable) {
        inTable = true;
        currentTable = [];
      }
      const cells = line.split('|').map(c => c.trim());
      if (cells.length > 2) {
        const rowCells = cells.slice(1, -1);
        currentTable.push(rowCells);
      }
    } else {
      if (inTable) {
        renderedElements.push(renderTableBlock(currentTable, `table-${idx}`));
        inTable = false;
        currentTable = [];
      }
      
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith('-') || trimmedLine.startsWith('*')) {
        renderedElements.push(
          <li key={`list-${idx}`} style={{ marginLeft: '16px', marginBottom: '4px', listStyleType: 'disc', color: 'var(--text-secondary)' }}>
            {trimmedLine.substring(1).trim()}
          </li>
        );
      } else if (/^\d+\./.test(trimmedLine)) {
        renderedElements.push(
          <div key={`ol-${idx}`} style={{ marginLeft: '16px', marginBottom: '4px', color: 'var(--text-secondary)' }}>
            {trimmedLine}
          </div>
        );
      } else if (trimmedLine !== '') {
        renderedElements.push(
          <p key={`p-${idx}`} style={{ marginBottom: '8px' }}>
            {line}
          </p>
        );
      }
    }
  }

  if (inTable && currentTable.length > 0) {
    renderedElements.push(renderTableBlock(currentTable, `table-end`));
  }

  return <div style={{ display: 'flex', flexDirection: 'column' }}>{renderedElements}</div>;
}


export default function Home() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Hello! I am your C-DAC Revival Disaster Recovery Assistant. Ask me anything about our DR products, replication modes, architectures, or case studies!'
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ollamaStatus, setOllamaStatus] = useState<'loading' | 'online' | 'offline'>('loading');
  const [selectedModel, setSelectedModel] = useState('');
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  
  // Authentication & Session state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [showLoginForm, setShowLoginForm] = useState(false);
  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Session Handling: Check current session from the server
  const checkAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth');
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated) {
          setIsAuthenticated(true);
          setUsername(data.user);
          
          // Dynamically adjust greeting message if authenticated
          setMessages([
            {
              role: 'assistant',
              content: 'Hello, demo! I am your C-DAC Revival Disaster Recovery Assistant. Having loaded your profile, I can answer queries about your assigned staging appliances, contacts, custom drill schedules, and general DR products.'
            }
          ]);
        } else {
          setIsAuthenticated(false);
          setUsername('');
        }
      }
    } catch (e) {
      console.error('Failed to check auth status:', e);
    }
  };

  // Fetch Ollama connection status and active model
  const checkOllamaStatus = async () => {
    try {
      const res = await fetch('/api/chat');
      const data = await res.json();
      if (data.status === 'online') {
        setOllamaStatus('online');
        const models = data.models || [];
        setAvailableModels(models);
        
        // Retrieve last selected model from local storage if it exists and is still valid
        const savedModel = localStorage.getItem('selected_ollama_model');
        if (savedModel && models.includes(savedModel)) {
          setSelectedModel(savedModel);
        } else {
          setSelectedModel(data.selectedModel || 'llama3');
        }
      } else {
        setOllamaStatus('offline');
      }
    } catch (e) {
      setOllamaStatus('offline');
    }
  };

  useEffect(() => {
    checkOllamaStatus();
    checkAuthStatus();
  }, []);

  // Login/logout flow handler: Submit login details to /api/auth
  const handleLoginSubmit = async () => {
    if (!loginUsername.trim() || !loginPassword.trim()) {
      setLoginError('Please enter both username and password.');
      return;
    }

    setIsLoggingIn(true);
    setLoginError('');

    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'login',
          username: loginUsername,
          password: loginPassword,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setIsAuthenticated(true);
          setUsername(data.user);
          setShowLoginForm(false);
          setLoginUsername('');
          setLoginPassword('');
          
          // Clear current history and show personalized greeting
          setMessages([
            {
              role: 'assistant',
              content: 'Hello, demo! I am your C-DAC Revival Disaster Recovery Assistant. Having loaded your profile, I can answer queries about your assigned staging appliances, contacts, custom drill schedules, and general DR products.'
            },
            {
              role: 'system',
              content: 'Successfully authenticated as demo. User context loaded.'
            }
          ]);
        }
      } else {
        const data = await res.json().catch(() => ({}));
        setLoginError(data.error || 'Invalid username or password.');
      }
    } catch (error) {
      console.error('Login error:', error);
      setLoginError('Failed to authenticate. Please check server logs.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Login/logout flow handler: Logout session and clear authentication states
  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'logout' }),
      });

      if (res.ok) {
        setIsAuthenticated(false);
        setUsername('');
        
        // Clear chat and return to generic guest greeting
        setMessages([
          {
            role: 'assistant',
            content: 'Hello! I am your C-DAC Revival Disaster Recovery Assistant. Ask me anything about our DR products, replication modes, architectures, or case studies!'
          },
          {
            role: 'system',
            content: 'Logged out. Reverted to guest context.'
          }
        ]);
      }
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Auto scroll to bottom of chat
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleSendMessage = async (text: string) => {
    if (!text.trim() || isLoading) return;
    
    const userMessage: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [...messages, userMessage],
          model: selectedModel
        })
      });

      if (!response.ok) {
        let errText = 'Something went wrong. Please verify Ollama is active.';
        try {
          const data = await response.json();
          errText = data.error || errText;
          if (data.isOllamaOffline) {
            setOllamaStatus('offline');
          }
        } catch (_) {}
        
        setMessages(prev => [
          ...prev,
          { 
            role: 'system', 
            content: errText
          }
        ]);
        setIsLoading(false);
        return;
      }

      const activeModelHeader = response.headers.get('x-selected-model');
      if (activeModelHeader) {
        setSelectedModel(activeModelHeader);
        setOllamaStatus('online');
      }

      // Add a placeholder message for the assistant
      setMessages(prev => [...prev, { role: 'assistant', content: '' }]);

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No readable stream reader available on response body');
      }
      const decoder = new TextDecoder();
      let assistantContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value, { stream: true });
        assistantContent += chunk;
        
        setMessages(prev => {
          const updated = [...prev];
          if (updated.length > 0) {
            updated[updated.length - 1] = { role: 'assistant', content: assistantContent };
          }
          return updated;
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [
        ...prev,
        { 
          role: 'system', 
          content: 'Failed to contact server. Please check your network or server logs.' 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestionClick = (question: string) => {
    handleSendMessage(question);
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSendMessage(inputValue);
    }
  };

  const clearChat = () => {
    setMessages([
      {
        role: 'assistant',
        content: 'Chat cleared. Ask me any question regarding C-DAC Revival DR products.'
      }
    ]);
  };

  const suggestions = [
    "What is C-DAC Revival Sync?",
    "What is the maximum recommended distance for Optimal-DR?",
    "Tell me about the NSDG Delhi Case Study.",
    "What are the cost saving benefits?",
    "What databases are supported by C-DAC DR?"
  ];

  return (
    <main style={{ position: 'relative', minHeight: '100vh' }}>
      {/* Top Navbar */}
      <nav className="top-navbar">
        <div className="navbar-brand">
          <div className="navbar-logo">DR</div>
          <span>C-DAC Revival Portal</span>
        </div>
        <div className="navbar-actions">
          {isAuthenticated ? (
            <div className="user-profile-badge">
              <span className="user-status-dot online"></span>
              <span className="user-name">Admin: {username}</span>
              <button onClick={handleLogout} className="navbar-btn logout">
                Logout
              </button>
            </div>
          ) : (
            <div className="user-profile-badge">
              <span className="user-status-dot"></span>
              <span className="user-name">Guest Mode</span>
              <button onClick={() => setShowLoginForm(true)} className="navbar-btn login">
                Sign In
              </button>
            </div>
          )}
        </div>
      </nav>
      {/* Decorative Glow Backgrounds */}
      <div className="glow-bg">
        <div className="glow-circle-1"></div>
        <div className="glow-circle-2"></div>
      </div>

      <div className="dashboard-container">
        {/* Header */}
        <header className="dashboard-header">
          <span className="badge">Data Availability & Continuity</span>
          <h1 className="dashboard-title">C-DAC Revival DR Product Family</h1>
          <p className="dashboard-subtitle">
            Indigenously developed, award-winning disaster recovery & replication solutions ensuring near-zero RPO and negligible RTO for enterprise and e-Gov applications.
          </p>
        </header>

        {/* Patent & Accolades summary bar */}
        <div className="glass-card" style={{ marginBottom: '50px', padding: '20px', borderLeft: '4px solid var(--secondary)' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px', justifyContent: 'space-around', alignItems: 'center' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Indian Patent</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--secondary)' }}>Granted (No. 321137)</div>
            </div>
            <div style={{ height: '30px', width: '1px', background: 'var(--border-color)', display: 'block' }}></div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>R & D Award</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--accent)' }}>DG R & D Award (2016)</div>
            </div>
            <div style={{ height: '30px', width: '1px', background: 'var(--border-color)', display: 'block' }}></div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Innovation Award</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: 'var(--primary)' }}>NASSCOM Runner Up (2012)</div>
            </div>
            <div style={{ height: '30px', width: '1px', background: 'var(--border-color)', display: 'block' }}></div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Compliance</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#10B981' }}>ISMS (ISO 27001) Compliant</div>
            </div>
          </div>
        </div>

        {/* Section: Block Replicator Ranges */}
        <section style={{ marginBottom: '60px' }}>
          <h2 className="section-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line><line x1="15" y1="3" x2="15" y2="21"></line><line x1="3" y1="9" x2="21" y2="9"></line><line x1="3" y1="15" x2="21" y2="15"></line></svg>
            C-DAC Revival Block Replicator
          </h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', lineHeight: '1.6' }}>
            Best suited for database-intensive e-Gov and Business applications. It uses iSCSI over TCP/IP to provide block replication at remote sites, interoperating with legacy SAN systems.
          </p>
          <div className="grid-cards">
            <div className="glass-card">
              <div className="card-icon">⚡</div>
              <h3 className="card-title">C-DAC Revival Sync</h3>
              <p className="card-desc">
                Real-time synchronous block replication over IP networks located within 50 km. Delivers absolute zero data loss (RPO) and immediate failover capabilities.
              </p>
            </div>
            <div className="glass-card">
              <div className="card-icon">🌐</div>
              <h3 className="card-title">C-DAC Revival Semi-Sync/Async</h3>
              <p className="card-desc">
                Real-time replication over WAN distances (unlimited range). Offers negligible RPO bounded strictly by network latency, featuring data compression.
              </p>
            </div>
            <div className="glass-card">
              <div className="card-icon">🛡️</div>
              <h3 className="card-title">C-DAC Revival Optimal DR</h3>
              <p className="card-desc">
                Combination of sync and semi-sync block replication utilizing a three-tier architecture (DC, Staging Appliance, and DR) to deliver zero RPO over WAN.
              </p>
            </div>
          </div>
        </section>

        {/* Section: Product Comparison Table */}
        <section style={{ marginBottom: '60px' }}>
          <h2 className="section-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--secondary)' }}><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
            Comparison Matrix
          </h2>
          <div className="table-container">
            <table className="table-dr">
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>C-DAC Revival Sync</th>
                  <th>C-DAC Revival Semi-Sync/Async</th>
                  <th>C-DAC Revival Optimal-DR</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="table-feature-title">Replication Type</td>
                  <td>Synchronous</td>
                  <td>Semi-Synchronous / Asynchronous</td>
                  <td>Combination with re-compression technique</td>
                </tr>
                <tr>
                  <td className="table-feature-title">Replication Support</td>
                  <td>Two-way (Forward & Reverse)</td>
                  <td>Two-way (Forward & Reverse)</td>
                  <td>Two-way (Forward & Reverse)</td>
                </tr>
                <tr>
                  <td className="table-feature-title">Architecture Type</td>
                  <td>2 site (DC & DR agents)</td>
                  <td>2 site (DC & DR agents)</td>
                  <td>3 site (DC, SA & DR agents)</td>
                </tr>
                <tr>
                  <td className="table-feature-title">Max Distance</td>
                  <td>50 Kilometers</td>
                  <td>Unlimited</td>
                  <td>Unlimited</td>
                </tr>
                <tr>
                  <td className="table-feature-title">RPO (Data Loss)</td>
                  <td style={{ color: '#10B981', fontWeight: '600' }}>Zero</td>
                  <td>Negligible (Network latency bound)</td>
                  <td style={{ color: '#10B981', fontWeight: '600' }}>Zero</td>
                </tr>
                <tr>
                  <td className="table-feature-title">RTO (Recovery Time)</td>
                  <td>Negligible (Latency bound)</td>
                  <td>Negligible (Latency bound)</td>
                  <td>Negligible (Latency bound)</td>
                </tr>
                <tr>
                  <td className="table-feature-title">Failover & Failback</td>
                  <td>Automated via C-DAC DRM</td>
                  <td>Automated via C-DAC DRM</td>
                  <td>Automated via C-DAC DRM</td>
                </tr>
                <tr>
                  <td className="table-feature-title">WAN Optimization</td>
                  <td>N/A</td>
                  <td>Data Compression & Recompression</td>
                  <td>Data Compression & Recompression</td>
                </tr>
                <tr>
                  <td className="table-feature-title">Database Integration</td>
                  <td>iSCSI device drivers</td>
                  <td>iSCSI device drivers</td>
                  <td>iSCSI device drivers</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section: Flat-File & Other Solutions */}
        <section style={{ marginBottom: '60px' }}>
          <h2 className="section-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            Complementary Recovery Solutions
          </h2>
          <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <div className="glass-card">
              <h3 className="card-title" style={{ fontSize: '1.15rem' }}>Flat-File Backup</h3>
              <p className="card-desc" style={{ fontSize: '0.85rem' }}>
                Platform-independent file level replication. Lightweight agent captures recent transactions periodically, maintaining high data integrity checks.
              </p>
            </div>
            <div className="glass-card">
              <h3 className="card-title" style={{ fontSize: '1.15rem' }}>Revival as a Service (Cloud)</h3>
              <p className="card-desc" style={{ fontSize: '0.85rem' }}>
                Multi-tenant SaaS model interoperable with VMWare, OpenStack, Eucalyptus, XCP-NG and Microsoft Hyper-V. Based on TCP/iSCSI protocol.
              </p>
            </div>
            <div className="glass-card">
              <h3 className="card-title" style={{ fontSize: '1.15rem' }}>C-DAC DRM Console</h3>
              <p className="card-desc" style={{ fontSize: '0.85rem' }}>
                Disaster Recovery Management web portal. Automates drills (Normal, Reverse, Switchover/back), supports RBAC, MFA, and SMS/Email critical alerts.
              </p>
            </div>
            <div className="glass-card">
              <h3 className="card-title" style={{ fontSize: '1.15rem' }}>Active-Active Replicator</h3>
              <p className="card-desc" style={{ fontSize: '0.85rem' }}>
                Bidirectional asynchronous database replication designed for cross-platform DB applications having active loads at both DC and DR sites.
              </p>
            </div>
          </div>
        </section>

        {/* Section: Technical Details & Cost Savings */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '30px', marginBottom: '60px' }}>
          <section className="glass-card">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: 'var(--secondary)' }}>⚙️</span> Key Technical Capabilities
            </h3>
            <ul className="bullet-list" style={{ marginTop: '16px' }}>
              <li>Supports Oracle, PostgreSQL, MSSQL, MySQL, and MongoDB Replica Sets (with/without shards).</li>
              <li>Replicates structured database block data and unstructured flat files.</li>
              <li>Bidirectional replication: forward (DC to DR) and reverse (DR to DC) for quick restoration.</li>
              <li>Guarantees ordered data delivery of write operations.</li>
              <li>Multi-factor authentication (MFA) and Role-Based Access Control (RBAC) in DRM dashboard.</li>
            </ul>
          </section>
          <section className="glass-card">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ color: 'var(--accent)' }}>💰</span> Cost Optimization
            </h3>
            <ul className="bullet-list" style={{ marginTop: '16px' }}>
              <li><strong>Zero Dedicated WAN Infrastructure:</strong> Replication is supported over standard Ethernet/IP networks, avoiding costly fiber leases.</li>
              <li><strong>Generic Hardware:</strong> Operates efficiently on commodity servers, SAN boxes, and standard network equipment.</li>
              <li><strong>Multi-Tenancy sharing:</strong> Cuts overall licensing costs by serving multiple application databases via unified SaaS structures.</li>
            </ul>
          </section>
        </div>

        {/* Section: Case Studies */}
        <section style={{ marginBottom: '60px' }}>
          <h2 className="section-title">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--primary)' }}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
            Successful Deployments & Case Studies
          </h2>
          <div className="case-study-grid">
            <div className="case-study-card">
              <span className="case-study-badge">e-Gov NSDG</span>
              <h3 className="case-study-title">National Service Delivery Gateway (NSDG)</h3>
              <p className="case-study-desc">
                In production since June 2012 spanning Laxmi Nagar DC (Delhi), NDC Staging (Shastri Park, Delhi), and NIC DR (Hyderabad). Deployed under ISO 27001 security standards, this setup successfully survived three real disaster outages: waterlogging at LNDC, network outages, and load balancer failures.
              </p>
              <div className="case-study-highlights">
                <div className="highlight-tag">Recovery RPO: <strong>Zero Data Loss</strong></div>
                <div className="highlight-tag">Recovery RTO: <strong>30 mins to 2 hrs</strong></div>
                <div className="highlight-tag">Status: <strong>Active Production</strong></div>
              </div>
            </div>
            
            <div className="case-study-card">
              <span className="case-study-badge">Defense / Marine</span>
              <h3 className="case-study-title">Long Range Identification & Tracking (LRIT)</h3>
              <p className="case-study-desc">
                Automated backup, replication, and recovery between DC (NDC Navbhavan, Mumbai) and DR (IMAC, Gurgaon). Deployed alongside DRM software, it complies with NCIIPC and ISMS security requirements, and is routinely verified with automated DR drills.
              </p>
              <div className="case-study-highlights">
                <div className="highlight-tag">DC: <strong>Mumbai</strong></div>
                <div className="highlight-tag">DR: <strong>Gurgaon</strong></div>
                <div className="highlight-tag">Security: <strong>NCIIPC & ISMS Compliant</strong></div>
              </div>
            </div>

            <div className="case-study-card">
              <span className="case-study-badge">State Cloud SaaS</span>
              <h3 className="case-study-title">SDC Maharashtra to NDC Pune Cloud</h3>
              <p className="case-study-desc">
                Successful live PoC testing for 3 months hosting Maharashtra state portals (CMRF, Marathi Bhasha). The testing demonstrated switchover, switchback, failover, and failback with zero data loss. It received recommendation letters for suitability across other core state services.
              </p>
              <div className="case-study-highlights">
                <div className="highlight-tag">RPO: <strong>Zero</strong></div>
                <div className="highlight-tag">Drill Scenarios: <strong>Fully Automated</strong></div>
                <div className="highlight-tag">Applications: <strong>CMRF, RTI Online, MSRTC, GRAS</strong></div>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Floating Chat Trigger Button */}
      <button 
        className="chat-trigger-btn" 
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Toggle DR assistant chat"
      >
        {isOpen ? '✕' : '💬'}
      </button>

      {/* Floating Chat Panel */}
      {isOpen && (
        <div className="chat-widget-panel">
          {/* Header */}
          <div className="chat-header">
            <div className="chat-header-info">
              <div className="chat-avatar">DR</div>
              <div>
                <div className="chat-title-text">C-DAC DR Assistant</div>
                <div className="chat-status-indicator">
                  <div className={`status-dot ${ollamaStatus}`} />
                  <span>
                    {ollamaStatus === 'loading' && 'Checking Ollama...'}
                    {ollamaStatus === 'offline' && 'Ollama offline'}
                    {ollamaStatus === 'online' && (
                      <select
                        value={selectedModel}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedModel(val);
                          localStorage.setItem('selected_ollama_model', val);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          color: 'var(--text-secondary)',
                          fontSize: '0.75rem',
                          fontFamily: 'var(--font-sans)',
                          cursor: 'pointer',
                          outline: 'none',
                          padding: '0',
                          margin: '0',
                          fontWeight: '500'
                        }}
                      >
                        {availableModels.map((modelName) => (
                          <option key={modelName} value={modelName} style={{ background: '#1e293b', color: 'white' }}>
                            {modelName}
                          </option>
                        ))}
                      </select>
                    )}
                  </span>
                </div>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button 
                onClick={clearChat} 
                title="Clear Chat History"
                style={{
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)'
                }}
              >
                Clear
              </button>
              <button 
                className="chat-close-btn" 
                onClick={() => setIsOpen(false)}
                aria-label="Minimize Chat"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="chat-messages">
            {messages.map((msg, index) => (
              <div key={index} className={`message-bubble ${msg.role}`}>
                {msg.role === 'system' ? (
                  <div>
                    <strong>System: </strong>
                    {msg.content}
                  </div>
                ) : (
                  renderMessageContent(msg.content)
                )}
              </div>
            ))}
            
            {isLoading && (
              <div className="message-bubble assistant" style={{ width: '60px' }}>
                <div className="typing-indicator">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />

            {/* Quick Suggestions */}
            {messages.length <= 2 && !isLoading && (
              <div className="chat-suggestions">
                <span className="suggestion-title">Suggested Questions:</span>
                {suggestions.map((q, i) => (
                  <button 
                    key={i} 
                    className="suggestion-chip"
                    onClick={() => handleSuggestionClick(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="chat-input-container">
            <div className="chat-input-wrapper">
              <input
                type="text"
                className="chat-input"
                placeholder="Ask about C-DAC DR family..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={isLoading}
              />
              <button 
                className="chat-send-btn"
                onClick={() => handleSendMessage(inputValue)}
                disabled={!inputValue.trim() || isLoading}
                aria-label="Send Message"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Login Modal */}
      {showLoginForm && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <button 
              className="modal-close-btn"
              onClick={() => {
                setShowLoginForm(false);
                setLoginError('');
                setLoginUsername('');
                setLoginPassword('');
              }}
              title="Close Dialog"
            >
              ✕
            </button>
            <h3 className="login-form-title">Administrator Sign In</h3>
            <p className="login-form-subtitle">Enter credentials to unlock user.txt context</p>
            
            <div className="login-input-group">
              <label className="login-label">Username</label>
              <input
                type="text"
                className="login-input"
                placeholder="demo"
                value={loginUsername}
                onChange={(e) => setLoginUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLoginSubmit()}
                disabled={isLoggingIn}
              />
            </div>

            <div className="login-input-group">
              <label className="login-label">Password</label>
              <input
                type="password"
                className="login-input"
                placeholder="demo123"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLoginSubmit()}
                disabled={isLoggingIn}
              />
            </div>

            {loginError && <div className="login-error-msg">{loginError}</div>}

            <div className="login-form-actions">
              <button 
                onClick={handleLoginSubmit} 
                className="login-submit-btn" 
                disabled={isLoggingIn}
              >
                {isLoggingIn ? 'Verifying...' : 'Sign In'}
              </button>
              <button 
                onClick={() => {
                  setShowLoginForm(false);
                  setLoginError('');
                  setLoginUsername('');
                  setLoginPassword('');
                }} 
                className="login-cancel-btn"
                disabled={isLoggingIn}
              >
                Cancel
              </button>
            </div>
            
            <div className="login-credentials-tip">
              Demo credentials: <strong>demo</strong> / <strong>demo123</strong>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
