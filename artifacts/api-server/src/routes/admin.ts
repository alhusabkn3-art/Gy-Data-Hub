/**
 * Admin API routes — /api/admin/*
 *
 * All data endpoints require an active admin session (req.session.isAdmin).
 * The session is established via POST /api/admin/session with valid credentials.
 * Credentials are validated against ADMIN_EMAIL / ADMIN_PIN env vars
 * (defaults match the frontend adminCredentials for local dev parity).
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '@workspace/db';
import { usersTable } from '@workspace/db/schema';
import { sql, eq } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

const router = Router();

const ADMIN_EMAIL = (process.env['ADMIN_EMAIL'] ?? 'admin@gyd.com').toLowerCase();
const ADMIN_PIN   =  process.env['ADMIN_PIN']   ?? '125125';

// ── Middleware ────────────────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.isAdmin) {
    res.status(401).json({ error: 'Admin authentication required.' });
    return;
  }
  next();
}

// ── Session (no requireAdmin) ─────────────────────────────────────────────────

// POST /api/admin/session
router.post('/session', (req: Request, res: Response): void => {
  const { email, pin } = req.body as { email?: string; pin?: string };
  if (
    email?.trim().toLowerCase() === ADMIN_EMAIL &&
    pin === ADMIN_PIN
  ) {
    req.session.isAdmin = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: 'Invalid admin credentials.' });
  }
});

// DELETE /api/admin/session
router.delete('/session', (req: Request, res: Response): void => {
  req.session.isAdmin = false;
  res.json({ ok: true });
});

// ── All routes below require admin session ────────────────────────────────────
router.use(requireAdmin);

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [u, t, r, w] = await Promise.all([
      // User counts
      db.execute(sql`
        SELECT
          COUNT(*)::int                                              AS total_users,
          COUNT(*) FILTER (WHERE status = 'active')::int            AS active_users,
          COUNT(*) FILTER (WHERE status = 'suspended')::int         AS suspended_users,
          COUNT(*) FILTER (WHERE kyc_status = 'verified')::int      AS verified_users,
          COUNT(*) FILTER (WHERE kyc_status = 'pending')::int       AS pending_kyc,
          COUNT(*) FILTER (WHERE kyc_status = 'unverified')::int    AS unverified_users
        FROM users
      `),
      // Transaction counts (exclude wallet_fund — those are top-ups, not service txns)
      db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE type != 'wallet_fund')::int                            AS total,
          COUNT(*) FILTER (WHERE type != 'wallet_fund' AND status = 'success')::int     AS successful,
          COUNT(*) FILTER (WHERE type != 'wallet_fund' AND status = 'pending')::int     AS pending,
          COUNT(*) FILTER (WHERE type != 'wallet_fund' AND status = 'failed')::int      AS failed
        FROM transactions
      `),
      // Revenue (service txns only)
      db.execute(sql`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE status='success' AND type!='wallet_fund'), 0)::numeric AS total_revenue,
          COALESCE(SUM(amount) FILTER (
            WHERE status='success' AND type!='wallet_fund'
              AND created_at >= DATE_TRUNC('day', NOW())
          ), 0)::numeric AS today_revenue,
          COALESCE(SUM(amount) FILTER (
            WHERE status='success' AND type!='wallet_fund'
              AND created_at >= NOW() - INTERVAL '7 days'
          ), 0)::numeric AS week_revenue,
          COALESCE(SUM(amount) FILTER (
            WHERE status='success' AND type!='wallet_fund'
              AND created_at >= DATE_TRUNC('month', NOW())
          ), 0)::numeric AS month_revenue
        FROM transactions
      `),
      // Total wallet balance across all users
      db.execute(sql`SELECT COALESCE(SUM(balance), 0)::numeric AS total_wallet_balance FROM wallets`),
    ]);

    const uRow = u.rows[0] as Record<string, unknown>;
    const tRow = t.rows[0] as Record<string, unknown>;
    const rRow = r.rows[0] as Record<string, unknown>;
    const wRow = w.rows[0] as Record<string, unknown>;

    const totalRevenue = Number(rRow['total_revenue']);
    const successful   = Number(tRow['successful']);

    res.json({
      totalUsers:             Number(uRow['total_users']),
      activeUsers:            Number(uRow['active_users']),
      suspendedUsers:         Number(uRow['suspended_users']),
      verifiedUsers:          Number(uRow['verified_users']),
      pendingKycUsers:        Number(uRow['pending_kyc']),
      unverifiedUsers:        Number(uRow['unverified_users']),
      totalTransactions:      Number(tRow['total']),
      successfulTransactions: successful,
      pendingTransactions:    Number(tRow['pending']),
      failedTransactions:     Number(tRow['failed']),
      totalRevenue,
      todayRevenue:           Number(rRow['today_revenue']),
      weekRevenue:            Number(rRow['week_revenue']),
      monthRevenue:           Number(rRow['month_revenue']),
      totalWalletBalance:     Number(wRow['total_wallet_balance']),
      avgTransactionValue:    successful > 0 ? Math.round(totalRevenue / successful) : 0,
    });
  } catch (err) {
    logger.error({ err }, 'admin/stats failed');
    res.status(500).json({ error: 'Failed to load stats.' });
  }
});

// ── GET /api/admin/revenue/weekly ─────────────────────────────────────────────
router.get('/revenue/weekly', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('day', created_at), 'Dy') AS day,
        COALESCE(SUM(amount), 0)::numeric              AS amount
      FROM transactions
      WHERE status = 'success'
        AND type != 'wallet_fund'
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY DATE_TRUNC('day', created_at) ASC
    `);
    res.json(rows.rows.map((r: Record<string, unknown>) => ({
      day:    String(r['day']),
      amount: Number(r['amount']),
    })));
  } catch (err) {
    logger.error({ err }, 'admin/revenue/weekly failed');
    res.status(500).json({ error: 'Failed to load weekly revenue.' });
  }
});

// ── GET /api/admin/services ───────────────────────────────────────────────────
router.get('/services', async (_req: Request, res: Response): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      SELECT
        type,
        COUNT(*)::int                                                           AS total,
        COUNT(*) FILTER (WHERE status = 'success')::int                        AS successful,
        COUNT(*) FILTER (WHERE status = 'pending')::int                        AS pending,
        COUNT(*) FILTER (WHERE status = 'failed')::int                         AS failed,
        COALESCE(SUM(amount) FILTER (WHERE status = 'success'), 0)::numeric    AS revenue
      FROM transactions
      WHERE type != 'wallet_fund'
      GROUP BY type
      ORDER BY revenue DESC
    `);
    res.json(rows.rows.map((r: Record<string, unknown>) => {
      const total      = Number(r['total']);
      const successful = Number(r['successful']);
      return {
        type:        String(r['type']),
        total,
        successful,
        pending:     Number(r['pending']),
        failed:      Number(r['failed']),
        revenue:     Number(r['revenue']),
        successRate: total > 0 ? Math.round((successful / total) * 1000) / 10 : 0,
      };
    }));
  } catch (err) {
    logger.error({ err }, 'admin/services failed');
    res.status(500).json({ error: 'Failed to load services.' });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', async (req: Request, res: Response): Promise<void> => {
  try {
    const search = String(req.query['search'] ?? '').trim();
    const status = String(req.query['status'] ?? 'all');
    const kyc    = String(req.query['kyc']    ?? 'all');
    const page   = Math.max(1, Number(req.query['page']  ?? 1));
    const limit  = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 50)));
    const offset = (page - 1) * limit;

    // Build parameterised WHERE incrementally
    let cond = sql`1=1`;
    if (search) cond = sql`${cond} AND (u.name ILIKE ${`%${search}%`} OR u.phone ILIKE ${`%${search}%`} OR u.email ILIKE ${`%${search}%`})`;
    if (status !== 'all') cond = sql`${cond} AND u.status = ${status}`;
    if (kyc    !== 'all') cond = sql`${cond} AND u.kyc_status = ${kyc}`;

    const [countRes, rowRes] = await Promise.all([
      db.execute(sql`SELECT COUNT(DISTINCT u.id)::int AS total FROM users u WHERE ${cond}`),
      db.execute(sql`
        SELECT
          u.id, u.name, u.email, u.phone, u.status, u.kyc_status,
          u.account_number, u.bank_name, u.referral_code, u.created_at,
          COALESCE(w.balance, '0')::numeric AS balance,
          COUNT(t.id)::int AS transaction_count,
          COALESCE(SUM(t.amount) FILTER (WHERE t.status='success' AND t.type!='wallet_fund'), 0)::numeric AS total_spent
        FROM users u
        LEFT JOIN wallets w ON w.user_id = u.id
        LEFT JOIN transactions t ON t.user_id = u.id
        WHERE ${cond}
        GROUP BY u.id, w.balance
        ORDER BY u.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
    ]);

    const total = Number((countRes.rows[0] as Record<string, unknown>)['total']);

    res.json({
      users: rowRes.rows.map((r: Record<string, unknown>) => ({
        id:               String(r['id']),
        name:             String(r['name']),
        email:            String(r['email'] ?? ''),
        phone:            String(r['phone']),
        balance:          Number(r['balance']),
        status:           String(r['status']) as 'active' | 'suspended' | 'pending',
        kycStatus:        String(r['kyc_status']) as 'verified' | 'pending' | 'unverified' | 'failed',
        accountNumber:    String(r['account_number']),
        bankName:         String(r['bank_name']),
        referralCode:     String(r['referral_code']),
        joinedDate:       new Date(String(r['created_at'])).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric', year: 'numeric',
        }),
        transactionCount: Number(r['transaction_count']),
        totalSpent:       Number(r['total_spent']),
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    logger.error({ err }, 'admin/users failed');
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

// ── PATCH /api/admin/users/:id/status ────────────────────────────────────────
router.patch('/users/:id/status', async (req: Request, res: Response): Promise<void> => {
  const { id }     = req.params as { id: string };
  const { status } = req.body as { status: string };

  if (!['active', 'suspended'].includes(status)) {
    res.status(400).json({ error: 'Status must be active or suspended.' });
    return;
  }
  try {
    const [updated] = await db
      .update(usersTable)
      .set({ status: status as 'active' | 'suspended', updatedAt: new Date() })
      .where(eq(usersTable.id, id))
      .returning({ id: usersTable.id });

    if (!updated) { res.status(404).json({ error: 'User not found.' }); return; }
    res.json({ ok: true, status });
  } catch (err) {
    logger.error({ err }, 'admin/users/:id/status failed');
    res.status(500).json({ error: 'Failed to update user.' });
  }
});

// ── GET /api/admin/transactions ───────────────────────────────────────────────
router.get('/transactions', async (req: Request, res: Response): Promise<void> => {
  try {
    const search = String(req.query['search'] ?? '').trim();
    const status = String(req.query['status'] ?? 'all');
    const type   = String(req.query['type']   ?? 'all');
    const page   = Math.max(1, Number(req.query['page']  ?? 1));
    const limit  = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 50)));
    const offset = (page - 1) * limit;

    let cond = sql`1=1`;
    if (search)           cond = sql`${cond} AND (u.name ILIKE ${`%${search}%`} OR t.reference ILIKE ${`%${search}%`} OR t.provider ILIKE ${`%${search}%`})`;
    if (status !== 'all') cond = sql`${cond} AND t.status = ${status}`;
    if (type   !== 'all') cond = sql`${cond} AND t.type   = ${type}`;

    const [countRes, rowRes] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM transactions t JOIN users u ON u.id = t.user_id
        WHERE ${cond}
      `),
      db.execute(sql`
        SELECT
          t.id, t.type, t.service, t.provider, t.amount::numeric, t.status,
          COALESCE(t.reference, '') AS reference, t.description, t.created_at,
          u.id AS user_id, u.name AS user_name, u.phone
        FROM transactions t JOIN users u ON u.id = t.user_id
        WHERE ${cond}
        ORDER BY t.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
    ]);

    const total = Number((countRes.rows[0] as Record<string, unknown>)['total']);

    res.json({
      transactions: rowRes.rows.map((r: Record<string, unknown>) => {
        const d = new Date(String(r['created_at']));
        return {
          id:          String(r['id']),
          userId:      String(r['user_id']),
          userName:    String(r['user_name']),
          phone:       String(r['phone']),
          type:        String(r['type']),
          service:     String(r['service']),
          provider:    String(r['provider']),
          amount:      Number(r['amount']),
          status:      String(r['status']),
          reference:   String(r['reference']),
          description: String(r['description']),
          date:        d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          time:        d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        };
      }),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    logger.error({ err }, 'admin/transactions failed');
    res.status(500).json({ error: 'Failed to load transactions.' });
  }
});

export default router;
