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
      )
      .limit(1);

    if (!user) {
      res.status(404).json({
        error: 'User not found',
      });

      return;
    }

    res.json({
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      name:
        `${user.firstName} ${user.lastName}`.trim(),
      username: user.username,
      email: user.email,
      phone: user.phone,
      accountNumber:
        user.accountNumber,
      bankName:
        user.bankName,
      referralCode:
        user.referralCode,
      kycStatus:
        user.kycStatus,
      status:
        user.status,
      createdAt:
        user.createdAt,
      updatedAt:
        user.updatedAt,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* PUT /api/user/profile                                                      */
/* -------------------------------------------------------------------------- */

router.put(
  '/profile',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const firstName =
      typeof req.body?.firstName === 'string'
        ? req.body.firstName.trim()
        : undefined;

    const lastName =
      typeof req.body?.lastName === 'string'
        ? req.body.lastName.trim()
        : undefined;

    const email =
      typeof req.body?.email === 'string'
        ? req.body.email.trim().toLowerCase()
        : undefined;

    const phone =
      typeof req.body?.phone === 'string'
        ? req.body.phone.trim()
        : undefined;

    const updates: Record<
      string,
      unknown
    > = {};

    if (firstName !== undefined) {
      updates.firstName =
        firstName;
    }

    if (lastName !== undefined) {
      updates.lastName =
        lastName;
    }

    if (email !== undefined) {
      updates.email =
        email;
    }

    if (phone !== undefined) {
      updates.phone =
        phone;
    }

    if (
      Object.keys(updates).length === 0
    ) {
      res.status(400).json({
        error:
          'No valid profile fields supplied.',
      });

      return;
    }

    updates.updatedAt =
      new Date();

    const [updated] =
      await db
        .update(usersTable)
        .set(
          updates as any,
        )
        .where(
          eq(
            usersTable.id,
            userId,
          ),
        )
        .returning();

    if (!updated) {
      res.status(404).json({
        error:
          'User not found.',
      });

      return;
    }

    res.json({
      ok: true,
      user: {
        id: updated.id,
        firstName:
          updated.firstName,
        lastName:
          updated.lastName,
        name:
          `${updated.firstName} ${updated.lastName}`.trim(),
        username:
          updated.username,
        email:
          updated.email,
        phone:
          updated.phone,
        accountNumber:
          updated.accountNumber,
        bankName:
          updated.bankName,
        referralCode:
          updated.referralCode,
        kycStatus:
          updated.kycStatus,
        status:
          updated.status,
        createdAt:
          updated.createdAt,
        updatedAt:
          updated.updatedAt,
      },
    });
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/check-pin                                                   */
/* -------------------------------------------------------------------------- */

router.post(
  '/check-pin',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const pin =
      req.body?.pin;

    if (!isValidPin(pin)) {
      res.status(400).json({
        error:
          `PIN must be exactly ${PIN_LENGTH} digits.`,
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
            userId,
          ),
        )
        .limit(1);

    if (!user) {
      res.status(404).json({
        error:
          'User not found.',
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
/* POST /api/user/check-purchase-pin                                          */
/* -------------------------------------------------------------------------- */

router.post(
  '/check-purchase-pin',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const pin =
      req.body?.pin;

    if (!isValidPurchasePin(pin)) {
      res.status(400).json({
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
            userId,
          ),
        )
        .limit(1);

    if (!user) {
      res.status(404).json({
        error:
          'User not found.',
      });

      return;
    }

    if (!user.purchasePinHash) {
      res.json({
        valid: false,
      });

      return;
    }

    const valid =
      await verifyPin(
        pin,
        user.purchasePinHash,
      );

    res.json({
      valid,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* PUT /api/user/pin                                                          */
/* -------------------------------------------------------------------------- */

router.put(
  '/pin',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const currentPin =
      req.body?.currentPin;

    const newPin =
      req.body?.newPin;

    if (!isValidPin(currentPin)) {
      res.status(400).json({
        error:
          `Current PIN must be exactly ${PIN_LENGTH} digits.`,
      });

      return;
    }

    if (!isValidPin(newPin)) {
      res.status(400).json({
        error:
          `New PIN must be exactly ${PIN_LENGTH} digits.`,
      });

      return;
    }

    if (currentPin === newPin) {
      res.status(400).json({
        error:
          'New PIN must be different from current PIN.',
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
            userId,
          ),
        )
        .limit(1);

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
      res.status(400).json({
        error:
          'Current PIN is incorrect.',
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

    res.json({
      ok: true,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* PUT /api/user/purchase-pin                                                 */
/* -------------------------------------------------------------------------- */

router.put(
  '/purchase-pin',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const currentPin =
      req.body?.currentPin;

    const newPin =
      req.body?.newPin;

    if (!isValidPurchasePin(currentPin)) {
      res.status(400).json({
        error:
          `Current purchase PIN must be exactly ${PURCHASE_PIN_LENGTH} digits.`,
      });

      return;
    }

    if (!isValidPurchasePin(newPin)) {
      res.status(400).json({
        error:
          `New purchase PIN must be exactly ${PURCHASE_PIN_LENGTH} digits.`,
      });

      return;
    }

    if (currentPin === newPin) {
      res.status(400).json({
        error:
          'New purchase PIN must be different from current PIN.',
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
        )
        .limit(1);

    if (!user) {
      res.status(404).json({
        error:
          'User not found.',
      });

      return;
    }

    if (!user.purchasePinHash) {
      res.status(400).json({
        error:
          'Purchase PIN is not set.',
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
          'Current purchase PIN is incorrect.',
      });

      return;
    }

    const newHash =
      await hashPin(newPin);

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

    res.json({
      ok: true,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* PUT /api/user/change-username                                               */
/* -------------------------------------------------------------------------- */

router.put(
  '/change-username',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const username =
      typeof req.body?.username === 'string'
        ? req.body.username.trim().toLowerCase()
        : '';

    if (
      !username ||
      username.length < 3 ||
      username.length > 30
    ) {
      res.status(400).json({
        error:
          'Username must be between 3 and 30 characters.',
      });

      return;
    }

    if (
      !/^[a-z0-9._-]+$/.test(
        username,
      )
    ) {
      res.status(400).json({
        error:
          'Username contains invalid characters.',
      });

      return;
    }

    const [existing] =
      await db
        .select({
          id:
            usersTable.id,
          username:
            usersTable.username,
        })
        .from(usersTable)
        .where(
          eq(
            usersTable.username,
            username,
          ),
        )
        .limit(1);

    if (
      existing &&
      existing.id !== userId
    ) {
      res.status(409).json({
        error:
          'Username is already taken.',
      });

      return;
    }

    const now =
      new Date();

    await db
      .update(usersTable)
      .set({
        username,
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
          username,
      },
      'Username changed',
    );

    res.json({
      ok: true,
      username,
      usernameChangedAt:
        now.toISOString(),
    });
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
    const userId =
      req.session.userId!;

    const [wallet] =
      await db
        .select({
          id:
            walletsTable.id,
          balance:
            walletsTable.balance,
          updatedAt:
            walletsTable.updatedAt,
        })
        .from(walletsTable)
        .where(
          eq(
            walletsTable.userId,
            userId,
          ),
        )
        .limit(1);

    if (!wallet) {
      res.status(404).json({
        error:
          'Wallet not found.',
      });

      return;
    }

    res.json({
      id:
        wallet.id,
      balance:
        Number(wallet.balance),
      updatedAt:
        wallet.updatedAt,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* GET /api/user/transactions                                                */
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

    res.json({
      transactions:
        rows.map(
          (row) => ({
            id:
              row.id,
            type:
              row.type,
            service:
              row.service,
            provider:
              row.provider,
            amount:
              Number(row.amount),
            status:
              row.status,
            reference:
              row.reference,
            description:
              row.description,
            paymentMethod:
              row.paymentMethod,
            metadata:
              row.metadata,
            createdAt:
              row.createdAt,
          }),
        ),
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
        )
        : 50;

    const rows =
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
        .orderBy(
          notificationsTable.createdAt,
        )
        .limit(limit);

    res.json({
      notifications:
        rows,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/notifications/:id/read                                       */
/* -------------------------------------------------------------------------- */

router.post(
  '/notifications/:id/read',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      req.session.userId!;

    const notificationId =
      String(
        req.params.id,
      );

    await db
      .update(
        notificationsTable,
      )
      .set({
        readAt:
          new Date(),
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
        readAt:
          new Date(),
      })
      .where(
        eq(
          notificationsTable.userId,
          userId,
        ),
      );

    res.json({
      ok: true,
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
    const userId =
      req.session.userId!;

    const [preferences] =
      await db
        .select()
        .from(
          userPreferencesTable,
        )
        .where(
          eq(
            userPreferencesTable.userId,
            userId,
          ),
        )
        .limit(1);

    if (!preferences) {
      res.json({
        preferences: null,
      });

      return;
    }

    res.json({
      preferences,
    });
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

    const body =
      req.body ?? {};

    const [existing] =
      await db
        .select()
        .from(
          userPreferencesTable,
        )
        .where(
          eq(
            userPreferencesTable.userId,
            userId,
          ),
        )
        .limit(1);

    if (existing) {
      const [updated] =
        await db
          .update(
            userPreferencesTable,
          )
          .set({
            ...body,
            updatedAt:
              new Date(),
          })
          .where(
            eq(
              userPreferencesTable.userId,
              userId,
            ),
          )
          .returning();

      res.json({
        preferences:
          updated,
      });

      return;
    }

    const [created] =
      await db
        .insert(
          userPreferencesTable,
        )
        .values({
          userId,
          ...body,
        })
        .returning();

    res.json({
      preferences:
        created,
    });
  },
);

/* -------------------------------------------------------------------------- */
/* POST /api/user/notification-test                                            */
/* -------------------------------------------------------------------------- */

router.post(
  '/notification-test',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId =
        req.session.userId!;

      const title =
        typeof req.body?.title === 'string'
          ? req.body.title.trim()
          : 'Test notification';

      const message =
        typeof req.body?.message === 'string'
          ? req.body.message.trim()
          : 'This is a test notification.';

      await createNotification({
        userId,
        title,
        message,
        type:
          'system',
      });

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        {
          err,
          userId:
            req.session.userId,
        },
        'Failed to create test notification',
      );

      res.status(500).json({
        error:
          'Failed to create notification.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Export                                                                      */
/* -------------------------------------------------------------------------- */

export default router;
