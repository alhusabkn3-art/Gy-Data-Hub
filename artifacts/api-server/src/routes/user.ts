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
  usersTable, walletsTable, transactionsTable, notificationsTable, userPreferencesTable,
} from '@workspace/db/schema';
import { hashPin, verifyPin } from '../lib/auth.js';
import { logger } from '../lib/logger.js';
import { createNotification } from '../lib/notifications.js';

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

// ── PATCH /api/user/notifications/:id/read ────────────────────────────────────
router.patch('/notifications/:id/read', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const [updated] = await db
    .update(notificationsTable)
    .set({ read: true })
    .where(
      and(
        eq(notificationsTable.id,     id),
        eq(notificationsTable.userId, req.session.userId!),
      ),
    )
    .returning({ id: notificationsTable.id });

  if (!updated) { res.status(404).json({ error: 'Notification not found.' }); return; }
  res.json({ ok: true });
});

// ── DELETE /api/user/notifications (clear all) ────────────────────────────────
// Must be declared before /:id so Express doesn't swallow it as a param.
router.delete('/notifications', async (req: Request, res: Response): Promise<void> => {
  await db
    .delete(notificationsTable)
    .where(eq(notificationsTable.userId, req.session.userId!));
  res.json({ ok: true });
});

// ── DELETE /api/user/notifications/:id ────────────────────────────────────────
router.delete('/notifications/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  await db
    .delete(notificationsTable)
    .where(
      and(
        eq(notificationsTable.id,     id),
        eq(notificationsTable.userId, req.session.userId!),
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

    // Fire non-fatal notification — failure here never blocks the response
    await createNotification(userId, {
      type:  'transaction',
      title: 'Wallet Funded',
      body:  `₦${numericAmount.toLocaleString()} has been added to your GY DATA wallet.`,
      refId: txn!.id,
    });

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

// ── GET /api/user/preferences ─────────────────────────────────────────────────
router.get('/preferences', async (req: Request, res: Response): Promise<void> => {
  const userId = req.session.userId!;
  const [row] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, userId));
  res.json(row?.preferences ?? {});
});

// ── PUT /api/user/preferences ─────────────────────────────────────────────────
// Merges the supplied partial preferences over the stored preferences.
router.put('/preferences', async (req: Request, res: Response): Promise<void> => {
  const userId = req.session.userId!;
  const incoming = req.body as Record<string, unknown>;

  if (!incoming || typeof incoming !== 'object') {
    res.status(400).json({ error: 'Request body must be a JSON object.' });
    return;
  }

  // Upsert: merge incoming over existing stored value
  const [existing] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, userId));

  if (existing) {
    const merged = { ...(existing.preferences as Record<string, unknown>), ...incoming };
    const [updated] = await db
      .update(userPreferencesTable)
      .set({ preferences: merged, updatedAt: new Date() })
      .where(eq(userPreferencesTable.userId, userId))
      .returning({ preferences: userPreferencesTable.preferences });
    res.json(updated?.preferences ?? merged);
  } else {
    const [inserted] = await db
      .insert(userPreferencesTable)
      .values({ userId, preferences: incoming })
      .returning({ preferences: userPreferencesTable.preferences });
    res.json(inserted?.preferences ?? incoming);
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

// ── PATCH /api/user/username ──────────────────────────────────────────────────
//
// Change username — enforces:
//   1. Valid format: 3–20 chars, [a-z0-9_] only (stored lowercase)
//   2. Global uniqueness — 409 if taken
//   3. 30-day cooldown — 429 with nextChangeAt if changed too recently
router.patch('/username', async (req: Request, res: Response): Promise<void> => {
  const userId = req.session.userId!;
  const { username } = req.body as { username?: string };

  if (!username) {
    res.status(400).json({ error: 'username is required.' });
    return;
  }

  const normalized = username.toLowerCase().trim();
  if (!/^[a-z0-9_]{3,20}$/.test(normalized)) {
    res.status(400).json({ error: 'invalid_format' });
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, username: usersTable.username, usernameChangedAt: usersTable.usernameChangedAt })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) { res.status(404).json({ error: 'User not found.' }); return; }

  // Enforce 30-day cooldown
  if (user.usernameChangedAt) {
    const elapsed = Date.now() - user.usernameChangedAt.getTime();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (elapsed < thirtyDaysMs) {
      const nextChangeAt = new Date(user.usernameChangedAt.getTime() + thirtyDaysMs).toISOString();
      res.status(429).json({ error: 'cooldown', nextChangeAt });
      return;
    }
  }

  // Check availability (another user may have taken it)
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, normalized));

  if (existing && existing.id !== userId) {
    res.status(409).json({ error: 'username_taken' });
    return;
  }

  const now = new Date();
  await db.update(usersTable)
    .set({ username: normalized, usernameChangedAt: now, updatedAt: now })
    .where(eq(usersTable.id, userId));

  logger.info({ userId, username: normalized }, 'Username changed');
  res.json({ ok: true, username: normalized, usernameChangedAt: now.toISOString() });
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
