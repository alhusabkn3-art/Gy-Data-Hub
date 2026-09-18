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
        setPlans([]);
        setPlan(null);

        try {
          const result =
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

          const validPlans =
            Array.isArray(result)
              ? result.filter(
                  item =>
                    item &&
                    String(
                      item.DataPlan ?? '',
                    ).trim() &&
                    getPrice(
                      item.Price,
                    ) > 0,
                )
              : [];

          setPlans(
            validPlans,
          );

          if (
            validPlans.length ===
            0
          ) {
            setPlansError(
              'No data plans are available for this network right now.',
            );
            return;
          }

          const availableTabs =
            tabs.filter(tab =>
              validPlans.some(
                item =>
                  getPlanTab(
                    item,
                  ) === tab,
              ),
            );

          if (
            availableTabs.length >
              0 &&
            !availableTabs.includes(
              selectedTab,
            )
          ) {
            setSelectedTab(
              availableTabs[0],
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

          setPlansError(
            message ||
              'Unable to load data plans.',
          );
        } finally {
          if (
            requestId ===
            requestCounter.current
          ) {
            setPlansLoading(
              false,
            );
          }
        }
      },
      [selectedTab],
    );

  useEffect(() => {
    const valid =
      network &&
      isValidNigerianNumber(
        phone.trim(),
      );

    if (!valid) {
      requestCounter.current += 1;
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
    idempotencyKey.current =
      null;

    setPlan(null);
  }, [
    network,
    phone,
  ]);

  const handleNetwork =
    (networkId: string) => {
      requestCounter.current += 1;

      setNetwork(
        networkId
          .trim()
          .toLowerCase(),
      );

      setPlans([]);
      setPlan(null);
      setPlansError('');
      setSelectedTab('SME');

      if (step === 1) {
        setStep(2);
      }
    };

  const handlePhone =
    (value: string) => {
      requestCounter.current += 1;

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
            ).trim();

          if (
            response.status ===
              401 ||
            response.status ===
              403
          ) {
            throw new Error(
              'Your session has expired. Please log in again.',
            );
          }

          if (
            errorCode ===
              'INVALID_PURCHASE_PIN' ||
            errorCode ===
              'wrong_purchase_pin'
          ) {
            throw new Error(
              'Incorrect Purchase PIN.',
            );
          }

          if (
            errorCode ===
            'PURCHASE_PIN_REQUIRED'
          ) {
            throw new Error(
              'Purchase PIN is required for this transaction.',
            );
          }

          if (
            errorCode ===
              'PURCHASE_PIN_NOT_CONFIGURED' ||
            errorCode ===
              'purchase_pin_not_configured'
          ) {
            throw new Error(
              'Purchase PIN is not set. Please set your Purchase PIN from Profile first.',
            );
          }

          throw new Error(
            errorCode ||
              `Purchase failed (${response.status}).`,
          );
        }

        const status =
          String(
            result?.status ??
              '',
          )
            .trim()
            .toLowerCase();

        if (
          result?.pending ===
            true ||
          status === 'pending'
        ) {
          setShowPurchasePin(
            false,
          );

          setPurchasePin(
            '',
          );

          toast.info(
            'Transaction is being processed. Please check your transaction history.',
          );

          return;
        }

        if (
          !result?.success
        ) {
          if (
            result?.error ===
            'previous_attempt_failed'
          ) {
            idempotencyKey.current =
              null;

            toast.error(
              'The previous attempt failed. Tap Pay again to retry.',
            );
          } else {
            toast.error(
              result?.error ||
                'Transaction failed. Please try again.',
            );
          }

          return;
        }

        idempotencyKey.current =
          null;

        setShowPurchasePin(
          false,
        );

        setPurchasePin(
          '',
        );

        await Promise.allSettled(
          [
            refreshWallet(),
            refreshCashbackWallet(),
          ],
        );

        /*
         * IMPORTANT:
         * TransactionReceipt expects a complete ReceiptData object.
         * Always provide safe string/number values so a successful
         * purchase can never crash the receipt and produce a white screen.
         */
        const receiptDescription =
          planName ||
          String(
            result?.planName ??
              '',
          ).trim() ||
          `${selectedNetwork.name} Data`;

        const receiptService =
          String(
            result?.network ??
              targetNetwork ??
              '',
          ).trim() ||
          selectedNetwork.name;

        const receiptTransactionId =
          String(
            result?.transactionId ??
              result?.requestId ??
              '',
          ).trim();

        const receiptAmount =
          getPrice(
            result?.amount ??
              result?.price ??
              amount,
          );

        const receipt =
          {
            type: 'data',

            provider:
              selectedNetwork.name,

            service:
              receiptService,

            network:
              selectedNetwork.name,

            phone:
              targetPhone,

            amount:
              receiptAmount,

            planName:
              receiptDescription,

            description:
              receiptDescription,

            status:
              String(
                result?.status ??
                  'success',
              ).trim() ||
              'success',

            transactionId:
              receiptTransactionId,

            txnId:
              receiptTransactionId,

            date:
              new Date().toISOString(),
          } as ReceiptData;

        setSuccessData(
          receipt,
        );

        setShowSuccess(
          true,
        );

        toast.success(
          'Data purchase successful.',
        );
      } catch (
        error
      ) {
        const message =
          error instanceof Error
            ? error.message
            : 'Data purchase failed. Please try again.';

        toast.error(
          message,
        );
      } finally {
        setIsLoading(
          false,
        );
      }
    };

  return (
    <motion.div
      initial={{
        opacity: 0,
        x: 20,
      }}
      animate={{
        opacity: 1,
        x: 0,
      }}
      className="
        min-h-screen
        bg-background
        pb-24
      "
    >
      <div
        className="
          sticky
          top-0
          z-20
          bg-background
          border-b
          border-border
        "
      >
        <div
          className="
            flex
            items-center
            gap-3
            px-4
            py-4
          "
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              setLocation('/')
            }
          >
            <ChevronLeft
              className="h-5 w-5"
            />
          </Button>

          <div>
            <h1
              className="
                text-lg
                font-bold
              "
            >
              Buy Data
            </h1>

            <p
              className="
                text-xs
                text-muted-foreground
              "
            >
              Choose a network and
              data plan
            </p>
          </div>
        </div>
      </div>

      <div
        className="
          mx-auto
          w-full
          max-w-2xl
          px-4
          py-6
        "
      >
        <div
          className="
            mb-6
            flex
            items-center
            justify-between
          "
        >
          <div
            className="
              flex
              items-center
              gap-2
            "
          >
            <div
              className={`
                flex
                h-8
                w-8
                items-center
                justify-center
                rounded-full
                text-sm
                font-bold
                ${
                  step >= 1
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }
              `}
            >
              1
            </div>

            <div
              className="
                h-px
                w-8
                bg-border
              "
            />

            <div
              className={`
                flex
                h-8
                w-8
                items-center
                justify-center
                rounded-full
                text-sm
                font-bold
                ${
                  step >= 2
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }
              `}
            >
              2
            </div>

            <div
              className="
                h-px
                w-8
                bg-border
              "
            />

            <div
              className={`
                flex
                h-8
                w-8
                items-center
                justify-center
                rounded-full
                text-sm
                font-bold
                ${
                  step >= 3
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }
              `}
            >
              3
            </div>
          </div>

          <div
            className="
              text-right
            "
          >
            <p
              className="
                text-xs
                text-muted-foreground
              "
            >
              Wallet Balance
            </p>

            <p
              className="
                text-sm
                font-bold
              "
            >
              {formatPrice(balance)}
            </p>
          </div>
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
            className="
              space-y-6
            "
          >
            <div>
              <h2
                className="
                  text-xl
                  font-bold
                "
              >
                Select Network
              </h2>

              <p
                className="
                  mt-1
                  text-sm
                  text-muted-foreground
                "
              >
                Choose the network you
                want to buy data for.
              </p>
            </div>

            <div
              className="
                grid
                grid-cols-2
                gap-3
              "
            >
              {networks.map(
                item => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      handleNetwork(
                        item.id,
                      )
                    }
                    className={`
                      flex
                      min-h-[90px]
                      flex-col
                      items-center
                      justify-center
                      rounded-2xl
                      border-2
                      transition
                      ${
                        network ===
                        item.id
                          ? 'border-primary ring-2 ring-primary/20'
                          : 'border-border'
                      }
                    `}
                  >
                    <div
                      className={`
                        flex
                        h-12
                        w-12
                        items-center
                        justify-center
                        rounded-full
                        ${item.color}
                        ${item.text}
                        text-sm
                        font-extrabold
                      `}
                    >
                      {item.name
                        .slice(
                          0,
                          2,
                        )
                        .toUpperCase()}
                    </div>

                    <span
                      className="
                        mt-2
                        text-sm
                        font-semibold
                      "
                    >
                      {item.name}
                    </span>
                  </button>
                ),
              )}
            </div>
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
            className="
              space-y-6
            "
          >
            <div>
              <h2
                className="
                  text-xl
                  font-bold
                "
              >
                Enter Phone Number
              </h2>

              <p
                className="
                  mt-1
                  text-sm
                  text-muted-foreground
                "
              >
                Enter the phone number
                that will receive the
                data.
              </p>
            </div>

            <PhoneInputWithContacts
              value={phone}
              onChange={
                handlePhone
              }
            />

            {plansLoading && (
              <div
                className="
                  flex
                  items-center
                  justify-center
                  gap-2
                  py-6
                  text-sm
                  text-muted-foreground
                "
              >
                <RefreshCw
                  className="
                    h-4
                    w-4
                    animate-spin
                  "
                />
                Loading data plans...
              </div>
            )}

            {plansError && (
              <div
                className="
                  rounded-xl
                  border
                  border-destructive/20
                  bg-destructive/5
                  p-4
                "
              >
                <div
                  className="
                    flex
                    items-start
                    gap-3
                  "
                >
                  <AlertCircle
                    className="
                      mt-0.5
                      h-5
                      w-5
                      shrink-0
                      text-destructive
                    "
                  />

                  <div
                    className="
                      flex-1
                    "
                  >
                    <p
                      className="
                        text-sm
                        font-medium
                      "
                    >
                      {plansError}
                    </p>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="
                        mt-3
                      "
                      onClick={
                        handleRetry
                      }
                    >
                      <RefreshCw
                        className="
                          mr-2
                          h-4
                          w-4
                        "
                      />
                      Retry
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {canContinue &&
              !plansLoading &&
              plans.length > 0 && (
                <div
                  className="
                    space-y-4
                  "
                >
                  <div
                    className="
                      flex
                      gap-2
                      overflow-x-auto
                      pb-1
                    "
                  >
                    {tabs
                      .filter(
                        tab =>
                          plans.some(
                            item =>
                              getPlanTab(
                                item,
                              ) ===
                              tab,
                          ),
                      )
                      .map(
                        tab => (
                          <button
                            key={tab}
                            type="button"
                            onClick={() =>
                              setSelectedTab(
                                tab,
                              )
                            }
                            className={`
                              whitespace-nowrap
                              rounded-full
                              px-4
                              py-2
                              text-xs
                              font-semibold
                              transition
                              ${
                                selectedTab ===
                                tab
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-muted text-muted-foreground'
                              }
                            `}
                          >
                            {tab ===
                            'GIFTING' ? (
                              <span
                                className="
                                  inline-flex
                                  items-center
                                  gap-1
                                "
                              >
                                <Gift
                                  className="
                                    h-3
                                    w-3
                                  "
                                />
                                {tab}
                              </span>
                            ) : (
                              tab
                            )}
                          </button>
                        ),
                      )}
                  </div>

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
                                    item.DataPlan ??
                                    '',
                                )}
                              </p>

                              <p
                                className="
                                  mt-1
                                  text-xs
                                  text-muted-foreground
                                "
                              >
                                {String(
                                  item.DataPlan ??
                                    '',
                                )}
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
                </div>
              )}

            <Button
              type="button"
              variant="outline"
              className="
                w-full
              "
              onClick={() =>
                setStep(1)
              }
            >
              <ChevronLeft
                className="
                  mr-2
                  h-4
                  w-4
                "
              />
              Back
            </Button>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div
            initial={{
              opacity: 0,
              y: 10,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            className="
              space-y-6
            "
          >
            <div>
              <h2
                className="
                  text-xl
                  font-bold
                "
              >
                Confirm Purchase
              </h2>

              <p
                className="
                  mt-1
                  text-sm
                  text-muted-foreground
                "
              >
                Review the transaction
                before payment.
              </p>
            </div>

            <div
              className="
                rounded-2xl
                border
                border-border
                bg-card
                p-5
              "
            >
              <div
                className="
                  space-y-4
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
                      text-muted-foreground
                    "
                  >
                    Network
                  </span>

                  <span
                    className="
                      text-sm
                      font-semibold
                    "
                  >
                    {selectedNetwork?.name ||
                      network}
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
                    Phone
                  </span>

                  <span
                    className="
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
                      plan?.DataPlan ||
                      ''}
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
                        text-lg
                        font-extrabold
                      "
                    >
                      {formatPrice(
                        plan?.Price ??
                          0,
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="
                flex
                gap-3
              "
            >
              <Button
                type="button"
                variant="outline"
                className="
                  flex-1
                "
                onClick={() =>
                  setStep(2)
                }
              >
                <ChevronLeft
                  className="
                    mr-2
                    h-4
                    w-4
                  "
                />
                Back
              </Button>

              <Button
                type="button"
                className="
                  flex-1
                "
                disabled={
                  isLoading ||
                  !plan
                }
                onClick={
                  preparePurchase
                }
              >
                {isLoading
                  ? 'Processing...'
                  : 'Continue'}
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      <SuccessModal
        open={showSuccess}
        onOpenChange={
          setShowSuccess
        }
        data={successData}
      />

      {showPurchasePin && (
        <div
          className="
            fixed
            inset-0
            z-50
            flex
            items-center
            justify-center
            bg-black/50
            px-4
          "
        >
          <div
            className="
              w-full
              max-w-sm
              rounded-2xl
              bg-background
              p-6
              shadow-xl
            "
          >
            <div
              className="
                mb-5
              "
            >
              <h2
                className="
                  text-lg
                  font-bold
                "
              >
                Enter Purchase PIN
              </h2>

              <p
                className="
                  mt-1
                  text-sm
                  text-muted-foreground
                "
              >
                Enter your 4-digit
                Purchase PIN to complete
                this transaction.
              </p>
            </div>

            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={purchasePin}
              onChange={event =>
                setPurchasePin(
                  event.target.value.replace(
                    /\D/g,
                    '',
                  ),
                )
              }
              className="
                h-12
                w-full
                rounded-xl
                border
                border-input
                bg-background
                px-4
                text-center
                text-xl
                font-bold
                tracking-[0.5em]
                outline-none
                focus:ring-2
                focus:ring-primary
              "
              placeholder="••••"
              autoFocus
              disabled={isLoading}
              onKeyDown={event => {
                if (
                  event.key ===
                    'Enter' &&
                  purchasePin.length ===
                    4 &&
                  !isLoading
                ) {
                  void handlePurchaseWithPin(
                    purchasePin,
                  );
                }
              }}
            />

            <div
              className="
                mt-5
                flex
                gap-3
              "
            >
              <Button
                type="button"
                variant="outline"
                className="
                  flex-1
                "
                disabled={isLoading}
                onClick={() => {
                  setShowPurchasePin(
                    false,
                  );
                  setPurchasePin('');
                }}
              >
                Cancel
              </Button>

              <Button
                type="button"
                className="
                  flex-1
                "
                disabled={
                  isLoading ||
                  purchasePin.length !==
                    4
                }
                onClick={() =>
                  void handlePurchaseWithPin(
                    purchasePin,
                  )
                }
              >
                {isLoading
                  ? 'Processing...'
                  : 'Pay Now'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
