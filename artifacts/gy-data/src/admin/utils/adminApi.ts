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
  lastTransactionAt: string | null; createdAt: string;
  role: string; purchasePinConfigured?: boolean;
}

export interface UserTransaction {
  id: string; reference: string; type: string; amount: number;
  status: string; description?: string; createdAt: string;
  balanceBefore?: number; balanceAfter?: number;
}

export interface UserStatusHistory {
  id: string;
  userId: string;
  oldStatus: string | null;
  newStatus: string;
  reason: string | null;
  changedBy: string | null;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  status: string;
  role: string;
  walletBalance: number;
  createdAt: string;
  lastLoginAt?: string | null;
}

export interface DashboardStats {
  totalUsers: number;
  activeUsers: number;
  suspendedUsers: number;
  totalWalletBalance: number;
  totalRevenue: number;
  totalTransactions: number;
  todayRevenue: number;
  todayTransactions: number;
}

export interface Transaction {
  id: string;
  reference: string;
  userId?: string;
  userName?: string;
  type: string;
  amount: number;
  status: string;
  description?: string;
  createdAt: string;
}

export interface WalletLedgerEntry {
  id: string;
  userId: string;
  reference: string;
  type: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  description?: string;
  createdAt: string;
}

export interface ApiIntegration {
  id: string;
  name: string;
  provider: string;
  status: string;
  baseUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupportTicket {
  id: string;
  userId?: string;
  subject: string;
  message?: string;
  status: string;
  priority?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface CashbackSettings {
  enabled: boolean;
  percentage: number;
  minimumAmount?: number;
  maximumAmount?: number;
}

export interface PricingRule {
  id: string;
  name?: string;
  network?: string;
  service?: string;
  percentage?: number;
  flatFee?: number;
  amount?: number;
  active?: boolean;
}

export interface AuditLog {
  id: string;
  actorId?: string;
  actorName?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  details?: unknown;
  createdAt: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

async function jsonOrThrow<T>(r: Response): Promise<T> {
  if (!r.ok) {
    let message = `Request failed (${r.status})`;
    try {
      const body = await r.json() as { error?: string; message?: string };
      message = body.error ?? body.message ?? message;
    } catch {
      // ignore invalid JSON
    }
    throw new Error(message);
  }
  return r.json() as Promise<T>;
}

function queryString(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(
    ([, value]) => value !== undefined && value !== null && value !== ''
  );

  if (!entries.length) return '';

  const qs = new URLSearchParams();
  for (const [key, value] of entries) {
    qs.set(key, String(value));
  }

  return `?${qs.toString()}`;
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetDashboard(): Promise<DashboardStats> {
  const r = await adminApi('/api/admin/dashboard');
  return jsonOrThrow<DashboardStats>(r);
}

export async function apiGetDashboardExtended(): Promise<unknown> {
  const r = await adminApi('/api/admin/dashboard/extended');
  return jsonOrThrow<unknown>(r);
}

export async function apiGetDashboardStats(): Promise<DashboardStats> {
  const r = await adminApi('/api/admin/dashboard/stats');
  return jsonOrThrow<DashboardStats>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetUsers(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  role?: string;
}): Promise<{
  users: AdminUser[];
  total: number;
  page: number;
  pages: number;
}> {
  const r = await adminApi(`/api/admin/users${queryString(params ?? {})}`);
  return jsonOrThrow(r);
}

export async function apiGetUser(userId: string): Promise<UserFullProfile> {
  const r = await adminApi(`/api/admin/users/${userId}`);
  return jsonOrThrow<UserFullProfile>(r);
}

export async function apiGetUserProfile(userId: string): Promise<UserFullProfile> {
  const r = await adminApi(`/api/admin/users/${userId}/profile`);
  return jsonOrThrow<UserFullProfile>(r);
}

export async function apiGetUserStatusHistory(
  userId: string
): Promise<UserStatusHistory[]> {
  const r = await adminApi(`/api/admin/users/${userId}/status-history`);
  const data = await jsonOrThrow<unknown>(r);

  if (Array.isArray(data)) {
    return data as UserStatusHistory[];
  }

  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { history?: unknown }).history)
  ) {
    return (data as { history: UserStatusHistory[] }).history;
  }

  return [];
}

export async function apiChangeUserStatus(
  userId: string,
  status: string,
  reason?: string
): Promise<unknown> {
  const r = await adminApi(`/api/admin/users/${userId}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status, reason }),
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiResetLoginPin(userId: string): Promise<unknown> {
  const r = await adminApi(`/api/admin/users/${userId}/reset-login-pin`, {
    method: 'POST',
  });

  return jsonOrThrow<unknown>(r);
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
  const r = await adminApi(
    `/api/admin/users/${userId}/transactions${queryString(params ?? {})}`
  );

  return jsonOrThrow(r);
}

export async function apiUpdateUser(
  userId: string,
  data: Record<string, unknown>
): Promise<unknown> {
  const r = await adminApi(`/api/admin/users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiDeleteUser(userId: string): Promise<unknown> {
  const r = await adminApi(`/api/admin/users/${userId}`, {
    method: 'DELETE',
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiSuspendUser(
  userId: string,
  reason?: string
): Promise<unknown> {
  return apiChangeUserStatus(userId, 'suspended', reason);
}

export async function apiActivateUser(
  userId: string,
  reason?: string
): Promise<unknown> {
  return apiChangeUserStatus(userId, 'active', reason);
}

// ══════════════════════════════════════════════════════════════════════════════
// WALLET
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetUserWallet(userId: string): Promise<{
  balance: number;
  walletBalance?: number;
}> {
  const r = await adminApi(`/api/admin/users/${userId}/wallet`);
  return jsonOrThrow(r);
}

export async function apiGetWalletLedger(
  userId: string,
  params?: {
    page?: number;
    limit?: number;
    type?: string;
  }
): Promise<{
  entries: WalletLedgerEntry[];
  total: number;
  pages: number;
}> {
  const r = await adminApi(
    `/api/admin/users/${userId}/wallet/ledger${queryString(params ?? {})}`
  );

  return jsonOrThrow(r);
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
    `/api/admin/finance/users/${userId}/wallet/adjust`,
    {
      method: 'POST',
      body: JSON.stringify({ type: 'credit', amount, reason })
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
    `/api/admin/finance/users/${userId}/wallet/adjust`,
    {
      method: 'POST',
      body: JSON.stringify({ type: 'debit', amount, reason })
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

export async function apiFundWallet(
  userId: string,
  amount: number,
  reason?: string
): Promise<unknown> {
  const r = await adminApi(`/api/admin/users/${userId}/fund-wallet`, {
    method: 'POST',
    body: JSON.stringify({ amount, reason }),
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiAdjustWallet(
  userId: string,
  type: 'credit' | 'debit',
  amount: number,
  reason: string
): Promise<{
  ok: boolean;
  reference: string;
  balanceBefore: number;
  balanceAfter: number;
  type: 'credit' | 'debit';
  amount: number;
}> {
  const r = await adminApi(
    `/api/admin/finance/users/${userId}/wallet/adjust`,
    {
      method: 'POST',
      body: JSON.stringify({ type, amount, reason }),
    }
  );

  return jsonOrThrow(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetTransactions(params?: {
  page?: number;
  limit?: number;
  search?: string;
  status?: string;
  type?: string;
  userId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{
  transactions: Transaction[];
  total: number;
  pages: number;
  page: number;
}> {
  const r = await adminApi(
    `/api/admin/transactions${queryString(params ?? {})}`
  );

  return jsonOrThrow(r);
}

export async function apiGetTransaction(
  transactionId: string
): Promise<Transaction> {
  const r = await adminApi(`/api/admin/transactions/${transactionId}`);
  return jsonOrThrow<Transaction>(r);
}

export async function apiReverseTransaction(
  transactionId: string,
  reason: string
): Promise<unknown> {
  const r = await adminApi(`/api/admin/transactions/${transactionId}/reverse`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiRefundTransaction(
  transactionId: string,
  reason: string
): Promise<unknown> {
  const r = await adminApi(`/api/admin/transactions/${transactionId}/refund`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// REVERSALS / REFUNDS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetReversals(params?: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<unknown> {
  const r = await adminApi(
    `/api/admin/reversals${queryString(params ?? {})}`
  );

  return jsonOrThrow<unknown>(r);
}

export async function apiGetRefunds(params?: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<unknown> {
  const r = await adminApi(
    `/api/admin/refunds${queryString(params ?? {})}`
  );

  return jsonOrThrow<unknown>(r);
}

export async function apiProcessRefund(
  refundId: string,
  data?: Record<string, unknown>
): Promise<unknown> {
  const r = await adminApi(`/api/admin/refunds/${refundId}/process`, {
    method: 'POST',
    body: JSON.stringify(data ?? {}),
  });

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// API INTEGRATIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetIntegrations(): Promise<ApiIntegration[]> {
  const r = await adminApi('/api/admin/integrations');
  const data = await jsonOrThrow<unknown>(r);

  if (Array.isArray(data)) return data as ApiIntegration[];

  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { integrations?: unknown }).integrations)
  ) {
    return (data as { integrations: ApiIntegration[] }).integrations;
  }

  return [];
}

export async function apiGetApiIntegrations(): Promise<ApiIntegration[]> {
  return apiGetIntegrations();
}

export async function apiCreateIntegration(
  data: Record<string, unknown>
): Promise<unknown> {
  const r = await adminApi('/api/admin/integrations', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiUpdateIntegration(
  integrationId: string,
  data: Record<string, unknown>
): Promise<unknown> {
  const r = await adminApi(`/api/admin/integrations/${integrationId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiDeleteIntegration(
  integrationId: string
): Promise<unknown> {
  const r = await adminApi(`/api/admin/integrations/${integrationId}`, {
    method: 'DELETE',
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiTestIntegration(
  integrationId: string
): Promise<unknown> {
  const r = await adminApi(`/api/admin/integrations/${integrationId}/test`, {
    method: 'POST',
  });

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// SUPPORT
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetSupportTickets(params?: {
  page?: number;
  limit?: number;
  status?: string;
  priority?: string;
  search?: string;
}): Promise<{
  tickets: SupportTicket[];
  total: number;
  pages: number;
}> {
  const r = await adminApi(
    `/api/admin/support-inbox/tickets${queryString(params ?? {})}`
  );

  return jsonOrThrow(r);
}

export async function apiGetSupportTicket(
  ticketId: string
): Promise<SupportTicket> {
  const r = await adminApi(`/api/admin/support-inbox/tickets/${ticketId}`);
  return jsonOrThrow<SupportTicket>(r);
}

export async function apiUpdateSupportTicket(
  ticketId: string,
  data: Record<string, unknown>
): Promise<unknown> {
  const r = await adminApi(`/api/admin/support-inbox/tickets/${ticketId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiReplySupportTicket(
  ticketId: string,
  message: string
): Promise<unknown> {
  const r = await adminApi(
    `/api/admin/support-inbox/tickets/${ticketId}/reply`,
    {
      method: 'POST',
      body: JSON.stringify({ message }),
    }
  );

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// CASHBACK
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetCashbackSettings(): Promise<CashbackSettings> {
  const r = await adminApi('/api/admin/cashback/settings');
  return jsonOrThrow<CashbackSettings>(r);
}

export async function apiUpdateCashbackSettings(
  data: Partial<CashbackSettings>
): Promise<CashbackSettings> {
  const r = await adminApi('/api/admin/cashback/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });

  return jsonOrThrow<CashbackSettings>(r);
}

export async function apiGetCashbackTransactions(params?: {
  page?: number;
  limit?: number;
  userId?: string;
}): Promise<unknown> {
  const r = await adminApi(
    `/api/admin/cashback/transactions${queryString(params ?? {})}`
  );

  return jsonOrThrow<unknown>(r);
}

export async function apiGetCashbackStats(): Promise<unknown> {
  const r = await adminApi('/api/admin/cashback/stats');
  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// PRICING
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetPricingRules(params?: {
  network?: string;
  service?: string;
  active?: boolean;
}): Promise<PricingRule[]> {
  const r = await adminApi(
    `/api/admin/pricing-rules${queryString(params ?? {})}`
  );

  const data = await jsonOrThrow<unknown>(r);

  if (Array.isArray(data)) return data as PricingRule[];

  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { rules?: unknown }).rules)
  ) {
    return (data as { rules: PricingRule[] }).rules;
  }

  return [];
}

export async function apiCreatePricingRule(
  data: Record<string, unknown>
): Promise<unknown> {
  const r = await adminApi('/api/admin/pricing-rules', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiUpdatePricingRule(
  ruleId: string,
  data: Record<string, unknown>
): Promise<unknown> {
  const r = await adminApi(`/api/admin/pricing-rules/${ruleId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiDeletePricingRule(ruleId: string): Promise<unknown> {
  const r = await adminApi(`/api/admin/pricing-rules/${ruleId}`, {
    method: 'DELETE',
  });

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetAuditLogs(params?: {
  page?: number;
  limit?: number;
  action?: string;
  actorId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{
  logs: AuditLog[];
  total: number;
  pages: number;
}> {
  const r = await adminApi(
    `/api/admin/audit-logs${queryString(params ?? {})}`
  );

  return jsonOrThrow(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTH / ADMIN PROFILE
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetAdminMe(): Promise<unknown> {
  const r = await adminApi('/api/auth/me');
  return jsonOrThrow<unknown>(r);
}

export async function apiChangeAdminPassword(
  currentPassword: string,
  newPassword: string
): Promise<unknown> {
  const r = await adminApi('/api/admin/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// SETTINGS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetSettings(): Promise<unknown> {
  const r = await adminApi('/api/admin/settings');
  return jsonOrThrow<unknown>(r);
}

export async function apiUpdateSettings(
  data: Record<string, unknown>
): Promise<unknown> {
  const r = await adminApi('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(data),
  });

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// SME API
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetSmeApiPlans(params?: {
  network?: string;
  service?: string;
}): Promise<unknown> {
  const r = await adminApi(
    `/api/smeapi/data-plans${queryString(params ?? {})}`
  );

  return jsonOrThrow<unknown>(r);
}

export async function apiGetSmeApiBalance(): Promise<unknown> {
  const r = await adminApi('/api/smeapi/balance');
  return jsonOrThrow<unknown>(r);
}

export async function apiTestSmeApi(): Promise<unknown> {
  const r = await adminApi('/api/smeapi/test', {
    method: 'POST',
  });

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// GENERIC ADMIN ACTIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiPost(
  path: string,
  body?: unknown
): Promise<unknown> {
  const r = await adminApi(path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiPut(
  path: string,
  body?: unknown
): Promise<unknown> {
  const r = await adminApi(path, {
    method: 'PUT',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiDelete(path: string): Promise<unknown> {
  const r = await adminApi(path, {
    method: 'DELETE',
  });

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// SUPER ADMIN
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetSuperAdminStats(): Promise<unknown> {
  const r = await adminApi('/api/admin/super/stats');
  return jsonOrThrow<unknown>(r);
}

export async function apiGetAdminUsers(params?: {
  page?: number;
  limit?: number;
  search?: string;
}): Promise<unknown> {
  const r = await adminApi(
    `/api/admin/admin-users${queryString(params ?? {})}`
  );

  return jsonOrThrow<unknown>(r);
}

export async function apiCreateAdminUser(
  data: Record<string, unknown>
): Promise<unknown> {
  const r = await adminApi('/api/admin/admin-users', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiUpdateAdminUser(
  userId: string,
  data: Record<string, unknown>
): Promise<unknown> {
  const r = await adminApi(`/api/admin/admin-users/${userId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiDeleteAdminUser(userId: string): Promise<unknown> {
  const r = await adminApi(`/api/admin/admin-users/${userId}`, {
    method: 'DELETE',
  });

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiSendNotification(
  data: Record<string, unknown>
): Promise<unknown> {
  const r = await adminApi('/api/admin/notifications', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiGetNotifications(params?: {
  page?: number;
  limit?: number;
}): Promise<unknown> {
  const r = await adminApi(
    `/api/admin/notifications${queryString(params ?? {})}`
  );

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetAnnouncements(): Promise<unknown> {
  const r = await adminApi('/api/admin/announcements');
  return jsonOrThrow<unknown>(r);
}

export async function apiCreateAnnouncement(
  data: Record<string, unknown>
): Promise<unknown> {
  const r = await adminApi('/api/admin/announcements', {
    method: 'POST',
    body: JSON.stringify(data),
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiUpdateAnnouncement(
  announcementId: string,
  data: Record<string, unknown>
): Promise<unknown> {
  const r = await adminApi(`/api/admin/announcements/${announcementId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiDeleteAnnouncement(
  announcementId: string
): Promise<unknown> {
  const r = await adminApi(`/api/admin/announcements/${announcementId}`, {
    method: 'DELETE',
  });

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetConfiguration(): Promise<unknown> {
  const r = await adminApi('/api/admin/configuration');
  return jsonOrThrow<unknown>(r);
}

export async function apiUpdateConfiguration(
  data: Record<string, unknown>
): Promise<unknown> {
  const r = await adminApi('/api/admin/configuration', {
    method: 'PUT',
    body: JSON.stringify(data),
  });

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// PAYMENT
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetPaymentTransactions(params?: {
  page?: number;
  limit?: number;
  status?: string;
}): Promise<unknown> {
  const r = await adminApi(
    `/api/admin/payment/transactions${queryString(params ?? {})}`
  );

  return jsonOrThrow<unknown>(r);
}

export async function apiVerifyPayment(
  reference: string
): Promise<unknown> {
  const r = await adminApi('/api/admin/payment/verify', {
    method: 'POST',
    body: JSON.stringify({ reference }),
  });

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORTS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetRevenueReport(params?: {
  startDate?: string;
  endDate?: string;
  groupBy?: string;
}): Promise<unknown> {
  const r = await adminApi(
    `/api/admin/reports/revenue${queryString(params ?? {})}`
  );

  return jsonOrThrow<unknown>(r);
}

export async function apiGetUserReport(params?: {
  startDate?: string;
  endDate?: string;
}): Promise<unknown> {
  const r = await adminApi(
    `/api/admin/reports/users${queryString(params ?? {})}`
  );

  return jsonOrThrow<unknown>(r);
}

export async function apiGetTransactionReport(params?: {
  startDate?: string;
  endDate?: string;
  type?: string;
  status?: string;
}): Promise<unknown> {
  const r = await adminApi(
    `/api/admin/reports/transactions${queryString(params ?? {})}`
  );

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// ACTIVITY
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetAdminActivity(params?: {
  page?: number;
  limit?: number;
}): Promise<unknown> {
  const r = await adminApi(
    `/api/admin/activity${queryString(params ?? {})}`
  );

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// ROLES / PERMISSIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetRoles(): Promise<unknown> {
  const r = await adminApi('/api/admin/roles');
  return jsonOrThrow<unknown>(r);
}

export async function apiGetPermissions(): Promise<unknown> {
  const r = await adminApi('/api/admin/permissions');
  return jsonOrThrow<unknown>(r);
}

export async function apiUpdatePermissions(
  userId: string,
  permissions: unknown
): Promise<unknown> {
  const r = await adminApi(`/api/admin/users/${userId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  });

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// DATA PURCHASE MANAGEMENT
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetPurchases(params?: {
  page?: number;
  limit?: number;
  status?: string;
  network?: string;
  userId?: string;
}): Promise<unknown> {
  const r = await adminApi(
    `/api/admin/purchases${queryString(params ?? {})}`
  );

  return jsonOrThrow<unknown>(r);
}

export async function apiGetPurchase(
  purchaseId: string
): Promise<unknown> {
  const r = await adminApi(`/api/admin/purchases/${purchaseId}`);
  return jsonOrThrow<unknown>(r);
}

export async function apiRetryPurchase(
  purchaseId: string
): Promise<unknown> {
  const r = await adminApi(`/api/admin/purchases/${purchaseId}/retry`, {
    method: 'POST',
  });

  return jsonOrThrow<unknown>(r);
}

export async function apiCancelPurchase(
  purchaseId: string,
  reason?: string
): Promise<unknown> {
  const r = await adminApi(`/api/admin/purchases/${purchaseId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// SYSTEM HEALTH
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetSystemHealth(): Promise<unknown> {
  const r = await adminApi('/api/admin/health');
  return jsonOrThrow<unknown>(r);
}

export async function apiGetSystemStatus(): Promise<unknown> {
  const r = await adminApi('/api/admin/status');
  return jsonOrThrow<unknown>(r);
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORTS / DOWNLOADS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiExportUsers(params?: {
  status?: string;
  role?: string;
}): Promise<Response> {
  return adminApi(
    `/api/admin/export/users${queryString(params ?? {})}`
  );
}

export async function apiExportTransactions(params?: {
  startDate?: string;
  endDate?: string;
  status?: string;
}): Promise<Response> {
  return adminApi(
    `/api/admin/export/transactions${queryString(params ?? {})}`
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LOGOUT
// ══════════════════════════════════════════════════════════════════════════════

export async function apiAdminLogout(): Promise<void> {
  const r = await adminApi('/api/auth/logout', {
    method: 'POST',
  });

  if (!r.ok) {
    throw new Error('Logout failed');
  }
}
