import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, ShieldCheck, ShieldAlert, Clock, CheckCircle2, Circle, Upload, FileText, Camera } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAppContext } from '../context/AppContext';

export default function KYCScreen() {
  const [, setLocation] = useLocation();
  const { user } = useAppContext();

  if (!user) return null;

  const isVerified = user.kycStatus === 'verified';
  const isPending  = user.kycStatus === 'pending';

  const steps = [
    {
      icon: FileText,
      title: 'Personal Details',
      desc: 'Name, phone number, and email address',
      done: true,
    },
    {
      icon: Camera,
      title: 'Government ID',
      desc: "NIN slip, Driver's license, or International passport",
      done: isVerified || isPending,
    },
    {
      icon: Upload,
      title: 'Selfie Verification',
      desc: 'A clear photo of your face for identity matching',
      done: isVerified,
    },
    {
      icon: ShieldCheck,
      title: 'Review & Approval',
      desc: 'Our team reviews your documents within 24 hours',
      done: isVerified,
    },
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
        <h1 className="text-xl font-bold">KYC Verification</h1>
      </div>

      {/* Status banner */}
      {isVerified ? (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-500/10 border border-green-500/30 mb-8">
          <ShieldCheck className="w-8 h-8 text-green-500 flex-shrink-0" />
          <div>
            <p className="font-bold text-green-600 text-sm">Fully Verified</p>
            <p className="text-xs text-muted-foreground mt-0.5">Your identity has been verified. Enjoy full access to all features.</p>
          </div>
        </div>
      ) : isPending ? (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 mb-8">
          <Clock className="w-8 h-8 text-yellow-500 flex-shrink-0" />
          <div>
            <p className="font-bold text-yellow-600 text-sm">Verification Pending</p>
            <p className="text-xs text-muted-foreground mt-0.5">Your documents are under review. This usually takes up to 24 hours.</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-400/30 mb-8">
          <ShieldAlert className="w-8 h-8 text-red-400 flex-shrink-0" />
          <div>
            <p className="font-bold text-red-500 text-sm">Not Verified</p>
            <p className="text-xs text-muted-foreground mt-0.5">Complete KYC to unlock higher transaction limits and premium features.</p>
          </div>
        </div>
      )}

      {/* Steps */}
      <h2 className="text-xs font-semibold text-muted-foreground mb-4 px-1 uppercase tracking-wider">Verification Steps</h2>
      <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border mb-8">
        {steps.map(({ icon: Icon, title, desc, done }, i) => (
          <div key={i} className="flex items-center gap-3 p-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-green-500/15 text-green-500' : 'bg-muted text-muted-foreground'}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${done ? '' : 'text-muted-foreground'}`}>{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
            {done
              ? <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
              : <Circle className="w-5 h-5 text-border flex-shrink-0" />
            }
          </div>
        ))}
      </div>

      {!isVerified && (
        <button
          onClick={() => {}}
          className="w-full h-14 rounded-2xl bg-primary text-white font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors active:scale-[0.98]"
        >
          <Upload className="w-5 h-5" />
          {isPending ? 'Verification In Progress…' : 'Start KYC Verification'}
        </button>
      )}

      {!isVerified && (
        <p className="text-center text-xs text-muted-foreground mt-4 px-4">
          Full KYC verification coming soon. Contact{' '}
          <span className="text-primary font-medium">support@gydata.ng</span> to verify manually.
        </p>
      )}
    </motion.div>
  );
}
