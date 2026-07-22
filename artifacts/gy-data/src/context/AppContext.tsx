import React, { createContext, useContext, useState, ReactNode } from 'react';
import { User, Transaction, Notification, StoredAccount } from '../data/mockData';

// ── localStorage helpers ──────────────────────────────────────────────────────
const ACCOUNTS_KEY = 'gyd_accounts';
const SESSION_KEY  = 'gyd_session';

function loadAccounts(): StoredAccount[] {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '[]'); }
  catch { return []; }
}

function saveAccounts(accounts: StoredAccount[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function loadSessionUserId(): string | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw).userId ?? null;
  } catch { return null; }
}

function saveSession(userId: string) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId }));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

// ── Account generators ────────────────────────────────────────────────────────
function genId() {
  return 'USR-' + Math.random().toString(36).substring(2, 10).toUpperCase();
}

function genAccountNumber() {
  return String(Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000);
}

function genReferralCode(firstName: string) {
  return 'GY-' + firstName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) +
         Math.floor(Math.random() * 900 + 100);
}

function normalizePhone(phone: string) {
  return phone.replace(/\D/g, '').slice(0, 11);
}

function accountToUser(a: StoredAccount): User {
  return {
    id: a.id, name: a.name, firstName: a.firstName, lastName: a.lastName,
    email: a.email, phone: a.phone, accountNumber: a.accountNumber,
    bankName: a.bankName, referralCode: a.referralCode,
    kycStatus: a.kycStatus, createdAt: a.createdAt,
  };
}

// ── Mutate one account in localStorage ───────────────────────────────────────
function persistChanges(userId: string, changes: Partial<StoredAccount>) {
  const accounts = loadAccounts();
  const idx = accounts.findIndex(a => a.id === userId);
  if (idx !== -1) {
    accounts[idx] = { ...accounts[idx], ...changes };
    saveAccounts(accounts);
  }
}

// ── Settings type ─────────────────────────────────────────────────────────────
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
  user: User | null;
  balance: number;
  balanceHidden: boolean;
  transactions: Transaction[];
  notifications: Notification[];
  unreadCount: number;
  settings: AppSettings;
  activeTab: string;

  /** Login by phone + PIN. Returns 'success' | 'no_account' | 'wrong_pin' */
  login: (phone: string, pin: string) => 'success' | 'no_account' | 'wrong_pin';
  logout: () => void;
  /** Register a new account and auto-login. Returns 'success' | 'phone_taken' */
  register: (name: string, phone: string, email: string, pin: string) => 'success' | 'phone_taken';
  /** Returns true if the given phone number has a registered account */
  accountExists: (phone: string) => boolean;
  /** Verify the current user's stored PIN without changing it */
  verifyPin: (pin: string) => boolean;
  /** Change PIN: verifies oldPin first. Returns false if oldPin is wrong. */
  changePin: (oldPin: string, newPin: string) => boolean;
  /** Update PIN for the account matching phone (for Forgot PIN flow) */
  resetPin: (phone: string, newPin: string) => boolean;

  toggleBalanceHidden: () => void;
  markAllNotificationsRead: () => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'date' | 'time'>) => void;
  setActiveTab: (tab: string) => void;
  fundWallet: (amount: number) => void;
}

// ── Restore session on first load ─────────────────────────────────────────────
const _initialUserId   = loadSessionUserId();
const _initialAccounts = loadAccounts();
const _initialAccount  = _initialUserId
  ? _initialAccounts.find(a => a.id === _initialUserId) ?? null
  : null;

// ── Provider ──────────────────────────────────────────────────────────────────
const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [isLoggedIn,    setIsLoggedIn]    = useState(!!_initialAccount);
  const [user,          setUser]          = useState<User | null>(_initialAccount ? accountToUser(_initialAccount) : null);
  const [balance,       setBalance]       = useState(_initialAccount?.balance ?? 0);
  const [balanceHidden, setBalanceHidden] = useState(defaultSettings.hideBalanceDefault);
  const [transactions,  setTransactions]  = useState<Transaction[]>(_initialAccount?.transactions ?? []);
  const [notifications, setNotifications] = useState<Notification[]>(_initialAccount?.notifications ?? []);
  const [settings,      setSettings]      = useState(defaultSettings);
  const [activeTab,     setActiveTab]     = useState('home');

  const unreadCount = notifications.filter(n => !n.read).length;

  // ── Auth ──────────────────────────────────────────────────────────────────
  const login = (phone: string, pin: string): 'success' | 'no_account' | 'wrong_pin' => {
    const norm     = normalizePhone(phone);
    const accounts = loadAccounts();
    const account  = accounts.find(a => normalizePhone(a.phone) === norm);
    if (!account) return 'no_account';
    if (account.pin !== pin) return 'wrong_pin';

    setUser(accountToUser(account));
    setBalance(account.balance);
    setTransactions(account.transactions);
    setNotifications(account.notifications);
    setIsLoggedIn(true);
    setActiveTab('home');
    saveSession(account.id);
    return 'success';
  };

  const logout = () => {
    clearSession();
    setIsLoggedIn(false);
    setUser(null);
    setBalance(0);
    setTransactions([]);
    setNotifications([]);
    setBalanceHidden(false);
    setActiveTab('home');
  };

  const register = (
    name: string, phone: string, email: string, pin: string,
  ): 'success' | 'phone_taken' => {
    const norm     = normalizePhone(phone);
    const accounts = loadAccounts();
    if (accounts.some(a => normalizePhone(a.phone) === norm)) return 'phone_taken';

    const parts     = name.trim().split(' ');
    const firstName = parts[0];
    const lastName  = parts.slice(1).join(' ');
    const id        = genId();

    const welcomeNotification: Notification = {
      id: `NOT-WELCOME-${Date.now()}`,
      type: 'system',
      title: 'Welcome to GY DATA! 🎉',
      body: `Hi ${firstName}! Your account is ready. Buy data, airtime, and more in seconds.`,
      timestamp: 'Just now',
      read: false,
    };

    const newAccount: StoredAccount = {
      id, name: name.trim(), firstName, lastName,
      email: email.trim(), phone: norm,
      accountNumber: genAccountNumber(),
      bankName: 'GY DATA Wallet',
      referralCode: genReferralCode(firstName),
      kycStatus: 'unverified',
      createdAt: new Date().toISOString(),
      pin,
      balance: 0,
      transactions: [],
      notifications: [welcomeNotification],
    };

    accounts.push(newAccount);
    saveAccounts(accounts);
    saveSession(id);

    setUser(accountToUser(newAccount));
    setBalance(0);
    setTransactions([]);
    setNotifications([welcomeNotification]);
    setIsLoggedIn(true);
    setActiveTab('home');
    return 'success';
  };

  const accountExists = (phone: string): boolean => {
    const norm = normalizePhone(phone);
    return loadAccounts().some(a => normalizePhone(a.phone) === norm);
  };

  const verifyPin = (pin: string): boolean => {
    if (!user) return false;
    const account = loadAccounts().find(a => a.id === user.id);
    return account?.pin === pin;
  };

  const changePin = (oldPin: string, newPin: string): boolean => {
    if (!user) return false;
    const accounts = loadAccounts();
    const idx = accounts.findIndex(a => a.id === user.id);
    if (idx === -1 || accounts[idx].pin !== oldPin) return false;
    accounts[idx].pin = newPin;
    saveAccounts(accounts);
    return true;
  };

  const resetPin = (phone: string, newPin: string): boolean => {
    const norm     = normalizePhone(phone);
    const accounts = loadAccounts();
    const idx      = accounts.findIndex(a => normalizePhone(a.phone) === norm);
    if (idx === -1) return false;
    accounts[idx].pin = newPin;
    saveAccounts(accounts);
    return true;
  };

  // ── Wallet & transactions ─────────────────────────────────────────────────
  const addTransaction = (txn: Omit<Transaction, 'id' | 'date' | 'time'>) => {
    if (!user) return;
    const newTxn: Transaction = {
      ...txn,
      id: `TXN-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      date: 'Today',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setTransactions(prev => {
      const next = [newTxn, ...prev];
      persistChanges(user.id, { transactions: next });
      return next;
    });

    if (txn.status === 'success' && txn.type !== 'wallet_fund') {
      setBalance(prev => {
        const next = prev - txn.amount;
        persistChanges(user.id, { balance: next });
        return next;
      });
    }
  };

  const fundWallet = (amount: number) => {
    if (!user) return;
    setBalance(prev => {
      const next = prev + amount;
      persistChanges(user.id, { balance: next });
      return next;
    });
    addTransaction({
      type: 'wallet_fund',
      service: 'Wallet Funding',
      provider: 'Bank Transfer',
      amount,
      status: 'success',
      description: 'Funded wallet via Bank Transfer',
      paymentMethod: 'Bank Transfer',
    });
  };

  // ── Notifications ─────────────────────────────────────────────────────────
  const markAllNotificationsRead = () => {
    if (!user) return;
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }));
      persistChanges(user.id, { notifications: next });
      return next;
    });
  };

  // ── Settings ──────────────────────────────────────────────────────────────
  const toggleBalanceHidden = () => setBalanceHidden(p => !p);

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  return (
    <AppContext.Provider value={{
      isLoggedIn, user, balance, balanceHidden, transactions,
      notifications, unreadCount, settings, activeTab,
      login, logout, register, accountExists, verifyPin, changePin, resetPin,
      toggleBalanceHidden, markAllNotificationsRead, updateSettings,
      addTransaction, setActiveTab, fundWallet,
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
