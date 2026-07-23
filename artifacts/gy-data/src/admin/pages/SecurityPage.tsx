import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ShieldCheck, LogIn, Monitor, Key, Clock, MapPin, AlertTriangle,
  CheckCircle2, XCircle, Trash2, RefreshCw, Lock, Eye, EyeOff, X, Activity,
} from 'lucide-react';
import {
  apiGetAdminLoginHistory, apiGetActiveSessions, apiRevokeSession,
  apiGet2FAStatus, apiSetup2FA, apiVerify2FA,
  type AdminLoginHistoryEntry, type AdminSessionRecord,
} from '../utils/adminApi';
import { useAdminContext } from '../context/AdminContext';
import { toast } from 'sonner';

// ── Helpers ────────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min${Math.floor(diff / 60) !== 1 ? 's' : ''} ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr${Math.floor(diff / 3600) !== 1 ? 's' : ''} ago`;
  return `${Math.floor(diff / 86400)} day${Math.floor(diff / 86400) !== 1 ? 's' : ''} ago`;
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-white/5 rounded-lg ${className}`} />;
}

// ── Stat Card ──────────────────────────────────────────────────────────────────

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color: string;
  iconBg: string;
}

function StatCard({ label, value, icon: Icon, color, iconBg }: StatCardProps) {
  return (
    <div className="bg-[#0D1F3C] rounded-2xl p-5 border border-white/[0.06] flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
        <Icon className={`w-5 h-5 ${color}`} />
      </div>
      <div>
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ── Revoke Confirm Modal ───────────────────────────────────────────────────────

interface RevokeModalProps {
  session: AdminSessionRecord;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

function RevokeModal({ session, onConfirm, onClose }: RevokeModalProps) {
  const [loading, setLoading] = useState(false);

  async function handleConfirm() {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="max-w-sm w-full bg-[#0D1F3C] rounded-2xl border border-white/10 p-6"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-400" />
          </div>
          <h3 className="text-white font-semibold">Revoke Session</h3>
        </div>
        <p className="text-sm text-muted-foreground mb-1">
          Revoke the session for <span className="text-white font-medium">{session.adminEmail}</span>?
        </p>
        <p className="text-xs text-muted-foreground mb-5">
          IP: {session.ipAddress ?? 'Unknown'} · Started {relativeTime(session.createdAt)}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className="flex-1 px-4 py-2 text-sm font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded-xl transition-colors disabled:opacity-50"
          >
            {loading ? 'Revoking…' : 'Revoke'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Login History Tab ──────────────────────────────────────────────────────────

interface LoginHistoryTabProps {
  history: AdminLoginHistoryEntry[];
  loading: boolean;
  todayLogins: number;
  todayFailed: number;
  hasMore: boolean;
  onLoadMore: () => void;
}

function LoginHistoryTab({ history, loading, hasMore, onLoadMore }: LoginHistoryTabProps) {
  if (loading && history.length === 0) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
      </div>
    );
  }

  if (!loading && history.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <LogIn className="w-10 h-10 text-muted-foreground/40 mb-3" />
        <p className="text-muted-foreground">No login history found</p>
      </div>
    );
  }

  return (
    <div className="bg-[#0D1F3C] rounded-2xl border border-white/[0.06] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-white/[0.03]">
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Admin Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">IP Address</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">User Agent</th>
            </tr>
          </thead>
          <tbody>
            {history.map(entry => (
              <tr
                key={entry.id}
                className={`border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors ${
                  entry.status !== 'success' ? 'bg-red-500/[0.03]' : ''
                }`}
              >
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(entry.createdAt)}</td>
                <td className="px-4 py-3 text-sm text-white">{entry.adminEmail}</td>
                <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{entry.ipAddress ?? '—'}</td>
                <td className="px-4 py-3">
                  {entry.status === 'success' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
                      <CheckCircle2 className="w-3 h-3" /> Success
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20">
                      <XCircle className="w-3 h-3" /> Failed
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">
                  {entry.userAgent ? entry.userAgent.slice(0, 50) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hasMore && (
        <div className="p-4 flex justify-center border-t border-white/[0.06]">
          <button
            onClick={onLoadMore}
            className="px-6 py-2 text-sm font-medium text-muted-foreground hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
          >
            Load More
          </button>
        </div>
      )}
    </div>
  );
}

// ── Active Sessions Tab ────────────────────────────────────────────────────────

interface ActiveSessionsTabProps {
  sessions: AdminSessionRecord[];
  loading: boolean;
  onRefresh: () => void;
  onRevoke: (session: AdminSessionRecord) => void;
}

function ActiveSessionsTab({ sessions, loading, onRefresh, onRevoke }: ActiveSessionsTabProps) {
  return (
    <div>
      <div className="flex justify-end mb-4">
        <button
          onClick={onRefresh}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-muted-foreground hover:text-white bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
        >
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      {loading && sessions.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14" />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Monitor className="w-10 h-10 text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">No active sessions</p>
        </div>
      ) : (
        <div className="bg-[#0D1F3C] rounded-2xl border border-white/[0.06] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-white/[0.03]">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Admin</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">IP Address</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Last Active</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Started</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground border-b border-white/[0.06]">Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(session => (
                  <tr key={session.id} className="border-b border-white/[0.06] hover:bg-white/[0.02] transition-colors">
                    <td className="px-4 py-3 text-sm text-white">{session.adminEmail}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{session.ipAddress ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                        {relativeTime(session.lastActive)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{fmtDate(session.createdAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onRevoke(session)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 rounded-xl transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Revoke
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 2FA Tab ────────────────────────────────────────────────────────────────────

interface TwoFATabProps {
  enabled: boolean;
  setupAt: string | null;
  loading: boolean;
  onRefresh: () => void;
}

function TwoFATab({ enabled, setupAt, loading, onRefresh }: TwoFATabProps) {
  const [setupData, setSetupData] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [token, setToken] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [setting, setSetting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);

  async function handleSetup() {
    setSetting(true);
    try {
      const data = await apiSetup2FA();
      setSetupData(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to setup 2FA');
    } finally {
      setSetting(false);
    }
  }

  async function handleVerify() {
    if (token.trim().length !== 6) { toast.error('Enter a 6-digit token'); return; }
    setVerifying(true);
    try {
      const { ok } = await apiVerify2FA(token.trim());
      if (ok) {
        setVerified(true);
        toast.success('2FA enabled successfully');
        onRefresh();
      } else {
        toast.error('Invalid token. Try again.');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Verification failed');
    } finally {
      setVerifying(false);
    }
  }

  if (loading) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>;
  }

  return (
    <div className="max-w-lg">
      {/* Status Card */}
      <div className={`bg-[#0D1F3C] rounded-2xl border p-6 mb-6 flex items-center gap-4 ${
        enabled ? 'border-green-500/30' : 'border-white/[0.06]'
      }`}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
          enabled ? 'bg-green-500/15' : 'bg-white/5'
        }`}>
          <ShieldCheck className={`w-6 h-6 ${enabled ? 'text-green-400' : 'text-muted-foreground'}`} />
        </div>
        <div>
          <h3 className="text-white font-semibold">Two-Factor Authentication</h3>
          <p className={`text-sm mt-0.5 ${enabled ? 'text-green-400' : 'text-muted-foreground'}`}>
            {enabled ? '2FA is Active' : 'Not configured'}
          </p>
          {enabled && setupAt && (
            <p className="text-xs text-muted-foreground mt-1">Enabled {fmtDate(setupAt)}</p>
          )}
        </div>
        {enabled && (
          <div className="ml-auto">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-green-500/10 text-green-400 border border-green-500/20">
              <CheckCircle2 className="w-3.5 h-3.5" /> Active
            </span>
          </div>
        )}
      </div>

      {/* Setup flow (if not enabled) */}
      {!enabled && !verified && (
        <div className="bg-[#0D1F3C] rounded-2xl border border-white/[0.06] p-6">
          <h4 className="text-white font-medium mb-2">Enable Two-Factor Authentication</h4>
          <p className="text-sm text-muted-foreground mb-5">
            Protect your admin account with an authenticator app (Google Authenticator, Authy, etc.)
          </p>

          {!setupData ? (
            <button
              onClick={handleSetup}
              disabled={setting}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Key className="w-4 h-4" />
              {setting ? 'Generating…' : 'Begin Setup'}
            </button>
          ) : (
            <div className="space-y-4">
              {/* QR placeholder note */}
              <div className="bg-white/5 rounded-xl p-4 flex flex-col items-center gap-2 border border-white/10">
                <div className="w-32 h-32 bg-white/10 rounded-xl flex items-center justify-center">
                  <Monitor className="w-10 h-10 text-muted-foreground/50" />
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Scan this QR code with your authenticator app
                </p>
              </div>

              {/* Secret key */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Or enter this secret manually</label>
                <div className="flex items-center gap-2">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    readOnly
                    value={setupData.secret}
                    className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono w-full focus:outline-none"
                  />
                  <button
                    onClick={() => setShowSecret(v => !v)}
                    className="w-9 h-9 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted-foreground transition-colors flex-shrink-0"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Token input */}
              <div>
                <label className="block text-xs text-muted-foreground mb-1.5">Enter 6-digit code from your app</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={token}
                  onChange={e => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white font-mono w-full focus:outline-none focus:border-primary/50 tracking-widest"
                />
              </div>

              <button
                onClick={handleVerify}
                disabled={verifying || token.length !== 6}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-primary rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
                {verifying ? 'Verifying…' : 'Verify & Enable'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Success state */}
      {verified && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-green-500/10 border border-green-500/30 rounded-2xl p-6 flex items-center gap-4"
        >
          <CheckCircle2 className="w-8 h-8 text-green-400 flex-shrink-0" />
          <div>
            <p className="text-white font-semibold">2FA Enabled Successfully!</p>
            <p className="text-sm text-muted-foreground mt-0.5">
              Your account is now protected with two-factor authentication.
            </p>
          </div>
        </motion.div>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

type Tab = 'history' | 'sessions' | '2fa';

export default function SecurityPage() {
  const [activeTab, setActiveTab] = useState<Tab>('history');

  // Login history
  const [history, setHistory] = useState<AdminLoginHistoryEntry[]>([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Sessions
  const [sessions, setSessions] = useState<AdminSessionRecord[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<AdminSessionRecord | null>(null);

  // 2FA
  const [twoFAEnabled, setTwoFAEnabled] = useState(false);
  const [twoFASetupAt, setTwoFASetupAt] = useState<string | null>(null);
  const [twoFALoading, setTwoFALoading] = useState(false);

  // Derived stats
  const todayStr = new Date().toDateString();
  const todayLogins = history.filter(h => new Date(h.createdAt).toDateString() === todayStr).length;
  const todayFailed = history.filter(h => new Date(h.createdAt).toDateString() === todayStr && h.status !== 'success').length;

  async function loadHistory(page = 1, append = false) {
    setHistoryLoading(true);
    try {
      const { history: data, total } = await apiGetAdminLoginHistory({ page });
      setHistory(prev => append ? [...prev, ...data] : data);
      setHistoryTotal(total);
      setHistoryPage(page);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }

  async function loadSessions() {
    setSessionsLoading(true);
    try {
      const { sessions: data } = await apiGetActiveSessions();
      setSessions(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load sessions');
    } finally {
      setSessionsLoading(false);
    }
  }

  async function load2FA() {
    setTwoFALoading(true);
    try {
      const { enabled, setupAt } = await apiGet2FAStatus();
      setTwoFAEnabled(enabled);
      setTwoFASetupAt(setupAt);
    } catch { /* silent */ }
    finally { setTwoFALoading(false); }
  }

  useEffect(() => {
    void loadHistory();
    void loadSessions();
    void load2FA();
  }, []);

  async function handleRevoke(session: AdminSessionRecord) {
    try {
      await apiRevokeSession(session.id);
      setSessions(prev => prev.filter(s => s.id !== session.id));
      setRevokeTarget(null);
      toast.success('Session revoked');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke session');
      setRevokeTarget(null);
    }
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'history', label: 'Login History', icon: LogIn },
    { key: 'sessions', label: 'Active Sessions', icon: Monitor },
    { key: '2fa', label: 'Two-Factor Auth', icon: Key },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-white font-semibold text-lg">Security</h1>
            <p className="text-muted-foreground text-sm">Monitor access, sessions &amp; authentication</p>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="px-6 py-4 grid grid-cols-3 gap-4 border-b border-white/[0.06]">
        <StatCard
          label="Total Logins Today"
          value={todayLogins}
          icon={Activity}
          color="text-primary"
          iconBg="bg-primary/10"
        />
        <StatCard
          label="Failed Attempts Today"
          value={todayFailed}
          icon={AlertTriangle}
          color="text-red-400"
          iconBg="bg-red-500/10"
        />
        <StatCard
          label="Active Sessions"
          value={sessions.length}
          icon={Monitor}
          color="text-green-400"
          iconBg="bg-green-500/10"
        />
      </div>

      {/* Tabs */}
      <div className="px-6 pt-4 flex items-center gap-1 border-b border-white/[0.06]">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
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

      {/* Tab Content */}
      <div className="flex-1 p-6 overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {activeTab === 'history' && (
              <LoginHistoryTab
                history={history}
                loading={historyLoading}
                todayLogins={todayLogins}
                todayFailed={todayFailed}
                hasMore={history.length < historyTotal}
                onLoadMore={() => void loadHistory(historyPage + 1, true)}
              />
            )}
            {activeTab === 'sessions' && (
              <ActiveSessionsTab
                sessions={sessions}
                loading={sessionsLoading}
                onRefresh={() => void loadSessions()}
                onRevoke={s => setRevokeTarget(s)}
              />
            )}
            {activeTab === '2fa' && (
              <TwoFATab
                enabled={twoFAEnabled}
                setupAt={twoFASetupAt}
                loading={twoFALoading}
                onRefresh={() => void load2FA()}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Revoke Modal */}
      <AnimatePresence>
        {revokeTarget && (
          <RevokeModal
            session={revokeTarget}
            onConfirm={() => handleRevoke(revokeTarget)}
            onClose={() => setRevokeTarget(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
