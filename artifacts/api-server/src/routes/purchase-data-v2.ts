import {
  Router,
  type Request,
  type Response,
} from 'express';

import { sql } from 'drizzle-orm';

import { db } from '@workspace/db';

import {
  purchaseData,
} from '../lib/smeapi.js';

import {
  requireAuth,
} from './user.js';

import {
  verifyPin,
} from '../lib/auth.js';

import {
  logger,
} from '../lib/logger.js';

import {
  createNotification,
} from '../lib/notifications.js';

import {
  getIo,
} from '../lib/socket.js';

const router =
  Router();

/* ============================================================================
 * TYPES
 * ========================================================================== */

type PricingRule = {
  id: string;

  provider: string;

  network:
    | string
    | null;

  plan_id:
    | string
    | null;

  plan_name:
    | string
    | null;

  cost_price:
    | string
    | number;

  selling_price:
    | string
    | number;

  cashback_enabled: boolean;

  cashback_type:
    | 'percentage'
    | 'fixed';

  cashback_value:
    | string
    | number;
};

type ProviderResult = {
  success?: boolean;
  status?: string;
  message?: string;
  reference?: string;
  ref?: string;
  raw?: unknown;
};

/* ============================================================================
 * NUMBER HELPERS
 * ========================================================================== */

function number(
  value: unknown,
): number {
  const n =
    Number(
      String(value ?? '')
        .replace(/₦/g, '')
        .replace(/,/g, '')
        .trim(),
    );

  return Number.isFinite(n)
    ? n
    : 0;
}

function money(
  value: number,
): number {
  return (
    Math.round(
      (value +
        Number.EPSILON) *
        100,
    ) / 100
  );
}

/* ============================================================================
 * NETWORK
 * ========================================================================== */

function network(
  value: unknown,
): string {
  const raw =
    String(value ?? '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '');

  if (
    raw ===
    'globacom'
  ) {
    return 'glo';
  }

  if (
    raw ===
    'etisalat'
  ) {
    return '9mobile';
  }

  return raw;
}

/* ============================================================================
 * PHONE
 * ========================================================================== */

function phone(
  value: unknown,
): string {
  return String(
    value ?? '',
  )
    .replace(/\D/g, '')
    .trim();
}

/* ============================================================================
 * PLAN NAME NORMALIZATION
 * ========================================================================== */

function normalizeText(
  value: unknown,
): string {
  return String(
    value ?? '',
  )
    .trim()
    .toLowerCase()
    .replace(
      /[()[\]{}]/g,
      ' ',
    )
    .replace(
      /[_\-/]+/g,
      ' ',
    )
    .replace(
      /\s+/g,
      ' ',
    )
    .trim();
}

function compact(
  value: unknown,
): string {
  return normalizeText(
    value,
  ).replace(
    /[^a-z0-9]/g,
    '',
  );
}

function planNamesMatch(
  first: unknown,
  second: unknown,
): boolean {
  const a =
    normalizeText(first);

  const b =
    normalizeText(second);

  if (!a || !b) {
    return false;
  }

  if (
    a === b ||
    compact(a) ===
      compact(b)
  ) {
    return true;
  }

  const aTokens =
    a
      .split(' ')
      .filter(Boolean);

  const bTokens =
    new Set(
      b
        .split(' ')
        .filter(Boolean),
    );

  return (
    aTokens.length > 0 &&
    aTokens.every(
      token =>
        bTokens.has(
          token,
        ),
    )
  );
}

/* ============================================================================
 * PROVIDER STATUS
 * ========================================================================== */

function providerStatus(
  result: ProviderResult,
): string {
  return String(
    result.status ?? '',
  )
    .trim()
    .toLowerCase();
}

function providerSucceeded(
  result: ProviderResult,
): boolean {
  const value =
    providerStatus(
      result,
    );

  return (
    [
      'success',
      'successful',
      'completed',
      'complete',
      'delivered',
    ].includes(value) ||
    result.success === true
  );
}

function providerPending(
  result: ProviderResult,
): boolean {
  return [
    'pending',
    'processing',
    'queued',
    'in_progress',
    'in-progress',
  ].includes(
    providerStatus(
      result,
    ),
  );
}

function providerMessage(
  result: ProviderResult,
): string {
  return String(
    result.message ?? '',
  ).trim();
}

function providerReference(
  result: ProviderResult,
  fallback: string,
): string {
  return (
    String(
      result.reference ??
        result.ref ??
        fallback,
    ).trim() ||
    fallback
  );
}

/* ============================================================================
 * PRICING RULE
 *
 * We NEVER trust the price sent by the phone.
 * The database selling_price is authoritative.
 * ========================================================================== */

async function getPricingRule(
  networkName: string,
  planId: string,
  planName: string,
): Promise<
  PricingRule | null
> {
  const result =
    await db.execute<PricingRule>(
      sql`
        SELECT
          id,
          provider,
          network,
          plan_id,
          plan_name,
          cost_price,
          selling_price,
          cashback_enabled,
          cashback_type,
          cashback_value
        FROM pricing_rules
        WHERE service_type = 'data'
          AND enabled = true
          AND selling_price > 0
          AND (
            UPPER(
              COALESCE(
                network,
                ''
              )
            ) =
              UPPER(
                ${networkName}
              )
            OR network IS NULL
          )
          AND (
            LOWER(
              TRIM(
                COALESCE(
                  plan_id,
                  ''
                )
              )
            ) =
              LOWER(
                TRIM(
                  ${planId}
                )
              )
            OR (
              ${planName} <> ''
              AND LOWER(
                TRIM(
                  COALESCE(
                    plan_name,
                    ''
                  )
                )
              ) =
                LOWER(
                  TRIM(
                    ${planName}
                  )
                )
            )
          )
        ORDER BY
          updated_at DESC NULLS LAST
        LIMIT 1
      `,
    );

  return (
    result.rows[0] ??
    null
  );
}

/* ============================================================================
 * CASHBACK SETTINGS
 * ========================================================================== */

async function getCashbackSettings(): Promise<{
  enabled: boolean;
  minTransferAmount: number;
  transferMode:
    | 'manual'
    | 'auto';
  eligibleServices: string[];
}> {
  const result =
    await db.execute<{
      enabled: boolean;
      min_transfer_amount: string;
      transfer_mode: string;
      eligible_services: unknown;
    }>(
      sql`
        SELECT
          enabled,
          min_transfer_amount,
          transfer_mode,
          eligible_services
        FROM cashback_settings
        LIMIT 1
      `,
    );

  const row =
    result.rows[0];

  const eligibleServices =
    Array.isArray(
      row?.eligible_services,
    )
      ? row.eligible_services.map(
          String,
        )
      : ['data'];

  return {
    enabled:
      row?.enabled ??
      false,

    minTransferAmount:
      number(
        row?.min_transfer_amount ??
          100,
      ),

    transferMode:
      row?.transfer_mode ===
      'auto'
        ? 'auto'
        : 'manual',

    eligibleServices,
  };
}

/* ============================================================================
 * CASHBACK CALCULATION
 * ========================================================================== */

function calculateCashback(
  rule: PricingRule,
  amount: number,
): number {
  if (
    !rule.cashback_enabled
  ) {
    return 0;
  }

  const value =
    number(
      rule.cashback_value,
    );

  if (value <= 0) {
    return 0;
  }

  if (
    rule.cashback_type ===
    'percentage'
  ) {
    return money(
      amount *
        (value / 100),
    );
  }

  return money(value);
}

/* ============================================================================
 * PURCHASE PIN
 * ========================================================================== */

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
  if (
    !/^\d{4}$/.test(
      purchasePin,
    )
  ) {
    return {
      ok: false,
      status: 400,
      error:
        'Purchase PIN must be exactly 4 digits.',
      code:
        'PURCHASE_PIN_REQUIRED',
    };
  }

  const result =
    await db.execute<{
      purchase_pin_hash:
        | string
        | null;
    }>(
      sql`
        SELECT
          purchase_pin_hash
        FROM users
        WHERE id =
          ${userId}::uuid
        LIMIT 1
      `,
    );

  const hash =
    result.rows[0]
      ?.purchase_pin_hash;

  if (!hash) {
    return {
      ok: false,
      status: 400,
      error:
        'Purchase PIN is not configured. Please set a Purchase PIN before buying.',
      code:
        'PURCHASE_PIN_NOT_CONFIGURED',
    };
  }

  if (
    !(await verifyPin(
      purchasePin,
      hash,
    ))
  ) {
    return {
      ok: false,
      status: 401,
      error:
        'Incorrect purchase PIN.',
      code:
        'INVALID_PURCHASE_PIN',
    };
  }

  return {
    ok: true,
  };
}

/* ============================================================================
 * WALLET
 * ========================================================================== */

async function getWallet(
  userId: string,
): Promise<{
  id: string;
  balance: number;
} | null> {
  const result =
    await db.execute<{
      id: string;
      balance: string;
    }>(
      sql`
        SELECT
          id,
          balance
        FROM wallets
        WHERE user_id =
          ${userId}::uuid
        LIMIT 1
      `,
    );

  if (
    !result.rows[0]
  ) {
    return null;
  }

  return {
    id:
      result.rows[0].id,

    balance:
      number(
        result.rows[0]
          .balance,
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
    }>(
      sql`
        UPDATE wallets
        SET
          balance =
            balance - ${amount},
          updated_at =
            NOW()
        WHERE user_id =
          ${userId}::uuid
          AND balance >=
            ${amount}
        RETURNING balance
      `,
    );

  if (
    !result.rows[0]
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

  return number(
    result.rows[0]
      .balance,
  );
}

async function refundWallet(
  userId: string,
  amount: number,
): Promise<number> {
  const result =
    await db.execute<{
      balance: string;
    }>(
      sql`
        UPDATE wallets
        SET
          balance =
            balance + ${amount},
          updated_at =
            NOW()
        WHERE user_id =
          ${userId}::uuid
        RETURNING balance
      `,
    );

  if (
    !result.rows[0]
  ) {
    throw new Error(
      'Main wallet not found while refunding purchase.',
    );
  }

  return number(
    result.rows[0]
      .balance,
  );
}

/* ============================================================================
 * WALLET LEDGER
 * ========================================================================== */

async function walletLedger(
  userId: string,
  amount: number,
  type: string,
  reference: string,
  description: string,
  transactionId?: string,
): Promise<void> {
  const wallet =
    await getWallet(
      userId,
    );

  if (!wallet) {
    return;
  }

  const balanceAfter =
    type === 'debit'
      ? wallet.balance
      : wallet.balance +
        amount;

  const balanceBefore =
    type === 'debit'
      ? balanceAfter +
        amount
      : balanceAfter -
        amount;

  await db
    .execute(
      sql`
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
          ${Math.abs(
            amount,
          )},
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
      `,
    )
    .catch(error => {
      logger.warn(
        {
          error,
          userId,
          reference,
        },
        'Wallet ledger insert failed',
      );
    });
}

/* ============================================================================
 * TRANSACTION CREATION
 * ========================================================================== */

async function createTransaction(
  userId: string,
  rule: PricingRule,
  networkName: string,
  phoneNumber: string,
  amount: number,
  reference: string,
  metadata: Record<
    string,
    unknown
  >,
): Promise<string> {
  const result =
    await db.execute<{
      id: string;
    }>(
      sql`
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
          'data',
          'data',
          ${
            rule.provider ||
            'GY DATA'
          },
          ${amount},
          ${number(
            rule.cost_price,
          )},
          'pending',
          ${reference},
          ${
            `Data purchase - ${networkName} ${phoneNumber}`
          },
          ${JSON.stringify(
            {
              ...metadata,
              network:
                networkName,
              phone:
                phoneNumber,
              costPrice:
                number(
                  rule.cost_price,
                ),
            },
          )}::jsonb
        )
        RETURNING id
      `,
    );

  const id =
    result.rows[0]?.id;

  if (!id) {
    throw new Error(
      'Unable to create purchase transaction.',
    );
  }

  return id;
}

/* ============================================================================
 * TRANSACTION UPDATE
 * ========================================================================== */

async function updateTransaction(
  transactionId: string,
  statusValue:
    | 'success'
    | 'pending'
    | 'failed',
  reference: string,
  providerRef?: string,
  message?: string,
): Promise<void> {
  await db.execute(
    sql`
      UPDATE transactions
      SET
        status =
          ${statusValue},

        reference =
          ${reference},

        provider_reference =
          ${providerRef ||
          null},

        metadata =
          COALESCE(
            metadata,
            '{}'::jsonb
          ) ||
          ${JSON.stringify({
            providerReference:
              providerRef ??
              null,
            providerMessage:
              message ??
              null,
          })}::jsonb,

        updated_at =
          NOW()

      WHERE id =
        ${transactionId}::uuid
    `,
  );
}

/* ============================================================================
 * CREDIT CASHBACK
 *
 * IMPORTANT:
 * cashback_transactions.source_txn_id is unique.
 * This makes cashback idempotent even if the same purchase is processed again.
 * ========================================================================== */

async function creditCashback(params: {
  userId: string;
  sourceTxnId: string;
  amount: number;
  type:
    | 'percentage'
    | 'fixed';
  value: number;
  network: string;
  planId: string;
  planName: string;
}): Promise<number> {
  if (
    params.amount <= 0
  ) {
    return 0;
  }

  const reference =
    `CB-${params.sourceTxnId}`;

  const balance =
    await db.transaction(
      async tx => {
        const inserted =
          await tx.execute<{
            id: string;
          }>(
            sql`
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
                ${params.userId}::uuid,
                ${params.sourceTxnId}::uuid,
                ${params.amount},
                ${params.type},
                ${params.value},
                ${params.network},
                ${params.planId},
                ${params.planName},
                ${reference},
                NOW()
              )
              ON CONFLICT (
                source_txn_id
              )
              DO NOTHING
              RETURNING id
            `,
          );

        if (
          !inserted.rows[0]
        ) {
          const existing =
            await tx.execute<{
              balance: string;
            }>(
              sql`
                SELECT
                  balance
                FROM cashback_wallets
                WHERE user_id =
                  ${params.userId}::uuid
                LIMIT 1
              `,
            );

          return number(
            existing.rows[0]
              ?.balance ??
              0,
          );
        }

        const wallet =
          await tx.execute<{
            balance: string;
          }>(
            sql`
              INSERT INTO cashback_wallets (
                user_id,
                balance,
                updated_at
              )
              VALUES (
                ${params.userId}::uuid,
                ${params.amount},
                NOW()
              )
              ON CONFLICT (
                user_id
              )
              DO UPDATE SET
                balance =
                  cashback_wallets.balance +
                  ${params.amount},
                updated_at =
                  NOW()
              RETURNING balance
            `,
          );

        return number(
          wallet.rows[0]
            ?.balance ??
            0,
        );
      },
    );

  return balance;
}

/* ============================================================================
 * TRANSFER CASHBACK TO MAIN WALLET
 * ========================================================================== */

export async function transferCashbackToMain(
  userId: string,
  amount: number,
  mode = 'manual',
) {
  if (
    !Number.isFinite(
      amount,
    ) ||
    amount <= 0
  ) {
    const error =
      new Error(
        'Invalid cashback transfer amount.',
      );

    (
      error as Error & {
        code?: string;
      }
    ).code =
      'INVALID_AMOUNT';

    throw error;
  }

  return db.transaction(
    async tx => {
      const cashback =
        await tx.execute<{
          id: string;
          balance: string;
        }>(
          sql`
            UPDATE cashback_wallets
            SET
              balance =
                balance - ${amount},
              updated_at =
                NOW()
            WHERE user_id =
              ${userId}::uuid
              AND balance >=
                ${amount}
            RETURNING
              id,
              balance
          `,
        );

      if (
        !cashback.rows[0]
      ) {
        const error =
          new Error(
            'Insufficient cashback balance.',
          );

        (
          error as Error & {
            code?: string;
          }
        ).code =
          'INSUFFICIENT';

        throw error;
      }

      const main =
        await tx.execute<{
          balance: string;
        }>(
          sql`
            UPDATE wallets
            SET
              balance =
                balance + ${amount},
              updated_at =
                NOW()
            WHERE user_id =
              ${userId}::uuid
            RETURNING balance
          `,
        );

      if (
        !main.rows[0]
      ) {
        const error =
          new Error(
            'Main wallet not found.',
          );

        (
          error as Error & {
            code?: string;
          }
        ).code =
          'WALLET_NOT_FOUND';

        throw error;
      }

      const newCashbackBalance =
        number(
          cashback.rows[0]
            .balance,
        );

      const newMainBalance =
        number(
          main.rows[0]
            .balance,
        );

      await tx.execute(
        sql`
          INSERT INTO cashback_transfers (
            user_id,
            cashback_wallet_id,
            amount,
            balance_before,
            balance_after,
            mode,
            created_at
          )
          VALUES (
            ${userId}::uuid,
            ${cashback.rows[0].id}::uuid,
            ${amount},
            ${
              newCashbackBalance +
              amount
            },
            ${newCashbackBalance},
            ${mode},
            NOW()
          )
        `,
      );

      return {
        transferred:
          money(amount),

        newMainBalance,

        newCashbackBalance,
      };
    },
  );
}

/* ============================================================================
 * NOTIFICATION
 * ========================================================================== */

async function notify(
  userId: string,
  title: string,
  body: string,
  transactionId?: string,
): Promise<void> {
  await createNotification(
    userId,
    {
      type:
        'transaction',
      title,
      body,
      refId:
        transactionId ??
        null,
    },
  ).catch(
    () => undefined,
  );

  try {
    getIo()
      .to(`user:${userId}`)
      .emit(
        'transaction:updated',
        {
          transactionId,
        },
      );
  } catch {
    // Socket delivery is non-critical.
  }
}

/* ============================================================================
 * DATA PURCHASE
 *
 * New endpoint:
 * POST /api/purchase/data-safe
 * ========================================================================== */

router.post(
  '/data-safe',
  requireAuth,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const body =
      (req.body ??
        {}) as Record<
        string,
        unknown
      >;

    const networkName =
      network(
        body.network,
      );

    const phoneNumber =
      phone(
        body.phone,
      );

    const planId =
      String(
        body.planCode ??
          '',
      ).trim();

    const planName =
      String(
        body.planName ??
          '',
      ).trim();

    const purchasePin =
      String(
        body.purchasePin ??
          '',
      ).trim();

    /*
     * FIX:
     * Frontend sends idempotency through HTTP header.
     * We also accept body.idempotencyKey for compatibility.
     */
    const idempotency =
      String(
        req.get(
          'Idempotency-Key',
        ) ??
          body.idempotencyKey ??
          '',
      ).trim();

    /* ------------------------------------------------------------------------
     * PIN
     * ---------------------------------------------------------------------- */

    const pin =
      await verifyPurchasePin(
        userId,
        purchasePin,
      );

    if (!pin.ok) {
      res
        .status(
          pin.status,
        )
        .json({
          success: false,
          error:
            pin.error,
          code:
            pin.code,
        });

      return;
    }

    /* ------------------------------------------------------------------------
     * BASIC VALIDATION
     * ---------------------------------------------------------------------- */

    if (
      ![
        'mtn',
        'airtel',
        'glo',
        '9mobile',
      ].includes(
        networkName,
      )
    ) {
      res
        .status(400)
        .json({
          success: false,
          error:
            'Unsupported network.',
        });

      return;
    }

    if (
      !/^0\d{10}$/.test(
        phoneNumber,
      )
    ) {
      res
        .status(400)
        .json({
          success: false,
          error:
            'Invalid Nigerian phone number.',
        });

      return;
    }

    if (!planId) {
      res
        .status(400)
        .json({
          success: false,
          error:
            'Data plan is required.',
        });

      return;
    }

    /* ------------------------------------------------------------------------
     * IDEMPOTENCY
     * ---------------------------------------------------------------------- */

    if (idempotency) {
      const existing =
        await db.execute<{
          id: string;
          status: string;
          reference:
            | string
            | null;
          amount: string;
        }>(
          sql`
            SELECT
              id,
              status,
              reference,
              amount
            FROM transactions
            WHERE user_id =
              ${userId}::uuid
              AND metadata->>
                'idempotencyKey' =
                ${idempotency}
            LIMIT 1
          `,
        );

      if (
        existing.rows[0]
      ) {
        res.json({
          success: true,
          status:
            existing.rows[0]
              .status,

          pending:
            existing.rows[0]
              .status ===
            'pending',

          transactionId:
            existing.rows[0]
              .id,

          reference:
            existing.rows[0]
              .reference,

          amount:
            number(
              existing.rows[0]
                .amount,
            ),
        });

        return;
      }
    }

    /* ------------------------------------------------------------------------
     * PRICING
     * ---------------------------------------------------------------------- */

    const rule =
      await getPricingRule(
        networkName,
        planId,
        planName,
      );

    if (!rule) {
      res
        .status(400)
        .json({
          success: false,
          error:
            'Data purchase is currently unavailable for this plan.',
        });

      return;
    }

    /*
     * IMPORTANT:
     * The backend selling price is authoritative.
     */
    const amount =
      number(
        rule.selling_price,
      );

    if (amount <= 0) {
      res
        .status(400)
        .json({
          success: false,
          error:
            'Invalid data pricing configuration.',
        });

      return;
    }

    /* ------------------------------------------------------------------------
     * WALLET CHECK
     * ---------------------------------------------------------------------- */

    const wallet =
      await getWallet(
        userId,
      );

    if (
      !wallet ||
      wallet.balance <
        amount
    ) {
      res
        .status(400)
        .json({
          success: false,
          error:
            'Insufficient wallet balance.',
          code:
            'INSUFFICIENT',
        });

      return;
    }

    /* ------------------------------------------------------------------------
     * DEBIT
     * ---------------------------------------------------------------------- */

    const balanceAfterDebit =
      await debitWallet(
        userId,
        amount,
      );

    /*
     * Deterministic reference when idempotency is present.
     * This adds another protection against duplicate debits.
     */
    const reference =
      idempotency
        ? `DATA-${idempotency
            .replace(
              /[^A-Za-z0-9_-]/g,
              '',
            )
            .slice(
              0,
              70,
            )}`
        : `DATA-${Date.now()}-${Math.random()
            .toString(36)
            .slice(
              2,
              9,
            )
            .toUpperCase()}`;

    let transactionId =
      '';

    /* ------------------------------------------------------------------------
     * CREATE INTERNAL TRANSACTION
     * ---------------------------------------------------------------------- */

    try {
      transactionId =
        await createTransaction(
          userId,
          rule,
          networkName,
          phoneNumber,
          amount,
          reference,
          {
            idempotencyKey:
              idempotency ||
              null,

            planCode:
              planId,

            planName,

            requestedPrice:
              number(
                body.planPrice ??
                  body.amount,
              ),
          },
        );

      await walletLedger(
        userId,
        amount,
        'debit',
        reference,
        `Data purchase - ${networkName} ${phoneNumber}`,
        transactionId,
      );
    } catch (error) {
      await refundWallet(
        userId,
        amount,
      ).catch(
        () => undefined,
      );

      logger.error(
        {
          error,
          userId,
          reference,
        },
        'Failed to create data purchase transaction',
      );

      res
        .status(500)
        .json({
          success: false,
          error:
            'Unable to create purchase transaction. Your wallet has been refunded.',
        });

      return;
    }

    /* ------------------------------------------------------------------------
     * PROVIDER PURCHASE
     * ---------------------------------------------------------------------- */

    let providerResult:
      ProviderResult;

    try {
      providerResult =
        await purchaseData({
          network:
            networkName,

          phone:
            phoneNumber,

          dataPlan:
            planId,

          reference,
        });
    } catch (error) {
      await refundWallet(
        userId,
        amount,
      ).catch(
        () => undefined,
      );

      await updateTransaction(
        transactionId,
        'failed',
        reference,
        undefined,
        error instanceof Error
          ? error.message
          : 'Provider request failed.',
      );

      res
        .status(502)
        .json({
          success: false,

          error:
            'Data provider is unavailable. Your wallet has been refunded.',

          reference,

          transactionId,
        });

      return;
    }

    const providerRef =
      providerReference(
        providerResult,
        reference,
      );

    const message =
      providerMessage(
        providerResult,
      );

    /* ------------------------------------------------------------------------
     * SUCCESS
     * ---------------------------------------------------------------------- */

    if (
      providerSucceeded(
        providerResult,
      )
    ) {
      await updateTransaction(
        transactionId,
        'success',
        reference,
        providerRef,
        message,
      );

      const settings =
        await getCashbackSettings();

      let cashbackAmount =
        0;

      let cashbackBalance =
        0;

      const eligible =
        settings.eligibleServices
          .map(
            value =>
              value
                .toLowerCase()
                .trim(),
          )
          .includes(
            'data',
          );

      /*
       * Cashback is ONLY credited when:
       *
       * 1. Global cashback is enabled
       * 2. Data is eligible
       * 3. The specific pricing rule enables cashback
       * 4. Provider purchase succeeded
       */
      if (
        settings.enabled &&
        eligible
      ) {
        cashbackAmount =
          calculateCashback(
            rule,
            amount,
          );

        if (
          cashbackAmount >
          0
        ) {
          cashbackBalance =
            await creditCashback({
              userId,

              sourceTxnId:
                transactionId,

              amount:
                cashbackAmount,

              type:
                rule.cashback_type,

              value:
                number(
                  rule.cashback_value,
                ),

              network:
                networkName,

              planId,

              planName:
                planName ||
                rule.plan_name ||
                '',
            });

          /*
           * AUTO TRANSFER
           */
          if (
            settings.transferMode ===
              'auto' &&
            cashbackBalance >=
              settings.minTransferAmount
          ) {
            try {
              const transfer =
                await transferCashbackToMain(
                  userId,
                  cashbackBalance,
                  'auto',
                );

              cashbackBalance =
                transfer.newCashbackBalance;
            } catch (error) {
              logger.warn(
                {
                  error,
                  userId,
                },
                'Automatic cashback transfer failed',
              );
            }
          }
        }
      }

      await notify(
        userId,
        'Data purchase successful',
        `${
          planName ||
          rule.plan_name ||
          planId
        } was successfully sent to ${phoneNumber}.`,
        transactionId,
      );

      try {
        getIo()
          .to(
            `user:${userId}`,
          )
          .emit(
            'wallet:updated',
            {
              balance:
                balanceAfterDebit,
            },
          );

        getIo()
          .to(
            `user:${userId}`,
          )
          .emit(
            'cashback:updated',
            {
              cashbackBalance,
            },
          );
      } catch {
        // Socket notification is non-critical.
      }

      res.json({
        success: true,

        status:
          'success',

        pending:
          false,

        message:
          message ||
          'Data purchase successful.',

        reference,

        providerReference:
          providerRef,

        transactionId,

        amount,

        balance:
          balanceAfterDebit,

        network:
          networkName,

        phone:
          phoneNumber,

        planName:
          planName ||
          rule.plan_name ||
          planId,

        cashbackApplied:
          cashbackAmount >
          0,

        cashbackAmount,
      });

      return;
    }

    /* ------------------------------------------------------------------------
     * PENDING
     * ---------------------------------------------------------------------- */

    if (
      providerPending(
        providerResult,
      )
    ) {
      await updateTransaction(
        transactionId,
        'pending',
        reference,
        providerRef,
        message,
      );

      await notify(
        userId,
        'Data purchase pending',
        `${
          planName ||
          rule.plan_name ||
          planId
        } is still being processed for ${phoneNumber}.`,
        transactionId,
      );

      res.json({
        success: true,

        status:
          'pending',

        pending:
          true,

        message:
          message ||
          'Data purchase is pending.',

        reference,

        providerReference:
          providerRef,

        transactionId,

        amount,

        balance:
          balanceAfterDebit,

        network:
          networkName,

        phone:
          phoneNumber,

        planName:
          planName ||
          rule.plan_name ||
          planId,

        cashbackApplied:
          false,

        cashbackAmount:
          0,
      });

      return;
    }

    /* ------------------------------------------------------------------------
     * FAILED
     * ---------------------------------------------------------------------- */

    await refundWallet(
      userId,
      amount,
    ).catch(
      () => undefined,
    );

    await updateTransaction(
      transactionId,
      'failed',
      reference,
      providerRef,
      message,
    );

    res
      .status(502)
      .json({
        success: false,

        status:
          'failed',

        error:
          message ||
          'Data provider rejected the purchase. Your wallet has been refunded.',

        reference,

        transactionId,
      });
  },
);

export default router;
