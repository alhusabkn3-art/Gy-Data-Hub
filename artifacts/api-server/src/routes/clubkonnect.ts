// ── GET /api/clubkonnect/data-plans?network=mtn&phone=08012345678 ─────────────
router.get('/data-plans', async (req: Request, res: Response): Promise<void> => {
  const network = req.query['network'];
  const phone = req.query['phone'];

  if (!network || typeof network !== 'string') {
    res.status(400).json({
      error: 'Query param "network" is required (mtn | glo | airtel | 9mobile).',
    });
    return;
  }

  if (!phone || typeof phone !== 'string') {
    res.status(400).json({
      error: 'Query param "phone" is required.',
    });
    return;
  }

  const normalizedPhone = phone.trim();

  if (!/^(\+234|234|0)(70|71|80|81|90|91)\d{8}$/.test(normalizedPhone)) {
    res.status(400).json({
      error: 'A valid Nigerian phone number is required.',
    });
    return;
  }

  try {
    const plans = await ck.getDataPlans(network, normalizedPhone);

    let enriched = plans.map((p) => ({
      ...p,
      cashback_enabled: false,
      cashback_type: undefined as string | undefined,
      cashback_value: undefined as string | undefined,
      cashback_amount: undefined as string | undefined,
    }));

    try {
      const cbResult = await db.execute(sql`
        SELECT plan_id, cashback_enabled, cashback_type, cashback_value
        FROM pricing_rules
        WHERE service_type = 'data'
          AND (network = ${network.toUpperCase()} OR provider = ${network.toUpperCase()})
          AND cashback_enabled = true
      `);

      const globalResult = await db.execute(
        sql`SELECT enabled FROM cashback_settings LIMIT 1`,
      );

      const globalEnabled =
        globalResult.rows[0] &&
        (globalResult.rows[0] as { enabled: boolean }).enabled;

      if (globalEnabled && cbResult.rows.length > 0) {
        const cbMap = new Map<
          string,
          {
            cashback_type: string;
            cashback_value: string;
          }
        >();

        for (const row of cbResult.rows) {
          const r = row as {
            plan_id: string;
            cashback_type: string;
            cashback_value: string;
          };

          cbMap.set(r.plan_id, {
            cashback_type: r.cashback_type,
            cashback_value: r.cashback_value,
          });
        }

        enriched = plans.map((p) => {
          const cb = cbMap.get(p.DataPlan);

          if (cb) {
            const price = parseFloat(String(p.Price));
            const val = parseFloat(cb.cashback_value);

            const amt =
              cb.cashback_type === 'percentage'
                ? (price * val / 100).toFixed(0)
                : val.toFixed(0);

            return {
              ...p,
              cashback_enabled: true,
              cashback_type: cb.cashback_type,
              cashback_value: cb.cashback_value,
              cashback_amount: amt,
            };
          }

          return {
            ...p,
            cashback_enabled: false,
            cashback_type: undefined,
            cashback_value: undefined,
            cashback_amount: undefined,
          };
        });
      }
    } catch (enrichErr) {
      logger.warn(
        { enrichErr },
        'Cashback enrichment failed — returning plans without cashback info',
      );
    }

    res.setHeader('Cache-Control', 'no-store');

    res.json({
      success: true,
      network,
      phone: normalizedPhone.slice(0, 3) + '****' + normalizedPhone.slice(-3),
      plans: enriched,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    logger.error(
      {
        err,
        network,
        hasPhone: true,
      },
      'ClubKonnect data-plans fetch failed',
    );

    res.status(502).json({ error: message });
  }
});
