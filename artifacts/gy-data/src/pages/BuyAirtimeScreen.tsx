import React, {
  useEffect,
  useRef,
  useState,
} from 'react';

import { motion } from 'framer-motion';

import {
  ChevronLeft,
} from 'lucide-react';

import { useLocation } from 'wouter';

import { Button } from '@/components/ui/button';

import { useAppContext } from '../context/AppContext';

import SuccessModal from '@/components/SuccessModal';

import type { ReceiptData } from '@/components/TransactionReceipt';

import { toast } from 'sonner';

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

const quickAmounts = [
  100,
  200,
  500,
  1000,
  2000,
  5000,
];

interface AirtimePurchaseResponse {
  success?: boolean;
  duplicate?: boolean;
  pending?: boolean;
  status?: string;

  requestId?: string;
  reference?: string;

  error?: string;
  message?: string;

  balance?: number | string;
  amount?: number | string;

  network?: string;
  phone?: string;

  providerReference?: string;
}

function makeIdempotencyKey(): string {
  return `GY-AIR-${Date.now()
    .toString(36)
    .toUpperCase()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

export default function BuyAirtimeScreen() {
  const [, setLocation] =
    useLocation();

  const {
    balance,
    refreshWallet,
    refreshCashbackWallet,
  } = useAppContext();

  const [
    network,
    setNetwork,
  ] = useState('');

  const [
    phone,
    setPhone,
  ] = useState('');

  const [
    amount,
    setAmount,
  ] = useState('');

  const [
    isLoading,
    setIsLoading,
  ] = useState(false);

  const [
    showPurchasePin,
    setShowPurchasePin,
  ] = useState(false);

  const [
    purchasePin,
    setPurchasePin,
  ] = useState('');

  const [
    showSuccess,
    setShowSuccess,
  ] = useState(false);

  const [
    successData,
    setSuccessData,
  ] = useState<ReceiptData | null>(
    null,
  );

  const idempotencyKey =
    useRef<string | null>(null);

  useEffect(() => {
    idempotencyKey.current =
      null;
  }, [
    network,
    phone,
    amount,
  ]);

  const selectedNetwork =
    networks.find(
      item =>
        item.id === network,
    );

  const numAmount =
    Number(amount);

  const canProceed =
    Boolean(
      network &&
        isValidNigerianNumber(
          phone.trim(),
        ) &&
        Number.isFinite(
          numAmount,
        ) &&
        numAmount > 0,
    );

  const preparePurchase =
    () => {
      if (!selectedNetwork) {
        toast.error(
          'Please select a network.',
        );
        return;
      }

      const targetPhone =
        phone.trim();

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

      if (
        !Number.isFinite(
          numAmount,
        ) ||
        numAmount <= 0
      ) {
        toast.error(
          'Please enter a valid airtime amount.',
        );
        return;
      }

      if (
        balance < numAmount
      ) {
        toast.error(
          'Insufficient wallet balance. Please fund your wallet.',
        );
        return;
      }

      if (isLoading) {
        return;
      }

      setPurchasePin('');
      setShowPurchasePin(
        true,
      );
    };

  const handlePurchaseWithPin =
    async (
      pin: string,
    ) => {
      if (!selectedNetwork) {
        toast.error(
          'Please select a network.',
        );
        return;
      }

      const targetPhone =
        phone.trim();

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

      if (
        !Number.isFinite(
          numAmount,
        ) ||
        numAmount <= 0
      ) {
        toast.error(
          'Please enter a valid airtime amount.',
        );
        return;
      }

      if (
        balance < numAmount
      ) {
        toast.error(
          'Insufficient wallet balance. Please fund your wallet.',
        );

        setShowPurchasePin(
          false,
        );

        setPurchasePin('');

        return;
      }

      if (
        !/^\d{4}$/.test(pin)
      ) {
        toast.error(
          'Purchase PIN must be exactly 4 digits.',
        );
        return;
      }

      if (isLoading) {
        return;
      }

      if (
        !idempotencyKey.current
      ) {
        idempotencyKey.current =
          makeIdempotencyKey();
      }

      const currentKey =
        idempotencyKey.current;

      setIsLoading(true);

      try {
        const response =
          await fetch(
            '/api/purchase/airtime',
            {
              method: 'POST',

              credentials:
                'include',

              headers: {
                'Content-Type':
                  'application/json',

                Accept:
                  'application/json',

                'Idempotency-Key':
                  currentKey,
              },

              body:
                JSON.stringify({
                  network:
                    selectedNetwork.id,

                  phone:
                    targetPhone,

                  amount:
                    numAmount,

                  purchasePin:
                    pin,
                }),
            },
          );

        let result:
          AirtimePurchaseResponse =
          {};

        try {
          const json =
            await response.json();

          if (
            json &&
            typeof json ===
              'object'
          ) {
            result =
              json as AirtimePurchaseResponse;
          }
        } catch {
          result = {};
        }

        if (
          response.status ===
            401 ||
          response.status ===
            403
        ) {
          setShowPurchasePin(
            false,
          );

          setPurchasePin('');

          throw new Error(
            'Your session has expired. Please log in again.',
          );
        }

        if (
          result.error ===
            'INVALID_PURCHASE_PIN' ||
          result.error ===
            'wrong_purchase_pin' ||
          result.error ===
            'Incorrect purchase PIN.'
        ) {
          throw new Error(
            'Incorrect Purchase PIN.',
          );
        }

        if (
          result.error ===
            'PURCHASE_PIN_REQUIRED' ||
          result.error ===
            'Purchase PIN is required.'
        ) {
          throw new Error(
            'Purchase PIN is required.',
          );
        }

        if (
          !response.ok
        ) {
          throw new Error(
            result.error ||
              result.message ||
              `Airtime purchase failed (${response.status}).`,
          );
        }

        const status =
          String(
            result.status ??
              '',
          )
            .trim()
            .toLowerCase();

        if (
          result.pending ===
            true ||
          status ===
            'pending' ||
          response.status ===
            202
        ) {
          setShowPurchasePin(
            false,
          );

          setPurchasePin('');

          toast.info(
            'Transaction is being processed. Check your transaction history shortly.',
          );

          return;
        }

        if (
          result.success !==
          true
        ) {
          if (
            result.error ===
            'previous_attempt_failed'
          ) {
            idempotencyKey.current =
              null;

            toast.error(
              'Previous attempt failed and was refunded. Tap Pay again to retry.',
            );
          } else {
            toast.error(
              result.error ||
                result.message ||
                'Transaction failed. Please try again.',
            );
          }

          return;
        }

        idempotencyKey.current =
          null;

        setShowPurchasePin(
          false,
        );

        setPurchasePin('');

        await Promise.allSettled(
          [
            refreshWallet(),
            refreshCashbackWallet(),
          ],
        );

        const now =
          new Date();

        const transactionId =
          result.requestId ||
          result.reference ||
          '';

        setSuccessData({
          type: 'airtime',

          provider:
            selectedNetwork.name,

          service:
            'Airtime',

          description:
            `${selectedNetwork.name} Airtime`,

          amount:
            numAmount,

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

          status:
            'success',

          txnId:
            transactionId,

          paymentMethod:
            'Wallet',
        });

        setShowSuccess(
          true,
        );

        toast.success(
          'Airtime purchase successful.',
        );
      } catch (
        error
      ) {
        const message =
          error instanceof Error
            ? error.message
            : 'Airtime purchase failed. Please try again.';

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
      exit={{
        opacity: 0,
        x: -20,
      }}
      className="
        p-4
        sm:p-6
        max-w-md
        mx-auto
        min-h-screen
        bg-background
        relative
        flex
        flex-col
      "
    >
      <div
        className="
          flex
          items-center
          gap-3
          mb-8
          pt-2
        "
      >
        <button
          type="button"
          onClick={() =>
            setLocation('/')
          }
          className="
            w-10
            h-10
            bg-card
            rounded-full
            flex
            items-center
            justify-center
            border
            border-border
            active:scale-95
            transition-transform
          "
        >
          <ChevronLeft
            className="
              w-5
              h-5
            "
          />
        </button>

        <h1
          className="
            text-xl
            font-bold
          "
        >
          Buy Airtime
        </h1>
      </div>

      <div
        className="
          space-y-6
          flex-1
          pb-48
        "
      >
        <div>
          <h2
            className="
              text-sm
              font-semibold
              text-muted-foreground
              mb-3
              uppercase
              tracking-wider
            "
          >
            Select Network
          </h2>

          <div
            className="
              grid
              grid-cols-4
              gap-3
            "
          >
            {networks.map(
              item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setNetwork(
                      item.id,
                    );

                    idempotencyKey.current =
                      null;
                  }}
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
                      network ===
                      item.id
                        ? 'border-primary bg-primary/10'
                        : 'border-border bg-card hover:border-border/80'
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
                      ${item.color}
                      ${item.text}
                    `}
                  >
                    {item.name[0]}
                  </div>

                  <span
                    className="
                      text-xs
                      font-medium
                    "
                  >
                    {item.name}
                  </span>
                </button>
              ),
            )}
          </div>
        </div>

        <PhoneInputWithContacts
          value={phone}
          onChange={value => {
            setPhone(value);
            idempotencyKey.current =
              null;
          }}
          label="Phone Number"
        />

        <div>
          <h2
            className="
              text-sm
              font-semibold
              text-muted-foreground
              mb-3
              uppercase
              tracking-wider
            "
          >
            Amount
          </h2>

          <input
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            placeholder="Enter amount e.g. 500"
            value={amount}
            onChange={event => {
              const value =
                event.target.value;

              setAmount(
                value,
              );

              idempotencyKey.current =
                null;
            }}
            className="
              w-full
              bg-card
              border-2
              border-border
              focus:border-primary
              rounded-xl
              h-14
              px-4
              text-xl
              font-bold
              outline-none
              transition-colors
              mb-3
            "
          />

          <div
            className="
              grid
              grid-cols-3
              gap-2
            "
          >
            {quickAmounts.map(
              quickAmount => (
                <button
                  key={
                    quickAmount
                  }
                  type="button"
                  onClick={() => {
                    setAmount(
                      quickAmount.toString(),
                    );

                    idempotencyKey.current =
                      null;
                  }}
                  className={`
                    py-2.5
                    rounded-xl
                    text-sm
                    border-2
                    font-semibold
                    transition-all
                    active:scale-95
                    ${
                      amount ===
                      quickAmount.toString()
                        ? 'border-primary text-primary bg-primary/10'
                        : 'border-border bg-card text-muted-foreground hover:border-border/80'
                    }
                  `}
                >
                  ₦
                  {quickAmount.toLocaleString(
                    'en-NG',
                  )}
                </button>
              ),
            )}
          </div>
        </div>
      </div>

      {canProceed &&
        selectedNetwork && (
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
            <div
              className="
                bg-card
                border
                border-border
                rounded-xl
                p-4
                mb-3
                text-sm
              "
            >
              <div
                className="
                  flex
                  justify-between
                  mb-2
                "
              >
                <span
                  className="
                    text-muted-foreground
                  "
                >
                  Network
                </span>

                <span
                  className="
                    font-semibold
                  "
                >
                  {
                    selectedNetwork.name
                  }
                </span>
              </div>

              <div
                className="
                  flex
                  justify-between
                  mb-2
                  gap-4
                "
              >
                <span
                  className="
                    text-muted-foreground
                  "
                >
                  Number
                </span>

                <span
                  className="
                    font-semibold
                  "
                >
                  {phone}
                </span>
              </div>

              <div
                className="
                  flex
                  justify-between
                  mb-2
                  gap-4
                "
              >
                <span
                  className="
                    text-muted-foreground
                  "
                >
                  Wallet Balance
                </span>

                <span
                  className="
                    font-semibold
                  "
                >
                  ₦
                  {balance.toLocaleString(
                    'en-NG',
                  )}
                </span>
              </div>

              <div
                className="
                  flex
                  justify-between
                  pt-2
                  border-t
                  border-border
                  mt-1
                "
              >
                <span
                  className="
                    text-muted-foreground
                  "
                >
                  Total
                </span>

                <span
                  className="
                    font-bold
                    text-primary
                    text-base
                  "
                >
                  ₦
                  {numAmount.toLocaleString(
                    'en-NG',
                  )}
                </span>
              </div>
            </div>

            <Button
              type="button"
              className="
                w-full
                h-12
                text-base
                rounded-xl
                font-bold
              "
              onClick={
                preparePurchase
              }
              disabled={
                isLoading
              }
            >
              {isLoading
                ? 'Processing…'
                : `Pay ₦${numAmount.toLocaleString(
                    'en-NG',
                  )}`}
            </Button>
          </motion.div>
        )}

      {showPurchasePin &&
        selectedNetwork && (
          <div
            className="
              fixed
              inset-0
              z-[100]
              flex
              items-center
              justify-center
              bg-black/50
              p-4
            "
            role="dialog"
            aria-modal="true"
            aria-labelledby="airtime-purchase-pin-title"
          >
            <div
              className="
                w-full
                max-w-sm
                rounded-2xl
                bg-card
                border
                border-border
                p-5
                shadow-2xl
              "
            >
              <div
                className="
                  mb-5
                  text-center
                "
              >
                <h2
                  id="airtime-purchase-pin-title"
                  className="
                    text-xl
                    font-bold
                  "
                >
                  Enter Purchase PIN
                </h2>

                <p
                  className="
                    mt-2
                    text-sm
                    text-muted-foreground
                  "
                >
                  Enter your 4-digit
                  Purchase PIN to
                  confirm this airtime
                  purchase.
                </p>
              </div>

              <div
                className="
                  rounded-xl
                  bg-muted/50
                  border
                  border-border
                  p-4
                  mb-4
                  space-y-3
                "
              >
                <div
                  className="
                    flex
                    justify-between
                    gap-4
                    text-sm
                  "
                >
                  <span
                    className="
                      text-muted-foreground
                    "
                  >
                    Network
                  </span>

                  <span
                    className="
                      font-semibold
                    "
                  >
                    {
                      selectedNetwork.name
                    }
                  </span>
                </div>

                <div
                  className="
                    flex
                    justify-between
                    gap-4
                    text-sm
                  "
                >
                  <span
                    className="
                      text-muted-foreground
                    "
                  >
                    Number
                  </span>

                  <span
                    className="
                      font-semibold
                    "
                  >
                    {phone}
                  </span>
                </div>

                <div
                  className="
                    flex
                    justify-between
                    gap-4
                    text-sm
                  "
                >
                  <span
                    className="
                      text-muted-foreground
                    "
                  >
                    Amount
                  </span>

                  <span
                    className="
                      font-bold
                      text-primary
                    "
                  >
                    ₦
                    {numAmount.toLocaleString(
                      'en-NG',
                    )}
                  </span>
                </div>
              </div>

              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                maxLength={4}
                value={
                  purchasePin
                }
                onChange={event => {
                  setPurchasePin(
                    event.target.value
                      .replace(
                        /\D/g,
                        '',
                      )
                      .slice(
                        0,
                        4,
                      ),
                  );
                }}
                onKeyDown={event => {
                  if (
                    event.key ===
                      'Enter' &&
                    purchasePin.length ===
                      4 &&
                    !isLoading
                  ) {
                    void handlePurchaseWithPin(
                      purchasePin,
                    );
                  }
                }}
                placeholder="4-digit Purchase PIN"
                aria-label="Purchase PIN"
                disabled={
                  isLoading
                }
                className="
                  w-full
                  h-14
                  rounded-xl
                  border-2
                  border-border
                  bg-background
                  px-4
                  text-center
                  text-2xl
                  font-bold
                  tracking-[0.45em]
                  outline-none
                  focus:border-primary
                  focus:ring-2
                  focus:ring-primary/20
                "
              />

              <p
                className="
                  mt-3
                  text-center
                  text-xs
                  text-muted-foreground
                "
              >
                This is your
                Purchase PIN, not your
                Login PIN.
              </p>

              <div
                className="
                  grid
                  grid-cols-2
                  gap-3
                  mt-5
                "
              >
                <Button
                  type="button"
                  variant="outline"
                  className="
                    h-12
                    rounded-xl
                  "
                  disabled={
                    isLoading
                  }
                  onClick={() => {
                    setShowPurchasePin(
                      false,
                    );

                    setPurchasePin(
                      '',
                    );
                  }}
                >
                  Cancel
                </Button>

                <Button
                  type="button"
                  className="
                    h-12
                    rounded-xl
                    font-bold
                  "
                  disabled={
                    isLoading ||
                    purchasePin.length !==
                      4
                  }
                  onClick={() =>
                    void handlePurchaseWithPin(
                      purchasePin,
                    )
                  }
                >
                  {isLoading
                    ? 'Processing…'
                    : 'Confirm & Pay'}
                </Button>
              </div>
            </div>
          </div>
        )}

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
