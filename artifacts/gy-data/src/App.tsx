import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { AppProvider, useAppContext } from './context/AppContext';
import { AdminProvider } from './admin/context/AdminContext';
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

import BottomNav from './components/BottomNav';

const queryClient = new QueryClient();

// ── Loading screen — shown while session check is in flight ───────────────────
function SessionLoadingScreen() {
  return (
    <div className="flex h-[100dvh] flex-col items-center justify-center gap-4"
      style={{ background: 'linear-gradient(160deg, #0B1F4E 0%, #102B6A 35%, #1A3D8F 65%, #1E4DB7 100%)' }}>
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)', boxShadow: '0 8px 32px rgba(37,99,235,0.45)' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.55a11 11 0 0 1 14.08 0"/>
          <path d="M1.42 9a16 16 0 0 1 21.16 0"/>
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/>
          <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3"/>
        </svg>
      </div>
      <div className="flex gap-1.5 mt-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-2 h-2 bg-white/60 rounded-full animate-bounce"
            style={{ animationDelay: `${i * 0.15}s` }} />
        ))}
      </div>
    </div>
  );
}

// ── Customer App ─────────────────────────────────────────────────────────────

function MainApp() {
  const { activeTab } = useAppContext();

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden">
      <div className="flex-1 overflow-y-auto min-h-0">
        <Switch>
          <Route path="/data"          component={BuyDataScreen} />
          <Route path="/airtime"       component={BuyAirtimeScreen} />
          <Route path="/settings"      component={SettingsScreen} />
          <Route path="/notifications" component={NotificationsScreen} />
          <Route path="/">
            {activeTab === 'home'    && <HomeScreen />}
            {activeTab === 'wallet'  && <WalletScreen />}
            {activeTab === 'history' && <TransactionHistoryScreen />}
            {activeTab === 'profile' && <ProfileScreen />}
            {activeTab === 'services' && <HomeScreen />}
          </Route>
        </Switch>
      </div>
      <BottomNav />
    </div>
  );
}

function CustomerRouter() {
  const { isLoggedIn, isLoading } = useAppContext();

  // Neutral loading screen while the /api/auth/me check is in flight.
  // Prevents a flash of the login screen for users who are already logged in.
  if (isLoading) return <SessionLoadingScreen />;

  return (
    <Switch>
      {/* Auth screens — always accessible */}
      <Route path="/register"   component={RegisterScreen} />
      <Route path="/forgot-pin" component={ForgotPinScreen} />
      <Route path="*">
        {isLoggedIn ? <MainApp /> : <LoginScreen />}
      </Route>
    </Switch>
  );
}

function CustomerApp() {
  return (
    <AppProvider>
      <TooltipProvider>
        <CustomerRouter />
      </TooltipProvider>
    </AppProvider>
  );
}

// ── Root Router — splits /admin from customer app ─────────────────────────────

function RootRouter() {
  const [location] = useLocation();
  const isAdmin = location === '/admin' || location.startsWith('/admin/');

  if (isAdmin) {
    return (
      <AdminProvider>
        <AdminApp />
      </AdminProvider>
    );
  }

  return <CustomerApp />;
}

// ── App Entry ─────────────────────────────────────────────────────────────────

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <RootRouter />
        <Toaster position="top-center" theme="dark" />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
