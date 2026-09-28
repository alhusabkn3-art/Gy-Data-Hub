import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import { db } from '@workspace/db';

import { sql } from 'drizzle-orm';

import {
  getWalletBalance,
} from '../lib/smeapi.js';

import {
  logger,
} from '../lib/logger.js';

const router =
  Router();

/* ============================================================================
 * SUPER ADMIN AUTH
 * ========================================================================== */

function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (
    !req.session.isAdmin ||
    !req.session.adminId
  ) {
    res.status(401).json({
      error:
        'Admin authentication required.',
    });

    return;
  }

  if (
    req.session.adminRole !==
    'super_admin'
  ) {
    res.status(403).json({
      error:
        'Super admin access required.',
    });

    return;
  }

  next();
}

router.use(
  requireSuperAdmin,
);

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function numberValue(
  value: unknown,
  fallback = 0,
): number {
  const result =
    Number(
      value ?? fallback,
    );

  return Number.isFinite(
    result,
  )
    ? result
    : fallback;
}

function roundMoney(
  value: number,
): number {
  return (
    Math.round(
      value * 100,
    ) / 100
  );
}

function makeReference(
  prefix: string,
): string {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)
    .toUpperCase()}`;
}

function clientIp(
  req: Request,
): string {
  return (
    (
      req.headers[
        'x-forwarded-for'
      ] as string | undefined
    )
      ?.split(',')[0]
      ?.trim() ??
    req.socket?.remoteAddress ??
    'unknown'
  );
}

async function getAdminEmail(
  adminId: string,
): Promise<string> {
  const result =
    await db.execute(
      sql`
        SELECT email
        FROM admin_accounts
        WHERE id =
          ${adminId}::uuid
        LIMIT 1
      `,
    );

  return String(
    (
      result.rows[0] as Record<
        string,
        unknown
      >
    )?.email ??
      'unknown',
  );
}

/* ============================================================================
 * SME CREDIT BALANCE
 *
 * Total SME API balance:
 *   Live balance returned by SME API.
 *
 * Total user wallet balance:
 *   Sum of all customer wallet balances in GY DATA.
 *
 * Remaining credit balance:
 *   SME API balance - total customer wallet balances.
 *
 * This prevents Super Admin from creating customer wallet balances
 * greater than the available SME API backing balance.
 * ========================================================================== */

async function readCreditBalance() {
  const provider =
    await getWalletBalance();

  if (
    !provider.success
  ) {
    throw new Error(
      provider.message ??
        'Unable to read SME API balance.',
    );
  }

  const providerBalance =
    roundMoney(
      numberValue(
        provider.balance,
      ),
    );

  const walletResult =
    await db.execute<{
      total: string;
    }>(
      sql`
        SELECT
          COALESCE(
            SUM(balance),
            0
          )::numeric AS total
        FROM wallets
      `,
    );

  const totalUserWalletBalance =
    roundMoney(
      numberValue(
        walletResult.rows[0]
          ?.total,
      ),
    );

  const rawRemaining =
    roundMoney(
      providerBalance -
        totalUserWalletBalance,
    );

  const remainingCreditBalance =
    Math.max(
      0,
      rawRemaining,
    );

  const overAllocated =
    Math.max(
      0,
      -rawRemaining,
    );

  return {
    providerBalance,
    totalUserWalletBalance,
    remainingCreditBalance,
    overAllocated,
  };
}

/* ============================================================================
 * GET CREDIT BALANCE
 *
 * GET /api/admin/smeapi/credit-balance
 * ========================================================================== */

router.get(
  '/smeapi/credit-balance',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const result =
        await readCreditBalance();

      res.json({
        ok: true,

        provider:
          'smeapi',

        providerBalance:
          result.providerBalance,

        totalSmeApiBalance:
          result.providerBalance,

        totalUserWalletBalance:
          result.totalUserWalletBalance,

        remainingCreditBalance:
          result.remainingCreditBalance,

        overAllocated:
          result.overAllocated,
      });
    } catch (error) {
      logger.error(
        {
          err: error,
        },
        'GET /smeapi/credit-balance failed',
      );

      res.status(502).json({
        ok: false,

        error:
          error instanceof Error
            ? error.message
            : 'Unable to load SME API credit balance.',
      });
    }
  },
);

/* ============================================================================
 * SUPER ADMIN USER WALLET CREDIT
 *
 * POST /api/admin/users/:id/fund-wallet
 *
 * This route is mounted BEFORE admin-compat.ts so it becomes the authoritative
 * Super Admin credit route.
 * ========================================================================== */

router.post(
  '/users/:id/fund-wallet',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      String(
        req.params.id ?? '',
      ).trim();

    const amount =
      roundMoney(
        numberValue(
          req.body?.amount,
        ),
      );

    const reason =
      typeof req.body?.reason ===
      'string'
        ? req.body.reason.trim()
        : '';

    if (!userId) {
      res.status(400).json({
        error:
          'User ID is required.',
      });

      return;
    }

    if (
      !Number.isFinite(
        amount,
      ) ||
      amount <= 0
    ) {
      res.status(400).json({
        error:
          'A valid positive amount is required.',
      });

      return;
    }

    if (
      amount < 0.01
    ) {
      res.status(400).json({
        error:
          'Amount must be at least 0.01.',
      });

      return;
    }

    if (
      reason.length < 10
    ) {
      res.status(400).json({
        error:
          'Reason must be at least 10 characters.',
      });

      return;
    }

    const adminId =
      req.session.adminId!;

    try {
      /*
       * Advisory transaction lock:
       *
       * Only one Super Admin SME-backed wallet credit operation
       * can perform the provider-balance check at a time.
       */
      const result =
        await db.transaction(
          async tx => {
            await tx.execute(
              sql`
                SELECT pg_advisory_xact_lock(
                  hashtext(
                    'gyd-data:smeapi-wallet-credit'
                  )
                )
              `,
            );

            /*
             * Check provider balance while the transaction lock
             * is active.
             */
            const provider =
              await getWalletBalance();

            if (
              !provider.success
            ) {
              throw new Error(
                provider.message ??
                  'Unable to verify SME API balance.',
              );
            }

            const providerBalance =
              roundMoney(
                numberValue(
                  provider.balance,
                ),
              );

            /*
             * Lock the target customer wallet.
             */
            const walletResult =
              await tx.execute(
                sql`
                  SELECT
                    id,
                    balance
                  FROM wallets
                  WHERE user_id =
                    ${userId}::uuid
                  LIMIT 1
                  FOR UPDATE
                `,
              );

            if (
              !walletResult.rows.length
            ) {
              throw new Error(
                'User wallet not found.',
              );
            }

            const wallet =
              walletResult.rows[0] as Record<
                string,
                unknown
              >;

            const walletId =
              String(
                wallet.id,
              );

            const userBalanceBefore =
              roundMoney(
                numberValue(
                  wallet.balance,
                ),
              );

            /*
             * Total customer wallet balances.
             */
            const totalWalletResult =
              await tx.execute<{
                total: string;
              }>(
                sql`
                  SELECT
                    COALESCE(
                      SUM(balance),
                      0
                    )::numeric AS total
                  FROM wallets
                `,
              );

            const totalWalletBalanceBefore =
              roundMoney(
                numberValue(
                  totalWalletResult
                    .rows[0]
                    ?.total,
                ),
              );

            const remainingBefore =
              roundMoney(
                providerBalance -
                  totalWalletBalanceBefore,
              );

            const availableBefore =
              Math.max(
                0,
                remainingBefore,
              );

            /*
             * IMPORTANT:
             *
             * Do not allow the total customer wallet liability
             * to become greater than the live SME API balance.
             */
            if (
              amount >
              availableBefore
            ) {
              const error =
                new Error(
                  `Insufficient SME API credit balance. Available for credit: ₦${availableBefore.toLocaleString(
                    'en-NG',
                    {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    },
                  )}.`,
                );

              (
                error as Error & {
                  code?: string;
                  providerBalance?: number;
                  totalUserWalletBalance?: number;
                  remainingCreditBalance?: number;
                }
              ).code =
                'SME_CREDIT_LIMIT';

              (
                error as Error & {
                  providerBalance?: number;
                }
              ).providerBalance =
                providerBalance;

              (
                error as Error & {
                  totalUserWalletBalance?: number;
                }
              ).totalUserWalletBalance =
                totalWalletBalanceBefore;

              (
                error as Error & {
                  remainingCreditBalance?: number;
                }
              ).remainingCreditBalance =
                availableBefore;

              throw error;
            }

            const userBalanceAfter =
              roundMoney(
                userBalanceBefore +
                  amount,
              );

            const totalWalletBalanceAfter =
              roundMoney(
                totalWalletBalanceBefore +
                  amount,
              );

            const remainingAfter =
              Math.max(
                0,
                roundMoney(
                  providerBalance -
                    totalWalletBalanceAfter,
                ),
              );

            const reference =
              makeReference(
                'ADMINFUND',
              );

            await tx.execute(
              sql`
                UPDATE wallets
                SET
                  balance =
                    ${userBalanceAfter.toFixed(
                      2,
                    )},
                  updated_at =
                    NOW()
                WHERE id =
                  ${walletId}::uuid
              `,
            );

            await tx.execute(
              sql`
                INSERT INTO wallet_ledger
                  (
                    user_id,
                    wallet_id,
                    type,
                    amount,
                    balance_before,
                    balance_after,
                    reference,
                    reason,
                    performed_by,
                    created_at
                  )
                VALUES
                  (
                    ${userId}::uuid,
                    ${walletId}::uuid,
                    'credit',
                    ${amount.toFixed(
                      2,
                    )},
                    ${userBalanceBefore.toFixed(
                      2,
                    )},
                    ${userBalanceAfter.toFixed(
                      2,
                    )},
                    ${reference},
                    ${reason},
                    ${adminId}::uuid,
                    NOW()
                  )
              `,
            );

            return {
              reference,

              userBalanceBefore,

              userBalanceAfter,

              providerBalance,

              totalUserWalletBalanceBefore:
                totalWalletBalanceBefore,

              totalUserWalletBalanceAfter:
                totalWalletBalanceAfter,

              remainingCreditBalance:
                remainingAfter,
            };
          },
        );

      /*
       * Financial audit.
       */
      const adminEmail =
        await getAdminEmail(
          adminId,
        );

      try {
        await db.execute(
          sql`
            INSERT INTO admin_audit_logs
              (
                admin_id,
                admin_email,
                action,
                target_type,
                target_id,
                target_label,
                details,
                ip
              )
            VALUES
              (
                ${adminId}::uuid,
                ${adminEmail},
                'wallet_funded',
                'user',
                ${userId},
                ${userId},
                ${JSON.stringify({
                  amount,
                  reference:
                    result.reference,
                  balanceBefore:
                    result.userBalanceBefore,
                  balanceAfter:
                    result.userBalanceAfter,
                  providerBalance:
                    result.providerBalance,
                  totalUserWalletBalance:
                    result.totalUserWalletBalanceAfter,
                  remainingCreditBalance:
                    result.remainingCreditBalance,
                  reason,
                })},
                ${clientIp(req)}
              )
          `,
        );
      } catch (auditError) {
        logger.warn(
          {
            err: auditError,
          },
          'SME credit admin audit insert failed',
        );
      }

      res.json({
        ok: true,

        reference:
          result.reference,

        balanceBefore:
          result.userBalanceBefore,

        balanceAfter:
          result.userBalanceAfter,

        balance:
          result.userBalanceAfter,

        smeApiBalance:
          result.providerBalance,

        totalSmeApiBalance:
          result.providerBalance,

        totalUserWalletBalance:
          result.totalUserWalletBalanceAfter,

        remainingCreditBalance:
          result.remainingCreditBalance,
      });
    } catch (error) {
      const typed =
        error as Error & {
          code?: string;
          providerBalance?: number;
          totalUserWalletBalance?: number;
          remainingCreditBalance?: number;
        };

      if (
        typed.code ===
        'SME_CREDIT_LIMIT'
      ) {
        res.status(400).json({
          ok: false,

          error:
            typed.message,

          code:
            typed.code,

          smeApiBalance:
            typed.providerBalance ??
            0,

          totalUserWalletBalance:
            typed.totalUserWalletBalance ??
            0,

          remainingCreditBalance:
            typed.remainingCreditBalance ??
            0,
        });

        return;
      }

      if (
        typed.message ===
        'User wallet not found.'
      ) {
        res.status(404).json({
          ok: false,
          error:
            typed.message,
        });

        return;
      }

      if (
        typed.message ===
        'Amount must be at least 0.01.' ||
        typed.message ===
          'Reason must be at least 10 characters.'
      ) {
        res.status(400).json({
          ok: false,
          error:
            typed.message,
        });

        return;
      }

      logger.error(
        {
          err: error,
          userId,
        },
        'POST /users/:id/fund-wallet failed',
      );

      res.status(502).json({
        ok: false,

        error:
          typed.message ||
          'Failed to credit user wallet.',
      });
    }
  },
);

export default router;
