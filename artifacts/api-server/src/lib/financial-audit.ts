/**
 * Shared helper for writing to financial_audit_logs.
 *
 * Imported by both admin-finance.ts and admin-super.ts so the same
 * immutable audit trail is used regardless of which route triggers a
 * financial mutation.
 */
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { logger } from './logger.js';

export interface FinancialAuditParams {
  adminId: string;
  adminName?: string;
  adminEmail?: string;
  adminRole: string;
  action: string;
  entityType?: string;
  entityId?: string;
  customerId?: string;
  customerName?: string;
  previousValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  reason?: string;
  ip?: string;
}

export async function financialAuditLog(params: FinancialAuditParams): Promise<void> {
  try {
    let adminName  = params.adminName;
    let adminEmail = params.adminEmail;
    if (!adminName || !adminEmail) {
      const row = (await db.execute<{ name: string; email: string }>(
        sql`SELECT name, email FROM admin_accounts WHERE id = ${params.adminId}::uuid LIMIT 1`
      )).rows[0];
      adminName  = adminName  ?? row?.name  ?? 'Unknown';
      adminEmail = adminEmail ?? row?.email ?? 'Unknown';
    }
    await db.execute(sql`
      INSERT INTO financial_audit_logs
        (admin_id, admin_name, admin_email, admin_role, action,
         entity_type, entity_id, customer_id, customer_name,
         previous_value, new_value, reason, ip)
      VALUES
        (${params.adminId}::uuid, ${adminName}, ${adminEmail}, ${params.adminRole}, ${params.action},
         ${params.entityType ?? null}, ${params.entityId ?? null},
         ${params.customerId ?? null}, ${params.customerName ?? null},
         ${params.previousValue ? JSON.stringify(params.previousValue) : null},
         ${params.newValue ? JSON.stringify(params.newValue) : null},
         ${params.reason ?? null}, ${params.ip ?? null})
    `);
  } catch (err) {
    logger.error({ err }, 'financialAuditLog insert failed');
  }
}
