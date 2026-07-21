import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield, Crown, Plus, Pencil, KeyRound, Power, Trash2,
  X, Eye, EyeOff, Check, AlertTriangle, UserCheck, UserX,
  ChevronDown,
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
  support:     { bg: '#064E3B', text: '#34D399' },
};

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

function StatusBadge({ status }: { status: 'active' | 'disabled' }) {
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

// ── Overlay / Modal wrapper ───────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ type: 'spring', damping: 30, stiffness: 350 }}
        className="relative bg-card border border-border w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card z-10">
          <h3 className="font-bold text-base">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </motion.div>
    </div>
  );
}

// ── Field components ──────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
        {label}
      </label>
      {children}
    </div>
  );
}

function Input({
  value, onChange, placeholder, type = 'text', disabled,
}: {
  value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full bg-background border-2 border-border focus:border-primary rounded-xl h-11 px-4 text-sm outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    />
  );
}

function PinInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder={placeholder ?? '6-digit PIN'}
        maxLength={6}
        inputMode="numeric"
        className="w-full bg-background border-2 border-border focus:border-primary rounded-xl h-11 px-4 pr-12 text-sm outline-none transition-colors tracking-widest font-mono"
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
      >
        {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>
    </div>
  );
}

function RoleSelect({ value, onChange, disabledRoles }: {
  value: AdminRole;
  onChange: (r: AdminRole) => void;
  disabledRoles?: AdminRole[];
}) {
  const [open, setOpen] = useState(false);
  const roles: AdminRole[] = ['super_admin', 'admin', 'support'];
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full bg-background border-2 border-border hover:border-primary rounded-xl h-11 px-4 text-sm outline-none transition-colors flex items-center justify-between"
      >
        <RoleBadge role={value} />
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl z-20 overflow-hidden"
          >
            {roles.map(r => {
              const disabled = disabledRoles?.includes(r);
              return (
                <button
                  key={r}
                  type="button"
                  disabled={disabled}
                  onClick={() => { if (!disabled) { onChange(r); setOpen(false); } }}
                  className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-white/5 transition-colors text-left ${
                    disabled ? 'opacity-40 cursor-not-allowed' : ''
                  }`}
                >
                  <RoleBadge role={r} />
                  {value === r && <Check className="w-3.5 h-3.5 text-primary ml-auto" />}
                </button>
              );
            })}
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

  const submit = () => {
    if (!validate()) return;
    addAdminAccount({ name: name.trim(), email, role, pin });
    toast.success(`Admin account created for ${name.trim()}`);
    onClose();
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
          <RoleSelect value={role} onChange={setRole} disabledRoles={['super_admin']} />
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
          The PIN is stored securely and will never be displayed in plain text.
        </div>
        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 h-11 border border-border rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            className="flex-1 h-11 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold transition-colors shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
          >
            Create Admin
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

  const validate = () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = 'Valid email required';
    const duplicate = adminAccounts.find(
      a => a.email === email.trim().toLowerCase() && a.id !== accountId
    );
    if (duplicate) e.email = 'Email already in use';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = () => {
    if (!validate()) return;
    updateAdminAccount(accountId, {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: account.isSuperAdmin ? 'super_admin' : role,
    });
    toast.success('Admin details updated');
    onClose();
  };

  return (
    <Modal title="Edit Admin" onClose={onClose}>
      <div className="space-y-4">
        {account.isSuperAdmin && (
          <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs text-amber-400 flex items-center gap-2">
            <Crown className="w-3.5 h-3.5 flex-shrink-0" />
            Super Admin role cannot be changed.
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
        <Field label="Role">
          <RoleSelect
            value={role}
            onChange={setRole}
            disabledRoles={account.isSuperAdmin ? ['admin', 'support', 'super_admin'] : ['super_admin']}
          />
        </Field>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-11 border border-border rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            className="flex-1 h-11 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold transition-colors shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
          >
            Save Changes
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Change PIN Modal ──────────────────────────────────────────────────────────

function ChangePinModal({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const { adminAccounts, changeAdminPin } = useAdminContext();
  const account = adminAccounts.find(a => a.id === accountId)!;
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const submit = () => {
    const e: Record<string, string> = {};
    if (newPin.length !== 6) e.newPin = 'PIN must be exactly 6 digits';
    if (newPin !== confirmPin) e.confirmPin = 'PINs do not match';
    setErrors(e);
    if (Object.keys(e).length > 0) return;
    changeAdminPin(accountId, newPin);
    toast.success(`PIN updated for ${account.name}`);
    onClose();
  };

  return (
    <Modal title={`Change PIN — ${account.name}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs text-amber-400 flex items-start gap-2">
          <KeyRound className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>Set a new 6-digit PIN for this admin account. The current PIN will be immediately replaced.</span>
        </div>
        <Field label="New PIN">
          <PinInput value={newPin} onChange={setNewPin} />
          {errors.newPin && <p className="text-xs text-red-400 mt-1">{errors.newPin}</p>}
        </Field>
        <Field label="Confirm New PIN">
          <PinInput value={confirmPin} onChange={setConfirmPin} placeholder="Repeat new PIN" />
          {errors.confirmPin && <p className="text-xs text-red-400 mt-1">{errors.confirmPin}</p>}
        </Field>
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/15 text-xs text-muted-foreground">
          <Shield className="w-3.5 h-3.5 inline-block mr-1 text-primary" />
          PINs are never stored or displayed in plain text.
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-11 border border-border rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button
            onClick={submit}
            className="flex-1 h-11 bg-amber-500 hover:bg-amber-500/90 text-white rounded-xl text-sm font-bold transition-colors"
          >
            Change PIN
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Confirm Action Modal ──────────────────────────────────────────────────────

function ConfirmModal({
  title, message, confirmLabel, danger, onConfirm, onClose,
}: {
  title: string; message: string; confirmLabel: string; danger?: boolean;
  onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-5">
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${
          danger
            ? 'bg-red-500/8 border-red-500/20'
            : 'bg-amber-500/8 border-amber-500/20'
        }`}>
          <AlertTriangle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${danger ? 'text-red-400' : 'text-amber-400'}`} />
          <p className={`text-sm ${danger ? 'text-red-300' : 'text-amber-300'}`}>{message}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 h-11 border border-border rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => { onConfirm(); onClose(); }}
            className={`flex-1 h-11 text-white rounded-xl text-sm font-bold transition-colors ${
              danger
                ? 'bg-red-500 hover:bg-red-500/90'
                : 'bg-amber-500 hover:bg-amber-500/90'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Admin Card ────────────────────────────────────────────────────────────────

type ModalState =
  | { kind: 'add' }
  | { kind: 'edit'; id: string }
  | { kind: 'pin'; id: string }
  | { kind: 'disable'; id: string }
  | { kind: 'enable'; id: string }
  | { kind: 'remove'; id: string }
  | null;

function AdminCard({
  account,
  onAction,
}: {
  account: ReturnType<typeof useAdminContext>['adminAccounts'][number];
  onAction: (m: ModalState) => void;
}) {
  const av = AVATAR_COLORS[account.role];

  return (
    <div className={`bg-card border rounded-2xl p-4 sm:p-5 transition-all ${
      account.isSuperAdmin
        ? 'border-amber-500/30 shadow-[0_0_0_1px_rgba(234,179,8,0.08),0_8px_24px_rgba(0,0,0,0.3)]'
        : 'border-border hover:border-white/15'
    }`}>
      <div className="flex items-start gap-3 sm:gap-4">
        {/* Avatar */}
        <div
          className="w-11 h-11 rounded-xl flex-shrink-0 flex items-center justify-center text-sm font-bold relative"
          style={{ background: av.bg, color: av.text }}
        >
          {initials(account.name)}
          {account.isSuperAdmin && (
            <Crown
              className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5"
              style={{ color: '#FBBF24' }}
            />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
            <p className="font-semibold text-sm truncate">{account.name}</p>
            {account.isSuperAdmin && (
              <span className="text-[10px] font-bold text-amber-400 bg-amber-400/10 border border-amber-400/20 px-1.5 py-0.5 rounded-full">
                PROTECTED
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate mb-2">{account.email}</p>
          <div className="flex items-center flex-wrap gap-1.5">
            <RoleBadge role={account.role} />
            <StatusBadge status={account.status} />
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Last login: {account.lastLogin} · Added {account.createdAt}
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1.5 mt-4 flex-wrap">
        <ActionButton
          icon={<Pencil className="w-3.5 h-3.5" />}
          label="Edit"
          onClick={() => onAction({ kind: 'edit', id: account.id })}
        />
        <ActionButton
          icon={<KeyRound className="w-3.5 h-3.5" />}
          label="Change PIN"
          onClick={() => onAction({ kind: 'pin', id: account.id })}
        />
        {!account.isSuperAdmin && (
          <>
            {account.status === 'active' ? (
              <ActionButton
                icon={<UserX className="w-3.5 h-3.5" />}
                label="Disable"
                variant="warning"
                onClick={() => onAction({ kind: 'disable', id: account.id })}
              />
            ) : (
              <ActionButton
                icon={<UserCheck className="w-3.5 h-3.5" />}
                label="Enable"
                variant="success"
                onClick={() => onAction({ kind: 'enable', id: account.id })}
              />
            )}
            <ActionButton
              icon={<Trash2 className="w-3.5 h-3.5" />}
              label="Remove"
              variant="danger"
              onClick={() => onAction({ kind: 'remove', id: account.id })}
            />
          </>
        )}
      </div>
    </div>
  );
}

function ActionButton({
  icon, label, onClick, variant = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'warning' | 'success' | 'danger';
}) {
  const styles = {
    default: 'border-border text-muted-foreground hover:text-white hover:border-white/20 hover:bg-white/5',
    warning: 'border-amber-500/25 text-amber-400 hover:bg-amber-500/10',
    success: 'border-green-500/25 text-green-400 hover:bg-green-500/10',
    danger: 'border-red-500/25 text-red-400 hover:bg-red-500/10',
  };
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${styles[variant]}`}
    >
      {icon}{label}
    </button>
  );
}

// ── Permission matrix ─────────────────────────────────────────────────────────

function PermissionMatrix() {
  const roles: AdminRole[] = ['super_admin', 'admin', 'support'];
  const allFeatures = [
    'Dashboard', 'Users', 'Transactions', 'Wallet', 'Services',
    'Announcements', 'Settings', 'Admin Management',
  ];

  const has = (role: AdminRole, feature: string) =>
    ROLE_PERMISSIONS[role].some(p => p === feature || p.startsWith(feature));

  return (
    <div className="bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <p className="font-bold text-sm">Role Permission Matrix</p>
        <p className="text-xs text-muted-foreground mt-0.5">Access levels across admin roles</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-5 py-3 font-semibold text-muted-foreground w-40">Feature</th>
              {roles.map(r => (
                <th key={r} className="px-4 py-3 text-center">
                  <RoleBadge role={r} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allFeatures.map((feature, i) => (
              <tr key={feature} className={`border-b border-border/40 last:border-0 ${i % 2 === 0 ? '' : 'bg-white/[0.015]'}`}>
                <td className="px-5 py-3 text-muted-foreground font-medium">{feature}</td>
                {roles.map(r => (
                  <td key={r} className="px-4 py-3 text-center">
                    {has(r, feature) ? (
                      <Check className="w-3.5 h-3.5 text-green-400 mx-auto" />
                    ) : (
                      <X className="w-3.5 h-3.5 text-zinc-600 mx-auto" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AdminManagement() {
  const { adminAccounts, toggleAdminStatus, removeAdminAccount } = useAdminContext();
  const [modal, setModal] = useState<ModalState>(null);

  const totalActive   = adminAccounts.filter(a => a.status === 'active').length;
  const totalDisabled = adminAccounts.filter(a => a.status === 'disabled').length;
  const roleCount     = (r: AdminRole) => adminAccounts.filter(a => a.role === r).length;

  const getAccount = (id: string) => adminAccounts.find(a => a.id === id)!;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold">Admin Management</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manage admin accounts, roles, and access permissions
          </p>
        </div>
        <button
          onClick={() => setModal({ kind: 'add' })}
          className="flex items-center gap-2 h-10 px-4 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-bold transition-colors shadow-[0_4px_16px_rgba(59,130,246,0.3)] flex-shrink-0"
        >
          <Plus className="w-4 h-4" /> Add Admin
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Admins', value: adminAccounts.length, color: 'text-foreground' },
          { label: 'Active', value: totalActive, color: 'text-green-400' },
          { label: 'Disabled', value: totalDisabled, color: 'text-zinc-400' },
          { label: 'Super Admins', value: roleCount('super_admin'), color: 'text-amber-400' },
        ].map(s => (
          <div key={s.label} className="bg-card border border-border rounded-xl px-4 py-3 text-center">
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Admin list */}
      <div className="space-y-3">
        {adminAccounts.map(account => (
          <motion.div
            key={account.id}
            layout
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <AdminCard account={account} onAction={setModal} />
          </motion.div>
        ))}
      </div>

      {/* Permission matrix */}
      <PermissionMatrix />

      {/* Modals */}
      <AnimatePresence>
        {modal?.kind === 'add' && (
          <AddAdminModal onClose={() => setModal(null)} />
        )}
        {modal?.kind === 'edit' && (
          <EditAdminModal accountId={modal.id} onClose={() => setModal(null)} />
        )}
        {modal?.kind === 'pin' && (
          <ChangePinModal accountId={modal.id} onClose={() => setModal(null)} />
        )}
        {modal?.kind === 'disable' && (
          <ConfirmModal
            title="Disable Admin"
            message={`This will prevent ${getAccount(modal.id).name} from logging into the admin portal. You can re-enable the account at any time.`}
            confirmLabel="Disable Account"
            onConfirm={() => {
              toggleAdminStatus(modal.id);
              toast.success(`${getAccount(modal.id).name} has been disabled`);
            }}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.kind === 'enable' && (
          <ConfirmModal
            title="Enable Admin"
            message={`This will restore ${getAccount(modal.id).name}'s access to the admin portal.`}
            confirmLabel="Enable Account"
            onConfirm={() => {
              toggleAdminStatus(modal.id);
              toast.success(`${getAccount(modal.id).name} has been enabled`);
            }}
            onClose={() => setModal(null)}
          />
        )}
        {modal?.kind === 'remove' && (
          <ConfirmModal
            title="Remove Admin"
            message={`This will permanently delete ${getAccount(modal.id).name}'s admin account. This action cannot be undone.`}
            confirmLabel="Remove Admin"
            danger
            onConfirm={() => {
              const name = getAccount(modal.id).name;
              removeAdminAccount(modal.id);
              toast.success(`${name}'s admin account has been removed`);
            }}
            onClose={() => setModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
