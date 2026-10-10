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
  /*
   * Cashback is controlled by Super Admin in two levels:
   * 1. Global cashback setting must be ON for Data.
   * 2. The individual pricing rule must have cashback_enabled = true.
   *
   * The /data-plans endpoint already applies the global setting and
   * returns cashback_enabled/cashback_type/cashback_value for the
   * customer-facing plan. The UI must honor cashback_enabled here;
   * otherwise a disabled plan can incorrectly display cashback.
   */
  if (plan.cashback_enabled !== true) {
    return {
      amount: 0,
      label: '',
    };
  }

  const value = numberValue(
    plan.cashback_value,
  );

  if (value <= 0) {
    return {
      amount: 0,
      label: '',
    };
  }

  if (
    String(plan.cashback_type ?? '').toLowerCase() ===
    'percentage'
  ) {
    return {
      amount: value,
      label: `${value}% Cash Back`,
    };
  }

  return {
    amount: value,
    label: `${formatMoney(value)} Cash Back`,
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

  const phoneInputRef =
    useRef<HTMLInputElement>(null);

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

      setPlans(incoming);

      const tabs = new Set(
        incoming.map(item =>
          getPlanTab(item),
        ),
      );

      if (!tabs.has(tab)) {
        if (tabs.has('SME')) {
          setTab('SME');
        } else {
          const first =
            Array.from(tabs)[0];

          if (first) {
            setTab(first);
          }
        }
      }
    } catch (error) {
      console.error(
        'Failed to load data plans:',
        error,
      );

      setPlans([]);
      setPlansError(
        error instanceof Error
          ? error.message
          : 'Unable to load data plans.',
      );
    } finally {
      setLoadingPlans(false);
    }
  }, [
    selectedNetwork.type,
    tab,
  ]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  function changeNetwork(
    value: Network['id'],
  ) {
    setNetwork(value);
    setSelectedPlan(null);
    setValidityFilter('ALL');
  }

  function changePhone(value: string) {
    const digits = value
      .replace(/\D/g, '')
      .slice(0, 11);

    setPhone(digits);
    setSelectedPlan(null);

    // Hide the on-screen keypad as soon as the full
    // 11-digit Nigerian number has been entered.
    if (digits.length === 11) {
      window.setTimeout(() => {
        phoneInputRef.current?.blur();
      }, 0);
    }
  }

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

      if (navigatorAny.contacts?.select) {
        const contacts =
          await navigatorAny.contacts.select(
            ['tel'],
            { multiple: false },
          );

        const number =
          contacts?.[0]?.tel?.[0];

        if (number) {
          changePhone(number);

          // Return focus to the Buy Data page without leaving
          // the phone field active after a contact is selected.
          window.setTimeout(() => {
            phoneInputRef.current?.blur();
          }, 0);
        }

        return;
      }

      toast.info(
        'Contact picker is not available on this device.',
      );
    } catch (error) {
      console.error(
        'Contact picker error:',
        error,
      );
    }
  }

  const visiblePlans = useMemo(() => {
    let result = plans.filter(
      item =>
        getPlanTab(item) === tab,
    );

    if (validityFilter !== 'ALL') {
      result = result.filter(
        item =>
          getValidity(item) ===
          validityFilter,
      );
    }

    return result;
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

    if (purchasing || !selectedPlan) {
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
          normalizeNigerianNumber(phone),
          selectedPlan,
          pin,
          idempotencyKey.current,
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
        type: 'data',
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
          `Data purchase - ${selectedNetwork.name.toLowerCase()} ${normalizeNigerianNumber(phone)}`,
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
        metadata: {
          network:
            result?.transaction?.network ??
            selectedNetwork.name,
          networkName:
            result?.transaction?.networkName ??
            selectedNetwork.name,
          phone:
            normalizeNigerianNumber(phone),
          phoneNumber:
            normalizeNigerianNumber(phone),
          planName:
            selectedPlan.DataPlanName ||
            'Data Purchase',
          dataPlanName:
            selectedPlan.DataPlanName ||
            'Data Purchase',
          transactionType:
            result?.transaction?.type ??
            result?.transaction?.transactionType ??
            tab,
          planType:
            result?.transaction?.planType ??
            tab,
          addon:
            result?.transaction?.cashbackText ??
            getCashback(
              selectedPlan,
            ).label,
          cashbackText:
            result?.transaction?.cashbackText ??
            getCashback(
              selectedPlan,
            ).label,
          balanceBefore:
            result?.transaction?.balanceBefore ??
            result?.balanceBefore ??
            currentBalance,
          balanceAfter:
            result?.transaction?.balanceAfter ??
            result?.balanceAfter ??
            currentBalance - amount,
        },
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

        {/* HEADER */}
        <header className="mb-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() =>
              setLocation('/')
            }
            className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-slate-100"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>

          <h1 className="text-[20px] font-extrabold">
            Buy Data
          </h1>

          <div className="w-9" />
        </header>

        {/* NETWORK CARDS - SMALLER */}
        <section className="mb-3 grid grid-cols-4 gap-2">
          {NETWORKS.map(item => {
            const active =
              item.id === network;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  changeNetwork(item.id)
                }
                className={`
                  flex h-[92px]
                  min-w-0 flex-col
                  items-center justify-center
                  rounded-[16px]
                  border bg-white
                  px-1.5 py-2
                  shadow-[0_2px_7px_rgba(15,23,42,0.05)]
                  transition
                  ${
                    active
                      ? 'border-[#10243F] ring-1 ring-[#10243F]'
                      : 'border-slate-200'
                  }
                `}
              >
                <NetworkLogo
                  network={item}
                  selected={active}
                />

                <span className="mt-1.5 truncate text-[10px] font-bold text-slate-600">
                  {item.name}
                </span>
              </button>
            );
          })}
        </section>

        {/* PHONE */}
        <section className="mb-3 rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_2px_7px_rgba(15,23,42,0.04)]">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
              Phone Number
            </span>

            <button
              type="button"
              className="rounded-full bg-[#D8B52B] px-3 py-1.5 text-[10px] font-bold"
            >
              Beneficiaries
            </button>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-slate-50 px-2.5 py-2">
            <span className="text-[11px] font-bold text-slate-500">
              +234
            </span>

            <input
              ref={phoneInputRef}
              value={phone}
              onChange={event =>
                changePhone(
                  event.target.value,
                )
              }
              inputMode="numeric"
              type="tel"
              maxLength={11}
              placeholder="08012345678"
              className="min-w-0 flex-1 bg-transparent text-[16px] font-bold outline-none placeholder:text-slate-300"
            />

            {phone && (
              <button
                type="button"
                onClick={() =>
                  changePhone('')
                }
                className="flex h-7 w-7 items-center justify-center rounded-full"
              >
                <X className="h-4 w-4 text-slate-400" />
              </button>
            )}

            <button
              type="button"
              onClick={() =>
                void chooseContact()
              }
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#10243F] text-white"
            >
              <BookUser className="h-5 w-5" />
            </button>
          </div>
        </section>

        {/* PLAN TABS */}
        <section className="mb-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {PLAN_TABS.map(item => {
              const active =
                tab === item;

              const exists =
                availableTabs.includes(
                  item,
                );

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() =>
                    setTab(item)
                  }
                  className={`
                    whitespace-nowrap
                    rounded-full
                    px-3.5 py-2
                    text-[10px]
                    font-bold
                    ${
                      active
                        ? 'bg-[#D8B52B] text-slate-900'
                        : 'bg-slate-100 text-slate-500'
                    }
                    ${
                      !exists &&
                      plans.length > 0
                        ? 'opacity-40'
                        : ''
                    }
                  `}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </section>

        {/* VALIDITY */}
        <section className="mb-3">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {VALIDITY_FILTERS.map(item => {
              const active =
                validityFilter === item;

              return (
                <button
                  key={item}
                  type="button"
                  onClick={() =>
                    setValidityFilter(item)
                  }
                  className={`
                    whitespace-nowrap
                    rounded-full
                    border
                    px-3 py-1.5
                    text-[9px]
                    font-bold
                    ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-500'
                    }
                  `}
                >
                  {item}
                </button>
              );
            })}
          </div>
        </section>

        {/* PLANS */}
        {loadingPlans ? (
          <div className="rounded-[18px] bg-white p-6 text-center">
            <RefreshCw className="mx-auto h-5 w-5 animate-spin text-slate-400" />

            <p className="mt-2 text-[10px] font-semibold text-slate-400">
              Loading data plans...
            </p>
          </div>
        ) : plansError ? (
          <div className="rounded-[18px] bg-white p-6 text-center">
            <AlertCircle className="mx-auto h-6 w-6 text-amber-500" />

            <p className="mt-2 text-xs font-bold">
              Unable to load data plans
            </p>

            <button
              type="button"
              onClick={() =>
                void loadPlans()
              }
              className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-[10px] font-bold text-white"
            >
              Retry
            </button>
          </div>
        ) : !isValidNigerianNumber(
            phone,
          ) ? (
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
          /*
            SMALL CARDS:
            - min-h-[125px]
            - p-2.5
            - gap-2
            - smaller fonts
            - 3 columns on desktop
          */
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
                      <span className="block truncate rounded-full bg-slate-100 px-1.5 py-1 text-center text-[7px] font-bold text-slate-500">
                        {validity}
                      </span>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}

        {/* SELECTED PLAN */}
        {selectedPlan && (
          <div className="sticky bottom-2 z-20 mt-3 rounded-[18px] border border-slate-200 bg-white/95 p-2.5 shadow-xl backdrop-blur">
            <div className="flex items-center gap-2">
              <NetworkLogo
                network={
                  selectedNetwork
                }
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-bold">
                  {
                    selectedPlan.DataPlanName
                  }
                </p>

                <p className="truncate text-[8px] text-slate-400">
                  {phone}
                </p>
              </div>

              <p className="text-xs font-black">
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
                className="rounded-lg bg-slate-900 px-3 py-2 text-[9px] font-bold text-white disabled:opacity-50"
              >
                Buy
              </button>
            </div>
          </div>
        )}
      </div>

      {/* PIN MODAL */}
      {pinOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center">
          <div className="w-full max-w-sm rounded-[25px] bg-white p-4 shadow-2xl">
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[#C7A91F]" />

              <div>
                <p className="text-sm font-black">
                  Confirm Purchase
                </p>

                <p className="text-[9px] text-slate-400">
                  Enter your 4-digit
                  purchase PIN.
                </p>
              </div>
            </div>

            <div className="mb-3 rounded-xl bg-slate-50 p-3 text-center">
              <p className="text-[10px] font-bold">
                {
                  selectedPlan?.DataPlanName
                }
              </p>

              <p className="mt-1 text-base font-black">
                {formatMoney(
                  selectedPlan?.Price,
                )}
              </p>

              <p className="text-[9px] text-slate-400">
                {
                  selectedNetwork.name
                }{' '}
                · {phone}
              </p>
            </div>

            <input
              autoFocus
              type="password"
              inputMode="numeric"
              maxLength={4}
              value={pin}
              onChange={event =>
                setPin(
                  event.target.value
                    .replace(
                      /\D/g,
                      '',
                    )
                    .slice(0, 4),
                )
              }
              onKeyDown={event => {
                if (
                  event.key === 'Enter'
                ) {
                  void purchase();
                }
              }}
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 text-center text-xl font-black tracking-[0.7em] outline-none"
              placeholder="••••"
              autoComplete="off"
            />

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPinOpen(false);
                  setPin('');
                }}
                disabled={purchasing}
                className="rounded-lg border border-slate-200 py-2.5 text-[10px] font-bold"
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
                  pin.length !== 4
                }
                className="rounded-lg bg-slate-900 py-2.5 text-[10px] font-bold text-white disabled:opacity-40"
              >
                {purchasing
                  ? 'Processing…'
                  : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS RECEIPT */}
      {successOpen &&
        successReceipt && (
          <SuccessModal
            open={successOpen}
            onClose={() => {
              setSuccessOpen(false);
              setSuccessReceipt(null);
            }}
            receipt={successReceipt}
          />
        )}
    </div>
  );
}



