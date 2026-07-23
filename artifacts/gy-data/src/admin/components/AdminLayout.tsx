import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, ArrowLeftRight, Wallet,
  Grid3X3, Bell, Settings, LogOut, Menu, X, Shield, ChevronRight,
  UserCog, User, Lock, ChevronDown, ScrollText, Crown,
  RotateCcw, BarChart2, Plug, WalletCards,
  Users2, Banknote, Cpu, Tags, ShieldCheck, Headset,
} from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { ROLE_LABELS } from '../data/adminMockData';

// ── Nav items ─────────────────────────────────────────────────────────────────
// superOnly: true  → visible only to super_admin, renders in amber section
// superOnly: false → visible to all admins

const BASE_NAV = [
  { id: 'dashboard',        label: 'Dashboard',          icon: LayoutDashboard, superOnly: false },
  { id: 'users',            label: 'Users',               icon: Users,           superOnly: false },
  { id: 'transactions',     label: 'Transactions',        icon: ArrowLeftRight,  superOnly: false },
  { id: 'wallet',           label: 'Wallet Overview',     icon: Wallet,          superOnly: false },
  { id: 'services',         label: 'Services',            icon: Grid3X3,         superOnly: false },
  { id: 'notifications',    label: 'Announcements',       icon: Bell,            superOnly: false },
  { id: 'settings',         label: 'Settings',            icon: Settings,        superOnly: false },
  { id: 'staff',            label: 'Staff Management',    icon: Users2,          superOnly: false },
  { id: 'customerCare',     label: 'Customer Care',       icon: Headset,         superOnly: false },
  // ── Super Admin only ──
  { id: 'walletManagement', label: 'Wallet Management',   icon: WalletCards,     superOnly: true  },
  { id: 'finance',          label: 'Finance',             icon: Banknote,        superOnly: true  },
  { id: 'pricing',          label: 'Pricing',             icon: Tags,            superOnly: true  },
  { id: 'apiManagement',    label: 'API Management',      icon: Cpu,             superOnly: true  },
  { id: 'reversals',        label: 'Reversals & Refunds', icon: RotateCcw,       superOnly: true  },
  { id: 'reports',          label: 'Reports',             icon: BarChart2,       superOnly: true  },
  { id: 'security',         label: 'Security',            icon: ShieldCheck,     superOnly: true  },
  { id: 'integrations',     label: 'API Integrations',    icon: Plug,            superOnly: true  },
  { id: 'adminManagement',  label: 'Admin Management',    icon: UserCog,         superOnly: true  },
  { id: 'auditLogs',        label: 'Audit Logs',          icon: ScrollText,      superOnly: true  },
];

interface AdminLayoutProps {
  children: React.ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
}

// ── Avatar dropdown ───────────────────────────────────────────────────────────

interface AvatarDropdownProps {
  adminEmail: string;
  isSuperAdmin: boolean;
  onNavigate: (page: string) => void;
  onLogout: () => void;
  direction?: 'right' | 'up';
}

function AvatarDropdown({ adminEmail, isSuperAdmin, onNavigate, onLogout, direction = 'right' }: AvatarDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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
    { icon: User,     label: 'Admin Profile', sub: adminEmail || 'Admin',        action: () => { onNavigate('settings'); setOpen(false); } },
    { icon: Lock,     label: 'Security',      sub: 'Change PIN & access',        action: () => { onNavigate('settings'); setOpen(false); } },
    { icon: Settings, label: 'Settings',      sub: 'App configuration',          action: () => { onNavigate('settings'); setOpen(false); } },
  ];

  const dropdownClass = direction === 'up'
    ? 'bottom-full left-0 mb-2 w-64'
    : 'top-full right-0 mt-2 w-64';

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)} className="flex items-center gap-2 group" aria-label="Admin menu" aria-expanded={open}>
        <div className="relative w-8 h-8">
          <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs font-bold text-primary border border-primary/30 group-hover:border-primary/60 group-hover:bg-primary/30 transition-all">
            {initial}
          </div>
          {isSuperAdmin && (
            <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 flex items-center justify-center">
              <Crown className="w-2 h-2 text-amber-900" />
            </div>
          )}
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
            <div className="px-4 py-3 border-b border-white/[0.08] flex items-center gap-3">
              <div className="relative w-9 h-9 flex-shrink-0">
                <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold text-primary border border-primary/30">
                  {initial}
                </div>
                {isSuperAdmin && (
                  <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 flex items-center justify-center">
                    <Crown className="w-2 h-2 text-amber-900" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{isSuperAdmin ? 'Super Admin' : 'Admin'}</p>
                <p className="text-[11px] text-muted-foreground truncate">{adminEmail}</p>
              </div>
            </div>

            <div className="py-1.5">
              {menuItems.map(({ icon: Icon, label, sub, action }) => (
                <button key={label} onClick={action}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/5 transition-colors text-left group">
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

            <div className="border-t border-white/[0.08] py-1.5">
              <button onClick={() => { onLogout(); setOpen(false); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-500/10 transition-colors text-left group">
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

// ── Sidebar nav button ────────────────────────────────────────────────────────

function NavButton({ id, label, icon: Icon, active, superAdmin, onNavigate, onClose }: {
  id: string; label: string; icon: React.ElementType; active: boolean;
  superAdmin: boolean; onNavigate: (id: string) => void; onClose?: () => void;
}) {
  if (superAdmin) {
    return (
      <button onClick={() => { onNavigate(id); onClose?.(); }}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
          active
            ? 'bg-amber-500/20 text-amber-300 border border-amber-400/25'
            : 'text-amber-400/70 hover:text-amber-300 hover:bg-amber-500/10'
        }`}>
        <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-amber-300' : 'text-amber-400/60 group-hover:text-amber-300'}`} />
        <span className="truncate">{label}</span>
        {active && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-70 flex-shrink-0" />}
      </button>
    );
  }
  return (
    <button onClick={() => { onNavigate(id); onClose?.(); }}
      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group ${
        active
          ? 'bg-primary text-white shadow-[0_4px_16px_rgba(59,130,246,0.35)]'
          : 'text-muted-foreground hover:text-white hover:bg-white/5'
      }`}>
      <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-white' : 'text-muted-foreground group-hover:text-white'}`} />
      <span className="truncate">{label}</span>
      {active && <ChevronRight className="w-3.5 h-3.5 ml-auto opacity-70 flex-shrink-0" />}
    </button>
  );
}

// ── Layout ────────────────────────────────────────────────────────────────────

export default function AdminLayout({ children, activePage, onNavigate }: AdminLayoutProps) {
  const { adminLogout, adminEmail, adminRole, isSuperAdmin } = useAdminContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const regularItems = BASE_NAV.filter(i => !i.superOnly);
  const superItems   = BASE_NAV.filter(i => i.superOnly);
  const allVisible   = BASE_NAV.filter(i => !i.superOnly || isSuperAdmin);

  const SidebarContent = ({ onClose }: { onClose?: () => void }) => (
    <div className="flex flex-col h-full">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3 flex-shrink-0">
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
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {isSuperAdmin ? (
          <>
            {/* Regular items */}
            {regularItems.map(({ id, label, icon }) => (
              <NavButton key={id} id={id} label={label} icon={icon}
                active={activePage === id} superAdmin={false}
                onNavigate={onNavigate} onClose={onClose} />
            ))}

            {/* Super Admin section divider */}
            <div className="mt-3 mb-1.5 px-3 flex items-center gap-2">
              <div className="flex-1 h-px bg-amber-400/20" />
              <div className="flex items-center gap-1">
                <Crown className="w-2.5 h-2.5 text-amber-400/70" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400/70">Super Admin</span>
              </div>
              <div className="flex-1 h-px bg-amber-400/20" />
            </div>

            {superItems.map(({ id, label, icon }) => (
              <NavButton key={id} id={id} label={label} icon={icon}
                active={activePage === id} superAdmin={true}
                onNavigate={onNavigate} onClose={onClose} />
            ))}
          </>
        ) : (
          allVisible.map(({ id, label, icon }) => (
            <NavButton key={id} id={id} label={label} icon={icon}
              active={activePage === id} superAdmin={false}
              onNavigate={onNavigate} onClose={onClose} />
          ))
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-white/10 p-4 flex-shrink-0">
        <div className="flex items-center gap-3 mb-3 px-1">
          <AvatarDropdown
            adminEmail={adminEmail}
            isSuperAdmin={isSuperAdmin}
            onNavigate={id => { onNavigate(id); onClose?.(); }}
            onLogout={() => { adminLogout(); onClose?.(); }}
            direction="up"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-xs font-semibold truncate">{ROLE_LABELS[adminRole] ?? 'Admin'}</p>
              {isSuperAdmin && <Crown className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />}
            </div>
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
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)} />
            <motion.aside initial={{ x: -240 }} animate={{ x: 0 }} exit={{ x: -240 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 left-0 bottom-0 w-60 bg-[#0A1628] border-r border-white/[0.06] z-50 lg:hidden">
              <SidebarContent onClose={() => setSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-[#0A1628] flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)} className="w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-white transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-primary" />
            <span className="font-bold text-sm">GY DATA Admin</span>
          </div>
          <AvatarDropdown
            adminEmail={adminEmail}
            isSuperAdmin={isSuperAdmin}
            onNavigate={onNavigate}
            onLogout={adminLogout}
            direction="right"
          />
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
