import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface SuccessModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  details: { label: string; value: string }[];
  onDone: () => void;
}

export default function SuccessModal({ open, onOpenChange, title, details, onDone }: SuccessModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed inset-4 sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-[400px] bg-card border border-border z-50 rounded-3xl p-6 shadow-2xl flex flex-col items-center text-center my-auto h-fit max-h-[90vh] overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 20, delay: 0.1 }}
              className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6 text-green-500 mt-4"
            >
              <CheckCircle2 className="w-10 h-10" />
            </motion.div>
            
            <h2 className="text-2xl font-bold mb-6">{title}</h2>
            
            <div className="w-full bg-black/20 rounded-2xl p-4 mb-8 space-y-3">
              {details.map((detail, idx) => (
                <div key={idx} className="flex justify-between items-center text-sm">
                  <span className="text-muted-foreground">{detail.label}</span>
                  <span className="font-semibold">{detail.value}</span>
                </div>
              ))}
            </div>
            
            <Button 
              className="w-full h-12 text-lg rounded-xl mt-auto"
              onClick={() => {
                onOpenChange(false);
                onDone();
              }}
            >
              Done
            </Button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
