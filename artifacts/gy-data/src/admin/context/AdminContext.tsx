import React, { createContext, useContext, useState, ReactNode } from 'react';
import {
  adminCredentials,
  adminMockUsers,
  adminMockTransactions,
  adminStats,
  adminAnnouncements,
  AdminUser,
  AdminTransaction,
  Announcement,
} from '../data/adminMockData';

interface AdminContextType {
  isAdminLoggedIn: boolean;
  adminEmail: string;
  users: AdminUser[];
  transactions: AdminTransaction[];
  stats: typeof adminStats;
  announcements: Announcement[];
  adminLogin: (email: string, pin: string) => boolean;
  adminLogout: () => void;
  suspendUser: (id: string) => void;
  activateUser: (id: string) => void;
  addAnnouncement: (ann: Omit<Announcement, 'id' | 'sentAt' | 'recipients'>) => void;
}

const AdminContext = createContext<AdminContextType | undefined>(undefined);

export const AdminProvider = ({ children }: { children: ReactNode }) => {
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [users, setUsers] = useState<AdminUser[]>(adminMockUsers);
  const [transactions] = useState<AdminTransaction[]>(adminMockTransactions);
  const [announcements, setAnnouncements] = useState<Announcement[]>(adminAnnouncements);

  const adminLogin = (email: string, pin: string): boolean => {
    if (
      email.trim().toLowerCase() === adminCredentials.email &&
      pin === adminCredentials.pin
    ) {
      setIsAdminLoggedIn(true);
      setAdminEmail(email.trim().toLowerCase());
      return true;
    }
    return false;
  };

  const adminLogout = () => {
    setIsAdminLoggedIn(false);
    setAdminEmail('');
  };

  const suspendUser = (id: string) => {
    setUsers(prev =>
      prev.map(u => (u.id === id ? { ...u, status: 'suspended' as const } : u))
    );
  };

  const activateUser = (id: string) => {
    setUsers(prev =>
      prev.map(u => (u.id === id ? { ...u, status: 'active' as const } : u))
    );
  };

  const addAnnouncement = (ann: Omit<Announcement, 'id' | 'sentAt' | 'recipients'>) => {
    const newAnn: Announcement = {
      ...ann,
      id: `ANN-${Date.now()}`,
      sentAt: ann.status === 'sent' ? new Date().toLocaleString() : '—',
      recipients: ann.status === 'sent' ? 1089 : 0,
    };
    setAnnouncements(prev => [newAnn, ...prev]);
  };

  return (
    <AdminContext.Provider
      value={{
        isAdminLoggedIn,
        adminEmail,
        users,
        transactions,
        stats: adminStats,
        announcements,
        adminLogin,
        adminLogout,
        suspendUser,
        activateUser,
        addAnnouncement,
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
