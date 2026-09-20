/**
 * /api/smeapi
 *
 * SME API routes.
 *
 * This route replaces the old SMEDATA data-plan route.
 *
 * IMPORTANT:
 * - SME API is the provider.
 * - Super Admin pricing_rules still controls selling price.
 * - Only plans with an enabled pricing rule are returned.
 * - No SMEDATA or ClubKonnect dependency exists in this file.
 */

import {
  Router,
  type Request,
  type Response,
} from 'express';

import { getDataPlans } from '../lib/smeapi.js';
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
 * GET /api/smeapi/data-plans?network=mtn
 *
 * Data plans come directly from SME API.
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
          'Query param "network" is required (mtn | glo | airtel | 9mobile).',
      });

      return;
    }

    const supportedNetworks =
      new Set([
        'mtn',
        'glo',
        'airtel',
        '9mobile',
      ]);

    if (
      !supportedNetworks.has(
        network,
      )
    ) {
      res.status(400).json({
        error:
          `Unsupported network "${network}".`,
      });

      return;
    }

    try {
      /* ----------------------------------------------------------------------
       * 1. LOAD PLANS FROM SME API
       * -------------------------------------------------------------------- */

      const providerPlans =
        await getDataPlans(
          network,
        );

      /* ----------------------------------------------------------------------
       * 2. LOAD ENABLED SELLING PRICES
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
       * 3. FILTER RULES FOR SELECTED NETWORK
       * -------------------------------------------------------------------- */

      const networkRules =
        rules.filter(
          (rule) => {
            const ruleNetwork =
              normalizeNetwork(
                rule.network,
              );

            /*
             * Normal case:
             *
             * pricing_rules.network = mtn/glo/airtel/9mobile
             */
            if (
              ruleNetwork ===
              network
            ) {
              return true;
            }

            /*
             * If a pricing rule has no network,
             * we allow plan_id/name matching below.
             *
             * This preserves compatibility with
             * existing Super Admin pricing records.
             */
            return !ruleNetwork;
          },
        );

      /* ----------------------------------------------------------------------
       * 4. MATCH SME API PLAN TO PRICING RULE
       * -------------------------------------------------------------------- */

      const plans =
        providerPlans
          .map(
            (providerPlan) => {
              const providerId =
                normalizePlanId(
                  providerPlan.id,
                );

              const providerName =
                normalizePlanName(
                  providerPlan.name,
                );

              /*
               * FIRST:
               * Exact plan ID.
               */
              let matchedRule =
                networkRules.find(
                  (rule) =>
                    normalizePlanId(
                      rule.plan_id,
                    ) ===
                    providerId,
                );

              /*
               * SECOND:
               * Normalized plan name.
               */
              if (!matchedRule) {
                matchedRule =
                  networkRules.find(
                    (rule) =>
                      planNamesMatch(
                        rule.plan_name,
                        providerName,
                      ),
                  );
              }

              /*
               * Do not expose plans that have
               * no configured selling price.
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
                    providerPlan.provider_cost ??
                    0,
                );

              const cashbackValue =
                Number(
                  matchedRule.cashback_value ??
                    0,
                );

              /*
               * IMPORTANT:
               *
               * Keep DataPlan equal to the REAL
               * SME API plan ID.
               *
               * purchase.ts will later use this
               * value when calling SME API.
               */
              return {
                DataPlan:
                  providerPlan.id,

                DataPlanName:
                  providerPlan.name,

                DataPlanType:
                  providerPlan.category,

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
                  providerPlan.id,
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
          providerPlanCount:
            providerPlans.length,
          pricingRuleCount:
            networkRules.length,
          returnedPlanCount:
            plans.length,
        },
        'SME API data plans loaded',
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
        'SME API data plans request failed',
      );

      res.status(500).json({
        error: message,
      });
    }
  },
);

export default router;
