/**
 * /api/user — Protected routes. Every handler is scoped to req.session.userId.
 *
 * Wallet mutations (fund & spend) use explicit DB transactions with
 * SELECT ... FOR UPDATE row-level locking so concurrent requests cannot
 * race past the balance check or produce lost-update overwrites.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '@workspace/db';
import {
  usersTable, walletsTable, transactionsTable, notificationsTable,
} from '@workspace/db/schema';
import { hashPin, verifyPin } from '../lib/auth.js';
import { logger } from '../lib/logger.js';

const router = Router();

// ── Auth guard ────────────────────────────────────────────────────────────────
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  next();
}

router.use(requireAuth);

// ── GET /api/user/profile ─────────────────────────────────────────────────────
router.get('/profile', async (req: Request, res: Response): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.session.userId!));
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const { loginPinHash: _l, purchasePinHash: _p, resetOtpHash: _o, resetOtpExpiry: _e, ...safe } = user;
  res.json(safe);
});

// ── GET /api/user/wallet ──────────────────────────────────────────────────────
router.get('/wallet', async (req: Request, res: Response): Promise<void> => {
  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, req.session.userId!));
  res.json({ balance: wallet?.balance ?? '0' });
});

// ── GET /api/user/transactions ────────────────────────────────────────────────
router.get('/transactions', async (req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, req.session.userId!))
    .orderBy(transactionsTable.createdAt);
  rows.reverse(); // newest first
  res.json(rows);
});

// ── GET /api/user/notifications ───────────────────────────────────────────────
router.get('/notifications', async (req: Request, res: Response): Promise<void> => {
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, req.session.userId!))
    .orderBy(notificationsTable.createdAt);
  rows.reverse(); // newest first
  res.json(rows);
});

// ── POST /api/user/notifications/read-all ────────────────────────────────────
router.post('/notifications/read-all', async (req: Request, res: Response): Promise<void> => {
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(
      and(
        eq(notificationsTable.userId, req.session.userId!),
        eq(notificationsTable.read,   false),
      ),
    );
  res.json({ ok: true });
});

// ── POST /api/user/wallet/fund ────────────────────────────────────────────────
//
// Atomic: SELECT ... FOR UPDATE locks the wallet row so concurrent fund
// requests cannot produce lost updates (last-write-wins race).
// Both the balance update and the transaction record are written in the
// same DB transaction — they commit or roll back together.
router.post('/wallet/fund', async (req: Request, res: Response): Promise<void> => {
  const { amount } = req.body as { amount?: number };
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    res.status(400).json({ error: 'amount must be a positive number.' });
    return;
  }

  const userId = req.session.userId!;

  try {
    const { newBalance, txn } = await db.transaction(async (tx) => {
      // Lock the row — any concurrent fund/spend request waits here
      const [wallet] = await tx
        .select()
        .from(walletsTable)
        .where(eq(walletsTable.userId, userId))
        .for('update');

      if (!wallet) throw Object.assign(new Error('Wallet not found'), { code: 'NOT_FOUND' });

      const newBalance = (parseFloat(wallet.balance) + numericAmount).toFixed(2);

      await tx.update(walletsTable)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(eq(walletsTable.userId, userId));

      const [txn] = await tx.insert(transactionsTable).values({
        userId,
        type:          'wallet_fund',
        service:       'Wallet Funding',
        provider:      'Bank Transfer',
        amount:        numericAmount.toFixed(2),
        status:        'success',
        description:   'Funded wallet via Bank Transfer',
        paymentMethod: 'Bank Transfer',
      }).returning();

      return { newBalance, txn };
    });

    logger.info({ userId, amount: numericAmount }, 'Wallet funded');
    res.json({ balance: newBalance, transaction: txn });
  } catch (err: unknown) {
    const e = err as { code?: string; message?: string };
    if (e.code === 'NOT_FOUND') { res.status(404).json({ error: 'Wallet not found.' }); return; }
    logger.error({ err }, 'wallet/fund transaction failed');
    res.status(500).json({ error: 'Failed to fund wallet.' });
  }
});

// ── POST /api/user/transactions ───────────────────────────────────────────────
//
// Records a spend transaction (airtime, data, electricity, etc.).
//
// Server-side invariants enforced inside a DB transaction with FOR UPDATE:
//   1. type must be in the spend allow-list — wallet_fund blocked
//   2. balance validated before deduction → 402 if insufficient
//   3. status always written as 'success' regardless of client input
//   4. wallet update + transaction insert commit atomically — no partial state
const SPEND_TYPES = new Set(['data', 'airtime', 'electricity', 'cable', 'betting', 'exam']);

router.post('/transactions', async (req: Request, res: Response): Promise<void> => {
  const { type, service, provider, amount, description, paymentMethod, reference } =
    req.body as {
      type?: string; service?: string; provider?: string; amount?: number;
      description?: string; paymentMethod?: string; reference?: string;
    };

  if (!type || !service || !provider || amount === undefined) {
    res.status(400).json({ error: 'type, service, provider, and amount are required.' });
    return;
  }
  if (!SPEND_TYPES.has(type)) {
    res.status(400).json({ error: `Invalid transaction type: ${type}` });
    return;
  }
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    res.status(400).json({ error: 'amount must be a positive number.' });
    return;
  }

  const userId = req.session.userId!;

  try {
    const { txn, newBalance } = await db.transaction(async (tx) => {
      // Lock the wallet row — any concurrent spend on this wallet waits here
      const [wallet] = await tx
        .select()
        .from(walletsTable)
        .where(eq(walletsTable.userId, userId))
        .for('update');

      if (!wallet) throw Object.assign(new Error('Wallet not found'), { code: 'NOT_FOUND' });

      const currentBalance = parseFloat(wallet.balance);
      if (currentBalance < numericAmount) {
        throw Object.assign(new Error('Insufficient funds'), { code: 'INSUFFICIENT_FUNDS' });
      }

      const newBalance = (currentBalance - numericAmount).toFixed(2);

      await tx.update(walletsTable)
        .set({ balance: newBalance, updatedAt: new Date() })
        .where(eq(walletsTable.userId, userId));

      // Status is always 'success' — recorded only after balance deduction commits.
      // Failed/pending states are created by the ClubKonnect webhook, not by the client.
      const [txn] = await tx.insert(transactionsTable).values({
        userId,
        type:          type as 'data' | 'airtime' | 'electricity' | 'cable' | 'betting' | 'exam',
        service,
        provider,
        amount:        numericAmount.toFixed(2),
        status:        'success',
        description:   description ?? '',
        paymentMethod: paymentMethod ?? null,
        reference:     reference ?? null,
      }).returning();

      return { txn, newBalance };
    });

    logger.info({ userId, type, amount: numericAmount }, 'Spend transaction recorded');
    res.status(201).json({ ...txn, balance: newBalance });
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'NOT_FOUND')          { res.status(404).json({ error: 'Wallet not found.' }); return; }
    if (e.code === 'INSUFFICIENT_FUNDS') { res.status(402).json({ error: 'insufficient_funds' }); return; }
    logger.error({ err }, 'transaction spend failed');
    res.status(500).json({ error: 'Failed to record transaction.' });
  }
});

// ── POST /api/user/check-pin ─────────────────────────────────────────────────
router.post('/check-pin', async (req: Request, res: Response): Promise<void> => {
  const { pin } = req.body as { pin?: string };
  if (!pin) { res.status(400).json({ valid: false }); return; }
  const userId = req.session.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ valid: false }); return; }
  const ok = await verifyPin(pin, user.loginPinHash);
  res.json({ valid: ok });
});

// ── PUT /api/user/pin ─────────────────────────────────────────────────────────
router.put('/pin', async (req: Request, res: Response): Promise<void> => {
  const { currentPin, newPin } = req.body as { currentPin?: string; newPin?: string };

  if (!currentPin || !newPin) {
    res.status(400).json({ error: 'currentPin and newPin are required.' });
    return;
  }
  if (!/^\d{6}$/.test(newPin)) {
    res.status(400).json({ error: 'newPin must be exactly 6 digits.' });
    return;
  }

  const userId = req.session.userId!;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) { res.status(404).json({ error: 'User not found.' }); return; }

  const pinOk = await verifyPin(currentPin, user.loginPinHash);
  if (!pinOk) {
    res.status(403).json({ error: 'wrong_pin' });
    return;
  }

  const newHash = await hashPin(newPin);
  await db.update(usersTable)
    .set({ loginPinHash: newHash, updatedAt: new Date() })
    .where(eq(usersTable.id, userId));

  logger.info({ userId }, 'PIN changed');
  res.json({ ok: true });
});

export default router;
