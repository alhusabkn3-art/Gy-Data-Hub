import React, { useState, useEffect } from 'react';
import { Shield, Eye, EyeOff, RefreshCw, Plug, Crown, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { apiGetIntegrations, Integration } from '../utils/adminApi';
import { toast } from 'sonner';

export default function APIIntegrations() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealedFields, setRevealedFields] = useState<Record<string, Record<string, boolean>>>({});

  const fetchIntegrations = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiGetIntegrations();
      setIntegrations(data.integrations);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load integrations';
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIntegrations();
  }, []);

  const toggleField = (integrationKey: string, fieldLabel: string) => {
    setRevealedFields(prev => ({
      ...prev,
      [integrationKey]: {
        ...(prev[integrationKey] ?? {}),
        [fieldLabel]: !(prev[integrationKey]?.[fieldLabel] ?? false),
      },
    }));
  };

  const isRevealed = (integrationKey: string, fieldLabel: string): boolean =>
    revealedFields[integrationKey]?.[fieldLabel] ?? false;

  return (
    <div className="min-h-screen bg-[#0A1628] text-foreground p-6 space-y-6">
      {/* HEADER */}
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Plug className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold text-white">API Integrations</h1>
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <Crown className="w-3 h-3" /> Super Admin
          </span>
        </div>
        <p className="text-muted-foreground text-sm">Configured payment &amp; telecom API credentials</p>
      </div>

      {/* INFO BANNER */}
      <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl p-4">
        <AlertTriangle className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
        <p className="text-amber-300 text-sm">
          Sensitive values are masked for security. Contact your system administrator to rotate API credentials.
        </p>
      </div>

      {/* LOADING */}
      {loading && (
        <div className="space-y-4">
          {[1, 2].map(i => (
            <div key={i} className="bg-card border border-border rounded-2xl p-5 animate-pulse h-40" />
          ))}
        </div>
      )}

      {/* ERROR */}
      {!loading && error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
          <p className="text-red-400 font-medium">{error}</p>
          <button
            onClick={fetchIntegrations}
            className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white font-semibold px-4 py-2 rounded-lg text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Retry
          </button>
        </div>
      )}

      {/* EMPTY */}
      {!loading && !error && integrations.length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          <Shield className="w-10 h-10 text-muted-foreground mb-1" />
          <p className="text-muted-foreground font-medium">No integrations configured</p>
        </div>
      )}

      {/* INTEGRATION CARDS */}
      {!loading && !error && integrations.length > 0 && (
        <div className="space-y-4">
          {integrations.map(integration => (
            <div key={integration.key} className="bg-card border border-border rounded-2xl p-5">
              {/* Card Header */}
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-bold text-white">{integration.label}</h2>
                {integration.status === 'configured' ? (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-500/10 border border-green-500/20 text-green-400">
                    <CheckCircle2 className="w-3 h-3" /> Configured
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <AlertTriangle className="w-3 h-3" /> Not Configured
                  </span>
                )}
              </div>

              {/* Fields */}
              <div className="space-y-3">
                {integration.fields.map(field => {
                  const revealed = isRevealed(integration.key, field.label);
                  return (
                    <div key={field.label} className="flex items-center justify-between gap-3 flex-wrap">
                      <span className="text-xs text-muted-foreground font-medium w-36 flex-shrink-0">{field.label}</span>
                      {field.sensitive ? (
                        <div className="flex items-center gap-2 flex-1 justify-end">
                          <span className="font-mono text-xs bg-background/50 px-2 py-1 rounded text-white min-w-0 break-all">
                            {revealed ? field.value : '••••••••••••'}
                          </span>
                          <button
                            onClick={() => toggleField(integration.key, field.label)}
                            className="flex-shrink-0 text-muted-foreground hover:text-white transition-colors p-1 rounded hover:bg-white/5"
                            title={revealed ? 'Hide value' : 'Show value'}
                          >
                            {revealed ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      ) : (
                        <span className="font-mono text-xs bg-background/50 px-2 py-1 rounded text-white flex-1 text-right break-all">
                          {field.value}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Not configured warning footer */}
              {integration.status === 'not_configured' && (
                <div className="mt-4 pt-4 border-t border-border flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-amber-400 text-xs">
                    This integration is not configured. Services depending on it may fail.
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
