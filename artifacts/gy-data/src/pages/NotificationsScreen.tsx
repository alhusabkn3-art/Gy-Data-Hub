import React from 'react';
import { motion } from 'framer-motion';
import { Bell, ShieldCheck, Tag, CreditCard, Check, ChevronLeft } from 'lucide-react';
import { useLocation } from 'wouter';
import { useAppContext } from '../context/AppContext';

export default function NotificationsScreen() {
  const [, setLocation] = useLocation();
  const { notifications, markAllNotificationsRead } = useAppContext();

  const getIcon = (type: string) => {
    switch (type) {
      case 'transaction': return <CreditCard className="w-5 h-5 text-blue-400" />;
      case 'promo': return <Tag className="w-5 h-5 text-pink-400" />;
      case 'security': return <ShieldCheck className="w-5 h-5 text-red-400" />;
      case 'system': return <Bell className="w-5 h-5 text-yellow-400" />;
      default: return <Bell className="w-5 h-5 text-gray-400" />;
    }
  };

  const hasUnread = notifications.some(n => !n.read);

  return (
    <motion.div 
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="p-4 sm:p-6 max-w-md mx-auto min-h-screen bg-background"
    >
      <div className="flex items-center justify-between mb-8 pt-2">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setLocation('/')}
            className="w-10 h-10 bg-card rounded-full flex items-center justify-center border border-border"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold">Notifications</h1>
        </div>
        {hasUnread && (
          <button 
            onClick={markAllNotificationsRead}
            className="text-xs font-semibold text-primary bg-primary/10 px-3 py-1.5 rounded-full flex items-center gap-1"
          >
            <Check className="w-3.5 h-3.5" /> Mark all read
          </button>
        )}
      </div>

      <div className="space-y-4 pb-10">
        {notifications.length > 0 ? (
          notifications.map(notif => (
            <div 
              key={notif.id} 
              className={`p-4 rounded-2xl border transition-colors relative overflow-hidden ${
                !notif.read ? 'bg-card border-primary/30 shadow-[0_4px_20px_rgba(37,99,235,0.05)]' : 'bg-background border-border opacity-70'
              }`}
            >
              {!notif.read && (
                <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
              )}
              <div className="flex gap-4">
                <div className={`mt-0.5 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${!notif.read ? 'bg-primary/10' : 'bg-card border border-border'}`}>
                  {getIcon(notif.type)}
                </div>
                <div>
                  <div className="flex justify-between items-start mb-1">
                    <h3 className={`font-semibold text-sm ${!notif.read ? 'text-foreground' : 'text-foreground/80'}`}>{notif.title}</h3>
                    {!notif.read && <span className="w-2 h-2 rounded-full bg-primary mt-1.5 ml-2"></span>}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-2">{notif.body}</p>
                  <span className="text-[10px] font-medium text-muted-foreground">{notif.timestamp}</span>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
              <Bell className="w-8 h-8 text-muted-foreground opacity-50" />
            </div>
            <p className="text-muted-foreground font-medium">No notifications yet</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
