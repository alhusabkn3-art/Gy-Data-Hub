import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import TransactionReceipt, { ReceiptData } from './TransactionReceipt';

interface SuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  receipt: ReceiptData;
  onDone: () => void;
}

export default function SuccessModal({ open, onOpenChange, receipt, onDone }: SuccessModalProps) {
  const handleDone = () => {
    onOpenChange(false);
    onDone();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/65 z-50 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />

          {/* Sheet — slides up from bottom on mobile, centers on desktop */}
          <motion.div
            initial={{ opacity: 0, y: 60 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 60 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[400px] z-50 px-4 pb-6 pt-4 sm:px-0 sm:pb-0 sm:pt-0"
          >
            <TransactionReceipt
              receipt={receipt}
              onDone={handleDone}
              showActions
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Re-export ReceiptData so callers can import from one place
export type { ReceiptData };
