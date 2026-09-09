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

type PurchaseStatus =
  | 'success'
  | 'pending'
  | 'failed';

type PricingRule = {
  id: string;
  service_type: string;
  provider: string | null;
  network: string | null;
  plan_id: string | null;
  plan_name: string | null;
  cost_price: string | number | null;
  selling_price: string | number | null;
  enabled: boolean;
  cashback_enabled: boolean | null;
  cashback_type: string | null;
  cashback_value: string | number | null;
};

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function makeReference(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)
    .toUpperCase()}`;
}

function normalizeNetwork(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function normalizePlanId(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function normalizePlanName(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function validNigerianPhone(phone: string): boolean {
  const normalized = phone
    .replace(/\s+/g, '')
    .replace(/^\+234/, '0')
    .replace(/^234/, '0');

  return /^0(?:70|71|80|81|90|91)[0-9]{8}$/.test(
    normalized,
  );
}

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function getIdempotencyKey(req: Request): string | null {
  const raw = req.header('Idempotency-Key');

  if (!raw) {
    return null;
  }

  const value = String(raw).trim();

  if (!value) {
    return null;
  }

  return value.slice(0, 180);
}

function providerResultIsPending(
  result: unknown,
): boolean {
  if (!result || typeof result !== 'object') {
    return false;
  }

  const r = result as Record<string, unknown>;

  const status = String(
    r.status ??
    r.providerStatus ??
    '',
  )
    .trim()
    .toLowerCase();

  const message = String(
    r.message ??
    r.providerMessage ??
    '',
  )
    .trim()
    .toLowerCase();

  const raw = r.raw;

  const rawStatus =
    raw &&
    typeof raw === 'object'
      ? String(
          (raw as Record<string, unknown>).status ??
          (raw as Record<string, unknown>).state ??
          '',
        )
          .trim()
          .toLowerCase()
      : '';

  return (
    status === 'pending' ||
    status === 'processing' ||
    status === 'queued' ||
    status === 'reconciliation' ||
    status === '202' ||
    rawStatus === 'pending' ||
    rawStatus === 'processing' ||
    rawStatus === '202' ||
    /\b202\b/.test(message) ||
    /processing|pending|reconcil/i.test(message)
  );
}

function providerResultSucceeded(
  result: unknown,
): boolean {
  if (!result || typeof result !== 'object') {
    return false;
  }

  const r = result as Record<string, unknown>;

  if (providerResultIsPending(result)) {
    return false;
  }

  return r.success === true;
}

function providerReference(
  result: unknown,
  fallback: string,
): string {
  if (
    result &&
    typeof result === 'object'
  ) {
    const r = result as Record<string, unknown>;

    const ref =
      r.reference ??
      r.providerReference ??
      r.ref;

    if (ref) {
      return String(ref);
    }
  }

  return fallback;
}

function providerMessage(
  result: unknown,
): string {
  if (
    result &&
    typeof result === 'object'
  ) {
    const r = result as Record<string, unknown>;

    const message =
      r.message ??
      r.providerMessage ??
      r.error;

    if (message) {
      return String(message).trim();
    }
  }

  return '';
}

/* ============================================================================
 * IDEMPOTENCY
 * ========================================================================== */

async function findExistingTransaction(
  userId: string,
  idempotencyKey: string,
): Promise<{
  id: string;
  status: PurchaseStatus;
  reference: string | null;
  amount: string;
  metadata: unknown;
} | null> {
  const result = await db.execute(sql`
    SELECT
      id,
      status,
      reference,
      amount,
      metadata
    FROM transactions
    WHERE user_id = ${userId}::uuid
      AND metadata->>'idempotencyKey' = ${idempotencyKey}
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const row = result.rows[0] as
    | Record<string, unknown>
    | undefined;

  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    status: String(
      row.status,
    ) as PurchaseStatus,
    reference:
      row.reference == null
        ? null
        : String(row.reference),
    amount: String(row.amount),
    metadata: row.metadata,
  };
}

/* ============================================================================
 * DATA PRICING
 * ========================================================================== */

async function findDataPricingRule(params: {
  network: string;
  planCode: string;
  planName: string;
}): Promise<PricingRule | null> {
  const network =
    normalizeNetwork(params.network);

  const planCode =
    normalizePlanId(params.planCode);

  const planName =
    normalizePlanName(params.planName);

  /*
   * SMEAPI plan ID is authoritative.
   *
   * We first attempt exact plan_id matching.
   * Name matching is only a fallback.
   */

  const exactId = await db.execute(sql`
    SELECT
      id,
      service_type,
      provider,
      network,
      plan_id,
      plan_name,
      cost_price,
      selling_price,
      enabled,
      cashback_enabled,
      cashback_type,
      cashback_value
    FROM pricing_rules
    WHERE service_type = 'data'
      AND enabled = true
      AND LOWER(COALESCE(network, '')) = ${network}
      AND LOWER(COALESCE(plan_id, '')) = ${planCode}
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  let row =
    exactId.rows[0] as
      | Record<string, unknown>
      | undefined;

  if (!row) {
    const byName = await db.execute(sql`
      SELECT
        id,
        service_type,
        provider,
        network,
        plan_id,
        plan_name,
        cost_price,
        selling_price,
        enabled,
        cashback_enabled,
        cashback_type,
        cashback_value
      FROM pricing_rules
      WHERE service_type = 'data'
        AND enabled = true
        AND LOWER(COALESCE(network, '')) = ${network}
        AND LOWER(COALESCE(plan_name, '')) = ${planName}
        AND LOWER(COALESCE(provider, '')) = 'smeapi'
      ORDER BY updated_at DESC
      LIMIT 1
    `);

    row =
      byName.rows[0] as
        | Record<string, unknown>
        | undefined;
  }

  if (!row) {
    return null;
  }

  return {
    id: String(row.id),
    service_type:
      String(row.service_type),
    provider:
      row.provider == null
        ? null
        : String(row.provider),
    network:
      row.network == null
        ? null
        : String(row.network),
    plan_id:
      row.plan_id == null
        ? null
        : String(row.plan_id),
    plan_name:
      row.plan_name == null
        ? null
        : String(row.plan_name),
    cost_price:
      row.cost_price == null
        ? null
        : (row.cost_price as string | number),
    selling_price:
      row.selling_price == null
        ? null
        : (row.selling_price as string | number),
    enabled:
      Boolean(row.enabled),
    cashback_enabled:
      row.cashback_enabled == null
        ? null
        : Boolean(row.cashback_enabled),
    cashback_type:
      row.cashback_type == null
        ? null
        : String(row.cashback_type),
    cashback_value:
      row.cashback_value == null
        ? null
        : (row.cashback_value as string | number),
  };
}

/* ============================================================================
 * AIRTIME PROVIDER VALIDATION
 * ========================================================================== */

async function validateAirtimeProvider(
  network: string,
): Promise<void> {
  const normalizedNetwork =
    normalizeNetwork(network);

  const result = await db.execute(sql`
    SELECT
      id,
      provider,
      enabled
    FROM pricing_rules
    WHERE service_type = 'airtime'
      AND enabled = true
      AND LOWER(COALESCE(network, '')) = ${normalizedNetwork}
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  const row =
    result.rows[0] as
      | Record<string, unknown>
      | undefined;

  /*
   * No explicit rule:
   * SMEAPI remains the only configured provider.
   */
  if (!row) {
    return;
  }

  const provider =
    String(row.provider ?? '')
      .trim()
      .toLowerCase();

  if (provider !== 'smeapi') {
    throw Object.assign(
      new Error(
        'SMEAPI is not configured as the airtime provider.',
      ),
      {
        code: 'INVALID_PROVIDER',
      },
    );
  }
}

/* ============================================================================
 * WALLET
 * ========================================================================== */

async function getWalletBalance(
  userId: string,
): Promise<string> {
  const rows = await db
    .select({
      balance:
        walletsTable.balance,
    })
    .from(walletsTable)
    .where(
      sql`${walletsTable.userId} = ${userId}::uuid`,
    );

  if (!rows[0]) {
    throw Object.assign(
      new Error('Wallet not found.'),
      {
        code: 'NOT_FOUND',
      },
    );
  }

  return String(
    rows[0].balance ?? '0',
  );
}

async function debitWalletAndCreateTransaction(params: {
  userId: string;
  type: string;
  service: string;
  provider: string;
  amount: number;
  reference: string;
  description: string;
  metadata: Record<string, unknown>;
}): Promise<{
  transactionId: string;
  balance: string;
}> {
  if (
    !Number.isFinite(params.amount) ||
    params.amount <= 0
  ) {
    throw new Error(
      'Invalid purchase amount.',
    );
  }

  const result = await db.execute(sql`
    WITH locked_wallet AS (
      SELECT
        id,
        balance
      FROM wallets
      WHERE user_id = ${params.userId}::uuid
      FOR UPDATE
    ),
    debit AS (
      UPDATE wallets
      SET
        balance =
          balance -
          ${params.amount.toFixed(2)}::numeric,
        updated_at = NOW()
      WHERE id = (
        SELECT id
        FROM locked_wallet
      )
        AND balance >=
          ${params.amount.toFixed(2)}::numeric
      RETURNING
        id,
        balance
    )
    SELECT
      id,
      balance
    FROM debit
  `);

  const wallet =
    result.rows[0] as
      | Record<string, unknown>
      | undefined;

  if (!wallet) {
    const currentBalance =
      await getWalletBalance(
        params.userId,
      );

    if (
      Number(currentBalance) <
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

    throw new Error(
      'Unable to debit wallet.',
    );
  }

  const balance =
    String(wallet.balance);

  const transactionResult =
    await db.execute(sql`
      INSERT INTO transactions (
        user_id,
        type,
        service,
        provider,
        amount,
        status,
        reference,
        description,
        metadata,
        created_at,
        updated_at
      )
      VALUES (
        ${params.userId}::uuid,
        ${params.type},
        ${params.service},
        ${params.provider},
        ${params.amount.toFixed(2)}::numeric,
        'pending',
        ${params.reference},
        ${params.description},
        ${JSON.stringify(
          params.metadata,
        )}::jsonb,
        NOW(),
        NOW()
      )
      RETURNING id
    `);

  const transaction =
    transactionResult.rows[0] as
      | Record<string, unknown>
      | undefined;

  if (!transaction) {
    /*
     * The wallet was already debited. Do not silently lose
     * the user's money if transaction creation fails.
     *
     * A compensating credit is applied immediately.
     */
    await db.execute(sql`
      UPDATE wallets
      SET
        balance =
          balance +
          ${params.amount.toFixed(2)}::numeric,
        updated_at = NOW()
      WHERE user_id = ${params.userId}::uuid
    `);

    throw new Error(
      'Unable to create purchase transaction.',
    );
  }

  return {
    transactionId:
      String(transaction.id),
    balance,
  };
}

/* ============================================================================
 * TRANSACTION UPDATES
 * ========================================================================== */

async function markTransactionPending(
  transactionId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await db.execute(sql`
    UPDATE transactions
    SET
      status = 'pending',
      metadata =
        COALESCE(metadata, '{}'::jsonb)
        || ${JSON.stringify(data)}::jsonb,
      updated_at = NOW()
    WHERE id = ${transactionId}::uuid
  `);
}

async function markTransactionSuccess(
  transactionId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await db.execute(sql`
    UPDATE transactions
    SET
      status = 'success',
      metadata =
        COALESCE(metadata, '{}'::jsonb)
        || ${JSON.stringify(data)}::jsonb,
      updated_at = NOW()
    WHERE id = ${transactionId}::uuid
  `);
}

/* ============================================================================
 * REFUND
 * ========================================================================== */

async function refundFailedPurchase(params: {
  userId: string;
  transactionId: string;
  amount: number;
  reference: string;
  reason: string;
}): Promise<string> {
  const result = await db.execute(sql`
    UPDATE wallets
    SET
      balance =
        balance +
        ${params.amount.toFixed(2)}::numeric,
      updated_at = NOW()
    WHERE user_id = ${params.userId}::uuid
    RETURNING balance
  `);

  const wallet =
    result.rows[0] as
      | Record<string, unknown>
      | undefined;

  if (!wallet) {
    throw Object.assign(
      new Error(
        'Wallet not found while processing refund.',
      ),
      {
        code: 'NOT_FOUND',
      },
    );
  }

  const refundedBalance =
    String(wallet.balance);

  await db.execute(sql`
    UPDATE transactions
    SET
      status = 'failed',
      metadata =
        COALESCE(metadata, '{}'::jsonb)
        || ${JSON.stringify({
          refund: true,
          refundAmount:
            params.amount,
          refundReason:
            params.reason,
          refundReference:
            params.reference,
          refundedAt:
            new Date().toISOString(),
        })}::jsonb,
      updated_at = NOW()
    WHERE id = ${params.transactionId}::uuid
  `);

  return refundedBalance;
}

/* ============================================================================
 * NOTIFICATIONS
 * ========================================================================== */

async function notifyPurchase(
  userId: string,
  data: {
    title: string;
    body: string;
    transactionId: string;
  },
): Promise<void> {
  try {
    await createNotification({
      userId,
      title: data.title,
      message: data.body,
      type: 'transaction',
      referenceId:
        data.transactionId,
    });
  } catch (error) {
    logger.warn(
      {
        err: error,
        userId,
        transactionId:
          data.transactionId,
      },
      'Failed to create purchase notification',
    );
  }
}

function emitWalletUpdate(
  userId: string,
  balance: string,
): void {
  try {
    const io = getIo();

    io.to(`user:${userId}`).emit(
      'wallet:update',
      {
        balance,
      },
    );
  } catch (error) {
    logger.warn(
      {
        err: error,
        userId,
      },
      'Failed to emit wallet update',
    );
  }
}

/* ============================================================================
 * DATA CASHBACK
 * ========================================================================== */

async function calculateCashback(
  rule: PricingRule,
  sellingPrice: number,
): Promise<number> {
  if (!rule.cashback_enabled) {
    return 0;
  }

  const value =
    safeNumber(
      rule.cashback_value,
    );

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return 0;
  }

  const type =
    String(
      rule.cashback_type ?? '',
    )
      .trim()
      .toLowerCase();

  if (type === 'percentage') {
    return Number(
      (
        sellingPrice *
        (value / 100)
      ).toFixed(2),
    );
  }

  return Number(
    Math.min(
      value,
      sellingPrice,
    ).toFixed(2),
  );
}

async function creditCashback(
  userId: string,
  transactionId: string,
  amount: number,
): Promise<void> {
  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return;
  }

  await db.execute(sql`
    UPDATE wallets
    SET
      balance =
        balance +
        ${amount.toFixed(2)}::numeric,
      updated_at = NOW()
    WHERE user_id = ${userId}::uuid
  `);

  await db.execute(sql`
    UPDATE transactions
    SET
      metadata =
        COALESCE(metadata, '{}'::jsonb)
        || ${JSON.stringify({
          cashback:
            amount,
          cashbackCredited:
            true,
          cashbackCreditedAt:
            new Date().toISOString(),
        })}::jsonb,
      updated_at = NOW()
    WHERE id = ${transactionId}::uuid
  `);
}

/* ============================================================================
 * DATA PURCHASE
 * ========================================================================== */

router.post(
  '/data',
  async (
    req: Request,
    res: Response,
  ) => {
    const userId =
      String(
        (req as Request & {
          user?: {
            id?: string;
          };
        }).user?.id ?? '',
      );

    const {
      network,
      phone,
      planCode,
      planName,
      portedNumber,
    } = req.body ?? {};

    if (!userId) {
      res.status(401).json({
        success: false,
        error:
          'Authentication required.',
      });
      return;
    }

    const normalizedNetwork =
      normalizeNetwork(network);

    const normalizedPhone =
      String(phone).trim();

    const normalizedPlanCode =
      String(planCode).trim();

    const normalizedPlanName =
      String(planName).trim();

    if (!normalizedNetwork) {
      res.status(400).json({
        success: false,
        error:
          'Network is required.',
      });
      return;
    }

    if (!normalizedPhone) {
      res.status(400).json({
        success: false,
        error:
          'Phone number is required.',
      });
      return;
    }

    if (
      !validNigerianPhone(
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

    if (!normalizedPlanCode) {
      res.status(400).json({
        success: false,
        error:
          'Data plan is required.',
      });
      return;
    }

    const idempotencyKey =
      getIdempotencyKey(req);

    try {
      /* --------------------------------------------------------------
       * IDEMPOTENCY
       * ------------------------------------------------------------ */

      if (idempotencyKey) {
        const existing =
          await findExistingTransaction(
            userId,
            idempotencyKey,
          );

        if (existing) {
          if (
            existing.status ===
            'success'
          ) {
            const wallet =
              await db
                .select({
                  balance:
                    walletsTable.balance,
                })
                .from(
                  walletsTable,
                )
                .where(
                  sql`${walletsTable.userId} = ${userId}::uuid`,
                );

            res.json({
              success: true,
              pending: false,
              requestId:
                existing.reference ??
                existing.id,
              txnId:
                existing.id,
              balance:
                wallet[0]?.balance ??
                '0',
              idempotent: true,
            });
            return;
          }

          if (
            existing.status ===
            'pending'
          ) {
            res.status(202).json({
              success: false,
              pending: true,
              requestId:
                existing.reference ??
                existing.id,
              txnId:
                existing.id,
              error:
                'Transaction is still processing. Do not resubmit.',
              idempotent: true,
            });
            return;
          }

          res.status(409).json({
            success: false,
            error:
              'previous_attempt_failed',
            txnId:
              existing.id,
          });
          return;
        }
      }

      /* --------------------------------------------------------------
       * PRICING
       * ------------------------------------------------------------ */

      const pricingRule =
        await findDataPricingRule({
          network:
            normalizedNetwork,
          planCode:
            normalizedPlanCode,
          planName:
            normalizedPlanName,
        });

      if (!pricingRule) {
        res.status(404).json({
          success: false,
          error:
            'Data plan pricing is not configured.',
        });
        return;
      }

      if (
        String(
          pricingRule.provider ??
          'smeapi',
        )
          .trim()
          .toLowerCase() !==
        'smeapi'
      ) {
        res.status(409).json({
          success: false,
          error:
            'This data plan is not configured for SMEAPI.',
        });
        return;
      }

      const sellingPrice =
        safeNumber(
          pricingRule.selling_price,
        );

      if (
        !Number.isFinite(
          sellingPrice,
        ) ||
        sellingPrice <= 0
      ) {
        res.status(409).json({
          success: false,
          error:
            'Data plan has an invalid selling price.',
        });
        return;
      }

      const cashback =
        await calculateCashback(
          pricingRule,
          sellingPrice,
        );

      /* --------------------------------------------------------------
       * REFERENCE
       * ------------------------------------------------------------ */

      const reference =
        idempotencyKey
          ? `GY-DAT-${idempotencyKey
              .replace(
                /[^A-Za-z0-9_-]/g,
                '',
              )
              .slice(0, 120)}`
          : makeReference(
              'DATA',
            );

      /* --------------------------------------------------------------
       * DEBIT
       * ------------------------------------------------------------ */

      const debit =
        await debitWalletAndCreateTransaction({
          userId,
          type: 'data',
          service: 'Data',
          provider: 'smeapi',
          amount:
            sellingPrice,
          reference,
          description:
            `${normalizedNetwork.toUpperCase()} Data ${normalizedPlanName || normalizedPlanCode}`,
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
            portedNumber:
              portedNumber ??
              null,
            provider:
              'smeapi',
            pricingRuleId:
              pricingRule.id,
            costPrice:
              safeNumber(
                pricingRule.cost_price,
              ),
            sellingPrice,
              cashback,
          },
        });

      /* --------------------------------------------------------------
       * PROVIDER REQUEST
       * ------------------------------------------------------------ */

      let providerResult: unknown;

      try {
        providerResult =
          await purchaseData({
            network:
              normalizedNetwork,
            phone:
              normalizedPhone,
            planCode:
              normalizedPlanCode,
            reference,
            ported_number:
              portedNumber ??
              undefined,
          });
      } catch (providerError) {
        const errorMessage =
          providerError instanceof Error
            ? providerError.message
            : 'SMEAPI request failed.';

        /*
         * Unknown provider result = pending reconciliation.
         * Never automatically refund an uncertain request.
         */
        logger.error(
          {
            err:
              providerError,
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
              errorMessage,
            reconciliationRequired:
              true,
            updatedAt:
              new Date().toISOString(),
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

      /* --------------------------------------------------------------
       * PROCESSING / 202
       * ------------------------------------------------------------ */

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

      /* --------------------------------------------------------------
       * SUCCESS
       * ------------------------------------------------------------ */

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
          },
        );

        if (cashback > 0) {
          try {
            await creditCashback(
              userId,
              debit.transactionId,
              cashback,
            );
          } catch (cashbackError) {
            logger.error(
              {
                err:
                  cashbackError,
                userId,
                transactionId:
                  debit.transactionId,
                cashback,
              },
              'Failed to credit data purchase cashback',
            );
          }
        }

        const balance =
          await getWalletBalance(
            userId,
          );

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
              `${normalizedNetwork.toUpperCase()} ${normalizedPlanName || normalizedPlanCode} was purchased successfully.`,
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
          balance,
        });
        return;
      }

      /* --------------------------------------------------------------
       * EXPLICIT FAILURE → REFUND
       * ------------------------------------------------------------ */

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
            `Your ${normalizedNetwork.toUpperCase()} data purchase failed and your wallet has been refunded.`,
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
    } catch (err: unknown) {
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
        'POST /purchase/data failed',
      );

      res.status(500).json({
        success: false,
        error:
          'Unable to process data purchase.',
      });
    }
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
  ) => {
    const userId =
      String(
        (req as Request & {
          user?: {
            id?: string;
          };
        }).user?.id ?? '',
      );

    const {
      network,
      phone,
      amount,
    } = req.body ?? {};

    if (!userId) {
      res.status(401).json({
        success: false,
        error:
          'Authentication required.',
      });
      return;
    }

    const normalizedNetwork =
      normalizeNetwork(network);

    const normalizedPhone =
      String(phone).trim();

    const numericAmount =
      safeNumber(amount);

    if (!normalizedNetwork) {
      res.status(400).json({
        success: false,
        error:
          'Network is required.',
      });
      return;
    }

    if (!normalizedPhone) {
      res.status(400).json({
        success: false,
        error:
          'Phone number is required.',
      });
      return;
    }

    if (
      !validNigerianPhone(
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
      !Number.isFinite(
        numericAmount,
      ) ||
      numericAmount <= 0
    ) {
      res.status(400).json({
        success: false,
        error:
          'Airtime amount must be greater than zero.',
      });
      return;
    }

    if (
      numericAmount >
      100000
    ) {
      res.status(400).json({
        success: false,
        error:
          'Airtime amount cannot exceed ₦100,000.',
      });
      return;
    }

    const idempotencyKey =
      getIdempotencyKey(req);

    try {
      /* --------------------------------------------------------------
       * IDEMPOTENCY
       * ------------------------------------------------------------ */

      if (idempotencyKey) {
        const existing =
          await findExistingTransaction(
            userId,
            idempotencyKey,
          );

        if (existing) {
          if (
            existing.status ===
            'success'
          ) {
            const wallet =
              await db
                .select({
                  balance:
                    walletsTable.balance,
                })
                .from(
                  walletsTable,
                )
                .where(
                  sql`${walletsTable.userId} = ${userId}::uuid`,
                );

            res.json({
              success: true,
              pending: false,
              requestId:
                existing.reference ??
                existing.id,
              txnId:
                existing.id,
              balance:
                wallet[0]?.balance ??
                '0',
              idempotent: true,
            });
            return;
          }

          if (
            existing.status ===
            'pending'
          ) {
            res.status(202).json({
              success: false,
              pending: true,
              requestId:
                existing.reference ??
                existing.id,
              txnId:
                existing.id,
              error:
                'Transaction is still processing. Do not resubmit.',
              idempotent: true,
            });
            return;
          }

          res.status(409).json({
            success: false,
            error:
              'previous_attempt_failed',
            txnId:
              existing.id,
          });
          return;
        }
      }

      /* --------------------------------------------------------------
       * PROVIDER
       * ------------------------------------------------------------ */

      await validateAirtimeProvider(
        normalizedNetwork,
      );

      const reference =
        idempotencyKey
          ? `GY-AIR-${idempotencyKey
              .replace(
                /[^A-Za-z0-9_-]/g,
                '',
              )
              .slice(0, 120)}`
          : makeReference(
              'AIRTIME',
            );

      /* --------------------------------------------------------------
       * DEBIT
       * ------------------------------------------------------------ */

      const debit =
        await debitWalletAndCreateTransaction({
          userId,
          type: 'airtime',
          service: 'Airtime',
          provider: 'smeapi',
          amount:
            numericAmount,
          reference,
          description:
            `${normalizedNetwork.toUpperCase()} Airtime`,
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
          },
        });

      /* --------------------------------------------------------------
       * PROVIDER
       * ------------------------------------------------------------ */

      let providerResult: unknown;

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
      } catch (providerError) {
        const errorMessage =
          providerError instanceof Error
            ? providerError.message
            : 'SMEAPI request failed.';

        /*
         * Unknown provider result = pending reconciliation.
         * Never automatically refund an uncertain request.
         */
        logger.error(
          {
            err:
              providerError,
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
              errorMessage,
            reconciliationRequired:
              true,
            updatedAt:
              new Date().toISOString(),
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

      /* --------------------------------------------------------------
       * PROCESSING / 202
       * ------------------------------------------------------------ */

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

      /* --------------------------------------------------------------
       * SUCCESS
       * ------------------------------------------------------------ */

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

      /* --------------------------------------------------------------
       * EXPLICIT FAILURE → REFUND
       * ------------------------------------------------------------ */

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
    } catch (err: unknown) {
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
        'INVALID_PROVIDER'
      ) {
        res.status(409).json({
          success: false,
          error:
            'This airtime service is not configured for SMEAPI.',
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
        'POST /purchase/airtime failed',
      );

      res.status(500).json({
        success: false,
        error:
          'Unable to process airtime purchase.',
      });
    }
  },
);

export default router;
