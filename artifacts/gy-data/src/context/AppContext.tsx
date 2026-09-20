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

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `${API}${path}`,
    {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    },
  );

  const text = await response.text();

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
        ? (data as Record<string, unknown>)
        : null;

    const message =
      typeof errorValue?.message === 'string'
        ? errorValue.message
        : typeof errorValue?.error === 'string'
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

  const [cashbackBalance, setCashbackBalance] =
    useState(0);

  const [cashbackSettings, setCashbackSettings] =
    useState<Record<string, unknown> | null>(null);

  const [transactions, setTransactions] =
    useState<Transaction[]>([]);

  const [notifications, setNotifications] =
    useState<Notification[]>([]);

  const [settings, setSettings] =
    useState<Settings>(DEFAULT_SETTINGS);

  const [balanceHidden, setBalanceHidden] =
    useState(false);

  const [activeTab, setActiveTab] =
    useState('home');

  const [isLoading, setIsLoading] =
    useState(true);

  const isAuthenticated =
    Boolean(user);

  const unreadCount =
    notifications.filter(
      notification =>
        notification.read === false,
    ).length;

  const refreshWallet =
    useCallback(async () => {
      try {
        const data =
          await request<{
            balance?: number | string;
          }>('/user/wallet');

        const value =
          typeof data.balance === 'number'
            ? data.balance
            : Number(data.balance ?? 0);

        setBalance(
          Number.isFinite(value)
            ? value
            : 0,
        );
      } catch {
        // Wallet refresh is non-critical.
      }
    }, []);

  const refreshCashbackWallet =
    useCallback(async () => {
      try {
        const data =
          await request<{
            balance?: number | string;
            settings?: Record<string, unknown>;
          }>('/cashback/wallet');

        const value =
          typeof data.balance === 'number'
            ? data.balance
            : Number(data.balance ?? 0);

        setCashbackBalance(
          Number.isFinite(value)
            ? value
            : 0,
        );

        if (data.settings) {
          setCashbackSettings(
            data.settings,
          );
        }
      } catch {
        // Cashback refresh is non-critical.
      }
    }, []);

  const refreshTransactions =
    useCallback(async () => {
      try {
        const data =
          await request<{
            transactions?: Transaction[];
          }>('/user/transactions');

        setTransactions(
          Array.isArray(data.transactions)
            ? data.transactions
            : [],
        );
      } catch {
        // Transaction refresh is non-critical.
      }
    }, []);

  const refreshNotifications =
    useCallback(async () => {
      try {
        const data =
          await request<{
            notifications?: Notification[];
          }>('/user/notifications');

        setNotifications(
          Array.isArray(data.notifications)
            ? data.notifications
            : [],
        );
      } catch {
        // Notification refresh is non-critical.
      }
    }, []);

  const refreshPreferences =
    useCallback(async () => {
      try {
        const data =
          await request<{
            preferences?: Record<string, unknown>;
          }>('/user/preferences');

        if (
          data.preferences &&
          typeof data.preferences === 'object'
        ) {
          const preferences =
            data.preferences;

          setSettings(
            previous => ({
              ...previous,
              ...(preferences as Partial<Settings>),
            }),
          );
        }
      } catch {
        // Preferences are non-critical.
      }
    }, []);

  const refreshAll =
    useCallback(async () => {
      await Promise.all([
        refreshWallet(),
        refreshCashbackWallet(),
        refreshTransactions(),
        refreshNotifications(),
        refreshPreferences(),
      ]);
    }, [
      refreshWallet,
      refreshCashbackWallet,
      refreshTransactions,
      refreshNotifications,
      refreshPreferences,
    ]);

  const restoreSession =
    useCallback(async () => {
      setIsLoading(true);

      try {
        const data =
          await request<{
            user?: unknown;
            balance?: number | string;
            transactions?: Transaction[];
            notifications?: Notification[];
            preferences?: Record<string, unknown>;
          }>('/auth/me');

        const nextUser =
          normalizeUser(data.user);

        if (!nextUser) {
          setUser(null);
          return;
        }

        setUser(nextUser);

        if (data.balance !== undefined) {
          const value =
            typeof data.balance === 'number'
              ? data.balance
              : Number(data.balance);

          if (Number.isFinite(value)) {
            setBalance(value);
          }
        }

        if (Array.isArray(data.transactions)) {
          setTransactions(data.transactions);
        }

        if (Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
        }

        if (data.preferences) {
          setSettings(
            previous => ({
              ...previous,
              ...(data.preferences as Partial<Settings>),
            }),
          );
        }

        await refreshAll();
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }, [refreshAll]);

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
              balance?: number | string;
              transactions?: Transaction[];
              notifications?: Notification[];
              preferences?: Record<string, unknown>;
            }>('/auth/login', {
              method: 'POST',
              body: JSON.stringify({
                phone,
                loginPin,
              }),
            });

          const nextUser =
            normalizeUser(data.user);

          if (!nextUser) {
            return {
              success: false,
              error:
                'Login succeeded but user data was not returned.',
            };
          }

          setUser(nextUser);

          if (data.balance !== undefined) {
            const value =
              typeof data.balance === 'number'
                ? data.balance
                : Number(data.balance);

            if (Number.isFinite(value)) {
              setBalance(value);
            }
          }

          if (Array.isArray(data.transactions)) {
            setTransactions(
              data.transactions,
            );
          }

          if (Array.isArray(data.notifications)) {
            setNotifications(
              data.notifications,
            );
          }

          if (data.preferences) {
            setSettings(
              previous => ({
                ...previous,
                ...(data.preferences as Partial<Settings>),
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
    useCallback(async () => {
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
        setCashbackSettings(null);
        setTransactions([]);
        setNotifications([]);
      }
    }, []);

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
            }>('/auth/register', {
              method: 'POST',
              body: JSON.stringify({
                name,
                email,
                phone,
                username,
                loginPin,
                purchasePin,
              }),
            });

          const nextUser =
            normalizeUser(data.user);

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
              `/auth/check-phone?phone=${encodeURIComponent(phone)}`,
            );

          return Boolean(data.exists);
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
              `/auth/check-username?username=${encodeURIComponent(username)}`,
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
      ): Promise<{
        ok: boolean;
        error?: string;
      }> => {
        try {
          const data =
            await request<{
              ok?: boolean;
            }>(
              '/user/username',
              {
                method: 'PUT',
                body: JSON.stringify({
                  username,
                }),
              },
            );

          if (data.ok) {
            setUser(
              previous =>
                previous
                  ? {
                      ...previous,
                      username,
                    }
                  : previous,
            );
          }

          return {
            ok: Boolean(data.ok),
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
          await request(
            '/auth/forgot-pin/request',
            {
              method: 'POST',
              body: JSON.stringify({
                phone,
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
      ): Promise<{
        ok: boolean;
        error?: string;
      }> => {
        try {
          await request(
            '/auth/forgot-pin/reset',
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
            ok: true,
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
          await request(
            '/user/check-pin',
            {
              method: 'POST',
              body: JSON.stringify({
                pin,
              }),
            },
          );

          return true;
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
          const data =
            await request<{
              ok?: boolean;
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
            ok: Boolean(data.ok),
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
          await request(
            '/user/check-purchase-pin',
            {
              method: 'POST',
              body: JSON.stringify({
                purchasePin,
              }),
            },
          );

          return true;
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
      ): Promise<{
        ok: boolean;
        error?: string;
      }> => {
        try {
          const data =
            await request<{
              ok?: boolean;
            }>(
              '/user/purchase-pin',
              {
                method: 'PUT',
                body: JSON.stringify({
                  currentPurchasePin,
                  newPurchasePin,
                }),
              },
            );

          return {
            ok: Boolean(data.ok),
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
        if (
          !/^\d{4}$/.test(
            params.purchasePin,
          )
        ) {
          return {
            success: false,
            requestId: '',
            error:
              'Purchase PIN must be exactly 4 digits.',
          };
        }

        const headers: Record<
          string,
          string
        > = {};

        if (
          params.idempotencyKey
        ) {
          headers[
            'Idempotency-Key'
          ] =
            params.idempotencyKey;
        }

        try {
          const result =
            await request<PurchaseResult>(
              '/purchase/data',
              {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  network:
                    params.network,
                  phone:
                    params.phone,
                  planCode:
                    params.planCode,
                  planName:
                    params.planName,
                  planPrice:
                    params.planPrice,
                  purchasePin:
                    params.purchasePin,
                }),
              },
            );

          await Promise.all([
            refreshWallet(),
            refreshCashbackWallet(),
            refreshTransactions(),
          ]);

          return result;
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
      async (params: {
        network: string;
        phone: string;
        amount: number;
        purchasePin: string;
        idempotencyKey?: string | null;
      }): Promise<PurchaseResult> => {
        if (
          !/^\d{4}$/.test(
            params.purchasePin,
          )
        ) {
          return {
            success: false,
            requestId: '',
            error:
              'Purchase PIN must be exactly 4 digits.',
          };
        }

        const headers: Record<
          string,
          string
        > = {};

        if (
          params.idempotencyKey
        ) {
          headers[
            'Idempotency-Key'
          ] =
            params.idempotencyKey;
        }

        try {
          const result =
            await request<PurchaseResult>(
              '/purchase/airtime',
              {
                method: 'POST',
                headers,
                body: JSON.stringify({
                  network:
                    params.network,
                  phone:
                    params.phone,
                  amount:
                    params.amount,
                  purchasePin:
                    params.purchasePin,
                }),
              },
            );

          await Promise.all([
            refreshWallet(),
            refreshCashbackWallet(),
            refreshTransactions(),
          ]);

          return result;
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
        previous => !previous,
      );
    }, []);

  const transferCashback =
    useCallback(async () => {
      try {
        const data =
          await request<{
            ok?: boolean;
            transferred?: number;
          }>(
            '/cashback/transfer',
            {
              method: 'POST',
            },
          );

        if (data.ok) {
          await Promise.all([
            refreshWallet(),
            refreshCashbackWallet(),
          ]);
        }

        return {
          ok: Boolean(data.ok),
          transferred:
            data.transferred,
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
    }, [
      refreshWallet,
      refreshCashbackWallet,
    ]);

  const updateSettings =
    useCallback(
      async (
        partial: Partial<Settings>,
      ) => {
        const next = {
          ...settings,
          ...partial,
        };

        setSettings(next);

        try {
          await request(
            '/user/preferences',
            {
              method: 'PUT',
              body: JSON.stringify({
                preferences: next,
              }),
            },
          );
        } catch {
          // Keep local preference state even if persistence fails.
        }
      },
      [settings],
    );

  const markAllNotificationsRead =
    useCallback(async () => {
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
        // Non-critical.
      }
    }, []);

  const markNotificationRead =
    useCallback(
      async (id: string) => {
        try {
          await request(
            `/user/notifications/${encodeURIComponent(id)}/read`,
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
          // Non-critical.
        }
      },
      [],
    );

  const deleteNotification =
    useCallback(
      async (id: string) => {
        try {
          await request(
            `/user/notifications/${encodeURIComponent(id)}`,
            {
              method: 'DELETE',
            },
          );

          setNotifications(
            previous =>
              previous.filter(
                notification =>
                  notification.id !== id,
              ),
          );
        } catch {
          // Non-critical.
        }
      },
      [],
    );

  const clearAllNotifications =
    useCallback(async () => {
      try {
        await request(
          '/user/notifications',
          {
            method: 'DELETE',
          },
        );

        setNotifications([]);
      } catch {
        // Non-critical.
      }
    }, []);

  const fetchDataPlans =
    useCallback(
      async (
        network: string,
      ): Promise<DataPlan[]> => {
        try {
          const data =
            await request<{
              plans?: DataPlan[];
            }>(
              `/smeapi/data-plans?network=${encodeURIComponent(network)}`,
            );

          return Array.isArray(data.plans)
            ? data.plans
            : [];
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
    <AppContext.Provider value={value}>
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
