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
      sql`LOWER(${adminAccountsTable.email}) = ${BOOTSTRAP_EMAIL}`,
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

      /*
       * Always repair the bootstrap Super Admin immediately before
       * authentication. ADMIN_EMAIL/ADMIN_PIN remain the source
       * of truth even when the existing database row has an old
       * hash or different email casing.
       */
      if (email === BOOTSTRAP_EMAIL) {
        await ensureSuperAdmin();
      }

      const result = await db
        .select({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          pinHash: adminAccountsTable.pinHash,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
        })
        .from(adminAccountsTable)
        .where(
          sql`LOWER(${adminAccountsTable.email}) = ${email}`,
        )
        .limit(1);

      let admin = result[0];

      if (!admin) {
        res.status(401).json({
          error: 'Invalid credentials.',
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
       * If this is the built-in Super Admin and the stored hash
       * does not validate, rebuild it from ADMIN_PIN and verify
       * again. The PIN itself is never logged or exposed.
       */
      if (!valid && email === BOOTSTRAP_EMAIL) {
        const repairedPinHash =
          await hashPin(BOOTSTRAP_PIN);

        const repairedRows = await db
          .update(adminAccountsTable)
          .set({
            pinHash: repairedPinHash,
            role: 'super_admin',
            status: 'active',
            updatedAt: new Date(),
          })
          .where(
            eq(
              adminAccountsTable.id,
              admin.id,
            ),
          )
          .returning({
            id: adminAccountsTable.id,
            name: adminAccountsTable.name,
            email: adminAccountsTable.email,
            pinHash: adminAccountsTable.pinHash,
            role: adminAccountsTable.role,
            status: adminAccountsTable.status,
          });

        const repairedAdmin =
          repairedRows[0];

        if (repairedAdmin) {
          admin = repairedAdmin;

          valid = await verifyPin(
            pin,
            repairedAdmin.pinHash,
          );
        }
      }

      if (!valid) {
        res.status(401).json({
          error: 'Invalid credentials.',
        });
        return;
      }

      req.session.isAdmin = true;
      req.session.adminId = admin.id;
      req.session.adminEmail = admin.email;
      req.session.adminRole = admin.role;

      await new Promise<void>(
        (resolve, reject) => {
          req.session.save((err) => {
            if (err) {
              reject(err);
              return;
            }

            resolve();
          });
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
      const adminId = req.session.adminId;
      const adminEmail = req.session.adminEmail;

      if (adminId && adminEmail) {
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
          req.session.destroy((err) => {
            if (err) {
              reject(err);
              return;
            }

            resolve();
          });
        },
      );

      res.clearCookie('connect.sid');

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
      if (!req.session.adminId) {
        res.status(401).json({
          error: 'Admin authentication required.',
        });
        return;
      }

      const result = await db
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
            req.session.adminId,
          ),
        )
        .limit(1);

      const admin = result[0];

      if (!admin) {
        res.status(401).json({
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
  '/dashboard',
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const [users, transactions, admins] =
        await Promise.all([
          db.execute(sql`
            SELECT COUNT(*)::int AS total
            FROM users
          `),
          db.execute(sql`
            SELECT COUNT(*)::int AS total
            FROM transactions
          `),
          db.execute(sql`
            SELECT COUNT(*)::int AS total
            FROM admin_accounts
            WHERE status = 'active'
          `),
        ]);

      res.json({
        users: Number(
          (
            users.rows[0] as {
              total?: number;
            } | undefined
          )?.total ?? 0,
        ),
        transactions: Number(
          (
            transactions.rows[0] as {
              total?: number;
            } | undefined
          )?.total ?? 0,
        ),
        admins: Number(
          (
            admins.rows[0] as {
              total?: number;
            } | undefined
          )?.total ?? 0,
        ),
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/dashboard failed',
      );

      res.status(500).json({
        error: 'Failed to load dashboard.',
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
            WHERE status = 'success'
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
                  WHEN type = 'wallet_fund'
                  THEN amount
                  ELSE 0
                END
              ),
              0
            )
            FROM transactions
            WHERE status = 'success'
          ) AS total_credit,

          (
            SELECT COALESCE(
              SUM(
                CASE
                  WHEN type != 'wallet_fund'
                  THEN amount
                  ELSE 0
                END
              ),
              0
            )
            FROM transactions
            WHERE status = 'success'
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
          u.id,
          u.name,
          u.phone,
          u.email,
          u.status,
          COALESCE(w.balance, '0')::numeric AS wallet_balance,
          u.kyc_status,
          u.created_at,
          u.updated_at
        FROM users u
        LEFT JOIN wallets w
          ON w.user_id = u.id
        WHERE
          (
            ${search} = ''
            OR u.name ILIKE ${`%${search}%`}
            OR u.phone ILIKE ${`%${search}%`}
            OR u.email ILIKE ${`%${search}%`}
          )
          AND (
            ${status} = ''
            OR u.status::text = ${status}
          )
          AND (
            ${kyc} = ''
            OR u.kyc_status::text = ${kyc}
          )
        ORDER BY u.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `);

      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM users u
        WHERE
          (
            ${search} = ''
            OR u.name ILIKE ${`%${search}%`}
            OR u.phone ILIKE ${`%${search}%`}
            OR u.email ILIKE ${`%${search}%`}
          )
          AND (
            ${status} = ''
            OR u.status::text = ${status}
          )
          AND (
            ${kyc} = ''
            OR u.kyc_status::text = ${kyc}
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
            OR status::text = ${status}
          )
          AND (
            ${type} = ''
            OR type::text = ${type}
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
            OR status::text = ${status}
          )
          AND (
            ${type} = ''
            OR type::text = ${type}
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
      const name =
        typeof req.body?.name === 'string'
          ? req.body.name.trim()
          : '';

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

      if (!name || !email || !pin) {
        res.status(400).json({
          error:
            'Name, email and PIN are required.',
        });
        return;
      }

      if (pin.length < MIN_BOOTSTRAP_PIN_LENGTH) {
        res.status(400).json({
          error: 'PIN must be at least 4 characters.',
        });
        return;
      }

      if (
        role !== 'admin' &&
        role !== 'super_admin'
      ) {
        res.status(400).json({
          error: 'Invalid admin role.',
        });
        return;
      }

      const existing = await db
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

      if (existing.length > 0) {
        res.status(409).json({
          error:
            'An admin with this email already exists.',
        });
        return;
      }

      const pinHash = await hashPin(pin);

      const values: InsertAdminAccount = {
        name,
        email,
        pinHash,
        role,
        status: 'active',
      };

      const created = await db
        .insert(adminAccountsTable)
        .values(values)
        .returning({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
          createdAt: adminAccountsTable.createdAt,
        });

      const admin = created[0];

      if (
        req.session.adminId &&
        req.session.adminEmail
      ) {
        await auditLog({
          adminId: req.session.adminId,
          adminEmail: req.session.adminEmail,
          action: 'admin_created',
          targetType: 'admin',
          targetId: admin?.id,
          targetLabel: email,
          details: {
            name,
            email,
            role,
          },
          ip: clientIp(req),
        });
      }

      res.status(201).json({
        admin,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admin create failed',
      );

      res.status(500).json({
        error: 'Failed to create admin.',
      });
    }
  },
);

router.patch(
  '/admins/:id',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const id = req.params.id;

      const name =
        typeof req.body?.name === 'string'
          ? req.body.name.trim()
          : undefined;

      const email =
        typeof req.body?.email === 'string'
          ? req.body.email.trim().toLowerCase()
          : undefined;

      const role =
        typeof req.body?.role === 'string'
          ? req.body.role.trim()
          : undefined;

      const status =
        typeof req.body?.status === 'string'
          ? req.body.status.trim()
          : undefined;

      const pin =
        typeof req.body?.pin === 'string'
          ? req.body.pin.trim()
          : undefined;

      if (
        role !== undefined &&
        role !== 'admin' &&
        role !== 'super_admin'
      ) {
        res.status(400).json({
          error: 'Invalid admin role.',
        });
        return;
      }

      if (
        status !== undefined &&
        status !== 'active' &&
        status !== 'disabled'
      ) {
        res.status(400).json({
          error: 'Invalid admin status.',
        });
        return;
      }

      if (
        pin !== undefined &&
        pin.length < MIN_BOOTSTRAP_PIN_LENGTH
      ) {
        res.status(400).json({
          error: 'PIN must be at least 4 characters.',
        });
        return;
      }

      if (
        email !== undefined &&
        email.length === 0
      ) {
        res.status(400).json({
          error: 'Email cannot be empty.',
        });
        return;
      }

      const current = await db
        .select({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
        })
        .from(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.id,
            id,
          ),
        )
        .limit(1);

      if (current.length === 0) {
        res.status(404).json({
          error: 'Admin not found.',
        });
        return;
      }

      const updates: Record<string, unknown> = {
        updatedAt: new Date(),
      };

      if (name !== undefined) {
        updates['name'] = name;
      }

      if (email !== undefined) {
        updates['email'] = email;
      }

      if (role !== undefined) {
        updates['role'] = role;
      }

      if (status !== undefined) {
        updates['status'] = status;
      }

      if (pin !== undefined) {
        updates['pinHash'] = await hashPin(pin);
      }

      const updatedRows = await db
        .update(adminAccountsTable)
        .set(updates)
        .where(
          eq(
            adminAccountsTable.id,
            id,
          ),
        )
        .returning({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
          updatedAt: adminAccountsTable.updatedAt,
        });

      const updated = updatedRows[0];

      if (
        req.session.adminId &&
        req.session.adminEmail
      ) {
        await auditLog({
          adminId: req.session.adminId,
          adminEmail: req.session.adminEmail,
          action: 'admin_updated',
          targetType: 'admin',
          targetId: id,
          targetLabel:
            updated?.email ??
            current[0]?.email ??
            id,
          details: {
            name,
            email,
            role,
            status,
            pinChanged:
              pin !== undefined,
          },
          ip: clientIp(req),
        });
      }

      res.json({
        admin: updated,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admin update failed',
      );

      res.status(500).json({
        error: 'Failed to update admin.',
      });
    }
  },
);

router.delete(
  '/admins/:id',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const id = req.params.id;

      if (id === req.session.adminId) {
        res.status(400).json({
          error:
            'You cannot delete the currently logged-in admin.',
        });
        return;
      }

      const current = await db
        .select({
          id: adminAccountsTable.id,
          email: adminAccountsTable.email,
        })
        .from(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.id,
            id,
          ),
        )
        .limit(1);

      if (current.length === 0) {
        res.status(404).json({
          error: 'Admin not found.',
        });
        return;
      }

      await db
        .delete(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.id,
            id,
          ),
        );

      if (
        req.session.adminId &&
        req.session.adminEmail
      ) {
        await auditLog({
          adminId: req.session.adminId,
          adminEmail: req.session.adminEmail,
          action: 'admin_deleted',
          targetType: 'admin',
          targetId: id,
          targetLabel:
            current[0]?.email ?? id,
          ip: clientIp(req),
        });
      }

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admin delete failed',
      );

      res.status(500).json({
        error: 'Failed to delete admin.',
      });
    }
  },
);

router.get(
  '/audit-logs',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const search =
        typeof req.query.search === 'string'
          ? req.query.search.trim()
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
          admin_id,
          admin_email,
          action,
          target_type,
          target_id,
          target_label,
          details,
          ip,
          created_at
        FROM admin_audit_logs
        WHERE
          (
            ${search} = ''
            OR admin_email ILIKE ${`%${search}%`}
            OR action ILIKE ${`%${search}%`}
            OR target_label ILIKE ${`%${search}%`}
            OR target_id::text ILIKE ${`%${search}%`}
          )
        ORDER BY created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `);

      const countResult = await db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM admin_audit_logs
        WHERE
          (
            ${search} = ''
            OR admin_email ILIKE ${`%${search}%`}
            OR action ILIKE ${`%${search}%`}
            OR target_label ILIKE ${`%${search}%`}
            OR target_id::text ILIKE ${`%${search}%`}
          )
      `);

      res.json({
        logs: result.rows,
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
        'admin/audit logs failed',
      );

      res.status(500).json({
        error: 'Failed to load audit logs.',
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

      const result = await db.execute(sql`
        SELECT
          u.id,
          u.name,
          u.first_name,
          u.last_name,
          u.email,
          u.phone,
          u.account_number,
          u.bank_name,
          u.referral_code,
          u.kyc_status,
          u.status,
          u.created_at,
          u.updated_at,
          COALESCE(w.balance, '0')::numeric AS wallet_balance,
          COUNT(DISTINCT t.id)::int AS transaction_count,
          COALESCE(
            SUM(t.amount) FILTER (
              WHERE t.status = 'success'
                AND t.type != 'wallet_fund'
            ),
            0
          )::numeric AS total_spent,
          MAX(t.created_at) AS last_transaction_at
        FROM users u
        LEFT JOIN wallets w
          ON w.user_id = u.id
        LEFT JOIN transactions t
          ON t.user_id = u.id
        WHERE u.id = ${id}
        GROUP BY u.id, w.balance
      `);

      const user = result.rows[0];

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
        'admin/user details failed',
      );

      res.status(500).json({
        error: 'Failed to load user details.',
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

      const result = await db.execute(sql`
        UPDATE users
        SET
          status = ${status},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING
          id,
          name,
          phone,
          email,
          status,
          kyc_status,
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
        };

        await auditLog({
          adminId: req.session.adminId,
          adminEmail: req.session.adminEmail,
          action: 'user_status_updated',
          targetType: 'user',
          targetId: id,
          targetLabel:
            row.phone ??
            row.email ??
            id,
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

router.patch(
  '/users/:id/kyc',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const id = req.params.id;

      const kycStatus =
        typeof req.body?.kycStatus === 'string'
          ? req.body.kycStatus.trim()
          : '';

      if (
        kycStatus !== 'unverified' &&
        kycStatus !== 'pending' &&
        kycStatus !== 'verified' &&
        kycStatus !== 'rejected'
      ) {
        res.status(400).json({
          error: 'Invalid KYC status.',
        });
        return;
      }

      const result = await db.execute(sql`
        UPDATE users
        SET
          kyc_status = ${kycStatus},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING
          id,
          name,
          phone,
          email,
          status,
          kyc_status,
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
        };

        await auditLog({
          adminId: req.session.adminId,
          adminEmail: req.session.adminEmail,
          action: 'user_kyc_updated',
          targetType: 'user',
          targetId: id,
          targetLabel:
            row.phone ??
            row.email ??
            id,
          details: {
            kycStatus,
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
        'admin/user KYC update failed',
      );

      res.status(500).json({
        error: 'Failed to update user KYC status.',
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

      const userResult = await db.execute(sql`
        SELECT
          id,
          name,
          phone,
          email,
          status
        FROM users
        WHERE id = ${id}
        LIMIT 1
      `);

      const user = userResult.rows[0];

      if (!user) {
        res.status(404).json({
          error: 'User not found.',
        });
        return;
      }

      const walletResult = await db.execute(sql`
        INSERT INTO wallets (
          user_id,
          balance,
          created_at,
          updated_at
        )
        VALUES (
          ${id},
          ${amountRaw},
          NOW(),
          NOW()
        )
        ON CONFLICT (user_id)
        DO UPDATE SET
          balance = wallets.balance + EXCLUDED.balance,
          updated_at = NOW()
        RETURNING
          user_id,
          balance,
          updated_at
      `);

      const wallet = walletResult.rows[0];

      if (!wallet) {
        res.status(500).json({
          error: 'Failed to update user wallet.',
        });
        return;
      }

      const updated = {
        ...user,
        wallet_balance: wallet.balance,
        updated_at: wallet.updated_at,
      };

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
