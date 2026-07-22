import { pgTable, uuid, text, numeric, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { usersTable } from './users';

export const txnTypeEnum = pgEnum('txn_type', [
  'data', 'airtime', 'electricity', 'cable', 'betting', 'exam', 'wallet_fund',
]);
export const txnStatusEnum = pgEnum('txn_status', ['success', 'pending', 'failed']);

export const transactionsTable = pgTable('transactions', {
  id:            uuid('id').primaryKey().defaultRandom(),
  userId:        uuid('user_id').notNull().references(() => usersTable.id, { onDelete: 'cascade' }),
  type:          txnTypeEnum('type').notNull(),
  service:       text('service').notNull(),
  provider:      text('provider').notNull(),
  amount:        numeric('amount', { precision: 15, scale: 2 }).notNull(),
  status:        txnStatusEnum('status').notNull().default('pending'),
  reference:     text('reference').unique(),     // nullable — external refs only
  description:   text('description').notNull().default(''),
  paymentMethod: text('payment_method'),
  metadata:      jsonb('metadata'),
  createdAt:     timestamp('created_at').notNull().defaultNow(),
});

export type DbTransaction     = typeof transactionsTable.$inferSelect;
export type InsertTransaction = typeof transactionsTable.$inferInsert;
