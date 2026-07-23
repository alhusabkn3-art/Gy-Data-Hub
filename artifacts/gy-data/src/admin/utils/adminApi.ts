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
  id: string; type: 'credit' | 'debit' | 'reversal' | 'adjustment' | 'wallet_fund';
  amount: number; balanceBefore: number; balanceAfter: number;
  reference: string | null; reason: string | null;
  performedBy: string | null; performedByName: string | null; createdAt: string;
}
export interface UserStatusHistoryEntry {
  id: string; previousStatus: string; newStatus: string; reason: string | null;
  performedBy: string | null; performedByName: string | null; createdAt: string;
}
export interface UserTransaction {
  id: string; type: string; service: string; provider: string; amount: number;
  status: string; reference: string; description: string;
  paymentMethod: string | null; createdAt: string;
}
export interface TransactionDetail {
  id: string; userId: string; userName: string; userPhone: string; userEmail: string;
  type: string; service: string; provider: string; amount: number; status: string;
  reference: string | null; description: string; paymentMethod: string | null;
  metadata: Record<string, unknown> | null; createdAt: string;
  reversal: { id: string; reason: string; performedByName: string; createdAt: string } | null;
}
export interface ReversalRecord {
  id: string; originalTransactionId: string;
  userId: string; userName: string; userPhone: string;
  amount: number; reason: string; performedBy: string; performedByName: string;
  txType: string; txService: string; txReference: string | null;
  walletLedgerId: string | null; createdAt: string;
}
export interface ServiceSetting {
  id: string; serviceKey: string; label: string; enabled: boolean;
  markup: number | null; notes: string | null;
  updatedBy: string | null; updatedByName: string | null; updatedAt: string;
}
export interface SystemSettingValue {
  value: string; updatedBy: string | null; updatedByName: string | null; updatedAt: string;
}
export interface IntegrationField { label: string; value: string; sensitive: boolean; }
export interface Integration {
  key: string; label: string; status: 'configured' | 'not_configured'; fields: IntegrationField[];
}
export interface FinancialReport {
  transactions: {
    totalCount: number; successfulCount: number; failedCount: number; pendingCount: number;
    totalRevenue: number; failedValue: number; pendingValue: number; walletFunding: number;
  };
  wallet: { totalManualCredits: number; totalManualDebits: number; totalReversals: number; ledgerEntries: number; };
  reversals: { count: number; totalAmount: number; };
  dailyRevenue: { day: string; revenue: number; count: number; }[];
  serviceBreakdown: { type: string; revenue: number; count: number; }[];
}
export interface NotificationHistoryEntry {
  id: string; title: string; body: string; type: string; read: boolean;
  userName: string; userPhone: string; createdAt: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW TYPES
// ══════════════════════════════════════════════════════════════════════════════

export interface DashboardExtended {
  dailyRevenue: { day: string; revenue: number; count: number }[];
  weeklyRevenue: { week: string; revenue: number; count: number }[];
  monthlyRevenue: { month: string; revenue: number; count: number }[];
  profitMargin: number; totalCost: number; netProfit: number;
  activeUsersToday: number; newUsersThisWeek: number;
  recentActivity: { id: string; action: string; adminEmail: string; targetLabel: string | null; createdAt: string }[];
}
export interface UserLoginHistoryEntry {
  id: string; userId: string; status: string; ipAddress: string | null;
  userAgent: string | null; createdAt: string;
}
export interface StaffMember {
  id: string; name: string; email: string | null; phone: string | null;
  role: string; rank: string; salary: number; salaryPaymentDay: number;
  department: string | null; status: string; permissions: string[];
  notes: string | null; createdAt: string; updatedAt: string;
}
export interface StaffAttendanceRecord {
  id: string; staffId: string; date: string; checkIn: string | null;
  checkOut: string | null; status: string; notes: string | null; createdAt: string;
}
export interface StaffActivityEntry {
  id: string; staffId: string; action: string;
  metadata: Record<string, unknown>; ipAddress: string | null; createdAt: string;
}
export interface PricingRule {
  id: string; serviceType: string; provider: string; network: string | null;
  planId: string | null; planName: string | null; costPrice: number;
  sellingPrice: number; markupPercent: number; enabled: boolean;
  updatedAt: string; createdAt: string;
}
export interface ApiConfig {
  key: string; label: string; enabled: boolean; status: 'online' | 'offline' | 'unknown';
  lastChecked: string | null;
  fields: { name: string; label: string; value: string; sensitive: boolean }[];
}
export interface ApiLogEntry {
  id: string; api: string; endpoint: string; method: string;
  statusCode: number | null; responseTime: number | null; error: string | null;
  requestRef: string | null; createdAt: string;
}
export interface FundingRequest {
  id: string; userId: string; userName: string; userPhone: string;
  reference: string; amount: number; gateway: string; status: string;
  metadata: Record<string, unknown>; reviewedByName: string | null;
  reviewedAt: string | null; rejectReason: string | null; createdAt: string;
}
export interface FundingStats {
  pendingCount: number; pendingTotal: number;
  approvedToday: number; approvedTodayTotal: number;
  rejectedToday: number; totalFundedAllTime: number;
}
export interface AdminLoginHistoryEntry {
  id: string; adminId: string; adminEmail: string; ipAddress: string | null;
  userAgent: string | null; status: string; failReason: string | null; createdAt: string;
}
export interface AdminSessionRecord {
  id: string; adminId: string; adminEmail: string; ipAddress: string | null;
  userAgent: string | null; lastActive: string; revokedAt: string | null; createdAt: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// EXISTING API FUNCTIONS (unchanged)
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetUserProfile(userId: string): Promise<UserFullProfile> {
  const r = await adminApi(`/api/admin/users/${userId}`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<UserFullProfile>;
}
export async function apiGetUserWallet(userId: string): Promise<WalletSummary> {
  const r = await adminApi(`/api/admin/users/${userId}/wallet`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<WalletSummary>;
}
export async function apiGetWalletLedger(userId: string, page = 1, limit = 25): Promise<{ entries: WalletLedgerEntry[]; total: number; pages: number }> {
  const r = await adminApi(`/api/admin/users/${userId}/wallet/ledger?page=${page}&limit=${limit}`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ entries: WalletLedgerEntry[]; total: number; pages: number }>;
}
export async function apiCreditWallet(userId: string, amount: number, reason: string): Promise<{ ok: boolean; reference: string; balanceBefore: number; balanceAfter: number }> {
  const r = await adminApi(`/api/admin/users/${userId}/wallet/credit`, { method: 'POST', body: JSON.stringify({ amount, reason }) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ ok: boolean; reference: string; balanceBefore: number; balanceAfter: number }>;
}
export async function apiDebitWallet(userId: string, amount: number, reason: string): Promise<{ ok: boolean; reference: string; balanceBefore: number; balanceAfter: number }> {
  const r = await adminApi(`/api/admin/users/${userId}/wallet/debit`, { method: 'POST', body: JSON.stringify({ amount, reason }) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ ok: boolean; reference: string; balanceBefore: number; balanceAfter: number }>;
}
export async function apiGetUserTransactions(userId: string, params?: { status?: string; page?: number }): Promise<{ transactions: UserTransaction[]; total: number; pages: number }> {
  const qs = new URLSearchParams({ limit: '25' });
  if (params?.status && params.status !== 'all') qs.set('status', params.status);
  if (params?.page) qs.set('page', String(params.page));
  const r = await adminApi(`/api/admin/users/${userId}/transactions?${qs}`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ transactions: UserTransaction[]; total: number; pages: number }>;
}
export async function apiGetUserStatusHistory(userId: string): Promise<{ history: UserStatusHistoryEntry[] }> {
  const r = await adminApi(`/api/admin/users/${userId}/status-history`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ history: UserStatusHistoryEntry[] }>;
}
export async function apiChangeUserStatus(userId: string, status: string, reason: string): Promise<void> {
  const r = await adminApi(`/api/admin/users/${userId}/status`, { method: 'POST', body: JSON.stringify({ status, reason }) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
}
export async function apiResetLoginPin(userId: string): Promise<{ tempPin: string; message: string }> {
  const r = await adminApi(`/api/admin/users/${userId}/reset-login-pin`, { method: 'POST' });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ tempPin: string; message: string }>;
}
export async function apiResetPurchasePin(userId: string): Promise<{ tempPin: string; message: string }> {
  const r = await adminApi(`/api/admin/users/${userId}/reset-purchase-pin`, { method: 'POST' });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ tempPin: string; message: string }>;
}
export async function apiGetTransactionDetail(txId: string): Promise<TransactionDetail> {
  const r = await adminApi(`/api/admin/transactions/${txId}`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<TransactionDetail>;
}
export async function apiMarkTransactionReview(txId: string, note?: string): Promise<void> {
  const r = await adminApi(`/api/admin/transactions/${txId}/mark-review`, { method: 'POST', body: JSON.stringify({ note }) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
}
export async function apiReverseTransaction(txId: string, reason: string): Promise<{ reference: string; amount: number }> {
  const r = await adminApi(`/api/admin/transactions/${txId}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ reference: string; amount: number }>;
}
export async function apiGetReversals(params?: { search?: string; page?: number }): Promise<{ reversals: ReversalRecord[]; total: number; pages: number }> {
  const qs = new URLSearchParams({ limit: '50' });
  if (params?.search) qs.set('search', params.search);
  if (params?.page) qs.set('page', String(params.page));
  const r = await adminApi(`/api/admin/reversals?${qs}`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ reversals: ReversalRecord[]; total: number; pages: number }>;
}
export async function apiGetServiceSettings(): Promise<{ services: ServiceSetting[] }> {
  const r = await adminApi('/api/admin/services/settings');
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ services: ServiceSetting[] }>;
}
export async function apiUpdateServiceSetting(key: string, updates: { enabled?: boolean; markup?: number | null; notes?: string }): Promise<void> {
  const r = await adminApi(`/api/admin/services/${key}`, { method: 'PATCH', body: JSON.stringify(updates) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
}
export async function apiBroadcastNotification(title: string, body: string): Promise<{ sent: number }> {
  const r = await adminApi('/api/admin/notifications/broadcast', { method: 'POST', body: JSON.stringify({ title, body, type: 'system' }) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ sent: number }>;
}
export async function apiSendTargetedNotification(userIds: string[], title: string, body: string): Promise<{ sent: number }> {
  const r = await adminApi('/api/admin/notifications/targeted', { method: 'POST', body: JSON.stringify({ userIds, title, body, type: 'system' }) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ sent: number }>;
}
export async function apiGetNotificationHistory(page = 1): Promise<{ notifications: NotificationHistoryEntry[]; total: number; pages: number }> {
  const r = await adminApi(`/api/admin/notifications/history?page=${page}&limit=50`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ notifications: NotificationHistoryEntry[]; total: number; pages: number }>;
}
export async function apiGetFinancialReport(from?: string, to?: string): Promise<FinancialReport> {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from); if (to) qs.set('to', to);
  const r = await adminApi(`/api/admin/reports/financial?${qs}`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<FinancialReport>;
}
export async function apiGetSystemSettings(): Promise<{ settings: Record<string, SystemSettingValue> }> {
  const r = await adminApi('/api/admin/settings');
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ settings: Record<string, SystemSettingValue> }>;
}
export async function apiUpdateSystemSetting(key: string, value: string): Promise<void> {
  const r = await adminApi('/api/admin/settings', { method: 'PATCH', body: JSON.stringify({ key, value }) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
}
export async function apiGetIntegrations(): Promise<{ integrations: Integration[] }> {
  const r = await adminApi('/api/admin/integrations');
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ integrations: Integration[] }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW API FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetDashboardExtended(): Promise<DashboardExtended> {
  const r = await adminApi('/api/admin/dashboard/extended');
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<DashboardExtended>;
}
export async function apiGetUserLoginHistory(userId: string): Promise<{ history: UserLoginHistoryEntry[] }> {
  const r = await adminApi(`/api/admin/users/${userId}/login-history`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ history: UserLoginHistoryEntry[] }>;
}

// Staff
export async function apiGetStaff(): Promise<{ staff: StaffMember[] }> {
  const r = await adminApi('/api/admin/staff');
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ staff: StaffMember[] }>;
}
export async function apiCreateStaff(data: Partial<StaffMember>): Promise<StaffMember> {
  const r = await adminApi('/api/admin/staff', { method: 'POST', body: JSON.stringify(data) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<StaffMember>;
}
export async function apiUpdateStaff(id: string, data: Partial<StaffMember>): Promise<StaffMember> {
  const r = await adminApi(`/api/admin/staff/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<StaffMember>;
}
export async function apiDeleteStaff(id: string): Promise<void> {
  const r = await adminApi(`/api/admin/staff/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
}
export async function apiGetStaffAttendance(staffId: string, month?: string): Promise<{ attendance: StaffAttendanceRecord[] }> {
  const qs = month ? `?month=${month}` : '';
  const r = await adminApi(`/api/admin/staff/${staffId}/attendance${qs}`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ attendance: StaffAttendanceRecord[] }>;
}
export async function apiMarkAttendance(staffId: string, data: { date: string; status: string; checkIn?: string; checkOut?: string; notes?: string }): Promise<void> {
  const r = await adminApi(`/api/admin/staff/${staffId}/attendance`, { method: 'POST', body: JSON.stringify(data) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
}
export async function apiGetStaffActivityLogs(staffId: string): Promise<{ logs: StaffActivityEntry[] }> {
  const r = await adminApi(`/api/admin/staff/${staffId}/activity`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ logs: StaffActivityEntry[] }>;
}

// Pricing
export async function apiGetPricing(serviceType?: string): Promise<{ rules: PricingRule[] }> {
  const qs = serviceType ? `?serviceType=${serviceType}` : '';
  const r = await adminApi(`/api/admin/pricing${qs}`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ rules: PricingRule[] }>;
}
export async function apiUpdatePricingRule(id: string, data: { sellingPrice?: number; costPrice?: number; markupPercent?: number; enabled?: boolean; planName?: string }): Promise<PricingRule> {
  const r = await adminApi(`/api/admin/pricing/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<PricingRule>;
}
export async function apiBulkUpdatePricing(rules: { id: string; sellingPrice?: number; costPrice?: number; markupPercent?: number; enabled?: boolean }[]): Promise<{ updated: number }> {
  const r = await adminApi('/api/admin/pricing/bulk', { method: 'PATCH', body: JSON.stringify({ rules }) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ updated: number }>;
}
export async function apiCreatePricingRule(data: Omit<PricingRule, 'id' | 'updatedAt' | 'createdAt'>): Promise<PricingRule> {
  const r = await adminApi('/api/admin/pricing', { method: 'POST', body: JSON.stringify(data) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<PricingRule>;
}
export async function apiDeletePricingRule(id: string): Promise<void> {
  const r = await adminApi(`/api/admin/pricing/${id}`, { method: 'DELETE' });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
}

// API Management
export async function apiGetApiConfigs(): Promise<{ apis: ApiConfig[] }> {
  const r = await adminApi('/api/admin/api-management/configs');
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ apis: ApiConfig[] }>;
}
export async function apiUpdateApiConfig(key: string, data: { enabled?: boolean; fields?: Record<string, string> }): Promise<void> {
  const r = await adminApi(`/api/admin/api-management/configs/${key}`, { method: 'PATCH', body: JSON.stringify(data) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
}
export async function apiCheckApiStatus(): Promise<{ results: { key: string; label: string; status: string; latency: number | null; checkedAt: string }[] }> {
  const r = await adminApi('/api/admin/api-management/status');
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ results: { key: string; label: string; status: string; latency: number | null; checkedAt: string }[] }>;
}
export async function apiGetApiErrorLogs(params?: { api?: string; page?: number }): Promise<{ logs: ApiLogEntry[]; total: number; pages: number }> {
  const qs = new URLSearchParams({ limit: '50' });
  if (params?.api) qs.set('api', params.api);
  if (params?.page) qs.set('page', String(params.page));
  const r = await adminApi(`/api/admin/api-management/logs/errors?${qs}`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ logs: ApiLogEntry[]; total: number; pages: number }>;
}
export async function apiGetApiTransactionLogs(params?: { api?: string; page?: number }): Promise<{ logs: ApiLogEntry[]; total: number; pages: number }> {
  const qs = new URLSearchParams({ limit: '50' });
  if (params?.api) qs.set('api', params.api);
  if (params?.page) qs.set('page', String(params.page));
  const r = await adminApi(`/api/admin/api-management/logs/transactions?${qs}`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ logs: ApiLogEntry[]; total: number; pages: number }>;
}

// Finance
export async function apiGetFundingRequests(params?: { status?: string; page?: number }): Promise<{ requests: FundingRequest[]; total: number; pages: number }> {
  const qs = new URLSearchParams({ limit: '25' });
  if (params?.status && params.status !== 'all') qs.set('status', params.status);
  if (params?.page) qs.set('page', String(params.page));
  const r = await adminApi(`/api/admin/finance/funding-requests?${qs}`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ requests: FundingRequest[]; total: number; pages: number }>;
}
export async function apiGetFundingStats(): Promise<FundingStats> {
  const r = await adminApi('/api/admin/finance/funding-stats');
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<FundingStats>;
}
export async function apiApproveFunding(id: string): Promise<{ ok: boolean; balanceAfter: number }> {
  const r = await adminApi(`/api/admin/finance/funding-requests/${id}/approve`, { method: 'POST' });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ ok: boolean; balanceAfter: number }>;
}
export async function apiRejectFunding(id: string, reason: string): Promise<void> {
  const r = await adminApi(`/api/admin/finance/funding-requests/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
}
export async function apiGetFundingHistory(params?: { page?: number }): Promise<{ history: FundingRequest[]; total: number; pages: number }> {
  const qs = new URLSearchParams({ limit: '25', status: 'approved' });
  if (params?.page) qs.set('page', String(params.page));
  const r = await adminApi(`/api/admin/finance/funding-requests?${qs}`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  const data = await r.json() as { requests: FundingRequest[]; total: number; pages: number };
  return { history: data.requests, total: data.total, pages: data.pages };
}

// Security
export async function apiGetAdminLoginHistory(params?: { page?: number }): Promise<{ history: AdminLoginHistoryEntry[]; total: number; pages: number }> {
  const qs = new URLSearchParams({ limit: '50' });
  if (params?.page) qs.set('page', String(params.page));
  const r = await adminApi(`/api/admin/security/login-history?${qs}`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ history: AdminLoginHistoryEntry[]; total: number; pages: number }>;
}
export async function apiGetActiveSessions(): Promise<{ sessions: AdminSessionRecord[] }> {
  const r = await adminApi('/api/admin/security/sessions');
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ sessions: AdminSessionRecord[] }>;
}
export async function apiRevokeSession(id: string): Promise<void> {
  const r = await adminApi(`/api/admin/security/sessions/${id}/revoke`, { method: 'POST' });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
}
export async function apiGet2FAStatus(): Promise<{ enabled: boolean; setupAt: string | null }> {
  const r = await adminApi('/api/admin/security/2fa/status');
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ enabled: boolean; setupAt: string | null }>;
}
export async function apiSetup2FA(): Promise<{ qrDataUrl: string; secret: string }> {
  const r = await adminApi('/api/admin/security/2fa/setup', { method: 'POST' });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ qrDataUrl: string; secret: string }>;
}
export async function apiVerify2FA(token: string): Promise<{ ok: boolean }> {
  const r = await adminApi('/api/admin/security/2fa/verify', { method: 'POST', body: JSON.stringify({ token }) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ ok: boolean }>;
}
export async function apiGetAuditLogs(params?: { page?: number; action?: string }): Promise<{ logs: { id: string; adminEmail: string; action: string; targetLabel: string | null; details: unknown; ip: string | null; createdAt: string }[]; total: number; pages: number }> {
  const qs = new URLSearchParams({ limit: '50' });
  if (params?.page) qs.set('page', String(params.page));
  if (params?.action) qs.set('action', params.action);
  const r = await adminApi(`/api/admin/audit-logs?${qs}`);
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ logs: { id: string; adminEmail: string; action: string; targetLabel: string | null; details: unknown; ip: string | null; createdAt: string }[]; total: number; pages: number }>;
}

// Staff Notifications
export async function apiSendStaffNotification(staffIds: string[], title: string, body: string): Promise<{ sent: number }> {
  const r = await adminApi('/api/admin/notifications/staff', { method: 'POST', body: JSON.stringify({ staffIds, title, body }) });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ sent: number }>;
}

// ── Client-side Export Utilities ─────────────────────────────────────────────
export function exportToCsv(data: Record<string, unknown>[], filename: string): void {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => headers.map(h => {
    const v = row[h]; const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export function exportToHtmlPrint(title: string, data: Record<string, unknown>[], filename: string): void {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const rows = data.map(row => `<tr>${headers.map(h => `<td>${row[h] ?? ''}</td>`).join('')}</tr>`).join('');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>body{font-family:sans-serif;font-size:12px;padding:20px}table{width:100%;border-collapse:collapse;margin-top:12px}
  th,td{border:1px solid #ddd;padding:6px 10px;text-align:left}th{background:#0f2d52;color:#fff}
  tr:nth-child(even){background:#f8fafc}h2{color:#0f2d52;margin:0}p{color:#666;font-size:11px;margin:4px 0 12px}
  .btn{background:#0f2d52;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;margin-bottom:12px}
  @media print{.btn{display:none}}</style></head>
  <body><h2>${title}</h2><p>Generated: ${new Date().toLocaleString('en-NG')}</p>
  <button class="btn" onclick="window.print()">Print / Save as PDF</button>
  <table><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
  <tbody>${rows}</tbody></table></body></html>`;
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) { const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); }
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}
