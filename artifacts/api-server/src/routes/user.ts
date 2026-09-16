/**
 * /api/user — authenticated user routes.
 *
 * Aligned with the current DB schema:
 * - users.name
 * - wallets.balance
 * - notifications.read
 * - transactions type/status enums
 */

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { and, eq } from 'drizzle-orm';
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
import { createNotification } from '../lib/notifications.js';

const router = Router();

const LOGIN_PIN_LENGTH = 6;
const PURCHASE_PIN_LENGTH = 4;
const USERNAME_COOLDOWN_MS =
  30 * 24 * 60 * 60 * 1000;

function isValidPin(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    new RegExp(
      `^\\d{${LOGIN_PIN_LENGTH}}$`,
    ).test(value)
  );
}

function isValidPurchasePin(
  value: unknown,
): value is string {
  return (
    typeof value === 'string' &&
    new RegExp(
      `^\\d{${PURCHASE_PIN_LENGTH}}$`,
    ).test(value)
  );
}

function publicUser<
  T extends Record<string, unknown>,
>(user: T) {
  const {
    loginPinHash: _loginPinHash,
    purchasePinHash: _purchasePinHash,
    resetOtpHash: _resetOtpHash,
    resetOtpExpiry: _resetOtpExpiry,
    ...safe
  } = user;

  return safe;
}

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

    res.json({
      ...publicUser(user),
      fullName: user.name,
    });
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
      name?: string;
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
      updates.name =
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

    try {
      await db
        .update(usersTable)
        .set(updates)
        .where(
          eq(
            usersTable.id,
            userId,
          ),
        );
    } catch (err: unknown) {
      logger.error(
        {
          err,
          userId,
        },
        'Profile update failed',
      );

      res.status(400).json({
        error:
          'Unable to update profile.',
      });

      return;
    }

    const [updated] =
      await db
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

    res.json({
      ...publicUser(updated),
      fullName: updated.name,
    });
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
    const [row] =
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
            req.session.userId!,
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

    const incoming = (
      req.body &&
      typeof req.body === 'object' &&
      !Array.isArray(req.body)
        ? req.body
        : {}
    ) as Record<
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

router.post(
  '/check-pin',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const { pin } =
      req.body as {
        pin?: unknown;
      };

    if (!isValidPin(pin)) {
      res.status(400).json({
        valid: false,
        error:
          `PIN must be exactly ${LOGIN_PIN_LENGTH} digits.`,
      });

      return;
    }

    const [user] =
      await db
        .select({
          loginPinHash:
            usersTable.loginPinHash,
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
        valid: false,
      });

      return;
    }

    res.json({
      valid:
        await verifyPin(
          pin,
          user.loginPinHash,
        ),
    });
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/check-purchase-pin                                           */
/* -------------------------------------------------------------------------- */

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
          `Purchase PIN must be exactly ${PURCHASE_PIN_LENGTH} digits.`,
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
            req.session.userId!,
          ),
        );

    if (!user) {
      res.status(404).json({
        valid: false,
      });

      return;
    }

    if (!user.purchasePinHash) {
      res.json({
        valid: false,
        configured: false,
      });

      return;
    }

    res.json({
      valid:
        await verifyPin(
          purchasePin,
          user.purchasePinHash,
        ),
      configured: true,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* PATCH /api/user/username                                                    */
/* -------------------------------------------------------------------------- */

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
        error:
          'Username is required.',
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
        error:
          'User not found.',
      });

      return;
    }

    if (
      user.username ===
      normalized
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

      if (
        elapsed <
        USERNAME_COOLDOWN_MS
      ) {
        const days =
          Math.ceil(
            (
              USERNAME_COOLDOWN_MS -
              elapsed
            ) /
              (
                24 *
                60 *
                60 *
                1000
              ),
          );

        res.status(429).json({
          error:
            `Username can only be changed every 30 days. Try again in ${days} day${days === 1 ? '' : 's'}.`,
          code:
            'USERNAME_COOLDOWN',
          remainingDays:
            days,
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

    const now = new Date();

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
      username:
        normalized,
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
    const [wallet] =
      await db
        .select({
          id: walletsTable.id,
          balance:
            walletsTable.balance,
          updatedAt:
            walletsTable.updatedAt,
        })
        .from(walletsTable)
        .where(
          eq(
            walletsTable.userId,
            req.session.userId!,
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
        Number(
          wallet.balance,
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
    const requestedLimit =
      Number(
        req.query.limit ??
          50,
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
            req.session.userId!,
          ),
        )
        .orderBy(
          transactionsTable.createdAt,
        )
        .limit(limit);

    res.json(
      rows.map(
        (
          transaction,
        ) => ({
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
/* PUT /api/user/pin                                                           */
/* -------------------------------------------------------------------------- */

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
          `currentPin and newPin must each be exactly ${LOGIN_PIN_LENGTH} digits.`,
      });

      return;
    }

    if (
      currentPin ===
      newPin
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

    const valid =
      await verifyPin(
        currentPin,
        user.loginPinHash,
      );

    if (!valid) {
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
      { userId },
      'Login PIN changed',
    );

    res.json({
      ok: true,
      pinType:
        'login',
    });
  },
);

/* -------------------------------------------------------------------------- */
/* PUT /api/user/purchase-pin                                                  */
/* -------------------------------------------------------------------------- */

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
          `newPurchasePin must be exactly ${PURCHASE_PIN_LENGTH} digits.`,
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
        { userId },
        'Purchase PIN created',
      );

      res.json({
        ok: true,
        pinType:
          'purchase',
        configured:
          true,
      });

      return;
    }

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

    const currentValid =
      await verifyPin(
        currentPurchasePin,
        user.purchasePinHash,
      );

    if (!currentValid) {
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
      { userId },
      'Purchase PIN changed',
    );

    res.json({
      ok: true,
      pinType:
        'purchase',
      configured:
        true,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* GET /api/user/purchase-pin/status                                           */
/* -------------------------------------------------------------------------- */

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
        read: true,
      })
      .where(
        and(
          eq(
            notificationsTable.id,
            notificationId,
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
/* GET /api/user/notifications                                                */
/* -------------------------------------------------------------------------- */

router.get(
  '/notifications',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const requestedLimit =
      Number(
        req.query.limit ??
          50,
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
            req.session.userId!,
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
    await db
      .update(
        notificationsTable,
      )
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

    res.json(
      publicUser(user),
    );
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
            usersTable.name,
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
      typeof title !==
        'string' ||
      typeof message !==
        'string'
    ) {
      res.status(400).json({
        error:
          'title and message are required.',
      });

      return;
    }

    const notificationType =
      type === 'transaction' ||
      type === 'promo' ||
      type === 'system' ||
      type === 'security'
        ? type
        : 'system';

    await createNotification(
      req.session.userId!,
      {
        title,
        body: message,
        type:
          notificationType,
      },
    );

    res.status(201).json({
      ok: true,
    });
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

    try {
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

            const nextBalance =
              Number(
                wallet.balance,
              ) +
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
                    'wallet_fund',
                  service:
                    'Wallet Funding',
                  provider:
                    typeof provider ===
                      'string' &&
                    provider.trim()
                      ? provider.trim()
                      : 'Wallet',
                  amount:
                    amountString,
                  reference:
                    typeof reference ===
                      'string'
                      ? reference
                      : null,
                  status:
                    'success',
                  description:
                    typeof provider ===
                      'string' &&
                    provider.trim()
                      ? `Wallet funding via ${provider.trim()}`
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
        balanceAfter:
          result.balance,
        transaction:
          result.transaction,
      });
    } catch (err: unknown) {
      logger.error(
        {
          err,
          userId,
        },
        'Wallet funding failed',
      );

      res.status(500).json({
        error:
          'Wallet funding failed.',
      });
    }
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

    try {
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
              const error =
                new Error(
                  'Insufficient wallet balance.',
                );

              (
                error as Error & {
                  code?: string;
                }
              ).code =
                'INSUFFICIENT_BALANCE';

              throw error;
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

                  /*
                   * The current schema does not contain a wallet_spend
                   * transaction enum member. wallet_fund is therefore used
                   * as the schema-safe enum value, while service/description
                   * identify the operation as a wallet spend.
                   */
                  type:
                    'wallet_fund',

                  service:
                    'Wallet Spend',

                  provider:
                    'Wallet',

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
                    'success',

                  description:
                    typeof description ===
                        'string' &&
                    description.trim()
                      ? description.trim()
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
        balanceAfter:
          result.balance,
        transaction:
          result.transaction,
      });
    } catch (err: unknown) {
      const error =
        err as {
          code?: string;
          message?: string;
        };

      if (
        error.code ===
        'INSUFFICIENT_BALANCE'
      ) {
        res.status(400).json({
          error:
            'Insufficient wallet balance.',
        });

        return;
      }

      logger.error(
        {
          err,
          userId,
        },
        'Wallet spend failed',
      );

      res.status(500).json({
        error:
          'Wallet spend failed.',
      });
    }
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

/*
 * The current users schema has no passwordHash column.
 * Authentication uses Login PIN / Purchase PIN.
 */
router.post(
  '/change-password',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    res.status(410).json({
      error:
        'Password authentication is not enabled. Use the Login PIN endpoint instead.',
      code:
        'PASSWORD_AUTH_NOT_SUPPORTED',
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
      typeof token !==
        'string' ||
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
