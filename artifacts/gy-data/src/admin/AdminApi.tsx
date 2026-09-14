import React, { Component, type ErrorInfo, type ReactNode, useState } from 'react';

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
  'adminManagement',
  'auditLogs',
  'walletManagement',
  'reversals',
  'reports',
  'integrations',
  'apiManagement',
  'pricing',
  'cashback',
  'security',
  'finance',
];

const CC_PAGES: AdminPage[] = [
  'customerCare',
  'dashboard',
];

/**
 * Error boundary for the entire admin area.
 *
 * This is intentionally kept here instead of changing the customer app.
 * If one admin page throws a React rendering error, the whole browser
 * page will no longer become a blank white screen.
 */
interface AdminErrorBoundaryProps {
  children: ReactNode;
}

interface AdminErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

class AdminErrorBoundary extends Component<
  AdminErrorBoundaryProps,
  AdminErrorBoundaryState
> {
  public state: AdminErrorBoundaryState = {
    hasError: false,
    errorMessage: '',
  };

  public static getDerivedStateFromError(
    error: unknown,
  ): AdminErrorBoundaryState {
    return {
      hasError: true,
      errorMessage:
        error instanceof Error
          ? error.message
          : 'An unexpected error occurred in the Admin Dashboard.',
    };
  }

  public componentDidCatch(
    error: Error,
    errorInfo: ErrorInfo,
  ): void {
    console.error(
      '[AdminErrorBoundary] Admin dashboard crashed:',
      error,
      errorInfo,
    );
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  private handleReturnToDashboard = (): void => {
    this.setState({
      hasError: false,
      errorMessage: '',
    });
  };

  public render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-[#071426] text-white flex items-center justify-center p-6">
        <div className="w-full max-w-lg">
          <div className="bg-[#0B1B35] border border-red-400/20 rounded-2xl p-6 shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-5">
              <span className="text-red-400 text-xl font-bold">
                !
              </span>
            </div>

            <h1 className="text-xl font-bold text-white">
              Admin Dashboard Error
            </h1>

            <p className="text-sm text-white/50 mt-2 leading-6">
              The Admin Dashboard encountered an unexpected error.
              Your session and other parts of the application have
              not been changed.
            </p>

            {this.state.errorMessage && (
              <div className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 p-3">
                <p className="text-[11px] uppercase tracking-wider text-white/30 mb-1">
                  Error
                </p>

                <p className="text-xs text-red-300/80 break-words">
                  {this.state.errorMessage}
                </p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <button
                type="button"
                onClick={this.handleReturnToDashboard}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold bg-blue-500 hover:bg-blue-400 text-white transition-colors"
              >
                Try Again
              </button>

              <button
                type="button"
                onClick={this.handleReload}
                className="flex-1 rounded-xl px-4 py-3 text-sm font-semibold bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.08] text-white transition-colors"
              >
                Reload Dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

function AdminDashboardApp(): React.ReactElement {
  const {
    isSuperAdmin,
    adminRole,
  } = useAdminContext();

  const [activePage, setActivePage] =
    useState<AdminPage>(
      () =>
        adminRole === 'customer_care'
          ? 'customerCare'
          : 'dashboard',
    );

  const navigate = (page: string): void => {
    const requestedPage = page as AdminPage;

    /*
     * Super-admin-only pages must never be available to
     * ordinary admin/customer-care accounts.
     */
    if (
      SUPER_ONLY_PAGES.includes(requestedPage) &&
      !isSuperAdmin
    ) {
      setActivePage(
        adminRole === 'customer_care'
          ? 'customerCare'
          : 'dashboard',
      );
      return;
    }

    /*
     * Customer-care is intentionally restricted to its own
     * panel plus dashboard.
     */
    if (
      adminRole === 'customer_care' &&
      !CC_PAGES.includes(requestedPage)
    ) {
      setActivePage('customerCare');
      return;
    }

    /*
     * Only allow known pages.
     * If a bad navigation value somehow reaches here,
     * safely return to dashboard instead of rendering an
     * invalid component.
     */
    const validPages: AdminPage[] = [
      'dashboard',
      'users',
      'transactions',
      'wallet',
      'services',
      'notifications',
      'settings',
      'adminManagement',
      'auditLogs',
      'walletManagement',
      'reversals',
      'reports',
      'integrations',
      'staff',
      'apiManagement',
      'pricing',
      'cashback',
      'security',
      'finance',
      'customerCare',
    ];

    if (!validPages.includes(requestedPage)) {
      setActivePage(
        adminRole === 'customer_care'
          ? 'customerCare'
          : 'dashboard',
      );
      return;
    }

    setActivePage(requestedPage);
  };

  const renderPage = (): React.ReactElement => {
    switch (activePage) {
      case 'dashboard':
        return (
          <AdminDashboard
            onNavigate={navigate}
          />
        );

      case 'users':
        return <AdminUsers />;

      case 'transactions':
        return <AdminTransactions />;

      case 'wallet':
        return <AdminWallet />;

      case 'services':
        return <AdminServices />;

      case 'notifications':
        return <AdminNotifications />;

      case 'settings':
        return <AdminSettings />;

      case 'adminManagement':
        return <AdminManagement />;

      case 'auditLogs':
        return <AdminAuditLogs />;

      case 'walletManagement':
        return <WalletManagement />;

      case 'reversals':
        return <ReversalsRefunds />;

      case 'reports':
        return <FinancialReports />;

      case 'integrations':
        return <APIIntegrations />;

      case 'staff':
        return <StaffManagement />;

      case 'apiManagement':
        return <APIManagement />;

      case 'pricing':
        return <PricingManagement />;

      case 'cashback':
        return <CashbackManagement />;

      case 'security':
        return <SecurityPage />;

      case 'finance':
        return <FinancePage />;

      case 'customerCare':
        return <CustomerCarePanel />;

      default:
        return (
          <AdminDashboard
            onNavigate={navigate}
          />
        );
    }
  };

  return (
    <AdminLayout
      activePage={activePage}
      onNavigate={navigate}
    >
      {renderPage()}
    </AdminLayout>
  );
}

interface AdminAppProps {
  /**
   * When true, this entry point is reserved for
   * super_admin accounts.
   */
  superAdminMode?: boolean;
}

export default function AdminApp({
  superAdminMode = false,
}: AdminAppProps): React.ReactElement {
  const {
    isAdminLoggedIn,
    isAdminLoading,
    isSuperAdmin,
  } = useAdminContext();

  /*
   * Session restoration/loading screen.
   *
   * Never render the login page while the existing session
   * is still being checked.
   */
  if (isAdminLoading) {
    return (
      <div className="min-h-screen bg-[#071426] flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-7 h-7 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />

          <p className="text-xs text-white/40">
            Checking admin session...
          </p>
        </div>
      </div>
    );
  }

  /*
   * No authenticated admin session.
   */
  if (!isAdminLoggedIn) {
    return (
      <AdminErrorBoundary>
        {superAdminMode ? (
          <SuperAdminLoginScreen />
        ) : (
          <AdminLoginScreen />
        )}
      </AdminErrorBoundary>
    );
  }

  /*
   * /super-admin must never be accessible by ordinary
   * administrators.
   */
  if (superAdminMode && !isSuperAdmin) {
    return (
      <AdminErrorBoundary>
        <SuperAdminLoginScreen />
      </AdminErrorBoundary>
    );
  }

  /*
   * Authenticated Admin/Super Admin application.
   *
   * ErrorBoundary prevents a child admin page from turning
   * the entire screen into an unrecoverable white page.
   */
  return (
    <AdminErrorBoundary>
      <AdminDashboardApp />
    </AdminErrorBoundary>
  );
}
