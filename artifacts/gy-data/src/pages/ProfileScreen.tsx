import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User,
  ShieldCheck,
  Lock,
  Fingerprint,
  HelpCircle,
  Info,
  LogOut,
  ChevronRight,
  Copy,
  X,
  Eye,
  EyeOff,
  CreditCard,
  AtSign,
  WalletCards,
  Settings,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

export default function ProfileScreen() {
  const {
    user,
    logout,
    verifyPin,
    changePin,
    verifyPurchasePin,
    changePurchasePin,
  } = useAppContext();

  const [, setLocation] = useLocation();

  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showPinModal, setShowPinModal] =
    useState<'login' | 'purchase' | null>(null);

  if (!user) return null;

  const handleLogout = async () => {
    setShowLogoutDialog(false);
    await logout();
    setLocation('/');
  };

  return (
    <div className="min-h-full bg-slate-50 pb-24 dark:bg-slate-950">
      <div className="mx-auto w-full max-w-[480px]">
        {/* Navy Header */}
        <div className="relative overflow-hidden rounded-b-[32px] bg-[#071B3A] px-5 pb-8 pt-6 text-white shadow-lg">
          <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full bg-blue-500/10" />
          <div className="absolute -left-20 bottom-[-70px] h-44 w-44 rounded-full bg-cyan-400/10" />

          <div className="relative">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-200">
                  Account
                </p>
                <h1 className="mt-1 text-2xl font-bold tracking-tight">
                  My Profile
                </h1>
              </div>

              <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/10 backdrop-blur">
                <Settings className="h-5 w-5 text-blue-100" />
              </div>
            </div>

            {/* User Card */}
            <div className="flex items-center gap-4">
              <div className="flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-full border-4 border-white/20 bg-white text-[#071B3A] shadow-xl">
                <User className="h-8 w-8" />
              </div>

              <div className="min-w-0 flex-1">
                <h2 className="truncate text-xl font-bold">
                  {user.name || user.username || 'User'}
                </h2>

                {user.username && (
                  <div className="mt-1 flex items-center gap-1.5 text-sm text-blue-200">
                    <AtSign className="h-3.5 w-3.5" />
                    <span className="truncate">{user.username}</span>
                  </div>
                )}

                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Account Active
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 pt-5">
          {/* Account section */}
          <SectionTitle title="Account" />

          <div className="space-y-3">
            <ProfileItem
              icon={<User className="h-5 w-5" />}
              title="Personal Information"
              description="View and update your personal details"
              onClick={() => setLocation('/profile/personal')}
            />

            <ProfileItem
              icon={<AtSign className="h-5 w-5" />}
              title="Change Username"
              description="Update your account username"
              onClick={() => setLocation('/profile/username')}
            />

            <ProfileItem
              icon={<CreditCard className="h-5 w-5" />}
              title="Bank Account"
              description="Manage your withdrawal bank account"
              onClick={() => setLocation('/profile/bank')}
            />

            <ProfileItem
              icon={<ShieldCheck className="h-5 w-5" />}
              title="KYC Verification"
              description="Manage your identity verification"
              onClick={() => setLocation('/profile/kyc')}
            />
          </div>

          {/* Security section */}
          <SectionTitle title="Security" />

          <div className="space-y-3">
            <ProfileItem
              icon={<Fingerprint className="h-5 w-5" />}
              title="Login PIN"
              description="Change your 6-digit login PIN"
              onClick={() => setShowPinModal('login')}
            />

            <ProfileItem
              icon={<Lock className="h-5 w-5" />}
              title="Purchase PIN"
              description="Set or change your 4-digit purchase PIN"
              onClick={() => setShowPinModal('purchase')}
            />
          </div>

          {/* More section */}
          <SectionTitle title="More" />

          <div className="space-y-3">
            <ProfileItem
              icon={<Copy className="h-5 w-5" />}
              title="Referral"
              description="View your referral information"
              onClick={() => setLocation('/profile/referral')}
            />

            <ProfileItem
              icon={<HelpCircle className="h-5 w-5" />}
              title="Support"
              description="Get help with your account"
              onClick={() => setLocation('/profile/support')}
            />

            <ProfileItem
              icon={<Info className="h-5 w-5" />}
              title="About"
              description="About GY DATA"
              onClick={() => setLocation('/profile/about')}
            />
          </div>

          {/* Wallet accent */}
          <div className="mt-5 flex items-center gap-3 rounded-2xl border border-blue-100 bg-gradient-to-r from-[#071B3A] to-[#0D2D5C] p-4 text-white shadow-md dark:border-blue-900/40">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white/10">
              <WalletCards className="h-5 w-5 text-blue-100" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-semibold">GY DATA Wallet</p>
              <p className="mt-0.5 text-xs text-blue-200">
                Manage your data, airtime and wallet services
              </p>
            </div>

            <ChevronRight className="h-5 w-5 text-blue-200" />
          </div>

          {/* Logout */}
          <button
            type="button"
            onClick={() => setShowLogoutDialog(true)}
            className="mt-5 flex w-full items-center gap-4 rounded-2xl border border-red-200 bg-white p-4 text-left shadow-sm transition-all hover:bg-red-50 active:scale-[0.99] dark:border-red-900/40 dark:bg-slate-900 dark:hover:bg-red-950/20"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/40">
              <LogOut className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="font-semibold text-red-600">Logout</p>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Sign out of your account
              </p>
            </div>

            <ChevronRight className="h-5 w-5 text-red-300" />
          </button>

          <p className="pb-5 pt-6 text-center text-xs text-slate-400">
            GY DATA • Secure Account
          </p>
        </div>
      </div>

      <AnimatePresence>
        {showLogoutDialog && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm"
            onClick={() => setShowLogoutDialog(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl dark:bg-slate-900"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-950/40">
                    <LogOut className="h-5 w-5" />
                  </div>

                  <h3 className="text-lg font-bold">Logout</h3>
                </div>

                <button
                  type="button"
                  onClick={() => setShowLogoutDialog(false)}
                  className="rounded-full p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <p className="text-sm text-slate-500 dark:text-slate-400">
                Are you sure you want to logout?
              </p>

              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowLogoutDialog(false)}
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
    </div>
  );
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div className="mb-3 mt-6 first:mt-0">
      <p className="px-1 text-xs font-bold uppercase tracking-[0.12em] text-[#071B3A] dark:text-blue-300">
        {title}
      </p>
    </div>
  );
}

function ProfileItem({
  icon,
  title,
  description,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-blue-200 hover:shadow-md active:scale-[0.99] dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#071B3A] text-white shadow-sm transition-transform group-hover:scale-105">
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="font-semibold text-slate-900 dark:text-white">
          {title}
        </p>

        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#071B3A] dark:text-slate-600 dark:group-hover:text-blue-300" />
    </button>
  );
}

type PinType = 'login' | 'purchase';

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
  ) => Promise<{ ok: boolean; error?: string }>;
  verifyPurchasePin: (pin: string) => Promise<boolean>;
  changePurchasePin: (
    currentPin: string,
    newPin: string,
  ) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [step, setStep] = useState<'current' | 'new' | 'confirm'>(
    type === 'purchase' ? 'new' : 'current',
  );

  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [loading, setLoading] = useState(false);

  const pinLength = type === 'purchase' ? 4 : 6;
  const title = type === 'purchase' ? 'Purchase PIN' : 'Login PIN';

  const activeValue =
    step === 'current'
      ? currentPin
      : step === 'new'
        ? newPin
        : confirmPin;

  const setActiveValue = (value: string) => {
    if (step === 'current') setCurrentPin(value);
    else if (step === 'new') setNewPin(value);
    else setConfirmPin(value);
  };

  const addDigit = (digit: string) => {
    if (activeValue.length >= pinLength) return;
    setActiveValue(activeValue + digit);
  };

  const removeDigit = () => {
    setActiveValue(activeValue.slice(0, -1));
  };

  const handleContinue = async () => {
    if (activeValue.length !== pinLength) {
      toast.error(`Enter a ${pinLength}-digit PIN.`);
      return;
    }

    setLoading(true);

    try {
      if (step === 'current') {
        const valid =
          type === 'purchase'
            ? await verifyPurchasePin(currentPin)
            : await verifyPin(currentPin);

        if (!valid) {
          toast.error('Current PIN is incorrect.');
          return;
        }

        setStep('new');
        return;
      }

      if (step === 'new') {
        if (type === 'login' && newPin === currentPin) {
          toast.error('New PIN must be different.');
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

      const result =
        type === 'purchase'
          ? await changePurchasePin(currentPin, newPin)
          : await changePin(currentPin, newPin);

      if (!result.ok) {
        toast.error(result.error || `Unable to change ${title}.`);
        return;
      }

      toast.success(`${title} changed successfully.`);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const maskedValue = showPin
    ? activeValue
    : '•'.repeat(activeValue.length);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 30, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 30, opacity: 0 }}
          className="w-full max-w-md rounded-t-3xl bg-white p-5 shadow-2xl dark:bg-slate-900 sm:rounded-3xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-[#071B3A] dark:text-white">
                {title}
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

          <div className="mb-6 flex items-center justify-center gap-3">
            {Array.from({ length: pinLength }).map((_, index) => (
              <div
                key={index}
                className={`flex h-12 w-10 items-center justify-center rounded-xl border text-2xl font-bold ${
                  index < activeValue.length
                    ? 'border-[#071B3A] bg-blue-50 text-[#071B3A] dark:border-blue-400 dark:bg-blue-950/30 dark:text-blue-300'
                    : 'bg-slate-50 dark:bg-slate-800'
                }`}
              >
                {index < activeValue.length ? maskedValue[index] : ''}
              </div>
            ))}

            <button
              type="button"
              onClick={() => setShowPin((value) => !value)}
              className="ml-1 rounded-xl p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label={showPin ? 'Hide PIN' : 'Show PIN'}
            >
              {showPin ? (
                <EyeOff className="h-5 w-5" />
              ) : (
                <Eye className="h-5 w-5" />
              )}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(
              (digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => addDigit(digit)}
                  disabled={loading}
                  className="h-14 rounded-2xl border border-slate-200 bg-white text-xl font-semibold text-slate-900 shadow-sm active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                >
                  {digit}
                </button>
              ),
            )}

            <div />

            <button
              type="button"
              onClick={() => addDigit('0')}
              disabled={loading}
              className="h-14 rounded-2xl border border-slate-200 bg-white text-xl font-semibold text-slate-900 shadow-sm active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              0
            </button>

            <button
              type="button"
              onClick={removeDigit}
              disabled={loading || !activeValue.length}
              className="h-14 rounded-2xl border border-slate-200 bg-white text-lg font-semibold shadow-sm active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800"
              aria-label="Delete digit"
            >
              ⌫
            </button>
          </div>

          <button
            type="button"
            onClick={handleContinue}
            disabled={loading || activeValue.length !== pinLength}
            className="mt-5 w-full rounded-2xl bg-[#071B3A] px-4 py-3.5 font-semibold text-white shadow-lg transition-all active:scale-[0.99] disabled:opacity-50"
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
