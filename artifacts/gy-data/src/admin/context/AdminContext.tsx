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

const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, '');

function buildAdminUrl(path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`;

  if (!BASE || BASE === '/') {
    return clean;
  }

  return `${BASE}${clean}`;
}

export function adminApi(
  path: string,
  opts: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(opts.headers);

  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(buildAdminUrl(path), {
    ...opts,
    credentials: 'include',
    headers,
  });
}

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
    status: 'active' | 'suspended',
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
    ann: Omit<Announcement, 'id' | 'sentAt' | 'recipients'>,
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

  removeAdminAccount: (id: string) => Promise<boolean>;

  updateOwnProfile: (updates: {
    name?: string;
    email?: string;
  }) => Promise<boolean>;

  changeOwnPin: (
    currentPin: string,
    newPin: string,
  ) => Promise<boolean>;

  auditLogs: AuditLogEntry[];
  auditLogsTotal: number;
  auditLogsLoading: boolean;
  fetchAuditLogs: () => Promise<void>;

  refreshAll: () => Promise<void>;
}

const AdminContext = createContext<AdminContextType | undefined>(
  undefined,
);

async function readJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

function normalizeRole(value: unknown): AdminRole {
  const role = String(value ?? '').trim().toLowerCase();

  if (
    role === 'super_admin' ||
    role === 'super-admin' ||
    role === 'superadmin'
  ) {
    return 'super_admin';
  }

  if (role === 'customer_care' || role === 'customer-care') {
    return 'customer_care';
  }

  return 'admin';
}

function unwrap<T>(payload: unknown): T | null {
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
  keys: string[] = [],
): T[] {
  if (Array.isArray(payload)) {
    return payload as T[];
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const value = payload as Record<string, unknown>;

  for (const key of [
    ...keys,
    'data',
    'items',
    'results',
    'users',
    'transactions',
    'revenue',
    'services',
    'admins',
    'logs',
  ]) {
    if (Array.isArray(value[key])) {
      return value[key] as T[];
    }
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

  for (const key of ['total', 'totalCount', 'count']) {
    const n = Number(value[key]);

    if (Number.isFinite(n)) {
      return n;
    }
  }

  if (value.meta && typeof value.meta === 'object') {
    const meta = value.meta as Record<string, unknown>;

    for (const key of ['total', 'totalCount', 'count']) {
      const n = Number(meta[key]);

      if (Number.isFinite(n)) {
        return n;
      }
    }
  }

  return fallback;
}

function errorMessage(
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

  return fallback;
}

function normalizeAdminAccount(
  raw: Record<string, unknown>,
): AdminAccount {
  const role = normalizeRole(raw.role);

  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    email: String(raw.email ?? ''),
    role,
    status:
      raw.status === 'disabled'
        ? 'disabled'
        : 'active',
    createdAt: String(
      raw.createdAt ??
        raw.created_at ??
        '',
    ),
    lastLogin: String(
      raw.lastLoginAt ??
        raw.last_login_at ??
        raw.lastLogin ??
        '',
    ),
    isSuperAdmin: role === 'super_admin',
  };
}

function normalizeAdminUser(
  raw: Record<string, unknown>,
): AdminUser {
  const status = String(raw.status ?? '');

  let normalizedStatus: AdminUser['status'] =
    'active';

  if (status === 'suspended') {
    normalizedStatus = 'suspended';
  } else if (status === 'pending') {
    normalizedStatus = 'pending';
  }

  const kyc = String(
    raw.kycStatus ??
      raw.kyc_status ??
      'unverified',
  );

  let kycStatus: AdminUser['kycStatus'] =
    'unverified';

  if (
    kyc === 'verified' ||
    kyc === 'pending' ||
    kyc === 'failed'
  ) {
    kycStatus = kyc;
  }

  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    email: String(raw.email ?? ''),
    phone: String(raw.phone ?? ''),
    balance: Number(
      raw.balance ??
        raw.walletBalance ??
        raw.wallet_balance ??
        0,
    ),
    status: normalizedStatus,
    kycStatus,
    joinedDate: String(
      raw.joinedDate ??
        raw.createdAt ??
        raw.created_at ??
        '',
    ),
    transactionCount: Number(
      raw.transactionCount ??
        raw.transaction_count ??
        0,
    ),
    totalSpent: Number(
      raw.totalSpent ??
        raw.total_spent ??
        0,
    ),
    referralCode: String(
      raw.referralCode ??
        raw.referral_code ??
        '',
    ),
    bankName: String(
      raw.bankName ??
        raw.bank_name ??
        '',
    ),
    accountNumber: String(
      raw.accountNumber ??
        raw.account_number ??
        '',
    ),
  };
}

export const AdminProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
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

  const [stats, setStats] =
    useState<AdminStats | null>(null);

  const [statsLoading, setStatsLoading] =
    useState(false);

  const [users, setUsers] =
    useState<AdminUser[]>([]);

  const [usersTotal, setUsersTotal] =
    useState(0);

  const [usersLoading, setUsersLoading] =
    useState(false);

  const [transactions, setTransactions] =
    useState<AdminTransaction[]>([]);

  const [txnsTotal, setTxnsTotal] =
    useState(0);

  const [txnsLoading, setTxnsLoading] =
    useState(false);

  const [weeklyRevenue, setWeeklyRevenue] =
    useState<WeeklyRevenue[]>([]);

  const [revenueLoading, setRevenueLoading] =
    useState(false);

  const [servicesData, setServicesData] =
    useState<ServiceBreakdown[]>([]);

  const [servicesLoading, setServicesLoading] =
    useState(false);

  const [announcements, setAnnouncements] =
    useState<Announcement[]>(
      seedAnnouncements ?? [],
    );

  const [adminAccounts, setAdminAccounts] =
    useState<AdminAccount[]>([]);

  const [
    adminAccountsLoading,
    setAdminAccountsLoading,
  ] = useState(false);

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

  const loadCurrentAdmin =
    async (): Promise<void> => {
      try {
        const response = await adminApi(
          '/api/admin/me',
        );

        const payload =
          await readJson<unknown>(response);

        if (!response.ok) {
          setIsAdminLoggedIn(false);
          setAdminEmail('');
          setCurrentAdminId('');
          setAdminRole('admin');
          return;
        }

        const data =
          unwrap<Record<string, unknown>>(
            payload,
          );

        if (!data) {
          setIsAdminLoggedIn(false);
          setAdminEmail('');
          setCurrentAdminId('');
          setAdminRole('admin');
          return;
        }

        const nestedAdmin =
          data.admin;

        const admin =
          nestedAdmin &&
          typeof nestedAdmin === 'object'
            ? (nestedAdmin as Record<string, unknown>)
            : data;

        setIsAdminLoggedIn(true);

        setAdminEmail(
          String(
            admin.email ?? '',
          ),
        );

        setCurrentAdminId(
          String(
            admin.id ?? '',
          ),
        );

        setAdminRole(
          normalizeRole(admin.role),
        );
      } catch {
        setIsAdminLoggedIn(false);
        setAdminEmail('');
        setCurrentAdminId('');
        setAdminRole('admin');
      }
    };

  const adminLogin = async (
    email: string,
    pin: string,
  ): Promise<boolean> => {
    try {
      setIsAdminLoading(true);

      const response = await adminApi(
        '/api/admin/login',
        {
          method: 'POST',
          body: JSON.stringify({
            email:
              email.trim().toLowerCase(),
            pin,
          }),
        },
      );

      const payload =
        await readJson<unknown>(response);

      if (!response.ok) {
        return false;
      }

      const unwrapped =
        unwrap<Record<string, unknown>>(
          payload,
        );

      if (!unwrapped) {
        return false;
      }

      /*
       * Backend returns:
       *
       * {
       *   success: true,
       *   admin: {
       *     id,
       *     email,
       *     role,
       *     status
       *   }
       * }
       *
       * Some older responses may put the admin
       * fields directly at the top level.
       *
       * Support both response shapes.
       */
      const nestedAdmin =
        unwrapped.admin;

      const data =
        nestedAdmin &&
        typeof nestedAdmin === 'object'
          ? (nestedAdmin as Record<string, unknown>)
          : unwrapped;

      const role =
        normalizeRole(data.role);

      /*
       * This is the Super Admin login screen.
       *
       * Do not create a Super Admin frontend
       * session when the API did not return the
       * Super Admin role.
       */
      if (role !== 'super_admin') {
        return false;
      }

      setIsAdminLoggedIn(true);

      setAdminEmail(
        String(
          data.email ??
            email.trim().toLowerCase(),
        ),
      );

      setCurrentAdminId(
        String(data.id ?? ''),
      );

      setAdminRole(role);

      return true;
    } catch {
      return false;
    } finally {
      setIsAdminLoading(false);
    }
  };

  const adminLogout = (): void => {
    void adminApi(
      '/api/admin/logout',
      {
        method: 'POST',
      },
    ).catch(() => undefined);

    setIsAdminLoggedIn(false);
    setAdminEmail('');
    setCurrentAdminId('');
    setAdminRole('admin');

    setStats(null);
    setUsers([]);
    setTransactions([]);
    setWeeklyRevenue([]);
    setServicesData([]);
    setAdminAccounts([]);
    setAuditLogs([]);
    setUsersTotal(0);
    setTxnsTotal(0);
    setAuditLogsTotal(0);
  };

  const refreshStats =
    async (): Promise<void> => {
      setStatsLoading(true);

      try {
        const response =
          await adminApi(
            '/api/admin/stats',
          );

        const payload =
          await readJson<unknown>(response);

        if (!response.ok) {
          return;
        }

        const data =
          unwrap<Record<string, unknown>>(
            payload,
          );

        if (!data) {
          return;
        }

        setStats(
          data as unknown as AdminStats,
        );
      } catch {
        // Preserve current state.
      } finally {
        setStatsLoading(false);
      }
    };

  const fetchUsers =
    async (
      params: {
        search?: string;
        status?: string;
        kyc?: string;
        page?: number;
      } = {},
    ): Promise<void> => {
      setUsersLoading(true);

      try {
        const searchParams =
          new URLSearchParams();

        if (params.search) {
          searchParams.set(
            'search',
            params.search,
          );
        }

        if (params.status) {
          searchParams.set(
            'status',
            params.status,
          );
        }

        if (params.kyc) {
          searchParams.set(
            'kyc',
            params.kyc,
          );
        }

        if (params.page) {
          searchParams.set(
            'page',
            String(params.page),
          );
        }

        const query =
          searchParams.toString();

        const response =
          await adminApi(
            `/api/admin/users${
              query
                ? `?${query}`
                : ''
            }`,
          );

        const payload =
          await readJson<unknown>(response);

        if (!response.ok) {
          return;
        }

        const raw =
          extractArray<Record<string, unknown>>(
            payload,
            ['users'],
          );

        const list =
          raw.map(
            normalizeAdminUser,
          );

        setUsers(list);

        setUsersTotal(
          extractTotal(
            payload,
            list.length,
          ),
        );
      } catch {
        // Preserve current state.
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

        setUsers(
          (current) =>
            current.map(
              (user) =>
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
        const searchParams =
          new URLSearchParams();

        if (params.search) {
          searchParams.set(
            'search',
            params.search,
          );
        }

        if (params.status) {
          searchParams.set(
            'status',
            params.status,
          );
        }

        if (params.type) {
          searchParams.set(
            'type',
            params.type,
          );
        }

        if (params.page) {
          searchParams.set(
            'page',
            String(params.page),
          );
        }

        const query =
          searchParams.toString();

        const response =
          await adminApi(
            `/api/admin/transactions${
              query
                ? `?${query}`
                : ''
            }`,
          );

        const payload =
          await readJson<unknown>(response);

        if (!response.ok) {
          return;
        }

        const list =
          extractArray<AdminTransaction>(
            payload,
            ['transactions'],
          );

        setTransactions(list);

        setTxnsTotal(
          extractTotal(
            payload,
            list.length,
          ),
        );
      } catch {
        // Preserve current state.
      } finally {
        setTxnsLoading(false);
      }
    };

  const fetchWeeklyRevenue =
    async (): Promise<void> => {
      setRevenueLoading(true);

      try {
        const response =
          await adminApi(
            '/api/admin/revenue/weekly',
          );

        const payload =
          await readJson<unknown>(response);

        if (!response.ok) {
          return;
        }

        const list =
          extractArray<WeeklyRevenue>(
            payload,
            ['revenue'],
          );

        setWeeklyRevenue(list);
      } catch {
        // Preserve current state.
      } finally {
        setRevenueLoading(false);
      }
    };

  const fetchServices =
    async (): Promise<void> => {
      setServicesLoading(true);

      try {
        const response =
          await adminApi(
            '/api/admin/services',
          );

        const payload =
          await readJson<unknown>(response);

        if (!response.ok) {
          return;
        }

        const list =
          extractArray<ServiceBreakdown>(
            payload,
            ['services'],
          );

        setServicesData(list);
      } catch {
        // Preserve current state.
      } finally {
        setServicesLoading(false);
      }
    };

  const addAnnouncement = (
    ann: Omit<
      Announcement,
      'id' | 'sentAt' | 'recipients'
    >,
  ): void => {
    const item: Announcement = {
      ...ann,
      id: `ann-${Date.now()}`,
      sentAt: new Date().toISOString(),
      recipients: 0,
    };

    setAnnouncements(
      (current) => [
        item,
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
          await readJson<unknown>(response);

        if (!response.ok) {
          return {
            ok: false,
            sent: 0,
            error: errorMessage(
              payload,
              'Failed to send notification.',
            ),
          };
        }

        const data =
          unwrap<Record<string, unknown>>(
            payload,
          );

        return {
          ok: true,
          sent: Number(
            data?.sent ?? 0,
          ),
        };
      } catch {
        return {
          ok: false,
          sent: 0,
          error:
            'Failed to send notification.',
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
          await readJson<unknown>(response);

        if (!response.ok) {
          return {
            ok: false,
            sent: 0,
            error: errorMessage(
              payload,
              'Failed to send notification.',
            ),
          };
        }

        const data =
          unwrap<Record<string, unknown>>(
            payload,
          );

        return {
          ok: true,
          sent: Number(
            data?.sent ?? 0,
          ),
        };
      } catch {
        return {
          ok: false,
          sent: 0,
          error:
            'Failed to send notification.',
        };
      }
    };

  const fetchAdminAccounts =
    async (): Promise<void> => {
      setAdminAccountsLoading(true);

      try {
        const response =
          await adminApi(
            '/api/admin/admins',
          );

        const payload =
          await readJson<unknown>(response);

        if (!response.ok) {
          return;
        }

        const raw =
          extractArray<Record<string, unknown>>(
            payload,
            ['admins'],
          );

        setAdminAccounts(
          raw.map(normalizeAdminAccount),
        );
      } catch {
        // Preserve current state.
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
        const role =
          data.role === 'super_admin'
            ? 'super_admin'
            : 'admin';

        const response =
          await adminApi(
            '/api/admin/admins',
            {
              method: 'POST',
              body: JSON.stringify({
                name: data.name.trim(),
                email:
                  data.email
                    .trim()
                    .toLowerCase(),
                role,
                pin: data.pin,
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
        const body: Record<
          string,
          unknown
        > = {};

        if (
          typeof updates.name === 'string'
        ) {
          body.name =
            updates.name.trim();
        }

        if (
          typeof updates.email === 'string'
        ) {
          body.email =
            updates.email
              .trim()
              .toLowerCase();
        }

        if (updates.role) {
          body.role =
            updates.role === 'super_admin'
              ? 'super_admin'
              : 'admin';
        }

        const response =
          await adminApi(
            `/api/admin/admins/${encodeURIComponent(
              id,
            )}`,
            {
              method: 'PATCH',
              body: JSON.stringify(body),
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
            `/api/admin/admins/${encodeURIComponent(
              id,
            )}/pin`,
            {
              method: 'PATCH',
              body: JSON.stringify({
                newPin,
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
            `/api/admin/admins/${encodeURIComponent(
              id,
            )}`,
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
        if (
          String(id) ===
          String(currentAdminId)
        ) {
          return false;
        }

        const response =
          await adminApi(
            `/api/admin/admins/${encodeURIComponent(
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

  const updateOwnProfile =
    async (
      updates: {
        name?: string;
        email?: string;
      },
    ): Promise<boolean> => {
      try {
        const body: Record<
          string,
          string
        > = {};

        if (
          typeof updates.name === 'string'
        ) {
          body.name =
            updates.name.trim();
        }

        if (
          typeof updates.email === 'string'
        ) {
          body.email =
            updates.email
              .trim()
              .toLowerCase();
        }

        const response =
          await adminApi(
            '/api/admin/me',
            {
              method: 'PATCH',
              body: JSON.stringify(body),
            },
          );

        const payload =
          await readJson<unknown>(response);

        if (!response.ok) {
          return false;
        }

        const data =
          unwrap<Record<string, unknown>>(
            payload,
          );

        const admin =
          data?.admin &&
          typeof data.admin === 'object'
            ? (data.admin as Record<string, unknown>)
            : data;

        if (updates.email) {
          setAdminEmail(
            updates.email
              .trim()
              .toLowerCase(),
          );
        }

        if (
          admin?.role !== undefined
        ) {
          setAdminRole(
            normalizeRole(admin.role),
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

  const fetchAuditLogs =
    async (): Promise<void> => {
      setAuditLogsLoading(true);

      try {
        const response =
          await adminApi(
            '/api/admin/audit-logs?limit=500',
          );

        const payload =
          await readJson<unknown>(response);

        if (!response.ok) {
          return;
        }

        const list =
          extractArray<AuditLogEntry>(
            payload,
            ['logs'],
          );

        setAuditLogs(list);

        setAuditLogsTotal(
          extractTotal(
            payload,
            list.length,
          ),
        );
      } catch {
        // Preserve current state.
      } finally {
        setAuditLogsLoading(false);
      }
    };

  const refreshAll =
    async (): Promise<void> => {
      const tasks: Promise<void>[] = [
        refreshStats(),
        fetchUsers(),
        fetchTransactions(),
        fetchWeeklyRevenue(),
        fetchServices(),
        fetchAuditLogs(),
      ];

      if (isSuperAdmin) {
        tasks.push(
          fetchAdminAccounts(),
        );
      }

      await Promise.allSettled(tasks);
    };

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

  useEffect(() => {
    if (
      !isAdminLoggedIn ||
      isAdminLoading
    ) {
      return;
    }

    void refreshStats();
    void fetchUsers();
    void fetchTransactions();
    void fetchWeeklyRevenue();
    void fetchServices();

    if (isSuperAdmin) {
      void fetchAdminAccounts();
      void fetchAuditLogs();
    }
  }, [
    isAdminLoggedIn,
    isAdminLoading,
    isSuperAdmin,
  ]);

  const value: AdminContextType = {
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

    refreshAll,
  };

  return (
    <AdminContext.Provider value={value}>
      {children}
    </AdminContext.Provider>
  );
};

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
