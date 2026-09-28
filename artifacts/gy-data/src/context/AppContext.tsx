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
  id?: string;
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
  requestId: string;
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
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;

  changePin: (
    currentPin: string,
    newPin: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;

  verifyPurchasePin: (
    pin: string,
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;

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

function normalizeTransaction(
  raw: unknown,
): Transaction | null {
  if (
    !raw ||
    typeof raw !== 'object'
  ) {
    return null;
  }

  return raw as Transaction;
}

function normalizeTransactions(
  raw: unknown,
): Transaction[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map(normalizeTransaction)
    .filter(
      (
        transaction,
      ): transaction is Transaction =>
        transaction !== null,
    );
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
    const errorValue =
      data &&
      typeof data === 'object'
        ? (
            data as Record<
              string,
              unknown
            >
          )
        : null;

    const message =
      typeof errorValue?.message ===
      'string'
        ? errorValue.message
        : typeof errorValue?.error ===
            'string'
          ? errorValue.error
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

  const refreshWallet =
    useCallback(
      async () => {
        if (!user) return;

        try {
          const data =
            await request<{
              balance?: number;
              walletBalance?: number;
              user?: User;
              transactions?: unknown;
              recentTransactions?: unknown;
            }>(
              '/wallet',
            );

          const nextBalance =
            Number(
              data.balance ??
                data.walletBalance ??
                0,
            );

          setBalance(
            Number.isFinite(
              nextBalance,
            )
              ? nextBalance
              : 0,
          );

          const rawTransactions =
            data.transactions ??
            data.recentTransactions ??
            [];

          setTransactions(
            normalizeTransactions(
              rawTransactions,
            ),
          );

          if (data.user) {
            setUser(
              data.user,
            );
          }
        } catch {
          /*
           * Keep the currently loaded wallet
           * state if a background refresh fails.
           */
        }
      },
      [user],
    );

  const refreshCashbackWallet =
    useCallback(
      async () => {
        if (!user) return;

        try {
          const data =
            await request<{
              balance?: number;
              cashbackBalance?: number;
              settings?: Record<
                string,
                unknown
              > | null;
            }>(
              '/cashback/wallet',
            );

          const nextBalance =
            Number(
              data.cashbackBalance ??
                data.balance ??
                0,
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
          }
        } catch {
          /*
           * Preserve existing cashback state
           * when a background refresh fails.
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
            await request<{
              notifications?: unknown;
              history?: unknown;
              items?: unknown;
            }>(
              '/notifications',
            );

          const raw =
            data.notifications ??
            data.history ??
            data.items ??
            [];

          setNotifications(
            Array.isArray(raw)
              ? raw.filter(
                  item =>
                    item &&
                    typeof item ===
                      'object',
                ) as Notification[]
              : [],
          );
        } catch {
          /*
           * Do not crash the application
           * when notifications are unavailable.
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
        setDataPlansLoading(
          true,
        );

        try {
          const query =
            network
              ? `?network=${encodeURIComponent(
                  network,
                )}`
              : '';

          const data =
            await request<{
              plans?: unknown;
              dataPlans?: unknown;
              items?: unknown;
            }>(
              `/services/data-plans${query}`,
            );

          const raw =
            data.plans ??
            data.dataPlans ??
            data.items ??
            [];

          setDataPlans(
            Array.isArray(raw)
              ? raw.filter(
                  item =>
                    item &&
                    typeof item ===
                      'object',
                ) as DataPlan[]
              : [],
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
          const data =
            await request<{
              authenticated?: boolean;
              isAuthenticated?: boolean;
              user?: User | null;
              balance?: number;
              walletBalance?: number;
              settings?: Partial<Settings>;
            }>(
              '/auth/session',
            );

          if (
            cancelled
          ) {
            return;
          }

          const authenticated =
            data.authenticated ===
              true ||
            data.isAuthenticated ===
              true;

          if (
            authenticated &&
            data.user
          ) {
            setUser(
              data.user,
            );

            const nextBalance =
              Number(
                data.balance ??
                  data.walletBalance ??
                  0,
              );

            setBalance(
              Number.isFinite(
                nextBalance,
              )
                ? nextBalance
                : 0,
            );

            if (
              data.settings
            ) {
              setSettings(
                current => ({
                  ...current,
                  ...data.settings,
                  notifications: {
                    ...current.notifications,
                    ...(
                      data.settings
                        ?.notifications ??
                      {}
                    ),
                  },
                }),
              );
            }
          } else {
            setUser(null);
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

    restoreSession();

    return () => {
      cancelled = true;
    };
  }, []);

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
              balance?: number;
              walletBalance?: number;
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

          const success =
            data.success === true ||
            data.ok === true;

          if (
            !success ||
            !data.user
          ) {
            return {
              success: false,
              error:
                data.error ??
                'Invalid phone number or PIN.',
            };
          }

          setUser(
            data.user,
          );

          const nextBalance =
            Number(
              data.balance ??
                data.walletBalance ??
                0,
            );

          setBalance(
            Number.isFinite(
              nextBalance,
            )
              ? nextBalance
              : 0,
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
      [],
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
           * Local logout still happens if
           * the server request fails.
           */
        } finally {
          setUser(null);
          setBalance(0);
          setCashbackBalance(0);
          setCashbackSettings(null);
          setTransactions([]);
          setNotifications([]);
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
              success?: boolean;
              ok?: boolean;
              error?: string;
              user?: User;
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

          const success =
            data.success === true ||
            data.ok === true;

          if (
            !success
          ) {
            return {
              success: false,
              error:
                data.error ??
                'Unable to create account.',
            };
          }

          if (data.user) {
            setUser(
              data.user,
            );
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
                : 'Unable to create account.',
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
              accountExists?: boolean;
            }>(
              '/auth/account-exists',
              {
                method: 'POST',
                body: JSON.stringify({
                  phone,
                }),
              },
            );

          return (
            data.exists === true ||
            data.accountExists === true
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
              taken?: boolean;
            }>(
              `/auth/username-available?username=${encodeURIComponent(
                username,
              )}`,
            );

          if (
            data.available === true
          ) {
            return 'available';
          }

          if (
            data.taken === true
          ) {
            return 'taken';
          }

          return 'error';
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
              error?: string;
              user?: User;
            }>(
              '/auth/change-username',
              {
                method: 'POST',
                body: JSON.stringify({
                  username,
                }),
              },
            );

          if (
            data.ok !== false &&
            data.user
          ) {
            setUser(
              data.user,
            );
          }

          return {
            ok:
              data.ok !== false,
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
   * Forgot PIN:
   *
   * The backend sends the OTP to the email address
   * registered against the supplied phone number.
   *
   * IMPORTANT:
   * Do not treat a rejected HTTP response as success.
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

  /*
   * Forgot PIN reset:
   *
   * The backend verifies:
   * - registered phone
   * - 6-digit OTP
   * - OTP expiry
   * - new 6-digit PIN
   *
   * The result is always returned as an object.
   * The ForgotPinScreen checks result.ok.
   */
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
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              error?: string;
            }>(
              '/auth/verify-pin',
              {
                method: 'POST',
                body: JSON.stringify({
                  pin,
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
                : 'Unable to verify PIN.',
          };
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
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              error?: string;
            }>(
              '/auth/verify-purchase-pin',
              {
                method: 'POST',
                body: JSON.stringify({
                  pin,
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
                : 'Unable to verify purchase PIN.',
          };
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
                : 'Unable to change purchase PIN.',
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
          return await request<PurchaseResult>(
            '/services/data/purchase',
            {
              method: 'POST',
              body: JSON.stringify({
                network,
                planCode,
                phone,
                purchasePin,
              }),
            },
          );
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
          return await request<PurchaseResult>(
            '/services/airtime/purchase',
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
              balance?: number;
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
            typeof data.balance ===
            'number'
          ) {
            setCashbackBalance(
              data.balance,
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
                : 'Unable to transfer cashback.',
          };
        }
      },
      [],
    );

  const updateSettings =
    useCallback(
      async (
        nextSettings: Partial<Settings>,
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              error?: string;
              settings?: Partial<Settings>;
            }>(
              '/settings',
              {
                method: 'PUT',
                body: JSON.stringify(
                  nextSettings,
                ),
              },
            );

          if (
            data.settings
          ) {
            setSettings(
              current => ({
                ...current,
                ...data.settings,
                notifications: {
                  ...current.notifications,
                  ...(
                    data.settings
                      ?.notifications ??
                    {}
                  ),
                },
              }),
            );
          } else {
            setSettings(
              current => ({
                ...current,
                ...nextSettings,
                notifications: {
                  ...current.notifications,
                  ...(
                    nextSettings.notifications ??
                    {}
                  ),
                },
              }),
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
              `/notifications/${encodeURIComponent(
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
              '/notifications/read-all',
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
