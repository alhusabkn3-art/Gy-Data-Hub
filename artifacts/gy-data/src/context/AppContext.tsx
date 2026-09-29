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

  logout: () => Promise<void>;

  register: (
    name: string,
    email: string,
    phone: string,
    username: string,
    loginPin: string,
    purchasePin: string,
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
  ) => Promise<PinResetResult>;

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

  purchaseData: (
    network: string,
    planCode: string,
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

function mergeSettings(
  current: Settings,
  incoming:
    | Partial<Settings>
    | null
    | undefined,
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

  const [
    cashbackBalance,
    setCashbackBalance,
  ] = useState(0);

  const [
    cashbackSettings,
    setCashbackSettings,
  ] =
    useState<Record<
      string,
      unknown
    > | null>(null);

  const [
    transactions,
    setTransactions,
  ] = useState<Transaction[]>([]);

  const [
    notifications,
    setNotifications,
  ] = useState<Notification[]>([]);

  const [
    settings,
    setSettings,
  ] = useState<Settings>(
    defaultSettings,
  );

  const [
    balanceHidden,
    setBalanceHidden,
  ] = useState(false);

  const [
    activeTab,
    setActiveTab,
  ] = useState('home');

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    dataPlans,
    setDataPlans,
  ] = useState<DataPlan[]>([]);

  const [
    dataPlansLoading,
    setDataPlansLoading,
  ] = useState(false);

  const isAuthenticated =
    user !== null;

  const unreadCount =
    notifications.filter(
      notification =>
        notification.read !== true &&
        notification.isRead !== true,
    ).length;

  const applySessionData =
    useCallback(
      (data: {
        user?: User | null;
        balance?: string | number;
        transactions?: unknown;
        notifications?: unknown;
        preferences?: unknown;
      }) => {
        if (data.user) {
          setUser(data.user);
        }

        const nextBalance =
          Number(
            data.balance ?? 0,
          );

        setBalance(
          Number.isFinite(
            nextBalance,
          )
            ? nextBalance
            : 0,
        );

        if (
          data.transactions !==
          undefined
        ) {
          setTransactions(
            normalizeTransactions(
              data.transactions,
            ),
          );
        }

        if (
          data.notifications !==
          undefined
        ) {
          setNotifications(
            Array.isArray(
              data.notifications,
            )
              ? data.notifications.filter(
                  item =>
                    item &&
                    typeof item ===
                      'object',
                ) as Notification[]
              : [],
          );
        }

        if (
          data.preferences &&
          typeof data.preferences ===
            'object'
        ) {
          setSettings(
            current =>
              mergeSettings(
                current,
                data.preferences as Partial<Settings>,
              ),
          );
        }
      },
      [],
    );

  const refreshWallet =
    useCallback(
      async () => {
        if (!user) {
          return;
        }

        try {
          const wallet =
            await request<{
              id?: string;
              balance?: number;
              updatedAt?: string;
            }>(
              '/user/wallet',
            );

          const nextBalance =
            Number(
              wallet.balance ?? 0,
            );

          setBalance(
            Number.isFinite(
              nextBalance,
            )
              ? nextBalance
              : 0,
          );
        } catch {
          /*
           * Keep the current wallet state
           * if a background refresh fails.
           */
        }

        try {
          const data =
            await request<unknown>(
              '/user/transactions?limit=50',
            );

          setTransactions(
            normalizeTransactions(
              data,
            ),
          );
        } catch {
          /*
           * Keep existing transactions if
           * the background request fails.
           */
        }
      },
      [user],
    );

  const refreshCashbackWallet =
    useCallback(
      async () => {
        if (!user) {
          return;
        }

        try {
          const data =
            await request<{
              balance?: number;
              cashbackEnabled?: boolean;
              minTransferAmount?: number;
              transferMode?: string;
              eligibleServices?: string[];
              settings?: Record<
                string,
                unknown
              >;
            }>(
              '/cashback/wallet',
            );

          const nextBalance =
            Number(
              data.balance ?? 0,
            );

          setCashbackBalance(
            Number.isFinite(
              nextBalance,
            )
              ? nextBalance
              : 0,
          );

          if (
            data.settings &&
            typeof data.settings ===
              'object'
          ) {
            setCashbackSettings(
              data.settings,
            );
          } else {
            setCashbackSettings({
              cashbackEnabled:
                data.cashbackEnabled ??
                false,
              minTransferAmount:
                data.minTransferAmount ??
                0,
              transferMode:
                data.transferMode ??
                'manual',
              eligibleServices:
                data.eligibleServices ??
                [],
            });
          }
        } catch {
          /*
           * Cashback is optional. Do not
           * break the main application if
           * its wallet is unavailable.
           */
        }
      },
      [user],
    );

  const refreshNotifications =
    useCallback(
      async () => {
        if (!user) {
          setNotifications([]);
          return;
        }

        try {
          const data =
            await request<unknown>(
              '/user/notifications?limit=50',
            );

          setNotifications(
            Array.isArray(data)
              ? data.filter(
                  item =>
                    item &&
                    typeof item ===
                      'object',
                ) as Notification[]
              : [],
          );
        } catch {
          /*
           * Keep existing notification state
           * if background loading fails.
           */
        }
      },
      [user],
    );

  const refreshDataPlans =
    useCallback(
      async (
        network?: string,
      ) => {
        if (!network) {
          setDataPlans([]);
          return;
        }

        setDataPlansLoading(
          true,
        );

        try {
          const data =
            await request<unknown>(
              `/smeapi/data-plans?network=${encodeURIComponent(
                network,
              )}`,
            );

          const plans =
            Array.isArray(data)
              ? data
              : data &&
                  typeof data ===
                    'object' &&
                  Array.isArray(
                    (
                      data as Record<
                        string,
                        unknown
                      >
                    ).plans,
                  )
                ? (
                    data as Record<
                      string,
                      unknown
                    >
                  ).plans
                : [];

          setDataPlans(
            plans.filter(
              item =>
                item &&
                typeof item ===
                  'object',
            ) as DataPlan[],
          );
        } catch {
          setDataPlans([]);
        } finally {
          setDataPlansLoading(
            false,
          );
        }
      },
      [],
    );

  useEffect(() => {
    let cancelled = false;

    const restoreSession =
      async () => {
        try {
          /*
           * The actual backend route is:
           * GET /api/auth/me
           *
           * There is no /api/auth/session route
           * in this project.
           */
          const data =
            await request<{
              user?: User | null;
              balance?: string | number;
              transactions?: unknown;
              notifications?: unknown;
              preferences?: unknown;
            }>(
              '/auth/me',
            );

          if (
            cancelled
          ) {
            return;
          }

          if (
            !data.user
          ) {
            setUser(null);
            return;
          }

          applySessionData(
            data,
          );
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

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, [applySessionData]);

  useEffect(() => {
    if (!user) {
      setTransactions([]);
      setNotifications([]);
      setCashbackBalance(0);
      setCashbackSettings(null);
      return;
    }

    refreshWallet();
    refreshCashbackWallet();
    refreshNotifications();
  }, [
    user,
    refreshWallet,
    refreshCashbackWallet,
    refreshNotifications,
  ]);

  const login =
    useCallback(
      async (
        phone: string,
        loginPin: string,
      ): Promise<LoginResult> => {
        try {
          const data =
            await request<{
              success?: boolean;
              ok?: boolean;
              error?: string;
              user?: User;
              balance?: string | number;
              transactions?: unknown;
              notifications?: unknown;
              preferences?: unknown;
            }>(
              '/auth/login',
              {
                method: 'POST',
                body: JSON.stringify({
                  phone,
                  loginPin,
                }),
              },
            );

          /*
           * The backend returns the user/session object
           * directly. It does NOT need success:true.
           *
           * A real user object means authentication
           * succeeded.
           */
          if (!data.user) {
            return {
              success: false,
              error:
                data.error ??
                'Invalid phone number or PIN.',
            };
          }

          applySessionData(
            data,
          );

          return {
            success: true,
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to log in.',
          };
        }
      },
      [applySessionData],
    );

  const logout =
    useCallback(
      async () => {
        try {
          await request(
            '/auth/logout',
            {
              method: 'POST',
              body: JSON.stringify({}),
            },
          );
        } catch {
          /*
           * Always clear local state even if
           * the server logout request fails.
           */
        } finally {
          setUser(null);
          setBalance(0);
          setCashbackBalance(0);
          setCashbackSettings(null);
          setTransactions([]);
          setNotifications([]);
          setBalanceHidden(false);
          setActiveTab('home');
        }
      },
      [],
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
            await request<{
              user?: User;
              balance?: string | number;
              transactions?: unknown;
              notifications?: unknown;
              preferences?: unknown;
              error?: string;
            }>(
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

          /*
           * Register, like login, returns the newly
           * created user rather than success:true.
           */
          if (!data.user) {
            return {
              success: false,
              error:
                data.error ??
                'Unable to create account.',
            };
          }

          applySessionData(
            data,
          );

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
              `/auth/check-phone?phone=${encodeURIComponent(
                phone,
              )}`,
            );

          return data.exists === true;
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
              reason?: string;
            }>(
              `/auth/check-username?username=${encodeURIComponent(
                username,
              )}`,
            );

          if (
            data.available === true
          ) {
            return 'available';
          }

          if (
            data.reason ===
            'invalid_format'
          ) {
            return 'taken';
          }

          return 'taken';
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
              username?: string;
              error?: string;
            }>(
              '/user/username',
              {
                method: 'PATCH',
                body: JSON.stringify({
                  username,
                }),
              },
            );

          if (
            data.ok === true &&
            data.username
          ) {
            setUser(
              current =>
                current
                  ? {
                      ...current,
                      username:
                        data.username!,
                    }
                  : current,
            );
          }

          return {
            ok:
              data.ok === true,
            error: data.error,
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

  /*
   * Legacy phone-based PIN reset methods are kept
   * because other parts of the application may still
   * reference them.
   *
   * The current Forgot PIN screen uses the dedicated
   * registered-email OTP routes directly:
   *
   * /api/auth/forgot-pin-email/request
   * /api/auth/forgot-pin-email/reset
   */

  const requestPinReset =
    useCallback(
      async (
        phone: string,
      ): Promise<PinResetResult> => {
        try {
          const data =
            await request<{
              ok?: boolean;
              error?: string;
              message?: string;
            }>(
              '/auth/request-pin-reset',
              {
                method: 'POST',
                body: JSON.stringify({
                  phone,
                }),
              },
            );

          return {
            ok:
              data.ok === true,
            error: data.error,
            message: data.message,
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to send verification code.',
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
      ): Promise<PinResetResult> => {
        try {
          const data =
            await request<{
              ok?: boolean;
              error?: string;
              message?: string;
            }>(
              '/auth/reset-pin',
              {
                method: 'POST',
                body: JSON.stringify({
                  phone,
                  otp,
                  newPin,
                }),
              },
            );

          return {
            ok:
              data.ok === true,
            error: data.error,
            message: data.message,
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
            }>(
              '/user/check-pin',
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
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              error?: string;
            }>(
              '/user/pin',
              {
                method: 'PUT',
                body: JSON.stringify({
                  currentPin,
                  newPin,
                }),
              },
            );

          return {
            ok:
              data.ok === true,
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
        pin: string,
      ): Promise<boolean> => {
        try {
          const data =
            await request<{
              valid?: boolean;
            }>(
              '/user/check-purchase-pin',
              {
                method: 'POST',
                body: JSON.stringify({
                  purchasePin: pin,
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
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              error?: string;
            }>(
              '/user/purchase-pin',
              {
                method: 'PUT',
                body: JSON.stringify({
                  currentPin,
                  newPin,
                }),
              },
            );

          return {
            ok:
              data.ok === true,
            error: data.error,
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to change Purchase PIN.',
          };
        }
      },
      [],
    );

  const purchaseData =
    useCallback(
      async (
        network: string,
        planCode: string,
        phone: string,
        purchasePin: string,
      ): Promise<PurchaseResult> => {
        try {
          const data =
            await request<PurchaseResult>(
              '/purchase/data',
              {
                method: 'POST',
                body: JSON.stringify({
                  network,
                  phone,
                  planCode,
                  purchasePin,
                }),
              },
            );

          return {
            ...data,
            success:
              data.success === true,
            requestId:
              data.requestId ??
              data.transactionId ??
              data.reference ??
              '',
          };
        } catch (error) {
          return {
            success: false,
            requestId: '',
            error:
              error instanceof Error
                ? error.message
                : 'Unable to purchase data.',
          };
        }
      },
      [],
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
            await request<PurchaseResult>(
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

          return {
            ...data,
            success:
              data.success === true,
            requestId:
              data.requestId ??
              data.transactionId ??
              data.reference ??
              '',
          };
        } catch (error) {
          return {
            success: false,
            requestId: '',
            error:
              error instanceof Error
                ? error.message
                : 'Unable to purchase airtime.',
          };
        }
      },
      [],
    );

  const toggleBalanceHidden =
    useCallback(
      () => {
        setBalanceHidden(
          current => !current,
        );
      },
      [],
    );

  const transferCashback =
    useCallback(
      async (
        amount: number,
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              error?: string;
              newCashbackBalance?: number;
            }>(
              '/cashback/transfer',
              {
                method: 'POST',
                body: JSON.stringify({
                  amount,
                }),
              },
            );

          if (
            typeof data.newCashbackBalance ===
            'number'
          ) {
            setCashbackBalance(
              data.newCashbackBalance,
            );
          } else if (
            data.ok === true
          ) {
            await refreshCashbackWallet();
          }

          return {
            ok:
              data.ok === true,
            error: data.error,
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
      [refreshCashbackWallet],
    );

  const updateSettings =
    useCallback(
      async (
        nextSettings: Partial<Settings>,
      ) => {
        try {
          /*
           * Actual backend route:
           * PUT /api/user/preferences
           *
           * It returns the preferences object directly,
           * not { ok: true }.
           */
          const data =
            await request<
              Partial<Settings>
            >(
              '/user/preferences',
              {
                method: 'PUT',
                body: JSON.stringify(
                  nextSettings,
                ),
              },
            );

          setSettings(
            current =>
              mergeSettings(
                current,
                data,
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
                : 'Unable to update settings.',
          };
        }
      },
      [],
    );

  const markNotificationRead =
    useCallback(
      async (
        id: string,
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              error?: string;
            }>(
              `/user/notifications/${encodeURIComponent(
                id,
              )}/read`,
              {
                method: 'POST',
                body: JSON.stringify({}),
              },
            );

          if (
            data.ok === true
          ) {
            setNotifications(
              current =>
                current.map(
                  notification =>
                    String(
                      notification.id,
                    ) === id
                      ? {
                          ...notification,
                          read: true,
                          isRead: true,
                        }
                      : notification,
                ),
            );
          }

          return {
            ok:
              data.ok === true,
            error: data.error,
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
      async () => {
        try {
          const data =
            await request<{
              ok?: boolean;
              error?: string;
            }>(
              '/user/notifications/read-all',
              {
                method: 'POST',
                body: JSON.stringify({}),
              },
            );

          if (
            data.ok === true
          ) {
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
          }

          return {
            ok:
              data.ok === true,
            error: data.error,
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
      value={value}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const context =
    useContext(
      AppContext,
    );

  if (!context) {
    throw new Error(
      'useAppContext must be used inside AppProvider.',
    );
  }

  return context;
}
