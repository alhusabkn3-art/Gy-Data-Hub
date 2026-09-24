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
   * The bootstrap credentials are the canonical credentials
   * for the built-in Super Admin account. Rebuild the hash
   * from ADMIN_PIN on every startup so an existing account
   * cannot remain stuck with a stale or invalid PIN hash.
   *
   * This is intentionally done before the existing-account
   * branch. The environment variable is the source of truth
   * for the bootstrap Super Admin credentials.
   */
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

  /*
   * Only create the bootstrap account when it does not
   * already exist.
   */
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
          )::numeric AS total_revenue,

          (
            SELECT COUNT(*)
            FROM admin_accounts
            WHERE status = 'active'
          )::int AS active_admins
      `);

      const row =
        result.rows[0] as
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
        successfulTransactions: Number(
          row?.successful_transactions ?? 0,
        ),
        failedTransactions: Number(
          row?.failed_transactions ?? 0,
        ),
        totalRevenue: Number(
          row?.total_revenue ?? 0,
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
        error: 'Failed to load admin stats.',
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

      const pageRaw =
        typeof req.query.page === 'string'
          ? Number(req.query.page)
          : 1;

      const limitRaw =
        typeof req.query.limit === 'string'
          ? Number(req.query.limit)
          : 50;

      const page =
        Number.isFinite(pageRaw) &&
        pageRaw > 0
          ? Math.floor(pageRaw)
          : 1;

      const limit =
        Number.isFinite(limitRaw) &&
        limitRaw > 0
          ? Math.min(
              Math.floor(limitRaw),
              200,
            )
          : 50;

      const offset =
        (page - 1) * limit;

      const searchPattern =
        `%${search}%`;

      const result =
        await db.execute(sql`
          SELECT
            u.*,
            (
              SELECT COUNT(*)
              FROM transactions t
              WHERE t.user_id = u.id
            )::int AS transaction_count
          FROM users u
          WHERE
            (
              ${search === ''}
              OR LOWER(
                COALESCE(u.name, '')
              ) LIKE LOWER(
                ${searchPattern}
              )
              OR LOWER(
                COALESCE(u.email, '')
              ) LIKE LOWER(
                ${searchPattern}
              )
              OR LOWER(
                COALESCE(u.phone, '')
              ) LIKE LOWER(
                ${searchPattern}
              )
            )
            AND (
              ${status === ''}
              OR u.status = ${status}
            )
          ORDER BY
            u.created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `);

      const countResult =
        await db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM users u
          WHERE
            (
              ${search === ''}
              OR LOWER(
                COALESCE(u.name, '')
              ) LIKE LOWER(
                ${searchPattern}
              )
              OR LOWER(
                COALESCE(u.email, '')
              ) LIKE LOWER(
                ${searchPattern}
              )
              OR LOWER(
                COALESCE(u.phone, '')
              ) LIKE LOWER(
                ${searchPattern}
              )
            )
            AND (
              ${status === ''}
              OR u.status = ${status}
            )
        `);

      const total =
        Number(
          (
            countResult.rows[0] as {
              total?: number;
            } | undefined
          )?.total ?? 0,
        );

      res.json({
        users: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages:
            Math.ceil(total / limit),
        },
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

router.patch(
  '/users/:id/status',
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId =
        String(req.params.id ?? '').trim();

      const status =
        typeof req.body?.status === 'string'
          ? req.body.status.trim()
          : '';

      if (!userId || !status) {
        res.status(400).json({
          error:
            'User ID and status are required.',
        });
        return;
      }

      if (
        ![
          'active',
          'suspended',
        ].includes(status)
      ) {
        res.status(400).json({
          error: 'Invalid user status.',
        });
        return;
      }

      const result =
        await db.execute(sql`
          UPDATE users
          SET
            status = ${status},
            updated_at = NOW()
          WHERE id = ${userId}
          RETURNING *
        `);

      const user =
        result.rows[0];

      if (!user) {
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
          adminId:
            req.session.adminId,
          adminEmail:
            req.session.adminEmail,
          action:
            'update_user_status',
          targetType: 'user',
          targetId: userId,
          targetLabel:
            String(
              (
                user as Record<
                  string,
                  unknown
                >
              ).phone ??
                (
                  user as Record<
                    string,
                    unknown
                  >
                ).email ??
                userId,
            ),
          details: {
            status,
          },
          ip: clientIp(req),
        });
      }

      res.json({
        ok: true,
        user,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/users/:id/status failed',
      );

      res.status(500).json({
        error:
          'Failed to update user status.',
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
      const userId =
        String(req.params.id ?? '').trim();

      if (!userId) {
        res.status(400).json({
          error: 'User ID is required.',
        });
        return;
      }

      const result =
        await db.execute(sql`
          SELECT
            u.*,
            (
              SELECT COUNT(*)
              FROM transactions t
              WHERE t.user_id = u.id
            )::int AS transaction_count
          FROM users u
          WHERE u.id = ${userId}
          LIMIT 1
        `);

      const user =
        result.rows[0];

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
        'admin/users/:id failed',
      );

      res.status(500).json({
        error: 'Failed to load user.',
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
        String(req.params.id ?? '').trim();

      if (!userId) {
        res.status(400).json({
          error: 'User ID is required.',
        });
        return;
      }

      const pageRaw =
        typeof req.query.page === 'string'
          ? Number(req.query.page)
          : 1;

      const limitRaw =
        typeof req.query.limit === 'string'
          ? Number(req.query.limit)
          : 50;

      const page =
        Number.isFinite(pageRaw) &&
        pageRaw > 0
          ? Math.floor(pageRaw)
          : 1;

      const limit =
        Number.isFinite(limitRaw) &&
        limitRaw > 0
          ? Math.min(
              Math.floor(limitRaw),
              200,
            )
          : 50;

      const offset =
        (page - 1) * limit;

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
