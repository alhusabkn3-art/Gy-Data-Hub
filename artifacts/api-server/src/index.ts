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

/*
 * SME API is the active data/airtime provider.
 *
 * The previous implementation queried the old vendor for transaction
 * status before deciding whether to mark a transaction successful or
 * refund it. There is no verified SME API transaction-status endpoint
 * in the current integration, so we must NOT guess an endpoint or
 * automatically refund an order merely because it has been pending
 * for 15 minutes.
 *
 * Pending transactions are therefore left pending for reconciliation.
 * This prevents a successful vendor transaction from being followed
 * by an incorrect automatic wallet refund.
 */
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
      {
        count: rows.length,
        references: rows.map(
          (row) => row.reference,
        ),
      },
      'Stuck transactions require provider reconciliation',
    );
  } catch (err) {
    logger.error(
      { err },
      'Stuck-transaction recovery sweep failed',
    );
  }
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
