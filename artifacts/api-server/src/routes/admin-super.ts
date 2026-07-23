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

export default router;
