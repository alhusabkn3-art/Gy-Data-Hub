import crypto from 'node:crypto';

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

import { logger } from '../lib/logger.js';
import { getWalletBalance } from '../lib/smeapi.js';

const router = Router();

/* -------------------------------------------------------------------------- */
/* AUTH                                                                       */
/* -------------------------------------------------------------------------- */

function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (
    !req.session.isAdmin ||
    !req.session.adminId
  ) {
    res.status(401).json({
      error:
        'Admin authentication required.',
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
  if (
    !req.session.isAdmin ||
    !req.session.adminId
  ) {
    res.status(401).json({
      error:
        'Admin authentication required.',
    });

    return;
  }

  if (
    req.session.adminRole !==
    'super_admin'
  ) {
    res.status(403).json({
      error:
        'Super admin access required.',
    });

    return;
  }

  next();
}

router.use(
  requireAdmin,
);

/* -------------------------------------------------------------------------- */
/* HELPERS                                                                    */
/* -------------------------------------------------------------------------- */

function n(
  value: unknown,
  fallback = 0,
): number {
  const result = Number(
    value ?? fallback,
  );

  return Number.isFinite(
    result,
  )
    ? result
    : fallback;
}

function s(
  value: unknown,
  fallback = '',
): string {
  return value == null
    ? fallback
    : String(value);
}

function pageArgs(
  req: Request,
): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(
    1,
    n(
      req.query.page,
      1,
    ),
  );

  const limit = Math.min(
    100,
    Math.max(
      1,
      n(
        req.query.limit,
        25,
      ),
    ),
  );

  return {
    page,
    limit,
    offset:
      (page - 1) * limit,
  };
}

function makeReference(
  prefix: string,
): string {
  return `${prefix}-${Date.now()}-${crypto
    .randomBytes(3)
    .toString('hex')
    .toUpperCase()}`;
}

function clientIp(
  req: Request,
): string | null {
  const forwarded =
    req.headers[
      'x-forwarded-for'
    ];

  if (
    typeof forwarded ===
    'string'
  ) {
    return forwarded
      .split(',')[0]
      .trim();
  }

  return (
    req.ip ??
    req.socket.remoteAddress ??
    null
  );
}

/* -------------------------------------------------------------------------- */
/* TOTP                                                                       */
/* -------------------------------------------------------------------------- */

function base32Encode(
  bytes: Buffer,
): string {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  let bits = 0;
  let value = 0;
  let output = '';

  for (
    const byte of bytes
  ) {
    value =
      (value << 8) |
      byte;

    bits += 8;

    while (bits >= 5) {
      output +=
        alphabet[
          (value >>>
            (bits - 5)) &
            31
        ];

      bits -= 5;
    }
  }

  if (bits > 0) {
    output +=
      alphabet[
        (value <<
          (5 - bits)) &
          31
      ];
  }

  return output;
}

function base32Decode(
  input: string,
): Buffer {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

  let bits = 0;
  let value = 0;

  const output: number[] =
    [];

  for (
    const character of input
      .replace(
        /=+$/u,
        '',
      )
      .toUpperCase()
  ) {
    const index =
      alphabet.indexOf(
        character,
      );

    if (index < 0) {
      throw new Error(
        'Invalid TOTP secret.',
      );
    }

    value =
      (value << 5) |
      index;

    bits += 5;

    if (bits >= 8) {
      output.push(
        (value >>>
          (bits - 8)) &
          255,
      );

      bits -= 8;
    }
  }

  return Buffer.from(
    output,
  );
}

function generateTotp(
  secret: string,
  counter: number,
): string {
  const key =
    base32Decode(secret);

  const buffer =
    Buffer.alloc(8);

  buffer.writeBigUInt64BE(
    BigInt(counter),
  );

  const digest =
    crypto
      .createHmac(
        'sha1',
        key,
      )
      .update(buffer)
      .digest();

  const offset =
    digest[
      digest.length - 1
    ] & 0x0f;

  const code =
    ((digest[offset] &
      0x7f) <<
      24) |
    ((digest[offset + 1] &
      0xff) <<
      16) |
    ((digest[offset + 2] &
      0xff) <<
      8) |
    (digest[offset + 3] &
      0xff);

  return String(
    code % 1000000,
  ).padStart(
    6,
    '0',
  );
}

function verifyTotp(
  secret: string,
  token: string,
): boolean {
  const counter =
    Math.floor(
      Date.now() /
        1000 /
        30,
    );

  for (
    let delta = -1;
    delta <= 1;
    delta += 1
  ) {
    if (
      generateTotp(
        secret,
        counter + delta,
      ) === token
    ) {
      return true;
    }
  }

  return false;
}

/* -------------------------------------------------------------------------- */
/* SYSTEM SETTINGS HELPERS                                                    */
/* -------------------------------------------------------------------------- */

async function getSystemSetting(
  key: string,
): Promise<string | null> {
  const result =
    await db.execute(sql`
      SELECT value
      FROM system_settings
      WHERE key = ${key}
      LIMIT 1
    `);

  if (
    !result.rows.length
  ) {
    return null;
  }

  return String(
    (
      result.rows[0] as Record<
        string,
        unknown
      >
    ).value ?? '',
  );
}

/* -------------------------------------------------------------------------- */
/* DASHBOARD                                                                  */
/* -------------------------------------------------------------------------- */

router.get(
  '/dashboard',
  async (
    _req,
    res,
  ): Promise<void> => {
    try {
      const [
        stats,
        weekly,
        daily,
        monthly,
        activity,
      ] =
        await Promise.all([
          db.execute(sql`
            SELECT

              (
                SELECT COUNT(*)
                FROM users
              )::int AS users,

              (
                SELECT COUNT(*)
                FROM users
                WHERE status = 'active'
              )::int AS active_users,

              (
                SELECT COALESCE(
                  SUM(balance),
                  0
                )
                FROM wallets
              )::numeric AS wallet_balance,

              (
                SELECT COUNT(*)
                FROM transactions
              )::int AS transactions,

              (
                SELECT COUNT(*)
                FROM transactions
                WHERE status = 'pending'
              )::int AS pending,

              (
                SELECT COUNT(*)
                FROM transactions
                WHERE status = 'success'
              )::int AS successful,

              (
                SELECT COUNT(*)
                FROM transactions
                WHERE status = 'failed'
              )::int AS failed,

              (
                SELECT COALESCE(
                  SUM(amount),
                  0
                )
                FROM transactions
                WHERE
                  status = 'success'
                  AND type <> 'wallet_fund'
              )::numeric AS revenue,

              (
                SELECT COALESCE(
                  SUM(amount),
                  0
                )
                FROM transactions
                WHERE
                  status = 'success'
                  AND type <> 'wallet_fund'
                  AND created_at >= CURRENT_DATE
              )::numeric AS today_revenue,

              (
                SELECT COALESCE(
                  SUM(amount),
                  0
                )
                FROM transactions
                WHERE
                  status = 'success'
                  AND type <> 'wallet_fund'
                  AND created_at >=
                    CURRENT_DATE - INTERVAL '7 days'
              )::numeric AS week_revenue,

              (
                SELECT COALESCE(
                  SUM(amount),
                  0
                )
                FROM transactions
                WHERE
                  status = 'success'
                  AND type <> 'wallet_fund'
                  AND created_at >=
                    CURRENT_DATE - INTERVAL '30 days'
              )::numeric AS month_revenue,

              (
                SELECT COALESCE(
                  AVG(amount),
                  0
                )
                FROM transactions
                WHERE
                  status = 'success'
                  AND type <> 'wallet_fund'
              )::numeric AS avg_value
          `),

          db.execute(sql`
            SELECT
              TO_CHAR(
                d.day,
                'YYYY-MM-DD'
              ) AS day,

              COALESCE(
                SUM(t.amount)
                  FILTER (
                    WHERE
                      t.status = 'success'
                      AND t.type <> 'wallet_fund'
                  ),
                0
              )::numeric AS amount,

              COUNT(t.id)
                FILTER (
                  WHERE
                    t.status = 'success'
                    AND t.type <> 'wallet_fund'
                )::int AS count

            FROM generate_series(
              CURRENT_DATE - INTERVAL '6 days',
              CURRENT_DATE,
              INTERVAL '1 day'
            ) d(day)

            LEFT JOIN transactions t
              ON t.created_at >= d.day
             AND t.created_at <
                 d.day + INTERVAL '1 day'

            GROUP BY d.day
            ORDER BY d.day
          `),

          db.execute(sql`
            SELECT
              TO_CHAR(
                d.day,
                'YYYY-MM-DD'
              ) AS day,

              COALESCE(
                SUM(t.amount)
                  FILTER (
                    WHERE
                      t.status = 'success'
                      AND t.type <> 'wallet_fund'
                  ),
                0
              )::numeric AS revenue,

              COUNT(t.id)
                FILTER (
                  WHERE
                    t.status = 'success'
                    AND t.type <> 'wallet_fund'
                )::int AS count

            FROM generate_series(
              CURRENT_DATE - INTERVAL '29 days',
              CURRENT_DATE,
              INTERVAL '1 day'
            ) d(day)

            LEFT JOIN transactions t
              ON t.created_at >= d.day
             AND t.created_at <
                 d.day + INTERVAL '1 day'

            GROUP BY d.day
            ORDER BY d.day
          `),

          db.execute(sql`
            SELECT
              TO_CHAR(
                date_trunc(
                  'month',
                  d.month
                ),
                'YYYY-MM'
              ) AS month,

              COALESCE(
                SUM(t.amount)
                  FILTER (
                    WHERE
                      t.status = 'success'
                      AND t.type <> 'wallet_fund'
                  ),
                0
              )::numeric AS revenue,

              COUNT(t.id)
                FILTER (
                  WHERE
                    t.status = 'success'
                    AND t.type <> 'wallet_fund'
                )::int AS count

            FROM generate_series(
              date_trunc(
                'month',
                CURRENT_DATE
              ) - INTERVAL '11 months',

              date_trunc(
                'month',
                CURRENT_DATE
              ),

              INTERVAL '1 month'
            ) d(month)

            LEFT JOIN transactions t
              ON t.created_at >= d.month
             AND t.created_at <
                 d.month + INTERVAL '1 month'

            GROUP BY d.month
            ORDER BY d.month
          `),

          db.execute(sql`
            SELECT
              id,
              action,
              admin_email,
              target_label,
              created_at

            FROM admin_audit_logs

            ORDER BY created_at DESC
            LIMIT 20
          `),
        ]);

      const row =
        (stats.rows[0] ??
          {}) as Record<
          string,
          unknown
        >;

      res.json({
        totalUsers:
          n(row.users),

        activeUsers:
          n(row.active_users),

        totalWalletBalance:
          n(row.wallet_balance),

        totalTransactions:
          n(row.transactions),

        pendingTransactions:
          n(row.pending),

        successfulTransactions:
          n(row.successful),

        failedTransactions:
          n(row.failed),

        totalRevenue:
          n(row.revenue),

        todayRevenue:
          n(row.today_revenue),

        weekRevenue:
          n(row.week_revenue),

        monthRevenue:
          n(row.month_revenue),

        avgTransactionValue:
          n(row.avg_value),

        dailyRevenue:
          daily.rows.map(
            (item) => ({
              day: s(
                (
                  item as any
                ).day,
              ),
              revenue:
                n(
                  (
                    item as any
                  ).revenue,
                ),
              count:
                n(
                  (
                    item as any
                  ).count,
                ),
            }),
          ),

        weeklyRevenue:
          weekly.rows.map(
            (item) => ({
              week: s(
                (
                  item as any
                ).day,
              ),
              revenue:
                n(
                  (
                    item as any
                  ).amount,
                ),
              count:
                n(
                  (
                    item as any
                  ).count,
                ),
            }),
          ),

        monthlyRevenue:
          monthly.rows.map(
            (item) => ({
              month: s(
                (
                  item as any
                ).month,
              ),
              revenue:
                n(
                  (
                    item as any
                  ).revenue,
                ),
              count:
                n(
                  (
                    item as any
                  ).count,
                ),
            }),
          ),

        profitMargin: 0,
        totalCost: 0,
        netProfit:
          n(row.revenue),

        activeUsersToday:
          n(
            row.active_users,
          ),

        newUsersThisWeek: 0,

        recentActivity:
          activity.rows.map(
            (item) => ({
              id: s(
                (
                  item as any
                ).id,
              ),
              action: s(
                (
                  item as any
                ).action,
              ),
              adminEmail: s(
                (
                  item as any
                ).admin_email,
              ),
              targetLabel:
                (
                  item as any
                ).target_label
                  ? s(
                      (
                        item as any
                      ).target_label,
                    )
                  : null,
              createdAt: s(
                (
                  item as any
                ).created_at,
              ),
            }),
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /admin/dashboard failed',
      );

      res.status(500).json({
        error:
          'Failed to load dashboard.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* STATS                                                                      */
/* -------------------------------------------------------------------------- */

router.get(
  '/stats',
  async (
    _req,
    res,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          SELECT

            COUNT(*)::int
              AS total_users,

            COUNT(*)
              FILTER (
                WHERE status = 'active'
              )::int
              AS active_users,

            COUNT(*)
              FILTER (
                WHERE status = 'suspended'
              )::int
              AS suspended_users,

            COUNT(*)
              FILTER (
                WHERE kyc_status = 'verified'
              )::int
              AS verified_users,

            COUNT(*)
              FILTER (
                WHERE kyc_status = 'pending'
              )::int
              AS pending_kyc,

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
              WHERE
                status = 'success'
                AND type <> 'wallet_fund'
            )::numeric AS total_revenue,

            (
              SELECT COALESCE(
                SUM(amount),
                0
              )
              FROM transactions
              WHERE
                status = 'success'
                AND type <> 'wallet_fund'
                AND created_at >= CURRENT_DATE
            )::numeric AS today_revenue,

            (
              SELECT COALESCE(
                SUM(amount),
                0
              )
              FROM transactions
              WHERE
                status = 'success'
                AND type <> 'wallet_fund'
                AND created_at >=
                  CURRENT_DATE - INTERVAL '7 days'
            )::numeric AS week_revenue,

            (
              SELECT COALESCE(
                SUM(amount),
                0
              )
              FROM transactions
              WHERE
                status = 'success'
                AND type <> 'wallet_fund'
                AND created_at >=
                  CURRENT_DATE - INTERVAL '30 days'
            )::numeric AS month_revenue,

            (
              SELECT COALESCE(
                SUM(balance),
                0
              )
              FROM wallets
            )::numeric AS wallet_balance,

            (
              SELECT COALESCE(
                AVG(amount),
                0
              )
              FROM transactions
              WHERE
                status = 'success'
                AND type <> 'wallet_fund'
            )::numeric AS avg_value

          FROM users
        `);

      const row =
        (result.rows[0] ??
          {}) as Record<
          string,
          unknown
        >;

      const totalUsers =
        n(row.total_users);

      const verified =
        n(
          row.verified_users,
        );

      const pendingKyc =
        n(
          row.pending_kyc,
        );

      res.json({
        totalUsers,

        activeUsers:
          n(row.active_users),

        suspendedUsers:
          n(
            row.suspended_users,
          ),

        verifiedUsers:
          verified,

        pendingKycUsers:
          pendingKyc,

        unverifiedUsers:
          Math.max(
            0,
            totalUsers -
              verified -
              pendingKyc,
          ),

        totalTransactions:
          n(
            row.total_transactions,
          ),

        successfulTransactions:
          n(
            row.successful_transactions,
          ),

        pendingTransactions:
          n(
            row.pending_transactions,
          ),

        failedTransactions:
          n(
            row.failed_transactions,
          ),

        totalRevenue:
          n(row.total_revenue),

        todayRevenue:
          n(
            row.today_revenue,
          ),

        weekRevenue:
          n(
            row.week_revenue,
          ),

        monthRevenue:
          n(
            row.month_revenue,
          ),

        totalWalletBalance:
          n(
            row.wallet_balance,
          ),

        avgTransactionValue:
          n(row.avg_value),
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /admin/stats failed',
      );

      res.status(500).json({
        error:
          'Failed to load admin statistics.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* REVENUE                                                                    */
/* -------------------------------------------------------------------------- */

router.get(
  '/revenue/weekly',
  async (
    _req,
    res,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          SELECT
            TO_CHAR(
              d.day,
              'YYYY-MM-DD'
            ) AS day,

            COALESCE(
              SUM(t.amount)
                FILTER (
                  WHERE
                    t.status = 'success'
                    AND t.type <> 'wallet_fund'
                ),
              0
            )::numeric AS amount

          FROM generate_series(
            CURRENT_DATE - INTERVAL '6 days',
            CURRENT_DATE,
            INTERVAL '1 day'
          ) d(day)

          LEFT JOIN transactions t
            ON t.created_at >= d.day
           AND t.created_at <
               d.day + INTERVAL '1 day'

          GROUP BY d.day
          ORDER BY d.day
        `);

      res.json({
        revenue:
          result.rows.map(
            (item) => ({
              day: s(
                (
                  item as any
                ).day,
              ),
              amount:
                n(
                  (
                    item as any
                  ).amount,
                ),
            }),
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /admin/revenue/weekly failed',
      );

      res.status(500).json({
        error:
          'Failed to load weekly revenue.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* SERVICES                                                                   */
/* -------------------------------------------------------------------------- */

router.get(
  '/services',
  async (
    _req,
    res,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          SELECT
            type,

            COUNT(*)::int
              AS total,

            COUNT(*)
              FILTER (
                WHERE status = 'success'
              )::int
              AS successful,

            COUNT(*)
              FILTER (
                WHERE status = 'pending'
              )::int
              AS pending,

            COUNT(*)
              FILTER (
                WHERE status = 'failed'
              )::int
              AS failed,

            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE status = 'success'
                ),
              0
            )::numeric AS revenue

          FROM transactions

          GROUP BY type

          ORDER BY revenue DESC
        `);

      res.json({
        services:
          result.rows.map(
            (item) => {
              const row =
                item as any;

              const total =
                n(row.total);

              return {
                type:
                  s(row.type),

                total,

                successful:
                  n(
                    row.successful,
                  ),

                pending:
                  n(row.pending),

                failed:
                  n(row.failed),

                revenue:
                  n(row.revenue),

                successRate:
                  total > 0
                    ? Math.round(
                        (n(
                          row.successful,
                        ) /
                          total) *
                          10000,
                      ) / 100
                    : 0,
              };
            },
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /admin/services failed',
      );

      res.status(500).json({
        error:
          'Failed to load services.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* USERS                                                                      */
/* -------------------------------------------------------------------------- */

router.get(
  '/users',
  async (
    req,
    res,
  ): Promise<void> => {
    const {
      page,
      limit,
      offset,
    } = pageArgs(req);

    const search =
      s(
        req.query.search,
      ).trim();

    const status =
      s(
        req.query.status,
      ).trim();

    const kyc =
      s(
        req.query.kyc,
      ).trim();

    try {
      const conditions = [
        sql`TRUE`,
      ];

      if (search) {
        conditions.push(
          sql`
            (
              u.name ILIKE ${`%${search}%`}
              OR u.email ILIKE ${`%${search}%`}
              OR u.phone ILIKE ${`%${search}%`}
              OR u.account_number ILIKE ${`%${search}%`}
            )
          `,
        );
      }

      if (status) {
        conditions.push(
          sql`u.status = ${status}`,
        );
      }

      if (kyc) {
        conditions.push(
          sql`u.kyc_status = ${kyc}`,
        );
      }

      const where =
        sql.join(
          conditions,
          sql` AND `,
        );

      const [
        count,
        rows,
      ] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM users u
          WHERE ${where}
        `),

        db.execute(sql`
          SELECT
            u.*,

            COALESCE(
              w.balance,
              0
            )::numeric AS wallet_balance,

            (
              SELECT COUNT(*)
              FROM transactions t
              WHERE t.user_id = u.id
            )::int AS transaction_count,

            (
              SELECT COALESCE(
                SUM(t.amount),
                0
              )
              FROM transactions t
              WHERE
                t.user_id = u.id
                AND t.status = 'success'
                AND t.type <> 'wallet_fund'
            )::numeric AS total_spent

          FROM users u

          LEFT JOIN wallets w
            ON w.user_id = u.id

          WHERE ${where}

          ORDER BY
            u.created_at DESC

          LIMIT ${limit}
          OFFSET ${offset}
        `),
      ]);

      const total =
        n(
          (
            count.rows[0] as any
          )?.total,
        );

      res.json({
        page,
        limit,
        total,

        totalPages:
          Math.max(
            1,
            Math.ceil(
              total / limit,
            ),
          ),

        users:
          rows.rows.map(
            (item) => {
              const row =
                item as any;

              return {
                id: s(row.id),
                name: s(row.name),
                firstName:
                  s(
                    row.first_name,
                  ),
                lastName:
                  s(
                    row.last_name,
                  ),
                email:
                  s(row.email),
                phone:
                  s(row.phone),

                accountNumber:
                  s(
                    row.account_number,
                  ),

                bankName:
                  s(row.bank_name),

                referralCode:
                  s(
                    row.referral_code,
                  ),

                kycStatus:
                  s(
                    row.kyc_status,
                  ),

                status:
                  s(row.status),

                walletBalance:
                  n(
                    row.wallet_balance,
                  ),

                balance:
                  n(
                    row.wallet_balance,
                  ),

                transactionCount:
                  n(
                    row.transaction_count,
                  ),

                totalSpent:
                  n(
                    row.total_spent,
                  ),

                joinedDate:
                  s(
                    row.created_at,
                  ),

                createdAt:
                  s(
                    row.created_at,
                  ),

                updatedAt:
                  s(
                    row.updated_at,
                  ),
              };
            },
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /admin/users failed',
      );

      res.status(500).json({
        error:
          'Failed to load users.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* USER PROFILE                                                               */
/* -------------------------------------------------------------------------- */

router.get(
  '/users/:id',
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          SELECT
            u.*,

            COALESCE(
              w.balance,
              0
            )::numeric AS wallet_balance,

            (
              SELECT COUNT(*)
              FROM transactions t
              WHERE t.user_id = u.id
            )::int AS transaction_count,

            (
              SELECT COALESCE(
                SUM(t.amount),
                0
              )
              FROM transactions t
              WHERE
                t.user_id = u.id
                AND t.status = 'success'
                AND t.type <> 'wallet_fund'
            )::numeric AS total_spent

          FROM users u

          LEFT JOIN wallets w
            ON w.user_id = u.id

          WHERE u.id = ${req.params.id}

          LIMIT 1
        `);

      if (!result.rows.length) {
        res.status(404).json({
          error:
            'User not found.',
        });

        return;
      }

      const row =
        result.rows[0] as any;

      res.json({
        id: s(row.id),
        name: s(row.name),
        firstName:
          s(row.first_name),
        lastName:
          s(row.last_name),
        email: s(row.email),
        phone: s(row.phone),

        accountNumber:
          s(row.account_number),

        bankName:
          s(row.bank_name),

        referralCode:
          s(row.referral_code),

        kycStatus:
          s(row.kyc_status),

        status:
          s(row.status),

        walletBalance:
          n(row.wallet_balance),

        transactionCount:
          n(row.transaction_count),

        totalSpent:
          n(row.total_spent),

        createdAt:
          s(row.created_at),

        updatedAt:
          s(row.updated_at),
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /admin/users/:id failed',
      );

      res.status(500).json({
        error:
          'Failed to load user.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* USER WALLET                                                                */
/* -------------------------------------------------------------------------- */

router.get(
  '/users/:id/wallet',
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      const [
        wallet,
        ledger,
      ] = await Promise.all([
        db.execute(sql`
          SELECT *
          FROM wallets
          WHERE user_id = ${req.params.id}
          LIMIT 1
        `),

        db.execute(sql`
          SELECT

            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE
                    type IN (
                      'credit',
                      'wallet_fund'
                    )
                ),
              0
            )::numeric AS credit,

            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE type = 'debit'
                ),
              0
            )::numeric AS debit,

            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE type = 'reversal'
                ),
              0
            )::numeric AS reversed,

            COUNT(*)::int AS count

          FROM wallet_ledger

          WHERE user_id =
            ${req.params.id}
        `),
      ]);

      if (!wallet.rows.length) {
        res.status(404).json({
          error:
            'Wallet not found.',
        });

        return;
      }

      const w =
        wallet.rows[0] as any;

      const l =
        ledger.rows[0] as any;

      res.json({
        id: s(w.id),
        walletId:
          s(w.id),

        userId:
          req.params.id,

        balance:
          n(w.balance),

        currency:
          'NGN',

        createdAt:
          s(w.created_at),

        updatedAt:
          s(w.updated_at),

        totalCredit:
          n(l.credit),

        totalDebit:
          n(l.debit),

        totalCredited:
          n(l.credit),

        totalDebited:
          n(l.debit),

        totalReversed:
          n(l.reversed),

        totalReversal:
          n(l.reversed),

        transactionCount:
          n(l.count),

        ledgerCount:
          n(l.count),
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /admin/users/:id/wallet failed',
      );

      res.status(500).json({
        error:
          'Failed to load wallet.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* WALLET LEDGER                                                              */
/* -------------------------------------------------------------------------- */

router.get(
  '/users/:id/wallet/ledger',
  async (
    req,
    res,
  ): Promise<void> => {
    const {
      page,
      limit,
      offset,
    } = pageArgs(req);

    try {
      const [
        count,
        rows,
      ] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM wallet_ledger
          WHERE user_id =
            ${req.params.id}
        `),

        db.execute(sql`
          SELECT
            wl.*,
            aa.name AS performed_by_name

          FROM wallet_ledger wl

          LEFT JOIN admin_accounts aa
            ON aa.id =
               wl.performed_by

          WHERE wl.user_id =
            ${req.params.id}

          ORDER BY
            wl.created_at DESC

          LIMIT ${limit}
          OFFSET ${offset}
        `),
      ]);

      const total =
        n(
          (
            count.rows[0] as any
          )?.total,
        );

      const pages =
        Math.max(
          1,
          Math.ceil(
            total / limit,
          ),
        );

      res.json({
        page,
        limit,
        total,
        pages,
        totalPages:
          pages,

        ledger:
          rows.rows,

        rows:
          rows.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'wallet ledger failed',
      );

      res.status(500).json({
        error:
          'Failed to load wallet ledger.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* USER TRANSACTIONS                                                           */
/* -------------------------------------------------------------------------- */

router.get(
  '/users/:id/transactions',
  async (
    req,
    res,
  ): Promise<void> => {
    const {
      page,
      limit,
      offset,
    } = pageArgs(req);

    const status =
      s(
        req.query.status,
      );

    try {
      const conditions = [
        sql`t.user_id = ${req.params.id}`,
      ];

      if (
        status &&
        status !== 'all'
      ) {
        conditions.push(
          sql`t.status = ${status}`,
        );
      }

      const where =
        sql.join(
          conditions,
          sql` AND `,
        );

      const [
        count,
        rows,
      ] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM transactions t
          WHERE ${where}
        `),

        db.execute(sql`
          SELECT
            t.*,
            u.name AS user_name,
            u.phone AS user_phone

          FROM transactions t

          LEFT JOIN users u
            ON u.id = t.user_id

          WHERE ${where}

          ORDER BY
            t.created_at DESC

          LIMIT ${limit}
          OFFSET ${offset}
        `),
      ]);

      const total =
        n(
          (
            count.rows[0] as any
          )?.total,
        );

      res.json({
        page,
        limit,
        total,

        pages:
          Math.max(
            1,
            Math.ceil(
              total / limit,
            ),
          ),

        transactions:
          rows.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'user transactions failed',
      );

      res.status(500).json({
        error:
          'Failed to load transactions.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* STATUS HISTORY                                                             */
/* -------------------------------------------------------------------------- */

router.get(
  '/users/:id/status-history',
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          SELECT
            ush.id,
            ush.user_id,
            ush.previous_status,
            ush.new_status,
            ush.reason,
            ush.performed_by,
            ush.created_at,
            aa.name AS changed_by_name

          FROM user_status_history ush

          LEFT JOIN admin_accounts aa
            ON aa.id =
               ush.performed_by

          WHERE ush.user_id =
            ${req.params.id}

          ORDER BY
            ush.created_at DESC
        `);

      res.json({
        history:
          result.rows.map(
            (item) => {
              const row =
                item as any;

              return {
                id:
                  s(row.id),

                userId:
                  s(row.user_id),

                oldStatus:
                  s(
                    row.previous_status,
                  ),

                newStatus:
                  s(
                    row.new_status,
                  ),

                reason:
                  row.reason
                    ? s(row.reason)
                    : null,

                changedBy:
                  row.changed_by_name
                    ? s(
                        row.changed_by_name,
                      )
                    : null,

                createdAt:
                  s(
                    row.created_at,
                  ),
              };
            },
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'status history failed',
      );

      res.status(500).json({
        error:
          'Failed to load status history.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* USER LOGIN HISTORY                                                         */
/* -------------------------------------------------------------------------- */

router.get(
  '/users/:id/login-history',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    const {
      page,
      limit,
      offset,
    } = pageArgs(req);

    try {
      const [
        count,
        rows,
      ] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM user_login_history
          WHERE user_id =
            ${req.params.id}
        `),

        db.execute(sql`
          SELECT
            id,
            user_id,
            ip_address,
            user_agent,
            success,
            created_at

          FROM user_login_history

          WHERE user_id =
            ${req.params.id}

          ORDER BY
            created_at DESC

          LIMIT ${limit}
          OFFSET ${offset}
        `),
      ]);

      const total =
        n(
          (
            count.rows[0] as any
          )?.total,
        );

      res.json({
        history:
          rows.rows,

        total,

        pages:
          Math.max(
            1,
            Math.ceil(
              total / limit,
            ),
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'user login history failed',
      );

      res.status(500).json({
        error:
          'Failed to load user login history.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* GENERAL TRANSACTIONS                                                        */
/* -------------------------------------------------------------------------- */

router.get(
  '/transactions',
  async (
    req,
    res,
  ): Promise<void> => {
    const {
      page,
      limit,
      offset,
    } = pageArgs(req);

    const search =
      s(
        req.query.search,
      ).trim();

    const status =
      s(
        req.query.status,
      ).trim();

    const type =
      s(
        req.query.type,
      ).trim();

    try {
      const conditions = [
        sql`TRUE`,
      ];

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

      if (search) {
        conditions.push(
          sql`
            (
              t.id::text ILIKE ${`%${search}%`}
              OR COALESCE(
                t.reference,
                ''
              ) ILIKE ${`%${search}%`}
              OR u.name ILIKE ${`%${search}%`}
              OR u.phone ILIKE ${`%${search}%`}
            )
          `,
        );
      }

      const where =
        sql.join(
          conditions,
          sql` AND `,
        );

      const [
        count,
        rows,
      ] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS total

          FROM transactions t

          LEFT JOIN users u
            ON u.id = t.user_id

          WHERE ${where}
        `),

        db.execute(sql`
          SELECT
            t.*,
            u.name AS user_name,
            u.phone AS user_phone,
            u.email AS user_email

          FROM transactions t

          LEFT JOIN users u
            ON u.id = t.user_id

          WHERE ${where}

          ORDER BY
            t.created_at DESC

          LIMIT ${limit}
          OFFSET ${offset}
        `),
      ]);

      const total =
        n(
          (
            count.rows[0] as any
          )?.total,
        );

      res.json({
        page,
        limit,
        total,

        totalPages:
          Math.max(
            1,
            Math.ceil(
              total / limit,
            ),
          ),

        transactions:
          rows.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /admin/transactions failed',
      );

      res.status(500).json({
        error:
          'Failed to load transactions.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* TRANSACTION DETAIL                                                         */
/* -------------------------------------------------------------------------- */

router.get(
  '/transactions/:id',
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          SELECT
            t.*,
            u.name AS user_name,
            u.phone AS user_phone,
            u.email AS user_email

          FROM transactions t

          LEFT JOIN users u
            ON u.id = t.user_id

          WHERE
            t.id::text =
              ${req.params.id}

            OR

            t.reference =
              ${req.params.id}

          LIMIT 1
        `);

      if (!result.rows.length) {
        res.status(404).json({
          error:
            'Transaction not found.',
        });

        return;
      }

      res.json({
        transaction:
          result.rows[0],

        ...(result.rows[0] as any),
      });
    } catch (err) {
      logger.error(
        { err },
        'transaction detail failed',
      );

      res.status(500).json({
        error:
          'Failed to load transaction.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* TRANSACTION REVIEW                                                         */
/* -------------------------------------------------------------------------- */

router.post(
  '/transactions/:id/mark-review',
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      await db.execute(sql`
        INSERT INTO admin_audit_logs
          (
            admin_id,
            admin_email,
            action,
            target_type,
            target_id,
            details,
            ip
          )

        VALUES
          (
            ${req.session.adminId},
            ${req.session.adminEmail ?? ''},
            'transaction_marked_review',
            'transaction',
            ${req.params.id},
            ${JSON.stringify({
              note: s(
                req.body?.note,
              ),
            })},
            ${clientIp(req)}
          )
      `);

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'mark transaction review failed',
      );

      res.status(500).json({
        error:
          'Failed to mark transaction for review.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* USER STATUS                                                                 */
/* -------------------------------------------------------------------------- */

router.patch(
  '/users/:id/status',
  async (
    req,
    res,
  ): Promise<void> => {
    const status =
      s(
        req.body?.status,
      );

    const reason =
      s(
        req.body?.reason,
      ).trim();

    if (
      ![
        'active',
        'suspended',
      ].includes(status)
    ) {
      res.status(400).json({
        error:
          'Invalid status.',
      });

      return;
    }

    try {
      await db.transaction(
        async (tx) => {
          const current =
            await tx.execute(sql`
              SELECT status
              FROM users
              WHERE id = ${req.params.id}
              FOR UPDATE
            `);

          if (
            !current.rows.length
          ) {
            throw new Error(
              'User not found.',
            );
          }

          const oldStatus =
            s(
              (
                current.rows[0] as any
              ).status,
            );

          if (
            oldStatus === status
          ) {
            return;
          }

          await tx.execute(sql`
            UPDATE users
            SET
              status = ${status},
              updated_at = NOW()

            WHERE id =
              ${req.params.id}
          `);

          await tx.execute(sql`
            INSERT INTO user_status_history
              (
                user_id,
                previous_status,
                new_status,
                reason,
                performed_by,
                created_at
              )

            VALUES
              (
                ${req.params.id},
                ${oldStatus},
                ${status},
                ${reason || null},
                ${req.session.adminId},
                NOW()
              )
          `);
        },
      );

      res.json({
        ok: true,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : 'Failed to update user status.';

      res.status(
        message ===
          'User not found.'
          ? 404
          : 500,
      ).json({
        error: message,
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* WALLET ADJUSTMENT                                                          */
/* -------------------------------------------------------------------------- */

async function adjustWallet(
  req: Request,
  res: Response,
  type:
    | 'credit'
    | 'debit',
): Promise<void> {
  const amount =
    Math.round(
      n(
        req.body?.amount,
      ) * 100,
    ) / 100;

  const reason =
    s(
      req.body?.reason,
    ).trim();

  if (
    !Number.isFinite(
      amount,
    ) ||
    amount <= 0
  ) {
    res.status(400).json({
      error:
        'A valid positive amount is required.',
    });

    return;
  }

  if (
    reason.length < 10
  ) {
    res.status(400).json({
      error:
        'Reason must be at least 10 characters.',
    });

    return;
  }

  try {
    const result =
      await db.transaction(
        async (tx) => {
          const wallet =
            await tx.execute(sql`
              SELECT
                id,
                balance

              FROM wallets

              WHERE user_id =
                ${req.params.id}

              LIMIT 1

              FOR UPDATE
            `);

          if (
            !wallet.rows.length
          ) {
            throw new Error(
              'User wallet not found.',
            );
          }

          const row =
            wallet.rows[0] as any;

          const before =
            n(row.balance);

          const after =
            type === 'credit'
              ? before + amount
              : before - amount;

          if (
            type === 'debit' &&
            after < 0
          ) {
            throw new Error(
              'Insufficient wallet balance.',
            );
          }

          const reference =
            makeReference(
              type === 'credit'
                ? 'ADMINFUND'
                : 'ADMINDEBIT',
            );

          await tx.execute(sql`
            UPDATE wallets

            SET
              balance =
                ${after.toFixed(2)},
              updated_at =
                NOW()

            WHERE id =
              ${row.id}
          `);

          await tx.execute(sql`
            INSERT INTO wallet_ledger
              (
                user_id,
                wallet_id,
                type,
                amount,
                balance_before,
                balance_after,
                reference,
                reason,
                performed_by,
                created_at
              )

            VALUES
              (
                ${req.params.id},
                ${row.id},
                ${type},
                ${amount.toFixed(2)},
                ${before.toFixed(2)},
                ${after.toFixed(2)},
                ${reference},
                ${reason},
                ${req.session.adminId},
                NOW()
              )
          `);

          return {
            reference,
            before,
            after,
          };
        },
      );

    res.json({
      ok: true,
      reference:
        result.reference,
      balanceBefore:
        result.before,
      balanceAfter:
        result.after,
      balance:
        result.after,
    });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.message
        : 'Wallet operation failed.';

    res.status(
      message ===
        'Insufficient wallet balance.'
        ? 400
        : 500,
    ).json({
      error: message,
    });
  }
}

router.post(
  '/users/:id/fund-wallet',
  (req, res) =>
    adjustWallet(
      req,
      res,
      'credit',
    ),
);

router.post(
  '/users/:id/wallet/debit',
  (req, res) =>
    adjustWallet(
      req,
      res,
      'debit',
    ),
);

/* -------------------------------------------------------------------------- */
/* REVERSALS                                                                  */
/* -------------------------------------------------------------------------- */

router.get(
  '/reversals',
  async (
    req,
    res,
  ): Promise<void> => {
    const {
      page,
      limit,
      offset,
    } = pageArgs(req);

    const search =
      s(
        req.query.search,
      ).trim();

    try {
      const conditions = [
        sql`TRUE`,
      ];

      if (search) {
        conditions.push(
          sql`
            (
              tr.reason ILIKE ${`%${search}%`}
              OR tr.id::text ILIKE ${`%${search}%`}
              OR t.reference ILIKE ${`%${search}%`}
            )
          `,
        );
      }

      const where =
        sql.join(
          conditions,
          sql` AND `,
        );

      const [
        count,
        rows,
      ] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS total

          FROM transaction_reversals tr

          LEFT JOIN transactions t
            ON t.id =
               tr.original_transaction_id

          WHERE ${where}
        `),

        db.execute(sql`
          SELECT
            tr.id,
            tr.original_transaction_id
              AS transaction_id,
            t.reference,
            tr.amount,
            tr.reason,
            tr.created_at,
            aa.name AS performed_by_name

          FROM transaction_reversals tr

          LEFT JOIN transactions t
            ON t.id =
               tr.original_transaction_id

          LEFT JOIN admin_accounts aa
            ON aa.id =
               tr.performed_by

          WHERE ${where}

          ORDER BY
            tr.created_at DESC

          LIMIT ${limit}
          OFFSET ${offset}
        `),
      ]);

      const total =
        n(
          (
            count.rows[0] as any
          )?.total,
        );

      res.json({
        page,
        limit,
        total,

        pages:
          Math.max(
            1,
            Math.ceil(
              total / limit,
            ),
          ),

        reversals:
          rows.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'reversals failed',
      );

      res.status(500).json({
        error:
          'Failed to load reversals.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* SERVICE SETTINGS                                                           */
/* -------------------------------------------------------------------------- */

router.get(
  '/service-settings',
  requireSuperAdmin,
  async (
    _req,
    res,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          SELECT
            service_key,
            enabled,
            markup,
            notes,
            updated_at

          FROM service_settings

          ORDER BY
            service_key
        `);

      const settings =
        result.rows.map(
          (item) => {
            const row =
              item as any;

            return {
              key:
                s(
                  row.service_key,
                ),

              serviceKey:
                s(
                  row.service_key,
                ),

              label:
                s(
                  row.service_key,
                )
                  .charAt(0)
                  .toUpperCase() +
                s(
                  row.service_key,
                ).slice(1),

              value: {
                enabled:
                  Boolean(
                    row.enabled,
                  ),

                markup:
                  row.markup == null
                    ? null
                    : n(
                        row.markup,
                      ),

                notes:
                  row.notes == null
                    ? null
                    : s(
                        row.notes,
                      ),
              },

              enabled:
                Boolean(
                  row.enabled,
                ),

              markup:
                row.markup == null
                  ? null
                  : n(
                      row.markup,
                    ),

              notes:
                row.notes == null
                  ? null
                  : s(
                      row.notes,
                    ),

              updatedByName:
                'admin',

              updatedAt:
                row.updated_at
                  ? s(
                      row.updated_at,
                    )
                  : null,
            };
          },
        );

      res.json({
        settings,
        services:
          settings,
      });
    } catch (err) {
      logger.error(
        { err },
        'service settings failed',
      );

      res.status(500).json({
        error:
          'Failed to load service settings.',
      });
    }
  },
);

router.patch(
  '/service-settings/:key',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    const key =
      decodeURIComponent(
        req.params.key,
      );

    const value =
      req.body?.value;

    const enabled =
      typeof value ===
      'boolean'
        ? value
        : typeof req.body?.enabled ===
            'boolean'
          ? req.body.enabled
          : value &&
              typeof value ===
                'object' &&
              typeof value.enabled ===
                'boolean'
            ? value.enabled
            : undefined;

    const markup =
      value &&
      typeof value ===
        'object' &&
      value.markup !==
        undefined
        ? Number(
            value.markup,
          )
        : req.body?.markup !==
            undefined
          ? Number(
              req.body.markup,
            )
          : undefined;

    const notes =
      value &&
      typeof value ===
        'object' &&
      value.notes !==
        undefined
        ? String(
            value.notes,
          )
        : req.body?.notes !==
            undefined
          ? String(
              req.body.notes,
            )
          : undefined;

    try {
      await db.execute(sql`
        INSERT INTO service_settings
          (
            service_key,
            enabled,
            markup,
            notes,
            updated_by,
            updated_at
          )

        VALUES
          (
            ${key},
            COALESCE(
              ${enabled ?? null},
              TRUE
            ),
            ${markup ?? null},
            ${notes ?? null},
            ${req.session.adminId},
            NOW()
          )

        ON CONFLICT (
          service_key
        )

        DO UPDATE SET

          enabled =
            COALESCE(
              ${enabled ?? null},
              service_settings.enabled
            ),

          markup =
            COALESCE(
              ${markup ?? null},
              service_settings.markup
            ),

          notes =
            COALESCE(
              ${notes ?? null},
              service_settings.notes
            ),

          updated_by =
            ${req.session.adminId},

          updated_at =
            NOW()
      `);

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'service setting update failed',
      );

      res.status(500).json({
        error:
          'Failed to update service setting.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* SYSTEM SETTINGS                                                            */
/* -------------------------------------------------------------------------- */

router.get(
  '/system-settings',
  requireSuperAdmin,
  async (
    _req,
    res,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          SELECT
            key,
            value,
            updated_at

          FROM system_settings

          ORDER BY key
        `);

      const settings: Record<
        string,
        unknown
      > = {};

      for (
        const item of
          result.rows
      ) {
        const row =
          item as any;

        try {
          settings[
            s(row.key)
          ] =
            JSON.parse(
              s(row.value),
            );
        } catch {
          settings[
            s(row.key)
          ] =
            s(row.value);
        }
      }

      res.json({
        settings,
      });
    } catch (err) {
      logger.error(
        { err },
        'system settings failed',
      );

      res.status(500).json({
        error:
          'Failed to load system settings.',
      });
    }
  },
);

router.patch(
  '/system-settings/:key',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      const value =
        typeof req.body?.value ===
        'string'
          ? req.body.value
          : JSON.stringify(
              req.body?.value,
            );

      await db.execute(sql`
        INSERT INTO system_settings
          (
            key,
            value,
            updated_by,
            updated_at
          )

        VALUES
          (
            ${decodeURIComponent(
              req.params.key,
            )},
            ${value},
            ${req.session.adminId},
            NOW()
          )

        ON CONFLICT (
          key
        )

        DO UPDATE SET
          value =
            EXCLUDED.value,
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW()
      `);

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'system setting update failed',
      );

      res.status(500).json({
        error:
          'Failed to update system setting.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* NOTIFICATIONS                                                              */
/* -------------------------------------------------------------------------- */

router.post(
  '/notifications/broadcast',
  async (
    req,
    res,
  ): Promise<void> => {
    const title =
      s(
        req.body?.title,
      ).trim();

    const body =
      s(
        req.body?.body,
      ).trim();

    if (
      !title ||
      !body
    ) {
      res.status(400).json({
        error:
          'Title and body are required.',
      });

      return;
    }

    try {
      const result =
        await db.execute(sql`
          INSERT INTO notifications
            (
              user_id,
              type,
              title,
              body,
              read,
              created_at
            )

          SELECT
            id,
            'system',
            ${title},
            ${body},
            FALSE,
            NOW()

          FROM users

          RETURNING id
        `);

      await db.execute(sql`
        INSERT INTO admin_audit_logs
          (
            admin_id,
            admin_email,
            action,
            target_type,
            details,
            ip
          )

        VALUES
          (
            ${req.session.adminId},
            ${req.session.adminEmail ?? ''},
            'notification_broadcast',
            'notification',
            ${JSON.stringify({
              title,
              body,
              sent:
                result.rows.length,
            })},
            ${clientIp(req)}
          )
      `);

      res.json({
        ok: true,
        sent:
          result.rows.length,
      });
    } catch (err) {
      logger.error(
        { err },
        'broadcast notification failed',
      );

      res.status(500).json({
        error:
          'Failed to broadcast notification.',
      });
    }
  },
);

router.post(
  '/notifications/targeted',
  async (
    req,
    res,
  ): Promise<void> => {
    const ids =
      Array.isArray(
        req.body?.userIds,
      )
        ? req.body.userIds.map(
            String,
          )
        : [];

    const title =
      s(
        req.body?.title,
      ).trim();

    const body =
      s(
        req.body?.body,
      ).trim();

    if (
      !ids.length ||
      !title ||
      !body
    ) {
      res.status(400).json({
        error:
          'userIds, title and body are required.',
      });

      return;
    }

    try {
      const result =
        await db.execute(sql`
          INSERT INTO notifications
            (
              user_id,
              type,
              title,
              body,
              read,
              created_at
            )

          SELECT
            id,
            'system',
            ${title},
            ${body},
            FALSE,
            NOW()

          FROM users

          WHERE id =
            ANY(
              ${ids}::uuid[]
            )

          RETURNING id
        `);

      res.json({
        ok: true,
        sent:
          result.rows.length,
      });
    } catch (err) {
      logger.error(
        { err },
        'targeted notification failed',
      );

      res.status(500).json({
        error:
          'Failed to send targeted notification.',
      });
    }
  },
);

router.get(
  '/notifications/history',
  async (
    req,
    res,
  ): Promise<void> => {
    const {
      page,
      limit,
      offset,
    } = pageArgs(req);

    try {
      const rows =
        await db.execute(sql`
          SELECT
            title,
            body,
            MIN(created_at)
              AS created_at,
            COUNT(*)::int
              AS recipient_count

          FROM notifications

          GROUP BY
            title,
            body

          ORDER BY
            MIN(created_at) DESC

          LIMIT ${limit}
          OFFSET ${offset}
        `);

      const count =
        await db.execute(sql`
          SELECT COUNT(*)::int
            AS total

          FROM (
            SELECT
              title,
              body

            FROM notifications

            GROUP BY
              title,
              body
          ) grouped
        `);

      const total =
        n(
          (
            count.rows[0] as any
          )?.total,
        );

      res.json({
        history:
          rows.rows.map(
            (item) => {
              const row =
                item as any;

              return {
                id:
                  `${s(row.title)}-${s(row.created_at)}`,

                title:
                  s(row.title),

                body:
                  s(row.body),

                recipientType:
                  'users',

                recipientCount:
                  n(
                    row.recipient_count,
                  ),

                sentBy:
                  null,

                createdAt:
                  s(
                    row.created_at,
                  ),
              };
            },
          ),

        total,

        pages:
          Math.max(
            1,
            Math.ceil(
              total / limit,
            ),
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'notification history failed',
      );

      res.status(500).json({
        error:
          'Failed to load notification history.',
      });
    }
  },
);

router.post(
  '/notifications/staff',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    const ids =
      Array.isArray(
        req.body?.staffIds,
      )
        ? req.body.staffIds.map(
            String,
          )
        : [];

    try {
      await db.execute(sql`
        INSERT INTO admin_audit_logs
          (
            admin_id,
            admin_email,
            action,
            target_type,
            details,
            ip
          )

        VALUES
          (
            ${req.session.adminId},
            ${req.session.adminEmail ?? ''},
            'staff_notification',
            'staff',
            ${JSON.stringify({
              staffIds:
                ids,

              title:
                s(
                  req.body?.title,
                ),

              body:
                s(
                  req.body?.body,
                ),
            })},
            ${clientIp(req)}
          )
      `);

      res.json({
        ok: true,
        sent:
          ids.length,
      });
    } catch (err) {
      logger.error(
        { err },
        'staff notification failed',
      );

      res.status(500).json({
        error:
          'Failed to send staff notification.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* FINANCIAL REPORT                                                           */
/* -------------------------------------------------------------------------- */

router.get(
  '/financial-report',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      const from =
        s(
          req.query.from,
        ).trim() ||
        '1970-01-01';

      const to =
        s(
          req.query.to,
        ).trim() ||
        '2999-12-31';

      const result =
        await db.execute(sql`
          SELECT

            COUNT(*)::int
              AS total_transactions,

            COUNT(*)
              FILTER (
                WHERE status = 'success'
              )::int
              AS successful_transactions,

            COUNT(*)
              FILTER (
                WHERE status = 'failed'
              )::int
              AS failed_transactions,

            COUNT(*)
              FILTER (
                WHERE status = 'pending'
              )::int
              AS pending_transactions,

            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE
                    status = 'success'
                    AND type <> 'wallet_fund'
                ),
              0
            )::numeric AS revenue,

            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE
                    status = 'success'
                    AND type = 'wallet_fund'
                ),
              0
            )::numeric AS funding

          FROM transactions

          WHERE
            created_at::date
            BETWEEN
              ${from}::date
              AND
              ${to}::date
        `);

      const row =
        result.rows[0] as any;

      const revenue =
        n(row.revenue);

      res.json({
        totalRevenue:
          revenue,

        totalCost:
          0,

        netProfit:
          revenue,

        profitMargin:
          0,

        totalTransactions:
          n(
            row.total_transactions,
          ),

        successfulTransactions:
          n(
            row.successful_transactions,
          ),

        failedTransactions:
          n(
            row.failed_transactions,
          ),

        pendingTransactions:
          n(
            row.pending_transactions,
          ),

        totalFunding:
          n(row.funding),

        totalWithdrawals:
          0,

        period: {
          from,
          to,
        },

        dailyRevenue: [],
        serviceBreakdown: [],
      });
    } catch (err) {
      logger.error(
        { err },
        'financial report failed',
      );

      res.status(500).json({
        error:
          'Failed to load financial report.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* STAFF                                                                      */
/* -------------------------------------------------------------------------- */

router.get(
  '/staff',
  requireSuperAdmin,
  async (
    _req,
    res,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          SELECT
            id,
            name,
            email,
            phone,
            role,
            status,
            created_at

          FROM staff_members

          ORDER BY
            created_at DESC
        `);

      res.json({
        staff:
          result.rows.map(
            (item) => {
              const row =
                item as any;

              return {
                id:
                  s(row.id),

                name:
                  s(row.name),

                email:
                  s(row.email),

                phone:
                  row.phone
                    ? s(row.phone)
                    : null,

                role:
                  s(row.role),

                status:
                  s(row.status),

                createdAt:
                  s(
                    row.created_at,
                  ),
              };
            },
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'staff list failed',
      );

      res.status(500).json({
        error:
          'Failed to load staff.',
      });
    }
  },
);

router.post(
  '/staff',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          INSERT INTO staff_members
            (
              name,
              email,
              phone,
              role
            )

          VALUES
            (
              ${s(
                req.body?.name,
              ).trim()},
              ${s(
                req.body?.email,
              ).trim() || null},
              ${s(
                req.body?.phone,
              ).trim() || null},
              ${s(
                req.body?.role,
              ).trim() || 'Staff'}
            )

          RETURNING
            id,
            name,
            email,
            phone,
            role,
            status,
            created_at
        `);

      const row =
        result.rows[0] as any;

      res.status(201).json({
        id: s(row.id),
        name: s(row.name),
        email: s(row.email),
        phone:
          row.phone
            ? s(row.phone)
            : null,
        role: s(row.role),
        status:
          s(row.status),
        createdAt:
          s(row.created_at),
      });
    } catch (err) {
      logger.error(
        { err },
        'staff create failed',
      );

      res.status(500).json({
        error:
          'Failed to create staff.',
      });
    }
  },
);

router.patch(
  '/staff/:id',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          UPDATE staff_members

          SET
            name =
              COALESCE(
                ${req.body?.name ?? null},
                name
              ),

            email =
              COALESCE(
                ${req.body?.email ?? null},
                email
              ),

            phone =
              COALESCE(
                ${req.body?.phone ?? null},
                phone
              ),

            role =
              COALESCE(
                ${req.body?.role ?? null},
                role
              ),

            status =
              COALESCE(
                ${req.body?.status ?? null},
                status
              ),

            department =
              COALESCE(
                ${req.body?.department ?? null},
                department
              ),

            notes =
              COALESCE(
                ${req.body?.notes ?? null},
                notes
              ),

            updated_at =
              NOW()

          WHERE id =
            ${req.params.id}

          RETURNING
            id,
            name,
            email,
            phone,
            role,
            status,
            created_at
        `);

      if (
        !result.rows.length
      ) {
        res.status(404).json({
          error:
            'Staff member not found.',
        });

        return;
      }

      const row =
        result.rows[0] as any;

      res.json({
        id: s(row.id),
        name: s(row.name),
        email: s(row.email),
        phone:
          row.phone
            ? s(row.phone)
            : null,
        role: s(row.role),
        status:
          s(row.status),
        createdAt:
          s(row.created_at),
      });
    } catch (err) {
      logger.error(
        { err },
        'staff update failed',
      );

      res.status(500).json({
        error:
          'Failed to update staff.',
      });
    }
  },
);

router.delete(
  '/staff/:id',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      await db.execute(sql`
        DELETE FROM staff_members
        WHERE id =
          ${req.params.id}
      `);

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'staff delete failed',
      );

      res.status(500).json({
        error:
          'Failed to delete staff.',
      });
    }
  },
);

router.get(
  '/staff/:id/attendance',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      const conditions = [
        sql`staff_id = ${req.params.id}`,
      ];

      if (
        req.query.from
      ) {
        conditions.push(
          sql`
            date >=
              ${s(
                req.query.from,
              )}::date
          `,
        );
      }

      if (
        req.query.to
      ) {
        conditions.push(
          sql`
            date <=
              ${s(
                req.query.to,
              )}::date
          `,
        );
      }

      const result =
        await db.execute(sql`
          SELECT
            id,
            staff_id,
            date,
            status,
            check_in,
            check_out,
            notes

          FROM staff_attendance

          WHERE ${sql.join(
            conditions,
            sql` AND `,
          )}

          ORDER BY
            date DESC
        `);

      res.json({
        attendance:
          result.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'attendance failed',
      );

      res.status(500).json({
        error:
          'Failed to load attendance.',
      });
    }
  },
);

router.post(
  '/staff/:id/attendance',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      await db.execute(sql`
        INSERT INTO staff_attendance
          (
            staff_id,
            date,
            status,
            check_in,
            check_out,
            notes
          )

        VALUES
          (
            ${req.params.id},
            ${s(
              req.body?.date,
            )},
            ${s(
              req.body?.status,
            ) || 'present'},
            ${req.body?.checkIn ?? null},
            ${req.body?.checkOut ?? null},
            ${req.body?.notes ?? null}
          )

        ON CONFLICT (
          staff_id,
          date
        )

        DO UPDATE SET
          status =
            EXCLUDED.status,
          check_in =
            EXCLUDED.check_in,
          check_out =
            EXCLUDED.check_out,
          notes =
            EXCLUDED.notes
      `);

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'attendance update failed',
      );

      res.status(500).json({
        error:
          'Failed to save attendance.',
      });
    }
  },
);

router.get(
  '/staff/:id/activity',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          SELECT
            id,
            staff_id,
            action,
            metadata,
            created_at

          FROM staff_activity_logs

          WHERE staff_id =
            ${req.params.id}

          ORDER BY
            created_at DESC

          LIMIT 200
        `);

      res.json({
        logs:
          result.rows.map(
            (item) => {
              const row =
                item as any;

              return {
                id:
                  s(row.id),

                staffId:
                  s(row.staff_id),

                action:
                  s(row.action),

                details:
                  row.metadata,

                createdAt:
                  s(
                    row.created_at,
                  ),
              };
            },
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'staff activity failed',
      );

      res.status(500).json({
        error:
          'Failed to load staff activity.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* SECURITY                                                                   */
/* -------------------------------------------------------------------------- */

router.get(
  '/security/login-history',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    const {
      page,
      limit,
      offset,
    } = pageArgs(req);

    try {
      const [
        count,
        rows,
      ] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM admin_login_history
        `),

        db.execute(sql`
          SELECT
            id,
            admin_id,
            admin_email,
            ip_address,
            user_agent,
            status,
            created_at

          FROM admin_login_history

          ORDER BY
            created_at DESC

          LIMIT ${limit}
          OFFSET ${offset}
        `),
      ]);

      const total =
        n(
          (
            count.rows[0] as any
          )?.total,
        );

      res.json({
        history:
          rows.rows.map(
            (item) => {
              const row =
                item as any;

              return {
                id:
                  s(row.id),

                adminId:
                  s(row.admin_id),

                adminEmail:
                  s(
                    row.admin_email,
                  ),

                ipAddress:
                  row.ip_address
                    ? s(
                        row.ip_address,
                      )
                    : null,

                userAgent:
                  row.user_agent
                    ? s(
                        row.user_agent,
                      )
                    : null,

                success:
                  s(
                    row.status,
                  ) ===
                  'success',

                createdAt:
                  s(
                    row.created_at,
                  ),
              };
            },
          ),

        total,

        pages:
          Math.max(
            1,
            Math.ceil(
              total / limit,
            ),
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'login history failed',
      );

      res.status(500).json({
        error:
          'Failed to load login history.',
      });
    }
  },
);

router.get(
  '/security/sessions',
  requireSuperAdmin,
  async (
    _req,
    res,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          SELECT
            id,
            admin_id,
            ip_address,
            user_agent,
            last_active,
            created_at,
            revoked_at

          FROM admin_sessions

          WHERE revoked_at IS NULL

          ORDER BY
            last_active DESC
        `);

      res.json({
        sessions:
          result.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'sessions failed',
      );

      res.status(500).json({
        error:
          'Failed to load sessions.',
      });
    }
  },
);

router.post(
  '/security/sessions/:id/revoke',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      await db.execute(sql`
        UPDATE admin_sessions
        SET revoked_at =
          NOW()

        WHERE id =
          ${req.params.id}
      `);

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'session revoke failed',
      );

      res.status(500).json({
        error:
          'Failed to revoke session.',
      });
    }
  },
);

router.delete(
  '/security/sessions/:id',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      await db.execute(sql`
        UPDATE admin_sessions
        SET revoked_at =
          NOW()

        WHERE id =
          ${req.params.id}
      `);

      res.json({
        ok: true,
      });
    } catch (err) {
      res.status(500).json({
        error:
          'Failed to revoke session.',
      });
    }
  },
);

router.get(
  '/security/audit-logs',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    const {
      page,
      limit,
      offset,
    } = pageArgs(req);

    const action =
      s(
        req.query.action,
      ).trim();

    try {
      const conditions = [
        sql`TRUE`,
      ];

      if (action) {
        conditions.push(
          sql`action = ${action}`,
        );
      }

      const where =
        sql.join(
          conditions,
          sql` AND `,
        );

      const [
        count,
        rows,
      ] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS total

          FROM admin_audit_logs

          WHERE ${where}
        `),

        db.execute(sql`
          SELECT
            id,
            admin_id,
            admin_email,
            action,
            target_type,
            target_id,
            target_label,
            details,
            created_at

          FROM admin_audit_logs

          WHERE ${where}

          ORDER BY
            created_at DESC

          LIMIT ${limit}
          OFFSET ${offset}
        `),
      ]);

      const total =
        n(
          (
            count.rows[0] as any
          )?.total,
        );

      res.json({
        logs:
          rows.rows,

        total,

        pages:
          Math.max(
            1,
            Math.ceil(
              total / limit,
            ),
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'security audit logs failed',
      );

      res.status(500).json({
        error:
          'Failed to load audit logs.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* 2FA                                                                        */
/* -------------------------------------------------------------------------- */

router.get(
  '/security/2fa/status',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      const enabled =
        (await getSystemSetting(
          `2fa:enabled:${req.session.adminId}`,
        )) ===
        'true';

      const setupAt =
        await getSystemSetting(
          `2fa:setupAt:${req.session.adminId}`,
        );

      res.json({
        enabled,
        setupAt,
      });
    } catch (err) {
      logger.error(
        { err },
        '2FA status failed',
      );

      res.status(500).json({
        error:
          'Failed to load 2FA status.',
      });
    }
  },
);

router.post(
  '/security/2fa/setup',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      const secret =
        base32Encode(
          crypto.randomBytes(
            20,
          ),
        );

      await db.execute(sql`
        INSERT INTO system_settings
          (
            key,
            value,
            updated_by,
            updated_at
          )

        VALUES
          (
            ${`2fa:secret:${req.session.adminId}`},
            ${secret},
            ${req.session.adminId},
            NOW()
          )

        ON CONFLICT (
          key
        )

        DO UPDATE SET
          value =
            EXCLUDED.value,
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW()
      `);

      const uri =
        `otpauth://totp/GYDATAAdmin:${encodeURIComponent(
          req.session.adminEmail ??
            'admin',
        )}?secret=${secret}&issuer=GYDATAAdmin`;

      res.json({
        secret,

        qrDataUrl:
          uri,

        otpauthUri:
          uri,
      });
    } catch (err) {
      logger.error(
        { err },
        '2FA setup failed',
      );

      res.status(500).json({
        error:
          'Failed to setup 2FA.',
      });
    }
  },
);

router.post(
  '/security/2fa/verify',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      const secret =
        await getSystemSetting(
          `2fa:secret:${req.session.adminId}`,
        );

      if (!secret) {
        res.status(400).json({
          error:
            'Begin 2FA setup first.',
        });

        return;
      }

      const token =
        s(
          req.body?.token,
        ).trim();

      if (
        !verifyTotp(
          secret,
          token,
        )
      ) {
        res.status(400).json({
          ok: false,
          error:
            'Invalid token.',
        });

        return;
      }

      await db.execute(sql`
        INSERT INTO system_settings
          (
            key,
            value,
            updated_by,
            updated_at
          )

        VALUES
          (
            ${`2fa:enabled:${req.session.adminId}`},
            'true',
            ${req.session.adminId},
            NOW()
          )

        ON CONFLICT (
          key
        )

        DO UPDATE SET
          value =
            'true',
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW()
      `);

      await db.execute(sql`
        INSERT INTO system_settings
          (
            key,
            value,
            updated_by,
            updated_at
          )

        VALUES
          (
            ${`2fa:setupAt:${req.session.adminId}`},
            NOW()::text,
            ${req.session.adminId},
            NOW()
          )

        ON CONFLICT (
          key
        )

        DO UPDATE SET
          value =
            EXCLUDED.value,
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW()
      `);

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        '2FA verify failed',
      );

      res.status(500).json({
        error:
          'Failed to verify 2FA.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* API MANAGEMENT                                                             */
/* -------------------------------------------------------------------------- */

router.get(
  '/api-management/configs',
  requireSuperAdmin,
  async (
    _req,
    res,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          SELECT
            id,
            key,
            label,
            provider,
            enabled,
            base_url,
            api_key,
            updated_at

          FROM api_configs

          ORDER BY
            provider,
            label
        `);

      res.json({
        configs:
          result.rows.map(
            (item) => {
              const row =
                item as any;

              const key =
                s(row.key);

              const envKey =
                key === 'smeapi'
                  ? s(
                      process.env.SME_API_KEY,
                    )
                  : key ===
                      'monnify'
                    ? s(
                        process.env.MONNIFY_API_KEY,
                      )
                    : '';

              const secret =
                envKey ||
                s(row.api_key);

              return {
                id:
                  s(row.id),

                key,

                label:
                  s(row.label),

                provider:
                  s(row.provider),

                enabled:
                  Boolean(
                    row.enabled,
                  ),

                baseUrl:
                  row.base_url
                    ? s(
                        row.base_url,
                      )
                    : null,

                fields: [
                  {
                    name:
                      'apiKey',

                    label:
                      'API Key',

                    value:
                      secret
                        ? `••••••••${secret.slice(
                            -4,
                          )}`
                        : '',

                    sensitive:
                      true,
                  },

                  {
                    name:
                      'baseUrl',

                    label:
                      'Base URL',

                    value:
                      row.base_url
                        ? s(
                            row.base_url,
                          )
                        : '',

                    sensitive:
                      false,
                  },
                ],

                status:
                  'unknown',

                lastChecked:
                  null,

                updatedAt:
                  row.updated_at
                    ? s(
                        row.updated_at,
                      )
                    : null,
              };
            },
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'api configs failed',
      );

      res.status(500).json({
        error:
          'Failed to load API configurations.',
      });
    }
  },
);

router.patch(
  '/api-management/configs/:id',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    try {
      const id =
        decodeURIComponent(
          req.params.id,
        );

      const fields =
        req.body?.fields &&
        typeof req.body.fields ===
          'object'
          ? req.body.fields
          : null;

      const apiKey =
        typeof req.body?.apiKey ===
        'string'
          ? req.body.apiKey.trim()
          : fields &&
              typeof fields.apiKey ===
                'string'
            ? fields.apiKey.trim()
            : undefined;

      const baseUrl =
        typeof req.body?.baseUrl ===
        'string'
          ? req.body.baseUrl
          : fields &&
              typeof fields.baseUrl ===
                'string'
            ? fields.baseUrl
            : undefined;

      const enabled =
        typeof req.body?.enabled ===
        'boolean'
          ? req.body.enabled
          : undefined;

      const result =
        await db.execute(sql`
          UPDATE api_configs

          SET

            enabled =
              COALESCE(
                ${enabled ?? null},
                enabled
              ),

            base_url =
              COALESCE(
                ${baseUrl ?? null},
                base_url
              ),

            api_key =
              CASE

                WHEN
                  ${apiKey ?? ''} = ''

                  OR

                  ${String(
                    apiKey ?? '',
                  ).startsWith(
                    '••••',
                  )}

                THEN api_key

                ELSE
                  ${apiKey ?? null}

              END,

            updated_at =
              NOW()

          WHERE
            id::text = ${id}
            OR key = ${id}

          RETURNING
            id,
            key,
            label,
            provider,
            enabled,
            base_url,
            updated_at
        `);

      if (
        !result.rows.length
      ) {
        res.status(404).json({
          error:
            'API configuration not found.',
        });

        return;
      }

      res.json({
        ok: true,
        config:
          result.rows[0],
      });
    } catch (err) {
      logger.error(
        { err },
        'api config update failed',
      );

      res.status(500).json({
        error:
          'Failed to update API configuration.',
      });
    }
  },
);

router.get(
  '/api-management/status',
  requireSuperAdmin,
  async (
    _req,
    res,
  ): Promise<void> => {
    const results: Array<
      Record<string, unknown>
    > = [];

    try {
      const started =
        Date.now();

      const balance =
        await getWalletBalance();

      const latency =
        Date.now() -
        started;

      results.push({
        key:
          'smeapi',

        label:
          'SME API',

        status:
          balance.success
            ? 'online'
            : 'offline',

        latency,

        checkedAt:
          new Date().toISOString(),
      });

      await db.execute(sql`
        INSERT INTO api_logs
          (
            api,
            endpoint,
            method,
            status_code,
            response_time,
            error,
            created_at
          )

        VALUES
          (
            'smeapi',
            'user/',
            'GET',
            ${balance.success
              ? 200
              : 502},
            ${latency},
            ${
              balance.success
                ? null
                : balance.message ??
                  'SME API unavailable'
            },
            NOW()
          )
      `);
    } catch {
      results.push({
        key:
          'smeapi',

        label:
          'SME API',

        status:
          'offline',

        latency:
          null,

        checkedAt:
          new Date().toISOString(),
      });
    }

    const monnifyConfigured =
      Boolean(
        s(
          process.env.MONNIFY_API_KEY,
        ).trim(),
      );

    results.push({
      key:
        'monnify',

      label:
        'Monnify',

      status:
        monnifyConfigured
          ? 'online'
          : 'offline',

      latency:
        null,

      checkedAt:
        new Date().toISOString(),
    });

    await db.execute(sql`
      INSERT INTO api_logs
        (
          api,
          endpoint,
          method,
          status_code,
          response_time,
          error,
          created_at
        )

      VALUES
        (
          'monnify',
          'configuration',
          'GET',
          ${
            monnifyConfigured
              ? 200
              : 503
          },
          NULL,
          ${
            monnifyConfigured
              ? null
              : 'Monnify API key is not configured.'
          },
          NOW()
        )
    `);

    res.json({
      results,
    });
  },
);

router.get(
  '/api-management/logs/errors',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    const {
      page,
      limit,
      offset,
    } = pageArgs(req);

    try {
      const conditions = [
        sql`status_code >= 400`,
      ];

      if (
        req.query.api
      ) {
        conditions.push(
          sql`
            api =
              ${s(
                req.query.api,
              )}
          `,
        );
      }

      const where =
        sql.join(
          conditions,
          sql` AND `,
        );

      const [
        count,
        rows,
      ] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM api_logs
          WHERE ${where}
        `),

        db.execute(sql`
          SELECT
            id,
            api,
            endpoint,
            method,
            status_code,
            response_time,
            error,
            reference,
            created_at

          FROM api_logs

          WHERE ${where}

          ORDER BY
            created_at DESC

          LIMIT ${limit}
          OFFSET ${offset}
        `),
      ]);

      const total =
        n(
          (
            count.rows[0] as any
          )?.total,
        );

      res.json({
        logs:
          rows.rows,

        total,

        pages:
          Math.max(
            1,
            Math.ceil(
              total / limit,
            ),
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'api error logs failed',
      );

      res.status(500).json({
        error:
          'Failed to load API error logs.',
      });
    }
  },
);

router.get(
  '/api-management/logs/transactions',
  requireSuperAdmin,
  async (
    req,
    res,
  ): Promise<void> => {
    const {
      page,
      limit,
      offset,
    } = pageArgs(req);

    try {
      const conditions = [
        sql`status_code < 400`,
      ];

      if (
        req.query.api
      ) {
        conditions.push(
          sql`
            api =
              ${s(
                req.query.api,
              )}
          `,
        );
      }

      const where =
        sql.join(
          conditions,
          sql` AND `,
        );

      const [
        count,
        rows,
      ] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM api_logs
          WHERE ${where}
        `),

        db.execute(sql`
          SELECT
            id,
            api,
            endpoint,
            method,
            status_code,
            response_time,
            error,
            reference,
            created_at

          FROM api_logs

          WHERE ${where}

          ORDER BY
            created_at DESC

          LIMIT ${limit}
          OFFSET ${offset}
        `),
      ]);

      const total =
        n(
          (
            count.rows[0] as any
          )?.total,
        );

      res.json({
        logs:
          rows.rows,

        total,

        pages:
          Math.max(
            1,
            Math.ceil(
              total / limit,
            ),
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'api transaction logs failed',
      );

      res.status(500).json({
        error:
          'Failed to load API transaction logs.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* PROVIDERS                                                                  */
/* -------------------------------------------------------------------------- */

router.get(
  '/provider-summary',
  async (
    _req,
    res,
  ): Promise<void> => {
    res.json({
      providers: [
        {
          key:
            'smeapi',

          name:
            'SME API',

          type:
            'VTU / Data / Airtime',

          configured:
            Boolean(
              s(
                process.env.SME_API_KEY,
              ).trim(),
            ),

          networks: {
            mtn:
              '1',

            glo:
              '2',

            '9mobile':
              '3',

            airtel:
              '4',
          },
        },

        {
          key:
            'monnify',

          name:
            'Monnify',

          type:
            'Payment Gateway',

          configured:
            Boolean(
              s(
                process.env.MONNIFY_API_KEY,
              ).trim(),
            ),
        },
      ],
    });
  },
);

/* -------------------------------------------------------------------------- */
/* REAL SME API PROVIDER BALANCE                                              */
/* -------------------------------------------------------------------------- */

router.get(
  '/smeapi/wallet',
  async (
    _req,
    res,
  ): Promise<void> => {
    try {
      const result =
        await getWalletBalance();

      if (
        !result.success
      ) {
        res.status(502).json({
          ok: false,

          error:
            result.message ??
            'Failed to load SME API wallet balance.',
        });

        return;
      }

      res.json({
        ok: true,

        provider:
          'smeapi',

        balance:
          n(result.balance),
      });
    } catch (err) {
      logger.error(
        { err },
        'SME API wallet failed',
      );

      res.status(500).json({
        ok: false,

        error:
          'Failed to load SME API wallet balance.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* INTEGRATIONS                                                               */
/* -------------------------------------------------------------------------- */

router.get(
  '/integrations',
  requireSuperAdmin,
  async (
    _req,
    res,
  ): Promise<void> => {
    res.json({
      integrations: [
        {
          key:
            'smeapi',

          label:
            'SME API',

          provider:
            'SME API',

          enabled:
            Boolean(
              s(
                process.env.SME_API_KEY,
              ).trim(),
            ),

          configured:
            Boolean(
              s(
                process.env.SME_API_KEY,
              ).trim(),
            ),

          baseUrl:
            s(
              process.env.SME_API_BASE_URL,
              'https://smeapi.com.ng/api/',
            ),
        },

        {
          key:
            'monnify',

          label:
            'Monnify',

          provider:
            'Monnify',

          enabled:
            Boolean(
              s(
                process.env.MONNIFY_API_KEY,
              ).trim(),
            ),

          configured:
            Boolean(
              s(
                process.env.MONNIFY_API_KEY,
              ).trim(),
            ),

          baseUrl:
            s(
              process.env.MONNIFY_BASE_URL,
              'https://api.monnify.com',
            ),
        },
      ],
    });
  },
);

export default router;
