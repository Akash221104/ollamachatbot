'use client';

import { useState, useEffect } from 'react';
import { Document, User } from '../../../types';

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Toast notifications
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Upload state
  const [uploading, setUploading] = useState(false);
  
  // Assignment Modal state
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [checkedUsers, setCheckedUsers] = useState<Record<string, boolean>>({});
  const [submittingAssign, setSubmittingAssign] = useState(false);

  const fetchData = async () => {
    try {
      const docRes = await fetch('/api/documents');
      const userRes = await fetch('/api/users');
      
      if (docRes.ok && userRes.ok) {
        const docData = await docRes.json();
        const userData = await userRes.json();
        setDocuments(docData.documents);
        setUsers(userData.users);
      } else {
        setErrorMsg('Failed to load documents or users data.');
      }
    } catch (err) {
      setErrorMsg('Network error connecting to APIs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.txt')) {
      showToast('error', 'Only .txt files are supported.');
      return;
    }

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        showToast('success', `File "${file.name}" uploaded successfully. Embeddings are processing.`);
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('error', err.error || 'Failed to upload document.');
      }
    } catch (err) {
      showToast('error', 'Network error during upload.');
    } finally {
      setUploading(false);
      // Clear input
      e.target.value = '';
    }
  };

  const handleDeleteDoc = async (docId: number, filename: string) => {
    const confirmDelete = window.confirm(
      `WARNING: This will permanently delete the document "${filename}", all its embeddings, and remove access for all assigned users.`
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        showToast('success', 'Document deleted successfully.');
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('error', err.error || 'Failed to delete document.');
      }
    } catch (err) {
      showToast('error', 'Network error deleting document.');
    }
  };

  const openAssignmentModal = (doc: Document) => {
    setSelectedDoc(doc);
    
    // Create mapping of currently checked users
    const checkedMap: Record<string, boolean> = {};
    if (doc.assignedUsers) {
      doc.assignedUsers.forEach((u) => {
        checkedMap[u.id] = true;
      });
    }
    
    setCheckedUsers(checkedMap);
    setShowAssignModal(true);
  };

  const handleCheckboxChange = (userId: string) => {
    setCheckedUsers((prev) => ({
      ...prev,
      [userId]: !prev[userId],
    }));
  };

  const handleAssignmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoc) return;

    setSubmittingAssign(true);
    
    // Extract list of selected user IDs
    const userIds = Object.keys(checkedUsers).filter((id) => checkedUsers[id]);

    try {
      const res = await fetch('/api/documents/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: selectedDoc.id,
          userIds,
        }),
      });

      if (res.ok) {
        showToast('success', 'Assignments updated successfully.');
        setShowAssignModal(false);
        setSelectedDoc(null);
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('error', err.error || 'Failed to assign users.');
      }
    } catch (err) {
      showToast('error', 'Network error assigning users.');
    } finally {
      setSubmittingAssign(false);
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="dashboard-title" style={{ fontSize: '2.2rem', fontWeight: '800', textAlign: 'left', marginBottom: '8px' }}>
            Documents
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>Upload knowledge base text documents and map user permissions.</p>
        </div>
        
        <div>
          <label
            style={{
              padding: '12px 24px',
              background: uploading ? 'var(--text-muted)' : 'linear-gradient(135deg, var(--primary), var(--secondary))',
              border: 'none',
              borderRadius: '10px',
              color: 'white',
              fontWeight: '600',
              cursor: uploading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)',
              display: 'inline-block'
            }}
          >
            {uploading ? 'Processing File...' : 'Upload Document 📂+'}
            <input
              type="file"
              accept=".txt"
              onChange={handleFileUpload}
              disabled={uploading}
              style={{ display: 'none' }}
            />
          </label>
        </div>
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

      {/* Documents table */}
      <div className="table-container">
        <table className="table-dr">
          <thead>
            <tr>
              <th>Filename</th>
              <th>Uploaded At</th>
              <th>Embedding Status</th>
              <th>Assigned Users</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>
                  No documents found. Upload a .txt file to begin.
                </td>
              </tr>
            ) : (
              documents.map((doc) => {
                const uploadDate = new Date(doc.created_at).toLocaleDateString();
                
                // Embedding Badge Styling
                let badgeBg = 'rgba(107, 114, 128, 0.15)';
                let badgeBorder = 'rgba(107, 114, 128, 0.3)';
                let badgeText = '#9CA3AF';
                let animationStyle: React.CSSProperties = {};

                if (doc.embedding_status === 'PROCESSING') {
                  badgeBg = 'rgba(59, 130, 246, 0.15)';
                  badgeBorder = 'rgba(59, 130, 246, 0.3)';
                  badgeText = '#60A5FA';
                  animationStyle = { animation: 'pulseGlow 2s infinite ease-in-out' };
                } else if (doc.embedding_status === 'COMPLETED') {
                  badgeBg = 'rgba(16, 185, 129, 0.15)';
                  badgeBorder = 'rgba(16, 185, 129, 0.3)';
                  badgeText = '#34D399';
                } else if (doc.embedding_status === 'FAILED') {
                  badgeBg = 'rgba(239, 110, 110, 0.15)';
                  badgeBorder = 'rgba(239, 110, 110, 0.3)';
                  badgeText = '#F87171';
                }

                const assignedList = doc.assignedUsers && doc.assignedUsers.length > 0
                  ? doc.assignedUsers.map((u) => u.name).join(', ')
                  : 'None';

                return (
                  <tr key={doc.id}>
                    <td style={{ fontWeight: '600', color: 'white' }}>{doc.filename}</td>
                    <td>{uploadDate}</td>
                    <td>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: badgeBg,
                        border: `1px solid ${badgeBorder}`,
                        color: badgeText,
                        fontSize: '0.8rem',
                        fontWeight: '600',
                        ...animationStyle
                      }}>
                        {doc.embedding_status}
                      </span>
                    </td>
                    <td style={{ maxWidth: '280px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={assignedList}>
                      {assignedList}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', gap: '10px' }}>
                        <button
                          onClick={() => openAssignmentModal(doc)}
                          style={{
                            background: 'transparent',
                            border: '1px solid var(--border-color)',
                            color: 'var(--secondary)',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            cursor: 'pointer',
                            fontSize: '0.8rem'
                          }}
                        >
                          Assign Users 👤☑
                        </button>
                        <button
                          onClick={() => handleDeleteDoc(doc.id, doc.filename)}
                          style={{
                            background: 'transparent',
                            border: '1px solid rgba(239, 68, 68, 0.2)',
                            color: '#EF4444',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            cursor: 'pointer',
                            fontSize: '0.8rem'
                          }}
                        >
                          Delete 🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal - Assign Users checklist */}
      {showAssignModal && selectedDoc && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <button className="modal-close-btn" onClick={() => { setShowAssignModal(false); setSelectedDoc(null); }}>✕</button>
            <h3 className="login-form-title">Assign Users</h3>
            <p className="login-form-subtitle">Assign access mapping for: <strong>{selectedDoc.filename}</strong></p>
            
            <form onSubmit={handleAssignmentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '16px' }}>
              <div style={{
                maxHeight: '260px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '12px',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid var(--border-color)',
                borderRadius: '8px'
              }}>
                {users.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9rem' }}>
                    No users available. Create users first in the Users tab.
                  </div>
                ) : (
                  users.map((u) => (
                    <label
                      key={u.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        cursor: 'pointer',
                        fontSize: '0.95rem',
                        color: 'var(--text-primary)'
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={!!checkedUsers[u.id]}
                        onChange={() => handleCheckboxChange(u.id)}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: 'pointer',
                          accentColor: 'var(--primary)'
                        }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span>{u.name}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{u.email} ({u.role})</span>
                      </div>
                    </label>
                  ))
                )}
              </div>

              <div className="login-form-actions">
                <button type="submit" className="login-submit-btn" disabled={submittingAssign || users.length === 0}>
                  {submittingAssign ? 'Saving Assignments...' : 'Save Assignments'}
                </button>
                <button type="button" className="login-cancel-btn" onClick={() => { setShowAssignModal(false); setSelectedDoc(null); }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
