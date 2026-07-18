import { Router, type Request, type Response, type NextFunction } from 'express';
import * as ck from '../lib/clubkonnect.js';
import { logger } from '../lib/logger.js';

const router = Router();

/** Middleware — reject requests when credentials are missing */
function requireCredentials(_req: Request, res: Response, next: NextFunction): void {
  if (!process.env['CLUBKONNECT_USER_ID'] || !process.env['CLUBKONNECT_API_KEY']) {
    res.status(503).json({
      error: 'Clubkonnect credentials not configured.',
      hint: 'Add CLUBKONNECT_USER_ID and CLUBKONNECT_API_KEY as Replit Secrets.',
    });
    return;
  }
  next();
}

router.use(requireCredentials);

// ── GET /api/clubkonnect/balance ────────────────────────────────────────────
router.get('/balance', async (_req: Request, res: Response): Promise<void> => {
  try {
    const data = await ck.getBalance();
    res.json({ success: true, balance: data.balance ?? data.APIBalance });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, 'Clubkonnect balance check failed');
    res.status(502).json({ error: message });
  }
});

// ── GET /api/clubkonnect/data-plans?network=mtn ────────────────────────────
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
    logger.error({ err, network }, 'Clubkonnect data-plans fetch failed');
    res.status(502).json({ error: message });
  }
});

// ── POST /api/clubkonnect/airtime ──────────────────────────────────────────
// Body: { network, phone, amount }
router.post('/airtime', async (req: Request, res: Response): Promise<void> => {
  const { network, phone, amount } = req.body as { network?: string; phone?: string; amount?: number };

  if (!network || !phone || amount === undefined) {
    res.status(400).json({ error: 'Body must include: network, phone, amount.' });
    return;
  }

  const requestId = `GY-AIR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  try {
    const result = await ck.purchaseAirtime({ network, phone, amount: Number(amount), requestId });
    const success = result.status?.toLowerCase() === 'successful';

    logger.info({ requestId, network, phone, amount, status: result.status }, 'Airtime purchase completed');

    res.status(success ? 200 : 422).json({
      success,
      requestId,
      status: result.status,
      ident: result.ident,
      amount: result.Amount,
      network: result.MobileNetwork,
      phone: result.MobileNumber,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, requestId }, 'Clubkonnect airtime purchase failed');
    res.status(502).json({ error: message, requestId });
  }
});

// ── POST /api/clubkonnect/data ─────────────────────────────────────────────
// Body: { network, phone, planCode, planName, planPrice }
router.post('/data', async (req: Request, res: Response): Promise<void> => {
  const { network, phone, planCode, planName, planPrice } = req.body as {
    network?: string; phone?: string; planCode?: string; planName?: string; planPrice?: string;
  };

  if (!network || !phone || !planCode) {
    res.status(400).json({ error: 'Body must include: network, phone, planCode.' });
    return;
  }

  const requestId = `GY-DAT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  try {
    const result = await ck.purchaseData({ network, phone, planCode, requestId });
    const success = result.status?.toLowerCase() === 'successful';

    logger.info({ requestId, network, phone, planCode, status: result.status }, 'Data purchase completed');

    res.status(success ? 200 : 422).json({
      success,
      requestId,
      status: result.status,
      ident: result.ident,
      planName: result.DataPlanName ?? planName,
      price: result.Price ?? planPrice,
      phone: result.MobileNumber ?? phone,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, requestId }, 'Clubkonnect data purchase failed');
    res.status(502).json({ error: message, requestId });
  }
});

// ── GET /api/clubkonnect/status?requestId=xxx ──────────────────────────────
router.get('/status', async (req: Request, res: Response): Promise<void> => {
  const requestId = req.query['requestId'];
  if (!requestId || typeof requestId !== 'string') {
    res.status(400).json({ error: 'Query param "requestId" is required.' });
    return;
  }
  try {
    const result = await ck.getTransactionStatus(requestId);
    res.json({ success: true, requestId, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, requestId }, 'Clubkonnect status check failed');
    res.status(502).json({ error: message });
  }
});

export default router;
