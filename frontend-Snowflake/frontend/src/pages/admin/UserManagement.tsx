import { useEffect, useMemo, useState } from 'react';
import { BriefcaseBusiness, Check, Clock3, KeyRound, Power, RefreshCw, Search, ShieldAlert, Trash2, UserCheck, Users, X } from 'lucide-react';
import { clsx } from 'clsx';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface UserRow {
  id: number;
  name?: string;
  username: string;
  email: string;
  role: string;
  approval_status: string;
  is_active: boolean;
  organization_id?: number | null;
  organization_name?: string | null;
  team?: string | null;
  last_login?: string | null;
  created_at: string;
}

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const UserManagement = () => {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const fetchUsers = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { data } = await axios.get<UserRow[]>(`${API}/api/users/`, {
        headers: authHeaders(),
      });
      setUsers(data.filter((row) => row.role === 'user'));
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Unable to load users.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filtered = useMemo(() => {
    const needle = search.toLowerCase();
    return users.filter((row) =>
      [row.username, row.name, row.email, row.organization_name, row.team, row.role]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [users, search]);

  const toggleActive = async (row: UserRow) => {
    try {
      await axios.patch(
        `${API}/api/users/${row.id}/${row.is_active ? 'deactivate' : 'activate'}`,
        {},
        { headers: authHeaders() }
      );
      fetchUsers();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Unable to update user status.');
    }
  };

  const decideApproval = async (row: UserRow, decision: 'approve' | 'reject') => {
    try {
      await axios.patch(`${API}/api/users/${row.id}/${decision}`, {}, { headers: authHeaders() });
      fetchUsers();
    } catch (err: any) {
      alert(err?.response?.data?.detail || `Unable to ${decision} account.`);
    }
  };

  const resetPassword = async (row: UserRow) => {
    const newPassword = window.prompt(`New password for ${row.username}`);
    if (!newPassword) return;
    try {
      await axios.post(
        `${API}/api/users/${row.id}/reset-password`,
        { new_password: newPassword },
        { headers: authHeaders() }
      );
      alert('Password reset successfully.');
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Unable to reset password.');
    }
  };

  const updateTeam = async (row: UserRow) => {
    const team = window.prompt(`Team for ${row.username}:`, row.team || '');
    if (!team?.trim() || team.trim() === row.team) return;
    try {
      await axios.put(`${API}/api/users/${row.id}`, { team: team.trim() }, { headers: authHeaders() });
      fetchUsers();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Unable to update team.');
    }
  };

  const deleteUser = async (row: UserRow) => {
    if (!window.confirm(`Delete user ${row.username}? This action cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/api/users/${row.id}`, { headers: authHeaders() });
      fetchUsers();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Unable to delete user.');
    }
  };

  const activeCount = users.filter((row) => row.is_active).length;
  const pendingUsers = users.filter((row) => row.approval_status === 'PENDING');
  const rejectedCount = users.filter((row) => row.approval_status === 'REJECTED').length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-in fade-in zoom-in-95 duration-500 text-slate-900 dark:text-white">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">User Management</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Manage regular users in your authorized organization scope.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-72 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 outline-none transition focus:border-snowflake dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <button
            type="button"
            onClick={fetchUsers}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:hover:text-white"
            title="Refresh"
          >
            <RefreshCw className={clsx('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {pendingUsers.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm dark:border-amber-500/30 dark:bg-slate-800/50">
          <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-500/20 dark:bg-amber-500/10">
            <Clock3 className="h-5 w-5 text-amber-500" />
            <div>
              <h3 className="text-sm font-bold">Pending account approvals</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Review access requests before users can sign in.</p>
            </div>
            <span className="ml-auto rounded-full bg-amber-500 px-2.5 py-1 text-xs font-bold text-white">{pendingUsers.length}</span>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {pendingUsers.map((row) => (
              <div key={row.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center">
                <div>
                  <p className="text-sm font-semibold">{row.username}</p>
                  <p className="text-xs text-slate-500">{row.email}</p>
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-300">{row.organization_name} · {row.team || 'No team'}</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => decideApproval(row, 'reject')} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 dark:border-red-500/30 dark:text-red-300 dark:hover:bg-red-500/10">
                    <X className="h-4 w-4" /> Reject
                  </button>
                  <button type="button" onClick={() => decideApproval(row, 'approve')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600">
                    <Check className="h-4 w-4" /> Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        {[
          { label: 'Users', value: users.length, icon: Users, color: 'text-blue-500' },
          { label: 'Active', value: activeCount, icon: UserCheck, color: 'text-emerald-500' },
          { label: 'Pending', value: pendingUsers.length, icon: Clock3, color: 'text-amber-500' },
          { label: 'Rejected', value: rejectedCount, icon: ShieldAlert, color: 'text-red-500' },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/50">
              <div className="flex items-center gap-3">
                <Icon className={clsx('h-5 w-5', item.color)} />
                <span className="text-sm text-slate-500 dark:text-slate-400">{item.label}</span>
                <span className="ml-auto text-xl font-bold">{item.value}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-800/50">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-400">
                <th className="p-4">User</th>
                <th className="p-4">Organization</th>
                <th className="p-4">Team</th>
                <th className="p-4">Status</th>
                <th className="p-4">Last Login</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-sm text-slate-400">
                    No users found.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-700/20">
                    <td className="p-4">
                      <p className="text-sm font-semibold">{row.name || row.username}</p>
                      <p className="text-xs text-slate-500">{row.email}</p>
                    </td>
                    <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                      {row.organization_name || (row.organization_id ? `Org #${row.organization_id}` : 'No organization')}
                    </td>
                    <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                      {row.team || 'Not assigned'}
                    </td>
                    <td className="p-4">
                      <span
                        className={clsx(
                          'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold',
                          row.approval_status === 'REJECTED'
                            ? 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400'
                            : row.approval_status === 'PENDING'
                              ? 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                            : row.is_active
                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border-slate-500/20 bg-slate-500/10 text-slate-600 dark:text-slate-400'
                        )}
                      >
                        <span className={clsx('h-2 w-2 rounded-full', row.approval_status === 'REJECTED' ? 'bg-red-500' : row.approval_status === 'PENDING' ? 'bg-amber-500' : row.is_active ? 'bg-emerald-500' : 'bg-slate-500')} />
                        {row.approval_status === 'REJECTED' ? 'Rejected' : row.approval_status === 'PENDING' ? 'Pending' : row.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-slate-500">
                      {row.last_login ? new Date(row.last_login).toLocaleString() : 'Never'}
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
                        {row.approval_status === 'PENDING' ? (
                          <>
                            <button type="button" onClick={() => decideApproval(row, 'reject')} className="rounded-lg p-2 text-red-500 transition hover:bg-red-50 dark:hover:bg-red-500/10" title="Reject account"><X className="h-4 w-4" /></button>
                            <button type="button" onClick={() => decideApproval(row, 'approve')} className="rounded-lg p-2 text-emerald-500 transition hover:bg-emerald-50 dark:hover:bg-emerald-500/10" title="Approve account"><Check className="h-4 w-4" /></button>
                          </>
                        ) : (
                          <>
                        <button type="button" onClick={() => updateTeam(row)} className="rounded-lg p-2 text-slate-400 transition hover:bg-violet-50 hover:text-violet-500 dark:hover:bg-violet-500/10" title="Change team">
                          <BriefcaseBusiness className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => resetPassword(row)}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-500/10"
                          title="Reset password"
                        >
                          <KeyRound className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleActive(row)}
                          className={clsx(
                            'rounded-lg p-2 text-slate-400 transition',
                            row.is_active
                              ? 'hover:bg-amber-50 hover:text-amber-500 dark:hover:bg-amber-500/10'
                              : 'hover:bg-emerald-50 hover:text-emerald-500 dark:hover:bg-emerald-500/10'
                          )}
                          title={row.is_active ? 'Deactivate' : 'Activate'}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteUser(row)}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                          title="Delete user"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
