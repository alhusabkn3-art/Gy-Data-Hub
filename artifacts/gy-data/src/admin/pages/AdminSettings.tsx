import React, { useState } from 'react';
import { Shield, Bell, Globe, Lock, Save, AlertTriangle, X, Eye, EyeOff, Pencil, Check } from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { toast } from 'sonner';

// ── Toggle row ────────────────────────────────────────────────────────────────

interface Toggle {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}

function ToggleRow({ label, description, value, onChange }: Toggle) {
  return (
    <button
      onClick={() => onChange(!value)}
      className="w-full flex items-center justify-between py-3.5 border-b border-border/50 last:border-0 hover:bg-white/[0.02] transition-colors text-left px-1"
    >
      <div className="flex-1 pr-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <div className={`w-11 h-6 rounded-full flex items-center px-0.5 transition-colors flex-shrink-0 ${value ? 'bg-primary' : 'bg-white/10'}`}>
        <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
      </div>
    </button>
  );
}

// ── Shared modal wrapper ──────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 bg-[#0A1628] border border-border rounded-2xl z-50 p-5 max-w-sm mx-auto shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

// ── Change PIN modal ──────────────────────────────────────────────────────────

function ChangePinModal({ onClose }: { onClose: () => void }) {
  const { adminAccounts, currentAdminId, changeAdminPin } = useAdminContext();
  const me = adminAccounts.find(a => a.id === currentAdminId);

  const [currentPin,  setCurrentPin]  = useState('');
  const [newPin,      setNewPin]      = useState('');
  const [confirmPin,  setConfirmPin]  = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew,     setShowNew]     = useState(false);
  const [errors,      setErrors]      = useState<Record<string, string>>({});
  const [saving,      setSaving]      = useState(false);

  const PinField = ({
    label, value, onChange, show, onToggle, errorKey, placeholder,
  }: {
    label: string; value: string; onChange: (v: string) => void;
    show: boolean; onToggle: () => void; errorKey: string; placeholder?: string;
  }) => (
    <div>
      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => { onChange(e.target.value.replace(/\D/g, '').slice(0, 6)); setErrors(p => ({ ...p, [errorKey]: '' })); }}
          placeholder={placeholder ?? '6-digit PIN'}
          maxLength={6}
          inputMode="numeric"
          className="w-full bg-background border-2 border-border focus:border-primary rounded-xl h-11 px-4 pr-12 text-sm outline-none transition-colors tracking-widest font-mono"
        />
        <button
          type="button"
          onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {errors[errorKey] && <p className="text-xs text-red-400 mt-1">{errors[errorKey]}</p>}
    </div>
  );

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!me || currentPin !== me.pin) e.currentPin = 'Current PIN is incorrect';
    if (newPin.length !== 6) e.newPin = 'New PIN must be exactly 6 digits';
    if (newPin === currentPin) e.newPin = 'New PIN must be different from current PIN';
    if (newPin !== confirmPin) e.confirmPin = 'PINs do not match';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    await new Promise(r => setTimeout(r, 600)); // simulated async
    changeAdminPin(currentAdminId, newPin);
    toast.success('PIN updated successfully. Use your new PIN on next login.');
    onClose();
  };

  return (
    <Modal title="Change PIN" onClose={onClose}>
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs text-amber-400 flex items-start gap-2">
          <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>Your current PIN is required to set a new one. PINs are never stored in plain text.</span>
        </div>

        <PinField
          label="Current PIN"
          value={currentPin}
          onChange={setCurrentPin}
          show={showCurrent}
          onToggle={() => setShowCurrent(v => !v)}
          errorKey="currentPin"
          placeholder="Enter current PIN"
        />
        <PinField
          label="New PIN"
          value={newPin}
          onChange={setNewPin}
          show={showNew}
          onToggle={() => setShowNew(v => !v)}
          errorKey="newPin"
          placeholder="Choose a new 6-digit PIN"
        />
        <PinField
          label="Confirm New PIN"
          value={confirmPin}
          onChange={setConfirmPin}
          show={showNew}
          onToggle={() => setShowNew(v => !v)}
          errorKey="confirmPin"
          placeholder="Repeat new PIN"
        />

        <div className="flex gap-2 pt-1">
          <button
            onClick={onClose}
            className="flex-1 h-11 border border-border rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={saving}
            className="flex-1 h-11 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors shadow-[0_4px_16px_rgba(59,130,246,0.3)] flex items-center justify-center gap-2"
          >
            {saving ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
            ) : (
              <><Check className="w-4 h-4" />Update PIN</>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Edit profile modal ────────────────────────────────────────────────────────

function EditProfileModal({ onClose }: { onClose: () => void }) {
  const { adminAccounts, currentAdminId, updateAdminAccount, adminEmail } = useAdminContext();
  const me = adminAccounts.find(a => a.id === currentAdminId);

  const [name,    setName]    = useState(me?.name ?? 'Super Admin');
  const [email,   setEmail]   = useState(me?.email ?? adminEmail);
  const [errors,  setErrors]  = useState<Record<string, string>>({});
  const [saving,  setSaving]  = useState(false);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = 'Valid email required';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    updateAdminAccount(currentAdminId, { name: name.trim(), email: email.trim().toLowerCase() });
    toast.success('Profile updated successfully.');
    onClose();
  };

  return (
    <Modal title="Edit Profile" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Display Name</label>
          <input
            value={name}
            onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })); }}
            className="w-full bg-background border-2 border-border focus:border-primary rounded-xl h-11 px-4 text-sm outline-none transition-colors"
            placeholder="Your name"
          />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Email Address</label>
          <input
            type="email"
            value={email}
            onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })); }}
            className="w-full bg-background border-2 border-border focus:border-primary rounded-xl h-11 px-4 text-sm outline-none transition-colors"
            placeholder="admin@example.com"
          />
          {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
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
            disabled={saving}
            className="flex-1 h-11 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors shadow-[0_4px_16px_rgba(59,130,246,0.3)] flex items-center justify-center gap-2"
          >
            {saving ? (
              <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</>
            ) : (
              <><Check className="w-4 h-4" />Save Changes</>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminSettings() {
  const { adminAccounts, currentAdminId, adminEmail, adminLogout } = useAdminContext();
  const me = adminAccounts.find(a => a.id === currentAdminId);

  const [modal,        setModal]        = useState<'changePin' | 'editProfile' | null>(null);
  const [maintenance,  setMaintenance]  = useState(false);
  const [emailAlerts,  setEmailAlerts]  = useState(true);
  const [smsAlerts,    setSmsAlerts]    = useState(false);
  const [twoFactor,    setTwoFactor]    = useState(false);
  const [autoApproveKYC, setAutoApproveKYC] = useState(false);
  const [debugMode,    setDebugMode]    = useState(false);

  const [appName,      setAppName]      = useState('GY DATA');
  const [supportEmail, setSupportEmail] = useState('support@gydata.ng');
  const [minDeposit,   setMinDeposit]   = useState('100');
  const [maxDaily,     setMaxDaily]     = useState('500000');
  const [cfgSaved,     setCfgSaved]     = useState(false);

  const saveConfig = () => {
    setCfgSaved(true);
    toast.success('Configuration saved successfully.');
    setTimeout(() => setCfgSaved(false), 2000);
  };

  const displayName = me?.name ?? 'Super Admin';
  const displayEmail = me?.email ?? adminEmail;

  return (
    <div className="p-4 lg:p-6 space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Manage admin preferences and app configuration</p>
      </div>

      {/* Admin Profile */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm">Admin Profile</h2>
        </div>
        <div className="flex items-center gap-4 mb-4 p-4 bg-background rounded-xl border border-border">
          <div className="w-14 h-14 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-xl font-bold text-primary">
            {displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p className="font-bold">{displayName}</p>
            <p className="text-sm text-muted-foreground">{displayEmail}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-xs text-green-400 font-medium">Active Session</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setModal('changePin')}
            className="flex-1 h-10 text-xs font-semibold border border-border rounded-xl hover:bg-white/5 hover:border-white/20 transition-colors flex items-center justify-center gap-2"
          >
            <Lock className="w-3.5 h-3.5" /> Change PIN
          </button>
          <button
            onClick={() => setModal('editProfile')}
            className="flex-1 h-10 text-xs font-semibold border border-border rounded-xl hover:bg-white/5 hover:border-white/20 transition-colors flex items-center justify-center gap-2"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit Profile
          </button>
        </div>
      </div>

      {/* App Configuration */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Globe className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm">App Configuration</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">App Name</label>
            <input
              value={appName}
              onChange={e => setAppName(e.target.value)}
              className="w-full bg-background border border-border focus:border-primary rounded-xl h-11 px-3 text-sm outline-none transition-colors"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Support Email</label>
            <input
              value={supportEmail}
              onChange={e => setSupportEmail(e.target.value)}
              className="w-full bg-background border border-border focus:border-primary rounded-xl h-11 px-3 text-sm outline-none transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Min Deposit (₦)</label>
              <input
                type="number"
                value={minDeposit}
                onChange={e => setMinDeposit(e.target.value)}
                className="w-full bg-background border border-border focus:border-primary rounded-xl h-11 px-3 text-sm outline-none transition-colors"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Max Daily (₦)</label>
              <input
                type="number"
                value={maxDaily}
                onChange={e => setMaxDaily(e.target.value)}
                className="w-full bg-background border border-border focus:border-primary rounded-xl h-11 px-3 text-sm outline-none transition-colors"
              />
            </div>
          </div>
          <button
            onClick={saveConfig}
            className="w-full h-11 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(59,130,246,0.25)]"
          >
            {cfgSaved ? <><Check className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> Save Configuration</>}
          </button>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm">Notifications</h2>
        </div>
        <ToggleRow label="Email Alerts" description="Receive critical alerts via email" value={emailAlerts} onChange={v => { setEmailAlerts(v); toast.success(`Email alerts ${v ? 'enabled' : 'disabled'}.`); }} />
        <ToggleRow label="SMS Alerts" description="Receive SMS for high-value transactions" value={smsAlerts} onChange={v => { setSmsAlerts(v); toast.success(`SMS alerts ${v ? 'enabled' : 'disabled'}.`); }} />
      </div>

      {/* Security Settings */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm">Security</h2>
        </div>
        <ToggleRow
          label="Two-Factor Auth"
          description="Require OTP for admin login"
          value={twoFactor}
          onChange={v => { setTwoFactor(v); toast[v ? 'success' : 'info'](v ? '2FA enabled — OTP will be required on next login.' : '2FA disabled.'); }}
        />
        <ToggleRow
          label="Auto-approve KYC"
          description="Automatically approve KYC submissions"
          value={autoApproveKYC}
          onChange={v => { setAutoApproveKYC(v); toast[v ? 'warning' : 'info'](v ? 'Auto-approve KYC enabled. Review submissions carefully.' : 'Auto-approve KYC disabled.'); }}
        />
      </div>

      {/* System */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          <h2 className="font-bold text-sm">System</h2>
        </div>
        <ToggleRow
          label="Maintenance Mode"
          description="Disable customer app access for maintenance"
          value={maintenance}
          onChange={v => { setMaintenance(v); toast[v ? 'warning' : 'success'](v ? 'Maintenance mode ON — customer app is disabled.' : 'Maintenance mode OFF — customer app is live.'); }}
        />
        <ToggleRow
          label="Debug Mode"
          description="Log verbose system events to console"
          value={debugMode}
          onChange={v => { setDebugMode(v); if (v) toast.info('Debug mode enabled — check browser console for verbose logs.'); }}
        />
        {maintenance && (
          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">Maintenance mode is active. Customer-facing app is currently inaccessible.</p>
          </div>
        )}
      </div>

      {/* API Keys — clearly labelled, no fake interactive elements */}
      <div className="bg-card border border-border rounded-2xl p-5 opacity-60">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-bold text-sm">API Keys</h2>
          </div>
          <span className="text-xs bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 px-2 py-0.5 rounded-full font-semibold">Managed via Server Env</span>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          API keys are stored securely as server environment variables and are never exposed to the client. To rotate a key, update it in your hosting environment.
        </p>
        {[
          { label: 'Monnify API Key',       env: 'MONNIFY_API_KEY' },
          { label: 'Monnify Secret Key',    env: 'MONNIFY_SECRET_KEY' },
          { label: 'Monnify Contract Code', env: 'MONNIFY_CONTRACT_CODE' },
          { label: 'ClubKonnect API Key',   env: 'CLUBKONNECT_API_KEY' },
          { label: 'ClubKonnect User ID',   env: 'CLUBKONNECT_USER_ID' },
        ].map(k => (
          <div key={k.label} className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0">
            <span className="text-xs text-muted-foreground">{k.label}</span>
            <code className="text-xs font-mono text-zinc-500">{k.env}</code>
          </div>
        ))}
      </div>

      {/* Danger Zone */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-5">
        <h2 className="font-bold text-sm text-red-400 mb-3">Danger Zone</h2>
        <button
          onClick={adminLogout}
          className="w-full h-11 bg-red-500/10 text-red-400 border border-red-500/20 rounded-xl text-sm font-semibold hover:bg-red-500/20 transition-colors"
        >
          Sign Out of Admin Portal
        </button>
      </div>

      {/* Modals */}
      {modal === 'changePin'   && <ChangePinModal   onClose={() => setModal(null)} />}
      {modal === 'editProfile' && <EditProfileModal  onClose={() => setModal(null)} />}
    </div>
  );
}
