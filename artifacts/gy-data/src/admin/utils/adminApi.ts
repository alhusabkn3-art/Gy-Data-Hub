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
  price: number;
  costPrice: number | null;
  profit: number | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface ApiConfig {
  id: string;
  provider: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
  priority: number;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string | null;
}

export interface ApiLogEntry {
  id: string;
  provider: string;
  endpoint: string;
  method: string;
  statusCode: number | null;
  success: boolean;
  requestId: string | null;
  error: string | null;
  responseTime: number | null;
  createdAt: string;
}

export interface FundingRequest {
  id: string;
  userId: string;
  userName: string | null;
  userPhone: string | null;
  amount: number;
  reference: string | null;
  status: string;
  proofUrl: string | null;
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface FundingStats {
  totalRequests: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  totalApprovedAmount: number;
  totalPendingAmount: number;
  totalRejectedAmount: number;
}

export interface AdminLoginHistoryEntry {
  id: string;
  adminId: string;
  adminEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  success: boolean;
  createdAt: string;
}

export interface AdminSessionRecord {
  id: string;
  adminId: string;
  adminEmail: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  expiresAt: string | null;
  revoked: boolean;
}

// ══════════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT
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

/**
 * The backend returns:
 *
 * {
 *   pin: "123456",
 *   permanent: true,
 *   message: "Login PIN reset successfully. The new PIN is permanent."
 * }
 *
 * Existing AdminUsers.tsx expects `tempPin`, so the client normalizes
 * the backend's `pin` into `tempPin` while also exposing the real
 * `pin` and `permanent` fields.
 */
export async function apiResetLoginPin(
  userId: string
): Promise<{
  tempPin: string;
  message: string;
  pin: string;
  permanent: boolean;
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/reset-login-pin`,
    { method: 'POST' }
  );

  const data = await r.json() as {
    pin?: string;
    tempPin?: string;
    permanent?: boolean;
    message?: string;
    error?: string;
  };

  if (!r.ok) {
    throw new Error(
      data.error ?? 'Failed'
    );
  }

  const pin = data.pin ?? data.tempPin ?? '';

  if (!/^\d{6}$/.test(pin)) {
    throw new Error(
      'PIN reset succeeded but the server did not return a valid new PIN.'
    );
  }

  return {
    tempPin: pin,
    pin,
    permanent: data.permanent === true,
    message:
      data.message ??
      'Login PIN reset successfully. The new PIN is permanent.',
  };
}

/**
 * The backend returns:
 *
 * {
 *   pin: "123456",
 *   permanent: true,
 *   message: "Purchase PIN reset successfully. The new PIN is permanent."
 * }
 *
 * Existing AdminUsers.tsx expects `tempPin`, so the client normalizes
 * the backend's `pin` into `tempPin` while also exposing the real
 * `pin` and `permanent` fields.
 */
export async function apiResetPurchasePin(
  userId: string
): Promise<{
  tempPin: string;
  message: string;
  pin: string;
  permanent: boolean;
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/reset-purchase-pin`,
    { method: 'POST' }
  );

  const data = await r.json() as {
    pin?: string;
    tempPin?: string;
    permanent?: boolean;
    message?: string;
    error?: string;
  };

  if (!r.ok) {
    throw new Error(
      data.error ?? 'Failed'
    );
  }

  const pin = data.pin ?? data.tempPin ?? '';

  if (!/^\d{6}$/.test(pin)) {
    throw new Error(
      'PIN reset succeeded but the server did not return a valid new PIN.'
    );
  }

  return {
    tempPin: pin,
    pin,
    permanent: data.permanent === true,
    message:
      data.message ??
      'Purchase PIN reset successfully. The new PIN is permanent.',
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// TRANSACTION MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetTransactionDetail(
  txId: string
): Promise<TransactionDetail> {
  const r = await adminApi(`/api/admin/transactions/${txId}`);

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
  ok: boolean;
  reversal: ReversalRecord;
}> {
  const r = await adminApi(
    `/api/admin/transactions/${txId}/reverse`,
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
    reversal: ReversalRecord;
  }>;
}

export async function apiGetReversals(
  txId: string
): Promise<ReversalRecord[]> {
  const r = await adminApi(
    `/api/admin/transactions/${txId}/reversals`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as
    | ReversalRecord[]
    | { reversals: ReversalRecord[] };

  return Array.isArray(data)
    ? data
    : data.reversals ?? [];
}

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE SETTINGS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetServiceSettings(): Promise<{
  settings: ServiceSetting[];
}> {
  const r = await adminApi('/api/admin/settings/services');

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
): Promise<ServiceSetting> {
  const r = await adminApi(
    `/api/admin/settings/services/${encodeURIComponent(key)}`,
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

  return r.json() as Promise<ServiceSetting>;
}

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiBroadcastNotification(
  title: string,
  message: string
): Promise<{
  ok: boolean;
  sent: number;
}> {
  const r = await adminApi(
    '/api/admin/notifications/broadcast',
    {
      method: 'POST',
      body: JSON.stringify({ title, message })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    ok: boolean;
    sent: number;
  }>;
}

export async function apiSendTargetedNotification(
  userIds: string[],
  title: string,
  message: string
): Promise<{
  ok: boolean;
  sent: number;
}> {
  const r = await adminApi(
    '/api/admin/notifications/targeted',
    {
      method: 'POST',
      body: JSON.stringify({
        userIds,
        title,
        message
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
    sent: number;
  }>;
}

export async function apiGetNotificationHistory(
  params?: {
    page?: number;
    limit?: number;
  }
): Promise<{
  history: NotificationHistoryEntry[];
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

// ══════════════════════════════════════════════════════════════════════════════
// FINANCIAL REPORTING
// ══════════════════════════════════════════════════════════════════════════════

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

  const query = qs.toString();

  const r = await adminApi(
    `/api/admin/financial-report${query ? `?${query}` : ''}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<FinancialReport>;
}

export async function apiGetSystemSettings(): Promise<{
  settings: ServiceSetting[];
}> {
  const r = await adminApi('/api/admin/settings');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    settings: ServiceSetting[];
  }>;
}

export async function apiUpdateSystemSetting(
  key: string,
  value: unknown
): Promise<ServiceSetting> {
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

  return r.json() as Promise<ServiceSetting>;
}

// ══════════════════════════════════════════════════════════════════════════════
// INTEGRATIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetIntegrations(): Promise<{
  integrations: ApiConfig[];
}> {
  const r = await adminApi('/api/admin/integrations');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    integrations: ApiConfig[];
  }>;
}

export async function apiGetDashboardExtended(): Promise<DashboardExtended> {
  const r = await adminApi('/api/admin/dashboard/extended');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as
    | DashboardExtended
    | { dashboard: DashboardExtended };

  if (
    typeof data === 'object' &&
    data !== null &&
    'dashboard' in data
  ) {
    return data.dashboard;
  }

  return data as DashboardExtended;
}

// ══════════════════════════════════════════════════════════════════════════════
// USER LOGIN HISTORY
// ══════════════════════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════════════════════
// STAFF MANAGEMENT
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
    role?: string;
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
  staffId: string,
  data: Partial<StaffMember>
): Promise<StaffMember> {
  const r = await adminApi(
    `/api/admin/staff/${staffId}`,
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
  staffId: string
): Promise<void> {
  const r = await adminApi(
    `/api/admin/staff/${staffId}`,
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
  from?: string,
  to?: string
): Promise<StaffAttendanceRecord[]> {
  const qs = new URLSearchParams();

  if (from) {
    qs.set('from', from);
  }

  if (to) {
    qs.set('to', to);
  }

  const query = qs.toString();

  const r = await adminApi(
    `/api/admin/staff/${staffId}/attendance${query ? `?${query}` : ''}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as
    | StaffAttendanceRecord[]
    | { attendance: StaffAttendanceRecord[] };

  return Array.isArray(data)
    ? data
    : data.attendance ?? [];
}

export async function apiMarkAttendance(
  staffId: string,
  date: string,
  status: string,
  notes?: string
): Promise<StaffAttendanceRecord> {
  const r = await adminApi(
    `/api/admin/staff/${staffId}/attendance`,
    {
      method: 'POST',
      body: JSON.stringify({
        date,
        status,
        notes
      })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<StaffAttendanceRecord>;
}

export async function apiGetStaffActivityLogs(
  staffId: string
): Promise<StaffActivityEntry[]> {
  const r = await adminApi(
    `/api/admin/staff/${staffId}/activity`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as
    | StaffActivityEntry[]
    | { activity: StaffActivityEntry[] };

  return Array.isArray(data)
    ? data
    : data.activity ?? [];
}

// ══════════════════════════════════════════════════════════════════════════════
// PRICING
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetPricing(): Promise<{
  rules: PricingRule[];
}> {
  const r = await adminApi('/api/admin/pricing');

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
  ruleId: string,
  data: Partial<PricingRule>
): Promise<PricingRule> {
  const r = await adminApi(
    `/api/admin/pricing/${ruleId}`,
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
  updates: Array<{
    id: string;
    price?: number;
    costPrice?: number | null;
    enabled?: boolean;
  }>
): Promise<{
  ok: boolean;
  updated: number;
}> {
  const r = await adminApi(
    '/api/admin/pricing/bulk',
    {
      method: 'PATCH',
      body: JSON.stringify({ updates })
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

export async function apiCreatePricingRule(
  data: Omit<PricingRule, 'id' | 'createdAt' | 'updatedAt'>
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
  ruleId: string
): Promise<void> {
  const r = await adminApi(
    `/api/admin/pricing/${ruleId}`,
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
// API CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

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
  configId: string,
  data: Partial<ApiConfig>
): Promise<ApiConfig> {
  const r = await adminApi(
    `/api/admin/api-configs/${configId}`,
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
  providers: Array<{
    provider: string;
    status: string;
    latency?: number;
    error?: string;
  }>;
}> {
  const r = await adminApi('/api/admin/api-status');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    providers: Array<{
      provider: string;
      status: string;
      latency?: number;
      error?: string;
    }>;
  }>;
}

export async function apiGetApiErrorLogs(
  params?: {
    page?: number;
    limit?: number;
    provider?: string;
  }
): Promise<{
  logs: ApiLogEntry[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: String(params?.limit ?? 25)
  });

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  if (params?.provider) {
    qs.set('provider', params.provider);
  }

  const r = await adminApi(
    `/api/admin/api-logs/errors?${qs}`
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
    page?: number;
    limit?: number;
    provider?: string;
  }
): Promise<{
  logs: ApiLogEntry[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: String(params?.limit ?? 25)
  });

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  if (params?.provider) {
    qs.set('provider', params.provider);
  }

  const r = await adminApi(
    `/api/admin/api-logs/transactions?${qs}`
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
    limit?: number;
  }
): Promise<{
  requests: FundingRequest[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: String(params?.limit ?? 25)
  });

  if (params?.status && params.status !== 'all') {
    qs.set('status', params.status);
  }

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  const r = await adminApi(
    `/api/admin/funding/requests?${qs}`
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
  const r = await adminApi('/api/admin/funding/stats');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<FundingStats>;
}

export async function apiApproveFunding(
  requestId: string,
  note?: string
): Promise<FundingRequest> {
  const r = await adminApi(
    `/api/admin/funding/${requestId}/approve`,
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

  return r.json() as Promise<FundingRequest>;
}

export async function apiRejectFunding(
  requestId: string,
  reason: string
): Promise<FundingRequest> {
  const r = await adminApi(
    `/api/admin/funding/${requestId}/reject`,
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

  return r.json() as Promise<FundingRequest>;
}

export async function apiGetFundingHistory(
  params?: {
    page?: number;
    limit?: number;
  }
): Promise<{
  history: FundingRequest[];
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
    `/api/admin/funding/history?${qs}`
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
// ADMIN LOGIN / SESSIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetAdminLoginHistory(
  params?: {
    page?: number;
    limit?: number;
  }
): Promise<{
  history: AdminLoginHistoryEntry[];
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
    `/api/admin/login-history?${qs}`
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
  const r = await adminApi('/api/admin/sessions');

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
  sessionId: string
): Promise<void> {
  const r = await adminApi(
    `/api/admin/sessions/${sessionId}/revoke`,
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

// ══════════════════════════════════════════════════════════════════════════════
// TWO-FACTOR AUTHENTICATION
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGet2FAStatus(): Promise<{
  enabled: boolean;
}> {
  const r = await adminApi('/api/admin/2fa/status');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    enabled: boolean;
  }>;
}

export async function apiSetup2FA(): Promise<{
  secret: string;
  otpauthUrl: string;
}> {
  const r = await adminApi(
    '/api/admin/2fa/setup',
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
    secret: string;
    otpauthUrl: string;
  }>;
}

export async function apiVerify2FA(
  token: string
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    '/api/admin/2fa/verify',
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

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetAuditLogs(
  params?: {
    page?: number;
    limit?: number;
    action?: string;
    adminId?: string;
  }
): Promise<{
  logs: Array<{
    id: string;
    adminId: string | null;
    adminEmail: string | null;
    action: string;
    targetType: string | null;
    targetId: string | null;
    ipAddress: string | null;
    details: unknown;
    createdAt: string;
  }>;
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: String(params?.limit ?? 25)
  });

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  if (params?.action) {
    qs.set('action', params.action);
  }

  if (params?.adminId) {
    qs.set('adminId', params.adminId);
  }

  const r = await adminApi(
    `/api/admin/audit-logs?${qs}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    logs: Array<{
      id: string;
      adminId: string | null;
      adminEmail: string | null;
      action: string;
      targetType: string | null;
      targetId: string | null;
      ipAddress: string | null;
      details: unknown;
      createdAt: string;
    }>;
    total: number;
    pages: number;
  }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// STAFF NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiSendStaffNotification(
  staffId: string,
  title: string,
  message: string
): Promise<{
  ok: boolean;
}> {
  const r = await adminApi(
    `/api/admin/staff/${staffId}/notification`,
    {
      method: 'POST',
      body: JSON.stringify({
        title,
        message
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
  }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// CASHBACK
// ══════════════════════════════════════════════════════════════════════════════

export interface CashbackPlan {
  id: string;
  name: string;
  percentage: number;
  minAmount: number;
  maxAmount: number | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string | null;
}

export interface CashbackSettings {
  enabled: boolean;
  defaultPercentage: number;
  minTransactionAmount: number;
  maxCashbackPerTransaction: number;
}

export interface CashbackReports {
  totalCashback: number;
  totalTransactions: number;
  averageCashback: number;
  byPlan: Array<{
    planId: string;
    planName: string;
    totalCashback: number;
    transactions: number;
  }>;
}

export async function apiGetCashbackSettings(): Promise<CashbackSettings> {
  const r = await adminApi('/api/admin/cashback/settings');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<CashbackSettings>;
}

export async function apiUpdateCashbackSettings(
  data: Partial<CashbackSettings>
): Promise<CashbackSettings> {
  const r = await adminApi(
    '/api/admin/cashback/settings',
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

  return r.json() as Promise<CashbackSettings>;
}

export async function apiGetCashbackPlans(
  params?: {
    page?: number;
    limit?: number;
  }
): Promise<{
  plans: CashbackPlan[];
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
    `/api/admin/cashback/plans?${qs}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    plans: CashbackPlan[];
    total: number;
    pages: number;
  }>;
}

export async function apiUpdateCashbackPlan(
  planId: string,
  data: Partial<CashbackPlan>
): Promise<CashbackPlan> {
  const r = await adminApi(
    `/api/admin/cashback/plans/${planId}`,
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

  return r.json() as Promise<CashbackPlan>;
}

export async function apiBulkUpdateCashbackPlans(
  updates: Array<{
    id: string;
    percentage?: number;
    enabled?: boolean;
  }>
): Promise<{
  ok: boolean;
  updated: number;
}> {
  const r = await adminApi(
    '/api/admin/cashback/plans/bulk',
    {
      method: 'PATCH',
      body: JSON.stringify({ updates })
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

  const query = qs.toString();

  const r = await adminApi(
    `/api/admin/cashback/reports${query ? `?${query}` : ''}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<CashbackReports>;
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT HELPERS
// ══════════════════════════════════════════════════════════════════════════════

export function exportToCsv(
  filename: string,
  rows: Record<string, unknown>[]
): void {
  if (!rows.length) {
    return;
  }

  const columns = Object.keys(rows[0]);

  const escape = (value: unknown): string => {
    const text = String(value ?? '');

    if (
      text.includes(',') ||
      text.includes('"') ||
      text.includes('\n')
    ) {
      return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
  };

  const csv = [
    columns.map(escape).join(','),
    ...rows.map(
      row =>
        columns
          .map(column => escape(row[column]))
          .join(',')
    )
  ].join('\n');

  const blob = new Blob(
    [csv],
    { type: 'text/csv;charset=utf-8;' }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

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

  const head = columns
    .map(column => `<th>${escapeHtml(column)}</th>`)
    .join('');

  const body = rows
    .map(
      row =>
        `<tr>${columns
          .map(column => `<td>${escapeHtml(row[column])}</td>`)
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
<tr>${head}</tr>
</thead>
<tbody>
${body}
</tbody>
</table>
<script>
window.onload = function () {
  window.print();
};
</script>
</body>
</html>`;

  const win = window.open(
    '',
    '_blank',
    'noopener,noreferrer'
  );

  if (!win) {
    throw new Error('Unable to open print window.');
  }

  win.document.open();
  win.document.write(html);
  win.document.close();
}
