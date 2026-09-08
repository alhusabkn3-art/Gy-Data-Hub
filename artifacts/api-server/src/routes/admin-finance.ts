/**
 * /api/admin — Finance Department routes.
 *
 * Access model:
 *   super_admin  → full read + write for all finance operations.
 *   finance      → read-only by default; specific write actions unlocked per-account
 *                  via the `finance_permissions` JSONB array on admin_accounts.
 *
 * Grantable permissions:
 *   'approve_funding'
 *   'process_refunds'
 *   'adjust_wallet'
 *   'manage_pricing'
 *   'export_reports'
 *
 * Security invariants:
 *   – Completed transactions are IMMUTABLE.
 *   – Every financial mutation writes an audit row.
 *   – reason is mandatory for every write operation.
 *   – All guards are server-side.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { financialAuditLog } from '../lib/financial-audit.js';

const router = Router();

export const FINANCE_PERMISSIONS = [
  'approve_funding',
  'process_refunds',
  'adjust_wallet',
  'manage_pricing',
  'export_reports',
] as const;

export type FinancePermission = typeof FINANCE_PERMISSIONS[number];

function clientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket?.remoteAddress ??
    'unknown'
  );
}

function makeRef(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function requireFinanceOrSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session.isAdmin || !req.session.adminId) {
    res.status(401).json({ error: 'Unauthorised.' });
    return;
  }

  const role = req.session.adminRole;

  if (role !== 'super_admin' && role !== 'finance') {
    res.status(403).json({
      error: 'Finance or super-admin access required.',
    });
    return;
  }

  next();
}

function requireFinancePermission(permission: FinancePermission) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    if (!req.session.isAdmin || !req.session.adminId) {
      res.status(401).json({ error: 'Unauthorised.' });
      return;
    }

    const role = req.session.adminRole;

    if (role === 'super_admin') {
      next();
      return;
    }

    if (role !== 'finance') {
      res.status(403).json({
        error: 'Finance or super-admin access required.',
      });
      return;
    }

    try {
      const account = (
        await db.execute<{ finance_permissions: string[] | null }>(
          sql`
            SELECT finance_permissions
            FROM admin_accounts
            WHERE id = ${req.session.adminId}::uuid
            LIMIT 1
          `,
        )
      ).rows[0];

      const perms: string[] = Array.isArray(account?.finance_permissions)
        ? account.finance_permissions
        : [];

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
      res.status(500).json({
        error: 'Failed to verify permissions.',
      });
    }
  };
}

router.use(requireFinanceOrSuperAdmin);

// ════════════════════════════════════════════════════════════════════════════
// READ-ONLY ROUTES
// ════════════════════════════════════════════════════════════════════════════

router.get(
  '/finance/permissions-info',
  (_req: Request, res: Response): void => {
    res.json({
      permissions: FINANCE_PERMISSIONS.map((p) => ({
        key: p,
        label: {
          approve_funding: 'Approve / Reject Funding Requests',
          process_refunds: 'Process Transaction Reversals & Refunds',
          adjust_wallet: 'Manually Adjust Customer Wallet Balances',
          manage_pricing: 'Update Service Pricing Rules',
          export_reports: 'Export Financial Reports',
        }[p] ?? p,
        description: {
          approve_funding:
            'Can approve or reject pending wallet funding requests, which credits the customer wallet.',
          process_refunds:
            'Can initiate refunds by reversing successful transactions and crediting the customer wallet.',
          adjust_wallet:
            'Can manually credit or debit a customer wallet with mandatory reason and audit trail.',
          manage_pricing:
            'Can update service pricing rules. Changes are logged to the pricing audit log.',
          export_reports:
            'Can export financial data and reports as CSV or other formats.',
        }[p] ?? '',
      })),
    });
  },
);

router.get(
  '/finance/my-permissions',
  async (req: Request, res: Response): Promise<void> => {
    if (req.session.adminRole === 'super_admin') {
      res.json({
        role: 'super_admin',
        permissions: FINANCE_PERMISSIONS,
        full_access: true,
      });
      return;
    }

    try {
      const account = (
        await db.execute<{ finance_permissions: string[] | null }>(
          sql`
            SELECT finance_permissions
            FROM admin_accounts
            WHERE id = ${req.session.adminId!}::uuid
            LIMIT 1
          `,
        )
      ).rows[0];

      res.json({
        role: req.session.adminRole,
        permissions: account?.finance_permissions ?? [],
        full_access: false,
      });
    } catch (err) {
      logger.error({ err }, 'GET /finance/my-permissions failed');
      res.status(500).json({
        error: 'Failed to load permissions.',
      });
    }
  },
);

router.get(
  '/finance/overview',
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const revenue = (
        await db.execute<{
          total_revenue: string;
          today_revenue: string;
          this_month_revenue: string;
          total_transactions: string;
          successful_transactions: string;
        }>(
          sql`
            SELECT
              COALESCE(SUM(amount), 0)::text AS total_revenue,
              COALESCE(
                SUM(
                  CASE
                    WHEN created_at >= CURRENT_DATE THEN amount
                    ELSE 0
                  END
                ),
                0
              )::text AS today_revenue,
              COALESCE(
                SUM(
                  CASE
                    WHEN created_at >= date_trunc('month', NOW()) THEN amount
                    ELSE 0
                  END
                ),
                0
              )::text AS this_month_revenue,
              COUNT(*)::text AS total_transactions,
              COUNT(
                CASE WHEN status = 'success' THEN 1 END
              )::text AS successful_transactions
            FROM transactions
            WHERE status IN ('success', 'failed')
          `,
        )
      ).rows[0];

      const walletSummary = (
        await db.execute<{
          total_wallet_balance: string;
          total_wallets: string;
          funded_wallets: string;
        }>(
          sql`
            SELECT
              COALESCE(SUM(balance), 0)::text AS total_wallet_balance,
              COUNT(*)::text AS total_wallets,
              COUNT(
                CASE WHEN balance > 0 THEN 1 END
              )::text AS funded_wallets
            FROM wallets
          `,
        )
      ).rows[0];

      const funding = (
        await db.execute<{
          pending_count: string;
          pending_amount: string;
          approved_today: string;
          approved_amount_today: string;
        }>(
          sql`
            SELECT
              COUNT(
                CASE WHEN status = 'pending' THEN 1 END
              )::text AS pending_count,
              COALESCE(
                SUM(
                  CASE
                    WHEN status = 'pending' THEN amount
                    ELSE 0
                  END
                ),
                0
              )::text AS pending_amount,
              COUNT(
                CASE
                  WHEN status = 'approved'
                   AND updated_at >= CURRENT_DATE
                  THEN 1
                END
              )::text AS approved_today,
              COALESCE(
                SUM(
                  CASE
                    WHEN status = 'approved'
                     AND updated_at >= CURRENT_DATE
                    THEN amount
                    ELSE 0
                  END
                ),
                0
              )::text AS approved_amount_today
            FROM funding_requests
          `,
        )
      ).rows[0];

      const costData = (
        await db.execute<{
          total_cost: string;
          gross_profit: string;
        }>(
          sql`
            SELECT
              COALESCE(SUM(cost_price), 0)::text AS total_cost,
              COALESCE(
                SUM(amount) - SUM(COALESCE(cost_price, amount)),
                0
              )::text AS gross_profit
            FROM transactions
            WHERE status = 'success'
          `,
        )
      ).rows[0];

      const weeklyRows = (
        await db.execute<{
          day: string;
          revenue: string;
          cost: string;
        }>(
          sql`
            SELECT
              TO_CHAR(
                DATE_TRUNC('day', created_at),
                'YYYY-MM-DD'
              ) AS day,
              COALESCE(SUM(amount), 0)::text AS revenue,
              COALESCE(
                SUM(COALESCE(cost_price, 0)),
                0
              )::text AS cost
            FROM transactions
            WHERE status = 'success'
              AND created_at >= NOW() - INTERVAL '7 days'
            GROUP BY DATE_TRUNC('day', created_at)
            ORDER BY day ASC
          `,
        )
      ).rows;

      res.json({
        revenue: revenue ?? {},
        wallets: walletSummary ?? {},
        funding: funding ?? {},
        profitability: costData ?? {},
        weekly_chart: weeklyRows ?? [],
      });
    } catch (err) {
      logger.error({ err }, 'GET /finance/overview failed');
      res.status(500).json({
        error: 'Failed to load finance overview.',
      });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// PRICING MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

function normalisePricingRule(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: String(row.id),
    serviceType: String(row.service_type ?? ''),
    provider: String(row.provider ?? ''),
    network: row.network == null ? null : String(row.network),
    planId: row.plan_id == null ? null : String(row.plan_id),
    planName: row.plan_name == null ? null : String(row.plan_name),
    costPrice: Number(row.cost_price ?? 0),
    sellingPrice: Number(row.selling_price ?? 0),
    markupPercent: Number(row.markup_percent ?? 0),
    enabled: Boolean(row.enabled),
    updatedAt:
      row.updated_at instanceof Date
        ? row.updated_at.toISOString()
        : String(row.updated_at ?? ''),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at.toISOString()
        : String(row.created_at ?? ''),
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

async function writePricingAudit(opts: {
  req: Request;
  action: 'create' | 'update' | 'bulk_update' | 'delete';
  ruleId?: string;
  serviceType?: string | null;
  planName?: string | null;
  provider?: string | null;
  oldSellingPrice?: unknown;
  newSellingPrice?: unknown;
  oldCostPrice?: unknown;
  newCostPrice?: unknown;
  oldEnabled?: unknown;
  newEnabled?: unknown;
  reason: string;
}): Promise<void> {
  await db.execute(sql`
    INSERT INTO pricing_audit_logs
      (
        pricing_rule_id,
        admin_id,
        admin_name,
        admin_email,
        action,
        service_type,
        plan_name,
        provider,
        old_selling_price,
        new_selling_price,
        old_cost_price,
        new_cost_price,
        old_enabled,
        new_enabled,
        reason,
        ip
      )
    VALUES
      (
        ${opts.ruleId ?? null}::uuid,
        ${opts.req.session.adminId!}::uuid,
        (
          SELECT name
          FROM admin_accounts
          WHERE id = ${opts.req.session.adminId!}::uuid
        ),
        (
          SELECT email
          FROM admin_accounts
          WHERE id = ${opts.req.session.adminId!}::uuid
        ),
        ${opts.action},
        ${opts.serviceType ?? null},
        ${opts.planName ?? null},
        ${opts.provider ?? null},
        ${
          opts.oldSellingPrice == null
            ? null
            : String(opts.oldSellingPrice)
        },
        ${
          opts.newSellingPrice == null
            ? null
            : String(opts.newSellingPrice)
        },
        ${
          opts.oldCostPrice == null
            ? null
            : String(opts.oldCostPrice)
        },
        ${
          opts.newCostPrice == null
            ? null
            : String(opts.newCostPrice)
        },
        ${
          opts.oldEnabled == null
            ? null
            : Boolean(opts.oldEnabled)
        },
        ${
          opts.newEnabled == null
            ? null
            : Boolean(opts.newEnabled)
        },
        ${opts.reason},
        ${clientIp(opts.req)}
      )
  `);
}

router.get(
  '/pricing',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const serviceType = String(
        req.query['serviceType'] ??
          req.query['service_type'] ??
          '',
      ).trim();

      const result = await db.execute<Record<string, unknown>>(sql`
        SELECT
          id,
          service_type,
          provider,
          network,
          plan_id,
          plan_name,
          cost_price,
          selling_price,
          markup_percent,
          enabled,
          updated_at,
          created_at
        FROM pricing_rules
        ${
          serviceType
            ? sql`WHERE service_type = ${serviceType}`
            : sql``
        }
        ORDER BY
          service_type,
          network NULLS LAST,
          plan_name NULLS LAST,
          created_at ASC
      `);

      res.json({
        rules: result.rows.map(normalisePricingRule),
      });
    } catch (err) {
      logger.error({ err }, 'GET /pricing failed');
      res.status(500).json({
        error: 'Failed to load pricing rules.',
      });
    }
  },
);

router.patch(
  '/pricing/bulk',
  requireFinancePermission('manage_pricing'),
  async (req: Request, res: Response): Promise<void> => {
    const input = req.body as {
      rules?: unknown;
    };

    if (
      !Array.isArray(input.rules) ||
      input.rules.length === 0
    ) {
      res.status(400).json({
        error: 'rules must be a non-empty array.',
      });
      return;
    }

    if (input.rules.length > 100) {
      res.status(400).json({
        error: 'A maximum of 100 pricing rules can be updated at once.',
      });
      return;
    }

    const updates =
      input.rules as Array<Record<string, unknown>>;

    try {
      let updated = 0;

      for (const item of updates) {
        const id = String(item.id ?? '');

        if (!isUuid(id)) {
          res.status(400).json({
            error: `Invalid pricing rule ID: ${id}`,
          });
          return;
        }

        const beforeResult =
          await db.execute<Record<string, unknown>>(sql`
            SELECT
              id,
              service_type,
              provider,
              plan_name,
              cost_price,
              selling_price,
              enabled
            FROM pricing_rules
            WHERE id = ${id}::uuid
            LIMIT 1
          `);

        const before = beforeResult.rows[0];

        if (!before) {
          res.status(404).json({
            error: `Pricing rule not found: ${id}`,
          });
          return;
        }

        const hasSelling =
          item.sellingPrice !== undefined;
        const hasCost =
          item.costPrice !== undefined;
        const hasMarkup =
          item.markupPercent !== undefined;
        const hasEnabled =
          item.enabled !== undefined;

        if (
          !hasSelling &&
          !hasCost &&
          !hasMarkup &&
          !hasEnabled
        ) {
          continue;
        }

        const selling = hasSelling
          ? Number(item.sellingPrice)
          : undefined;

        const cost = hasCost
          ? Number(item.costPrice)
          : undefined;

        const markup = hasMarkup
          ? Number(item.markupPercent)
          : undefined;

        if (
          selling !== undefined &&
          (!Number.isFinite(selling) || selling < 0)
        ) {
          res.status(400).json({
            error: `Invalid sellingPrice for ${id}.`,
          });
          return;
        }

        if (
          cost !== undefined &&
          (!Number.isFinite(cost) || cost < 0)
        ) {
          res.status(400).json({
            error: `Invalid costPrice for ${id}.`,
          });
          return;
        }

        if (
          markup !== undefined &&
          !Number.isFinite(markup)
        ) {
          res.status(400).json({
            error: `Invalid markupPercent for ${id}.`,
          });
          return;
        }

        if (
          hasEnabled &&
          typeof item.enabled !== 'boolean'
        ) {
          res.status(400).json({
            error: `Invalid enabled value for ${id}.`,
          });
          return;
        }

        const result =
          await db.execute<Record<string, unknown>>(sql`
            UPDATE pricing_rules
            SET
              selling_price =
                ${
                  selling !== undefined
                    ? selling.toFixed(2)
                    : sql`selling_price`
                },
              cost_price =
                ${
                  cost !== undefined
                    ? cost.toFixed(2)
                    : sql`cost_price`
                },
              markup_percent =
                ${
                  markup !== undefined
                    ? markup.toFixed(2)
                    : sql`markup_percent`
                },
              enabled =
                ${
                  hasEnabled
                    ? item.enabled
                    : sql`enabled`
                },
              updated_by =
                ${req.session.adminId!}::uuid,
              updated_by_name =
                (
                  SELECT name
                  FROM admin_accounts
                  WHERE id = ${req.session.adminId!}::uuid
                ),
              reason =
                ${'Bulk update via Admin Pricing Management'},
              updated_at = NOW()
            WHERE id = ${id}::uuid
            RETURNING
              id,
              service_type,
              provider,
              plan_name,
              cost_price,
              selling_price,
              enabled
          `);

        const row = result.rows[0];

        if (!row) {
          continue;
        }

        updated += 1;

        await writePricingAudit({
          req,
          action: 'bulk_update',
          ruleId: id,
          serviceType: String(
            before.service_type ?? '',
          ),
          planName: String(
            row.plan_name ??
              before.plan_name ??
              '',
          ),
          provider: String(
            before.provider ?? '',
          ),
          oldSellingPrice:
            before.selling_price,
          newSellingPrice:
            row.selling_price,
          oldCostPrice:
            before.cost_price,
          newCostPrice:
            row.cost_price,
          oldEnabled:
            before.enabled,
          newEnabled:
            row.enabled,
          reason:
            'Bulk update via Admin Pricing Management',
        });
      }

      res.json({ updated });
    } catch (err) {
      logger.error(
        { err },
        'PATCH /pricing/bulk failed',
      );

      res.status(500).json({
        error: 'Failed to bulk update pricing rules.',
      });
    }
  },
);

router.patch(
  '/pricing/:id',
  requireFinancePermission('manage_pricing'),
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params['id'] ?? '');

    if (!isUuid(id)) {
      res.status(400).json({
        error: 'Invalid pricing rule ID.',
      });
      return;
    }

    const body = req.body as {
      sellingPrice?: unknown;
      costPrice?: unknown;
      markupPercent?: unknown;
      enabled?: unknown;
      planName?: unknown;
    };

    const hasSelling =
      body.sellingPrice !== undefined;
    const hasCost =
      body.costPrice !== undefined;
    const hasMarkup =
      body.markupPercent !== undefined;
    const hasEnabled =
      body.enabled !== undefined;
    const hasPlanName =
      body.planName !== undefined;

    if (
      !hasSelling &&
      !hasCost &&
      !hasMarkup &&
      !hasEnabled &&
      !hasPlanName
    ) {
      res.status(400).json({
        error: 'At least one pricing field is required.',
      });
      return;
    }

    const sellingPrice = hasSelling
      ? Number(body.sellingPrice)
      : undefined;

    const costPrice = hasCost
      ? Number(body.costPrice)
      : undefined;

    const markupPercent = hasMarkup
      ? Number(body.markupPercent)
      : undefined;

    if (
      sellingPrice !== undefined &&
      (!Number.isFinite(sellingPrice) ||
        sellingPrice < 0)
    ) {
      res.status(400).json({
        error:
          'sellingPrice must be a non-negative number.',
      });
      return;
    }

    if (
      costPrice !== undefined &&
      (!Number.isFinite(costPrice) ||
        costPrice < 0)
    ) {
      res.status(400).json({
        error:
          'costPrice must be a non-negative number.',
      });
      return;
    }

    if (
      markupPercent !== undefined &&
      !Number.isFinite(markupPercent)
    ) {
      res.status(400).json({
        error:
          'markupPercent must be a valid number.',
      });
      return;
    }

    if (
      hasEnabled &&
      typeof body.enabled !== 'boolean'
    ) {
      res.status(400).json({
        error: 'enabled must be a boolean.',
      });
      return;
    }

    if (
      hasPlanName &&
      (
        typeof body.planName !== 'string' ||
        body.planName.trim().length > 200
      )
    ) {
      res.status(400).json({
        error:
          'planName must be a string of 200 characters or fewer.',
      });
      return;
    }

    try {
      const beforeResult =
        await db.execute<Record<string, unknown>>(sql`
          SELECT
            id,
            service_type,
            provider,
            plan_name,
            cost_price,
            selling_price,
            enabled
          FROM pricing_rules
          WHERE id = ${id}::uuid
          LIMIT 1
        `);

      const before = beforeResult.rows[0];

      if (!before) {
        res.status(404).json({
          error: 'Pricing rule not found.',
        });
        return;
      }

      const result =
        await db.execute<Record<string, unknown>>(sql`
          UPDATE pricing_rules
          SET
            selling_price =
              ${
                sellingPrice !== undefined
                  ? sellingPrice.toFixed(2)
                  : sql`selling_price`
              },
            cost_price =
              ${
                costPrice !== undefined
                  ? costPrice.toFixed(2)
                  : sql`cost_price`
              },
            markup_percent =
              ${
                markupPercent !== undefined
                  ? markupPercent.toFixed(2)
                  : sql`markup_percent`
              },
            enabled =
              ${
                hasEnabled
                  ? body.enabled
                  : sql`enabled`
              },
            plan_name =
              ${
                hasPlanName
                  ? String(body.planName).trim()
                  : sql`plan_name`
              },
            updated_by =
              ${req.session.adminId!}::uuid,
            updated_by_name =
              (
                SELECT name
                FROM admin_accounts
                WHERE id = ${req.session.adminId!}::uuid
              ),
            reason =
              ${'Updated via Admin Pricing Management'},
            updated_at = NOW()
          WHERE id = ${id}::uuid
          RETURNING
            id,
            service_type,
            provider,
            network,
            plan_id,
            plan_name,
            cost_price,
            selling_price,
            markup_percent,
            enabled,
            updated_at,
            created_at
        `);

      const row = result.rows[0];

      if (!row) {
        res.status(404).json({
          error: 'Pricing rule not found.',
        });
        return;
      }

      await writePricingAudit({
        req,
        action: 'update',
        ruleId: id,
        serviceType: String(
          before.service_type ?? '',
        ),
        planName: String(
          row.plan_name ??
            before.plan_name ??
            '',
        ),
        provider: String(
          before.provider ?? '',
        ),
        oldSellingPrice:
          before.selling_price,
        newSellingPrice:
          row.selling_price,
        oldCostPrice:
          before.cost_price,
        newCostPrice:
          row.cost_price,
        oldEnabled:
          before.enabled,
        newEnabled:
          row.enabled,
        reason:
          'Updated via Admin Pricing Management',
      });

      res.json(normalisePricingRule(row));
    } catch (err) {
      logger.error(
        { err, id },
        'PATCH /pricing/:id failed',
      );

      res.status(500).json({
        error: 'Failed to update pricing rule.',
      });
    }
  },
);

router.post(
  '/pricing',
  requireFinancePermission('manage_pricing'),
  async (req: Request, res: Response): Promise<void> => {
    const body =
      req.body as Record<string, unknown>;

    const serviceType =
      String(body.serviceType ?? '').trim();

    const provider =
      String(body.provider ?? '').trim();

    const network =
      body.network == null ||
      String(body.network).trim() === ''
        ? null
        : String(body.network).trim();

    const planId =
      body.planId == null ||
      String(body.planId).trim() === ''
        ? null
        : String(body.planId).trim();

    const planName =
      body.planName == null
        ? null
        : String(body.planName).trim();

    const costPrice =
      Number(body.costPrice ?? 0);

    const sellingPrice =
      Number(body.sellingPrice ?? 0);

    const markupPercent =
      Number(body.markupPercent ?? 0);

    const enabled =
      body.enabled === undefined
        ? true
        : body.enabled;

    if (
      !serviceType ||
      !provider ||
      !planName
    ) {
      res.status(400).json({
        error:
          'serviceType, provider and planName are required.',
      });
      return;
    }

    if (
      ![costPrice, sellingPrice, markupPercent]
        .every(Number.isFinite) ||
      costPrice < 0 ||
      sellingPrice < 0
    ) {
      res.status(400).json({
        error:
          'costPrice, sellingPrice and markupPercent must be valid numbers.',
      });
      return;
    }

    if (typeof enabled !== 'boolean') {
      res.status(400).json({
        error: 'enabled must be a boolean.',
      });
      return;
    }

    try {
      const result =
        await db.execute<Record<string, unknown>>(sql`
          INSERT INTO pricing_rules
            (
              service_type,
              provider,
              network,
              plan_id,
              plan_name,
              cost_price,
              selling_price,
              markup_percent,
              enabled,
              updated_by,
              updated_by_name,
              reason,
              updated_at
            )
          VALUES
            (
              ${serviceType},
              ${provider},
              ${network},
              ${planId},
              ${planName},
              ${costPrice.toFixed(2)},
              ${sellingPrice.toFixed(2)},
              ${markupPercent.toFixed(2)},
              ${enabled},
              ${req.session.adminId!}::uuid,
              (
                SELECT name
                FROM admin_accounts
                WHERE id = ${req.session.adminId!}::uuid
              ),
              ${'Created via Admin Pricing Management'},
              NOW()
            )
          RETURNING
            id,
            service_type,
            provider,
            network,
            plan_id,
            plan_name,
            cost_price,
            selling_price,
            markup_percent,
            enabled,
            updated_at,
            created_at
        `);

      const row = result.rows[0];

      if (!row) {
        res.status(500).json({
          error: 'Failed to create pricing rule.',
        });
        return;
      }

      await writePricingAudit({
        req,
        action: 'create',
        ruleId: String(row.id),
        serviceType,
        planName,
        provider,
        newSellingPrice:
          row.selling_price,
        newCostPrice:
          row.cost_price,
        newEnabled:
          row.enabled,
        reason:
          'Created via Admin Pricing Management',
      });

      res.status(201).json(
        normalisePricingRule(row),
      );
    } catch (err) {
      logger.error(
        { err },
        'POST /pricing failed',
      );

      res.status(500).json({
        error: 'Failed to create pricing rule.',
      });
    }
  },
);

router.delete(
  '/pricing/:id',
  requireFinancePermission('manage_pricing'),
  async (req: Request, res: Response): Promise<void> => {
    const id = String(req.params['id'] ?? '');

    if (!isUuid(id)) {
      res.status(400).json({
        error: 'Invalid pricing rule ID.',
      });
      return;
    }

    try {
      const beforeResult =
        await db.execute<Record<string, unknown>>(sql`
          SELECT
            id,
            service_type,
            provider,
            plan_name,
            cost_price,
            selling_price,
            enabled
          FROM pricing_rules
          WHERE id = ${id}::uuid
          LIMIT 1
        `);

      const before = beforeResult.rows[0];

      if (!before) {
        res.status(404).json({
          error: 'Pricing rule not found.',
        });
        return;
      }

      await db.execute(
        sql`
          DELETE FROM pricing_rules
          WHERE id = ${id}::uuid
        `,
      );

      await writePricingAudit({
        req,
        action: 'delete',
        ruleId: id,
        serviceType: String(
          before.service_type ?? '',
        ),
        planName: String(
          before.plan_name ?? '',
        ),
        provider: String(
          before.provider ?? '',
        ),
        oldSellingPrice:
          before.selling_price,
        oldCostPrice:
          before.cost_price,
        oldEnabled:
          before.enabled,
        reason:
          'Deleted via Admin Pricing Management',
      });

      res.status(204).send();
    } catch (err) {
      logger.error(
        { err, id },
        'DELETE /pricing/:id failed',
      );

      res.status(500).json({
        error: 'Failed to delete pricing rule.',
      });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// FUNDING REQUESTS
// ════════════════════════════════════════════════════════════════════════════

router.get(
  '/finance/funding-requests',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const status =
        String(req.query['status'] ?? '').trim();

      const page = Math.max(
        1,
        parseInt(
          String(req.query['page'] ?? '1'),
          10,
        ) || 1,
      );

      const limit = Math.min(
        200,
        Math.max(
          1,
          parseInt(
            String(req.query['limit'] ?? '50'),
            10,
          ) || 50,
        ),
      );

      const offset = (page - 1) * limit;

      const rows =
        await db.execute<Record<string, unknown>>(sql`
          SELECT
            fr.*,
            u.name AS customer_name,
            u.phone AS customer_phone,
            u.email AS customer_email
          FROM funding_requests fr
          LEFT JOIN users u
            ON u.id = fr.user_id
          WHERE 1 = 1
            ${
              status
                ? sql`AND fr.status = ${status}`
                : sql``
            }
          ORDER BY fr.created_at DESC
          LIMIT ${limit}
          OFFSET ${offset}
        `);

      const count =
        await db.execute<{ total: string }>(sql`
          SELECT COUNT(*)::text AS total
          FROM funding_requests fr
          WHERE 1 = 1
            ${
              status
                ? sql`AND fr.status = ${status}`
                : sql``
            }
        `);

      const total =
        parseInt(
          count.rows[0]?.total ?? '0',
          10,
        );

      res.json({
        requests: rows.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(
            total / limit,
          ),
        },
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /finance/funding-requests failed',
      );

      res.status(500).json({
        error:
          'Failed to load funding requests.',
      });
    }
  },
);

router.post(
  '/finance/funding-requests/:id/approve',
  requireFinancePermission('approve_funding'),
  async (req: Request, res: Response): Promise<void> => {
    const adminId =
      req.session.adminId!;

    const adminRole =
      req.session.adminRole!;

    const id =
      String(req.params['id'] ?? '');

    const body =
      req.body as { reason?: string };

    const reason =
      body.reason?.trim();

    if (!reason) {
      res.status(400).json({
        error:
          'reason is required.',
      });
      return;
    }

    try {
      const result =
        await db.execute<Record<string, unknown>>(sql`
          SELECT *
          FROM funding_requests
          WHERE id = ${id}::uuid
          LIMIT 1
        `);

      const funding =
        result.rows[0];

      if (!funding) {
        res.status(404).json({
          error:
            'Funding request not found.',
        });
        return;
      }

      if (
        String(funding.status) !==
        'pending'
      ) {
        res.status(409).json({
          error:
            'Funding request is no longer pending.',
        });
        return;
      }

      const userId =
        String(funding.user_id);

      const amount =
        Number(funding.amount);

      const reference =
        String(
          funding.reference ??
            makeRef('FUND'),
        );

      let balanceBefore = 0;
      let balanceAfter = 0;

      await db.transaction(
        async (tx) => {
          const wallet =
            (
              await tx.execute<{
                balance: string;
              }>(
                sql`
                  SELECT balance
                  FROM wallets
                  WHERE user_id = ${userId}::uuid
                  FOR UPDATE
                `,
              )
            ).rows[0];

          if (!wallet) {
            throw new Error(
              'Wallet not found',
            );
          }

          balanceBefore =
            Number(wallet.balance);

          balanceAfter =
            balanceBefore + amount;

          await tx.execute(
            sql`
              UPDATE wallets
              SET
                balance = ${balanceAfter},
                updated_at = NOW()
              WHERE user_id = ${userId}::uuid
            `,
          );

          await tx.execute(
            sql`
              INSERT INTO wallet_ledger
                (
                  user_id,
                  type,
                  amount,
                  balance_before,
                  balance_after,
                  reference,
                  related_transaction_id,
                  performed_by,
                  reason
                )
              VALUES
                (
                  ${userId}::uuid,
                  'funding',
                  ${amount},
                  ${balanceBefore},
                  ${balanceAfter},
                  ${reference},
                  NULL,
                  ${adminId}::uuid,
                  ${reason}
                )
            `,
          );

          await tx.execute(
            sql`
              UPDATE funding_requests
              SET
                status = 'approved',
                approved_by = ${adminId}::uuid,
                approved_at = NOW(),
                reason = ${reason},
                updated_at = NOW()
              WHERE id = ${id}::uuid
            `,
          );
        },
      );

      void financialAuditLog({
        adminId,
        adminRole,
        action:
          'funding_request_approved',
        entityType:
          'funding_request',
        entityId: id,
        customerId: userId,
        previousValue: {
          status:
            funding.status,
          wallet_balance:
            balanceBefore,
          amount,
        },
        newValue: {
          status: 'approved',
          wallet_balance:
            balanceAfter,
          amount,
        },
        reason,
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        reference,
        amount,
        balanceBefore,
        balanceAfter,
        status: 'approved',
      });
    } catch (err: unknown) {
      const error =
        err as {
          message?: string;
        };

      if (
        error.message ===
        'Wallet not found'
      ) {
        res.status(404).json({
          error:
            'Wallet not found.',
        });
        return;
      }

      logger.error(
        { err },
        'POST /finance/funding-requests/:id/approve failed',
      );

      res.status(500).json({
        error:
          'Failed to approve funding request.',
      });
    }
  },
);

router.post(
  '/finance/funding-requests/:id/reject',
  requireFinancePermission('approve_funding'),
  async (req: Request, res: Response): Promise<void> => {
    const adminId =
      req.session.adminId!;

    const adminRole =
      req.session.adminRole!;

    const id =
      String(req.params['id'] ?? '');

    const body =
      req.body as { reason?: string };

    const reason =
      body.reason?.trim();

    if (!reason) {
      res.status(400).json({
        error:
          'reason is required.',
      });
      return;
    }

    try {
      const result =
        await db.execute<Record<string, unknown>>(sql`
          SELECT *
          FROM funding_requests
          WHERE id = ${id}::uuid
          LIMIT 1
        `);

      const funding =
        result.rows[0];

      if (!funding) {
        res.status(404).json({
          error:
            'Funding request not found.',
        });
        return;
      }

      if (
        String(funding.status) !==
        'pending'
      ) {
        res.status(409).json({
          error:
            'Funding request is no longer pending.',
        });
        return;
      }

      await db.execute(
        sql`
          UPDATE funding_requests
          SET
            status = 'rejected',
            rejected_by = ${adminId}::uuid,
            rejected_at = NOW(),
            reason = ${reason},
            updated_at = NOW()
          WHERE id = ${id}::uuid
        `,
      );

      void financialAuditLog({
        adminId,
        adminRole,
        action:
          'funding_request_rejected',
        entityType:
          'funding_request',
        entityId: id,
        customerId:
          String(funding.user_id),
        previousValue: {
          status:
            funding.status,
        },
        newValue: {
          status: 'rejected',
        },
        reason,
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        status: 'rejected',
      });
    } catch (err) {
      logger.error(
        { err },
        'POST /finance/funding-requests/:id/reject failed',
      );

      res.status(500).json({
        error:
          'Failed to reject funding request.',
      });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// WALLET ADJUSTMENT
// ════════════════════════════════════════════════════════════════════════════

router.post(
  '/finance/users/:id/wallet/adjust',
  requireFinancePermission('adjust_wallet'),
  async (req: Request, res: Response): Promise<void> => {
    const adminId =
      req.session.adminId!;

    const adminRole =
      req.session.adminRole!;

    const { id } =
      req.params as {
        id: string;
      };

    const {
      type,
      amount,
      reason,
    } =
      req.body as {
        type?: 'credit' | 'debit';
        amount?: number;
        reason?: string;
      };

    if (
      !type ||
      !['credit', 'debit'].includes(type)
    ) {
      res.status(400).json({
        error:
          'type must be "credit" or "debit".',
      });
      return;
    }

    if (
      !amount ||
      Number(amount) <= 0
    ) {
      res.status(400).json({
        error:
          'amount must be a positive number.',
      });
      return;
    }

    if (!reason?.trim()) {
      res.status(400).json({
        error:
          'reason is mandatory for all wallet adjustments.',
      });
      return;
    }

    if (
      Number(amount) > 1_000_000
    ) {
      res.status(400).json({
        error:
          'Finance staff wallet adjustments cannot exceed ₦1,000,000. Contact a Super Admin for larger amounts.',
      });
      return;
    }

    const numericAmount =
      Number(amount);

    const ref =
      makeRef('FADJ');

    try {
      const customer =
        (
          await db.execute<{
            name: string;
          }>(
            sql`
              SELECT name
              FROM users
              WHERE id = ${id}::uuid
              LIMIT 1
            `,
          )
        ).rows[0];

      if (!customer) {
        res.status(404).json({
          error:
            'User not found.',
        });
        return;
      }

      let balanceBefore = 0;
      let balanceAfter = 0;

      await db.transaction(
        async (tx) => {
          const wallet =
            (
              await tx.execute<{
                balance: string;
              }>(
                sql`
                  SELECT balance
                  FROM wallets
                  WHERE user_id = ${id}::uuid
                  FOR UPDATE
                `,
              )
            ).rows[0];

          if (!wallet) {
            throw new Error(
              'Wallet not found',
            );
          }

          balanceBefore =
            Number(wallet.balance);

          balanceAfter =
            type === 'credit'
              ? balanceBefore +
                numericAmount
              : balanceBefore -
                numericAmount;

          if (
            balanceAfter < 0
          ) {
            throw Object.assign(
              new Error(
                'Insufficient balance',
              ),
              {
                code:
                  'INSUFFICIENT',
              },
            );
          }

          await tx.execute(
            sql`
              UPDATE wallets
              SET
                balance = ${balanceAfter},
                updated_at = NOW()
              WHERE user_id = ${id}::uuid
            `,
          );

          await tx.execute(
            sql`
              INSERT INTO wallet_ledger
                (
                  user_id,
                  type,
                  amount,
                  balance_before,
                  balance_after,
                  reference,
                  performed_by,
                  reason
                )
              VALUES
                (
                  ${id}::uuid,
                  ${type},
                  ${numericAmount},
                  ${balanceBefore},
                  ${balanceAfter},
                  ${ref},
                  ${adminId}::uuid,
                  ${reason!.trim()}
                )
            `,
          );
        },
      );

      void financialAuditLog({
        adminId,
        adminRole,
        action:
          `wallet_${type}`,
        entityType: 'wallet',
        entityId: id,
        customerId: id,
        customerName:
          customer.name,
        previousValue: {
          balance:
            balanceBefore,
        },
        newValue: {
          balance:
            balanceAfter,
          adjustment:
            numericAmount,
          direction: type,
        },
        reason:
          reason!.trim(),
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        reference: ref,
        balanceBefore,
        balanceAfter,
        type,
        amount: numericAmount,
      });
    } catch (err: unknown) {
      const error =
        err as {
          code?: string;
          message?: string;
        };

      if (
        error.code ===
        'INSUFFICIENT'
      ) {
        res.status(400).json({
          error:
            'Insufficient wallet balance for this debit.',
        });
        return;
      }

      if (
        error.message ===
        'Wallet not found'
      ) {
        res.status(404).json({
          error:
            'Wallet not found.',
        });
        return;
      }

      logger.error(
        { err },
        'POST /finance/users/:id/wallet/adjust failed',
      );

      res.status(500).json({
        error:
          'Failed to adjust wallet.',
      });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// TRANSACTION REVERSAL
// ════════════════════════════════════════════════════════════════════════════

router.post(
  '/finance/transactions/:id/reverse',
  requireFinancePermission('process_refunds'),
  async (req: Request, res: Response): Promise<void> => {
    const adminId =
      req.session.adminId!;

    const adminRole =
      req.session.adminRole!;

    const { id } =
      req.params as {
        id: string;
      };

    const { reason } =
      req.body as {
        reason?: string;
      };

    if (!reason?.trim()) {
      res.status(400).json({
        error:
          'reason is required for all reversals.',
      });
      return;
    }

    try {
      const txn =
        (
          await db.execute<
            Record<string, unknown>
          >(
            sql`
              SELECT *
              FROM transactions
              WHERE id = ${id}::uuid
              LIMIT 1
            `,
          )
        ).rows[0];

      if (!txn) {
        res.status(404).json({
          error:
            'Transaction not found.',
        });
        return;
      }

      if (
        String(txn['status']) !==
        'success'
      ) {
        res.status(400).json({
          error:
            'Only successful transactions can be reversed.',
        });
        return;
      }

      const existing =
        (
          await db.execute<{
            id: string;
          }>(
            sql`
              SELECT id
              FROM transaction_reversals
              WHERE original_transaction_id =
                ${id}::uuid
              LIMIT 1
            `,
          )
        ).rows[0];

      if (existing) {
        res.status(409).json({
          error:
            'This transaction has already been reversed.',
        });
        return;
      }

      const userId =
        String(txn['user_id']);

      const amount =
        Number(txn['amount']);

      const ref =
        makeRef('FREV');

      const customer =
        (
          await db.execute<{
            name: string;
          }>(
            sql`
              SELECT name
              FROM users
              WHERE id = ${userId}::uuid
              LIMIT 1
            `,
          )
        ).rows[0];

      let balanceBefore = 0;
      let balanceAfter = 0;
      let ledgerEntryId = '';

      await db.transaction(
        async (tx) => {
          const wallet =
            (
              await tx.execute<{
                balance: string;
              }>(
                sql`
                  SELECT balance
                  FROM wallets
                  WHERE user_id = ${userId}::uuid
                  FOR UPDATE
                `,
              )
            ).rows[0];

          if (!wallet) {
            throw new Error(
              'Wallet not found',
            );
          }

          balanceBefore =
            Number(wallet.balance);

          balanceAfter =
            balanceBefore + amount;

          await tx.execute(
            sql`
              UPDATE wallets
              SET
                balance = ${balanceAfter},
                updated_at = NOW()
              WHERE user_id = ${userId}::uuid
            `,
          );

          const ledger =
            (
              await tx.execute<{
                id: string;
              }>(
                sql`
                  INSERT INTO wallet_ledger
                    (
                      user_id,
                      type,
                      amount,
                      balance_before,
                      balance_after,
                      reference,
                      related_transaction_id,
                      performed_by,
                      reason
                    )
                  VALUES
                    (
                      ${userId}::uuid,
                      'reversal',
                      ${amount},
                      ${balanceBefore},
                      ${balanceAfter},
                      ${ref},
                      ${id}::uuid,
                      ${adminId}::uuid,
                      ${reason!.trim()}
                    )
                  RETURNING id
                `,
              )
            ).rows[0];

          ledgerEntryId =
            ledger!.id;

          await tx.execute(
            sql`
              INSERT INTO transaction_reversals
                (
                  original_transaction_id,
                  user_id,
                  amount,
                  reason,
                  performed_by,
                  wallet_ledger_id
                )
              VALUES
                (
                  ${id}::uuid,
                  ${userId}::uuid,
                  ${amount},
                  ${reason!.trim()},
                  ${adminId}::uuid,
                  ${ledgerEntryId}::uuid
                )
            `,
          );
        },
      );

      void financialAuditLog({
        adminId,
        adminRole,
        action:
          'transaction_reversed',
        entityType:
          'transaction',
        entityId: id,
        customerId: userId,
        customerName:
          customer?.name,
        previousValue: {
          transaction_status:
            txn['status'],
          wallet_balance:
            balanceBefore,
          amount:
            txn['amount'],
          reference:
            txn['reference'],
        },
        newValue: {
          reversal_reference:
            ref,
          wallet_balance:
            balanceAfter,
          amount_refunded:
            amount,
        },
        reason:
          reason!.trim(),
        ip: clientIp(req),
      });

      res.json({
        ok: true,
        reference: ref,
        amount,
        balanceBefore,
        balanceAfter,
      });
    } catch (err: unknown) {
      const error =
        err as {
          message?: string;
        };

      if (
        error.message ===
        'Wallet not found'
      ) {
        res.status(404).json({
          error:
            'Wallet not found.',
        });
        return;
      }

      logger.error(
        { err },
        'POST /finance/transactions/:id/reverse failed',
      );

      res.status(500).json({
        error:
          'Failed to reverse transaction.',
      });
    }
  },
);

// ════════════════════════════════════════════════════════════════════════════
// WALLET LEDGER
// ════════════════════════════════════════════════════════════════════════════

router.get(
  '/finance/wallet-ledger',
  async (req: Request, res: Response): Promise<void> => {
    try {
      const page =
        Math.max(
          1,
          parseInt(
            String(
              req.query['page'] ??
                '1',
            ),
            10,
          ) || 1,
        );

      const limit =
        Math.min(
          200,
          Math.max(
            1,
            parseInt(
              String(
                req.query['limit'] ??
                  '50',
              ),
              10,
            ) || 50,
          ),
        );

      const offset =
        (page - 1) * limit;

      const userId =
        req.query['user_id'] as
          | string
          | undefined;

      const type =
        req.query['type'] as
          | string
          | undefined;

      const from =
        req.query['from'] as
          | string
          | undefined;

      const to =
        req.query['to'] as
          | string
          | undefined;

      const rows =
        (
          await db.execute<
            Record<string, unknown>
          >(
            sql`
              SELECT
                wl.*,
                u.name AS customer_name,
                u.phone AS customer_phone
              FROM wallet_ledger wl
              LEFT JOIN users u
                ON u.id = wl.user_id
              WHERE 1 = 1
                ${
                  userId
                    ? sql`
                        AND wl.user_id =
                          ${userId}::uuid
                      `
                    : sql``
                }
                ${
                  type
                    ? sql`
                        AND wl.type =
                          ${type}
                      `
                    : sql``
                }
                ${
                  from
                    ? sql`
                        AND wl.created_at >=
                          ${from}::timestamptz
                      `
                    : sql``
                }
                ${
                  to
                    ? sql`
                        AND wl.created_at <=
                          ${to}::timestamptz +
                          interval '1 day'
                      `
                    : sql``
                }
              ORDER BY
                wl.created_at DESC
              LIMIT ${limit}
              OFFSET ${offset}
            `,
          )
        ).rows;

      const countRow =
        (
          await db.execute<{
            total: string;
            total_amount: string;
          }>(
            sql`
              SELECT
                COUNT(*)::text AS total,
                COALESCE(
                  SUM(amount),
                  0
                )::text AS total_amount
              FROM wallet_ledger wl
              WHERE 1 = 1
                ${
                  userId
                    ? sql`
                        AND wl.user_id =
                          ${userId}::uuid
                      `
                    : sql``
                }
                ${
                  type
                    ? sql`
                        AND wl.type =
                          ${type}
                      `
                    : sql``
                }
                ${
                  from
                    ? sql`
                        AND wl.created_at >=
                          ${from}::timestamptz
                      `
                    : sql``
                }
                ${
                  to
                    ? sql`
                        AND wl.created_at <=
                          ${to}::timestamptz +
                          interval '1 day'
                      `
                    : sql``
                }
            `,
          )
        ).rows[0];

      const total =
        parseInt(
          countRow?.total ?? '0',
          10,
        );

      res.json({
        entries: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages:
            Math.ceil(
              total / limit,
            ),
        },
        summary: {
          total_amount:
            countRow?.total_amount ??
            '0',
        },
      });
    } catch (err) {
      logger.error(
        { err },
        'GET /finance/wallet-ledger failed',
      );

      res.status(500).json({
        error:
          'Failed to load wallet ledger.',
      });
    }
  },
);

export default router;
