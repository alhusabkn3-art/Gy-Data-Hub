import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, AtSign, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAppContext } from '../context/AppContext';
import { toast } from 'sonner';

const USERNAME_RE = /^[a-z]{4,15}$/;

export default function ChangeUsernameScreen() {
  const [, setLocation] = useLocation();
  const { user, checkUsernameAvailable, changeUsername } = useAppContext();

  const [newUsername, setNewUsername]       = useState('');
  const [checkStatus, setCheckStatus]       = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [isSaving,    setIsSaving]          = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!user) return null;

  // Cooldown calculation
  const usernameChangedAt = user.usernameChangedAt ? new Date(user.usernameChangedAt) : null;
  const THIRTY_DAYS_MS    = 30 * 24 * 60 * 60 * 1000;
  const onCooldown        = usernameChangedAt !== null && (Date.now() - usernameChangedAt.getTime()) < THIRTY_DAYS_MS;
  const nextChangeAt      = usernameChangedAt ? new Date(usernameChangedAt.getTime() + THIRTY_DAYS_MS) : null;

  const daysRemaining = nextChangeAt
    ? Math.ceil((nextChangeAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  // Auto-check username as the user types (debounced 600 ms)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const normalized = newUsername.toLowerCase().trim();
    if (!normalized) { setCheckStatus('idle'); return; }
    if (!USERNAME_RE.test(normalized)) { setCheckStatus('invalid'); return; }
    if (normalized === user.username) { setCheckStatus('idle'); return; }

    setCheckStatus('checking');
    debounceRef.current = setTimeout(async () => {
      const status = await checkUsernameAvailable(normalized);
      setCheckStatus(status === 'error' ? 'idle' : status);
    }, 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newUsername]);

  const handleSave = async () => {
    const normalized = newUsername.toLowerCase().trim();
    if (!USERNAME_RE.test(normalized)) {
      toast.error('Invalid username format.');
      return;
    }
    if (normalized === user.username) {
      toast.error('That is already your username.');
      return;
    }
    if (checkStatus !== 'available') {
      toast.error('Please wait for availability check.');
      return;
    }
    if (onCooldown) {
      toast.error('You cannot change your username yet.');
      return;
    }

    setIsSaving(true);
    const result = await changeUsername(normalized);
    setIsSaving(false);

    if (result.ok) {
      toast.success(`Username changed to @${normalized}`);
      setLocation('/');
    } else if (result.error === 'cooldown') {
      toast.error('Change not allowed yet — 30-day cooldown active.');
    } else if (result.error === 'username_taken') {
      setCheckStatus('taken');
      toast.error('That username was just taken. Try another.');
    } else {
      toast.error('Failed to change username. Please try again.');
    }
  };

  const borderColor =
    checkStatus === 'available' ? '#16a34a' :
    checkStatus === 'taken' || checkStatus === 'invalid' ? '#DC2626' :
    '#e2e8f0';

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-4 sm:p-6 max-w-md mx-auto min-h-screen bg-background pb-24"
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-8 pt-2">
        <button
          onClick={() => setLocation('/')}
          className="w-10 h-10 bg-card rounded-full flex items-center justify-center border border-border"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Change Username</h1>
      </div>

      {/* Current username card */}
      <div className="bg-primary/5 border border-primary/15 rounded-2xl p-4 flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <AtSign className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Current Username</p>
          <p className="text-base font-bold text-primary">@{user.username}</p>
        </div>
      </div>

      {/* Cooldown notice */}
      {onCooldown && nextChangeAt && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-2xl p-4 flex items-start gap-3 mb-6">
          <Clock className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-sm text-amber-700 dark:text-amber-400">Change not available yet</p>
            <p className="text-xs text-amber-600/80 mt-0.5">
              You can change your username again in <strong>{daysRemaining} day{daysRemaining !== 1 ? 's' : ''}</strong>
              {' '}(on {nextChangeAt.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}).
            </p>
          </div>
        </div>
      )}

      {/* New username input */}
      <div className="mb-6">
        <label className="block text-xs font-semibold mb-2 uppercase tracking-wider text-muted-foreground">
          New Username
        </label>
        <div className="relative flex items-center">
          <span className="absolute left-3.5 text-base font-bold select-none text-muted-foreground/70">@</span>
          <input
            type="text"
            value={newUsername}
            onChange={e => {
              const val = e.target.value.toLowerCase().replace(/[^a-z]/g, '').slice(0, 15);
              setNewUsername(val);
            }}
            placeholder={user.username}
            autoComplete="off"
            spellCheck={false}
            disabled={onCooldown}
            className="w-full h-12 rounded-xl text-sm font-semibold outline-none transition-all pl-8 pr-10 bg-card border disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ borderColor, borderWidth: '2px' }}
          />
          <div className="absolute right-3 pointer-events-none">
            {checkStatus === 'checking' && (
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
            {checkStatus === 'available' && <CheckCircle2 className="w-5 h-5 text-green-600" />}
            {(checkStatus === 'taken' || checkStatus === 'invalid') && <XCircle className="w-5 h-5 text-red-500" />}
          </div>
        </div>

        {/* Inline feedback */}
        <div className="mt-1.5 min-h-[18px]">
          {checkStatus === 'available' && newUsername !== user.username && (
            <p className="text-xs font-semibold text-green-600">✓ @{newUsername} is available</p>
          )}
          {checkStatus === 'taken' && (
            <p className="text-xs font-semibold text-red-500">@{newUsername} is already taken. Try another.</p>
          )}
          {checkStatus === 'invalid' && newUsername.length > 0 && (
            <p className="text-xs font-semibold text-red-500">4–15 letters only — no numbers, spaces or symbols.</p>
          )}
        </div>

        <ul className="mt-3 space-y-1">
          <li className="text-[11px] text-muted-foreground">• 4–15 letters only (A–Z)</li>
          <li className="text-[11px] text-muted-foreground">• No numbers, spaces or special characters</li>
          <li className="text-[11px] text-muted-foreground">• Can only be changed once every 30 days</li>
        </ul>
      </div>

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={
          isSaving ||
          onCooldown ||
          checkStatus !== 'available' ||
          !newUsername ||
          newUsername === user.username
        }
        className="w-full h-13 rounded-2xl font-bold text-white text-base transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
        style={{
          height: 52,
          background: 'linear-gradient(90deg, #0B1F4E 0%, #1D4ED8 60%, #2563EB 100%)',
          boxShadow: '0 6px 24px rgba(37,99,235,0.32)',
        }}
      >
        {isSaving ? 'Saving…' : 'Save New Username'}
      </button>
    </motion.div>
  );
}
