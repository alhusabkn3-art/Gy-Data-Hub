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
        error: 'Failed to load user transactions.',
      });
    }
  },
);

// ── PATCH /admin/users/:id/status ────────────────────────────────────────────

router.patch(
  '/users/:id/status',
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const status = String(req.body?.status ?? '').trim();

    const allowedStatuses = [
      'active',
      'inactive',
      'suspended',
      'blocked',
    ];

    if (!allowedStatuses.includes(status)) {
      res.status(400).json({
        error: 'Invalid user status.',
      });
      return;
    }

    try {
      const r = await db.execute(sql`
        UPDATE users
        SET
          status = ${status},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING *
      `);

      if (!r.rows.length) {
        res.status(404).json({
          error: 'User not found.',
        });
        return;
      }

      const adminId = req.session.adminId!;
      const adminEmail = await getAdminEmail(adminId);

      void auditLog({
        adminId,
        adminEmail,
        action: 'user_status_updated',
        targetType: 'user',
        targetId: id,
        details: { status },
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        user: r.rows[0],
      });
    } catch (err) {
      logger.error(
        { err },
        'PATCH /users/:id/status failed',
      );
      res.status(500).json({
        error: 'Failed to update user status.',
      });
    }
  },
);

// ── POST /admin/users/:id/reset-pin ──────────────────────────────────────────

router.post(
  '/users/:id/reset-pin',
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };
    const pin = randomPin();

    try {
      const hashed = await hashPin(pin);

      const r = await db.execute(sql`
        UPDATE users
        SET
          purchase_pin_hash = ${hashed},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, name, phone
      `);

      if (!r.rows.length) {
        res.status(404).json({
          error: 'User not found.',
        });
        return;
      }

      const adminId = req.session.adminId!;
      const adminEmail = await getAdminEmail(adminId);

      void auditLog({
        adminId,
        adminEmail,
        action: 'user_transaction_pin_reset',
        targetType: 'user',
        targetId: id,
        details: {
          phone: String(
            (r.rows[0] as Record<string, unknown>)['phone'] ?? '',
          ),
        },
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        temporaryPin: pin,
        message: 'Transaction PIN reset successfully.',
      });
    } catch (err) {
      logger.error(
        { err },
        'POST /users/:id/reset-pin failed',
      );

      res.status(500).json({
        error: 'Failed to reset transaction PIN.',
      });
    }
  },
);

// ── POST /admin/users/:id/wallet/credit ──────────────────────────────────────

router.post(
  '/users/:id/wallet/credit',
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    const amount = Number(req.body?.amount);
    const reason = String(req.body?.reason ?? '').trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({
        error: 'A valid positive amount is required.',
      });
      return;
    }

    if (!reason) {
      res.status(400).json({
        error: 'Reason is required.',
      });
      return;
    }

    try {
      const adminId = req.session.adminId!;
      const adminEmail = await getAdminEmail(adminId);

      let reference = '';
      let balanceBefore = 0;
      let balanceAfter = 0;

      await db.transaction(async (tx) => {
        await tx.execute(sql`
          INSERT INTO wallets
            (user_id, balance, created_at, updated_at)
          VALUES
            (${id}, 0, NOW(), NOW())
          ON CONFLICT (user_id)
          DO NOTHING
        `);

        const wallet = await tx.execute(sql`
          SELECT
            id,
            balance
          FROM wallets
          WHERE user_id = ${id}
          FOR UPDATE
        `);

        if (!wallet.rows.length) {
          throw new Error(
            'Wallet not found after creation.',
          );
        }

        const walletRow =
          wallet.rows[0] as Record<string, unknown>;

        const walletId = String(walletRow['id']);
        balanceBefore = Number(
          walletRow['balance'] ?? 0,
        );
        balanceAfter = balanceBefore + amount;
        reference = makeRef('ADMINCR');

        await tx.execute(sql`
          UPDATE wallets
          SET
            balance = ${balanceAfter},
            updated_at = NOW()
          WHERE user_id = ${id}
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
              ${id},
              ${walletId},
              'credit',
              ${amount},
              ${balanceBefore},
              ${balanceAfter},
              ${reference},
              ${reason},
              ${adminId},
              NOW()
            )
        `);
      });

      void auditLog({
        adminId,
        adminEmail,
        action: 'wallet_manual_credit',
        targetType: 'user',
        targetId: id,
        details: {
          amount,
          reason,
          reference,
          balanceBefore,
          balanceAfter,
        },
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        amount,
        reference,
        balanceBefore,
        balanceAfter,
      });
    } catch (err) {
      logger.error(
        { err },
        'POST /users/:id/wallet/credit failed',
      );

      res.status(500).json({
        error: 'Failed to credit wallet.',
      });
    }
  },
);

// ── POST /admin/users/:id/wallet/debit ───────────────────────────────────────

router.post(
  '/users/:id/wallet/debit',
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params as { id: string };

    const amount = Number(req.body?.amount);
    const reason = String(req.body?.reason ?? '').trim();

    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({
        error: 'A valid positive amount is required.',
      });
      return;
    }

    if (!reason) {
      res.status(400).json({
        error: 'Reason is required.',
      });
      return;
    }

    try {
      const adminId = req.session.adminId!;
      const adminEmail = await getAdminEmail(adminId);

      await db.transaction(async (tx) => {
        const wallet = await tx.execute(sql`
          SELECT
            id,
            balance
          FROM wallets
          WHERE user_id = ${id}
          FOR UPDATE
        `);

        if (!wallet.rows.length) {
          throw new Error('Wallet not found.');
        }

        const walletRow =
          wallet.rows[0] as Record<string, unknown>;

        const walletId = String(walletRow['id']);

        const balance = Number(
          walletRow['balance'] ?? 0,
        );

        if (balance < amount) {
          throw new Error(
            'Insufficient wallet balance.',
          );
        }

        const balanceAfter = balance - amount;

        await tx.execute(sql`
          UPDATE wallets
          SET
            balance = ${balanceAfter},
            updated_at = NOW()
          WHERE user_id = ${id}
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
              ${id},
              ${walletId},
              'debit',
              ${amount},
              ${balance},
              ${balanceAfter},
              ${makeRef('ADMINDR')},
              ${reason},
              ${adminId},
              NOW()
            )
        `);
      });

      void auditLog({
        adminId,
        adminEmail,
        action: 'wallet_manual_debit',
        targetType: 'user',
        targetId: id,
        details: {
          amount,
          reason,
        },
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        amount,
      });
    } catch (err) {
      logger.error(
        { err },
        'POST /users/:id/wallet/debit failed',
      );

      const message =
        err instanceof Error
          ? err.message
          : 'Failed to debit wallet.';

      res
        .status(
          message === 'Insufficient wallet balance.'
            ? 400
            : 500,
        )
        .json({
          error: message,
        });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/dashboard',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [
        users,
        transactions,
        successfulTransactions,
        pendingTransactions,
        failedTransactions,
        walletBalances,
      ] = await Promise.all([
        db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM users
        `),

        db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM transactions
        `),

        db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM transactions
          WHERE status = 'success'
        `),

        db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM transactions
          WHERE status = 'pending'
        `),

        db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM transactions
          WHERE status = 'failed'
        `),

        db.execute(sql`
          SELECT
            COALESCE(SUM(balance), 0)::numeric AS total
          FROM wallets
        `),
      ]);

      res.json({
        users: Number(
          (users.rows[0] as Record<string, unknown>)?.['count'] ??
            0,
        ),

        transactions: Number(
          (transactions.rows[0] as Record<string, unknown>)?.[
            'count'
          ] ?? 0,
        ),

        successfulTransactions: Number(
          (
            successfulTransactions.rows[0] as Record<
              string,
              unknown
            >
          )?.['count'] ?? 0,
        ),

        pendingTransactions: Number(
          (
            pendingTransactions.rows[0] as Record<
              string,
              unknown
            >
          )?.['count'] ?? 0,
        ),

        failedTransactions: Number(
          (
            failedTransactions.rows[0] as Record<
              string,
              unknown
            >
          )?.['count'] ?? 0,
        ),

        walletBalances: Number(
          (
            walletBalances.rows[0] as Record<
              string,
              unknown
            >
          )?.['total'] ?? 0,
        ),
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /dashboard failed',
      );

      res.status(500).json({
        error: 'Failed to load dashboard.',
      });
    }
  },
);

router.get(
  '/dashboard/extended',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [
        daily,
        weekly,
        monthly,
        profit,
        activeToday,
        newWeek,
        activity,
      ] = await Promise.all([
        db.execute(sql`
          SELECT
            DATE(created_at) AS day,
            COUNT(*)::int AS transactions,
            COALESCE(
              SUM(amount) FILTER (WHERE status = 'success'),
              0
            )::numeric AS revenue
          FROM transactions
          WHERE created_at >= NOW() - INTERVAL '7 days'
          GROUP BY DATE(created_at)
          ORDER BY day ASC
        `),

        db.execute(sql`
          SELECT
            COUNT(*)::int AS transactions,
            COALESCE(
              SUM(amount) FILTER (WHERE status = 'success'),
              0
            )::numeric AS revenue
          FROM transactions
          WHERE created_at >= NOW() - INTERVAL '7 days'
        `),

        db.execute(sql`
          SELECT
            COUNT(*)::int AS transactions,
            COALESCE(
              SUM(amount) FILTER (WHERE status = 'success'),
              0
            )::numeric AS revenue
          FROM transactions
          WHERE created_at >= NOW() - INTERVAL '30 days'
        `),

        db.execute(sql`
          SELECT
            COALESCE(
              SUM(
                CASE
                  WHEN status = 'success'
                    THEN amount
                  ELSE 0
                END
              ),
              0
            )::numeric AS revenue
          FROM transactions
          WHERE created_at >= NOW() - INTERVAL '30 days'
        `),

        db.execute(sql`
          SELECT COUNT(DISTINCT user_id)::int AS count
          FROM transactions
          WHERE created_at >= CURRENT_DATE
        `),

        db.execute(sql`
          SELECT COUNT(*)::int AS count
          FROM users
          WHERE created_at >= NOW() - INTERVAL '7 days'
        `),

        db.execute(sql`
          SELECT
            type,
            status,
            COUNT(*)::int AS count
          FROM transactions
          WHERE created_at >= NOW() - INTERVAL '7 days'
          GROUP BY type, status
          ORDER BY count DESC
        `),
      ]);

      res.json({
        daily: daily.rows,
        weekly: weekly.rows[0] ?? null,
        monthly: monthly.rows[0] ?? null,
        profit: profit.rows[0] ?? null,
        activeToday: Number(
          (
            activeToday.rows[0] as Record<
              string,
              unknown
            >
          )?.['count'] ?? 0,
        ),
        newWeek: Number(
          (
            newWeek.rows[0] as Record<
              string,
              unknown
            >
          )?.['count'] ?? 0,
        ),
        activity: activity.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /dashboard/extended failed',
      );

      res.status(500).json({
        error:
          'Failed to load extended dashboard.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// FINANCIAL ADMINISTRATION
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/finance/permissions',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const adminId =
        req.session.adminId!;

      const r =
        await db.execute(sql`
          SELECT
            permission
          FROM admin_permissions
          WHERE admin_id = ${adminId}
          ORDER BY permission
        `);

      const permissions =
        r.rows.map(
          (row) =>
            String(
              (
                row as Record<
                  string,
                  unknown
                >
              )['permission'],
            ),
        );

      res.json({
        permissions,
        available:
          Object.values(
            FINANCE_PERMISSIONS,
          ),
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
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      permission,
    } =
      req.body as {
        permission?: string;
      };

    if (
      !permission ||
      !(
        Object.values(
          FINANCE_PERMISSIONS,
        ) as string[]
      ).includes(permission)
    ) {
      res.status(400).json({
        error:
          'Invalid finance permission.',
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

      await db.execute(sql`
        INSERT INTO admin_permissions
          (
            admin_id,
            permission,
            created_at
          )
        VALUES
          (
            ${adminId},
            ${permission},
            NOW()
          )
        ON CONFLICT (
          admin_id,
          permission
        )
        DO NOTHING
      `);

      void auditLog({
        adminId,
        adminEmail,
        action:
          'finance_permission_granted',
        targetType: 'admin',
        targetId: adminId,
        details: {
          permission,
        },
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        permission,
      });
    } catch (err) {
      logger.error(
        { err },
        'POST /finance/permissions failed',
      );

      res.status(500).json({
        error:
          'Failed to grant finance permission.',
      });
    }
  },
);

router.delete(
  '/finance/permissions/:permission',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const permission =
      String(
        req.params[
          'permission'
        ] ?? '',
      ).trim();

    if (
      !(
        Object.values(
          FINANCE_PERMISSIONS,
        ) as string[]
      ).includes(permission)
    ) {
      res.status(400).json({
        error:
          'Invalid finance permission.',
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

      await db.execute(sql`
        DELETE FROM admin_permissions
        WHERE
          admin_id = ${adminId}
          AND permission = ${permission}
      `);

      void auditLog({
        adminId,
        adminEmail,
        action:
          'finance_permission_revoked',
        targetType: 'admin',
        targetId: adminId,
        details: {
          permission,
        },
        ip: clientIp(req),
      });

      res.json({
        ok: true,
      });
    } catch (err) {
      logger.error(
        { err },
        'DELETE /finance/permissions/:permission failed',
      );

      res.status(500).json({
        error:
          'Failed to revoke finance permission.',
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
          ORDER BY created_at DESC
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

    const cleanTitle =
      String(
        title ?? '',
      ).trim();

    const cleanMessage =
      String(
        message ?? '',
      ).trim();

    if (
      !cleanTitle ||
      !cleanMessage
    ) {
      res.status(400).json({
        error:
          'Title and message are required.',
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

      const r =
        await db.execute(sql`
          INSERT INTO announcements
            (
              title,
              message,
              type,
              active,
              created_by,
              created_at,
              updated_at
            )
          VALUES
            (
              ${cleanTitle},
              ${cleanMessage},
              ${String(
                type ?? 'info',
              )},
              ${active !== false},
              ${adminId},
              NOW(),
              NOW()
            )
          RETURNING *
        `);

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
            )?.['id'] ??
              '',
          ),
        ip: clientIp(req),
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
                ${title !== undefined
                  ? String(title).trim()
                  : null},
                title
              ),
            message =
              COALESCE(
                ${message !== undefined
                  ? String(message).trim()
                  : null},
                message
              ),
            type =
              COALESCE(
                ${type !== undefined
                  ? String(type).trim()
                  : null},
                type
              ),
            active =
              COALESCE(
                ${active !== undefined
                  ? active
                  : null},
                active
              ),
            updated_at = NOW()
          WHERE id = ${id}
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
        targetId: id,
        ip: clientIp(req),
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
          WHERE id = ${id}
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
          'announcement_deleted',
        targetType:
          'announcement',
        targetId: id,
        ip: clientIp(req),
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
// SUPPORT / SYSTEM CONTACT
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
          SELECT key, value
          FROM system_settings
          WHERE key IN (
            'support_phone',
            'support_email',
            'support_whatsapp',
            'support_message'
          )
        `);

      const settings: Record<
        string,
        string
      > = {};

      for (const row of r.rows) {
        const x =
          row as Record<
            string,
            unknown
          >;

        settings[
          String(x['key'])
        ] = String(
          x['value'] ?? '',
        );
      }

      res.json({
        phone:
          settings[
            'support_phone'
          ] ?? '',

        email:
          settings[
            'support_email'
          ] ?? '',

        whatsapp:
          settings[
            'support_whatsapp'
          ] ?? '',

        message:
          settings[
            'support_message'
          ] ?? '',
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
          string | undefined
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
            value = EXCLUDED.value,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
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
                values[key] !==
                undefined,
            ),
        },
        ip: clientIp(req),
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
// DATA PLAN / SERVICE COUNTS
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/catalogue/summary',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const r =
        await db.execute(sql`
          SELECT
            provider,
            service_type,
            COUNT(*)::int AS plans,
            COUNT(*)
              FILTER (
                WHERE enabled = true
              )::int AS enabled_plans,
            MIN(
              selling_price
            )::numeric AS minimum_price,
            MAX(
              selling_price
            )::numeric AS maximum_price
          FROM pricing_rules
          GROUP BY
            provider,
            service_type
          ORDER BY
            provider,
            service_type
        `);

      res.json({
        catalogue:
          r.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /catalogue/summary failed',
      );

      res.status(500).json({
        error:
          'Failed to load catalogue summary.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN PROFILE
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
          WHERE id = ${req.session.adminId!}
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

    if (!name && !email) {
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
            updated_at = NOW()
          WHERE id = ${req.session.adminId!}
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
        targetType: 'admin',
        targetId: adminId,
        details: {
          nameProvided:
            name !== undefined,
          emailProvided:
            email !== undefined,
        },
        ip: clientIp(req),
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
