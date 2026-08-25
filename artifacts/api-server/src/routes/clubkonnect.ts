router.get(
  '/data-plans',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const network = req.query['network'];
    const phone = req.query['phone'];

    if (!network || typeof network !== 'string') {
      res.status(400).json({
        error:
          'Query param "network" is required (mtn | glo | airtel | 9mobile).',
      });
      return;
    }

    const normalizedNetwork = network.trim().toLowerCase();

    const normalizedPhone =
      typeof phone === 'string'
        ? phone.trim()
        : '';

    if (!normalizedPhone) {
      res.status(400).json({
        error: 'Query param "phone" is required.',
      });
      return;
    }

    try {
      // 1. Get the real ClubKonnect catalogue.
      const providerPlans =
        await ck.getDataPlans(
          normalizedNetwork,
          normalizedPhone,
        );

      if (providerPlans.length === 0) {
        res.setHeader(
          'Cache-Control',
          'no-store',
        );

        res.json({
          success: true,
          network: normalizedNetwork,
          plans: [],
        });

        return;
      }

      // 2. Read ONLY enabled DATA pricing rules.
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
        cost_price: string | number | null;
        selling_price: string | number | null;
        enabled: boolean;
        cashback_enabled: boolean | null;
        cashback_type: string | null;
        cashback_value: string | number | null;
      };

      const rules: PricingRule[] =
        pricingResult.rows
          .map((row) => {
            const r =
              row as Record<string, unknown>;

            return {
              id: String(r['id'] ?? ''),

              plan_id:
                r['plan_id'] !== null &&
                r['plan_id'] !== undefined
                  ? String(r['plan_id']).trim()
                  : null,

              plan_name:
                String(r['plan_name'] ?? '').trim(),

              provider:
                r['provider'] !== null &&
                r['provider'] !== undefined
                  ? String(r['provider']).trim()
                  : null,

              network:
                r['network'] !== null &&
                r['network'] !== undefined
                  ? String(r['network']).trim()
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

              enabled: Boolean(r['enabled']),

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
          })
          .filter(
            (rule) =>
              rule.enabled &&
              Number(rule.selling_price ?? 0) > 0,
          );

      const requestedNetwork =
        normalizedNetwork.toUpperCase();

      // 3. Keep rules belonging to the requested network.
      const networkRules =
        rules.filter((rule) => {
          const ruleNetwork =
            String(rule.network ?? '')
              .trim()
              .toUpperCase();

          const ruleProvider =
            String(rule.provider ?? '')
              .trim()
              .toUpperCase();

          return (
            ruleNetwork === requestedNetwork ||
            ruleProvider === requestedNetwork
          );
        });

      /*
       * 4. IMPORTANT MATCHING RULE
       *
       * We first match pricing_rules.plan_id against the REAL
       * ClubKonnect DataPlan/Product ID.
       *
       * We DO NOT use loose plan-name matching when a plan_id
       * exists. This prevents the same plan appearing twice when
       * ClubKonnect has multiple provider entries with the same name.
       */

      const exactRules =
        networkRules.filter(
          (rule) =>
            rule.plan_id !== null &&
            rule.plan_id !== '',
        );

      const matchedPlans: Array<{
        DataPlan: string;
        DataPlanName: string;
        DataPlanType?: string;
        Price: string;
        selling_price: number;
        cashback_enabled: boolean;
        cashback_type?: string;
        cashback_value?: string;
        cashback_amount?: string;
      }> = [];

      const usedProviderIds =
        new Set<string>();

      for (const rule of exactRules) {
        const rulePlanId =
          String(rule.plan_id).trim();

        /*
         * Find EXACT provider ID.
         *
         * This is the only match allowed when Super Admin
         * has a plan_id.
         */
        const providerPlan =
          providerPlans.find((plan) => {
            const providerId =
              String(
                plan.DataPlan ?? '',
              ).trim();

            return (
              providerId === rulePlanId &&
              !usedProviderIds.has(
                providerId,
              )
            );
          });

        if (!providerPlan) {
          /*
           * Super Admin configured this plan, but ClubKonnect
           * did not return that exact PRODUCT_ID.
           *
           * Do NOT substitute another plan with the same name.
           * That would cause "plan not configured" at purchase.
           */
          logger.warn(
            {
              network: normalizedNetwork,
              planId: rulePlanId,
              planName: rule.plan_name,
            },
            'Configured pricing rule has no matching ClubKonnect PRODUCT_ID',
          );

          continue;
        }

        const sellingPrice =
          Number(
            rule.selling_price ?? 0,
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
          rule.cashback_enabled &&
          rule.cashback_type &&
          rule.cashback_value !== null &&
          rule.cashback_value !== undefined
        ) {
          const value =
            Number(
              rule.cashback_value,
            );

          if (
            Number.isFinite(value) &&
            value > 0
          ) {
            if (
              rule.cashback_type ===
              'percentage'
            ) {
              cashbackAmount =
                (
                  (sellingPrice * value) /
                  100
                ).toFixed(0);
            } else {
              cashbackAmount =
                value.toFixed(0);
            }
          }
        }

        const providerId =
          String(
            providerPlan.DataPlan,
          ).trim();

        usedProviderIds.add(
          providerId,
        );

        matchedPlans.push({
          /*
           * KEEP THE REAL CLUBKONNECT PRODUCT ID.
           */
          DataPlan: providerId,

          /*
           * Use the Super Admin configured name.
           */
          DataPlanName:
            rule.plan_name ||
            providerPlan.DataPlanName,

          DataPlanType:
            providerPlan.DataPlanType,

          /*
           * CUSTOMER PRICE = SELLING PRICE.
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
              rule.cashback_enabled,
            ),

          cashback_type:
            rule.cashback_enabled
              ? rule.cashback_type ??
                undefined
              : undefined,

          cashback_value:
            rule.cashback_enabled &&
            rule.cashback_value !== null &&
            rule.cashback_value !== undefined
              ? String(
                  rule.cashback_value,
                )
              : undefined,

          cashback_amount:
            cashbackAmount,
        });
      }

      /*
       * 5. FALLBACK ONLY FOR OLD RULES WITHOUT plan_id.
       *
       * If a Super Admin rule has NO plan_id at all, we may use
       * exact normalized plan-name matching.
       *
       * But if plan_id exists, we NEVER fall back to name.
       *
       * This is what prevents duplicate plans.
       */
      const rulesWithoutPlanId =
        networkRules.filter(
          (rule) =>
            !rule.plan_id ||
            String(rule.plan_id).trim() === '',
        );

      for (
        const rule of rulesWithoutPlanId
      ) {
        const ruleName =
          String(
            rule.plan_name ?? '',
          )
            .toLowerCase()
            .replace(
              /[\(\)\[\]\{\}]/g,
              ' ',
            )
            .replace(
              /[_\-]+/g,
              ' ',
            )
            .replace(
              /\s+/g,
              ' ',
            )
            .trim();

        if (!ruleName) {
          continue;
        }

        const providerPlan =
          providerPlans.find(
            (plan) => {
              const providerId =
                String(
                  plan.DataPlan ?? '',
                ).trim();

              if (
                usedProviderIds.has(
                  providerId,
                )
              ) {
                return false;
              }

              const providerName =
                String(
                  plan.DataPlanName ?? '',
                )
                  .toLowerCase()
                  .replace(
                    /[\(\)\[\]\{\}]/g,
                    ' ',
                  )
                  .replace(
                    /[_\-]+/g,
                    ' ',
                  )
                  .replace(
                    /\s+/g,
                    ' ',
                  )
                  .trim();

              return (
                providerName ===
                ruleName
              );
            },
          );

        if (!providerPlan) {
          continue;
        }

        const sellingPrice =
          Number(
            rule.selling_price ?? 0,
          );

        if (
          !Number.isFinite(
            sellingPrice,
          ) ||
          sellingPrice <= 0
        ) {
          continue;
        }

        const providerId =
          String(
            providerPlan.DataPlan,
          ).trim();

        usedProviderIds.add(
          providerId,
        );

        matchedPlans.push({
          DataPlan: providerId,

          DataPlanName:
            rule.plan_name ||
            providerPlan.DataPlanName,

          DataPlanType:
            providerPlan.DataPlanType,

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
              rule.cashback_enabled,
            ),

          cashback_type:
            rule.cashback_enabled
              ? rule.cashback_type ??
                undefined
              : undefined,

          cashback_value:
            rule.cashback_enabled &&
            rule.cashback_value !== null &&
            rule.cashback_value !== undefined
              ? String(
                  rule.cashback_value,
                )
              : undefined,

          cashback_amount:
            undefined,
        });
      }

      /*
       * 6. Final de-duplication by REAL ClubKonnect PRODUCT_ID.
       */
      const uniquePlans =
        Array.from(
          new Map(
            matchedPlans.map(
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

          configuredPlanCount:
            networkRules.length,

          customerPlanCount:
            uniquePlans.length,

          customerPlanIds:
            uniquePlans.map(
              (p) =>
                p.DataPlan,
            ),

          customerPlanNames:
            uniquePlans.map(
              (p) =>
                p.DataPlanName,
            ),
        },
        'Customer ClubKonnect data plans filtered by exact Super Admin pricing',
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
