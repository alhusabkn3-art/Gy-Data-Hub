import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import { db } from '@workspace/db';

import {
  usersTable,
  adminAccountsTable,
  adminAuditLogsTable,
  type InsertAdminAccount,
} from '@workspace/db/schema';

import { sql, eq } from 'drizzle-orm';

import {
  hashPin,
  verifyPin,
} from '../lib/auth.js';

import { logger } from '../lib/logger.js';

const router = Router();

const BOOTSTRAP_EMAIL = (
  process.env['ADMIN_EMAIL'] ?? 'sadmin@gyd.com'
)
  .trim()
  .toLowerCase();

const BOOTSTRAP_PIN = (
  process.env['ADMIN_PIN'] ?? '1251'
).trim();

const MIN_BOOTSTRAP_PIN_LENGTH = 4;

function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session.isAdmin) {
    res.status(401).json({
      error: 'Admin authentication required.',
    });
    return;
  }

  next();
}

function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session.isAdmin) {
    res.status(401).json({
      error: 'Admin authentication required.',
    });
    return;
  }

  if (req.session.adminRole !== 'super_admin') {
    res.status(403).json({
      error: 'Super Admin access required.',
    });
    return;
  }

  next();
}

function clientIp(
  req: Request,
): string | null {
  const forwarded =
    req.headers['x-forwarded-for'];

  if (typeof forwarded === 'string') {
    return forwarded
      .split(',')[0]
      .trim();
  }

  if (
    Array.isArray(forwarded) &&
    forwarded.length > 0
  ) {
    return forwarded[0];
  }

  return req.ip ?? null;
}

async function auditLog(opts: {
  adminId: string;
  adminEmail: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  targetLabel?: string | null;
  details?: unknown;
  ip?: string | null;
}): Promise<void> {
  try {
    await db.insert(adminAuditLogsTable).values({
      adminId: opts.adminId,
      adminEmail: opts.adminEmail,
      action: opts.action,
      targetType: opts.targetType ?? null,
      targetId: opts.targetId ?? null,
      targetLabel: opts.targetLabel ?? null,
      details: opts.details ?? null,
      ip: opts.ip ?? null,
    });
  } catch (err) {
    logger.error(
      { err },
      'Failed to write admin audit log',
    );
  }
}

/**
 * Ensures the bootstrap Super Admin account exists and is synchronized
 * with ADMIN_EMAIL / ADMIN_PIN.
 *
 * The bootstrap account is deliberately treated as the source of truth
 * for the initial Super Admin credentials.
 */
export async function ensureSuperAdmin(): Promise<void> {
  if (
    !BOOTSTRAP_EMAIL ||
    BOOTSTRAP_PIN.length <
      MIN_BOOTSTRAP_PIN_LENGTH
  ) {
    throw new Error(
      'Invalid bootstrap super admin configuration.',
    );
  }

  const existing = await db
    .select({
      id: adminAccountsTable.id,
      email: adminAccountsTable.email,
      role: adminAccountsTable.role,
      status: adminAccountsTable.status,
    })
    .from(adminAccountsTable)
    .where(
      sql`LOWER(${adminAccountsTable.email}) = ${BOOTSTRAP_EMAIL}`,
    )
    .limit(1);

  const pinHash = await hashPin(
    BOOTSTRAP_PIN,
  );

  if (existing.length > 0) {
    const existingAdmin =
      existing[0];

    await db
      .update(adminAccountsTable)
      .set({
        pinHash,
        role: 'super_admin',
        status: 'active',
        updatedAt: new Date(),
      })
      .where(
        eq(
          adminAccountsTable.id,
          existingAdmin.id,
        ),
      );

    logger.info(
      {
        email: BOOTSTRAP_EMAIL,
      },
      'Bootstrap super admin synchronized',
    );

    return;
  }

  const values: InsertAdminAccount = {
    name: 'Super Admin',
    email: BOOTSTRAP_EMAIL,
    pinHash,
    role: 'super_admin',
    status: 'active',
  };

  await db
    .insert(adminAccountsTable)
    .values(values);

  logger.info(
    {
      email: BOOTSTRAP_EMAIL,
    },
    'Bootstrap super admin created',
  );
}

/*
 * POST /api/admin/login
 *
 * Bootstrap Super Admin authentication:
 *
 * ADMIN_EMAIL + ADMIN_PIN are the authoritative credentials.
 *
 * The database bcrypt hash is synchronized on every bootstrap login
 * attempt, but the submitted bootstrap PIN is checked directly against
 * the configured ADMIN_PIN. This prevents a stale/corrupt database hash
 * from locking out the configured Super Admin.
 */
router.post(
  '/login',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const email =
        typeof req.body?.email === 'string'
          ? req.body.email
              .trim()
              .toLowerCase()
          : '';

      const pin =
        typeof req.body?.pin === 'string'
          ? req.body.pin.trim()
          : '';

      if (!email || !pin) {
        res.status(400).json({
          error:
            'Email and PIN are required.',
        });
        return;
      }

      const isBootstrapAccount =
        email === BOOTSTRAP_EMAIL;

      /*
       * SUPER ADMIN LOGIN
       *
       * Do not use the database bcrypt hash as the authority for the
       * bootstrap account. ADMIN_EMAIL and ADMIN_PIN are authoritative.
       */
      if (isBootstrapAccount) {
        if (
          BOOTSTRAP_PIN.length <
          MIN_BOOTSTRAP_PIN_LENGTH
        ) {
          logger.error(
            {
              email: BOOTSTRAP_EMAIL,
              pinConfigured:
                Boolean(BOOTSTRAP_PIN),
              configuredPinLength:
                BOOTSTRAP_PIN.length,
            },
            'Invalid bootstrap Super Admin configuration',
          );

          res.status(500).json({
            error:
              'Super Admin authentication is not configured correctly.',
          });
          return;
        }

        /*
         * Always synchronize the database account before authenticating.
         */
        await ensureSuperAdmin();

        /*
         * The environment PIN is the source of truth.
         */
        if (pin !== BOOTSTRAP_PIN) {
          logger.warn(
            {
              email,
              bootstrapAccount: true,
              submittedPinLength:
                pin.length,
              configuredPinLength:
                BOOTSTRAP_PIN.length,
            },
            'Admin login rejected: bootstrap PIN mismatch',
          );

          res.status(401).json({
            error: 'Invalid credentials.',
          });
          return;
        }

        /*
         * Load the synchronized Super Admin account.
         */
        const result = await db
          .select({
            id: adminAccountsTable.id,
            name: adminAccountsTable.name,
            email: adminAccountsTable.email,
            role: adminAccountsTable.role,
            status:
              adminAccountsTable.status,
          })
          .from(adminAccountsTable)
          .where(
            sql`LOWER(${adminAccountsTable.email}) = ${BOOTSTRAP_EMAIL}`,
          )
          .limit(1);

        const admin = result[0];

        if (!admin) {
          logger.error(
            {
              email:
                BOOTSTRAP_EMAIL,
            },
            'Bootstrap Super Admin account missing after synchronization',
          );

          res.status(500).json({
            error:
              'Super Admin account initialization failed.',
          });
          return;
        }

        /*
         * Ensure the session is always created as Super Admin.
         */
        req.session.isAdmin = true;
        req.session.adminId = admin.id;
        req.session.adminEmail =
          admin.email;
        req.session.adminRole =
          'super_admin';

        /*
         * Explicitly persist the session before responding.
         */
        await new Promise<void>(
          (resolve, reject) => {
            req.session.save(
              (err) => {
                if (err) {
                  reject(err);
                  return;
                }

                resolve();
              },
            );
          },
        );

        await auditLog({
          adminId: admin.id,
          adminEmail: admin.email,
          action: 'admin_login',
          targetType: 'admin',
          targetId: admin.id,
          targetLabel: admin.email,
          ip: clientIp(req),
        });

        logger.info(
          {
            email: admin.email,
            role: 'super_admin',
          },
          'Bootstrap Super Admin login successful',
        );

        res.json({
          ok: true,
          admin: {
            id: admin.id,
            name: admin.name,
            email: admin.email,
            role: 'super_admin',
          },
        });

        return;
      }

      /*
       * NORMAL ADMIN LOGIN
       *
       * Non-bootstrap administrators continue to authenticate using
       * their stored bcrypt PIN hash.
       */
      const result = await db
        .select({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          pinHash:
            adminAccountsTable.pinHash,
          role: adminAccountsTable.role,
          status:
            adminAccountsTable.status,
        })
        .from(adminAccountsTable)
        .where(
          sql`LOWER(${adminAccountsTable.email}) = ${email}`,
        )
        .limit(1);

      const admin = result[0];

      if (!admin) {
        logger.warn(
          {
            email,
            bootstrapAccount: false,
          },
          'Admin login rejected: account not found',
        );

        res.status(401).json({
          error: 'Invalid credentials.',
        });
        return;
      }

      if (
        admin.status !== 'active'
      ) {
        res.status(403).json({
          error:
            'Admin account is not active.',
        });
        return;
      }

      const valid =
        await verifyPin(
          pin,
          admin.pinHash,
        );

      if (!valid) {
        logger.warn(
          {
            email,
            bootstrapAccount: false,
          },
          'Admin login rejected: invalid PIN',
        );

        res.status(401).json({
          error: 'Invalid credentials.',
        });
        return;
      }

      req.session.isAdmin = true;
      req.session.adminId = admin.id;
      req.session.adminEmail =
        admin.email;
      req.session.adminRole =
        admin.role;

      await new Promise<void>(
        (resolve, reject) => {
          req.session.save(
            (err) => {
              if (err) {
                reject(err);
                return;
              }

              resolve();
            },
          );
        },
      );

      await auditLog({
        adminId: admin.id,
        adminEmail: admin.email,
        action: 'admin_login',
        targetType: 'admin',
        targetId: admin.id,
        targetLabel: admin.email,
        ip: clientIp(req),
      });

      logger.info(
        {
          email: admin.email,
          role: admin.role,
        },
        'Admin login successful',
      );

      res.json({
        ok: true,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
        },
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/login failed',
      );

      res.status(500).json({
        error: 'Failed to login.',
      });
    }
  },
);

router.post(
  '/logout',
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const adminId =
        req.session.adminId;

      const adminEmail =
        req.session.adminEmail;

      if (
        adminId &&
        adminEmail
      ) {
        await auditLog({
          adminId,
          adminEmail,
          action: 'admin_logout',
          targetType: 'admin',
          targetId: adminId,
          targetLabel: adminEmail,
          ip: clientIp(req),
        });
      }

      await new Promise<void>(
        (resolve, reject) => {
          req.session.destroy(
            (err) => {
              if (err) {
                reject(err);
                return;
              }

              resolve();
            },
          );
        },
      );

      res.clearCookie(
        'gyd_sid',
        {
          httpOnly: true,
          sameSite: 'lax',
          secure:
            process.env['NODE_ENV'] ===
            'production',
        },
      );

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/logout failed',
      );

      res.status(500).json({
        error: 'Failed to logout.',
      });
    }
  },
);

router.get(
  '/me',
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const adminId =
        req.session.adminId;

      if (!adminId) {
        res.status(401).json({
          error:
            'Admin authentication required.',
        });
        return;
      }

      const result = await db
        .select({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status:
            adminAccountsTable.status,
        })
        .from(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.id,
            adminId,
          ),
        )
        .limit(1);

      const admin = result[0];

      if (!admin) {
        req.session.destroy(
          () => undefined,
        );

        res.status(401).json({
          error:
            'Admin authentication required.',
        });
        return;
      }

      if (
        admin.status !== 'active'
      ) {
        req.session.destroy(
          () => undefined,
        );

        res.status(403).json({
          error:
            'Admin account is not active.',
        });
        return;
      }

      res.json({
        ok: true,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: admin.role,
          status: admin.status,
        },
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/me failed',
      );

      res.status(500).json({
        error:
          'Failed to load admin session.',
      });
    }
  },
);

router.get(
  '/stats',
  requireAdmin,
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const [
        totalUsers,
        activeUsers,
        totalAdmins,
        totalTransactions,
      ] = await Promise.all([
        db
          .select({
            count:
              sql<number>`count(*)`,
          })
          .from(usersTable),

        db
          .select({
            count:
              sql<number>`count(*)`,
          })
          .from(usersTable)
          .where(
            sql`${usersTable.status} = 'active'`,
          ),

        db
          .select({
            count:
              sql<number>`count(*)`,
          })
          .from(
            adminAccountsTable,
          ),

        db
          .select({
            count:
              sql<number>`count(*)`,
          })
          .from(
            adminAuditLogsTable,
          ),
      ]);

      res.json({
        ok: true,
        stats: {
          totalUsers:
            Number(
              totalUsers[0]?.count ?? 0,
            ),
          activeUsers:
            Number(
              activeUsers[0]?.count ?? 0,
            ),
          totalAdmins:
            Number(
              totalAdmins[0]?.count ?? 0,
            ),
          totalTransactions:
            Number(
              totalTransactions[0]
                ?.count ?? 0,
            ),
        },
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/stats failed',
      );

      res.status(500).json({
        error:
          'Failed to load admin statistics.',
      });
    }
  },
);

router.get(
  '/accounts',
  requireSuperAdmin,
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const admins = await db
        .select({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email:
            adminAccountsTable.email,
          role: adminAccountsTable.role,
          status:
            adminAccountsTable.status,
          createdAt:
            adminAccountsTable.createdAt,
          updatedAt:
            adminAccountsTable.updatedAt,
        })
        .from(
          adminAccountsTable,
        )
        .orderBy(
          sql`${adminAccountsTable.createdAt} DESC`,
        );

      res.json({
        ok: true,
        admins,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/accounts list failed',
      );

      res.status(500).json({
        error:
          'Failed to load admin accounts.',
      });
    }
  },
);

router.post(
  '/accounts',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const name =
        typeof req.body?.name ===
        'string'
          ? req.body.name.trim()
          : '';

      const email =
        typeof req.body?.email ===
        'string'
          ? req.body.email
              .trim()
              .toLowerCase()
          : '';

      const pin =
        typeof req.body?.pin ===
        'string'
          ? req.body.pin.trim()
          : '';

      const role =
        req.body?.role ===
        'super_admin'
          ? 'super_admin'
          : 'admin';

      if (
        !name ||
        !email ||
        !pin
      ) {
        res.status(400).json({
          error:
            'Name, email and PIN are required.',
        });
        return;
      }

      if (
        pin.length <
        MIN_BOOTSTRAP_PIN_LENGTH
      ) {
        res.status(400).json({
          error:
            'PIN must contain at least 4 characters.',
        });
        return;
      }

      if (
        email === BOOTSTRAP_EMAIL
      ) {
        res.status(400).json({
          error:
            'The bootstrap Super Admin account cannot be recreated.',
        });
        return;
      }

      const existing = await db
        .select({
          id: adminAccountsTable.id,
        })
        .from(
          adminAccountsTable,
        )
        .where(
          sql`LOWER(${adminAccountsTable.email}) = ${email}`,
        )
        .limit(1);

      if (existing.length > 0) {
        res.status(409).json({
          error:
            'An admin account with this email already exists.',
        });
        return;
      }

      const pinHash =
        await hashPin(pin);

      const values: InsertAdminAccount =
        {
          name,
          email,
          pinHash,
          role,
          status: 'active',
        };

      const inserted =
        await db
          .insert(
            adminAccountsTable,
          )
          .values(values)
          .returning({
            id: adminAccountsTable.id,
            name:
              adminAccountsTable.name,
            email:
              adminAccountsTable.email,
            role:
              adminAccountsTable.role,
            status:
              adminAccountsTable.status,
          });

      const created =
        inserted[0];

      if (!created) {
        res.status(500).json({
          error:
            'Failed to create admin account.',
        });
        return;
      }

      const actorId =
        req.session.adminId;

      const actorEmail =
        req.session.adminEmail;

      if (
        actorId &&
        actorEmail
      ) {
        await auditLog({
          adminId: actorId,
          adminEmail: actorEmail,
          action:
            'admin_account_created',
          targetType: 'admin',
          targetId: created.id,
          targetLabel: created.email,
          ip: clientIp(req),
          details: {
            role: created.role,
          },
        });
      }

      res.status(201).json({
        ok: true,
        admin: created,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/account creation failed',
      );

      res.status(500).json({
        error:
          'Failed to create admin account.',
      });
    }
  },
);

router.patch(
  '/accounts/:id',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const id =
        req.params.id;

      if (!id) {
        res.status(400).json({
          error:
            'Admin account ID is required.',
        });
        return;
      }

      const existing =
        await db
          .select({
            id:
              adminAccountsTable.id,
            name:
              adminAccountsTable.name,
            email:
              adminAccountsTable.email,
            role:
              adminAccountsTable.role,
            status:
              adminAccountsTable.status,
          })
          .from(
            adminAccountsTable,
          )
          .where(
            eq(
              adminAccountsTable.id,
              id,
            ),
          )
          .limit(1);

      const current =
        existing[0];

      if (!current) {
        res.status(404).json({
          error:
            'Admin account not found.',
        });
        return;
      }

      if (
        current.email
          .trim()
          .toLowerCase() ===
        BOOTSTRAP_EMAIL
      ) {
        res.status(400).json({
          error:
            'The bootstrap Super Admin account cannot be modified here.',
        });
        return;
      }

      const updates: {
        name?: string;
        email?: string;
        role?:
          | 'admin'
          | 'super_admin';
        updatedAt: Date;
      } = {
        updatedAt: new Date(),
      };

      if (
        typeof req.body?.name ===
        'string'
      ) {
        const name =
          req.body.name.trim();

        if (name) {
          updates.name = name;
        }
      }

      if (
        typeof req.body?.email ===
        'string'
      ) {
        const email =
          req.body.email
            .trim()
            .toLowerCase();

        if (!email) {
          res.status(400).json({
            error:
              'Email cannot be empty.',
          });
          return;
        }

        const duplicate =
          await db
            .select({
              id:
                adminAccountsTable.id,
            })
            .from(
              adminAccountsTable,
            )
            .where(
              sql`LOWER(${adminAccountsTable.email}) = ${email} AND ${adminAccountsTable.id} <> ${id}`,
            )
            .limit(1);

        if (
          duplicate.length > 0
        ) {
          res.status(409).json({
            error:
              'Another admin account already uses this email.',
          });
          return;
        }

        updates.email = email;
      }

      if (
        req.body?.role ===
        'admin' ||
        req.body?.role ===
        'super_admin'
      ) {
        updates.role =
          req.body.role;
      }

      await db
        .update(
          adminAccountsTable,
        )
        .set(updates)
        .where(
          eq(
            adminAccountsTable.id,
            id,
          ),
        );

      const actorId =
        req.session.adminId;

      const actorEmail =
        req.session.adminEmail;

      if (
        actorId &&
        actorEmail
      ) {
        await auditLog({
          adminId: actorId,
          adminEmail: actorEmail,
          action:
            'admin_account_updated',
          targetType: 'admin',
          targetId: id,
          targetLabel:
            updates.email ??
            current.email,
          ip: clientIp(req),
          details: {
            updates,
          },
        });
      }

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/account update failed',
      );

      res.status(500).json({
        error:
          'Failed to update admin account.',
      });
    }
  },
);

router.post(
  '/accounts/:id/change-pin',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const id =
        req.params.id;

      const newPin =
        typeof req.body?.newPin ===
        'string'
          ? req.body.newPin.trim()
          : '';

      if (!id || !newPin) {
        res.status(400).json({
          error:
            'Admin account ID and new PIN are required.',
        });
        return;
      }

      if (
        newPin.length <
        MIN_BOOTSTRAP_PIN_LENGTH
      ) {
        res.status(400).json({
          error:
            'PIN must contain at least 4 characters.',
        });
        return;
      }

      const existing =
        await db
          .select({
            id:
              adminAccountsTable.id,
            email:
              adminAccountsTable.email,
          })
          .from(
            adminAccountsTable,
          )
          .where(
            eq(
              adminAccountsTable.id,
              id,
            ),
          )
          .limit(1);

      const admin =
        existing[0];

      if (!admin) {
        res.status(404).json({
          error:
            'Admin account not found.',
        });
        return;
      }

      if (
        admin.email
          .trim()
          .toLowerCase() ===
        BOOTSTRAP_EMAIL
      ) {
        res.status(400).json({
          error:
            'The bootstrap Super Admin PIN is controlled by ADMIN_PIN.',
        });
        return;
      }

      const pinHash =
        await hashPin(newPin);

      await db
        .update(
          adminAccountsTable,
        )
        .set({
          pinHash,
          updatedAt:
            new Date(),
        })
        .where(
          eq(
            adminAccountsTable.id,
            id,
          ),
        );

      const actorId =
        req.session.adminId;

      const actorEmail =
        req.session.adminEmail;

      if (
        actorId &&
        actorEmail
      ) {
        await auditLog({
          adminId: actorId,
          adminEmail: actorEmail,
          action:
            'admin_pin_changed',
          targetType: 'admin',
          targetId: id,
          targetLabel:
            admin.email,
          ip: clientIp(req),
        });
      }

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin PIN change failed',
      );

      res.status(500).json({
        error:
          'Failed to change admin PIN.',
      });
    }
  },
);

router.post(
  '/accounts/:id/status',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const id =
        req.params.id;

      const status =
        req.body?.status ===
        'active'
          ? 'active'
          : req.body?.status ===
              'disabled'
            ? 'disabled'
            : null;

      if (!id || !status) {
        res.status(400).json({
          error:
            'Admin account ID and valid status are required.',
        });
        return;
      }

      const existing =
        await db
          .select({
            id:
              adminAccountsTable.id,
            email:
              adminAccountsTable.email,
            role:
              adminAccountsTable.role,
          })
          .from(
            adminAccountsTable,
          )
          .where(
            eq(
              adminAccountsTable.id,
              id,
            ),
          )
          .limit(1);

      const admin =
        existing[0];

      if (!admin) {
        res.status(404).json({
          error:
            'Admin account not found.',
        });
        return;
      }

      if (
        admin.email
          .trim()
          .toLowerCase() ===
        BOOTSTRAP_EMAIL
      ) {
        res.status(400).json({
          error:
            'The bootstrap Super Admin cannot be disabled.',
        });
        return;
      }

      await db
        .update(
          adminAccountsTable,
        )
        .set({
          status,
          updatedAt:
            new Date(),
        })
        .where(
          eq(
            adminAccountsTable.id,
            id,
          ),
        );

      const actorId =
        req.session.adminId;

      const actorEmail =
        req.session.adminEmail;

      if (
        actorId &&
        actorEmail
      ) {
        await auditLog({
          adminId: actorId,
          adminEmail: actorEmail,
          action:
            'admin_status_changed',
          targetType: 'admin',
          targetId: id,
          targetLabel:
            admin.email,
          ip: clientIp(req),
          details: {
            status,
          },
        });
      }

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin status change failed',
      );

      res.status(500).json({
        error:
          'Failed to update admin status.',
      });
    }
  },
);

router.delete(
  '/accounts/:id',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const id =
        req.params.id;

      if (!id) {
        res.status(400).json({
          error:
            'Admin account ID is required.',
        });
        return;
      }

      const existing =
        await db
          .select({
            id:
              adminAccountsTable.id,
            email:
              adminAccountsTable.email,
          })
          .from(
            adminAccountsTable,
          )
          .where(
            eq(
              adminAccountsTable.id,
              id,
            ),
          )
          .limit(1);

      const admin =
        existing[0];

      if (!admin) {
        res.status(404).json({
          error:
            'Admin account not found.',
        });
        return;
      }

      if (
        admin.email
          .trim()
          .toLowerCase() ===
        BOOTSTRAP_EMAIL
      ) {
        res.status(400).json({
          error:
            'The bootstrap Super Admin account cannot be deleted.',
        });
        return;
      }

      await db
        .delete(
          adminAccountsTable,
        )
        .where(
          eq(
            adminAccountsTable.id,
            id,
          ),
        );

      const actorId =
        req.session.adminId;

      const actorEmail =
        req.session.adminEmail;

      if (
        actorId &&
        actorEmail
      ) {
        await auditLog({
          adminId: actorId,
          adminEmail: actorEmail,
          action:
            'admin_account_deleted',
          targetType: 'admin',
          targetId: id,
          targetLabel:
            admin.email,
          ip: clientIp(req),
        });
      }

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin account deletion failed',
      );

      res.status(500).json({
        error:
          'Failed to delete admin account.',
      });
    }
  },
);

router.get(
  '/audit-logs',
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const rawPage =
        Number(
          req.query.page ?? 1,
        );

      const rawLimit =
        Number(
          req.query.limit ?? 50,
        );

      const page =
        Number.isFinite(
          rawPage,
        ) && rawPage > 0
          ? Math.floor(rawPage)
          : 1;

      const limit =
        Number.isFinite(
          rawLimit,
        ) &&
        rawLimit > 0
          ? Math.min(
              Math.floor(rawLimit),
              200,
            )
          : 50;

      const offset =
        (page - 1) * limit;

      const search =
        typeof req.query.search ===
        'string'
          ? req.query.search.trim()
          : '';

      const whereClause =
        search
          ? sql`(
              LOWER(${adminAuditLogsTable.adminEmail}) LIKE ${`%${search.toLowerCase()}%`}
              OR
              LOWER(${adminAuditLogsTable.action}) LIKE ${`%${search.toLowerCase()}%`}
              OR
              LOWER(COALESCE(${adminAuditLogsTable.targetLabel}, '')) LIKE ${`%${search.toLowerCase()}%`}
            )`
          : undefined;

      const rows =
        whereClause
          ? await db
              .select({
                id:
                  adminAuditLogsTable.id,
                adminId:
                  adminAuditLogsTable.adminId,
                adminEmail:
                  adminAuditLogsTable.adminEmail,
                action:
                  adminAuditLogsTable.action,
                targetType:
                  adminAuditLogsTable.targetType,
                targetId:
                  adminAuditLogsTable.targetId,
                targetLabel:
                  adminAuditLogsTable.targetLabel,
                details:
                  adminAuditLogsTable.details,
                ip:
                  adminAuditLogsTable.ip,
                createdAt:
                  adminAuditLogsTable.createdAt,
              })
              .from(
                adminAuditLogsTable,
              )
              .where(
                whereClause,
              )
              .orderBy(
                sql`${adminAuditLogsTable.createdAt} DESC`,
              )
              .limit(limit)
              .offset(offset)
          : await db
              .select({
                id:
                  adminAuditLogsTable.id,
                adminId:
                  adminAuditLogsTable.adminId,
                adminEmail:
                  adminAuditLogsTable.adminEmail,
                action:
                  adminAuditLogsTable.action,
                targetType:
                  adminAuditLogsTable.targetType,
                targetId:
                  adminAuditLogsTable.targetId,
                targetLabel:
                  adminAuditLogsTable.targetLabel,
                details:
                  adminAuditLogsTable.details,
                ip:
                  adminAuditLogsTable.ip,
                createdAt:
                  adminAuditLogsTable.createdAt,
              })
              .from(
                adminAuditLogsTable,
              )
              .orderBy(
                sql`${adminAuditLogsTable.createdAt} DESC`,
              )
              .limit(limit)
              .offset(offset);

      const totalResult =
        whereClause
          ? await db
              .select({
                count:
                  sql<number>`count(*)`,
              })
              .from(
                adminAuditLogsTable,
              )
              .where(
                whereClause,
              )
          : await db
              .select({
                count:
                  sql<number>`count(*)`,
              })
              .from(
                adminAuditLogsTable,
              );

      const total =
        Number(
          totalResult[0]?.count ??
            0,
        );

      res.json({
        ok: true,
        logs: rows,
        total,
        page,
        limit,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin audit logs failed',
      );

      res.status(500).json({
        error:
          'Failed to load audit logs.',
      });
    }
  },
);

router.get(
  '/users',
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const rawPage =
        Number(
          req.query.page ?? 1,
        );

      const rawLimit =
        Number(
          req.query.limit ?? 50,
        );

      const page =
        Number.isFinite(
          rawPage,
        ) && rawPage > 0
          ? Math.floor(rawPage)
          : 1;

      const limit =
        Number.isFinite(
          rawLimit,
        ) &&
        rawLimit > 0
          ? Math.min(
              Math.floor(rawLimit),
              200,
            )
          : 50;

      const offset =
        (page - 1) * limit;

      const search =
        typeof req.query.search ===
        'string'
          ? req.query.search.trim()
          : '';

      const status =
        typeof req.query.status ===
        'string'
          ? req.query.status.trim()
          : '';

      const conditions = [];

      if (search) {
        const value =
          `%${search.toLowerCase()}%`;

        conditions.push(
          sql`(
            LOWER(COALESCE(${usersTable.name}, '')) LIKE ${value}
            OR
            LOWER(COALESCE(${usersTable.email}, '')) LIKE ${value}
            OR
            LOWER(COALESCE(${usersTable.phone}, '')) LIKE ${value}
          )`,
        );
      }

      if (
        status === 'active' ||
        status === 'suspended'
      ) {
        conditions.push(
          sql`${usersTable.status} = ${status}`,
        );
      }

      const whereClause =
        conditions.length > 0
          ? sql.join(
              conditions,
              sql` AND `,
            )
          : undefined;

      const query =
        whereClause
          ? db
              .select({
                id: usersTable.id,
                name: usersTable.name,
                email:
                  usersTable.email,
                phone:
                  usersTable.phone,
                status:
                  usersTable.status,
                createdAt:
                  usersTable.createdAt,
              })
              .from(usersTable)
              .where(
                whereClause,
              )
          : db
              .select({
                id: usersTable.id,
                name: usersTable.name,
                email:
                  usersTable.email,
                phone:
                  usersTable.phone,
                status:
                  usersTable.status,
                createdAt:
                  usersTable.createdAt,
              })
              .from(usersTable);

      const rows =
        await query
          .orderBy(
            sql`${usersTable.createdAt} DESC`,
          )
          .limit(limit)
          .offset(offset);

      const totalResult =
        whereClause
          ? await db
              .select({
                count:
                  sql<number>`count(*)`,
              })
              .from(usersTable)
              .where(
                whereClause,
              )
          : await db
              .select({
                count:
                  sql<number>`count(*)`,
              })
              .from(usersTable);

      const total =
        Number(
          totalResult[0]?.count ??
            0,
        );

      res.json({
        ok: true,
        users: rows,
        total,
        page,
        limit,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin users list failed',
      );

      res.status(500).json({
        error:
          'Failed to load users.',
      });
    }
  },
);

router.patch(
  '/users/:id/status',
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const id =
        req.params.id;

      const status =
        req.body?.status ===
        'active'
          ? 'active'
          : req.body?.status ===
              'suspended'
            ? 'suspended'
            : null;

      if (!id || !status) {
        res.status(400).json({
          error:
            'User ID and valid status are required.',
        });
        return;
      }

      const existing =
        await db
          .select({
            id: usersTable.id,
            email:
              usersTable.email,
            name:
              usersTable.name,
            status:
              usersTable.status,
          })
          .from(usersTable)
          .where(
            eq(
              usersTable.id,
              id,
            ),
          )
          .limit(1);

      const user =
        existing[0];

      if (!user) {
        res.status(404).json({
          error:
            'User not found.',
        });
        return;
      }

      await db
        .update(usersTable)
        .set({
          status,
          updatedAt:
            new Date(),
        })
        .where(
          eq(
            usersTable.id,
            id,
          ),
        );

      const actorId =
        req.session.adminId;

      const actorEmail =
        req.session.adminEmail;

      if (
        actorId &&
        actorEmail
      ) {
        await auditLog({
          adminId: actorId,
          adminEmail: actorEmail,
          action:
            'user_status_changed',
          targetType: 'user',
          targetId: user.id,
          targetLabel:
            user.email ??
            user.name ??
            user.id,
          ip: clientIp(req),
          details: {
            previousStatus:
              user.status,
            newStatus: status,
          },
        });
      }

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin user status update failed',
      );

      res.status(500).json({
        error:
          'Failed to update user status.',
      });
    }
  },
);

export default router;
