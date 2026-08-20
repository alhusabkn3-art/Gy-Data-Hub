/**
 * Shared notification-creation helper.
 *
 * Import this in any route that needs to fire a user notification.
 * Errors are logged but never re-thrown — notification creation is always
 * non-fatal so it cannot disrupt a purchase or wallet operation.
 *
 * Designed as a thin wrapper so it can be swapped later for a push-
 * notification service (FCM, APNs, etc.) without touching any route code.
 */
import { db } from '@workspace/db';
import { notificationsTable } from '@workspace/db/schema';
import { logger } from './logger.js';

export type NotifType =
  | 'transaction'
  | 'promo'
  | 'system'
  | 'security';

export interface CreateNotificationOpts {
  type: NotifType;
  title: string;
  body: string;
  /** Optional linked entity — e.g. a transaction UUID that the UI can open. */
  refId?: string | null;
}

export async function createNotification(
  userId: string,
  opts: CreateNotificationOpts,
): Promise<void> {
  try {
    await db.insert(notificationsTable).values({
      userId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      refId: opts.refId ?? null,
      read: false,
    });
  } catch (err) {
    logger.error(
      {
        err,
        userId,
        title: opts.title,
      },
      'createNotification — non-fatal failure',
    );
  }
}
