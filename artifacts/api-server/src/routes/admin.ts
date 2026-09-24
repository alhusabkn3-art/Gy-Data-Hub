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
      error: 'Super admin access required.',
    });
    return;
  }

  next();
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

  const pinHash = await hashPin(
    BOOTSTRAP_PIN,
  );

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

/*
 * POST /api/admin/login
 *
 * Bootstrap Super Admin credentials are always synchronized with
 * ADMIN_EMAIL / ADMIN_PIN.
 *
 * For the bootstrap account, the environment credentials are treated
 * as the authoritative credentials. If an existing database hash does
 * not verify, the hash is repaired immediately and verification is
 * retried.
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
          error: 'Email and PIN are required.',
        });
        return;
      }

      /*
       * If this is the bootstrap account, synchronize it immediately.
       *
       * This protects against:
       * - stale pin_hash values
       * - email casing differences
       * - an account whose role/status was changed
       * - deployments where the database existed before the current
       *   bootstrap configuration
       */
      const isBootstrapAccount =
        email === BOOTSTRAP_EMAIL;

      if (isBootstrapAccount) {
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

      /*
       * Bootstrap account is always restored to an active Super Admin.
       */
      if (isBootstrapAccount) {
        if (
          admin.role !== 'super_admin' ||
          admin.status !== 'active'
        ) {
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
                admin.id,
              ),
            );

          const repaired = await db
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
              eq(
                adminAccountsTable.id,
                admin.id,
              ),
            )
            .limit(1);

          if (repaired[0]) {
            admin = repaired[0];
          }
        }
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
       * If the bootstrap credentials are being used and the stored
       * bcrypt hash does not verify, repair the hash from ADMIN_PIN.
       *
       * No PIN or hash is ever written to logs.
       */
      if (
        !valid &&
        isBootstrapAccount &&
        BOOTSTRAP_PIN.length >=
          MIN_BOOTSTRAP_PIN_LENGTH
      ) {
        const repairedPinHash =
          await hashPin(
            BOOTSTRAP_PIN,
          );

        await db
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
          );

        admin = {
          ...admin,
          pinHash: repairedPinHash,
          role: 'super_admin',
          status: 'active',
        };

        valid = await verifyPin(
          pin,
          repairedPinHash,
        );
      }

      /*
       * Final bootstrap fallback:
       *
       * ADMIN_EMAIL / ADMIN_PIN are the authoritative bootstrap
       * credentials. If bcrypt verification still fails but the
       * submitted credentials exactly match the configured bootstrap
       * credentials, allow the bootstrap login and immediately repair
       * the database hash.
       */
      if (
        !valid &&
        isBootstrapAccount &&
        pin === BOOTSTRAP_PIN &&
        BOOTSTRAP_PIN.length >=
          MIN_BOOTSTRAP_PIN_LENGTH
      ) {
        const finalPinHash =
          await hashPin(
            BOOTSTRAP_PIN,
          );

        await db
          .update(adminAccountsTable)
          .set({
            pinHash: finalPinHash,
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

        admin = {
          ...admin,
          pinHash: finalPinHash,
          role: 'super_admin',
          status: 'active',
        };

        valid = pin === BOOTSTRAP_PIN;
      }

      if (!valid) {
        logger.warn(
          {
            email,
            bootstrapAccount:
              isBootstrapAccount,
          },
          'Admin login rejected: invalid PIN',
        );

        res.status(401).json({
          error: 'Invalid credentials.',
        });
        return;
      }

      /*
       * Bootstrap credentials must always establish Super Admin
       * privileges.
       */
      if (isBootstrapAccount) {
        admin = {
          ...admin,
          role: 'super_admin',
          status: 'active',
        };
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
            'Admin account not found.',
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
        error: 'Failed to load admin session.',
      });
    }
  },
);

router.get(
  '/dashboard',
  requireAdmin,
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const result = await db.execute(
        sql`
          SELECT
            (SELECT COUNT(*)::int FROM users) AS total_users,
            (
              SELECT COUNT(*)::int
              FROM users
              WHERE status = 'active'
            ) AS active_users,
            (
              SELECT COUNT(*)::int
              FROM users
              WHERE status = 'suspended'
            ) AS suspended_users,
            (
              SELECT COUNT(*)::int
              FROM transactions
            ) AS total_transactions,
            (
              SELECT COUNT(*)::int
              FROM transactions
              WHERE status = 'success'
            ) AS successful_transactions
        `,
      );

      res.json({
        ok: true,
        stats:
          result.rows[0] ?? {
            total_users: 0,
            active_users: 0,
            suspended_users: 0,
            total_transactions: 0,
            successful_transactions: 0,
          },
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/dashboard failed',
      );

      res.status(500).json({
        error:
          'Failed to load dashboard data.',
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
      const result = await db.execute(
        sql`
          SELECT
            (SELECT COUNT(*)::int FROM users) AS total_users,
            (
              SELECT COUNT(*)::int
              FROM users
              WHERE status = 'active'
            ) AS active_users,
            (
              SELECT COUNT(*)::int
              FROM users
              WHERE status = 'suspended'
            ) AS suspended_users,
            (
              SELECT COUNT(*)::int
              FROM users
              WHERE kyc_status = 'verified'
            ) AS verified_users,
            (
              SELECT COUNT(*)::int
              FROM transactions
            ) AS total_transactions,
            (
              SELECT COUNT(*)::int
              FROM transactions
              WHERE status = 'success'
            ) AS successful_transactions,
            (
              SELECT COALESCE(
                SUM(amount),
                0
              )
              FROM transactions
              WHERE status = 'success'
            ) AS total_revenue
        `,
      );

      res.json({
        ok: true,
        data:
          result.rows[0] ?? {},
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
          : 'all';

      const page =
        Math.max(
          1,
          Number.parseInt(
            String(
              req.query.page ?? '1',
            ),
            10,
          ) || 1,
        );

      const limit =
        Math.min(
          100,
          Math.max(
            1,
            Number.parseInt(
              String(
                req.query.limit ??
                  '50',
              ),
              10,
            ) || 50,
          ),
        );

      const offset =
        (page - 1) * limit;

      const conditions = [
        sql`1 = 1`,
      ];

      if (search) {
        conditions.push(
          sql`
            (
              u.name ILIKE ${`%${search}%`}
              OR
              u.email ILIKE ${`%${search}%`}
              OR
              u.phone ILIKE ${`%${search}%`}
            )
          `,
        );
      }

      if (
        status &&
        status !== 'all'
      ) {
        conditions.push(
          sql`u.status = ${status}`,
        );
      }

      const whereClause =
        sql.join(
          conditions,
          sql` AND `,
        );

      const usersResult =
        await db.execute(
          sql`
            SELECT
              u.id,
              u.name,
              u.email,
              u.phone,
              u.status,
              u.kyc_status,
              u.created_at,
              u.updated_at
            FROM users u
            WHERE ${whereClause}
            ORDER BY u.created_at DESC
            LIMIT ${limit}
            OFFSET ${offset}
          `,
        );

      const countResult =
        await db.execute(
          sql`
            SELECT COUNT(*)::int AS total
            FROM users u
            WHERE ${whereClause}
          `,
        );

      res.json({
        ok: true,
        data: usersResult.rows,
        total:
          Number(
            countResult.rows[0]?.total ??
              0,
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
        error:
          'Failed to load users.',
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
          : 'all';

      const type =
        typeof req.query.type === 'string'
          ? req.query.type.trim()
          : 'all';

      const from =
        typeof req.query.from === 'string'
          ? req.query.from.trim()
          : '';

      const to =
        typeof req.query.to === 'string'
          ? req.query.to.trim()
          : '';

      const page =
        Math.max(
          1,
          Number.parseInt(
            String(
              req.query.page ?? '1',
            ),
            10,
          ) || 1,
        );

      const limit =
        Math.min(
          100,
          Math.max(
            1,
            Number.parseInt(
              String(
                req.query.limit ??
                  '50',
              ),
              10,
            ) || 50,
          ),
        );

      const offset =
        (page - 1) * limit;

      const conditions = [
        sql`1 = 1`,
      ];

      if (search) {
        conditions.push(
          sql`
            (
              t.reference ILIKE ${`%${search}%`}
              OR
              t.type ILIKE ${`%${search}%`}
              OR
              u.name ILIKE ${`%${search}%`}
              OR
              u.email ILIKE ${`%${search}%`}
            )
          `,
        );
      }

      if (
        status &&
        status !== 'all'
      ) {
        conditions.push(
          sql`t.status = ${status}`,
        );
      }

      if (
        type &&
        type !== 'all'
      ) {
        conditions.push(
          sql`t.type = ${type}`,
        );
      }

      if (from) {
        conditions.push(
          sql`t.created_at >= ${from}`,
        );
      }

      if (to) {
        conditions.push(
          sql`
            t.created_at <
            (${to}::date + INTERVAL '1 day')
          `,
        );
      }

      const whereClause =
        sql.join(
          conditions,
          sql` AND `,
        );

      const rows =
        await db.execute(
          sql`
            SELECT
              t.id,
              t.user_id,
              t.reference,
              t.type,
              t.amount,
              t.status,
              t.description,
              t.created_at,
              u.name AS user_name,
              u.email AS user_email
            FROM transactions t
            LEFT JOIN users u
              ON u.id = t.user_id
            WHERE ${whereClause}
            ORDER BY t.created_at DESC
            LIMIT ${limit}
            OFFSET ${offset}
          `,
        );

      const count =
        await db.execute(
          sql`
            SELECT COUNT(*)::int AS total
            FROM transactions t
            LEFT JOIN users u
              ON u.id = t.user_id
            WHERE ${whereClause}
          `,
        );

      res.json({
        ok: true,
        data: rows.rows,
        total:
          Number(
            count.rows[0]?.total ??
              0,
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
        error:
          'Failed to load transactions.',
      });
    }
  },
);

router.get(
  '/revenue/weekly',
  requireAdmin,
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const result = await db.execute(
        sql`
          SELECT
            DATE_TRUNC(
              'day',
              created_at
            )::date AS day,
            COALESCE(
              SUM(amount),
              0
            ) AS revenue
          FROM transactions
          WHERE
            status = 'success'
            AND created_at >=
              NOW() - INTERVAL '7 days'
          GROUP BY
            DATE_TRUNC(
              'day',
              created_at
            )::date
          ORDER BY day ASC
        `,
      );

      res.json({
        ok: true,
        data: result.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/revenue/weekly failed',
      );

      res.status(500).json({
        error:
          'Failed to load weekly revenue.',
      });
    }
  },
);

router.get(
  '/services',
  requireAdmin,
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const result = await db.execute(
        sql`
          SELECT
            type,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE status = 'success'
            )::int AS successful,
            COUNT(*) FILTER (
              WHERE status = 'pending'
            )::int AS pending,
            COUNT(*) FILTER (
              WHERE status = 'failed'
            )::int AS failed
          FROM transactions
          GROUP BY type
          ORDER BY total DESC
        `,
      );

      res.json({
        ok: true,
        data: result.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/services failed',
      );

      res.status(500).json({
        error:
          'Failed to load services.',
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
        String(req.params.id ?? '');

      const status =
        typeof req.body?.status === 'string'
          ? req.body.status.trim()
          : '';

      if (
        !userId ||
        ![
          'active',
          'suspended',
        ].includes(status)
      ) {
        res.status(400).json({
          error:
            'Valid user status is required.',
        });
        return;
      }

      const result = await db.execute(
        sql`
          UPDATE users
          SET
            status = ${status},
            updated_at = NOW()
          WHERE id = ${userId}
          RETURNING
            id,
            name,
            email,
            status
        `,
      );

      if (
        result.rows.length === 0
      ) {
        res.status(404).json({
          error: 'User not found.',
        });
        return;
      }

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
          action:
            status === 'suspended'
              ? 'suspend_user'
              : 'activate_user',
          targetType: 'user',
          targetId: userId,
          targetLabel:
            String(
              result.rows[0]?.email ??
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
        user: result.rows[0],
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
  '/admins',
  requireSuperAdmin,
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const result = await db
        .select({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status:
            adminAccountsTable.status,
          financePermissions:
            adminAccountsTable.financePermissions,
          createdBy:
            adminAccountsTable.createdBy,
          lastLoginAt:
            adminAccountsTable.lastLoginAt,
          createdAt:
            adminAccountsTable.createdAt,
          updatedAt:
            adminAccountsTable.updatedAt,
        })
        .from(adminAccountsTable)
        .orderBy(
          adminAccountsTable.createdAt,
        );

      res.json({
        ok: true,
        data: result,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admins failed',
      );

      res.status(500).json({
        error:
          'Failed to load admin accounts.',
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
          ? req.body.email
              .trim()
              .toLowerCase()
          : '';

      const pin =
        typeof req.body?.pin === 'string'
          ? req.body.pin.trim()
          : '';

      const role =
        typeof req.body?.role === 'string'
          ? req.body.role.trim()
          : 'admin';

      const status =
        typeof req.body?.status === 'string'
          ? req.body.status.trim()
          : 'active';

      const financePermissions =
        Array.isArray(
          req.body?.financePermissions,
        )
          ? req.body.financePermissions.filter(
              (item: unknown) =>
                typeof item === 'string',
            )
          : [];

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

      const allowedRoles = [
        'super_admin',
        'admin',
        'customer_care',
        'finance',
        'supervisor',
        'technical_support',
      ];

      if (
        !allowedRoles.includes(role)
      ) {
        res.status(400).json({
          error: 'Invalid admin role.',
        });
        return;
      }

      if (
        ![
          'active',
          'disabled',
        ].includes(status)
      ) {
        res.status(400).json({
          error: 'Invalid admin status.',
        });
        return;
      }

      const duplicate =
        await db
          .select({
            id: adminAccountsTable.id,
          })
          .from(adminAccountsTable)
          .where(
            sql`LOWER(${adminAccountsTable.email}) = ${email}`,
          )
          .limit(1);

      if (duplicate.length > 0) {
        res.status(409).json({
          error:
            'An admin account with this email already exists.',
        });
        return;
      }

      const pinHash =
        await hashPin(pin);

      const values: InsertAdminAccount = {
        name,
        email,
        pinHash,
        role: role as InsertAdminAccount['role'],
        status:
          status as InsertAdminAccount['status'],
        financePermissions,
        createdBy:
          req.session.adminId ??
          null,
      };

      const inserted =
        await db
          .insert(
            adminAccountsTable,
          )
          .values(values)
          .returning({
            id: adminAccountsTable.id,
            name: adminAccountsTable.name,
            email:
              adminAccountsTable.email,
            role: adminAccountsTable.role,
            status:
              adminAccountsTable.status,
            financePermissions:
              adminAccountsTable.financePermissions,
            createdBy:
              adminAccountsTable.createdBy,
            createdAt:
              adminAccountsTable.createdAt,
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
            'create_admin_account',
          targetType: 'admin',
          targetId: created.id,
          targetLabel:
            created.email,
          details: {
            role: created.role,
            status: created.status,
          },
          ip: clientIp(req),
        });
      }

      res.status(201).json({
        ok: true,
        admin: created,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admins POST failed',
      );

      res.status(500).json({
        error:
          'Failed to create admin account.',
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
      const adminId =
        String(req.params.id ?? '');

      if (!adminId) {
        res.status(400).json({
          error:
            'Admin ID is required.',
        });
        return;
      }

      const current =
        await db
          .select({
            id: adminAccountsTable.id,
            name:
              adminAccountsTable.name,
            email:
              adminAccountsTable.email,
            role:
              adminAccountsTable.role,
            status:
              adminAccountsTable.status,
            financePermissions:
              adminAccountsTable.financePermissions,
          })
          .from(adminAccountsTable)
          .where(
            eq(
              adminAccountsTable.id,
              adminId,
            ),
          )
          .limit(1);

      const existing =
        current[0];

      if (!existing) {
        res.status(404).json({
          error:
            'Admin account not found.',
        });
        return;
      }

      const updateData: Partial<InsertAdminAccount> =
        {};

      if (
        typeof req.body?.name === 'string'
      ) {
        const name =
          req.body.name.trim();

        if (name) {
          updateData.name = name;
        }
      }

      if (
        typeof req.body?.email === 'string'
      ) {
        const email =
          req.body.email
            .trim()
            .toLowerCase();

        if (
          email &&
          email !==
            existing.email
              .toLowerCase()
        ) {
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
                sql`
                  LOWER(
                    ${adminAccountsTable.email}
                  ) = ${email}
                `,
              )
              .limit(1);

          if (
            duplicate.length > 0 &&
            duplicate[0].id !== adminId
          ) {
            res.status(409).json({
              error:
                'Another admin already uses this email.',
            });
            return;
          }

          updateData.email = email;
        }
      }

      if (
        typeof req.body?.role === 'string'
      ) {
        const role =
          req.body.role.trim();

        if (
          [
            'super_admin',
            'admin',
            'customer_care',
            'finance',
            'supervisor',
            'technical_support',
          ].includes(role)
        ) {
          updateData.role =
            role as InsertAdminAccount['role'];
        }
      }

      if (
        typeof req.body?.status ===
        'string'
      ) {
        const status =
          req.body.status.trim();

        if (
          [
            'active',
            'disabled',
          ].includes(status)
        ) {
          updateData.status =
            status as InsertAdminAccount['status'];
        }
      }

      if (
        Array.isArray(
          req.body?.financePermissions,
        )
      ) {
        updateData.financePermissions =
          req.body.financePermissions.filter(
            (item: unknown) =>
              typeof item ===
              'string',
          );
      }

      /*
       * Never allow the bootstrap Super Admin to be demoted or disabled.
       */
      if (
        existing.email
          .trim()
          .toLowerCase() ===
        BOOTSTRAP_EMAIL
      ) {
        updateData.role =
          'super_admin';

        updateData.status =
          'active';
      }

      /*
       * Never allow the currently authenticated Super Admin to
       * accidentally remove Super Admin access from its own account.
       */
      if (
        existing.id ===
        req.session.adminId
      ) {
        updateData.role =
          'super_admin';

        updateData.status =
          'active';
      }

      updateData.updatedAt =
        new Date();

      const updated =
        await db
          .update(
            adminAccountsTable,
          )
          .set(updateData)
          .where(
            eq(
              adminAccountsTable.id,
              adminId,
            ),
          )
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
            financePermissions:
              adminAccountsTable.financePermissions,
            createdBy:
              adminAccountsTable.createdBy,
            lastLoginAt:
              adminAccountsTable.lastLoginAt,
            createdAt:
              adminAccountsTable.createdAt,
            updatedAt:
              adminAccountsTable.updatedAt,
          });

      const result =
        updated[0];

      if (!result) {
        res.status(404).json({
          error:
            'Admin account not found.',
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
            'update_admin_account',
          targetType: 'admin',
          targetId: adminId,
          targetLabel:
            result.email,
          details: {
            previous: {
              name: existing.name,
              email: existing.email,
              role: existing.role,
              status: existing.status,
            },
            updated: {
              name: result.name,
              email: result.email,
              role: result.role,
              status: result.status,
            },
          },
          ip: clientIp(req),
        });
      }

      res.json({
        ok: true,
        admin: result,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admins PATCH failed',
      );

      res.status(500).json({
        error:
          'Failed to update admin account.',
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
      const adminId =
        String(req.params.id ?? '');

      const pin =
        typeof req.body?.pin === 'string'
          ? req.body.pin.trim()
          : '';

      if (
        !adminId ||
        !pin
      ) {
        res.status(400).json({
          error:
            'Admin ID and PIN are required.',
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

      const existing =
        await db
          .select({
            id:
              adminAccountsTable.id,
            email:
              adminAccountsTable.email,
          })
          .from(adminAccountsTable)
          .where(
            eq(
              adminAccountsTable.id,
              adminId,
            ),
          )
          .limit(1);

      if (!existing[0]) {
        res.status(404).json({
          error:
            'Admin account not found.',
        });
        return;
      }

      /*
       * Bootstrap Super Admin PIN is controlled by ADMIN_PIN.
       * Do not allow this endpoint to permanently diverge from the
       * deployment bootstrap credentials.
       */
      if (
        existing[0].email
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
        await hashPin(pin);

      await db
        .update(
          adminAccountsTable,
        )
        .set({
          pinHash,
          updatedAt: new Date(),
        })
        .where(
          eq(
            adminAccountsTable.id,
            adminId,
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
          action:
            'change_admin_pin',
          targetType: 'admin',
          targetId: adminId,
          targetLabel:
            existing[0].email,
          ip: clientIp(req),
        });
      }

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admins/:id/pin failed',
      );

      res.status(500).json({
        error:
          'Failed to change admin PIN.',
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
      const adminId =
        String(req.params.id ?? '');

      if (!adminId) {
        res.status(400).json({
          error:
            'Admin ID is required.',
        });
        return;
      }

      if (
        adminId ===
        req.session.adminId
      ) {
        res.status(400).json({
          error:
            'You cannot delete your own admin account.',
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
          .from(adminAccountsTable)
          .where(
            eq(
              adminAccountsTable.id,
              adminId,
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
            'The bootstrap Super Admin cannot be deleted.',
        });
        return;
      }

      if (
        admin.role ===
        'super_admin'
      ) {
        res.status(400).json({
          error:
            'Super Admin accounts cannot be deleted.',
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
            adminId,
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
          action:
            'delete_admin_account',
          targetType: 'admin',
          targetId: adminId,
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
        'admin/admins DELETE failed',
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
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const page =
        Math.max(
          1,
          Number.parseInt(
            String(
              req.query.page ?? '1',
            ),
            10,
          ) || 1,
        );

      const limit =
        Math.min(
          100,
          Math.max(
            1,
            Number.parseInt(
              String(
                req.query.limit ??
                  '50',
              ),
              10,
            ) || 50,
          ),
        );

      const offset =
        (page - 1) * limit;

      const result =
        await db
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

      const count =
        await db.execute(
          sql`
            SELECT COUNT(*)::int AS total
            FROM admin_audit_logs
          `,
        );

      res.json({
        ok: true,
        data: result,
        total:
          Number(
            count.rows[0]?.total ??
              0,
          ),
        page,
        limit,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/audit-logs failed',
      );

      res.status(500).json({
        error:
          'Failed to load audit logs.',
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
        String(req.params.id ?? '');

      const result =
        await db.execute(
          sql`
            SELECT
              u.*
            FROM users u
            WHERE u.id = ${userId}
            LIMIT 1
          `,
        );

      if (
        result.rows.length === 0
      ) {
        res.status(404).json({
          error: 'User not found.',
        });
        return;
      }

      res.json({
        ok: true,
        user: result.rows[0],
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/users/:id failed',
      );

      res.status(500).json({
        error:
          'Failed to load user.',
      });
    }
  },
);

router.patch(
  '/users/:id/kyc',
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId =
        String(req.params.id ?? '');

      const kycStatus =
        typeof req.body?.kycStatus ===
        'string'
          ? req.body.kycStatus.trim()
          : '';

      if (
        ![
          'pending',
          'verified',
          'rejected',
        ].includes(kycStatus)
      ) {
        res.status(400).json({
          error:
            'Invalid KYC status.',
        });
        return;
      }

      const result =
        await db.execute(
          sql`
            UPDATE users
            SET
              kyc_status = ${kycStatus},
              updated_at = NOW()
            WHERE id = ${userId}
            RETURNING
              id,
              name,
              email,
              kyc_status
          `,
        );

      if (
        result.rows.length === 0
      ) {
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
            'update_user_kyc',
          targetType: 'user',
          targetId: userId,
          targetLabel:
            String(
              result.rows[0]?.email ??
                userId,
            ),
          details: {
            kycStatus,
          },
          ip: clientIp(req),
        });
      }

      res.json({
        ok: true,
        user: result.rows[0],
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/users/:id/kyc failed',
      );

      res.status(500).json({
        error:
          'Failed to update KYC status.',
      });
    }
  },
);

router.patch(
  '/users/:id/wallet',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const userId =
        String(req.params.id ?? '');

      const amount =
        Number(req.body?.amount);

      const reason =
        typeof req.body?.reason ===
        'string'
          ? req.body.reason.trim()
          : 'Admin wallet adjustment';

      if (
        !userId ||
        !Number.isFinite(amount) ||
        amount === 0
      ) {
        res.status(400).json({
          error:
            'A valid non-zero wallet adjustment is required.',
        });
        return;
      }

      const userResult =
        await db.execute(
          sql`
            SELECT
              id,
              name,
              email
            FROM users
            WHERE id = ${userId}
            LIMIT 1
          `,
        );

      if (
        userResult.rows.length === 0
      ) {
        res.status(404).json({
          error: 'User not found.',
        });
        return;
      }

      const walletResult =
        await db.execute(
          sql`
            SELECT
              id,
              balance
            FROM wallets
            WHERE user_id = ${userId}
            FOR UPDATE
          `,
        );

      if (
        walletResult.rows.length === 0
      ) {
        res.status(404).json({
          error:
            'Wallet not found.',
        });
        return;
      }

      const currentBalance =
        Number(
          walletResult.rows[0]
            ?.balance ?? 0,
        );

      const newBalance =
        currentBalance + amount;

      if (newBalance < 0) {
        res.status(400).json({
          error:
            'Wallet balance cannot become negative.',
        });
        return;
      }

      await db.execute(
        sql`
          UPDATE wallets
          SET
            balance = ${newBalance},
            updated_at = NOW()
          WHERE user_id = ${userId}
        `,
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
          action:
            amount > 0
              ? 'wallet_credit'
              : 'wallet_debit',
          targetType: 'user',
          targetId: userId,
          targetLabel:
            String(
              userResult.rows[0]?.email ??
                userId,
            ),
          details: {
            amount,
            balanceBefore:
              currentBalance,
            balanceAfter:
              newBalance,
            reason,
          },
          ip: clientIp(req),
        });
      }

      res.json({
        ok: true,
        balanceBefore:
          currentBalance,
        balanceAfter:
          newBalance,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/users/:id/wallet failed',
      );

      res.status(500).json({
        error:
          'Failed to adjust wallet.',
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
        String(req.params.id ?? '');

      const limit =
        Math.min(
          100,
          Math.max(
            1,
            Number.parseInt(
              String(
                req.query.limit ??
                  '50',
              ),
              10,
            ) || 50,
          ),
        );

      const result =
        await db.execute(
          sql`
            SELECT
              t.*
            FROM transactions t
            WHERE t.user_id = ${userId}
            ORDER BY
              t.created_at DESC
            LIMIT ${limit}
          `,
        );

      res.json({
        ok: true,
        data: result.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/users/:id/transactions failed',
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
  requireAdmin,
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      await db.execute(
        sql`SELECT 1`,
      );

      res.json({
        ok: true,
        database: 'connected',
        time:
          new Date().toISOString(),
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/health failed',
      );

      res.status(500).json({
        ok: false,
        database: 'error',
      });
    }
  },
);

export default router;
