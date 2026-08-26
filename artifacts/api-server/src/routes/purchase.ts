// ── POST /api/purchase/data ───────────────────────────────────────────────────
router.post('/data', async (req: Request, res: Response): Promise<void> => {
  const {
    network,
    phone,
    planCode,
    planName,
    planPrice,
  } = req.body as {
    network?: string;
    phone?: string;
    planCode?: string;
    planName?: string;
    planPrice?: string;
  };

  if (!network || !phone || !planCode || !planPrice) {
    res.status(400).json({
      error: 'network, phone, planCode, and planPrice are required.',
    });
    return;
  }

  const numericAmount = parseFloat(planPrice);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    res.status(400).json({
      error: 'planPrice must be a positive number.',
    });
    return;
  }

  try {
    ck.getNetworkCode(network);
  } catch {
    res.status(400).json({
      error: 'Invalid network. Use: mtn, glo, airtel, or 9mobile.',
    });
    return;
  }

  const cleanPhone = phone.replace(/\D/g, '');

  if (cleanPhone.length < 10 || cleanPhone.length > 11) {
    res.status(400).json({
      error: 'Please enter a valid Nigerian phone number.',
    });
    return;
  }

  const userId = req.session.userId!;
  const idempotencyKey =
    (req.headers['idempotency-key'] ?? '') as string;

  // ── IMPORTANT:
  // Pass planName together with planCode.
  // This allows pricing validation to match the same
  // Super Admin rule used by the data-plans endpoint.
  const priceCheck = await validateDataPrice(
    planCode,
    network,
    numericAmount,
    planName,
  );

  if (!priceCheck.valid) {
    if (priceCheck.error === 'price_mismatch') {
      res.status(409).json({
        error: 'price_mismatch',
        message:
          `Plan price has changed. Expected ₦${priceCheck.expectedPrice?.toLocaleString('en-NG')}.`,
        expectedPrice: priceCheck.expectedPrice,
      });
    } else {
      res.status(400).json({
        error: priceCheck.error,
      });
    }

    return;
  }

  const confirmedAmount = priceCheck.sellingPrice;
  const costPrice = priceCheck.costPrice;
  const profit = confirmedAmount - costPrice;

  if (idempotencyKey) {
    try {
      const handled = await handleIdempotency(
        res,
        userId,
        idempotencyKey,
        {
          network,
          phone: cleanPhone,
          amount: confirmedAmount,
          planName: planName ?? planCode,
        },
      );

      if (handled) return;
    } catch (err) {
      logger.error(
        { err, idempotencyKey },
        'Idempotency check failed — proceeding',
      );
    }
  }

  const requestId =
    idempotencyKey ||
    `GY-DAT-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`;

  // ── Step 1: Debit wallet and create pending transaction ─────────────────
  let txnId: string;
  let newBalance: string;

  try {
    const result = await db.transaction(async (tx) =>
      debitWalletAndRecord(tx, {
        userId,
        amount: confirmedAmount,
        requestId,
        type: 'data',
        service: 'Data',
        provider: network.toUpperCase(),
        description:
          `${network.toUpperCase()} ${planName ?? planCode} → ${cleanPhone}`,
        costPrice,
      }),
    );

    txnId = result.txnId;
    newBalance = result.newBalance;
  } catch (err: unknown) {
    const e = err as { code?: string };

    if (e.code === 'NOT_FOUND') {
      res.status(404).json({
        error: 'Wallet not found.',
      });
      return;
    }

    if (e.code === 'INSUFFICIENT_FUNDS') {
      res.status(402).json({
        error: 'insufficient_funds',
      });
      return;
    }

    logger.error(
      { err },
      'purchase/data debit failed',
    );

    res.status(500).json({
      error: 'Failed to process purchase.',
    });

    return;
  }

  // ── Step 2: Send the actual ClubKonnect purchase ─────────────────────────
  let vendorResult: ck.CKPurchaseResult = {
    status: 'unsuccessful',
  };

  try {
    vendorResult = await ck.purchaseData({
      network,
      phone: cleanPhone,
      planCode,
      requestId,
    });
  } catch (err: unknown) {
    logger.error(
      { err, requestId },
      'ClubKonnect data call threw exception',
    );
  }

  const normalizedStatus =
    normalizeCKStatus(vendorResult.status);

  const providerRef =
    vendorResult.OrderID ??
    vendorResult.ident ??
    null;

  const resolvedPlanName =
    vendorResult.DataPlanName ??
    planName ??
    planCode;

  logger.info(
    {
      userId,
      requestId,
      normalizedStatus,
      vendorStatus: vendorResult.status,
      providerRef,
      planCode,
      planName,
      costPrice,
      sellingPrice: confirmedAmount,
      profit,
    },
    'Data vendor response',
  );

  // ── Step 3: Successful purchase ─────────────────────────────────────────
  if (normalizedStatus === 'success') {
    await db.execute(sql`
      UPDATE transactions
      SET
        status = 'success',
        updated_at = NOW(),
        description = ${`${network.toUpperCase()} ${resolvedPlanName}`},
        provider_reference = ${providerRef},
        metadata = jsonb_build_object(
          'vendorStatus', ${vendorResult.status},
          'providerRef', ${providerRef},
          'planCode', ${planCode},
          'planName', ${resolvedPlanName},
          'costPrice', ${costPrice},
          'sellingPrice', ${confirmedAmount},
          'profit', ${profit},
          'completedAt', NOW()::text
        )
      WHERE id = ${txnId}::uuid
    `);

    try {
      getIo()
        .to(`user:${userId}`)
        .emit('wallet:updated', {
          balance: newBalance,
        });
    } catch {
      // non-fatal
    }

    await createNotification(userId, {
      type: 'transaction',
      title: 'Data Purchase Successful ✅',
      body:
        `${resolvedPlanName} has been delivered to ${cleanPhone}.`,
      refId: txnId,
    });

    let cashbackApplied = false;
    let cashbackAmount = 0;

    try {
      const cb = await applyCashbackIfEligible({
        userId,
        sourceTxnId: txnId,
        requestId,
        planCode,
        network,
        planName: resolvedPlanName,
        purchaseAmount: confirmedAmount,
      });

      if (cb.applied) {
        cashbackApplied = true;
        cashbackAmount = cb.amount;
      }
    } catch (cbErr) {
      logger.error(
        { cbErr, txnId },
        'Cashback application failed — non-fatal',
      );
    }

    res.json({
      success: true,
      requestId,
      balance: newBalance,
      txnId,
      network,
      phone: cleanPhone,
      amount: confirmedAmount,
      planName: resolvedPlanName,
      providerRef,
      vendorStatus: vendorResult.status,
      cashbackApplied,
      cashbackAmount:
        cashbackApplied ? cashbackAmount : undefined,
    });

    return;
  }

  // ── Pending purchase ─────────────────────────────────────────────────────
  if (normalizedStatus === 'pending') {
    await db.execute(sql`
      UPDATE transactions
      SET
        provider_reference = ${providerRef},
        updated_at = NOW(),
        metadata = jsonb_build_object(
          'vendorStatus', ${vendorResult.status},
          'providerRef', ${providerRef},
          'planCode', ${planCode},
          'planName', ${resolvedPlanName},
          'costPrice', ${costPrice},
          'sellingPrice', ${confirmedAmount},
          'pendingMarkedAt', NOW()::text,
          'requiresPolling', true
        )
      WHERE id = ${txnId}::uuid
    `);

    logger.info(
      {
        userId,
        requestId,
        providerRef,
      },
      'Data purchase pending — awaiting vendor confirmation',
    );

    res.json({
      success: false,
      pending: true,
      requestId,
      txnId,
      balance: newBalance,
      planName: resolvedPlanName,
      providerRef,
      vendorStatus: vendorResult.status,
      message:
        'Your data purchase is being processed. Your wallet will be refunded automatically if delivery fails.',
    });

    return;
  }

  // ── Vendor failure → refund wallet ──────────────────────────────────────
  try {
    const refundedBalance =
      await refundWalletAndMarkFailed({
        userId,
        txnId,
        amount: confirmedAmount,
        requestId,
      });

    newBalance = refundedBalance;
  } catch (refundErr) {
    logger.error(
      { refundErr, txnId },
      'CRITICAL: data refund failed — manual intervention required',
    );
  }

  logger.warn(
    {
      userId,
      requestId,
      vendorStatus: vendorResult.status,
    },
    'Data purchase failed — wallet reversed',
  );

  await createNotification(userId, {
    type: 'transaction',
    title: 'Data Purchase Failed',
    body:
      `${resolvedPlanName} could not be delivered to ${cleanPhone}. Your wallet has been refunded.`,
    refId: txnId,
  });

  res.status(422).json({
    success: false,
    requestId,
    balance: newBalance,
    txnId,
    vendorStatus: vendorResult.status,
    error:
      `Vendor returned: ${vendorResult.status || 'failed'}`,
  });
});
