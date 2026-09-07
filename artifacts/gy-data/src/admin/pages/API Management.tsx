import React, { useState, useEffect, useCallback } from 'react';
// @ts-ignore — sonner is always available
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Code2,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Save,
  Server,
  Settings,
  Shield,
  Trash2,
  Unplug,
  Wifi,
  X,
  Zap,
} from 'lucide-react';

import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type ApiStatus = 'configured' | 'not_configured' | 'connected' | 'disconnected' | 'unknown';

interface ApiField {
  name?: string;
  label: string;
  value: string;
  sensitive?: boolean;
}

interface Integration {
  key: string;
  label: string;
  status: ApiStatus;
  enabled?: boolean;
  lastChecked?: string | null;
  fields?: ApiField[];
  description?: string;
}

interface ApiResponse {
  integrations?: Integration[];
  data?: Integration[];
  error?: string;
  message?: string;
}

interface ApiConfig {
  key: string;
  label: string;
  enabled: boolean;
  status: ApiStatus;
  fields: ApiField[];
}

const STATUS_META: Record<
  ApiStatus,
  { label: string; icon: React.ReactNode; className: string }
> = {
  configured: {
    label: 'Configured',
    icon: <CheckCircle2 className="h-4 w-4" />,
    className: 'bg-green-500/10 text-green-400 border-green-500/20',
  },
  connected: {
    label: 'Connected',
    icon: <CheckCircle2 className="h-4 w-4" />,
    className: 'bg-green-500/10 text-green-400 border-green-500/20',
  },
  not_configured: {
    label: 'Not Configured',
    icon: <AlertCircle className="h-4 w-4" />,
    className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  },
  disconnected: {
    label: 'Disconnected',
    icon: <Circle className="h-4 w-4" />,
    className: 'bg-red-500/10 text-red-400 border-red-500/20',
  },
  unknown: {
    label: 'Unknown',
    icon: <Clock className="h-4 w-4" />,
    className: 'bg-gray-500/10 text-gray-400 border-gray-500/20',
  },
};

const API_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  monnify: {
    bg: 'bg-purple-500/10',
    text: 'text-purple-400',
    border: 'border-purple-500/20',
  },
  paystack: {
    bg: 'bg-green-500/10',
    text: 'text-green-400',
    border: 'border-green-500/20',
  },
  flutterwave: {
    bg: 'bg-orange-500/10',
    text: 'text-orange-400',
    border: 'border-orange-500/20',
  },
};

const API_FILTER_OPTIONS = [
  { value: '', label: 'All APIs' },
  { value: 'monnify', label: 'Monnify' },
];

function statusMeta(status: ApiStatus) {
  return STATUS_META[status] || STATUS_META.unknown;
}

function apiColor(key: string) {
  return (
    API_COLORS[key] || {
      bg: 'bg-slate-500/10',
      text: 'text-slate-400',
      border: 'border-slate-500/20',
    }
  );
}

function maskValue(value: string) {
  if (!value) return '';
  if (value.length <= 6) return '••••••';
  return `${value.slice(0, 3)}••••••${value.slice(-3)}`;
}

function normalizeIntegrations(payload: ApiResponse | Integration[]): Integration[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.integrations)) return payload.integrations;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function FieldValue({
  field,
  show,
  onToggle,
}: {
  field: ApiField;
  show: boolean;
  onToggle: () => void;
}) {
  const value = field.sensitive && !show ? maskValue(field.value) : field.value;

  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 overflow-hidden text-ellipsis rounded-md bg-muted px-3 py-2 text-xs">
        {value || '—'}
      </code>

      {field.sensitive && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggle}
          className="h-8 w-8 shrink-0"
        >
          {show ? (
            <EyeOff className="h-4 w-4" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
        </Button>
      )}
    </div>
  );
}

function IntegrationCard({
  integration,
  onRefresh,
  onEdit,
}: {
  integration: Integration;
  onRefresh: () => void;
  onEdit: (integration: Integration) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const colors = apiColor(integration.key);
  const meta = statusMeta(integration.status);

  const toggleField = (name: string) => {
    setVisibleFields((current) => ({
      ...current,
      [name]: !current[name],
    }));
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="cursor-pointer" onClick={() => setExpanded((v) => !v)}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${colors.bg} ${colors.text}`}
            >
              <Server className="h-5 w-5" />
            </div>

            <div className="min-w-0">
              <CardTitle className="truncate text-base">
                {integration.label}
              </CardTitle>

              <CardDescription className="mt-1">
                {integration.description ||
                  `Configuration and connection settings for ${integration.label}.`}
              </CardDescription>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant="outline"
              className={`flex items-center gap-1 ${meta.className}`}
            >
              {meta.icon}
              {meta.label}
            </Badge>

            {expanded ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
        </div>
      </CardHeader>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <CardContent className="border-t pt-5">
              <div className="space-y-4">
                {integration.fields && integration.fields.length > 0 ? (
                  integration.fields.map((field, index) => {
                    const fieldKey = field.name || field.label || String(index);

                    return (
                      <div key={fieldKey} className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          {field.label}
                        </Label>

                        <FieldValue
                          field={field}
                          show={!!visibleFields[fieldKey]}
                          onToggle={() => toggleField(fieldKey)}
                        />
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                    No configuration fields available.
                  </div>
                )}

                <Separator />

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRefresh();
                    }}
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      onEdit(integration);
                    }}
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Configure
                  </Button>
                </div>
              </div>
            </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

function ConfigDialog({
  integration,
  open,
  onOpenChange,
  onSaved,
}: {
  integration: Integration | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!integration) return;

    const initial: Record<string, string> = {};

    for (const field of integration.fields || []) {
      initial[field.name || field.label] = field.value || '';
    }

    setValues(initial);
    setEnabled(integration.enabled !== false);
  }, [integration]);

  const save = async () => {
    if (!integration) return;

    setSaving(true);

    try {
      const response = await apiRequest('/api/admin/integrations/configure', {
        method: 'POST',
        body: JSON.stringify({
          key: integration.key,
          enabled,
          fields: values,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save API configuration.');
      }

      toast.success(`${integration.label} configuration saved.`);
      onOpenChange(false);
      onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to save API configuration.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Configure {integration?.label}</DialogTitle>
          <DialogDescription>
            Update the integration settings used by the application.
          </DialogDescription>
        </DialogHeader>

        {integration && (
          <div className="space-y-5 py-2">
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <div className="font-medium">Enabled</div>
                <div className="text-xs text-muted-foreground">
                  Allow this integration to be used by the application.
                </div>
              </div>

              <Switch checked={enabled} onCheckedChange={setEnabled} />
            </div>

            {(integration.fields || []).map((field) => {
              const key = field.name || field.label;

              return (
                <div key={key} className="space-y-2">
                  <Label htmlFor={`field-${key}`}>{field.label}</Label>

                  <Input
                    id={`field-${key}`}
                    type={field.sensitive ? 'password' : 'text'}
                    value={values[key] || ''}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    placeholder={field.sensitive ? '••••••••' : ''}
                  />
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>

          <Button type="button" onClick={save} disabled={saving}>
            {saving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function APIManagement() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedIntegration, setSelectedIntegration] =
    useState<Integration | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const loadIntegrations = useCallback(async (showRefresh = false) => {
    if (showRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const response = await apiRequest('/api/admin/integrations');

      if (!response.ok) {
        throw new Error('Failed to load integrations.');
      }

      const payload = (await response.json()) as ApiResponse | Integration[];
      const items = normalizeIntegrations(payload);

      setIntegrations(items);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Failed to load API integrations.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadIntegrations();
  }, [loadIntegrations]);

  const filteredIntegrations = integrations.filter((integration) => {
    const matchesFilter = !filter || integration.key === filter;

    const term = search.trim().toLowerCase();

    const matchesSearch =
      !term ||
      integration.label.toLowerCase().includes(term) ||
      integration.key.toLowerCase().includes(term) ||
      (integration.description || '').toLowerCase().includes(term);

    return matchesFilter && matchesSearch;
  });

  const configuredCount = integrations.filter(
    (integration) =>
      integration.status === 'configured' ||
      integration.status === 'connected'
  ).length;

  const notConfiguredCount = integrations.filter(
    (integration) => integration.status === 'not_configured'
  ).length;

  const openConfig = (integration: Integration) => {
    setSelectedIntegration(integration);
    setConfigOpen(true);
  };

  const refreshOne = async () => {
    await loadIntegrations(true);
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">
              API Management
            </h1>
          </div>

          <p className="mt-1 text-sm text-muted-foreground">
            Manage payment and external service integrations used by Gy Data.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => loadIntegrations(true)}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Server className="h-5 w-5" />
            </div>

            <div>
              <div className="text-2xl font-bold">{integrations.length}</div>
              <div className="text-xs text-muted-foreground">
                Total Integrations
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-green-500/10 text-green-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>

            <div>
              <div className="text-2xl font-bold">{configuredCount}</div>
              <div className="text-xs text-muted-foreground">Configured</div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4 p-5">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-yellow-500/10 text-yellow-400">
              <AlertCircle className="h-5 w-5" />
            </div>

            <div>
              <div className="text-2xl font-bold">{notConfiguredCount}</div>
              <div className="text-xs text-muted-foreground">
                Need Attention
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <div className="relative flex-1">
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search integrations..."
                className="pl-10"
              />
              <Zap className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            </div>

            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-full md:w-[190px]">
                <SelectValue placeholder="All APIs" />
              </SelectTrigger>

              <SelectContent>
                {API_FILTER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex min-h-[300px] items-center justify-center">
          <div className="flex items-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading integrations...
          </div>
        </div>
      ) : filteredIntegrations.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-[250px] flex-col items-center justify-center text-center">
            <Unplug className="mb-4 h-10 w-10 text-muted-foreground" />
            <h3 className="font-semibold">No integrations found</h3>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              There are no integrations matching your current search or filter.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredIntegrations.map((integration) => (
            <IntegrationCard
              key={integration.key}
              integration={integration}
              onRefresh={refreshOne}
              onEdit={openConfig}
            />
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Lock className="h-5 w-5" />
            </div>

            <div>
              <CardTitle className="text-base">Security</CardTitle>
              <CardDescription>
                API credentials should always remain server-side.
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="rounded-lg border p-4">
              <KeyRound className="mb-2 h-5 w-5 text-primary" />
              <div className="font-medium">Protected Credentials</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Sensitive API keys are masked in the admin interface.
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <Wifi className="mb-2 h-5 w-5 text-primary" />
              <div className="font-medium">Server-Side Requests</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Provider requests are made from the backend, not directly from
                the browser.
              </p>
            </div>

            <div className="rounded-lg border p-4">
              <Activity className="mb-2 h-5 w-5 text-primary" />
              <div className="font-medium">Connection Status</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Use the refresh action to retrieve the latest integration
                status.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <ConfigDialog
        integration={selectedIntegration}
        open={configOpen}
        onOpenChange={setConfigOpen}
        onSaved={() => loadIntegrations(true)}
      />
    </div>
  );
}
