/**
 * /api/admin — Finance Department routes.
 *
 * Access model:
 *   super_admin  → full read + write for all finance operations.
 *   finance      → read-only by default; specific write actions unlocked per-account
 *                  via the `finance_permissions` JSONB array on admin_accounts.
 *
 * Grantable permissions (set by super admin):
 *   'approve_funding'  — approve / reject wallet funding requests
 *   'process_refunds'  — process transaction reversals (refunds)
 *   'adjust_wallet'    — manually credit or debit customer wallets
 *   'manage_pricing'   — update pricing rules
 *   'export_reports'   — future: export/download financial data
 *
 * Security invariants:
 *   – Completed transactions are IMMUTABLE. Never DELETE or overwrite them.
 *     All adjustments create new ledger entries or reversal records.
 *   – Every financial mutation writes a row to financial_audit_logs with
 *     admin_id, action, previous_value, new_value, reason, timestamp, related IDs.
 *   – reason is mandatory for every write operation.
 *   – All guards are server-side — frontend restrictions are cosmetic only.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { financialAuditLog } from '../lib/financial-audit.js';

const router = Router();

// ── Permission constants ───────────────────────────────────────────────────

export const FINANCE_PERMISSIONS = [
  'approve_funding',
  'process_refunds',
  'adjust_wallet',
  'manage_pricing',
  'export_reports',
] as const;

export type FinancePermission = typeof FINANCE_PERMISSIONS[number];

// ── Helpers ───────────────────────────────────────────────────────────────

function clientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket?.remoteAddress ?? 'unknown'
  );
}

function makeRef(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}


// ── Auth guards ──────────────────────────────────────────────────────────

function requireFinanceOrSuperAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.isAdmin || !req.session.adminId) {
    res.status(401).json({ error: 'Unauthorised.' });
    return;
  }
  const role = req.session.adminRole;
  if (role !== 'super_admin' && role !== 'finance') {
    res.status(403).json({ error: 'Finance or super-admin access required.' });
    return;
  }
  next();
}

/**
 * Returns middleware that allows:
 *   - super_admin always
 *   - finance staff only if their finance_permissions array contains `permission`
 */
function requireFinancePermission(permission: FinancePermission) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.session.isAdmin || !req.session.adminId) {
      res.status(401).json({ error: 'Unauthorised.' });
      return;
    }
    const role = req.session.adminRole;
    if (role === 'super_admin') { next(); return; }
    if (role !== 'finance') {
      res.status(403).json({ error: 'Finance or super-admin access required.' });
      return;
    }
    // Finance staff: check granted permissions
    try {
      const account = (await db.execute<{ finance_permissions: string[] | null }>(
        sql`SELECT finance_permissions FROM admin_accounts WHERE id = ${req.session.adminId}::uuid LIMIT 1`
      )).rows[0];
      const perms: string[] = Array.isArray(account?.finance_permissions) ? account.finance_permissions : [];
      if (!perms.includes(permission)) {
        res.status(403).json({
          error: 'Permission denied.',
          required: permission,
          message: `Your account does not have the '${permission}' permission. Contact a Super Admin.`,
        });
        return;
      }
      next();
    } catch (err) {
      logger.error({ err }, 'Permission check failed');
      res.status(500).json({ error: 'Failed to verify permissions.' });
    }
  };
}

// All routes in this file require finance or super_admin
router.use(requireFinanceOrSuperAdmin);

// ════════════════════════════════════════════════════════════════════════════
// READ-ONLY ROUTES (all finance staff + super admin)
// ════════════════════════════════════════════════════════════════════════════

// ── GET /admin/finance/permissions-info ──────────────────────────────────
// Returns the list of grantable permissions (for the frontend to display).
router.get('/finance/permissions-info', (_req: Request, res: Response): void => {
  res.json({
    permissions: FINANCE_PERMISSIONS.map((p) => ({
      key: p,
      label: {
        approve_funding:  'Approve / Reject Funding Requests',
        process_refunds:  'Process Transaction Reversals & Refunds',
        adjust_wallet:    'Manually Adjust Customer Wallet Balances',
        manage_pricing:   'Update Service Pricing Rules',
        export_reports:   'Export Financial Reports',
      }[p] ?? p,
      description: {
        approve_funding:  'Can approve or reject pending wallet funding requests, which credits the customer wallet.',
        process_refunds:  'Can initiate refunds by reversing successful transactions and crediting the customer wallet.',
        adjust_wallet:    'Can manually credit or debit a customer wallet with mandatory reason and audit trail.',
        manage_pricing:   'Can update service pricing rules. Changes are logged to the pricing audit log.',
        export_reports:   'Can export financial data and reports as CSV or other formats.',
      }[p] ?? '',
    })),
  });
});

// ── GET /admin/finance/my-permissions ────────────────────────────────────
// Returns the calling finance user's own granted permissions.
router.get('/finance/my-permissions', async (req: Request, res: Response): Promise<void> => {
  if (req.session.adminRole === 'super_admin') {
    res.json({ role: 'super_admin', permissions: FINANCE_PERMISSIONS, full_access: true });
    return;
  }
  try {
    const account = (await db.execute<{ finance_permissions: string[] | null }>(
      sql`SELECT finance_permissions FROM admin_accounts WHERE id = ${req.session.adminId!}::uuid LIMIT 1`
    )).rows[0];
    res.json({
      role: req.session.adminRole,
      permissions: account?.finance_permissions ?? [],
      full_access: false,
    });
  } catch (err) {
    logger.error({ err }, 'GET /finance/my-permissions failed');
    res.status(500).json({ error: 'Failed to load permissions.' });
  }
});

// ── GET /admin/finance/overview ──────────────────────────────────────────
router.get('/finance/overview', async (_req: Request, res: Response): Promise<void> => {
  try {
    const revenue = (await db.execute<{
      total_revenue: string; today_revenue: string; this_month_revenue: string;
      total_transactions: string; successful_transactions: string;
    }>(sql`
      SELECT
        COALESCE(SUM(amount), 0)::text AS total_revenue,
        COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN amount ELSE 0 END), 0)::text AS today_revenue,
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW()) THEN amount ELSE 0 END), 0)::text AS this_month_revenue,
        COUNT(*)::text AS total_transactions,
        COUNT(CASE WHEN status = 'success' THEN 1 END)::text AS successful_transactions
      FROM transactions WHERE status IN ('success', 'failed')
    `)).rows[0];

    const walletSummary = (await db.execute<{
      total_wallet_balance: string; total_wallets: string; funded_wallets: string;
    }>(sql`
      SELECT COALESCE(SUM(balance), 0)::text AS total_wallet_balance,
        COUNT(*)::text AS total_wallets, COUNT(CASE WHEN balance > 0 THEN 1 END)::text AS funded_wallets
      FROM wallets
    `)).rows[0];

    const funding = (await db.execute<{
      pending_count: string; pending_amount: string; approved_today: string; approved_amount_today: string;
    }>(sql`
      SELECT
        COUNT(CASE WHEN status = 'pending' THEN 1 END)::text AS pending_count,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0)::text AS pending_amount,
        COUNT(CASE WHEN status = 'approved' AND updated_at >= CURRENT_DATE THEN 1 END)::text AS approved_today,
        COALESCE(SUM(CASE WHEN status = 'approved' AND updated_at >= CURRENT_DATE THEN amount ELSE 0 END), 0)::text AS approved_amount_today
      FROM funding_requests
    `)).rows[0];

    const costData = (await db.execute<{ total_cost: string; gross_profit: string }>(sql`
      SELECT COALESCE(SUM(cost_price), 0)::text AS total_cost,
        COALESCE(SUM(amount) - SUM(COALESCE(cost_price, amount)), 0)::text AS gross_profit
      FROM transactions WHERE status = 'success'
    `)).rows[0];

    const weeklyRows = (await db.execute<{ day: string; revenue: string; cost: string }>(sql`
      SELECT TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
        COALESCE(SUM(amount), 0)::text AS revenue,
        COALESCE(SUM(COALESCE(cost_price, 0)), 0)::text AS cost
      FROM transactions WHERE status = 'success' AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE_TRUNC('day', created_at) ORDER BY day ASC
    `)).rows;

    res.json({
      revenue: revenue ?? {},
      wallets: walletSummary ?? {},
      funding: funding ?? {},
      profitability: costData ?? {},
      weekly_chart: weeklyRows ?? [],
    });
  } catch (err) {
    logger.error({ err }, 'GET /finance/overview failed');
    res.status(500).json({ error: 'Failed to load finance overview.' });
  }
});

// ── GET /admin/finance/pricing-audit ────────────────────────────────────
router.get('/finance/pricing-audit', async (req: Request, res: Response): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt(String(req.query['page'] ?? '1')));
    const limit  = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '50'))));
    const offset = (page - 1) * limit;
    const service = req.query['service_type'] as string | undefined;
    const adminId = req.query['admin_id'] as string | undefined;
    const from    = req.query['from'] as string | undefined;
    const to      = req.query['to'] as string | undefined;

    const rows = (await db.execute<Record<string, unknown>>(sql`
      SELECT pal.*, pr.service_type AS current_service_type,
        pr.provider AS current_provider, pr.plan_name AS current_plan_name
      FROM pricing_audit_logs pal
      LEFT JOIN pricing_rules pr ON pr.id = pal.pricing_rule_id
      WHERE 1=1
        ${service  ? sql`AND pal.service_type = ${service}` : sql``}
        ${adminId  ? sql`AND pal.admin_id = ${adminId}::uuid` : sql``}
        ${from     ? sql`AND pal.created_at >= ${from}::timestamptz` : sql``}
        ${to       ? sql`AND pal.created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
      ORDER BY pal.created_at DESC LIMIT ${limit} OFFSET ${offset}
    `)).rows;

    const countRow = (await db.execute<{ total: string }>(sql`
      SELECT COUNT(*)::text AS total FROM pricing_audit_logs
      WHERE 1=1
        ${service  ? sql`AND service_type = ${service}` : sql``}
        ${adminId  ? sql`AND admin_id = ${adminId}::uuid` : sql``}
        ${from     ? sql`AND created_at >= ${from}::timestamptz` : sql``}
        ${to       ? sql`AND created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
    `)).rows[0];

    res.json({
      logs: rows,
      pagination: { page, limit, total: parseInt(countRow?.total ?? '0'), totalPages: Math.ceil(parseInt(countRow?.total ?? '0') / limit) },
    });
  } catch (err) {
    logger.error({ err }, 'GET /finance/pricing-audit failed');
    res.status(500).json({ error: 'Failed to load pricing audit logs.' });
  }
});

// ── GET /admin/finance/financial-audit ──────────────────────────────────
// Paginated financial_audit_logs — all financial mutations by all admins.
router.get('/finance/financial-audit', async (req: Request, res: Response): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt(String(req.query['page'] ?? '1')));
    const limit  = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '50'))));
    const offset = (page - 1) * limit;
    const action  = req.query['action'] as string | undefined;
    const adminId = req.query['admin_id'] as string | undefined;
    const from    = req.query['from'] as string | undefined;
    const to      = req.query['to'] as string | undefined;

    const rows = (await db.execute<Record<string, unknown>>(sql`
      SELECT * FROM financial_audit_logs WHERE 1=1
        ${action   ? sql`AND action = ${action}` : sql``}
        ${adminId  ? sql`AND admin_id = ${adminId}::uuid` : sql``}
        ${from     ? sql`AND created_at >= ${from}::timestamptz` : sql``}
        ${to       ? sql`AND created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
      ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
    `)).rows;

    const countRow = (await db.execute<{ total: string }>(sql`
      SELECT COUNT(*)::text AS total FROM financial_audit_logs WHERE 1=1
        ${action   ? sql`AND action = ${action}` : sql``}
        ${adminId  ? sql`AND admin_id = ${adminId}::uuid` : sql``}
        ${from     ? sql`AND created_at >= ${from}::timestamptz` : sql``}
        ${to       ? sql`AND created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
    `)).rows[0];

    res.json({
      logs: rows,
      pagination: { page, limit, total: parseInt(countRow?.total ?? '0'), totalPages: Math.ceil(parseInt(countRow?.total ?? '0') / limit) },
    });
  } catch (err) {
    logger.error({ err }, 'GET /finance/financial-audit failed');
    res.status(500).json({ error: 'Failed to load financial audit logs.' });
  }
});

// ── GET /admin/finance/transactions ─────────────────────────────────────
router.get('/finance/transactions', async (req: Request, res: Response): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt(String(req.query['page'] ?? '1')));
    const limit  = Math.min(200, Math.max(1, parseInt(String(req.query['limit'] ?? '50'))));
    const offset = (page - 1) * limit;
    const from   = req.query['from'] as string | undefined;
    const to     = req.query['to'] as string | undefined;
    const type   = req.query['type'] as string | undefined;
    const status = req.query['status'] as string | undefined;
    const phone  = req.query['phone'] as string | undefined;

    const rows = (await db.execute<Record<string, unknown>>(sql`
      SELECT t.*, u.name AS customer_name, u.phone AS customer_phone
      FROM transactions t LEFT JOIN users u ON u.id = t.user_id
      WHERE 1=1
        ${from   ? sql`AND t.created_at >= ${from}::timestamptz` : sql``}
        ${to     ? sql`AND t.created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
        ${type   ? sql`AND t.type = ${type}` : sql``}
        ${status ? sql`AND t.status = ${status}` : sql``}
        ${phone  ? sql`AND u.phone ILIKE ${'%' + phone + '%'}` : sql``}
      ORDER BY t.created_at DESC LIMIT ${limit} OFFSET ${offset}
    `)).rows;

    const countRow = (await db.execute<{ total: string; total_amount: string; total_cost: string }>(sql`
      SELECT COUNT(*)::text AS total,
        COALESCE(SUM(amount), 0)::text AS total_amount,
        COALESCE(SUM(COALESCE(cost_price, 0)), 0)::text AS total_cost
      FROM transactions t LEFT JOIN users u ON u.id = t.user_id
      WHERE 1=1
        ${from   ? sql`AND t.created_at >= ${from}::timestamptz` : sql``}
        ${to     ? sql`AND t.created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
        ${type   ? sql`AND t.type = ${type}` : sql``}
        ${status ? sql`AND t.status = ${status}` : sql``}
        ${phone  ? sql`AND u.phone ILIKE ${'%' + phone + '%'}` : sql``}
    `)).rows[0];

    res.json({
      transactions: rows,
      pagination: { page, limit, total: parseInt(countRow?.total ?? '0'), totalPages: Math.ceil(parseInt(countRow?.total ?? '0') / limit) },
      summary: {
        total_amount: countRow?.total_amount ?? '0',
        total_cost: countRow?.total_cost ?? '0',
        gross_profit: (parseFloat(countRow?.total_amount ?? '0') - parseFloat(countRow?.total_cost ?? '0')).toFixed(2),
      },
    });
  } catch (err) {
    logger.error({ err }, 'GET /finance/transactions failed');
    res.status(500).json({ error: 'Failed to load transactions.' });
  }
});

// ── GET /admin/finance/funding-requests ─────────────────────────────────
router.get('/finance/funding-requests', async (req: Request, res: Response): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt(String(req.query['page'] ?? '1')));
    const limit  = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '50'))));
    const offset = (page - 1) * limit;
    const status = req.query['status'] as string | undefined;
    const from   = req.query['from'] as string | undefined;
    const to     = req.query['to'] as string | undefined;

    const rows = (await db.execute<Record<string, unknown>>(sql`
      SELECT fr.*, u.name AS customer_name, u.phone AS customer_phone, a.name AS reviewed_by_name
      FROM funding_requests fr
      LEFT JOIN users u ON u.id = fr.user_id
      LEFT JOIN admin_accounts a ON a.id = fr.reviewed_by
      WHERE 1=1
        ${status ? sql`AND fr.status = ${status}` : sql``}
        ${from   ? sql`AND fr.created_at >= ${from}::timestamptz` : sql``}
        ${to     ? sql`AND fr.created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
      ORDER BY fr.created_at DESC LIMIT ${limit} OFFSET ${offset}
    `)).rows;

    const countRow = (await db.execute<{ total: string }>(sql`
      SELECT COUNT(*)::text AS total FROM funding_requests fr WHERE 1=1
        ${status ? sql`AND fr.status = ${status}` : sql``}
        ${from   ? sql`AND fr.created_at >= ${from}::timestamptz` : sql``}
        ${to     ? sql`AND fr.created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
    `)).rows[0];

    res.json({
      requests: rows,
      pagination: { page, limit, total: parseInt(countRow?.total ?? '0'), totalPages: Math.ceil(parseInt(countRow?.total ?? '0') / limit) },
    });
  } catch (err) {
    logger.error({ err }, 'GET /finance/funding-requests failed');
    res.status(500).json({ error: 'Failed to load funding requests.' });
  }
});

// ── GET /admin/finance/reversals ─────────────────────────────────────────
router.get('/finance/reversals', async (req: Request, res: Response): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt(String(req.query['page'] ?? '1')));
    const limit  = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '50'))));
    const offset = (page - 1) * limit;
    const from   = req.query['from'] as string | undefined;
    const to     = req.query['to'] as string | undefined;

    const rows = (await db.execute<Record<string, unknown>>(sql`
      SELECT tr.*, u.name AS customer_name, u.phone AS customer_phone,
        a.name AS performed_by_name, t.amount AS original_amount, t.type AS transaction_type
      FROM transaction_reversals tr
      LEFT JOIN users u ON u.id = tr.user_id
      LEFT JOIN admin_accounts a ON a.id = tr.performed_by
      LEFT JOIN transactions t ON t.id = tr.original_transaction_id
      WHERE 1=1
        ${from ? sql`AND tr.created_at >= ${from}::timestamptz` : sql``}
        ${to   ? sql`AND tr.created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
      ORDER BY tr.created_at DESC LIMIT ${limit} OFFSET ${offset}
    `)).rows;

    const countRow = (await db.execute<{ total: string }>(sql`
      SELECT COUNT(*)::text AS total FROM transaction_reversals tr WHERE 1=1
        ${from ? sql`AND tr.created_at >= ${from}::timestamptz` : sql``}
        ${to   ? sql`AND tr.created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
    `)).rows[0];

    res.json({
      reversals: rows,
      pagination: { page, limit, total: parseInt(countRow?.total ?? '0'), totalPages: Math.ceil(parseInt(countRow?.total ?? '0') / limit) },
    });
  } catch (err) {
    logger.error({ err }, 'GET /finance/reversals failed');
    res.status(500).json({ error: 'Failed to load reversals.' });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// WRITE ROUTES — permission-gated for finance staff; always open to super_admin
// ════════════════════════════════════════════════════════════════════════════

// ── SECURITY: Explicitly block deletion of transactions ──────────────────
// Transactions are immutable records. Use reversals instead.
router.delete('/finance/transactions/:id', (_req: Request, res: Response): void => {
  res.status(405).json({
    error: 'Transaction deletion is not permitted.',
    message: 'Completed financial transactions are immutable records. Use the reversal endpoint to refund a transaction.',
  });
});
router.delete('/transactions/:id', (_req: Request, res: Response): void => {
  res.status(405).json({
    error: 'Transaction deletion is not permitted.',
    message: 'Completed financial transactions are immutable records. Use the reversal endpoint to refund a transaction.',
  });
});

// ── POST /admin/finance/funding-requests/:id/approve ────────────────────
// Permission: approve_funding
router.post('/finance/funding-requests/:id/approve',
  requireFinancePermission('approve_funding'),
  async (req: Request, res: Response): Promise<void> => {
    const adminId   = req.session.adminId!;
    const adminRole = req.session.adminRole!;
    const { id }    = req.params as { id: string };
    const { note }  = req.body as { note?: string };

    try {
      const fr = (await db.execute<Record<string, unknown>>(
        sql`SELECT * FROM funding_requests WHERE id = ${id}::uuid LIMIT 1`
      )).rows[0];
      if (!fr) { res.status(404).json({ error: 'Funding request not found.' }); return; }
      if (String(fr['status']) !== 'pending') {
        res.status(409).json({ error: 'Only pending requests can be approved.' }); return;
      }

      const amount  = Number(fr['amount'] ?? 0);
      const userId  = String(fr['user_id']);
      const reference = String(fr['reference']);

      // Fetch customer info for audit
      const customer = (await db.execute<{ name: string }>(
        sql`SELECT name FROM users WHERE id = ${userId}::uuid LIMIT 1`
      )).rows[0];

      // Credit wallet + ledger + update request — all in one transaction
      let balanceBefore = 0, balanceAfter = 0;
      await db.transaction(async (tx) => {
        const wallet = (await tx.execute<{ id: string; balance: string }>(
          sql`SELECT id, balance FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE`
        )).rows[0];
        if (!wallet) throw new Error('Wallet not found');
        balanceBefore = Number(wallet.balance);
        balanceAfter  = balanceBefore + amount;

        await tx.execute(sql`
          UPDATE wallets SET balance = ${balanceAfter}, updated_at = NOW()
          WHERE user_id = ${userId}::uuid
        `);
        await tx.execute(sql`
          INSERT INTO wallet_ledger
            (user_id, type, amount, balance_before, balance_after, reference, reason, performed_by)
          VALUES
            (${userId}::uuid, 'wallet_fund', ${amount}, ${balanceBefore}, ${balanceAfter},
             ${reference}, ${'Funding request approved'}, ${adminId}::uuid)
        `);
        await tx.execute(sql`
          UPDATE funding_requests
          SET status = 'approved', reviewed_by = ${adminId}::uuid, reviewed_at = NOW()
          WHERE id = ${id}::uuid
        `);
      });

      void financialAuditLog({
        adminId, adminRole,
        action: 'approve_funding_request',
        entityType: 'funding_request', entityId: id,
        customerId: userId, customerName: customer?.name,
        previousValue: { status: 'pending', balance: balanceBefore },
        newValue: { status: 'approved', balance: balanceAfter, amount_credited: amount },
        reason: note ?? 'Funding request approved',
        ip: clientIp(req),
      });

      res.json({ ok: true, balanceBefore, balanceAfter, amount });
    } catch (err) {
      logger.error({ err }, 'POST /finance/funding-requests/:id/approve failed');
      res.status(500).json({ error: 'Failed to approve funding request.' });
    }
  }
);

// ── POST /admin/finance/funding-requests/:id/reject ─────────────────────
// Permission: approve_funding
router.post('/finance/funding-requests/:id/reject',
  requireFinancePermission('approve_funding'),
  async (req: Request, res: Response): Promise<void> => {
    const adminId   = req.session.adminId!;
    const adminRole = req.session.adminRole!;
    const { id }    = req.params as { id: string };
    const { reason } = req.body as { reason?: string };

    if (!reason?.trim()) {
      res.status(400).json({ error: 'A reason is required when rejecting a funding request.' });
      return;
    }

    try {
      const fr = (await db.execute<{ user_id: string; amount: string }>(
        sql`SELECT user_id, amount FROM funding_requests WHERE id = ${id}::uuid AND status = 'pending' LIMIT 1`
      )).rows[0];
      if (!fr) { res.status(409).json({ error: 'Request not found or already processed.' }); return; }

      await db.execute(sql`
        UPDATE funding_requests
        SET status = 'rejected', reviewed_by = ${adminId}::uuid, reviewed_at = NOW(), reject_reason = ${reason.trim()}
        WHERE id = ${id}::uuid
      `);

      const customer = (await db.execute<{ name: string }>(
        sql`SELECT name FROM users WHERE id = ${fr.user_id}::uuid LIMIT 1`
      )).rows[0];

      void financialAuditLog({
        adminId, adminRole,
        action: 'reject_funding_request',
        entityType: 'funding_request', entityId: id,
        customerId: fr.user_id, customerName: customer?.name,
        previousValue: { status: 'pending', amount: fr.amount },
        newValue: { status: 'rejected' },
        reason: reason.trim(),
        ip: clientIp(req),
      });

      res.json({ ok: true });
    } catch (err) {
      logger.error({ err }, 'POST /finance/funding-requests/:id/reject failed');
      res.status(500).json({ error: 'Failed to reject funding request.' });
    }
  }
);

// ── POST /admin/finance/users/:id/wallet/adjust ─────────────────────────
// Permission: adjust_wallet
// Creates a wallet_ledger adjustment entry. Never silently overwrites balance.
router.post('/finance/users/:id/wallet/adjust',
  requireFinancePermission('adjust_wallet'),
  async (req: Request, res: Response): Promise<void> => {
    const adminId   = req.session.adminId!;
    const adminRole = req.session.adminRole!;
    const { id }    = req.params as { id: string };
    const { type, amount, reason } = req.body as {
      type?: 'credit' | 'debit'; amount?: number; reason?: string;
    };

    if (!type || !['credit', 'debit'].includes(type)) {
      res.status(400).json({ error: 'type must be "credit" or "debit".' });
      return;
    }
    if (!amount || Number(amount) <= 0) {
      res.status(400).json({ error: 'amount must be a positive number.' });
      return;
    }
    if (!reason?.trim()) {
      res.status(400).json({ error: 'reason is mandatory for all wallet adjustments.' });
      return;
    }
    if (Number(amount) > 1_000_000) {
      res.status(400).json({ error: 'Finance staff wallet adjustments cannot exceed ₦1,000,000. Contact a Super Admin for larger amounts.' });
      return;
    }

    const numericAmount = Number(amount);
    const ref = makeRef('FADJ');

    try {
      // Fetch customer name for audit
      const customer = (await db.execute<{ name: string }>(
        sql`SELECT name FROM users WHERE id = ${id}::uuid LIMIT 1`
      )).rows[0];
      if (!customer) { res.status(404).json({ error: 'User not found.' }); return; }

      let balanceBefore = 0, balanceAfter = 0;
      await db.transaction(async (tx) => {
        const wallet = (await tx.execute<{ balance: string }>(
          sql`SELECT balance FROM wallets WHERE user_id = ${id}::uuid FOR UPDATE`
        )).rows[0];
        if (!wallet) throw new Error('Wallet not found');
        balanceBefore = Number(wallet.balance);
        balanceAfter  = type === 'credit'
          ? balanceBefore + numericAmount
          : balanceBefore - numericAmount;

        if (balanceAfter < 0) throw Object.assign(new Error('Insufficient balance'), { code: 'INSUFFICIENT' });

        await tx.execute(sql`
          UPDATE wallets SET balance = ${balanceAfter}, updated_at = NOW()
          WHERE user_id = ${id}::uuid
        `);
        await tx.execute(sql`
          INSERT INTO wallet_ledger
            (user_id, type, amount, balance_before, balance_after, reference, performed_by, reason)
          VALUES
            (${id}::uuid, ${type}, ${numericAmount}, ${balanceBefore}, ${balanceAfter},
             ${ref}, ${adminId}::uuid, ${reason!.trim()})
        `);
      });

      void financialAuditLog({
        adminId, adminRole,
        action: `wallet_${type}`,
        entityType: 'wallet', entityId: id,
        customerId: id, customerName: customer.name,
        previousValue: { balance: balanceBefore },
        newValue: { balance: balanceAfter, adjustment: numericAmount, direction: type },
        reason: reason!.trim(),
        ip: clientIp(req),
      });

      res.json({ ok: true, reference: ref, balanceBefore, balanceAfter, type, amount: numericAmount });
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      if (e.code === 'INSUFFICIENT') { res.status(400).json({ error: 'Insufficient wallet balance for this debit.' }); return; }
      if (e.message === 'Wallet not found') { res.status(404).json({ error: 'Wallet not found.' }); return; }
      logger.error({ err }, 'POST /finance/users/:id/wallet/adjust failed');
      res.status(500).json({ error: 'Failed to adjust wallet.' });
    }
  }
);

// ── POST /admin/finance/transactions/:id/reverse ─────────────────────────
// Permission: process_refunds
// Creates a reversal record — does NOT modify the original transaction row.
router.post('/finance/transactions/:id/reverse',
  requireFinancePermission('process_refunds'),
  async (req: Request, res: Response): Promise<void> => {
    const adminId   = req.session.adminId!;
    const adminRole = req.session.adminRole!;
    const { id }    = req.params as { id: string };
    const { reason } = req.body as { reason?: string };

    if (!reason?.trim()) {
      res.status(400).json({ error: 'reason is required for all reversals.' });
      return;
    }

    try {
      const txn = (await db.execute<Record<string, unknown>>(
        sql`SELECT * FROM transactions WHERE id = ${id}::uuid LIMIT 1`
      )).rows[0];
      if (!txn) { res.status(404).json({ error: 'Transaction not found.' }); return; }

      if (String(txn['status']) !== 'success') {
        res.status(400).json({ error: 'Only successful transactions can be reversed.' }); return;
      }

      const existing = (await db.execute<{ id: string }>(
        sql`SELECT id FROM transaction_reversals WHERE original_transaction_id = ${id}::uuid LIMIT 1`
      )).rows[0];
      if (existing) { res.status(409).json({ error: 'This transaction has already been reversed.' }); return; }

      const userId = String(txn['user_id']);
      const amount = Number(txn['amount']);
      const ref    = makeRef('FREV');

      const customer = (await db.execute<{ name: string }>(
        sql`SELECT name FROM users WHERE id = ${userId}::uuid LIMIT 1`
      )).rows[0];

      let balanceBefore = 0, balanceAfter = 0, ledgerEntryId = '';

      await db.transaction(async (tx) => {
        const wallet = (await tx.execute<{ balance: string }>(
          sql`SELECT balance FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE`
        )).rows[0];
        if (!wallet) throw new Error('Wallet not found');
        balanceBefore = Number(wallet.balance);
        balanceAfter  = balanceBefore + amount;

        await tx.execute(sql`
          UPDATE wallets SET balance = ${balanceAfter}, updated_at = NOW()
          WHERE user_id = ${userId}::uuid
        `);

        const ledger = (await tx.execute<{ id: string }>(sql`
          INSERT INTO wallet_ledger
            (user_id, type, amount, balance_before, balance_after, reference, related_transaction_id, performed_by, reason)
          VALUES
            (${userId}::uuid, 'reversal', ${amount}, ${balanceBefore}, ${balanceAfter},
             ${ref}, ${id}::uuid, ${adminId}::uuid, ${reason!.trim()})
          RETURNING id
        `)).rows[0];
        ledgerEntryId = ledger!.id;

        await tx.execute(sql`
          INSERT INTO transaction_reversals (original_transaction_id, user_id, amount, reason, performed_by, wallet_ledger_id)
          VALUES (${id}::uuid, ${userId}::uuid, ${amount}, ${reason!.trim()}, ${adminId}::uuid, ${ledgerEntryId}::uuid)
        `);
      });

      void financialAuditLog({
        adminId, adminRole,
        action: 'transaction_reversed',
        entityType: 'transaction', entityId: id,
        customerId: userId, customerName: customer?.name,
        previousValue: {
          transaction_status: txn['status'],
          wallet_balance: balanceBefore,
          amount: txn['amount'],
          reference: txn['reference'],
        },
        newValue: {
          reversal_reference: ref,
          wallet_balance: balanceAfter,
          amount_refunded: amount,
        },
        reason: reason!.trim(),
        ip: clientIp(req),
      });

      res.json({ ok: true, reference: ref, amount, balanceBefore, balanceAfter });
    } catch (err: unknown) {
      const e = err as { message?: string };
      if (e.message === 'Wallet not found') { res.status(404).json({ error: 'Wallet not found.' }); return; }
      logger.error({ err }, 'POST /finance/transactions/:id/reverse failed');
      res.status(500).json({ error: 'Failed to reverse transaction.' });
    }
  }
);

// ── GET /admin/finance/wallet-ledger ──────────────────────────────────────
// Read-only: paginated wallet ledger (all users). Finance + super_admin.
router.get('/finance/wallet-ledger', async (req: Request, res: Response): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt(String(req.query['page'] ?? '1')));
    const limit  = Math.min(200, Math.max(1, parseInt(String(req.query['limit'] ?? '50'))));
    const offset = (page - 1) * limit;
    const userId = req.query['user_id'] as string | undefined;
    const type   = req.query['type'] as string | undefined;
    const from   = req.query['from'] as string | undefined;
    const to     = req.query['to'] as string | undefined;

    const rows = (await db.execute<Record<string, unknown>>(sql`
      SELECT wl.*, u.name AS customer_name, u.phone AS customer_phone
      FROM wallet_ledger wl
      LEFT JOIN users u ON u.id = wl.user_id
      WHERE 1=1
        ${userId ? sql`AND wl.user_id = ${userId}::uuid` : sql``}
        ${type   ? sql`AND wl.type = ${type}` : sql``}
        ${from   ? sql`AND wl.created_at >= ${from}::timestamptz` : sql``}
        ${to     ? sql`AND wl.created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
      ORDER BY wl.created_at DESC LIMIT ${limit} OFFSET ${offset}
    `)).rows;

    const countRow = (await db.execute<{ total: string; total_amount: string }>(sql`
      SELECT COUNT(*)::text AS total,
        COALESCE(SUM(amount), 0)::text AS total_amount
      FROM wallet_ledger wl
      WHERE 1=1
        ${userId ? sql`AND wl.user_id = ${userId}::uuid` : sql``}
        ${type   ? sql`AND wl.type = ${type}` : sql``}
        ${from   ? sql`AND wl.created_at >= ${from}::timestamptz` : sql``}
        ${to     ? sql`AND wl.created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
    `)).rows[0];

    res.json({
      entries: rows,
      pagination: {
        page, limit,
        total: parseInt(countRow?.total ?? '0'),
        totalPages: Math.ceil(parseInt(countRow?.total ?? '0') / limit),
      },
      summary: { total_amount: countRow?.total_amount ?? '0' },
    });
  } catch (err) {
    logger.error({ err }, 'GET /finance/wallet-ledger failed');
    res.status(500).json({ error: 'Failed to load wallet ledger.' });
  }
});

export default router;
