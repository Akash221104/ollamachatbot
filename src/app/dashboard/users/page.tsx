'use client';

import { useState, useEffect } from 'react';
import { User } from '../../../types';

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modals visibility state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState(false);
  const [targetUserId, setTargetUserId] = useState<string | null>(null);

  // Form states
  const [createForm, setCreateForm] = useState({ name: '', email: '', password: '', role: 'USER' });
  const [newPassword, setNewPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users');
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
      } else {
        setErrorMsg('Failed to load users.');
      }
    } catch (err) {
      setErrorMsg('Error connecting to users API.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
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

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createForm.name.trim() || !createForm.email.trim() || !createForm.password.trim()) {
      showToast('error', 'Please fill in all fields.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm)
      });

      if (res.ok) {
        showToast('success', `User "${createForm.name}" created successfully.`);
        setCreateForm({ name: '', email: '', password: '', role: 'USER' });
        setShowCreateModal(false);
        fetchUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('error', err.error || 'Failed to create user.');
      }
    } catch (err) {
      showToast('error', 'Network error creating user.');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword.trim()) {
      showToast('error', 'Password cannot be empty.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${targetUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });

      if (res.ok) {
        showToast('success', 'Password reset successfully.');
        setNewPassword('');
        setShowResetModal(false);
        setTargetUserId(null);
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('error', err.error || 'Failed to reset password.');
      }
    } catch (err) {
      showToast('error', 'Network error resetting password.');
    } finally {
      setSubmitting(false);
    }
  };

  const toggleUserStatus = async (userId: string, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !currentStatus })
      });

      if (res.ok) {
        showToast('success', 'User status updated.');
        fetchUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('error', err.error || 'Failed to toggle status.');
      }
    } catch (err) {
      showToast('error', 'Network error toggling status.');
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });

      if (res.ok) {
        showToast('success', 'Role updated successfully.');
        fetchUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('error', err.error || 'Failed to update role.');
      }
    } catch (err) {
      showToast('error', 'Network error updating role.');
    }
  };

  const handleDeleteUser = async (userId: string, userEmail: string) => {
    const confirmDelete = window.confirm(`Are you sure you want to permanently delete user "${userEmail}"?\nThis action will also delete all their document assignments.`);
    if (!confirmDelete) return;

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE'
      });

      if (res.ok) {
        showToast('success', 'User deleted successfully.');
        fetchUsers();
      } else {
        const err = await res.json().catch(() => ({}));
        showToast('error', err.error || 'Failed to delete user.');
      }
    } catch (err) {
      showToast('error', 'Network error deleting user.');
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
            Users
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>Create new users, toggle access rights, and change account roles.</p>
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
          Create User 👤+
        </button>
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

      {/* Users table */}
      <div className="table-container">
        <table className="table-dr">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Status</th>
              <th style={{ textAlign: 'center' }}>Documents Assigned</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ fontWeight: '600', color: 'white' }}>{u.name}</td>
                <td>{u.email}</td>
                <td>
                  <select
                    value={u.role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      color: 'white',
                      padding: '4px 8px',
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                  >
                    <option value="USER" style={{ background: '#1e293b' }}>USER</option>
                    <option value="ADMIN" style={{ background: '#1e293b' }}>ADMIN</option>
                  </select>
                </td>
                <td>
                  <button
                    onClick={() => toggleUserStatus(u.id, u.is_active)}
                    style={{
                      background: u.is_active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      border: `1px solid ${u.is_active ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                      color: u.is_active ? '#34D399' : '#F87171',
                      borderRadius: '6px',
                      padding: '4px 10px',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    {u.is_active ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{u.documentCount ?? 0}</td>
                <td style={{ textAlign: 'right' }}>
                  <div style={{ display: 'inline-flex', gap: '10px' }}>
                    <button
                      onClick={() => {
                        setTargetUserId(u.id);
                        setShowResetModal(true);
                      }}
                      title="Reset Password"
                      style={{
                        background: 'transparent',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-secondary)',
                        borderRadius: '6px',
                        padding: '6px 12px',
                        cursor: 'pointer',
                        fontSize: '0.8rem'
                      }}
                    >
                      Reset PW 🔑
                    </button>
                    <button
                      onClick={() => handleDeleteUser(u.id, u.email)}
                      title="Delete User"
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
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal - Create User */}
      {showCreateModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <button className="modal-close-btn" onClick={() => setShowCreateModal(false)}>✕</button>
            <h3 className="login-form-title">Create New User</h3>
            <p className="login-form-subtitle">Add a member to the enterprise platform</p>
            
            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
              <div className="login-input-group">
                <label className="login-label">Full Name</label>
                <input
                  type="text"
                  className="login-input"
                  placeholder="John Doe"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  required
                />
              </div>

              <div className="login-input-group">
                <label className="login-label">Email Address</label>
                <input
                  type="email"
                  className="login-input"
                  placeholder="john@company.com"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  required
                />
              </div>

              <div className="login-input-group">
                <label className="login-label">Password</label>
                <input
                  type="password"
                  className="login-input"
                  placeholder="••••••••"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  required
                />
              </div>

              <div className="login-input-group">
                <label className="login-label">Role</label>
                <select
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value })}
                  className="login-input"
                  style={{ background: '#1e293b', border: '1px solid var(--border-color)', color: 'white', padding: '12px' }}
                >
                  <option value="USER">USER</option>
                  <option value="ADMIN">ADMIN</option>
                </select>
              </div>

              <div className="login-form-actions" style={{ marginTop: '10px' }}>
                <button type="submit" className="login-submit-btn" disabled={submitting}>
                  {submitting ? 'Creating...' : 'Create'}
                </button>
                <button type="button" className="login-cancel-btn" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal - Reset Password */}
      {showResetModal && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <button className="modal-close-btn" onClick={() => { setShowResetModal(false); setTargetUserId(null); }}>✕</button>
            <h3 className="login-form-title">Reset Password</h3>
            <p className="login-form-subtitle">Enter a new password for this user</p>
            
            <form onSubmit={handlePasswordReset} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
              <div className="login-input-group">
                <label className="login-label">New Password</label>
                <input
                  type="password"
                  className="login-input"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                />
              </div>

              <div className="login-form-actions" style={{ marginTop: '10px' }}>
                <button type="submit" className="login-submit-btn" disabled={submitting}>
                  {submitting ? 'Resetting...' : 'Reset'}
                </button>
                <button type="button" className="login-cancel-btn" onClick={() => { setShowResetModal(false); setTargetUserId(null); }}>
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
