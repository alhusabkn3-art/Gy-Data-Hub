/**
 * /api/clubkonnect — ClubKonnect utility routes.
 *
 * Customer data plans are controlled by Super Admin pricing_rules.
 *
 * Matching order:
 * 1. Exact pricing_rules.plan_id -> ClubKonnect DataPlan
 * 2. Exact normalized plan name
 * 3. Controlled normalized name match
 *
 * Only enabled DATA pricing rules are shown.
 * Customer price is always Super Admin selling_price.
 */

import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

import * as ck from '../lib/clubkonnect.js';
import { normalizeCKStatus } from '../lib/clubkonnect.js';
import { logger } from '../lib/logger.js';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';

const router = Router();

/* ============================================================================
 * CREDENTIALS
 * ========================================================================== */

function requireCredentials(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (
    !process.env['CLUBKONNECT_USER_ID'] ||
    !process.env['CLUBKONNECT_API_KEY']
  ) {
    res.status(503).json({
      error:
        'ClubKonnect credentials not configured.',
      hint:
        'Add CLUBKONNECT_USER_ID and CLUBKONNECT_API_KEY to the deployment environment.',
    });

    return;
  }

  next();
}

router.use(requireCredentials);

/* ============================================================================
 * HELPERS
 * ========================================================================== */

function normalizePlanName(
  value: unknown,
): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\(\)\[\]\{\}]/g, ' ')
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeNetwork(
  value: unknown,
): string {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '');
}

function normalizePlanId(
  value: unknown,
): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

function ruleMatchesNetwork(
  row: {
    network?: unknown;
    provider?: unknown;
  },
  requestedNetwork: string,
): boolean {
  const requested =
    normalizeNetwork(
      requestedNetwork,
    );

  const ruleNetwork =
    normalizeNetwork(
      row.network,
    );

  const ruleProvider =
    normalizeNetwork(
      row.provider,
    );

  const providerNames =
    new Set([
      'clubkonnect',
      'clubkonnectsystems',
      'nellobyte',
      'nellobytesystems',
    ]);

  if (
    ruleNetwork === requested ||
    ruleProvider === requested
  ) {
    return true;
  }

  /*
   * Existing Super Admin records may have provider=ClubKonnect
   * and no network value.
   */
  if (
    !ruleNetwork &&
    providerNames.has(
      ruleProvider,
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Controlled name comparison.
 *
 * We deliberately remove cosmetic differences only.
 *
 * Examples:
 *
 * 1GB WEEKLY
 * 1 GB WEEKLY
 * 1GB-WEEKLY
 * 1GB Weekly
 *
 * can match.
 *
 * But we do NOT use arbitrary partial matching that could make
 * different plans match each other.
 */
function planNamesMatch(
  adminName: unknown,
  providerName: unknown,
): boolean {
  const a =
    normalizePlanName(
      adminName,
    );

  const b =
    normalizePlanName(
      providerName,
    );

  if (!a || !b) {
    return false;
  }

  if (a === b) {
    return true;
  }

  /*
   * Remove spaces for cases such as:
   *
   * "1GB Weekly"
   * "1 GB Weekly"
   */
  const compactA =
    a.replace(/\s+/g, '');

  const compactB =
    b.replace(/\s+/g, '');

  return compactA === compactB;
}

/* ============================================================================
 * GET /balance
 * ========================================================================== */

router.get(
  '/balance',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    if (!req.session.isAdmin) {
      res.status(401).json({
        error:
          'Admin session required.',
      });

      return;
    }

    try {
      const data =
        await ck.getBalance();

      res.json({
        success: true,
        balance:
          data.balance ??
          data.APIBalance,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : String(err);

      logger.error(
        { err },
        'ClubKonnect balance check failed',
      );

      res.status(502).json({
        error: message,
      });
    }
  },
);

/* ============================================================================
 * GET /data-plans
 * ========================================================================== */

router.get(
  '/data-plans',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const network =
      req.query['network'];

    const phone =
      req.query['phone'];

    if (
      !network ||
      typeof network !== 'string'
    ) {
      res.status(400).json({
        error:
          'Query param "network" is required (mtn | glo | airtel | 9mobile).',
      });

      return;
    }

    const normalizedNetwork =
      network.trim().toLowerCase();

    const normalizedPhone =
      typeof phone === 'string'
        ? phone.trim()
        : '';

    if (!normalizedPhone) {
      res.status(400).json({
        error:
          'Query param "phone" is required.',
      });

      return;
    }

    try {
      /* ======================================================================
       * 1. GET CLUBKONNECT CATALOGUE
       * ==================================================================== */

      const providerPlans =
        await ck.getDataPlans(
          normalizedNetwork,
          normalizedPhone,
        );

      logger.info(
        {
          network:
            normalizedNetwork,
          providerPlanCount:
            providerPlans.length,
        },
        'ClubKonnect provider plans loaded',
      );

      if (
        providerPlans.length === 0
      ) {
        res.setHeader(
          'Cache-Control',
          'no-store',
        );

        res.json({
          success: true,
          network:
            normalizedNetwork,
          plans: [],
        });

        return;
      }

      /* ======================================================================
       * 2. READ SUPER ADMIN DATA PRICING
       * ==================================================================== */

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
        plan_id: string | null;
        plan_name: string;
        provider: string | null;
        network: string | null;
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
                  r['cashback_enabled'] as
                    | boolean
                    | null,

                cashback_type:
                  r['cashback_type'] as
                    | string
                    | null,

                cashback_value:
                  r['cashback_value'] as
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

      /* ======================================================================
       * 3. NETWORK FILTER
       * ==================================================================== */

      const networkRules =
        rules.filter(
          (rule) =>
            ruleMatchesNetwork(
              rule,
              normalizedNetwork,
            ),
        );

      logger.info(
        {
          network:
            normalizedNetwork,

          providerPlanCount:
            providerPlans.length,

          totalPricingRules:
            rules.length,

          networkPricingRules:
            networkRules.length,
        },
        'ClubKonnect pricing rules loaded',
      );

      if (
        networkRules.length === 0
      ) {
        logger.warn(
          {
            network:
              normalizedNetwork,
            providerPlanCount:
              providerPlans.length,
          },
          'No enabled Super Admin data pricing rules found for network',
        );

        res.setHeader(
          'Cache-Control',
          'no-store',
        );

        res.json({
          success: true,
          network:
            normalizedNetwork,
          plans: [],
        });

        return;
      }

      /* ======================================================================
       * 4. MATCHING
       *
       * Priority:
       *
       * A. EXACT plan_id
       * B. EXACT normalized plan name
       * C. compact normalized name
       *
       * This means existing Super Admin records will still work even when
       * their plan_id was saved differently from ClubKonnect's current
       * PRODUCT_ID.
       * ==================================================================== */

      const matchedPlans: Array<{
        DataPlan: string;
        DataPlanName: string;
        DataPlanType: string;
        Price: string;
        selling_price: number;
        cashback_enabled: boolean;
        cashback_type?: string;
        cashback_value?: string;
        cashback_amount?: string;
      }> = [];

      const usedRuleIds =
        new Set<string>();

      /*
       * First pass:
       *
       * Exact provider DataPlan -> Admin plan_id.
       */
      for (
        const providerPlan of providerPlans
      ) {
        const providerId =
          normalizePlanId(
            providerPlan.DataPlan,
          );

        if (!providerId) {
          continue;
        }

        const exactRule =
          networkRules.find(
            (rule) => {
              if (
                usedRuleIds.has(
                  rule.id,
                )
              ) {
                return false;
              }

              if (
                !rule.plan_id
              ) {
                return false;
              }

              return (
                normalizePlanId(
                  rule.plan_id,
                ) ===
                providerId
              );
            },
          );

        if (!exactRule) {
          continue;
        }

        const sellingPrice =
          Number(
            exactRule.selling_price ??
              0,
          );

        if (
          !Number.isFinite(
            sellingPrice,
          ) ||
          sellingPrice <= 0
        ) {
          continue;
        }

        let cashbackAmount:
          | string
          | undefined;

        if (
          exactRule.cashback_enabled &&
          exactRule.cashback_type &&
          exactRule.cashback_value !==
            null &&
          exactRule.cashback_value !==
            undefined
        ) {
          const value =
            Number(
              exactRule.cashback_value,
            );

          if (
            Number.isFinite(
              value,
            ) &&
            value > 0
          ) {
            if (
              exactRule.cashback_type ===
              'percentage'
            ) {
              cashbackAmount =
                (
                  (sellingPrice *
                    value) /
                  100
                ).toFixed(0);
            } else {
              cashbackAmount =
                value.toFixed(0);
            }
          }
        }

        usedRuleIds.add(
          exactRule.id,
        );

        matchedPlans.push({
          DataPlan:
            String(
              providerPlan.DataPlan,
            ).trim(),

          DataPlanName:
            exactRule.plan_name ||
            providerPlan.DataPlanName,

          DataPlanType:
            providerPlan.DataPlanType,

          Price:
            String(
              Math.round(
                sellingPrice,
              ),
            ),

          selling_price:
            Math.round(
              sellingPrice,
            ),

          cashback_enabled:
            Boolean(
              exactRule.cashback_enabled,
            ),

          cashback_type:
            exactRule.cashback_enabled
              ? exactRule.cashback_type ??
                undefined
              : undefined,

          cashback_value:
            exactRule.cashback_enabled &&
            exactRule.cashback_value !==
              null &&
            exactRule.cashback_value !==
              undefined
              ? String(
                  exactRule.cashback_value,
                )
              : undefined,

          cashback_amount:
            cashbackAmount,
        });
      }

      /* ======================================================================
       * 5. SECOND PASS — NAME MATCH
       *
       * This is the important compatibility fix.
       *
       * If the Admin rule did not match by ID, we match the actual provider
       * plan name against the Admin configured plan name.
       *
       * ONLY UNUSED ADMIN RULES can be used here.
       * ==================================================================== */

      for (
        const providerPlan of providerPlans
      ) {
        const providerId =
          String(
            providerPlan.DataPlan ??
              '',
          ).trim();

        if (!providerId) {
          continue;
        }

        /*
         * Already matched by exact ID.
         */
        if (
          matchedPlans.some(
            (plan) =>
              normalizePlanId(
                plan.DataPlan,
              ) ===
              normalizePlanId(
                providerId,
              ),
          )
        ) {
          continue;
        }

        const providerName =
          providerPlan.DataPlanName;

        /*
         * Find an unused pricing rule by name.
         */
        const nameRule =
          networkRules.find(
            (rule) => {
              if (
                usedRuleIds.has(
                  rule.id,
                )
              ) {
                return false;
              }

              return planNamesMatch(
                rule.plan_name,
                providerName,
              );
            },
          );

        if (!nameRule) {
          continue;
        }

        const sellingPrice =
          Number(
            nameRule.selling_price ??
              0,
          );

        if (
          !Number.isFinite(
            sellingPrice,
          ) ||
          sellingPrice <= 0
        ) {
          continue;
        }

        let cashbackAmount:
          | string
          | undefined;

        if (
          nameRule.cashback_enabled &&
          nameRule.cashback_type &&
          nameRule.cashback_value !==
            null &&
          nameRule.cashback_value !==
            undefined
        ) {
          const value =
            Number(
              nameRule.cashback_value,
            );

          if (
            Number.isFinite(
              value,
            ) &&
            value > 0
          ) {
            if (
              nameRule.cashback_type ===
              'percentage'
            ) {
              cashbackAmount =
                (
                  (sellingPrice *
                    value) /
                  100
                ).toFixed(0);
            } else {
              cashbackAmount =
                value.toFixed(0);
            }
          }
        }

        usedRuleIds.add(
          nameRule.id,
        );

        matchedPlans.push({
          /*
           * ALWAYS return the real provider DataPlan.
           */
          DataPlan:
            providerId,

          DataPlanName:
            nameRule.plan_name ||
            providerPlan.DataPlanName,

          DataPlanType:
            providerPlan.DataPlanType,

          /*
           * Customer price is Super Admin selling price.
           */
          Price:
            String(
              Math.round(
                sellingPrice,
              ),
            ),

          selling_price:
            Math.round(
              sellingPrice,
            ),

          cashback_enabled:
            Boolean(
              nameRule.cashback_enabled,
            ),

          cashback_type:
            nameRule.cashback_enabled
              ? nameRule.cashback_type ??
                undefined
              : undefined,

          cashback_value:
            nameRule.cashback_enabled &&
            nameRule.cashback_value !==
              null &&
            nameRule.cashback_value !==
              undefined
              ? String(
                  nameRule.cashback_value,
                )
              : undefined,

          cashback_amount:
            cashbackAmount,
        });
      }

      /* ======================================================================
       * 6. FINAL DUPLICATE PROTECTION
       *
       * One real ClubKonnect DataPlan = one customer plan.
       * ==================================================================== */

      const uniquePlans =
        Array.from(
          new Map(
            matchedPlans.map(
              (plan) => [
                normalizePlanId(
                  plan.DataPlan,
                ),
                plan,
              ],
            ),
          ).values(),
        );

      /* ======================================================================
       * 7. LOGGING
       * ==================================================================== */

      logger.info(
        {
          network:
            normalizedNetwork,

          providerPlanCount:
            providerPlans.length,

          configuredPlanCount:
            networkRules.length,

          customerPlanCount:
            uniquePlans.length,

          customerPlanIds:
            uniquePlans.map(
              (plan) =>
                plan.DataPlan,
            ),

          customerPlanNames:
            uniquePlans.map(
              (plan) =>
                plan.DataPlanName,
            ),

          customerSellingPrices:
            uniquePlans.map(
              (plan) => ({
                DataPlan:
                  plan.DataPlan,
                name:
                  plan.DataPlanName,
                price:
                  plan.selling_price,
              }),
            ),
        },
        'Customer ClubKonnect data plans matched with Super Admin pricing',
      );

      /* ======================================================================
       * 8. RESPONSE
       * ==================================================================== */

      res.setHeader(
        'Cache-Control',
        'no-store',
      );

      res.json({
        success: true,
        network:
          normalizedNetwork,
        plans:
          uniquePlans,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : String(err);

      logger.error(
        {
          err,
          network:
            normalizedNetwork,
          hasPhone:
            Boolean(
              normalizedPhone,
            ),
        },
        'ClubKonnect data-plans fetch failed',
      );

      res.status(502).json({
        error: message,
      });
    }
  },
);

/* ============================================================================
 * GET /status
 * ========================================================================== */

router.get(
  '/status',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    if (!req.session.isAdmin) {
      res.status(401).json({
        error:
          'Admin session required.',
      });

      return;
    }

    const requestId =
      req.query['requestId'];

    if (
      !requestId ||
      typeof requestId !== 'string'
    ) {
      res.status(400).json({
        error:
          'Query param "requestId" is required.',
      });

      return;
    }

    try {
      const result =
        await ck.getTransactionStatus(
          requestId,
        );

      const normalized =
        normalizeCKStatus(
          result.status,
        );

      res.json({
        success: true,
        requestId,
        normalized,
        vendorStatus:
          result.status,
        providerRef:
          result.OrderID ??
          result.ident,
        rawResult:
          result,
      });
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : String(err);

      logger.error(
        {
          err,
          requestId,
        },
        'ClubKonnect status check failed',
      );

      res.status(502).json({
        error: message,
      });
    }
  },
);

/* ============================================================================
 * REQUIRED DEFAULT EXPORT
 * ========================================================================== */

export default router;
