/**
 * AdminContext
 *
 * All aggregate statistics, user lists, transaction lists, admin accounts, and
 * audit logs are fetched from real backend endpoints at /api/admin/*.
 *
 * Role-based access is enforced server-side. The frontend uses adminRole for
 * UI gating only — every protected action is independently checked by the API.
 */
import React, { createContext, useContext, useState, ReactNode } from 'react';
import {
  adminAnnouncements as seedAnnouncements,
  AdminUser,
  AdminTransaction,
  AdminStats,
  WeeklyRevenue,
  ServiceBreakdown,
  Announcement,
  AdminAccount,
  AdminRole,
  AuditLogEntry,
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
  adminEmail:      string;
  adminRole:       AdminRole;
  isSuperAdmin:    boolean;
  currentAdminId:  string;
  adminLogin:  (email: string, pin: string) => Promise<boolean>;
  adminLogout: () => void;

  // Stats (from backend)
  stats:        AdminStats | null;
  statsLoading: boolean;
  refreshStats: () => Promise<void>;

  // Users (from backend)
  users:        AdminUser[];
  usersTotal:   number;
  usersLoading: boolean;
  fetchUsers:   (params?: { search?: string; status?: string; kyc?: string; page?: number }) => Promise<void>;
  updateUserStatus: (id: string, status: 'active' | 'suspended') => Promise<boolean>;

  // Transactions (from backend)
  transactions:     AdminTransaction[];
  txnsTotal:        number;
  txnsLoading:      boolean;
  fetchTransactions:(params?: { search?: string; status?: string; type?: string; page?: number }) => Promise<void>;

  // Weekly revenue chart (from backend)
  weeklyRevenue:  WeeklyRevenue[];
  revenueLoading: boolean;
  fetchWeeklyRevenue: () => Promise<void>;

  // Services breakdown (from backend)
  servicesData:    ServiceBreakdown[];
  servicesLoading: boolean;
  fetchServices:   () => Promise<void>;

  // Announcements (in-memory)
  announcements:   Announcement[];
  addAnnouncement: (ann: Omit<Announcement, 'id' | 'sentAt' | 'recipients'>) => void;

  // Admin account management (real backend — super_admin only)
  adminAccounts:       AdminAccount[];
  adminAccountsLoading: boolean;
  fetchAdminAccounts:  () => Promise<void>;
  addAdminAccount:     (data: { name: string; email: string; role: AdminRole; pin: string }) => Promise<boolean>;
  updateAdminAccount:  (id: string, updates: { name?: string; email?: string; role?: AdminRole }) => Promise<boolean>;
  changeAdminPin:      (id: string, newPin: string) => Promise<boolean>;
  toggleAdminStatus:   (id: string, newStatus: 'active' | 'disabled') => Promise<boolean>;
  removeAdminAccount:  (id: string) => Promise<boolean>;

  // Own-account actions (any admin)
  updateOwnProfile: (updates: { name?: string; email?: string }) => Promise<boolean>;
  changeOwnPin:     (currentPin: string, newPin: string) => Promise<{ ok: boolean; error?: string }>;

  // Audit logs (from backend — super_admin only)
  auditLogs:        AuditLogEntry[];
  auditLogsTotal:   number;
  auditLogsLoading: boolean;
  fetchAuditLogs:   (params?: { page?: number; adminId?: string }) => Promise<void>;

  // Legacy compat aliases
  suspendUser: (id: string) => void;
  activateUser:(id: string) => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export const AdminProvider = ({ children }: { children: ReactNode }) => {
  // Auth
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminEmail,      setAdminEmail]      = useState('');
  const [adminRole,       setAdminRole]       = useState<AdminRole>('admin');
  const [currentAdminId,  setCurrentAdminId]  = useState('');

  // Stats
  const [stats,        setStats]        = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Users
  const [users,        setUsers]        = useState<AdminUser[]>([]);
  const [usersTotal,   setUsersTotal]   = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);

  // Transactions
  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [txnsTotal,    setTxnsTotal]    = useState(0);
  const [txnsLoading,  setTxnsLoading]  = useState(false);

  // Weekly revenue
  const [weeklyRevenue,  setWeeklyRevenue]  = useState<WeeklyRevenue[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(false);

  // Services
  const [servicesData,    setServicesData]    = useState<ServiceBreakdown[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);

  // Announcements (in-memory)
  const [announcements, setAnnouncements] = useState<Announcement[]>(seedAnnouncements);

  // Admin accounts (from backend)
  const [adminAccounts,        setAdminAccounts]        = useState<AdminAccount[]>([]);
  const [adminAccountsLoading, setAdminAccountsLoading] = useState(false);

  // Audit logs (from backend)
  const [auditLogs,        setAuditLogs]        = useState<AuditLogEntry[]>([]);
  const [auditLogsTotal,   setAuditLogsTotal]   = useState(0);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);

  const isSuperAdmin = adminRole === 'super_admin';

  // ── Data fetchers ─────────────────────────────────────────────────────────

  async function refreshStats() {
    setStatsLoading(true);
    try {
      const res = await adminApi('/api/admin/stats');
      if (res.ok) setStats(await res.json() as AdminStats);
    } catch { /* silent */ }
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

  async function fetchAdminAccounts() {
    setAdminAccountsLoading(true);
    try {
      const res = await adminApi('/api/admin/admins');
      if (res.ok) {
        const data = await res.json() as { admins: Array<{
          id: string; name: string; email: string; role: AdminRole;
          status: 'active' | 'disabled'; lastLoginAt: string | null; createdAt: string;
        }> };
        setAdminAccounts(data.admins.map(a => ({
          id:          a.id,
          name:        a.name,
          email:       a.email,
          role:        a.role,
          status:      a.status,
          createdAt:   new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          lastLogin:   a.lastLoginAt
            ? new Date(a.lastLoginAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : 'Never',
          isSuperAdmin: a.role === 'super_admin',
        })));
      }
    } catch { /* silent */ }
    finally { setAdminAccountsLoading(false); }
  }

  async function fetchAuditLogs(params?: { page?: number; adminId?: string }) {
    setAuditLogsLoading(true);
    try {
      const qs = new URLSearchParams();
      if (params?.page)    qs.set('page',    String(params.page));
      if (params?.adminId) qs.set('adminId', params.adminId);
      qs.set('limit', '50');
      const res = await adminApi(`/api/admin/audit-logs?${qs}`);
      if (res.ok) {
        const data = await res.json() as { logs: AuditLogEntry[]; total: number };
        setAuditLogs(data.logs);
        setAuditLogsTotal(data.total);
      }
    } catch { /* silent */ }
    finally { setAuditLogsLoading(false); }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  const adminLogin = async (email: string, pin: string): Promise<boolean> => {
    try {
      const res = await adminApi('/api/admin/session', {
        method: 'POST',
        body:   JSON.stringify({ email: email.trim().toLowerCase(), pin }),
      });
      if (!res.ok) return false;

      const data = await res.json() as { ok: boolean; id: string; name: string; email: string; role: AdminRole };
      const role  = data.role ?? 'admin';

      setIsAdminLoggedIn(true);
      setAdminEmail(data.email);
      setAdminRole(role);
      setCurrentAdminId(data.id);

      // Fetch all dashboard data in parallel
      const fetches: Promise<void>[] = [
        refreshStats(),
        fetchWeeklyRevenue(),
        fetchServices(),
        fetchUsers(),
        fetchTransactions(),
      ];
      // Fetch admin-management data if super admin
      if (role === 'super_admin') {
        fetches.push(fetchAdminAccounts());
        fetches.push(fetchAuditLogs());
      }
      void Promise.all(fetches);

      return true;
    } catch {
      return false;
    }
  };

  const adminLogout = () => {
    void adminApi('/api/admin/session', { method: 'DELETE' });
    setIsAdminLoggedIn(false);
    setAdminEmail('');
    setAdminRole('admin');
    setCurrentAdminId('');
    setStats(null);
    setUsers([]);
    setTransactions([]);
    setWeeklyRevenue([]);
    setServicesData([]);
    setAdminAccounts([]);
    setAuditLogs([]);
  };

  // ── User status ───────────────────────────────────────────────────────────

  const updateUserStatus = async (id: string, status: 'active' | 'suspended'): Promise<boolean> => {
    try {
      const res = await adminApi(`/api/admin/users/${id}/status`, {
        method: 'PATCH',
        body:   JSON.stringify({ status }),
      });
      if (!res.ok) return false;
      setUsers(prev => prev.map(u => u.id === id ? { ...u, status } : u));
      void refreshStats();
      return true;
    } catch { return false; }
  };

  const suspendUser  = (id: string) => void updateUserStatus(id, 'suspended');
  const activateUser = (id: string) => void updateUserStatus(id, 'active');

  // ── Admin CRUD (super_admin only — backend enforces) ──────────────────────

  const addAdminAccount = async (data: { name: string; email: string; role: AdminRole; pin: string }): Promise<boolean> => {
    try {
      const res = await adminApi('/api/admin/admins', {
        method: 'POST',
        body:   JSON.stringify(data),
      });
      if (!res.ok) return false;
      await fetchAdminAccounts();
      return true;
    } catch { return false; }
  };

  const updateAdminAccount = async (id: string, updates: { name?: string; email?: string; role?: AdminRole }): Promise<boolean> => {
    try {
      const res = await adminApi(`/api/admin/admins/${id}`, {
        method: 'PATCH',
        body:   JSON.stringify(updates),
      });
      if (!res.ok) return false;
      await fetchAdminAccounts();
      return true;
    } catch { return false; }
  };

  const changeAdminPin = async (id: string, newPin: string): Promise<boolean> => {
    try {
      const res = await adminApi(`/api/admin/admins/${id}/pin`, {
        method: 'PATCH',
        body:   JSON.stringify({ newPin }),
      });
      return res.ok;
    } catch { return false; }
  };

  const toggleAdminStatus = async (id: string, newStatus: 'active' | 'disabled'): Promise<boolean> => {
    try {
      const res = await adminApi(`/api/admin/admins/${id}/status`, {
        method: 'PATCH',
        body:   JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) return false;
      setAdminAccounts(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
      return true;
    } catch { return false; }
  };

  const removeAdminAccount = async (id: string): Promise<boolean> => {
    try {
      const res = await adminApi(`/api/admin/admins/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      setAdminAccounts(prev => prev.filter(a => a.id !== id));
      return true;
    } catch { return false; }
  };

  // ── Own-account actions ───────────────────────────────────────────────────

  const updateOwnProfile = async (updates: { name?: string; email?: string }): Promise<boolean> => {
    try {
      const res = await adminApi('/api/admin/me', {
        method: 'PATCH',
        body:   JSON.stringify(updates),
      });
      if (!res.ok) return false;
      if (updates.email) setAdminEmail(updates.email);
      return true;
    } catch { return false; }
  };

  const changeOwnPin = async (currentPin: string, newPin: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await adminApi('/api/admin/me/pin', {
        method: 'PATCH',
        body:   JSON.stringify({ currentPin, newPin }),
      });
      if (res.ok) return { ok: true };
      const body = await res.json() as { error?: string };
      return { ok: false, error: body.error ?? 'Failed to change PIN.' };
    } catch {
      return { ok: false, error: 'Network error.' };
    }
  };

  // ── Announcements (in-memory) ─────────────────────────────────────────────

  const addAnnouncement = (ann: Omit<Announcement, 'id' | 'sentAt' | 'recipients'>) => {
    const newAnn: Announcement = {
      ...ann,
      id:         `ANN-${Date.now()}`,
      sentAt:     ann.status === 'sent' ? new Date().toLocaleString() : '—',
      recipients: ann.status === 'sent' ? (stats?.activeUsers ?? 0) : 0,
    };
    setAnnouncements(prev => [newAnn, ...prev]);
  };

  // ── Context value ─────────────────────────────────────────────────────────

  return (
    <AdminContext.Provider value={{
      isAdminLoggedIn, adminEmail, adminRole, isSuperAdmin, currentAdminId,
      adminLogin, adminLogout,
      stats, statsLoading, refreshStats,
      users, usersTotal, usersLoading, fetchUsers, updateUserStatus,
      transactions, txnsTotal, txnsLoading, fetchTransactions,
      weeklyRevenue, revenueLoading, fetchWeeklyRevenue,
      servicesData, servicesLoading, fetchServices,
      announcements, addAnnouncement,
      adminAccounts, adminAccountsLoading, fetchAdminAccounts,
      addAdminAccount, updateAdminAccount, changeAdminPin,
      toggleAdminStatus, removeAdminAccount,
      updateOwnProfile, changeOwnPin,
      auditLogs, auditLogsTotal, auditLogsLoading, fetchAuditLogs,
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
