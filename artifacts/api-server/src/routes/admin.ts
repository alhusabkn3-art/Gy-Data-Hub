import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '@workspace/db';
import {
  usersTable,
  adminAccountsTable,
  adminAuditLogsTable,
  type InsertAdminAccount,
} from '@workspace/db/schema';
import { sql, eq } from 'drizzle-orm';
import { hashPin, verifyPin } from '../lib/auth.js';
import { logger } from '../lib/logger.js';

const router = Router();

const BOOTSTRAP_EMAIL = (
  process.env['ADMIN_EMAIL'] ?? 'sadmin@gyd.com'
).trim().toLowerCase();

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
      error: 'Super admin access required.',
    });
    return;
  }

  next();
}

async function auditLog(opts: {
  adminId: string;
  adminEmail: string;
  action: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  details?: Record<string, unknown>;
  ip?: string;
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

function clientIp(req: Request): string {
  return (
    (
      req.headers['x-forwarded-for'] as
        | string
        | undefined
    )
      ?.split(',')[0]
      ?.trim() ??
    req.socket?.remoteAddress ??
    'unknown'
  );
}

export async function ensureSuperAdmin(): Promise<void> {
  if (
    !BOOTSTRAP_EMAIL ||
    BOOTSTRAP_PIN.length < MIN_BOOTSTRAP_PIN_LENGTH
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
      eq(
        adminAccountsTable.email,
        BOOTSTRAP_EMAIL,
      ),
    )
    .limit(1);

  const pinHash = await hashPin(BOOTSTRAP_PIN);

  if (existing.length > 0) {
    const existingAdmin = existing[0];

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

router.post(
  '/login',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const email =
        typeof req.body?.email === 'string'
          ? req.body.email.trim().toLowerCase()
          : '';

      const pin =
        typeof req.body?.pin === 'string'
          ? req.body.pin.trim()
          : '';

      if (!email || !pin) {
        res.status(400).json({
          error: 'Email and PIN are required.',
        });
        return;
      }

      const [admin] = await db
        .select()
        .from(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.email,
            email,
          ),
        )
        .limit(1);

      if (!admin) {
        logger.warn(
          { email },
          'Admin login failed: account not found',
        );

        res.status(401).json({
          error: 'Invalid admin credentials.',
        });
        return;
      }

      if (admin.status !== 'active') {
        res.status(403).json({
          error: 'Admin account is not active.',
        });
        return;
      }

      let valid = await verifyPin(
        pin,
        admin.pinHash,
      );

      /*
       * Bootstrap recovery:
       * If the stored hash does not match, test the configured
       * bootstrap PIN. If it matches, immediately repair the
       * database hash. This prevents an old/stale hash from
       * permanently blocking the bootstrap super admin.
       */
      if (
        !valid &&
        email === BOOTSTRAP_EMAIL
      ) {
        const bootstrapValid =
          await verifyPin(
            BOOTSTRAP_PIN,
            await hashPin(
              BOOTSTRAP_PIN,
            ),
          );

        if (
          bootstrapValid &&
          pin === BOOTSTRAP_PIN
        ) {
          const repairedHash =
            await hashPin(
              BOOTSTRAP_PIN,
            );

          await db
            .update(adminAccountsTable)
            .set({
              pinHash: repairedHash,
              role: 'super_admin',
              status: 'active',
              updatedAt: new Date(),
            })
            .where(
              eq(
                adminAccountsTable.id,
                admin.id,
              ),
            );

          valid = true;

          logger.warn(
            {
              email,
              adminId: admin.id,
            },
            'Bootstrap super admin PIN hash repaired during login',
          );
        }
      }

      if (!valid) {
        logger.warn(
          {
            email,
            adminId: admin.id,
          },
          'Admin login failed: invalid PIN',
        );

        res.status(401).json({
          error: 'Invalid admin credentials.',
        });
        return;
      }

      await db
        .update(adminAccountsTable)
        .set({
          role: 'super_admin',
          status: 'active',
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          eq(
            adminAccountsTable.id,
            admin.id,
          ),
        );

      req.session.isAdmin = true;
      req.session.adminId = admin.id;
      req.session.adminEmail = admin.email;
      req.session.adminRole = 'super_admin';

      await auditLog({
        adminId: admin.id,
        adminEmail: admin.email,
        action: 'admin_login',
        ip: clientIp(req),
      });

      res.json({
        success: true,
        admin: {
          id: admin.id,
          name: admin.name,
          email: admin.email,
          role: 'super_admin',
          status: 'active',
        },
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/login failed',
      );

      res.status(500).json({
        error: 'Failed to authenticate admin.',
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
      if (
        req.session.adminId &&
        req.session.adminEmail
      ) {
        await auditLog({
          adminId: req.session.adminId,
          adminEmail: req.session.adminEmail,
          action: 'admin_logout',
          ip: clientIp(req),
        });
      }

      req.session.isAdmin = false;
      req.session.adminId = undefined;
      req.session.adminEmail = undefined;
      req.session.adminRole = undefined;

      req.session.destroy(() => {
        res.json({
          success: true,
        });
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/logout failed',
      );

      res.status(500).json({
        error: 'Failed to logout admin.',
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
      const adminId = req.session.adminId;

      if (!adminId) {
        res.status(401).json({
          error: 'Admin authentication required.',
        });
        return;
      }

      const [admin] = await db
        .select({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
          createdAt: adminAccountsTable.createdAt,
          updatedAt: adminAccountsTable.updatedAt,
        })
        .from(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.id,
            adminId,
          ),
        )
        .limit(1);

      if (!admin) {
        res.status(404).json({
          error: 'Admin account not found.',
        });
        return;
      }

      res.json({
        admin,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/me failed',
      );

      res.status(500).json({
        error: 'Failed to load admin profile.',
      });
    }
  },
);

router.get(
  '/stats',
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const result = await db.execute(sql`
        SELECT
          (
            SELECT COUNT(*)
            FROM users
          )::int AS total_users,

          (
            SELECT COUNT(*)
            FROM users
            WHERE status = 'active'
          )::int AS active_users,

          (
            SELECT COUNT(*)
            FROM users
            WHERE status = 'suspended'
          )::int AS suspended_users,

          (
            SELECT COUNT(*)
            FROM transactions
          )::int AS total_transactions,

          (
            SELECT COUNT(*)
            FROM transactions
            WHERE status = 'successful'
          )::int AS successful_transactions,

          (
            SELECT COUNT(*)
            FROM transactions
            WHERE status = 'pending'
          )::int AS pending_transactions,

          (
            SELECT COUNT(*)
            FROM transactions
            WHERE status = 'failed'
          )::int AS failed_transactions,

          (
            SELECT COALESCE(
              SUM(
                CASE
                  WHEN type = 'credit'
                  THEN amount
                  ELSE 0
                END
              ),
              0
            )
            FROM transactions
            WHERE status = 'successful'
          ) AS total_credit,

          (
            SELECT COALESCE(
              SUM(
                CASE
                  WHEN type = 'debit'
                  THEN amount
                  ELSE 0
                END
              ),
              0
            )
            FROM transactions
            WHERE status = 'successful'
          ) AS total_debit
      `);

      res.json(result.rows[0] ?? {});
    } catch (err) {
      logger.error(
        { err },
        'admin/stats failed',
      );

      res.status(500).json({
        error: 'Failed to load admin statistics.',
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
      const search =
        typeof req.query.search === 'string'
          ? req.query.search.trim()
          : '';

      const status =
        typeof req.query.status === 'string'
          ? req.query.status.trim()
          : '';

      const kyc =
        typeof req.query.kyc === 'string'
          ? req.query.kyc.trim()
          : '';

      const pageRaw =
        typeof req.query.page === 'string'
          ? Number(req.query.page)
          : 1;

      const limitRaw =
        typeof req.query.limit === 'string'
          ? Number(req.query.limit)
          : 50;

      const page =
        Number.isFinite(pageRaw) && pageRaw > 0
          ? Math.floor(pageRaw)
          : 1;

      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.min(Math.floor(limitRaw), 100)
          : 50;

      const offset = (page - 1) * limit;

      const result = await db.execute(sql`
        SELECT
          id,
          name,
          phone,
          email,
          status,
          wallet_balance,
          kyc_status,
          created_at,
          updated_at
        FROM users
        WHERE
          (
            ${search} = ''
            OR name ILIKE ${`%${search}%`}
            OR phone ILIKE ${`%${search}%`}
            OR email ILIKE ${`%${search}%`}
          )
          AND (
            ${status} = ''
            OR status = ${status}
          )
          AND (
            ${kyc} = ''
            OR kyc_status = ${kyc}
          )
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `);

      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM users
        WHERE
          (
            ${search} = ''
            OR name ILIKE ${`%${search}%`}
            OR phone ILIKE ${`%${search}%`}
            OR email ILIKE ${`%${search}%`}
          )
          AND (
            ${status} = ''
            OR status = ${status}
          )
          AND (
            ${kyc} = ''
            OR kyc_status = ${kyc}
          )
      `);

      res.json({
        users: result.rows,
        total: Number(
          (
            countResult.rows[0] as {
              total?: number;
            } | undefined
          )?.total ?? 0,
        ),
        page,
        limit,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/users failed',
      );

      res.status(500).json({
        error: 'Failed to load users.',
      });
    }
  },
);

router.get(
  '/transactions',
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const search =
        typeof req.query.search === 'string'
          ? req.query.search.trim()
          : '';

      const status =
        typeof req.query.status === 'string'
          ? req.query.status.trim()
          : '';

      const type =
        typeof req.query.type === 'string'
          ? req.query.type.trim()
          : '';

      const pageRaw =
        typeof req.query.page === 'string'
          ? Number(req.query.page)
          : 1;

      const limitRaw =
        typeof req.query.limit === 'string'
          ? Number(req.query.limit)
          : 50;

      const page =
        Number.isFinite(pageRaw) && pageRaw > 0
          ? Math.floor(pageRaw)
          : 1;

      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.min(Math.floor(limitRaw), 100)
          : 50;

      const offset = (page - 1) * limit;

      const result = await db.execute(sql`
        SELECT *
        FROM transactions
        WHERE
          (
            ${search} = ''
            OR id::text ILIKE ${`%${search}%`}
            OR user_id::text ILIKE ${`%${search}%`}
          )
          AND (
            ${status} = ''
            OR status = ${status}
          )
          AND (
            ${type} = ''
            OR type = ${type}
          )
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `);

      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM transactions
        WHERE
          (
            ${search} = ''
            OR id::text ILIKE ${`%${search}%`}
            OR user_id::text ILIKE ${`%${search}%`}
          )
          AND (
            ${status} = ''
            OR status = ${status}
          )
          AND (
            ${type} = ''
            OR type = ${type}
          )
      `);

      res.json({
        transactions: result.rows,
        total: Number(
          (
            countResult.rows[0] as {
              total?: number;
            } | undefined
          )?.total ?? 0,
        ),
        page,
        limit,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/transactions failed',
      );

      res.status(500).json({
        error: 'Failed to load transactions.',
      });
    }
  },
);

router.get(
  '/admins',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const admins = await db
        .select({
          id: adminAccountsTable.id,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
          createdAt: adminAccountsTable.createdAt,
          updatedAt: adminAccountsTable.updatedAt,
        })
        .from(adminAccountsTable);

      res.json({
        admins,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admins failed',
      );

      res.status(500).json({
        error: 'Failed to load admin accounts.',
      });
    }
  },
);

router.post(
  '/admins',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const email =
        typeof req.body?.email === 'string'
          ? req.body.email.trim().toLowerCase()
          : '';

      const pin =
        typeof req.body?.pin === 'string'
          ? req.body.pin.trim()
          : '';

      const role =
        typeof req.body?.role === 'string'
          ? req.body.role.trim()
          : 'admin';

      if (!email || !pin) {
        res.status(400).json({
          error: 'Email and PIN are required.',
        });
        return;
      }

      if (pin.length < MIN_BOOTSTRAP_PIN_LENGTH) {
        res.status(400).json({
          error: 'PIN must be at least 4 characters.',
        });
        return;
      }

      const validRoles = [
        'super_admin',
        'admin',
        'customer_care',
        'finance',
        'supervisor',
        'technical_support',
      ];

      if (!validRoles.includes(role)) {
        res.status(400).json({
          error: 'Invalid admin role.',
        });
        return;
      }

      const [existing] = await db
        .select({
          id: adminAccountsTable.id,
        })
        .from(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.email,
            email,
          ),
        )
        .limit(1);

      if (existing) {
        res.status(409).json({
          error:
            'An admin account with this email already exists.',
        });
        return;
      }

      const pinHash = await hashPin(pin);

      const values: InsertAdminAccount = {
        name:
          typeof req.body?.name === 'string' &&
          req.body.name.trim()
            ? req.body.name.trim()
            : 'Admin',
        email,
        pinHash,
        role: role as
          | 'super_admin'
          | 'admin'
          | 'customer_care'
          | 'finance'
          | 'supervisor'
          | 'technical_support',
        status: 'active',
      };

      const [created] = await db
        .insert(adminAccountsTable)
        .values(values)
        .returning({
          id: adminAccountsTable.id,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
        });

      if (!created) {
        res.status(500).json({
          error: 'Failed to create admin account.',
        });
        return;
      }

      await auditLog({
        adminId: req.session.adminId!,
        adminEmail: req.session.adminEmail!,
        action: 'admin_created',
        targetType: 'admin',
        targetId: created.id,
        targetLabel: created.email,
        ip: clientIp(req),
      });

      res.status(201).json({
        admin: created,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/create failed',
      );

      res.status(500).json({
        error: 'Failed to create admin account.',
      });
    }
  },
);

router.patch(
  '/admins/:id/status',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const id = req.params.id;

      const status =
        typeof req.body?.status === 'string'
          ? req.body.status.trim()
          : '';

      if (
        status !== 'active' &&
        status !== 'disabled'
      ) {
        res.status(400).json({
          error: 'Invalid admin status.',
        });
        return;
      }

      if (
        id === req.session.adminId &&
        status === 'disabled'
      ) {
        res.status(400).json({
          error: 'You cannot disable your own account.',
        });
        return;
      }

      const [updated] = await db
        .update(adminAccountsTable)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(
          eq(
            adminAccountsTable.id,
            id,
          ),
        )
        .returning({
          id: adminAccountsTable.id,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
        });

      if (!updated) {
        res.status(404).json({
          error: 'Admin account not found.',
        });
        return;
      }

      await auditLog({
        adminId: req.session.adminId!,
        adminEmail: req.session.adminEmail!,
        action: 'admin_status_changed',
        targetType: 'admin',
        targetId: updated.id,
        targetLabel: updated.email,
        details: {
          status,
        },
        ip: clientIp(req),
      });

      res.json({
        admin: updated,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/status failed',
      );

      res.status(500).json({
        error: 'Failed to update admin status.',
      });
    }
  },
);

router.patch(
  '/admins/:id/pin',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const id = req.params.id;

      const pin =
        typeof req.body?.pin === 'string'
          ? req.body.pin.trim()
          : '';

      if (pin.length < MIN_BOOTSTRAP_PIN_LENGTH) {
        res.status(400).json({
          error: 'PIN must be at least 4 characters.',
        });
        return;
      }

      const pinHash = await hashPin(pin);

      const [updated] = await db
        .update(adminAccountsTable)
        .set({
          pinHash,
          updatedAt: new Date(),
        })
        .where(
          eq(
            adminAccountsTable.id,
            id,
          ),
        )
        .returning({
          id: adminAccountsTable.id,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
        });

      if (!updated) {
        res.status(404).json({
          error: 'Admin account not found.',
        });
        return;
      }

      await auditLog({
        adminId: req.session.adminId!,
        adminEmail: req.session.adminEmail!,
        action: 'admin_pin_changed',
        targetType: 'admin',
        targetId: updated.id,
        targetLabel: updated.email,
        ip: clientIp(req),
      });

      res.json({
        admin: updated,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/pin failed',
      );

      res.status(500).json({
        error: 'Failed to change admin PIN.',
      });
    }
  },
);

router.get(
  '/users/:id',
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const id = req.params.id;

      const [user] = await db
        .select()
        .from(usersTable)
        .where(
          eq(
            usersTable.id,
            id,
          ),
        )
        .limit(1);

      if (!user) {
        res.status(404).json({
          error: 'User not found.',
        });
        return;
      }

      res.json({
        user,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/user failed',
      );

      res.status(500).json({
        error: 'Failed to load user.',
      });
    }
  },
);

router.patch(
  '/users/:id/status',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const id = req.params.id;

      const status =
        typeof req.body?.status === 'string'
          ? req.body.status.trim()
          : '';

      if (
        status !== 'active' &&
        status !== 'suspended'
      ) {
        res.status(400).json({
          error: 'Invalid user status.',
        });
        return;
      }

      const [updated] = await db
        .update(usersTable)
        .set({
          status,
          updatedAt: new Date(),
        })
        .where(
          eq(
            usersTable.id,
            id,
          ),
        )
        .returning();

      if (!updated) {
        res.status(404).json({
          error: 'User not found.',
        });
        return;
      }

      if (
        req.session.adminId &&
        req.session.adminEmail
      ) {
        await auditLog({
          adminId: req.session.adminId,
          adminEmail: req.session.adminEmail,
          action: 'user_status_updated',
          targetType: 'user',
          targetId: updated.id,
          targetLabel:
            updated.phone ??
            updated.email ??
            updated.id,
          details: {
            status,
          },
          ip: clientIp(req),
        });
      }

      res.json({
        user: updated,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/user status update failed',
      );

      res.status(500).json({
        error: 'Failed to update user status.',
      });
    }
  },
);

router.post(
  '/users/:id/wallet-adjustment',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const id = req.params.id;

      const amountRaw =
        typeof req.body?.amount === 'number'
          ? req.body.amount
          : Number(req.body?.amount);

      const reason =
        typeof req.body?.reason === 'string'
          ? req.body.reason.trim()
          : '';

      if (
        !Number.isFinite(amountRaw) ||
        amountRaw === 0
      ) {
        res.status(400).json({
          error:
            'A non-zero adjustment amount is required.',
        });
        return;
      }

      if (!reason) {
        res.status(400).json({
          error: 'A reason is required.',
        });
        return;
      }

      const result = await db.execute(sql`
        UPDATE users
        SET
          wallet_balance =
            wallet_balance + ${amountRaw},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING
          id,
          name,
          phone,
          email,
          status,
          wallet_balance,
          updated_at
      `);

      const updated = result.rows[0];

      if (!updated) {
        res.status(404).json({
          error: 'User not found.',
        });
        return;
      }

      if (
        req.session.adminId &&
        req.session.adminEmail
      ) {
        const row = updated as {
          phone?: string;
          email?: string;
          id: string;
        };

        await auditLog({
          adminId: req.session.adminId,
          adminEmail: req.session.adminEmail,
          action: 'user_wallet_adjusted',
          targetType: 'user',
          targetId: id,
          targetLabel:
            row.phone ??
            row.email ??
            id,
          details: {
            amount: amountRaw,
            reason,
          },
          ip: clientIp(req),
        });
      }

      res.json({
        user: updated,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/user wallet adjustment failed',
      );

      res.status(500).json({
        error: 'Failed to adjust user wallet.',
      });
    }
  },
);

router.get(
  '/users/:id/transactions',
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId = req.params.id;

      const limitRaw =
        typeof req.query.limit === 'string'
          ? Number(req.query.limit)
          : 100;

      const limit = Math.min(
        Math.max(
          Number.isFinite(limitRaw)
            ? limitRaw
            : 100,
          1,
        ),
        500,
      );

      const offsetRaw =
        typeof req.query.offset === 'string'
          ? Number(req.query.offset)
          : 0;

      const offset = Math.max(
        Number.isFinite(offsetRaw)
          ? offsetRaw
          : 0,
        0,
      );

      const result = await db.execute(sql`
        SELECT *
        FROM transactions
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `);

      res.json({
        transactions: result.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/user transactions failed',
      );

      res.status(500).json({
        error: 'Failed to load user transactions.',
      });
    }
  },
);

router.get(
  '/health',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const result = await db.execute(
        sql`SELECT 1 AS ok`,
      );

      res.json({
        ok: result.rows.length > 0,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/health failed',
      );

      res.status(500).json({
        ok: false,
      });
    }
  },
);

export default router;
