import http from 'http';
import app from './app.js';
import { initSocket } from './lib/socket.js';
import { logger } from './lib/logger.js';
import { validateEnv, sessionMiddleware } from './lib/session-store.js';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

// ── Startup validation ─────────────────────────────────────────────────────────
validateEnv();

const rawPort = process.env['PORT'];
if (!rawPort) throw new Error('PORT environment variable is required.');
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${rawPort}"`);

const httpServer = http.createServer(app);

// ── Socket.io ──────────────────────────────────────────────────────────────────
const io = initSocket(httpServer);

// Apply the same session middleware so Socket.io can read authenticated sessions.
// This lets us validate that a socket's claimed userId actually matches the session.
io.engine.use(sessionMiddleware);

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Socket.io client connected');

  // ── Join personal user room ───────────────────────────────────────────────
  // Validates the claimed userId against the authenticated session — prevents
  // a client from joining another user's notification room (IDOR fix).
  socket.on('join', (claimedUserId: string) => {
    const sess = (socket.request as unknown as { session?: { userId?: string } }).session;
    const authenticatedUserId = sess?.userId;

    if (!authenticatedUserId) {
      logger.warn({ socketId: socket.id }, 'Socket join rejected: no authenticated session');
      return; // Silently ignore — do not disconnect (may be an admin socket)
    }

    if (claimedUserId !== authenticatedUserId) {
      logger.warn(
        { socketId: socket.id, claimed: claimedUserId, actual: authenticatedUserId },
        'Socket join rejected: userId mismatch',
      );
      return;
    }

    void socket.join(`user:${authenticatedUserId}`);
    logger.debug({ socketId: socket.id, userId: authenticatedUserId }, 'Socket joined user room');
  });

  // ── Join admin room ───────────────────────────────────────────────────────
  // Validates admin session. Only active admins may subscribe to admin events.
  socket.on('join:admin', (claimedAdminId: string) => {
    const sess = (socket.request as unknown as { session?: { isAdmin?: boolean; adminId?: string } }).session;

    if (!sess?.isAdmin || !sess?.adminId) {
      logger.warn({ socketId: socket.id }, 'Socket join:admin rejected: not an authenticated admin');
      return;
    }

    if (claimedAdminId !== sess.adminId) {
      logger.warn(
        { socketId: socket.id, claimed: claimedAdminId, actual: sess.adminId },
        'Socket join:admin rejected: adminId mismatch',
      );
      return;
    }

    void socket.join(`admin:${sess.adminId}`);
    void socket.join('admins');
    logger.debug({ socketId: socket.id, adminId: sess.adminId }, 'Socket joined admin room');
  });

  // ── Join support conversation room ────────────────────────────────────────
  // Validate that the session belongs to a participant in this conversation.
  socket.on('join:conversation', async (conversationId: string) => {
    if (typeof conversationId !== 'string' || !conversationId.match(/^[0-9a-f-]{36}$/i)) {
      return; // Reject invalid IDs silently
    }

    const sess = (socket.request as unknown as { session?: { userId?: string; isAdmin?: boolean } }).session;
    if (!sess?.userId && !sess?.isAdmin) {
      logger.warn({ socketId: socket.id }, 'Socket join:conversation rejected: unauthenticated');
      return;
    }

    try {
      // Admins can join any conversation; users only their own
      if (sess.isAdmin) {
        void socket.join(`conversation:${conversationId}`);
      } else if (sess.userId) {
        const [conv] = await db.execute<{ customer_id: string | null }>(
          sql`SELECT customer_id FROM conversations WHERE id = ${conversationId}::uuid LIMIT 1`
        );
        if (conv?.customer_id === sess.userId) {
          void socket.join(`conversation:${conversationId}`);
        }
      }
    } catch {
      // Non-fatal — socket join is best-effort
    }
  });

  socket.on('disconnect', () => {
    logger.info({ socketId: socket.id }, 'Socket.io client disconnected');
  });
});

// ── Stuck pending transaction recovery ────────────────────────────────────────
// Wallets are debited before calling the vendor. If the server crashes or the
// vendor never responds, the transaction stays 'pending' and the wallet balance
// is locked. This job detects and resolves stale pending purchase transactions.
async function recoverStuckTransactions(): Promise<void> {
  try {
    // Find purchase transactions pending > 15 minutes
    const rawRows = await db.execute<{ id: string; user_id: string; amount: string; reference: string }>(sql`
      SELECT id, user_id, amount, reference
      FROM transactions
      WHERE status = 'pending'
        AND type IN ('data', 'airtime')
        AND created_at < NOW() - INTERVAL '15 minutes'
      LIMIT 50
    `);

    // postgres.js RowList is array-like but not always iterable via for-of in
    // bundled esbuild output — Array.from() normalises it safely.
    const stuckRows = Array.from(rawRows);

    if (stuckRows.length === 0) return;

    logger.warn({ count: stuckRows.length }, 'Recovering stuck pending transactions');

    for (const tx of stuckRows) {
      try {
        await db.transaction(async (trx) => {
          // Re-check inside transaction to prevent race conditions
          const [current] = await trx.execute<{ status: string }>(sql`
            SELECT status FROM transactions WHERE id = ${tx.id}::uuid FOR UPDATE
          `);
          if (!current || current.status !== 'pending') return; // Already resolved

          const [wallet] = await trx.execute<{ balance: string }>(sql`
            SELECT balance FROM wallets WHERE user_id = ${tx.user_id}::uuid FOR UPDATE
          `);
          if (!wallet) return;

          const refunded = (parseFloat(wallet.balance) + parseFloat(tx.amount)).toFixed(2);

          await trx.execute(sql`
            UPDATE wallets SET balance = ${refunded}, updated_at = NOW()
            WHERE user_id = ${tx.user_id}::uuid
          `);
          await trx.execute(sql`
            UPDATE transactions SET status = 'failed', updated_at = NOW()
            WHERE id = ${tx.id}::uuid
          `);
          await trx.execute(sql`
            INSERT INTO wallet_ledger
              (user_id, type, amount, balance_before, balance_after, reference, reason, performed_by)
            VALUES
              (${tx.user_id}::uuid, 'reversal', ${tx.amount}, ${wallet.balance}, ${refunded},
               ${'AUTO-RECOVERY-' + tx.reference}, 'Automatic recovery of stuck pending transaction', 'system')
            ON CONFLICT DO NOTHING
          `);
        });

        logger.info({ txId: tx.id, userId: tx.user_id, amount: tx.amount }, 'Stuck transaction recovered — wallet refunded');
      } catch (txErr) {
        logger.error({ txErr, txId: tx.id }, 'Failed to recover stuck transaction');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Stuck transaction recovery sweep failed');
  }
}

// Run at startup and every 15 minutes
httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, 'Error listening on port');
    process.exit(1);
  }
  logger.info({ port }, 'Server listening (HTTP + Socket.io)');

  // Run stuck transaction recovery after a short delay (let DB settle)
  setTimeout(() => {
    void recoverStuckTransactions();
    setInterval(() => void recoverStuckTransactions(), 15 * 60 * 1000);
  }, 10_000);
});
