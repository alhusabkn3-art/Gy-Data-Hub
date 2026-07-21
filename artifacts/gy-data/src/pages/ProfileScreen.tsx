import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, ShieldCheck, Lock, Fingerprint, HelpCircle, AlertTriangle, Info, LogOut, ChevronRight, Copy, X, Eye, EyeOff } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

export default function ProfileScreen() {
  const { user, logout } = useAppContext();
  const [, setLocation] = useLocation();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showPinModal, setShowPinModal] = useState<'login' | 'purchase' | null>(null);

  const handleLogout = () => {
    setShowLogoutDialog(false);
    logout();
    setLocation('/');
  };

  const copyReferral = () => {
    navigator.clipboard.writeText(user.referralCode);
    toast.success('Referral code copied!');
  };

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className="p-4 sm:p-6 max-w-md mx-auto min-h-screen bg-background pb-24"
      >
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">Profile</h1>
          <button
            onClick={() => setLocation('/settings')}
            className="text-primary text-sm font-medium bg-primary/10 px-3 py-1.5 rounded-full"
          >
            Settings
          </button>
        </div>

        {/* Avatar & Info */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-[#1B3A6B] flex items-center justify-center text-3xl font-bold text-white shadow-lg border-4 border-background">
              {user.firstName[0]}{user.name.split(' ')[1]?.[0] ?? ''}
            </div>
            {user.kycStatus === 'verified' && (
              <div className="absolute bottom-0 right-0 w-8 h-8 bg-green-500 rounded-full border-4 border-background flex items-center justify-center text-white">
                <ShieldCheck className="w-4 h-4" />
              </div>
            )}
          </div>
          <h2 className="text-2xl font-bold mb-1">{user.name}</h2>
          <p className="text-muted-foreground text-sm mb-1">{user.email}</p>
          <p className="text-muted-foreground text-xs mb-3">{user.phone}</p>
          <div className="px-4 py-1.5 bg-green-500/10 border border-green-500/30 rounded-full flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-xs font-semibold text-green-500">KYC Verified</span>
          </div>
        </div>

        <div className="space-y-6">
          {/* Account Section */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-3 px-1 uppercase tracking-wider">Account</h3>
            <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
              <MenuRow
                icon={User}
                label="Personal Information"
                onClick={() => toast.info('Personal information editing coming in the next update.')}
              />
              <MenuRow
                icon={ShieldCheck}
                label="Bank Account"
                value={user.bankName}
                onClick={() => toast.info('Bank account management coming soon!')}
              />
              <MenuRow
                icon={ShieldCheck}
                label="KYC Verification"
                value="Verified"
                valueColor="text-green-500"
                onClick={() => toast.success('Your KYC is fully verified!')}
              />
              <div
                onClick={copyReferral}
                className="flex items-center justify-between p-4 hover:bg-black/5 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    <User className="w-4 h-4" />
                  </div>
                  <span className="font-medium text-sm">Referral Program</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono text-primary bg-primary/10 px-2 py-1 rounded border border-primary/20">{user.referralCode}</span>
                  <Copy className="w-4 h-4 text-muted-foreground" />
                </div>
              </div>
            </div>
          </div>

          {/* Security Section */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-3 px-1 uppercase tracking-wider">Security</h3>
            <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
              <MenuRow
                icon={Lock}
                label="Change Login PIN"
                onClick={() => setShowPinModal('login')}
              />
              <MenuRow
                icon={Lock}
                label="Change Purchase PIN"
                onClick={() => setShowPinModal('purchase')}
              />
              <MenuRow
                icon={Fingerprint}
                label="Biometric Login"
                value="Off"
                onClick={() => toast.info('Enable biometrics in Settings → Security')}
              />
            </div>
          </div>

          {/* Support Section */}
          <div>
            <h3 className="text-xs font-semibold text-muted-foreground mb-3 px-1 uppercase tracking-wider">Support</h3>
            <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
              <MenuRow
                icon={HelpCircle}
                label="Help & Support"
                onClick={() => toast.info('Support chat coming soon! Email: support@gydata.ng')}
              />
              <MenuRow
                icon={AlertTriangle}
                label="Report a Problem"
                onClick={() => toast.info('Problem reporting coming soon!')}
              />
              <MenuRow
                icon={Info}
                label="About GY DATA"
                value="v1.0.0"
                onClick={() => toast.info('GY DATA v1.0.0 — endless joy')}
              />
            </div>
          </div>

          <button
            onClick={() => setShowLogoutDialog(true)}
            className="w-full mt-4 bg-transparent border-2 border-destructive/30 text-destructive h-14 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-destructive hover:text-white transition-all active:scale-[0.98]"
          >
            <LogOut className="w-5 h-5" />
            Logout
          </button>
        </div>
      </motion.div>

      {/* Logout Confirmation Dialog */}
      <AnimatePresence>
        {showLogoutDialog && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
              onClick={() => setShowLogoutDialog(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="fixed inset-x-6 top-1/2 -translate-y-1/2 bg-card border border-border rounded-3xl p-6 z-50 max-w-sm mx-auto shadow-2xl"
            >
              <div className="w-14 h-14 bg-destructive/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-7 h-7 text-destructive" />
              </div>
              <h2 className="text-xl font-bold text-center mb-2">Logout?</h2>
              <p className="text-muted-foreground text-sm text-center mb-6">You will need to enter your PIN to log back in.</p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowLogoutDialog(false)}
                  className="flex-1 h-12 rounded-xl border-2 border-border font-semibold text-sm hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogout}
                  className="flex-1 h-12 rounded-xl bg-destructive text-white font-semibold text-sm hover:bg-destructive/90 transition-colors active:scale-[0.98]"
                >
                  Logout
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* PIN Change Modal */}
      <AnimatePresence>
        {showPinModal && (
          <PinChangeModal
            type={showPinModal}
            onClose={() => setShowPinModal(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

function PinChangeModal({ type, onClose }: { type: 'login' | 'purchase'; onClose: () => void }) {
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>('current');
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  const label = type === 'login' ? 'Login' : 'Purchase';
  const activePin = step === 'current' ? currentPin : step === 'new' ? newPin : confirmPin;

  const handleKeyPress = (key: string) => {
    const setter = step === 'current' ? setCurrentPin : step === 'new' ? setNewPin : setConfirmPin;
    const current = step === 'current' ? currentPin : step === 'new' ? newPin : confirmPin;
    if (key === 'backspace') {
      setter(current.slice(0, -1));
    } else if (current.length < 6) {
      const next = current + key;
      setter(next);
      if (next.length === 6) {
        setTimeout(() => {
          if (step === 'current') {
            if (next !== '123456') {
              toast.error('Incorrect current PIN');
              setter('');
            } else {
              setStep('new');
            }
          } else if (step === 'new') {
            setStep('confirm');
          } else {
            if (next !== newPin) {
              toast.error("PINs don't match. Try again.");
              setter('');
              setStep('new');
              setNewPin('');
            } else {
              toast.success(`${label} PIN changed successfully!`);
              onClose();
            }
          }
        }, 300);
      }
    }
  };

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'backspace'];

  const stepLabel = step === 'current' ? `Enter Current ${label} PIN` : step === 'new' ? `Enter New ${label} PIN` : 'Confirm New PIN';

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
        onClick={onClose}
      />
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="fixed bottom-0 left-0 right-0 bg-white border-t border-border shadow-[0_-4px_32px_rgba(14,29,70,0.10)] z-50 rounded-t-3xl max-w-md mx-auto p-6 pb-8"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold">Change {label} PIN</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-sm text-muted-foreground text-center mb-4">{stepLabel}</p>

        <div className="flex justify-center gap-2 mb-6">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className={`w-10 h-10 rounded-xl flex items-center justify-center border-2 transition-all ${
                i === activePin.length
                  ? 'border-primary bg-primary/10 shadow-[0_0_12px_rgba(37,99,235,0.3)]'
                  : i < activePin.length
                    ? 'border-primary bg-primary'
                    : 'border-border bg-muted'
              }`}
            >
              {i < activePin.length && (
                showPin
                  ? <span className="text-primary-foreground text-sm font-bold">{activePin[i]}</span>
                  : <div className="w-2.5 h-2.5 bg-primary-foreground rounded-full" />
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2 mb-4">
          {keys.map((key, i) => (
            <button
              key={i}
              onClick={() => key && handleKeyPress(key)}
              disabled={!key}
              className={`h-12 rounded-xl flex items-center justify-center text-lg font-medium transition-all active:scale-95 ${
                key ? 'bg-muted hover:bg-black/10 text-foreground' : 'opacity-0 cursor-default'
              }`}
            >
              {key === 'backspace' ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/>
                  <line x1="18" y1="9" x2="12" y2="15"/><line x1="12" y1="9" x2="18" y2="15"/>
                </svg>
              ) : key}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowPin(v => !v)}
          className="w-full flex items-center justify-center gap-2 text-xs text-muted-foreground py-2"
        >
          {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          {showPin ? 'Hide PIN' : 'Show PIN'}
        </button>

        <p className="text-center text-xs text-muted-foreground mt-2">
          Step {step === 'current' ? 1 : step === 'new' ? 2 : 3} of 3
        </p>
      </motion.div>
    </>
  );
}

function MenuRow({
  icon: Icon,
  label,
  value,
  valueColor,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value?: string;
  valueColor?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between p-4 hover:bg-black/5 active:bg-black/8 transition-colors text-left"
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Icon className="w-4 h-4" />
        </div>
        <span className="font-medium text-sm">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {value && <span className={`text-xs font-medium ${valueColor ?? 'text-muted-foreground'}`}>{value}</span>}
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </button>
  );
}
