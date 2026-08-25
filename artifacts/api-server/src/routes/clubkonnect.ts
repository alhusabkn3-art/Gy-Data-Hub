/**
 * /api/clubkonnect — Read-only ClubKonnect utility routes.
 *
 * Customer data plans are controlled by Super Admin pricing_rules.
 *
 * Matching:
 * 1. Exact ClubKonnect DataPlan <-> Super Admin plan_id
 * 2. If ID does not match, exact normalized plan name
 * 3. If still no match, compact normalized plan name
 *
 * IMPORTANT:
 * - Only enabled DATA pricing rules are exposed.
 * - Customer sees Super Admin selling_price.
 * - Provider cost price is never exposed.
 * - Real ClubKonnect DataPlan is preserved for purchase.
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

/**
 * Normalizes plan names while preserving useful information.
 *
 * Examples:
 *
 * "1GB WEEKLY"
 * "1 GB Weekly"
 * "1GB-Weekly"
 *
 * become comparable.
 */
function normalizePlanName(
  value: unknown,
): string {
  return String(value ?? '')
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

/**
 * More tolerant name comparison.
 *
 * We use this only after plan_id fails.
 */
function planNamesMatch(
  adminName: unknown,
  providerName: unknown,
): boolean {
  const admin =
    normalizePlanName(
      adminName,
    );

  const provider =
    normalizePlanName(
      providerName,
    );

  if (!admin || !provider) {
    return false;
  }

  /*
   * Exact normalized name.
   */
  if (admin === provider) {
    return true;
  }

  /*
   * Ignore spaces/hyphens/punctuation.
   */
  if (
    compactPlanName(
      admin,
    ) ===
    compactPlanName(
      provider,
    )
  ) {
    return true;
  }

  /*
   * Token comparison.
   *
   * Example:
   * "1GB Weekly"
   * "1GB Weekly 30 Days"
   *
   * We only accept this when all meaningful admin tokens occur
   * in the provider name.
   */
  const adminTokens =
    admin
      .split(' ')
      .filter(Boolean);

  const providerTokens =
    provider
      .split(' ')
      .filter(Boolean);

  if (
    adminTokens.length === 0 ||
    providerTokens.length === 0
  ) {
    return false;
  }

  const providerSet =
    new Set(
      providerTokens,
    );

  const allAdminTokensExist =
    adminTokens.every(
      (token) =>
        providerSet.has(
          token,
        ),
    );

  if (
    allAdminTokensExist
  ) {
    return true;
  }

  return false;
}

/**
 * Super Admin may store network in either:
 *
 * network = mtn
 *
 * or:
 *
 * provider = mtn
 */
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

  if (
    ruleNetwork === requested ||
    ruleProvider === requested
  ) {
    return true;
  }

  /*
   * Existing rules may have provider=ClubKonnect and no network.
   */
  const clubKonnectProviders =
    new Set([
      'clubkonnect',
      'clubkonnectsystems',
      'nellobyte',
      'nellobytesystems',
    ]);

  if (
    !ruleNetwork &&
    clubKonnectProviders.has(
      ruleProvider,
    )
  ) {
    return true;
  }

  return false;
}

/* ============================================================================
 * BALANCE
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
 * DATA PLANS
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
       * 1. GET LIVE CLUBKONNECT PLANS
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
       * 2. GET SUPER ADMIN DATA PRICING RULES
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
       * 3. FILTER NETWORK
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
       * 4. MATCH PLANS
       *
       * IMPORTANT FIX:
       *
       * We DO NOT reject a pricing rule simply because its plan_id does not
       * equal ClubKonnect's DataPlan.
       *
       * We try:
       *
       *   A. exact plan_id
       *   B. exact normalized plan_name
       *   C. compact/token plan_name
       *
       * This allows existing Super Admin configuration to work without
       * changing the Super Admin dashboard/database.
       * ==================================================================== */

      const customerPlans: Array<{
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

      /*
       * Track rules already consumed.
       *
       * This prevents one Super Admin rule from matching multiple provider
       * products with the same name.
       */
      const usedRuleIds =
        new Set<string>();

      for (
        const providerPlan of providerPlans
      ) {
        const providerId =
          normalizePlanId(
            providerPlan.DataPlan,
          );

        const providerName =
          providerPlan.DataPlanName;

        if (!providerId) {
          continue;
        }

        let matchedRule:
          | PricingRule
          | undefined;

        /* --------------------------------------------------------------------
         * FIRST: exact plan ID
         * ------------------------------------------------------------------ */

        matchedRule =
          networkRules.find(
            (rule) =>
              !usedRuleIds.has(
                rule.id,
              ) &&
              Boolean(
                rule.plan_id,
              ) &&
              normalizePlanId(
                rule.plan_id,
              ) === providerId,
          );

        /* --------------------------------------------------------------------
         * SECOND: exact normalized name
         *
         * This is the important fallback for the existing configuration.
         * ------------------------------------------------------------------ */

        if (!matchedRule) {
          matchedRule =
            networkRules.find(
              (rule) =>
                !usedRuleIds.has(
                  rule.id,
                ) &&
                planNamesMatch(
                  rule.plan_name,
                  providerName,
                ),
            );
        }

        /* --------------------------------------------------------------------
         * No configured rule = DO NOT SHOW PROVIDER PLAN.
         * ------------------------------------------------------------------ */

        if (!matchedRule) {
          continue;
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
          continue;
        }

        /* --------------------------------------------------------------------
         * Cashback
         * ------------------------------------------------------------------ */

        let cashbackAmount:
          | string
          | undefined;

        if (
          matchedRule.cashback_enabled &&
          matchedRule.cashback_type &&
          matchedRule.cashback_value !==
            null &&
          matchedRule.cashback_value !==
            undefined
        ) {
          const value =
            Number(
              matchedRule.cashback_value,
            );

          if (
            Number.isFinite(
              value,
            ) &&
            value > 0
          ) {
            if (
              matchedRule.cashback_type ===
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
          matchedRule.id,
        );

        /* --------------------------------------------------------------------
         * RETURN CUSTOMER PLAN
         *
         * DataPlan = REAL ClubKonnect ID.
         * Price = Super Admin selling price.
         * ------------------------------------------------------------------ */

        customerPlans.push({
          DataPlan:
            String(
              providerPlan.DataPlan,
            ).trim(),

          DataPlanName:
            matchedRule.plan_name ||
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
              matchedRule.cashback_enabled,
            ),

          cashback_type:
            matchedRule.cashback_enabled
              ? matchedRule.cashback_type ??
                undefined
              : undefined,

          cashback_value:
            matchedRule.cashback_enabled &&
            matchedRule.cashback_value !==
              null &&
            matchedRule.cashback_value !==
              undefined
              ? String(
                  matchedRule.cashback_value,
                )
              : undefined,

          cashback_amount:
            cashbackAmount,
        });
      }

      /* ======================================================================
       * 5. REMOVE DUPLICATE CLUBKONNECT PRODUCTS
       * ==================================================================== */

      const uniquePlans =
        Array.from(
          new Map(
            customerPlans.map(
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
       * 6. LOG RESULT
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
       * 7. RESPONSE
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
 * TRANSACTION STATUS
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
