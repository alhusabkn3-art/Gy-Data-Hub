/**
 * Admin API routes — /api/admin/*
 *
 * Authentication:
 *   POST /api/admin/session  — no auth required (login)
 *   All other routes        — requireAdmin middleware (isAdmin session flag)
 *   Super-admin routes      — additionally requireSuperAdmin (adminRole session field)
 *
 * Role enforcement is server-side only. The frontend receives a role field
 * in GET /api/admin/me and uses it for UI gating, but every protected
 * action is independently checked here regardless of what the frontend sends.
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

// ── Env-var bootstrap credentials ────────────────────────────────────────────
// Used only to seed the first super-admin account into the DB.
// After seeding, all logins validate against the DB hash.
const BOOTSTRAP_EMAIL = (process.env['ADMIN_EMAIL'] ?? 'admin@gyd.com').toLowerCase();
const BOOTSTRAP_PIN   =  process.env['ADMIN_PIN']   ?? '125125';

// ── Middleware ────────────────────────────────────────────────────────────────

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.isAdmin) {
    res.status(401).json({ error: 'Admin authentication required.' });
    return;
  }
  next();
}

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

// ── Audit log helper ──────────────────────────────────────────────────────────

async function auditLog(opts: {
  adminId:     string;
  adminEmail:  string;
  action:      string;
  targetType?: string;
  targetId?:   string;
  targetLabel?: string;
  details?:    Record<string, unknown>;
  ip?:         string;
}): Promise<void> {
  try {
    await db.insert(adminAuditLogsTable).values({
      adminId:     opts.adminId,
      adminEmail:  opts.adminEmail,
      action:      opts.action,
      targetType:  opts.targetType  ?? null,
      targetId:    opts.targetId    ?? null,
      targetLabel: opts.targetLabel ?? null,
      details:     opts.details     ?? null,
      ip:          opts.ip          ?? null,
    });
  } catch (err) {
    logger.error({ err }, 'audit log insert failed');
  }
}

function clientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket?.remoteAddress ??
    'unknown'
  );
}

// ── Seed super admin from env vars (runs once, idempotent) ───────────────────

async function ensureSuperAdmin(): Promise<void> {
  const existing = await db
    .select({ id: adminAccountsTable.id })
    .from(adminAccountsTable)
    .where(eq(adminAccountsTable.email, BOOTSTRAP_EMAIL))
    .limit(1);

  if (existing.length === 0) {
    const pinHash = await hashPin(BOOTSTRAP_PIN);
    await db.insert(adminAccountsTable).values({
      name:    'Super Admin',
      email:   BOOTSTRAP_EMAIL,
      role:    'super_admin',
      pinHash,
      status:  'active',
    });
    logger.info({ email: BOOTSTRAP_EMAIL }, 'Super admin account seeded from env vars');
  }
}

// ── POST /api/admin/session ───────────────────────────────────────────────────
// No requireAdmin — this IS the login endpoint.

router.post('/session', async (req: Request, res: Response): Promise<void> => {
  const { email, pin } = req.body as { email?: string; pin?: string };

  if (!email || !pin) {
    res.status(400).json({ error: 'Email and PIN are required.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Seed on first use
    await ensureSuperAdmin();

    const [account] = await db
      .select()
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.email, normalizedEmail))
      .limit(1);

    if (!account) {
      res.status(401).json({ error: 'Invalid admin credentials.' });
      return;
    }

    if (account.status === 'disabled') {
      res.status(403).json({ error: 'This admin account has been disabled.' });
      return;
    }

    const pinOk = await verifyPin(pin, account.pinHash);
    if (!pinOk) {
      void auditLog({
        adminId:    account.id,
        adminEmail: account.email,
        action:     'login_failed',
        targetType: 'session',
        ip:         clientIp(req),
      });
      db.execute(sql`
        INSERT INTO admin_login_history (admin_id, admin_email, ip_address, user_agent, status, fail_reason)
        VALUES (${account.id}, ${account.email}, ${clientIp(req)},
                ${(req.headers['user-agent'] as string | undefined) ?? null},
                'failed', 'Invalid PIN')
      `).catch(() => {});
      res.status(401).json({ error: 'Invalid admin credentials.' });
      return;
    }

    // Update last login
    await db
      .update(adminAccountsTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(adminAccountsTable.id, account.id));

    req.session.isAdmin   = true;
    req.session.adminId   = account.id;
    req.session.adminRole = account.role;

    db.execute(sql`
      INSERT INTO admin_login_history (admin_id, admin_email, ip_address, user_agent, status)
      VALUES (${account.id}, ${account.email}, ${clientIp(req)},
              ${(req.headers['user-agent'] as string | undefined) ?? null},
              'success')
    `).catch(() => {});

    void auditLog({
      adminId:    account.id,
      adminEmail: account.email,
      action:     'login',
      targetType: 'session',
      ip:         clientIp(req),
    });

    res.json({
      ok:    true,
      id:    account.id,
      name:  account.name,
      email: account.email,
      role:  account.role,
    });
  } catch (err) {
    logger.error({ err }, 'admin/session POST failed');
    res.status(500).json({ error: 'Login failed.' });
  }
});

// ── DELETE /api/admin/session ─────────────────────────────────────────────────

router.delete('/session', requireAdmin, async (req: Request, res: Response): Promise<void> => {
  const adminId    = req.session.adminId!;
  const adminEmail = (await db
    .select({ email: adminAccountsTable.email })
    .from(adminAccountsTable)
    .where(eq(adminAccountsTable.id, adminId!))
    .limit(1))[0]?.email ?? 'unknown';

  void auditLog({ adminId, adminEmail, action: 'logout', targetType: 'session', ip: clientIp(req) });

  req.session.isAdmin   = false;
  req.session.adminId   = '';
  req.session.adminRole = 'admin'; // reset
  res.json({ ok: true });
});

// ── All routes below require admin session ────────────────────────────────────
router.use(requireAdmin);

// ── GET /api/admin/me ─────────────────────────────────────────────────────────

router.get('/me', async (req: Request, res: Response): Promise<void> => {
  try {
    const [account] = await db
      .select({
        id:          adminAccountsTable.id,
        name:        adminAccountsTable.name,
        email:       adminAccountsTable.email,
        role:        adminAccountsTable.role,
        status:      adminAccountsTable.status,
        lastLoginAt: adminAccountsTable.lastLoginAt,
        createdAt:   adminAccountsTable.createdAt,
      })
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.id, req.session.adminId!))
      .limit(1);

    if (!account) {
      res.status(404).json({ error: 'Admin account not found.' });
      return;
    }

    res.json(account);
  } catch (err) {
    logger.error({ err }, 'admin/me failed');
    res.status(500).json({ error: 'Failed to load profile.' });
  }
});

// ── PATCH /api/admin/me ────────────────────────────────────────────────────────
// Update own profile (name / email).

router.patch('/me', async (req: Request, res: Response): Promise<void> => {
  const { name, email } = req.body as { name?: string; email?: string };
  if (!name?.trim() && !email?.trim()) {
    res.status(400).json({ error: 'Provide name or email to update.' });
    return;
  }

  try {
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name?.trim())  updates['name']  = name.trim();
    if (email?.trim()) updates['email'] = email.trim().toLowerCase();

    const [updated] = await db
      .update(adminAccountsTable)
      .set(updates as Partial<InsertAdminAccount>)
      .where(eq(adminAccountsTable.id, req.session.adminId!))
      .returning({ id: adminAccountsTable.id, name: adminAccountsTable.name, email: adminAccountsTable.email });

    if (!updated) { res.status(404).json({ error: 'Account not found.' }); return; }

    void auditLog({
      adminId:    req.session.adminId!,
      adminEmail: updated.email,
      action:     'profile_updated',
      targetType: 'admin',
      targetId:   updated.id,
      ip:         clientIp(req),
    });

    res.json({ ok: true, ...updated });
  } catch (err) {
    logger.error({ err }, 'admin/me PATCH failed');
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

// ── PATCH /api/admin/me/pin ────────────────────────────────────────────────────
// Change own PIN.

router.patch('/me/pin', async (req: Request, res: Response): Promise<void> => {
  const { currentPin, newPin } = req.body as { currentPin?: string; newPin?: string };

  if (!currentPin || !newPin || newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
    res.status(400).json({ error: 'currentPin and a 6-digit newPin are required.' });
    return;
  }

  try {
    const [account] = await db
      .select()
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.id, req.session.adminId!))
      .limit(1);

    if (!account) { res.status(404).json({ error: 'Account not found.' }); return; }

    const currentOk = await verifyPin(currentPin, account.pinHash);
    if (!currentOk) {
      res.status(401).json({ error: 'Current PIN is incorrect.' });
      return;
    }

    if (currentPin === newPin) {
      res.status(400).json({ error: 'New PIN must differ from current PIN.' });
      return;
    }

    const newHash = await hashPin(newPin);
    await db
      .update(adminAccountsTable)
      .set({ pinHash: newHash, updatedAt: new Date() })
      .where(eq(adminAccountsTable.id, account.id));

    void auditLog({
      adminId:    account.id,
      adminEmail: account.email,
      action:     'pin_changed',
      targetType: 'admin',
      targetId:   account.id,
      ip:         clientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'admin/me/pin PATCH failed');
    res.status(500).json({ error: 'Failed to change PIN.' });
  }
});

// ── GET /api/admin/stats ──────────────────────────────────────────────────────

router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [u, t, r, w] = await Promise.all([
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
      db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE type != 'wallet_fund')::int                            AS total,
          COUNT(*) FILTER (WHERE type != 'wallet_fund' AND status = 'success')::int     AS successful,
          COUNT(*) FILTER (WHERE type != 'wallet_fund' AND status = 'pending')::int     AS pending,
          COUNT(*) FILTER (WHERE type != 'wallet_fund' AND status = 'failed')::int      AS failed
        FROM transactions
      `),
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
      .returning({ id: usersTable.id, name: usersTable.name });

    if (!updated) { res.status(404).json({ error: 'User not found.' }); return; }

    void auditLog({
      adminId:     req.session.adminId!,
      adminEmail:  req.session.adminId!, // resolved below
      action:      'user_status_changed',
      targetType:  'user',
      targetId:    id,
      targetLabel: updated.name,
      details:     { newStatus: status },
      ip:          clientIp(req),
    });

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
    const phone  = String(req.query['phone']  ?? '').trim();
    const from   = req.query['from'] as string | undefined;
    const to     = req.query['to']   as string | undefined;
    const page   = Math.max(1, Number(req.query['page']  ?? 1));
    const limit  = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 50)));
    const offset = (page - 1) * limit;

    let cond = sql`1=1`;
    if (search)           cond = sql`${cond} AND (u.name ILIKE ${`%${search}%`} OR t.reference ILIKE ${`%${search}%`} OR t.provider ILIKE ${`%${search}%`})`;
    if (phone)            cond = sql`${cond} AND u.phone ILIKE ${`%${phone}%`}`;
    if (status !== 'all') cond = sql`${cond} AND t.status = ${status}`;
    if (type   !== 'all') cond = sql`${cond} AND t.type   = ${type}`;
    if (from)             cond = sql`${cond} AND t.created_at >= ${from}::timestamptz`;
    if (to)               cond = sql`${cond} AND t.created_at <= ${to}::timestamptz + interval '1 day'`;

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

// ═════════════════════════════════════════════════════════════════════════════
// SUPER ADMIN ONLY ROUTES — require role === 'super_admin'
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /api/admin/admins ─────────────────────────────────────────────────────

router.get('/admins', requireSuperAdmin, async (_req: Request, res: Response): Promise<void> => {
  try {
    const accounts = await db
      .select({
        id:          adminAccountsTable.id,
        name:        adminAccountsTable.name,
        email:       adminAccountsTable.email,
        role:        adminAccountsTable.role,
        status:      adminAccountsTable.status,
        lastLoginAt: adminAccountsTable.lastLoginAt,
        createdAt:   adminAccountsTable.createdAt,
        createdBy:   adminAccountsTable.createdBy,
      })
      .from(adminAccountsTable)
      .orderBy(adminAccountsTable.createdAt);

    res.json({ admins: accounts });
  } catch (err) {
    logger.error({ err }, 'admin/admins GET failed');
    res.status(500).json({ error: 'Failed to load admin accounts.' });
  }
});

// ── POST /api/admin/admins ────────────────────────────────────────────────────

router.post('/admins', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const { name, email, role, pin } = req.body as {
    name?: string; email?: string; role?: string; pin?: string;
  };

  if (!name?.trim() || !email?.trim() || !pin) {
    res.status(400).json({ error: 'name, email, and pin are required.' });
    return;
  }
  if (pin.length !== 6 || !/^\d{6}$/.test(pin)) {
    res.status(400).json({ error: 'PIN must be exactly 6 digits.' });
    return;
  }
  if (role === 'super_admin') {
    res.status(403).json({ error: 'Cannot create additional super admin accounts via API.' });
    return;
  }

  try {
    const existing = await db
      .select({ id: adminAccountsTable.id })
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.email, email.trim().toLowerCase()))
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({ error: 'An admin with this email already exists.' });
      return;
    }

    const pinHash = await hashPin(pin);
    const [created] = await db
      .insert(adminAccountsTable)
      .values({
        name:      name.trim(),
        email:     email.trim().toLowerCase(),
        // Accept all valid non-super-admin roles; default to 'admin' if unrecognised
        role: (['admin', 'customer_care', 'finance', 'supervisor', 'technical_support'].includes(role ?? '')
          ? role as 'admin' | 'customer_care' | 'finance' | 'supervisor' | 'technical_support'
          : 'admin'),
        pinHash,
        status:    'active',
        createdBy: req.session.adminId!,
      })
      .returning();

    const creatorEmail = (await db
      .select({ email: adminAccountsTable.email })
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.id, req.session.adminId!))
      .limit(1))[0]?.email ?? 'unknown';

    void auditLog({
      adminId:     req.session.adminId!,
      adminEmail:  creatorEmail,
      action:      'admin_created',
      targetType:  'admin',
      targetId:    created.id,
      targetLabel: created.name,
      details:     { role: created.role },
      ip:          clientIp(req),
    });

    res.status(201).json({
      id:       created.id,
      name:     created.name,
      email:    created.email,
      role:     created.role,
      status:   created.status,
    });
  } catch (err) {
    logger.error({ err }, 'admin/admins POST failed');
    res.status(500).json({ error: 'Failed to create admin account.' });
  }
});

// ── PATCH /api/admin/admins/:id ────────────────────────────────────────────────
// Update name / email / role (not PIN — separate endpoint for that).

router.patch('/admins/:id', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { name, email, role } = req.body as { name?: string; email?: string; role?: string };

  try {
    const [target] = await db
      .select()
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.id, id))
      .limit(1);

    if (!target) { res.status(404).json({ error: 'Admin not found.' }); return; }

    // Prevent changing the super admin's role
    if (target.role === 'super_admin' && role && role !== 'super_admin') {
      res.status(403).json({ error: 'Cannot change the super admin role.' });
      return;
    }
    // Prevent promoting to super_admin via this endpoint
    if (role === 'super_admin' && target.role !== 'super_admin') {
      res.status(403).json({ error: 'Cannot promote to super admin via this endpoint.' });
      return;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name?.trim())  updates['name']  = name.trim();
    if (email?.trim()) updates['email'] = email.trim().toLowerCase();
    if (role === 'admin') updates['role'] = 'admin';

    const [updated] = await db
      .update(adminAccountsTable)
      .set(updates as Partial<InsertAdminAccount>)
      .where(eq(adminAccountsTable.id, id))
      .returning();

    const actorEmail = (await db
      .select({ email: adminAccountsTable.email })
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.id, req.session.adminId!))
      .limit(1))[0]?.email ?? 'unknown';

    void auditLog({
      adminId:     req.session.adminId!,
      adminEmail:  actorEmail,
      action:      'admin_updated',
      targetType:  'admin',
      targetId:    id,
      targetLabel: updated.name,
      details:     { name: updated.name, email: updated.email, role: updated.role },
      ip:          clientIp(req),
    });

    res.json({ ok: true, id: updated.id, name: updated.name, email: updated.email, role: updated.role });
  } catch (err) {
    logger.error({ err }, 'admin/admins/:id PATCH failed');
    res.status(500).json({ error: 'Failed to update admin.' });
  }
});

// ── PATCH /api/admin/admins/:id/status ────────────────────────────────────────

router.patch('/admins/:id/status', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id }     = req.params as { id: string };
  const { status } = req.body as { status?: string };

  if (!['active', 'disabled'].includes(status ?? '')) {
    res.status(400).json({ error: 'status must be active or disabled.' });
    return;
  }

  try {
    const [target] = await db
      .select()
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.id, id))
      .limit(1);

    if (!target) { res.status(404).json({ error: 'Admin not found.' }); return; }
    if (target.role === 'super_admin') {
      res.status(403).json({ error: 'Cannot disable the super admin account.' });
      return;
    }
    // Prevent self-disable
    if (id === req.session.adminId!) {
      res.status(400).json({ error: 'Cannot change your own account status.' });
      return;
    }

    const [updated] = await db
      .update(adminAccountsTable)
      .set({ status: status as 'active' | 'disabled', updatedAt: new Date() })
      .where(eq(adminAccountsTable.id, id))
      .returning({ id: adminAccountsTable.id, name: adminAccountsTable.name });

    const actorEmail = (await db
      .select({ email: adminAccountsTable.email })
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.id, req.session.adminId!))
      .limit(1))[0]?.email ?? 'unknown';

    void auditLog({
      adminId:     req.session.adminId!,
      adminEmail:  actorEmail,
      action:      status === 'disabled' ? 'admin_disabled' : 'admin_enabled',
      targetType:  'admin',
      targetId:    id,
      targetLabel: updated.name,
      details:     { status },
      ip:          clientIp(req),
    });

    res.json({ ok: true, status });
  } catch (err) {
    logger.error({ err }, 'admin/admins/:id/status PATCH failed');
    res.status(500).json({ error: 'Failed to update admin status.' });
  }
});

// ── PATCH /api/admin/admins/:id/pin ───────────────────────────────────────────
// Super admin can reset any admin's PIN without knowing the current one.

router.patch('/admins/:id/pin', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id }     = req.params as { id: string };
  const { newPin } = req.body as { newPin?: string };

  if (!newPin || newPin.length !== 6 || !/^\d{6}$/.test(newPin)) {
    res.status(400).json({ error: 'newPin must be exactly 6 digits.' });
    return;
  }

  try {
    const [target] = await db
      .select()
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.id, id))
      .limit(1);

    if (!target) { res.status(404).json({ error: 'Admin not found.' }); return; }

    const pinHash = await hashPin(newPin);
    await db
      .update(adminAccountsTable)
      .set({ pinHash, updatedAt: new Date() })
      .where(eq(adminAccountsTable.id, id));

    const actorEmail = (await db
      .select({ email: adminAccountsTable.email })
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.id, req.session.adminId!))
      .limit(1))[0]?.email ?? 'unknown';

    void auditLog({
      adminId:     req.session.adminId!,
      adminEmail:  actorEmail,
      action:      'admin_pin_reset',
      targetType:  'admin',
      targetId:    id,
      targetLabel: target.name,
      ip:          clientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'admin/admins/:id/pin PATCH failed');
    res.status(500).json({ error: 'Failed to reset PIN.' });
  }
});

// ── DELETE /api/admin/admins/:id ──────────────────────────────────────────────

router.delete('/admins/:id', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  try {
    const [target] = await db
      .select()
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.id, id))
      .limit(1);

    if (!target) { res.status(404).json({ error: 'Admin not found.' }); return; }
    if (target.role === 'super_admin') {
      res.status(403).json({ error: 'Cannot delete the super admin account.' });
      return;
    }
    if (id === req.session.adminId!) {
      res.status(400).json({ error: 'Cannot delete your own account.' });
      return;
    }

    await db.delete(adminAccountsTable).where(eq(adminAccountsTable.id, id));

    const actorEmail = (await db
      .select({ email: adminAccountsTable.email })
      .from(adminAccountsTable)
      .where(eq(adminAccountsTable.id, req.session.adminId!))
      .limit(1))[0]?.email ?? 'unknown';

    void auditLog({
      adminId:     req.session.adminId!,
      adminEmail:  actorEmail,
      action:      'admin_deleted',
      targetType:  'admin',
      targetId:    id,
      targetLabel: target.name,
      ip:          clientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'admin/admins/:id DELETE failed');
    res.status(500).json({ error: 'Failed to delete admin.' });
  }
});

// ── GET /api/admin/audit-logs ─────────────────────────────────────────────────

router.get('/audit-logs', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const page   = Math.max(1, Number(req.query['page']  ?? 1));
    const limit  = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 50)));
    const offset = (page - 1) * limit;
    const adminFilter = req.query['adminId'] as string | undefined;

    const [countRes, rowRes] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS total FROM admin_audit_logs
        ${adminFilter ? sql`WHERE admin_id = ${adminFilter}` : sql``}
      `),
      db.execute(sql`
        SELECT id, admin_id, admin_email, action, target_type, target_id, target_label, details, ip, created_at
        FROM admin_audit_logs
        ${adminFilter ? sql`WHERE admin_id = ${adminFilter}` : sql``}
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
    ]);

    const total = Number((countRes.rows[0] as Record<string, unknown>)['total']);

    res.json({
      logs: rowRes.rows.map((r: Record<string, unknown>) => ({
        id:          String(r['id']),
        adminId:     String(r['admin_id']),
        adminEmail:  String(r['admin_email']),
        action:      String(r['action']),
        targetType:  r['target_type'] ? String(r['target_type']) : null,
        targetId:    r['target_id']   ? String(r['target_id'])   : null,
        targetLabel: r['target_label'] ? String(r['target_label']) : null,
        details:     r['details'] ?? null,
        ip:          r['ip'] ? String(r['ip']) : null,
        createdAt:   String(r['created_at']),
      })),
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    logger.error({ err }, 'admin/audit-logs failed');
    res.status(500).json({ error: 'Failed to load audit logs.' });
  }
});

export default router;
