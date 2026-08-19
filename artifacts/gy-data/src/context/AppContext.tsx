import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Transaction, Notification } from '../data/mockData';

// ── API helper ────────────────────────────────────────────────────────────────
// Note: `headers` must be extracted before spreading `restOpts` so that
// spreading opts at the end does NOT overwrite the merged Content-Type header.
const api = (path: string, opts?: RequestInit) => {
  const { headers: extraHeaders, ...restOpts } = opts ?? {};
  return fetch(`/api${path}`, {
    credentials: 'include',
    ...restOpts,
    headers: { 'Content-Type': 'application/json', ...(extraHeaders ?? {}) },
  });
};

// ── Transform raw DB rows → frontend shapes ───────────────────────────────────

function transformTransaction(t: Record<string, unknown>): Transaction {
  const d = new Date(t['createdAt'] as string);
  const today     = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  let date: string;
  if (d.toDateString() === today.toDateString())     date = 'Today';
  else if (d.toDateString() === yesterday.toDateString()) date = 'Yesterday';
  else date = d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

  return {
    id:            t['id'] as string,
    type:          t['type'] as Transaction['type'],
    service:       t['service'] as string,
    provider:      t['provider'] as string,
    amount:        parseFloat(t['amount'] as string),
    date,
    time:          d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    status:        t['status'] as Transaction['status'],
    description:   (t['description'] as string) ?? '',
    paymentMethod: (t['paymentMethod'] as string | null) ?? undefined,
  };
}

function transformNotification(n: Record<string, unknown>): Notification {
  const rawCreatedAt = n['createdAt'] as string;
  const d       = new Date(rawCreatedAt);
  const diffMs  = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffH   = Math.floor(diffMin / 60);
  const diffD   = Math.floor(diffH / 24);

  let timestamp: string;
  if (diffMin < 1)       timestamp = 'Just now';
  else if (diffMin < 60) timestamp = `${diffMin}m ago`;
  else if (diffH < 24)   timestamp = `${diffH}h ago`;
  else if (diffD < 7)    timestamp = `${diffD}d ago`;
  else timestamp = d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

  return {
    id:        n['id'] as string,
    type:      n['type'] as Notification['type'],
    title:     n['title'] as string,
    body:      n['body'] as string,
    timestamp,
    createdAt: rawCreatedAt,
    read:      n['read'] as boolean,
    refId:     (n['refId'] as string | null) ?? undefined,
  };
}

// ── Settings ──────────────────────────────────────────────────────────────────
interface AppSettings {
  biometrics: boolean;
  theme: 'light' | 'dark' | 'system';
  notifications: {
    transactions: boolean;
    promotional: boolean;
    security: boolean;
    email: boolean;
  };
  hideBalanceDefault: boolean;
  autoLock: string;
}

const defaultSettings: AppSettings = {
  biometrics: false,
  theme: 'system',
  notifications: {
    transactions: true,
    promotional: true,
    security: true,
    email: false,
  },
  hideBalanceDefault: false,
  autoLock: '5 min',
};

// ── Context type ──────────────────────────────────────────────────────────────
interface AppContextType {
  isLoggedIn: boolean;
  isLoading: boolean;
  user: User | null;
  balance: number;
  cashbackBalance: number;
  balanceHidden: boolean;
  transactions: Transaction[];
  notifications: Notification[];
  unreadCount: number;
  settings: AppSettings;
  activeTab: string;

  cashbackSettings: {
    enabled: boolean;
    minTransferAmount: number;
    transferMode: 'manual' | 'auto';
  } | null;

  /** Login by phone + PIN. */
  login: (
    phone: string,
    pin: string
  ) => Promise<
    | 'success'
    | 'no_account'
    | 'wrong_pin'
    | 'account_suspended'
    | 'account_closed'
    | 'server_error'
  >;

  logout: () => Promise<void>;

  /** Register and auto-login. */
  register: (
    name: string,
    phone: string,
    email: string,
    pin: string,
    username: string
  ) => Promise<
    'success' | 'phone_taken' | 'username_taken' | 'error'
  >;

  accountExists: (phone: string) => Promise<boolean>;

  checkUsernameAvailable: (
    username: string
  ) => Promise<
    'available' | 'taken' | 'invalid' | 'error'
  >;

  changeUsername: (
    username: string
  ) => Promise<{
    ok: boolean;
    error?: string;
    nextChangeAt?: string;
  }>;

  verifyPin: (pin: string) => Promise<boolean>;

  changePin: (
    oldPin: string,
    newPin: string
  ) => Promise<boolean>;

  requestPinReset: (
    phone: string
  ) => Promise<{
    ok: boolean;
    devOtp?: string;
  }>;

  resetPin: (
    phone: string,
    otp: string,
    newPin: string
  ) => Promise<boolean>;

  toggleBalanceHidden: () => void;

  markAllNotificationsRead: () => Promise<void>;

  updateSettings: (
    settings: Partial<AppSettings>
  ) => void;

  addTransaction: (
    transaction: Omit<
      Transaction,
      'id' | 'date' | 'time'
    >
  ) => Promise<boolean>;

  purchaseAirtime: (
    params: {
      network: string;
      phone: string;
      amount: number;
      idempotencyKey?: string;
    }
  ) => Promise<{
    success: boolean;
    pending?: boolean;
    requestId?: string;
    balance?: number;
    error?: string;
  }>;

  purchaseData: (
    params: {
      network: string;
      phone: string;
      planCode: string;
      planName: string;
      planPrice: string;
      idempotencyKey?: string;
    }
  ) => Promise<{
    success: boolean;
    pending?: boolean;
    requestId?: string;
    planName?: string;
    balance?: number;
    error?: string;
    cashbackApplied?: boolean;
    cashbackAmount?: number;
  }>;

  setActiveTab: (tab: string) => void;

  fundWallet: (
    amount: number
  ) => Promise<boolean>;

  refreshWallet: () => Promise<void>;

  transferCashback: (
    amount?: number
  ) => Promise<{
    ok: boolean;
    error?: string;
    transferred?: number;
    newMainBalance?: number;
    newCashbackBalance?: number;
  }>;

  refreshCashbackWallet: () => Promise<void>;

  markNotificationRead: (
    id: string
  ) => Promise<void>;

  deleteNotification: (
    id: string
  ) => Promise<void>;

  clearAllNotifications: () => Promise<void>;
}

// ── Provider ──────────────────────────────────────────────────────────────────
const AppContext =
  createContext<AppContextType | undefined>(
    undefined
  );

export const AppProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [isLoggedIn, setIsLoggedIn] =
    useState(false);

  const [isLoading, setIsLoading] =
    useState(true);

  const [user, setUser] =
    useState<User | null>(null);

  const [balance, setBalance] =
    useState(0);

  const [cashbackBalance, setCashbackBalance] =
    useState(0);

  const [cashbackSettings, setCashbackSettings] =
    useState<{
      enabled: boolean;
      minTransferAmount: number;
      transferMode: 'manual' | 'auto';
    } | null>(null);

  const [balanceHidden, setBalanceHidden] =
    useState(false);

  const [transactions, setTransactions] =
    useState<Transaction[]>([]);

  const [notifications, setNotifications] =
    useState<Notification[]>([]);

  const [settings, setSettings] =
    useState(defaultSettings);

  const [activeTab, setActiveTab] =
    useState('home');

  const unreadCount =
    notifications.filter(
      n => !n.read
    ).length;

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    api('/auth/me')
      .then(async res => {
        if (!res.ok) return;

        const data =
          await res.json() as {
            user: User;
            balance: string;
            transactions: Record<string, unknown>[];
            notifications: Record<string, unknown>[];
            preferences?: Partial<AppSettings>;
          };

        setUser(data.user);

        setBalance(
          parseFloat(data.balance)
        );

        setTransactions(
          data.transactions.map(
            transformTransaction
          )
        );

        setNotifications(
          data.notifications.map(
            transformNotification
          )
        );

        if (
          data.preferences &&
          Object.keys(data.preferences).length > 0
        ) {
          setSettings(prev => ({
            ...prev,
            ...data.preferences,
          }));
        }

        setIsLoggedIn(true);

        void api('/cashback/wallet')
          .then(async r => {
            if (!r.ok) return;

            const cb =
              await r.json() as {
                balance: string;
                cashbackEnabled: boolean;
                minTransferAmount: number;
                transferMode: string;
              };

            setCashbackBalance(
              parseFloat(
                cb.balance ?? '0'
              )
            );

            setCashbackSettings({
              enabled:
                cb.cashbackEnabled,

              minTransferAmount:
                cb.minTransferAmount,

              transferMode:
                cb.transferMode as
                  | 'manual'
                  | 'auto',
            });
          })
          .catch(() => {
            // non-fatal
          });
      })
      .catch(() => {
        // network error — stay logged out
      })
      .finally(() =>
        setIsLoading(false)
      );
  }, []);

  // ── Auth ──────────────────────────────────────────────────────────────────

  const login = async (
    phone: string,
    pin: string,
  ): Promise<
    | 'success'
    | 'no_account'
    | 'wrong_pin'
    | 'account_suspended'
    | 'account_closed'
    | 'server_error'
  > => {
    try {
      const res = await api(
        '/auth/login',
        {
          method: 'POST',
          body: JSON.stringify({
            phone: phone.trim(),
            loginPin: pin,
          }),
        }
      );

      let body: {
        error?: string;
        message?: string;
        user?: User;
        balance?: string;
        transactions?: Record<string, unknown>[];
        notifications?: Record<string, unknown>[];
        preferences?: Partial<AppSettings>;
      } = {};

      try {
        body = await res.json();
      } catch {
        body = {};
      }

      /*
       * IMPORTANT:
       *
       * Only an explicit 401 wrong_pin is a wrong PIN.
       *
       * 500 / 503 / session errors must NOT be shown
       * to the user as "Incorrect PIN".
       */
      if (res.status === 401) {
        if (
          body.error === 'no_account'
        ) {
          return 'no_account';
        }

        if (
          body.error === 'account_suspended'
        ) {
          return 'account_suspended';
        }

        if (
          body.error === 'account_closed'
        ) {
          return 'account_closed';
        }

        if (
          body.error === 'wrong_pin'
        ) {
          return 'wrong_pin';
        }

        return 'server_error';
      }

      /*
       * Any non-OK response other than the
       * explicitly handled 401 above is a
       * server/application error.
       */
      if (!res.ok) {
        console.error(
          'Login server error:',
          {
            status: res.status,
            error: body.error,
            message: body.message,
          }
        );

        return 'server_error';
      }

      /*
       * Validate successful response before
       * updating application state.
       */
      if (
        !body.user ||
        body.balance == null ||
        !Array.isArray(
          body.transactions
        ) ||
        !Array.isArray(
          body.notifications
        )
      ) {
        console.error(
          'Invalid login response:',
          body
        );

        return 'server_error';
      }

      setUser(body.user);

      setBalance(
        parseFloat(body.balance)
      );

      setTransactions(
        body.transactions.map(
          transformTransaction
        )
      );

      setNotifications(
        body.notifications.map(
          transformNotification
        )
      );

      if (
        body.preferences &&
        Object.keys(
          body.preferences
        ).length > 0
      ) {
        setSettings(prev => ({
          ...prev,
          ...body.preferences,
        }));
      }

      setIsLoggedIn(true);
      setActiveTab('home');

      /*
       * Cashback is non-critical.
       * It must never make login fail.
       */
      void api('/cashback/wallet')
        .then(async r => {
          if (!r.ok) return;

          const cb =
            await r.json() as {
              balance: string;
              cashbackEnabled: boolean;
              minTransferAmount: number;
              transferMode: string;
            };

          setCashbackBalance(
            parseFloat(
              cb.balance ?? '0'
            )
          );

          setCashbackSettings({
            enabled:
              cb.cashbackEnabled,

            minTransferAmount:
              cb.minTransferAmount,

            transferMode:
              cb.transferMode as
                | 'manual'
                | 'auto',
          });
        })
        .catch(() => {
          // non-fatal
        });

      return 'success';

    } catch (error) {
      /*
       * Network/fetch failure is NOT a wrong PIN.
       */
      console.error(
        'Login network error:',
        error
      );

      return 'server_error';
    }
  };

  const logout = async (): Promise<void> => {
    try {
      await api(
        '/auth/logout',
        {
          method: 'POST',
        }
      );
    } catch {
      // ignore
    }

    setIsLoggedIn(false);
    setUser(null);
    setBalance(0);
    setCashbackBalance(0);
    setCashbackSettings(null);
    setTransactions([]);
    setNotifications([]);
    setSettings(defaultSettings);
    setActiveTab('home');
  };

  const register = async (
    name: string,
    phone: string,
    email: string,
    pin: string,
    username: string,
  ): Promise<
    'success' | 'phone_taken' | 'username_taken' | 'error'
  > => {
    try {
      const res = await api(
        '/auth/register',
        {
          method: 'POST',
          body: JSON.stringify({
            name,
            phone,
            email,
            loginPin: pin,
            username,
          }),
        }
      );

      if (res.status === 409) {
        const body =
          await res.json() as {
            error?: string;
          };

        if (
          body.error ===
          'phone_taken'
        ) {
          return 'phone_taken';
        }

        if (
          body.error ===
          'username_taken'
        ) {
          return 'username_taken';
        }

        return 'error';
      }

      if (!res.ok) {
        return 'error';
      }

      const data =
        await res.json() as {
          user: User;
          balance: string;
          transactions: Record<string, unknown>[];
          notifications: Record<string, unknown>[];
          preferences?: Partial<AppSettings>;
        };

      setUser(data.user);

      setBalance(
        parseFloat(data.balance)
      );

      setTransactions(
        data.transactions.map(
          transformTransaction
        )
      );

      setNotifications(
        data.notifications.map(
          transformNotification
        )
      );

      if (
        data.preferences &&
        Object.keys(
          data.preferences
        ).length > 0
      ) {
        setSettings(prev => ({
          ...prev,
          ...data.preferences,
        }));
      }

      setIsLoggedIn(true);
      setActiveTab('home');

      return 'success';

    } catch (error) {
      console.error(
        'Registration error:',
        error
      );

      return 'error';
    }
  };

  // ── Account checks ────────────────────────────────────────────────────────

  const accountExists = async (
    phone: string
  ): Promise<boolean> => {
    try {
      const res =
        await api(
          `/auth/check-phone?phone=${encodeURIComponent(phone)}`
        );

      if (!res.ok) {
        return false;
      }

      const data =
        await res.json() as {
          exists: boolean;
        };

      return Boolean(data.exists);
    } catch {
      return false;
    }
  };

  const checkUsernameAvailable =
    async (
      username: string
    ): Promise<
      'available' |
      'taken' |
      'invalid' |
      'error'
    > => {
      const normalized =
        username
          .toLowerCase()
          .trim();

      if (
        !/^[a-z]{4,15}$/.test(
          normalized
        )
      ) {
        return 'invalid';
      }

      try {
        const res =
          await api(
            `/auth/check-username?username=${encodeURIComponent(normalized)}`
          );

        if (!res.ok) {
          return 'error';
        }

        const data =
          await res.json() as {
            available: boolean;
          };

        return data.available
          ? 'available'
          : 'taken';
      } catch {
        return 'error';
      }
    };

  // ── Username ──────────────────────────────────────────────────────────────

  const changeUsername = async (
    username: string
  ): Promise<{
    ok: boolean;
    error?: string;
    nextChangeAt?: string;
  }> => {
    try {
      const res =
        await api(
          '/profile/username',
          {
            method: 'PATCH',
            body: JSON.stringify({
              username,
            }),
          }
        );

      const data =
        await res.json() as {
          ok?: boolean;
          error?: string;
          nextChangeAt?: string;
          user?: User;
        };

      if (!res.ok) {
        return {
          ok: false,
          error: data.error ??
            'Unable to change username.',
          nextChangeAt:
            data.nextChangeAt,
        };
      }

      if (data.user) {
        setUser(data.user);
      }

      return {
        ok: true,
        nextChangeAt:
          data.nextChangeAt,
      };
    } catch {
      return {
        ok: false,
        error:
          'Network error. Please try again.',
      };
    }
  };

  // ── PIN ───────────────────────────────────────────────────────────────────

  const verifyPin = async (
    pin: string
  ): Promise<boolean> => {
    try {
      const res =
        await api(
          '/profile/verify-pin',
          {
            method: 'POST',
            body: JSON.stringify({
              pin,
            }),
          }
        );

      return res.ok;
    } catch {
      return false;
    }
  };

  const changePin = async (
    oldPin: string,
    newPin: string
  ): Promise<boolean> => {
    try {
      const res =
        await api(
          '/profile/change-pin',
          {
            method: 'POST',
            body: JSON.stringify({
              oldPin,
              newPin,
            }),
          }
        );

      return res.ok;
    } catch {
      return false;
    }
  };

  // ── Forgot PIN ────────────────────────────────────────────────────────────

  const requestPinReset = async (
    phone: string
  ): Promise<{
    ok: boolean;
    devOtp?: string;
  }> => {
    try {
      const res =
        await api(
          '/auth/forgot-pin/request',
          {
            method: 'POST',
            body: JSON.stringify({
              phone,
            }),
          }
        );

      const data =
        await res.json() as {
          message?: string;
          otp?: string;
        };

      if (!res.ok) {
        return {
          ok: false,
        };
      }

      return {
        ok: true,
        devOtp: data.otp,
      };
    } catch {
      return {
        ok: false,
      };
    }
  };

  const resetPin = async (
    phone: string,
    otp: string,
    newPin: string
  ): Promise<boolean> => {
    try {
      const res =
        await api(
          '/auth/forgot-pin/reset',
          {
            method: 'POST',
            body: JSON.stringify({
              phone,
              otp,
              newPin,
            }),
          }
        );

      return res.ok;
    } catch {
      return false;
    }
  };

  // ── Balance ───────────────────────────────────────────────────────────────

  const toggleBalanceHidden =
    () => {
      setBalanceHidden(
        value => !value
      );
    };

  // ── Settings ──────────────────────────────────────────────────────────────

  const updateSettings = (
    patch: Partial<AppSettings>
  ) => {
    setSettings(prev => ({
      ...prev,
      ...patch,
      notifications: {
        ...prev.notifications,
        ...(patch.notifications ?? {}),
      },
    }));

    void api(
      '/profile/preferences',
      {
        method: 'PUT',
        body: JSON.stringify(
          patch
        ),
      }
    ).catch(() => {
      // local state remains usable
    });
  };

  // ── Notifications ─────────────────────────────────────────────────────────

  const markAllNotificationsRead =
    async (): Promise<void> => {
      try {
        const res =
          await api(
            '/notifications/read-all',
            {
              method: 'POST',
            }
          );

        if (res.ok) {
          setNotifications(
            prev =>
              prev.map(
                n => ({
                  ...n,
                  read: true,
                })
              )
          );
        }
      } catch {
        // ignore
      }
    };

  const markNotificationRead =
    async (
      id: string
    ): Promise<void> => {
      try {
        const res =
          await api(
            `/notifications/${encodeURIComponent(id)}/read`,
            {
              method: 'POST',
            }
          );

        if (res.ok) {
          setNotifications(
            prev =>
              prev.map(
                n =>
                  n.id === id
                    ? {
                        ...n,
                        read: true,
                      }
                    : n
              )
          );
        }
      } catch {
        // ignore
      }
    };

  const deleteNotification =
    async (
      id: string
    ): Promise<void> => {
      try {
        const res =
          await api(
            `/notifications/${encodeURIComponent(id)}`,
            {
              method: 'DELETE',
            }
          );

        if (res.ok) {
          setNotifications(
            prev =>
              prev.filter(
                n => n.id !== id
              )
          );
        }
      } catch {
        // ignore
      }
    };

  const clearAllNotifications =
    async (): Promise<void> => {
      try {
        const res =
          await api(
            '/notifications',
            {
              method: 'DELETE',
            }
          );

        if (res.ok) {
          setNotifications([]);
        }
      } catch {
        // ignore
      }
    };

  // ── Transactions ──────────────────────────────────────────────────────────

  const addTransaction =
    async (
      transaction: Omit<
        Transaction,
        'id' | 'date' | 'time'
      >
    ): Promise<boolean> => {
      try {
        const res =
          await api(
            '/transactions',
            {
              method: 'POST',
              body: JSON.stringify(
                transaction
              ),
            }
          );

        if (!res.ok) {
          return false;
        }

        const data =
          await res.json() as {
            transaction: Record<
              string,
              unknown
            >;
          };

        setTransactions(
          prev => [
            transformTransaction(
              data.transaction
            ),
            ...prev,
          ]
        );

        return true;
      } catch {
        return false;
      }
    };

  // ── Airtime ───────────────────────────────────────────────────────────────

  const purchaseAirtime =
    async (
      params: {
        network: string;
        phone: string;
        amount: number;
        idempotencyKey?: string;
      }
    ) => {
      try {
        const res =
          await api(
            '/services/airtime',
            {
              method: 'POST',
              body: JSON.stringify(
                params
              ),
            }
          );

        const data =
          await res.json() as {
            success?: boolean;
            pending?: boolean;
            requestId?: string;
            balance?: number;
            error?: string;
          };

        if (!res.ok) {
          return {
            success: false,
            error:
              data.error ??
              'Airtime purchase failed.',
          };
        }

        if (
          typeof data.balance ===
          'number'
        ) {
          setBalance(
            data.balance
          );
        }

        await refreshWallet();

        return {
          success:
            data.success !== false,
          pending:
            data.pending,
          requestId:
            data.requestId,
          balance:
            data.balance,
          error:
            data.error,
        };
      } catch {
        return {
          success: false,
          error:
            'Network error. Please try again.',
        };
      }
    };

  // ── Data ──────────────────────────────────────────────────────────────────

  const purchaseData =
    async (
      params: {
        network: string;
        phone: string;
        planCode: string;
        planName: string;
        planPrice: string;
        idempotencyKey?: string;
      }
    ) => {
      try {
        const res =
          await api(
            '/services/data',
            {
              method: 'POST',
              body: JSON.stringify(
                params
              ),
            }
          );

        const data =
          await res.json() as {
            success?: boolean;
            pending?: boolean;
            requestId?: string;
            planName?: string;
            balance?: number;
            error?: string;
            cashbackApplied?: boolean;
            cashbackAmount?: number;
          };

        if (!res.ok) {
          return {
            success: false,
            error:
              data.error ??
              'Data purchase failed.',
          };
        }

        if (
          typeof data.balance ===
          'number'
        ) {
          setBalance(
            data.balance
          );
        }

        await refreshWallet();
        await refreshCashbackWallet();

        return {
          success:
            data.success !== false,
          pending:
            data.pending,
          requestId:
            data.requestId,
          planName:
            data.planName,
          balance:
            data.balance,
          error:
            data.error,
          cashbackApplied:
            data.cashbackApplied,
          cashbackAmount:
            data.cashbackAmount,
        };
      } catch {
        return {
          success: false,
          error:
            'Network error. Please try again.',
        };
      }
    };

  // ── Wallet ────────────────────────────────────────────────────────────────

  const refreshWallet =
    async (): Promise<void> => {
      try {
        const res =
          await api(
            '/wallet'
          );

        if (!res.ok) {
          return;
        }

        const data =
          await res.json() as {
            balance: string;
            transactions: Record<
              string,
              unknown
            >[];
          };

        setBalance(
          parseFloat(
            data.balance ?? '0'
          )
        );

        setTransactions(
          (
            data.transactions ?? []
          ).map(
            transformTransaction
          )
        );
      } catch {
        // ignore
      }
    };

  const fundWallet =
    async (
      amount: number
    ): Promise<boolean> => {
      try {
        const res =
          await api(
            '/wallet/fund',
            {
              method: 'POST',
              body: JSON.stringify({
                amount,
              }),
            }
          );

        if (!res.ok) {
          return false;
        }

        await refreshWallet();

        return true;
      } catch {
        return false;
      }
    };

  // ── Cashback ──────────────────────────────────────────────────────────────

  const refreshCashbackWallet =
    async (): Promise<void> => {
      try {
        const res =
          await api(
            '/cashback/wallet'
          );

        if (!res.ok) {
          return;
        }

        const data =
          await res.json() as {
            balance: string;
            cashbackEnabled: boolean;
            minTransferAmount: number;
            transferMode: string;
          };

        setCashbackBalance(
          parseFloat(
            data.balance ?? '0'
          )
        );

        setCashbackSettings({
          enabled:
            data.cashbackEnabled,
          minTransferAmount:
            data.minTransferAmount,
          transferMode:
            data.transferMode as
              | 'manual'
              | 'auto',
        });
      } catch {
        // ignore
      }
    };

  const transferCashback =
    async (
      amount?: number
    ) => {
      try {
        const res =
          await api(
            '/cashback/transfer',
            {
              method: 'POST',
              body: JSON.stringify({
                amount,
              }),
            }
          );

        const data =
          await res.json() as {
            ok?: boolean;
            error?: string;
            transferred?: number;
            newMainBalance?: number;
            newCashbackBalance?: number;
          };

        if (!res.ok) {
          return {
            ok: false,
            error:
              data.error ??
              'Cashback transfer failed.',
          };
        }

        if (
          typeof data.newMainBalance ===
          'number'
        ) {
          setBalance(
            data.newMainBalance
          );
        }

        if (
          typeof data.newCashbackBalance ===
          'number'
        ) {
          setCashbackBalance(
            data.newCashbackBalance
          );
        }

        await refreshWallet();
        await refreshCashbackWallet();

        return {
          ok: true,
          transferred:
            data.transferred,
          newMainBalance:
            data.newMainBalance,
          newCashbackBalance:
            data.newCashbackBalance,
        };
      } catch {
        return {
          ok: false,
          error:
            'Network error. Please try again.',
        };
      }
    };

  // ── Context value ─────────────────────────────────────────────────────────

  const value: AppContextType = {
    isLoggedIn,
    isLoading,
    user,
    balance,
    cashbackBalance,
    balanceHidden,
    transactions,
    notifications,
    unreadCount,
    settings,
    activeTab,
    cashbackSettings,

    login,
    logout,
    register,

    accountExists,
    checkUsernameAvailable,
    changeUsername,

    verifyPin,
    changePin,

    requestPinReset,
    resetPin,

    toggleBalanceHidden,
    markAllNotificationsRead,
    updateSettings,

    addTransaction,
    purchaseAirtime,
    purchaseData,

    setActiveTab,
    fundWallet,
    refreshWallet,

    transferCashback,
    refreshCashbackWallet,

    markNotificationRead,
    deleteNotification,
    clearAllNotifications,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export const useApp = (): AppContextType => {
  const context =
    useContext(AppContext);

  if (!context) {
    throw new Error(
      'useApp must be used inside AppProvider'
    );
  }

  return context;
};
