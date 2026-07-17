import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAppContext } from '../context/AppContext';
import { Switch } from '@/components/ui/switch';

export default function SettingsScreen() {
  const [, setLocation] = useLocation();
  const { settings, updateSettings } = useAppContext();

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-4 sm:p-6 max-w-md mx-auto min-h-screen bg-background pb-20"
    >
      <div className="flex items-center gap-3 mb-8 pt-2">
        <button 
          onClick={() => setLocation('/')}
          className="w-10 h-10 bg-card rounded-full flex items-center justify-center border border-border"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Settings</h1>
      </div>

      <div className="space-y-8">
        
        {/* Appearance */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-2 uppercase tracking-wider">Appearance</h2>
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="flex justify-between items-center mb-4">
              <span className="font-medium text-sm">Theme</span>
            </div>
            <div className="flex bg-background rounded-xl p-1 border border-border">
              {(['light', 'dark', 'system'] as const).map(theme => (
                <button
                  key={theme}
                  onClick={() => updateSettings({ theme })}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg capitalize transition-colors ${
                    settings.theme === theme ? 'bg-primary text-white shadow-md' : 'text-muted-foreground hover:bg-white/5'
                  }`}
                >
                  {theme}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Security */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-2 uppercase tracking-wider">Security</h2>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            <ToggleRow 
              label="Biometric Authentication" 
              checked={settings.biometrics} 
              onCheckedChange={(v) => updateSettings({ biometrics: v })} 
            />
            <div className="p-4 flex items-center justify-between">
              <span className="font-medium text-sm">Auto-lock After</span>
              <select 
                value={settings.autoLock}
                onChange={(e) => updateSettings({ autoLock: e.target.value })}
                className="bg-transparent text-sm text-primary font-semibold outline-none text-right"
              >
                <option value="1 min">1 min</option>
                <option value="5 min">5 min</option>
                <option value="15 min">15 min</option>
                <option value="Never">Never</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-2 uppercase tracking-wider">Notifications</h2>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            <ToggleRow 
              label="Transaction Alerts" 
              checked={settings.notifications.transactions} 
              onCheckedChange={(v) => updateSettings({ notifications: { ...settings.notifications, transactions: v } })} 
            />
            <ToggleRow 
              label="Promotional Offers" 
              checked={settings.notifications.promotional} 
              onCheckedChange={(v) => updateSettings({ notifications: { ...settings.notifications, promotional: v } })} 
            />
            <ToggleRow 
              label="Security Alerts" 
              checked={settings.notifications.security} 
              onCheckedChange={(v) => updateSettings({ notifications: { ...settings.notifications, security: v } })} 
            />
            <ToggleRow 
              label="Email Notifications" 
              checked={settings.notifications.email} 
              onCheckedChange={(v) => updateSettings({ notifications: { ...settings.notifications, email: v } })} 
            />
          </div>
        </div>

        {/* Privacy */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 px-2 uppercase tracking-wider">Privacy & Display</h2>
          <div className="bg-card border border-border rounded-2xl divide-y divide-border">
            <ToggleRow 
              label="Hide Balance by Default" 
              checked={settings.hideBalanceDefault} 
              onCheckedChange={(v) => updateSettings({ hideBalanceDefault: v })} 
            />
          </div>
        </div>

      </div>
    </motion.div>
  );
}

function ToggleRow({ label, checked, onCheckedChange }: { label: string, checked: boolean, onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="p-4 flex items-center justify-between">
      <span className="font-medium text-sm">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
