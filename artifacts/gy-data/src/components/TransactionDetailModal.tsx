/**
 * TransactionDetailModal
 *
 * Bottom-sheet receipt viewer triggered when the user taps a transaction
 * notification. Looks up the transaction from AppContext by its UUID
 * and renders it with the existing TransactionReceipt component.
 *
 * Falls back gracefully with a plain message if the transaction is not
 * found in local state (e.g. session was cleared since the notification).
 */
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppContext } from '../context/AppContext';
import TransactionReceipt, { type ReceiptData } from './TransactionReceipt';

interface Props {
  open:          boolean;
  onClose:       () => void;
  transactionId: string;
}

export default function TransactionDetailModal({ open, onClose, transactionId }: Props) {
  const { transactions } = useAppContext();
  const txn = transactions.find(t => t.id === transactionId);

  const receipt: ReceiptData | null = txn
    ? {
        type:          txn.type,
        provider:      txn.provider,
        service:       txn.service,
        description:   txn.description,
        amount:        txn.amount,
        date:          txn.date,
        time:          txn.time,
        status:        txn.status,
        txnId:         txn.id,
        paymentMethod: txn.paymentMethod,
      }
    : null;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/65 z-50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ opacity: 0, y: 80 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 80 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-6 pt-2 max-w-md mx-auto"
          >
            {/* Drag handle */}
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full bg-white/30" />
            </div>

            {receipt ? (
              <TransactionReceipt
                receipt={receipt}
                onDone={onClose}
                doneLabel="Close"
                showActions
              />
            ) : (
              <div className="bg-card rounded-2xl p-8 text-center border border-border">
                <p className="text-muted-foreground text-sm mb-4">
                  Transaction details could not be loaded.
                </p>
                <button
                  onClick={onClose}
                  className="text-primary font-semibold text-sm"
                >
                  Close
                </button>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
