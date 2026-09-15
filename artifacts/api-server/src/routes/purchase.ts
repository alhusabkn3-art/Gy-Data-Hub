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
  userId: string,
  amount: number,
): Promise<number> {
  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      'Invalid wallet debit amount.',
    );
  }

  const result = await db.execute<{
    balance: string;
  }>(sql`
    UPDATE wallets
    SET
      balance = balance - ${amount},
      updated_at = NOW()
    WHERE user_id = ${userId}::uuid
      AND balance >= ${amount}
    RETURNING balance
  `);

  if (result.rows.length === 0) {
    const error = new Error(
      'Insufficient wallet balance.',
    );

    (error as Error & { code?: string }).code =
      'INSUFFICIENT';

    throw error;
  }

  return safeNumber(
    result.rows[0].balance,
  );
}

async function refundWallet(
  userId: string,
  amount: number,
): Promise<number> {
  if (amount <= 0) {
    const wallet =
      await getMainWallet(userId);

    return wallet?.balance ?? 0;
  }

  const result = await db.execute<{
    balance: string;
  }>(sql`
    UPDATE wallets
    SET
      balance = balance + ${amount},
      updated_at = NOW()
    WHERE user_id = ${userId}::uuid
    RETURNING balance
  `);

  return safeNumber(
    result.rows[0]?.balance,
  );
}

/* =========================================================
   PURCHASE PIN
========================================================= */

async function verifyPurchasePin(
  userId: string,
  purchasePin: string,
): Promise<
  | { ok: true }
  | {
      ok: false;
      status: number;
      error: string;
      code?: string;
    }
> {
  if (!/^\d{4}$/.test(purchasePin)) {
    return {
      ok: false,
      status: 400,
      error:
        'Purchase PIN must be exactly 4 digits.',
      code: 'PURCHASE_PIN_REQUIRED',
    };
  }

  const result = await db.execute<{
    purchase_pin_hash: string | null;
  }>(sql`
    SELECT
      purchase_pin_hash
    FROM users
    WHERE id = ${userId}::uuid
    LIMIT 1
  `);

  const user = result.rows[0];

  if (!user) {
    return {
      ok: false,
      status: 401,
      error: 'User account not found.',
    };
  }

  if (!user.purchase_pin_hash) {
    return {
      ok: false,
      status: 400,
      error:
        'Purchase PIN is not configured. Please set a Purchase PIN before buying.',
      code:
        'PURCHASE_PIN_NOT_CONFIGURED',
    };
  }

  const valid = await verifyPin(
    purchasePin,
    user.purchase_pin_hash,
  );

  if (!valid) {
    return {
      ok: false,
      status: 401,
      error:
        'Incorrect purchase PIN.',
      code: 'INVALID_PURCHASE_PIN',
    };
  }

  return { ok: true };
}

/* =========================================================
   CASHBACK TRANSFER
========================================================= */

export async function transferCashbackToMain(
  userId: string,
  amount: number,
  mode: string = 'manual',
): Promise<{
  transferred: number;
  newMainBalance: number;
  newCashbackBalance: number;
}> {
  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    const error = new Error(
      'Invalid cashback transfer amount.',
    );

    (error as Error & { code?: string }).code =
      'INVALID_AMOUNT';

    throw error;
  }

  const cashbackResult =
    await db.execute<{
      id: string;
      balance: string;
    }>(sql`
      UPDATE cashback_wallets
      SET
        balance = balance - ${amount},
        updated_at = NOW()
      WHERE user_id = ${userId}::uuid
        AND balance >= ${amount}
      RETURNING id, balance
    `);

  if (
    cashbackResult.rows.length === 0
  ) {
    const error = new Error(
      'Insufficient cashback balance.',
    );

    (error as Error & { code?: string }).code =
      'INSUFFICIENT';

    throw error;
  }

  const mainResult =
    await db.execute<{
      id: string;
      balance: string;
    }>(sql`
      UPDATE wallets
      SET
        balance = balance + ${amount},
        updated_at = NOW()
      WHERE user_id = ${userId}::uuid
      RETURNING id, balance
    `);

  if (
    mainResult.rows.length === 0
  ) {
    await db.execute(sql`
      UPDATE cashback_wallets
      SET
        balance = balance + ${amount},
        updated_at = NOW()
      WHERE user_id = ${userId}::uuid
    `);

    const error = new Error(
      'Main wallet not found.',
    );

    (error as Error & { code?: string }).code =
      'WALLET_NOT_FOUND';

    throw error;
  }

  const newCashbackBalance =
    safeNumber(
      cashbackResult.rows[0].balance,
    );

  const newMainBalance =
    safeNumber(
      mainResult.rows[0].balance,
    );

  try {
    await db.execute(sql`
      INSERT INTO cashback_transfers (
        user_id,
        amount,
        mode,
        created_at
      )
      VALUES (
        ${userId}::uuid,
        ${amount},
        ${mode},
        NOW()
      )
    `);
  } catch (error) {
    logger.error(
      {
        error,
        userId,
        amount,
        mode,
      },
      'Failed to create cashback transfer audit record',
    );
  }

  return {
    transferred: roundMoney(amount),
    newMainBalance,
    newCashbackBalance,
  };
}

/* =========================================================
   PRICING
========================================================= */

async function getPricingRule(
  serviceType: string,
  network: string,
  planCode?: string,
): Promise<PricingRule | null> {
  if (serviceType === 'data') {
    const result = await db.execute<PricingRule>(
      sql`
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
        WHERE service_type = ${serviceType}
          AND enabled = true
          AND (
            network IS NULL
            OR UPPER(network) = UPPER(${network})
          )
          AND (
            plan_id IS NULL
            OR plan_id = ${planCode ?? ''}
          )
        ORDER BY
          CASE
            WHEN plan_id = ${planCode ?? ''}
              THEN 0
            WHEN network = ${network}
              THEN 1
            ELSE 2
          END,
          id
        LIMIT 1
      `,
    );

    return result.rows[0] ?? null;
  }

  const result = await db.execute<PricingRule>(
    sql`
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
      WHERE service_type = ${serviceType}
        AND enabled = true
        AND (
          network IS NULL
          OR UPPER(network) = UPPER(${network})
        )
      ORDER BY
        CASE
          WHEN network = ${network}
            THEN 0
          ELSE 1
        END,
        id
      LIMIT 1
    `,
  );

  return result.rows[0] ?? null;
}

/* =========================================================
   TRANSACTION HELPERS
========================================================= */

async function createPurchaseTransaction(
  userId: string,
  serviceType: string,
  network: string,
  phone: string,
  amount: number,
  costPrice: number,
  reference: string,
  planCode?: string,
  planName?: string,
): Promise<string | null> {
  try {
    const result = await db.execute<{
      id: string;
    }>(sql`
      INSERT INTO transactions (
        user_id,
        type,
        status,
        amount,
        network,
        phone,
        reference,
        plan_id,
        plan_name,
        cost_price,
        selling_price,
        provider,
        created_at,
        updated_at
      )
      VALUES (
        ${userId}::uuid,
        ${serviceType},
        'pending',
        ${amount},
        ${network},
        ${phone},
        ${reference},
        ${planCode ?? null},
        ${planName ?? null},
        ${costPrice},
        ${amount},
        'smeapi',
        NOW(),
        NOW()
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
        network,
        phone,
        amount,
        reference,
      },
      'Failed to create purchase transaction',
    );

    return null;
  }
}

async function updatePurchaseTransaction(
  transactionId: string | null,
  status: string,
  reference?: string,
  providerReference?: string,
  message?: string,
): Promise<void> {
  if (!transactionId) {
    return;
  }

  try {
    await db.execute(sql`
      UPDATE transactions
      SET
        status = ${status},
        reference = COALESCE(
          ${reference ?? null},
          reference
        ),
        provider_reference = COALESCE(
          ${providerReference ?? null},
          provider_reference
        ),
        provider_message = COALESCE(
          ${message ?? null},
          provider_message
        ),
        updated_at = NOW()
      WHERE id = ${transactionId}::uuid
    `);
  } catch (error) {
    logger.error(
      {
        error,
        transactionId,
        status,
        reference,
        providerReference,
      },
      'Failed to update purchase transaction',
    );
  }
}

async function insertWalletLedger(
  userId: string,
  amount: number,
  type: string,
  reference: string,
  description: string,
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO wallet_ledger (
        user_id,
        amount,
        type,
        reference,
        description,
        created_at
      )
      VALUES (
        ${userId}::uuid,
        ${amount},
        ${type},
        ${reference},
        ${description},
        NOW()
      )
    `);
  } catch (error) {
    logger.error(
      {
        error,
        userId,
        amount,
        type,
        reference,
      },
      'Failed to insert wallet ledger entry',
    );
  }
}

async function creditCashback(
  userId: string,
  amount: number,
  reference: string,
): Promise<void> {
  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    return;
  }

  try {
    await db.execute(sql`
      INSERT INTO cashback_wallets (
        user_id,
        balance,
        updated_at
      )
      VALUES (
        ${userId}::uuid,
        ${amount},
        NOW()
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        balance =
          cashback_wallets.balance + ${amount},
        updated_at = NOW()
    `);

    await db.execute(sql`
      INSERT INTO cashback_ledger (
        user_id,
        amount,
        type,
        reference,
        description,
        created_at
      )
      VALUES (
        ${userId}::uuid,
        ${amount},
        'credit',
        ${reference},
        'Cashback from purchase',
        NOW()
      )
    `);
  } catch (error) {
    logger.error(
      {
        error,
        userId,
        amount,
        reference,
      },
      'Failed to credit cashback',
    );
  }
}

/* =========================================================
   NOTIFICATION
========================================================= */

async function notifyPurchase(
  userId: string,
  title: string,
  message: string,
): Promise<void> {
  try {
    await createNotification(
      userId,
      title,
      message,
    );
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
      paymentPin?: unknown;
      pin?: unknown;
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
        body.paymentPin ??
        body.pin ??
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

    logger.info(
      {
        userId,
        network,
        phone,
        planCode,
        planName,
        requestedPrice,
      },
      'Data purchase request received',
    );

    if (!network) {
      res.status(400).json({
        success: false,
        error: 'network is required.',
      });
      return;
    }

    if (!phone) {
      res.status(400).json({
        success: false,
        error: 'phone is required.',
      });
      return;
    }

    if (!/^0\d{10}$/.test(phone)) {
      res.status(400).json({
        success: false,
        error:
          'Invalid Nigerian phone number.',
      });
      return;
    }

    if (!planCode) {
      res.status(400).json({
        success: false,
        error: 'planCode is required.',
      });
      return;
    }

    if (
      !Number.isFinite(requestedPrice) ||
      requestedPrice <= 0
    ) {
      res.status(400).json({
        success: false,
        error: 'Invalid purchase amount.',
      });
      return;
    }

    const pricing =
      await getPricingRule(
        'data',
        network,
        planCode,
      );

    if (!pricing) {
      res.status(400).json({
        success: false,
        error:
          'This data plan is currently unavailable.',
      });
      return;
    }

    const sellingPrice =
      safeNumber(
        pricing.selling_price,
      );

    const costPrice =
      safeNumber(
        pricing.cost_price,
      );

    if (
      sellingPrice <= 0 ||
      costPrice < 0
    ) {
      res.status(400).json({
        success: false,
        error:
          'Invalid pricing configuration.',
      });
      return;
    }

    if (
      Math.abs(
        sellingPrice - requestedPrice,
      ) > 0.01
    ) {
      res.status(400).json({
        success: false,
        error:
          'The selected plan price has changed. Please refresh and try again.',
        code: 'PRICE_CHANGED',
      });
      return;
    }

    const idempotencyKey =
      String(
        body.idempotencyKey ?? '',
      ).trim();

    if (idempotencyKey) {
      try {
        const existing =
          await db.execute<{
            id: string;
            status: string;
            reference: string | null;
          }>(sql`
            SELECT
              id,
              status,
              reference
            FROM transactions
            WHERE user_id = ${userId}::uuid
              AND idempotency_key = ${idempotencyKey}
            LIMIT 1
          `);

        if (existing.rows.length > 0) {
          const transaction =
            existing.rows[0];

          res.json({
            success: true,
            status:
              transaction.status,
            pending:
              transaction.status ===
              'pending',
            transactionId:
              transaction.id,
            reference:
              transaction.reference,
          });

          return;
        }
      } catch (error) {
        logger.warn(
          {
            error,
            userId,
            idempotencyKey,
          },
          'Idempotency lookup failed',
        );
      }
    }

    const amount = sellingPrice;

    let balanceAfterDebit: number;

    try {
      balanceAfterDebit =
        await debitWallet(
          userId,
          amount,
        );
    } catch (error) {
      const code =
        (error as Error & {
          code?: string;
        }).code;

      res.status(
        code === 'INSUFFICIENT'
          ? 400
          : 500,
      ).json({
        success: false,
        error:
          code === 'INSUFFICIENT'
            ? 'Insufficient wallet balance.'
            : 'Unable to debit wallet.',
        ...(code
          ? { code }
          : {}),
      });

      return;
    }

    const reference =
      `DATA-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)
        .toUpperCase()}`;

    const transactionId =
      await createPurchaseTransaction(
        userId,
        'data',
        network,
        phone,
        amount,
        costPrice,
        reference,
        planCode,
        planName,
      );

    if (idempotencyKey) {
      try {
        await db.execute(sql`
          UPDATE transactions
          SET
            idempotency_key =
              ${idempotencyKey},
            updated_at = NOW()
          WHERE id =
            ${transactionId}::uuid
        `);
      } catch (error) {
        logger.warn(
          {
            error,
            transactionId,
            idempotencyKey,
          },
          'Failed to save idempotency key',
        );
      }
    }

    await insertWalletLedger(
      userId,
      -amount,
      'debit',
      reference,
      `Data purchase - ${network} ${planName || planCode}`,
    );

    let providerResult:
      | PurchaseResult
      | null = null;

    try {
      providerResult =
        (await purchaseData({
          network,
          phone,
          planCode,
          planName,
          amount,
          reference,
        })) as PurchaseResult;
    } catch (error) {
      logger.error(
        {
          error,
          userId,
          network,
          phone,
          planCode,
          reference,
        },
        'Data provider request failed',
      );

      await refundWallet(
        userId,
        amount,
      );

      await updatePurchaseTransaction(
        transactionId,
        'failed',
        reference,
        undefined,
        'Provider request failed.',
      );

      res.status(502).json({
        success: false,
        status: 'failed',
        error:
          'Data purchase provider is unavailable. Your wallet has been refunded.',
        reference,
        transactionId,
      });

      return;
    }

    const providerReference =
      normalizeReference(
        providerResult,
      );

    const providerMessage =
      normalizeMessage(
        providerResult,
      );

    if (
      isSuccessfulProviderResult(
        providerResult,
      )
    ) {
      await updatePurchaseTransaction(
        transactionId,
        'success',
        reference,
        providerReference,
        providerMessage,
      );

      const cashback =
        calculateCashback(
          pricing,
          amount,
        );

      if (cashback > 0) {
        await creditCashback(
          userId,
          cashback,
          reference,
        );
      }

      await notifyPurchase(
        userId,
        'Data purchase successful',
        `Your ${planName || planCode} data purchase to ${phone} was successful.`,
      );

      res.json({
        success: true,
        status: 'success',
        pending: false,
        message:
          providerMessage ||
          'Data purchase successful.',
        reference,
        providerReference,
        transactionId,
        amount,
        balance:
          balanceAfterDebit,
        cashback:
          cashback > 0
            ? cashback
            : 0,
      });

      return;
    }

    if (
      isPendingProviderResult(
        providerResult,
      )
    ) {
      await updatePurchaseTransaction(
        transactionId,
        'pending',
        reference,
        providerReference,
        providerMessage,
      );

      await notifyPurchase(
        userId,
        'Data purchase pending',
        `Your data purchase to ${phone} is being processed.`,
      );

      res.json({
        success: true,
        status: 'pending',
        pending: true,
        message:
          providerMessage ||
          'Your data purchase is being processed.',
        reference,
        providerReference,
        transactionId,
        amount,
        balance:
          balanceAfterDebit,
      });

      return;
    }

    await updatePurchaseTransaction(
      transactionId,
      'failed',
      reference,
      providerReference,
      providerMessage,
    );

    const refundedBalance =
      await refundWallet(
        userId,
        amount,
      );

    await insertWalletLedger(
      userId,
      amount,
      'refund',
      reference,
      'Refund for failed data purchase',
    );

    await notifyPurchase(
      userId,
      'Data purchase failed',
      `Your data purchase to ${phone} failed. Your wallet has been refunded.`,
    );

    res.status(502).json({
      success: false,
      status: 'failed',
      pending: false,
      error:
        providerMessage ||
        'Data purchase failed. Your wallet has been refunded.',
      reference,
      providerReference,
      transactionId,
      amount,
      balance:
        refundedBalance,
    });
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
      paymentPin?: unknown;
      pin?: unknown;
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
        body.paymentPin ??
        body.pin ??
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

    logger.info(
      {
        userId,
        network,
        phone,
        amount,
      },
      'Airtime purchase request received',
    );

    if (!network) {
      res.status(400).json({
        success: false,
        error: 'network is required.',
      });
      return;
    }

    if (!phone) {
      res.status(400).json({
        success: false,
        error: 'phone is required.',
      });
      return;
    }

    if (!/^0\d{10}$/.test(phone)) {
      res.status(400).json({
        success: false,
        error:
          'Invalid Nigerian phone number.',
      });
      return;
    }

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      res.status(400).json({
        success: false,
        error: 'Invalid airtime amount.',
      });
      return;
    }

    const pricing =
      await getPricingRule(
        'airtime',
        network,
      );

    if (!pricing) {
      res.status(400).json({
        success: false,
        error:
          'Airtime purchase is currently unavailable for this network.',
      });
      return;
    }

    const sellingPrice =
      safeNumber(
        pricing.selling_price,
      );

    const costPrice =
      safeNumber(
        pricing.cost_price,
      );

    const finalAmount =
      sellingPrice > 0
        ? sellingPrice
        : amount;

    if (
      !Number.isFinite(finalAmount) ||
      finalAmount <= 0
    ) {
      res.status(400).json({
        success: false,
        error:
          'Invalid airtime pricing configuration.',
      });
      return;
    }

    const idempotencyKey =
      String(
        body.idempotencyKey ?? '',
      ).trim();

    if (idempotencyKey) {
      try {
        const existing =
          await db.execute<{
            id: string;
            status: string;
            reference: string | null;
          }>(sql`
            SELECT
              id,
              status,
              reference
            FROM transactions
            WHERE user_id = ${userId}::uuid
              AND idempotency_key = ${idempotencyKey}
            LIMIT 1
          `);

        if (existing.rows.length > 0) {
          const transaction =
            existing.rows[0];

          res.json({
            success: true,
            status:
              transaction.status,
            pending:
              transaction.status ===
              'pending',
            transactionId:
              transaction.id,
            reference:
              transaction.reference,
          });

          return;
        }
      } catch (error) {
        logger.warn(
          {
            error,
            userId,
            idempotencyKey,
          },
          'Airtime idempotency lookup failed',
        );
      }
    }

    let balanceAfterDebit: number;

    try {
      balanceAfterDebit =
        await debitWallet(
          userId,
          finalAmount,
        );
    } catch (error) {
      const code =
        (error as Error & {
          code?: string;
        }).code;

      res.status(
        code === 'INSUFFICIENT'
          ? 400
          : 500,
      ).json({
        success: false,
        error:
          code === 'INSUFFICIENT'
            ? 'Insufficient wallet balance.'
            : 'Unable to debit wallet.',
        ...(code
          ? { code }
          : {}),
      });

      return;
    }

    const reference =
      `AIRTIME-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)
        .toUpperCase()}`;

    const transactionId =
      await createPurchaseTransaction(
        userId,
        'airtime',
        network,
        phone,
        finalAmount,
        costPrice,
        reference,
      );

    if (idempotencyKey) {
      try {
        await db.execute(sql`
          UPDATE transactions
          SET
            idempotency_key =
              ${idempotencyKey},
            updated_at = NOW()
          WHERE id =
            ${transactionId}::uuid
        `);
      } catch (error) {
        logger.warn(
          {
            error,
            transactionId,
            idempotencyKey,
          },
          'Failed to save airtime idempotency key',
        );
      }
    }

    await insertWalletLedger(
      userId,
      -finalAmount,
      'debit',
      reference,
      `Airtime purchase - ${network} ${phone}`,
    );

    let providerResult:
      | PurchaseResult
      | null = null;

    try {
      providerResult =
        (await purchaseAirtime({
          network,
          phone,
          amount: finalAmount,
          reference,
        })) as PurchaseResult;
    } catch (error) {
      logger.error(
        {
          error,
          userId,
          network,
          phone,
          amount: finalAmount,
          reference,
        },
        'Airtime provider request failed',
      );

      await refundWallet(
        userId,
        finalAmount,
      );

      await updatePurchaseTransaction(
        transactionId,
        'failed',
        reference,
        undefined,
        'Provider request failed.',
      );

      res.status(502).json({
        success: false,
        status: 'failed',
        error:
          'Airtime provider is unavailable. Your wallet has been refunded.',
        reference,
        transactionId,
      });

      return;
    }

    const providerReference =
      normalizeReference(
        providerResult,
      );

    const providerMessage =
      normalizeMessage(
        providerResult,
      );

    if (
      isSuccessfulProviderResult(
        providerResult,
      )
    ) {
      await updatePurchaseTransaction(
        transactionId,
        'success',
        reference,
        providerReference,
        providerMessage,
      );

      const cashback =
        calculateCashback(
          pricing,
          finalAmount,
        );

      if (cashback > 0) {
        await creditCashback(
          userId,
          cashback,
          reference,
        );
      }

      await notifyPurchase(
        userId,
        'Airtime purchase successful',
        `₦${finalAmount.toLocaleString()} airtime was sent to ${phone}.`,
      );

      res.json({
        success: true,
        status: 'success',
        pending: false,
        message:
          providerMessage ||
          'Airtime purchase successful.',
        reference,
        providerReference,
        transactionId,
        amount: finalAmount,
        balance:
          balanceAfterDebit,
        cashback:
          cashback > 0
            ? cashback
            : 0,
      });

      return;
    }

    if (
      isPendingProviderResult(
        providerResult,
      )
    ) {
      await updatePurchaseTransaction(
        transactionId,
        'pending',
        reference,
        providerReference,
        providerMessage,
      );

      await notifyPurchase(
        userId,
        'Airtime purchase pending',
        `Your airtime purchase to ${phone} is being processed.`,
      );

      res.json({
        success: true,
        status: 'pending',
        pending: true,
        message:
          providerMessage ||
          'Your airtime purchase is being processed.',
        reference,
        providerReference,
        transactionId,
        amount: finalAmount,
        balance:
          balanceAfterDebit,
      });

      return;
    }

    await updatePurchaseTransaction(
      transactionId,
      'failed',
      reference,
      providerReference,
      providerMessage,
    );

    const refundedBalance =
      await refundWallet(
        userId,
        finalAmount,
      );

    await insertWalletLedger(
      userId,
      finalAmount,
      'refund',
      reference,
      'Refund for failed airtime purchase',
    );

    await notifyPurchase(
      userId,
      'Airtime purchase failed',
      `Your airtime purchase to ${phone} failed. Your wallet has been refunded.`,
    );

    res.status(502).json({
      success: false,
      status: 'failed',
      pending: false,
      error:
        providerMessage ||
        'Airtime purchase failed. Your wallet has been refunded.',
      reference,
      providerReference,
      transactionId,
      amount: finalAmount,
      balance:
        refundedBalance,
    });
  },
);

/* =========================================================
   EXPORT
========================================================= */

export default router;
