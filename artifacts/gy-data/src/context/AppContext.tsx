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

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

  let data: unknown = null;

  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const message =
      data &&
      typeof data === 'object' &&
      'error' in data &&
      typeof (
        data as { error?: unknown }
      ).error === 'string'
        ? String(
            (data as { error: string })
              .error,
          )
        : `Request failed (${response.status})`;

    throw new Error(message);
  }

  return data as T;
}

function normalizeUser(
  value: unknown,
): User | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const u =
    value as Partial<User> & {
      id?: string;
    };

  if (!u.id) {
    return null;
  }

  return {
    id: String(u.id),
    name: String(u.name ?? ''),
    firstName: String(u.firstName ?? ''),
    lastName: String(u.lastName ?? ''),
    username: String(u.username ?? ''),
    email: String(u.email ?? ''),
    phone: String(u.phone ?? ''),
    accountNumber: String(
      u.accountNumber ?? '',
    ),
    bankName: String(u.bankName ?? ''),
    referralCode: String(
      u.referralCode ?? '',
    ),
    kycStatus:
      u.kycStatus === 'verified'
        ? 'verified'
        : u.kycStatus === 'pending'
          ? 'pending'
          : 'unverified',
    usernameChangedAt:
      u.usernameChangedAt ?? null,
    createdAt: String(
      u.createdAt ?? '',
    ),
  };
}

function normalizeTransaction(
  value: unknown,
): Transaction {
  const t =
    value as Partial<Transaction> & {
      createdAt?: string;
    };

  const createdAt =
    t.createdAt ??
    new Date().toISOString();

  const dateObject = new Date(createdAt);

  const type = [
    'data',
    'airtime',
    'electricity',
    'cable',
    'betting',
    'exam',
    'wallet_fund',
  ].includes(String(t.type))
    ? (t.type as Transaction['type'])
    : 'wallet_fund';

  const status = [
    'success',
    'pending',
    'failed',
  ].includes(String(t.status))
    ? (t.status as Transaction['status'])
    : 'success';

  return {
    id: String(t.id ?? ''),
    type,
    service: String(t.service ?? ''),
    provider: String(t.provider ?? ''),
    amount: toNumber(t.amount),
    date:
      t.date ??
      dateObject.toLocaleDateString(
        'en-GB',
        {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        },
      ),
    time:
      t.time ??
      dateObject.toLocaleTimeString(
        'en-US',
        {
          hour: '2-digit',
          minute: '2-digit',
        },
      ),
    status,
    description: String(
      t.description ?? '',
    ),
    paymentMethod:
      t.paymentMethod ?? undefined,
  };
}

function normalizeNotification(
  value: unknown,
): Notification {
  const n =
    value as Partial<Notification>;

  return {
    id: String(n.id ?? ''),
    type:
      n.type === 'promo' ||
      n.type === 'system' ||
      n.type === 'security'
        ? n.type
        : 'transaction',
    title: String(n.title ?? ''),
    body: String(n.body ?? ''),
    timestamp: String(
      n.timestamp ?? 'Just now',
    ),
    createdAt: String(
      n.createdAt ??
        new Date().toISOString(),
    ),
    read: Boolean(n.read),
    refId:
      n.refId ?? null,
  };
}

function mergeSettings(
  current: Settings,
  incoming: Record<string, unknown>,
): Settings {
  const incomingNotifications =
    incoming.notifications &&
    typeof incoming.notifications ===
      'object'
      ? (incoming.notifications as Record<
          string,
          unknown
        >)
      : {};

  return {
    ...current,
    ...(incoming as Partial<Settings>),
    notifications: {
      ...current.notifications,
      transactions:
        typeof incomingNotifications.transactions ===
        'boolean'
          ? incomingNotifications.transactions
          : current.notifications.transactions,
      promotional:
        typeof incomingNotifications.promotional ===
        'boolean'
          ? incomingNotifications.promotional
          : current.notifications.promotional,
      security:
        typeof incomingNotifications.security ===
        'boolean'
          ? incomingNotifications.security
          : current.notifications.security,
      email:
        typeof incomingNotifications.email ===
        'boolean'
          ? incomingNotifications.email
          : current.notifications.email,
    },
  };
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

        setBalance(
          toNumber(data.balance),
        );
      } catch {
        // Keep the existing balance when
        // the wallet request fails.
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
        // Keep the existing cashback
        // balance when the request fails.
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
        // Keep existing transactions
        // when the request fails.
      }
    }, [user]);

  const refreshNotifications =
    useCallback(async () => {
      if (!user) return;

      try {
        const data =
          await request<{
            notifications?: unknown[];
          }>('/user/notifications');

        setNotifications(
          Array.isArray(
            data.notifications,
          )
            ? data.notifications.map(
                normalizeNotification,
              )
            : [],
        );
      } catch {
        // Keep existing notifications
        // when the request fails.
      }
    }, [user]);

  const refreshSettings =
    useCallback(async () => {
      if (!user) return;

      try {
        const data =
          await request<{
            settings?: Record<
              string,
              unknown
            >;
          }>('/user/preferences');

        if (
          data.settings &&
          typeof data.settings === 'object'
        ) {
          setSettings(
            current =>
              mergeSettings(
                current,
                data.settings!,
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
      } catch {
        // Keep local settings on failure.
      }
    }, [user]);

  const refreshCashbackSettings =
    useCallback(async () => {
      if (!user) return;

      try {
        const data =
          await request<{
            settings?: Partial<
              CashbackSettings
            >;
          }>('/cashback/settings');

        if (data.settings) {
          setCashbackSettings({
            enabled:
              Boolean(
                data.settings.enabled,
              ),
            minTransferAmount:
              toNumber(
                data.settings
                  .minTransferAmount,
              ),
            transferMode:
              data.settings
                .transferMode === 'auto'
                ? 'auto'
                : 'manual',
            eligibleServices:
              Array.isArray(
                data.settings
                  .eligibleServices,
              )
                ? data.settings
                    .eligibleServices
                    .map(String)
                : [],
          });
        }
      } catch {
        // Cashback settings are optional.
      }
    }, [user]);

  const refreshAll =
    useCallback(async () => {
      if (!user) return;

      await Promise.all([
        refreshWallet(),
        refreshCashbackWallet(),
        refreshCashbackSettings(),
        refreshTransactions(),
        refreshNotifications(),
        refreshSettings(),
      ]);
    }, [
      user,
      refreshWallet,
      refreshCashbackWallet,
      refreshCashbackSettings,
      refreshTransactions,
      refreshNotifications,
      refreshSettings,
    ]);

  useEffect(() => {
    let mounted = true;

    const restoreSession =
      async () => {
        setIsLoading(true);

        try {
          const data =
            await request<{
              user?: unknown;
            }>('/auth/me');

          const nextUser =
            normalizeUser(data.user);

          if (mounted) {
            setUser(nextUser);
          }

          if (nextUser) {
            await Promise.all([
              refreshWallet(),
              refreshCashbackWallet(),
              refreshTransactions(),
              refreshNotifications(),
              refreshSettings(),
            ]);
          }
        } catch {
          if (mounted) {
            setUser(null);
          }
        } finally {
          if (mounted) {
            setIsLoading(false);
          }
        }
      };

    restoreSession();

    return () => {
      mounted = false;
    };
  }, [
    refreshWallet,
    refreshCashbackWallet,
    refreshTransactions,
    refreshNotifications,
    refreshSettings,
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
              user?: unknown;
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
              }),
            });

          const nextUser =
            normalizeUser(data.user);

          if (nextUser) {
            setUser(nextUser);
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
              `/user/username-available?username=${encodeURIComponent(
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
      ): Promise<{
        ok: boolean;
        error?: string;
      }> => {
        try {
          await request(
            '/user/username',
            {
              method: 'PUT',
              body: JSON.stringify({
                username,
              }),
            },
          );

          setUser(current =>
            current
              ? {
                  ...current,
                  username,
                }
              : current,
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
              devOtp?: string;
            }>('/auth/pin-reset/request', {
              method: 'POST',
              body: JSON.stringify({
                phone,
              }),
            });

          return {
            success: true,
            devOtp: data.devOtp,
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to request PIN reset.',
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
            '/auth/pin-reset/confirm',
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
                : 'Failed to reset PIN.',
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
            }>('/user/check-pin', {
              method: 'POST',
              body: JSON.stringify({
                pin,
              }),
            });

          return Boolean(data.valid);
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
            ok: true,
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to change login PIN.',
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
            }>(
              '/user/check-purchase-pin',
              {
                method: 'POST',
                body: JSON.stringify({
                  purchasePin,
                }),
              },
            );

          return Boolean(data.valid);
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
          await request(
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
            ok: true,
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'Failed to change purchase PIN.',
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
          ] = params.idempotencyKey;
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
          ] = params.idempotencyKey;
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
        value => !value,
      );
    }, []);

  const updateSettings =
    useCallback(
      async (
        partial: Partial<Settings>,
      ) => {
        const previous =
          settings;

        const next =
          mergeSettings(
            settings,
            partial as Record<
              string,
              unknown
            >,
          );

        setSettings(next);

        if (
          partial.hideBalanceDefault !==
          undefined
        ) {
          setBalanceHidden(
            partial.hideBalanceDefault,
          );
        }

        try {
          await request(
            '/user/preferences',
            {
              method: 'PUT',
              body: JSON.stringify(
                partial,
              ),
            },
          );
        } catch {
          setSettings(previous);
        }
      },
      [settings],
    );

  const markAllNotificationsRead =
    useCallback(async () => {
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
            }),
          ),
      );
    }, []);

  const markNotificationRead =
    useCallback(
      async (id: string) => {
        await request(
          `/user/notifications/${encodeURIComponent(
            id,
          )}/read`,
          {
            method: 'PATCH',
          },
        );

        setNotifications(
          current =>
            current.map(
              notification =>
                notification.id === id
                  ? {
                      ...notification,
                      read: true,
                    }
                  : notification,
            ),
        );
      },
      [],
    );

  const deleteNotification =
    useCallback(
      async (id: string) => {
        await request(
          `/user/notifications/${encodeURIComponent(
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
                notification.id !== id,
            ),
        );
      },
      [],
    );

  const clearAllNotifications =
    useCallback(async () => {
      await request(
        '/user/notifications',
        {
          method: 'DELETE',
        },
      );

      setNotifications([]);
    }, []);

  const transferCashback =
    useCallback(async () => {
      try {
        const result =
          await request<{
            ok: boolean;
            transferred?: number;
            newMainBalance?: string;
            newCashbackBalance?: string;
          }>('/cashback/transfer', {
            method: 'POST',
            body: JSON.stringify({}),
          });

        if (
          result.newMainBalance !==
          undefined
        ) {
          setBalance(
            toNumber(
              result.newMainBalance,
            ),
          );
        }

        if (
          result.newCashbackBalance !==
          undefined
        ) {
          setCashbackBalance(
            toNumber(
              result.newCashbackBalance,
            ),
          );
        }

        await refreshAll();

        return {
          ok: Boolean(result.ok),
          transferred:
            result.transferred,
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
    }, [refreshAll]);

  const unreadCount =
    useMemo(
      () =>
        notifications.filter(
          notification =>
            !notification.read,
        ).length,
      [notifications],
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
        isAuthenticated:
          Boolean(user),

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

export function useAppContext(): AppContextValue {
  const context =
    useContext(AppContext);

  if (!context) {
    throw new Error(
      'useAppContext must be used inside AppProvider',
    );
  }

  return context;
}
