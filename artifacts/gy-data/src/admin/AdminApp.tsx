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
import AdminAuditLogs from './pages/AdminAuditLogs';

type AdminPage =
  | 'dashboard'
  | 'users'
  | 'transactions'
  | 'wallet'
  | 'services'
  | 'notifications'
  | 'settings'
  | 'adminManagement'
  | 'auditLogs';

function AdminDashboardApp() {
  const [activePage, setActivePage] = useState<AdminPage>('dashboard');
  const { isSuperAdmin } = useAdminContext();

  const navigate = (p: string) => {
    // Prevent non-super-admins from navigating to super-admin pages via direct calls
    if ((p === 'adminManagement' || p === 'auditLogs') && !isSuperAdmin) {
      setActivePage('dashboard');
      return;
    }
    setActivePage(p as AdminPage);
  };

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':       return <AdminDashboard onNavigate={navigate} />;
      case 'users':           return <AdminUsers />;
      case 'transactions':    return <AdminTransactions />;
      case 'wallet':          return <AdminWallet />;
      case 'services':        return <AdminServices />;
      case 'notifications':   return <AdminNotifications />;
      case 'settings':        return <AdminSettings />;
      // Super admin only — backend independently enforces these
      case 'adminManagement': return <AdminManagement />;
      case 'auditLogs':       return <AdminAuditLogs />;
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
