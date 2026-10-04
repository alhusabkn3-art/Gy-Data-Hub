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

export interface AdminNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  priority: string;
  isRead: boolean;
  createdAt: string;
}

export interface AdminAuditLog {
  id: string;
  adminId: string | null;
  adminEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  details: unknown;
  ipAddress: string | null;
  createdAt: string;
}

export interface Announcement {
  id: string;
  title: string;
  message: string;
  target: string;
  status: string;
  createdAt: string;
  updatedAt: string | null;
}

export interface AdminAccount {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface FinanceSummary {
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
  totalFunding: number;
  totalWithdrawals: number;
  totalTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  pendingTransactions: number;
  todayRevenue: number;
  todayCost: number;
  todayProfit: number;
  todayTransactions: number;
  [key: string]: unknown;
}

export interface SmeApiCreditBalance {
  balance: number;
  currency?: string;
  updatedAt?: string | null;
  [key: string]: unknown;
}

export interface CashbackSummary {
  totalCashback: number;
  pendingCashback: number;
  paidCashback: number;
  usersWithCashback: number;
  [key: string]: unknown;
}

export interface CashbackRecord {
  id: string;
  userId: string;
  transactionId: string | null;
  amount: number;
  percentage: number | null;
  status: string;
  createdAt: string;
  paidAt: string | null;
  [key: string]: unknown;
}

export interface SupportTicket {
  id: string;
  userId: string | null;
  subject: string;
  message: string;
  status: string;
  priority: string;
  assignedTo: string | null;
  createdAt: string;
  updatedAt: string | null;
  [key: string]: unknown;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  senderId: string | null;
  senderType: string;
  message: string;
  createdAt: string;
  [key: string]: unknown;
}

export interface AdminService {
  id: string;
  name: string;
  slug: string;
  category: string;
  enabled: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string | null;
  [key: string]: unknown;
}

export interface ApiIntegration {
  id: string;
  name: string;
  provider: string;
  status: string;
  enabled: boolean;
  balance: number | null;
  lastCheckedAt: string | null;
  createdAt: string;
  updatedAt: string | null;
  [key: string]: unknown;
}

export interface ApiProvider {
  id: string;
  name: string;
  slug: string;
  type: string;
  enabled: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string | null;
  [key: string]: unknown;
}

export interface SecurityEvent {
  id: string;
  type: string;
  severity: string;
  description: string;
  userId: string | null;
  adminId: string | null;
  ipAddress: string | null;
  createdAt: string;
  [key: string]: unknown;
}

export interface SecuritySummary {
  totalEvents: number;
  criticalEvents: number;
  highEvents: number;
  mediumEvents: number;
  lowEvents: number;
  [key: string]: unknown;
}

export interface WalletManagementRecord {
  id: string;
  userId: string;
  userName?: string | null;
  userPhone?: string | null;
  balance: number;
  currency: string;
  status: string;
  createdAt: string;
  updatedAt: string | null;
  [key: string]: unknown;
}

export interface WalletAdjustment {
  id: string;
  walletId: string;
  userId: string;
  amount: number;
  type: string;
  reason: string | null;
  adminId: string | null;
  createdAt: string;
  [key: string]: unknown;
}

export interface RefundRecord {
  id: string;
  transactionId: string;
  userId: string;
  amount: number;
  reason: string | null;
  status: string;
  createdAt: string;
  updatedAt: string | null;
  [key: string]: unknown;
}

export interface ReversalResponse {
  reversal: ReversalRecord;
  message?: string;
}

export interface PaginatedUsers {
  users: UserFullProfile[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PaginatedTransactions {
  transactions: UserTransaction[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PaginatedAuditLogs {
  logs: AdminAuditLog[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PaginatedStaff {
  staff: StaffMember[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PaginatedSupportTickets {
  tickets: SupportTicket[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface PaginatedWallets {
  wallets: WalletManagementRecord[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface AdminDashboardResponse {
  dashboard: DashboardExtended;
  [key: string]: unknown;
}

export interface UserDetailsResponse {
  user: UserFullProfile;
  wallet?: WalletSummary | null;
  transactions?: UserTransaction[];
  [key: string]: unknown;
}

export interface StaffDetailsResponse {
  staff: StaffMember;
  attendance?: StaffAttendanceRecord[];
  activity?: StaffActivityEntry[];
  [key: string]: unknown;
}

export interface SupportTicketDetailsResponse {
  ticket: SupportTicket;
  messages: SupportMessage[];
  [key: string]: unknown;
}

export interface LoginHistoryResponse {
  history: UserLoginHistoryEntry[];
}

export interface ApiResponse<T = unknown> {
  data?: T;
  message?: string;
  error?: string;
  [key: string]: unknown;
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetDashboard(): Promise<DashboardExtended> {
  const r = await adminApi('/api/admin/dashboard');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed to load dashboard'
    );
  }

  const data = await r.json() as DashboardExtended & {
    dashboard?: DashboardExtended;
  };

  return data.dashboard ?? data;
}

export async function apiGetFinanceSummary(): Promise<FinanceSummary> {
  const r = await adminApi('/api/admin/finance/summary');

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed to load finance summary'
    );
  }

  return r.json() as Promise<FinanceSummary>;
}

// ══════════════════════════════════════════════════════════════════════════════
// USERS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetUsers(
  params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  } = {}
): Promise<PaginatedUsers> {
  const qs = new URLSearchParams();

  if (params.page !== undefined) {
    qs.set('page', String(params.page));
  }

  if (params.limit !== undefined) {
    qs.set('limit', String(params.limit));
  }

  if (params.search) {
    qs.set('search', params.search);
  }

  if (params.status && params.status !== 'all') {
    qs.set('status', params.status);
  }

  const query = qs.toString();
  const r = await adminApi(
    `/api/admin/users${query ? `?${query}` : ''}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed to load users'
    );
  }

  return r.json() as Promise<PaginatedUsers>;
}

export async function apiGetUser(
  userId: string
): Promise<UserFullProfile> {
  const r = await adminApi(
    `/api/admin/users/${userId}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed to load user'
    );
  }

  const data = await r.json() as UserDetailsResponse | UserFullProfile;

  if ('user' in data && data.user) {
    return data.user;
  }

  return data as UserFullProfile;
}

export async function apiGetUserDetails(
  userId: string
): Promise<UserDetailsResponse> {
  const r = await adminApi(
    `/api/admin/users/${userId}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed to load user'
    );
  }

  const data = await r.json() as UserDetailsResponse;

  if ('user' in data) {
    return data;
  }

  return {
    user: data as unknown as UserFullProfile,
  };
}

export async function apiUpdateUser(
  userId: string,
  data: Partial<UserFullProfile> & Record<string, unknown>
): Promise<UserFullProfile> {
  const r = await adminApi(
    `/api/admin/users/${userId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(data)
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed to update user'
    );
  }

  const result = await r.json() as UserFullProfile | UserDetailsResponse;

  if ('user' in result && result.user) {
    return result.user;
  }

  return result as UserFullProfile;
}

export async function apiDeleteUser(
  userId: string
): Promise<void> {
  const r = await adminApi(
    `/api/admin/users/${userId}`,
    {
      method: 'DELETE'
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed to delete user'
    );
  }
}

export async function apiGetUserLoginHistory(
  userId: string
): Promise<LoginHistoryResponse> {
  const r = await adminApi(
    `/api/admin/users/${userId}/login-history`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<LoginHistoryResponse>;
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
 * Resets the user's LOGIN PIN.
 *
 * The backend permanently replaces login_pin_hash and returns:
 * {
 *   pin: string,
 *   permanent: true,
 *   message: string
 * }
 *
 * The admin UI historically consumes `tempPin`, so this API client
 * intentionally normalizes the backend's `pin` into `tempPin` while
 * ALSO exposing the real `pin` and `permanent` values.
 *
 * This keeps every existing caller compatible and fixes the bug where
 * the UI received undefined because the backend returned `pin`.
 */
export async function apiResetLoginPin(
  userId: string
): Promise<{
  tempPin: string;
  pin: string;
  permanent: boolean;
  message: string;
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
      data.error ?? 'Failed to reset login PIN'
    );
  }

  const pin =
    typeof data.pin === 'string'
      ? data.pin
      : typeof data.tempPin === 'string'
        ? data.tempPin
        : '';

  if (!/^\d{6}$/.test(pin)) {
    throw new Error(
      'Login PIN reset succeeded but the server did not return a valid new PIN.'
    );
  }

  if (data.permanent !== true) {
    throw new Error(
      'Login PIN reset did not return permanent confirmation.'
    );
  }

  return {
    tempPin: pin,
    pin,
    permanent: true,
    message:
      data.message ??
      'Login PIN reset successfully. The new PIN is permanent.'
  };
}

/**
 * Resets the user's PURCHASE PIN.
 *
 * The backend permanently replaces purchase_pin_hash and returns:
 * {
 *   pin: string,
 *   permanent: true,
 *   message: string
 * }
 *
 * Normalize the response so existing admin UI code that reads
 * `tempPin` continues to work, while new code can use `pin`.
 */
export async function apiResetPurchasePin(
  userId: string
): Promise<{
  tempPin: string;
  pin: string;
  permanent: boolean;
  message: string;
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
      data.error ?? 'Failed to reset purchase PIN'
    );
  }

  const pin =
    typeof data.pin === 'string'
      ? data.pin
      : typeof data.tempPin === 'string'
        ? data.tempPin
        : '';

  if (!/^\d{6}$/.test(pin)) {
    throw new Error(
      'Purchase PIN reset succeeded but the server did not return a valid new PIN.'
    );
  }

  if (data.permanent !== true) {
    throw new Error(
      'Purchase PIN reset did not return permanent confirmation.'
    );
  }

  return {
    tempPin: pin,
    pin,
    permanent: true,
    message:
      data.message ??
      'Purchase PIN reset successfully. The new PIN is permanent.'
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetTransactions(
  params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
    type?: string;
    from?: string;
    to?: string;
  } = {}
): Promise<PaginatedTransactions> {
  const qs = new URLSearchParams();

  if (params.page !== undefined) {
    qs.set('page', String(params.page));
  }

  if (params.limit !== undefined) {
    qs.set('limit', String(params.limit));
  }

  if (params.search) {
    qs.set('search', params.search);
  }

  if (params.status && params.status !== 'all') {
    qs.set('status', params.status);
  }

  if (params.type && params.type !== 'all') {
    qs.set('type', params.type);
  }

  if (params.from) {
    qs.set('from', params.from);
  }

  if (params.to) {
    qs.set('to', params.to);
  }

  const query = qs.toString();

  const r = await adminApi(
    `/api/admin/transactions${query ? `?${query}` : ''}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed to load transactions'
    );
  }

  return r.json() as Promise<PaginatedTransactions>;
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

  const data = await r.json() as
    | TransactionDetail
    | { transaction: TransactionDetail };

  if ('transaction' in data && data.transaction) {
    return data.transaction;
  }

  return data as TransactionDetail;
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
): Promise<ReversalResponse> {
  const r = await adminApi(
    `/api/admin/transactions/${txId}/reverse`,
    {
      method: 'POST',
      body: JSON.stringify({ reason })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed to reverse transaction'
    );
  }

  return r.json() as Promise<ReversalResponse>;
}

export async function apiRefundTransaction(
  txId: string,
  reason: string
): Promise<RefundRecord> {
  const r = await adminApi(
    `/api/admin/transactions/${txId}/refund`,
    {
      method: 'POST',
      body: JSON.stringify({ reason })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed to refund transaction'
    );
  }

  const data = await r.json() as
    | RefundRecord
    | { refund: RefundRecord };

  if ('refund' in data && data.refund) {
    return data.refund;
  }

  return data as RefundRecord;
}

// ══════════════════════════════════════════════════════════════════════════════
// WALLETS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetWallet(
  userId: string
): Promise<WalletSummary> {
  const r = await adminApi(
    `/api/admin/users/${userId}/wallet`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed to load wallet'
    );
  }

  const data = await r.json() as
    | WalletSummary
    | { wallet: WalletSummary };

  if ('wallet' in data && data.wallet) {
    return data.wallet;
  }

  return data as WalletSummary;
}

export async function apiGetWalletLedger(
  userId: string,
  params: {
    page?: number;
    limit?: number;
  } = {}
): Promise<WalletLedgerEntry[]> {
  const qs = new URLSearchParams();

  if (params.page !== undefined) {
    qs.set('page', String(params.page));
  }

  if (params.limit !== undefined) {
    qs.set('limit', String(params.limit));
  }

  const query = qs.toString();

  const r = await adminApi(
    `/api/admin/users/${userId}/wallet/ledger${query ? `?${query}` : ''}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed to load wallet ledger'
    );
  }

  const data = await r.json() as
    | WalletLedgerEntry[]
    | { ledger: WalletLedgerEntry[] };

  if (Array.isArray(data)) {
    return data;
  }

  return data.ledger ?? [];
}

export async function apiAdjustWallet(
  userId: string,
  amount: number,
  reason: string
): Promise<WalletAdjustment> {
  const r = await adminApi(
    `/api/admin/users/${userId}/wallet/adjust`,
    {
      method: 'POST',
      body: JSON.stringify({
        amount,
        reason
      })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed to adjust wallet'
    );
  }

  const data = await r.json() as
    | WalletAdjustment
    | { adjustment: WalletAdjustment };

  if ('adjustment' in data && data.adjustment) {
    return data.adjustment;
  }

  return data as WalletAdjustment;
}

export async function apiGetWallets(
  params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  } = {}
): Promise<PaginatedWallets> {
  const qs = new URLSearchParams();

  if (params.page !== undefined) {
    qs.set('page', String(params.page));
  }

  if (params.limit !== undefined) {
    qs.set('limit', String(params.limit));
  }

  if (params.search) {
    qs.set('search', params.search);
  }

  if (params.status && params.status !== 'all') {
    qs.set('status', params.status);
  }

  const query = qs.toString();

  const r = await adminApi(
    `/api/admin/wallets${query ? `?${query}` : ''}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed to load wallets'
    );
  }

  return r.json() as Promise<PaginatedWallets>;
}

export async function apiGetWalletManagement(
  walletId: string
): Promise<WalletManagementRecord> {
  const r = await adminApi(
    `/api/admin/wallets/${walletId}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as
    | WalletManagementRecord
    | { wallet: WalletManagementRecord };

  if ('wallet' in data && data.wallet) {
    return data.wallet;
  }

  return data as WalletManagementRecord;
}

// ══════════════════════════════════════════════════════════════════════════════
// FINANCE
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetFinancialReport(
  params: {
    from?: string;
    to?: string;
  } = {}
): Promise<FinancialReport> {
  const qs = new URLSearchParams();

  if (params.from) {
    qs.set('from', params.from);
  }

  if (params.to) {
    qs.set('to', params.to);
  }

  const query = qs.toString();

  const r = await adminApi(
    `/api/admin/finance/report${query ? `?${query}` : ''}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed to load financial report'
    );
  }

  return r.json() as Promise<FinancialReport>;
}

export async function apiGetFinanceReports(
  params: {
    from?: string;
    to?: string;
    type?: string;
  } = {}
): Promise<FinancialReport> {
  const qs = new URLSearchParams();

  if (params.from) {
    qs.set('from', params.from);
  }

  if (params.to) {
    qs.set('to', params.to);
  }

  if (params.type) {
    qs.set('type', params.type);
  }

  const query = qs.toString();

  const r = await adminApi(
    `/api/admin/finance/reports${query ? `?${query}` : ''}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<FinancialReport>;
}

// ══════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetAuditLogs(
  params: {
    page?: number;
    limit?: number;
    search?: string;
    action?: string;
    from?: string;
    to?: string;
  } = {}
): Promise<PaginatedAuditLogs> {
  const qs = new URLSearchParams();

  if (params.page !== undefined) {
    qs.set('page', String(params.page));
  }

  if (params.limit !== undefined) {
    qs.set('limit', String(params.limit));
  }

  if (params.search) {
    qs.set('search', params.search);
  }

  if (params.action && params.action !== 'all') {
    qs.set('action', params.action);
  }

  if (params.from) {
    qs.set('from', params.from);
  }

  if (params.to) {
    qs.set('to', params.to);
  }

  const query = qs.toString();

  const r = await adminApi(
    `/api/admin/audit-logs${query ? `?${query}` : ''}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed to load audit logs'
    );
  }

  return r.json() as Promise<PaginatedAuditLogs>;
}

export async function apiGetAuditLog(
  id: string
): Promise<AdminAuditLog> {
  const r = await adminApi(
    `/api/admin/audit-logs/${id}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as
    | AdminAuditLog
    | { log: AdminAuditLog };

  if ('log' in data && data.log) {
    return data.log;
  }

  return data as AdminAuditLog;
}

// ══════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetNotifications(
  params: {
    page?: number;
    limit?: number;
  } = {}
): Promise<AdminNotification[]> {
  const qs = new URLSearchParams();

  if (params.page !== undefined) {
    qs.set('page', String(params.page));
  }

  if (params.limit !== undefined) {
    qs.set('limit', String(params.limit));
  }

  const query = qs.toString();

  const r = await adminApi(
    `/api/admin/notifications${query ? `?${query}` : ''}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as
    | AdminNotification[]
    | { notifications: AdminNotification[] };

  if (Array.isArray(data)) {
    return data;
  }

  return data.notifications ?? [];
}

export async function apiMarkNotificationRead(
  id: string
): Promise<void> {
  const r = await adminApi(
    `/api/admin/notifications/${id}/read`,
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

export async function apiMarkAllNotificationsRead(): Promise<void> {
  const r = await adminApi(
    '/api/admin/notifications/read-all',
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

export async function apiSendNotification(
  data: {
    title: string;
    body: string;
    recipientType: string;
    recipientIds?: string[];
  }
): Promise<void> {
  const r = await adminApi(
    '/api/admin/notifications',
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

// ══════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetAnnouncements(): Promise<Announcement[]> {
  const r = await adminApi(
    '/api/admin/announcements'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as
    | Announcement[]
    | { announcements: Announcement[] };

  if (Array.isArray(data)) {
    return data;
  }

  return data.announcements ?? [];
}

export async function apiCreateAnnouncement(
  data: {
    title: string;
    message: string;
    target?: string;
  }
): Promise<Announcement> {
  const r = await adminApi(
    '/api/admin/announcements',
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

  return r.json() as Promise<Announcement>;
}

export async function apiUpdateAnnouncement(
  id: string,
  data: Partial<Announcement>
): Promise<Announcement> {
  const r = await adminApi(
    `/api/admin/announcements/${id}`,
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

  return r.json() as Promise<Announcement>;
}

export async function apiDeleteAnnouncement(
  id: string
): Promise<void> {
  const r = await adminApi(
    `/api/admin/announcements/${id}`,
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
// STAFF
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetStaff(
  params: {
    page?: number;
    limit?: number;
    search?: string;
    status?: string;
  } = {}
): Promise<PaginatedStaff> {
  const qs = new URLSearchParams();

  if (params.page !== undefined) {
    qs.set('page', String(params.page));
  }

  if (params.limit !== undefined) {
    qs.set('limit', String(params.limit));
  }

  if (params.search) {
    qs.set('search', params.search);
  }

  if (params.status && params.status !== 'all') {
    qs.set('status', params.status);
  }

  const query = qs.toString();

  const r = await adminApi(
    `/api/admin/staff${query ? `?${query}` : ''}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<PaginatedStaff>;
}

export async function apiGetStaffMember(
  id: string
): Promise<StaffDetailsResponse> {
  const r = await adminApi(
    `/api/admin/staff/${id}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<StaffDetailsResponse>;
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
  params: {
    from?: string;
    to?: string;
  } = {}
): Promise<StaffAttendanceRecord[]> {
  const qs = new URLSearchParams();

  if (params.from) {
    qs.set('from', params.from);
  }

  if (params.to) {
    qs.set('to', params.to);
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

  if (Array.isArray(data)) {
    return data;
  }

  return data.attendance ?? [];
}

export async function apiGetStaffActivity(
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

  if (Array.isArray(data)) {
    return data;
  }

  return data.activity ?? [];
}

// ══════════════════════════════════════════════════════════════════════════════
// PRICING
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetPricingRules(): Promise<PricingRule[]> {
  const r = await adminApi(
    '/api/admin/pricing'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as
    | PricingRule[]
    | { rules: PricingRule[] };

  if (Array.isArray(data)) {
    return data;
  }

  return data.rules ?? [];
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

export async function apiUpdatePricingRule(
  id: string,
  data: Partial<PricingRule>
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
// SERVICES
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetServices(): Promise<AdminService[]> {
  const r = await adminApi(
    '/api/admin/services'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as
    | AdminService[]
    | { services: AdminService[] };

  if (Array.isArray(data)) {
    return data;
  }

  return data.services ?? [];
}

export async function apiUpdateService(
  id: string,
  data: Partial<AdminService>
): Promise<AdminService> {
  const r = await adminApi(
    `/api/admin/services/${id}`,
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

  return r.json() as Promise<AdminService>;
}

export async function apiGetServiceSettings(): Promise<ServiceSetting[]> {
  const r = await adminApi(
    '/api/admin/services/settings'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as
    | ServiceSetting[]
    | { settings: ServiceSetting[] };

  if (Array.isArray(data)) {
    return data;
  }

  return data.settings ?? [];
}

export async function apiUpdateServiceSetting(
  key: string,
  value: unknown
): Promise<ServiceSetting> {
  const r = await adminApi(
    `/api/admin/services/settings/${encodeURIComponent(key)}`,
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
// API INTEGRATIONS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetIntegrations(): Promise<ApiIntegration[]> {
  const r = await adminApi(
    '/api/admin/integrations'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as
    | ApiIntegration[]
    | { integrations: ApiIntegration[] };

  if (Array.isArray(data)) {
    return data;
  }

  return data.integrations ?? [];
}

export async function apiGetApiProviders(): Promise<ApiProvider[]> {
  const r = await adminApi(
    '/api/admin/api-providers'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as
    | ApiProvider[]
    | { providers: ApiProvider[] };

  if (Array.isArray(data)) {
    return data;
  }

  return data.providers ?? [];
}

export async function apiUpdateApiProvider(
  id: string,
  data: Partial<ApiProvider>
): Promise<ApiProvider> {
  const r = await adminApi(
    `/api/admin/api-providers/${id}`,
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

  return r.json() as Promise<ApiProvider>;
}

export async function apiTestIntegration(
  id: string
): Promise<ApiResponse> {
  const r = await adminApi(
    `/api/admin/integrations/${id}/test`,
    {
      method: 'POST'
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<ApiResponse>;
}

// ══════════════════════════════════════════════════════════════════════════════
// SME API CREDIT
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetSmeApiCredit(): Promise<SmeApiCreditBalance> {
  const r = await adminApi(
    '/api/admin/smeapi/credit'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as
    | SmeApiCreditBalance
    | { credit: SmeApiCreditBalance };

  if ('credit' in data && data.credit) {
    return data.credit;
  }

  return data as SmeApiCreditBalance;
}

export async function apiRefreshSmeApiCredit(): Promise<SmeApiCreditBalance> {
  const r = await adminApi(
    '/api/admin/smeapi/credit/refresh',
    {
      method: 'POST'
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as
    | SmeApiCreditBalance
    | { credit: SmeApiCreditBalance };

  if ('credit' in data && data.credit) {
    return data.credit;
  }

  return data as SmeApiCreditBalance;
}

// ══════════════════════════════════════════════════════════════════════════════
// CASHBACK
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetCashbackSummary(): Promise<CashbackSummary> {
  const r = await adminApi(
    '/api/admin/cashback/summary'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<CashbackSummary>;
}

export async function apiGetCashbackRecords(
  params: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  } = {}
): Promise<{
  records: CashbackRecord[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams();

  if (params.page !== undefined) {
    qs.set('page', String(params.page));
  }

  if (params.limit !== undefined) {
    qs.set('limit', String(params.limit));
  }

  if (params.status && params.status !== 'all') {
    qs.set('status', params.status);
  }

  if (params.search) {
    qs.set('search', params.search);
  }

  const query = qs.toString();

  const r = await adminApi(
    `/api/admin/cashback${query ? `?${query}` : ''}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    records: CashbackRecord[];
    page: number;
    limit: number;
    total: number;
    pages: number;
  }>;
}

export async function apiMarkCashbackPaid(
  id: string
): Promise<CashbackRecord> {
  const r = await adminApi(
    `/api/admin/cashback/${id}/pay`,
    {
      method: 'POST'
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<CashbackRecord>;
}

// ══════════════════════════════════════════════════════════════════════════════
// SUPPORT
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetSupportTickets(
  params: {
    page?: number;
    limit?: number;
    status?: string;
    priority?: string;
    search?: string;
  } = {}
): Promise<PaginatedSupportTickets> {
  const qs = new URLSearchParams();

  if (params.page !== undefined) {
    qs.set('page', String(params.page));
  }

  if (params.limit !== undefined) {
    qs.set('limit', String(params.limit));
  }

  if (params.status && params.status !== 'all') {
    qs.set('status', params.status);
  }

  if (params.priority && params.priority !== 'all') {
    qs.set('priority', params.priority);
  }

  if (params.search) {
    qs.set('search', params.search);
  }

  const query = qs.toString();

  const r = await adminApi(
    `/api/admin/support/tickets${query ? `?${query}` : ''}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<PaginatedSupportTickets>;
}

export async function apiGetSupportTicket(
  id: string
): Promise<SupportTicketDetailsResponse> {
  const r = await adminApi(
    `/api/admin/support/tickets/${id}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<SupportTicketDetailsResponse>;
}

export async function apiReplySupportTicket(
  ticketId: string,
  message: string
): Promise<SupportMessage> {
  const r = await adminApi(
    `/api/admin/support/tickets/${ticketId}/messages`,
    {
      method: 'POST',
      body: JSON.stringify({ message })
    }
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<SupportMessage>;
}

export async function apiUpdateSupportTicket(
  id: string,
  data: Partial<SupportTicket>
): Promise<SupportTicket> {
  const r = await adminApi(
    `/api/admin/support/tickets/${id}`,
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

  return r.json() as Promise<SupportTicket>;
}

// ══════════════════════════════════════════════════════════════════════════════
// SECURITY
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetSecuritySummary(): Promise<SecuritySummary> {
  const r = await adminApi(
    '/api/admin/security/summary'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<SecuritySummary>;
}

export async function apiGetSecurityEvents(
  params: {
    page?: number;
    limit?: number;
    severity?: string;
    type?: string;
  } = {}
): Promise<{
  events: SecurityEvent[];
  page: number;
  limit: number;
  total: number;
  pages: number;
}> {
  const qs = new URLSearchParams();

  if (params.page !== undefined) {
    qs.set('page', String(params.page));
  }

  if (params.limit !== undefined) {
    qs.set('limit', String(params.limit));
  }

  if (params.severity && params.severity !== 'all') {
    qs.set('severity', params.severity);
  }

  if (params.type && params.type !== 'all') {
    qs.set('type', params.type);
  }

  const query = qs.toString();

  const r = await adminApi(
    `/api/admin/security/events${query ? `?${query}` : ''}`
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  return r.json() as Promise<{
    events: SecurityEvent[];
    page: number;
    limit: number;
    total: number;
    pages: number;
  }>;
}

// ══════════════════════════════════════════════════════════════════════════════
// ADMIN ACCOUNTS
// ══════════════════════════════════════════════════════════════════════════════

export async function apiGetAdminAccounts(): Promise<AdminAccount[]> {
  const r = await adminApi(
    '/api/admin/accounts'
  );

  if (!r.ok) {
    throw new Error(
      (await r.json() as { error?: string }).error ?? 'Failed'
    );
  }

  const data = await r.json() as
    | AdminAccount[]
    | { accounts: AdminAccount[] };

  if (Array.isArray(data)) {
    return data;
  }

  return data.accounts ?? [];
}

export async function apiCreateAdminAccount(
  data: {
    name: string;
    email: string;
    phone?: string;
    role: string;
  }
): Promise<AdminAccount> {
  const r = await adminApi(
    '/api/admin/accounts',
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

  return r.json() as Promise<AdminAccount>;
}

export async function apiUpdateAdminAccount(
  id: string,
  data: Partial<AdminAccount>
): Promise<AdminAccount> {
  const r = await adminApi(
    `/api/admin/accounts/${id}`,
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

  return r.json() as Promise<AdminAccount>;
}

export async function apiDeleteAdminAccount(
  id: string
): Promise<void> {
  const r = await adminApi(
    `/api/admin/accounts/${id}`,
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
// EXPORT / PRINT HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function escapeHtml(
  value: unknown
): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function exportToCsv(
  filename: string,
  rows: Record<string, unknown>[]
): void {
  if (!rows.length) {
    return;
  }

  const columns = Object.keys(rows[0]);

  const escapeCsv = (
    value: unknown
  ): string => {
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
    columns.map(escapeCsv).join(','),
    ...rows.map(
      (row) =>
        columns
          .map(
            (column) =>
              escapeCsv(row[column])
          )
          .join(',')
    )
  ].join('\n');

  const blob = new Blob(
    [csv],
    {
      type: 'text/csv;charset=utf-8;'
    }
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

export function printTable(
  title: string,
  columns: string[],
  rows: Record<string, unknown>[]
): void {
  const tableHead = columns
    .map(
      (column) =>
        `<th>${escapeHtml(column)}</th>`
    )
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
