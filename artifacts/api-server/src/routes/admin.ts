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
          eq(
            adminAccountsTable.email,
            email,
          ),
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
            FROM users
            WHERE kyc_status = 'verified'
          )::int AS verified_users,

          (
            SELECT COUNT(*)
            FROM users
            WHERE kyc_status = 'pending'
          )::int AS pending_kyc_users,

          (
            SELECT COUNT(*)
            FROM users
            WHERE kyc_status = 'unverified'
          )::int AS unverified_users,

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
              SUM(amount) FILTER (
                WHERE status = 'success'
                  AND type != 'wallet_fund'
              ),
              0
            )
            FROM transactions
          )::numeric AS total_revenue,

          (
            SELECT COALESCE(
              SUM(amount),
              0
            )
            FROM transactions
            WHERE status = 'success'
              AND type != 'wallet_fund'
              AND created_at >= CURRENT_DATE
          )::numeric AS today_revenue,

          (
            SELECT COALESCE(
              SUM(amount),
              0
            )
            FROM transactions
            WHERE status = 'success'
              AND type != 'wallet_fund'
              AND created_at >= CURRENT_DATE - INTERVAL '7 days'
          )::numeric AS week_revenue,

          (
            SELECT COALESCE(
              SUM(amount),
              0
            )
            FROM transactions
            WHERE status = 'success'
              AND type != 'wallet_fund'
              AND created_at >= CURRENT_DATE - INTERVAL '30 days'
          )::numeric AS month_revenue,

          (
            SELECT COALESCE(
              SUM(balance),
              0
            )
            FROM wallets
          )::numeric AS total_wallet_balance,

          (
            SELECT COALESCE(
              AVG(amount),
              0
            )
            FROM transactions
            WHERE status = 'success'
              AND type != 'wallet_fund'
          )::numeric AS avg_transaction_value
      `);

      const row =
        result.rows[0] as Record<
          string,
          unknown
        >;

      res.json({
        totalUsers: Number(
          row['total_users'] ?? 0,
        ),
        activeUsers: Number(
          row['active_users'] ?? 0,
        ),
        suspendedUsers: Number(
          row['suspended_users'] ?? 0,
        ),
        verifiedUsers: Number(
          row['verified_users'] ?? 0,
        ),
        pendingKycUsers: Number(
          row['pending_kyc_users'] ?? 0,
        ),
        unverifiedUsers: Number(
          row['unverified_users'] ?? 0,
        ),
        totalTransactions: Number(
          row['total_transactions'] ?? 0,
        ),
        successfulTransactions: Number(
          row['successful_transactions'] ?? 0,
        ),
        pendingTransactions: Number(
          row['pending_transactions'] ?? 0,
        ),
        failedTransactions: Number(
          row['failed_transactions'] ?? 0,
        ),
        totalRevenue: Number(
          row['total_revenue'] ?? 0,
        ),
        todayRevenue: Number(
          row['today_revenue'] ?? 0,
        ),
        weekRevenue: Number(
          row['week_revenue'] ?? 0,
        ),
        monthRevenue: Number(
          row['month_revenue'] ?? 0,
        ),
        totalWalletBalance: Number(
          row['total_wallet_balance'] ?? 0,
        ),
        avgTransactionValue: Number(
          row['avg_transaction_value'] ?? 0,
        ),
      });
    } catch (err) {
      logger.error(
        { err },
        'admin/stats failed',
      );

      res.status(500).json({
        error: 'Failed to load statistics.',
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
          ? Math.min(
              Math.floor(limitRaw),
              100,
            )
          : 50;

      const offset =
        (page - 1) * limit;

      const result =
        await db.execute(sql`
          SELECT
            u.id,
            u.name,
            u.first_name,
            u.last_name,
            u.phone,
            u.email,
            u.status,
            COALESCE(
              w.balance,
              '0'
            )::numeric AS wallet_balance,
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
        total,
        page,
        limit,
        totalPages:
          Math.ceil(
            total / limit,
          ),
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
        Number.isFinite(pageRaw) &&
        pageRaw > 0
          ? Math.floor(pageRaw)
          : 1;

      const limit =
        Number.isFinite(limitRaw) &&
        limitRaw > 0
          ? Math.min(
              Math.floor(limitRaw),
              100,
            )
          : 50;

      const offset =
        (page - 1) * limit;

      const result =
        await db.execute(sql`
          SELECT
            t.id,
            t.user_id,
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
            ) AS user_phone,
            t.type,
            t.service,
            t.provider,
            t.amount,
            t.status,
            t.description,
            t.reference,
            t.created_at,
            t.updated_at
          FROM transactions t
          LEFT JOIN users u
            ON u.id = t.user_id
          WHERE
            (
              ${search} = ''
              OR t.id::text ILIKE ${`%${search}%`}
              OR t.user_id::text ILIKE ${`%${search}%`}
              OR COALESCE(
                u.name,
                ''
              ) ILIKE ${`%${search}%`}
              OR COALESCE(
                u.phone,
                ''
              ) ILIKE ${`%${search}%`}
              OR COALESCE(
                t.reference,
                ''
              ) ILIKE ${`%${search}%`}
            )
            AND (
              ${status} = ''
              OR t.status::text = ${status}
            )
            AND (
              ${type} = ''
              OR t.type::text = ${type}
            )
          ORDER BY
            t.created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `);

      const countResult =
        await db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM transactions t
          LEFT JOIN users u
            ON u.id = t.user_id
          WHERE
            (
              ${search} = ''
              OR t.id::text ILIKE ${`%${search}%`}
              OR t.user_id::text ILIKE ${`%${search}%`}
              OR COALESCE(
                u.name,
                ''
              ) ILIKE ${`%${search}%`}
              OR COALESCE(
                u.phone,
                ''
              ) ILIKE ${`%${search}%`}
              OR COALESCE(
                t.reference,
                ''
              ) ILIKE ${`%${search}%`}
            )
            AND (
              ${status} = ''
              OR t.status::text = ${status}
            )
            AND (
              ${type} = ''
              OR t.type::text = ${type}
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
        transactions:
          result.rows.map(
            (row) => {
              const r =
                row as Record<
                  string,
                  unknown
                >;

              return {
                id: String(
                  r['id'] ?? '',
                ),

                userId: String(
                  r['user_id'] ?? '',
                ),

                userName:
                  String(
                    r['user_name'] ??
                      'Unknown user',
                  ),

                userPhone:
                  String(
                    r['user_phone'] ??
                      '',
                  ),

                phone:
                  String(
                    r['user_phone'] ??
                      '',
                  ),

                type:
                  String(
                    r['type'] ??
                      '',
                  ),

                service:
                  String(
                    r['service'] ??
                      '',
                  ),

                provider:
                  String(
                    r['provider'] ??
                      '',
                  ),

                amount:
                  Number(
                    r['amount'] ??
                      0,
                  ),

                date:
                  r['created_at']
                    ? new Date(
                        String(
                          r[
                            'created_at'
                          ],
                        ),
                      ).toLocaleDateString()
                    : '',

                time:
                  r['created_at']
                    ? new Date(
                        String(
                          r[
                            'created_at'
                          ],
                        ),
                      ).toLocaleTimeString(
                        [],
                        {
                          hour:
                            '2-digit',
                          minute:
                            '2-digit',
                        },
                      )
                    : '',

                status:
                  String(
                    r['status'] ??
                      'pending',
                  ),

                description:
                  String(
                    r[
                      'description'
                    ] ??
                      '',
                  ),

                reference:
                  String(
                    r[
                      'reference'
                    ] ??
                      '',
                  ),

                createdAt:
                  r['created_at']
                    ? String(
                        r[
                          'created_at'
                        ],
                      )
                    : null,

                updatedAt:
                  r['updated_at']
                    ? String(
                        r[
                          'updated_at'
                        ],
                      )
                    : null,
              };
            },
          ),

        total,
        page,
        limit,
        totalPages:
          Math.ceil(
            total / limit,
          ),
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
  '/admins',
  requireSuperAdmin,
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const admins =
        await db
          .select({
            id:
              adminAccountsTable.id,
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
          .from(
            adminAccountsTable,
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
          'Failed to load admin accounts.',
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
            COALESCE(
              w.balance,
              '0'
            )::numeric AS wallet_balance,
            COUNT(
              DISTINCT t.id
            )::int AS transaction_count,
            COALESCE(
              SUM(
                t.amount
              ) FILTER (
                WHERE t.status =
                  'success'
                  AND t.type !=
                    'wallet_fund'
              ),
              0
            )::numeric AS total_spent,
            MAX(
              t.created_at
            ) AS last_transaction_at
          FROM users u
          LEFT JOIN wallets w
            ON w.user_id =
              u.id
          LEFT JOIN transactions t
            ON t.user_id =
              u.id
          WHERE u.id =
            ${id}
          GROUP BY
            u.id,
            w.balance
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
