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
  Check,
  ChevronLeft,
  Gift,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import { useLocation } from 'wouter';

import { Button } from '@/components/ui/button';

import { toast } from 'sonner';

import { useAppContext } from '../context/AppContext';

import SuccessModal from '@/components/SuccessModal';

import type { ReceiptData } from '@/components/TransactionReceipt';

import {
  fetchDataPlans,
  type DataPlan,
} from '@/lib/api';

import PhoneInputWithContacts, {
  isValidNigerianNumber,
} from '@/components/PhoneInputWithContacts';

/* ============================================================================
 * NETWORKS
 * ========================================================================== */

const NETWORKS = [
  {
    id: 'mtn',
    name: 'MTN',
    mark: 'MTN',
    bg: 'bg-[#FFCC00]',
    fg: 'text-black',
    ring: 'ring-[#FFCC00]/30',
  },
  {
    id: 'airtel',
    name: 'Airtel',
    mark: 'airtel',
    bg: 'bg-[#E4002B]',
    fg: 'text-white',
    ring: 'ring-[#E4002B]/30',
  },
  {
    id: 'glo',
    name: 'Glo',
    mark: 'Glo',
    bg: 'bg-[#00A859]',
    fg: 'text-white',
    ring: 'ring-[#00A859]/30',
  },
  {
    id: '9mobile',
    name: '9mobile',
    mark: '9mobile',
    bg: 'bg-[#00472B]',
    fg: 'text-white',
    ring: 'ring-[#00472B]/30',
  },
] as const;

/* ============================================================================
 * PLAN CATEGORIES
 * ========================================================================== */

type PlanCategory =
  | 'ALL'
  | 'DAILY'
  | 'WEEKLY'
  | 'MONTHLY'
  | 'NIGHT'
  | 'WEEKEND'
  | 'SME'
  | 'CORPORATE GIFTING'
  | 'GIFTING'
  | 'OTHER';

const CATEGORY_ORDER: PlanCategory[] = [
  'ALL',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  'NIGHT',
  'WEEKEND',
  'SME',
  'CORPORATE GIFTING',
  'GIFTING',
  'OTHER',
];

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function normalize(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function getPrice(value: unknown): number {
  const amount = Number(
    String(value ?? '')
      .replace(/₦/g, '')
      .replace(/,/g, '')
      .trim(),
  );

  return Number.isFinite(amount)
    ? amount
    : 0;
}

function formatMoney(value: unknown): string {
  return `₦${getPrice(value).toLocaleString(
    'en-NG',
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    },
  )}`;
}

/* ============================================================================
 * PLAN CATEGORY DETECTION
 *
 * This deliberately checks both provider category and provider plan name.
 * That means Daily / Weekly / Monthly plans remain separated even when the
 * provider sends weak or inconsistent DataPlanType values.
 * ========================================================================== */

function getPlanCategory(
  plan: DataPlan,
): PlanCategory {
  const text = normalize(
    [
      plan.DataPlanType,
      plan.DataPlanName,
      plan.category,
      plan.description,
    ].join(' '),
  );

  if (text.includes('CORPORATE')) {
    return 'CORPORATE GIFTING';
  }

  if (text.includes('GIFT')) {
    return 'GIFTING';
  }

  if (text.includes('WEEKEND')) {
    return 'WEEKEND';
  }

  if (
    text.includes('NIGHT') ||
    text.includes('NITE') ||
    text.includes('NIGHTLIFE')
  ) {
    return 'NIGHT';
  }

  if (
    text.includes('MONTHLY') ||
    /\b30\s*DAYS?\b/.test(text) ||
    /\b4\s*WEEKS?\b/.test(text)
  ) {
    return 'MONTHLY';
  }

  if (
    text.includes('WEEKLY') ||
    /\b7\s*DAYS?\b/.test(text)
  ) {
    return 'WEEKLY';
  }

  if (
    text.includes('DAILY') ||
    /\b24\s*HOURS?\b/.test(text) ||
    /\b1\s*DAY\b/.test(text)
  ) {
    return 'DAILY';
  }

  if (
    text.includes('SME') ||
    text.includes('SME2') ||
    text.includes('SME 2')
  ) {
    return 'SME';
  }

  return 'OTHER';
}

/* ============================================================================
 * CASHBACK PREVIEW
 * ========================================================================== */

function getPlanCashback(
  plan: DataPlan,
): number {
  if (!plan.cashback_enabled) {
    return 0;
  }

  const value = getPrice(
    plan.cashback_value,
  );

  const amount = getPrice(
    plan.Price,
  );

  if (value <= 0 || amount <= 0) {
    return 0;
  }

  if (
    normalize(plan.cashback_type) ===
    'PERCENTAGE'
  ) {
    return Math.round(
      amount * (value / 100) * 100,
    ) / 100;
  }

  return Math.round(value * 100) / 100;
}

/* ============================================================================
 * IDEMPOTENCY
 * ========================================================================== */

function createIdempotencyKey(): string {
  return [
    'GY-DATA',
    Date.now()
      .toString(36)
      .toUpperCase(),
    Math.random()
      .toString(36)
      .slice(2, 10)
      .toUpperCase(),
  ].join('-');
}

/* ============================================================================
 * NETWORK MARK
 * ========================================================================== */

function NetworkMark({
  network,
  large = false,
}: {
  network: (typeof NETWORKS)[number];
  large?: boolean;
}) {
  return (
    <div
      className={`
        ${
          large
            ? 'h-12 w-12 rounded-2xl text-[11px]'
            : 'h-10 w-10 rounded-xl text-[9px]'
        }
        ${network.bg}
        ${network.fg}
        flex
        shrink-0
        items-center
        justify-center
        font-black
        shadow-sm
      `}
    >
      {network.mark}
    </div>
  );
}

/* ============================================================================
 * SCREEN
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
    step,
    setStep,
  ] = useState<1 | 2 | 3>(1);

  const [
    network,
    setNetwork,
  ] = useState('');

  const [
    phone,
    setPhone,
  ] = useState('');

  const [
    plans,
    setPlans,
  ] = useState<DataPlan[]>([]);

  const [
    plan,
    setPlan,
  ] = useState<DataPlan | null>(null);

  const [
    category,
    setCategory,
  ] = useState<PlanCategory>('ALL');

  const [
    loadingPlans,
    setLoadingPlans,
  ] = useState(false);

  const [
    plansError,
    setPlansError,
  ] = useState('');

  const [
    purchasing,
    setPurchasing,
  ] = useState(false);

  const [
    showPin,
    setShowPin,
  ] = useState(false);

  const [
    pin,
    setPin,
  ] = useState('');

  const [
    receipt,
    setReceipt,
  ] = useState<ReceiptData | null>(
    null,
  );

  const requestCounter =
    useRef(0);

  const idempotencyKey =
    useRef<string | null>(null);

  const selectedNetwork =
    NETWORKS.find(
      item =>
        item.id === network,
    );

  /* --------------------------------------------------------------------------
   * LOAD PLANS
   * ------------------------------------------------------------------------ */

  const loadPlans =
    useCallback(
      async (
        networkId: string,
        targetPhone: string,
      ) => {
        const requestId =
          ++requestCounter.current;

        if (
          !networkId ||
          !isValidNigerianNumber(
            targetPhone.trim(),
          )
        ) {
          setPlans([]);
          setPlan(null);
          setPlansError('');
          setLoadingPlans(false);
          return;
        }

        setLoadingPlans(true);
        setPlansError('');

        try {
          const result =
            await fetchDataPlans(
              networkId,
              targetPhone,
            );

          if (
            requestId !==
            requestCounter.current
          ) {
            return;
          }

          const safePlans =
            Array.isArray(result)
              ? result.filter(Boolean)
              : [];

          setPlans(
            safePlans,
          );

          setPlan(
            current =>
              current
                ? safePlans.find(
                    item =>
                      String(
                        item.DataPlan,
                      ) ===
                      String(
                        current.DataPlan,
                      ),
                  ) ?? null
                : null,
          );

          setCategory(
            current => {
              if (
                current ===
                'ALL'
              ) {
                return current;
              }

              return safePlans.some(
                item =>
                  getPlanCategory(
                    item,
                  ) === current,
              )
                ? current
                : 'ALL';
            },
          );
        } catch (error) {
          if (
            requestId !==
            requestCounter.current
          ) {
            return;
          }

          setPlans([]);
          setPlan(null);

          setPlansError(
            error instanceof Error
              ? error.message
              : 'Unable to load data plans.',
          );
        } finally {
          if (
            requestId ===
            requestCounter.current
          ) {
            setLoadingPlans(false);
          }
        }
      },
      [],
    );

  /* --------------------------------------------------------------------------
   * AUTOMATIC PLAN REFRESH
   * ------------------------------------------------------------------------ */

  useEffect(() => {
    if (
      !network ||
      !isValidNigerianNumber(
        phone.trim(),
      )
    ) {
      setPlans([]);
      setPlan(null);
      setPlansError('');
      setLoadingPlans(false);
      return;
    }

    const timer =
      window.setTimeout(
        () => {
          void loadPlans(
            network,
            phone,
          );
        },
        250,
      );

    return () =>
      window.clearTimeout(
        timer,
      );
  }, [
    network,
    phone,
    loadPlans,
  ]);

  /* --------------------------------------------------------------------------
   * AVAILABLE CATEGORIES
   * ------------------------------------------------------------------------ */

  const availableCategories =
    useMemo(() => {
      const found =
        new Set(
          plans.map(
            getPlanCategory,
          ),
        );

      return CATEGORY_ORDER.filter(
        item =>
          item === 'ALL' ||
          found.has(item),
      );
    }, [plans]);

  /* --------------------------------------------------------------------------
   * VISIBLE PLANS
   * ------------------------------------------------------------------------ */

  const visiblePlans =
    useMemo(() => {
      const filtered =
        category === 'ALL'
          ? plans
          : plans.filter(
              item =>
                getPlanCategory(
                  item,
                ) === category,
            );

      return [
        ...filtered,
      ].sort(
        (a, b) => {
          const catA =
            getPlanCategory(a);

          const catB =
            getPlanCategory(b);

          if (
            catA !== catB
          ) {
            return catA.localeCompare(
              catB,
            );
          }

          return (
            getPrice(a.Price) -
            getPrice(b.Price)
          );
        },
      );
    }, [
      plans,
      category,
    ]);

  /* --------------------------------------------------------------------------
   * NETWORK
   * ------------------------------------------------------------------------ */

  const handleNetwork =
    (value: string) => {
      requestCounter.current +=
        1;

      setNetwork(value);
      setPlans([]);
      setPlan(null);
      setCategory('ALL');
      setPlansError('');
      setStep(2);

      idempotencyKey.current =
        null;
    };

  /* --------------------------------------------------------------------------
   * PHONE
   * ------------------------------------------------------------------------ */

  const handlePhone =
    (value: string) => {
      requestCounter.current +=
        1;

      setPhone(value);
      setPlans([]);
      setPlan(null);
      setPlansError('');

      idempotencyKey.current =
        null;
    };

  /* --------------------------------------------------------------------------
   * SELECT PLAN
   * ------------------------------------------------------------------------ */

  const selectPlan =
    (value: DataPlan) => {
      setPlan(value);
      setStep(3);
    };

  /* --------------------------------------------------------------------------
   * PREPARE PURCHASE
   * ------------------------------------------------------------------------ */

  const preparePurchase =
    () => {
      if (
        !selectedNetwork
      ) {
        toast.error(
          'Please select a network.',
        );
        return;
      }

      if (
        !isValidNigerianNumber(
          phone.trim(),
        )
      ) {
        toast.error(
          'Please enter a valid Nigerian phone number.',
        );
        return;
      }

      if (!plan) {
        toast.error(
          'Please select a data plan.',
        );
        return;
      }

      const amount =
        getPrice(plan.Price);

      if (amount <= 0) {
        toast.error(
          'This data plan has an invalid price.',
        );
        return;
      }

      if (
        balance < amount
      ) {
        toast.error(
          'Insufficient wallet balance. Please fund your wallet.',
        );
        return;
      }

      setPin('');
      setShowPin(true);
    };

  /* --------------------------------------------------------------------------
   * PURCHASE
   * ------------------------------------------------------------------------ */

  const purchase =
    async () => {
      if (
        !plan ||
        !selectedNetwork ||
        purchasing
      ) {
        return;
      }

      if (
        !/^\d{4}$/.test(pin)
      ) {
        toast.error(
          'Purchase PIN must be exactly 4 digits.',
        );
        return;
      }

      const amount =
        getPrice(plan.Price);

      const requestKey =
        idempotencyKey.current ??
        createIdempotencyKey();

      idempotencyKey.current =
        requestKey;

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
                  requestKey,
              },

              body:
                JSON.stringify({
                  network:
                    selectedNetwork.id,

                  phone:
                    phone.trim(),

                  planCode:
                    String(
                      plan.DataPlan ??
                        '',
                    ).trim(),

                  planName:
                    String(
                      plan.DataPlanName ??
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
            transactionId?: string;
            reference?: string;
            amount?:
              | number
              | string;
            network?: string;
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
          const errorText =
            String(
              result?.error ??
                '',
            ).toLowerCase();

          if (
            errorText.includes(
              'purchase pin',
            ) ||
            errorText.includes(
              'incorrect purchase',
            )
          ) {
            toast.error(
              'Invalid purchase PIN.',
            );
          } else if (
            errorText.includes(
              'insufficient',
            )
          ) {
            toast.error(
              'Insufficient wallet balance.',
            );
          } else {
            toast.error(
              result?.error ??
                'Data purchase failed. Please try again.',
            );
          }

          return;
        }

        const cashbackAmount =
          getPrice(
            result.cashbackAmount,
          );

        setShowPin(false);

        setReceipt({
          type: 'data',

          provider:
            selectedNetwork.name,

          service: 'Data',

          description:
            result.planName ??
            plan.DataPlanName ??
            'Data Bundle',

          amount:
            getPrice(
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
                minute: '2-digit',
              },
            ),

          status:
            result.pending
              ? 'pending'
              : 'success',

          phone:
            result.phone ??
            phone.trim(),

          paymentMethod:
            'Wallet',

          cashbackAmount:
            cashbackAmount > 0
              ? cashbackAmount
              : undefined,
        });

        idempotencyKey.current =
          null;

        await Promise.allSettled([
          refreshWallet(),
          refreshCashbackWallet(),
        ]);
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Network error. Please try again.',
        );
      } finally {
        setPurchasing(false);
      }
    };

  /* --------------------------------------------------------------------------
   * DONE
   * ------------------------------------------------------------------------ */

  const done = () => {
    setReceipt(null);
    setStep(1);
    setNetwork('');
    setPhone('');
    setPlans([]);
    setPlan(null);
    setCategory('ALL');
    setPin('');

    idempotencyKey.current =
      null;
  };

  const cashback =
    plan
      ? getPlanCashback(plan)
      : 0;

  /* ==========================================================================
   * RENDER
   * ======================================================================== */

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <div className="mx-auto w-full max-w-2xl px-4 py-5">

        {/* HEADER */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              if (step > 1) {
                setStep(
                  value =>
                    (value -
                      1) as
                      | 1
                      | 2
                      | 3,
                );
              } else {
                setLocation('/');
              }
            }}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-card hover:bg-muted"
            aria-label="Go back"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="text-center">
            <h1 className="text-lg font-bold">
              Buy Data
            </h1>

            <p className="mt-0.5 text-xs text-muted-foreground">
              Choose a bundle that fits your day.
            </p>
          </div>

          <div className="w-10" />
        </div>

        {/* STEPS */}
        <div className="mb-6 flex items-center gap-2">
          {[1, 2, 3].map(
            item => (
              <React.Fragment
                key={item}
              >
                <div
                  className={`
                    flex
                    h-8
                    w-8
                    items-center
                    justify-center
                    rounded-full
                    text-xs
                    font-bold
                    ${
                      step >=
                      item
                        ? 'bg-primary text-primary-foreground'
                        : 'border border-border bg-card text-muted-foreground'
                    }
                  `}
                >
                  {step > item ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    item
                  )}
                </div>

                {item < 3 && (
                  <div
                    className={`
                      h-px
                      flex-1
                      ${
                        step >
                        item
                          ? 'bg-primary'
                          : 'bg-border'
                      }
                    `}
                  />
                )}
              </React.Fragment>
            ),
          )}
        </div>

        {/* ====================================================================
            STEP 1
        ==================================================================== */}

        {step === 1 && (
          <motion.div
            initial={{
              opacity: 0,
              y: 10,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            className="space-y-5"
          >
            <section>
              <div className="mb-3">
                <h2 className="text-base font-bold">
                  Select Network
                </h2>

                <p className="mt-1 text-xs text-muted-foreground">
                  MTN, Airtel, Glo and 9mobile plans are shown separately.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {NETWORKS.map(
                  item => {
                    const selected =
                      network ===
                      item.id;

                    return (
                      <button
                        key={
                          item.id
                        }
                        type="button"
                        onClick={() =>
                          handleNetwork(
                            item.id,
                          )
                        }
                        className={`
                          rounded-2xl
                          border-2
                          p-4
                          text-left
                          transition-all
                          ${
                            selected
                              ? `border-primary bg-primary/5 ring-2 ${item.ring}`
                              : 'border-border bg-card hover:border-primary/40'
                          }
                        `}
                      >
                        <div className="flex items-center justify-between">
                          <NetworkMark
                            network={
                              item
                            }
                            large
                          />

                          {selected && (
                            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
                              <Check className="h-4 w-4" />
                            </span>
                          )}
                        </div>

                        <p className="mt-3 text-sm font-bold">
                          {item.name}
                        </p>

                        <p className="mt-1 text-[11px] text-muted-foreground">
                          View available bundles
                        </p>
                      </button>
                    );
                  },
                )}
              </div>
            </section>

            <section>
              <h2 className="mb-3 text-base font-bold">
                Recipient Phone Number
              </h2>

              <PhoneInputWithContacts
                value={phone}
                onChange={
                  handlePhone
                }
                placeholder="08012345678"
              />
            </section>

            <Button
              type="button"
              disabled={
                !selectedNetwork ||
                !isValidNigerianNumber(
                  phone.trim(),
                )
              }
              onClick={() =>
                setStep(2)
              }
              className="h-12 w-full rounded-xl font-bold"
            >
              Continue
            </Button>
          </motion.div>
        )}

        {/* ====================================================================
            STEP 2
        ==================================================================== */}

        {step === 2 && (
          <motion.div
            initial={{
              opacity: 0,
              y: 10,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            className="space-y-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">
                  Select Data Plan
                </h2>

                <p className="mt-1 text-xs text-muted-foreground">
                  {selectedNetwork?.name ??
                    'Network'}{' '}
                  · {phone}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  void loadPlans(
                    network,
                    phone,
                  )
                }
                disabled={
                  loadingPlans
                }
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card disabled:opacity-50"
                aria-label="Refresh plans"
              >
                <RefreshCw
                  className={`
                    h-4 w-4
                    ${
                      loadingPlans
                        ? 'animate-spin'
                        : ''
                    }
                  `}
                />
              </button>
            </div>

            {/* PLAN CATEGORY FILTERS */}

            <div className="flex gap-2 overflow-x-auto pb-1">
              {availableCategories.map(
                item => (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      setCategory(
                        item,
                      )
                    }
                    className={`
                      whitespace-nowrap
                      rounded-full
                      border
                      px-3.5
                      py-2
                      text-[11px]
                      font-bold
                      transition
                      ${
                        category ===
                        item
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-card text-muted-foreground hover:text-foreground'
                      }
                    `}
                  >
                    {item ===
                    'CORPORATE GIFTING'
                      ? 'Corporate'
                      : item
                          .charAt(
                            0,
                          )
                          .concat(
                            item
                              .slice(
                                1,
                              )
                              .toLowerCase(),
                          )}
                  </button>
                ),
              )}
            </div>

            {/* LOADING */}

            {loadingPlans ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({
                  length: 8,
                }).map(
                  (_, index) => (
                    <div
                      key={
                        index
                      }
                      className="h-40 animate-pulse rounded-2xl border border-border bg-card"
                    />
                  ),
                )}
              </div>
            ) : plansError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
                <div className="flex gap-3">
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />

                  <div>
                    <p className="text-sm font-semibold text-red-400">
                      Unable to load plans
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {plansError}
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        void loadPlans(
                          network,
                          phone,
                        )
                      }
                      className="mt-3 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-semibold text-red-400"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            ) : visiblePlans.length ===
              0 ? (
              <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
                No{' '}
                {category ===
                'ALL'
                  ? ''
                  : `${category.toLowerCase()} `}
                plans are available for this network.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {visiblePlans.map(
                  item => {
                    const selected =
                      plan?.DataPlan ===
                      item.DataPlan;

                    const cb =
                      getPlanCashback(
                        item,
                      );

                    const cat =
                      getPlanCategory(
                        item,
                      );

                    return (
                      <button
                        key={`${item.DataPlan}-${item.Price}`}
                        type="button"
                        onClick={() =>
                          selectPlan(
                            item,
                          )
                        }
                        className={`
                          group
                          rounded-2xl
                          border-2
                          bg-card
                          p-4
                          text-left
                          transition-all
                          ${
                            selected
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:-translate-y-0.5 hover:border-primary/40'
                          }
                        `}
                      >
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <span className="rounded-full bg-muted px-2 py-1 text-[9px] font-bold uppercase tracking-wide text-muted-foreground">
                            {cat}
                          </span>

                          {cb > 0 && (
                            <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[9px] font-bold text-emerald-500">
                              <Gift className="h-3 w-3" />
                              +
                              {formatMoney(
                                cb,
                              )}
                            </span>
                          )}
                        </div>

                        <p className="min-h-10 text-sm font-extrabold leading-5">
                          {String(
                            item.DataPlanName ??
                              'Data Bundle',
                          )}
                        </p>

                        <p className="mt-2 text-xl font-black">
                          {formatMoney(
                            item.Price,
                          )}
                        </p>

                        <p className="mt-1 text-[10px] text-muted-foreground">
                          Tap to continue
                        </p>
                      </button>
                    );
                  },
                )}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setStep(1)
              }
              className="h-11 w-full rounded-xl"
            >
              Back
            </Button>
          </motion.div>
        )}

        {/* ====================================================================
            STEP 3
        ==================================================================== */}

        {step === 3 &&
          plan &&
          selectedNetwork && (
            <motion.div
              initial={{
                opacity: 0,
                y: 10,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              className="space-y-5"
            >
              <div>
                <h2 className="text-base font-bold">
                  Confirm Purchase
                </h2>

                <p className="mt-1 text-xs text-muted-foreground">
                  Check the bundle and cashback before paying.
                </p>
              </div>

              <div className="overflow-hidden rounded-3xl border border-border bg-card">
                <div
                  className={`
                    ${selectedNetwork.bg}
                    ${selectedNetwork.fg}
                    flex
                    items-center
                    gap-3
                    p-5
                  `}
                >
                  <NetworkMark
                    network={
                      selectedNetwork
                    }
                    large
                  />

                  <div>
                    <p className="text-sm font-black">
                      {
                        selectedNetwork.name
                      }
                    </p>

                    <p className="text-xs opacity-80">
                      {phone}
                    </p>
                  </div>
                </div>

                <div className="space-y-4 p-5">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Data Plan
                    </p>

                    <p className="mt-1 text-lg font-extrabold">
                      {
                        plan.DataPlanName
                      }
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {
                        getPlanCategory(
                          plan,
                        )
                      }{' '}
                      bundle
                    </p>
                  </div>

                  <div className="flex items-end justify-between border-t border-border pt-4">
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Amount
                      </p>

                      <p className="mt-1 text-2xl font-black">
                        {formatMoney(
                          plan.Price,
                        )}
                      </p>
                    </div>

                    {cashback >
                      0 && (
                      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-right">
                        <p className="flex items-center justify-end gap-1 text-[10px] font-bold text-emerald-500">
                          <Sparkles className="h-3 w-3" />
                          Cashback
                        </p>

                        <p className="text-sm font-black text-emerald-500">
                          +
                          {formatMoney(
                            cashback,
                          )}
                        </p>
                      </div>
                    )}
                  </div>

                  {cashback >
                    0 && (
                    <div className="flex items-center gap-2 rounded-xl bg-muted/60 p-3 text-xs text-muted-foreground">
                      <Gift className="h-4 w-4 text-emerald-500" />

                      This purchase earns

                      <span className="font-bold text-emerald-500">
                        {formatMoney(
                          cashback,
                        )}
                      </span>

                      in your Cashback Wallet.
                    </div>
                  )}

                  <Button
                    type="button"
                    onClick={
                      preparePurchase
                    }
                    disabled={
                      purchasing
                    }
                    className="h-12 w-full rounded-xl font-bold"
                  >
                    Buy{' '}
                    {formatMoney(
                      plan.Price,
                    )}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() =>
                      setStep(2)
                    }
                    className="h-11 w-full rounded-xl"
                  >
                    Change Plan
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
      </div>

      {/* ======================================================================
          PURCHASE PIN
      ====================================================================== */}

      {showPin && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-3xl border border-border bg-background p-5 shadow-2xl">
            <div className="mb-5">
              <p className="text-lg font-bold">
                Enter Purchase PIN
              </p>

              <p className="mt-1 text-xs text-muted-foreground">
                Your PIN authorizes the wallet debit.
              </p>
            </div>

            <input
              autoFocus
              inputMode="numeric"
              maxLength={4}
              type="password"
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
              className="h-14 w-full rounded-2xl border border-border bg-card text-center text-2xl font-black tracking-[0.7em] outline-none focus:border-primary"
              placeholder="••••"
            />

            <div className="mt-5 grid grid-cols-2 gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowPin(
                    false,
                  );
                  setPin('');
                }}
                disabled={
                  purchasing
                }
              >
                Cancel
              </Button>

              <Button
                type="button"
                onClick={() =>
                  void purchase()
                }
                disabled={
                  purchasing ||
                  pin.length !== 4
                }
              >
                {purchasing
                  ? 'Processing…'
                  : 'Confirm'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================================
          RECEIPT
      ====================================================================== */}

      <SuccessModal
        open={Boolean(receipt)}
        onOpenChange={open => {
          if (!open) {
            done();
          }
        }}
        data={receipt}
        onDone={done}
      />
    </div>
  );
}
