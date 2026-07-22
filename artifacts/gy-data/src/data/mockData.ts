// ── Frontend types ─────────────────────────────────────────────────────────────
// These match the shapes returned by the API and held in AppContext state.
// No mock/demo data lives here — all data comes from the real backend.

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
  createdAt: string;    // ISO timestamp
}

export interface Transaction {
  id: string;
  type: 'data' | 'airtime' | 'electricity' | 'cable' | 'betting' | 'exam' | 'wallet_fund';
  service: string;
  provider: string;
  amount: number;
  date: string;         // human-readable e.g. "Today", "Yesterday", "12 Jul"
  time: string;         // e.g. "03:45 PM"
  status: 'success' | 'pending' | 'failed';
  description: string;
  paymentMethod?: string;
}

export interface Notification {
  id: string;
  type: 'transaction' | 'promo' | 'system' | 'security';
  title: string;
  body: string;
  timestamp: string;    // relative e.g. "Just now", "2h ago"
  read: boolean;
}
