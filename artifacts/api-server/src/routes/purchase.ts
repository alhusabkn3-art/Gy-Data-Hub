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

function normalizeNetwork(value: unknown): string {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase();

  switch (raw) {
    case '1':
    case 'mtn':
      return 'mtn';

    case '2':
    case 'glo':
      return 'glo';

    case '3':
    case '9mobile':
    case 'etisalat':
      return '9mobile';

    case '4':
    case 'airtel':
      return 'airtel';

    default:
      return raw;
  }
}

function normalizePhone(value: unknown): string {
  let phone = String(value ?? '')
    .trim()
    .replace(/[()\-\s]/g, '');

  if (phone.startsWith('+234')) {
    phone = `0${phone.slice(4)}`;
  } else if (phone.startsWith('234')) {
    phone = `0${phone.slice(3)}`;
  }

  return phone;
}

function validNigerianPhone(phone: string): boolean {
  return /^0(?:70|71|80|81|90|91)[0-9]{8}$/.test(phone);
}

function makeReference(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)
    .toUpperCase()}`;
}

function getIdempotencyKey(req: Request): string | null {
  const value =
    req.get('Idempotency-Key') ??
    req.get('X-Idempotency-Key') ??
    req.body?.idempotencyKey;

  if (value === undefined || value === null) {
    return null;
  }

  const key = String(value).trim();

  return key ? key.slice(0, 255) : null;
}

/* =========================================================
   PROVIDER RESPONSE HELPERS
========================================================= */

function providerStatus(result: PurchaseResult): string {
  return String(
    result.status ??
      result.data?.status ??
      '',
  )
    .trim()
    .toLowerCase();
}

function providerSucceeded(result: PurchaseResult): boolean {
  const status = providerStatus(result);

  if (
    [
      'failed',
      'failure',
      'error',
      'rejected',
      'cancelled',
      'canceled',
    ].includes(status)
  ) {
    return false;
  }

  if (result.success === true) {
    return true;
  }

  return [
    'success',
    'successful',
    'completed',
    'complete',
    'delivered',
    'approved',
  ].includes(status);
}

function providerPending(result: PurchaseResult): boolean {
  return [
    'pending',
    'processing',
    'queued',
    'initiated',
    'in_progress',
    'in progress',
  ].includes(providerStatus(result));
}

function getProviderReference(
  result: PurchaseResult,
): string | null {
  const reference =
    result.reference ??
    result.ref ??
    result.providerReference ??
    result.transactionId ??
    result.data?.reference;

  return reference
    ? String(reference)
    : null;
}

function getProviderMessage(
  result: PurchaseResult,
): string {
  return String(
    result.message ??
      result.error ??
      result.provider_message ??
      result.data?.message ??
      'Provider response received.',
  );
}

/* =========================================================
   PRICING
========================================================= */

async function findDataPricingRule(
  network: string,
  planCode: string,
  planName: string,
): Promise<PricingRule | null> {
  const exact =
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
        COALESCE(
          cashback_enabled,
          false
        ) AS cashback_enabled,
        COALESCE(
          cashback_type,
          'percentage'
        ) AS cashback_type,
        COALESCE(
          cashback_value,
          0
        ) AS cashback_value
      FROM pricing_rules
      WHERE service_type = 'data'
        AND enabled = true
        AND LOWER(
          COALESCE(network, '')
        ) = ${network}
        AND LOWER(
          COALESCE(plan_id, '')
        ) = ${planCode.toLowerCase()}
      ORDER BY updated_at DESC
      LIMIT 1
    `);

  if (exact.rows.length > 0) {
    return exact.rows[0];
  }

  if (!planName) {
    return null;
  }

  const fallback =
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
        COALESCE(
          cashback_enabled,
          false
        ) AS cashback_enabled,
        COALESCE(
          cashback_type,
          'percentage'
        ) AS cashback_type,
        COALESCE(
          cashback_value,
          0
        ) AS cashback_value
      FROM pricing_rules
      WHERE service_type = 'data'
        AND enabled = true
        AND LOWER(
          COALESCE(network, '')
        ) = ${network}
        AND LOWER(
          COALESCE(plan_name, '')
        ) = ${planName.toLowerCase()}
      ORDER BY updated_at DESC
      LIMIT 1
    `);

  return fallback.rows[0] ?? null;
}

async function findAirtimePricingRule(
  network: string,
): Promise<PricingRule | null> {
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
        COALESCE(
          cashback_enabled,
          false
        ) AS cashback_enabled,
        COALESCE(
          cashback_type,
          'percentage'
        ) AS cashback_type,
        COALESCE(
          cashback_value,
          0
        ) AS cashback_value
      FROM pricing_rules
      WHERE service_type = 'airtime'
        AND enabled = true
        AND LOWER(
          COALESCE(network, '')
        ) = ${network}
      ORDER BY updated_at DESC
      LIMIT 1
    `);

  return result.rows[0] ?? null;
}

/* =========================================================
   CASHBACK
========================================================= */

function calculateCashback(
  amount: number,
  rule: PricingRule | null,
): number {
  if (!rule?.cashback_enabled) {
    return 0;
  }

  const value = safeNumber(
    rule.cashback_value,
  );

  if (value <= 0) {
    return 0;
  }

  const type = String(
    rule.cashback_type ?? '',
  )
    .trim()
    .toLowerCase();

  if (
    type === 'percentage' ||
    type === 'percent'
  ) {
    return Math.round(
      ((amount * value) / 100) * 100,
    ) / 100;
  }

  return Math.min(
    value,
    amount,
  );
}

async function creditCashback(
  userId: string,
  transactionId: string,
  amount: number,
  rule: PricingRule,
  network: string,
  planId: string | null,
  planName: string | null,
): Promise<number> {
  if (amount <= 0) {
    return 0;
  }

  const wallet =
    await db.execute<{
      balance: string;
    }>(sql`
      SELECT balance
      FROM cashback_wallets
      WHERE user_id = ${userId}::uuid
      FOR UPDATE
    `);

  if (wallet.rows.length === 0) {
    await db.execute(sql`
      INSERT INTO cashback_wallets (
        user_id,
        balance
      )
      VALUES (
        ${userId}::uuid,
        ${amount}
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        balance =
          cashback_wallets.balance +
          EXCLUDED.balance,
        updated_at = NOW()
    `);
  } else {
    await db.execute(sql`
      UPDATE cashback_wallets
      SET
        balance =
          balance + ${amount},
        updated_at = NOW()
      WHERE user_id =
        ${userId}::uuid
    `);
  }

  await db.execute(sql`
    INSERT INTO cashback_transactions (
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
    VALUES (
      ${userId}::uuid,
      ${transactionId}::uuid,
      ${amount},
      ${
        rule.cashback_type ||
        'percentage'
      },
      ${safeNumber(
        rule.cashback_value,
      )},
      ${network},
      ${planId},
      ${planName},
      ${makeReference('CB')}
    )
    ON CONFLICT (source_txn_id)
    DO NOTHING
  `);

  const updated =
    await db.execute<{
      balance: string;
    }>(sql`
      SELECT balance
      FROM cashback_wallets
      WHERE user_id =
        ${userId}::uuid
      LIMIT 1
    `);

  return safeNumber(
    updated.rows[0]?.balance,
  );
}

/* =========================================================
   WALLET
========================================================= */

async function getMainWallet(
  userId: string,
): Promise<{
  id: string;
  balance: number;
} | null> {
  const result =
    await db.execute<{
      id: string;
      balance: string;
    }>(sql`
      SELECT
        id,
        balance
      FROM wallets
      WHERE user_id =
        ${userId}::uuid
      LIMIT 1
    `);

  const row =
    result.rows[0];

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    balance: safeNumber(
      row.balance,
    ),
  };
}

async function debitWallet(
  userId: string,
  amount: number,
): Promise<number> {
  const result =
    await db.execute<{
      balance: string;
    }>(sql`
      UPDATE wallets
      SET
        balance =
          balance - ${amount},
        updated_at = NOW()
      WHERE user_id =
        ${userId}::uuid
        AND balance >= ${amount}
      RETURNING balance
    `);

  if (
    result.rows.length === 0
  ) {
    const error =
      new Error(
        'Insufficient wallet balance.',
      );

    (
      error as Error & {
        code?: string;
      }
    ).code =
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
      await getMainWallet(
        userId,
      );

    return wallet?.balance ?? 0;
  }

  const result =
    await db.execute<{
      balance: string;
    }>(sql`
      UPDATE wallets
      SET
        balance =
          balance + ${amount},
        updated_at = NOW()
      WHERE user_id =
        ${userId}::uuid
      RETURNING balance
    `);

  return safeNumber(
    result.rows[0]?.balance,
  );
}

/* =========================================================
   TRANSACTION HELPERS
========================================================= */

async function findTransactionByIdempotency(
  userId: string,
  key: string,
): Promise<Record<string, unknown> | null> {
  const result =
    await db.execute(sql`
      SELECT *
      FROM transactions
      WHERE user_id =
        ${userId}::uuid
        AND metadata ->>
          'idempotencyKey' =
          ${key}
      ORDER BY created_at DESC
      LIMIT 1
    `);

  return (
    (result.rows[0] as Record<
      string,
      unknown
    >) ?? null
  );
}

async function createTransaction(params: {
  userId: string;
  type:
    | 'data'
    | 'airtime';
  service: string;
  provider: string;
  amount: number;
  status:
    | 'success'
    | 'pending'
    | 'failed';
  reference: string;
  description: string;
  metadata: Record<
    string,
    unknown
  >;
}): Promise<
  Record<string, unknown>
> {
  const result =
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
        payment_method,
        metadata
      )
      VALUES (
        ${params.userId}::uuid,
        ${params.type},
        ${params.service},
        ${params.provider},
        ${params.amount},
        ${params.status},
        ${params.reference},
        ${params.description},
        'wallet',
        ${
          JSON.stringify(
            params.metadata,
          )
        }::jsonb
      )
      RETURNING *
    `);

  return result.rows[0] as Record<
    string,
    unknown
  >;
}

async function updateTransaction(
  reference: string,
  status:
    | 'success'
    | 'pending'
    | 'failed',
  description?: string,
): Promise<void> {
  if (description) {
    await db.execute(sql`
      UPDATE transactions
      SET
        status = ${status},
        description =
          ${description}
      WHERE reference =
        ${reference}
    `);
  } else {
    await db.execute(sql`
      UPDATE transactions
      SET status = ${status}
      WHERE reference =
        ${reference}
    `);
  }
}

/* =========================================================
   NOTIFICATION
========================================================= */

async function notifyUser(
  userId: string,
  title: string,
  body: string,
): Promise<void> {
  try {
    await createNotification(
      userId,
      {
        type: 'transaction',
        title,
        body,
      },
    );
  } catch (error) {
    logger.warn(
      {
        error,
        userId,
      },
      'Purchase notification failed',
    );
  }

  try {
    const io = getIo();

    io.to(
      `user:${userId}`,
    ).emit(
      'wallet:updated',
      {},
    );

    io.to(
      `user:${userId}`,
    ).emit(
      'wallet:update',
      {},
    );

    io.to(
      `user:${userId}`,
    ).emit(
      'transaction:update',
      {},
    );

    io.to(
      `user:${userId}`,
    ).emit(
      'notification',
      {
        title,
        message: body,
      },
    );
  } catch (error) {
    logger.warn(
      { error, userId },
      'Purchase socket notification failed',
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
    const userId =
      req.session.userId!;

    const body =
      (req.body ?? {}) as {
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

    const network =
      normalizeNetwork(
        body.network,
      );

    const phone =
      normalizePhone(
        body.phone,
      );

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

    const rawPrice =
      body.planPrice ??
      body.amount ??
      body.Price;

    const requestedPrice =
      safeNumber(
        rawPrice,
      );

    const purchasePin =
      String(
        body.purchasePin ??
          body.paymentPin ??
          body.pin ??
          '',
      ).trim();

    /*
     * Purchase PIN must be exactly
     * 6 digits.
     */
    if (
      !/^\d{6}$/.test(
        purchasePin,
      )
    ) {
      res.status(400).json({
        success: false,
        error:
          'Purchase PIN is required.',
        code:
          'PURCHASE_PIN_REQUIRED',
      });
      return;
    }

    /*
     * Read ONLY purchase_pin_hash.
     * Login PIN is deliberately not
     * selected and cannot be used as
     * a fallback.
     */
    const pinRows =
      await db.execute<{
        purchase_pin_hash:
          | string
          | null;
      }>(sql`
        SELECT
          purchase_pin_hash
        FROM users
        WHERE id =
          ${userId}::uuid
        LIMIT 1
      `);

    const pinUser =
      pinRows.rows[0];

    if (!pinUser) {
      res.status(401).json({
        success: false,
        error:
          'User account not found.',
      });
      return;
    }

    if (
      !pinUser.purchase_pin_hash
    ) {
      res.status(400).json({
        success: false,
        error:
          'Purchase PIN is not configured. Please set a Purchase PIN before buying.',
        code:
          'PURCHASE_PIN_NOT_CONFIGURED',
      });
      return;
    }

    const pinValid =
      await verifyPin(
        purchasePin,
        pinUser.purchase_pin_hash,
      );

    if (!pinValid) {
      res.status(401).json({
        success: false,
        error:
          'Incorrect purchase PIN.',
        code:
          'INVALID_PURCHASE_PIN',
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

    if (!planCode) {
      res.status(400).json({
        success: false,
        error:
          'planCode is required.',
      });
      return;
    }

    if (
      ![
        'mtn',
        'glo',
        '9mobile',
        'airtel',
      ].includes(network)
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
        phone,
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
      if (idempotencyKey) {
        const existing =
          await findTransactionByIdempotency(
            userId,
            idempotencyKey,
          );

        if (existing) {
          res.status(200).json({
            success: true,
            duplicate: true,
            transaction:
              existing,
            reference:
              existing.reference,
            status:
              existing.status,
          });
          return;
        }
      }

      const pricingRule =
        await findDataPricingRule(
          network,
          planCode,
          planName,
        );

      if (!pricingRule) {
        res.status(404).json({
          success: false,
          error:
            'This data plan is not configured for sale yet.',
          code:
            'PLAN_NOT_CONFIGURED',
          network,
          planCode,
          planName,
        });
        return;
      }

      const provider =
        String(
          pricingRule.provider ?? '',
        )
          .trim()
          .toLowerCase();

      if (
        provider !== 'smeapi'
      ) {
        res.status(400).json({
          success: false,
          error:
            'This data plan is not configured for SME API.',
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
            'Data plan selling price is not configured.',
        });
        return;
      }

      if (
        Math.abs(
          requestedPrice -
            sellingPrice,
        ) > 0.01
      ) {
        res.status(400).json({
          success: false,
          error:
            'The selected data plan price has changed. Please refresh the plans and try again.',
          code:
            'PRICE_CHANGED',
          expectedPrice:
            sellingPrice,
        });
        return;
      }

      const wallet =
        await getMainWallet(
          userId,
        );

      if (!wallet) {
        res.status(400).json({
          success: false,
          error:
            'Wallet not found.',
        });
        return;
      }

      if (
        wallet.balance <
        sellingPrice
      ) {
        res.status(400).json({
          success: false,
          error:
            'Insufficient wallet balance.',
          balance:
            wallet.balance,
          required:
            sellingPrice,
        });
        return;
      }

      const newBalance =
        await debitWallet(
          userId,
          sellingPrice,
        );

      const reference =
        makeReference(
          'DATA',
        );

      const transaction =
        await createTransaction({
          userId,
          type: 'data',
          service: 'data',
          provider: 'smeapi',
          amount:
            sellingPrice,
          status: 'pending',
          reference,
          description:
            planName ||
            `Data purchase ${planCode}`,
          metadata: {
            network,
            phone,
            planCode:
              pricingRule.plan_id ||
              planCode,
            planName:
              pricingRule.plan_name ||
              planName,
            idempotencyKey,
          },
        });

      let providerResult:
        PurchaseResult;

      try {
        providerResult =
          (await purchaseData({
            network,
            phone,
            dataPlan:
              pricingRule.plan_id ||
              planCode,
            reference,
          })) as PurchaseResult;
      } catch (providerError) {
        logger.error(
          {
            providerError,
            reference,
            userId,
            network,
            phone,
            planCode,
          },
          'SME API data purchase failed',
        );

        const refundedBalance =
          await refundWallet(
            userId,
            sellingPrice,
          );

        await updateTransaction(
          reference,
          'failed',
          'Data provider request failed. Wallet refunded.',
        );

        await notifyUser(
          userId,
          'Data purchase failed',
          `Your ₦${sellingPrice.toLocaleString(
            'en-NG',
          )} data purchase failed. Your wallet has been refunded.`,
        );

        res.status(502).json({
          success: false,
          status: 'failed',
          reference,
          error:
            'Data provider request failed. Your wallet has been refunded.',
          balance:
            refundedBalance,
        });
        return;
      }

      const providerReference =
        getProviderReference(
          providerResult,
        );

      const providerMessage =
        getProviderMessage(
          providerResult,
        );

      if (
        providerSucceeded(
          providerResult,
        )
      ) {
        await updateTransaction(
          reference,
          'success',
          providerMessage,
        );

        const cashback =
          calculateCashback(
            sellingPrice,
            pricingRule,
          );

        let cashbackBalance = 0;

        if (
          cashback > 0
        ) {
          cashbackBalance =
            await creditCashback(
              userId,
              String(
                transaction.id,
              ),
              cashback,
              pricingRule,
              network,
              pricingRule.plan_id ||
                planCode,
              pricingRule.plan_name ||
                planName,
            );
        }

        await notifyUser(
          userId,
          'Data purchase successful',
          `${
            planName ||
            'Data bundle'
          } has been purchased successfully for ${phone}.`,
        );

        res.status(200).json({
          success: true,
          status: 'success',
          reference,
          providerReference,
          message:
            providerMessage ||
            'Data purchase successful.',
          transaction,
          amount:
            sellingPrice,
          balance:
            newBalance,
          cashback,
          cashbackBalance,
        });
        return;
      }

      if (
        providerPending(
          providerResult,
        )
      ) {
        await updateTransaction(
          reference,
          'pending',
          providerMessage ||
            'Data purchase is being processed.',
        );

        await notifyUser(
          userId,
          'Data purchase processing',
          `Your ${
            planName ||
            'data purchase'
          } for ${phone} is being processed.`,
        );

        res.status(202).json({
          success: true,
          status: 'pending',
          reference,
          providerReference,
          message:
            providerMessage ||
            'Data purchase is being processed.',
          transaction,
          amount:
            sellingPrice,
          balance:
            newBalance,
        });
        return;
      }

      const refundedBalance =
        await refundWallet(
          userId,
          sellingPrice,
        );

      await updateTransaction(
        reference,
        'failed',
        `${providerMessage}. Wallet refunded.`,
      );

      await notifyUser(
        userId,
        'Data purchase failed',
        `Your ₦${sellingPrice.toLocaleString(
          'en-NG',
        )} data purchase failed. Your wallet has been refunded.`,
      );

      res.status(400).json({
        success: false,
        status: 'failed',
        reference,
        providerReference,
        error:
          providerMessage ||
          'Data purchase failed. Wallet refunded.',
        balance:
          refundedBalance,
      });
    } catch (error) {
      const e =
        error as {
          code?: string;
          message?: string;
        };

      if (
        e.code === 'INSUFFICIENT'
      ) {
        res.status(400).json({
          success: false,
          error:
            'Insufficient wallet balance.',
        });
        return;
      }

      logger.error(
        {
          error,
          userId,
          network,
          phone,
          planCode,
        },
        'Unexpected data purchase error',
      );

      res.status(500).json({
        success: false,
        error:
          'Unable to process data purchase right now.',
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
    const userId =
      req.session.userId!;

    const body =
      (req.body ?? {}) as {
        network?: unknown;
        phone?: unknown;
        amount?: unknown;
        idempotencyKey?: unknown;
        purchasePin?: unknown;
        paymentPin?: unknown;
        pin?: unknown;
      };

    const network =
      normalizeNetwork(
        body.network,
      );

    const phone =
      normalizePhone(
        body.phone,
      );

    const amount =
      safeNumber(
        body.amount,
      );

    /*
     * Purchase PIN is checked on the
     * server BEFORE any wallet debit.
     */
    const purchasePin =
      String(
        body.purchasePin ??
          body.paymentPin ??
          body.pin ??
          '',
      ).trim();

    if (
      !/^\d{6}$/.test(
        purchasePin,
      )
    ) {
      res.status(400).json({
        success: false,
        error:
          'Purchase PIN is required.',
        code:
          'PURCHASE_PIN_REQUIRED',
      });
      return;
    }

    /*
     * Only purchase_pin_hash is
     * selected. Login PIN can never
     * be used for Airtime purchase.
     */
    const pinRows =
      await db.execute<{
        purchase_pin_hash:
          | string
          | null;
      }>(sql`
        SELECT
          purchase_pin_hash
        FROM users
        WHERE id =
          ${userId}::uuid
        LIMIT 1
      `);

    const pinUser =
      pinRows.rows[0];

    if (!pinUser) {
      res.status(401).json({
        success: false,
        error:
          'User account not found.',
      });
      return;
    }

    if (
      !pinUser.purchase_pin_hash
    ) {
      res.status(400).json({
        success: false,
        error:
          'Purchase PIN is not configured. Please set a Purchase PIN before buying.',
        code:
          'PURCHASE_PIN_NOT_CONFIGURED',
      });
      return;
    }

    const pinValid =
      await verifyPin(
        purchasePin,
        pinUser.purchase_pin_hash,
      );

    if (!pinValid) {
      res.status(401).json({
        success: false,
        error:
          'Incorrect purchase PIN.',
        code:
          'INVALID_PURCHASE_PIN',
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

    if (
      ![
        'mtn',
        'glo',
        '9mobile',
        'airtel',
      ].includes(network)
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
        phone,
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
      amount <= 0
    ) {
      res.status(400).json({
        success: false,
        error:
          'Invalid airtime amount.',
      });
      return;
    }

    const idempotencyKey =
      getIdempotencyKey(req);

    try {
      if (idempotencyKey) {
        const existing =
          await findTransactionByIdempotency(
            userId,
            idempotencyKey,
          );

        if (existing) {
          res.status(200).json({
            success: true,
            duplicate: true,
            transaction:
              existing,
            reference:
              existing.reference,
            status:
              existing.status,
          });
          return;
        }
      }

      const pricingRule =
        await findAirtimePricingRule(
          network,
        );

      if (!pricingRule) {
        res.status(404).json({
          success: false,
          error:
            'Airtime service is not configured for this network.',
        });
        return;
      }

      const provider =
        String(
          pricingRule.provider ?? '',
        )
          .trim()
          .toLowerCase();

      if (
        provider !== 'smeapi'
      ) {
        res.status(400).json({
          success: false,
          error:
            'This airtime service is not configured for SME API.',
        });
        return;
      }

      const sellingPrice =
        safeNumber(
          pricingRule.selling_price,
        ) > 0
          ? safeNumber(
              pricingRule.selling_price,
            )
          : amount;

      const wallet =
        await getMainWallet(
          userId,
        );

      if (!wallet) {
        res.status(400).json({
          success: false,
          error:
            'Wallet not found.',
        });
        return;
      }

      if (
        wallet.balance <
        sellingPrice
      ) {
        res.status(400).json({
          success: false,
          error:
            'Insufficient wallet balance.',
          balance:
            wallet.balance,
          required:
            sellingPrice,
        });
        return;
      }

      const newBalance =
        await debitWallet(
          userId,
          sellingPrice,
        );

      const reference =
        makeReference(
          'AIRTIME',
        );

      const transaction =
        await createTransaction({
          userId,
          type: 'airtime',
          service: 'airtime',
          provider: 'smeapi',
          amount:
            sellingPrice,
          status: 'pending',
          reference,
          description:
            `Airtime ₦${sellingPrice.toLocaleString(
              'en-NG',
            )} for ${phone}`,
          metadata: {
            network,
            phone,
            amount:
              sellingPrice,
            idempotencyKey,
          },
        });

      let providerResult:
        PurchaseResult;

      try {
        providerResult =
          (await purchaseAirtime({
            network,
            phone,
            amount:
              sellingPrice,
            reference,
          })) as PurchaseResult;
      } catch (providerError) {
        logger.error(
          {
            providerError,
            reference,
            userId,
            network,
            phone,
          },
          'SME API airtime purchase failed',
        );

        const refundedBalance =
          await refundWallet(
            userId,
            sellingPrice,
          );

        await updateTransaction(
          reference,
          'failed',
          'Airtime provider request failed. Wallet refunded.',
        );

        await notifyUser(
          userId,
          'Airtime purchase failed',
          `Your ₦${sellingPrice.toLocaleString(
            'en-NG',
          )} airtime purchase failed. Your wallet has been refunded.`,
        );

        res.status(502).json({
          success: false,
          status: 'failed',
          reference,
          error:
            'Airtime provider request failed. Your wallet has been refunded.',
          balance:
            refundedBalance,
        });
        return;
      }

      const providerReference =
        getProviderReference(
          providerResult,
        );

      const providerMessage =
        getProviderMessage(
          providerResult,
        );

      if (
        providerSucceeded(
          providerResult,
        )
      ) {
        await updateTransaction(
          reference,
          'success',
          providerMessage,
        );

        const cashback =
          calculateCashback(
            sellingPrice,
            pricingRule,
          );

        let cashbackBalance = 0;

        if (
          cashback > 0
        ) {
          cashbackBalance =
            await creditCashback(
              userId,
              String(
                transaction.id,
              ),
              cashback,
              pricingRule,
              network,
              null,
              null,
            );
        }

        await notifyUser(
          userId,
          'Airtime purchase successful',
          `₦${sellingPrice.toLocaleString(
            'en-NG',
          )} airtime has been sent to ${phone}.`,
        );

        res.status(200).json({
          success: true,
          status: 'success',
          reference,
          providerReference,
          message:
            providerMessage ||
            'Airtime purchase successful.',
          transaction,
          amount:
            sellingPrice,
          balance:
            newBalance,
          cashback,
          cashbackBalance,
        });

        return;
      }

      if (
        providerPending(
          providerResult,
        )
      ) {
        await updateTransaction(
          reference,
          'pending',
          providerMessage ||
            'Airtime purchase is being processed.',
        );

        await notifyUser(
          userId,
          'Airtime purchase processing',
          `Your ₦${sellingPrice.toLocaleString(
            'en-NG',
          )} airtime purchase for ${phone} is being processed.`,
        );

        res.status(202).json({
          success: true,
          status: 'pending',
          reference,
          providerReference,
          message:
            providerMessage ||
            'Airtime purchase is being processed.',
          transaction,
          amount:
            sellingPrice,
          balance:
            newBalance,
        });

        return;
      }

      const refundedBalance =
        await refundWallet(
          userId,
          sellingPrice,
        );

      await updateTransaction(
        reference,
        'failed',
        `${providerMessage}. Wallet refunded.`,
      );

      await notifyUser(
        userId,
        'Airtime purchase failed',
        `Your airtime purchase failed. ₦${sellingPrice.toLocaleString(
          'en-NG',
        )} has been refunded.`,
      );

      res.status(400).json({
        success: false,
        status: 'failed',
        reference,
        providerReference,
        error:
          providerMessage ||
          'Airtime purchase failed. Wallet refunded.',
        balance:
          refundedBalance,
      });
    } catch (error) {
      const e =
        error as {
          code?: string;
          message?: string;
        };

      if (
        e.code === 'INSUFFICIENT'
      ) {
        res.status(400).json({
          success: false,
          error:
            'Insufficient wallet balance.',
        });
        return;
      }

      logger.error(
        {
          error,
          userId,
        },
        'Unexpected airtime purchase error',
      );

      res.status(500).json({
        success: false,
        error:
          'Unable to process airtime purchase right now.',
      });
    }
  },
);

export default router;
