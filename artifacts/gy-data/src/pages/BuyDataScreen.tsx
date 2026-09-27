import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  motion,
} from 'framer-motion';

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

import {
  useLocation,
} from 'wouter';

import {
  toast,
} from 'sonner';

import {
  useAppContext,
} from '../context/AppContext';

import SuccessModal from '@/components/SuccessModal';

import type {
  ReceiptData,
} from '@/components/TransactionReceipt';

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
    name: '9mobile',
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

type ValidityFilter =
  | 'ALL'
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | '30 DAYS';

const VALIDITY_FILTERS:
  ValidityFilter[] = [
    'ALL',
    'DAILY',
    'WEEKLY',
    'MONTHLY',
    '30 DAYS',
  ];

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function normalize(
  value: unknown,
): string {
  return String(
    value ?? '',
  )
    .trim()
    .toUpperCase()
    .replace(
      /[_-]+/g,
      ' ',
    )
    .replace(
      /\s+/g,
      ' ',
    );
}

function numberValue(
  value: unknown,
): number {
  const parsed =
    Number(
      String(
        value ?? '',
      )
        .replace(
          /[₦,]/g,
          '',
        )
        .trim(),
    );

  return Number.isFinite(
    parsed,
  )
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
      minimumFractionDigits:
        0,

      maximumFractionDigits:
        2,
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
 * PLAN CATEGORY
 * ========================================================================== */

function getPlanTab(
  plan: DataPlan,
): PlanTab {
  const text =
    getPlanText(
      plan,
    );

  /*
   * SME2 must always be checked before SME.
   */
  if (
    text.includes('SME2') ||
    text.includes('SME 2')
  ) {
    return 'SME2';
  }

  if (
    text.includes(
      'CORPORATE',
    )
  ) {
    return 'CORPORATE';
  }

  if (
    text.includes(
      'GIFTING',
    ) ||
    text.includes(
      'GIFT',
    )
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
): ValidityFilter | string {
  const text =
    getPlanText(
      plan,
    );

  /*
   * Exact durations first.
   */

  if (
    /\b30\s*DAYS?\b/.test(
      text,
    )
  ) {
    return '30 DAYS';
  }

  if (
    /\b4\s*WEEKS?\b/.test(
      text,
    )
  ) {
    return 'MONTHLY';
  }

  if (
    /\bMONTHLY\b/.test(
      text,
    ) ||
    /\bMONTH\b/.test(
      text,
    )
  ) {
    return 'MONTHLY';
  }

  if (
    /\b7\s*DAYS?\b/.test(
      text,
    ) ||
    /\bWEEKLY\b/.test(
      text,
    ) ||
    /\bWEEK\b/.test(
      text,
    )
  ) {
    return 'WEEKLY';
  }

  if (
    /\b24\s*HOURS?\b/.test(
      text,
    ) ||
    /\b1\s*DAY\b/.test(
      text,
    ) ||
    /\bDAILY\b/.test(
      text,
    ) ||
    /\bDAY\b/.test(
      text,
    )
  ) {
    return 'DAILY';
  }

  if (
    /\bWEEKEND\b/.test(
      text,
    )
  ) {
    return 'WEEKLY';
  }

  if (
    /\bNIGHT(?:LY)?\b/.test(
      text,
    )
  ) {
    return 'NIGHT';
  }

  /*
   * Provider DataPlanType can still contain a custom validity.
   */
  const providerType =
    String(
      plan.DataPlanType ??
        '',
    ).trim();

  if (
    providerType
  ) {
    return providerType;
  }

  return 'Validity not set';
}

function validityMatches(
  plan: DataPlan,
  filter: ValidityFilter,
): boolean {
  if (
    filter === 'ALL'
  ) {
    return true;
  }

  const validity =
    normalize(
      getValidity(
        plan,
      ),
    );

  if (
    filter === '30 DAYS'
  ) {
    return (
      validity.includes(
        '30 DAYS',
      ) ||
      validity.includes(
        '30 DAY',
      )
    );
  }

  return validity.includes(
    filter,
  );
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
    numberValue(
      plan.Price,
    );

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
    type ===
    'PERCENTAGE'
  ) {
    const amount =
      Math.round(
        price *
          value /
          100 *
          100,
      ) / 100;

    return {
      amount,
      label:
        `${value}% Cash Back`,
    };
  }

  return {
    amount: value,
    label:
      `${formatMoney(
        value,
      )} Cash Back`,
  };
}

/* ============================================================================
 * NETWORK LOGOS
 *
 * Designed to visually follow the reference screenshot:
 * - circular provider logo
 * - larger logo area
 * - Glo green circle
 * - 9mobile pale circle with green 9 and yellow detail
 * ========================================================================== */

function NetworkLogo({
  network,
  selected = false,
}: {
  network: Network;
  selected?: boolean;
}) {
  const sizeClass =
    selected
      ? 'h-[58px] w-[58px]'
      : 'h-[56px] w-[56px]';

  /* --------------------------------------------------------------------------
   * MTN
   * ------------------------------------------------------------------------ */

  if (
    network.type ===
    'mtn'
  ) {
    return (
      <svg
        viewBox="0 0 80 80"
        className={`${sizeClass} shrink-0`}
        aria-label="MTN logo"
      >
        <circle
          cx="40"
          cy="40"
          r="38"
          fill="#FFCC00"
        />

        <ellipse
          cx="40"
          cy="40"
          rx="27"
          ry="15"
          fill="none"
          stroke="#111827"
          strokeWidth="3.5"
        />

        <text
          x="40"
          y="45"
          textAnchor="middle"
          fontSize="13"
          fontWeight="900"
          fill="#111827"
          fontFamily="Arial, sans-serif"
        >
          MTN
        </text>
      </svg>
    );
  }

  /* --------------------------------------------------------------------------
   * AIRTEL
   * ------------------------------------------------------------------------ */

  if (
    network.type ===
    'airtel'
  ) {
    return (
      <svg
        viewBox="0 0 80 80"
        className={`${sizeClass} shrink-0`}
        aria-label="Airtel logo"
      >
        <circle
          cx="40"
          cy="40"
          r="38"
          fill="#E4002B"
        />

        <text
          x="40"
          y="43"
          textAnchor="middle"
          fontSize="13"
          fontWeight="800"
          fill="white"
          fontFamily="Arial, sans-serif"
        >
          airtel
        </text>

        <path
          d="M31 55c7-6 13-6 20-1"
          fill="none"
          stroke="white"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
    );
  }

  /* --------------------------------------------------------------------------
   * GLO
   * ------------------------------------------------------------------------ */

  if (
    network.type ===
    'glo'
  ) {
    return (
      <svg
        viewBox="0 0 80 80"
        className={`${sizeClass} shrink-0`}
        aria-label="Glo logo"
      >
        <circle
          cx="40"
          cy="40"
          r="38"
          fill="#12A83B"
        />

        <text
          x="40"
          y="47"
          textAnchor="middle"
          fontSize="27"
          fontWeight="500"
          fill="white"
          fontFamily="Arial, sans-serif"
          letterSpacing="-1"
        >
          glo
        </text>
      </svg>
    );
  }

  /* --------------------------------------------------------------------------
   * 9MOBILE
   * ------------------------------------------------------------------------ */

  return (
    <svg
      viewBox="0 0 80 80"
      className={`${sizeClass} shrink-0`}
      aria-label="9mobile logo"
    >
      <circle
        cx="40"
        cy="40"
        r="38"
        fill="#F0F3F1"
      />

      <path
        d="
          M25 45
          C23 31 31 20 43 20
          C54 20 61 28 61 40
          C61 53 53 61 42 61
          C32 61 26 55 23 48
          L31 48
          C33 52 36 54 42 54
          C48 54 52 49 52 41
          C52 33 48 28 42 28
          C36 28 32 32 32 38
          C32 42 35 45 40 45
          C44 45 47 42 48 38
          L54 41
          C52 49 47 53 40 53
          C32 53 26 50 25 45
          Z
        "
        fill="#008C45"
      />

      <circle
        cx="45"
        cy="29"
        r="4"
        fill="#D7B82A"
      />
    </svg>
  );
}

/* ============================================================================
 * IDEMPOTENCY
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
  } =
    useAppContext();

  const [
    network,
    setNetwork,
  ] =
    useState('mtn');

  const [
    phone,
    setPhone,
  ] =
    useState('');

  const [
    plans,
    setPlans,
  ] =
    useState<DataPlan[]>(
      [],
    );

  const [
    tab,
    setTab,
  ] =
    useState<PlanTab>(
      'SME',
    );

  const [
    validityFilter,
    setValidityFilter,
  ] =
    useState<ValidityFilter>(
      'ALL',
    );

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
  ] =
    useState(false);

  const [
    error,
    setError,
  ] =
    useState('');

  const [
    pinOpen,
    setPinOpen,
  ] =
    useState(false);

  const [
    pin,
    setPin,
  ] =
    useState('');

  const [
    purchasing,
    setPurchasing,
  ] =
    useState(false);

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
        item.id ===
        network,
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
            Array.isArray(
              result,
            )
              ? result.filter(
                  Boolean,
                )
              : [];

          setPlans(
            safePlans,
          );

          setSelectedPlan(
            previous => {
              if (
                !previous
              ) {
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
                ) ??
                null
              );
            },
          );

          const categories =
            safePlans.map(
              item =>
                getPlanTab(
                  item,
                ),
            );

          if (
            safePlans.length >
              0 &&
            !categories.includes(
              tab,
            )
          ) {
            setTab(
              categories.includes(
                'SME',
              )
                ? 'SME'
                : categories[0],
            );
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
   * AUTOMATIC LOADING
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
   * RESET VALIDITY FILTER WHEN PLAN TAB CHANGES
   * ======================================================================== */

  useEffect(() => {
    setValidityFilter(
      'ALL',
    );
  }, [tab]);

  /* ==========================================================================
   * AVAILABLE PLAN TABS
   * ======================================================================== */

  const availableTabs =
    useMemo(
      () =>
        PLAN_TABS.filter(
          item =>
            plans.some(
              plan =>
                getPlanTab(
                  plan,
                ) === item,
            ),
        ),
      [plans],
    );

  /* ==========================================================================
   * TAB PLANS
   * ======================================================================== */

  const tabPlans =
    useMemo(
      () =>
        plans
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
          ),
      [plans, tab],
    );

  /* ==========================================================================
   * AVAILABLE VALIDITIES
   * ======================================================================== */

  const availableValidities =
    useMemo(() => {
      const result =
        new Set<string>();

      for (
        const plan of
        tabPlans
      ) {
        result.add(
          normalize(
            getValidity(
              plan,
            ),
          ),
        );
      }

      return result;
    }, [tabPlans]);

  /* ==========================================================================
   * VISIBLE PLANS
   * ======================================================================== */

  const visiblePlans =
    useMemo(
      () =>
        tabPlans.filter(
          plan =>
            validityMatches(
              plan,
              validityFilter,
            ),
        ),
      [
        tabPlans,
        validityFilter,
      ],
    );

  /* ==========================================================================
   * NETWORK CHANGE
   * ======================================================================== */

  function changeNetwork(
    value: string,
  ) {
    requestId.current +=
      1;

    setNetwork(
      value,
    );

    setPlans([]);

    setSelectedPlan(
      null,
    );

    setValidityFilter(
      'ALL',
    );

    setError('');

    idempotencyKey.current =
      null;
  }

  /* ==========================================================================
   * PHONE CHANGE
   * ======================================================================== */

  function changePhone(
    value: string,
  ) {
    requestId.current +=
      1;

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
  }

  /* ==========================================================================
   * CONTACT PICKER
   * ======================================================================== */

  async function chooseContact() {
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
       * User cancelled the contact picker.
       */
    }
  }

  /* ==========================================================================
   * PREPARE PURCHASE
   * ======================================================================== */

  function preparePurchase() {
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

    if (
      !selectedPlan
    ) {
      toast.error(
        'Select a data plan.',
      );

      return;
    }

    const amount =
      numberValue(
        selectedPlan.Price,
      );

    if (
      amount <= 0
    ) {
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

    setPinOpen(
      true,
    );
  }

  /* ==========================================================================
   * PURCHASE
   * ======================================================================== */

  async function purchase() {
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

    setPurchasing(
      true,
    );

    try {
      const response =
        await fetch(
          '/api/purchase/data-safe',
          {
            method:
              'POST',

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

      setPinOpen(
        false,
      );

      const cashbackAmount =
        numberValue(
          result.cashbackAmount,
        );

      setReceipt({
        type:
          'data',

        provider:
          selectedNetwork.name,

        service:
          'Data',

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
              hour:
                '2-digit',

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
          cashbackAmount >
          0
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
      setPurchasing(
        false,
      );
    }
  }

  /* ==========================================================================
   * FINISH
   * ======================================================================== */

  function finish() {
    setReceipt(
      null,
    );

    setPinOpen(
      false,
    );

    setPin('');

    setSelectedPlan(
      null,
    );

    idempotencyKey.current =
      null;
  }

  /* ==========================================================================
   * RENDER
   * ======================================================================== */

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 text-slate-900">
      <div className="mx-auto w-full max-w-2xl px-3 py-3 sm:px-4">

        {/* ==================================================================
            HEADER
        ================================================================== */}

        <header className="mb-4 flex items-center justify-between">
          <button
            type="button"
            onClick={() =>
              setLocation('/')
            }
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-900 transition hover:bg-slate-100"
            aria-label="Back"
          >
            <ArrowLeft className="h-6 w-6" />
          </button>

          <h1 className="text-[22px] font-extrabold tracking-tight">
            Buy Data
          </h1>

          <div className="w-10" />
        </header>

        {/* ==================================================================
            NETWORKS
        ================================================================== */}

        <section className="mb-4 grid grid-cols-4 gap-2.5">
          {NETWORKS.map(
            item => {
              const active =
                item.id ===
                network;

              return (
                <button
                  key={
                    item.id
                  }
                  type="button"
                  onClick={() =>
                    changeNetwork(
                      item.id,
                    )
                  }
                  className={`
                    flex
                    min-w-0
                    min-h-[128px]
                    flex-col
                    items-center
                    justify-center
                    rounded-[24px]
                    border
                    bg-white
                    px-1
                    py-3
                    shadow-[0_2px_8px_rgba(15,23,42,0.05)]
                    transition
                    ${
                      active
                        ? 'border-[#10243F] ring-1 ring-[#10243F]'
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

                  <span className="mt-2 text-[13px] font-semibold text-slate-700">
                    {
                      item.name
                    }
                  </span>
                </button>
              );
            },
          )}
        </section>

        {/* ==================================================================
            PHONE NUMBER
        ================================================================== */}

        <section className="relative mb-4 rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_2px_8px_rgba(15,23,42,0.05)]">
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Phone Number
            </span>

            <button
              type="button"
              className="rounded-full bg-[#D8B52B] px-4 py-2 text-[12px] font-bold text-slate-900"
            >
              Beneficiaries
            </button>
          </div>

          <div className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
            <span className="text-[13px] font-bold text-slate-500">
              +234
            </span>

            <input
              value={
                phone
              }
              onChange={event =>
                changePhone(
                  event.target
                    .value,
                )
              }
              inputMode="numeric"
              type="tel"
              maxLength={
                11
              }
              placeholder="08012345678"
              className="min-w-0 flex-1 bg-transparent text-[20px] font-bold tracking-wide text-slate-800 outline-none placeholder:text-slate-300"
            />

            {phone && (
              <button
                type="button"
                onClick={() =>
                  changePhone(
                    '',
                  )
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-200"
                aria-label="Clear phone"
              >
                <X className="h-5 w-5" />
              </button>
            )}

            {/* LARGE CONTACT BUTTON */}

            <button
              type="button"
              onClick={() =>
                void chooseContact()
              }
              className="flex h-[58px] w-[58px] shrink-0 items-center justify-center rounded-[18px] bg-[#10243F] text-white shadow-[0_4px_10px_rgba(15,35,60,0.18)] transition active:scale-95"
              aria-label="Choose contact"
            >
              <BookUser className="h-8 w-8 stroke-[1.8]" />
            </button>
          </div>

          {phone.length >=
            10 &&
            !isValidNigerianNumber(
              phone,
            ) && (
              <p className="mt-2 text-[11px] font-semibold text-amber-600">
                Enter a valid
                11-digit Nigerian
                mobile number.
              </p>
            )}
        </section>

        {/* ==================================================================
            PLAN CATEGORY TABS
        ================================================================== */}

        <section className="mb-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {PLAN_TABS.map(
              item => {
                const active =
                  tab ===
                  item;

                const exists =
                  availableTabs.includes(
                    item,
                  );

                return (
                  <button
                    key={
                      item
                    }
                    type="button"
                    onClick={() =>
                      setTab(
                        item,
                      )
                    }
                    className={`
                      whitespace-nowrap
                      rounded-full
                      px-5
                      py-2.5
                      text-[12px]
                      font-bold
                      transition
                      ${
                        active
                          ? 'bg-[#D8B52B] text-slate-900 shadow-sm'
                          : 'bg-slate-100 text-slate-400'
                      }
                      ${
                        !exists &&
                        plans.length >
                          0
                          ? 'opacity-45'
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

        {/* ==================================================================
            VALIDITY FILTER
        ================================================================== */}

        <section className="mb-4">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {VALIDITY_FILTERS.map(
              item => {
                const active =
                  validityFilter ===
                  item;

                const exists =
                  item ===
                  'ALL'
                    ? true
                    : Array.from(
                        availableValidities,
                      ).some(
                        value =>
                          value.includes(
                            item,
                          ),
                      );

                return (
                  <button
                    key={
                      item
                    }
                    type="button"
                    onClick={() =>
                      setValidityFilter(
                        item,
                      )
                    }
                    className={`
                      whitespace-nowrap
                      rounded-full
                      border
                      px-3.5
                      py-1.5
                      text-[10px]
                      font-bold
                      transition
                      ${
                        active
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white text-slate-500'
                      }
                      ${
                        !exists
                          ? 'opacity-35'
                          : ''
                      }
                    `}
                  >
                    {item ===
                    '30 DAYS'
                      ? '30 Days'
                      : item
                        .charAt(
                          0,
                        )
                        .toUpperCase() +
                        item
                          .slice(
                            1,
                          )
                          .toLowerCase()}
                  </button>
                );
              },
            )}
          </div>
        </section>

        {/* ==================================================================
            PLAN COUNT
        ================================================================== */}

        <div className="mb-3 flex items-center justify-between px-0.5">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wide text-slate-400">
              {
                visiblePlans.length
              }{' '}
              Plans Available
            </p>

            <p className="mt-0.5 text-[10px] text-slate-400">
              {
                selectedNetwork.name
              }{' '}
              ·{' '}
              {tab}
              {validityFilter !==
                'ALL' &&
                ` · ${validityFilter}`}
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
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm disabled:opacity-40"
            aria-label="Refresh plans"
          >
            <RefreshCw
              className={`
                h-4
                w-4
                ${
                  loading
                    ? 'animate-spin'
                    : ''
                }
              `}
            />
          </button>
        </div>

        {/* ==================================================================
            LOADING
        ================================================================== */}

        {loading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Array.from({
              length: 6,
            }).map(
              (
                _,
                index,
              ) => (
                <div
                  key={
                    index
                  }
                  className="h-[190px] animate-pulse rounded-[22px] border border-slate-100 bg-white"
                />
              ),
            )}
          </div>
        ) : error ? (
          /* ==================================================================
             ERROR
          ================================================================== */

          <div className="rounded-[22px] border border-red-100 bg-white p-6 text-center">
            <AlertCircle className="mx-auto h-6 w-6 text-red-500" />

            <p className="mt-2 text-sm font-bold text-red-600">
              Unable to load
              plans
            </p>

            <p className="mt-1 text-[11px] text-slate-500">
              {error}
            </p>

            <button
              type="button"
              onClick={() =>
                void loadPlans()
              }
              className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white"
            >
              Try Again
            </button>
          </div>
        ) : !isValidNigerianNumber(
            phone,
          ) ? (
          /* ==================================================================
             PHONE NOT READY
          ================================================================== */

          <div className="rounded-[22px] border border-slate-200 bg-white p-7 text-center text-xs text-slate-400">
            Enter a valid
            phone number to view
            available plans.
          </div>
        ) : visiblePlans.length ===
          0 ? (
          /* ==================================================================
             EMPTY
          ================================================================== */

          <div className="rounded-[22px] border border-slate-200 bg-white p-7 text-center">
            <p className="text-sm font-bold text-slate-500">
              No plans available
            </p>

            <p className="mt-1 text-[11px] text-slate-400">
              No{' '}
              {tab}{' '}
              {validityFilter !==
                'ALL' &&
                `${validityFilter.toLowerCase()} `}
              plans are
              currently configured
              for{' '}
              {
                selectedNetwork.name
              }.
            </p>
          </div>
        ) : (
          /* ==================================================================
             PLANS
          ================================================================== */

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
                      scale:
                        0.98,
                    }}
                    onClick={() =>
                      setSelectedPlan(
                        item,
                      )
                    }
                    className={`
                      relative
                      flex
                      min-h-[188px]
                      flex-col
                      rounded-[22px]
                      border
                      bg-white
                      p-3
                      text-left
                      shadow-[0_3px_10px_rgba(15,23,42,0.07)]
                      transition
                      ${
                        active
                          ? 'border-slate-900 ring-1 ring-slate-900'
                          : 'border-slate-200'
                      }
                    `}
                  >
                    {active && (
                      <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}

                    {/* PLAN NAME */}

                    <div className="pr-7">
                      <p className="truncate text-[20px] font-black leading-6 text-slate-900">
                        {item.DataPlanName ||
                          'Data'}
                      </p>

                      {/* CATEGORY + VALIDITY */}

                      <p className="mt-1 truncate text-[10px] font-medium text-slate-400">
                        {tab}
                        {' '}
                        |
                        {' '}
                        {validity}
                      </p>
                    </div>

                    {/* PRICE */}

                    <p className="mt-4 text-[17px] font-black text-slate-900">
                      {formatMoney(
                        item.Price,
                      )}
                    </p>

                    {/* CASHBACK / VALIDITY */}

                    <div className="mt-auto pt-3">
                      {cb.amount >
                      0 ? (
                        <span className="flex min-h-9 items-center justify-center gap-1 rounded-full bg-[#10243F] px-2 py-1.5 text-center text-[9px] font-bold leading-3 text-[#D8B52B]">
                          <Gift className="h-3.5 w-3.5 shrink-0" />

                          {cb.label}
                        </span>
                      ) : (
                        <span className="block rounded-full bg-slate-100 px-2 py-1.5 text-center text-[9px] font-bold text-slate-500">
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

        {/* ==================================================================
            SELECTED PLAN / BUY BAR
        ================================================================== */}

        {selectedPlan && (
          <div className="sticky bottom-2 z-20 mt-4 rounded-[22px] border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur">
            <div className="flex items-center gap-3">
              <NetworkLogo
                network={
                  selectedNetwork
                }
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-bold text-slate-900">
                  {
                    selectedPlan.DataPlanName
                  }
                </p>

                <p className="truncate text-[10px] text-slate-400">
                  {
                    getValidity(
                      selectedPlan,
                    )
                  }
                  {' '}
                  ·{' '}
                  {phone}
                </p>
              </div>

              <p className="text-sm font-black text-slate-900">
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
                className="rounded-xl bg-slate-900 px-4 py-3 text-[11px] font-bold text-white disabled:opacity-50"
              >
                Buy
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ======================================================================
          PURCHASE PIN
      ======================================================================== */}

      {pinOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-[28px] bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#C7A91F]" />

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

            <div className="mb-4 rounded-2xl bg-slate-50 p-4 text-center">
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
                }
                {' '}
                ·{' '}
                {phone}
              </p>
            </div>

            <input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={
                4
              }
              value={
                pin
              }
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

      {/* ======================================================================
          SUCCESS
      ======================================================================== */}

      <SuccessModal
        open={
          Boolean(
            receipt,
          )
        }
        onOpenChange={
          open => {
            if (
              !open
            ) {
              finish();
            }
          }
        }
        data={
          receipt
        }
        onDone={
          finish
        }
      />
    </div>
  );
}
