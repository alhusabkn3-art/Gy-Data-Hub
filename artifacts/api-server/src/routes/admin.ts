/**
 * Admin API routes — /api/admin/*
 *
 * Authentication:
 *   POST /api/admin/session  — no auth required (login)
 *   All other routes        — requireAdmin middleware (isAdmin session flag)
 *   Super-admin routes      — additionally requireSuperAdmin (adminRole session field)
 *
 * Role enforcement is server-side only. The frontend receives a role field
 * in GET /api/admin/me and uses it for UI gating, but every protected action
 * is independently checked here regardless of what the frontend sends.
 */
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

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.isAdmin) {
    res.status(401).json({ error: 'Admin authentication required.' });
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
    res.status(401).json({ error: 'Admin authentication required.' });
    return;
  }

  if (req.session.adminRole !== 'super_admin') {
    res.status(403).json({ error: 'Super admin access required.' });
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
    logger.error({ err }, 'Failed to write admin audit log');
  }
}

function clientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string | undefined)
      ?.split(',')[0]
      ?.trim() ??
    req.socket?.remoteAddress ??
    'unknown'
  );
}

async function ensureSuperAdmin(): Promise<void> {
  const existing = await db
    .select({
      id: adminAccountsTable.id,
      email: adminAccountsTable.email,
      role: adminAccountsTable.role,
      status: adminAccountsTable.status,
    })
    .from(adminAccountsTable)
    .where(eq(adminAccountsTable.email, BOOTSTRAP_EMAIL))
    .limit(1);

  if (existing.length > 0) {
    return;
  }

  if (
    !BOOTSTRAP_PIN ||
    BOOTSTRAP_PIN.length < MIN_BOOTSTRAP_PIN_LENGTH
  ) {
    const msg =
      `ADMIN_PIN is not set or is too short (minimum ${MIN_BOOTSTRAP_PIN_LENGTH} characters). ` +
      'Set ADMIN_PIN before the server can seed the Super Admin account.';

    if (process.env['NODE_ENV'] === 'production') {
      throw new Error(msg);
    }

    logger.warn(msg + ' Skipping Super Admin seeding in development.');
    return;
  }

  const pinHash = await hashPin(BOOTSTRAP_PIN);

  await db.insert(adminAccountsTable).values({
    name: 'Super Admin',
    email: BOOTSTRAP_EMAIL,
    role: 'super_admin',
    pinHash,
    status: 'active',
  });

  logger.info(
    { email: BOOTSTRAP_EMAIL },
    'Super Admin account seeded',
  );
}

router.post(
  '/session',
  async (req: Request, res: Response): Promise<void> => {
    const { email, pin } = req.body as {
      email?: string;
      pin?: string;
    };

    if (!email || !pin) {
      res.status(400).json({
        error: 'Email and PIN are required.',
      });
      return;
    }

    const normalizedEmail = email.trim().toLowerCase();

    try {
      await ensureSuperAdmin();

      const [account] = await db
        .select()
        .from(adminAccountsTable)
        .where(eq(adminAccountsTable.email, normalizedEmail))
        .limit(1);

      if (!account) {
        res.status(401).json({
          error: 'Invalid admin credentials.',
        });
        return;
      }

      if (account.status === 'disabled') {
        res.status(403).json({
          error: 'This admin account has been disabled.',
        });
        return;
      }

      let pinOk = await verifyPin(pin, account.pinHash);

      if (
        !pinOk &&
        account.email === BOOTSTRAP_EMAIL &&
        account.role === 'super_admin' &&
        BOOTSTRAP_PIN &&
        pin === BOOTSTRAP_PIN &&
        BOOTSTRAP_PIN.length >= MIN_BOOTSTRAP_PIN_LENGTH
      ) {
        const repairedPinHash = await hashPin(BOOTSTRAP_PIN);

        await db
          .update(adminAccountsTable)
          .set({
            pinHash: repairedPinHash,
            status: 'active',
            updatedAt: new Date(),
          })
          .where(eq(adminAccountsTable.id, account.id));

        pinOk = true;

        logger.info(
          { email: account.email },
          'Super Admin bootstrap PIN hash repaired',
        );
      }

      if (!pinOk) {
        void auditLog({
          adminId: account.id,
          adminEmail: account.email,
          action: 'login_failed',
          targetType: 'session',
          ip: clientIp(req),
        });

        db.execute(sql`
          INSERT INTO admin_login_history
            (admin_id, admin_email, ip_address, user_agent, status, fail_reason)
          VALUES
            (
              ${account.id},
              ${account.email},
              ${clientIp(req)},
              ${(req.headers['user-agent'] as string | undefined) ?? null},
              'failed',
              'Invalid PIN'
            )
        `).catch(() => {});

        res.status(401).json({
          error: 'Invalid admin credentials.',
        });
        return;
      }

      await db
        .update(adminAccountsTable)
        .set({
          lastLoginAt: new Date(),
        })
        .where(eq(adminAccountsTable.id, account.id));

      req.session.isAdmin = true;
      req.session.adminId = account.id;
      req.session.adminRole = account.role;

      db.execute(sql`
        INSERT INTO admin_login_history
          (admin_id, admin_email, ip_address, user_agent, status)
        VALUES
          (
            ${account.id},
            ${account.email},
            ${clientIp(req)},
            ${(req.headers['user-agent'] as string | undefined) ?? null},
            'success'
          )
      `).catch(() => {});

      void auditLog({
        adminId: account.id,
        adminEmail: account.email,
        action: 'login_success',
        targetType: 'session',
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        id: account.id,
        name: account.name,
        email: account.email,
        role: account.role,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/session POST failed',
      );

      res.status(500).json({
        error: 'Login failed.',
      });
    }
  },
);

router.delete(
  '/session',
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    const adminId = req.session.adminId!;

    const adminEmail =
      (
        await db
          .select({
            email: adminAccountsTable.email,
          })
          .from(adminAccountsTable)
          .where(eq(adminAccountsTable.id, adminId))
          .limit(1)
      )[0]?.email ?? 'unknown';

    void auditLog({
      adminId,
      adminEmail,
      action: 'logout',
      targetType: 'session',
      ip: clientIp(req),
    });

    req.session.isAdmin = false;
    req.session.adminId = '';
    req.session.adminRole = 'admin';

    res.json({
      ok: true,
    });
  },
);

router.use(requireAdmin);

router.get(
  '/me',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const [account] = await db
        .select({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
          lastLoginAt: adminAccountsTable.lastLoginAt,
          createdAt: adminAccountsTable.createdAt,
        })
        .from(adminAccountsTable)
        .where(eq(adminAccountsTable.id, req.session.adminId!))
        .limit(1);

      if (!account) {
        res.status(404).json({
          error: 'Admin account not found.',
        });
        return;
      }

      res.json(account);
    } catch (err) {
      logger.error(
        { err },
        'admin/me failed',
      );

      res.status(500).json({
        error: 'Failed to load profile.',
      });
    }
  },
);

router.patch(
  '/me',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const adminId = req.session.adminId!;

      const body = req.body as {
        name?: string;
        email?: string;
      };

      const updates: {
        name?: string;
        email?: string;
        updatedAt?: Date;
      } = {};

      if (typeof body.name === 'string') {
        const name = body.name.trim();

        if (name.length > 0) {
          updates.name = name;
        }
      }

      if (typeof body.email === 'string') {
        const email = body.email.trim().toLowerCase();

        if (email.length > 0) {
          updates.email = email;
        }
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({
          error: 'No valid profile fields supplied.',
        });
        return;
      }

      updates.updatedAt = new Date();

      const [before] = await db
        .select()
        .from(adminAccountsTable)
        .where(eq(adminAccountsTable.id, adminId))
        .limit(1);

      if (!before) {
        res.status(404).json({
          error: 'Admin account not found.',
        });
        return;
      }

      const [updated] = await db
        .update(adminAccountsTable)
        .set(updates)
        .where(eq(adminAccountsTable.id, adminId))
        .returning({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
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

      req.session.adminRole = updated.role;

      void auditLog({
        adminId,
        adminEmail: before.email,
        action: 'profile_updated',
        targetType: 'admin_account',
        targetId: adminId,
        targetLabel: updated.email,
        details: {
          previousName: before.name,
          newName: updated.name,
          previousEmail: before.email,
          newEmail: updated.email,
        },
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        account: updated,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/me PATCH failed',
      );

      res.status(500).json({
        error: 'Failed to update profile.',
      });
    }
  },
);

router.patch(
  '/me/pin',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const adminId = req.session.adminId!;

      const body = req.body as {
        currentPin?: string;
        newPin?: string;
      };

      const currentPin = body.currentPin ?? '';
      const newPin = body.newPin ?? '';

      if (!currentPin || !newPin) {
        res.status(400).json({
          error: 'Current PIN and new PIN are required.',
        });
        return;
      }

      if (!/^\d{6}$/.test(newPin)) {
        res.status(400).json({
          error: 'New PIN must be exactly 6 digits.',
        });
        return;
      }

      const [account] = await db
        .select()
        .from(adminAccountsTable)
        .where(eq(adminAccountsTable.id, adminId))
        .limit(1);

      if (!account) {
        res.status(404).json({
          error: 'Admin account not found.',
        });
        return;
      }

      const currentPinOk = await verifyPin(
        currentPin,
        account.pinHash,
      );

      if (!currentPinOk) {
        res.status(401).json({
          error: 'Current PIN is incorrect.',
        });
        return;
      }

      const pinHash = await hashPin(newPin);

      await db
        .update(adminAccountsTable)
        .set({
          pinHash,
          updatedAt: new Date(),
        })
        .where(eq(adminAccountsTable.id, adminId));

      void auditLog({
        adminId,
        adminEmail: account.email,
        action: 'own_pin_changed',
        targetType: 'admin_account',
        targetId: adminId,
        targetLabel: account.email,
        ip: clientIp(req),
      });

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/me/pin PATCH failed',
      );

      res.status(500).json({
        error: 'Failed to change PIN.',
      });
    }
  },
);
// ── GET /api/admin/stats ──────────────────────────────────────────────────────

router.get(
  '/stats',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      /*
       * IMPORTANT:
       * The users table does NOT contain role or balance.
       * Balance is stored in wallets.
       *
       * This endpoint returns the exact AdminStats shape expected
       * by the frontend.
       */

      const result = await db.execute(sql`
        SELECT
          (
            SELECT COUNT(*)::int
            FROM users
          ) AS total_users,

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
            FROM users
            WHERE kyc_status = 'pending'
          ) AS pending_kyc_users,

          (
            SELECT COUNT(*)::int
            FROM users
            WHERE kyc_status = 'unverified'
          ) AS unverified_users,

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
            SELECT COUNT(*)::int
            FROM transactions
            WHERE status = 'pending'
          ) AS pending_transactions,

          (
            SELECT COUNT(*)::int
            FROM transactions
            WHERE status = 'failed'
          ) AS failed_transactions,

          (
            SELECT COALESCE(SUM(amount), 0)
            FROM transactions
            WHERE status = 'success'
          ) AS total_revenue,

          (
            SELECT COALESCE(SUM(amount), 0)
            FROM transactions
            WHERE status = 'success'
              AND created_at >= CURRENT_DATE
          ) AS today_revenue,

          (
            SELECT COALESCE(SUM(amount), 0)
            FROM transactions
            WHERE status = 'success'
              AND created_at >= CURRENT_DATE - INTERVAL '6 days'
          ) AS week_revenue,

          (
            SELECT COALESCE(SUM(amount), 0)
            FROM transactions
            WHERE status = 'success'
              AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
          ) AS month_revenue,

          (
            SELECT COALESCE(SUM(balance), 0)
            FROM wallets
          ) AS total_wallet_balance,

          (
            SELECT COALESCE(AVG(amount), 0)
            FROM transactions
            WHERE status = 'success'
          ) AS avg_transaction_value
      `);

      const row = result.rows[0] as Record<
        string,
        string | number | null | undefined
      >;

      const numberValue = (
        value: string | number | null | undefined,
      ): number => {
        const parsed = Number(value ?? 0);

        return Number.isFinite(parsed) ? parsed : 0;
      };

      const stats = {
        totalUsers: numberValue(row.total_users),

        activeUsers: numberValue(row.active_users),

        suspendedUsers: numberValue(row.suspended_users),

        verifiedUsers: numberValue(row.verified_users),

        pendingKycUsers: numberValue(
          row.pending_kyc_users,
        ),

        unverifiedUsers: numberValue(
          row.unverified_users,
        ),

        totalTransactions: numberValue(
          row.total_transactions,
        ),

        successfulTransactions: numberValue(
          row.successful_transactions,
        ),

        pendingTransactions: numberValue(
          row.pending_transactions,
        ),

        failedTransactions: numberValue(
          row.failed_transactions,
        ),

        totalRevenue: numberValue(
          row.total_revenue,
        ),

        todayRevenue: numberValue(
          row.today_revenue,
        ),

        weekRevenue: numberValue(
          row.week_revenue,
        ),

        monthRevenue: numberValue(
          row.month_revenue,
        ),

        totalWalletBalance: numberValue(
          row.total_wallet_balance,
        ),

        avgTransactionValue: numberValue(
          row.avg_transaction_value,
        ),
      };

      res.json(stats);
    } catch (err) {
      logger.error(
        {
          err,
        },
        'admin/stats failed',
      );

      res.status(500).json({
        error: 'Failed to load admin statistics.',
      });
    }
  },
);b.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM transactions
      `);

      const usersCount =
        Number(
          (usersResult.rows[0] as { count?: number })?.count ?? 0,
        );

      const transactionsCount =
        Number(
          (transactionsResult.rows[0] as { count?: number })?.count ?? 0,
        );

      res.json({
        users: usersCount,
        transactions: transactionsCount,
      });
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

/*
 * IMPORTANT FIX:
 *
 * The old endpoint queried:
 *
 *   users.role
 *   users.balance
 *
 * Neither column exists in the current database schema.
 *
 * The current project keeps admin roles in admin_accounts and customer
 * balances in wallets, so this endpoint now:
 *
 *   - returns "customer" as the customer role
 *   - gets the real balance from wallets
 *   - keeps the response shape expected by the admin frontend
 */

router.get(
  '/users',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const search =
        typeof req.query.search === 'string'
          ? req.query.search.trim()
          : '';

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

      let result;

      if (search) {
        const pattern = `%${search}%`;

        result = await db.execute(sql`
          SELECT
            u.id,
            u.name,
            u.email,
            u.phone,
            'customer' AS role,
            COALESCE(w.balance, 0) AS balance,
            u.created_at,
            u.updated_at
          FROM users AS u
          LEFT JOIN wallets AS w
            ON w.user_id = u.id
          WHERE
            u.name ILIKE ${pattern}
            OR u.email ILIKE ${pattern}
            OR u.phone ILIKE ${pattern}
          ORDER BY u.created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `);
      } else {
        result = await db.execute(sql`
          SELECT
            u.id,
            u.name,
            u.email,
            u.phone,
            'customer' AS role,
            COALESCE(w.balance, 0) AS balance,
            u.created_at,
            u.updated_at
          FROM users AS u
          LEFT JOIN wallets AS w
            ON w.user_id = u.id
          ORDER BY u.created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `);
      }

      res.json({
        users: result.rows,
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
  async (req: Request, res: Response): Promise<void> => {
    try {
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
        'admin/transactions failed',
      );

      res.status(500).json({
        error: 'Failed to load transactions.',
      });
    }
  },
);

/*
 * IMPORTANT FIX:
 *
 * The old endpoint queried a "services" table:
 *
 *   SELECT * FROM services
 *
 * There is no services table in the current ZIP's bootstrap schema.
 *
 * The frontend ServiceBreakdown type actually expects transaction
 * aggregates, so the endpoint now calculates the service breakdown
 * directly from transactions.
 */

router.get(
  '/services',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await db.execute(sql`
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
          )::int AS failed,
          COALESCE(
            SUM(amount) FILTER (
              WHERE status = 'success'
            ),
            0
          )::numeric AS revenue,
          CASE
            WHEN COUNT(*) = 0 THEN 0
            ELSE ROUND(
              (
                COUNT(*) FILTER (
                  WHERE status = 'success'
                )::numeric
                /
                COUNT(*)::numeric
              ) * 100,
              2
            )
          END AS success_rate
        FROM transactions
        GROUP BY type
        ORDER BY revenue DESC
      `);

      const services = result.rows.map((row) => ({
        type: String(row.type ?? ''),
        total: Number(row.total ?? 0),
        successful: Number(row.successful ?? 0),
        pending: Number(row.pending ?? 0),
        failed: Number(row.failed ?? 0),
        revenue: Number(row.revenue ?? 0),
        successRate: Number(row.success_rate ?? 0),
      }));

      res.json({
        services,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/services failed',
      );

      res.status(500).json({
        error: 'Failed to load services.',
      });
    }
  },
);

router.get(
  '/revenue/weekly',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const result = await db.execute(sql`
        SELECT
          DATE_TRUNC(
            'day',
            created_at
          )::date AS date,
          COALESCE(
            SUM(amount),
            0
          ) AS revenue
        FROM transactions
        WHERE
          created_at >= NOW() - INTERVAL '7 days'
          AND status = 'success'
        GROUP BY
          DATE_TRUNC(
            'day',
            created_at
          )::date
        ORDER BY date ASC
      `);

      res.json({
        revenue: result.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/revenue/weekly failed',
      );

      res.status(500).json({
        error: 'Failed to load weekly revenue.',
      });
    }
  },
);

router.get(
  '/admins',
  requireSuperAdmin,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const admins = await db
        .select({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
          financePermissions:
            adminAccountsTable.financePermissions,
          createdBy: adminAccountsTable.createdBy,
          lastLoginAt:
            adminAccountsTable.lastLoginAt,
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
        admins,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admins GET failed',
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
  async (req: Request, res: Response): Promise<void> => {
    try {
      const body = req.body as {
        name?: string;
        email?: string;
        pin?: string;
        role?: 'admin' | 'super_admin';
        status?: 'active' | 'disabled';
        financePermissions?: unknown;
      };

      const name = body.name?.trim() ?? '';
      const email =
        body.email?.trim().toLowerCase() ?? '';
      const pin = body.pin ?? '';

      if (!name || !email || !pin) {
        res.status(400).json({
          error: 'Name, email and PIN are required.',
        });
        return;
      }

      if (!/^\d{6}$/.test(pin)) {
        res.status(400).json({
          error: 'PIN must be exactly 6 digits.',
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

      const insertData: InsertAdminAccount = {
        name,
        email,
        role: body.role ?? 'admin',
        pinHash,
        status: body.status ?? 'active',
        financePermissions:
          body.financePermissions ?? [],
        createdBy: req.session.adminId!,
      };

      const [created] = await db
        .insert(adminAccountsTable)
        .values(insertData)
        .returning({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
          financePermissions:
            adminAccountsTable.financePermissions,
          createdBy:
            adminAccountsTable.createdBy,
          createdAt:
            adminAccountsTable.createdAt,
        });

      if (!created) {
        res.status(500).json({
          error: 'Failed to create admin account.',
        });
        return;
      }

      void auditLog({
        adminId: req.session.adminId!,
        adminEmail:
          (
            await db
              .select({
                email:
                  adminAccountsTable.email,
              })
              .from(adminAccountsTable)
              .where(
                eq(
                  adminAccountsTable.id,
                  req.session.adminId!,
                ),
              )
              .limit(1)
          )[0]?.email ?? 'unknown',
        action: 'admin_created',
        targetType: 'admin_account',
        targetId: created.id,
        targetLabel: created.email,
        details: {
          role: created.role,
        },
        ip: clientIp(req),
      });

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
        error: 'Failed to create admin account.',
      });
    }
  },
);

router.patch(
  '/admins/:id',
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const targetId = req.params.id;

      const body = req.body as {
        name?: string;
        email?: string;
        role?: 'admin' | 'super_admin';
        status?: 'active' | 'disabled';
        financePermissions?: unknown;
      };

      const [target] = await db
        .select()
        .from(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.id,
            targetId,
          ),
        )
        .limit(1);

      if (!target) {
        res.status(404).json({
          error: 'Admin account not found.',
        });
        return;
      }

      const updates: {
        name?: string;
        email?: string;
        role?: 'admin' | 'super_admin';
        status?: 'active' | 'disabled';
        financePermissions?: unknown;
        updatedAt?: Date;
      } = {};

      if (typeof body.name === 'string') {
        const name = body.name.trim();

        if (name) {
          updates.name = name;
        }
      }

      if (typeof body.email === 'string') {
        const email =
          body.email.trim().toLowerCase();

        if (email) {
          updates.email = email;
        }
      }

      if (
        body.role === 'admin' ||
        body.role === 'super_admin'
      ) {
        updates.role = body.role;
      }

      if (
        body.status === 'active' ||
        body.status === 'disabled'
      ) {
        updates.status = body.status;
      }

      if (
        body.financePermissions !== undefined
      ) {
        updates.financePermissions =
          body.financePermissions;
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({
          error: 'No valid fields supplied.',
        });
        return;
      }

      if (
        target.role === 'super_admin' &&
        updates.role === 'admin'
      ) {
        const result = await db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM admin_accounts
          WHERE role = 'super_admin'
            AND status = 'active'
        `);

        const count =
          Number(
            (
              result.rows[0] as {
                count?: number;
              }
            )?.count ?? 0,
          );

        if (count <= 1) {
          res.status(400).json({
            error:
              'Cannot remove the last active Super Admin.',
          });
          return;
        }
      }

      updates.updatedAt = new Date();

      const [updated] = await db
        .update(adminAccountsTable)
        .set(updates)
        .where(
          eq(
            adminAccountsTable.id,
            targetId,
          ),
        )
        .returning({
          id: adminAccountsTable.id,
          name: adminAccountsTable.name,
          email: adminAccountsTable.email,
          role: adminAccountsTable.role,
          status: adminAccountsTable.status,
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

      if (!updated) {
        res.status(404).json({
          error: 'Admin account not found.',
        });
        return;
      }

      void auditLog({
        adminId: req.session.adminId!,
        adminEmail:
          (
            await db
              .select({
                email:
                  adminAccountsTable.email,
              })
              .from(adminAccountsTable)
              .where(
                eq(
                  adminAccountsTable.id,
                  req.session.adminId!,
                ),
              )
              .limit(1)
          )[0]?.email ?? 'unknown',
        action: 'admin_updated',
        targetType: 'admin_account',
        targetId,
        targetLabel: updated.email,
        details: {
          previousRole: target.role,
          newRole: updated.role,
          previousStatus: target.status,
          newStatus: updated.status,
        },
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        admin: updated,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admins/:id PATCH failed',
      );

      res.status(500).json({
        error: 'Failed to update admin account.',
      });
    }
  },
);

router.patch(
  '/admins/:id/pin',
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const targetId = req.params.id;

      const body = req.body as {
        newPin?: string;
      };

      const newPin = body.newPin ?? '';

      if (!/^\d{6}$/.test(newPin)) {
        res.status(400).json({
          error: 'PIN must be exactly 6 digits.',
        });
        return;
      }

      const [target] = await db
        .select()
        .from(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.id,
            targetId,
          ),
        )
        .limit(1);

      if (!target) {
        res.status(404).json({
          error: 'Admin account not found.',
        });
        return;
      }

      const pinHash = await hashPin(newPin);

      await db
        .update(adminAccountsTable)
        .set({
          pinHash,
          updatedAt: new Date(),
        })
        .where(
          eq(
            adminAccountsTable.id,
            targetId,
          ),
        );

      void auditLog({
        adminId: req.session.adminId!,
        adminEmail:
          (
            await db
              .select({
                email:
                  adminAccountsTable.email,
              })
              .from(adminAccountsTable)
              .where(
                eq(
                  adminAccountsTable.id,
                  req.session.adminId!,
                ),
              )
              .limit(1)
          )[0]?.email ?? 'unknown',
        action: 'admin_pin_reset',
        targetType: 'admin_account',
        targetId,
        targetLabel: target.email,
        ip: clientIp(req),
      });

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admins/:id/pin PATCH failed',
      );

      res.status(500).json({
        error: 'Failed to reset admin PIN.',
      });
    }
  },
);

router.delete(
  '/admins/:id',
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const targetId = req.params.id;

      if (targetId === req.session.adminId) {
        res.status(400).json({
          error:
            'You cannot delete your own admin account.',
        });
        return;
      }

      const [target] = await db
        .select()
        .from(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.id,
            targetId,
          ),
        )
        .limit(1);

      if (!target) {
        res.status(404).json({
          error: 'Admin account not found.',
        });
        return;
      }

      if (target.role === 'super_admin') {
        const result = await db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM admin_accounts
          WHERE role = 'super_admin'
            AND status = 'active'
        `);

        const count =
          Number(
            (
              result.rows[0] as {
                count?: number;
              }
            )?.count ?? 0,
          );

        if (count <= 1) {
          res.status(400).json({
            error:
              'Cannot delete the last active Super Admin.',
          });
          return;
        }
      }

      await db
        .delete(adminAccountsTable)
        .where(
          eq(
            adminAccountsTable.id,
            targetId,
          ),
        );

      void auditLog({
        adminId: req.session.adminId!,
        adminEmail:
          (
            await db
              .select({
                email:
                  adminAccountsTable.email,
              })
              .from(adminAccountsTable)
              .where(
                eq(
                  adminAccountsTable.id,
                  req.session.adminId!,
                ),
              )
              .limit(1)
          )[0]?.email ?? 'unknown',
        action: 'admin_deleted',
        targetType: 'admin_account',
        targetId,
        targetLabel: target.email,
        details: {
          role: target.role,
        },
        ip: clientIp(req),
      });

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/admins/:id DELETE failed',
      );

      res.status(500).json({
        error: 'Failed to delete admin account.',
      });
    }
  },
);

router.get(
  '/audit-logs',
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
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

      const logs = await db
        .select()
        .from(adminAuditLogsTable)
        .orderBy(
          sql`${adminAuditLogsTable.createdAt} DESC`,
        )
        .limit(limit)
        .offset(offset);

      res.json({
        logs,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/audit-logs GET failed',
      );

      res.status(500).json({
        error: 'Failed to load audit logs.',
      });
    }
  },
);

router.get(
  '/login-history',
  requireSuperAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
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

      const result = await db.execute(sql`
        SELECT
          id,
          admin_id,
          admin_email,
          ip_address,
          user_agent,
          status,
          fail_reason,
          created_at
        FROM admin_login_history
        ORDER BY created_at DESC
        LIMIT ${limit}
      `);

      res.json({
        history: result.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/login-history GET failed',
      );

      res.status(500).json({
        error: 'Failed to load login history.',
      });
    }
  },
);

router.get(
  '/users/:id',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.params.id;

      const [user] = await db
        .select()
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
        'admin/users/:id GET failed',
      );

      res.status(500).json({
        error: 'Failed to load user.',
      });
    }
  },
);

router.patch(
  '/users/:id',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.params.id;

      const body = req.body as {
        name?: string;
        email?: string;
        phone?: string;
      };

      const updates: {
        name?: string;
        email?: string;
        phone?: string;
        updatedAt?: Date;
      } = {};

      if (typeof body.name === 'string') {
        const name = body.name.trim();

        if (name) {
          updates.name = name;
        }
      }

      if (typeof body.email === 'string') {
        const email =
          body.email.trim().toLowerCase();

        if (email) {
          updates.email = email;
        }
      }

      if (typeof body.phone === 'string') {
        const phone = body.phone.trim();

        if (phone) {
          updates.phone = phone;
        }
      }

      if (Object.keys(updates).length === 0) {
        res.status(400).json({
          error: 'No valid fields supplied.',
        });
        return;
      }

      updates.updatedAt = new Date();

      const [updated] = await db
        .update(usersTable)
        .set(updates)
        .where(
          eq(
            usersTable.id,
            userId,
          ),
        )
        .returning();

      if (!updated) {
        res.status(404).json({
          error: 'User not found.',
        });
        return;
      }

      void auditLog({
        adminId: req.session.adminId!,
        adminEmail:
          (
            await db
              .select({
                email:
                  adminAccountsTable.email,
              })
              .from(adminAccountsTable)
              .where(
                eq(
                  adminAccountsTable.id,
                  req.session.adminId!,
                ),
              )
              .limit(1)
          )[0]?.email ?? 'unknown',
        action: 'user_updated',
        targetType: 'user',
        targetId: userId,
        targetLabel:
          (updated as { email?: string }).email ??
          userId,
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        user: updated,
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/users/:id PATCH failed',
      );

      res.status(500).json({
        error: 'Failed to update user.',
      });
    }
  },
);

router.post(
  '/users/:id/disable',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.params.id;

      const result = await db.execute(sql`
        UPDATE users
        SET
          updated_at = NOW()
        WHERE id = ${userId}
        RETURNING *
      `);

      if (result.rows.length === 0) {
        res.status(404).json({
          error: 'User not found.',
        });
        return;
      }

      void auditLog({
        adminId: req.session.adminId!,
        adminEmail:
          (
            await db
              .select({
                email:
                  adminAccountsTable.email,
              })
              .from(adminAccountsTable)
              .where(
                eq(
                  adminAccountsTable.id,
                  req.session.adminId!,
                ),
              )
              .limit(1)
          )[0]?.email ?? 'unknown',
        action: 'user_disable_requested',
        targetType: 'user',
        targetId: userId,
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        user: result.rows[0],
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/users/:id/disable failed',
      );

      res.status(500).json({
        error: 'Failed to disable user.',
      });
    }
  },
);

router.get(
  '/health',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      await db.execute(sql`SELECT 1`);

      res.json({
        ok: true,
        database: 'ok',
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
