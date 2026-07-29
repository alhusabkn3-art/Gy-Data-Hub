import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Transaction, Notification } from '../data/mockData';

// ── API helper ────────────────────────────────────────────────────────────────
// Note: `headers` must be extracted before spreading `restOpts` so that
// spreading opts at the end does NOT overwrite the merged Content-Type header.
const api = (path: string, opts?: RequestInit) => {
  const { headers: extraHeaders, ...restOpts } = opts ?? {};
  return fetch(`/api${path}`, {
    credentials: 'include',
    ...restOpts,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) },
  });
};

// ── Transform raw DB rows → frontend shapes ───────────────────────────────────

function transformTransaction(t: Record<string, unknown>): Transaction {
  const d = new Date(t['createdAt'] as string);
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let date: string;
  if (d.toDateString() === today.toDateString())     date = 'Today';
  else if (d.toDateString() === yesterday.toDateString()) date = 'Yesterday';
  else date = d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

  return {
    id:            t['id'] as string,
    type:          t['type'] as Transaction['type'],
    service:       t['service'] as string,
    provider:      t['provider'] as string,
    amount:        parseFloat(t['amount'] as string),
    date,
    time:          d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status:        t['status'] as Transaction['status'],
    description:   (t['description'] as string) ?? '',
    paymentMethod: (t['paymentMethod'] as string | null) ?? undefined,
  };
}

function transformNotification(n: Record<string, unknown>): Notification {
  const rawCreatedAt = n['createdAt'] as string;
  const d       = new Date(rawCreatedAt);
  const diffMs  = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH   = Math.floor(diffMin / 60);
  const diffD   = Math.floor(diffH / 24);

  let timestamp: string;
  if (diffMin < 1)       timestamp = 'Just now';
  else if (diffMin < 60) timestamp = `${diffMin}m ago`;
  else if (diffH < 24)   timestamp = `${diffH}h ago`;
  else if (diffD < 7)    timestamp = `${diffD}d ago`;
  else timestamp = d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

  return {
    id:        n['id'] as string,
    type:      n['type'] as Notification['type'],
    title:     n['title'] as string,
    body:      n['body'] as string,
    timestamp,
    createdAt: rawCreatedAt,
    read:      n['read'] as boolean,
    refId:     (n['refId'] as string | null) ?? undefined,
  };
}

// ── Settings ──────────────────────────────────────────────────────────────────
interface AppSettings {
  biometrics: boolean;
  theme: 'light' | 'dark' | 'system';
  notifications: { transactions: boolean; promotional: boolean; security: boolean; email: boolean; };
  hideBalanceDefault: boolean;
  autoLock: string;
}

const defaultSettings: AppSettings = {
  biometrics: false,
  theme: 'system',
  notifications: { transactions: true, promotional: true, security: true, email: false },
  hideBalanceDefault: false,
  autoLock: '5 min',
};

// ── Context type ──────────────────────────────────────────────────────────────
interface AppContextType {
  isLoggedIn: boolean;
  isLoading: boolean;          // true while initial session check is in flight
  user: User | null;
  balance: number;
  balanceHidden: boolean;
  transactions: Transaction[];
  notifications: Notification[];
  unreadCount: number;
  settings: AppSettings;
  activeTab: string;

  /** Login by phone + PIN. */
  login: (phone: string, pin: string) => Promise<'success' | 'no_account' | 'wrong_pin' | 'account_suspended' | 'account_closed'>;
  logout: () => Promise<void>;
  /** Register and auto-login. */
  register: (name: string, phone: string, email: string, pin: string, username: string) => Promise<'success' | 'phone_taken' | 'username_taken' | 'error'>;
  /** Check if phone has an account (server-side). */
  accountExists: (phone: string) => Promise<boolean>;
  /** Check if a username is available. Returns 'invalid' for bad format without hitting the server. */
  checkUsernameAvailable: (username: string) => Promise<'available' | 'taken' | 'invalid' | 'error'>;
  /** Change the current user's username. Enforces 30-day cooldown server-side. */
  changeUsername: (username: string) => Promise<{ ok: boolean; error?: string; nextChangeAt?: string }>;
  /** Verify the current user's PIN without changing it. */
  verifyPin: (pin: string) => Promise<boolean>;
  /** Change PIN: verifies oldPin first. */
  changePin: (oldPin: string, newPin: string) => Promise<boolean>;
  /** Step 1 of forgot-PIN: request a server-side OTP (returns devOtp in non-production). */
  requestPinReset: (phone: string) => Promise<{ ok: boolean; devOtp?: string }>;
  /** Step 2 of forgot-PIN: verify the OTP and reset the PIN. */
  resetPin: (phone: string, otp: string, newPin: string) => Promise<boolean>;

  toggleBalanceHidden: () => void;
  markAllNotificationsRead: () => Promise<void>;
  updateSettings: (settings: Partial<AppSettings>) => void;
  /** @deprecated Use purchaseAirtime / purchaseData — they orchestrate wallet+vendor atomically on the server. */
  addTransaction: (transaction: Omit<Transaction, 'id' | 'date' | 'time'>) => Promise<boolean>;
  purchaseAirtime: (params: { network: string; phone: string; amount: number; idempotencyKey?: string }) => Promise<{ success: boolean; pending?: boolean; requestId?: string; balance?: number; error?: string }>;
  purchaseData: (params: { network: string; phone: string; planCode: string; planName: string; planPrice: string; idempotencyKey?: string }) => Promise<{ success: boolean; pending?: boolean; requestId?: string; planName?: string; balance?: number; error?: string }>;
  setActiveTab: (tab: string) => void;
  fundWallet: (amount: number) => Promise<boolean>;
  /** Refresh wallet balance and transaction list from the server. */
  refreshWallet: () => Promise<void>;
  /** Mark a single notification as read. */
  markNotificationRead: (id: string) => Promise<void>;
  /** Delete a single notification. */
  deleteNotification: (id: string) => Promise<void>;
  /** Delete all notifications for the current user. */
  clearAllNotifications: () => Promise<void>;
}

// ── Provider ──────────────────────────────────────────────────────────────────
const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [isLoggedIn,    setIsLoggedIn]    = useState(false);
  const [isLoading,     setIsLoading]     = useState(true); // true until /me resolves
  const [user,          setUser]          = useState<User | null>(null);
  const [balance,       setBalance]       = useState(0);
  const [balanceHidden, setBalanceHidden] = useState(false);
  const [transactions,  setTransactions]  = useState<Transaction[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [settings,      setSettings]      = useState(defaultSettings);
  const [activeTab,     setActiveTab]     = useState('home');

  const unreadCount = notifications.filter(n => !n.read).length;

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    api('/auth/me')
      .then(async res => {
        if (!res.ok) return; // 401 → stay logged out
        const data = await res.json() as {
          user: User;
          balance: string;
          transactions: Record<string, unknown>[];
          notifications: Record<string, unknown>[];
          preferences?: Partial<AppSettings>;
        };
        setUser(data.user);
        setBalance(parseFloat(data.balance));
        setTransactions(data.transactions.map(transformTransaction));
        setNotifications(data.notifications.map(transformNotification));
        if (data.preferences && Object.keys(data.preferences).length > 0) {
          setSettings(prev => ({ ...prev, ...data.preferences }));
        }
        setIsLoggedIn(true);
      })
      .catch(() => { /* network error — stay logged out */ })
      .finally(() => setIsLoading(false));
  }, []);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const login = async (phone: string, pin: string): Promise<'success' | 'no_account' | 'wrong_pin' | 'account_suspended' | 'account_closed'> => {
    try {
      const res = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ phone, loginPin: pin }),
      });
      if (res.status === 401) {
        const body = await res.json() as { error: string };
        if (body.error === 'no_account')         return 'no_account';
        if (body.error === 'account_suspended')  return 'account_suspended';
        if (body.error === 'account_closed')     return 'account_closed';
        return 'wrong_pin';
      }
      if (!res.ok) return 'wrong_pin';
      const data = await res.json() as {
        user: User;
        balance: string;
        transactions: Record<string, unknown>[];
        notifications: Record<string, unknown>[];
        preferences?: Partial<AppSettings>;
      };
      setUser(data.user);
      setBalance(parseFloat(data.balance));
      setTransactions(data.transactions.map(transformTransaction));
      setNotifications(data.notifications.map(transformNotification));
      if (data.preferences && Object.keys(data.preferences).length > 0) {
        setSettings(prev => ({ ...prev, ...data.preferences }));
      }
      setIsLoggedIn(true);
      setActiveTab('home');
      return 'success';
    } catch {
      return 'wrong_pin';
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch { /* ignore */ }
    setIsLoggedIn(false);
    setUser(null);
    setBalance(0);
    setTransactions([]);
    setNotifications([]);
    setSettings(defaultSettings);
    setActiveTab('home');
  };

  const register = async (
    name: string, phone: string, email: string, pin: string, username: string,
  ): Promise<'success' | 'phone_taken' | 'username_taken' | 'error'> => {
    try {
      const res = await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, phone, email, loginPin: pin, username }),
      });
      if (res.status === 409) {
        const body = await res.json() as { error: string };
        return body.error === 'username_taken' ? 'username_taken' : 'phone_taken';
      }
      if (!res.ok) return 'error';
      const data = await res.json() as {
        user: User;
        balance: string;
        transactions: Record<string, unknown>[];
        notifications: Record<string, unknown>[];
        preferences?: Partial<AppSettings>;
      };
      setUser(data.user);
      setBalance(parseFloat(data.balance));
      setTransactions(data.transactions.map(transformTransaction));
      setNotifications(data.notifications.map(transformNotification));
      if (data.preferences && Object.keys(data.preferences).length > 0) {
        setSettings(prev => ({ ...prev, ...data.preferences }));
      }
      setIsLoggedIn(true);
      setActiveTab('home');
      return 'success';
    } catch {
      return 'error';
    }
  };

  const accountExists = async (phone: string): Promise<boolean> => {
    try {
      const res = await api(`/auth/check-phone?phone=${encodeURIComponent(phone)}`);
      if (!res.ok) return false;
      const data = await res.json() as { exists: boolean };
      return data.exists;
    } catch { return false; }
  };

  const checkUsernameAvailable = async (username: string): Promise<'available' | 'taken' | 'invalid' | 'error'> => {
    const normalized = username.toLowerCase().trim();
    if (!/^[a-z]{4,15}$/.test(normalized)) return 'invalid';
    try {
      const res = await api(`/auth/check-username?username=${encodeURIComponent(normalized)}`);
      if (!res.ok) return 'error';
      const data = await res.json() as { available: boolean };
      return data.available ? 'available' : 'taken';
    } catch { return 'error'; }
  };

  const changeUsername = async (username: string): Promise<{ ok: boolean; error?: string; nextChangeAt?: string }> => {
    try {
      const res = await api('/user/username', { method: 'PATCH', body: JSON.stringify({ username }) });
      if (res.ok) {
        const data = await res.json() as { username: string; usernameChangedAt: string };
        setUser(prev => prev ? { ...prev, username: data.username, usernameChangedAt: data.usernameChangedAt } : prev);
        return { ok: true };
      }
      const body = await res.json() as { error?: string; nextChangeAt?: string };
      return { ok: false, error: body.error, nextChangeAt: body.nextChangeAt };
    } catch { return { ok: false, error: 'network_error' }; }
  };

  const verifyPin = async (pin: string): Promise<boolean> => {
    try {
      const res = await api('/user/check-pin', {
        method: 'POST',
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) return false;
      const data = await res.json() as { valid: boolean };
      return data.valid;
    } catch { return false; }
  };

  const changePin = async (oldPin: string, newPin: string): Promise<boolean> => {
    try {
      const res = await api('/user/pin', {
        method: 'PUT',
        body: JSON.stringify({ currentPin: oldPin, newPin }),
      });
      return res.ok;
    } catch { return false; }
  };

  const requestPinReset = async (phone: string): Promise<{ ok: boolean; devOtp?: string }> => {
    try {
      const res = await api('/auth/forgot-pin/request', {
        method: 'POST',
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) return { ok: false };
      const data = await res.json() as { message: string; otp?: string };
      return { ok: true, devOtp: data.otp };
    } catch { return { ok: false }; }
  };

  const resetPin = async (phone: string, otp: string, newPin: string): Promise<boolean> => {
    try {
      const res = await api('/auth/forgot-pin/reset', {
        method: 'POST',
        body: JSON.stringify({ phone, otp, newPin }),
      });
      return res.ok;
    } catch { return false; }
  };

  // ── Wallet & transactions ─────────────────────────────────────────────────

  /**
   * @deprecated Use purchaseAirtime / purchaseData for spend transactions.
   * This now only records a wallet_fund-style transaction record and is kept
   * for backwards compatibility. Purchase screens must use the orchestrated endpoints.
   */
  const addTransaction = async (txn: Omit<Transaction, 'id' | 'date' | 'time'>): Promise<boolean> => {
    if (!user) return false;
    try {
      const res = await api('/user/transactions', {
        method: 'POST',
        body: JSON.stringify({
          type:          txn.type,
          service:       txn.service,
          provider:      txn.provider,
          amount:        txn.amount,
          description:   txn.description,
          paymentMethod: txn.paymentMethod,
        }),
      });
      if (!res.ok) return false;
      const data = await res.json() as Record<string, unknown>;
      setTransactions(prev => [transformTransaction(data), ...prev]);
      if (typeof data['balance'] === 'string') setBalance(parseFloat(data['balance']));
      return true;
    } catch { return false; }
  };

  /** Server-orchestrated airtime purchase: wallet debit + vendor call in one request.
   *  Accepts an optional idempotencyKey — the server returns the existing transaction
   *  result instead of charging the wallet a second time when the key matches. */
  const purchaseAirtime = async (params: { network: string; phone: string; amount: number; idempotencyKey?: string }) => {
    try {
      const headers: Record<string, string> = {};
      if (params.idempotencyKey) headers['Idempotency-Key'] = params.idempotencyKey;

      const res = await api('/purchase/airtime', {
        method: 'POST',
        headers,
        body: JSON.stringify({ network: params.network, phone: params.phone, amount: params.amount }),
      });
      const data = await res.json() as {
        success: boolean; pending?: boolean;
        requestId?: string; balance?: string; txnId?: string; error?: string;
      };

      // pending → still processing; success/idempotent → sync state + notifications
      if (res.ok && data.success) {
        if (data.balance != null) setBalance(parseFloat(data.balance));
        const txns = await api('/user/transactions');
        if (txns.ok) {
          const rows = await txns.json() as Record<string, unknown>[];
          setTransactions(rows.map(transformTransaction));
        }
        // Refresh notifications so the server-created purchase notification
        // appears in the Notification Center immediately.
        void refreshNotifications();
        return { success: true, requestId: data.requestId, balance: data.balance ? parseFloat(data.balance) : undefined };
      }
      if (res.ok && data.pending) {
        return { success: false, pending: true, requestId: data.requestId, error: data.error };
      }
      return { success: false, error: data.error ?? 'Purchase failed' };
    } catch { return { success: false, error: 'Network error' }; }
  };

  /** Server-orchestrated data purchase: wallet debit + vendor call in one request.
   *  Accepts an optional idempotencyKey — see purchaseAirtime for semantics. */
  const purchaseData = async (params: { network: string; phone: string; planCode: string; planName: string; planPrice: string; idempotencyKey?: string }) => {
    try {
      const headers: Record<string, string> = {};
      if (params.idempotencyKey) headers['Idempotency-Key'] = params.idempotencyKey;

      const res = await api('/purchase/data', {
        method: 'POST',
        headers,
        body: JSON.stringify({ network: params.network, phone: params.phone, planCode: params.planCode, planName: params.planName, planPrice: params.planPrice }),
      });
      const data = await res.json() as {
        success: boolean; pending?: boolean;
        requestId?: string; planName?: string; balance?: string; txnId?: string; error?: string;
      };

      if (res.ok && data.success) {
        if (data.balance != null) setBalance(parseFloat(data.balance));
        const txns = await api('/user/transactions');
        if (txns.ok) {
          const rows = await txns.json() as Record<string, unknown>[];
          setTransactions(rows.map(transformTransaction));
        }
        void refreshNotifications();
        return { success: true, requestId: data.requestId, planName: data.planName, balance: data.balance ? parseFloat(data.balance) : undefined };
      }
      if (res.ok && data.pending) {
        return { success: false, pending: true, requestId: data.requestId, error: data.error };
      }
      return { success: false, error: data.error ?? 'Purchase failed' };
    } catch { return { success: false, error: 'Network error' }; }
  };

  const fundWallet = async (amount: number): Promise<boolean> => {
    if (!user) return false;
    try {
      const res = await api('/user/wallet/fund', {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });
      if (!res.ok) return false;
      const data = await res.json() as { balance: string; transaction: Record<string, unknown> };
      setBalance(parseFloat(data.balance));
      setTransactions(prev => [transformTransaction(data.transaction), ...prev]);
      void refreshNotifications();
      return true;
    } catch { return false; }
  };

  /** Re-fetch wallet balance and full transaction list from the server.
   *  Called after a Monnify payment is confirmed so the UI reflects the
   *  credited balance without requiring a full page reload. */
  const refreshWallet = async (): Promise<void> => {
    try {
      const [walletRes, txnsRes] = await Promise.all([
        api('/user/wallet'),
        api('/user/transactions'),
      ]);
      if (walletRes.ok) {
        const data = await walletRes.json() as { balance: string };
        setBalance(parseFloat(data.balance));
      }
      if (txnsRes.ok) {
        const rows = await txnsRes.json() as Record<string, unknown>[];
        setTransactions(rows.map(transformTransaction));
      }
      void refreshNotifications();
    } catch { /* silent — non-fatal */ }
  };

  // ── Notifications ─────────────────────────────────────────────────────────

  /** Sync notifications from the server into local state. Non-fatal. */
  const refreshNotifications = async () => {
    try {
      const res = await api('/user/notifications');
      if (res.ok) {
        const rows = await res.json() as Record<string, unknown>[];
        setNotifications(rows.map(transformNotification));
      }
    } catch { /* silent */ }
  };

  const markAllNotificationsRead = async (): Promise<void> => {
    try {
      await api('/user/notifications/read-all', { method: 'POST' });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch { /* silent */ }
  };

  const markNotificationRead = async (id: string): Promise<void> => {
    try {
      await api(`/user/notifications/${id}/read`, { method: 'PATCH' });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch { /* silent */ }
  };

  const deleteNotification = async (id: string): Promise<void> => {
    try {
      await api(`/user/notifications/${id}`, { method: 'DELETE' });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch { /* silent */ }
  };

  const clearAllNotifications = async (): Promise<void> => {
    try {
      await api('/user/notifications', { method: 'DELETE' });
      setNotifications([]);
    } catch { /* silent */ }
  };

  // ── Settings ──────────────────────────────────────────────────────────────
  const toggleBalanceHidden = () => setBalanceHidden(p => !p);

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
    // Persist to server non-blocking — failure is silent (non-fatal)
    void api('/user/preferences', {
      method: 'PUT',
      body: JSON.stringify(newSettings),
    });
  };

  return (
    <AppContext.Provider value={{
      isLoggedIn, isLoading, user, balance, balanceHidden, transactions,
      notifications, unreadCount, settings, activeTab,
      login, logout, register, accountExists, checkUsernameAvailable, changeUsername, verifyPin, changePin,
      requestPinReset, resetPin,
      toggleBalanceHidden, markAllNotificationsRead, updateSettings,
      addTransaction, purchaseAirtime, purchaseData, setActiveTab, fundWallet, refreshWallet,
      markNotificationRead, deleteNotification, clearAllNotifications,
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within an AppProvider');
  return context;
};
