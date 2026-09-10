/**
 * AdminContext
 *
 * All aggregate statistics, user lists, transaction lists, admin accounts, and
 * audit logs are fetched from real backend endpoints at /api/admin/*.
 *
 * Role-based access is enforced server-side. The frontend uses adminRole for
 * UI gating only — every protected action is independently checked by the API.
 */
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
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

export function adminApi(path: string, opts: RequestInit = {}): Promise<Response> {
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
  isAdminLoggedIn: boolean;
  isAdminLoading: boolean;
  adminEmail: string;
  adminRole: AdminRole;
  isSuperAdmin: boolean;
  currentAdminId: string;
  adminLogin: (email: string, pin: string) => Promise<boolean>;
  adminLogout: () => void;

  api: (path: string, opts?: RequestInit) => Promise<Response>;

  stats: AdminStats | null;
  statsLoading: boolean;
  refreshStats: () => Promise<void>;

  users: AdminUser[];
  usersTotal: number;
  usersLoading: boolean;
  fetchUsers: (params?: {
    search?: string;
    status?: string;
    kyc?: string;
    page?: number;
  }) => Promise<void>;
  updateUserStatus: (
    id: string,
    status: 'active' | 'suspended'
  ) => Promise<boolean>;

  transactions: AdminTransaction[];
  txnsTotal: number;
  txnsLoading: boolean;
  fetchTransactions: (params?: {
    search?: string;
    status?: string;
    type?: string;
    page?: number;
  }) => Promise<void>;

  weeklyRevenue: WeeklyRevenue[];
  revenueLoading: boolean;
  fetchWeeklyRevenue: () => Promise<void>;

  servicesData: ServiceBreakdown[];
  servicesLoading: boolean;
  fetchServices: () => Promise<void>;

  announcements: Announcement[];
  addAnnouncement: (
    ann: Omit<Announcement, 'id' | 'sentAt' | 'recipients'>
  ) => void;
  broadcastNotification: (
    title: string,
    body: string
  ) => Promise<{ ok: boolean; sent: number; error?: string }>;
  sendTargetedNotification: (
    userIds: string[],
    title: string,
    body: string
  ) => Promise<{ ok: boolean; sent: number; error?: string }>;

  adminAccounts: AdminAccount[];
  adminAccountsLoading: boolean;
  fetchAdminAccounts: () => Promise<void>;
  addAdminAccount: (data: {
    name: string;
    email: string;
    role: AdminRole;
    pin: string;
  }) => Promise<boolean>;
  updateAdminAccount: (
    id: string,
    updates: { name?: string; email?: string; role?: AdminRole }
  ) => Promise<boolean>;
  changeAdminPin: (id: string, newPin: string) => Promise<boolean>;
  toggleAdminStatus: (
    id: string,
    newStatus: 'active' | 'disabled'
  ) => Promise<boolean>;
  removeAdminAccount: (id: string) => Promise<boolean>;

  updateOwnProfile: (updates: {
    name?: string;
    email?: string;
  }) => Promise<boolean>;
  changeOwnPin: (
    currentPin: string,
    newPin: string
  ) => Promise<{ ok: boolean; error?: string }>;

  auditLogs: AuditLogEntry[];
  auditLogsTotal: number;
  auditLogsLoading: boolean;
  fetchAuditLogs: (params?: {
    page?: number;
    adminId?: string;
  }) => Promise<void>;

  suspendUser: (id: string) => void;
  activateUser: (id: string) => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

// ── Safe response normalizers ────────────────────────────────────────────────

const toNumber = (value: unknown, fallback = 0): number => {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const normalizeStats = (value: unknown): AdminStats => {
  const raw =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  const users = toNumber(raw.users);
  const transactions = toNumber(raw.transactions);

  return {
    totalUsers: toNumber(raw.totalUsers, users),
    activeUsers: toNumber(raw.activeUsers, users),
    suspendedUsers: toNumber(raw.suspendedUsers),
    verifiedUsers: toNumber(raw.verifiedUsers),
    pendingKycUsers: toNumber(raw.pendingKycUsers),
    unverifiedUsers: toNumber(raw.unverifiedUsers),

    totalTransactions: toNumber(
      raw.totalTransactions,
      transactions
    ),
    successfulTransactions: toNumber(raw.successfulTransactions),
    pendingTransactions: toNumber(raw.pendingTransactions),
    failedTransactions: toNumber(raw.failedTransactions),

    totalRevenue: toNumber(raw.totalRevenue),
    todayRevenue: toNumber(raw.todayRevenue),
    weekRevenue: toNumber(raw.weekRevenue),
    monthRevenue: toNumber(raw.monthRevenue),

    totalWalletBalance: toNumber(raw.totalWalletBalance),
    avgTransactionValue: toNumber(raw.avgTransactionValue),
  };
};

const normalizeWeeklyRevenue = (value: unknown): WeeklyRevenue[] => {
  let raw: unknown[] = [];

  if (Array.isArray(value)) {
    raw = value;
  } else if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { revenue?: unknown }).revenue)
  ) {
    raw = (value as { revenue: unknown[] }).revenue;
  }

  return raw.map((item) => {
    const row =
      item && typeof item === 'object'
        ? (item as Record<string, unknown>)
        : {};

    return {
      day: String(row.day ?? row.date ?? ''),
      amount: toNumber(row.amount ?? row.revenue),
    };
  });
};

const normalizeServices = (value: unknown): ServiceBreakdown[] => {
  let raw: unknown[] = [];

  if (Array.isArray(value)) {
    raw = value;
  } else if (
    value &&
    typeof value === 'object' &&
    Array.isArray((value as { services?: unknown }).services)
  ) {
    raw = (value as { services: unknown[] }).services;
  }

  return raw.map((item) => {
    const row =
      item && typeof item === 'object'
        ? (item as Record<string, unknown>)
        : {};

    return {
      type: String(row.type ?? row.service ?? ''),
      total: toNumber(row.total),
      successful: toNumber(row.successful),
      pending: toNumber(row.pending),
      failed: toNumber(row.failed),
      revenue: toNumber(row.revenue),
      successRate: toNumber(row.successRate),
    };
  });
};

// ── Provider ─────────────────────────────────────────────────────────────────

export const AdminProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [isAdminLoading, setIsAdminLoading] = useState(true);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminRole, setAdminRole] = useState<AdminRole>('admin');
  const [currentAdminId, setCurrentAdminId] = useState('');

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersLoading, setUsersLoading] = useState(false);

  const [transactions, setTransactions] = useState<AdminTransaction[]>([]);
  const [txnsTotal, setTxnsTotal] = useState(0);
  const [txnsLoading, setTxnsLoading] = useState(false);

  const [weeklyRevenue, setWeeklyRevenue] = useState<WeeklyRevenue[]>([]);
  const [revenueLoading, setRevenueLoading] = useState(false);

  const [servicesData, setServicesData] = useState<ServiceBreakdown[]>([]);
  const [servicesLoading, setServicesLoading] = useState(false);

  const [announcements, setAnnouncements] =
    useState<Announcement[]>(seedAnnouncements);

  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([]);
  const [adminAccountsLoading, setAdminAccountsLoading] = useState(false);

  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [auditLogsTotal, setAuditLogsTotal] = useState(0);
  const [auditLogsLoading, setAuditLogsLoading] = useState(false);

  const isSuperAdmin = adminRole === 'super_admin';

  // ── Data fetchers ─────────────────────────────────────────────────────────

  async function refreshStats() {
    setStatsLoading(true);

    try {
      const res = await adminApi('/api/admin/stats');

      if (res.ok) {
        const data = await res.json();
        setStats(normalizeStats(data));
      }
    } catch (err) {
      console.warn('refreshStats failed:', err);
    } finally {
      setStatsLoading(false);
    }
  }

  async function fetchWeeklyRevenue() {
    setRevenueLoading(true);

    try {
      const res = await adminApi('/api/admin/revenue/weekly');

      if (res.ok) {
        const data = await res.json();
        setWeeklyRevenue(normalizeWeeklyRevenue(data));
      }
    } catch (err) {
      console.warn('fetchWeeklyRevenue failed:', err);
    } finally {
      setRevenueLoading(false);
    }
  }

  async function fetchServices() {
    setServicesLoading(true);

    try {
      const res = await adminApi('/api/admin/services');

      if (res.ok) {
        const data = await res.json();
        setServicesData(normalizeServices(data));
      }
    } catch (err) {
      console.warn('fetchServices failed:', err);
    } finally {
      setServicesLoading(false);
    }
  }

  async function fetchUsers(params?: {
    search?: string;
    status?: string;
    kyc?: string;
    page?: number;
  }) {
    setUsersLoading(true);

    try {
      const qs = new URLSearchParams();

      if (params?.search) qs.set('search', params.search);
      if (params?.status) qs.set('status', params.status);
      if (params?.kyc) qs.set('kyc', params.kyc);
      if (params?.page) qs.set('page', String(params.page));

      qs.set('limit', '50');

      const res = await adminApi(`/api/admin/users?${qs}`);

      if (res.ok) {
        const data = (await res.json()) as {
          users?: AdminUser[];
          total?: number;
        };

        const list = Array.isArray(data.users)
          ? data.users
          : [];

        setUsers(list);
        setUsersTotal(toNumber(data.total, list.length));
      }
    } catch (err) {
      console.warn('fetchUsers failed:', err);
    } finally {
      setUsersLoading(false);
    }
  }

  async function fetchTransactions(params?: {
    search?: string;
    status?: string;
    type?: string;
    page?: number;
  }) {
    setTxnsLoading(true);

    try {
      const qs = new URLSearchParams();

      if (params?.search) qs.set('search', params.search);
      if (params?.status) qs.set('status', params.status);
      if (params?.type) qs.set('type', params.type);
      if (params?.page) qs.set('page', String(params.page));

      qs.set('limit', '50');

      const res = await adminApi(
        `/api/admin/transactions?${qs}`
      );

      if (res.ok) {
        const data = (await res.json()) as {
          transactions?: AdminTransaction[];
          total?: number;
        };

        const list = Array.isArray(data.transactions)
          ? data.transactions
          : [];

        setTransactions(list);
        setTxnsTotal(toNumber(data.total, list.length));
      }
    } catch (err) {
      console.warn('fetchTransactions failed:', err);
    } finally {
      setTxnsLoading(false);
    }
  }

  async function fetchAdminAccounts() {
    setAdminAccountsLoading(true);

    try {
      const res = await adminApi('/api/admin/admins');

      if (res.ok) {
        const data = (await res.json()) as {
          admins: Array<{
            id: string;
            name: string;
            email: string;
            role: AdminRole;
            status: 'active' | 'disabled';
            lastLoginAt: string | null;
            createdAt: string;
          }>;
        };

        const admins = Array.isArray(data.admins)
          ? data.admins
          : [];

        setAdminAccounts(
          admins.map((a) => ({
            id: a.id,
            name: a.name,
            email: a.email,
            role: a.role,
            status: a.status,
            createdAt: new Date(
              a.createdAt
            ).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }),
            lastLogin: a.lastLoginAt
              ? new Date(
                  a.lastLoginAt
                ).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'Never',
            isSuperAdmin: a.role === 'super_admin',
          }))
        );
      }
    } catch (err) {
      console.warn('fetchAdminAccounts failed:', err);
    } finally {
      setAdminAccountsLoading(false);
    }
  }

  async function fetchAuditLogs(params?: {
    page?: number;
    adminId?: string;
  }) {
    setAuditLogsLoading(true);

    try {
      const qs = new URLSearchParams();

      if (params?.page) qs.set('page', String(params.page));
      if (params?.adminId) qs.set('adminId', params.adminId);

      qs.set('limit', '50');

      const res = await adminApi(
        `/api/admin/audit-logs?${qs}`
      );

      if (res.ok) {
        const data = (await res.json()) as {
          logs?: AuditLogEntry[];
          total?: number;
        };

        const logs = Array.isArray(data.logs)
          ? data.logs
          : [];

        setAuditLogs(logs);
        setAuditLogsTotal(
          toNumber(data.total, logs.length)
        );
      }
    } catch (err) {
      console.warn('fetchAuditLogs failed:', err);
    } finally {
      setAuditLogsLoading(false);
    }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  const adminLogin = async (
    email: string,
    pin: string
  ): Promise<boolean> => {
    try {
      const res = await adminApi('/api/admin/session', {
        method: 'POST',
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          pin,
        }),
      });

      if (!res.ok) return false;

      const data = (await res.json()) as {
        ok: boolean;
        id: string;
        name: string;
        email: string;
        role: AdminRole;
      };

      const role = data.role ?? 'admin';

      setIsAdminLoggedIn(true);
      setAdminEmail(data.email);
      setAdminRole(role);
      setCurrentAdminId(data.id);

      const fetches: Promise<void>[] = [
        refreshStats(),
        fetchWeeklyRevenue(),
        fetchServices(),
        fetchUsers(),
        fetchTransactions(),
      ];

      if (role === 'super_admin') {
        fetches.push(
          fetchAdminAccounts(),
          fetchAuditLogs()
        );
      }

      void Promise.allSettled(fetches);

      return true;
    } catch {
      return false;
    }
  };

  const adminLogout = () => {
    void adminApi('/api/admin/session', {
      method: 'DELETE',
    });

    setIsAdminLoggedIn(false);
    setAdminEmail('');
    setAdminRole('admin');
    setCurrentAdminId('');

    setStats(null);
    setUsers([]);
    setUsersTotal(0);

    setTransactions([]);
    setTxnsTotal(0);

    setWeeklyRevenue([]);
    setServicesData([]);

    setAdminAccounts([]);
    setAuditLogs([]);
    setAuditLogsTotal(0);

    setAnnouncements(seedAnnouncements);
  };

  // ── User status ───────────────────────────────────────────────────────────

  const updateUserStatus = async (
    id: string,
    status: 'active' | 'suspended'
  ): Promise<boolean> => {
    try {
      const res = await adminApi(
        `/api/admin/users/${id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        }
      );

      if (!res.ok) return false;

      setUsers((prev) =>
        prev.map((u) =>
          u.id === id ? { ...u, status } : u
        )
      );

      void refreshStats();

      return true;
    } catch {
      return false;
    }
  };

  const suspendUser = (id: string) =>
    void updateUserStatus(id, 'suspended');

  const activateUser = (id: string) =>
    void updateUserStatus(id, 'active');

  // ── Admin CRUD ────────────────────────────────────────────────────────────

  const addAdminAccount = async (data: {
    name: string;
    email: string;
    role: AdminRole;
    pin: string;
  }): Promise<boolean> => {
    try {
      const res = await adminApi('/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify(data),
      });

      if (!res.ok) return false;

      await fetchAdminAccounts();
      return true;
    } catch {
      return false;
    }
  };

  const updateAdminAccount = async (
    id: string,
    updates: {
      name?: string;
      email?: string;
      role?: AdminRole;
    }
  ): Promise<boolean> => {
    try {
      const res = await adminApi(
        `/api/admin/admins/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(updates),
        }
      );

      if (!res.ok) return false;

      await fetchAdminAccounts();
      return true;
    } catch {
      return false;
    }
  };

  const changeAdminPin = async (
    id: string,
    newPin: string
  ): Promise<boolean> => {
    try {
      const res = await adminApi(
        `/api/admin/admins/${id}/pin`,
        {
          method: 'PATCH',
          body: JSON.stringify({ newPin }),
        }
      );

      return res.ok;
    } catch {
      return false;
    }
  };

  const toggleAdminStatus = async (
    id: string,
    newStatus: 'active' | 'disabled'
  ): Promise<boolean> => {
    try {
      const res = await adminApi(
        `/api/admin/admins/${id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: newStatus,
          }),
        }
      );

      if (!res.ok) return false;

      setAdminAccounts((prev) =>
        prev.map((a) =>
          a.id === id
            ? { ...a, status: newStatus }
            : a
        )
      );

      return true;
    } catch {
      return false;
    }
  };

  const removeAdminAccount = async (
    id: string
  ): Promise<boolean> => {
    try {
      const res = await adminApi(
        `/api/admin/admins/${id}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) return false;

      setAdminAccounts((prev) =>
        prev.filter((a) => a.id !== id)
      );

      return true;
    } catch {
      return false;
    }
  };

  // ── Own-account actions ───────────────────────────────────────────────────

  const updateOwnProfile = async (updates: {
    name?: string;
    email?: string;
  }): Promise<boolean> => {
    try {
      const res = await adminApi('/api/admin/me', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });

      if (!res.ok) return false;

      if (updates.email) {
        setAdminEmail(updates.email);
      }

      return true;
    } catch {
      return false;
    }
  };

  const changeOwnPin = async (
    currentPin: string,
    newPin: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await adminApi('/api/admin/me/pin', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPin,
          newPin,
        }),
      });

      if (res.ok) {
        return { ok: true };
      }

      const body = (await res.json()) as {
        error?: string;
      };

      return {
        ok: false,
        error: body.error ?? 'Failed to change PIN.',
      };
    } catch {
      return {
        ok: false,
        error: 'Network error.',
      };
    }
  };

  // ── Announcements ─────────────────────────────────────────────────────────

  const addAnnouncement = (
    ann: Omit<
      Announcement,
      'id' | 'sentAt' | 'recipients'
    >
  ) => {
    const newAnn: Announcement = {
      ...ann,
      id: `ANN-${Date.now()}`,
      sentAt:
        ann.status === 'sent'
          ? new Date().toLocaleString()
          : '—',
      recipients:
        ann.status === 'sent'
          ? stats?.activeUsers ?? 0
          : 0,
    };

    setAnnouncements((prev) => [
      newAnn,
      ...prev,
    ]);
  };

  // ── Notifications ────────────────────────────────────────────────────────

  const broadcastNotification = async (
    title: string,
    body: string
  ): Promise<{
    ok: boolean;
    sent: number;
    error?: string;
  }> => {
    try {
      const res = await adminApi(
        '/api/admin/notifications/broadcast',
        {
          method: 'POST',
          body: JSON.stringify({
            title,
            body,
            type: 'system',
          }),
        }
      );

      if (!res.ok) {
        const err = (await res.json()) as {
          error?: string;
        };

        return {
          ok: false,
          sent: 0,
          error:
            err.error ??
            'Failed to broadcast.',
        };
      }

      const data = (await res.json()) as {
        ok: boolean;
        sent: number;
      };

      addAnnouncement({
        title,
        body,
        target: 'all',
        status: 'sent',
      });

      return {
        ok: true,
        sent: data.sent,
      };
    } catch {
      return {
        ok: false,
        sent: 0,
        error: 'Network error.',
      };
    }
  };

  const sendTargetedNotification = async (
    userIds: string[],
    title: string,
    body: string
  ): Promise<{
    ok: boolean;
    sent: number;
    error?: string;
  }> => {
    try {
      const res = await adminApi(
        '/api/admin/notifications/targeted',
        {
          method: 'POST',
          body: JSON.stringify({
            userIds,
            title,
            body,
            type: 'system',
          }),
        }
      );

      if (!res.ok) {
        const err = (await res.json()) as {
          error?: string;
        };

        return {
          ok: false,
          sent: 0,
          error: err.error ?? 'Failed.',
        };
      }

      const data = (await res.json()) as {
        ok: boolean;
        sent: number;
      };

      return {
        ok: true,
        sent: data.sent,
      };
    } catch {
      return {
        ok: false,
        sent: 0,
        error: 'Network error.',
      };
    }
  };

  // ── Session restoration ──────────────────────────────────────────────────

  useEffect(() => {
    adminApi('/api/admin/me')
      .then(async (res) => {
        if (!res.ok) return;

        const data = (await res.json()) as {
          id: string;
          name: string;
          email: string;
          role: AdminRole;
          status: string;
        };

        if (!data.id) return;

        const role = data.role ?? 'admin';

        setIsAdminLoggedIn(true);
        setAdminEmail(data.email);
        setAdminRole(role);
        setCurrentAdminId(data.id);

        const fetches: Promise<void>[] = [
          refreshStats(),
          fetchWeeklyRevenue(),
          fetchServices(),
          fetchUsers(),
          fetchTransactions(),
        ];

        if (role === 'super_admin') {
          fetches.push(
            fetchAdminAccounts(),
            fetchAuditLogs()
          );
        }

        void Promise.allSettled(fetches);
      })
      .catch(() => {})
      .finally(() => {
        setIsAdminLoading(false);
      });
  }, []);

  // ── Context value ─────────────────────────────────────────────────────────

  return (
    <AdminContext.Provider
      value={{
        isAdminLoggedIn,
        isAdminLoading,
        adminEmail,
        adminRole,
        isSuperAdmin,
        currentAdminId,

        adminLogin,
        adminLogout,

        api: adminApi,

        stats,
        statsLoading,
        refreshStats,

        users,
        usersTotal,
        usersLoading,
        fetchUsers,
        updateUserStatus,

        transactions,
        txnsTotal,
        txnsLoading,
        fetchTransactions,

        weeklyRevenue,
        revenueLoading,
        fetchWeeklyRevenue,

        servicesData,
        servicesLoading,
        fetchServices,

        announcements,
        addAnnouncement,
        broadcastNotification,
        sendTargetedNotification,

        adminAccounts,
        adminAccountsLoading,
        fetchAdminAccounts,
        addAdminAccount,
        updateAdminAccount,
        changeAdminPin,
        toggleAdminStatus,
        removeAdminAccount,

        updateOwnProfile,
        changeOwnPin,

        auditLogs,
        auditLogsTotal,
        auditLogsLoading,
        fetchAuditLogs,

        suspendUser,
        activateUser,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export const useAdminContext = () => {
  const ctx = useContext(AdminContext);

  if (!ctx) {
    throw new Error(
      'useAdminContext must be used within AdminProvider'
    );
  }

  return ctx;
};
