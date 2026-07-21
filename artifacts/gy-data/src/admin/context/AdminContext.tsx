import React, { createContext, useContext, useState, ReactNode } from 'react';
import {
  adminCredentials,
  adminMockUsers,
  adminMockTransactions,
  adminStats,
  adminAnnouncements,
  adminAccounts as seedAdminAccounts,
  AdminUser,
  AdminTransaction,
  Announcement,
  AdminAccount,
  AdminRole,
} from '../data/adminMockData';

interface AdminContextType {
  isAdminLoggedIn: boolean;
  adminEmail: string;
  currentAdminId: string;
  users: AdminUser[];
  transactions: AdminTransaction[];
  stats: typeof adminStats;
  announcements: Announcement[];
  adminAccounts: AdminAccount[];

  // Auth
  adminLogin: (email: string, pin: string) => boolean;
  adminLogout: () => void;

  // Customer user management
  suspendUser: (id: string) => void;
  activateUser: (id: string) => void;

  // Announcement management
  addAnnouncement: (ann: Omit<Announcement, 'id' | 'sentAt' | 'recipients'>) => void;

  // Admin account management
  addAdminAccount: (data: {
    name: string;
    email: string;
    role: AdminRole;
    pin: string;
  }) => void;
  updateAdminAccount: (id: string, updates: Partial<Pick<AdminAccount, 'name' | 'email' | 'role'>>) => void;
  changeAdminPin: (id: string, newPin: string) => void;
  toggleAdminStatus: (id: string) => void;
  removeAdminAccount: (id: string) => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider = ({ children }: { children: ReactNode }) => {
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [currentAdminId, setCurrentAdminId] = useState('');
  const [users, setUsers] = useState<AdminUser[]>(adminMockUsers);
  const [transactions] = useState<AdminTransaction[]>(adminMockTransactions);
  const [announcements, setAnnouncements] = useState<Announcement[]>(adminAnnouncements);
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>(seedAdminAccounts);

  // ── Auth ──────────────────────────────────────────────────────────────────
  const adminLogin = (email: string, pin: string): boolean => {
    if (
      email.trim().toLowerCase() === adminCredentials.email &&
      pin === adminCredentials.pin
    ) {
      setIsAdminLoggedIn(true);
      setAdminEmail(email.trim().toLowerCase());
      setCurrentAdminId('ADM-001'); // super admin
      return true;
    }
    return false;
  };

  const adminLogout = () => {
    setIsAdminLoggedIn(false);
    setAdminEmail('');
    setCurrentAdminId('');
  };

  // ── Customer user management ──────────────────────────────────────────────
  const suspendUser = (id: string) =>
    setUsers(prev => prev.map(u => (u.id === id ? { ...u, status: 'suspended' as const } : u)));

  const activateUser = (id: string) =>
    setUsers(prev => prev.map(u => (u.id === id ? { ...u, status: 'active' as const } : u)));

  // ── Announcements ─────────────────────────────────────────────────────────
  const addAnnouncement = (ann: Omit<Announcement, 'id' | 'sentAt' | 'recipients'>) => {
    const newAnn: Announcement = {
      ...ann,
      id: `ANN-${Date.now()}`,
      sentAt: ann.status === 'sent' ? new Date().toLocaleString() : '—',
      recipients: ann.status === 'sent' ? 1089 : 0,
    };
    setAnnouncements(prev => [newAnn, ...prev]);
  };

  // ── Admin account management ──────────────────────────────────────────────
  const addAdminAccount = ({
    name,
    email,
    role,
    pin,
  }: {
    name: string;
    email: string;
    role: AdminRole;
    pin: string;
  }) => {
    const newAccount: AdminAccount = {
      id: `ADM-${Date.now()}`,
      name,
      email: email.trim().toLowerCase(),
      role,
      status: 'active',
      createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      lastLogin: 'Never',
      pin,
      isSuperAdmin: false,
    };
    setAdminAccounts(prev => [...prev, newAccount]);
  };

  const updateAdminAccount = (
    id: string,
    updates: Partial<Pick<AdminAccount, 'name' | 'email' | 'role'>>
  ) => {
    setAdminAccounts(prev =>
      prev.map(a => {
        if (a.id !== id) return a;
        // Protect super admin from role demotion
        if (a.isSuperAdmin && updates.role && updates.role !== 'super_admin') return a;
        return { ...a, ...updates };
      })
    );
  };

  const changeAdminPin = (id: string, newPin: string) => {
    setAdminAccounts(prev =>
      prev.map(a => (a.id === id ? { ...a, pin: newPin } : a))
    );
  };

  const toggleAdminStatus = (id: string) => {
    setAdminAccounts(prev =>
      prev.map(a => {
        if (a.id !== id) return a;
        if (a.isSuperAdmin) return a; // cannot disable super admin
        return { ...a, status: a.status === 'active' ? 'disabled' : 'active' };
      })
    );
  };

  const removeAdminAccount = (id: string) => {
    setAdminAccounts(prev => prev.filter(a => a.id !== id || a.isSuperAdmin));
  };

  return (
    <AdminContext.Provider
      value={{
        isAdminLoggedIn,
        adminEmail,
        currentAdminId,
        users,
        transactions,
        stats: adminStats,
        announcements,
        adminAccounts,
        adminLogin,
        adminLogout,
        suspendUser,
        activateUser,
        addAnnouncement,
        addAdminAccount,
        updateAdminAccount,
        changeAdminPin,
        toggleAdminStatus,
        removeAdminAccount,
      }}
    >
      {children}
    </AdminContext.Provider>
  );
};

export const useAdminContext = () => {
  const ctx = useContext(AdminContext);
  if (!ctx) throw new Error('useAdminContext must be used within AdminProvider');
  return ctx;
};
