/**
 * cashback.ts — Super-Admin-only cashback management endpoints.
 *
 * Routes:
 *   GET  /admin/cashback/settings         — get global cashback on/off
 *   PATCH /admin/cashback/settings        — toggle global cashback
 *   GET  /admin/cashback/plans            — list all data plans with cashback config
 *   PATCH /admin/cashback/plans/:id       — update cashback for a single plan
 *   POST  /admin/cashback/plans/bulk      — bulk-update cashback for a network
 *   GET  /admin/cashback/reports          — cashback reports (totals, by date/user/network/plan)
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
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

// ── GET /admin/cashback/settings ──────────────────────────────────────────────

router.get('/cashback/settings', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute<{
      id: string; enabled: boolean; updated_at: string;
      min_transfer_amount: string; transfer_mode: string; eligible_services: unknown;
    }>(sql`
      SELECT id, enabled, updated_at, min_transfer_amount, transfer_mode, eligible_services
      FROM cashback_settings LIMIT 1
    `);
    const row = result.rows[0];
    if (!row) {
      res.json({ enabled: false, minTransferAmount: 100, transferMode: 'manual', eligibleServices: ['data'] });
      return;
    }
    res.json({
      enabled:           row.enabled,
      updatedAt:         row.updated_at,
      minTransferAmount: parseFloat(row.min_transfer_amount ?? '100'),
      transferMode:      row.transfer_mode ?? 'manual',
      eligibleServices:  row.eligible_services ?? ['data'],
    });
  } catch (err) {
    logger.error({ err }, 'GET /cashback/settings failed');
    res.status(500).json({ error: 'Failed to load cashback settings.' });
  }
});

// ── PATCH /admin/cashback/settings ────────────────────────────────────────────

router.patch('/cashback/settings', async (req: Request, res: Response): Promise<void> => {
  const { enabled, minTransferAmount, transferMode, eligibleServices } = req.body as {
    enabled?: boolean;
    minTransferAmount?: number;
    transferMode?: 'manual' | 'auto';
    eligibleServices?: string[];
  };

  const hasAny = typeof enabled === 'boolean'
    || typeof minTransferAmount === 'number'
    || transferMode !== undefined
    || eligibleServices !== undefined;

  if (!hasAny) {
    res.status(400).json({ error: 'At least one field is required: enabled, minTransferAmount, transferMode, eligibleServices.' });
    return;
  }
  if (transferMode !== undefined && transferMode !== 'manual' && transferMode !== 'auto') {
    res.status(400).json({ error: 'transferMode must be "manual" or "auto".' });
    return;
  }
  if (typeof minTransferAmount === 'number' && (minTransferAmount < 0 || !Number.isFinite(minTransferAmount))) {
    res.status(400).json({ error: 'minTransferAmount must be a non-negative number.' });
    return;
  }

  try {
    await db.execute(sql`
      UPDATE cashback_settings
      SET
        enabled             = ${typeof enabled === 'boolean' ? enabled : sql`enabled`},
        min_transfer_amount = ${typeof minTransferAmount === 'number' ? minTransferAmount.toFixed(2) : sql`min_transfer_amount`},
        transfer_mode       = ${transferMode ?? sql`transfer_mode`},
        eligible_services   = ${eligibleServices !== undefined ? JSON.stringify(eligibleServices) : sql`eligible_services`}::jsonb,
        updated_by          = ${req.session.adminId!}::uuid,
        updated_at          = NOW()
    `);
    logger.info({ adminId: req.session.adminId, enabled, minTransferAmount, transferMode, eligibleServices }, 'Cashback global settings updated');
    res.json({ ok: true, enabled, minTransferAmount, transferMode, eligibleServices });
  } catch (err) {
    logger.error({ err }, 'PATCH /cashback/settings failed');
    res.status(500).json({ error: 'Failed to update cashback settings.' });
  }
});

// ── GET /admin/cashback/plans ─────────────────────────────────────────────────
// Returns all data pricing rules enriched with their cashback columns.

router.get('/cashback/plans', async (req: Request, res: Response): Promise<void> => {
  const network = (req.query['network'] as string | undefined)?.toUpperCase();
  try {
    const result = await db.execute(sql`
      SELECT
        id, service_type, provider, network, plan_id, plan_name,
        cost_price, selling_price, enabled,
        cashback_enabled, cashback_type, cashback_value,
        updated_at
      FROM pricing_rules
      WHERE service_type = 'data'
        ${network ? sql`AND (network = ${network} OR provider = ${network})` : sql``}
      ORDER BY network, plan_name
    `);
    res.json({ plans: result.rows });
  } catch (err) {
    logger.error({ err }, 'GET /cashback/plans failed');
    res.status(500).json({ error: 'Failed to load cashback plans.' });
  }
});

// ── PATCH /admin/cashback/plans/:id ──────────────────────────────────────────
// Update cashback settings for a single pricing rule.

router.patch('/cashback/plans/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };
  const { cashbackEnabled, cashbackType, cashbackValue } = req.body as {
    cashbackEnabled?: boolean;
    cashbackType?: 'percentage' | 'fixed';
    cashbackValue?: number;
  };

  const updates: string[] = [];
  if (typeof cashbackEnabled === 'boolean') updates.push(`cashback_enabled = ${cashbackEnabled}`);
  if (cashbackType === 'percentage' || cashbackType === 'fixed') updates.push(`cashback_type = '${cashbackType}'`);
  if (typeof cashbackValue === 'number' && cashbackValue >= 0) updates.push(`cashback_value = ${cashbackValue.toFixed(2)}`);

  if (updates.length === 0) {
    res.status(400).json({ error: 'No valid fields provided.' });
    return;
  }

  try {
    const result = await db.execute(sql`
      UPDATE pricing_rules
      SET
        cashback_enabled = ${typeof cashbackEnabled === 'boolean' ? cashbackEnabled : sql`cashback_enabled`},
        cashback_type    = ${cashbackType ?? sql`cashback_type`},
        cashback_value   = ${typeof cashbackValue === 'number' ? cashbackValue.toFixed(2) : sql`cashback_value`},
        updated_at       = NOW()
      WHERE id = ${id}::uuid AND service_type = 'data'
      RETURNING id, plan_name, cashback_enabled, cashback_type, cashback_value
    `);

    if (!result.rows[0]) {
      res.status(404).json({ error: 'Pricing rule not found.' });
      return;
    }

    res.json({ ok: true, plan: result.rows[0] });
  } catch (err) {
    logger.error({ err, id }, 'PATCH /cashback/plans/:id failed');
    res.status(500).json({ error: 'Failed to update cashback plan.' });
  }
});

// ── POST /admin/cashback/plans/bulk ──────────────────────────────────────────
// Bulk-update cashback for all plans of a specific network (or all data plans).

router.post('/cashback/plans/bulk', async (req: Request, res: Response): Promise<void> => {
  const { network, cashbackEnabled, cashbackType, cashbackValue } = req.body as {
    network?: string;
    cashbackEnabled?: boolean;
    cashbackType?: 'percentage' | 'fixed';
    cashbackValue?: number;
  };

  if (typeof cashbackEnabled !== 'boolean' && cashbackType === undefined && cashbackValue === undefined) {
    res.status(400).json({ error: 'At least one of cashbackEnabled, cashbackType, or cashbackValue is required.' });
    return;
  }

  try {
    const result = await db.execute(sql`
      UPDATE pricing_rules
      SET
        cashback_enabled = ${typeof cashbackEnabled === 'boolean' ? cashbackEnabled : sql`cashback_enabled`},
        cashback_type    = ${cashbackType ?? sql`cashback_type`},
        cashback_value   = ${typeof cashbackValue === 'number' ? cashbackValue.toFixed(2) : sql`cashback_value`},
        updated_at       = NOW()
      WHERE service_type = 'data'
        ${network ? sql`AND (network = ${network.toUpperCase()} OR provider = ${network.toUpperCase()})` : sql``}
    `);

    const updated = (result as unknown as { rowCount?: number }).rowCount ?? 0;
    logger.info({ adminId: req.session.adminId, network, cashbackEnabled, cashbackType, cashbackValue, updated }, 'Bulk cashback update');
    res.json({ ok: true, updated });
  } catch (err) {
    logger.error({ err }, 'POST /cashback/plans/bulk failed');
    res.status(500).json({ error: 'Failed to bulk update cashback plans.' });
  }
});

// ── GET /admin/cashback/reports ───────────────────────────────────────────────
// Cashback analytics: totals, by date, by network, by plan, by user.

router.get('/cashback/reports', async (req: Request, res: Response): Promise<void> => {
  const from = (req.query['from'] as string | undefined);
  const to   = (req.query['to']   as string | undefined);

  const fromTs = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const toTs   = to   ? new Date(to)   : new Date();

  try {
    const [totals, byDate, byNetwork, byPlan, byUser] = await Promise.all([
      // Overall totals
      db.execute(sql`
        SELECT
          COUNT(*)                          AS total_count,
          COALESCE(SUM(amount), 0)          AS total_amount,
          COALESCE(AVG(amount), 0)          AS avg_amount,
          COUNT(DISTINCT user_id)           AS unique_users,
          COUNT(DISTINCT network)           AS unique_networks
        FROM cashback_transactions
        WHERE created_at BETWEEN ${fromTs.toISOString()} AND ${toTs.toISOString()}
      `),
      // By day
      db.execute(sql`
        SELECT
          DATE(created_at)          AS day,
          COUNT(*)                  AS count,
          COALESCE(SUM(amount), 0)  AS total
        FROM cashback_transactions
        WHERE created_at BETWEEN ${fromTs.toISOString()} AND ${toTs.toISOString()}
        GROUP BY DATE(created_at)
        ORDER BY day DESC
        LIMIT 90
      `),
      // By network
      db.execute(sql`
        SELECT
          COALESCE(network, 'Unknown')  AS network,
          COUNT(*)                      AS count,
          COALESCE(SUM(amount), 0)      AS total
        FROM cashback_transactions
        WHERE created_at BETWEEN ${fromTs.toISOString()} AND ${toTs.toISOString()}
        GROUP BY network
        ORDER BY total DESC
      `),
      // By plan
      db.execute(sql`
        SELECT
          COALESCE(plan_name, plan_id, 'Unknown')  AS plan_name,
          COALESCE(network, 'Unknown')              AS network,
          COUNT(*)                                  AS count,
          COALESCE(SUM(amount), 0)                  AS total
        FROM cashback_transactions
        WHERE created_at BETWEEN ${fromTs.toISOString()} AND ${toTs.toISOString()}
        GROUP BY plan_name, plan_id, network
        ORDER BY total DESC
        LIMIT 50
      `),
      // By user (top 50)
      db.execute(sql`
        SELECT
          ct.user_id,
          u.name       AS user_name,
          u.phone      AS user_phone,
          COUNT(*)                  AS count,
          COALESCE(SUM(ct.amount), 0) AS total
        FROM cashback_transactions ct
        JOIN users u ON u.id = ct.user_id
        WHERE ct.created_at BETWEEN ${fromTs.toISOString()} AND ${toTs.toISOString()}
        GROUP BY ct.user_id, u.name, u.phone
        ORDER BY total DESC
        LIMIT 50
      `),
    ]);

    res.json({
      period: { from: fromTs.toISOString(), to: toTs.toISOString() },
      totals: totals.rows[0],
      byDate: byDate.rows,
      byNetwork: byNetwork.rows,
      byPlan: byPlan.rows,
      byUser: byUser.rows,
    });
  } catch (err) {
    logger.error({ err }, 'GET /cashback/reports failed');
    res.status(500).json({ error: 'Failed to load cashback reports.' });
  }
});

export default router;
