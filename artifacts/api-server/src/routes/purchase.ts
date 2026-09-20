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

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error
  ) {
    return String(
      (error as { message?: unknown }).message ?? '',
    );
  }

  return String(error ?? 'Unknown error');
}

function normalizeNetwork(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase();
}

function normalizePhone(value: unknown): string {
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
    [
      'success',
      'successful',
      'completed',
      'complete',
      'delivered',
    ].includes(status)
  ) {
    return true;
  }

  if (
    [
      'failed',
      'failure',
      'error',
      'declined',
      'cancelled',
      'canceled',
    ].includes(status)
  ) {
    return false;
  }

  return result.success === true;
}

function isPendingProviderResult(
  result: PurchaseResult,
): boolean {
  return [
    'pending',
    'processing',
    'queued',
    'in_progress',
    'in-progress',
  ].includes(normalizeStatus(result));
}

function roundMoney(amount: number): number {
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
    String(rule.cashback_type)
      .toLowerCase() === 'percentage'
  ) {
    return roundMoney(
      sellingPrice * (value / 100),
    );
  }

  return roundMoney(value);
}

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

  if (!result.rows.length) {
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

  if (!result.rows.length) {
    const error = new Error(
      'Insufficient wallet balance.',
    );

    (
      error as Error & {
        code?: string;
      }
    ).code = 'INSUFFICIENT';

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

  if (!result.rows.length) {
    throw new Error(
      'Main wallet not found while refunding purchase.',
    );
  }

  return safeNumber(
    result.rows[0].balance,
  );
}

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
    SELECT purchase_pin_hash
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

    (
      error as Error & {
        code?: string;
      }
    ).code = 'INVALID_AMOUNT';

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

  if (!cashbackResult.rows.length) {
    const error = new Error(
      'Insufficient cashback balance.',
    );

    (
      error as Error & {
        code?: string;
      }
    ).code = 'INSUFFICIENT';

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

  if (!mainResult.rows.length) {
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

    (
      error as Error & {
        code?: string;
      }
    ).code = 'WALLET_NOT_FOUND';

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
        error: errorMessage(error),
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

async function getPricingRule(
  serviceType: string,
  network: string,
  planId?: string,
  planName?: string,
): Promise<PricingRule | null> {
  const normalizedService =
    serviceType.trim().toLowerCase();

  const normalizedNetwork =
    normalizeNetwork(network);

  if (planId) {
    const result =
      await db.execute<PricingRule>(sql`
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
        WHERE LOWER(service_type) =
          ${normalizedService}
          AND UPPER(network) =
          ${normalizedNetwork}
          AND (
            LOWER(TRIM(plan_id)) =
              LOWER(TRIM(${planId}))
            OR (
              ${planName ?? ''} <> ''
              AND LOWER(TRIM(plan_name)) =
                LOWER(TRIM(${planName ?? ''}))
            )
          )
          AND enabled = true
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 1
      `);

    if (result.rows.length) {
      return result.rows[0];
    }
  }

  const result =
    await db.execute<PricingRule>(sql`
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
      WHERE LOWER(service_type) =
        ${normalizedService}
        AND UPPER(network) =
        ${normalizedNetwork}
        AND enabled = true
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 1
    `);

  return result.rows[0] ?? null;
}

async function createPurchaseTransaction(
  userId: string,
  service: 'data' | 'airtime',
  provider: string,
  network: string,
  phone: string,
  amount: number,
  costPrice: number,
  reference: string,
  metadata: Record<string, unknown> = {},
): Promise<string> {
  const transactionMetadata = {
    ...metadata,
    network,
    phone,
    costPrice,
  };

  const safeProvider =
    String(provider || 'SMEAPI').trim() ||
    'SMEAPI';

  try {
    const result = await db.execute<{
      id: string;
    }>(sql`
      INSERT INTO transactions (
        user_id,
        type,
        service,
        provider,
        amount,
        cost_price,
        status,
        reference,
        description,
        metadata
      )
      VALUES (
        ${userId}::uuid,
        ${service},
        ${service},
        ${safeProvider},
        ${amount},
        ${costPrice},
        'pending',
        ${reference},
        ${
          `${
            service === 'data'
              ? 'Data'
              : 'Airtime'
          } purchase - ${network} ${phone}`
        },
        ${JSON.stringify(
          transactionMetadata,
        )}::jsonb
      )
      RETURNING id
    `);

    const id = result.rows[0]?.id;

    if (!id) {
      throw new Error(
        'Transaction was inserted but no transaction ID was returned.',
      );
    }

    return id;
  } catch (error) {
    logger.error(
      {
        error: errorMessage(error),
        userId,
        service,
        provider: safeProvider,
        network,
        phone,
        amount,
        costPrice,
        reference,
      },
      'CREATE PURCHASE TRANSACTION FAILED',
    );

    throw error;
  }
}

async function updatePurchaseTransaction(
  transactionId: string,
  status:
    | 'success'
    | 'pending'
    | 'failed',
  reference: string,
  providerReference?: string,
  message?: string,
): Promise<void> {
  const providerMetadata = {
    ...(providerReference
      ? { providerReference }
      : {}),
    ...(message
      ? { providerMessage: message }
      : {}),
  };

  await db.execute(sql`
    UPDATE transactions
    SET
      status = ${status},
      reference = ${reference},
      provider_reference =
        ${providerReference || null},
      metadata =
        COALESCE(metadata, '{}'::jsonb) ||
        ${JSON.stringify(
          providerMetadata,
        )}::jsonb,
      updated_at = NOW()
    WHERE id = ${transactionId}::uuid
  `);
}

async function insertWalletLedger(
  userId: string,
  amount: number,
  type: string,
  reference: string,
  description: string,
  transactionId?: string,
): Promise<void> {
  try {
    const wallet = await getMainWallet(
      userId,
    );

    if (!wallet) {
      logger.error(
        {
          userId,
          amount,
          type,
          reference,
        },
        'Wallet ledger skipped because wallet was not found',
      );
      return;
    }

    const balanceAfter =
      wallet.balance;

    const balanceBefore =
      type === 'debit'
        ? roundMoney(
            balanceAfter + Math.abs(amount),
          )
        : roundMoney(
            balanceAfter - Math.abs(amount),
          );

    await db.execute(sql`
      INSERT INTO wallet_ledger (
        user_id,
        wallet_id,
        type,
        amount,
        balance_before,
        balance_after,
        reference,
        related_transaction_id,
        reason,
        created_at
      )
      VALUES (
        ${userId}::uuid,
        ${wallet.id}::uuid,
        ${type},
        ${Math.abs(amount)},
        ${balanceBefore},
        ${balanceAfter},
        ${reference},
        ${
          transactionId
            ? sql`${transactionId}::uuid`
            : sql`NULL`
        },
        ${description},
        NOW()
      )
    `);
  } catch (error) {
    logger.error(
      {
        error: errorMessage(error),
        userId,
        amount,
        type,
        reference,
        transactionId,
      },
      'Failed to insert wallet ledger',
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
        cashback_wallets.balance +
        ${amount},
      updated_at = NOW()
  `);

  try {
    await db.execute(sql`
      INSERT INTO cashback_transactions (
        user_id,
        amount,
        type,
        reference,
        created_at
      )
      VALUES (
        ${userId}::uuid,
        ${amount},
        'credit',
        ${reference},
        NOW()
      )
    `);
  } catch (error) {
    logger.error(
      {
        error: errorMessage(error),
        userId,
        amount,
        reference,
      },
      'Failed to create cashback transaction',
    );
  }
}

async function notifyPurchase(
  userId: string,
  title: string,
  message: string,
  transactionId?: string,
): Promise<void> {
  try {
    await createNotification(
      userId,
      {
        type: 'transaction',
        title,
        body: message,
        refId: transactionId ?? null,
      },
    );
  } catch (error) {
    logger.error(
      {
        error: errorMessage(error),
        userId,
      },
      'Failed to create purchase notification',
    );
  }

  try {
    const io = getIo();

    io.to(`user:${userId}`).emit(
      'notification',
      {
        title,
        message,
        transactionId,
      },
    );
  } catch (error) {
    logger.error(
      {
        error: errorMessage(error),
        userId,
      },
      'Failed to emit purchase notification',
    );
  }
}

async function refundPurchase(
  userId: string,
  amount: number,
  reference: string,
  transactionId?: string,
  serviceName = 'purchase',
): Promise<number> {
  const refundedBalance =
    await refundWallet(
      userId,
      amount,
    );

  await insertWalletLedger(
    userId,
    amount,
    'reversal',
    reference,
    `Refund for failed ${serviceName}`,
    transactionId,
  );

  return refundedBalance;
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
    const userId =
      req.session.userId!;

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

    const network =
      normalizeNetwork(
        body.network,
      );

    const phone =
      normalizePhone(body.phone);

    const planCode =
      String(
        body.planCode ??
          body.dataPlan ??
          body.DataPlan ??
          '',
      ).trim();

    const planName =
      String(
        body.planName ??
          body.DataPlanName ??
          '',
      ).trim();

    const requestedPrice =
      safeNumber(
        body.planPrice ??
          body.amount ??
          body.Price,
      );

    const purchasePin =
      String(
        body.purchasePin ?? '',
      ).trim();

    const pinCheck =
      await verifyPurchasePin(
        userId,
        purchasePin,
      );

    if (!pinCheck.ok) {
      res.status(
        pinCheck.status,
      ).json({
        success: false,
        error: pinCheck.error,
        ...(pinCheck.code
          ? {
              code: pinCheck.code,
            }
          : {}),
      });
      return;
    }

    if (!network) {
      res.status(400).json({
        success: false,
        error:
          'network is required.',
      });
      return;
    }

    if (!phone) {
      res.status(400).json({
        success: false,
        error:
          'phone is required.',
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
        error:
          'Data plan is required.',
      });
      return;
    }

    if (
      !Number.isFinite(
        requestedPrice,
      ) ||
      requestedPrice <= 0
    ) {
      res.status(400).json({
        success: false,
        error:
          'Invalid data plan price.',
      });
      return;
    }

    let pricing: PricingRule | null;

    try {
      pricing =
        await getPricingRule(
          'data',
          network,
          planCode,
          planName,
        );
    } catch (error) {
      logger.error(
        {
          error: errorMessage(error),
          userId,
          network,
          planCode,
        },
        'Failed to load data pricing rule',
      );

      res.status(500).json({
        success: false,
        error:
          'Unable to load data pricing.',
      });
      return;
    }

    if (!pricing) {
      res.status(400).json({
        success: false,
        error:
          'Data purchase is currently unavailable for this network or plan.',
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

    const amount =
      sellingPrice > 0
        ? sellingPrice
        : requestedPrice;

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      res.status(400).json({
        success: false,
        error:
          'Invalid data pricing configuration.',
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
            WHERE user_id =
              ${userId}::uuid
              AND metadata->>
                'idempotencyKey' =
                ${idempotencyKey}
            LIMIT 1
          `);

        if (existing.rows.length) {
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
            error: errorMessage(error),
            userId,
            idempotencyKey,
          },
          'Data idempotency lookup failed',
        );
      }
    }

    let balanceAfterDebit: number;

    try {
      balanceAfterDebit =
        await debitWallet(
          userId,
          amount,
        );
    } catch (error) {
      const code =
        (
          error as Error & {
            code?: string;
          }
        ).code;

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

    let transactionId: string;

    try {
      transactionId =
        await createPurchaseTransaction(
          userId,
          'data',
          pricing.provider,
          network,
          phone,
          amount,
          costPrice,
          reference,
          {
            idempotencyKey:
              idempotencyKey ||
              null,
            planCode,
            planName,
            requestedPrice,
          },
        );
    } catch (error) {
      logger.error(
        {
          error: errorMessage(error),
          userId,
          network,
          phone,
          planCode,
          planName,
          amount,
          costPrice,
          provider:
            pricing.provider,
          reference,
        },
        'DATA PURCHASE TRANSACTION CREATION FAILED',
      );

      try {
        const refundedBalance =
          await refundPurchase(
            userId,
            amount,
            reference,
            undefined,
            'data purchase',
          );

        res.status(500).json({
          success: false,
          error:
            'Unable to create purchase transaction. Your wallet has been refunded.',
          balance:
            refundedBalance,
        });
      } catch (refundError) {
        logger.error(
          {
            error:
              errorMessage(
                refundError,
              ),
            userId,
            amount,
            reference,
          },
          'CRITICAL: DATA PURCHASE REFUND FAILED',
        );

        res.status(500).json({
          success: false,
          error:
            'Unable to create purchase transaction and wallet refund also failed. Please contact support.',
        });
      }

      return;
    }

    await insertWalletLedger(
      userId,
      amount,
      'debit',
      reference,
      `Data purchase - ${network} ${phone}`,
      transactionId,
    );

    let providerResult:
      | PurchaseResult
      | null = null;

    try {
      providerResult =
        (await purchaseData({
          network,
          phone,
          dataPlan: planCode,
          reference,
        })) as PurchaseResult;
    } catch (error) {
      logger.error(
        {
          error: errorMessage(error),
          userId,
          network,
          phone,
          planCode,
          amount,
          reference,
        },
        'Data provider request failed',
      );

      try {
        const refundedBalance =
          await refundPurchase(
            userId,
            amount,
            reference,
            transactionId,
            'data purchase',
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
            'Data provider is unavailable. Your wallet has been refunded.',
          reference,
          transactionId,
          balance:
            refundedBalance,
        });
      } catch (refundError) {
        logger.error(
          {
            error:
              errorMessage(
                refundError,
              ),
            userId,
            reference,
            transactionId,
          },
          'CRITICAL: DATA PROVIDER REFUND FAILED',
        );

        res.status(500).json({
          success: false,
          error:
            'Provider request failed and wallet refund could not be completed. Please contact support.',
          reference,
          transactionId,
        });
      }

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
        `${
          planName ||
          planCode
        } was successfully sent to ${phone}.`,
        transactionId,
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
        `Your data purchase for ${phone} is being processed.`,
        transactionId,
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

    let refundedBalance: number;

    try {
      refundedBalance =
        await refundPurchase(
          userId,
          amount,
          reference,
          transactionId,
          'data purchase',
        );
    } catch (error) {
      logger.error(
        {
          error: errorMessage(error),
          userId,
          amount,
          reference,
          transactionId,
        },
        'CRITICAL: DATA FAILED PURCHASE REFUND FAILED',
      );

      await updatePurchaseTransaction(
        transactionId,
        'failed',
        reference,
        providerReference,
        providerMessage ||
          'Provider rejected the purchase.',
      );

      res.status(500).json({
        success: false,
        status: 'failed',
        error:
          'Data purchase failed and wallet refund could not be completed. Please contact support.',
        reference,
        transactionId,
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

    await notifyPurchase(
      userId,
      'Data purchase failed',
      `Your data purchase for ${phone} failed. Your wallet has been refunded.`,
      transactionId,
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
    const userId =
      req.session.userId!;

    const body = (req.body ?? {}) as {
      network?: unknown;
      phone?: unknown;
      amount?: unknown;
      idempotencyKey?: unknown;
      purchasePin?: unknown;
    };

    const network =
      normalizeNetwork(
        body.network,
      );

    const phone =
      normalizePhone(body.phone);

    const amount =
      safeNumber(body.amount);

    const purchasePin =
      String(
        body.purchasePin ?? '',
      ).trim();

    const pinCheck =
      await verifyPurchasePin(
        userId,
        purchasePin,
      );

    if (!pinCheck.ok) {
      res.status(
        pinCheck.status,
      ).json({
        success: false,
        error: pinCheck.error,
        ...(pinCheck.code
          ? {
              code: pinCheck.code,
            }
          : {}),
      });
      return;
    }

    if (!network) {
      res.status(400).json({
        success: false,
        error:
          'network is required.',
      });
      return;
    }

    if (!phone) {
      res.status(400).json({
        success: false,
        error:
          'phone is required.',
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
        error:
          'Invalid airtime amount.',
      });
      return;
    }

    let pricing: PricingRule | null;

    try {
      pricing =
        await getPricingRule(
          'airtime',
          network,
        );
    } catch (error) {
      logger.error(
        {
          error: errorMessage(error),
          userId,
          network,
        },
        'Failed to load airtime pricing rule',
      );

      res.status(500).json({
        success: false,
        error:
          'Unable to load airtime pricing.',
      });
      return;
    }

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
      !Number.isFinite(
        finalAmount,
      ) ||
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
            WHERE user_id =
              ${userId}::uuid
              AND metadata->>
                'idempotencyKey' =
                ${idempotencyKey}
            LIMIT 1
          `);

        if (existing.rows.length) {
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
            error: errorMessage(error),
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
        (
          error as Error & {
            code?: string;
          }
        ).code;

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

    let transactionId: string;

    try {
      transactionId =
        await createPurchaseTransaction(
          userId,
          'airtime',
          pricing.provider,
          network,
          phone,
          finalAmount,
          costPrice,
          reference,
          {
            idempotencyKey:
              idempotencyKey ||
              null,
            requestedAmount:
              amount,
          },
        );
    } catch (error) {
      logger.error(
        {
          error: errorMessage(error),
          userId,
          network,
          phone,
          amount: finalAmount,
          costPrice,
          provider:
            pricing.provider,
          reference,
        },
        'AIRTIME PURCHASE TRANSACTION CREATION FAILED',
      );

      try {
        const refundedBalance =
          await refundPurchase(
            userId,
            finalAmount,
            reference,
            undefined,
            'airtime purchase',
          );

        res.status(500).json({
          success: false,
          error:
            'Unable to create purchase transaction. Your wallet has been refunded.',
          balance:
            refundedBalance,
        });
      } catch (refundError) {
        logger.error(
          {
            error:
              errorMessage(
                refundError,
              ),
            userId,
            amount: finalAmount,
            reference,
          },
          'CRITICAL: AIRTIME PURCHASE REFUND FAILED',
        );

        res.status(500).json({
          success: false,
          error:
            'Unable to create purchase transaction and wallet refund also failed. Please contact support.',
        });
      }

      return;
    }

    await insertWalletLedger(
      userId,
      finalAmount,
      'debit',
      reference,
      `Airtime purchase - ${network} ${phone}`,
      transactionId,
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
          error: errorMessage(error),
          userId,
          network,
          phone,
          amount: finalAmount,
          reference,
        },
        'Airtime provider request failed',
      );

      try {
        const refundedBalance =
          await refundPurchase(
            userId,
            finalAmount,
            reference,
            transactionId,
            'airtime purchase',
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
          balance:
            refundedBalance,
        });
      } catch (refundError) {
        logger.error(
          {
            error:
              errorMessage(
                refundError,
              ),
            userId,
            reference,
            transactionId,
          },
          'CRITICAL: AIRTIME PROVIDER REFUND FAILED',
        );

        res.status(500).json({
          success: false,
          error:
            'Provider request failed and wallet refund could not be completed. Please contact support.',
          reference,
          transactionId,
        });
      }

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
        transactionId,
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
        transactionId,
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

    let refundedBalance: number;

    try {
      refundedBalance =
        await refundPurchase(
          userId,
          finalAmount,
          reference,
          transactionId,
          'airtime purchase',
        );
    } catch (error) {
      logger.error(
        {
          error: errorMessage(error),
          userId,
          amount: finalAmount,
          reference,
          transactionId,
        },
        'CRITICAL: AIRTIME FAILED PURCHASE REFUND FAILED',
      );

      await updatePurchaseTransaction(
        transactionId,
        'failed',
        reference,
        providerReference,
        providerMessage,
      );

      res.status(500).json({
        success: false,
        status: 'failed',
        error:
          'Airtime purchase failed and wallet refund could not be completed. Please contact support.',
        reference,
        transactionId,
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

    await notifyPurchase(
      userId,
      'Airtime purchase failed',
      `Your airtime purchase to ${phone} failed. Your wallet has been refunded.`,
      transactionId,
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

export default router;
