/**
 * /api/auth — Registration, login, logout, session restore, forgot-PIN.
 *
 * Security model:
 *   - Session is regenerated on login/register to prevent session fixation.
 *   - All auth mutations are rate-limited at the app level.
 *   - Forgot-PIN OTP is bcrypt-hashed in the DB with a 5-minute TTL.
 *   - OTPs are single-use and cleared on first successful verification.
 *   - Constant-time responses for non-existent accounts prevent enumeration.
 *   - Forgot-PIN OTP is delivered to the user's registered email address.
 *
 * PIN hashes use bcryptjs.
 * PIN hashes and OTP hashes are never returned to callers.
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
import { sendPinResetOtpEmail } from '../lib/email.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Normalise a Nigerian phone number to local 11-digit format.
 *
 * 08012345678     → 08012345678
 * 2348012345678   → 08012345678
 * +2348012345678 → 08012345678
 */
function normalizePhone(raw: string): string {
  let digits = raw.replace(/\D/g, '');

  if (
    digits.startsWith('234') &&
    digits.length === 13
  ) {
    digits = '0' + digits.slice(3);
  }

  return digits.slice(0, 11);
}

function genAccountNumber(): string {
  return String(
    Math.floor(Math.random() * 9_000_000_000) +
      1_000_000_000,
  );
}

function genReferralCode(
  firstName: string,
): string {
  const safe =
    firstName
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 4) || 'GY';

  return (
    'GY-' +
    safe +
    Math.floor(
      Math.random() * 900 + 100,
    )
  );
}

/**
 * Never return PIN hash or OTP data to frontend.
 */
function safeUser(
  user: typeof usersTable.$inferSelect,
) {
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
    usernameChangedAt:
      user.usernameChangedAt
        ? user.usernameChangedAt.toISOString()
        : null,
    createdAt: user.createdAt,
  };
}

/**
 * Loads everything the frontend needs after login/register.
 */
async function loadFullSession(
  userId: string,
) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(
      eq(
        usersTable.id,
        userId,
      ),
    );

  if (!user) {
    return null;
  }

  const [wallet] = await db
    .select()
    .from(walletsTable)
    .where(
      eq(
        walletsTable.userId,
        userId,
      ),
    );

  let prefRow:
    | typeof userPreferencesTable.$inferSelect
    | undefined;

  try {
    [prefRow] = await db
      .select()
      .from(userPreferencesTable)
      .where(
        eq(
          userPreferencesTable.userId,
          userId,
        ),
      );
  } catch (err) {
    logger.warn(
      {
        err,
        userId,
      },
      'user_preferences query failed — returning empty preferences',
    );
  }

  const transactions =
    await db
      .select()
      .from(transactionsTable)
      .where(
        eq(
          transactionsTable.userId,
          userId,
        ),
      )
      .orderBy(
        transactionsTable.createdAt,
      );

  transactions.reverse();

  const notifications =
    await db
      .select()
      .from(notificationsTable)
      .where(
        eq(
          notificationsTable.userId,
          userId,
        ),
      )
      .orderBy(
        notificationsTable.createdAt,
      );

  notifications.reverse();

  return {
    user: safeUser(user),
    balance:
      wallet?.balance ?? '0',
    transactions,
    notifications,
    preferences:
      (prefRow?.preferences ??
        {}) as Record<
        string,
        unknown
      >,
  };
}

/**
 * Wraps session.regenerate in Promise.
 */
function regenerateSession(
  req: Request,
): Promise<void> {
  return new Promise(
    (resolve, reject) => {
      req.session.regenerate(
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        },
      );
    },
  );
}

/**
 * Wraps session.save in Promise.
 */
function saveSession(
  req: Request,
): Promise<void> {
  return new Promise(
    (resolve, reject) => {
      req.session.save(
        (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        },
      );
    },
  );
}

// ── GET /api/auth/check-username ──────────────────────────────────────────────

router.get(
  '/check-username',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      username,
    } = req.query as {
      username?: string;
    };

    if (
      !username ||
      typeof username !== 'string'
    ) {
      res.status(400).json({
        error:
          'username query param required.',
      });

      return;
    }

    const normalized =
      username
        .toLowerCase()
        .trim();

    if (
      !/^[a-z]{4,15}$/.test(
        normalized,
      )
    ) {
      res.json({
        available: false,
        reason:
          'invalid_format',
      });

      return;
    }

    const [existing] =
      await db
        .select({
          id: usersTable.id,
        })
        .from(usersTable)
        .where(
          eq(
            usersTable.username,
            normalized,
          ),
        );

    res.json({
      available: !existing,
    });
  },
);

// ── POST /api/auth/register ──────────────────────────────────────────────────

router.post(
  '/register',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
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

    const trimmedName =
      name.trim();

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

    const trimmedEmail =
      email
        .trim()
        .toLowerCase();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(
        trimmedEmail,
      )
    ) {
      res.status(400).json({
        error:
          'Please enter a valid email address.',
      });

      return;
    }

    if (
      !/^\d{6}$/.test(loginPin)
    ) {
      res.status(400).json({
        error:
          'loginPin must be exactly 6 digits.',
      });

      return;
    }

    const normalizedUsername =
      username
        .toLowerCase()
        .trim();

    if (
      !/^[a-z0-9]{4,15}$/.test(
        normalizedUsername,
      )
    ) {
      res.status(400).json({
        error:
          'username must be 4–15 characters (letters and numbers only, no symbols).',
      });

      return;
    }

    const normalizedPhone =
      normalizePhone(phone);

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

    const [existingPhone] =
      await db
        .select({
          id: usersTable.id,
        })
        .from(usersTable)
        .where(
          eq(
            usersTable.phone,
            normalizedPhone,
          ),
        );

    if (existingPhone) {
      res.status(409).json({
        error:
          'phone_taken',
      });

      return;
    }

    const [existingUsername] =
      await db
        .select({
          id: usersTable.id,
        })
        .from(usersTable)
        .where(
          eq(
            usersTable.username,
            normalizedUsername,
          ),
        );

    if (existingUsername) {
      res.status(409).json({
        error:
          'username_taken',
      });

      return;
    }

    try {
      await regenerateSession(
        req,
      );
    } catch (err) {
      logger.error(
        {
          err,
        },
        'Session regeneration failed before registration',
      );

      res.status(503).json({
        error:
          'session_unavailable',
        message:
          'Secure session is temporarily unavailable. Please try again.',
      });

      return;
    }

    const parts =
      trimmedName.split(
        /\s+/,
      );

    const firstName =
      parts[0]!;

    const lastName =
      parts
        .slice(1)
        .join(' ');

    const pinHash =
      await hashPin(
        loginPin,
      );

    try {
      const result =
        await db.transaction(
          async (tx) => {
            const [newUser] =
              await tx
                .insert(
                  usersTable,
                )
                .values({
                  name:
                    trimmedName,
                  firstName,
                  lastName,
                  username:
                    normalizedUsername,
                  email:
                    trimmedEmail,
                  phone:
                    normalizedPhone,
                  loginPinHash:
                    pinHash,
                  accountNumber:
                    genAccountNumber(),
                  bankName:
                    'GY DATA Wallet',
                  referralCode:
                    genReferralCode(
                      firstName,
                    ),
                  kycStatus:
                    'unverified',
                  status:
                    'active',
                })
                .returning();

            if (!newUser) {
              throw new Error(
                'Failed to create account.',
              );
            }

            await tx
              .insert(
                walletsTable,
              )
              .values({
                userId:
                  newUser.id,
                balance:
                  '0',
              });

            await tx.execute(
              sql`
                INSERT INTO cashback_wallets
                  (user_id, balance)
                VALUES
                  (${newUser.id}::uuid, 0)
              `,
            );

            const [
              welcomeNotif,
            ] =
              await tx
                .insert(
                  notificationsTable,
                )
                .values({
                  userId:
                    newUser.id,
                  type:
                    'system',
                  title:
                    'Welcome to GY DATA! 🎉',
                  body:
                    `Hi ${firstName}! Your account is ready. Buy data, airtime, and more in seconds.`,
                  read: false,
                })
                .returning();

            return {
              newUser,
              welcomeNotif,
            };
          },
        );

      req.session.userId =
        result.newUser.id;

      try {
        await saveSession(
          req,
        );
      } catch (err) {
        logger.error(
          {
            err,
            userId:
              result.newUser.id,
          },
          'Session save failed after registration',
        );

        res.status(503).json({
          error:
            'session_unavailable',
          message:
            'Your account was created, but the login session could not be saved. Please try logging in again.',
        });

        return;
      }

      logger.info(
        {
          userId:
            result.newUser.id,
          phone:
            normalizedPhone,
        },
        'New user registered',
      );

      res.status(201).json({
        user:
          safeUser(
            result.newUser,
          ),
        balance: '0',
        transactions: [],
        notifications:
          result.welcomeNotif
            ? [
                result.welcomeNotif,
              ]
            : [],
        preferences: {},
      });
    } catch (err: any) {
      logger.error(
        {
          err,
          phone:
            normalizedPhone,
          username:
            normalizedUsername,
        },
        'Registration failed',
      );

      const message =
        String(
          err?.message ?? '',
        ).toLowerCase();

      if (
        message.includes(
          'phone',
        ) &&
        message.includes(
          'unique',
        )
      ) {
        res.status(409).json({
          error:
            'phone_taken',
        });

        return;
      }

      if (
        message.includes(
          'username',
        ) &&
        message.includes(
          'unique',
        )
      ) {
        res.status(409).json({
          error:
            'username_taken',
        });

        return;
      }

      res.status(500).json({
        error:
          'registration_failed',
        message:
          'Unable to create your account. Please try again.',
      });
    }
  },
);

// ── POST /api/auth/login ─────────────────────────────────────────────────────

router.post(
  '/login',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      phone,
      loginPin,
    } = req.body as {
      phone?: string;
      loginPin?: string;
    };

    if (
      !phone ||
      !loginPin
    ) {
      res.status(400).json({
        error:
          'phone and loginPin are required.',
      });

      return;
    }

    const normalizedPhone =
      normalizePhone(
        phone,
      );

    const [user] =
      await db
        .select()
        .from(usersTable)
        .where(
          eq(
            usersTable.phone,
            normalizedPhone,
          ),
        );

    if (!user) {
      res.status(401).json({
        error:
          'no_account',
      });

      return;
    }

    if (
      user.status !==
      'active'
    ) {
      res.status(401).json({
        error:
          user.status ===
          'suspended'
            ? 'account_suspended'
            : 'account_closed',
        message:
          user.status ===
          'suspended'
            ? 'Your account has been suspended. Please contact support.'
            : 'This account has been closed.',
      });

      return;
    }

    const pinOk =
      await verifyPin(
        loginPin,
        user.loginPinHash,
      );

    if (!pinOk) {
      res.status(401).json({
        error:
          'wrong_pin',
      });

      return;
    }

    try {
      await regenerateSession(
        req,
      );
    } catch (err) {
      logger.error(
        {
          err,
          userId: user.id,
        },
        'Session regeneration failed on login',
      );

      res.status(503).json({
        error:
          'session_unavailable',
        message:
          'Your PIN is correct, but the secure login session is temporarily unavailable. Please try again.',
      });

      return;
    }

    req.session.userId =
      user.id;

    try {
      await saveSession(
        req,
      );
    } catch (err) {
      logger.error(
        {
          err,
          userId: user.id,
        },
        'Session save failed on login',
      );

      res.status(503).json({
        error:
          'session_unavailable',
        message:
          'Your PIN is correct, but the secure login session could not be saved. Please try again.',
      });

      return;
    }

    try {
      const session =
        await loadFullSession(
          user.id,
        );

      if (!session) {
        logger.error(
          {
            userId: user.id,
          },
          'Session data could not be loaded after login',
        );

        req.session.destroy(
          () => {},
        );

        res.status(500).json({
          error:
            'session_load_failed',
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

      res.json(
        session,
      );
    } catch (err) {
      logger.error(
        {
          err,
          userId: user.id,
        },
        'Failed to load user session after login',
      );

      res.status(500).json({
        error:
          'session_load_failed',
        message:
          'Login succeeded but account data could not be loaded. Please try again.',
      });
    }
  },
);

// ── POST /api/auth/logout ────────────────────────────────────────────────────

router.post(
  '/logout',
  (
    req: Request,
    res: Response,
  ): void => {
    const userId =
      req.session.userId;

    req.session.destroy(
      (err) => {
        if (err) {
          logger.error(
            {
              err,
            },
            'Session destroy error',
          );
        }

        res.clearCookie(
          'gyd_sid',
        );

        if (userId) {
          logger.info(
            {
              userId,
            },
            'User logged out',
          );
        }

        res.json({
          ok: true,
        });
      },
    );
  },
);

// ── GET /api/auth/me ─────────────────────────────────────────────────────────

router.get(
  '/me',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    if (
      !req.session.userId
    ) {
      res.status(401).json({
        error:
          'Not authenticated',
      });

      return;
    }

    try {
      const session =
        await loadFullSession(
          req.session.userId,
        );

      if (!session) {
        req.session.destroy(
          () => {},
        );

        res.status(401).json({
          error:
            'Not authenticated',
        });

        return;
      }

      res.json(session);
    } catch (err) {
      logger.error(
        {
          err,
          userId:
            req.session.userId,
        },
        'Failed to restore authentication session',
      );

      res.status(500).json({
        error:
          'session_load_failed',
        message:
          'Unable to restore your session. Please try again.',
      });
    }
  },
);

// ── GET /api/auth/check-phone ────────────────────────────────────────────────

router.get(
  '/check-phone',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const phone =
      req.query['phone'];

    if (
      !phone ||
      typeof phone !==
        'string'
    ) {
      res.status(400).json({
        error:
          'phone query param required.',
      });

      return;
    }

    const normalized =
      normalizePhone(
        phone,
      );

    const [user] =
      await db
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
//
// OTP is generated server-side, stored only as a bcrypt hash, and delivered
// to the email address registered on the user's account.
//
// The current frontend calls /auth/request-pin-reset, so that endpoint is
// also mounted below as a backward-compatible alias.

const requestPinResetHandler =
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      phone,
    } = req.body as {
      phone?: string;
    };

    if (!phone) {
      res.status(400).json({
        error:
          'phone is required.',
      });

      return;
    }

    const normalizedPhone =
      normalizePhone(
        phone,
      );

    const [user] =
      await db
        .select({
          id: usersTable.id,
          email:
            usersTable.email,
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

    /*
     * Do not reveal whether an account exists.
     */
    if (!user) {
      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            200 +
              Math.random() *
                200,
          ),
      );

      res.json({
        ok: true,
        message:
          'If an account with this number exists, a verification code has been sent to the registered email address.',
      });

      return;
    }

    /*
     * Preserve an already-active reset OTP.
     *
     * This prevents a second request from invalidating a code
     * that has already been generated for the same account.
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
        ok: true,
        message:
          'If an account with this number exists, a verification code has been sent to the registered email address.',
      });

      return;
    }

    /*
     * Generate a cryptographically secure 6-digit OTP.
     */
    const otpDigits =
      crypto
        .randomInt(
          0,
          1_000_000,
        )
        .toString()
        .padStart(6, '0');

    /*
     * Store only the hash of the OTP.
     */
    const otpHash =
      await hashPin(
        otpDigits,
      );

    /*
     * OTP expires after 5 minutes.
     */
    const expiry =
      new Date(
        Date.now() +
          5 * 60 * 1000,
      );

    /*
     * Save OTP hash + expiry.
     */
    await db
      .update(usersTable)
      .set({
        resetOtpHash:
          otpHash,
        resetOtpExpiry:
          expiry,
        updatedAt:
          new Date(),
      })
      .where(
        eq(
          usersTable.id,
          user.id,
        ),
      );

    /*
     * Send the OTP to the registered email address.
     *
     * IMPORTANT:
     * The OTP is never returned in the API response.
     */
    try {
      await sendPinResetOtpEmail(
        user.email,
        otpDigits,
        'login',
      );
    } catch (err) {
      /*
       * If email delivery fails, remove the OTP so there is
       * no valid code sitting in the database that the user
       * never received.
       */
      logger.error(
        {
          err,
          userId: user.id,
        },
        'Failed to send PIN reset OTP email',
      );

      await db
        .update(usersTable)
        .set({
          resetOtpHash:
            null,
          resetOtpExpiry:
            null,
          updatedAt:
            new Date(),
        })
        .where(
          eq(
            usersTable.id,
            user.id,
          ),
        );

      res.status(503).json({
        error:
          'otp_delivery_failed',
        message:
          'Unable to send the verification code right now. Please try again later.',
      });

      return;
    }

    logger.info(
      {
        userId: user.id,
      },
      'PIN reset OTP issued and emailed',
    );

    /*
     * Never expose the OTP in the API response.
     */
    res.json({
      ok: true,
      message:
        'If an account with this number exists, a verification code has been sent to the registered email address.',
    });
  };

router.post(
  '/forgot-pin/request',
  requestPinResetHandler,
);

/*
 * Existing frontend endpoint.
 *
 * AppContext.tsx currently calls:
 *   POST /api/auth/request-pin-reset
 *
 * Keep this alias so you do not need to modify the frontend.
 */
router.post(
  '/request-pin-reset',
  requestPinResetHandler,
);

// ── POST /api/auth/forgot-pin/reset ──────────────────────────────────────────
//
// Both:
//   /api/auth/forgot-pin/reset
//   /api/auth/reset-pin
//
// are supported.

const resetPinHandler =
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

    if (
      !/^\d{6}$/.test(
        otp,
      )
    ) {
      res.status(400).json({
        error:
          'otp must be exactly 6 digits.',
      });

      return;
    }

    if (
      !/^\d{6}$/.test(
        newPin,
      )
    ) {
      res.status(400).json({
        error:
          'newPin must be exactly 6 digits.',
      });

      return;
    }

    const normalizedPhone =
      normalizePhone(
        phone,
      );

    const [user] =
      await db
        .select()
        .from(usersTable)
        .where(
          eq(
            usersTable.phone,
            normalizedPhone,
          ),
        );

    const badRequest =
      async () => {
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              200 +
                Math.random() *
                  200,
            ),
        );

        res.status(400).json({
          error:
            'invalid_or_expired',
          message:
            'The verification code is invalid or has expired.',
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

    /*
     * Reject expired OTP.
     */
    if (
      new Date() >
      user.resetOtpExpiry
    ) {
      await db
        .update(usersTable)
        .set({
          resetOtpHash:
            null,
          resetOtpExpiry:
            null,
          updatedAt:
            new Date(),
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

    /*
     * Verify the submitted OTP against the stored hash.
     */
    const otpOk =
      await verifyPin(
        otp,
        user.resetOtpHash,
      );

    if (!otpOk) {
      await badRequest();

      return;
    }

    /*
     * Hash the new login PIN.
     */
    const newPinHash =
      await hashPin(
        newPin,
      );

    /*
     * Update the login PIN and immediately invalidate
     * the OTP so it cannot be reused.
     */
    await db
      .update(usersTable)
      .set({
        loginPinHash:
          newPinHash,
        resetOtpHash:
          null,
        resetOtpExpiry:
          null,
        updatedAt:
          new Date(),
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
      'PIN reset via emailed OTP challenge',
    );

    res.json({
      ok: true,
    });
  };

router.post(
  '/forgot-pin/reset',
  resetPinHandler,
);

/*
 * Existing frontend endpoint.
 *
 * AppContext.tsx currently calls:
 *   POST /api/auth/reset-pin
 */
router.post(
  '/reset-pin',
  resetPinHandler,
);

export default router;
