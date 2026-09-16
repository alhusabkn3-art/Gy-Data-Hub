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

  resetPin: (
    phone: string,
  ) => Promise<PinResetResult>;

  verifyResetOtp: (
    phone: string,
    otp: string,
  ) => Promise<PinResetResult>;

  resetPinWithOtp: (
    phone: string,
    otp: string,
    newPin: string,
  ) => Promise<PinResetResult>;

  refreshWallet: () => Promise<void>;
  refreshCashbackWallet: () => Promise<void>;
  refreshCashbackSettings: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  refreshAll: () => Promise<void>;

  purchaseData: (
    phone: string,
    network: string,
    planId: string,
    planName: string,
    amount: number,
    purchasePin: string,
  ) => Promise<PurchaseResult>;

  purchaseAirtime: (
    phone: string,
    network: string,
    amount: number,
    purchasePin: string,
  ) => Promise<PurchaseResult>;

  transferCashbackToMain: (
    amount: number,
    purchasePin: string,
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;

  setActiveTab: (
    tab: string,
  ) => void;

  toggleBalanceVisibility: () => void;

  updateSettings: (
    updates: Partial<Settings>,
  ) => Promise<{
    success: boolean;
    error?: string;
  }>;
}

const AppContext =
  createContext<AppContextValue | undefined>(
    undefined,
  );

const DEFAULT_SETTINGS: Settings = {
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

function toNumber(
  value: unknown,
): number {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function normalizeUser(
  value: unknown,
): User | null {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return null;
  }

  const raw =
    value as Record<string, unknown>;

  return {
    ...(raw as User),
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    email: String(raw.email ?? ''),
    phone: String(raw.phone ?? ''),
    username: String(
      raw.username ?? '',
    ),
  } as User;
}

function normalizeTransaction(
  value: unknown,
): Transaction {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return {
      id: '',
      type: 'other',
      amount: 0,
      status: 'pending',
      createdAt: new Date().toISOString(),
    } as Transaction;
  }

  const raw =
    value as Record<string, unknown>;

  return {
    ...(raw as Transaction),
    id: String(raw.id ?? ''),
    amount: toNumber(raw.amount),
  } as Transaction;
}

function normalizeNotification(
  value: unknown,
): Notification {
  if (
    !value ||
    typeof value !== 'object'
  ) {
    return {
      id: '',
      title: '',
      message: '',
      read: false,
      createdAt: new Date().toISOString(),
    } as Notification;
  }

  const raw =
    value as Record<string, unknown>;

  return {
    ...(raw as Notification),
    id: String(raw.id ?? ''),
    title: String(
      raw.title ?? '',
    ),
    message: String(
      raw.message ?? '',
    ),
    read: Boolean(raw.read),
  } as Notification;
}

function mergeSettings(
  current: Settings,
  incoming: Record<string, unknown>,
): Settings {
  const incomingNotifications =
    incoming.notifications;

  return {
    ...current,
    ...(incoming as Partial<Settings>),
    notifications:
      incomingNotifications &&
      typeof incomingNotifications ===
        'object'
        ? {
            ...current.notifications,
            ...(incomingNotifications as Partial<
              Settings['notifications']
            >),
          }
        : current.notifications,
  };
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response =
    await fetch(`${API}${path}`, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type':
          'application/json',
        ...(options.headers || {}),
      },
    });

  const contentType =
    response.headers.get(
      'content-type',
    ) || '';

  let data: unknown = null;

  if (
    contentType.includes(
      'application/json',
    )
  ) {
    data =
      await response.json();
  } else {
    const text =
      await response.text();

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = {
          message: text,
        };
      }
    }
  }

  if (!response.ok) {
    const message =
      data &&
      typeof data === 'object'
        ? String(
            (
              data as Record<
                string,
                unknown
              >
            ).message ??
              (
                data as Record<
                  string,
                  unknown
                >
              ).error ??
              `Request failed with status ${response.status}`,
          )
        : `Request failed with status ${response.status}`;

    throw new Error(message);
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
    useState<CashbackSettings | null>(
      null,
    );

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
          }>('/user/wallet');

        setBalance(
          toNumber(data.balance),
        );
      } catch {
        // Keep existing balance.
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
          }>(
            '/user/transactions',
          );

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
            notifications?: unknown[];
          }>(
            '/user/notifications',
          );

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
        // Keep existing notifications.
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
          }>(
            '/user/preferences',
          );

        if (
          data.settings &&
          typeof data.settings ===
            'object'
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
        // Keep local settings.
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
          }>(
            '/cashback/settings',
          );

        if (data.settings) {
          setCashbackSettings({
            enabled: Boolean(
              data.settings.enabled,
            ),
            minTransferAmount:
              toNumber(
                data.settings
                  .minTransferAmount,
              ),
            transferMode:
              data.settings
                .transferMode ===
              'auto'
                ? 'auto'
                : 'manual',
            eligibleServices:
              Array.isArray(
                data.settings
                  .eligibleServices,
              )
                ? data.settings
                    .eligibleServices.map(
                      String,
                    )
                : [],
          });
        }
      } catch {
        // Optional.
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

  /*
   * IMPORTANT:
   *
   * This effect MUST run only once on mount.
   *
   * Do NOT put refreshWallet,
   * refreshTransactions, refreshSettings,
   * etc. inside this dependency array.
   *
   * Those callbacks depend on `user`.
   * If they are dependencies here:
   *
   * setUser()
   *   -> callbacks change
   *   -> effect runs again
   *   -> /auth/me runs again
   *   -> setUser()
   *   -> loop
   *
   * That was the cause of the endless
   * loading/auth/me requests.
   */
  useEffect(() => {
    let mounted = true;

    const restoreSession =
      async () => {
        try {
          const data =
            await request<{
              user?: unknown;
            }>('/auth/me');

          const nextUser =
            normalizeUser(data.user);

          if (!mounted) return;

          setUser(nextUser);

          if (nextUser) {
            try {
              const [
                walletData,
                cashbackData,
                transactionsData,
                notificationsData,
                settingsData,
              ] =
                await Promise.all([
                  request<{
                    balance?:
                      | number
                      | string;
                  }>('/user/wallet'),

                  request<{
                    balance?:
                      | number
                      | string;
                    cashbackBalance?:
                      | number
                      | string;
                  }>(
                    '/cashback/wallet',
                  ),

                  request<{
                    transactions?: unknown[];
                  }>(
                    '/user/transactions',
                  ),

                  request<{
                    notifications?: unknown[];
                  }>(
                    '/user/notifications',
                  ),

                  request<{
                    settings?: Record<
                      string,
                      unknown
                    >;
                  }>(
                    '/user/preferences',
                  ),
                ]);

              if (!mounted) return;

              setBalance(
                toNumber(
                  walletData.balance,
                ),
              );

              setCashbackBalance(
                toNumber(
                  cashbackData.cashbackBalance ??
                    cashbackData.balance,
                ),
              );

              setTransactions(
                Array.isArray(
                  transactionsData.transactions,
                )
                  ? transactionsData.transactions.map(
                      normalizeTransaction,
                    )
                  : [],
              );

              setNotifications(
                Array.isArray(
                  notificationsData.notifications,
                )
                  ? notificationsData.notifications.map(
                      normalizeNotification,
                    )
                  : [],
              );

              if (
                settingsData.settings &&
                typeof settingsData.settings ===
                  'object'
              ) {
                setSettings(
                  current =>
                    mergeSettings(
                      current,
                      settingsData.settings!,
                    ),
                );

                if (
                  typeof settingsData
                    .settings
                    .hideBalanceDefault ===
                  'boolean'
                ) {
                  setBalanceHidden(
                    settingsData
                      .settings
                      .hideBalanceDefault,
                  );
                }
              }
            } catch {
              /*
               * A valid session must not be
               * converted into a loading/error
               * state just because one of the
               * optional startup endpoints fails.
               */
            }
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
  }, []);

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
            normalizeUser(data.user);

          setUser(nextUser);

          if (nextUser) {
            await Promise.all([
              refreshWallet(),
              refreshCashbackWallet(),
              refreshCashbackSettings(),
              refreshTransactions(),
              refreshNotifications(),
              refreshSettings(),
            ]);
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
                : 'Login failed',
          };
        }
      },
      [
        refreshWallet,
        refreshCashbackWallet,
        refreshCashbackSettings,
        refreshTransactions,
        refreshNotifications,
        refreshSettings,
      ],
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
        // Clear local session even if
        // server logout fails.
      } finally {
        setUser(null);
        setBalance(0);
        setCashbackBalance(0);
        setTransactions([]);
        setNotifications([]);
        setCashbackSettings(null);
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
                }),
              },
            );

          const nextUser =
            normalizeUser(data.user);

          if (nextUser) {
            setUser(nextUser);

            await Promise.all([
              refreshWallet(),
              refreshCashbackWallet(),
              refreshCashbackSettings(),
              refreshTransactions(),
              refreshNotifications(),
              refreshSettings(),
            ]);
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
                : 'Registration failed',
          };
        }
      },
      [
        refreshWallet,
        refreshCashbackWallet,
        refreshCashbackSettings,
        refreshTransactions,
        refreshNotifications,
        refreshSettings,
      ],
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
              '/auth/account-exists',
              {
                method: 'POST',
                body: JSON.stringify({
                  phone,
                }),
              },
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
              '/user/check-username',
              {
                method: 'POST',
                body: JSON.stringify({
                  username,
                }),
              },
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
              user?: unknown;
            }>(
              '/user/username',
              {
                method: 'PATCH',
                body: JSON.stringify({
                  username,
                }),
              },
            );

          const nextUser =
            normalizeUser(data.user);

          if (nextUser) {
            setUser(nextUser);
          } else if (user) {
            setUser({
              ...user,
              username,
            });
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
                : 'Unable to change username',
          };
        }
      },
      [user],
    );

  const verifyPin =
    useCallback(
      async (
        pin: string,
      ): Promise<boolean> => {
        if (!user) return false;

        try {
          const data =
            await request<{
              valid?: boolean;
              success?: boolean;
            }>(
              '/user/check-pin',
              {
                method: 'POST',
                body: JSON.stringify({
                  pin,
                }),
              },
            );

          return Boolean(
            data.valid ??
              data.success,
          );
        } catch {
          return false;
        }
      },
      [user],
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
        if (!user) {
          return {
            ok: false,
            error:
              'You are not logged in',
          };
        }

        try {
          await request(
            '/user/pin',
            {
              method: 'PATCH',
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
                : 'Unable to change Login PIN',
          };
        }
      },
      [user],
    );

  const verifyPurchasePin =
    useCallback(
      async (
        purchasePin: string,
      ): Promise<boolean> => {
        if (!user) return false;

        try {
          const data =
            await request<{
              valid?: boolean;
              success?: boolean;
            }>(
              '/user/check-purchase-pin',
              {
                method: 'POST',
                body: JSON.stringify({
                  purchasePin,
                }),
              },
            );

          return Boolean(
            data.valid ??
              data.success,
          );
        } catch {
          return false;
        }
      },
      [user],
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
        if (!user) {
          return {
            ok: false,
            error:
              'You are not logged in',
          };
        }

        try {
          await request(
            '/user/purchase-pin',
            {
              method: 'PATCH',
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
                : 'Unable to change Purchase PIN',
          };
        }
      },
      [user],
    );

  const resetPin =
    useCallback(
      async (
        phone: string,
      ): Promise<PinResetResult> => {
        try {
          const data =
            await request<{
              devOtp?: string;
            }>(
              '/auth/reset-pin',
              {
                method: 'POST',
                body: JSON.stringify({
                  phone,
                }),
              },
            );

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
                : 'Unable to reset PIN',
          };
        }
      },
      [],
    );

  const verifyResetOtp =
    useCallback(
      async (
        phone: string,
        otp: string,
      ): Promise<PinResetResult> => {
        try {
          await request(
            '/auth/verify-reset-otp',
            {
              method: 'POST',
              body: JSON.stringify({
                phone,
                otp,
              }),
            },
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
                : 'Invalid OTP',
          };
        }
      },
      [],
    );

  const resetPinWithOtp =
    useCallback(
      async (
        phone: string,
        otp: string,
        newPin: string,
      ): Promise<PinResetResult> => {
        try {
          await request(
            '/auth/reset-pin-confirm',
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
            success: true,
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to set new PIN',
          };
        }
      },
      [],
    );

  const purchaseData =
    useCallback(
      async (
        phone: string,
        network: string,
        planId: string,
        planName: string,
        amount: number,
        purchasePin: string,
      ): Promise<PurchaseResult> => {
        try {
          const data =
            await request<PurchaseResult>(
              '/purchase/data',
              {
                method: 'POST',
                body: JSON.stringify({
                  phone,
                  network,
                  planId,
                  planName,
                  amount,
                  purchasePin,
                }),
              },
            );

          await Promise.all([
            refreshWallet(),
            refreshCashbackWallet(),
            refreshTransactions(),
            refreshNotifications(),
          ]);

          return {
            ...data,
            success:
              data.success !== false,
          };
        } catch (error) {
          return {
            success: false,
            requestId: '',
            error:
              error instanceof Error
                ? error.message
                : 'Data purchase failed',
          };
        }
      },
      [
        refreshWallet,
        refreshCashbackWallet,
        refreshTransactions,
        refreshNotifications,
      ],
    );

  const purchaseAirtime =
    useCallback(
      async (
        phone: string,
        network: string,
        amount: number,
        purchasePin: string,
      ): Promise<PurchaseResult> => {
        try {
          const data =
            await request<PurchaseResult>(
              '/purchase/airtime',
              {
                method: 'POST',
                body: JSON.stringify({
                  phone,
                  network,
                  amount,
                  purchasePin,
                }),
              },
            );

          await Promise.all([
            refreshWallet(),
            refreshCashbackWallet(),
            refreshTransactions(),
            refreshNotifications(),
          ]);

          return {
            ...data,
            success:
              data.success !== false,
          };
        } catch (error) {
          return {
            success: false,
            requestId: '',
            error:
              error instanceof Error
                ? error.message
                : 'Airtime purchase failed',
          };
        }
      },
      [
        refreshWallet,
        refreshCashbackWallet,
        refreshTransactions,
        refreshNotifications,
      ],
    );

  const transferCashbackToMain =
    useCallback(
      async (
        amount: number,
        purchasePin: string,
      ): Promise<{
        success: boolean;
        error?: string;
      }> => {
        try {
          await request(
            '/cashback/transfer',
            {
              method: 'POST',
              body: JSON.stringify({
                amount,
                purchasePin,
              }),
            },
          );

          await Promise.all([
            refreshWallet(),
            refreshCashbackWallet(),
            refreshTransactions(),
          ]);

          return {
            success: true,
          };
        } catch (error) {
          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Cashback transfer failed',
          };
        }
      },
      [
        refreshWallet,
        refreshCashbackWallet,
        refreshTransactions,
      ],
    );

  const toggleBalanceVisibility =
    useCallback(() => {
      setBalanceHidden(
        current => !current,
      );
    }, []);

  const updateSettings =
    useCallback(
      async (
        updates: Partial<Settings>,
      ): Promise<{
        success: boolean;
        error?: string;
      }> => {
        if (!user) {
          return {
            success: false,
            error:
              'You are not logged in',
          };
        }

        const previous =
          settings;

        setSettings(
          current =>
            mergeSettings(
              current,
              updates as Record<
                string,
                unknown
              >,
            ),
        );

        if (
          typeof updates.hideBalanceDefault ===
          'boolean'
        ) {
          setBalanceHidden(
            updates.hideBalanceDefault,
          );
        }

        try {
          await request(
            '/user/preferences',
            {
              method: 'PATCH',
              body: JSON.stringify(
                updates,
              ),
            },
          );

          return {
            success: true,
          };
        } catch (error) {
          setSettings(previous);

          return {
            success: false,
            error:
              error instanceof Error
                ? error.message
                : 'Unable to update settings',
          };
        }
      },
      [user, settings],
    );

  const unreadCount =
    useMemo(
      () =>
        notifications.filter(
          notification =>
            !Boolean(
              (
                notification as unknown as Record<
                  string,
                  unknown
                >
              ).read,
            ),
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

        verifyPin,
        changePin,

        verifyPurchasePin,
        changePurchasePin,

        resetPin,
        verifyResetOtp,
        resetPinWithOtp,

        refreshWallet,
        refreshCashbackWallet,
        refreshCashbackSettings,
        refreshTransactions,
        refreshNotifications,
        refreshSettings,
        refreshAll,

        purchaseData,
        purchaseAirtime,
        transferCashbackToMain,

        setActiveTab,

        toggleBalanceVisibility,

        updateSettings,
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

        verifyPin,
        changePin,
        verifyPurchasePin,
        changePurchasePin,

        resetPin,
        verifyResetOtp,
        resetPinWithOtp,

        refreshWallet,
        refreshCashbackWallet,
        refreshCashbackSettings,
        refreshTransactions,
        refreshNotifications,
        refreshSettings,
        refreshAll,

        purchaseData,
        purchaseAirtime,
        transferCashbackToMain,

        toggleBalanceVisibility,
        updateSettings,
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
