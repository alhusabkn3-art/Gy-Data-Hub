// ── Types only — no mock/demo data ────────────────────────────────────────────
// All user data lives in localStorage, managed exclusively by AppContext.
// Storage keys:
//   "gyd_accounts"  →  StoredAccount[]
//   "gyd_session"   →  { userId: string }

export interface User {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;        // 11-digit Nigerian format e.g. "08031234567"
  accountNumber: string;
  bankName: string;
  referralCode: string;
  kycStatus: 'unverified' | 'pending' | 'verified';
  createdAt: string;
}

export interface Transaction {
  id: string;
  type: 'data' | 'airtime' | 'electricity' | 'cable' | 'betting' | 'exam' | 'wallet_fund';
  service: string;
  provider: string;
  amount: number;
  date: string;
  time: string;
  status: 'success' | 'pending' | 'failed';
  description: string;
  paymentMethod?: string;
}

export interface Notification {
  id: string;
  type: 'transaction' | 'promo' | 'system' | 'security';
  title: string;
  body: string;
  timestamp: string;
  read: boolean;
}

// ── Internal localStorage shape (used only by AppContext) ─────────────────────
export interface StoredAccount extends User {
  pin: string;
  balance: number;
  transactions: Transaction[];
  notifications: Notification[];
}
