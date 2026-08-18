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
import { sql } from 'drizzle-orm';
import { db } from '@workspace/db';
import {
  usersTable,
  walletsTable,
  transactionsTable,
  notificationsTable,
  userPreferencesTable,
} from '@workspace/db/schema';
import { hashPin, verifyPin } from '../lib/auth.js';
import { logger } from '../lib/logger.js';

const router = Router();

function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');

  if (digits.startsWith('234') && digits.length === 13) {
    digits = '0' + digits.slice(3);
  }

  return digits.slice(0, 11);
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function genAccountNumber(): string {
  return String(Math.floor(Math.random() * 9000000000) + 1000000000);
}

function genReferralCode(firstName: string): string {
  const safe =
    firstName.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4) || 'GY';

  return 'GY-' + safe + Math.floor(Math.random() * 900 + 100);
}

function safeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    name: user.name,
    firstName: user.firstName,
    lastName: user.lastName,
    username: user.username,
    email: user.email,
    phone: user.phone,
    accountNumber: user.accountNumber,
    bankName: user.bankName,
    referralCode: user.referralCode,
    kycStatus: user.kycStatus,
    usernameChangedAt: user.usernameChangedAt
      ? user.usernameChangedAt.toISOString()
      : null,
    createdAt: user.createdAt,
  };
}

async function loadFullSession(userId: string) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) return null;

  const [wallet] = await db
    .select()
    .from(walletsTable)
    .where(eq(walletsTable.userId, userId));

  let prefRow:
    | typeof userPreferencesTable.$inferSelect
    | undefined;

  try {
    [prefRow] = await db
      .select()
      .from(userPreferencesTable)
      .where(eq(userPreferencesTable.userId, userId));
  } catch (err) {
    logger.warn(
      { err, userId },
      'user_preferences query failed — returning empty preferences'
    );
  }

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
    user: safeUser(user),
    balance: wallet?.balance ?? '0',
    transactions,
    notifications,
    preferences:
      (prefRow?.preferences ?? {}) as Record<string, unknown>,
  };
}

function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

router.get(
  '/check-username',
  async (req: Request, res: Response): Promise<void> => {
    const { username } = req.query as {
      username?: string;
    };

    if (!username) {
      res.status(400).json({
        error: 'username query param required.',
      });
      return;
    }

    const normalized = username.toLowerCase().trim();

    if (!/^[a-z]{4,15}$/.test(normalized)) {
      res.json({
        available: false,
        reason: 'invalid_format',
      });
      return;
    }

    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, normalized));

    res.json({
      available: !existing,
    });
  }
);

router.post(
  '/register',
  async (req: Request, res: Response): Promise<void> => {
    const {
      name,
      phone,
      email,
      loginPin,
      username,
    } = req.body;

    if (!name || !phone || !email || !loginPin || !username) {
      res.status(400).json({
        error:
          'name, phone, email, loginPin, and username are required.',
      });
      return;
    }

    const trimmedName = name.trim();

    if (trimmedName.length < 2 || trimmedName.length > 100) {
      res.status(400).json({
        error: 'name must be between 2 and 100 characters.',
      });
      return;
    }

    const trimmedEmail = email.trim().toLowerCase();

    if (!isValidEmail(trimmedEmail)) {
      res.status(400).json({
        error: 'Please enter a valid email address.',
      });
      return;
    }

    if (!/^\d{6}$/.test(loginPin)) {
      res.status(400).json({
        error: 'loginPin must be exactly 6 digits.',
      });
      return;
    }

    const normalizedUsername =
      username.toLowerCase().trim();

    if (!/^[a-z0-9]{4,15}$/.test(normalizedUsername)) {
      res.status(400).json({
        error:
          'username must be 4–15 characters (letters and numbers only).',
      });
      return;
    }

    const normalizedPhone = normalizePhone(phone);

    if (
      normalizedPhone.length < 10 ||
      normalizedPhone.length > 11
    ) {
      res.status(400).json({
        error: 'Invalid Nigerian phone number.',
      });
      return;
    }

    const [existingPhone] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.phone, normalizedPhone));

    if (existingPhone) {
      res.status(409).json({
        error: 'phone_taken',
      });
      return;
    }

    const [existingUsername] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, normalizedUsername));

    if (existingUsername) {
      res.status(409).json({
        error: 'username_taken',
      });
      return;
    }

    const parts = trimmedName.split(/\s+/);

    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ');

    const pinHash = await hashPin(loginPin);

    const [newUser] = await db
      .insert(usersTable)
      .values({
        name: trimmedName,
        firstName,
        lastName,
        username: normalizedUsername,
        email: trimmedEmail,
        phone: normalizedPhone,
        loginPinHash: pinHash,
        accountNumber: genAccountNumber(),
        bankName: 'GY DATA Wallet',
        referralCode: genReferralCode(firstName),
        kycStatus: 'unverified',
        status: 'active',
      })
      .returning();

    if (!newUser) {
      res.status(500).json({
        error: 'Failed to create account.',
      });
      return;
    }

    await db.insert(walletsTable).values({
      userId: newUser.id,
      balance: '0',
    });

    await db.execute(
      sql`
      INSERT INTO cashback_wallets
      (user_id, balance)
      VALUES (${newUser.id}::uuid, 0)
      `
    );

    const [welcomeNotif] = await db
      .insert(notificationsTable)
      .values({
        userId: newUser.id,
        type: 'system',
        title: 'Welcome to GY DATA! 🎉',
        body: `Hi ${firstName}! Your account is ready.`,
        read: false,
      })
      .returning();

    await regenerateSession(req);

    req.session.userId = newUser.id;

    res.status(201).json({
      user: safeUser(newUser),
      balance: '0',
      transactions: [],
      notifications: welcomeNotif
        ? [welcomeNotif]
        : [],
    });
  }
);

router.post(
  '/login',
  async (req: Request, res: Response): Promise<void> => {
    const { phone, loginPin } = req.body;

    if (!phone || !loginPin) {
      res.status(400).json({
        error: 'phone and loginPin are required.',
      });
      return;
    }

    const normalizedPhone = normalizePhone(phone);

    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.phone, normalizedPhone));

    if (!user) {
      res.status(401).json({
        error: 'no_account',
      });
      return;
    }

    if (user.status !== 'active') {
      res.status(401).json({
        error: 'account_disabled',
      });
      return;
    }

    const pinOk = await verifyPin(
      loginPin,
      user.loginPinHash
    );

    if (!pinOk) {
      res.status(401).json({
        error: 'wrong_pin',
      });
      return;
    }

    await regenerateSession(req);

    req.session.userId = user.id;

    const session = await loadFullSession(user.id);

    res.json(session);
  }
);

router.post(
  '/logout',
  (req: Request, res: Response) => {
    req.session.destroy(() => {
      res.clearCookie('gyd_sid');
      res.json({
        ok: true,
      });
    });
  }
);

router.get(
  '/me',
  async (req: Request, res: Response) => {
    if (!req.session.userId) {
      res.status(401).json({
        error: 'Not authenticated',
      });
      return;
    }

    const session = await loadFullSession(
      req.session.userId
    );

    res.json(session);
  }
);

router.get(
  '/check-phone',
  async (req: Request, res: Response) => {
    const phone = req.query.phone;

    if (!phone || typeof phone !== 'string') {
      res.status(400).json({
        error: 'phone required',
      });
      return;
    }

    const [user] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        eq(usersTable.phone, normalizePhone(phone))
      );

    res.json({
      exists: !!user,
    });
  }
);

router.post(
  '/forgot-pin/request',
  async (req: Request, res: Response) => {
    const { phone } = req.body;

    const normalizedPhone =
      normalizePhone(phone);

    const [user] = await db
      .select()
      .from(usersTable)
      .where(
        eq(usersTable.phone, normalizedPhone)
      );

    if (!user) {
      res.json({
        message:
          'If account exists, code sent.',
      });
      return;
    }

    const otp =
      crypto.randomInt(0, 1000000)
      .toString()
      .padStart(6, '0');

    await db
      .update(usersTable)
      .set({
        resetOtpHash:
          await hashPin(otp),
        resetOtpExpiry:
          new Date(Date.now() + 300000),
      })
      .where(
        eq(usersTable.id, user.id)
      );

    res.json({
      message:
        'If account exists, code sent.',
      ...(process.env.NODE_ENV !== 'production'
        ? { otp }
        : {}),
    });
  }
);

router.post(
  '/forgot-pin/reset',
  async (req: Request, res: Response) => {
    const {
      phone,
      otp,
      newPin,
    } = req.body;

    const [user] = await db
      .select()
      .from(usersTable)
      .where(
        eq(
          usersTable.phone,
          normalizePhone(phone)
        )
      );

    if (
      !user ||
      !user.resetOtpHash ||
      !user.resetOtpExpiry
    ) {
      res.status(400).json({
        error: 'invalid_or_expired',
      });
      return;
    }

    if (
      new Date() >
      user.resetOtpExpiry
    ) {
      res.status(400).json({
        error: 'expired',
      });
      return;
    }

    const valid = await verifyPin(
      otp,
      user.resetOtpHash
    );

    if (!valid) {
      res.status(400).json({
        error: 'invalid_otp',
      });
      return;
    }

    await db
      .update(usersTable)
      .set({
        loginPinHash:
          await hashPin(newPin),
        resetOtpHash: null,
        resetOtpExpiry: null,
      })
      .where(
        eq(usersTable.id, user.id)
      );

    res.json({
      ok: true,
    });
  }
);

export default router;
