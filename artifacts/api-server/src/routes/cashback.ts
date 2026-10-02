// artifacts/api-server/src/routes/cashback.ts

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

const router = Router();

function requireSuperAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.session.isAdmin) {
    res.status(401).json({
      error:
        'Admin authentication required.',
    });
    return;
  }

  if (
    req.session.adminRole !==
    'super_admin'
  ) {
    res.status(403).json({
      error:
        'Super admin access required.',
    });
    return;
  }

  next();
}

router.use(
  requireSuperAdmin,
);

async function ensureCashbackSettingsRow(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cashback_settings (
      id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      enabled BOOLEAN NOT NULL DEFAULT FALSE,
      updated_by UUID REFERENCES admin_accounts(id) ON DELETE SET NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    ALTER TABLE cashback_settings
      ADD COLUMN IF NOT EXISTS min_transfer_amount
        NUMERIC(15,2) NOT NULL DEFAULT 100
  `);

  await db.execute(sql`
    ALTER TABLE cashback_settings
      ADD COLUMN IF NOT EXISTS transfer_mode
        TEXT NOT NULL DEFAULT 'manual'
  `);

  await db.execute(sql`
    ALTER TABLE cashback_settings
      ADD COLUMN IF NOT EXISTS eligible_services
        JSONB NOT NULL DEFAULT '["data"]'::jsonb
  `);

  await db.execute(sql`
    INSERT INTO cashback_settings (
      enabled,
      min_transfer_amount,
      transfer_mode,
      eligible_services
    )
    SELECT
      FALSE,
      100,
      'manual',
      '["data"]'::jsonb
    WHERE NOT EXISTS (
      SELECT 1
      FROM cashback_settings
    )
  `);
}

router.get(
  '/cashback/settings',
  async (
    _req: Request,
    res: Response,
  ): Promise<void> => {
    try {
      await ensureCashbackSettingsRow();

      const result =
        await db.execute<{
          id: string;
          enabled: boolean;
          updated_at: string;
          min_transfer_amount: string;
          transfer_mode: string;
          eligible_services: unknown;
        }>(sql`
          SELECT
            id,
            enabled,
            updated_at,
            min_transfer_amount,
            transfer_mode,
            eligible_services
          FROM cashback_settings
          ORDER BY updated_at DESC
          LIMIT 1
        `);

      const row =
        result.rows[0];

      const eligible =
        Array.isArray(
          row?.eligible_services,
        )
          ? row.eligible_services.map(
              String,
            )
          : ['data'];

      res.json({
        enabled:
          Boolean(
            row?.enabled,
          ),
        updatedAt:
          row?.updated_at ??
          null,
        minTransferAmount:
          Number(
            row?.min_transfer_amount ??
              100,
          ),
        transferMode:
          row?.transfer_mode ===
          'auto'
            ? 'auto'
            : 'manual',
        eligibleServices:
          eligible,
      });
    } catch (error) {
      logger.error(
        {
          error,
        },
        'GET cashback settings failed',
      );

      res.status(500).json({
        error:
          'Failed to load cashback settings.',
      });
    }
  },
);

router.patch(
  '/cashback/settings',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const body =
      req.body as Record<
        string,
        unknown
      >;

    const hasEnabled =
      typeof body.enabled ===
      'boolean';

    const hasMin =
      body.minTransferAmount !==
      undefined;

    const hasMode =
      body.transferMode !==
      undefined;

    const hasServices =
      body.eligibleServices !==
      undefined;

    if (
      !hasEnabled &&
      !hasMin &&
      !hasMode &&
      !hasServices
    ) {
      res.status(400).json({
        error:
          'At least one cashback setting is required.',
      });
      return;
    }

    const minAmount =
      hasMin
        ? Number(
            body.minTransferAmount,
          )
        : undefined;

    if (
      hasMin &&
      (!Number.isFinite(
        minAmount,
      ) ||
        Number(minAmount) < 0)
    ) {
      res.status(400).json({
        error:
          'minTransferAmount must be a valid non-negative number.',
      });
      return;
    }

    const transferMode =
      hasMode
        ? String(
            body.transferMode ??
              '',
          ).trim()
        : undefined;

    if (
      transferMode !==
        undefined &&
      transferMode !==
        'manual' &&
      transferMode !==
        'auto'
    ) {
      res.status(400).json({
        error:
          'transferMode must be manual or auto.',
      });
      return;
    }

    const eligibleServices =
      hasServices
        ? Array.isArray(
            body.eligibleServices,
          )
          ? body.eligibleServices.map(
              String,
            )
          : []
        : undefined;

    try {
      await ensureCashbackSettingsRow();

      await db.execute(sql`
        UPDATE cashback_settings
        SET
          enabled =
            CASE
              WHEN ${hasEnabled}
              THEN ${Boolean(
                body.enabled,
              )}
              ELSE enabled
            END,

          min_transfer_amount =
            CASE
              WHEN ${hasMin}
              THEN ${Number(
                minAmount,
              ).toFixed(2)}
              ELSE min_transfer_amount
            END,

          transfer_mode =
            CASE
              WHEN ${hasMode}
              THEN ${transferMode ?? 'manual'}
              ELSE transfer_mode
            END,

          eligible_services =
            CASE
              WHEN ${hasServices}
              THEN ${JSON.stringify(
                eligibleServices ?? [],
              )}::jsonb
              ELSE eligible_services
            END,

          updated_by =
            ${req.session.adminId ?? null}::uuid,

          updated_at =
            NOW()
        WHERE id = (
          SELECT id
          FROM cashback_settings
          ORDER BY updated_at DESC
          LIMIT 1
        )
      `);

      const result =
        await db.execute<{
          enabled: boolean;
          min_transfer_amount: string;
          transfer_mode: string;
          eligible_services: unknown;
          updated_at: string;
        }>(sql`
          SELECT
            enabled,
            min_transfer_amount,
            transfer_mode,
            eligible_services,
            updated_at
          FROM cashback_settings
          ORDER BY updated_at DESC
          LIMIT 1
        `);

      const row =
        result.rows[0];

      res.json({
        ok: true,
        enabled:
          Boolean(
            row?.enabled,
          ),
        minTransferAmount:
          Number(
            row?.min_transfer_amount ??
              100,
          ),
        transferMode:
          row?.transfer_mode ===
          'auto'
            ? 'auto'
            : 'manual',
        eligibleServices:
          Array.isArray(
            row?.eligible_services,
          )
            ? row.eligible_services
            : ['data'],
        updatedAt:
          row?.updated_at ??
          null,
      });
    } catch (error) {
      logger.error(
        {
          error,
          adminId:
            req.session.adminId,
        },
        'PATCH cashback settings failed',
      );

      res.status(500).json({
        error:
          'Failed to update cashback settings.',
      });
    }
  },
);

router.get(
  '/cashback/plans',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const network =
      String(
        req.query.network ??
          '',
      )
        .trim()
        .toUpperCase();

    try {
      const result =
        await db.execute(sql`
          SELECT
            id,
            service_type,
            provider,
            network,
            plan_id,
            plan_name,
            cost_price,
            selling_price,
            enabled,
            cashback_enabled,
            cashback_type,
            cashback_value,
            updated_at
          FROM pricing_rules
          WHERE service_type = 'data'
          ${
            network
              ? sql`
                AND (
                  UPPER(network) =
                    ${network}
                  OR UPPER(provider) =
                    ${network}
                )
              `
              : sql``
          }
          ORDER BY
            network,
            plan_name
        `);

      res.json({
        plans: result.rows,
      });
    } catch (error) {
      logger.error(
        {
          error,
        },
        'GET cashback plans failed',
      );

      res.status(500).json({
        error:
          'Failed to load cashback plans.',
      });
    }
  },
);

router.patch(
  '/cashback/plans/:id',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const id =
      String(
        req.params.id ??
          '',
      ).trim();

    const body =
      req.body as Record<
        string,
        unknown
      >;

    const cashbackEnabled =
      typeof body.cashbackEnabled ===
      'boolean'
        ? body.cashbackEnabled
        : undefined;

    const cashbackType =
      body.cashbackType ===
          'percentage' ||
      body.cashbackType === 'fixed'
        ? body.cashbackType
        : undefined;

    const cashbackValue =
      body.cashbackValue !==
      undefined
        ? Number(
            body.cashbackValue,
          )
        : undefined;

    if (
      cashbackEnabled ===
        undefined &&
      cashbackType ===
        undefined &&
      cashbackValue ===
        undefined
    ) {
      res.status(400).json({
        error:
          'No valid cashback fields supplied.',
      });
      return;
    }

    if (
      cashbackValue !==
        undefined &&
      (!Number.isFinite(
        cashbackValue,
      ) ||
        cashbackValue < 0)
    ) {
      res.status(400).json({
        error:
          'cashbackValue must be a non-negative number.',
      });
      return;
    }

    try {
      const result =
        await db.execute(sql`
          UPDATE pricing_rules
          SET
            cashback_enabled =
              CASE
                WHEN ${cashbackEnabled !== undefined}
                THEN ${cashbackEnabled ?? false}
                ELSE cashback_enabled
              END,

            cashback_type =
              CASE
                WHEN ${cashbackType !== undefined}
                THEN ${cashbackType ?? 'percentage'}
                ELSE cashback_type
              END,

            cashback_value =
              CASE
                WHEN ${cashbackValue !== undefined}
                THEN ${Number(
                  cashbackValue ?? 0,
                ).toFixed(2)}
                ELSE cashback_value
              END,

            updated_at =
              NOW()

          WHERE
            id = ${id}::uuid
            AND service_type = 'data'

          RETURNING
            id,
            plan_name,
            cashback_enabled,
            cashback_type,
            cashback_value
        `);

      if (!result.rows[0]) {
        res.status(404).json({
          error:
            'Pricing rule not found.',
        });
        return;
      }

      res.json({
        ok: true,
        plan:
          result.rows[0],
      });
    } catch (error) {
      logger.error(
        {
          error,
          id,
        },
        'PATCH cashback plan failed',
      );

      res.status(500).json({
        error:
          'Failed to update cashback plan.',
      });
    }
  },
);

router.post(
  '/cashback/plans/bulk',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const body =
      req.body as Record<
        string,
        unknown
      >;

    const network =
      String(
        body.network ??
          '',
      ).trim();

    const cashbackEnabled =
      typeof body.cashbackEnabled ===
      'boolean'
        ? body.cashbackEnabled
        : undefined;

    const cashbackType =
      body.cashbackType ===
          'percentage' ||
      body.cashbackType === 'fixed'
        ? body.cashbackType
        : undefined;

    const cashbackValue =
      body.cashbackValue !==
      undefined
        ? Number(
            body.cashbackValue,
          )
        : undefined;

    if (
      cashbackEnabled ===
        undefined &&
      cashbackType ===
        undefined &&
      cashbackValue ===
        undefined
    ) {
      res.status(400).json({
        error:
          'At least one cashback field is required.',
      });
      return;
    }

    if (
      cashbackValue !==
        undefined &&
      (!Number.isFinite(
        cashbackValue,
      ) ||
        cashbackValue < 0)
    ) {
      res.status(400).json({
        error:
          'cashbackValue must be a non-negative number.',
      });
      return;
    }

    try {
      const result =
        await db.execute(sql`
          UPDATE pricing_rules
          SET
            cashback_enabled =
              CASE
                WHEN ${cashbackEnabled !== undefined}
                THEN ${cashbackEnabled ?? false}
                ELSE cashback_enabled
              END,

            cashback_type =
              CASE
                WHEN ${cashbackType !== undefined}
                THEN ${cashbackType ?? 'percentage'}
                ELSE cashback_type
              END,

            cashback_value =
              CASE
                WHEN ${cashbackValue !== undefined}
                THEN ${Number(
                  cashbackValue ?? 0,
                ).toFixed(2)}
                ELSE cashback_value
              END,

            updated_at =
              NOW()

          WHERE service_type = 'data'
          ${
            network
              ? sql`
                AND (
                  UPPER(network) =
                    ${network.toUpperCase()}
                  OR UPPER(provider) =
                    ${network.toUpperCase()}
                )
              `
              : sql``
          }
        `);

      const updated =
        (
          result as unknown as {
            rowCount?: number;
          }
        ).rowCount ?? 0;

      res.json({
        ok: true,
        updated,
      });
    } catch (error) {
      logger.error(
        {
          error,
        },
        'POST cashback bulk update failed',
      );

      res.status(500).json({
        error:
          'Failed to bulk update cashback plans.',
      });
    }
  },
);

router.get(
  '/cashback/reports',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const from =
      String(
        req.query.from ??
          '',
      ).trim();

    const to =
      String(
        req.query.to ??
          '',
      ).trim();

    const fromDate =
      from
        ? new Date(
            `${from}T00:00:00.000Z`,
          )
        : new Date(
            Date.now() -
              30 *
                24 *
                60 *
                60 *
                1000,
          );

    const toDate =
      to
        ? new Date(
            `${to}T23:59:59.999Z`,
          )
        : new Date();

    try {
      const [
        totals,
        byDate,
        byNetwork,
        byPlan,
        byUser,
      ] = await Promise.all([
        db.execute(sql`
          SELECT
            COUNT(*) AS total_count,
            COALESCE(
              SUM(amount),
              0
            ) AS total_amount,
            COALESCE(
              AVG(amount),
              0
            ) AS avg_amount,
            COUNT(
              DISTINCT user_id
            ) AS unique_users,
            COUNT(
              DISTINCT network
            ) AS unique_networks
          FROM cashback_transactions
          WHERE created_at BETWEEN
            ${fromDate.toISOString()}
            AND
            ${toDate.toISOString()}
        `),

        db.execute(sql`
          SELECT
            DATE(created_at) AS day,
            COUNT(*) AS count,
            COALESCE(
              SUM(amount),
              0
            ) AS total
          FROM cashback_transactions
          WHERE created_at BETWEEN
            ${fromDate.toISOString()}
            AND
            ${toDate.toISOString()}
          GROUP BY DATE(created_at)
          ORDER BY day DESC
          LIMIT 90
        `),

        db.execute(sql`
          SELECT
            COALESCE(
              network,
              'Unknown'
            ) AS network,
            COUNT(*) AS count,
            COALESCE(
              SUM(amount),
              0
            ) AS total
          FROM cashback_transactions
          WHERE created_at BETWEEN
            ${fromDate.toISOString()}
            AND
            ${toDate.toISOString()}
          GROUP BY network
          ORDER BY total DESC
        `),

        db.execute(sql`
          SELECT
            COALESCE(
              plan_name,
              plan_id,
              'Unknown'
            ) AS plan_name,
            COALESCE(
              network,
              'Unknown'
            ) AS network,
            COUNT(*) AS count,
            COALESCE(
              SUM(amount),
              0
            ) AS total
          FROM cashback_transactions
          WHERE created_at BETWEEN
            ${fromDate.toISOString()}
            AND
            ${toDate.toISOString()}
          GROUP BY
            plan_name,
            plan_id,
            network
          ORDER BY total DESC
          LIMIT 50
        `),

        db.execute(sql`
          SELECT
            ct.user_id,
            u.name AS user_name,
            u.phone AS user_phone,
            COUNT(*) AS count,
            COALESCE(
              SUM(ct.amount),
              0
            ) AS total
          FROM cashback_transactions ct
          JOIN users u
            ON u.id = ct.user_id
          WHERE ct.created_at BETWEEN
            ${fromDate.toISOString()}
            AND
            ${toDate.toISOString()}
          GROUP BY
            ct.user_id,
            u.name,
            u.phone
          ORDER BY total DESC
          LIMIT 50
        `),
      ]);

      res.json({
        period: {
          from:
            fromDate.toISOString(),
          to:
            toDate.toISOString(),
        },
        totals:
          totals.rows[0] ??
          {},
        byDate:
          byDate.rows,
        byNetwork:
          byNetwork.rows,
        byPlan:
          byPlan.rows,
        byUser:
          byUser.rows,
      });
    } catch (error) {
      logger.error(
        {
          error,
        },
        'GET cashback reports failed',
      );

      res.status(500).json({
        error:
          'Failed to load cashback reports.',
      });
    }
  },
);

export default router;
