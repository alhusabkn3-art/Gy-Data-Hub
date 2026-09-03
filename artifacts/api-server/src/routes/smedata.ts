import { Router, type Request, type Response } from "express";
import {
  getManualDataPlans,
  isSmeDataNetwork,
} from "../lib/smedata.js";

const router = Router();

/**
 * GET /api/smedata/data-plans
 *
 * Data plans are maintained manually in lib/smedata.ts.
 *
 * Example:
 *   /api/smedata/data-plans?network=mtn
 *   /api/smedata/data-plans?network=glo
 *   /api/smedata/data-plans?network=airtel
 *
 * No phone number is required when loading the plan catalogue.
 */
router.get(
  "/data-plans",
  (req: Request, res: Response): void => {
    try {
      const network = String(
        req.query["network"] ?? "",
      )
        .trim()
        .toLowerCase();

      if (!network) {
        res.status(400).json({
          success: false,
          error: 'Query param "network" is required.',
        });
        return;
      }

      if (!isSmeDataNetwork(network)) {
        res.status(400).json({
          success: false,
          error:
            "Unsupported SMEDATA network. Supported networks: mtn, glo, airtel.",
        });
        return;
      }

      const plans = getManualDataPlans(network);

      res.json({
        success: true,
        network,
        plans,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load SMEDATA data plans.";

      res.status(500).json({
        success: false,
        error: message,
      });
    }
  },
);

/**
 * GET /api/smedata/status
 *
 * Returns provider configuration status.
 * The actual API token is NEVER returned.
 */
router.get(
  "/status",
  (_req: Request, res: Response): void => {
    const configured = Boolean(
      process.env["SMEDATA_API_TOKEN"]?.trim(),
    );

    res.json({
      success: true,
      provider: "SMEDATA",
      configured,
      supportedNetworks: [
        "mtn",
        "glo",
        "airtel",
      ],
    });
  },
);

export default router;
