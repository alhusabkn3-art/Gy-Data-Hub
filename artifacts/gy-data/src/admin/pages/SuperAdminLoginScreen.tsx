// artifacts/gy-data/src/admin/pages/SuperAdminLoginScreen.tsx

import React, {
  useEffect,
  useState,
} from 'react';
import {
  ShieldCheck,
  Eye,
  EyeOff,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAdminContext } from '../context/AdminContext';

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

  async function submit(
    event: React.FormEvent,
  ) {
    event.preventDefault();

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
      return;
    }

    setLoading(true);

    try {
      const ok =
        await adminLogin(
          cleanEmail,
          cleanPin,
        );

      if (!ok) {
        toast.error(
          'Invalid Super Admin credentials.',
        );
        return;
      }

      toast.success(
        'Super Admin login successful.',
      );
    } catch {
      toast.error(
        'Unable to login. Please try again.',
      );
    } finally {
      setLoading(false);
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
          onSubmit={submit}
          className="space-y-4"
        >
          <div>
            <label className="text-xs text-white/45">
              Email
            </label>

            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={event =>
                setEmail(
                  event.target.value,
                )
              }
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white outline-none focus:border-primary/50"
              placeholder="admin@example.com"
            />
          </div>

          <div>
            <label className="text-xs text-white/45">
              PIN
            </label>

            <div className="relative mt-1">
              <input
                type={
                  showPin
                    ? 'text'
                    : 'password'
                }
                inputMode="numeric"
                autoComplete="current-password"
                value={pin}
                onChange={event =>
                  setPin(
                    event.target.value,
                  )
                }
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-12 text-sm text-white outline-none focus:border-primary/50"
                placeholder="Enter PIN"
              />

              <button
                type="button"
                onClick={() =>
                  setShowPin(
                    value => !value,
                  )
                }
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white"
              >
                {showPin ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
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
