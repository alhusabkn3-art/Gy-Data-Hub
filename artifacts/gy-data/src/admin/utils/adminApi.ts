/**
 * adminApi.ts — typed API client for super-admin endpoints.
 *
 * Used by individual super-admin pages that manage their own local state.
 * The base `adminApi` helper matches the pattern used in AdminContext.tsx.
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

// ── Types ──────────────────────────────────────────────────────────────────

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

// ── API functions ──────────────────────────────────────────────────────────

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
  const r = await adminApi(`/api/admin/users/${userId}/wallet/credit`, {
    method: 'POST', body: JSON.stringify({ amount, reason }),
  });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ ok: boolean; reference: string; balanceBefore: number; balanceAfter: number }>;
}

export async function apiDebitWallet(userId: string, amount: number, reason: string): Promise<{ ok: boolean; reference: string; balanceBefore: number; balanceAfter: number }> {
  const r = await adminApi(`/api/admin/users/${userId}/wallet/debit`, {
    method: 'POST', body: JSON.stringify({ amount, reason }),
  });
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
  const r = await adminApi(`/api/admin/users/${userId}/status`, {
    method: 'POST', body: JSON.stringify({ status, reason }),
  });
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
  const r = await adminApi(`/api/admin/transactions/${txId}/mark-review`, {
    method: 'POST', body: JSON.stringify({ note }),
  });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
}

export async function apiReverseTransaction(txId: string, reason: string): Promise<{ reference: string; amount: number }> {
  const r = await adminApi(`/api/admin/transactions/${txId}/reverse`, {
    method: 'POST', body: JSON.stringify({ reason }),
  });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ reference: string; amount: number }>;
}

export async function apiGetReversals(params?: { search?: string; page?: number }): Promise<{ reversals: ReversalRecord[]; total: number; pages: number }> {
  const qs = new URLSearchParams({ limit: '50' });
  if (params?.search) qs.set('search', params.search);
  if (params?.page)   qs.set('page',   String(params.page));
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
  const r = await adminApi(`/api/admin/services/${key}`, {
    method: 'PATCH', body: JSON.stringify(updates),
  });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
}

export async function apiBroadcastNotification(title: string, body: string): Promise<{ sent: number }> {
  const r = await adminApi('/api/admin/notifications/broadcast', {
    method: 'POST', body: JSON.stringify({ title, body, type: 'system' }),
  });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ sent: number }>;
}

export async function apiSendTargetedNotification(userIds: string[], title: string, body: string): Promise<{ sent: number }> {
  const r = await adminApi('/api/admin/notifications/targeted', {
    method: 'POST', body: JSON.stringify({ userIds, title, body, type: 'system' }),
  });
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
  if (from) qs.set('from', from);
  if (to)   qs.set('to', to);
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
  const r = await adminApi('/api/admin/settings', {
    method: 'PATCH', body: JSON.stringify({ key, value }),
  });
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
}

export async function apiGetIntegrations(): Promise<{ integrations: Integration[] }> {
  const r = await adminApi('/api/admin/integrations');
  if (!r.ok) throw new Error((await r.json() as { error?: string }).error ?? 'Failed');
  return r.json() as Promise<{ integrations: Integration[] }>;
}
