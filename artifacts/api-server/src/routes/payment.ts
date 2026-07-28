/**
 * /api/payment — Monnify-backed wallet funding.
 *
 * Security model:
 *   1. Payment is initialized server-side. A PENDING transaction record is
 *      created in the DB BEFORE the user sees the checkout page — every payment
 *      has a DB record from the start.
 *   2. Wallet credit ONLY happens after server-side verification with Monnify
 *      confirms paymentStatus === 'PAID' AND the amount matches exactly.
 *      Frontend success callbacks are never trusted.
 *   3. Webhook idempotency: creditWallet re-checks the transaction status
 *      inside a DB transaction with FOR UPDATE — a reference already marked
 *      'success' is silently skipped, preventing double-credits even when
 *      Monnify delivers the webhook more than once.
 *   4. Webhook signatures are verified via HMAC-SHA512 (Monnify secret key)
 *      before any payload is processed.
 *   5. Every wallet balance change writes a wallet_ledger row for complete
 *      audit trail and reconciliation.
 */
import { Router, type Request, type Response } from 'express';
import { eq, and } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { walletsTable, transactionsTable, usersTable } from '@workspace/db/schema';
import { requireAuth } from './user.js';
import { logger } from '../lib/logger.js';
import { createNotification } from '../lib/notifications.js';
import * as monnify from '../lib/monnify.js';
import { getIo } from '../lib/socket.js';

const router = Router();

// ── Monnify payment status sets ───────────────────────────────────────────────
// PAID_STATUSES:          wallet should be credited (credit the expected amount even if OVERPAID)
// TERMINAL_FAIL_STATUSES: transaction is permanently over — mark failed in DB
// Anything else (PENDING, PARTIALLY_PAID, PENDING_AUTHORIZATION …) → stay pending,
// keep polling / wait for another webhook.
const MONNIFY_PAID_STATUSES          = new Set(['PAID', 'OVERPAID']);
const MONNIFY_TERMINAL_FAIL_STATUSES = new Set([
  'FAILED', 'EXPIRED', 'CANCELLED', 'ABANDONED', 'REVERSED',
]);

// ── POST /api/payment/monnify/initialize ─────────────────────────────────────
// Requires user session. Creates a pending transaction then calls Monnify to
// get a checkout URL. Returns the URL so the frontend can open it.
router.post('/monnify/initialize', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { amount } = req.body as { amount?: number };
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount < 100) {
    res.status(400).json({ error: 'Minimum funding amount is ₦100.' });
    return;
  }

  if (numericAmount > 5_000_000) {
    res.status(400).json({ error: 'Maximum single funding amount is ₦5,000,000.' });
    return;
  }

  const userId = req.session.userId!;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: 'User not found.' }); return; }

  // Cryptographically random payment reference
  const randomHex   = crypto.randomBytes(4).toString('hex').toUpperCase();
  const paymentRef  = `GY-PAY-${Date.now()}-${randomHex}`;

  // Redirect URL — where Monnify sends the user after checkout
  const devDomain   = process.env['REPLIT_DEV_DOMAIN'];
  const redirectUrl = devDomain
    ? `https://${devDomain}/`
    : `${req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.get('host') ?? 'localhost'}/`;

  // ── Step 1: Create pending transaction in DB ──────────────────────────────
  let txnId: string;
  try {
    const [txn] = await db.insert(transactionsTable).values({
      userId,
      type:          'wallet_fund',
      service:       'Wallet Funding',
      provider:      'Monnify',
      amount:        numericAmount.toFixed(2),
      status:        'pending',
      reference:     paymentRef,
      description:   `Wallet funding via Monnify`,
      paymentMethod: 'Monnify',
      metadata: {
        expectedAmount: numericAmount,
        initiatedAt:    new Date().toISOString(),
      },
    }).returning({ id: transactionsTable.id });
    txnId = txn!.id;
  } catch (err) {
    logger.error({ err }, 'Failed to create pending Monnify transaction');
    res.status(500).json({ error: 'Failed to initialize payment.' });
    return;
  }

  // ── Step 2: Call Monnify ──────────────────────────────────────────────────
  try {
    const result = await monnify.initializeTransaction({
      amount:             numericAmount,
      customerName:       user.name,
      customerEmail:      user.email || `user_${user.id.slice(0, 8)}@gydata.ng`,
      paymentReference:   paymentRef,
      paymentDescription: `GY DATA wallet top-up — ${user.name}`,
      redirectUrl,
    });

    // Store Monnify's transactionReference in metadata for server-side verification
    await db.update(transactionsTable)
      .set({
        metadata: {
          expectedAmount:        numericAmount,
          initiatedAt:           new Date().toISOString(),
          monnifyTransactionRef: result.transactionReference,
        },
      })
      .where(eq(transactionsTable.id, txnId));

    logger.info({ userId, paymentRef, txnId, amount: numericAmount }, 'Monnify payment initialized');

    res.json({
      ok:            true,
      checkoutUrl:   result.checkoutUrl,
      reference:     paymentRef,
      transactionId: txnId,
    });
  } catch (err) {
    await db.update(transactionsTable)
      .set({ status: 'failed', metadata: { error: 'Monnify initialization failed' } })
      .where(eq(transactionsTable.id, txnId));

    logger.error({ err, userId, paymentRef }, 'Monnify initialize failed');
    res.status(502).json({ error: 'Payment gateway unavailable. Please try again.' });
  }
});

// ── GET /api/payment/monnify/status/:reference ────────────────────────────────
// Requires user session. Frontend polls this after opening the Monnify checkout.
router.get('/monnify/status/:reference', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { reference } = req.params as { reference: string };
  const userId = req.session.userId!;

  const [txn] = await db
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.reference, reference),
        eq(transactionsTable.userId, userId),
      ),
    );

  if (!txn) { res.status(404).json({ error: 'Transaction not found.' }); return; }

  if (txn.status === 'success' || txn.status === 'failed') {
    const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
    res.json({ status: txn.status, reference, balance: wallet?.balance ?? '0' });
    return;
  }

  const meta       = txn.metadata as { monnifyTransactionRef?: string; expectedAmount?: number } | null;
  const monnifyRef = meta?.monnifyTransactionRef;

  if (!monnifyRef) {
    res.json({ status: 'pending', reference });
    return;
  }

  try {
    const verification   = await monnify.verifyTransaction(monnifyRef);
    const expectedAmount = parseFloat(txn.amount);
    // PAID and OVERPAID both count as successful — credit the expected amount only
    const isPaid         = MONNIFY_PAID_STATUSES.has(verification.paymentStatus);
    const amountOk       = Math.abs(verification.amountPaid - expectedAmount) < 0.01 ||
                           verification.amountPaid >= expectedAmount;  // OVERPAID: amountPaid > expected

    if (isPaid && amountOk) {
      const { newBalance } = await creditWallet(userId, txn.id, expectedAmount, reference, monnifyRef);
      res.json({ status: 'success', reference, balance: newBalance });
      return;
    }

    const terminalFail = MONNIFY_TERMINAL_FAIL_STATUSES.has(verification.paymentStatus);
    if (terminalFail) {
      await db.execute(sql`
        UPDATE transactions
        SET status = 'failed', updated_at = NOW()
        WHERE id = ${txn.id}::uuid
      `);
      res.json({ status: 'failed', reference });
      return;
    }

    // PENDING, PARTIALLY_PAID, PENDING_AUTHORIZATION — keep polling
    res.json({ status: 'pending', reference, paymentStatus: verification.paymentStatus });
  } catch (err) {
    logger.error({ err, reference }, 'Monnify status check error');
    res.json({ status: txn.status, reference });
  }
});

// ── POST /api/payment/monnify/webhook ─────────────────────────────────────────
// Public — Monnify calls this when a payment completes.
// Webhook URL to configure in Monnify dashboard:
//   https://<your-domain>/api/payment/monnify/webhook
router.post('/monnify/webhook', async (req: Request, res: Response): Promise<void> => {
  const signature = (req.headers['monnify-signature'] ?? '') as string;
  const rawBody   = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

  if (!signature) {
    logger.warn('Monnify webhook: missing monnify-signature header');
    res.status(400).json({ error: 'Missing signature.' });
    return;
  }

  if (!monnify.verifyWebhookSignature(rawBody, signature)) {
    logger.warn('Monnify webhook: signature verification failed');
    res.status(401).json({ error: 'Invalid signature.' });
    return;
  }

  // Acknowledge immediately — Monnify retries if it doesn't get 200 quickly
  res.status(200).json({ ok: true });

  const payload = req.body as {
    paymentReference?:     string;
    transactionReference?: string;
    amountPaid?:           number;
    paymentStatus?:        string;
  };

  const { paymentReference, paymentStatus } = payload;

  if (!paymentReference) {
    logger.warn({ payload }, 'Monnify webhook: missing paymentReference');
    return;
  }

  try {
    const [txn] = await db
      .select()
      .from(transactionsTable)
      .where(eq(transactionsTable.reference, paymentReference));

    if (!txn) {
      logger.warn({ paymentReference }, 'Monnify webhook: transaction not found');
      return;
    }

    if (txn.status !== 'pending') {
      logger.info({ paymentReference, status: txn.status }, 'Monnify webhook: already processed — skipping');
      return;
    }

    // Only PAID and OVERPAID trigger a credit attempt.
    // Terminal failures flip the record to 'failed'.
    // Everything else (PENDING, PARTIALLY_PAID, PENDING_AUTHORIZATION …) is left
    // as-is so the next webhook or the frontend polling can finish the job.
    if (!MONNIFY_PAID_STATUSES.has(paymentStatus ?? '')) {
      if (MONNIFY_TERMINAL_FAIL_STATUSES.has(paymentStatus ?? '')) {
        await db.execute(sql`
          UPDATE transactions
          SET status = 'failed', updated_at = NOW(),
              metadata = metadata || ${JSON.stringify({ webhookStatus: paymentStatus })}::jsonb
          WHERE id = ${txn.id}::uuid
        `);
        logger.info({ paymentReference, paymentStatus }, 'Monnify webhook: terminal failure — marked failed');
      } else {
        logger.info(
          { paymentReference, paymentStatus },
          'Monnify webhook: non-terminal, non-paid status — leaving as pending',
        );
      }
      return;
    }

    // Server-side double-verification before crediting any wallet
    const meta       = txn.metadata as { monnifyTransactionRef?: string } | null;
    const monnifyRef = meta?.monnifyTransactionRef ?? payload.transactionReference;
    if (!monnifyRef) {
      logger.error({ paymentReference }, 'Monnify webhook: no monnifyTransactionRef for verification');
      return;
    }

    const verification = await monnify.verifyTransaction(monnifyRef);

    if (!MONNIFY_PAID_STATUSES.has(verification.paymentStatus)) {
      logger.warn(
        { paymentReference, verifiedStatus: verification.paymentStatus },
        'Monnify webhook: server verification returned non-PAID — skipping credit',
      );
      return;
    }

    const expectedAmount = parseFloat(txn.amount);
    if (Math.abs(verification.amountPaid - expectedAmount) > 0.01) {
      logger.error(
        { paymentReference, expected: expectedAmount, actual: verification.amountPaid },
        'Monnify webhook: amount mismatch — wallet NOT credited',
      );
      return;
    }

    await creditWallet(txn.userId, txn.id, expectedAmount, paymentReference, monnifyRef);
    logger.info({ paymentReference, userId: txn.userId, amount: expectedAmount }, 'Monnify webhook: wallet credited');
  } catch (err) {
    logger.error({ err, paymentReference }, 'Monnify webhook processing error');
  }
});

// ── Shared wallet credit helper ───────────────────────────────────────────────
//
// Atomic: SELECT FOR UPDATE prevents concurrent credits on the same wallet.
// Re-checks transaction status inside the DB transaction — idempotency guard.
// Every successful credit writes a wallet_ledger row for the audit trail.
//
async function creditWallet(
  userId:    string,
  txnId:     string,
  amount:    number,
  reference: string,
  providerRef?: string,
): Promise<{ newBalance: string }> {
  const result = await db.transaction(async (tx) => {
    // Lock wallet row — prevents concurrent over-credit
    const [wallet] = await tx
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.userId, userId))
      .for('update');

    if (!wallet) throw Object.assign(new Error('Wallet not found'), { code: 'NOT_FOUND' });

    const [txnRow] = await tx
      .select({ status: transactionsTable.status })
      .from(transactionsTable)
      .where(eq(transactionsTable.id, txnId));

    // Idempotency guard — already credited in a concurrent request
    if (txnRow?.status === 'success') {
      return { newBalance: wallet.balance };
    }

    const balanceBefore = wallet.balance;
    const newBalance    = (parseFloat(balanceBefore) + amount).toFixed(2);

    // Credit wallet
    await tx.update(walletsTable)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(eq(walletsTable.userId, userId));

    // Mark transaction success
    await tx.execute(sql`
      UPDATE transactions
      SET status = 'success',
          updated_at = NOW(),
          provider_reference = ${providerRef ?? null},
          metadata = metadata || ${JSON.stringify({
            verifiedAt:     new Date().toISOString(),
            credited:       true,
            monnifyVerified: true,
          })}::jsonb
      WHERE id = ${txnId}::uuid
    `);

    // ── Wallet ledger entry — audit trail for this credit ─────────────────
    // reference must be unique: append '-credit' suffix
    await tx.execute(sql`
      INSERT INTO wallet_ledger
        (user_id, wallet_id, type, amount, balance_before, balance_after,
         reference, related_transaction_id, reason)
      VALUES
        (${userId}::uuid, ${wallet.id}::uuid, 'wallet_fund', ${amount.toFixed(2)},
         ${balanceBefore}, ${newBalance},
         ${reference + '-credit'}, ${txnId}::uuid,
         'Wallet funded via Monnify payment')
      ON CONFLICT (reference) DO NOTHING
    `);

    return { newBalance };
  });

  // Real-time notification via Socket.io
  try {
    getIo().to(`user:${userId}`).emit('wallet:funded', {
      amount,
      balance: result.newBalance,
      txnId,
      reference,
    });
  } catch { /* non-fatal — socket may not be ready */ }

  // In-app notification
  try {
    await createNotification(userId, {
      type:  'transaction',
      title: 'Wallet Funded ✅',
      body:  `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2 })} has been added to your GY DATA wallet.`,
      refId: txnId,
    });
  } catch { /* non-fatal */ }

  logger.info({ userId, txnId, amount, reference }, 'Wallet credited via Monnify');
  return result;
}

export default router;
