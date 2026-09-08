// ════════════════════════════════════════════════════════════════════════════
// PRICING MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════

function normalisePricingRule(row: Record<string, unknown>): Record<string, unknown> {
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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
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
        ${opts.oldSellingPrice == null ? null : String(opts.oldSellingPrice)},
        ${opts.newSellingPrice == null ? null : String(opts.newSellingPrice)},
        ${opts.oldCostPrice == null ? null : String(opts.oldCostPrice)},
        ${opts.newCostPrice == null ? null : String(opts.newCostPrice)},
        ${opts.oldEnabled == null ? null : Boolean(opts.oldEnabled)},
        ${opts.newEnabled == null ? null : Boolean(opts.newEnabled)},
        ${opts.reason},
        ${clientIp(opts.req)}
      )
  `);
}

// ── GET /admin/pricing ─────────────────────────────────────────────────────
router.get('/pricing', async (req: Request, res: Response): Promise<void> => {
  try {
    const serviceType = String(
      req.query['serviceType'] ??
      req.query['service_type'] ??
      ''
    ).trim();

    const rows = (
      await db.execute<Record<string, unknown>>(sql`
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
        ORDER BY service_type ASC, provider ASC, network ASC, plan_name ASC
      `)
    ).rows;

    res.json({
      rules: rows.map(normalisePricingRule),
    });
  } catch (err) {
    logger.error({ err }, 'GET /pricing failed');
    res.status(500).json({
      error: 'Failed to load pricing rules.',
    });
  }
});

// ── PATCH /admin/pricing/bulk ──────────────────────────────────────────────
// IMPORTANT: this route is intentionally BEFORE /pricing/:id.
router.patch(
  '/pricing/bulk',
  requireFinancePermission('manage_pricing'),
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as {
      rules?: Array<{
        id?: string;
        sellingPrice?: number;
        costPrice?: number;
        markupPercent?: number;
        enabled?: boolean;
      }>;
    };

    const rules = Array.isArray(body.rules) ? body.rules : [];

    if (rules.length === 0) {
      res.status(400).json({
        error: 'At least one pricing rule is required.',
      });
      return;
    }

    if (rules.length > 100) {
      res.status(400).json({
        error: 'A maximum of 100 pricing rules can be updated at once.',
      });
      return;
    }

    for (const item of rules) {
      const id = String(item.id ?? '');

      if (!isUuid(id)) {
        res.status(400).json({
          error: `Invalid pricing rule ID: ${id}`,
        });
        return;
      }

      const hasSelling = item.sellingPrice !== undefined;
      const hasCost = item.costPrice !== undefined;
      const hasMarkup = item.markupPercent !== undefined;
      const hasEnabled = item.enabled !== undefined;

      if (!hasSelling && !hasCost && !hasMarkup && !hasEnabled) {
        res.status(400).json({
          error: `No update fields supplied for ${id}.`,
        });
        return;
      }

      if (
        hasSelling &&
        (!Number.isFinite(Number(item.sellingPrice)) ||
          Number(item.sellingPrice) < 0)
      ) {
        res.status(400).json({
          error: `Invalid sellingPrice for ${id}.`,
        });
        return;
      }

      if (
        hasCost &&
        (!Number.isFinite(Number(item.costPrice)) ||
          Number(item.costPrice) < 0)
      ) {
        res.status(400).json({
          error: `Invalid costPrice for ${id}.`,
        });
        return;
      }

      if (
        hasMarkup &&
        !Number.isFinite(Number(item.markupPercent))
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
    }

    try {
      let updated = 0;

      for (const item of rules) {
        const id = String(item.id);

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

        const selling =
          item.sellingPrice === undefined
            ? undefined
            : Number(item.sellingPrice);

        const cost =
          item.costPrice === undefined
            ? undefined
            : Number(item.costPrice);

        const markup =
          item.markupPercent === undefined
            ? undefined
            : Number(item.markupPercent);

        const result =
          await db.execute<Record<string, unknown>>(sql`
            UPDATE pricing_rules
            SET
              selling_price =
                ${
                  selling !== undefined
                    ? sql`${selling.toFixed(2)}`
                    : sql`selling_price`
                },

              cost_price =
                ${
                  cost !== undefined
                    ? sql`${cost.toFixed(2)}`
                    : sql`cost_price`
                },

              markup_percent =
                ${
                  markup !== undefined
                    ? sql`${markup.toFixed(2)}`
                    : sql`markup_percent`
                },

              enabled =
                ${
                  item.enabled !== undefined
                    ? sql`${item.enabled}`
                    : sql`enabled`
                },

              updated_by = ${req.session.adminId!}::uuid,

              updated_by_name = (
                SELECT name
                FROM admin_accounts
                WHERE id = ${req.session.adminId!}::uuid
              ),

              reason = ${'Bulk update via Admin Pricing Management'},

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
          res.status(404).json({
            error: `Pricing rule not found: ${id}`,
          });
          return;
        }

        updated += 1;

        await writePricingAudit({
          req,
          action: 'bulk_update',
          ruleId: id,
          serviceType: String(before.service_type ?? ''),
          planName: String(
            row.plan_name ??
            before.plan_name ??
            ''
          ),
          provider: String(before.provider ?? ''),
          oldSellingPrice: before.selling_price,
          newSellingPrice: row.selling_price,
          oldCostPrice: before.cost_price,
          newCostPrice: row.cost_price,
          oldEnabled: before.enabled,
          newEnabled: row.enabled,
          reason: 'Bulk update via Admin Pricing Management',
        });
      }

      res.json({
        updated,
      });
    } catch (err) {
      logger.error(
        { err },
        'PATCH /pricing/bulk failed'
      );

      res.status(500).json({
        error: 'Failed to bulk update pricing rules.',
      });
    }
  }
);

// ── PATCH /admin/pricing/:id ───────────────────────────────────────────────
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
      sellingPrice?: number;
      costPrice?: number;
      markupPercent?: number;
      enabled?: boolean;
      planName?: string;
    };

    const hasSelling = body.sellingPrice !== undefined;
    const hasCost = body.costPrice !== undefined;
    const hasMarkup = body.markupPercent !== undefined;
    const hasEnabled = body.enabled !== undefined;
    const hasPlanName = body.planName !== undefined;

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

    if (
      hasSelling &&
      (!Number.isFinite(Number(body.sellingPrice)) ||
        Number(body.sellingPrice) < 0)
    ) {
      res.status(400).json({
        error: 'sellingPrice must be a valid non-negative number.',
      });
      return;
    }

    if (
      hasCost &&
      (!Number.isFinite(Number(body.costPrice)) ||
        Number(body.costPrice) < 0)
    ) {
      res.status(400).json({
        error: 'costPrice must be a valid non-negative number.',
      });
      return;
    }

    if (
      hasMarkup &&
      !Number.isFinite(Number(body.markupPercent))
    ) {
      res.status(400).json({
        error: 'markupPercent must be a valid number.',
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
            markup_percent,
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

      const selling =
        hasSelling
          ? Number(body.sellingPrice)
          : undefined;

      const cost =
        hasCost
          ? Number(body.costPrice)
          : undefined;

      const markup =
        hasMarkup
          ? Number(body.markupPercent)
          : undefined;

      const planName =
        hasPlanName
          ? String(body.planName ?? '').trim()
          : undefined;

      const result =
        await db.execute<Record<string, unknown>>(sql`
          UPDATE pricing_rules
          SET
            selling_price =
              ${
                selling !== undefined
                  ? sql`${selling.toFixed(2)}`
                  : sql`selling_price`
              },

            cost_price =
              ${
                cost !== undefined
                  ? sql`${cost.toFixed(2)}`
                  : sql`cost_price`
              },

            markup_percent =
              ${
                markup !== undefined
                  ? sql`${markup.toFixed(2)}`
                  : sql`markup_percent`
              },

            enabled =
              ${
                hasEnabled
                  ? sql`${body.enabled}`
                  : sql`enabled`
              },

            plan_name =
              ${
                planName !== undefined
                  ? sql`${planName}`
                  : sql`plan_name`
              },

            updated_by = ${req.session.adminId!}::uuid,

            updated_by_name = (
              SELECT name
              FROM admin_accounts
              WHERE id = ${req.session.adminId!}::uuid
            ),

            reason = ${'Updated via Admin Pricing Management'},

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
          before.service_type ?? ''
        ),
        planName: String(
          row.plan_name ??
          before.plan_name ??
          ''
        ),
        provider: String(
          before.provider ?? ''
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

      res.json(
        normalisePricingRule(row)
      );
    } catch (err) {
      logger.error(
        { err, id },
        'PATCH /pricing/:id failed'
      );

      res.status(500).json({
        error: 'Failed to update pricing rule.',
      });
    }
  }
);

// ── POST /admin/pricing ───────────────────────────────────────────────────
router.post(
  '/pricing',
  requireFinancePermission('manage_pricing'),
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as Record<string, unknown>;

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
      !Number.isFinite(costPrice) ||
      !Number.isFinite(sellingPrice) ||
      !Number.isFinite(markupPercent) ||
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
        normalisePricingRule(row)
      );
    } catch (err) {
      logger.error(
        { err },
        'POST /pricing failed'
      );

      res.status(500).json({
        error: 'Failed to create pricing rule.',
      });
    }
  }
);

// ── DELETE /admin/pricing/:id ──────────────────────────────────────────────
router.delete(
  '/pricing/:id',
  requireFinancePermission('manage_pricing'),
  async (req: Request, res: Response): Promise<void> => {
    const id =
      String(req.params['id'] ?? '');

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

      const before =
        beforeResult.rows[0];

      if (!before) {
        res.status(404).json({
          error: 'Pricing rule not found.',
        });
        return;
      }

      await db.execute(sql`
        DELETE FROM pricing_rules
        WHERE id = ${id}::uuid
      `);

      await writePricingAudit({
        req,
        action: 'delete',
        ruleId: id,
        serviceType:
          String(before.service_type ?? ''),
        planName:
          String(before.plan_name ?? ''),
        provider:
          String(before.provider ?? ''),
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
        'DELETE /pricing/:id failed'
      );

      res.status(500).json({
        error: 'Failed to delete pricing rule.',
      });
    }
  }
);
```0
