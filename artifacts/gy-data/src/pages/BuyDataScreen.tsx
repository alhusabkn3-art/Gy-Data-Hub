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
  const [, setLocation] = useLocation();

  const {
    purchaseData,
    balance,
  } = useAppContext();

  const [step, setStep] = useState(1);

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

  /*
   * Prevent an older async request from overwriting
   * a newer network/phone selection.
   */
  const plansRequestId =
    useRef(0);

  /*
   * Every genuine purchase input change starts
   * a new purchase intent.
   */
  useEffect(() => {
    idempotencyKey.current = null;
  }, [network, phone, plan]);

  const selectedNetwork =
    networks.find(
      (n) => n.id === network,
    );

  /*
   * FIX:
   *
   * loadPlans is now actually invoked whenever:
   *   - network changes
   *   - a valid phone number changes
   *
   * The request ID prevents stale async responses
   * from replacing plans belonging to another phone/network.
   */
  const loadPlans = useCallback(
    async (
      net: string,
      targetPhone: string,
    ) => {
      const normalizedNetwork =
        net.trim().toLowerCase();

      const normalizedPhone =
        targetPhone.trim();

      const requestId =
        ++plansRequestId.current;

      if (!normalizedNetwork) {
        setPlans([]);
        setPlan(null);
        setPlansError('');
        setPlansLoading(false);
        return;
      }

      if (
        !isValidNigerianNumber(
          normalizedPhone,
        )
      ) {
        setPlans([]);
        setPlan(null);
        setPlansError(
          normalizedPhone.length > 0
            ? 'Enter a valid Nigerian phone number first.'
            : '',
        );
        setPlansLoading(false);
        return;
      }

      setPlansLoading(true);
      setPlansError('');
      setPlans([]);
      setPlan(null);

      try {
        const fetched =
          await fetchDataPlans(
            normalizedNetwork,
            normalizedPhone,
          );

        /*
         * Ignore this response if another request
         * has already started.
         */
        if (
          requestId !==
          plansRequestId.current
        ) {
          return;
        }

        if (fetched.length === 0) {
          setPlansError(
            'No plans available for this network right now.',
          );
          return;
        }

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
      } catch (err: unknown) {
        if (
          requestId !==
          plansRequestId.current
        ) {
          return;
        }

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
            : msg ||
              'Could not load data plans. Please try again.',
        );
      } finally {
        if (
          requestId ===
          plansRequestId.current
        ) {
          setPlansLoading(false);
        }
      }
    },
    [selectedTab],
  );

  /*
   * FIX:
   *
   * This is the missing invocation.
   *
   * Once the user has selected a network and entered
   * a valid Nigerian number, plans are automatically loaded.
   */
  useEffect(() => {
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
  }, [
    network,
    phone,
    loadPlans,
  ]);

  const handleNetworkSelect = (
    netId: string,
  ) => {
    /*
     * Invalidate any currently running request.
     */
    plansRequestId.current += 1;

    setNetwork(netId);
    setPlans([]);
    setPlan(null);
    setPlansError('');
    setSelectedTab('SME');
    setPlansLoading(false);

    if (step === 1) {
      setStep(2);
    }
  };

  const handlePhoneChange = (
    value: string,
  ) => {
    /*
     * The PhoneInputWithContacts component already
     * normalizes the value.
     *
     * Changing phone invalidates the previous plans
     * immediately, preventing a plan for number A
     * from being purchased for number B.
     */
    plansRequestId.current += 1;

    setPhone(value);
    setPlans([]);
    setPlan(null);
    setPlansError('');

    if (
      !isValidNigerianNumber(
        value.trim(),
      )
    ) {
      setPlansLoading(false);
    }
  };

  const handleRetryPlans = () => {
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

  const handlePurchase =
    async () => {
      const normalizedPhone =
        phone.trim();

      if (!selectedNetwork) {
        toast.error(
          'Please select a network.',
        );
        return;
      }

      if (
        !isValidNigerianNumber(
          normalizedPhone,
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

      const planPrice =
        parseFloat(plan.Price);

      if (
        Number.isNaN(planPrice) ||
        planPrice <= 0
      ) {
        toast.error(
          'Invalid data plan price.',
        );
        return;
      }

      if (balance < planPrice) {
        toast.error(
          'Insufficient wallet balance. Please fund your wallet.',
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
            phone:
              normalizedPhone,
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

  const filteredPlans =
    plans.filter(
      (p) =>
        getPlanTab(p) ===
        selectedTab,
    );

  const displayPlans =
    filteredPlans.length > 0
      ? filteredPlans
      : selectedTab === 'SME'
        ? plans
        : [];

  const canPurchase =
    Boolean(
      selectedNetwork &&
        isValidNigerianNumber(
          phone.trim(),
        ) &&
        plan &&
        !isLoading,
    );

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
      {/* Header */}
      <div className="px-4 pt-4 pb-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() =>
            setLocation('/')
          }
          className="
            w-10
            h-10
            rounded-full
            bg-card
            border
            border-border
            flex
            items-center
            justify-center
            active:scale-95
            transition-transform
          "
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div>
          <h1 className="text-xl font-bold">
            Buy Data
          </h1>

          <p className="text-xs text-muted-foreground">
            Choose network, number and plan
          </p>
        </div>
      </div>

      <div className="px-4 pb-40 space-y-6">
        {/* Network */}
        <section>
          <h2 className="
            text-sm
            font-semibold
            text-muted-foreground
            mb-3
            uppercase
            tracking-wider
          ">
            Select Network
          </h2>

          <div className="grid grid-cols-4 gap-3">
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
                  flex
                  flex-col
                  items-center
                  gap-2
                  p-3
                  rounded-2xl
                  border-2
                  transition-all
                  active:scale-95
                  ${
                    network === n.id
                      ? 'border-primary bg-primary/10'
                      : 'border-border bg-card'
                  }
                `}
              >
                <div
                  className={`
                    w-12
                    h-12
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

                <span className="text-xs font-medium">
                  {n.name}
                </span>
              </button>
            ))}
          </div>
        </section>

        {/* Phone */}
        <PhoneInputWithContacts
          value={phone}
          onChange={
            handlePhoneChange
          }
          label="Phone Number"
        />

        {/* Loading */}
        {plansLoading && (
          <div className="
            bg-card
            border
            border-border
            rounded-2xl
            p-5
            flex
            items-center
            gap-3
          ">
            <RefreshCw className="
              w-5
              h-5
              animate-spin
              text-primary
            " />

            <div>
              <p className="font-semibold">
                Loading data plans…
              </p>

              <p className="text-xs text-muted-foreground">
                Getting available plans
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {!plansLoading &&
          plansError && (
            <div className="
              bg-card
              border
              border-border
              rounded-2xl
              p-4
            ">
              <div className="
                flex
                items-start
                gap-3
              ">
                <AlertCircle className="
                  w-5
                  h-5
                  text-amber-500
                  shrink-0
                  mt-0.5
                " />

                <div className="flex-1">
                  <p className="font-semibold text-sm">
                    Unable to load plans
                  </p>

                  <p className="
                    text-xs
                    text-muted-foreground
                    mt-1
                  ">
                    {plansError}
                  </p>

                  {isValidNigerianNumber(
                    phone.trim(),
                  ) &&
                    network && (
                      <button
                        type="button"
                        onClick={
                          handleRetryPlans
                        }
                        className="
                          mt-3
                          text-xs
                          font-semibold
                          text-primary
                        "
                      >
                        Try again
                      </button>
                    )}
                </div>
              </div>
            </div>
          )}

        {/* Plan tabs */}
        {plans.length > 0 && (
          <section>
            <div className="
              flex
              gap-2
              overflow-x-auto
              pb-1
              scrollbar-none
            ">
              {tabs
                .filter((tab) =>
                  plans.some(
                    (p) =>
                      getPlanTab(p) ===
                      tab,
                  ),
                )
                .map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      setSelectedTab(
                        tab,
                      );
                      setPlan(null);
                    }}
                    className={`
                      shrink-0
                      px-4
                      py-2.5
                      rounded-full
                      text-xs
                      font-bold
                      border
                      transition-all
                      ${
                        selectedTab ===
                        tab
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-card text-muted-foreground border-border'
                      }
                    `}
                  >
                    {tab}
                  </button>
                ))}
            </div>
          </section>
        )}

        {/* Plans */}
        {displayPlans.length > 0 && (
          <section>
            <div className="
              flex
              items-center
              justify-between
              mb-3
            ">
              <h2 className="
                text-sm
                font-semibold
                text-muted-foreground
                uppercase
                tracking-wider
              ">
                Select Data Plan
              </h2>

              <span className="
                text-xs
                text-muted-foreground
              ">
                {displayPlans.length} plans
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {displayPlans.map(
                (p, index) => {
                  const selected =
                    plan === p;

                  const price =
                    parseFloat(
                      p.Price,
                    );

                  const hasCashback =
                    p.cashback_enabled &&
                    p.cashback_amount;

                  return (
                    <motion.button
                      key={`${p.DataPlan}-${p.DataPlanName}-${index}`}
                      type="button"
                      whileTap={{
                        scale: 0.97,
                      }}
                      onClick={() =>
                        setPlan(p)
                      }
                      className={`
                        relative
                        text-left
                        rounded-2xl
                        border-2
                        p-4
                        bg-card
                        transition-all
                        ${
                          selected
                            ? 'border-primary bg-primary/5'
                            : 'border-border'
                        }
                      `}
                    >
                      {selected && (
                        <div className="
                          absolute
                          top-3
                          right-3
                          w-5
                          h-5
                          rounded-full
                          bg-primary
                          text-primary-foreground
                          flex
                          items-center
                          justify-center
                          text-xs
                          font-bold
                        ">
                          ✓
                        </div>
                      )}

                      <div className="
                        font-bold
                        text-base
                        pr-5
                      ">
                        {p.DataPlanName}
                      </div>

                      <div className="
                        text-xs
                        text-muted-foreground
                        mt-1
                      ">
                        {p.DataPlan}
                      </div>

                      <div className="
                        mt-4
                        font-extrabold
                        text-primary
                        text-lg
                      ">
                        {formatPrice(
                          p.Price,
                        )}
                      </div>

                      {hasCashback && (
                        <div className="
                          mt-2
                          inline-flex
                          items-center
                          gap-1
                          text-[10px]
                          font-semibold
                          text-primary
                        ">
                          <Gift className="w-3 h-3" />

                          Cashback ₦
                          {Number(
                            p.cashback_amount,
                          ).toLocaleString()}
                        </div>
                      )}

                      {!Number.isNaN(
                        price,
                      ) &&
                        price > 0 && (
                          <div className="
                            mt-1
                            text-[10px]
                            text-muted-foreground
                          ">
                            Pay from wallet
                          </div>
                        )}
                    </motion.button>
                  );
                },
              )}
            </div>
          </section>
        )}

        {/* No plans */}
        {!plansLoading &&
          network &&
          isValidNigerianNumber(
            phone.trim(),
          ) &&
          !plansError &&
          plans.length === 0 && (
            <div className="
              bg-card
              border
              border-border
              rounded-2xl
              p-6
              text-center
            ">
              <p className="font-semibold">
                No data plans found
              </p>

              <p className="
                text-xs
                text-muted-foreground
                mt-1
              ">
                Please try another network
                or check again shortly.
              </p>
            </div>
          )}
      </div>

      {/* Purchase confirmation */}
      {plan &&
        selectedNetwork &&
        isValidNigerianNumber(
          phone.trim(),
        ) && (
          <motion.div
            initial={{
              y: 50,
              opacity: 0,
            }}
            animate={{
              y: 0,
              opacity: 1,
            }}
            className="
              fixed
              bottom-16
              left-0
              right-0
              bg-white/95
              backdrop-blur-md
              border-t
              border-border
              shadow-[0_-4px_24px_rgba(14,29,70,0.08)]
              p-4
              z-50
              max-w-md
              mx-auto
            "
          >
            <div className="
              bg-card
              border
              border-border
              rounded-xl
              p-4
              mb-3
              text-sm
            ">
              <div className="
                flex
                justify-between
                mb-2
                gap-4
              ">
                <span className="text-muted-foreground">
                  Network
                </span>

                <span className="font-semibold">
                  {selectedNetwork.name}
                </span>
              </div>

              <div className="
                flex
                justify-between
                mb-2
                gap-4
              ">
                <span className="text-muted-foreground">
                  Number
                </span>

                <span className="font-semibold">
                  {phone}
                </span>
              </div>

              <div className="
                flex
                justify-between
                mb-2
                gap-4
              ">
                <span className="text-muted-foreground">
                  Plan
                </span>

                <span className="
                  font-semibold
                  text-right
                  max-w-[60%]
                ">
                  {plan.DataPlanName}
                </span>
              </div>

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
                  font-bold
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
              className="
                w-full
                h-12
                text-base
                rounded-xl
                font-bold
              "
              onClick={
                handlePurchase
              }
              disabled={
                !canPurchase
              }
            >
              {isLoading
                ? 'Processing…'
                : `Pay ${formatPrice(
                    plan.Price,
                  )}`}
            </Button>
          </motion.div>
        )}

      {/* Success */}
      {successData && (
        <SuccessModal
          open={showSuccess}
          onOpenChange={
            setShowSuccess
          }
          receipt={successData}
          onDone={() =>
            setLocation('/')
          }
        />
      )}
    </motion.div>
  );
}
