import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  UploadCloud, FileSpreadsheet, CheckCircle2,
  AlertCircle, RefreshCw, X, AlertTriangle,
  PlusCircle, ArrowDownCircle, Building2, ScanSearch,
  Rows3, Eraser, Database, Columns3
} from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTranslation } from 'react-i18next';
import axios from 'axios';
import { useAuth } from '../../contexts/AuthContext';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// ── Types ──────────────────────────────────────────────────────

interface NullColumnInfo {
  column: string;
  null_count: number;
  null_percent: number;
}

interface QualityProfile {
  original_rows: number;
  cleaned_rows: number;
  rows_removed: number;
  empty_rows_removed: number;
  duplicate_rows_removed: number;
  malformed_rows_removed: number;
  original_columns: number;
  cleaned_columns: number;
  empty_columns_removed: number;
  empty_column_names: string[];
  columns_renamed: { from: string; to: string }[];
  invalid_values_replaced: number;
  null_cells_remaining: number;
  rows_with_nulls: number;
  null_columns: NullColumnInfo[];
  null_heavy_columns: NullColumnInfo[];
  sample_rows: Record<string, unknown>[];
  cleaning_actions: string[];
}

interface TableInfo {
  rows:    number;
  columns: string[];
  table_name?: string;
  action:  'CREATE' | 'INSERT' | 'REPLACE';
  warnings?: string[];
  quality?: QualityProfile;
}

interface AnalyzeResult {
  session_id:      string;
  org_name:        string;
  schema?:         string;
  db_available?:   boolean;
  db_error?:       string | null;
  org_exists:      boolean;
  preview:         Record<string, TableInfo>;
  duplicates:      Record<string, { count: number; examples?: Record<string, unknown>[] }>;
  has_duplicates:  boolean;
  invalid_values?: Record<string, { count: number; examples: { column: string; row: number; value: string }[] }>;
  has_invalid_values?: boolean;
  quality_summary: {
    original_rows: number;
    cleaned_rows: number;
    rows_removed: number;
    empty_rows_removed: number;
    duplicate_rows_removed: number;
    malformed_rows_removed: number;
    invalid_values_replaced: number;
    null_cells_remaining: number;
    rows_with_nulls: number;
    empty_columns_removed: number;
    importable_sources: number;
    empty_sources: number;
  };
  can_import: boolean;
  blocking_issues: string[];
  existing_tables: string[];
  new_tables:      string[];
}

interface ImportUploadResult {
  success: boolean;
  database: string;
  schema: string;
  tables_created: string[];
  rows_inserted: number;
  import_id: number;
}

// ── Popup Component ────────────────────────────────────────────

const ConfirmPopup = ({
  result, onConfirm, onCancel, isLoading
}: {
  result: AnalyzeResult;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}) => (
  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">
          Confirmation avant sauvegarde
        </h2>
        <button onClick={onCancel} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="overflow-y-auto flex-1 p-6 space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300">
            <ScanSearch className="h-5 w-5" />
          </span>
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">Scan qualité terminé</p>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Vérifiez ce qui a été nettoyé et ce qui sera conservé avant le chargement.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 md:grid-cols-5 dark:border-slate-700 dark:bg-slate-700">
          {[
            { label: 'Lignes prêtes', value: `${result.quality_summary.cleaned_rows} / ${result.quality_summary.original_rows}`, icon: Rows3, tone: 'text-sky-600' },
            { label: 'Lignes supprimées', value: result.quality_summary.rows_removed, icon: Eraser, tone: 'text-amber-600' },
            { label: 'Doublons supprimés', value: result.quality_summary.duplicate_rows_removed, icon: AlertTriangle, tone: 'text-orange-600' },
            { label: 'Valeurs normalisées', value: result.quality_summary.invalid_values_replaced, icon: CheckCircle2, tone: 'text-emerald-600' },
            { label: 'NULL conservés', value: result.quality_summary.null_cells_remaining, icon: Database, tone: 'text-violet-600' },
          ].map(({ label, value, icon: Icon, tone }) => (
            <div key={label} className="bg-white px-4 py-3 dark:bg-slate-900">
              <Icon className={clsx('h-4 w-4', tone)} />
              <p className="mt-2 text-xl font-bold text-slate-900 dark:text-white">{value}</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</p>
            </div>
          ))}
        </div>

        <div className="rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-200">
          Les lignes entièrement vides et les doublons exacts sont supprimés. Les lignes partiellement vides sont conservées et leurs valeurs manquantes restent NULL.
        </div>

        {/* Organization database status */}
        {result.org_exists ? (
          <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg p-4">
            <ArrowDownCircle className="w-5 h-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-blue-800 dark:text-blue-300">Base organisation existante</p>
              <p className="text-sm text-blue-600 dark:text-blue-400 mt-0.5">
                La base Snowflake <span className="font-mono font-bold">"{result.org_name}"</span> existe.
                Le schema du fichier sera reutilise. Une structure identique recevra de nouvelles lignes; une structure differente creera une table distincte.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 rounded-lg p-4">
            <PlusCircle className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-800 dark:text-emerald-300">Nouvelle base organisation</p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-0.5">
                La base Snowflake <span className="font-mono font-bold">"{result.org_name}"</span> sera créée automatiquement.
              </p>
            </div>
          </div>
        )}

        {result.db_available === false && (
          <div className="flex items-start gap-3 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg p-4">
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-red-800 dark:text-red-300">PostgreSQL non connecte</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-0.5">
                L'analyse est terminee, mais la sauvegarde demandera PostgreSQL et DATABASE_URL.
              </p>
            </div>
          </div>
        )}

        {!result.can_import && (
          <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
            <div>
              <p className="font-semibold text-red-800 dark:text-red-300">Chargement bloqué</p>
              {result.blocking_issues.map((issue) => <p key={issue} className="mt-1 text-sm text-red-700 dark:text-red-400">{issue}</p>)}
            </div>
          </div>
        )}

        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
              Diagnostic par table ({Object.keys(result.preview).length})
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">Ouvrez une table pour voir les détails</p>
          </div>
          <div className="divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 dark:divide-slate-700 dark:border-slate-700">
            {Object.entries(result.preview).map(([sheet, info]) => {
              const quality = info.quality;
              return (
                <details key={sheet} className="group bg-white open:bg-slate-50 dark:bg-slate-900 dark:open:bg-slate-800/50">
                  <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Columns3 className="h-4 w-4 shrink-0 text-sky-500" />
                        <p className="truncate font-mono text-sm font-semibold text-slate-900 dark:text-white">{sheet}</p>
                      </div>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {quality?.original_rows ?? info.rows} lignes source → {info.rows} prêtes · {info.columns.length} colonnes
                      </p>
                      <p className="mt-1 truncate font-mono text-xs text-sky-600 dark:text-sky-400">
                        Target: {info.table_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {!!quality?.rows_removed && <span className="rounded bg-amber-100 px-2 py-1 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">-{quality.rows_removed} lignes</span>}
                      {!!quality?.null_cells_remaining && <span className="rounded bg-violet-100 px-2 py-1 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">{quality.null_cells_remaining} NULL</span>}
                      <span
                        className={clsx(
                          "rounded px-2 py-1 font-medium",
                          info.action === "INSERT"
                            ? "bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
                            : "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
                        )}
                      >
                        {info.action === "INSERT" ? "INSERT ROWS" : "CREATE TABLE"}
                      </span>
                    </div>
                  </summary>
                  <div className="border-t border-slate-200 px-4 py-4 text-sm dark:border-slate-700">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">Nettoyage appliqué</p>
                        <ul className="mt-2 space-y-1 text-xs text-slate-600 dark:text-slate-400">
                          {(quality?.cleaning_actions ?? ['Aucun nettoyage automatique requis']).map((action) => <li key={action}>• {action}</li>)}
                        </ul>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-800 dark:text-slate-100">Valeurs manquantes conservées</p>
                        {quality?.null_columns?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {quality.null_columns.slice(0, 8).map((column) => (
                              <span key={column.column} className="rounded border border-slate-200 bg-white px-2 py-1 font-mono text-xs text-slate-600 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                {column.column}: {column.null_count} ({column.null_percent}%)
                              </span>
                            ))}
                          </div>
                        ) : <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">Aucune valeur NULL restante.</p>}
                      </div>
                    </div>
                    {!!quality?.columns_renamed?.length && (
                      <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                        Colonnes renommées: {quality.columns_renamed.slice(0, 5).map((item) => `${item.from} → ${item.to}`).join(', ')}
                      </p>
                    )}
                    {!!info.warnings?.length && (
                      <div className="mt-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
                        {info.warnings.join(' ')}
                      </div>
                    )}
                    {!!quality?.sample_rows?.length && (
                      <div className="mt-4">
                        <p className="mb-2 font-semibold text-slate-800 dark:text-slate-100">Aperçu après nettoyage</p>
                        <div className="overflow-x-auto rounded border border-slate-200 dark:border-slate-700">
                          <table className="min-w-full text-xs">
                            <thead className="bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                              <tr>
                                {info.columns.slice(0, 6).map((column) => <th key={column} className="whitespace-nowrap px-3 py-2 text-left font-semibold">{column}</th>)}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 bg-white dark:divide-slate-700 dark:bg-slate-800">
                              {quality.sample_rows.map((row, rowIndex) => (
                                <tr key={`${sheet}-preview-${rowIndex}`}>
                                  {info.columns.slice(0, 6).map((column) => (
                                    <td key={column} className={clsx('max-w-48 truncate whitespace-nowrap px-3 py-2', row[column] == null ? 'italic text-violet-500' : 'text-slate-600 dark:text-slate-300')}>
                                      {row[column] == null ? 'NULL' : String(row[column])}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>

        {/* Duplicates */}
        {false && result.has_duplicates && (
          <div className="flex items-start gap-3 bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-lg p-4">
            <AlertTriangle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-yellow-800 dark:text-yellow-300">Doublons détectés et supprimés</p>
              {Object.entries(result.duplicates).map(([sheet, info]) => (
                <p key={sheet} className="text-sm text-yellow-700 dark:text-yellow-400 mt-1">
                  • <span className="font-mono">{sheet}</span> : {info.count} doublon(s)
                </p>
              ))}
            </div>
          </div>
        )}

        {false && result.has_invalid_values && result.invalid_values && (
          <div className="flex items-start gap-3 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-lg p-4">
            <AlertCircle className="w-5 h-5 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-orange-800 dark:text-orange-300">Valeurs invalides remplacees par NULL</p>
              {Object.entries(result.invalid_values ?? {}).map(([sheet, info]) => (
                <div key={sheet} className="text-sm text-orange-700 dark:text-orange-400 mt-1">
                  <span className="font-mono">{sheet}</span> : {info.count} valeur(s)
                  {info.examples.slice(0, 3).map((example) => (
                    <p key={`${sheet}-${example.column}-${example.row}`} className="text-xs opacity-80 ml-2">
                      Ligne {example.row}, {example.column}: "{example.value || 'vide'}"
                    </p>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tables list */}
        <div className="hidden">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Tables à traiter ({Object.keys(result.preview).length})
          </p>
          <div className="space-y-2">
            {Object.entries(result.preview).map(([sheet, info]) => (
              <div key={sheet} className="flex items-center justify-between border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 bg-slate-50 dark:bg-slate-800/50">
                <div>
                  <p className="font-mono text-sm font-medium text-slate-900 dark:text-white">
                    {sheet.toLowerCase()}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {info.rows} lignes · {info.columns.length} colonnes
                  </p>
                </div>
                <span className={clsx(
                  'text-xs font-medium px-2.5 py-1 rounded-full',
                  info.action === 'CREATE'
                    ? 'bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400'
                    : 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400'
                )}>
                  {info.action}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-3 p-6 border-t border-slate-200 dark:border-slate-700">
        <button
          onClick={onCancel}
          disabled={isLoading}
          className="px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
        >
          Annuler
        </button>
        <button
          onClick={onConfirm}
          disabled={isLoading || result.db_available === false || !result.can_import}
          className="px-6 py-2.5 rounded-lg bg-snowflake hover:bg-snowflake-dark text-white font-medium transition-colors flex items-center gap-2 disabled:opacity-60 shadow-lg shadow-snowflake/20"
        >
          {isLoading ? (
            <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Sauvegarde...</>
          ) : (
            <><CheckCircle2 className="w-4 h-4" />Confirmer et sauvegarder</>
          )}
        </button>
      </div>
    </div>
  </div>
);

// ── Main Component ─────────────────────────────────────────────

const UploadCenter = () => {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [file,            setFile]            = useState<File | null>(null);
  const [isUploading,     setIsUploading]     = useState(false);
  const [validationStage, setValidationStage] = useState<'idle'|'validating'|'success'|'error'>('idle');
  const [analyzeResult,   setAnalyzeResult]   = useState<AnalyzeResult | null>(null);
  const [showPopup,       setShowPopup]       = useState(false);
  const [errorMsg,        setErrorMsg]        = useState('');

  const authHeaders = localStorage.getItem('token')
  ? { Authorization: `Bearer ${localStorage.getItem('token')}` }
  : {};
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setValidationStage('idle');
      setAnalyzeResult(null);
      setErrorMsg('');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
  });

  // ── Remplace simulateValidation() ─────────────────────────
  const handleAnalyze = async () => {
    if (!file) return;

    setIsUploading(true);
    setValidationStage('validating');
    setErrorMsg('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const { data } = await axios.post<AnalyzeResult>(
        `${API}/api/imports/analyze`, formData,
        { headers: { ...authHeaders, 'Content-Type': 'multipart/form-data' } }
      );
      setAnalyzeResult(data);
      setValidationStage('success');
      setShowPopup(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setValidationStage('error');
      setErrorMsg(e?.response?.data?.detail ?? 'Erreur lors de l\'analyse.');
    } finally {
      setIsUploading(false);
    }
  };

  // ── Remplace handleUpload() — appelé depuis le popup ──────
  const handleConfirm = async () => {
    if (!analyzeResult) return;

    setIsUploading(true);

    try {
      const { data } = await axios.post<ImportUploadResult>(`${API}/api/imports/confirm`, {
        session_id: analyzeResult.session_id,
      }, { headers: authHeaders });

      setShowPopup(false);
      setFile(null);
      setValidationStage('idle');
      setAnalyzeResult(null);
      alert(
        `File loaded into Snowflake.\nDatabase: ${data.database}\nSchema: ${data.schema}\nRows: ${data.rows_inserted}\nTables: ${data.tables_created.join(', ')}`
      );

    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      setShowPopup(false);
      setValidationStage('error');
      setErrorMsg(e?.response?.data?.detail ?? 'Erreur lors de la sauvegarde.');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      {showPopup && analyzeResult && (
        <ConfirmPopup
          result={analyzeResult}
          onConfirm={handleConfirm}
          onCancel={() => setShowPopup(false)}
          isLoading={isUploading}
        />
      )}

      <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in zoom-in-95 duration-500 text-slate-900 dark:text-white transition-colors duration-300">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-3xl font-bold tracking-tight">{t('upload.title')}</h2>
            <p className="text-slate-600 dark:text-slate-400 transition-colors">{t('upload.subtitle')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 dark:border-sky-500/20 dark:bg-sky-500/10">
          <Building2 className="h-5 w-5 shrink-0 text-sky-600 dark:text-sky-300" />
          <div>
            <p className="text-xs font-semibold uppercase text-sky-600 dark:text-sky-400">Snowflake database</p>
            <p className="text-sm font-bold text-sky-800 dark:text-sky-200">
              {user?.organization_name || (user?.organization_id ? 'Assigned organization' : 'Organization not assigned')}
            </p>
          </div>
        </div>

        {/* Dropzone */}
        {!file ? (
          <div
            {...getRootProps()}
            className={twMerge(clsx(
              'border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center transition-all duration-200 cursor-pointer group bg-slate-50 dark:bg-slate-800/30',
              isDragActive
                ? 'border-snowflake bg-snowflake/5'
                : 'border-slate-300 dark:border-slate-700 hover:border-snowflake dark:hover:border-snowflake hover:bg-slate-100 dark:hover:bg-slate-800/80',
            ))}
          >
            <input {...getInputProps()} />
            <div className="w-16 h-16 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center mb-6 shadow-sm dark:shadow-none group-hover:scale-110 group-hover:bg-snowflake/10 dark:group-hover:bg-snowflake/20 transition-all duration-300">
              <UploadCloud className={clsx('w-8 h-8', isDragActive ? 'text-snowflake' : 'text-slate-400 group-hover:text-snowflake')} />
            </div>
            <h3 className="text-xl font-semibold mb-2">
              {isDragActive ? t('upload.dropHere') : t('upload.clickOrDrag')}
            </h3>
            <p className="text-slate-500 text-sm">{t('upload.supports')}</p>
          </div>

        ) : (

          <div className="bg-white dark:bg-slate-800/50 backdrop-blur border border-slate-200 dark:border-slate-700 rounded-2xl p-8 shadow-md dark:shadow-none transition-colors duration-300">
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-4">
                <div className="p-3 bg-snowflake/10 rounded-xl">
                  <FileSpreadsheet className="text-snowflake w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold">{file.name}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 transition-colors">
                    {(file.size / 1024).toFixed(2)} KB · Modified {new Date(file.lastModified).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setFile(null); setValidationStage('idle'); setErrorMsg(''); }}
                className="text-sm text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
                disabled={isUploading || validationStage === 'validating'}
              >
                {t('upload.cancel')}
              </button>
            </div>

            {/* Validation Status */}
            <div className="mt-8 border-t border-slate-200 dark:border-slate-700 pt-6 transition-colors">
              <h4 className="text-sm font-medium text-slate-500 dark:text-slate-300 mb-4 uppercase tracking-wider">
                {t('upload.validationStatus')}
              </h4>

              {validationStage === 'validating' && (
                <div className="flex items-center space-x-3 text-snowflake animate-pulse">
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>{t('upload.validating')}</span>
                </div>
              )}

              {validationStage === 'success' && (
                <div className="bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 rounded-lg p-4 flex items-start space-x-3 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-emerald-700 dark:text-emerald-300">{t('upload.validationPassed')}</p>
                    <p className="text-sm opacity-80 mt-1">{t('upload.validationPassedDesc')}</p>
                  </div>
                </div>
              )}

              {validationStage === 'error' && (
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-4 flex items-start space-x-3 text-red-600 dark:text-red-400">
                  <AlertCircle className="w-5 h-5 mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium text-red-700 dark:text-red-300">{t('upload.validationFailed')}</p>
                    <p className="text-sm opacity-80 mt-1">{errorMsg || t('upload.validationFailedDesc')}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Action — Remplace handleUpload */}
            <div className="mt-8 flex justify-end">
              <button
                onClick={handleAnalyze}
                disabled={!user?.organization_id || isUploading || validationStage === 'validating'}
                className={clsx(
                  'px-6 py-2.5 rounded-lg font-medium flex items-center space-x-2 transition-all shadow-lg',
                  user?.organization_id && !isUploading
                    ? 'bg-snowflake hover:bg-snowflake-dark text-white shadow-snowflake/20'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                )}
              >
                {isUploading ? (
                  <><RefreshCw className="w-4 h-4 animate-spin" /><span>{t('upload.pushing')}</span></>
                ) : (
                  <><UploadCloud className="w-4 h-4" /><span>{t('upload.sendToSnowflake')}</span></>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default UploadCenter;
