import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gift, Power, ChevronDown, ChevronUp, RefreshCw, Save,
  BarChart2, Wifi, AlertCircle, CheckCircle2, Download,
  TrendingUp, Users, DollarSign, Layers,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../utils/adminApi';
import { fmtNaira } from '../utils/format';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CashbackSettings {
  enabled: boolean;
  updatedAt?: string;
}

interface CashbackPlan {
  id: string;
  network: string | null;
  provider: string;
  plan_id: string | null;
  plan_name: string | null;
  selling_price: string;
  cashback_enabled: boolean;
  cashback_type: 'percentage' | 'fixed';
  cashback_value: string;
}

interface CashbackTotals {
  total_count: string;
  total_amount: string;
  avg_amount: string;
  unique_users: string;
  unique_networks: string;
}

interface CashbackReports {
  period: { from: string; to: string };
  totals: CashbackTotals;
  byDate: { day: string; count: string; total: string }[];
  byNetwork: { network: string; count: string; total: string }[];
  byPlan: { plan_name: string; network: string; count: string; total: string }[];
  byUser: { user_id: string; user_name: string; user_phone: string; count: string; total: string }[];
}

// ── Network colours ───────────────────────────────────────────────────────────

const NET_COLOR: Record<string, string> = {
  MTN:     'bg-yellow-400/20 text-yellow-300 border-yellow-400/30',
  AIRTEL:  'bg-red-400/20 text-red-300 border-red-400/30',
  GLO:     'bg-green-400/20 text-green-300 border-green-400/30',
  '9MOBILE': 'bg-emerald-400/20 text-emerald-300 border-emerald-400/30',
};

function NetBadge({ network }: { network: string | null }) {
  const n = (network ?? 'N/A').toUpperCase();
  const cls = NET_COLOR[n] ?? 'bg-white/10 text-white/50 border-white/10';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}>
      {n}
    </span>
  );
}

function Toggle({ checked, onChange, disabled = false }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${checked ? 'bg-green-500' : 'bg-white/20'}`}
    >
      <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
    </button>
  );
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded-lg ${className}`} />;
}

// ── Bulk network update modal ─────────────────────────────────────────────────

interface BulkModalProps {
  network: string;
  onClose: () => void;
  onApply: () => void;
}

function BulkModal({ network, onClose, onApply }: BulkModalProps) {
  const [type, setType] = useState<'percentage' | 'fixed'>('percentage');
  const [value, setValue] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);

  async function handleApply() {
    const v = parseFloat(value);
    if (isNaN(v) || v < 0) { toast.error('Enter a valid value ≥ 0'); return; }
    setSaving(true);
    try {
      const r = await adminApi('/api/admin/cashback/plans/bulk', {
        method: 'POST',
        body: JSON.stringify({ network, cashbackEnabled: enabled, cashbackType: type, cashbackValue: v }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
      const data = await r.json() as { updated: number };
      toast.success(`Updated ${data.updated} plans for ${network}`);
      onApply();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="max-w-sm w-full bg-[#0D1F3C] rounded-2xl border border-white/10 p-6 space-y-4"
      >
        <div className="flex items-center gap-2">
          <NetBadge network={network} />
          <h3 className="text-white font-bold text-sm">Bulk Update — {network}</h3>
        </div>
        <p className="text-white/40 text-xs">Apply the same cashback rule to all {network} data plans.</p>

        <div className="space-y-3">
          <div>
            <label className="text-white/50 text-xs mb-1 block">Enable Cashback</label>
            <div className="flex items-center gap-2">
              <Toggle checked={enabled} onChange={setEnabled} />
              <span className="text-xs text-white/60">{enabled ? 'On' : 'Off'}</span>
            </div>
          </div>
          {enabled && (
            <>
              <div>
                <label className="text-white/50 text-xs mb-1 block">Cashback Type</label>
                <div className="flex gap-2">
                  {(['percentage', 'fixed'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setType(t)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${type === t ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}
                    >
                      {t === 'percentage' ? 'Percentage (%)' : 'Fixed (₦)'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">Value</label>
                <div className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2 border border-white/10">
                  <span className="text-white/40 text-sm font-bold">{type === 'percentage' ? '%' : '₦'}</span>
                  <input
                    type="number" min="0" step="0.01"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    placeholder={type === 'percentage' ? '5.0' : '100'}
                    className="flex-1 bg-transparent text-white text-sm outline-none placeholder:text-white/20"
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-white/5 text-white/60 text-sm font-semibold hover:bg-white/10 transition-colors">
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={saving}
            className="flex-1 py-2 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
          >
            {saving ? 'Applying…' : 'Apply'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Plan row ──────────────────────────────────────────────────────────────────

interface PlanRowProps {
  plan: CashbackPlan;
  onSave: (id: string, cashbackEnabled: boolean, cashbackType: 'percentage' | 'fixed', cashbackValue: number) => Promise<void>;
}

function PlanRow({ plan, onSave }: PlanRowProps) {
  const [enabled,  setEnabled]  = useState(plan.cashback_enabled);
  const [type,     setType]     = useState<'percentage' | 'fixed'>(plan.cashback_type);
  const [value,    setValue]    = useState(parseFloat(plan.cashback_value).toString());
  const [saving,   setSaving]   = useState(false);
  const [dirty,    setDirty]    = useState(false);

  function mark() { setDirty(true); }

  async function handleSave() {
    const v = parseFloat(value);
    if (isNaN(v) || v < 0) { toast.error('Invalid cashback value'); return; }
    setSaving(true);
    try {
      await onSave(plan.id, enabled, type, v);
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }

  // Preview cashback
  const price    = parseFloat(plan.selling_price);
  let preview = '—';
  if (enabled) {
    const v = parseFloat(value) || 0;
    if (type === 'percentage') {
      const amt = price * v / 100;
      preview = amt > 0 ? `₦${amt.toFixed(0)} (${v}%)` : '—';
    } else {
      preview = v > 0 ? `₦${v.toFixed(0)}` : '—';
    }
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
      {/* Network */}
      <div className="w-16 flex-shrink-0">
        <NetBadge network={plan.network ?? plan.provider} />
      </div>

      {/* Plan name */}
      <div className="flex-1 min-w-0">
        <p className="text-white/80 text-xs font-semibold truncate">{plan.plan_name ?? plan.plan_id ?? '—'}</p>
        <p className="text-white/30 text-[10px]">₦{parseFloat(plan.selling_price).toLocaleString()}</p>
      </div>

      {/* Toggle */}
      <Toggle checked={enabled} onChange={v => { setEnabled(v); mark(); }} />

      {/* Type */}
      <select
        value={type}
        onChange={e => { setType(e.target.value as 'percentage' | 'fixed'); mark(); }}
        disabled={!enabled}
        className="bg-white/5 border border-white/10 text-white/70 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500/50 disabled:opacity-40 w-24"
      >
        <option value="percentage">%</option>
        <option value="fixed">₦ Fixed</option>
      </select>

      {/* Value */}
      <input
        type="number" min="0" step="0.01"
        value={value}
        onChange={e => { setValue(e.target.value); mark(); }}
        disabled={!enabled}
        placeholder="0"
        className="bg-white/5 border border-white/10 text-white text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-blue-500/50 w-16 disabled:opacity-40"
      />

      {/* Preview */}
      <div className="w-20 text-right">
        <span className={`text-xs font-semibold ${enabled && preview !== '—' ? 'text-green-400' : 'text-white/20'}`}>
          {preview}
        </span>
      </div>

      {/* Save */}
      <button
        onClick={handleSave}
        disabled={!dirty || saving}
        className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-30 disabled:cursor-default flex-shrink-0"
        title="Save"
      >
        {saving
          ? <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />
          : <Save className="w-3.5 h-3.5" />
        }
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'plans' | 'reports';

export default function CashbackManagement() {
  const [settings,      setSettings]      = useState<CashbackSettings | null>(null);
  const [plans,         setPlans]         = useState<CashbackPlan[]>([]);
  const [reports,       setReports]       = useState<CashbackReports | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [reportsLoading,setReportsLoading]= useState(false);
  const [tab,           setTab]           = useState<Tab>('plans');
  const [networkFilter, setNetworkFilter] = useState<string>('ALL');
  const [bulkNetwork,   setBulkNetwork]   = useState<string | null>(null);
  const [togglingGlobal,setTogglingGlobal]= useState(false);
  const [expandedNets,  setExpandedNets]  = useState<Set<string>>(new Set(['MTN', 'AIRTEL', 'GLO', '9MOBILE']));

  // Date range for reports
  const today = new Date().toISOString().split('T')[0]!;
  const defaultFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]!;
  const [dateFrom, setDateFrom] = useState(defaultFrom);
  const [dateTo,   setDateTo]   = useState(today);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, pRes] = await Promise.all([
        adminApi('/api/admin/cashback/settings'),
        adminApi('/api/admin/cashback/plans'),
      ]);
      if (sRes.ok) setSettings(await sRes.json() as CashbackSettings);
      if (pRes.ok) {
        const d = await pRes.json() as { plans: CashbackPlan[] };
        setPlans(d.plans);
      }
    } catch (err) {
      toast.error('Failed to load cashback data');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReports = useCallback(async () => {
    setReportsLoading(true);
    try {
      const r = await adminApi(`/api/admin/cashback/reports?from=${dateFrom}&to=${dateTo}`);
      if (r.ok) setReports(await r.json() as CashbackReports);
    } catch { toast.error('Failed to load reports'); }
    finally { setReportsLoading(false); }
  }, [dateFrom, dateTo]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => { if (tab === 'reports') void loadReports(); }, [tab, loadReports]);

  async function toggleGlobal() {
    if (!settings) return;
    setTogglingGlobal(true);
    try {
      const r = await adminApi('/api/admin/cashback/settings', {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !settings.enabled }),
      });
      if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
      setSettings(prev => prev ? { ...prev, enabled: !prev.enabled } : prev);
      toast.success(`Cashback ${!settings.enabled ? 'enabled' : 'disabled'} globally`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setTogglingGlobal(false);
    }
  }

  async function savePlan(id: string, cashbackEnabled: boolean, cashbackType: 'percentage' | 'fixed', cashbackValue: number) {
    const r = await adminApi(`/api/admin/cashback/plans/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ cashbackEnabled, cashbackType, cashbackValue }),
    });
    if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
    setPlans(prev => prev.map(p => p.id === id ? {
      ...p,
      cashback_enabled: cashbackEnabled,
      cashback_type: cashbackType,
      cashback_value: cashbackValue.toFixed(2),
    } : p));
    toast.success('Cashback saved');
  }

  // Grouped by network
  const networks    = [...new Set(plans.map(p => (p.network ?? p.provider ?? 'Unknown').toUpperCase()))].sort();
  const filtered    = networkFilter === 'ALL' ? plans : plans.filter(p => (p.network ?? p.provider ?? '').toUpperCase() === networkFilter);
  const groupedNets = networks;

  function toggleNet(n: string) {
    setExpandedNets(prev => { const s = new Set(prev); s.has(n) ? s.delete(n) : s.add(n); return s; });
  }

  // Stats from plans
  const enabledCount = plans.filter(p => p.cashback_enabled).length;
  const totalPlans   = plans.length;

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto space-y-5">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-green-500/10 flex items-center justify-center flex-shrink-0">
          <Gift className="w-5 h-5 text-green-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white">Cashback Management</h1>
          <p className="text-xs text-white/40">Set cashback rules per plan or network. Credits post-purchase automatically.</p>
        </div>
      </div>

      {/* ── Global toggle card ──────────────────────────────────────────────── */}
      {loading ? (
        <Skeleton className="h-20" />
      ) : (
        <div className={`rounded-2xl border p-4 flex items-center justify-between gap-4 transition-colors ${
          settings?.enabled
            ? 'bg-green-500/[0.07] border-green-500/20'
            : 'bg-white/[0.03] border-white/[0.06]'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${settings?.enabled ? 'bg-green-500/20' : 'bg-white/[0.05]'}`}>
              <Power className={`w-5 h-5 ${settings?.enabled ? 'text-green-400' : 'text-white/30'}`} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Global Cashback Switch</p>
              <p className="text-xs text-white/40 mt-0.5">
                {settings?.enabled
                  ? 'Cashback is active — eligible plans credit wallets automatically.'
                  : 'Cashback is OFF. No cashback will be applied to any purchase.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className={`text-xs font-bold ${settings?.enabled ? 'text-green-400' : 'text-white/30'}`}>
              {settings?.enabled ? 'ON' : 'OFF'}
            </span>
            {togglingGlobal
              ? <div className="w-9 h-5 rounded-full bg-white/10 animate-pulse" />
              : <Toggle checked={settings?.enabled ?? false} onChange={toggleGlobal} />
            }
          </div>
        </div>
      )}

      {/* ── Stats row ───────────────────────────────────────────────────────── */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Plans',     value: String(totalPlans),    icon: Layers,      color: 'text-blue-400'  },
            { label: 'With Cashback',   value: String(enabledCount),  icon: Gift,        color: 'text-green-400' },
            { label: 'Networks',        value: String(networks.length),icon: Wifi,       color: 'text-purple-400'},
            { label: 'Global Status',   value: settings?.enabled ? 'Active' : 'Off', icon: Power, color: settings?.enabled ? 'text-green-400' : 'text-white/30' },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-3.5 h-3.5 ${color}`} />
                <span className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">{label}</span>
              </div>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Tabs ─────────────────────────────────────────────────────────────── */}
      <div className="flex gap-1 bg-white/[0.03] rounded-xl p-1 border border-white/[0.06]">
        {([['plans', 'Data Plans', Wifi], ['reports', 'Reports', BarChart2]] as const).map(([t, label, Icon]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === t ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ── Plans tab ────────────────────────────────────────────────────────── */}
      <AnimatePresence mode="wait">
        {tab === 'plans' && (
          <motion.div key="plans" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {/* Network filter + bulk action */}
            <div className="flex flex-wrap gap-2 mb-4">
              {['ALL', ...groupedNets].map(n => (
                <button
                  key={n}
                  onClick={() => setNetworkFilter(n)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
                    networkFilter === n ? 'bg-blue-500 text-white' : 'bg-white/5 text-white/50 hover:bg-white/10'
                  }`}
                >
                  {n}
                </button>
              ))}
              <div className="flex-1" />
              {networkFilter !== 'ALL' && (
                <button
                  onClick={() => setBulkNetwork(networkFilter)}
                  className="px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-colors"
                >
                  Bulk Apply → {networkFilter}
                </button>
              )}
              <button
                onClick={loadData}
                className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>

            {loading ? (
              <div className="space-y-2">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12" />)}
              </div>
            ) : plans.length === 0 ? (
              <div className="text-center py-12 text-white/30">
                <Wifi className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">No data plans configured yet.</p>
                <p className="text-xs mt-1">Add plans in Pricing Management first.</p>
              </div>
            ) : (
              <div className="bg-[#0A1929] rounded-2xl border border-white/[0.06] overflow-hidden">
                {/* Column headers */}
                <div className="flex items-center gap-3 px-4 py-2 border-b border-white/[0.06] bg-white/[0.02]">
                  <span className="w-16 text-[10px] text-white/30 font-semibold uppercase tracking-wider">Network</span>
                  <span className="flex-1 text-[10px] text-white/30 font-semibold uppercase tracking-wider">Plan</span>
                  <span className="text-[10px] text-white/30 font-semibold uppercase tracking-wider w-9">Active</span>
                  <span className="text-[10px] text-white/30 font-semibold uppercase tracking-wider w-24">Type</span>
                  <span className="text-[10px] text-white/30 font-semibold uppercase tracking-wider w-16">Value</span>
                  <span className="text-[10px] text-white/30 font-semibold uppercase tracking-wider w-20 text-right">Per Purchase</span>
                  <span className="w-7" />
                </div>

                {/* Grouped by network */}
                {networkFilter === 'ALL' ? (
                  groupedNets.map(net => {
                    const netPlans = plans.filter(p => (p.network ?? p.provider ?? '').toUpperCase() === net);
                    const exp = expandedNets.has(net);
                    return (
                      <div key={net}>
                        <button
                          onClick={() => toggleNet(net)}
                          className="w-full flex items-center gap-2 px-4 py-2 bg-white/[0.02] border-b border-white/[0.04] hover:bg-white/[0.04] transition-colors"
                        >
                          <NetBadge network={net} />
                          <span className="text-xs text-white/50 font-semibold">{netPlans.length} plans</span>
                          <div className="flex-1" />
                          <span className="text-xs text-green-400">{netPlans.filter(p => p.cashback_enabled).length} with cashback</span>
                          {exp ? <ChevronUp className="w-3.5 h-3.5 text-white/30" /> : <ChevronDown className="w-3.5 h-3.5 text-white/30" />}
                        </button>
                        {exp && netPlans.map(p => <PlanRow key={p.id} plan={p} onSave={savePlan} />)}
                      </div>
                    );
                  })
                ) : (
                  filtered.map(p => <PlanRow key={p.id} plan={p} onSave={savePlan} />)
                )}
              </div>
            )}
          </motion.div>
        )}

        {/* ── Reports tab ──────────────────────────────────────────────────────── */}
        {tab === 'reports' && (
          <motion.div key="reports" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
            {/* Date range */}
            <div className="flex flex-wrap gap-3 items-end">
              {[['From', dateFrom, setDateFrom], ['To', dateTo, setDateTo]].map(([label, val, setter]) => (
                <div key={label as string}>
                  <label className="text-[10px] text-white/40 font-semibold uppercase tracking-wider block mb-1">{label as string}</label>
                  <input
                    type="date"
                    value={val as string}
                    onChange={e => (setter as React.Dispatch<React.SetStateAction<string>>)(e.target.value)}
                    className="bg-white/5 border border-white/10 text-white text-sm rounded-xl px-3 py-2 focus:outline-none focus:border-blue-500/50"
                  />
                </div>
              ))}
              <button
                onClick={loadReports}
                disabled={reportsLoading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl text-sm font-semibold hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${reportsLoading ? 'animate-spin' : ''}`} />
                {reportsLoading ? 'Loading…' : 'Apply'}
              </button>
            </div>

            {reportsLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[1,2,3,4].map(i => <Skeleton key={i} className="h-20" />)}
              </div>
            ) : reports ? (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { label: 'Total Paid',    value: fmtNaira(parseFloat(reports.totals.total_amount ?? '0')),   icon: DollarSign,  color: 'text-green-400'  },
                    { label: 'Transactions',  value: reports.totals.total_count ?? '0',                          icon: Gift,        color: 'text-blue-400'   },
                    { label: 'Unique Users',  value: reports.totals.unique_users ?? '0',                         icon: Users,       color: 'text-purple-400' },
                    { label: 'Avg Cashback',  value: fmtNaira(parseFloat(reports.totals.avg_amount ?? '0')),    icon: TrendingUp,  color: 'text-amber-400'  },
                  ].map(({ label, value, icon: Icon, color }) => (
                    <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-3.5 h-3.5 ${color}`} />
                        <span className="text-[10px] text-white/40 font-semibold uppercase tracking-wider">{label}</span>
                      </div>
                      <p className={`text-lg font-bold ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>

                {/* By Network */}
                {reports.byNetwork.length > 0 && (
                  <div className="bg-[#0A1929] rounded-2xl border border-white/[0.06] overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
                      <Wifi className="w-3.5 h-3.5 text-blue-400" />
                      <span className="text-xs font-bold text-white/70">By Network</span>
                    </div>
                    {reports.byNetwork.map(row => (
                      <div key={row.network} className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.03]">
                        <div className="flex items-center gap-2">
                          <NetBadge network={row.network} />
                          <span className="text-xs text-white/50">{row.count} cashbacks</span>
                        </div>
                        <span className="text-sm font-bold text-green-400">{fmtNaira(parseFloat(row.total))}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* By Plan */}
                {reports.byPlan.length > 0 && (
                  <div className="bg-[#0A1929] rounded-2xl border border-white/[0.06] overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-purple-400" />
                      <span className="text-xs font-bold text-white/70">By Plan (top 20)</span>
                    </div>
                    {reports.byPlan.slice(0, 20).map((row, i) => (
                      <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.03]">
                        <div className="flex items-center gap-2">
                          <NetBadge network={row.network} />
                          <span className="text-xs text-white/70 font-medium">{row.plan_name}</span>
                          <span className="text-[10px] text-white/30">×{row.count}</span>
                        </div>
                        <span className="text-sm font-bold text-green-400">{fmtNaira(parseFloat(row.total))}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* By User */}
                {reports.byUser.length > 0 && (
                  <div className="bg-[#0A1929] rounded-2xl border border-white/[0.06] overflow-hidden">
                    <div className="px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
                      <Users className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs font-bold text-white/70">By User (top 50)</span>
                    </div>
                    {reports.byUser.map(row => (
                      <div key={row.user_id} className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.03]">
                        <div>
                          <p className="text-xs text-white/70 font-semibold">{row.user_name}</p>
                          <p className="text-[10px] text-white/30">{row.user_phone} · {row.count} cashbacks</p>
                        </div>
                        <span className="text-sm font-bold text-green-400">{fmtNaira(parseFloat(row.total))}</span>
                      </div>
                    ))}
                  </div>
                )}

                {reports.byDate.length === 0 && reports.byNetwork.length === 0 && (
                  <div className="text-center py-12 text-white/30">
                    <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No cashback transactions in this period.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-white/30">
                <BarChart2 className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Click Apply to load reports.</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk modal */}
      <AnimatePresence>
        {bulkNetwork && (
          <BulkModal
            network={bulkNetwork}
            onClose={() => setBulkNetwork(null)}
            onApply={() => { void loadData(); setBulkNetwork(null); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
