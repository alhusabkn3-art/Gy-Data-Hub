import React, { useState } from 'react';
import { useAdminContext } from './context/AdminContext';
import AdminLoginScreen from './pages/AdminLoginScreen';
import SuperAdminLoginScreen from './pages/SuperAdminLoginScreen';
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

interface AdminAppProps {
  /** When true, this entry point is reserved for super_admin only.
   *  A regular admin who logs in through this path will be rejected. */
  superAdminMode?: boolean;
}

export default function AdminApp({ superAdminMode = false }: AdminAppProps) {
  const { isAdminLoggedIn, isSuperAdmin } = useAdminContext();

  // Not logged in → show appropriate login screen
  if (!isAdminLoggedIn) {
    return superAdminMode ? <SuperAdminLoginScreen /> : <AdminLoginScreen />;
  }

  // Super-admin entry point: if the logged-in user is NOT a super_admin,
  // keep rendering the super-admin login screen — its useEffect will call
  // adminLogout() and reset state, preventing any dashboard flash.
  if (superAdminMode && !isSuperAdmin) {
    return <SuperAdminLoginScreen />;
  }

  return <AdminDashboardApp />;
}
