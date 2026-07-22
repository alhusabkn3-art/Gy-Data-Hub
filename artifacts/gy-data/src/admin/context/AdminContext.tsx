/**
 * AdminContext
 *
 * Provides admin state and data fetching for the entire admin dashboard.
 * All aggregate statistics, user lists, and transaction lists are fetched
 * from real backend endpoints at /api/admin/*.
 *
 * Admin account management (add/update/remove admin accounts) remains
 * in-memory for this phase — it will be migrated to backend in a future task.
 */
import React, { createContext, useContext, useState, ReactNode } from 'react';
import {
  adminCredentials,
  adminAccounts as seedAdminAccounts,
  adminAnnouncements as seedAnnouncements,
  AdminUser,
  AdminTransaction,
  AdminStats,
  WeeklyRevenue,
  ServiceBreakdown,
  Announcement,
  AdminAccount,
  AdminRole,
} from '../data/adminMockData';

// ── API helper ────────────────────────────────────────────────────────────────

const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, '');

function adminApi(path: string, opts: RequestInit = {}): Promise<Response> {
  const url = `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...((opts.headers as Record<string, string>) ?? {}),
    },
    ...opts,
  });
}

// ── Context type ──────────────────────────────────────────────────────────────

interface AdminContextType {
  // Auth
  isAdminLoggedIn: boolean;
  adminEmail: string;
  currentAdminId: string;
  adminLogin: (email: string, pin: string) => Promise<boolean>;
  adminLogout: () => void;

  // Stats (from backend)
  stats: AdminStats | null;
  statsLoading: boolean;
  refreshStats: () => Promise<void>;

  // Users (from backend)
  users: AdminUser[];
  usersTotal: number;
  usersLoading: boolean;
  fetchUsers: (params?: { search?: string; status?: string; kyc?: string; page?: number }) => Promise<void>;
  updateUserStatus: (id: string, status: 'active' | 'suspended') => Promise<boolean>;

  // Transactions (from backend)
  transactions: AdminTransaction[];
  txnsTotal: number;
  txnsLoading: boolean;
  fetchTransactions: (params?: { search?: string; status?: string; type?: string; page?: number }) => Promise<void>;

  // Weekly revenue chart (from backend)
  weeklyRevenue: WeeklyRevenue[];
  revenueLoading: boolean;
  fetchWeeklyRevenue: () => Promise<void>;

  // Services breakdown (from backend)
  servicesData: ServiceBreakdown[];
  servicesLoading: boolean;
  fetchServices: () => Promise<void>;

  // Announcements (in-memory)
  announcements: Announcement[];
  addAnnouncement: (ann: Omit<Announcement, 'id' | 'sentAt' | 'recipients'>) => void;

  // Admin account management (in-memory)
  adminAccounts: AdminAccount[];
  addAdminAccount:    (data: { name: string; email: string; role: AdminRole; pin: string }) => void;
  updateAdminAccount: (id: string, updates: Partial<Pick<AdminAccount, 'name' | 'email' | 'role'>>) => void;
  changeAdminPin:     (id: string, newPin: string) => void;
  toggleAdminStatus:  (id: string) => void;
  removeAdminAccount: (id: string) => void;

  // Legacy compat aliases used by older pages
  suspendUser: (id: string) => void;
  activateUser: (id: string) => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export const AdminProvider = ({ children }: { children: ReactNode }) => {
  // Auth
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminEmail,      setAdminEmail]      = useState('');
  const [currentAdminId,  setCurrentAdminId]  = useState('');

  // Stats
  const [stats,        setStats]        = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Users
  const [users,        setUsers]        = useState<AdminUser[]>([]);
  const [usersTotal,   setUsersTotal]   = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);

  // Transactions
  const [transactions,  setTransactions]  = useState<AdminTransaction[]>([]);
  const [txnsTotal,     setTxnsTotal]     = useState(0);
  const [txnsLoading,   setTxnsLoading]   = useState(false);

  // Weekly revenue
  const [weeklyRevenue,  setWeeklyRevenue]  = useState<WeeklyRevenue[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(false);

  // Services
  const [servicesData,    setServicesData]    = useState<ServiceBreakdown[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);

  // In-memory
  const [announcements, setAnnouncements] = useState<Announcement[]>(seedAnnouncements);
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>(seedAdminAccounts);

  // ── Data fetchers ───────────────────────────────────────────────────────────

  async function refreshStats() {
    setStatsLoading(true);
    try {
      const res = await adminApi('/api/admin/stats');
      if (res.ok) setStats(await res.json() as AdminStats);
    } catch { /* network error — silently fail, keep previous state */ }
    finally { setStatsLoading(false); }
  }

  async function fetchWeeklyRevenue() {
    setRevenueLoading(true);
    try {
      const res = await adminApi('/api/admin/revenue/weekly');
      if (res.ok) setWeeklyRevenue(await res.json() as WeeklyRevenue[]);
    } catch { /* silent */ }
    finally { setRevenueLoading(false); }
  }

  async function fetchServices() {
    setServicesLoading(true);
    try {
      const res = await adminApi('/api/admin/services');
      if (res.ok) setServicesData(await res.json() as ServiceBreakdown[]);
    } catch { /* silent */ }
    finally { setServicesLoading(false); }
  }

  async function fetchUsers(params?: { search?: string; status?: string; kyc?: string; page?: number }) {
    setUsersLoading(true);
    try {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.status) qs.set('status', params.status);
      if (params?.kyc)    qs.set('kyc',    params.kyc);
      if (params?.page)   qs.set('page',   String(params.page));
      qs.set('limit', '50');
      const res = await adminApi(`/api/admin/users?${qs}`);
      if (res.ok) {
        const data = await res.json() as { users: AdminUser[]; total: number };
        setUsers(data.users);
        setUsersTotal(data.total);
      }
    } catch { /* silent */ }
    finally { setUsersLoading(false); }
  }

  async function fetchTransactions(params?: { search?: string; status?: string; type?: string; page?: number }) {
    setTxnsLoading(true);
    try {
      const qs = new URLSearchParams();
      if (params?.search) qs.set('search', params.search);
      if (params?.status) qs.set('status', params.status);
      if (params?.type)   qs.set('type',   params.type);
      if (params?.page)   qs.set('page',   String(params.page));
      qs.set('limit', '50');
      const res = await adminApi(`/api/admin/transactions?${qs}`);
      if (res.ok) {
        const data = await res.json() as { transactions: AdminTransaction[]; total: number };
        setTransactions(data.transactions);
        setTxnsTotal(data.total);
      }
    } catch { /* silent */ }
    finally { setTxnsLoading(false); }
  }

  // ── Auth ────────────────────────────────────────────────────────────────────

  const adminLogin = async (email: string, pin: string): Promise<boolean> => {
    // Step 1: fast local credential check (keeps UX snappy)
    if (
      email.trim().toLowerCase() !== adminCredentials.email ||
      pin !== adminCredentials.pin
    ) {
      return false;
    }

    // Step 2: establish backend admin session so data endpoints work
    try {
      const res = await adminApi('/api/admin/session', {
        method: 'POST',
        body: JSON.stringify({ email: email.trim().toLowerCase(), pin }),
      });
      if (!res.ok) return false;
    } catch {
      return false;
    }

    setIsAdminLoggedIn(true);
    setAdminEmail(email.trim().toLowerCase());
    setCurrentAdminId('ADM-001');

    // Fetch all dashboard data in parallel after login
    void Promise.all([
      refreshStats(),
      fetchWeeklyRevenue(),
      fetchServices(),
      fetchUsers(),
      fetchTransactions(),
    ]);

    return true;
  };

  const adminLogout = () => {
    void adminApi('/api/admin/session', { method: 'DELETE' });
    setIsAdminLoggedIn(false);
    setAdminEmail('');
    setCurrentAdminId('');
    // Clear data
    setStats(null);
    setUsers([]);
    setTransactions([]);
    setWeeklyRevenue([]);
    setServicesData([]);
  };

  // ── User status (calls real backend) ────────────────────────────────────────

  const updateUserStatus = async (id: string, status: 'active' | 'suspended'): Promise<boolean> => {
    try {
      const res = await adminApi(`/api/admin/users/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return false;
      // Optimistically update local state
      setUsers(prev => prev.map(u => u.id === id ? { ...u, status } : u));
      void refreshStats();
      return true;
    } catch { return false; }
  };

  // Legacy aliases that existing pages use (wrap the real backend call)
  const suspendUser  = (id: string) => void updateUserStatus(id, 'suspended');
  const activateUser = (id: string) => void updateUserStatus(id, 'active');

  // ── Announcements (in-memory) ────────────────────────────────────────────────

  const addAnnouncement = (ann: Omit<Announcement, 'id' | 'sentAt' | 'recipients'>) => {
    const newAnn: Announcement = {
      ...ann,
      id:         `ANN-${Date.now()}`,
      sentAt:     ann.status === 'sent' ? new Date().toLocaleString() : '—',
      // Use real active user count when available, otherwise 0
      recipients: ann.status === 'sent' ? (stats?.activeUsers ?? 0) : 0,
    };
    setAnnouncements(prev => [newAnn, ...prev]);
  };

  // ── Admin account management (in-memory) ─────────────────────────────────────

  const addAdminAccount = ({ name, email, role, pin }: { name: string; email: string; role: AdminRole; pin: string }) => {
    setAdminAccounts(prev => [
      ...prev,
      {
        id:          `ADM-${Date.now()}`,
        name,
        email:       email.trim().toLowerCase(),
        role,
        status:      'active',
        createdAt:   new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        lastLogin:   'Never',
        pin,
        isSuperAdmin: false,
      },
    ]);
  };

  const updateAdminAccount = (id: string, updates: Partial<Pick<AdminAccount, 'name' | 'email' | 'role'>>) => {
    setAdminAccounts(prev =>
      prev.map(a => {
        if (a.id !== id) return a;
        if (a.isSuperAdmin && updates.role && updates.role !== 'super_admin') return a;
        return { ...a, ...updates };
      })
    );
  };

  const changeAdminPin = (id: string, newPin: string) =>
    setAdminAccounts(prev => prev.map(a => a.id === id ? { ...a, pin: newPin } : a));

  const toggleAdminStatus = (id: string) =>
    setAdminAccounts(prev =>
      prev.map(a => {
        if (a.id !== id || a.isSuperAdmin) return a;
        return { ...a, status: a.status === 'active' ? 'disabled' : 'active' };
      })
    );

  const removeAdminAccount = (id: string) =>
    setAdminAccounts(prev => prev.filter(a => a.id !== id || a.isSuperAdmin));

  // ── Context value ────────────────────────────────────────────────────────────

  return (
    <AdminContext.Provider value={{
      isAdminLoggedIn, adminEmail, currentAdminId,
      adminLogin, adminLogout,
      stats, statsLoading, refreshStats,
      users, usersTotal, usersLoading, fetchUsers, updateUserStatus,
      transactions, txnsTotal, txnsLoading, fetchTransactions,
      weeklyRevenue, revenueLoading, fetchWeeklyRevenue,
      servicesData, servicesLoading, fetchServices,
      announcements, addAnnouncement,
      adminAccounts, addAdminAccount, updateAdminAccount,
      changeAdminPin, toggleAdminStatus, removeAdminAccount,
      suspendUser, activateUser,
    }}>
      {children}
    </AdminContext.Provider>
  );
};

export const useAdminContext = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdminContext must be used within AdminProvider');
  return ctx;
};
