/**
 * adminMockData.ts
 *
 * Shared types, constants, and configuration for the admin dashboard.
 *
 * ⚠️  All aggregate statistics (user counts, revenue figures, transaction
 * totals, service breakdowns, weekly charts) are now fetched from the real
 * backend via /api/admin/* endpoints.  Only the following are defined here:
 *   • TypeScript interfaces used across admin pages
 *   • Admin account management data (in-memory, not yet backed by DB)
 *   • Role configuration (labels, colours, permissions)
 *   • Service display config (icon/colour metadata, not counts)
 *   • Announcement seed data (in-memory; real push backend TBD)
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
  day:    string;   // e.g. "Mon"
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

// ── Admin credentials (frontend validation — keep in sync with backend env vars) ──
export const adminCredentials = {
  email: 'admin@gyd.com',
  pin:   '125125',
};

// ── Admin account management ──────────────────────────────────────────────────

export type AdminRole = 'super_admin' | 'admin' | 'support';

export interface AdminAccount {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  status: 'active' | 'disabled';
  createdAt: string;
  lastLogin: string;
  /** PIN stored in memory only — never rendered in plain text */
  pin: string;
  /** When true this account cannot be deleted, disabled, or demoted */
  isSuperAdmin: boolean;
}

export const ROLE_LABELS: Record<AdminRole, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  support:     'Support',
};

export const ROLE_COLORS: Record<AdminRole, { bg: string; text: string; border: string }> = {
  super_admin: { bg: 'rgba(234,179,8,0.12)',   text: '#CA8A04', border: 'rgba(234,179,8,0.3)' },
  admin:       { bg: 'rgba(59,130,246,0.12)',  text: '#3B82F6', border: 'rgba(59,130,246,0.3)' },
  support:     { bg: 'rgba(16,185,129,0.12)',  text: '#10B981', border: 'rgba(16,185,129,0.3)' },
};

export const ROLE_PERMISSIONS: Record<AdminRole, string[]> = {
  super_admin: ['Dashboard', 'Users', 'Transactions', 'Wallet', 'Services', 'Announcements', 'Settings', 'Admin Management'],
  admin:       ['Dashboard', 'Users', 'Transactions', 'Wallet', 'Services', 'Announcements'],
  support:     ['Dashboard', 'Users (View only)', 'Transactions (View only)'],
};

/** Initial admin accounts — stored in-memory until admin management is backend-backed. */
export const adminAccounts: AdminAccount[] = [
  {
    id: 'ADM-001', name: 'Super Admin', email: 'admin@gyd.com',
    role: 'super_admin', status: 'active',
    createdAt: 'Jan 1, 2024', lastLogin: 'Today',
    pin: '125125', isSuperAdmin: true,
  },
];

// ── Service display configuration ─────────────────────────────────────────────
// Contains only visual metadata (icon/colour).  Actual counts and revenue
// come from GET /api/admin/services.

export const SERVICE_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  data:        { label: 'Data',        icon: '📶', color: '#3B82F6' },
  airtime:     { label: 'Airtime',     icon: '📞', color: '#10B981' },
  electricity: { label: 'Electricity', icon: '⚡', color: '#F59E0B' },
  cable:       { label: 'Cable TV',    icon: '📺', color: '#8B5CF6' },
  betting:     { label: 'Betting',     icon: '🎯', color: '#EF4444' },
  exam:        { label: 'Exam Pins',   icon: '📝', color: '#14B8A6' },
};

// ── Announcement seed data (in-memory) ────────────────────────────────────────
export const adminAnnouncements: Announcement[] = [
  {
    id: 'ANN-001',
    title: '🎉 Welcome to GY DATA',
    body: 'GY DATA is now live! Buy data, airtime, pay bills and more at the best prices.',
    target: 'all', status: 'sent',
    sentAt: new Date().toLocaleString(), recipients: 0,
  },
];
