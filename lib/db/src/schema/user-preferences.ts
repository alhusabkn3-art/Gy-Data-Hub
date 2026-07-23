import { pgTable, uuid, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { usersTable } from './users';

export const userPreferencesTable = pgTable('user_preferences', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').notNull().unique().references(() => usersTable.id, { onDelete: 'cascade' }),
  preferences: jsonb('preferences').notNull().default({}),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
});

export type DbUserPreferences     = typeof userPreferencesTable.$inferSelect;
export type InsertUserPreferences = typeof userPreferencesTable.$inferInsert;
