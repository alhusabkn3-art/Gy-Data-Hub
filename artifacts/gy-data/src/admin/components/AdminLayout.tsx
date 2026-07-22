import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, ArrowLeftRight, Wallet,
  Grid3X3, Bell, Settings, LogOut, Menu, X, Shield, ChevronRight,
  UserCog, User, Lock, ChevronDown,
} from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';

const navItems = [
  { id: 'dashboard',       label: 'Dashboard',       icon: LayoutDashboard },
  { id: 'users',           label: 'Users',            icon: Users },
  { id: 'transactions',    label: 'Transactions',     icon: ArrowLeftRight },
  { id: 'wallet',          label: 'Wallet',           icon: Wallet },
  { id: 'services',        label: 'Services',         icon: Grid3X3 },
  { id: 'notifications',   label: 'Announcements',    icon: Bell },
  { id: 'adminManagement', label: 'Admin Management', icon: UserCog },
  { id: 'settings',        label: 'Settings',         icon: Settings },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
}

// ── Avatar dropdown menu ──────────────────────────────────────────────────────

interface AvatarDropdownProps {
  adminEmail: string;
  onNavigate: (page: string) => void;
  onLogout: () => void;
  /** 'right' for mobile header; 'up' for desktop sidebar bottom */
  direction?: 'right' | 'up';
}

function AvatarDropdown({ adminEmail, onNavigate, onLogout, direction = 'right' }: AvatarDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  const initial = adminEmail ? adminEmail[0].toUpperCase() : 'A';

  const menuItems = [
    {
      icon: User,
      label: 'Admin Profile',
      sub: adminEmail || 'Super Admin',
      action: () => { onNavigate('settings'); setOpen(false); },
    },
    {
      icon: Lock,
      label: 'Security',
      sub: 'Change PIN & access',
      action: () => { onNavigate('settings'); setOpen(false); },
    },
    {
      icon: Settings,
      label: 'Settings',
      sub: 'App configuration',
      action: () => { onNavigate('settings'); setOpen(false); },
    },
  ];

  // Position dropdown: above (up) for desktop sidebar footer, right-aligned (right) for mobile header
  const dropdownClass = direction === 'up'
    ? 'bottom-full left-0 mb-2 w-64'
    : 'top-full right-0 mt-2 w-64';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-2 group"
        aria-label="Admin menu"
        aria-expanded={open}
      >
        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary border border-primary/30 group-hover:border-primary/60 group-hover:bg-primary/30 transition-all">
          {initial}
        </div>
        {direction === 'up' && (
          <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: direction === 'up' ? 8 : -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: direction === 'up' ? 8 : -4 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-[80] ${dropdownClass} bg-[#0D1F3C] border border-white/10 rounded-2xl shadow-2xl shadow-black/40 overflow-hidden`}
          >
            {/* Profile header */}
            <div className="px-4 py-3 border-b border-white/[0.08] flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary border border-primary/30 flex-shrink-0">
                {initial}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">Super Admin</p>
                <p className="text-[11px] text-muted-foreground truncate">{adminEmail}</p>
              </div>
            </div>

            {/* Menu items */}
            <div className="py-1.5">
              {menuItems.map(({ icon: Icon, label, sub, action }) => (
                <button
                  key={label}
                  onClick={action}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left group"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 transition-colors">
                    <Icon className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">{label}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{sub}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Logout */}
            <div className="border-t border-white/[0.08] py-1.5">
              <button
                onClick={() => { onLogout(); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-500/10 transition-colors text-left group"
              >
                <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <LogOut className="w-3.5 h-3.5 text-red-400" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-red-400">Sign Out</p>
                  <p className="text-[10px] text-muted-foreground">End admin session</p>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function AdminLayout({ children, activePage, onNavigate }: AdminLayoutProps) {
  const { adminLogout, adminEmail } = useAdminContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const SidebarContent = ({ onClose }: { onClose?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center border border-primary/30">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <p className="font-bold text-sm leading-none">GY DATA</p>
          <p className="text-[10px] text-primary/80 mt-0.5 uppercase tracking-widest font-semibold">Admin Portal</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ id, label, icon: Icon }) => {
          const active = activePage === id;
          return (
            <button
              key={id}
              onClick={() => { onNavigate(id); onClose?.(); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
                active
                  ? 'bg-primary text-white shadow-[0_4px_16px_rgba(59,130,246,0.35)]'
                  : 'text-muted-foreground hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-white' : 'text-muted-foreground group-hover:text-white'}`} />
              {label}
              {active && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-70" />}
            </button>
          );
        })}
      </nav>

      {/* Admin info footer — avatar opens dropdown, logout button stays */}
      <div className="border-t border-white/10 p-4">
        <div className="flex items-center gap-3 mb-3 px-1">
          <AvatarDropdown
            adminEmail={adminEmail}
            onNavigate={id => { onNavigate(id); onClose?.(); }}
            onLogout={() => { adminLogout(); onClose?.(); }}
            direction="up"
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">Super Admin</p>
            <p className="text-[10px] text-muted-foreground truncate">{adminEmail}</p>
          </div>
        </div>
        <button
          onClick={() => { adminLogout(); onClose?.(); }}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-all"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-60 bg-[#0A1628] border-r border-white/[0.06] flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -240 }}
              animate={{ x: 0 }}
              exit={{ x: -240 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed inset-y-0 left-0 w-60 bg-[#0A1628] border-r border-white/[0.06] z-50 lg:hidden flex flex-col"
            >
              <SidebarContent onClose={() => setSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-[#0A1628] border-b border-white/[0.06] flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 flex-1">
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">GY DATA Admin</span>
          </div>
          {/* Functional avatar dropdown — mobile */}
          <AvatarDropdown
            adminEmail={adminEmail}
            onNavigate={onNavigate}
            onLogout={adminLogout}
            direction="right"
          />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <motion.div
            key={activePage}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
            className="h-full"
          >
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
