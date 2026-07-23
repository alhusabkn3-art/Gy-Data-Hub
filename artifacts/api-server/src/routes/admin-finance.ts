/**
 * /api/admin — Finance role endpoints.
 *
 * Accessible to both 'finance' and 'super_admin' roles (read-only for finance).
 * Super admins already have these via admin-super.ts; this router provides
 * the subset that finance staff need without full super-admin access.
 *
 * Routes mounted at /api/admin (same prefix as admin.ts / admin-super.ts).
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

const router = Router();

// ── Auth guard ─────────────────────────────────────────────────────────────

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

router.use(requireFinanceOrSuperAdmin);

// ── GET /admin/finance/overview ────────────────────────────────────────────
// High-level financial summary: revenue, costs, wallet balances, funding requests.
router.get('/finance/overview', async (_req: Request, res: Response): Promise<void> => {
  try {
    const [revenue] = await db.execute<{
      total_revenue: string;
      today_revenue: string;
      this_month_revenue: string;
      total_transactions: string;
      successful_transactions: string;
    }>(sql`
      SELECT
        COALESCE(SUM(amount), 0)::text AS total_revenue,
        COALESCE(SUM(CASE WHEN created_at >= CURRENT_DATE THEN amount ELSE 0 END), 0)::text AS today_revenue,
        COALESCE(SUM(CASE WHEN created_at >= date_trunc('month', NOW()) THEN amount ELSE 0 END), 0)::text AS this_month_revenue,
        COUNT(*)::text AS total_transactions,
        COUNT(CASE WHEN status = 'success' THEN 1 END)::text AS successful_transactions
      FROM transactions
      WHERE status IN ('success', 'failed')
    `);

    const [walletSummary] = await db.execute<{
      total_wallet_balance: string;
      total_wallets: string;
      funded_wallets: string;
    }>(sql`
      SELECT
        COALESCE(SUM(balance), 0)::text AS total_wallet_balance,
        COUNT(*)::text AS total_wallets,
        COUNT(CASE WHEN balance > 0 THEN 1 END)::text AS funded_wallets
      FROM wallets
    `);

    const [funding] = await db.execute<{
      pending_count: string;
      pending_amount: string;
      approved_today: string;
      approved_amount_today: string;
    }>(sql`
      SELECT
        COUNT(CASE WHEN status = 'pending' THEN 1 END)::text AS pending_count,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0)::text AS pending_amount,
        COUNT(CASE WHEN status = 'approved' AND updated_at >= CURRENT_DATE THEN 1 END)::text AS approved_today,
        COALESCE(SUM(CASE WHEN status = 'approved' AND updated_at >= CURRENT_DATE THEN amount ELSE 0 END), 0)::text AS approved_amount_today
      FROM funding_requests
    `);

    const [costData] = await db.execute<{
      total_cost: string;
      gross_profit: string;
    }>(sql`
      SELECT
        COALESCE(SUM(cost_price), 0)::text AS total_cost,
        COALESCE(SUM(amount) - SUM(COALESCE(cost_price, amount)), 0)::text AS gross_profit
      FROM transactions
      WHERE status = 'success'
    `);

    // Weekly revenue chart (last 7 days)
    const weeklyRows = await db.execute<{ day: string; revenue: string; cost: string }>(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('day', created_at), 'YYYY-MM-DD') AS day,
        COALESCE(SUM(amount), 0)::text AS revenue,
        COALESCE(SUM(COALESCE(cost_price, 0)), 0)::text AS cost
      FROM transactions
      WHERE status = 'success'
        AND created_at >= NOW() - INTERVAL '7 days'
      GROUP BY DATE_TRUNC('day', created_at)
      ORDER BY day ASC
    `);

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

// ── GET /admin/finance/pricing-audit ───────────────────────────────────────
// Paginated pricing change audit log.
router.get('/finance/pricing-audit', async (req: Request, res: Response): Promise<void> => {
  try {
    const page    = Math.max(1, parseInt(String(req.query['page'] ?? '1')));
    const limit   = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '50'))));
    const offset  = (page - 1) * limit;
    const service = req.query['service_type'] as string | undefined;
    const adminId = req.query['admin_id'] as string | undefined;
    const from    = req.query['from'] as string | undefined;
    const to      = req.query['to'] as string | undefined;

    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT
        pal.*,
        pr.service_type AS current_service_type,
        pr.provider AS current_provider,
        pr.plan_name AS current_plan_name
      FROM pricing_audit_logs pal
      LEFT JOIN pricing_rules pr ON pr.id = pal.pricing_rule_id
      WHERE 1=1
        ${service ? sql`AND pal.service_type = ${service}` : sql``}
        ${adminId ? sql`AND pal.admin_id = ${adminId}::uuid` : sql``}
        ${from    ? sql`AND pal.created_at >= ${from}::timestamptz` : sql``}
        ${to      ? sql`AND pal.created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
      ORDER BY pal.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const [countRow] = await db.execute<{ total: string }>(sql`
      SELECT COUNT(*)::text AS total FROM pricing_audit_logs
      WHERE 1=1
        ${service ? sql`AND service_type = ${service}` : sql``}
        ${adminId ? sql`AND admin_id = ${adminId}::uuid` : sql``}
        ${from    ? sql`AND created_at >= ${from}::timestamptz` : sql``}
        ${to      ? sql`AND created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
    `);

    res.json({
      logs: rows,
      pagination: {
        page,
        limit,
        total: parseInt(countRow?.total ?? '0'),
        totalPages: Math.ceil(parseInt(countRow?.total ?? '0') / limit),
      },
    });
  } catch (err) {
    logger.error({ err }, 'GET /finance/pricing-audit failed');
    res.status(500).json({ error: 'Failed to load pricing audit logs.' });
  }
});

// ── GET /admin/finance/transactions ────────────────────────────────────────
// Finance-accessible transaction list with full date-range and cost_price data.
router.get('/finance/transactions', async (req: Request, res: Response): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt(String(req.query['page'] ?? '1')));
    const limit  = Math.min(200, Math.max(1, parseInt(String(req.query['limit'] ?? '50'))));
    const offset = (page - 1) * limit;
    const from   = req.query['from'] as string | undefined;
    const to     = req.query['to'] as string | undefined;
    const type   = req.query['type'] as string | undefined;
    const status = req.query['status'] as string | undefined;

    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT
        t.*,
        u.name AS customer_name,
        u.phone AS customer_phone
      FROM transactions t
      LEFT JOIN users u ON u.id = t.user_id
      WHERE 1=1
        ${from   ? sql`AND t.created_at >= ${from}::timestamptz` : sql``}
        ${to     ? sql`AND t.created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
        ${type   ? sql`AND t.type = ${type}` : sql``}
        ${status ? sql`AND t.status = ${status}` : sql``}
      ORDER BY t.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const [countRow] = await db.execute<{ total: string; total_amount: string; total_cost: string }>(sql`
      SELECT
        COUNT(*)::text AS total,
        COALESCE(SUM(amount), 0)::text AS total_amount,
        COALESCE(SUM(COALESCE(cost_price, 0)), 0)::text AS total_cost
      FROM transactions t
      WHERE 1=1
        ${from   ? sql`AND t.created_at >= ${from}::timestamptz` : sql``}
        ${to     ? sql`AND t.created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
        ${type   ? sql`AND t.type = ${type}` : sql``}
        ${status ? sql`AND t.status = ${status}` : sql``}
    `);

    res.json({
      transactions: rows,
      pagination: {
        page,
        limit,
        total: parseInt(countRow?.total ?? '0'),
        totalPages: Math.ceil(parseInt(countRow?.total ?? '0') / limit),
      },
      summary: {
        total_amount: countRow?.total_amount ?? '0',
        total_cost: countRow?.total_cost ?? '0',
        gross_profit: (
          parseFloat(countRow?.total_amount ?? '0') -
          parseFloat(countRow?.total_cost ?? '0')
        ).toFixed(2),
      },
    });
  } catch (err) {
    logger.error({ err }, 'GET /finance/transactions failed');
    res.status(500).json({ error: 'Failed to load transactions.' });
  }
});

// ── GET /admin/finance/funding-requests ────────────────────────────────────
// Finance-accessible funding request list (read-only).
router.get('/finance/funding-requests', async (req: Request, res: Response): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt(String(req.query['page'] ?? '1')));
    const limit  = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '50'))));
    const offset = (page - 1) * limit;
    const status = req.query['status'] as string | undefined;
    const from   = req.query['from'] as string | undefined;
    const to     = req.query['to'] as string | undefined;

    const rows = await db.execute<Record<string, unknown>>(sql`
      SELECT
        fr.*,
        u.name AS customer_name,
        u.phone AS customer_phone,
        a.name AS reviewed_by_name
      FROM funding_requests fr
      LEFT JOIN users u ON u.id = fr.user_id
      LEFT JOIN admin_accounts a ON a.id = fr.reviewed_by
      WHERE 1=1
        ${status ? sql`AND fr.status = ${status}` : sql``}
        ${from   ? sql`AND fr.created_at >= ${from}::timestamptz` : sql``}
        ${to     ? sql`AND fr.created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
      ORDER BY fr.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const [countRow] = await db.execute<{ total: string }>(sql`
      SELECT COUNT(*)::text AS total FROM funding_requests fr
      WHERE 1=1
        ${status ? sql`AND fr.status = ${status}` : sql``}
        ${from   ? sql`AND fr.created_at >= ${from}::timestamptz` : sql``}
        ${to     ? sql`AND fr.created_at <= ${to}::timestamptz + interval '1 day'` : sql``}
    `);

    res.json({
      requests: rows,
      pagination: {
        page,
        limit,
        total: parseInt(countRow?.total ?? '0'),
        totalPages: Math.ceil(parseInt(countRow?.total ?? '0') / limit),
      },
    });
  } catch (err) {
    logger.error({ err }, 'GET /finance/funding-requests failed');
    res.status(500).json({ error: 'Failed to load funding requests.' });
  }
});

export default router;
