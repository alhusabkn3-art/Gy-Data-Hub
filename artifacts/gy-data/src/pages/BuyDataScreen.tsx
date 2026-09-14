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

  const handlePurchase =
    async () => {
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

      const planName =
        String(
          plan.DataPlanName ?? '',
        ).trim();

      const amount =
        getPrice(plan.Price);

      if (!planCode) {
        toast.error(
          'This data plan has no valid plan code.',
        );
        return;
      }

      if (!amount || amount <= 0) {
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

      if (
        isLoading
      ) {
        return;
      }

      const key =
        idempotencyKey.current ??
        makeIdempotencyKey();

      idempotencyKey.current =
        key;

      setIsLoading(true);

      try {
        /*
         * IMPORTANT:
         * Send the purchase directly to the
         * backend with an explicit JSON body.
         *
         * This prevents the purchase request from
         * reaching /api/purchase/data with empty
         * network/phone/plan values.
         */
        const payload = {
          network:
            targetNetwork,
          phone:
            targetPhone,
          planCode,
          planName,
          planPrice:
            amount,
        };

        const response =
          await fetch(
            '/api/purchase/data',
            {
              method: 'POST',
              credentials: 'include',
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
              error?: string;
              status?: string;
              balance?: string;
              amount?: string;
              network?: string;
              phone?: string;
              planName?: string;
              price?: string;
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

        if (!response.ok) {
          throw new Error(
            result?.error ||
              `Purchase failed (${response.status}).`,
          );
        }

        if (
          result?.pending
        ) {
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

        await Promise.allSettled(
          [
            refreshWallet(),
            refreshCashbackWallet(),
          ],
        );

        const receipt =
          {
            type: 'data',
            provider:
              selectedNetwork.name,
            network:
              selectedNetwork.name,
            phone:
              targetPhone,
            amount:
              amount.toString(),
            planName:
              planName,
            status:
              result.status ||
              'success',
            transactionId:
              result.requestId ||
              '',
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
        setIsLoading(false);
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
      <div className="
        sticky
        top-0
        z-20
        bg-background
        border-b
        border-border
      ">
        <div className="
          flex
          items-center
          gap-3
          px-4
          py-4
        ">
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
            <h1 className="
              text-lg
              font-bold
            ">
              Buy Data
            </h1>

            <p className="
              text-xs
              text-muted-foreground
            ">
              Choose a network and
              data plan
            </p>
          </div>
        </div>
      </div>

      <div className="
        max-w-xl
        mx-auto
        px-4
        py-5
        space-y-5
      ">
        {/* STEP 1 */}
        <section className="
          rounded-2xl
          border
          border-border
          bg-card
          p-4
          shadow-sm
        ">
          <div className="
            flex
            items-center
            justify-between
            mb-4
          ">
            <div>
              <p className="
                text-xs
                text-muted-foreground
              ">
                Step 1
              </p>

              <h2 className="
                font-bold
              ">
                Select Network
              </h2>
            </div>
          </div>

          <div className="
            grid
            grid-cols-2
            gap-3
          ">
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
                    h-14
                    rounded-xl
                    font-bold
                    transition
                    ${item.color}
                    ${item.text}
                    ${
                      network ===
                      item.id
                        ? 'ring-4 ring-primary/30 scale-[1.02]'
                        : ''
                    }
                  `}
                >
                  {item.name}
                </button>
              ),
            )}
          </div>
        </section>

        {/* STEP 2 */}
        <section className="
          rounded-2xl
          border
          border-border
          bg-card
          p-4
          shadow-sm
        ">
          <div className="
            mb-4
          ">
            <p className="
              text-xs
              text-muted-foreground
            ">
              Step 2
            </p>

            <h2 className="
              font-bold
            ">
              Phone Number
            </h2>
          </div>

          <PhoneInputWithContacts
            value={phone}
            onChange={
              handlePhone
            }
          />

          {!network && (
            <div className="
              mt-3
              rounded-xl
              bg-muted
              p-3
              text-sm
              text-muted-foreground
            ">
              Select a network first.
            </div>
          )}

          {network &&
            phone &&
            !isValidNigerianNumber(
              phone.trim(),
            ) && (
              <div className="
                mt-3
                flex
                gap-2
                rounded-xl
                bg-destructive/10
                p-3
                text-sm
                text-destructive
              ">
                <AlertCircle
                  className="
                    h-4
                    w-4
                    shrink-0
                    mt-0.5
                  "
                />

                <span>
                  Enter a valid
                  Nigerian phone
                  number.
                </span>
              </div>
            )}
        </section>

        {/* STEP 3 */}
        {canContinue && (
          <section className="
            rounded-2xl
            border
            border-border
            bg-card
            p-4
            shadow-sm
          ">
            <div className="
              flex
              items-center
              justify-between
              mb-4
            ">
              <div>
                <p className="
                  text-xs
                  text-muted-foreground
                ">
                  Step 3
                </p>

                <h2 className="
                  font-bold
                ">
                  Choose Data Plan
                </h2>
              </div>

              <button
                type="button"
                onClick={
                  handleRetry
                }
                disabled={
                  plansLoading
                }
                className="
                  rounded-lg
                  p-2
                  hover:bg-muted
                "
              >
                <RefreshCw
                  className={`
                    h-4
                    w-4
                    ${
                      plansLoading
                        ? 'animate-spin'
                        : ''
                    }
                  `}
                />
              </button>
            </div>

            {plansLoading && (
              <div className="
                py-8
                text-center
                text-sm
                text-muted-foreground
              ">
                Loading available
                data plans…
              </div>
            )}

            {!plansLoading &&
              plansError && (
                <div className="
                  rounded-xl
                  bg-destructive/10
                  p-4
                  text-sm
                  text-destructive
                ">
                  <div className="
                    flex
                    gap-2
                    items-start
                  ">
                    <AlertCircle
                      className="
                        h-5
                        w-5
                        shrink-0
                      "
                    />

                    <span>
                      {plansError}
                    </span>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    className="
                      mt-3
                      w-full
                    "
                    onClick={
                      handleRetry
                    }
                  >
                    Try Again
                  </Button>
                </div>
              )}

            {!plansLoading &&
              !plansError &&
              plans.length >
                0 && (
                <>
                  <div className="
                    grid
                    grid-cols-3
                    gap-2
                    mb-4
                  ">
                    {tabs.map(
                      tab => {
                        const count =
                          plans.filter(
                            item =>
                              getPlanTab(
                                item,
                              ) ===
                              tab,
                          ).length;

                        if (
                          count ===
                          0
                        ) {
                          return null;
                        }

                        return (
                          <button
                            key={tab}
                            type="button"
                            onClick={() => {
                              setSelectedTab(
                                tab,
                              );
                              setPlan(
                                null,
                              );
                            }}
                            className={`
                              rounded-lg
                              px-2
                              py-2
                              text-xs
                              font-semibold
                              border
                              ${
                                selectedTab ===
                                tab
                                  ? 'bg-primary text-primary-foreground border-primary'
                                  : 'bg-background border-border'
                              }
                            `}
                          >
                            {tab}
                          </button>
                        );
                      },
                    )}
                  </div>

                  {visiblePlans.length ===
                    0 ? (
                    <div className="
                      py-8
                      text-center
                      text-sm
                      text-muted-foreground
                    ">
                      No plans available
                      in this category.
                    </div>
                  ) : (
                    <div className="
                      grid
                      grid-cols-2
                      gap-3
                    ">
                      {visiblePlans.map(
                        item => {
                          const amount =
                            getPrice(
                              item.Price,
                            );

                          const selected =
                            plan?.DataPlan ===
                            item.DataPlan;

                          return (
                            <button
                              key={`${item.DataPlan}-${item.DataPlanName}`}
                              type="button"
                              onClick={() =>
                                setPlan(
                                  item,
                                )
                              }
                              className={`
                                text-left
                                rounded-xl
                                border
                                p-4
                                transition
                                ${
                                  selected
                                    ? 'border-primary ring-2 ring-primary/20 bg-primary/5'
                                    : 'border-border bg-background'
                                }
                              `}
                            >
                              <div className="
                                flex
                                items-start
                                justify-between
                                gap-2
                              ">
                                <div>
                                  <p className="
                                    font-bold
                                    text-base
                                  ">
                                    {item.DataPlanName}
                                  </p>

                                  <p className="
                                    mt-1
                                    text-xs
                                    text-muted-foreground
                                  ">
                                    {
                                      item.DataPlanType
                                    }
                                  </p>
                                </div>

                                {item.DataPlanType
                                  ?.toUpperCase()
                                  .includes(
                                    'GIFT',
                                  ) && (
                                  <Gift
                                    className="
                                      h-4
                                      w-4
                                      text-primary
                                    "
                                  />
                                )}
                              </div>

                              <p className="
                                mt-4
                                font-bold
                                text-primary
                              ">
                                {formatPrice(
                                  amount,
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
          </section>
        )}

        {/* PAYMENT */}
        {plan &&
          selectedNetwork && (
            <section className="
              rounded-2xl
              border
              border-border
              bg-card
              p-4
              shadow-sm
            ">
              <h2 className="
                font-bold
                mb-4
              ">
                Confirm Purchase
              </h2>

              <div className="
                rounded-xl
                bg-muted/50
                p-4
                space-y-3
                mb-4
              ">
                <div className="
                  flex
                  justify-between
                  gap-4
                ">
                  <span className="
                    text-muted-foreground
                  ">
                    Network
                  </span>

                  <span className="
                    font-semibold
                  ">
                    {
                      selectedNetwork.name
                    }
                  </span>
                </div>

                <div className="
                  flex
                  justify-between
                  gap-4
                ">
                  <span className="
                    text-muted-foreground
                  ">
                    Number
                  </span>

                  <span className="
                    font-semibold
                  ">
                    {phone}
                  </span>
                </div>

                <div className="
                  flex
                  justify-between
                  gap-4
                ">
                  <span className="
                    text-muted-foreground
                  ">
                    Plan
                  </span>

                  <span className="
                    font-semibold
                    text-right
                    max-w-[60%]
                  ">
                    {
                      plan.DataPlanName
                    }
                  </span>
                </div>

                <div className="
                  border-t
                  border-border
                  pt-3
                  flex
                  justify-between
                ">
                  <span className="
                    text-muted-foreground
                  ">
                    Total
                  </span>

                  <span className="
                    text-lg
                    font-bold
                    text-primary
                  ">
                    {formatPrice(
                      plan.Price,
                    )}
                  </span>
                </div>

                <div className="
                  flex
                  justify-between
                  text-sm
                ">
                  <span className="
                    text-muted-foreground
                  ">
                    Wallet Balance
                  </span>

                  <span className="
                    font-semibold
                  ">
                    {formatPrice(
                      balance,
                    )}
                  </span>
                </div>
              </div>

              <Button
                type="button"
                className="
                  w-full
                  h-12
                  rounded-xl
                  text-base
                  font-bold
                "
                disabled={
                  isLoading ||
                  balance <
                    getPrice(
                      plan.Price,
                    )
                }
                onClick={
                  handlePurchase
                }
              >
                {isLoading
                  ? 'Processing…'
                  : `Pay ${formatPrice(
                      plan.Price,
                    )}`}
              </Button>
            </section>
          )}
      </div>

      {successData && (
        <SuccessModal
          open={
            showSuccess
          }
          onOpenChange={
            setShowSuccess
          }
          receipt={
            successData
          }
          onDone={() =>
            setLocation('/')
          }
        />
      )}
    </motion.div>
  );
}
