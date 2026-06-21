import axios from 'axios';
import { clsx } from 'clsx';
import { Activity, AlertTriangle, Building2, CheckCircle2, RefreshCw, Rows3, ShieldAlert, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useAuth } from '../../contexts/AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface DashboardStats {
  organization_name?: string;
  total_users?: number;
  total_admins?: number;
  total_imports?: number;
  total_organizations?: number;
}

interface DashboardOverview {
  scope_name: string;
  total_imports: number;
  successful_imports: number;
  failed_imports: number;
  in_progress_imports: number;
  success_rate: number;
  total_rows_loaded: number;
  avg_rows_per_successful_import: number;
  activity_by_day: Array<{ day: string; total_imports: number; successful_imports: number; failed_imports: number; rows_loaded: number; success_rate: number }>;
  recent_imports: Array<{ id: number; filename: string; status: string; rows_inserted: number; uploaded_at: string; user_name?: string | null; organization_name?: string | null }>;
}

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const AdminDashboard = () => {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [days, setDays] = useState(30);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const loadDashboard = async () => {
    setIsLoading(true);
    setError('');
    try {
      const statsEndpoint = isSuperAdmin ? '/api/dashboard/super-admin' : '/api/dashboard/admin';
      const [statsResponse, overviewResponse] = await Promise.all([
        axios.get<DashboardStats>(`${API}${statsEndpoint}`, { headers: authHeaders() }),
        axios.get<DashboardOverview>(`${API}/api/dashboard/overview`, { headers: authHeaders(), params: { days } }),
      ]);
      setStats(statsResponse.data);
      setOverview(overviewResponse.data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Unable to load dashboard data.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [days, isSuperAdmin]);

  const chartData = (overview?.activity_by_day ?? []).map((row) => ({
    ...row,
    label: new Date(`${row.day}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
  }));

  const kpis = isSuperAdmin
    ? [
        { label: 'Organizations', value: stats?.total_organizations ?? 0, icon: Building2, color: 'text-orange-500', bg: 'bg-orange-50 dark:bg-orange-500/10' },
        { label: 'Admins', value: stats?.total_admins ?? 0, icon: ShieldAlert, color: 'text-violet-500', bg: 'bg-violet-50 dark:bg-violet-500/10' },
        { label: 'Users', value: stats?.total_users ?? 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
        { label: 'Rows loaded', value: (overview?.total_rows_loaded ?? 0).toLocaleString(), icon: Rows3, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
      ]
    : [
        { label: 'Organization users', value: stats?.total_users ?? 0, icon: Users, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-500/10' },
        { label: 'Imports', value: overview?.total_imports ?? 0, icon: Activity, color: 'text-sky-500', bg: 'bg-sky-50 dark:bg-sky-500/10' },
        { label: 'Success rate', value: `${overview?.success_rate ?? 0}%`, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
        { label: 'Failed imports', value: overview?.failed_imports ?? 0, icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50 dark:bg-red-500/10' },
      ];

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-slate-900 dark:text-white">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 className="text-3xl font-bold tracking-tight">{isSuperAdmin ? 'Super Admin Dashboard' : 'Admin Dashboard'}</h2><p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Live PostgreSQL analytics for {overview?.scope_name || 'your scope'}.</p></div>
        <div className="flex items-center gap-2"><select value={days} onChange={(event) => setDays(Number(event.target.value))} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-800"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></select><button onClick={loadDashboard} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold dark:border-slate-700 dark:bg-slate-800"><RefreshCw className={clsx('h-4 w-4', isLoading && 'animate-spin')} />Refresh</button></div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{kpis.map((kpi) => { const Icon = kpi.icon; return <div key={kpi.label} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800/50"><div className="flex items-center gap-4"><div className={clsx('rounded-lg p-3', kpi.bg)}><Icon className={clsx('h-5 w-5', kpi.color)} /></div><div><p className="text-sm text-slate-500">{kpi.label}</p><p className="mt-1 text-2xl font-bold">{isLoading ? '...' : kpi.value}</p></div></div></div>; })}</div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800/50"><div className="mb-4 flex items-center justify-between"><h3 className="font-bold">Import activity</h3><span className="text-sm font-semibold text-emerald-500">{overview?.success_rate ?? 0}% success</span></div><div className="h-64 min-h-64 min-w-0"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" opacity={0.25} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} /><YAxis tickLine={false} axisLine={false} allowDecimals={false} fontSize={11} /><Tooltip /><Bar dataKey="successful_imports" name="Success" stackId="imports" fill="#10b981" /><Bar dataKey="failed_imports" name="Failed" stackId="imports" fill="#ef4444" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div></section>
        <section className="rounded-lg border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800/50"><div className="mb-4 flex items-center justify-between"><h3 className="font-bold">Rows loaded</h3><span className="text-sm text-slate-500">Avg {overview?.avg_rows_per_successful_import ?? 0} / import</span></div><div className="h-64 min-h-64 min-w-0"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94a3b8" opacity={0.25} /><XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} /><YAxis tickLine={false} axisLine={false} allowDecimals={false} fontSize={11} /><Tooltip /><Area type="monotone" dataKey="rows_loaded" name="Rows" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.18} strokeWidth={3} /></AreaChart></ResponsiveContainer></div></section>
      </div>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/50"><div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700"><h3 className="font-bold">Recent imports</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800"><tr><th className="p-4">File</th>{isSuperAdmin && <th className="p-4">Organization</th>}<th className="p-4">User</th><th className="p-4">Date</th><th className="p-4">Rows</th><th className="p-4">Status</th></tr></thead><tbody className="divide-y divide-slate-200 dark:divide-slate-700">{(overview?.recent_imports ?? []).map((row) => <tr key={row.id}><td className="p-4"><p className="font-semibold">{row.filename}</p><p className="text-xs text-slate-500">#{row.id}</p></td>{isSuperAdmin && <td className="p-4 text-sm">{row.organization_name || 'Unknown'}</td>}<td className="p-4 text-sm">{row.user_name || 'Unknown'}</td><td className="p-4 text-sm text-slate-500">{new Date(row.uploaded_at).toLocaleString()}</td><td className="p-4 text-sm">{row.rows_inserted.toLocaleString()}</td><td className="p-4"><span className={clsx('rounded-full border px-2.5 py-1 text-xs font-semibold', row.status === 'SUCCESS' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300' : row.status === 'FAILED' ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300' : 'border-amber-200 bg-amber-50 text-amber-700')}>{row.status}</span></td></tr>)}{!isLoading && !overview?.recent_imports.length && <tr><td colSpan={isSuperAdmin ? 6 : 5} className="p-8 text-center text-sm text-slate-500">No import activity found.</td></tr>}</tbody></table></div></section>
    </div>
  );
};

export default AdminDashboard;
