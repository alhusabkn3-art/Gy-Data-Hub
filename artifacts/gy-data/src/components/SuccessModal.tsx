import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

import TransactionReceipt, {
  ReceiptData,
} from './TransactionReceipt';

interface SuccessModalProps {
  open: boolean;

  onOpenChange: (
    open: boolean,
  ) => void;

  /*
   * BuyAirtimeScreen currently uses `receipt`.
   * BuyDataScreen currently uses `data`.
   *
   * Support both so the shared success modal cannot receive
   * an undefined receipt after a successful purchase.
   */
  receipt?: ReceiptData | null;

  data?: ReceiptData | null;

  onDone?: () => void;

  doneLabel?: string;
}

/*
 * Keep receipt status inside the exact values expected by
 * TransactionReceipt.
 *
 * This also protects the receipt from crashing if the backend
 * ever returns a different success-like status string.
 */
function normalizeStatus(
  status: unknown,
): ReceiptData['status'] {
  const value = String(
    status ?? '',
  )
    .trim()
    .toLowerCase();

  if (
    value === 'pending' ||
    value === 'processing' ||
    value === 'queued'
  ) {
    return 'pending';
  }

  if (
    value === 'failed' ||
    value === 'failure' ||
    value === 'cancelled' ||
    value === 'canceled' ||
    value === 'error'
  ) {
    return 'failed';
  }

  return 'success';
}

function normalizeReceipt(
  receipt: ReceiptData,
): ReceiptData {
  return {
    ...receipt,

    provider:
      String(
        receipt.provider ?? '',
      ).trim() || 'GY DATA',

    service:
      String(
        receipt.service ?? '',
      ).trim() || 'Data',

    description:
      String(
        receipt.description ?? '',
      ).trim() || 'Data Bundle',

    amount:
      Number.isFinite(
        Number(receipt.amount),
      )
        ? Number(receipt.amount)
        : 0,

    date:
      String(
        receipt.date ?? '',
      ).trim() ||
      new Date().toISOString(),

    status:
      normalizeStatus(
        receipt.status,
      ),

    txnId:
      receipt.txnId
        ? String(
            receipt.txnId,
          ).trim()
        : undefined,

    paymentMethod:
      receipt.paymentMethod
        ? String(
            receipt.paymentMethod,
          ).trim()
        : undefined,

    cashbackAmount:
      receipt.cashbackAmount != null &&
      Number.isFinite(
        Number(
          receipt.cashbackAmount,
        ),
      )
        ? Number(
            receipt.cashbackAmount,
          )
        : undefined,
  };
}

export default function SuccessModal({
  open,
  onOpenChange,
  receipt,
  data,
  onDone,
  doneLabel = 'Done',
}: SuccessModalProps) {
  /*
   * `receipt` is used by Airtime.
   * `data` is used by Data.
   *
   * Prefer receipt when both are supplied.
   */
  const rawReceipt =
    receipt ?? data ?? null;

  const safeReceipt =
    rawReceipt
      ? normalizeReceipt(
          rawReceipt,
        )
      : null;

  const handleDone = () => {
    onOpenChange(false);

    if (onDone) {
      onDone();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{
              opacity: 0,
            }}
            animate={{
              opacity: 1,
            }}
            exit={{
              opacity: 0,
            }}
            className="
              fixed
              inset-0
              z-50
              bg-black/65
              backdrop-blur-sm
            "
            onClick={() =>
              onOpenChange(false)
            }
          />

          {/* Receipt sheet */}
          <motion.div
            initial={{
              opacity: 0,
              y: 60,
            }}
            animate={{
              opacity: 1,
              y: 0,
            }}
            exit={{
              opacity: 0,
              y: 60,
            }}
            transition={{
              type: 'spring',
              damping: 28,
              stiffness: 320,
            }}
            className="
              fixed
              bottom-0
              left-0
              right-0
              z-50
              px-4
              pb-6
              pt-4

              sm:inset-auto
              sm:top-1/2
              sm:left-1/2
              sm:-translate-x-1/2
              sm:-translate-y-1/2
              sm:w-[400px]
              sm:px-0
              sm:pb-0
              sm:pt-0
            "
          >
            {safeReceipt ? (
              <TransactionReceipt
                receipt={
                  safeReceipt
                }
                onDone={
                  handleDone
                }
                doneLabel={
                  doneLabel
                }
                showActions
              />
            ) : (
              /*
               * Never render TransactionReceipt with an undefined
               * receipt. This fallback prevents another white screen
               * if the purchase response somehow lacks receipt data.
               */
              <div
                className="
                  w-full
                  rounded-3xl
                  border
                  border-[#E3EEF8]
                  bg-white
                  p-6
                  shadow-[0_8px_32px_rgba(11,31,78,0.12)]
                "
              >
                <div className="text-center">
                  <div
                    className="
                      mx-auto
                      mb-4
                      flex
                      h-14
                      w-14
                      items-center
                      justify-center
                      rounded-full
                      bg-red-50
                      text-red-600
                    "
                  >
                    !
                  </div>

                  <h2
                    className="
                      text-lg
                      font-bold
                      text-[#0B1F4E]
                    "
                  >
                    Receipt unavailable
                  </h2>

                  <p
                    className="
                      mt-2
                      text-sm
                      leading-6
                      text-gray-500
                    "
                  >
                    The purchase was completed, but
                    the receipt details could not be
                    prepared.
                  </p>

                  <button
                    type="button"
                    onClick={
                      handleDone
                    }
                    className="
                      mt-5
                      h-11
                      w-full
                      rounded-xl
                      bg-[#075CC4]
                      px-5
                      text-sm
                      font-semibold
                      text-white
                      transition
                      hover:bg-[#064FA8]
                    "
                  >
                    {doneLabel}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Re-export ReceiptData so callers can import it from this component.
export type { ReceiptData };
