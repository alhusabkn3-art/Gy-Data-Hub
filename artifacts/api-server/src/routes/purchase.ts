/**
 * purchase.ts
 *
 * Server-orchestrated purchases:
 *   POST /purchase/data
 *   POST /purchase/airtime
 *
 * IMPORTANT:
 * - SMEAPI is the only purchase provider.
 * - SME_API_KEY is read only from server environment.
 * - Pricing/provider validation happens BEFORE wallet debit.
 * - Idempotency is supported through Idempotency-Key.
 * - The same provider reference is reused for the SMEAPI request.
 * - Pending transactions are NOT automatically refunded.
 * - Failed provider transactions are refunded atomically.
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
 * HELPERS
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
  const normalized = phone.replace(/\s+/g, '');

  return /^(?:\+234|234|0)(?:70|71|80|81|90|91)[0-9]{8}$/.test(
    normalized,
  );
}

function safeNumber(value: unknown): number {
  const n = Number(value);

  return Number.isFinite(n) ? n : 0;
}

function getIdempotencyKey(req: Request): string | null {
  const raw =
    req.header('Idempotency-Key') ??
    req.header('idempotency-key');

  if (!raw) {
    return null;
  }

  const value = String(raw).trim();

  if (!value) {
    return null;
  }

  /*
   * Keep the value reasonably bounded because it may be used
   * as part of the transaction/provider reference.
   */
  return value.slice(0, 180);
}

/* ============================================================================
 * FIND EXISTING IDEMPOTENT TRANSACTION
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
  /*
   * The idempotency key is stored inside transaction metadata.
   *
   * We intentionally do not create another database table just for
   * idempotency because transactions already exist and are unique.
   */
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
    status: String(row.status) as PurchaseStatus,
    reference:
      row.reference == null
        ? null
        : String(row.reference),
    amount: String(row.amount),
    metadata: row.metadata,
  };
}

/* ============================================================================
 * PRICING RULE LOOKUP
 * ========================================================================== */

async function findDataPricingRule(params: {
  network: string;
  planCode: string;
  planName: string;
}): Promise<PricingRule | null> {
  const network = normalizeNetwork(params.network);
  const planCode = normalizePlanId(params.planCode);
  const planName = normalizePlanName(params.planName);

  const result = await db.execute(sql`
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
      AND (
        LOWER(COALESCE(network, '')) = ${network}
        OR LOWER(COALESCE(network, '')) = UPPER(${network})
      )
      AND (
        LOWER(COALESCE(plan_id, '')) = ${planCode}
        OR LOWER(COALESCE(plan_name, '')) = ${planName}
      )
    ORDER BY
      CASE
        WHEN LOWER(COALESCE(plan_id, '')) = ${planCode}
        THEN 0
        ELSE 1
      END,
      updated_at DESC
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
    service_type: String(row.service_type),
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
    enabled: Boolean(row.enabled),
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
 *
 * Airtime is amount-based, so there is no plan_id.
 *
 * If an airtime pricing rule exists for the requested network, its provider
 * MUST be SMEAPI. If an explicit rule does not exist, we still use SMEAPI
 * because SMEAPI is the sole configured purchase provider.
 * ========================================================================== */

async function validateAirtimeProvider(
  network: string,
): Promise<void> {
  const normalizedNetwork = normalizeNetwork(network);

  const result = await db.execute(sql`
    SELECT
      id,
      provider,
      enabled
    FROM pricing_rules
    WHERE service_type = 'airtime'
      AND enabled = true
      AND (
        LOWER(COALESCE(network, '')) = ${normalizedNetwork}
        OR LOWER(COALESCE(network, '')) = UPPER(${normalizedNetwork})
      )
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  const row = result.rows[0] as
    | Record<string, unknown>
    | undefined;

  /*
   * No airtime-specific pricing rule:
   * use the globally enforced SMEAPI provider.
   */
  if (!row) {
    return;
  }

  const provider = String(
    row.provider ?? '',
  )
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
 * CASHBACK CALCULATION
 * ========================================================================== */

function calculateCashback(
  amount: number,
  rule: PricingRule,
): number {
  if (!rule.cashback_enabled) {
    return 0;
  }

  const value = safeNumber(
    rule.cashback_value,
  );

  if (value <= 0) {
    return 0;
  }

  if (rule.cashback_type === 'percentage') {
    const cashback =
      amount * (value / 100);

    return Number(
      Math.max(0, cashback).toFixed(2),
    );
  }

  if (rule.cashback_type === 'fixed') {
    return Number(
      Math.min(amount, value).toFixed(2),
    );
  }

  return 0;
}

/* ============================================================================
 * CREDIT CASHBACK
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
  if (params.amount <= 0) {
    return;
  }

  /*
   * Make sure a cashback wallet exists.
   * New users already receive one during registration, but this protects
   * older accounts.
   */
  await tx.execute(sql`
    INSERT INTO cashback_wallets
      (user_id, balance)
    VALUES
      (${params.userId}::uuid, 0)
    ON CONFLICT (user_id) DO NOTHING
  `);

  const walletResult = await tx.execute(sql`
    SELECT balance
    FROM cashback_wallets
    WHERE user_id = ${params.userId}::uuid
    FOR UPDATE
  `);

  if (!walletResult.rows.length) {
    throw new Error(
      'Cashback wallet not found.',
    );
  }

  await tx.execute(sql`
    UPDATE cashback_wallets
    SET balance = balance + ${params.amount},
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
 * TRANSFER CASHBACK TO MAIN WALLET
 *
 * Used by cashback-user.ts:
 *
 * import { transferCashbackToMain } from './purchase.js';
 * ========================================================================== */

export async function transferCashbackToMain(
  userId: string,
  amount: number,
  mode: 'manual' | 'auto' = 'manual',
): Promise<{
  newMainBalance: string;
  newCashbackBalance: string;
}> {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(
      'Invalid cashback transfer amount.',
    );
  }

  const result = await db.transaction(
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

      const cashbackBalance = Number(
        (
          cashbackResult.rows[0] as Record<
            string,
            unknown
          >
        ).balance ?? 0,
      );

      if (
        cashbackBalance < amount
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

      const mainBalanceBefore =
        Number(wallet.balance ?? 0);

      const newMainBalance =
        Number(
          (
            mainBalanceBefore +
            amount
          ).toFixed(2),
        );

      const newCashbackBalance =
        Number(
          (
            cashbackBalance -
            amount
          ).toFixed(2),
        );

      const reference =
        makeReference('CBT');

      /*
       * Main wallet credit.
       */
      await tx.execute(sql`
        UPDATE wallets
        SET
          balance = ${newMainBalance.toFixed(2)},
          updated_at = NOW()
        WHERE user_id = ${userId}::uuid
      `);

      /*
       * Cashback wallet debit.
       */
      await tx.execute(sql`
        UPDATE cashback_wallets
        SET
          balance = ${newCashbackBalance.toFixed(2)},
          updated_at = NOW()
        WHERE user_id = ${userId}::uuid
      `);

      /*
       * Audit the main-wallet credit.
       */
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
            ${mainBalanceBefore.toFixed(2)},
            ${newMainBalance.toFixed(2)},
            ${reference},
            ${`Cashback transfer (${mode})`}
          )
      `);

      return {
        newMainBalance:
          newMainBalance.toFixed(2),
        newCashbackBalance:
          newCashbackBalance.toFixed(2),
      };
    },
  );

  return result;
}

/* ============================================================================
 * DEBIT MAIN WALLET + CREATE TRANSACTION
 *
 * This happens BEFORE the provider call.
 *
 * Provider validation MUST already have succeeded before this function runs.
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

      const balanceBefore =
        Number(wallet.balance ?? 0);

      if (
        balanceBefore <
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

      const newBalance =
        Number(
          (
            balanceBefore -
            params.amount
          ).toFixed(2),
        );

      await tx.execute(sql`
        UPDATE wallets
        SET
          balance = ${newBalance.toFixed(2)},
          updated_at = NOW()
        WHERE user_id = ${params.userId}::uuid
      `);

      const transactionResult =
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
        transactionResult[0]?.id;

      if (!transactionId) {
        throw new Error(
          'Failed to create transaction.',
        );
      }

      /*
       * Wallet audit entry.
       */
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
            ${balanceBefore.toFixed(2)},
            ${newBalance.toFixed(2)},
            ${params.reference},
            ${transactionId}::uuid,
            ${params.description}
          )
        ON CONFLICT (reference) DO NOTHING
      `);

      return {
        transactionId,
        balance:
          newBalance.toFixed(2),
      };
    },
  );
}

/* ============================================================================
 * REFUND FAILED PURCHASE
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

      const currentBalance =
        Number(wallet.balance ?? 0);

      const newBalance =
        Number(
          (
            currentBalance +
            params.amount
          ).toFixed(2),
        );

      await tx.execute(sql`
        UPDATE wallets
        SET
          balance = ${newBalance.toFixed(2)},
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
            ${currentBalance.toFixed(2)},
            ${newBalance.toFixed(2)},
            ${`${params.reference}-refund`},
            ${params.transactionId}::uuid,
            ${params.reason}
          )
        ON CONFLICT (reference) DO NOTHING
      `);

      return newBalance.toFixed(2);
    },
  );
}

/* ============================================================================
 * MARK SUCCESS
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
  `);
}

/* ============================================================================
 * MARK PENDING
 * ========================================================================== */

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
  `);
}

/* ============================================================================
 * RESPONSE HELPERS
 * ========================================================================== */

function emitWalletUpdate(
  userId: string,
  balance: string,
): void {
  try {
    getIo()
      .to(`user:${userId}`)
      .emit('wallet:updated', {
        balance,
      });
  } catch {
    /*
     * Socket is non-critical.
     */
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
        refId: params.transactionId,
      },
    );
  } catch {
    /*
     * Notification failure must never turn a successful
     * provider transaction into a failed purchase.
     */
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

    const {
      network,
      phone,
      planCode,
      planName,
      planPrice,
    } = req.body as {
      network?: string;
      phone?: string;
      planCode?: string;
      planName?: string;
      planPrice?: string | number;
    };

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
        error: 'Unsupported network.',
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
      !Number.isFinite(
        requestedPrice,
      ) ||
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
      /*
       * ================================================================
       * 1. IDEMPOTENCY CHECK
       * ================================================================
       */

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
            res.json({
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
                'Transaction is still processing.',
              idempotent: true,
            });
            return;
          }

          /*
           * A previous attempt failed.
           * Frontend is allowed to create a new Idempotency-Key and retry.
           */
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

      /*
       * ================================================================
       * 2. LOAD PRICING RULE
       * ================================================================
       */

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

      /*
       * ================================================================
       * 3. STRICT SMEAPI PROVIDER CHECK
       *
       * THIS MUST HAPPEN BEFORE WALLET DEBIT.
       * ================================================================
       */

      const provider =
        String(
          pricingRule.provider ??
          '',
        )
          .trim()
          .toLowerCase();

      if (
        provider !== 'smeapi'
      ) {
        logger.warn(
          {
            userId,
            pricingRuleId:
              pricingRule.id,
            provider,
            network:
              normalizedNetwork,
            planCode:
              normalizedPlanCode,
          },
          'Purchase rejected because pricing rule provider is not SMEAPI',
        );

        res.status(409).json({
          success: false,
          error:
            'This data plan is not configured for SMEAPI.',
        });
        return;
      }

      /*
       * ================================================================
       * 4. SERVER PRICE IS AUTHORITATIVE
       * ================================================================
       */

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
        res.status(400).json({
          success: false,
          error:
            'This data plan has an invalid selling price.',
        });
        return;
      }

      /*
       * Never trust planPrice from frontend.
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

      /*
       * ================================================================
       * 5. CREATE PROVIDER REFERENCE
       * ================================================================
       */

      const reference =
        idempotencyKey
          ? `GY-DAT-${idempotencyKey.replace(
              /[^A-Za-z0-9_-]/g,
              '',
            ).slice(0, 120)}`
          : makeReference(
              'DATA',
            );

      /*
       * ================================================================
       * 6. CALCULATE CASHBACK
       * ================================================================
       */

      const cashbackAmount =
        calculateCashback(
          sellingPrice,
          pricingRule,
        );

      /*
       * ================================================================
       * 7. DEBIT WALLET + CREATE PENDING TRANSACTION
       *
       * Provider check has already passed above.
       * ================================================================
       */

      const debit =
        await debitWalletAndCreateTransaction(
          {
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
          },
        );

      /*
       * ================================================================
       * 8. CALL SMEAPI
       *
       * SAME reference is passed to provider.
       * ================================================================
       */

      let providerResult;

      try {
        providerResult =
          await purchaseData({
            network:
              normalizedNetwork,
            phone:
              normalizedPhone,
            dataPlan:
              normalizedPlanCode,
            reference,
          });
      } catch (providerError) {
        const message =
          providerError instanceof Error
            ? providerError.message
            : 'SMEAPI request failed.';

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

        const refundedBalance =
          await refundFailedPurchase({
            userId,
            transactionId:
              debit.transactionId,
            amount:
              sellingPrice,
            reference,
            reason:
              message,
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
              `Your ₦${sellingPrice.toLocaleString('en-NG')} data purchase failed and your wallet has been refunded.`,
            transactionId:
              debit.transactionId,
          },
        );

        res.status(502).json({
          success: false,
          error:
            'Data purchase failed. Your wallet has been refunded.',
          txnId:
            debit.transactionId,
          balance:
            refundedBalance,
        });
        return;
      }

      /*
       * ================================================================
       * 9. PROVIDER RESULT
       * ================================================================
       */

      const message =
        String(
          providerResult.message ??
          '',
        ).trim();

      /*
       * SMEAPI client currently exposes success=true/false.
       * We do NOT invent a status/requery endpoint.
       *
       * A failed response is refundable.
       */
      if (
        providerResult.success
      ) {
        await markTransactionSuccess(
          debit.transactionId,
          {
            providerStatus:
              'success',
            providerReference:
              providerResult.reference ??
              reference,
            providerMessage:
              message,
            providerResponse:
              providerResult.transaction ??
              null,
            completedAt:
              new Date().toISOString(),
          },
        );

        /*
         * Cashback is credited only after successful provider purchase.
         */
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
            /*
             * Do not reverse a successful data purchase just because
             * cashback accounting failed.
             *
             * Log it for reconciliation.
             */
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
            providerResult.reference ??
            reference,
          txnId:
            debit.transactionId,
          planName:
            normalizedPlanName,
          balance:
            debit.balance,
          cashbackApplied:
            cashbackAmount > 0,
          cashbackAmount:
            cashbackAmount,
        });

        return;
      }

      /*
       * Provider returned a non-success response.
       *
       * Because the current SMEAPI client does not expose a verified
       * "processing" status, we treat the explicit unsuccessful response
       * as failed and refund.
       */
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
          message?: string;
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

    const {
      network,
      phone,
      amount,
    } = req.body as {
      network?: string;
      phone?: string;
      amount?: number;
    };

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
      !Number.isFinite(
        numericAmount,
      ) ||
      numericAmount <= 0
    ) {
      res.status(400).json({
        success: false,
        error:
          'Amount must be greater than zero.',
      });
      return;
    }

    /*
     * Prevent obviously dangerous accidental amounts.
     */
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
      /*
       * ================================================================
       * 1. IDEMPOTENCY
       * ================================================================
       */

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
            res.json({
              success: false,
              pending: true,
              requestId:
                existing.reference ??
                existing.id,
              txnId:
                existing.id,
              error:
                'Transaction is still processing.',
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

      /*
       * ================================================================
       * 2. PROVIDER VALIDATION BEFORE DEBIT
       * ================================================================
       */

      await validateAirtimeProvider(
        normalizedNetwork,
      );

      /*
       * ================================================================
       * 3. PROVIDER REFERENCE
       * ================================================================
       */

      const reference =
        idempotencyKey
          ? `GY-AIR-${idempotencyKey.replace(
              /[^A-Za-z0-9_-]/g,
              '',
            ).slice(0, 120)}`
          : makeReference(
              'AIRTIME',
            );

      /*
       * ================================================================
       * 4. DEBIT WALLET + CREATE PENDING TRANSACTION
       * ================================================================
       */

      const debit =
        await debitWalletAndCreateTransaction(
          {
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
          },
        );

      /*
       * ================================================================
       * 5. SMEAPI AIRTIME PURCHASE
       * ================================================================
       */

      let providerResult;

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
        const message =
          providerError instanceof Error
            ? providerError.message
            : 'SMEAPI request failed.';

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

        const refundedBalance =
          await refundFailedPurchase({
            userId,
            transactionId:
              debit.transactionId,
            amount:
              numericAmount,
            reference,
            reason:
              message,
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
          error:
            'Airtime purchase failed. Your wallet has been refunded.',
          txnId:
            debit.transactionId,
          balance:
            refundedBalance,
        });

        return;
      }

      /*
       * ================================================================
       * 6. SUCCESS
       * ================================================================
       */

      if (
        providerResult.success
      ) {
        await markTransactionSuccess(
          debit.transactionId,
          {
            providerStatus:
              'success',
            providerReference:
              providerResult.reference ??
              reference,
            providerMessage:
              providerResult.message ??
              null,
            providerResponse:
              providerResult.transaction ??
              null,
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
            providerResult.reference ??
            reference,
          txnId:
            debit.transactionId,
          balance:
            debit.balance,
        });

        return;
      }

      /*
       * ================================================================
       * 7. FAILED → REFUND
       * ================================================================
       */

      const failureMessage =
        String(
          providerResult.message ??
          '',
        ).trim() ||
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
            `Your airtime purchase failed and ₦${numericAmount.toLocaleString('en-NG')} has been refunded.`,
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
          message?: string;
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
