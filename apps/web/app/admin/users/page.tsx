'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Users,
  UserPlus,
  Shield,
  ShieldAlert,
  KeyRound,
  Check,
  Copy,
  Clock,
  Activity,
  AlertTriangle,
  Radio,
  Search,
  MessageSquare,
  RefreshCw,
  Eye,
} from 'lucide-react';
import { api, ApiError } from '../../../lib/api';
import type { SessionRead, UserRead, UserRole } from '../../../lib/types';
import { useAuthStore } from '../../../stores/authStore';

export default function AdminUsersPage() {
  const router = useRouter();
  const { currentUser, isLoading: isAuthLoading, checkAuth } = useAuthStore();

  const [users, setUsers] = useState<UserRead[]>([]);
  const [sessions, setSessions] = useState<SessionRead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Create user modal state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('user');
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // One-time password display modal
  const [oneTimePwModal, setOneTimePwModal] = useState<{
    isOpen: boolean;
    username: string;
    temporaryPassword: string;
    title: string;
  }>({
    isOpen: false,
    username: '',
    temporaryPassword: '',
    title: '',
  });
  const [copied, setCopied] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [userList, sessionList] = await Promise.all([
        api.adminListUsers(),
        api.adminListSessions(),
      ]);
      setUsers(userList);
      setSessions(sessionList);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to load user management data.');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth().then((user) => {
      if (!user) {
        router.push('/login');
      } else if (user.role !== 'admin') {
        router.push('/');
      } else {
        fetchData();
      }
    });
  }, [checkAuth, router, fetchData]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);

    try {
      const res = await api.adminCreateUser({
        username: newUsername.trim(),
        display_name: newDisplayName.trim() || undefined,
        role: newRole,
      });

      setIsCreateOpen(false);
      setNewUsername('');
      setNewDisplayName('');
      setNewRole('user');

      // Refresh list and display credentials
      await fetchData();
      setOneTimePwModal({
        isOpen: true,
        username: res.user.username,
        temporaryPassword: res.temporary_password,
        title: 'User Account Created',
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setCreateError(err.message);
      } else if (err instanceof Error) {
        setCreateError(err.message);
      } else {
        setCreateError('Could not create user.');
      }
    } finally {
      setCreateLoading(false);
    }
  };

  const handleToggleEnabled = async (user: UserRead) => {
    const nextState = !user.enabled;
    const action = nextState ? 'enable' : 'disable';
    if (user.id === currentUser?.id && !nextState) {
      alert('You cannot disable your own administrator account.');
      return;
    }

    if (!confirm(`Are you sure you want to ${action} user "${user.username}"?`)) {
      return;
    }

    try {
      await api.adminUpdateUser(user.id, { enabled: nextState });
      await fetchData();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : `Failed to ${action} user`);
    }
  };

  const handleResetPassword = async (user: UserRead) => {
    if (!confirm(`Generate a new temporary password for "${user.username}"? All active sessions will be terminated.`)) {
      return;
    }

    try {
      const res = await api.adminResetPassword(user.id);
      await fetchData();
      setOneTimePwModal({
        isOpen: true,
        username: user.username,
        temporaryPassword: res.temporary_password,
        title: 'Password Reset Generated',
      });
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to reset password');
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredUsers = users.filter((u) => {
    const term = searchTerm.toLowerCase();
    return (
      u.username.toLowerCase().includes(term) ||
      (u.display_name && u.display_name.toLowerCase().includes(term))
    );
  });

  if (isAuthLoading || (currentUser && currentUser.role !== 'admin')) {
    return (
      <div className="flex h-full items-center justify-center bg-bg-surface p-8">
        <div className="flex items-center gap-3 text-text-secondary">
          <RefreshCw className="w-5 h-5 animate-spin text-accent" />
          <span className="text-sm">Verifying institutional authorization...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex-1 overflow-y-auto bg-bg-surface p-6 sm:p-8">
      {/* Header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/50 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-950/40 border border-blue-800/40 text-blue-400">
              <Users className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
                Operator & Access Management
              </h1>
              <p className="text-xs text-text-secondary mt-0.5">
                Manage user accounts, assign role permissions, and supervise live authenticated sessions.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-text-secondary bg-[#171B22] hover:text-text-primary border border-border rounded-md hover:bg-[#1E232B] transition-colors"
            title="Refresh list"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-accent' : ''}`} />
            <span>Refresh</span>
          </button>

          <button
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-accent hover:bg-blue-500 rounded-md shadow-lg shadow-blue-600/20 active:scale-[0.98] transition-all"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create New User</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-950/40 border border-red-800/50 flex items-start gap-3 text-xs text-red-300">
          <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
          <div>
            <div className="font-semibold text-red-200">Institutional Access Error</div>
            <div className="mt-0.5">{error}</div>
          </div>
        </div>
      )}

      {/* Grid: Users Table & Active Sessions Oversight */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Users Directory */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-text-tertiary" />
              <input
                type="text"
                placeholder="Search username or display name..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-[#11141A] border border-border focus:border-accent text-text-primary text-xs rounded-md pl-8 pr-3 py-2 outline-none transition-colors"
              />
            </div>
            <span className="text-xs text-text-tertiary font-mono">
              {filteredUsers.length} user{filteredUsers.length === 1 ? '' : 's'} registered
            </span>
          </div>

          <div className="rounded-lg border border-border bg-[#11141A]/90 overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border/70 bg-[#171B22]/70 text-text-secondary font-medium">
                  <th className="py-3 px-4">Operator</th>
                  <th className="py-3 px-3">Role</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Last Login</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {filteredUsers.map((u) => {
                  const isCurrent = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="hover:bg-[#171B22]/50 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-blue-900/30 border border-blue-700/40 text-blue-300 flex items-center justify-center font-bold text-xs">
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-medium text-text-primary flex items-center gap-1.5">
                              <span>{u.display_name || u.username}</span>
                              {isCurrent && (
                                <span className="text-[10px] bg-blue-950 text-blue-400 border border-blue-800/60 px-1.5 py-0.2 rounded font-mono">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-text-tertiary">@{u.username}</div>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-3">
                        {u.role === 'admin' ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-purple-950/60 border border-purple-800/60 text-purple-300">
                            <Shield className="w-3 h-3 text-purple-400" />
                            ADMIN
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-slate-900 border border-slate-800 text-slate-300">
                            USER
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3">
                        {u.enabled ? (
                          <span className="inline-flex items-center gap-1 text-emerald-400 text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-rose-400 text-[11px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                            Disabled
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-3 text-text-secondary font-mono text-[11px]">
                        {u.last_login_at
                          ? new Date(u.last_login_at).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Never'}
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => router.push(`/?c_user=${encodeURIComponent(u.id)}`)}
                            className="p-1.5 text-text-tertiary hover:text-blue-400 hover:bg-blue-950/30 rounded border border-transparent hover:border-blue-900/40 transition-colors"
                            title={`Inspect ${u.username}'s chats`}
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleResetPassword(u)}
                            className="p-1.5 text-text-tertiary hover:text-amber-400 hover:bg-amber-950/30 rounded border border-transparent hover:border-amber-900/40 transition-colors"
                            title="Reset password to temporary credential"
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                          </button>

                          {!isCurrent && (
                            <button
                              onClick={() => handleToggleEnabled(u)}
                              className={`p-1.5 rounded border border-transparent transition-colors ${
                                u.enabled
                                  ? 'text-text-tertiary hover:text-rose-400 hover:bg-rose-950/30 hover:border-rose-900/40'
                                  : 'text-text-tertiary hover:text-emerald-400 hover:bg-emerald-950/30 hover:border-emerald-900/40'
                              }`}
                              title={u.enabled ? 'Disable user account' : 'Enable user account'}
                            >
                              <ShieldAlert className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Col: Active Sessions Card */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-2">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Active Concurrent Sessions</span>
            </h2>
            <span className="text-xs font-mono text-emerald-400">
              {sessions.length} live
            </span>
          </div>

          <div className="rounded-lg border border-border bg-[#11141A]/90 p-4 shadow-sm flex flex-col gap-3">
            {sessions.length === 0 ? (
              <div className="py-6 text-center text-xs text-text-tertiary">
                No concurrent active sessions recorded.
              </div>
            ) : (
              sessions.map((sess) => (
                <div
                  key={sess.id}
                  className="p-3 rounded bg-[#171B22] border border-border/70 flex flex-col gap-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-text-primary flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      {sess.username || sess.user_id}
                    </span>
                    <span className="text-[10px] font-mono text-text-tertiary">
                      Sliding 12h
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-text-secondary font-mono">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-text-tertiary" />
                      Active:{' '}
                      {new Date(sess.last_seen_at).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                    <span className="text-text-tertiary">
                      Exp:{' '}
                      {new Date(sess.expires_at).toLocaleTimeString(undefined, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Modal: Create User */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-[#11141A] p-6 shadow-2xl">
            <h2 className="text-base font-bold text-text-primary mb-1">Provision New Operator</h2>
            <p className="text-xs text-text-secondary mb-4">
              Add a user account to the sovereign enclave with appropriate permissions.
            </p>

            {createError && (
              <div className="mb-4 p-3 rounded bg-red-950/40 border border-red-800/50 text-xs text-red-300">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">Username *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. s_engineer"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="bg-[#171B22] border border-border focus:border-accent text-text-primary text-xs rounded-md px-3 py-2 outline-none font-mono"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. Senior Thermal Specialist"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  className="bg-[#171B22] border border-border focus:border-accent text-text-primary text-xs rounded-md px-3 py-2 outline-none"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-medium text-text-secondary">Role & Authorization</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewRole('user')}
                    className={`py-2 px-3 rounded-md text-xs font-medium border text-left transition-colors ${
                      newRole === 'user'
                        ? 'bg-blue-950/50 border-blue-600 text-blue-300'
                        : 'bg-[#171B22] border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <div className="font-semibold">Regular User</div>
                    <div className="text-[10px] text-text-tertiary">Isolated chats & runs</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewRole('admin')}
                    className={`py-2 px-3 rounded-md text-xs font-medium border text-left transition-colors ${
                      newRole === 'admin'
                        ? 'bg-purple-950/50 border-purple-600 text-purple-300'
                        : 'bg-[#171B22] border-border text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    <div className="font-semibold">Administrator</div>
                    <div className="text-[10px] text-text-tertiary">Fleet & institutional oversight</div>
                  </button>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="px-4 py-2 text-xs font-semibold text-white bg-accent hover:bg-blue-500 rounded-md shadow-md disabled:opacity-50"
                >
                  {createLoading ? 'Generating Credential...' : 'Provision User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: One-Time Temporary Password Display */}
      {oneTimePwModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-lg border border-border bg-[#11141A] p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-emerald-400 mb-2">
              <KeyRound className="w-5 h-5" />
              <h2 className="text-base font-bold text-text-primary">{oneTimePwModal.title}</h2>
            </div>
            <p className="text-xs text-text-secondary mb-4">
              A temporary password has been established for operator{' '}
              <span className="font-mono text-text-primary font-semibold">
                {oneTimePwModal.username}
              </span>
              . Copy and share it securely. The operator will be required to change it on first login.
            </p>

            <div className="p-3 rounded bg-[#171B22] border border-border flex items-center justify-between gap-2 mb-6">
              <span className="font-mono text-base font-bold text-accent tracking-wider select-all">
                {oneTimePwModal.temporaryPassword}
              </span>
              <button
                onClick={() => handleCopy(oneTimePwModal.temporaryPassword)}
                className="p-1.5 text-text-secondary hover:text-white bg-bg-surface border border-border rounded flex items-center gap-1 text-xs"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-ok" />
                    <span className="text-ok">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setOneTimePwModal({ isOpen: false, username: '', temporaryPassword: '', title: '' })}
                className="px-4 py-2 text-xs font-semibold text-white bg-accent hover:bg-blue-500 rounded-md shadow-md"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
