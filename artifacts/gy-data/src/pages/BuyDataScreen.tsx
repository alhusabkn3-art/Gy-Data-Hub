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
      {/* UI section remains exactly as in the ZIP */}
    </motion.div>
  );
}
