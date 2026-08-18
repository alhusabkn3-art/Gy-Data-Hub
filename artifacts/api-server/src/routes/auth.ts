/**
 * /api/auth — Registration, login, logout, session restore, forgot-PIN.
 *
 * Registration is atomic:
 *   user + wallet + cashback wallet + welcome notification
 *   are created inside ONE database transaction.
 *
 * If any registration step fails, PostgreSQL rolls everything back.
 *
 * PIN hashes use bcryptjs.
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

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  return String(
    Math.floor(Math.random() * 9_000_000_000) + 1_000_000_000
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
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// ── CHECK USERNAME ────────────────────────────────────────────────────────────

router.get(
  '/check-username',
  async (req: Request, res: Response): Promise<void> => {
    try {
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
        .select({
          id: usersTable.id,
        })
        .from(usersTable)
        .where(eq(usersTable.username, normalized));

      res.json({
        available: !existing,
      });
    } catch (err) {
      logger.error(
        { err },
        'Username check failed'
      );

      res.status(500).json({
        error: 'server_error',
      });
    }
  }
);

// ── REGISTER ──────────────────────────────────────────────────────────────────

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

    const trimmedEmail =
      email.trim().toLowerCase();

    if (!isValidEmail(trimmedEmail)) {
      res.status(400).json({
        error:
          'Please enter a valid email address.',
      });
      return;
    }

    if (!/^\d{6}$/.test(loginPin)) {
      res.status(400).json({
        error:
          'loginPin must be exactly 6 digits.',
      });
      return;
    }

    const normalizedUsername =
      username.toLowerCase().trim();

    if (
      !/^[a-z0-9]{4,15}$/.test(
        normalizedUsername
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

    // Check duplicates before transaction.
    const [existingPhone] =
      await db
        .select({
          id: usersTable.id,
        })
        .from(usersTable)
        .where(
          eq(
            usersTable.phone,
            normalizedPhone
          )
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
            normalizedUsername
          )
        );

    if (existingUsername) {
      res.status(409).json({
        error: 'username_taken',
      });
      return;
    }

    const parts =
      trimmedName.split(/\s+/);

    const firstName = parts[0]!;
    const lastName =
      parts.slice(1).join(' ');

    const pinHash =
      await hashPin(loginPin);

    // ─────────────────────────────────────────────────────────────────────────
    // IMPORTANT:
    // Regenerate session BEFORE creating database records.
    //
    // If session regeneration fails, no account will be created.
    // ─────────────────────────────────────────────────────────────────────────

    try {
      await regenerateSession(req);
    } catch (err) {
      logger.error(
        { err },
        'Session regeneration failed before registration'
      );

      res.status(500).json({
        error: 'session_error',
        message:
          'Session error. Please try again.',
      });

      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // ATOMIC REGISTRATION TRANSACTION
    //
    // USER
    // WALLET
    // CASHBACK WALLET
    // WELCOME NOTIFICATION
    //
    // If ANY of them fails, EVERYTHING is rolled back.
    // ─────────────────────────────────────────────────────────────────────────

    try {
      const registration =
        await db.transaction(async (tx) => {
          // Re-check phone inside transaction.
          const [phoneExists] =
            await tx
              .select({
                id: usersTable.id,
              })
              .from(usersTable)
              .where(
                eq(
                  usersTable.phone,
                  normalizedPhone
                )
              );

          if (phoneExists) {
            throw new Error(
              'phone_taken'
            );
          }

          // Re-check username inside transaction.
          const [usernameExists] =
            await tx
              .select({
                id: usersTable.id,
              })
              .from(usersTable)
              .where(
                eq(
                  usersTable.username,
                  normalizedUsername
                )
              );

          if (usernameExists) {
            throw new Error(
              'username_taken'
            );
          }

          // CREATE USER
          const [newUser] =
            await tx
              .insert(usersTable)
              .values({
                name: trimmedName,
                firstName,
                lastName,
                username:
                  normalizedUsername,
                email: trimmedEmail,
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
                    firstName
                  ),
                kycStatus:
                  'unverified',
                status: 'active',
              })
              .returning();

          if (!newUser) {
            throw new Error(
              'user_create_failed'
            );
          }

          // CREATE MAIN WALLET
          await tx
            .insert(walletsTable)
            .values({
              userId: newUser.id,
              balance: '0',
            });

          // CREATE CASHBACK WALLET
          await tx.execute(sql`
            INSERT INTO cashback_wallets
              (user_id, balance)
            VALUES
              (${newUser.id}::uuid, 0)
          `);

          // CREATE WELCOME NOTIFICATION
          const [welcomeNotif] =
            await tx
              .insert(
                notificationsTable
              )
              .values({
                userId:
                  newUser.id,
                type: 'system',
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
        });

      // Only set session after successful transaction.
      req.session.userId =
        registration.newUser.id;

      logger.info(
        {
          userId:
            registration.newUser.id,
          phone:
            normalizedPhone,
        },
        'New user registered successfully'
      );

      res.status(201).json({
        user: safeUser(
          registration.newUser
        ),
        balance: '0',
        transactions: [],
        notifications:
          registration.welcomeNotif
            ? [
                registration.welcomeNotif,
              ]
            : [],
      });
    } catch (err) {
      // Duplicate phone.
      if (
        err instanceof Error &&
        err.message ===
          'phone_taken'
      ) {
        res.status(409).json({
          error: 'phone_taken',
        });
        return;
      }

      // Duplicate username.
      if (
        err instanceof Error &&
        err.message ===
          'username_taken'
      ) {
        res.status(409).json({
          error: 'username_taken',
        });
        return;
      }

      // IMPORTANT:
      // Transaction has automatically rolled back.
      logger.error(
        {
          err,
          phone:
            normalizedPhone,
          username:
            normalizedUsername,
        },
        'Registration transaction failed — rolled back'
      );

      res.status(500).json({
        error:
          'registration_failed',
        message:
          'Failed to create account. Nothing was saved. Please try again.',
      });
    }
  }
);

// ── LOGIN ─────────────────────────────────────────────────────────────────────

router.post(
  '/login',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        phone,
        loginPin,
      } = req.body as {
        phone?: string;
        loginPin?: string;
      };

      if (!phone || !loginPin) {
        res.status(400).json({
          error:
            'phone and loginPin are required.',
        });
        return;
      }

      const normalizedPhone =
        normalizePhone(phone);

      const [user] =
        await db
          .select()
          .from(usersTable)
          .where(
            eq(
              usersTable.phone,
              normalizedPhone
            )
          );

      if (!user) {
        res.status(401).json({
          error: 'no_account',
        });
        return;
      }

      if (user.status !== 'active') {
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
          user.loginPinHash
        );

      if (!pinOk) {
        res.status(401).json({
          error: 'wrong_pin',
        });
        return;
      }

      try {
        await regenerateSession(req);
      } catch (err) {
        logger.error(
          { err },
          'Session regeneration failed on login'
        );

        res.status(500).json({
          error:
            'session_error',
          message:
            'Session error. Please try again.',
        });

        return;
      }

      req.session.userId =
        user.id;

      const session =
        await loadFullSession(
          user.id
        );

      if (!session) {
        logger.error(
          {
            userId: user.id,
          },
          'Login succeeded but session data could not be loaded'
        );

        res.status(500).json({
          error:
            'session_load_failed',
          message:
            'Account found, but account data could not be loaded.',
        });

        return;
      }

      logger.info(
        {
          userId: user.id,
        },
        'User logged in'
      );

      res.json(session);
    } catch (err) {
      // DO NOT turn database/server errors into "wrong PIN".
      logger.error(
        { err },
        'Login request failed'
      );

      res.status(500).json({
        error:
          'login_server_error',
        message:
          'Internal server error while logging in. Please try again.',
      });
    }
  }
);

// ── LOGOUT ────────────────────────────────────────────────────────────────────

router.post(
  '/logout',
  (
    req: Request,
    res: Response
  ): void => {
    const userId =
      req.session.userId;

    req.session.destroy(
      (err) => {
        if (err) {
          logger.error(
            { err },
            'Session destroy error'
          );
        }

        res.clearCookie(
          'gyd_sid'
        );

        if (userId) {
          logger.info(
            { userId },
            'User logged out'
          );
        }

        res.json({
          ok: true,
        });
      }
    );
  }
);

// ── ME ────────────────────────────────────────────────────────────────────────

router.get(
  '/me',
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      if (!req.session.userId) {
        res.status(401).json({
          error:
            'Not authenticated',
        });
        return;
      }

      const session =
        await loadFullSession(
          req.session.userId
        );

      if (!session) {
        req.session.destroy(
          () => {}
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
        { err },
        'Session restore failed'
      );

      res.status(500).json({
        error:
          'session_restore_failed',
        message:
          'Could not restore your session. Please try again.',
      });
    }
  }
);

// ── CHECK PHONE ───────────────────────────────────────────────────────────────

router.get(
  '/check-phone',
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const phone =
        req.query['phone'];

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

      const normalized =
        normalizePhone(phone);

      const [user] =
        await db
          .select({
            id: usersTable.id,
          })
          .from(usersTable)
          .where(
            eq(
              usersTable.phone,
              normalized
            )
          );

      res.json({
        exists: !!user,
      });
    } catch (err) {
      logger.error(
        { err },
        'Phone check failed'
      );

      res.status(500).json({
        error:
          'server_error',
      });
    }
  }
);

// ── FORGOT PIN REQUEST ────────────────────────────────────────────────────────

router.post(
  '/forgot-pin/request',
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
      const { phone } =
        req.body as {
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
        normalizePhone(phone);

      const [user] =
        await db
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
              normalizedPhone
            )
          );

      if (!user) {
        await new Promise(
          (resolve) =>
            setTimeout(
              resolve,
              200 +
                Math.random() * 200
            )
        );

        res.json({
          message:
            'If an account with this number exists, a code has been sent.',

          ...(process.env[
            'NODE_ENV'
          ] !== 'production'
            ? {
                devNote:
                  'phone not found',
              }
            : {}),
        });

        return;
      }

      if (
        user.resetOtpHash &&
        user.resetOtpExpiry &&
        new Date(
          user.resetOtpExpiry
        ).getTime() >
          Date.now() +
            5 * 60 * 1000
      ) {
        res.json({
          message:
            'If an account with this number exists, a code has been sent.',

          ...(process.env[
            'NODE_ENV'
          ] !== 'production'
            ? {
                devNote:
                  'CC-approved reset OTP already active',
              }
            : {}),
        });

        return;
      }

      const otpDigits =
        crypto
          .randomInt(
            0,
            1_000_000
          )
          .toString()
          .padStart(
            6,
            '0'
          );

      const otpHash =
        await hashPin(
          otpDigits
        );

      const expiry =
        new Date(
          Date.now() +
            5 * 60 * 1000
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
            user.id
          )
        );

      logger.info(
        {
          userId: user.id,
        },
        'PIN reset OTP issued'
      );

      res.json({
        message:
          'If an account with this number exists, a code has been sent.',

        ...(process.env[
          'NODE_ENV'
        ] !== 'production'
          ? {
              otp:
                otpDigits,
            }
          : {}),
      });
    } catch (err) {
      logger.error(
        { err },
        'PIN reset request failed'
      );

      res.status(500).json({
        error:
          'server_error',
      });
    }
  }
);

// ── FORGOT PIN RESET ──────────────────────────────────────────────────────────

router.post(
  '/forgot-pin/reset',
  async (
    req: Request,
    res: Response
  ): Promise<void> => {
    try {
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

      const [user] =
        await db
          .select()
          .from(usersTable)
          .where(
            eq(
              usersTable.phone,
              normalizedPhone
            )
          );

      const badRequest =
        async () => {
          await new Promise(
            (resolve) =>
              setTimeout(
                resolve,
                200 +
                  Math.random() * 200
              )
          );

          res.status(400).json({
            error:
              'invalid_or_expired',
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
            resetOtpHash:
              null,
            resetOtpExpiry:
              null,
          })
          .where(
            eq(
              usersTable.id,
              user.id
            )
          );

        await badRequest();
        return;
      }

      const otpOk =
        await verifyPin(
          otp,
          user.resetOtpHash
        );

      if (!otpOk) {
        await badRequest();
        return;
      }

      const newPinHash =
        await hashPin(
          newPin
        );

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
            user.id
          )
        );

      logger.info(
        {
          userId: user.id,
        },
        'PIN reset via OTP challenge'
      );

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'PIN reset failed'
      );

      res.status(500).json({
        error:
          'server_error',
      });
    }
  }
);

export default router;
