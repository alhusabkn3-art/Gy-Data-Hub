import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import { motion } from 'framer-motion';

import {
  AlertCircle,
  ChevronLeft,
  Gift,
  RefreshCw,
} from 'lucide-react';

import { useLocation } from 'wouter';

import { Button } from '@/components/ui/button';

import { useAppContext } from '../context/AppContext';

import SuccessModal from '@/components/SuccessModal';

import type { ReceiptData } from '@/components/TransactionReceipt';

import { toast } from 'sonner';

import {
  fetchDataPlans,
  type DataPlan,
} from '@/lib/api';

import PhoneInputWithContacts, {
  isValidNigerianNumber,
} from '@/components/PhoneInputWithContacts';

const networks = [
  {
    id: 'mtn',
    name: 'MTN',
    color: 'bg-[#FFCC00]',
    text: 'text-black',
  },
  {
    id: 'airtel',
    name: 'Airtel',
    color: 'bg-[#FF0000]',
    text: 'text-white',
  },
  {
    id: 'glo',
    name: 'Glo',
    color: 'bg-[#009900]',
    text: 'text-white',
  },
  {
    id: '9mobile',
    name: '9mobile',
    color: 'bg-[#006600]',
    text: 'text-white',
  },
];

type PlanTab =
  | 'SME'
  | 'CORPORATE GIFTING'
  | 'GIFTING';

const tabs: PlanTab[] = [
  'SME',
  'CORPORATE GIFTING',
  'GIFTING',
];

function normalizePlanType(
  value: string = '',
): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[_-]/g, ' ');
}

function getPlanTab(
  plan: DataPlan,
): PlanTab {
  const type =
    normalizePlanType(
      plan.DataPlanType,
    );

  if (
    type.includes('CORPORATE')
  ) {
    return 'CORPORATE GIFTING';
  }

  if (type.includes('GIFT')) {
    return 'GIFTING';
  }

  return 'SME';
}

function getPrice(
  value: string | number,
): number {
  if (
    typeof value === 'number'
  ) {
    return Number.isFinite(value)
      ? value
      : 0;
  }

  const cleaned =
    String(value)
      .replace(/₦/g, '')
      .replace(/,/g, '')
      .trim();

  const amount =
    Number(cleaned);

  return Number.isFinite(amount)
    ? amount
    : 0;
}

function formatPrice(
  value: string | number,
): string {
  const amount =
    getPrice(value);

  return `₦${amount.toLocaleString(
    'en-NG',
  )}`;
}

function makeIdempotencyKey(): string {
  return [
    'GY-DAT',
    Date.now()
      .toString(36)
      .toUpperCase(),
    Math.random()
      .toString(36)
      .slice(2, 10)
      .toUpperCase(),
  ].join('-');
}

export default function BuyDataScreen() {
  const [, setLocation] =
    useLocation();

  const {
    balance,
    refreshWallet,
    refreshCashbackWallet,
  } = useAppContext();

  const [step, setStep] =
    useState(1);

  const [network, setNetwork] =
    useState('');

  const [phone, setPhone] =
    useState('');

  const [plans, setPlans] =
    useState<DataPlan[]>([]);

  const [plan, setPlan] =
    useState<DataPlan | null>(null);

  const [selectedTab, setSelectedTab] =
    useState<PlanTab>('SME');

  const [plansLoading, setPlansLoading] =
    useState(false);

  const [plansError, setPlansError] =
    useState('');

  const [isLoading, setIsLoading] =
    useState(false);

  const [
    showPurchasePin,
    setShowPurchasePin,
  ] = useState(false);

  const [
    purchasePin,
    setPurchasePin,
  ] = useState('');

  const [showSuccess, setShowSuccess] =
    useState(false);

  const [successData, setSuccessData] =
    useState<ReceiptData | null>(null);

  const requestCounter =
    useRef(0);

  const idempotencyKey =
    useRef<string | null>(null);

  const selectedNetwork =
    networks.find(
      item =>
        item.id === network,
    );

  const loadPlans =
    useCallback(
      async (
        selectedNetworkId: string,
        selectedPhone: string,
      ) => {
        const net =
          String(
            selectedNetworkId ?? '',
          )
            .trim()
            .toLowerCase();

        const targetPhone =
          String(
            selectedPhone ?? '',
          ).trim();

        const requestId =
          ++requestCounter.current;

        if (!net) {
          setPlans([]);
          setPlan(null);
          setPlansError('');
          setPlansLoading(false);
          return;
        }

        if (
          !isValidNigerianNumber(
            targetPhone,
          )
        ) {
          setPlans([]);
          setPlan(null);
          setPlansError('');
          setPlansLoading(false);
          return;
        }

        setPlansLoading(true);
        setPlansError('');

        try {
          const data =
            await fetchDataPlans(
              net,
              targetPhone,
            );

          if (
            requestId !==
            requestCounter.current
          ) {
            return;
          }

          const safePlans =
            Array.isArray(data)
              ? data.filter(
                  item =>
                    item &&
                    typeof item ===
                      'object',
                )
              : [];

          setPlans(
            safePlans,
          );

          setPlan(
            current => {
              if (!current) {
                return null;
              }

              const currentCode =
                String(
                  current.DataPlan ??
                    '',
                ).trim();

              return (
                safePlans.find(
                  item =>
                    String(
                      item.DataPlan ??
                        '',
                    ).trim() ===
                    currentCode,
                ) ?? null
              );
            },
          );

          const availableTabs =
            safePlans.map(
              item =>
                getPlanTab(item),
            );

          if (
            !availableTabs.includes(
              selectedTab,
            )
          ) {
            setSelectedTab(
              availableTabs.includes(
                'SME',
              )
                ? 'SME'
                : availableTabs[0] ??
                    'SME',
            );
          }
        } catch (
          error
        ) {
          if (
            requestId !==
            requestCounter.current
          ) {
            return;
          }

          const message =
            error instanceof Error
              ? error.message
              : 'Unable to load data plans.';

          setPlans([]);
          setPlan(null);
          setPlansError(
            message,
          );
        } finally {
          if (
            requestId ===
            requestCounter.current
          ) {
            setPlansLoading(false);
          }
        }
      },
      [selectedTab],
    );

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
      setPlansLoading(false);
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

  useEffect(() => {
    return () => {
      requestCounter.current +=
        1;
    };
  }, []);

  const handleNetworkChange =
    (value: string) => {
      requestCounter.current +=
        1;

      setNetwork(
        String(value ?? '')
          .trim()
          .toLowerCase(),
      );

      setPlans([]);
      setPlan(null);
      setPlansError('');
      setStep(2);

      idempotencyKey.current =
        null;
    };

  const handlePhoneChange =
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

  const handleRetry =
    () => {
      if (
        !network ||
        !isValidNigerianNumber(
          phone.trim(),
        )
      ) {
        return;
      }

      void loadPlans(
        network,
        phone,
      );
    };

  const visiblePlans =
    plans.filter(
      item =>
        getPlanTab(item) ===
        selectedTab,
    );

  const canContinue =
    Boolean(
      selectedNetwork &&
        isValidNigerianNumber(
          phone.trim(),
        ),
    );

  const preparePurchase =
    () => {
      const targetPhone =
        phone.trim();

      const targetNetwork =
        selectedNetwork?.id
          ?.trim()
          .toLowerCase() ?? '';

      if (!targetNetwork) {
        toast.error(
          'Please select a network.',
        );
        return;
      }

      if (
        !isValidNigerianNumber(
          targetPhone,
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

      const planCode =
        String(
          plan.DataPlan ?? '',
        ).trim();

      const amount =
        getPrice(plan.Price);

      if (!planCode) {
        toast.error(
          'This data plan has no valid plan code.',
        );
        return;
      }

      if (
        !amount ||
        amount <= 0
      ) {
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

      if (isLoading) {
        return;
      }

      setPurchasePin('');
      setShowPurchasePin(true);
    };

  const handlePurchaseWithPin =
    async (
      pin: string,
    ) => {
      const targetPhone =
        phone.trim();

      const targetNetwork =
        selectedNetwork?.id
          ?.trim()
          .toLowerCase() ?? '';

      if (
        !targetNetwork ||
        !selectedNetwork
      ) {
        toast.error(
          'Please select a network.',
        );
        return;
      }

      if (
        !isValidNigerianNumber(
          targetPhone,
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

      const planCode =
        String(
          plan.DataPlan ?? '',
        ).trim();

      const planName =
        String(
          plan.DataPlanName ?? '',
        ).trim();

      const amount =
        getPrice(plan.Price);

      if (
        !planCode ||
        !amount ||
        amount <= 0
      ) {
        toast.error(
          'This data plan is invalid. Please select another plan.',
        );
        return;
      }

      if (
        balance < amount
      ) {
        toast.error(
          'Insufficient wallet balance. Please fund your wallet.',
        );

        setShowPurchasePin(
          false,
        );

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

      if (isLoading) {
        return;
      }

      const key =
        idempotencyKey.current ??
        makeIdempotencyKey();

      idempotencyKey.current =
        key;

      setIsLoading(true);

      try {
        const payload = {
          network:
            targetNetwork,

          phone:
            targetPhone,

          planCode,

          planName,

          planPrice:
            amount,

          purchasePin:
            pin,
        };

        const response =
          await fetch(
            '/api/purchase/data',
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
                JSON.stringify(
                  payload,
                ),
            },
          );

        let result:
          | {
              success?: boolean;
              pending?: boolean;
              requestId?: string;
              transactionId?: string;
              error?: string;
              status?: string;
              balance?: string | number;
              amount?: string | number;
              network?: string;
              phone?: string;
              planName?: string;
              price?: string | number;
              cashbackApplied?: boolean;
              cashbackAmount?: number;
            }
          | null =
          null;

        try {
          result =
            await response.json();
        } catch {
          result = null;
        }

        if (
          !response.ok
        ) {
          const errorCode =
            String(
              result?.error ??
                '',
            )
              .trim()
              .toLowerCase();

          if (
            errorCode ===
              'invalid_purchase_pin' ||
            errorCode ===
              'invalid_pin'
          ) {
            toast.error(
              'Invalid purchase PIN.',
            );
          } else if (
            errorCode ===
              'insufficient_balance'
          ) {
            toast.error(
              'Insufficient wallet balance.',
            );
          } else if (
            errorCode ===
              'duplicate_request'
          ) {
            toast.error(
              'This purchase request has already been processed.',
            );
          } else if (
            errorCode ===
              'transaction_pending'
          ) {
            toast.error(
              'This transaction is still pending. Please check your transaction history.',
            );
          } else if (
            errorCode ===
              'user_suspended'
          ) {
            toast.error(
              'Your account is suspended. Please contact support.',
            );
          } else {
            toast.error(
              result?.error ??
                'Data purchase failed. Please try again.',
            );
          }

          return;
        }

        if (
          result?.success !==
          true
        ) {
          toast.error(
            result?.error ??
              'Data purchase could not be completed.',
          );
          return;
        }

        const responseAmount =
          getPrice(
            result.amount ??
              result.price ??
              amount,
          );

        setShowPurchasePin(
          false,
        );

        setSuccessData({
          type: 'data',
          amount:
            responseAmount,
          phone:
            result.phone ??
            targetPhone,
          network:
            result.network ??
            targetNetwork,
          planName:
            result.planName ??
            planName ??
            'Data plan',
          reference:
            result.transactionId ??
            result.requestId ??
            key,
          status:
            result.pending
              ? 'pending'
              : 'success',
        });

        setShowSuccess(true);

        await Promise.allSettled([
          refreshWallet(),
          refreshCashbackWallet(),
        ]);

        setPurchasePin('');
        idempotencyKey.current =
          null;
      } catch (
        error
      ) {
        toast.error(
          error instanceof Error
            ? error.message
            : 'Network error. Please try again.',
        );
      } finally {
        setIsLoading(false);
      }
    };

  const handleSuccessClose =
    () => {
      setShowSuccess(false);
      setSuccessData(null);
      setStep(1);
      setPlan(null);
      setPlans([]);
      setNetwork('');
      setPhone('');
      setSelectedTab('SME');
      idempotencyKey.current =
        null;
    };

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      <div className="mx-auto w-full max-w-2xl px-4 py-5">
        <div className="flex items-center justify-between gap-3 mb-6">
          <button
            type="button"
            onClick={() => {
              if (step > 1) {
                setStep(
                  current =>
                    Math.max(
                      1,
                      current - 1,
                    ),
                );
              } else {
                setLocation('/');
              }
            }}
            className="w-10 h-10 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-white/5 transition-colors"
            aria-label="Go back"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="text-center">
            <h1 className="text-lg font-bold">
              Buy Data
            </h1>

            <p className="text-xs text-muted-foreground mt-0.5">
              Fast and reliable data bundles
            </p>
          </div>

          <div className="w-10" />
        </div>

        <div className="flex items-center gap-2 mb-6">
          {[1, 2, 3].map(item => (
            <React.Fragment key={item}>
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step >= item
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border text-muted-foreground'
                }`}
              >
                {item}
              </div>

              {item < 3 && (
                <div
                  className={`h-px flex-1 transition-colors ${
                    step > item
                      ? 'bg-primary'
                      : 'bg-border'
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </div>

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
            <div>
              <h2 className="text-base font-bold mb-3">
                Select Network
              </h2>

              <div className="grid grid-cols-2 gap-3">
                {networks.map(item => {
                  const selected =
                    network ===
                    item.id;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() =>
                        handleNetworkChange(
                          item.id,
                        )
                      }
                      className={`rounded-2xl border-2 p-4 text-left transition-all ${
                        selected
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-card hover:border-primary/40'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl ${item.color} ${item.text} flex items-center justify-center font-black text-xs`}
                        >
                          {item.name ===
                          '9mobile'
                            ? '9M'
                            : item.name
                                .slice(
                                  0,
                                  3,
                                )
                                .toUpperCase()}
                        </div>

                        {selected && (
                          <div className="w-5 h-5 rounded-full bg-primary text-white flex items-center justify-center">
                            ✓
                          </div>
                        )}
                      </div>

                      <p className="mt-3 text-sm font-bold">
                        {item.name}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h2 className="text-base font-bold mb-3">
                Recipient Phone Number
              </h2>

              <PhoneInputWithContacts
                value={phone}
                onChange={
                  handlePhoneChange
                }
                placeholder="08012345678"
              />
            </div>

            <Button
              type="button"
              disabled={!canContinue}
              onClick={() =>
                setStep(2)
              }
              className="w-full h-12 rounded-xl font-bold"
            >
              Continue
            </Button>
          </motion.div>
        )}

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
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold">
                  Select Data Plan
                </h2>

                <p className="text-xs text-muted-foreground mt-1">
                  {selectedNetwork?.name ??
                    'Network'}{' '}
                  · {phone}
                </p>
              </div>

              <button
                type="button"
                onClick={
                  handleRetry
                }
                disabled={
                  plansLoading
                }
                className="w-9 h-9 rounded-xl border border-border bg-card flex items-center justify-center hover:bg-white/5 transition-colors disabled:opacity-50"
                aria-label="Refresh plans"
              >
                <RefreshCw
                  className={`w-4 h-4 ${
                    plansLoading
                      ? 'animate-spin'
                      : ''
                  }`}
                />
              </button>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-1">
              {tabs.map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() =>
                    setSelectedTab(
                      tab,
                    )
                  }
                  className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap border transition-colors ${
                    selectedTab ===
                    tab
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card border-border text-muted-foreground'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {plansLoading ? (
              <div className="grid grid-cols-2 gap-3">
                {Array.from({
                  length: 6,
                }).map(
                  (_, index) => (
                    <div
                      key={index}
                      className="h-32 rounded-2xl border border-border bg-card animate-pulse"
                    />
                  ),
                )}
              </div>
            ) : plansError ? (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />

                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-400">
                      Unable to load plans
                    </p>

                    <p className="text-xs text-muted-foreground mt-1">
                      {plansError}
                    </p>

                    <button
                      type="button"
                      onClick={
                        handleRetry
                      }
                      className="mt-3 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {visiblePlans.length ===
                0 ? (
                  <div
                    className="
                      rounded-xl
                      border
                      border-border
                      p-6
                      text-center
                      text-sm
                      text-muted-foreground
                    "
                  >
                    No plans available
                    in this category.
                  </div>
                ) : (
                  <div
                    className="
                      grid
                      grid-cols-2
                      gap-3
                    "
                  >
                    {visiblePlans.map(
                      item => {
                        const selected =
                          plan?.DataPlan ===
                          item.DataPlan;

                        return (
                          <button
                            key={`${item.DataPlan}-${item.Price}`}
                            type="button"
                            onClick={() => {
                              setPlan(
                                item,
                              );
                              setStep(
                                3,
                              );
                            }}
                            className={`
                              rounded-2xl
                              border-2
                              p-4
                              text-left
                              transition
                              ${
                                selected
                                  ? 'border-primary bg-primary/5'
                                  : 'border-border'
                              }
                            `}
                          >
                            <p
                              className="
                                text-sm
                                font-bold
                              "
                            >
                              {String(
                                item.DataPlanName ??
                                  'Data plan',
                              )}
                            </p>

                            <p
                              className="
                                mt-1
                                text-xs
                                text-muted-foreground
                              "
                            >
                              {item.DataPlanName
                                ? 'Available plan'
                                : 'Available data plan'}
                            </p>

                            <p
                              className="
                                mt-3
                                text-base
                                font-extrabold
                              "
                            >
                              {formatPrice(
                                item.Price,
                              )}
                            </p>
                          </button>
                        );
                      },
                    )}
                  </div>
                )}
              </>
            )}

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setStep(1)
              }
              className="w-full h-11 rounded-xl"
            >
              Back
            </Button>
          </motion.div>
        )}

        {step === 3 && plan && (
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

              <p className="text-xs text-muted-foreground mt-1">
                Review the details before continuing.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4 space-y-4">
              <div className="flex items-center justify-between gap-4">
                <span
                  className="
                    text-sm
                    text-muted-foreground
                  "
                >
                  Network
                </span>

                <span
                  className="
                    text-right
                    text-sm
                    font-semibold
                  "
                >
                  {selectedNetwork?.name ??
                    network}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span
                  className="
                    text-sm
                    text-muted-foreground
                  "
                >
                  Phone
                </span>

                <span
                  className="
                    text-right
                    text-sm
                    font-semibold
                  "
                >
                  {phone}
                </span>
              </div>

              <div
                className="
                  flex
                  items-center
                  justify-between
                  gap-4
                "
              >
                <span
                  className="
                    text-sm
                    text-muted-foreground
                  "
                >
                  Data Plan
                </span>

                <span
                  className="
                    text-right
                    text-sm
                    font-semibold
                  "
                >
                  {plan?.DataPlanName ||
                    'Selected data plan'}
                </span>
              </div>

              <div
                className="
                  border-t
                  border-border
                  pt-4
                "
              >
                <div
                  className="
                    flex
                    items-center
                    justify-between
                    gap-4
                  "
                >
                  <span
                    className="
                      text-sm
                      font-medium
                    "
                  >
                    Amount
                  </span>

                  <span
                    className="
                      text-right
                      text-lg
                      font-extrabold
                    "
                  >
                    {formatPrice(
                      plan.Price,
                    )}
                  </span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-sm text-muted-foreground">
                  Wallet Balance
                </span>

                <span className="text-sm font-bold">
                  {formatPrice(
                    balance,
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4 mt-2">
                <span className="text-sm text-muted-foreground">
                  Balance After
                </span>

                <span className="text-sm font-bold">
                  {formatPrice(
                    Math.max(
                      0,
                      balance -
                        getPrice(
                          plan.Price,
                        ),
                    ),
                  )}
                </span>
              </div>
            </div>

            <Button
              type="button"
              disabled={isLoading}
              onClick={
                preparePurchase
              }
              className="w-full h-12 rounded-xl font-bold"
            >
              {isLoading
                ? 'Processing…'
                : 'Continue to PIN'}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={isLoading}
              onClick={() =>
                setStep(2)
              }
              className="w-full h-11 rounded-xl"
            >
              Back
            </Button>
          </motion.div>
        )}

        <div className="mt-6 rounded-2xl border border-border bg-card p-4">
          <div className="flex items-start gap-3">
            <Gift className="w-5 h-5 text-primary flex-shrink-0" />

            <div>
              <p className="text-sm font-semibold">
                Cashback available
              </p>

              <p className="text-xs text-muted-foreground mt-1">
                Eligible data purchases may receive cashback according to your current account and pricing rules.
              </p>
            </div>
          </div>
        </div>
      </div>

      {showPurchasePin && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm"
            onClick={() => {
              if (!isLoading) {
                setShowPurchasePin(
                  false,
                );
              }
            }}
          />

          <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 mx-auto max-w-sm rounded-2xl border border-border bg-[#0A1628] p-5 shadow-2xl">
            <h2 className="text-base font-bold">
              Enter Purchase PIN
            </h2>

            <p className="text-xs text-muted-foreground mt-1">
              Enter your 4-digit purchase PIN to complete this transaction.
            </p>

            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={purchasePin}
              onChange={event => {
                const value =
                  event.target.value.replace(
                    /\D/g,
                    '',
                  );

                setPurchasePin(
                  value,
                );
              }}
              placeholder="••••"
              className="mt-4 w-full h-12 rounded-xl border border-border bg-background px-4 text-center text-xl tracking-[0.5em] outline-none focus:border-primary"
            />

            <div className="grid grid-cols-2 gap-2 mt-4">
              <Button
                type="button"
                variant="outline"
                disabled={
                  isLoading
                }
                onClick={() =>
                  setShowPurchasePin(
                    false,
                  )
                }
                className="h-11 rounded-xl"
              >
                Cancel
              </Button>

              <Button
                type="button"
                disabled={
                  isLoading ||
                  !/^\d{4}$/.test(
                    purchasePin,
                  )
                }
                onClick={() =>
                  void handlePurchaseWithPin(
                    purchasePin,
                  )
                }
                className="h-11 rounded-xl font-bold"
              >
                {isLoading
                  ? 'Processing…'
                  : 'Confirm'}
              </Button>
            </div>
          </div>
        </>
      )}

      {showSuccess &&
        successData && (
          <SuccessModal
            open={showSuccess}
            onClose={
              handleSuccessClose
            }
            receipt={
              successData
            }
          />
        )}
    </div>
  );
}
