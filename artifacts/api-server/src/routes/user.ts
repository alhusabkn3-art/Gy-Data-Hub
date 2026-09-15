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

function isValidPin(pin: unknown): pin is string {
  return (
    typeof pin === 'string' &&
    new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)
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
/* GET /api/user/wallet                                                       */
/* -------------------------------------------------------------------------- */

router.get(
  '/wallet',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const [wallet] = await db
      .select()
      .from(walletsTable)
      .where(
        eq(
          walletsTable.userId,
          req.session.userId!,
        ),
      );

    res.json({
      balance: wallet?.balance ?? '0',
    });
  },
);

/* -------------------------------------------------------------------------- */
/* GET /api/user/transactions                                                 */
/* -------------------------------------------------------------------------- */

router.get(
  '/transactions',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const rows = await db
      .select()
      .from(transactionsTable)
      .where(
        eq(
          transactionsTable.userId,
          req.session.userId!,
        ),
      )
      .orderBy(
        transactionsTable.createdAt,
      );

    rows.reverse();

    res.json(rows);
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
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(
        eq(
          notificationsTable.userId,
          req.session.userId!,
        ),
      )
      .orderBy(
        notificationsTable.createdAt,
      );

    rows.reverse();

    res.json(rows);
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/notifications/read-all                                      */
/* -------------------------------------------------------------------------- */

router.post(
  '/notifications/read-all',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    await db
      .update(notificationsTable)
      .set({
        read: true,
      })
      .where(
        and(
          eq(
            notificationsTable.userId,
            req.session.userId!,
          ),
          eq(
            notificationsTable.read,
            false,
          ),
        ),
      );

    res.json({
      ok: true,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* PATCH /api/user/notifications/:id/read                                     */
/* -------------------------------------------------------------------------- */

router.patch(
  '/notifications/:id/read',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const { id } = req.params as {
      id: string;
    };

    const [updated] = await db
      .update(notificationsTable)
      .set({
        read: true,
      })
      .where(
        and(
          eq(
            notificationsTable.id,
            id,
          ),
          eq(
            notificationsTable.userId,
            req.session.userId!,
          ),
        ),
      )
      .returning({
        id: notificationsTable.id,
      });

    if (!updated) {
      res.status(404).json({
        error: 'Notification not found.',
      });

      return;
    }

    res.json({
      ok: true,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* DELETE /api/user/notifications                                             */
/* -------------------------------------------------------------------------- */

router.delete(
  '/notifications',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    await db
      .delete(notificationsTable)
      .where(
        eq(
          notificationsTable.userId,
          req.session.userId!,
        ),
      );

    res.json({
      ok: true,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* DELETE /api/user/notifications/:id                                         */
/* -------------------------------------------------------------------------- */

router.delete(
  '/notifications/:id',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const { id } = req.params as {
      id: string;
    };

    await db
      .delete(notificationsTable)
      .where(
        and(
          eq(
            notificationsTable.id,
            id,
          ),
          eq(
            notificationsTable.userId,
            req.session.userId!,
          ),
        ),
      );

    res.json({
      ok: true,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/wallet/fund                                                  */
/* -------------------------------------------------------------------------- */

/*
 * Direct wallet funding from a client-supplied amount is disabled.
 *
 * A client must NOT be able to do:
 *
 *   POST /api/user/wallet/fund
 *   { "amount": 1000000 }
 *
 * and have the server create money in the wallet.
 *
 * Wallet funding must happen through the verified payment flow.
 */
router.post(
  '/wallet/fund',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    res.status(410).json({
      error:
        'Direct wallet funding is disabled. Complete a verified payment to fund your wallet.',
    });
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/transactions                                                 */
/* -------------------------------------------------------------------------- */

const SPEND_TYPES = new Set([
  'data',
  'airtime',
  'electricity',
  'cable',
  'betting',
  'exam',
]);

router.post(
  '/transactions',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      type,
      service,
      provider,
      amount,
      description,
      paymentMethod,
      reference,
    } = req.body as {
      type?: string;
      service?: string;
      provider?: string;
      amount?: number;
      description?: string;
      paymentMethod?: string;
      reference?: string;
    };

    if (
      !type ||
      !service ||
      !provider ||
      amount === undefined
    ) {
      res.status(400).json({
        error:
          'type, service, provider, and amount are required.',
      });

      return;
    }

    if (!SPEND_TYPES.has(type)) {
      res.status(400).json({
        error: `Invalid transaction type: ${type}`,
      });

      return;
    }

    const numericAmount = Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      res.status(400).json({
        error:
          'amount must be a positive number.',
      });

      return;
    }

    const userId = req.session.userId!;

    try {
      const {
        txn,
        newBalance,
      } = await db.transaction(
        async (tx) => {
          const [wallet] = await tx
            .select()
            .from(walletsTable)
            .where(
              eq(
                walletsTable.userId,
                userId,
              ),
            )
            .for('update');

          if (!wallet) {
            throw Object.assign(
              new Error(
                'Wallet not found',
              ),
              {
                code: 'NOT_FOUND',
              },
            );
          }

          const currentBalance =
            parseFloat(
              wallet.balance,
            );

          if (
            currentBalance <
            numericAmount
          ) {
            throw Object.assign(
              new Error(
                'Insufficient funds',
              ),
              {
                code:
                  'INSUFFICIENT_FUNDS',
              },
            );
          }

          const newBalance =
            (
              currentBalance -
              numericAmount
            ).toFixed(2);

          await tx
            .update(walletsTable)
            .set({
              balance: newBalance,
              updatedAt: new Date(),
            })
            .where(
              eq(
                walletsTable.userId,
                userId,
              ),
            );

          const [txn] = await tx
            .insert(
              transactionsTable,
            )
            .values({
              userId,

              type: type as
                | 'data'
                | 'airtime'
                | 'electricity'
                | 'cable'
                | 'betting'
                | 'exam',

              service,
              provider,

              amount:
                numericAmount.toFixed(
                  2,
                ),

              status: 'success',

              description:
                description ?? '',

              paymentMethod:
                paymentMethod ??
                null,

              reference:
                reference ?? null,
            })
            .returning();

          return {
            txn,
            newBalance,
          };
        },
      );

      logger.info(
        {
          userId,
          type,
          amount:
            numericAmount,
        },
        'Spend transaction recorded',
      );

      res.status(201).json({
        ...txn,
        balance: newBalance,
      });
    } catch (err: unknown) {
      const e = err as {
        code?: string;
      };

      if (e.code === 'NOT_FOUND') {
        res.status(404).json({
          error:
            'Wallet not found.',
        });

        return;
      }

      if (
        e.code ===
        'INSUFFICIENT_FUNDS'
      ) {
        res.status(402).json({
          error:
            'insufficient_funds',
        });

        return;
      }

      logger.error(
        {
          err,
        },
        'transaction spend failed',
      );

      res.status(500).json({
        error:
          'Failed to record transaction.',
      });
    }
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

    const [row] = await db
      .select()
      .from(userPreferencesTable)
      .where(
        eq(
          userPreferencesTable.userId,
          userId,
        ),
      );

    res.json(
      row?.preferences ?? {},
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

    if (
      !incoming ||
      typeof incoming !== 'object'
    ) {
      res.status(400).json({
        error:
          'Request body must be a JSON object.',
      });

      return;
    }

    const [existing] = await db
      .select()
      .from(userPreferencesTable)
      .where(
        eq(
          userPreferencesTable.userId,
          userId,
        ),
      );

    if (existing) {
      const merged = {
        ...(existing.preferences as Record<
          string,
          unknown
        >),
        ...incoming,
      };

      const [updated] =
        await db
          .update(
            userPreferencesTable,
          )
          .set({
            preferences: merged,
            updatedAt: new Date(),
          })
          .where(
            eq(
              userPreferencesTable.userId,
              userId,
            ),
          )
          .returning({
            preferences:
              userPreferencesTable.preferences,
          });

      res.json(
        updated?.preferences ??
          merged,
      );

      return;
    }

    const [inserted] =
      await db
        .insert(
          userPreferencesTable,
        )
        .values({
          userId,
          preferences: incoming,
        })
        .returning({
          preferences:
            userPreferencesTable.preferences,
        });

    res.json(
      inserted?.preferences ??
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
      !isValidPin(
        purchasePin,
      )
    ) {
      res.status(400).json({
        valid: false,
        error:
          'Purchase PIN must be exactly 6 digits.',
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
        username?: string;
      };

    if (!username) {
      res.status(400).json({
        error:
          'username is required.',
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
      res.status(400).json({
        error:
          'invalid_format',
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
        error:
          'User not found.',
      });

      return;
    }

    if (
      user.usernameChangedAt
    ) {
      const elapsed =
        Date.now() -
        user.usernameChangedAt.getTime();

      const thirtyDaysMs =
        30 *
        24 *
        60 *
        60 *
        1000;

      if (
        elapsed <
        thirtyDaysMs
      ) {
        const nextChangeAt =
          new Date(
            user.usernameChangedAt.getTime() +
              thirtyDaysMs,
          ).toISOString();

        res.status(429).json({
          error: 'cooldown',
          nextChangeAt,
        });

        return;
      }
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

    if (
      existing &&
      existing.id !== userId
    ) {
      res.status(409).json({
        error:
          'username_taken',
      });

      return;
    }

    const now =
      new Date();

    await db
      .update(usersTable)
      .set({
        username: normalized,
        usernameChangedAt: now,
        updatedAt: now,
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
      !isValidPin(
        newPurchasePin,
      )
    ) {
      res.status(400).json({
        error:
          'newPurchasePin must be exactly 6 digits.',
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
      !isValidPin(
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

export default router;
