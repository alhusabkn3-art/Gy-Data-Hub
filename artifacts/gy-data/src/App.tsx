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

import { AdminProvider } from './admin/context/AdminContext';
import AdminApp from './admin/AdminApp';

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

/* ────────────────────────────────────────────────────────────────────────────
   SPLASH / SESSION LOADING SCREEN
   ──────────────────────────────────────────────────────────────────────────── */

function SessionLoadingScreen() {
  return (
    <div className="fixed inset-0 flex h-[100dvh] w-full items-center justify-center overflow-hidden bg-white">
      <div className="relative flex h-full w-full max-w-[480px] flex-col items-center justify-center px-6">
        
        {/* Clean splash design */}
        <div className="flex w-full flex-col items-center justify-center">
          
          <div className="relative flex h-32 w-32 items-center justify-center rounded-[32px] bg-white shadow-[0_12px_45px_rgba(0,0,0,0.10)]">
            <img
              src="/gy-data-logo.svg"
              alt="GY DATA"
              className="h-24 w-24 object-contain"
            />
          </div>

          <div className="mt-7 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-[#075CC4]">
              GY DATA
            </h1>

            <p className="mt-1 text-sm font-medium text-gray-500">
              Endless Joy
            </p>
          </div>

          {/* Loading indicator */}
          <div className="mt-10 flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#075CC4]"
              style={{ animationDelay: '0s' }}
            />

            <span
              className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#0A8FE0]"
              style={{ animationDelay: '0.15s' }}
            />

            <span
              className="h-2.5 w-2.5 animate-bounce rounded-full bg-[#13A7F5]"
              style={{ animationDelay: '0.30s' }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   MAIN CUSTOMER APPLICATION
   ──────────────────────────────────────────────────────────────────────────── */

function MainApp() {
  const { activeTab } = useAppContext();

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-background text-foreground">
      <div className="min-h-0 flex-1 overflow-y-auto">
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
            {activeTab === 'home' && <HomeScreen />}

            {activeTab === 'wallet' && <WalletScreen />}

            {activeTab === 'history' && (
              <TransactionHistoryScreen />
            )}

            {activeTab === 'profile' && <ProfileScreen />}

            {activeTab === 'services' && <HomeScreen />}
          </Route>

        </Switch>
      </div>

      <BottomNav />
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   CUSTOMER ROUTER
   ──────────────────────────────────────────────────────────────────────────── */

function CustomerRouter() {
  const {
    isAuthenticated,
    isLoading,
  } = useAppContext();

  if (isLoading) {
    return <SessionLoadingScreen />;
  }

  return (
    <Switch>

      <Route
        path="/register"
        component={RegisterScreen}
      />

      <Route
        path="/forgot-pin"
        component={ForgotPinScreen}
      />

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

/* ────────────────────────────────────────────────────────────────────────────
   CUSTOMER PROVIDER
   ──────────────────────────────────────────────────────────────────────────── */

function CustomerApp() {
  return (
    <AppProvider>
      <TooltipProvider>
        <CustomerRouter />
      </TooltipProvider>
    </AppProvider>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   ROOT ROUTER
   ──────────────────────────────────────────────────────────────────────────── */

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

/* ────────────────────────────────────────────────────────────────────────────
   APPLICATION ENTRY
   ──────────────────────────────────────────────────────────────────────────── */

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter
        base={import.meta.env.BASE_URL.replace(/\/$/, '')}
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
