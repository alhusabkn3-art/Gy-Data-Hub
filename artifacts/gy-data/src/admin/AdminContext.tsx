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
} from './data/adminMockData';

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
  ) => Promise<boolean>;

  // Audit logs
  auditLogs: AuditLogEntry[];
  auditLogsLoading: boolean;
  fetchAuditLogs: () => Promise<void>;

  // Refresh everything
  refreshAll: () => Promise<void>;
}

const AdminContext = createContext<
  AdminContextType | undefined
>(undefined);

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function readJson<T>(
  response: Response,
): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function normalizeRole(
  value: unknown,
): AdminRole {
  const role = String(value ?? '').toLowerCase();

  if (
    role === 'superadmin' ||
    role === 'super_admin' ||
    role === 'super-admin'
  ) {
    return 'superadmin' as AdminRole;
  }

  if (role === 'manager') {
    return 'manager' as AdminRole;
  }

  if (role === 'support') {
    return 'support' as AdminRole;
  }

  return (role || 'admin') as AdminRole;
}

function extractData<T>(
  payload: unknown,
): T | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const value = payload as Record<string, unknown>;

  if ('data' in value) {
    return value.data as T;
  }

  return payload as T;
}

function extractArray<T>(
  payload: unknown,
): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const value = payload as Record<string, unknown>;

  if (Array.isArray(value.data)) {
    return value.data as T[];
  }

  if (Array.isArray(value.items)) {
    return value.items as T[];
  }

  if (Array.isArray(value.results)) {
    return value.results as T[];
  }

  return [];
}

function extractTotal(
  payload: unknown,
  fallback: number,
): number {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const value = payload as Record<string, unknown>;

  const candidates = [
    value.total,
    value.totalCount,
    value.count,
  ];

  for (const candidate of candidates) {
    const parsed = Number(candidate);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  if (
    value.meta &&
    typeof value.meta === 'object'
  ) {
    const meta = value.meta as Record<
      string,
      unknown
    >;

    const parsed = Number(
      meta.total ??
        meta.totalCount ??
        meta.count,
    );

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function getErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const value = payload as Record<string, unknown>;

  if (typeof value.error === 'string') {
    return value.error;
  }

  if (typeof value.message === 'string') {
    return value.message;
  }

  if (
    value.error &&
    typeof value.error === 'object'
  ) {
    const error = value.error as Record<
      string,
      unknown
    >;

    if (typeof error.message === 'string') {
      return error.message;
    }
  }

  return fallback;
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export const AdminProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  // Authentication
  const [isAdminLoggedIn, setIsAdminLoggedIn] =
    useState(false);

  const [isAdminLoading, setIsAdminLoading] =
    useState(true);

  const [adminEmail, setAdminEmail] =
    useState('');

  const [adminRole, setAdminRole] =
    useState<AdminRole>(
      'admin' as AdminRole,
    );

  const [currentAdminId, setCurrentAdminId] =
    useState('');

  // Dashboard
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

  // Revenue
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
    useState<Announcement[]>(
      seedAnnouncements ?? [],
    );

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

  const [
    auditLogsLoading,
    setAuditLogsLoading,
  ] = useState(false);

  const isSuperAdmin =
    String(adminRole).toLowerCase() ===
      'superadmin' ||
    String(adminRole).toLowerCase() ===
      'super_admin' ||
    String(adminRole).toLowerCase() ===
      'super-admin';

  // ───────────────────────────────────────────────────────────────────────────
  // Authentication
  // ───────────────────────────────────────────────────────────────────────────

  const loadCurrentAdmin =
    async (): Promise<void> => {
      try {
        const response = await adminApi(
          '/api/admin/me',
          {
            method: 'GET',
          },
        );

        if (!response.ok) {
          setIsAdminLoggedIn(false);
          setAdminEmail('');
          setCurrentAdminId('');
          return;
        }

        const payload =
          await readJson<unknown>(response);

        const data =
          extractData<Record<string, unknown>>(
            payload,
          );

        if (!data) {
          setIsAdminLoggedIn(false);
          return;
        }

        const admin =
          data.admin &&
          typeof data.admin === 'object'
            ? (data.admin as Record<
                string,
                unknown
              >)
            : data;

        setIsAdminLoggedIn(true);

        setAdminEmail(
          String(
            admin.email ??
              data.email ??
              '',
          ),
        );

        setCurrentAdminId(
          String(
            admin.id ??
              admin.adminId ??
              data.id ??
              '',
          ),
        );

        setAdminRole(
          normalizeRole(
            admin.role ??
              data.role ??
              'admin',
          ),
        );
      } catch {
        setIsAdminLoggedIn(false);
        setAdminEmail('');
        setCurrentAdminId('');
      }
    };

  const adminLogin = async (
    email: string,
    pin: string,
  ): Promise<boolean> => {
    try {
      setIsAdminLoading(true);

      const response = await adminApi(
        '/api/admin/session',
        {
          method: 'POST',
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            pin,
          }),
        },
      );

      const payload =
        await readJson<unknown>(response);

      if (!response.ok) {
        return false;
      }

      const data =
        extractData<Record<string, unknown>>(
          payload,
        );

      const admin =
        data?.admin &&
        typeof data.admin === 'object'
          ? (data.admin as Record<
              string,
              unknown
            >)
          : data;

      setIsAdminLoggedIn(true);

      setAdminEmail(
        String(
          admin?.email ??
            email.trim().toLowerCase(),
        ),
      );

      setCurrentAdminId(
        String(
          admin?.id ??
            admin?.adminId ??
            '',
        ),
      );

      setAdminRole(
        normalizeRole(
          admin?.role ?? 'admin',
        ),
      );

      return true;
    } catch {
      return false;
    } finally {
      setIsAdminLoading(false);
    }
  };

  const adminLogout = (): void => {
    void adminApi(
      '/api/admin/session',
      {
        method: 'DELETE',
      },
    ).catch(() => undefined);

    setIsAdminLoggedIn(false);
    setAdminEmail('');
    setCurrentAdminId('');
    setAdminRole(
      'admin' as AdminRole,
    );

    setStats(null);
    setUsers([]);
    setTransactions([]);
    setWeeklyRevenue([]);
    setServicesData([]);
    setAdminAccounts([]);
    setAuditLogs([]);
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Dashboard stats
  // ───────────────────────────────────────────────────────────────────────────

  const refreshStats =
    async (): Promise<void> => {
      setStatsLoading(true);

      try {
        const response = await adminApi(
          '/api/admin/stats',
          {
            method: 'GET',
          },
        );

        if (!response.ok) {
          return;
        }

        const payload =
          await readJson<unknown>(response);

        const data =
          extractData<AdminStats>(
            payload,
          );

        if (data) {
          setStats(data);
        }
      } catch {
        // Keep the existing state when the
        // backend is temporarily unavailable.
      } finally {
        setStatsLoading(false);
      }
    };

  // ───────────────────────────────────────────────────────────────────────────
  // Users
  // ───────────────────────────────────────────────────────────────────────────

  const fetchUsers = async (
    params: {
      search?: string;
      status?: string;
      kyc?: string;
      page?: number;
    } = {},
  ): Promise<void> => {
    setUsersLoading(true);

    try {
      const query =
        new URLSearchParams();

      if (params.search) {
        query.set(
          'search',
          params.search,
        );
      }

      if (params.status) {
        query.set(
          'status',
          params.status,
        );
      }

      if (params.kyc) {
        query.set(
          'kyc',
          params.kyc,
        );
      }

      if (
        typeof params.page === 'number'
      ) {
        query.set(
          'page',
          String(params.page),
        );
      }

      const suffix =
        query.toString()
          ? `?${query.toString()}`
          : '';

      const response = await adminApi(
        `/api/admin/users${suffix}`,
        {
          method: 'GET',
        },
      );

      if (!response.ok) {
        return;
      }

      const payload =
        await readJson<unknown>(response);

      const list =
        extractArray<AdminUser>(
          payload,
        );

      setUsers(list);
      setUsersTotal(
        extractTotal(
          payload,
          list.length,
        ),
      );
    } catch {
      // Preserve previous data.
    } finally {
      setUsersLoading(false);
    }
  };

  const updateUserStatus =
    async (
      id: string,
      status:
        | 'active'
        | 'suspended',
    ): Promise<boolean> => {
      try {
        const response =
          await adminApi(
            `/api/admin/users/${encodeURIComponent(
              id,
            )}/status`,
            {
              method: 'PATCH',
              body: JSON.stringify({
                status,
              }),
            },
          );

        if (!response.ok) {
          return false;
        }

        setUsers((current) =>
          current.map((user) =>
            String(user.id) ===
            String(id)
              ? {
                  ...user,
                  status,
                }
              : user,
          ),
        );

        return true;
      } catch {
        return false;
      }
    };

  // ───────────────────────────────────────────────────────────────────────────
  // Transactions
  // ───────────────────────────────────────────────────────────────────────────

  const fetchTransactions =
    async (
      params: {
        search?: string;
        status?: string;
        type?: string;
        page?: number;
      } = {},
    ): Promise<void> => {
      setTxnsLoading(true);

      try {
        const query =
          new URLSearchParams();

        if (params.search) {
          query.set(
            'search',
            params.search,
          );
        }

        if (params.status) {
          query.set(
            'status',
            params.status,
          );
        }

        if (params.type) {
          query.set(
            'type',
            params.type,
          );
        }

        if (
          typeof params.page ===
          'number'
        ) {
          query.set(
            'page',
            String(params.page),
          );
        }

        const suffix =
          query.toString()
            ? `?${query.toString()}`
            : '';

        const response =
          await adminApi(
            `/api/admin/transactions${suffix}`,
            {
              method: 'GET',
            },
          );

        if (!response.ok) {
          return;
        }

        const payload =
          await readJson<unknown>(
            response,
          );

        const list =
          extractArray<AdminTransaction>(
            payload,
          );

        setTransactions(list);

        setTxnsTotal(
          extractTotal(
            payload,
            list.length,
          ),
        );
      } catch {
        // Preserve previous state.
      } finally {
        setTxnsLoading(false);
      }
    };

  // ───────────────────────────────────────────────────────────────────────────
  // Weekly revenue
  // ───────────────────────────────────────────────────────────────────────────

  const fetchWeeklyRevenue =
    async (): Promise<void> => {
      setRevenueLoading(true);

      try {
        const response =
          await adminApi(
            '/api/admin/revenue/weekly',
            {
              method: 'GET',
            },
          );

        if (!response.ok) {
          return;
        }

        const payload =
          await readJson<unknown>(
            response,
          );

        const list =
          extractArray<WeeklyRevenue>(
            payload,
          );

        setWeeklyRevenue(list);
      } catch {
        // Preserve previous state.
      } finally {
        setRevenueLoading(false);
      }
    };

  // ───────────────────────────────────────────────────────────────────────────
  // Services
  // ───────────────────────────────────────────────────────────────────────────

  const fetchServices =
    async (): Promise<void> => {
      setServicesLoading(true);

      try {
        const response =
          await adminApi(
            '/api/admin/services',
            {
              method: 'GET',
            },
          );

        if (!response.ok) {
          return;
        }

        const payload =
          await readJson<unknown>(
            response,
          );

        const list =
          extractArray<ServiceBreakdown>(
            payload,
          );

        setServicesData(list);
      } catch {
        // Preserve previous state.
      } finally {
        setServicesLoading(false);
      }
    };

  // ───────────────────────────────────────────────────────────────────────────
  // Announcements
  // ───────────────────────────────────────────────────────────────────────────

  const addAnnouncement = (
    ann: Omit<
      Announcement,
      'id' | 'sentAt' | 'recipients'
    >,
  ): void => {
    const announcement =
      {
        ...ann,
        id: `local-${Date.now()}`,
        sentAt:
          new Date().toISOString(),
        recipients: 0,
      } as Announcement;

    setAnnouncements(
      (current) => [
        announcement,
        ...current,
      ],
    );
  };

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
        const response =
          await adminApi(
            '/api/admin/notifications/broadcast',
            {
              method: 'POST',
              body: JSON.stringify({
                title,
                body,
              }),
            },
          );

        const payload =
          await readJson<unknown>(
            response,
          );

        if (!response.ok) {
          return {
            ok: false,
            sent: 0,
            error:
              getErrorMessage(
                payload,
                'Failed to broadcast notification.',
              ),
          };
        }

        const data =
          extractData<Record<string, unknown>>(
            payload,
          );

        const sent = Number(
          data?.sent ??
            data?.count ??
            0,
        );

        addAnnouncement({
          title,
          body,
        } as Omit<
          Announcement,
          'id' | 'sentAt' | 'recipients'
        >);

        return {
          ok: true,
          sent: Number.isFinite(sent)
            ? sent
            : 0,
        };
      } catch (error) {
        return {
          ok: false,
          sent: 0,
          error:
            error instanceof Error
              ? error.message
              : 'Network error.',
        };
      }
    };

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
        const response =
          await adminApi(
            '/api/admin/notifications/targeted',
            {
              method: 'POST',
              body: JSON.stringify({
                userIds,
                title,
                body,
              }),
            },
          );

        const payload =
          await readJson<unknown>(
            response,
          );

        if (!response.ok) {
          return {
            ok: false,
            sent: 0,
            error:
              getErrorMessage(
                payload,
                'Failed to send targeted notification.',
              ),
          };
        }

        const data =
          extractData<Record<string, unknown>>(
            payload,
          );

        const sent = Number(
          data?.sent ??
            data?.count ??
            userIds.length,
        );

        return {
          ok: true,
          sent: Number.isFinite(sent)
            ? sent
            : userIds.length,
        };
      } catch (error) {
        return {
          ok: false,
          sent: 0,
          error:
            error instanceof Error
              ? error.message
              : 'Network error.',
        };
      }
    };

  // ───────────────────────────────────────────────────────────────────────────
  // Admin accounts
  // ───────────────────────────────────────────────────────────────────────────

  const fetchAdminAccounts =
    async (): Promise<void> => {
      setAdminAccountsLoading(true);

      try {
        const response =
          await adminApi(
            '/api/admin/accounts',
            {
              method: 'GET',
            },
          );

        if (!response.ok) {
          return;
        }

        const payload =
          await readJson<unknown>(
            response,
          );

        const list =
          extractArray<AdminAccount>(
            payload,
          );

        setAdminAccounts(list);
      } catch {
        // Preserve previous state.
      } finally {
        setAdminAccountsLoading(false);
      }
    };

  const addAdminAccount =
    async (data: {
      name: string;
      email: string;
      role: AdminRole;
      pin: string;
    }): Promise<boolean> => {
      try {
        const response =
          await adminApi(
            '/api/admin/accounts',
            {
              method: 'POST',
              body: JSON.stringify({
                ...data,
                email:
                  data.email
                    .trim()
                    .toLowerCase(),
              }),
            },
          );

        if (!response.ok) {
          return false;
        }

        await fetchAdminAccounts();

        return true;
      } catch {
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
        const response =
          await adminApi(
            `/api/admin/accounts/${encodeURIComponent(
              id,
            )}`,
            {
              method: 'PATCH',
              body: JSON.stringify({
                ...updates,
                ...(updates.email
                  ? {
                      email:
                        updates.email
                          .trim()
                          .toLowerCase(),
                    }
                  : {}),
              }),
            },
          );

        if (!response.ok) {
          return false;
        }

        await fetchAdminAccounts();

        return true;
      } catch {
        return false;
      }
    };

  const changeAdminPin =
    async (
      id: string,
      newPin: string,
    ): Promise<boolean> => {
      try {
        const response =
          await adminApi(
            `/api/admin/accounts/${encodeURIComponent(
              id,
            )}/pin`,
            {
              method: 'PATCH',
              body: JSON.stringify({
                pin: newPin,
              }),
            },
          );

        return response.ok;
      } catch {
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
        const response =
          await adminApi(
            `/api/admin/accounts/${encodeURIComponent(
              id,
            )}/status`,
            {
              method: 'PATCH',
              body: JSON.stringify({
                status: newStatus,
              }),
            },
          );

        if (!response.ok) {
          return false;
        }

        await fetchAdminAccounts();

        return true;
      } catch {
        return false;
      }
    };

  const removeAdminAccount =
    async (
      id: string,
    ): Promise<boolean> => {
      try {
        const response =
          await adminApi(
            `/api/admin/accounts/${encodeURIComponent(
              id,
            )}`,
            {
              method: 'DELETE',
            },
          );

        if (!response.ok) {
          return false;
        }

        setAdminAccounts(
          (current) =>
            current.filter(
              (account) =>
                String(account.id) !==
                String(id),
            ),
        );

        return true;
      } catch {
        return false;
      }
    };

  // ───────────────────────────────────────────────────────────────────────────
  // Own profile
  // ───────────────────────────────────────────────────────────────────────────

  const updateOwnProfile =
    async (
      updates: {
        name?: string;
        email?: string;
      },
    ): Promise<boolean> => {
      try {
        const response =
          await adminApi(
            '/api/admin/me',
            {
              method: 'PATCH',
              body: JSON.stringify({
                ...updates,
                ...(updates.email
                  ? {
                      email:
                        updates.email
                          .trim()
                          .toLowerCase(),
                    }
                  : {}),
              }),
            },
          );

        if (!response.ok) {
          return false;
        }

        if (updates.email) {
          setAdminEmail(
            updates.email
              .trim()
              .toLowerCase(),
          );
        }

        return true;
      } catch {
        return false;
      }
    };

  const changeOwnPin =
    async (
      currentPin: string,
      newPin: string,
    ): Promise<boolean> => {
      try {
        const response =
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

        return response.ok;
      } catch {
        return false;
      }
    };

  // ───────────────────────────────────────────────────────────────────────────
  // Audit logs
  // ───────────────────────────────────────────────────────────────────────────

  const fetchAuditLogs =
    async (): Promise<void> => {
      setAuditLogsLoading(true);

      try {
        const response =
          await adminApi(
            '/api/admin/audit-logs',
            {
              method: 'GET',
            },
          );

        if (!response.ok) {
          return;
        }

        const payload =
          await readJson<unknown>(
            response,
          );

        const list =
          extractArray<AuditLogEntry>(
            payload,
          );

        setAuditLogs(list);
      } catch {
        // Preserve previous state.
      } finally {
        setAuditLogsLoading(false);
      }
    };

  // ───────────────────────────────────────────────────────────────────────────
  // Refresh all
  // ───────────────────────────────────────────────────────────────────────────

  const refreshAll =
    async (): Promise<void> => {
      await Promise.allSettled([
        refreshStats(),
        fetchUsers(),
        fetchTransactions(),
        fetchWeeklyRevenue(),
        fetchServices(),
        fetchAdminAccounts(),
        fetchAuditLogs(),
      ]);
    };

  // ───────────────────────────────────────────────────────────────────────────
  // Initial authentication check
  // ───────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    let mounted = true;

    const initialize =
      async (): Promise<void> => {
        setIsAdminLoading(true);

        try {
          await loadCurrentAdmin();
        } finally {
          if (mounted) {
            setIsAdminLoading(false);
          }
        }
      };

    void initialize();

    return () => {
      mounted = false;
    };
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Context value
  // ───────────────────────────────────────────────────────────────────────────

  const value: AdminContextType = {
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

    // Audit logs
    auditLogs,
    auditLogsLoading,
    fetchAuditLogs,

    // Refresh
    refreshAll,
  };

  return (
    <AdminContext.Provider value={value}>
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
        'useAdminContext must be used inside an AdminProvider',
      );
    }

    return context;
  };

export default AdminContext;
