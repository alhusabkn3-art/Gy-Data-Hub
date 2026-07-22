/**
 * FundWalletModal
 *
 * Bottom-sheet for wallet funding via Monnify (card / bank transfer).
 *
 * Flow:
 *   1. User selects or enters an amount (min ₦100).
 *   2. "Pay with Card / Bank Transfer" button calls the backend to initialize
 *      a Monnify payment — a pending transaction record is created server-side.
 *   3. The Monnify checkout page opens in a new browser tab.
 *   4. Modal enters "waiting" state and polls the status endpoint every 5 s.
 *   5. When the backend confirms paymentStatus === 'PAID' (server-side
 *      verification with Monnify), the wallet is credited and the success
 *      screen is shown.
 *
 * Security: wallet is never credited based on a frontend callback — only after
 * the backend verifies the payment with Monnify directly.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, CreditCard, Loader2, CheckCircle2, AlertCircle,
  ExternalLink, RefreshCw, Clock,
} from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { toast } from 'sonner';

// ── Types ─────────────────────────────────────────────────────────────────────

type Phase = 'amount' | 'initializing' | 'waiting' | 'success' | 'failed';

const QUICK_AMOUNTS = [500, 1_000, 2_000, 5_000];
const MIN_AMOUNT    = 100;
const POLL_INTERVAL = 5_000;  // 5 seconds
const MAX_POLLS     = 120;    // 10 minutes

// ── Component ─────────────────────────────────────────────────────────────────

export default function FundWalletModal({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const { user, refreshWallet } = useAppContext();

  const [phase,        setPhase]        = useState<Phase>('amount');
  const [amount,       setAmount]       = useState('');
  const [errorMsg,     setErrorMsg]     = useState('');
  const [reference,    setReference]    = useState('');
  const [newBalance,   setNewBalance]   = useState<number | null>(null);

  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollCountRef = useRef(0);

  // Guard — modal only renders when logged in
  if (!user) return null;

  // ── Polling ────────────────────────────────────────────────────────────────

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Clean up on unmount
  useEffect(() => () => stopPolling(), [stopPolling]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        stopPolling();
        setPhase('amount');
        setAmount('');
        setErrorMsg('');
        setReference('');
        setNewBalance(null);
        pollCountRef.current = 0;
      }, 300);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open, stopPolling]);

  const startPolling = useCallback((ref: string) => {
    pollCountRef.current = 0;

    pollRef.current = setInterval(async () => {
      pollCountRef.current++;

      if (pollCountRef.current > MAX_POLLS) {
        stopPolling();
        setPhase('failed');
        setErrorMsg(
          'Payment verification timed out. If you completed payment, ' +
          'your balance will update automatically within a few minutes.',
        );
        return;
      }

      try {
        const res = await fetch(
          `/api/payment/monnify/status/${encodeURIComponent(ref)}`,
          { credentials: 'include' },
        );
        if (!res.ok) return; // transient error — keep polling

        const data = await res.json() as {
          status: 'pending' | 'success' | 'failed';
          balance?: string;
        };

        if (data.status === 'success') {
          stopPolling();
          if (data.balance != null) setNewBalance(parseFloat(data.balance));
          await refreshWallet();
          setPhase('success');
        } else if (data.status === 'failed') {
          stopPolling();
          setPhase('failed');
          setErrorMsg('Payment was not completed. Please try again.');
        }
        // 'pending' → keep polling
      } catch {
        // Network error — keep polling silently
      }
    }, POLL_INTERVAL);
  }, [stopPolling, refreshWallet]);

  // ── Initiate payment ───────────────────────────────────────────────────────

  const handlePay = async () => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < MIN_AMOUNT) {
      toast.error(`Minimum funding amount is ₦${MIN_AMOUNT.toLocaleString()}`);
      return;
    }

    setPhase('initializing');
    setErrorMsg('');

    try {
      const res = await fetch('/api/payment/monnify/initialize', {
        method:      'POST',
        credentials: 'include',
        headers:     { 'Content-Type': 'application/json' },
        body:        JSON.stringify({ amount: numericAmount }),
      });

      const data = await res.json() as {
        ok?:          boolean;
        checkoutUrl?: string;
        reference?:   string;
        error?:       string;
      };

      if (!res.ok || !data.ok || !data.checkoutUrl || !data.reference) {
        throw new Error(data.error ?? 'Failed to initialize payment.');
      }

      // Open Monnify checkout in a new tab
      window.open(data.checkoutUrl, '_blank', 'noopener,noreferrer');

      setReference(data.reference);
      setPhase('waiting');
      startPolling(data.reference);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Something went wrong. Please try again.';
      setPhase('failed');
      setErrorMsg(msg);
    }
  };

  // ── Re-open checkout ───────────────────────────────────────────────────────

  const handleCheckStatus = async () => {
    if (!reference) return;
    try {
      const res  = await fetch(
        `/api/payment/monnify/status/${encodeURIComponent(reference)}`,
        { credentials: 'include' },
      );
      const data = await res.json() as { status: string; balance?: string };
      if (data.status === 'success') {
        stopPolling();
        if (data.balance != null) setNewBalance(parseFloat(data.balance));
        await refreshWallet();
        setPhase('success');
      } else if (data.status === 'pending') {
        toast.info('Payment not yet confirmed. We\'ll notify you when it\'s done.');
      } else {
        toast.error('Payment could not be verified.');
      }
    } catch {
      toast.error('Could not check status. Please try again.');
    }
  };

  // ── Close & reset ──────────────────────────────────────────────────────────

  const closeAndReset = () => {
    if (phase === 'waiting') {
      // Don't kill polling — it continues in background while modal is closed
      // (component is re-mounted when opened again)
    }
    onOpenChange(false);
  };

  // ── Amount input validation ────────────────────────────────────────────────

  const numericAmount = Number(amount);
  const amountValid   = Number.isFinite(numericAmount) && numericAmount >= MIN_AMOUNT;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            onClick={phase === 'waiting' ? undefined : closeAndReset}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-white border-t border-border shadow-[0_-4px_32px_rgba(14,29,70,0.12)] z-50 rounded-t-3xl overflow-hidden max-w-md mx-auto"
          >
            {/* ── Success ─────────────────────────────────────────────────── */}
            {phase === 'success' && (
              <div className="p-8 flex flex-col items-center justify-center text-center py-14">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 20 }}
                  className="w-24 h-24 bg-green-500/15 rounded-full flex items-center justify-center mb-6 text-green-500"
                >
                  <CheckCircle2 className="w-12 h-12" />
                </motion.div>
                <h2 className="text-2xl font-bold mb-2">Payment Successful!</h2>
                <p className="text-muted-foreground mb-2">
                  ₦{numericAmount.toLocaleString()} has been added to your wallet.
                </p>
                {newBalance != null && (
                  <p className="text-sm text-primary font-semibold mb-8">
                    New balance: ₦{newBalance.toLocaleString('en-NG', { minimumFractionDigits: 2 })}
                  </p>
                )}
                <button
                  onClick={closeAndReset}
                  className="w-full bg-primary text-white h-12 rounded-xl font-bold"
                >
                  Done
                </button>
              </div>
            )}

            {/* ── Failed ──────────────────────────────────────────────────── */}
            {phase === 'failed' && (
              <div className="p-8 flex flex-col items-center justify-center text-center py-12">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mb-6 text-red-500">
                  <AlertCircle className="w-10 h-10" />
                </div>
                <h2 className="text-xl font-bold mb-2">Payment Unsuccessful</h2>
                <p className="text-muted-foreground text-sm mb-8 max-w-xs">
                  {errorMsg || 'Your payment could not be completed. Please try again.'}
                </p>
                <button
                  onClick={() => { setPhase('amount'); setErrorMsg(''); }}
                  className="w-full bg-primary text-white h-12 rounded-xl font-bold mb-3"
                >
                  Try Again
                </button>
                <button
                  onClick={closeAndReset}
                  className="text-sm text-muted-foreground hover:text-foreground"
                >
                  Close
                </button>
              </div>
            )}

            {/* ── Waiting for payment ──────────────────────────────────────── */}
            {phase === 'waiting' && (
              <div className="p-8 flex flex-col items-center justify-center text-center py-12">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mb-6">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 2, ease: 'linear' }}
                  >
                    <Loader2 className="w-10 h-10 text-primary" />
                  </motion.div>
                </div>

                <h2 className="text-xl font-bold mb-2">Awaiting Payment</h2>
                <p className="text-muted-foreground text-sm mb-2">
                  Complete your payment of{' '}
                  <span className="font-semibold text-foreground">
                    ₦{numericAmount.toLocaleString()}
                  </span>{' '}
                  in the tab that just opened.
                </p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-8">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Checking every 5 seconds automatically</span>
                </div>

                <div className="w-full space-y-3">
                  <button
                    onClick={handleCheckStatus}
                    className="w-full flex items-center justify-center gap-2 bg-primary text-white h-12 rounded-xl font-semibold"
                  >
                    <RefreshCw className="w-4 h-4" />
                    I've Completed Payment
                  </button>
                  <button
                    onClick={closeAndReset}
                    className="w-full text-sm text-muted-foreground hover:text-foreground py-2"
                  >
                    Cancel &amp; Close
                  </button>
                </div>
              </div>
            )}

            {/* ── Initializing ────────────────────────────────────────────── */}
            {phase === 'initializing' && (
              <div className="p-8 flex flex-col items-center justify-center text-center py-16">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                  className="text-primary mb-6"
                >
                  <Loader2 className="w-12 h-12" />
                </motion.div>
                <p className="font-semibold text-foreground">Preparing checkout…</p>
                <p className="text-sm text-muted-foreground mt-1">This will only take a moment.</p>
              </div>
            )}

            {/* ── Amount selection ─────────────────────────────────────────── */}
            {phase === 'amount' && (
              <div className="p-6">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">Fund Wallet</h2>
                  <button
                    onClick={closeAndReset}
                    className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Amount selector */}
                <div className="mb-6">
                  <p className="text-sm font-medium mb-3 text-muted-foreground">
                    Select or enter amount (min ₦{MIN_AMOUNT.toLocaleString()}):
                  </p>
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {QUICK_AMOUNTS.map(val => (
                      <button
                        key={val}
                        onClick={() => setAmount(val.toString())}
                        className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                          amount === val.toString()
                            ? 'bg-primary/10 border-primary text-primary'
                            : 'bg-card border-border hover:bg-black/5 text-foreground'
                        }`}
                      >
                        ₦{val >= 1_000 ? `${val / 1_000}k` : val}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    value={amount}
                    onChange={e => setAmount(e.target.value)}
                    placeholder="Custom amount"
                    min={MIN_AMOUNT}
                    className="w-full bg-card border border-border rounded-xl px-4 py-3 outline-none focus:border-primary text-base"
                  />
                </div>

                {/* Monnify payment button */}
                <button
                  onClick={handlePay}
                  disabled={!amountValid}
                  className="w-full flex items-center justify-center gap-2.5 bg-primary text-white h-13 py-3.5 rounded-xl font-bold text-base disabled:opacity-40 disabled:cursor-not-allowed transition-opacity mb-3"
                >
                  <CreditCard className="w-5 h-5" />
                  Pay ₦{amountValid ? numericAmount.toLocaleString() : '0'} — Card or Bank Transfer
                  <ExternalLink className="w-4 h-4 opacity-70" />
                </button>

                {/* Monnify badge */}
                <p className="text-center text-xs text-muted-foreground mt-3">
                  Secured by{' '}
                  <span className="font-semibold text-foreground">Monnify</span>
                  {' '}· 256-bit SSL encryption
                </p>

                {/* Divider */}
                <div className="flex items-center gap-3 my-5">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground">or transfer manually</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {/* Manual bank transfer details */}
                <div className="bg-muted/40 border border-border rounded-2xl p-4">
                  <p className="text-xs text-muted-foreground mb-3 font-medium uppercase tracking-wide">
                    Bank Transfer Details
                  </p>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Bank</span>
                      <span className="font-medium">{user.bankName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Account Number</span>
                      <span className="font-mono font-semibold tracking-wider">{user.accountNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Account Name</span>
                      <span className="font-medium">GY DATA / {user.name}</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-3">
                    Manual transfers may take up to 5 minutes to reflect.
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
