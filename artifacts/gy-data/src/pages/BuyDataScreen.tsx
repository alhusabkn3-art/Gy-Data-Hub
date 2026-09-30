// artifacts/gy-data/src/pages/BuyDataScreen.tsx

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
    /\b3\s*WEEKS?\b/.test(
      text,
    )
  ) {
    return 'MONTHLY';
  }

  if (
    /\b2\s*WEEKS?\b/.test(
      text,
    )
  ) {
    return 'MONTHLY';
  }

  if (
    /\b1\s*WEEK\b/.test(
      text,
    ) ||
    /\b7\s*DAYS?\b/.test(
      text,
    )
  ) {
    return 'WEEKLY';
  }

  if (
    /\b14\s*DAYS?\b/.test(
      text,
    )
  ) {
    return 'WEEKLY';
  }

  if (
    /\b21\s*DAYS?\b/.test(
      text,
    )
  ) {
    return 'MONTHLY';
  }

  if (
    /\bDAILY\b/.test(
      text,
    ) ||
    /\b1\s*DAY\b/.test(
      text,
    )
  ) {
    return 'DAILY';
  }

  if (
    /\b2\s*DAYS?\b/.test(
      text,
    ) ||
    /\b3\s*DAYS?\b/.test(
      text,
    ) ||
    /\b5\s*DAYS?\b/.test(
      text,
    )
  ) {
    return 'DAILY';
  }

  if (
    /\bWEEKLY\b/.test(
      text,
    )
  ) {
    return 'WEEKLY';
  }

  if (
    /\bMONTHLY\b/.test(
      text,
    )
  ) {
    return 'MONTHLY';
  }

  if (
    /\bMONTH\b/.test(
      text,
    )
  ) {
    return 'MONTHLY';
  }

  return 'ALL';
}

/* ============================================================================
 * NETWORK LOGO
 * ========================================================================== */

function NetworkLogo({
  network,
  selected = false,
}: {
  network: Network;
  selected?: boolean;
}) {
  const logoText =
    network.id === 'mtn'
      ? 'MTN'
      : network.id ===
          'airtel'
        ? 'airtel'
        : network.id ===
            'glo'
          ? 'Glo'
          : '9M';

  const logoClass =
    network.id === 'mtn'
      ? 'bg-[#FFD100] text-slate-900'
      : network.id ===
          'airtel'
        ? 'bg-[#E30613] text-white'
        : network.id ===
            'glo'
          ? 'bg-[#78BE20] text-white'
          : 'bg-[#006B3F] text-white';

  return (
    <div
      className={`
        flex
        h-11
        w-11
        items-center
        justify-center
        rounded-full
        text-[10px]
        font-black
        shadow-sm
        ${
          selected
            ? 'ring-2 ring-slate-900 ring-offset-2'
            : ''
        }
        ${logoClass}
      `}
    >
      {logoText}
    </div>
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
  const raw =
    plan as DataPlan & {
      cashback?: unknown;
      Cashback?: unknown;
      cashbackAmount?: unknown;
      CashbackAmount?: unknown;
      cashbackPercent?: unknown;
      CashbackPercent?: unknown;
    };

  const amount =
    numberValue(
      raw.cashbackAmount ??
        raw.CashbackAmount ??
        raw.cashback ??
        raw.Cashback,
    );

  if (
    amount > 0
  ) {
    return {
      amount,
      label: `${formatMoney(
        amount,
      )} Cashback`,
    };
  }

  const percent =
    numberValue(
      raw.cashbackPercent ??
        raw.CashbackPercent,
    );

  if (
    percent > 0
  ) {
    return {
      amount: percent,
      label: `${percent}% Cashback`,
    };
  }

  return {
    amount: 0,
    label: '',
  };
}

/* ============================================================================
 * COMPONENT
 * ========================================================================== */

export default function BuyDataScreen() {
  const [, setLocation] =
    useLocation();

  const {
    user,
    wallet,
    purchaseData,
  } = useAppContext();

  const [network, setNetwork] =
    useState<
      Network['id']
    >('mtn');

  const [
    plans,
    setPlans,
  ] = useState<DataPlan[]>(
    [],
  );

  const [
    loadingPlans,
    setLoadingPlans,
  ] = useState(false);

  const [
    plansError,
    setPlansError,
  ] = useState('');

  const [
    tab,
    setTab,
  ] = useState<PlanTab>(
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
    phone,
    setPhone,
  ] = useState(
    '',
  );

  const [
    selectedPlan,
    setSelectedPlan,
  ] =
    useState<DataPlan | null>(
      null,
    );

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
    successOpen,
    setSuccessOpen,
  ] = useState(false);

  const [
    successReceipt,
    setSuccessReceipt,
  ] =
    useState<ReceiptData | null>(
      null,
    );

  const idempotencyKey =
    useRef<string | null>(
      null,
    );

  const currentBalance =
    numberValue(
      wallet?.balance ??
        wallet?.availableBalance ??
        0,
    );

  const selectedNetwork =
    NETWORKS.find(
      item =>
        item.id ===
        network,
    ) ??
    NETWORKS[0];

  /* ==========================================================================
   * AVAILABLE TABS
   * ======================================================================== */

  const availableTabs =
    useMemo(() => {
      const result =
        new Set<PlanTab>();

      for (
        const plan of plans
      ) {
        result.add(
          getPlanTab(
            plan,
          ),
        );
      }

      return Array.from(
        result,
      );
    }, [plans]);

  /* ==========================================================================
   * AVAILABLE VALIDITIES
   * ======================================================================== */

  const availableValidities =
    useMemo(() => {
      const result =
        new Set<string>();

      for (
        const plan of plans
      ) {
        const value =
          getValidity(
            plan,
          );

        if (
          value !==
          'ALL'
        ) {
          result.add(
            value,
          );
        }
      }

      return result;
    }, [plans]);

  /* ==========================================================================
   * LOAD PLANS
   * ======================================================================== */

  const loadPlans =
    useCallback(
      async () => {
        setLoadingPlans(
          true,
        );

        setPlansError(
          '',
        );

        try {
          const response =
            await fetchDataPlans(
              selectedNetwork.type,
            );

          const incoming =
            Array.isArray(
              response,
            )
              ? response
              : Array.isArray(
                    response?.data,
                  )
                ? response.data
                : Array.isArray(
                      response?.plans,
                    )
                  ? response.plans
                  : [];

          setPlans(
            incoming,
          );

          const tabs =
            new Set(
              incoming.map(
                item =>
                  getPlanTab(
                    item,
                  ),
              ),
            );

          if (
            !tabs.has(
              tab,
            )
          ) {
            if (
              tabs.has(
                'SME',
              )
            ) {
              setTab(
                'SME',
              );
            } else {
              const first =
                Array.from(
                  tabs,
                )[0];

              if (
                first
              ) {
                setTab(
                  first,
                );
              }
            }
          }
        } catch (
          error
        ) {
          console.error(
            'Failed to load data plans:',
            error,
          );

          setPlans(
            [],
          );

          setPlansError(
            error instanceof Error
              ? error.message
              : 'Unable to load data plans.',
          );
        } finally {
          setLoadingPlans(
            false,
          );
        }
      },
      [
        selectedNetwork.type,
        tab,
      ],
    );

  useEffect(() => {
    void loadPlans();
  }, [
    loadPlans,
  ]);

  /* ==========================================================================
   * NETWORK CHANGE
   * ======================================================================== */

  function changeNetwork(
    value: Network['id'],
  ) {
    setNetwork(
      value,
    );

    setSelectedPlan(
      null,
    );

    setValidityFilter(
      'ALL',
    );
  }

  /* ==========================================================================
   * PHONE CHANGE
   * ======================================================================== */

  function changePhone(
    value: string,
  ) {
    const digits =
      value
        .replace(
          /\D/g,
          '',
        )
        .slice(
          0,
          11,
        );

    setPhone(
      digits,
    );

    setSelectedPlan(
      null,
    );
  }

  /* ==========================================================================
   * CONTACT PICKER
   * ======================================================================== */

  async function chooseContact() {
    try {
      const navigatorAny =
        navigator as Navigator & {
          contacts?: {
            select?: (
              properties: string[],
              options?: {
                multiple?: boolean;
              },
            ) => Promise<
              Array<{
                tel?: string[];
              }>
            >;
          };
        };

      if (
        navigatorAny.contacts?.select
      ) {
        const contacts =
          await navigatorAny.contacts.select(
            ['tel'],
            {
              multiple:
                false,
            },
          );

        const number =
          contacts?.[0]
            ?.tel?.[0];

        if (
          number
        ) {
          changePhone(
            number,
          );
        }

        return;
      }

      toast.info(
        'Contact picker is not available on this device.',
      );
    } catch (
      error
    ) {
      console.error(
        'Contact picker error:',
        error,
      );
    }
  }

  /* ==========================================================================
   * VISIBLE PLANS
   * ======================================================================== */

  const visiblePlans =
    useMemo(() => {
      let result =
        plans.filter(
          item =>
            getPlanTab(
              item,
            ) === tab,
        );

      if (
        validityFilter !==
        'ALL'
      ) {
        result =
          result.filter(
            item =>
              getValidity(
                item,
              ) ===
              validityFilter,
          );
      }

      return result;
    }, [
      plans,
      tab,
      validityFilter,
    ]);

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
        'This data plan has an invalid price.',
      );

      return;
    }

    if (
      currentBalance <
      amount
    ) {
      toast.error(
        'Insufficient wallet balance.',
      );

      return;
    }

    setPin(
      '',
    );

    setPinOpen(
      true,
    );
  }

  /* ==========================================================================
   * PURCHASE
   * ======================================================================== */

  async function purchase() {
    if (
      pin.length !==
      4
    ) {
      toast.error(
        'Purchase PIN must be exactly 4 digits.',
      );

      return;
    }

    if (
      purchasing
    ) {
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
        'Invalid data plan amount.',
      );

      return;
    }

    if (
      currentBalance <
      amount
    ) {
      toast.error(
        'Insufficient wallet balance.',
      );

      return;
    }

    if (
      !idempotencyKey.current
    ) {
      idempotencyKey.current =
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;
    }

    setPurchasing(
      true,
    );

    try {
      const result =
        await purchaseData(
          normalizeNigerianNumber(
            phone,
          ),
          selectedPlan,
          pin,
          idempotencyKey.current,
        );

      if (
        !result?.success
      ) {
        toast.error(
          result?.error ||
            result?.message ||
            'Data purchase failed.',
        );

        return;
      }

      const receipt: ReceiptData =
        {
          id:
            String(
              result?.transaction?.id ??
                result?.transactionId ??
                result?.id ??
                '',
            ),

          reference:
            String(
              result?.transaction?.reference ??
                result?.reference ??
                '',
            ),

          providerReference:
            String(
              result?.transaction
                ?.providerReference ??
                result?.providerReference ??
                '',
            ),

          provider:
            'GY DATA',

          service:
            'Data',

          description:
            selectedPlan.DataPlanName ||
            'Data Purchase',

          recipient:
            normalizeNigerianNumber(
              phone,
            ),

          amount,

          cashback:
            numberValue(
              result?.transaction
                ?.cashback ??
                result?.cashback ??
                0,
            ),

          status:
            'success',

          createdAt:
            String(
              result?.transaction
                ?.createdAt ??
                new Date().toISOString(),
            ),

          paymentMethod:
            'Wallet',
        };

      setSuccessReceipt(
        receipt,
      );

      setPinOpen(
        false,
      );

      setPin(
        '',
      );

      setSuccessOpen(
        true,
      );

      setSelectedPlan(
        null,
      );

      idempotencyKey.current =
        null;
    } catch (
      error
    ) {
      console.error(
        'Data purchase error:',
        error,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : 'Data purchase failed.',
      );
    } finally {
      setPurchasing(
        false,
      );
    }
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
            PLANS HEADER / LOADING
        ================================================================== */}

        {loadingPlans ? (
          <div className="rounded-[22px] border border-slate-200 bg-white p-7 text-center">
            <RefreshCw className="mx-auto h-6 w-6 animate-spin text-slate-400" />

            <p className="mt-2 text-xs font-semibold text-slate-400">
              Loading data plans...
            </p>
          </div>
        ) : plansError ? (
          <div className="rounded-[22px] border border-amber-200 bg-white p-7 text-center">
            <AlertCircle className="mx-auto h-7 w-7 text-amber-500" />

            <p className="mt-2 text-sm font-bold text-slate-600">
              Unable to load
              data plans
            </p>

            <p className="mt-1 text-[11px] text-slate-400">
              {plansError}
            </p>

            <button
              type="button"
              onClick={() =>
                void loadPlans()
              }
              className="mt-4 rounded-xl bg-slate-900 px-4 py-2.5 text-[11px] font-bold text-white"
            >
              Retry
            </button>
          </div>
        ) : !isValidNigerianNumber(
            phone,
          ) ? (
          <div className="rounded-[22px] border border-slate-200 bg-white p-7 text-center text-xs text-slate-400">
            Enter a valid
            phone number to view
            available plans.
          </div>
        ) : visiblePlans.length ===
          0 ? (
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

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
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
                      min-h-[148px]
                      flex-col
                      rounded-[18px]
                      border
                      bg-white
                      p-2.5
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
                      <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-900 text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    )}

                    <div className="pr-6">
                      <p className="truncate text-[16px] font-black leading-5 text-slate-900">
                        {item.DataPlanName ||
                          'Data'}
                      </p>

                      <p className="mt-1 truncate text-[10px] font-medium text-slate-400">
                        {tab}
                        {' '}
                        |
                        {' '}
                        {validity}
                      </p>
                    </div>

                    <p className="mt-2.5 text-[15px] font-black text-slate-900">
                      {formatMoney(
                        item.Price,
                      )}
                    </p>

                    <div className="mt-auto pt-2">
                      {cb.amount >
                      0 ? (
                        <span className="flex min-h-7 items-center justify-center gap-1 rounded-full bg-[#10243F] px-2 py-1 text-center text-[8px] font-bold leading-3 text-[#D8B52B]">
                          <Gift className="h-3.5 w-3.5 shrink-0" />

                          {cb.label}
                        </span>
                      ) : (
                        <span className="block rounded-full bg-slate-100 px-2 py-1 text-center text-[8px] font-bold text-slate-500">
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
              type={
                pin.length ===
                4
                  ? 'password'
                  : 'text'
              }
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
              autoComplete="off"
              aria-label="Purchase PIN"
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

      {successOpen &&
        successReceipt && (
          <SuccessModal
            open={
              successOpen
            }
            onClose={() => {
              setSuccessOpen(
                false,
              );

              setSuccessReceipt(
                null,
              );
            }}
            receipt={
              successReceipt
            }
          />
        )}
    </div>
  );
}
