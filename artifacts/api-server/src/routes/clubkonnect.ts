/**
 * /api/clubkonnect — ClubKonnect utility routes.
 *
 * Customer data plans are controlled by Super Admin pricing_rules.
 *
 * IMPORTANT:
 * - ClubKonnect provides the provider catalogue.
 * - Super Admin pricing_rules decides which plans customers see.
 * - Only enabled DATA pricing rules are exposed.
 * - Customer sees selling_price, never provider cost price.
 * - Purchase continues to use the real ClubKonnect DataPlan/Product ID.
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

/**
 * Check whether a Super Admin pricing rule belongs to the requested network.
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

  /*
   * Normal case:
   *
   * network = mtn
   * OR provider = mtn
   */
  if (
    ruleNetwork === requested ||
    ruleProvider === requested
  ) {
    return true;
  }

  /*
   * Some existing pricing records may store ClubKonnect as provider
   * and leave network empty.
   *
   * We do NOT allow this fallback unless the provider is explicitly
   * a ClubKonnect provider.
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
 *
 * Example:
 *
 * /api/clubkonnect/data-plans?network=mtn&phone=08032732007
 *
 * IMPORTANT:
 * Customer plans are NOT taken directly from ClubKonnect.
 *
 * ClubKonnect catalogue
 *          ↓
 * Super Admin pricing_rules
 *          ↓
 * exact DataPlan / plan_id match
 *          ↓
 * customer plans
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

    /* ------------------------------------------------------------------------
     * Validate network
     * ---------------------------------------------------------------------- */

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

    /* ------------------------------------------------------------------------
     * Validate phone
     * ---------------------------------------------------------------------- */

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
       * 1. FETCH REAL CLUBKONNECT PLANS
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
          endpoint:
            'APIDatabundlePlansV2.asp',
          providerPlanCount:
            providerPlans.length,
        },
        'ClubKonnect data plans loaded',
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
       * 2. READ ONLY DATA PRICING RULES
       *
       * IMPORTANT:
       * Airtime pricing cannot enter this query because:
       *
       *     service_type = 'data'
       *
       * Therefore an Airtime rule from Super Admin will NEVER appear
       * inside Data Plans.
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
       * 3. FILTER RULES FOR REQUESTED NETWORK
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
          configuredPlanCount:
            networkRules.length,
        },
        'ClubKonnect pricing rules filtered',
      );

      /* ======================================================================
       * 4. EXACT PLAN-ID MATCH ONLY
       *
       * THIS IS THE IMPORTANT FIX.
       *
       * Example:
       *
       * ClubKonnect:
       *
       * DataPlan = 1000
       * DataPlanName = 1GB WEEKLY
       *
       * Super Admin:
       *
       * plan_id = 1000
       * plan_name = 1GB WEEKLY
       * selling_price = 450
       *
       * RESULT:
       *
       * 1GB WEEKLY
       * ₦450
       *
       * ONLY THAT PRODUCT APPEARS.
       *
       * We deliberately DO NOT match by plan name.
       *
       * This prevents:
       *
       * 1GB WEEKLY
       * 1GB WEEKLY
       *
       * from appearing when ClubKonnect has two products with the
       * same display name.
       *
       * It also prevents an unconfigured provider product from being
       * shown simply because its name happens to be the same.
       * ==================================================================== */

      const configuredRules =
        networkRules.filter(
          (rule) =>
            rule.plan_id !== null &&
            String(
              rule.plan_id,
            ).trim() !== '',
        );

      const customerPlans =
        providerPlans
          .map(
            (providerPlan) => {
              const providerId =
                String(
                  providerPlan.DataPlan ??
                    '',
                ).trim();

              if (!providerId) {
                return null;
              }

              /*
               * EXACT MATCH.
               *
               * Super Admin plan_id must equal the real ClubKonnect
               * DataPlan/Product ID.
               */
              const matchedRule =
                configuredRules.find(
                  (rule) =>
                    String(
                      rule.plan_id,
                    ).trim() ===
                    providerId,
                );

              /*
               * No exact configuration?
               *
               * Do NOT show this plan.
               */
              if (!matchedRule) {
                return null;
              }

              /* ----------------------------------------------------------------
               * Selling price
               * -------------------------------------------------------------- */

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

              /* ----------------------------------------------------------------
               * Cashback
               * -------------------------------------------------------------- */

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
                const cashbackValue =
                  Number(
                    matchedRule.cashback_value,
                  );

                if (
                  Number.isFinite(
                    cashbackValue,
                  ) &&
                  cashbackValue > 0
                ) {
                  if (
                    matchedRule.cashback_type ===
                    'percentage'
                  ) {
                    cashbackAmount =
                      (
                        (sellingPrice *
                          cashbackValue) /
                        100
                      ).toFixed(0);
                  } else {
                    cashbackAmount =
                      cashbackValue.toFixed(0);
                  }
                }
              }

              /* ----------------------------------------------------------------
               * Return customer plan
               * ---------------------------------------------------------------- */

              return {
                /*
                 * VERY IMPORTANT:
                 *
                 * Keep the REAL ClubKonnect DataPlan ID.
                 *
                 * Do NOT replace this with pricing_rules.id.
                 */
                DataPlan:
                  providerId,

                /*
                 * Name comes from the Super Admin configured rule.
                 */
                DataPlanName:
                  matchedRule.plan_name ||
                  providerPlan.DataPlanName,

                DataPlanType:
                  providerPlan.DataPlanType,

                /*
                 * Customer sees SELLING PRICE.
                 */
                Price: String(
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

      /* ======================================================================
       * 5. FINAL DE-DUPLICATION
       *
       * Even if ClubKonnect somehow returns the same DataPlan more than once,
       * customer receives it only once.
       * ==================================================================== */

      const uniquePlans =
        Array.from(
          new Map(
            customerPlans.map(
              (plan) => [
                plan.DataPlan,
                plan,
              ],
            ),
          ).values(),
        );

      /* ======================================================================
       * 6. LOG EXACT RESULT
       * ==================================================================== */

      logger.info(
        {
          network:
            normalizedNetwork,

          providerPlanCount:
            providerPlans.length,

          configuredPlanCount:
            configuredRules.length,

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
        'Customer ClubKonnect data plans filtered by exact Super Admin pricing',
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
 * IMPORTANT — REQUIRED BY routes/index.ts
 * ========================================================================== */

export default router;
