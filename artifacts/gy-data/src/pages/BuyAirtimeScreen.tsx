import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { useAppContext } from '../context/AppContext';
import SuccessModal from '@/components/SuccessModal';
import type { ReceiptData } from '@/components/TransactionReceipt';
import { toast } from 'sonner';
import PhoneInputWithContacts, { isValidNigerianNumber } from '@/components/PhoneInputWithContacts';

const networks = [
  { id: 'mtn',     name: 'MTN',     color: 'bg-[#FFCC00]', text: 'text-black' },
  { id: 'airtel',  name: 'Airtel',  color: 'bg-[#FF0000]', text: 'text-white' },
  { id: 'glo',     name: 'Glo',     color: 'bg-[#009900]', text: 'text-white' },
  { id: '9mobile', name: '9mobile', color: 'bg-[#006600]', text: 'text-white' },
];

const quickAmounts = [100, 200, 500, 1000, 2000, 5000];

export default function BuyAirtimeScreen() {
  const [, setLocation] = useLocation();
  const { purchaseAirtime, balance } = useAppContext();

  const [network, setNetwork] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successData, setSuccessData] = useState<ReceiptData | null>(null);

  // ── Idempotency key ───────────────────────────────────────────────────────
  // Generated once on first press and reused on retries for the same purchase
  // intent. Reset whenever any input changes so a genuinely different purchase
  // always gets a fresh key and therefore a fresh server-side transaction.
  const idempotencyKey = useRef<string | null>(null);
  useEffect(() => { idempotencyKey.current = null; }, [network, phone, amount]);

  const selectedNetwork = networks.find(n => n.id === network);
  const canProceed = network && isValidNigerianNumber(phone) && Number(amount) > 0;
  const numAmount = Number(amount);

  const handlePurchase = async () => {
    if (!canProceed || !selectedNetwork) return;
    if (balance < numAmount) {
      toast.error('Insufficient wallet balance. Please fund your wallet.');
      return;
    }

    // Generate a key the first time; reuse it on retries (network timeout, etc.)
    if (!idempotencyKey.current) {
      idempotencyKey.current = `GY-AIR-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    }

    setIsLoading(true);
    try {
      // Single server call: wallet debit + vendor purchase in one atomic operation.
      // The idempotency key ensures retries don't produce duplicate charges.
      const result = await purchaseAirtime({
        network: selectedNetwork.id,
        phone,
        amount: numAmount,
        idempotencyKey: idempotencyKey.current,
      });

      // Pending: server already knows about this transaction but hasn't settled it.
      if (result.pending) {
        toast.info('Transaction is being processed. Check your transaction history shortly.');
        return;
      }

      if (!result.success) {
        // previous_attempt_failed → the key's transaction already failed and the
        // wallet was compensated. Reset the key so a fresh press creates a new txn.
        if (result.error === 'previous_attempt_failed') {
          idempotencyKey.current = null;
          toast.error('Previous attempt failed. Tap "Pay" again to retry.');
        } else {
          toast.error(result.error ?? 'Transaction failed. Please try again.');
        }
        return;
      }

      // Success — clear the key; this purchase intent is complete.
      idempotencyKey.current = null;

      const now = new Date();
      setSuccessData({
        type: 'airtime',
        provider: selectedNetwork.name,
        service: 'Airtime',
        description: `${selectedNetwork.name} Airtime`,
        amount: numAmount,
        date: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        status: 'success',
        txnId: result.requestId,
        paymentMethod: 'Wallet',
      });
      setShowSuccess(true);
    } catch (err: unknown) {
      // Network-level error (fetch threw). The key is intentionally NOT cleared
      // so the next press retries with the same key — safe to retry.
      const msg = err instanceof Error ? err.message : 'Purchase failed';
      toast.error(msg.toLowerCase().includes('503') ? 'Service temporarily unavailable.' : msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-4 sm:p-6 max-w-md mx-auto min-h-screen bg-background relative flex flex-col"
    >
      <div className="flex items-center gap-3 mb-8 pt-2">
        <button
          onClick={() => setLocation('/')}
          className="w-10 h-10 bg-card rounded-full flex items-center justify-center border border-border active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Buy Airtime</h1>
      </div>

      <div className="space-y-6 flex-1 pb-48">
        {/* Network */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Select Network</h2>
          <div className="grid grid-cols-4 gap-3">
            {networks.map(n => (
              <button
                key={n.id}
                onClick={() => setNetwork(n.id)}
                className={`flex flex-col items-center gap-2 p-3 rounded-2xl border-2 transition-all active:scale-95 ${
                  network === n.id ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-border/80'
                }`}
              >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${n.color} ${n.text}`}>
                  {n.name[0]}
                </div>
                <span className="text-xs font-medium">{n.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Phone */}
        <PhoneInputWithContacts
          value={phone}
          onChange={setPhone}
          label="Phone Number"
        />

        {/* Amount */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Amount</h2>
          <input
            type="number"
            placeholder="Enter amount e.g. 500"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full bg-card border-2 border-border focus:border-primary rounded-xl h-14 px-4 text-xl font-bold outline-none transition-colors mb-3"
          />
          <div className="grid grid-cols-3 gap-2">
            {quickAmounts.map(amt => (
              <button
                key={amt}
                onClick={() => setAmount(amt.toString())}
                className={`py-2.5 rounded-xl text-sm border-2 font-semibold transition-all active:scale-95 ${
                  amount === amt.toString()
                    ? 'border-primary text-primary bg-primary/10'
                    : 'border-border bg-card text-muted-foreground hover:border-border/80'
                }`}
              >
                ₦{amt.toLocaleString()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Confirm panel — above BottomNav */}
      {canProceed && (
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-16 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-border shadow-[0_-4px_24px_rgba(14,29,70,0.08)] p-4 z-50 max-w-md mx-auto"
        >
          <div className="bg-card border border-border rounded-xl p-4 mb-3 text-sm">
            <div className="flex justify-between mb-2">
              <span className="text-muted-foreground">Network</span>
              <span className="font-semibold">{selectedNetwork?.name}</span>
            </div>
            <div className="flex justify-between mb-2">
              <span className="text-muted-foreground">Number</span>
              <span className="font-semibold">{phone}</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-border mt-1">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold text-primary text-base">₦{numAmount.toLocaleString()}</span>
            </div>
          </div>
          <Button
            className="w-full h-12 text-base rounded-xl font-bold"
            onClick={handlePurchase}
            disabled={isLoading}
          >
            {isLoading ? 'Processing…' : `Pay ₦${numAmount.toLocaleString()}`}
          </Button>
        </motion.div>
      )}

      {successData && (
        <SuccessModal
          open={showSuccess}
          onOpenChange={setShowSuccess}
          receipt={successData}
          onDone={() => setLocation('/')}
        />
      )}
    </motion.div>
  );
}
