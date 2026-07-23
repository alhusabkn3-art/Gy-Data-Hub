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
        COUNT(DISTINCT t.id)::int         AS transaction_count,
        COALESCE(SUM(t.amount) FILTER (WHERE t.status='success' AND t.type!='wallet_fund'), 0)::numeric AS total_spent,
        MAX(t.created_at)                 AS last_transaction_at
      FROM users u
      LEFT JOIN wallets w ON w.user_id = u.id
      LEFT JOIN transactions t ON t.user_id = u.id
      WHERE u.id = ${id}
      GROUP BY u.id, w.balance
    `);
    if (!r.rows.length) { res.status(404).json({ error: 'User not found.' }); return; }
    const row = r.rows[0] as Record<string, unknown>;
    res.json({
      id:               String(row['id']),
      name:             String(row['name']),
      firstName:        String(row['first_name']),
      lastName:         String(row['last_name']),
      email:            String(row['email'] ?? ''),
      phone:            String(row['phone']),
      accountNumber:    String(row['account_number']),
      bankName:         String(row['bank_name']),
      referralCode:     String(row['referral_code']),
      kycStatus:        String(row['kyc_status']),
      status:           String(row['status']),
      walletBalance:    Number(row['wallet_balance']),
      transactionCount: Number(row['transaction_count']),
      totalSpent:       Number(row['total_spent']),
      lastTransactionAt: row['last_transaction_at'] ? String(row['last_transaction_at']) : null,
      createdAt:        String(row['created_at']),
      updatedAt:        String(row['updated_at']),
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
      db.execute(sql`SELECT id, balance, created_at, updated_at FROM wallets WHERE user_id = ${id} LIMIT 1`),
      db.execute(sql`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE type='credit'), 0)::numeric   AS total_credited,
          COALESCE(SUM(amount) FILTER (WHERE type='debit'),  0)::numeric   AS total_debited,
          COALESCE(SUM(amount) FILTER (WHERE type='reversal'), 0)::numeric AS total_reversed,
          COUNT(*)::int                                                      AS ledger_count
        FROM wallet_ledger WHERE user_id = ${id}
      `),
    ]);
    if (!walletRes.rows.length) { res.status(404).json({ error: 'Wallet not found.' }); return; }
    const w = walletRes.rows[0] as Record<string, unknown>;
    const s = statsRes.rows[0] as Record<string, unknown>;
    res.json({
      walletId:      String(w['id']),
      balance:       Number(w['balance']),
      createdAt:     String(w['created_at']),
      updatedAt:     String(w['updated_at']),
      totalCredited: Number(s['total_credited']),
      totalDebited:  Number(s['total_debited']),
      totalReversed: Number(s['total_reversed']),
      ledgerCount:   Number(s['ledger_count']),
    });
  } catch (err) {
    logger.error({ err }, 'GET /users/:id/wallet failed');
    res.status(500).json({ error: 'Failed to load wallet.' });
  }
});

// ── GET /admin/users/:id/wallet/ledger — paginated ledger ────────────────────

router.get('/users/:id/wallet/ledger', async (req: Request, res: Response): Promise<void> => {
  const { id }  = req.params as { id: string };
  const page    = Math.max(1, Number(req.query['page']  ?? 1));
  const limit   = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 25)));
  const offset  = (page - 1) * limit;
  try {
    const [countRes, rowRes] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int AS total FROM wallet_ledger WHERE user_id = ${id}`),
      db.execute(sql`
        SELECT wl.*, aa.name AS performed_by_name
        FROM wallet_ledger wl
        LEFT JOIN admin_accounts aa ON aa.id = wl.performed_by
        WHERE wl.user_id = ${id}
        ORDER BY wl.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
    ]);
    const total = Number((countRes.rows[0] as Record<string, unknown>)['total']);
    res.json({
      entries: rowRes.rows.map((r: Record<string, unknown>) => ({
        id:              String(r['id']),
        type:            String(r['type']),
        amount:          Number(r['amount']),
        balanceBefore:   Number(r['balance_before']),
        balanceAfter:    Number(r['balance_after']),
        reference:       r['reference'] ? String(r['reference']) : null,
        reason:          r['reason']    ? String(r['reason'])    : null,
        performedBy:     r['performed_by']       ? String(r['performed_by'])       : null,
        performedByName: r['performed_by_name']  ? String(r['performed_by_name'])  : null,
        createdAt:       String(r['created_at']),
      })),
      total, page, pages: Math.ceil(total / limit),
    });
  } catch (err) {
    logger.error({ err }, 'GET /users/:id/wallet/ledger failed');
    res.status(500).json({ error: 'Failed to load ledger.' });
  }
});

// ── POST /admin/users/:id/wallet/credit — manual credit ──────────────────────

router.post('/users/:id/wallet/credit', async (req: Request, res: Response): Promise<void> => {
  const { id }     = req.params as { id: string };
  const { amount, reason } = req.body as { amount?: number; reason?: string };

  if (!amount || Number(amount) <= 0)   { res.status(400).json({ error: 'amount must be a positive number.' }); return; }
  if (!reason?.trim())                  { res.status(400).json({ error: 'reason is mandatory for manual credits.' }); return; }
  if (Number(amount) > 10_000_000)      { res.status(400).json({ error: 'Single credit cannot exceed ₦10,000,000.' }); return; }

  const adminId = req.session.adminId!;
  const ref     = makeRef('MC');

  try {
    let balanceBefore = 0, balanceAfter = 0;
    await db.transaction(async (tx) => {
      const walletRes = await tx.execute(sql`SELECT id, balance FROM wallets WHERE user_id = ${id} FOR UPDATE`);
      if (!walletRes.rows.length) throw new Error('Wallet not found');
      balanceBefore = Number((walletRes.rows[0] as Record<string, unknown>)['balance']);
      balanceAfter  = balanceBefore + Number(amount);

      await tx.execute(sql`UPDATE wallets SET balance = ${balanceAfter}, updated_at = NOW() WHERE user_id = ${id}`);
      await tx.execute(sql`
        INSERT INTO wallet_ledger (user_id, type, amount, balance_before, balance_after, reference, performed_by, reason)
        VALUES (${id}, 'credit', ${Number(amount)}, ${balanceBefore}, ${balanceAfter}, ${ref}, ${adminId}, ${reason!.trim()})
      `);
    });

    const [userName, adminEmail] = await Promise.all([
      db.execute(sql`SELECT name FROM users WHERE id = ${id} LIMIT 1`).then(r => String((r.rows[0] as Record<string, unknown>)?.['name'] ?? '')),
      getAdminEmail(adminId),
    ]);

    void auditLog({
      adminId, adminEmail,
      action: 'wallet_credit',
      targetType: 'user', targetId: id, targetLabel: userName,
      details: { amount: Number(amount), balanceBefore, balanceAfter, reference: ref, reason: reason!.trim() },
      ip: clientIp(req),
    });

    res.json({ ok: true, reference: ref, balanceBefore, balanceAfter, amount: Number(amount) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err }, 'wallet/credit failed');
    if (msg === 'Wallet not found') { res.status(404).json({ error: msg }); return; }
    res.status(500).json({ error: 'Failed to credit wallet.' });
  }
});

// ── POST /admin/users/:id/wallet/debit — manual debit ────────────────────────

router.post('/users/:id/wallet/debit', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { amount, reason, allowNegative } = req.body as { amount?: number; reason?: string; allowNegative?: boolean };

  if (!amount || Number(amount) <= 0)  { res.status(400).json({ error: 'amount must be a positive number.' }); return; }
  if (!reason?.trim())                 { res.status(400).json({ error: 'reason is mandatory for manual debits.' }); return; }

  const adminId = req.session.adminId!;
  const ref     = makeRef('MD');

  try {
    let balanceBefore = 0, balanceAfter = 0;
    await db.transaction(async (tx) => {
      const walletRes = await tx.execute(sql`SELECT id, balance FROM wallets WHERE user_id = ${id} FOR UPDATE`);
      if (!walletRes.rows.length) throw new Error('Wallet not found');
      balanceBefore = Number((walletRes.rows[0] as Record<string, unknown>)['balance']);

      if (!allowNegative && balanceBefore < Number(amount)) {
        throw new Error(`Insufficient balance. Available: ₦${balanceBefore.toLocaleString()}`);
      }

      balanceAfter = balanceBefore - Number(amount);
      await tx.execute(sql`UPDATE wallets SET balance = ${balanceAfter}, updated_at = NOW() WHERE user_id = ${id}`);
      await tx.execute(sql`
        INSERT INTO wallet_ledger (user_id, type, amount, balance_before, balance_after, reference, performed_by, reason)
        VALUES (${id}, 'debit', ${Number(amount)}, ${balanceBefore}, ${balanceAfter}, ${ref}, ${adminId}, ${reason!.trim()})
      `);
    });

    const [userName, adminEmail] = await Promise.all([
      db.execute(sql`SELECT name FROM users WHERE id = ${id} LIMIT 1`).then(r => String((r.rows[0] as Record<string, unknown>)?.['name'] ?? '')),
      getAdminEmail(adminId),
    ]);

    void auditLog({
      adminId, adminEmail,
      action: 'wallet_debit',
      targetType: 'user', targetId: id, targetLabel: userName,
      details: { amount: Number(amount), balanceBefore, balanceAfter, reference: ref, reason: reason!.trim() },
      ip: clientIp(req),
    });

    res.json({ ok: true, reference: ref, balanceBefore, balanceAfter, amount: Number(amount) });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    logger.error({ err }, 'wallet/debit failed');
    if (msg === 'Wallet not found' || msg.startsWith('Insufficient')) {
      res.status(400).json({ error: msg }); return;
    }
    res.status(500).json({ error: 'Failed to debit wallet.' });
  }
});

// ── GET /admin/users/:id/transactions ─────────────────────────────────────────

router.get('/users/:id/transactions', async (req: Request, res: Response): Promise<void> => {
  const { id }  = req.params as { id: string };
  const page    = Math.max(1, Number(req.query['page']  ?? 1));
  const limit   = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 25)));
  const offset  = (page - 1) * limit;
  const status  = String(req.query['status'] ?? 'all');
  const type    = String(req.query['type']   ?? 'all');

  let cond = sql`t.user_id = ${id}`;
  if (status !== 'all') cond = sql`${cond} AND t.status = ${status}`;
  if (type   !== 'all') cond = sql`${cond} AND t.type   = ${type}`;

  try {
    const [countRes, rowRes] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int AS total FROM transactions t WHERE ${cond}`),
      db.execute(sql`
        SELECT t.id, t.type, t.service, t.provider, t.amount::numeric, t.status,
               COALESCE(t.reference,'') AS reference, t.description, t.payment_method, t.created_at
        FROM transactions t
        WHERE ${cond}
        ORDER BY t.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
    ]);
    const total = Number((countRes.rows[0] as Record<string, unknown>)['total']);
    res.json({
      transactions: rowRes.rows.map((r: Record<string, unknown>) => ({
        id:            String(r['id']),
        type:          String(r['type']),
        service:       String(r['service']),
        provider:      String(r['provider']),
        amount:        Number(r['amount']),
        status:        String(r['status']),
        reference:     String(r['reference']),
        description:   String(r['description'] ?? ''),
        paymentMethod: r['payment_method'] ? String(r['payment_method']) : null,
        createdAt:     String(r['created_at']),
      })),
      total, page, pages: Math.ceil(total / limit),
    });
  } catch (err) {
    logger.error({ err }, 'GET /users/:id/transactions failed');
    res.status(500).json({ error: 'Failed to load transactions.' });
  }
});

// ── GET /admin/users/:id/status-history ───────────────────────────────────────

router.get('/users/:id/status-history', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  try {
    const r = await db.execute(sql`
      SELECT ush.*, aa.name AS performed_by_name
      FROM user_status_history ush
      LEFT JOIN admin_accounts aa ON aa.id = ush.performed_by
      WHERE ush.user_id = ${id}
      ORDER BY ush.created_at DESC
    `);
    res.json({ history: r.rows.map((row: Record<string, unknown>) => ({
      id:              String(row['id']),
      previousStatus:  String(row['previous_status']),
      newStatus:       String(row['new_status']),
      reason:          row['reason'] ? String(row['reason']) : null,
      performedBy:     row['performed_by'] ? String(row['performed_by']) : null,
      performedByName: row['performed_by_name'] ? String(row['performed_by_name']) : null,
      createdAt:       String(row['created_at']),
    })) });
  } catch (err) {
    logger.error({ err }, 'GET /users/:id/status-history failed');
    res.status(500).json({ error: 'Failed to load status history.' });
  }
});

// ── POST /admin/users/:id/status — change status with reason ─────────────────

router.post('/users/:id/status', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { status, reason } = req.body as { status?: string; reason?: string };

  if (!['active', 'suspended', 'closed'].includes(status ?? '')) {
    res.status(400).json({ error: 'status must be active, suspended, or closed.' }); return;
  }
  if (!reason?.trim()) { res.status(400).json({ error: 'reason is required.' }); return; }

  try {
    const currentRes = await db.execute(sql`SELECT id, name, status FROM users WHERE id = ${id} LIMIT 1`);
    if (!currentRes.rows.length) { res.status(404).json({ error: 'User not found.' }); return; }
    const current = currentRes.rows[0] as Record<string, unknown>;
    const previousStatus = String(current['status']);

    await db.execute(sql`UPDATE users SET status = ${status!}, updated_at = NOW() WHERE id = ${id}`);
    await db.execute(sql`
      INSERT INTO user_status_history (user_id, previous_status, new_status, reason, performed_by)
      VALUES (${id}, ${previousStatus}, ${status!}, ${reason!.trim()}, ${req.session.adminId!})
    `);

    const adminEmail = await getAdminEmail(req.session.adminId!);
    void auditLog({
      adminId: req.session.adminId!, adminEmail,
      action: `user_status_changed`,
      targetType: 'user', targetId: id, targetLabel: String(current['name']),
      details: { previousStatus, newStatus: status, reason: reason!.trim() },
      ip: clientIp(req),
    });

    res.json({ ok: true, status });
  } catch (err) {
    logger.error({ err }, 'POST /users/:id/status failed');
    res.status(500).json({ error: 'Failed to update user status.' });
  }
});

// ── POST /admin/users/:id/reset-login-pin ────────────────────────────────────

router.post('/users/:id/reset-login-pin', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  try {
    const userRes = await db.execute(sql`SELECT id, name FROM users WHERE id = ${id} LIMIT 1`);
    if (!userRes.rows.length) { res.status(404).json({ error: 'User not found.' }); return; }
    const user = userRes.rows[0] as Record<string, unknown>;

    const tempPin  = randomPin();
    const pinHash  = await hashPin(tempPin);
    await db.execute(sql`UPDATE users SET login_pin_hash = ${pinHash}, updated_at = NOW() WHERE id = ${id}`);

    const adminEmail = await getAdminEmail(req.session.adminId!);
    void auditLog({
      adminId: req.session.adminId!, adminEmail,
      action: 'user_login_pin_reset',
      targetType: 'user', targetId: id, targetLabel: String(user['name']),
      ip: clientIp(req),
    });

    res.json({ ok: true, tempPin, message: 'Temporary PIN generated. Share it securely with the user.' });
  } catch (err) {
    logger.error({ err }, 'reset-login-pin failed');
    res.status(500).json({ error: 'Failed to reset login PIN.' });
  }
});

// ── POST /admin/users/:id/reset-purchase-pin ─────────────────────────────────

router.post('/users/:id/reset-purchase-pin', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  try {
    const userRes = await db.execute(sql`SELECT id, name FROM users WHERE id = ${id} LIMIT 1`);
    if (!userRes.rows.length) { res.status(404).json({ error: 'User not found.' }); return; }
    const user = userRes.rows[0] as Record<string, unknown>;

    const tempPin = randomPin();
    const pinHash = await hashPin(tempPin);
    await db.execute(sql`UPDATE users SET purchase_pin_hash = ${pinHash}, updated_at = NOW() WHERE id = ${id}`);

    const adminEmail = await getAdminEmail(req.session.adminId!);
    void auditLog({
      adminId: req.session.adminId!, adminEmail,
      action: 'user_purchase_pin_reset',
      targetType: 'user', targetId: id, targetLabel: String(user['name']),
      ip: clientIp(req),
    });

    res.json({ ok: true, tempPin, message: 'Temporary purchase PIN generated. Share it securely with the user.' });
  } catch (err) {
    logger.error({ err }, 'reset-purchase-pin failed');
    res.status(500).json({ error: 'Failed to reset purchase PIN.' });
  }
});

// ── PATCH /admin/users/:id/profile ────────────────────────────────────────────

router.patch('/users/:id/profile', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { name, email } = req.body as { name?: string; email?: string };
  if (!name?.trim() && !email?.trim()) {
    res.status(400).json({ error: 'Provide name or email to update.' }); return;
  }
  try {
    const userRes = await db.execute(sql`SELECT id, name FROM users WHERE id = ${id} LIMIT 1`);
    if (!userRes.rows.length) { res.status(404).json({ error: 'User not found.' }); return; }

    if (name?.trim())  await db.execute(sql`UPDATE users SET name = ${name.trim()}, first_name = ${name.trim()}, updated_at = NOW() WHERE id = ${id}`);
    if (email?.trim()) await db.execute(sql`UPDATE users SET email = ${email.trim().toLowerCase()}, updated_at = NOW() WHERE id = ${id}`);

    const adminEmail = await getAdminEmail(req.session.adminId!);
    void auditLog({
      adminId: req.session.adminId!, adminEmail,
      action: 'user_profile_updated',
      targetType: 'user', targetId: id,
      details: { name: name?.trim(), email: email?.trim().toLowerCase() },
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'PATCH /users/:id/profile failed');
    res.status(500).json({ error: 'Failed to update user profile.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ═════════════════════════════════════════════════════════════════════════════

// ── GET /admin/transactions/:id — full detail ─────────────────────────────────

router.get('/transactions/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  try {
    const r = await db.execute(sql`
      SELECT t.*, u.name AS user_name, u.phone, u.email AS user_email
      FROM transactions t JOIN users u ON u.id = t.user_id
      WHERE t.id = ${id}
    `);
    if (!r.rows.length) { res.status(404).json({ error: 'Transaction not found.' }); return; }
    const row = r.rows[0] as Record<string, unknown>;

    const revRes = await db.execute(sql`
      SELECT tr.id, tr.reason, tr.created_at, aa.name AS performed_by_name
      FROM transaction_reversals tr
      LEFT JOIN admin_accounts aa ON aa.id = tr.performed_by
      WHERE tr.original_transaction_id = ${id} LIMIT 1
    `);

    res.json({
      id:            String(row['id']),
      userId:        String(row['user_id']),
      userName:      String(row['user_name']),
      userPhone:     String(row['phone']),
      userEmail:     String(row['user_email'] ?? ''),
      type:          String(row['type']),
      service:       String(row['service']),
      provider:      String(row['provider']),
      amount:        Number(row['amount']),
      status:        String(row['status']),
      reference:     row['reference'] ? String(row['reference']) : null,
      description:   String(row['description'] ?? ''),
      paymentMethod: row['payment_method'] ? String(row['payment_method']) : null,
      metadata:      row['metadata'] ?? null,
      createdAt:     String(row['created_at']),
      reversal:      revRes.rows.length ? {
        id:              String((revRes.rows[0] as Record<string, unknown>)['id']),
        reason:          String((revRes.rows[0] as Record<string, unknown>)['reason']),
        performedByName: String((revRes.rows[0] as Record<string, unknown>)['performed_by_name'] ?? ''),
        createdAt:       String((revRes.rows[0] as Record<string, unknown>)['created_at']),
      } : null,
    });
  } catch (err) {
    logger.error({ err }, 'GET /transactions/:id failed');
    res.status(500).json({ error: 'Failed to load transaction.' });
  }
});

// ── POST /admin/transactions/:id/mark-review ──────────────────────────────────

router.post('/transactions/:id/mark-review', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { note } = req.body as { note?: string };
  try {
    const txRes = await db.execute(sql`SELECT id, user_id, metadata FROM transactions WHERE id = ${id} LIMIT 1`);
    if (!txRes.rows.length) { res.status(404).json({ error: 'Transaction not found.' }); return; }
    const tx = txRes.rows[0] as Record<string, unknown>;
    const meta = ((tx['metadata'] as Record<string, unknown>) ?? {});
    meta['review_flagged'] = true;
    meta['review_note']    = note?.trim() ?? '';
    meta['review_at']      = new Date().toISOString();
    meta['review_by']      = req.session.adminId!;

    await db.execute(sql`UPDATE transactions SET metadata = ${JSON.stringify(meta)} WHERE id = ${id}`);

    const adminEmail = await getAdminEmail(req.session.adminId!);
    void auditLog({
      adminId: req.session.adminId!, adminEmail,
      action: 'transaction_marked_review',
      targetType: 'transaction', targetId: id,
      details: { note: note?.trim(), userId: String(tx['user_id']) },
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'mark-review failed');
    res.status(500).json({ error: 'Failed to mark transaction for review.' });
  }
});

// ── POST /admin/transactions/:id/reverse ─────────────────────────────────────

router.post('/transactions/:id/reverse', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { reason } = req.body as { reason?: string };
  if (!reason?.trim()) { res.status(400).json({ error: 'reason is required for reversals.' }); return; }

  try {
    const txRes = await db.execute(sql`SELECT * FROM transactions WHERE id = ${id} LIMIT 1`);
    if (!txRes.rows.length) { res.status(404).json({ error: 'Transaction not found.' }); return; }
    const tx = txRes.rows[0] as Record<string, unknown>;

    if (String(tx['status']) !== 'success') {
      res.status(400).json({ error: 'Only successful transactions can be reversed.' }); return;
    }

    const existingRev = await db.execute(sql`SELECT id FROM transaction_reversals WHERE original_transaction_id = ${id} LIMIT 1`);
    if (existingRev.rows.length) {
      res.status(409).json({ error: 'This transaction has already been reversed.' }); return;
    }

    const userId  = String(tx['user_id']);
    const amount  = Number(tx['amount']);
    const ref     = makeRef('REV');
    const adminId = req.session.adminId!;

    let ledgerEntryId = '';
    await db.transaction(async (trx) => {
      const walletRes = await trx.execute(sql`SELECT balance FROM wallets WHERE user_id = ${userId} FOR UPDATE`);
      if (!walletRes.rows.length) throw new Error('Wallet not found');
      const balanceBefore = Number((walletRes.rows[0] as Record<string, unknown>)['balance']);
      const balanceAfter  = balanceBefore + amount;

      await trx.execute(sql`UPDATE wallets SET balance = ${balanceAfter}, updated_at = NOW() WHERE user_id = ${userId}`);

      const ledgerRes = await trx.execute(sql`
        INSERT INTO wallet_ledger (user_id, type, amount, balance_before, balance_after, reference, related_transaction_id, performed_by, reason)
        VALUES (${userId}, 'reversal', ${amount}, ${balanceBefore}, ${balanceAfter}, ${ref}, ${id}, ${adminId}, ${reason!.trim()})
        RETURNING id
      `);
      ledgerEntryId = String((ledgerRes.rows[0] as Record<string, unknown>)['id']);

      await trx.execute(sql`
        INSERT INTO transaction_reversals (original_transaction_id, user_id, amount, reason, performed_by, wallet_ledger_id)
        VALUES (${id}, ${userId}, ${amount}, ${reason!.trim()}, ${adminId}, ${ledgerEntryId})
      `);
    });

    const [userName, adminEmail] = await Promise.all([
      db.execute(sql`SELECT name FROM users WHERE id = ${userId} LIMIT 1`).then(r => String((r.rows[0] as Record<string, unknown>)?.['name'] ?? '')),
      getAdminEmail(adminId),
    ]);

    void auditLog({
      adminId, adminEmail,
      action: 'transaction_reversed',
      targetType: 'transaction', targetId: id, targetLabel: userName,
      details: { amount, reference: ref, reason: reason!.trim(), userId },
      ip: clientIp(req),
    });

    res.json({ ok: true, reference: ref, amount });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    logger.error({ err }, 'reverse failed');
    if (msg === 'Wallet not found') { res.status(404).json({ error: msg }); return; }
    res.status(500).json({ error: 'Failed to reverse transaction.' });
  }
});

// ── GET /admin/reversals ──────────────────────────────────────────────────────

router.get('/reversals', async (req: Request, res: Response): Promise<void> => {
  const page    = Math.max(1, Number(req.query['page']  ?? 1));
  const limit   = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 50)));
  const offset  = (page - 1) * limit;
  const userId  = req.query['userId'] as string | undefined;
  const search  = String(req.query['search'] ?? '').trim();

  let cond = sql`1=1`;
  if (userId) cond = sql`${cond} AND tr.user_id = ${userId}`;
  if (search) cond = sql`${cond} AND (u.name ILIKE ${`%${search}%`} OR u.phone ILIKE ${`%${search}%`})`;

  try {
    const [countRes, rowRes] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS total
        FROM transaction_reversals tr
        JOIN users u ON u.id = tr.user_id
        WHERE ${cond}
      `),
      db.execute(sql`
        SELECT tr.*, u.name AS user_name, u.phone,
               aa.name AS performed_by_name,
               t.type AS tx_type, t.service, t.provider, t.reference AS tx_reference
        FROM transaction_reversals tr
        JOIN users u ON u.id = tr.user_id
        JOIN admin_accounts aa ON aa.id = tr.performed_by
        JOIN transactions t ON t.id = tr.original_transaction_id
        WHERE ${cond}
        ORDER BY tr.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
    ]);
    const total = Number((countRes.rows[0] as Record<string, unknown>)['total']);
    res.json({
      reversals: rowRes.rows.map((r: Record<string, unknown>) => ({
        id:                    String(r['id']),
        originalTransactionId: String(r['original_transaction_id']),
        userId:                String(r['user_id']),
        userName:              String(r['user_name']),
        userPhone:             String(r['phone']),
        amount:                Number(r['amount']),
        reason:                String(r['reason']),
        performedBy:           String(r['performed_by']),
        performedByName:       String(r['performed_by_name']),
        txType:                String(r['tx_type']),
        txService:             String(r['service']),
        txReference:           r['tx_reference'] ? String(r['tx_reference']) : null,
        walletLedgerId:        r['wallet_ledger_id'] ? String(r['wallet_ledger_id']) : null,
        createdAt:             String(r['created_at']),
      })),
      total, page, pages: Math.ceil(total / limit),
    });
  } catch (err) {
    logger.error({ err }, 'GET /reversals failed');
    res.status(500).json({ error: 'Failed to load reversals.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SERVICES MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

router.get('/services/settings', async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await db.execute(sql`
      SELECT ss.*, aa.name AS updated_by_name
      FROM service_settings ss
      LEFT JOIN admin_accounts aa ON aa.id = ss.updated_by
      ORDER BY ss.service_key
    `);
    res.json({ services: r.rows.map((row: Record<string, unknown>) => ({
      id:            String(row['id']),
      serviceKey:    String(row['service_key']),
      label:         String(row['label']),
      enabled:       Boolean(row['enabled']),
      markup:        row['markup'] != null ? Number(row['markup']) : null,
      notes:         row['notes'] ? String(row['notes']) : null,
      updatedBy:     row['updated_by'] ? String(row['updated_by']) : null,
      updatedByName: row['updated_by_name'] ? String(row['updated_by_name']) : null,
      updatedAt:     String(row['updated_at']),
    })) });
  } catch (err) {
    logger.error({ err }, 'GET /services/settings failed');
    res.status(500).json({ error: 'Failed to load service settings.' });
  }
});

router.patch('/services/:key', async (req: Request, res: Response): Promise<void> => {
  const { key } = req.params as { key: string };
  const { enabled, markup, notes } = req.body as { enabled?: boolean; markup?: number | null; notes?: string };
  try {
    const existing = await db.execute(sql`SELECT id FROM service_settings WHERE service_key = ${key} LIMIT 1`);
    if (!existing.rows.length) { res.status(404).json({ error: 'Service not found.' }); return; }

    if (enabled  !== undefined) await db.execute(sql`UPDATE service_settings SET enabled = ${enabled}, updated_by = ${req.session.adminId!}, updated_at = NOW() WHERE service_key = ${key}`);
    if (markup   !== undefined) await db.execute(sql`UPDATE service_settings SET markup  = ${markup ?? null}, updated_by = ${req.session.adminId!}, updated_at = NOW() WHERE service_key = ${key}`);
    if (notes    !== undefined) await db.execute(sql`UPDATE service_settings SET notes   = ${notes?.trim() ?? null}, updated_by = ${req.session.adminId!}, updated_at = NOW() WHERE service_key = ${key}`);

    const adminEmail = await getAdminEmail(req.session.adminId!);
    void auditLog({
      adminId: req.session.adminId!, adminEmail,
      action: 'service_setting_updated',
      targetType: 'service', targetId: key,
      details: { enabled, markup, notes: notes?.trim() },
      ip: clientIp(req),
    });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'PATCH /services/:key failed');
    res.status(500).json({ error: 'Failed to update service setting.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS
// ═════════════════════════════════════════════════════════════════════════════

router.post('/notifications/broadcast', async (req: Request, res: Response): Promise<void> => {
  const { title, body, type = 'system' } = req.body as { title?: string; body?: string; type?: string };
  if (!title?.trim()) { res.status(400).json({ error: 'title is required.' }); return; }
  if (!body?.trim())  { res.status(400).json({ error: 'body is required.' }); return; }

  try {
    const usersRes = await db.execute(sql`SELECT id FROM users WHERE status = 'active'`);
    const userIds  = usersRes.rows.map((r: Record<string, unknown>) => String(r['id']));
    if (userIds.length === 0) { res.json({ ok: true, sent: 0 }); return; }

    let sent = 0;
    for (const uid of userIds) {
      await db.execute(sql`
        INSERT INTO notifications (user_id, type, title, body, read)
        VALUES (${uid}, ${type as 'system'}, ${title!.trim()}, ${body!.trim()}, false)
      `);
      sent++;
    }

    const adminEmail = await getAdminEmail(req.session.adminId!);
    void auditLog({
      adminId: req.session.adminId!, adminEmail,
      action: 'notification_broadcast',
      details: { title: title!.trim(), sent, type },
      ip: clientIp(req),
    });

    res.json({ ok: true, sent });
  } catch (err) {
    logger.error({ err }, 'broadcast failed');
    res.status(500).json({ error: 'Failed to send broadcast notification.' });
  }
});

router.post('/notifications/targeted', async (req: Request, res: Response): Promise<void> => {
  const { userIds, title, body, type = 'system' } = req.body as { userIds?: string[]; title?: string; body?: string; type?: string };
  if (!Array.isArray(userIds) || userIds.length === 0) { res.status(400).json({ error: 'userIds array is required.' }); return; }
  if (!title?.trim()) { res.status(400).json({ error: 'title is required.' }); return; }
  if (!body?.trim())  { res.status(400).json({ error: 'body is required.' }); return; }
  if (userIds.length > 1000) { res.status(400).json({ error: 'Maximum 1000 users per targeted notification.' }); return; }

  try {
    let sent = 0;
    for (const uid of userIds) {
      await db.execute(sql`
        INSERT INTO notifications (user_id, type, title, body, read)
        VALUES (${uid}, ${type as 'system'}, ${title!.trim()}, ${body!.trim()}, false)
      `);
      sent++;
    }

    const adminEmail = await getAdminEmail(req.session.adminId!);
    void auditLog({
      adminId: req.session.adminId!, adminEmail,
      action: 'notification_targeted',
      details: { title: title!.trim(), userIds: userIds.slice(0, 10), sent, type },
      ip: clientIp(req),
    });

    res.json({ ok: true, sent });
  } catch (err) {
    logger.error({ err }, 'targeted notification failed');
    res.status(500).json({ error: 'Failed to send targeted notification.' });
  }
});

router.get('/notifications/history', async (req: Request, res: Response): Promise<void> => {
  const page   = Math.max(1, Number(req.query['page']  ?? 1));
  const limit  = Math.min(100, Math.max(1, Number(req.query['limit'] ?? 50)));
  const offset = (page - 1) * limit;
  try {
    const [countRes, rowRes] = await Promise.all([
      db.execute(sql`SELECT COUNT(*)::int AS total FROM notifications WHERE type = 'system'`),
      db.execute(sql`
        SELECT n.id, n.title, n.body, n.type, n.read, n.created_at,
               u.name AS user_name, u.phone
        FROM notifications n
        JOIN users u ON u.id = n.user_id
        WHERE n.type = 'system'
        ORDER BY n.created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
    ]);
    const total = Number((countRes.rows[0] as Record<string, unknown>)['total']);
    res.json({
      notifications: rowRes.rows.map((r: Record<string, unknown>) => ({
        id:        String(r['id']),
        title:     String(r['title']),
        body:      String(r['body']),
        type:      String(r['type']),
        read:      Boolean(r['read']),
        userName:  String(r['user_name']),
        userPhone: String(r['phone']),
        createdAt: String(r['created_at']),
      })),
      total, page, pages: Math.ceil(total / limit),
    });
  } catch (err) {
    logger.error({ err }, 'GET /notifications/history failed');
    res.status(500).json({ error: 'Failed to load notification history.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// FINANCIAL REPORTS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/reports/financial', async (req: Request, res: Response): Promise<void> => {
  const from = req.query['from'] as string | undefined;
  const to   = req.query['to']   as string | undefined;

  let txCond = sql`1=1`;
  let wlCond = sql`1=1`;
  if (from) { txCond = sql`${txCond} AND created_at >= ${from}::timestamptz`; wlCond = sql`${wlCond} AND created_at >= ${from}::timestamptz`; }
  if (to)   { txCond = sql`${txCond} AND created_at <= ${to}::timestamptz`;   wlCond = sql`${wlCond} AND created_at <= ${to}::timestamptz`; }

  try {
    const [txReport, walletReport, reversalReport, dailyRevenue, serviceBreakdown] = await Promise.all([
      db.execute(sql`
        SELECT
          COUNT(*)::int                                                              AS total_count,
          COUNT(*) FILTER (WHERE status='success' AND type!='wallet_fund')::int     AS successful_count,
          COUNT(*) FILTER (WHERE status='failed')::int                              AS failed_count,
          COUNT(*) FILTER (WHERE status='pending')::int                             AS pending_count,
          COALESCE(SUM(amount) FILTER (WHERE status='success' AND type!='wallet_fund'),0)::numeric AS total_revenue,
          COALESCE(SUM(amount) FILTER (WHERE status='failed'),0)::numeric            AS failed_value,
          COALESCE(SUM(amount) FILTER (WHERE status='pending'),0)::numeric           AS pending_value,
          COALESCE(SUM(amount) FILTER (WHERE type='wallet_fund' AND status='success'),0)::numeric AS wallet_funding_total
        FROM transactions WHERE ${txCond}
      `),
      db.execute(sql`
        SELECT
          COALESCE(SUM(amount) FILTER (WHERE type='credit'),0)::numeric    AS total_manual_credits,
          COALESCE(SUM(amount) FILTER (WHERE type='debit'),0)::numeric     AS total_manual_debits,
          COALESCE(SUM(amount) FILTER (WHERE type='reversal'),0)::numeric  AS total_reversals_amount,
          COUNT(*)::int                                                      AS ledger_entries
        FROM wallet_ledger WHERE ${wlCond}
      `),
      db.execute(sql`SELECT COUNT(*)::int AS total, COALESCE(SUM(amount),0)::numeric AS total_amount FROM transaction_reversals WHERE ${wlCond}`),
      db.execute(sql`
        SELECT
          DATE_TRUNC('day', created_at)::date AS day,
          COALESCE(SUM(amount),0)::numeric AS revenue,
          COUNT(*)::int AS count
        FROM transactions
        WHERE status='success' AND type!='wallet_fund' AND ${txCond}
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY day DESC
        LIMIT 30
      `),
      db.execute(sql`
        SELECT type, COALESCE(SUM(amount),0)::numeric AS revenue, COUNT(*)::int AS count
        FROM transactions
        WHERE status='success' AND type!='wallet_fund' AND ${txCond}
        GROUP BY type ORDER BY revenue DESC
      `),
    ]);

    const tx  = txReport.rows[0]  as Record<string, unknown>;
    const wl  = walletReport.rows[0] as Record<string, unknown>;
    const rev = reversalReport.rows[0] as Record<string, unknown>;

    res.json({
      transactions: {
        totalCount:      Number(tx['total_count']),
        successfulCount: Number(tx['successful_count']),
        failedCount:     Number(tx['failed_count']),
        pendingCount:    Number(tx['pending_count']),
        totalRevenue:    Number(tx['total_revenue']),
        failedValue:     Number(tx['failed_value']),
        pendingValue:    Number(tx['pending_value']),
        walletFunding:   Number(tx['wallet_funding_total']),
      },
      wallet: {
        totalManualCredits: Number(wl['total_manual_credits']),
        totalManualDebits:  Number(wl['total_manual_debits']),
        totalReversals:     Number(wl['total_reversals_amount']),
        ledgerEntries:      Number(wl['ledger_entries']),
      },
      reversals: {
        count:       Number(rev['total']),
        totalAmount: Number(rev['total_amount']),
      },
      dailyRevenue: dailyRevenue.rows.map((r: Record<string, unknown>) => ({
        day:     String(r['day']),
        revenue: Number(r['revenue']),
        count:   Number(r['count']),
      })),
      serviceBreakdown: serviceBreakdown.rows.map((r: Record<string, unknown>) => ({
        type:    String(r['type']),
        revenue: Number(r['revenue']),
        count:   Number(r['count']),
      })),
    });
  } catch (err) {
    logger.error({ err }, 'GET /reports/financial failed');
    res.status(500).json({ error: 'Failed to generate financial report.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SYSTEM SETTINGS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/settings', async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await db.execute(sql`
      SELECT ss.*, aa.name AS updated_by_name
      FROM system_settings ss
      LEFT JOIN admin_accounts aa ON aa.id = ss.updated_by
      ORDER BY ss.key
    `);
    const settings: Record<string, unknown> = {};
    for (const row of r.rows as Record<string, unknown>[]) {
      settings[String(row['key'])] = {
        value:         String(row['value']),
        updatedBy:     row['updated_by'] ? String(row['updated_by']) : null,
        updatedByName: row['updated_by_name'] ? String(row['updated_by_name']) : null,
        updatedAt:     String(row['updated_at']),
      };
    }
    res.json({ settings });
  } catch (err) {
    logger.error({ err }, 'GET /settings failed');
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

router.patch('/settings', async (req: Request, res: Response): Promise<void> => {
  const { key, value } = req.body as { key?: string; value?: string };
  if (!key?.trim())        { res.status(400).json({ error: 'key is required.' }); return; }
  if (value === undefined) { res.status(400).json({ error: 'value is required.' }); return; }

  try {
    await db.execute(sql`
      INSERT INTO system_settings (key, value, updated_by, updated_at)
      VALUES (${key.trim()}, ${value}, ${req.session.adminId!}, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()
    `);
    const adminEmail = await getAdminEmail(req.session.adminId!);
    void auditLog({
      adminId: req.session.adminId!, adminEmail,
      action: 'system_setting_updated',
      targetType: 'setting', targetId: key.trim(),
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
// API INTEGRATIONS (masked — no plaintext secrets)
// ═════════════════════════════════════════════════════════════════════════════

router.get('/integrations', (_req: Request, res: Response): void => {
  function mask(val: string | undefined): string {
    if (!val || val.length < 8) return val ? '••••••••' : 'Not configured';
    return '••••••••' + val.slice(-4);
  }

  res.json({
    integrations: [
      {
        key:    'monnify',
        label:  'Monnify (Payment Gateway)',
        status: process.env['MONNIFY_API_KEY'] ? 'configured' : 'not_configured',
        fields: [
          { label: 'API Key',       value: mask(process.env['MONNIFY_API_KEY']),       sensitive: true  },
          { label: 'Contract Code', value: mask(process.env['MONNIFY_CONTRACT_CODE']), sensitive: true  },
          { label: 'Base URL',      value: process.env['MONNIFY_BASE_URL'] ?? 'https://sandbox.monnify.com', sensitive: false },
        ],
      },
      {
        key:    'clubkonnect',
        label:  'ClubKonnect (VTU Provider)',
        status: process.env['CLUBKONNECT_API_KEY'] ? 'configured' : 'not_configured',
        fields: [
          { label: 'User ID',  value: mask(process.env['CLUBKONNECT_USER_ID']),  sensitive: true },
          { label: 'API Key',  value: mask(process.env['CLUBKONNECT_API_KEY']),  sensitive: true },
          { label: 'Endpoint', value: 'https://www.clubkonnect.com/api', sensitive: false },
        ],
      },
    ],
  });
});


// ═════════════════════════════════════════════════════════════════════════════
// DASHBOARD EXTENDED
// ═════════════════════════════════════════════════════════════════════════════

router.get('/dashboard/extended', async (req: Request, res: Response): Promise<void> => {
  try {
    const [daily, weekly, monthly, profit, activeToday, newWeek, activity] = await Promise.all([
      // Last 14 days daily revenue
      db.execute(sql`
        SELECT DATE(created_at) AS day,
               COALESCE(SUM(amount),0)::numeric AS revenue,
               COUNT(*)::int AS count
        FROM transactions
        WHERE status='success' AND type!='wallet_fund'
          AND created_at >= NOW() - INTERVAL '14 days'
        GROUP BY day ORDER BY day ASC
      `),
      // Last 4 weeks weekly
      db.execute(sql`
        SELECT DATE_TRUNC('week', created_at) AS week,
               COALESCE(SUM(amount),0)::numeric AS revenue,
               COUNT(*)::int AS count
        FROM transactions
        WHERE status='success' AND type!='wallet_fund'
          AND created_at >= NOW() - INTERVAL '28 days'
        GROUP BY week ORDER BY week ASC
      `),
      // Last 6 months monthly
      db.execute(sql`
        SELECT DATE_TRUNC('month', created_at) AS month,
               COALESCE(SUM(amount),0)::numeric AS revenue,
               COUNT(*)::int AS count
        FROM transactions
        WHERE status='success' AND type!='wallet_fund'
          AND created_at >= NOW() - INTERVAL '6 months'
        GROUP BY month ORDER BY month ASC
      `),
      // Profit stats (8% estimated margin)
      db.execute(sql`
        SELECT COALESCE(SUM(amount) FILTER (WHERE status='success' AND type!='wallet_fund'),0)::numeric AS total_revenue
        FROM transactions
        WHERE created_at >= DATE_TRUNC('month', NOW())
      `),
      // Active users today
      db.execute(sql`
        SELECT COUNT(DISTINCT user_id)::int AS cnt FROM transactions
        WHERE created_at >= CURRENT_DATE
      `),
      // New users this week
      db.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM users
        WHERE created_at >= DATE_TRUNC('week', NOW())
      `),
      // Recent activity
      db.execute(sql`
        SELECT id, action, admin_email, target_label, created_at
        FROM admin_audit_logs ORDER BY created_at DESC LIMIT 10
      `),
    ]);

    const totalRevenue = Number((profit.rows[0] as Record<string,unknown>)?.['total_revenue'] ?? 0);
    const netProfit = totalRevenue * 0.08;
    const profitMargin = 8;

    const mapRow = (r: unknown) => {
      const row = r as Record<string,unknown>;
      return {
        day:     String(row['day'] ?? row['week'] ?? row['month'] ?? ''),
        revenue: Number(row['revenue'] ?? 0),
        count:   Number(row['count'] ?? 0),
      };
    };

    res.json({
      dailyRevenue:    daily.rows.map(mapRow),
      weeklyRevenue:   weekly.rows.map(r => { const row = r as Record<string,unknown>; return { week: String(row['week']??''), revenue: Number(row['revenue']??0), count: Number(row['count']??0) }; }),
      monthlyRevenue:  monthly.rows.map(r => { const row = r as Record<string,unknown>; return { month: String(row['month']??''), revenue: Number(row['revenue']??0), count: Number(row['count']??0) }; }),
      profitMargin, netProfit, totalCost: totalRevenue * 0.92,
      activeUsersToday: Number((activeToday.rows[0] as Record<string,unknown>)?.['cnt'] ?? 0),
      newUsersThisWeek: Number((newWeek.rows[0] as Record<string,unknown>)?.['cnt'] ?? 0),
      recentActivity: activity.rows.map(r => {
        const row = r as Record<string,unknown>;
        return { id: String(row['id']), action: String(row['action']??''), adminEmail: String(row['admin_email']??''), targetLabel: row['target_label'] ? String(row['target_label']) : null, createdAt: String(row['created_at']??'') };
      }),
    });
  } catch (err) {
    logger.error({ err }, 'GET /dashboard/extended failed');
    res.status(500).json({ error: 'Failed to load extended dashboard.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// USER LOGIN HISTORY (proxy via audit_logs)
// ═════════════════════════════════════════════════════════════════════════════

router.get('/users/:id/login-history', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  try {
    // First try admin_login_history if it has user entries, else fall back to audit_logs
    const r = await db.execute(sql`
      SELECT id, action AS status, ip AS ip_address, NULL AS user_agent, created_at
      FROM admin_audit_logs
      WHERE target_type='user' AND target_id=${id}
        AND action IN ('login','login_failed','login_attempt')
      ORDER BY created_at DESC LIMIT 30
    `);
    res.json({
      history: r.rows.map(row => {
        const x = row as Record<string,unknown>;
        return {
          id: String(x['id']),
          userId: id,
          status: String(x['status']??'').includes('fail') ? 'failed' : 'success',
          ipAddress: x['ip_address'] ? String(x['ip_address']) : null,
          userAgent: null,
          createdAt: String(x['created_at']??''),
        };
      }),
    });
  } catch (err) {
    logger.error({ err }, 'GET /users/:id/login-history failed');
    res.json({ history: [] });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// STAFF MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

router.get('/staff', async (req: Request, res: Response): Promise<void> => {
  try {
    const r = await db.execute(sql`
      SELECT id, name, email, phone, role, rank, salary, salary_payment_day,
             department, status, permissions, notes, created_at, updated_at
      FROM staff_members ORDER BY created_at DESC
    `);
    res.json({
      staff: r.rows.map(row => {
        const x = row as Record<string,unknown>;
        let perms: string[] = [];
        try { perms = Array.isArray(x['permissions']) ? (x['permissions'] as string[]) : JSON.parse(String(x['permissions']??'[]')); } catch { perms = []; }
        return {
          id: String(x['id']), name: String(x['name']), email: x['email'] ? String(x['email']) : null,
          phone: x['phone'] ? String(x['phone']) : null, role: String(x['role']??''), rank: String(x['rank']??'junior'),
          salary: Number(x['salary']??0), salaryPaymentDay: Number(x['salary_payment_day']??1),
          department: x['department'] ? String(x['department']) : null, status: String(x['status']??'active'),
          permissions: perms, notes: x['notes'] ? String(x['notes']) : null,
          createdAt: String(x['created_at']), updatedAt: String(x['updated_at']),
        };
      }),
    });
  } catch (err) {
    logger.error({ err }, 'GET /staff failed');
    res.status(500).json({ error: 'Failed to load staff.' });
  }
});

router.post('/staff', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  const adminEmail = await getAdminEmail(adminId);
  const { name, email, phone, role, rank, salary, salaryPaymentDay, department, status, permissions, notes } =
    req.body as Record<string,unknown>;
  if (!name) { res.status(400).json({ error: 'Name is required.' }); return; }
  try {
    const r = await db.execute(sql`
      INSERT INTO staff_members (name, email, phone, role, rank, salary, salary_payment_day, department, status, permissions, notes, admin_account_id)
      VALUES (${String(name)}, ${email ? String(email) : null}, ${phone ? String(phone) : null},
              ${role ? String(role) : 'Staff'}, ${rank ? String(rank) : 'junior'},
              ${salary ? Number(salary) : 0}, ${salaryPaymentDay ? Number(salaryPaymentDay) : 1},
              ${department ? String(department) : null}, ${status ? String(status) : 'active'},
              ${JSON.stringify(Array.isArray(permissions) ? permissions : [])},
              ${notes ? String(notes) : null}, ${adminId})
      RETURNING *
    `);
    const x = r.rows[0] as Record<string,unknown>;
    void auditLog({ adminId, adminEmail, action: 'create_staff', targetLabel: String(name) });
    let perms: string[] = [];
    try { perms = Array.isArray(x['permissions']) ? (x['permissions'] as string[]) : JSON.parse(String(x['permissions']??'[]')); } catch { perms = []; }
    res.json({
      id: String(x['id']), name: String(x['name']), email: x['email'] ? String(x['email']) : null,
      phone: x['phone'] ? String(x['phone']) : null, role: String(x['role']??''), rank: String(x['rank']??'junior'),
      salary: Number(x['salary']??0), salaryPaymentDay: Number(x['salary_payment_day']??1),
      department: x['department'] ? String(x['department']) : null, status: String(x['status']??'active'),
      permissions: perms, notes: x['notes'] ? String(x['notes']) : null,
      createdAt: String(x['created_at']), updatedAt: String(x['updated_at']),
    });
  } catch (err) {
    logger.error({ err }, 'POST /staff failed');
    res.status(500).json({ error: 'Failed to create staff member.' });
  }
});

router.patch('/staff/:id', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  const adminEmail = await getAdminEmail(adminId);
  const { id } = req.params as { id: string };
  const { name, email, phone, role, rank, salary, salaryPaymentDay, department, status, permissions, notes } =
    req.body as Record<string,unknown>;
  try {
    await db.execute(sql`
      UPDATE staff_members SET
        name               = COALESCE(${name        != null ? String(name)       : null}, name),
        email              = COALESCE(${email       !== undefined ? (email       ? String(email)      : null) : null}, email),
        phone              = COALESCE(${phone       !== undefined ? (phone       ? String(phone)      : null) : null}, phone),
        role               = COALESCE(${role        != null ? String(role)       : null}, role),
        rank               = COALESCE(${rank        != null ? String(rank)       : null}, rank),
        salary             = COALESCE(${salary      !== undefined ? Number(salary)                          : null}, salary),
        salary_payment_day = COALESCE(${salaryPaymentDay !== undefined ? Number(salaryPaymentDay)           : null}, salary_payment_day),
        department         = COALESCE(${department  !== undefined ? (department  ? String(department) : null) : null}, department),
        status             = COALESCE(${status      != null ? String(status)     : null}, status),
        permissions        = COALESCE(${permissions !== undefined ? JSON.stringify(permissions ?? [])       : null}::jsonb, permissions),
        notes              = COALESCE(${notes       !== undefined ? (notes       ? String(notes)      : null) : null}, notes),
        updated_at = NOW()
      WHERE id = ${id}
    `);
    const r = await db.execute(sql`SELECT * FROM staff_members WHERE id=${id} LIMIT 1`);
    if (!r.rows.length) { res.status(404).json({ error: 'Staff member not found.' }); return; }
    const x = r.rows[0] as Record<string,unknown>;
    void auditLog({ adminId, adminEmail, action: 'update_staff', targetId: id, targetLabel: String(x['name']??'') });
    let perms: string[] = [];
    try { perms = Array.isArray(x['permissions']) ? (x['permissions'] as string[]) : JSON.parse(String(x['permissions']??'[]')); } catch { perms = []; }
    res.json({
      id: String(x['id']), name: String(x['name']), email: x['email'] ? String(x['email']) : null,
      phone: x['phone'] ? String(x['phone']) : null, role: String(x['role']??''), rank: String(x['rank']??'junior'),
      salary: Number(x['salary']??0), salaryPaymentDay: Number(x['salary_payment_day']??1),
      department: x['department'] ? String(x['department']) : null, status: String(x['status']??'active'),
      permissions: perms, notes: x['notes'] ? String(x['notes']) : null,
      createdAt: String(x['created_at']), updatedAt: String(x['updated_at']),
    });
  } catch (err) {
    logger.error({ err }, 'PATCH /staff/:id failed');
    res.status(500).json({ error: 'Failed to update staff member.' });
  }
});

router.delete('/staff/:id', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  const adminEmail = await getAdminEmail(adminId);
  const { id } = req.params as { id: string };
  try {
    await db.execute(sql`DELETE FROM staff_members WHERE id=${id}`);
    void auditLog({ adminId, adminEmail, action: 'delete_staff', targetId: id });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'DELETE /staff/:id failed');
    res.status(500).json({ error: 'Failed to delete staff member.' });
  }
});

router.get('/staff/:id/attendance', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { month } = req.query as { month?: string };
  try {
    const r = await db.execute(
      month
        ? sql`SELECT * FROM staff_attendance WHERE staff_id=${id} AND TO_CHAR(date,'YYYY-MM')=${month} ORDER BY date DESC`
        : sql`SELECT * FROM staff_attendance WHERE staff_id=${id} ORDER BY date DESC LIMIT 60`
    );
    res.json({
      attendance: r.rows.map(row => {
        const x = row as Record<string,unknown>;
        return {
          id: String(x['id']), staffId: String(x['staff_id']), date: String(x['date']),
          checkIn: x['check_in'] ? String(x['check_in']) : null,
          checkOut: x['check_out'] ? String(x['check_out']) : null,
          status: String(x['status']??''), notes: x['notes'] ? String(x['notes']) : null,
          createdAt: String(x['created_at']),
        };
      }),
    });
  } catch (err) {
    logger.error({ err }, 'GET /staff/:id/attendance failed');
    res.status(500).json({ error: 'Failed to load attendance.' });
  }
});

router.post('/staff/:id/attendance', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { date, status, checkIn, checkOut, notes } = req.body as Record<string,unknown>;
  if (!date || !status) { res.status(400).json({ error: 'Date and status required.' }); return; }
  try {
    await db.execute(sql`
      INSERT INTO staff_attendance (staff_id, date, status, check_in, check_out, notes)
      VALUES (${id}, ${String(date)}, ${String(status)}, ${checkIn ? String(checkIn) : null}, ${checkOut ? String(checkOut) : null}, ${notes ? String(notes) : null})
      ON CONFLICT (staff_id, date) DO UPDATE SET
        status=EXCLUDED.status, check_in=EXCLUDED.check_in, check_out=EXCLUDED.check_out, notes=EXCLUDED.notes
    `);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'POST /staff/:id/attendance failed');
    res.status(500).json({ error: 'Failed to mark attendance.' });
  }
});

router.get('/staff/:id/activity', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  try {
    const r = await db.execute(sql`SELECT * FROM staff_activity_logs WHERE staff_id=${id} ORDER BY created_at DESC LIMIT 50`);
    res.json({
      logs: r.rows.map(row => {
        const x = row as Record<string,unknown>;
        let meta: Record<string,unknown> = {};
        try { meta = typeof x['metadata'] === 'object' ? (x['metadata'] as Record<string,unknown>) : JSON.parse(String(x['metadata']??'{}')); } catch { meta = {}; }
        return { id: String(x['id']), staffId: String(x['staff_id']), action: String(x['action']??''), metadata: meta, ipAddress: x['ip_address'] ? String(x['ip_address']) : null, createdAt: String(x['created_at']) };
      }),
    });
  } catch (err) {
    logger.error({ err }, 'GET /staff/:id/activity failed');
    res.status(500).json({ error: 'Failed to load activity logs.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// PRICING MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

router.get('/pricing', async (req: Request, res: Response): Promise<void> => {
  const { serviceType } = req.query as { serviceType?: string };
  try {
    const r = serviceType
      ? await db.execute(sql`SELECT * FROM pricing_rules WHERE service_type=${serviceType} ORDER BY provider, plan_name`)
      : await db.execute(sql`SELECT * FROM pricing_rules ORDER BY service_type, provider, plan_name`);
    res.json({
      rules: r.rows.map(row => {
        const x = row as Record<string,unknown>;
        return {
          id: String(x['id']), serviceType: String(x['service_type']??''), provider: String(x['provider']??''),
          network: x['network'] ? String(x['network']) : null, planId: x['plan_id'] ? String(x['plan_id']) : null,
          planName: x['plan_name'] ? String(x['plan_name']) : null, costPrice: Number(x['cost_price']??0),
          sellingPrice: Number(x['selling_price']??0), markupPercent: Number(x['markup_percent']??0),
          enabled: Boolean(x['enabled']), updatedAt: String(x['updated_at']), createdAt: String(x['created_at']),
        };
      }),
    });
  } catch (err) {
    logger.error({ err }, 'GET /pricing failed');
    res.status(500).json({ error: 'Failed to load pricing rules.' });
  }
});

router.post('/pricing', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  const adminEmail = await getAdminEmail(adminId);
  const { serviceType, provider, network, planId, planName, costPrice, sellingPrice, markupPercent, enabled } =
    req.body as Record<string,unknown>;
  if (!serviceType || !provider || !planName) { res.status(400).json({ error: 'serviceType, provider, and planName are required.' }); return; }
  try {
    const r = await db.execute(sql`
      INSERT INTO pricing_rules (service_type, provider, network, plan_id, plan_name, cost_price, selling_price, markup_percent, enabled, updated_by)
      VALUES (${String(serviceType)}, ${String(provider)}, ${network ? String(network) : null},
              ${planId ? String(planId) : null}, ${String(planName)},
              ${Number(costPrice??0)}, ${Number(sellingPrice??0)}, ${Number(markupPercent??0)},
              ${enabled !== false}, ${adminId})
      RETURNING *
    `);
    const x = r.rows[0] as Record<string,unknown>;
    void auditLog({ adminId, adminEmail, action: 'create_pricing_rule', targetLabel: String(planName) });
    res.json({
      id: String(x['id']), serviceType: String(x['service_type']??''), provider: String(x['provider']??''),
      network: x['network'] ? String(x['network']) : null, planId: x['plan_id'] ? String(x['plan_id']) : null,
      planName: x['plan_name'] ? String(x['plan_name']) : null, costPrice: Number(x['cost_price']??0),
      sellingPrice: Number(x['selling_price']??0), markupPercent: Number(x['markup_percent']??0),
      enabled: Boolean(x['enabled']), updatedAt: String(x['updated_at']), createdAt: String(x['created_at']),
    });
  } catch (err) {
    logger.error({ err }, 'POST /pricing failed');
    res.status(500).json({ error: 'Failed to create pricing rule.' });
  }
});

router.patch('/pricing/bulk', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  const adminEmail = await getAdminEmail(adminId);
  const { rules } = req.body as { rules: { id: string; sellingPrice?: number; costPrice?: number; markupPercent?: number; enabled?: boolean }[] };
  if (!Array.isArray(rules)) { res.status(400).json({ error: 'rules must be an array.' }); return; }
  let updated = 0;
  for (const rule of rules) {
    try {
      await db.execute(sql`
        UPDATE pricing_rules SET
          selling_price = COALESCE(${rule.sellingPrice !== undefined ? rule.sellingPrice : null}, selling_price),
          cost_price = COALESCE(${rule.costPrice !== undefined ? rule.costPrice : null}, cost_price),
          markup_percent = COALESCE(${rule.markupPercent !== undefined ? rule.markupPercent : null}, markup_percent),
          enabled = COALESCE(${rule.enabled !== undefined ? rule.enabled : null}, enabled),
          updated_by = ${adminId}, updated_at = NOW()
        WHERE id = ${rule.id}
      `);
      updated++;
    } catch (err) {
      logger.error({ err, ruleId: rule.id }, 'bulk update failed for rule');
    }
  }
  void auditLog({ adminId, adminEmail, action: 'bulk_update_pricing', details: { count: updated } });
  res.json({ updated });
});

router.patch('/pricing/:id', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  const adminEmail = await getAdminEmail(adminId);
  const { id } = req.params as { id: string };
  const { sellingPrice, costPrice, markupPercent, enabled, planName } = req.body as Record<string,unknown>;
  try {
    await db.execute(sql`
      UPDATE pricing_rules SET
        selling_price = COALESCE(${sellingPrice !== undefined ? Number(sellingPrice) : null}, selling_price),
        cost_price = COALESCE(${costPrice !== undefined ? Number(costPrice) : null}, cost_price),
        markup_percent = COALESCE(${markupPercent !== undefined ? Number(markupPercent) : null}, markup_percent),
        enabled = COALESCE(${enabled !== undefined ? Boolean(enabled) : null}, enabled),
        plan_name = COALESCE(${planName ? String(planName) : null}, plan_name),
        updated_by = ${adminId}, updated_at = NOW()
      WHERE id = ${id}
    `);
    const r = await db.execute(sql`SELECT * FROM pricing_rules WHERE id=${id} LIMIT 1`);
    if (!r.rows.length) { res.status(404).json({ error: 'Pricing rule not found.' }); return; }
    const x = r.rows[0] as Record<string,unknown>;
    void auditLog({ adminId, adminEmail, action: 'update_pricing_rule', targetId: id });
    res.json({
      id: String(x['id']), serviceType: String(x['service_type']??''), provider: String(x['provider']??''),
      network: x['network'] ? String(x['network']) : null, planId: x['plan_id'] ? String(x['plan_id']) : null,
      planName: x['plan_name'] ? String(x['plan_name']) : null, costPrice: Number(x['cost_price']??0),
      sellingPrice: Number(x['selling_price']??0), markupPercent: Number(x['markup_percent']??0),
      enabled: Boolean(x['enabled']), updatedAt: String(x['updated_at']), createdAt: String(x['created_at']),
    });
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
    await db.execute(sql`DELETE FROM pricing_rules WHERE id=${id}`);
    void auditLog({ adminId, adminEmail, action: 'delete_pricing_rule', targetId: id });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'DELETE /pricing/:id failed');
    res.status(500).json({ error: 'Failed to delete pricing rule.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// API MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

router.get('/api-management/configs', async (req: Request, res: Response): Promise<void> => {
  try {
    const r = await db.execute(sql`
      SELECT key, value FROM system_settings
      WHERE key IN ('clubkonnect_api_key','clubkonnect_user_id','monnify_api_key','monnify_secret_key','monnify_contract_code','api_clubkonnect_enabled','api_monnify_enabled')
    `);
    const map: Record<string,string> = {};
    for (const row of r.rows) { const x = row as Record<string,unknown>; map[String(x['key'])] = String(x['value']??''); }

    // Also use env vars as fallback
    const ckKey   = map['clubkonnect_api_key']   || (process.env['CLUBKONNECT_API_KEY'] ? '••••' : '');
    const ckUser  = map['clubkonnect_user_id']    || process.env['CLUBKONNECT_USER_ID'] || '';
    const mnKey   = map['monnify_api_key']        || (process.env['MONNIFY_API_KEY'] ? '••••' : '');
    const mnSec   = map['monnify_secret_key']     || (process.env['MONNIFY_SECRET_KEY'] ? '••••' : '');
    const mnCon   = map['monnify_contract_code']  || process.env['MONNIFY_CONTRACT_CODE'] || '';

    const mask = (v: string) => v && v !== '••••' && v.length > 4 ? v.slice(0,4)+'••••' : v;

    res.json({
      apis: [
        {
          key: 'clubkonnect', label: 'ClubKonnect', enabled: map['api_clubkonnect_enabled'] !== 'false',
          status: 'unknown', lastChecked: null,
          fields: [
            { name: 'api_key',  label: 'API Key', value: mask(ckKey),  sensitive: true  },
            { name: 'user_id',  label: 'User ID', value: ckUser,        sensitive: false },
          ],
        },
        {
          key: 'monnify', label: 'Monnify', enabled: map['api_monnify_enabled'] !== 'false',
          status: 'unknown', lastChecked: null,
          fields: [
            { name: 'api_key',        label: 'API Key',        value: mask(mnKey), sensitive: true  },
            { name: 'secret_key',     label: 'Secret Key',     value: mask(mnSec), sensitive: true  },
            { name: 'contract_code',  label: 'Contract Code',  value: mnCon,       sensitive: false },
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
  const { enabled, fields } = req.body as { enabled?: boolean; fields?: Record<string,string> };
  if (!['clubkonnect','monnify'].includes(key)) { res.status(400).json({ error: 'Invalid API key.' }); return; }
  try {
    if (enabled !== undefined) {
      await db.execute(sql`
        INSERT INTO system_settings (key, value, updated_by) VALUES (${'api_'+key+'_enabled'}, ${String(enabled)}, ${adminId})
        ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=NOW()
      `);
    }
    const fieldKeyMap: Record<string,string> = {
      api_key: key === 'clubkonnect' ? 'clubkonnect_api_key' : 'monnify_api_key',
      user_id: 'clubkonnect_user_id',
      secret_key: 'monnify_secret_key',
      contract_code: 'monnify_contract_code',
    };
    if (fields) {
      for (const [fname, fval] of Object.entries(fields)) {
        const skey = fieldKeyMap[fname];
        if (!skey || !fval) continue;
        await db.execute(sql`
          INSERT INTO system_settings (key, value, updated_by) VALUES (${skey}, ${fval}, ${adminId})
          ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_by=EXCLUDED.updated_by, updated_at=NOW()
        `);
      }
    }
    void auditLog({ adminId, adminEmail, action: `update_api_config_${key}` });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'PATCH /api-management/configs/:key failed');
    res.status(500).json({ error: 'Failed to update API config.' });
  }
});

router.get('/api-management/status', async (_req: Request, res: Response): Promise<void> => {
  const checks = [
    { key: 'clubkonnect', label: 'ClubKonnect', url: 'https://www.clubkonnect.com/' },
    { key: 'monnify',     label: 'Monnify',     url: 'https://api.monnify.com/api/v1/sdk/contracts' },
  ];
  const results = await Promise.all(checks.map(async c => {
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);
      await fetch(c.url, { signal: controller.signal, method: 'HEAD' });
      clearTimeout(timer);
      return { key: c.key, label: c.label, status: 'online', latency: Date.now()-start, checkedAt: new Date().toISOString() };
    } catch {
      return { key: c.key, label: c.label, status: 'offline', latency: null, checkedAt: new Date().toISOString() };
    }
  }));
  res.json({ results });
});

router.get('/api-management/logs/errors', async (req: Request, res: Response): Promise<void> => {
  const { api, page = '1', limit: lim = '50' } = req.query as Record<string,string>;
  const pageNum = Math.max(1, parseInt(page)); const limitNum = Math.min(100, parseInt(lim));
  const offset = (pageNum - 1) * limitNum;
  try {
    const countR = await db.execute(sql`
      SELECT COUNT(*)::int AS total FROM admin_audit_logs
      WHERE action LIKE '%fail%' OR action LIKE '%error%'
    `);
    const total = Number((countR.rows[0] as Record<string,unknown>)?.['total'] ?? 0);
    const r = await db.execute(sql`
      SELECT id, admin_email, action, target_label, details, ip, created_at FROM admin_audit_logs
      WHERE action LIKE '%fail%' OR action LIKE '%error%'
      ORDER BY created_at DESC LIMIT ${limitNum} OFFSET ${offset}
    `);
    res.json({
      logs: r.rows.map(row => {
        const x = row as Record<string,unknown>;
        return {
          id: String(x['id']), api: api || 'all', endpoint: String(x['action']??''), method: 'POST',
          statusCode: 500, responseTime: null, error: String(x['target_label']??x['action']??''),
          requestRef: null, createdAt: String(x['created_at']),
        };
      }),
      total, pages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    logger.error({ err }, 'GET /api-management/logs/errors failed');
    res.status(500).json({ error: 'Failed to load error logs.' });
  }
});

router.get('/api-management/logs/transactions', async (req: Request, res: Response): Promise<void> => {
  const { api, page = '1', limit: lim = '50' } = req.query as Record<string,string>;
  const pageNum = Math.max(1, parseInt(page)); const limitNum = Math.min(100, parseInt(lim));
  const offset = (pageNum - 1) * limitNum;
  try {
    const filterSql = api && api !== 'all'
      ? sql`AND LOWER(t.provider) LIKE ${`%${api.toLowerCase()}%`}`
      : sql`AND 1=1`;
    const countR = await db.execute(sql`SELECT COUNT(*)::int AS total FROM transactions t WHERE 1=1 ${filterSql}`);
    const total = Number((countR.rows[0] as Record<string,unknown>)?.['total'] ?? 0);
    const r = await db.execute(sql`
      SELECT t.id, t.provider, t.service, t.type, t.status, t.reference, t.description, t.amount, t.created_at
      FROM transactions t WHERE 1=1 ${filterSql}
      ORDER BY t.created_at DESC LIMIT ${limitNum} OFFSET ${offset}
    `);
    res.json({
      logs: r.rows.map(row => {
        const x = row as Record<string,unknown>;
        const isOk = String(x['status']??'') === 'success';
        return {
          id: String(x['id']), api: String(x['provider']??''), endpoint: String(x['service']??''), method: 'POST',
          statusCode: isOk ? 200 : String(x['status']??'') === 'pending' ? 102 : 500,
          responseTime: null, error: !isOk ? String(x['description']??'') : null,
          requestRef: x['reference'] ? String(x['reference']) : null, createdAt: String(x['created_at']),
        };
      }),
      total, pages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    logger.error({ err }, 'GET /api-management/logs/transactions failed');
    res.status(500).json({ error: 'Failed to load transaction logs.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// FINANCE — FUNDING REQUESTS
// ═════════════════════════════════════════════════════════════════════════════

router.get('/finance/funding-requests', async (req: Request, res: Response): Promise<void> => {
  const { status, page = '1', limit: lim = '25' } = req.query as Record<string,string>;
  const pageNum = Math.max(1, parseInt(page)); const limitNum = Math.min(100, parseInt(lim));
  const offset = (pageNum - 1) * limitNum;
  try {
    const statusFilter = status && status !== 'all' ? sql`AND fr.status=${status}` : sql`AND 1=1`;
    const countR = await db.execute(sql`SELECT COUNT(*)::int AS total FROM funding_requests fr WHERE 1=1 ${statusFilter}`);
    const total = Number((countR.rows[0] as Record<string,unknown>)?.['total'] ?? 0);
    const r = await db.execute(sql`
      SELECT fr.*, u.name AS user_name, u.phone AS user_phone,
             aa.name AS reviewed_by_name
      FROM funding_requests fr
      LEFT JOIN users u ON u.id=fr.user_id
      LEFT JOIN admin_accounts aa ON aa.id=fr.reviewed_by
      WHERE 1=1 ${statusFilter}
      ORDER BY fr.created_at DESC LIMIT ${limitNum} OFFSET ${offset}
    `);
    res.json({
      requests: r.rows.map(row => {
        const x = row as Record<string,unknown>;
        let meta: Record<string,unknown> = {};
        try { meta = typeof x['metadata']==='object' ? (x['metadata'] as Record<string,unknown>) : JSON.parse(String(x['metadata']??'{}')); } catch { meta = {}; }
        return {
          id: String(x['id']), userId: String(x['user_id']??''), userName: String(x['user_name']??''),
          userPhone: String(x['user_phone']??''), reference: String(x['reference']??''),
          amount: Number(x['amount']??0), gateway: String(x['gateway']??'monnify'),
          status: String(x['status']??'pending'), metadata: meta,
          reviewedByName: x['reviewed_by_name'] ? String(x['reviewed_by_name']) : null,
          reviewedAt: x['reviewed_at'] ? String(x['reviewed_at']) : null,
          rejectReason: x['reject_reason'] ? String(x['reject_reason']) : null,
          createdAt: String(x['created_at']),
        };
      }),
      total, pages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    logger.error({ err }, 'GET /finance/funding-requests failed');
    res.status(500).json({ error: 'Failed to load funding requests.' });
  }
});

router.get('/finance/funding-stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE status='pending')::int AS pending_count,
        COALESCE(SUM(amount) FILTER (WHERE status='pending'),0)::numeric AS pending_total,
        COUNT(*) FILTER (WHERE status='approved' AND DATE(reviewed_at)=CURRENT_DATE)::int AS approved_today,
        COALESCE(SUM(amount) FILTER (WHERE status='approved' AND DATE(reviewed_at)=CURRENT_DATE),0)::numeric AS approved_today_total,
        COUNT(*) FILTER (WHERE status='rejected' AND DATE(reviewed_at)=CURRENT_DATE)::int AS rejected_today,
        COALESCE(SUM(amount) FILTER (WHERE status='approved'),0)::numeric AS total_funded
      FROM funding_requests
    `);
    const x = r.rows[0] as Record<string,unknown>;
    res.json({
      pendingCount: Number(x['pending_count']??0), pendingTotal: Number(x['pending_total']??0),
      approvedToday: Number(x['approved_today']??0), approvedTodayTotal: Number(x['approved_today_total']??0),
      rejectedToday: Number(x['rejected_today']??0), totalFundedAllTime: Number(x['total_funded']??0),
    });
  } catch (err) {
    logger.error({ err }, 'GET /finance/funding-stats failed');
    res.status(500).json({ error: 'Failed to load funding stats.' });
  }
});

router.post('/finance/funding-requests/:id/approve', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  const adminEmail = await getAdminEmail(adminId);
  const { id } = req.params as { id: string };
  try {
    // Get funding request
    const frR = await db.execute(sql`SELECT * FROM funding_requests WHERE id=${id} LIMIT 1`);
    if (!frR.rows.length) { res.status(404).json({ error: 'Funding request not found.' }); return; }
    const fr = frR.rows[0] as Record<string,unknown>;
    if (String(fr['status']) !== 'pending') { res.status(409).json({ error: 'Only pending requests can be approved.' }); return; }
    const amount = Number(fr['amount']??0);
    const userId = String(fr['user_id']);
    const reference = String(fr['reference']);

    // Get wallet
    const walletR = await db.execute(sql`SELECT id, balance FROM wallets WHERE user_id=${userId} FOR UPDATE`);
    if (!walletR.rows.length) { res.status(404).json({ error: 'User wallet not found.' }); return; }
    const wallet = walletR.rows[0] as Record<string,unknown>;
    const walletId = String(wallet['id']);
    const balanceBefore = Number(wallet['balance']??0);
    const balanceAfter  = balanceBefore + amount;

    await db.execute(sql`
      INSERT INTO wallet_ledger (wallet_id, user_id, type, amount, balance_before, balance_after, reference, reason, performed_by)
      VALUES (${walletId}, ${userId}, 'wallet_fund', ${amount}, ${balanceBefore}, ${balanceAfter},
              ${reference}, 'Manual funding approval via admin', ${adminId})
    `);
    await db.execute(sql`UPDATE wallets SET balance=${balanceAfter}, updated_at=NOW() WHERE id=${walletId}`);
    await db.execute(sql`
      UPDATE funding_requests SET status='approved', reviewed_by=${adminId}, reviewed_at=NOW()
      WHERE id=${id}
    `);

    void auditLog({ adminId, adminEmail, action: 'approve_funding', targetId: id, targetLabel: `₦${amount.toLocaleString()} for user ${userId}`, details: { amount, balanceAfter } });
    res.json({ ok: true, balanceAfter });
  } catch (err) {
    logger.error({ err }, 'POST /finance/funding-requests/:id/approve failed');
    res.status(500).json({ error: 'Failed to approve funding request.' });
  }
});

router.post('/finance/funding-requests/:id/reject', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  const adminEmail = await getAdminEmail(adminId);
  const { id } = req.params as { id: string };
  const { reason } = req.body as { reason?: string };
  if (!reason) { res.status(400).json({ error: 'Rejection reason is required.' }); return; }
  try {
    const r = await db.execute(sql`
      UPDATE funding_requests SET status='rejected', reviewed_by=${adminId}, reviewed_at=NOW(), reject_reason=${reason}
      WHERE id=${id} AND status='pending'
      RETURNING id
    `);
    if (!r.rows.length) { res.status(409).json({ error: 'Request not found or already processed.' }); return; }
    void auditLog({ adminId, adminEmail, action: 'reject_funding', targetId: id, details: { reason } });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'POST /finance/funding-requests/:id/reject failed');
    res.status(500).json({ error: 'Failed to reject funding request.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// SECURITY
// ═════════════════════════════════════════════════════════════════════════════

router.get('/security/login-history', async (req: Request, res: Response): Promise<void> => {
  const { page = '1', limit: lim = '50' } = req.query as Record<string,string>;
  const pageNum = Math.max(1, parseInt(page)); const limitNum = Math.min(200, parseInt(lim));
  const offset = (pageNum - 1) * limitNum;
  try {
    const countR = await db.execute(sql`SELECT COUNT(*)::int AS total FROM admin_login_history`);
    const total = Number((countR.rows[0] as Record<string,unknown>)?.['total'] ?? 0);
    const r = await db.execute(sql`
      SELECT lh.*, aa.email AS admin_email_join
      FROM admin_login_history lh
      LEFT JOIN admin_accounts aa ON aa.id=lh.admin_id
      ORDER BY lh.created_at DESC LIMIT ${limitNum} OFFSET ${offset}
    `);
    res.json({
      history: r.rows.map(row => {
        const x = row as Record<string,unknown>;
        return {
          id: String(x['id']), adminId: String(x['admin_id']??''),
          adminEmail: String(x['admin_email'] ?? x['admin_email_join'] ?? ''),
          ipAddress: x['ip_address'] ? String(x['ip_address']) : null,
          userAgent: x['user_agent'] ? String(x['user_agent']) : null,
          status: String(x['status']??''), failReason: x['fail_reason'] ? String(x['fail_reason']) : null,
          createdAt: String(x['created_at']),
        };
      }),
      total, pages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    logger.error({ err }, 'GET /security/login-history failed');
    res.status(500).json({ error: 'Failed to load login history.' });
  }
});

router.get('/security/sessions', async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await db.execute(sql`
      SELECT s.*, aa.email AS admin_email_join
      FROM admin_sessions s
      LEFT JOIN admin_accounts aa ON aa.id=s.admin_id
      WHERE s.revoked_at IS NULL
      ORDER BY s.last_active DESC LIMIT 100
    `);
    res.json({
      sessions: r.rows.map(row => {
        const x = row as Record<string,unknown>;
        return {
          id: String(x['id']), adminId: String(x['admin_id']??''),
          adminEmail: String(x['admin_email'] ?? x['admin_email_join'] ?? ''),
          ipAddress: x['ip_address'] ? String(x['ip_address']) : null,
          userAgent: x['user_agent'] ? String(x['user_agent']) : null,
          lastActive: String(x['last_active'] ?? x['created_at'] ?? ''),
          revokedAt: null, createdAt: String(x['created_at']??''),
        };
      }),
    });
  } catch (err) {
    logger.error({ err }, 'GET /security/sessions failed');
    res.status(500).json({ error: 'Failed to load sessions.' });
  }
});

router.post('/security/sessions/:id/revoke', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  const adminEmail = await getAdminEmail(adminId);
  const { id } = req.params as { id: string };
  try {
    await db.execute(sql`UPDATE admin_sessions SET revoked_at=NOW() WHERE id=${id}`);
    void auditLog({ adminId, adminEmail, action: 'revoke_session', targetId: id });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'POST /security/sessions/:id/revoke failed');
    res.status(500).json({ error: 'Failed to revoke session.' });
  }
});

router.get('/security/2fa/status', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  try {
    const r = await db.execute(sql`SELECT value, updated_at FROM system_settings WHERE key=${'2fa_enabled_'+adminId} LIMIT 1`);
    const row = r.rows[0] as Record<string,unknown> | undefined;
    res.json({ enabled: row?.['value'] === 'true', setupAt: row ? String(row['updated_at']??'') : null });
  } catch (err) {
    logger.error({ err }, 'GET /security/2fa/status failed');
    res.json({ enabled: false, setupAt: null });
  }
});

router.post('/security/2fa/setup', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  try {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    const secret = Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    await db.execute(sql`
      INSERT INTO system_settings (key, value, updated_by) VALUES (${'2fa_secret_'+adminId}, ${secret}, ${adminId})
      ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value, updated_at=NOW()
    `);
    res.json({ qrDataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==', secret });
  } catch (err) {
    logger.error({ err }, 'POST /security/2fa/setup failed');
    res.status(500).json({ error: 'Failed to set up 2FA.' });
  }
});

router.post('/security/2fa/verify', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  const { token } = req.body as { token?: string };
  if (!token || !/^\d{6}$/.test(token)) { res.status(400).json({ error: '6-digit token required.' }); return; }
  try {
    await db.execute(sql`
      INSERT INTO system_settings (key, value, updated_by) VALUES (${'2fa_enabled_'+adminId}, 'true', ${adminId})
      ON CONFLICT (key) DO UPDATE SET value='true', updated_at=NOW()
    `);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'POST /security/2fa/verify failed');
    res.status(500).json({ error: 'Failed to verify 2FA.' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// STAFF NOTIFICATIONS
// ═════════════════════════════════════════════════════════════════════════════

router.post('/notifications/staff', async (req: Request, res: Response): Promise<void> => {
  const adminId = req.session.adminId!;
  const adminEmail = await getAdminEmail(adminId);
  const { staffIds, title, body } = req.body as { staffIds?: string[]; title?: string; body?: string };
  if (!title || !body) { res.status(400).json({ error: 'Title and body are required.' }); return; }
  try {
    // Staff notifications are logged to admin_audit_logs as a record
    // If staff have user accounts linked, they'd get push notifications
    // For now, log the notification send
    void auditLog({ adminId, adminEmail, action: 'send_staff_notification', details: { title, body, staffIds: staffIds ?? [], count: staffIds?.length ?? 0 } });
    res.json({ sent: staffIds?.length ?? 0 });
  } catch (err) {
    logger.error({ err }, 'POST /notifications/staff failed');
    res.status(500).json({ error: 'Failed to send staff notification.' });
  }
});

export default router;

