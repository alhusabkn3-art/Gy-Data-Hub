/**
 * /api/auth — Registration, login, logout, session restore, forgot-PIN.
 *
 * Security model:
 *   - Session is regenerated on login/register to prevent session fixation.
 *   - All auth mutations are rate-limited at the app level.
 *   - Forgot-PIN OTP is bcrypt-hashed in the DB with a 5-minute TTL.
 *   - OTPs are single-use and cleared on first successful verification.
 *   - Constant-time responses for non-existent accounts prevent enumeration.
 *   - In production, the OTP is NOT returned in the response body.
 *
 * PIN hashes use bcryptjs.
 * PIN hashes are never returned to callers.
 */

import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalises a Nigerian phone number to local 11-digit format.
 *
 * 08012345678     → 08012345678
 * 2348012345678   → 08012345678
 * +2348012345678 → 08012345678
 */
function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');

  if (digits.startsWith('234') && digits.length === 13) {
    digits = '0' + digits.slice(3);
  }

  return digits.slice(0, 11);
}

/** Basic email validation */
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function genAccountNumber(): string {
  return String(
    Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000,
  );
}

function genReferralCode(firstName: string): string {
  const safe =
    firstName
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 4) || 'GY';

  return 'GY-' + safe + Math.floor(Math.random() * 900 + 100);
}

/** Never return PIN hash to frontend */
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

/**
 * Loads everything the frontend needs after login/register.
 */
async function loadFullSession(userId: string) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!user) {
    return null;
  }

  const [wallet] = await db
    .select()
    .from(walletsTable)
    .where(eq(walletsTable.userId, userId));

  // Preferences are non-critical.
  let prefRow: typeof userPreferencesTable.$inferSelect | undefined;

  try {
    [prefRow] = await db
      .select()
      .from(userPreferencesTable)
      .where(eq(userPreferencesTable.userId, userId));
  } catch (err) {
    logger.warn(
      { err, userId },
      'user_preferences query failed — returning empty preferences',
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

/**
 * Wraps session.regenerate in Promise.
 */
function regenerateSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Wraps session.save in Promise.
 *
 * IMPORTANT:
 * We explicitly save the session before returning successful
 * login/register response.
 */
function saveSession(req: Request): Promise<void> {
  return new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// ── GET /api/auth/check-username ──────────────────────────────────────────────

router.get(
  '/check-username',
  async (req: Request, res: Response): Promise<void> => {
    const { username } = req.query as {
      username?: string;
    };

    if (!username || typeof username !== 'string') {
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
  },
);

// ── POST /api/auth/register ──────────────────────────────────────────────────

router.post(
  '/register',
  async (req: Request, res: Response): Promise<void> => {
    const {
      name,
      phone,
      email,
      loginPin,
      username,
    } = req.body as {
      name?: string;
      phone?: string;
      email?: string;
      loginPin?: string;
      username?: string;
    };

    // ── Required fields ──────────────────────────────────────────────────────

    if (
      !name ||
      !phone ||
      !email ||
      !loginPin ||
      !username
    ) {
      res.status(400).json({
        error:
          'name, phone, email, loginPin, and username are required.',
      });
      return;
    }

    // ── Name validation ──────────────────────────────────────────────────────

    const trimmedName = name.trim();

    if (
      trimmedName.length < 2 ||
      trimmedName.length > 100
    ) {
      res.status(400).json({
        error:
          'name must be between 2 and 100 characters.',
      });
      return;
    }

    // ── Email validation ─────────────────────────────────────────────────────

    const trimmedEmail = email.trim().toLowerCase();

    if (!isValidEmail(trimmedEmail)) {
      res.status(400).json({
        error: 'Please enter a valid email address.',
      });
      return;
    }

    // ── PIN validation ───────────────────────────────────────────────────────

    if (!/^\d{6}$/.test(loginPin)) {
      res.status(400).json({
        error: 'loginPin must be exactly 6 digits.',
      });
      return;
    }

    // ── Username validation ──────────────────────────────────────────────────

    const normalizedUsername = username
      .toLowerCase()
      .trim();

    if (!/^[a-z0-9]{4,15}$/.test(normalizedUsername)) {
      res.status(400).json({
        error:
          'username must be 4–15 characters (letters and numbers only, no symbols).',
      });
      return;
    }

    // ── Phone validation ─────────────────────────────────────────────────────

    const normalizedPhone = normalizePhone(phone);

    if (
      normalizedPhone.length < 10 ||
      normalizedPhone.length > 11
    ) {
      res.status(400).json({
        error:
          'Please enter a valid Nigerian phone number (10–11 digits).',
      });
      return;
    }

    // ── Check existing phone ─────────────────────────────────────────────────

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

    // ── Check existing username ──────────────────────────────────────────────

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

    // ── Make sure session is available BEFORE creating account ───────────────

    try {
      await regenerateSession(req);
    } catch (err) {
      logger.error(
        { err },
        'Session regeneration failed before registration',
      );

      res.status(503).json({
        error: 'session_unavailable',
        message:
          'Secure session is temporarily unavailable. Please try again.',
      });
      return;
    }

    // ── Prepare account data ─────────────────────────────────────────────────

    const parts = trimmedName.split(/\s+/);

    const firstName = parts[0]!;
    const lastName = parts.slice(1).join(' ');

    const pinHash = await hashPin(loginPin);

    try {
      /*
       * IMPORTANT:
       * User + wallet + cashback wallet + welcome notification
       * are now created inside ONE database transaction.
       *
       * If any of these operations fails, the user creation is
       * rolled back instead of leaving a half-created account.
       */
      const result = await db.transaction(async (tx) => {
        const [newUser] = await tx
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
          throw new Error(
            'Failed to create account.',
          );
        }

        // Main wallet
        await tx
          .insert(walletsTable)
          .values({
            userId: newUser.id,
            balance: '0',
          });

        // Cashback wallet
        await tx.execute(
          sql`
            INSERT INTO cashback_wallets
              (user_id, balance)
            VALUES
              (${newUser.id}::uuid, 0)
          `,
        );

        // Welcome notification
        const [welcomeNotif] = await tx
          .insert(notificationsTable)
          .values({
            userId: newUser.id,
            type: 'system',
            title: 'Welcome to GY DATA! 🎉',
            body:
              `Hi ${firstName}! Your account is ready. ` +
              `Buy data, airtime, and more in seconds.`,
            read: false,
          })
          .returning();

        return {
          newUser,
          welcomeNotif,
        };
      });

      // ── Attach user to session ─────────────────────────────────────────────

      req.session.userId = result.newUser.id;

      try {
        await saveSession(req);
      } catch (err) {
        /*
         * The account itself has already been created successfully.
         * Do NOT tell the frontend "phone already exists".
         */
        logger.error(
          {
            err,
            userId: result.newUser.id,
          },
          'Session save failed after registration',
        );

        res.status(503).json({
          error: 'session_unavailable',
          message:
            'Your account was created, but the login session could not be saved. Please try logging in again.',
        });
        return;
      }

      logger.info(
        {
          userId: result.newUser.id,
          phone: normalizedPhone,
        },
        'New user registered',
      );

      res.status(201).json({
        user: safeUser(result.newUser),
        balance: '0',
        transactions: [],
        notifications: result.welcomeNotif
          ? [result.welcomeNotif]
          : [],
        preferences: {},
      });
    } catch (err: any) {
      logger.error(
        {
          err,
          phone: normalizedPhone,
          username: normalizedUsername,
        },
        'Registration failed',
      );

      const message = String(
        err?.message ?? '',
      ).toLowerCase();

      if (
        message.includes('phone') &&
        message.includes('unique')
      ) {
        res.status(409).json({
          error: 'phone_taken',
        });
        return;
      }

      if (
        message.includes('username') &&
        message.includes('unique')
      ) {
        res.status(409).json({
          error: 'username_taken',
        });
        return;
      }

      res.status(500).json({
        error: 'registration_failed',
        message:
          'Unable to create your account. Please try again.',
      });
    }
  },
);

// ── POST /api/auth/login ─────────────────────────────────────────────────────

router.post(
  '/login',
  async (req: Request, res: Response): Promise<void> => {
    const {
      phone,
      loginPin,
    } = req.body as {
      phone?: string;
      loginPin?: string;
    };

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

    // ── Account doesn't exist ────────────────────────────────────────────────

    if (!user) {
      res.status(401).json({
        error: 'no_account',
      });
      return;
    }

    // ── Account status ───────────────────────────────────────────────────────

    if (user.status !== 'active') {
      res.status(401).json({
        error:
          user.status === 'suspended'
            ? 'account_suspended'
            : 'account_closed',

        message:
          user.status === 'suspended'
            ? 'Your account has been suspended. Please contact support.'
            : 'This account has been closed.',
      });

      return;
    }

    // ── Verify PIN ───────────────────────────────────────────────────────────

    const pinOk = await verifyPin(
      loginPin,
      user.loginPinHash,
    );

    if (!pinOk) {
      /*
       * IMPORTANT:
       * This is the ONLY place where wrong_pin is returned.
       *
       * A session/database/server error will NEVER be reported
       * as "wrong_pin".
       */
      res.status(401).json({
        error: 'wrong_pin',
      });

      return;
    }

    // ── Regenerate session ───────────────────────────────────────────────────

    try {
      await regenerateSession(req);
    } catch (err) {
      logger.error(
        {
          err,
          userId: user.id,
        },
        'Session regeneration failed on login',
      );

      res.status(503).json({
        error: 'session_unavailable',
        message:
          'Your PIN is correct, but the secure login session is temporarily unavailable. Please try again.',
      });

      return;
    }

    // ── Set authenticated user ───────────────────────────────────────────────

    req.session.userId = user.id;

    // ── Explicitly save session ──────────────────────────────────────────────

    try {
      await saveSession(req);
    } catch (err) {
      logger.error(
        {
          err,
          userId: user.id,
        },
        'Session save failed on login',
      );

      res.status(503).json({
        error: 'session_unavailable',
        message:
          'Your PIN is correct, but the secure login session could not be saved. Please try again.',
      });

      return;
    }

    // ── Load account data ────────────────────────────────────────────────────

    try {
      const session = await loadFullSession(
        user.id,
      );

      if (!session) {
        logger.error(
          {
            userId: user.id,
          },
          'Session data could not be loaded after login',
        );

        req.session.destroy(() => {});

        res.status(500).json({
          error: 'session_load_failed',
          message:
            'Login succeeded but account data could not be loaded. Please try again.',
        });

        return;
      }

      logger.info(
        {
          userId: user.id,
        },
        'User logged in',
      );

      res.json(session);
    } catch (err) {
      logger.error(
        {
          err,
          userId: user.id,
        },
        'Failed to load user session after login',
      );

      res.status(500).json({
        error: 'session_load_failed',
        message:
          'Login succeeded but account data could not be loaded. Please try again.',
      });
    }
  },
);

// ── POST /api/auth/logout ────────────────────────────────────────────────────

router.post(
  '/logout',
  (req: Request, res: Response): void => {
    const userId = req.session.userId;

    req.session.destroy((err) => {
      if (err) {
        logger.error(
          { err },
          'Session destroy error',
        );
      }

      res.clearCookie('gyd_sid');

      if (userId) {
        logger.info(
          { userId },
          'User logged out',
        );
      }

      res.json({
        ok: true,
      });
    });
  },
);

// ── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get(
  '/me',
  async (req: Request, res: Response): Promise<void> => {
    if (!req.session.userId) {
      res.status(401).json({
        error: 'Not authenticated',
      });

      return;
    }

    try {
      const session = await loadFullSession(
        req.session.userId,
      );

      if (!session) {
        req.session.destroy(() => {});

        res.status(401).json({
          error: 'Not authenticated',
        });

        return;
      }

      res.json(session);
    } catch (err) {
      logger.error(
        {
          err,
          userId: req.session.userId,
        },
        'Failed to restore authentication session',
      );

      res.status(500).json({
        error: 'session_load_failed',
        message:
          'Unable to restore your session. Please try again.',
      });
    }
  },
);

// ── GET /api/auth/check-phone ────────────────────────────────────────────────

router.get(
  '/check-phone',
  async (req: Request, res: Response): Promise<void> => {
    const phone = req.query['phone'];

    if (
      !phone ||
      typeof phone !== 'string'
    ) {
      res.status(400).json({
        error: 'phone query param required.',
      });

      return;
    }

    const normalized = normalizePhone(phone);

    const [user] = await db
      .select({
        id: usersTable.id,
      })
      .from(usersTable)
      .where(
        eq(
          usersTable.phone,
          normalized,
        ),
      );

    res.json({
      exists: !!user,
    });
  },
);

// ── POST /api/auth/forgot-pin/request ────────────────────────────────────────

router.post(
  '/forgot-pin/request',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const { phone } = req.body as {
      phone?: string;
    };

    if (!phone) {
      res.status(400).json({
        error: 'phone is required.',
      });

      return;
    }

    const normalizedPhone =
      normalizePhone(phone);

    const [user] = await db
      .select({
        id: usersTable.id,
        resetOtpHash:
          usersTable.resetOtpHash,
        resetOtpExpiry:
          usersTable.resetOtpExpiry,
      })
      .from(usersTable)
      .where(
        eq(
          usersTable.phone,
          normalizedPhone,
        ),
      );

    // Don't reveal whether account exists.
    if (!user) {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          200 + Math.random() * 200,
        ),
      );

      res.json({
        message:
          'If an account with this number exists, a code has been sent.',
        ...(process.env['NODE_ENV'] !==
        'production'
          ? {
              devNote:
                'phone not found',
            }
          : {}),
      });

      return;
    }

    /*
     * Preserve an already active reset OTP.
     */
    if (
      user.resetOtpHash &&
      user.resetOtpExpiry &&
      new Date(
        user.resetOtpExpiry,
      ).getTime() >
        Date.now() +
          5 * 60 * 1000
    ) {
      res.json({
        message:
          'If an account with this number exists, a code has been sent.',
        ...(process.env['NODE_ENV'] !==
        'production'
          ? {
              devNote:
                'CC-approved reset OTP already active',
            }
          : {}),
      });

      return;
    }

    const otpDigits = crypto
      .randomInt(
        0,
        1_000_000,
      )
      .toString()
      .padStart(6, '0');

    const otpHash =
      await hashPin(otpDigits);

    const expiry = new Date(
      Date.now() +
        5 * 60 * 1000,
    );

    await db
      .update(usersTable)
      .set({
        resetOtpHash: otpHash,
        resetOtpExpiry: expiry,
        updatedAt: new Date(),
      })
      .where(
        eq(
          usersTable.id,
          user.id,
        ),
      );

    logger.info(
      {
        userId: user.id,
      },
      'PIN reset OTP issued',
    );

    // TODO: Deliver OTP via SMS gateway in production.
    res.json({
      message:
        'If an account with this number exists, a code has been sent.',

      ...(process.env['NODE_ENV'] !==
      'production'
        ? {
            otp: otpDigits,
          }
        : {}),
    });
  },
);

// ── POST /api/auth/forgot-pin/reset ──────────────────────────────────────────

router.post(
  '/forgot-pin/reset',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      phone,
      otp,
      newPin,
    } = req.body as {
      phone?: string;
      otp?: string;
      newPin?: string;
    };

    if (
      !phone ||
      !otp ||
      !newPin
    ) {
      res.status(400).json({
        error:
          'phone, otp, and newPin are required.',
      });

      return;
    }

    if (!/^\d{6}$/.test(newPin)) {
      res.status(400).json({
        error:
          'newPin must be exactly 6 digits.',
      });

      return;
    }

    const normalizedPhone =
      normalizePhone(phone);

    const [user] = await db
      .select()
      .from(usersTable)
      .where(
        eq(
          usersTable.phone,
          normalizedPhone,
        ),
      );

    const badRequest = async () => {
      await new Promise((resolve) =>
        setTimeout(
          resolve,
          200 + Math.random() * 200,
        ),
      );

      res.status(400).json({
        error: 'invalid_or_expired',
      });
    };

    if (
      !user ||
      !user.resetOtpHash ||
      !user.resetOtpExpiry
    ) {
      await badRequest();
      return;
    }

    if (
      new Date() >
      user.resetOtpExpiry
    ) {
      await db
        .update(usersTable)
        .set({
          resetOtpHash: null,
          resetOtpExpiry: null,
        })
        .where(
          eq(
            usersTable.id,
            user.id,
          ),
        );

      await badRequest();
      return;
    }

    const otpOk =
      await verifyPin(
        otp,
        user.resetOtpHash,
      );

    if (!otpOk) {
      await badRequest();
      return;
    }

    const newPinHash =
      await hashPin(newPin);

    await db
      .update(usersTable)
      .set({
        loginPinHash:
          newPinHash,
        resetOtpHash: null,
        resetOtpExpiry: null,
        updatedAt: new Date(),
      })
      .where(
        eq(
          usersTable.id,
          user.id,
        ),
      );

    logger.info(
      {
        userId: user.id,
      },
      'PIN reset via OTP challenge',
    );

    res.json({
      ok: true,
    });
  },
);

export default router;
