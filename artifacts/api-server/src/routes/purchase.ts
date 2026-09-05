/**
 * COMPLETE purchase.ts
 *
 * Data provider: SME API
 * Airtime provider: SME API
 */

import { Router, type Request, type Response } from 'express';
import { eq, and } from 'drizzle-orm';
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

/* ============================================================
   HELPERS
   ============================================================ */

function makeReference(prefix = 'GY'): string {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

function normalizeSMEResult(result: {
  success: boolean;
  message?: string;
}): 'success' | 'pending' | 'failure' {
  if (result.success === true) return 'success';

  const message = String(result.message || '').toLowerCase();

  if (
    message.includes('pending') ||
    message.includes('processing') ||
    message.includes('queued') ||
    message.includes('initiated')
  ) {
    return 'pending';
  }

  return 'failure';
}

function cleanPhoneNumber(phone: unknown): string {
  return String(phone || '')
    .replace(/\s+/g, '')
    .replace(/^\+234/, '0')
    .replace(/^234/, '0');
}

function parseAmount(value: unknown): number {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Invalid transaction amount.');
  }

  return amount;
}

function emitTransactionUpdate(
  userId: string,
  payload: Record<string, unknown>,
): void {
  try {
    const io = getIo();
    io.to(`user:${userId}`).emit(
      'transaction:update',
      payload,
    );
  } catch (error) {
    logger.warn(
      { error, userId },
      'Unable to emit transaction socket update',
    );
  }
}

/* ============================================================
   CASHBACK
   ============================================================ */

async function applyCashbackIfEligible(opts: {
  userId: string;
  sourceTxnId: string;
  requestId: string;
  planCode: string;
  network: string;
  planName: string;
  purchaseAmount: number;
}): Promise<{
  applied: boolean;
  amount: number;
  cashbackBalance: string;
}> {
  const globalResult = await db.execute<{
    enabled: boolean;
    eligible_services: string[] | string;
    transfer_mode: string;
    min_transfer_amount: string;
  }>(sql`
    SELECT
      enabled,
      eligible_services,
      transfer_mode,
      min_transfer_amount
    FROM cashback_settings
    LIMIT 1
  `);

  const globalRow = globalResult.rows[0];

  if (!globalRow || !globalRow.enabled) {
    return {
      applied: false,
      amount: 0,
      cashbackBalance: '',
    };
  }

  let eligibleServices: string[] = ['data'];

  try {
    const raw = globalRow.eligible_services;

    eligibleServices = Array.isArray(raw)
      ? raw
      : JSON.parse(
          typeof raw === 'string'
            ? raw
            : '["data"]',
        );
  } catch {
    eligibleServices = ['data'];
  }

  if (!eligibleServices.includes('data')) {
    return {
      applied: false,
      amount: 0,
      cashbackBalance: '',
    };
  }

  const planResult = await db.execute<{
    cashback_enabled: boolean;
    cashback_type: string;
    cashback_value: string;
  }>(sql`
    SELECT
      cashback_enabled,
      cashback_type,
      cashback_value
    FROM pricing_rules
    WHERE service_type = 'data'
      AND enabled = true
      AND (
        LOWER(TRIM(network)) =
          LOWER(TRIM(${opts.network}))
        OR LOWER(TRIM(provider)) =
          LOWER(TRIM(${opts.network}))
        OR LOWER(TRIM(provider)) = 'smedata'
      )
      AND (
        TRIM(plan_id) =
          TRIM(${opts.planCode})
        OR LOWER(TRIM(plan_name)) =
          LOWER(TRIM(${opts.planName}))
      )
    ORDER BY
      CASE
        WHEN TRIM(plan_id) =
          TRIM(${opts.planCode})
        THEN 0
        ELSE 1
      END
    LIMIT 1
  `);

  const rule = planResult.rows[0];

  if (!rule || !rule.cashback_enabled) {
    return {
      applied: false,
      amount: 0,
      cashbackBalance: '',
    };
  }

  const purchaseAmount = opts.purchaseAmount;

  const cashbackValue = Number(
    rule.cashback_value,
  );

  if (
    !Number.isFinite(cashbackValue) ||
    cashbackValue <= 0
  ) {
    return {
      applied: false,
      amount: 0,
      cashbackBalance: '',
    };
  }

  let cashbackAmount = 0;

  if (
    String(rule.cashback_type).toLowerCase() ===
    'percentage'
  ) {
    cashbackAmount =
      purchaseAmount *
      (cashbackValue / 100);
  } else {
    cashbackAmount = cashbackValue;
  }

  cashbackAmount =
    Math.round(cashbackAmount * 100) / 100;

  if (cashbackAmount <= 0) {
    return {
      applied: false,
      amount: 0,
      cashbackBalance: '',
    };
  }

  const minTransfer = Number(
    globalRow.min_transfer_amount || 0,
  );

  if (
    minTransfer > 0 &&
    cashbackAmount < minTransfer
  ) {
    return {
      applied: false,
      amount: 0,
      cashbackBalance: '',
    };
  }

  const existing = await db.execute<{
    id: string;
  }>(sql`
    SELECT id
    FROM cashback_transactions
    WHERE source_transaction_id =
      ${opts.sourceTxnId}
    LIMIT 1
  `);

  if (existing.rows.length > 0) {
    const balanceResult =
      await db.execute<{
        cashback_balance: string;
      }>(sql`
        SELECT cashback_balance
        FROM wallets
        WHERE user_id = ${opts.userId}
        LIMIT 1
      `);

    return {
      applied: false,
      amount: 0,
      cashbackBalance:
        balanceResult.rows[0]?.cashback_balance || '0',
    };
  }

  let cashbackBalance = '0';

  await db.transaction(async (tx) => {
    const walletRows = await tx.execute<{
      cashback_balance: string;
    }>(sql`
      SELECT cashback_balance
      FROM wallets
      WHERE user_id = ${opts.userId}
      FOR UPDATE
    `);

    const current =
      Number(
        walletRows.rows[0]?.cashback_balance || 0,
      );

    const next =
      Math.round(
        (current + cashbackAmount) * 100,
      ) / 100;

    cashbackBalance = next.toFixed(2);

    await tx.execute(sql`
      UPDATE wallets
      SET
        cashback_balance =
          ${cashbackBalance},
        updated_at = NOW()
      WHERE user_id = ${opts.userId}
    `);

    await tx.execute(sql`
      INSERT INTO cashback_transactions (
        user_id,
        source_transaction_id,
        reference,
        amount,
        type,
        description,
        created_at
      )
      VALUES (
        ${opts.userId},
        ${opts.sourceTxnId},
        ${opts.requestId},
        ${cashbackAmount.toFixed(2)},
        'earned',
        ${`Cashback for ${opts.planName}`},
        NOW()
      )
    `);
  });

  await createNotification(opts.userId, {
    type: 'cashback',
    title: 'Cashback Earned',
    body:
      `You earned ₦${cashbackAmount.toFixed(2)} ` +
      `cashback from your ${opts.planName} ` +
      `purchase.`,
    refId: opts.sourceTxnId,
  });

  return {
    applied: true,
    amount: cashbackAmount,
    cashbackBalance,
  };
}

/* ============================================================
   WALLET DEBIT
   ============================================================ */

async function debitWalletAndCreateTransaction(opts: {
  userId: string;
  amount: number;
  reference: string;
  type: string;
  description: string;
  metadata?: Record<string, unknown>;
}): Promise<{
  txnId: string;
  newBalance: string;
}> {
  let txnId = '';
  let newBalance = '0';

  await db.transaction(async (tx) => {
    const walletRows = await tx
      .select()
      .from(walletsTable)
      .where(
        eq(
          walletsTable.userId,
          opts.userId,
        ),
      )
      .for('update');

    const wallet = walletRows[0];

    if (!wallet) {
      throw new Error('Wallet not found.');
    }

    const balance = Number(wallet.balance);
    const amount = Number(opts.amount);

    if (
      !Number.isFinite(balance) ||
      balance < amount
    ) {
      throw new Error(
        'Insufficient wallet balance.',
      );
    }

    const nextBalance =
      Math.round(
        (balance - amount) * 100,
      ) / 100;

    const inserted = await tx
      .insert(transactionsTable)
      .values({
        userId: opts.userId,
        type: opts.type,
        amount: amount.toFixed(2),
        reference: opts.reference,
        status: 'pending',
        description: opts.description,
        metadata:
          opts.metadata || {},
      })
      .returning({
        id: transactionsTable.id,
      });

    txnId = inserted[0]?.id || '';

    if (!txnId) {
      throw new Error(
        'Unable to create transaction.',
      );
    }

    await tx
      .update(walletsTable)
      .set({
        balance: nextBalance.toFixed(2),
        updatedAt: new Date(),
      })
      .where(
        eq(
          walletsTable.userId,
          opts.userId,
        ),
      );

    newBalance = nextBalance.toFixed(2);
  });

  return {
    txnId,
    newBalance,
  };
}

/* ============================================================
   REFUND
   ============================================================ */

async function refundWalletAndMarkFailed(opts: {
  userId: string;
  txnId: string;
  amount: number;
  requestId: string;
}): Promise<string> {
  let newBalance = '0';

  await db.transaction(async (tx) => {
    const walletRows = await tx
      .select()
      .from(walletsTable)
      .where(
        eq(
          walletsTable.userId,
          opts.userId,
        ),
      )
      .for('update');

    const wallet = walletRows[0];

    if (!wallet) {
      throw new Error('Wallet not found.');
    }

    const currentBalance =
      Number(wallet.balance);

    const refundAmount =
      Number(opts.amount);

    const balance =
      Math.round(
        (currentBalance + refundAmount) *
          100,
      ) / 100;

    await tx
      .update(walletsTable)
      .set({
        balance: balance.toFixed(2),
        updatedAt: new Date(),
      })
      .where(
        eq(
          walletsTable.userId,
          opts.userId,
        ),
      );

    await tx
      .update(transactionsTable)
      .set({
        status: 'failed',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(
            transactionsTable.id,
            opts.txnId,
          ),
          eq(
            transactionsTable.userId,
            opts.userId,
          ),
        ),
      );

    newBalance = balance.toFixed(2);
  });

  emitTransactionUpdate(
    opts.userId,
    {
      requestId: opts.requestId,
      txnId: opts.txnId,
      status: 'failed',
      balance: newBalance,
      refunded: true,
    },
  );

  return newBalance;
}

/* ============================================================
   COMPLETE TRANSACTION
   ============================================================ */

async function markTransactionSuccess(opts: {
  userId: string;
  txnId: string;
  providerRef?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  await db.execute(sql`
    UPDATE transactions
    SET
      status = 'success',
      provider_reference =
        ${opts.providerRef || null},
      metadata =
        ${JSON.stringify(opts.metadata || {})}::jsonb,
      updated_at = NOW()
    WHERE id = ${opts.txnId}::uuid
  `);

  emitTransactionUpdate(
    opts.userId,
    {
      txnId: opts.txnId,
      status: 'success',
      providerRef:
        opts.providerRef || null,
    },
  );
}

/* ============================================================
   DATA PURCHASE
   ============================================================ */

router.post(
  '/data',
  requireAuth,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId = req.session.userId!;

    try {
      const {
        network,
        phone,
        dataPlan,
        planCode,
        amount,
        price,
        planName,
        reference,
      } = req.body as {
        network?: string;
        phone?: string;
        dataPlan?: string;
        planCode?: string;
        amount?: number | string;
        price?: number | string;
        planName?: string;
        reference?: string;
      };

      const cleanPhone =
        cleanPhoneNumber(phone);

      if (!network) {
        res.status(400).json({
          success: false,
          error: 'Network is required.',
        });
        return;
      }

      if (!cleanPhone) {
        res.status(400).json({
          success: false,
          error: 'Phone number is required.',
        });
        return;
      }

      if (!/^0\d{10}$/.test(cleanPhone)) {
        res.status(400).json({
          success: false,
          error:
            'Enter a valid Nigerian phone number.',
        });
        return;
      }

      const selectedPlan =
        String(
          dataPlan ??
            planCode ??
            '',
        ).trim();

      if (!selectedPlan) {
        res.status(400).json({
          success: false,
          error: 'Data plan is required.',
        });
        return;
      }

      const suppliedAmount =
        amount ?? price;

      const requestedAmount =
        parseAmount(suppliedAmount);

      const requestId =
        String(reference || '').trim() ||
        makeReference('DATA');

      logger.info(
        {
          userId,
          network,
          phone: cleanPhone,
          dataPlan: selectedPlan,
          amount: requestedAmount,
          requestId,
        },
        'SME data purchase initiated',
      );

      /*
       * Resolve the price from our own pricing table.
       * The client supplied amount is never trusted.
       */
      const pricingResult =
        await db.execute<{
          plan_id: string;
          plan_name: string;
          network: string;
          selling_price: string;
          cost_price: string;
          enabled: boolean;
        }>(sql`
          SELECT
            plan_id,
            plan_name,
            network,
            selling_price,
            cost_price,
            enabled
          FROM pricing_rules
          WHERE service_type = 'data'
            AND enabled = true
            AND (
              TRIM(plan_id) =
                TRIM(${selectedPlan})
              OR LOWER(TRIM(plan_name)) =
                LOWER(TRIM(${String(
                  planName || '',
                )}))
            )
            AND (
              LOWER(TRIM(network)) =
                LOWER(TRIM(${String(network)}))
              OR LOWER(TRIM(provider)) =
                LOWER(TRIM(${String(network)}))
              OR LOWER(TRIM(provider)) =
                'smedata'
            )
          ORDER BY
            CASE
              WHEN TRIM(plan_id) =
                TRIM(${selectedPlan})
              THEN 0
              ELSE 1
            END
          LIMIT 1
        `);

      const pricing =
        pricingResult.rows[0];

      const confirmedAmount = pricing
        ? Number(pricing.selling_price)
        : requestedAmount;

      if (
        !Number.isFinite(confirmedAmount) ||
        confirmedAmount <= 0
      ) {
        res.status(400).json({
          success: false,
          error:
            'Unable to determine data plan price.',
        });
        return;
      }

      if (
        pricing &&
        Math.abs(
          requestedAmount -
            confirmedAmount,
        ) > 0.01
      ) {
        res.status(409).json({
          success: false,
          error:
            'The selected plan price has changed. Please refresh and try again.',
          expectedAmount:
            confirmedAmount,
        });
        return;
      }

      const resolvedPlanName =
        pricing?.plan_name ||
        String(planName || selectedPlan);

      const costPrice = pricing
        ? Number(pricing.cost_price)
        : confirmedAmount;

      const debit =
        await debitWalletAndCreateTransaction({
          userId,
          amount: confirmedAmount,
          reference: requestId,
          type: 'data',
          description:
            `Data purchase: ${resolvedPlanName} ` +
            `to ${cleanPhone}`,
          metadata: {
            provider: 'smeapi',
            network,
            planCode: selectedPlan,
            planName: resolvedPlanName,
            costPrice,
            sellingPrice: confirmedAmount,
          },
        });

      const {
        txnId,
        newBalance,
      } = debit;

      await createNotification(userId, {
        type: 'transaction',
        title: 'Data Purchase Processing',
        body:
          `${resolvedPlanName} is being sent ` +
          `to ${cleanPhone}.`,
        refId: txnId,
      });

      emitTransactionUpdate(
        userId,
        {
          requestId,
          txnId,
          status: 'pending',
          balance: newBalance,
        },
      );

      let vendorResult;

      try {
        vendorResult =
          await purchaseData({
            network,
            phone: cleanPhone,
            dataPlan: selectedPlan,
            reference: requestId,
          });
      } catch (vendorError) {
        logger.error(
          {
            vendorError,
            userId,
            requestId,
            txnId,
          },
          'SME API data purchase request failed',
        );

        let refundedBalance =
          newBalance;

        try {
          refundedBalance =
            await refundWalletAndMarkFailed({
              userId,
              txnId,
              amount: confirmedAmount,
              requestId,
            });
        } catch (refundError) {
          logger.error(
            {
              refundError,
              userId,
              requestId,
              txnId,
            },
            'CRITICAL: data purchase refund failed',
          );
        }

        await createNotification(userId, {
          type: 'transaction',
          title: 'Data Purchase Failed',
          body:
            `${resolvedPlanName} could not be ` +
            `delivered. Your wallet has been ` +
            `refunded.`,
          refId: txnId,
        });

        res.status(502).json({
          success: false,
          requestId,
          txnId,
          balance: refundedBalance,
          error:
            'The data provider could not process the request. Your wallet has been refunded.',
        });

        return;
      }

      const normalizedStatus =
        normalizeSMEResult(
          vendorResult,
        );

      const providerRef =
        vendorResult.reference ||
        null;

      if (
        normalizedStatus === 'success'
      ) {
        await markTransactionSuccess({
          userId,
          txnId,
          providerRef,
          metadata: {
            vendorStatus:
              normalizedStatus,
            providerRef,
            planCode: selectedPlan,
            planName: resolvedPlanName,
            costPrice,
            sellingPrice:
              confirmedAmount,
          },
        });

        let cashback = {
          applied: false,
          amount: 0,
          cashbackBalance: '',
        };

        try {
          cashback =
            await applyCashbackIfEligible({
              userId,
              sourceTxnId: txnId,
              requestId,
              planCode: selectedPlan,
              network,
              planName:
                resolvedPlanName,
              purchaseAmount:
                confirmedAmount,
            });
        } catch (cashbackError) {
          logger.error(
            {
              cashbackError,
              userId,
              txnId,
              requestId,
            },
            'Data purchase cashback failed',
          );
        }

        await createNotification(userId, {
          type: 'transaction',
          title: 'Data Purchase Successful',
          body:
            `${resolvedPlanName} has been sent ` +
            `to ${cleanPhone}.`,
          refId: txnId,
        });

        res.json({
          success: true,
          requestId,
          txnId,
          balance: newBalance,
          planCode: selectedPlan,
          planName:
            resolvedPlanName,
          providerRef,
          vendorStatus:
            normalizedStatus,
          cashback,
          message:
            vendorResult.message ||
            'Data purchase successful.',
        });

        return;
      }

      if (
        normalizedStatus === 'pending'
      ) {
        await db.execute(sql`
          UPDATE transactions
          SET
            provider_reference =
              ${providerRef},
            updated_at = NOW(),
            metadata =
              jsonb_build_object(
                'vendorStatus',
                ${normalizedStatus},
                'providerRef',
                ${providerRef},
                'planCode',
                ${selectedPlan},
                'planName',
                ${resolvedPlanName},
                'costPrice',
                ${costPrice},
                'sellingPrice',
                ${confirmedAmount},
                'pendingMarkedAt',
                NOW()::text,
                'requiresPolling',
                true
              )
          WHERE id = ${txnId}::uuid
        `);

        logger.info(
          {
            userId,
            requestId,
            txnId,
            planCode:
              selectedPlan,
            providerRef,
          },
          'Data purchase pending',
        );

        res.json({
          success: false,
          pending: true,
          requestId,
          txnId,
          balance: newBalance,
          planCode: selectedPlan,
          planName:
            resolvedPlanName,
          providerRef,
          vendorStatus:
            normalizedStatus,
          message:
            vendorResult.message ||
            'Your data purchase is being processed.',
        });

        return;
      }

      let refundedBalance =
        newBalance;

      try {
        refundedBalance =
          await refundWalletAndMarkFailed({
            userId,
            txnId,
            amount: confirmedAmount,
            requestId,
          });
      } catch (refundError) {
        logger.error(
          {
            refundError,
            userId,
            requestId,
            txnId,
          },
          'CRITICAL: data refund failed',
        );
      }

      logger.warn(
        {
          userId,
          requestId,
          txnId,
          planCode:
            selectedPlan,
          vendorStatus:
            normalizedStatus,
        },
        'Data purchase failed — wallet reversed',
      );

      await createNotification(userId, {
        type: 'transaction',
        title: 'Data Purchase Failed',
        body:
          `${resolvedPlanName} could not be ` +
          `delivered to ${cleanPhone}. ` +
          `Your wallet has been refunded.`,
        refId: txnId,
      });

      res.status(422).json({
        success: false,
        requestId,
        balance:
          refundedBalance,
        txnId,
        vendorStatus:
          normalizedStatus,
        error:
          `SME API returned: ` +
          `${normalizedStatus || 'failure'} — ` +
          `${vendorResult.message ||
            'No message'}`,
      });
    } catch (error) {
      logger.error(
        {
          error,
          userId,
        },
        'Data purchase route error',
      );

      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to process data purchase.',
      });
    }
  },
);

/* ============================================================
   AIRTIME PURCHASE
   ============================================================ */

router.post(
  '/airtime',
  requireAuth,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId = req.session.userId!;

    try {
      const {
        network,
        phone,
        amount,
        reference,
      } = req.body as {
        network?: string;
        phone?: string;
        amount?: number | string;
        reference?: string;
      };

      const cleanPhone =
        cleanPhoneNumber(phone);

      if (!network) {
        res.status(400).json({
          success: false,
          error: 'Network is required.',
        });
        return;
      }

      if (!cleanPhone) {
        res.status(400).json({
          success: false,
          error:
            'Phone number is required.',
        });
        return;
      }

      if (!/^0\d{10}$/.test(cleanPhone)) {
        res.status(400).json({
          success: false,
          error:
            'Enter a valid Nigerian phone number.',
        });
        return;
      }

      const requestedAmount =
        parseAmount(amount);

      const requestId =
        String(reference || '').trim() ||
        makeReference('AIRTIME');

      /*
       * Vendor discount is applied by SME API.
       * We debit the customer's selling amount
       * according to the application's pricing rule.
       */
      const pricingResult =
        await db.execute<{
          selling_price: string;
          cost_price: string;
        }>(sql`
          SELECT
            selling_price,
            cost_price
          FROM pricing_rules
          WHERE service_type = 'airtime'
            AND enabled = true
            AND (
              LOWER(TRIM(network)) =
                LOWER(TRIM(${String(network)}))
              OR LOWER(TRIM(provider)) =
                LOWER(TRIM(${String(network)}))
              OR LOWER(TRIM(provider)) =
                'smeapi'
            )
          ORDER BY updated_at DESC
          LIMIT 1
        `);

      /*
       * Airtime is amount-based. If no global airtime
       * rule exists, the requested amount is charged.
       */
      const confirmedAmount =
        requestedAmount;

      const debit =
        await debitWalletAndCreateTransaction({
          userId,
          amount: confirmedAmount,
          reference: requestId,
          type: 'airtime',
          description:
            `Airtime purchase: ₦${confirmedAmount} ` +
            `to ${cleanPhone}`,
          metadata: {
            provider: 'smeapi',
            network,
            amount:
              confirmedAmount,
            pricingRule:
              pricingResult.rows[0] ||
              null,
          },
        });

      const {
        txnId,
        newBalance,
      } = debit;

      await createNotification(userId, {
        type: 'transaction',
        title:
          'Airtime Purchase Processing',
        body:
          `₦${confirmedAmount.toFixed(2)} ` +
          `airtime is being sent to ` +
          `${cleanPhone}.`,
        refId: txnId,
      });

      emitTransactionUpdate(
        userId,
        {
          requestId,
          txnId,
          status: 'pending',
          balance: newBalance,
        },
      );

      let vendorResult;

      try {
        vendorResult =
          await purchaseAirtime({
            network,
            phone: cleanPhone,
            amount:
              confirmedAmount,
            reference: requestId,
          });
      } catch (vendorError) {
        logger.error(
          {
            vendorError,
            userId,
            requestId,
            txnId,
          },
          'SME API airtime request failed',
        );

        let refundedBalance =
          newBalance;

        try {
          refundedBalance =
            await refundWalletAndMarkFailed({
              userId,
              txnId,
              amount:
                confirmedAmount,
              requestId,
            });
        } catch (refundError) {
          logger.error(
            {
              refundError,
              userId,
              requestId,
              txnId,
            },
            'CRITICAL: airtime refund failed',
          );
        }

        await createNotification(userId, {
          type: 'transaction',
          title:
            'Airtime Purchase Failed',
          body:
            `Airtime to ${cleanPhone} ` +
            `could not be processed. ` +
            `Your wallet has been refunded.`,
          refId: txnId,
        });

        res.status(502).json({
          success: false,
          requestId,
          txnId,
          balance:
            refundedBalance,
          error:
            'The airtime provider could not process the request. Your wallet has been refunded.',
        });

        return;
      }

      const normalizedStatus =
        normalizeSMEResult(
          vendorResult,
        );

      const providerRef =
        vendorResult.reference ||
        null;

      if (
        normalizedStatus === 'success'
      ) {
        await markTransactionSuccess({
          userId,
          txnId,
          providerRef,
          metadata: {
            vendorStatus:
              normalizedStatus,
            providerRef,
            network,
            amount:
              confirmedAmount,
          },
        });

        await createNotification(userId, {
          type: 'transaction',
          title:
            'Airtime Purchase Successful',
          body:
            `₦${confirmedAmount.toFixed(2)} ` +
            `airtime has been sent to ` +
            `${cleanPhone}.`,
          refId: txnId,
        });

        res.json({
          success: true,
          requestId,
          txnId,
          balance:
            newBalance,
          providerRef,
          vendorStatus:
            normalizedStatus,
          message:
            vendorResult.message ||
            'Airtime purchase successful.',
        });

        return;
      }

      if (
        normalizedStatus === 'pending'
      ) {
        await db.execute(sql`
          UPDATE transactions
          SET
            provider_reference =
              ${providerRef},
            updated_at = NOW(),
            metadata =
              jsonb_build_object(
                'vendorStatus',
                ${normalizedStatus},
                'providerRef',
                ${providerRef},
                'network',
                ${network},
                'amount',
                ${confirmedAmount},
                'pendingMarkedAt',
                NOW()::text,
                'requiresPolling',
                true
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
            normalizedStatus,
          message:
            vendorResult.message ||
            'Your airtime purchase is being processed.',
        });

        return;
      }

      let refundedBalance =
        newBalance;

      try {
        refundedBalance =
          await refundWalletAndMarkFailed({
            userId,
            txnId,
            amount:
              confirmedAmount,
            requestId,
          });
      } catch (refundError) {
        logger.error(
          {
            refundError,
            userId,
            requestId,
            txnId,
          },
          'CRITICAL: airtime refund failed',
        );
      }

      await createNotification(userId, {
        type: 'transaction',
        title:
          'Airtime Purchase Failed',
        body:
          `Airtime to ${cleanPhone} ` +
          `failed. Your wallet has been refunded.`,
        refId: txnId,
      });

      res.status(422).json({
        success: false,
        requestId,
        txnId,
        balance:
          refundedBalance,
        vendorStatus:
          normalizedStatus,
        error:
          `SME API returned: ` +
          `${normalizedStatus || 'failure'} — ` +
          `${vendorResult.message ||
            'No message'}`,
      });
    } catch (error) {
      logger.error(
        {
          error,
          userId,
        },
        'Airtime purchase route error',
      );

      res.status(500).json({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unable to process airtime purchase.',
      });
    }
  },
);

/* ============================================================
   PURCHASE STATUS
   ============================================================ */

router.get(
  '/status/:requestId',
  requireAuth,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const { requestId } =
      req.params as {
        requestId: string;
      };

    const userId =
      req.session.userId!;

    try {
      const [txn] = await db
        .select()
        .from(transactionsTable)
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
          .from(walletsTable)
          .where(
            eq(
              walletsTable.userId,
              userId,
            ),
          );

      res.json({
        status: txn.status,
        requestId,
        txnId: txn.id,
        type: txn.type,
        amount: txn.amount,
        description:
          txn.description,
        providerRef:
          (
            txn as unknown as {
              provider_reference?: string;
            }
          ).provider_reference ??
          null,
        balance:
          wallet?.balance ?? '0',
        createdAt:
          txn.createdAt,
      });
    } catch (error) {
      logger.error(
        {
          error,
          userId,
          requestId,
        },
        'Purchase status lookup failed',
      );

      res.status(500).json({
        error:
          'Unable to retrieve transaction status.',
      });
    }
  },
);

export default router;
