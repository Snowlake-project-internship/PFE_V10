import axios from "axios";
import { clsx } from "clsx";
import {
  AlertTriangle,
  FileText,
  Filter,
  RefreshCw,
  Search,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

interface ImportRow {
  id: number;
  original_filename: string;
  database_name: string;
  schema_name: string;
  uploaded_at: string;
  rows_inserted: number;
  imported_tables?: string[] | null;
  status: string;
  rollback_status: "PENDING" | "ROLLED_BACK" | "FAILED" | string;
  rollback_query?: string | null;
  rollback_plan?: {
    version?: number;
    database_created?: boolean;
    schema_created?: boolean;
    tables?: Array<{
      name: string;
      created: boolean;
      rows_inserted: number;
    }>;
  } | null;
  rolled_back_at?: string | null;
  rollback_error_message?: string | null;
  rollback_failed_at?: string | null;
  error_type?: string | null;
  error_message?: string | null;
  failure_step?: string | null;
  sql_error_details?: string | null;
  failed_at?: string | null;
  failed_table_name?: string | null;
}

const ImportHistory = () => {
  const { t } = useTranslation();

  const [historyData, setHistoryData] = useState<ImportRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [rollbackTarget, setRollbackTarget] = useState<ImportRow | null>(null);
  const [errorTarget, setErrorTarget] = useState<ImportRow | null>(null);
  const [rollbackLoadingId, setRollbackLoadingId] = useState<number | null>(
    null,
  );
  const [notice, setNotice] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchHistory = async () => {
    setIsLoading(true);
    try {
      const { data } = await axios.get<ImportRow[]>(
        `${API}/api/imports/history`,
        {
          headers: getAuthHeaders(),
        },
      );
      setHistoryData(data);
    } catch (err) {
      console.error("Failed to fetch history", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const filtered = historyData.filter(
    (row) =>
      row.original_filename.toLowerCase().includes(search.toLowerCase()) ||
      String(row.id).includes(search.toLowerCase()),
  );

  const hasInsertedRows = (row: ImportRow) => (row.rows_inserted ?? 0) > 0;
  const isSuccessfulImport = (row: ImportRow) =>
    normalizedStatus(row.status) === "SUCCESS" && hasInsertedRows(row);
  const rollbackAvailable = (row: ImportRow) =>
    isSuccessfulImport(row) &&
    row.rollback_status !== "ROLLED_BACK" &&
    row.rollback_status !== "UNAVAILABLE" &&
    Boolean(row.rollback_query);
  const logFileAvailable = (row: ImportRow) => isSuccessfulImport(row);

  const rollbackDisabledReason = (row: ImportRow) => {
    if (normalizedStatus(row.status) !== "SUCCESS")
      return "Only successful uploads can be rolled back.";
    if (!hasInsertedRows(row))
      return "Rollback is unavailable because no rows were inserted.";
    if (row.rollback_status === "ROLLED_BACK")
      return "This upload has already been rolled back.";
    if (row.rollback_status === "UNAVAILABLE")
      return row.rollback_error_message ?? "The Snowflake target is not available.";
    if (!row.rollback_query) return "Rollback query is not available.";
    return "";
  };

  const logFileUrl = (row: ImportRow) => {
    const params = new URLSearchParams({
      import_id: String(row.id),
      date: row.uploaded_at.slice(0, 10),
      file: row.original_filename,
      database_name: row.database_name,
      schema_name: row.schema_name,
    });
    return `/log-files?${params.toString()}`;
  };

  const rollbackScope = (row: ImportRow) => {
    const plan = row.rollback_plan;
    if (!plan || plan.version !== 2) {
      return `This legacy upload uses an isolated schema. Rollback removes ${row.database_name}.${row.schema_name}.`;
    }
    if (plan.database_created) {
      return `This upload created database ${row.database_name}. Rollback removes it only when no newer active imports depend on it.`;
    }
    if (plan.schema_created) {
      return `This upload created schema ${row.database_name}.${row.schema_name}. Rollback removes it only when no newer active imports depend on it.`;
    }
    const newTables = (plan.tables ?? [])
      .filter((table) => table.created)
      .map((table) => table.name);
    const appendedTables = (plan.tables ?? [])
      .filter((table) => !table.created && table.rows_inserted > 0)
      .map((table) => table.name);
    const actions = [
      newTables.length ? `drop new table(s): ${newTables.join(", ")}` : "",
      appendedTables.length
        ? `delete only this import's rows from: ${appendedTables.join(", ")}`
        : "",
    ].filter(Boolean);
    return actions.length
      ? `Rollback will ${actions.join("; ")}. Existing database, schema, tables, and older rows stay unchanged.`
      : "This upload has no recorded Snowflake changes to remove.";
  };

  const runRollback = async () => {
    if (!rollbackTarget) return;
    setRollbackLoadingId(rollbackTarget.id);
    setNotice(null);
    try {
      const { data } = await axios.post(
        `${API}/api/imports/${rollbackTarget.id}/rollback`,
        null,
        {
          headers: getAuthHeaders(),
        },
      );
      setNotice({
        type: "success",
        message:
          data?.message ??
          `Upload #${rollbackTarget.id} rolled back successfully.`,
      });
      setRollbackTarget(null);
      await fetchHistory();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setNotice({
        type: "error",
        message:
          error.response?.data?.detail ??
          "Rollback failed. Check backend logs for details.",
      });
      setRollbackTarget(null);
      await fetchHistory();
    } finally {
      setRollbackLoadingId(null);
    }
  };

  const rollbackBadgeClass = (status: string) =>
    clsx(
      "inline-flex rounded-full border px-2.5 py-1 text-xs font-medium",
      status === "ROLLED_BACK"
        ? "border-blue-200 bg-blue-50 text-blue-600 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-300"
        : status === "UNAVAILABLE"
          ? "border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
        : status === "FAILED"
          ? "border-red-200 bg-red-50 text-red-600 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300"
          : "border-amber-200 bg-amber-50 text-amber-600 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300",
    );

  const normalizedStatus = (status: string) => status.toUpperCase();

  const statusBadgeClass = (status: string) => {
    const normalized = normalizedStatus(status);
    return clsx(
      "px-2.5 py-1 rounded-full text-xs font-medium border",
      normalized === "SUCCESS" &&
        "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20",
      normalized === "FAILED" &&
        "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/20",
      (normalized === "PROCESSING" || normalized === "RUNNING") &&
        "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/20",
      normalized === "PENDING" &&
        "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-300 border-amber-200 dark:border-amber-500/20",
    );
  };

  const prepareRollback = async (row: ImportRow) => {
    setRollbackLoadingId(row.id);
    setNotice(null);
    try {
      const { data } = await axios.get(
        `${API}/api/imports/${row.id}/rollback-readiness`,
        { headers: getAuthHeaders() },
      );
      if (!data.available) {
        setNotice({
          type: "error",
          message: data.reason ?? "Rollback is not available for this import.",
        });
        return;
      }
      setRollbackTarget({
        ...row,
        rollback_query: data.rollback_query ?? row.rollback_query,
      });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } } };
      setNotice({
        type: "error",
        message:
          error.response?.data?.detail ??
          "Could not verify rollback readiness.",
      });
    } finally {
      setRollbackLoadingId(null);
    }
  };

  const statusLabel = (status: string) => {
    const normalized = normalizedStatus(status);
    if (normalized === "SUCCESS") return t("importHistory.statusSuccess");
    if (normalized === "FAILED") return t("importHistory.statusFailed");
    if (normalized === "PROCESSING" || normalized === "RUNNING") return "Processing";
    if (normalized === "PENDING") return "Pending";
    return status;
  };

  const errorDetails = errorTarget
    ? [
        ["File", errorTarget.original_filename],
        ["Step", errorTarget.failure_step ?? "Unknown"],
        ["Error Type", errorTarget.error_type ?? "Unknown"],
        ["Message", errorTarget.error_message ?? "No error message was stored."],
        ["Inserted Rows", String(errorTarget.rows_inserted ?? 0)],
        [
          "Timestamp",
          new Date(errorTarget.failed_at ?? errorTarget.uploaded_at).toLocaleString(),
        ],
        ["Table", errorTarget.failed_table_name ?? "N/A"],
        ["Rollback", errorTarget.rollback_status ?? "N/A"],
      ]
    : [];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500 text-slate-900 dark:text-white transition-colors duration-300">
      {/* Rollback Confirm Modal */}
      {rollbackTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10 text-orange-500">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-lg font-bold">Confirm rollback</h3>
                  <p className="text-sm text-slate-500">
                    Upload #{rollbackTarget.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setRollbackTarget(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {rollbackScope(rollbackTarget)}
              </p>
              {rollbackTarget.rollback_status === "FAILED" &&
                rollbackTarget.rollback_error_message && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-200">
                    Previous attempt failed: {rollbackTarget.rollback_error_message}
                  </div>
                )}
              <pre className="max-h-36 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                {rollbackTarget.rollback_query}
              </pre>
            </div>
            <div className="flex justify-end gap-3 border-t border-slate-200 p-5 dark:border-slate-700">
              <button
                onClick={() => setRollbackTarget(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={runRollback}
                disabled={rollbackLoadingId === rollbackTarget.id}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:opacity-60"
              >
                {rollbackLoadingId === rollbackTarget.id && (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                )}
                Rollback
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Details Modal */}
      {errorTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-slate-700">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-lg font-bold">Import failure details</h3>
                  <p className="text-sm text-slate-500">
                    Upload #{errorTarget.id}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setErrorTarget(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-5">
              <dl className="grid gap-3 sm:grid-cols-2">
                {errorDetails.map(([label, value]) => (
                  <div
                    key={label}
                    className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50"
                  >
                    <dt className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      {label}
                    </dt>
                    <dd className="mt-1 break-words text-sm font-medium text-slate-800 dark:text-slate-100">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              {errorTarget.sql_error_details && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                    SQL error details
                  </p>
                  <pre className="max-h-48 overflow-auto rounded-lg bg-slate-950 p-3 text-xs text-slate-100">
                    {errorTarget.sql_error_details}
                  </pre>
                </div>
              )}
            </div>
            <div className="flex justify-end border-t border-slate-200 p-5 dark:border-slate-700">
              <button
                onClick={() => setErrorTarget(null)}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Notice */}
      {notice && (
        <div
          className={clsx(
            "rounded-xl border p-4 text-sm font-medium",
            notice.type === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300"
              : "border-red-200 bg-red-50 text-red-700 dark:border-red-500/20 dark:bg-red-500/10 dark:text-red-300",
          )}
        >
          {notice.message}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">
            {t("importHistory.title")}
          </h2>
          <p className="text-slate-600 dark:text-slate-400 transition-colors">
            {t("importHistory.subtitle")}
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={t("importHistory.search")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm rounded-lg pl-9 pr-4 py-2 w-full md:w-64 focus:outline-none focus:border-snowflake focus:ring-1 focus:ring-snowflake text-slate-900 dark:text-white transition-colors duration-300 shadow-sm"
            />
          </div>
          <button
            onClick={fetchHistory}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm"
          >
            <RefreshCw
              className={clsx("w-4 h-4", isLoading && "animate-spin")}
            />
          </button>
          <button className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-2 rounded-lg text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-sm">
            <Filter className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur border border-slate-200/50 dark:border-slate-700/50 rounded-2xl overflow-hidden shadow-lg transition-colors duration-300">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold transition-colors duration-300">
                <th className="p-4">{t("importHistory.colId")}</th>
                <th className="p-4">{t("importHistory.colFile")}</th>
                <th className="p-4">{t("importHistory.colDate")}</th>
                <th className="p-4">{t("importHistory.colRows")}</th>
                <th className="p-4">{t("importHistory.colStatus")}</th>
                <th className="p-4">Log File</th>
                <th className="p-4">Rollback</th>
                <th className="p-4">{t("importHistory.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700/50 transition-colors duration-300">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="p-8 text-center text-slate-400 text-sm"
                  >
                    Aucun import trouvé.
                  </td>
                </tr>
              ) : (
                filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-slate-100/50 dark:hover:bg-slate-700/20 transition-colors group"
                  >
                    <td className="p-4 text-sm font-medium text-slate-600 dark:text-slate-300">
                      {row.id}
                    </td>
                    <td className="p-4 text-sm font-medium text-slate-900 dark:text-white">
                      {row.original_filename}
                    </td>
                    <td className="p-4 text-sm text-slate-500 dark:text-slate-400">
                      {new Date(row.uploaded_at).toLocaleString()}
                    </td>
                    <td className="p-4 text-sm text-slate-600 dark:text-slate-300">
                      {(row.rows_inserted ?? 0).toLocaleString()}
                    </td>
                    <td className="p-4">
                      <button
                        type="button"
                        disabled={normalizedStatus(row.status) !== "FAILED"}
                        onClick={() => setErrorTarget(row)}
                        className={clsx(
                          statusBadgeClass(row.status),
                          normalizedStatus(row.status) === "FAILED"
                            ? "cursor-pointer transition hover:ring-2 hover:ring-red-200 dark:hover:ring-red-500/30"
                            : "cursor-default",
                        )}
                      >
                        {statusLabel(row.status)}
                      </button>
                    </td>
                    <td className="p-4">
                      {logFileAvailable(row) ? (
                        <Link
                          to={logFileUrl(row)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/20 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
                          title={`View logs for upload #${row.id}`}
                        >
                          <FileText className="h-4 w-4" />
                          View Log File
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-500">
                          <FileText className="h-4 w-4" />
                          No log file
                        </span>
                      )}
                    </td>
                    <td className="p-4">
                      <span
                        title={
                          row.rollback_status === "UNAVAILABLE"
                            ? rollbackDisabledReason(row)
                            : undefined
                        }
                        className={
                          rollbackAvailable(row)
                            ? "inline-flex rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-600 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-300"
                            : rollbackBadgeClass(row.rollback_status)
                        }
                      >
                        {row.rollback_status === "ROLLED_BACK"
                          ? "Rolled Back"
                          : row.rollback_status === "FAILED"
                            ? "Retry available"
                            : row.rollback_status === "UNAVAILABLE"
                              ? "Unavailable"
                            : rollbackAvailable(row)
                              ? "Available"
                              : "Not available"}
                      </span>
                    </td>
                    <td className="p-4">
                      {rollbackAvailable(row) ? (
                        <button
                          title={rollbackDisabledReason(row) || "Rollback upload"}
                          disabled={rollbackLoadingId === row.id}
                          onClick={() => prepareRollback(row)}
                          className="flex items-center space-x-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-orange-500 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-400 dark:hover:text-orange-400"
                        >
                          <Undo2 className="w-4 h-4" />
                          {rollbackLoadingId === row.id ? (
                            <span>Rolling back...</span>
                          ) : (
                            <span>{t("importHistory.rollback")}</span>
                          )}
                        </button>
                      ) : (
                        <span
                          title={rollbackDisabledReason(row)}
                          className="text-sm font-medium text-slate-400 dark:text-slate-500"
                        >
                          No rollback
                        </span>
                      )}
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

export default ImportHistory;
