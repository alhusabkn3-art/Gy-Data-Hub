// artifacts/gy-data/src/admin/pages/SuperAdminLoginScreen.tsx

import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  ShieldCheck,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';

import { toast } from 'sonner';

import {
  useAdminContext,
} from '../context/AdminContext';

const PIN_LENGTH = 4;

export default function SuperAdminLoginScreen() {
  const {
    adminLogin,
    adminLogout,
    isAdminLoggedIn,
    isSuperAdmin,
  } = useAdminContext();

  const [email, setEmail] =
    useState('');

  const [pin, setPin] =
    useState('');

  const [showPin, setShowPin] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const pinInputRef =
    useRef<HTMLInputElement>(null);

  const submittedRef =
    useRef(false);

  useEffect(() => {
    if (
      isAdminLoggedIn &&
      !isSuperAdmin
    ) {
      adminLogout();

      toast.error(
        'Super Admin credentials are required.',
      );
    }
  }, [
    isAdminLoggedIn,
    isSuperAdmin,
    adminLogout,
  ]);

  function focusPin(): void {
    window.setTimeout(() => {
      pinInputRef.current?.focus();
    }, 0);
  }

  async function submitLogin(): Promise<void> {
    if (loading || submittedRef.current) {
      return;
    }

    const cleanEmail =
      email
        .trim()
        .toLowerCase();

    const cleanPin =
      pin.trim();

    if (!cleanEmail) {
      toast.error(
        'Enter Super Admin email.',
      );
      return;
    }

    if (!cleanPin) {
      toast.error(
        'Enter Super Admin PIN.',
      );

      focusPin();
      return;
    }

    if (
      cleanPin.length !== PIN_LENGTH
    ) {
      toast.error(
        `PIN must be ${PIN_LENGTH} digits.`,
      );

      focusPin();
      return;
    }

    if (!/^\d+$/.test(cleanPin)) {
      toast.error(
        'PIN must contain digits only.',
      );

      setPin(
        cleanPin.replace(/\D/g, ''),
      );

      focusPin();
      return;
    }

    submittedRef.current = true;
    setLoading(true);

    try {
      const ok =
        await adminLogin(
          cleanEmail,
          cleanPin,
        );

      if (!ok) {
        submittedRef.current = false;

        toast.error(
          'Invalid Super Admin credentials.',
        );

        setPin('');
        focusPin();

        return;
      }

      toast.success(
        'Super Admin login successful.',
      );
    } catch {
      submittedRef.current = false;

      toast.error(
        'Unable to login. Please try again.',
      );

      setPin('');
      focusPin();
    } finally {
      setLoading(false);
    }
  }

  function handleEmailKeyDown(
    event: React.KeyboardEvent<HTMLInputElement>,
  ): void {
    if (event.key === 'Enter') {
      event.preventDefault();

      if (!email.trim()) {
        toast.error(
          'Enter Super Admin email.',
        );

        return;
      }

      focusPin();
    }
  }

  function handlePinChange(
    event: React.ChangeEvent<HTMLInputElement>,
  ): void {
    const digitsOnly =
      event.target.value
        .replace(/\D/g, '')
        .slice(0, PIN_LENGTH);

    setPin(digitsOnly);

    /*
     * Automatically submit as soon as
     * all required PIN digits are entered.
     */
    if (
      digitsOnly.length === PIN_LENGTH &&
      email.trim()
    ) {
      void submitLogin();
    }
  }

  return (
    <div className="min-h-screen bg-[#061326] flex items-center justify-center p-5">
      <div className="w-full max-w-md bg-[#0D1F3C] border border-white/10 rounded-3xl p-7 shadow-2xl">
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
        </div>

        <div className="text-center mb-7">
          <h1 className="text-xl font-bold text-white">
            Super Admin
          </h1>

          <p className="text-sm text-white/40 mt-2">
            Sign in to manage GY DATA.
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submitLogin();
          }}
          className="space-y-4"
        >
          {/* Email */}
          <div>
            <label
              htmlFor="super-admin-email"
              className="text-xs text-white/45"
            >
              Email
            </label>

            <input
              id="super-admin-email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(event) =>
                setEmail(
                  event.target.value,
                )
              }
              onKeyDown={
                handleEmailKeyDown
              }
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50"
              placeholder="admin@example.com"
              disabled={loading}
            />
          </div>

          {/* PIN */}
          <div>
            <label
              htmlFor="super-admin-pin"
              className="text-xs text-white/45"
            >
              PIN
            </label>

            <div className="relative mt-1">
              <input
                ref={pinInputRef}
                id="super-admin-pin"
                type={
                  showPin
                    ? 'text'
                    : 'password'
                }
                inputMode="numeric"
                pattern="[0-9]*"
                autoComplete="current-password"
                maxLength={PIN_LENGTH}
                value={pin}
                onChange={
                  handlePinChange
                }
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-sm tracking-[0.35em] text-white outline-none focus:border-primary/50"
                placeholder="••••"
                disabled={loading}
                aria-label="Super Admin PIN"
              />

              <button
                type="button"
                tabIndex={-1}
                onClick={() =>
                  setShowPin(
                    (value) => !value,
                  )
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
                aria-label={
                  showPin
                    ? 'Hide PIN'
                    : 'Show PIN'
                }
              >
                {showPin ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>

            <p className="mt-2 text-[11px] text-white/30">
              Enter your 4-digit PIN. Login starts automatically.
            </p>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={
              loading ||
              !email.trim() ||
              pin.length !== PIN_LENGTH
            }
            className="w-full py-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && (
              <Loader2 className="w-4 h-4 animate-spin" />
            )}

            {loading
              ? 'Signing in...'
              : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
