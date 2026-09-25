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

type WalletAdjustmentType = 'credit' | 'debit';

interface WalletAdjustmentResult {
  walletId: string;
  reference: string;
  balanceBefore: number;
  balanceAfter: number;
}

async function adjustUserWallet(
  userId: string,
  adminId: string,
  type: WalletAdjustmentType,
  amount: number,
  reason: string,
): Promise<WalletAdjustmentResult> {
  const normalizedAmount = Math.round(amount * 100) / 100;

  if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error('A valid positive amount is required.');
  }

  if (normalizedAmount < 0.01) {
    throw new Error('Amount must be at least 0.01.');
  }

  const trimmedReason = reason.trim();

  if (trimmedReason.length < 10) {
    throw new Error('Reason must be at least 10 characters.');
  }

  const reference = makeRef(
    type === 'credit' ? 'ADMINFUND' : 'ADMINDEBIT',
  );

  return db.transaction(async (tx) => {
    const walletResult = await tx.execute(sql`
      SELECT
        id,
        balance
      FROM wallets
      WHERE user_id = ${userId}
      LIMIT 1
      FOR UPDATE
    `);

    if (!walletResult.rows.length) {
      throw new Error('User wallet not found.');
    }

    const wallet = walletResult.rows[0] as Record<string, unknown>;
    const walletId = String(wallet['id']);
    const balanceBefore = Number(wallet['balance'] ?? 0);

    if (!Number.isFinite(balanceBefore)) {
      throw new Error('Wallet balance is invalid.');
    }

    const balanceAfter =
      type === 'credit'
        ? balanceBefore + normalizedAmount
        : balanceBefore - normalizedAmount;

    if (type === 'debit' && balanceAfter < 0) {
      throw new Error('Insufficient wallet balance.');
    }

    await tx.execute(sql`
      UPDATE wallets
      SET
        balance = ${balanceAfter.toFixed(2)},
        updated_at = NOW()
      WHERE id = ${walletId}
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
          ${userId},
          ${walletId},
          ${type},
          ${normalizedAmount.toFixed(2)},
          ${balanceBefore.toFixed(2)},
          ${balanceAfter.toFixed(2)},
          ${reference},
          ${trimmedReason},
          ${adminId},
          NOW()
        )
    `);

    return {
      walletId,
      reference,
      balanceBefore,
      balanceAfter,
    };
  });
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
    const amount = Number(req.body?.amount);
    const reason =
      typeof req.body?.reason === 'string'
        ? req.body.reason.trim()
        : '';

    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({
        error: 'A valid positive amount is required.',
      });
      return;
    }

    if (amount < 0.01) {
      res.status(400).json({
        error: 'Amount must be at least 0.01.',
      });
      return;
    }

    if (reason.length < 10) {
      res.status(400).json({
        error: 'Reason must be at least 10 characters.',
      });
      return;
    }

    const adminId = req.session.adminId!;

    try {
      const result = await adjustUserWallet(
        id,
        adminId,
        'credit',
        amount,
        reason,
      );

      const adminEmail = await getAdminEmail(adminId);

      void auditLog({
        adminId,
        adminEmail,
        action: 'wallet_funded',
        targetType: 'user',
        targetId: id,
        details: {
          amount: Math.round(amount * 100) / 100,
          balanceBefore: result.balanceBefore,
          balanceAfter: result.balanceAfter,
          reference: result.reference,
          reason,
        },
        ip: clientIp(req),
      });

      void financialAuditLog({
        adminId,
        adminEmail,
        action: 'wallet_funded',
        userId: id,
        amount: Math.round(amount * 100) / 100,
        reference: result.reference,
        metadata: {
          balanceBefore: result.balanceBefore,
          balanceAfter: result.balanceAfter,
          reason,
        },
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        reference: result.reference,
        walletId: result.walletId,
        balance: result.balanceAfter,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to fund wallet.';

      if (message === 'User wallet not found.') {
        res.status(404).json({ error: message });
        return;
      }

      if (
        message === 'Amount must be at least 0.01.' ||
        message === 'Reason must be at least 10 characters.'
      ) {
        res.status(400).json({ error: message });
        return;
      }

      logger.error(
        { err },
        'POST /users/:id/fund-wallet failed',
      );

      res.status(500).json({
        error: 'Failed to fund wallet.',
      });
    }
  },
);

router.post(
  '/users/:id/wallet/debit',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const { id } = req.params as { id: string };
    const amount = Number(req.body?.amount);
    const reason =
      typeof req.body?.reason === 'string'
        ? req.body.reason.trim()
        : '';

    if (!Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({
        error: 'A valid positive amount is required.',
      });
      return;
    }

    if (amount < 0.01) {
      res.status(400).json({
        error: 'Amount must be at least 0.01.',
      });
      return;
    }

    if (reason.length < 10) {
      res.status(400).json({
        error: 'Reason must be at least 10 characters.',
      });
      return;
    }

    const adminId = req.session.adminId!;

    try {
      const result = await adjustUserWallet(
        id,
        adminId,
        'debit',
        amount,
        reason,
      );

      const adminEmail = await getAdminEmail(adminId);

      void auditLog({
        adminId,
        adminEmail,
        action: 'wallet_debited',
        targetType: 'user',
        targetId: id,
        details: {
          amount: Math.round(amount * 100) / 100,
          balanceBefore: result.balanceBefore,
          balanceAfter: result.balanceAfter,
          reference: result.reference,
          reason,
        },
        ip: clientIp(req),
      });

      void financialAuditLog({
        adminId,
        adminEmail,
        action: 'wallet_debited',
        userId: id,
        amount: Math.round(amount * 100) / 100,
        reference: result.reference,
        metadata: {
          balanceBefore: result.balanceBefore,
          balanceAfter: result.balanceAfter,
          reason,
        },
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        reference: result.reference,
        walletId: result.walletId,
        balance: result.balanceAfter,
        balanceBefore: result.balanceBefore,
        balanceAfter: result.balanceAfter,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Failed to debit wallet.';

      if (message === 'User wallet not found.') {
        res.status(404).json({ error: message });
        return;
      }

      if (message === 'Insufficient wallet balance.') {
        res.status(409).json({ error: message });
        return;
      }

      if (
        message === 'Amount must be at least 0.01.' ||
        message === 'Reason must be at least 10 characters.'
      ) {
        res.status(400).json({ error: message });
        return;
      }

      logger.error(
        { err },
        'POST /users/:id/wallet/debit failed',
      );

      res.status(500).json({
        error: 'Failed to debit wallet.',
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
        totalUsers: Number(
          (
            usersRes.rows[0] as Record<
              string,
              unknown
            >
          )?.['count'] ??
            0,
        ),

        activeUsers: Number(
          (
            activeUsersRes.rows[0] as Record<
              string,
              unknown
            >
          )?.['count'] ??
            0,
        ),

        totalWalletBalance: Number(
          (
            walletRes.rows[0] as Record<
              string,
              unknown
            >
          )?.['balance'] ??
            0,
        ),

        totalTransactions: Number(
          (
            transactionsRes.rows[0] as Record<
              string,
              unknown
            >
          )?.['count'] ??
            0,
        ),

        pendingTransactions: Number(
          (
            pendingRes.rows[0] as Record<
              string,
              unknown
            >
          )?.['count'] ??
            0,
        ),

        successfulTransactions: Number(
          (
            successfulRes.rows[0] as Record<
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
// PIN MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

router.post(
  '/generate-pin',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const pin = randomPin();

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
            updated_at
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

router.patch(
  '/admins/:id',
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
      name,
      email,
      role,
      status,
    } =
      req.body as {
        name?: string;
        email?: string;
        role?: string;
        status?: string;
      };

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
                ${email ?? null},
                email
              ),

            role =
              COALESCE(
                ${role ?? null},
                role
              ),

            status =
              COALESCE(
                ${status ?? null},
                status
              ),

            updated_at =
              NOW()

          WHERE id =
            ${id}

          RETURNING
            id,
            name,
            email,
            role,
            status,
            finance_permissions,
            created_at,
            updated_at
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
          'admin_account_updated',
        targetType:
          'admin',
        targetId:
          id,
        details: {
          fields: [
            name !== undefined
              ? 'name'
              : null,
            email !== undefined
              ? 'email'
              : null,
            role !== undefined
              ? 'role'
              : null,
            status !== undefined
              ? 'status'
              : null,
          ].filter(Boolean),
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
        'PATCH /admins/:id failed',
      );

      res.status(500).json({
        error:
          'Failed to update admin account.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN AUDIT LOGS
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
// ADMIN LOGIN HISTORY
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/login-history',
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
            FROM admin_login_history
          `),

          db.execute(sql`
            SELECT
              alh.*,
              aa.email AS admin_email
            FROM admin_login_history alh
            LEFT JOIN admin_accounts aa
              ON aa.id = alh.admin_id
            ORDER BY
              alh.created_at DESC
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
        history:
          rowsRes.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /login-history failed',
      );

      res.status(500).json({
        error:
          'Failed to load login history.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// SESSIONS
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/sessions',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const r =
        await db.execute(sql`
          SELECT
            s.id,
            s.admin_id,
            aa.email AS admin_email,
            s.ip_address,
            s.user_agent,
            s.created_at,
            s.last_active_at,
            s.expires_at
          FROM admin_sessions s
          LEFT JOIN admin_accounts aa
            ON aa.id = s.admin_id
          ORDER BY
            s.created_at DESC
        `);

      res.json({
        sessions:
          r.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /sessions failed',
      );

      res.status(500).json({
        error:
          'Failed to load sessions.',
      });
    }
  },
);

router.delete(
  '/sessions/:id',
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
          DELETE FROM admin_sessions
          WHERE id =
            ${id}
          RETURNING id
        `);

      if (!r.rows.length) {
        res.status(404).json({
          error:
            'Session not found.',
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
          'admin_session_revoked',
        targetType:
          'session',
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
        'DELETE /sessions/:id failed',
      );

      res.status(500).json({
        error:
          'Failed to revoke session.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// USER STATUS / SECURITY
// ═════════════════════════════════════════════════════════════════════════════

router.patch(
  '/users/:id',
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
      reason,
    } =
      req.body as {
        status?: string;
        reason?: string;
      };

    if (
      !status
    ) {
      res.status(400).json({
        error:
          'Status is required.',
      });
      return;
    }

    try {
      const r =
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
            status
        `);

      if (!r.rows.length) {
        res.status(404).json({
          error:
            'User not found.',
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
          'user_status_changed',
        targetType:
          'user',
        targetId:
          id,
        details: {
          status,
          reason:
            reason ??
            null,
        },
        ip:
          clientIp(req),
      });

      res.json({
        ok: true,
        user:
          r.rows[0],
      });
    } catch (err) {
      logger.error(
        { err },
        'PATCH /users/:id failed',
      );

      res.status(500).json({
        error:
          'Failed to update user status.',
      });
    }
  },
);

router.get(
  '/users/:id/status-history',
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
          SELECT
            id,
            user_id,
            old_status,
            new_status,
            reason,
            changed_by,
            created_at
          FROM user_status_history
          WHERE user_id =
            ${id}
          ORDER BY
            created_at DESC
        `);

      res.json({
        history:
          r.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /users/:id/status-history failed',
      );

      res.status(500).json({
        error:
          'Failed to load status history.',
      });
    }
  },
);

router.post(
  '/users/:id/reset-login-pin',
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
      const pin =
        randomPin();

      const hash =
        await hashPin(pin);

      const r =
        await db.execute(sql`
          UPDATE users
          SET
            login_pin_hash =
              ${hash},
            updated_at =
              NOW()
          WHERE id =
            ${id}
          RETURNING id
        `);

      if (!r.rows.length) {
        res.status(404).json({
          error:
            'User not found.',
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
          'user_login_pin_reset',
        targetType:
          'user',
        targetId:
          id,
        ip:
          clientIp(req),
      });

      res.json({
        tempPin:
          pin,
        message:
          'Login PIN reset successfully.',
      });
    } catch (err) {
      logger.error(
        { err },
        'POST /users/:id/reset-login-pin failed',
      );

      res.status(500).json({
        error:
          'Failed to reset login PIN.',
      });
    }
  },
);

router.post(
  '/users/:id/reset-purchase-pin',
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
      const pin =
        randomPin();

      const hash =
        await hashPin(pin);

      const r =
        await db.execute(sql`
          UPDATE users
          SET
            purchase_pin_hash =
              ${hash},
            updated_at =
              NOW()
          WHERE id =
            ${id}
          RETURNING id
        `);

      if (!r.rows.length) {
        res.status(404).json({
          error:
            'User not found.',
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
          'user_purchase_pin_reset',
        targetType:
          'user',
        targetId:
          id,
        ip:
          clientIp(req),
      });

      res.json({
        tempPin:
          pin,
        message:
          'Purchase PIN reset successfully.',
      });
    } catch (err) {
      logger.error(
        { err },
        'POST /users/:id/reset-purchase-pin failed',
      );

      res.status(500).json({
        error:
          'Failed to reset purchase PIN.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// TRANSACTION MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/transactions/:id',
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
          SELECT
            t.*,
            u.name AS user_name,
            u.phone AS user_phone,
            u.email AS user_email
          FROM transactions t
          LEFT JOIN users u
            ON u.id = t.user_id
          WHERE t.id =
            ${id}
          LIMIT 1
        `);

      if (!r.rows.length) {
        res.status(404).json({
          error:
            'Transaction not found.',
        });
        return;
      }

      res.json({
        transaction:
          r.rows[0],
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /transactions/:id failed',
      );

      res.status(500).json({
        error:
          'Failed to load transaction.',
      });
    }
  },
);

router.post(
  '/transactions/:id/mark-review',
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
      note,
    } =
      req.body as {
        note?: string;
      };

    try {
      const r =
        await db.execute(sql`
          UPDATE transactions
          SET
            status =
              'review',
            updated_at =
              NOW()
          WHERE id =
            ${id}
          RETURNING id
        `);

      if (!r.rows.length) {
        res.status(404).json({
          error:
            'Transaction not found.',
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
          'transaction_marked_review',
        targetType:
          'transaction',
        targetId:
          id,
        details: {
          note:
            note ??
            null,
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
        'POST /transactions/:id/mark-review failed',
      );

      res.status(500).json({
        error:
          'Failed to mark transaction for review.',
      });
    }
  },
);

router.post(
  '/transactions/:id/reverse',
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
      reason,
    } =
      req.body as {
        reason?: string;
      };

    if (
      !reason ||
      reason.trim().length < 10
    ) {
      res.status(400).json({
        error:
          'A reason of at least 10 characters is required.',
      });
      return;
    }

    try {
      const transactionRes =
        await db.execute(sql`
          SELECT
            id,
            user_id,
            amount,
            status,
            type
          FROM transactions
          WHERE id =
            ${id}
          LIMIT 1
        `);

      if (!transactionRes.rows.length) {
        res.status(404).json({
          error:
            'Transaction not found.',
        });
        return;
      }

      const transaction =
        transactionRes.rows[0] as Record<
          string,
          unknown
        >;

      if (
        String(
          transaction['status'],
        ) !==
        'success'
      ) {
        res.status(400).json({
          error:
            'Only successful transactions can be reversed.',
        });
        return;
      }

      const adminId =
        req.session.adminId!;

      const adminEmail =
        await getAdminEmail(
          adminId,
        );

      const reference =
        makeRef('REVERSAL');

      await db.transaction(
        async (tx) => {
          const walletRes =
            await tx.execute(sql`
              SELECT
                id,
                balance
              FROM wallets
              WHERE user_id =
                ${String(
                  transaction['user_id'],
                )}
              LIMIT 1
              FOR UPDATE
            `);

          if (!walletRes.rows.length) {
            throw new Error(
              'User wallet not found.',
            );
          }

          const wallet =
            walletRes.rows[0] as Record<
              string,
              unknown
            >;

          const walletId =
            String(
              wallet['id'],
            );

          const before =
            Number(
              wallet['balance'] ??
                0,
            );

          const amount =
            Number(
              transaction[
                'amount'
              ] ??
                0,
            );

          const after =
            before + amount;

          await tx.execute(sql`
            UPDATE wallets
            SET
              balance =
                ${after.toFixed(2)},
              updated_at =
                NOW()
            WHERE id =
              ${walletId}
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
                ${String(
                  transaction[
                    'user_id'
                  ],
                )},
                ${walletId},
                'reversal',
                ${amount.toFixed(2)},
                ${before.toFixed(2)},
                ${after.toFixed(2)},
                ${reference},
                ${reason.trim()},
                ${adminId},
                NOW()
              )
          `);

          await tx.execute(sql`
            UPDATE transactions
            SET
              status =
                'reversed',
              updated_at =
                NOW()
            WHERE id =
              ${id}
          `);
        },
      );

      void auditLog({
        adminId,
        adminEmail,
        action:
          'transaction_reversed',
        targetType:
          'transaction',
        targetId:
          id,
        details: {
          reference,
          reason:
            reason.trim(),
        },
        ip:
          clientIp(req),
      });

      void financialAuditLog({
        adminId,
        adminEmail,
        action:
          'transaction_reversed',
        userId:
          String(
            transaction[
              'user_id'
            ],
          ),
        amount:
          Number(
            transaction[
              'amount'
            ] ??
              0,
          ),
        reference,
        metadata: {
          transactionId:
            id,
          reason:
            reason.trim(),
        },
        ip:
          clientIp(req),
      });

      res.json({
        ok: true,
        reference,
      });
    } catch (err) {
      if (
        err instanceof Error &&
        err.message ===
          'User wallet not found.'
      ) {
        res.status(404).json({
          error:
            err.message,
        });
        return;
      }

      logger.error(
        { err },
        'POST /transactions/:id/reverse failed',
      );

      res.status(500).json({
        error:
          'Failed to reverse transaction.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// FUNDING REQUESTS
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/funding-requests',
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

    const status =
      String(
        req.query['status'] ??
          '',
      ).trim();

    try {
      const statusClause =
        status
          ? sql`AND fr.status = ${status}`
          : sql``;

      const [
        countRes,
        rowsRes,
      ] =
        await Promise.all([
          db.execute(sql`
            SELECT COUNT(*)::int AS total
            FROM funding_requests fr
            WHERE TRUE
              ${statusClause}
          `),

          db.execute(sql`
            SELECT
              fr.*,
              u.name AS user_name,
              u.phone AS user_phone
            FROM funding_requests fr
            LEFT JOIN users u
              ON u.id = fr.user_id
            WHERE TRUE
              ${statusClause}
            ORDER BY
              fr.created_at DESC
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
        requests:
          rowsRes.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /funding-requests failed',
      );

      res.status(500).json({
        error:
          'Failed to load funding requests.',
      });
    }
  },
);

router.get(
  '/funding-requests/stats',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const r =
        await db.execute(sql`
          SELECT
            COUNT(*) FILTER (
              WHERE status =
                'pending'
            )::int AS pending,

            COUNT(*) FILTER (
              WHERE status =
                'approved'
            )::int AS approved,

            COUNT(*) FILTER (
              WHERE status =
                'rejected'
            )::int AS rejected,

            COALESCE(
              SUM(amount) FILTER (
                WHERE status =
                  'pending'
              ),
              0
            )::numeric AS pending_amount,

            COALESCE(
              SUM(amount) FILTER (
                WHERE status =
                  'approved'
              ),
              0
            )::numeric AS approved_amount,

            COALESCE(
              SUM(amount) FILTER (
                WHERE status =
                  'rejected'
              ),
              0
            )::numeric AS rejected_amount
          FROM funding_requests
        `);

      const row =
        r.rows[0] as Record<
          string,
          unknown
        >;

      res.json({
        pending:
          Number(
            row[
              'pending'
            ] ??
              0,
          ),

        approved:
          Number(
            row[
              'approved'
            ] ??
              0,
          ),

        rejected:
          Number(
            row[
              'rejected'
            ] ??
              0,
          ),

        pendingAmount:
          Number(
            row[
              'pending_amount'
            ] ??
              0,
          ),

        approvedAmount:
          Number(
            row[
              'approved_amount'
            ] ??
              0,
          ),

        rejectedAmount:
          Number(
            row[
              'rejected_amount'
            ] ??
              0,
          ),
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /funding-requests/stats failed',
      );

      res.status(500).json({
        error:
          'Failed to load funding request stats.',
      });
    }
  },
);

router.post(
  '/funding-requests/:id/approve',
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
      reason,
    } =
      req.body as {
        reason?: string;
      };

    try {
      const result =
        await db.transaction(
          async (tx) => {
            const requestRes =
              await tx.execute(sql`
                SELECT
                  id,
                  user_id,
                  amount,
                  status,
                  reference
                FROM funding_requests
                WHERE id =
                  ${id}
                LIMIT 1
                FOR UPDATE
              `);

            if (
              !requestRes.rows.length
            ) {
              throw new Error(
                'Funding request not found.',
              );
            }

            const request =
              requestRes.rows[0] as Record<
                string,
                unknown
              >;

            if (
              String(
                request[
                  'status'
                ],
              ) !==
              'pending'
            ) {
              throw new Error(
                'Funding request is no longer pending.',
              );
            }

            const userId =
              String(
                request[
                  'user_id'
                ],
              );

            const amount =
              Number(
                request[
                  'amount'
                ] ??
                  0,
              );

            const walletRes =
              await tx.execute(sql`
                SELECT
                  id,
                  balance
                FROM wallets
                WHERE user_id =
                  ${userId}
                LIMIT 1
                FOR UPDATE
              `);

            if (
              !walletRes.rows.length
            ) {
              throw new Error(
                'User wallet not found.',
              );
            }

            const wallet =
              walletRes.rows[0] as Record<
                string,
                unknown
              >;

            const walletId =
              String(
                wallet['id'],
              );

            const before =
              Number(
                wallet[
                  'balance'
                ] ??
                  0,
              );

            const after =
              before + amount;

            const reference =
              String(
                request[
                  'reference'
                ] ??
                  makeRef(
                    'FUNDING',
                  ),
              );

            await tx.execute(sql`
              UPDATE wallets
              SET
                balance =
                  ${after.toFixed(2)},
                updated_at =
                  NOW()
              WHERE id =
                ${walletId}
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
                  ${userId},
                  ${walletId},
                  'credit',
                  ${amount.toFixed(2)},
                  ${before.toFixed(2)},
                  ${after.toFixed(2)},
                  ${reference},
                  ${
                    reason?.trim() ||
                    'Funding request approved by super admin'
                  },
                  ${req.session.adminId!},
                  NOW()
                )
            `);

            await tx.execute(sql`
              UPDATE funding_requests
              SET
                status =
                  'approved',
                reason =
                  COALESCE(
                    ${reason?.trim() || null},
                    reason
                  ),
                reviewed_at =
                  NOW()
              WHERE id =
                ${id}
            `);

            return {
              userId,
              amount,
              walletId,
              reference,
              balanceBefore:
                before,
              balanceAfter:
                after,
            };
          },
        );

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
          'funding_request_approved',
        targetType:
          'funding_request',
        targetId:
          id,
        details: {
          ...result,
          reason:
            reason?.trim() ??
            null,
        },
        ip:
          clientIp(req),
      });

      void financialAuditLog({
        adminId,
        adminEmail,
        action:
          'funding_request_approved',
        userId:
          result.userId,
        amount:
          result.amount,
        reference:
          result.reference,
        metadata: {
          fundingRequestId:
            id,
          balanceBefore:
            result.balanceBefore,
          balanceAfter:
            result.balanceAfter,
          reason:
            reason?.trim() ??
            null,
        },
        ip:
          clientIp(req),
      });

      res.json({
        ok: true,
        ...result,
      });
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : '';

      if (
        message ===
        'Funding request not found.'
      ) {
        res.status(404).json({
          error:
            message,
        });
        return;
      }

      if (
        message ===
        'Funding request is no longer pending.'
      ) {
        res.status(409).json({
          error:
            message,
        });
        return;
      }

      if (
        message ===
        'User wallet not found.'
      ) {
        res.status(404).json({
          error:
            message,
        });
        return;
      }

      logger.error(
        { err },
        'POST /funding-requests/:id/approve failed',
      );

      res.status(500).json({
        error:
          'Failed to approve funding request.',
      });
    }
  },
);

router.post(
  '/funding-requests/:id/reject',
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
      reason,
    } =
      req.body as {
        reason?: string;
      };

    if (
      !reason ||
      reason.trim().length < 10
    ) {
      res.status(400).json({
        error:
          'A reason of at least 10 characters is required.',
      });
      return;
    }

    try {
      const r =
        await db.execute(sql`
          UPDATE funding_requests
          SET
            status =
              'rejected',
            reason =
              ${reason.trim()},
            reviewed_at =
              NOW()
          WHERE id =
            ${id}
            AND status =
              'pending'
          RETURNING
            id,
            user_id,
            amount,
            reference
        `);

      if (!r.rows.length) {
        res.status(404).json({
          error:
            'Funding request not found or is no longer pending.',
        });
        return;
      }

      const row =
        r.rows[0] as Record<
          string,
          unknown
        >;

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
          'funding_request_rejected',
        targetType:
          'funding_request',
        targetId:
          id,
        details: {
          reason:
            reason.trim(),
        },
        ip:
          clientIp(req),
      });

      res.json({
        ok: true,
        request:
          row,
      });
    } catch (err) {
      logger.error(
        { err },
        'POST /funding-requests/:id/reject failed',
      );

      res.status(500).json({
        error:
          'Failed to reject funding request.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// PRICING RULES
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/pricing-rules',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const r =
        await db.execute(sql`
          SELECT
            id,
            service_type,
            network,
            plan_id,
            plan_name,
            selling_price,
            cost_price,
            CASE
              WHEN cost_price > 0
              THEN (
                (
                  selling_price -
                  cost_price
                ) /
                cost_price
              ) * 100
              ELSE 0
            END AS markup_percent,
            enabled,
            created_at,
            updated_at
          FROM pricing_rules
          ORDER BY
            service_type,
            network,
            plan_name
        `);

      res.json({
        rules:
          r.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /pricing-rules failed',
      );

      res.status(500).json({
        error:
          'Failed to load pricing rules.',
      });
    }
  },
);

router.post(
  '/pricing-rules',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const {
      serviceType,
      network,
      planId,
      planName,
      sellingPrice,
      costPrice,
      enabled,
    } =
      req.body as {
        serviceType?: string;
        network?: string;
        planId?: string;
        planName?: string;
        sellingPrice?: number;
        costPrice?: number;
        enabled?: boolean;
      };

    if (
      !serviceType ||
      sellingPrice ===
        undefined ||
      costPrice ===
        undefined
    ) {
      res.status(400).json({
        error:
          'serviceType, sellingPrice and costPrice are required.',
      });
      return;
    }

    try {
      const r =
        await db.execute(sql`
          INSERT INTO pricing_rules
            (
              service_type,
              network,
              plan_id,
              plan_name,
              selling_price,
              cost_price,
              enabled,
              created_at,
              updated_at
            )
          VALUES
            (
              ${serviceType},
              ${network ?? null},
              ${planId ?? null},
              ${planName ?? null},
              ${Number(
                sellingPrice,
              ).toFixed(2)},
              ${Number(
                costPrice,
              ).toFixed(2)},
              ${enabled ?? true},
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
          'pricing_rule_created',
        targetType:
          'pricing_rule',
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
        rule:
          r.rows[0],
      });
    } catch (err) {
      logger.error(
        { err },
        'POST /pricing-rules failed',
      );

      res.status(500).json({
        error:
          'Failed to create pricing rule.',
      });
    }
  },
);

router.patch(
  '/pricing-rules/:id',
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
      serviceType,
      network,
      planId,
      planName,
      sellingPrice,
      costPrice,
      enabled,
    } =
      req.body as {
        serviceType?: string;
        network?: string;
        planId?: string;
        planName?: string;
        sellingPrice?: number;
        costPrice?: number;
        enabled?: boolean;
      };

    try {
      const r =
        await db.execute(sql`
          UPDATE pricing_rules
          SET
            service_type =
              COALESCE(
                ${serviceType ?? null},
                service_type
              ),

            network =
              COALESCE(
                ${network ?? null},
                network
              ),

            plan_id =
              COALESCE(
                ${planId ?? null},
                plan_id
              ),

            plan_name =
              COALESCE(
                ${planName ?? null},
                plan_name
              ),

            selling_price =
              COALESCE(
                ${
                  sellingPrice !==
                  undefined
                    ? Number(
                        sellingPrice,
                      ).toFixed(2)
                    : null
                },
                selling_price
              ),

            cost_price =
              COALESCE(
                ${
                  costPrice !==
                  undefined
                    ? Number(
                        costPrice,
                      ).toFixed(2)
                    : null
                },
                cost_price
              ),

            enabled =
              COALESCE(
                ${enabled ?? null},
                enabled
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
            'Pricing rule not found.',
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
          'pricing_rule_updated',
        targetType:
          'pricing_rule',
        targetId:
          id,
        ip:
          clientIp(req),
      });

      res.json({
        ok: true,
        rule:
          r.rows[0],
      });
    } catch (err) {
      logger.error(
        { err },
        'PATCH /pricing-rules/:id failed',
      );

      res.status(500).json({
        error:
          'Failed to update pricing rule.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// API CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/api-config',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      const r =
        await db.execute(sql`
          SELECT
            id,
            key,
            label,
            provider,
            enabled,
            base_url,
            updated_at
          FROM api_configs
          ORDER BY
            provider,
            label
        `);

      res.json({
        configs:
          r.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /api-config failed',
      );

      res.status(500).json({
        error:
          'Failed to load API configuration.',
      });
    }
  },
);

router.patch(
  '/api-config/:id',
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
      enabled,
      baseUrl,
    } =
      req.body as {
        enabled?: boolean;
        baseUrl?: string;
      };

    try {
      const r =
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

            updated_at =
              NOW()

          WHERE id =
            ${id}

          RETURNING
            id,
            key,
            label,
            provider,
            enabled,
            base_url,
            updated_at
        `);

      if (!r.rows.length) {
        res.status(404).json({
          error:
            'API configuration not found.',
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
          'api_config_updated',
        targetType:
          'api_config',
        targetId:
          id,
        ip:
          clientIp(req),
      });

      res.json({
        ok: true,
        config:
          r.rows[0],
      });
    } catch (err) {
      logger.error(
        { err },
        'PATCH /api-config/:id failed',
      );

      res.status(500).json({
        error:
          'Failed to update API configuration.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// STAFF / ACTIVITY
// ═════════════════════════════════════════════════════════════════════════════

router.get(
  '/staff-activity',
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
            FROM staff_activity
          `),

          db.execute(sql`
            SELECT *
            FROM staff_activity
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
        activity:
          rowsRes.rows,
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /staff-activity failed',
      );

      res.status(500).json({
        error:
          'Failed to load staff activity.',
      });
    }
  },
);

// ═════════════════════════════════════════════════════════════════════════════
// EXPORT
// ═════════════════════════════════════════════════════════════════════════════

export default router;
