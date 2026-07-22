/**
 * /api/purchase — Authenticated, server-orchestrated purchase endpoints.
 *
 * Each endpoint performs the full purchase lifecycle in the correct order:
 *   1. Auth check (requireAuth middleware applied to entire router)
 *   2. Input validation
 *   3. DB transaction with SELECT … FOR UPDATE:
 *        – lock wallet row to prevent concurrent over-spend
 *        – check sufficient balance (→ 402 if not)
 *        – debit wallet
 *        – insert transaction record with status 'pending'
 *   4. External vendor call (ClubKonnect) — outside DB transaction
 *   5. Compensation:
 *        – vendor success → update transaction → 'success'
 *        – vendor failure → credit wallet back, update transaction → 'failed'
 *   6. Return structured result (success, balance, transaction, vendor details)
 *
 * The frontend MUST show success UI only when this endpoint returns success:true.
 * The ClubKonnect routes remain available for read-only ops (balance, data-plans)
 * but their mutating endpoints are now protected by requireAuth as well.
 */
import { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '@workspace/db';
import { walletsTable, transactionsTable } from '@workspace/db/schema';
import * as ck from '../lib/clubkonnect.js';
import { requireAuth } from './user.js';
import { logger } from '../lib/logger.js';

const router = Router();
router.use(requireAuth);

// ── POST /api/purchase/airtime ────────────────────────────────────────────────
// Body: { network, phone, amount }
router.post('/airtime', async (req: Request, res: Response): Promise<void> => {
  const { network, phone, amount } = req.body as {
    network?: string; phone?: string; amount?: number;
  };

  if (!network || !phone || amount === undefined) {
    res.status(400).json({ error: 'network, phone, and amount are required.' });
    return;
  }
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    res.status(400).json({ error: 'amount must be a positive number.' });
    return;
  }

  const userId = req.session.userId!;
  const requestId = `GY-AIR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  // ── Step 1: Atomic wallet debit + pending transaction ────────────────────
  let txnId: string;
  let newBalance: string;

  try {
    const result = await db.transaction(async (tx) => {
      const [wallet] = await tx
        .select()
        .from(walletsTable)
        .where(eq(walletsTable.userId, userId))
        .for('update');

      if (!wallet) throw Object.assign(new Error('Wallet not found'), { code: 'NOT_FOUND' });

      const current = parseFloat(wallet.balance);
      if (current < numericAmount) {
        throw Object.assign(new Error('Insufficient funds'), { code: 'INSUFFICIENT_FUNDS' });
      }

      const nb = (current - numericAmount).toFixed(2);
      await tx.update(walletsTable)
        .set({ balance: nb, updatedAt: new Date() })
        .where(eq(walletsTable.userId, userId));

      const [txn] = await tx.insert(transactionsTable).values({
        userId,
        type:          'airtime',
        service:       'Airtime',
        provider:      network.toUpperCase(),
        amount:        numericAmount.toFixed(2),
        status:        'pending',
        description:   `${network.toUpperCase()} Airtime`,
        paymentMethod: 'Wallet',
        reference:     requestId,
      }).returning();

      return { txnId: txn!.id, newBalance: nb };
    });

    txnId     = result.txnId;
    newBalance = result.newBalance;
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'NOT_FOUND')          { res.status(404).json({ error: 'Wallet not found.' }); return; }
    if (e.code === 'INSUFFICIENT_FUNDS') { res.status(402).json({ error: 'insufficient_funds' }); return; }
    logger.error({ err }, 'purchase/airtime debit transaction failed');
    res.status(500).json({ error: 'Failed to process purchase.' });
    return;
  }

  // ── Step 2: Call vendor ───────────────────────────────────────────────────
  let vendorSuccess = false;
  let vendorResult: Record<string, unknown> = {};

  try {
    const result = await ck.purchaseAirtime({ network, phone, amount: numericAmount, requestId });
    vendorSuccess = result.status?.toLowerCase() === 'successful';
    vendorResult  = result as unknown as Record<string, unknown>;
  } catch (err: unknown) {
    logger.error({ err, requestId }, 'ClubKonnect airtime call failed');
    vendorSuccess = false;
  }

  // ── Step 3: Compensate or confirm ─────────────────────────────────────────
  if (vendorSuccess) {
    await db.update(transactionsTable)
      .set({ status: 'success' })
      .where(eq(transactionsTable.id, txnId));

    logger.info({ userId, requestId, amount: numericAmount }, 'Airtime purchase succeeded');

    res.json({
      success:   true,
      requestId,
      balance:   newBalance,
      txnId,
      network,
      phone,
      amount:    numericAmount,
      vendorStatus: vendorResult['status'],
    });
  } else {
    // Credit wallet back and mark transaction failed
    await db.transaction(async (tx) => {
      const [wallet] = await tx
        .select()
        .from(walletsTable)
        .where(eq(walletsTable.userId, userId))
        .for('update');

      if (wallet) {
        const restored = (parseFloat(wallet.balance) + numericAmount).toFixed(2);
        await tx.update(walletsTable)
          .set({ balance: restored, updatedAt: new Date() })
          .where(eq(walletsTable.userId, userId));
        newBalance = restored;
      }

      await tx.update(transactionsTable)
        .set({ status: 'failed' })
        .where(eq(transactionsTable.id, txnId));
    });

    logger.warn({ userId, requestId }, 'Airtime purchase failed — wallet reversed');

    res.status(422).json({
      success:   false,
      requestId,
      balance:   newBalance,
      error:     `Vendor returned: ${vendorResult['status'] ?? 'failed'}`,
    });
  }
});

// ── POST /api/purchase/data ───────────────────────────────────────────────────
// Body: { network, phone, planCode, planName, planPrice }
router.post('/data', async (req: Request, res: Response): Promise<void> => {
  const { network, phone, planCode, planName, planPrice } = req.body as {
    network?: string; phone?: string; planCode?: string; planName?: string; planPrice?: string;
  };

  if (!network || !phone || !planCode || !planPrice) {
    res.status(400).json({ error: 'network, phone, planCode, and planPrice are required.' });
    return;
  }
  const numericAmount = parseFloat(planPrice);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    res.status(400).json({ error: 'planPrice must be a positive number.' });
    return;
  }

  const userId = req.session.userId!;
  const requestId = `GY-DAT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  // ── Step 1: Atomic wallet debit + pending transaction ────────────────────
  let txnId: string;
  let newBalance: string;

  try {
    const result = await db.transaction(async (tx) => {
      const [wallet] = await tx
        .select()
        .from(walletsTable)
        .where(eq(walletsTable.userId, userId))
        .for('update');

      if (!wallet) throw Object.assign(new Error('Wallet not found'), { code: 'NOT_FOUND' });

      const current = parseFloat(wallet.balance);
      if (current < numericAmount) {
        throw Object.assign(new Error('Insufficient funds'), { code: 'INSUFFICIENT_FUNDS' });
      }

      const nb = (current - numericAmount).toFixed(2);
      await tx.update(walletsTable)
        .set({ balance: nb, updatedAt: new Date() })
        .where(eq(walletsTable.userId, userId));

      const [txn] = await tx.insert(transactionsTable).values({
        userId,
        type:          'data',
        service:       'Data',
        provider:      network.toUpperCase(),
        amount:        numericAmount.toFixed(2),
        status:        'pending',
        description:   `${network.toUpperCase()} ${planName ?? planCode}`,
        paymentMethod: 'Wallet',
        reference:     requestId,
      }).returning();

      return { txnId: txn!.id, newBalance: nb };
    });

    txnId      = result.txnId;
    newBalance = result.newBalance;
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'NOT_FOUND')          { res.status(404).json({ error: 'Wallet not found.' }); return; }
    if (e.code === 'INSUFFICIENT_FUNDS') { res.status(402).json({ error: 'insufficient_funds' }); return; }
    logger.error({ err }, 'purchase/data debit transaction failed');
    res.status(500).json({ error: 'Failed to process purchase.' });
    return;
  }

  // ── Step 2: Call vendor ───────────────────────────────────────────────────
  let vendorSuccess = false;
  let resolvedPlanName = planName ?? planCode;
  let vendorResult: Record<string, unknown> = {};

  try {
    const result = await ck.purchaseData({ network, phone, planCode, requestId });
    vendorSuccess      = result.status?.toLowerCase() === 'successful';
    resolvedPlanName   = result.DataPlanName ?? planName ?? planCode;
    vendorResult       = result as unknown as Record<string, unknown>;
  } catch (err: unknown) {
    logger.error({ err, requestId }, 'ClubKonnect data call failed');
    vendorSuccess = false;
  }

  // ── Step 3: Compensate or confirm ─────────────────────────────────────────
  if (vendorSuccess) {
    await db.update(transactionsTable)
      .set({ status: 'success', description: `${network.toUpperCase()} ${resolvedPlanName}` })
      .where(eq(transactionsTable.id, txnId));

    logger.info({ userId, requestId, amount: numericAmount, planCode }, 'Data purchase succeeded');

    res.json({
      success:   true,
      requestId,
      balance:   newBalance,
      txnId,
      network,
      phone,
      amount:    numericAmount,
      planName:  resolvedPlanName,
      vendorStatus: vendorResult['status'],
    });
  } else {
    // Credit wallet back and mark transaction failed
    await db.transaction(async (tx) => {
      const [wallet] = await tx
        .select()
        .from(walletsTable)
        .where(eq(walletsTable.userId, userId))
        .for('update');

      if (wallet) {
        const restored = (parseFloat(wallet.balance) + numericAmount).toFixed(2);
        await tx.update(walletsTable)
          .set({ balance: restored, updatedAt: new Date() })
          .where(eq(walletsTable.userId, userId));
        newBalance = restored;
      }

      await tx.update(transactionsTable)
        .set({ status: 'failed' })
        .where(eq(transactionsTable.id, txnId));
    });

    logger.warn({ userId, requestId }, 'Data purchase failed — wallet reversed');

    res.status(422).json({
      success:   false,
      requestId,
      balance:   newBalance,
      error:     `Vendor returned: ${vendorResult['status'] ?? 'failed'}`,
    });
  }
});

export default router;
