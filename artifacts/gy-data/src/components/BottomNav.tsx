import React, { useState } from 'react';
import { useAppContext } from '../context/AppContext';
import { Home, Grid, Wallet, Clock, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ServicesModal from './ServicesModal';

export default function BottomNav() {
  const { activeTab, setActiveTab, unreadCount } = useAppContext();
  const [isServicesOpen, setIsServicesOpen] = useState(false);

  const tabs = [
    { id: 'home', icon: Home, label: 'Home' },
    { id: 'services', icon: Grid, label: 'Services' },
    { id: 'wallet', icon: Wallet, label: 'Wallet' },
    { id: 'history', icon: Clock, label: 'History' },
    { id: 'profile', icon: User, label: 'Profile' },
  ];

  const handleTabClick = (id: string) => {
    if (id === 'services') {
      setIsServicesOpen(true);
    } else {
      setActiveTab(id);
    }
  };

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-border shadow-[0_-2px_16px_rgba(14,29,70,0.08)] pb-safe z-40 px-2 py-1">
        <div className="flex justify-around items-center h-16 max-w-md mx-auto relative">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            
            return (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className="relative flex flex-col items-center justify-center w-16 h-full gap-1"
              >
                {isActive && tab.id !== 'services' && (
                  <motion.div 
                    layoutId="activeTabIndicator"
                    className="absolute -top-1 w-8 h-1 bg-primary rounded-full"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                
                <div className={`relative flex items-center justify-center w-8 h-8 rounded-full transition-colors ${isActive && tab.id !== 'services' ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
                  <Icon className="w-5 h-5" />
                  {tab.id === 'home' && unreadCount > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-destructive rounded-full border border-background"></span>
                  )}
                </div>
                
                <span className={`text-[10px] font-medium transition-colors ${isActive && tab.id !== 'services' ? 'text-primary' : 'text-muted-foreground'}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <ServicesModal open={isServicesOpen} onOpenChange={setIsServicesOpen} />
    </>
  );
}
