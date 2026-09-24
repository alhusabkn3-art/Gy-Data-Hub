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

  /*
   * IMPORTANT:
   *
   * Do NOT overwrite pinHash when the Super Admin already
   * exists. The previous implementation regenerated the
   * bootstrap PIN hash every time the server restarted,
   * which could overwrite a PIN changed by the admin.
   */
  if (existing.length > 0) {
    const existingAdmin = existing[0];

    await db
      .update(adminAccountsTable)
      .set({
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

  /*
   * Only create the bootstrap account when it does not
   * already exist.
   */
  const pinHash = await hashPin(BOOTSTRAP_PIN);

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

      const admin = result[0];

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

      const valid = await verifyPin(
        pin,
        admin.pinHash,
      );

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
            WHERE status = 'failed'
          )::int AS failed_transactions,

          (
            SELECT COALESCE(
              SUM(amount),
              0
            )
            FROM transactions
            WHERE status = 'success'
          )::numeric AS total_transaction_amount,

          (
            SELECT COUNT(*)
            FROM admin_accounts
            WHERE status = 'active'
          )::int AS active_admins
      `);

      const row = result.rows[0] as
        | Record<string, unknown>
        | undefined;

      res.json({
        totalUsers: Number(
          row?.total_users ?? 0,
        ),
        activeUsers: Number(
          row?.active_users ?? 0,
        ),
        suspendedUsers: Number(
          row?.suspended_users ?? 0,
        ),
        totalTransactions: Number(
          row?.total_transactions ?? 0,
        ),
        successfulTransactions:
          Number(
            row?.successful_transactions ??
              0,
          ),
        failedTransactions: Number(
          row?.failed_transactions ?? 0,
        ),
        totalTransactionAmount:
          Number(
            row?.total_transaction_amount ??
              0,
          ),
        activeAdmins: Number(
          row?.active_admins ?? 0,
        ),
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/stats failed',
      );

      res.status(500).json({
        error: 'Failed to load stats.',
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
      const result = await db
        .select({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
          createdAt:
            adminAccountsTable.createdAt,
          updatedAt:
            adminAccountsTable.updatedAt,
        })
        .from(adminAccountsTable)
        .orderBy(
          sql`${adminAccountsTable.createdAt} DESC`,
        );

      res.json({
        admins: result,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admins failed',
      );

      res.status(500).json({
        error: 'Failed to load admins.',
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
        req.body?.role === 'admin'
          ? 'admin'
          : 'super_admin';

      if (!name) {
        res.status(400).json({
          error: 'Admin name is required.',
        });
        return;
      }

      if (!email) {
        res.status(400).json({
          error: 'Admin email is required.',
        });
        return;
      }

      if (!pin || pin.length < 4) {
        res.status(400).json({
          error:
            'Admin PIN must be at least 4 characters.',
        });
        return;
      }

      const existing = await db
        .select({
          id: adminAccountsTable.id,
        })
        .from(adminAccountsTable)
        .where(
          sql`LOWER(${adminAccountsTable.email}) = ${email}`,
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

      const inserted = await db
        .insert(adminAccountsTable)
        .values(values)
        .returning({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
          createdAt:
            adminAccountsTable.createdAt,
        });

      const admin = inserted[0];

      if (!admin) {
        res.status(500).json({
          error: 'Failed to create admin.',
        });
        return;
      }

      if (
        req.session.adminId &&
        req.session.adminEmail
      ) {
        await auditLog({
          adminId:
            req.session.adminId,
          adminEmail:
            req.session.adminEmail,
          action: 'admin_created',
          targetType: 'admin',
          targetId: admin.id,
          targetLabel: admin.email,
          details: {
            role: admin.role,
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
        req.body?.role === 'admin' ||
        req.body?.role === 'super_admin'
          ? req.body.role
          : undefined;

      const status =
        req.body?.status === 'active' ||
        req.body?.status === 'inactive'
          ? req.body.status
          : undefined;

      const pin =
        typeof req.body?.pin === 'string'
          ? req.body.pin.trim()
          : undefined;

      if (
        name === undefined &&
        email === undefined &&
        role === undefined &&
        status === undefined &&
        pin === undefined
      ) {
        res.status(400).json({
          error:
            'At least one field is required.',
        });
        return;
      }

      if (email !== undefined && !email) {
        res.status(400).json({
          error: 'Admin email cannot be empty.',
        });
        return;
      }

      if (
        pin !== undefined &&
        pin.length < 4
      ) {
        res.status(400).json({
          error:
            'Admin PIN must be at least 4 characters.',
        });
        return;
      }

      if (email !== undefined) {
        const duplicate = await db
          .select({
            id: adminAccountsTable.id,
          })
          .from(adminAccountsTable)
          .where(
            sql`LOWER(${adminAccountsTable.email}) = ${email}
              AND ${adminAccountsTable.id} <> ${id}`,
          )
          .limit(1);

        if (duplicate.length > 0) {
          res.status(409).json({
            error:
              'Another admin already uses this email.',
          });
          return;
        }
      }

      const updates: Record<
        string,
        unknown
      > = {
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
        updates['pinHash'] =
          await hashPin(pin);
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
          createdAt:
            adminAccountsTable.createdAt,
          updatedAt:
            adminAccountsTable.updatedAt,
        });

      const admin = updatedRows[0];

      if (!admin) {
        res.status(404).json({
          error: 'Admin not found.',
        });
        return;
      }

      if (
        req.session.adminId &&
        req.session.adminEmail
      ) {
        await auditLog({
          adminId:
            req.session.adminId,
          adminEmail:
            req.session.adminEmail,
          action: 'admin_updated',
          targetType: 'admin',
          targetId: admin.id,
          targetLabel: admin.email,
          details: {
            fields: Object.keys(
              updates,
            ).filter(
              (key) =>
                key !== 'updatedAt' &&
                key !== 'pinHash',
            ),
            pinChanged:
              pin !== undefined,
          },
          ip: clientIp(req),
        });
      }

      res.json({
        admin,
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

      if (
        req.session.adminId === id
      ) {
        res.status(400).json({
          error:
            'You cannot delete the currently logged-in admin.',
        });
        return;
      }

      const target = await db
        .select({
          id: adminAccountsTable.id,
          email: adminAccountsTable.email,
          name: adminAccountsTable.name,
        })
        .from(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.id,
            id,
          ),
        )
        .limit(1);

      const admin = target[0];

      if (!admin) {
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
          adminId:
            req.session.adminId,
          adminEmail:
            req.session.adminEmail,
          action: 'admin_deleted',
          targetType: 'admin',
          targetId: id,
          targetLabel:
            admin.email,
          details: {
            name: admin.name,
          },
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
        req.body?.status === 'active' ||
        req.body?.status === 'inactive'
          ? req.body.status
          : '';

      if (!status) {
        res.status(400).json({
          error:
            'Valid status is required.',
        });
        return;
      }

      if (
        req.session.adminId === id &&
        status !== 'active'
      ) {
        res.status(400).json({
          error:
            'You cannot deactivate the currently logged-in admin.',
        });
        return;
      }

      const updatedRows = await db
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
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
          updatedAt:
            adminAccountsTable.updatedAt,
        });

      const admin = updatedRows[0];

      if (!admin) {
        res.status(404).json({
          error: 'Admin not found.',
        });
        return;
      }

      if (
        req.session.adminId &&
        req.session.adminEmail
      ) {
        await auditLog({
          adminId:
            req.session.adminId,
          adminEmail:
            req.session.adminEmail,
          action:
            'admin_status_updated',
          targetType: 'admin',
          targetId: admin.id,
          targetLabel: admin.email,
          details: {
            status,
          },
          ip: clientIp(req),
        });
      }

      res.json({
        admin,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admin status update failed',
      );

      res.status(500).json({
        error:
          'Failed to update admin status.',
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
        typeof req.query.search ===
        'string'
          ? req.query.search.trim()
          : '';

      const status =
        typeof req.query.status ===
        'string'
          ? req.query.status.trim()
          : '';

      const limitRaw =
        typeof req.query.limit ===
        'string'
          ? Number(
              req.query.limit,
            )
          : 100;

      const limit = Math.min(
        Math.max(
          Number.isFinite(
            limitRaw,
          )
            ? limitRaw
            : 100,
          1,
        ),
        500,
      );

      const offsetRaw =
        typeof req.query.offset ===
        'string'
          ? Number(
              req.query.offset,
            )
          : 0;

      const offset = Math.max(
        Number.isFinite(
          offsetRaw,
        )
          ? offsetRaw
          : 0,
        0,
      );

      const conditions = [];

      if (search) {
        const pattern = `%${search}%`;

        conditions.push(
          sql`(
            COALESCE(u.name, '') ILIKE ${pattern}
            OR COALESCE(u.phone, '') ILIKE ${pattern}
            OR COALESCE(u.email, '') ILIKE ${pattern}
          )`,
        );
      }

      if (
        status === 'active' ||
        status === 'suspended'
      ) {
        conditions.push(
          sql`u.status = ${status}`,
        );
      }

      const whereClause =
        conditions.length > 0
          ? sql`WHERE ${sql.join(
              conditions,
              sql` AND `,
            )}`
          : sql``;

      const result =
        await db.execute(sql`
          SELECT
            u.id,
            u.name,
            u.phone,
            u.email,
            u.status,
            u.kyc_status,
            u.created_at,
            u.updated_at,
            COALESCE(
              w.balance,
              0
            ) AS wallet_balance
          FROM users u
          LEFT JOIN wallets w
            ON w.user_id =
              u.id
          ${whereClause}
          ORDER BY
            u.created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `);

      const countResult =
        await db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM users u
          ${whereClause}
        `);

      const total = Number(
        (
          countResult.rows[0] as {
            total?: number;
          } | undefined
        )?.total ?? 0,
      );

      res.json({
        users:
          result.rows,
        total,
        limit,
        offset,
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
  '/users/:id',
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const id =
        req.params.id;

      const result =
        await db.execute(sql`
          SELECT
            u.id,
            u.name,
            u.phone,
            u.email,
            u.status,
            u.kyc_status,
            u.created_at,
            u.updated_at,
            COALESCE(
              w.balance,
              0
            ) AS wallet_balance
          FROM users u
          LEFT JOIN wallets w
            ON w.user_id =
              u.id
          WHERE u.id =
            ${id}
          LIMIT 1
        `);

      const user =
        result.rows[0];

      if (!user) {
        res.status(404).json({
          error:
            'User not found.',
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
        error:
          'Failed to load user details.',
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
      const id =
        req.params.id;

      const status =
        typeof req.body?.status ===
        'string'
          ? req.body.status.trim()
          : '';

      if (
        status !== 'active' &&
        status !== 'suspended'
      ) {
        res.status(400).json({
          error:
            'Invalid user status.',
        });
        return;
      }

      const result =
        await db.execute(sql`
          UPDATE users
          SET
            status =
              ${status},
            updated_at =
              NOW()
          WHERE id =
            ${id}
          RETURNING
            id,
            name,
            phone,
            email,
            status,
            kyc_status,
            updated_at
        `);

      const updated =
        result.rows[0];

      if (!updated) {
        res.status(404).json({
          error:
            'User not found.',
        });
        return;
      }

      if (
        req.session.adminId &&
        req.session.adminEmail
      ) {
        const row =
          updated as {
            phone?: string;
            email?: string;
          };

        await auditLog({
          adminId:
            req.session.adminId,
          adminEmail:
            req.session.adminEmail,
          action:
            'user_status_updated',
          targetType:
            'user',
          targetId:
            id,
          targetLabel:
            row.phone ??
            row.email ??
            id,
          details: {
            status,
          },
          ip:
            clientIp(req),
        });
      }

      res.json({
        user:
          updated,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/user status update failed',
      );

      res.status(500).json({
        error:
          'Failed to update user status.',
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
      const id =
        req.params.id;

      const kycStatus =
        typeof req.body?.kycStatus ===
        'string'
          ? req.body.kycStatus.trim()
          : '';

      if (
        kycStatus !==
          'unverified' &&
        kycStatus !==
          'pending' &&
        kycStatus !==
          'verified' &&
        kycStatus !==
          'rejected'
      ) {
        res.status(400).json({
          error:
            'Invalid KYC status.',
        });
        return;
      }

      const result =
        await db.execute(sql`
          UPDATE users
          SET
            kyc_status =
              ${kycStatus},
            updated_at =
              NOW()
          WHERE id =
            ${id}
          RETURNING
            id,
            name,
            phone,
            email,
            status,
            kyc_status,
            updated_at
        `);

      const updated =
        result.rows[0];

      if (!updated) {
        res.status(404).json({
          error:
            'User not found.',
        });
        return;
      }

      if (
        req.session.adminId &&
        req.session.adminEmail
      ) {
        const row =
          updated as {
            phone?: string;
            email?: string;
          };

        await auditLog({
          adminId:
            req.session.adminId,
          adminEmail:
            req.session.adminEmail,
          action:
            'user_kyc_updated',
          targetType:
            'user',
          targetId:
            id,
          targetLabel:
            row.phone ??
            row.email ??
            id,
          details: {
            kycStatus,
          },
          ip:
            clientIp(req),
        });
      }

      res.json({
        user:
          updated,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/user KYC update failed',
      );

      res.status(500).json({
        error:
          'Failed to update user KYC status.',
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
      const id =
        req.params.id;

      const amountRaw =
        typeof req.body?.amount ===
        'number'
          ? req.body.amount
          : Number(
              req.body?.amount,
            );

      const reason =
        typeof req.body?.reason ===
        'string'
          ? req.body.reason.trim()
          : '';

      if (
        !Number.isFinite(
          amountRaw,
        ) ||
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
          error:
            'A reason is required.',
        });
        return;
      }

      const userResult =
        await db.execute(sql`
          SELECT
            id,
            name,
            phone,
            email,
            status
          FROM users
          WHERE id =
            ${id}
          LIMIT 1
        `);

      const user =
        userResult.rows[0];

      if (!user) {
        res.status(404).json({
          error:
            'User not found.',
        });
        return;
      }

      const walletResult =
        await db.execute(sql`
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
            balance =
              wallets.balance +
              EXCLUDED.balance,
            updated_at =
              NOW()
          RETURNING
            user_id,
            balance,
            updated_at
        `);

      const wallet =
        walletResult.rows[0];

      if (!wallet) {
        res.status(500).json({
          error:
            'Failed to update user wallet.',
        });
        return;
      }

      const updated = {
        ...user,
        wallet_balance:
          wallet.balance,
        updated_at:
          wallet.updated_at,
      };

      if (
        req.session.adminId &&
        req.session.adminEmail
      ) {
        const row =
          updated as {
            phone?: string;
            email?: string;
            id: string;
          };

        await auditLog({
          adminId:
            req.session.adminId,
          adminEmail:
            req.session.adminEmail,
          action:
            'user_wallet_adjusted',
          targetType:
            'user',
          targetId:
            id,
          targetLabel:
            row.phone ??
            row.email ??
            id,
          details: {
            amount:
              amountRaw,
            reason,
          },
          ip:
            clientIp(req),
        });
      }

      res.json({
        user:
          updated,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/user wallet adjustment failed',
      );

      res.status(500).json({
        error:
          'Failed to adjust user wallet.',
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
      const userId =
        req.params.id;

      const limitRaw =
        typeof req.query.limit ===
        'string'
          ? Number(
              req.query.limit,
            )
          : 100;

      const limit =
        Math.min(
          Math.max(
            Number.isFinite(
              limitRaw,
            )
              ? limitRaw
              : 100,
            1,
          ),
          500,
        );

      const offsetRaw =
        typeof req.query.offset ===
        'string'
          ? Number(
              req.query.offset,
            )
          : 0;

      const offset =
        Math.max(
          Number.isFinite(
            offsetRaw,
          )
            ? offsetRaw
            : 0,
          0,
        );

      const result =
        await db.execute(sql`
          SELECT
            t.*,
            COALESCE(
              NULLIF(
                TRIM(u.name),
                ''
              ),
              'Unknown user'
            ) AS user_name,
            COALESCE(
              NULLIF(
                TRIM(u.phone),
                ''
              ),
              ''
            ) AS user_phone
          FROM transactions t
          LEFT JOIN users u
            ON u.id =
              t.user_id
          WHERE t.user_id =
            ${userId}
          ORDER BY
            t.created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `);

      res.json({
        transactions:
          result.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/user transactions failed',
      );

      res.status(500).json({
        error:
          'Failed to load user transactions.',
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
      const result =
        await db.execute(
          sql`SELECT 1 AS ok`,
        );

      res.json({
        ok:
          result.rows.length >
          0,
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
