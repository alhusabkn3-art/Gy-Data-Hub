import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Cpu, RefreshCw, Eye, EyeOff, CheckCircle2, XCircle, AlertCircle,
  Zap, Activity, Save, Loader2, ToggleLeft, ToggleRight, List, Clock,
} from 'lucide-react';
import {
  apiGetApiConfigs, apiUpdateApiConfig, apiCheckApiStatus,
  apiGetApiErrorLogs, apiGetApiTransactionLogs,
  type ApiConfig, type ApiLogEntry,
} from '../utils/adminApi';

// ── Helpers ──────────────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded-lg ${className}`} />;
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function EmptyState({ icon: Icon, title, subtitle }: { icon: React.ElementType; title: string; subtitle?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-12 h-12 rounded-2xl bg-white/5 flex items-center justify-center mb-3">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-white mb-1">{title}</p>
      {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

// ── Custom pill toggle ────────────────────────────────────────────────────────

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function PillToggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex items-center h-5 w-10 rounded-full transition-colors flex-shrink-0 focus:outline-none ${
        checked ? 'bg-primary' : 'bg-white/10'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      aria-checked={checked}
      role="switch"
    >
      <span
        className={`absolute left-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: 'online' | 'offline' | 'unknown' }) {
  if (status === 'online') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-400">
        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Online
      </span>
    );
  }
  if (status === 'offline') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-400">
        <span className="w-1.5 h-1.5 rounded-full bg-red-400" /> Offline
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-500/15 text-zinc-400">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" /> Unknown
    </span>
  );
}

function HttpStatusBadge({ code }: { code: number | null }) {
  if (!code) return <span className="text-xs text-muted-foreground">—</span>;
  const cls =
    code < 300
      ? 'bg-green-500/15 text-green-400'
      : code < 500
      ? 'bg-yellow-500/15 text-yellow-400'
      : 'bg-red-500/15 text-red-400';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium ${cls}`}>
      {code}
    </span>
  );
}

// ── API icon color map ────────────────────────────────────────────────────────

const API_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  clubkonnect: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/20' },
  monnify: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20' },
  paystack: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/20' },
  flutterwave: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20' },
};

function getApiColor(key: string) {
  return API_COLORS[key.toLowerCase()] ?? { bg: 'bg-primary/10', text: 'text-primary', border: 'border-primary/20' };
}

// ── Masked value display ──────────────────────────────────────────────────────

function maskValue(v: string, revealed: boolean): string {
  if (!v) return '—';
  if (!revealed) return '••••••••' + v.slice(-4);
  return v;
}

// ── API Config Card ───────────────────────────────────────────────────────────

interface ApiCardProps {
  config: ApiConfig;
  latency: number | null;
  onToggleEnabled: (key: string, enabled: boolean) => Promise<void>;
  onSaveFields: (key: string, fields: Record<string, string>) => Promise<void>;
}

function ApiCard({ config, latency, onToggleEnabled, onSaveFields }: ApiCardProps) {
  const [editing, setEditing] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    Object.fromEntries(config.fields.map(f => [f.name, f.value])),
  );
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [togglingEnabled, setTogglingEnabled] = useState(false);
  const [saveError, setSaveError] = useState('');

  const color = getApiColor(config.key);
  const hasUnconfigured = config.fields.some(f => !f.value);

  // Sync when config prop changes (e.g. after status check)
  useEffect(() => {
    if (!editing) {
      setFieldValues(Object.fromEntries(config.fields.map(f => [f.name, f.value])));
    }
  }, [config, editing]);

  function toggleReveal(name: string) {
    setRevealed(p => ({ ...p, [name]: !p[name] }));
  }

  async function handleToggleEnabled(v: boolean) {
    setTogglingEnabled(true);
    try {
      await onToggleEnabled(config.key, v);
    } finally {
      setTogglingEnabled(false);
    }
  }

  async function handleSave() {
    setSaveError('');
    setSaving(true);
    try {
      await onSaveFields(config.key, fieldValues);
      setEditing(false);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setFieldValues(Object.fromEntries(config.fields.map(f => [f.name, f.value])));
    setSaveError('');
    setEditing(false);
  }

  return (
    <div className="bg-[#0D1F3C] rounded-2xl border border-white/[0.06] p-5 flex flex-col gap-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color.bg} border ${color.border}`}>
            <Cpu className={`w-5 h-5 ${color.text}`} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-white truncate">{config.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">{config.key}</p>
          </div>
        </div>
        <PillToggle checked={config.enabled} onChange={handleToggleEnabled} disabled={togglingEnabled} />
      </div>

      {/* Status row */}
      <div className="flex items-center gap-3 flex-wrap">
        <StatusDot status={config.status} />
        {latency !== null && (
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Zap className="w-3 h-3 text-yellow-400" /> {latency}ms
          </span>
        )}
        {config.lastChecked && (
          <span className="text-xs text-muted-foreground ml-auto">
            Checked {fmtTime(config.lastChecked)}
          </span>
        )}
      </div>

      {/* Warning banner */}
      {hasUnconfigured && (
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <p className="text-xs text-amber-400">Some fields are not configured</p>
        </div>
      )}

      {/* Fields */}
      <div className="space-y-2">
        {config.fields.map(field => (
          <div key={field.name} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">{field.label}</p>
              {editing ? (
                <input
                  type={field.sensitive && !revealed[field.name] ? 'password' : 'text'}
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-primary/50 font-mono"
                  value={fieldValues[field.name] ?? ''}
                  onChange={e => setFieldValues(p => ({ ...p, [field.name]: e.target.value }))}
                  placeholder={`Enter ${field.label}…`}
                />
              ) : (
                <p className="text-sm font-mono text-white truncate">
                  {field.sensitive
                    ? maskValue(field.value, !!revealed[field.name])
                    : field.value || <span className="text-muted-foreground italic text-xs">not set</span>}
                </p>
              )}
            </div>
            {field.sensitive && (
              <button
                onClick={() => toggleReveal(field.name)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-white hover:bg-white/5 transition-colors flex-shrink-0 mt-4"
                title={revealed[field.name] ? 'Hide' : 'Reveal'}
              >
                {revealed[field.name] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            )}
          </div>
        ))}
      </div>

      {saveError && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{saveError}</p>
      )}

      {/* Footer actions */}
      {editing ? (
        <div className="flex gap-2 pt-1">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 bg-primary text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-60 transition-colors hover:bg-primary/90"
          >
            {saving ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>
            ) : (
              <><Save className="w-4 h-4" /> Save</>
            )}
          </button>
          <button
            onClick={handleCancel}
            disabled={saving}
            className="px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-white hover:bg-white/5 border border-white/10 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm text-muted-foreground hover:text-white hover:bg-white/5 border border-white/10 transition-colors"
        >
          <Edit className="w-3.5 h-3.5" /> Edit Settings
        </button>
      )}
    </div>
  );
}

// We need Edit icon — use a simple pencil SVG inline since it's not in the import list
function Edit({ className = '' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

// ── Log Tabs ──────────────────────────────────────────────────────────────────

type LogTab = 'error' | 'transaction';

const LOG_TABS: { id: LogTab; label: string; icon: React.ElementType }[] = [
  { id: 'error', label: 'Error Logs', icon: XCircle },
  { id: 'transaction', label: 'Transaction Logs', icon: List },
];

const API_FILTER_OPTIONS = [
  { value: '', label: 'All APIs' },
  { value: 'clubkonnect', label: 'ClubKonnect' },
  { value: 'monnify', label: 'Monnify' },
];

// ── Error Log table row ───────────────────────────────────────────────────────

function ErrorLogRow({ log }: { log: ApiLogEntry }) {
  return (
    <tr className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors">
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtTime(log.createdAt)}</td>
      <td className="px-4 py-3">
        <span className="text-xs font-medium text-white capitalize">{log.api}</span>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground font-mono max-w-[200px] truncate">{log.endpoint}</td>
      <td className="px-4 py-3"><HttpStatusBadge code={log.statusCode} /></td>
      <td className="px-4 py-3 text-xs text-red-400 max-w-[200px] truncate">{log.error ?? '—'}</td>
    </tr>
  );
}

// ── Transaction Log table row ─────────────────────────────────────────────────

function TxLogRow({ log }: { log: ApiLogEntry }) {
  const isOk = log.statusCode !== null && log.statusCode < 300;
  return (
    <tr className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors">
      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtTime(log.createdAt)}</td>
      <td className="px-4 py-3">
        <span className="text-xs font-medium text-white capitalize">{log.api}</span>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground font-mono max-w-[160px] truncate">{log.endpoint}</td>
      <td className="px-4 py-3 text-xs font-mono text-muted-foreground max-w-[140px] truncate">{log.requestRef ?? '—'}</td>
      <td className="px-4 py-3"><HttpStatusBadge code={log.statusCode} /></td>
      <td className="px-4 py-3">
        {log.responseTime !== null ? (
          <span className={`text-xs font-mono ${log.responseTime > 3000 ? 'text-red-400' : log.responseTime > 1000 ? 'text-yellow-400' : 'text-green-400'}`}>
            {log.responseTime}ms
          </span>
        ) : <span className="text-xs text-muted-foreground">—</span>}
      </td>
    </tr>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════

export default function APIManagement() {
  // Configs
  const [configs, setConfigs] = useState<ApiConfig[]>([]);
  const [loadingConfigs, setLoadingConfigs] = useState(true);
  const [latencyMap, setLatencyMap] = useState<Record<string, number | null>>({});

  // Status check
  const [checkingStatus, setCheckingStatus] = useState(false);

  // Log tabs
  const [logTab, setLogTab] = useState<LogTab>('error');
  const [apiFilter, setApiFilter] = useState('');

  // Error logs
  const [errorLogs, setErrorLogs] = useState<ApiLogEntry[]>([]);
  const [errorTotal, setErrorTotal] = useState(0);
  const [errorPages, setErrorPages] = useState(1);
  const [errorPage, setErrorPage] = useState(1);
  const [loadingErrors, setLoadingErrors] = useState(false);

  // Transaction logs
  const [txLogs, setTxLogs] = useState<ApiLogEntry[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txPages, setTxPages] = useState(1);
  const [txPage, setTxPage] = useState(1);
  const [loadingTx, setLoadingTx] = useState(false);

  // Load configs on mount
  const loadConfigs = useCallback(async () => {
    setLoadingConfigs(true);
    try {
      const res = await apiGetApiConfigs();
      setConfigs(res.apis);
    } catch {
      /* silent */
    } finally {
      setLoadingConfigs(false);
    }
  }, []);

  useEffect(() => { loadConfigs(); }, [loadConfigs]);

  // Load error logs
  const loadErrorLogs = useCallback(async (page = 1, api = '') => {
    setLoadingErrors(true);
    try {
      const res = await apiGetApiErrorLogs({ api: api || undefined, page });
      if (page === 1) {
        setErrorLogs(res.logs);
      } else {
        setErrorLogs(p => [...p, ...res.logs]);
      }
      setErrorTotal(res.total);
      setErrorPages(res.pages);
      setErrorPage(page);
    } catch {
      /* silent */
    } finally {
      setLoadingErrors(false);
    }
  }, []);

  // Load transaction logs
  const loadTxLogs = useCallback(async (page = 1, api = '') => {
    setLoadingTx(true);
    try {
      const res = await apiGetApiTransactionLogs({ api: api || undefined, page });
      if (page === 1) {
        setTxLogs(res.logs);
      } else {
        setTxLogs(p => [...p, ...res.logs]);
      }
      setTxTotal(res.total);
      setTxPages(res.pages);
      setTxPage(page);
    } catch {
      /* silent */
    } finally {
      setLoadingTx(false);
    }
  }, []);

  // Initial log load
  useEffect(() => {
    loadErrorLogs(1, apiFilter);
  }, [loadErrorLogs, apiFilter]);

  useEffect(() => {
    if (logTab === 'transaction') {
      loadTxLogs(1, apiFilter);
    }
  }, [logTab, loadTxLogs, apiFilter]);

  // Check API status
  async function handleCheckStatus() {
    setCheckingStatus(true);
    try {
      const res = await apiCheckApiStatus();
      const newLatency: Record<string, number | null> = {};
      setConfigs(prev =>
        prev.map(c => {
          const result = res.results.find(r => r.key === c.key);
          if (result) {
            newLatency[c.key] = result.latency;
            return {
              ...c,
              status: result.status as ApiConfig['status'],
              lastChecked: result.checkedAt,
            };
          }
          return c;
        }),
      );
      setLatencyMap(newLatency);
    } catch {
      /* silent */
    } finally {
      setCheckingStatus(false);
    }
  }

  // Toggle enabled
  async function handleToggleEnabled(key: string, enabled: boolean) {
    await apiUpdateApiConfig(key, { enabled });
    setConfigs(prev => prev.map(c => c.key === key ? { ...c, enabled } : c));
  }

  // Save fields
  async function handleSaveFields(key: string, fields: Record<string, string>) {
    await apiUpdateApiConfig(key, { fields });
    setConfigs(prev =>
      prev.map(c => {
        if (c.key !== key) return c;
        return {
          ...c,
          fields: c.fields.map(f => ({ ...f, value: fields[f.name] ?? f.value })),
        };
      }),
    );
  }

  // Filter change handler
  function handleFilterChange(api: string) {
    setApiFilter(api);
    setErrorLogs([]);
    setTxLogs([]);
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Cpu className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">API Management</h1>
              <p className="text-xs text-muted-foreground">Monitor and configure third-party API integrations</p>
            </div>
          </div>
          <button
            onClick={handleCheckStatus}
            disabled={checkingStatus}
            className="flex items-center gap-2 bg-primary text-white rounded-xl px-4 py-2 text-sm font-medium disabled:opacity-70 hover:bg-primary/90 transition-colors"
          >
            {checkingStatus ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</>
            ) : (
              <><RefreshCw className="w-4 h-4" /> Check Status</>
            )}
          </button>
        </div>
      </div>

      <div className="p-6 space-y-8">
        {/* ── API Config Cards ── */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-white">API Configurations</h2>
            <span className="text-xs text-muted-foreground ml-1">({configs.length} APIs)</span>
          </div>

          {loadingConfigs ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full" />
              ))}
            </div>
          ) : configs.length === 0 ? (
            <div className="bg-[#0D1F3C] rounded-2xl border border-white/[0.06]">
              <EmptyState icon={Cpu} title="No API configurations found" subtitle="API configs will appear here once set up" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {configs.map(config => (
                <motion.div
                  key={config.key}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  <ApiCard
                    config={config}
                    latency={latencyMap[config.key] ?? null}
                    onToggleEnabled={handleToggleEnabled}
                    onSaveFields={handleSaveFields}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* ── Log Section ── */}
        <section>
          <div className="bg-[#0D1F3C] rounded-2xl border border-white/[0.06] overflow-hidden">
            {/* Log tab bar + filter */}
            <div className="flex items-center justify-between gap-4 px-5 py-4 border-b border-white/[0.06]">
              <div className="flex gap-1 bg-white/[0.03] border border-white/[0.06] rounded-xl p-1">
                {LOG_TABS.map(t => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setLogTab(t.id)}
                      className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        logTab === t.id
                          ? 'bg-primary text-white'
                          : 'text-muted-foreground hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" /> {t.label}
                    </button>
                  );
                })}
              </div>
              <select
                value={apiFilter}
                onChange={e => handleFilterChange(e.target.value)}
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary/50"
              >
                {API_FILTER_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value} className="bg-[#0D1F3C]">{opt.label}</option>
                ))}
              </select>
            </div>

            <AnimatePresence mode="wait">
              {/* ERROR LOGS */}
              {logTab === 'error' && (
                <motion.div
                  key="error-logs"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {loadingErrors && errorLogs.length === 0 ? (
                    <div className="p-5 space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : errorLogs.length === 0 ? (
                    <EmptyState icon={CheckCircle2} title="No error logs" subtitle="All API calls are running cleanly" />
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Time</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">API</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Endpoint</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Error</th>
                            </tr>
                          </thead>
                          <tbody>
                            {errorLogs.map(log => <ErrorLogRow key={log.id} log={log} />)}
                          </tbody>
                        </table>
                      </div>
                      {/* Footer / pagination */}
                      <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          Showing {errorLogs.length} of {errorTotal} error logs
                        </p>
                        {errorPage < errorPages && (
                          <button
                            onClick={() => loadErrorLogs(errorPage + 1, apiFilter)}
                            disabled={loadingErrors}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs text-muted-foreground hover:text-white hover:bg-white/5 border border-white/10 transition-colors disabled:opacity-50"
                          >
                            {loadingErrors ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            Load more
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </motion.div>
              )}

              {/* TRANSACTION LOGS */}
              {logTab === 'transaction' && (
                <motion.div
                  key="tx-logs"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {loadingTx && txLogs.length === 0 ? (
                    <div className="p-5 space-y-2">
                      {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                    </div>
                  ) : txLogs.length === 0 ? (
                    <EmptyState icon={List} title="No transaction logs" subtitle="API transaction history will appear here" />
                  ) : (
                    <>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-white/[0.03] border-b border-white/[0.06]">
                              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">Time</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">API</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Endpoint</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reference</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                              <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Time (ms)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {txLogs.map(log => <TxLogRow key={log.id} log={log} />)}
                          </tbody>
                        </table>
                      </div>
                      {/* Footer / pagination */}
                      <div className="px-5 py-3 border-t border-white/[0.06] flex items-center justify-between">
                        <p className="text-xs text-muted-foreground">
                          Showing {txLogs.length} of {txTotal} transaction logs
                        </p>
                        {txPage < txPages && (
                          <button
                            onClick={() => loadTxLogs(txPage + 1, apiFilter)}
                            disabled={loadingTx}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs text-muted-foreground hover:text-white hover:bg-white/5 border border-white/10 transition-colors disabled:opacity-50"
                          >
                            {loadingTx ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                            Load more
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </div>
    </div>
  );
}
