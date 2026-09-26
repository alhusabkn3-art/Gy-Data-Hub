import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  Activity,
  CheckCircle2,
  Cpu,
  Eye,
  EyeOff,
  List,
  Loader2,
  RefreshCw,
  Save,
  XCircle,
  Zap,
} from 'lucide-react';

import { toast } from 'sonner';

import {
  apiCheckApiStatus,
  apiGetApiConfigs,
  apiGetApiErrorLogs,
  apiGetApiTransactionLogs,
  apiUpdateApiConfig,
  type ApiConfig,
  type ApiLogEntry,
} from '../utils/adminApi';

function Skeleton({
  className = '',
}: {
  className?: string;
}) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-white/[0.06] ${className}`}
    />
  );
}

function Status({
  status,
}: {
  status: string;
}) {
  const online =
    status === 'online';

  const offline =
    status === 'offline';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
        online
          ? 'bg-green-500/10 text-green-400'
          : offline
            ? 'bg-red-500/10 text-red-400'
            : 'bg-white/5 text-white/40'
      }`}
    >
      {online ? (
        <CheckCircle2 className="h-3.5 w-3.5" />
      ) : (
        <XCircle className="h-3.5 w-3.5" />
      )}

      {online
        ? 'Online'
        : offline
          ? 'Offline'
          : 'Unknown'}
    </span>
  );
}

function mask(
  value: string,
  revealed: boolean,
): string {
  if (!value) {
    return 'Not configured';
  }

  if (revealed) {
    return value;
  }

  return value.startsWith(
    '••••',
  )
    ? value
    : `••••••••${value.slice(-4)}`;
}

function ApiCard({
  config,
  latency,
  onRefresh,
}: {
  config: ApiConfig;
  latency: number | null;
  onRefresh: () => Promise<void>;
}) {
  const [
    editing,
    setEditing,
  ] = useState(false);

  const [
    saving,
    setSaving,
  ] = useState(false);

  const [
    revealed,
    setRevealed,
  ] = useState(false);

  const [
    enabled,
    setEnabled,
  ] = useState(
    config.enabled,
  );

  const [
    baseUrl,
    setBaseUrl,
  ] = useState(
    config.baseUrl ?? '',
  );

  const [
    apiKey,
    setApiKey,
  ] = useState('');

  useEffect(() => {
    setEnabled(
      config.enabled,
    );

    setBaseUrl(
      config.baseUrl ?? '',
    );

    setApiKey('');
  }, [config]);

  const fields =
    Array.isArray(
      config.fields,
    )
      ? config.fields
      : [];

  const apiKeyField =
    fields.find(
      (field) =>
        field.name ===
        'apiKey',
    );

  const save =
    async () => {
      setSaving(true);

      try {
        await apiUpdateApiConfig(
          config.key,
          {
            enabled,
            baseUrl,

            ...(apiKey.trim()
              ? {
                  apiKey:
                    apiKey.trim(),
                }
              : {}),
          },
        );

        toast.success(
          `${config.label} settings saved.`,
        );

        setEditing(false);

        await onRefresh();
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'Failed to save API settings.',
        );
      } finally {
        setSaving(false);
      }
    };

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#0D1F3C] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-primary/20 bg-primary/10">
            <Cpu className="h-5 w-5 text-primary" />
          </div>

          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white">
              {config.label}
            </p>

            <p className="mt-0.5 font-mono text-[10px] text-white/30">
              {config.key}
            </p>
          </div>
        </div>

        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            try {
              await apiUpdateApiConfig(
                config.key,
                {
                  enabled:
                    !enabled,
                },
              );

              setEnabled(
                (value) =>
                  !value,
              );

              toast.success(
                `${config.label} ${
                  enabled
                    ? 'disabled'
                    : 'enabled'
                }.`,
              );

              await onRefresh();
            } catch (err) {
              toast.error(
                err instanceof Error
                  ? err.message
                  : 'Failed to update API status.',
              );
            }
          }}
          className={`relative h-5 w-10 rounded-full transition ${
            enabled
              ? 'bg-primary'
              : 'bg-white/10'
          } disabled:opacity-50`}
          aria-label={`Toggle ${config.label}`}
        >
          <span
            className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
              enabled
                ? 'translate-x-5'
                : ''
            }`}
          />
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Status
          status={
            config.status
          }
        />

        {latency !== null && (
          <span className="inline-flex items-center gap-1 text-[11px] text-white/40">
            <Zap className="h-3 w-3 text-yellow-400" />

            {latency}ms
          </span>
        )}
      </div>

      <div className="mt-5 space-y-3">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
            API Key
          </p>

          {editing ? (
            <div className="flex gap-2">
              <input
                type={
                  revealed
                    ? 'text'
                    : 'password'
                }
                value={
                  apiKey
                }
                onChange={(event) =>
                  setApiKey(
                    event.target.value,
                  )
                }
                placeholder={
                  apiKeyField?.value ||
                  'Leave empty to keep current key'
                }
                className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white outline-none focus:border-primary/40"
              />

              <button
                type="button"
                onClick={() =>
                  setRevealed(
                    (value) =>
                      !value,
                  )
                }
                className="rounded-xl border border-white/[0.08] px-3 text-white/40 hover:text-white"
              >
                {revealed ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          ) : (
            <p className="font-mono text-xs text-white/60">
              {mask(
                apiKeyField?.value ??
                  '',
                false,
              )}
            </p>
          )}
        </div>

        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-white/30">
            Base URL
          </p>

          {editing ? (
            <input
              value={
                baseUrl
              }
              onChange={(event) =>
                setBaseUrl(
                  event.target.value,
                )
              }
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-xs text-white outline-none focus:border-primary/40"
            />
          ) : (
            <p className="break-all font-mono text-xs text-white/50">
              {baseUrl ||
                'Not configured'}
            </p>
          )}
        </div>
      </div>

      {editing ? (
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() =>
              void save()
            }
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}

            Save
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() =>
              setEditing(
                false,
              )
            }
            className="rounded-xl border border-white/[0.08] px-4 py-2 text-xs text-white/50 hover:text-white"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() =>
            setEditing(
              true,
            )
          }
          className="mt-5 w-full rounded-xl border border-white/[0.08] px-4 py-2 text-xs font-semibold text-white/50 hover:bg-white/[0.04] hover:text-white"
        >
          Edit Settings
        </button>
      )}
    </div>
  );
}

function LogTable({
  logs,
  transaction,
}: {
  logs: ApiLogEntry[];
  transaction: boolean;
}) {
  if (!logs.length) {
    return (
      <div className="py-14 text-center text-sm text-white/35">
        No{' '}
        {transaction
          ? 'API transaction'
          : 'API error'}{' '}
        logs found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-white/[0.06] text-[10px] uppercase tracking-wider text-white/30">
            <th className="px-4 py-3">
              Time
            </th>

            <th className="px-4 py-3">
              API
            </th>

            <th className="px-4 py-3">
              Endpoint
            </th>

            <th className="px-4 py-3">
              Status
            </th>

            <th className="px-4 py-3">
              Response
            </th>

            <th className="px-4 py-3">
              Reference
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-white/[0.05]">
          {logs.map(
            (log) => (
              <tr
                key={log.id}
                className="hover:bg-white/[0.02]"
              >
                <td className="whitespace-nowrap px-4 py-3 text-white/40">
                  {new Date(
                    log.createdAt,
                  ).toLocaleString(
                    'en-NG',
                  )}
                </td>

                <td className="px-4 py-3 font-semibold text-white/70">
                  {log.api}
                </td>

                <td className="max-w-[240px] truncate px-4 py-3 font-mono text-white/40">
                  {log.endpoint}
                </td>

                <td className="px-4 py-3">
                  <span
                    className={
                      log.statusCode &&
                      log.statusCode <
                        400
                        ? 'text-green-400'
                        : 'text-red-400'
                    }
                  >
                    {log.statusCode ??
                      '—'}
                  </span>
                </td>

                <td className="px-4 py-3 text-white/40">
                  {log.responseTime !=
                  null
                    ? `${log.responseTime}ms`
                    : '—'}
                </td>

                <td className="max-w-[180px] truncate px-4 py-3 font-mono text-white/30">
                  {log.reference ??
                    '—'}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

export default function APIManagement() {
  const [
    configs,
    setConfigs,
  ] = useState<
    ApiConfig[]
  >([]);

  const [
    latency,
    setLatency,
  ] = useState<
    Record<
      string,
      number | null
    >
  >({});

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    checking,
    setChecking,
  ] = useState(false);

  const [
    tab,
    setTab,
  ] = useState<
    'errors' | 'transactions'
  >('errors');

  const [
    apiFilter,
    setApiFilter,
  ] = useState('');

  const [
    logs,
    setLogs,
  ] = useState<
    ApiLogEntry[]
  >([]);

  const [
    logsLoading,
    setLogsLoading,
  ] = useState(false);

  const loadConfigs =
    useCallback(
      async () => {
        setLoading(
          true,
        );

        try {
          const result =
            await apiGetApiConfigs();

          setConfigs(
            Array.isArray(
              result.configs,
            )
              ? result.configs
              : [],
          );
        } catch (err) {
          setConfigs([]);

          toast.error(
            err instanceof Error
              ? err.message
              : 'Failed to load API configurations.',
          );
        } finally {
          setLoading(
            false,
          );
        }
      },
      [],
    );

  const loadLogs =
    useCallback(
      async () => {
        setLogsLoading(
          true,
        );

        try {
          const result =
            tab ===
            'errors'
              ? await apiGetApiErrorLogs(
                  {
                    api:
                      apiFilter ||
                      undefined,
                    page: 1,
                  },
                )
              : await apiGetApiTransactionLogs(
                  {
                    api:
                      apiFilter ||
                      undefined,
                    page: 1,
                  },
                );

          setLogs(
            Array.isArray(
              result.logs,
            )
              ? result.logs
              : [],
          );
        } catch (err) {
          setLogs([]);

          toast.error(
            err instanceof Error
              ? err.message
              : 'Failed to load API logs.',
          );
        } finally {
          setLogsLoading(
            false,
          );
        }
      },
      [
        apiFilter,
        tab,
      ],
    );

  useEffect(
    () => {
      void loadConfigs();
    },
    [loadConfigs],
  );

  useEffect(
    () => {
      void loadLogs();
    },
    [loadLogs],
  );

  const checkStatus =
    async () => {
      setChecking(
        true,
      );

      try {
        const result =
          await apiCheckApiStatus();

        const next: Record<
          string,
          number | null
        > = {};

        setConfigs(
          (current) =>
            current.map(
              (config) => {
                const item =
                  result.results.find(
                    (value) =>
                      value.key ===
                      config.key,
                  );

                if (!item) {
                  return config;
                }

                next[
                  config.key
                ] =
                  item.latency;

                return {
                  ...config,

                  status:
                    item.status as ApiConfig['status'],

                  lastChecked:
                    item.checkedAt,
                };
              },
            ),
        );

        setLatency(
          next,
        );

        await loadLogs();

        toast.success(
          'API status check completed.',
        );
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : 'API status check failed.',
        );
      } finally {
        setChecking(
          false,
        );
      }
    };

  const refresh =
    async () => {
      await Promise.all([
        loadConfigs(),
        loadLogs(),
      ]);
    };

  const apiOptions =
    useMemo(
      () => {
        const values =
          configs
            .map(
              (config) =>
                config.key,
            )
            .filter(Boolean);

        return Array.from(
          new Set([
            'smeapi',
            'monnify',
            ...values,
          ]),
        );
      },
      [configs],
    );

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold text-white lg:text-2xl">
            API Management
          </h1>

          <p className="mt-1 text-sm text-white/35">
            Provider configuration,
            live status and API
            activity.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() =>
              void checkStatus()
            }
            disabled={
              checking
            }
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/60 hover:text-white disabled:opacity-40"
          >
            <Activity
              className={`h-4 w-4 ${
                checking
                  ? 'animate-spin'
                  : ''
              }`}
            />

            Check Status
          </button>

          <button
            type="button"
            onClick={() =>
              void refresh()
            }
            disabled={
              loading ||
              logsLoading
            }
            className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-white/60 hover:text-white disabled:opacity-40"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                loading ||
                logsLoading
                  ? 'animate-spin'
                  : ''
              }`}
            />

            Refresh
          </button>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2">
        {loading &&
        !configs.length ? (
          <>
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </>
        ) : configs.length ===
          0 ? (
          <div className="md:col-span-2 rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-sm text-red-300">
            No API configuration
            records are available.
            Run the updated database
            bootstrap.
          </div>
        ) : (
          configs.map(
            (config) => (
              <ApiCard
                key={
                  config.id ||
                  config.key
                }
                config={
                  config
                }
                latency={
                  latency[
                    config.key
                  ] ??
                  null
                }
                onRefresh={
                  loadConfigs
                }
              />
            ),
          )
        )}
      </section>

      <section className="overflow-hidden rounded-2xl border border-white/[0.07] bg-[#0D1F3C]">
        <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <List className="h-4 w-4 text-primary" />

            <h2 className="text-sm font-bold text-white">
              API Logs
            </h2>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setTab('errors')
              }
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                tab ===
                'errors'
                  ? 'bg-red-500/10 text-red-300'
                  : 'text-white/40'
              }`}
            >
              Errors
            </button>

            <button
              type="button"
              onClick={() =>
                setTab(
                  'transactions',
                )
              }
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                tab ===
                'transactions'
                  ? 'bg-green-500/10 text-green-300'
                  : 'text-white/40'
              }`}
            >
              Transactions
            </button>

            <select
              value={
                apiFilter
              }
              onChange={(
                event,
              ) =>
                setApiFilter(
                  event.target
                    .value,
                )
              }
              className="rounded-lg border border-white/[0.08] bg-[#0B1B35] px-2 py-1.5 text-xs text-white outline-none"
            >
              <option value="">
                All APIs
              </option>

              {apiOptions.map(
                (key) => (
                  <option
                    key={key}
                    value={key}
                  >
                    {key}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>

        {logsLoading &&
        !logs.length ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
            <Skeleton className="h-10" />
          </div>
        ) : (
          <LogTable
            logs={logs}
            transaction={
              tab ===
              'transactions'
            }
          />
        )}
      </section>
    </div>
  );
}
