/**
 * admin-super.ts — Super Admin only routes
 *
 * ALL routes in this file require role === 'super_admin'.
 * requireSuperAdmin is applied at the router level.
 *
 * Mounted in routes/index.ts at /admin (same prefix as admin.ts so path
 * resolution is transparent to callers).
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { hashPin, verifyPin } from '../lib/auth.js';
import { logger } from '../lib/logger.js';
import { financialAuditLog } from '../lib/financial-audit.js';
import { FINANCE_PERMISSIONS, type FinancePermission } from './admin-finance.js';
import { getWalletBalance } from '../lib/smeapi.js';

const router = Router();

// ── Middleware ────────────────────────────────────────────────────────────────

function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
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

router.use(requireSuperAdmin);

// ── Helpers ───────────────────────────────────────────────────────────────────

function clientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket?.remoteAddress ??
    'unknown'
  );
}

async function getAdminEmail(adminId: string): Promise<string> {
  const r = await db.execute(
    sql`SELECT email FROM admin_accounts WHERE id = ${adminId} LIMIT 1`,
  );

  return String(
    (r.rows[0] as Record<string, unknown>)?.['email'] ?? 'unknown',
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
    await db.execute(sql`
      INSERT INTO admin_audit_logs
        (admin_id, admin_email, action, target_type, target_id, target_label, details, ip)
      VALUES
        (
          ${opts.adminId},
          ${opts.adminEmail},
          ${opts.action},
          ${opts.targetType ?? null},
          ${opts.targetId ?? null},
          ${opts.targetLabel ?? null},
          ${opts.details ? JSON.stringify(opts.details) : null},
          ${opts.ip ?? null}
        )
    `);
  } catch (err) {
    logger.error({ err }, 'audit log insert failed');
  }
}

function makeRef(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)
    .toUpperCase()}`;
}

function randomPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ═════════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

router.get('/users/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  try {
    const r = await db.execute(sql`
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
      LEFT JOIN wallets w ON w.user_id = u.id
      LEFT JOIN transactions t ON t.user_id = u.id
      WHERE u.id = ${id}
      GROUP BY u.id, w.balance
    `);

    if (!r.rows.length) {
      res.status(404).json({ error: 'User not found.' });
      return;
    }

    const row = r.rows[0] as Record<string, unknown>;

    res.json({
      id: String(row['id']),
      name: String(row['name']),
      firstName: String(row['first_name']),
      lastName: String(row['last_name']),
      email: String(row['email'] ?? ''),
      phone: String(row['phone']),
      accountNumber: String(row['account_number']),
      bankName: String(row['bank_name']),
      referralCode: String(row['referral_code']),
      kycStatus: String(row['kyc_status']),
      status: String(row['status']),
      walletBalance: Number(row['wallet_balance']),
      transactionCount: Number(row['transaction_count']),
      totalSpent: Number(row['total_spent']),
      lastTransactionAt: row['last_transaction_at']
        ? String(row['last_transaction_at'])
        : null,
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
    });
  } catch (err) {
    logger.error({ err }, 'GET /users/:id failed');
    res.status(500).json({ error: 'Failed to load user.' });
  }
});

router.get('/users/:id/wallet', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  try {
    const [walletRes, statsRes] = await Promise.all([
      db.execute(sql`
        SELECT id, balance, created_at, updated_at
        FROM wallets
        WHERE user_id = ${id}
        LIMIT 1
      `),

      db.execute(sql`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE type = 'credit'), 0)::numeric
            AS total_credited,
          COALESCE(SUM(amount) FILTER (WHERE type = 'debit'), 0)::numeric
            AS total_debited,
          COALESCE(SUM(amount) FILTER (WHERE type = 'reversal'), 0)::numeric
            AS total_reversed,
          COUNT(*)::int AS ledger_count
        FROM wallet_ledger
        WHERE user_id = ${id}
      `),
    ]);

    if (!walletRes.rows.length) {
      res.status(404).json({ error: 'Wallet not found.' });
      return;
    }

    const w = walletRes.rows[0] as Record<string, unknown>;
    const s = statsRes.rows[0] as Record<string, unknown>;

    res.json({
      walletId: String(w['id']),
      balance: Number(w['balance']),
      createdAt: String(w['created_at']),
      updatedAt: String(w['updated_at']),
      totalCredited: Number(s['total_credited']),
      totalDebited: Number(s['total_debited']),
      totalReversed: Number(s['total_reversed']),
      ledgerCount: Number(s['ledger_count']),
    });
  } catch (err) {
    logger.error({ err }, 'GET /users/:id/wallet failed');
    res.status(500).json({ error: 'Failed to load wallet.' });
  }
});

router.get(
  '/users/:id/wallet/ledger',
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    const page = Math.max(1, Number(req.query['page'] ?? 1));
    const limit = Math.min(
      100,
      Math.max(1, Number(req.query['limit'] ?? 25)),
    );
    const offset = (page - 1) * limit;

    try {
      const [countRes, rowRes] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM wallet_ledger
          WHERE user_id = ${id}
        `),

        db.execute(sql`
          SELECT
            wl.*,
            aa.name AS performed_by_name
          FROM wallet_ledger wl
          LEFT JOIN admin_accounts aa
            ON aa.id = wl.performed_by
          WHERE wl.user_id = ${id}
          ORDER BY wl.created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `),
      ]);

      const total = Number(
        (countRes.rows[0] as Record<string, unknown>)?.['total'] ?? 0,
      );

      res.json({
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        rows: rowRes.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /users/:id/wallet/ledger failed',
      );
      res.status(500).json({
        error: 'Failed to load wallet ledger.',
      });
    }
  },
);

router.get('/users', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query['page'] ?? 1));
  const limit = Math.min(
    100,
    Math.max(1, Number(req.query['limit'] ?? 25)),
  );
  const offset = (page - 1) * limit;

  const search = String(req.query['search'] ?? '').trim();
  const status = String(req.query['status'] ?? '').trim();

  try {
    const whereParts = [
      search
        ? sql`(
            u.name ILIKE ${'%' + search + '%'}
            OR u.email ILIKE ${'%' + search + '%'}
            OR u.phone ILIKE ${'%' + search + '%'}
            OR u.account_number ILIKE ${'%' + search + '%'}
          )`
        : sql`TRUE`,

      status
        ? sql`u.status = ${status}`
        : sql`TRUE`,
    ];

    const where = sql.join(whereParts, sql` AND `);

    const [countRes, rowsRes] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM users u
        WHERE ${where}
      `),

      db.execute(sql`
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
          COALESCE(w.balance, '0')::numeric AS wallet_balance
        FROM users u
        LEFT JOIN wallets w
          ON w.user_id = u.id
        WHERE ${where}
        ORDER BY u.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `),
    ]);

    const total = Number(
      (countRes.rows[0] as Record<string, unknown>)?.['total'] ?? 0,
    );

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),

      users: rowsRes.rows.map((row) => {
        const r = row as Record<string, unknown>;

        return {
          id: String(r['id']),
          name: String(r['name'] ?? ''),
          firstName: String(r['first_name'] ?? ''),
          lastName: String(r['last_name'] ?? ''),
          email: String(r['email'] ?? ''),
          phone: String(r['phone'] ?? ''),
          accountNumber: String(r['account_number'] ?? ''),
          bankName: String(r['bank_name'] ?? ''),
          referralCode: String(r['referral_code'] ?? ''),
          kycStatus: String(r['kyc_status'] ?? ''),
          status: String(r['status'] ?? ''),
          walletBalance: Number(r['wallet_balance'] ?? 0),
          createdAt: String(r['created_at']),
          updatedAt: String(r['updated_at']),
        };
      }),
    });
  } catch (err) {
    logger.error({ err }, 'GET /users failed');
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

// ── GET /admin/users/:id/transactions ───────────────────────────────────────

router.get(
  '/users/:id/transactions',
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    const page = Math.max(1, Number(req.query['page'] ?? 1));
    const limit = Math.min(
      100,
      Math.max(1, Number(req.query['limit'] ?? 25)),
    );
    const offset = (page - 1) * limit;

    try {
      const [countRes, rowsRes] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS total
          FROM transactions
          WHERE user_id = ${id}
        `),

        db.execute(sql`
          SELECT *
          FROM transactions
          WHERE user_id = ${id}
          ORDER BY created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `),
      ]);

      const total = Number(
        (countRes.rows[0] as Record<string, unknown>)?.['total'] ?? 0,
      );

      res.json({
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        transactions: rowsRes.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /users/:id/transactions failed',
      );
      res.status(500).json({
        error: 'Failed to load transactions.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// USER WALLET FUNDING
// ═════════════════════════════════════════════════════════════════════════════

router.post(
  '/users/:id/fund-wallet',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const { id } = req.params as { id: string };

    const amount = Number(
      req.body?.amount,
    );

    const reason =
      typeof req.body?.reason === 'string'
        ? req.body.reason.trim()
        : '';

    if (
      !Number.isFinite(amount) ||
      amount <= 0
    ) {
      res.status(400).json({
        error:
          'A valid positive amount is required.',
      });
      return;
    }

    try {
      const walletResult =
        await db.execute(sql`
          SELECT
            id,
            balance
          FROM wallets
          WHERE user_id = ${id}
          LIMIT 1
        `);

      if (!walletResult.rows.length) {
        res.status(404).json({
          error:
            'User wallet not found.',
        });
        return;
      }

      const wallet =
        walletResult.rows[0] as Record<
          string,
          unknown
        >;

      const walletId =
        String(wallet['id']);

      const currentBalance =
        Number(
          wallet['balance'] ?? 0,
        );

      const newBalance =
        currentBalance + amount;

      const reference =
        makeRef('ADMINFUND');

      await db.execute(sql`
        UPDATE wallets
        SET
          balance = ${newBalance.toFixed(2)},
          updated_at = NOW()
        WHERE id = ${walletId}
      `);

      await db.execute(sql`
        INSERT INTO wallet_ledger
          (
            user_id,
            wallet_id,
            type,
            amount,
            balance_before,
            balance_after,
            reference,
            description,
            performed_by,
            created_at
          )
        VALUES
          (
            ${id},
            ${walletId},
            'credit',
            ${amount.toFixed(2)},
            ${currentBalance.toFixed(2)},
            ${newBalance.toFixed(2)},
            ${reference},
            ${
              reason ||
              'Wallet funded by super admin'
            },
            ${req.session.adminId!},
            NOW()
          )
      `);

      const adminId =
        req.session.adminId!;

      const adminEmail =
        await getAdminEmail(
          adminId,
        );

      void auditLog({
        adminId,
        adminEmail,
        action:
          'wallet_funded',
        targetType:
          'user',
        targetId:
          id,
        details: {
          amount,
          balanceBefore:
            currentBalance,
          balanceAfter:
            newBalance,
          reference,
          reason:
            reason || null,
        },
        ip:
          clientIp(req),
      });

      void financialAuditLog({
        adminId,
        adminEmail,
        action:
          'wallet_funded',
        userId:
          id,
        amount,
        reference,
        metadata: {
          balanceBefore:
            currentBalance,
          balanceAfter:
            newBalance,
          reason:
            reason || null,
        },
        ip:
          clientIp(req),
      });

      res.json({
        ok: true,
        reference,
        walletId,
        balance:
          newBalance,
      });
    } catch (err) {
      logger.error(
        { err },
        'POST /users/:id/fund-wallet failed',
      );

      res.status(500).json({
        error:
          'Failed to fund wallet.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// WALLET TRANSACTIONS
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/wallet-transactions',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const page =
      Math.max(
        1,
        Number(
          req.query['page'] ??
            1,
        ),
      );

    const limit =
      Math.min(
        100,
        Math.max(
          1,
          Number(
            req.query['limit'] ??
              25,
          ),
        ),
      );

    const offset =
      (page - 1) *
      limit;

    try {
      const [
        countRes,
        rowsRes,
      ] =
        await Promise.all([
          db.execute(sql`
            SELECT COUNT(*)::int AS total
            FROM wallet_ledger
          `),

          db.execute(sql`
            SELECT
              wl.*,
              u.name AS user_name,
              u.phone AS user_phone,
              aa.name AS performed_by_name
            FROM wallet_ledger wl
            LEFT JOIN users u
              ON u.id = wl.user_id
            LEFT JOIN admin_accounts aa
              ON aa.id = wl.performed_by
            ORDER BY
              wl.created_at DESC
            LIMIT ${limit}
            OFFSET ${offset}
          `),
        ]);

      const total =
        Number(
          (
            countRes
              .rows[0] as Record<
                string,
                unknown
              >
          )?.['total'] ??
            0,
        );

      res.json({
        page,
        limit,
        total,
        totalPages:
          Math.ceil(
            total / limit,
          ),
        transactions:
          rowsRes.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /wallet-transactions failed',
      );

      res.status(500).json({
        error:
          'Failed to load wallet transactions.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/dashboard',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const [
        usersRes,
        activeUsersRes,
        walletRes,
        transactionsRes,
        pendingRes,
        successfulRes,
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
      ]);

      res.json({
        users:
          Number(
            (
              usersRes.rows[0] as Record<
                string,
                unknown
              >
            )?.['count'] ??
              0,
          ),

        activeUsers:
          Number(
            (
              activeUsersRes
                .rows[0] as Record<
                  string,
                  unknown
                >
            )?.['count'] ??
              0,
          ),

        walletBalance:
          Number(
            (
              walletRes
                .rows[0] as Record<
                  string,
                  unknown
                >
            )?.['balance'] ??
              0,
          ),

        transactions:
          Number(
            (
              transactionsRes
                .rows[0] as Record<
                  string,
                  unknown
                >
            )?.['count'] ??
              0,
          ),

        pendingTransactions:
          Number(
            (
              pendingRes
                .rows[0] as Record<
                  string,
                  unknown
                >
            )?.['count'] ??
              0,
          ),

        successfulTransactions:
          Number(
            (
              successfulRes
                .rows[0] as Record<
                  string,
                  unknown
                >
            )?.['count'] ??
              0,
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /dashboard failed',
      );

      res.status(500).json({
        error:
          'Failed to load dashboard.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// PROVIDER CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/providers',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const mask = (
        value: string,
      ): string => {
        if (!value) {
          return '';
        }

        if (
          value ===
          '••••'
        ) {
          return value;
        }

        if (
          value.length <=
          4
        ) {
          return '••••';
        }

        return (
          value.slice(
            0,
            4,
          ) +
          '••••'
        );
      };

      res.json({
        providers: [
          {
            key:
              'monnify',

            label:
              'Monnify',

            status:
              process.env[
                'MONNIFY_API_KEY'
              ]
                ? 'configured'
                : 'not_configured',

            fields: [
              {
                label:
                  'API Key',

                value:
                  mask(
                    process.env[
                      'MONNIFY_API_KEY'
                    ] ??
                      '',
                  ),

                sensitive:
                  true,
              },

              {
                label:
                  'Contract Code',

                value:
                  mask(
                    process.env[
                      'MONNIFY_CONTRACT_CODE'
                    ] ??
                      '',
                  ),

                sensitive:
                  true,
              },

              {
                label:
                  'Base URL',

                value:
                  process.env[
                    'MONNIFY_BASE_URL'
                  ] ??
                  'https://sandbox.monnify.com',

                sensitive:
                  false,
              },
            ],
          },

          {
            key:
              'smeapi',

            label:
              'SME API (VTU Provider)',

            status:
              process.env[
                'SME_API_KEY'
              ]
                ? 'configured'
                : 'not_configured',

            fields: [
              {
                label:
                  'API Key',

                value:
                  mask(
                    process.env[
                      'SME_API_KEY'
                    ] ??
                      '',
                  ),

                sensitive:
                  true,
              },

              {
                label:
                  'Endpoint',

                value:
                  'https://smeapi.com.ng',

                sensitive:
                  false,
              },
            ],
          },
        ],
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /providers failed',
      );

      res.status(500).json({
        error:
          'Failed to load providers.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// API MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/api-management/configs',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const r = await db.execute(sql`
        SELECT key, value
        FROM system_settings
        WHERE key IN (
          'sme_api_key',
          'monnify_api_key',
          'monnify_secret_key',
          'monnify_contract_code',
          'api_smeapi_enabled',
          'api_monnify_enabled'
        )
      `);

      const map: Record<
        string,
        string
      > = {};

      for (const row of r.rows) {
        const x =
          row as Record<
            string,
            unknown
          >;

        map[String(x['key'])] =
          String(
            x['value'] ?? '',
          );
      }

      const smeKey =
        map['sme_api_key'] ||
        (process.env[
          'SME_API_KEY'
        ]
          ? '••••'
          : '');

      const mnKey =
        map['monnify_api_key'] ||
        (process.env[
          'MONNIFY_API_KEY'
        ]
          ? '••••'
          : '');

      const mnSec =
        map['monnify_secret_key'] ||
        (process.env[
          'MONNIFY_SECRET_KEY'
        ]
          ? '••••'
          : '');

      const mnCon =
        map[
          'monnify_contract_code'
        ] ||
        process.env[
          'MONNIFY_CONTRACT_CODE'
        ] ||
        '';

      const mask = (
        v: string,
      ) =>
        v &&
        v !== '••••' &&
        v.length > 4
          ? v.slice(0, 4) +
            '••••'
          : v;

      res.json({
        apis: [
          {
            key: 'smeapi',
            label: 'SME API',
            enabled:
              map[
                'api_smeapi_enabled'
              ] !== 'false',

            status:
              process.env[
                'SME_API_KEY'
              ]
                ? 'configured'
                : 'not_configured',

            lastChecked: null,

            fields: [
              {
                name: 'api_key',
                label:
                  'API Key',
                value:
                  mask(smeKey),
                sensitive: true,
              },
            ],
          },

          {
            key: 'monnify',
            label: 'Monnify',
            enabled:
              map[
                'api_monnify_enabled'
              ] !== 'false',

            status:
              process.env[
                'MONNIFY_API_KEY'
              ]
                ? 'configured'
                : 'not_configured',

            lastChecked: null,

            fields: [
              {
                name: 'api_key',
                label:
                  'API Key',
                value:
                  mask(mnKey),
                sensitive: true,
              },

              {
                name:
                  'secret_key',
                label:
                  'Secret Key',
                value:
                  mask(mnSec),
                sensitive: true,
              },

              {
                name:
                  'contract_code',
                label:
                  'Contract Code',
                value:
                  mnCon,
                sensitive: false,
              },
            ],
          },
        ],
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /api-management/configs failed',
      );

      res.status(500).json({
        error:
          'Failed to load API configurations.',
      });
    }
  },
);

router.patch(
  '/api-management/configs',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      provider,
      enabled,
    } =
      req.body as {
        provider?: string;
        enabled?: boolean;
      };

    if (
      !provider ||
      typeof enabled !==
        'boolean'
    ) {
      res.status(400).json({
        error:
          'Provider and enabled are required.',
      });
      return;
    }

    const allowedProviders =
      [
        'smeapi',
        'monnify',
      ];

    if (
      !allowedProviders.includes(
        provider,
      )
    ) {
      res.status(400).json({
        error:
          'Unsupported provider.',
      });
      return;
    }

    try {
      const key =
        `api_${provider}_enabled`;

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
            ${key},
            ${String(enabled)},
            ${req.session.adminId!},
            NOW()
          )
        ON CONFLICT (key)
        DO UPDATE SET
          value =
            EXCLUDED.value,
          updated_by =
            EXCLUDED.updated_by,
          updated_at =
            NOW()
      `);

      const adminId =
        req.session.adminId!;

      const adminEmail =
        await getAdminEmail(
          adminId,
        );

      void auditLog({
        adminId,
        adminEmail,
        action:
          'provider_enabled_state_updated',
        targetType:
          'provider',
        targetId:
          provider,
        details: {
          enabled,
        },
        ip:
          clientIp(req),
      });

      res.json({
        ok: true,
        provider,
        enabled,
      });
    } catch (err) {
      logger.error(
        { err },
        'PATCH /api-management/configs failed',
      );

      res.status(500).json({
        error:
          'Failed to update API configuration.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN PIN
// ═════════════════════════════════════════════════════════════════════════════

router.post(
  '/generate-pin',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const pin =
        randomPin();

      const hash =
        await hashPin(pin);

      await db.execute(sql`
        UPDATE admin_accounts
        SET
          password_hash =
            ${hash},
          updated_at =
            NOW()
        WHERE id =
          ${req.session.adminId!}
      `);

      res.json({
        ok: true,
        pin,
      });
    } catch (err) {
      logger.error(
        { err },
        'POST /generate-pin failed',
      );

      res.status(500).json({
        error:
          'Failed to generate PIN.',
      });
    }
  },
);

router.post(
  '/verify-pin',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      pin,
    } =
      req.body as {
        pin?: string;
      };

    if (
      !pin ||
      !String(pin).trim()
    ) {
      res.status(400).json({
        error:
          'PIN is required.',
      });
      return;
    }

    try {
      const r =
        await db.execute(sql`
          SELECT password_hash
          FROM admin_accounts
          WHERE id =
            ${req.session.adminId!}
          LIMIT 1
        `);

      if (!r.rows.length) {
        res.status(404).json({
          error:
            'Admin account not found.',
        });
        return;
      }

      const passwordHash =
        String(
          (
            r.rows[0] as Record<
              string,
              unknown
            >
          )[
            'password_hash'
          ] ?? '',
        );

      const valid =
        await verifyPin(
          String(pin),
          passwordHash,
        );

      res.json({
        valid,
      });
    } catch (err) {
      logger.error(
        { err },
        'POST /verify-pin failed',
      );

      res.status(500).json({
        error:
          'Failed to verify PIN.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// SYSTEM SETTINGS
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/settings',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const r =
        await db.execute(sql`
          SELECT
            key,
            value,
            updated_at
          FROM system_settings
          ORDER BY key ASC
        `);

      res.json({
        settings:
          r.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /settings failed',
      );

      res.status(500).json({
        error:
          'Failed to load system settings.',
      });
    }
  },
);

router.patch(
  '/settings',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const settings =
      req.body?.settings;

    if (
      !settings ||
      typeof settings !==
        'object' ||
      Array.isArray(
        settings,
      )
    ) {
      res.status(400).json({
        error:
          'settings object is required.',
      });
      return;
    }

    try {
      const adminId =
        req.session.adminId!;

      const adminEmail =
        await getAdminEmail(
          adminId,
        );

      for (
        const [
          key,
          value,
        ] of Object.entries(
          settings as Record<
            string,
            unknown
          >,
        )
      ) {
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
              ${key},
              ${String(
                value ?? '',
              )},
              ${adminId},
              NOW()
            )
          ON CONFLICT (key)
          DO UPDATE SET
            value =
              EXCLUDED.value,
            updated_by =
              EXCLUDED.updated_by,
            updated_at =
              NOW()
        `);
      }

      void auditLog({
        adminId,
        adminEmail,
        action:
          'system_settings_updated',
        details: {
          keys:
            Object.keys(
              settings,
            ),
        },
        ip:
          clientIp(req),
      });

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'PATCH /settings failed',
      );

      res.status(500).json({
        error:
          'Failed to update system settings.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/announcements',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const r =
        await db.execute(sql`
          SELECT *
          FROM announcements
          ORDER BY
            created_at DESC
        `);

      res.json({
        announcements:
          r.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /announcements failed',
      );

      res.status(500).json({
        error:
          'Failed to load announcements.',
      });
    }
  },
);

router.post(
  '/announcements',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      title,
      message,
      type,
      active,
    } =
      req.body as {
        title?: string;
        message?: string;
        type?: string;
        active?: boolean;
      };

    if (
      !title ||
      !message
    ) {
      res.status(400).json({
        error:
          'Title and message are required.',
      });
      return;
    }

    try {
      const r =
        await db.execute(sql`
          INSERT INTO announcements
            (
              title,
              message,
              type,
              active,
              created_at,
              updated_at
            )
          VALUES
            (
              ${title.trim()},
              ${message.trim()},
              ${type ?? 'info'},
              ${active ?? true},
              NOW(),
              NOW()
            )
          RETURNING *
        `);

      const adminId =
        req.session.adminId!;

      const adminEmail =
        await getAdminEmail(
          adminId,
        );

      void auditLog({
        adminId,
        adminEmail,
        action:
          'announcement_created',
        targetType:
          'announcement',
        targetId:
          String(
            (
              r.rows[0] as Record<
                string,
                unknown
              >
            )['id'],
          ),
        ip:
          clientIp(req),
      });

      res.status(201).json({
        ok: true,
        announcement:
          r.rows[0],
      });
    } catch (err) {
      logger.error(
        { err },
        'POST /announcements failed',
      );

      res.status(500).json({
        error:
          'Failed to create announcement.',
      });
    }
  },
);

router.patch(
  '/announcements/:id',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      id,
    } =
      req.params as {
        id: string;
      };

    const {
      title,
      message,
      type,
      active,
    } =
      req.body as {
        title?: string;
        message?: string;
        type?: string;
        active?: boolean;
      };

    try {
      const r =
        await db.execute(sql`
          UPDATE announcements
          SET
            title =
              COALESCE(
                ${title ?? null},
                title
              ),

            message =
              COALESCE(
                ${message ?? null},
                message
              ),

            type =
              COALESCE(
                ${type ?? null},
                type
              ),

            active =
              COALESCE(
                ${active ?? null},
                active
              ),

            updated_at =
              NOW()

          WHERE id =
            ${id}

          RETURNING *
        `);

      if (!r.rows.length) {
        res.status(404).json({
          error:
            'Announcement not found.',
        });
        return;
      }

      const adminId =
        req.session.adminId!;

      const adminEmail =
        await getAdminEmail(
          adminId,
        );

      void auditLog({
        adminId,
        adminEmail,
        action:
          'announcement_updated',
        targetType:
          'announcement',
        targetId:
          id,
        ip:
          clientIp(req),
      });

      res.json({
        ok: true,
        announcement:
          r.rows[0],
      });
    } catch (err) {
      logger.error(
        { err },
        'PATCH /announcements/:id failed',
      );

      res.status(500).json({
        error:
          'Failed to update announcement.',
      });
    }
  },
);

router.delete(
  '/announcements/:id',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      id,
    } =
      req.params as {
        id: string;
      };

    try {
      const r =
        await db.execute(sql`
          DELETE FROM announcements
          WHERE id =
            ${id}
          RETURNING id
        `);

      if (!r.rows.length) {
        res.status(404).json({
          error:
            'Announcement not found.',
        });
        return;
      }

      const adminId =
        req.session.adminId!;

      const adminEmail =
        await getAdminEmail(
          adminId,
        );

      void auditLog({
        adminId,
        adminEmail,
        action:
          'announcement_deleted',
        targetType:
          'announcement',
        targetId:
          id,
        ip:
          clientIp(req),
      });

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'DELETE /announcements/:id failed',
      );

      res.status(500).json({
        error:
          'Failed to delete announcement.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// PROVIDER SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/provider-summary',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const smeConfigured =
        Boolean(
          String(
            process.env[
              'SME_API_KEY'
            ] ?? '',
          ).trim(),
        );

      const monnifyConfigured =
        Boolean(
          String(
            process.env[
              'MONNIFY_API_KEY'
            ] ?? '',
          ).trim(),
        );

      res.json({
        providers: [
          {
            key: 'smeapi',
            name: 'SME API',
            type:
              'VTU / Data / Airtime',
            configured:
              smeConfigured,

            networks: {
              mtn: '1',
              glo: '2',
              '9mobile': '3',
              airtel: '4',
            },
          },

          {
            key: 'monnify',
            name: 'Monnify',
            type:
              'Payment Gateway',
            configured:
              monnifyConfigured,
          },
        ],
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /provider-summary failed',
      );

      res.status(500).json({
        error:
          'Failed to load provider summary.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// SME API WALLET BALANCE
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/smeapi/wallet',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const result =
        await getWalletBalance();

      if (!result.success) {
        res.status(502).json({
          ok: false,
          error:
            result.message ||
            'Failed to load SME API wallet balance.',
        });
        return;
      }

      res.json({
        ok: true,
        provider:
          'smeapi',
        balance:
          Number(
            result.balance,
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /smeapi/wallet failed',
      );

      res.status(500).json({
        ok: false,
        error:
          'Failed to load SME API wallet balance.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// SUPPORT
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/support',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const r =
        await db.execute(sql`
          SELECT
            key,
            value
          FROM system_settings
          WHERE key IN (
            'support_phone',
            'support_email',
            'support_whatsapp',
            'support_message'
          )
        `);

      const settings:
        Record<
          string,
          string
        > = {};

      for (
        const row of
          r.rows
      ) {
        const x =
          row as Record<
            string,
            unknown
          >;

        settings[
          String(
            x['key'],
          )
        ] =
          String(
            x['value'] ??
              '',
          );
      }

      res.json({
        phone:
          settings[
            'support_phone'
          ] ??
          '',

        email:
          settings[
            'support_email'
          ] ??
          '',

        whatsapp:
          settings[
            'support_whatsapp'
          ] ??
          '',

        message:
          settings[
            'support_message'
          ] ??
          '',
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /support failed',
      );

      res.status(500).json({
        error:
          'Failed to load support settings.',
      });
    }
  },
);

router.patch(
  '/support',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      phone,
      email,
      whatsapp,
      message,
    } =
      req.body as {
        phone?: string;
        email?: string;
        whatsapp?: string;
        message?: string;
      };

    try {
      const adminId =
        req.session.adminId!;

      const adminEmail =
        await getAdminEmail(
          adminId,
        );

      const values:
        Record<
          string,
          string |
            undefined
        > = {
        support_phone:
          phone,

        support_email:
          email,

        support_whatsapp:
          whatsapp,

        support_message:
          message,
      };

      for (
        const [
          key,
          value,
        ] of Object.entries(
          values,
        )
      ) {
        if (
          value ===
          undefined
        ) {
          continue;
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
              ${key},
              ${value},
              ${adminId},
              NOW()
            )
          ON CONFLICT (key)
          DO UPDATE SET
            value =
              EXCLUDED.value,
            updated_by =
              EXCLUDED.updated_by,
            updated_at =
              NOW()
        `);
      }

      void auditLog({
        adminId,
        adminEmail,
        action:
          'support_settings_updated',
        details: {
          fields:
            Object.keys(
              values,
            ).filter(
              (key) =>
                values[
                  key
                ] !==
                undefined,
            ),
        },
        ip:
          clientIp(req),
      });

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'PATCH /support failed',
      );

      res.status(500).json({
        error:
          'Failed to update support settings.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// FINANCE PERMISSIONS
// ═════════════════════════════════════════════════════════════════════════════

function hasFinancePermission(
  req: Request,
  permission:
    FinancePermission,
): boolean {
  const permissions =
    req.session
      .financePermissions;

  if (
    !permissions
  ) {
    return false;
  }

  return permissions.includes(
    permission,
  );
}

function requireFinancePermission(
  permission:
    FinancePermission,
) {
  return (
    req: Request,
    res: Response,
    next: NextFunction,
  ): void => {
    if (
      !hasFinancePermission(
        req,
        permission,
      )
    ) {
      res.status(403).json({
        error:
          'Finance permission required.',
      });
      return;
    }

    next();
  };
}

router.get(
  '/finance/permissions',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      res.json({
        permissions:
          FINANCE_PERMISSIONS,

        current:
          req.session
            .financePermissions ??
          [],
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /finance/permissions failed',
      );

      res.status(500).json({
        error:
          'Failed to load finance permissions.',
      });
    }
  },
);

router.post(
  '/finance/permissions',
  requireFinancePermission(
    'manage_finance_permissions',
  ),
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      adminId,
      permissions,
    } =
      req.body as {
        adminId?: string;
        permissions?:
          FinancePermission[];
      };

    if (
      !adminId ||
      !Array.isArray(
        permissions,
      )
    ) {
      res.status(400).json({
        error:
          'adminId and permissions are required.',
      });
      return;
    }

    const validPermissions =
      permissions.filter(
        (
          permission,
        ) =>
          FINANCE_PERMISSIONS.includes(
            permission,
          ),
      );

    try {
      await db.execute(sql`
        UPDATE admin_accounts
        SET
          finance_permissions =
            ${JSON.stringify(
              validPermissions,
            )}::jsonb,

          updated_at =
            NOW()

        WHERE id =
          ${adminId}
      `);

      const actorId =
        req.session.adminId!;

      const actorEmail =
        await getAdminEmail(
          actorId,
        );

      void auditLog({
        adminId:
          actorId,
        adminEmail:
          actorEmail,
        action:
          'finance_permissions_updated',
        targetType:
          'admin',
        targetId:
          adminId,
        details: {
          permissions:
            validPermissions,
        },
        ip:
          clientIp(req),
      });

      res.json({
        ok: true,
        permissions:
          validPermissions,
      });
    } catch (err) {
      logger.error(
        { err },
        'POST /finance/permissions failed',
      );

      res.status(500).json({
        error:
          'Failed to update finance permissions.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN ACCOUNTS
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/admins',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const r =
        await db.execute(sql`
          SELECT
            id,
            name,
            email,
            role,
            status,
            finance_permissions,
            created_at,
            updated_at,
            last_login_at
          FROM admin_accounts
          ORDER BY
            created_at DESC
        `);

      res.json({
        admins:
          r.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /admins failed',
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
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      name,
      email,
      password,
      role,
    } =
      req.body as {
        name?: string;
        email?: string;
        password?: string;
        role?: string;
      };

    if (
      !name ||
      !email ||
      !password ||
      !role
    ) {
      res.status(400).json({
        error:
          'Name, email, password and role are required.',
      });
      return;
    }

    try {
      const existing =
        await db.execute(sql`
          SELECT id
          FROM admin_accounts
          WHERE LOWER(email) =
            LOWER(${email.trim()})
          LIMIT 1
        `);

      if (
        existing.rows
          .length
      ) {
        res.status(409).json({
          error:
            'An admin account with this email already exists.',
        });
        return;
      }

      const passwordHash =
        await hashPin(
          password,
        );

      const r =
        await db.execute(sql`
          INSERT INTO admin_accounts
            (
              name,
              email,
              password_hash,
              role,
              status,
              created_at,
              updated_at
            )
          VALUES
            (
              ${name.trim()},
              ${email.trim().toLowerCase()},
              ${passwordHash},
              ${role},
              'active',
              NOW(),
              NOW()
            )
          RETURNING
            id,
            name,
            email,
            role,
            status,
            created_at,
            updated_at
        `);

      const adminId =
        req.session.adminId!;

      const adminEmail =
        await getAdminEmail(
          adminId,
        );

      void auditLog({
        adminId,
        adminEmail,
        action:
          'admin_created',
        targetType:
          'admin',
        targetId:
          String(
            (
              r.rows[0] as Record<
                string,
                unknown
              >
            )['id'],
          ),
        details: {
          role,
        },
        ip:
          clientIp(req),
      });

      res.status(201).json({
        ok: true,
        admin:
          r.rows[0],
      });
    } catch (err) {
      logger.error(
        { err },
        'POST /admins failed',
      );

      res.status(500).json({
        error:
          'Failed to create admin account.',
      });
    }
  },
);

router.patch(
  '/admins/:id/status',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      id,
    } =
      req.params as {
        id: string;
      };

    const {
      status,
    } =
      req.body as {
        status?: string;
      };

    if (!status) {
      res.status(400).json({
        error:
          'Status is required.',
      });
      return;
    }

    if (
      id ===
        req.session
          .adminId &&
      status !==
        'active'
    ) {
      res.status(400).json({
        error:
          'You cannot deactivate your own account.',
      });
      return;
    }

    try {
      const r =
        await db.execute(sql`
          UPDATE admin_accounts
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
            email,
            role,
            status
        `);

      if (!r.rows.length) {
        res.status(404).json({
          error:
            'Admin account not found.',
        });
        return;
      }

      const adminId =
        req.session.adminId!;

      const adminEmail =
        await getAdminEmail(
          adminId,
        );

      void auditLog({
        adminId,
        adminEmail,
        action:
          'admin_status_updated',
        targetType:
          'admin',
        targetId:
          id,
        details: {
          status,
        },
        ip:
          clientIp(req),
      });

      res.json({
        ok: true,
        admin:
          r.rows[0],
      });
    } catch (err) {
      logger.error(
        { err },
        'PATCH /admins/:id/status failed',
      );

      res.status(500).json({
        error:
          'Failed to update admin status.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/audit-logs',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const page =
      Math.max(
        1,
        Number(
          req.query['page'] ??
            1,
        ),
      );

    const limit =
      Math.min(
        100,
        Math.max(
          1,
          Number(
            req.query['limit'] ??
              50,
          ),
        ),
      );

    const offset =
      (page - 1) *
      limit;

    try {
      const [
        countRes,
        rowsRes,
      ] =
        await Promise.all([
          db.execute(sql`
            SELECT COUNT(*)::int AS total
            FROM admin_audit_logs
          `),

          db.execute(sql`
            SELECT *
            FROM admin_audit_logs
            ORDER BY
              created_at DESC
            LIMIT ${limit}
            OFFSET ${offset}
          `),
        ]);

      const total =
        Number(
          (
            countRes
              .rows[0] as Record<
                string,
                unknown
              >
          )?.['total'] ??
            0,
        );

      res.json({
        page,
        limit,
        total,
        totalPages:
          Math.ceil(
            total / limit,
          ),
        logs:
          rowsRes.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /audit-logs failed',
      );

      res.status(500).json({
        error:
          'Failed to load audit logs.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// PROFILE
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/profile',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const r =
        await db.execute(sql`
          SELECT
            id,
            name,
            email,
            role,
            status,
            created_at,
            updated_at,
            last_login_at
          FROM admin_accounts
          WHERE id =
            ${req.session.adminId!}
          LIMIT 1
        `);

      if (!r.rows.length) {
        res.status(404).json({
          error:
            'Admin profile not found.',
        });
        return;
      }

      res.json({
        profile:
          r.rows[0],
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /profile failed',
      );

      res.status(500).json({
        error:
          'Failed to load profile.',
      });
    }
  },
);

router.patch(
  '/profile',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      name,
      email,
    } =
      req.body as {
        name?: string;
        email?: string;
      };

    if (
      !name &&
      !email
    ) {
      res.status(400).json({
        error:
          'Nothing to update.',
      });
      return;
    }

    try {
      const r =
        await db.execute(sql`
          UPDATE admin_accounts
          SET
            name =
              COALESCE(
                ${name ?? null},
                name
              ),

            email =
              COALESCE(
                ${
                  email
                    ?.trim()
                    .toLowerCase() ??
                  null
                },
                email
              ),

            updated_at =
              NOW()

          WHERE id =
            ${req.session.adminId!}

          RETURNING
            id,
            name,
            email,
            role,
            status
        `);

      if (!r.rows.length) {
        res.status(404).json({
          error:
            'Admin profile not found.',
        });
        return;
      }

      const adminId =
        req.session.adminId!;

      const adminEmail =
        await getAdminEmail(
          adminId,
        );

      void auditLog({
        adminId,
        adminEmail,
        action:
          'admin_profile_updated',
        targetType:
          'admin',
        targetId:
          adminId,
        details: {
          nameProvided:
            name !==
            undefined,

          emailProvided:
            email !==
            undefined,
        },
        ip:
          clientIp(req),
      });

      res.json({
        ok: true,
        profile:
          r.rows[0],
      });
    } catch (err) {
      logger.error(
        { err },
        'PATCH /profile failed',
      );

      res.status(500).json({
        error:
          'Failed to update profile.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// EXPORT
// ═════════════════════════════════════════════════════════════════════════════

export default router;
