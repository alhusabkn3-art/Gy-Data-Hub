import React, { createContext, useContext, useState, ReactNode } from 'react';
import { mockUser, mockTransactions, mockNotifications, Transaction, Notification } from '../data/mockData';

interface AppSettings {
  biometrics: boolean;
  theme: 'light' | 'dark' | 'system';
  notifications: {
    transactions: boolean;
    promotional: boolean;
    security: boolean;
    email: boolean;
  };
  hideBalanceDefault: boolean;
  autoLock: string;
}

interface AppState {
  isLoggedIn: boolean;
  user: typeof mockUser;
  balance: number;
  balanceHidden: boolean;
  transactions: Transaction[];
  notifications: Notification[];
  unreadCount: number;
  settings: AppSettings;
  activeTab: string;
}

interface AppContextType extends AppState {
  login: (pin: string) => boolean;
  logout: () => void;
  toggleBalanceHidden: () => void;
  markAllNotificationsRead: () => void;
  updateSettings: (settings: Partial<AppSettings>) => void;
  addTransaction: (transaction: Omit<Transaction, 'id' | 'date' | 'time'>) => void;
  setActiveTab: (tab: string) => void;
  fundWallet: (amount: number) => void;
}

const defaultSettings: AppSettings = {
  biometrics: false,
  theme: 'system',
  notifications: {
    transactions: true,
    promotional: true,
    security: true,
    email: false,
  },
  hideBalanceDefault: false,
  autoLock: '5 min',
};

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(mockUser);
  const [balance, setBalance] = useState(mockUser.balance);
  const [balanceHidden, setBalanceHidden] = useState(defaultSettings.hideBalanceDefault);
  const [transactions, setTransactions] = useState(mockTransactions);
  const [notifications, setNotifications] = useState(mockNotifications);
  const [settings, setSettings] = useState(defaultSettings);
  const [activeTab, setActiveTab] = useState('home');

  const unreadCount = notifications.filter(n => !n.read).length;

  const login = (pin: string) => {
    if (pin === '123456') {
      setIsLoggedIn(true);
      setActiveTab('home');
      return true;
    }
    return false;
  };

  const logout = () => {
    setIsLoggedIn(false);
    setActiveTab('home');
  };

  const toggleBalanceHidden = () => {
    setBalanceHidden(prev => !prev);
  };

  const markAllNotificationsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const updateSettings = (newSettings: Partial<AppSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const addTransaction = (txn: Omit<Transaction, 'id' | 'date' | 'time'>) => {
    const newTxn: Transaction = {
      ...txn,
      id: `TXN-${Math.floor(Math.random() * 10000)}`,
      date: 'Today',
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };
    setTransactions(prev => [newTxn, ...prev]);
    
    if (txn.status === 'success' && txn.type !== 'wallet_fund') {
      setBalance(prev => prev - txn.amount);
    }
  };

  const fundWallet = (amount: number) => {
    setBalance(prev => prev + amount);
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

  return (
    <AppContext.Provider value={{
      isLoggedIn,
      user,
      balance,
      balanceHidden,
      transactions,
      notifications,
      unreadCount,
      settings,
      activeTab,
      login,
      logout,
      toggleBalanceHidden,
      markAllNotificationsRead,
      updateSettings,
      addTransaction,
      setActiveTab,
      fundWallet
    }}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};
