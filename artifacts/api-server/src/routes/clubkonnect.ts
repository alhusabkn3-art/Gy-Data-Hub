/**
 * /api/clubkonnect — Read-only ClubKonnect utility routes.
 *
 * These routes give admins and the frontend read-only access to ClubKonnect
 * data (balance, plans, status queries).
 *
 * Mutating routes (POST /airtime, POST /data) have been REMOVED.
 * All customer purchases must go through /api/purchase/* which:
 *   - Requires an authenticated user session
 *   - Validates price against admin-configured pricing_rules
 *   - Atomically debits the wallet
 *   - Writes a wallet_ledger audit entry
 *   - Handles CK "pending" status correctly
 *
 * Emergency direct-vendor calls (bypassing wallet): if ever needed for
 * reconciliation or testing, contact a super admin to use the admin
 * ClubKonnect balance / status check routes below, then issue corrections
 * via the admin wallet-adjustment flow.
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

/** Reject requests when credentials are not configured */
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
      error: 'ClubKonnect credentials not configured.',
      hint:
        'Add CLUBKONNECT_USER_ID and CLUBKONNECT_API_KEY to the deployment environment.',
    });
    return;
  }

  next();
}

router.use(requireCredentials);

// ── GET /api/clubkonnect/balance ───────────────────────────────────────────────
// Used by admin dashboard to check ClubKonnect vendor wallet balance.
// Admin session required — prevents leaking business-sensitive balance info.
router.get(
  '/balance',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    if (!req.session.isAdmin) {
      res.status(401).json({
        error: 'Admin session required.',
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

// ── GET /api/clubkonnect/data-plans?network=mtn&phone=080... ──────────────────
// Used by the frontend to display CUSTOMER-AVAILABLE data plans.
//
// IMPORTANT:
// ClubKonnect supplies the complete provider catalogue.
// Super Admin pricing_rules decides which plans are actually visible
// to customers and what selling price they see.
//
// Therefore:
//   ClubKonnect plans
//        ↓
//   pricing_rules
//        ↓
//   service_type = data
//   matching network/provider
//   matching plan_id
//   enabled = true
//        ↓
//   customer sees selling_price only
//
// Super Admin code is NOT changed here.
// We only read the existing pricing_rules table.
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
      // ─────────────────────────────────────────────────────────────────────
      // 1. Fetch the provider catalogue.
      // ─────────────────────────────────────────────────────────────────────

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

      // ─────────────────────────────────────────────────────────────────────
      // 2. Load ONLY plans configured by Super Admin.
      //
      // The Super Admin already stores:
      //   service_type
      //   provider
      //   network
      //   plan_id
      //   plan_name
      //   cost_price
      //   selling_price
      //   enabled
      //
      // We do NOT modify that system.
      // ─────────────────────────────────────────────────────────────────────

      const networkUpper =
        normalizedNetwork.toUpperCase();

      const pricingResult =
        await db.execute(
          sql`
            SELECT
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
              AND plan_id IS NOT NULL
              AND selling_price IS NOT NULL
              AND selling_price > 0
              AND (
                UPPER(COALESCE(network, '')) = ${networkUpper}
                OR UPPER(COALESCE(provider, '')) = ${networkUpper}
                OR LOWER(COALESCE(provider, '')) IN (
                  'clubkonnect',
                  'club konnect',
                  'nellobyte',
                  'nellobytesystems'
                )
              )
            ORDER BY plan_name
          `,
        );

      // ─────────────────────────────────────────────────────────────────────
      // 3. Build a pricing map using plan_id.
      //
      // ClubKonnect's PRODUCT_ID is the value used as DataPlan.
      // Therefore:
      //
      //   ClubKonnect DataPlan
      //          ===
      //   pricing_rules.plan_id
      //
      // Only matching configured rules survive.
      // ─────────────────────────────────────────────────────────────────────

      const pricingMap =
        new Map<
          string,
          {
            planId: string;
            planName: string;
            sellingPrice: number;
            costPrice: number;
            cashbackEnabled: boolean;
            cashbackType?: string;
            cashbackValue?: string;
          }
        >();

      for (
        const row of
          pricingResult.rows
      ) {
        const r =
          row as {
            plan_id: string | null;
            plan_name: string | null;
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

        if (!r.plan_id) {
          continue;
        }

        const sellingPrice =
          Number(
            r.selling_price ?? 0,
          );

        const costPrice =
          Number(
            r.cost_price ?? 0,
          );

        if (
          !Number.isFinite(
            sellingPrice,
          ) ||
          sellingPrice <= 0
        ) {
          continue;
        }

        pricingMap.set(
          String(
            r.plan_id,
          ).trim(),
          {
            planId:
              String(
                r.plan_id,
              ).trim(),

            planName:
              String(
                r.plan_name ??
                  '',
              ).trim(),

            sellingPrice,

            costPrice:

              Number.isFinite(
                costPrice,
              )
                ? costPrice
                : 0,

            cashbackEnabled:
              Boolean(
                r.cashback_enabled,
              ),

            cashbackType:
              r.cashback_type
                ? String(
                    r.cashback_type,
                  )
                : undefined,

            cashbackValue:
              r.cashback_value !==
              null &&
              r.cashback_value !==
                undefined
                ? String(
                    r.cashback_value,
                  )
                : undefined,
          },
        );
      }

      // ─────────────────────────────────────────────────────────────────────
      // 4. Filter ClubKonnect plans against Super Admin pricing_rules.
      //
      // This is the important part:
      //
      // If a plan exists in ClubKonnect BUT Super Admin has not configured it,
      // it is NOT returned to the customer.
      //
      // If enabled=false, it is NOT returned.
      //
      // If selling_price is missing/zero, it is NOT returned.
      // ─────────────────────────────────────────────────────────────────────

      const enriched =
        providerPlans
          .filter(
            (plan) => {
              const planId =
                String(
                  plan.DataPlan,
                ).trim();

              return pricingMap.has(
                planId,
              );
            },
          )
          .map(
            (plan) => {
              const planId =
                String(
                  plan.DataPlan,
                ).trim();

              const pricing =
                pricingMap.get(
                  planId,
                );

              if (!pricing) {
                return null;
              }

              // Cashback is calculated from SELLING PRICE,
              // because that is the amount the customer actually pays.
              let cashbackAmount:
                | string
                | undefined;

              if (
                pricing.cashbackEnabled &&
                pricing.cashbackType &&
                pricing.cashbackValue
              ) {
                const value =
                  Number(
                    pricing.cashbackValue,
                  );

                if (
                  Number.isFinite(
                    value,
                  ) &&
                  value > 0
                ) {
                  if (
                    pricing.cashbackType ===
                    'percentage'
                  ) {
                    cashbackAmount =
                      (
                        (pricing.sellingPrice *
                          value) /
                        100
                      ).toFixed(0);
                  } else {
                    cashbackAmount =
                      value.toFixed(
                        0,
                      );
                  }
                }
              }

              return {
                // Keep the provider's DataPlan/Product ID.
                // Purchase will use this same ID.
                DataPlan:
                  planId,

                // Prefer Super Admin's configured name.
                // Fall back to provider name if the admin name
                // is empty.
                DataPlanName:
                  pricing.planName ||
                  plan.DataPlanName,

                DataPlanType:
                  plan.DataPlanType,

                // IMPORTANT:
                // Customer sees SELLING PRICE, not provider cost.
                Price:
                  String(
                    Math.round(
                      pricing.sellingPrice,
                    ),
                  ),

                // Explicit customer-facing selling price.
                selling_price:
                  Math.round(
                    pricing.sellingPrice,
                  ),

                // Do NOT expose provider cost price.
                cost_price:
                  undefined,

                cashback_enabled:
                  Boolean(
                    pricing.cashbackEnabled,
                  ),

                cashback_type:
                  pricing.cashbackEnabled
                    ? pricing.cashbackType
                    : undefined,

                cashback_value:
                  pricing.cashbackEnabled
                    ? pricing.cashbackValue
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

      logger.info(
        {
          network:
            normalizedNetwork,
          providerPlanCount:
            providerPlans.length,
          configuredPlanCount:
            pricingMap.size,
          customerPlanCount:
            enriched.length,
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
        plans: enriched,
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

// ── GET /api/clubkonnect/status?requestId=xxx ──────────────────────────────────
// Check the status of a specific ClubKonnect order by RequestID.
// Admin session required — used for support and reconciliation.
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

// KEEP THIS — routes/index.ts imports this router as default.
export default router;
