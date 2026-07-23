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
import WalletManagement from './pages/WalletManagement';
import ReversalsRefunds from './pages/ReversalsRefunds';
import FinancialReports from './pages/FinancialReports';
import APIIntegrations from './pages/APIIntegrations';
import StaffManagement from './pages/StaffManagement';
import APIManagement from './pages/APIManagement';
import PricingManagement from './pages/PricingManagement';
import SecurityPage from './pages/SecurityPage';
import FinancePage from './pages/FinancePage';

type AdminPage =
  | 'dashboard'
  | 'users'
  | 'transactions'
  | 'wallet'
  | 'services'
  | 'notifications'
  | 'settings'
  | 'adminManagement'
  | 'auditLogs'
  | 'walletManagement'
  | 'reversals'
  | 'reports'
  | 'integrations'
  | 'staff'
  | 'apiManagement'
  | 'pricing'
  | 'security'
  | 'finance';

const SUPER_ONLY_PAGES: AdminPage[] = [
  'adminManagement', 'auditLogs', 'walletManagement', 'reversals', 'reports', 'integrations',
  'apiManagement', 'pricing', 'security', 'finance',
];

function AdminDashboardApp() {
  const [activePage, setActivePage] = useState<AdminPage>('dashboard');
  const { isSuperAdmin } = useAdminContext();

  const navigate = (p: string) => {
    if (SUPER_ONLY_PAGES.includes(p as AdminPage) && !isSuperAdmin) {
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
      case 'walletManagement':return <WalletManagement />;
      case 'reversals':       return <ReversalsRefunds />;
      case 'reports':         return <FinancialReports />;
      case 'integrations':    return <APIIntegrations />;
      case 'staff':           return <StaffManagement />;
      case 'apiManagement':   return <APIManagement />;
      case 'pricing':         return <PricingManagement />;
      case 'security':        return <SecurityPage />;
      case 'finance':         return <FinancePage />;
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
  /** When true, this entry point is reserved for super_admin only. */
  superAdminMode?: boolean;
}

export default function AdminApp({ superAdminMode = false }: AdminAppProps) {
  const { isAdminLoggedIn, isSuperAdmin } = useAdminContext();

  if (!isAdminLoggedIn) {
    return superAdminMode ? <SuperAdminLoginScreen /> : <AdminLoginScreen />;
  }

  if (superAdminMode && !isSuperAdmin) {
    return <SuperAdminLoginScreen />;
  }

  return <AdminDashboardApp />;
}
