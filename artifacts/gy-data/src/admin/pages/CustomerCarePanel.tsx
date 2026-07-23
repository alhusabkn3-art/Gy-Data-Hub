/**
 * CustomerCarePanel.tsx
 *
 * Secure Customer Care / Support dashboard.
 *
 * Features:
 *  - Customer search (phone, name, or Customer ID)
 *  - Support ticket creation and management
 *  - Identity verification via OTP (staff enters OTP read back by customer)
 *  - PIN reset approval with one-time reset code display
 *  - Audit trail per ticket
 *  - Full audit log tab (all roles)
 *
 * Security: PINs are never read or displayed. OTPs are hashed server-side
 * and only the plaintext is shown here in dev / relayed by CC staff.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, Plus, ChevronLeft, Ticket, User, Phone, Shield,
  CheckCircle2, XCircle, Clock, Send, KeyRound, RefreshCw,
  AlertTriangle, Info, FileText, Calendar, Eye, Hash,
  ClipboardList, Lock, Headset, ShieldCheck,
} from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

type TicketStatus = 'open' | 'pending_verification' | 'verified' | 'approved' | 'resolved' | 'closed';

interface SafeCustomer {
  id: string; name: string; firstName: string; lastName: string; username: string;
  phone: string; email: string; accountNumber: string;
  kycStatus: string; status: string; createdAt: string;
}

interface TicketSummary {
  id: string; ticket_number: string; customer_id: string;
  customer_phone: string; customer_name: string; reason: string;
  status: TicketStatus; assigned_staff_name: string | null;
  notes: string | null; identity_verified: boolean; pin_reset_approved: boolean;
  otp_attempts: number; otp_send_count: number;
  otp_last_sent_at: string | null; otp_expiry: string | null;
  pin_reset_approved_at: string | null;
  created_at: string; updated_at: string;
}

interface AuditEntry {
  id: string; action: string; performed_by_name: string;
  details: Record<string, unknown>; ip_address: string | null; created_at: string;
}

interface TicketDetailData { ticket: TicketSummary; customer: SafeCustomer | null; auditLogs: AuditEntry[]; }
interface CCStats { total: string; open: string; pending_verification: string; verified: string; approved_today: string; resolved: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
  open:                 { label: 'Open',         dot: 'bg-white/40',      bg: 'bg-white/10',          text: 'text-white/70'   },
  pending_verification: { label: 'Pending OTP',  dot: 'bg-blue-400',      bg: 'bg-blue-500/15',       text: 'text-blue-400'   },
  verified:             { label: 'ID Verified',  dot: 'bg-green-400',     bg: 'bg-green-500/15',      text: 'text-green-400'  },
  approved:             { label: 'Reset Sent',   dot: 'bg-emerald-400',   bg: 'bg-emerald-500/15',    text: 'text-emerald-400'},
  resolved:             { label: 'Resolved',     dot: 'bg-teal-400',      bg: 'bg-teal-500/15',       text: 'text-teal-400'   },
  closed:               { label: 'Closed',       dot: 'bg-red-400/70',    bg: 'bg-red-500/10',        text: 'text-red-400/80' },
};

const ACTION_LABELS: Record<string, { label: string; icon: React.ElementType }> = {
  customer_searched:       { label: 'Customer searched',      icon: Search       },
  ticket_created:          { label: 'Ticket created',         icon: Plus         },
  ticket_viewed:           { label: 'Ticket viewed',          icon: Eye          },
  ticket_updated:          { label: 'Ticket updated',         icon: FileText     },
  otp_sent:                { label: 'Verification OTP sent',  icon: Send         },
  otp_verification_failed: { label: 'OTP verification failed',icon: XCircle      },
  identity_verified:       { label: 'Identity verified',      icon: CheckCircle2 },
  pin_reset_approved:      { label: 'PIN reset approved',     icon: KeyRound     },
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CONFIG[status] ?? { label: status, dot: 'bg-white/40', bg: 'bg-white/10', text: 'text-white/70' };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  );
}

function timeAgo(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`;
  return `${Math.floor(d / 86400000)}d ago`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Customer Profile Card ─────────────────────────────────────────────────────

function CustomerCard({ customer }: { customer: SafeCustomer }) {
  const kycColor = customer.kycStatus === 'verified'   ? 'text-green-400'
                 : customer.kycStatus === 'pending'    ? 'text-amber-400'
                 : 'text-white/50';
  const statusColor = customer.status === 'active' ? 'text-green-400' : 'text-red-400';

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center text-sm font-bold text-primary flex-shrink-0">
          {customer.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-sm truncate">{customer.name}</p>
          <p className="text-xs text-white/50">@{customer.username}</p>
        </div>
        <span className={`text-xs font-semibold capitalize ${statusColor}`}>{customer.status}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-white/5 rounded-xl p-2.5">
          <p className="text-white/40 mb-0.5 font-medium uppercase tracking-wide text-[10px]">Phone</p>
          <p className="font-semibold text-white/90">{customer.phone}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-2.5">
          <p className="text-white/40 mb-0.5 font-medium uppercase tracking-wide text-[10px]">KYC Status</p>
          <p className={`font-semibold capitalize ${kycColor}`}>{customer.kycStatus}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-2.5">
          <p className="text-white/40 mb-0.5 font-medium uppercase tracking-wide text-[10px]">Account No.</p>
          <p className="font-semibold text-white/90 font-mono text-[11px]">{customer.accountNumber}</p>
        </div>
        <div className="bg-white/5 rounded-xl p-2.5">
          <p className="text-white/40 mb-0.5 font-medium uppercase tracking-wide text-[10px]">Registered</p>
          <p className="font-semibold text-white/90">{new Date(customer.createdAt).toLocaleDateString('en-NG')}</p>
        </div>
      </div>
      <div className="bg-white/5 rounded-xl p-2.5">
        <p className="text-white/40 mb-0.5 font-medium uppercase tracking-wide text-[10px]">Customer ID</p>
        <p className="font-mono text-[11px] text-white/70 break-all">{customer.id}</p>
      </div>
    </div>
  );
}

// ── Ticket card (list item) ───────────────────────────────────────────────────

function TicketCard({
  ticket, selected, onClick,
}: { ticket: TicketSummary; selected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3.5 rounded-xl border transition-all ${
        selected
          ? 'border-primary/50 bg-primary/10'
          : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/15'
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <span className="font-mono text-xs text-white/50 font-semibold">{ticket.ticket_number}</span>
        <StatusBadge status={ticket.status} />
      </div>
      <p className="font-semibold text-sm truncate mb-0.5">{ticket.customer_name}</p>
      <p className="text-xs text-white/50 truncate mb-2">{ticket.customer_phone}</p>
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-white/40">{timeAgo(ticket.created_at)}</span>
        {ticket.identity_verified && (
          <span className="text-[11px] text-green-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Verified
          </span>
        )}
      </div>
    </button>
  );
}

// ── Create Ticket Form ────────────────────────────────────────────────────────

function CreateTicketForm({
  api, onCreated, onCancel,
}: { api: (path: string, opts?: RequestInit) => Promise<Response>; onCreated: (id: string) => void; onCancel: () => void }) {
  const [query, setQuery]           = useState('');
  const [results, setResults]       = useState<SafeCustomer[]>([]);
  const [searching, setSearching]   = useState(false);
  const [selected, setSelected]     = useState<SafeCustomer | null>(null);
  const [reason, setReason]         = useState('pin_reset');
  const [notes, setNotes]           = useState('');
  const [creating, setCreating]     = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(async (q: string) => {
    if (q.length < 3) { setResults([]); return; }
    setSearching(true);
    const r = await api(`/api/admin/cc/search?q=${encodeURIComponent(q)}`);
    setSearching(false);
    if (r.ok) {
      const data = await r.json() as { customers: SafeCustomer[] };
      setResults(data.customers);
    }
  }, [api]);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => { void search(query); }, 400);
  }, [query, search]);

  const handleCreate = async () => {
    if (!selected) { toast.error('Select a customer first.'); return; }
    setCreating(true);
    const r = await api('/api/admin/cc/tickets', {
      method: 'POST',
      body: JSON.stringify({ customerId: selected.id, reason, notes }),
    });
    setCreating(false);
    if (r.ok) {
      const data = await r.json() as { ticket: { id: string; ticket_number: string } };
      toast.success(`Ticket ${data.ticket.ticket_number} created`);
      onCreated(data.ticket.id);
    } else {
      const err = await r.json() as { error: string; existingTicketId?: string };
      if (r.status === 409 && err.existingTicketId) {
        toast.error(`${err.error} Opening existing ticket.`);
        onCreated(err.existingTicketId);
      } else {
        toast.error(err.error ?? 'Failed to create ticket.');
      }
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <h3 className="font-bold text-base">New Support Ticket</h3>
      </div>

      {!selected ? (
        <div>
          <label className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 block">Search Customer</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
            <input
              type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Phone number, name, or Customer ID…"
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2.5 text-sm outline-none focus:border-primary/50 transition-colors"
            />
            {searching && <RefreshCw className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 animate-spin" />}
          </div>
          {results.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {results.map(c => (
                <button key={c.id} onClick={() => setSelected(c)}
                  className="w-full text-left flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 border border-white/[0.06] rounded-xl transition-colors">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary flex-shrink-0">
                    {c.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm truncate">{c.name}</p>
                    <p className="text-xs text-white/50">{c.phone}</p>
                  </div>
                  <span className={`text-xs font-semibold capitalize ${c.status === 'active' ? 'text-green-400' : 'text-red-400'}`}>{c.status}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-white/50 uppercase tracking-wider">Selected Customer</label>
              <button onClick={() => setSelected(null)} className="text-xs text-primary hover:text-primary/80 transition-colors">Change</button>
            </div>
            <CustomerCard customer={selected} />
          </div>

          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 block">Reason for Request</label>
            <select
              value={reason} onChange={e => setReason(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50 transition-colors"
            >
              <option value="pin_reset">PIN Reset</option>
              <option value="account_access">Account Access Issue</option>
              <option value="other">Other</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2 block">Notes (optional)</label>
            <textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Add any additional notes about this request…"
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary/50 transition-colors resize-none"
            />
          </div>

          <button
            onClick={handleCreate} disabled={creating}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-50"
          >
            {creating ? 'Creating…' : 'Create Support Ticket'}
          </button>
        </>
      )}
    </div>
  );
}

// ── Ticket Detail View ────────────────────────────────────────────────────────

function TicketDetailView({
  ticketId, onBack, onRefreshList, api,
}: {
  ticketId: string;
  onBack: () => void;
  onRefreshList: () => void;
  api: (path: string, opts?: RequestInit) => Promise<Response>;
}) {
  const [data,         setData]         = useState<TicketDetailData | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [otpInput,     setOtpInput]     = useState('');
  const [devOtp,       setDevOtp]       = useState<string | null>(null);
  const [isSending,    setIsSending]    = useState(false);
  const [isVerifying,  setIsVerifying]  = useState(false);
  const [isApproving,  setIsApproving]  = useState(false);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [approveResult, setApproveResult]  = useState<{ resetOtp: string; customerPhone: string; expiresAt: string; instruction: string } | null>(null);
  const [editNotes,    setEditNotes]    = useState('');
  const [savingNotes,  setSavingNotes]  = useState(false);
  const [otpCooldown,  setOtpCooldown]  = useState(0); // seconds remaining
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api(`/api/admin/cc/tickets/${ticketId}`);
    setLoading(false);
    if (r.ok) {
      const d = await r.json() as TicketDetailData;
      setData(d);
      setEditNotes(d.ticket.notes ?? '');
    } else {
      toast.error('Failed to load ticket.');
    }
  }, [ticketId, api]);

  useEffect(() => { void load(); }, [load]);

  // OTP cooldown timer
  useEffect(() => {
    if (!data?.ticket.otp_last_sent_at) return;
    const elapsed = Date.now() - new Date(data.ticket.otp_last_sent_at).getTime();
    const remaining = Math.ceil((120000 - elapsed) / 1000);
    if (remaining <= 0) return;
    setOtpCooldown(remaining);
    cooldownRef.current = setInterval(() => {
      setOtpCooldown(p => {
        if (p <= 1) { if (cooldownRef.current) clearInterval(cooldownRef.current); return 0; }
        return p - 1;
      });
    }, 1000);
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, [data?.ticket.otp_last_sent_at]);

  const handleSendOTP = async () => {
    setIsSending(true);
    const r = await api(`/api/admin/cc/tickets/${ticketId}/send-otp`, { method: 'POST' });
    setIsSending(false);
    if (r.ok) {
      const d = await r.json() as { phone: string; sendsRemaining: number; devOtp?: string; expiresAt: string };
      toast.success(`OTP sent to ${d.phone}`);
      if (d.devOtp) setDevOtp(d.devOtp);
      setOtpInput('');
      void load();
    } else {
      const err = await r.json() as { error: string; waitSeconds?: number };
      toast.error(err.error);
    }
  };

  const handleVerifyOTP = async () => {
    if (!/^\d{6}$/.test(otpInput)) { toast.error('Enter all 6 digits.'); return; }
    setIsVerifying(true);
    const r = await api(`/api/admin/cc/tickets/${ticketId}/verify-otp`, {
      method: 'POST', body: JSON.stringify({ otp: otpInput }),
    });
    setIsVerifying(false);
    const body = await r.json() as { ok?: boolean; error?: string; attemptsRemaining?: number };
    if (r.ok) {
      toast.success('Identity verified!');
      setDevOtp(null);
      setOtpInput('');
      void load();
      onRefreshList();
    } else {
      toast.error(`${body.error ?? 'Incorrect OTP'}${body.attemptsRemaining !== undefined ? ` (${body.attemptsRemaining} attempts remaining)` : ''}`);
      setOtpInput('');
    }
  };

  const handleApproveReset = async () => {
    if (!confirmApprove) { toast.error('Please confirm by checking the box first.'); return; }
    setIsApproving(true);
    const r = await api(`/api/admin/cc/tickets/${ticketId}/approve-reset`, {
      method: 'POST', body: JSON.stringify({ confirm: true }),
    });
    setIsApproving(false);
    if (r.ok) {
      const d = await r.json() as { resetOtp: string; customerPhone: string; expiresAt: string; instruction: string };
      setApproveResult(d);
      toast.success('PIN reset approved!');
      void load();
      onRefreshList();
    } else {
      const err = await r.json() as { error: string };
      toast.error(err.error ?? 'Approval failed.');
    }
  };

  const handleSaveNotes = async () => {
    setSavingNotes(true);
    const r = await api(`/api/admin/cc/tickets/${ticketId}`, {
      method: 'PATCH', body: JSON.stringify({ notes: editNotes }),
    });
    setSavingNotes(false);
    if (r.ok) toast.success('Notes saved.');
    else toast.error('Failed to save notes.');
  };

  const handleCloseTicket = async () => {
    const r = await api(`/api/admin/cc/tickets/${ticketId}`, {
      method: 'PATCH', body: JSON.stringify({ status: 'resolved' }),
    });
    if (r.ok) {
      toast.success('Ticket marked as resolved.');
      void load();
      onRefreshList();
    } else toast.error('Could not resolve ticket.');
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center p-8">
      <RefreshCw className="w-6 h-6 text-white/30 animate-spin" />
    </div>
  );
  if (!data) return (
    <div className="flex-1 flex items-center justify-center p-8 text-white/40 text-sm">
      Ticket not found.
    </div>
  );

  const { ticket, customer, auditLogs } = data;
  const otpExpired = ticket.otp_expiry ? new Date(ticket.otp_expiry) < new Date() : true;
  const canSendOtp = !ticket.identity_verified
    && ticket.otp_send_count < 3
    && otpCooldown <= 0
    && !['resolved', 'closed', 'approved'].includes(ticket.status);
  const otpLocked = ticket.otp_attempts >= 5;

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-5 space-y-4">
        {/* Header */}
        <div className="flex items-start gap-3">
          <button onClick={onBack} className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors mt-0.5 flex-shrink-0 lg:hidden">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs text-white/50 font-semibold">{ticket.ticket_number}</span>
              <StatusBadge status={ticket.status} />
            </div>
            <p className="font-bold text-base mt-0.5 truncate">{ticket.customer_name}</p>
            <p className="text-xs text-white/50">{ticket.customer_phone} · opened {timeAgo(ticket.created_at)}</p>
          </div>
          {!['resolved', 'closed'].includes(ticket.status) && ticket.pin_reset_approved && (
            <button onClick={handleCloseTicket} className="text-xs text-teal-400 hover:text-teal-300 transition-colors flex-shrink-0 mt-1">
              Mark Resolved
            </button>
          )}
        </div>

        {/* Customer profile */}
        {customer && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-2 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5" /> Customer Profile
            </p>
            <CustomerCard customer={customer} />
          </section>
        )}

        {/* Ticket info / notes */}
        <section className="bg-white/5 border border-white/10 rounded-2xl p-4 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Ticket Info
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-white/40 mb-0.5">Reason</p>
              <p className="font-semibold capitalize">{ticket.reason.replace(/_/g, ' ')}</p>
            </div>
            <div>
              <p className="text-white/40 mb-0.5">Assigned To</p>
              <p className="font-semibold truncate">{ticket.assigned_staff_name ?? '—'}</p>
            </div>
            <div>
              <p className="text-white/40 mb-0.5">Created</p>
              <p className="font-semibold">{fmtDate(ticket.created_at)}</p>
            </div>
            <div>
              <p className="text-white/40 mb-0.5">Last Updated</p>
              <p className="font-semibold">{timeAgo(ticket.updated_at)}</p>
            </div>
          </div>
          <div>
            <p className="text-xs text-white/40 mb-1.5">Notes</p>
            <textarea
              value={editNotes} onChange={e => setEditNotes(e.target.value)}
              placeholder="Add notes…" rows={2}
              disabled={['resolved', 'closed'].includes(ticket.status)}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs outline-none focus:border-primary/40 resize-none disabled:opacity-50 transition-colors"
            />
            {editNotes !== (ticket.notes ?? '') && (
              <button onClick={handleSaveNotes} disabled={savingNotes}
                className="mt-1 text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50">
                {savingNotes ? 'Saving…' : 'Save notes'}
              </button>
            )}
          </div>
        </section>

        {/* Identity verification */}
        {!ticket.identity_verified && (
          <section className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-blue-400/70 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5" /> Identity Verification
            </p>

            {otpLocked ? (
              <div className="flex items-start gap-2 text-xs text-red-400/90">
                <XCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>Maximum failed attempts reached. Send a new OTP to continue.</p>
              </div>
            ) : ticket.otp_send_count > 0 && ticket.otp_expiry && !otpExpired && !otpLocked ? (
              <div className="flex items-start gap-2 text-xs text-blue-400/90">
                <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <p>OTP sent to customer. Expires {new Date(ticket.otp_expiry).toLocaleTimeString()}.</p>
              </div>
            ) : null}

            {/* Dev OTP display */}
            {devOtp && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
                <p className="text-[10px] font-bold text-amber-400/70 uppercase tracking-wider mb-1">⚠ Dev Mode — OTP for testing</p>
                <p className="font-mono text-2xl font-bold tracking-[0.3em] text-amber-400 text-center">{devOtp}</p>
                <p className="text-[10px] text-amber-400/60 text-center mt-1">Enter this below (in production, customer receives it via SMS)</p>
              </div>
            )}

            {/* Send OTP */}
            <button
              onClick={handleSendOTP} disabled={!canSendOtp || isSending}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-blue-400/30 bg-blue-400/10 text-blue-300 text-sm font-semibold hover:bg-blue-400/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            >
              <Send className="w-4 h-4" />
              {isSending ? 'Sending…'
                : otpCooldown > 0 ? `Wait ${otpCooldown}s`
                : ticket.otp_send_count === 0 ? 'Send OTP to Customer'
                : `Resend OTP (${3 - ticket.otp_send_count} left)`}
            </button>

            {/* OTP entry */}
            {ticket.otp_send_count > 0 && !otpLocked && (
              <div className="space-y-2">
                <p className="text-xs text-white/50">Ask the customer to read back the code, then enter it below:</p>
                <div className="flex gap-2">
                  <input
                    type="text" inputMode="numeric" maxLength={6}
                    value={otpInput} onChange={e => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit code"
                    className="flex-1 bg-white/5 border border-white/15 rounded-xl px-3 py-2.5 text-sm font-mono tracking-widest outline-none focus:border-primary/50 transition-colors text-center"
                  />
                  <button
                    onClick={handleVerifyOTP} disabled={isVerifying || otpInput.length !== 6}
                    className="px-4 py-2.5 rounded-xl bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {isVerifying ? '…' : 'Verify'}
                  </button>
                </div>
                {ticket.otp_attempts > 0 && (
                  <p className="text-xs text-amber-400/80">
                    {ticket.otp_attempts} failed attempt{ticket.otp_attempts > 1 ? 's' : ''} · {5 - ticket.otp_attempts} remaining
                  </p>
                )}
              </div>
            )}
          </section>
        )}

        {/* Identity verified badge */}
        {ticket.identity_verified && !ticket.pin_reset_approved && (
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl p-3">
            <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
            <p className="text-sm text-green-400 font-semibold">Identity successfully verified</p>
          </div>
        )}

        {/* Approval section */}
        {ticket.identity_verified && !ticket.pin_reset_approved && !approveResult && (
          <section className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-400/70 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5" /> Approve PIN Reset
            </p>
            <p className="text-xs text-white/60 leading-relaxed">
              This will generate a one-time 6-digit reset code (valid 1 hour) for the customer to set a new PIN via the app's Forgot PIN screen. This action is logged.
            </p>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input type="checkbox" checked={confirmApprove} onChange={e => setConfirmApprove(e.target.checked)}
                className="mt-0.5 accent-emerald-500 w-4 h-4 flex-shrink-0" />
              <span className="text-xs text-white/70">
                I confirm I have verified this customer's identity and authorise a PIN reset for their account.
              </span>
            </label>
            <button
              onClick={handleApproveReset} disabled={isApproving || !confirmApprove}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-[0.98]"
            >
              <KeyRound className="w-4 h-4" />
              {isApproving ? 'Approving…' : 'Approve PIN Reset'}
            </button>
          </section>
        )}

        {/* Reset code display (shown after approval) */}
        {(approveResult ?? (ticket.pin_reset_approved && ticket.pin_reset_approved_at)) && (
          <section className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 space-y-3">
            <p className="text-[11px] font-bold uppercase tracking-widest text-amber-400/70 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5" /> PIN Reset Code
            </p>
            {approveResult ? (
              <>
                <div className="text-center">
                  <p className="text-xs text-white/50 mb-2">Give this code to the customer — show once, then close</p>
                  <div className="bg-black/30 rounded-xl py-4 px-6">
                    <p className="font-mono text-3xl font-bold tracking-[0.4em] text-amber-300">{approveResult.resetOtp}</p>
                  </div>
                  <p className="text-xs text-white/40 mt-2">Expires {new Date(approveResult.expiresAt).toLocaleTimeString()}</p>
                </div>
                <div className="bg-white/5 rounded-xl p-3 text-xs text-white/60 leading-relaxed">
                  <strong className="text-white/80">Instructions for customer:</strong> Open GY DATA app → tap "Forgot PIN" → enter phone number <strong className="text-amber-300">{approveResult.customerPhone}</strong> → enter the code above → create new PIN. <em>Do not tap "Send OTP" again.</em>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-2 text-sm text-amber-400">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <p>PIN reset was approved on {ticket.pin_reset_approved_at ? fmtDate(ticket.pin_reset_approved_at) : '—'}. Reset code was shown to the assigned staff at that time.</p>
              </div>
            )}
          </section>
        )}

        {/* Audit trail */}
        {auditLogs.length > 0 && (
          <section>
            <p className="text-[11px] font-bold uppercase tracking-widest text-white/30 mb-3 flex items-center gap-1.5">
              <ClipboardList className="w-3.5 h-3.5" /> Activity Log
            </p>
            <div className="relative pl-5 space-y-3">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-white/10" />
              {auditLogs.map(log => {
                const cfg = ACTION_LABELS[log.action] ?? { label: log.action, icon: Info };
                const Icon = cfg.icon;
                return (
                  <div key={log.id} className="flex items-start gap-3 relative">
                    <div className="absolute -left-5 w-3.5 h-3.5 rounded-full bg-[#0A1628] border border-white/20 flex items-center justify-center mt-0.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-semibold text-white/80">{cfg.label}</p>
                        <span className="text-[10px] text-white/30">{timeAgo(log.created_at)}</span>
                      </div>
                      <p className="text-[11px] text-white/40 mt-0.5">by {log.performed_by_name}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

// ── Audit Log Tab ─────────────────────────────────────────────────────────────

function AuditLogTab({ api }: { api: (path: string, opts?: RequestInit) => Promise<Response> }) {
  const [logs, setLogs]   = useState<(AuditEntry & { ticket_id: string | null; customer_id: string | null })[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage]   = useState(1);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    const r = await api(`/api/admin/cc/audit-logs?page=${p}`);
    setLoading(false);
    if (r.ok) {
      const d = await r.json() as { logs: typeof logs; total: number };
      setLogs(d.logs);
      setTotal(d.total);
    }
  }, [api]);

  useEffect(() => { void load(page); }, [load, page]);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-sm">Audit Log <span className="text-white/40 font-normal">({total} entries)</span></h3>
        <button onClick={() => void load(page)} className="text-xs text-primary hover:text-primary/80 transition-colors flex items-center gap-1">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 text-white/30 animate-spin" /></div>
      ) : logs.length === 0 ? (
        <p className="text-center text-sm text-white/30 py-8">No audit entries yet.</p>
      ) : (
        <div className="space-y-2">
          {logs.map(log => {
            const cfg = ACTION_LABELS[log.action] ?? { label: log.action, icon: Info };
            const Icon = cfg.icon;
            return (
              <div key={log.id} className="flex items-start gap-3 p-3 bg-white/[0.03] border border-white/[0.06] rounded-xl">
                <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon className="w-3.5 h-3.5 text-white/50" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-xs font-semibold text-white/80">{cfg.label}</p>
                    {log.ticket_id && <span className="text-[10px] text-white/30 font-mono">ticket:{log.ticket_id.slice(0, 8)}</span>}
                  </div>
                  <p className="text-[11px] text-white/40 mt-0.5">
                    {log.performed_by_name} · {fmtDate(log.created_at)}
                    {log.ip_address ? ` · ${log.ip_address}` : ''}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {total > 30 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button onClick={() => setPage(p => p - 1)} disabled={page === 1}
            className="text-xs text-white/50 hover:text-white disabled:opacity-30 transition-colors">← Prev</button>
          <span className="text-xs text-white/40">Page {page} of {Math.ceil(total / 30)}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 30)}
            className="text-xs text-white/50 hover:text-white disabled:opacity-30 transition-colors">Next →</button>
        </div>
      )}
    </div>
  );
}

// ── Main Panel ────────────────────────────────────────────────────────────────

export default function CustomerCarePanel() {
  const { api } = useAdminContext();

  const [activeTab,       setActiveTab]       = useState<'tickets' | 'audit'>('tickets');
  const [view,            setView]            = useState<'list' | 'detail' | 'create'>('list');
  const [selectedId,      setSelectedId]      = useState<string | null>(null);
  const [tickets,         setTickets]         = useState<TicketSummary[]>([]);
  const [total,           setTotal]           = useState(0);
  const [ticketsLoading,  setTicketsLoading]  = useState(true);
  const [statusFilter,    setStatusFilter]    = useState('all');
  const [stats,           setStats]           = useState<CCStats | null>(null);

  const loadTickets = useCallback(async (filter?: string) => {
    setTicketsLoading(true);
    const s = filter ?? statusFilter;
    const r = await api(`/api/admin/cc/tickets?status=${s}`);
    setTicketsLoading(false);
    if (r.ok) {
      const d = await r.json() as { tickets: TicketSummary[]; total: number };
      setTickets(d.tickets);
      setTotal(d.total);
    }
  }, [api, statusFilter]);

  const loadStats = useCallback(async () => {
    const r = await api('/api/admin/cc/stats');
    if (r.ok) setStats(await r.json() as CCStats);
  }, [api]);

  useEffect(() => {
    void loadTickets();
    void loadStats();
  }, [loadTickets, loadStats]);

  const handleFilter = (f: string) => {
    setStatusFilter(f);
    void loadTickets(f);
  };

  const handleSelectTicket = (id: string) => {
    setSelectedId(id);
    setView('detail');
  };

  const handleCreated = (id: string) => {
    void loadTickets();
    void loadStats();
    setSelectedId(id);
    setView('detail');
  };

  const FILTERS = [
    { key: 'all',                 label: 'All',         count: stats?.total },
    { key: 'open',                label: 'Open',        count: stats?.open },
    { key: 'pending_verification',label: 'Pending',     count: stats?.pending_verification },
    { key: 'verified',            label: 'Verified',    count: stats?.verified },
    { key: 'approved',            label: 'Approved',    count: stats?.approved_today },
    { key: 'resolved',            label: 'Resolved',    count: stats?.resolved },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Page Header */}
      <div className="border-b border-white/[0.06] px-4 sm:px-6 py-4 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/15 border border-teal-500/20 flex items-center justify-center flex-shrink-0">
              <Headset className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h2 className="font-bold text-base leading-tight">Customer Care</h2>
              <p className="text-xs text-white/40">Support tickets &amp; PIN reset management</p>
            </div>
          </div>
          {/* Stats chips */}
          {stats && (
            <div className="flex items-center gap-2 flex-wrap">
              <StatChip label="Total" value={stats.total} />
              <StatChip label="Open" value={stats.open} color="text-white/70" />
              <StatChip label="Today's Approvals" value={stats.approved_today} color="text-emerald-400" />
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {(['tickets', 'audit'] as const).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors capitalize ${
                activeTab === t ? 'bg-primary/20 text-primary' : 'text-white/40 hover:text-white/70'
              }`}>
              {t === 'tickets' ? 'Tickets' : 'Audit Log'}
            </button>
          ))}
        </div>
      </div>

      {/* Tickets tab */}
      {activeTab === 'tickets' && (
        <div className="flex-1 flex overflow-hidden">
          {/* Ticket list — always visible on desktop, hidden on mobile when viewing detail */}
          <div className={`flex flex-col border-r border-white/[0.06] flex-shrink-0 overflow-hidden
            ${view === 'list' || view === 'create' ? 'flex-1 lg:w-80 lg:flex-none' : 'hidden lg:flex lg:w-80'}`}>

            {/* List header */}
            <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/[0.06] flex-shrink-0">
              <p className="text-xs font-semibold text-white/50">
                {total} ticket{total !== 1 ? 's' : ''}
              </p>
              <button
                onClick={() => setView('create')}
                className="flex items-center gap-1 text-xs bg-primary/20 text-primary hover:bg-primary/30 px-2.5 py-1.5 rounded-lg font-semibold transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> New
              </button>
            </div>

            {/* Filters */}
            <div className="flex gap-1 px-3 py-2 overflow-x-auto flex-shrink-0 no-scrollbar">
              {FILTERS.map(f => (
                <button key={f.key} onClick={() => handleFilter(f.key)}
                  className={`flex-shrink-0 text-[11px] font-semibold px-2.5 py-1 rounded-lg transition-colors ${
                    statusFilter === f.key
                      ? 'bg-primary/20 text-primary'
                      : 'text-white/40 hover:text-white/70'
                  }`}>
                  {f.label}{f.count ? ` (${f.count})` : ''}
                </button>
              ))}
            </div>

            {/* Ticket cards */}
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1.5">
              {ticketsLoading ? (
                <div className="flex justify-center py-8"><RefreshCw className="w-5 h-5 text-white/30 animate-spin" /></div>
              ) : tickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <Ticket className="w-8 h-8 text-white/20" />
                  <p className="text-sm text-white/30">No tickets yet</p>
                  <button onClick={() => setView('create')}
                    className="text-xs text-primary hover:text-primary/80 transition-colors mt-1">Create first ticket →</button>
                </div>
              ) : (
                tickets.map(t => (
                  <TicketCard
                    key={t.id} ticket={t}
                    selected={selectedId === t.id && view === 'detail'}
                    onClick={() => handleSelectTicket(t.id)}
                  />
                ))
              )}
            </div>
          </div>

          {/* Right panel — detail or create */}
          <div className={`flex-1 overflow-hidden
            ${view !== 'list' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'}`}>

            <AnimatePresence mode="wait">
              {view === 'detail' && selectedId ? (
                <motion.div key={selectedId} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 overflow-hidden">
                  <TicketDetailView
                    ticketId={selectedId}
                    onBack={() => setView('list')}
                    onRefreshList={() => { void loadTickets(); void loadStats(); }}
                    api={api}
                  />
                </motion.div>
              ) : view === 'create' ? (
                <motion.div key="create" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="flex-1 overflow-hidden">
                  <CreateTicketForm
                    api={api}
                    onCreated={handleCreated}
                    onCancel={() => setView('list')}
                  />
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex-1 flex flex-col items-center justify-center gap-3 text-center px-6">
                  <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center">
                    <ShieldCheck className="w-7 h-7 text-white/20" />
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-white/60">Select a ticket to view details</p>
                    <p className="text-xs text-white/30 mt-1">or create a new support ticket</p>
                  </div>
                  <button onClick={() => setView('create')}
                    className="mt-1 flex items-center gap-1.5 text-xs bg-primary/20 text-primary hover:bg-primary/30 px-3 py-2 rounded-lg font-semibold transition-colors">
                    <Plus className="w-3.5 h-3.5" /> New Ticket
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Audit log tab */}
      {activeTab === 'audit' && (
        <div className="flex-1 overflow-y-auto">
          <AuditLogTab api={api} />
        </div>
      )}
    </div>
  );
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function StatChip({ label, value, color = 'text-white/60' }: { label: string; value: string | number | undefined; color?: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1">
      <span className={`text-base font-bold ${color}`}>{value ?? '—'}</span>
      <span className="text-[10px] text-white/30 font-medium">{label}</span>
    </div>
  );
}
