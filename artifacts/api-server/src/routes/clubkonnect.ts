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
import { Router, type Request, type Response, type NextFunction } from 'express';
import * as ck from '../lib/clubkonnect.js';
import { normalizeCKStatus } from '../lib/clubkonnect.js';
import { logger } from '../lib/logger.js';

const router = Router();

/** Reject requests when credentials are not configured */
function requireCredentials(_req: Request, res: Response, next: NextFunction): void {
  if (!process.env['CLUBKONNECT_USER_ID'] || !process.env['CLUBKONNECT_API_KEY']) {
    res.status(503).json({
      error: 'ClubKonnect credentials not configured.',
      hint:  'Add CLUBKONNECT_USER_ID and CLUBKONNECT_API_KEY to the deployment environment.',
    });
    return;
  }
  next();
}

router.use(requireCredentials);

// ── GET /api/clubkonnect/balance ───────────────────────────────────────────────
// Used by admin dashboard to check ClubKonnect vendor wallet balance.
// Admin session required — prevents leaking business-sensitive balance info.
router.get('/balance', async (req: Request, res: Response): Promise<void> => {
  if (!req.session.isAdmin) {
    res.status(401).json({ error: 'Admin session required.' });
    return;
  }
  try {
    const data = await ck.getBalance();
    res.json({ success: true, balance: data.balance ?? data.APIBalance });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'ClubKonnect balance check failed');
    res.status(502).json({ error: message });
  }
});

// ── GET /api/clubkonnect/data-plans?network=mtn ────────────────────────────────
// Used by the frontend to display available data plans when the user selects a network.
// No auth required — plan listings are public information.
router.get('/data-plans', async (req: Request, res: Response): Promise<void> => {
  const network = req.query['network'];
  if (!network || typeof network !== 'string') {
    res.status(400).json({ error: 'Query param "network" is required (mtn | glo | airtel | 9mobile).' });
    return;
  }
  try {
    const plans = await ck.getDataPlans(network);
    res.json({ success: true, network, plans });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, network }, 'ClubKonnect data-plans fetch failed');
    res.status(502).json({ error: message });
  }
});

// ── GET /api/clubkonnect/status?requestId=xxx ──────────────────────────────────
// Check the status of a specific ClubKonnect order by RequestID.
// Admin session required — used for support and reconciliation.
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  if (!req.session.isAdmin) {
    res.status(401).json({ error: 'Admin session required.' });
    return;
  }
  const requestId = req.query['requestId'];
  if (!requestId || typeof requestId !== 'string') {
    res.status(400).json({ error: 'Query param "requestId" is required.' });
    return;
  }
  try {
    const result     = await ck.getTransactionStatus(requestId);
    const normalized = normalizeCKStatus(result.status);
    res.json({
      success:          true,
      requestId,
      normalized,
      vendorStatus:     result.status,
      providerRef:      result.OrderID ?? result.ident,
      rawResult:        result,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, requestId }, 'ClubKonnect status check failed');
    res.status(502).json({ error: message });
  }
});

export default router;
