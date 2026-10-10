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
: 'bg-[#008CC8] text-white';

return (
<div
className={`
flex h-10 w-10 items-center
justify-center rounded-xl text-[10px]
font-black shadow-sm
${logoClass}
${selected ? 'ring-2 ring-slate-900/10' : ''}
`}
>
{logoText}
</div>
);
}

function planId(plan: DataPlan): string {
return String(
plan.id ??
plan.DataPlanID ??
plan.DataPlanName ??
`${plan.DataPlanType}-${plan.Price}`,
);
}

function planPrice(plan: DataPlan): number {
return numberValue(
plan.Price ??
plan.price,
);
}

function planName(plan: DataPlan): string {
return String(
plan.DataPlanName ??
plan.name ??
'Data Plan',
);
}

function planValidity(plan: DataPlan): string {
const raw =
plan.Validity ??
plan.validity ??
plan.Duration ??
plan.duration;

if (raw !== undefined && raw !== null) {
return String(raw);
}

const detected = getValidity(plan);

if (detected === 'DAILY') {
return '1 Day';
}

if (detected === 'WEEKLY') {
return '7 Days';
}

if (detected === 'MONTHLY') {
return '30 Days';
}

if (detected === '30 DAYS') {
return '30 Days';
}

return '';
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

const phoneInputRef =
useRef<HTMLInputElement | null>(null);

const [
selectedPlan,
setSelectedPlan,
] = useState<DataPlan | null>(null);

const [pinOpen, setPinOpen] =
useState(false);

const [pin, setPin] =
useState('');

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

// Automatically close the numeric keyboard when
// the complete Nigerian phone number has been entered.
if (digits.length === 11) {
requestAnimationFrame(() => {
phoneInputRef.current?.blur();
});
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

// Once the contact picker returns the selected
// number, immediately leave the phone field blurred
// so the user is back on the Buy Data screen.
requestAnimationFrame(() => {
phoneInputRef.current?.blur();
});
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
if (!phone) {
toast.error(
'Enter a phone number.',
);
return;
}

const normalized =
normalizeNigerianNumber(phone);

if (
!isValidNigerianNumber(
normalized,
)
) {
toast.error(
'Enter a valid Nigerian phone number.',
);
return;
}

if (!selectedPlan) {
toast.error(
'Select a data plan first.',
);
return;
}

const price =
planPrice(selectedPlan);

if (price > currentBalance) {
toast.error(
'Insufficient wallet balance.',
);
return;
}

setPin('');
setPinOpen(true);
}

function handlePinChange(
value: string,
) {
const digits = value
.replace(/\D/g, '')
.slice(0, 4);

setPin(digits);
}

async function purchase() {
if (purchasing) {
return;
}

if (!selectedPlan) {
toast.error(
'Select a data plan first.',
);
return;
}

const normalized =
normalizeNigerianNumber(phone);

if (
!isValidNigerianNumber(
normalized,
)
) {
toast.error(
'Enter a valid Nigerian phone number.',
);
return;
}

if (pin.length !== 4) {
toast.error(
'Enter your 4-digit purchase PIN.',
);
return;
}

const price =
planPrice(selectedPlan);

if (price > currentBalance) {
toast.error(
'Insufficient wallet balance.',
);
return;
}

setPurchasing(true);

try {
const response =
await fetch(
'/api/data/purchase',
{
method: 'POST',
headers: {
'Content-Type':
'application/json',
'Idempotency-Key':
idempotencyKey.current ??
'',
},
body: JSON.stringify({
network,
phone: normalized,
planId:
selectedPlan.id ??
selectedPlan.DataPlanID,
planName:
planName(selectedPlan),
amount: price,
pin,
}),
},
);

const data =
await response.json().catch(
() => ({}),
);

if (!response.ok) {
throw new Error(
data?.error ??
data?.message ??
'Data purchase failed.',
);
}

idempotencyKey.current =
null;

setPinOpen(false);
setPin('');

await refreshWallet();

setSuccessReceipt({
transactionId:
data?.transactionId ??
data?.reference ??
data?.transactionReference ??
'',
type: 'Data Purchase',
amount: price,
phone: normalized,
network:
selectedNetwork.name,
description:
planName(selectedPlan),
status: 'success',
});

setSuccessOpen(true);
} catch (error) {
console.error(
'Data purchase failed:',
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

useEffect(() => {
if (
pinOpen &&
!idempotencyKey.current
) {
idempotencyKey.current =
`${Date.now()}-${Math.random()
.toString(36)
.slice(2)}`;
}
}, [pinOpen]);

return (
<div className="min-h-screen bg-[#F6F7F9] pb-28">
<div className="mx-auto w-full max-w-2xl px-3 pb-8 pt-3 sm:px-5">
<header className="mb-3 flex items-center justify-between">
<div className="flex items-center gap-2">
<button
type="button"
onClick={() =>
setLocation('/dashboard')
}
className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm"
>
<ArrowLeft className="h-5 w-5 text-slate-700" />
</button>

<div>
<p className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400">
Services
</p>

<h1 className="text-lg font-black text-[#10243F]">
Buy Data
</h1>
</div>
</div>

<div className="rounded-xl bg-[#10243F] px-3 py-2 text-right text-white shadow-sm">
<p className="text-[8px] font-semibold uppercase tracking-[0.1em] text-white/60">
Wallet Balance
</p>

<p className="text-sm font-black">
{formatMoney(
currentBalance,
)}
</p>
</div>
</header>

<section className="mb-3 overflow-hidden rounded-[20px] bg-[#10243F] p-4 text-white shadow-[0_8px_25px_rgba(16,36,63,0.12)]">
<div className="flex items-start justify-between gap-3">
<div>
<div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1">
<Sparkles className="h-3 w-3 text-[#D8B52B]" />

<span className="text-[9px] font-bold">
Fast Data Purchase
</span>
</div>

<h2 className="max-w-[250px] text-xl font-black leading-tight">
Stay connected with affordable data.
</h2>

<p className="mt-1.5 max-w-[300px] text-[10px] leading-4 text-white/65">
Choose your network, enter the recipient
number and select a data plan.
</p>
</div>

<div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/10">
<Gift className="h-7 w-7 text-[#D8B52B]" />
</div>
</div>
</section>

<section className="mb-3 rounded-[18px] border border-slate-200 bg-white p-3 shadow-[0_2px_7px_rgba(15,23,42,0.04)]">
<div className="mb-2 flex items-center justify-between">
<span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
Network
</span>

<span className="text-[9px] font-semibold text-slate-400">
Select network
</span>
</div>

<div className="grid grid-cols-4 gap-2">
{NETWORKS.map(item => {
const active =
network === item.id;

return (
<button
key={item.id}
type="button"
onClick={() =>
changeNetwork(
item.id,
)
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
</div>
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
className="rounded-full bg-[#D8B52B] px-3 py-1.5 text-[10px] font-bold text-slate-900"
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
onKeyDown={event => {
if (
event.key === 'Enter' ||
event.key === 'Done'
) {
phoneInputRef.current?.blur();
}
}}
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

{phone && (
<div className="mt-2 flex items-center gap-1.5">
{isValidNigerianNumber(
normalizeNigerianNumber(
phone,
),
) ? (
<>
<Check className="h-3.5 w-3.5 text-emerald-600" />

<span className="text-[9px] font-semibold text-emerald-600">
Valid Nigerian number
</span>
</>
) : (
<>
<AlertCircle className="h-3.5 w-3.5 text-amber-500" />

<span className="text-[9px] font-semibold text-amber-600">
Enter a valid 11-digit number
</span>
</>
)}
</div>
)}
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
disabled={!exists}
onClick={() => {
if (exists) {
setTab(item);
setSelectedPlan(
null,
);
}
}}
className={`
shrink-0 rounded-full
px-3 py-2 text-[9px]
font-black transition
${
active
? 'bg-[#10243F] text-white'
: exists
? 'bg-white text-slate-500 border border-slate-200'
: 'bg-slate-100 text-slate-300'
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
{VALIDITY_FILTERS.map(item => {
const active =
validityFilter === item;

const exists =
item === 'ALL' ||
availableValidities.has(
item,
);

return (
<button
key={item}
type="button"
disabled={!exists}
onClick={() => {
if (exists) {
setValidityFilter(
item,
);
setSelectedPlan(
null,
);
}
}}
className={`
shrink-0 rounded-lg
px-3 py-2 text-[9px]
font-bold transition
${
active
? 'bg-[#D8B52B] text-slate-900'
: exists
? 'border border-slate-200 bg-white text-slate-500'
: 'border border-slate-100 bg-slate-50 text-slate-300'
}
`}
>
{item}
</button>
);
})}
</div>
</section>

<section>
<div className="mb-2 flex items-center justify-between">
<div>
<p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">
Available Plans
</p>

<p className="text-[9px] text-slate-400">
{selectedNetwork.name} · {tab}
</p>
</div>

{!loadingPlans && (
<span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-bold text-slate-500 shadow-sm">
{visiblePlans.length} plans
</span>
)}
</div>

{loadingPlans ? (
<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
{Array.from({
length: 6,
}).map((_, index) => (
<div
key={index}
className="h-[132px] animate-pulse rounded-[16px] border border-slate-200 bg-white"
/>
))}
</div>
) : plansError ? (
<div className="rounded-[18px] border border-red-100 bg-red-50 p-4">
<div className="flex items-start gap-2">
<AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />

<div className="min-w-0 flex-1">
<p className="text-[10px] font-black text-red-700">
Unable to load data plans
</p>

<p className="mt-1 text-[9px] leading-4 text-red-600">
{plansError}
</p>

<button
type="button"
onClick={() =>
void loadPlans()
}
className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-2 text-[9px] font-bold text-white"
>
<RefreshCw className="h-3 w-3" />
Retry
</button>
</div>
</div>
) : visiblePlans.length === 0 ? (
<div className="rounded-[18px] border border-slate-200 bg-white p-6 text-center">
<div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
<Gift className="h-5 w-5 text-slate-400" />
</div>

<p className="mt-3 text-[11px] font-black text-slate-600">
No data plans found
</p>

<p className="mt-1 text-[9px] leading-4 text-slate-400">
Try another plan category or validity filter.
</p>
</div>
) : (
<div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
{visiblePlans.map(plan => {
const active =
selectedPlan &&
planId(
selectedPlan,
) === planId(plan);

const price =
planPrice(plan);

const validity =
planValidity(plan);

return (
<motion.button
key={planId(plan)}
type="button"
whileTap={{
scale: 0.98,
}}
onClick={() =>
setSelectedPlan(
plan,
)
}
className={`
relative flex min-h-[132px]
flex-col rounded-[17px]
border bg-white p-3
text-left shadow-[0_2px_7px_rgba(15,23,42,0.05)]
transition
${
active
? 'border-[#10243F] ring-2 ring-[#10243F]/10'
: 'border-slate-200'
}
`}
>
{active && (
<div className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#10243F] text-white">
<Check className="h-3 w-3" />
</div>
)}

<div className="pr-5">
<p className="text-[12px] font-black leading-4 text-[#10243F]">
{planName(plan)}
</p>

{validity && (
<p className="mt-1 text-[9px] font-semibold text-slate-400">
{validity}
</p>
)}
</div>

<div className="mt-auto pt-4">
<p className="text-[15px] font-black text-[#10243F]">
{formatMoney(price)}
</p>

<p className="mt-0.5 text-[8px] font-semibold text-slate-400">
Tap to select
</p>
</div>
</motion.button>
);
})}
</div>
)}
</section>
</div>

{selectedPlan && (
<div className="fixed bottom-0 left-0 right-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
<div className="mx-auto flex max-w-2xl items-center gap-2">
<div className="min-w-0 flex-1">
<p className="truncate text-[10px] font-black text-[#10243F]">
{planName(
selectedPlan,
)}
</p>

<p className="mt-0.5 text-[9px] text-slate-400">
{selectedNetwork.name} · {phone}
</p>

<p className="text-[14px] font-black text-[#10243F]">
{formatMoney(
planPrice(
selectedPlan,
),
)}
</p>
</div>

<button
type="button"
onClick={
preparePurchase
}
disabled={
!phone ||
!isValidNigerianNumber(
normalizeNigerianNumber(
phone,
),
)
}
className="shrink-0 rounded-xl bg-[#10243F] px-5 py-3 text-[10px] font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
>
Buy Now
</button>
</div>
</div>
)}

{pinOpen && (
<div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-3 sm:items-center">
<div className="w-full max-w-sm rounded-[24px] bg-white p-4 shadow-2xl">
<div className="mb-3 flex items-start justify-between">
<div>
<p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">
Purchase PIN
</p>

<h3 className="mt-1 text-lg font-black text-[#10243F]">
{purchasing
? 'Processing Purchase'
: 'Confirm Purchase'}
</h3>

<p className="mt-1 text-[9px] text-slate-400">
{purchasing
? 'Please wait while your data purchase is being processed.'
: 'Enter your 4-digit purchase PIN.'}
</p>
</div>

<button
type="button"
disabled={purchasing}
onClick={() => {
if (!purchasing) {
setPinOpen(false);
setPin('');
}
}}
className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 disabled:opacity-40"
>
<X className="h-4 w-4 text-slate-500" />
</button>
</div>

<div className="mb-3 rounded-xl bg-slate-50 p-3 text-center">
<p className="text-[10px] font-bold">
{selectedPlan?.DataPlanName}
</p>

<p className="mt-1 text-base font-black">
{formatMoney(
selectedPlan?.Price,
)}
</p>

<p className="text-[9px] text-slate-400">
{selectedNetwork.name}
{' '}
· {phone}
</p>
</div>

{purchasing ? (
<div className="flex h-12 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
<RefreshCw className="h-5 w-5 animate-spin text-slate-700" />
</div>
) : (
<input
autoFocus
type="password"
inputMode="numeric"
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
className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 text-center text-xl font-black tracking-[0.7em] outline-none"
placeholder="••••"
autoComplete="off"
/>
)}

<div className="mt-3 grid grid-cols-2 gap-2">
<button
type="button"
disabled={purchasing}
onClick={() => {
if (purchasing) {
return;
}

setPinOpen(false);
setPin('');
}}
className="rounded-lg border border-slate-200 bg-white py-2.5 text-[10px] font-bold text-slate-600 disabled:opacity-40"
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
