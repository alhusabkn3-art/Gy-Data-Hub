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

const BOOTSTRAP_PIN = process.env['ADMIN_PIN'] ?? '1251';

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

  if (existing.length > 0) {
    return;
  }

  const pinHash = await hashPin(
    BOOTSTRAP_PIN,
  );

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
      await ensureSuperAdmin();

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
          ? req.body.pin
          : '';

      if (!email || !pin) {
        res.status(400).json({
          error:
            'Email and PIN are required.',
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
        res.status(401).json({
          error:
            'Invalid admin credentials.',
        });
        return;
      }

      if (admin.status !== 'active') {
        res.status(403).json({
          error:
            'Admin account is not active.',
        });
        return;
      }

      const valid = await verifyPin(
        pin,
        admin.pinHash,
      );

      if (!valid) {
        res.status(401).json({
          error:
            'Invalid admin credentials.',
        });
        return;
      }

      req.session.isAdmin = true;
      req.session.adminId = admin.id;
      req.session.adminEmail = admin.email;
      req.session.adminRole = admin.role;

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
          email: admin.email,
          role: admin.role,
          status: admin.status,
        },
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/login failed',
      );

      res.status(500).json({
        error:
          'Failed to authenticate admin.',
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
          adminId:
            req.session.adminId,
          adminEmail:
            req.session.adminEmail,
          action: 'admin_logout',
          ip: clientIp(req),
        });
      }

      req.session.isAdmin = false;
      req.session.adminId = undefined;
      req.session.adminEmail =
        undefined;
      req.session.adminRole =
        undefined;

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
        error:
          'Failed to logout admin.',
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

      const [admin] = await db
        .select({
          id: adminAccountsTable.id,
          email:
            adminAccountsTable.email,
          role:
            adminAccountsTable.role,
          status:
            adminAccountsTable.status,
          createdAt:
            adminAccountsTable.createdAt,
          updatedAt:
            adminAccountsTable.updatedAt,
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
          error:
            'Admin account not found.',
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
        error:
          'Failed to load admin profile.',
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
      const result =
        await db.execute(sql`
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
                SUM(amount),
                0
              )
              FROM transactions
              WHERE status = 'success'
            )::double precision AS total_transaction_value
        `);

      res.json(
        result.rows[0] ?? {
          total_users: 0,
          active_users: 0,
          total_transactions: 0,
          successful_transactions: 0,
          pending_transactions: 0,
          failed_transactions: 0,
          total_transaction_value: 0,
        },
      );
    } catch (err) {
      logger.error(
        { err },
        'admin/stats failed',
      );

      res.status(500).json({
        error:
          'Failed to load admin stats.',
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

      const search =
        typeof req.query.search ===
        'string'
          ? req.query.search.trim()
          : '';

      const searchPattern = `%${search}%`;

      const result =
        await db.execute(sql`
          SELECT
            id,
            name,
            phone,
            email,
            status,
            wallet_balance,
            created_at
          FROM users
          ${
            search
              ? sql`
                  WHERE
                    name ILIKE ${searchPattern}
                    OR phone ILIKE ${searchPattern}
                    OR email ILIKE ${searchPattern}
                `
              : sql``
          }
          ORDER BY created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `);

      res.json({
        users: result.rows,
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

      const result =
        await db.execute(sql`
          SELECT
            t.id,
            t.user_id AS "userId",
            COALESCE(u.name, '') AS "userName",
            u.phone AS "phone",
            t.type,
            t.service,
            t.provider,
            CAST(
              t.amount AS DOUBLE PRECISION
            ) AS "amount",
            TO_CHAR(
              t.created_at,
              'DD Mon YYYY'
            ) AS "date",
            TO_CHAR(
              t.created_at,
              'HH12:MI AM'
            ) AS "time",
            t.status,
            t.description,
            COALESCE(
              t.reference,
              ''
            ) AS "reference"
          FROM transactions AS t
          LEFT JOIN users AS u
            ON u.id = t.user_id
          ORDER BY t.created_at DESC
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
  '/audit-logs',
  requireAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
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

      const result =
        await db.execute(sql`
          SELECT
            *
          FROM admin_audit_logs
          ORDER BY created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `);

      res.json({
        logs: result.rows,
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

router.post(
  '/admins',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
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
          ? req.body.pin
          : '';

      const role =
        req.body?.role ===
        'super_admin'
          ? 'super_admin'
          : 'admin';

      if (!email || !pin) {
        res.status(400).json({
          error:
            'Email and PIN are required.',
        });
        return;
      }

      if (
        pin.length <
        MIN_BOOTSTRAP_PIN_LENGTH
      ) {
        res.status(400).json({
          error:
            'PIN is too short.',
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
            'An admin with this email already exists.',
        });
        return;
      }

      const pinHash =
        await hashPin(pin);

      const [created] = await db
        .insert(adminAccountsTable)
        .values({
          email,
          pinHash,
          role,
          status: 'active',
        })
        .returning({
          id: adminAccountsTable.id,
          email:
            adminAccountsTable.email,
          role:
            adminAccountsTable.role,
          status:
            adminAccountsTable.status,
          createdAt:
            adminAccountsTable.createdAt,
        });

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
            'admin_created',
          targetType: 'admin',
          targetId: created?.id,
          targetLabel: email,
          ip: clientIp(req),
        });
      }

      res.status(201).json({
        admin: created,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admins create failed',
      );

      res.status(500).json({
        error:
          'Failed to create admin.',
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
          email:
            adminAccountsTable.email,
          role:
            adminAccountsTable.role,
          status:
            adminAccountsTable.status,
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
        admins,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admins failed',
      );

      res.status(500).json({
        error:
          'Failed to load admins.',
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
        req.body?.status ===
        'active'
          ? 'active'
          : req.body?.status ===
              'suspended'
            ? 'suspended'
            : null;

      if (!status) {
        res.status(400).json({
          error:
            'Invalid admin status.',
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
          email:
            adminAccountsTable.email,
          role:
            adminAccountsTable.role,
          status:
            adminAccountsTable.status,
          updatedAt:
            adminAccountsTable.updatedAt,
        });

      if (!updated) {
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
            'admin_status_updated',
          targetType: 'admin',
          targetId: updated.id,
          targetLabel:
            updated.email,
          details: {
            status,
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
        'admin/admin status update failed',
      );

      res.status(500).json({
        error:
          'Failed to update admin status.',
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
        typeof req.body?.pin ===
        'string'
          ? req.body.pin
          : '';

      if (
        pin.length <
        MIN_BOOTSTRAP_PIN_LENGTH
      ) {
        res.status(400).json({
          error:
            'PIN is too short.',
        });
        return;
      }

      const pinHash =
        await hashPin(pin);

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
          email:
            adminAccountsTable.email,
          role:
            adminAccountsTable.role,
          status:
            adminAccountsTable.status,
          updatedAt:
            adminAccountsTable.updatedAt,
        });

      if (!updated) {
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
            'admin_pin_updated',
          targetType: 'admin',
          targetId: updated.id,
          targetLabel:
            updated.email,
          ip: clientIp(req),
        });
      }

      res.json({
        admin: updated,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admin pin update failed',
      );

      res.status(500).json({
        error:
          'Failed to update admin PIN.',
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
        .select({
          id: usersTable.id,
          name: usersTable.name,
          phone: usersTable.phone,
          email: usersTable.email,
          status: usersTable.status,
          walletBalance:
            usersTable.walletBalance,
          createdAt:
            usersTable.createdAt,
          updatedAt:
            usersTable.updatedAt,
        })
        .from(usersTable)
        .where(
          eq(usersTable.id, id),
        )
        .limit(1);

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
        'admin/user detail failed',
      );

      res.status(500).json({
        error:
          'Failed to load user.',
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
      const id = req.params.id;

      const status =
        req.body?.status ===
        'active'
          ? 'active'
          : req.body?.status ===
              'suspended'
            ? 'suspended'
            : null;

      if (!status) {
        res.status(400).json({
          error:
            'Invalid user status.',
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
          eq(usersTable.id, id),
        )
        .returning({
          id: usersTable.id,
          name: usersTable.name,
          phone: usersTable.phone,
          email: usersTable.email,
          status: usersTable.status,
          walletBalance:
            usersTable.walletBalance,
          updatedAt:
            usersTable.updatedAt,
        });

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
        await auditLog({
          adminId:
            req.session.adminId,
          adminEmail:
            req.session.adminEmail,
          action:
            'user_status_updated',
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
        error:
          'Failed to update user status.',
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

      const result =
        await db.execute(sql`
          UPDATE users
          SET
            wallet_balance =
              wallet_balance +
              ${amountRaw},
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
        await auditLog({
          adminId:
            req.session.adminId,
          adminEmail:
            req.session.adminEmail,
          action:
            'user_wallet_adjusted',
          targetType: 'user',
          targetId: id,
          targetLabel:
            (
              updated as {
                phone?: string;
                email?: string;
                id: string;
              }
            ).phone ??
            (
              updated as {
                phone?: string;
                email?: string;
                id: string;
              }
            ).email ??
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

      const result =
        await db.execute(sql`
          SELECT
            *
          FROM transactions
          WHERE user_id = ${userId}
          ORDER BY created_at DESC
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
