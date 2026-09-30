// artifacts/gy-data/src/pages/BuyDataScreen.tsx

import React, {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Loader2,
  Phone,
  Search,
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

function numberValue(value: unknown) {
  const parsed = Number(
    String(value ?? '').replace(/,/g, ''),
  );

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function isValidNigerianNumber(
  value: string,
) {
  const phone = value.replace(/\D/g, '');

  return /^(?:0|234)?[789]\d{9}$/.test(
    phone,
  );
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, '');

  if (digits.startsWith('234')) {
    return `0${digits.slice(3)}`;
  }

  return digits;
}

export default function BuyDataScreen({
  onBack,
}: {
  onBack?: () => void;
}) {
  const {
    balance,
    networks,
    dataPlans,
    purchaseData,
    refreshWallet,
  } = useApp();

  const [phone, setPhone] = useState('');
  const [selectedNetwork, setSelectedNetwork] =
    useState<any>(null);
  const [selectedPlan, setSelectedPlan] =
    useState<any>(null);
  const [search, setSearch] = useState('');
  const [pinOpen, setPinOpen] = useState(false);
  const [pin, setPin] = useState('');
  const [isLoading, setIsLoading] =
    useState(false);

  const networkList = useMemo(
    () =>
      Array.isArray(networks)
        ? networks
        : [],
    [networks],
  );

  const planList = useMemo(
    () =>
      Array.isArray(dataPlans)
        ? dataPlans
        : [],
    [dataPlans],
  );

  const filteredPlans = useMemo(() => {
    const value = search
      .trim()
      .toLowerCase();

    if (!value) {
      return planList;
    }

    return planList.filter(
      (plan: any) =>
        String(
          plan?.DataPlanName ??
          plan?.name ??
          plan?.plan ??
          '',
        )
          .toLowerCase()
          .includes(value),
    );
  }, [planList, search]);

  useEffect(() => {
    if (
      selectedNetwork &&
      !networkList.some(
        (network: any) =>
          network?.code ===
            selectedNetwork?.code ||
          network?.id ===
            selectedNetwork?.id ||
          network?.name ===
            selectedNetwork?.name,
      )
    ) {
      setSelectedNetwork(null);
      setSelectedPlan(null);
    }
  }, [
    networkList,
    selectedNetwork,
  ]);

  function selectNetwork(
    network: any,
  ) {
    setSelectedNetwork(network);
    setSelectedPlan(null);
  }

  function getPlanAmount(
    plan: any,
  ) {
    return numberValue(
      plan?.Price ??
      plan?.price ??
      plan?.amount,
    );
  }

  function getPlanName(
    plan: any,
  ) {
    return String(
      plan?.DataPlanName ??
      plan?.name ??
      plan?.plan ??
      'Data Plan',
    );
  }

  function preparePurchase() {
    if (
      !isValidNigerianNumber(
        phone,
      )
    ) {
      toast.error(
        'Enter a valid Nigerian phone number.',
      );

      return;
    }

    if (
      !selectedNetwork
    ) {
      toast.error(
        'Select a network.',
      );

      return;
    }

    if (
      !selectedPlan
    ) {
      toast.error(
        'Select a data plan.',
      );

      return;
    }

    const amount =
      getPlanAmount(
        selectedPlan,
      );

    if (
      amount <= 0
    ) {
      toast.error(
        'This plan has an invalid price.',
      );

      return;
    }

    if (
      balance < amount
    ) {
      toast.error(
        'Insufficient wallet balance.',
      );

      return;
    }

    setPin('');

    setPinOpen(
      true,
    );
  }

  async function purchase() {
    if (
      pin.length !== 4
    ) {
      toast.error(
        'Purchase PIN must be exactly 4 digits.',
      );

      return;
    }

    if (
      isLoading
    ) {
      return;
    }

    if (
      !selectedPlan ||
      !selectedNetwork
    ) {
      toast.error(
        'Select a network and data plan.',
      );

      return;
    }

    const amount =
      getPlanAmount(
        selectedPlan,
      );

    if (
      amount <= 0
    ) {
      toast.error(
        'Invalid data plan amount.',
      );

      return;
    }

    if (
      balance < amount
    ) {
      toast.error(
        'Insufficient wallet balance.',
      );

      return;
    }

    setIsLoading(
      true,
    );

    try {
      const result =
        await purchaseData({
          phone:
            normalizePhone(
              phone,
            ),
          network:
            selectedNetwork?.code ??
            selectedNetwork?.network ??
            selectedNetwork?.name,
          plan:
            selectedPlan,
          amount,
          purchasePin:
            pin,
        });

      if (
        !result?.success
      ) {
        toast.error(
          result?.error ||
          result?.message ||
          'Data purchase failed.',
        );

        return;
      }

      toast.success(
        'Data purchase successful.',
      );

      setPinOpen(
        false,
      );

      setPin('');

      await refreshWallet?.();
    } catch (error) {
      console.error(
        error,
      );

      toast.error(
        error instanceof Error
          ? error.message
          : 'Data purchase failed.',
      );
    } finally {
      setIsLoading(
        false,
      );
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto w-full max-w-xl px-4 pb-28 pt-4">
        <div className="mb-6 flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={
                onBack
              }
              className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}

          <div>
            <h1 className="text-xl font-black">
              Buy Data
            </h1>

            <p className="text-xs text-muted-foreground">
              Choose your network and data plan
            </p>
          </div>
        </div>

        <div className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
              <Wallet className="h-5 w-5 text-primary" />
            </div>

            <div>
              <p className="text-xs text-muted-foreground">
                Wallet Balance
              </p>

              <p className="text-xl font-black">
                {formatMoney(
                  balance,
                )}
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <label className="mb-3 block text-sm font-bold">
              Select Network
            </label>

            <div className="grid grid-cols-2 gap-3">
              {networkList.map(
                (
                  network: any,
                  index: number,
                ) => {
                  const key =
                    network?.code ??
                    network?.id ??
                    network?.name ??
                    index;

                  const selected =
                    selectedNetwork?.code ===
                      network?.code ||
                    selectedNetwork?.id ===
                      network?.id ||
                    selectedNetwork?.name ===
                      network?.name;

                  return (
                    <button
                      key={String(
                        key,
                      )}
                      type="button"
                      onClick={() =>
                        selectNetwork(
                          network,
                        )
                      }
                      className={`rounded-2xl border-2 p-4 text-left transition ${
                        selected
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-background'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                            <Smartphone className="h-5 w-5 text-primary" />
                          </div>

                          <div>
                            <p className="text-sm font-black">
                              {
                                network?.name ??
                                'Network'
                              }
                            </p>

                            <p className="text-[10px] text-muted-foreground">
                              Data
                            </p>
                          </div>
                        </div>

                        {selected && (
                          <Check className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    </button>
                  );
                },
              )}
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <label
              htmlFor="data-phone"
              className="mb-2 block text-sm font-bold"
            >
              Phone Number
            </label>

            <div className="relative">
              <Phone className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />

              <input
                id="data-phone"
                type="tel"
                inputMode="numeric"
                value={phone}
                onChange={event =>
                  setPhone(
                    event.target.value
                      .replace(
                        /\D/g,
                        '',
                      )
                      .slice(
                        0,
                        11,
                      ),
                  )
                }
                placeholder="08012345678"
                className="h-14 w-full rounded-2xl border border-border bg-background pl-12 pr-4 text-base font-semibold outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-black">
                  Data Plans
                </p>

                <p className="text-[10px] text-muted-foreground">
                  {
                    selectedNetwork?.name ??
                    'Select a network'
                  }
                </p>
              </div>

              <div className="relative w-40">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

                <input
                  type="text"
                  value={search}
                  onChange={event =>
                    setSearch(
                      event.target.value,
                    )
                  }
                  placeholder="Search"
                  className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-xs outline-none focus:border-primary"
                />
              </div>
            </div>

            {!selectedNetwork ? (
              <div className="rounded-2xl bg-muted/40 p-6 text-center">
                <Smartphone className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />

                <p className="text-sm font-bold">
                  Select a network first
                </p>
              </div>
            ) : filteredPlans.length === 0 ? (
              <div className="rounded-2xl bg-muted/40 p-6 text-center">
                <p className="text-sm font-bold">
                  No data plans found
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {filteredPlans.map(
                  (
                    plan: any,
                    index: number,
                  ) => {
                    const amount =
                      getPlanAmount(
                        plan,
                      );

                    const selected =
                      selectedPlan ===
                      plan;

                    return (
                      <button
                        key={
                          String(
                            plan?.id ??
                            plan?.PlanID ??
                            index,
                          )
                        }
                        type="button"
                        onClick={() =>
                          setSelectedPlan(
                            plan,
                          )
                        }
                        className={`rounded-2xl border-2 p-4 text-left transition ${
                          selected
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-background'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-black">
                              {
                                getPlanName(
                                  plan,
                                )
                              }
                            </p>

                            <p className="mt-1 text-base font-black text-primary">
                              {formatMoney(
                                amount,
                              )}
                            </p>
                          </div>

                          {selected && (
                            <Check className="h-5 w-5 shrink-0 text-primary" />
                          )}
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            )}
          </div>

          {selectedPlan && (
            <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-4 rounded-2xl bg-muted/40 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Selected Plan
                    </p>

                    <p className="mt-1 text-base font-black">
                      {
                        getPlanName(
                          selectedPlan,
                        )
                      }
                    </p>
                  </div>

                  <p className="text-lg font-black text-primary">
                    {formatMoney(
                      getPlanAmount(
                        selectedPlan,
                      ),
                    )}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={
                  preparePurchase
                }
                disabled={
                  isLoading
                }
                className="h-14 w-full rounded-2xl bg-primary text-base font-black text-primary-foreground shadow-lg shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Continue
              </button>
            </div>
          )}
        </div>
      </div>

      {pinOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-3xl bg-white p-5 text-slate-900 shadow-2xl sm:rounded-3xl">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100">
                  <Wallet className="h-5 w-5 text-slate-900" />
                </div>

                <div>
                  <p className="text-base font-black">
                    Confirm Purchase
                  </p>

                  <p className="text-[10px] text-slate-400">
                    Enter your
                    4-digit purchase
                    PIN.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!isLoading) {
                    setPinOpen(
                      false,
                    );

                    setPin('');
                  }
                }}
                disabled={
                  isLoading
                }
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 rounded-2xl bg-slate-50 p-4 text-center">
              <p className="text-xs font-bold">
                {
                  getPlanName(
                    selectedPlan,
                  )
                }
              </p>

              <p className="mt-1 text-lg font-black">
                {formatMoney(
                  selectedPlan?.Price ??
                  selectedPlan?.price ??
                  selectedPlan?.amount,
                )}
              </p>

              <p className="text-[10px] text-slate-400">
                {
                  selectedNetwork?.name ??
                  'Network'
                }
                {' '}
                ·{' '}
                {phone}
              </p>
            </div>

            <input
              autoFocus
              type={pin.length === 4 ? 'password' : 'text'}
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
                    .slice(
                      0,
                      4,
                    ),
                )
              }
              onKeyDown={event => {
                if (
                  event.key ===
                  'Enter'
                ) {
                  void purchase();
                }
              }}
              className="h-14 w-full rounded-2xl border border-slate-200 bg-slate-50 text-center text-2xl font-black tracking-[0.7em] outline-none focus:border-slate-900"
              placeholder="4-digit Purchase PIN"
              disabled={
                isLoading
              }
              aria-label="Purchase PIN"
              autoComplete="off"
            />

            <p className="mt-3 text-center text-[10px] text-slate-400">
              The PIN is visible while entering and automatically hides after all 4 digits are entered.
            </p>

            <button
              type="button"
              onClick={() =>
                void purchase()
              }
              disabled={
                pin.length !==
                  4 ||
                isLoading
              }
              className="mt-4 h-14 w-full rounded-2xl bg-slate-900 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
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

            <p className="mt-3 text-center text-[10px] text-slate-400">
              Enter your Purchase PIN, not your Login PIN.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
