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
import { fetchDataPlans, type DataPlan } from '@/lib/api';
import {
  isValidNigerianNumber,
  normalizeNigerianNumber,
} from '@/components/PhoneInputWithContacts';

const NETWORKS = [
  { id: 'mtn', name: 'MTN', type: 'mtn' },
  { id: 'airtel', name: 'Airtel', type: 'airtel' },
  { id: 'glo', name: 'Glo', type: 'glo' },
  { id: '9mobile', name: '9mobile', type: '9mobile' },
] as const;

type Network = (typeof NETWORKS)[number];
type PlanTab = 'SME' | 'SME2' | 'GIFTING' | 'CORPORATE';

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

const VALIDITY_FILTERS: ValidityFilter[] = [
  'ALL',
  'DAILY',
  'WEEKLY',
  'MONTHLY',
  '30 DAYS',
];

function normalize(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function numberValue(value: unknown): number {
  const parsed = Number(
    String(value ?? '')
      .replace(/[₦,]/g, '')
      .trim(),
  );

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatMoney(value: unknown): string {
  return `₦${numberValue(value).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function getPlanText(plan: DataPlan): string {
  return normalize(
    [plan.DataPlanName, plan.DataPlanType].join(' '),
  );
}

function getPlanTab(plan: DataPlan): PlanTab {
  const text = getPlanText(plan);

  if (text.includes('SME2') || text.includes('SME 2')) {
    return 'SME2';
  }

  if (text.includes('CORPORATE')) {
    return 'CORPORATE';
  }

  if (text.includes('GIFTING') || text.includes('GIFT')) {
    return 'GIFTING';
  }

  return 'SME';
}

function getValidity(
  plan: DataPlan,
): ValidityFilter | string {
  const text = getPlanText(plan);

  if (/\b30\s*DAYS?\b/.test(text)) return '30 DAYS';
  if (/\b4\s*WEEKS?\b/.test(text)) return 'MONTHLY';
  if (/\b3\s*WEEKS?\b/.test(text)) return 'MONTHLY';
  if (/\b2\s*WEEKS?\b/.test(text)) return 'MONTHLY';
  if (/\b1\s*WEEK\b/.test(text)) return 'WEEKLY';
  if (/\b7\s*DAYS?\b/.test(text)) return 'WEEKLY';
  if (/\b14\s*DAYS?\b/.test(text)) return 'WEEKLY';
  if (/\b21\s*DAYS?\b/.test(text)) return 'MONTHLY';
  if (/\bDAILY\b/.test(text)) return 'DAILY';
  if (/\b1\s*DAY\b/.test(text)) return 'DAILY';
  if (/\b2\s*DAYS?\b/.test(text)) return 'DAILY';
  if (/\b3\s*DAYS?\b/.test(text)) return 'DAILY';
  if (/\b5\s*DAYS?\b/.test(text)) return 'DAILY';
  if (/\bWEEKLY\b/.test(text)) return 'WEEKLY';
  if (/\bMONTHLY\b/.test(text)) return 'MONTHLY';
  if (/\bMONTH\b/.test(text)) return 'MONTHLY';

  return 'ALL';
}

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
      : network.id === 'airtel'
        ? 'airtel'
        : network.id === 'glo'
          ? 'Glo'
          : '9M';

  const logoClass =
    network.id === 'mtn'
      ? 'bg-[#FFD100] text-slate-900'
      : network.id === 'airtel'
        ? 'bg-[#E30613] text-white'
        : network.id === 'glo'
          ? 'bg-[#78BE20] text-white'
          : 'bg-[#006B3F] text-white';

  return (
    <div
      className={`
        flex h-9 w-9 items-center justify-center
        rounded-full text-[9px] font-black shadow-sm
        ${selected ? 'ring-2 ring-slate-900 ring-offset-1' : ''}
        ${logoClass}
      `}
    >
      {logoText}
    </div>
  );
}

function getCashback(plan: DataPlan) {
  const raw = plan as DataPlan & {
    cashback?: unknown;
    Cashback?: unknown;
    cashbackAmount?: unknown;
    CashbackAmount?: unknown;
    cashbackPercent?: unknown;
    CashbackPercent?: unknown;
  };

  const amount = numberValue(
    raw.cashbackAmount ??
      raw.CashbackAmount ??
      raw.cashback ??
      raw.Cashback,
  );

  if (amount > 0) {
    return {
      amount,
      label: `${formatMoney(amount)} Cashback`,
    };
  }

  const percent = numberValue(
    raw.cashbackPercent ?? raw.CashbackPercent,
  );

  if (percent > 0) {
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

export default function BuyDataScreen() {
  const [, setLocation] = useLocation();

  const {
    wallet,
    purchaseData,
  } = useAppContext();

  const [network, setNetwork] =
    useState<Network['id']>('mtn');

  const [plans, setPlans] =
    useState<DataPlan[]>([]);

  const [loadingPlans, setLoadingPlans] =
    useState(false);

  const [plansError, setPlansError] =
    useState('');

  const [tab, setTab] =
    useState<PlanTab>('SME');

  const [validityFilter, setValidityFilter] =
    useState<ValidityFilter>('ALL');

  const [phone, setPhone] =
    useState('');

  const [selectedPlan, setSelectedPlan] =
    useState<DataPlan | null>(null);

  const [pinOpen, setPinOpen] =
    useState(false);

  const [pin, setPin] =
    useState('');

  const [purchasing, setPurchasing] =
    useState(false);

  const [successOpen, setSuccessOpen] =
    useState(false);

  const [successReceipt, setSuccessReceipt] =
    useState<ReceiptData | null>(null);

  const idempotencyKey =
    useRef<string | null>(null);

  const currentBalance =
    numberValue(
      wallet?.balance ??
        wallet?.availableBalance ??
        0,
    );

  const selectedNetwork =
    NETWORKS.find(
      item => item.id === network,
    ) ?? NETWORKS[0];

  const availableTabs = useMemo(() => {
    const result = new Set<PlanTab>();

    for (const plan of plans) {
      result.add(getPlanTab(plan));
    }

    return Array.from(result);
  }, [plans]);

  const availableValidities = useMemo(() => {
    const result = new Set<string>();

    for (const plan of plans) {
      const value = getValidity(plan);

      if (value !== 'ALL') {
        result.add(value);
      }
    }

    return result;
  }, [plans]);

  const loadPlans = useCallback(async () => {
    setLoadingPlans(true);
    setPlansError('');

    try {
      const response =
        await fetchDataPlans(
          selectedNetwork.type,
        );

      const incoming = Array.isArray(response)
        ? response
        : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response?.plans)
            ? response.plans
            : [];

      setPlans(
        incoming.filter(
          plan =>
            plan &&
            typeof plan === 'object',
        ),
      );
    } catch (error) {
      setPlans([]);

      setPlansError(
        error instanceof Error
          ? error.message
          : 'Unable to load data plans.',
      );
    } finally {
      setLoadingPlans(false);
    }
  }, [selectedNetwork.type]);

  useEffect(() => {
    loadPlans();
  }, [loadPlans]);

  useEffect(() => {
    if (
      availableTabs.length > 0 &&
      !availableTabs.includes(tab)
    ) {
      setTab(
        availableTabs[0],
      );
    }
  }, [
    availableTabs,
    tab,
  ]);

  useEffect(() => {
    if (
      validityFilter !== 'ALL' &&
      !availableValidities.has(
        validityFilter,
      )
    ) {
      setValidityFilter('ALL');
    }
  }, [
    availableValidities,
    validityFilter,
  ]);

  useEffect(() => {
    setSelectedPlan(null);
    setPinOpen(false);
    setPin('');
    idempotencyKey.current = null;
  }, [network]);

  const visiblePlans = useMemo(() => {
    return plans.filter(
      plan => {
        const planTab =
          getPlanTab(plan);

        const validity =
          getValidity(plan);

        const matchesTab =
          tab === 'SME'
            ? planTab === 'SME'
            : planTab === tab;

        const matchesValidity =
          validityFilter === 'ALL' ||
          validity ===
            validityFilter;

        return (
          matchesTab &&
          matchesValidity
        );
      },
    );
  }, [
    plans,
    tab,
    validityFilter,
  ]);

  function preparePurchase() {
    if (!isValidNigerianNumber(phone)) {
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
      numberValue(selectedPlan.Price);

    if (amount <= 0) {
      toast.error(
        'This data plan has an invalid price.',
      );
      return;
    }

    if (currentBalance < amount) {
      toast.error(
        'Insufficient wallet balance.',
      );
      return;
    }

    const planCode =
      String(
        selectedPlan.DataPlan ??
          selectedPlan.plan_id ??
          selectedPlan.planCode ??
          selectedPlan.code ??
          selectedPlan.id ??
          '',
      ).trim();

    if (!planCode) {
      toast.error(
        'This data plan is unavailable for purchase.',
      );
      return;
    }

    setPin('');
    setPinOpen(true);
  }

  async function purchase() {
    if (pin.length !== 4) {
      toast.error(
        'Purchase PIN must be exactly 4 digits.',
      );
      return;
    }

    if (
      purchasing ||
      !selectedPlan
    ) {
      return;
    }

    const amount =
      numberValue(selectedPlan.Price);

    if (amount <= 0) {
      toast.error(
        'Invalid data plan amount.',
      );
      return;
    }

    if (currentBalance < amount) {
      toast.error(
        'Insufficient wallet balance.',
      );
      return;
    }

    const planCode =
      String(
        selectedPlan.DataPlan ??
          selectedPlan.plan_id ??
          selectedPlan.planCode ??
          selectedPlan.code ??
          selectedPlan.id ??
          '',
      ).trim();

    if (!planCode) {
      toast.error(
        'This data plan has no valid provider plan ID.',
      );
      return;
    }

    if (!idempotencyKey.current) {
      idempotencyKey.current =
        `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2)}`;
    }

    setPurchasing(true);

    try {
      const result =
        await purchaseData(
          network,
          planCode,
          normalizeNigerianNumber(phone),
          pin,
          idempotencyKey.current,
          selectedPlan.DataPlanName ?? '',
          amount,
        );

      if (!result?.success) {
        toast.error(
          result?.error ||
            result?.message ||
            'Data purchase failed.',
        );
        return;
      }

      const receipt: ReceiptData = {
        id: String(
          result?.transaction?.id ??
            result?.transactionId ??
            result?.id ??
            '',
        ),
        reference: String(
          result?.transaction?.reference ??
            result?.reference ??
            '',
        ),
        providerReference: String(
          result?.transaction
            ?.providerReference ??
            result?.providerReference ??
            '',
        ),
        provider: 'GY DATA',
        service: 'Data',
        description:
          selectedPlan.DataPlanName ||
          'Data Purchase',
        recipient:
          normalizeNigerianNumber(phone),
        amount,
        cashback: numberValue(
          result?.transaction?.cashback ??
            result?.cashback ??
            0,
        ),
        status: 'success',
        createdAt: String(
          result?.transaction?.createdAt ??
            new Date().toISOString(),
        ),
        paymentMethod: 'Wallet',
      };

      setSuccessReceipt(receipt);
      setPinOpen(false);
      setPin('');
      setSuccessOpen(true);
      setSelectedPlan(null);
      idempotencyKey.current = null;
    } catch (error) {
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
      setPurchasing(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-24 text-slate-900">
      <div className="mx-auto w-full max-w-2xl px-3 py-3">

        <header className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setLocation('/')}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="text-center">
            <h1 className="text-base font-black">
              Buy Data
            </h1>
            <p className="text-[10px] text-slate-400">
              Select a plan
            </p>
          </div>

          <div className="h-10 w-10" />
        </header>

        <div className="mb-3 rounded-[18px] bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-400">
              Wallet Balance
            </span>

            <span className="text-sm font-black text-slate-900">
              {formatMoney(currentBalance)}
            </span>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {NETWORKS.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  setNetwork(item.id)
                }
                className={`
                  flex flex-col items-center
                  gap-1 rounded-xl border p-2
                  ${
                    network === item.id
                      ? 'border-slate-900 bg-slate-50'
                      : 'border-slate-200 bg-white'
                  }
                `}
              >
                <NetworkLogo
                  network={item}
                  selected={
                    network === item.id
                  }
                />

                <span className="text-[9px] font-bold">
                  {item.name}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3 overflow-x-auto">
          <div className="flex min-w-max gap-2">
            {PLAN_TABS.map(item => (
              <button
                key={item}
                type="button"
                disabled={
                  availableTabs.length > 0 &&
                  !availableTabs.includes(item)
                }
                onClick={() =>
                  setTab(item)
                }
                className={`
                  rounded-full px-4 py-2
                  text-[10px] font-black
                  ${
                    tab === item
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-500'
                  }
                  ${
                    availableTabs.length > 0 &&
                    !availableTabs.includes(item)
                      ? 'opacity-30'
                      : ''
                  }
                `}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3 overflow-x-auto">
          <div className="flex min-w-max gap-2">
            {VALIDITY_FILTERS.map(item => (
              <button
                key={item}
                type="button"
                disabled={
                  item !== 'ALL' &&
                  availableValidities.size > 0 &&
                  !availableValidities.has(item)
                }
                onClick={() =>
                  setValidityFilter(item)
                }
                className={`
                  rounded-full border px-3 py-1.5
                  text-[9px] font-bold
                  ${
                    validityFilter === item
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-500'
                  }
                `}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-3 rounded-[18px] bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-[10px] font-black text-slate-700">
              Phone Number
            </label>

            <BookUser className="h-4 w-4 text-slate-400" />
          </div>

          <input
            value={phone}
            onChange={event =>
              setPhone(
                event.target.value,
              )
            }
            inputMode="numeric"
            placeholder="08012345678"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold outline-none focus:border-slate-900"
          />
        </div>

        {loadingPlans ? (
          <div className="rounded-[18px] bg-white p-8 text-center">
            <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-slate-400" />
            <p className="text-xs font-bold text-slate-400">
              Loading data plans...
            </p>
          </div>
        ) : plansError ? (
          <div className="rounded-[18px] bg-white p-6 text-center">
            <AlertCircle className="mx-auto mb-2 h-6 w-6 text-red-500" />

            <p className="mb-3 text-xs font-bold text-red-500">
              {plansError}
            </p>

            <button
              type="button"
              onClick={loadPlans}
              className="rounded-full bg-slate-900 px-4 py-2 text-[10px] font-black text-white"
            >
              Retry
            </button>
          </div>
        ) : !isValidNigerianNumber(phone) ? (
          <div className="rounded-[18px] bg-white p-6 text-center text-[10px] text-slate-400">
            Enter a valid phone
            number to view
            available plans.
          </div>
        ) : visiblePlans.length ===
          0 ? (
          <div className="rounded-[18px] bg-white p-6 text-center">
            <p className="text-xs font-bold text-slate-500">
              No plans available
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {visiblePlans.map(item => {
              const active =
                selectedPlan?.DataPlan ===
                item.DataPlan;

              const cb =
                getCashback(item);

              const validity =
                getValidity(item);

              return (
                <motion.button
                  key={`${item.DataPlan}-${item.Price}`}
                  type="button"
                  whileTap={{
                    scale: 0.97,
                  }}
                  onClick={() =>
                    setSelectedPlan(item)
                  }
                  className={`
                    relative
                    flex
                    min-h-[125px]
                    flex-col
                    rounded-[15px]
                    border
                    bg-white
                    p-2.5
                    text-left
                    shadow-[0_2px_7px_rgba(15,23,42,0.06)]
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
                    <p className="truncate text-[14px] font-black leading-5 text-slate-900">
                      {item.DataPlanName ||
                        'Data'}
                    </p>

                    <p className="mt-0.5 truncate text-[8px] font-medium text-slate-400">
                      {tab} · {validity}
                    </p>
                  </div>

                  <p className="mt-2 text-[14px] font-black text-slate-900">
                    {formatMoney(
                      item.Price,
                    )}
                  </p>

                  <div className="mt-auto pt-2">
                    {cb.amount > 0 ? (
                      <span className="flex min-h-6 items-center justify-center gap-1 rounded-full bg-[#10243F] px-1.5 py-1 text-center text-[7px] font-bold leading-3 text-[#D8B52B]">
                        <Gift className="h-2.5 w-2.5 shrink-0" />
                        {cb.label}
                      </span>
                    ) : (
                      <span className="text-[8px] font-medium text-slate-300">
                        Data plan
                      </span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        {selectedPlan && (
          <div className="sticky bottom-3 mt-3 rounded-[18px] bg-slate-900 p-3 text-white shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold text-slate-400">
                  Selected plan
                </p>

                <p className="text-sm font-black">
                  {selectedPlan.DataPlanName}
                </p>
              </div>

              <p className="text-base font-black">
                {formatMoney(
                  selectedPlan.Price,
                )}
              </p>
            </div>

            <button
              type="button"
              onClick={preparePurchase}
              disabled={purchasing}
              className="w-full rounded-xl bg-white px-4 py-3 text-xs font-black text-slate-900 disabled:opacity-50"
            >
              Purchase Data
            </button>
          </div>
        )}
      </div>

      {pinOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
          <div className="w-full max-w-sm rounded-[22px] bg-white p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-base font-black text-slate-900">
                  Confirm Purchase
                </p>

                <p className="text-[10px] text-slate-400">
                  Enter your 4-digit Purchase PIN
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!purchasing) {
                    setPinOpen(false);
                    setPin('');
                  }
                }}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-4 rounded-xl bg-slate-50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400">
                  {selectedPlan?.DataPlanName}
                </span>

                <span className="text-sm font-black text-slate-900">
                  {formatMoney(
                    selectedPlan?.Price,
                  )}
                </span>
              </div>
            </div>

            <input
              autoFocus
              value={pin}
              onChange={event =>
                setPin(
                  event.target.value
                    .replace(/\D/g, '')
                    .slice(0, 4),
                )
              }
              inputMode="numeric"
              type="password"
              maxLength={4}
              placeholder="••••"
              className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-4 text-center text-2xl font-black tracking-[0.6em] outline-none focus:border-slate-900"
            />

            <button
              type="button"
              onClick={purchase}
              disabled={
                purchasing ||
                pin.length !== 4
              }
              className="w-full rounded-xl bg-slate-900 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
            >
              {purchasing
                ? 'Processing...'
                : 'Confirm Purchase'}
            </button>
          </div>
        </div>
      )}

      <SuccessModal
        open={successOpen}
        onClose={() => {
          setSuccessOpen(false);
          setSuccessReceipt(null);
        }}
        receipt={successReceipt}
      />
    </div>
  );
}
