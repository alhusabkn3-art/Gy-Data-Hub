/**
 * adminApi.ts
 * Typed API client for Admin + Super Admin.
 *
 * IMPORTANT:
 * All endpoints in this file must match the API routes mounted
 * by artifacts/api-server/src/routes/index.ts.
 */

const BASE = (import.meta.env.BASE_URL as string).replace(/\/$/, '');

function buildUrl(path: string): string {
  return `${BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

async function readError(response: Response): Promise<string> {
  try {
    const data = await response.json() as {
      error?: string;
      message?: string;
    };

    return data.error || data.message || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

export function adminApi(
  path: string,
  opts: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(opts.headers);

  if (!headers.has('Content-Type') && opts.body) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(buildUrl(path), {
    ...opts,
    credentials: 'include',
    headers,
  });
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await adminApi(path, options);

  if (!response.ok) {
    throw new Error(await readError(response));
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

function jsonBody(data: unknown): RequestInit {
  return {
    method: 'POST',
    body: JSON.stringify(data),
  };
}

/* -------------------------------------------------------------------------- */
/* Types                                                                      */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

export async function apiGetUserProfile(
  userId: string
): Promise<UserFullProfile> {
  const data = await request<
    UserFullProfile | { user: UserFullProfile }
  >(`/api/admin/users/${encodeURIComponent(userId)}`);

  return 'user' in data ? data.user : data;
}

export async function apiGetUserWallet(
  userId: string
): Promise<WalletSummary> {
  return request<WalletSummary>(
    `/api/admin/users/${encodeURIComponent(userId)}/wallet`
  );
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
  const qs = new URLSearchParams({
    page: String(page),
    limit: String(limit),
  });

  const data = await request<{
    rows?: WalletLedgerEntry[];
    entries?: WalletLedgerEntry[];
    total: number;
    totalPages?: number;
    pages?: number;
  }>(
    `/api/admin/users/${encodeURIComponent(userId)}/wallet/ledger?${qs}`
  );

  return {
    entries: data.rows ?? data.entries ?? [],
    total: Number(data.total ?? 0),
    pages: Number(data.totalPages ?? data.pages ?? 1),
  };
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
  return request(
    `/api/admin/users/${encodeURIComponent(userId)}/wallet/credit`,
    jsonBody({ amount, reason })
  );
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
  return request(
    `/api/admin/users/${encodeURIComponent(userId)}/wallet/debit`,
    jsonBody({ amount, reason })
  );
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
  const qs = new URLSearchParams({
    limit: '25',
  });

  if (params?.status && params.status !== 'all') {
    qs.set('status', params.status);
  }

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  return request(
    `/api/admin/users/${encodeURIComponent(userId)}/transactions?${qs}`
  );
}

/**
 * This route does not currently exist in the backend.
 *
 * Kept as a safe compatibility function so callers receive a clear
 * error instead of silently calling a nonexistent endpoint.
 */
export async function apiGetUserStatusHistory(
  _userId: string
): Promise<{ history: UserStatusHistoryEntry[] }> {
  throw new Error(
    'User status history API is not implemented by the backend yet.'
  );
}

/**
 * Backend route: PATCH /api/admin/users/:id/status
 */
export async function apiChangeUserStatus(
  userId: string,
  status: string,
  reason: string
): Promise<void> {
  await request(
    `/api/admin/users/${encodeURIComponent(userId)}/status`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status, reason }),
    }
  );
}

/**
 * Backend currently exposes reset-pin, not reset-login-pin.
 */
export async function apiResetLoginPin(
  userId: string
): Promise<{
  tempPin: string;
  message: string;
}> {
  return request(
    `/api/admin/users/${encodeURIComponent(userId)}/reset-pin`,
    jsonBody({})
  );
}

/**
 * Backend reset-pin currently resets the purchase PIN hash.
 */
export async function apiResetPurchasePin(
  userId: string
): Promise<{
  tempPin: string;
  message: string;
}> {
  return request(
    `/api/admin/users/${encodeURIComponent(userId)}/reset-pin`,
    jsonBody({})
  );
}

/* -------------------------------------------------------------------------- */
/* Transactions                                                               */
/* -------------------------------------------------------------------------- */

export async function apiGetTransactionDetail(
  txId: string
): Promise<TransactionDetail> {
  return request(
    `/api/admin/transactions/${encodeURIComponent(txId)}`
  );
}

export async function apiMarkTransactionReview(
  _txId: string,
  _note?: string
): Promise<void> {
  throw new Error(
    'Transaction review API is not implemented by the backend yet.'
  );
}

export async function apiReverseTransaction(
  txId: string,
  reason: string
): Promise<{
  reference: string;
  amount: number;
}> {
  return request(
    `/api/admin/transactions/${encodeURIComponent(txId)}/reverse`,
    jsonBody({ reason })
  );
}

export async function apiGetReversals(
  _params?: {
    search?: string;
    page?: number;
  }
): Promise<{
  reversals: ReversalRecord[];
  total: number;
  pages: number;
}> {
  throw new Error(
    'Reversals listing API is not implemented by the backend yet.'
  );
}

/* -------------------------------------------------------------------------- */
/* Services                                                                   */
/* -------------------------------------------------------------------------- */

export async function apiGetServiceSettings(): Promise<{
  services: ServiceSetting[];
}> {
  const data = await request<
    { services: ServiceSetting[] } | ServiceSetting[]
  >('/api/admin/services');

  return Array.isArray(data)
    ? { services: data }
    : { services: data.services ?? [] };
}

export async function apiUpdateServiceSetting(
  key: string,
  updates: {
    enabled?: boolean;
    markup?: number | null;
    notes?: string;
  }
): Promise<void> {
  await request(
    `/api/admin/services/${encodeURIComponent(key)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Notifications                                                              */
/* -------------------------------------------------------------------------- */

export async function apiBroadcastNotification(
  _title: string,
  _body: string
): Promise<{ sent: number }> {
  throw new Error(
    'Broadcast notification API is not implemented by the backend yet.'
  );
}

export async function apiSendTargetedNotification(
  _userIds: string[],
  _title: string,
  _body: string
): Promise<{ sent: number }> {
  throw new Error(
    'Targeted notification API is not implemented by the backend yet.'
  );
}

export async function apiGetNotificationHistory(
  _page = 1
): Promise<{
  notifications: NotificationHistoryEntry[];
  total: number;
  pages: number;
}> {
  throw new Error(
    'Admin notification history API is not implemented by the backend yet.'
  );
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export async function apiGetDashboardExtended(): Promise<DashboardExtended> {
  const data = await request<Record<string, unknown>>(
    '/api/admin/dashboard/extended'
  );

  const profit =
    (data.profit ?? {}) as Record<string, unknown>;

  const weekly =
    (data.weekly ?? {}) as Record<string, unknown>;

  const monthly =
    (data.monthly ?? {}) as Record<string, unknown>;

  const daily = Array.isArray(data.daily)
    ? data.daily as Record<string, unknown>[]
    : [];

  const activity = Array.isArray(data.activity)
    ? data.activity as Record<string, unknown>[]
    : [];

  const totalRevenue = Number(profit.totalRevenue ?? 0);
  const totalCost = Number(profit.totalCost ?? 0);
  const netProfit = Number(
    profit.netProfit ?? totalRevenue - totalCost
  );

  return {
    dailyRevenue: daily.map(item => ({
      day: String(item.day ?? ''),
      revenue: Number(item.revenue ?? 0),
      count: Number(item.count ?? 0),
    })),

    weeklyRevenue:
      weekly.week != null
        ? [{
            week: String(weekly.week),
            revenue: Number(weekly.revenue ?? 0),
            count: Number(weekly.count ?? 0),
          }]
        : [],

    monthlyRevenue:
      monthly.month != null
        ? [{
            month: String(monthly.month),
            revenue: Number(monthly.revenue ?? 0),
            count: Number(monthly.count ?? 0),
          }]
        : [],

    profitMargin: Number(
      profit.profitMargin ??
        (totalRevenue > 0
          ? (netProfit / totalRevenue) * 100
          : 0)
    ),

    totalCost,
    netProfit,

    activeUsersToday: Number(data.activeToday ?? 0),
    newUsersThisWeek: Number(data.newUsersThisWeek ?? 0),

    recentActivity: activity.map(item => ({
      id: String(item.id ?? ''),
      action: String(item.action ?? ''),
      adminEmail: String(item.adminEmail ?? ''),
      targetLabel:
        item.targetLabel == null
          ? null
          : String(item.targetLabel),
      createdAt: String(item.createdAt ?? ''),
    })),
  };
}

/* -------------------------------------------------------------------------- */
/* System settings                                                            */
/* -------------------------------------------------------------------------- */

export async function apiGetSystemSettings(): Promise<{
  settings: Record<string, SystemSettingValue>;
}> {
  return request('/api/admin/settings');
}

export async function apiUpdateSystemSetting(
  key: string,
  value: string
): Promise<void> {
  await request(
    '/api/admin/settings',
    {
      method: 'PATCH',
      body: JSON.stringify({ key, value }),
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Integrations                                                               */
/* -------------------------------------------------------------------------- */

export async function apiGetIntegrations(): Promise<{
  integrations: Integration[];
}> {
  return request('/api/admin/integrations');
}

/* -------------------------------------------------------------------------- */
/* Pricing                                                                    */
/* -------------------------------------------------------------------------- */

export async function apiGetPricing(
  serviceType?: string
): Promise<{ rules: PricingRule[] }> {
  const qs = new URLSearchParams();

  if (serviceType) {
    qs.set('serviceType', serviceType);
  }

  const suffix = qs.toString()
    ? `?${qs}`
    : '';

  return request(`/api/admin/pricing${suffix}`);
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
  return request(
    `/api/admin/pricing/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    }
  );
}

export async function apiBulkUpdatePricing(
  rules: {
    id: string;
    sellingPrice?: number;
    costPrice?: number;
    markupPercent?: number;
    enabled?: boolean;
  }[]
): Promise<{ updated: number }> {
  return request(
    '/api/admin/pricing/bulk',
    {
      method: 'PATCH',
      body: JSON.stringify({ rules }),
    }
  );
}

export async function apiCreatePricingRule(
  data: Omit<PricingRule, 'id' | 'updatedAt' | 'createdAt'>
): Promise<PricingRule> {
  return request(
    '/api/admin/pricing',
    {
      method: 'POST',
      body: JSON.stringify(data),
    }
  );
}

export async function apiDeletePricingRule(
  id: string
): Promise<void> {
  await request(
    `/api/admin/pricing/${encodeURIComponent(id)}`,
    {
      method: 'DELETE',
    }
  );
}

/* -------------------------------------------------------------------------- */
/* Finance                                                                    */
/* -------------------------------------------------------------------------- */

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
    limit: '25',
  });

  if (params?.status && params.status !== 'all') {
    qs.set('status', params.status);
  }

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  return request(
    `/api/admin/finance/funding-requests?${qs}`
  );
}

export async function apiGetFundingStats(): Promise<FundingStats> {
  throw new Error(
    'Funding stats API is not implemented by the backend yet.'
  );
}

export async function apiApproveFunding(
  id: string
): Promise<{
  ok: boolean;
  balanceAfter: number;
}> {
  return request(
    `/api/admin/finance/funding-requests/${encodeURIComponent(id)}/approve`,
    {
      method: 'POST',
    }
  );
}

export async function apiRejectFunding(
  id: string,
  reason: string
): Promise<void> {
  await request(
    `/api/admin/finance/funding-requests/${encodeURIComponent(id)}/reject`,
    {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }
  );
}

export async function apiGetFundingHistory(
  params?: { page?: number }
): Promise<{
  history: FundingRequest[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: '25',
    status: 'approved',
  });

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  const data = await request<{
    requests: FundingRequest[];
    total: number;
    pages: number;
  }>(
    `/api/admin/finance/funding-requests?${qs}`
  );

  return {
    history: data.requests,
    total: data.total,
    pages: data.pages,
  };
}

/* -------------------------------------------------------------------------- */
/* Security                                                                   */
/* -------------------------------------------------------------------------- */

export async function apiGetAdminLoginHistory(
  params?: { page?: number }
): Promise<{
  history: AdminLoginHistoryEntry[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: '50',
  });

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  return request(
    `/api/admin/login-history?${qs}`
  );
}

export async function apiGetActiveSessions(): Promise<{
  sessions: AdminSessionRecord[];
}> {
  throw new Error(
    'Admin active sessions API is not implemented by the backend yet.'
  );
}

export async function apiRevokeSession(
  _id: string
): Promise<void> {
  throw new Error(
    'Admin session revoke API is not implemented by the backend yet.'
  );
}

export async function apiGet2FAStatus(): Promise<{
  enabled: boolean;
  setupAt: string | null;
}> {
  throw new Error(
    '2FA status API is not implemented by the backend yet.'
  );
}

export async function apiSetup2FA(): Promise<{
  qrDataUrl: string;
  secret: string;
}> {
  throw new Error(
    '2FA setup API is not implemented by the backend yet.'
  );
}

export async function apiVerify2FA(
  token: string
): Promise<{ ok: boolean }> {
  return request(
    '/api/admin/security/2fa/verify',
    jsonBody({ token })
  );
}

/* -------------------------------------------------------------------------- */
/* Audit logs                                                                 */
/* -------------------------------------------------------------------------- */

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
    ip: string | null;
    createdAt: string;
  }[];
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams({
    limit: '50',
  });

  if (params?.page) {
    qs.set('page', String(params.page));
  }

  if (params?.action) {
    qs.set('action', params.action);
  }

  return request(
    `/api/admin/audit-logs?${qs}`
  );
}

/* -------------------------------------------------------------------------- */
/* Staff                                                                      */
/* -------------------------------------------------------------------------- */

export async function apiGetStaff(): Promise<{
  staff: StaffMember[];
}> {
  throw new Error(
    'Staff API is not implemented by the backend yet.'
  );
}

export async function apiCreateStaff(
  _data: Partial<StaffMember>
): Promise<StaffMember> {
  throw new Error(
    'Staff API is not implemented by the backend yet.'
  );
}

export async function apiUpdateStaff(
  _id: string,
  _data: Partial<StaffMember>
): Promise<StaffMember> {
  throw new Error(
    'Staff API is not implemented by the backend yet.'
  );
}

export async function apiDeleteStaff(
  _id: string
): Promise<void> {
  throw new Error(
    'Staff API is not implemented by the backend yet.'
  );
}

export async function apiGetStaffAttendance(
  _staffId: string,
  _month?: string
): Promise<{ attendance: StaffAttendanceRecord[] }> {
  throw new Error(
    'Staff attendance API is not implemented by the backend yet.'
  );
}

export async function apiMarkAttendance(
  _staffId: string,
  _data: {
    date: string;
    status: string;
    checkIn?: string;
    checkOut?: string;
    notes?: string;
  }
): Promise<void> {
  throw new Error(
    'Staff attendance API is not implemented by the backend yet.'
  );
}

export async function apiGetStaffActivityLogs(
  _staffId: string
): Promise<{ logs: StaffActivityEntry[] }> {
  throw new Error(
    'Staff activity API is not implemented by the backend yet.'
  );
}

/* -------------------------------------------------------------------------- */
/* API management                                                             */
/* -------------------------------------------------------------------------- */

export async function apiGetApiConfigs(): Promise<{
  apis: ApiConfig[];
}> {
  return request('/api/admin/api-management/configs');
}

export async function apiUpdateApiConfig(
  key: string,
  data: {
    enabled?: boolean;
    fields?: Record<string, string>;
  }
): Promise<void> {
  await request(
    `/api/admin/api-management/configs/${encodeURIComponent(key)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    }
  );
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
  throw new Error(
    'API status endpoint is not implemented by the backend yet.'
  );
}

export async function apiGetApiErrorLogs(
  _params?: {
    api?: string;
    page?: number;
  }
): Promise<{
  logs: ApiLogEntry[];
  total: number;
  pages: number;
}> {
  throw new Error(
    'API error logs endpoint is not implemented by the backend yet.'
  );
}

export async function apiGetApiTransactionLogs(
  _params?: {
    api?: string;
    page?: number;
  }
): Promise<{
  logs: ApiLogEntry[];
  total: number;
  pages: number;
}> {
  throw new Error(
    'API transaction logs endpoint is not implemented by the backend yet.'
  );
}

/* -------------------------------------------------------------------------- */
/* Cashback                                                                   */
/* -------------------------------------------------------------------------- */

export async function apiGetCashbackSettings(): Promise<CashbackSettings> {
  return request('/api/admin/cashback/settings');
}

export async function apiUpdateCashbackSettings(
  enabled: boolean
): Promise<{
  ok: boolean;
  enabled: boolean;
}> {
  return request(
    '/api/admin/cashback/settings',
    {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    }
  );
}

export async function apiGetCashbackPlans(
  network?: string
): Promise<{ plans: CashbackPlan[] }> {
  const qs = network
    ? `?network=${encodeURIComponent(network)}`
    : '';

  return request(
    `/api/admin/cashback/plans${qs}`
  );
}

export async function apiUpdateCashbackPlan(
  id: string,
  data: {
    cashbackEnabled?: boolean;
    cashbackType?: 'percentage' | 'fixed';
    cashbackValue?: number;
  }
): Promise<{ ok: boolean }> {
  return request(
    `/api/admin/cashback/plans/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data),
    }
  );
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
  return request(
    '/api/admin/cashback/plans/bulk',
    {
      method: 'POST',
      body: JSON.stringify({
        network,
        ...data,
      }),
    }
  );
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

  const suffix = qs.toString()
    ? `?${qs}`
    : '';

  return request(
    `/api/admin/cashback/reports${suffix}`
  );
}

/* -------------------------------------------------------------------------- */
/* Export utilities                                                           */
/* -------------------------------------------------------------------------- */

export function exportToCsv(
  data: Record<string, unknown>[],
  filename: string
): void {
  if (!data.length) {
    return;
  }

  const headers = Object.keys(data[0]);

  const escape = (value: unknown): string => {
    const text = value == null ? '' : String(value);

    return /[",\n\r]/.test(text)
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  };

  const csv = [
    headers.map(escape).join(','),
    ...data.map(row =>
      headers.map(header => escape(row[header])).join(',')
    ),
  ].join('\n');

  const blob = new Blob(
    ['\ufeff' + csv],
    {
      type: 'text/csv;charset=utf-8',
    }
  );

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

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

  const escapeHtml = (value: unknown): string =>
    String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');

  const headers = Object.keys(data[0]);

  const rows = data
    .map(row =>
      `<tr>${headers
        .map(header =>
          `<td>${escapeHtml(row[header])}</td>`
        )
        .join('')}</tr>`
    )
    .join('');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
body {
  font-family: Arial, sans-serif;
  font-size: 12px;
  padding: 20px;
}
h2 {
  margin: 0;
}
p {
  color: #666;
  font-size: 11px;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 12px;
}
th,
td {
  border: 1px solid #ddd;
  padding: 6px 10px;
  text-align: left;
}
th {
  background: #0f2d52;
  color: white;
}
button {
  padding: 8px 16px;
  margin-bottom: 12px;
}
@media print {
  button {
    display: none;
  }
}
</style>
</head>
<body>
<h2>${escapeHtml(title)}</h2>
<p>Generated: ${escapeHtml(
    new Date().toLocaleString('en-NG')
  )}</p>
<button onclick="window.print()">Print / Save as PDF</button>
<table>
<thead>
<tr>
${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}
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
      type: 'text/html;charset=utf-8',
    }
  );

  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');

  if (!win) {
    const anchor = document.createElement('a');

    anchor.href = url;
    anchor.download = filename;

    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  window.setTimeout(
    () => URL.revokeObjectURL(url),
    15000
  );
}
