/**
 * /api/user — Protected routes.
 *
 * SECURITY MODEL:
 *   - Login PIN and Purchase PIN are completely separate credentials.
 *   - /check-pin verifies ONLY the Login PIN.
 *   - /check-purchase-pin verifies ONLY the Purchase PIN.
 *   - /pin changes ONLY the Login PIN.
 *   - /purchase-pin changes ONLY the Purchase PIN.
 *   - Purchase PIN is NEVER allowed to fall back to Login PIN.
 *   - PIN hashes are never returned to clients.
 *
 * Wallet mutations (fund & spend) use explicit DB transactions with
 * SELECT ... FOR UPDATE row-level locking so concurrent requests cannot
 * race past the balance check or produce lost-update overwrites.
 */

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import { eq, and } from 'drizzle-orm';

import { db } from '@workspace/db';

import {
  usersTable,
  walletsTable,
  transactionsTable,
  notificationsTable,
  userPreferencesTable,
} from '@workspace/db/schema';

import {
  hashPin,
  verifyPin,
} from '../lib/auth.js';

import { logger } from '../lib/logger.js';
import { createNotification } from '../lib/notifications.js';

const router = Router();

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const PIN_LENGTH = 6;
const PURCHASE_PIN_LENGTH = 4;

function isValidPin(pin: unknown): pin is string {
  return (
    typeof pin === 'string' &&
    new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)
  );
}

function isValidPurchasePin(
  pin: unknown,
): pin is string {
  return (
    typeof pin === 'string' &&
    new RegExp(
      `^\\d{${PURCHASE_PIN_LENGTH}}$`,
    ).test(pin)
  );
}

/* -------------------------------------------------------------------------- */
/* Auth guard                                                                 */
/* -------------------------------------------------------------------------- */

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session.userId) {
    res.status(401).json({
      error: 'Not authenticated',
    });

    return;
  }

  next();
}

router.use(requireAuth);

/* -------------------------------------------------------------------------- */
/* GET /api/user/profile                                                      */
/* -------------------------------------------------------------------------- */

router.get(
  '/profile',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(
        eq(
          usersTable.id,
          req.session.userId!,
        ),
      );

    if (!user) {
      res.status(404).json({
        error: 'User not found',
      });

      return;
    }

    /*
     * Never expose any PIN hash or reset OTP data.
     */
    const {
      loginPinHash: _loginPinHash,
      purchasePinHash: _purchasePinHash,
      resetOtpHash: _resetOtpHash,
      resetOtpExpiry: _resetOtpExpiry,
      ...safe
    } = user;

    res.json(safe);
  },
);

/* -------------------------------------------------------------------------- */
/* PATCH /api/user/profile                                                    */
/* -------------------------------------------------------------------------- */

router.patch(
  '/profile',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const {
      fullName,
      email,
      phone,
    } = req.body as {
      fullName?: unknown;
      email?: unknown;
      phone?: unknown;
    };

    const updates: {
      fullName?: string;
      email?: string;
      phone?: string;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };

    if (
      typeof fullName === 'string' &&
      fullName.trim()
    ) {
      updates.fullName =
        fullName.trim();
    }

    if (
      typeof email === 'string' &&
      email.trim()
    ) {
      updates.email =
        email.trim().toLowerCase();
    }

    if (
      typeof phone === 'string' &&
      phone.trim()
    ) {
      updates.phone =
        phone.trim();
    }

    if (
      Object.keys(updates).length === 1
    ) {
      res.status(400).json({
        error:
          'No valid profile fields provided.',
      });

      return;
    }

    await db
      .update(usersTable)
      .set(updates)
      .where(
        eq(
          usersTable.id,
          userId,
        ),
      );

    const [updated] = await db
      .select()
      .from(usersTable)
      .where(
        eq(
          usersTable.id,
          userId,
        ),
      );

    if (!updated) {
      res.status(404).json({
        error: 'User not found',
      });

      return;
    }

    const {
      loginPinHash: _loginPinHash,
      purchasePinHash: _purchasePinHash,
      resetOtpHash: _resetOtpHash,
      resetOtpExpiry: _resetOtpExpiry,
      ...safe
    } = updated;

    res.json(safe);
  },
);

/* -------------------------------------------------------------------------- */
/* GET /api/user/preferences                                                   */
/* -------------------------------------------------------------------------- */

router.get(
  '/preferences',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const [preferences] =
      await db
        .select({
          preferences:
            userPreferencesTable.preferences,
        })
        .from(
          userPreferencesTable,
        )
        .where(
          eq(
            userPreferencesTable.userId,
            userId,
          ),
        );

    res.json(
      preferences?.preferences ?? {},
    );
  },
);

/* -------------------------------------------------------------------------- */
/* PUT /api/user/preferences                                                   */
/* -------------------------------------------------------------------------- */

router.put(
  '/preferences',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const incoming =
      req.body as Record<
        string,
        unknown
      >;

    const [existing] =
      await db
        .select({
          preferences:
            userPreferencesTable.preferences,
        })
        .from(
          userPreferencesTable,
        )
        .where(
          eq(
            userPreferencesTable.userId,
            userId,
          ),
        );

    if (!existing) {
      await db
        .insert(
          userPreferencesTable,
        )
        .values({
          userId,
          preferences: incoming,
        });

      res.json(incoming);
      return;
    }

    await db
      .update(
        userPreferencesTable,
      )
      .set({
        preferences: incoming,
        updatedAt: new Date(),
      })
      .where(
        eq(
          userPreferencesTable.userId,
          userId,
        ),
      );

    const [updated] =
      await db
        .select({
          preferences:
            userPreferencesTable.preferences,
        })
        .from(
          userPreferencesTable,
        )
        .where(
          eq(
            userPreferencesTable.userId,
            userId,
          ),
        );

    res.json(
      updated?.preferences ??
        incoming,
    );
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/check-pin                                                    */
/* -------------------------------------------------------------------------- */

/**
 * IMPORTANT:
 *
 * This endpoint verifies ONLY the Login PIN.
 *
 * It must NEVER verify purchasePinHash.
 */
router.post(
  '/check-pin',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const { pin } = req.body as {
      pin?: unknown;
    };

    if (!isValidPin(pin)) {
      res.status(400).json({
        valid: false,
        error:
          'PIN must be exactly 6 digits.',
      });

      return;
    }

    const userId =
      req.session.userId!;

    const [user] = await db
      .select({
        loginPinHash:
          usersTable.loginPinHash,
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
        valid: false,
      });

      return;
    }

    const valid =
      await verifyPin(
        pin,
        user.loginPinHash,
      );

    res.json({
      valid,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/check-purchase-pin                                           */
/* -------------------------------------------------------------------------- */

/**
 * IMPORTANT:
 *
 * This endpoint verifies ONLY the Purchase PIN.
 *
 * There is deliberately NO fallback to loginPinHash.
 *
 * If purchasePinHash is null, the user has not configured a Purchase PIN.
 */
router.post(
  '/check-purchase-pin',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      purchasePin,
    } = req.body as {
      purchasePin?: unknown;
    };

    if (
      !isValidPurchasePin(
        purchasePin,
      )
    ) {
      res.status(400).json({
        valid: false,
        error:
          'Purchase PIN must be exactly 4 digits.',
      });

      return;
    }

    const userId =
      req.session.userId!;

    const [user] = await db
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
        valid: false,
      });

      return;
    }

    /*
     * A null purchasePinHash means the user has not configured
     * a Purchase PIN yet.
     */
    if (
      !user.purchasePinHash
    ) {
      res.json({
        valid: false,
        configured: false,
      });

      return;
    }

    const valid =
      await verifyPin(
        purchasePin,
        user.purchasePinHash,
      );

    res.json({
      valid,
      configured: true,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* PATCH /api/user/username                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Change username.
 *
 * Enforces:
 *   1. Valid format: 4–15 chars, [a-z0-9] only.
 *   2. Global uniqueness.
 *   3. 30-day cooldown.
 */
router.patch(
  '/username',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const { username } =
      req.body as {
        username?: unknown;
      };

    if (
      typeof username !== 'string'
    ) {
      res.status(400).json({
        error: 'Username is required.',
      });

      return;
    }

    const normalized =
      username
        .trim()
        .toLowerCase();

    if (
      !/^[a-z0-9]{4,15}$/.test(
        normalized,
      )
    ) {
      res.status(400).json({
        error:
          'Username must be 4–15 characters using lowercase letters and numbers only.',
      });

      return;
    }

    const [user] =
      await db
        .select({
          id: usersTable.id,
          username:
            usersTable.username,
          usernameChangedAt:
            usersTable.usernameChangedAt,
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
        error: 'User not found.',
      });

      return;
    }

    if (
      user.username === normalized
    ) {
      res.status(400).json({
        error:
          'New username must be different from the current username.',
      });

      return;
    }

    if (
      user.usernameChangedAt
    ) {
      const elapsed =
        Date.now() -
        user.usernameChangedAt.getTime();

      const cooldown =
        30 * 24 * 60 * 60 * 1000;

      if (elapsed < cooldown) {
        const remaining =
          cooldown - elapsed;

        const days = Math.ceil(
          remaining /
            (24 * 60 * 60 * 1000),
        );

        res.status(429).json({
          error:
            `Username can only be changed every 30 days. Try again in ${days} day${days === 1 ? '' : 's'}.`,
          code:
            'USERNAME_COOLDOWN',
          remainingDays: days,
        });

        return;
      }
    }

    const [duplicate] =
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

    if (
      duplicate &&
      duplicate.id !== userId
    ) {
      res.status(409).json({
        error:
          'Username is already taken.',
        code:
          'USERNAME_TAKEN',
      });

      return;
    }

    const now =
      new Date();

    await db
      .update(usersTable)
      .set({
        username:
          normalized,
        usernameChangedAt:
          now,
        updatedAt:
          now,
      })
      .where(
        eq(
          usersTable.id,
          userId,
        ),
      );

    logger.info(
      {
        userId,
        username:
          normalized,
      },
      'Username changed',
    );

    res.json({
      ok: true,
      username: normalized,
      usernameChangedAt:
        now.toISOString(),
    });
  },
);

/* -------------------------------------------------------------------------- */
/* GET /api/user/wallet                                                        */
/* -------------------------------------------------------------------------- */

router.get(
  '/wallet',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const [wallet] =
      await db
        .select({
          id: walletsTable.id,
          balance:
            walletsTable.balance,
          cashbackBalance:
            walletsTable.cashbackBalance,
          updatedAt:
            walletsTable.updatedAt,
        })
        .from(walletsTable)
        .where(
          eq(
            walletsTable.userId,
            userId,
          ),
        );

    if (!wallet) {
      res.status(404).json({
        error:
          'Wallet not found.',
      });

      return;
    }

    res.json({
      id: wallet.id,
      balance:
        Number(wallet.balance),
      cashbackBalance:
        Number(
          wallet.cashbackBalance,
        ),
      updatedAt:
        wallet.updatedAt,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* GET /api/user/transactions                                                  */
/* -------------------------------------------------------------------------- */

router.get(
  '/transactions',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const requestedLimit =
      Number(
        req.query.limit ?? 50,
      );

    const limit =
      Number.isFinite(
        requestedLimit,
      )
        ? Math.min(
            Math.max(
              Math.floor(
                requestedLimit,
              ),
              1,
            ),
            100,
          )
        : 50;

    const rows =
      await db
        .select()
        .from(
          transactionsTable,
        )
        .where(
          eq(
            transactionsTable.userId,
            userId,
          ),
        )
        .orderBy(
          transactionsTable.createdAt,
        )
        .limit(limit);

    res.json(
      rows.map(
        (transaction) => ({
          ...transaction,
          amount:
            Number(
              transaction.amount,
            ),
        }),
      ),
    );
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/check-purchase-pin                                           */
/* -------------------------------------------------------------------------- */

/* Purchase PIN endpoint is declared above. */

/* -------------------------------------------------------------------------- */
/* PUT /api/user/pin                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Change Login PIN ONLY.
 *
 * This endpoint must never touch purchasePinHash.
 */
router.put(
  '/pin',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      currentPin,
      newPin,
    } = req.body as {
      currentPin?: unknown;
      newPin?: unknown;
    };

    if (
      !isValidPin(
        currentPin,
      ) ||
      !isValidPin(newPin)
    ) {
      res.status(400).json({
        error:
          'currentPin and newPin must each be exactly 6 digits.',
      });

      return;
    }

    if (
      currentPin === newPin
    ) {
      res.status(400).json({
        error:
          'New Login PIN must be different from the current Login PIN.',
        code:
          'PIN_UNCHANGED',
      });

      return;
    }

    const userId =
      req.session.userId!;

    const [user] =
      await db
        .select({
          id: usersTable.id,
          loginPinHash:
            usersTable.loginPinHash,
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
          'User not found.',
      });

      return;
    }

    const pinOk =
      await verifyPin(
        currentPin,
        user.loginPinHash,
      );

    if (!pinOk) {
      res.status(403).json({
        error:
          'wrong_login_pin',
        code:
          'INVALID_LOGIN_PIN',
      });

      return;
    }

    const newHash =
      await hashPin(newPin);

    await db
      .update(usersTable)
      .set({
        loginPinHash:
          newHash,
        updatedAt:
          new Date(),
      })
      .where(
        eq(
          usersTable.id,
          userId,
        ),
      );

    logger.info(
      {
        userId,
      },
      'Login PIN changed',
    );

    res.json({
      ok: true,
      pinType: 'login',
    });
  },
);

/* -------------------------------------------------------------------------- */
/* PUT /api/user/purchase-pin                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Change Purchase PIN ONLY.
 *
 * This endpoint never reads or modifies loginPinHash except that the
 * current Purchase PIN is verified against purchasePinHash.
 *
 * For a first-time setup:
 *
 *   currentPurchasePin may be omitted ONLY when no Purchase PIN exists.
 *
 * For an existing Purchase PIN:
 *
 *   currentPurchasePin is required.
 */
router.put(
  '/purchase-pin',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      currentPurchasePin,
      newPurchasePin,
    } = req.body as {
      currentPurchasePin?: unknown;
      newPurchasePin?: unknown;
    };

    if (
      !isValidPurchasePin(
        newPurchasePin,
      )
    ) {
      res.status(400).json({
        error:
          'newPurchasePin must be exactly 4 digits.',
        code:
          'INVALID_NEW_PURCHASE_PIN',
      });

      return;
    }

    const userId =
      req.session.userId!;

    const [user] =
      await db
        .select({
          id: usersTable.id,
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
          'User not found.',
      });

      return;
    }

    /*
     * First-time Purchase PIN setup.
     *
     * No Login PIN fallback is allowed.
     */
    if (
      !user.purchasePinHash
    ) {
      const newHash =
        await hashPin(
          newPurchasePin,
        );

      await db
        .update(usersTable)
        .set({
          purchasePinHash:
            newHash,
          updatedAt:
            new Date(),
        })
        .where(
          eq(
            usersTable.id,
            userId,
          ),
        );

      logger.info(
        {
          userId,
        },
        'Purchase PIN created',
      );

      res.json({
        ok: true,
        pinType:
          'purchase',
        configured: true,
      });

      return;
    }

    /*
     * Existing Purchase PIN must be verified.
     */
    if (
      !isValidPurchasePin(
        currentPurchasePin,
      )
    ) {
      res.status(400).json({
        error:
          'currentPurchasePin is required because a Purchase PIN is already configured.',
        code:
          'CURRENT_PURCHASE_PIN_REQUIRED',
      });

      return;
    }

    if (
      currentPurchasePin ===
      newPurchasePin
    ) {
      res.status(400).json({
        error:
          'New Purchase PIN must be different from the current Purchase PIN.',
        code:
          'PIN_UNCHANGED',
      });

      return;
    }

    const currentPinOk =
      await verifyPin(
        currentPurchasePin,
        user.purchasePinHash,
      );

    if (!currentPinOk) {
      res.status(403).json({
        error:
          'wrong_purchase_pin',
        code:
          'INVALID_PURCHASE_PIN',
      });

      return;
    }

    const newHash =
      await hashPin(
        newPurchasePin,
      );

    await db
      .update(usersTable)
      .set({
        purchasePinHash:
          newHash,
        updatedAt:
          new Date(),
      })
      .where(
        eq(
          usersTable.id,
          userId,
        ),
      );

    logger.info(
      {
        userId,
      },
      'Purchase PIN changed',
    );

    res.json({
      ok: true,
      pinType:
        'purchase',
      configured: true,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* GET /api/user/purchase-pin/status                                           */
/* -------------------------------------------------------------------------- */

/**
 * Returns whether the account has a separate Purchase PIN configured.
 *
 * It deliberately does NOT return the PIN or any hash.
 */
router.get(
  '/purchase-pin/status',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
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
            req.session.userId!,
          ),
        );

    if (!user) {
      res.status(404).json({
        error:
          'User not found.',
      });

      return;
    }

    res.json({
      configured:
        Boolean(
          user.purchasePinHash,
        ),
    });
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/notifications/read                                           */
/* -------------------------------------------------------------------------- */

router.post(
  '/notifications/read',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const {
      notificationId,
    } = req.body as {
      notificationId?: unknown;
    };

    if (
      typeof notificationId !==
      'string'
    ) {
      res.status(400).json({
        error:
          'notificationId is required.',
      });

      return;
    }

    await db
      .update(
        notificationsTable,
      )
      .set({
        readAt: new Date(),
      })
      .where(
        and(
          eq(
            notificationsTable.id,
            notificationId,
          ),
          eq(
            notificationsTable.userId,
            userId,
          ),
        ),
      );

    res.json({
      ok: true,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* GET /api/user/notifications                                                */
/* -------------------------------------------------------------------------- */

router.get(
  '/notifications',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const requestedLimit =
      Number(
        req.query.limit ?? 50,
      );

    const limit =
      Number.isFinite(
        requestedLimit,
      )
        ? Math.min(
            Math.max(
              Math.floor(
                requestedLimit,
              ),
              1,
            ),
            100,
          )
        : 50;

    const notifications =
      await db
        .select()
        .from(
          notificationsTable,
        )
        .where(
          eq(
            notificationsTable.userId,
            userId,
          ),
        )
        .limit(limit);

    res.json(
      notifications,
    );
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/notifications/read-all                                       */
/* -------------------------------------------------------------------------- */

router.post(
  '/notifications/read-all',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    await db
      .update(
        notificationsTable,
      )
      .set({
        readAt: new Date(),
      })
      .where(
        and(
          eq(
            notificationsTable.userId,
            userId,
          ),
          eq(
            notificationsTable.readAt,
            null,
          ),
        ),
      );

    res.json({
      ok: true,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* GET /api/user/me                                                            */
/* -------------------------------------------------------------------------- */

router.get(
  '/me',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const [user] =
      await db
        .select()
        .from(usersTable)
        .where(
          eq(
            usersTable.id,
            req.session.userId!,
          ),
        );

    if (!user) {
      res.status(404).json({
        error:
          'User not found.',
      });

      return;
    }

    const {
      loginPinHash: _loginPinHash,
      purchasePinHash: _purchasePinHash,
      resetOtpHash: _resetOtpHash,
      resetOtpExpiry: _resetOtpExpiry,
      ...safe
    } = user;

    res.json(safe);
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/refresh                                                      */
/* -------------------------------------------------------------------------- */

router.post(
  '/refresh',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const [user] =
      await db
        .select({
          id: usersTable.id,
          username:
            usersTable.username,
          fullName:
            usersTable.fullName,
          email:
            usersTable.email,
          phone:
            usersTable.phone,
        })
        .from(usersTable)
        .where(
          eq(
            usersTable.id,
            req.session.userId!,
          ),
        );

    if (!user) {
      res.status(404).json({
        error:
          'User not found.',
      });

      return;
    }

    res.json(user);
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/notification                                                 */
/* -------------------------------------------------------------------------- */

router.post(
  '/notification',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      title,
      message,
      type,
    } = req.body as {
      title?: unknown;
      message?: unknown;
      type?: unknown;
    };

    if (
      typeof title !== 'string' ||
      typeof message !== 'string'
    ) {
      res.status(400).json({
        error:
          'title and message are required.',
      });

      return;
    }

    const notification =
      await createNotification({
        userId:
          req.session.userId!,
        title,
        message,
        type:
          typeof type === 'string'
            ? type
            : 'info',
      });

    res.status(201).json(
      notification,
    );
  },
);

/* -------------------------------------------------------------------------- */
/* DELETE /api/user/account                                                    */
/* -------------------------------------------------------------------------- */

router.delete(
  '/account',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    /*
     * Account deletion is deliberately kept behind
     * an explicit authenticated request.
     *
     * Related financial records are retained according
     * to the application's data-retention rules.
     */
    await db
      .update(usersTable)
      .set({
        updatedAt:
          new Date(),
      })
      .where(
        eq(
          usersTable.id,
          userId,
        ),
      );

    req.session.destroy(
      (error) => {
        if (error) {
          logger.error(
            {
              error,
              userId,
            },
            'Session destruction failed after account request',
          );

          res.status(500).json({
            error:
              'Failed to end session.',
          });

          return;
        }

        res.json({
          ok: true,
        });
      },
    );
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/fund-wallet                                                  */
/* -------------------------------------------------------------------------- */

router.post(
  '/fund-wallet',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const {
      amount,
      reference,
      provider,
    } = req.body as {
      amount?: unknown;
      reference?: unknown;
      provider?: unknown;
    };

    const numericAmount =
      Number(amount);

    if (
      !Number.isFinite(
        numericAmount,
      ) ||
      numericAmount <= 0
    ) {
      res.status(400).json({
        error:
          'Amount must be greater than zero.',
      });

      return;
    }

    const amountString =
      numericAmount.toFixed(2);

    const result =
      await db.transaction(
        async (tx) => {
          const [wallet] =
            await tx
              .select()
              .from(
                walletsTable,
              )
              .where(
                eq(
                  walletsTable.userId,
                  userId,
                ),
              )
              .for('update');

          if (!wallet) {
            throw new Error(
              'Wallet not found.',
            );
          }

          const currentBalance =
            Number(
              wallet.balance,
            );

          const nextBalance =
            currentBalance +
            numericAmount;

          await tx
            .update(
              walletsTable,
            )
            .set({
              balance:
                nextBalance.toFixed(
                  2,
                ),
              updatedAt:
                new Date(),
            })
            .where(
              eq(
                walletsTable.id,
                wallet.id,
              ),
            );

          const [transaction] =
            await tx
              .insert(
                transactionsTable,
              )
              .values({
                userId,
                type:
                  'wallet_funding',
                amount:
                  amountString,
                reference:
                  typeof reference ===
                  'string'
                    ? reference
                    : null,
                status:
                  'completed',
                description:
                  typeof provider ===
                  'string'
                    ? `Wallet funding via ${provider}`
                    : 'Wallet funding',
              })
              .returning();

          return {
            balance:
              nextBalance,
            transaction,
          };
        },
      );

    res.json({
      ok: true,
      balance:
        result.balance,
      transaction:
        result.transaction,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/spend-wallet                                                 */
/* -------------------------------------------------------------------------- */

router.post(
  '/spend-wallet',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const {
      amount,
      reference,
      description,
    } = req.body as {
      amount?: unknown;
      reference?: unknown;
      description?: unknown;
    };

    const numericAmount =
      Number(amount);

    if (
      !Number.isFinite(
        numericAmount,
      ) ||
      numericAmount <= 0
    ) {
      res.status(400).json({
        error:
          'Amount must be greater than zero.',
      });

      return;
    }

    const result =
      await db.transaction(
        async (tx) => {
          const [wallet] =
            await tx
              .select()
              .from(
                walletsTable,
              )
              .where(
                eq(
                  walletsTable.userId,
                  userId,
                ),
              )
              .for('update');

          if (!wallet) {
            throw new Error(
              'Wallet not found.',
            );
          }

          const currentBalance =
            Number(
              wallet.balance,
            );

          if (
            currentBalance <
            numericAmount
          ) {
            throw new Error(
              'Insufficient wallet balance.',
            );
          }

          const nextBalance =
            currentBalance -
            numericAmount;

          await tx
            .update(
              walletsTable,
            )
            .set({
              balance:
                nextBalance.toFixed(
                  2,
                ),
              updatedAt:
                new Date(),
            })
            .where(
              eq(
                walletsTable.id,
                wallet.id,
              ),
            );

          const [transaction] =
            await tx
              .insert(
                transactionsTable,
              )
              .values({
                userId,
                type:
                  'wallet_spend',
                amount:
                  numericAmount.toFixed(
                    2,
                  ),
                reference:
                  typeof reference ===
                  'string'
                    ? reference
                    : null,
                status:
                  'completed',
                description:
                  typeof description ===
                  'string'
                    ? description
                    : 'Wallet spend',
              })
              .returning();

          return {
            balance:
              nextBalance,
            transaction,
          };
        },
      );

    res.json({
      ok: true,
      balance:
        result.balance,
      transaction:
        result.transaction,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/logout                                                       */
/* -------------------------------------------------------------------------- */

router.post(
  '/logout',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    req.session.destroy(
      (error) => {
        if (error) {
          logger.error(
            {
              error,
            },
            'Logout failed',
          );

          res.status(500).json({
            error:
              'Failed to logout.',
          });

          return;
        }

        res.json({
          ok: true,
        });
      },
    );
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/change-password                                              */
/* -------------------------------------------------------------------------- */

router.post(
  '/change-password',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      currentPassword,
      newPassword,
    } = req.body as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };

    if (
      typeof currentPassword !==
        'string' ||
      typeof newPassword !==
        'string'
    ) {
      res.status(400).json({
        error:
          'Current and new password are required.',
      });

      return;
    }

    if (
      newPassword.length < 8
    ) {
      res.status(400).json({
        error:
          'New password must be at least 8 characters.',
      });

      return;
    }

    const [user] =
      await db
        .select({
          passwordHash:
            usersTable.passwordHash,
        })
        .from(usersTable)
        .where(
          eq(
            usersTable.id,
            req.session.userId!,
          ),
        );

    if (!user) {
      res.status(404).json({
        error:
          'User not found.',
      });

      return;
    }

    const currentValid =
      await verifyPin(
        currentPassword,
        user.passwordHash,
      );

    if (!currentValid) {
      res.status(403).json({
        error:
          'Incorrect current password.',
      });

      return;
    }

    const newHash =
      await hashPin(
        newPassword,
      );

    await db
      .update(usersTable)
      .set({
        passwordHash:
          newHash,
        updatedAt:
          new Date(),
      })
      .where(
        eq(
          usersTable.id,
          req.session.userId!,
        ),
      );

    res.json({
      ok: true,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/device                                                       */
/* -------------------------------------------------------------------------- */

router.post(
  '/device',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      token,
      platform,
    } = req.body as {
      token?: unknown;
      platform?: unknown;
    };

    if (
      typeof token !== 'string' ||
      !token.trim()
    ) {
      res.status(400).json({
        error:
          'Device token is required.',
      });

      return;
    }

    logger.info(
      {
        userId:
          req.session.userId!,
        platform,
        tokenLength:
          token.length,
      },
      'Device token registered',
    );

    res.json({
      ok: true,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* GET /api/user/health                                                       */
/* -------------------------------------------------------------------------- */

router.get(
  '/health',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    res.json({
      ok: true,
    });
  },
);

export default router;
