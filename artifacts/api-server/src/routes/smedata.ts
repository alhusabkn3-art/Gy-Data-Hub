/**
 * /api/smedata
 *
 * SMEDATA data routes.
 *
 * Data plans are maintained manually in:
 *   ../lib/smedata.ts
 *
 * SMEDATA credentials remain server-side.
 */

import {
  Router,
  type Request,
  type Response,
} from 'express';

import {
  getManualDataPlans,
  isSmeDataNetwork,
} from '../lib/smedata.js';

import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';

const router = Router();

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function normalizeNetwork(
  value: unknown,
): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
}

function normalizePlanId(
  value: unknown,
): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function normalizePlanName(
  value: unknown,
): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\(\)\[\]\{\}]/g, ' ')
    .replace(/[_\-\/]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactPlanName(
  value: unknown,
): string {
  return normalizePlanName(
    value,
  ).replace(
    /[^a-z0-9]/g,
    '',
  );
}

function planNamesMatch(
  first: unknown,
  second: unknown,
): boolean {
  const a =
    normalizePlanName(first);

  const b =
    normalizePlanName(second);

  if (!a || !b) {
    return false;
  }

  if (a === b) {
    return true;
  }

  if (
    compactPlanName(a) ===
    compactPlanName(b)
  ) {
    return true;
  }

  const aTokens =
    a.split(' ').filter(Boolean);

  const bTokens =
    new Set(
      b.split(' ').filter(Boolean),
    );

  if (
    aTokens.length === 0 ||
    bTokens.size === 0
  ) {
    return false;
  }

  return aTokens.every(
    (token) =>
      bTokens.has(token),
  );
}

/* ============================================================================
 * DATA PLANS
 * ========================================================================== */

/**
 * GET /api/smedata/data-plans?network=mtn
 *
 * No phone number is required.
 *
 * Plans come from the manual SMEDATA catalogue.
 *
 * Selling prices come from Super Admin pricing_rules.
 */
router.get(
  '/data-plans',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const network =
      normalizeNetwork(
        req.query['network'],
      );

    if (!network) {
      res.status(400).json({
        error:
          'Query param "network" is required (mtn | glo | airtel).',
      });

      return;
    }

    if (
      !isSmeDataNetwork(
        network,
      )
    ) {
      res.status(400).json({
        error:
          `SMEDATA does not support network "${network}".`,
      });

      return;
    }

    try {
      /* ----------------------------------------------------------------------
       * 1. MANUAL SMEDATA CATALOGUE
       * -------------------------------------------------------------------- */

      const manualPlans =
        getManualDataPlans(
          network,
        );

      /* ----------------------------------------------------------------------
       * 2. SUPER ADMIN PRICING RULES
       * -------------------------------------------------------------------- */

      const pricingResult =
        await db.execute(
          sql`
            SELECT
              id,
              plan_id,
              plan_name,
              provider,
              network,
              cost_price,
              selling_price,
              enabled,
              cashback_enabled,
              cashback_type,
              cashback_value
            FROM pricing_rules
            WHERE service_type = 'data'
              AND enabled = true
              AND selling_price IS NOT NULL
              AND selling_price > 0
            ORDER BY plan_name
          `,
        );

      type PricingRule = {
        id: string;
        plan_id:
          | string
          | null;
        plan_name: string;
        provider:
          | string
          | null;
        network:
          | string
          | null;
        cost_price:
          | string
          | number
          | null;
        selling_price:
          | string
          | number
          | null;
        enabled: boolean;
        cashback_enabled:
          | boolean
          | null;
        cashback_type:
          | string
          | null;
        cashback_value:
          | string
          | number
          | null;
      };

      const rules: PricingRule[] =
        pricingResult.rows
          .map(
            (row) => {
              const r =
                row as Record<
                  string,
                  unknown
                >;

              return {
                id:
                  String(
                    r['id'] ??
                      '',
                  ),

                plan_id:
                  r['plan_id'] !==
                    null &&
                  r['plan_id'] !==
                    undefined
                    ? String(
                        r['plan_id'],
                      ).trim()
                    : null,

                plan_name:
                  String(
                    r['plan_name'] ??
                      '',
                  ).trim(),

                provider:
                  r['provider'] !==
                    null &&
                  r['provider'] !==
                    undefined
                    ? String(
                        r['provider'],
                      ).trim()
                    : null,

                network:
                  r['network'] !==
                    null &&
                  r['network'] !==
                    undefined
                    ? String(
                        r['network'],
                      ).trim()
                    : null,

                cost_price:
                  r['cost_price'] as
                    | string
                    | number
                    | null,

                selling_price:
                  r['selling_price'] as
                    | string
                    | number
                    | null,

                enabled:
                  Boolean(
                    r['enabled'],
                  ),

                cashback_enabled:
                  r[
                    'cashback_enabled'
                  ] as
                    | boolean
                    | null,

                cashback_type:
                  r[
                    'cashback_type'
                  ] as
                    | string
                    | null,

                cashback_value:
                  r[
                    'cashback_value'
                  ] as
                    | string
                    | number
                    | null,
              };
            },
          )
          .filter(
            (rule) =>
              rule.enabled &&
              Number(
                rule.selling_price ??
                  0,
              ) > 0,
          );

      /* ----------------------------------------------------------------------
       * 3. MATCH NETWORK
       * -------------------------------------------------------------------- */

      const networkRules =
        rules.filter(
          (rule) => {
            const ruleNetwork =
              normalizeNetwork(
                rule.network,
              );

            const ruleProvider =
              normalizeNetwork(
                rule.provider,
              );

            /*
             * Preferred:
             * pricing_rules.network = mtn/glo/airtel
             */
            if (
              ruleNetwork ===
              network
            ) {
              return true;
            }

            /*
             * Also allow provider/network values
             * that explicitly identify SMEDATA.
             */
            if (
              ruleProvider ===
                'smedata' &&
              (
                !ruleNetwork ||
                ruleNetwork ===
                  network
              )
            ) {
              return true;
            }

            return false;
          },
        );

      /* ----------------------------------------------------------------------
       * 4. MATCH MANUAL PLAN TO PRICING RULE
       * -------------------------------------------------------------------- */

      const plans =
        manualPlans
          .map(
            (manualPlan) => {
              const manualId =
                normalizePlanId(
                  manualPlan.DataPlan,
                );

              const manualName =
                normalizePlanName(
                  manualPlan.DataPlanName,
                );

              /*
               * First try exact plan_id.
               */
              let matchedRule =
                networkRules.find(
                  (rule) =>
                    normalizePlanId(
                      rule.plan_id,
                    ) ===
                    manualId,
                );

              /*
               * Then exact/normalized name.
               */
              if (!matchedRule) {
                matchedRule =
                  networkRules.find(
                    (rule) =>
                      planNamesMatch(
                        rule.plan_name,
                        manualName,
                      ),
                  );
              }

              /*
               * If no pricing rule exists,
               * do not expose a zero-price plan.
               *
               * This prevents customers from
               * accidentally purchasing a plan
               * with ₦0 selling price.
               */
              if (!matchedRule) {
                return null;
              }

              const sellingPrice =
                Number(
                  matchedRule.selling_price ??
                    0,
                );

              if (
                !Number.isFinite(
                  sellingPrice,
                ) ||
                sellingPrice <= 0
              ) {
                return null;
              }

              const costPrice =
                Number(
                  matchedRule.cost_price ??
                    0,
                );

              const cashbackValue =
                Number(
                  matchedRule.cashback_value ??
                    0,
                );

              return {
                DataPlan:
                  manualPlan.DataPlan,

                DataPlanName:
                  manualPlan.DataPlanName,

                DataPlanType:
                  manualPlan.DataPlanType,

                /*
                 * Frontend currently expects Price
                 * as a string.
                 */
                Price:
                  sellingPrice.toString(),

                cashback_enabled:
                  Boolean(
                    matchedRule.cashback_enabled,
                  ),

                cashback_type:
                  matchedRule
                    .cashback_type ===
                    'percentage' ||
                  matchedRule
                    .cashback_type ===
                    'fixed'
                    ? matchedRule
                        .cashback_type
                    : undefined,

                cashback_value:
                  Number.isFinite(
                    cashbackValue,
                  )
                    ? cashbackValue.toString()
                    : undefined,

                /*
                 * Keep internal information
                 * useful to purchase.ts.
                 */
                cost_price:
                  Number.isFinite(
                    costPrice,
                  )
                    ? costPrice.toString()
                    : '0',

                pricing_rule_id:
                  matchedRule.id,

                plan_id:
                  matchedRule.plan_id ??
                  manualPlan.DataPlan,
              };
            },
          )
          .filter(
            (
              plan,
            ): plan is NonNullable<
              typeof plan
            > =>
              plan !== null,
          );

      logger.info(
        {
          network,
          manualPlanCount:
            manualPlans.length,
          pricingRuleCount:
            networkRules.length,
          returnedPlanCount:
            plans.length,
        },
        'SMEDATA manual data plans loaded',
      );

      res.setHeader(
        'Cache-Control',
        'no-store',
      );

      res.json({
        success: true,
        network,
        plans,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : String(err);

      logger.error(
        {
          err,
          network,
        },
        'SMEDATA data plans request failed',
      );

      res.status(500).json({
        error: message,
      });
    }
  },
);

export default router;
