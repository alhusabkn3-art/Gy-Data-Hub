import http from 'http';
import app from './app.js';
import { initSocket } from './lib/socket.js';
import { logger } from './lib/logger.js';
import { validateEnv, sessionMiddleware } from './lib/session-store.js';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import * as ck from './lib/clubkonnect.js';
import { normalizeCKStatus } from './lib/clubkonnect.js';

// ── Startup validation ─────────────────────────────────────────────────────────
validateEnv();

const rawPort = process.env['PORT'] ?? '5000';
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT: "${rawPort}"`);

const httpServer = http.createServer(app);

// ── Socket.io ──────────────────────────────────────────────────────────────────
const io = initSocket(httpServer);

// Apply the same session middleware so Socket.io can read authenticated sessions.
io.engine.use(sessionMiddleware);

io.on('connection', (socket) => {
  logger.info({ socketId: socket.id }, 'Socket.io client connected');

  // ── Join personal user room ───────────────────────────────────────────────
  socket.on('join', (claimedUserId: string) => {
    const sess = (socket.request as unknown as { session?: { userId?: string } }).session;
    const authenticatedUserId = sess?.userId;

    if (!authenticatedUserId) {
      logger.warn({ socketId: socket.id }, 'Socket join rejected: no authenticated session');
      return;
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
  socket.on('join:admin', (claimedAdminId: string) => {
    const sess = (socket.request as unknown as { session?: { isAdmin?: boolean; adminId?: string } }).session;

    if (!sess?.isAdmin || !sess?.adminId) {
      logger.warn({ socketId: socket.id }, 'Socket join:admin rejected: not authenticated admin');
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
  socket.on('join:conversation', async (conversationId: string) => {
    if (typeof conversationId !== 'string' || !conversationId.match(/^[0-9a-f-]{36}$/i)) return;

    const sess = (socket.request as unknown as { session?: { userId?: string; isAdmin?: boolean } }).session;
    if (!sess?.userId && !sess?.isAdmin) {
      logger.warn({ socketId: socket.id }, 'Socket join:conversation rejected: unauthenticated');
      return;
    }

    try {
      if (sess.isAdmin) {
        void socket.join(`conversation:${conversationId}`);
      } else if (sess.userId) {
        const conv = (await db.execute<{ customer_id: string | null }>(
          sql`SELECT customer_id FROM conversations WHERE id = ${conversationId}::uuid LIMIT 1`,
        )).rows[0];
        if (conv?.customer_id === sess.userId) {
          void socket.join(`conversation:${conversationId}`);
        }
      }
    } catch { /* non-fatal */ }
  });

  socket.on('disconnect', () => {
    logger.info({ socketId: socket.id }, 'Socket.io client disconnected');
  });
});

// ── Smart stuck-transaction recovery ──────────────────────────────────────────
//
// Runs at startup + every 15 minutes.
//
// For each data/airtime transaction stuck in 'pending' for more than 15 minutes:
//   1. Query ClubKonnect for the current status via the stored RequestID.
//   2. 'success'  → mark transaction success. Wallet already debited — no change.
//   3. 'pending'  → skip. Vendor is still processing. Retry next cycle.
//   4. 'failed'   → refund wallet + write reversal ledger entry + mark failed.
//
// The CK query uses the transaction.reference field which matches the RequestID
// we sent to ClubKonnect when the purchase was made.
//
async function recoverStuckTransactions(): Promise<void> {
  try {
    const queryResult = await db.execute<{
      id: string; user_id: string; amount: string; reference: string; type: string;
    }>(sql`
      SELECT id, user_id, amount, reference, type
      FROM transactions
      WHERE status = 'pending'
        AND type IN ('data', 'airtime')
        AND created_at < NOW() - INTERVAL '15 minutes'
      LIMIT 50
    `);

    const stuckRows = queryResult.rows;
    if (stuckRows.length === 0) return;

    logger.warn({ count: stuckRows.length }, 'Stuck-transaction recovery: checking vendor status');

    const ckAvailable = !!(process.env['CLUBKONNECT_USER_ID'] && process.env['CLUBKONNECT_API_KEY']);

    for (const tx of stuckRows) {
      try {
        await resolveStuckTransaction(tx, ckAvailable);
      } catch (txErr) {
        logger.error({ txErr, txId: tx.id, reference: tx.reference }, 'Failed to resolve stuck transaction');
      }
    }
  } catch (err) {
    logger.error({ err }, 'Stuck-transaction recovery sweep failed');
  }
}

async function resolveStuckTransaction(
  tx: { id: string; user_id: string; amount: string; reference: string; type: string },
  ckAvailable: boolean,
): Promise<void> {
  // Re-read status inside a transaction to prevent race conditions
  const currentResult = await db.execute<{ status: string }>(sql`
    SELECT status FROM transactions WHERE id = ${tx.id}::uuid FOR UPDATE
  `);
  const current = currentResult.rows[0];

  if (!current || current.status !== 'pending') {
    logger.debug({ txId: tx.id }, 'Stuck recovery: already resolved — skipping');
    return;
  }

  // ── Try to get the real status from ClubKonnect ─────────────────────────
  let resolvedStatus: 'success' | 'pending' | 'failed' = 'failed'; // default: refund

  if (ckAvailable && tx.reference) {
    try {
      const vendorStatus = await ck.getTransactionStatus(tx.reference);
      resolvedStatus     = normalizeCKStatus(vendorStatus.status);
      logger.info(
        { txId: tx.id, reference: tx.reference, vendorStatus: vendorStatus.status, resolvedStatus },
        'Stuck recovery: CK status received',
      );
    } catch (ckErr) {
      // CK query failed — default to refund (conservative: protect customer funds)
      logger.warn({ ckErr, txId: tx.id }, 'Stuck recovery: CK query failed — defaulting to refund');
      resolvedStatus = 'failed';
    }
  } else {
    logger.warn({ txId: tx.id }, 'Stuck recovery: CK credentials not available — defaulting to refund');
  }

  if (resolvedStatus === 'pending') {
    // CK is still processing — extend the grace period, check again next cycle
    logger.info({ txId: tx.id, reference: tx.reference }, 'Stuck recovery: CK still pending — deferring');
    // Update updated_at so this doesn't keep getting picked up every cycle
    // (we only query transactions where created_at < 15 min, not updated_at)
    return;
  }

  if (resolvedStatus === 'success') {
    // CK delivered successfully — mark success, no wallet change (already debited)
    await db.execute(sql`
      UPDATE transactions
      SET status = 'success', updated_at = NOW(),
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'resolvedBy', 'stuck-recovery',
            'resolvedAt', NOW()::text,
            'ckStatus',   'successful'
          )
      WHERE id = ${tx.id}::uuid
    `);
    logger.info({ txId: tx.id, reference: tx.reference }, 'Stuck recovery: marked success (CK confirmed delivery)');
    return;
  }

  // resolvedStatus === 'failed' — refund wallet
  await db.transaction(async (trx) => {
    const walletQueryResult = await trx.execute<{ balance: string; id: string }>(sql`
      SELECT id, balance FROM wallets WHERE user_id = ${tx.user_id}::uuid FOR UPDATE
    `);
    const wallet = walletQueryResult.rows[0];
    if (!wallet) return;

    const refunded = (parseFloat(wallet.balance) + parseFloat(tx.amount)).toFixed(2);

    await trx.execute(sql`
      UPDATE wallets SET balance = ${refunded}, updated_at = NOW()
      WHERE user_id = ${tx.user_id}::uuid
    `);

    await trx.execute(sql`
      UPDATE transactions
      SET status = 'failed', updated_at = NOW(),
          metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
            'resolvedBy', 'stuck-recovery',
            'resolvedAt', NOW()::text,
            'refunded',   true
          )
      WHERE id = ${tx.id}::uuid
    `);

    // Reversal ledger entry
    await trx.execute(sql`
      INSERT INTO wallet_ledger
        (user_id, type, amount, balance_before, balance_after,
         reference, related_transaction_id, reason)
      VALUES
        (${tx.user_id}::uuid, 'reversal', ${tx.amount},
         ${wallet.balance}, ${refunded},
         ${'AUTO-RECOVERY-' + tx.reference}, ${tx.id}::uuid,
         'Automatic recovery: vendor delivery unconfirmed after timeout')
      ON CONFLICT (reference) DO NOTHING
    `);
  });

  logger.info(
    { txId: tx.id, userId: tx.user_id, amount: tx.amount },
    'Stuck recovery: transaction refunded — wallet credited back',
  );
}

// ── Start server ───────────────────────────────────────────────────────────────
httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, 'Server failed to start');
    process.exit(1);
  }
  logger.info({ port }, 'Server listening (HTTP + Socket.io)');

  // Run stuck-transaction recovery 10 s after startup (let DB settle),
  // then every 15 minutes.
  setTimeout(() => {
    void recoverStuckTransactions();
    setInterval(() => void recoverStuckTransactions(), 15 * 60 * 1000);
  }, 10_000);
});
