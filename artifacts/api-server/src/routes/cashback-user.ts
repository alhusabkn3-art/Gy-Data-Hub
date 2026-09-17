/**
 * cashback-user.ts — User-facing cashback endpoints.
 *
 * Routes:
 *   GET  /api/cashback/settings
 *   GET  /api/cashback/wallet
 *   POST /api/cashback/transfer
 *   GET  /api/cashback/history
 */

import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { requireAuth } from './user.js';
import { transferCashbackToMain } from './purchase.js';
import { logger } from '../lib/logger.js';
import { getIo } from '../lib/socket.js';
import { createNotification } from '../lib/notifications.js';

const router = Router();

router.use(requireAuth);

/**
 * GET /api/cashback/settings
 *
 * Returns cashback configuration for the authenticated user.
 */
router.get('/settings', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute<{
      enabled: boolean;
      min_transfer_amount: string;
      transfer_mode: string;
      eligible_services: unknown;
    }>(sql`
      SELECT
        enabled,
        min_transfer_amount,
        transfer_mode,
        eligible_services
      FROM cashback_settings
      LIMIT 1
    `);

    const settings = result.rows[0];

    res.json({
      enabled: settings?.enabled ?? false,
      minTransferAmount: parseFloat(
        settings?.min_transfer_amount ?? '100',
      ),
      transferMode: settings?.transfer_mode ?? 'manual',
      eligibleServices: settings?.eligible_services ?? ['data'],
    });
  } catch (err) {
    logger.error({ err }, 'GET /cashback/settings failed');

    res.status(500).json({
      error: 'Failed to load cashback settings.',
    });
  }
});

/**
 * GET /api/cashback/wallet
 *
 * Returns cashback wallet balance and transfer settings.
 */
router.get('/wallet', async (req: Request, res: Response): Promise<void> => {
  const userId = req.session.userId!;

  try {
    const [walletRes, settingsRes] = await Promise.all([
      db.execute<{ balance: string }>(sql`
        SELECT balance
        FROM cashback_wallets
        WHERE user_id = ${userId}::uuid
      `),

      db.execute<{
        enabled: boolean;
        min_transfer_amount: string;
        transfer_mode: string;
        eligible_services: unknown;
      }>(sql`
        SELECT
          enabled,
          min_transfer_amount,
          transfer_mode,
          eligible_services
        FROM cashback_settings
        LIMIT 1
      `),
    ]);

    const balance = walletRes.rows[0]?.balance ?? '0';
    const settings = settingsRes.rows[0];

    res.json({
      balance,
      cashbackEnabled: settings?.enabled ?? false,
      minTransferAmount: parseFloat(
        settings?.min_transfer_amount ?? '100',
      ),
      transferMode: settings?.transfer_mode ?? 'manual',
      eligibleServices:
        settings?.eligible_services ?? ['data'],
    });
  } catch (err) {
    logger.error({ err }, 'GET /cashback/wallet failed');

    res.status(500).json({
      error: 'Failed to load cashback wallet.',
    });
  }
});

/**
 * POST /api/cashback/transfer
 *
 * Transfers cashback balance to the user's main wallet.
 */
router.post(
  '/transfer',
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.session.userId!;

    const { amount } = req.body as {
      amount?: number;
    };

    try {
      const settingsRes = await db.execute<{
        enabled: boolean;
        min_transfer_amount: string;
        transfer_mode: string;
      }>(sql`
        SELECT
          enabled,
          min_transfer_amount,
          transfer_mode
        FROM cashback_settings
        LIMIT 1
      `);

      const settings = settingsRes.rows[0];

      if (!settings?.enabled) {
        res.status(400).json({
          error: 'Cashback system is currently disabled.',
        });
        return;
      }

      if (settings.transfer_mode === 'auto') {
        res.status(400).json({
          error:
            'Cashback transfers are handled automatically by the system.',
        });
        return;
      }

      const cbRes = await db.execute<{ balance: string }>(sql`
        SELECT balance
        FROM cashback_wallets
        WHERE user_id = ${userId}::uuid
      `);

      const currentBalance = parseFloat(
        cbRes.rows[0]?.balance ?? '0',
      );

      const minAmount = parseFloat(
        settings.min_transfer_amount ?? '100',
      );

      if (currentBalance <= 0) {
        res.status(400).json({
          error: 'Your cashback wallet is empty.',
        });
        return;
      }

      if (currentBalance < minAmount) {
        res.status(400).json({
          error:
            `Minimum transfer amount is ₦${minAmount.toLocaleString(
              'en-NG',
            )}. Your balance is ₦${currentBalance.toLocaleString(
              'en-NG',
            )}.`,
          minTransferAmount: minAmount,
          currentBalance,
        });
        return;
      }

      let transferAmount: number;

      if (amount != null) {
        const parsed = Number(amount);

        if (!Number.isFinite(parsed) || parsed <= 0) {
          res.status(400).json({
            error:
              'Invalid transfer amount. Must be a positive number.',
          });
          return;
        }

        transferAmount = Math.min(
          parseFloat(parsed.toFixed(2)),
          currentBalance,
        );
      } else {
        transferAmount = currentBalance;
      }

      if (transferAmount < minAmount) {
        res.status(400).json({
          error:
            `Transfer amount must be at least ₦${minAmount.toLocaleString(
              'en-NG',
            )}.`,
          minTransferAmount: minAmount,
        });
        return;
      }

      const result = await transferCashbackToMain(
        userId,
        transferAmount,
        'manual',
      );

      try {
        getIo()
          .to(`user:${userId}`)
          .emit('wallet:updated', {
            balance: result.newMainBalance,
          });

        getIo()
          .to(`user:${userId}`)
          .emit('cashback:updated', {
            cashbackBalance: result.newCashbackBalance,
          });
      } catch {
        // Socket notification failure must not fail the transfer.
      }

      await createNotification(userId, {
        type: 'transaction',
        title: '💸 Cashback Transferred!',
        body:
          `₦${transferAmount.toLocaleString(
            'en-NG',
          )} has been moved from your Cashback Wallet to your Main Wallet.`,
      });

      logger.info(
        {
          userId,
          transferAmount,
          newMainBalance: result.newMainBalance,
        },
        'Cashback transferred to main wallet',
      );

      res.json({
        ok: true,
        transferred: transferAmount,
        newMainBalance: result.newMainBalance,
        newCashbackBalance: result.newCashbackBalance,
      });
    } catch (err: unknown) {
      const error = err as {
        code?: string;
        message?: string;
      };

      if (error.code === 'INSUFFICIENT') {
        res.status(400).json({
          error: 'Insufficient cashback balance.',
        });
        return;
      }

      logger.error(
        { err },
        'POST /cashback/transfer failed',
      );

      res.status(500).json({
        error: 'Transfer failed. Please try again.',
      });
    }
  },
);

/**
 * GET /api/cashback/history
 *
 * Returns cashback credit history for the authenticated user.
 */
router.get(
  '/history',
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.session.userId!;

    try {
      const result = await db.execute(sql`
        SELECT
          ct.id,
          ct.amount,
          ct.cashback_type,
          ct.cashback_value,
          ct.network,
          ct.plan_name,
          ct.created_at,
          t.description AS source_description
        FROM cashback_transactions ct
        LEFT JOIN transactions t
          ON t.id = ct.source_txn_id
        WHERE ct.user_id = ${userId}::uuid
        ORDER BY ct.created_at DESC
        LIMIT 50
      `);

      res.json({
        history: result.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /cashback/history failed',
      );

      res.status(500).json({
        error: 'Failed to load cashback history.',
      });
    }
  },
);

export default router;
