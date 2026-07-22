import { pgTable, uuid, numeric, timestamp } from 'drizzle-orm/pg-core';
import { usersTable } from './users';

export const walletsTable = pgTable('wallets', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().unique().references(() => usersTable.id, { onDelete: 'cascade' }),
  balance:   numeric('balance', { precision: 15, scale: 2 }).notNull().default('0'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type DbWallet     = typeof walletsTable.$inferSelect;
export type InsertWallet = typeof walletsTable.$inferInsert;
