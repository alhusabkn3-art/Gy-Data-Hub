import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
} from 'react';

import { motion } from 'framer-motion';

import {
  ChevronLeft,
  RefreshCw,
  AlertCircle,
  Gift,
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
  const type = normalizePlanType(
    plan.DataPlanType,
  );

  if (type.includes('CORPORATE')) {
    return 'CORPORATE GIFTING';
  }

  if (type.includes('GIFT')) {
    return 'GIFTING';
  }

  return 'SME';
}

function formatPrice(
  value: string,
): string {
  const amount = parseFloat(value);

  if (Number.isNaN(amount)) {
    return '₦0';
  }

  return `₦${amount.toLocaleString()}`;
}

export default function BuyDataScreen() {
  const [, setLocation] =
    useLocation();

  const {
    purchaseData,
    balance,
  } = useAppContext();

  const [step, setStep] =
    useState(1);

  const [network, setNetwork] =
    useState('');

  const [phone, setPhone] =
    useState('');

  const [plan, setPlan] =
    useState<DataPlan | null>(null);

  const [plans, setPlans] =
    useState<DataPlan[]>([]);

  const [plansLoading, setPlansLoading] =
    useState(false);

  const [plansError, setPlansError] =
    useState('');

  const [selectedTab, setSelectedTab] =
    useState<PlanTab>('SME');

  const [isLoading, setIsLoading] =
    useState(false);

  const [showSuccess, setShowSuccess] =
    useState(false);

  const [successData, setSuccessData] =
    useState<ReceiptData | null>(null);

  const idempotencyKey =
    useRef<string | null>(null);

  useEffect(() => {
    idempotencyKey.current = null;
  }, [network, phone, plan]);

  const selectedNetwork =
    networks.find(
      (n) => n.id === network,
    );

  // ============================================================
  // LOAD DATA PLANS
  // ============================================================

  const loadPlans = useCallback(
    async (
      net: string,
      targetPhone: string,
    ) => {
      const normalizedPhone =
        targetPhone.trim();

      if (
        !isValidNigerianNumber(
          normalizedPhone,
        )
      ) {
        setPlans([]);
        setPlansError(
          'Enter a valid Nigerian phone number first.',
        );
        return;
      }

      setPlansLoading(true);
      setPlansError('');
      setPlans([]);
      setPlan(null);

      try {
        /*
         * IMPORTANT:
         * Keep the existing API/service.
         * Network + phone are passed exactly as before.
         */
        const fetched =
          await fetchDataPlans(
            net,
            normalizedPhone,
          );

        if (fetched.length === 0) {
          setPlansError(
            'No plans available for this network right now.',
          );
        } else {
          setPlans(fetched);

          const availableTabs =
            tabs.filter((tab) =>
              fetched.some(
                (p) =>
                  getPlanTab(p) ===
                  tab,
              ),
            );

          if (
            availableTabs.length > 0 &&
            !availableTabs.includes(
              selectedTab,
            )
          ) {
            setSelectedTab(
              availableTabs[0],
            );
          }
        }
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Failed to load plans';

        setPlansError(
          msg
            .toLowerCase()
            .includes('credentials') ||
          msg.includes('503')
            ? 'Service temporarily unavailable. Check back shortly.'
            : 'Could not load data plans. Please try again.',
        );
      } finally {
        setPlansLoading(false);
      }
    },
    [selectedTab],
  );

  // ============================================================
  // NETWORK
  // ============================================================

  const handleNetworkSelect = (
    netId: string,
  ) => {
    setNetwork(netId);
    setPlans([]);
    setPlan(null);
    setPlansError('');
    setSelectedTab('SME');

    if (step === 1) {
      setStep(2);
    }
  };

  // ============================================================
  // PURCHASE
  // ============================================================

  const handlePurchase =
    async () => {
      if (
        !plan ||
        !selectedNetwork
      ) {
        return;
      }

      const planPrice =
        parseFloat(plan.Price);

      if (
        Number.isNaN(planPrice) ||
        balance < planPrice
      ) {
        toast.error(
          'Insufficient wallet balance. Please fund your wallet.',
        );
        return;
      }

      if (
        !isValidNigerianNumber(phone)
      ) {
        toast.error(
          'Please enter a valid Nigerian phone number.',
        );
        return;
      }

      if (
        !idempotencyKey.current
      ) {
        idempotencyKey.current =
          `GY-DAT-${Date.now()
            .toString(36)
            .toUpperCase()}-${Math.random()
            .toString(36)
            .slice(2, 8)
            .toUpperCase()}`;
      }

      setIsLoading(true);

      try {
        const result =
          await purchaseData({
            network:
              selectedNetwork.id,

            phone,

            planCode:
              plan.DataPlan,

            planName:
              plan.DataPlanName,

            planPrice:
              plan.Price,

            idempotencyKey:
              idempotencyKey.current,
          });

        if (result.pending) {
          toast.info(
            'Transaction is being processed. Check your transaction history shortly.',
          );
          return;
        }

        if (!result.success) {
          if (
            result.error ===
            'previous_attempt_failed'
          ) {
            idempotencyKey.current =
              null;

            toast.error(
              'Previous attempt failed. Tap "Pay" again to retry.',
            );
          } else {
            toast.error(
              result.error ??
                'Transaction failed. Please try again.',
            );
          }

          return;
        }

        idempotencyKey.current =
          null;

        const now =
          new Date();

        setSuccessData({
          type: 'data',

          provider:
            selectedNetwork.name,

          service: 'Data',

          description: `${
            selectedNetwork.name
          } ${
            result.planName ??
            plan.DataPlanName
          }`,

          amount: planPrice,

          date:
            now.toLocaleDateString(
              'en-GB',
              {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              },
            ),

          time:
            now.toLocaleTimeString(
              'en-US',
              {
                hour: '2-digit',
                minute: '2-digit',
              },
            ),

          status: 'success',

          txnId:
            result.requestId,

          paymentMethod:
            'Wallet',

          cashbackAmount:
            result.cashbackAmount,
        });

        setShowSuccess(true);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Purchase failed';

        toast.error(
          msg
            .toLowerCase()
            .includes('503')
            ? 'Service temporarily unavailable.'
            : msg,
        );
      } finally {
        setIsLoading(false);
      }
    };

  // ============================================================
  // FILTER PLANS
  // ============================================================

  const filteredPlans =
    plans.filter(
      (p) =>
        getPlanTab(p) ===
        selectedTab,
    );

  /*
   * If the API does not provide a recognizable
   * plan type, show all plans under SME.
   */
  const displayPlans =
    filteredPlans.length > 0
      ? filteredPlans
      : selectedTab === 'SME'
        ? plans
        : [];

  // ============================================================
  // UI
  // ============================================================

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
      exit={{
        opacity: 0,
        x: -20,
      }}
      className="
        min-h-screen
        bg-[#f4f5f9]
        max-w-md
        mx-auto
        relative
        overflow-x-hidden
      "
    >

      {/* ======================================================
          HEADER
      ======================================================= */}

      <div className="bg-primary text-white px-5 pt-5 pb-6">
        <div className="flex items-center gap-4">

          <button
            type="button"
            onClick={() => {
              if (step > 1) {
                setStep(step - 1);
              } else {
                setLocation('/');
              }
            }}
            className="
              w-11
              h-11
              rounded-full
              bg-white/15
              flex
              items-center
              justify-center
              active:scale-95
              transition-transform
            "
          >
            <ChevronLeft className="w-6 h-6" />
          </button>

          <h1 className="text-2xl font-bold">
            Data
          </h1>

        </div>
      </div>

      <div className="px-4 pb-36">

        {/* ====================================================
            STEP 1 — NETWORK
        ===================================================== */}

        <div className="pt-5">

          <h2 className="
            text-sm
            font-bold
            text-muted-foreground
            uppercase
            tracking-wider
            mb-3
          ">
            Select Network
          </h2>

          <div className="grid grid-cols-4 gap-2">

            {networks.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() =>
                  handleNetworkSelect(
                    n.id,
                  )
                }
                className={`
                  bg-white
                  rounded-2xl
                  p-2.5
                  border-2
                  transition-all
                  active:scale-95

                  ${
                    network === n.id
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent'
                  }
                `}
              >

                <div
                  className={`
                    mx-auto
                    w-11
                    h-11
                    rounded-full
                    flex
                    items-center
                    justify-center
                    font-bold
                    text-sm
                    ${n.color}
                    ${n.text}
                  `}
                >
                  {n.name[0]}
                </div>

                <span className="
                  block
                  text-[11px]
                  font-semibold
                  mt-1.5
                ">
                  {n.name}
                </span>

              </button>
            ))}

          </div>
        </div>

        {/* ====================================================
            STEP 2 — PHONE
        ===================================================== */}

        {step >= 2 && (
          <motion.div
            initial={{
              opacity: 0,
              y: 10,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            className="mt-6"
          >

            <PhoneInputWithContacts
              value={phone}
              onChange={setPhone}
              label="Phone Number"
            />

            {isValidNigerianNumber(
              phone,
            ) &&
              step === 2 && (
                <Button
                  type="button"
                  className="
                    w-full
                    mt-4
                    h-12
                    rounded-xl
                    font-bold
                  "
                  onClick={() => {
                    setStep(3);

                    void loadPlans(
                      network,
                      phone,
                    );
                  }}
                  disabled={
                    plansLoading
                  }
                >
                  {plansLoading
                    ? 'Loading Plans...'
                    : 'Continue'}
                </Button>
              )}

          </motion.div>
        )}

        {/* ====================================================
            STEP 3 — DATA PLANS
        ===================================================== */}

        {step >= 3 &&
          isValidNigerianNumber(
            phone,
          ) && (
            <motion.div
              initial={{
                opacity: 0,
                y: 10,
              }}
              animate={{
                opacity: 1,
                y: 0,
              }}
              className="mt-6"
            >

              {/* CATEGORY CONTAINER */}

              <div className="
                bg-white
                rounded-b-[30px]
                rounded-t-[18px]
                px-4
                pt-4
                pb-5
                mb-6
                shadow-sm
              ">

                <div className="
                  flex
                  items-center
                  justify-between
                  mb-4
                ">

                  <h2 className="
                    text-base
                    font-bold
                    text-primary
                  ">
                    Data Plans
                  </h2>

                  {!plansLoading && (
                    <button
                      type="button"
                      onClick={() =>
                        loadPlans(
                          network,
                          phone,
                        )
                      }
                      className="
                        text-xs
                        text-primary
                        font-semibold
                        flex
                        items-center
                        gap-1
                      "
                    >
                      <RefreshCw className="w-3 h-3" />
                      Refresh
                    </button>
                  )}

                </div>

                {/* TABS */}

                <div className="
                  flex
                  flex-wrap
                  gap-3
                ">

                  {tabs.map((tab) => {

                    const hasPlans =
                      plans.some(
                        (p) =>
                          getPlanTab(
                            p,
                          ) === tab,
                      );

                    const disabled =
                      plans.length > 0 &&
                      !hasPlans;

                    return (
                      <button
                        key={tab}
                        type="button"
                        disabled={disabled}
                        onClick={() => {
                          setSelectedTab(
                            tab,
                          );
                          setPlan(null);
                        }}
                        className={`
                          px-5
                          py-2.5
                          rounded-full
                          text-[13px]
                          font-bold
                          whitespace-nowrap
                          transition-all
                          active:scale-95

                          ${
                            selectedTab === tab
                              ? 'bg-primary text-white'
                              : 'bg-[#e8e9f1] text-primary'
                          }

                          ${
                            disabled
                              ? 'opacity-40'
                              : ''
                          }
                        `}
                      >
                        {tab}
                      </button>
                    );
                  })}

                </div>
              </div>

              {/* ==================================================
                  LOADING
              =================================================== */}

              {plansLoading && (
                <div className="
                  grid
                  grid-cols-3
                  gap-2
                ">
                  {Array.from({
                    length: 15,
                  }).map((_, index) => (
                    <div
                      key={index}
                      className="
                        h-[125px]
                        rounded-[16px]
                        bg-white
                        animate-pulse
                      "
                    />
                  ))}
                </div>
              )}

              {/* ==================================================
                  ERROR
              =================================================== */}

              {!plansLoading &&
                plansError && (
                  <div className="
                    bg-white
                    rounded-2xl
                    p-6
                    text-center
                    border
                    border-border
                  ">

                    <AlertCircle
                      className="
                        w-8
                        h-8
                        mx-auto
                        text-muted-foreground
                        mb-3
                      "
                    />

                    <p className="
                      text-sm
                      text-muted-foreground
                      mb-3
                    ">
                      {plansError}
                    </p>

                    <button
                      type="button"
                      onClick={() =>
                        loadPlans(
                          network,
                          phone,
                        )
                      }
                      className="
                        text-sm
                        text-primary
                        font-bold
                      "
                    >
                      Try again
                    </button>

                  </div>
                )}

              {/* ==================================================
                  COMPACT 3-COLUMN PLAN CARDS
              =================================================== */}

              {!plansLoading &&
                !plansError &&
                displayPlans.length >
                  0 && (

                  <div className="
                    grid
                    grid-cols-3
                    gap-2
                  ">

                    {displayPlans.map(
                      (p) => {

                        const selected =
                          plan?.DataPlan ===
                          p.DataPlan;

                        return (
                          <button
                            key={
                              p.DataPlan
                            }
                            type="button"
                            onClick={() => {
                              setPlan(p);
                              setStep(4);
                            }}
                            className={`
                              min-h-[125px]
                              rounded-[16px]
                              p-2
                              bg-[#eef1f6]
                              border-2
                              flex
                              flex-col
                              items-center
                              justify-center
                              text-center
                              transition-all
                              active:scale-[0.96]

                              ${
                                selected
                                  ? 'border-primary bg-primary/5'
                                  : 'border-[#dfe3eb]'
                              }
                            `}
                          >

                            {/* DATA SIZE */}

                            <div className="
                              text-[18px]
                              leading-tight
                              font-extrabold
                              text-black
                              whitespace-nowrap
                            ">
                              {p.DataPlanName}
                            </div>

                            {/* DURATION */}

                            <div className="
                              mt-1
                              text-[12px]
                              leading-tight
                              font-semibold
                              text-primary
                              whitespace-nowrap
                            ">
                              {p.DataPlanType ||
                                'Data'}
                            </div>

                            {/* PRICE */}

                            <div className="
                              mt-2
                              text-[16px]
                              leading-tight
                              font-extrabold
                              text-black
                              whitespace-nowrap
                            ">
                              {formatPrice(
                                p.Price,
                              )}
                            </div>

                            {/* CASHBACK */}

                            {p.cashback_enabled &&
                              p.cashback_amount &&
                              parseFloat(
                                p.cashback_amount,
                              ) > 0 && (

                                <div className="
                                  mt-1
                                  text-[8px]
                                  leading-none
                                  font-bold
                                  text-green-600
                                  flex
                                  items-center
                                  gap-0.5
                                ">
                                  <Gift className="w-2.5 h-2.5" />

                                  ₦
                                  {parseFloat(
                                    p.cashback_amount,
                                  ).toLocaleString()}
                                </div>

                            )}

                          </button>
                        );
                      },
                    )}

                  </div>
                )}

              {/* ==================================================
                  EMPTY
              =================================================== */}

              {!plansLoading &&
                !plansError &&
                plans.length === 0 && (
                  <div className="
                    bg-white
                    rounded-2xl
                    py-10
                    text-center
                    text-sm
                    text-muted-foreground
                  ">
                    No data plans available.
                  </div>
                )}

            </motion.div>
          )}

      </div>

      {/* ========================================================
          CONFIRM / PROCEED
      ========================================================= */}

      {step >= 4 &&
        plan && (

          <motion.div
            initial={{
              y: 100,
              opacity: 0,
            }}
            animate={{
              y: 0,
              opacity: 1,
            }}
            className="
              fixed
              bottom-0
              left-0
              right-0
              z-50
              max-w-md
              mx-auto
              bg-white/95
              backdrop-blur-md
              border-t
              border-border
              p-3
              shadow-[0_-5px_25px_rgba(0,0,0,0.08)]
            "
          >

            <div className="
              bg-[#f5f6fa]
              rounded-xl
              p-3
              mb-3
              text-sm
            ">

              <div className="
                flex
                justify-between
                mb-1.5
              ">
                <span className="text-muted-foreground">
                  Network
                </span>

                <span className="font-bold">
                  {selectedNetwork?.name}
                </span>
              </div>

              <div className="
                flex
                justify-between
                mb-1.5
              ">
                <span className="text-muted-foreground">
                  Plan
                </span>

                <span className="font-bold">
                  {plan.DataPlanName}
                </span>
              </div>

              <div className="
                flex
                justify-between
                mb-1.5
              ">
                <span className="text-muted-foreground">
                  Number
                </span>

                <span className="font-bold">
                  {phone}
                </span>
              </div>

              {plan.cashback_enabled &&
                plan.cashback_amount &&
                parseFloat(
                  plan.cashback_amount,
                ) > 0 && (

                  <div className="
                    flex
                    justify-between
                    mb-1.5
                  ">

                    <span className="
                      text-green-600
                      flex
                      items-center
                      gap-1
                      font-medium
                    ">
                      <Gift className="w-3.5 h-3.5" />
                      Cashback
                    </span>

                    <span className="
                      font-bold
                      text-green-600
                    ">
                      +₦
                      {parseFloat(
                        plan.cashback_amount,
                      ).toLocaleString()}
                    </span>

                  </div>
                )}

              <div className="
                flex
                justify-between
                pt-2
                border-t
                border-border
                mt-1
              ">

                <span className="text-muted-foreground">
                  Total
                </span>

                <span className="
                  font-extrabold
                  text-primary
                  text-base
                ">
                  {formatPrice(
                    plan.Price,
                  )}
                </span>

              </div>

            </div>

            <Button
              type="button"
              className="
                w-full
                h-14
                rounded-full
                text-lg
                font-extrabold
              "
              onClick={
                handlePurchase
              }
              disabled={
                isLoading
              }
            >
              {isLoading
                ? 'Processing...'
                : 'Proceed'}
            </Button>

          </motion.div>
        )}

      {/* ========================================================
          SUCCESS MODAL
      ========================================================= */}

      {successData && (
        <SuccessModal
          open={showSuccess}
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
