import React, { useState } from 'react';
import { useAdminContext } from './context/AdminContext';
import AdminLoginScreen from './pages/AdminLoginScreen';
import AdminLayout from './components/AdminLayout';
import AdminDashboard from './pages/AdminDashboard';
import AdminUsers from './pages/AdminUsers';
import AdminTransactions from './pages/AdminTransactions';
import AdminWallet from './pages/AdminWallet';
import AdminServices from './pages/AdminServices';
import AdminNotifications from './pages/AdminNotifications';
import AdminSettings from './pages/AdminSettings';

type AdminPage = 'dashboard' | 'users' | 'transactions' | 'wallet' | 'services' | 'notifications' | 'settings';

const pages: Record<AdminPage, React.ReactNode> = {
  dashboard: <AdminDashboard />,
  users: <AdminUsers />,
  transactions: <AdminTransactions />,
  wallet: <AdminWallet />,
  services: <AdminServices />,
  notifications: <AdminNotifications />,
  settings: <AdminSettings />,
};

function AdminDashboardApp() {
  const [activePage, setActivePage] = useState<AdminPage>('dashboard');

  return (
    <AdminLayout activePage={activePage} onNavigate={(p) => setActivePage(p as AdminPage)}>
      {pages[activePage]}
    </AdminLayout>
  );
}

export default function AdminApp() {
  const { isAdminLoggedIn } = useAdminContext();
  return isAdminLoggedIn ? <AdminDashboardApp /> : <AdminLoginScreen />;
}
