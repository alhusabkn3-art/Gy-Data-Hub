import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, Check, CheckCircle2 } from 'lucide-react';
import { useAppContext } from '../context/AppContext';
import { toast } from 'sonner';

export default function FundWalletModal({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const { user, fundWallet } = useAppContext();
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(user.accountNumber);
    setCopied(true);
    toast.success('Account number copied');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFund = () => {
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) return;
    
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      fundWallet(Number(amount));
      setShowSuccess(true);
    }, 1500);
  };

  const closeAndReset = () => {
    onOpenChange(false);
    setTimeout(() => {
      setShowSuccess(false);
      setAmount('');
    }, 300);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            onClick={closeAndReset}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-white border-t border-border shadow-[0_-4px_32px_rgba(14,29,70,0.10)] z-50 rounded-t-3xl overflow-hidden max-w-md mx-auto"
          >
            {showSuccess ? (
              <div className="p-8 flex flex-col items-center justify-center text-center py-12">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 20 }}
                  className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center mb-6 text-green-500"
                >
                  <CheckCircle2 className="w-12 h-12" />
                </motion.div>
                <h2 className="text-2xl font-bold mb-2">Funding Successful!</h2>
                <p className="text-muted-foreground mb-8">
                  ₦{Number(amount).toLocaleString()} has been added to your wallet.
                </p>
                <button 
                  onClick={closeAndReset}
                  className="w-full bg-primary text-white h-12 rounded-xl font-bold"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="p-6">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-xl font-bold">Fund Wallet</h2>
                  <button 
                    onClick={closeAndReset}
                    className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Bank Transfer Details */}
                <div className="bg-card border border-border rounded-2xl p-5 mb-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Bank Name</p>
                      <p className="font-semibold">{user.bankName}</p>
                    </div>
                    <div className="w-8 h-8 bg-orange-500/20 rounded-lg flex items-center justify-center">
                      <span className="text-orange-500 font-bold text-xs">GTB</span>
                    </div>
                  </div>
                  
                  <div className="mb-4">
                    <p className="text-xs text-muted-foreground mb-1">Account Number</p>
                    <div className="flex items-center justify-between bg-black/5 p-3 rounded-xl border border-border">
                      <p className="font-mono text-xl tracking-wider">{user.accountNumber}</p>
                      <button 
                        onClick={handleCopy}
                        className="p-2 bg-primary/20 text-primary rounded-lg hover:bg-primary/30 transition-colors"
                      >
                        {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Account Name</p>
                    <p className="font-semibold text-sm">GY DATA / {user.name}</p>
                  </div>
                </div>

                <div className="text-center mb-6">
                  <p className="text-xs text-muted-foreground">Transfers reflect automatically within 5 minutes</p>
                </div>

                {/* Quick amount test area */}
                <div className="border-t border-border pt-6">
                  <p className="text-sm font-medium mb-3">Or simulate funding (Demo):</p>
                  <div className="grid grid-cols-4 gap-2 mb-4">
                    {[500, 1000, 2000, 5000].map(val => (
                      <button
                        key={val}
                        onClick={() => setAmount(val.toString())}
                        className={`py-2 rounded-lg text-sm border transition-colors ${amount === val.toString() ? 'bg-primary/20 border-primary text-primary' : 'bg-card border-border hover:bg-black/5'}`}
                      >
                        ₦{val}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="number" 
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="Custom Amount"
                      className="flex-1 bg-card border border-border rounded-xl px-4 py-3 outline-none focus:border-primary"
                    />
                    <button 
                      onClick={handleFund}
                      disabled={!amount || isLoading}
                      className="bg-primary text-white px-6 rounded-xl font-bold disabled:opacity-50 min-w-[120px]"
                    >
                      {isLoading ? 'Processing...' : 'Fund'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
