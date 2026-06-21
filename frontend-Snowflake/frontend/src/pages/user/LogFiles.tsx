import axios from "axios";
import { clsx } from "clsx";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Filter,
  RefreshCw,
  RotateCcw,
  Search,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface LogFileRow {
  date: string;
  label: string;
  operation_count: number;
  success_count: number;
  error_count: number;
  warning_count: number;
  status_summary: "SUCCESS" | "FAILED" | "WARNING" | string;
  first_seen_at: string;
  last_seen_at: string;
}

interface LogDetailRow {
  id: number;
  timestamp: string;
  operation_type: string;
  filename?: string | null;
  table_name?: string | null;
  database_name?: string | null;
  schema_name?: string | null;
  status: string;
  level: string;
  service_name?: string | null;
  rows_affected?: number | null;
  duration_ms?: number | null;
  error_message?: string | null;
  query_text?: string | null;
  snowflake_query_id?: string | null;
  import_id?: number | null;
}

interface LogFileDetails {
  date: string;
  label: string;
  summary: {
    operation_count: number;
    success_count: number;
    error_count: number;
    warning_count?: number;
    status_summary: string;
  };
  items: LogDetailRow[];
  total: number;
}

interface Filters {
  search: string;
  day: string;
  status: string;
  importId: string;
  fileName: string;
  databaseName: string;
  schemaName: string;
  organizationId: string;
}

const emptyFilters: Filters = {
  search: "",
  day: "",
  status: "",
  importId: "",
  fileName: "",
  databaseName: "",
  schemaName: "",
  organizationId: "",
};

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const toApiParams = (filters: Filters) => ({
  ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
  ...(filters.status ? { status: filters.status } : {}),
  ...(filters.importId ? { import_id: filters.importId } : {}),
  ...(filters.fileName ? { filename: filters.fileName } : {}),
  ...(filters.databaseName ? { database_name: filters.databaseName } : {}),
  ...(filters.schemaName ? { schema_name: filters.schemaName } : {}),
  ...(filters.organizationId ? { organization_id: filters.organizationId } : {}),
  ...(filters.day ? { date_from: filters.day, date_to: filters.day } : {}),
});

const filtersToSearchParams = (filters: Filters) => {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("search", filters.search.trim());
  if (filters.status) params.set("status", filters.status);
  if (filters.importId) params.set("import_id", filters.importId);
  if (filters.fileName) params.set("filename", filters.fileName);
  if (filters.databaseName) params.set("database_name", filters.databaseName);
  if (filters.schemaName) params.set("schema_name", filters.schemaName);
  if (filters.organizationId) params.set("organization_id", filters.organizationId);
  if (filters.day) {
    params.set("date_from", filters.day);
    params.set("date_to", filters.day);
  }
  return params;
};

const filtersFromSearchParams = (searchParams: URLSearchParams): Filters => ({
  search: searchParams.get("search") ?? "",
  day: searchParams.get("date") ?? searchParams.get("date_from") ?? "",
  status: searchParams.get("status") ?? "",
  importId: searchParams.get("import_id") ?? "",
  fileName: searchParams.get("filename") ?? searchParams.get("file") ?? "",
  databaseName: searchParams.get("database_name") ?? "",
  schemaName: searchParams.get("schema_name") ?? "",
  organizationId: searchParams.get("organization_id") ?? "",
});

const formatDateTime = (value?: string | null) =>
  value ? new Date(value).toLocaleString() : "N/A";

const statusBadgeClass = (status: string) =>
  clsx(
    "inline-flex min-w-24 justify-center rounded-full border px-3 py-1 text-xs font-semibold",
    status === "SUCCESS" &&
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-300",
    status === "FAILED" &&
      "border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-300",
    status === "WARNING" &&
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-300",
    !["SUCCESS", "FAILED", "WARNING"].includes(status) &&
      "border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300",
  );

const statusOptions = [
  { value: "", label: "All", icon: Filter },
  { value: "FAILED", label: "Failed", icon: AlertTriangle },
  { value: "SUCCESS", label: "Success", icon: CheckCircle2 },
  { value: "WARNING", label: "Warnings", icon: AlertTriangle },
];

const LogFiles = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [logFiles, setLogFiles] = useState<LogFileRow[]>([]);
  const [draftFilters, setDraftFilters] = useState<Filters>(emptyFilters);
  const [activeFilters, setActiveFilters] = useState<Filters>(emptyFilters);
  const [details, setDetails] = useState<LogFileDetails | null>(null);
  const [selectedLog, setSelectedLog] = useState<LogDetailRow | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailsLoading, setIsDetailsLoading] = useState(false);
  const [error, setError] = useState("");

  const loadLogFiles = async (filters = activeFilters) => {
    setIsLoading(true);
    setError("");
    try {
      const { data } = await axios.get<{ items: LogFileRow[] }>(
        `${API}/api/logfiles`,
        {
          headers: getAuthHeaders(),
          params: toApiParams(filters),
        },
      );
      setLogFiles(data.items);
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { detail?: string } } };
      setError(apiError.response?.data?.detail ?? "Could not load log files.");
      setLogFiles([]);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDetails = async (logDate: string) => {
    setIsDetailsLoading(true);
    setError("");
    try {
      const detailParams = {
        ...(activeFilters.search.trim()
          ? { search: activeFilters.search.trim() }
          : {}),
        ...(activeFilters.importId ? { import_id: activeFilters.importId } : {}),
        ...(activeFilters.fileName ? { filename: activeFilters.fileName } : {}),
        ...(activeFilters.databaseName ? { database_name: activeFilters.databaseName } : {}),
        ...(activeFilters.schemaName ? { schema_name: activeFilters.schemaName } : {}),
        ...(activeFilters.organizationId ? { organization_id: activeFilters.organizationId } : {}),
      };
      const { data } = await axios.get<LogFileDetails>(
        `${API}/api/logfiles/${logDate}`,
        {
          headers: getAuthHeaders(),
          params: detailParams,
        },
      );
      setDetails(data);
    } catch (err: unknown) {
      const apiError = err as { response?: { data?: { detail?: string } } };
      setError(apiError.response?.data?.detail ?? "Could not load log details.");
    } finally {
      setIsDetailsLoading(false);
    }
  };

  useEffect(() => {
    const filters = filtersFromSearchParams(searchParams);
    setActiveFilters(filters);
    setDraftFilters(filters);
    loadLogFiles(filters);
  }, [searchParams]);

  const applyFilters = (filters = draftFilters) => {
    setActiveFilters(filters);
    setDraftFilters(filters);
    const nextParams = filtersToSearchParams(filters);
    if (nextParams.toString() === searchParams.toString()) {
      loadLogFiles(filters);
      return;
    }
    setSearchParams(nextParams);
  };

  const clearFilters = () => {
    setActiveFilters(emptyFilters);
    setDraftFilters(emptyFilters);
    if (searchParams.toString()) {
      setSearchParams({});
      return;
    }
    loadLogFiles(emptyFilters);
  };

  const updateStatus = (status: string) => {
    applyFilters({ ...draftFilters, status });
  };

  const updateDay = (day: string) => {
    applyFilters({ ...draftFilters, day });
  };

  const openDetails = async (row: LogFileRow) => {
    setDetails(null);
    await loadDetails(row.date);
  };

  const orderedDetailItems = details
    ? [...details.items].sort((left, right) => {
        const leftFailed = left.status === "FAILED" || Boolean(left.error_message);
        const rightFailed = right.status === "FAILED" || Boolean(right.error_message);
        if (leftFailed !== rightFailed) return leftFailed ? -1 : 1;
        return new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();
      })
    : [];
  const firstFailure = orderedDetailItems.find(
    (log) => log.status === "FAILED" || Boolean(log.error_message),
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 text-slate-900 transition-colors duration-300 dark:text-slate-100">
      {details && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm dark:bg-black/70">
          <div className="w-full max-w-5xl overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-bold">Log details - {details.label}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {details.summary.operation_count} operations, {details.summary.error_count} errors
                </p>
              </div>
              <button
                onClick={() => setDetails(null)}
                className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {firstFailure && (
              <button
                onClick={() => setSelectedLog(firstFailure)}
                className="mx-5 mt-4 block w-[calc(100%-2.5rem)] rounded-lg border border-red-200 bg-red-50 p-4 text-left transition hover:border-red-300 hover:bg-red-100/70 dark:border-red-400/25 dark:bg-red-400/10 dark:hover:border-red-300/50 dark:hover:bg-red-400/15"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-bold text-red-700 dark:text-red-200">
                    <AlertTriangle className="h-4 w-4" />
                    Latest failure
                  </div>
                  <span className={statusBadgeClass(firstFailure.status)}>{firstFailure.status}</span>
                </div>
                <div className="mt-2 text-sm text-red-700 dark:text-red-100">
                  {firstFailure.error_message ?? firstFailure.operation_type}
                </div>
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  {formatDateTime(firstFailure.timestamp)}
                  {firstFailure.table_name ? ` - ${firstFailure.table_name}` : ""}
                </div>
              </button>
            )}

            <div className="max-h-[70vh] overflow-auto">
              {isDetailsLoading ? (
                <div className="p-10 text-center text-slate-500 dark:text-slate-400">
                  <RefreshCw className="mx-auto h-5 w-5 animate-spin" />
                </div>
              ) : (
                <table className="w-full min-w-[900px] border-collapse text-left">
                  <thead className="sticky top-0 bg-white dark:bg-slate-900">
                    <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:text-slate-400">
                      <th className="px-5 py-3">Time</th>
                      <th className="px-5 py-3">Operation</th>
                      <th className="px-5 py-3">Target</th>
                      <th className="px-5 py-3">Status</th>
                      <th className="px-5 py-3">Rows</th>
                      <th className="px-5 py-3">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {orderedDetailItems.map((log) => (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedLog(log)}
                        className="cursor-pointer transition hover:bg-slate-50 dark:hover:bg-slate-800/70"
                      >
                        <td className="whitespace-nowrap px-5 py-3 text-sm text-slate-600 dark:text-slate-300">
                          {new Date(log.timestamp).toLocaleTimeString()}
                        </td>
                        <td className="px-5 py-3 text-sm font-medium">{log.operation_type}</td>
                        <td className="px-5 py-3 text-sm text-slate-600 dark:text-slate-300">
                          {log.table_name ?? log.filename ?? log.database_name ?? "N/A"}
                        </td>
                        <td className="px-5 py-3">
                          <span className={statusBadgeClass(log.status)}>{log.status}</span>
                        </td>
                        <td className="px-5 py-3 text-sm text-slate-600 dark:text-slate-300">{log.rows_affected ?? "N/A"}</td>
                        <td className="max-w-md truncate px-5 py-3 text-sm text-slate-500 dark:text-slate-400">
                          {log.error_message ?? log.service_name ?? "Executed"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedLog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm dark:bg-black/70">
          <div className="w-full max-w-3xl rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
              <div>
                <h3 className="text-lg font-bold">Execution details</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {selectedLog.operation_type} - {formatDateTime(selectedLog.timestamp)}
                </p>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="rounded-md p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[70vh] space-y-4 overflow-y-auto p-5">
              <dl className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Status", selectedLog.status],
                  ["Level", selectedLog.level],
                  ["Service", selectedLog.service_name ?? "N/A"],
                  ["File", selectedLog.filename ?? "N/A"],
                  ["Database", selectedLog.database_name ?? "N/A"],
                  ["Schema", selectedLog.schema_name ?? "N/A"],
                  ["Table", selectedLog.table_name ?? "N/A"],
                  ["Rows", String(selectedLog.rows_affected ?? "N/A")],
                  ["Duration", selectedLog.duration_ms ? `${selectedLog.duration_ms} ms` : "N/A"],
                  ["Snowflake Query ID", selectedLog.snowflake_query_id ?? "N/A"],
                  ["Import ID", selectedLog.import_id ? String(selectedLog.import_id) : "N/A"],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                    <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-500">{label}</dt>
                    <dd className="mt-1 break-words text-sm font-medium text-slate-800 dark:text-slate-100">{value}</dd>
                  </div>
                ))}
              </dl>

              {selectedLog.error_message && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Error message
                  </p>
                  <pre className="max-h-40 overflow-auto rounded-md bg-red-50 p-3 text-xs text-red-700 dark:bg-slate-950 dark:text-red-100">
                    {selectedLog.error_message}
                  </pre>
                </div>
              )}

              {selectedLog.query_text && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">SQL</p>
                  <pre className="max-h-48 overflow-auto rounded-md bg-slate-100 p-3 text-xs text-slate-800 dark:bg-slate-950 dark:text-slate-100">
                    {selectedLog.query_text}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
            <FileText className="h-7 w-7 text-sky-400" />
            Log Files
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Daily grouped execution logs for your organization.
          </p>
        </div>
        <button
          onClick={() => loadLogFiles(activeFilters)}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:hover:bg-slate-700"
        >
          <RefreshCw className={clsx("h-4 w-4", isLoading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {activeFilters.importId && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300">
          Showing technical logs for import #{activeFilters.importId}
          {activeFilters.fileName ? ` - ${activeFilters.fileName}` : ""}.
        </div>
      )}
      {activeFilters.organizationId && !activeFilters.importId && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300">
          Showing technical logs for organization #{activeFilters.organizationId}.
        </div>
      )}

      <div className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-900/40 dark:shadow-none">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_190px_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={draftFilters.search}
              onChange={(event) => setDraftFilters({ ...draftFilters, search: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyFilters();
              }}
              placeholder="Search query, table, service..."
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-sky-400 focus:ring-1 focus:ring-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
          </div>

          <label className="relative block">
            <span className="sr-only">Exact day</span>
            <input
              type="date"
              value={draftFilters.day}
              onChange={(event) => updateDay(event.target.value)}
              className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 pr-9 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:ring-1 focus:ring-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            />
            <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </label>

          <button
            onClick={() => applyFilters()}
            className="h-11 rounded-lg bg-sky-500 px-6 text-sm font-bold text-white transition hover:bg-sky-400"
          >
            Apply
          </button>

          <button
            onClick={clearFilters}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <RotateCcw className="h-4 w-4" />
            Clear
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {statusOptions.map((option) => {
            const Icon = option.icon;
            const isActive = draftFilters.status === option.value;
            return (
              <button
                key={option.value || "all"}
                onClick={() => updateStatus(option.value)}
                className={clsx(
                  "inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition",
                  isActive
                    ? "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-400 dark:bg-sky-400/15 dark:text-sky-200"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
                )}
              >
                <Icon className="h-4 w-4" />
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white/70 shadow-sm transition-colors dark:border-slate-700 dark:bg-slate-900/40 dark:shadow-none">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-700 dark:bg-slate-900/70 dark:text-slate-400">
              <th className="px-5 py-4">Date</th>
              <th className="px-5 py-4">Operations</th>
              <th className="px-5 py-4">Success</th>
              <th className="px-5 py-4">Errors</th>
              <th className="px-5 py-4">Status</th>
              <th className="px-5 py-4 text-right">Details</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="h-32 px-5 py-10 text-center text-slate-500 dark:text-slate-400">
                  <RefreshCw className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : logFiles.length === 0 ? (
              <tr>
                <td colSpan={6} className="h-32 px-5 py-10 text-center text-slate-500 dark:text-slate-400">
                  No log files found.
                </td>
              </tr>
            ) : (
              logFiles.map((row) => (
                <tr
                  key={row.date}
                  onClick={() => openDetails(row)}
                  className="cursor-pointer border-b border-slate-200 transition last:border-b-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
                >
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-900 dark:text-white">{row.label}</div>
                    <div className="mt-1 text-xs text-slate-500 dark:text-slate-500">
                      Last event {formatDateTime(row.last_seen_at)}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
                    <span className="inline-flex items-center gap-2">
                      <Clock className="h-4 w-4 text-slate-500" />
                      {row.operation_count}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm">
                    <span className="inline-flex items-center gap-2 font-semibold text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4" />
                      {row.success_count}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm">
                    <span
                      className={clsx(
                        "inline-flex items-center gap-2 font-semibold",
                        row.error_count > 0
                          ? "text-red-700 dark:text-red-300"
                          : "text-slate-500 dark:text-slate-300",
                      )}
                    >
                      <AlertTriangle className="h-4 w-4" />
                      {row.error_count}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={statusBadgeClass(row.status_summary)}>
                      {row.status_summary}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <button
                      onClick={(event) => {
                        event.stopPropagation();
                        openDetails(row);
                      }}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-sky-300 hover:text-sky-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-sky-400 dark:hover:text-sky-200"
                      title="View details"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
};

export default LogFiles;
