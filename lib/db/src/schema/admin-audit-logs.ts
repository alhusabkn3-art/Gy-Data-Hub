import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { adminAccountsTable } from './admin-accounts';

/**
 * admin_audit_logs — immutable record of every significant admin action.
 *
 * adminEmail is denormalised so audit history is preserved even if the
 * admin account is deleted.
 */
export const adminAuditLogsTable = pgTable('admin_audit_logs', {
  id:          uuid('id').primaryKey().defaultRandom(),
  adminId:     uuid('admin_id').notNull().references(() => adminAccountsTable.id, { onDelete: 'cascade' }),
  adminEmail:  text('admin_email').notNull(),
  action:      text('action').notNull(),
  /** 'user' | 'admin' | 'setting' | 'service' | 'session' */
  targetType:  text('target_type'),
  targetId:    text('target_id'),
  targetLabel: text('target_label'),
  details:     jsonb('details'),
  ip:          text('ip'),
  createdAt:   timestamp('created_at').notNull().defaultNow(),
});

export type DbAdminAuditLog     = typeof adminAuditLogsTable.$inferSelect;
export type InsertAdminAuditLog = typeof adminAuditLogsTable.$inferInsert;
