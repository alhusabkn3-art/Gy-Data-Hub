import React from 'react';
import { motion } from 'framer-motion';
import { ChevronLeft, Wifi, Shield, Globe, FileText, Lock, ChevronRight } from 'lucide-react';
import { useLocation } from 'wouter';

const VERSION = '1.0.0';
const BUILD   = '2026.07';

export default function AboutScreen() {
  const [, setLocation] = useLocation();

  const legal = [
    { icon: FileText, label: 'Terms of Service',   action: () => window.open('https://gydata.ng/terms') },
    { icon: Lock,     label: 'Privacy Policy',      action: () => window.open('https://gydata.ng/privacy') },
    { icon: Globe,    label: 'Visit Our Website',   action: () => window.open('https://gydata.ng') },
  ];

  const highlights = [
    { icon: Wifi,   title: 'Instant Data & Airtime', desc: 'Top up any Nigerian network in seconds' },
    { icon: Shield, title: 'Secure by Default',       desc: 'PIN-protected with bcrypt hashing and HTTP-only sessions' },
    { icon: Globe,  title: 'All Networks Covered',    desc: 'MTN, Airtel, Glo, 9mobile and more' },
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
        <h1 className="text-xl font-bold">About GY DATA</h1>
      </div>

      {/* Logo + version */}
      <div className="flex flex-col items-center mb-8">
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4 shadow-xl"
          style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', boxShadow: '0 8px 32px rgba(37,99,235,0.45)' }}
        >
          <Wifi className="w-10 h-10 text-white" />
        </div>
        <h2 className="text-2xl font-bold mb-0.5">GY DATA</h2>
        <p className="text-muted-foreground text-sm tracking-widest uppercase font-medium">Endless Joy</p>
        <div className="flex items-center gap-3 mt-3">
          <span className="bg-primary/10 text-primary text-xs font-bold px-3 py-1 rounded-full">v{VERSION}</span>
          <span className="text-xs text-muted-foreground">Build {BUILD}</span>
        </div>
      </div>

      {/* What we do */}
      <h2 className="text-xs font-semibold text-muted-foreground mb-3 px-1 uppercase tracking-wider">What We Offer</h2>
      <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border mb-6">
        {highlights.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="flex items-center gap-3 p-4">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Legal */}
      <h2 className="text-xs font-semibold text-muted-foreground mb-3 px-1 uppercase tracking-wider">Legal & Info</h2>
      <div className="bg-card border border-border rounded-2xl overflow-hidden divide-y divide-border mb-8">
        {legal.map(({ icon: Icon, label, action }) => (
          <button
            key={label}
            onClick={action}
            className="w-full flex items-center justify-between p-4 hover:bg-black/5 transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Icon className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium">{label}</span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          </button>
        ))}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} GY DATA. All rights reserved.{'\n'}Made with ❤️ in Nigeria.
      </p>
    </motion.div>
  );
}
