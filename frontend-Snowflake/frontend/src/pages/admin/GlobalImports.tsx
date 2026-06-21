import { useEffect, useMemo, useState } from 'react';
import { Eye, RefreshCw, Search } from 'lucide-react';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface ImportRow {
  id: number;
  user_id?: number | null;
  user_name?: string | null;
  organization_name?: string | null;
  entreprise_name: string;
  database_name?: string;
  schema_name?: string;
  original_filename: string;
  uploaded_at: string;
  rows_inserted?: number;
  status?: string;
}

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const logUrlFor = (row: ImportRow) => {
  const uploaded = new Date(row.uploaded_at);
  const date = Number.isNaN(uploaded.getTime()) ? undefined : uploaded.toISOString().slice(0, 10);
  const params = new URLSearchParams({
    import_id: String(row.id),
    filename: row.original_filename,
  });
  if (date) {
    params.set('date_from', date);
    params.set('date_to', date);
  }
  if (row.database_name) params.set('database_name', row.database_name);
  if (row.schema_name) params.set('schema_name', row.schema_name);
  return `/log-files?${params.toString()}`;
};

const GlobalImports = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFilter, setDateFilter] = useState('ALL');

  const fetchImports = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { data } = await axios.get<ImportRow[]>(`${API}/api/imports/history`, {
        headers: authHeaders(),
      });
      setRows(data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Unable to load imports.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchImports();
  }, []);

  const filtered = useMemo(() => {
    const now = new Date();
    return rows.filter((row) => {
      const haystack = [
        row.id,
        row.original_filename,
        row.entreprise_name,
        row.organization_name,
        row.user_name,
        row.user_id,
        row.status,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const matchesSearch = haystack.includes(search.toLowerCase());
      const normalizedStatus = (row.status || 'PENDING').toUpperCase();
      const matchesStatus = statusFilter === 'ALL' || normalizedStatus === statusFilter;

      const uploadedAt = new Date(row.uploaded_at);
      let matchesDate = true;
      if (!Number.isNaN(uploadedAt.getTime())) {
        if (dateFilter === 'TODAY') {
          matchesDate = uploadedAt.toDateString() === now.toDateString();
        } else if (dateFilter === 'WEEK') {
          const weekAgo = new Date(now);
          weekAgo.setDate(now.getDate() - 7);
          matchesDate = uploadedAt >= weekAgo;
        } else if (dateFilter === 'MONTH') {
          const monthAgo = new Date(now);
          monthAgo.setMonth(now.getMonth() - 1);
          matchesDate = uploadedAt >= monthAgo;
        }
      }
      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [rows, search, statusFilter, dateFilter]);

  const successCount = rows.filter((row) => row.status === 'SUCCESS').length;
  const failedCount = rows.filter((row) => row.status === 'FAILED').length;
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-in fade-in zoom-in-95 duration-500 text-slate-900 dark:text-white">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">{t('admin.imports')}</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">{t('admin.importsSub')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={isSuperAdmin ? 'Search file, organization, user...' : 'Search file or user...'}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="w-72 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-4 text-sm text-slate-900 outline-none transition focus:border-snowflake dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-snowflake dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="ALL">All statuses</option>
            <option value="SUCCESS">Success</option>
            <option value="FAILED">Failed</option>
            <option value="PROCESSING">Processing</option>
            <option value="PENDING">Pending</option>
          </select>
          <select
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-snowflake dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="ALL">All time</option>
            <option value="TODAY">Today</option>
            <option value="WEEK">Last 7 days</option>
            <option value="MONTH">Last 30 days</option>
          </select>
          <button
            type="button"
            onClick={fetchImports}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:hover:text-white"
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

      <div className="flex flex-wrap gap-3">
        {[
          ['Total', rows.length, 'text-slate-700 dark:text-slate-200'],
          ['Success', successCount, 'text-emerald-500'],
          ['Failed', failedCount, 'text-red-500'],
          ['Filtered', filtered.length, 'text-snowflake'],
        ].map(([label, value, color]) => (
          <div key={label} className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm dark:border-slate-700/60 dark:bg-slate-800/50">
            <span className="text-slate-500 dark:text-slate-400">{label}</span>
            <span className={clsx('ml-3 font-bold', color as string)}>{value}</span>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-800/50">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-400">
                <th className="p-4">Import ID</th>
                <th className="p-4">File</th>
                <th className="p-4">Organization</th>
                {isSuperAdmin && <th className="p-4">User</th>}
                <th className="p-4">Date</th>
                <th className="p-4">Rows</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-right">Log File</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/60">
              {isLoading ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 8 : 7} className="p-8 text-center text-slate-400">
                    <RefreshCw className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={isSuperAdmin ? 8 : 7} className="p-8 text-center text-sm text-slate-400">
                    No imports found.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => {
                  const status = (row.status || 'PENDING').toUpperCase();
                  const canOpenLog = status === 'SUCCESS' && (row.rows_inserted ?? 0) > 0;
                  return (
                    <tr key={row.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-700/20">
                      <td className="p-4 text-sm font-medium text-slate-500">#{row.id}</td>
                      <td className="p-4 text-sm font-semibold">{row.original_filename}</td>
                      <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                        {row.organization_name || row.entreprise_name}
                      </td>
                      {isSuperAdmin && (
                        <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                          {row.user_name || (row.user_id ? `User #${row.user_id}` : 'Unknown')}
                        </td>
                      )}
                      <td className="p-4 text-sm text-slate-500 dark:text-slate-400">
                        {new Date(row.uploaded_at).toLocaleString()}
                      </td>
                      <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                        {(row.rows_inserted ?? 0).toLocaleString()}
                      </td>
                      <td className="p-4">
                        <span
                          className={clsx(
                            'inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold',
                            status === 'SUCCESS' && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                            status === 'FAILED' && 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-400',
                            status !== 'SUCCESS' && status !== 'FAILED' && 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          )}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {canOpenLog ? (
                          <button
                            type="button"
                            onClick={() => navigate(logUrlFor(row))}
                            className="inline-flex items-center gap-2 rounded-lg border border-snowflake/30 bg-snowflake/10 px-3 py-2 text-sm font-medium text-snowflake transition hover:bg-snowflake/15"
                          >
                            <Eye className="h-4 w-4" />
                            View Log File
                          </button>
                        ) : (
                          <span className="text-sm text-slate-400">No log file</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default GlobalImports;
