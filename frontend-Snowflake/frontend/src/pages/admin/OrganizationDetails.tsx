import axios from 'axios';
import { clsx } from 'clsx';
import { AlertTriangle, ArrowLeft, Building2, FileText, Mail, RefreshCw, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface Contact {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  last_login?: string | null;
}

interface OrganizationDetailsData {
  id: number;
  name: string;
  created_at: string;
  total_users: number;
  total_admins: number;
  total_imports: number;
  success_imports: number;
  failed_imports: number;
  contacts: Contact[];
}

interface ImportRow {
  id: number;
  user_name?: string | null;
  original_filename: string;
  uploaded_at: string;
  rows_inserted?: number;
  status: string;
  database_name: string;
  schema_name: string;
  error_type?: string | null;
  error_message?: string | null;
  failure_step?: string | null;
  sql_error_details?: string | null;
  failed_table_name?: string | null;
  failed_at?: string | null;
}

const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const OrganizationDetails = () => {
  const { organizationId = '' } = useParams();
  const navigate = useNavigate();
  const [organization, setOrganization] = useState<OrganizationDetailsData | null>(null);
  const [imports, setImports] = useState<ImportRow[]>([]);
  const [selectedFailure, setSelectedFailure] = useState<ImportRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [organizationResponse, importsResponse] = await Promise.all([
        axios.get<OrganizationDetailsData>(`${API}/api/dashboard/organizations/${organizationId}`, { headers: authHeaders() }),
        axios.get<ImportRow[]>(`${API}/api/imports/history`, {
          headers: authHeaders(),
          params: { organization_id: organizationId },
        }),
      ]);
      setOrganization(organizationResponse.data);
      setImports(importsResponse.data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Unable to load organization support data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [organizationId]);

  const admins = useMemo(() => organization?.contacts.filter((contact) => contact.role === 'admin') ?? [], [organization]);
  const users = useMemo(() => organization?.contacts.filter((contact) => contact.role === 'user') ?? [], [organization]);

  const openLogs = (row?: ImportRow) => {
    const params = new URLSearchParams({ organization_id: organizationId });
    if (row) {
      params.set('import_id', String(row.id));
      params.set('filename', row.original_filename);
      params.set('date_from', row.uploaded_at.slice(0, 10));
      params.set('date_to', row.uploaded_at.slice(0, 10));
      params.set('database_name', row.database_name);
      params.set('schema_name', row.schema_name);
    }
    navigate(`/superadmin/organizations/${organizationId}/log-files?${params.toString()}`);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-slate-900 dark:text-white">
      {selectedFailure && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm dark:bg-black/70">
          <div className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-700">
              <div>
                <h3 className="font-bold text-red-600 dark:text-red-300">Import failure #{selectedFailure.id}</h3>
                <p className="mt-1 text-sm text-slate-500">{selectedFailure.original_filename}</p>
              </div>
              <button onClick={() => setSelectedFailure(null)} className="rounded-md p-2 hover:bg-slate-100 dark:hover:bg-slate-800" title="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <dl className="grid gap-3 p-5 sm:grid-cols-2">
              {[
                ['User', selectedFailure.user_name || 'Unknown'],
                ['Step', selectedFailure.failure_step || 'Unknown'],
                ['Error type', selectedFailure.error_type || 'Unknown'],
                ['Table', selectedFailure.failed_table_name || 'N/A'],
                ['Timestamp', new Date(selectedFailure.failed_at || selectedFailure.uploaded_at).toLocaleString()],
                ['Inserted rows', String(selectedFailure.rows_inserted || 0)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                  <dt className="text-xs font-semibold uppercase text-slate-500">{label}</dt>
                  <dd className="mt-1 break-words text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="space-y-3 px-5 pb-5">
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                {selectedFailure.error_message || 'No error message was stored.'}
              </div>
              {selectedFailure.sql_error_details && <pre className="max-h-48 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-100">{selectedFailure.sql_error_details}</pre>}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/superadmin/organizations')} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700" title="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h2 className="flex items-center gap-2 text-3xl font-bold"><Building2 className="h-7 w-7 text-blue-500" />{organization?.name || 'Organization'}</h2>
            <p className="mt-1 text-sm text-slate-500">Support view: contacts, import failures, and technical logs.</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => openLogs()} className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 dark:border-blue-500/25 dark:bg-blue-500/10 dark:text-blue-300">
            <FileText className="h-4 w-4" /> Organization logs
          </button>
          <button onClick={load} className="rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800" title="Refresh">
            <RefreshCw className={clsx('h-5 w-5', loading && 'animate-spin')} />
          </button>
        </div>
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300">{error}</div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ['Admins', organization?.total_admins ?? 0],
          ['Users', organization?.total_users ?? 0],
          ['Imports', organization?.total_imports ?? 0],
          ['Success', organization?.success_imports ?? 0],
          ['Failed', organization?.failed_imports ?? 0],
        ].map(([label, value]) => <div key={label} className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/50"><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold">{value}</p></div>)}
      </div>

      <section>
        <h3 className="mb-3 flex items-center gap-2 text-lg font-bold"><Users className="h-5 w-5 text-blue-500" /> Organization contacts</h3>
        <div className="grid gap-3 md:grid-cols-2">
          {[...admins, ...users].map((contact) => (
            <div key={contact.id} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="min-w-0 flex-1"><p className="font-semibold">{contact.name}</p><p className="flex items-center gap-1 truncate text-sm text-slate-500"><Mail className="h-3.5 w-3.5" />{contact.email}</p></div>
              <div className="text-right"><p className="text-xs font-semibold uppercase text-blue-500">{contact.role}</p><p className={clsx('mt-1 text-xs', contact.is_active ? 'text-emerald-500' : 'text-red-500')}>{contact.is_active ? 'Active' : 'Inactive'}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/50">
        <div className="border-b border-slate-200 px-4 py-3 dark:border-slate-700"><h3 className="font-bold">Organization import history</h3></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-800"><tr><th className="p-4">Import</th><th className="p-4">User</th><th className="p-4">Date</th><th className="p-4">Rows</th><th className="p-4">Status</th><th className="p-4">Issue / Log</th></tr></thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {imports.map((row) => {
                const status = row.status.toUpperCase();
                const canOpenLogs = status === 'SUCCESS' && (row.rows_inserted || 0) > 0;
                return <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30"><td className="p-4"><p className="font-semibold">{row.original_filename}</p><p className="text-xs text-slate-500">#{row.id}</p></td><td className="p-4 text-sm">{row.user_name || 'Unknown'}</td><td className="p-4 text-sm text-slate-500">{new Date(row.uploaded_at).toLocaleString()}</td><td className="p-4 text-sm">{row.rows_inserted || 0}</td><td className="p-4"><span className={clsx('rounded-full border px-2.5 py-1 text-xs font-semibold', status === 'SUCCESS' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300' : status === 'FAILED' ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300' : 'border-amber-200 bg-amber-50 text-amber-700')}>{status}</span></td><td className="p-4">{status === 'FAILED' ? <button onClick={() => setSelectedFailure(row)} className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-300"><AlertTriangle className="h-4 w-4" />View issue</button> : canOpenLogs ? <button onClick={() => openLogs(row)} className="inline-flex items-center gap-2 text-sm font-semibold text-blue-600 dark:text-blue-300"><FileText className="h-4 w-4" />View logs</button> : <span className="text-sm text-slate-400">No inserted data</span>}</td></tr>;
              })}
              {!loading && imports.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-sm text-slate-500">No imports found for this organization.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default OrganizationDetails;
