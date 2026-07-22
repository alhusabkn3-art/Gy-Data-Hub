import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Crown, Plus, Pencil, KeyRound, Power, Trash2,
  X, Eye, EyeOff, Check, AlertTriangle, UserCheck, UserX,
  ChevronDown, Lock, RefreshCw,
} from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { AdminRole, ROLE_LABELS, ROLE_COLORS, ROLE_PERMISSIONS } from '../data/adminMockData';
import { toast } from 'sonner';

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

const AVATAR_COLORS: Record<AdminRole, { bg: string; text: string }> = {
  super_admin: { bg: '#7C2D12', text: '#FBBF24' },
  admin:       { bg: '#1E3A5F', text: '#60A5FA' },
};

function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse bg-white/[0.07] rounded-lg ${className ?? ''}`} />;
}

function RoleBadge({ role }: { role: AdminRole }) {
  const c = ROLE_COLORS[role];
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border"
      style={{ background: c.bg, color: c.text, borderColor: c.border }}
    >
      {ROLE_LABELS[role]}
    </span>
  );
}

function StatusDot({ status }: { status: 'active' | 'disabled' }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${
      status === 'active'
        ? 'bg-green-500/10 text-green-400 border-green-500/25'
        : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/25'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${status === 'active' ? 'bg-green-400' : 'bg-zinc-500'}`} />
      {status === 'active' ? 'Active' : 'Disabled'}
    </span>
  );
}

// ── Modal wrapper ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 30, stiffness: 350 }}
        className="relative bg-card border border-border w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h3 className="font-bold text-base">{title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </motion.div>
    </div>
  );
}

// ── Form helpers ──────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text', disabled }: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; disabled?: boolean;
}) {
  return (
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      disabled={disabled}
      className="w-full bg-background border-2 border-border focus:border-primary rounded-xl h-11 px-4 text-sm outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed" />
  );
}

function PinInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? 'text' : 'password'} value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder={placeholder ?? '6-digit PIN'} maxLength={6} inputMode="numeric"
        className="w-full bg-background border-2 border-border focus:border-primary rounded-xl h-11 px-4 pr-12 text-sm outline-none transition-colors tracking-widest font-mono" />
      <button type="button" onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1">
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function RoleSelect({ value, onChange }: { value: AdminRole; onChange: (r: AdminRole) => void }) {
  const [open, setOpen] = useState(false);
  const roles: AdminRole[] = ['admin']; // only admin — super_admin cannot be created via UI
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full bg-background border-2 border-border hover:border-primary rounded-xl h-11 px-4 text-sm outline-none transition-colors flex items-center justify-between">
        <RoleBadge role={value} />
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
            className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden">
            {roles.map(r => (
              <button key={r} type="button" onClick={() => { onChange(r); setOpen(false); }}
                className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/5 transition-colors text-left">
                <RoleBadge role={r} />
                {value === r && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Add Admin Modal ───────────────────────────────────────────────────────────

function AddAdminModal({ onClose }: { onClose: () => void }) {
  const { addAdminAccount, adminAccounts } = useAdminContext();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('admin');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = 'Valid email required';
    if (adminAccounts.some(a => a.email === email.trim().toLowerCase())) e.email = 'Email already in use';
    if (pin.length !== 6) e.pin = 'PIN must be exactly 6 digits';
    if (pin !== confirmPin) e.confirmPin = 'PINs do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    const ok = await addAdminAccount({ name: name.trim(), email: email.trim().toLowerCase(), role, pin });
    setSaving(false);
    if (ok) { toast.success(`Admin account created for ${name.trim()}`); onClose(); }
    else toast.error('Failed to create admin account. Email may already be in use.');
  };

  return (
    <Modal title="Add New Admin" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Full Name">
          <Input value={name} onChange={setName} placeholder="e.g. Amaka Obi" />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
        </Field>
        <Field label="Email Address">
          <Input value={email} onChange={setEmail} placeholder="admin@example.com" type="email" />
          {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
        </Field>
        <Field label="Role">
          <RoleSelect value={role} onChange={setRole} />
          <p className="text-[11px] text-muted-foreground mt-1">Only the Admin role can be assigned. Super Admin is unique and cannot be created via this form.</p>
        </Field>
        <Field label="PIN (6 digits)">
          <PinInput value={pin} onChange={setPin} />
          {errors.pin && <p className="text-xs text-red-400 mt-1">{errors.pin}</p>}
        </Field>
        <Field label="Confirm PIN">
          <PinInput value={confirmPin} onChange={setConfirmPin} placeholder="Repeat PIN" />
          {errors.confirmPin && <p className="text-xs text-red-400 mt-1">{errors.confirmPin}</p>}
        </Field>
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/15 text-xs text-muted-foreground">
          <Shield className="w-3.5 h-3.5 inline-block mr-1 text-primary" />
          PINs are hashed server-side and never stored or displayed in plain text.
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-11 border border-border rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 h-11 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors shadow-[0_4px_16px_rgba(59,130,246,0.3)] flex items-center justify-center gap-2">
            {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating…</> : 'Create Admin'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Edit Admin Modal ──────────────────────────────────────────────────────────

function EditAdminModal({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const { adminAccounts, updateAdminAccount } = useAdminContext();
  const account = adminAccounts.find(a => a.id === accountId)!;
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);
  const [role, setRole] = useState<AdminRole>(account.role);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = 'Valid email required';
    const dup = adminAccounts.find(a => a.email === email.trim().toLowerCase() && a.id !== accountId);
    if (dup) e.email = 'Email already in use';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSaving(true);
    const ok = await updateAdminAccount(accountId, {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: account.isSuperAdmin ? 'super_admin' : role,
    });
    setSaving(false);
    if (ok) { toast.success('Admin details updated'); onClose(); }
    else toast.error('Failed to update admin details.');
  };

  return (
    <Modal title="Edit Admin" onClose={onClose}>
      <div className="space-y-4">
        {account.isSuperAdmin && (
          <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs text-amber-400 flex items-center gap-2">
            <Crown className="w-3.5 h-3.5 flex-shrink-0" /> Super Admin role cannot be changed.
          </div>
        )}
        <Field label="Full Name">
          <Input value={name} onChange={setName} />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
        </Field>
        <Field label="Email Address">
          <Input value={email} onChange={setEmail} type="email" />
          {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
        </Field>
        {!account.isSuperAdmin && (
          <Field label="Role"><RoleSelect value={role} onChange={setRole} /></Field>
        )}
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-11 border border-border rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 h-11 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors shadow-[0_4px_16px_rgba(59,130,246,0.3)] flex items-center justify-center gap-2">
            {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</> : 'Save Changes'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Reset PIN Modal ───────────────────────────────────────────────────────────

function ResetPinModal({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const { adminAccounts, changeAdminPin } = useAdminContext();
  const account = adminAccounts.find(a => a.id === accountId)!;
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (newPin.length !== 6) e.newPin = 'PIN must be exactly 6 digits';
    if (newPin !== confirmPin) e.confirmPin = 'PINs do not match';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    setSaving(true);
    const ok = await changeAdminPin(accountId, newPin);
    setSaving(false);
    if (ok) { toast.success(`PIN reset for ${account.name}`); onClose(); }
    else toast.error('Failed to reset PIN.');
  };

  return (
    <Modal title={`Reset PIN — ${account.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs text-amber-400 flex items-start gap-2">
          <KeyRound className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>Set a new 6-digit PIN. The current PIN will be immediately replaced. This action is logged.</span>
        </div>
        <Field label="New PIN">
          <PinInput value={newPin} onChange={setNewPin} />
          {errors.newPin && <p className="text-xs text-red-400 mt-1">{errors.newPin}</p>}
        </Field>
        <Field label="Confirm New PIN">
          <PinInput value={confirmPin} onChange={setConfirmPin} placeholder="Repeat new PIN" />
          {errors.confirmPin && <p className="text-xs text-red-400 mt-1">{errors.confirmPin}</p>}
        </Field>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-11 border border-border rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 h-11 bg-amber-500 hover:bg-amber-500/90 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2">
            {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Resetting…</> : 'Reset PIN'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Confirm Action Modal ──────────────────────────────────────────────────────

function ConfirmModal({ title, message, confirmLabel, danger, onConfirm, onClose }: {
  title: string; message: string; confirmLabel: string; danger?: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    setLoading(true);
    await onConfirm();
    setLoading(false);
  };
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-5">
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${danger ? 'bg-red-500/5 border-red-500/20' : 'bg-amber-500/5 border-amber-500/20'}`}>
          <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${danger ? 'text-red-400' : 'text-amber-400'}`} />
          <p className={`text-sm ${danger ? 'text-red-300' : 'text-amber-300'}`}>{message}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 h-11 border border-border rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={handle} disabled={loading}
            className={`flex-1 h-11 rounded-xl text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2 ${danger ? 'bg-red-500 hover:bg-red-500/90 text-white' : 'bg-amber-500 hover:bg-amber-500/90 text-white'}`}>
            {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Working…</> : confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Permissions Panel ─────────────────────────────────────────────────────────

function PermissionsPanel({ role }: { role: AdminRole }) {
  const perms = ROLE_PERMISSIONS[role] ?? [];
  return (
    <div className="p-3 rounded-xl bg-background border border-border">
      <p className="text-xs font-semibold text-muted-foreground mb-2 uppercase tracking-wider">Permissions</p>
      <div className="flex flex-wrap gap-1.5">
        {perms.map(p => (
          <span key={p} className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 bg-primary/8 text-primary border border-primary/15 rounded-full">
            <Check className="w-2.5 h-2.5" /> {p}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type ModalState =
  | { type: 'add' }
  | { type: 'edit'; id: string }
  | { type: 'resetPin'; id: string }
  | { type: 'toggleStatus'; id: string; newStatus: 'active' | 'disabled' }
  | { type: 'delete'; id: string };

export default function AdminManagement() {
  const {
    isSuperAdmin, adminAccounts, adminAccountsLoading,
    fetchAdminAccounts, toggleAdminStatus, removeAdminAccount, currentAdminId,
  } = useAdminContext();
  const [modal, setModal] = useState<ModalState | null>(null);
  const closeModal = () => setModal(null);

  useEffect(() => {
    if (isSuperAdmin && adminAccounts.length === 0) {
      void fetchAdminAccounts();
    }
  }, [isSuperAdmin]);

  // ── Access denied for non-super-admin ──────────────────────────────────────

  if (!isSuperAdmin) {
    return (
      <div className="p-4 lg:p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4">
          <Lock className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-xl font-bold mb-2">Super Admin Access Required</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          Admin account management is restricted to the Super Admin role. Contact your Super Admin for access.
        </p>
      </div>
    );
  }

  const accounts = adminAccounts;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Admin Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {accounts.length} admin account{accounts.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void fetchAdminAccounts()}
            disabled={adminAccountsLoading}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-card border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${adminAccountsLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setModal({ type: 'add' })}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold transition-colors shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
          >
            <Plus className="w-4 h-4" /> Add Admin
          </button>
        </div>
      </div>

      {/* Admin accounts list */}
      {adminAccountsLoading && accounts.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center gap-3 mb-4">
                <Skeleton className="w-12 h-12 rounded-full flex-shrink-0" />
                <div className="flex-1"><Skeleton className="h-4 w-32 mb-2" /><Skeleton className="h-3 w-48" /></div>
              </div>
              <Skeleton className="h-20 w-full rounded-xl" />
            </div>
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center text-muted-foreground">
          <Shield className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="font-semibold">No admin accounts</p>
          <p className="text-xs mt-1">Add your first admin account above.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map(account => {
            const colors = AVATAR_COLORS[account.role] ?? AVATAR_COLORS.admin;
            const isSelf = account.id === currentAdminId;
            return (
              <motion.div
                key={account.id}
                layout
                className="bg-card border border-border rounded-2xl p-5 hover:border-white/20 transition-colors"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 border"
                      style={{ backgroundColor: colors.bg, color: colors.text, borderColor: `${colors.text}30` }}
                    >
                      {initials(account.name)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-bold">{account.name}</p>
                        {account.isSuperAdmin && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                        {isSelf && <span className="text-[10px] text-primary border border-primary/25 bg-primary/10 rounded-full px-1.5 py-0.5 font-semibold">You</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{account.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                    <RoleBadge role={account.role} />
                    <StatusDot status={account.status} />
                  </div>
                </div>

                {/* Metadata */}
                <div className="grid grid-cols-2 gap-2 mb-4">
                  <div className="bg-background rounded-xl p-3 border border-border/60">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Joined</p>
                    <p className="text-xs font-semibold mt-0.5">{account.createdAt}</p>
                  </div>
                  <div className="bg-background rounded-xl p-3 border border-border/60">
                    <p className="text-[10px] text-muted-foreground uppercase font-semibold tracking-wider">Last Login</p>
                    <p className="text-xs font-semibold mt-0.5">{account.lastLogin}</p>
                  </div>
                </div>

                <PermissionsPanel role={account.role} />

                {/* Actions */}
                {!account.isSuperAdmin && (
                  <div className="flex flex-wrap gap-2 mt-4">
                    <button
                      onClick={() => setModal({ type: 'edit', id: account.id })}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-primary/8 text-primary border border-primary/20 rounded-xl hover:bg-primary/15 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      onClick={() => setModal({ type: 'resetPin', id: account.id })}
                      className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-amber-500/8 text-amber-400 border border-amber-500/20 rounded-xl hover:bg-amber-500/15 transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5" /> Reset PIN
                    </button>
                    <button
                      onClick={() => setModal({
                        type: 'toggleStatus', id: account.id,
                        newStatus: account.status === 'active' ? 'disabled' : 'active',
                      })}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-colors ${
                        account.status === 'active'
                          ? 'bg-zinc-500/8 text-zinc-400 border-zinc-500/20 hover:bg-zinc-500/15'
                          : 'bg-green-500/8 text-green-400 border-green-500/20 hover:bg-green-500/15'
                      }`}
                    >
                      {account.status === 'active' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                      {account.status === 'active' ? 'Disable' : 'Enable'}
                    </button>
                    {!isSelf && (
                      <button
                        onClick={() => setModal({ type: 'delete', id: account.id })}
                        className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-red-500/8 text-red-400 border border-red-500/20 rounded-xl hover:bg-red-500/15 transition-colors ml-auto"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Remove
                      </button>
                    )}
                  </div>
                )}

                {account.isSuperAdmin && (
                  <div className="mt-4 p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-xs text-amber-400/80 flex items-center gap-2">
                    <Crown className="w-3 h-3 flex-shrink-0" />
                    This account is protected and cannot be modified or deleted.
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modals */}
      <AnimatePresence>
        {modal?.type === 'add' && <AddAdminModal onClose={closeModal} />}
        {modal?.type === 'edit' && <EditAdminModal accountId={modal.id} onClose={closeModal} />}
        {modal?.type === 'resetPin' && <ResetPinModal accountId={modal.id} onClose={closeModal} />}
        {modal?.type === 'toggleStatus' && (
          <ConfirmModal
            title={modal.newStatus === 'disabled' ? 'Disable Admin' : 'Enable Admin'}
            message={modal.newStatus === 'disabled'
              ? 'This admin will be unable to log in. You can re-enable them at any time.'
              : 'This admin will be able to log in again.'}
            confirmLabel={modal.newStatus === 'disabled' ? 'Disable' : 'Enable'}
            danger={modal.newStatus === 'disabled'}
            onConfirm={async () => {
              const ok = await toggleAdminStatus(modal.id, modal.newStatus);
              if (ok) toast.success(modal.newStatus === 'disabled' ? 'Admin disabled' : 'Admin enabled');
              else toast.error('Failed to update status.');
              closeModal();
            }}
            onClose={closeModal}
          />
        )}
        {modal?.type === 'delete' && (
          <ConfirmModal
            title="Remove Admin"
            message="This admin account will be permanently deleted. This action cannot be undone."
            confirmLabel="Delete Account"
            danger
            onConfirm={async () => {
              const ok = await removeAdminAccount(modal.id);
              if (ok) toast.success('Admin account removed');
              else toast.error('Failed to remove account.');
              closeModal();
            }}
            onClose={closeModal}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
