import React, { useEffect, useState } from 'react';
import { Shield, RefreshCw, Lock, Clock, User, Settings, ChevronRight, ChevronLeft } from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { AuditLogEntry } from '../data/adminMockData';

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/[0.07] rounded-lg ${className ?? ''}`} />;
}

// ── Action metadata ───────────────────────────────────────────────────────────

const ACTION_META: Record<string, { label: string; color: string; bg: string }> = {
  login:                { label: 'Login',             color: 'text-green-400',  bg: 'bg-green-500/10' },
  login_failed:         { label: 'Login Failed',      color: 'text-red-400',    bg: 'bg-red-500/10' },
  logout:               { label: 'Logout',            color: 'text-zinc-400',   bg: 'bg-zinc-500/10' },
  profile_updated:      { label: 'Profile Updated',   color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  pin_changed:          { label: 'PIN Changed',       color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  admin_created:        { label: 'Admin Created',     color: 'text-primary',    bg: 'bg-primary/10' },
  admin_updated:        { label: 'Admin Updated',     color: 'text-blue-400',   bg: 'bg-blue-500/10' },
  admin_disabled:       { label: 'Admin Disabled',    color: 'text-red-400',    bg: 'bg-red-500/10' },
  admin_enabled:        { label: 'Admin Enabled',     color: 'text-green-400',  bg: 'bg-green-500/10' },
  admin_pin_reset:      { label: 'PIN Reset',         color: 'text-amber-400',  bg: 'bg-amber-500/10' },
  admin_deleted:        { label: 'Admin Deleted',     color: 'text-red-400',    bg: 'bg-red-500/10' },
  user_status_changed:  { label: 'User Status',       color: 'text-purple-400', bg: 'bg-purple-500/10' },
};

function ActionBadge({ action }: { action: string }) {
  const meta = ACTION_META[action] ?? { label: action, color: 'text-zinc-400', bg: 'bg-zinc-500/10' };
  return (
    <span className={`inline-flex text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function TargetIcon({ type }: { type: string | null }) {
  if (type === 'user')    return <User className="w-3.5 h-3.5 text-muted-foreground" />;
  if (type === 'admin')   return <Shield className="w-3.5 h-3.5 text-muted-foreground" />;
  if (type === 'setting') return <Settings className="w-3.5 h-3.5 text-muted-foreground" />;
  if (type === 'session') return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
  return null;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Log row ───────────────────────────────────────────────────────────────────

function LogRow({ log }: { log: AuditLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = log.details && Object.keys(log.details).length > 0;
  return (
    <div className="border-b border-border/40 last:border-0">
      <button
        onClick={() => hasDetails && setExpanded(v => !v)}
        className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors ${hasDetails ? 'hover:bg-white/[0.03] cursor-pointer' : 'cursor-default'}`}
      >
        {/* Action badge */}
        <div className="flex-shrink-0 mt-0.5">
          <ActionBadge action={log.action} />
        </div>
        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold truncate">{log.adminEmail}</span>
            {log.targetLabel && (
              <>
                <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                <div className="flex items-center gap-1">
                  <TargetIcon type={log.targetType} />
                  <span className="text-xs text-muted-foreground truncate">{log.targetLabel}</span>
                </div>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[11px] text-muted-foreground">{formatDate(log.createdAt)}</span>
            {log.ip && <span className="text-[11px] text-muted-foreground/60">· {log.ip}</span>}
          </div>
        </div>
        {hasDetails && (
          <ChevronRight className={`w-3.5 h-3.5 text-muted-foreground flex-shrink-0 transition-transform mt-1 ${expanded ? 'rotate-90' : ''}`} />
        )}
      </button>
      {expanded && hasDetails && (
        <div className="px-4 pb-3">
          <pre className="text-[11px] text-muted-foreground bg-background rounded-lg px-3 py-2 border border-border overflow-x-auto">
            {JSON.stringify(log.details, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function AdminAuditLogs() {
  const { isSuperAdmin, auditLogs, auditLogsTotal, auditLogsLoading, fetchAuditLogs } = useAdminContext();
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(auditLogsTotal / PAGE_SIZE));

  useEffect(() => {
    if (isSuperAdmin) void fetchAuditLogs({ page });
  }, [isSuperAdmin, page]);

  if (!isSuperAdmin) {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
          <Lock className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">Super Admin Access Required</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Audit logs are restricted to the Super Admin role.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-5 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Audit Logs</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {auditLogsTotal.toLocaleString()} event{auditLogsTotal !== 1 ? 's' : ''} recorded
          </p>
        </div>
        <button
          onClick={() => void fetchAuditLogs({ page })}
          disabled={auditLogsLoading}
          className="w-8 h-8 flex items-center justify-center rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${auditLogsLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(ACTION_META).slice(0, 6).map(([, meta]) => (
          <span key={meta.label} className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.bg} ${meta.color}`}>
            {meta.label}
          </span>
        ))}
      </div>

      {/* Log table */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-3 border-b border-border px-4 py-2.5 bg-background/50">
          <span className="text-xs font-semibold text-muted-foreground">Action</span>
          <span className="text-xs font-semibold text-muted-foreground">Admin / Target</span>
          <span className="text-xs font-semibold text-muted-foreground text-right">Time</span>
        </div>

        {auditLogsLoading && auditLogs.length === 0 ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-5 w-24 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-32" />
              </div>
            ))}
          </div>
        ) : auditLogs.length === 0 ? (
          <div className="py-16 text-center text-muted-foreground">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-semibold text-sm">No activity logged yet</p>
            <p className="text-xs mt-1">Events will appear here after admin actions are taken.</p>
          </div>
        ) : (
          auditLogs.map(log => <LogRow key={log.id} log={log} />)
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1 || auditLogsLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-xl hover:bg-white/5 disabled:opacity-40 transition-colors"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Previous
          </button>
          <span className="text-xs text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || auditLogsLoading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border border-border rounded-xl hover:bg-white/5 disabled:opacity-40 transition-colors"
          >
            Next <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
