/**
 * artifacts/api-server/src/routes/purchase.ts
 *
 * SMEAPI-only purchase orchestration.
 *
 * - Data + Airtime use SMEAPI.
 * - Price is taken from server-side pricing_rules.
 * - Wallet is debited before provider request.
 * - Successful provider request => success.
 * - Explicit processing/pending => pending; NEVER refund automatically.
 * - Explicit failure => refund.
 * - Same reference is preserved for provider reconciliation.
 * - Idempotency-Key prevents duplicate purchases.
 */

import {
  Router,
  type Request,
  type Response,
} from 'express';

import { sql } from 'drizzle-orm';

import { db } from '@workspace/db';

import {
  walletsTable,
  transactionsTable,
} from '@workspace/db/schema';

import {
  purchaseData,
  purchaseAirtime,
  requeryTransactionByRef,
} from '../lib/smeapi.js';

import { requireAuth } from './user.js';
import { logger } from '../lib/logger.js';
import { createNotification } from '../lib/notifications.js';
import { getIo } from '../lib/socket.js';

const router = Router();

router.use(requireAuth);

/* ============================================================================
 * TYPES
 * ========================================================================== */

type PricingRule = {
  id: string;
  service_type?: string | null;
  network?: string | null;
  plan_id?: string | null;
  plan_name?: string | null;
  selling_price?: string | number | null;
  cashback_enabled?: boolean | null;
  cashback_type?: string | null;
  cashback_value?: string | number | null;
  active?: boolean | null;
};

type ProviderResultRecord =
  Record<string, unknown>;

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function safeNumber(
  value: unknown,
): number {
  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function normalizeNetwork(
  value: unknown,
): string {
  const network =
    String(
      value ?? '',
    )
      .trim()
      .toLowerCase();

  if (
    network === '9mobile' ||
    network === 'etisalat'
  ) {
    return '9mobile';
  }

  return network;
}

function makeReference(
  prefix: string,
): string {
  const timestamp =
    Date.now().toString(36);

  const random =
    Math.random()
      .toString(36)
      .slice(2, 10);

  return `GY-${prefix}-${timestamp}-${random}`.toUpperCase();
}

function getIdempotencyKey(
  req: Request,
): string | null {
  const value =
    req.header(
      'Idempotency-Key',
    );

  if (!value) {
    return null;
  }

  const trimmed =
    String(value).trim();

  return trimmed || null;
}

function providerResultSucceeded(
  result: unknown,
): boolean {
  if (!result) {
    return false;
  }

  if (
    typeof result ===
    'boolean'
  ) {
    return result;
  }

  if (
    typeof result !==
    'object'
  ) {
    return false;
  }

  const response =
    result as ProviderResultRecord;

  if (
    response.success ===
    true
  ) {
    return true;
  }

  const status =
    String(
      response.status ??
      response.state ??
      response.result ??
      '',
    )
      .trim()
      .toLowerCase();

  return [
    'success',
    'successful',
    'completed',
    'complete',
    'approved',
    'delivered',
  ].includes(status);
}

function providerResultIsPending(
  result: unknown,
): boolean {
  if (!result) {
    return true;
  }

  if (
    typeof result !==
    'object'
  ) {
    return false;
  }

  const response =
    result as ProviderResultRecord;

  const status =
    String(
      response.status ??
      response.state ??
      response.result ??
      '',
    )
      .trim()
      .toLowerCase();

  return [
    'pending',
    'processing',
    'process',
    'queued',
    'in_progress',
    'in-progress',
    'initiated',
    'unknown',
  ].includes(status);
}

function providerReference(
  result: unknown,
  fallback: string,
): string {
  if (
    result &&
    typeof result ===
      'object'
  ) {
    const response =
      result as ProviderResultRecord;

    const candidates = [
      response.reference,
      response.ref,
      response.transaction_id,
      response.transactionId,
      response.transaction_reference,
      response.transactionReference,
      response.request_id,
      response.requestId,
    ];

    for (
      const candidate of
        candidates
    ) {
      if (
        candidate !==
          undefined &&
        candidate !== null &&
        String(candidate).trim()
      ) {
        return String(
          candidate,
        ).trim();
      }
    }
  }

  return fallback;
}

function providerMessage(
  result: unknown,
): string | undefined {
  if (
    !result ||
    typeof result !==
      'object'
  ) {
    return undefined;
  }

  const response =
    result as ProviderResultRecord;

  const value =
    response.message ??
    response.msg ??
    response.error ??
    response.detail ??
    response.description;

  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  const message =
    String(value).trim();

  return message || undefined;
}

function emitWalletUpdate(
  userId: string,
  balance: string,
): void {
  try {
    const io =
      getIo();

    io.to(
      `user:${userId}`,
    ).emit(
      'wallet:update',
      {
        balance,
      },
    );
  } catch {
    // Socket failures must never break financial state.
  }
}

async function notifyPurchase(
  userId: string,
  params: {
    title: string;
    body: string;
    transactionId: string;
  },
): Promise<void> {
  try {
    await createNotification(
      userId,
      {
        type: 'transaction',
        title:
          params.title,
        body:
          params.body,
        refId:
          params.transactionId,
      },
    );
  } catch {
    // Notification failure must not alter purchase state.
  }
}

/* ============================================================================
 * PRICING
 * ========================================================================== */

async function findDataPricingRule(
  network: string,
  planCode: string,
): Promise<PricingRule | null> {
  const result =
    await db.execute(sql`
      SELECT
        id,
        service_type,
        network,
        plan_id,
        plan_name,
        selling_price,
        cashback_enabled,
        cashback_type,
        cashback_value,
        active
      FROM pricing_rules
      WHERE active = true
        AND (
          service_type = 'data'
          OR service_type = 'Data'
          OR service_type IS NULL
        )
        AND (
          network IS NULL
          OR LOWER(network) = LOWER(${network})
        )
        AND (
          plan_id = ${planCode}
          OR plan_code = ${planCode}
        )
      ORDER BY
        CASE
          WHEN plan_id = ${planCode}
            THEN 0
          ELSE 1
        END,
        updated_at DESC NULLS LAST
      LIMIT 1
    `);

  if (
    !result.rows.length
  ) {
    return null;
  }

  return result.rows[0] as PricingRule;
}

function calculateCashback(
  amount: number,
  rule: PricingRule,
): number {
  if (
    !rule.cashback_enabled
  ) {
    return 0;
  }

  const value =
    safeNumber(
      rule.cashback_value,
    );

  if (value <= 0) {
    return 0;
  }

  if (
    rule.cashback_type ===
    'percentage'
  ) {
    return Number(
      Math.max(
        0,
        amount *
          (value / 100),
      ).toFixed(2),
    );
  }

  if (
    rule.cashback_type ===
    'fixed'
  ) {
    return Number(
      Math.min(
        amount,
        value,
      ).toFixed(2),
    );
  }

  return 0;
}

/* ============================================================================
 * CASHBACK
 * ========================================================================== */

async function creditCashback(
  tx: any,
  params: {
    userId: string;
    transactionId: string;
    amount: number;
    network: string;
    planId: string;
    planName: string;
    cashbackType: string | null;
    cashbackValue: number;
  },
): Promise<void> {
  if (
    params.amount <= 0
  ) {
    return;
  }

  const walletResult =
    await tx.execute(sql`
      SELECT
        id,
        balance
      FROM cashback_wallets
      WHERE user_id = ${params.userId}::uuid
      FOR UPDATE
    `);

  if (
    !walletResult.rows.length
  ) {
    await tx.execute(sql`
      INSERT INTO cashback_wallets
        (
          user_id,
          balance
        )
      VALUES
        (
          ${params.userId}::uuid,
          0
        )
      ON CONFLICT (user_id)
      DO NOTHING
    `);
  }

  const lockedWallet =
    await tx.execute(sql`
      SELECT
        id,
        balance
      FROM cashback_wallets
      WHERE user_id = ${params.userId}::uuid
      FOR UPDATE
    `);

  if (
    !lockedWallet.rows.length
  ) {
    throw new Error(
      'Cashback wallet not found.',
    );
  }

  const wallet =
    lockedWallet.rows[0] as Record<
      string,
      unknown
    >;

  const before =
    safeNumber(
      wallet.balance,
    );

  const after =
    Number(
      (
        before +
        params.amount
      ).toFixed(2),
    );

  await tx.execute(sql`
    UPDATE cashback_wallets
    SET
      balance = ${after.toFixed(2)},
      updated_at = NOW()
    WHERE user_id = ${params.userId}::uuid
  `);

  await tx.execute(sql`
    INSERT INTO cashback_transactions
      (
        user_id,
        source_txn_id,
        amount,
        cashback_type,
        cashback_value,
        network,
        plan_id,
        plan_name
      )
    VALUES
      (
        ${params.userId}::uuid,
        ${params.transactionId}::uuid,
        ${params.amount.toFixed(2)},
        ${params.cashbackType ?? 'fixed'},
        ${params.cashbackValue.toFixed(2)},
        ${params.network},
        ${params.planId},
        ${params.planName}
      )
  `);
}

/* ============================================================================
 * WALLET DEBIT
 * ========================================================================== */

async function debitWalletAndCreateTransaction(
  params: {
    userId: string;
    type: string;
    service: string;
    provider: string;
    amount: number;
    reference: string;
    description: string;
    metadata: Record<string, unknown>;
  },
): Promise<{
  transactionId: string;
  balance: string;
}> {
  return db.transaction(
    async (tx) => {
      const walletResult =
        await tx.execute(sql`
          SELECT
            id,
            balance
          FROM wallets
          WHERE user_id = ${params.userId}::uuid
          FOR UPDATE
        `);

      if (
        !walletResult.rows.length
      ) {
        throw Object.assign(
          new Error(
            'Wallet not found.',
          ),
          {
            code:
              'NOT_FOUND',
          },
        );
      }

      const wallet =
        walletResult.rows[0] as Record<
          string,
          unknown
        >;

      const before =
        safeNumber(
          wallet.balance,
        );

      if (
        before <
        params.amount
      ) {
        throw Object.assign(
          new Error(
            'Insufficient wallet balance.',
          ),
          {
            code:
              'INSUFFICIENT_FUNDS',
          },
        );
      }

      const after =
        Number(
          (
            before -
            params.amount
          ).toFixed(2),
        );

      await tx.execute(sql`
        UPDATE wallets
        SET
          balance = ${after.toFixed(2)},
          updated_at = NOW()
        WHERE user_id = ${params.userId}::uuid
      `);

      const transaction =
        await tx
          .insert(
            transactionsTable,
          )
          .values({
            userId:
              params.userId,
            type:
              params.type,
            service:
              params.service,
            provider:
              params.provider,
            amount:
              params.amount.toFixed(
                2,
              ),
            status:
              'pending',
            reference:
              params.reference,
            description:
              params.description,
            paymentMethod:
              'Wallet',
            metadata:
              params.metadata,
          })
          .returning({
            id:
              transactionsTable.id,
          });

      const transactionId =
        transaction[0]?.id;

      if (
        !transactionId
      ) {
        throw new Error(
          'Failed to create transaction.',
        );
      }

      await tx.execute(sql`
        INSERT INTO wallet_ledger
          (
            wallet_id,
            user_id,
            type,
            amount,
            balance_before,
            balance_after,
            reference,
            related_transaction_id,
            reason
          )
        VALUES
          (
            ${String(wallet.id)}::uuid,
            ${params.userId}::uuid,
            'debit',
            ${params.amount.toFixed(2)},
            ${before.toFixed(2)},
            ${after.toFixed(2)},
            ${params.reference},
            ${transactionId}::uuid,
            ${params.description}
          )
        ON CONFLICT (reference)
        DO NOTHING
      `);

      return {
        transactionId:
          String(
            transactionId,
          ),
        balance:
          after.toFixed(2),
      };
    },
  );
}

/* ============================================================================
 * REFUND
 * ========================================================================== */

async function refundFailedPurchase(
  params: {
    userId: string;
    transactionId: string;
    amount: number;
    reference: string;
    reason: string;
  },
): Promise<string> {
  return db.transaction(
    async (tx) => {
      const transactionResult =
        await tx.execute(sql`
          SELECT
            id,
            status,
            metadata
          FROM transactions
          WHERE id = ${params.transactionId}::uuid
            AND user_id = ${params.userId}::uuid
          FOR UPDATE
        `);

      if (
        !transactionResult.rows.length
      ) {
        throw new Error(
          'Transaction not found.',
        );
      }

      const transaction =
        transactionResult.rows[0] as Record<
          string,
          unknown
        >;

      const status =
        String(
          transaction.status ??
            '',
        ).toLowerCase();

      /*
       * Already failed/refunded:
       * never credit the wallet again.
       */
      if (
        status ===
        'failed'
      ) {
        const walletResult =
          await tx.execute(sql`
            SELECT balance
            FROM wallets
            WHERE user_id = ${params.userId}::uuid
            LIMIT 1
          `);

        if (
          walletResult.rows.length
        ) {
          return String(
            (
              walletResult.rows[0] as Record<
                string,
                unknown
              >
            ).balance ??
              '0.00',
          );
        }

        return '0.00';
      }

      const walletResult =
        await tx.execute(sql`
          SELECT
            id,
            balance
          FROM wallets
          WHERE user_id = ${params.userId}::uuid
          FOR UPDATE
        `);

      if (
        !walletResult.rows.length
      ) {
        throw new Error(
          'Wallet not found.',
        );
      }

      const wallet =
        walletResult.rows[0] as Record<
          string,
          unknown
        >;

      const before =
        safeNumber(
          wallet.balance,
        );

      const after =
        Number(
          (
            before +
            params.amount
          ).toFixed(2),
        );

      await tx.execute(sql`
        UPDATE wallets
        SET
          balance = ${after.toFixed(2)},
          updated_at = NOW()
        WHERE user_id = ${params.userId}::uuid
      `);

      await tx.execute(sql`
        UPDATE transactions
        SET
          status = 'failed',
          metadata =
            COALESCE(
              metadata,
              '{}'::jsonb
            )
            ||
            ${JSON.stringify({
              refunded:
                true,
              refundReason:
                params.reason,
              refundedAt:
                new Date().toISOString(),
            })}::jsonb
        WHERE id = ${params.transactionId}::uuid
      `);

      await tx.execute(sql`
        INSERT INTO wallet_ledger
          (
            wallet_id,
            user_id,
            type,
            amount,
            balance_before,
            balance_after,
            reference,
            related_transaction_id,
            reason
          )
        VALUES
          (
            ${String(wallet.id)}::uuid,
            ${params.userId}::uuid,
            'reversal',
            ${params.amount.toFixed(2)},
            ${before.toFixed(2)},
            ${after.toFixed(2)},
            ${`${params.reference}-refund`},
            ${params.transactionId}::uuid,
            ${params.reason}
          )
        ON CONFLICT (reference)
        DO NOTHING
      `);

      return after.toFixed(2);
    },
  );
}

/* ============================================================================
 * TRANSACTION STATE
 * ========================================================================== */

async function markTransactionSuccess(
  transactionId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await db.execute(sql`
    UPDATE transactions
    SET
      status = 'success',
      metadata =
        COALESCE(
          metadata,
          '{}'::jsonb
        )
        ||
        ${JSON.stringify(
          metadata,
        )}::jsonb
    WHERE id = ${transactionId}::uuid
      AND status <> 'success'
  `);
}

async function markTransactionPending(
  transactionId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await db.execute(sql`
    UPDATE transactions
    SET
      status = 'pending',
      metadata =
        COALESCE(
          metadata,
          '{}'::jsonb
        )
        ||
        ${JSON.stringify(
          metadata,
        )}::jsonb
    WHERE id = ${transactionId}::uuid
      AND status = 'pending'
  `);
}

/* ============================================================================
 * SMEAPI TRANSACTION RECONCILIATION
 * ========================================================================== */

router.get(
  '/status/:reference',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const reference =
      String(
        req.params.reference ??
          '',
      ).trim();

    if (!reference) {
      res.status(400).json({
        success: false,
        error:
          'Transaction reference is required.',
      });
      return;
    }

    try {
      const result =
        await db.execute(sql`
          SELECT
            id,
            user_id,
            type,
            service,
            provider,
            amount,
            status,
            reference,
            metadata,
            created_at
          FROM transactions
          WHERE user_id = ${userId}::uuid
            AND reference = ${reference}
          LIMIT 1
        `);

      if (
        !result.rows.length
      ) {
        res.status(404).json({
          success: false,
          error:
            'Transaction not found.',
        });
        return;
      }

      const transaction =
        result.rows[0] as Record<
          string,
          unknown
        >;

      const transactionId =
        String(
          transaction.id,
        );

      const transactionStatus =
        String(
          transaction.status ??
            '',
        ).toLowerCase();

      const metadata =
        transaction.metadata &&
        typeof transaction.metadata ===
          'object'
          ? (
              transaction.metadata as Record<
                string,
                unknown
              >
            )
          : {};

      const provider =
        String(
          metadata.provider ??
            transaction.provider ??
            '',
        ).toLowerCase();

      /*
       * SMEAPI only.
       * This endpoint NEVER creates another purchase.
       */
      if (
        provider !==
        'smeapi'
      ) {
        res.status(409).json({
          success: false,
          error:
            'This transaction is not configured for SMEAPI reconciliation.',
        });
        return;
      }

      /*
       * Already successful.
       *
       * Never call SMEAPI again.
       * If cashback was not applied because an earlier
       * process stopped after success, finish cashback here.
       */
      if (
        transactionStatus ===
        'success'
      ) {
        const cashbackAmount =
          safeNumber(
            metadata.cashbackAmount,
          );

        const cashbackApplied =
          metadata.cashbackApplied ===
          true;

        if (
          transaction.type ===
            'data' &&
          cashbackAmount > 0 &&
          !cashbackApplied
        ) {
          try {
            await db.transaction(
              async (tx) => {
                const locked =
                  await tx.execute(sql`
                    SELECT
                      status,
                      metadata
                    FROM transactions
                    WHERE id = ${transactionId}::uuid
                      AND user_id = ${userId}::uuid
                    FOR UPDATE
                  `);

                if (
                  !locked.rows.length
                ) {
                  return;
                }

                const current =
                  locked.rows[0] as Record<
                    string,
                    unknown
                  >;

                const currentMetadata =
                  current.metadata &&
                  typeof current.metadata ===
                    'object'
                    ? (
                        current.metadata as Record<
                          string,
                          unknown
                        >
                      )
                    : {};

                if (
                  currentMetadata.cashbackApplied ===
                  true
                ) {
                  return;
                }

                const amount =
                  safeNumber(
                    currentMetadata.cashbackAmount,
                  );

                if (
                  amount <= 0
                ) {
                  await tx.execute(sql`
                    UPDATE transactions
                    SET metadata =
                      COALESCE(
                        metadata,
                        '{}'::jsonb
                      )
                      ||
                      ${JSON.stringify({
                        cashbackApplied:
                          true,
                      })}::jsonb
                    WHERE id = ${transactionId}::uuid
                  `);

                  return;
                }

                await creditCashback(
                  tx,
                  {
                    userId,
                    transactionId,
                    amount,
                    network:
                      String(
                        currentMetadata.network ??
                          '',
                      ),
                    planId:
                      String(
                        currentMetadata.planCode ??
                          '',
                      ),
                    planName:
                      String(
                        currentMetadata.planName ??
                          '',
                      ),
                    cashbackType:
                      currentMetadata.cashbackType
                        ? String(
                            currentMetadata.cashbackType,
                          )
                        : 'fixed',
                    cashbackValue:
                      safeNumber(
                        currentMetadata.cashbackValue ??
                          amount,
                      ),
                  },
                );

                await tx.execute(sql`
                  UPDATE transactions
                  SET metadata =
                    COALESCE(
                      metadata,
                      '{}'::jsonb
                    )
                    ||
                    ${JSON.stringify({
                      cashbackApplied:
                        true,
                      cashbackAppliedAt:
                        new Date().toISOString(),
                    })}::jsonb
                  WHERE id = ${transactionId}::uuid
                `);
              },
            );
          } catch (
            cashbackError
          ) {
            logger.error(
              {
                err:
                  cashbackError,
                userId,
                transactionId,
              },
              'SMEAPI reconciliation cashback failed',
            );

            res.status(500).json({
              success: false,
              pending: false,
              status:
                'success',
              error:
                'Transaction succeeded, but cashback could not be completed. Please check the transaction status again.',
              txnId:
                transactionId,
              reference,
            });

            return;
          }
        }

        const walletResult =
          await db.execute(sql`
            SELECT balance
            FROM wallets
            WHERE user_id = ${userId}::uuid
            LIMIT 1
          `);

        const balance =
          walletResult.rows.length
            ? String(
                (
                  walletResult.rows[0] as Record<
                    string,
                    unknown
                  >
                ).balance ??
                  '0.00',
              )
            : '0.00';

        res.json({
          success: true,
          pending: false,
          status:
            'success',
          requestId:
            reference,
          txnId:
            transactionId,
          balance,
        });

        return;
      }

      /*
       * Already failed/refunded.
       *
       * Never call SMEAPI and never refund again.
       */
      if (
        transactionStatus ===
        'failed'
      ) {
        const walletResult =
          await db.execute(sql`
            SELECT balance
            FROM wallets
            WHERE user_id = ${userId}::uuid
            LIMIT 1
          `);

        const balance =
          walletResult.rows.length
            ? String(
                (
                  walletResult.rows[0] as Record<
                    string,
                    unknown
                  >
                ).balance ??
                  '0.00',
              )
            : '0.00';

        res.json({
          success: false,
          pending: false,
          status:
            'failed',
          requestId:
            reference,
          txnId:
            transactionId,
          balance,
        });

        return;
      }

      /*
       * Only pending transactions can be reconciled.
       */
      if (
        transactionStatus !==
        'pending'
      ) {
        res.status(409).json({
          success: false,
          pending: false,
          status:
            transactionStatus ||
            'unknown',
          requestId:
            reference,
          txnId:
            transactionId,
          error:
            'Transaction is not eligible for reconciliation.',
        });

        return;
      }

      /*
       * IMPORTANT:
       *
       * This is a STATUS CHECK only.
       * It does NOT call purchaseData().
       * It does NOT call purchaseAirtime().
       * It uses the SAME original reference.
       */
      let providerResult:
        Awaited<
          ReturnType<
            typeof requeryTransactionByRef
          >
        >;

      try {
        providerResult =
          await requeryTransactionByRef(
            reference,
          );
      } catch (
        providerError
      ) {
        logger.error(
          {
            err:
              providerError,
            userId,
            transactionId,
            reference,
          },
          'SMEAPI reconciliation request failed',
        );

        res.status(202).json({
          success: false,
          pending: true,
          status:
            'pending',
          requestId:
            reference,
          txnId:
            transactionId,
          error:
            'Transaction is still pending reconciliation. Do not resubmit.',
        });

        return;
      }

      const providerStatus =
        String(
          providerResult.status ??
            '',
        ).toLowerCase();

      const providerReference =
        String(
          providerResult.reference ??
            reference,
        ).trim() ||
        reference;

      const providerMessage =
        providerResult.message
          ? String(
              providerResult.message,
            )
          : undefined;

      const providerResponse =
        providerResult.raw ??
        providerResult.transaction ??
        providerResult;

      /* ----------------------------------------------------------------------
       * PROVIDER SUCCESS
       * -------------------------------------------------------------------- */

      if (
        providerResult.success ===
          true ||
        providerStatus ===
          'success'
      ) {
        await markTransactionSuccess(
          transactionId,
          {
            providerStatus:
              'success',
            providerReference,
            providerMessage,
            providerResponse,
            completedAt:
              new Date().toISOString(),
            reconciliationRequired:
              false,
          },
        );

        /*
         * Cashback is applied once only.
         */
        const cashbackAmount =
          safeNumber(
            metadata.cashbackAmount,
          );

        if (
          transaction.type ===
            'data' &&
          cashbackAmount > 0 &&
          metadata.cashbackApplied !==
            true
        ) {
          try {
            await db.transaction(
              async (tx) => {
                const locked =
                  await tx.execute(sql`
                    SELECT
                      status,
                      metadata
                    FROM transactions
                    WHERE id = ${transactionId}::uuid
                      AND user_id = ${userId}::uuid
                    FOR UPDATE
                  `);

                if (
                  !locked.rows.length
                ) {
                  throw new Error(
                    'Transaction not found during cashback reconciliation.',
                  );
                }

                const current =
                  locked.rows[0] as Record<
                    string,
                    unknown
                  >;

                const currentMetadata =
                  current.metadata &&
                  typeof current.metadata ===
                    'object'
                    ? (
                        current.metadata as Record<
                          string,
                          unknown
                        >
                      )
                    : {};

                if (
                  currentMetadata.cashbackApplied !==
                  true
                ) {
                  const amount =
                    safeNumber(
                      currentMetadata.cashbackAmount,
                    );

                  if (
                    amount > 0
                  ) {
                    await creditCashback(
                      tx,
                      {
                        userId,
                        transactionId,
                        amount,
                        network:
                          String(
                            currentMetadata.network ??
                              '',
                          ),
                        planId:
                          String(
                            currentMetadata.planCode ??
                              '',
                          ),
                        planName:
                          String(
                            currentMetadata.planName ??
                              '',
                          ),
                        cashbackType:
                          currentMetadata.cashbackType
                            ? String(
                                currentMetadata.cashbackType,
                              )
                            : 'fixed',
                        cashbackValue:
                          safeNumber(
                            currentMetadata.cashbackValue ??
                              amount,
                          ),
                      },
                    );
                  }

                  await tx.execute(sql`
                    UPDATE transactions
                    SET metadata =
                      COALESCE(
                        metadata,
                        '{}'::jsonb
                      )
                      ||
                      ${JSON.stringify({
                        cashbackApplied:
                          true,
                        cashbackAppliedAt:
                          new Date().toISOString(),
                      })}::jsonb
                    WHERE id = ${transactionId}::uuid
                  `);
                }
              },
            );
          } catch (
            cashbackError
          ) {
            logger.error(
              {
                err:
                  cashbackError,
                userId,
                transactionId,
                reference,
              },
              'SMEAPI reconciliation cashback failed after success',
            );

            res.status(500).json({
              success: false,
              pending: false,
              status:
                'success',
              requestId:
                providerReference,
              txnId:
                transactionId,
              error:
                'Transaction succeeded, but cashback could not be completed. Please check the transaction status again.',
            });

            return;
          }
        }

        const walletResult =
          await db.execute(sql`
            SELECT balance
            FROM wallets
            WHERE user_id = ${userId}::uuid
            LIMIT 1
          `);

        const balance =
          walletResult.rows.length
            ? String(
                (
                  walletResult.rows[0] as Record<
                    string,
                    unknown
                  >
                ).balance ??
                  '0.00',
              )
            : '0.00';

        emitWalletUpdate(
          userId,
          balance,
        );

        await notifyPurchase(
          userId,
          {
            title:
              'Data Purchase Successful ✅',
            body:
              `Your ${String(metadata.network ?? '').toUpperCase()} ${String(metadata.planName ?? 'data')} purchase has been confirmed successfully.`,
            transactionId,
          },
        );

        res.json({
          success: true,
          pending: false,
          status:
            'success',
          requestId:
            providerReference,
          txnId:
            transactionId,
          balance,
        });

        return;
      }

      /* ----------------------------------------------------------------------
       * PROVIDER FAILURE
       * -------------------------------------------------------------------- */

      const isFailure =
        providerStatus ===
          'failed' ||
        providerStatus ===
          'failure' ||
        providerStatus ===
          'rejected' ||
        providerStatus ===
          'cancelled' ||
        providerStatus ===
          'canceled' ||
        providerStatus ===
          'declined';

      if (
        isFailure
      ) {
        const amount =
          safeNumber(
            transaction.amount,
          );

        const refundReason =
          providerMessage ||
          'SMEAPI transaction failed during reconciliation.';

        const refundedBalance =
          await refundFailedPurchase({
            userId,
            transactionId,
            amount,
            reference,
            reason:
              refundReason,
          });

        emitWalletUpdate(
          userId,
          refundedBalance,
        );

        await notifyPurchase(
          userId,
          {
            title:
              'Data Purchase Failed',
            body:
              `Your ${String(metadata.network ?? '').toUpperCase()} data purchase failed and your wallet has been refunded.`,
            transactionId,
          },
        );

        res.json({
          success: false,
          pending: false,
          status:
            'failed',
          requestId:
            providerReference,
          txnId:
            transactionId,
          balance:
            refundedBalance,
          error:
            'Purchase failed. Your wallet has been refunded.',
        });

        return;
      }

      /* ----------------------------------------------------------------------
       * UNKNOWN / PROCESSING / PENDING
       * -------------------------------------------------------------------- */

      await markTransactionPending(
        transactionId,
        {
          providerStatus:
            providerStatus ||
            'pending',
          providerReference,
          providerMessage,
          providerResponse,
          reconciliationRequired:
            true,
          lastReconciledAt:
            new Date().toISOString(),
        },
      );

      res.status(202).json({
        success: false,
        pending: true,
        status:
          'pending',
        requestId:
          providerReference,
        txnId:
          transactionId,
        error:
          'Purchase is still processing. Do not resubmit.',
      });
    } catch (
      err: unknown
    ) {
      logger.error(
        {
          err,
          userId,
          reference,
        },
        'GET /purchase/status/:reference failed',
      );

      res.status(500).json({
        success: false,
        error:
          'Unable to reconcile transaction status.',
      });
    }
  },
);

/* ============================================================================
 * DATA PURCHASE
 * ========================================================================== */

router.post(
  '/data',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const body =
      req.body as {
        network?: string;
        phone?: string;
        planCode?: string;
        planName?: string;
        planPrice?: string | number;
      };

    const {
      network,
      phone,
      planCode,
      planName,
      planPrice,
    } = body;

    if (
      !network ||
      !phone ||
      !planCode ||
      !planName ||
      planPrice ===
        undefined
    ) {
      res.status(400).json({
        success: false,
        error:
          'network, phone, planCode, planName and planPrice are required.',
      });

      return;
    }

    const normalizedNetwork =
      normalizeNetwork(
        network,
      );

    const normalizedPhone =
      String(
        phone,
      ).trim();

    const normalizedPlanCode =
      String(
        planCode,
      ).trim();

    const normalizedPlanName =
      String(
        planName,
      ).trim();

    if (
      ![
        'mtn',
        'glo',
        '9mobile',
        'airtel',
      ].includes(
        normalizedNetwork,
      )
    ) {
      res.status(400).json({
        success: false,
        error:
          'Unsupported network.',
      });

      return;
    }

    if (
      !/^0\d{10}$/.test(
        normalizedPhone,
      )
    ) {
      res.status(400).json({
        success: false,
        error:
          'Invalid Nigerian phone number.',
      });

      return;
    }

    const requestedPrice =
      safeNumber(
        planPrice,
      );

    if (
      requestedPrice <= 0
    ) {
      res.status(400).json({
        success: false,
        error:
          'Invalid plan price.',
      });

      return;
    }

    const pricingRule =
      await findDataPricingRule(
        normalizedNetwork,
        normalizedPlanCode,
      );

    if (!pricingRule) {
      res.status(404).json({
        success: false,
        error:
          'Data plan pricing was not found.',
      });

      return;
    }

    const sellingPrice =
      safeNumber(
        pricingRule.selling_price,
      );

    if (
      sellingPrice <= 0
    ) {
      res.status(400).json({
        success: false,
        error:
          'This data plan has an invalid selling price.',
      });

      return;
    }

    /*
     * Never trust frontend price.
     */
    if (
      Math.abs(
        requestedPrice -
          sellingPrice,
      ) > 0.01
    ) {
      res.status(409).json({
        success: false,
        error:
          'Plan price has changed. Please refresh the plans and try again.',
        currentPrice:
          sellingPrice,
      });

      return;
    }

    const idempotencyKey =
      getIdempotencyKey(
        req,
      );

    /*
     * Idempotency-Key:
     * If the same key already created a transaction,
     * return that transaction instead of debiting again.
     */
    if (
      idempotencyKey
    ) {
      const existing =
        await db.execute(sql`
          SELECT
            id,
            status,
            amount,
            reference,
            metadata
          FROM transactions
          WHERE user_id = ${userId}::uuid
            AND metadata->>'idempotencyKey' = ${idempotencyKey}
          ORDER BY created_at DESC
          LIMIT 1
        `);

      if (
        existing.rows.length
      ) {
        const transaction =
          existing.rows[0] as Record<
            string,
            unknown
          >;

        const existingStatus =
          String(
            transaction.status ??
              '',
          ).toLowerCase();

        const walletResult =
          await db.execute(sql`
            SELECT balance
            FROM wallets
            WHERE user_id = ${userId}::uuid
            LIMIT 1
          `);

        const balance =
          walletResult.rows.length
            ? String(
                (
                  walletResult.rows[0] as Record<
                    string,
                    unknown
                  >
                ).balance ??
                  '0.00',
              )
            : '0.00';

        if (
          existingStatus ===
          'pending'
        ) {
          res.status(202).json({
            success: false,
            pending: true,
            requestId:
              String(
                transaction.reference,
              ),
            txnId:
              String(
                transaction.id,
              ),
            balance,
            error:
              'Purchase is already processing. Do not resubmit.',
          });

          return;
        }

        res.json({
          success:
            existingStatus ===
            'success',
          pending: false,
          requestId:
            String(
              transaction.reference,
            ),
          txnId:
            String(
              transaction.id,
            ),
          balance,
          status:
            existingStatus,
        });

        return;
      }
    }

    const reference =
      idempotencyKey
        ? `GY-DAT-${idempotencyKey
            .replace(
              /[^A-Za-z0-9_-]/g,
              '',
            )
            .slice(
              0,
              120,
            )}`
        : makeReference(
            'DATA',
          );

    const cashbackAmount =
      calculateCashback(
        sellingPrice,
        pricingRule,
      );

    /* ----------------------------------------------------------------------
     * DEBIT
     * -------------------------------------------------------------------- */

    let debit:
      Awaited<
        ReturnType<
          typeof debitWalletAndCreateTransaction
        >
      >;

    try {
      debit =
        await debitWalletAndCreateTransaction({
          userId,
          type:
            'data',
          service:
            'Data',
          provider:
            'smeapi',
          amount:
            sellingPrice,
          reference,
          description:
            `${normalizedNetwork.toUpperCase()} ${normalizedPlanName}`,
          metadata: {
            idempotencyKey:
              idempotencyKey ??
              null,
            network:
              normalizedNetwork,
            phone:
              normalizedPhone,
            planCode:
              normalizedPlanCode,
            planName:
              normalizedPlanName,
            sellingPrice,
            provider:
              'smeapi',
            cashbackAmount,
            cashbackType:
              pricingRule.cashback_type ??
              null,
            cashbackValue:
              safeNumber(
                pricingRule.cashback_value,
              ),
            pricingRuleId:
              pricingRule.id,
            reconciliationRequired:
              true,
          },
        });
    } catch (
      err: unknown
    ) {
      const e =
        err as {
          code?: string;
        };

      if (
        e.code ===
        'INSUFFICIENT_FUNDS'
      ) {
        res.status(402).json({
          success: false,
          error:
            'insufficient_funds',
        });

        return;
      }

      if (
        e.code ===
        'NOT_FOUND'
      ) {
        res.status(404).json({
          success: false,
          error:
            'Wallet not found.',
        });

        return;
      }

      logger.error(
        {
          err,
          userId,
        },
        'POST /purchase/data wallet debit failed',
      );

      res.status(500).json({
        success: false,
        error:
          'Unable to process data purchase.',
      });

      return;
    }

    emitWalletUpdate(
      userId,
      debit.balance,
    );

    /* ----------------------------------------------------------------------
     * SMEAPI PROVIDER
     * -------------------------------------------------------------------- */

    let providerResult:
      Awaited<
        ReturnType<
          typeof purchaseData
        >
      >;

    try {
      providerResult =
        await purchaseData({
          network:
            normalizedNetwork,
          phone:
            normalizedPhone,
          dataPlan:
            pricingRule.plan_id ??
            normalizedPlanCode,
          reference,
        });
    } catch (
      err: unknown
    ) {
      /*
       * Provider/network timeout or unknown result:
       * DO NOT REFUND.
       *
       * The transaction stays pending and can be reconciled
       * using GET /purchase/status/:reference.
       */
      logger.error(
        {
          err,
          userId,
          transactionId:
            debit.transactionId,
          reference,
        },
        'SMEAPI data purchase request failed',
      );

      await markTransactionPending(
        debit.transactionId,
        {
          providerStatus:
            'unknown',
          providerReference:
            reference,
          providerMessage:
            err instanceof Error
              ? err.message
              : 'Provider request could not be confirmed.',
          pendingSince:
            new Date().toISOString(),
          reconciliationRequired:
            true,
        },
      );

      res.status(202).json({
        success: false,
        pending: true,
        requestId:
          reference,
        txnId:
          debit.transactionId,
        balance:
          debit.balance,
        error:
          'Purchase request could not be confirmed. Transaction is pending reconciliation. Do not resubmit.',
      });

      return;
    }

    const ref =
      providerReference(
        providerResult,
        reference,
      );

    const message =
      providerMessage(
        providerResult,
      );

    /* ----------------------------------------------------------------------
     * PROCESSING / 202
     * -------------------------------------------------------------------- */

    if (
      providerResultIsPending(
        providerResult,
      )
    ) {
      await markTransactionPending(
        debit.transactionId,
        {
          providerStatus:
            'pending',
          providerReference:
            ref,
          providerMessage:
            message,
          providerResponse:
            providerResult,
          pendingSince:
            new Date().toISOString(),
          reconciliationRequired:
            true,
        },
      );

      res.status(202).json({
        success: false,
        pending: true,
        requestId:
          ref,
        txnId:
          debit.transactionId,
        planName:
          normalizedPlanName,
        balance:
          debit.balance,
        error:
          'Purchase is processing. Do not resubmit.',
      });

      return;
    }

    /* ----------------------------------------------------------------------
     * SUCCESS
     * -------------------------------------------------------------------- */

    if (
      providerResultSucceeded(
        providerResult,
      )
    ) {
      await markTransactionSuccess(
        debit.transactionId,
        {
          providerStatus:
            'success',
          providerReference:
            ref,
          providerMessage:
            message,
          providerResponse:
            providerResult,
          completedAt:
            new Date().toISOString(),
          reconciliationRequired:
            false,
        },
      );

      if (
        cashbackAmount > 0
      ) {
        try {
          await db.transaction(
            async (tx) => {
              const locked =
                await tx.execute(sql`
                  SELECT metadata
                  FROM transactions
                  WHERE id = ${debit.transactionId}::uuid
                    AND user_id = ${userId}::uuid
                  FOR UPDATE
                `);

              const current =
                locked.rows[0] as Record<
                  string,
                  unknown
                >;

              const currentMetadata =
                current?.metadata &&
                typeof current.metadata ===
                  'object'
                  ? (
                      current.metadata as Record<
                        string,
                        unknown
                      >
                    )
                  : {};

              if (
                currentMetadata.cashbackApplied ===
                true
              ) {
                return;
              }

              await creditCashback(
                tx,
                {
                  userId,
                  transactionId:
                    debit.transactionId,
                  amount:
                    cashbackAmount,
                  network:
                    normalizedNetwork,
                  planId:
                    pricingRule.plan_id ??
                    normalizedPlanCode,
                  planName:
                    normalizedPlanName,
                  cashbackType:
                    pricingRule.cashback_type ??
                    'fixed',
                  cashbackValue:
                    safeNumber(
                      pricingRule.cashback_value,
                    ),
                },
              );

              await tx.execute(sql`
                UPDATE transactions
                SET metadata =
                  COALESCE(
                    metadata,
                    '{}'::jsonb
                  )
                  ||
                  ${JSON.stringify({
                    cashbackApplied:
                      true,
                    cashbackAppliedAt:
                      new Date().toISOString(),
                  })}::jsonb
                WHERE id = ${debit.transactionId}::uuid
              `);
            },
          );
        } catch (
          cashbackError
        ) {
          logger.error(
            {
              err:
                cashbackError,
              userId,
              transactionId:
                debit.transactionId,
            },
            'Data purchase cashback failed',
          );
        }
      }

      emitWalletUpdate(
        userId,
        debit.balance,
      );

      await notifyPurchase(
        userId,
        {
          title:
            'Data Purchase Successful ✅',
          body:
            `${normalizedNetwork.toUpperCase()} ${normalizedPlanName} was purchased successfully.`,
          transactionId:
            debit.transactionId,
        },
      );

      res.json({
        success: true,
        pending: false,
        requestId:
          ref,
        txnId:
          debit.transactionId,
        planName:
          normalizedPlanName,
        balance:
          debit.balance,
      });

      return;
    }

    /* ----------------------------------------------------------------------
     * EXPLICIT FAILURE → REFUND
     * -------------------------------------------------------------------- */

    const failureMessage =
      message ||
      'SMEAPI rejected the data purchase.';

    const refundedBalance =
      await refundFailedPurchase({
        userId,
        transactionId:
          debit.transactionId,
        amount:
          sellingPrice,
        reference,
        reason:
          failureMessage,
      });

    emitWalletUpdate(
      userId,
      refundedBalance,
    );

    await notifyPurchase(
      userId,
      {
        title:
          'Data Purchase Failed',
        body:
          `Your ${normalizedNetwork.toUpperCase()} ${normalizedPlanName} purchase failed and your wallet has been refunded.`,
        transactionId:
          debit.transactionId,
      },
    );

    res.status(502).json({
      success: false,
      pending: false,
      error:
        'Data purchase failed. Your wallet has been refunded.',
      txnId:
        debit.transactionId,
      balance:
        refundedBalance,
    });
  },
);

/* ============================================================================
 * AIRTIME PURCHASE
 * ========================================================================== */

router.post(
  '/airtime',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const body =
      req.body as {
        network?: string;
        phone?: string;
        amount?: string | number;
      };

    const {
      network,
      phone,
      amount,
    } = body;

    if (
      !network ||
      !phone ||
      amount ===
        undefined
    ) {
      res.status(400).json({
        success: false,
        error:
          'network, phone and amount are required.',
      });

      return;
    }

    const normalizedNetwork =
      normalizeNetwork(
        network,
      );

    const normalizedPhone =
      String(
        phone,
      ).trim();

    const numericAmount =
      safeNumber(
        amount,
      );

    if (
      ![
        'mtn',
        'glo',
        '9mobile',
        'airtel',
      ].includes(
        normalizedNetwork,
      )
    ) {
      res.status(400).json({
        success: false,
        error:
          'Unsupported network.',
      });

      return;
    }

    if (
      !/^0\d{10}$/.test(
        normalizedPhone,
      )
    ) {
      res.status(400).json({
        success: false,
        error:
          'Invalid Nigerian phone number.',
      });

      return;
    }

    if (
      numericAmount <= 0
    ) {
      res.status(400).json({
        success: false,
        error:
          'Invalid airtime amount.',
      });

      return;
    }

    const idempotencyKey =
      getIdempotencyKey(
        req,
      );

    /*
     * Same idempotency protection used for data.
     */
    if (
      idempotencyKey
    ) {
      const existing =
        await db.execute(sql`
          SELECT
            id,
            status,
            amount,
            reference,
            metadata
          FROM transactions
          WHERE user_id = ${userId}::uuid
            AND metadata->>'idempotencyKey' = ${idempotencyKey}
          ORDER BY created_at DESC
          LIMIT 1
        `);

      if (
        existing.rows.length
      ) {
        const transaction =
          existing.rows[0] as Record<
            string,
            unknown
          >;

        const existingStatus =
          String(
            transaction.status ??
              '',
          ).toLowerCase();

        const walletResult =
          await db.execute(sql`
            SELECT balance
            FROM wallets
            WHERE user_id = ${userId}::uuid
            LIMIT 1
          `);

        const balance =
          walletResult.rows.length
            ? String(
                (
                  walletResult.rows[0] as Record<
                    string,
                    unknown
                  >
                ).balance ??
                  '0.00',
              )
            : '0.00';

        if (
          existingStatus ===
          'pending'
        ) {
          res.status(202).json({
            success: false,
            pending: true,
            requestId:
              String(
                transaction.reference,
              ),
            txnId:
              String(
                transaction.id,
              ),
            balance,
            error:
              'Airtime purchase is already processing. Do not resubmit.',
          });

          return;
        }

        res.json({
          success:
            existingStatus ===
            'success',
          pending: false,
          requestId:
            String(
              transaction.reference,
            ),
          txnId:
            String(
              transaction.id,
            ),
          balance,
          status:
            existingStatus,
        });

        return;
      }
    }

    const reference =
      idempotencyKey
        ? `GY-AIR-${idempotencyKey
            .replace(
              /[^A-Za-z0-9_-]/g,
              '',
            )
            .slice(
              0,
              120,
            )}`
        : makeReference(
            'AIR',
          );

    /* ----------------------------------------------------------------------
     * DEBIT
     * -------------------------------------------------------------------- */

    let debit:
      Awaited<
        ReturnType<
          typeof debitWalletAndCreateTransaction
        >
      >;

    try {
      debit =
        await debitWalletAndCreateTransaction({
          userId,
          type:
            'airtime',
          service:
            'Airtime',
          provider:
            'smeapi',
          amount:
            numericAmount,
          reference,
          description:
            `${normalizedNetwork.toUpperCase()} Airtime ₦${numericAmount.toLocaleString('en-NG')}`,
          metadata: {
            idempotencyKey:
              idempotencyKey ??
              null,
            network:
              normalizedNetwork,
            phone:
              normalizedPhone,
            amount:
              numericAmount,
            provider:
              'smeapi',
            reconciliationRequired:
              true,
          },
        });
    } catch (
      err: unknown
    ) {
      const e =
        err as {
          code?: string;
        };

      if (
        e.code ===
        'INSUFFICIENT_FUNDS'
      ) {
        res.status(402).json({
          success: false,
          error:
            'insufficient_funds',
        });

        return;
      }

      if (
        e.code ===
        'NOT_FOUND'
      ) {
        res.status(404).json({
          success: false,
          error:
            'Wallet not found.',
        });

        return;
      }

      logger.error(
        {
          err,
          userId,
        },
        'POST /purchase/airtime wallet debit failed',
      );

      res.status(500).json({
        success: false,
        error:
          'Unable to process airtime purchase.',
      });

      return;
    }

    emitWalletUpdate(
      userId,
      debit.balance,
    );

    /* ----------------------------------------------------------------------
     * SMEAPI PROVIDER
     * -------------------------------------------------------------------- */

    let providerResult:
      Awaited<
        ReturnType<
          typeof purchaseAirtime
        >
      >;

    try {
      providerResult =
        await purchaseAirtime({
          network:
            normalizedNetwork,
          phone:
            normalizedPhone,
          amount:
            numericAmount,
          reference,
        });
    } catch (
      err: unknown
    ) {
      /*
       * Unknown provider result:
       * leave pending, then reconcile by reference.
       */
      logger.error(
        {
          err,
          userId,
          transactionId:
            debit.transactionId,
          reference,
        },
        'SMEAPI airtime purchase request failed',
      );

      await markTransactionPending(
        debit.transactionId,
        {
          providerStatus:
            'unknown',
          providerReference:
            reference,
          providerMessage:
            err instanceof Error
              ? err.message
              : 'Provider request could not be confirmed.',
          pendingSince:
            new Date().toISOString(),
          reconciliationRequired:
            true,
        },
      );

      res.status(202).json({
        success: false,
        pending: true,
        requestId:
          reference,
        txnId:
          debit.transactionId,
        balance:
          debit.balance,
        error:
          'Purchase request could not be confirmed. Transaction is pending reconciliation. Do not resubmit.',
      });

      return;
    }

    const ref =
      providerReference(
        providerResult,
        reference,
      );

    const message =
      providerMessage(
        providerResult,
      );

    /* ----------------------------------------------------------------------
     * PROCESSING / 202
     * -------------------------------------------------------------------- */

    if (
      providerResultIsPending(
        providerResult,
      )
    ) {
      await markTransactionPending(
        debit.transactionId,
        {
          providerStatus:
            'pending',
          providerReference:
            ref,
          providerMessage:
            message,
          providerResponse:
            providerResult,
          pendingSince:
            new Date().toISOString(),
          reconciliationRequired:
            true,
        },
      );

      res.status(202).json({
        success: false,
        pending: true,
        requestId:
          ref,
        txnId:
          debit.transactionId,
        balance:
          debit.balance,
        error:
          'Purchase is processing. Do not resubmit.',
      });

      return;
    }

    /* ----------------------------------------------------------------------
     * SUCCESS
     * -------------------------------------------------------------------- */

    if (
      providerResultSucceeded(
        providerResult,
      )
    ) {
      await markTransactionSuccess(
        debit.transactionId,
        {
          providerStatus:
            'success',
          providerReference:
            ref,
          providerMessage:
            message,
          providerResponse:
            providerResult,
          completedAt:
            new Date().toISOString(),
          reconciliationRequired:
            false,
        },
      );

      emitWalletUpdate(
        userId,
        debit.balance,
      );

      await notifyPurchase(
        userId,
        {
          title:
            'Airtime Purchase Successful ✅',
          body:
            `${normalizedNetwork.toUpperCase()} airtime of ₦${numericAmount.toLocaleString('en-NG')} was purchased successfully.`,
          transactionId:
            debit.transactionId,
        },
      );

      res.json({
        success: true,
        pending: false,
        requestId:
          ref,
        txnId:
          debit.transactionId,
        balance:
          debit.balance,
      });

      return;
    }

    /* ----------------------------------------------------------------------
     * EXPLICIT FAILURE → REFUND
     * -------------------------------------------------------------------- */

    const failureMessage =
      message ||
      'SMEAPI rejected the airtime purchase.';

    const refundedBalance =
      await refundFailedPurchase({
        userId,
        transactionId:
          debit.transactionId,
        amount:
          numericAmount,
        reference,
        reason:
          failureMessage,
      });

    emitWalletUpdate(
      userId,
      refundedBalance,
    );

    await notifyPurchase(
      userId,
      {
        title:
          'Airtime Purchase Failed',
        body:
          `Your ₦${numericAmount.toLocaleString('en-NG')} airtime purchase failed and your wallet has been refunded.`,
        transactionId:
          debit.transactionId,
      },
    );

    res.status(502).json({
      success: false,
      pending: false,
      error:
        'Airtime purchase failed. Your wallet has been refunded.',
      txnId:
        debit.transactionId,
      balance:
        refundedBalance,
    });
  },
);

export default router;
