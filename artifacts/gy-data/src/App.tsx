import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { AppProvider, useAppContext } from './context/AppContext';
import { AdminProvider } from './admin/context/AdminContext';
import AdminApp from './admin/AdminApp';

// Screen Imports
import LoginScreen from './pages/LoginScreen';
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

// ── Customer App ─────────────────────────────────────────────────────────────

function MainApp() {
  const { activeTab } = useAppContext();

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground overflow-hidden">
      <div className="flex-1 overflow-y-auto pb-20">
        <Switch>
          <Route path="/data" component={BuyDataScreen} />
          <Route path="/airtime" component={BuyAirtimeScreen} />
          <Route path="/settings" component={SettingsScreen} />
          <Route path="/notifications" component={NotificationsScreen} />
          <Route path="/">
            {activeTab === 'home' && <HomeScreen />}
            {activeTab === 'wallet' && <WalletScreen />}
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
  const { isLoggedIn } = useAppContext();
  return (
    <Switch>
      {!isLoggedIn ? (
        <Route path="*" component={LoginScreen} />
      ) : (
        <Route path="*" component={MainApp} />
      )}
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
