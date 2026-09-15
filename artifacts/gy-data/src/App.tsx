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

// ── Splash / Session Loading Screen ───────────────────────────────────────────

function SessionLoadingScreen() {
  return (
    <div
      className="relative flex h-[100dvh] w-full items-center justify-center overflow-hidden"
      style={{
        background:
          'linear-gradient(180deg, #061B4A 0%, #062B72 55%, #03183F 100%)',
      }}
    >
      <div className="relative h-full w-full">
        <img
          src="/gy-data-splash.png"
          alt="Gy-Data-Hub"
          className="absolute inset-0 h-full w-full object-cover"
        />

        <div className="absolute bottom-[7%] left-1/2 -translate-x-1/2">
          <div
            className="h-10 w-10 animate-spin rounded-full"
            style={{
              border:
                '4px solid rgba(255,255,255,0.18)',
              borderTopColor: '#13B9FF',
              borderRightColor: '#1684FF',
            }}
            aria-label="Loading"
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
  const {
    isAuthenticated,
    isLoading,
  } = useAppContext();

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
