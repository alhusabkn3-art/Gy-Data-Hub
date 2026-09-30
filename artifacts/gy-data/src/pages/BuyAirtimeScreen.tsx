// artifacts/gy-data/src/pages/BuyAirtimeScreen.tsx

import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Loader2,
  Phone,
  Smartphone,
  Wallet,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { toast } from 'sonner';

function formatMoney(value: unknown) {
  const amount = Number(value ?? 0);
  return `₦${amount.toLocaleString('en-NG')}`;
}

function isValidNigerianNumber(value: string) {
  const phone = value.replace(/\D/g, '');
  return /^(?:0|234)?[789]\d{9}$/.test(phone);
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');

  if (digits.startsWith('234')) {
    return `0${digits.slice(3)}`;
  }

  return digits;
}

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function BuyAirtimeScreen({
  onBack,
}: {
  onBack?: () => void;
}) {
  const {
    balance,
    purchaseAirtime,
    networks,
    refreshWallet,
  } = useApp();

  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedNetwork, setSelectedNetwork] = useState<any>(null);
  const [purchasePin, setPurchasePin] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const numAmount = useMemo(
    () => numberValue(amount),
    [amount],
  );

  const networkList = useMemo(
    () => Array.isArray(networks) ? networks : [],
    [networks],
  );

  function selectNetwork(network: any) {
    setSelectedNetwork(network);
  }

  function preparePurchase() {
    if (!isValidNigerianNumber(phone)) {
      toast.error('Enter a valid Nigerian phone number.');
      return;
    }

    if (numAmount <= 0) {
      toast.error('Enter a valid airtime amount.');
      return;
    }

    if (numAmount < 50) {
      toast.error('Minimum airtime amount is ₦50.');
      return;
    }

    if (balance < numAmount) {
      toast.error('Insufficient wallet balance.');
      return;
    }

    if (!selectedNetwork) {
      toast.error('Select a network.');
      return;
    }

    setPurchasePin('');
    setShowConfirm(true);
  }

  async function handlePurchaseWithPin(pin: string) {
    if (pin.length !== 4) {
      toast.error('Purchase PIN must be exactly 4 digits.');
      return;
    }

    if (isLoading) {
      return;
    }

    setIsLoading(true);

    try {
      const result = await purchaseAirtime({
        phone: normalizePhone(phone),
        amount: numAmount,
        network:
          selectedNetwork?.code ??
          selectedNetwork?.network ??
          selectedNetwork?.name,
        purchasePin: pin,
      });

      if (!result?.success) {
        toast.error(
          result?.error ||
          result?.message ||
          'Airtime purchase failed.',
        );
        return;
      }

      toast.success('Airtime purchase successful.');

      setShowConfirm(false);
      setPurchasePin('');
      setAmount('');

      await refreshWallet?.();
    } catch (error) {
      console.error(error);

      toast.error(
        error instanceof Error
          ? error.message
          : 'Airtime purchase failed.',
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-xl px-4 pb-28 pt-4">
        <div className="mb-6 flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}

          <div>
            <h1 className="text-xl font-black">
              Buy Airtime
            </h1>

            <p className="text-xs text-muted-foreground">
              Recharge any Nigerian network
            </p>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>

              <div>
                <p className="text-xs text-muted-foreground">
                  Wallet Balance
                </p>

                <p className="text-xl font-black">
                  {formatMoney(balance)}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-5 rounded-3xl border border-border bg-card p-5 shadow-sm">
          <div>
            <label className="mb-2 block text-sm font-bold">
              Select Network
            </label>

            <div className="grid grid-cols-2 gap-3">
              {networkList.map((network: any, index: number) => {
                const key =
                  network?.code ??
                  network?.id ??
                  network?.name ??
                  index;

                const selected =
                  selectedNetwork?.code === network?.code ||
                  selectedNetwork?.id === network?.id ||
                  selectedNetwork?.name === network?.name;

                return (
                  <button
                    key={String(key)}
                    type="button"
                    onClick={() => selectNetwork(network)}
                    className={`rounded-2xl border-2 p-4 text-left transition ${
                      selected
                        ? 'border-primary bg-primary/5'
                        : 'border-border bg-background'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                          <Smartphone className="h-5 w-5 text-primary" />
                        </div>

                        <div>
                          <p className="text-sm font-black">
                            {network?.name ?? 'Network'}
                          </p>

                          <p className="text-[10px] text-muted-foreground">
                            Airtime
                          </p>
                        </div>
                      </div>

                      {selected && (
                        <CheckCircle2 className="h-5 w-5 text-primary" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label
              htmlFor="airtime-phone"
              className="mb-2 block text-sm font-bold"
            >
              Phone Number
            </label>

            <div className="relative">
              <Phone className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />

              <input
                id="airtime-phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={event =>
                  setPhone(
                    event.target.value
                      .replace(/\D/g, '')
                      .slice(0, 11),
                  )
                }
                placeholder="08012345678"
                className="h-14 w-full rounded-2xl border border-border bg-background pl-12 pr-4 text-base font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="airtime-amount"
              className="mb-2 block text-sm font-bold"
            >
              Amount
            </label>

            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-black text-muted-foreground">
                ₦
              </span>

              <input
                id="airtime-amount"
                type="text"
                inputMode="numeric"
                value={amount}
                onChange={event =>
                  setAmount(
                    event.target.value
                      .replace(/\D/g, '')
                      .slice(0, 7),
                  )
                }
                placeholder="Enter amount"
                className="h-14 w-full rounded-2xl border border-border bg-background pl-10 pr-4 text-lg font-black outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {[100, 200, 500, 1000, 2000, 5000].map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setAmount(String(value))}
                  className="rounded-xl border border-border bg-background px-4 py-2 text-xs font-bold transition hover:border-primary"
                >
                  ₦{value.toLocaleString('en-NG')}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={preparePurchase}
            disabled={isLoading}
            className="h-14 w-full rounded-2xl bg-primary text-base font-black text-primary-foreground shadow-lg shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continue
          </button>
        </div>
      </div>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-lg font-black">
                  Confirm Purchase
                </p>

                <p className="text-xs text-muted-foreground">
                  Enter your 4-digit Purchase PIN.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!isLoading) {
                    setShowConfirm(false);
                    setPurchasePin('');
                  }
                }}
                disabled={isLoading}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-muted"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-5 rounded-2xl bg-muted/40 p-4">
              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Network
                </span>

                <span className="font-bold">
                  {selectedNetwork?.name ?? 'Network'}
                </span>
              </div>

              <div className="mb-3 flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Number
                </span>

                <span className="font-bold">
                  {phone}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Amount
                </span>

                <span className="font-black text-primary">
                  ₦
                  {numAmount.toLocaleString('en-NG')}
                </span>
              </div>
            </div>

            <input
              type={purchasePin.length === 4 ? 'password' : 'text'}
              inputMode="numeric"
              autoComplete="off"
              maxLength={4}
              value={purchasePin}
              onChange={event => {
                setPurchasePin(
                  event.target.value
                    .replace(/\D/g, '')
                    .slice(0, 4),
                );
              }}
              onKeyDown={event => {
                if (
                  event.key === 'Enter' &&
                  purchasePin.length === 4 &&
                  !isLoading
                ) {
                  void handlePurchaseWithPin(
                    purchasePin,
                  );
                }
              }}
              placeholder="4-digit Purchase PIN"
              aria-label="Purchase PIN"
              disabled={isLoading}
              className="h-14 w-full rounded-xl border-2 border-border bg-background px-4 text-center text-2xl font-bold tracking-[0.45em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            <p className="mt-3 text-center text-xs text-muted-foreground">
              Your PIN becomes hidden automatically after all 4 digits are entered.
            </p>

            <button
              type="button"
              onClick={() =>
                void handlePurchaseWithPin(
                  purchasePin,
                )
              }
              disabled={
                purchasePin.length !== 4 ||
                isLoading
              }
              className="mt-5 h-14 w-full rounded-2xl bg-primary text-base font-black text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Processing...
                </span>
              ) : (
                'Confirm Purchase'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
