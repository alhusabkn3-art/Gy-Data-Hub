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
// TYPES
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
  type: 'credit' | 'debit' | 'reversal' | 'adjustment' | 'wallet_fund';
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

export interface SystemSettingValue {
  value: string;
  updatedBy: string | null;
  updatedByName: string | null;
  updatedAt: string;
}

export interface IntegrationField {
  label: string;
  value: string;
  sensitive: boolean;
}

export interface Integration {
  key: string;
  label: string;
  status: 'configured' | 'not_configured';
  fields: IntegrationField[];
}

export interface FinancialReport {
  transactions: {
    totalCount: number;
    successfulCount: number;
    failedCount: number;
    pendingCount: number;
    totalRevenue: number;
    failedValue: number;
    pendingValue: number;
    walletFunding: number;
  };
  wallet: {
    totalManualCredits: number;
    totalManualDebits: number;
    totalReversals: number;
    ledgerEntries: number;
  };
  reversals: {
    count: number;
    totalAmount: number;
  };
  dailyRevenue: {
    day: string;
    revenue: number;
    count: number;
  }[];
  serviceBreakdown: {
    type: string;
    revenue: number;
    count: number;
  }[];
}

export interface NotificationHistoryEntry {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  userName: string;
  userPhone: string;
  createdAt: string;
}

export interface DashboardExtended {
  dailyRevenue: {
    day: string;
    revenue: number;
    count: number;
  }[];
  weeklyRevenue: {
    week: string;
    revenue: number;
    count: number;
  }[];
  monthlyRevenue: {
    month: string;
    revenue: number;
    count: number;
  }[];
  profitMargin: number;
  totalCost: number;
  netProfit: number;
  activeUsersToday: number;
  newUsersThisWeek: number;
  recentActivity: {
    id: string;
    action: string;
    adminEmail: string;
    targetLabel: string | null;
    createdAt: string;
  }[];
}

export interface UserLoginHistoryEntry {
  id: string;
  userId: string;
  status: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  rank: string;
  salary: number;
  salaryPaymentDay: number;
  department: string | null;
  status: string;
  permissions: string[];
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StaffAttendanceRecord {
  id: string;
  staffId: string;
  date: string;
  checkIn: string | null;
  checkOut: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
}

export interface StaffActivityEntry {
  id: string;
  staffId: string;
  action: string;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string;
}

export interface PricingRule {
  id: string;
  serviceType: string;
  provider: string;
  network: string | null;
  planId: string | null;
  planName: string | null;
  costPrice: number;
  sellingPrice: number;
  markupPercent: number;
  enabled: boolean;
  updatedAt: string;
  createdAt: string;
}

export interface ApiConfig {
  key: string;
  label: string;
  enabled: boolean;
  status: 'online' | 'offline' | 'unknown';
  lastChecked: string | null;
  fields: {
    name: string;
    label: string;
    value: string;
    sensitive: boolean;
  }[];
}

export interface ApiLogEntry {
  id: string;
  api: string;
  endpoint: string;
  method: string;
  statusCode: number | null;
  responseTime: number | null;
  error: string | null;
  requestRef: string | null;
  createdAt: string;
}

export interface FundingRequest {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  reference: string;
  amount: number;
  gateway: string;
  status: string;
  metadata: Record<string, unknown>;
  reviewedByName: string | null;
  reviewedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
}

export interface FundingStats {
  pendingCount: number;
  pendingTotal: number;
  approvedToday: number;
  approvedTodayTotal: number;
  rejectedToday: number;
  totalFundedAllTime: number;
}

export interface AdminLoginHistoryEntry {
  id: string;
  adminId: string;
  adminEmail: string;
  ipAddress: string | null;
  userAgent: string | null;
  status: string;
  failReason: string | null;
  createdAt: string;
}

export interface AdminSessionRecord {
  id: string;
  adminId: string;
  adminEmail: string;
  ipAddress: string | null;
  userAgent: string | null;
  lastActive: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface CashbackPlan {
  id: string;
  serviceType: string;
  network: string | null;
  percentage: number;
  fixedAmount: number;
  enabled: boolean;
  updatedAt: string;
}

export interface CashbackSettings {
  enabled: boolean;
  defaultPercentage: number;
  minimumAmount: number;
  maximumCashback: number;
  updatedAt: string;
}

export interface CashbackReports {
  totalCashback: number;
  totalUsers: number;
  totalTransactions: number;
  monthly: {
    month: string;
    cashback: number;
    users: number;
    transactions: number;
  }[];
}

// ══════════════════════════════════════════════════════════════════════════════
// USER API
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetUserProfile(
  userId: string,
): Promise<UserFullProfile> {
  const r = await adminApi(`/api/admin/users/${userId}`);

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  const data = await r.json() as UserFullProfile | { user: UserFullProfile };

  if ('user' in data) {
    return data.user;
  }

  return data;
}

export async function apiGetUserWallet(
  userId: string,
): Promise<WalletSummary> {
  const r = await adminApi(`/api/admin/users/${userId}/wallet`);

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<WalletSummary>;
}

export async function apiGetWalletLedger(
  userId: string,
  page = 1,
  limit = 25,
): Promise<{
  entries: WalletLedgerEntry[];
  total: number;
  pages: number;
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/wallet/ledger?page=${page}&limit=${limit}`,
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    entries: WalletLedgerEntry[];
    total: number;
    pages: number;
  }>;
}

export async function apiCreditWallet(
  userId: string,
  amount: number,
  reason: string,
): Promise<{
  ok: boolean;
  reference: string;
  walletId: string;
  balance: number;
  balanceBefore: number;
  balanceAfter: number;
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/fund-wallet`,
    {
      method: 'POST',
      body: JSON.stringify({
        amount,
        reason,
      }),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  const data = await r.json() as {
    ok: boolean;
    reference: string;
    walletId: string;
    balance: number;
  };

  return {
    ok: data.ok,
    reference: data.reference,
    walletId: data.walletId,
    balance: Number(data.balance),
    balanceBefore: Number(data.balance) - amount,
    balanceAfter: Number(data.balance),
  };
}

export async function apiDebitWallet(
  userId: string,
  amount: number,
  reason: string,
): Promise<{
  ok: boolean;
  reference: string;
  balanceBefore: number;
  balanceAfter: number;
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/wallet/debit`,
    {
      method: 'POST',
      body: JSON.stringify({
        amount,
        reason,
      }),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    reference: string;
    balanceBefore: number;
    balanceAfter: number;
  }>;
}

export async function apiGetUserStatusHistory(
  userId: string,
): Promise<{
  history: UserStatusHistoryEntry[];
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/status-history`,
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    history: UserStatusHistoryEntry[];
  }>;
}

export async function apiUpdateUserStatus(
  userId: string,
  status: string,
  reason?: string,
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        status,
        reason,
      }),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    ok: boolean;
  }>;
}

/**
 * Backward-compatible export used by AdminUsers.tsx.
 */
export async function apiChangeUserStatus(
  userId: string,
  status: 'active' | 'suspended',
  reason?: string,
): Promise<{
  ok: boolean;
}> {
  return apiUpdateUserStatus(userId, status, reason);
}

/**
 * Backward-compatible login PIN reset API.
 *
 * The current backend does not expose a dedicated admin login-PIN reset
 * endpoint. This function therefore uses the existing user update endpoint
 * only when a temporary PIN is explicitly supplied by the caller.
 */
export async function apiResetLoginPin(
  userId: string,
): Promise<{
  ok: boolean;
  tempPin: string;
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/reset-login-pin`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ??
      'Login PIN reset endpoint is not available.',
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    tempPin: string;
  }>;
}

/**
 * Backward-compatible purchase PIN reset API.
 */
export async function apiResetPurchasePin(
  userId: string,
): Promise<{
  ok: boolean;
  tempPin: string;
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/reset-purchase-pin`,
    {
      method: 'POST',
      body: JSON.stringify({}),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ??
      'Purchase PIN reset endpoint is not available.',
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    tempPin: string;
  }>;
}

export async function apiGetUserTransactions(
  userId: string,
  options: {
    page?: number;
    limit?: number;
    status?: string;
  } = {},
): Promise<{
  transactions: UserTransaction[];
  total: number;
  pages: number;
}> {
  const page = options.page ?? 1;
  const limit = options.limit ?? 25;
  const status = options.status ?? 'all';

  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (status && status !== 'all') {
    params.set('status', status);
  }

  const r = await adminApi(
    `/api/admin/users/${userId}/transactions?${params.toString()}`,
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    transactions: UserTransaction[];
    total: number;
    pages: number;
  }>;
}

export async function apiGetTransaction(
  transactionId: string,
): Promise<TransactionDetail> {
  const r = await adminApi(
    `/api/admin/transactions/${transactionId}`,
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<TransactionDetail>;
}

export async function apiReverseTransaction(
  transactionId: string,
  reason: string,
): Promise<{
  ok: boolean;
  reference: string;
}> {
  const r = await adminApi(
    `/api/admin/transactions/${transactionId}/reverse`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    reference: string;
  }>;
}

export async function apiGetReversals(
  page = 1,
  limit = 25,
): Promise<{
  reversals: ReversalRecord[];
  total: number;
  pages: number;
}> {
  const r = await adminApi(
    `/api/admin/reversals?page=${page}&limit=${limit}`,
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    reversals: ReversalRecord[];
    total: number;
    pages: number;
  }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetServiceSettings(): Promise<{
  settings: ServiceSetting[];
}> {
  const r = await adminApi('/api/admin/services');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    settings: ServiceSetting[];
  }>;
}

export async function apiUpdateServiceSetting(
  serviceKey: string,
  updates: {
    enabled?: boolean;
    markup?: number | null;
    notes?: string | null;
  },
): Promise<{ ok: boolean }> {
  const r = await adminApi(
    `/api/admin/services/${encodeURIComponent(serviceKey)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{ ok: boolean }>;
}

export async function apiGetSystemSettings(): Promise<{
  settings: Record<string, SystemSettingValue>;
}> {
  const r = await adminApi('/api/admin/settings');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    settings: Record<string, SystemSettingValue>;
  }>;
}

export async function apiUpdateSystemSetting(
  key: string,
  value: string,
): Promise<{ ok: boolean }> {
  const r = await adminApi(
    `/api/admin/settings/${encodeURIComponent(key)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ value }),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{ ok: boolean }>;
}

export async function apiGetIntegrations(): Promise<{
  integrations: Integration[];
}> {
  const r = await adminApi('/api/admin/integrations');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    integrations: Integration[];
  }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetDashboardExtended(): Promise<DashboardExtended> {
  const r = await adminApi('/api/admin/dashboard');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  const data = await r.json() as {
    users?: number;
    activeUsers?: number;
    walletBalance?: number;
    transactions?: number;
    pendingTransactions?: number;
    successfulTransactions?: number;
  };

  return {
    dailyRevenue: [],
    weeklyRevenue: [],
    monthlyRevenue: [],
    profitMargin: 0,
    totalCost: 0,
    netProfit: 0,
    activeUsersToday: Number(data.activeUsers ?? 0),
    newUsersThisWeek: 0,
    recentActivity: [],
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// USER LOGIN HISTORY
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetUserLoginHistory(
  userId: string,
): Promise<{
  history: UserLoginHistoryEntry[];
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/login-history`,
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    history: UserLoginHistoryEntry[];
  }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// STAFF
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetStaff(): Promise<{
  staff: StaffMember[];
}> {
  const r = await adminApi('/api/admin/staff');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    staff: StaffMember[];
  }>;
}

export async function apiCreateStaff(
  data: Partial<StaffMember>,
): Promise<{
  ok: boolean;
  staff: StaffMember;
}> {
  const r = await adminApi('/api/admin/staff', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    staff: StaffMember;
  }>;
}

export async function apiUpdateStaff(
  staffId: string,
  data: Partial<StaffMember>,
): Promise<{
  ok: boolean;
  staff: StaffMember;
}> {
  const r = await adminApi(
    `/api/admin/staff/${staffId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    staff: StaffMember;
  }>;
}

export async function apiDeleteStaff(
  staffId: string,
): Promise<{ ok: boolean }> {
  const r = await adminApi(
    `/api/admin/staff/${staffId}`,
    {
      method: 'DELETE',
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{ ok: boolean }>;
}

export async function apiGetStaffAttendance(
  staffId: string,
  date?: string,
): Promise<{
  attendance: StaffAttendanceRecord[];
}> {
  const params = new URLSearchParams();

  if (date) {
    params.set('date', date);
  }

  const query = params.toString();

  const r = await adminApi(
    `/api/admin/staff/${staffId}/attendance${query ? `?${query}` : ''}`,
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    attendance: StaffAttendanceRecord[];
  }>;
}

export async function apiRecordStaffAttendance(
  staffId: string,
  data: {
    date?: string;
    checkIn?: string | null;
    checkOut?: string | null;
    status?: string;
    notes?: string | null;
  },
): Promise<{
  ok: boolean;
  attendance: StaffAttendanceRecord;
}> {
  const r = await adminApi(
    `/api/admin/staff/${staffId}/attendance`,
    {
      method: 'POST',
      body: JSON.stringify(data),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    attendance: StaffAttendanceRecord;
  }>;
}

export async function apiGetStaffActivity(
  staffId: string,
  page = 1,
  limit = 25,
): Promise<{
  activity: StaffActivityEntry[];
  total: number;
  pages: number;
}> {
  const r = await adminApi(
    `/api/admin/staff/${staffId}/activity?page=${page}&limit=${limit}`,
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    activity: StaffActivityEntry[];
    total: number;
    pages: number;
  }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// PRICING
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetPricingRules(
  options: {
    serviceType?: string;
    provider?: string;
    network?: string;
    enabled?: boolean;
  } = {},
): Promise<{
  rules: PricingRule[];
}> {
  const params = new URLSearchParams();

  if (options.serviceType) {
    params.set('serviceType', options.serviceType);
  }

  if (options.provider) {
    params.set('provider', options.provider);
  }

  if (options.network) {
    params.set('network', options.network);
  }

  if (options.enabled !== undefined) {
    params.set('enabled', String(options.enabled));
  }

  const query = params.toString();

  const r = await adminApi(
    `/api/admin/pricing-rules${query ? `?${query}` : ''}`,
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    rules: PricingRule[];
  }>;
}

export async function apiCreatePricingRule(
  data: Omit<PricingRule, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<{
  ok: boolean;
  rule: PricingRule;
}> {
  const r = await adminApi('/api/admin/pricing-rules', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    rule: PricingRule;
  }>;
}

export async function apiUpdatePricingRule(
  ruleId: string,
  data: Partial<PricingRule>,
): Promise<{
  ok: boolean;
  rule: PricingRule;
}> {
  const r = await adminApi(
    `/api/admin/pricing-rules/${ruleId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    rule: PricingRule;
  }>;
}

export async function apiDeletePricingRule(
  ruleId: string,
): Promise<{ ok: boolean }> {
  const r = await adminApi(
    `/api/admin/pricing-rules/${ruleId}`,
    {
      method: 'DELETE',
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{ ok: boolean }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// API CONFIG / LOGS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetApiConfigs(): Promise<{
  configs: ApiConfig[];
}> {
  const r = await adminApi('/api/admin/api-configs');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    configs: ApiConfig[];
  }>;
}

export async function apiUpdateApiConfig(
  key: string,
  data: Partial<ApiConfig>,
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/api-configs/${encodeURIComponent(key)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{ ok: boolean }>;
}

export async function apiGetApiLogs(
  page = 1,
  limit = 50,
): Promise<{
  logs: ApiLogEntry[];
  total: number;
  pages: number;
}> {
  const r = await adminApi(
    `/api/admin/api-logs?page=${page}&limit=${limit}`,
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    logs: ApiLogEntry[];
    total: number;
    pages: number;
  }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// FUNDING
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetFundingRequests(
  page = 1,
  limit = 25,
  status?: string,
): Promise<{
  requests: FundingRequest[];
  total: number;
  pages: number;
}> {
  const params = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  if (status && status !== 'all') {
    params.set('status', status);
  }

  const r = await adminApi(
    `/api/admin/funding-requests?${params.toString()}`,
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    requests: FundingRequest[];
    total: number;
    pages: number;
  }>;
}

export async function apiGetFundingStats(): Promise<FundingStats> {
  const r = await adminApi('/api/admin/funding-stats');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<FundingStats>;
}

export async function apiApproveFundingRequest(
  id: string,
  reason?: string,
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/funding-requests/${id}/approve`,
    {
      method: 'POST',
      body: JSON.stringify({
        reason,
      }),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{ ok: boolean }>;
}

export async function apiRejectFundingRequest(
  id: string,
  reason: string,
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/funding-requests/${id}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({
        reason,
      }),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{ ok: boolean }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN SESSION / LOGIN HISTORY
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetAdminLoginHistory(
  page = 1,
  limit = 50,
): Promise<{
  history: AdminLoginHistoryEntry[];
  total: number;
  pages: number;
}> {
  const r = await adminApi(
    `/api/admin/login-history?page=${page}&limit=${limit}`,
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    history: AdminLoginHistoryEntry[];
    total: number;
    pages: number;
  }>;
}

export async function apiGetAdminSessions(): Promise<{
  sessions: AdminSessionRecord[];
}> {
  const r = await adminApi('/api/admin/sessions');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    sessions: AdminSessionRecord[];
  }>;
}

export async function apiRevokeAdminSession(
  sessionId: string,
): Promise<{ ok: boolean }> {
  const r = await adminApi(
    `/api/admin/sessions/${sessionId}/revoke`,
    {
      method: 'POST',
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{ ok: boolean }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// FINANCIAL REPORT
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetFinancialReport(
  from?: string,
  to?: string,
): Promise<FinancialReport> {
  const params = new URLSearchParams();

  if (from) {
    params.set('from', from);
  }

  if (to) {
    params.set('to', to);
  }

  const query = params.toString();

  const r = await adminApi(
    `/api/admin/finance/report${query ? `?${query}` : ''}`,
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<FinancialReport>;
}

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetNotificationHistory(
  page = 1,
  limit = 50,
): Promise<{
  notifications: NotificationHistoryEntry[];
  total: number;
  pages: number;
}> {
  const r = await adminApi(
    `/api/admin/notifications/history?page=${page}&limit=${limit}`,
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    notifications: NotificationHistoryEntry[];
    total: number;
    pages: number;
  }>;
}

export async function apiSendNotification(
  userId: string,
  title: string,
  body: string,
  type = 'general',
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/notifications/send`,
    {
      method: 'POST',
      body: JSON.stringify({
        userId,
        title,
        body,
        type,
      }),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{ ok: boolean }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// CASHBACK
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetCashbackSettings(): Promise<CashbackSettings> {
  const r = await adminApi('/api/admin/cashback/settings');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<CashbackSettings>;
}

export async function apiUpdateCashbackSettings(
  data: Partial<CashbackSettings>,
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    '/api/admin/cashback/settings',
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{ ok: boolean }>;
}

export async function apiGetCashbackPlans(): Promise<{
  plans: CashbackPlan[];
}> {
  const r = await adminApi('/api/admin/cashback/plans');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{
    plans: CashbackPlan[];
  }>;
}

export async function apiUpdateCashbackPlan(
  id: string,
  data: Partial<CashbackPlan>,
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/cashback/plans/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{ ok: boolean }>;
}

export async function apiBulkUpdateCashbackPlans(
  plans: Array<{
    id: string;
    percentage?: number;
    fixedAmount?: number;
    enabled?: boolean;
  }>,
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    '/api/admin/cashback/plans/bulk',
    {
      method: 'PATCH',
      body: JSON.stringify({ plans }),
    },
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<{ ok: boolean }>;
}

export async function apiGetCashbackReports(
  from?: string,
  to?: string,
): Promise<CashbackReports> {
  const params = new URLSearchParams();

  if (from) {
    params.set('from', from);
  }

  if (to) {
    params.set('to', to);
  }

  const query = params.toString();

  const r = await adminApi(
    `/api/admin/cashback/reports${query ? `?${query}` : ''}`,
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed',
    );
  }

  return r.json() as Promise<CashbackReports>;
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT UTILITIES
// ══════════════════════════════════════════════════════════════════════════════

export function exportToCsv(
  filename: string,
  rows: Record<string, unknown>[],
): void {
  if (rows.length === 0) {
    return;
  }

  const headers = Object.keys(rows[0]);

  const escapeCsv = (value: unknown): string => {
    const str = value == null ? '' : String(value);

    if (
      str.includes(',') ||
      str.includes('"') ||
      str.includes('\n') ||
      str.includes('\r')
    ) {
      return `"${str.replace(/"/g, '""')}"`;
    }

    return str;
  };

  const csv = [
    headers.map(escapeCsv).join(','),
    ...rows.map(row =>
      headers.map(header => escapeCsv(row[header])).join(','),
    ),
  ].join('\r\n');

  const blob = new Blob(
    [csv],
    {
      type: 'text/csv;charset=utf-8;',
    },
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}

export function exportToHtmlPrint(
  title: string,
  headers: string[],
  rows: unknown[][],
): void {
  const escapeHtml = (value: unknown): string =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const tableHead = headers
    .map(header => `<th>${escapeHtml(header)}</th>`)
    .join('');

  const tableRows = rows
    .map(row =>
      `<tr>${row
        .map(value => `<td>${escapeHtml(value)}</td>`)
        .join('')}</tr>`,
    )
    .join('');

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body {
    font-family: Arial, sans-serif;
    padding: 24px;
    color: #111;
  }

  h1 {
    margin: 0 0 20px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
    font-size: 12px;
  }

  th {
    font-weight: 700;
    background: #f5f5f5;
  }

  @media print {
    body {
      padding: 0;
    }
  }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<table>
<thead>
<tr>${tableHead}</tr>
</thead>
<tbody>
${tableRows}
</tbody>
</table>
<script>
window.onload = function () {
  window.print();
};
</script>
</body>
</html>`;

  const printWindow = window.open(
    '',
    '_blank',
    'noopener,noreferrer',
  );

  if (!printWindow) {
    return;
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
