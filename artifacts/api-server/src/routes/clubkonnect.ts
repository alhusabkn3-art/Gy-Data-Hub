/**
 * /api/clubkonnect — Read-only ClubKonnect utility routes.
 *
 * Customer data plans are controlled by Super Admin pricing_rules.
 *
 * IMPORTANT:
 * - ClubKonnect provides the provider catalogue.
 * - Super Admin pricing_rules decides which plans customers see.
 * - Only enabled pricing rules are exposed.
 * - Customer sees selling_price, never provider cost price.
 * - Purchase continues to use ClubKonnect PRODUCT_ID/DataPlan.
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

/* ────────────────────────────────────────────────────────────────────────────
 * Credentials
 * ──────────────────────────────────────────────────────────────────────────── */

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

/* ────────────────────────────────────────────────────────────────────────────
 * Helpers
 * ──────────────────────────────────────────────────────────────────────────── */

/**
 * Normalise a plan name so that small formatting differences do not prevent
 * Super Admin pricing from matching a ClubKonnect plan.
 *
 * Examples:
 *
 * "1GB Weekly (SME)"
 * "1 GB Weekly SME"
 *
 * become comparable strings.
 */
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

/**
 * Returns true when the pricing rule belongs to the requested network.
 *
 * We deliberately accept either:
 *   network = MTN
 * OR
 *   provider = MTN
 *
 * because the existing Super Admin pricing system stores provider/network
 * independently.
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
   * If provider is ClubKonnect and the network column is empty,
   * allow the rule to be considered for the requested network.
   *
   * This supports existing Super Admin rules that were created
   * without a network value.
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

/* ────────────────────────────────────────────────────────────────────────────
 * GET /balance
 * ──────────────────────────────────────────────────────────────────────────── */

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

/* ────────────────────────────────────────────────────────────────────────────
 * GET /data-plans
 *
 * /api/clubkonnect/data-plans?network=mtn&phone=080...
 * ──────────────────────────────────────────────────────────────────────────── */

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
      /* ─────────────────────────────────────────────────────────────────────
       * 1. Get all live plans from ClubKonnect.
       * ───────────────────────────────────────────────────────────────────── */

      const providerPlans =
        await ck.getDataPlans(
          normalizedNetwork,
          normalizedPhone,
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

      /* ─────────────────────────────────────────────────────────────────────
       * 2. Read Super Admin pricing rules.
       *
       * We intentionally do NOT modify Super Admin.
       * We only read the existing table.
       *
       * IMPORTANT:
       * We don't require plan_id here because an existing Super Admin
       * rule may have been saved by name only.
       * ───────────────────────────────────────────────────────────────────── */

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

      /* ─────────────────────────────────────────────────────────────────────
       * 3. Keep only pricing rules for this network.
       * ───────────────────────────────────────────────────────────────────── */

      const networkRules =
        rules.filter(
          (rule) =>
            ruleMatchesNetwork(
              rule,
              normalizedNetwork,
            ),
        );

      /*
       * If the existing database stores provider/network differently,
       * we still have the plan-name fallback below.
       */

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

      /* ─────────────────────────────────────────────────────────────────────
       * 4. Match provider plans.
       *
       * FIRST:
       *   ClubKonnect DataPlan === pricing_rules.plan_id
       *
       * SECOND:
       *   Normalized plan name === normalized pricing plan name
       *
       * The second method is important for existing Super Admin records
       * where plan_id was not saved or was saved differently.
       * ───────────────────────────────────────────────────────────────────── */

      const customerPlans =
        providerPlans
          .map(
            (providerPlan) => {
              const providerId =
                String(
                  providerPlan.DataPlan ??
                    '',
                ).trim();

              const providerName =
                normalizePlanName(
                  providerPlan.DataPlanName,
                );

              /*
               * Exact ID match.
               */
              let matchedRule =
                networkRules.find(
                  (rule) =>
                    Boolean(
                      rule.plan_id,
                    ) &&
                    String(
                      rule.plan_id,
                    ).trim() ===
                      providerId,
                );

              /*
               * Fallback name match.
               */
              if (
                !matchedRule &&
                providerName
              ) {
                matchedRule =
                  networkRules.find(
                    (rule) =>
                      normalizePlanName(
                        rule.plan_name,
                      ) ===
                      providerName,
                  );
              }

              /*
               * Additional safe name matching:
               *
               * This handles cases such as:
               *
               * ClubKonnect:
               *   "1GB Weekly (SME)"
               *
               * Admin:
               *   "1GB Weekly SME"
               */
              if (
                !matchedRule &&
                providerName
              ) {
                matchedRule =
                  networkRules.find(
                    (rule) => {
                      const adminName =
                        normalizePlanName(
                          rule.plan_name,
                        );

                      if (
                        !adminName ||
                        !providerName
                      ) {
                        return false;
                      }

                      return (
                        adminName ===
                          providerName ||
                        adminName.includes(
                          providerName,
                        ) ||
                        providerName.includes(
                          adminName,
                        )
                      );
                    },
                  );
              }

              if (
                !matchedRule
              ) {
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

              /* ─────────────────────────────────────────────────────────────
               * Cashback
               * ───────────────────────────────────────────────────────────── */

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
                      cashbackValue.toFixed(
                        0,
                      );
                  }
                }
              }

              /*
               * IMPORTANT:
               *
               * DataPlan remains the REAL ClubKonnect PRODUCT_ID.
               *
               * This is what purchaseData() must send to:
               * APIDatabundleV1.asp
               *
               * We do NOT replace it with pricing_rules.id.
               */
              return {
                DataPlan:
                  providerId,

                DataPlanName:
                  matchedRule.plan_name ||
                  providerPlan.DataPlanName,

                DataPlanType:
                  providerPlan.DataPlanType,

                /*
                 * Customer-facing price:
                 * Super Admin SELLING PRICE.
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
                    matchedRule.cashback_enabled,
                  ),

                cashback_type:
                  matchedRule.cashback_enabled
                    ? matchedRule.cashback_type ??
                      undefined
                    : undefined,

                cashback_value:
                  matchedRule.cashback_enabled
                    ? matchedRule.cashback_value !==
                        null &&
                      matchedRule.cashback_value !==
                        undefined
                      ? String(
                          matchedRule.cashback_value,
                        )
                      : undefined
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

      /* ─────────────────────────────────────────────────────────────────────
       * 5. Remove duplicate DataPlan IDs.
       * ───────────────────────────────────────────────────────────────────── */

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
          customerPlanCount:
            uniquePlans.length,

          /*
           * This makes the next Render log much easier to diagnose
           * if something is still wrong.
           */
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
        },
        'Customer ClubKonnect data plans filtered by Super Admin pricing',
      );

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
          network,
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

/* ────────────────────────────────────────────────────────────────────────────
 * GET /status
 * ──────────────────────────────────────────────────────────────────────────── */

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
        rawResult: result,
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

export default router;
