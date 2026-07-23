import React, { useState, useEffect } from 'react';
import { TrendingUp, CheckCircle, XCircle, Clock, RefreshCw, Crown, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useAdminContext } from '../context/AdminContext';
import { SERVICE_CONFIG } from '../data/adminMockData';
import { fmtNaira } from '../utils/format';
import { apiGetServiceSettings, apiUpdateServiceSetting, ServiceSetting } from '../utils/adminApi';

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/[0.07] rounded-lg ${className ?? ''}`} />;
}

export default function AdminServices() {
  const { servicesData, servicesLoading, stats, fetchServices, isSuperAdmin } = useAdminContext();

  const totalRevenue = servicesData.reduce((a, s) => a + s.revenue, 0);
  const totalTxns    = servicesData.reduce((a, s) => a + s.total,   0);
  const isLoading    = servicesLoading && servicesData.length === 0;

  // Service settings state (super_admin only)
  const [serviceSettings, setServiceSettings] = useState<ServiceSetting[]>([]);
  const [settingsLoading,  setSettingsLoading]  = useState(false);
  const [settingsSaving,   setSettingsSaving]   = useState<Record<string, boolean>>({});

  // Local edit buffers for markup and notes inputs
  const [markupDraft, setMarkupDraft] = useState<Record<string, string>>({});
  const [notesDraft,  setNotesDraft]  = useState<Record<string, string>>({});

  useEffect(() => {
    if (!isSuperAdmin) return;
    setSettingsLoading(true);
    apiGetServiceSettings()
      .then(res => {
        setServiceSettings(res.services);
        const mb: Record<string, string> = {};
        const nb: Record<string, string> = {};
        res.services.forEach(s => {
          mb[s.serviceKey] = s.markup != null ? String(s.markup) : '';
          nb[s.serviceKey] = s.notes ?? '';
        });
        setMarkupDraft(mb);
        setNotesDraft(nb);
      })
      .catch(e => toast.error((e as Error).message || 'Failed to load service settings.'))
      .finally(() => setSettingsLoading(false));
  }, [isSuperAdmin]);

  async function updateSetting(key: string, updates: { enabled?: boolean; markup?: number | null; notes?: string }) {
    setSettingsSaving(prev => ({ ...prev, [key]: true }));
    try {
      await apiUpdateServiceSetting(key, updates);
      setServiceSettings(prev =>
        prev.map(s =>
          s.serviceKey === key
            ? {
                ...s,
                ...(updates.enabled !== undefined ? { enabled: updates.enabled } : {}),
                ...(updates.markup  !== undefined ? { markup:  updates.markup  } : {}),
                ...(updates.notes   !== undefined ? { notes:   updates.notes   } : {}),
              }
            : s
        )
      );
      toast.success('Setting updated.');
    } catch (e) {
      toast.error((e as Error).message || 'Failed to update setting.');
    } finally {
      setSettingsSaving(prev => ({ ...prev, [key]: false }));
    }
  }

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Services</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Performance overview across all GY DATA services</p>
        </div>
        <button
          onClick={() => fetchServices()}
          disabled={servicesLoading}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${servicesLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          {isLoading
            ? <Skeleton className="h-7 w-10 mx-auto mb-1" />
            : <p className="text-2xl font-bold">{servicesData.length}</p>
          }
          <p className="text-xs text-muted-foreground mt-1">Active Services</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          {isLoading
            ? <Skeleton className="h-7 w-24 mx-auto mb-1" />
            : <p className="text-2xl font-bold">{fmtNaira(totalRevenue)}</p>
          }
          <p className="text-xs text-muted-foreground mt-1">Total Revenue</p>
        </div>
        <div className="bg-card border border-border rounded-2xl p-4 text-center">
          {isLoading
            ? <Skeleton className="h-7 w-16 mx-auto mb-1" />
            : <p className="text-2xl font-bold">{totalTxns.toLocaleString()}</p>
          }
          <p className="text-xs text-muted-foreground mt-1">Total Transactions</p>
        </div>
      </div>

      {/* Service cards */}
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-5">
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
                  {[0, 1, 2].map(j => <Skeleton key={j} className="h-14 rounded-lg" />)}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : servicesData.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
          <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">No service data yet</p>
          <p className="text-xs mt-1">Data will appear here once customers make purchases.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {servicesData.map(s => {
            const cfg    = SERVICE_CONFIG[s.type];
            const color  = cfg?.color ?? '#3B82F6';
            const label  = cfg?.label ?? s.type;
            const icon   = cfg?.icon  ?? '💳';
            const revPct = totalRevenue > 0 ? Math.round((s.revenue / totalRevenue) * 100) : 0;
            const txnPct = totalTxns   > 0 ? Math.round((s.total   / totalTxns)   * 100) : 0;
            return (
              <div key={s.type} className="bg-card border border-border rounded-2xl p-5 hover:border-white/20 transition-colors">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
                      style={{ backgroundColor: `${color}18`, border: `1px solid ${color}30` }}
                    >
                      {icon}
                    </div>
                    <div>
                      <h3 className="font-bold">{label}</h3>
                      <p className="text-xs text-muted-foreground">{s.total.toLocaleString()} transactions</p>
                    </div>
                  </div>
                  <div
                    className="text-xs font-bold px-2 py-1 rounded-full"
                    style={{ color, backgroundColor: `${color}15`, border: `1px solid ${color}25` }}
                  >
                    {s.successRate}%
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Revenue</span>
                      <span className="text-xs font-semibold">
                        {fmtNaira(s.revenue)} · {revPct}%
                      </span>
                    </div>
                    <div className="h-1.5 bg-background rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${revPct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Txn Share</span>
                      <span className="text-xs font-semibold">{txnPct}% of total</span>
                    </div>
                    <div className="h-1.5 bg-background rounded-full overflow-hidden">
                      <div className="h-full rounded-full opacity-50" style={{ width: `${txnPct}%`, backgroundColor: color }} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 mt-4">
                  <div className="text-center bg-green-500/5 border border-green-500/15 rounded-lg p-2">
                    <CheckCircle className="w-3.5 h-3.5 text-green-400 mx-auto mb-1" />
                    <p className="text-[10px] text-muted-foreground">Success</p>
                    <p className="text-xs font-bold text-green-400">{s.successful.toLocaleString()}</p>
                  </div>
                  <div className="text-center bg-amber-500/5 border border-amber-500/15 rounded-lg p-2">
                    <Clock className="w-3.5 h-3.5 text-amber-400 mx-auto mb-1" />
                    <p className="text-[10px] text-muted-foreground">Pending</p>
                    <p className="text-xs font-bold text-amber-400">{s.pending.toLocaleString()}</p>
                  </div>
                  <div className="text-center bg-red-500/5 border border-red-500/15 rounded-lg p-2">
                    <XCircle className="w-3.5 h-3.5 text-red-400 mx-auto mb-1" />
                    <p className="text-[10px] text-muted-foreground">Failed</p>
                    <p className="text-xs font-bold text-red-400">{s.failed.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Coming soon services */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm">Upcoming Services</h2>
          <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-semibold">In Development</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: '🏦', name: 'Bank Transfer',    eta: 'Q3 2024' },
            { icon: '🎓', name: 'School Fees',      eta: 'Q3 2024' },
            { icon: '✈️', name: 'Flight Booking',   eta: 'Q4 2024' },
            { icon: '🏥', name: 'Health Insurance', eta: 'Q4 2024' },
          ].map(s => (
            <div key={s.name} className="bg-background border border-border rounded-xl p-3 text-center opacity-60">
              <div className="text-2xl mb-2">{s.icon}</div>
              <p className="text-xs font-semibold">{s.name}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{s.eta}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Service Settings (super_admin only) */}
      {isSuperAdmin && (
        <div className="bg-card border border-amber-500/20 rounded-2xl p-5">
          {/* Section header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Crown className="w-4 h-4 text-amber-400" />
              <h2 className="font-bold text-sm">Service Settings</h2>
              <span className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">
                Super Admin
              </span>
            </div>
            <button
              onClick={() => {
                setSettingsLoading(true);
                apiGetServiceSettings()
                  .then(res => {
                    setServiceSettings(res.services);
                    const mb: Record<string, string> = {};
                    const nb: Record<string, string> = {};
                    res.services.forEach(s => {
                      mb[s.serviceKey] = s.markup != null ? String(s.markup) : '';
                      nb[s.serviceKey] = s.notes ?? '';
                    });
                    setMarkupDraft(mb);
                    setNotesDraft(nb);
                  })
                  .catch(e => toast.error((e as Error).message || 'Failed to refresh settings.'))
                  .finally(() => setSettingsLoading(false));
              }}
              disabled={settingsLoading}
              className="w-7 h-7 flex items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${settingsLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Loading skeleton */}
          {settingsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : serviceSettings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No service settings available.</p>
          ) : (
            <div className="space-y-3">
              {serviceSettings.map(setting => {
                const cfg   = SERVICE_CONFIG[setting.serviceKey];
                const icon  = cfg?.icon  ?? '💳';
                const label = cfg?.label ?? setting.label ?? setting.serviceKey;
                const isSaving = settingsSaving[setting.serviceKey] ?? false;

                return (
                  <div
                    key={setting.serviceKey}
                    className="bg-background border border-border rounded-xl p-4 space-y-3"
                  >
                    {/* Row top: service name + toggle */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{icon}</span>
                        <div>
                          <p className="text-sm font-semibold">{label}</p>
                          <p className="text-[10px] text-muted-foreground">
                            Last updated by {setting.updatedByName ?? 'system'}{' '}
                            {setting.updatedAt
                              ? `on ${new Date(setting.updatedAt).toLocaleDateString()}`
                              : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {isSaving && <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />}
                        {/* Toggle */}
                        <button
                          onClick={() => updateSetting(setting.serviceKey, { enabled: !setting.enabled })}
                          disabled={isSaving}
                          className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none disabled:opacity-50 ${
                            setting.enabled ? 'bg-green-500' : 'bg-white/20'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                              setting.enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <span className={`text-xs font-medium ${setting.enabled ? 'text-green-400' : 'text-muted-foreground'}`}>
                          {setting.enabled ? 'On' : 'Off'}
                        </span>
                      </div>
                    </div>

                    {/* Markup % input */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Markup %</span>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={0.1}
                        value={markupDraft[setting.serviceKey] ?? ''}
                        onChange={e =>
                          setMarkupDraft(prev => ({ ...prev, [setting.serviceKey]: e.target.value }))
                        }
                        className="flex-1 bg-card border border-border rounded-lg h-8 px-2 text-xs outline-none focus:border-amber-400 transition-colors"
                        placeholder="0"
                      />
                      <button
                        onClick={() => {
                          const val = parseFloat(markupDraft[setting.serviceKey] ?? '');
                          updateSetting(setting.serviceKey, { markup: isNaN(val) ? null : val });
                        }}
                        disabled={isSaving}
                        className="w-8 h-8 flex items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Notes input */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-20 flex-shrink-0">Notes</span>
                      <input
                        type="text"
                        value={notesDraft[setting.serviceKey] ?? ''}
                        onChange={e =>
                          setNotesDraft(prev => ({ ...prev, [setting.serviceKey]: e.target.value }))
                        }
                        className="flex-1 bg-card border border-border rounded-lg h-8 px-2 text-xs outline-none focus:border-amber-400 transition-colors"
                        placeholder="Optional notes…"
                      />
                      <button
                        onClick={() =>
                          updateSetting(setting.serviceKey, { notes: notesDraft[setting.serviceKey] ?? '' })
                        }
                        disabled={isSaving}
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
