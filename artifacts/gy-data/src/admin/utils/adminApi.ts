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
  id: string;
  name: string;
  email: string | null;
  phone: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string | null;
  lastLoginAt: string | null;
  walletId: string | null;
  walletBalance: number;
}

export interface WalletSummary {
  id: string;
  userId: string;
  balance: number;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface WalletLedgerEntry {
  id: string;
  walletId: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  reference: string | null;
  description: string | null;
  createdAt: string;
}

export interface UserTransaction {
  id: string;
  userId: string;
  type: string;
  service: string | null;
  network: string | null;
  phone: string | null;
  amount: number;
  status: string;
  reference: string | null;
  providerReference: string | null;
  description: string | null;
  createdAt: string;
}

export interface UserStatusHistoryEntry {
  id: string;
  userId: string;
  oldStatus: string | null;
  newStatus: string;
  reason: string | null;
  changedBy: string | null;
  createdAt: string;
}

export interface TransactionDetail {
  id: string;
  userId: string;
  userName?: string;
  userPhone?: string;
  type: string;
  service?: string | null;
  network?: string | null;
  phone?: string | null;
  amount: number;
  status: string;
  reference?: string | null;
  providerReference?: string | null;
  description?: string | null;
  metadata?: unknown;
  createdAt: string;
  updatedAt?: string | null;
}

export interface ReversalRecord {
  id: string;
  transactionId: string;
  reference: string | null;
  amount: number;
  reason: string | null;
  createdAt: string;
}

export interface ServiceSetting {
  key: string;
  value: unknown;
  enabled?: boolean;
  updatedAt?: string | null;
}

export interface FinancialReport {
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
  profitMargin: number;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  pendingTransactions: number;
  totalFunding: number;
  totalWithdrawals: number;
  period?: {
    from: string;
    to: string;
  };
  [key: string]: unknown;
}

export interface NotificationHistoryEntry {
  id: string;
  title: string;
  body: string;
  recipientType: string;
  recipientCount: number;
  sentBy: string | null;
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
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  createdAt: string;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  createdAt: string;
}

export interface StaffAttendanceRecord {
  id: string;
  staffId: string;
  date: string;
  status: string;
  checkIn: string | null;
  checkOut: string | null;
  notes: string | null;
}

export interface StaffActivityEntry {
  id: string;
  staffId: string;
  action: string;
  details: unknown;
  createdAt: string;
}

export interface PricingRule {
  id: string;
  serviceType: string;
  network: string | null;
  planId: string | null;
  planName: string | null;
  sellingPrice: number;
  costPrice: number;
  markupPercent: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ApiConfig {
  id: string;
  key: string;
  label: string;
  provider: string;
  enabled: boolean;
  baseUrl: string | null;
  maskedKey?: string | null;
  updatedAt?: string | null;
}

export interface ApiLogEntry {
  id: string;
  api: string;
  endpoint: string;
  method: string;
  statusCode: number | null;
  responseTime: number | null;
  error: string | null;
  reference: string | null;
  createdAt: string;
}

export interface FundingRequest {
  id: string;
  userId: string;
  userName: string | null;
  userPhone: string | null;
  amount: number;
  method: string | null;
  reference: string | null;
  status: string;
  reason: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface FundingStats {
  pending: number;
  approved: number;
  rejected: number;
  pendingAmount: number;
  approvedAmount: number;
  rejectedAmount: number;
}

export interface AdminLoginHistoryEntry {
  id: string;
  adminId: string;
  adminEmail: string;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  createdAt: string;
}

export interface AdminSessionRecord {
  id: string;
  adminId: string;
  adminEmail: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastActiveAt: string | null;
  expiresAt: string | null;
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
  params?: {
    page?: number;
    limit?: number;
  }
): Promise<{
  ledger: WalletLedgerEntry[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: String(params?.limit ?? 25)
  });

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  const r = await adminApi(
    `/api/admin/users/${userId}/wallet/ledger?${qs}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ledger: WalletLedgerEntry[];
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
    balanceBefore: Number(
      data.balanceBefore ?? (data.balance ?? 0) - amount
    ),
    balanceAfter: Number(
      data.balanceAfter ?? data.balance ?? 0
    ),
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

export async function apiGetUserTransactions(
  userId: string,
  params?: {
    status?: string;
    page?: number;
  }
): Promise<{
  transactions: UserTransaction[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({ limit: '25' });

  if (params?.status && params.status !== 'all') {
    qs.set('status', params.status);
  }

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  const r = await adminApi(
    `/api/admin/users/${userId}/transactions?${qs}`
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

export async function apiChangeUserStatus(
  userId: string,
  status: string,
  reason: string
): Promise<void> {
  const r = await adminApi(
    `/api/admin/users/${userId}`,
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
}

export async function apiResetLoginPin(
  userId: string
): Promise<{
  tempPin: string;
  message: string;
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/reset-login-pin`,
    { method: 'POST' }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    tempPin: string;
    message: string;
  }>;
}

export async function apiResetPurchasePin(
  userId: string
): Promise<{
  tempPin: string;
  message: string;
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/reset-purchase-pin`,
    { method: 'POST' }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    tempPin: string;
    message: string;
  }>;
}

export async function apiGetTransactionDetail(
  txId: string
): Promise<TransactionDetail> {
  const r = await adminApi(
    `/api/admin/transactions/${txId}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<TransactionDetail>;
}

export async function apiMarkTransactionReview(
  txId: string,
  note?: string
): Promise<void> {
  const r = await adminApi(
    `/api/admin/transactions/${txId}/mark-review`,
    {
      method: 'POST',
      body: JSON.stringify({ note })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }
}

export async function apiReverseTransaction(
  txId: string,
  reason: string
): Promise<{
  reference: string;
  amount: number;
}> {
  const r = await adminApi(
    `/api/admin/finance/transactions/${txId}/reverse`,
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
    reference: string;
    amount: number;
  }>;
}

export async function apiGetReversals(
  params?: {
    search?: string;
    page?: number;
  }
): Promise<{
  reversals: ReversalRecord[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: '25'
  });

  if (params?.search) {
    qs.set('search', params.search);
  }

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  const r = await adminApi(
    `/api/admin/reversals?${qs}`
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

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE SETTINGS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetServiceSettings(): Promise<{
  settings: ServiceSetting[];
}> {
  const r = await adminApi('/api/admin/service-settings');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    settings: ServiceSetting[];
  }>;
}

export async function apiUpdateServiceSetting(
  key: string,
  value: unknown
): Promise<void> {
  const r = await adminApi(
    `/api/admin/service-settings/${encodeURIComponent(key)}`,
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
}

export async function apiBroadcastNotification(
  title: string,
  body: string
): Promise<{
  sent: number;
}> {
  const r = await adminApi(
    '/api/admin/notifications/broadcast',
    {
      method: 'POST',
      body: JSON.stringify({ title, body })
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

export async function apiSendTargetedNotification(
  userIds: string[],
  title: string,
  body: string
): Promise<{
  sent: number;
}> {
  const r = await adminApi(
    '/api/admin/notifications/targeted',
    {
      method: 'POST',
      body: JSON.stringify({
        userIds,
        title,
        body
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

export async function apiGetNotificationHistory(
  params?: {
    page?: number;
  }
): Promise<{
  history: NotificationHistoryEntry[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: '25'
  });

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  const r = await adminApi(
    `/api/admin/notifications/history?${qs}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    history: NotificationHistoryEntry[];
    total: number;
    pages: number;
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

  const suffix = qs.toString() ? `?${qs}` : '';

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

export async function apiGetSystemSettings(): Promise<{
  settings: Record<string, unknown>;
}> {
  const r = await adminApi('/api/admin/system-settings');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    settings: Record<string, unknown>;
  }>;
}

export async function apiUpdateSystemSetting(
  key: string,
  value: unknown
): Promise<void> {
  const r = await adminApi(
    `/api/admin/system-settings/${encodeURIComponent(key)}`,
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
}

export async function apiGetIntegrations(): Promise<{
  integrations: unknown[];
}> {
  const r = await adminApi('/api/admin/integrations');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    integrations: unknown[];
  }>;
}

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
    dailyRevenue?: DashboardExtended['dailyRevenue'];
    weeklyRevenue?: DashboardExtended['weeklyRevenue'];
    monthlyRevenue?: DashboardExtended['monthlyRevenue'];
    profitMargin?: number | string;
    totalCost?: number | string;
    netProfit?: number | string;
    activeUsersToday?: number | string;
    newUsersThisWeek?: number | string;
    recentActivity?: DashboardExtended['recentActivity'];
  };

  return {
    dailyRevenue: Array.isArray(data.dailyRevenue)
      ? data.dailyRevenue.map((x) => ({
          day: String(x.day),
          revenue: Number(x.revenue ?? 0),
          count: Number(x.count ?? 0)
        }))
      : [],
    weeklyRevenue: Array.isArray(data.weeklyRevenue)
      ? data.weeklyRevenue.map((x) => ({
          week: String(x.week),
          revenue: Number(x.revenue ?? 0),
          count: Number(x.count ?? 0)
        }))
      : [],
    monthlyRevenue: Array.isArray(data.monthlyRevenue)
      ? data.monthlyRevenue.map((x) => ({
          month: String(x.month),
          revenue: Number(x.revenue ?? 0),
          count: Number(x.count ?? 0)
        }))
      : [],
    profitMargin: Number(data.profitMargin ?? 0),
    totalCost: Number(data.totalCost ?? 0),
    netProfit: Number(data.netProfit ?? 0),
    activeUsersToday: Number(
      data.activeUsersToday ?? data.activeUsers ?? 0
    ),
    newUsersThisWeek: Number(data.newUsersThisWeek ?? 0),
    recentActivity: Array.isArray(data.recentActivity)
      ? data.recentActivity
      : []
  };
}

export async function apiGetUserLoginHistory(
  userId: string,
  params?: {
    page?: number;
  }
): Promise<{
  history: UserLoginHistoryEntry[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: '25'
  });

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  const r = await adminApi(
    `/api/admin/users/${userId}/login-history?${qs}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    history: UserLoginHistoryEntry[];
    total: number;
    pages: number;
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
    email: string;
    phone?: string;
    role: string;
  }
): Promise<StaffMember> {
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

  return r.json() as Promise<StaffMember>;
}

export async function apiUpdateStaff(
  id: string,
  data: Partial<StaffMember>
): Promise<StaffMember> {
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

  return r.json() as Promise<StaffMember>;
}

export async function apiDeleteStaff(
  id: string
): Promise<void> {
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
}

export async function apiGetStaffAttendance(
  staffId: string,
  params?: {
    from?: string;
    to?: string;
  }
): Promise<{
  attendance: StaffAttendanceRecord[];
}> {
  const qs = new URLSearchParams();

  if (params?.from) {
    qs.set('from', params.from);
  }

  if (params?.to) {
    qs.set('to', params.to);
  }

  const suffix = qs.toString() ? `?${qs}` : '';

  const r = await adminApi(
    `/api/admin/staff/${staffId}/attendance${suffix}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    attendance: StaffAttendanceRecord[];
  }>;
}

export async function apiMarkAttendance(
  staffId: string,
  data: {
    date: string;
    status: string;
    checkIn?: string;
    checkOut?: string;
    notes?: string;
  }
): Promise<void> {
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
}

export async function apiGetStaffActivityLogs(
  staffId: string
): Promise<{
  logs: StaffActivityEntry[];
}> {
  const r = await adminApi(
    `/api/admin/staff/${staffId}/activity`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as {
    logs?: StaffActivityEntry[];
    activity?: StaffActivityEntry[];
  };

  return {
    logs: data.logs ?? data.activity ?? []
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// PRICING
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetPricing(
  serviceType?: string
): Promise<{
  rules: PricingRule[];
}> {
  const qs = serviceType
    ? `?serviceType=${encodeURIComponent(serviceType)}`
    : '';

  const r = await adminApi(
    `/api/admin/pricing${qs}`
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

export async function apiUpdatePricingRule(
  id: string,
  data: {
    sellingPrice?: number;
    costPrice?: number;
    markupPercent?: number;
    enabled?: boolean;
    planName?: string;
  }
): Promise<PricingRule> {
  const r = await adminApi(
    `/api/admin/pricing/${id}`,
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

  return r.json() as Promise<PricingRule>;
}

export async function apiBulkUpdatePricing(
  rules: {
    id: string;
    sellingPrice?: number;
    costPrice?: number;
    markupPercent?: number;
    enabled?: boolean;
  }[]
): Promise<{
  updated: number;
}> {
  const r = await adminApi(
    '/api/admin/pricing/bulk',
    {
      method: 'PATCH',
      body: JSON.stringify({ rules })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    updated: number;
  }>;
}

export async function apiCreatePricingRule(
  data: Omit<
    PricingRule,
    'id' | 'updatedAt' | 'createdAt'
  >
): Promise<PricingRule> {
  const r = await adminApi(
    '/api/admin/pricing',
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

  return r.json() as Promise<PricingRule>;
}

export async function apiDeletePricingRule(
  id: string
): Promise<void> {
  const r = await adminApi(
    `/api/admin/pricing/${id}`,
    {
      method: 'DELETE'
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// API MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetApiConfigs(): Promise<{
  configs: ApiConfig[];
}> {
  const r = await adminApi(
    '/api/admin/api-management/configs'
  );

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
  id: string,
  data: {
    enabled?: boolean;
    baseUrl?: string;
    apiKey?: string;
  }
): Promise<ApiConfig> {
  const r = await adminApi(
    `/api/admin/api-management/configs/${id}`,
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

  return r.json() as Promise<ApiConfig>;
}

export async function apiCheckApiStatus(): Promise<{
  results: {
    key: string;
    label: string;
    status: string;
    latency: number | null;
    checkedAt: string;
  }[];
}> {
  const r = await adminApi(
    '/api/admin/api-management/status'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    results: {
      key: string;
      label: string;
      status: string;
      latency: number | null;
      checkedAt: string;
    }[];
  }>;
}

export async function apiGetApiErrorLogs(
  params?: {
    api?: string;
    page?: number;
  }
): Promise<{
  logs: ApiLogEntry[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: '50'
  });

  if (params?.api) {
    qs.set('api', params.api);
  }

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  const r = await adminApi(
    `/api/admin/api-management/logs/errors?${qs}`
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

export async function apiGetApiTransactionLogs(
  params?: {
    api?: string;
    page?: number;
  }
): Promise<{
  logs: ApiLogEntry[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: '50'
  });

  if (params?.api) {
    qs.set('api', params.api);
  }

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  const r = await adminApi(
    `/api/admin/api-management/logs/transactions?${qs}`
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

// ══════════════════════════════════════════════════════════════════════════════
// FUNDING
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetFundingRequests(
  params?: {
    status?: string;
    page?: number;
  }
): Promise<{
  requests: FundingRequest[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: '25'
  });

  if (params?.status && params.status !== 'all') {
    qs.set('status', params.status);
  }

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  const r = await adminApi(
    `/api/admin/finance/funding-requests?${qs}`
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
  const r = await adminApi(
    '/api/admin/finance/funding-stats'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<FundingStats>;
}

export async function apiApproveFunding(
  id: string
): Promise<{
  ok: boolean;
  balanceAfter: number;
}> {
  const r = await adminApi(
    `/api/admin/finance/funding-requests/${id}/approve`,
    {
      method: 'POST'
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as {
    ok: boolean;
    balanceAfter?: number;
    balance?: number;
  };

  return {
    ok: data.ok,
    balanceAfter: Number(data.balanceAfter ?? data.balance ?? 0)
  };
}

export async function apiRejectFunding(
  id: string,
  reason: string
): Promise<void> {
  const r = await adminApi(
    `/api/admin/finance/funding-requests/${id}/reject`,
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
}

export async function apiGetFundingHistory(
  params?: {
    page?: number;
  }
): Promise<{
  history: FundingRequest[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: '25',
    status: 'approved'
  });

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  const r = await adminApi(
    `/api/admin/finance/funding-history?${qs}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    history: FundingRequest[];
    total: number;
    pages: number;
  }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECURITY
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetAdminLoginHistory(
  params?: {
    page?: number;
  }
): Promise<{
  history: AdminLoginHistoryEntry[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: '25'
  });

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  const r = await adminApi(
    `/api/admin/security/login-history?${qs}`
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

export async function apiGetActiveSessions(): Promise<{
  sessions: AdminSessionRecord[];
}> {
  const r = await adminApi(
    '/api/admin/security/sessions'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    sessions: AdminSessionRecord[];
  }>;
}

export async function apiRevokeSession(
  id: string
): Promise<void> {
  const r = await adminApi(
    `/api/admin/security/sessions/${id}/revoke`,
    {
      method: 'POST'
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }
}

export async function apiGet2FAStatus(): Promise<{
  enabled: boolean;
  setupAt: string | null;
}> {
  const r = await adminApi(
    '/api/admin/security/2fa/status'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    enabled: boolean;
    setupAt: string | null;
  }>;
}

export async function apiSetup2FA(): Promise<{
  qrDataUrl: string;
  secret: string;
}> {
  const r = await adminApi(
    '/api/admin/security/2fa/setup',
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
    qrDataUrl: string;
    secret: string;
  }>;
}

export async function apiVerify2FA(
  token: string
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    '/api/admin/security/2fa/verify',
    {
      method: 'POST',
      body: JSON.stringify({ token })
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

export async function apiGetAuditLogs(
  params?: {
    page?: number;
    action?: string;
  }
): Promise<{
  logs: {
    id: string;
    adminEmail: string;
    action: string;
    targetLabel: string | null;
    details: unknown;
    createdAt: string;
  }[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: '50'
  });

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  if (params?.action) {
    qs.set('action', params.action);
  }

  const r = await adminApi(
    `/api/admin/security/audit-logs?${qs}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    logs: {
      id: string;
      adminEmail: string;
      action: string;
      targetLabel: string | null;
      details: unknown;
      createdAt: string;
    }[];
    total: number;
    pages: number;
  }>;
}

export async function apiSendStaffNotification(
  staffIds: string[],
  title: string,
  body: string
): Promise<{
  sent: number;
}> {
  const r = await adminApi(
    '/api/admin/notifications/staff',
    {
      method: 'POST',
      body: JSON.stringify({
        staffIds,
        title,
        body
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
  planId: string | null;
  planName: string | null;
  cashbackEnabled: boolean;
  cashbackType: 'percentage' | 'fixed' | null;
  cashbackValue: number;
  updatedAt: string | null;
}

export interface CashbackSettings {
  enabled: boolean;
}

export interface CashbackReports {
  totalCashback: number;
  totalTransactions: number;
  totalUsers: number;
  byNetwork: {
    network: string;
    cashback: number;
    transactions: number;
  }[];
  from?: string;
  to?: string;
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

  const escape = (value: unknown): string => {
    if (value === null || value === undefined) {
      return '';
    }

    const text = String(value);

    if (
      text.includes(',') ||
      text.includes('"') ||
      text.includes('\n') ||
      text.includes('\r')
    ) {
      return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
  };

  const csv = [
    headers.map(escape).join(','),
    ...data.map((row) =>
      headers.map((header) => escape(row[header])).join(',')
    )
  ].join('\r\n');

  const blob = new Blob(
    ['\ufeff', csv],
    { type: 'text/csv;charset=utf-8;' }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');

  a.href = url;
  a.download = filename.endsWith('.csv')
    ? filename
    : `${filename}.csv`;

  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

export function exportToHtmlPrint(
  title: string,
  columns: string[],
  rows: Record<string, unknown>[]
): void {
  const escapeHtml = (value: unknown): string =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const tableHead = columns
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join('');

  const tableRows = rows
    .map(
      (row) =>
        `<tr>${columns
          .map(
            (column) =>
              `<td>${escapeHtml(row[column])}</td>`
          )
          .join('')}</tr>`
    )
    .join('');

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
body {
  font-family: Arial, sans-serif;
  padding: 24px;
}
h1 {
  margin-bottom: 20px;
}
table {
  width: 100%;
  border-collapse: collapse;
}
th,
td {
  border: 1px solid #ccc;
  padding: 8px;
  text-align: left;
}
th {
  font-weight: 700;
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
    'noopener,noreferrer'
  );

  if (!printWindow) {
    throw new Error('Unable to open print window.');
  }

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
