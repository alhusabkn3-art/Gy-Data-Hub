/**
 * User-facing cashback routes.
 *
 * Routes:
 *
 * GET  /api/cashback-user/settings
 * GET  /api/cashback-user/wallet
 * POST /api/cashback-user/transfer
 * GET  /api/cashback-user/history
 */

import {
  Router,
  type Request,
  type Response,
} from 'express';

import { sql } from 'drizzle-orm';

import { db } from '@workspace/db';

import {
  requireAuth,
} from './user.js';

import {
  transferCashbackToMain,
} from './purchase-data-v2.js';

import {
  logger,
} from '../lib/logger.js';

import {
  getIo,
} from '../lib/socket.js';

import {
  createNotification,
} from '../lib/notifications.js';

const router =
  Router();

router.use(
  requireAuth,
);

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function amount(
  value: unknown,
): number {
  const n =
    Number(
      String(value ?? '')
        .replace(/,/g, '')
        .trim(),
    );

  return Number.isFinite(n)
    ? n
    : 0;
}

async function readSettings() {
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
      amount(
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
 * SETTINGS
 * ========================================================================== */

router.get(
  '/settings',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      res.json(
        await readSettings(),
      );
    } catch (error) {
      logger.error(
        {
          error,
        },
        'GET /cashback-user/settings failed',
      );

      res
        .status(500)
        .json({
          error:
            'Failed to load cashback settings.',
        });
    }
  },
);

/* ============================================================================
 * WALLET
 *
 * IMPORTANT:
 * We return BOTH:
 *
 * 1. flat fields
 * 2. settings object
 *
 * because AppContext currently expects data.settings.
 * ========================================================================== */

router.get(
  '/wallet',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    try {
      const [
        walletResult,
        settings,
      ] = await Promise.all([
        db.execute<{
          balance: string;
        }>(
          sql`
            SELECT
              balance
            FROM cashback_wallets
            WHERE user_id =
              ${userId}::uuid
            LIMIT 1
          `,
        ),

        readSettings(),
      ]);

      const balance =
        amount(
          walletResult.rows[0]
            ?.balance ??
            0,
        );

      res.json({
        balance,

        cashbackEnabled:
          settings.enabled,

        minTransferAmount:
          settings.minTransferAmount,

        transferMode:
          settings.transferMode,

        eligibleServices:
          settings.eligibleServices,

        settings,
      });
    } catch (error) {
      logger.error(
        {
          error,
          userId,
        },
        'GET /cashback-user/wallet failed',
      );

      res
        .status(500)
        .json({
          error:
            'Failed to load cashback wallet.',
        });
    }
  },
);

/* ============================================================================
 * TRANSFER
 * ========================================================================== */

router.post(
  '/transfer',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const requested =
      req.body?.amount;

    try {
      const settings =
        await readSettings();

      if (
        !settings.enabled
      ) {
        res
          .status(400)
          .json({
            error:
              'Cashback system is currently disabled.',
          });

        return;
      }

      if (
        settings.transferMode ===
        'auto'
      ) {
        res
          .status(400)
          .json({
            error:
              'Cashback transfers are handled automatically by the system.',
          });

        return;
      }

      const walletResult =
        await db.execute<{
          balance: string;
        }>(
          sql`
            SELECT
              balance
            FROM cashback_wallets
            WHERE user_id =
              ${userId}::uuid
            LIMIT 1
          `,
        );

      const current =
        amount(
          walletResult.rows[0]
            ?.balance ??
            0,
        );

      if (current <= 0) {
        res
          .status(400)
          .json({
            error:
              'Your cashback wallet is empty.',
          });

        return;
      }

      if (
        current <
        settings.minTransferAmount
      ) {
        res
          .status(400)
          .json({
            error:
              `Minimum transfer amount is ₦${settings.minTransferAmount.toLocaleString(
                'en-NG',
              )}. Your balance is ₦${current.toLocaleString(
                'en-NG',
              )}.`,

            minTransferAmount:
              settings.minTransferAmount,

            currentBalance:
              current,
          });

        return;
      }

      const transferAmount =
        requested == null
          ? current
          : Math.min(
              amount(
                requested,
              ),
              current,
            );

      if (
        transferAmount <= 0 ||
        transferAmount <
          settings.minTransferAmount
      ) {
        res
          .status(400)
          .json({
            error:
              `Transfer amount must be at least ₦${settings.minTransferAmount.toLocaleString(
                'en-NG',
              )}.`,

            minTransferAmount:
              settings.minTransferAmount,
          });

        return;
      }

      const result =
        await transferCashbackToMain(
          userId,
          transferAmount,
          'manual',
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
                result.newMainBalance,
            },
          );

        getIo()
          .to(
            `user:${userId}`,
          )
          .emit(
            'cashback:updated',
            {
              cashbackBalance:
                result.newCashbackBalance,
            },
          );
      } catch {
        // Socket failure must not fail the transfer.
      }

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
            )} has been moved to your main wallet.`,
        },
      ).catch(
        () => undefined,
      );

      res.json({
        ok: true,

        transferred:
          result.transferred,

        newMainBalance:
          result.newMainBalance,

        newCashbackBalance:
          result.newCashbackBalance,
      });
    } catch (error) {
      const code =
        (
          error as {
            code?: string;
          }
        ).code;

      if (
        code ===
        'INSUFFICIENT'
      ) {
        res
          .status(400)
          .json({
            error:
              'Insufficient cashback balance.',
          });

        return;
      }

      logger.error(
        {
          error,
          userId,
        },
        'POST /cashback-user/transfer failed',
      );

      res
        .status(500)
        .json({
          error:
            'Transfer failed. Please try again.',
        });
    }
  },
);

/* ============================================================================
 * HISTORY
 * ========================================================================== */

router.get(
  '/history',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    try {
      const result =
        await db.execute(
          sql`
            SELECT
              ct.id,
              ct.amount,
              ct.cashback_type,
              ct.cashback_value,
              ct.network,
              ct.plan_id,
              ct.plan_name,
              ct.created_at,
              t.description AS source_description
            FROM cashback_transactions ct
            LEFT JOIN transactions t
              ON t.id =
                ct.source_txn_id
            WHERE ct.user_id =
              ${userId}::uuid
            ORDER BY
              ct.created_at DESC
            LIMIT 100
          `,
        );

      res.json({
        history:
          result.rows,
      });
    } catch (error) {
      logger.error(
        {
          error,
          userId,
        },
        'GET /cashback-user/history failed',
      );

      res
        .status(500)
        .json({
          error:
            'Failed to load cashback history.',
        });
    }
  },
);

export default router;
