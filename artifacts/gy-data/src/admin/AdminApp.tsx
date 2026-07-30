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
import CustomerCarePanel from './pages/CustomerCarePanel';
import CashbackManagement from './pages/CashbackManagement';

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
  | 'cashback'
  | 'security'
  | 'finance'
  | 'customerCare';

const SUPER_ONLY_PAGES: AdminPage[] = [
  'adminManagement', 'auditLogs', 'walletManagement', 'reversals', 'reports', 'integrations',
  'apiManagement', 'pricing', 'cashback', 'security', 'finance',
];

// Pages accessible by customer_care role
const CC_PAGES: AdminPage[] = ['customerCare', 'dashboard'];

function AdminDashboardApp() {
  const { isSuperAdmin, adminRole } = useAdminContext();
  const [activePage, setActivePage] = useState<AdminPage>(
    () => adminRole === 'customer_care' ? 'customerCare' : 'dashboard',
  );

  const navigate = (p: string) => {
    if (SUPER_ONLY_PAGES.includes(p as AdminPage) && !isSuperAdmin) {
      setActivePage(adminRole === 'customer_care' ? 'customerCare' : 'dashboard');
      return;
    }
    if (adminRole === 'customer_care' && !CC_PAGES.includes(p as AdminPage)) {
      setActivePage('customerCare');
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
      case 'cashback':        return <CashbackManagement />;
      case 'security':        return <SecurityPage />;
      case 'finance':         return <FinancePage />;
      case 'customerCare':    return <CustomerCarePanel />;
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
  const { isAdminLoggedIn, isAdminLoading, isSuperAdmin } = useAdminContext();

  // Show nothing while the session cookie check is in flight — this prevents
  // the login screen from flashing on page reload when the admin is already
  // authenticated.
  if (isAdminLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAdminLoggedIn) {
    return superAdminMode ? <SuperAdminLoginScreen /> : <AdminLoginScreen />;
  }

  if (superAdminMode && !isSuperAdmin) {
    return <SuperAdminLoginScreen />;
  }

  return <AdminDashboardApp />;
}
