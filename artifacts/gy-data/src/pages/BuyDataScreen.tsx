// artifacts/gy-data/src/pages/BuyDataScreen.tsx

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { motion } from 'framer-motion';

import {
  AlertCircle,
  ArrowLeft,
  BookUser,
  Check,
  Gift,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react';

import { useLocation } from 'wouter';

import { toast } from 'sonner';

import { useAppContext } from '../context/AppContext';

import SuccessModal from '@/components/SuccessModal';

import type { ReceiptData } from '@/components/TransactionReceipt';

import {
  fetchDataPlans,
  type DataPlan,
} from '@/lib/api';

import {
  isValidNigerianNumber,
  normalizeNigerianNumber,
} from '@/components/PhoneInputWithContacts';

/* ============================================================================
 * NETWORKS
 * ========================================================================== */

const NETWORKS = [
  {
    id: 'mtn',
    name: 'MTN',
    type: 'mtn',
  },
  {
    id: 'airtel',
    name: 'Airtel',
    type: 'airtel',
  },
  {
    id: 'glo',
    name: 'Glo',
    type: 'glo',
  },
  {
    id: '9mobile',
    name: '9Mobile',
    type: '9mobile',
  },
] as const;

type Network =
  (typeof NETWORKS)[number];

type PlanTab =
  | 'SME'
  | 'SME2'
  | 'GIFTING'
  | 'CORPORATE';

const PLAN_TABS: PlanTab[] = [
  'SME',
  'SME2',
  'GIFTING',
  'CORPORATE',
];

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function normalize(
  value: unknown,
): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function numberValue(
  value: unknown,
): number {
  const parsed = Number(
    String(value ?? '')
      .replace(/[₦,]/g, '')
      .trim(),
  );

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function formatMoney(
  value: unknown,
): string {
  const amount =
    numberValue(value);

  return `₦${amount.toLocaleString(
    'en-NG',
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    },
  )}`;
}

/* ============================================================================
 * PLAN TEXT
 * ========================================================================== */

function getPlanText(
  plan: DataPlan,
): string {
  return normalize(
    [
      plan.DataPlanName,
      plan.DataPlanType,
    ].join(' '),
  );
}

/* ============================================================================
 * PLAN TAB
 * ========================================================================== */

function getPlanTab(
  plan: DataPlan,
): PlanTab {
  const text =
    getPlanText(plan);

  /*
   * SME2 MUST be checked before SME.
   * Otherwise "SME2" gets incorrectly classified as "SME".
   */

  if (
    text.includes('SME2') ||
    text.includes('SME 2')
  ) {
    return 'SME2';
  }

  if (
    text.includes('CORPORATE')
  ) {
    return 'CORPORATE';
  }

  if (
    text.includes('GIFT')
  ) {
    return 'GIFTING';
  }

  return 'SME';
}

/* ============================================================================
 * VALIDITY
 * ========================================================================== */

function getValidity(
  plan: DataPlan,
): string {
  const text =
    getPlanText(plan);

  const rules: Array<
    [RegExp, string]
  > = [
    [
      /\b30\s*DAYS?\b/,
      '30 Days',
    ],
    [
      /\b7\s*DAYS?\b/,
      'Weekly',
    ],
    [
      /\b4\s*WEEKS?\b/,
      'Monthly',
    ],
    [
      /\b24\s*HOURS?\b/,
      'Daily',
    ],
    [
      /\b1\s*DAY\b/,
      'Daily',
    ],
    [
      /\bDAILY\b/,
      'Daily',
    ],
    [
      /\bWEEKLY\b/,
      'Weekly',
    ],
    [
      /\bMONTHLY\b/,
      'Monthly',
    ],
    [
      /\bWEEKEND\b/,
      'Weekend',
    ],
    [
      /\bNIGHT(?:LY)?\b/,
      'Night',
    ],
  ];

  for (
    const [regex, label] of rules
  ) {
    if (regex.test(text)) {
      return label;
    }
  }

  const type =
    String(
      plan.DataPlanType ?? '',
    ).trim();

  return type || 'Data Bundle';
}

/* ============================================================================
 * CASHBACK
 * ========================================================================== */

function getCashback(
  plan: DataPlan,
): {
  amount: number;
  label: string;
} {
  if (
    !plan.cashback_enabled
  ) {
    return {
      amount: 0,
      label: '',
    };
  }

  const value =
    numberValue(
      plan.cashback_value,
    );

  const price =
    numberValue(plan.Price);

  if (
    value <= 0 ||
    price <= 0
  ) {
    return {
      amount: 0,
      label: '',
    };
  }

  const type =
    normalize(
      plan.cashback_type,
    );

  if (
    type === 'PERCENTAGE'
  ) {
    return {
      amount:
        Math.round(
          price *
            value *
            100,
        ) / 100,
      label: `${value}% Cash Back`,
    };
  }

  return {
    amount: value,
    label: `${formatMoney(
      value,
    )} Cash Back`,
  };
}

/* ============================================================================
 * NETWORK LOGOS
 * ========================================================================== */

function NetworkLogo({
  network,
  selected = false,
}: {
  network: Network;
  selected?: boolean;
}) {
  const className = `
    h-9
    w-9
    shrink-0
    rounded-full
    transition-transform
    ${selected ? 'scale-105' : ''}
  `;

  /* MTN */

  if (
    network.type === 'mtn'
  ) {
    return (
      <svg
        viewBox="0 0 64 64"
        className={className}
        aria-label="MTN logo"
      >
        <circle
          cx="32"
          cy="32"
          r="30"
          fill="#ffcc00"
        />

        <ellipse
          cx="32"
          cy="32"
          rx="21"
          ry="11"
          fill="none"
          stroke="#111827"
          strokeWidth="3"
        />

        <text
          x="32"
          y="36"
          textAnchor="middle"
          fontSize="10"
          fontWeight="900"
          fill="#111827"
        >
          MTN
        </text>
      </svg>
    );
  }

  /* Airtel */

  if (
    network.type === 'airtel'
  ) {
    return (
      <svg
        viewBox="0 0 64 64"
        className={className}
        aria-label="Airtel logo"
      >
        <circle
          cx="32"
          cy="32"
          r="30"
          fill="#e4002b"
        />

        <text
          x="32"
          y="35"
          textAnchor="middle"
          fontSize="9"
          fontWeight="900"
          fill="white"
        >
          airtel
        </text>

        <path
          d="M26 43c6-5 10-5 15-1"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  /* Glo */

  if (
    network.type === 'glo'
  ) {
    return (
      <svg
        viewBox="0 0 64 64"
        className={className}
        aria-label="Glo logo"
      >
        <circle
          cx="32"
          cy="32"
          r="30"
          fill="#0aa84f"
        />

        <text
          x="32"
          y="38"
          textAnchor="middle"
          fontSize="18"
          fontWeight="500"
          fill="white"
        >
          glo
        </text>
      </svg>
    );
  }

  /* 9Mobile */

  return (
    <svg
      viewBox="0 0 80 80"
      className="
        h-11
        w-11
        shrink-0
        transition-transform
      "
      aria-label="9Mobile logo"
    >
      {/* Soft logo background */}

      <circle
        cx="40"
        cy="40"
        r="39"
        fill="#f7f8f7"
      />

      {/* Main green 9Mobile mark */}

      <path
        d="
          M40 10
          C24 10 13 22 13 38
          C13 54 24 66 39 66
          C53 66 63 56 63 41
          C63 26 53 16 40 16
          C29 16 21 23 21 34
          C21 44 28 51 38 51
          C46 51 51 46 51 38
          C51 31 47 27 40 27
          C35 27 31 30 30 35
          L22 35
          C23 25 30 18 40 18
          C53 18 62 27 62 41
          C62 56 53 66 39 66
          C24 66 13 55 13 39
          C13 22 24 10 40 10
          Z
        "
        fill="#008c78"
      />

      {/* Yellow inner dot */}

      <circle
        cx="40"
        cy="27"
        r="5"
        fill="#d9df20"
      />

      {/* Yellow signal strokes */}

      <path
        d="M48 15c4 1 8 3 11 6"
        fill="none"
        stroke="#d9df20"
        strokeWidth="3"
        strokeLinecap="round"
      />

      <path
        d="M50 11c5 1 10 4 14 8"
        fill="none"
        stroke="#d9df20"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* mobile text */}

      <text
        x="40"
        y="74"
        textAnchor="middle"
        fontSize="10"
        fontWeight="500"
        fontFamily="Arial, sans-serif"
        fill="#008c78"
      >
        mobile
      </text>
    </svg>
  );
}

/* ============================================================================
 * IDEMPOTENCY KEY
 * ========================================================================== */

function createIdempotencyKey(): string {
  return [
    'GY-DATA',
    Date.now(),
    Math.random()
      .toString(36)
      .slice(2, 10),
  ].join('-');
}

/* ============================================================================
 * BUY DATA SCREEN
 * ========================================================================== */

export default function BuyDataScreen() {
  const [, setLocation] =
    useLocation();

  const {
    balance,
    refreshWallet,
    refreshCashbackWallet,
  } = useAppContext();

  const [
    network,
    setNetwork,
  ] = useState('mtn');

  const [
    phone,
    setPhone,
  ] = useState('');

  const [
    plans,
    setPlans,
  ] = useState<DataPlan[]>([]);

  const [
    tab,
    setTab,
  ] = useState<PlanTab>('SME');

  const [
    selectedPlan,
    setSelectedPlan,
  ] =
    useState<DataPlan | null>(
      null,
    );

  const [
    loading,
    setLoading,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState('');

  const [
    pinOpen,
    setPinOpen,
  ] = useState(false);

  const [
    pin,
    setPin,
  ] = useState('');

  const [
    purchasing,
    setPurchasing,
  ] = useState(false);

  const [
    receipt,
    setReceipt,
  ] =
    useState<ReceiptData | null>(
      null,
    );

  const requestId =
    useRef(0);

  const idempotencyKey =
    useRef<string | null>(
      null,
    );

  const selectedNetwork =
    NETWORKS.find(
      item =>
        item.id === network,
    ) ??
    NETWORKS[0];

  /* ==========================================================================
   * LOAD PLANS
   * ======================================================================== */

  const loadPlans =
    useCallback(
      async () => {
        const currentRequest =
          ++requestId.current;

        if (
          !network ||
          !isValidNigerianNumber(
            phone,
          )
        ) {
          setPlans([]);
          setSelectedPlan(
            null,
          );
          setError('');
          setLoading(false);
          return;
        }

        setLoading(true);
        setError('');

        try {
          const result =
            await fetchDataPlans(
              network,
              phone,
            );

          if (
            currentRequest !==
            requestId.current
          ) {
            return;
          }

          const safePlans =
            Array.isArray(result)
              ? result.filter(
                  Boolean,
                )
              : [];

          setPlans(
            safePlans,
          );

          setSelectedPlan(
            previous => {
              if (!previous) {
                return null;
              }

              return (
                safePlans.find(
                  item =>
                    String(
                      item.DataPlan,
                    ) ===
                    String(
                      previous.DataPlan,
                    ),
                ) ?? null
              );
            },
          );

          if (
            safePlans.length > 0 &&
            !safePlans.some(
              item =>
                getPlanTab(
                  item,
                ) === tab,
            )
          ) {
            setTab('SME');
          }
        } catch (
          loadError
        ) {
          if (
            currentRequest !==
            requestId.current
          ) {
            return;
          }

          setPlans([]);
          setSelectedPlan(
            null,
          );

          setError(
            loadError instanceof
              Error
              ? loadError.message
              : 'Unable to load data plans.',
          );
        } finally {
          if (
            currentRequest ===
            requestId.current
          ) {
            setLoading(false);
          }
        }
      },
      [
        network,
        phone,
        tab,
      ],
    );

  /* ==========================================================================
   * AUTOMATIC PLAN LOADING
   * ======================================================================== */

  useEffect(() => {
    if (
      !isValidNigerianNumber(
        phone,
      )
    ) {
      setPlans([]);
      setSelectedPlan(
        null,
      );
      setError('');
      setLoading(false);
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          void loadPlans();
        },
        300,
      );

    return () =>
      window.clearTimeout(
        timer,
      );
  }, [
    phone,
    network,
  ]);

  /* ==========================================================================
   * VISIBLE PLANS
   * ======================================================================== */

  const visiblePlans =
    useMemo(() => {
      return plans
        .filter(
          item =>
            getPlanTab(
              item,
            ) === tab,
        )
        .sort(
          (a, b) =>
            numberValue(
              a.Price,
            ) -
            numberValue(
              b.Price,
            ),
        );
    }, [
      plans,
      tab,
    ]);

  /* ==========================================================================
   * AVAILABLE TABS
   * ======================================================================== */

  const availableTabs =
    useMemo(() => {
      return PLAN_TABS.filter(
        item =>
          plans.some(
            plan =>
              getPlanTab(
                plan,
              ) === item,
          ),
      );
    }, [plans]);

  /* ==========================================================================
   * NETWORK CHANGE
   * ======================================================================== */

  const changeNetwork = (
    value: string,
  ) => {
    requestId.current += 1;

    setNetwork(value);

    setPlans([]);

    setSelectedPlan(
      null,
    );

    setError('');

    idempotencyKey.current =
      null;
  };

  /* ==========================================================================
   * PHONE CHANGE
   * ======================================================================== */

  const changePhone = (
    value: string,
  ) => {
    requestId.current += 1;

    setPhone(
      normalizeNigerianNumber(
        value,
      ),
    );

    setSelectedPlan(
      null,
    );

    setError('');

    idempotencyKey.current =
      null;
  };

  /* ==========================================================================
   * PREPARE PURCHASE
   * ======================================================================== */

  const preparePurchase =
    () => {
      if (
        !isValidNigerianNumber(
          phone,
        )
      ) {
        toast.error(
          'Enter a valid Nigerian phone number.',
        );
        return;
      }

      if (!selectedPlan) {
        toast.error(
          'Select a data plan.',
        );
        return;
      }

      const amount =
        numberValue(
          selectedPlan.Price,
        );

      if (amount <= 0) {
        toast.error(
          'This plan has an invalid price.',
        );
        return;
      }

      if (
        balance < amount
      ) {
        toast.error(
          'Insufficient wallet balance.',
        );
        return;
      }

      setPin('');

      setPinOpen(true);
    };

  /* ==========================================================================
   * PURCHASE
   * ======================================================================== */

  const purchase =
    async () => {
      if (
        !selectedPlan ||
        purchasing
      ) {
        return;
      }

      if (
        !/^\d{4}$/.test(
          pin,
        )
      ) {
        toast.error(
          'Purchase PIN must be exactly 4 digits.',
        );
        return;
      }

      const amount =
        numberValue(
          selectedPlan.Price,
        );

      const key =
        idempotencyKey.current ??
        createIdempotencyKey();

      idempotencyKey.current =
        key;

      setPurchasing(true);

      try {
        const response =
          await fetch(
            '/api/purchase/data-safe',
            {
              method: 'POST',

              credentials:
                'include',

              headers: {
                'Content-Type':
                  'application/json',

                Accept:
                  'application/json',

                'Idempotency-Key':
                  key,
              },

              body:
                JSON.stringify({
                  network:
                    selectedNetwork.id,

                  phone:
                    phone.trim(),

                  planCode:
                    String(
                      selectedPlan.DataPlan ??
                        '',
                    ).trim(),

                  planName:
                    String(
                      selectedPlan.DataPlanName ??
                        '',
                    ).trim(),

                  planPrice:
                    amount,

                  purchasePin:
                    pin,
                }),
            },
          );

        const result =
          (await response
            .json()
            .catch(
              () => null,
            )) as {
            success?: boolean;

            pending?: boolean;

            error?: string;

            amount?:
              | number
              | string;

            phone?: string;

            planName?: string;

            cashbackAmount?:
              | number
              | string;
          } | null;

        if (
          !response.ok ||
          result?.success !==
            true
        ) {
          toast.error(
            result?.error ??
              'Data purchase failed. Please try again.',
          );

          return;
        }

        setPinOpen(false);

        const cashbackAmount =
          numberValue(
            result.cashbackAmount,
          );

        setReceipt({
          type: 'data',

          provider:
            selectedNetwork.name,

          service: 'Data',

          description:
            result.planName ??
            selectedPlan.DataPlanName ??
            'Data Bundle',

          amount:
            numberValue(
              result.amount ??
                amount,
            ),

          date:
            new Date().toLocaleDateString(
              'en-NG',
            ),

          time:
            new Date().toLocaleTimeString(
              'en-NG',
              {
                hour: '2-digit',
                minute:
                  '2-digit',
              },
            ),

          status:
            result.pending
              ? 'pending'
              : 'success',

          phone:
            result.phone ??
            phone,

          paymentMethod:
            'Wallet',

          cashbackAmount:
            cashbackAmount > 0
              ? cashbackAmount
              : undefined,
        });

        idempotencyKey.current =
          null;

        await Promise.allSettled(
          [
            refreshWallet(),
            refreshCashbackWallet(),
          ],
        );
      } catch (
        purchaseError
      ) {
        toast.error(
          purchaseError instanceof
            Error
            ? purchaseError.message
            : 'Network error. Please try again.',
        );
      } finally {
        setPurchasing(false);
      }
    };

  /* ==========================================================================
   * FINISH
   * ======================================================================== */

  const finish =
    () => {
      setReceipt(null);

      setPinOpen(false);

      setPin('');

      setSelectedPlan(
        null,
      );

      idempotencyKey.current =
        null;
    };

  /* ==========================================================================
   * RENDER
   * ========================================================================== */

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-20 text-slate-900">
      <div className="mx-auto w-full max-w-2xl px-3 py-3 sm:px-4">

        {/* HEADER */}

        <header className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() =>
              setLocation('/')
            }
            className="flex h-9 w-9 items-center justify-center rounded-full text-slate-900 hover:bg-slate-100"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <h1 className="text-xl font-extrabold tracking-tight">
            Buy Data
          </h1>

          <div className="w-9" />
        </header>

        {/* NETWORKS */}

        <section className="mb-3 grid grid-cols-4 gap-2">
          {NETWORKS.map(
            item => {
              const active =
                item.id ===
                network;

              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() =>
                    changeNetwork(
                      item.id,
                    )
                  }
                  className={`
                    flex
                    min-w-0
                    flex-col
                    items-center
                    justify-center
                    rounded-2xl
                    border
                    bg-white
                    px-1
                    py-2.5
                    shadow-[0_1px_4px_rgba(15,23,42,0.05)]
                    transition
                    ${
                      active
                        ? 'border-slate-900 ring-1 ring-slate-900'
                        : 'border-slate-200'
                    }
                  `}
                >
                  <NetworkLogo
                    network={
                      item
                    }
                    selected={
                      active
                    }
                  />

                  <span className="mt-1.5 truncate text-[11px] font-bold">
                    {item.name}
                  </span>

                  {active && (
                    <span className="mt-0.5 text-[8px] font-semibold text-slate-500">
                      Selected
                    </span>
                  )}
                </button>
              );
            },
          )}
        </section>

        {/* PHONE NUMBER */}

        <section className="relative mb-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              Phone Number
            </span>

            <button
              type="button"
              className="rounded-full bg-[#d8b52b] px-3 py-1.5 text-[10px] font-bold text-slate-900"
            >
              Beneficiaries
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 px-2.5 py-2.5">
            <span className="text-[12px] font-bold text-slate-500">
              +234
            </span>

            <input
              value={phone}
              onChange={event =>
                changePhone(
                  event.target
                    .value,
                )
              }
              inputMode="numeric"
              type="tel"
              maxLength={11}
              placeholder="08012345678"
              className="min-w-0 flex-1 bg-transparent text-base font-bold outline-none placeholder:text-slate-300"
            />

            {phone && (
              <button
                type="button"
                onClick={() =>
                  changePhone(
                    '',
                  )
                }
                className="flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200"
                aria-label="Clear phone"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                void (async () => {
                  try {
                    const nav =
                      navigator as Navigator & {
                        contacts?: {
                          select: (
                            properties: string[],
                            options: {
                              multiple: boolean;
                            },
                          ) => Promise<
                            Array<{
                              tel?: string[];
                            }>
                          >;
                        };
                      };

                    if (
                      !nav.contacts
                    ) {
                      toast.error(
                        'Contacts are not supported on this device/browser.',
                      );

                      return;
                    }

                    const result =
                      await nav.contacts.select(
                        ['tel'],
                        {
                          multiple:
                            false,
                        },
                      );

                    const tel =
                      result?.[0]
                        ?.tel?.[0];

                    if (tel) {
                      changePhone(
                        tel,
                      );
                    }
                  } catch {
                    /*
                     * User cancelled contact picker.
                     */
                  }
                })();
              }}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white"
              aria-label="Choose contact"
            >
              <BookUser className="h-4 w-4" />
            </button>
          </div>

          {phone.length >=
            10 &&
            !isValidNigerianNumber(
              phone,
            ) && (
              <p className="mt-1.5 text-[10px] font-semibold text-amber-600">
                Enter a valid
                11-digit Nigerian
                mobile number.
              </p>
            )}
        </section>

        {/* PLAN TABS */}

        <section className="mb-3 rounded-2xl bg-white/60 px-0.5 py-0.5">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {PLAN_TABS.map(
              item => {
                const active =
                  tab === item;

                const exists =
                  availableTabs.includes(
                    item,
                  );

                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      setTab(item)
                    }
                    className={`
                      whitespace-nowrap
                      rounded-full
                      px-4
                      py-2
                      text-[11px]
                      font-bold
                      transition
                      ${
                        active
                          ? 'bg-[#d8b52b] text-slate-900 shadow-sm'
                          : 'bg-slate-100 text-slate-400'
                      }
                      ${
                        !exists &&
                        plans.length > 0
                          ? 'opacity-50'
                          : ''
                      }
                    `}
                  >
                    {item ===
                    'GIFTING'
                      ? 'Gifting'
                      : item ===
                        'CORPORATE'
                      ? 'Corporate'
                      : item}
                  </button>
                );
              },
            )}
          </div>
        </section>

        {/* PLAN COUNT */}

        <div className="mb-2 flex items-center justify-between px-0.5">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
              {visiblePlans.length}{' '}
              Plans Available
            </p>

            <p className="text-[10px] text-slate-400">
              {
                selectedNetwork.name
              }{' '}
              · {tab}
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              void loadPlans()
            }
            disabled={
              loading ||
              !isValidNigerianNumber(
                phone,
              )
            }
            className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 disabled:opacity-40"
            aria-label="Refresh plans"
          >
            <RefreshCw
              className={`
                h-3.5
                w-3.5
                ${
                  loading
                    ? 'animate-spin'
                    : ''
                }
              `}
            />
          </button>
        </div>

        {/* LOADING */}

        {loading ? (
          <div className="grid grid-cols-3 gap-2">
            {Array.from({
              length: 6,
            }).map(
              (_, index) => (
                <div
                  key={index}
                  className="h-36 animate-pulse rounded-2xl border border-slate-100 bg-white"
                />
              ),
            )}
          </div>
        ) : error ? (
          /* ERROR */

          <div className="rounded-2xl border border-red-100 bg-white p-4 text-center">
            <AlertCircle className="mx-auto h-5 w-5 text-red-500" />

            <p className="mt-1 text-xs font-bold text-red-600">
              Unable to load
              plans
            </p>

            <p className="mt-1 text-[10px] text-slate-500">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                void loadPlans()
              }
              className="mt-3 rounded-lg bg-slate-900 px-3 py-1.5 text-[10px] font-bold text-white"
            >
              Try Again
            </button>
          </div>
        ) : !isValidNigerianNumber(
            phone,
          ) ? (
          /* PHONE NOT READY */

          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-400">
            Enter a valid
            phone number to view
            available plans.
          </div>
        ) : visiblePlans.length ===
          0 ? (
          /* EMPTY */

          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-xs text-slate-400">
            No {tab} plans are
            available for{' '}
            {
              selectedNetwork.name
            }.
          </div>
        ) : (
          /* PLANS */

          <div className="grid grid-cols-3 gap-2">
            {visiblePlans.map(
              item => {
                const active =
                  selectedPlan?.DataPlan ===
                  item.DataPlan;

                const cb =
                  getCashback(
                    item,
                  );

                const validity =
                  getValidity(
                    item,
                  );

                return (
                  <motion.button
                    key={`${item.DataPlan}-${item.Price}`}
                    type="button"
                    whileTap={{
                      scale: 0.98,
                    }}
                    onClick={() =>
                      setSelectedPlan(
                        item,
                      )
                    }
                    className={`
                      relative
                      flex
                      min-h-[142px]
                      flex-col
                      rounded-2xl
                      border
                      bg-white
                      p-2.5
                      text-left
                      shadow-[0_2px_7px_rgba(15,23,42,0.06)]
                      transition
                      ${
                        active
                          ? 'border-slate-900 ring-1 ring-slate-900'
                          : 'border-slate-200'
                      }
                    `}
                  >
                    {active && (
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    )}

                    <div className="pr-5">
                      <p className="truncate text-[19px] font-black leading-6 text-slate-900">
                        {item.DataPlanName ||
                          'Data'}
                      </p>

                      <p className="mt-0.5 truncate text-[9px] font-medium text-slate-400">
                        {tab} |{' '}
                        {validity}
                      </p>
                    </div>

                    <p className="mt-2 text-[15px] font-black text-slate-900">
                      {formatMoney(
                        item.Price,
                      )}
                    </p>

                    <div className="mt-auto pt-2">
                      {cb.amount >
                      0 ? (
                        <span className="flex min-h-7 items-center justify-center gap-1 rounded-full bg-slate-900 px-1.5 py-1 text-center text-[8px] font-bold leading-3 text-[#d8b52b]">
                          <Gift className="h-3 w-3 shrink-0" />

                          {cb.label}
                        </span>
                      ) : (
                        <span className="block rounded-full bg-slate-100 px-1.5 py-1 text-center text-[8px] font-bold text-slate-400">
                          {validity}
                        </span>
                      )}
                    </div>
                  </motion.button>
                );
              },
            )}
          </div>
        )}

        {/* SELECTED PLAN / BUY BAR */}

        {selectedPlan && (
          <div className="sticky bottom-2 z-20 mt-3 rounded-2xl border border-slate-200 bg-white/95 p-2.5 shadow-xl backdrop-blur">
            <div className="flex items-center gap-2">
              <NetworkLogo
                network={
                  selectedNetwork
                }
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold text-slate-900">
                  {
                    selectedPlan.DataPlanName
                  }
                </p>

                <p className="text-[9px] text-slate-400">
                  {
                    getValidity(
                      selectedPlan,
                    )
                  }{' '}
                  · {phone}
                </p>
              </div>

              <p className="text-sm font-black">
                {formatMoney(
                  selectedPlan.Price,
                )}
              </p>

              <button
                type="button"
                onClick={
                  preparePurchase
                }
                disabled={
                  purchasing
                }
                className="rounded-xl bg-slate-900 px-3.5 py-2.5 text-[10px] font-bold text-white disabled:opacity-50"
              >
                Buy
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PURCHASE PIN */}

      {pinOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#c7a91f]" />

              <div>
                <p className="text-base font-black">
                  Confirm Purchase
                </p>

                <p className="text-[10px] text-slate-400">
                  Enter your
                  4-digit purchase
                  PIN.
                </p>
              </div>
            </div>

            <div className="mb-4 rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-xs font-bold">
                {
                  selectedPlan?.DataPlanName
                }
              </p>

              <p className="mt-1 text-lg font-black">
                {formatMoney(
                  selectedPlan?.Price,
                )}
              </p>

              <p className="text-[10px] text-slate-400">
                {
                  selectedNetwork.name
                }{' '}
                · {phone}
              </p>
            </div>

            <input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={event =>
                setPin(
                  event.target.value
                    .replace(
                      /\D/g,
                      '',
                    )
                    .slice(
                      0,
                      4,
                    ),
                )
              }
              onKeyDown={event => {
                if (
                  event.key ===
                  'Enter'
                ) {
                  void purchase();
                }
              }}
              className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 text-center text-2xl font-black tracking-[0.7em] outline-none focus:border-slate-900"
              placeholder="••••"
            />

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPinOpen(
                    false,
                  );

                  setPin('');
                }}
                disabled={
                  purchasing
                }
                className="rounded-xl border border-slate-200 py-3 text-xs font-bold"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={() =>
                  void purchase()
                }
                disabled={
                  purchasing ||
                  pin.length !==
                    4
                }
                className="rounded-xl bg-slate-900 py-3 text-xs font-bold text-white disabled:opacity-40"
              >
                {purchasing
                  ? 'Processing…'
                  : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS RECEIPT */}

      <SuccessModal
        open={Boolean(
          receipt,
        )}
        onOpenChange={open => {
          if (!open) {
            finish();
          }
        }}
        data={receipt}
        onDone={finish}
      />
    </div>
  );
}
