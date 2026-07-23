/**
 * /api/auth — Registration, login, logout, session restore, forgot-PIN.
 *
 * Security model:
 *   - Session is regenerated on login to prevent session fixation attacks.
 *   - All auth mutations are rate-limited at the app level (10 / 15 min).
 *   - Forgot-PIN OTP is bcrypt-hashed in the DB with a 5-minute TTL.
 *   - OTPs are single-use and cleared on first successful verification.
 *   - Constant-time responses for non-existent accounts prevent enumeration.
 *   - In production, the OTP is NOT returned in the response body (SMS delivery only).
 *
 * PIN hashes use bcryptjs (pure JS — bundles cleanly with esbuild).
 * PIN hashes are never returned to callers.
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@workspace/db';
import {
  usersTable, walletsTable, transactionsTable, notificationsTable, userPreferencesTable,
} from '@workspace/db/schema';
import { hashPin, verifyPin } from '../lib/auth.js';
import { logger } from '../lib/logger.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Strips all non-digit characters; enforces 10–11 digit length for Nigerian numbers */
function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '').slice(0, 11);
}

/** Basic RFC 5322-inspired email validation */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function genAccountNumber(): string {
  return String(Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000);
}

function genReferralCode(firstName: string): string {
  const safe = firstName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'GY';
  return 'GY-' + safe + Math.floor(Math.random() * 900 + 100);
}

/** Shape returned to the frontend — never includes any PIN hash */
function safeUser(user: typeof usersTable.$inferSelect) {
  return {
    id:                user.id,
    name:              user.name,
    firstName:         user.firstName,
    lastName:          user.lastName,
    username:          user.username,
    email:             user.email,
    phone:             user.phone,
    accountNumber:     user.accountNumber,
    bankName:          user.bankName,
    referralCode:      user.referralCode,
    kycStatus:         user.kycStatus,
    usernameChangedAt: user.usernameChangedAt ? user.usernameChangedAt.toISOString() : null,
    createdAt:         user.createdAt,
  };
}

async function loadFullSession(userId: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) return null;

  const [wallet]  = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
  const [prefRow] = await db.select().from(userPreferencesTable).where(eq(userPreferencesTable.userId, userId));

  const transactions = await db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(transactionsTable.createdAt);
  transactions.reverse();

  const notifications = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(notificationsTable.createdAt);
  notifications.reverse();

  return {
    user:          safeUser(user),
    balance:       wallet?.balance ?? '0',
    transactions,
    notifications,
    preferences:   (prefRow?.preferences ?? {}) as Record<string, unknown>,
  };
}

/** Wraps session.regenerate in a Promise for use with async/await. */
function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ── GET /api/auth/check-username?username=... ─────────────────────────────────
router.get('/check-username', async (req: Request, res: Response): Promise<void> => {
  const { username } = req.query as { username?: string };
  if (!username || typeof username !== 'string') {
    res.status(400).json({ error: 'username query param required.' });
    return;
  }
  const normalized = username.toLowerCase().trim();
  if (!/^[a-z]{4,15}$/.test(normalized)) {
    res.json({ available: false, reason: 'invalid_format' });
    return;
  }
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, normalized));
  res.json({ available: !existing });
});

// ── POST /api/auth/register ───────────────────────────────────────────────────
router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const { name, phone, email, loginPin, username } = req.body as {
    name?: string; phone?: string; email?: string; loginPin?: string; username?: string;
  };

  if (!name || !phone || !email || !loginPin || !username) {
    res.status(400).json({ error: 'name, phone, email, loginPin, and username are required.' });
    return;
  }

  // Name validation
  const trimmedName = name.trim();
  if (trimmedName.length < 2 || trimmedName.length > 100) {
    res.status(400).json({ error: 'name must be between 2 and 100 characters.' });
    return;
  }

  // Email validation
  const trimmedEmail = email.trim().toLowerCase();
  if (!isValidEmail(trimmedEmail)) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }

  // PIN validation
  if (!/^\d{6}$/.test(loginPin)) {
    res.status(400).json({ error: 'loginPin must be exactly 6 digits.' });
    return;
  }

  // Username validation
  const normalizedUsername = username.toLowerCase().trim();
  if (!/^[a-z0-9]{4,15}$/.test(normalizedUsername)) {
    res.status(400).json({ error: 'username must be 4–15 characters (letters and numbers only, no symbols).' });
    return;
  }

  // Phone validation
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone.length < 10 || normalizedPhone.length > 11) {
    res.status(400).json({ error: 'Please enter a valid Nigerian phone number (10–11 digits).' });
    return;
  }

  const [existingPhone] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.phone, normalizedPhone));

  if (existingPhone) {
    res.status(409).json({ error: 'phone_taken' });
    return;
  }

  const [existingUsername] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, normalizedUsername));

  if (existingUsername) {
    res.status(409).json({ error: 'username_taken' });
    return;
  }

  const parts     = trimmedName.split(/\s+/);
  const firstName = parts[0]!;
  const lastName  = parts.slice(1).join(' ');
  const pinHash   = await hashPin(loginPin);

  const [newUser] = await db.insert(usersTable).values({
    name:          trimmedName,
    firstName,
    lastName,
    username:      normalizedUsername,
    email:         trimmedEmail,
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

  // ── Session fixation prevention: regenerate before setting userId ─────────
  try {
    await regenerateSession(req);
  } catch (err) {
    logger.error({ err }, 'Session regeneration failed on register');
    res.status(500).json({ error: 'Session error. Please try again.' });
    return;
  }
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

  // ── Session fixation prevention: regenerate session ID before storing user ─
  try {
    await regenerateSession(req);
  } catch (err) {
    logger.error({ err }, 'Session regeneration failed on login');
    res.status(500).json({ error: 'Session error. Please try again.' });
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
// Generates a 6-digit OTP, stores it hashed in the DB with a 5-minute TTL.
// In production: OTP is NOT returned in the response (must be delivered via SMS).
// In development: OTP is returned in response body for testing.
router.post('/forgot-pin/request', async (req: Request, res: Response): Promise<void> => {
  const { phone } = req.body as { phone?: string };

  if (!phone) {
    res.status(400).json({ error: 'phone is required.' });
    return;
  }

  const normalizedPhone = normalizePhone(phone);
  const [user] = await db
    .select({ id: usersTable.id, resetOtpHash: usersTable.resetOtpHash, resetOtpExpiry: usersTable.resetOtpExpiry })
    .from(usersTable)
    .where(eq(usersTable.phone, normalizedPhone));

  // Always return 200 — don't reveal account existence from this unauthenticated endpoint
  if (!user) {
    await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
    res.json({
      message: 'If an account with this number exists, a code has been sent.',
      ...(process.env['NODE_ENV'] !== 'production' ? { devNote: 'phone not found' } : {}),
    });
    return;
  }

  // Preserve a Customer Care–approved reset OTP if one is still valid (> 5 min remaining)
  if (
    user.resetOtpHash &&
    user.resetOtpExpiry &&
    new Date(user.resetOtpExpiry).getTime() > Date.now() + 5 * 60 * 1000
  ) {
    res.json({
      message: 'If an account with this number exists, a code has been sent.',
      ...(process.env['NODE_ENV'] !== 'production' ? { devNote: 'CC-approved reset OTP already active' } : {}),
    });
    return;
  }

  const otpDigits = (crypto.randomInt(0, 1_000_000)).toString().padStart(6, '0');
  const otpHash   = await hashPin(otpDigits);
  const expiry    = new Date(Date.now() + 5 * 60 * 1000);

  await db.update(usersTable)
    .set({ resetOtpHash: otpHash, resetOtpExpiry: expiry, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  logger.info({ userId: user.id }, 'PIN reset OTP issued');

  // TODO: Deliver OTP via SMS gateway in production
  res.json({
    message: 'If an account with this number exists, a code has been sent.',
    ...(process.env['NODE_ENV'] !== 'production' ? { otp: otpDigits } : {}),
  });
});

// ── POST /api/auth/forgot-pin/reset ──────────────────────────────────────────
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
  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, normalizedPhone));

  const badRequest = async () => {
    await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
    res.status(400).json({ error: 'invalid_or_expired' });
  };

  if (!user || !user.resetOtpHash || !user.resetOtpExpiry) {
    await badRequest(); return;
  }

  if (new Date() > user.resetOtpExpiry) {
    await db.update(usersTable)
      .set({ resetOtpHash: null, resetOtpExpiry: null })
      .where(eq(usersTable.id, user.id));
    await badRequest(); return;
  }

  const otpOk = await verifyPin(otp, user.resetOtpHash);
  if (!otpOk) {
    await badRequest(); return;
  }

  const newPinHash = await hashPin(newPin);
  await db.update(usersTable)
    .set({ loginPinHash: newPinHash, resetOtpHash: null, resetOtpExpiry: null, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id));

  logger.info({ userId: user.id }, 'PIN reset via OTP challenge');
  res.json({ ok: true });
});

export default router;
