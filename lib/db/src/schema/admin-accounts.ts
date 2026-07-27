import { pgTable, uuid, text, timestamp, pgEnum, jsonb } from 'drizzle-orm/pg-core';

export const adminRoleEnum   = pgEnum('admin_role', [
  'super_admin',
  'admin',
  'customer_care',
  'finance',
  'supervisor',
  'technical_support',
]);
export const adminStatusEnum = pgEnum('admin_account_status', ['active', 'disabled']);

/**
 * admin_accounts — persistent admin users with role-based access.
 *
 * The initial super admin record is seeded automatically on first login
 * using the ADMIN_EMAIL / ADMIN_PIN environment variables.
 *
 * PINs are stored as bcryptjs hashes (SALT_ROUNDS = 12).
 */
export const adminAccountsTable = pgTable('admin_accounts', {
  id:          uuid('id').primaryKey().defaultRandom(),
  name:        text('name').notNull(),
  email:       text('email').notNull().unique(),
  role:        adminRoleEnum('role').notNull().default('admin'),
  pinHash:     text('pin_hash').notNull(),
  status:      adminStatusEnum('status').notNull().default('active'),
  financePermissions: jsonb('finance_permissions').$type<string[]>().notNull().default([]),
  /** UUID of the admin who created this account (NULL for the bootstrapped super admin) */
  createdBy:   uuid('created_by'),
  lastLoginAt: timestamp('last_login_at'),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
  updatedAt:   timestamp('updated_at').notNull().defaultNow(),
});

export type DbAdminAccount     = typeof adminAccountsTable.$inferSelect;
export type InsertAdminAccount = typeof adminAccountsTable.$inferInsert;
