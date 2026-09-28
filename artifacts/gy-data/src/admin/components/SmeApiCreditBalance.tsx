import React, {
  useCallback,
  useEffect,
  useState,
} from 'react';

import {
  Activity,
  RefreshCw,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';

import {
  useAdminContext,
} from '../context/AdminContext';

interface SmeCreditBalance {
  providerBalance: number;
  totalSmeApiBalance: number;
  totalUserWalletBalance: number;
  remainingCreditBalance: number;
  overAllocated: number;
}

function safeNumber(
  value: unknown,
): number {
  const result =
    Number(value ?? 0);

  return Number.isFinite(
    result,
  )
    ? result
    : 0;
}

function formatNaira(
  value: number,
): string {
  return `₦${safeNumber(
    value,
  ).toLocaleString(
    'en-NG',
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    },
  )}`;
}

export default function SmeApiCreditBalance() {
  const {
    isSuperAdmin,
  } =
    useAdminContext();

  const [
    data,
    setData,
  ] =
    useState<SmeCreditBalance | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] =
    useState<string | null>(
      null,
    );

  const load =
    useCallback(
      async () => {
        if (
          !isSuperAdmin
        ) {
          return;
        }

        try {
          const response =
            await fetch(
              '/api/admin/smeapi/credit-balance',
              {
                method: 'GET',
                credentials:
                  'include',
                headers: {
                  Accept:
                    'application/json',
                },
              },
            );

          const result =
            (await response
              .json()
              .catch(
                () => ({}),
              )) as {
              ok?: boolean;
              error?: string;
              providerBalance?: number;
              totalSmeApiBalance?: number;
              totalUserWalletBalance?: number;
              remainingCreditBalance?: number;
              overAllocated?: number;
            };

          if (
            !response.ok ||
            result.ok === false
          ) {
            throw new Error(
              result.error ??
                'Unable to load SME API credit balance.',
            );
          }

          setData({
            providerBalance:
              safeNumber(
                result.providerBalance,
              ),

            totalSmeApiBalance:
              safeNumber(
                result.totalSmeApiBalance ??
                  result.providerBalance,
              ),

            totalUserWalletBalance:
              safeNumber(
                result.totalUserWalletBalance,
              ),

            remainingCreditBalance:
              safeNumber(
                result.remainingCreditBalance,
              ),

            overAllocated:
              safeNumber(
                result.overAllocated,
              ),
          });

          setError(
            null,
          );
        } catch (
          err
        ) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load SME API balance.',
          );
        } finally {
          setLoading(false);
        }
      },
      [
        isSuperAdmin,
      ],
    );

  useEffect(() => {
    if (
      !isSuperAdmin
    ) {
      return;
    }

    void load();

    const interval =
      window.setInterval(
        () => {
          if (
            document.visibilityState ===
            'visible'
          ) {
            void load();
          }
        },
        3000,
      );

    const onFocus =
      () => {
        void load();
      };

    window.addEventListener(
      'focus',
      onFocus,
    );

    return () => {
      window.clearInterval(
        interval,
      );

      window.removeEventListener(
        'focus',
        onFocus,
      );
    };
  }, [
    isSuperAdmin,
    load,
  ]);

  if (
    !isSuperAdmin
  ) {
    return null;
  }

  return (
    <div className="mb-4 rounded-2xl border border-emerald-400/10 bg-[#0B1B35] p-3 shadow-lg">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {/* TOTAL SME API BALANCE */}

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/10">
              <Activity className="h-4 w-4 text-emerald-400" />
            </div>

            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                Total SME API Balance
              </p>

              <p className="text-[9px] text-white/20">
                Live provider balance
              </p>
            </div>
          </div>

          <p className="mt-2 text-lg font-bold text-white">
            {loading
              ? '—'
              : data
                ? formatNaira(
                    data.totalSmeApiBalance,
                  )
                : 'Unavailable'}
          </p>
        </div>

        {/* TOTAL USER WALLET BALANCE */}

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-400/10">
              <WalletCards className="h-4 w-4 text-blue-400" />
            </div>

            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/35">
                User Wallets
              </p>

              <p className="text-[9px] text-white/20">
                Total customer wallet balances
              </p>
            </div>
          </div>

          <p className="mt-2 text-lg font-bold text-white">
            {loading
              ? '—'
              : data
                ? formatNaira(
                    data.totalUserWalletBalance,
                  )
                : 'Unavailable'}
          </p>
        </div>

        {/* REMAINING CREDIT BALANCE */}

        <div
          className={`rounded-xl border p-3 ${
            data &&
            data.remainingCreditBalance <=
              0
              ? 'border-red-400/20 bg-red-400/[0.05]'
              : 'border-amber-400/15 bg-amber-400/[0.04]'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-400/10">
                <ShieldCheck className="h-4 w-4 text-amber-300" />
              </div>

              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  Remaining Credit Balance
                </p>

                <p className="text-[9px] text-white/20">
                  Maximum new wallet credit
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                void load()
              }
              disabled={
                loading
              }
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.05] text-white/40 hover:bg-white/[0.08] hover:text-white disabled:opacity-40"
              aria-label="Refresh SME credit balance"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  loading
                    ? 'animate-spin'
                    : ''
                }`}
              />
            </button>
          </div>

          <p
            className={`mt-2 text-lg font-bold ${
              data &&
              data.remainingCreditBalance <=
                0
                ? 'text-red-300'
                : 'text-amber-300'
            }`}
          >
            {loading
              ? '—'
              : data
                ? formatNaira(
                    data.remainingCreditBalance,
                  )
                : 'Unavailable'}
          </p>
        </div>
      </div>

      {data &&
        data.overAllocated > 0 && (
          <div className="mt-2 rounded-lg border border-red-400/15 bg-red-400/[0.05] px-3 py-2">
            <p className="text-[10px] font-medium text-red-300">
              Current customer wallet
              balances are above the
              live SME API balance by{' '}
              {formatNaira(
                data.overAllocated,
              )}
              . New Super Admin credits
              are blocked until the
              difference is reduced.
            </p>
          </div>
        )}

      {error && (
        <div className="mt-2 rounded-lg border border-red-400/10 bg-red-400/[0.04] px-3 py-2">
          <p className="text-[10px] text-red-300/80">
            {error}
          </p>
        </div>
      )}
    </div>
  );
}
