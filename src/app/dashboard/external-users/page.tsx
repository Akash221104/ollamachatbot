'use client';

import { useState, useEffect } from 'react';
import { Document } from '../../../types';

interface ExternalUser {
  id: string;
  external_user_id: string;
  name: string | null;
  documentCount: number;
  created_at: string;
}

export default function ExternalUsersPage() {
  const [externalUsers, setExternalUsers] = useState<ExternalUser[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals visibility state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ExternalUser | null>(null);
  
  // Form states
  const [createUserId, setCreateUserId] = useState('');
  const [createUserName, setCreateUserName] = useState('');
  const [checkedDocs, setCheckedDocs] = useState<Record<number, boolean>>({});
  
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchData = async () => {
    try {
      const usersRes = await fetch('/api/external-users');
      const docsRes = await fetch('/api/documents');
      
      if (usersRes.ok && docsRes.ok) {
        const usersData = await usersRes.json();
        const docsData = await docsRes.json();
        setExternalUsers(usersData.users || []);
        setDocuments(docsData.documents || []);
      } else {
        showToast('error', 'Failed to load external users or documents.');
      }
    } catch (err) {
      showToast('error', 'Network error connecting to administration APIs.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createUserId.trim()) {
      showToast('error', 'External User ID is required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/external-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          external_user_id: createUserId.trim(),
          name: createUserName.trim() || undefined
        })
      });

      if (res.ok) {
        showToast('success', `External user "${createUserId}" created successfully.`);
        setCreateUserId('');
        setCreateUserName('');
        setShowCreateModal(false);
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('error', err.error || 'Failed to create external user.');
      }
    } catch (err) {
      showToast('error', 'Network error creating external user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async (id: string, externalId: string) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to permanently delete external user "${externalId}"?\nThis action will also remove all their document assignments.`
    );
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/external-users/${id}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        showToast('success', 'External user deleted successfully.');
        fetchData();
      } else {
        showToast('error', 'Failed to delete external user.');
      }
    } catch (err) {
      showToast('error', 'Network error deleting external user.');
    }
  };

  const openAssignmentModal = async (user: ExternalUser) => {
    setSelectedUser(user);
    
    // Fetch currently assigned documents for this specific user
    try {
      const res = await fetch('/api/documents');
      if (res.ok) {
        const data = await res.json();
        const allDocs: Document[] = data.documents || [];
        
        // Find which documents have this user's assignment.
        // Wait, how do we know what documents are assigned?
        // Let's call GET /api/external-users. In GET, it lists external users with documentCount.
        // Wait! We can just fetch the assignments or do a checklist mapping.
        // Wait, does GET /api/external-users return assignments? No, it returns documentCount.
        // Let's check how we can know which document IDs are assigned to this external user.
        // We can modify the API or query user's assigned documents from documents list!
        // Actually, let's look at GET /api/documents output:
        // Admin sees all documents with assignedUsers. But these are internal users.
        // Let's fetch assigned documents for this external user by checking if their ID maps.
        // Or we can retrieve them by calling a simple query or modifying our GET /api/documents to return external users,
        // or we can fetch the user's assignments from a quick database check.
        // Let's look at the assignment POST route: POST /api/external-users/[id]/assign/route.ts
        // Wait! Let's check if we can query the database directly in a simple GET endpoint,
        // or we can write a quick custom endpoint or query it.
        // Wait, is there an endpoint to get assignments? We didn't define a GET for `/api/external-users/[id]/assign`.
        // Let's check: can we add a GET handler to `/api/external-users/[id]/assign/route.ts` to return assigned document IDs?
        // Yes, that is extremely clean! Let's do that!
        const assignRes = await fetch(`/api/external-users/${user.id}/assign`);
        const checkedMap: Record<number, boolean> = {};
        if (assignRes.ok) {
          const assignData = await assignRes.json();
          const docIds: number[] = assignData.documentIds || [];
          docIds.forEach(id => {
            checkedMap[id] = true;
          });
        }
        setCheckedDocs(checkedMap);
        setShowAssignModal(true);
      }
    } catch (err) {
      showToast('error', 'Failed to fetch assignments.');
    }
  };

  const handleCheckboxChange = (docId: number) => {
    setCheckedDocs((prev) => ({
      ...prev,
      [docId]: !prev[docId],
    }));
  };

  const handleAssignmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setSubmitting(true);
    
    // Extract list of selected document IDs
    const documentIds = Object.keys(checkedDocs)
      .map(id => parseInt(id, 10))
      .filter((id) => checkedDocs[id]);

    try {
      const res = await fetch(`/api/external-users/${selectedUser.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentIds }),
      });

      if (res.ok) {
        showToast('success', 'Document assignments updated successfully.');
        setShowAssignModal(false);
        setSelectedUser(null);
        fetchData();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('error', err.error || 'Failed to assign documents.');
      }
    } catch (err) {
      showToast('error', 'Network error assigning documents.');
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 className="dashboard-title" style={{ fontSize: '2.2rem', fontWeight: '800', textAlign: 'left', marginBottom: '8px' }}>
            External Users
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Manage external dashboard users and map their knowledge base retrieval access.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          style={{
            padding: '12px 24px',
            background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
            border: 'none',
            borderRadius: '10px',
            color: 'white',
            fontWeight: '600',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(99, 102, 241, 0.2)'
          }}
        >
          Create External User 👤+
        </button>
      </div>

      {/* Info Notice Banner */}
      <div className="glass-card" style={{
        padding: '16px 20px',
        borderLeft: '4px solid var(--primary)',
        background: 'rgba(99, 102, 241, 0.05)',
        fontSize: '0.9rem',
        color: 'var(--text-secondary)',
        lineHeight: '1.5'
      }}>
        ℹ️ <strong>Deployment Info:</strong> External users are created automatically when they first send a message via the embedded widget. You can also create them manually here to pre-assign documents before their first chat.
      </div>

      {/* External Users Table */}
      <div className="table-container">
        <table className="table-dr">
          <thead>
            <tr>
              <th>External User ID</th>
              <th>Display Name</th>
              <th style={{ textAlign: 'center' }}>Documents Assigned</th>
              <th>First Seen</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {externalUsers.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>
                  No external users found. Manually create one or initialize a session using widget.js.
                </td>
              </tr>
            ) : (
              externalUsers.map((u) => (
                <tr key={u.id}>
                  <td style={{ fontWeight: '600', color: 'white', fontFamily: 'monospace' }}>{u.external_user_id}</td>
                  <td>{u.name || <em style={{ color: 'var(--text-muted)' }}>No name provided</em>}</td>
                  <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{u.documentCount}</td>
                  <td>{new Date(u.created_at).toLocaleString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '10px' }}>
                      <button
                        onClick={() => openAssignmentModal(u)}
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
                        Assign Docs 📂☑
                      </button>
                      <button
                        onClick={() => handleDeleteUser(u.id, u.external_user_id)}
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
                        Delete 🗑️
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.6)', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '450px', padding: '28px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '20px' }}>Create External User</h3>
            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>External User ID</label>
                <input
                  type="text"
                  placeholder="e.g. 101 (must match host system ID exactly)"
                  value={createUserId}
                  onChange={(e) => setCreateUserId(e.target.value)}
                  required
                  style={{ padding: '10px 14px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: 'white', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. Akash"
                  value={createUserName}
                  onChange={(e) => setCreateUserName(e.target.value)}
                  style={{ padding: '10px 14px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px', color: 'white', outline: 'none' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                <button type="submit" className="action-btn" disabled={submitting} style={{ flex: 1, background: 'var(--primary)', border: 'none', color: 'white' }}>
                  {submitting ? 'Creating...' : 'Create'}
                </button>
                <button type="button" onClick={() => setShowCreateModal(false)} className="action-btn" style={{ flex: 1, background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white' }}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ASSIGN DOCS MODAL */}
      {showAssignModal && selectedUser && (
        <div className="modal-backdrop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0, 0, 0, 0.6)', zIndex: 1000 }}>
          <div className="glass-card" style={{ width: '500px', padding: '28px', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
            <h3 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '4px' }}>Assign Documents</h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Assign documents to external user: <strong>{selectedUser.name || selectedUser.external_user_id}</strong>
            </p>
            
            <form onSubmit={handleAssignmentSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{
                maxHeight: '260px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '16px',
                background: 'rgba(0, 0, 0, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
                borderRadius: '8px'
              }}>
                {documents.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', textAlign: 'center', fontSize: '0.9rem' }}>
                    No documents available in the system. Upload documents in the Documents tab first.
                  </div>
                ) : (
                  documents.map((doc) => (
                    <label
                      key={doc.id}
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
                        checked={!!checkedDocs[doc.id]}
                        onChange={() => handleCheckboxChange(doc.id)}
                        style={{
                          width: '18px',
                          height: '18px',
                          cursor: 'pointer',
                          accentColor: 'var(--primary)'
                        }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span>{doc.filename}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status: {doc.embedding_status}</span>
                      </div>
                    </label>
                  ))
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="submit" className="action-btn" disabled={submitting || documents.length === 0} style={{ flex: 1, background: 'var(--primary)', border: 'none', color: 'white' }}>
                  {submitting ? 'Saving Assignments...' : 'Save Assignments'}
                </button>
                <button type="button" onClick={() => { setShowAssignModal(false); setSelectedUser(null); }} className="action-btn" style={{ flex: 1, background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'white' }}>
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
