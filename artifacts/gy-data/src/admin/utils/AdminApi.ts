/**
 * adminApi.ts — typed API client for all admin + super-admin endpoints.
 */

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

// ══════════════════════════════════════════════════════════════════════════════
// EXISTING TYPES
// ══════════════════════════════════════════════════════════════════════════════

export interface UserFullProfile {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  accountNumber: string;
  bankName: string;
  referralCode: string;
  kycStatus: string;
  status: string;
  walletBalance: number;
  transactionCount: number;
  totalSpent: number;
  lastTransactionAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WalletSummary {
  walletId: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
  totalCredited: number;
  totalDebited: number;
  totalReversed: number;
  ledgerCount: number;
}

export interface WalletLedgerEntry {
  id: string;
  type:
    | 'credit'
    | 'debit'
    | 'reversal'
    | 'adjustment'
    | 'wallet_fund';
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reference: string | null;
  reason: string | null;
  performedBy: string | null;
  performedByName: string | null;
  createdAt: string;
}

export interface UserStatusHistoryEntry {
  id: string;
  previousStatus: string;
  newStatus: string;
  reason: string | null;
  performedBy: string | null;
  performedByName: string | null;
  createdAt: string;
}

export interface UserTransaction {
  id: string;
  type: string;
  service: string;
  provider: string;
  amount: number;
  status: string;
  reference: string;
  description: string;
  paymentMethod: string | null;
  createdAt: string;
}

export interface TransactionDetail {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  userEmail: string;
  type: string;
  service: string;
  provider: string;
  amount: number;
  status: string;
  reference: string | null;
  description: string;
  paymentMethod: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  reversal: {
    id: string;
    reason: string;
    performedByName: string;
    createdAt: string;
  } | null;
}

export interface ReversalRecord {
  id: string;
  originalTransactionId: string;
  userId: string;
  userName: string;
  userPhone: string;
  amount: number;
  reason: string;
  performedBy: string;
  performedByName: string;
  txType: string;
  txService: string;
  txReference: string | null;
  walletLedgerId: string | null;
  createdAt: string;
}

export interface ServiceSetting {
  id: string;
  serviceKey: string;
  label: string;
  enabled: boolean;
  markup: number | null;
  notes: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
}

export interface AdminProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  financePermissions?: string[];
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string | null;
}

export interface DashboardSummary {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  totalTransactions: number;
  successfulTransactions: number;
  pendingTransactions: number;
  failedTransactions: number;
  totalRevenue: number;
  totalWalletBalance: number;
  totalWalletCredits: number;
  totalWalletDebits: number;
}

export interface DashboardExtended {
  daily: unknown[];
  weekly: unknown[];
  monthly: unknown[];
  profit: unknown[];
  activeToday: number;
  newUsersThisWeek: number;
  activity: unknown[];
}

export interface PaginatedUsers {
  users: UserFullProfile[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface PaginatedTransactions {
  transactions: UserTransaction[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface PaginatedLedger {
  entries: WalletLedgerEntry[];
  total: number;
  pages: number;
}

export interface FinanceOverview {
  totalWalletBalance: number;
  totalWalletCredits: number;
  totalWalletDebits: number;
  totalTransactions: number;
  totalRevenue: number;
  totalProfit: number;
}

export interface FinanceTransaction {
  id: string;
  userId: string;
  userName: string;
  type: string;
  service: string;
  provider: string;
  amount: number;
  status: string;
  reference: string | null;
  description: string;
  paymentMethod: string | null;
  createdAt: string;
}

export interface WalletAdjustmentResponse {
  ok: boolean;
  reference: string;
  balanceBefore: number;
  balanceAfter: number;
  type?: 'credit' | 'debit';
  amount?: number;
}

export interface CashbackSettings {
  enabled: boolean;
  minTransferAmount: number;
  transferMode: 'manual' | 'auto';
  eligibleServices: string[];
}

export interface CashbackSummary {
  enabled: boolean;
  totalCashback: number;
  totalTransferred: number;
  pendingCashback: number;
}

export interface PricingRule {
  id: string;
  service: string;
  network: string | null;
  planId: string | null;
  planName: string | null;
  buyPrice: number | null;
  sellingPrice: number | null;
  markup: number | null;
  cashback: number | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DataPlan {
  id?: string;
  DataPlan?: string;
  DataPlanName?: string;
  DataPlanType?: string;
  Network?: string;
  Price?: number | string;
  planId?: string;
  planName?: string;
  network?: string;
  price?: number | string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  senderId: string;
  senderType: string;
  message: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  adminId: string | null;
  adminEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
}

export interface FinancialAuditLog {
  id: string;
  adminId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  amount: number | null;
  reference: string | null;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface AdminLoginResponse {
  ok: boolean;
  admin: AdminProfile;
}

export interface GenericApiResponse {
  ok: boolean;
  message?: string;
  error?: string;
}

export interface PaginatedAuditLogs {
  logs: AuditLog[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export interface PaginatedFinancialAuditLogs {
  logs: FinancialAuditLog[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN AUTH
// ══════════════════════════════════════════════════════════════════════════════

export async function apiAdminLogin(
  email: string,
  password: string,
): Promise<AdminLoginResponse> {
  const r = await adminApi('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
    }),
  });

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Admin login failed.',
    );
  }

  return data as AdminLoginResponse;
}

export async function apiAdminLogout(): Promise<GenericApiResponse> {
  const r = await adminApi('/api/admin/logout', {
    method: 'POST',
  });

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Admin logout failed.',
    );
  }

  return data as GenericApiResponse;
}

export async function apiGetAdminMe(): Promise<AdminProfile> {
  const r = await adminApi('/api/admin/me');

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load admin profile.',
    );
  }

  return (data.admin ?? data) as AdminProfile;
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetDashboardSummary(): Promise<DashboardSummary> {
  const r = await adminApi('/api/admin/dashboard');

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load dashboard.',
    );
  }

  return (data.dashboard ?? data) as DashboardSummary;
}

export async function apiGetDashboardExtended(): Promise<DashboardExtended> {
  const r = await adminApi('/api/admin/dashboard/extended');

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load extended dashboard.',
    );
  }

  return (data.dashboard ?? data) as DashboardExtended;
}

// ══════════════════════════════════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetUsers(
  params?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  },
): Promise<PaginatedUsers> {
  const query = new URLSearchParams();

  if (params?.search) {
    query.set('search', params.search);
  }

  if (params?.status) {
    query.set('status', params.status);
  }

  if (params?.page !== undefined) {
    query.set('page', String(params.page));
  }

  if (params?.limit !== undefined) {
    query.set('limit', String(params.limit));
  }

  const qs = query.toString();

  const r = await adminApi(
    `/api/admin/users${qs ? `?${qs}` : ''}`,
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load users.',
    );
  }

  return data as PaginatedUsers;
}

export async function apiGetUser(
  userId: string,
): Promise<UserFullProfile> {
  const r = await adminApi(
    `/api/admin/users/${encodeURIComponent(userId)}`,
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load user.',
    );
  }

  return (data.user ?? data) as UserFullProfile;
}

export async function apiUpdateUserStatus(
  userId: string,
  status: string,
  reason?: string,
): Promise<GenericApiResponse> {
  const r = await adminApi(
    `/api/admin/users/${encodeURIComponent(userId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        reason,
      }),
    },
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to update user status.',
    );
  }

  return data as GenericApiResponse;
}

export async function apiGetUserStatusHistory(
  userId: string,
): Promise<UserStatusHistoryEntry[]> {
  const r = await adminApi(
    `/api/admin/users/${encodeURIComponent(userId)}/status-history`,
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load user status history.',
    );
  }

  return (
    data.history ??
    data.entries ??
    data ??
    []
  ) as UserStatusHistoryEntry[];
}

// ══════════════════════════════════════════════════════════════════════════════
// WALLET
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetUserWallet(
  userId: string,
): Promise<WalletSummary> {
  const r = await adminApi(
    `/api/admin/users/${encodeURIComponent(userId)}/wallet`,
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load wallet.',
    );
  }

  return (data.wallet ?? data) as WalletSummary;
}

export async function apiGetWalletLedger(
  userId: string,
  params?: {
    page?: number;
    limit?: number;
    type?: string;
  },
): Promise<PaginatedLedger> {
  const query = new URLSearchParams();

  if (params?.page !== undefined) {
    query.set('page', String(params.page));
  }

  if (params?.limit !== undefined) {
    query.set('limit', String(params.limit));
  }

  if (params?.type) {
    query.set('type', params.type);
  }

  const qs = query.toString();

  const r = await adminApi(
    `/api/admin/users/${encodeURIComponent(userId)}/wallet/ledger${
      qs ? `?${qs}` : ''
    }`,
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load wallet ledger.',
    );
  }

  return data as PaginatedLedger;
}

export async function apiCreditWallet(
  userId: string,
  amount: number,
  reason: string,
): Promise<WalletAdjustmentResponse> {
  const r = await adminApi(
    `/api/admin/finance/users/${encodeURIComponent(userId)}/wallet/adjust`,
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'credit',
        amount,
        reason,
      }),
    },
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to credit wallet.',
    );
  }

  return data as WalletAdjustmentResponse;
}

export async function apiDebitWallet(
  userId: string,
  amount: number,
  reason: string,
): Promise<WalletAdjustmentResponse> {
  const r = await adminApi(
    `/api/admin/finance/users/${encodeURIComponent(userId)}/wallet/adjust`,
    {
      method: 'POST',
      body: JSON.stringify({
        type: 'debit',
        amount,
        reason,
      }),
    },
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to debit wallet.',
    );
  }

  return data as WalletAdjustmentResponse;
}

// ══════════════════════════════════════════════════════════════════════════════
// USER TRANSACTIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetUserTransactions(
  userId: string,
  params?: {
    status?: string;
    page?: number;
    limit?: number;
  },
): Promise<PaginatedTransactions> {
  const query = new URLSearchParams();

  if (params?.status) {
    query.set('status', params.status);
  }

  if (params?.page !== undefined) {
    query.set('page', String(params.page));
  }

  if (params?.limit !== undefined) {
    query.set('limit', String(params.limit));
  }

  const qs = query.toString();

  const r = await adminApi(
    `/api/admin/users/${encodeURIComponent(userId)}/transactions${
      qs ? `?${qs}` : ''
    }`,
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load user transactions.',
    );
  }

  return data as PaginatedTransactions;
}

// ══════════════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetTransactions(
  params?: {
    search?: string;
    status?: string;
    type?: string;
    service?: string;
    page?: number;
    limit?: number;
  },
): Promise<PaginatedTransactions> {
  const query = new URLSearchParams();

  if (params?.search) {
    query.set('search', params.search);
  }

  if (params?.status) {
    query.set('status', params.status);
  }

  if (params?.type) {
    query.set('type', params.type);
  }

  if (params?.service) {
    query.set('service', params.service);
  }

  if (params?.page !== undefined) {
    query.set('page', String(params.page));
  }

  if (params?.limit !== undefined) {
    query.set('limit', String(params.limit));
  }

  const qs = query.toString();

  const r = await adminApi(
    `/api/admin/transactions${qs ? `?${qs}` : ''}`,
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load transactions.',
    );
  }

  return data as PaginatedTransactions;
}

export async function apiGetTransaction(
  transactionId: string,
): Promise<TransactionDetail> {
  const r = await adminApi(
    `/api/admin/transactions/${encodeURIComponent(transactionId)}`,
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load transaction.',
    );
  }

  return (data.transaction ?? data) as TransactionDetail;
}

// ══════════════════════════════════════════════════════════════════════════════
// FINANCE
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetFinanceOverview(): Promise<FinanceOverview> {
  const r = await adminApi('/api/admin/finance/overview');

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load finance overview.',
    );
  }

  return (data.overview ?? data) as FinanceOverview;
}

export async function apiGetFinanceTransactions(
  params?: {
    search?: string;
    type?: string;
    status?: string;
    page?: number;
    limit?: number;
  },
): Promise<{
  transactions: FinanceTransaction[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> {
  const query = new URLSearchParams();

  if (params?.search) {
    query.set('search', params.search);
  }

  if (params?.type) {
    query.set('type', params.type);
  }

  if (params?.status) {
    query.set('status', params.status);
  }

  if (params?.page !== undefined) {
    query.set('page', String(params.page));
  }

  if (params?.limit !== undefined) {
    query.set('limit', String(params.limit));
  }

  const qs = query.toString();

  const r = await adminApi(
    `/api/admin/finance/transactions${qs ? `?${qs}` : ''}`,
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load finance transactions.',
    );
  }

  return data;
}

// ══════════════════════════════════════════════════════════════════════════════
// PRICING
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetPricingRules(
  params?: {
    service?: string;
    network?: string;
    enabled?: boolean;
    page?: number;
    limit?: number;
  },
): Promise<{
  rules: PricingRule[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> {
  const query = new URLSearchParams();

  if (params?.service) {
    query.set('service', params.service);
  }

  if (params?.network) {
    query.set('network', params.network);
  }

  if (params?.enabled !== undefined) {
    query.set('enabled', String(params.enabled));
  }

  if (params?.page !== undefined) {
    query.set('page', String(params.page));
  }

  if (params?.limit !== undefined) {
    query.set('limit', String(params.limit));
  }

  const qs = query.toString();

  const r = await adminApi(
    `/api/admin/pricing-rules${qs ? `?${qs}` : ''}`,
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load pricing rules.',
    );
  }

  return data;
}

export async function apiCreatePricingRule(
  payload: Partial<PricingRule>,
): Promise<PricingRule> {
  const r = await adminApi('/api/admin/pricing-rules', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to create pricing rule.',
    );
  }

  return (data.rule ?? data) as PricingRule;
}

export async function apiUpdatePricingRule(
  id: string,
  payload: Partial<PricingRule>,
): Promise<PricingRule> {
  const r = await adminApi(
    `/api/admin/pricing-rules/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to update pricing rule.',
    );
  }

  return (data.rule ?? data) as PricingRule;
}

export async function apiDeletePricingRule(
  id: string,
): Promise<GenericApiResponse> {
  const r = await adminApi(
    `/api/admin/pricing-rules/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    },
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to delete pricing rule.',
    );
  }

  return data as GenericApiResponse;
}

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE SETTINGS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetServiceSettings(): Promise<ServiceSetting[]> {
  const r = await adminApi('/api/admin/service-settings');

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load service settings.',
    );
  }

  return (
    data.settings ??
    data ??
    []
  ) as ServiceSetting[];
}

export async function apiUpdateServiceSetting(
  serviceKey: string,
  payload: Partial<ServiceSetting>,
): Promise<ServiceSetting> {
  const r = await adminApi(
    `/api/admin/service-settings/${encodeURIComponent(serviceKey)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to update service setting.',
    );
  }

  return (data.setting ?? data) as ServiceSetting;
}

// ══════════════════════════════════════════════════════════════════════════════
// CASHBACK
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetCashbackSettings(): Promise<CashbackSettings> {
  const r = await adminApi('/api/admin/cashback/settings');

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load cashback settings.',
    );
  }

  return (data.settings ?? data) as CashbackSettings;
}

export async function apiUpdateCashbackSettings(
  payload: Partial<CashbackSettings>,
): Promise<CashbackSettings> {
  const r = await adminApi('/api/admin/cashback/settings', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to update cashback settings.',
    );
  }

  return (data.settings ?? data) as CashbackSettings;
}

export async function apiGetCashbackSummary(): Promise<CashbackSummary> {
  const r = await adminApi('/api/admin/cashback/summary');

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load cashback summary.',
    );
  }

  return (data.summary ?? data) as CashbackSummary;
}

// ══════════════════════════════════════════════════════════════════════════════
// SUPPORT
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetSupportTickets(
  params?: {
    status?: string;
    priority?: string;
    search?: string;
    page?: number;
    limit?: number;
  },
): Promise<{
  tickets: SupportTicket[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}> {
  const query = new URLSearchParams();

  if (params?.status) {
    query.set('status', params.status);
  }

  if (params?.priority) {
    query.set('priority', params.priority);
  }

  if (params?.search) {
    query.set('search', params.search);
  }

  if (params?.page !== undefined) {
    query.set('page', String(params.page));
  }

  if (params?.limit !== undefined) {
    query.set('limit', String(params.limit));
  }

  const qs = query.toString();

  const r = await adminApi(
    `/api/admin/support-inbox/tickets${qs ? `?${qs}` : ''}`,
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load support tickets.',
    );
  }

  return data;
}

export async function apiGetSupportTicket(
  ticketId: string,
): Promise<{
  ticket: SupportTicket;
  messages: SupportMessage[];
}> {
  const r = await adminApi(
    `/api/admin/support-inbox/tickets/${encodeURIComponent(ticketId)}`,
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load support ticket.',
    );
  }

  return data;
}

export async function apiReplySupportTicket(
  ticketId: string,
  message: string,
): Promise<SupportMessage> {
  const r = await adminApi(
    `/api/admin/support-inbox/tickets/${encodeURIComponent(ticketId)}/reply`,
    {
      method: 'POST',
      body: JSON.stringify({
        message,
      }),
    },
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to reply to support ticket.',
    );
  }

  return (data.message ?? data) as SupportMessage;
}

export async function apiUpdateSupportTicket(
  ticketId: string,
  payload: {
    status?: string;
    priority?: string;
  },
): Promise<SupportTicket> {
  const r = await adminApi(
    `/api/admin/support-inbox/tickets/${encodeURIComponent(ticketId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to update support ticket.',
    );
  }

  return (data.ticket ?? data) as SupportTicket;
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetAuditLogs(
  params?: {
    action?: string;
    adminId?: string;
    targetType?: string;
    targetId?: string;
    page?: number;
    limit?: number;
  },
): Promise<PaginatedAuditLogs> {
  const query = new URLSearchParams();

  if (params?.action) {
    query.set('action', params.action);
  }

  if (params?.adminId) {
    query.set('adminId', params.adminId);
  }

  if (params?.targetType) {
    query.set('targetType', params.targetType);
  }

  if (params?.targetId) {
    query.set('targetId', params.targetId);
  }

  if (params?.page !== undefined) {
    query.set('page', String(params.page));
  }

  if (params?.limit !== undefined) {
    query.set('limit', String(params.limit));
  }

  const qs = query.toString();

  const r = await adminApi(
    `/api/admin/audit-logs${qs ? `?${qs}` : ''}`,
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load audit logs.',
    );
  }

  return data;
}

export async function apiGetFinancialAuditLogs(
  params?: {
    action?: string;
    adminId?: string;
    targetType?: string;
    targetId?: string;
    page?: number;
    limit?: number;
  },
): Promise<PaginatedFinancialAuditLogs> {
  const query = new URLSearchParams();

  if (params?.action) {
    query.set('action', params.action);
  }

  if (params?.adminId) {
    query.set('adminId', params.adminId);
  }

  if (params?.targetType) {
    query.set('targetType', params.targetType);
  }

  if (params?.targetId) {
    query.set('targetId', params.targetId);
  }

  if (params?.page !== undefined) {
    query.set('page', String(params.page));
  }

  if (params?.limit !== undefined) {
    query.set('limit', String(params.limit));
  }

  const qs = query.toString();

  const r = await adminApi(
    `/api/admin/finance/audit-logs${qs ? `?${qs}` : ''}`,
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load financial audit logs.',
    );
  }

  return data;
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ACCOUNTS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetAdmins(): Promise<AdminUser[]> {
  const r = await adminApi('/api/admin/admins');

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load admins.',
    );
  }

  return (
    data.admins ??
    data ??
    []
  ) as AdminUser[];
}

export async function apiCreateAdmin(
  payload: {
    name: string;
    email: string;
    password: string;
    role: 'admin' | 'super_admin';
    financePermissions?: string[];
  },
): Promise<AdminUser> {
  const r = await adminApi('/api/admin/admins', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to create admin.',
    );
  }

  return (data.admin ?? data) as AdminUser;
}

export async function apiUpdateAdmin(
  adminId: string,
  payload: {
    name?: string;
    email?: string;
    role?: 'admin' | 'super_admin';
    status?: 'active' | 'disabled';
    financePermissions?: string[];
  },
): Promise<AdminUser> {
  const r = await adminApi(
    `/api/admin/admins/${encodeURIComponent(adminId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to update admin.',
    );
  }

  return (data.admin ?? data) as AdminUser;
}

export async function apiDeleteAdmin(
  adminId: string,
): Promise<GenericApiResponse> {
  const r = await adminApi(
    `/api/admin/admins/${encodeURIComponent(adminId)}`,
    {
      method: 'DELETE',
    },
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to delete admin.',
    );
  }

  return data as GenericApiResponse;
}

// ══════════════════════════════════════════════════════════════════════════════
// DATA PLANS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetDataPlans(
  network?: string,
): Promise<DataPlan[]> {
  const query = new URLSearchParams();

  if (network) {
    query.set('network', network);
  }

  const qs = query.toString();

  const r = await adminApi(
    `/api/admin/data-plans${qs ? `?${qs}` : ''}`,
  );

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'Failed to load data plans.',
    );
  }

  return (
    data.plans ??
    data ??
    []
  ) as DataPlan[];
}

// ══════════════════════════════════════════════════════════════════════════════
// GENERIC HELPERS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiHealthCheck(): Promise<GenericApiResponse> {
  const r = await adminApi('/api/health');

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : 'API health check failed.',
    );
  }

  return data as GenericApiResponse;
}

export async function apiGet(
  path: string,
): Promise<unknown> {
  const r = await adminApi(path);

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : `Request failed (${r.status}).`,
    );
  }

  return data;
}

export async function apiPost(
  path: string,
  body?: unknown,
): Promise<unknown> {
  const r = await adminApi(path, {
    method: 'POST',
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body),
  });

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : `Request failed (${r.status}).`,
    );
  }

  return data;
}

export async function apiPatch(
  path: string,
  body?: unknown,
): Promise<unknown> {
  const r = await adminApi(path, {
    method: 'PATCH',
    body:
      body === undefined
        ? undefined
        : JSON.stringify(body),
  });

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : `Request failed (${r.status}).`,
    );
  }

  return data;
}

export async function apiDelete(
  path: string,
): Promise<unknown> {
  const r = await adminApi(path, {
    method: 'DELETE',
  });

  const data = await r.json();

  if (!r.ok) {
    throw new Error(
      typeof data?.error === 'string'
        ? data.error
        : `Request failed (${r.status}).`,
    );
  }

  return data;
}
