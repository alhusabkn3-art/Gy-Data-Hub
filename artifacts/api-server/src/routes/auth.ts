/**
 * /api/auth — Registration, login, logout, session restore, forgot-PIN.
 *
 * Forgot-PIN uses a two-step server-side OTP challenge:
 *   1. POST /api/auth/forgot-pin/request  — generates a 6-digit OTP, stores it
 *      hashed (bcrypt) in the DB with a 5-minute TTL, and returns it in the
 *      response body (in production this would be delivered via SMS; the caller
 *      should never display the OTP to the user in prod).
 *   2. POST /api/auth/forgot-pin/reset    — accepts phone + otp + newPin.
 *      Verifies the OTP against the stored hash and expiry before resetting.
 *      The OTP is single-use: it is cleared on first successful use.
 *
 * PIN hashes use bcryptjs (pure JS — bundles cleanly with esbuild).
 * All PIN hashes are never returned to callers.
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@workspace/db';
import {
  usersTable, walletsTable, transactionsTable, notificationsTable,
} from '@workspace/db/schema';
import { hashPin, verifyPin } from '../lib/auth.js';
import { logger } from '../lib/logger.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(0, 11);
}

function genAccountNumber(): string {
  return String(Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000);
}

function genReferralCode(firstName: string): string {
  return 'GY-' + firstName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) +
    Math.floor(Math.random() * 900 + 100);
}

/** Shape returned to the frontend — never includes any PIN hash */
function safeUser(user: typeof usersTable.$inferSelect) {
  return {
    id:            user.id,
    name:          user.name,
    firstName:     user.firstName,
    lastName:      user.lastName,
    email:         user.email,
    phone:         user.phone,
    accountNumber: user.accountNumber,
    bankName:      user.bankName,
    referralCode:  user.referralCode,
    kycStatus:     user.kycStatus,
    createdAt:     user.createdAt,
  };
}

async function loadFullSession(userId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return null;

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));

  const transactions = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(transactionsTable.createdAt);
  transactions.reverse(); // newest first

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(notificationsTable.createdAt);
  notifications.reverse(); // newest first

  return {
    user:          safeUser(user),
    balance:       wallet?.balance ?? '0',
    transactions,
    notifications,
  };
}

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { name, phone, email, loginPin } = req.body as {
    name?: string; phone?: string; email?: string; loginPin?: string;
  };

  if (!name || !phone || !email || !loginPin) {
    res.status(400).json({ error: 'name, phone, email, and loginPin are required.' });
    return;
  }
  if (!/^\d{6}$/.test(loginPin)) {
    res.status(400).json({ error: 'loginPin must be exactly 6 digits.' });
    return;
  }

  const normalizedPhone = normalizePhone(phone);

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.phone, normalizedPhone));

  if (existing.length > 0) {
    res.status(409).json({ error: 'phone_taken' });
    return;
  }

  const parts     = name.trim().split(' ');
  const firstName = parts[0]!;
  const lastName  = parts.slice(1).join(' ');
  const pinHash   = await hashPin(loginPin);

  const [newUser] = await db.insert(usersTable).values({
    name:          name.trim(),
    firstName,
    lastName,
    email:         email.trim().toLowerCase(),
    phone:         normalizedPhone,
    loginPinHash:  pinHash,
    accountNumber: genAccountNumber(),
    bankName:      'GY DATA Wallet',
    referralCode:  genReferralCode(firstName),
    kycStatus:     'unverified',
    status:        'active',
  }).returning();

  if (!newUser) {
    res.status(500).json({ error: 'Failed to create account.' });
    return;
  }

  await db.insert(walletsTable).values({ userId: newUser.id, balance: '0' });

  const [welcomeNotif] = await db.insert(notificationsTable).values({
    userId: newUser.id,
    type:   'system',
    title:  'Welcome to GY DATA! 🎉',
    body:   `Hi ${firstName}! Your account is ready. Buy data, airtime, and more in seconds.`,
    read:   false,
  }).returning();

  req.session.userId = newUser.id;

  logger.info({ userId: newUser.id, phone: normalizedPhone }, 'New user registered');

  res.status(201).json({
    user:          safeUser(newUser),
    balance:       '0',
    transactions:  [],
    notifications: welcomeNotif ? [welcomeNotif] : [],
  });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { phone, loginPin } = req.body as { phone?: string; loginPin?: string };

  if (!phone || !loginPin) {
    res.status(400).json({ error: 'phone and loginPin are required.' });
    return;
  }

  const normalizedPhone = normalizePhone(phone);
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, normalizedPhone));

  if (!user) {
    res.status(401).json({ error: 'no_account' });
    return;
  }

  const pinOk = await verifyPin(loginPin, user.loginPinHash);
  if (!pinOk) {
    res.status(401).json({ error: 'wrong_pin' });
    return;
  }

  req.session.userId = user.id;

  const session = await loadFullSession(user.id);
  if (!session) {
    res.status(500).json({ error: 'Session load failed.' });
    return;
  }

  logger.info({ userId: user.id }, 'User logged in');
  res.json(session);
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────
router.post('/logout', (req: Request, res: Response): void => {
  const userId = req.session.userId;
  req.session.destroy((err) => {
    if (err) logger.error({ err }, 'Session destroy error');
    res.clearCookie('gyd_sid');
    if (userId) logger.info({ userId }, 'User logged out');
    res.json({ ok: true });
  });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', async (req: Request, res: Response): Promise<void> => {
  if (!req.session.userId) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  const session = await loadFullSession(req.session.userId);
  if (!session) {
    req.session.destroy(() => {});
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }

  res.json(session);
});

// ── GET /api/auth/check-phone?phone=... ──────────────────────────────────────
router.get('/check-phone', async (req: Request, res: Response): Promise<void> => {
  const phone = req.query['phone'];
  if (!phone || typeof phone !== 'string') {
    res.status(400).json({ error: 'phone query param required.' });
    return;
  }
  const normalized = normalizePhone(phone);
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.phone, normalized));

  res.json({ exists: !!user });
});

// ── POST /api/auth/forgot-pin/request ────────────────────────────────────────
//
// Step 1 of the two-step PIN-reset flow.
// Generates a 6-digit OTP, stores it hashed in the DB with a 5-minute TTL.
//
// In production this OTP would be delivered via SMS; in development the OTP is
// returned in the response body so callers (e.g. a test suite or the dev UI)
// can proceed without an SMS gateway.  Production callers should NOT expose
// this field to the end user — it will be removed once SMS is wired up.
router.post('/forgot-pin/request', async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.body as { phone?: string };

  if (!phone) {
    res.status(400).json({ error: 'phone is required.' });
    return;
  }

  const normalizedPhone = normalizePhone(phone);
  const [user] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.phone, normalizedPhone));

  // Always return 200 even when the phone isn't found — don't leak account existence
  // from this unauthenticated endpoint.
  if (!user) {
    // Constant-time response so timing attacks can't enumerate accounts
    await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
    res.json({
      message: 'If an account with this number exists, a code has been sent.',
      ...(process.env['NODE_ENV'] !== 'production' ? { devNote: 'phone not found' } : {}),
    });
    return;
  }

  // Generate a cryptographically random 6-digit OTP
  const otpDigits = (crypto.randomInt(0, 1_000_000)).toString().padStart(6, '0');
  const otpHash   = await hashPin(otpDigits);
  const expiry    = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await db.update(usersTable)
    .set({ resetOtpHash: otpHash, resetOtpExpiry: expiry, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  logger.info({ userId: user.id }, 'PIN reset OTP issued');

  res.json({
    message: 'If an account with this number exists, a code has been sent.',
    // In development only — remove once an SMS gateway is wired up
    ...(process.env['NODE_ENV'] !== 'production' ? { otp: otpDigits } : {}),
  });
});

// ── POST /api/auth/forgot-pin/reset ──────────────────────────────────────────
//
// Step 2 of the two-step PIN-reset flow.
// Requires: phone, otp (6-digit code from step 1), newPin (6 digits).
// Verifies the OTP against the stored bcrypt hash and checks the expiry.
// Clears the OTP fields after successful verification (single-use).
router.post('/forgot-pin/reset', async (req: Request, res: Response): Promise<void> => {
  const { phone, otp, newPin } = req.body as {
    phone?: string; otp?: string; newPin?: string;
  };

  if (!phone || !otp || !newPin) {
    res.status(400).json({ error: 'phone, otp, and newPin are required.' });
    return;
  }
  if (!/^\d{6}$/.test(newPin)) {
    res.status(400).json({ error: 'newPin must be exactly 6 digits.' });
    return;
  }

  const normalizedPhone = normalizePhone(phone);
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.phone, normalizedPhone));

  // Generic error — don't reveal whether the phone exists or the OTP is wrong
  const badRequest = async () => {
    await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
    res.status(400).json({ error: 'invalid_or_expired' });
  };

  if (!user || !user.resetOtpHash || !user.resetOtpExpiry) {
    await badRequest(); return;
  }

  // Check expiry
  if (new Date() > user.resetOtpExpiry) {
    // Clear the expired OTP to avoid it lingering in the DB
    await db.update(usersTable)
      .set({ resetOtpHash: null, resetOtpExpiry: null })
      .where(eq(usersTable.id, user.id));
    await badRequest(); return;
  }

  // Verify OTP
  const otpOk = await verifyPin(otp, user.resetOtpHash);
  if (!otpOk) {
    await badRequest(); return;
  }

  // OTP is valid — reset PIN and clear OTP fields (single-use)
  const newPinHash = await hashPin(newPin);
  await db.update(usersTable)
    .set({
      loginPinHash:   newPinHash,
      resetOtpHash:   null,
      resetOtpExpiry: null,
      updatedAt:      new Date(),
    })
    .where(eq(usersTable.id, user.id));

  logger.info({ userId: user.id }, 'PIN reset via OTP challenge');
  res.json({ ok: true });
});

export default router;
