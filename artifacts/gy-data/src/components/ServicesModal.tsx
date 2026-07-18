import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Wifi, Phone, Zap, Tv, GraduationCap, Book, Trophy, Globe, Plane, Car, Gift, HeartPulse, Ticket, Building, HelpCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'wouter';

export default function ServicesModal({ open, onOpenChange }: { open: boolean, onOpenChange: (o: boolean) => void }) {
  const [, setLocation] = useLocation();

  const services = [
    { id: 'data', icon: Wifi, label: 'Buy Data', color: 'text-blue-400', route: '/data' },
    { id: 'airtime', icon: Phone, label: 'Airtime', color: 'text-orange-400', route: '/airtime' },
    { id: 'electricity', icon: Zap, label: 'Electricity', color: 'text-yellow-400' },
    { id: 'cable', icon: Tv, label: 'Cable TV', color: 'text-purple-400' },
    { id: 'waec', icon: GraduationCap, label: 'WAEC PIN', color: 'text-green-400' },
    { id: 'jamb', icon: Book, label: 'JAMB PIN', color: 'text-emerald-400' },
    { id: 'betting', icon: Trophy, label: 'Betting', color: 'text-red-400' },
    { id: 'smile', icon: Wifi, label: 'Smile Data', color: 'text-cyan-400' },
    { id: 'internet', icon: Globe, label: 'Internet', color: 'text-blue-500' },
    { id: 'flights', icon: Plane, label: 'Flights', color: 'text-sky-400' },
    { id: 'transport', icon: Car, label: 'Transport', color: 'text-gray-400' },
    { id: 'giftcards', icon: Gift, label: 'Gift Cards', color: 'text-pink-400' },
    { id: 'insurance', icon: HeartPulse, label: 'Insurance', color: 'text-rose-400' },
    { id: 'events', icon: Ticket, label: 'Events', color: 'text-indigo-400' },
    { id: 'hotels', icon: Building, label: 'Hotels', color: 'text-teal-400' },
    { id: 'more', icon: HelpCircle, label: 'More', color: 'text-muted-foreground' },
  ];

  const handleServiceClick = (service: any) => {
    onOpenChange(false);
    if (service.route) {
      setLocation(service.route);
    } else {
      toast.info(`${service.label} service is coming soon!`);
    }
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
            onClick={() => onOpenChange(false)}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-white border-t border-border shadow-[0_-4px_32px_rgba(14,29,70,0.10)] z-50 rounded-t-3xl max-w-md mx-auto overflow-y-auto"
            style={{ maxHeight: '90vh' }}
          >
            <div className="p-6 pb-10">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">All Services</h2>
                <button 
                  onClick={() => onOpenChange(false)}
                  className="w-8 h-8 rounded-full bg-black/5 flex items-center justify-center text-muted-foreground hover:text-foreground"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-4 gap-y-6 gap-x-2 pb-8">
                {services.map((service) => (
                  <button 
                    key={service.id}
                    onClick={() => handleServiceClick(service)}
                    className="flex flex-col items-center gap-2 group"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-card border border-border flex items-center justify-center group-hover:bg-black/5 transition-colors">
                      <service.icon className={`w-6 h-6 ${service.color}`} />
                    </div>
                    <span className="text-[10px] font-medium text-center">{service.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
