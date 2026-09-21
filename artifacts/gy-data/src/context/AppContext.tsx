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
  ) => Promise<{
    ok: boolean;
    error?: string;
  }>;

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
    updates: Partial<Settings>,
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
};

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
  createContext<AppContextValue | null>(null);

function normalizeUser(
  raw: unknown,
): User | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const value =
    raw as Record<string, unknown>;

  if (
    typeof value.id !== 'string' ||
    typeof value.phone !== 'string'
  ) {
    return null;
  }

  return {
    id: value.id,
    name:
      typeof value.name === 'string'
        ? value.name
        : '',
    firstName:
      typeof value.firstName === 'string'
        ? value.firstName
        : undefined,
    lastName:
      typeof value.lastName === 'string'
        ? value.lastName
        : undefined,
    username:
      typeof value.username === 'string'
        ? value.username
        : '',
    email:
      typeof value.email === 'string'
        ? value.email
        : '',
    phone: value.phone,
    accountNumber:
      typeof value.accountNumber === 'string'
        ? value.accountNumber
        : null,
    bankName:
      typeof value.bankName === 'string'
        ? value.bankName
        : null,
    referralCode:
      typeof value.referralCode === 'string'
        ? value.referralCode
        : null,
    kycStatus:
      typeof value.kycStatus === 'string'
        ? value.kycStatus
        : null,
    usernameChangedAt:
      typeof value.usernameChangedAt === 'string'
        ? value.usernameChangedAt
        : null,
    createdAt:
      typeof value.createdAt === 'string'
        ? value.createdAt
        : null,
  };
}

function formatTransactionDate(
  createdAt: unknown,
): {
  date: string;
  time: string;
} {
  if (
    typeof createdAt !== 'string' ||
    !createdAt
  ) {
    return {
      date: 'Unknown date',
      time: '',
    };
  }

  const value =
    new Date(createdAt);

  if (
    Number.isNaN(
      value.getTime(),
    )
  ) {
    return {
      date: 'Unknown date',
      time: '',
    };
  }

  const now = new Date();

  const today =
    new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

  const transactionDay =
    new Date(
      value.getFullYear(),
      value.getMonth(),
      value.getDate(),
    );

  const dayDifference =
    Math.round(
      (today.getTime() -
        transactionDay.getTime()) /
        (24 * 60 * 60 * 1000),
    );

  let date: string;

  if (dayDifference === 0) {
    date = 'Today';
  } else if (dayDifference === 1) {
    date = 'Yesterday';
  } else {
    date =
      value.toLocaleDateString(
        'en-NG',
        {
          day: '2-digit',
          month: 'short',
        },
      );
  }

  const time =
    value.toLocaleTimeString(
      'en-NG',
      {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      },
    );

  return {
    date,
    time,
  };
}

function normalizeTransaction(
  raw: unknown,
): Transaction | null {
  if (
    !raw ||
    typeof raw !== 'object'
  ) {
    return null;
  }

  const value =
    raw as Record<string, unknown>;

  if (
    typeof value.id !== 'string'
  ) {
    return null;
  }

  const createdAt =
    value.createdAt ??
    value.created_at;

  const formatted =
    formatTransactionDate(
      createdAt,
    );

  const amountValue =
    value.amount;

  const amount =
    typeof amountValue === 'number'
      ? amountValue
      : Number(
          amountValue ?? 0,
        );

  const metadata =
    value.metadata &&
    typeof value.metadata ===
      'object'
      ? (
          value.metadata as Record<
            string,
            unknown
          >
        )
      : null;

  return {
    ...value,

    type:
      typeof value.type === 'string'
        ? value.type
        : 'data',

    service:
      typeof value.service === 'string'
        ? value.service
        : '',

    provider:
      typeof value.provider === 'string'
        ? value.provider
        : '',

    amount:
      Number.isFinite(amount)
        ? amount
        : 0,

    status:
      typeof value.status === 'string'
        ? value.status
        : 'pending',

    description:
      typeof value.description ===
      'string'
        ? value.description
        : '',

    paymentMethod:
      typeof value.paymentMethod ===
      'string'
        ? value.paymentMethod
        : typeof value.payment_method ===
            'string'
          ? value.payment_method
          : undefined,

    date:
      formatted.date,

    time:
      formatted.time,

    createdAt:
      typeof createdAt === 'string'
        ? createdAt
        : undefined,

    phone:
      typeof value.phone ===
      'string'
        ? value.phone
        : typeof metadata?.phone ===
            'string'
          ? metadata.phone
          : undefined,
  };
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
      data =
        JSON.parse(text);
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

    throw new Error(
      message,
    );
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
  ] = useState<Transaction[]>(
    [],
  );

  const [
    notifications,
    setNotifications,
  ] = useState<Notification[]>(
    [],
  );

  const [
    settings,
    setSettings,
  ] =
    useState<Settings>(
      DEFAULT_SETTINGS,
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

  const isAuthenticated =
    Boolean(user);

  const unreadCount =
    notifications.filter(
      notification =>
        notification.read ===
        false,
    ).length;

  const refreshWallet =
    useCallback(
      async () => {
        try {
          const data =
            await request<{
              balance?:
                | number
                | string;
            }>(
              '/user/wallet',
            );

          const value =
            typeof data.balance ===
            'number'
              ? data.balance
              : Number(
                  data.balance ?? 0,
                );

          setBalance(
            Number.isFinite(value)
              ? value
              : 0,
          );
        } catch {
          // Wallet refresh is non-critical.
        }
      },
      [],
    );

  const refreshCashbackWallet =
    useCallback(
      async () => {
        try {
          const data =
            await request<{
              balance?:
                | number
                | string;
              settings?: Record<
                string,
                unknown
              > | null;
            }>(
              '/cashback-user/wallet',
            );

          const value =
            typeof data.balance ===
            'number'
              ? data.balance
              : Number(
                  data.balance ?? 0,
                );

          setCashbackBalance(
            Number.isFinite(value)
              ? value
              : 0,
          );

          if (
            data.settings !==
              undefined
          ) {
            setCashbackSettings(
              data.settings,
            );
          }
        } catch {
          // Cashback refresh is non-critical.
        }
      },
      [],
    );

  const refreshTransactions =
    useCallback(
      async () => {
        try {
          const data =
            await request<unknown>(
              '/user/transactions',
            );

          const rawTransactions =
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
                    ).transactions,
                  )
                ? (
                    data as Record<
                      string,
                      unknown
                    >
                  ).transactions
                : [];

          setTransactions(
            normalizeTransactions(
              rawTransactions,
            ),
          );
        } catch {
          // Transaction refresh is non-critical.
        }
      },
      [],
    );

  const refreshNotifications =
    useCallback(
      async () => {
        try {
          const data =
            await request<{
              notifications?:
                Notification[];
            }>(
              '/user/notifications',
            );

          setNotifications(
            Array.isArray(
              data.notifications,
            )
              ? data.notifications
              : [],
          );
        } catch {
          // Notification refresh is non-critical.
        }
      },
      [],
    );

  const refreshPreferences =
    useCallback(
      async () => {
        try {
          const data =
            await request<{
              preferences?:
                Record<
                  string,
                  unknown
                >;
            }>(
              '/user/preferences',
            );

          if (
            data.preferences &&
            typeof data.preferences ===
              'object'
          ) {
            const preferences =
              data.preferences;

            setSettings(
              previous => ({
                ...previous,
                ...(
                  preferences as Partial<Settings>
                ),
              }),
            );
          }
        } catch {
          // Preferences are non-critical.
        }
      },
      [],
    );

  const refreshAll =
    useCallback(
      async () => {
        await Promise.all([
          refreshWallet(),
          refreshCashbackWallet(),
          refreshTransactions(),
          refreshNotifications(),
          refreshPreferences(),
        ]);
      },
      [
        refreshWallet,
        refreshCashbackWallet,
        refreshTransactions,
        refreshNotifications,
        refreshPreferences,
      ],
    );

  const restoreSession =
    useCallback(
      async () => {
        setIsLoading(true);

        try {
          const data =
            await request<{
              user?: unknown;
              balance?:
                | number
                | string;
              transactions?:
                Transaction[];
              notifications?:
                Notification[];
              preferences?:
                Record<
                  string,
                  unknown
                >;
            }>(
              '/auth/me',
            );

          const nextUser =
            normalizeUser(
              data.user,
            );

          if (!nextUser) {
            setUser(null);
            return;
          }

          setUser(nextUser);

          if (
            data.balance !==
            undefined
          ) {
            const value =
              typeof data.balance ===
              'number'
                ? data.balance
                : Number(
                    data.balance,
                  );

            if (
              Number.isFinite(
                value,
              )
            ) {
              setBalance(value);
            }
          }

          if (
            Array.isArray(
              data.transactions,
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
              data.notifications,
            )
          ) {
            setNotifications(
              data.notifications,
            );
          }

          if (
            data.preferences
          ) {
            setSettings(
              previous => ({
                ...previous,
                ...(
                  data.preferences as Partial<Settings>
                ),
              }),
            );
          }

          await refreshAll();
        } catch {
          setUser(null);
        } finally {
          setIsLoading(false);
        }
      },
      [refreshAll],
    );

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const login =
    useCallback(
      async (
        phone: string,
        loginPin: string,
      ): Promise<LoginResult> => {
        try {
          const data =
            await request<{
              user?: unknown;
              balance?:
                | number
                | string;
              transactions?:
                Transaction[];
              notifications?:
                Notification[];
              preferences?:
                Record<
                  string,
                  unknown
                >;
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

          const nextUser =
            normalizeUser(
              data.user,
            );

          if (!nextUser) {
            return {
              success: false,
              error:
                'Login succeeded but user data was not returned.',
            };
          }

          setUser(nextUser);

          if (
            data.balance !==
            undefined
          ) {
            const value =
              typeof data.balance ===
              'number'
                ? data.balance
                : Number(
                    data.balance,
                  );

            if (
              Number.isFinite(
                value,
              )
            ) {
              setBalance(value);
            }
          }

          if (
            Array.isArray(
              data.transactions,
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
              data.notifications,
            )
          ) {
            setNotifications(
              data.notifications,
            );
          }

          if (
            data.preferences
          ) {
            setSettings(
              previous => ({
                ...previous,
                ...(
                  data.preferences as Partial<Settings>
                ),
              }),
            );
          }

          await refreshAll();

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
      [refreshAll],
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
        } finally {
          setUser(null);
          setBalance(0);
          setCashbackBalance(0);
          setCashbackSettings(
            null,
          );
          setTransactions([]);
          setNotifications([]);
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
              user?: unknown;
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

          const nextUser =
            normalizeUser(
              data.user,
            );

          if (!nextUser) {
            return {
              success: false,
              error:
                'Registration succeeded but user data was not returned.',
            };
          }

          setUser(nextUser);

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
        'available' |
        'taken' |
        'error'
      > => {
        try {
          const data =
            await request<{
              available?: boolean;
            }>(
              `/auth/check-username?username=${encodeURIComponent(
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
              user?: unknown;
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

          const nextUser =
            normalizeUser(
              data.user,
            );

          if (nextUser) {
            setUser(nextUser);
          }

          return {
            ok: data.ok !== false,
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
              error?: string;
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
              data.ok !== false,
            error: data.error,
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
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              error?: string;
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
              data.ok !== false,
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
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              error?: string;
            }>(
              '/user/verify-pin',
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
                : 'PIN verification failed.',
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
      ) => {
        try {
          const data =
            await request<{
              ok?: boolean;
              error?: string;
            }>(
              '/user/purchase-pin/verify',
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
                : 'Purchase PIN verification failed.',
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
          const data =
            await request<PurchaseResult>(
              '/purchase/data',
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

          await Promise.all([
            refreshWallet(),
            refreshCashbackWallet(),
            refreshTransactions(),
          ]);

          return data;
        } catch (error) {
          return {
            success: false,
            requestId: '',
            error:
              error instanceof Error
                ? error.message
                : 'Data purchase failed.',
          };
        }
      },
      [
        refreshWallet,
        refreshCashbackWallet,
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

          await Promise.all([
            refreshWallet(),
            refreshCashbackWallet(),
            refreshTransactions(),
          ]);

          return data;
        } catch (error) {
          return {
            success: false,
            requestId: '',
            error:
              error instanceof Error
                ? error.message
                : 'Airtime purchase failed.',
          };
        }
      },
      [
        refreshWallet,
        refreshCashbackWallet,
        refreshTransactions,
      ],
    );

  const toggleBalanceHidden =
    useCallback(() => {
      setBalanceHidden(
        previous =>
          !previous,
      );
    }, []);

  const setActiveTabValue =
    useCallback(
      (tab: string) => {
        setActiveTab(tab);
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
            }>(
              '/cashback-user/transfer',
              {
                method: 'POST',
                body: JSON.stringify({
                  amount,
                }),
              },
            );

          if (data.ok) {
            await Promise.all([
              refreshWallet(),
              refreshCashbackWallet(),
              refreshTransactions(),
            ]);
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
      [
        refreshWallet,
        refreshCashbackWallet,
        refreshTransactions,
      ],
    );

  const updateSettings =
    useCallback(
      async (
        updates: Partial<Settings>,
      ) => {
        setSettings(
          previous => ({
            ...previous,
            ...updates,
          }),
        );

        try {
          await request(
            '/user/preferences',
            {
              method: 'PUT',
              body: JSON.stringify(
                updates,
              ),
            },
          );
        } catch {
          // Keep optimistic UI state.
        }
      },
      [],
    );

  const markAllNotificationsRead =
    useCallback(
      async () => {
        try {
          await request(
            '/user/notifications/read-all',
            {
              method: 'PUT',
            },
          );

          setNotifications(
            previous =>
              previous.map(
                notification => ({
                  ...notification,
                  read: true,
                }),
              ),
          );
        } catch {
          // Notification update is non-critical.
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
          await request(
            `/user/notifications/${encodeURIComponent(
              id,
            )}/read`,
            {
              method: 'PUT',
            },
          );

          setNotifications(
            previous =>
              previous.map(
                notification =>
                  notification.id === id
                    ? {
                        ...notification,
                        read: true,
                      }
                    : notification,
              ),
          );
        } catch {
          // Notification update is non-critical.
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
            `/user/notifications/${encodeURIComponent(
              id,
            )}`,
            {
              method: 'DELETE',
            },
          );

          setNotifications(
            previous =>
              previous.filter(
                notification =>
                  notification.id !==
                  id,
              ),
          );
        } catch {
          // Notification update is non-critical.
        }
      },
      [],
    );

  const clearAllNotifications =
    useCallback(
      async () => {
        try {
          await request(
            '/user/notifications',
            {
              method: 'DELETE',
            },
          );

          setNotifications([]);
        } catch {
          // Notification update is non-critical.
        }
      },
      [],
    );

  const fetchDataPlans =
    useCallback(
      async (
        network: string,
      ): Promise<DataPlan[]> => {
        try {
          const data =
            await request<{
              plans?: DataPlan[];
              data?: DataPlan[];
            }>(
              `/smeapi/data-plans?network=${encodeURIComponent(
                network,
              )}`,
            );

          if (
            Array.isArray(
              data.plans,
            )
          ) {
            return data.plans;
          }

          if (
            Array.isArray(
              data.data,
            )
          ) {
            return data.data;
          }

          return [];
        } catch {
          return [];
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
        setActiveTab:
          setActiveTabValue,
        refreshWallet,
        refreshCashbackWallet,
        transferCashback,
        updateSettings,
        markAllNotificationsRead,
        markNotificationRead,
        deleteNotification,
        clearAllNotifications,
        refreshAll,
        fetchDataPlans,
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
        setActiveTabValue,
        refreshWallet,
        refreshCashbackWallet,
        transferCashback,
        updateSettings,
        markAllNotificationsRead,
        markNotificationRead,
        deleteNotification,
        clearAllNotifications,
        refreshAll,
        fetchDataPlans,
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
    useContext(AppContext);

  if (!context) {
    throw new Error(
      'useAppContext must be used within AppProvider',
    );
  }

  return context;
}
