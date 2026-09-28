import React, { useEffect, useMemo, useState } from 'react';
import {
  TrendingUp,
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  Crown,
  Check,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAdminContext } from '../context/AdminContext';
import { SERVICE_CONFIG } from '../data/adminMockData';
import { fmtNaira } from '../utils/format';
import {
  apiGetServiceSettings,
  apiUpdateServiceSetting,
  ServiceSetting,
} from '../utils/adminApi';

function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={`animate-pulse bg-white/[0.07] rounded-lg ${
        className ?? ''
      }`}
    />
  );
}

type SafeService = {
  type: string;
  revenue: number;
  total: number;
  successful: number;
  pending: number;
  failed: number;
  successRate: number;
};

function toNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeServices(value: unknown): SafeService[] {
  if (!Array.isArray(value)) return [];

  return value.map((service: any) => ({
    type: String(service?.type ?? 'unknown'),
    revenue: toNumber(service?.revenue),
    total: toNumber(service?.total),
    successful: toNumber(service?.successful),
    pending: toNumber(service?.pending),
    failed: toNumber(service?.failed),
    successRate: toNumber(service?.successRate),
  }));
}

function normalizeServiceSettings(value: unknown): ServiceSetting[] {
  if (!Array.isArray(value)) return [];
  return value as ServiceSetting[];
}

export default function AdminServices() {
  const {
    servicesData: rawServicesData,
    servicesLoading,
    fetchServices,
    isSuperAdmin,
  } = useAdminContext();

  /*
   * Always force servicesData to be an array.
   *
   * This prevents errors such as:
   * "can't access property 'length', k is undefined"
   * if the backend/context temporarily returns undefined/null.
   */
  const servicesData = useMemo(
    () => normalizeServices(rawServicesData),
    [rawServicesData]
  );

  const totalRevenue = useMemo(
    () =>
      servicesData.reduce(
        (total, service) => total + toNumber(service.revenue),
        0
      ),
    [servicesData]
  );

  const totalTxns = useMemo(
    () =>
      servicesData.reduce(
        (total, service) => total + toNumber(service.total),
        0
      ),
    [servicesData]
  );

  const isLoading = Boolean(servicesLoading && servicesData.length === 0);

  // Super Admin service settings
  const [serviceSettings, setServiceSettings] = useState<ServiceSetting[]>([]);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState<
    Record<string, boolean>
  >({});

  const [markupDraft, setMarkupDraft] = useState<Record<string, string>>({});
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});

  function applyServiceSettings(settings: unknown) {
    const services = normalizeServiceSettings(settings);

    setServiceSettings(services);

    const markup: Record<string, string> = {};
    const notes: Record<string, string> = {};

    services.forEach((service) => {
      markup[service.serviceKey] =
        service.markup != null ? String(service.markup) : '';

      notes[service.serviceKey] = service.notes ?? '';
    });

    setMarkupDraft(markup);
    setNotesDraft(notes);
  }

  async function loadServiceSettings() {
    if (!isSuperAdmin) return;

    setSettingsLoading(true);

    try {
      const response = await apiGetServiceSettings();

      applyServiceSettings(response?.services);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to load service settings.'
      );

      // Never leave the UI with an undefined array.
      setServiceSettings([]);
    } finally {
      setSettingsLoading(false);
    }
  }

  useEffect(() => {
    void loadServiceSettings();
  }, [isSuperAdmin]);

  async function updateSetting(
    key: string,
    updates: {
      enabled?: boolean;
      markup?: number | null;
      notes?: string;
    }
  ) {
    setSettingsSaving((previous) => ({
      ...previous,
      [key]: true,
    }));

    try {
      await apiUpdateServiceSetting(key, updates);

      setServiceSettings((previous) =>
        previous.map((service) =>
          service.serviceKey === key
            ? {
                ...service,
                ...(updates.enabled !== undefined
                  ? { enabled: updates.enabled }
                  : {}),
                ...(updates.markup !== undefined
                  ? { markup: updates.markup }
                  : {}),
                ...(updates.notes !== undefined
                  ? { notes: updates.notes }
                  : {}),
              }
            : service
        )
      );

      toast.success('Setting updated successfully.');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to update service setting.'
      );
    } finally {
      setSettingsSaving((previous) => ({
        ...previous,
        [key]: false,
      }));
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Services</h1>

          <p className="text-sm text-muted-foreground mt-0.5">
            Real service performance and configuration
          </p>
        </div>

        <button
          type="button"
          onClick={() => void fetchServices()}
          disabled={servicesLoading}
          title="Refresh services"
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 ${
              servicesLoading ? 'animate-spin' : ''
            }`}
          />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          {isLoading ? (
            <Skeleton className="h-7 w-10 mx-auto mb-1" />
          ) : (
            <p className="text-2xl font-bold">
              {servicesData.length.toLocaleString()}
            </p>
          )}

          <p className="text-xs text-muted-foreground mt-1">
            Active Services
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          {isLoading ? (
            <Skeleton className="h-7 w-24 mx-auto mb-1" />
          ) : (
            <p className="text-2xl font-bold">
              {fmtNaira(totalRevenue)}
            </p>
          )}

          <p className="text-xs text-muted-foreground mt-1">
            Total Revenue
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          {isLoading ? (
            <Skeleton className="h-7 w-16 mx-auto mb-1" />
          ) : (
            <p className="text-2xl font-bold">
              {totalTxns.toLocaleString()}
            </p>
          )}

          <p className="text-xs text-muted-foreground mt-1">
            Total Transactions
          </p>
        </div>
      </div>

      {/* Service Performance */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="bg-card border border-border rounded-2xl p-5"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <Skeleton className="w-11 h-11 rounded-xl" />

                  <div>
                    <Skeleton className="h-4 w-20 mb-1.5" />
                    <Skeleton className="h-3 w-28" />
                  </div>
                </div>

                <Skeleton className="h-5 w-12 rounded-full" />
              </div>

              <div className="space-y-3">
                <Skeleton className="h-1.5 w-full rounded-full" />
                <Skeleton className="h-1.5 w-full rounded-full" />

                <div className="grid grid-cols-3 gap-2 mt-4">
                  {[0, 1, 2].map((item) => (
                    <Skeleton
                      key={item}
                      className="h-14 rounded-lg"
                    />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : servicesData.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />

          <p className="font-semibold">No service data yet</p>

          <p className="text-xs mt-1">
            Service statistics will appear here once transactions
            are recorded.
          </p>

          <button
            type="button"
            onClick={() => void fetchServices()}
            disabled={servicesLoading}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                servicesLoading ? 'animate-spin' : ''
              }`}
            />

            Refresh
          </button>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {servicesData.map((service) => {
            const config = SERVICE_CONFIG[service.type];

            const color = config?.color ?? '#3B82F6';
            const label = config?.label ?? service.type;
            const icon = config?.icon ?? '💳';

            const revenue = toNumber(service.revenue);
            const total = toNumber(service.total);

            const successful = toNumber(service.successful);
            const pending = toNumber(service.pending);
            const failed = toNumber(service.failed);

            const successRate = toNumber(service.successRate);

            const revenuePercentage =
              totalRevenue > 0
                ? Math.round((revenue / totalRevenue) * 100)
                : 0;

            const transactionPercentage =
              totalTxns > 0
                ? Math.round((total / totalTxns) * 100)
                : 0;

            return (
              <div
                key={service.type}
                className="bg-card border border-border rounded-2xl p-5 hover:border-white/20 transition-colors"
              >
                {/* Service heading */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                      style={{
                        backgroundColor: `${color}18`,
                        border: `1px solid ${color}30`,
                      }}
                    >
                      {icon}
                    </div>

                    <div>
                      <h3 className="font-bold">{label}</h3>

                      <p className="text-xs text-muted-foreground">
                        {total.toLocaleString()} transactions
                      </p>
                    </div>
                  </div>

                  <div
                    className="text-xs font-bold px-2 py-1 rounded-full"
                    style={{
                      color,
                      backgroundColor: `${color}15`,
                      border: `1px solid ${color}25`,
                    }}
                  >
                    {successRate}%
                  </div>
                </div>

                {/* Revenue */}
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-muted-foreground">
                        Revenue
                      </span>

                      <span className="text-xs font-semibold">
                        {fmtNaira(revenue)} · {revenuePercentage}%
                      </span>
                    </div>

                    <div className="h-1.5 bg-background rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${revenuePercentage}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>

                  {/* Transaction share */}
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-muted-foreground">
                        Txn Share
                      </span>

                      <span className="text-xs font-semibold">
                        {transactionPercentage}% of total
                      </span>
                    </div>

                    <div className="h-1.5 bg-background rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full opacity-50"
                        style={{
                          width: `${transactionPercentage}%`,
                          backgroundColor: color,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Transaction status */}
                <div className="grid grid-cols-3 gap-2 mt-4">
                  <div className="text-center bg-green-500/5 border border-green-500/15 rounded-lg p-2">
                    <CheckCircle className="w-3.5 h-3.5 text-green-400 mx-auto mb-1" />

                    <p className="text-[10px] text-muted-foreground">
                      Success
                    </p>

                    <p className="text-xs font-bold text-green-400">
                      {successful.toLocaleString()}
                    </p>
                  </div>

                  <div className="text-center bg-amber-500/5 border border-amber-500/15 rounded-lg p-2">
                    <Clock className="w-3.5 h-3.5 text-amber-400 mx-auto mb-1" />

                    <p className="text-[10px] text-muted-foreground">
                      Pending
                    </p>

                    <p className="text-xs font-bold text-amber-400">
                      {pending.toLocaleString()}
                    </p>
                  </div>

                  <div className="text-center bg-red-500/5 border border-red-500/15 rounded-lg p-2">
                    <XCircle className="w-3.5 h-3.5 text-red-400 mx-auto mb-1" />

                    <p className="text-[10px] text-muted-foreground">
                      Failed
                    </p>

                    <p className="text-xs font-bold text-red-400">
                      {failed.toLocaleString()}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Super Admin Service Settings */}
      {isSuperAdmin && (
        <div className="bg-card border border-amber-500/20 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" />

              <h2 className="font-bold text-sm">
                Service Settings
              </h2>

              <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">
                Super Admin
              </span>
            </div>

            <button
              type="button"
              onClick={() => void loadServiceSettings()}
              disabled={settingsLoading}
              title="Refresh service settings"
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3 h-3 ${
                  settingsLoading ? 'animate-spin' : ''
                }`}
              />
            </button>
          </div>

          {settingsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton
                  key={index}
                  className="h-16 w-full"
                />
              ))}
            </div>
          ) : serviceSettings.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-sm text-muted-foreground">
                No service settings available.
              </p>

              <button
                type="button"
                onClick={() => void loadServiceSettings()}
                className="mt-3 px-4 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-semibold"
              >
                Reload Settings
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {serviceSettings.map((setting) => {
                const config = SERVICE_CONFIG[setting.serviceKey];

                const icon = config?.icon ?? '💳';

                const label =
                  config?.label ??
                  setting.label ??
                  setting.serviceKey;

                const isSaving =
                  settingsSaving[setting.serviceKey] ?? false;

                return (
                  <div
                    key={setting.serviceKey}
                    className="bg-background border border-border rounded-xl p-4 space-y-3"
                  >
                    {/* Service + toggle */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">
                          {icon}
                        </span>

                        <div>
                          <p className="text-sm font-semibold">
                            {label}
                          </p>

                          <p className="text-[10px] text-muted-foreground">
                            Last updated by{' '}
                            {setting.updatedByName ?? 'system'}{' '}
                            {setting.updatedAt
                              ? `on ${new Date(
                                  setting.updatedAt
                                ).toLocaleDateString()}`
                              : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isSaving && (
                          <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                        )}

                        <button
                          type="button"
                          onClick={() =>
                            void updateSetting(
                              setting.serviceKey,
                              {
                                enabled: !setting.enabled,
                              }
                            )
                          }
                          disabled={isSaving}
                          aria-label={`Toggle ${label}`}
                          className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                            setting.enabled
                              ? 'bg-green-500'
                              : 'bg-white/20'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                              setting.enabled
                                ? 'translate-x-5'
                                : 'translate-x-0'
                            }`}
                          />
                        </button>

                        <span
                          className={`text-xs font-medium ${
                            setting.enabled
                              ? 'text-green-400'
                              : 'text-muted-foreground'
                          }`}
                        >
                          {setting.enabled ? 'On' : 'Off'}
                        </span>
                      </div>
                    </div>

                    {/* Markup */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 flex-shrink-0">
                        Markup %
                      </span>

                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={
                          markupDraft[setting.serviceKey] ?? ''
                        }
                        onChange={(event) =>
                          setMarkupDraft((previous) => ({
                            ...previous,
                            [setting.serviceKey]:
                              event.target.value,
                          }))
                        }
                        className="flex-1 bg-card border border-border rounded-lg h-8 px-2 text-xs outline-none focus:border-amber-400 transition-colors"
                        placeholder="0"
                      />

                      <button
                        type="button"
                        onClick={() => {
                          const value = Number(
                            markupDraft[setting.serviceKey] ?? ''
                          );

                          void updateSetting(
                            setting.serviceKey,
                            {
                              markup: Number.isFinite(value)
                                ? value
                                : null,
                            }
                          );
                        }}
                        disabled={isSaving}
                        title="Save markup"
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Notes */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 flex-shrink-0">
                        Notes
                      </span>

                      <input
                        type="text"
                        value={
                          notesDraft[setting.serviceKey] ?? ''
                        }
                        onChange={(event) =>
                          setNotesDraft((previous) => ({
                            ...previous,
                            [setting.serviceKey]:
                              event.target.value,
                          }))
                        }
                        className="flex-1 bg-card border border-border rounded-lg h-8 px-2 text-xs outline-none focus:border-amber-400 transition-colors"
                        placeholder="Optional notes..."
                      />

                      <button
                        type="button"
                        onClick={() =>
                          void updateSetting(
                            setting.serviceKey,
                            {
                              notes:
                                notesDraft[
                                  setting.serviceKey
                                ] ?? '',
                            }
                          )
                        }
                        disabled={isSaving}
                        title="Save notes"
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
