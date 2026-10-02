// artifacts/gy-data/src/admin/pages/PricingManagement.tsx

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Tags,
  Plus,
  Trash2,
  RefreshCw,
  X,
  Save,
  Pencil,
  Phone,
  Wifi,
  Tv2,
  Zap,
  Download,
} from 'lucide-react';
import {
  apiGetPricing,
  apiUpdatePricingRule,
  apiCreatePricingRule,
  apiDeletePricingRule,
  exportToCsv,
  type PricingRule,
} from '../utils/adminApi';
import { toast } from 'sonner';

type ServiceTab =
  | 'airtime'
  | 'data'
  | 'tv'
  | 'electricity';

interface EditDraft {
  costPrice: string;
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

const TABS: {
  key: ServiceTab;
  label: string;
  icon: React.ElementType;
}[] = [
  {
    key: 'airtime',
    label: 'Airtime',
    icon: Phone,
  },
  {
    key: 'data',
    label: 'Data',
    icon: Wifi,
  },
  {
    key: 'tv',
    label: 'TV',
    icon: Tv2,
  },
  {
    key: 'electricity',
    label: 'Electricity',
    icon: Zap,
  },
];

function safeNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function safeText(
  value: unknown,
  fallback = '',
): string {
  if (
    value === null ||
    value === undefined
  ) {
    return fallback;
  }

  const text = String(value).trim();

  return text || fallback;
}

function calcMarkup(
  cost: number,
  selling: number,
): string {
  if (cost <= 0) {
    return '—';
  }

  return `${(
    ((selling - cost) / cost) *
    100
  ).toFixed(1)}%`;
}

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() =>
        onChange(!checked)
      }
      className={`relative inline-flex h-5 w-9 rounded-full transition-colors ${
        checked
          ? 'bg-green-500'
          : 'bg-white/20'
      } ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : ''
      }`}
    >
      <span
        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
          checked
            ? 'translate-x-4'
            : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function AddPlanModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (
    rule: PricingRule,
  ) => void;
}) {
  const [form, setForm] =
    useState<AddPlanForm>({
      serviceType: 'data',
      provider: '',
      network: '',
      planId: '',
      planName: '',
      costPrice: '',
      sellingPrice: '',
      enabled: true,
    });

  const [saving, setSaving] =
    useState(false);

  const cost =
    safeNumber(form.costPrice);

  const selling =
    safeNumber(form.sellingPrice);

  function setField(
    key: keyof AddPlanForm,
    value: string | boolean,
  ) {
    setForm(current => ({
      ...current,
      [key]: value,
    }));
  }

  async function save() {
    if (!form.planName.trim()) {
      toast.error(
        'Plan name is required.',
      );
      return;
    }

    setSaving(true);

    try {
      const rule =
        await apiCreatePricingRule({
          serviceType:
            form.serviceType,
          provider:
            form.provider.trim(),
          network:
            form.network.trim() ||
            null,
          planId:
            form.planId.trim() ||
            null,
          planName:
            form.planName.trim(),
          costPrice: cost,
          sellingPrice: selling,
          markupPercent:
            cost > 0
              ? Number(
                  (
                    ((selling - cost) /
                      cost) *
                    100
                  ).toFixed(2),
                )
              : 0,
          enabled: form.enabled,
        });

      onCreated(rule);
      toast.success(
        'Pricing plan created.',
      );
      onClose();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to create pricing plan.',
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-[#0D1F3C] border border-white/10 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-semibold">
            Add Pricing Plan
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center"
          >
            <X className="w-4 h-4 text-white/60" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-white/45">
              Service
            </label>

            <select
              value={form.serviceType}
              onChange={event =>
                setField(
                  'serviceType',
                  event.target.value as ServiceTab,
                )
              }
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
            >
              {TABS.map(tab => (
                <option
                  key={tab.key}
                  value={tab.key}
                  className="bg-[#0D1F3C]"
                >
                  {tab.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/45">
                Provider
              </label>

              <input
                value={form.provider}
                onChange={event =>
                  setField(
                    'provider',
                    event.target.value,
                  )
                }
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <label className="text-xs text-white/45">
                Network
              </label>

              <input
                value={form.network}
                onChange={event =>
                  setField(
                    'network',
                    event.target.value,
                  )
                }
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/45">
                Plan ID
              </label>

              <input
                value={form.planId}
                onChange={event =>
                  setField(
                    'planId',
                    event.target.value,
                  )
                }
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <label className="text-xs text-white/45">
                Plan Name
              </label>

              <input
                value={form.planName}
                onChange={event =>
                  setField(
                    'planName',
                    event.target.value,
                  )
                }
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-white/45">
                Cost Price
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={form.costPrice}
                onChange={event =>
                  setField(
                    'costPrice',
                    event.target.value,
                  )
                }
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>

            <div>
              <label className="text-xs text-white/45">
                Selling Price
              </label>

              <input
                type="number"
                min="0"
                step="0.01"
                value={form.sellingPrice}
                onChange={event =>
                  setField(
                    'sellingPrice',
                    event.target.value,
                  )
                }
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-between bg-white/[0.03] rounded-xl p-3">
            <span className="text-sm text-white/60">
              Markup
            </span>

            <span className="text-sm font-semibold text-white">
              {calcMarkup(
                cost,
                selling,
              )}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">
              Enabled
            </span>

            <Toggle
              checked={form.enabled}
              onChange={value =>
                setField(
                  'enabled',
                  value,
                )
              }
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/60"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void save()
            }
            className="flex-1 py-2.5 rounded-xl bg-primary text-white font-semibold disabled:opacity-50"
          >
            {saving
              ? 'Saving...'
              : 'Create Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PricingRow({
  rule,
  draft,
  editing,
  saving,
  onEdit,
  onChange,
  onSave,
  onCancel,
  onDelete,
  onToggle,
}: {
  rule: PricingRule;
  draft?: EditDraft;
  editing: boolean;
  saving: boolean;
  onEdit: () => void;
  onChange: (
    draft: EditDraft,
  ) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete: () => void;
  onToggle: (
    enabled: boolean,
  ) => void;
}) {
  const cost = editing
    ? safeNumber(
        draft?.costPrice,
      )
    : safeNumber(
        rule.costPrice,
      );

  const selling = editing
    ? safeNumber(
        draft?.sellingPrice,
      )
    : safeNumber(
        rule.sellingPrice,
      );

  const enabled = editing
    ? Boolean(draft?.enabled)
    : Boolean(rule.enabled);

  return (
    <tr className="border-t border-white/[0.05] hover:bg-white/[0.02]">
      <td className="px-4 py-3 text-sm text-white/60">
        {safeText(
          rule.network ??
            rule.provider,
          '—',
        )}
      </td>

      <td className="px-4 py-3 text-sm text-white/50">
        {safeText(
          rule.provider,
          '—',
        )}
      </td>

      <td className="px-4 py-3 text-sm text-white">
        {safeText(
          rule.planName ??
            rule.planId,
          'Unnamed plan',
        )}
      </td>

      <td className="px-4 py-3">
        {editing ? (
          <input
            type="number"
            min="0"
            step="0.01"
            value={
              draft?.costPrice ?? ''
            }
            onChange={event =>
              onChange({
                costPrice:
                  event.target.value,
                sellingPrice:
                  draft?.sellingPrice ??
                  String(
                    rule.sellingPrice ??
                      0,
                  ),
                enabled,
              })
            }
            className="w-28 bg-white/5 border border-primary/30 rounded-lg px-2 py-1.5 text-sm text-white outline-none"
          />
        ) : (
          <span className="text-sm text-white">
            {safeNumber(
              rule.costPrice,
            ).toLocaleString(
              'en-NG',
              {
                minimumFractionDigits: 2,
              },
            )}
          </span>
        )}
      </td>

      <td className="px-4 py-3">
        {editing ? (
          <input
            type="number"
            min="0"
            step="0.01"
            value={
              draft?.sellingPrice ?? ''
            }
            onChange={event =>
              onChange({
                costPrice:
                  draft?.costPrice ??
                  String(
                    rule.costPrice ??
                      0,
                  ),
                sellingPrice:
                  event.target.value,
                enabled,
              })
            }
            className="w-28 bg-white/5 border border-primary/30 rounded-lg px-2 py-1.5 text-sm text-white outline-none"
          />
        ) : (
          <span className="text-sm font-semibold text-white">
            {safeNumber(
              rule.sellingPrice,
            ).toLocaleString(
              'en-NG',
              {
                minimumFractionDigits: 2,
              },
            )}
          </span>
        )}
      </td>

      <td className="px-4 py-3 text-sm text-white/50">
        {calcMarkup(
          cost,
          selling,
        )}
      </td>

      <td className="px-4 py-3">
        <Toggle
          checked={enabled}
          disabled={saving}
          onChange={value => {
            if (editing) {
              onChange({
                costPrice:
                  draft?.costPrice ??
                  String(
                    rule.costPrice ??
                      0,
                  ),
                sellingPrice:
                  draft?.sellingPrice ??
                  String(
                    rule.sellingPrice ??
                      0,
                  ),
                enabled: value,
              });
            } else {
              onToggle(value);
            }
          }}
        />
      </td>

      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          {!editing ? (
            <button
              type="button"
              onClick={onEdit}
              className="w-8 h-8 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 flex items-center justify-center"
              title="Edit price"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={saving}
                onClick={onSave}
                className="w-8 h-8 rounded-lg bg-green-500/10 hover:bg-green-500/20 text-green-400 flex items-center justify-center disabled:opacity-40"
                title="Save"
              >
                <Save className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                disabled={saving}
                onClick={onCancel}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 flex items-center justify-center disabled:opacity-40"
                title="Cancel"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={onDelete}
            className="w-8 h-8 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 flex items-center justify-center disabled:opacity-40"
            title="Delete plan"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}

export default function PricingManagement() {
  const [activeTab, setActiveTab] =
    useState<ServiceTab>('data');

  const [rules, setRules] =
    useState<PricingRule[]>([]);

  const [editingId, setEditingId] =
    useState<string | null>(null);

  const [drafts, setDrafts] =
    useState<
      Record<string, EditDraft>
    >({});

  const [savingId, setSavingId] =
    useState<string | null>(null);

  const [loading, setLoading] =
    useState(false);

  const [showAdd, setShowAdd] =
    useState(false);

  const loadRules = useCallback(
    async () => {
      setLoading(true);

      try {
        const response =
          await apiGetPricing(
            activeTab,
          );

        setRules(
          Array.isArray(
            response.rules,
          )
            ? response.rules
            : [],
        );

        setEditingId(null);
        setDrafts({});
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Failed to load pricing.',
        );
      } finally {
        setLoading(false);
      }
    },
    [activeTab],
  );

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  function startEdit(
    rule: PricingRule,
  ) {
    setEditingId(rule.id);

    setDrafts(current => ({
      ...current,
      [rule.id]: {
        costPrice: String(
          rule.costPrice ?? 0,
        ),
        sellingPrice: String(
          rule.sellingPrice ?? 0,
        ),
        enabled: Boolean(
          rule.enabled,
        ),
      },
    }));
  }

  async function saveEdit(
    rule: PricingRule,
  ) {
    const draft =
      drafts[rule.id];

    if (!draft) {
      return;
    }

    const cost =
      safeNumber(
        draft.costPrice,
      );

    const selling =
      safeNumber(
        draft.sellingPrice,
      );

    setSavingId(rule.id);

    try {
      const updated =
        await apiUpdatePricingRule(
          rule.id,
          {
            costPrice: cost,
            sellingPrice: selling,
            markupPercent:
              cost > 0
                ? Number(
                    (
                      ((selling -
                        cost) /
                        cost) *
                      100
                    ).toFixed(2),
                  )
                : 0,
            enabled:
              draft.enabled,
          },
        );

      setRules(current =>
        current.map(item =>
          item.id === rule.id
            ? {
                ...item,
                ...updated,
                costPrice:
                  updated.costPrice ??
                  cost,
                sellingPrice:
                  updated.sellingPrice ??
                  selling,
                enabled:
                  updated.enabled ??
                  draft.enabled,
              }
            : item,
        ),
      );

      setEditingId(null);

      setDrafts(current => {
        const next = {
          ...current,
        };

        delete next[rule.id];

        return next;
      });

      toast.success(
        'Price updated successfully.',
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update price.',
      );
    } finally {
      setSavingId(null);
    }
  }

  async function toggleEnabled(
    rule: PricingRule,
    enabled: boolean,
  ) {
    try {
      const updated =
        await apiUpdatePricingRule(
          rule.id,
          {
            enabled,
          },
        );

      setRules(current =>
        current.map(item =>
          item.id === rule.id
            ? {
                ...item,
                ...updated,
                enabled,
              }
            : item,
        ),
      );

      toast.success(
        enabled
          ? 'Plan enabled.'
          : 'Plan disabled.',
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update plan.',
      );
    }
  }

  async function deleteRule(
    rule: PricingRule,
  ) {
    const name = safeText(
      rule.planName ??
        rule.planId,
      'this plan',
    );

    if (
      !window.confirm(
        `Delete "${name}"?\n\nThis action cannot be undone.`,
      )
    ) {
      return;
    }

    try {
      await apiDeletePricingRule(
        rule.id,
      );

      setRules(current =>
        current.filter(
          item =>
            item.id !== rule.id,
        ),
      );

      setEditingId(current =>
        current === rule.id
          ? null
          : current,
      );

      toast.success(
        'Plan deleted.',
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to delete plan.',
      );
    }
  }

  function exportCsv() {
    const rows = rules.map(
      rule => ({
        Service:
          rule.serviceType,
        Provider:
          rule.provider ?? '',
        Network:
          rule.network ?? '',
        'Plan ID':
          rule.planId ?? '',
        'Plan Name':
          rule.planName ?? '',
        'Cost Price':
          rule.costPrice,
        'Selling Price':
          rule.sellingPrice,
        'Markup %':
          rule.markupPercent,
        Enabled:
          rule.enabled,
      }),
    );

    exportToCsv(
      rows as unknown as Record<
        string,
        unknown
      >[],
      `pricing-${activeTab}`,
    );
  }

  const changed =
    useMemo(
      () =>
        Object.keys(drafts).length,
      [drafts],
    );

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Tags className="w-5 h-5 text-primary" />
            </div>

            <div>
              <h1 className="text-white font-semibold text-lg">
                Pricing Management
              </h1>

              <p className="text-sm text-white/40 mt-1">
                Edit existing prices without deleting the plan.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {changed > 0 && (
              <span className="text-xs text-amber-400">
                {changed} unsaved edit
                {changed !== 1
                  ? 's'
                  : ''}
              </span>
            )}

            <button
              type="button"
              onClick={() =>
                void loadRules()
              }
              disabled={loading}
              className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60"
              title="Refresh"
            >
              <RefreshCw
                className={`w-4 h-4 ${
                  loading
                    ? 'animate-spin'
                    : ''
                }`}
              />
            </button>

            <button
              type="button"
              onClick={exportCsv}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm"
            >
              <Download className="w-4 h-4" />
              Export
            </button>

            <button
              type="button"
              onClick={() =>
                setShowAdd(true)
              }
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold"
            >
              <Plus className="w-4 h-4" />
              Add Plan
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 pt-4 border-b border-white/[0.06] flex gap-1 overflow-x-auto">
        {TABS.map(tab => {
          const Icon = tab.icon;

          return (
            <button
              type="button"
              key={tab.key}
              onClick={() =>
                setActiveTab(tab.key)
              }
              className={`flex items-center gap-2 px-4 py-2.5 text-sm rounded-t-xl border-b-2 ${
                activeTab === tab.key
                  ? 'text-white border-primary bg-primary/5'
                  : 'text-white/40 border-transparent hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="bg-[#0D1F3C] border border-white/[0.06] rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-6 space-y-3">
              {Array.from({
                length: 8,
              }).map((_, index) => (
                <div
                  key={index}
                  className="h-12 rounded-xl bg-white/5 animate-pulse"
                />
              ))}
            </div>
          ) : rules.length === 0 ? (
            <div className="py-20 text-center">
              <Tags className="w-10 h-10 text-white/20 mx-auto mb-3" />

              <p className="text-white/40 text-sm">
                No pricing rules found.
              </p>

              <button
                type="button"
                onClick={() =>
                  setShowAdd(true)
                }
                className="mt-4 px-4 py-2 rounded-xl bg-primary text-white text-sm"
              >
                Add First Plan
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1050px]">
                <thead>
                  <tr className="bg-white/[0.03]">
                    {[
                      'Network',
                      'Provider',
                      'Plan Name',
                      'Cost Price',
                      'Selling Price',
                      'Markup',
                      'Enabled',
                      'Actions',
                    ].map(label => (
                      <th
                        key={label}
                        className="px-4 py-3 text-left text-[10px] uppercase tracking-wide text-white/35"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {rules.map(rule => {
                    const editing =
                      editingId ===
                      rule.id;

                    return (
                      <PricingRow
                        key={rule.id}
                        rule={rule}
                        draft={
                          drafts[
                            rule.id
                          ]
                        }
                        editing={editing}
                        saving={
                          savingId ===
                          rule.id
                        }
                        onEdit={() =>
                          startEdit(rule)
                        }
                        onChange={draft =>
                          setDrafts(
                            current => ({
                              ...current,
                              [rule.id]:
                                draft,
                            }),
                          )
                        }
                        onSave={() =>
                          void saveEdit(
                            rule,
                          )
                        }
                        onCancel={() => {
                          setEditingId(
                            null,
                          );

                          setDrafts(
                            current => {
                              const next =
                                {
                                  ...current,
                                };

                              delete next[
                                rule.id
                              ];

                              return next;
                            },
                          );
                        }}
                        onDelete={() =>
                          void deleteRule(
                            rule,
                          )
                        }
                        onToggle={enabled =>
                          void toggleEnabled(
                            rule,
                            enabled,
                          )
                        }
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {showAdd && (
        <AddPlanModal
          onClose={() =>
            setShowAdd(false)
          }
          onCreated={rule => {
            if (
              rule.serviceType ===
              activeTab
            ) {
              setRules(current => [
                ...current,
                rule,
              ]);
            }
          }}
        />
      )}
    </div>
  );
}
