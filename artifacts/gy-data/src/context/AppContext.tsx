// artifacts/gy-data/src/context/AppContext.tsx

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import type {
  User,
  Transaction,
  Notification,
} from '../data/mockData';

import { fetchDataPlans } from '../lib/api';
import type { DataPlan } from '../lib/api';

const API = '/api';

export interface Settings {
  theme: 'light' | 'dark' | 'system';
  biometrics: boolean;
  autoLock: string;
  notifications: {
    transactions: boolean;
    promotional: boolean;
    security: boolean;
    email: boolean;
  };
  hideBalanceDefault: boolean;
}

export interface CashbackSettings {
  enabled: boolean;
  minTransferAmount: number;
  transferMode: 'manual' | 'auto';
  eligibleServices: string[];
}

export interface PurchaseResult {
  success: boolean;
  requestId: string;
  status?: string;
  pending?: boolean;
  error?: string;
  balance?: string;
  amount?: string;
  network?: string;
  phone?: string;
  planName?: string;
  price?: string;
  cashbackApplied?: boolean;
  cashbackAmount?: number;
}

interface LoginResult {
  success: boolean;
  error?: string;
}

interface RegisterResult {
  success: boolean;
  error?: string;
}

interface PinResetResult {
  success: boolean;
  devOtp?: string;
  error?: string;
}

interface AppContextValue {
  user: User | null;
  balance: number;
  cashbackBalance: number;
  cashbackSettings: CashbackSettings | null;

  transactions: Transaction[];
  notifications: Notification[];

  settings: Settings;

  balanceHidden: boolean;
  activeTab: string;
  unreadCount: number;

  isLoading: boolean;
  isAuthenticated: boolean;

  login: (
    phone: string,
    loginPin: string,
  ) => Promise<LoginResult>;

  logout: () => Promise<void>;

  register: (
    name: string,
    email: string,
    phone: string,
    username: string,
    loginPin: string,
  ) => Promise<RegisterResult>;

  accountExists: (
    phone: string,
  ) => Promise<boolean>;

  checkUsernameAvailable: (
    username: string,
  ) => Promise<'available' | 'taken' | 'error'>;

  changeUsername: (
    username: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;

  requestPinReset: (
    phone: string,
  ) => Promise<PinResetResult>;

  resetPin: (
    phone: string,
    otp: string,
    newPin: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;

  verifyPin: (
    pin: string,
  ) => Promise<boolean>;

  changePin: (
    currentPin: string,
    newPin: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;

  verifyPurchasePin: (
    purchasePin: string,
  ) => Promise<boolean>;

  changePurchasePin: (
    currentPurchasePin: string,
    newPurchasePin: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;

  purchaseData: (params: {
    network: string;
    phone: string;
    planCode: string;
    planName: string;
    planPrice: string | number;
    purchasePin: string;
    idempotencyKey?: string | null;
  }) => Promise<PurchaseResult>;

  purchaseAirtime: (params: {
    network: string;
    phone: string;
    amount: number;
    purchasePin: string;
    idempotencyKey?: string | null;
  }) => Promise<PurchaseResult>;

  toggleBalanceHidden: () => void;

  setActiveTab: (tab: string) => void;

  refreshWallet: () => Promise<void>;

  refreshCashbackWallet: () => Promise<void>;

  transferCashback: () => Promise<{
    ok: boolean;
    transferred?: number;
    error?: string;
  }>;

  updateSettings: (
    partial: Partial<Settings>,
  ) => Promise<void>;

  markAllNotificationsRead: () => Promise<void>;

  markNotificationRead: (
    id: string,
  ) => Promise<void>;

  deleteNotification: (
    id: string,
  ) => Promise<void>;

  clearAllNotifications: () => Promise<void>;

  refreshAll: () => Promise<void>;

  fetchDataPlans: (
    network: string,
  ) => Promise<DataPlan[]>;
}

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  biometrics: false,
  autoLock: '5',
  notifications: {
    transactions: true,
    promotional: true,
    security: true,
    email: true,
  },
  hideBalanceDefault: false,
};

const AppContext =
  createContext<AppContextValue | undefined>(
    undefined,
  );

function toNumber(
  value: unknown,
): number {
  if (
    typeof value === 'number' &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === 'string' &&
    value.trim() !== ''
  ) {
    const parsed = Number(value);
    return Number.isFinite(parsed)
      ? parsed
      : 0;
  }

  return 0;
}

function normalizeTransaction(
  transaction: any,
): Transaction {
  return {
    ...transaction,
    id: String(transaction.id ?? ''),
    amount: toNumber(transaction.amount),
  } as Transaction;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(
    `${API}${path}`,
    {
      credentials: 'include',
      headers: {
        'Content-Type':
          'application/json',
        ...(options.headers || {}),
      },
      ...options,
    },
  );

  let data: any = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
        data?.message ||
        `Request failed: ${response.status}`,
    );
  }

  return data as T;
}

export function AppProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [user, setUser] =
    useState<User | null>(null);

  const [balance, setBalance] =
    useState(0);

  const [cashbackBalance, setCashbackBalance] =
    useState(0);

  const [cashbackSettings, setCashbackSettings] =
    useState<CashbackSettings | null>(null);

  const [transactions, setTransactions] =
    useState<Transaction[]>([]);

  const [notifications, setNotifications] =
    useState<Notification[]>([]);

  const [settings, setSettings] =
    useState<Settings>(
      DEFAULT_SETTINGS,
    );

  const [balanceHidden, setBalanceHidden] =
    useState(
      DEFAULT_SETTINGS.hideBalanceDefault,
    );

  const [activeTab, setActiveTab] =
    useState('home');

  const [isLoading, setIsLoading] =
    useState(true);

  const refreshWallet =
    useCallback(async () => {
      if (!user) return;

      try {
        const data =
          await request<{
            balance?: number | string;
          }>('/wallet');

        const nextBalance =
          toNumber(data.balance);

        setBalance(nextBalance);
      } catch {
        // Keep existing balance if request fails.
      }
    }, [user]);

  const refreshCashbackWallet =
    useCallback(async () => {
      if (!user) return;

      try {
        const data =
          await request<{
            balance?: number | string;
            cashbackBalance?:
              | number
              | string;
          }>('/cashback/wallet');

        setCashbackBalance(
          toNumber(
            data.cashbackBalance ??
              data.balance,
          ),
        );
      } catch {
        // Keep existing cashback balance.
      }
    }, [user]);

  const refreshTransactions =
    useCallback(async () => {
      if (!user) return;

      try {
        const data =
          await request<{
            transactions?: unknown[];
          }>('/user/transactions');

        setTransactions(
          Array.isArray(
            data.transactions,
          )
            ? data.transactions.map(
                normalizeTransaction,
              )
            : [],
        );
      } catch {
        // Keep existing transactions.
      }
    }, [user]);

  const refreshNotifications =
    useCallback(async () => {
      if (!user) return;

      try {
        const data =
          await request<{
            notifications?: Notification[];
          }>('/notifications');

        if (
          Array.isArray(
            data.notifications,
          )
        ) {
          setNotifications(
            data.notifications,
          );
        }
      } catch {
        // Keep existing notifications.
      }
    }, [user]);

  const refreshSettings =
    useCallback(async () => {
      if (!user) return;

      try {
        const data =
          await request<{
            settings?: Partial<Settings>;
          }>('/settings');

        if (data.settings) {
          setSettings(
            current => ({
              ...current,
              ...data.settings,
              notifications: {
                ...current.notifications,
                ...(data.settings
                  .notifications || {}),
              },
            }),
          );
        }
      } catch {
        // Keep existing settings.
      }
    }, [user]);

  /*
   * IMPORTANT WALLET FIX
   *
   * The admin manual-funding endpoint updates the database, but the
   * original client did not refresh the wallet after that database change.
   *
   * This polling effect keeps the user's wallet synchronized with the
   * database. It also refreshes immediately when the app becomes visible
   * or receives focus.
   *
   * Therefore:
   *
   * Admin credits ₦5,000
   *       ↓
   * wallets.balance becomes ₦5,000
   *       ↓
   * this effect calls GET /api/wallet
   *       ↓
   * setBalance(5000)
   *       ↓
   * user sees ₦5,000
   */
  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    const syncWallet = async () => {
      if (cancelled) return;

      try {
        const data =
          await request<{
            balance?: number | string;
          }>('/wallet');

        if (cancelled) return;

        setBalance(
          toNumber(data.balance),
        );
      } catch {
        // Do not reset balance to zero on failure.
      }
    };

    void syncWallet();

    const intervalId =
      window.setInterval(
        () => {
          void syncWallet();
        },
        3000,
      );

    const handleVisibility =
      () => {
        if (
          document.visibilityState ===
          'visible'
        ) {
          void syncWallet();
        }
      };

    const handleFocus = () => {
      void syncWallet();
    };

    document.addEventListener(
      'visibilitychange',
      handleVisibility,
    );

    window.addEventListener(
      'focus',
      handleFocus,
    );

    return () => {
      cancelled = true;

      window.clearInterval(
        intervalId,
      );

      document.removeEventListener(
        'visibilitychange',
        handleVisibility,
      );

      window.removeEventListener(
        'focus',
        handleFocus,
      );
    };
  }, [user]);

  const refreshAll =
    useCallback(async () => {
      if (!user) return;

      await Promise.all([
        refreshWallet(),
        refreshCashbackWallet(),
        refreshTransactions(),
        refreshNotifications(),
        refreshSettings(),
      ]);
    }, [
      user,
      refreshWallet,
      refreshCashbackWallet,
      refreshTransactions,
      refreshNotifications,
      refreshSettings,
    ]);

  const login = useCallback(
    async (
      phone: string,
      loginPin: string,
    ): Promise<LoginResult> => {
      try {
        const data =
          await request<{
            success?: boolean;
            user?: User;
            error?: string;
          }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
              phone,
              loginPin,
            }),
          });

        if (
          !data.success ||
          !data.user
        ) {
          return {
            success: false,
            error:
              data.error ||
              'Login failed.',
          };
        }

        setUser(data.user);

        return {
          success: true,
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error
              ? error.message
              : 'Login failed.',
        };
      }
    },
    [],
  );

  const logout =
    useCallback(async () => {
      try {
        await request(
          '/auth/logout',
          {
            method: 'POST',
          },
        );
      } catch {
        // Continue local logout even if
        // server logout fails.
      }

      setUser(null);
      setBalance(0);
      setCashbackBalance(0);
      setCashbackSettings(null);
      setTransactions([]);
      setNotifications([]);
      setActiveTab('home');
    }, []);

  const register =
    useCallback(
      async (
        name: string,
        email: string,
        phone: string,
        username: string,
        loginPin: string,
      ): Promise<RegisterResult> => {
        try {
          const data =
            await request<{
              success?: boolean;
              user?: User;
              error?: string;
            }>('/auth/register', {
              method: 'POST',
              body: JSON.stringify({
                name,
                email,
                phone,
                username,
                loginPin,
              }),
            });

          if (!data.success) {
            return {
              success: false,
              error:
                data.error ||
                'Registration failed.',
            };
          }

          if (data.user) {
            setUser(data.user);
          }

          return {
            success: true,
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Registration failed.',
          };
        }
      },
      [],
    );

  const accountExists =
    useCallback(
      async (
        phone: string,
      ): Promise<boolean> => {
        try {
          const data =
            await request<{
              exists?: boolean;
            }>(
              `/auth/account-exists?phone=${encodeURIComponent(
                phone,
              )}`,
            );

          return Boolean(
            data.exists,
          );
        } catch {
          return false;
        }
      },
      [],
    );

  const checkUsernameAvailable =
    useCallback(
      async (
        username: string,
      ): Promise<
        'available' | 'taken' | 'error'
      > => {
        try {
          const data =
            await request<{
              available?: boolean;
            }>(
              `/auth/username-available?username=${encodeURIComponent(
                username,
              )}`,
            );

          return data.available
            ? 'available'
            : 'taken';
        } catch {
          return 'error';
        }
      },
      [],
    );

  const changeUsername =
    useCallback(
      async (
        username: string,
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              user?: User;
              error?: string;
            }>('/user/username', {
              method: 'PATCH',
              body: JSON.stringify({
                username,
              }),
            });

          if (
            data.ok &&
            data.user
          ) {
            setUser(data.user);
          }

          return {
            ok: Boolean(data.ok),
            error: data.error,
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to change username.',
          };
        }
      },
      [],
    );

  const requestPinReset =
    useCallback(
      async (
        phone: string,
      ): Promise<PinResetResult> => {
        try {
          const data =
            await request<{
              success?: boolean;
              devOtp?: string;
              error?: string;
            }>('/auth/request-pin-reset', {
              method: 'POST',
              body: JSON.stringify({
                phone,
              }),
            });

          return {
            success: Boolean(
              data.success,
            ),
            devOtp: data.devOtp,
            error: data.error,
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to request PIN reset.',
          };
        }
      },
      [],
    );

  const resetPin =
    useCallback(
      async (
        phone: string,
        otp: string,
        newPin: string,
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              error?: string;
            }>('/auth/reset-pin', {
              method: 'POST',
              body: JSON.stringify({
                phone,
                otp,
                newPin,
              }),
            });

          return {
            ok: Boolean(data.ok),
            error: data.error,
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to reset PIN.',
          };
        }
      },
      [],
    );

  const verifyPin =
    useCallback(
      async (
        pin: string,
      ): Promise<boolean> => {
        try {
          const data =
            await request<{
              valid?: boolean;
            }>('/auth/verify-pin', {
              method: 'POST',
              body: JSON.stringify({
                pin,
              }),
            });

          return Boolean(
            data.valid,
          );
        } catch {
          return false;
        }
      },
      [],
    );

  const changePin =
    useCallback(
      async (
        currentPin: string,
        newPin: string,
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              error?: string;
            }>('/auth/change-pin', {
              method: 'POST',
              body: JSON.stringify({
                currentPin,
                newPin,
              }),
            });

          return {
            ok: Boolean(data.ok),
            error: data.error,
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to change PIN.',
          };
        }
      },
      [],
    );

  const verifyPurchasePin =
    useCallback(
      async (
        purchasePin: string,
      ): Promise<boolean> => {
        try {
          const data =
            await request<{
              valid?: boolean;
            }>('/auth/verify-purchase-pin', {
              method: 'POST',
              body: JSON.stringify({
                purchasePin,
              }),
            });

          return Boolean(
            data.valid,
          );
        } catch {
          return false;
        }
      },
      [],
    );

  const changePurchasePin =
    useCallback(
      async (
        currentPurchasePin: string,
        newPurchasePin: string,
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              error?: string;
            }>('/auth/change-purchase-pin', {
              method: 'POST',
              body: JSON.stringify({
                currentPurchasePin,
                newPurchasePin,
              }),
            });

          return {
            ok: Boolean(data.ok),
            error: data.error,
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to change purchase PIN.',
          };
        }
      },
      [],
    );

  const purchaseData =
    useCallback(
      async (params: {
        network: string;
        phone: string;
        planCode: string;
        planName: string;
        planPrice: string | number;
        purchasePin: string;
        idempotencyKey?: string | null;
      }): Promise<PurchaseResult> => {
        try {
          const data =
            await request<PurchaseResult>(
              '/purchase/data',
              {
                method: 'POST',
                body: JSON.stringify(
                  params,
                ),
              },
            );

          /*
           * Purchase changes the wallet too.
           * Refresh immediately after every purchase so the UI never
           * relies only on an old local balance.
           */
          if (data.success) {
            await refreshWallet();
            await refreshTransactions();
          }

          return data;
        } catch (error) {
          return {
            success: false,
            requestId: '',
            error:
              error instanceof Error
                ? error.message
                : 'Purchase failed.',
          };
        }
      },
      [
        refreshWallet,
        refreshTransactions,
      ],
    );

  const purchaseAirtime =
    useCallback(
      async (params: {
        network: string;
        phone: string;
        amount: number;
        purchasePin: string;
        idempotencyKey?: string | null;
      }): Promise<PurchaseResult> => {
        try {
          const data =
            await request<PurchaseResult>(
              '/purchase/airtime',
              {
                method: 'POST',
                body: JSON.stringify(
                  params,
                ),
              },
            );

          if (data.success) {
            await refreshWallet();
            await refreshTransactions();
          }

          return data;
        } catch (error) {
          return {
            success: false,
            requestId: '',
            error:
              error instanceof Error
                ? error.message
                : 'Purchase failed.',
          };
        }
      },
      [
        refreshWallet,
        refreshTransactions,
      ],
    );

  const toggleBalanceHidden =
    useCallback(() => {
      setBalanceHidden(
        value => !value,
      );
    }, []);

  const transferCashback =
    useCallback(
      async () => {
        try {
          const data =
            await request<{
              ok?: boolean;
              transferred?: number;
              error?: string;
            }>(
              '/cashback/transfer',
              {
                method: 'POST',
              },
            );

          if (data.ok) {
            await refreshWallet();
            await refreshCashbackWallet();
            await refreshTransactions();
          }

          return {
            ok: Boolean(data.ok),
            transferred:
              data.transferred,
            error: data.error,
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Cashback transfer failed.',
          };
        }
      },
      [
        refreshWallet,
        refreshCashbackWallet,
        refreshTransactions,
      ],
    );

  const updateSettings =
    useCallback(
      async (
        partial: Partial<Settings>,
      ) => {
        try {
          const data =
            await request<{
              settings?: Partial<Settings>;
            }>('/settings', {
              method: 'PATCH',
              body: JSON.stringify(
                partial,
              ),
            });

          setSettings(
            current => ({
              ...current,
              ...partial,
              ...(data.settings ||
                {}),
              notifications: {
                ...current.notifications,
                ...(partial.notifications ||
                  {}),
                ...(data.settings
                  ?.notifications ||
                  {}),
              },
            }),
          );
        } catch {
          // Keep current settings.
        }
      },
      [],
    );

  const markAllNotificationsRead =
    useCallback(async () => {
      try {
        await request(
          '/notifications/read-all',
          {
            method: 'POST',
          },
        );

        setNotifications(
          current =>
            current.map(
              notification => ({
                ...notification,
                read: true,
              }),
            ),
        );
      } catch {
        // Keep existing notifications.
      }
    }, []);

  const markNotificationRead =
    useCallback(
      async (
        id: string,
      ) => {
        try {
          await request(
            `/notifications/${encodeURIComponent(
              id,
            )}/read`,
            {
              method: 'POST',
            },
          );

          setNotifications(
            current =>
              current.map(
                notification =>
                  String(
                    notification.id,
                  ) === String(id)
                    ? {
                        ...notification,
                        read: true,
                      }
                    : notification,
              ),
          );
        } catch {
          // Keep existing notifications.
        }
      },
      [],
    );

  const deleteNotification =
    useCallback(
      async (
        id: string,
      ) => {
        try {
          await request(
            `/notifications/${encodeURIComponent(
              id,
            )}`,
            {
              method: 'DELETE',
            },
          );

          setNotifications(
            current =>
              current.filter(
                notification =>
                  String(
                    notification.id,
                  ) !== String(id),
              ),
          );
        } catch {
          // Keep existing notifications.
        }
      },
      [],
    );

  const clearAllNotifications =
    useCallback(async () => {
      try {
        await request(
          '/notifications',
          {
            method: 'DELETE',
          },
        );

        setNotifications([]);
      } catch {
        // Keep existing notifications.
      }
    }, []);

  const fetchPlans =
    useCallback(
      async (
        network: string,
      ): Promise<DataPlan[]> => {
        try {
          return await fetchDataPlans(
            network,
          );
        } catch {
          return [];
        }
      },
      [],
    );

  /*
   * Load the current session on startup.
   */
  useEffect(() => {
    let cancelled = false;

    const loadSession =
      async () => {
        setIsLoading(true);

        try {
          const data =
            await request<{
              user?: User | null;
            }>('/auth/me');

          if (
            !cancelled &&
            data.user
          ) {
            setUser(data.user);
          }
        } catch {
          if (!cancelled) {
            setUser(null);
          }
        } finally {
          if (!cancelled) {
            setIsLoading(false);
          }
        }
      };

    void loadSession();

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * Initial wallet/data synchronization whenever the authenticated user
   * changes.
   */
  useEffect(() => {
    if (!user) {
      setBalance(0);
      setCashbackBalance(0);
      setTransactions([]);
      return;
    }

    void refreshAll();
  }, [
    user,
    refreshAll,
  ]);

  /*
   * Keep the balance fresh after returning to the app.
   */
  useEffect(() => {
    if (!user) return;

    const handlePageShow =
      () => {
        void refreshWallet();
      };

    window.addEventListener(
      'pageshow',
      handlePageShow,
    );

    return () => {
      window.removeEventListener(
        'pageshow',
        handlePageShow,
      );
    };
  }, [
    user,
    refreshWallet,
  ]);

  const unreadCount =
    useMemo(
      () =>
        notifications.filter(
          notification =>
            !notification.read,
        ).length,
      [notifications],
    );

  const isAuthenticated =
    Boolean(user);

  const value =
    useMemo<AppContextValue>(
      () => ({
        user,
        balance,
        cashbackBalance,
        cashbackSettings,

        transactions,
        notifications,

        settings,

        balanceHidden,
        activeTab,
        unreadCount,

        isLoading,
        isAuthenticated,

        login,
        logout,
        register,
        accountExists,
        checkUsernameAvailable,
        changeUsername,
        requestPinReset,
        resetPin,
        verifyPin,
        changePin,
        verifyPurchasePin,
        changePurchasePin,

        purchaseData,
        purchaseAirtime,

        toggleBalanceHidden,
        setActiveTab,

        refreshWallet,
        refreshCashbackWallet,

        transferCashback,

        updateSettings,

        markAllNotificationsRead,
        markNotificationRead,
        deleteNotification,
        clearAllNotifications,

        refreshAll,

        fetchDataPlans:
          fetchPlans,
      }),
      [
        user,
        balance,
        cashbackBalance,
        cashbackSettings,
        transactions,
        notifications,
        settings,
        balanceHidden,
        activeTab,
        unreadCount,
        isLoading,
        isAuthenticated,

        login,
        logout,
        register,
        accountExists,
        checkUsernameAvailable,
        changeUsername,
        requestPinReset,
        resetPin,
        verifyPin,
        changePin,
        verifyPurchasePin,
        changePurchasePin,

        purchaseData,
        purchaseAirtime,

        toggleBalanceHidden,

        refreshWallet,
        refreshCashbackWallet,

        transferCashback,
        updateSettings,

        markAllNotificationsRead,
        markNotificationRead,
        deleteNotification,
        clearAllNotifications,

        refreshAll,
        fetchPlans,
      ],
    );

  return (
    <AppContext.Provider
      value={value}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const context =
    useContext(AppContext);

  if (!context) {
    throw new Error(
      'useApp must be used inside AppProvider',
    );
  }

  return context;
}

export default AppContext;
