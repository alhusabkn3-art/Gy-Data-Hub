import React, { useState } from 'react';
import { Shield, Bell, Globe, Lock, ToggleLeft, ToggleRight, ChevronRight, Save, AlertTriangle } from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { toast } from 'sonner';

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

export default function AdminSettings() {
  const { adminEmail, adminLogout } = useAdminContext();
  const [maintenance, setMaintenance] = useState(false);
  const [emailAlerts, setEmailAlerts] = useState(true);
  const [smsAlerts, setSmsAlerts] = useState(false);
  const [twoFactor, setTwoFactor] = useState(false);
  const [autoApproveKYC, setAutoApproveKYC] = useState(false);
  const [debugMode, setDebugMode] = useState(false);

  const [appName, setAppName] = useState('GY DATA');
  const [supportEmail, setSupportEmail] = useState('support@gydata.ng');
  const [minDeposit, setMinDeposit] = useState('100');
  const [maxDaily, setMaxDaily] = useState('500000');

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
            A
          </div>
          <div>
            <p className="font-bold">Super Admin</p>
            <p className="text-sm text-muted-foreground">{adminEmail}</p>
            <div className="flex items-center gap-1.5 mt-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
              <span className="text-xs text-green-400 font-medium">Active Session</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => toast.info('Password change — coming in next update.')}
            className="flex-1 h-10 text-xs font-semibold border border-border rounded-xl hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
          >
            <Lock className="w-3.5 h-3.5" /> Change Password
          </button>
          <button
            onClick={() => toast.info('Profile editing — coming in next update.')}
            className="flex-1 h-10 text-xs font-semibold border border-border rounded-xl hover:bg-white/5 transition-colors flex items-center justify-center gap-2"
          >
            <ChevronRight className="w-3.5 h-3.5" /> Edit Profile
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
            onClick={() => toast.success('Configuration saved!')}
            className="w-full h-11 bg-primary hover:bg-primary/90 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(59,130,246,0.25)]"
          >
            <Save className="w-4 h-4" /> Save Configuration
          </button>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm">Notifications</h2>
        </div>
        <ToggleRow label="Email Alerts" description="Receive critical alerts via email" value={emailAlerts} onChange={setEmailAlerts} />
        <ToggleRow label="SMS Alerts" description="Receive SMS for high-value transactions" value={smsAlerts} onChange={setSmsAlerts} />
      </div>

      {/* Security Settings */}
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <Lock className="w-4 h-4 text-primary" />
          <h2 className="font-bold text-sm">Security</h2>
        </div>
        <ToggleRow label="Two-Factor Auth" description="Require OTP for admin login" value={twoFactor} onChange={(v) => { setTwoFactor(v); if (v) toast.success('2FA enabled — OTP would be sent on next login.'); }} />
        <ToggleRow label="Auto-approve KYC" description="Automatically approve KYC submissions" value={autoApproveKYC} onChange={(v) => { setAutoApproveKYC(v); if (v) toast.warning('Auto-approve KYC enabled. Review submissions carefully.'); }} />
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
          onChange={(v) => {
            setMaintenance(v);
            toast[v ? 'warning' : 'success'](v ? 'Maintenance mode ON — customer app is disabled.' : 'Maintenance mode OFF — customer app is live.');
          }}
        />
        <ToggleRow label="Debug Mode" description="Log verbose system events to console" value={debugMode} onChange={setDebugMode} />

        {maintenance && (
          <div className="mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-300">Maintenance mode is active. Customer-facing app is currently inaccessible.</p>
          </div>
        )}
      </div>

      {/* API Keys */}
      <div className="bg-card border border-border rounded-2xl p-5 opacity-70">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-muted-foreground" />
            <h2 className="font-bold text-sm">API Keys</h2>
          </div>
          <span className="text-xs bg-zinc-500/10 text-zinc-400 border border-zinc-500/20 px-2 py-0.5 rounded-full font-semibold">Coming Soon</span>
        </div>
        {[
          { label: 'VTPass API Key', value: 'vtpass_sk_•••••••••••••••••' },
          { label: 'Paystack Secret Key', value: 'sk_live_•••••••••••••••••' },
          { label: 'Termii API Key', value: 'TLsk_•••••••••••••••••' },
        ].map(k => (
          <div key={k.label} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
            <span className="text-xs text-muted-foreground">{k.label}</span>
            <span className="text-xs font-mono text-muted-foreground">{k.value}</span>
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
    </div>
  );
}
