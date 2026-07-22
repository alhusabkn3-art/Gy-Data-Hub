/**
 * adminTypes.ts  (kept as adminMockData.ts for import compatibility)
 *
 * Shared TypeScript interfaces, role configuration, and service display
 * metadata for the GY DATA admin dashboard.
 *
 * All live data (stats, users, transactions, revenue, services, admin accounts,
 * audit logs) is fetched from the real backend at /api/admin/*.
 * This file contains NO hardcoded fake records, fake statistics, or
 * placeholder production data.
 */

// ── Customer-facing data shapes ───────────────────────────────────────────────

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  balance: number;
  status: 'active' | 'suspended' | 'pending';
  kycStatus: 'verified' | 'pending' | 'failed' | 'unverified';
  joinedDate: string;
  transactionCount: number;
  totalSpent: number;
  referralCode: string;
  bankName: string;
  accountNumber: string;
}

export interface AdminTransaction {
  id: string;
  userId: string;
  userName: string;
  phone?: string;
  type: 'data' | 'airtime' | 'electricity' | 'cable' | 'betting' | 'exam' | 'wallet_fund';
  service: string;
  provider: string;
  amount: number;
  date: string;
  time: string;
  status: 'success' | 'pending' | 'failed';
  description: string;
  reference: string;
}

/** Shape returned by GET /api/admin/stats */
export interface AdminStats {
  totalUsers:             number;
  activeUsers:            number;
  suspendedUsers:         number;
  verifiedUsers:          number;
  pendingKycUsers:        number;
  unverifiedUsers:        number;
  totalTransactions:      number;
  successfulTransactions: number;
  pendingTransactions:    number;
  failedTransactions:     number;
  totalRevenue:           number;
  todayRevenue:           number;
  weekRevenue:            number;
  monthRevenue:           number;
  totalWalletBalance:     number;
  avgTransactionValue:    number;
}

/** Shape returned by GET /api/admin/revenue/weekly */
export interface WeeklyRevenue {
  day:    string;
  amount: number;
}

/** Shape returned by GET /api/admin/services */
export interface ServiceBreakdown {
  type:        string;
  total:       number;
  successful:  number;
  pending:     number;
  failed:      number;
  revenue:     number;
  successRate: number;
}

export interface Announcement {
  id: string;
  title: string;
  body: string;
  target: 'all' | 'verified' | 'unverified';
  status: 'sent' | 'draft' | 'scheduled';
  sentAt: string;
  recipients: number;
}

// ── Admin account management ──────────────────────────────────────────────────
// AdminRole is enforced server-side; the frontend uses it for UI gating only.

export type AdminRole = 'super_admin' | 'admin';

export interface AdminAccount {
  id:          string;
  name:        string;
  email:       string;
  role:        AdminRole;
  status:      'active' | 'disabled';
  createdAt:   string;
  lastLogin:   string;
  /** isSuperAdmin = role === 'super_admin'. Cannot be deleted or demoted. */
  isSuperAdmin: boolean;
}

export interface AuditLogEntry {
  id:          string;
  adminId:     string;
  adminEmail:  string;
  action:      string;
  targetType:  string | null;
  targetId:    string | null;
  targetLabel: string | null;
  details:     Record<string, unknown> | null;
  ip:          string | null;
  createdAt:   string;
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
};

export const ROLE_COLORS: Record<AdminRole, { bg: string; text: string; border: string }> = {
  super_admin: { bg: 'rgba(234,179,8,0.12)',  text: '#CA8A04', border: 'rgba(234,179,8,0.3)' },
  admin:       { bg: 'rgba(59,130,246,0.12)', text: '#3B82F6', border: 'rgba(59,130,246,0.3)' },
};

export const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  super_admin: [
    'Dashboard', 'Users', 'Transactions', 'Wallet', 'Services',
    'Announcements', 'Admin Management', 'Audit Logs', 'Settings',
  ],
  admin: ['Dashboard', 'Users', 'Transactions', 'Wallet', 'Services', 'Announcements'],
};

// ── Announcements — starts empty; created by admin at runtime ─────────────────
export const adminAnnouncements: Announcement[] = [];

// ── Service display configuration ─────────────────────────────────────────────
// Visual metadata only (icon/colour). Counts and revenue come from the API.

export const SERVICE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  data:        { label: 'Data',        icon: '📶', color: '#3B82F6' },
  airtime:     { label: 'Airtime',     icon: '📞', color: '#10B981' },
  electricity: { label: 'Electricity', icon: '⚡', color: '#F59E0B' },
  cable:       { label: 'Cable TV',    icon: '📺', color: '#8B5CF6' },
  betting:     { label: 'Betting',     icon: '🎯', color: '#EF4444' },
  exam:        { label: 'Exam Pins',   icon: '📝', color: '#14B8A6' },
};
