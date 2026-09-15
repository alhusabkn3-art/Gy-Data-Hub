// artifacts/api-server/src/routes/purchase.ts

import {
  Router,
  type Request,
  type Response,
} from 'express';
import { sql } from 'drizzle-orm';
import { db } from '@workspace/db';
import {
  purchaseData,
  purchaseAirtime,
} from '../lib/smeapi.js';
import { requireAuth } from './user.js';
import { logger } from '../lib/logger.js';
import { createNotification } from '../lib/notifications.js';
import { getIo } from '../lib/socket.js';
import { verifyPin } from '../lib/auth.js';

const router = Router();

/* =========================================================
   TYPES
========================================================= */

type PurchaseResult = {
  success?: boolean;
  status?: string;
  message?: string;
  error?: string;
  reference?: string;
  ref?: string;
  transactionId?: string;
  providerReference?: string;
  provider_message?: string;
  balance?: number;
  amount?: number;
  data?: {
    status?: unknown;
    message?: unknown;
    reference?: unknown;
  };
};

type PricingRule = {
  id: string;
  service_type: string;
  provider: string;
  network: string | null;
  plan_id: string | null;
  plan_name: string | null;
  cost_price: string | number;
  selling_price: string | number;
  enabled: boolean;
  cashback_enabled: boolean;
  cashback_type: string;
  cashback_value: string | number;
};

/* =========================================================
   GENERAL HELPERS
========================================================= */

function safeNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const n = Number(
      value
        .replace(/₦/g, '')
        .replace(/,/g, '')
        .trim(),
    );

    return Number.isFinite(n) ? n : 0;
  }

  return 0;
}

function normalizeNetwork(
  value: unknown,
): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function normalizePhone(
  value: unknown,
): string {
  return String(value ?? '')
    .replace(/\D/g, '')
    .trim();
}

function normalizeReference(
  result: PurchaseResult,
): string {
  return String(
    result.reference ??
      result.ref ??
      result.transactionId ??
      result.providerReference ??
      '',
  ).trim();
}

function normalizeStatus(
  result: PurchaseResult,
): string {
  const nestedStatus =
    result.data &&
    typeof result.data === 'object'
      ? result.data.status
      : undefined;

  return String(
    result.status ??
      nestedStatus ??
      '',
  )
    .trim()
    .toLowerCase();
}

function normalizeMessage(
  result: PurchaseResult,
): string {
  const nestedMessage =
    result.data &&
    typeof result.data === 'object'
      ? result.data.message
      : undefined;

  return String(
    result.message ??
      result.error ??
      result.provider_message ??
      nestedMessage ??
      '',
  ).trim();
}

function isSuccessfulProviderResult(
  result: PurchaseResult,
): boolean {
  const status = normalizeStatus(result);

  if (
    status === 'success' ||
    status === 'successful' ||
    status === 'completed' ||
    status === 'complete' ||
    status === 'delivered'
  ) {
    return true;
  }

  if (
    status === 'failed' ||
    status === 'failure' ||
    status === 'error' ||
    status === 'declined' ||
    status === 'cancelled' ||
    status === 'canceled'
  ) {
    return false;
  }

  return result.success === true;
}

function isPendingProviderResult(
  result: PurchaseResult,
): boolean {
  const status = normalizeStatus(result);

  return (
    status === 'pending' ||
    status === 'processing' ||
    status === 'queued' ||
    status === 'in_progress' ||
    status === 'in-progress'
  );
}

function roundMoney(
  amount: number,
): number {
  return Math.round(
    (amount + Number.EPSILON) * 100,
  ) / 100;
}

function calculateCashback(
  rule: PricingRule,
  sellingPrice: number,
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

  if (
    rule.cashback_type.toLowerCase() ===
    'percentage'
  ) {
    return roundMoney(
      sellingPrice * (value / 100),
    );
  }

  return roundMoney(value);
}

/* =========================================================
   WALLET HELPERS
========================================================= */

async function getMainWallet(
  userId: string,
): Promise<{
  id: string;
  balance: number;
} | null> {
  const result = await db.execute<{
    id: string;
    balance: string;
  }>(sql`
    SELECT
      id,
      balance
    FROM wallets
    WHERE user_id = ${userId}::uuid
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    return null;
  }

  return {
    id: result.rows[0].id,
    balance: safeNumber(
      result.rows[0].balance,
    ),
  };
}

async function debitWallet(
  walletId: string,
  amount: number,
): Promise<{
  success: boolean;
  balance: number;
}> {
  const result = await db.execute<{
    balance: string;
  }>(sql`
    UPDATE wallets
    SET balance = balance - ${amount}
    WHERE id = ${walletId}::uuid
      AND balance >= ${amount}
    RETURNING balance
  `);

  if (result.rows.length === 0) {
    return {
      success: false,
      balance: 0,
    };
  }

  return {
    success: true,
    balance: safeNumber(
      result.rows[0].balance,
    ),
  };
}

async function creditWallet(
  walletId: string,
  amount: number,
): Promise<number> {
  const result = await db.execute<{
    balance: string;
  }>(sql`
    UPDATE wallets
    SET balance = balance + ${amount}
    WHERE id = ${walletId}::uuid
    RETURNING balance
  `);

  if (result.rows.length === 0) {
    return 0;
  }

  return safeNumber(
    result.rows[0].balance,
  );
}

/* =========================================================
   PURCHASE PIN
========================================================= */

async function verifyPurchasePin(
  userId: string,
  purchasePin: string,
): Promise<{
  ok: true;
} | {
  ok: false;
  status: number;
  error: string;
  code?: string;
}> {
  if (!/^\d{4}$/.test(purchasePin)) {
    return {
      ok: false,
      status: 400,
      error: 'Purchase PIN must be exactly 4 digits.',
      code: 'INVALID_PURCHASE_PIN',
    };
  }

  const result = await db.execute<{
    purchase_pin_hash: string | null;
  }>(sql`
    SELECT purchase_pin_hash
    FROM users
    WHERE id = ${userId}::uuid
    LIMIT 1
  `);

  if (result.rows.length === 0) {
    return {
      ok: false,
      status: 404,
      error: 'User not found.',
      code: 'USER_NOT_FOUND',
    };
  }

  const hash =
    result.rows[0].purchase_pin_hash;

  if (!hash) {
    return {
      ok: false,
      status: 400,
      error: 'Purchase PIN has not been set.',
      code: 'PURCHASE_PIN_NOT_SET',
    };
  }

  const valid = await verifyPin(
    purchasePin,
    hash,
  );

  if (!valid) {
    return {
      ok: false,
      status: 401,
      error: 'Invalid Purchase PIN.',
      code: 'INVALID_PURCHASE_PIN',
    };
  }

  return {
    ok: true,
  };
}

/* =========================================================
   PRICING
========================================================= */

async function getPricingRule(
  serviceType: string,
  network: string,
  planId?: string,
): Promise<PricingRule | null> {
  const normalizedService =
    serviceType.trim().toLowerCase();

  const normalizedNetwork =
    normalizeNetwork(network);

  if (planId) {
    const result = await db.execute<PricingRule>(sql`
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
      WHERE LOWER(service_type) = ${normalizedService}
        AND UPPER(network) = ${normalizedNetwork}
        AND plan_id = ${planId}
        AND enabled = true
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
    `);

    if (result.rows.length > 0) {
      return result.rows[0];
    }
  }

  const result = await db.execute<PricingRule>(sql`
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
    WHERE LOWER(service_type) = ${normalizedService}
      AND UPPER(network) = ${normalizedNetwork}
      AND enabled = true
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 1
  `);

  return result.rows[0] ?? null;
}

/* =========================================================
   TRANSACTION HELPERS
========================================================= */

async function createPurchaseTransaction(
  userId: string,
  walletId: string,
  serviceType: string,
  network: string,
  phone: string,
  amount: number,
  reference: string,
  status: string,
): Promise<string | null> {
  try {
    const result = await db.execute<{
      id: string;
    }>(sql`
      INSERT INTO transactions (
        user_id,
        wallet_id,
        type,
        service,
        network,
        phone,
        amount,
        reference,
        status
      )
      VALUES (
        ${userId}::uuid,
        ${walletId}::uuid,
        'purchase',
        ${serviceType},
        ${network},
        ${phone},
        ${amount},
        ${reference},
        ${status}
      )
      RETURNING id
    `);

    return result.rows[0]?.id ?? null;
  } catch (error) {
    logger.error(
      {
        error,
        userId,
        serviceType,
        reference,
      },
      'Failed to create purchase transaction',
    );

    return null;
  }
}

async function updatePurchaseTransaction(
  transactionId: string,
  status: string,
  reference?: string,
): Promise<void> {
  try {
    if (reference) {
      await db.execute(sql`
        UPDATE transactions
        SET
          status = ${status},
          reference = ${reference},
          updated_at = NOW()
        WHERE id = ${transactionId}::uuid
      `);
    } else {
      await db.execute(sql`
        UPDATE transactions
        SET
          status = ${status},
          updated_at = NOW()
        WHERE id = ${transactionId}::uuid
      `);
    }
  } catch (error) {
    logger.error(
      {
        error,
        transactionId,
        status,
      },
      'Failed to update purchase transaction',
    );
  }
}

/* =========================================================
   IDEMPOTENCY
========================================================= */

async function getExistingIdempotentTransaction(
  userId: string,
  idempotencyKey: string,
): Promise<{
  id: string;
  status: string;
  reference: string | null;
  amount: number;
  service: string | null;
} | null> {
  if (!idempotencyKey) {
    return null;
  }

  try {
    const result = await db.execute<{
      id: string;
      status: string;
      reference: string | null;
      amount: string;
      service: string | null;
    }>(sql`
      SELECT
        id,
        status,
        reference,
        amount,
        service
      FROM transactions
      WHERE user_id = ${userId}::uuid
        AND idempotency_key = ${idempotencyKey}
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return null;
    }

    return {
      id: result.rows[0].id,
      status: result.rows[0].status,
      reference: result.rows[0].reference,
      amount: safeNumber(
        result.rows[0].amount,
      ),
      service: result.rows[0].service,
    };
  } catch (error) {
    logger.error(
      {
        error,
        userId,
        idempotencyKey,
      },
      'Failed to check idempotency transaction',
    );

    return null;
  }
}

async function setTransactionIdempotencyKey(
  transactionId: string,
  idempotencyKey: string,
): Promise<void> {
  if (!idempotencyKey) {
    return;
  }

  try {
    await db.execute(sql`
      UPDATE transactions
      SET idempotency_key = ${idempotencyKey}
      WHERE id = ${transactionId}::uuid
    `);
  } catch (error) {
    logger.error(
      {
        error,
        transactionId,
        idempotencyKey,
      },
      'Failed to save idempotency key',
    );
  }
}

/* =========================================================
   NOTIFICATIONS
========================================================= */

async function notifyPurchase(
  userId: string,
  title: string,
  message: string,
): Promise<void> {
  try {
    await createNotification({
      userId,
      title,
      message,
    });
  } catch (error) {
    logger.error(
      {
        error,
        userId,
      },
      'Failed to create purchase notification',
    );
  }

  try {
    const io = getIo();

    if (io) {
      io.to(`user:${userId}`).emit(
        'notification',
        {
          title,
          message,
        },
      );
    }
  } catch (error) {
    logger.error(
      {
        error,
        userId,
      },
      'Failed to emit purchase notification',
    );
  }
}

/* =========================================================
   DATA PURCHASE
========================================================= */

router.post(
  '/data',
  requireAuth,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId = req.session.userId!;

    const body = (req.body ?? {}) as {
      network?: unknown;
      phone?: unknown;

      planCode?: unknown;
      planName?: unknown;
      planPrice?: unknown;

      dataPlan?: unknown;
      DataPlan?: unknown;
      DataPlanName?: unknown;
      Price?: unknown;

      amount?: unknown;

      idempotencyKey?: unknown;

      purchasePin?: unknown;
    };

    const network = normalizeNetwork(
      body.network,
    );

    const phone = normalizePhone(
      body.phone,
    );

    const planCode = String(
      body.planCode ??
        body.dataPlan ??
        body.DataPlan ??
        '',
    ).trim();

    const planName = String(
      body.planName ??
        body.DataPlanName ??
        '',
    ).trim();

    const rawPrice =
      body.planPrice ??
      body.amount ??
      body.Price;

    const requestedPrice =
      safeNumber(rawPrice);

    const purchasePin = String(
      body.purchasePin ??
        '',
    ).trim();

    const pinCheck =
      await verifyPurchasePin(
        userId,
        purchasePin,
      );

    if (pinCheck.ok === false) {
      res.status(pinCheck.status).json({
        success: false,
        error: pinCheck.error,
        ...(pinCheck.code
          ? { code: pinCheck.code }
          : {}),
      });
      return;
    }

    logger.info(
      { userId },
      'Purchase PIN verified',
    );

    if (!network) {
      res.status(400).json({
        success: false,
        error: 'Network is required.',
      });
      return;
    }

    if (!phone) {
      res.status(400).json({
        success: false,
        error: 'Phone number is required.',
      });
      return;
    }

    if (!planCode) {
      res.status(400).json({
        success: false,
        error: 'Data plan is required.',
      });
      return;
    }

    if (
      requestedPrice <= 0 ||
      !Number.isFinite(requestedPrice)
    ) {
      res.status(400).json({
        success: false,
        error: 'A valid data plan price is required.',
      });
      return;
    }

    const idempotencyKey =
      String(
        body.idempotencyKey ?? '',
      ).trim();

    const existing =
      await getExistingIdempotentTransaction(
        userId,
        idempotencyKey,
      );

    if (existing) {
      res.status(200).json({
        success:
          existing.status === 'success' ||
          existing.status === 'completed',
        status: existing.status,
        reference: existing.reference,
        transactionId: existing.id,
        amount: existing.amount,
        message:
          'This purchase has already been processed.',
      });
      return;
    }

    const pricingRule =
      await getPricingRule(
        'data',
        network,
        planCode,
      );

    const sellingPrice =
      pricingRule
        ? safeNumber(
            pricingRule.selling_price,
          )
        : requestedPrice;

    if (
      !Number.isFinite(sellingPrice) ||
      sellingPrice <= 0
    ) {
      res.status(400).json({
        success: false,
        error: 'Invalid data plan price.',
      });
      return;
    }

    if (
      pricingRule &&
      Math.abs(
        sellingPrice - requestedPrice,
      ) > 0.01
    ) {
      logger.warn(
        {
          userId,
          network,
          planCode,
          requestedPrice,
          sellingPrice,
        },
        'Client supplied data price differs from server pricing',
      );
    }

    const wallet =
      await getMainWallet(userId);

    if (!wallet) {
      res.status(400).json({
        success: false,
        error: 'Wallet not found.',
      });
      return;
    }

    if (
      wallet.balance < sellingPrice
    ) {
      res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance.',
        balance: wallet.balance,
        amount: sellingPrice,
      });
      return;
    }

    const debit =
      await debitWallet(
        wallet.id,
        sellingPrice,
      );

    if (!debit.success) {
      res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance.',
      });
      return;
    }

    let transactionId:
      string | null = null;

    let reference = '';

    try {
      const transactionResult =
        await db.execute<{
          id: string;
        }>(sql`
          INSERT INTO transactions (
            user_id,
            wallet_id,
            type,
            service,
            network,
            phone,
            amount,
            status,
            idempotency_key
          )
          VALUES (
            ${userId}::uuid,
            ${wallet.id}::uuid,
            'purchase',
            'data',
            ${network},
            ${phone},
            ${sellingPrice},
            'processing',
            ${idempotencyKey || null}
          )
          RETURNING id
        `);

      transactionId =
        transactionResult.rows[0]?.id ??
        null;

      if (!transactionId) {
        throw new Error(
          'Failed to create transaction.',
        );
      }

      const providerResult =
        await purchaseData({
          network,
          phone,
          planCode,
          planName,
          amount: sellingPrice,
        }) as PurchaseResult;

      reference =
        normalizeReference(
          providerResult,
        );

      const providerMessage =
        normalizeMessage(
          providerResult,
        );

      const successful =
        isSuccessfulProviderResult(
          providerResult,
        );

      const pending =
        isPendingProviderResult(
          providerResult,
        );

      if (successful) {
        await updatePurchaseTransaction(
          transactionId,
          'success',
          reference || undefined,
        );

        const cashback =
          pricingRule
            ? calculateCashback(
                pricingRule,
                sellingPrice,
              )
            : 0;

        let cashbackBalance =
          debit.balance;

        if (cashback > 0) {
          cashbackBalance =
            await creditWallet(
              wallet.id,
              cashback,
            );
        }

        await notifyPurchase(
          userId,
          'Data Purchase Successful',
          `${planName || planCode} purchased successfully for ${phone}.`,
        );

        res.status(200).json({
          success: true,
          status: 'success',
          pending: false,
          message:
            providerMessage ||
            'Data purchase successful.',
          reference,
          transactionId,
          amount: sellingPrice,
          balance: cashbackBalance,
          cashback,
        });
        return;
      }

      if (pending) {
        await updatePurchaseTransaction(
          transactionId,
          'pending',
          reference || undefined,
        );

        await notifyPurchase(
          userId,
          'Data Purchase Pending',
          `Your data purchase for ${phone} is being processed.`,
        );

        res.status(200).json({
          success: true,
          status: 'pending',
          pending: true,
          message:
            providerMessage ||
            'Data purchase is being processed.',
          reference,
          transactionId,
          amount: sellingPrice,
          balance: debit.balance,
        });
        return;
      }

      await updatePurchaseTransaction(
        transactionId,
        'failed',
        reference || undefined,
      );

      const refundedBalance =
        await creditWallet(
          wallet.id,
          sellingPrice,
        );

      await notifyPurchase(
        userId,
        'Data Purchase Failed',
        `Your data purchase for ${phone} failed. Your wallet has been refunded.`,
      );

      res.status(502).json({
        success: false,
        status: 'failed',
        pending: false,
        error:
          providerMessage ||
          'Data purchase failed. Your wallet has been refunded.',
        reference,
        transactionId,
        amount: sellingPrice,
        balance:
          refundedBalance,
      });
      return;
    } catch (error) {
      logger.error(
        {
          error,
          userId,
          network,
          phone,
          planCode,
          transactionId,
        },
        'Data purchase error',
      );

      if (transactionId) {
        await updatePurchaseTransaction(
          transactionId,
          'failed',
          reference || undefined,
        );
      }

      const refundedBalance =
        await creditWallet(
          wallet.id,
          sellingPrice,
        );

      await notifyPurchase(
        userId,
        'Data Purchase Failed',
        `Your data purchase for ${phone} failed. Your wallet has been refunded.`,
      );

      res.status(500).json({
        success: false,
        status: 'failed',
        pending: false,
        error:
          'Data purchase failed. Your wallet has been refunded.',
        transactionId,
        amount: sellingPrice,
        balance:
          refundedBalance,
      });
    }
  },
);

/* =========================================================
   AIRTIME PURCHASE
========================================================= */

router.post(
  '/airtime',
  requireAuth,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId = req.session.userId!;

    const body = (req.body ?? {}) as {
      network?: unknown;
      phone?: unknown;
      amount?: unknown;
      idempotencyKey?: unknown;
      purchasePin?: unknown;
    };

    const network = normalizeNetwork(
      body.network,
    );

    const phone = normalizePhone(
      body.phone,
    );

    const amount =
      safeNumber(body.amount);

    const purchasePin = String(
      body.purchasePin ??
        '',
    ).trim();

    const pinCheck =
      await verifyPurchasePin(
        userId,
        purchasePin,
      );

    if (pinCheck.ok === false) {
      res.status(pinCheck.status).json({
        success: false,
        error: pinCheck.error,
        ...(pinCheck.code
          ? { code: pinCheck.code }
          : {}),
      });
      return;
    }

    logger.info(
      { userId },
      'Purchase PIN verified',
    );

    if (!network) {
      res.status(400).json({
        success: false,
        error: 'Network is required.',
      });
      return;
    }

    if (!phone) {
      res.status(400).json({
        success: false,
        error: 'Phone number is required.',
      });
      return;
    }

    if (
      amount <= 0 ||
      !Number.isFinite(amount)
    ) {
      res.status(400).json({
        success: false,
        error: 'A valid airtime amount is required.',
      });
      return;
    }

    const idempotencyKey =
      String(
        body.idempotencyKey ?? '',
      ).trim();

    const existing =
      await getExistingIdempotentTransaction(
        userId,
        idempotencyKey,
      );

    if (existing) {
      res.status(200).json({
        success:
          existing.status === 'success' ||
          existing.status === 'completed',
        status: existing.status,
        reference: existing.reference,
        transactionId: existing.id,
        amount: existing.amount,
        message:
          'This purchase has already been processed.',
      });
      return;
    }

    const pricingRule =
      await getPricingRule(
        'airtime',
        network,
      );

    const sellingPrice =
      pricingRule
        ? safeNumber(
            pricingRule.selling_price,
          )
        : amount;

    if (
      !Number.isFinite(sellingPrice) ||
      sellingPrice <= 0
    ) {
      res.status(400).json({
        success: false,
        error: 'Invalid airtime amount.',
      });
      return;
    }

    const wallet =
      await getMainWallet(userId);

    if (!wallet) {
      res.status(400).json({
        success: false,
        error: 'Wallet not found.',
      });
      return;
    }

    if (
      wallet.balance < sellingPrice
    ) {
      res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance.',
        balance: wallet.balance,
        amount: sellingPrice,
      });
      return;
    }

    const debit =
      await debitWallet(
        wallet.id,
        sellingPrice,
      );

    if (!debit.success) {
      res.status(400).json({
        success: false,
        error: 'Insufficient wallet balance.',
      });
      return;
    }

    let transactionId:
      string | null = null;

    let reference = '';

    try {
      const transactionResult =
        await db.execute<{
          id: string;
        }>(sql`
          INSERT INTO transactions (
            user_id,
            wallet_id,
            type,
            service,
            network,
            phone,
            amount,
            status,
            idempotency_key
          )
          VALUES (
            ${userId}::uuid,
            ${wallet.id}::uuid,
            'purchase',
            'airtime',
            ${network},
            ${phone},
            ${sellingPrice},
            'processing',
            ${idempotencyKey || null}
          )
          RETURNING id
        `);

      transactionId =
        transactionResult.rows[0]?.id ??
        null;

      if (!transactionId) {
        throw new Error(
          'Failed to create transaction.',
        );
      }

      const providerResult =
        await purchaseAirtime({
          network,
          phone,
          amount: sellingPrice,
        }) as PurchaseResult;

      reference =
        normalizeReference(
          providerResult,
        );

      const providerMessage =
        normalizeMessage(
          providerResult,
        );

      const successful =
        isSuccessfulProviderResult(
          providerResult,
        );

      const pending =
        isPendingProviderResult(
          providerResult,
        );

      if (successful) {
        await updatePurchaseTransaction(
          transactionId,
          'success',
          reference || undefined,
        );

        const cashback =
          pricingRule
            ? calculateCashback(
                pricingRule,
                sellingPrice,
              )
            : 0;

        let cashbackBalance =
          debit.balance;

        if (cashback > 0) {
          cashbackBalance =
            await creditWallet(
              wallet.id,
              cashback,
            );
        }

        await notifyPurchase(
          userId,
          'Airtime Purchase Successful',
          `Airtime purchase of ₦${sellingPrice.toFixed(2)} for ${phone} was successful.`,
        );

        res.status(200).json({
          success: true,
          status: 'success',
          pending: false,
          message:
            providerMessage ||
            'Airtime purchase successful.',
          reference,
          transactionId,
          amount: sellingPrice,
          balance: cashbackBalance,
          cashback,
        });
        return;
      }

      if (pending) {
        await updatePurchaseTransaction(
          transactionId,
          'pending',
          reference || undefined,
        );

        await notifyPurchase(
          userId,
          'Airtime Purchase Pending',
          `Your airtime purchase for ${phone} is being processed.`,
        );

        res.status(200).json({
          success: true,
          status: 'pending',
          pending: true,
          message:
            providerMessage ||
            'Airtime purchase is being processed.',
          reference,
          transactionId,
          amount: sellingPrice,
          balance: debit.balance,
        });
        return;
      }

      await updatePurchaseTransaction(
        transactionId,
        'failed',
        reference || undefined,
      );

      const refundedBalance =
        await creditWallet(
          wallet.id,
          sellingPrice,
        );

      await notifyPurchase(
        userId,
        'Airtime Purchase Failed',
        `Your airtime purchase for ${phone} failed. Your wallet has been refunded.`,
      );

      res.status(502).json({
        success: false,
        status: 'failed',
        pending: false,
        error:
          providerMessage ||
          'Airtime purchase failed. Your wallet has been refunded.',
        reference,
        transactionId,
        amount: sellingPrice,
        balance:
          refundedBalance,
      });
      return;
    } catch (error) {
      logger.error(
        {
          error,
          userId,
          network,
          phone,
          amount: sellingPrice,
          transactionId,
        },
        'Airtime purchase error',
      );

      if (transactionId) {
        await updatePurchaseTransaction(
          transactionId,
          'failed',
          reference || undefined,
        );
      }

      const refundedBalance =
        await creditWallet(
          wallet.id,
          sellingPrice,
        );

      await notifyPurchase(
        userId,
        'Airtime Purchase Failed',
        `Your airtime purchase for ${phone} failed. Your wallet has been refunded.`,
      );

      res.status(500).json({
        success: false,
        status: 'failed',
        pending: false,
        error:
          'Airtime purchase failed. Your wallet has been refunded.',
        transactionId,
        amount: sellingPrice,
        balance:
          refundedBalance,
      });
    }
  },
);

export default router;
