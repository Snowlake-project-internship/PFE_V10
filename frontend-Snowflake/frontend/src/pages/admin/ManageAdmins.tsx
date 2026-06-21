import { useEffect, useMemo, useState } from 'react';
import { Building2, Power, RefreshCw, Search, ShieldAlert, Trash2, UserPlus } from 'lucide-react';
import { clsx } from 'clsx';
import axios from 'axios';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface AdminRow {
  id: number;
  name?: string;
  username: string;
  email: string;
  role: string;
  is_active: boolean;
  organization_id?: number | null;
  organization_name?: string | null;
  last_login?: string | null;
  created_at: string;
}

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const emptyAdmin = {
  username: '',
  email: '',
  password: '',
  organization_name: '',
};

const ManageAdmins = () => {
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [newAdmin, setNewAdmin] = useState(emptyAdmin);
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchAdmins = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { data } = await axios.get<AdminRow[]>(`${API}/api/users/`, {
        headers: authHeaders(),
      });
      setAdmins(data.filter((row) => row.role === 'admin'));
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Unable to load admins.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAdmins();
  }, []);

  const filtered = useMemo(() => {
    const needle = search.toLowerCase();
    return admins.filter((row) =>
      [row.username, row.name, row.email, row.organization_name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle)
    );
  }, [admins, search]);

  const createAdmin = async () => {
    setFormError('');
    if (!newAdmin.username || !newAdmin.email || !newAdmin.password || !newAdmin.organization_name) {
      setFormError('All fields are required.');
      return;
    }
    setFormLoading(true);
    try {
      await axios.post(`${API}/api/auth/register-admin`, newAdmin, {
        headers: authHeaders(),
      });
      setNewAdmin(emptyAdmin);
      setShowForm(false);
      fetchAdmins();
    } catch (err: any) {
      setFormError(err?.response?.data?.detail || 'Unable to create admin.');
    } finally {
      setFormLoading(false);
    }
  };

  const toggleActive = async (row: AdminRow) => {
    try {
      await axios.patch(
        `${API}/api/users/${row.id}/${row.is_active ? 'deactivate' : 'activate'}`,
        {},
        { headers: authHeaders() }
      );
      fetchAdmins();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Unable to update admin status.');
    }
  };

  const changeOrganization = async (row: AdminRow) => {
    const nextOrganization = window.prompt('New organization name:', row.organization_name || '');
    if (!nextOrganization || nextOrganization.trim() === row.organization_name) return;
    try {
      await axios.put(
        `${API}/api/users/${row.id}`,
        { organization_name: nextOrganization.trim() },
        { headers: authHeaders() }
      );
      fetchAdmins();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Unable to update organization.');
    }
  };

  const deleteAdmin = async (row: AdminRow) => {
    if (!window.confirm(`Delete admin ${row.username}? This action cannot be undone.`)) return;
    try {
      await axios.delete(`${API}/api/users/${row.id}`, { headers: authHeaders() });
      fetchAdmins();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Unable to delete admin.');
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-in fade-in zoom-in-95 duration-500 text-slate-900 dark:text-white">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">Manage Admins</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Create admins, assign organizations, and control access.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search admins..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-72 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 outline-none transition focus:border-snowflake dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <button
            type="button"
            onClick={fetchAdmins}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:hover:text-white"
            title="Refresh"
          >
            <RefreshCw className={clsx('h-4 w-4', isLoading && 'animate-spin')} />
          </button>
          <button
            type="button"
            onClick={() => {
              setShowForm((value) => !value);
              setFormError('');
            }}
            className="inline-flex items-center gap-2 rounded-lg bg-snowflake px-4 py-2 text-sm font-medium text-white transition hover:bg-snowflake-dark"
          >
            <UserPlus className="h-4 w-4" />
            Add Admin
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </div>
      )}

      {showForm && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700/60 dark:bg-slate-800/50">
          <h3 className="mb-4 text-lg font-semibold">New Admin</h3>
          {formError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">
              {formError}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              type="text"
              placeholder="Username"
              value={newAdmin.username}
              onChange={(event) => setNewAdmin({ ...newAdmin, username: event.target.value })}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-snowflake dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <input
              type="email"
              placeholder="Email"
              value={newAdmin.email}
              onChange={(event) => setNewAdmin({ ...newAdmin, email: event.target.value })}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-snowflake dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <input
              type="password"
              placeholder="Password"
              value={newAdmin.password}
              onChange={(event) => setNewAdmin({ ...newAdmin, password: event.target.value })}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-snowflake dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <input
              type="text"
              placeholder="Organization name"
              value={newAdmin.organization_name}
              onChange={(event) => setNewAdmin({ ...newAdmin, organization_name: event.target.value })}
              className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-snowflake dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
          </div>
          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={createAdmin}
              disabled={formLoading}
              className="inline-flex items-center gap-2 rounded-lg bg-snowflake px-5 py-2.5 text-sm font-medium text-white transition hover:bg-snowflake-dark disabled:cursor-wait disabled:opacity-70"
            >
              {formLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
              Create Admin
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-800/50">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-400">
                <th className="p-4">Admin</th>
                <th className="p-4">Organization</th>
                <th className="p-4">Status</th>
                <th className="p-4">Last Login</th>
                <th className="p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-sm text-slate-400">
                    No admins found.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-700/20">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-500/10">
                          <ShieldAlert className="h-4 w-4 text-violet-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{row.name || row.username}</p>
                          <p className="text-xs text-slate-500">{row.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                      {row.organization_name || (row.organization_id ? `Org #${row.organization_id}` : 'No organization')}
                    </td>
                    <td className="p-4">
                      <span
                        className={clsx(
                          'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-semibold',
                          row.is_active
                            ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                            : 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                        )}
                      >
                        <span className={clsx('h-2 w-2 rounded-full', row.is_active ? 'bg-emerald-500' : 'bg-amber-500')} />
                        {row.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-slate-500">
                      {row.last_login ? new Date(row.last_login).toLocaleString() : 'Never'}
                    </td>
                    <td className="p-4">
                      <div className="flex justify-end gap-2">
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
                          onClick={() => changeOrganization(row)}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-blue-50 hover:text-blue-500 dark:hover:bg-blue-500/10"
                          title="Change organization"
                        >
                          <Building2 className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteAdmin(row)}
                          className="rounded-lg p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10"
                          title="Delete admin"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
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

export default ManageAdmins;
