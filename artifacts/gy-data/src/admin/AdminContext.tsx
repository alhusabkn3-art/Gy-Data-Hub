/**
 * AdminContext
 *
 * Central admin authentication/session state and admin dashboard data.
 *
 * Authentication is handled by the backend through:
 *   POST   /api/admin/session
 *   DELETE /api/admin/session
 *   GET    /api/admin/me
 *
 * The browser session cookie is sent with every request through
 * credentials: 'include'.
 *
 * The backend remains the source of truth for authentication and RBAC.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import {
  adminAnnouncements as seedAnnouncements,
  type AdminUser,
  type AdminTransaction,
  type AdminStats,
  type WeeklyRevenue,
  type ServiceBreakdown,
  type Announcement,
  type AdminAccount,
  type AdminRole,
  type AuditLogEntry,
} from '../data/adminMockData';

// ─────────────────────────────────────────────────────────────────────────────
// API
// ─────────────────────────────────────────────────────────────────────────────

const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, '');

function buildAdminUrl(path: string): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  /*
   * BASE normally comes from Vite and is usually "/".
   *
   * Avoid accidentally producing:
   *   /api/api/...
   */
  if (!BASE || BASE === '/') {
    return cleanPath;
  }

  return `${BASE}${cleanPath}`;
}

export function adminApi(
  path: string,
  opts: RequestInit = {},
): Promise<Response> {
  const url = buildAdminUrl(path);

  const headers = new Headers(opts.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, {
    ...opts,
    credentials: 'include',
    headers,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Context type
// ─────────────────────────────────────────────────────────────────────────────

interface AdminContextType {
  // Authentication
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

  // Dashboard stats
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

  // Admin account management
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
  createContext<AdminContextType | undefined>(
    undefined,
  );

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export const AdminProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  // ──────────────────────────────────────────────────────────────────────────
  // Authentication state
  // ──────────────────────────────────────────────────────────────────────────

  const [
    isAdminLoggedIn,
    setIsAdminLoggedIn,
  ] = useState(false);

  const [
    isAdminLoading,
    setIsAdminLoading,
  ] = useState(true);

  const [
    adminEmail,
    setAdminEmail,
  ] = useState('');

  const [
    adminRole,
    setAdminRole,
  ] = useState<AdminRole>('admin');

  const [
    currentAdminId,
    setCurrentAdminId,
  ] = useState('');

  // ──────────────────────────────────────────────────────────────────────────
  // Dashboard state
  // ──────────────────────────────────────────────────────────────────────────

  const [
    stats,
    setStats,
  ] = useState<AdminStats | null>(null);

  const [
    statsLoading,
    setStatsLoading,
  ] = useState(false);

  const [
    users,
    setUsers,
  ] = useState<AdminUser[]>([]);

  const [
    usersTotal,
    setUsersTotal,
  ] = useState(0);

  const [
    usersLoading,
    setUsersLoading,
  ] = useState(false);

  const [
    transactions,
    setTransactions,
  ] = useState<AdminTransaction[]>([]);

  const [
    txnsTotal,
    setTxnsTotal,
  ] = useState(0);

  const [
    txnsLoading,
    setTxnsLoading,
  ] = useState(false);

  const [
    weeklyRevenue,
    setWeeklyRevenue,
  ] = useState<WeeklyRevenue[]>([]);

  const [
    revenueLoading,
    setRevenueLoading,
  ] = useState(false);

  const [
    servicesData,
    setServicesData,
  ] = useState<ServiceBreakdown[]>([]);

  const [
    servicesLoading,
    setServicesLoading,
  ] = useState(false);

  // ──────────────────────────────────────────────────────────────────────────
  // Announcements
  // ──────────────────────────────────────────────────────────────────────────

  const [
    announcements,
    setAnnouncements,
  ] = useState<Announcement[]>(
    seedAnnouncements,
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Admin accounts
  // ──────────────────────────────────────────────────────────────────────────

  const [
    adminAccounts,
    setAdminAccounts,
  ] = useState<AdminAccount[]>([]);

  const [
    adminAccountsLoading,
    setAdminAccountsLoading,
  ] = useState(false);

  // ──────────────────────────────────────────────────────────────────────────
  // Audit logs
  // ──────────────────────────────────────────────────────────────────────────

  const [
    auditLogs,
    setAuditLogs,
  ] = useState<AuditLogEntry[]>([]);

  const [
    auditLogsTotal,
    setAuditLogsTotal,
  ] = useState(0);

  const [
    auditLogsLoading,
    setAuditLogsLoading,
  ] = useState(false);

  const isSuperAdmin =
    adminRole === 'super_admin';

  // ──────────────────────────────────────────────────────────────────────────
  // Stats
  // ──────────────────────────────────────────────────────────────────────────

  const refreshStats = async (): Promise<void> => {
    setStatsLoading(true);

    try {
      const res = await adminApi(
        '/api/admin/stats',
      );

      if (!res.ok) {
        return;
      }

      const data =
        (await res.json()) as AdminStats;

      setStats(data);
    } catch (error) {
      console.warn(
        'refreshStats failed:',
        error,
      );
    } finally {
      setStatsLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Weekly revenue
  // ──────────────────────────────────────────────────────────────────────────

  const fetchWeeklyRevenue =
    async (): Promise<void> => {
      setRevenueLoading(true);

      try {
        const res = await adminApi(
          '/api/admin/revenue/weekly',
        );

        if (!res.ok) {
          return;
        }

        const data =
          (await res.json()) as WeeklyRevenue[];

        setWeeklyRevenue(data);
      } catch (error) {
        console.warn(
          'fetchWeeklyRevenue failed:',
          error,
        );
      } finally {
        setRevenueLoading(false);
      }
    };

  // ──────────────────────────────────────────────────────────────────────────
  // Services
  // ──────────────────────────────────────────────────────────────────────────

  const fetchServices =
    async (): Promise<void> => {
      setServicesLoading(true);

      try {
        const res = await adminApi(
          '/api/admin/services',
        );

        if (!res.ok) {
          return;
        }

        const data =
          (await res.json()) as ServiceBreakdown[];

        setServicesData(data);
      } catch (error) {
        console.warn(
          'fetchServices failed:',
          error,
        );
      } finally {
        setServicesLoading(false);
      }
    };

  // ──────────────────────────────────────────────────────────────────────────
  // Users
  // ──────────────────────────────────────────────────────────────────────────

  const fetchUsers = async (
    params?: {
      search?: string;
      status?: string;
      kyc?: string;
      page?: number;
    },
  ): Promise<void> => {
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

      const res = await adminApi(
        `/api/admin/users?${qs.toString()}`,
      );

      if (!res.ok) {
        return;
      }

      const data =
        (await res.json()) as {
          users: AdminUser[];
          total: number;
        };

      setUsers(data.users ?? []);
      setUsersTotal(data.total ?? 0);
    } catch (error) {
      console.warn(
        'fetchUsers failed:',
        error,
      );
    } finally {
      setUsersLoading(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Transactions
  // ──────────────────────────────────────────────────────────────────────────

  const fetchTransactions =
    async (
      params?: {
        search?: string;
        status?: string;
        type?: string;
        page?: number;
      },
    ): Promise<void> => {
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

        const res = await adminApi(
          `/api/admin/transactions?${qs.toString()}`,
        );

        if (!res.ok) {
          return;
        }

        const data =
          (await res.json()) as {
            transactions: AdminTransaction[];
            total: number;
          };

        setTransactions(
          data.transactions ?? [],
        );

        setTxnsTotal(
          data.total ?? 0,
        );
      } catch (error) {
        console.warn(
          'fetchTransactions failed:',
          error,
        );
      } finally {
        setTxnsLoading(false);
      }
    };

  // ──────────────────────────────────────────────────────────────────────────
  // Admin accounts
  // ──────────────────────────────────────────────────────────────────────────

  const fetchAdminAccounts =
    async (): Promise<void> => {
      setAdminAccountsLoading(true);

      try {
        const res = await adminApi(
          '/api/admin/admins',
        );

        if (!res.ok) {
          return;
        }

        const data =
          (await res.json()) as {
            admins: Array<{
              id: string;
              name: string;
              email: string;
              role: AdminRole;
              status:
                | 'active'
                | 'disabled';
              lastLoginAt:
                | string
                | null;
              createdAt: string;
            }>;
          };

        setAdminAccounts(
          (data.admins ?? []).map(
            (admin) => ({
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
                admin.role ===
                'super_admin',
            }),
          ),
        );
      } catch (error) {
        console.warn(
          'fetchAdminAccounts failed:',
          error,
        );
      } finally {
        setAdminAccountsLoading(
          false,
        );
      }
    };

  // ──────────────────────────────────────────────────────────────────────────
  // Audit logs
  // ──────────────────────────────────────────────────────────────────────────

  const fetchAuditLogs =
    async (
      params?: {
        page?: number;
        adminId?: string;
      },
    ): Promise<void> => {
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
          (await res.json()) as {
            logs: AuditLogEntry[];
            total: number;
          };

        setAuditLogs(
          data.logs ?? [],
        );

        setAuditLogsTotal(
          data.total ?? 0,
        );
      } catch (error) {
        console.warn(
          'fetchAuditLogs failed:',
          error,
        );
      } finally {
        setAuditLogsLoading(false);
      }
    };

  // ──────────────────────────────────────────────────────────────────────────
  // Admin login
  // ──────────────────────────────────────────────────────────────────────────

  const adminLogin = async (
    email: string,
    pin: string,
  ): Promise<boolean> => {
    try {
      const normalizedEmail =
        email.trim().toLowerCase();

      if (
        !normalizedEmail ||
        !pin.trim()
      ) {
        return false;
      }

      const res = await adminApi(
        '/api/admin/session',
        {
          method: 'POST',

          body: JSON.stringify({
            email: normalizedEmail,
            pin,
          }),
        },
      );

      if (!res.ok) {
        let errorBody:
          | {
              error?: string;
              message?: string;
            }
          | undefined;

        try {
          errorBody =
            (await res.json()) as {
              error?: string;
              message?: string;
            };
        } catch {
          errorBody = undefined;
        }

        console.warn(
          'Admin login failed:',
          res.status,
          errorBody,
        );

        return false;
      }

      const data =
        (await res.json()) as {
          ok?: boolean;
          id: string;
          name: string;
          email: string;
          role: AdminRole;
        };

      if (
        !data.id ||
        !data.email
      ) {
        console.error(
          'Admin login returned invalid session data.',
        );

        return false;
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

      // Load dashboard data after authentication.
      await Promise.all([
        refreshStats(),
        fetchWeeklyRevenue(),
        fetchServices(),
        fetchUsers(),
        fetchTransactions(),
      ]);

      if (
        role === 'super_admin'
      ) {
        await Promise.all([
          fetchAdminAccounts(),
          fetchAuditLogs(),
        ]);
      }

      return true;
    } catch (error) {
      console.error(
        'Admin login request failed:',
        error,
      );

      return false;
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Admin logout
  // ──────────────────────────────────────────────────────────────────────────

  const adminLogout = (): void => {
    void adminApi(
      '/api/admin/session',
      {
        method: 'DELETE',
      },
    ).catch((error) => {
      console.warn(
        'Admin logout request failed:',
        error,
      );
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

    setAnnouncements(
      seedAnnouncements,
    );
  };

  // ──────────────────────────────────────────────────────────────────────────
  // User status
  // ──────────────────────────────────────────────────────────────────────────

  const updateUserStatus =
    async (
      id: string,
      status:
        | 'active'
        | 'suspended',
    ): Promise<boolean> => {
      try {
        const res =
          await adminApi(
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

        setUsers(
          (previous) =>
            previous.map(
              (user) =>
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
      } catch (error) {
        console.warn(
          'updateUserStatus failed:',
          error,
        );

        return false;
      }
    };

  const suspendUser = (
    id: string,
  ): void => {
    void updateUserStatus(
      id,
      'suspended',
    );
  };

  const activateUser = (
    id: string,
  ): void => {
    void updateUserStatus(
      id,
      'active',
    );
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Admin CRUD
  // ──────────────────────────────────────────────────────────────────────────

  const addAdminAccount =
    async (
      data: {
        name: string;
        email: string;
        role: AdminRole;
        pin: string;
      },
    ): Promise<boolean> => {
      try {
        const res =
          await adminApi(
            '/api/admin/admins',
            {
              method: 'POST',
              body: JSON.stringify(
                data,
              ),
            },
          );

        if (!res.ok) {
          return false;
        }

        await fetchAdminAccounts();

        return true;
      } catch (error) {
        console.warn(
          'addAdminAccount failed:',
          error,
        );

        return false;
      }
    };

  const updateAdminAccount =
    async (
      id: string,
      updates: {
        name?: string;
        email?: string;
        role?: AdminRole;
      },
    ): Promise<boolean> => {
      try {
        const res =
          await adminApi(
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
      } catch (error) {
        console.warn(
          'updateAdminAccount failed:',
          error,
        );

        return false;
      }
    };

  const changeAdminPin =
    async (
      id: string,
      newPin: string,
    ): Promise<boolean> => {
      try {
        const res =
          await adminApi(
            `/api/admin/admins/${id}/pin`,
            {
              method: 'PATCH',
              body: JSON.stringify({
                newPin,
              }),
            },
          );

        return res.ok;
      } catch (error) {
        console.warn(
          'changeAdminPin failed:',
          error,
        );

        return false;
      }
    };

  const toggleAdminStatus =
    async (
      id: string,
      newStatus:
        | 'active'
        | 'disabled',
    ): Promise<boolean> => {
      try {
        const res =
          await adminApi(
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

        setAdminAccounts(
          (previous) =>
            previous.map(
              (account) =>
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
      } catch (error) {
        console.warn(
          'toggleAdminStatus failed:',
          error,
        );

        return false;
      }
    };

  const removeAdminAccount =
    async (
      id: string,
    ): Promise<boolean> => {
      try {
        const res =
          await adminApi(
            `/api/admin/admins/${id}`,
            {
              method: 'DELETE',
            },
          );

        if (!res.ok) {
          return false;
        }

        setAdminAccounts(
          (previous) =>
            previous.filter(
              (account) =>
                account.id !== id,
            ),
        );

        return true;
      } catch (error) {
        console.warn(
          'removeAdminAccount failed:',
          error,
        );

        return false;
      }
    };

  // ──────────────────────────────────────────────────────────────────────────
  // Own account
  // ──────────────────────────────────────────────────────────────────────────

  const updateOwnProfile =
    async (
      updates: {
        name?: string;
        email?: string;
      },
    ): Promise<boolean> => {
      try {
        const res =
          await adminApi(
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

        if (
          updates.email
        ) {
          setAdminEmail(
            updates.email,
          );
        }

        return true;
      } catch (error) {
        console.warn(
          'updateOwnProfile failed:',
          error,
        );

        return false;
      }
    };

  const changeOwnPin =
    async (
      currentPin: string,
      newPin: string,
    ): Promise<{
      ok: boolean;
      error?: string;
    }> => {
      try {
        const res =
          await adminApi(
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

        let body:
          | {
              error?: string;
              message?: string;
            }
          | undefined;

        try {
          body =
            (await res.json()) as {
              error?: string;
              message?: string;
            };
        } catch {
          body = undefined;
        }

        return {
          ok: false,
          error:
            body?.error ??
            body?.message ??
            'Failed to change PIN.',
        };
      } catch {
        return {
          ok: false,
          error: 'Network error.',
        };
      }
    };

  // ──────────────────────────────────────────────────────────────────────────
  // Announcements
  // ──────────────────────────────────────────────────────────────────────────

  const addAnnouncement = (
    announcement: Omit<
      Announcement,
      'id' | 'sentAt' | 'recipients'
    >,
  ): void => {
    const newAnnouncement: Announcement =
      {
        ...announcement,

        id: `ANN-${Date.now()}`,

        sentAt:
          announcement.status ===
          'sent'
            ? new Date().toLocaleString()
            : '—',

        recipients:
          announcement.status ===
          'sent'
            ? stats?.activeUsers ?? 0
            : 0,
      };

    setAnnouncements(
      (previous) => [
        newAnnouncement,
        ...previous,
      ],
    );
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Broadcast notification
  // ──────────────────────────────────────────────────────────────────────────

  const broadcastNotification =
    async (
      title: string,
      body: string,
    ): Promise<{
      ok: boolean;
      sent: number;
      error?: string;
    }> => {
      try {
        const res =
          await adminApi(
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
              (await res.json()) as {
                error?: string;
              };

            error =
              data.error ?? error;
          } catch {
            // Keep fallback error.
          }

          return {
            ok: false,
            sent: 0,
            error,
          };
        }

        const data =
          (await res.json()) as {
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
          sent: data.sent ?? 0,
        };
      } catch {
        return {
          ok: false,
          sent: 0,
          error: 'Network error.',
        };
      }
    };

  // ──────────────────────────────────────────────────────────────────────────
  // Targeted notification
  // ──────────────────────────────────────────────────────────────────────────

  const sendTargetedNotification =
    async (
      userIds: string[],
      title: string,
      body: string,
    ): Promise<{
      ok: boolean;
      sent: number;
      error?: string;
    }> => {
      try {
        const res =
          await adminApi(
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
              (await res.json()) as {
                error?: string;
              };

            error =
              data.error ?? error;
          } catch {
            // Keep fallback.
          }

          return {
            ok: false,
            sent: 0,
            error,
          };
        }

        const data =
          (await res.json()) as {
            ok?: boolean;
            sent?: number;
          };

        return {
          ok: true,
          sent: data.sent ?? 0,
        };
      } catch {
        return {
          ok: false,
          sent: 0,
          error: 'Network error.',
        };
      }
    };

  // ──────────────────────────────────────────────────────────────────────────
  // Restore admin session on page refresh
  // ──────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    const restoreSession =
      async (): Promise<void> => {
        try {
          const res =
            await adminApi(
              '/api/admin/me',
            );

          if (
            cancelled ||
            !res.ok
          ) {
            return;
          }

          const data =
            (await res.json()) as {
              id: string;
              name: string;
              email: string;
              role: AdminRole;
              status: string;
            };

          if (
            cancelled ||
            !data.id
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
           * The session is valid, so load dashboard data.
           */
          await Promise.all([
            refreshStats(),
            fetchWeeklyRevenue(),
            fetchServices(),
            fetchUsers(),
            fetchTransactions(),
          ]);

          if (
            role === 'super_admin'
          ) {
            await Promise.all([
              fetchAdminAccounts(),
              fetchAuditLogs(),
            ]);
          }
        } catch (error) {
          if (!cancelled) {
            console.warn(
              'Admin session restore failed:',
              error,
            );
          }
        } finally {
          if (!cancelled) {
            setIsAdminLoading(false);
          }
        }
      };

    void restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // Context
  // ──────────────────────────────────────────────────────────────────────────

  const contextValue: AdminContextType =
    {
      // Authentication
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

      // Dashboard
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

      // Audit
      auditLogs,
      auditLogsTotal,
      auditLogsLoading,
      fetchAuditLogs,

      // Legacy
      suspendUser,
      activateUser,
    };

  return (
    <AdminContext.Provider
      value={contextValue}
    >
      {children}
    </AdminContext.Provider>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export const useAdminContext =
  (): AdminContextType => {
    const context =
      useContext(AdminContext);

    if (!context) {
      throw new Error(
        'useAdminContext must be used within AdminProvider',
      );
    }

    return context;
  };
