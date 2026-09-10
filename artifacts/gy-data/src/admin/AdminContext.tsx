/**
 * AdminContext
 *
 * All aggregate statistics, user lists, transaction lists, admin accounts, and
 * audit logs are fetched from real backend endpoints at /api/admin/*.
 *
 * Role-based access is enforced server-side. The frontend uses adminRole for
 * UI gating only — every protected action is independently checked by the API.
 */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';

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

export function adminApi(
  path: string,
  opts: RequestInit = {},
): Promise<Response> {
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

// ── Backend response helpers ─────────────────────────────────────────────────

type BackendStats = Partial<AdminStats> & {
  users?: number;
  transactions?: number;
};

type BackendRevenueRow = {
  day?: string;
  date?: string;
  amount?: number;
  revenue?: number;
};

type BackendServiceRow = Record<string, unknown>;

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeStats(data: BackendStats): AdminStats {
  const totalUsers = toNumber(data.totalUsers ?? data.users);
  const totalTransactions = toNumber(
    data.totalTransactions ?? data.transactions,
  );

  return {
    totalUsers,
    activeUsers: toNumber(data.activeUsers, totalUsers),
    suspendedUsers: toNumber(data.suspendedUsers),
    verifiedUsers: toNumber(data.verifiedUsers),
    pendingKycUsers: toNumber(data.pendingKycUsers),
    unverifiedUsers: toNumber(data.unverifiedUsers),

    totalTransactions,

    successfulTransactions: toNumber(data.successfulTransactions),
    pendingTransactions: toNumber(data.pendingTransactions),
    failedTransactions: toNumber(data.failedTransactions),

    totalRevenue: toNumber(data.totalRevenue),
    todayRevenue: toNumber(data.todayRevenue),
    weekRevenue: toNumber(data.weekRevenue),
    monthRevenue: toNumber(data.monthRevenue),

    totalWalletBalance: toNumber(data.totalWalletBalance),
    avgTransactionValue: toNumber(data.avgTransactionValue),
  };
}

function normalizeWeeklyRevenue(
  data:
    | BackendRevenueRow[]
    | {
        revenue?: BackendRevenueRow[];
      },
): WeeklyRevenue[] {
  const rows = Array.isArray(data) ? data : data.revenue ?? [];

  return rows.map((row, index) => ({
    day: String(
      row.day ??
        row.date ??
        `Day ${index + 1}`,
    ),
    amount: toNumber(row.amount ?? row.revenue),
  }));
}

function normalizeServices(
  data:
    | BackendServiceRow[]
    | {
        services?: BackendServiceRow[];
      },
): ServiceBreakdown[] {
  const rows = Array.isArray(data) ? data : data.services ?? [];

  return rows.map((row, index) => {
    const total = toNumber(
      row.total ??
        row.count ??
        row.transactions ??
        row.transactionCount,
    );

    const successful = toNumber(
      row.successful ??
        row.success ??
        row.successfulTransactions,
    );

    const pending = toNumber(
      row.pending ??
        row.pendingTransactions,
    );

    const failed = toNumber(
      row.failed ??
        row.failedTransactions,
    );

    const revenue = toNumber(
      row.revenue ??
        row.amount ??
        row.totalRevenue,
    );

    const successRate = toNumber(
      row.successRate ??
        (total > 0 ? (successful / total) * 100 : 0),
    );

    return {
      type: String(
        row.type ??
          row.service ??
          row.name ??
          `service-${index + 1}`,
      ),
      total,
      successful,
      pending,
      failed,
      revenue,
      successRate,
    };
  });
}

// ── Context type ──────────────────────────────────────────────────────────────

interface AdminContextType {
  // Auth
  isAdminLoggedIn: boolean;
  isAdminLoading: boolean;
  adminEmail: string;
  adminRole: AdminRole;
  isSuperAdmin: boolean;
  currentAdminId: string;

  adminLogin: (
    email: string,
    pin: string,
  ) => Promise<boolean>;

  adminLogout: () => void;

  // API helper
  api: (
    path: string,
    opts?: RequestInit,
  ) => Promise<Response>;

  // Stats
  stats: AdminStats | null;
  statsLoading: boolean;
  refreshStats: () => Promise<void>;

  // Users
  users: AdminUser[];
  usersTotal: number;
  usersLoading: boolean;

  fetchUsers: (
    params?: {
      search?: string;
      status?: string;
      kyc?: string;
      page?: number;
    },
  ) => Promise<void>;

  updateUserStatus: (
    id: string,
    status: 'active' | 'suspended',
  ) => Promise<boolean>;

  // Transactions
  transactions: AdminTransaction[];
  txnsTotal: number;
  txnsLoading: boolean;

  fetchTransactions: (
    params?: {
      search?: string;
      status?: string;
      type?: string;
      page?: number;
    },
  ) => Promise<void>;

  // Weekly revenue
  weeklyRevenue: WeeklyRevenue[];
  revenueLoading: boolean;
  fetchWeeklyRevenue: () => Promise<void>;

  // Services
  servicesData: ServiceBreakdown[];
  servicesLoading: boolean;
  fetchServices: () => Promise<void>;

  // Announcements
  announcements: Announcement[];

  addAnnouncement: (
    ann: Omit<
      Announcement,
      'id' | 'sentAt' | 'recipients'
    >,
  ) => void;

  broadcastNotification: (
    title: string,
    body: string,
  ) => Promise<{
    ok: boolean;
    sent: number;
    error?: string;
  }>;

  sendTargetedNotification: (
    userIds: string[],
    title: string,
    body: string,
  ) => Promise<{
    ok: boolean;
    sent: number;
    error?: string;
  }>;

  // Admin accounts
  adminAccounts: AdminAccount[];
  adminAccountsLoading: boolean;

  fetchAdminAccounts: () => Promise<void>;

  addAdminAccount: (
    data: {
      name: string;
      email: string;
      role: AdminRole;
      pin: string;
    },
  ) => Promise<boolean>;

  updateAdminAccount: (
    id: string,
    updates: {
      name?: string;
      email?: string;
      role?: AdminRole;
    },
  ) => Promise<boolean>;

  changeAdminPin: (
    id: string,
    newPin: string,
  ) => Promise<boolean>;

  toggleAdminStatus: (
    id: string,
    newStatus: 'active' | 'disabled',
  ) => Promise<boolean>;

  removeAdminAccount: (
    id: string,
  ) => Promise<boolean>;

  // Own account
  updateOwnProfile: (
    updates: {
      name?: string;
      email?: string;
    },
  ) => Promise<boolean>;

  changeOwnPin: (
    currentPin: string,
    newPin: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;

  // Audit logs
  auditLogs: AuditLogEntry[];
  auditLogsTotal: number;
  auditLogsLoading: boolean;

  fetchAuditLogs: (
    params?: {
      page?: number;
      adminId?: string;
    },
  ) => Promise<void>;

  // Legacy compatibility
  suspendUser: (id: string) => void;
  activateUser: (id: string) => void;
}

const AdminContext =
  createContext<AdminContextType | undefined>(undefined);

// ── Provider ──────────────────────────────────────────────────────────────────

export const AdminProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  // Auth
  const [isAdminLoggedIn, setIsAdminLoggedIn] =
    useState(false);

  const [isAdminLoading, setIsAdminLoading] =
    useState(true);

  const [adminEmail, setAdminEmail] =
    useState('');

  const [adminRole, setAdminRole] =
    useState<AdminRole>('admin');

  const [currentAdminId, setCurrentAdminId] =
    useState('');

  // Stats
  const [stats, setStats] =
    useState<AdminStats | null>(null);

  const [statsLoading, setStatsLoading] =
    useState(false);

  // Users
  const [users, setUsers] =
    useState<AdminUser[]>([]);

  const [usersTotal, setUsersTotal] =
    useState(0);

  const [usersLoading, setUsersLoading] =
    useState(false);

  // Transactions
  const [transactions, setTransactions] =
    useState<AdminTransaction[]>([]);

  const [txnsTotal, setTxnsTotal] =
    useState(0);

  const [txnsLoading, setTxnsLoading] =
    useState(false);

  // Weekly revenue
  const [weeklyRevenue, setWeeklyRevenue] =
    useState<WeeklyRevenue[]>([]);

  const [revenueLoading, setRevenueLoading] =
    useState(false);

  // Services
  const [servicesData, setServicesData] =
    useState<ServiceBreakdown[]>([]);

  const [servicesLoading, setServicesLoading] =
    useState(false);

  // Announcements
  const [announcements, setAnnouncements] =
    useState<Announcement[]>(seedAnnouncements);

  // Admin accounts
  const [adminAccounts, setAdminAccounts] =
    useState<AdminAccount[]>([]);

  const [
    adminAccountsLoading,
    setAdminAccountsLoading,
  ] = useState(false);

  // Audit logs
  const [auditLogs, setAuditLogs] =
    useState<AuditLogEntry[]>([]);

  const [auditLogsTotal, setAuditLogsTotal] =
    useState(0);

  const [
    auditLogsLoading,
    setAuditLogsLoading,
  ] = useState(false);

  const isSuperAdmin =
    adminRole === 'super_admin';

  // ── Stats ──────────────────────────────────────────────────────────────────

  async function refreshStats(): Promise<void> {
    setStatsLoading(true);

    try {
      const res = await adminApi(
        '/api/admin/stats',
      );

      if (!res.ok) {
        return;
      }

      const data =
        await res.json() as BackendStats;

      setStats(normalizeStats(data));
    } catch (err) {
      console.warn(
        'refreshStats failed:',
        err,
      );
    } finally {
      setStatsLoading(false);
    }
  }

  // ── Weekly revenue ─────────────────────────────────────────────────────────

  async function fetchWeeklyRevenue(): Promise<void> {
    setRevenueLoading(true);

    try {
      const res = await adminApi(
        '/api/admin/revenue/weekly',
      );

      if (!res.ok) {
        return;
      }

      const data =
        await res.json() as
          | BackendRevenueRow[]
          | {
              revenue?: BackendRevenueRow[];
            };

      setWeeklyRevenue(
        normalizeWeeklyRevenue(data),
      );
    } catch (err) {
      console.warn(
        'fetchWeeklyRevenue failed:',
        err,
      );
    } finally {
      setRevenueLoading(false);
    }
  }

  // ── Services ───────────────────────────────────────────────────────────────

  async function fetchServices(): Promise<void> {
    setServicesLoading(true);

    try {
      const res = await adminApi(
        '/api/admin/services',
      );

      if (!res.ok) {
        return;
      }

      const data =
        await res.json() as
          | BackendServiceRow[]
          | {
              services?: BackendServiceRow[];
            };

      setServicesData(
        normalizeServices(data),
      );
    } catch (err) {
      console.warn(
        'fetchServices failed:',
        err,
      );
    } finally {
      setServicesLoading(false);
    }
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async function fetchUsers(
    params?: {
      search?: string;
      status?: string;
      kyc?: string;
      page?: number;
    },
  ): Promise<void> {
    setUsersLoading(true);

    try {
      const qs = new URLSearchParams();

      if (params?.search) {
        qs.set(
          'search',
          params.search,
        );
      }

      if (params?.status) {
        qs.set(
          'status',
          params.status,
        );
      }

      if (params?.kyc) {
        qs.set(
          'kyc',
          params.kyc,
        );
      }

      if (params?.page) {
        qs.set(
          'page',
          String(params.page),
        );
      }

      qs.set('limit', '50');

      const query =
        qs.toString();

      const res = await adminApi(
        `/api/admin/users?${query}`,
      );

      if (!res.ok) {
        return;
      }

      const data =
        await res.json() as {
          users?: AdminUser[];
          total?: number;
        };

      const nextUsers =
        Array.isArray(data.users)
          ? data.users
          : [];

      setUsers(nextUsers);

      setUsersTotal(
        toNumber(
          data.total,
          nextUsers.length,
        ),
      );
    } catch (err) {
      console.warn(
        'fetchUsers failed:',
        err,
      );
    } finally {
      setUsersLoading(false);
    }
  }

  // ── Transactions ───────────────────────────────────────────────────────────

  async function fetchTransactions(
    params?: {
      search?: string;
      status?: string;
      type?: string;
      page?: number;
    },
  ): Promise<void> {
    setTxnsLoading(true);

    try {
      const qs =
        new URLSearchParams();

      if (params?.search) {
        qs.set(
          'search',
          params.search,
        );
      }

      if (params?.status) {
        qs.set(
          'status',
          params.status,
        );
      }

      if (params?.type) {
        qs.set(
          'type',
          params.type,
        );
      }

      if (params?.page) {
        qs.set(
          'page',
          String(params.page),
        );
      }

      qs.set('limit', '50');

      const query =
        qs.toString();

      const res = await adminApi(
        `/api/admin/transactions?${query}`,
      );

      if (!res.ok) {
        return;
      }

      const data =
        await res.json() as {
          transactions?: AdminTransaction[];
          total?: number;
        };

      const nextTransactions =
        Array.isArray(data.transactions)
          ? data.transactions
          : [];

      setTransactions(
        nextTransactions,
      );

      setTxnsTotal(
        toNumber(
          data.total,
          nextTransactions.length,
        ),
      );
    } catch (err) {
      console.warn(
        'fetchTransactions failed:',
        err,
      );
    } finally {
      setTxnsLoading(false);
    }
  }

  // ── Admin accounts ─────────────────────────────────────────────────────────

  async function fetchAdminAccounts(): Promise<void> {
    setAdminAccountsLoading(true);

    try {
      const res = await adminApi(
        '/api/admin/admins',
      );

      if (!res.ok) {
        return;
      }

      const data =
        await res.json() as {
          admins?: Array<{
            id: string;
            name: string;
            email: string;
            role: AdminRole;
            status: 'active' | 'disabled';
            lastLoginAt: string | null;
            createdAt: string;
          }>;
        };

      const admins =
        Array.isArray(data.admins)
          ? data.admins
          : [];

      setAdminAccounts(
        admins.map(admin => ({
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          status: admin.status,

          createdAt:
            new Date(
              admin.createdAt,
            ).toLocaleDateString(
              'en-US',
              {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              },
            ),

          lastLogin:
            admin.lastLoginAt
              ? new Date(
                  admin.lastLoginAt,
                ).toLocaleDateString(
                  'en-US',
                  {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  },
                )
              : 'Never',

          isSuperAdmin:
            admin.role === 'super_admin',
        })),
      );
    } catch (err) {
      console.warn(
        'fetchAdminAccounts failed:',
        err,
      );
    } finally {
      setAdminAccountsLoading(false);
    }
  }

  // ── Audit logs ─────────────────────────────────────────────────────────────

  async function fetchAuditLogs(
    params?: {
      page?: number;
      adminId?: string;
    },
  ): Promise<void> {
    setAuditLogsLoading(true);

    try {
      const qs =
        new URLSearchParams();

      if (params?.page) {
        qs.set(
          'page',
          String(params.page),
        );
      }

      if (params?.adminId) {
        qs.set(
          'adminId',
          params.adminId,
        );
      }

      qs.set('limit', '50');

      const res = await adminApi(
        `/api/admin/audit-logs?${qs.toString()}`,
      );

      if (!res.ok) {
        return;
      }

      const data =
        await res.json() as {
          logs?: AuditLogEntry[];
          total?: number;
        };

      const logs =
        Array.isArray(data.logs)
          ? data.logs
          : [];

      setAuditLogs(logs);

      setAuditLogsTotal(
        toNumber(
          data.total,
          logs.length,
        ),
      );
    } catch (err) {
      console.warn(
        'fetchAuditLogs failed:',
        err,
      );
    } finally {
      setAuditLogsLoading(false);
    }
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  const adminLogin = async (
    email: string,
    pin: string,
  ): Promise<boolean> => {
    try {
      const res = await adminApi(
        '/api/admin/session',
        {
          method: 'POST',
          body: JSON.stringify({
            email:
              email
                .trim()
                .toLowerCase(),
            pin,
          }),
        },
      );

      if (!res.ok) {
        return false;
      }

      const data =
        await res.json() as {
          ok: boolean;
          id: string;
          name: string;
          email: string;
          role: AdminRole;
        };

      if (!data.id) {
        return false;
      }

      const role =
        data.role ?? 'admin';

      setIsAdminLoggedIn(true);
      setAdminEmail(
        data.email ?? email,
      );
      setAdminRole(role);
      setCurrentAdminId(
        data.id,
      );

      /*
       * IMPORTANT:
       * These are deliberately started in the background.
       * A failure in one dashboard endpoint must never reject login
       * or cause the admin application to render a blank screen.
       */
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
          fetchAuditLogs(),
        );
      }

      void Promise.allSettled(
        fetches,
      );

      return true;
    } catch (err) {
      console.warn(
        'adminLogin failed:',
        err,
      );

      return false;
    }
  };

  // ── Logout ─────────────────────────────────────────────────────────────────

  const adminLogout = () => {
    void adminApi(
      '/api/admin/session',
      {
        method: 'DELETE',
      },
    ).catch(() => {});

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

    setAnnouncements(
      seedAnnouncements,
    );
  };

  // ── User status ────────────────────────────────────────────────────────────

  const updateUserStatus = async (
    id: string,
    status: 'active' | 'suspended',
  ): Promise<boolean> => {
    try {
      const res = await adminApi(
        `/api/admin/users/${id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status,
          }),
        },
      );

      if (!res.ok) {
        return false;
      }

      setUsers(prev =>
        prev.map(user =>
          user.id === id
            ? {
                ...user,
                status,
              }
            : user,
        ),
      );

      void refreshStats();

      return true;
    } catch (err) {
      console.warn(
        'updateUserStatus failed:',
        err,
      );

      return false;
    }
  };

  const suspendUser = (
    id: string,
  ) => {
    void updateUserStatus(
      id,
      'suspended',
    );
  };

  const activateUser = (
    id: string,
  ) => {
    void updateUserStatus(
      id,
      'active',
    );
  };

  // ── Admin CRUD ─────────────────────────────────────────────────────────────

  const addAdminAccount = async (
    data: {
      name: string;
      email: string;
      role: AdminRole;
      pin: string;
    },
  ): Promise<boolean> => {
    try {
      const res = await adminApi(
        '/api/admin/admins',
        {
          method: 'POST',
          body: JSON.stringify(data),
        },
      );

      if (!res.ok) {
        return false;
      }

      await fetchAdminAccounts();

      return true;
    } catch (err) {
      console.warn(
        'addAdminAccount failed:',
        err,
      );

      return false;
    }
  };

  const updateAdminAccount = async (
    id: string,
    updates: {
      name?: string;
      email?: string;
      role?: AdminRole;
    },
  ): Promise<boolean> => {
    try {
      const res = await adminApi(
        `/api/admin/admins/${id}`,
        {
          method: 'PATCH',
          body: JSON.stringify(
            updates,
          ),
        },
      );

      if (!res.ok) {
        return false;
      }

      await fetchAdminAccounts();

      return true;
    } catch (err) {
      console.warn(
        'updateAdminAccount failed:',
        err,
      );

      return false;
    }
  };

  const changeAdminPin = async (
    id: string,
    newPin: string,
  ): Promise<boolean> => {
    try {
      const res = await adminApi(
        `/api/admin/admins/${id}/pin`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            newPin,
          }),
        },
      );

      return res.ok;
    } catch (err) {
      console.warn(
        'changeAdminPin failed:',
        err,
      );

      return false;
    }
  };

  const toggleAdminStatus = async (
    id: string,
    newStatus:
      | 'active'
      | 'disabled',
  ): Promise<boolean> => {
    try {
      const res = await adminApi(
        `/api/admin/admins/${id}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            status: newStatus,
          }),
        },
      );

      if (!res.ok) {
        return false;
      }

      setAdminAccounts(prev =>
        prev.map(account =>
          account.id === id
            ? {
                ...account,
                status:
                  newStatus,
              }
            : account,
        ),
      );

      return true;
    } catch (err) {
      console.warn(
        'toggleAdminStatus failed:',
        err,
      );

      return false;
    }
  };

  const removeAdminAccount = async (
    id: string,
  ): Promise<boolean> => {
    try {
      const res = await adminApi(
        `/api/admin/admins/${id}`,
        {
          method: 'DELETE',
        },
      );

      if (!res.ok) {
        return false;
      }

      setAdminAccounts(prev =>
        prev.filter(
          account =>
            account.id !== id,
        ),
      );

      return true;
    } catch (err) {
      console.warn(
        'removeAdminAccount failed:',
        err,
      );

      return false;
    }
  };

  // ── Own account ────────────────────────────────────────────────────────────

  const updateOwnProfile = async (
    updates: {
      name?: string;
      email?: string;
    },
  ): Promise<boolean> => {
    try {
      const res = await adminApi(
        '/api/admin/me',
        {
          method: 'PATCH',
          body: JSON.stringify(
            updates,
          ),
        },
      );

      if (!res.ok) {
        return false;
      }

      if (updates.email) {
        setAdminEmail(
          updates.email,
        );
      }

      return true;
    } catch (err) {
      console.warn(
        'updateOwnProfile failed:',
        err,
      );

      return false;
    }
  };

  const changeOwnPin = async (
    currentPin: string,
    newPin: string,
  ): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    try {
      const res = await adminApi(
        '/api/admin/me/pin',
        {
          method: 'PATCH',
          body: JSON.stringify({
            currentPin,
            newPin,
          }),
        },
      );

      if (res.ok) {
        return {
          ok: true,
        };
      }

      let error =
        'Failed to change PIN.';

      try {
        const body =
          await res.json() as {
            error?: string;
          };

        if (body.error) {
          error = body.error;
        }
      } catch {
        // Ignore invalid/non-JSON error body.
      }

      return {
        ok: false,
        error,
      };
    } catch {
      return {
        ok: false,
        error: 'Network error.',
      };
    }
  };

  // ── Announcements ──────────────────────────────────────────────────────────

  const addAnnouncement = (
    ann: Omit<
      Announcement,
      'id' | 'sentAt' | 'recipients'
    >,
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

    setAnnouncements(prev => [
      newAnn,
      ...prev,
    ]);
  };

  // ── Notifications ──────────────────────────────────────────────────────────

  const broadcastNotification = async (
    title: string,
    body: string,
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
        },
      );

      if (!res.ok) {
        let error =
          'Failed to broadcast.';

        try {
          const data =
            await res.json() as {
              error?: string;
            };

          error =
            data.error ?? error;
        } catch {
          // Ignore invalid error response.
        }

        return {
          ok: false,
          sent: 0,
          error,
        };
      }

      const data =
        await res.json() as {
          ok?: boolean;
          sent?: number;
        };

      addAnnouncement({
        title,
        body,
        target: 'all',
        status: 'sent',
      });

      return {
        ok: true,
        sent: toNumber(
          data.sent,
        ),
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
    body: string,
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
        },
      );

      if (!res.ok) {
        let error =
          'Failed.';

        try {
          const data =
            await res.json() as {
              error?: string;
            };

          error =
            data.error ?? error;
        } catch {
          // Ignore invalid error response.
        }

        return {
          ok: false,
          sent: 0,
          error,
        };
      }

      const data =
        await res.json() as {
          ok?: boolean;
          sent?: number;
        };

      return {
        ok: true,
        sent: toNumber(
          data.sent,
        ),
      };
    } catch {
      return {
        ok: false,
        sent: 0,
        error: 'Network error.',
      };
    }
  };

  // ── Session restoration ────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    const restoreSession =
      async () => {
        try {
          const res =
            await adminApi(
              '/api/admin/me',
            );

          if (!res.ok || !mounted) {
            return;
          }

          const data =
            await res.json() as {
              id: string;
              name: string;
              email: string;
              role: AdminRole;
              status: string;
            };

          if (
            !data.id ||
            !mounted
          ) {
            return;
          }

          const role =
            data.role ?? 'admin';

          setIsAdminLoggedIn(true);
          setAdminEmail(
            data.email,
          );
          setAdminRole(role);
          setCurrentAdminId(
            data.id,
          );

          /*
           * Use the same normalized fetchers used after login.
           * This prevents the backend's { revenue: [...] } and
           * { services: [...] } response wrappers from entering
           * the dashboard state directly.
           */
          const fetches: Promise<void>[] = [
            refreshStats(),
            fetchWeeklyRevenue(),
            fetchServices(),
            fetchUsers(),
            fetchTransactions(),
          ];

          if (
            role ===
            'super_admin'
          ) {
            fetches.push(
              fetchAdminAccounts(),
              fetchAuditLogs(),
            );
          }

          void Promise.allSettled(
            fetches,
          );
        } catch (err) {
          console.warn(
            'Admin session restoration failed:',
            err,
          );
        } finally {
          if (mounted) {
            setIsAdminLoading(
              false,
            );
          }
        }
      };

    void restoreSession();

    return () => {
      mounted = false;
    };
  }, []);

  // ── Context value ──────────────────────────────────────────────────────────

  return (
    <AdminContext.Provider
      value={{
        // Auth
        isAdminLoggedIn,
        isAdminLoading,
        adminEmail,
        adminRole,
        isSuperAdmin,
        currentAdminId,

        adminLogin,
        adminLogout,

        // API
        api: adminApi,

        // Stats
        stats,
        statsLoading,
        refreshStats,

        // Users
        users,
        usersTotal,
        usersLoading,
        fetchUsers,
        updateUserStatus,

        // Transactions
        transactions,
        txnsTotal,
        txnsLoading,
        fetchTransactions,

        // Revenue
        weeklyRevenue,
        revenueLoading,
        fetchWeeklyRevenue,

        // Services
        servicesData,
        servicesLoading,
        fetchServices,

        // Announcements
        announcements,
        addAnnouncement,
        broadcastNotification,
        sendTargetedNotification,

        // Admin accounts
        adminAccounts,
        adminAccountsLoading,
        fetchAdminAccounts,
        addAdminAccount,
        updateAdminAccount,
        changeAdminPin,
        toggleAdminStatus,
        removeAdminAccount,

        // Own account
        updateOwnProfile,
        changeOwnPin,

        // Audit logs
        auditLogs,
        auditLogsTotal,
        auditLogsLoading,
        fetchAuditLogs,

        // Legacy
        suspendUser,
        activateUser,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export const useAdminContext =
  (): AdminContextType => {
    const ctx =
      useContext(AdminContext);

    if (!ctx) {
      throw new Error(
        'useAdminContext must be used within AdminProvider',
      );
    }

    return ctx;
  };
