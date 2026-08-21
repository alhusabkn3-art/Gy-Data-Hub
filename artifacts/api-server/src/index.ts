import http from 'http';
import app from './app.js';
import { initSocket } from './lib/socket.js';
import { logger } from './lib/logger.js';
import {
  validateEnv,
  sessionMiddleware,
} from './lib/session-store.js';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import * as ck from './lib/clubkonnect.js';
import { normalizeCKStatus } from './lib/clubkonnect.js';
import { initializeDatabase } from './lib/database-bootstrap.js';

const rawPort = process.env.PORT ?? '5000';
const port = Number(rawPort);

if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`Invalid PORT: "${rawPort}"`);
}

/*
 * Render Free does not provide Shell access.
 * The project already contains db/bootstrap.sql, so initialize
 * the PostgreSQL schema from the application itself before
 * accepting requests.
 *
 * This uses @workspace/db's existing PostgreSQL pool.
 * No new "pg" dependency is required in api-server.
 */
try {
  await initializeDatabase();

  logger.info(
    'Database bootstrap completed successfully',
  );
} catch (err) {
  logger.error(
    { err },
    'Database bootstrap failed',
  );

  /*
   * Do not hide the database problem. The server can still start,
   * but the error will be visible in Render logs.
   */
}

const httpServer = http.createServer(app);

// -----------------------------------------------------------------------------
// Socket.io
// -----------------------------------------------------------------------------

const io = initSocket(httpServer);

io.engine.use(sessionMiddleware);

io.on('connection', (socket) => {
  logger.info(
    { socketId: socket.id },
    'Socket.io client connected',
  );

  socket.on('join', (claimedUserId: string) => {
    const sess = (
      socket.request as unknown as {
        session?: {
          userId?: string;
        };
      }
    ).session;

    const authenticatedUserId = sess?.userId;

    if (!authenticatedUserId) {
      logger.warn(
        { socketId: socket.id },
        'Socket join rejected: no authenticated session',
      );
      return;
    }

    if (claimedUserId !== authenticatedUserId) {
      logger.warn(
        {
          socketId: socket.id,
          claimed: claimedUserId,
          actual: authenticatedUserId,
        },
        'Socket join rejected: userId mismatch',
      );
      return;
    }

    void socket.join(
      `user:${authenticatedUserId}`,
    );
  });

  socket.on(
    'join:admin',
    (claimedAdminId: string) => {
      const sess = (
        socket.request as unknown as {
          session?: {
            isAdmin?: boolean;
            adminId?: string;
          };
        }
      ).session;

      if (
        !sess?.isAdmin ||
        !sess?.adminId
      ) {
        logger.warn(
          { socketId: socket.id },
          'Socket join:admin rejected: not authenticated admin',
        );
        return;
      }

      if (
        claimedAdminId !== sess.adminId
      ) {
        logger.warn(
          {
            socketId: socket.id,
            claimed: claimedAdminId,
            actual: sess.adminId,
          },
          'Socket join:admin rejected: adminId mismatch',
        );
        return;
      }

      void socket.join(
        `admin:${sess.adminId}`,
      );

      void socket.join('admins');
    },
  );

  socket.on(
    'join:conversation',
    async (conversationId: string) => {
      if (
        typeof conversationId !== 'string' ||
        !/^[0-9a-f-]{36}$/i.test(
          conversationId,
        )
      ) {
        return;
      }

      const sess = (
        socket.request as unknown as {
          session?: {
            userId?: string;
            isAdmin?: boolean;
          };
        }
      ).session;

      if (
        !sess?.userId &&
        !sess?.isAdmin
      ) {
        return;
      }

      try {
        if (sess.isAdmin) {
          void socket.join(
            `conversation:${conversationId}`,
          );
          return;
        }

        if (sess.userId) {
          const result =
            await db.execute<{
              customer_id:
                | string
                | null;
            }>(
              sql`
                SELECT customer_id
                FROM conversations
                WHERE id = ${conversationId}::uuid
                LIMIT 1
              `,
            );

          if (
            result.rows[0]
              ?.customer_id ===
            sess.userId
          ) {
            void socket.join(
              `conversation:${conversationId}`,
            );
          }
        }
      } catch (err) {
        logger.warn(
          {
            err,
            conversationId,
          },
          'Socket conversation lookup failed',
        );
      }
    },
  );

  socket.on(
    'disconnect',
    () => {
      logger.info(
        { socketId: socket.id },
        'Socket.io client disconnected',
      );
    },
  );
});

// -----------------------------------------------------------------------------
// Stuck transaction recovery
// -----------------------------------------------------------------------------

async function recoverStuckTransactions(): Promise<void> {
  try {
    const queryResult =
      await db.execute<{
        id: string;
        user_id: string;
        amount: string;
        reference: string;
        type: string;
      }>(
        sql`
          SELECT
            id,
            user_id,
            amount,
            reference,
            type
          FROM transactions
          WHERE status = 'pending'
            AND type IN ('data', 'airtime')
            AND created_at <
                NOW() - INTERVAL '15 minutes'
          LIMIT 50
        `,
      );

    const rows = queryResult.rows;

    if (rows.length === 0) {
      return;
    }

    logger.warn(
      { count: rows.length },
      'Stuck-transaction recovery: checking vendor status',
    );

    const ckAvailable = Boolean(
      process.env.CLUBKONNECT_USER_ID &&
      process.env.CLUBKONNECT_API_KEY,
    );

    for (const tx of rows) {
      try {
        await resolveStuckTransaction(
          tx,
          ckAvailable,
        );
      } catch (err) {
        logger.error(
          {
            err,
            txId: tx.id,
            reference: tx.reference,
          },
          'Failed to resolve stuck transaction',
        );
      }
    }
  } catch (err) {
    logger.error(
      { err },
      'Stuck-transaction recovery sweep failed',
    );
  }
}

async function resolveStuckTransaction(
  tx: {
    id: string;
    user_id: string;
    amount: string;
    reference: string;
    type: string;
  },
  ckAvailable: boolean,
): Promise<void> {
  const currentResult =
    await db.execute<{
      status: string;
    }>(
      sql`
        SELECT status
        FROM transactions
        WHERE id = ${tx.id}::uuid
        FOR UPDATE
      `,
    );

  const current =
    currentResult.rows[0];

  if (
    !current ||
    current.status !== 'pending'
  ) {
    return;
  }

  let resolvedStatus:
    | 'success'
    | 'pending'
    | 'failed' = 'failed';

  if (
    ckAvailable &&
    tx.reference
  ) {
    try {
      const vendorStatus =
        await ck.getTransactionStatus(
          tx.reference,
        );

      resolvedStatus =
        normalizeCKStatus(
          vendorStatus.status,
        );

      logger.info(
        {
          txId: tx.id,
          reference: tx.reference,
          vendorStatus:
            vendorStatus.status,
          resolvedStatus,
        },
        'Stuck recovery: CK status received',
      );
    } catch (err) {
      logger.warn(
        {
          err,
          txId: tx.id,
          reference: tx.reference,
        },
        'Stuck recovery: CK query failed — defaulting to refund',
      );
    }
  }

  if (
    resolvedStatus === 'pending'
  ) {
    return;
  }

  if (
    resolvedStatus === 'success'
  ) {
    await db.execute(
      sql`
        UPDATE transactions
        SET
          status = 'success',
          updated_at = NOW(),
          metadata =
            COALESCE(
              metadata,
              '{}'::jsonb
            ) ||
            jsonb_build_object(
              'resolvedBy',
              'stuck-recovery',
              'resolvedAt',
              NOW()::text,
              'ckStatus',
              'successful'
            )
        WHERE id = ${tx.id}::uuid
      `,
    );

    return;
  }

  await db.transaction(
    async (trx) => {
      const walletResult =
        await trx.execute<{
          balance: string;
          id: string;
        }>(
          sql`
            SELECT
              id,
              balance
            FROM wallets
            WHERE user_id =
              ${tx.user_id}::uuid
            FOR UPDATE
          `,
        );

      const wallet =
        walletResult.rows[0];

      if (!wallet) {
        logger.error(
          {
            txId: tx.id,
            userId: tx.user_id,
          },
          'Automatic recovery failed: wallet not found',
        );

        return;
      }

      const refunded = (
        parseFloat(wallet.balance) +
        parseFloat(tx.amount)
      ).toFixed(2);

      await trx.execute(
        sql`
          UPDATE wallets
          SET
            balance = ${refunded},
            updated_at = NOW()
          WHERE user_id =
            ${tx.user_id}::uuid
        `,
      );

      await trx.execute(
        sql`
          UPDATE transactions
          SET
            status = 'failed',
            updated_at = NOW(),
            metadata =
              COALESCE(
                metadata,
                '{}'::jsonb
              ) ||
              jsonb_build_object(
                'resolvedBy',
                'stuck-recovery',
                'resolvedAt',
                NOW()::text,
                'refunded',
                true
              )
          WHERE id = ${tx.id}::uuid
        `,
      );

      await trx.execute(
        sql`
          INSERT INTO wallet_ledger
            (
              user_id,
              type,
              amount,
              balance_before,
              balance_after,
              reference,
              related_transaction_id,
              reason
            )
          VALUES
            (
              ${tx.user_id}::uuid,
              'reversal',
              ${tx.amount},
              ${wallet.balance},
              ${refunded},
              ${
                'AUTO-RECOVERY-' +
                tx.reference
              },
              ${tx.id}::uuid,
              'Automatic recovery: vendor delivery unconfirmed after timeout'
            )
          ON CONFLICT (reference)
          DO NOTHING
        `,
      );
    },
  );
}

// -----------------------------------------------------------------------------
// Start server
// -----------------------------------------------------------------------------

function startServer(): void {
  try {
    validateEnv();

    httpServer.listen(
      port,
      '0.0.0.0',
      () => {
        logger.info(
          {
            port,
            host: '0.0.0.0',
            nodeEnv:
              process.env.NODE_ENV,
          },
          'Server listening (HTTP + Socket.io)',
        );

        setTimeout(() => {
          void recoverStuckTransactions();

          setInterval(
            () =>
              void recoverStuckTransactions(),
            15 * 60 * 1000,
          );
        }, 10_000);
      },
    );

    httpServer.on(
      'error',
      (err) => {
        logger.error(
          {
            err,
            port,
          },
          'HTTP server error',
        );
      },
    );
  } catch (err) {
    logger.error(
      {
        err,
        port,
      },
      'Server startup failed',
    );

    process.exit(1);
  }
}

// -----------------------------------------------------------------------------
// Process-level errors
// -----------------------------------------------------------------------------

process.on(
  'uncaughtException',
  (err) => {
    logger.error(
      { err },
      'Uncaught exception',
    );
  },
);

process.on(
  'unhandledRejection',
  (reason) => {
    logger.error(
      { reason },
      'Unhandled promise rejection',
    );
  },
);

startServer();
