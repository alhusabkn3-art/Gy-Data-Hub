/**
 * admin-compat.ts
 *
 * General admin dashboard/read-model endpoints and compatibility endpoints
 * used by the admin frontend.
 *
 * IMPORTANT:
 * This router must be mounted BEFORE admin-super.ts.
 *
 * Read-only dashboard and wallet information is available to authenticated
 * admins. Service settings and integrations remain super-admin-only.
 */

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

import { logger } from '../lib/logger.js';

const router = Router();

/* -------------------------------------------------------------------------- */
/* Authentication                                                             */
/* -------------------------------------------------------------------------- */

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

router.use(requireAdmin);

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

router.get(
  '/dashboard',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const [
        users,
        activeUsers,
        wallets,
        transactions,
        pending,
        successful,
        failed,
        revenue,
        todayRevenue,
      ] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM users
        `),

        db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM users
          WHERE status = 'active'
        `),

        db.execute(sql`
          SELECT
            COALESCE(
              SUM(balance),
              0
            )::numeric AS balance
          FROM wallets
        `),

        db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM transactions
        `),

        db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM transactions
          WHERE status = 'pending'
        `),

        db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM transactions
          WHERE status = 'success'
        `),

        db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM transactions
          WHERE status = 'failed'
        `),

        db.execute(sql`
          SELECT
            COALESCE(
              SUM(amount),
              0
            )::numeric AS amount
          FROM transactions
          WHERE
            status = 'success'
            AND type <> 'wallet_fund'
        `),

        db.execute(sql`
          SELECT
            COALESCE(
              SUM(amount),
              0
            )::numeric AS amount
          FROM transactions
          WHERE
            status = 'success'
            AND type <> 'wallet_fund'
            AND created_at >= CURRENT_DATE
        `),
      ]);

      const readNumber = (
        result: unknown,
        key: string,
      ): number => {
        const rows = (
          result as {
            rows?: Array<
              Record<string, unknown>
            >;
          }
        ).rows;

        return Number(
          rows?.[0]?.[key] ?? 0,
        );
      };

      res.json({
        totalUsers: readNumber(
          users,
          'count',
        ),

        activeUsers: readNumber(
          activeUsers,
          'count',
        ),

        totalWalletBalance:
          readNumber(
            wallets,
            'balance',
          ),

        totalTransactions:
          readNumber(
            transactions,
            'count',
          ),

        pendingTransactions:
          readNumber(
            pending,
            'count',
          ),

        successfulTransactions:
          readNumber(
            successful,
            'count',
          ),

        failedTransactions:
          readNumber(
            failed,
            'count',
          ),

        totalRevenue:
          readNumber(
            revenue,
            'amount',
          ),

        todayRevenue:
          readNumber(
            todayRevenue,
            'amount',
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /admin/dashboard compatibility endpoint failed',
      );

      res.status(500).json({
        error:
          'Failed to load dashboard.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Stats                                                                      */
/* -------------------------------------------------------------------------- */

router.get(
  '/stats',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const [
        base,
        verified,
        pendingKyc,
        revenue,
        walletBalance,
      ] = await Promise.all([
        db.execute(sql`
          SELECT
            COUNT(*)::int AS total_users,

            COUNT(*)
              FILTER (
                WHERE status = 'active'
              )::int AS active_users,

            COUNT(*)
              FILTER (
                WHERE status = 'suspended'
              )::int AS suspended_users
          FROM users
        `),

        db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM users
          WHERE kyc_status = 'verified'
        `),

        db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM users
          WHERE kyc_status = 'pending'
        `),

        db.execute(sql`
          SELECT
            COUNT(*)::int AS total_transactions,

            COUNT(*)
              FILTER (
                WHERE status = 'success'
              )::int AS successful_transactions,

            COUNT(*)
              FILTER (
                WHERE status = 'pending'
              )::int AS pending_transactions,

            COUNT(*)
              FILTER (
                WHERE status = 'failed'
              )::int AS failed_transactions,

            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE
                    status = 'success'
                    AND type <> 'wallet_fund'
                ),
              0
            )::numeric AS total_revenue,

            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE
                    status = 'success'
                    AND type <> 'wallet_fund'
                    AND created_at >= CURRENT_DATE
                ),
              0
            )::numeric AS today_revenue,

            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE
                    status = 'success'
                    AND type <> 'wallet_fund'
                    AND created_at >= CURRENT_DATE - INTERVAL '7 days'
                ),
              0
            )::numeric AS week_revenue,

            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE
                    status = 'success'
                    AND type <> 'wallet_fund'
                    AND created_at >= CURRENT_DATE - INTERVAL '30 days'
                ),
              0
            )::numeric AS month_revenue,

            COALESCE(
              AVG(amount)
                FILTER (
                  WHERE
                    status = 'success'
                    AND type <> 'wallet_fund'
                ),
              0
            )::numeric AS avg_transaction_value

          FROM transactions
        `),

        db.execute(sql`
          SELECT
            COALESCE(
              SUM(balance),
              0
            )::numeric AS total_wallet_balance
          FROM wallets
        `),
      ]);

      const baseRow =
        (base.rows[0] ?? {}) as Record<
          string,
          unknown
        >;

      const revenueRow =
        (revenue.rows[0] ?? {}) as Record<
          string,
          unknown
        >;

      const totalUsers =
        Number(
          baseRow.total_users ?? 0,
        );

      const verifiedUsers =
        Number(
          verified.rows[0]?.count ?? 0,
        );

      const pendingUsers =
        Number(
          pendingKyc.rows[0]?.count ?? 0,
        );

      res.json({
        totalUsers,

        activeUsers:
          Number(
            baseRow.active_users ?? 0,
          ),

        suspendedUsers:
          Number(
            baseRow.suspended_users ?? 0,
          ),

        verifiedUsers,

        pendingKycUsers:
          pendingUsers,

        unverifiedUsers:
          Math.max(
            0,
            totalUsers -
              verifiedUsers -
              pendingUsers,
          ),

        totalTransactions:
          Number(
            revenueRow.total_transactions ??
              0,
          ),

        successfulTransactions:
          Number(
            revenueRow.successful_transactions ??
              0,
          ),

        pendingTransactions:
          Number(
            revenueRow.pending_transactions ??
              0,
          ),

        failedTransactions:
          Number(
            revenueRow.failed_transactions ??
              0,
          ),

        totalRevenue:
          Number(
            revenueRow.total_revenue ??
              0,
          ),

        todayRevenue:
          Number(
            revenueRow.today_revenue ??
              0,
          ),

        weekRevenue:
          Number(
            revenueRow.week_revenue ??
              0,
          ),

        monthRevenue:
          Number(
            revenueRow.month_revenue ??
              0,
          ),

        totalWalletBalance:
          Number(
            walletBalance.rows[0]
              ?.total_wallet_balance ??
              0,
          ),

        avgTransactionValue:
          Number(
            revenueRow.avg_transaction_value ??
              0,
          ),
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
/* Weekly Revenue                                                             */
/* -------------------------------------------------------------------------- */

router.get(
  '/revenue/weekly',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          SELECT
            TO_CHAR(
              days.day,
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
          ) AS days(day)

          LEFT JOIN transactions t
            ON t.created_at >= days.day
           AND t.created_at <
               days.day + INTERVAL '1 day'

          GROUP BY days.day
          ORDER BY days.day ASC
        `);

      res.json({
        revenue:
          result.rows,
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
/* Services                                                                  */
/* -------------------------------------------------------------------------- */

router.get(
  '/services',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          SELECT
            type,

            COUNT(*)::int AS total,

            COUNT(*)
              FILTER (
                WHERE status = 'success'
              )::int AS successful,

            COUNT(*)
              FILTER (
                WHERE status = 'pending'
              )::int AS pending,

            COUNT(*)
              FILTER (
                WHERE status = 'failed'
              )::int AS failed,

            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE status = 'success'
                ),
              0
            )::numeric AS revenue

          FROM transactions

          GROUP BY type

          ORDER BY
            revenue DESC,
            total DESC
        `);

      res.json({
        services:
          result.rows,
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
/* User Wallet                                                               */
/* -------------------------------------------------------------------------- */

router.get(
  '/users/:id/wallet',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      String(
        req.params.id ?? '',
      ).trim();

    if (!userId) {
      res.status(400).json({
        error:
          'User id is required.',
      });

      return;
    }

    try {
      const [
        walletResult,
        statsResult,
      ] = await Promise.all([
        db.execute(sql`
          SELECT
            id,
            user_id,
            balance,
            created_at,
            updated_at
          FROM wallets
          WHERE user_id = ${userId}
          LIMIT 1
        `),

        db.execute(sql`
          SELECT
            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE type = 'credit'
                ),
              0
            )::numeric AS total_credit,

            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE type = 'debit'
                ),
              0
            )::numeric AS total_debit,

            COALESCE(
              SUM(amount)
                FILTER (
                  WHERE type = 'reversal'
                ),
              0
            )::numeric AS total_reversal,

            COUNT(*)::int AS transaction_count

          FROM wallet_ledger

          WHERE user_id = ${userId}
        `),
      ]);

      if (!walletResult.rows.length) {
        res.status(404).json({
          error:
            'Wallet not found.',
        });

        return;
      }

      const wallet =
        walletResult.rows[0] as Record<
          string,
          unknown
        >;

      const stats =
        statsResult.rows[0] as Record<
          string,
          unknown
        >;

      const balance =
        Number(
          wallet.balance ?? 0,
        );

      const totalCredit =
        Number(
          stats.total_credit ?? 0,
        );

      const totalDebit =
        Number(
          stats.total_debit ?? 0,
        );

      res.json({
        id: String(wallet.id),

        walletId:
          String(wallet.id),

        userId:
          String(wallet.user_id),

        balance,

        currency:
          'NGN',

        createdAt:
          String(
            wallet.created_at,
          ),

        updatedAt:
          String(
            wallet.updated_at,
          ),

        totalCredit,

        totalDebit,

        totalCredited:
          totalCredit,

        totalDebited:
          totalDebit,

        totalReversal:
          Number(
            stats.total_reversal ??
              0,
          ),

        transactionCount:
          Number(
            stats.transaction_count ??
              0,
          ),

        ledgerCount:
          Number(
            stats.transaction_count ??
              0,
          ),
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
/* Wallet Ledger                                                             */
/* -------------------------------------------------------------------------- */

router.get(
  '/users/:id/wallet/ledger',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const userId =
      String(
        req.params.id ?? '',
      ).trim();

    const page =
      Math.max(
        1,
        Number(
          req.query.page ?? 1,
        ),
      );

    const limit =
      Math.min(
        100,
        Math.max(
          1,
          Number(
            req.query.limit ?? 25,
          ),
        ),
      );

    const offset =
      (page - 1) * limit;

    try {
      const [
        countResult,
        rowsResult,
      ] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM wallet_ledger
          WHERE user_id = ${userId}
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
            ${userId}

          ORDER BY
            wl.created_at DESC

          LIMIT ${limit}
          OFFSET ${offset}
        `),
      ]);

      const total =
        Number(
          (
            countResult.rows[0] as Record<
              string,
              unknown
            >
          )?.total ?? 0,
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
        totalPages: pages,

        ledger:
          rowsResult.rows,

        rows:
          rowsResult.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /admin/users/:id/wallet/ledger failed',
      );

      res.status(500).json({
        error:
          'Failed to load wallet ledger.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Service Settings                                                           */
/* -------------------------------------------------------------------------- */

router.get(
  '/service-settings',
  requireSuperAdmin,
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const result =
        await db.execute(sql`
          SELECT
            service_key,
            enabled,
            markup,
            notes,
            updated_by,
            updated_at

          FROM service_settings

          ORDER BY
            service_key ASC
        `);

      const existing =
        new Map<
          string,
          Record<string, unknown>
        >();

      for (const row of result.rows) {
        const record =
          row as Record<
            string,
            unknown
          >;

        existing.set(
          String(
            record.service_key,
          ),
          record,
        );
      }

      const defaults = [
        'data',
        'airtime',
        'electricity',
        'cable',
        'betting',
        'exam',
      ];

      const services =
        defaults.map(
          (key) => {
            const row =
              existing.get(
                key,
              );

            return {
              serviceKey:
                key,

              label:
                key
                  .charAt(0)
                  .toUpperCase() +
                key.slice(1),

              enabled:
                row
                  ? Boolean(
                      row.enabled,
                    )
                  : true,

              markup:
                row?.markup == null
                  ? null
                  : Number(
                      row.markup,
                    ),

              notes:
                row?.notes == null
                  ? null
                  : String(
                      row.notes,
                    ),

              updatedByName:
                null,

              updatedAt:
                row?.updated_at
                  ? String(
                      row.updated_at,
                    )
                  : null,
            };
          },
        );

      /*
       * Return both names because older frontend code used `settings`
       * while AdminServices currently expects `services`.
       */
      res.json({
        services,
        settings: services,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /admin/service-settings failed',
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
    req: Request,
    res: Response,
  ): Promise<void> => {
    const key =
      String(
        req.params.key ?? '',
      ).trim();

    const body =
      req.body ?? {};

    const value =
      body.value;

    const enabled =
      typeof body.enabled ===
      'boolean'
        ? body.enabled
        : value &&
            typeof value ===
              'object' &&
            typeof value.enabled ===
              'boolean'
          ? value.enabled
          : undefined;

    const markup =
      body.markup !==
      undefined
        ? Number(
            body.markup,
          )
        : value &&
            typeof value ===
              'object' &&
            value.markup !==
              undefined
          ? Number(
              value.markup,
            )
          : undefined;

    const notes =
      body.notes !==
      undefined
        ? String(
            body.notes,
          )
        : value &&
            typeof value ===
              'object' &&
            value.notes !==
              undefined
          ? String(
              value.notes,
            )
          : undefined;

    if (!key) {
      res.status(400).json({
        error:
          'Service key is required.',
      });

      return;
    }

    const validMarkup =
      markup !== undefined &&
      Number.isFinite(markup)
        ? markup
        : null;

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
            ${enabled ?? true},
            ${validMarkup},
            ${notes ?? null},
            ${req.session.adminId!},
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
              ${validMarkup},
              service_settings.markup
            ),

          notes =
            COALESCE(
              ${notes ?? null},
              service_settings.notes
            ),

          updated_by =
            ${req.session.adminId!},

          updated_at =
            NOW()
      `);

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'PATCH /admin/service-settings/:key failed',
      );

      res.status(500).json({
        error:
          'Failed to update service setting.',
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* Integrations                                                               */
/* -------------------------------------------------------------------------- */

router.get(
  '/integrations',
  requireSuperAdmin,
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    res.json({
      integrations: [
        {
          key: 'smeapi',

          label:
            'SME API',

          provider:
            'SME API',

          enabled:
            Boolean(
              String(
                process.env.SME_API_KEY ??
                  '',
              ).trim(),
            ),

          configured:
            Boolean(
              String(
                process.env.SME_API_KEY ??
                  '',
              ).trim(),
            ),

          baseUrl:
            String(
              process.env.SME_API_BASE_URL ??
                'https://smeapi.com.ng/api/',
            ),
        },

        {
          key: 'monnify',

          label:
            'Monnify',

          provider:
            'Monnify',

          enabled:
            Boolean(
              String(
                process.env.MONNIFY_API_KEY ??
                  '',
              ).trim(),
            ),

          configured:
            Boolean(
              String(
                process.env.MONNIFY_API_KEY ??
                  '',
              ).trim(),
            ),

          baseUrl:
            String(
              process.env.MONNIFY_BASE_URL ??
                'https://api.monnify.com',
            ),
        },
      ],
    });
  },
);

export default router;
