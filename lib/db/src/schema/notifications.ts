import { pgTable, uuid, text, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { usersTable } from './users';

export const notifTypeEnum = pgEnum('notif_type', ['transaction', 'promo', 'system', 'security']);

export const notificationsTable = pgTable('notifications', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  type:      notifTypeEnum('type').notNull().default('system'),
  title:     text('title').notNull(),
  body:      text('body').notNull(),
  read:      boolean('read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export type DbNotification     = typeof notificationsTable.$inferSelect;
export type InsertNotification = typeof notificationsTable.$inferInsert;
