import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, User, Phone, Mail, CreditCard, Building2, Hash } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAppContext } from '../context/AppContext';

export default function PersonalInfoScreen() {
  const [, setLocation] = useLocation();
  const { user } = useAppContext();

  if (!user) return null;

  const fields = [
    { icon: User,      label: 'Full Name',       value: user.name },
    { icon: Phone,     label: 'Phone Number',     value: user.phone.replace(/(\d{4})(\d{3})(\d{4})/, '+234 $1 $2 $3').replace('+2340', '+234 0') },
    { icon: Mail,      label: 'Email Address',    value: user.email },
    { icon: CreditCard,label: 'Account Number',   value: user.accountNumber },
    { icon: Building2, label: 'Bank / Wallet',    value: user.bankName },
    { icon: Hash,      label: 'Referral Code',    value: user.referralCode },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-4 sm:p-6 max-w-md mx-auto min-h-screen bg-background pb-20"
    >
      <div className="flex items-center gap-3 mb-8 pt-2">
        <button
          onClick={() => setLocation('/')}
          className="w-10 h-10 bg-card rounded-full flex items-center justify-center border border-border"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold">Personal Information</h1>
      </div>

      {/* Avatar */}
      <div className="flex flex-col items-center mb-8">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary to-[#1B3A6B] flex items-center justify-center text-2xl font-bold text-white shadow-lg border-4 border-background mb-3">
          {user.firstName[0]}{user.lastName?.[0] ?? ''}
        </div>
        <p className="text-base font-semibold">{user.name}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{user.email}</p>
      </div>

      {/* Info fields */}
      <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border mb-6">
        {fields.map(({ icon: Icon, label, value }) => (
          <div key={label} className="flex items-center gap-3 p-4">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <Icon className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide mb-0.5">{label}</p>
              <p className="text-sm font-semibold truncate">{value}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground px-4">
        To update your personal details, please contact{' '}
        <span className="text-primary font-medium">support@gydata.ng</span>
      </p>
    </motion.div>
  );
}
