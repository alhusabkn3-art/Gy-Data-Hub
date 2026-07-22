import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Mail, MessageCircle, Phone, ChevronRight, AlertTriangle, HelpCircle, ExternalLink } from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';

const faqs = [
  {
    q: 'How do I fund my wallet?',
    a: 'Go to the Wallet tab and tap "Fund Wallet". You can fund via bank transfer to your GY DATA account number.',
  },
  {
    q: 'Why is my transaction pending?',
    a: "Pending transactions are being processed by the vendor. Most complete within 5 minutes. If it stays pending beyond 30 minutes, contact support.",
  },
  {
    q: 'I was debited but the service wasn\'t delivered.',
    a: 'If a vendor-side failure occurs, your wallet is automatically reversed. If your balance wasn\'t restored within 5 minutes, contact support with your transaction ID.',
  },
  {
    q: 'How do I change my PIN?',
    a: 'Go to Profile → Change Login PIN or Change Purchase PIN. You\'ll need your current PIN to proceed.',
  },
  {
    q: 'I forgot my PIN.',
    a: 'On the login screen, tap "Forgot PIN?" and follow the OTP verification steps to reset it.',
  },
];

export default function SupportScreen() {
  const [, setLocation] = useLocation();
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const channels = [
    {
      icon: Mail,
      label: 'Email Support',
      sub: 'support@gydata.ng',
      action: () => window.open('mailto:support@gydata.ng?subject=GY DATA Support'),
    },
    {
      icon: MessageCircle,
      label: 'WhatsApp Chat',
      sub: '+234 800 GYDATA',
      action: () => window.open('https://wa.me/2348009432822'),
    },
    {
      icon: Phone,
      label: 'Call Support',
      sub: '+234 800 GYDATA · Mon–Sat 8am–8pm',
      action: () => window.open('tel:+2348009432822'),
    },
  ];

  const reportProblem = () => {
    window.open('mailto:support@gydata.ng?subject=Problem Report&body=Describe your issue here:%0A%0ATransaction ID (if applicable):%0ADevice:%0ADate / Time:');
    toast.success('Opening email to report your problem…');
  };

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
        <h1 className="text-xl font-bold">Help & Support</h1>
      </div>

      {/* Contact channels */}
      <h2 className="text-xs font-semibold text-muted-foreground mb-3 px-1 uppercase tracking-wider">Contact Us</h2>
      <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border mb-6">
        {channels.map(({ icon: Icon, label, sub, action }) => (
          <button
            key={label}
            onClick={action}
            className="w-full flex items-center justify-between p-4 hover:bg-black/5 active:bg-black/8 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Icon className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
              </div>
            </div>
            <ExternalLink className="w-4 h-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      {/* Report problem */}
      <button
        onClick={reportProblem}
        className="w-full flex items-center gap-3 p-4 bg-red-500/5 border border-red-500/20 rounded-2xl hover:bg-red-500/10 transition-colors text-left mb-8"
      >
        <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center text-red-500">
          <AlertTriangle className="w-4 h-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-red-600">Report a Problem</p>
          <p className="text-xs text-muted-foreground mt-0.5">Transaction issues, bugs, or account problems</p>
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </button>

      {/* FAQs */}
      <h2 className="text-xs font-semibold text-muted-foreground mb-3 px-1 uppercase tracking-wider">
        <span className="inline-flex items-center gap-1.5"><HelpCircle className="w-3.5 h-3.5" />Frequently Asked Questions</span>
      </h2>
      <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border">
        {faqs.map((faq, i) => (
          <div key={i}>
            <button
              onClick={() => setOpenFaq(openFaq === i ? null : i)}
              className="w-full flex items-center justify-between p-4 hover:bg-black/5 transition-colors text-left"
            >
              <p className="text-sm font-medium pr-4">{faq.q}</p>
              <ChevronRight className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-90' : ''}`} />
            </button>
            {openFaq === i && (
              <div className="px-4 pb-4">
                <p className="text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
