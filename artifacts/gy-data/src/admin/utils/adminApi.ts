/**
 * adminApi.ts — typed API client for all admin + super-admin endpoints.
 */

const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, '');

export function adminApi(path: string, opts: RequestInit = {}): Promise<Response> {
  const url = `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
  return fetch(url, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...((opts.headers as Record<string, string>) ?? {}) },
    ...opts,
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// EXISTING TYPES (unchanged)
// ══════════════════════════════════════════════════════════════════════════════

export interface UserFullProfile {
  id: string; name: string; firstName: string; lastName: string;
  email: string; phone: string; accountNumber: string; bankName: string;
  referralCode: string; kycStatus: string; status: string;
  walletBalance: number; transactionCount: number; totalSpent: number;
  lastTransactionAt: string | null; createdAt: string; updatedAt: string;
}

export interface WalletSummary {
  walletId: string; balance: number; createdAt: string; updatedAt: string;
  totalCredited: number; totalDebited: number; totalReversed: number; ledgerCount: number;
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

// ══════════════════════════════════════════════════════════════════════════════
// NEW TYPES
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// EXISTING API FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetUserProfile(userId: string): Promise<UserFullProfile> {
  const r = await adminApi(`/api/admin/users/${userId}`);

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<UserFullProfile>;
}

export async function apiGetUserWallet(userId: string): Promise<WalletSummary> {
  const r = await adminApi(`/api/admin/users/${userId}/wallet`);

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<WalletSummary>;
}

export async function apiGetWalletLedger(
  userId: string,
  page = 1,
  limit = 25
): Promise<{
  entries: WalletLedgerEntry[];
  total: number;
  pages: number;
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/wallet/ledger?page=${page}&limit=${limit}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
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
  reason: string
): Promise<{
  ok: boolean;
  reference: string;
  balanceBefore: number;
  balanceAfter: number;
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/fund-wallet`,
    {
      method: 'POST',
      body: JSON.stringify({ amount, reason })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as {
    ok: boolean;
    reference: string;
    walletId?: string;
    balance?: number;
    balanceBefore?: number;
    balanceAfter?: number;
  };

  return {
    ok: data.ok,
    reference: data.reference,
    balanceBefore: Number(data.balanceBefore ?? (data.balance ?? 0) - amount),
    balanceAfter: Number(data.balanceAfter ?? data.balance ?? 0),
  };
}

export async function apiDebitWallet(
  userId: string,
  amount: number,
  reason: string
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
      body: JSON.stringify({ amount, reason })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
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
  userId: string
): Promise<{
  history: UserStatusHistoryEntry[];
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/status-history`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    history: UserStatusHistoryEntry[];
  }>;
}

export async function apiUpdateUserStatus(
  userId: string,
  status: string,
  reason?: string
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status, reason })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
  }>;
}

export async function apiGetUserTransactions(
  userId: string,
  page = 1,
  limit = 25
): Promise<{
  transactions: UserTransaction[];
  total: number;
  pages: number;
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/transactions?page=${page}&limit=${limit}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    transactions: UserTransaction[];
    total: number;
    pages: number;
  }>;
}

export async function apiGetTransaction(
  transactionId: string
): Promise<TransactionDetail> {
  const r = await adminApi(
    `/api/admin/transactions/${transactionId}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<TransactionDetail>;
}

export async function apiReverseTransaction(
  transactionId: string,
  reason: string
): Promise<{
  ok: boolean;
  reference: string;
}> {
  const r = await adminApi(
    `/api/admin/transactions/${transactionId}/reverse`,
    {
      method: 'POST',
      body: JSON.stringify({ reason })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    reference: string;
  }>;
}

export async function apiGetReversals(
  page = 1,
  limit = 25
): Promise<{
  reversals: ReversalRecord[];
  total: number;
  pages: number;
}> {
  const r = await adminApi(
    `/api/admin/reversals?page=${page}&limit=${limit}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    reversals: ReversalRecord[];
    total: number;
    pages: number;
  }>;
}

export async function apiGetServiceSettings(): Promise<{
  services: ServiceSetting[];
}> {
  const r = await adminApi('/api/admin/services');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    services: ServiceSetting[];
  }>;
}

export async function apiUpdateServiceSetting(
  serviceKey: string,
  data: {
    enabled?: boolean;
    markup?: number | null;
    notes?: string | null;
  }
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/services/${encodeURIComponent(serviceKey)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data)
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
  }>;
}

export async function apiGetSystemSettings(): Promise<{
  settings: Record<string, SystemSettingValue>;
}> {
  const r = await adminApi('/api/admin/settings');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    settings: Record<string, SystemSettingValue>;
  }>;
}

export async function apiUpdateSystemSetting(
  key: string,
  value: string
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/settings/${encodeURIComponent(key)}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ value })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
  }>;
}

export async function apiGetIntegrations(): Promise<{
  integrations: Integration[];
}> {
  const r = await adminApi('/api/admin/integrations');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    integrations: Integration[];
  }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW API FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetDashboardExtended(): Promise<DashboardExtended> {
  const r = await adminApi('/api/admin/dashboard');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as {
    users?: number | string;
    activeUsers?: number | string;
    walletBalance?: number | string;
    transactions?: number | string;
    pendingTransactions?: number | string;
    successfulTransactions?: number | string;
  };

  const users = Number(data.users ?? 0);
  const activeUsers = Number(data.activeUsers ?? 0);
  const transactions = Number(data.transactions ?? 0);
  const pendingTransactions = Number(data.pendingTransactions ?? 0);
  const successfulTransactions = Number(data.successfulTransactions ?? 0);

  return {
    dailyRevenue: [],
    weeklyRevenue: [],
    monthlyRevenue: [],
    profitMargin: 0,
    totalCost: 0,
    netProfit: 0,
    activeUsersToday: activeUsers,
    newUsersThisWeek: 0,
    recentActivity: [],
  };
}

export async function apiGetUserLoginHistory(
  userId: string
): Promise<{
  history: UserLoginHistoryEntry[];
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/login-history`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    history: UserLoginHistoryEntry[];
  }>;
}

export async function apiGetStaff(): Promise<{
  staff: StaffMember[];
}> {
  const r = await adminApi('/api/admin/staff');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    staff: StaffMember[];
  }>;
}

export async function apiCreateStaff(
  data: {
    name: string;
    email?: string;
    phone?: string;
    role?: string;
    rank?: string;
    salary?: number;
    salaryPaymentDay?: number;
    department?: string;
    permissions?: string[];
    notes?: string;
  }
): Promise<{
  ok: boolean;
  staff: StaffMember;
}> {
  const r = await adminApi(
    '/api/admin/staff',
    {
      method: 'POST',
      body: JSON.stringify(data)
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    staff: StaffMember;
  }>;
}

export async function apiUpdateStaff(
  id: string,
  data: Partial<{
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
  }>
): Promise<{
  ok: boolean;
  staff: StaffMember;
}> {
  const r = await adminApi(
    `/api/admin/staff/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data)
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    staff: StaffMember;
  }>;
}

export async function apiDeleteStaff(
  id: string
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/staff/${id}`,
    {
      method: 'DELETE'
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
  }>;
}

export async function apiGetStaffAttendance(
  staffId: string,
  from?: string,
  to?: string
): Promise<{
  records: StaffAttendanceRecord[];
}> {
  const qs = new URLSearchParams();

  if (from) {
    qs.set('from', from);
  }

  if (to) {
    qs.set('to', to);
  }

  const suffix = qs.toString()
    ? `?${qs.toString()}`
    : '';

  const r = await adminApi(
    `/api/admin/staff/${staffId}/attendance${suffix}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    records: StaffAttendanceRecord[];
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
  }
): Promise<{
  ok: boolean;
  record: StaffAttendanceRecord;
}> {
  const r = await adminApi(
    `/api/admin/staff/${staffId}/attendance`,
    {
      method: 'POST',
      body: JSON.stringify(data)
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    record: StaffAttendanceRecord;
  }>;
}

export async function apiGetStaffActivity(
  staffId: string,
  page = 1,
  limit = 50
): Promise<{
  activities: StaffActivityEntry[];
  total: number;
  pages: number;
}> {
  const r = await adminApi(
    `/api/admin/staff/${staffId}/activity?page=${page}&limit=${limit}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    activities: StaffActivityEntry[];
    total: number;
    pages: number;
  }>;
}

export async function apiGetPricingRules(
  serviceType?: string,
  provider?: string,
  network?: string
): Promise<{
  rules: PricingRule[];
}> {
  const qs = new URLSearchParams();

  if (serviceType) {
    qs.set('serviceType', serviceType);
  }

  if (provider) {
    qs.set('provider', provider);
  }

  if (network) {
    qs.set('network', network);
  }

  const suffix = qs.toString()
    ? `?${qs.toString()}`
    : '';

  const r = await adminApi(
    `/api/admin/pricing-rules${suffix}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    rules: PricingRule[];
  }>;
}

export async function apiCreatePricingRule(
  data: {
    serviceType: string;
    provider: string;
    network?: string | null;
    planId?: string | null;
    planName?: string | null;
    costPrice: number;
    sellingPrice: number;
    markupPercent?: number;
    enabled?: boolean;
  }
): Promise<{
  ok: boolean;
  rule: PricingRule;
}> {
  const r = await adminApi(
    '/api/admin/pricing-rules',
    {
      method: 'POST',
      body: JSON.stringify(data)
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    rule: PricingRule;
  }>;
}

export async function apiUpdatePricingRule(
  id: string,
  data: Partial<{
    serviceType: string;
    provider: string;
    network: string | null;
    planId: string | null;
    planName: string | null;
    costPrice: number;
    sellingPrice: number;
    markupPercent: number;
    enabled: boolean;
  }>
): Promise<{
  ok: boolean;
  rule: PricingRule;
}> {
  const r = await adminApi(
    `/api/admin/pricing-rules/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data)
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    rule: PricingRule;
  }>;
}

export async function apiDeletePricingRule(
  id: string
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/pricing-rules/${id}`,
    {
      method: 'DELETE'
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
  }>;
}

export async function apiGetApiConfigs(): Promise<{
  configs: ApiConfig[];
}> {
  const r = await adminApi('/api/admin/api-configs');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    configs: ApiConfig[];
  }>;
}

export async function apiUpdateApiConfig(
  key: string,
  data: {
    enabled?: boolean;
    fields?: Record<string, string>;
  }
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/api-configs/${encodeURIComponent(key)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data)
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
  }>;
}

export async function apiGetApiLogs(
  page = 1,
  limit = 50,
  api?: string
): Promise<{
  logs: ApiLogEntry[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams();

  qs.set('page', String(page));
  qs.set('limit', String(limit));

  if (api) {
    qs.set('api', api);
  }

  const r = await adminApi(
    `/api/admin/api-logs?${qs.toString()}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    logs: ApiLogEntry[];
    total: number;
    pages: number;
  }>;
}

export async function apiGetFundingRequests(
  status?: string,
  page = 1,
  limit = 50
): Promise<{
  requests: FundingRequest[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams();

  qs.set('page', String(page));
  qs.set('limit', String(limit));

  if (status) {
    qs.set('status', status);
  }

  const r = await adminApi(
    `/api/admin/funding-requests?${qs.toString()}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    requests: FundingRequest[];
    total: number;
    pages: number;
  }>;
}

export async function apiGetFundingStats(): Promise<FundingStats> {
  const r = await adminApi('/api/admin/funding-requests/stats');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<FundingStats>;
}

export async function apiApproveFundingRequest(
  id: string
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/funding-requests/${id}/approve`,
    {
      method: 'POST'
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
  }>;
}

export async function apiRejectFundingRequest(
  id: string,
  reason: string
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/funding-requests/${id}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ reason })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
  }>;
}

export async function apiGetAdminLoginHistory(
  page = 1,
  limit = 50
): Promise<{
  history: AdminLoginHistoryEntry[];
  total: number;
  pages: number;
}> {
  const r = await adminApi(
    `/api/admin/admin-login-history?page=${page}&limit=${limit}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
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
  const r = await adminApi('/api/admin/admin-sessions');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    sessions: AdminSessionRecord[];
  }>;
}

export async function apiRevokeAdminSession(
  id: string
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/admin-sessions/${id}/revoke`,
    {
      method: 'POST'
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
  }>;
}

export async function apiGetFinancialReport(
  from?: string,
  to?: string
): Promise<FinancialReport> {
  const qs = new URLSearchParams();

  if (from) {
    qs.set('from', from);
  }

  if (to) {
    qs.set('to', to);
  }

  const suffix = qs.toString()
    ? `?${qs.toString()}`
    : '';

  const r = await adminApi(
    `/api/admin/financial-report${suffix}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<FinancialReport>;
}

export async function apiGetNotificationHistory(
  page = 1,
  limit = 50
): Promise<{
  notifications: NotificationHistoryEntry[];
  total: number;
  pages: number;
}> {
  const r = await adminApi(
    `/api/admin/notification-history?page=${page}&limit=${limit}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    notifications: NotificationHistoryEntry[];
    total: number;
    pages: number;
  }>;
}

export async function apiSendNotification(
  userIds: string[],
  title: string,
  body: string,
  type = 'admin'
): Promise<{
  sent: number;
}> {
  const r = await adminApi(
    '/api/admin/notifications/send',
    {
      method: 'POST',
      body: JSON.stringify({
        userIds,
        title,
        body,
        type
      })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    sent: number;
  }>;
}

// ── Cashback ──────────────────────────────────────────────────────────────────

export interface CashbackPlan {
  id: string;
  network: string | null;
  provider: string;
  plan_id: string | null;
  plan_name: string | null;
  selling_price: string;
  cashback_enabled: boolean;
  cashback_type: 'percentage' | 'fixed';
  cashback_value: string;
}

export interface CashbackSettings {
  enabled: boolean;
  updatedAt?: string;
}

export interface CashbackReports {
  period: {
    from: string;
    to: string;
  };

  totals: {
    total_count: string;
    total_amount: string;
    avg_amount: string;
    unique_users: string;
    unique_networks: string;
  };

  byDate: {
    day: string;
    count: string;
    total: string;
  }[];

  byNetwork: {
    network: string;
    count: string;
    total: string;
  }[];

  byPlan: {
    plan_name: string;
    network: string;
    count: string;
    total: string;
  }[];

  byUser: {
    user_id: string;
    user_name: string;
    user_phone: string;
    count: string;
    total: string;
  }[];
}

export async function apiGetCashbackSettings(): Promise<CashbackSettings> {
  const r = await adminApi(
    '/api/admin/cashback/settings'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<CashbackSettings>;
}

export async function apiUpdateCashbackSettings(
  enabled: boolean
): Promise<{
  ok: boolean;
  enabled: boolean;
}> {
  const r = await adminApi(
    '/api/admin/cashback/settings',
    {
      method: 'PATCH',
      body: JSON.stringify({ enabled })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    enabled: boolean;
  }>;
}

export async function apiGetCashbackPlans(
  network?: string
): Promise<{
  plans: CashbackPlan[];
}> {
  const qs = network
    ? `?network=${encodeURIComponent(network)}`
    : '';

  const r = await adminApi(
    `/api/admin/cashback/plans${qs}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    plans: CashbackPlan[];
  }>;
}

export async function apiUpdateCashbackPlan(
  id: string,
  data: {
    cashbackEnabled?: boolean;
    cashbackType?: 'percentage' | 'fixed';
    cashbackValue?: number;
  }
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/cashback/plans/${id}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data)
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
  }>;
}

export async function apiBulkUpdateCashbackPlans(
  network: string,
  data: {
    cashbackEnabled?: boolean;
    cashbackType?: 'percentage' | 'fixed';
    cashbackValue?: number;
  }
): Promise<{
  ok: boolean;
  updated: number;
}> {
  const r = await adminApi(
    '/api/admin/cashback/plans/bulk',
    {
      method: 'POST',
      body: JSON.stringify({
        network,
        ...data
      })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    updated: number;
  }>;
}

export async function apiGetCashbackReports(
  from?: string,
  to?: string
): Promise<CashbackReports> {
  const qs = new URLSearchParams();

  if (from) {
    qs.set('from', from);
  }

  if (to) {
    qs.set('to', to);
  }

  const r = await adminApi(
    `/api/admin/cashback/reports?${qs}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<CashbackReports>;
}

// ── Client-side Export Utilities ─────────────────────────────────────────────

export function exportToCsv(
  data: Record<string, unknown>[],
  filename: string
): void {
  if (!data.length) {
    return;
  }

  const headers = Object.keys(data[0]);

  const rows = data.map(row =>
    headers.map(h => {
      const v = row[h];
      const s = v == null ? '' : String(v);

      return s.includes(',') ||
        s.includes('"') ||
        s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    }).join(',')
  );

  const csv = [
    headers.join(','),
    ...rows
  ].join('\n');

  const blob = new Blob(
    ['\ufeff' + csv],
    {
      type: 'text/csv;charset=utf-8;'
    }
  );

  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();

  URL.revokeObjectURL(url);
}

export function exportToHtmlPrint(
  title: string,
  data: Record<string, unknown>[],
  filename: string
): void {
  if (!data.length) {
    return;
  }

  const headers = Object.keys(data[0]);

  const rows = data
    .map(
      row =>
        `<tr>${headers
          .map(h => `<td>${row[h] ?? ''}</td>`)
          .join('')}</tr>`
    )
    .join('');

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${title}</title>

<style>
body{
  font-family:sans-serif;
  font-size:12px;
  padding:20px
}

table{
  width:100%;
  border-collapse:collapse;
  margin-top:12px
}

th,td{
  border:1px solid #ddd;
  padding:6px 10px;
  text-align:left
}

th{
  background:#0f2d52;
  color:#fff
}

tr:nth-child(even){
  background:#f8fafc
}

h2{
  color:#0f2d52;
  margin:0
}

p{
  color:#666;
  font-size:11px;
  margin:4px 0 12px
}

.btn{
  background:#0f2d52;
  color:#fff;
  border:none;
  padding:8px 16px;
  border-radius:6px;
  cursor:pointer;
  margin-bottom:12px
}

@media print{
  .btn{
    display:none
  }
}
</style>

</head>

<body>

<h2>${title}</h2>

<p>
Generated:
${new Date().toLocaleString('en-NG')}
</p>

<button
  class="btn"
  onclick="window.print()"
>
Print / Save as PDF
</button>

<table>
<thead>
<tr>
${headers.map(h => `<th>${h}</th>`).join('')}
</tr>
</thead>

<tbody>
${rows}
</tbody>

</table>

</body>
</html>`;

  const blob = new Blob(
    [html],
    {
      type: 'text/html'
    }
  );

  const url = URL.createObjectURL(blob);

  const win = window.open(
    url,
    '_blank'
  );

  if (!win) {
    const a = document.createElement('a');

    a.href = url;
    a.download = filename;
    a.click();
  }

  setTimeout(
    () => URL.revokeObjectURL(url),
    15000
  );
}
