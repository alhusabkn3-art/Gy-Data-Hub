// SettingsScreen.tsx

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  Moon,
  Sun,
  Monitor,
  Fingerprint,
  ShieldCheck,
  Bell,
  Mail,
  WalletCards,
  Eye,
  EyeOff,
  Lock,
  LogOut,
  Check,
  X,
  Palette,
  Smartphone,
  KeyRound,
} from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { useAppContext } from '../context/AppContext';
import { Switch } from '@/components/ui/switch';

type PinType = 'login' | 'purchase';

export default function SettingsScreen() {
  const [, setLocation] = useLocation();

  const {
    settings,
    updateSettings,
    verifyPin,
    changePin,
    verifyPurchasePin,
    changePurchasePin,
    logout,
  } = useAppContext();

  const [showPinModal, setShowPinModal] =
    useState<PinType | null>(null);

  const [showLogout, setShowLogout] =
    useState(false);

  const [loggingOut, setLoggingOut] =
    useState(false);

  const saveSetting = async (
    next: Parameters<typeof updateSettings>[0],
  ) => {
    const result = await updateSettings(next);

    if (!result.ok) {
      toast.error(
        result.error || 'Unable to update setting.',
      );
    }
  };

  const handleTheme = async (
    theme: 'light' | 'dark' | 'system',
  ) => {
    await saveSetting({ theme });
  };

  const handleLogout = () => {
    if (loggingOut) return;

    setLoggingOut(true);
    setShowLogout(false);

    void logout();
    setLocation('/');
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[480px] px-4">

        {/* Header */}
        <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200/70 bg-slate-50/95 px-4 py-4 backdrop-blur-xl dark:border-slate-800/70 dark:bg-slate-950/95">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setLocation('/')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div>
              <h1 className="text-xl font-bold">
                Settings
              </h1>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage your GY DATA account
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-7 pt-5">

          {/* Appearance */}
          <SettingsSection
            icon={<Palette className="h-4 w-4" />}
            title="Appearance"
          >
            <div className="p-4">
              <p className="mb-3 text-sm font-semibold">
                Theme
              </p>

              <div className="grid grid-cols-3 gap-2">
                <ThemeButton
                  icon={<Sun className="h-4 w-4" />}
                  label="Light"
                  active={settings.theme === 'light'}
                  onClick={() => handleTheme('light')}
                />

                <ThemeButton
                  icon={<Moon className="h-4 w-4" />}
                  label="Dark"
                  active={settings.theme === 'dark'}
                  onClick={() => handleTheme('dark')}
                />

                <ThemeButton
                  icon={<Monitor className="h-4 w-4" />}
                  label="System"
                  active={settings.theme === 'system'}
                  onClick={() => handleTheme('system')}
                />
              </div>
            </div>
          </SettingsSection>

          {/* Security */}
          <SettingsSection
            icon={<ShieldCheck className="h-4 w-4" />}
            title="Security"
          >
            <SettingsRow
              icon={<Fingerprint className="h-5 w-5" />}
              title="Biometric Authentication"
              description="Use device biometrics when supported"
              right={
                <Switch
                  checked={settings.biometrics}
                  onCheckedChange={v =>
                    saveSetting({
                      biometrics: v,
                    })
                  }
                />
              }
            />

            <SettingsRow
              icon={<Smartphone className="h-5 w-5" />}
              title="Auto-lock"
              description="Lock the app after inactivity"
              right={
                <select
                  value={settings.autoLock}
                  onChange={e =>
                    saveSetting({
                      autoLock: e.target.value,
                    })
                  }
                  className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold outline-none dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="1">1 min</option>
                  <option value="5">5 min</option>
                  <option value="15">15 min</option>
                  <option value="30">30 min</option>
                  <option value="Never">Never</option>
                </select>
              }
            />

            <button
              type="button"
              onClick={() => setShowPinModal('login')}
              className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#071B3A] dark:bg-blue-950/40 dark:text-blue-300">
                <KeyRound className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  Login PIN
                </p>

                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Change your 6-digit login PIN
                </p>
              </div>

              <ChevronLeft className="h-5 w-5 rotate-180 text-slate-300" />
            </button>

            <button
              type="button"
              onClick={() => setShowPinModal('purchase')}
              className="flex w-full items-center gap-3 border-t border-slate-100 p-4 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#071B3A] dark:bg-blue-950/40 dark:text-blue-300">
                <Lock className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  Purchase PIN
                </p>

                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Set or change your 4-digit purchase PIN
                </p>
              </div>

              <ChevronLeft className="h-5 w-5 rotate-180 text-slate-300" />
            </button>
          </SettingsSection>

          {/* Notifications */}
          <SettingsSection
            icon={<Bell className="h-4 w-4" />}
            title="Notifications"
          >
            <SettingsRow
              icon={<WalletCards className="h-5 w-5" />}
              title="Transaction Alerts"
              description="Receive alerts for account transactions"
              right={
                <Switch
                  checked={
                    settings.notifications.transactions
                  }
                  onCheckedChange={v =>
                    saveSetting({
                      notifications: {
                        ...settings.notifications,
                        transactions: v,
                      },
                    })
                  }
                />
              }
            />

            <SettingsRow
              icon={<Bell className="h-5 w-5" />}
              title="Promotional Offers"
              description="Receive GY DATA promotions and offers"
              right={
                <Switch
                  checked={
                    settings.notifications.promotional
                  }
                  onCheckedChange={v =>
                    saveSetting({
                      notifications: {
                        ...settings.notifications,
                        promotional: v,
                      },
                    })
                  }
                />
              }
            />

            <SettingsRow
              icon={<ShieldCheck className="h-5 w-5" />}
              title="Security Alerts"
              description="Important security notifications"
              right={
                <Switch
                  checked={
                    settings.notifications.security
                  }
                  onCheckedChange={v =>
                    saveSetting({
                      notifications: {
                        ...settings.notifications,
                        security: v,
                      },
                    })
                  }
                />
              }
            />

            <SettingsRow
              icon={<Mail className="h-5 w-5" />}
              title="Email Notifications"
              description="Receive important notifications by email"
              right={
                <Switch
                  checked={
                    settings.notifications.email
                  }
                  onCheckedChange={v =>
                    saveSetting({
                      notifications: {
                        ...settings.notifications,
                        email: v,
                      },
                    })
                  }
                />
              }
            />
          </SettingsSection>

          {/* Privacy */}
          <SettingsSection
            icon={<Eye className="h-4 w-4" />}
            title="Privacy & Display"
          >
            <SettingsRow
              icon={
                settings.hideBalanceDefault ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )
              }
              title="Hide Balance by Default"
              description="Keep wallet balance hidden when opening the app"
              right={
                <Switch
                  checked={
                    settings.hideBalanceDefault
                  }
                  onCheckedChange={v =>
                    saveSetting({
                      hideBalanceDefault: v,
                    })
                  }
                />
              }
            />
          </SettingsSection>

          {/* Account */}
          <SettingsSection
            icon={<UserIcon className="h-4 w-4" />}
            title="Account"
          >
            <button
              type="button"
              onClick={() =>
                setLocation('/profile/personal')
              }
              className="flex w-full items-center gap-3 p-4 text-left"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                <UserIcon className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  Personal Information
                </p>

                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  View and update your personal details
                </p>
              </div>

              <ChevronLeft className="h-5 w-5 rotate-180 text-slate-300" />
            </button>

            <button
              type="button"
              onClick={() =>
                setLocation('/profile/username')
              }
              className="flex w-full items-center gap-3 border-t border-slate-100 p-4 text-left dark:border-slate-800"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
                <KeyRound className="h-5 w-5" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">
                  Username
                </p>

                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Change your account username
                </p>
              </div>

              <ChevronLeft className="h-5 w-5 rotate-180 text-slate-300" />
            </button>
          </SettingsSection>

          {/* Logout */}
          <button
            type="button"
            disabled={loggingOut}
            onClick={() => setShowLogout(true)}
            className="flex w-full items-center gap-3 rounded-2xl border border-red-200 bg-white p-4 text-left dark:border-red-900/40 dark:bg-slate-900"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/40">
              <LogOut className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-semibold text-red-600">
                {loggingOut ? 'Logging out...' : 'Logout'}
              </p>

              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Sign out of your GY DATA account
              </p>
            </div>

            <ChevronLeft className="h-5 w-5 rotate-180 text-red-300" />
          </button>

          <p className="pb-5 text-center text-xs text-slate-400">
            GY DATA • Secure Account
          </p>
        </div>
      </div>

      {showPinModal && (
        <PinChangeModal
          type={showPinModal}
          onClose={() => setShowPinModal(null)}
          verifyPin={verifyPin}
          changePin={changePin}
          verifyPurchasePin={verifyPurchasePin}
          changePurchasePin={changePurchasePin}
        />
      )}

      <AnimatePresence>
        {showLogout && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
            onClick={() => setShowLogout(false)}
          >
            <motion.div
              initial={{
                scale: 0.95,
                opacity: 0,
              }}
              animate={{
                scale: 1,
                opacity: 1,
              }}
              exit={{
                scale: 0.95,
                opacity: 0,
              }}
              className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-900"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/40">
                    <LogOut className="h-5 w-5" />
                  </div>

                  <h3 className="text-lg font-bold">
                    Logout
                  </h3>
                </div>

                <button
                  type="button"
                  onClick={() => setShowLogout(false)}
                  className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                Are you sure you want to logout?
              </p>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowLogout(false)}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 font-medium dark:border-slate-700"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white"
                >
                  Logout
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SettingsSection({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 px-1">
        <span className="text-[#071B3A] dark:text-blue-300">
          {icon}
        </span>

        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-[#071B3A] dark:text-blue-300">
          {title}
        </h2>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {children}
      </div>
    </section>
  );
}

function SettingsRow({
  icon,
  title,
  description,
  right,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  right: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#071B3A] dark:bg-slate-800 dark:text-blue-300">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {title}
        </p>

        <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      <div className="shrink-0">
        {right}
      </div>
    </div>
  );
}

function ThemeButton({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-xs font-semibold transition-all ${
        active
          ? 'border-[#071B3A] bg-[#071B3A] text-white shadow-md dark:border-blue-400 dark:bg-blue-950/50'
          : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
      }`}
    >
      {icon}
      {label}

      {active && (
        <span className="absolute right-1.5 top-1.5">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
}

function UserIcon({
  className,
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={className}
    >
      <path
        d="M20 21a8 8 0 0 0-16 0"
        strokeLinecap="round"
      />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function PinChangeModal({
  type,
  onClose,
  verifyPin,
  changePin,
  verifyPurchasePin,
  changePurchasePin,
}: {
  type: PinType;
  onClose: () => void;
  verifyPin: (pin: string) => Promise<boolean>;
  changePin: (
    currentPin: string,
    newPin: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;
  verifyPurchasePin: (
    pin: string,
  ) => Promise<boolean>;
  changePurchasePin: (
    currentPin: string,
    newPin: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;
}) {
  const isPurchase = type === 'purchase';
  const pinLength = isPurchase ? 4 : 6;

  const [step, setStep] = useState<
    'current' | 'new' | 'confirm'
  >(isPurchase ? 'new' : 'current');

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);

  const value =
    step === 'current'
      ? currentPin
      : step === 'new'
        ? newPin
        : confirmPin;

  const setValue = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, pinLength);

    if (step === 'current') {
      setCurrentPin(clean);
    } else if (step === 'new') {
      setNewPin(clean);
    } else {
      setConfirmPin(clean);
    }
  };

  const handleContinue = async () => {
    if (value.length !== pinLength) {
      toast.error(
        `Enter a ${pinLength}-digit PIN.`,
      );
      return;
    }

    setLoading(true);

    try {
      if (step === 'current') {
        const valid =
          await verifyPin(currentPin);

        if (!valid) {
          toast.error(
            'Current PIN is incorrect.',
          );
          setCurrentPin('');
          return;
        }

        setStep('new');
        return;
      }

      if (step === 'new') {
        if (
          !isPurchase &&
          newPin === currentPin
        ) {
          toast.error(
            'New PIN must be different.',
          );
          setNewPin('');
          return;
        }

        setStep('confirm');
        return;
      }

      if (confirmPin !== newPin) {
        toast.error('PINs do not match.');
        setConfirmPin('');
        return;
      }

      const result = isPurchase
        ? await changePurchasePin(
            currentPin,
            newPin,
          )
        : await changePin(
            currentPin,
            newPin,
          );

      if (!result.ok) {
        toast.error(
          result.error ||
            'Unable to change PIN.',
        );
        return;
      }

      toast.success(
        isPurchase
          ? 'Purchase PIN changed successfully.'
          : 'Login PIN changed successfully.',
      );

      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 px-0 backdrop-blur-sm sm:items-center sm:px-4"
        onClick={onClose}
      >
        <motion.div
          initial={{
            y: 30,
            opacity: 0,
          }}
          animate={{
            y: 0,
            opacity: 1,
          }}
          exit={{
            y: 30,
            opacity: 0,
          }}
          className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl dark:bg-slate-900 sm:rounded-3xl"
          onClick={e => e.stopPropagation()}
        >
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold">
                {isPurchase
                  ? 'Purchase PIN'
                  : 'Login PIN'}
              </h3>

              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {step === 'current'
                  ? 'Enter your current PIN'
                  : step === 'new'
                    ? `Enter your new ${pinLength}-digit PIN`
                    : 'Confirm your new PIN'}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="mb-6 flex items-center justify-center gap-2">
            {Array.from({
              length: pinLength,
            }).map((_, index) => (
              <div
                key={index}
                className={`flex h-12 w-9 items-center justify-center rounded-xl border text-xl font-bold ${
                  index < value.length
                    ? 'border-[#071B3A] bg-blue-50 text-[#071B3A] dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300'
                    : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800'
                }`}
              >
                {index < value.length
                  ? showPin
                    ? value[index]
                    : '•'
                  : ''}
              </div>
            ))}

            <button
              type="button"
              onClick={() =>
                setShowPin(v => !v)
              }
              className="ml-1 rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {showPin ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              '1',
              '2',
              '3',
              '4',
              '5',
              '6',
              '7',
              '8',
              '9',
            ].map(digit => (
              <button
                key={digit}
                type="button"
                disabled={loading}
                onClick={() =>
                  setValue(value + digit)
                }
                className="h-14 rounded-2xl border border-slate-200 bg-white text-xl font-semibold shadow-sm active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
              >
                {digit}
              </button>
            ))}

            <div />

            <button
              type="button"
              disabled={loading}
              onClick={() =>
                setValue(value + '0')
              }
              className="h-14 rounded-2xl border border-slate-200 bg-white text-xl font-semibold shadow-sm active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
            >
              0
            </button>

            <button
              type="button"
              disabled={loading || !value}
              onClick={() =>
                setValue(value.slice(0, -1))
              }
              className="h-14 rounded-2xl border border-slate-200 bg-white text-lg font-semibold shadow-sm active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
            >
              ⌫
            </button>
          </div>

          <button
            type="button"
            disabled={
              loading ||
              value.length !== pinLength
            }
            onClick={handleContinue}
            className="mt-5 w-full rounded-2xl bg-[#071B3A] px-4 py-3.5 font-semibold text-white shadow-lg disabled:opacity-50"
          >
            {loading
              ? 'Please wait...'
              : step === 'confirm'
                ? 'Save PIN'
                : 'Continue'}
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
