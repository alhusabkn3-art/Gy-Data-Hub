import React, { useState, useEffect } from 'react';
import { Shield, Bell, Globe, Lock, Save, AlertTriangle, X, Eye, EyeOff, Pencil, Check, Crown, Loader2 } from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { ROLE_LABELS } from '../data/adminMockData';
import { toast } from 'sonner';
import { apiGetSystemSettings, apiUpdateSystemSetting, SystemSettingValue } from '../utils/adminApi';

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
          <button onClick={onClose} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
        {children}
      </div>
    </>
  );
}

// ── Change PIN modal ──────────────────────────────────────────────────────────
// Uses the real /api/admin/me/pin endpoint — verifies current PIN server-side.

function ChangePinModal({ onClose }: { onClose: () => void }) {
  const { changeOwnPin } = useAdminContext();

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
        <button type="button" onClick={onToggle}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {errors[errorKey] && <p className="text-xs text-red-400 mt-1">{errors[errorKey]}</p>}
    </div>
  );

  const submit = async () => {
    // Local validation
    const e: Record<string, string> = {};
    if (currentPin.length !== 6) e.currentPin = 'Current PIN must be 6 digits';
    if (newPin.length !== 6)     e.newPin = 'New PIN must be exactly 6 digits';
    if (newPin === currentPin)   e.newPin = 'New PIN must differ from current PIN';
    if (newPin !== confirmPin)   e.confirmPin = 'PINs do not match';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    // Server verifies current PIN — no client-side PIN comparison
    const result = await changeOwnPin(currentPin, newPin);
    setSaving(false);
    if (result.ok) {
      toast.success('PIN updated successfully. Use your new PIN on next login.');
      onClose();
    } else {
      setErrors({ currentPin: result.error ?? 'PIN change failed.' });
    }
  };

  return (
    <Modal title="Change PIN" onClose={onClose}>
      <div className="space-y-4">
        <div className="p-3 rounded-xl bg-amber-500/8 border border-amber-500/20 text-xs text-amber-400 flex items-start gap-2">
          <Lock className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>Your current PIN is verified server-side. PINs are never stored in plain text.</span>
        </div>
        <PinField label="Current PIN" value={currentPin} onChange={setCurrentPin}
          show={showCurrent} onToggle={() => setShowCurrent(v => !v)} errorKey="currentPin" placeholder="Enter current PIN" />
        <PinField label="New PIN" value={newPin} onChange={setNewPin}
          show={showNew} onToggle={() => setShowNew(v => !v)} errorKey="newPin" placeholder="Choose a new 6-digit PIN" />
        <PinField label="Confirm New PIN" value={confirmPin} onChange={setConfirmPin}
          show={showNew} onToggle={() => setShowNew(v => !v)} errorKey="confirmPin" placeholder="Repeat new PIN" />
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-11 border border-border rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 h-11 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors shadow-[0_4px_16px_rgba(59,130,246,0.3)] flex items-center justify-center gap-2">
            {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</> : <><Check className="w-4 h-4" />Update PIN</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Edit profile modal ────────────────────────────────────────────────────────
// Uses /api/admin/me (PATCH) — updates own profile on the backend.

function EditProfileModal({ onClose }: { onClose: () => void }) {
  const { updateOwnProfile, adminEmail } = useAdminContext();

  const [name,    setName]    = useState('');
  const [email,   setEmail]   = useState(adminEmail);
  const [errors,  setErrors]  = useState<Record<string, string>>({});
  const [saving,  setSaving]  = useState(false);

  const submit = async () => {
    const e: Record<string, string> = {};
    if (name.trim() && name.trim().length < 2) e.name = 'Name must be at least 2 characters';
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = 'Valid email required';
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setSaving(true);
    const updates: { name?: string; email?: string } = {};
    if (name.trim()) updates.name  = name.trim();
    if (email.trim()) updates.email = email.trim().toLowerCase();
    const ok = await updateOwnProfile(updates);
    setSaving(false);
    if (ok) { toast.success('Profile updated successfully.'); onClose(); }
    else toast.error('Failed to update profile. Please try again.');
  };

  return (
    <Modal title="Edit Profile" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Display Name</label>
          <input value={name} onChange={e => { setName(e.target.value); setErrors(p => ({ ...p, name: '' })); }}
            className="w-full bg-background border-2 border-border focus:border-primary rounded-xl h-11 px-4 text-sm outline-none transition-colors"
            placeholder="Your name (leave blank to keep current)" />
          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
        </div>
        <div>
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Email Address</label>
          <input type="email" value={email} onChange={e => { setEmail(e.target.value); setErrors(p => ({ ...p, email: '' })); }}
            className="w-full bg-background border-2 border-border focus:border-primary rounded-xl h-11 px-4 text-sm outline-none transition-colors"
            placeholder="admin@example.com" />
          {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 h-11 border border-border rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 h-11 bg-primary hover:bg-primary/90 disabled:opacity-60 text-white rounded-xl text-sm font-bold transition-colors shadow-[0_4px_16px_rgba(59,130,246,0.3)] flex items-center justify-center gap-2">
            {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving…</> : <><Check className="w-4 h-4" />Save Changes</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminSettings() {
  const { adminEmail, adminRole, isSuperAdmin, adminLogout } = useAdminContext();

  const [modal,             setModal]            = useState<'changePin' | 'editProfile' | null>(null);
  const [maintenance,       setMaintenance]      = useState(false);
  const [emailAlerts,       setEmailAlerts]      = useState(true);
  const [smsAlerts,         setSmsAlerts]        = useState(false);
  const [twoFactor,         setTwoFactor]        = useState(false);
  const [debugMode,         setDebugMode]        = useState(false);
  const [appName]                                = useState('GY DATA');
  const [supportEmail,      setSupportEmail]     = useState('support@gydata.ng');
  const [supportPhone,      setSupportPhone]     = useState('');
  const [minDeposit,        setMinDeposit]       = useState('100');
  const [maxDaily,          setMaxDaily]         = useState('500000');
  const [systemAnnouncement, setSystemAnnouncement] = useState('');
  const [maintenanceConfirm, setMaintenanceConfirm] = useState(false);
  const [settingsLoading,   setSettingsLoading]  = useState(false);
  const [settingsSaving,    setSettingsSaving]   = useState(false);

  // Load system settings from backend on mount (super admin only)
  useEffect(() => {
    if (!isSuperAdmin) return;
    setSettingsLoading(true);
    apiGetSystemSettings()
      .then(({ settings }) => {
        if (settings['support_email']?.value)     setSupportEmail(settings['support_email'].value);
        if (settings['support_phone']?.value)     setSupportPhone(settings['support_phone'].value);
        if (settings['min_wallet_topup']?.value)  setMinDeposit(settings['min_wallet_topup'].value);
        if (settings['max_wallet_topup']?.value)  setMaxDaily(settings['max_wallet_topup'].value);
        if (settings['system_announcement']?.value) setSystemAnnouncement(settings['system_announcement'].value);
        if (settings['maintenance_mode']?.value)  setMaintenance(settings['maintenance_mode'].value === 'true');
      })
      .catch(() => { /* silent — will use local defaults */ })
      .finally(() => setSettingsLoading(false));
  }, [isSuperAdmin]);

  const handleMaintenanceChange = (v: boolean) => {
    if (v) {
      // Turning ON → show confirm first
      setMaintenanceConfirm(true);
    } else {
      setMaintenance(false);
    }
  };

  const saveConfig = async () => {
    setSettingsSaving(true);
    try {
      await Promise.all([
        apiUpdateSystemSetting('support_email', supportEmail),
        apiUpdateSystemSetting('support_phone', supportPhone),
        apiUpdateSystemSetting('min_wallet_topup', minDeposit),
        apiUpdateSystemSetting('max_wallet_topup', maxDaily),
        apiUpdateSystemSetting('system_announcement', systemAnnouncement),
        apiUpdateSystemSetting('maintenance_mode', String(maintenance)),
      ]);
      toast.success('Configuration saved successfully.');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to save configuration.');
    } finally {
      setSettingsSaving(false);
    }
  };

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
            {adminEmail ? adminEmail[0].toUpperCase() : 'A'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold">{ROLE_LABELS[adminRole] ?? 'Admin'}</p>
              {isSuperAdmin && <Crown className="w-3.5 h-3.5 text-amber-400" />}
            </div>
            <p className="text-sm text-muted-foreground truncate">{adminEmail}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-xs text-green-400 font-medium">Active Session</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setModal('editProfile')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-border rounded-xl hover:bg-white/5 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit Profile
          </button>
          <button
            onClick={() => setModal('changePin')}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border border-border rounded-xl hover:bg-white/5 transition-colors"
          >
            <Lock className="w-3.5 h-3.5" /> Change PIN
          </button>
        </div>
      </div>

      {/* Notifications */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm">Notifications</h2>
        </div>
        <ToggleRow label="Email Alerts" description="Receive admin alerts via email" value={emailAlerts} onChange={setEmailAlerts} />
        <ToggleRow label="SMS Alerts"   description="Receive SMS for critical events" value={smsAlerts}   onChange={setSmsAlerts} />
        <ToggleRow label="Debug Mode"   description="Log verbose debug information"  value={debugMode}   onChange={setDebugMode} />
      </div>

      {/* Security */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm">Security</h2>
        </div>
        <ToggleRow label="Two-Factor Authentication" description="Require OTP in addition to PIN" value={twoFactor} onChange={setTwoFactor} />
      </div>

      {/* App configuration — super admin only */}
      {isSuperAdmin && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              <h2 className="font-bold text-sm">App Configuration</h2>
            </div>
            <span className="text-[10px] font-semibold text-amber-400 border border-amber-400/30 bg-amber-500/8 rounded-full px-2 py-0.5">Super Admin</span>
          </div>

          {settingsLoading ? (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading settings…
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* App Name — read-only */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">App Name</label>
                  <input
                    value={appName}
                    readOnly
                    className="w-full bg-background border-2 border-border rounded-xl h-11 px-4 text-sm outline-none opacity-60 cursor-not-allowed"
                  />
                </div>
                {/* Support Email */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Support Email</label>
                  <input
                    value={supportEmail}
                    onChange={e => setSupportEmail(e.target.value)}
                    type="email"
                    className="w-full bg-background border-2 border-border focus:border-primary rounded-xl h-11 px-4 text-sm outline-none transition-colors"
                  />
                </div>
                {/* Support Phone */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Support Phone</label>
                  <input
                    value={supportPhone}
                    onChange={e => setSupportPhone(e.target.value)}
                    type="tel"
                    placeholder="+234 800 000 0000"
                    className="w-full bg-background border-2 border-border focus:border-primary rounded-xl h-11 px-4 text-sm outline-none transition-colors"
                  />
                </div>
                {/* Min Deposit */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Min Deposit (₦)</label>
                  <input
                    value={minDeposit}
                    onChange={e => setMinDeposit(e.target.value)}
                    type="number"
                    className="w-full bg-background border-2 border-border focus:border-primary rounded-xl h-11 px-4 text-sm outline-none transition-colors"
                  />
                </div>
                {/* Max Daily */}
                <div>
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">Max Daily Spend (₦)</label>
                  <input
                    value={maxDaily}
                    onChange={e => setMaxDaily(e.target.value)}
                    type="number"
                    className="w-full bg-background border-2 border-border focus:border-primary rounded-xl h-11 px-4 text-sm outline-none transition-colors"
                  />
                </div>
              </div>

              {/* System Announcement */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">System Announcement</label>
                <textarea
                  value={systemAnnouncement}
                  onChange={e => setSystemAnnouncement(e.target.value)}
                  rows={3}
                  placeholder="Global banner shown to all users (leave blank to hide)…"
                  className="w-full bg-background border-2 border-border focus:border-primary rounded-xl px-4 py-3 text-sm outline-none transition-colors resize-none"
                />
              </div>

              <ToggleRow
                label="Maintenance Mode"
                description="Take the app offline for maintenance"
                value={maintenance}
                onChange={handleMaintenanceChange}
              />

              <button
                onClick={saveConfig}
                disabled={settingsSaving}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-70 text-white rounded-xl text-sm font-semibold transition-colors shadow-[0_4px_16px_rgba(59,130,246,0.3)]"
              >
                {settingsSaving
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                  : <><Save className="w-4 h-4" />Save Configuration</>
                }
              </button>
            </div>
          )}
        </div>
      )}

      {/* Danger zone */}
      <div className="bg-card border border-red-500/20 rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-400" />
          <h2 className="font-bold text-sm text-red-400">Danger Zone</h2>
        </div>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Signing out will end your admin session. You'll need your email and PIN to log back in.
          </p>
          <button
            onClick={adminLogout}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-400 border border-red-500/25 rounded-xl hover:bg-red-500/10 transition-colors"
          >
            Sign Out of Admin Portal
          </button>
        </div>
      </div>

      {modal === 'changePin'   && <ChangePinModal   onClose={() => setModal(null)} />}
      {modal === 'editProfile' && <EditProfileModal  onClose={() => setModal(null)} />}

      {/* Maintenance Mode Confirmation */}
      {maintenanceConfirm && (
        <Modal title="Enable Maintenance Mode?" onClose={() => setMaintenanceConfirm(false)}>
          <div className="space-y-4">
            <div className="p-3 rounded-xl bg-red-500/8 border border-red-500/20 text-xs text-red-400 flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>All users will see a maintenance page and cannot use the app until maintenance mode is turned off.</span>
            </div>
            <p className="text-sm text-muted-foreground">Are you sure you want to enable maintenance mode?</p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setMaintenanceConfirm(false)}
                className="flex-1 h-11 border border-border rounded-xl text-sm font-semibold hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setMaintenance(true); setMaintenanceConfirm(false); }}
                className="flex-1 h-11 bg-red-500 hover:bg-red-500/90 text-white rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" /> Enable
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
