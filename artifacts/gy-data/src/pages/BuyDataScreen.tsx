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
return `₦${numberValue(value).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function getPlanText(plan: DataPlan): string {
return normalize(
[
plan.DataPlanName,
plan.DataPlanType,
].join(' '),
);
}

function getPlanTab(
plan: DataPlan,
): PlanTab {
const text = getPlanText(plan);

if (
text.includes('SME2') ||
text.includes('SME 2')
) {
return 'SME2';
}

if (text.includes('CORPORATE')) {
return 'CORPORATE';
}

if (
text.includes('GIFTING') ||
text.includes('GIFT')
) {
return 'GIFTING';
}

return 'SME';
}

function getValidity(
plan: DataPlan,
): ValidityFilter | string {
const text = getPlanText(plan);

if (/\b30\s*DAYS?\b/.test(text)) {
return '30 DAYS';
}

if (/\b4\s*WEEKS?\b/.test(text)) {
return 'MONTHLY';
}

if (/\b3\s*WEEKS?\b/.test(text)) {
return 'MONTHLY';
}

if (/\b2\s*WEEKS?\b/.test(text)) {
return 'MONTHLY';
}

if (/\b1\s*WEEK\b/.test(text)) {
return 'WEEKLY';
}

if (/\b7\s*DAYS?\b/.test(text)) {
return 'WEEKLY';
}

if (/\b14\s*DAYS?\b/.test(text)) {
return 'WEEKLY';
}

if (/\b21\s*DAYS?\b/.test(text)) {
return 'MONTHLY';
}

if (/\bDAILY\b/.test(text)) {
return 'DAILY';
}

if (/\b1\s*DAY\b/.test(text)) {
return 'DAILY';
}

if (/\b2\s*DAYS?\b/.test(text)) {
return 'DAILY';
}

if (/\b3\s*DAYS?\b/.test(text)) {
return 'DAILY';
}

if (/\b5\s*DAYS?\b/.test(text)) {
return 'DAILY';
}

if (/\bWEEKLY\b/.test(text)) {
return 'WEEKLY';
}

if (/\bMONTHLY\b/.test(text)) {
return 'MONTHLY';
}

if (/\bMONTH\b/.test(text)) {
return 'MONTHLY';
}

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
className={`flex h-9 w-9 items-center justify-center rounded-full text-[9px] font-black shadow-sm ${selected ? 'ring-2 ring-slate-900 ring-offset-1' : ''} ${logoClass}`}
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
raw.cashbackPercent ??
raw.CashbackPercent,
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
balance,
refreshWallet,
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

const [
validityFilter,
setValidityFilter,
] = useState<ValidityFilter>('ALL');

const [phone, setPhone] =
useState('');

const [
selectedPlan,
setSelectedPlan,
] = useState<DataPlan | null>(null);

const [pinOpen, setPinOpen] =
useState(false);

const [pin, setPin] =
useState('');

const pinInputRef =
useRef<HTMLInputElement | null>(null);

const [purchasing, setPurchasing] =
useState(false);

const [successOpen, setSuccessOpen] =
useState(false);

const [
successReceipt,
setSuccessReceipt,
] = useState<ReceiptData | null>(null);

const idempotencyKey =
useRef<string | null>(null);

const currentBalance =
numberValue(balance);

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

const availableValidities =
useMemo(() => {
const result = new Set<string>();

  for (const plan of plans) {
    const value = getValidity(plan);

    if (value !== 'ALL') {
      result.add(value);
    }
  }

  return result;
}, [plans]);

const loadPlans =
useCallback(async () => {
setLoadingPlans(true);
setPlansError('');

  try {
    const response =
      await fetchDataPlans(
        selectedNetwork.type,
      );

    const incoming =
      Array.isArray(response)
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

useEffect(() => {
void refreshWallet();
}, [refreshWallet]);

function changeNetwork(
value: Network['id'],
) {
setNetwork(value);
setSelectedPlan(null);
setValidityFilter('ALL');
}

function changePhone(
value: string,
) {
const digits = value
.replace(/\D/g, '')
.slice(0, 11);

setPhone(digits);
setSelectedPlan(null);

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

  if (
    navigatorAny.contacts?.select
  ) {
    const contacts =
      await navigatorAny.contacts.select(
        ['tel'],
        {
          multiple: false,
        },
      );

    const number =
      contacts?.[0]?.tel?.[0];

    if (number) {
      changePhone(number);
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

if (
  validityFilter !== 'ALL'
) {
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
if (
!isValidNigerianNumber(phone)
) {
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

async function purchase(
submittedPin?: string,
) {
const purchasePin =
submittedPin ?? pin;

if (purchasePin.length !== 4) {
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

const planCode = String(
  selectedPlan.DataPlan ?? '',
).trim();

const planName = String(
  selectedPlan.DataPlanName ?? '',
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

/*
 * PIN is cleared immediately before the
 * transaction request starts.
 *
 * The processing modal remains visible while
 * the purchase is being processed.
 */
setPin('');

setPurchasing(true);

try {
  const response = await fetch(
    '/api/purchase/data',
    {
      method: 'POST',
      headers: {
        'Content-Type':
          'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        network,
        phone:
          normalizeNigerianNumber(
            phone,
          ),
        planCode,
        planName,
        planPrice: amount,
        idempotencyKey:
          idempotencyKey.current,
        purchasePin,
      }),
    },
  );

  let result: Record<
    string,
    any
  > = {};

  try {
    result =
      await response.json();
  } catch {
    result = {};
  }

  if (
    !response.ok &&
    !result.success
  ) {
    throw new Error(
      result.error ||
        result.message ||
        'Data purchase failed.',
    );
  }

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
      result?.transaction
        ?.reference ??
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
      normalizeNigerianNumber(
        phone,
      ),

    amount,

    cashback: numberValue(
      result?.transaction
        ?.cashback ??
        result?.cashback ??
        0,
    ),

    status: 'success',

    createdAt: String(
      result?.transaction
        ?.createdAt ??
        new Date().toISOString(),
    ),

    paymentMethod: 'Wallet',
  };

  await refreshWallet();

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

function handlePinChange(
value: string,
) {
if (purchasing) {
return;
}

const nextPin = value
  .replace(/\D/g, '')
  .slice(0, 4);

setPin(nextPin);

/*
 * The purchase PIN is intentionally a 4-digit
 * numeric-only flow. As soon as the fourth digit
 * arrives, remove focus from the input first so the
 * Android/iOS keyboard closes immediately. The
 * purchase then starts without requiring a Confirm
 * button tap.
 */
if (nextPin.length === 4) {
  pinInputRef.current?.blur();
  void purchase(nextPin);
}
}

return (
<div className="min-h-screen bg-[#F8FAFC] pb-24 text-slate-900">
<div className="mx-auto w-full max-w-2xl px-3 py-3">

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

    <section className="mb-3 rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_2px_7px_rgba(15,23,42,0.04)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
            Wallet Balance
          </p>

          <p className="mt-1 text-[22px] font-black text-slate-900">
            {formatMoney(
              currentBalance,
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            void refreshWallet()
          }
          className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100"
        >
          <RefreshCw className="h-4 w-4 text-slate-600" />
        </button>
      </div>
    </section>

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

    <section className="mb-3 rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_2px_7px_rgba(15,23,42,0.04)]">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
          Phone Number
        </span>

        <button
          type="button"
          onClick={() =>
            void chooseContact()
          }
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

    <section className="mb-3">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {VALIDITY_FILTERS.map(
          item => {
            const active =
              validityFilter ===
              item;

            return (
              <button
                key={item}
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
          },
        )}
      </div>
    </section>

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
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {visiblePlans.map(
          item => {
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
                  setSelectedPlan(
                    item,
                  )
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
          },
        )}
      </div>
    )}

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

  {pinOpen && (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-[25px] bg-white p-4 shadow-2xl">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#C7A91F]" />

          <div>
            <p className="text-sm font-black">
              {purchasing
                ? 'Processing Purchase'
                : 'Confirm Purchase'}
            </p>

            <p className="text-[9px] text-slate-400">
              {purchasing
                ? 'Please wait while your data purchase is being processed.'
                : 'Enter your 4-digit purchase PIN.'}
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

        {purchasing ? (
          <div className="flex h-12 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
            <RefreshCw className="h-5 w-5 animate-spin text-slate-700" />
          </div>
        ) : (
          <input
            ref={pinInputRef}
            autoFocus
            type="tel"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            value={pin}
            onChange={event =>
              handlePinChange(
                event.target.value,
              )
            }
            onKeyDown={event => {
              if (
                event.key === 'Enter' &&
                pin.length === 4
              ) {
                void purchase();
              }
            }}
            className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 text-center text-xl font-black tracking-[0.7em] outline-none [appearance:textfield] [-webkit-text-security:disc]"
            placeholder="••••"
            autoComplete="off"
          />
        )}

        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              if (purchasing) {
                return;
              }

              setPinOpen(false);
              setPin('');
            }}
            disabled={purchasing}
            className="rounded-lg border border-slate-200 py-2.5 text-[10px] font-bold disabled:opacity-40"
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

