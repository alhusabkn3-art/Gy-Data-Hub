// artifacts/gy-data/src/admin/pages/CashbackManagement.tsx

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Gift,
  Power,
  RefreshCw,
  Save,
  Settings,
} from 'lucide-react';
import { toast } from 'sonner';
import { adminApi } from '../context/AdminContext';

interface CashbackSettings {
  enabled: boolean;
  minTransferAmount: number;
  transferMode: 'manual' | 'auto';
  eligibleServices: string[];
  updatedAt?: string;
}

interface CashbackPlan {
  id: string;
  service_type: string;
  provider: string | null;
  network: string | null;
  plan_id: string | null;
  plan_name: string | null;
  cost_price: string | number;
  selling_price: string | number;
  enabled: boolean;
  cashback_enabled: boolean;
  cashback_type: 'percentage' | 'fixed';
  cashback_value: string | number;
  updated_at?: string;
}

function safeNumber(
  value: unknown,
): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n)
    ? n
    : 0;
}

function safeText(
  value: unknown,
  fallback = '—',
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

function Toggle({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (
    value: boolean,
  ) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() =>
        onChange(!checked)
      }
      className={`relative w-11 h-6 rounded-full transition-colors ${
        checked
          ? 'bg-green-500'
          : 'bg-white/15'
      } ${
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : ''
      }`}
    >
      <span
        className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
          checked
            ? 'translate-x-6'
            : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function CashbackManagement() {
  const [settings, setSettings] =
    useState<CashbackSettings | null>(
      null,
    );

  const [plans, setPlans] =
    useState<CashbackPlan[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [
    togglingGlobal,
    setTogglingGlobal,
  ] = useState(false);

  const [savingPlan, setSavingPlan] =
    useState<string | null>(null);

  const [network, setNetwork] =
    useState('ALL');

  const [
    editingSettings,
    setEditingSettings,
  ] = useState(false);

  const [
    savingSettings,
    setSavingSettings,
  ] = useState(false);

  const [
    minTransferAmount,
    setMinTransferAmount,
  ] = useState('100');

  const [
    transferMode,
    setTransferMode,
  ] = useState<
    'manual' | 'auto'
  >('manual');

  const [
    eligibleServices,
    setEligibleServices,
  ] = useState<string[]>(
    ['data'],
  );

  const loadData =
    useCallback(
      async () => {
        setLoading(true);

        try {
          const [
            settingsResponse,
            plansResponse,
          ] = await Promise.all([
            adminApi(
              '/api/admin/cashback/settings',
            ),
            adminApi(
              '/api/admin/cashback/plans',
            ),
          ]);

          if (
            !settingsResponse.ok
          ) {
            const body =
              await settingsResponse
                .json()
                .catch(() => null);

            throw new Error(
              body?.error ??
                'Failed to load cashback settings.',
            );
          }

          if (
            !plansResponse.ok
          ) {
            const body =
              await plansResponse
                .json()
                .catch(() => null);

            throw new Error(
              body?.error ??
                'Failed to load cashback plans.',
            );
          }

          const settingsData =
            (await settingsResponse.json()) as CashbackSettings;

          const plansData =
            (await plansResponse.json()) as {
              plans?: CashbackPlan[];
            };

          setSettings(
            settingsData,
          );

          setMinTransferAmount(
            String(
              settingsData.minTransferAmount ??
                100,
            ),
          );

          setTransferMode(
            settingsData.transferMode ??
              'manual',
          );

          setEligibleServices(
            Array.isArray(
              settingsData.eligibleServices,
            )
              ? settingsData.eligibleServices
              : ['data'],
          );

          setPlans(
            Array.isArray(
              plansData.plans,
            )
              ? plansData.plans
              : [],
          );
        } catch (error) {
          toast.error(
            error instanceof Error
              ? error.message
              : 'Failed to load cashback.',
          );
        } finally {
          setLoading(false);
        }
      },
      [],
    );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function toggleGlobal() {
    if (!settings) {
      return;
    }

    const next =
      !settings.enabled;

    setTogglingGlobal(true);

    try {
      const response =
        await adminApi(
          '/api/admin/cashback/settings',
          {
            method: 'PATCH',
            body: JSON.stringify({
              enabled: next,
            }),
          },
        );

      const body =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          body?.error ??
            'Failed to update global cashback.',
        );
      }

      const freshResponse =
        await adminApi(
          '/api/admin/cashback/settings',
        );

      if (!freshResponse.ok) {
        throw new Error(
          'Cashback changed but verification failed.',
        );
      }

      const fresh =
        (await freshResponse.json()) as CashbackSettings;

      setSettings(fresh);

      toast.success(
        fresh.enabled
          ? 'Global cashback is now ON.'
          : 'Global cashback is now OFF.',
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update cashback.',
      );
    } finally {
      setTogglingGlobal(false);
    }
  }

  async function saveSettings() {
    setSavingSettings(true);

    try {
      const amount =
        Number(
          minTransferAmount,
        );

      if (
        !Number.isFinite(amount) ||
        amount < 0
      ) {
        throw new Error(
          'Minimum transfer amount is invalid.',
        );
      }

      const response =
        await adminApi(
          '/api/admin/cashback/settings',
          {
            method: 'PATCH',
            body: JSON.stringify({
              minTransferAmount:
                amount,
              transferMode,
              eligibleServices,
            }),
          },
        );

      const body =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          body?.error ??
            'Failed to save cashback settings.',
        );
      }

      const freshResponse =
        await adminApi(
          '/api/admin/cashback/settings',
        );

      const fresh =
        (await freshResponse.json()) as CashbackSettings;

      setSettings(fresh);

      setEditingSettings(
        false,
      );

      toast.success(
        'Cashback settings saved.',
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to save settings.',
      );
    } finally {
      setSavingSettings(false);
    }
  }

  async function savePlan(
    plan: CashbackPlan,
    values: {
      enabled: boolean;
      type: 'percentage' | 'fixed';
      value: number;
    },
  ) {
    setSavingPlan(plan.id);

    try {
      const response =
        await adminApi(
          `/api/admin/cashback/plans/${encodeURIComponent(
            plan.id,
          )}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              cashbackEnabled:
                values.enabled,
              cashbackType:
                values.type,
              cashbackValue:
                values.value,
            }),
          },
        );

      const body =
        await response
          .json()
          .catch(() => null);

      if (!response.ok) {
        throw new Error(
          body?.error ??
            'Failed to update plan cashback.',
        );
      }

      setPlans(current =>
        current.map(item =>
          item.id === plan.id
            ? {
                ...item,
                cashback_enabled:
                  values.enabled,
                cashback_type:
                  values.type,
                cashback_value:
                  values.value.toFixed(
                    2,
                  ),
              }
            : item,
        ),
      );

      toast.success(
        'Plan cashback updated.',
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update plan.',
      );
    } finally {
      setSavingPlan(null);
    }
  }

  const networks =
    useMemo(() => {
      return [
        'ALL',
        ...Array.from(
          new Set(
            plans
              .map(plan =>
                safeText(
                  plan.network ??
                    plan.provider,
                  '',
                ).toUpperCase(),
              )
              .filter(Boolean),
          ),
        ).sort(),
      ];
    }, [plans]);

  const filteredPlans =
    useMemo(() => {
      if (network === 'ALL') {
        return plans;
      }

      return plans.filter(
        plan =>
          safeText(
            plan.network ??
              plan.provider,
            '',
          ).toUpperCase() ===
          network,
      );
    }, [
      plans,
      network,
    ]);

  const enabledCount =
    plans.filter(
      plan =>
        plan.cashback_enabled,
    ).length;

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Gift className="w-5 h-5 text-green-400" />
            </div>

            <div>
              <h1 className="text-white font-semibold text-lg">
                Cashback Management
              </h1>

              <p className="text-sm text-white/40 mt-1">
                Control global and per-plan cashback.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              void loadData()
            }
            disabled={loading}
            className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/60"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                loading
                  ? 'animate-spin'
                  : ''
              }`}
            />
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="bg-[#0D1F3C] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div
                className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                  settings?.enabled
                    ? 'bg-green-500/10'
                    : 'bg-white/5'
                }`}
              >
                <Power
                  className={`w-5 h-5 ${
                    settings?.enabled
                      ? 'text-green-400'
                      : 'text-white/30'
                  }`}
                />
              </div>

              <div>
                <p className="text-white font-semibold">
                  Global Cashback
                </p>

                <p className="text-xs text-white/40 mt-1">
                  {settings?.enabled
                    ? 'Cashback is enabled globally.'
                    : 'Cashback is disabled globally.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span
                className={`text-xs font-bold ${
                  settings?.enabled
                    ? 'text-green-400'
                    : 'text-white/30'
                }`}
              >
                {settings?.enabled
                  ? 'ON'
                  : 'OFF'}
              </span>

              <Toggle
                checked={
                  settings?.enabled ??
                  false
                }
                disabled={
                  !settings ||
                  togglingGlobal
                }
                onChange={() =>
                  void toggleGlobal()
                }
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#0D1F3C] border border-white/[0.06] rounded-2xl p-4">
            <p className="text-xs text-white/35">
              Global Status
            </p>

            <p
              className={`text-xl font-bold mt-2 ${
                settings?.enabled
                  ? 'text-green-400'
                  : 'text-white/40'
              }`}
            >
              {settings?.enabled
                ? 'Active'
                : 'Off'}
            </p>
          </div>

          <div className="bg-[#0D1F3C] border border-white/[0.06] rounded-2xl p-4">
            <p className="text-xs text-white/35">
              Plans With Cashback
            </p>

            <p className="text-xl font-bold text-white mt-2">
              {enabledCount.toLocaleString(
                'en-NG',
              )}
            </p>
          </div>

          <div className="bg-[#0D1F3C] border border-white/[0.06] rounded-2xl p-4">
            <p className="text-xs text-white/35">
              Minimum Transfer
            </p>

            <p className="text-xl font-bold text-white mt-2">
              ₦
              {safeNumber(
                settings?.minTransferAmount,
              ).toLocaleString(
                'en-NG',
              )}
            </p>
          </div>
        </div>

        <div className="bg-[#0D1F3C] border border-white/[0.06] rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Settings className="w-5 h-5 text-primary" />

              <div>
                <h2 className="text-white font-semibold">
                  Cashback Settings
                </h2>

                <p className="text-xs text-white/35 mt-1">
                  Transfer and eligibility settings.
                </p>
              </div>
            </div>

            {!editingSettings ? (
              <button
                type="button"
                onClick={() =>
                  setEditingSettings(
                    true,
                  )
                }
                className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 text-sm"
              >
                Edit
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setEditingSettings(
                      false,
                    )
                  }
                  className="px-3 py-2 rounded-xl bg-white/5 text-white/60 text-sm"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  disabled={
                    savingSettings
                  }
                  onClick={() =>
                    void saveSettings()
                  }
                  className="px-3 py-2 rounded-xl bg-primary text-white text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
            <div>
              <label className="text-xs text-white/40">
                Minimum Transfer Amount
              </label>

              {editingSettings ? (
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={
                    minTransferAmount
                  }
                  onChange={event =>
                    setMinTransferAmount(
                      event.target.value,
                    )
                  }
                  className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                />
              ) : (
                <p className="mt-2 text-white font-semibold">
                  ₦
                  {safeNumber(
                    settings?.minTransferAmount,
                  ).toLocaleString(
                    'en-NG',
                  )}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-white/40">
                Transfer Mode
              </label>

              {editingSettings ? (
                <select
                  value={transferMode}
                  onChange={event =>
                    setTransferMode(
                      event.target
                        .value as
                        | 'manual'
                        | 'auto',
                    )
                  }
                  className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
                >
                  <option
                    value="manual"
                    className="bg-[#0D1F3C]"
                  >
                    Manual
                  </option>

                  <option
                    value="auto"
                    className="bg-[#0D1F3C]"
                  >
                    Auto
                  </option>
                </select>
              ) : (
                <p className="mt-2 text-white font-semibold capitalize">
                  {safeText(
                    settings?.transferMode,
                    'manual',
                  )}
                </p>
              )}
            </div>

            <div>
              <label className="text-xs text-white/40">
                Eligible Services
              </label>

              {editingSettings ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    'data',
                    'airtime',
                    'electricity',
                    'cable',
                    'betting',
                  ].map(service => {
                    const active =
                      eligibleServices.includes(
                        service,
                      );

                    return (
                      <button
                        type="button"
                        key={service}
                        onClick={() =>
                          setEligibleServices(
                            current =>
                              active
                                ? current.filter(
                                    item =>
                                      item !==
                                      service,
                                  )
                                : [
                                    ...current,
                                    service,
                                  ],
                          )
                        }
                        className={`px-3 py-1.5 rounded-lg text-xs capitalize ${
                          active
                            ? 'bg-primary text-white'
                            : 'bg-white/5 text-white/40'
                        }`}
                      >
                        {service}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-2 text-white font-semibold capitalize">
                  {(
                    settings?.eligibleServices ??
                    []
                  ).join(
                    ', ',
                  ) || 'None'}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-[#0D1F3C] border border-white/[0.06] rounded-2xl overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-white font-semibold">
                Data Plan Cashback
              </h2>

              <p className="text-xs text-white/35 mt-1">
                Configure cashback individually for each plan.
              </p>
            </div>

            <select
              value={network}
              onChange={event =>
                setNetwork(
                  event.target.value,
                )
              }
              className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white"
            >
              {networks.map(item => (
                <option
                  key={item}
                  value={item}
                  className="bg-[#0D1F3C]"
                >
                  {item}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <div className="p-5 space-y-3">
              {Array.from({
                length: 8,
              }).map((_, index) => (
                <div
                  key={index}
                  className="h-12 bg-white/5 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : filteredPlans.length === 0 ? (
            <div className="py-16 text-center text-white/30 text-sm">
              No data plans found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px]">
                <thead>
                  <tr className="bg-white/[0.03]">
                    <th className="px-4 py-3 text-left text-[10px] uppercase text-white/35">
                      Network
                    </th>

                    <th className="px-4 py-3 text-left text-[10px] uppercase text-white/35">
                      Plan
                    </th>

                    <th className="px-4 py-3 text-left text-[10px] uppercase text-white/35">
                      Selling Price
                    </th>

                    <th className="px-4 py-3 text-left text-[10px] uppercase text-white/35">
                      Cashback
                    </th>

                    <th className="px-4 py-3 text-left text-[10px] uppercase text-white/35">
                      Type
                    </th>

                    <th className="px-4 py-3 text-left text-[10px] uppercase text-white/35">
                      Value
                    </th>

                    <th className="px-4 py-3 text-left text-[10px] uppercase text-white/35">
                      Save
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {filteredPlans.map(
                    plan => (
                      <CashbackPlanRow
                        key={plan.id}
                        plan={plan}
                        saving={
                          savingPlan ===
                          plan.id
                        }
                        onSave={values =>
                          void savePlan(
                            plan,
                            values,
                          )
                        }
                      />
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CashbackPlanRow({
  plan,
  saving,
  onSave,
}: {
  plan: CashbackPlan;
  saving: boolean;
  onSave: (
    values: {
      enabled: boolean;
      type:
        | 'percentage'
        | 'fixed';
      value: number;
    },
  ) => void;
}) {
  const [enabled, setEnabled] =
    useState(
      Boolean(
        plan.cashback_enabled,
      ),
    );

  const [type, setType] =
    useState<
      'percentage' | 'fixed'
    >(
      plan.cashback_type ===
        'fixed'
        ? 'fixed'
        : 'percentage',
    );

  const [value, setValue] =
    useState(
      String(
        plan.cashback_value ??
          0,
      ),
    );

  useEffect(() => {
    setEnabled(
      Boolean(
        plan.cashback_enabled,
      ),
    );

    setType(
      plan.cashback_type ===
        'fixed'
        ? 'fixed'
        : 'percentage',
    );

    setValue(
      String(
        plan.cashback_value ??
          0,
      ),
    );
  }, [
    plan.cashback_enabled,
    plan.cashback_type,
    plan.cashback_value,
  ]);

  return (
    <tr className="border-t border-white/[0.05]">
      <td className="px-4 py-3 text-sm text-white/60">
        {safeText(
          plan.network ??
            plan.provider,
        )}
      </td>

      <td className="px-4 py-3">
        <p className="text-sm text-white">
          {safeText(
            plan.plan_name ??
              plan.plan_id,
            'Unnamed',
          )}
        </p>

        <p className="text-[10px] text-white/30">
          {safeText(
            plan.plan_id,
          )}
        </p>
      </td>

      <td className="px-4 py-3 text-sm text-white">
        ₦
        {safeNumber(
          plan.selling_price,
        ).toLocaleString(
          'en-NG',
          {
            minimumFractionDigits: 2,
          },
        )}
      </td>

      <td className="px-4 py-3">
        <Toggle
          checked={enabled}
          disabled={saving}
          onChange={setEnabled}
        />
      </td>

      <td className="px-4 py-3">
        <select
          value={type}
          disabled={
            !enabled || saving
          }
          onChange={event =>
            setType(
              event.target
                .value as
                | 'percentage'
                | 'fixed',
            )
          }
          className="bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white disabled:opacity-40"
        >
          <option
            value="percentage"
            className="bg-[#0D1F3C]"
          >
            Percentage
          </option>

          <option
            value="fixed"
            className="bg-[#0D1F3C]"
          >
            Fixed
          </option>
        </select>
      </td>

      <td className="px-4 py-3">
        <input
          type="number"
          min="0"
          step="0.01"
          value={value}
          disabled={
            !enabled || saving
          }
          onChange={event =>
            setValue(
              event.target.value,
            )
          }
          className="w-24 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white disabled:opacity-40"
        />
      </td>

      <td className="px-4 py-3">
        <button
          type="button"
          disabled={saving}
          onClick={() =>
            onSave({
              enabled,
              type,
              value: Math.max(
                0,
                safeNumber(value),
              ),
            })
          }
          className="w-8 h-8 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary flex items-center justify-center disabled:opacity-40"
        >
          <Save className="w-3.5 h-3.5" />
        </button>
      </td>
    </tr>
  );
}
