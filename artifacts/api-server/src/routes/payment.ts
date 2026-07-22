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
 */
import { Router, type Request, type Response } from 'express';
import { eq, and } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db } from '@workspace/db';
import { walletsTable, transactionsTable, usersTable } from '@workspace/db/schema';
import { requireAuth } from './user.js';
import { logger } from '../lib/logger.js';
import { createNotification } from '../lib/notifications.js';
import * as monnify from '../lib/monnify.js';

const router = Router();

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

  const userId = req.session.userId!;

  // Fetch user (need name + email for Monnify)
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: 'User not found.' }); return; }

  // Generate a cryptographically random, unique payment reference
  const randomHex     = crypto.randomBytes(4).toString('hex').toUpperCase();
  const paymentRef    = `GY-PAY-${Date.now()}-${randomHex}`;

  // Determine redirect URL (where Monnify sends the user after checkout)
  const devDomain  = process.env['REPLIT_DEV_DOMAIN'];
  const redirectUrl = devDomain
    ? `https://${devDomain}/`
    : `${req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.get('host') ?? 'localhost'}/`;

  // ── Step 1: Create pending transaction in DB ──────────────────────────────
  // Done BEFORE calling Monnify so no payment can ever be orphaned.
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
      metadata:      {
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
          expectedAmount:           numericAmount,
          initiatedAt:              new Date().toISOString(),
          monnifyTransactionRef:    result.transactionReference,
        },
      })
      .where(eq(transactionsTable.id, txnId));

    logger.info(
      { userId, paymentRef, txnId, amount: numericAmount },
      'Monnify payment initialized',
    );

    res.json({
      ok:            true,
      checkoutUrl:   result.checkoutUrl,
      reference:     paymentRef,
      transactionId: txnId,
    });
  } catch (err) {
    // Mark transaction failed so it doesn't linger as pending
    await db.update(transactionsTable)
      .set({ status: 'failed', metadata: { error: 'Monnify initialization failed' } })
      .where(eq(transactionsTable.id, txnId));

    logger.error({ err, userId, paymentRef }, 'Monnify initialize failed');
    res.status(502).json({ error: 'Payment gateway unavailable. Please try again.' });
  }
});

// ── GET /api/payment/monnify/status/:reference ────────────────────────────────
// Requires user session. Frontend polls this every few seconds after opening
// the Monnify checkout. Returns current payment status + balance on success.
router.get('/monnify/status/:reference', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { reference } = req.params as { reference: string };
  const userId = req.session.userId!;

  // Must belong to this user
  const [txn] = await db
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.reference, reference),
        eq(transactionsTable.userId,    userId),
      ),
    );

  if (!txn) { res.status(404).json({ error: 'Transaction not found.' }); return; }

  // Already finalized — return immediately without hitting Monnify
  if (txn.status === 'success' || txn.status === 'failed') {
    const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
    res.json({ status: txn.status, reference, balance: wallet?.balance ?? '0' });
    return;
  }

  // ── Still pending — check with Monnify ────────────────────────────────────
  const meta        = txn.metadata as { monnifyTransactionRef?: string; expectedAmount?: number } | null;
  const monnifyRef  = meta?.monnifyTransactionRef;

  if (!monnifyRef) {
    // Shouldn't happen — return pending and let the client keep polling
    res.json({ status: 'pending', reference });
    return;
  }

  try {
    const verification   = await monnify.verifyTransaction(monnifyRef);
    const expectedAmount = parseFloat(txn.amount);
    const isPaid         = verification.paymentStatus === 'PAID';
    const amountOk       = Math.abs(verification.amountPaid - expectedAmount) < 0.01;

    if (isPaid && amountOk) {
      const { newBalance } = await creditWallet(userId, txn.id, expectedAmount, reference);
      res.json({ status: 'success', reference, balance: newBalance });
      return;
    }

    const terminalFail = ['FAILED', 'EXPIRED', 'CANCELLED', 'REVERSED'].includes(
      verification.paymentStatus,
    );
    if (terminalFail) {
      await db.update(transactionsTable)
        .set({ status: 'failed' })
        .where(eq(transactionsTable.id, txn.id));
      res.json({ status: 'failed', reference });
      return;
    }

    // PENDING / OVERPAID (amount mismatch) — keep polling
    res.json({ status: 'pending', reference, paymentStatus: verification.paymentStatus });
  } catch (err) {
    // Don't fail the poll on transient Monnify errors — return current DB status
    logger.error({ err, reference }, 'Monnify status check error');
    res.json({ status: txn.status, reference });
  }
});

// ── POST /api/payment/monnify/webhook ─────────────────────────────────────────
// Public — Monnify calls this when a payment completes.
// Configure this URL in the Monnify dashboard:
//   https://<your-domain>/api/payment/monnify/webhook
//
// Signature verification happens BEFORE any payload is processed.
// Response is always 200 quickly; heavy processing runs after res.json().
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

  // ── Process webhook asynchronously ────────────────────────────────────────
  const payload = req.body as {
    paymentReference?:     string; // OUR reference
    transactionReference?: string; // Monnify's reference
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

    // Idempotency — already processed
    if (txn.status !== 'pending') {
      logger.info({ paymentReference, status: txn.status }, 'Monnify webhook: already processed');
      return;
    }

    if (paymentStatus !== 'PAID') {
      await db.update(transactionsTable)
        .set({ status: 'failed', metadata: { ...((txn.metadata as object) ?? {}), webhookStatus: paymentStatus } })
        .where(eq(transactionsTable.id, txn.id));
      logger.info({ paymentReference, paymentStatus }, 'Monnify webhook: non-PAID status — marked failed');
      return;
    }

    // Server-side double-verification before crediting any wallet
    const meta       = txn.metadata as { monnifyTransactionRef?: string; expectedAmount?: number } | null;
    const monnifyRef = meta?.monnifyTransactionRef ?? payload.transactionReference;
    if (!monnifyRef) {
      logger.error({ paymentReference }, 'Monnify webhook: no monnifyTransactionRef available for verification');
      return;
    }

    const verification = await monnify.verifyTransaction(monnifyRef);

    if (verification.paymentStatus !== 'PAID') {
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

    await creditWallet(txn.userId, txn.id, expectedAmount, paymentReference);
    logger.info(
      { paymentReference, userId: txn.userId, amount: expectedAmount },
      'Monnify webhook: wallet credited',
    );
  } catch (err) {
    logger.error({ err, paymentReference }, 'Monnify webhook processing error');
  }
});

// ── Shared wallet credit helper ───────────────────────────────────────────────
// Atomic: SELECT FOR UPDATE prevents concurrent credits on the same wallet.
// Re-checks transaction status inside the DB transaction — safe to call from
// both the polling endpoint and the webhook handler without risk of double-credit.
async function creditWallet(
  userId:    string,
  txnId:     string,
  amount:    number,
  reference: string,
): Promise<{ newBalance: string }> {
  const result = await db.transaction(async (tx) => {
    const [wallet] = await tx
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.userId, userId))
      .for('update');

    if (!wallet) throw Object.assign(new Error('Wallet not found'), { code: 'NOT_FOUND' });

    // Re-read status inside the transaction — idempotency guard
    const [txnRow] = await tx
      .select({ status: transactionsTable.status, balance: walletsTable.balance })
      .from(transactionsTable)
      .where(eq(transactionsTable.id, txnId));

    if (txnRow?.status === 'success') {
      // Already credited in a concurrent request — return current balance
      return { newBalance: wallet.balance };
    }

    const newBalance = (parseFloat(wallet.balance) + amount).toFixed(2);

    await tx.update(walletsTable)
      .set({ balance: newBalance, updatedAt: new Date() })
      .where(eq(walletsTable.userId, userId));

    await tx.update(transactionsTable)
      .set({
        status:   'success',
        metadata: {
          verifiedAt: new Date().toISOString(),
          credited:   true,
        },
      })
      .where(eq(transactionsTable.id, txnId));

    return { newBalance };
  });

  // Fire notification after commit — failure here never rolls back the credit
  try {
    await createNotification(userId, {
      type:  'transaction',
      title: 'Wallet Funded',
      body:  `₦${amount.toLocaleString()} has been added to your GY DATA wallet.`,
      refId: txnId,
    });
  } catch { /* non-fatal */ }

  logger.info({ userId, txnId, amount, reference }, 'Wallet credited via Monnify');
  return result;
}

export default router;
