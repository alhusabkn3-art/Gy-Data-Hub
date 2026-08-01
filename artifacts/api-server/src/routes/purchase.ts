/**
 * /api/purchase — Authenticated, server-orchestrated purchase endpoints.
 *
 * Purchase lifecycle (both airtime and data):
 *   1. requireAuth — session must be valid.
 *   2. Input validation + price validation (fail-closed against pricing_rules).
 *   3. Idempotency check — duplicate Idempotency-Key returns existing result.
 *   4. DB transaction with SELECT … FOR UPDATE:
 *        – Lock wallet row (prevents concurrent over-spend)
 *        – Check sufficient balance
 *        – Debit wallet atomically
 *        – Insert transaction record (status = 'pending')
 *        – Write wallet_ledger 'debit' entry
 *   5. Call ClubKonnect vendor API (outside DB transaction).
 *   6. Outcome:
 *        – 'success'  → mark transaction success, store provider_reference
 *        – 'pending'  → leave transaction pending (DO NOT refund), store
 *                       provider OrderID for later polling
 *        – 'failed'   → DB transaction: credit wallet back + write 'reversal'
 *                       ledger entry + mark transaction failed
 *
 * Security:
 *   - Credentials never sent to frontend.
 *   - Price validated server-side; client-submitted price is rejected on mismatch.
 *   - Wallet debit and ledger entry are always atomic.
 *   - Duplicate requests detected by reference UNIQUE constraint +
 *     handleIdempotency() which re-uses the Idempotency-Key header.
 */
import { Router, type Request, type Response } from 'express';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { db } from '@workspace/db';
import { walletsTable, transactionsTable } from '@workspace/db/schema';
import * as ck from '../lib/clubkonnect.js';
import { normalizeCKStatus } from '../lib/clubkonnect.js';
import { requireAuth } from './user.js';
import { logger } from '../lib/logger.js';
import { createNotification } from '../lib/notifications.js';
import { getIo } from '../lib/socket.js';

// ── Cashback helper ───────────────────────────────────────────────────────────
//
// Called AFTER a successful data purchase to credit any eligible cashback.
//
// Cashback is credited to the user's CASHBACK WALLET (cashback_wallets table),
// NOT the main wallet. Users can transfer it to the main wallet separately.
//
// Atomicity guarantee: the cashback_transactions audit row INSERT, cashback
// wallet balance update, and transactions record are all written inside a
// SINGLE db.transaction(). wallet_txn_id is set to non-null only after every
// write has committed, which serves as the "fully applied" flag.
//
// Idempotency / partial-state recovery:
//   • New:          INSERT succeeds → proceed to credit (all in same tx).
//   • Already done: INSERT conflicts AND existing row has wallet_txn_id set
//                   → return applied:false (idempotent no-op).
//   • Partial state: INSERT conflicts AND existing row has wallet_txn_id IS NULL
//                   → previous tx crashed mid-flight; re-enter the credit block
//                   using the existing audit-row id.
//
async function applyCashbackIfEligible(opts: {
  userId:          string;
  sourceTxnId:     string;
  requestId:       string;
  planCode:        string;
  network:         string;
  planName:        string;
  purchaseAmount:  number;
}): Promise<{ applied: boolean; amount: number; cashbackBalance: string }> {

  // ── 1. Read-only pre-checks (outside the write transaction for efficiency) ──

  const globalResult = await db.execute<{
    enabled: boolean;
    eligible_services: string[] | string;
    transfer_mode: string;
    min_transfer_amount: string;
  }>(sql`SELECT enabled, eligible_services, transfer_mode, min_transfer_amount FROM cashback_settings LIMIT 1`);

  const globalRow = globalResult.rows[0];
  if (!globalRow || !globalRow.enabled) return { applied: false, amount: 0, cashbackBalance: '' };

  // Check eligible services — must include 'data'
  let eligibleServices: string[] = ['data'];
  try {
    const raw = globalRow.eligible_services;
    eligibleServices = Array.isArray(raw) ? raw : JSON.parse(typeof raw === 'string' ? raw : '["data"]');
  } catch { /* default to ['data'] */ }
  if (!eligibleServices.includes('data')) return { applied: false, amount: 0, cashbackBalance: '' };

  const planResult = await db.execute<{
    cashback_enabled: boolean;
    cashback_type:    string;
    cashback_value:   string;
  }>(sql`
    SELECT cashback_enabled, cashback_type, cashback_value
    FROM pricing_rules
    WHERE plan_id = ${opts.planCode}
      AND (network = ${opts.network.toUpperCase()} OR provider = ${opts.network.toUpperCase()})
      AND service_type = 'data'
    LIMIT 1
  `);

  const rule = planResult.rows[0];
  if (!rule || !rule.cashback_enabled) return { applied: false, amount: 0, cashbackBalance: '' };

  const cashbackType  = rule.cashback_type;
  const cashbackValue = parseFloat(rule.cashback_value);

  let cashbackAmount: number;
  if (cashbackType === 'percentage') {
    cashbackAmount = parseFloat((opts.purchaseAmount * cashbackValue / 100).toFixed(2));
  } else {
    cashbackAmount = parseFloat(cashbackValue.toFixed(2));
  }
  if (cashbackAmount <= 0) return { applied: false, amount: 0, cashbackBalance: '' };

  const cashbackRef = `${opts.requestId}-cashback`;

  // ── 2. Single atomic transaction — credits the CASHBACK WALLET ────────────
  //    Order inside the tx:
  //      a) INSERT cashback_transactions (or detect existing partial/complete row)
  //      b) Lock cashback_wallet row (SELECT … FOR UPDATE)
  //      c) Credit cashback wallet balance
  //      d) INSERT transactions record (type = wallet_fund, service = Cashback, payment_method = 'Cashback Wallet')
  //      e) UPDATE cashback_transactions.wallet_txn_id ← "fully applied" flag
  //
  //    Only when step (e) commits is cashback considered done.

  const txResult = await db.transaction(async (tx) => {

    // (a) Try to claim this cashback slot
    const insertResult = await tx.execute<{ id: string; wallet_txn_id: string | null }>(sql`
      INSERT INTO cashback_transactions
        (user_id, source_txn_id, amount, cashback_type, cashback_value,
         network, plan_id, plan_name, reference)
      VALUES
        (${opts.userId}::uuid, ${opts.sourceTxnId}::uuid,
         ${cashbackAmount.toFixed(2)}, ${cashbackType}, ${cashbackValue.toFixed(2)},
         ${opts.network.toUpperCase()}, ${opts.planCode}, ${opts.planName}, ${cashbackRef})
      ON CONFLICT (source_txn_id) DO NOTHING
      RETURNING id, wallet_txn_id
    `);

    let cashbackRowId: string;

    if (insertResult.rows[0]) {
      cashbackRowId = insertResult.rows[0].id;
    } else {
      const existing = await tx.execute<{ id: string; wallet_txn_id: string | null }>(sql`
        SELECT id, wallet_txn_id
        FROM cashback_transactions
        WHERE source_txn_id = ${opts.sourceTxnId}::uuid
        LIMIT 1
      `);
      const row = existing.rows[0];
      if (!row) return null;
      if (row.wallet_txn_id !== null) return null; // Already fully applied
      cashbackRowId = row.id;
    }

    // (b) Lock cashback wallet row — ensure it exists first
    await tx.execute(sql`
      INSERT INTO cashback_wallets (user_id, balance)
      VALUES (${opts.userId}::uuid, 0)
      ON CONFLICT (user_id) DO NOTHING
    `);
    const cbWalletResult = await tx.execute<{ id: string; balance: string }>(sql`
      SELECT id, balance FROM cashback_wallets
      WHERE user_id = ${opts.userId}::uuid
      FOR UPDATE
    `);
    const cbWallet = cbWalletResult.rows[0];
    if (!cbWallet) throw new Error('Cashback wallet not found');

    const cbBalBefore = cbWallet.balance;
    const cbBalAfter  = (parseFloat(cbBalBefore) + cashbackAmount).toFixed(2);

    // (c) Credit cashback wallet balance
    await tx.execute(sql`
      UPDATE cashback_wallets
      SET balance = ${cbBalAfter}, updated_at = NOW()
      WHERE user_id = ${opts.userId}::uuid
    `);

    // (d) Transaction record tagged as Cashback Wallet credit
    const cbTxnResult = await tx.execute<{ id: string }>(sql`
      INSERT INTO transactions
        (user_id, type, service, provider, amount, cost_price,
         status, description, payment_method, reference, updated_at)
      VALUES
        (${opts.userId}::uuid, 'wallet_fund'::txn_type, 'Cashback',
         ${opts.network.toUpperCase()}, ${cashbackAmount.toFixed(2)}, '0',
         'success'::txn_status,
         ${'Data Cashback – ' + opts.planName},
         'Cashback Wallet', ${cashbackRef + '-txn'}, NOW())
      ON CONFLICT (reference) DO UPDATE
        SET updated_at = NOW()
      RETURNING id
    `);
    const walletTxnId = cbTxnResult.rows[0].id;

    // (e) Mark cashback row as fully applied
    await tx.execute(sql`
      UPDATE cashback_transactions
      SET wallet_txn_id = ${walletTxnId}::uuid
      WHERE id = ${cashbackRowId}::uuid
    `);

    return { walletTxnId, cashbackBalance: cbBalAfter };
  });

  if (!txResult) return { applied: false, amount: 0, cashbackBalance: '' };

  const { walletTxnId, cashbackBalance } = txResult;

  // ── 3. Post-commit side-effects ───────────────────────────────────────────
  try { getIo().to(`user:${opts.userId}`).emit('cashback:updated', { cashbackBalance }); } catch { /* non-fatal */ }

  await createNotification(opts.userId, {
    type:  'transaction',
    title: '🎁 Cashback Credited!',
    body:  `₦${cashbackAmount.toLocaleString('en-NG')} cashback from your ${opts.network.toUpperCase()} data purchase has been added to your Cashback Wallet.`,
    refId: walletTxnId,
  });

  // Auto-transfer if mode is 'auto' and balance meets minimum
  try {
    const minResult = await db.execute<{ min_transfer_amount: string; transfer_mode: string }>(
      sql`SELECT min_transfer_amount, transfer_mode FROM cashback_settings LIMIT 1`
    );
    const settings = minResult.rows[0];
    if (settings && settings.transfer_mode === 'auto') {
      const minAmt = parseFloat(settings.min_transfer_amount || '100');
      const curBal = parseFloat(cashbackBalance);
      if (curBal >= minAmt) {
        await transferCashbackToMain(opts.userId, curBal, 'auto');
      }
    }
  } catch (autoErr) {
    logger.warn({ autoErr, userId: opts.userId }, 'Auto cashback transfer check failed — non-fatal');
  }

  logger.info({ userId: opts.userId, cashbackAmount, planCode: opts.planCode, cashbackRef }, 'Cashback credited to cashback wallet');
  return { applied: true, amount: cashbackAmount, cashbackBalance };
}

// ── transferCashbackToMain — transfers cashback wallet → main wallet ──────────
export async function transferCashbackToMain(
  userId: string,
  amount: number,
  mode: 'manual' | 'auto' = 'manual',
): Promise<{ ok: boolean; newMainBalance: string; newCashbackBalance: string; error?: string }> {
  const result = await db.transaction(async (tx) => {
    // Lock cashback wallet
    const cbRes = await tx.execute<{ id: string; balance: string }>(sql`
      SELECT id, balance FROM cashback_wallets WHERE user_id = ${userId}::uuid FOR UPDATE
    `);
    const cbWallet = cbRes.rows[0];
    if (!cbWallet) throw Object.assign(new Error('Cashback wallet not found'), { code: 'NOT_FOUND' });

    const cbBal = parseFloat(cbWallet.balance);
    if (cbBal < amount) throw Object.assign(new Error('Insufficient cashback balance'), { code: 'INSUFFICIENT' });

    const newCbBal = (cbBal - amount).toFixed(2);

    // Lock main wallet
    const mwRes = await tx.execute<{ id: string; balance: string }>(sql`
      SELECT id, balance FROM wallets WHERE user_id = ${userId}::uuid FOR UPDATE
    `);
    const mWallet = mwRes.rows[0];
    if (!mWallet) throw Object.assign(new Error('Main wallet not found'), { code: 'NOT_FOUND' });

    const mBal    = parseFloat(mWallet.balance);
    const newMBal = (mBal + amount).toFixed(2);

    // Debit cashback wallet
    await tx.execute(sql`
      UPDATE cashback_wallets SET balance = ${newCbBal}, updated_at = NOW()
      WHERE user_id = ${userId}::uuid
    `);

    // Credit main wallet
    await tx.execute(sql`
      UPDATE wallets SET balance = ${newMBal}, updated_at = NOW()
      WHERE user_id = ${userId}::uuid
    `);

    // Transaction record
    const ref = `GY-CBT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const txnRes = await tx.execute<{ id: string }>(sql`
      INSERT INTO transactions
        (user_id, type, service, provider, amount, cost_price,
         status, description, payment_method, reference, updated_at)
      VALUES
        (${userId}::uuid, 'wallet_fund'::txn_type, 'Cashback Transfer',
         'GY DATA', ${amount.toFixed(2)}, '0',
         'success'::txn_status,
         'Cashback wallet transferred to main wallet',
         'Cashback Wallet', ${ref}, NOW())
      RETURNING id
    `);
    const txnId = txnRes.rows[0].id;

    // Wallet ledger (main wallet credit)
    await tx.execute(sql`
      INSERT INTO wallet_ledger
        (user_id, type, amount, balance_before, balance_after,
         reference, related_transaction_id, reason)
      VALUES
        (${userId}::uuid, 'cashback', ${amount.toFixed(2)},
         ${mBal.toFixed(2)}, ${newMBal},
         ${ref + '-ledger'}, ${txnId}::uuid,
         'Cashback wallet transfer to main wallet')
      ON CONFLICT (reference) DO NOTHING
    `);

    // Transfer log
    await tx.execute(sql`
      INSERT INTO cashback_transfers
        (user_id, cashback_wallet_id, amount, balance_before, balance_after, main_txn_id, mode)
      VALUES
        (${userId}::uuid, ${cbWallet.id}::uuid,
         ${amount.toFixed(2)}, ${cbBal.toFixed(2)}, ${newCbBal},
         ${txnId}::uuid, ${mode})
    `);

    return { txnId, newMainBalance: newMBal, newCashbackBalance: newCbBal };
  });

  return { ok: true, newMainBalance: result.newMainBalance, newCashbackBalance: result.newCashbackBalance };
}

const router = Router();

// ── Idempotency helper ────────────────────────────────────────────────────────
async function handleIdempotency(
  res: Response,
  userId: string,
  idempotencyKey: string,
  extra?: Record<string, unknown>,
): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.userId, userId),
        eq(transactionsTable.reference, idempotencyKey),
      ),
    );

  if (!existing) return false;

  logger.info({ userId, idempotencyKey, status: existing.status }, 'Idempotent request — existing transaction found');

  if (existing.status === 'success') {
    const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));
    res.json({
      success:    true,
      idempotent: true,
      requestId:  idempotencyKey,
      txnId:      existing.id,
      balance:    wallet?.balance ?? '0',
      ...extra,
    });
    return true;
  }

  if (existing.status === 'pending') {
    res.status(200).json({
      success:   false,
      pending:   true,
      requestId: idempotencyKey,
      txnId:     existing.id,
      error:     'Transaction is still being processed. Please check your transaction history.',
    });
    return true;
  }

  // failed — signal client to issue a fresh request with a new key
  res.status(422).json({
    success:   false,
    error:     'previous_attempt_failed',
    requestId: idempotencyKey,
  });
  return true;
}

// ── GET /api/purchase/pricing — Public: active pricing rules for frontend ─────
router.get('/pricing', async (_req: Request, res: Response): Promise<void> => {
  try {
    const result = await db.execute(sql`
      SELECT
        service_type, provider, network, plan_id, plan_name,
        selling_price, enabled
      FROM pricing_rules
      WHERE enabled = true
      ORDER BY service_type, provider, network, plan_name
    `);
    res.json({ pricing: result.rows });
  } catch (err) {
    logger.error({ err }, 'GET /purchase/pricing failed');
    res.status(500).json({ error: 'Failed to load pricing.' });
  }
});

router.use(requireAuth);

// ── Price validation helper ────────────────────────────────────────────────────
async function validateDataPrice(
  planCode: string,
  network: string,
  submittedPrice: number,
): Promise<
  | { valid: true;  sellingPrice: number; costPrice: number }
  | { valid: false; error: string; expectedPrice?: number }
> {
  try {
    // node-postgres adapter returns pg.QueryResult — access rows via .rows[0]
    const priceResult = await db.execute<{
      selling_price: string;
      cost_price:    string;
      enabled:       boolean;
    }>(sql`
      SELECT selling_price, cost_price, enabled
      FROM pricing_rules
      WHERE plan_id = ${planCode}
        AND (network = ${network.toUpperCase()} OR provider = ${network.toUpperCase()})
        AND service_type = 'data'
      LIMIT 1
    `);
    const rule = priceResult.rows[0];

    if (!rule) {
      // No pricing rule configured — block (fail-closed when no rule exists)
      logger.warn({ planCode, network }, 'No pricing rule found for plan — blocking purchase');
      return { valid: false, error: 'This data plan is not currently configured. Please contact support.' };
    }

    if (!rule.enabled) {
      return { valid: false, error: 'This data plan is currently unavailable.' };
    }

    const sellingPrice = Number(rule.selling_price);
    const costPrice    = Number(rule.cost_price);

    // Allow ±₦1 tolerance to account for floating-point rounding on the client
    if (Math.abs(sellingPrice - submittedPrice) > 1) {
      return { valid: false, error: 'price_mismatch', expectedPrice: sellingPrice };
    }

    return { valid: true, sellingPrice, costPrice };
  } catch (err) {
    // FAIL CLOSED — DB error = block purchase (never allow at unverified price)
    logger.error({ err, planCode }, 'Price validation DB lookup failed — blocking purchase (fail-closed)');
    return { valid: false, error: 'Price verification is temporarily unavailable. Please try again.' };
  }
}

// ── Wallet debit + ledger helper ──────────────────────────────────────────────
//
// Runs inside a DB transaction (tx). Locks the wallet row, checks balance,
// debits, inserts the transaction record, and writes a wallet_ledger 'debit' entry.
// All four operations are atomic.
//
async function debitWalletAndRecord(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  opts: {
    userId:      string;
    amount:      number;
    requestId:   string;
    type:        'airtime' | 'data';
    service:     string;
    provider:    string;
    description: string;
    costPrice:   number;
  },
): Promise<{ txnId: string; newBalance: string; balanceBefore: string }> {
  const [wallet] = await tx
    .select()
    .from(walletsTable)
    .where(eq(walletsTable.userId, opts.userId))
    .for('update');

  if (!wallet) throw Object.assign(new Error('Wallet not found'), { code: 'NOT_FOUND' });

  const balanceBefore = wallet.balance;
  const current       = parseFloat(balanceBefore);

  if (current < opts.amount) {
    throw Object.assign(new Error('Insufficient funds'), { code: 'INSUFFICIENT_FUNDS' });
  }

  const newBalance = (current - opts.amount).toFixed(2);

  await tx.update(walletsTable)
    .set({ balance: newBalance, updatedAt: new Date() })
    .where(eq(walletsTable.userId, opts.userId));

  // Raw SQL insert so we can include cost_price and all required columns.
  // node-postgres adapter returns pg.QueryResult — use .rows[0] to get the row.
  const txnInsertResult = await tx.execute<{ id: string }>(sql`
    INSERT INTO transactions
      (user_id, type, service, provider, amount, cost_price,
       status, description, payment_method, reference, updated_at)
    VALUES
      (${opts.userId}::uuid, ${opts.type}::txn_type, ${opts.service}, ${opts.provider},
       ${opts.amount.toFixed(2)}, ${opts.costPrice.toFixed(2)},
       'pending'::txn_status, ${opts.description}, 'Wallet', ${opts.requestId}, NOW())
    RETURNING id
  `);

  const txnId = txnInsertResult.rows[0].id;

  // Wallet ledger — debit entry (atomic with wallet debit)
  await tx.execute(sql`
    INSERT INTO wallet_ledger
      (user_id, type, amount, balance_before, balance_after,
       reference, related_transaction_id, reason)
    VALUES
      (${opts.userId}::uuid, 'debit', ${opts.amount.toFixed(2)},
       ${balanceBefore}, ${newBalance},
       ${opts.requestId + '-debit'}, ${txnId}::uuid,
       ${`${opts.service} purchase via wallet`})
    ON CONFLICT (reference) DO NOTHING
  `);

  return { txnId, newBalance, balanceBefore };
}

// ── Wallet refund + ledger helper ─────────────────────────────────────────────
//
// Runs inside its own DB transaction. Credits the wallet back after a failed
// vendor call, writes a 'reversal' ledger entry, marks the transaction failed.
//
async function refundWalletAndMarkFailed(opts: {
  userId:    string;
  txnId:     string;
  amount:    number;
  requestId: string;
}): Promise<string> {
  const { newBalance } = await db.transaction(async (tx) => {
    // Drizzle ORM .select() correctly returns an array with node-postgres adapter
    const [wallet] = await tx
      .select()
      .from(walletsTable)
      .where(eq(walletsTable.userId, opts.userId))
      .for('update');

    if (!wallet) throw new Error('Wallet not found during refund');

    const balanceBefore = wallet.balance;
    const restored      = (parseFloat(balanceBefore) + opts.amount).toFixed(2);

    await tx.update(walletsTable)
      .set({ balance: restored, updatedAt: new Date() })
      .where(eq(walletsTable.userId, opts.userId));

    await tx.execute(sql`
      UPDATE transactions
      SET status = 'failed', updated_at = NOW()
      WHERE id = ${opts.txnId}::uuid
    `);

    // Wallet ledger — reversal entry
    await tx.execute(sql`
      INSERT INTO wallet_ledger
        (user_id, type, amount, balance_before, balance_after,
         reference, related_transaction_id, reason)
      VALUES
        (${opts.userId}::uuid, 'reversal', ${opts.amount.toFixed(2)},
         ${balanceBefore}, ${restored},
         ${opts.requestId + '-reversal'}, ${opts.txnId}::uuid,
         'Vendor delivery failed — automatic wallet refund')
      ON CONFLICT (reference) DO NOTHING
    `);

    return { newBalance: restored };
  });

  return newBalance;
}

// ── POST /api/purchase/airtime ────────────────────────────────────────────────
router.post('/airtime', async (req: Request, res: Response): Promise<void> => {
  const { network, phone, amount } = req.body as {
    network?: string; phone?: string; amount?: number;
  };

  if (!network || !phone || amount === undefined) {
    res.status(400).json({ error: 'network, phone, and amount are required.' });
    return;
  }

  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount) || numericAmount < 50) {
    res.status(400).json({ error: 'Minimum airtime amount is ₦50.' });
    return;
  }
  if (numericAmount > 50_000) {
    res.status(400).json({ error: 'Maximum single airtime purchase is ₦50,000.' });
    return;
  }

  // Phone number: 10–11 digit Nigerian number
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 10 || cleanPhone.length > 11) {
    res.status(400).json({ error: 'Please enter a valid Nigerian phone number.' });
    return;
  }

  // Validate network
  try { ck.getNetworkCode(network); } catch {
    res.status(400).json({ error: 'Invalid network. Use: mtn, glo, airtel, or 9mobile.' });
    return;
  }

  const userId         = req.session.userId!;
  const idempotencyKey = (req.headers['idempotency-key'] ?? '') as string;

  if (idempotencyKey) {
    try {
      const handled = await handleIdempotency(res, userId, idempotencyKey, { network, phone: cleanPhone, amount: numericAmount });
      if (handled) return;
    } catch (err) {
      logger.error({ err, idempotencyKey }, 'Idempotency check failed — proceeding');
    }
  }

  const requestId = idempotencyKey || `GY-AIR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  // ── Step 1: Atomic wallet debit + pending transaction + ledger ────────────
  let txnId: string;
  let newBalance: string;

  try {
    const result = await db.transaction(async (tx) =>
      debitWalletAndRecord(tx, {
        userId,
        amount:      numericAmount,
        requestId,
        type:        'airtime',
        service:     'Airtime',
        provider:    network.toUpperCase(),
        description: `${network.toUpperCase()} Airtime → ${cleanPhone}`,
        costPrice:   numericAmount, // No airtime markup — cost = selling price
      }),
    );
    txnId      = result.txnId;
    newBalance = result.newBalance;
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'NOT_FOUND')         { res.status(404).json({ error: 'Wallet not found.' }); return; }
    if (e.code === 'INSUFFICIENT_FUNDS'){ res.status(402).json({ error: 'insufficient_funds' }); return; }
    logger.error({ err }, 'purchase/airtime debit failed');
    res.status(500).json({ error: 'Failed to process purchase.' });
    return;
  }

  // ── Step 2: Call ClubKonnect ──────────────────────────────────────────────
  let vendorResult: ck.CKPurchaseResult = { status: 'unsuccessful' };

  try {
    vendorResult = await ck.purchaseAirtime({ network, phone: cleanPhone, amount: numericAmount, requestId });
  } catch (err: unknown) {
    logger.error({ err, requestId }, 'ClubKonnect airtime call threw exception');
    // Leave vendorResult as 'unsuccessful' — triggers refund below
  }

  const normalizedStatus = normalizeCKStatus(vendorResult.status);
  const providerRef      = vendorResult.OrderID ?? vendorResult.ident ?? null;

  logger.info({ userId, requestId, normalizedStatus, vendorStatus: vendorResult.status, providerRef }, 'Airtime vendor response');

  // ── Step 3: Handle vendor outcome ─────────────────────────────────────────
  if (normalizedStatus === 'success') {
    // Mark success + store provider reference
    await db.execute(sql`
      UPDATE transactions
      SET status = 'success',
          updated_at = NOW(),
          provider_reference = ${providerRef},
          metadata = jsonb_build_object(
            'vendorStatus', ${vendorResult.status},
            'providerRef',  ${providerRef},
            'completedAt',  NOW()::text
          )
      WHERE id = ${txnId}::uuid
    `);

    // Real-time balance update via Socket.io
    try { getIo().to(`user:${userId}`).emit('wallet:updated', { balance: newBalance }); } catch { /* non-fatal */ }

    await createNotification(userId, {
      type:  'transaction',
      title: 'Airtime Sent ✅',
      body:  `₦${numericAmount.toLocaleString('en-NG')} of ${network.toUpperCase()} airtime was delivered to ${cleanPhone}.`,
      refId: txnId,
    });

    res.json({
      success:      true,
      requestId,
      balance:      newBalance,
      txnId,
      network,
      phone:        cleanPhone,
      amount:       numericAmount,
      providerRef,
      vendorStatus: vendorResult.status,
    });

  } else if (normalizedStatus === 'pending') {
    // Vendor is still processing — DO NOT refund. Wallet stays debited.
    // The stuck-transaction recovery job will poll CK status later.
    await db.execute(sql`
      UPDATE transactions
      SET provider_reference = ${providerRef},
          updated_at = NOW(),
          metadata = jsonb_build_object(
            'vendorStatus',     ${vendorResult.status},
            'providerRef',      ${providerRef},
            'pendingMarkedAt',  NOW()::text,
            'requiresPolling',  true
          )
      WHERE id = ${txnId}::uuid
    `);

    logger.info({ userId, requestId, providerRef }, 'Airtime purchase pending — awaiting vendor confirmation');

    res.json({
      success:     false,
      pending:     true,
      requestId,
      txnId,
      balance:     newBalance,
      providerRef,
      vendorStatus: vendorResult.status,
      message:     'Your airtime purchase is being processed. Your wallet will be refunded automatically if delivery fails.',
    });

  } else {
    // Vendor returned failure — refund wallet
    try {
      const refundedBalance = await refundWalletAndMarkFailed({ userId, txnId, amount: numericAmount, requestId });
      newBalance = refundedBalance;
    } catch (refundErr) {
      logger.error({ refundErr, txnId }, 'CRITICAL: airtime refund failed — manual intervention required');
    }

    logger.warn({ userId, requestId, vendorStatus: vendorResult.status }, 'Airtime purchase failed — wallet reversed');

    await createNotification(userId, {
      type:  'transaction',
      title: 'Airtime Purchase Failed',
      body:  `₦${numericAmount.toLocaleString('en-NG')} of ${network.toUpperCase()} airtime could not be delivered to ${cleanPhone}. Your wallet has been refunded.`,
      refId: txnId,
    });

    res.status(422).json({
      success:      false,
      requestId,
      balance:      newBalance,
      txnId,
      vendorStatus: vendorResult.status,
      error:        `Vendor returned: ${vendorResult.status || 'failed'}`,
    });
  }
});

// ── POST /api/purchase/data ───────────────────────────────────────────────────
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

  // Validate network
  try { ck.getNetworkCode(network); } catch {
    res.status(400).json({ error: 'Invalid network. Use: mtn, glo, airtel, or 9mobile.' });
    return;
  }

  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 10 || cleanPhone.length > 11) {
    res.status(400).json({ error: 'Please enter a valid Nigerian phone number.' });
    return;
  }

  const userId         = req.session.userId!;
  const idempotencyKey = (req.headers['idempotency-key'] ?? '') as string;

  // ── Price validation against admin-configured pricing rules ──────────────
  const priceCheck = await validateDataPrice(planCode, network, numericAmount);
  if (!priceCheck.valid) {
    if (priceCheck.error === 'price_mismatch') {
      res.status(409).json({
        error:         'price_mismatch',
        message:       `Plan price has changed. Expected ₦${priceCheck.expectedPrice?.toLocaleString('en-NG')}.`,
        expectedPrice: priceCheck.expectedPrice,
      });
    } else {
      res.status(400).json({ error: priceCheck.error });
    }
    return;
  }

  const confirmedAmount = priceCheck.sellingPrice;
  const costPrice       = priceCheck.costPrice;
  const profit          = confirmedAmount - costPrice;

  if (idempotencyKey) {
    try {
      const handled = await handleIdempotency(res, userId, idempotencyKey, {
        network, phone: cleanPhone, amount: confirmedAmount, planName: planName ?? planCode,
      });
      if (handled) return;
    } catch (err) {
      logger.error({ err, idempotencyKey }, 'Idempotency check failed — proceeding');
    }
  }

  const requestId = idempotencyKey || `GY-DAT-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  // ── Step 1: Atomic wallet debit + pending transaction + ledger ────────────
  let txnId: string;
  let newBalance: string;

  try {
    const result = await db.transaction(async (tx) =>
      debitWalletAndRecord(tx, {
        userId,
        amount:      confirmedAmount,
        requestId,
        type:        'data',
        service:     'Data',
        provider:    network.toUpperCase(),
        description: `${network.toUpperCase()} ${planName ?? planCode} → ${cleanPhone}`,
        costPrice,
      }),
    );
    txnId      = result.txnId;
    newBalance = result.newBalance;
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'NOT_FOUND')         { res.status(404).json({ error: 'Wallet not found.' }); return; }
    if (e.code === 'INSUFFICIENT_FUNDS'){ res.status(402).json({ error: 'insufficient_funds' }); return; }
    logger.error({ err }, 'purchase/data debit failed');
    res.status(500).json({ error: 'Failed to process purchase.' });
    return;
  }

  // ── Step 2: Call ClubKonnect ──────────────────────────────────────────────
  let vendorResult: ck.CKPurchaseResult = { status: 'unsuccessful' };

  try {
    vendorResult = await ck.purchaseData({ network, phone: cleanPhone, planCode, requestId });
  } catch (err: unknown) {
    logger.error({ err, requestId }, 'ClubKonnect data call threw exception');
  }

  const normalizedStatus = normalizeCKStatus(vendorResult.status);
  const providerRef      = vendorResult.OrderID ?? vendorResult.ident ?? null;
  const resolvedPlanName = vendorResult.DataPlanName ?? planName ?? planCode;

  logger.info({
    userId, requestId, normalizedStatus, vendorStatus: vendorResult.status,
    providerRef, planCode, costPrice, sellingPrice: confirmedAmount, profit,
  }, 'Data vendor response');

  // ── Step 3: Handle vendor outcome ─────────────────────────────────────────
  if (normalizedStatus === 'success') {
    await db.execute(sql`
      UPDATE transactions
      SET status = 'success',
          updated_at = NOW(),
          description = ${`${network.toUpperCase()} ${resolvedPlanName}`},
          provider_reference = ${providerRef},
          metadata = jsonb_build_object(
            'vendorStatus', ${vendorResult.status},
            'providerRef',  ${providerRef},
            'planCode',     ${planCode},
            'planName',     ${resolvedPlanName},
            'costPrice',    ${costPrice},
            'sellingPrice', ${confirmedAmount},
            'profit',       ${profit},
            'completedAt',  NOW()::text
          )
      WHERE id = ${txnId}::uuid
    `);

    try { getIo().to(`user:${userId}`).emit('wallet:updated', { balance: newBalance }); } catch { /* non-fatal */ }

    await createNotification(userId, {
      type:  'transaction',
      title: 'Data Purchase Successful ✅',
      body:  `${resolvedPlanName} has been delivered to ${cleanPhone}.`,
      refId: txnId,
    });

    // ── Cashback (non-blocking — never fails the purchase) ───────────────
    let cashbackApplied = false;
    let cashbackAmount  = 0;
    let finalBalance    = newBalance;
    try {
      const cb = await applyCashbackIfEligible({
        userId,
        sourceTxnId:    txnId,
        requestId,
        planCode,
        network,
        planName:        resolvedPlanName,
        purchaseAmount:  confirmedAmount,
      });
      if (cb.applied) {
        cashbackApplied = true;
        cashbackAmount  = cb.amount;
        // finalBalance stays as the main wallet newBalance — cashback goes to cashback_wallets, not the main wallet
      }
    } catch (cbErr) {
      logger.error({ cbErr, txnId }, 'Cashback application failed — non-fatal, purchase still succeeded');
    }

    res.json({
      success:         true,
      requestId,
      balance:         finalBalance,
      txnId,
      network,
      phone:           cleanPhone,
      amount:          confirmedAmount,
      planName:        resolvedPlanName,
      providerRef,
      vendorStatus:    vendorResult.status,
      cashbackApplied,
      cashbackAmount:  cashbackApplied ? cashbackAmount : undefined,
    });

  } else if (normalizedStatus === 'pending') {
    // Vendor acknowledged but hasn't delivered yet — DO NOT refund
    await db.execute(sql`
      UPDATE transactions
      SET provider_reference = ${providerRef},
          updated_at = NOW(),
          metadata = jsonb_build_object(
            'vendorStatus',    ${vendorResult.status},
            'providerRef',     ${providerRef},
            'planCode',        ${planCode},
            'planName',        ${resolvedPlanName},
            'costPrice',       ${costPrice},
            'sellingPrice',    ${confirmedAmount},
            'pendingMarkedAt', NOW()::text,
            'requiresPolling', true
          )
      WHERE id = ${txnId}::uuid
    `);

    logger.info({ userId, requestId, providerRef }, 'Data purchase pending — awaiting vendor confirmation');

    res.json({
      success:      false,
      pending:      true,
      requestId,
      txnId,
      balance:      newBalance,
      planName:     resolvedPlanName,
      providerRef,
      vendorStatus: vendorResult.status,
      message:      'Your data purchase is being processed. Your wallet will be refunded automatically if delivery fails.',
    });

  } else {
    // Vendor failure — refund wallet
    try {
      const refundedBalance = await refundWalletAndMarkFailed({ userId, txnId, amount: confirmedAmount, requestId });
      newBalance = refundedBalance;
    } catch (refundErr) {
      logger.error({ refundErr, txnId }, 'CRITICAL: data refund failed — manual intervention required');
    }

    logger.warn({ userId, requestId, vendorStatus: vendorResult.status }, 'Data purchase failed — wallet reversed');

    await createNotification(userId, {
      type:  'transaction',
      title: 'Data Purchase Failed',
      body:  `${resolvedPlanName ?? planCode} could not be delivered to ${cleanPhone}. Your wallet has been refunded.`,
      refId: txnId,
    });

    res.status(422).json({
      success:      false,
      requestId,
      balance:      newBalance,
      txnId,
      vendorStatus: vendorResult.status,
      error:        `Vendor returned: ${vendorResult.status || 'failed'}`,
    });
  }
});

// ── GET /api/purchase/status/:requestId — Check status of a pending purchase ──
// Allows frontend to poll for the outcome of a 'pending' vendor response.
router.get('/status/:requestId', async (req: Request, res: Response): Promise<void> => {
  const { requestId } = req.params as { requestId: string };
  const userId        = req.session.userId!;

  const [txn] = await db
    .select()
    .from(transactionsTable)
    .where(
      and(
        eq(transactionsTable.reference, requestId),
        eq(transactionsTable.userId, userId),
      ),
    );

  if (!txn) {
    res.status(404).json({ error: 'Transaction not found.' });
    return;
  }

  const [wallet] = await db.select().from(walletsTable).where(eq(walletsTable.userId, userId));

  res.json({
    status:       txn.status,
    requestId,
    txnId:        txn.id,
    type:         txn.type,
    amount:       txn.amount,
    description:  txn.description,
    providerRef:  (txn as unknown as { provider_reference?: string }).provider_reference ?? null,
    balance:      wallet?.balance ?? '0',
    createdAt:    txn.createdAt,
  });
});

export default router;
