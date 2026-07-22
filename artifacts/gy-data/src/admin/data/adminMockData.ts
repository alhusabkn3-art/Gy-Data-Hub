/**
 * adminTypes.ts  (kept as adminMockData.ts for import compatibility)
 *
 * Shared TypeScript interfaces, role configuration, and service display
 * metadata for the GY DATA admin dashboard.
 *
 * All live data (stats, users, transactions, revenue, services) is fetched
 * from the real backend at /api/admin/*.  This file contains NO hardcoded
 * fake records, fake statistics, or placeholder production data.
 *
 * In-memory state:
 *   • Admin account management — stored in AdminContext React state.
 *     The logged-in super admin record is populated from the live session.
 *   • Announcements — stored in AdminContext React state.
 *     Starts empty; records are created by the logged-in admin at runtime.
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

// (Admin credentials are validated server-side via POST /api/admin/session.
//  They are NOT stored in client code.)

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

/**
 * Initial admin accounts — stored in React state in AdminContext.
 * The super admin entry is populated with real email + PIN from the live
 * login session (set by adminLogin in AdminContext).  This seed is a
 * structural placeholder only — no credentials are hardcoded here.
 */
export const adminAccounts: AdminAccount[] = [
  {
    id: 'ADM-001', name: 'Super Admin', email: '',
    role: 'super_admin', status: 'active',
    createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    lastLogin: 'Just now',
    pin: '',          // populated from live login session in AdminContext
    isSuperAdmin: true,
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

// ── Announcements — starts empty; created by admin at runtime ─────────────────
export const adminAnnouncements: Announcement[] = [];
