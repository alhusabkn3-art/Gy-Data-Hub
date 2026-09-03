/**
 * COMPLETE purchase.ts
 *
 * DATA PROVIDER:
 * - Data: SMEDATA
 * - Airtime: ClubKonnect
 *
 * The existing wallet, pricing, cashback, idempotency,
 * transaction and refund logic is preserved.
 */

import { Router, type Request, type Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '@workspace/db';
import { walletsTable, transactionsTable } from '@workspace/db/schema';
import * as ck from '../lib/clubkonnect.js';
import { normalizeCKStatus } from '../lib/clubkonnect.js';
import * as smedata from '../lib/smedata.js';
import { requireAuth } from './user.js';
import { logger } from '../lib/logger.js';
import { createNotification } from '../lib/notifications.js';
import { getIo } from '../lib/socket.js';

const router = Router();

/* ─────────────────────────────────────────────────────────────
   CASHBACK
───────────────────────────────────────────────────────────── */

async function applyCashbackIfEligible(opts: {
  userId: string;
  sourceTxnId: string;
  requestId: string;
  planCode: string;
  network: string;
  planName: string;
  purchaseAmount: number;
}): Promise<{ applied: boolean; amount: number; cashbackBalance: string }> {

  const globalResult = await db.execute<{
    enabled: boolean;
    eligible_services: string[] | string;
    transfer_mode: string;
    min_transfer_amount: string;
  }>(sql`
    SELECT enabled, eligible_services, transfer_mode, min_transfer_amount
    FROM cashback_settings
    LIMIT 1
  `);

  const globalRow = globalResult.rows[0];

  if (!globalRow || !globalRow.enabled) {
    return { applied: false, amount: 0, cashbackBalance: '' };
  }

  let eligibleServices: string[] = ['data'];

  try {
    const raw = globalRow.eligible_services;
    eligibleServices = Array.isArray(raw)
      ? raw
      : JSON.parse(typeof raw === 'string' ? raw : '["data"]');
  } catch {
    eligibleServices = ['data'];
  }

  if (!eligibleServices.includes('data')) {
    return { applied: false, amount: 0, cashbackBalance: '' };
  }

  const planResult = await db.execute<{
    cashback_enabled: boolean;
    cashback_type: string;
    cashback_value: string;
  }>(sql`
    SELECT cashback_enabled, cashback_type, cashback_value
    FROM pricing_rules
    WHERE service_type = 'data'
      AND enabled = true
      AND (
        LOWER(TRIM(network)) = LOWER(TRIM(${opts.network}))
        OR LOWER(TRIM(provider)) = LOWER(TRIM(${opts.network}))
      )
      AND (
        TRIM(plan_id) = TRIM(${opts.planCode})
        OR LOWER(TRIM(plan_name)) = LOWER(TRIM(${opts.planName}))
      )
    ORDER BY
      CASE
        WHEN TRIM(plan_id) = TRIM(${opts.planCode}) THEN 0
        ELSE 1
      END
    LIMIT 1
  `);

  const rule = planResult.rows[0];

  if (!rule || !rule.cashback_enabled) {
    return { applied: false, amount: 0, cashbackBalance: '' };
  }

  const cashbackType = rule.cashback_type;
  const cashbackValue = parseFloat(rule.cashback_value);

  if (!Number.isFinite(cashbackValue) || cashbackValue <= 0) {
    return { applied: false, amount: 0, cashbackBalance: '' };
  }

  let cashbackAmount: number;

  if (cashbackType === 'percentage') {
    cashbackAmount = parseFloat(
      (opts.purchaseAmount * cashbackValue / 100).toFixed(2),
    );
  } else {
    cashbackAmount = parseFloat(cashbackValue.toFixed(2));
  }

  if (cashbackAmount <= 0) {
    return { applied: false, amount: 0, cashbackBalance: '' };
  }

  const cashbackRef = `${opts.requestId}-cashback`;

  const txResult = await db.transaction(async (tx) => {

    const insertResult = await tx.execute<{
      id: string;
      wallet_txn_id: string | null;
    }>(sql`
      INSERT INTO cashback_transactions
        (
          user_id,
          source_txn_id,
          amount,
          cashback_type,
          cashback_value,
          network,
          plan_id,
          plan_name,
          reference
        )
      VALUES
        (
          ${opts.userId}::uuid,
          ${opts.sourceTxnId}::uuid,
          ${cashbackAmount.toFixed(2)},
          ${cashbackType},
          ${cashbackValue.toFixed(2)},
          ${opts.network.toUpperCase()},
          ${opts.planCode},
          ${opts.planName},
          ${cashbackRef}
        )
      ON CONFLICT (source_txn_id) DO NOTHING
      RETURNING id, wallet_txn_id
    `);

    let cashbackRowId: string;

    if (insertResult.rows[0]) {
      cashbackRowId = insertResult.rows[0].id;
    } else {
      const existing = await tx.execute<{
        id: string;
        wallet_txn_id: string | null;
      }>(sql`
        SELECT id, wallet_txn_id
        FROM cashback_transactions
        WHERE source_txn_id = ${opts.sourceTxnId}::uuid
        LIMIT 1
      `);

      const row = existing.rows[0];

      if (!row) return null;

      if (row.wallet_txn_id !== null) {
        return null;
      }

      cashbackRowId = row.id;
    }

    await tx.execute(sql`
      INSERT INTO cashback_wallets (user_id, balance)
      VALUES (${opts.userId}::uuid, 0)
      ON CONFLICT (user_id) DO NOTHING
    `);

    const cbWalletResult = await tx.execute<{
      id: string;
      balance: string;
    }>(sql`
      SELECT id, balance
      FROM cashback_wallets
      WHERE user_id = ${opts.userId}::uuid
      FOR UPDATE
    `);

    const cbWallet = cbWalletResult.rows[0];

    if (!cbWallet) {
      throw new Error('Cashback wallet not found');
    }

    const cbBalBefore = parseFloat(cbWallet.balance);
    const cbBalAfter = (cbBalBefore + cashbackAmount).toFixed(2);

    await tx.execute(sql`
      UPDATE cashback_wallets
      SET balance = ${cbBalAfter},
          updated_at = NOW()
      WHERE user_id = ${opts.userId}::uuid
    `);

    const cbTxnResult = await tx.execute<{ id: string }>(sql`
      INSERT INTO transactions
        (
          user_id,
          type,
          service,
          provider,
          amount,
          status,
          reference,
          description,
          metadata
        )
      VALUES
        (
          ${opts.userId}::uuid,
          'cashback',
          'Cashback',
          'GY-DATA',
          ${cashbackAmount.toFixed(2)},
          'success',
          ${cashbackRef},
          ${`Cashback — ${opts.planName}`},
          jsonb_build_object(
            'sourceTxnId', ${opts.sourceTxnId},
            'requestId', ${opts.requestId},
            'planCode', ${opts.planCode},
            'network', ${opts.network},
            'cashbackType', ${cashbackType},
            'cashbackValue', ${cashbackValue}
          )
        )
      ON CONFLICT (reference) DO NOTHING
      RETURNING id
    `);

    const walletTxnId = cbTxnResult.rows[0]?.id ?? null;

    await tx.execute(sql`
      UPDATE cashback_transactions
      SET wallet_txn_id = ${walletTxnId}
      WHERE id = ${cashbackRowId}::uuid
    `);

    return {
      newBalance: cbBalAfter,
    };
  });

  if (!txResult) {
    return {
      applied: false,
      amount: 0,
      cashbackBalance: '',
    };
  }

  return {
    applied: true,
    amount: cashbackAmount,
    cashbackBalance: txResult.newBalance,
  };
}

/* ─────────────────────────────────────────────────────────────
   IDempotency
───────────────────────────────────────────────────────────── */

async function handleIdempotency(
  res: Response,
  userId: string,
  idempotencyKey: string,
  requestData: Record<string, unknown>,
): Promise<boolean> {

  const result = await db.execute<{
    id: string;
    status: string;
    amount: string;
    reference: string;
    description: string | null;
    provider_reference: string | null;
    metadata: unknown;
  }>(sql`
    SELECT
      id,
      status,
      amount,
      reference,
      description,
      provider_reference,
      metadata
    FROM transactions
    WHERE user_id = ${userId}::uuid
      AND reference = ${idempotencyKey}
    LIMIT 1
  `);

  const existing = result.rows[0];

  if (!existing) {
    return false;
  }

  const [wallet] = await db
    .select()
    .from(walletsTable)
    .where(eq(walletsTable.userId, userId));

  res.status(
    existing.status === 'failed'
      ? 422
      : 200,
  ).json({
    success:
      existing.status === 'success',
    pending:
      existing.status === 'pending',
    requestId: existing.reference,
    txnId: existing.id,
    status: existing.status,
    amount: existing.amount,
    description: existing.description,
    providerRef:
      existing.provider_reference,
    balance:
      wallet?.balance ?? '0',
    metadata:
      existing.metadata,
    ...requestData,
  });

  return true;
}

/* ─────────────────────────────────────────────────────────────
   WALLET DEBIT
───────────────────────────────────────────────────────────── */

async function debitWalletAndRecord(
  tx: any,
  opts: {
    userId: string;
    amount: number;
    requestId: string;
    type: string;
    service: string;
    provider: string;
    description: string;
    costPrice: number;
  },
): Promise<{
  txnId: string;
  newBalance: string;
}> {

  const walletResult = await tx.execute<{
    id: string;
    balance: string;
  }>(sql`
    SELECT id, balance
    FROM wallets
    WHERE user_id = ${opts.userId}::uuid
    FOR UPDATE
  `);

  const wallet = walletResult.rows[0];

  if (!wallet) {
    const error = new Error(
      'Wallet not found',
    ) as Error & {
      code?: string;
    };

    error.code = 'NOT_FOUND';

    throw error;
  }

  const balanceBefore =
    parseFloat(wallet.balance);

  if (
    !Number.isFinite(balanceBefore) ||
    balanceBefore < opts.amount
  ) {
    const error = new Error(
      'Insufficient funds',
    ) as Error & {
      code?: string;
    };

    error.code =
      'INSUFFICIENT_FUNDS';

    throw error;
  }

  const balanceAfter =
    (
      balanceBefore -
      opts.amount
    ).toFixed(2);

  await tx.execute(sql`
    UPDATE wallets
    SET
      balance = ${balanceAfter},
      updated_at = NOW()
    WHERE id = ${wallet.id}::uuid
  `);

  const txnResult =
    await tx.execute<{
      id: string;
    }>(sql`
      INSERT INTO transactions
        (
          user_id,
          type,
          service,
          provider,
          amount,
          status,
          reference,
          description,
          metadata
        )
      VALUES
        (
          ${opts.userId}::uuid,
          ${opts.type},
          ${opts.service},
          ${opts.provider},
          ${opts.amount.toFixed(2)},
          'pending',
          ${opts.requestId},
          ${opts.description},
          jsonb_build_object(
            'costPrice', ${opts.costPrice},
            'sellingPrice', ${opts.amount},
            'profit', ${opts.amount - opts.costPrice},
            'balanceBefore', ${balanceBefore},
            'balanceAfter', ${balanceAfter}
          )
        )
      RETURNING id
    `);

  const txn = txnResult.rows[0];

  if (!txn) {
    throw new Error(
      'Failed to create transaction',
    );
  }

  return {
    txnId: txn.id,
    newBalance: balanceAfter,
  };
}

/* ─────────────────────────────────────────────────────────────
   REFUND
───────────────────────────────────────────────────────────── */

async function refundWalletAndMarkFailed(opts: {
  userId: string;
  txnId: string;
  amount: number;
  requestId: string;
}): Promise<string> {

  const newBalance =
    await db.transaction(
      async (tx) => {

        const walletResult =
          await tx.execute<{
            id: string;
            balance: string;
          }>(sql`
            SELECT id, balance
            FROM wallets
            WHERE user_id = ${opts.userId}::uuid
            FOR UPDATE
          `);

        const wallet =
          walletResult.rows[0];

        if (!wallet) {
          throw new Error(
            'Wallet not found during refund',
          );
        }

        const balanceBefore =
          parseFloat(wallet.balance);

        const restored =
          (
            balanceBefore +
            opts.amount
          ).toFixed(2);

        await tx.execute(sql`
          UPDATE wallets
          SET
            balance = ${restored},
            updated_at = NOW()
          WHERE id = ${wallet.id}::uuid
        `);

        await tx.execute(sql`
          UPDATE transactions
          SET
            status = 'failed',
            updated_at = NOW(),
            metadata = metadata ||
              jsonb_build_object(
                'refunded', true,
                'refundedAt', NOW()::text
              )
          WHERE id = ${opts.txnId}::uuid
        `);

        await tx.execute(sql`
          INSERT INTO transactions
            (
              user_id,
              type,
              service,
              provider,
              amount,
              status,
              reference,
              description,
              metadata
            )
          VALUES
            (
              ${opts.userId}::uuid,
              'refund',
              'Data',
              'GY-DATA',
              ${opts.amount.toFixed(2)},
              'success',
              ${opts.requestId + '-reversal'},
              'Vendor delivery failed — automatic wallet refund',
              jsonb_build_object(
                'originalTxnId', ${opts.txnId},
                'amount', ${opts.amount},
                'balanceBefore', ${balanceBefore},
                'balanceAfter', ${restored}
              )
            )
          ON CONFLICT (reference) DO NOTHING
        `);

        return {
          newBalance: restored,
        };
      },
    );

  return newBalance.newBalance;
}

/* ─────────────────────────────────────────────────────────────
   PUBLIC PRICING
───────────────────────────────────────────────────────────── */

router.get(
  '/pricing',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {

    const service =
      String(
        req.query['service'] ??
          'data',
      )
        .trim()
        .toLowerCase();

    try {

      const result =
        await db.execute(sql`
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
          WHERE service_type = ${service}
            AND enabled = true
          ORDER BY
            network,
            plan_name
        `);

      res.json({
        success: true,
        pricing: result.rows,
      });

    } catch (err) {

      logger.error(
        { err },
        'GET /purchase/pricing failed',
      );

      res.status(500).json({
        error:
          'Failed to load pricing.',
      });
    }
  },
);

router.use(requireAuth);

/* ─────────────────────────────────────────────────────────────
   DATA PRICE VALIDATION
───────────────────────────────────────────────────────────── */

async function validateDataPrice(
  planCode: string,
  network: string,
  submittedPrice: number,
  planName?: string,
): Promise<
  | {
      valid: true;
      sellingPrice: number;
      costPrice: number;
    }
  | {
      valid: false;
      error: string;
      expectedPrice?: number;
    }
> {

  try {

    /*
     * SMEDATA plans are maintained manually.
     *
     * pricing_rules.plan_id MUST match the SMEDATA
     * DataPlan/size code used by the application.
     *
     * Example:
     *
     *   planCode = 1gb1w
     *
     * The Super Admin pricing rule should contain:
     *
     *   provider = SMEDATA
     *   network  = mtn
     *   plan_id  = 1gb1w
     *
     * The frontend price is never trusted.
     */

    const normalizedNetwork =
      network
        .trim()
        .toLowerCase();

    const normalizedPlanCode =
      planCode.trim();

    const priceResult =
      await db.execute<{
        id: string;
        selling_price: string;
        cost_price: string;
        enabled: boolean;
        provider: string;
        network: string;
        plan_id: string;
        plan_name: string;
      }>(sql`
        SELECT
          id,
          selling_price,
          cost_price,
          enabled,
          provider,
          network,
          plan_id,
          plan_name
        FROM pricing_rules
        WHERE service_type = 'data'
          AND enabled = true
          AND (
            LOWER(TRIM(network)) = ${normalizedNetwork}
            OR LOWER(TRIM(provider)) = ${normalizedNetwork}
            OR LOWER(TRIM(provider)) = 'smedata'
          )
          AND (
            TRIM(plan_id) = TRIM(${normalizedPlanCode})
            OR (
              ${planName ?? ''} <> ''
              AND LOWER(TRIM(plan_name)) =
                  LOWER(TRIM(${planName ?? ''}))
            )
          )
        ORDER BY
          CASE
            WHEN TRIM(plan_id) =
                 TRIM(${normalizedPlanCode})
              THEN 0
            WHEN LOWER(TRIM(plan_name)) =
                 LOWER(TRIM(${planName ?? ''}))
              THEN 1
            ELSE 2
          END
        LIMIT 1
      `);

    const rule =
      priceResult.rows[0];

    logger.info(
      {
        planCode,
        planName,
        network,
        normalizedNetwork,
        submittedPrice,
        matchedRuleId:
          rule?.id ?? null,
        matchedPlanId:
          rule?.plan_id ?? null,
        matchedPlanName:
          rule?.plan_name ?? null,
        matchedProvider:
          rule?.provider ?? null,
        matchedNetwork:
          rule?.network ?? null,
        matchedSellingPrice:
          rule?.selling_price ?? null,
        matchedEnabled:
          rule?.enabled ?? null,
      },
      'SMEDATA data pricing validation',
    );

    if (!rule) {

      logger.warn(
        {
          planCode,
          planName,
          network,
          normalizedNetwork,
        },
        'No matching Super Admin pricing rule found — blocking purchase',
      );

      return {
        valid: false,
        error:
          'This data plan is not currently configured. Please contact support.',
      };
    }

    if (!rule.enabled) {

      return {
        valid: false,
        error:
          'This data plan is currently unavailable.',
      };
    }

    const sellingPrice =
      Number(rule.selling_price);

    const costPrice =
      Number(rule.cost_price);

    if (
      !Number.isFinite(
        sellingPrice,
      )
    ) {

      logger.error(
        {
          planCode,
          planName,
          network,
          ruleId: rule.id,
          sellingPrice:
            rule.selling_price,
        },
        'Invalid selling price in Super Admin pricing rule',
      );

      return {
        valid: false,
        error:
          'This data plan has an invalid selling price configuration.',
      };
    }

    if (
      !Number.isFinite(
        costPrice,
      )
    ) {

      logger.error(
        {
          planCode,
          planName,
          network,
          ruleId: rule.id,
          costPrice:
            rule.cost_price,
        },
        'Invalid cost price in Super Admin pricing rule',
      );

      return {
        valid: false,
        error:
          'This data plan has an invalid cost price configuration.',
      };
    }

    /*
     * Do not trust the frontend price.
     * It must match the Super Admin selling price.
     */
    if (
      Math.abs(
        sellingPrice -
          submittedPrice,
      ) > 1
    ) {

      return {
        valid: false,
        error:
          'price_mismatch',
        expectedPrice:
          sellingPrice,
      };
    }

    return {
      valid: true,
      sellingPrice,
      costPrice,
    };

  } catch (err) {

    logger.error(
      {
        err,
        planCode,
        planName,
        network,
      },
      'Price validation DB lookup failed — blocking purchase',
    );

    return {
      valid: false,
      error:
        'Price verification is temporarily unavailable. Please try again.',
    };
  }
}

/* ─────────────────────────────────────────────────────────────
   AIRTIME PURCHASE
───────────────────────────────────────────────────────────── */

router.post(
  '/airtime',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {

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
        error:
          'network, phone, and amount are required.',
      });

      return;
    }

    const numericAmount =
      Number(amount);

    if (
      !Number.isFinite(
        numericAmount,
      ) ||
      numericAmount < 50
    ) {
      res.status(400).json({
        error:
          'Minimum airtime amount is ₦50.',
      });

      return;
    }

    if (
      numericAmount > 50_000
    ) {
      res.status(400).json({
        error:
          'Maximum single airtime purchase is ₦50,000.',
      });

      return;
    }

    const cleanPhone =
      phone.replace(/\D/g, '');

    if (
      cleanPhone.length < 10 ||
      cleanPhone.length > 11
    ) {
      res.status(400).json({
        error:
          'Please enter a valid Nigerian phone number.',
      });

      return;
    }

    try {

      ck.getNetworkCode(
        network,
      );

    } catch {

      res.status(400).json({
        error:
          'Invalid network. Use: mtn, glo, airtel, or 9mobile.',
      });

      return;
    }

    const userId =
      req.session.userId!;

    const idempotencyKey =
      (
        req.headers[
          'idempotency-key'
        ] ?? ''
      ) as string;

    if (idempotencyKey) {

      try {

        const handled =
          await handleIdempotency(
            res,
            userId,
            idempotencyKey,
            {
              network,
              phone: cleanPhone,
              amount:
                numericAmount,
            },
          );

        if (handled) return;

      } catch (err) {

        logger.error(
          {
            err,
            idempotencyKey,
          },
          'Idempotency check failed — proceeding',
        );
      }
    }

    const requestId =
      idempotencyKey ||
      `GY-AIR-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`;

    let txnId: string;
    let newBalance: string;

    try {

      const result =
        await db.transaction(
          async (tx) =>
            debitWalletAndRecord(
              tx,
              {
                userId,
                amount:
                  numericAmount,
                requestId,
                type: 'airtime',
                service: 'Airtime',
                provider:
                  network.toUpperCase(),
                description:
                  `${network.toUpperCase()} Airtime → ${cleanPhone}`,
                costPrice:
                  numericAmount,
              },
            ),
        );

      txnId =
        result.txnId;

      newBalance =
        result.newBalance;

    } catch (err: unknown) {

      const e =
        err as {
          code?: string;
        };

      if (
        e.code ===
        'NOT_FOUND'
      ) {

        res.status(404).json({
          error:
            'Wallet not found.',
        });

        return;
      }

      if (
        e.code ===
        'INSUFFICIENT_FUNDS'
      ) {

        res.status(402).json({
          error:
            'insufficient_funds',
        });

        return;
      }

      logger.error(
        { err },
        'purchase/airtime debit failed',
      );

      res.status(500).json({
        error:
          'Failed to process purchase.',
      });

      return;
    }

    let vendorResult:
      ck.CKPurchaseResult = {
        status:
          'unsuccessful',
      };

    try {

      vendorResult =
        await ck.purchaseAirtime({
          network,
          phone:
            cleanPhone,
          amount:
            numericAmount,
          requestId,
        });

    } catch (err: unknown) {

      logger.error(
        {
          err,
          requestId,
        },
        'ClubKonnect airtime call threw exception',
      );
    }

    const normalizedStatus =
      normalizeCKStatus(
        vendorResult.status,
      );

    const providerRef =
      vendorResult.OrderID ??
      vendorResult.ident ??
      null;

    if (
      normalizedStatus ===
      'success'
    ) {

      await db.execute(sql`
        UPDATE transactions
        SET
          status = 'success',
          updated_at = NOW(),
          provider_reference = ${providerRef},
          metadata = jsonb_build_object(
            'vendorStatus', ${vendorResult.status},
            'providerRef', ${providerRef},
            'amount', ${numericAmount},
            'completedAt', NOW()::text
          )
        WHERE id = ${txnId}::uuid
      `);

      try {

        getIo()
          .to(`user:${userId}`)
          .emit(
            'wallet:updated',
            {
              balance:
                newBalance,
            },
          );

      } catch {
        // non-fatal
      }

      await createNotification(
        userId,
        {
          type:
            'transaction',
          title:
            'Airtime Purchase Successful ✅',
          body:
            `${network.toUpperCase()} airtime of ₦${numericAmount.toLocaleString('en-NG')} has been sent to ${cleanPhone}.`,
          refId:
            txnId,
        },
      );

      res.json({
        success: true,
        requestId,
        balance:
          newBalance,
        txnId,
        network,
        phone:
          cleanPhone,
        amount:
          numericAmount,
        providerRef,
        vendorStatus:
          vendorResult.status,
      });

      return;
    }

    if (
      normalizedStatus ===
      'pending'
    ) {

      await db.execute(sql`
        UPDATE transactions
        SET
          provider_reference = ${providerRef},
          updated_at = NOW(),
          metadata = jsonb_build_object(
            'vendorStatus', ${vendorResult.status},
            'providerRef', ${providerRef},
            'pendingMarkedAt', NOW()::text,
            'requiresPolling', true
          )
        WHERE id = ${txnId}::uuid
      `);

      res.json({
        success: false,
        pending: true,
        requestId,
        txnId,
        balance:
          newBalance,
        providerRef,
        vendorStatus:
          vendorResult.status,
        message:
          'Your airtime purchase is being processed. Your wallet will be refunded automatically if delivery fails.',
      });

      return;
    }

    try {

      newBalance =
        await refundWalletAndMarkFailed({
          userId,
          txnId,
          amount:
            numericAmount,
          requestId,
        });

    } catch (refundErr) {

      logger.error(
        {
          refundErr,
          txnId,
          requestId,
        },
        'CRITICAL: airtime refund failed — manual intervention required',
      );
    }

    await createNotification(
      userId,
      {
        type:
          'transaction',
        title:
          'Airtime Purchase Failed',
        body:
          `Airtime could not be delivered to ${cleanPhone}. Your wallet has been refunded.`,
        refId:
          txnId,
      },
    );

    res.status(422).json({
      success: false,
      requestId,
      balance:
        newBalance,
      txnId,
      vendorStatus:
        vendorResult.status,
      error:
        `Vendor returned: ${vendorResult.status || 'failed'}`,
    });
  },
);

/* ─────────────────────────────────────────────────────────────
   DATA PURCHASE — SMEDATA
───────────────────────────────────────────────────────────── */

router.post(
  '/data',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {

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
      planPrice?: string;
    };

    if (
      !network ||
      !phone ||
      !planCode ||
      !planPrice
    ) {
      res.status(400).json({
        error:
          'network, phone, planCode, and planPrice are required.',
      });

      return;
    }

    const numericAmount =
      parseFloat(planPrice);

    if (
      !Number.isFinite(
        numericAmount,
      ) ||
      numericAmount <= 0
    ) {
      res.status(400).json({
        error:
          'planPrice must be a positive number.',
      });

      return;
    }

    /*
     * DATA IS NOW HANDLED BY SMEDATA.
     *
     * SMEDATA supports:
     *   mtn
     *   glo
     *   airtel
     *
     * 9mobile remains unavailable for DATA.
     */
    if (
      !smedata.isSmeDataNetwork(
        network,
      )
    ) {

      res.status(400).json({
        error:
          'Invalid data network for SMEDATA. Use: mtn, glo, or airtel.',
      });

      return;
    }

    const cleanPhone =
      phone.replace(/\D/g, '');

    if (
      cleanPhone.length < 10 ||
      cleanPhone.length > 11
    ) {

      res.status(400).json({
        error:
          'Please enter a valid Nigerian phone number.',
      });

      return;
    }

    const userId =
      req.session.userId!;

    const idempotencyKey =
      (
        req.headers[
          'idempotency-key'
        ] ?? ''
      ) as string;

    /*
     * The frontend price is never trusted.
     *
     * The Super Admin pricing_rules table decides:
     *
     *   - cost_price
     *   - selling_price
     *   - enabled
     *
     * planCode MUST match pricing_rules.plan_id.
     */

    const priceCheck =
      await validateDataPrice(
        planCode,
        network,
        numericAmount,
        planName,
      );

    if (
      !priceCheck.valid
    ) {

      if (
        priceCheck.error ===
        'price_mismatch'
      ) {

        res.status(409).json({
          error:
            'price_mismatch',
          message:
            `Plan price has changed. Expected ₦${priceCheck.expectedPrice?.toLocaleString('en-NG')}.`,
          expectedPrice:
            priceCheck.expectedPrice,
        });

      } else {

        res.status(400).json({
          error:
            priceCheck.error,
        });
      }

      return;
    }

    const confirmedAmount =
      priceCheck.sellingPrice;

    const costPrice =
      priceCheck.costPrice;

    const profit =
      confirmedAmount -
      costPrice;

    if (idempotencyKey) {

      try {

        const handled =
          await handleIdempotency(
            res,
            userId,
            idempotencyKey,
            {
              network,
              phone:
                cleanPhone,
              amount:
                confirmedAmount,
              planName:
                planName ??
                planCode,
            },
          );

        if (handled) return;

      } catch (err) {

        logger.error(
          {
            err,
            idempotencyKey,
          },
          'Idempotency check failed — proceeding',
        );
      }
    }

    const requestId =
      idempotencyKey ||
      `GY-DAT-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`;

    let txnId: string;
    let newBalance: string;

    try {

      const result =
        await db.transaction(
          async (tx) =>
            debitWalletAndRecord(
              tx,
              {
                userId,
                amount:
                  confirmedAmount,
                requestId,
                type: 'data',
                service: 'Data',
                provider:
                  'SMEDATA',
                description:
                  `${network.toUpperCase()} ${planName ?? planCode} → ${cleanPhone}`,
                costPrice,
              },
            ),
        );

      txnId =
        result.txnId;

      newBalance =
        result.newBalance;

    } catch (err: unknown) {

      const e =
        err as {
          code?: string;
        };

      if (
        e.code ===
        'NOT_FOUND'
      ) {

        res.status(404).json({
          error:
            'Wallet not found.',
        });

        return;
      }

      if (
        e.code ===
        'INSUFFICIENT_FUNDS'
      ) {

        res.status(402).json({
          error:
            'insufficient_funds',
        });

        return;
      }

      logger.error(
        { err },
        'purchase/data debit failed',
      );

      res.status(500).json({
        error:
          'Failed to process purchase.',
      });

      return;
    }

    /* ─────────────────────────────────────────────────────────
       SMEDATA PURCHASE
    ───────────────────────────────────────────────────────── */

    let vendorResult:
      smedata.SmePurchaseResult = {
        code:
          'failure',
        message:
          'SMEDATA purchase was not attempted.',
      };

    try {

      vendorResult =
        await smedata.purchaseData({
          network,
          phone:
            cleanPhone,
          planCode,
          requestId,
        });

    } catch (err: unknown) {

      logger.error(
        {
          err,
          requestId,
          planCode,
          network,
        },
        'SMEDATA data call threw exception',
      );
    }

    const normalizedStatus =
      smedata.normalizeSMEStatus(
        vendorResult.code,
      );

    const providerRef =
      smedata.getSMEProviderRef(
        vendorResult,
      );

    const resolvedPlanName =
      vendorResult.data?.product ??
      vendorResult.data?.data_plan ??
      planName ??
      planCode;

    logger.info(
      {
        userId,
        requestId,
        normalizedStatus,
        vendorCode:
          vendorResult.code,
        vendorMessage:
          vendorResult.message,
        providerRef,
        planCode,
        planName:
          resolvedPlanName,
        network,
        sellingPrice:
          confirmedAmount,
        costPrice,
        profit,
      },
      'SMEDATA vendor response',
    );

    /* ─────────────────────────────────────────────────────────
       SUCCESS
    ───────────────────────────────────────────────────────── */

    if (
      normalizedStatus ===
      'success'
    ) {

      await db.execute(sql`
        UPDATE transactions
        SET
          status = 'success',
          updated_at = NOW(),
          description =
            ${`${network.toUpperCase()} ${resolvedPlanName}`},
          provider_reference = ${providerRef},
          metadata = jsonb_build_object(
            'provider', 'SMEDATA',
            'vendorCode', ${vendorResult.code},
            'vendorMessage', ${vendorResult.message},
            'providerRef', ${providerRef},
            'planCode', ${planCode},
            'planName', ${resolvedPlanName},
            'costPrice', ${costPrice},
            'sellingPrice', ${confirmedAmount},
            'profit', ${profit},
            'completedAt', NOW()::text
          )
        WHERE id = ${txnId}::uuid
      `);

      try {

        getIo()
          .to(`user:${userId}`)
          .emit(
            'wallet:updated',
            {
              balance:
                newBalance,
            },
          );

      } catch {
        // non-fatal
      }

      await createNotification(
        userId,
        {
          type:
            'transaction',
          title:
            'Data Purchase Successful ✅',
          body:
            `${resolvedPlanName} has been delivered to ${cleanPhone}.`,
          refId:
            txnId,
        },
      );

      let cashbackApplied =
        false;

      let cashbackAmount =
        0;

      try {

        const cb =
          await applyCashbackIfEligible({
            userId,
            sourceTxnId:
              txnId,
            requestId,
            planCode,
            network,
            planName:
              resolvedPlanName,
            purchaseAmount:
              confirmedAmount,
          });

        if (cb.applied) {
          cashbackApplied =
            true;

          cashbackAmount =
            cb.amount;
        }

      } catch (cbErr) {

        logger.error(
          {
            cbErr,
            txnId,
          },
          'Cashback application failed — non-fatal',
        );
      }

      res.json({
        success: true,
        requestId,
        balance:
          newBalance,
        txnId,
        network,
        phone:
          cleanPhone,
        amount:
          confirmedAmount,
        planCode,
        planName:
          resolvedPlanName,
        provider:
          'SMEDATA',
        providerRef,
        vendorCode:
          vendorResult.code,
        vendorMessage:
          vendorResult.message,
        cashbackApplied,
        cashbackAmount:
          cashbackApplied
            ? cashbackAmount
            : undefined,
      });

      return;
    }

    /* ─────────────────────────────────────────────────────────
       PENDING
    ───────────────────────────────────────────────────────── */

    if (
      normalizedStatus ===
      'pending'
    ) {

      await db.execute(sql`
        UPDATE transactions
        SET
          provider_reference = ${providerRef},
          updated_at = NOW(),
          metadata = jsonb_build_object(
            'provider', 'SMEDATA',
            'vendorCode', ${vendorResult.code},
            'vendorMessage', ${vendorResult.message},
            'providerRef', ${providerRef},
            'planCode', ${planCode},
            'planName', ${resolvedPlanName},
            'costPrice', ${costPrice},
            'sellingPrice', ${confirmedAmount},
            'pendingMarkedAt', NOW()::text,
            'requiresPolling', true
          )
        WHERE id = ${txnId}::uuid
      `);

      logger.info(
        {
          userId,
          requestId,
          planCode,
          providerRef,
        },
        'SMEDATA data purchase pending — awaiting vendor confirmation',
      );

      res.json({
        success: false,
        pending: true,
        requestId,
        txnId,
        balance:
          newBalance,
        planCode,
        planName:
          resolvedPlanName,
        provider:
          'SMEDATA',
        providerRef,
        vendorCode:
          vendorResult.code,
        vendorMessage:
          vendorResult.message,
        message:
          'Your data purchase is being processed. Your wallet will be refunded automatically if delivery fails.',
      });

      return;
    }

    /* ─────────────────────────────────────────────────────────
       FAILURE — REFUND
    ───────────────────────────────────────────────────────── */

    try {

      newBalance =
        await refundWalletAndMarkFailed({
          userId,
          txnId,
          amount:
            confirmedAmount,
          requestId,
        });

    } catch (refundErr) {

      logger.error(
        {
          refundErr,
          txnId,
          requestId,
        },
        'CRITICAL: data refund failed — manual intervention required',
      );
    }

    logger.warn(
      {
        userId,
        requestId,
        planCode,
        vendorCode:
          vendorResult.code,
        vendorMessage:
          vendorResult.message,
      },
      'SMEDATA data purchase failed — wallet reversed',
    );

    await createNotification(
      userId,
      {
        type:
          'transaction',
        title:
          'Data Purchase Failed',
        body:
          `${resolvedPlanName} could not be delivered to ${cleanPhone}. Your wallet has been refunded.`,
        refId:
          txnId,
      },
    );

    res.status(422).json({
      success: false,
      requestId,
      balance:
        newBalance,
      txnId,
      provider:
        'SMEDATA',
      vendorCode:
        vendorResult.code,
      vendorMessage:
        vendorResult.message,
      error:
        `SMEDATA returned: ${vendorResult.code || 'failed'}`,
    });
  },
);

/* ─────────────────────────────────────────────────────────────
   PURCHASE STATUS
───────────────────────────────────────────────────────────── */

router.get(
  '/status/:requestId',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {

    const {
      requestId,
    } = req.params as {
      requestId: string;
    };

    const userId =
      req.session.userId!;

    const [txn] =
      await db
        .select()
        .from(
          transactionsTable,
        )
        .where(
          and(
            eq(
              transactionsTable.reference,
              requestId,
            ),
            eq(
              transactionsTable.userId,
              userId,
            ),
          ),
        );

    if (!txn) {

      res.status(404).json({
        error:
          'Transaction not found.',
      });

      return;
    }

    const [wallet] =
      await db
        .select()
        .from(
          walletsTable,
        )
        .where(
          eq(
            walletsTable.userId,
            userId,
          ),
        );

    res.json({
      status:
        txn.status,
      requestId,
      txnId:
        txn.id,
      type:
        txn.type,
      amount:
        txn.amount,
      description:
        txn.description,
      providerRef:
        (
          txn as unknown as {
            provider_reference?:
              string;
          }
        ).provider_reference ??
        null,
      balance:
        wallet?.balance ??
        '0',
      createdAt:
        txn.createdAt,
    });
  },
);

export default router;
