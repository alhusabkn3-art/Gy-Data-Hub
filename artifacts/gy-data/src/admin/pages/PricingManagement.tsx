import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Tags, Save, Plus, Trash2, Edit2, RefreshCw, CheckCircle2,
  X, Phone, Wifi, Tv2, Zap, Download,
} from 'lucide-react';
import {
  apiGetPricing, apiUpdatePricingRule, apiBulkUpdatePricing,
  apiCreatePricingRule, apiDeletePricingRule, exportToCsv,
  type PricingRule,
} from '../utils/adminApi';
import { fmtNaira } from '../utils/format';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

type ServiceTab = 'airtime' | 'data' | 'tv' | 'electricity';

interface DraftRow {
  sellingPrice: string;
  enabled: boolean;
}

interface AddPlanForm {
  serviceType: ServiceTab;
  provider: string;
  network: string;
  planId: string;
  planName: string;
  costPrice: string;
  sellingPrice: string;
  enabled: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcMarkup(cost: number, selling: number): string {
  if (cost === 0) return '—';
  return ((selling - cost) / cost * 100).toFixed(1) + '%';
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded-lg ${className}`} />;
}

// ── Toggle Switch ─────────────────────────────────────────────────────────────

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? 'bg-green-500' : 'bg-white/20'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

// ── Add Plan Modal ────────────────────────────────────────────────────────────

const SERVICE_TABS: { key: ServiceTab; label: string }[] = [
  { key: 'airtime', label: 'Airtime' },
  { key: 'data', label: 'Data' },
  { key: 'tv', label: 'TV' },
  { key: 'electricity', label: 'Electricity' },
];

interface AddPlanModalProps {
  onClose: () => void;
  onCreated: (rule: PricingRule) => void;
}

function AddPlanModal({ onClose, onCreated }: AddPlanModalProps) {
  const [form, setForm] = useState<AddPlanForm>({
    serviceType: 'data',
    provider: '',
    network: '',
    planId: '',
    planName: '',
    costPrice: '',
    sellingPrice: '',
    enabled: true,
  });
  const [saving, setSaving] = useState(false);

  const cost = parseFloat(form.costPrice) || 0;
  const selling = parseFloat(form.sellingPrice) || 0;
  const markup = calcMarkup(cost, selling);

  function set(key: keyof AddPlanForm, value: string | boolean) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.planName.trim()) { toast.error('Plan Name is required'); return; }
    setSaving(true);
    try {
      const rule = await apiCreatePricingRule({
        serviceType: form.serviceType,
        provider: form.provider.trim(),
        network: form.network.trim() || null,
        planId: form.planId.trim() || null,
        planName: form.planName.trim(),
        costPrice: cost,
        sellingPrice: selling,
        markupPercent: cost > 0 ? parseFloat(((selling - cost) / cost * 100).toFixed(2)) : 0,
        enabled: form.enabled,
      });
      onCreated(rule);
      toast.success('Pricing rule created');
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to create rule');
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
        className="max-w-lg w-full bg-[#0D1F3C] rounded-2xl border border-white/10 p-6"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-white font-semibold text-lg">Add Pricing Plan</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Service Type */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">Service Type</label>
            <select
              value={form.serviceType}
              onChange={e => set('serviceType', e.target.value)}
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-primary/50"
            >
              {SERVICE_TABS.map(t => (
                <option key={t.key} value={t.key} className="bg-[#0D1F3C]">{t.label}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Provider */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Provider</label>
              <input
                value={form.provider}
                onChange={e => set('provider', e.target.value)}
                placeholder="e.g. MTN, DSTV"
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-primary/50"
              />
            </div>
            {/* Network */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Network</label>
              <input
                value={form.network}
                onChange={e => set('network', e.target.value)}
                placeholder="e.g. MTN"
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Plan ID */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Plan ID</label>
              <input
                value={form.planId}
                onChange={e => set('planId', e.target.value)}
                placeholder="API plan code"
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-primary/50"
              />
            </div>
            {/* Plan Name */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Plan Name <span className="text-red-400">*</span></label>
              <input
                value={form.planName}
                onChange={e => set('planName', e.target.value)}
                placeholder="e.g. 1GB Daily"
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Cost Price */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Cost Price (₦)</label>
              <input
                type="number"
                value={form.costPrice}
                onChange={e => set('costPrice', e.target.value)}
                placeholder="0"
                min="0"
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-primary/50"
              />
            </div>
            {/* Selling Price */}
            <div>
              <label className="block text-xs text-muted-foreground mb-1.5">Selling Price (₦)</label>
              <input
                type="number"
                value={form.sellingPrice}
                onChange={e => set('sellingPrice', e.target.value)}
                placeholder="0"
                min="0"
                className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white w-full focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>

          {/* Markup preview */}
          <div className="bg-white/[0.03] rounded-xl px-3 py-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Markup</span>
            <span className="text-white font-medium">{markup}</span>
          </div>

          {/* Enabled */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Enabled</span>
            <Toggle checked={form.enabled} onChange={v => set('enabled', v)} />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {saving ? 'Creating…' : 'Create Plan'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Pricing Row ───────────────────────────────────────────────────────────────

interface PricingRowProps {
  rule: PricingRule;
  draft: DraftRow | undefined;
  onDraftChange: (id: string, draft: DraftRow) => void;
  onSaveRow: (rule: PricingRule) => void;
  onDelete: (rule: PricingRule) => void;
  onToggleEnabled: (rule: PricingRule, enabled: boolean) => void;
}

function PricingRow({ rule, draft, onDraftChange, onSaveRow, onDelete, onToggleEnabled }: PricingRowProps) {
  const isChanged = draft !== undefined;
  const currentSelling = draft ? parseFloat(draft.sellingPrice) || 0 : rule.sellingPrice;
  const currentEnabled = draft ? draft.enabled : rule.enabled;
  const markup = calcMarkup(rule.costPrice, currentSelling);

  function handleSellingChange(val: string) {
    onDraftChange(rule.id, {
      sellingPrice: val,
      enabled: currentEnabled,
    });
  }

  function handleToggle(v: boolean) {
    onToggleEnabled(rule, v);
    if (draft) {
      onDraftChange(rule.id, { ...draft, enabled: v });
    }
  }

  return (
    <tr className={`border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors ${isChanged ? 'border-l-2 border-l-primary/50' : ''}`}>
      <td className="px-4 py-3 text-sm text-muted-foreground">{rule.network ?? rule.provider}</td>
      <td className="px-4 py-3 text-sm text-white">{rule.planName ?? '—'}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{fmtNaira(rule.costPrice)}</td>
      <td className="px-4 py-3 text-sm">
        <input
          type="number"
          value={draft ? draft.sellingPrice : rule.sellingPrice}
          onChange={e => handleSellingChange(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1 text-sm text-white w-24 focus:outline-none focus:border-primary/50"
          min="0"
        />
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{markup}</td>
      <td className="px-4 py-3">
        <Toggle checked={currentEnabled} onChange={handleToggle} />
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onSaveRow(rule)}
            disabled={!isChanged}
            title="Save row"
            className="w-7 h-7 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center transition-colors disabled:opacity-30"
          >
            <Save className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(rule)}
            title="Delete"
            className="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

const TABS: { key: ServiceTab; label: string; icon: React.ElementType }[] = [
  { key: 'airtime',     label: 'Airtime',     icon: Phone },
  { key: 'data',        label: 'Data',        icon: Wifi },
  { key: 'tv',          label: 'TV',          icon: Tv2 },
  { key: 'electricity', label: 'Electricity', icon: Zap },
];

export default function PricingManagement() {
  const [activeTab, setActiveTab] = useState<ServiceTab>('data');
  const [rules, setRules] = useState<PricingRule[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadRules = useCallback(async (tab: ServiceTab) => {
    setLoading(true);
    setDrafts({});
    try {
      const { rules: data } = await apiGetPricing(tab);
      setRules(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load pricing');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules(activeTab);
  }, [activeTab, loadRules]);

  function handleTabChange(tab: ServiceTab) {
    setActiveTab(tab);
  }

  function handleDraftChange(id: string, draft: DraftRow) {
    setDrafts(prev => ({ ...prev, [id]: draft }));
  }

  async function handleSaveRow(rule: PricingRule) {
    const draft = drafts[rule.id];
    if (!draft) return;
    try {
      const selling = parseFloat(draft.sellingPrice) || 0;
      const markupPercent = rule.costPrice > 0
        ? parseFloat(((selling - rule.costPrice) / rule.costPrice * 100).toFixed(2))
        : 0;
      await apiUpdatePricingRule(rule.id, { sellingPrice: selling, markupPercent, enabled: draft.enabled });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, sellingPrice: selling, markupPercent, enabled: draft.enabled } : r));
      setDrafts(prev => { const next = { ...prev }; delete next[rule.id]; return next; });
      toast.success('Row saved');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save row');
    }
  }

  async function handleToggleEnabled(rule: PricingRule, enabled: boolean) {
    try {
      await apiUpdatePricingRule(rule.id, { enabled });
      setRules(prev => prev.map(r => r.id === rule.id ? { ...r, enabled } : r));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to update');
    }
  }

  async function handleDelete(rule: PricingRule) {
    if (!window.confirm(`Delete "${rule.planName ?? rule.planId}"? This cannot be undone.`)) return;
    try {
      await apiDeletePricingRule(rule.id);
      setRules(prev => prev.filter(r => r.id !== rule.id));
      setDrafts(prev => { const next = { ...prev }; delete next[rule.id]; return next; });
      toast.success('Plan deleted');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  async function handleSaveAll() {
    const changed = Object.entries(drafts);
    if (!changed.length) { toast.info('No unsaved changes'); return; }
    setSaving(true);
    try {
      const payload = changed.map(([id, draft]) => {
        const rule = rules.find(r => r.id === id);
        const selling = parseFloat(draft.sellingPrice) || 0;
        const markupPercent = rule && rule.costPrice > 0
          ? parseFloat(((selling - rule.costPrice) / rule.costPrice * 100).toFixed(2))
          : 0;
        return { id, sellingPrice: selling, markupPercent, enabled: draft.enabled };
      });
      const { updated } = await apiBulkUpdatePricing(payload);
      // Apply all to local state
      setRules(prev => prev.map(r => {
        const p = payload.find(x => x.id === r.id);
        if (!p) return r;
        return { ...r, sellingPrice: p.sellingPrice, markupPercent: p.markupPercent, enabled: p.enabled ?? r.enabled };
      }));
      setDrafts({});
      toast.success(`${updated} rule${updated !== 1 ? 's' : ''} saved`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Bulk save failed');
    } finally {
      setSaving(false);
    }
  }

  function handleExportCsv() {
    const data = rules.map(r => ({
      Service: r.serviceType,
      Provider: r.provider,
      Network: r.network ?? '',
      'Plan ID': r.planId ?? '',
      'Plan Name': r.planName ?? '',
      'Cost Price': r.costPrice,
      'Selling Price': r.sellingPrice,
      'Markup %': r.markupPercent,
      Enabled: r.enabled,
    }));
    exportToCsv(data as unknown as Record<string, unknown>[], `pricing-${activeTab}`);
  }

  function handleCreated(rule: PricingRule) {
    if (rule.serviceType === activeTab) {
      setRules(prev => [...prev, rule]);
    }
  }

  const changedCount = Object.keys(drafts).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Tags className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-white font-semibold text-lg">Pricing Management</h1>
              <p className="text-muted-foreground text-sm">Manage service pricing, markups &amp; plans</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void loadRules(activeTab)}
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-white transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={handleExportCsv}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
            <button
              onClick={handleSaveAll}
              disabled={saving || changedCount === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-400 rounded-xl transition-colors disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              Save All {changedCount > 0 && `(${changedCount})`}
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-xl hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Plan
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 flex items-center gap-1 border-b border-white/[0.06]">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => handleTabChange(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-xl transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
                  ? 'text-white border-primary bg-primary/5'
                  : 'text-muted-foreground border-transparent hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="bg-[#0D1F3C] rounded-2xl border border-white/[0.06] overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10" />
              ))}
            </div>
          ) : rules.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Tags className="w-10 h-10 text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground">No pricing rules for {activeTab}</p>
              <button
                onClick={() => setShowAddModal(true)}
                className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-xl"
              >
                <Plus className="w-4 h-4" /> Add First Plan
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-white/[0.03]">
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Network</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Plan Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Cost Price (₦)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Selling Price (₦)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Markup %</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Enabled</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rules.map(rule => (
                    <PricingRow
                      key={rule.id}
                      rule={rule}
                      draft={drafts[rule.id]}
                      onDraftChange={handleDraftChange}
                      onSaveRow={handleSaveRow}
                      onDelete={handleDelete}
                      onToggleEnabled={handleToggleEnabled}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Plan Modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddPlanModal
            onClose={() => setShowAddModal(false)}
            onCreated={handleCreated}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
