// artifacts/api-server/src/routes/purchase.ts

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import {
  purchaseData,
  purchaseAirtime,
} from '../lib/smeapi';

const router = Router();

type PurchaseStatus = 'success' | 'pending' | 'failed';

const dataPurchaseSchema = z.object({
  network: z.string().min(1),
  phone: z.string().min(10),
  dataPlan: z.string().min(1),
  amount: z.coerce.number().positive(),
  idempotencyKey: z.string().min(1).max(255).optional(),
});

const airtimePurchaseSchema = z.object({
  network: z.string().min(1),
  phone: z.string().min(10),
  amount: z.coerce.number().positive(),
  idempotencyKey: z.string().min(1).max(255).optional(),
});

function getUserId(req: Request): string | null {
  const user = (req as any).user;

  if (!user) return null;

  return (
    user.id ??
    user.userId ??
    user.user_id ??
    null
  );
}

function getIdempotencyKey(req: Request, bodyKey?: string): string | null {
  const headerKey =
    req.header('Idempotency-Key') ??
    req.header('x-idempotency-key');

  return headerKey ?? bodyKey ?? null;
}

function normalizePhone(phone: string): string {
  let value = phone.trim().replace(/\s+/g, '');

  if (value.startsWith('+234')) {
    value = `0${value.slice(4)}`;
  } else if (value.startsWith('234') && value.length === 13) {
    value = `0${value.slice(3)}`;
  }

  return value;
}

function normalizeNetwork(network: string): string {
  return network.trim().toLowerCase();
}

function generateReference(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 10)
    .toUpperCase()}`;
}

async function getWalletBalance(userId: string): Promise<number> {
  const wallet = await prisma.wallet.findUnique({
    where: { userId },
    select: { balance: true },
  });

  return Number(wallet?.balance ?? 0);
}

async function markTransactionPending(
  transactionId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      status: 'pending',
      metadata: metadata as any,
    },
  });
}

async function markTransactionSuccess(
  transactionId: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await prisma.transaction.update({
    where: { id: transactionId },
    data: {
      status: 'success',
      metadata: metadata as any,
    },
  });
}

async function refundFailedPurchase(
  userId: string,
  transactionId: string,
  reference: string,
  amount: number,
  metadata: Record<string, unknown>,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const transaction = await tx.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction) {
      throw new Error('Transaction not found');
    }

    if (transaction.status === 'failed') {
      return;
    }

    if (transaction.status === 'success') {
      return;
    }

    const wallet = await tx.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    await tx.wallet.update({
      where: { userId },
      data: {
        balance: {
          increment: amount,
        },
      },
    });

    await tx.transaction.update({
      where: { id: transactionId },
      data: {
        status: 'failed',
        metadata: {
          ...(metadata as any),
          refunded: true,
          refundedAt: new Date().toISOString(),
        },
      },
    });

    await tx.walletLedger.create({
      data: {
        walletId: wallet.id,
        type: 'credit',
        amount,
        balanceBefore: Number(wallet.balance),
        balanceAfter: Number(wallet.balance) + amount,
        reference: `${reference}-refund`,
        description: 'Refund for failed purchase',
        metadata: {
          transactionId,
          originalReference: reference,
          reason: 'provider_failed',
        } as any,
      },
    });
  });
}

async function debitWalletAndCreateTransaction(params: {
  userId: string;
  amount: number;
  reference: string;
  type: string;
  metadata: Record<string, unknown>;
}) {
  return prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({
      where: { userId: params.userId },
    });

    if (!wallet) {
      throw new Error('Wallet not found');
    }

    const balance = Number(wallet.balance);
    const amount = Number(params.amount);

    if (balance < amount) {
      throw new Error('INSUFFICIENT_BALANCE');
    }

    const updatedWallet = await tx.wallet.update({
      where: { userId: params.userId },
      data: {
        balance: {
          decrement: amount,
        },
      },
    });

    const transaction = await tx.transaction.create({
      data: {
        userId: params.userId,
        reference: params.reference,
        type: params.type,
        amount,
        status: 'pending',
        metadata: params.metadata as any,
      },
    });

    await tx.walletLedger.create({
      data: {
        walletId: wallet.id,
        type: 'debit',
        amount,
        balanceBefore: balance,
        balanceAfter: Number(updatedWallet.balance),
        reference: params.reference,
        description: 'Purchase debit',
        metadata: {
          transactionId: transaction.id,
        } as any,
      },
    });

    return {
      transaction,
      balance: Number(updatedWallet.balance),
    };
  });
}

async function applyCashback(
  userId: string,
  transactionId: string,
  amount: number,
): Promise<void> {
  const cashbackRate = 0;

  if (cashbackRate <= 0) {
    return;
  }

  const cashback = Number(amount) * cashbackRate;

  if (cashback <= 0) {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({
      where: { userId },
    });

    if (!wallet) {
      return;
    }

    const existing = await tx.walletLedger.findFirst({
      where: {
        walletId: wallet.id,
        reference: `cashback-${transactionId}`,
      },
    });

    if (existing) {
      return;
    }

    const before = Number(wallet.balance);

    const updated = await tx.wallet.update({
      where: { userId },
      data: {
        balance: {
          increment: cashback,
        },
      },
    });

    await tx.walletLedger.create({
      data: {
        walletId: wallet.id,
        type: 'credit',
        amount: cashback,
        balanceBefore: before,
        balanceAfter: Number(updated.balance),
        reference: `cashback-${transactionId}`,
        description: 'Purchase cashback',
        metadata: {
          transactionId,
        } as any,
      },
    });
  });
}

async function notifyUser(
  userId: string,
  title: string,
  message: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const notificationModel = (prisma as any).notification;

    if (!notificationModel) {
      return;
    }

    await notificationModel.create({
      data: {
        userId,
        title,
        message,
        metadata,
      },
    });
  } catch {
    // Notification failure must never change purchase state.
  }
}

async function emitWalletUpdate(
  userId: string,
  balance: number,
): Promise<void> {
  try {
    const io = (global as any).io;

    if (!io) {
      return;
    }

    io.to(`user:${userId}`).emit('wallet:update', {
      balance,
    });
  } catch {
    // Realtime notification failure must never affect the transaction.
  }
}

router.post('/data', async (req: Request, res: Response) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  const parsed = dataPurchaseSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Invalid purchase details',
      errors: parsed.error.flatten(),
    });
  }

  const {
    network,
    phone: rawPhone,
    dataPlan,
    amount,
    idempotencyKey: bodyIdempotencyKey,
  } = parsed.data;

  const phone = normalizePhone(rawPhone);
  const normalizedNetwork = normalizeNetwork(network);
  const idempotencyKey = getIdempotencyKey(
    req,
    bodyIdempotencyKey,
  );

  if (!/^0\d{10}$/.test(phone)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid Nigerian phone number',
    });
  }

  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid amount',
    });
  }

  if (idempotencyKey) {
    const existing = await prisma.transaction.findFirst({
      where: {
        userId,
        metadata: {
          path: ['idempotencyKey'],
          equals: idempotencyKey,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (existing) {
      const balance = await getWalletBalance(userId);

      if (existing.status === 'success') {
        return res.status(200).json({
          success: true,
          status: 'success',
          message: 'Transaction already completed',
          reference: existing.reference,
          transactionId: existing.id,
          balance,
          idempotent: true,
        });
      }

      if (existing.status === 'pending') {
        return res.status(202).json({
          success: true,
          status: 'pending',
          pending: true,
          message: 'Transaction is still processing',
          reference: existing.reference,
          transactionId: existing.id,
          balance,
          idempotent: true,
        });
      }

      return res.status(422).json({
        success: false,
        status: 'failed',
        message: 'Transaction already failed',
        reference: existing.reference,
        transactionId: existing.id,
        balance,
        idempotent: true,
      });
    }
  }

  const reference = generateReference('DATA');

  let debitResult: {
    transaction: any;
    balance: number;
  };

  try {
    debitResult = await debitWalletAndCreateTransaction({
      userId,
      amount,
      reference,
      type: 'data_purchase',
      metadata: {
        idempotencyKey,
        network: normalizedNetwork,
        phone,
        dataPlan,
        amount,
      },
    });
  } catch (error: any) {
    if (error?.message === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance',
      });
    }

    console.error('Data wallet debit error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to process purchase',
    });
  }

  const transaction = debitResult.transaction;

  await emitWalletUpdate(userId, debitResult.balance);

  let providerResult: any;

  try {
    providerResult = await purchaseData({
      network: normalizedNetwork,
      phone,
      dataPlan,
      amount,
      reference,
    });
  } catch (error: any) {
    console.error('Data provider unexpected error:', error);

    await markTransactionPending(transaction.id, {
      ...(transaction.metadata as any),
      providerStatus: 'unknown',
      providerMessage:
        error?.message || 'Provider response could not be confirmed',
      pendingAt: new Date().toISOString(),
      reconciliationRequired: true,
    });

    await notifyUser(
      userId,
      'Data Purchase Processing',
      'Your data purchase is still being processed. Your wallet has not been refunded because the provider response could not be confirmed.',
      {
        transactionId: transaction.id,
        reference,
      },
    );

    return res.status(202).json({
      success: true,
      status: 'pending',
      pending: true,
      message:
        'Purchase is processing. Please wait for confirmation.',
      reference,
      transactionId: transaction.id,
      balance: debitResult.balance,
    });
  }

  const providerStatus =
    providerResult?.status ??
    (providerResult?.success ? 'success' : 'failed');

  if (
    providerStatus === 'pending' ||
    providerStatus === 'unknown'
  ) {
    await markTransactionPending(transaction.id, {
      ...(transaction.metadata as any),
      providerStatus,
      providerReference:
        providerResult?.reference ??
        providerResult?.transactionId ??
        null,
      providerMessage:
        providerResult?.message ??
        'Provider response is pending confirmation',
      providerResponse: providerResult?.raw ?? providerResult,
      pendingAt: new Date().toISOString(),
      reconciliationRequired:
        providerStatus === 'unknown',
    });

    await notifyUser(
      userId,
      'Data Purchase Processing',
      providerStatus === 'unknown'
        ? 'Your data purchase is being verified. Your wallet has not been refunded because the provider response could not be confirmed.'
        : 'Your data purchase is still processing.',
      {
        transactionId: transaction.id,
        reference,
        providerStatus,
      },
    );

    return res.status(202).json({
      success: true,
      status: 'pending',
      pending: true,
      message:
        'Purchase is processing. Please wait for confirmation.',
      reference,
      transactionId: transaction.id,
      balance: debitResult.balance,
    });
  }

  if (providerStatus === 'success' || providerResult?.success === true) {
    await markTransactionSuccess(transaction.id, {
      ...(transaction.metadata as any),
      providerStatus: 'success',
      providerReference:
        providerResult?.reference ??
        providerResult?.transactionId ??
        null,
      providerMessage: providerResult?.message ?? null,
      providerResponse: providerResult?.raw ?? providerResult,
      completedAt: new Date().toISOString(),
    });

    await applyCashback(
      userId,
      transaction.id,
      amount,
    );

    const balance = await getWalletBalance(userId);

    await emitWalletUpdate(userId, balance);

    await notifyUser(
      userId,
      'Data Purchase Successful',
      'Your data purchase was successful.',
      {
        transactionId: transaction.id,
        reference,
        network: normalizedNetwork,
        phone,
        dataPlan,
      },
    );

    return res.status(200).json({
      success: true,
      status: 'success',
      message:
        providerResult?.message ??
        'Data purchase successful',
      reference,
      transactionId: transaction.id,
      balance,
      providerReference:
        providerResult?.reference ??
        providerResult?.transactionId ??
        null,
    });
  }

  await refundFailedPurchase(
    userId,
    transaction.id,
    reference,
    amount,
    {
      ...(transaction.metadata as any),
      providerStatus: 'failed',
      providerReference:
        providerResult?.reference ??
        providerResult?.transactionId ??
        null,
      providerMessage:
        providerResult?.message ??
        'Data purchase failed',
      providerResponse: providerResult?.raw ?? providerResult,
      failedAt: new Date().toISOString(),
    },
  );

  const refundedBalance = await getWalletBalance(userId);

  await emitWalletUpdate(
    userId,
    refundedBalance,
  );

  await notifyUser(
    userId,
    'Data Purchase Failed',
    providerResult?.message ??
      'Data purchase failed. Your wallet has been refunded.',
    {
      transactionId: transaction.id,
      reference,
    },
  );

  return res.status(422).json({
    success: false,
    status: 'failed',
    message:
      providerResult?.message ??
      'Data purchase failed. Your wallet has been refunded.',
    reference,
    transactionId: transaction.id,
    balance: refundedBalance,
  });
});

router.post('/airtime', async (req: Request, res: Response) => {
  const userId = getUserId(req);

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized',
    });
  }

  const parsed = airtimePurchaseSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: 'Invalid airtime purchase details',
      errors: parsed.error.flatten(),
    });
  }

  const {
    network,
    phone: rawPhone,
    amount,
    idempotencyKey: bodyIdempotencyKey,
  } = parsed.data;

  const phone = normalizePhone(rawPhone);
  const normalizedNetwork = normalizeNetwork(network);
  const idempotencyKey = getIdempotencyKey(
    req,
    bodyIdempotencyKey,
  );

  if (!/^0\d{10}$/.test(phone)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid Nigerian phone number',
    });
  }

  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      message: 'Invalid amount',
    });
  }

  if (idempotencyKey) {
    const existing = await prisma.transaction.findFirst({
      where: {
        userId,
        metadata: {
          path: ['idempotencyKey'],
          equals: idempotencyKey,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    if (existing) {
      const balance = await getWalletBalance(userId);

      if (existing.status === 'success') {
        return res.status(200).json({
          success: true,
          status: 'success',
          message: 'Transaction already completed',
          reference: existing.reference,
          transactionId: existing.id,
          balance,
          idempotent: true,
        });
      }

      if (existing.status === 'pending') {
        return res.status(202).json({
          success: true,
          status: 'pending',
          pending: true,
          message: 'Transaction is still processing',
          reference: existing.reference,
          transactionId: existing.id,
          balance,
          idempotent: true,
        });
      }

      return res.status(422).json({
        success: false,
        status: 'failed',
        message: 'Transaction already failed',
        reference: existing.reference,
        transactionId: existing.id,
        balance,
        idempotent: true,
      });
    }
  }

  const reference = generateReference('AIRTIME');

  let debitResult: {
    transaction: any;
    balance: number;
  };

  try {
    debitResult = await debitWalletAndCreateTransaction({
      userId,
      amount,
      reference,
      type: 'airtime_purchase',
      metadata: {
        idempotencyKey,
        network: normalizedNetwork,
        phone,
        amount,
      },
    });
  } catch (error: any) {
    if (error?.message === 'INSUFFICIENT_BALANCE') {
      return res.status(400).json({
        success: false,
        message: 'Insufficient wallet balance',
      });
    }

    console.error('Airtime wallet debit error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to process purchase',
    });
  }

  const transaction = debitResult.transaction;

  await emitWalletUpdate(userId, debitResult.balance);

  let providerResult: any;

  try {
    providerResult = await purchaseAirtime({
      network: normalizedNetwork,
      phone,
      amount,
      reference,
    });
  } catch (error: any) {
    console.error('Airtime provider unexpected error:', error);

    await markTransactionPending(transaction.id, {
      ...(transaction.metadata as any),
      providerStatus: 'unknown',
      providerMessage:
        error?.message ||
        'Provider response could not be confirmed',
      pendingAt: new Date().toISOString(),
      reconciliationRequired: true,
    });

    await notifyUser(
      userId,
      'Airtime Purchase Processing',
      'Your airtime purchase is still being processed. Your wallet has not been refunded because the provider response could not be confirmed.',
      {
        transactionId: transaction.id,
        reference,
      },
    );

    return res.status(202).json({
      success: true,
      status: 'pending',
      pending: true,
      message:
        'Purchase is processing. Please wait for confirmation.',
      reference,
      transactionId: transaction.id,
      balance: debitResult.balance,
    });
  }

  const providerStatus =
    providerResult?.status ??
    (providerResult?.success ? 'success' : 'failed');

  if (
    providerStatus === 'pending' ||
    providerStatus === 'unknown'
  ) {
    await markTransactionPending(transaction.id, {
      ...(transaction.metadata as any),
      providerStatus,
      providerReference:
        providerResult?.reference ??
        providerResult?.transactionId ??
        null,
      providerMessage:
        providerResult?.message ??
        'Provider response is pending confirmation',
      providerResponse: providerResult?.raw ?? providerResult,
      pendingAt: new Date().toISOString(),
      reconciliationRequired:
        providerStatus === 'unknown',
    });

    await notifyUser(
      userId,
      'Airtime Purchase Processing',
      providerStatus === 'unknown'
        ? 'Your airtime purchase is being verified. Your wallet has not been refunded because the provider response could not be confirmed.'
        : 'Your airtime purchase is still processing.',
      {
        transactionId: transaction.id,
        reference,
        providerStatus,
      },
    );

    return res.status(202).json({
      success: true,
      status: 'pending',
      pending: true,
      message:
        'Purchase is processing. Please wait for confirmation.',
      reference,
      transactionId: transaction.id,
      balance: debitResult.balance,
    });
  }

  if (providerStatus === 'success' || providerResult?.success === true) {
    await markTransactionSuccess(transaction.id, {
      ...(transaction.metadata as any),
      providerStatus: 'success',
      providerReference:
        providerResult?.reference ??
        providerResult?.transactionId ??
        null,
      providerMessage:
        providerResult?.message ?? null,
      providerResponse:
        providerResult?.raw ?? providerResult,
      completedAt: new Date().toISOString(),
    });

    await applyCashback(
      userId,
      transaction.id,
      amount,
    );

    const balance = await getWalletBalance(userId);

    await emitWalletUpdate(userId, balance);

    await notifyUser(
      userId,
      'Airtime Purchase Successful',
      'Your airtime purchase was successful.',
      {
        transactionId: transaction.id,
        reference,
        network: normalizedNetwork,
        phone,
      },
    );

    return res.status(200).json({
      success: true,
      status: 'success',
      message:
        providerResult?.message ??
        'Airtime purchase successful',
      reference,
      transactionId: transaction.id,
      balance,
      providerReference:
        providerResult?.reference ??
        providerResult?.transactionId ??
        null,
    });
  }

  await refundFailedPurchase(
    userId,
    transaction.id,
    reference,
    amount,
    {
      ...(transaction.metadata as any),
      providerStatus: 'failed',
      providerReference:
        providerResult?.reference ??
        providerResult?.transactionId ??
        null,
      providerMessage:
        providerResult?.message ??
        'Airtime purchase failed',
      providerResponse:
        providerResult?.raw ?? providerResult,
      failedAt: new Date().toISOString(),
    },
  );

  const refundedBalance = await getWalletBalance(userId);

  await emitWalletUpdate(
    userId,
    refundedBalance,
  );

  await notifyUser(
    userId,
    'Airtime Purchase Failed',
    providerResult?.message ??
      'Airtime purchase failed. Your wallet has been refunded.',
    {
      transactionId: transaction.id,
      reference,
    },
  );

  return res.status(422).json({
    success: false,
    status: 'failed',
    message:
      providerResult?.message ??
      'Airtime purchase failed. Your wallet has been refunded.',
    reference,
    transactionId: transaction.id,
    balance: refundedBalance,
  });
});

export default router;
