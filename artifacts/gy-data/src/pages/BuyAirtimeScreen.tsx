import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { useAppContext } from '../context/AppContext';
import SuccessModal from '@/components/SuccessModal';
import { toast } from 'sonner';
import { buyAirtime } from '@/lib/api';
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
  const { addTransaction, balance } = useAppContext();

  const [network, setNetwork] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successDetails, setSuccessDetails] = useState<Array<{ label: string; value: string }>>([]);

  const selectedNetwork = networks.find(n => n.id === network);
  const canProceed = network && isValidNigerianNumber(phone) && Number(amount) > 0;
  const numAmount = Number(amount);

  const handlePurchase = async () => {
    if (!canProceed || !selectedNetwork) return;
    if (balance < numAmount) {
      toast.error('Insufficient wallet balance. Please fund your wallet.');
      return;
    }
    setIsLoading(true);
    try {
      const result = await buyAirtime({
        network: selectedNetwork.id,
        phone,
        amount: numAmount,
      });

      if (!result.success) {
        toast.error(`Transaction ${result.status ?? 'failed'}. Please try again.`);
        return;
      }

      addTransaction({
        type: 'airtime',
        service: 'Airtime',
        provider: selectedNetwork.name,
        amount: numAmount,
        status: 'success',
        description: `${selectedNetwork.name} Airtime`,
        paymentMethod: 'Wallet',
      });

      setSuccessDetails([
        { label: 'Network',   value: selectedNetwork.name },
        { label: 'Number',    value: phone },
        { label: 'Amount',    value: `₦${numAmount.toLocaleString()}` },
        { label: 'Reference', value: result.requestId },
        { label: 'Status',    value: result.status ?? 'successful' },
      ]);
      setShowSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Purchase failed';
      toast.error(
        msg.toLowerCase().includes('credentials') || msg.includes('503')
          ? 'Service temporarily unavailable. Please try again later.'
          : msg,
      );
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

      <SuccessModal
        open={showSuccess}
        onOpenChange={setShowSuccess}
        title="Airtime Sent!"
        details={successDetails}
        onDone={() => setLocation('/')}
      />
    </motion.div>
  );
}
