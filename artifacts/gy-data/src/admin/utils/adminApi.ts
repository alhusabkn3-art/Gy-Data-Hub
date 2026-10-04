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

export async function apiUpdateUserStatus(
  userId: string,
  status: string,
  reason?: string
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
  pin: string;
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
    pin: string;
    message: string;
  }>;
}

export async function apiResetPurchasePin(
  userId: string
): Promise<{
  pin: string;
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
    pin: string;
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

export async function apiReverseTransaction(
  txId: string,
  reason: string
): Promise<ReversalRecord> {
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

  return r.json() as Promise<ReversalRecord>;
}

export async function apiGetServiceSettings(): Promise<{
  settings: ServiceSetting[];
}> {
  const r = await adminApi(
    '/api/admin/settings/services'
  );

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

  const r = await adminApi(
    `/api/admin/reports/financial?${qs}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<FinancialReport>;
}

export async function apiGetNotifications(): Promise<{
  notifications: NotificationHistoryEntry[];
}> {
  const r = await adminApi(
    '/api/admin/notifications/history'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    notifications: NotificationHistoryEntry[];
  }>;
}

export async function apiSendNotification(
  title: string,
  body: string,
  recipientType: string
): Promise<{
  sent: number;
}> {
  const r = await adminApi(
    '/api/admin/notifications/send',
    {
      method: 'POST',
      body: JSON.stringify({
        title,
        body,
        recipientType
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

export async function apiGetDashboardExtended(): Promise<DashboardExtended> {
  const r = await adminApi(
    '/api/admin/dashboard/extended'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<DashboardExtended>;
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

export async function apiGetStaff(): Promise<{
  staff: StaffMember[];
}> {
  const r = await adminApi(
    '/api/admin/staff'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    staff: StaffMember[];
  }>;
}

export async function apiGetStaffAttendance(
  staffId: string,
  date?: string
): Promise<{
  attendance: StaffAttendanceRecord[];
}> {
  const qs = new URLSearchParams();

  if (date) {
    qs.set('date', date);
  }

  const r = await adminApi(
    `/api/admin/staff/${staffId}/attendance?${qs}`
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

export async function apiUpdateStaffAttendance(
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

export async function apiGetStaffActivity(
  staffId: string
): Promise<{
  activity: StaffActivityEntry[];
}> {
  const r = await adminApi(
    `/api/admin/staff/${staffId}/activity`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    activity: StaffActivityEntry[];
  }>;
}

export async function apiGetPricingRules(
  params?: {
    serviceType?: string;
    network?: string;
    enabled?: boolean;
  }
): Promise<{
  rules: PricingRule[];
}> {
  const qs = new URLSearchParams();

  if (params?.serviceType) {
    qs.set('serviceType', params.serviceType);
  }

  if (params?.network) {
    qs.set('network', params.network);
  }

  if (params?.enabled !== undefined) {
    qs.set('enabled', String(params.enabled));
  }

  const r = await adminApi(
    `/api/admin/pricing/rules?${qs}`
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
    network?: string | null;
    planId?: string | null;
    planName?: string | null;
    sellingPrice: number;
    costPrice: number;
    enabled?: boolean;
  }
): Promise<PricingRule> {
  const r = await adminApi(
    '/api/admin/pricing/rules',
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

export async function apiUpdatePricingRule(
  id: string,
  data: Partial<{
    serviceType: string;
    network: string | null;
    planId: string | null;
    planName: string | null;
    sellingPrice: number;
    costPrice: number;
    enabled: boolean;
  }>
): Promise<PricingRule> {
  const r = await adminApi(
    `/api/admin/pricing/rules/${id}`,
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

export async function apiDeletePricingRule(
  id: string
): Promise<void> {
  const r = await adminApi(
    `/api/admin/pricing/rules/${id}`,
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

export async function apiGetApiConfigs(): Promise<{
  configs: ApiConfig[];
}> {
  const r = await adminApi(
    '/api/admin/apis'
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
    apiKey?: string;
    baseUrl?: string;
  }
): Promise<ApiConfig> {
  const r = await adminApi(
    `/api/admin/apis/${id}`,
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

export async function apiTestApiConfig(
  id: string
): Promise<{
  ok: boolean;
  message?: string;
}> {
  const r = await adminApi(
    `/api/admin/apis/${id}/test`,
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
    message?: string;
  }>;
}

export async function apiGetApiLogs(
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
    `/api/admin/apis/logs?${qs}`
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
  const r = await adminApi(
    '/api/admin/funding/stats'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<FundingStats>;
}

export async function apiApproveFunding(
  id: string,
  note?: string
): Promise<FundingRequest> {
  const r = await adminApi(
    `/api/admin/funding/${id}/approve`,
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
  id: string,
  reason: string
): Promise<FundingRequest> {
  const r = await adminApi(
    `/api/admin/funding/${id}/reject`,
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
