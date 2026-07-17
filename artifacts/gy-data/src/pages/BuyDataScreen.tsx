import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { useAppContext } from '../context/AppContext';
import SuccessModal from '@/components/SuccessModal';
import { toast } from 'sonner';

const networks = [
  { id: 'mtn', name: 'MTN', color: 'bg-[#FFCC00]', text: 'text-black' },
  { id: 'airtel', name: 'Airtel', color: 'bg-[#FF0000]', text: 'text-white' },
  { id: 'glo', name: 'Glo', color: 'bg-[#009900]', text: 'text-white' },
  { id: '9mobile', name: '9mobile', color: 'bg-[#006600]', text: 'text-white' },
];

const dataPlans = [
  { id: 'plan-1', size: '500MB', validity: '30 Days', price: 100 },
  { id: 'plan-2', size: '1GB', validity: '30 Days', price: 300 },
  { id: 'plan-3', size: '2GB', validity: '30 Days', price: 500 },
  { id: 'plan-4', size: '5GB', validity: '30 Days', price: 1500 },
  { id: 'plan-5', size: '10GB', validity: '30 Days', price: 2500 },
  { id: 'plan-6', size: '20GB', validity: '30 Days', price: 5000 },
];

export default function BuyDataScreen() {
  const [, setLocation] = useLocation();
  const { addTransaction, balance } = useAppContext();

  const [step, setStep] = useState(1);
  const [network, setNetwork] = useState('');
  const [phone, setPhone] = useState('');
  const [plan, setPlan] = useState<typeof dataPlans[0] | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const selectedNetwork = networks.find(n => n.id === network);

  const handlePurchase = () => {
    if (!plan || !selectedNetwork) return;
    if (balance < plan.price) {
      toast.error('Insufficient wallet balance. Please fund your wallet.');
      return;
    }
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      addTransaction({
        type: 'data',
        service: 'Data',
        provider: selectedNetwork.name,
        amount: plan.price,
        status: 'success',
        description: `${selectedNetwork.name} ${plan.size} Data`,
        paymentMethod: 'Wallet',
      });
      setShowSuccess(true);
    }, 1500);
  };

  const handleDone = () => {
    setLocation('/');
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-4 sm:p-6 max-w-md mx-auto min-h-screen bg-background relative"
    >
      <div className="flex items-center gap-3 mb-8 pt-2">
        <button
          onClick={() => {
            if (step > 1) setStep(step - 1);
            else setLocation('/');
          }}
          className="w-10 h-10 bg-card rounded-full flex items-center justify-center border border-border active:scale-95 transition-transform"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Buy Data</h1>
      </div>

      {/* Progress steps */}
      <div className="flex gap-1.5 mb-8">
        {[1, 2, 3, 4].map(s => (
          <div
            key={s}
            className={`h-1 rounded-full flex-1 transition-colors ${s <= step ? 'bg-primary' : 'bg-border'}`}
          />
        ))}
      </div>

      <div className="space-y-8 pb-48">
        {/* Step 1: Network Selection */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">1. Select Network</h2>
          <div className="grid grid-cols-4 gap-3">
            {networks.map(n => (
              <button
                key={n.id}
                onClick={() => {
                  setNetwork(n.id);
                  if (step === 1) setStep(2);
                }}
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

        {/* Step 2: Phone Number */}
        {step >= 2 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">2. Phone Number</h2>
            <div className="relative">
              <input
                type="tel"
                placeholder="e.g. 0803 123 4567"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                className="w-full bg-card border-2 border-border focus:border-primary rounded-xl h-14 px-4 pr-14 text-lg font-medium outline-none transition-colors"
              />
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 text-primary hover:bg-primary/10 rounded-lg transition-colors text-xs font-semibold"
                onClick={() => toast.info('Contact picker not available in browser')}
              >
                Contacts
              </button>
            </div>
            {phone.length >= 10 && step === 2 && (
              <Button className="w-full mt-4 h-12 rounded-xl" onClick={() => setStep(3)}>
                Continue
              </Button>
            )}
          </motion.div>
        )}

        {/* Step 3: Data Plan */}
        {step >= 3 && phone.length >= 10 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">3. Select Plan</h2>
            <div className="space-y-3">
              {dataPlans.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setPlan(p); setStep(4); }}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all active:scale-[0.98] ${
                    plan?.id === p.id ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-border/80'
                  }`}
                >
                  <div className="text-left">
                    <p className="font-bold text-lg">{p.size}</p>
                    <p className="text-xs text-muted-foreground">{p.validity} validity</p>
                  </div>
                  <p className="font-bold text-primary text-lg">₦{p.price.toLocaleString()}</p>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      {/* Step 4: Summary & Purchase — positioned above BottomNav */}
      {step >= 4 && plan && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="fixed bottom-16 left-0 right-0 bg-[#0A1628]/95 backdrop-blur-md border-t border-border p-4 z-50 max-w-md mx-auto"
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
            <div className="flex justify-between mb-2">
              <span className="text-muted-foreground">Plan</span>
              <span className="font-semibold">{plan.size} ({plan.validity})</span>
            </div>
            <div className="flex justify-between pt-2 border-t border-border mt-1">
              <span className="text-muted-foreground">Total</span>
              <span className="font-bold text-primary text-base">₦{plan.price.toLocaleString()}</span>
            </div>
          </div>
          <Button
            className="w-full h-12 text-base rounded-xl font-bold"
            onClick={handlePurchase}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : `Pay ₦${plan.price.toLocaleString()}`}
          </Button>
        </motion.div>
      )}

      <SuccessModal
        open={showSuccess}
        onOpenChange={setShowSuccess}
        title="Purchase Successful!"
        details={[
          { label: 'Network', value: selectedNetwork?.name ?? '' },
          { label: 'Plan', value: plan?.size ?? '' },
          { label: 'Validity', value: plan?.validity ?? '' },
          { label: 'Number', value: phone },
          { label: 'Amount', value: `₦${plan?.price.toLocaleString() ?? 0}` },
        ]}
        onDone={handleDone}
      />
    </motion.div>
  );
}
