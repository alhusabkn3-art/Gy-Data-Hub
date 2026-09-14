import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Route,
  Switch,
  Router as WouterRouter,
  useLocation,
} from 'wouter';

import {
  AppProvider,
  useAppContext,
} from './context/AppContext';

import {
  AdminProvider,
} from './admin/context/AdminContext';

import AdminApp from './admin/AdminApp';

// Screen Imports
import LoginScreen from './pages/LoginScreen';
import RegisterScreen from './pages/RegisterScreen';
import ForgotPinScreen from './pages/ForgotPinScreen';
import HomeScreen from './pages/HomeScreen';
import WalletScreen from './pages/WalletScreen';
import TransactionHistoryScreen from './pages/TransactionHistoryScreen';
import NotificationsScreen from './pages/NotificationsScreen';
import ProfileScreen from './pages/ProfileScreen';
import SettingsScreen from './pages/SettingsScreen';
import BuyDataScreen from './pages/BuyDataScreen';
import BuyAirtimeScreen from './pages/BuyAirtimeScreen';
import PersonalInfoScreen from './pages/PersonalInfoScreen';
import BankAccountScreen from './pages/BankAccountScreen';
import KYCScreen from './pages/KYCScreen';
import ReferralScreen from './pages/ReferralScreen';
import SupportScreen from './pages/SupportScreen';
import AboutScreen from './pages/AboutScreen';
import ChangeUsernameScreen from './pages/ChangeUsernameScreen';

import BottomNav from './components/BottomNav';

const queryClient = new QueryClient();

// ── Loading screen ────────────────────────────────────────────────────────────

function SessionLoadingScreen() {
  return (
    <div
      className="flex h-[100dvh] flex-col items-center justify-center overflow-hidden"
      style={{
        background: '#FFFFFF',
      }}
    >
      <div className="w-full max-w-[420px] px-6 flex flex-col items-center">
        <img
          src="/gy-data-logo.svg"
          alt="GY DATA - Endless Joy"
          className="w-full h-auto object-contain"
        />

        <div className="flex gap-2 mt-8">
          <div
            className="w-2.5 h-2.5 rounded-full animate-bounce"
            style={{
              background: '#075CC4',
              animationDelay: '0s',
            }}
          />

          <div
            className="w-2.5 h-2.5 rounded-full animate-bounce"
            style={{
              background: '#0A8FE0',
              animationDelay: '0.15s',
            }}
          />

          <div
            className="w-2.5 h-2.5 rounded-full animate-bounce"
            style={{
              background: '#13A7F5',
              animationDelay: '0.30s',
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Main Customer Application ─────────────────────────────────────────────────

function MainApp() {
  const { activeTab } = useAppContext();

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden">
      <div className="flex-1 overflow-y-auto min-h-0">
        <Switch>

          <Route
            path="/data"
            component={BuyDataScreen}
          />

          <Route
            path="/airtime"
            component={BuyAirtimeScreen}
          />

          <Route
            path="/settings"
            component={SettingsScreen}
          />

          <Route
            path="/notifications"
            component={NotificationsScreen}
          />

          <Route
            path="/profile/personal"
            component={PersonalInfoScreen}
          />

          <Route
            path="/profile/username"
            component={ChangeUsernameScreen}
          />

          <Route
            path="/profile/bank"
            component={BankAccountScreen}
          />

          <Route
            path="/profile/kyc"
            component={KYCScreen}
          />

          <Route
            path="/profile/referral"
            component={ReferralScreen}
          />

          <Route
            path="/profile/support"
            component={SupportScreen}
          />

          <Route
            path="/profile/about"
            component={AboutScreen}
          />

          <Route path="/">
            {activeTab === 'home' && (
              <HomeScreen />
            )}

            {activeTab === 'wallet' && (
              <WalletScreen />
            )}

            {activeTab === 'history' && (
              <TransactionHistoryScreen />
            )}

            {activeTab === 'profile' && (
              <ProfileScreen />
            )}

            {activeTab === 'services' && (
              <HomeScreen />
            )}
          </Route>

        </Switch>
      </div>

      <BottomNav />
    </div>
  );
}

// ── Customer Router ───────────────────────────────────────────────────────────

function CustomerRouter() {
  /*
   * IMPORTANT:
   *
   * AppContext exposes:
   *
   *   isAuthenticated
   *   isLoading
   *
   * It does NOT expose isLoggedIn.
   *
   * The previous code used:
   *
   *   const { isLoggedIn, isLoading } = useAppContext();
   *
   * which caused the router to remain on LoginScreen
   * even after a successful login.
   */

  const {
    isAuthenticated,
    isLoading,
  } = useAppContext();

  // Wait until /api/auth/me finishes restoring the session.
  if (isLoading) {
    return <SessionLoadingScreen />;
  }

  return (
    <Switch>

      {/* Registration */}
      <Route
        path="/register"
        component={RegisterScreen}
      />

      {/* Forgot PIN */}
      <Route
        path="/forgot-pin"
        component={ForgotPinScreen}
      />

      {/* All other customer routes */}
      <Route path="*">
        {isAuthenticated ? (
          <MainApp />
        ) : (
          <LoginScreen />
        )}
      </Route>

    </Switch>
  );
}

// ── Customer Application Provider ─────────────────────────────────────────────

function CustomerApp() {
  return (
    <AppProvider>
      <TooltipProvider>
        <CustomerRouter />
      </TooltipProvider>
    </AppProvider>
  );
}

// ── Root Router ───────────────────────────────────────────────────────────────

function RootRouter() {
  const [location] = useLocation();

  const isAdminPath =
    location === '/admin' ||
    location === '/admin-login' ||
    location.startsWith('/admin/');

  const isSuperAdminPath =
    location === '/super-admin-login' ||
    location === '/super-admin' ||
    location.startsWith('/super-admin/');

  if (isAdminPath) {
    return (
      <AdminProvider>
        <AdminApp />
      </AdminProvider>
    );
  }

  if (isSuperAdminPath) {
    return (
      <AdminProvider>
        <AdminApp superAdminMode />
      </AdminProvider>
    );
  }

  return <CustomerApp />;
}

// ── Application Entry ─────────────────────────────────────────────────────────

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter
        base={import.meta.env.BASE_URL.replace(
          /\/$/,
          '',
        )}
      >
        <RootRouter />

        <Toaster
          position="top-center"
          theme="dark"
        />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
