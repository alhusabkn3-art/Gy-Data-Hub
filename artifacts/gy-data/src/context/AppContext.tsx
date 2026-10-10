import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

const API = '/api';

type User = {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  username: string;
  email: string;
  phone: string;
  accountNumber?: string | null;
  bankName?: string | null;
  referralCode?: string | null;
  kycStatus?: string | null;
  usernameChangedAt?: string | null;
  createdAt?: string | null;
  status?: string | null;
};

type Transaction = Record<string, unknown>;
type Notification = Record<string, unknown>;

type Settings = {
  theme: string;
  biometrics: boolean;
  autoLock: string;
  notifications: {
    transactions: boolean;
    promotional: boolean;
    security: boolean;
    email: boolean;
  };
  hideBalanceDefault: boolean;
};

type DataPlan = {
  DataPlan?: string | number;
  DataPlanName?: string;
  DataPlanType?: string;
  Price?: string | number;
  cashback_enabled?: boolean;
  cashback_type?: string;
  cashback_value?: string | number;
  cost_price?: string | number;
  pricing_rule_id?: string;
  plan_id?: string | number;
  id?: string | number;
  code?: string;
  planCode?: string;
  name?: string;
  planName?: string;
  network?: string;
  price?: string | number;
  amount?: string | number;
  validity?: string;
  data?: string;
  [key: string]: unknown;
};

type PurchaseResult = {
  success: boolean;
  requestId?: string;
  reference?: string;
  transactionId?: string;
  providerReference?: string;
  status?: string;
  pending?: boolean;
  balance?: number;
  amount?: number;
  error?: string;
  message?: string;
  transaction?: Record<string, unknown>;
  [key: string]: unknown;
};

type LoginResult = {
  success: boolean;
  error?: string;
};

type RegisterResult = {
  success: boolean;
  error?: string;
};

type PinResetResult = {
  ok: boolean;
  error?: string;
  message?: string;
};

type AppContextValue = {
  user: User | null;
  balance: number;
  cashbackBalance: number;
  cashbackSettings: Record<string, unknown> | null;
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

  register: (
    name: string,
    email: string,
    phone: string,
    username: string,
    loginPin: string,
    purchasePin: string,
  ) => Promise<RegisterResult>;

  logout: () => Promise<void>;

  accountExists: (
    phone: string,
  ) => Promise<boolean>;

  checkUsernameAvailable: (
    username: string,
  ) => Promise<
    'available' | 'taken' | 'error'
  >;

  changeUsername: (
    username: string,
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
    pin: string,
  ) => Promise<boolean>;

  changePurchasePin: (
    currentPin: string,
    newPin: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;

  requestPinReset: (
    phoneOrEmail: string,
  ) => Promise<PinResetResult>;

  resetPinWithCode: (
    identifier: string,
    code: string,
    newPin: string,
  ) => Promise<PinResetResult>;

  purchaseData: (
    network: string,
    planId: string,
    phone: string,
    purchasePin: string,
  ) => Promise<PurchaseResult>;

  purchaseAirtime: (
    network: string,
    amount: number,
    phone: string,
    purchasePin: string,
  ) => Promise<PurchaseResult>;

  toggleBalanceHidden: () => void;

  setActiveTab: (
    tab: string,
  ) => void;

  refreshWallet: () => Promise<void>;

  refreshCashbackWallet: () => Promise<void>;

  transferCashback: (
    amount: number,
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;

  updateSettings: (
    settings: Partial<Settings>,
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;

  refreshNotifications: () => Promise<void>;

  markNotificationRead: (
    id: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;

  markAllNotificationsRead: () => Promise<{
    ok: boolean;
    error?: string;
  }>;

  dataPlans: DataPlan[];
  dataPlansLoading: boolean;

  refreshDataPlans: (
    network?: string,
  ) => Promise<void>;
};

const defaultSettings: Settings = {
  theme: 'light',
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

function normalizeTransactions(
  value: unknown,
): Transaction[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    item =>
      item !== null &&
      typeof item === 'object',
  ) as Transaction[];
}

function normalizeNotifications(
  value: unknown,
): Notification[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    item =>
      item !== null &&
      typeof item === 'object',
  ) as Notification[];
}

function mergeSettings(
  current: Settings,
  incoming?: Partial<Settings> | null,
): Settings {
  if (!incoming) {
    return current;
  }

  return {
    ...current,
    ...incoming,
    notifications: {
      ...current.notifications,
      ...(incoming.notifications ?? {}),
    },
  };
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response =
    await fetch(
      `${API}${path}`,
      {
        ...init,
        credentials: 'include',
        headers: {
          'Content-Type':
            'application/json',
          ...(init?.headers ?? {}),
        },
      },
    );

  const text =
    await response.text();

  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const body =
      data &&
      typeof data === 'object'
        ? (
            data as Record<
              string,
              unknown
            >
          )
        : {};

    const message =
      typeof body.error === 'string'
        ? body.error
        : typeof body.message === 'string'
          ? body.message
          : `Request failed with status ${response.status}.`;

    throw new Error(message);
  }

  return data as T;
}

export function AppProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, setUser] =
    useState<User | null>(null);

  const [balance, setBalance] =
    useState(0);

  const [cashbackBalance, setCashbackBalance] =
    useState(0);

  const [cashbackSettings, setCashbackSettings] =
    useState<Record<string, unknown> | null>(
      null,
    );

  const [transactions, setTransactions] =
    useState<Transaction[]>([]);

  const [notifications, setNotifications] =
    useState<Notification[]>([]);

  const [settings, setSettings] =
    useState<Settings>(
      defaultSettings,
    );

  const [balanceHidden, setBalanceHidden] =
    useState(
      defaultSettings.hideBalanceDefault,
    );

  const [activeTab, setActiveTab] =
    useState('home');

  const [isLoading, setIsLoading] =
    useState(true);

  const [dataPlans, setDataPlans] =
    useState<DataPlan[]>([]);

  const [dataPlansLoading, setDataPlansLoading] =
    useState(false);

  const isAuthenticated =
    Boolean(user);

  const unreadCount =
    notifications.filter(
      notification => {
        const value =
          notification.read ??
          notification.isRead ??
          false;

        return value !== true;
      },
    ).length;

  const applySessionData =
    useCallback(
      (data: any) => {
        if (data?.user) {
          setUser(data.user);
        }

        if (
          typeof data?.balance ===
          'number'
        ) {
          setBalance(data.balance);
        }

        if (
          typeof data?.cashbackBalance ===
          'number'
        ) {
          setCashbackBalance(
            data.cashbackBalance,
          );
        }

        if (
          data?.cashbackSettings &&
          typeof data.cashbackSettings ===
            'object'
        ) {
          setCashbackSettings(
            data.cashbackSettings,
          );
        }

        if (
          Array.isArray(
            data?.transactions,
          )
        ) {
          setTransactions(
            normalizeTransactions(
              data.transactions,
            ),
          );
        }

        if (
          Array.isArray(
            data?.notifications,
          )
        ) {
          setNotifications(
            normalizeNotifications(
              data.notifications,
            ),
          );
        }

        if (
          data?.settings &&
          typeof data.settings ===
            'object'
        ) {
          setSettings(
            current =>
              mergeSettings(
                current,
                data.settings,
              ),
          );

          if (
            typeof data.settings
              .hideBalanceDefault ===
            'boolean'
          ) {
            setBalanceHidden(
              data.settings
                .hideBalanceDefault,
            );
          }
        }
      },
      [],
    );

  const refreshWallet =
    useCallback(async () => {
      try {
        const data =
          await request<any>(
            '/user/wallet',
          );

        if (
          typeof data?.balance ===
          'number'
        ) {
          setBalance(data.balance);
        } else if (
          typeof data?.wallet?.balance ===
          'number'
        ) {
          setBalance(
            data.wallet.balance,
          );
        }
      } catch (error) {
        console.error(
          'Wallet refresh failed:',
          error,
        );
      }
    }, []);

  const refreshCashbackWallet =
    useCallback(async () => {
      try {
        const data =
          await request<any>(
            '/cashback/user/wallet',
          );

        if (
          typeof data?.balance ===
          'number'
        ) {
          setCashbackBalance(
            data.balance,
          );
        } else if (
          typeof data?.cashbackBalance ===
          'number'
        ) {
          setCashbackBalance(
            data.cashbackBalance,
          );
        }

        if (
          data?.settings &&
          typeof data.settings ===
            'object'
        ) {
          setCashbackSettings(
            data.settings,
          );
        }
      } catch (error) {
        console.error(
          'Cashback wallet refresh failed:',
          error,
        );
      }
    }, []);

  const refreshNotifications =
    useCallback(async () => {
      if (!user) return;

      try {
        const data =
          await request<any>(
            '/user/notifications',
          );

        const list =
          Array.isArray(data)
            ? data
            : Array.isArray(
                  data?.notifications,
                )
              ? data.notifications
              : [];

        setNotifications(
          normalizeNotifications(list),
        );
      } catch (error) {
        console.error(
          'Notifications refresh failed:',
          error,
        );
      }
    }, [user]);

  const refreshTransactions =
    useCallback(async () => {
      if (!user) return;

      try {
        const data =
          await request<any>(
            '/user/transactions',
          );

        const list =
          Array.isArray(data)
            ? data
            : Array.isArray(
                  data?.transactions,
                )
              ? data.transactions
              : [];

        setTransactions(
          normalizeTransactions(list),
        );
      } catch (error) {
        console.error(
          'Transactions refresh failed:',
          error,
        );
      }
    }, [user]);

  const refreshDataPlans =
    useCallback(
      async (network?: string) => {
        setDataPlansLoading(true);

        try {
          const query =
            network
              ? `?network=${encodeURIComponent(
                  network,
                )}`
              : '';

          const data =
            await request<any>(
              `/purchase/data-plans${query}`,
            );

          const list =
            Array.isArray(data)
              ? data
              : Array.isArray(
                    data?.plans,
                  )
                ? data.plans
                : Array.isArray(
                      data?.data,
                    )
                  ? data.data
                  : [];

          setDataPlans(
            list as DataPlan[],
          );
        } catch (error) {
          console.error(
            'Data plans refresh failed:',
            error,
          );

          setDataPlans([]);
        } finally {
          setDataPlansLoading(false);
        }
      },
      [],
    );

  useEffect(() => {
    let mounted = true;

    const bootstrap =
      async () => {
        try {
          const data =
            await request<any>(
              '/auth/me',
            );

          if (!mounted) return;

          if (data?.user) {
            applySessionData(data);
          }
        } catch {
          if (!mounted) return;

          setUser(null);
        } finally {
          if (mounted) {
            setIsLoading(false);
          }
        }
      };

    void bootstrap();

    return () => {
      mounted = false;
    };
  }, [applySessionData]);

  useEffect(() => {
    if (!user) {
      return;
    }

    void refreshWallet();
    void refreshCashbackWallet();
    void refreshTransactions();
    void refreshNotifications();
  }, [
    user,
    refreshWallet,
    refreshCashbackWallet,
    refreshTransactions,
    refreshNotifications,
  ]);

  useEffect(() => {
    if (
      settings.hideBalanceDefault
    ) {
      setBalanceHidden(true);
    }
  }, [
    settings.hideBalanceDefault,
  ]);

  useEffect(() => {
    const root =
      document.documentElement;

    const theme =
      settings.theme;

    const applyTheme = () => {
      const shouldDark =
        theme === 'dark' ||
        (
          theme === 'system' &&
          window.matchMedia(
            '(prefers-color-scheme: dark)',
          ).matches
        );

      root.classList.toggle(
        'dark',
        shouldDark,
      );
    };

    applyTheme();

    if (theme === 'system') {
      const media =
        window.matchMedia(
          '(prefers-color-scheme: dark)',
        );

      const listener = () =>
        applyTheme();

      media.addEventListener(
        'change',
        listener,
      );

      return () => {
        media.removeEventListener(
          'change',
          listener,
        );
      };
    }
  }, [settings.theme]);

  const login =
    useCallback(
      async (
        phone: string,
        loginPin: string,
      ): Promise<LoginResult> => {
        try {
          const data =
            await request<any>(
              '/auth/login',
              {
                method: 'POST',
                body: JSON.stringify({
                  phone,
                  loginPin,
                }),
              },
            );

          applySessionData(data);

          return {
            success: true,
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to sign in.',
          };
        }
      },
      [applySessionData],
    );

  const register =
    useCallback(
      async (
        name: string,
        email: string,
        phone: string,
        username: string,
        loginPin: string,
        purchasePin: string,
      ): Promise<RegisterResult> => {
        try {
          const data =
            await request<any>(
              '/auth/register',
              {
                method: 'POST',
                body: JSON.stringify({
                  name,
                  email,
                  phone,
                  username,
                  loginPin,
                  purchasePin,
                }),
              },
            );

          applySessionData(data);

          return {
            success: true,
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to create account.',
          };
        }
      },
      [applySessionData],
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
      } catch (error) {
        console.error(
          'Logout request failed:',
          error,
        );
      } finally {
        setUser(null);
        setBalance(0);
        setCashbackBalance(0);
        setCashbackSettings(null);
        setTransactions([]);
        setNotifications([]);
        setBalanceHidden(
          defaultSettings
            .hideBalanceDefault,
        );
      }
    }, []);

  const accountExists =
    useCallback(
      async (
        phone: string,
      ): Promise<boolean> => {
        try {
          const data =
            await request<{
              exists?: boolean;
              available?: boolean;
            }>(
              `/auth/account-exists?phone=${encodeURIComponent(
                phone,
              )}`,
            );

          return (
            data.exists ===
              true ||
            data.available ===
              false
          );
        } catch {
          return false;
        }
      },
      [],
    );

  /*
   * IMPORTANT:
   *
   * The backend route is:
   *
   *   GET /api/auth/check-username
   *
   * The old frontend called:
   *
   *   GET /api/auth/username-available
   *
   * That route does not exist in the current API.
   *
   * This replacement calls the real backend route,
   * so username availability is checked against the
   * real database instead of producing the generic
   * "Could not check username availability" message.
   */
  const checkUsernameAvailable =
    useCallback(
      async (
        username: string,
      ): Promise<
        'available' | 'taken' | 'error'
      > => {
        try {
          const normalized =
            username
              .trim()
              .toLowerCase();

          if (
            !/^[a-z0-9]{4,15}$/.test(
              normalized,
            )
          ) {
            return 'taken';
          }

          const data =
            await request<{
              available?: boolean;
              reason?: string;
              error?: string;
            }>(
              `/auth/check-username?username=${encodeURIComponent(
                normalized,
              )}`,
            );

          if (
            data.available === true
          ) {
            return 'available';
          }

          if (
            data.available === false
          ) {
            return 'taken';
          }

          return 'error';
        } catch (error) {
          console.error(
            'Username availability check failed:',
            error,
          );

          return 'error';
        }
      },
      [],
    );

  const changeUsername =
    useCallback(
      async (
        username: string,
      ): Promise<{
        ok: boolean;
        error?: string;
      }> => {
        try {
          await request(
            '/user/username',
            {
              method: 'PATCH',
              body: JSON.stringify({
                username:
                  username
                    .trim()
                    .toLowerCase(),
              }),
            },
          );

          const me =
            await request<any>(
              '/auth/me',
            );

          if (me?.user) {
            setUser(me.user);
          }

          return {
            ok: true,
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to change username.',
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
            }>(
              '/auth/verify-pin',
              {
                method: 'POST',
                body: JSON.stringify({
                  pin,
                }),
              },
            );

          return data.valid === true;
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
      ): Promise<{
        ok: boolean;
        error?: string;
      }> => {
        try {
          await request(
            '/auth/change-pin',
            {
              method: 'POST',
              body: JSON.stringify({
                currentPin,
                newPin,
              }),
            },
          );

          return {
            ok: true,
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
        pin: string,
      ): Promise<boolean> => {
        try {
          const data =
            await request<{
              valid?: boolean;
            }>(
              '/auth/verify-purchase-pin',
              {
                method: 'POST',
                body: JSON.stringify({
                  pin,
                }),
              },
            );

          return data.valid === true;
        } catch {
          return false;
        }
      },
      [],
    );

  const changePurchasePin =
    useCallback(
      async (
        currentPin: string,
        newPin: string,
      ): Promise<{
        ok: boolean;
        error?: string;
      }> => {
        try {
          await request(
            '/auth/change-purchase-pin',
            {
              method: 'POST',
              body: JSON.stringify({
                currentPin,
                newPin,
              }),
            },
          );

          return {
            ok: true,
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

  const requestPinReset =
    useCallback(
      async (
        phoneOrEmail: string,
      ): Promise<PinResetResult> => {
        try {
          const data =
            await request<any>(
              '/auth/request-pin-reset',
              {
                method: 'POST',
                body: JSON.stringify({
                  identifier:
                    phoneOrEmail,
                }),
              },
            );

          return {
            ok: true,
            message:
              data?.message,
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to request PIN reset.',
          };
        }
      },
      [],
    );

  const resetPinWithCode =
    useCallback(
      async (
        identifier: string,
        code: string,
        newPin: string,
      ): Promise<PinResetResult> => {
        try {
          const data =
            await request<any>(
              '/auth/reset-pin',
              {
                method: 'POST',
                body: JSON.stringify({
                  identifier,
                  code,
                  newPin,
                }),
              },
            );

          return {
            ok: true,
            message:
              data?.message,
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

  const purchaseData =
    useCallback(
      async (
        network: string,
        planId: string,
        phone: string,
        purchasePin: string,
      ): Promise<PurchaseResult> => {
        try {
          const data =
            await request<any>(
              '/purchase/data',
              {
                method: 'POST',
                body: JSON.stringify({
                  network,
                  planId,
                  phone,
                  purchasePin,
                }),
              },
            );

          if (
            typeof data?.balance ===
            'number'
          ) {
            setBalance(
              data.balance,
            );
          }

          void refreshWallet();
          void refreshTransactions();

          return {
            success:
              data?.success !== false,
            ...data,
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to purchase data.',
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
      async (
        network: string,
        amount: number,
        phone: string,
        purchasePin: string,
      ): Promise<PurchaseResult> => {
        try {
          const data =
            await request<any>(
              '/purchase/airtime',
              {
                method: 'POST',
                body: JSON.stringify({
                  network,
                  amount,
                  phone,
                  purchasePin,
                }),
              },
            );

          if (
            typeof data?.balance ===
            'number'
          ) {
            setBalance(
              data.balance,
            );
          }

          void refreshWallet();
          void refreshTransactions();

          return {
            success:
              data?.success !== false,
            ...data,
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to purchase airtime.',
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
        current => !current,
      );
    }, []);

  const updateSettings =
    useCallback(
      async (
        incoming: Partial<Settings>,
      ): Promise<{
        ok: boolean;
        error?: string;
      }> => {
        const previous =
          settings;

        const next =
          mergeSettings(
            previous,
            incoming,
          );

        setSettings(next);

        if (
          typeof incoming.hideBalanceDefault ===
          'boolean'
        ) {
          setBalanceHidden(
            incoming.hideBalanceDefault,
          );
        }

        try {
          const data =
            await request<any>(
              '/user/settings',
              {
                method: 'PATCH',
                body: JSON.stringify(
                  next,
                ),
              },
            );

          const saved =
            data?.settings;

          if (
            saved &&
            typeof saved ===
              'object'
          ) {
            const merged =
              mergeSettings(
                next,
                saved,
              );

            setSettings(
              merged,
            );

            if (
              typeof merged.hideBalanceDefault ===
              'boolean'
            ) {
              setBalanceHidden(
                merged.hideBalanceDefault,
              );
            }
          }

          return {
            ok: true,
          };
        } catch (error) {
          setSettings(
            previous,
          );

          if (
            typeof previous.hideBalanceDefault ===
            'boolean'
          ) {
            setBalanceHidden(
              previous.hideBalanceDefault,
            );
          }

          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to update settings.',
          };
        }
      },
      [settings],
    );

  const transferCashback =
    useCallback(
      async (
        amount: number,
      ): Promise<{
        ok: boolean;
        error?: string;
      }> => {
        try {
          const data =
            await request<any>(
              '/cashback/user/transfer',
              {
                method: 'POST',
                body: JSON.stringify({
                  amount,
                }),
              },
            );

          if (
            typeof data?.balance ===
            'number'
          ) {
            setBalance(
              data.balance,
            );
          }

          if (
            typeof data?.cashbackBalance ===
            'number'
          ) {
            setCashbackBalance(
              data.cashbackBalance,
            );
          }

          void refreshWallet();
          void refreshCashbackWallet();
          void refreshTransactions();

          return {
            ok: true,
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to transfer cashback.',
          };
        }
      },
      [
        refreshWallet,
        refreshCashbackWallet,
        refreshTransactions,
      ],
    );

  const markNotificationRead =
    useCallback(
      async (
        id: string,
      ): Promise<{
        ok: boolean;
        error?: string;
      }> => {
        try {
          await request(
            `/user/notifications/${encodeURIComponent(
              id,
            )}/read`,
            {
              method: 'POST',
            },
          );

          setNotifications(
            current =>
              current.map(
                notification => {
                  const notificationId =
                    String(
                      notification.id ??
                        notification._id ??
                        '',
                    );

                  if (
                    notificationId !==
                    String(id)
                  ) {
                    return notification;
                  }

                  return {
                    ...notification,
                    read: true,
                    isRead: true,
                  };
                },
              ),
          );

          return {
            ok: true,
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to mark notification as read.',
          };
        }
      },
      [],
    );

  const markAllNotificationsRead =
    useCallback(
      async (): Promise<{
        ok: boolean;
        error?: string;
      }> => {
        try {
          await request(
            '/user/notifications/read-all',
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
                  isRead: true,
                }),
              ),
          );

          return {
            ok: true,
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to mark notifications as read.',
          };
        }
      },
      [],
    );

  const contextValue =
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
        register,
        logout,
        accountExists,
        checkUsernameAvailable,
        changeUsername,
        verifyPin,
        changePin,
        verifyPurchasePin,
        changePurchasePin,
        requestPinReset,
        resetPinWithCode,
        purchaseData,
        purchaseAirtime,
        toggleBalanceHidden,
        setActiveTab,
        refreshWallet,
        refreshCashbackWallet,
        transferCashback,
        updateSettings,
        refreshNotifications,
        markNotificationRead,
        markAllNotificationsRead,
        dataPlans,
        dataPlansLoading,
        refreshDataPlans,
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
        register,
        logout,
        accountExists,
        checkUsernameAvailable,
        changeUsername,
        verifyPin,
        changePin,
        verifyPurchasePin,
        changePurchasePin,
        requestPinReset,
        resetPinWithCode,
        purchaseData,
        purchaseAirtime,
        toggleBalanceHidden,
        refreshWallet,
        refreshCashbackWallet,
        transferCashback,
        updateSettings,
        refreshNotifications,
        markNotificationRead,
        markAllNotificationsRead,
        dataPlans,
        dataPlansLoading,
        refreshDataPlans,
      ],
    );

  return (
    <AppContext.Provider
      value={contextValue}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context =
    useContext(AppContext);

  if (!context) {
    throw new Error(
      'useAppContext must be used within AppProvider',
    );
  }

  return context;
}
