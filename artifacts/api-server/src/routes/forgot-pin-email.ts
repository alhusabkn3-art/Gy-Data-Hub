import {
  Router,
  type Request,
  type Response,
} from 'express';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';

import { db } from '@workspace/db';
import { usersTable } from '@workspace/db/schema';

import {
  hashPin,
  verifyPin,
} from '../lib/auth.js';

import {
  logger,
} from '../lib/logger.js';

import {
  sendPinResetOtpEmail,
} from '../lib/email.js';

const router = Router();

const normalizeEmail = (
  value: string,
): string =>
  value.trim().toLowerCase();

const isValidEmail = (
  value: string,
): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    value,
  );

/*
 * POST /api/auth/forgot-pin-email/request
 *
 * Sends OTP to the registered email address.
 */
router.post(
  '/forgot-pin-email/request',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const rawEmail =
      typeof req.body?.email === 'string'
        ? req.body.email
        : '';

    const email =
      normalizeEmail(rawEmail);

    if (!isValidEmail(email)) {
      res.status(400).json({
        ok: false,
        error:
          'Please enter a valid email address.',
      });
      return;
    }

    const [user] =
      await db
        .select({
          id: usersTable.id,
          email: usersTable.email,
          resetOtpHash:
            usersTable.resetOtpHash,
          resetOtpExpiry:
            usersTable.resetOtpExpiry,
        })
        .from(usersTable)
        .where(
          eq(
            usersTable.email,
            email,
          ),
        );

    /*
     * Do not reveal whether the account exists.
     */
    if (!user) {
      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            250,
          ),
      );

      res.json({
        ok: true,
        message:
          'If an account with this email exists, a verification code has been sent.',
      });

      return;
    }

    /*
     * Generate a secure 6-digit OTP.
     */
    const otp =
      crypto
        .randomInt(
          0,
          1_000_000,
        )
        .toString()
        .padStart(6, '0');

    const otpHash =
      await hashPin(otp);

    const expiry =
      new Date(
        Date.now() +
          5 * 60 * 1000,
      );

    await db
      .update(usersTable)
      .set({
        resetOtpHash:
          otpHash,
        resetOtpExpiry:
          expiry,
        updatedAt:
          new Date(),
      })
      .where(
        eq(
          usersTable.id,
          user.id,
        ),
      );

    try {
      await sendPinResetOtpEmail(
        user.email,
        otp,
        'login',
      );
    } catch (error) {
      logger.error(
        {
          error,
          userId: user.id,
        },
        'Failed to send email PIN reset OTP',
      );

      await db
        .update(usersTable)
        .set({
          resetOtpHash:
            null,
          resetOtpExpiry:
            null,
          updatedAt:
            new Date(),
        })
        .where(
          eq(
            usersTable.id,
            user.id,
          ),
        );

      res.status(503).json({
        ok: false,
        error:
          'Unable to send the verification code right now. Please try again later.',
      });

      return;
    }

    logger.info(
      {
        userId: user.id,
      },
      'Email PIN reset OTP sent',
    );

    res.json({
      ok: true,
      message:
        'A verification code has been sent to your registered email address.',
    });
  },
);

/*
 * POST /api/auth/forgot-pin-email/reset
 *
 * Verifies email + OTP and changes the login PIN.
 */
router.post(
  '/forgot-pin-email/reset',
  async (
    req: Request,
    res: Response,
  ): Promise<void> => {
    const rawEmail =
      typeof req.body?.email === 'string'
        ? req.body.email
        : '';

    const otp =
      typeof req.body?.otp === 'string'
        ? req.body.otp
        : '';

    const newPin =
      typeof req.body?.newPin === 'string'
        ? req.body.newPin
        : '';

    const email =
      normalizeEmail(rawEmail);

    if (
      !isValidEmail(email) ||
      !/^\d{6}$/.test(otp) ||
      !/^\d{6}$/.test(newPin)
    ) {
      res.status(400).json({
        ok: false,
        error:
          'Invalid email, verification code, or PIN.',
      });

      return;
    }

    const [user] =
      await db
        .select()
        .from(usersTable)
        .where(
          eq(
            usersTable.email,
            email,
          ),
        );

    const invalidCode =
      async () => {
        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              250,
            ),
        );

        res.status(400).json({
          ok: false,
          error:
            'The verification code is invalid or has expired.',
        });
      };

    if (
      !user ||
      !user.resetOtpHash ||
      !user.resetOtpExpiry
    ) {
      await invalidCode();
      return;
    }

    if (
      new Date() >
      new Date(
        user.resetOtpExpiry,
      )
    ) {
      await db
        .update(usersTable)
        .set({
          resetOtpHash:
            null,
          resetOtpExpiry:
            null,
          updatedAt:
            new Date(),
        })
        .where(
          eq(
            usersTable.id,
            user.id,
          ),
        );

      await invalidCode();
      return;
    }

    const otpValid =
      await verifyPin(
        otp,
        user.resetOtpHash,
      );

    if (!otpValid) {
      await invalidCode();
      return;
    }

    const newPinHash =
      await hashPin(newPin);

    await db
      .update(usersTable)
      .set({
        loginPinHash:
          newPinHash,
        resetOtpHash:
          null,
        resetOtpExpiry:
          null,
        updatedAt:
          new Date(),
      })
      .where(
        eq(
          usersTable.id,
          user.id,
        ),
      );

    logger.info(
      {
        userId: user.id,
      },
      'PIN reset successfully using email OTP',
    );

    res.json({
      ok: true,
      message:
        'Your PIN has been updated successfully.',
    });
  },
);

export default router;
