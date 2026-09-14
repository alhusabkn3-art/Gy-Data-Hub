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
};

type PricingRule = {
  id: string | number;
  service_type: string;
  provider: string | null;
  network: string | null;
  plan_id: string | null;
  plan_name: string | null;
  cost_price: string | number | null;
  selling_price: string | number | null;
  enabled: boolean;
  cashback_enabled: boolean;
  cashback_type: string | null;
  cashback_value: string | number | null;
};

/* =========================================================
   HELPERS
========================================================= */

function safeNumber(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === 'string') {
    const cleaned = value
      .replace(/₦/g, '')
      .replace(/,/g, '')
      .trim();

    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
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
    case 'mtel':
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

function getIdempotencyKey(req: Request): string | null {
  const value =
    req.get('Idempotency-Key') ||
    req.get('X-Idempotency-Key') ||
    (req.body as { idempotencyKey?: unknown })?.idempotencyKey;

  if (!value) {
    return null;
  }

  const key = String(value).trim();

  return key.length > 0 ? key.slice(0, 255) : null;
}

function makeReference(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)
    .toUpperCase()}`;
}

function providerSucceeded(result: PurchaseResult): boolean {
  const status = String(
    result.status ??
      (result as { data?: { status?: unknown } }).data?.status ??
      '',
  )
    .trim()
    .toLowerCase();

  if (
    result.success === true &&
    !['failed', 'failure', 'error', 'rejected'].includes(status)
  ) {
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
  const status = String(
    result.status ??
      (result as { data?: { status?: unknown } }).data?.status ??
      '',
  )
    .trim()
    .toLowerCase();

  return [
    'pending',
    'processing',
    'queued',
    'initiated',
    'in_progress',
    'in progress',
  ].includes(status);
}

function providerFailed(result: PurchaseResult): boolean {
  if (result.success === false) {
    return true;
  }

  const status = String(result.status ?? '')
    .trim()
    .toLowerCase();

  return [
    'failed',
    'failure',
    'error',
    'rejected',
    'cancelled',
    'canceled',
  ].includes(status);
}

function getProviderReference(result: PurchaseResult): string | null {
  const value =
    result.reference ??
    result.ref ??
    result.providerReference ??
    result.transactionId;

  if (!value) {
    return null;
  }

  return String(value);
}

function getProviderMessage(result: PurchaseResult): string {
  return String(
    result.message ??
      result.error ??
      result.provider_message ??
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
  const exact = await db.execute(sql`
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
      AND LOWER(COALESCE(plan_id, '')) = ${planCode.toLowerCase()}
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  const rows = exact.rows as unknown as PricingRule[];

  if (rows.length > 0) {
    return rows[0];
  }

  if (!planName) {
    return null;
  }

  const fallback = await db.execute(sql`
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
      AND LOWER(COALESCE(plan_name, '')) = ${planName.toLowerCase()}
      AND LOWER(COALESCE(provider, '')) = 'smeapi'
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  const fallbackRows =
    fallback.rows as unknown as PricingRule[];

  return fallbackRows.length > 0 ? fallbackRows[0] : null;
}

async function findAirtimePricingRule(
  network: string,
): Promise<PricingRule | null> {
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
    WHERE service_type = 'airtime'
      AND enabled = true
      AND LOWER(COALESCE(network, '')) = ${network}
    ORDER BY updated_at DESC
    LIMIT 1
  `);

  const rows = result.rows as unknown as PricingRule[];

  return rows.length > 0 ? rows[0] : null;
}

/* =========================================================
   CASHBACK
========================================================= */

function calculateCashback(
  amount: number,
  rule: PricingRule | null,
): number {
  if (!rule || !rule.cashback_enabled) {
    return 0;
  }

  const value = safeNumber(rule.cashback_value);

  if (value <= 0) {
    return 0;
  }

  const type = String(rule.cashback_type ?? '')
    .trim()
    .toLowerCase();

  if (type === 'percentage' || type === 'percent') {
    return Math.round((amount * value) / 100 * 100) / 100;
  }

  return Math.min(value, amount);
}

/* =========================================================
   WALLET
========================================================= */

async function getWallet(userId: string) {
  const result = await db.execute(sql`
    SELECT *
    FROM wallets
    WHERE user_id = ${userId}
    LIMIT 1
  `);

  return result.rows[0] as
    | {
        id: string;
        user_id: string;
        balance: string | number;
      }
    | undefined;
}

async function debitWallet(
  userId: string,
  amount: number,
): Promise<{
  walletId: string;
  balance: number;
}> {
  const result = await db.execute(sql`
    UPDATE wallets
    SET
      balance = balance - ${amount},
      updated_at = NOW()
    WHERE user_id = ${userId}
      AND balance >= ${amount}
    RETURNING id, balance
  `);

  const row = result.rows[0] as
    | {
        id: string;
        balance: string | number;
      }
    | undefined;

  if (!row) {
    throw new Error('INSUFFICIENT_FUNDS');
  }

  return {
    walletId: row.id,
    balance: safeNumber(row.balance),
  };
}

async function refundWallet(
  userId: string,
  amount: number,
): Promise<number> {
  if (amount <= 0) {
    const wallet = await getWallet(userId);
    return safeNumber(wallet?.balance);
  }

  const result = await db.execute(sql`
    UPDATE wallets
    SET
      balance = balance + ${amount},
      updated_at = NOW()
    WHERE user_id = ${userId}
    RETURNING balance
  `);

  const row = result.rows[0] as
    | {
        balance: string | number;
      }
    | undefined;

  return safeNumber(row?.balance);
}

/* =========================================================
   TRANSACTIONS
========================================================= */

async function findTransactionByIdempotency(
  userId: string,
  key: string,
) {
  const result = await db.execute(sql`
    SELECT *
    FROM transactions
    WHERE user_id = ${userId}
      AND idempotency_key = ${key}
    ORDER BY created_at DESC
    LIMIT 1
  `);

  return result.rows[0] as
    | Record<string, unknown>
    | undefined;
}

async function findTransactionByReference(reference: string) {
  const result = await db.execute(sql`
    SELECT *
    FROM transactions
    WHERE reference = ${reference}
    LIMIT 1
  `);

  return result.rows[0] as
    | Record<string, unknown>
    | undefined;
}

async function createTransaction(params: {
  userId: string;
  reference: string;
  service: string;
  network: string;
  phone: string;
  amount: number;
  status: string;
  description: string;
  idempotencyKey: string | null;
  provider: string;
  planCode?: string | null;
  planName?: string | null;
}) {
  const result = await db.execute(sql`
    INSERT INTO transactions (
      user_id,
      reference,
      service_type,
      network,
      phone,
      amount,
      status,
      description,
      idempotency_key,
      provider,
      plan_id,
      plan_name,
      created_at,
      updated_at
    )
    VALUES (
      ${params.userId},
      ${params.reference},
      ${params.service},
      ${params.network},
      ${params.phone},
      ${params.amount},
      ${params.status},
      ${params.description},
      ${params.idempotencyKey},
      ${params.provider},
      ${params.planCode ?? null},
      ${params.planName ?? null},
      NOW(),
      NOW()
    )
    RETURNING *
  `);

  return result.rows[0] as Record<string, unknown>;
}

async function updateTransaction(
  reference: string,
  status: string,
  message?: string,
) {
  const result = await db.execute(sql`
    UPDATE transactions
    SET
      status = ${status},
      description = COALESCE(${message ?? null}, description),
      updated_at = NOW()
    WHERE reference = ${reference}
    RETURNING *
  `);

  return result.rows[0] as Record<string, unknown> | undefined;
}

/* =========================================================
   NOTIFICATIONS / SOCKET
========================================================= */

async function notifyUser(
  userId: string,
  title: string,
  message: string,
) {
  try {
    await createNotification({
      userId,
      title,
      message,
    });
  } catch (error) {
    logger.warn(
      { error, userId },
      'Failed to create purchase notification',
    );
  }

  try {
    const io = getIo();

    io.to(`user:${userId}`).emit('notification', {
      title,
      message,
    });

    io.to(`user:${userId}`).emit('wallet:update');
    io.to(`user:${userId}`).emit('transaction:update');
  } catch (error) {
    logger.warn(
      { error, userId },
      'Failed to emit purchase socket event',
    );
  }
}

/* =========================================================
   DATA PURCHASE
========================================================= */

router.post(
  '/data',
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
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
    };

    /*
     * Accept both the current frontend format and the
     * older/raw plan format.
     */
    const network = normalizeNetwork(body.network);

    const phone = normalizePhone(body.phone);

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

    const requestedPrice = safeNumber(rawPrice);

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

    if (!planCode) {
      res.status(400).json({
        success: false,
        error: 'planCode is required.',
      });
      return;
    }

    if (!['mtn', 'glo', '9mobile', 'airtel'].includes(network)) {
      res.status(400).json({
        success: false,
        error: 'Unsupported network.',
      });
      return;
    }

    if (!validNigerianPhone(phone)) {
      res.status(400).json({
        success: false,
        error: 'Invalid Nigerian phone number.',
      });
      return;
    }

    if (requestedPrice <= 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid plan price.',
      });
      return;
    }

    const idempotencyKey = getIdempotencyKey(req);

    try {
      /*
       * Prevent duplicate purchases.
       */
      if (idempotencyKey) {
        const existing = await findTransactionByIdempotency(
          userId,
          idempotencyKey,
        );

        if (existing) {
          res.status(200).json({
            success: true,
            duplicate: true,
            transaction: existing,
            reference: existing.reference,
            status: existing.status,
          });
          return;
        }
      }

      const pricingRule = await findDataPricingRule(
        network,
        planCode,
        planName,
      );

      if (!pricingRule) {
        res.status(404).json({
          success: false,
          error:
            'This data plan is not configured for sale yet.',
          code: 'PLAN_NOT_CONFIGURED',
          network,
          planCode,
          planName,
        });
        return;
      }

      const provider = String(
        pricingRule.provider ?? 'smeapi',
      )
        .trim()
        .toLowerCase();

      if (provider !== 'smeapi') {
        res.status(400).json({
          success: false,
          error: 'This data plan is not configured for SME API.',
        });
        return;
      }

      const sellingPrice = safeNumber(
        pricingRule.selling_price,
      );

      const costPrice = safeNumber(
        pricingRule.cost_price,
      );

      if (sellingPrice <= 0) {
        res.status(400).json({
          success: false,
          error: 'Data plan selling price is not configured.',
        });
        return;
      }

      /*
       * Do not trust price sent from browser.
       * The database pricing rule is authoritative.
       *
       * Allow a tiny floating-point tolerance.
       */
      if (
        Math.abs(requestedPrice - sellingPrice) > 0.01
      ) {
        res.status(400).json({
          success: false,
          error: 'The selected data plan price has changed. Please refresh the plans and try again.',
          code: 'PRICE_CHANGED',
          expectedPrice: sellingPrice,
        });
        return;
      }

      const wallet = await getWallet(userId);

      if (!wallet) {
        res.status(400).json({
          success: false,
          error: 'Wallet not found.',
        });
        return;
      }

      const currentBalance = safeNumber(wallet.balance);

      if (currentBalance < sellingPrice) {
        res.status(400).json({
          success: false,
          error: 'Insufficient wallet balance.',
          balance: currentBalance,
          required: sellingPrice,
        });
        return;
      }

      /*
       * Debit first.
       */
      const debit = await debitWallet(
        userId,
        sellingPrice,
      );

      const reference = makeReference('DATA');

      const transaction = await createTransaction({
        userId,
        reference,
        service: 'data',
        network,
        phone,
        amount: sellingPrice,
        status: 'pending',
        description:
          planName ||
          `Data purchase ${planCode}`,
        idempotencyKey,
        provider: 'smeapi',
        planCode:
          pricingRule.plan_id || planCode,
        planName:
          pricingRule.plan_name || planName || planCode,
      });

      let providerResult: PurchaseResult;

      try {
        providerResult = (await purchaseData({
          network,
          phone,
          dataPlan:
            pricingRule.plan_id || planCode,
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

        const refundedBalance = await refundWallet(
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
          `Your ₦${sellingPrice.toLocaleString()} data purchase failed. Your wallet has been refunded.`,
        );

        res.status(502).json({
          success: false,
          error:
            'Data provider request failed. Your wallet has been refunded.',
          reference,
          status: 'failed',
          balance: refundedBalance,
        });
        return;
      }

      const providerRef =
        getProviderReference(providerResult);

      const providerMessage =
        getProviderMessage(providerResult);

      /*
       * SUCCESS
       */
      if (providerSucceeded(providerResult)) {
        await updateTransaction(
          reference,
          'successful',
          providerMessage,
        );

        const cashback = calculateCashback(
          sellingPrice,
          pricingRule,
        );

        let finalBalance = debit.balance;

        if (cashback > 0) {
          finalBalance = await refundWallet(
            userId,
            cashback,
          );
        }

        await notifyUser(
          userId,
          'Data purchase successful',
          `${planName || 'Data plan'} purchased successfully for ${phone}.`,
        );

        res.status(200).json({
          success: true,
          status: 'successful',
          reference,
          providerReference: providerRef,
          message:
            providerMessage ||
            'Data purchase successful.',
          transaction,
          amount: sellingPrice,
          costPrice,
          cashback,
          balance: finalBalance,
        });
        return;
      }

      /*
       * PENDING
       */
      if (providerPending(providerResult)) {
        await updateTransaction(
          reference,
          'pending',
          providerMessage,
        );

        await notifyUser(
          userId,
          'Data purchase processing',
          `${planName || 'Data purchase'} is still being processed.`,
        );

        res.status(202).json({
          success: true,
          status: 'pending',
          reference,
          providerReference: providerRef,
          message:
            providerMessage ||
            'Your data purchase is being processed.',
          transaction,
          amount: sellingPrice,
          balance: debit.balance,
        });
        return;
      }

      /*
       * EXPLICIT FAILURE
       */
      await refundWallet(
        userId,
        sellingPrice,
      );

      const failedBalance = await getWallet(userId);

      await updateTransaction(
        reference,
        'failed',
        `${providerMessage}. Wallet refunded.`,
      );

      await notifyUser(
        userId,
        'Data purchase failed',
        `Your data purchase failed. ₦${sellingPrice.toLocaleString()} has been refunded.`,
      );

      res.status(400).json({
        success: false,
        status: 'failed',
        reference,
        providerReference: providerRef,
        error:
          providerMessage ||
          'Data purchase failed. Wallet refunded.',
        balance: safeNumber(failedBalance?.balance),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'INSUFFICIENT_FUNDS'
      ) {
        res.status(400).json({
          success: false,
          error: 'Insufficient wallet balance.',
        });
        return;
      }

      logger.error(
        {
          error,
          userId,
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
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.session.userId!;

    const body = (req.body ?? {}) as {
      network?: unknown;
      phone?: unknown;
      amount?: unknown;
      idempotencyKey?: unknown;
    };

    const network = normalizeNetwork(body.network);
    const phone = normalizePhone(body.phone);
    const amount = safeNumber(body.amount);

    if (!network) {
      res.status(400).json({
        success: false,
        error: 'network is required.',
      });
      return;
    }

    if (!['mtn', 'glo', '9mobile', 'airtel'].includes(network)) {
      res.status(400).json({
        success: false,
        error: 'Unsupported network.',
      });
      return;
    }

    if (!phone || !validNigerianPhone(phone)) {
      res.status(400).json({
        success: false,
        error: 'Invalid Nigerian phone number.',
      });
      return;
    }

    if (amount <= 0) {
      res.status(400).json({
        success: false,
        error: 'Invalid airtime amount.',
      });
      return;
    }

    const idempotencyKey = getIdempotencyKey(req);

    try {
      if (idempotencyKey) {
        const existing = await findTransactionByIdempotency(
          userId,
          idempotencyKey,
        );

        if (existing) {
          res.status(200).json({
            success: true,
            duplicate: true,
            transaction: existing,
            reference: existing.reference,
            status: existing.status,
          });
          return;
        }
      }

      const pricingRule =
        await findAirtimePricingRule(network);

      const sellingPrice =
        pricingRule &&
        safeNumber(pricingRule.selling_price) > 0
          ? safeNumber(pricingRule.selling_price)
          : amount;

      if (
        pricingRule &&
        safeNumber(pricingRule.selling_price) > 0 &&
        Math.abs(amount - sellingPrice) > 0.01
      ) {
        res.status(400).json({
          success: false,
          error:
            'The airtime price has changed. Please refresh and try again.',
          expectedPrice: sellingPrice,
        });
        return;
      }

      const wallet = await getWallet(userId);

      if (!wallet) {
        res.status(400).json({
          success: false,
          error: 'Wallet not found.',
        });
        return;
      }

      const balance = safeNumber(wallet.balance);

      if (balance < sellingPrice) {
        res.status(400).json({
          success: false,
          error: 'Insufficient wallet balance.',
          balance,
          required: sellingPrice,
        });
        return;
      }

      const debit = await debitWallet(
        userId,
        sellingPrice,
      );

      const reference = makeReference('AIRTIME');

      const transaction = await createTransaction({
        userId,
        reference,
        service: 'airtime',
        network,
        phone,
        amount: sellingPrice,
        status: 'pending',
        description: `Airtime ₦${sellingPrice.toLocaleString()}`,
        idempotencyKey,
        provider:
          pricingRule?.provider || 'smeapi',
      });

      let providerResult: PurchaseResult;

      try {
        providerResult = (await purchaseAirtime({
          network,
          phone,
          amount: sellingPrice,
          reference,
        })) as PurchaseResult;
      } catch (providerError) {
        logger.error(
          {
            providerError,
            reference,
            userId,
          },
          'SME API airtime purchase failed',
        );

        const refundedBalance = await refundWallet(
          userId,
          sellingPrice,
        );

        await updateTransaction(
          reference,
          'failed',
          'Airtime provider request failed. Wallet refunded.',
        );

        res.status(502).json({
          success: false,
          error:
            'Airtime provider request failed. Wallet refunded.',
          reference,
          status: 'failed',
          balance: refundedBalance,
        });
        return;
      }

      const providerRef =
        getProviderReference(providerResult);

      const providerMessage =
        getProviderMessage(providerResult);

      if (providerSucceeded(providerResult)) {
        await updateTransaction(
          reference,
          'successful',
          providerMessage,
        );

        const cashback = calculateCashback(
          sellingPrice,
          pricingRule,
        );

        let finalBalance = debit.balance;

        if (cashback > 0) {
          finalBalance = await refundWallet(
            userId,
            cashback,
          );
        }

        await notifyUser(
          userId,
          'Airtime purchase successful',
          `₦${sellingPrice.toLocaleString()} airtime sent to ${phone}.`,
        );

        res.status(200).json({
          success: true,
          status: 'successful',
          reference,
          providerReference: providerRef,
          message:
            providerMessage ||
            'Airtime purchase successful.',
          transaction,
          amount: sellingPrice,
          cashback,
          balance: finalBalance,
        });
        return;
      }

      if (providerPending(providerResult)) {
        await updateTransaction(
          reference,
          'pending',
          providerMessage,
        );

        await notifyUser(
          userId,
          'Airtime purchase processing',
          `Your ₦${sellingPrice.toLocaleString()} airtime purchase is being processed.`,
        );

        res.status(202).json({
          success: true,
          status: 'pending',
          reference,
          providerReference: providerRef,
          message:
            providerMessage ||
            'Airtime purchase is being processed.',
          transaction,
          amount: sellingPrice,
          balance: debit.balance,
        });
        return;
      }

      await refundWallet(
        userId,
        sellingPrice,
      );

      const failedWallet = await getWallet(userId);

      await updateTransaction(
        reference,
        'failed',
        `${providerMessage}. Wallet refunded.`,
      );

      await notifyUser(
        userId,
        'Airtime purchase failed',
        `Your airtime purchase failed. ₦${sellingPrice.toLocaleString()} has been refunded.`,
      );

      res.status(400).json({
        success: false,
        status: 'failed',
        reference,
        providerReference: providerRef,
        error:
          providerMessage ||
          'Airtime purchase failed. Wallet refunded.',
        balance: safeNumber(
          failedWallet?.balance,
        ),
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === 'INSUFFICIENT_FUNDS'
      ) {
        res.status(400).json({
          success: false,
          error: 'Insufficient wallet balance.',
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
