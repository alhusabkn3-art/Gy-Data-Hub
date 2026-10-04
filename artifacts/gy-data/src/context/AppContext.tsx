// artifacts/gy-data/src/context/AppContext.tsx

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
    idempotencyKey?: string,
    planName?: string,
    planPrice?: number,
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
        setUser(
          data.user ??
            null,
        );

        if (
          data.balance !==
          undefined
        ) {
          setBalance(
            Number(
              data.balance,
            ) || 0,
          );
        }

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
            normalizeTransactions(
              data.notifications,
            ),
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
          const data =
            await request<{
              balance?: string | number;
              wallet?: {
                balance?: string | number;
                availableBalance?: string | number;
              };
            }>(
              '/user/wallet',
            );

          const nextBalance =
            data.balance ??
            data.wallet?.balance ??
            data.wallet?.availableBalance;

          if (
            nextBalance !==
            undefined
          ) {
            setBalance(
              Number(
                nextBalance,
              ) || 0,
            );
          }
        } catch {
          // Keep current balance when refresh fails.
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
              balance?: string | number;
              cashbackBalance?: string | number;
              wallet?: {
                balance?: string | number;
              };
              settings?: Record<
                string,
                unknown
              >;
            }>(
              '/cashback/wallet',
            );

          const nextBalance =
            data.cashbackBalance ??
            data.balance ??
            data.wallet?.balance;

          if (
            nextBalance !==
            undefined
          ) {
            setCashbackBalance(
              Number(
                nextBalance,
              ) || 0,
            );
          }

          if (
            data.settings
          ) {
            setCashbackSettings(
              data.settings,
            );
          }
        } catch {
          // Keep existing cashback state on failure.
        }
      },
      [user],
    );

  const refreshNotifications =
    useCallback(
      async () => {
        if (!user) {
          return;
        }

        try {
          const data =
            await request<unknown>(
              '/user/notifications',
            );

          const notificationsValue =
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
                    ).notifications,
                  )
                ? (
                    data as Record<
                      string,
                      unknown
                    >
                  ).notifications
                : [];

          setNotifications(
            normalizeTransactions(
              notificationsValue,
            ),
          );
        } catch {
          // Keep existing notification state
          // if background loading fails.
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
                : 'Unable to login.',
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
            },
          );
        } catch {
          // Clear local state even when logout request fails.
        } finally {
          setUser(null);
          setBalance(0);
          setTransactions([]);
          setNotifications([]);
          setCashbackBalance(0);
          setCashbackSettings(null);
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
              balance?: string | number;
              transactions?: unknown;
              notifications?: unknown;
              preferences?: unknown;
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

          if (
            !data.user
          ) {
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
              exists?: boolean;
            }>(
              `/auth/username-available?username=${encodeURIComponent(
                username,
              )}`,
            );

          if (
            data.available ===
            true
          ) {
            return 'available';
          }

          if (
            data.exists ===
              true ||
            data.available ===
              false
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
              success?: boolean;
              error?: string;
            }>(
              '/user/username',
              {
                method: 'PUT',
                body: JSON.stringify({
                  username,
                }),
              },
            );

          return {
            ok:
              data.ok === true ||
              data.success === true,
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

  const requestPinReset =
    useCallback(
      async (
        phone: string,
      ): Promise<PinResetResult> => {
        try {
          const data =
            await request<{
              ok?: boolean;
              success?: boolean;
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
              data.ok === true ||
              data.success === true,
            error: data.error,
            message: data.message,
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
              success?: boolean;
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
              data.ok === true ||
              data.success === true,
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
              ok?: boolean;
              success?: boolean;
            }>(
              '/auth/verify-pin',
              {
                method: 'POST',
                body: JSON.stringify({
                  pin,
                }),
              },
            );

          return (
            data.ok === true ||
            data.success === true
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
              success?: boolean;
              error?: string;
            }>(
              '/auth/change-pin',
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
              data.ok === true ||
              data.success === true,
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
              ok?: boolean;
              success?: boolean;
            }>(
              '/auth/verify-purchase-pin',
              {
                method: 'POST',
                body: JSON.stringify({
                  pin,
                }),
              },
            );

          return (
            data.ok === true ||
            data.success === true
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
        currentPin: string,
        newPin: string,
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              success?: boolean;
              error?: string;
            }>(
              '/auth/change-purchase-pin',
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
              data.ok === true ||
              data.success === true,
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
        idempotencyKey?: string,
        planName?: string,
        planPrice?: number,
      ): Promise<PurchaseResult> => {
        try {
          const headers: HeadersInit = {};

          if (idempotencyKey) {
            headers[
              'Idempotency-Key'
            ] = idempotencyKey;
          }

          const data =
            await request<PurchaseResult>(
              '/purchase/data-safe',
              {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  network,
                  phone,
                  planCode,
                  planName:
                    planName ?? '',
                  planPrice:
                    planPrice ?? 0,
                  purchasePin,
                  ...(idempotencyKey
                    ? {
                        idempotencyKey,
                      }
                    : {}),
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
    useCallback(() => {
      setBalanceHidden(
        value => !value,
      );
    }, []);

  const transferCashback =
    useCallback(
      async (
        amount: number,
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              success?: boolean;
              error?: string;
              balance?: string | number;
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
            data.balance !==
            undefined
          ) {
            setCashbackBalance(
              Number(
                data.balance,
              ) || 0,
            );
          }

          await refreshWallet();

          return {
            ok:
              data.ok === true ||
              data.success === true,
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
      [refreshWallet],
    );

  const updateSettings =
    useCallback(
      async (
        incoming: Partial<Settings>,
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              success?: boolean;
              error?: string;
              preferences?: Partial<Settings>;
            }>(
              '/user/settings',
              {
                method: 'PUT',
                body: JSON.stringify(
                  incoming,
                ),
              },
            );

          setSettings(
            current =>
              mergeSettings(
                current,
                data.preferences ??
                  incoming,
              ),
          );

          return {
            ok:
              data.ok === true ||
              data.success === true,
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
              success?: boolean;
              error?: string;
            }>(
              `/user/notifications/${encodeURIComponent(
                id,
              )}/read`,
              {
                method: 'POST',
              },
            );

          if (
            data.ok === true ||
            data.success === true
          ) {
            setNotifications(
              current =>
                current.map(
                  notification =>
                    String(
                      notification.id ??
                        '',
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
              data.ok === true ||
              data.success === true,
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
              success?: boolean;
              error?: string;
            }>(
              '/user/notifications/read-all',
              {
                method: 'POST',
              },
            );

          if (
            data.ok === true ||
            data.success === true
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
              data.ok === true ||
              data.success === true,
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
      'useAppContext must be used inside AppProvider',
    );
  }

  return context;
}
