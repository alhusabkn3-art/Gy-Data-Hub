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
        'SMEAPI is not configured as the provider for this airtime service.',
      ),
      {
        code: 'INVALID_PROVIDER',
      },
    );
  }
}

/* ============================================================================
 * CASHBACK
 * ========================================================================== */

function calculateCashback(
  amount: number,
  rule: PricingRule,
): number {
  if (!rule.cashback_enabled) {
    return 0;
  }

  const value =
    safeNumber(rule.cashback_value);

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
        amount * (value / 100),
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
  if (params.amount <= 0) {
    return;
  }

  await tx.execute(sql`
    INSERT INTO cashback_wallets
      (user_id, balance)
    VALUES
      (${params.userId}::uuid, 0)
    ON CONFLICT (user_id) DO NOTHING
  `);

  const wallet =
    await tx.execute(sql`
      SELECT balance
      FROM cashback_wallets
      WHERE user_id = ${params.userId}::uuid
      FOR UPDATE
    `);

  if (!wallet.rows.length) {
    throw new Error(
      'Cashback wallet not found.',
    );
  }

  await tx.execute(sql`
    UPDATE cashback_wallets
    SET
      balance =
        balance + ${params.amount.toFixed(2)},
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
 * CASHBACK TRANSFER
 * ========================================================================== */

export async function transferCashbackToMain(
  userId: string,
  amount: number,
  mode: 'manual' | 'auto' = 'manual',
): Promise<{
  newMainBalance: string;
  newCashbackBalance: string;
}> {
  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      'Invalid cashback transfer amount.',
    );
  }

  return db.transaction(
    async (tx) => {
      const cashbackResult =
        await tx.execute(sql`
          SELECT balance
          FROM cashback_wallets
          WHERE user_id = ${userId}::uuid
          FOR UPDATE
        `);

      if (!cashbackResult.rows.length) {
        throw new Error(
          'Cashback wallet not found.',
        );
      }

      const cashbackBalance =
        Number(
          (
            cashbackResult.rows[0] as Record<
              string,
              unknown
            >
          ).balance ?? 0,
        );

      if (
        cashbackBalance <
        amount
      ) {
        throw Object.assign(
          new Error(
            'Insufficient cashback balance.',
          ),
          {
            code: 'INSUFFICIENT',
          },
        );
      }

      const walletResult =
        await tx.execute(sql`
          SELECT id, balance
          FROM wallets
          WHERE user_id = ${userId}::uuid
          FOR UPDATE
        `);

      if (!walletResult.rows.length) {
        throw new Error(
          'Main wallet not found.',
        );
      }

      const wallet =
        walletResult.rows[0] as Record<
          string,
          unknown
        >;

      const mainBefore =
        Number(wallet.balance ?? 0);

      const newMain =
        Number(
          (
            mainBefore +
            amount
          ).toFixed(2),
        );

      const newCashback =
        Number(
          (
            cashbackBalance -
            amount
          ).toFixed(2),
        );

      const reference =
        makeReference('CBT');

      await tx.execute(sql`
        UPDATE wallets
        SET
          balance = ${newMain.toFixed(2)},
          updated_at = NOW()
        WHERE user_id = ${userId}::uuid
      `);

      await tx.execute(sql`
        UPDATE cashback_wallets
        SET
          balance = ${newCashback.toFixed(2)},
          updated_at = NOW()
        WHERE user_id = ${userId}::uuid
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
            reason
          )
        VALUES
          (
            ${String(wallet.id)}::uuid,
            ${userId}::uuid,
            'credit',
            ${amount.toFixed(2)},
            ${mainBefore.toFixed(2)},
            ${newMain.toFixed(2)},
            ${reference},
            ${`Cashback transfer (${mode})`}
          )
      `);

      return {
        newMainBalance:
          newMain.toFixed(2),
        newCashbackBalance:
          newCashback.toFixed(2),
      };
    },
  );
}

/* ============================================================================
 * WALLET DEBIT
 * ========================================================================== */

async function debitWalletAndCreateTransaction(
  params: {
    userId: string;
    type: 'data' | 'airtime';
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
          SELECT id, balance
          FROM wallets
          WHERE user_id = ${params.userId}::uuid
          FOR UPDATE
        `);

      if (!walletResult.rows.length) {
        throw Object.assign(
          new Error(
            'Wallet not found.',
          ),
          {
            code: 'NOT_FOUND',
          },
        );
      }

      const wallet =
        walletResult.rows[0] as Record<
          string,
          unknown
        >;

      const before =
        Number(wallet.balance ?? 0);

      if (
        before <
        params.amount
      ) {
        throw Object.assign(
          new Error(
            'Insufficient wallet balance.',
          ),
          {
            code: 'INSUFFICIENT_FUNDS',
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
        await tx.insert(
          transactionsTable,
        ).values({
          userId: params.userId,
          type: params.type,
          service: params.service,
          provider: params.provider,
          amount:
            params.amount.toFixed(2),
          status: 'pending',
          reference: params.reference,
          description:
            params.description,
          paymentMethod:
            'Wallet',
          metadata:
            params.metadata,
        }).returning({
          id: transactionsTable.id,
        });

      const transactionId =
        transaction[0]?.id;

      if (!transactionId) {
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
        ON CONFLICT (reference) DO NOTHING
      `);

      return {
        transactionId,
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
      const walletResult =
        await tx.execute(sql`
          SELECT id, balance
          FROM wallets
          WHERE user_id = ${params.userId}::uuid
          FOR UPDATE
        `);

      if (!walletResult.rows.length) {
        throw new Error(
          'Wallet not found during refund.',
        );
      }

      const wallet =
        walletResult.rows[0] as Record<
          string,
          unknown
        >;

      const before =
        Number(wallet.balance ?? 0);

      /*
       * Check transaction first.
       * If already refunded/successful, don't credit twice.
       */
      const txnResult =
        await tx.execute(sql`
          SELECT
            status,
            metadata
          FROM transactions
          WHERE id = ${params.transactionId}::uuid
          FOR UPDATE
        `);

      if (!txnResult.rows.length) {
        throw new Error(
          'Transaction not found during refund.',
        );
      }

      const txn =
        txnResult.rows[0] as Record<
          string,
          unknown
        >;

      const metadata =
        txn.metadata &&
        typeof txn.metadata === 'object'
          ? txn.metadata as Record<
              string,
              unknown
            >
          : {};

      if (
        metadata.refunded === true
      ) {
        return before.toFixed(2);
      }

      if (
        String(txn.status) ===
        'success'
      ) {
        return before.toFixed(2);
      }

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
            COALESCE(metadata, '{}'::jsonb)
            ||
            ${JSON.stringify({
              refunded: true,
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
        ON CONFLICT (reference) DO NOTHING
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
        COALESCE(metadata, '{}'::jsonb)
        ||
        ${JSON.stringify(metadata)}::jsonb
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
        COALESCE(metadata, '{}'::jsonb)
        ||
        ${JSON.stringify(metadata)}::jsonb
    WHERE id = ${transactionId}::uuid
      AND status <> 'success'
  `);
}

/* ============================================================================
 * SOCKET + NOTIFICATION
 * ========================================================================== */

function emitWalletUpdate(
  userId: string,
  balance: string,
): void {
  try {
    getIo()
      .to(`user:${userId}`)
      .emit(
        'wallet:updated',
        { balance },
      );
  } catch {
    // Non-critical.
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
        title: params.title,
        body: params.body,
        refId:
          params.transactionId,
      },
    );
  } catch {
    // Notification failure must not alter purchase state.
  }
}

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
      planPrice === undefined
    ) {
      res.status(400).json({
        success: false,
        error:
          'network, phone, planCode, planName and planPrice are required.',
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

    if (
      ![
        'mtn',
        'glo',
        '9mobile',
        'airtel',
      ].includes(normalizedNetwork)
    ) {
      res.status(400).json({
        success: false,
        error:
          'Unsupported network.',
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

    const requestedPrice =
      safeNumber(planPrice);

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
              planName:
                normalizedPlanName,
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
              planName:
                normalizedPlanName,
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
            'Data plan pricing rule not found or disabled.',
        });
        return;
      }

      const provider =
        String(
          pricingRule.provider ??
          '',
        )
          .trim()
          .toLowerCase();

      if (
        provider !==
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

      const cashbackAmount =
        calculateCashback(
          sellingPrice,
          pricingRule,
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
            pricingRuleId:
              pricingRule.id,
          },
        });

      /* --------------------------------------------------------------
       * PROVIDER
       * ------------------------------------------------------------ */

      let providerResult: unknown;

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
      } catch (providerError) {
        const errorMessage =
          providerError instanceof Error
            ? providerError.message
            : 'SMEAPI request failed.';

        /*
         * Network timeout / unknown provider response must NOT
         * automatically be refunded because the provider may have
         * received the transaction.
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
          planName:
            normalizedPlanName,
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

        if (
          cashbackAmount > 0
        ) {
          try {
            await db.transaction(
              async (tx) => {
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
                      pricingRule.cashback_type,
                    cashbackValue:
                      safeNumber(
                        pricingRule.cashback_value,
                      ),
                  },
                );

                await tx.execute(sql`
                  UPDATE transactions
                  SET metadata =
                    COALESCE(metadata, '{}'::jsonb)
                    ||
                    ${JSON.stringify({
                      cashbackApplied:
                        true,
                      cashbackAmount,
                    })}::jsonb
                  WHERE id = ${debit.transactionId}::uuid
                `);
              },
            );
          } catch (cashbackError) {
            logger.error(
              {
                err:
                  cashbackError,
                userId,
                transactionId:
                  debit.transactionId,
                cashbackAmount,
              },
              'Cashback credit failed after successful data purchase',
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
              `${normalizedNetwork.toUpperCase()} ${normalizedPlanName} purchased successfully for ₦${sellingPrice.toLocaleString('en-NG')}.`,
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
          cashbackApplied:
            cashbackAmount > 0,
          cashbackAmount,
        });
        return;
      }

      /* --------------------------------------------------------------
       * EXPLICIT FAILURE
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
            `Your data purchase failed and ₦${sellingPrice.toLocaleString('en-NG')} has been refunded.`,
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
      amount === undefined
    ) {
      res.status(400).json({
        success: false,
        error:
          'network, phone and amount are required.',
      });
      return;
    }

    const normalizedNetwork =
      normalizeNetwork(network);

    const normalizedPhone =
      String(phone).trim();

    const numericAmount =
      safeNumber(amount);

    if (
      ![
        'mtn',
        'glo',
        '9mobile',
        'airtel',
      ].includes(normalizedNetwork)
    ) {
      res.status(400).json({
        success: false,
        error:
          'Unsupported network.',
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
      numericAmount <= 0
    ) {
      res.status(400).json({
        success: false,
        error:
          'Amount must be greater than zero.',
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
