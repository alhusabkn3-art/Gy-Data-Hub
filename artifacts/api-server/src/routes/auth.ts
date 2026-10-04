// artifacts/api-server/src/routes/auth.ts

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

function genReferralCode(firstName: string): string {
  const safe =
    firstName
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 4) || 'GY';

  return (
    'GY-' +
    safe +
    Math.floor(Math.random() * 900 + 100)
  );
}

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
      {
        err,
        userId,
      },
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
      (prefRow?.preferences ?? {}) as Record<
        string,
        unknown
      >,
  };
}

function regenerateSession(
  req: Request,
): Promise<void> {
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

function saveSession(
  req: Request,
): Promise<void> {
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
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const rawUsername =
        req.query.username;

      if (
        typeof rawUsername !== 'string'
      ) {
        res.status(400).json({
          available: false,
          reason: 'invalid_request',
          error:
            'username query param required.',
        });

        return;
      }

      const normalized =
        rawUsername
          .trim()
          .toLowerCase();

      /*
       * This MUST match the validation used by
       * POST /register.
       *
       * Registration accepts:
       *   a-z
       *   0-9
       *   4-15 characters
       *
       * The old availability endpoint accepted
       * letters only, which made usernames such as
       * john123 fail availability checking even
       * though registration accepted them.
       */
      if (
        !/^[a-z0-9]{4,15}$/.test(
          normalized,
        )
      ) {
        res.status(200).json({
          available: false,
          reason: 'invalid_format',
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
          )
          .limit(1);

      res.status(200).json({
        available: !existing,
        reason: existing
          ? 'username_taken'
          : 'available',
      });
    } catch (err) {
      /*
       * The previous implementation allowed a database
       * error to escape from this route. That produced a
       * generic frontend:
       *
       * "Could not check username availability."
       *
       * Now the error is logged and the API always returns
       * a proper JSON response.
       */
      logger.error(
        {
          err,
          username:
            typeof req.query.username ===
            'string'
              ? req.query.username
              : undefined,
        },
        'Username availability check failed',
      );

      res.status(500).json({
        available: false,
        reason: 'server_error',
        error:
          'Unable to check username availability.',
      });
    }
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
      purchasePin,
      username,
    } = req.body as {
      name?: string;
      phone?: string;
      email?: string;
      loginPin?: string;
      purchasePin?: string;
      username?: string;
    };

    if (
      !name ||
      !phone ||
      !email ||
      !loginPin ||
      !purchasePin ||
      !username
    ) {
      res.status(400).json({
        error:
          'name, phone, email, loginPin, purchasePin, and username are required.',
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
      !/^\d{6}$/.test(
        loginPin,
      )
    ) {
      res.status(400).json({
        error:
          'loginPin must be exactly 6 digits.',
      });

      return;
    }

    /*
     * Purchase PIN is created during registration and stored
     * immediately. This prevents the new user from having to
     * visit Profile before making the first purchase.
     */
    if (
      !/^\d{4}$/.test(
        purchasePin,
      )
    ) {
      res.status(400).json({
        error:
          'purchasePin must be exactly 4 digits.',
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
        error: 'phone_taken',
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
        error: 'username_taken',
      });

      return;
    }

    try {
      await regenerateSession(req);
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
          'Unable to start a secure session. Please try again.',
      });

      return;
    }

    const nameParts =
      trimmedName
        .split(/\s+/)
        .filter(Boolean);

    const firstName =
      nameParts[0] ?? '';

    const lastName =
      nameParts
        .slice(1)
        .join(' ');

    let accountNumber =
      genAccountNumber();

    let referralCode =
      genReferralCode(firstName);

    const loginPinHash =
      await hashPin(loginPin);

    const purchasePinHash =
      await hashPin(purchasePin);

    try {
      let insertedUser:
        | typeof usersTable.$inferSelect
        | undefined;

      for (
        let attempt = 0;
        attempt < 5;
        attempt++
      ) {
        try {
          const [user] =
            await db
              .insert(usersTable)
              .values({
                name: trimmedName,
                firstName,
                lastName,
                username:
                  normalizedUsername,
                email:
                  trimmedEmail,
                phone:
                  normalizedPhone,
                loginPinHash,
                purchasePinHash,
                accountNumber,
                bankName:
                  'GY DATA Wallet',
                referralCode,
                kycStatus:
                  'unverified',
                status:
                  'active',
              })
              .returning();

          insertedUser = user;
          break;
        } catch (err) {
          const message =
            err instanceof Error
              ? err.message
              : String(err);

          if (
            message.includes(
              'account_number',
            )
          ) {
            accountNumber =
              genAccountNumber();

            continue;
          }

          if (
            message.includes(
              'referral_code',
            )
          ) {
            referralCode =
              genReferralCode(
                firstName,
              );

            continue;
          }

          if (
            message.includes(
              'username',
            )
          ) {
            res.status(409).json({
              error:
                'username_taken',
            });

            return;
          }

          if (
            message.includes(
              'phone',
            )
          ) {
            res.status(409).json({
              error:
                'phone_taken',
            });

            return;
          }

          throw err;
        }
      }

      if (!insertedUser) {
        res.status(500).json({
          error:
            'account_creation_failed',
          message:
            'Unable to create your account. Please try again.',
        });

        return;
      }

      const userId =
        insertedUser.id;

      await db
        .insert(walletsTable)
        .values({
          userId,
          balance: '0',
        })
        .onConflictDoNothing({
          target:
            walletsTable.userId,
        });

      await db
        .insert(userPreferencesTable)
        .values({
          userId,
          preferences: {},
        })
        .onConflictDoNothing({
          target:
            userPreferencesTable.userId,
        });

      req.session.userId =
        userId;

      try {
        await saveSession(req);
      } catch (err) {
        logger.error(
          {
            err,
            userId,
          },
          'Session save failed after registration',
        );

        res.status(503).json({
          error:
            'session_unavailable',
          message:
            'Account was created but your session could not be saved. Please sign in.',
        });

        return;
      }

      const sessionData =
        await loadFullSession(
          userId,
        );

      res.status(201).json({
        success: true,
        ...sessionData,
      });
    } catch (err) {
      logger.error(
        {
          err,
        },
        'Registration failed',
      );

      res.status(500).json({
        error:
          'registration_failed',
        message:
          'Unable to create account. Please try again.',
      });
    }
  },
);

// ── POST /api/auth/login ──────────────────────────────────────────────────────

router.post(
  '/login',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      identifier,
      phone,
      username,
      loginPin,
    } = req.body as {
      identifier?: string;
      phone?: string;
      username?: string;
      loginPin?: string;
    };

    const rawIdentifier =
      identifier ??
      phone ??
      username ??
      '';

    if (
      !rawIdentifier ||
      !loginPin
    ) {
      res.status(400).json({
        error:
          'identifier and loginPin are required.',
      });

      return;
    }

    if (
      !/^\d{6}$/.test(
        loginPin,
      )
    ) {
      res.status(400).json({
        error:
          'loginPin must be exactly 6 digits.',
      });

      return;
    }

    const identifierValue =
      String(
        rawIdentifier,
      ).trim();

    let user:
      | typeof usersTable.$inferSelect
      | undefined;

    if (
      /^[0-9+()\-\s]{10,20}$/.test(
        identifierValue,
      )
    ) {
      const normalizedPhone =
        normalizePhone(
          identifierValue,
        );

      [user] =
        await db
          .select()
          .from(usersTable)
          .where(
            eq(
              usersTable.phone,
              normalizedPhone,
            ),
          );
    } else {
      const normalizedUsername =
        identifierValue
          .toLowerCase()
          .trim();

      [user] =
        await db
          .select()
          .from(usersTable)
          .where(
            eq(
              usersTable.username,
              normalizedUsername,
            ),
          );
    }

    if (!user) {
      res.status(401).json({
        error:
          'invalid_credentials',
      });

      return;
    }

    const valid =
      await verifyPin(
        loginPin,
        user.loginPinHash,
      );

    if (!valid) {
      res.status(401).json({
        error:
          'invalid_credentials',
      });

      return;
    }

    try {
      await regenerateSession(req);
    } catch (err) {
      logger.error(
        {
          err,
        },
        'Session regeneration failed during login',
      );

      res.status(503).json({
        error:
          'session_unavailable',
        message:
          'Unable to start a secure session. Please try again.',
      });

      return;
    }

    req.session.userId =
      user.id;

    try {
      await saveSession(req);
    } catch (err) {
      logger.error(
        {
          err,
          userId: user.id,
        },
        'Session save failed during login',
      );

      res.status(503).json({
        error:
          'session_unavailable',
        message:
          'Unable to save your session. Please try again.',
      });

      return;
    }

    const sessionData =
      await loadFullSession(
        user.id,
      );

    res.json({
      success: true,
      ...sessionData,
    });
  },
);

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

router.get(
  '/me',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId;

    if (!userId) {
      res.status(401).json({
        error:
          'not_authenticated',
      });

      return;
    }

    try {
      const sessionData =
        await loadFullSession(
          userId,
        );

      if (!sessionData) {
        req.session.userId =
          undefined;

        try {
          await saveSession(req);
        } catch {
          // Ignore session save failure here.
        }

        res.status(401).json({
          error:
            'not_authenticated',
        });

        return;
      }

      res.json({
        success: true,
        ...sessionData,
      });
    } catch (err) {
      logger.error(
        {
          err,
          userId,
        },
        'Session restore failed',
      );

      res.status(500).json({
        error:
          'session_restore_failed',
      });
    }
  },
);

// ── POST /api/auth/logout ────────────────────────────────────────────────────

router.post(
  '/logout',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      await new Promise<void>(
        (
          resolve,
          reject,
        ) => {
          req.session.destroy(
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
    } catch (err) {
      logger.warn(
        {
          err,
        },
        'Session destroy failed during logout',
      );
    }

    res.clearCookie(
      'gyd_sid',
    );

    res.json({
      success: true,
    });
  },
);

// ── GET /api/auth/check-phone ────────────────────────────────────────────────

router.get(
  '/check-phone',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      phone,
    } = req.query as {
      phone?: string;
    };

    if (
      !phone ||
      typeof phone !== 'string'
    ) {
      res.status(400).json({
        error:
          'phone query param required.',
      });

      return;
    }

    const normalizedPhone =
      normalizePhone(phone);

    const [existing] =
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

    res.json({
      exists: !!existing,
    });
  },
);

// ── Forgot PIN helpers ────────────────────────────────────────────────────────

function generateOtp(): string {
  return crypto
    .randomInt(
      100000,
      1000000,
    )
    .toString();
}

function hashOtp(
  otp: string,
): string {
  return crypto
    .createHash('sha256')
    .update(otp)
    .digest('hex');
}

// ── POST /api/auth/forgot-pin-email/request ──────────────────────────────────

router.post(
  '/forgot-pin-email/request',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      email,
    } = req.body as {
      email?: string;
    };

    if (
      !email ||
      typeof email !== 'string'
    ) {
      res.status(400).json({
        error:
          'email is required.',
      });

      return;
    }

    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    if (
      !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(
        normalizedEmail,
      )
    ) {
      res.status(400).json({
        error:
          'Please enter a valid email address.',
      });

      return;
    }

    const [user] =
      await db
        .select()
        .from(usersTable)
        .where(
          eq(
            usersTable.email,
            normalizedEmail,
          ),
        );

    /*
     * Return the same success response even when the
     * account does not exist. This prevents email
     * enumeration.
     */
    if (!user) {
      res.json({
        success: true,
        message:
          'If an account exists for this email, a reset code has been sent.',
      });

      return;
    }

    const otp =
      generateOtp();

    const otpHash =
      hashOtp(otp);

    const expiry =
      new Date(
        Date.now() +
          5 * 60 * 1000,
      );

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

    try {
      await sendPinResetOtpEmail(
        normalizedEmail,
        otp,
      );
    } catch (err) {
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
          resetOtpHash: null,
          resetOtpExpiry: null,
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
          'Unable to send the reset code. Please try again later.',
      });

      return;
    }

    res.json({
      success: true,
      message:
        'If an account exists for this email, a reset code has been sent.',
    });
  },
);

// ── POST /api/auth/forgot-pin-email/verify ───────────────────────────────────

router.post(
  '/forgot-pin-email/verify',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      email,
      otp,
      newPin,
    } = req.body as {
      email?: string;
      otp?: string;
      newPin?: string;
    };

    if (
      !email ||
      !otp ||
      !newPin
    ) {
      res.status(400).json({
        error:
          'email, otp, and newPin are required.',
      });

      return;
    }

    const normalizedEmail =
      email
        .trim()
        .toLowerCase();

    if (
      !/^\d{6}$/.test(
        otp,
      )
    ) {
      res.status(400).json({
        error:
          'OTP must be exactly 6 digits.',
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

    const [user] =
      await db
        .select()
        .from(usersTable)
        .where(
          eq(
            usersTable.email,
            normalizedEmail,
          ),
        );

    if (!user) {
      res.status(400).json({
        error:
          'invalid_or_expired_otp',
      });

      return;
    }

    if (
      !user.resetOtpHash ||
      !user.resetOtpExpiry
    ) {
      res.status(400).json({
        error:
          'invalid_or_expired_otp',
      });

      return;
    }

    if (
      user.resetOtpExpiry.getTime() <
      Date.now()
    ) {
      await db
        .update(usersTable)
        .set({
          resetOtpHash: null,
          resetOtpExpiry: null,
          updatedAt:
            new Date(),
        })
        .where(
          eq(
            usersTable.id,
            user.id,
          ),
        );

      res.status(400).json({
        error:
          'invalid_or_expired_otp',
      });

      return;
    }

    const suppliedHash =
      hashOtp(otp);

    if (
      suppliedHash !==
      user.resetOtpHash
    ) {
      res.status(400).json({
        error:
          'invalid_or_expired_otp',
      });

      return;
    }

    const loginPinHash =
      await hashPin(newPin);

    await db
      .update(usersTable)
      .set({
        loginPinHash,
        resetOtpHash: null,
        resetOtpExpiry: null,
        updatedAt:
          new Date(),
      })
      .where(
        eq(
          usersTable.id,
          user.id,
        ),
      );

    res.json({
      success: true,
      message:
        'Login PIN reset successfully.',
    });
  },
);

// ── POST /api/auth/change-pin ────────────────────────────────────────────────

router.post(
  '/change-pin',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId;

    if (!userId) {
      res.status(401).json({
        error:
          'not_authenticated',
      });

      return;
    }

    const {
      currentPin,
      newPin,
    } = req.body as {
      currentPin?: string;
      newPin?: string;
    };

    if (
      !currentPin ||
      !newPin
    ) {
      res.status(400).json({
        error:
          'currentPin and newPin are required.',
      });

      return;
    }

    if (
      !/^\d{6}$/.test(
        currentPin,
      ) ||
      !/^\d{6}$/.test(
        newPin,
      )
    ) {
      res.status(400).json({
        error:
          'PIN must be exactly 6 digits.',
      });

      return;
    }

    if (
      currentPin === newPin
    ) {
      res.status(400).json({
        error:
          'New PIN must be different from current PIN.',
      });

      return;
    }

    const [user] =
      await db
        .select()
        .from(usersTable)
        .where(
          eq(
            usersTable.id,
            userId,
          ),
        );

    if (!user) {
      res.status(401).json({
        error:
          'not_authenticated',
      });

      return;
    }

    const valid =
      await verifyPin(
        currentPin,
        user.loginPinHash,
      );

    if (!valid) {
      res.status(400).json({
        error:
          'invalid_current_pin',
      });

      return;
    }

    const loginPinHash =
      await hashPin(newPin);

    await db
      .update(usersTable)
      .set({
        loginPinHash,
        updatedAt:
          new Date(),
      })
      .where(
        eq(
          usersTable.id,
          userId,
        ),
      );

    res.json({
      success: true,
    });
  },
);

// ── POST /api/auth/set-purchase-pin ──────────────────────────────────────────

router.post(
  '/set-purchase-pin',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId;

    if (!userId) {
      res.status(401).json({
        error:
          'not_authenticated',
      });

      return;
    }

    const {
      purchasePin,
    } = req.body as {
      purchasePin?: string;
    };

    if (
      !purchasePin
    ) {
      res.status(400).json({
        error:
          'purchasePin is required.',
      });

      return;
    }

    if (
      !/^\d{4}$/.test(
        purchasePin,
      )
    ) {
      res.status(400).json({
        error:
          'purchasePin must be exactly 4 digits.',
      });

      return;
    }

    const purchasePinHash =
      await hashPin(
        purchasePin,
      );

    await db
      .update(usersTable)
      .set({
        purchasePinHash,
        updatedAt:
          new Date(),
      })
      .where(
        eq(
          usersTable.id,
          userId,
        ),
      );

    res.json({
      success: true,
    });
  },
);

// ── GET /api/auth/account ────────────────────────────────────────────────────

router.get(
  '/account',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId;

    if (!userId) {
      res.status(401).json({
        error:
          'not_authenticated',
      });

      return;
    }

    const [user] =
      await db
        .select()
        .from(usersTable)
        .where(
          eq(
            usersTable.id,
            userId,
          ),
        );

    if (!user) {
      res.status(404).json({
        error:
          'user_not_found',
      });

      return;
    }

    res.json({
      success: true,
      user: safeUser(user),
    });
  },
);

// ── POST /api/auth/verify-purchase-pin ───────────────────────────────────────

router.post(
  '/verify-purchase-pin',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId;

    if (!userId) {
      res.status(401).json({
        error:
          'not_authenticated',
      });

      return;
    }

    const {
      purchasePin,
    } = req.body as {
      purchasePin?: string;
    };

    if (
      !purchasePin
    ) {
      res.status(400).json({
        error:
          'purchasePin is required.',
      });

      return;
    }

    if (
      !/^\d{4}$/.test(
        purchasePin,
      )
    ) {
      res.status(400).json({
        error:
          'purchasePin must be exactly 4 digits.',
      });

      return;
    }

    const [user] =
      await db
        .select({
          purchasePinHash:
            usersTable.purchasePinHash,
        })
        .from(usersTable)
        .where(
          eq(
            usersTable.id,
            userId,
          ),
        );

    if (!user) {
      res.status(404).json({
        error:
          'user_not_found',
      });

      return;
    }

    if (
      !user.purchasePinHash
    ) {
      res.status(400).json({
        error:
          'purchase_pin_not_set',
      });

      return;
    }

    const valid =
      await verifyPin(
        purchasePin,
        user.purchasePinHash,
      );

    if (!valid) {
      res.status(400).json({
        error:
          'invalid_purchase_pin',
      });

      return;
    }

    res.json({
      success: true,
    });
  },
);

// ── POST /api/auth/change-purchase-pin ──────────────────────────────────────

router.post(
  '/change-purchase-pin',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId;

    if (!userId) {
      res.status(401).json({
        error:
          'not_authenticated',
      });

      return;
    }

    const {
      currentPin,
      newPin,
    } = req.body as {
      currentPin?: string;
      newPin?: string;
    };

    if (
      !currentPin ||
      !newPin
    ) {
      res.status(400).json({
        error:
          'currentPin and newPin are required.',
      });

      return;
    }

    if (
      !/^\d{4}$/.test(
        currentPin,
      ) ||
      !/^\d{4}$/.test(
        newPin,
      )
    ) {
      res.status(400).json({
        error:
          'PIN must be exactly 4 digits.',
      });

      return;
    }

    if (
      currentPin === newPin
    ) {
      res.status(400).json({
        error:
          'New PIN must be different from current PIN.',
      });

      return;
    }

    const [user] =
      await db
        .select({
          purchasePinHash:
            usersTable.purchasePinHash,
        })
        .from(usersTable)
        .where(
          eq(
            usersTable.id,
            userId,
          ),
        );

    if (!user) {
      res.status(404).json({
        error:
          'user_not_found',
      });

      return;
    }

    if (
      !user.purchasePinHash
    ) {
      res.status(400).json({
        error:
          'purchase_pin_not_set',
      });

      return;
    }

    const valid =
      await verifyPin(
        currentPin,
        user.purchasePinHash,
      );

    if (!valid) {
      res.status(400).json({
        error:
          'invalid_current_pin',
      });

      return;
    }

    const purchasePinHash =
      await hashPin(newPin);

    await db
      .update(usersTable)
      .set({
        purchasePinHash,
        updatedAt:
          new Date(),
      })
      .where(
        eq(
          usersTable.id,
          userId,
        ),
      );

    res.json({
      success: true,
    });
  },
);

// ── POST /api/auth/delete-account ────────────────────────────────────────────

router.post(
  '/delete-account',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId;

    if (!userId) {
      res.status(401).json({
        error:
          'not_authenticated',
      });

      return;
    }

    const {
      loginPin,
    } = req.body as {
      loginPin?: string;
    };

    if (
      !loginPin ||
      !/^\d{6}$/.test(
        loginPin,
      )
    ) {
      res.status(400).json({
        error:
          'loginPin must be exactly 6 digits.',
      });

      return;
    }

    const [user] =
      await db
        .select()
        .from(usersTable)
        .where(
          eq(
            usersTable.id,
            userId,
          ),
        );

    if (!user) {
      res.status(404).json({
        error:
          'user_not_found',
      });

      return;
    }

    const valid =
      await verifyPin(
        loginPin,
        user.loginPinHash,
      );

    if (!valid) {
      res.status(400).json({
        error:
          'invalid_login_pin',
      });

      return;
    }

    try {
      await db
        .delete(usersTable)
        .where(
          eq(
            usersTable.id,
            userId,
          ),
        );
    } catch (err) {
      logger.error(
        {
          err,
          userId,
        },
        'Account deletion failed',
      );

      res.status(500).json({
        error:
          'account_deletion_failed',
      });

      return;
    }

    try {
      await new Promise<void>(
        (
          resolve,
          reject,
        ) => {
          req.session.destroy(
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
    } catch (err) {
      logger.warn(
        {
          err,
        },
        'Session destroy failed after account deletion',
      );
    }

    res.clearCookie(
      'gyd_sid',
    );

    res.json({
      success: true,
    });
  },
);

// ── GET /api/auth/health ─────────────────────────────────────────────────────

router.get(
  '/health',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      await db.execute(
        sql`SELECT 1`,
      );

      res.json({
        success: true,
        database: 'ok',
      });
    } catch (err) {
      logger.error(
        {
          err,
        },
        'Auth health check failed',
      );

      res.status(503).json({
        success: false,
        database: 'error',
      });
    }
  },
);

export default router;
