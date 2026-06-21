import { useEffect, useMemo, useState } from 'react';
import { Activity, ArrowRight, Building2, RefreshCw, Search, ShieldAlert, Users } from 'lucide-react';
import { clsx } from 'clsx';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface OrganizationRow {
  id: number;
  name: string;
  total_users: number;
  total_admins: number;
  total_imports: number;
  created_at: string;
}

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const AllOrganizations = () => {
  const navigate = useNavigate();
  const [organizations, setOrganizations] = useState<OrganizationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');

  const fetchOrganizations = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { data } = await axios.get<OrganizationRow[]>(`${API}/api/dashboard/organizations`, {
        headers: authHeaders(),
      });
      setOrganizations(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Unable to load organizations.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchOrganizations();
  }, []);

  const filtered = useMemo(() => {
    const needle = search.toLowerCase();
    return organizations.filter((row) => row.name.toLowerCase().includes(needle));
  }, [organizations, search]);

  const totals = useMemo(
    () => ({
      users: organizations.reduce((sum, row) => sum + row.total_users, 0),
      admins: organizations.reduce((sum, row) => sum + row.total_admins, 0),
      imports: organizations.reduce((sum, row) => sum + row.total_imports, 0),
    }),
    [organizations]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-in fade-in zoom-in-95 duration-500 text-slate-900 dark:text-white">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">All Organizations</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Platform-wide organization inventory with users, admins, and imports.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search organization..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-72 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 outline-none transition focus:border-snowflake dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <button
            type="button"
            onClick={fetchOrganizations}
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {[
          { label: 'Organizations', value: organizations.length, icon: Building2, color: 'text-blue-500' },
          { label: 'Users', value: totals.users, icon: Users, color: 'text-emerald-500' },
          { label: 'Admins', value: totals.admins, icon: ShieldAlert, color: 'text-violet-500' },
          { label: 'Imports', value: totals.imports, icon: Activity, color: 'text-orange-500' },
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
          <table className="w-full min-w-[820px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-400">
                <th className="p-4">Organization</th>
                <th className="p-4">Users</th>
                <th className="p-4">Admins</th>
                <th className="p-4">Members</th>
                <th className="p-4">Imports</th>
                <th className="p-4">Created</th>
                <th className="p-4 text-right">Support View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-sm text-slate-400">
                    No organizations found.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-700/20">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10">
                          <Building2 className="h-4 w-4 text-blue-500" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">{row.name}</p>
                          <p className="text-xs text-slate-500">ID #{row.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-sm font-medium">{row.total_users}</td>
                    <td className="p-4 text-sm font-medium">{row.total_admins}</td>
                    <td className="p-4 text-sm font-semibold text-snowflake">{row.total_users + row.total_admins}</td>
                    <td className="p-4 text-sm font-medium">{row.total_imports}</td>
                    <td className="p-4 text-sm text-slate-500">
                      {new Date(row.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-right">
                      <button
                        type="button"
                        onClick={() => navigate(`/superadmin/organizations/${row.id}`)}
                        className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-100 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
                      >
                        Open
                        <ArrowRight className="h-4 w-4" />
                      </button>
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

export default AllOrganizations;
