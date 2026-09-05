/**
 * purchase.ts
 *
 * Data + Airtime purchases through SME API.
 * Cashback uses:
 *   cashback_wallets
 *   cashback_transactions
 *   cashback_transfers
 *
 * IMPORTANT:
 * - SME API is server-side only.
 * - Wallet debit/refund is transactional.
 * - Cashback is credited only after successful data purchase.
 * - Cashback transfer is exported for cashback-user.ts.
 */

import { Router, type Request, type Response } from 'express';
import { and, eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

import { db } from '@workspace/db';

import {
  transactionsTable,
  walletsTable,
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

function makeReference(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

function cleanPhoneNumber(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, '')
    .replace(/^\+234/, '0')
    .replace(/^234/, '0');
}

function parseAmount(value: unknown): number {
  const n = Number(value);

  if (!Number.isFinite(n) || n <= 0) {
    throw new Error('Invalid transaction amount.');
  }

  return Math.round(n * 100) / 100;
}

function normalizeSMEResult(
  result: {
    success: boolean;
    message?: string;
  },
): 'success' | 'pending' | 'failure' {
  if (result.success === true) {
    return 'success';
  }

  const message = String(
    result.message ?? '',
  ).toLowerCase();

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

function emitTransactionUpdate(
  userId: string,
  payload: Record<string, unknown>,
): void {
  try {
    getIo()
      .to(`user:${userId}`)
      .emit(
        'transaction:update',
        payload,
      );
  } catch (error) {
    logger.warn(
      {
        error,
        userId,
      },
      'Transaction socket update failed',
    );
  }
}

/* ============================================================
   EXISTING TRANSACTION / IDEMPOTENCY
   ============================================================ */

async function getExistingTransaction(
  userId: string,
  reference: string,
) {
  const result =
    await db.execute<{
      id: string;
      status:
        | 'success'
        | 'pending'
        | 'failed';
      amount: string;
      description: string;
      provider_reference:
        | string
        | null;
      created_at: Date;
    }>(sql`
      SELECT
        id,
        status,
        amount,
        description,
        provider_reference,
        created_at
      FROM transactions
      WHERE user_id = ${userId}::uuid
        AND reference = ${reference}
      LIMIT 1
    `);

  return result.rows[0] ?? null;
}

/* ============================================================
   WALLET DEBIT
   ============================================================ */

async function debitWalletAndCreateTransaction(
  opts: {
    userId: string;
    amount: number;
    reference: string;
    type: 'data' | 'airtime';
    description: string;
    metadata?: Record<
      string,
      unknown
    >;
  },
): Promise<{
  txnId: string;
  newBalance: string;
}> {
  let txnId = '';
  let newBalance = '0';

  await db.transaction(
    async (tx) => {
      const walletResult =
        await tx.execute<{
          id: string;
          balance: string;
        }>(sql`
          SELECT
            id,
            balance
          FROM wallets
          WHERE user_id = ${opts.userId}::uuid
          FOR UPDATE
        `);

      const wallet =
        walletResult.rows[0];

      if (!wallet) {
        throw new Error(
          'Wallet not found.',
        );
      }

      const balance =
        Number(wallet.balance ?? 0);

      if (
        !Number.isFinite(balance) ||
        balance < opts.amount
      ) {
        throw new Error(
          'Insufficient wallet balance.',
        );
      }

      const next =
        Math.round(
          (balance - opts.amount) *
            100,
        ) / 100;

      newBalance =
        next.toFixed(2);

      const inserted =
        await tx.execute<{
          id: string;
        }>(sql`
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
            ${opts.userId}::uuid,
            ${opts.type},
            ${
              opts.type === 'data'
                ? 'Data'
                : 'Airtime'
            },
            'smeapi',
            ${opts.amount.toFixed(2)},
            'pending',
            ${opts.reference},
            ${opts.description},
            ${
              JSON.stringify(
                opts.metadata ?? {},
              )
            }::jsonb,
            NOW(),
            NOW()
          )
          RETURNING id
        `);

      txnId =
        inserted.rows[0]?.id ?? '';

      if (!txnId) {
        throw new Error(
          'Unable to create transaction.',
        );
      }

      await tx.execute(sql`
        UPDATE wallets
        SET
          balance = ${newBalance},
          updated_at = NOW()
        WHERE id = ${wallet.id}::uuid
      `);
    },
  );

  return {
    txnId,
    newBalance,
  };
}

/* ============================================================
   WALLET REFUND
   ============================================================ */

async function refundWalletAndMarkFailed(
  opts: {
    userId: string;
    txnId: string;
    amount: number;
    requestId: string;
  },
): Promise<string> {
  let newBalance = '0';

  await db.transaction(
    async (tx) => {
      const walletResult =
        await tx.execute<{
          id: string;
          balance: string;
        }>(sql`
          SELECT
            id,
            balance
          FROM wallets
          WHERE user_id = ${opts.userId}::uuid
          FOR UPDATE
        `);

      const wallet =
        walletResult.rows[0];

      if (!wallet) {
        throw new Error(
          'Wallet not found.',
        );
      }

      const currentBalance =
        Number(wallet.balance ?? 0);

      const refundAmount =
        Number(opts.amount);

      const next =
        Math.round(
          (
            currentBalance +
            refundAmount
          ) * 100,
        ) / 100;

      newBalance =
        next.toFixed(2);

      await tx.execute(sql`
        UPDATE wallets
        SET
          balance = ${newBalance},
          updated_at = NOW()
        WHERE id = ${wallet.id}::uuid
      `);

      await tx.execute(sql`
        UPDATE transactions
        SET
          status = 'failed',
          updated_at = NOW()
        WHERE id = ${opts.txnId}::uuid
          AND user_id = ${opts.userId}::uuid
      `);
    },
  );

  emitTransactionUpdate(
    opts.userId,
    {
      requestId:
        opts.requestId,
      txnId:
        opts.txnId,
      status:
        'failed',
      balance:
        newBalance,
      refunded:
        true,
    },
  );

  return newBalance;
}

/* ============================================================
   MARK SUCCESS
   ============================================================ */

async function markTransactionSuccess(
  opts: {
    userId: string;
    txnId: string;
    providerRef?:
      | string
      | null;
    metadata?: Record<
      string,
      unknown
    >;
  },
): Promise<void> {
  await db.execute(sql`
    UPDATE transactions
    SET
      status = 'success',
      provider_reference =
        ${opts.providerRef ?? null},
      metadata =
        ${
          JSON.stringify(
            opts.metadata ?? {},
          )
        }::jsonb,
      updated_at = NOW()
    WHERE id = ${opts.txnId}::uuid
      AND user_id = ${opts.userId}::uuid
  `);

  emitTransactionUpdate(
    opts.userId,
    {
      txnId:
        opts.txnId,
      status:
        'success',
      providerRef:
        opts.providerRef ??
        null,
    },
  );
}

/* ============================================================
   MARK PENDING
   ============================================================ */

async function markTransactionPending(
  opts: {
    userId: string;
    txnId: string;
    providerRef?:
      | string
      | null;
    metadata?: Record<
      string,
      unknown
    >;
  },
): Promise<void> {
  await db.execute(sql`
    UPDATE transactions
    SET
      status = 'pending',
      provider_reference =
        ${opts.providerRef ?? null},
      metadata =
        ${
          JSON.stringify(
            opts.metadata ?? {},
          )
        }::jsonb,
      updated_at = NOW()
    WHERE id = ${opts.txnId}::uuid
      AND user_id = ${opts.userId}::uuid
  `);
}

/* ============================================================
   CASHBACK
   ============================================================ */

async function applyCashbackIfEligible(
  opts: {
    userId: string;
    sourceTxnId: string;
    requestId: string;
    planCode: string;
    network: string;
    planName: string;
    purchaseAmount: number;
  },
): Promise<{
  applied: boolean;
  amount: number;
  cashbackBalance: string;
}> {
  /*
   * Global cashback setting.
   */
  const settingsResult =
    await db.execute<{
      enabled: boolean;
      eligible_services:
        | string[]
        | string;
    }>(sql`
      SELECT
        enabled,
        eligible_services
      FROM cashback_settings
      LIMIT 1
    `);

  const settings =
    settingsResult.rows[0];

  if (!settings?.enabled) {
    return {
      applied:
        false,
      amount:
        0,
      cashbackBalance:
        '',
    };
  }

  /*
   * Parse eligible services.
   */
  let services: string[] = [
    'data',
  ];

  try {
    services =
      Array.isArray(
        settings.eligible_services,
      )
        ? settings.eligible_services.map(
            String,
          )
        : JSON.parse(
            String(
              settings.eligible_services ||
                '["data"]',
            ),
          );
  } catch {
    services = [
      'data',
    ];
  }

  const normalizedServices =
    services.map(
      (service) =>
        String(
          service,
        ).toLowerCase(),
    );

  if (
    !normalizedServices.includes(
      'data',
    )
  ) {
    return {
      applied:
        false,
      amount:
        0,
      cashbackBalance:
        '',
    };
  }

  /*
   * Find cashback rule for this exact
   * data plan.
   */
  const ruleResult =
    await db.execute<{
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
          OR (
            LOWER(TRIM(provider))
              IN ('smedata', 'smeapi')
            AND TRIM(plan_id) =
              TRIM(${opts.planCode})
          )
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

  const rule =
    ruleResult.rows[0];

  if (
    !rule?.cashback_enabled
  ) {
    return {
      applied:
        false,
      amount:
        0,
      cashbackBalance:
        '',
    };
  }

  const cashbackValue =
    Number(
      rule.cashback_value,
    );

  if (
    !Number.isFinite(
      cashbackValue,
    ) ||
    cashbackValue <= 0
  ) {
    return {
      applied:
        false,
      amount:
        0,
      cashbackBalance:
        '',
    };
  }

  let cashbackAmount =
    String(
      rule.cashback_type,
    ).toLowerCase() ===
    'percentage'
      ? opts.purchaseAmount *
        (cashbackValue / 100)
      : cashbackValue;

  cashbackAmount =
    Math.round(
      cashbackAmount * 100,
    ) / 100;

  if (
    cashbackAmount <= 0
  ) {
    return {
      applied:
        false,
      amount:
        0,
      cashbackBalance:
        '',
    };
  }

  /*
   * Prevent duplicate cashback for the
   * same successful transaction.
   */
  const duplicate =
    await db.execute<{
      id: string;
    }>(sql`
      SELECT id
      FROM cashback_transactions
      WHERE source_txn_id =
        ${opts.sourceTxnId}::uuid
      LIMIT 1
    `);

  if (
    duplicate.rows.length >
    0
  ) {
    const balanceResult =
      await db.execute<{
        balance: string;
      }>(sql`
        SELECT balance
        FROM cashback_wallets
        WHERE user_id =
          ${opts.userId}::uuid
        LIMIT 1
      `);

    return {
      applied:
        false,
      amount:
        0,
      cashbackBalance:
        balanceResult.rows[0]
          ?.balance ??
        '0',
    };
  }

  let cashbackBalance =
    '0';

  await db.transaction(
    async (tx) => {
      /*
       * Lock cashback wallet.
       */
      const walletResult =
        await tx.execute<{
          id: string;
          balance: string;
        }>(sql`
          SELECT
            id,
            balance
          FROM cashback_wallets
          WHERE user_id =
            ${opts.userId}::uuid
          FOR UPDATE
        `);

      let cashbackWallet =
        walletResult.rows[0];

      /*
       * Safety fallback for users who
       * somehow don't have a cashback wallet.
       */
      if (!cashbackWallet) {
        const created =
          await tx.execute<{
            id: string;
            balance: string;
          }>(sql`
            INSERT INTO cashback_wallets (
              user_id,
              balance
            )
            VALUES (
              ${opts.userId}::uuid,
              0
            )
            ON CONFLICT (user_id)
            DO UPDATE SET
              updated_at = NOW()
            RETURNING
              id,
              balance
          `);

        cashbackWallet =
          created.rows[0];
      }

      if (!cashbackWallet) {
        throw new Error(
          'Cashback wallet not found.',
        );
      }

      const currentBalance =
        Number(
          cashbackWallet.balance ??
            0,
        );

      const nextBalance =
        Math.round(
          (
            currentBalance +
            cashbackAmount
          ) * 100,
        ) / 100;

      cashbackBalance =
        nextBalance.toFixed(2);

      await tx.execute(sql`
        UPDATE cashback_wallets
        SET
          balance =
            ${cashbackBalance},
          updated_at = NOW()
        WHERE id =
          ${cashbackWallet.id}::uuid
      `);

      await tx.execute(sql`
        INSERT INTO cashback_transactions (
          user_id,
          source_txn_id,
          amount,
          cashback_type,
          cashback_value,
          network,
          plan_id,
          plan_name,
          reference,
          created_at
        )
        VALUES (
          ${opts.userId}::uuid,
          ${opts.sourceTxnId}::uuid,
          ${cashbackAmount.toFixed(2)},
          ${String(
            rule.cashback_type,
          )},
          ${cashbackValue.toFixed(2)},
          ${opts.network},
          ${opts.planCode},
          ${opts.planName},
          ${opts.requestId},
          NOW()
        )
      `);
    },
  );

  try {
    await createNotification(
      opts.userId,
      {
        type:
          'cashback',
        title:
          'Cashback Earned',
        body:
          `You earned ₦${cashbackAmount.toFixed(
            2,
          )} cashback from your ` +
          `${opts.planName} purchase.`,
        refId:
          opts.sourceTxnId,
      },
    );
  } catch (error) {
    logger.warn(
      {
        error,
        userId:
          opts.userId,
      },
      'Cashback notification failed',
    );
  }

  return {
    applied:
      true,
    amount:
      cashbackAmount,
    cashbackBalance,
  };
}

/* ============================================================
   CASHBACK TRANSFER
   ============================================================ */

/*
 * IMPORTANT:
 * cashback-user.ts imports this function:
 *
 * import {
 *   transferCashbackToMain
 * } from './purchase.js';
 *
 * Therefore this MUST remain a named export.
 */

export async function transferCashbackToMain(
  userId: string,
  amount: number,
  mode:
    | 'manual'
    | 'auto' = 'manual',
): Promise<{
  success: boolean;
  amount: number;
  newMainBalance: string;
  newCashbackBalance: string;
}> {
  const transferAmount =
    Math.round(
      Number(amount) * 100,
    ) / 100;

  if (
    !Number.isFinite(
      transferAmount,
    ) ||
    transferAmount <= 0
  ) {
    throw new Error(
      'Invalid cashback transfer amount.',
    );
  }

  let newMainBalance =
    '0';

  let newCashbackBalance =
    '0';

  await db.transaction(
    async (tx) => {
      /*
       * Lock cashback wallet first.
       */
      const cashbackResult =
        await tx.execute<{
          id: string;
          balance: string;
        }>(sql`
          SELECT
            id,
            balance
          FROM cashback_wallets
          WHERE user_id =
            ${userId}::uuid
          FOR UPDATE
        `);

      const cashbackWallet =
        cashbackResult.rows[0];

      if (!cashbackWallet) {
        throw new Error(
          'Cashback wallet not found.',
        );
      }

      const cashbackBalance =
        Number(
          cashbackWallet.balance ??
            0,
        );

      if (
        !Number.isFinite(
          cashbackBalance,
        ) ||
        cashbackBalance <
          transferAmount
      ) {
        const error =
          new Error(
            'Insufficient cashback balance.',
          ) as Error & {
            code: string;
          };

        error.code =
          'INSUFFICIENT';

        throw error;
      }

      /*
       * Lock main wallet.
       */
      const walletResult =
        await tx.execute<{
          id: string;
          balance: string;
        }>(sql`
          SELECT
            id,
            balance
          FROM wallets
          WHERE user_id =
            ${userId}::uuid
          FOR UPDATE
        `);

      const mainWallet =
        walletResult.rows[0];

      if (!mainWallet) {
        throw new Error(
          'Wallet not found.',
        );
      }

      const mainBalance =
        Number(
          mainWallet.balance ??
            0,
        );

      const nextCashback =
        Math.round(
          (
            cashbackBalance -
            transferAmount
          ) * 100,
        ) / 100;

      const nextMain =
        Math.round(
          (
            mainBalance +
            transferAmount
          ) * 100,
        ) / 100;

      newCashbackBalance =
        nextCashback.toFixed(2);

      newMainBalance =
        nextMain.toFixed(2);

      /*
       * Remove from cashback wallet.
       */
      await tx.execute(sql`
        UPDATE cashback_wallets
        SET
          balance =
            ${newCashbackBalance},
          updated_at = NOW()
        WHERE id =
          ${cashbackWallet.id}::uuid
      `);

      /*
       * Add to main wallet.
       */
      await tx.execute(sql`
        UPDATE wallets
        SET
          balance =
            ${newMainBalance},
          updated_at = NOW()
        WHERE id =
          ${mainWallet.id}::uuid
      `);

      /*
       * Create a normal internal wallet
       * transaction for the transfer.
       *
       * txn_type enum supports wallet_fund.
       */
      const transactionResult =
        await tx.execute<{
          id: string;
        }>(sql`
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
            ${userId}::uuid,
            'wallet_fund',
            'Cashback Transfer',
            'internal',
            ${transferAmount.toFixed(2)},
            'success',
            ${makeReference('CB')},
            'Cashback transferred to main wallet',
            ${
              JSON.stringify({
                mode,
                source:
                  'cashback_wallet',
              })
            }::jsonb,
            NOW(),
            NOW()
          )
          RETURNING id
        `);

      const mainTxnId =
        transactionResult.rows[0]
          ?.id ?? null;

      /*
       * Audit the cashback transfer
       * using the ACTUAL schema.
       */
      await tx.execute(sql`
        INSERT INTO cashback_transfers (
          user_id,
          cashback_wallet_id,
          amount,
          balance_before,
          balance_after,
          main_txn_id,
          mode,
          created_at
        )
        VALUES (
          ${userId}::uuid,
          ${cashbackWallet.id}::uuid,
          ${transferAmount.toFixed(2)},
          ${cashbackBalance.toFixed(2)},
          ${newCashbackBalance},
          ${
            mainTxnId
              ? mainTxnId
              : null
          }::uuid,
          ${mode},
          NOW()
        )
      `);
    },
  );

  try {
    await createNotification(
      userId,
      {
        type:
          'transaction',
        title:
          'Cashback Transferred',
        body:
          `₦${transferAmount.toLocaleString(
            'en-NG',
            {
              minimumFractionDigits:
                2,
            },
          )} has been moved to your main wallet.`,
      },
    );
  } catch (error) {
    logger.warn(
      {
        error,
        userId,
      },
      'Cashback transfer notification failed',
    );
  }

  try {
    const io =
      getIo();

    io.to(
      `user:${userId}`,
    ).emit(
      'wallet:updated',
      {
        balance:
          newMainBalance,
      },
    );

    io.to(
      `user:${userId}`,
    ).emit(
      'cashback:updated',
      {
        cashbackBalance:
          newCashbackBalance,
      },
    );
  } catch (error) {
    logger.warn(
      {
        error,
        userId,
      },
      'Cashback transfer socket update failed',
    );
  }

  return {
    success:
      true,
    amount:
      transferAmount,
    newMainBalance,
    newCashbackBalance,
  };
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
    const userId =
      req.session.userId!;

    try {
      const body =
        req.body as {
          network?: string;
          phone?: string;
          dataPlan?: string;
          planCode?: string;
          amount?:
            | number
            | string;
          price?:
            | number
            | string;
          planName?: string;
          reference?: string;
        };

      const network =
        String(
          body.network ?? '',
        ).trim();

      const phone =
        cleanPhoneNumber(
          body.phone,
        );

      const selectedPlan =
        String(
          body.dataPlan ??
            body.planCode ??
            '',
        ).trim();

      if (!network) {
        res.status(400).json({
          success:
            false,
          error:
            'Network is required.',
        });
        return;
      }

      if (
        !/^0\d{10}$/.test(
          phone,
        )
      ) {
        res.status(400).json({
          success:
            false,
          error:
            'Enter a valid Nigerian phone number.',
        });
        return;
      }

      if (!selectedPlan) {
        res.status(400).json({
          success:
            false,
          error:
            'Data plan is required.',
        });
        return;
      }

      const requestId =
        String(
          body.reference ?? '',
        ).trim() ||
        makeReference(
          'DATA',
        );

      /*
       * Idempotency.
       */
      const existing =
        await getExistingTransaction(
          userId,
          requestId,
        );

      if (existing) {
        const wallets =
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
          success:
            existing.status ===
            'success',
          pending:
            existing.status ===
            'pending',
          requestId,
          txnId:
            existing.id,
          balance:
            wallets[0]
              ?.balance ??
            '0',
          status:
            existing.status,
          providerRef:
            existing.provider_reference ??
            null,
          message:
            'Existing transaction returned.',
        });

        return;
      }

      const requestedAmount =
        parseAmount(
          body.amount ??
            body.price,
        );

      logger.info(
        {
          userId,
          network,
          phone,
          dataPlan:
            selectedPlan,
          amount:
            requestedAmount,
          requestId,
        },
        'SME data purchase initiated',
      );

      /*
       * Match the application's pricing
       * rule to the selected SME API plan.
       */
      const pricingResult =
        await db.execute<{
          plan_id: string;
          plan_name: string;
          selling_price: string;
          cost_price: string;
        }>(sql`
          SELECT
            plan_id,
            plan_name,
            selling_price,
            cost_price
          FROM pricing_rules
          WHERE service_type =
            'data'
            AND enabled = true
            AND (
              TRIM(plan_id) =
                TRIM(${selectedPlan})
              OR LOWER(TRIM(plan_name)) =
                LOWER(TRIM(${String(
                  body.planName ??
                    '',
                )}))
            )
            AND (
              LOWER(TRIM(network)) =
                LOWER(TRIM(${network}))
              OR (
                LOWER(TRIM(provider))
                  IN (
                    'smedata',
                    'smeapi'
                  )
                AND TRIM(plan_id) =
                  TRIM(${selectedPlan})
              )
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

      const confirmedAmount =
        pricing
          ? Number(
              pricing.selling_price,
            )
          : requestedAmount;

      if (
        !Number.isFinite(
          confirmedAmount,
        ) ||
        confirmedAmount <= 0
      ) {
        res.status(400).json({
          success:
            false,
          error:
            'Unable to determine data plan price.',
        });
        return;
      }

      /*
       * If our pricing table has a rule,
       * do not allow the client to use
       * another amount.
       */
      if (
        pricing &&
        Math.abs(
          requestedAmount -
            confirmedAmount,
        ) > 0.01
      ) {
        res.status(409).json({
          success:
            false,
          error:
            'The selected plan price has changed. Please refresh and try again.',
          expectedAmount:
            confirmedAmount,
        });
        return;
      }

      const planName =
        pricing?.plan_name ||
        String(
          body.planName ||
            selectedPlan,
        );

      const costPrice =
        pricing
          ? Number(
              pricing.cost_price,
            )
          : confirmedAmount;

      /*
       * Debit customer wallet and create
       * pending transaction atomically.
       */
      const debit =
        await debitWalletAndCreateTransaction(
          {
            userId,
            amount:
              confirmedAmount,
            reference:
              requestId,
            type:
              'data',
            description:
              `Data purchase: ${planName} to ${phone}`,
            metadata: {
              provider:
                'smeapi',
              network,
              planCode:
                selectedPlan,
              planName,
              costPrice,
              sellingPrice:
                confirmedAmount,
            },
          },
        );

      emitTransactionUpdate(
        userId,
        {
          requestId,
          txnId:
            debit.txnId,
          status:
            'pending',
          balance:
            debit.newBalance,
        },
      );

      try {
        await createNotification(
          userId,
          {
            type:
              'transaction',
            title:
              'Data Purchase Processing',
            body:
              `${planName} is being sent to ${phone}.`,
            refId:
              debit.txnId,
          },
        );
      } catch (error) {
        logger.warn(
          {
            error,
            userId,
          },
          'Data processing notification failed',
        );
      }

      /*
       * Send order to SME API.
       */
      let vendorResult;

      try {
        vendorResult =
          await purchaseData({
            network,
            phone,
            dataPlan:
              selectedPlan,
            reference:
              requestId,
          });
      } catch (error) {
        logger.error(
          {
            error,
            userId,
            requestId,
            txnId:
              debit.txnId,
          },
          'SME API data purchase request failed',
        );

        let balance =
          debit.newBalance;

        try {
          balance =
            await refundWalletAndMarkFailed(
              {
                userId,
                txnId:
                  debit.txnId,
                amount:
                  confirmedAmount,
                requestId,
              },
            );
        } catch (refundError) {
          logger.error(
            {
              refundError,
              userId,
              requestId,
              txnId:
                debit.txnId,
            },
            'CRITICAL: data purchase refund failed',
          );
        }

        try {
          await createNotification(
            userId,
            {
              type:
                'transaction',
              title:
                'Data Purchase Failed',
              body:
                `${planName} could not be delivered. Your wallet has been refunded.`,
              refId:
                debit.txnId,
            },
          );
        } catch {
          // Notification failure is non-fatal.
        }

        res.status(502).json({
          success:
            false,
          requestId,
          txnId:
            debit.txnId,
          balance,
          error:
            'The data provider could not process the request. Your wallet has been refunded.',
        });

        return;
      }

      const status =
        normalizeSMEResult(
          vendorResult,
        );

      const providerRef =
        vendorResult.reference ??
        null;

      /*
       * SUCCESS
       */
      if (
        status ===
        'success'
      ) {
        await markTransactionSuccess(
          {
            userId,
            txnId:
              debit.txnId,
            providerRef,
            metadata: {
              vendorStatus:
                status,
              providerRef,
              planCode:
                selectedPlan,
              planName,
              costPrice,
              sellingPrice:
                confirmedAmount,
            },
          },
        );

        let cashback = {
          applied:
            false,
          amount:
            0,
          cashbackBalance:
            '',
        };

        try {
          cashback =
            await applyCashbackIfEligible(
              {
                userId,
                sourceTxnId:
                  debit.txnId,
                requestId,
                planCode:
                  selectedPlan,
                network,
                planName,
                purchaseAmount:
                  confirmedAmount,
              },
            );
        } catch (error) {
          logger.error(
            {
              error,
              userId,
              txnId:
                debit.txnId,
            },
            'Data purchase cashback failed',
          );
        }

        try {
          await createNotification(
            userId,
            {
              type:
                'transaction',
              title:
                'Data Purchase Successful',
              body:
                `${planName} has been sent to ${phone}.`,
              refId:
                debit.txnId,
            },
          );
        } catch {
          // Notification failure is non-fatal.
        }

        res.json({
          success:
            true,
          requestId,
          txnId:
            debit.txnId,
          balance:
            debit.newBalance,
          planCode:
            selectedPlan,
          planName,
          providerRef,
          vendorStatus:
            status,
          cashback,
          message:
            vendorResult.message ||
            'Data purchase successful.',
        });

        return;
      }

      /*
       * PENDING
       */
      if (
        status ===
        'pending'
      ) {
        await markTransactionPending(
          {
            userId,
            txnId:
              debit.txnId,
            providerRef,
            metadata: {
              vendorStatus:
                status,
              providerRef,
              planCode:
                selectedPlan,
              planName,
              costPrice,
              sellingPrice:
                confirmedAmount,
              requiresPolling:
                true,
            },
          },
        );

        logger.info(
          {
            userId,
            requestId,
            txnId:
              debit.txnId,
            providerRef,
          },
          'Data purchase pending',
        );

        res.json({
          success:
            false,
          pending:
            true,
          requestId,
          txnId:
            debit.txnId,
          balance:
            debit.newBalance,
          planCode:
            selectedPlan,
          planName,
          providerRef,
          vendorStatus:
            status,
          message:
            vendorResult.message ||
            'Your data purchase is being processed.',
        });

        return;
      }

      /*
       * FAILURE
       */
      let refundedBalance =
        debit.newBalance;

      try {
        refundedBalance =
          await refundWalletAndMarkFailed(
            {
              userId,
              txnId:
                debit.txnId,
              amount:
                confirmedAmount,
              requestId,
            },
          );
      } catch (refundError) {
        logger.error(
          {
            refundError,
            userId,
            requestId,
            txnId:
              debit.txnId,
          },
          'CRITICAL: data refund failed',
        );
      }

      logger.warn(
        {
          userId,
          requestId,
          txnId:
            debit.txnId,
          planCode:
            selectedPlan,
          vendorStatus:
            status,
        },
        'Data purchase failed — wallet reversed',
      );

      try {
        await createNotification(
          userId,
          {
            type:
              'transaction',
            title:
              'Data Purchase Failed',
            body:
              `${planName} could not be delivered to ${phone}. Your wallet has been refunded.`,
            refId:
              debit.txnId,
          },
        );
      } catch {
        // Notification failure is non-fatal.
      }

      res.status(422).json({
        success:
          false,
        requestId,
        txnId:
          debit.txnId,
        balance:
          refundedBalance,
        vendorStatus:
          status,
        error:
          `SME API returned: failure — ${
            vendorResult.message ||
            'No message'
          }`,
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
        success:
          false,
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
    const userId =
      req.session.userId!;

    try {
      const body =
        req.body as {
          network?: string;
          phone?: string;
          amount?:
            | number
            | string;
          reference?: string;
        };

      const network =
        String(
          body.network ?? '',
        ).trim();

      const phone =
        cleanPhoneNumber(
          body.phone,
        );

      if (!network) {
        res.status(400).json({
          success:
            false,
          error:
            'Network is required.',
        });
        return;
      }

      if (
        !/^0\d{10}$/.test(
          phone,
        )
      ) {
        res.status(400).json({
          success:
            false,
          error:
            'Enter a valid Nigerian phone number.',
        });
        return;
      }

      const amount =
        parseAmount(
          body.amount,
        );

      const requestId =
        String(
          body.reference ?? '',
        ).trim() ||
        makeReference(
          'AIRTIME',
        );

      /*
       * Idempotency.
       */
      const existing =
        await getExistingTransaction(
          userId,
          requestId,
        );

      if (existing) {
        const wallets =
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
          success:
            existing.status ===
            'success',
          pending:
            existing.status ===
            'pending',
          requestId,
          txnId:
            existing.id,
          balance:
            wallets[0]
              ?.balance ??
            '0',
          status:
            existing.status,
          providerRef:
            existing.provider_reference ??
            null,
          message:
            'Existing transaction returned.',
        });

        return;
      }

      const debit =
        await debitWalletAndCreateTransaction(
          {
            userId,
            amount,
            reference:
              requestId,
            type:
              'airtime',
            description:
              `Airtime purchase: ₦${amount.toFixed(
                2,
              )} to ${phone}`,
            metadata: {
              provider:
                'smeapi',
              network,
              amount,
            },
          },
        );

      emitTransactionUpdate(
        userId,
        {
          requestId,
          txnId:
            debit.txnId,
          status:
            'pending',
          balance:
            debit.newBalance,
        },
      );

      try {
        await createNotification(
          userId,
          {
            type:
              'transaction',
            title:
              'Airtime Purchase Processing',
            body:
              `₦${amount.toFixed(
                2,
              )} airtime is being sent to ${phone}.`,
            refId:
              debit.txnId,
          },
        );
      } catch {
        // Notification failure is non-fatal.
      }

      let vendorResult;

      try {
        vendorResult =
          await purchaseAirtime({
            network,
            phone,
            amount,
            reference:
              requestId,
          });
      } catch (error) {
        logger.error(
          {
            error,
            userId,
            requestId,
            txnId:
              debit.txnId,
          },
          'SME API airtime request failed',
        );

        let balance =
          debit.newBalance;

        try {
          balance =
            await refundWalletAndMarkFailed(
              {
                userId,
                txnId:
                  debit.txnId,
                amount,
                requestId,
              },
            );
        } catch (refundError) {
          logger.error(
            {
              refundError,
              userId,
              requestId,
              txnId:
                debit.txnId,
            },
            'CRITICAL: airtime refund failed',
          );
        }

        try {
          await createNotification(
            userId,
            {
              type:
                'transaction',
              title:
                'Airtime Purchase Failed',
              body:
                `Airtime to ${phone} could not be processed. Your wallet has been refunded.`,
              refId:
                debit.txnId,
            },
          );
        } catch {
          // Notification failure is non-fatal.
        }

        res.status(502).json({
          success:
            false,
          requestId,
          txnId:
            debit.txnId,
          balance,
          error:
            'The airtime provider could not process the request. Your wallet has been refunded.',
        });

        return;
      }

      const status =
        normalizeSMEResult(
          vendorResult,
        );

      const providerRef =
        vendorResult.reference ??
        null;

      /*
       * SUCCESS
       */
      if (
        status ===
        'success'
      ) {
        await markTransactionSuccess(
          {
            userId,
            txnId:
              debit.txnId,
            providerRef,
            metadata: {
              vendorStatus:
                status,
              providerRef,
              network,
              amount,
            },
          },
        );

        try {
          await createNotification(
            userId,
            {
              type:
                'transaction',
              title:
                'Airtime Purchase Successful',
              body:
                `₦${amount.toFixed(
                  2,
                )} airtime has been sent to ${phone}.`,
              refId:
                debit.txnId,
            },
          );
        } catch {
          // Notification failure is non-fatal.
        }

        res.json({
          success:
            true,
          requestId,
          txnId:
            debit.txnId,
          balance:
            debit.newBalance,
          providerRef,
          vendorStatus:
            status,
          message:
            vendorResult.message ||
            'Airtime purchase successful.',
        });

        return;
      }

      /*
       * PENDING
       */
      if (
        status ===
        'pending'
      ) {
        await markTransactionPending(
          {
            userId,
            txnId:
              debit.txnId,
            providerRef,
            metadata: {
              vendorStatus:
                status,
              providerRef,
              network,
              amount,
              requiresPolling:
                true,
            },
          },
        );

        res.json({
          success:
            false,
          pending:
            true,
          requestId,
          txnId:
            debit.txnId,
          balance:
            debit.newBalance,
          providerRef,
          vendorStatus:
            status,
          message:
            vendorResult.message ||
            'Your airtime purchase is being processed.',
        });

        return;
      }

      /*
       * FAILURE
       */
      let refundedBalance =
        debit.newBalance;

      try {
        refundedBalance =
          await refundWalletAndMarkFailed(
            {
              userId,
              txnId:
                debit.txnId,
              amount,
              requestId,
            },
          );
      } catch (refundError) {
        logger.error(
          {
            refundError,
            userId,
            requestId,
            txnId:
              debit.txnId,
          },
          'CRITICAL: airtime refund failed',
        );
      }

      try {
        await createNotification(
          userId,
          {
            type:
              'transaction',
            title:
              'Airtime Purchase Failed',
            body:
              `Airtime to ${phone} failed. Your wallet has been refunded.`,
            refId:
              debit.txnId,
          },
        );
      } catch {
        // Notification failure is non-fatal.
      }

      res.status(422).json({
        success:
          false,
        requestId,
        txnId:
          debit.txnId,
        balance:
          refundedBalance,
        vendorStatus:
          status,
        error:
          `SME API returned: failure — ${
            vendorResult.message ||
            'No message'
          }`,
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
        success:
          false,
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
    const userId =
      req.session.userId!;

    const requestId =
      String(
        req.params.requestId ??
          '',
      ).trim();

    try {
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

      /*
       * provider_reference and updated_at exist
       * in PostgreSQL bootstrap schema even though
       * the current Drizzle transaction schema does
       * not expose them.
       */
      const providerResult =
        await db.execute<{
          provider_reference:
            | string
            | null;
        }>(sql`
          SELECT
            provider_reference
          FROM transactions
          WHERE id =
            ${txn.id}::uuid
          LIMIT 1
        `);

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
          providerResult.rows[0]
            ?.provider_reference ??
          null,
        balance:
          wallet?.balance ??
          '0',
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
