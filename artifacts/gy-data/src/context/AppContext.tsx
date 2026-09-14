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

  purchaseData: (params: {
    network: string;
    phone: string;
    planCode: string;
    planName: string;
    planPrice: string | number;
    idempotencyKey?: string | null;
  }) => Promise<PurchaseResult>;

  purchaseAirtime: (params: {
    network: string;
    phone: string;
    amount: number;
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
      type?: string;
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
    service: String(
      t.service ?? '',
    ),
    provider: String(
      t.provider ?? '',
    ),
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
      t.paymentMethod ??
      undefined,
  };
}

function normalizeNotification(
  value: unknown,
): Notification {
  const n =
    value as Partial<Notification>;

  const createdAt =
    n.createdAt ??
    new Date().toISOString();

  return {
    id: String(n.id ?? ''),
    type:
      n.type === 'promo' ||
      n.type === 'system' ||
      n.type === 'security'
        ? n.type
        : 'transaction',
    title: String(
      n.title ?? '',
    ),
    body: String(
      n.body ?? '',
    ),
    timestamp: String(
      n.timestamp ?? 'Just now',
    ),
    createdAt: String(createdAt),
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
            balance: string | number;
          }>('/user/wallet');

        setBalance(
          toNumber(data.balance),
        );
      } catch {
        // Keep current balance if wallet
        // refresh temporarily fails.
      }
    }, [user]);

  const refreshCashbackWallet =
    useCallback(async () => {
      if (!user) return;

      try {
        const data =
          await request<{
            balance?: string | number;
            cashbackEnabled?: boolean;
            minTransferAmount?: number;
            transferMode?: 'manual' | 'auto';
            eligibleServices?: string[];
          }>(
            '/cashback/wallet',
          );

        setCashbackBalance(
          toNumber(data.balance),
        );

        setCashbackSettings({
          enabled:
            data.cashbackEnabled ??
            false,
          minTransferAmount:
            toNumber(
              data.minTransferAmount ??
                100,
            ),
          transferMode:
            data.transferMode === 'auto'
              ? 'auto'
              : 'manual',
          eligibleServices:
            Array.isArray(
              data.eligibleServices,
            )
              ? data.eligibleServices
              : ['data'],
        });
      } catch {
        setCashbackBalance(0);
        setCashbackSettings(null);
      }
    }, [user]);

  const refreshAll =
    useCallback(async () => {
      if (!user) return;

      const [
        walletResult,
        transactionResult,
        notificationResult,
        preferenceResult,
        cashbackResult,
      ] = await Promise.allSettled([
        request<{
          balance: string | number;
        }>('/user/wallet'),

        request<unknown[]>(
          '/user/transactions',
        ),

        request<unknown[]>(
          '/user/notifications',
        ),

        request<Record<string, unknown>>(
          '/user/preferences',
        ),

        request<{
          balance?: string | number;
          cashbackEnabled?: boolean;
          minTransferAmount?: number;
          transferMode?: 'manual' | 'auto';
          eligibleServices?: string[];
        }>('/cashback/wallet'),
      ]);

      if (
        walletResult.status === 'fulfilled'
      ) {
        setBalance(
          toNumber(
            walletResult.value.balance,
          ),
        );
      }

      if (
        transactionResult.status ===
        'fulfilled'
      ) {
        setTransactions(
          transactionResult.value.map(
            normalizeTransaction,
          ),
        );
      }

      if (
        notificationResult.status ===
        'fulfilled'
      ) {
        setNotifications(
          notificationResult.value.map(
            normalizeNotification,
          ),
        );
      }

      if (
        preferenceResult.status ===
        'fulfilled'
      ) {
        const nextSettings =
          mergeSettings(
            DEFAULT_SETTINGS,
            preferenceResult.value,
          );

        setSettings(nextSettings);

        setBalanceHidden(
          nextSettings.hideBalanceDefault,
        );
      }

      if (
        cashbackResult.status ===
        'fulfilled'
      ) {
        setCashbackBalance(
          toNumber(
            cashbackResult.value
              .balance,
          ),
        );

        setCashbackSettings({
          enabled:
            cashbackResult.value
              .cashbackEnabled ??
            false,
          minTransferAmount:
            toNumber(
              cashbackResult.value
                .minTransferAmount ??
                100,
            ),
          transferMode:
            cashbackResult.value
              .transferMode === 'auto'
              ? 'auto'
              : 'manual',
          eligibleServices:
            Array.isArray(
              cashbackResult.value
                .eligibleServices,
            )
              ? cashbackResult.value
                  .eligibleServices
              : ['data'],
        });
      }
    }, [user]);

  const restoreSession =
    useCallback(async () => {
      try {
        const session =
          await request<{
            user?: unknown;
            balance?: string | number;
            transactions?: unknown[];
            notifications?: unknown[];
            preferences?: Record<
              string,
              unknown
            >;
          }>('/auth/me');

        const nextUser =
          normalizeUser(
            session.user,
          );

        if (!nextUser) {
          setUser(null);
          return;
        }

        setUser(nextUser);

        setBalance(
          toNumber(
            session.balance,
          ),
        );

        setTransactions(
          Array.isArray(
            session.transactions,
          )
            ? session.transactions.map(
                normalizeTransaction,
              )
            : [],
        );

        setNotifications(
          Array.isArray(
            session.notifications,
          )
            ? session.notifications.map(
                normalizeNotification,
              )
            : [],
        );

        if (
          session.preferences
        ) {
          const nextSettings =
            mergeSettings(
              DEFAULT_SETTINGS,
              session.preferences,
            );

          setSettings(nextSettings);

          setBalanceHidden(
            nextSettings.hideBalanceDefault,
          );
        }

        try {
          const cashback =
            await request<{
              balance?: string | number;
              cashbackEnabled?: boolean;
              minTransferAmount?: number;
              transferMode?: 'manual' | 'auto';
              eligibleServices?: string[];
            }>(
              '/cashback/wallet',
            );

          setCashbackBalance(
            toNumber(
              cashback.balance,
            ),
          );

          setCashbackSettings({
            enabled:
              cashback.cashbackEnabled ??
              false,
            minTransferAmount:
              toNumber(
                cashback.minTransferAmount ??
                  100,
              ),
            transferMode:
              cashback.transferMode ===
              'auto'
                ? 'auto'
                : 'manual',
            eligibleServices:
              Array.isArray(
                cashback.eligibleServices,
              )
                ? cashback.eligibleServices
                : ['data'],
          });
        } catch {
          // Cashback is optional.
        }
      } catch {
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }, []);

  useEffect(() => {
    void restoreSession();
  }, [restoreSession]);

  const login = useCallback(
    async (
      phone: string,
      loginPin: string,
    ): Promise<LoginResult> => {
      try {
        const session =
          await request<{
            user?: unknown;
            balance?: string | number;
            transactions?: unknown[];
            notifications?: unknown[];
            preferences?: Record<
              string,
              unknown
            >;
          }>('/auth/login', {
            method: 'POST',
            body: JSON.stringify({
              phone,
              loginPin,
            }),
          });

        const nextUser =
          normalizeUser(
            session.user,
          );

        if (!nextUser) {
          return {
            success: false,
            error:
              'Account data could not be loaded.',
          };
        }

        setUser(nextUser);
        setBalance(
          toNumber(
            session.balance,
          ),
        );

        setTransactions(
          Array.isArray(
            session.transactions,
          )
            ? session.transactions.map(
                normalizeTransaction,
              )
            : [],
        );

        setNotifications(
          Array.isArray(
            session.notifications,
          )
            ? session.notifications.map(
                normalizeNotification,
              )
            : [],
        );

        if (
          session.preferences
        ) {
          const nextSettings =
            mergeSettings(
              DEFAULT_SETTINGS,
              session.preferences,
            );

          setSettings(nextSettings);
          setBalanceHidden(
            nextSettings.hideBalanceDefault,
          );
        }

        await refreshCashbackWallet();

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
    [refreshCashbackWallet],
  );

  const logout =
    useCallback(async () => {
      try {
        await request<{
          ok: boolean;
        }>('/auth/logout', {
          method: 'POST',
        });
      } finally {
        setUser(null);
        setBalance(0);
        setCashbackBalance(0);
        setCashbackSettings(null);
        setTransactions([]);
        setNotifications([]);
        setActiveTab('home');
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
              exists: boolean;
            }>(
              `/auth/check-phone?phone=${encodeURIComponent(
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
              available: boolean;
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
          const session =
            await request<{
              user?: unknown;
              balance?: string | number;
              transactions?: unknown[];
              notifications?: unknown[];
              preferences?: Record<
                string,
                unknown
              >;
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
            normalizeUser(
              session.user,
            );

          if (nextUser) {
            setUser(nextUser);
            setBalance(
              toNumber(
                session.balance,
              ),
            );

            setTransactions(
              Array.isArray(
                session.transactions,
              )
                ? session.transactions.map(
                    normalizeTransaction,
                  )
                : [],
            );

            setNotifications(
              Array.isArray(
                session.notifications,
              )
                ? session.notifications.map(
                    normalizeNotification,
                  )
                : [],
            );
          }

          await refreshCashbackWallet();

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
      [refreshCashbackWallet],
    );

  const requestPinReset =
    useCallback(
      async (
        phone: string,
      ): Promise<PinResetResult> => {
        try {
          const data =
            await request<{
              message?: string;
              otp?: string;
            }>(
              '/auth/forgot-pin/request',
              {
                method: 'POST',
                body: JSON.stringify({
                  phone,
                }),
              },
            );

          return {
            success: true,
            devOtp: data.otp,
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Could not request PIN reset.',
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
          await request<{
            ok: boolean;
          }>(
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
                : 'PIN reset failed.',
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
              valid: boolean;
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
      ) => {
        try {
          await request<{
            ok: boolean;
          }>('/user/pin', {
            method: 'PUT',
            body: JSON.stringify({
              currentPin,
              newPin,
            }),
          });

          return {
            ok: true,
          };
        } catch (error) {
          return {
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : 'PIN change failed.',
          };
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
              ok: boolean;
              username?: string;
              usernameChangedAt?: string;
            }>('/user/username', {
              method: 'PATCH',
              body: JSON.stringify({
                username,
              }),
            });

          setUser(
            current =>
              current
                ? {
                    ...current,
                    username:
                      data.username ??
                      username,
                    usernameChangedAt:
                      data.usernameChangedAt ??
                      current.usernameChangedAt,
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
                : 'Could not change username.',
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
        idempotencyKey?: string | null;
      }): Promise<PurchaseResult> => {
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
                }),
              },
            );

          await refreshWallet();
          await refreshCashbackWallet();

          return result;
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : 'Data purchase failed.';

          return {
            success: false,
            requestId: '',
            error: message,
          };
        }
      },
      [
        refreshWallet,
        refreshCashbackWallet,
      ],
    );

  const purchaseAirtime =
    useCallback(
      async (params: {
        network: string;
        phone: string;
        amount: number;
        idempotencyKey?: string | null;
      }): Promise<PurchaseResult> => {
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
                }),
              },
            );

          await refreshWallet();
          await refreshCashbackWallet();

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
          // Restore only if server update
          // failed.
          setSettings(settings);
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
            error?: string;
          }>('/cashback/transfer', {
            method: 'POST',
            body: JSON.stringify({}),
          });

        setBalance(
          toNumber(
            result.newMainBalance,
          ),
        );

        setCashbackBalance(
          toNumber(
            result.newCashbackBalance,
          ),
        );

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
    <AppContext.Provider value={value}>
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
