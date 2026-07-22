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
import AdminManagement from './pages/AdminManagement';

type AdminPage = 'dashboard' | 'users' | 'transactions' | 'wallet' | 'services' | 'notifications' | 'settings' | 'adminManagement';

function AdminDashboardApp() {
  const [activePage, setActivePage] = useState<AdminPage>('dashboard');
  const navigate = (p: string) => setActivePage(p as AdminPage);

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':       return <AdminDashboard onNavigate={navigate} />;
      case 'users':           return <AdminUsers />;
      case 'transactions':    return <AdminTransactions />;
      case 'wallet':          return <AdminWallet />;
      case 'services':        return <AdminServices />;
      case 'notifications':   return <AdminNotifications />;
      case 'settings':        return <AdminSettings />;
      case 'adminManagement': return <AdminManagement />;
      default:                return <AdminDashboard onNavigate={navigate} />;
    }
  };

  return (
    <AdminLayout activePage={activePage} onNavigate={navigate}>
      {renderPage()}
    </AdminLayout>
  );
}

export default function AdminApp() {
  const { isAdminLoggedIn } = useAdminContext();
  return isAdminLoggedIn ? <AdminDashboardApp /> : <AdminLoginScreen />;
}
