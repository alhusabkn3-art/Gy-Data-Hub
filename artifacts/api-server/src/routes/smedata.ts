/**
 * /api/smedata
 *
 * SMEDATA data-plan routes.
 *
 * Data plans are maintained manually in ../lib/smedata.ts.
 * No SMEDATA secret is exposed to the frontend.
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

const router = Router();

/* ============================================================================
 * GET /api/smedata/data-plans
 *
 * Returns the manually configured SMEDATA plans for a network.
 *
 * Example:
 *   GET /api/smedata/data-plans?network=mtn
 *   GET /api/smedata/data-plans?network=glo
 *   GET /api/smedata/data-plans?network=airtel
 *
 * NOTE:
 * Phone number is NOT required here.
 * SMEDATA only needs the phone when the actual purchase is made.
 * ========================================================================== */

router.get(
  '/data-plans',
  (
    req: Request,
    res: Response,
  ): void => {
    try {
      const network =
        String(
          req.query['network'] ?? '',
        )
          .trim()
          .toLowerCase();

      if (!network) {
        res.status(400).json({
          success: false,
          error:
            'Query param "network" is required.',
        });

        return;
      }

      if (
        !isSmeDataNetwork(network)
      ) {
        res.status(400).json({
          success: false,
          error:
            'Unsupported SMEDATA data network. Supported networks: mtn, glo, airtel.',
        });

        return;
      }

      const plans =
        getManualDataPlans(
          network,
        );

      res.json({
        success: true,
        network,
        plans,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to load SMEDATA data plans.';

      res.status(500).json({
        success: false,
        error: message,
      });
    }
  },
);

/* ============================================================================
 * GET /api/smedata/status
 *
 * Simple configuration check.
 *
 * This does NOT return the API token.
 * ========================================================================== */

router.get(
  '/status',
  (
    _req: Request,
    res: Response,
  ): void => {
    const configured =
      Boolean(
        process.env[
          'SMEDATA_API_TOKEN'
        ]?.trim(),
      );

    res.json({
      success: true,
      provider: 'SMEDATA',
      configured,
      supportedNetworks: [
        'mtn',
        'glo',
        'airtel',
      ],
    });
  },
);

export default router;
