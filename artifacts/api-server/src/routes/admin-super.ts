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
import { hashPin } from '../lib/auth.js';
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
  const r = await db.execute(sql`SELECT email FROM admin_accounts WHERE id = ${adminId} LIMIT 1`);
  return String((r.rows[0] as Record<string, unknown>)?.['email'] ?? 'unknown');
}

async function auditLog(opts: {
  adminId: string; adminEmail: string; action: string;
  targetType?: string; targetId?: string; targetLabel?: string;
  details?: Record<string, unknown>; ip?: string;
}): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO admin_audit_logs (admin_id, admin_email, action, target_type, target_id, target_label, details, ip)
      VALUES (${opts.adminId}, ${opts.adminEmail}, ${opts.action},
              ${opts.targetType ?? null}, ${opts.targetId ?? null}, ${opts.targetLabel ?? null},
              ${opts.details ? JSON.stringify(opts.details) : null}, ${opts.ip ?? null})
    `);
  } catch (err) {
    logger.error({ err }, 'audit log insert failed');
  }
}

function makeRef(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function randomPin(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ═════════════════════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /admin/users/:id — full user profile ──────────────────────────────────

router.get('/users/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  try {
    const r = await db.execute(sql`
      SELECT
        u.id, u.name, u.first_name, u.last_name, u.email, u.phone,
        u.account_number, u.bank_name, u.referral_code,
        u.kyc_status, u.status, u.created_at, u.updated_at,
        COALESCE(w.balance, '0')::numeric AS wallet_balance,
        COUNT(DISTINCT t.id)::int AS transaction_count,
        COALESCE(SUM(t.amount) FILTER (WHERE t.status='success' AND t.type!='wallet_fund'), 0)::numeric AS total_spent,
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
      lastTransactionAt: row['last_transaction_at'] ? String(row['last_transaction_at']) : null,
      createdAt: String(row['created_at']),
      updatedAt: String(row['updated_at']),
    });
  } catch (err) {
    logger.error({ err }, 'GET /users/:id failed');
    res.status(500).json({ error: 'Failed to load user.' });
  }
});

// ── GET /admin/users/:id/wallet — wallet summary ──────────────────────────────

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
          COALESCE(SUM(amount) FILTER (WHERE type='credit'), 0)::numeric AS total_credited,
          COALESCE(SUM(amount) FILTER (WHERE type='debit'), 0)::numeric AS total_debited,
          COALESCE(SUM(amount) FILTER (WHERE type='reversal'), 0)::numeric AS total_reversed,
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

// ── GET /admin/users/:id/wallet/ledger — paginated ledger ────────────────────

router.get('/users/:id/wallet/ledger', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const page = Math.max(1, Number(req.query['page'] ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 25)));
  const offset = (page - 1) * limit;

  try {
    const [countRes, rowRes] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM wallet_ledger
        WHERE user_id = ${id}
      `),
      db.execute(sql`
        SELECT wl.*, aa.name AS performed_by_name
        FROM wallet_ledger wl
        LEFT JOIN admin_accounts aa ON aa.id = wl.performed_by
        WHERE wl.user_id = ${id}
        ORDER BY wl.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
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
    logger.error({ err }, 'GET /users/:id/wallet/ledger failed');
    res.status(500).json({ error: 'Failed to load wallet ledger.' });
  }
});

// ── GET /admin/users — paginated users ────────────────────────────────────────

router.get('/users', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query['page'] ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 25)));
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
      status ? sql`u.status = ${status}` : sql`TRUE`,
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
        LEFT JOIN wallets w ON w.user_id = u.id
        WHERE ${where}
        ORDER BY u.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
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
          createdAt: r['created_at'] ? String(r['created_at']) : null,
          updatedAt: r['updated_at'] ? String(r['updated_at']) : null,
        };
      }),
    });
  } catch (err) {
    logger.error({ err }, 'GET /users failed');
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

// ── PATCH /admin/users/:id/status ────────────────────────────────────────────

router.patch('/users/:id/status', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { status } = req.body as { status?: string };

  if (!status || !['active', 'inactive', 'suspended', 'blocked'].includes(status)) {
    res.status(400).json({ error: 'Invalid status.' });
    return;
  }

  try {
    const r = await db.execute(sql`
      UPDATE users
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name, status
    `);

    if (!r.rows.length) {
      res.status(404).json({ error: 'User not found.' });
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

    res.json({ ok: true, user: r.rows[0] });
  } catch (err) {
    logger.error({ err }, 'PATCH /users/:id/status failed');
    res.status(500).json({ error: 'Failed to update user status.' });
  }
});

// ── POST /admin/users/:id/reset-pin ──────────────────────────────────────────

router.post('/users/:id/reset-pin', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const pin = randomPin();

  try {
    const hashed = await hashPin(pin);

    const r = await db.execute(sql`
      UPDATE users
      SET transaction_pin = ${hashed}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name, phone
    `);

    if (!r.rows.length) {
      res.status(404).json({ error: 'User not found.' });
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
      details: { phone: String((r.rows[0] as Record<string, unknown>)['phone'] ?? '') },
      ip: clientIp(req),
    });

    res.json({
      ok: true,
      temporaryPin: pin,
      message: 'Transaction PIN reset successfully.',
    });
  } catch (err) {
    logger.error({ err }, 'POST /users/:id/reset-pin failed');
    res.status(500).json({ error: 'Failed to reset transaction PIN.' });
  }
});

// ── POST /admin/users/:id/wallet/credit ──────────────────────────────────────

router.post('/users/:id/wallet/credit', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const amount = Number(req.body?.amount);
  const reason = String(req.body?.reason ?? '').trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'A valid positive amount is required.' });
    return;
  }

  if (!reason) {
    res.status(400).json({ error: 'Reason is required.' });
    return;
  }

  try {
    const adminId = req.session.adminId!;
    const adminEmail = await getAdminEmail(adminId);

    await db.transaction(async (tx) => {
      await tx.execute(sql`
        INSERT INTO wallets (user_id, balance, created_at, updated_at)
        VALUES (${id}, 0, NOW(), NOW())
        ON CONFLICT (user_id) DO NOTHING
      `);

      await tx.execute(sql`
        UPDATE wallets
        SET balance = balance + ${amount}, updated_at = NOW()
        WHERE user_id = ${id}
      `);

      await tx.execute(sql`
        INSERT INTO wallet_ledger
          (user_id, type, amount, description, reference, performed_by, created_at)
        VALUES
          (${id}, 'credit', ${amount}, ${reason}, ${makeRef('ADMINCR')}, ${adminId}, NOW())
      `);
    });

    void auditLog({
      adminId,
      adminEmail,
      action: 'wallet_manual_credit',
      targetType: 'user',
      targetId: id,
      details: { amount, reason },
      ip: clientIp(req),
    });

    res.json({ ok: true, amount });
  } catch (err) {
    logger.error({ err }, 'POST /users/:id/wallet/credit failed');
    res.status(500).json({ error: 'Failed to credit wallet.' });
  }
});

// ── POST /admin/users/:id/wallet/debit ───────────────────────────────────────

router.post('/users/:id/wallet/debit', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const amount = Number(req.body?.amount);
  const reason = String(req.body?.reason ?? '').trim();

  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'A valid positive amount is required.' });
    return;
  }

  if (!reason) {
    res.status(400).json({ error: 'Reason is required.' });
    return;
  }

  try {
    const adminId = req.session.adminId!;
    const adminEmail = await getAdminEmail(adminId);

    await db.transaction(async (tx) => {
      const wallet = await tx.execute(sql`
        SELECT balance
        FROM wallets
        WHERE user_id = ${id}
        FOR UPDATE
      `);

      if (!wallet.rows.length) {
        throw new Error('Wallet not found.');
      }

      const balance = Number(
        (wallet.rows[0] as Record<string, unknown>)['balance'] ?? 0,
      );

      if (balance < amount) {
        throw new Error('Insufficient wallet balance.');
      }

      await tx.execute(sql`
        UPDATE wallets
        SET balance = balance - ${amount}, updated_at = NOW()
        WHERE user_id = ${id}
      `);

      await tx.execute(sql`
        INSERT INTO wallet_ledger
          (user_id, type, amount, description, reference, performed_by, created_at)
        VALUES
          (${id}, 'debit', ${amount}, ${reason}, ${makeRef('ADMINDR')}, ${adminId}, NOW())
      `);
    });

    void auditLog({
      adminId,
      adminEmail,
      action: 'wallet_manual_debit',
      targetType: 'user',
      targetId: id,
      details: { amount, reason },
      ip: clientIp(req),
    });

    res.json({ ok: true, amount });
  } catch (err) {
    logger.error({ err }, 'POST /users/:id/wallet/debit failed');
    const message = err instanceof Error ? err.message : 'Failed to debit wallet.';
    res.status(message === 'Insufficient wallet balance.' ? 400 : 500).json({ error: message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ═════════════════════════════════════════════════════════════════════════════

router.get('/dashboard', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [
      usersRes,
      activeUsersRes,
      walletRes,
      transactionsRes,
      successfulRes,
      pendingRes,
    ] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int AS count FROM users`),
      db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM users
        WHERE status = 'active'
      `),
      db.execute(sql`
        SELECT COALESCE(SUM(balance), 0)::numeric AS balance
        FROM wallets
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM transactions
      `),
      db.execute(sql`
        SELECT
          COUNT(*)::int AS count,
          COALESCE(SUM(amount), 0)::numeric AS amount
        FROM transactions
        WHERE status = 'success'
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM transactions
        WHERE status = 'pending'
      `),
    ]);

    res.json({
      users: Number((usersRes.rows[0] as Record<string, unknown>)?.['count'] ?? 0),
      activeUsers: Number((activeUsersRes.rows[0] as Record<string, unknown>)?.['count'] ?? 0),
      walletBalance: Number((walletRes.rows[0] as Record<string, unknown>)?.['balance'] ?? 0),
      transactions: Number((transactionsRes.rows[0] as Record<string, unknown>)?.['count'] ?? 0),
      successfulTransactions: Number((successfulRes.rows[0] as Record<string, unknown>)?.['count'] ?? 0),
      successfulAmount: Number((successfulRes.rows[0] as Record<string, unknown>)?.['amount'] ?? 0),
      pendingTransactions: Number((pendingRes.rows[0] as Record<string, unknown>)?.['count'] ?? 0),
    });
  } catch (err) {
    logger.error({ err }, 'GET /dashboard failed');
    res.status(500).json({ error: 'Failed to load dashboard.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD EXTENDED
// ═════════════════════════════════════════════════════════════════════════════

router.get('/dashboard/extended', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [daily, weekly, monthly, profit, activeToday, newWeek, activity] = await Promise.all([
      db.execute(sql`
        SELECT DATE(created_at) AS day,
               COUNT(*)::int AS count,
               COALESCE(SUM(amount), 0)::numeric AS revenue
        FROM transactions
        WHERE created_at >= CURRENT_DATE - INTERVAL '13 days'
          AND status = 'success'
        GROUP BY DATE(created_at)
        ORDER BY day
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count,
               COALESCE(SUM(amount), 0)::numeric AS revenue
        FROM transactions
        WHERE created_at >= NOW() - INTERVAL '7 days'
          AND status = 'success'
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count,
               COALESCE(SUM(amount), 0)::numeric AS revenue
        FROM transactions
        WHERE created_at >= NOW() - INTERVAL '30 days'
          AND status = 'success'
      `),
      db.execute(sql`
        SELECT
          COALESCE(SUM(t.amount), 0)::numeric AS revenue,
          COALESCE(SUM(t.cost_price), 0)::numeric AS cost,
          COALESCE(SUM(t.amount - COALESCE(t.cost_price, 0)), 0)::numeric AS profit
        FROM transactions t
        WHERE t.created_at >= NOW() - INTERVAL '30 days'
          AND t.status = 'success'
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM users
        WHERE updated_at >= CURRENT_DATE
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM users
        WHERE created_at >= NOW() - INTERVAL '7 days'
      `),
      db.execute(sql`
        SELECT id, user_id, type, amount, status, reference, created_at
        FROM transactions
        ORDER BY created_at DESC
        LIMIT 20
      `),
    ]);

    res.json({
      daily: daily.rows,
      weekly: weekly.rows[0] ?? {},
      monthly: monthly.rows[0] ?? {},
      profit: profit.rows[0] ?? {},
      activeToday: Number((activeToday.rows[0] as Record<string, unknown>)?.['count'] ?? 0),
      newUsersThisWeek: Number((newWeek.rows[0] as Record<string, unknown>)?.['count'] ?? 0),
      activity: activity.rows,
    });
  } catch (err) {
    logger.error({ err }, 'GET /dashboard/extended failed');
    res.status(500).json({ error: 'Failed to load extended dashboard.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/transactions', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query['page'] ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 25)));
  const offset = (page - 1) * limit;
  const status = String(req.query['status'] ?? '').trim();
  const type = String(req.query['type'] ?? '').trim();
  const search = String(req.query['search'] ?? '').trim();

  try {
    const where = sql`
      ${status ? sql`AND t.status = ${status}` : sql``}
      ${type ? sql`AND t.type = ${type}` : sql``}
      ${search ? sql`
        AND (
          t.reference ILIKE ${'%' + search + '%'}
          OR u.name ILIKE ${'%' + search + '%'}
          OR u.phone ILIKE ${'%' + search + '%'}
        )
      ` : sql``}
    `;

    const [countRes, rowsRes] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM transactions t
        LEFT JOIN users u ON u.id = t.user_id
        WHERE TRUE ${where}
      `),
      db.execute(sql`
        SELECT
          t.*,
          u.name AS user_name,
          u.phone AS user_phone,
          u.email AS user_email
        FROM transactions t
        LEFT JOIN users u ON u.id = t.user_id
        WHERE TRUE ${where}
        ORDER BY t.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
    ]);

    const total = Number((countRes.rows[0] as Record<string, unknown>)?.['total'] ?? 0);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      transactions: rowsRes.rows,
    });
  } catch (err) {
    logger.error({ err }, 'GET /transactions failed');
    res.status(500).json({ error: 'Failed to load transactions.' });
  }
});

router.get('/transactions/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  try {
    const r = await db.execute(sql`
      SELECT
        t.*,
        u.name AS user_name,
        u.phone AS user_phone,
        u.email AS user_email
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      WHERE t.id = ${id}
      LIMIT 1
    `);

    if (!r.rows.length) {
      res.status(404).json({ error: 'Transaction not found.' });
      return;
    }

    res.json(r.rows[0]);
  } catch (err) {
    logger.error({ err }, 'GET /transactions/:id failed');
    res.status(500).json({ error: 'Failed to load transaction.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SYSTEM SETTINGS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/settings', async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await db.execute(sql`
      SELECT key, value, updated_by, updated_at
      FROM system_settings
      ORDER BY key
    `);

    res.json({
      settings: r.rows.map((row) => {
        const x = row as Record<string, unknown>;
        return {
          key: String(x['key']),
          value: String(x['value'] ?? ''),
          updatedBy: x['updated_by'] ? String(x['updated_by']) : null,
          updatedAt: x['updated_at'] ? String(x['updated_at']) : null,
        };
      }),
    });
  } catch (err) {
    logger.error({ err }, 'GET /settings failed');
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

router.patch('/settings/:key', async (req: Request, res: Response): Promise<void> => {
  const { key } = req.params as { key: string };
  const { value } = req.body as { value?: string };

  if (!key?.trim()) {
    res.status(400).json({ error: 'key is required.' });
    return;
  }

  if (value === undefined) {
    res.status(400).json({ error: 'value is required.' });
    return;
  }

  try {
    await db.execute(sql`
      INSERT INTO system_settings (key, value, updated_by, updated_at)
      VALUES (${key.trim()}, ${value}, ${req.session.adminId!}, NOW())
      ON CONFLICT (key)
      DO UPDATE SET
        value = EXCLUDED.value,
        updated_by = EXCLUDED.updated_by,
        updated_at = NOW()
    `);

    const adminEmail = await getAdminEmail(req.session.adminId!);

    void auditLog({
      adminId: req.session.adminId!,
      adminEmail,
      action: 'system_setting_updated',
      targetType: 'setting',
      targetId: key.trim(),
      details: { key: key.trim(), value },
      ip: clientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'PATCH /settings failed');
    res.status(500).json({ error: 'Failed to update setting.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// API INTEGRATIONS
// SME API is the VTU/data/airtime provider.
// Monnify remains the payment gateway.
// Secrets are always masked.
// ═════════════════════════════════════════════════════════════════════════════

router.get('/integrations', (_req: Request, res: Response): void => {
  function mask(val: string | undefined): string {
    if (!val || val.length < 8) return val ? '••••••••' : 'Not configured';
    return '••••••••' + val.slice(-4);
  }

  res.json({
    integrations: [
      {
        key: 'monnify',
        label: 'Monnify (Payment Gateway)',
        status: process.env['MONNIFY_API_KEY'] ? 'configured' : 'not_configured',
        fields: [
          {
            label: 'API Key',
            value: mask(process.env['MONNIFY_API_KEY']),
            sensitive: true,
          },
          {
            label: 'Contract Code',
            value: mask(process.env['MONNIFY_CONTRACT_CODE']),
            sensitive: true,
          },
          {
            label: 'Base URL',
            value: process.env['MONNIFY_BASE_URL'] ?? 'https://sandbox.monnify.com',
            sensitive: false,
          },
        ],
      },
      {
        key: 'smeapi',
        label: 'SME API (VTU Provider)',
        status: process.env['SME_API_KEY'] ? 'configured' : 'not_configured',
        fields: [
          {
            label: 'API Key',
            value: mask(process.env['SME_API_KEY']),
            sensitive: true,
          },
          {
            label: 'Endpoint',
            value: 'https://smeapi.com.ng',
            sensitive: false,
          },
        ],
      },
    ],
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// API MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

router.get('/api-management/configs', async (_req: Request, res: Response): Promise<void> => {
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

    const map: Record<string, string> = {};

    for (const row of r.rows) {
      const x = row as Record<string, unknown>;
      map[String(x['key'])] = String(x['value'] ?? '');
    }

    const smeKey =
      map['sme_api_key'] ||
      (process.env['SME_API_KEY'] ? '••••' : '');

    const mnKey =
      map['monnify_api_key'] ||
      (process.env['MONNIFY_API_KEY'] ? '••••' : '');

    const mnSec =
      map['monnify_secret_key'] ||
      (process.env['MONNIFY_SECRET_KEY'] ? '••••' : '');

    const mnCon =
      map['monnify_contract_code'] ||
      process.env['MONNIFY_CONTRACT_CODE'] ||
      '';

    const mask = (v: string) =>
      v && v !== '••••' && v.length > 4
        ? v.slice(0, 4) + '••••'
        : v;

    res.json({
      apis: [
        {
          key: 'smeapi',
          label: 'SME API',
          enabled: map['api_smeapi_enabled'] !== 'false',
          status: process.env['SME_API_KEY'] ? 'configured' : 'not_configured',
          lastChecked: null,
          fields: [
            {
              name: 'api_key',
              label: 'API Key',
              value: mask(smeKey),
              sensitive: true,
            },
          ],
        },
        {
          key: 'monnify',
          label: 'Monnify',
          enabled: map['api_monnify_enabled'] !== 'false',
          status: process.env['MONNIFY_API_KEY'] ? 'configured' : 'not_configured',
          lastChecked: null,
          fields: [
            {
              name: 'api_key',
              label: 'API Key',
              value: mask(mnKey),
              sensitive: true,
            },
            {
              name: 'secret_key',
              label: 'Secret Key',
              value: mask(mnSec),
              sensitive: true,
            },
            {
              name: 'contract_code',
              label: 'Contract Code',
              value: mnCon,
              sensitive: false,
            },
          ],
        },
      ],
    });
  } catch (err) {
    logger.error({ err }, 'GET /api-management/configs failed');
    res.status(500).json({ error: 'Failed to load API configs.' });
  }
});

router.patch('/api-management/configs/:key', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  const adminEmail = await getAdminEmail(adminId);
  const { key } = req.params as { key: string };
  const {
    enabled,
    fields,
  } = req.body as {
    enabled?: boolean;
    fields?: Record<string, string>;
  };

  if (!['smeapi', 'monnify'].includes(key)) {
    res.status(400).json({ error: 'Invalid API key.' });
    return;
  }

  try {
    if (enabled !== undefined) {
      await db.execute(sql`
        INSERT INTO system_settings (key, value, updated_by)
        VALUES (${'api_' + key + '_enabled'}, ${String(enabled)}, ${adminId})
        ON CONFLICT (key)
        DO UPDATE SET
          value = EXCLUDED.value,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
      `);
    }

    const fieldKeyMap: Record<string, string> = {
      api_key: key === 'smeapi' ? 'sme_api_key' : 'monnify_api_key',
      secret_key: 'monnify_secret_key',
      contract_code: 'monnify_contract_code',
    };

    if (fields) {
      for (const [fname, fval] of Object.entries(fields)) {
        const skey = fieldKeyMap[fname];

        if (!skey || !fval) {
          continue;
        }

        await db.execute(sql`
          INSERT INTO system_settings (key, value, updated_by)
          VALUES (${skey}, ${fval}, ${adminId})
          ON CONFLICT (key)
          DO UPDATE SET
            value = EXCLUDED.value,
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
        `);
      }
    }

    void auditLog({
      adminId,
      adminEmail,
      action: `update_api_config_${key}`,
      details: {
        enabled,
        fields: fields ? Object.keys(fields) : [],
      },
      ip: clientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'PATCH /api-management/configs/:key failed');
    res.status(500).json({ error: 'Failed to update API config.' });
  }
});

router.get('/api-management/status', async (_req: Request, res: Response): Promise<void> => {
  const checks = [
    {
      key: 'smeapi',
      label: 'SME API',
      url: 'https://smeapi.com.ng/api/data/plans/?network=1',
      requiresToken: true,
    },
    {
      key: 'monnify',
      label: 'Monnify',
      url: 'https://api.monnify.com/api/v1/sdk/contracts',
      requiresToken: false,
    },
  ];

  const results = await Promise.all(
    checks.map(async (c) => {
      const start = Date.now();

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 5000);

        const headers: Record<string, string> = {
          Accept: 'application/json',
        };

        if (c.key === 'smeapi') {
          const key = String(process.env['SME_API_KEY'] || '').trim();

          if (!key) {
            clearTimeout(timer);
            return {
              key: c.key,
              label: c.label,
              status: 'not_configured',
              latency: null,
              checkedAt: new Date().toISOString(),
            };
          }

          headers.Authorization = `Token ${key}`;
        }

        await fetch(c.url, {
          signal: controller.signal,
          method: 'GET',
          headers,
        });

        clearTimeout(timer);

        return {
          key: c.key,
          label: c.label,
          status: 'online',
          latency: Date.now() - start,
          checkedAt: new Date().toISOString(),
        };
      } catch {
        return {
          key: c.key,
          label: c.label,
          status: 'offline',
          latency: null,
          checkedAt: new Date().toISOString(),
        };
      }
    }),
  );

  res.json({ results });
});

// ═════════════════════════════════════════════════════════════════════════════
// API MANAGEMENT ERROR LOGS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/api-management/logs/errors', async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(200, Math.max(1, Number(req.query['limit'] ?? 50)));

  try {
    const r = await db.execute(sql`
      SELECT
        id,
        level,
        message,
        metadata,
        created_at
      FROM application_logs
      WHERE level IN ('error', 'fatal')
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    res.json({ logs: r.rows });
  } catch (err) {
    logger.error({ err }, 'GET /api-management/logs/errors failed');
    res.status(500).json({ error: 'Failed to load API error logs.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// PRICING MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

async function pricingAuditLog(opts: {
  adminId: string;
  adminEmail: string;
  action: string;
  pricingRuleId?: string;
  serviceType?: string;
  planName?: string;
  provider?: string;
  oldSellingPrice?: number;
  newSellingPrice?: number;
  oldCostPrice?: number;
  newCostPrice?: number;
  oldEnabled?: boolean;
  newEnabled?: boolean;
  ip?: string;
}): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO pricing_audit_logs (
        admin_id,
        admin_email,
        action,
        pricing_rule_id,
        service_type,
        plan_name,
        provider,
        old_selling_price,
        new_selling_price,
        old_cost_price,
        new_cost_price,
        old_enabled,
        new_enabled,
        ip,
        created_at
      )
      VALUES (
        ${opts.adminId},
        ${opts.adminEmail},
        ${opts.action},
        ${opts.pricingRuleId ?? null},
        ${opts.serviceType ?? null},
        ${opts.planName ?? null},
        ${opts.provider ?? null},
        ${opts.oldSellingPrice ?? null},
        ${opts.newSellingPrice ?? null},
        ${opts.oldCostPrice ?? null},
        ${opts.newCostPrice ?? null},
        ${opts.oldEnabled ?? null},
        ${opts.newEnabled ?? null},
        ${opts.ip ?? null},
        NOW()
      )
    `);
  } catch (err) {
    logger.error({ err }, 'pricing audit log insert failed');
  }
}

router.get('/pricing', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query['page'] ?? 1));
  const limit = Math.min(200, Math.max(1, Number(req.query['limit'] ?? 50)));
  const offset = (page - 1) * limit;
  const serviceType = String(req.query['serviceType'] ?? '').trim();
  const provider = String(req.query['provider'] ?? '').trim();
  const search = String(req.query['search'] ?? '').trim();

  try {
    const where = sql`
      ${serviceType ? sql`AND service_type = ${serviceType}` : sql``}
      ${provider ? sql`AND provider = ${provider}` : sql``}
      ${search ? sql`AND plan_name ILIKE ${'%' + search + '%'}` : sql``}
    `;

    const [countRes, rowsRes] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM pricing_rules
        WHERE TRUE ${where}
      `),
      db.execute(sql`
        SELECT *
        FROM pricing_rules
        WHERE TRUE ${where}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
    ]);

    const total = Number((countRes.rows[0] as Record<string, unknown>)?.['total'] ?? 0);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      rules: rowsRes.rows,
    });
  } catch (err) {
    logger.error({ err }, 'GET /pricing failed');
    res.status(500).json({ error: 'Failed to load pricing rules.' });
  }
});

router.post('/pricing', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  const adminEmail = await getAdminEmail(adminId);

  const {
    serviceType,
    planName,
    provider,
    sellingPrice,
    costPrice,
    enabled,
  } = req.body as {
    serviceType?: string;
    planName?: string;
    provider?: string;
    sellingPrice?: number;
    costPrice?: number;
    enabled?: boolean;
  };

  if (!serviceType || !planName || !provider) {
    res.status(400).json({
      error: 'serviceType, planName and provider are required.',
    });
    return;
  }

  const selling = Number(sellingPrice);
  const cost = Number(costPrice ?? 0);

  if (!Number.isFinite(selling) || selling < 0) {
    res.status(400).json({ error: 'Invalid selling price.' });
    return;
  }

  if (!Number.isFinite(cost) || cost < 0) {
    res.status(400).json({ error: 'Invalid cost price.' });
    return;
  }

  try {
    const r = await db.execute(sql`
      INSERT INTO pricing_rules (
        service_type,
        plan_name,
        provider,
        selling_price,
        cost_price,
        enabled,
        created_at,
        updated_at
      )
      VALUES (
        ${serviceType},
        ${planName},
        ${provider},
        ${selling},
        ${cost},
        ${enabled !== false},
        NOW(),
        NOW()
      )
      RETURNING *
    `);

    const row = r.rows[0] as Record<string, unknown>;
    const id = String(row['id']);

    void auditLog({
      adminId,
      adminEmail,
      action: 'create_pricing_rule',
      targetType: 'pricing_rule',
      targetId: id,
      details: {
        serviceType,
        planName,
        provider,
        sellingPrice: selling,
        costPrice: cost,
        enabled: enabled !== false,
      },
      ip: clientIp(req),
    });

    void pricingAuditLog({
      adminId,
      adminEmail,
      action: 'create',
      pricingRuleId: id,
      serviceType,
      planName,
      provider,
      newSellingPrice: selling,
      newCostPrice: cost,
      newEnabled: enabled !== false,
      ip: req.ip,
    });

    res.status(201).json({ ok: true, rule: row });
  } catch (err) {
    logger.error({ err }, 'POST /pricing failed');
    res.status(500).json({ error: 'Failed to create pricing rule.' });
  }
});

router.patch('/pricing/:id', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  const adminEmail = await getAdminEmail(adminId);
  const { id } = req.params as { id: string };

  const {
    serviceType,
    planName,
    provider,
    sellingPrice,
    costPrice,
    enabled,
  } = req.body as {
    serviceType?: string;
    planName?: string;
    provider?: string;
    sellingPrice?: number;
    costPrice?: number;
    enabled?: boolean;
  };

  try {
    const oldRes = await db.execute(sql`
      SELECT *
      FROM pricing_rules
      WHERE id = ${id}
      LIMIT 1
    `);

    if (!oldRes.rows.length) {
      res.status(404).json({ error: 'Pricing rule not found.' });
      return;
    }

    const old = oldRes.rows[0] as Record<string, unknown>;

    const nextSelling =
      sellingPrice !== undefined
        ? Number(sellingPrice)
        : Number(old['selling_price']);

    const nextCost =
      costPrice !== undefined
        ? Number(costPrice)
        : Number(old['cost_price']);

    if (!Number.isFinite(nextSelling) || nextSelling < 0) {
      res.status(400).json({ error: 'Invalid selling price.' });
      return;
    }

    if (!Number.isFinite(nextCost) || nextCost < 0) {
      res.status(400).json({ error: 'Invalid cost price.' });
      return;
    }

    const r = await db.execute(sql`
      UPDATE pricing_rules
      SET
        service_type = COALESCE(${serviceType ?? null}, service_type),
        plan_name = COALESCE(${planName ?? null}, plan_name),
        provider = COALESCE(${provider ?? null}, provider),
        selling_price = ${nextSelling},
        cost_price = ${nextCost},
        enabled = COALESCE(${enabled ?? null}, enabled),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `);

    const updated = r.rows[0] as Record<string, unknown>;

    void auditLog({
      adminId,
      adminEmail,
      action: 'update_pricing_rule',
      targetType: 'pricing_rule',
      targetId: id,
      details: {
        oldSellingPrice: Number(old['selling_price']),
        newSellingPrice: nextSelling,
        oldCostPrice: Number(old['cost_price']),
        newCostPrice: nextCost,
        oldEnabled: Boolean(old['enabled']),
        newEnabled: Boolean(updated['enabled']),
      },
      ip: clientIp(req),
    });

    void pricingAuditLog({
      adminId,
      adminEmail,
      action: 'update',
      pricingRuleId: id,
      serviceType: String(updated['service_type'] ?? ''),
      planName: String(updated['plan_name'] ?? ''),
      provider: String(updated['provider'] ?? ''),
      oldSellingPrice: Number(old['selling_price']),
      newSellingPrice: nextSelling,
      oldCostPrice: Number(old['cost_price']),
      newCostPrice: nextCost,
      oldEnabled: Boolean(old['enabled']),
      newEnabled: Boolean(updated['enabled']),
      ip: req.ip,
    });

    res.json({ ok: true, rule: updated });
  } catch (err) {
    logger.error({ err }, 'PATCH /pricing/:id failed');
    res.status(500).json({ error: 'Failed to update pricing rule.' });
  }
});

router.delete('/pricing/:id', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  const adminEmail = await getAdminEmail(adminId);
  const { id } = req.params as { id: string };

  try {
    const old = (
      await db.execute<{
        selling_price: string;
        cost_price: string;
        enabled: boolean;
        service_type: string;
        plan_name: string;
        provider: string;
      }>(
        sql`
          SELECT
            selling_price,
            cost_price,
            enabled,
            service_type,
            plan_name,
            provider
          FROM pricing_rules
          WHERE id = ${id}
          LIMIT 1
        `,
      )
    ).rows[0];

    await db.execute(sql`
      DELETE FROM pricing_rules
      WHERE id = ${id}
    `);

    void auditLog({
      adminId,
      adminEmail,
      action: 'delete_pricing_rule',
      targetId: id,
      ip: clientIp(req),
    });

    if (old) {
      void pricingAuditLog({
        adminId,
        adminEmail,
        action: 'delete',
        pricingRuleId: id,
        serviceType: old.service_type,
        planName: old.plan_name,
        provider: old.provider,
        oldSellingPrice: Number(old.selling_price),
        oldCostPrice: Number(old.cost_price),
        oldEnabled: old.enabled,
        ip: req.ip,
      });
    }

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'DELETE /pricing/:id failed');
    res.status(500).json({ error: 'Failed to delete pricing rule.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// FINANCE PERMISSIONS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/finance/permissions', async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await db.execute(sql`
      SELECT *
      FROM admin_finance_permissions
      ORDER BY created_at DESC
    `);

    res.json({
      permissions: r.rows,
      available: FINANCE_PERMISSIONS,
    });
  } catch (err) {
    logger.error({ err }, 'GET /finance/permissions failed');
    res.status(500).json({ error: 'Failed to load finance permissions.' });
  }
});

router.get('/finance/permissions/catalog', (_req: Request, res: Response): void => {
  res.json({
    permissions: FINANCE_PERMISSIONS,
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN ACCOUNTS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/admins', async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await db.execute(sql`
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
      ORDER BY created_at DESC
    `);

    res.json({ admins: r.rows });
  } catch (err) {
    logger.error({ err }, 'GET /admins failed');
    res.status(500).json({ error: 'Failed to load admins.' });
  }
});

router.post('/admins', async (req: Request, res: Response): Promise<void> => {
  const {
    name,
    email,
    password,
    role,
  } = req.body as {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
  };

  if (!name || !email || !password) {
    res.status(400).json({
      error: 'Name, email and password are required.',
    });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({
      error: 'Password must be at least 8 characters.',
    });
    return;
  }

  const allowedRoles = [
    'super_admin',
    'admin',
    'finance',
    'support',
  ];

  if (!allowedRoles.includes(role ?? 'admin')) {
    res.status(400).json({ error: 'Invalid admin role.' });
    return;
  }

  try {
    const existing = await db.execute(sql`
      SELECT id
      FROM admin_accounts
      WHERE LOWER(email) = LOWER(${email})
      LIMIT 1
    `);

    if (existing.rows.length) {
      res.status(409).json({ error: 'An admin with this email already exists.' });
      return;
    }

    const hashedPassword = await hashPin(password);

    const r = await db.execute(sql`
      INSERT INTO admin_accounts (
        name,
        email,
        password,
        role,
        status,
        created_at,
        updated_at
      )
      VALUES (
        ${name.trim()},
        ${email.trim().toLowerCase()},
        ${hashedPassword},
        ${role ?? 'admin'},
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
        created_at
    `);

    const adminId = req.session.adminId!;
    const adminEmail = await getAdminEmail(adminId);

    void auditLog({
      adminId,
      adminEmail,
      action: 'admin_account_created',
      targetType: 'admin',
      targetId: String((r.rows[0] as Record<string, unknown>)['id']),
      details: {
        email: email.trim().toLowerCase(),
        role: role ?? 'admin',
      },
      ip: clientIp(req),
    });

    res.status(201).json({
      ok: true,
      admin: r.rows[0],
    });
  } catch (err) {
    logger.error({ err }, 'POST /admins failed');
    res.status(500).json({ error: 'Failed to create admin account.' });
  }
});

router.patch('/admins/:id/status', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { status } = req.body as { status?: string };

  if (!status || !['active', 'inactive', 'suspended', 'blocked'].includes(status)) {
    res.status(400).json({ error: 'Invalid status.' });
    return;
  }

  if (id === req.session.adminId) {
    res.status(400).json({
      error: 'You cannot change your own admin status.',
    });
    return;
  }

  try {
    const r = await db.execute(sql`
      UPDATE admin_accounts
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name, email, role, status
    `);

    if (!r.rows.length) {
      res.status(404).json({ error: 'Admin account not found.' });
      return;
    }

    const adminId = req.session.adminId!;
    const adminEmail = await getAdminEmail(adminId);

    void auditLog({
      adminId,
      adminEmail,
      action: 'admin_status_updated',
      targetType: 'admin',
      targetId: id,
      details: { status },
      ip: clientIp(req),
    });

    res.json({
      ok: true,
      admin: r.rows[0],
    });
  } catch (err) {
    logger.error({ err }, 'PATCH /admins/:id/status failed');
    res.status(500).json({ error: 'Failed to update admin status.' });
  }
});

router.patch('/admins/:id/role', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { role } = req.body as { role?: string };

  const allowedRoles = [
    'super_admin',
    'admin',
    'finance',
    'support',
  ];

  if (!role || !allowedRoles.includes(role)) {
    res.status(400).json({ error: 'Invalid admin role.' });
    return;
  }

  if (id === req.session.adminId && role !== 'super_admin') {
    res.status(400).json({
      error: 'You cannot remove your own super admin role.',
    });
    return;
  }

  try {
    const r = await db.execute(sql`
      UPDATE admin_accounts
      SET role = ${role}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name, email, role, status
    `);

    if (!r.rows.length) {
      res.status(404).json({ error: 'Admin account not found.' });
      return;
    }

    const adminId = req.session.adminId!;
    const adminEmail = await getAdminEmail(adminId);

    void auditLog({
      adminId,
      adminEmail,
      action: 'admin_role_updated',
      targetType: 'admin',
      targetId: id,
      details: { role },
      ip: clientIp(req),
    });

    res.json({
      ok: true,
      admin: r.rows[0],
    });
  } catch (err) {
    logger.error({ err }, 'PATCH /admins/:id/role failed');
    res.status(500).json({ error: 'Failed to update admin role.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// AUDIT LOGS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/audit-logs', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query['page'] ?? 1));
  const limit = Math.min(200, Math.max(1, Number(req.query['limit'] ?? 50)));
  const offset = (page - 1) * limit;
  const action = String(req.query['action'] ?? '').trim();
  const adminId = String(req.query['adminId'] ?? '').trim();

  try {
    const where = sql`
      ${action ? sql`AND action = ${action}` : sql``}
      ${adminId ? sql`AND admin_id = ${adminId}` : sql``}
    `;

    const [countRes, rowsRes] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM admin_audit_logs
        WHERE TRUE ${where}
      `),
      db.execute(sql`
        SELECT *
        FROM admin_audit_logs
        WHERE TRUE ${where}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
    ]);

    const total = Number((countRes.rows[0] as Record<string, unknown>)?.['total'] ?? 0);

    res.json({
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      logs: rowsRes.rows,
    });
  } catch (err) {
    logger.error({ err }, 'GET /audit-logs failed');
    res.status(500).json({ error: 'Failed to load audit logs.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// FINANCIAL AUDIT
// ═════════════════════════════════════════════════════════════════════════════

router.get('/finance/audit', async (req: Request, res: Response): Promise<void> => {
  const page = Math.max(1, Number(req.query['page'] ?? 1));
  const limit = Math.min(200, Math.max(1, Number(req.query['limit'] ?? 50)));
  const offset = (page - 1) * limit;

  try {
    const r = await db.execute(sql`
      SELECT *
      FROM financial_audit_logs
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    res.json({
      page,
      limit,
      logs: r.rows,
    });
  } catch (err) {
    logger.error({ err }, 'GET /finance/audit failed');
    res.status(500).json({ error: 'Failed to load financial audit logs.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// REFERRALS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/referrals', async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(200, Math.max(1, Number(req.query['limit'] ?? 50)));

  try {
    const r = await db.execute(sql`
      SELECT
        u.id,
        u.name,
        u.email,
        u.referral_code,
        COUNT(r.id)::int AS referral_count
      FROM users u
      LEFT JOIN users r
        ON r.referred_by = u.id
      GROUP BY
        u.id,
        u.name,
        u.email,
        u.referral_code
      ORDER BY referral_count DESC
      LIMIT ${limit}
    `);

    res.json({
      referrals: r.rows,
    });
  } catch (err) {
    logger.error({ err }, 'GET /referrals failed');
    res.status(500).json({ error: 'Failed to load referral data.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═════════════════════════════════════════════════════════════════════════════

router.post('/notifications/staff', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  const adminEmail = await getAdminEmail(adminId);

  const {
    staffIds,
    title,
    body,
  } = req.body as {
    staffIds?: string[];
    title?: string;
    body?: string;
  };

  if (!title || !body) {
    res.status(400).json({
      error: 'Title and body are required.',
    });
    return;
  }

  try {
    void auditLog({
      adminId,
      adminEmail,
      action: 'send_staff_notification',
      details: {
        title,
        body,
        staffIds: staffIds ?? [],
        count: staffIds?.length ?? 0,
      },
      ip: clientIp(req),
    });

    res.json({
      sent: staffIds?.length ?? 0,
    });
  } catch (err) {
    logger.error({ err }, 'POST /notifications/staff failed');
    res.status(500).json({ error: 'Failed to send staff notification.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// PROVIDER TRANSACTION REPORTS
// Real revenue, cost, and profit calculated from actual transaction data.
// cost_price = provider cost recorded for the transaction.
// amount     = what the customer paid us (selling price).
// profit     = amount - cost_price.
// ═════════════════════════════════════════════════════════════════════════════

router.get('/reports/profit', async (req: Request, res: Response): Promise<void> => {
  const role = req.session.adminRole;

  if (!['super_admin', 'admin', 'finance'].includes(role ?? '')) {
    res.status(403).json({ error: 'Access denied.' });
    return;
  }

  const {
    from,
    to,
    type,
  } = req.query as {
    from?: string;
    to?: string;
    type?: string;
  };

  const startDate = from
    ? new Date(from)
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const endDate = to
    ? new Date(to)
    : new Date();

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    res.status(400).json({
      error: 'Invalid date range. Use ISO format (YYYY-MM-DD).',
    });
    return;
  }

  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*)::int AS transaction_count,
        COALESCE(SUM(amount), 0)::numeric AS revenue,
        COALESCE(SUM(cost_price), 0)::numeric AS cost,
        COALESCE(SUM(amount - COALESCE(cost_price, 0)), 0)::numeric AS profit
      FROM transactions
      WHERE created_at >= ${startDate}
        AND created_at <= ${endDate}
        AND status = 'success'
        ${type ? sql`AND type = ${type}` : sql``}
    `);

    res.json({
      from: startDate.toISOString(),
      to: endDate.toISOString(),
      type: type ?? null,
      report: r.rows[0] ?? {},
    });
  } catch (err) {
    logger.error({ err }, 'GET /reports/profit failed');
    res.status(500).json({ error: 'Failed to generate profit report.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SERVICE SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

router.get('/reports/services', async (req: Request, res: Response): Promise<void> => {
  const from = req.query['from']
    ? new Date(String(req.query['from']))
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const to = req.query['to']
    ? new Date(String(req.query['to']))
    : new Date();

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    res.status(400).json({ error: 'Invalid date range.' });
    return;
  }

  try {
    const r = await db.execute(sql`
      SELECT
        type,
        COUNT(*)::int AS transaction_count,
        COUNT(*) FILTER (WHERE status = 'success')::int AS successful_count,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
        COALESCE(SUM(amount) FILTER (WHERE status = 'success'), 0)::numeric AS revenue,
        COALESCE(SUM(cost_price) FILTER (WHERE status = 'success'), 0)::numeric AS cost,
        COALESCE(
          SUM(amount - COALESCE(cost_price, 0))
          FILTER (WHERE status = 'success'),
          0
        )::numeric AS profit
      FROM transactions
      WHERE created_at >= ${from}
        AND created_at <= ${to}
      GROUP BY type
      ORDER BY revenue DESC
    `);

    res.json({
      from: from.toISOString(),
      to: to.toISOString(),
      services: r.rows,
    });
  } catch (err) {
    logger.error({ err }, 'GET /reports/services failed');
    res.status(500).json({ error: 'Failed to generate service report.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SECURITY / 2FA
// ═════════════════════════════════════════════════════════════════════════════

router.post('/security/2fa/verify', async (req: Request, res: Response): Promise<void> => {
  const { pin } = req.body as { pin?: string };

  if (!pin) {
    res.status(400).json({ error: 'PIN is required.' });
    return;
  }

  try {
    const r = await db.execute(sql`
      SELECT transaction_pin
      FROM admin_accounts
      WHERE id = ${req.session.adminId!}
      LIMIT 1
    `);

    if (!r.rows.length) {
      res.status(404).json({ error: 'Admin account not found.' });
      return;
    }

    const stored = String(
      (r.rows[0] as Record<string, unknown>)['transaction_pin'] ?? '',
    );

    const hashed = await hashPin(pin);

    const valid =
      stored === hashed ||
      stored === pin;

    if (!valid) {
      res.status(401).json({
        verified: false,
        error: 'Invalid transaction PIN.',
      });
      return;
    }

    res.json({
      verified: true,
    });
  } catch (err) {
    logger.error({ err }, 'POST /security/2fa/verify failed');
    res.status(500).json({ error: 'Failed to verify 2FA.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SYSTEM HEALTH
// ═════════════════════════════════════════════════════════════════════════════

router.get('/system/health', async (_req: Request, res: Response): Promise<void> => {
  const checks: Record<string, unknown> = {
    database: 'unknown',
    smeapi: process.env['SME_API_KEY'] ? 'configured' : 'not_configured',
    monnify: process.env['MONNIFY_API_KEY'] ? 'configured' : 'not_configured',
  };

  try {
    await db.execute(sql`SELECT 1`);
    checks.database = 'online';
  } catch {
    checks.database = 'offline';
  }

  res.json({
    ok: checks.database === 'online',
    checks,
    timestamp: new Date().toISOString(),
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// DATABASE STATISTICS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/system/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [
      users,
      admins,
      transactions,
      wallets,
      auditLogs,
    ] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int AS count FROM users`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM admin_accounts`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM transactions`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM wallets`),
      db.execute(sql`SELECT COUNT(*)::int AS count FROM admin_audit_logs`),
    ]);

    res.json({
      users: Number((users.rows[0] as Record<string, unknown>)?.['count'] ?? 0),
      admins: Number((admins.rows[0] as Record<string, unknown>)?.['count'] ?? 0),
      transactions: Number((transactions.rows[0] as Record<string, unknown>)?.['count'] ?? 0),
      wallets: Number((wallets.rows[0] as Record<string, unknown>)?.['count'] ?? 0),
      auditLogs: Number((auditLogs.rows[0] as Record<string, unknown>)?.['count'] ?? 0),
    });
  } catch (err) {
    logger.error({ err }, 'GET /system/stats failed');
    res.status(500).json({ error: 'Failed to load system statistics.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// EXPORT TRANSACTIONS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/transactions/export', async (req: Request, res: Response): Promise<void> => {
  const from = req.query['from']
    ? new Date(String(req.query['from']))
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const to = req.query['to']
    ? new Date(String(req.query['to']))
    : new Date();

  if (isNaN(from.getTime()) || isNaN(to.getTime())) {
    res.status(400).json({ error: 'Invalid date range.' });
    return;
  }

  try {
    const r = await db.execute(sql`
      SELECT
        t.id,
        t.reference,
        t.type,
        t.amount,
        t.cost_price,
        t.status,
        t.provider,
        t.created_at,
        u.name AS user_name,
        u.email AS user_email,
        u.phone AS user_phone
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      WHERE t.created_at >= ${from}
        AND t.created_at <= ${to}
      ORDER BY t.created_at DESC
    `);

    res.json({
      from: from.toISOString(),
      to: to.toISOString(),
      count: r.rows.length,
      transactions: r.rows,
    });
  } catch (err) {
    logger.error({ err }, 'GET /transactions/export failed');
    res.status(500).json({ error: 'Failed to export transactions.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// WALLET TRANSFERS / REVERSALS
// ═════════════════════════════════════════════════════════════════════════════

router.post('/transactions/:id/reverse', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const reason = String(req.body?.reason ?? '').trim();

  if (!reason) {
    res.status(400).json({ error: 'Reason is required.' });
    return;
  }

  try {
    const adminId = req.session.adminId!;
    const adminEmail = await getAdminEmail(adminId);

    await db.transaction(async (tx) => {
      const transactionRes = await tx.execute(sql`
        SELECT *
        FROM transactions
        WHERE id = ${id}
        FOR UPDATE
      `);

      if (!transactionRes.rows.length) {
        throw new Error('Transaction not found.');
      }

      const transaction = transactionRes.rows[0] as Record<string, unknown>;

      if (String(transaction['status']) !== 'success') {
        throw new Error('Only successful transactions can be reversed.');
      }

      const amount = Number(transaction['amount']);
      const userId = String(transaction['user_id']);
      const reference = String(transaction['reference'] ?? makeRef('REV'));

      await tx.execute(sql`
        UPDATE transactions
        SET
          status = 'reversed',
          updated_at = NOW()
        WHERE id = ${id}
      `);

      await tx.execute(sql`
        INSERT INTO wallets (user_id, balance, created_at, updated_at)
        VALUES (${userId}, 0, NOW(), NOW())
        ON CONFLICT (user_id) DO NOTHING
      `);

      await tx.execute(sql`
        UPDATE wallets
        SET balance = balance + ${amount}, updated_at = NOW()
        WHERE user_id = ${userId}
      `);

      await tx.execute(sql`
        INSERT INTO wallet_ledger
          (user_id, type, amount, description, reference, performed_by, created_at)
        VALUES
          (
            ${userId},
            'reversal',
            ${amount},
            ${reason},
            ${reference + '-REV'},
            ${adminId},
            NOW()
          )
      `);
    });

    void auditLog({
      adminId,
      adminEmail,
      action: 'transaction_reversed',
      targetType: 'transaction',
      targetId: id,
      details: { reason },
      ip: clientIp(req),
    });

    void financialAuditLog({
      adminId,
      action: 'transaction_reversal',
      reference: id,
      amount: 0,
      metadata: { reason },
    });

    res.json({
      ok: true,
      message: 'Transaction reversed successfully.',
    });
  } catch (err) {
    logger.error({ err }, 'POST /transactions/:id/reverse failed');

    const message =
      err instanceof Error
        ? err.message
        : 'Failed to reverse transaction.';

    res.status(
      message === 'Transaction not found.' ||
      message === 'Only successful transactions can be reversed.'
        ? 400
        : 500,
    ).json({ error: message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SERVICE CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════

router.get('/services', async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await db.execute(sql`
      SELECT
        service_type,
        COUNT(*)::int AS plan_count,
        COUNT(*) FILTER (WHERE enabled = true)::int AS enabled_count,
        COUNT(*) FILTER (WHERE enabled = false)::int AS disabled_count
      FROM pricing_rules
      GROUP BY service_type
      ORDER BY service_type
    `);

    res.json({
      services: r.rows,
    });
  } catch (err) {
    logger.error({ err }, 'GET /services failed');
    res.status(500).json({ error: 'Failed to load service configuration.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SERVICE TOGGLES
// ═════════════════════════════════════════════════════════════════════════════

router.patch('/services/:serviceType', async (req: Request, res: Response): Promise<void> => {
  const { serviceType } = req.params as { serviceType: string };
  const { enabled } = req.body as { enabled?: boolean };

  if (enabled === undefined) {
    res.status(400).json({ error: 'enabled is required.' });
    return;
  }

  try {
    await db.execute(sql`
      UPDATE pricing_rules
      SET enabled = ${Boolean(enabled)}, updated_at = NOW()
      WHERE service_type = ${serviceType}
    `);

    const adminId = req.session.adminId!;
    const adminEmail = await getAdminEmail(adminId);

    void auditLog({
      adminId,
      adminEmail,
      action: 'service_toggle_updated',
      targetType: 'service',
      targetId: serviceType,
      details: {
        enabled: Boolean(enabled),
      },
      ip: clientIp(req),
    });

    res.json({
      ok: true,
      serviceType,
      enabled: Boolean(enabled),
    });
  } catch (err) {
    logger.error({ err }, 'PATCH /services/:serviceType failed');
    res.status(500).json({ error: 'Failed to update service.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATION HISTORY
// ═════════════════════════════════════════════════════════════════════════════

router.get('/notifications/history', async (req: Request, res: Response): Promise<void> => {
  const limit = Math.min(200, Math.max(1, Number(req.query['limit'] ?? 50)));

  try {
    const r = await db.execute(sql`
      SELECT
        id,
        admin_id,
        admin_email,
        action,
        details,
        created_at
      FROM admin_audit_logs
      WHERE action = 'send_staff_notification'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    res.json({
      notifications: r.rows,
    });
  } catch (err) {
    logger.error({ err }, 'GET /notifications/history failed');
    res.status(500).json({ error: 'Failed to load notification history.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// MAINTENANCE
// ═════════════════════════════════════════════════════════════════════════════

router.get('/maintenance', async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await db.execute(sql`
      SELECT key, value
      FROM system_settings
      WHERE key IN (
        'maintenance_mode',
        'maintenance_message'
      )
    `);

    const settings: Record<string, string> = {};

    for (const row of r.rows) {
      const x = row as Record<string, unknown>;
      settings[String(x['key'])] = String(x['value'] ?? '');
    }

    res.json({
      maintenanceMode: settings['maintenance_mode'] === 'true',
      message: settings['maintenance_message'] ?? '',
    });
  } catch (err) {
    logger.error({ err }, 'GET /maintenance failed');
    res.status(500).json({ error: 'Failed to load maintenance settings.' });
  }
});

router.patch('/maintenance', async (req: Request, res: Response): Promise<void> => {
  const {
    enabled,
    message,
  } = req.body as {
    enabled?: boolean;
    message?: string;
  };

  try {
    const adminId = req.session.adminId!;
    const adminEmail = await getAdminEmail(adminId);

    if (enabled !== undefined) {
      await db.execute(sql`
        INSERT INTO system_settings (key, value, updated_by, updated_at)
        VALUES ('maintenance_mode', ${String(Boolean(enabled))}, ${adminId}, NOW())
        ON CONFLICT (key)
        DO UPDATE SET
          value = EXCLUDED.value,
          updated_by = EXCLUDED.updated_by,
          updated_at = NOW()
      `);
    }

    if (message !== undefined) {
      await db.execute(sql`
        INSERT INTO system_settings (key, value, updated_by, updated_at)
        VALUES ('maintenance_message', ${message}, ${adminId}, NOW())
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
      action: 'maintenance_settings_updated',
      details: {
        enabled,
        messageProvided: message !== undefined,
      },
      ip: clientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'PATCH /maintenance failed');
    res.status(500).json({ error: 'Failed to update maintenance settings.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ANNOUNCEMENTS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/announcements', async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await db.execute(sql`
      SELECT *
      FROM announcements
      ORDER BY created_at DESC
      LIMIT 100
    `);

    res.json({
      announcements: r.rows,
    });
  } catch (err) {
    logger.error({ err }, 'GET /announcements failed');
    res.status(500).json({ error: 'Failed to load announcements.' });
  }
});

router.post('/announcements', async (req: Request, res: Response): Promise<void> => {
  const {
    title,
    body,
    enabled,
  } = req.body as {
    title?: string;
    body?: string;
    enabled?: boolean;
  };

  if (!title || !body) {
    res.status(400).json({
      error: 'Title and body are required.',
    });
    return;
  }

  try {
    const r = await db.execute(sql`
      INSERT INTO announcements (
        title,
        body,
        enabled,
        created_by,
        created_at,
        updated_at
      )
      VALUES (
        ${title.trim()},
        ${body.trim()},
        ${enabled !== false},
        ${req.session.adminId!},
        NOW(),
        NOW()
      )
      RETURNING *
    `);

    const adminId = req.session.adminId!;
    const adminEmail = await getAdminEmail(adminId);

    void auditLog({
      adminId,
      adminEmail,
      action: 'announcement_created',
      targetType: 'announcement',
      targetId: String((r.rows[0] as Record<string, unknown>)['id']),
      details: {
        title,
        enabled: enabled !== false,
      },
      ip: clientIp(req),
    });

    res.status(201).json({
      ok: true,
      announcement: r.rows[0],
    });
  } catch (err) {
    logger.error({ err }, 'POST /announcements failed');
    res.status(500).json({ error: 'Failed to create announcement.' });
  }
});

router.patch('/announcements/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const {
    title,
    body,
    enabled,
  } = req.body as {
    title?: string;
    body?: string;
    enabled?: boolean;
  };

  try {
    const r = await db.execute(sql`
      UPDATE announcements
      SET
        title = COALESCE(${title ?? null}, title),
        body = COALESCE(${body ?? null}, body),
        enabled = COALESCE(${enabled ?? null}, enabled),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `);

    if (!r.rows.length) {
      res.status(404).json({ error: 'Announcement not found.' });
      return;
    }

    const adminId = req.session.adminId!;
    const adminEmail = await getAdminEmail(adminId);

    void auditLog({
      adminId,
      adminEmail,
      action: 'announcement_updated',
      targetType: 'announcement',
      targetId: id,
      details: {
        titleProvided: title !== undefined,
        bodyProvided: body !== undefined,
        enabled,
      },
      ip: clientIp(req),
    });

    res.json({
      ok: true,
      announcement: r.rows[0],
    });
  } catch (err) {
    logger.error({ err }, 'PATCH /announcements/:id failed');
    res.status(500).json({ error: 'Failed to update announcement.' });
  }
});

router.delete('/announcements/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  try {
    const r = await db.execute(sql`
      DELETE FROM announcements
      WHERE id = ${id}
      RETURNING id
    `);

    if (!r.rows.length) {
      res.status(404).json({ error: 'Announcement not found.' });
      return;
    }

    const adminId = req.session.adminId!;
    const adminEmail = await getAdminEmail(adminId);

    void auditLog({
      adminId,
      adminEmail,
      action: 'announcement_deleted',
      targetType: 'announcement',
      targetId: id,
      ip: clientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'DELETE /announcements/:id failed');
    res.status(500).json({ error: 'Failed to delete announcement.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SUPPORT / SYSTEM CONTACT
// ═════════════════════════════════════════════════════════════════════════════

router.get('/support', async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await db.execute(sql`
      SELECT key, value
      FROM system_settings
      WHERE key IN (
        'support_phone',
        'support_email',
        'support_whatsapp',
        'support_message'
      )
    `);

    const settings: Record<string, string> = {};

    for (const row of r.rows) {
      const x = row as Record<string, unknown>;
      settings[String(x['key'])] = String(x['value'] ?? '');
    }

    res.json({
      phone: settings['support_phone'] ?? '',
      email: settings['support_email'] ?? '',
      whatsapp: settings['support_whatsapp'] ?? '',
      message: settings['support_message'] ?? '',
    });
  } catch (err) {
    logger.error({ err }, 'GET /support failed');
    res.status(500).json({ error: 'Failed to load support settings.' });
  }
});

router.patch('/support', async (req: Request, res: Response): Promise<void> => {
  const {
    phone,
    email,
    whatsapp,
    message,
  } = req.body as {
    phone?: string;
    email?: string;
    whatsapp?: string;
    message?: string;
  };

  try {
    const adminId = req.session.adminId!;
    const adminEmail = await getAdminEmail(adminId);

    const values: Record<string, string | undefined> = {
      support_phone: phone,
      support_email: email,
      support_whatsapp: whatsapp,
      support_message: message,
    };

    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) continue;

      await db.execute(sql`
        INSERT INTO system_settings (key, value, updated_by, updated_at)
        VALUES (${key}, ${value}, ${adminId}, NOW())
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
      action: 'support_settings_updated',
      details: {
        fields: Object.keys(values).filter((key) => values[key] !== undefined),
      },
      ip: clientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'PATCH /support failed');
    res.status(500).json({ error: 'Failed to update support settings.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// API PROVIDER SETTINGS SUMMARY
// ═════════════════════════════════════════════════════════════════════════════

router.get('/provider-summary', async (_req: Request, res: Response): Promise<void> => {
  try {
    const smeConfigured = Boolean(
      String(process.env['SME_API_KEY'] ?? '').trim(),
    );

    const monnifyConfigured = Boolean(
      String(process.env['MONNIFY_API_KEY'] ?? '').trim(),
    );

    res.json({
      providers: [
        {
          key: 'smeapi',
          name: 'SME API',
          type: 'VTU / Data / Airtime',
          configured: smeConfigured,
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
          type: 'Payment Gateway',
          configured: monnifyConfigured,
        },
      ],
    });
  } catch (err) {
    logger.error({ err }, 'GET /provider-summary failed');
    res.status(500).json({ error: 'Failed to load provider summary.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// DATA PLAN / SERVICE COUNTS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/catalogue/summary', async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await db.execute(sql`
      SELECT
        provider,
        service_type,
        COUNT(*)::int AS plans,
        COUNT(*) FILTER (WHERE enabled = true)::int AS enabled_plans,
        MIN(selling_price)::numeric AS minimum_price,
        MAX(selling_price)::numeric AS maximum_price
      FROM pricing_rules
      GROUP BY provider, service_type
      ORDER BY provider, service_type
    `);

    res.json({
      catalogue: r.rows,
    });
  } catch (err) {
    logger.error({ err }, 'GET /catalogue/summary failed');
    res.status(500).json({ error: 'Failed to load catalogue summary.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN PROFILE
// ═════════════════════════════════════════════════════════════════════════════

router.get('/profile', async (req: Request, res: Response): Promise<void> => {
  try {
    const r = await db.execute(sql`
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
      res.status(404).json({ error: 'Admin profile not found.' });
      return;
    }

    res.json({
      profile: r.rows[0],
    });
  } catch (err) {
    logger.error({ err }, 'GET /profile failed');
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

router.patch('/profile', async (req: Request, res: Response): Promise<void> => {
  const {
    name,
    email,
  } = req.body as {
    name?: string;
    email?: string;
  };

  if (!name && !email) {
    res.status(400).json({ error: 'Nothing to update.' });
    return;
  }

  try {
    const r = await db.execute(sql`
      UPDATE admin_accounts
      SET
        name = COALESCE(${name ?? null}, name),
        email = COALESCE(${email?.trim().toLowerCase() ?? null}, email),
        updated_at = NOW()
      WHERE id = ${req.session.adminId!}
      RETURNING id, name, email, role, status
    `);

    if (!r.rows.length) {
      res.status(404).json({ error: 'Admin profile not found.' });
      return;
    }

    const adminId = req.session.adminId!;
    const adminEmail = await getAdminEmail(adminId);

    void auditLog({
      adminId,
      adminEmail,
      action: 'admin_profile_updated',
      targetType: 'admin',
      targetId: adminId,
      details: {
        nameProvided: name !== undefined,
        emailProvided: email !== undefined,
      },
      ip: clientIp(req),
    });

    res.json({
      ok: true,
      profile: r.rows[0],
    });
  } catch (err) {
    logger.error({ err }, 'PATCH /profile failed');
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// ROUTER EXPORT
// ═════════════════════════════════════════════════════════════════════════════

export default router;
