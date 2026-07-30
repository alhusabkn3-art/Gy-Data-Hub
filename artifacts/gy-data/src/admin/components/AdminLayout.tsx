import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Users, ArrowLeftRight, Wallet,
  Grid3X3, Bell, Settings, LogOut, Menu, X, Shield, ChevronRight,
  UserCog, User, Lock, ChevronDown, ScrollText, Crown,
  RotateCcw, BarChart2, Plug, WalletCards,
  Users2, Banknote, Cpu, Tags, ShieldCheck, Headset,
  Zap, Gift,
} from 'lucide-react';
import { useAdminContext } from '../context/AdminContext';
import { ROLE_LABELS } from '../data/adminMockData';

// ── Nav config ────────────────────────────────────────────────────────────────

const GENERAL_NAV = [
  { id: 'dashboard',     label: 'Dashboard',       icon: LayoutDashboard },
  { id: 'users',         label: 'Users',            icon: Users           },
  { id: 'transactions',  label: 'Transactions',     icon: ArrowLeftRight  },
  { id: 'wallet',        label: 'Wallet Overview',  icon: Wallet          },
  { id: 'services',      label: 'Services',         icon: Grid3X3         },
  { id: 'notifications', label: 'Announcements',    icon: Bell            },
  { id: 'staff',         label: 'Staff',            icon: Users2          },
  { id: 'customerCare',  label: 'Customer Care',    icon: Headset         },
  { id: 'settings',      label: 'Settings',         icon: Settings        },
];

const SUPER_NAV = [
  { id: 'walletManagement', label: 'Wallet Mgmt',      icon: WalletCards  },
  { id: 'finance',          label: 'Finance',           icon: Banknote     },
  { id: 'pricing',          label: 'Pricing',           icon: Tags         },
  { id: 'cashback',         label: 'Cashback',          icon: Gift         },
  { id: 'apiManagement',    label: 'API Management',    icon: Cpu          },
  { id: 'reversals',        label: 'Reversals',         icon: RotateCcw    },
  { id: 'reports',          label: 'Reports',           icon: BarChart2    },
  { id: 'security',         label: 'Security',          icon: ShieldCheck  },
  { id: 'integrations',     label: 'Integrations',      icon: Plug         },
  { id: 'adminManagement',  label: 'Admin Management',  icon: UserCog      },
  { id: 'auditLogs',        label: 'Audit Logs',        icon: ScrollText   },
];

const SUPER_ONLY_IDS = new Set(SUPER_NAV.map(n => n.id));

interface AdminLayoutProps {
  children: React.ReactNode;
  activePage: string;
  onNavigate: (page: string) => void;
}

// ── Avatar / profile dropdown ─────────────────────────────────────────────────

interface ProfileMenuProps {
  adminEmail: string;
  adminRole: string;
  isSuperAdmin: boolean;
  onNavigate: (p: string) => void;
  onLogout: () => void;
  direction?: 'up' | 'down';
}

function ProfileMenu({ adminEmail, adminRole, isSuperAdmin, onNavigate, onLogout, direction = 'up' }: ProfileMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('keydown', key); };
  }, [open]);

  const initial = adminEmail ? adminEmail[0].toUpperCase() : 'A';
  const displayRole = ROLE_LABELS[adminRole as keyof typeof ROLE_LABELS] ?? 'Admin';

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-3 w-full px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-all group"
      >
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${
            isSuperAdmin
              ? 'bg-amber-400/20 text-amber-300 border-amber-400/40'
              : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
          }`}>
            {initial}
          </div>
          {isSuperAdmin && (
            <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 flex items-center justify-center shadow-lg">
              <Crown className="w-2 h-2 text-amber-900" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className="text-xs font-semibold truncate leading-tight">{displayRole}</p>
          <p className="text-[10px] text-white/40 truncate leading-tight mt-0.5">{adminEmail}</p>
        </div>
        <ChevronDown className={`w-3.5 h-3.5 text-white/30 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: direction === 'up' ? 8 : -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: direction === 'up' ? 8 : -8, scale: 0.96 }}
            transition={{ duration: 0.15 }}
            className={`absolute z-[90] left-0 right-0 ${direction === 'up' ? 'bottom-full mb-2' : 'top-full mt-2'} bg-[#0D1F3C] border border-white/10 rounded-2xl shadow-2xl overflow-hidden`}
          >
            {/* Header */}
            <div className="px-4 py-3.5 border-b border-white/[0.07] flex items-center gap-3">
              <div className="relative flex-shrink-0">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border ${
                  isSuperAdmin ? 'bg-amber-400/20 text-amber-300 border-amber-400/40' : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
                }`}>{initial}</div>
                {isSuperAdmin && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center">
                    <Crown className="w-2.5 h-2.5 text-amber-900" />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{displayRole}</p>
                <p className="text-xs text-white/50 truncate">{adminEmail}</p>
              </div>
            </div>

            {/* Menu items */}
            <div className="py-1.5">
              {[
                { icon: User,     label: 'Profile & Account', sub: 'View your profile',   page: 'settings' },
                { icon: Lock,     label: 'Change PIN',        sub: 'Update credentials',  page: 'settings' },
                { icon: Settings, label: 'Settings',          sub: 'App configuration',   page: 'settings' },
              ].map(({ icon: Icon, label, sub, page }) => (
                <button key={label}
                  onClick={() => { onNavigate(page); setOpen(false); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.05] transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-white/[0.05] flex items-center justify-center flex-shrink-0">
                    <Icon className="w-3.5 h-3.5 text-white/50" />
                  </div>
                  <div className="min-w-0 text-left">
                    <p className="text-xs font-semibold">{label}</p>
                    <p className="text-[10px] text-white/40">{sub}</p>
                  </div>
                </button>
              ))}
            </div>

            {/* Sign out */}
            <div className="border-t border-white/[0.07] p-2">
              <button
                onClick={() => { onLogout(); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 transition-colors"
              >
                <div className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <LogOut className="w-3.5 h-3.5 text-red-400" />
                </div>
                <div className="text-left">
                  <p className="text-xs font-semibold text-red-400">Sign Out</p>
                  <p className="text-[10px] text-white/30">End session</p>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Single nav button ─────────────────────────────────────────────────────────

function NavBtn({ id, label, icon: Icon, active, isSuper, onNavigate, onClose }: {
  id: string; label: string; icon: React.ElementType;
  active: boolean; isSuper: boolean;
  onNavigate: (id: string) => void; onClose?: () => void;
}) {
  return (
    <button
      onClick={() => { onNavigate(id); onClose?.(); }}
      className={`relative w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-all duration-150 group ${
        active
          ? isSuper
            ? 'bg-amber-400/10 text-amber-300'
            : 'bg-blue-500/10 text-blue-300'
          : 'text-white/50 hover:text-white/90 hover:bg-white/[0.04]'
      }`}
    >
      {/* Active left accent */}
      {active && (
        <span className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full ${
          isSuper ? 'bg-amber-400' : 'bg-blue-400'
        }`} />
      )}
      <Icon className={`w-4 h-4 flex-shrink-0 transition-colors ${
        active
          ? isSuper ? 'text-amber-300' : 'text-blue-300'
          : 'text-white/30 group-hover:text-white/70'
      }`} />
      <span className="flex-1 text-left truncate text-[13px]">{label}</span>
      {active && <ChevronRight className="w-3 h-3 opacity-60 flex-shrink-0" />}
    </button>
  );
}

// ── Page title map ────────────────────────────────────────────────────────────

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Dashboard', users: 'Users', transactions: 'Transactions',
  wallet: 'Wallet Overview', services: 'Services', notifications: 'Announcements',
  settings: 'Settings', adminManagement: 'Admin Management', auditLogs: 'Audit Logs',
  walletManagement: 'Wallet Management', reversals: 'Reversals & Refunds',
  reports: 'Financial Reports', integrations: 'API Integrations', staff: 'Staff Management',
  apiManagement: 'API Management', pricing: 'Pricing', cashback: 'Cashback Management',
  security: 'Security', finance: 'Finance', customerCare: 'Customer Care',
};

// ── Layout ────────────────────────────────────────────────────────────────────

export default function AdminLayout({ children, activePage, onNavigate }: AdminLayoutProps) {
  const { adminLogout, adminEmail, adminRole, isSuperAdmin } = useAdminContext();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Determine which general nav items to show
  const generalItems = GENERAL_NAV;
  const superItems   = SUPER_NAV;

  const SidebarContent = ({ onClose }: { onClose?: () => void }) => (
    <div className="flex flex-col h-full select-none">

      {/* ── Brand ──────────────────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-4 flex items-center gap-3 flex-shrink-0">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-500/20 flex-shrink-0">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-sm leading-tight tracking-tight text-white">GY DATA</p>
          <p className="text-[10px] text-blue-400/80 font-semibold uppercase tracking-widest mt-0.5">
            {isSuperAdmin ? 'Super Admin' : 'Admin Portal'}
          </p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-white/30 hover:text-white transition-colors p-1">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Divider ────────────────────────────────────────────────────── */}
      <div className="mx-4 h-px bg-white/[0.06] flex-shrink-0" />

      {/* ── Nav ────────────────────────────────────────────────────────── */}
      <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-0.5 scrollbar-hide">

        {/* General section */}
        <p className="px-3 pb-1.5 pt-0.5 text-[9px] font-bold uppercase tracking-widest text-white/20">General</p>
        {generalItems.map(({ id, label, icon }) => (
          (!SUPER_ONLY_IDS.has(id) || isSuperAdmin) && (
            <NavBtn key={id} id={id} label={label} icon={icon}
              active={activePage === id} isSuper={false}
              onNavigate={onNavigate} onClose={onClose} />
          )
        ))}

        {/* Super Admin section */}
        {isSuperAdmin && (
          <>
            <div className="pt-3 pb-1.5 px-3 flex items-center gap-2">
              <div className="flex-1 h-px bg-amber-400/20" />
              <div className="flex items-center gap-1.5 bg-amber-400/10 rounded-full px-2 py-0.5">
                <Crown className="w-2.5 h-2.5 text-amber-400" />
                <span className="text-[9px] font-bold uppercase tracking-widest text-amber-400">Super Admin</span>
              </div>
              <div className="flex-1 h-px bg-amber-400/20" />
            </div>
            {superItems.map(({ id, label, icon }) => (
              <NavBtn key={id} id={id} label={label} icon={icon}
                active={activePage === id} isSuper={true}
                onNavigate={onNavigate} onClose={onClose} />
            ))}
          </>
        )}
      </nav>

      {/* ── Footer / Profile ───────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-2 pb-4 pt-2 border-t border-white/[0.06]">
        <ProfileMenu
          adminEmail={adminEmail}
          adminRole={adminRole}
          isSuperAdmin={isSuperAdmin}
          onNavigate={id => { onNavigate(id); onClose?.(); }}
          onLogout={() => { adminLogout(); onClose?.(); }}
          direction="up"
        />
      </div>
    </div>
  );

  const pageTitle = PAGE_TITLES[activePage] ?? 'Admin';

  return (
    <div className="flex h-screen bg-[#050E1F] text-foreground overflow-hidden">

      {/* ── Desktop sidebar ─────────────────────────────────────────────── */}
      <aside className="hidden lg:flex flex-col w-56 bg-[#070F20] border-r border-white/[0.05] flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* ── Mobile sidebar overlay ──────────────────────────────────────── */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
            <motion.aside
              initial={{ x: -224 }} animate={{ x: 0 }} exit={{ x: -224 }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed top-0 left-0 bottom-0 w-56 bg-[#070F20] border-r border-white/[0.05] z-50 lg:hidden"
            >
              <SidebarContent onClose={() => setSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main content ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Mobile top bar */}
        <header className="lg:hidden flex items-center justify-between px-4 py-3 bg-[#070F20] border-b border-white/[0.05] flex-shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-8 h-8 rounded-xl bg-white/[0.05] flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-all"
          >
            <Menu className="w-4.5 h-4.5" />
          </button>

          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm tracking-tight">{pageTitle}</span>
          </div>

          {/* Mobile avatar */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="relative w-8 h-8"
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border ${
              isSuperAdmin ? 'bg-amber-400/20 text-amber-300 border-amber-400/40' : 'bg-blue-500/20 text-blue-300 border-blue-500/30'
            }`}>
              {adminEmail?.[0]?.toUpperCase() ?? 'A'}
            </div>
            {isSuperAdmin && (
              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-amber-400 flex items-center justify-center">
                <Crown className="w-2 h-2 text-amber-900" />
              </div>
            )}
          </button>
        </header>

        {/* Desktop top bar — breadcrumb + role badge */}
        <header className="hidden lg:flex items-center justify-between px-6 py-3 bg-[#070F20] border-b border-white/[0.05] flex-shrink-0">
          <div className="flex items-center gap-2 text-sm">
            <Shield className="w-4 h-4 text-blue-400/70" />
            <span className="text-white/30">Admin</span>
            <ChevronRight className="w-3.5 h-3.5 text-white/20" />
            <span className="font-semibold text-white/90">{pageTitle}</span>
          </div>
          <div className="flex items-center gap-3">
            {isSuperAdmin && (
              <div className="flex items-center gap-1.5 bg-amber-400/10 border border-amber-400/20 rounded-full px-3 py-1">
                <Crown className="w-3 h-3 text-amber-400" />
                <span className="text-xs font-bold text-amber-400">Super Admin</span>
              </div>
            )}
            <div className="w-px h-5 bg-white/10" />
            <div className="text-right">
              <p className="text-xs font-semibold leading-tight text-white/80">{adminEmail}</p>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-[#050E1F]">
          {children}
        </main>
      </div>
    </div>
  );
}
