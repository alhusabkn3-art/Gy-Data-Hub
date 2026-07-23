/**
 * admin-cc.ts  —  Customer Care / Support API
 *
 * All routes require an active admin session (any role).
 * PINs are NEVER read, logged, or returned by any route here.
 * OTPs are stored as bcryptjs hashes — plaintext is never persisted.
 *
 * Routes:
 *   GET  /api/admin/cc/search                      — safe customer lookup
 *   GET  /api/admin/cc/stats                       — dashboard stats header
 *   GET  /api/admin/cc/tickets                     — paginated ticket list
 *   POST /api/admin/cc/tickets                     — open new support ticket
 *   GET  /api/admin/cc/tickets/:id                 — ticket detail + audit trail
 *   PATCH /api/admin/cc/tickets/:id                — update notes / close ticket
 *   POST /api/admin/cc/tickets/:id/send-otp        — send identity-verification OTP
 *   POST /api/admin/cc/tickets/:id/verify-otp      — CC staff submits OTP from customer
 *   POST /api/admin/cc/tickets/:id/approve-reset   — approve PIN reset, issue reset code
 *   GET  /api/admin/cc/audit-logs                  — full audit log
 *
 * Rate limits (stored per ticket):
 *   OTP sends    — max 3 per ticket lifetime, 2-min cooldown between sends
 *   OTP attempts — max 5 wrong guesses before lockout
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '@workspace/db';
import { usersTable } from '@workspace/db/schema';
import { sql } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { logger } from '../lib/logger.js';

const router = Router();

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_OTP_SENDS      = 3;
const OTP_COOLDOWN_MS    = 2 * 60 * 1000;       // 2 min between sends
const OTP_EXPIRY_MS      = 5 * 60 * 1000;       // 5 min validity
const MAX_OTP_ATTEMPTS   = 5;
const RESET_OTP_EXPIRY_MS = 60 * 60 * 1000;    // 1 h for customer to use

// ── Middleware ────────────────────────────────────────────────────────────────

// Roles that have access to CC routes (finance staff do NOT get CC access)
const CC_ALLOWED_ROLES = new Set(['super_admin', 'admin', 'customer_care', 'supervisor', 'technical_support']);

function requireCCSession(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.isAdmin) {
    res.status(401).json({ error: 'Admin authentication required.' });
    return;
  }
  if (!CC_ALLOWED_ROLES.has(req.session.adminRole ?? '')) {
    res.status(403).json({ error: 'Customer Care access required.' });
    return;
  }
  next();
}

// Apply CC auth only to /cc/* paths so finance/other routers don't get intercepted
// when adminCCRouter is mounted at /admin (shared base path).
router.use('/cc', requireCCSession);

// ── Helpers ───────────────────────────────────────────────────────────────────

function clientIp(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
    req.socket?.remoteAddress ??
    'unknown'
  );
}

/** 6-digit random OTP */
function genOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Unique ticket number e.g. TKT-K3XPQR7M */
function genTicketNumber(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'TKT-';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)!];
  return s;
}

async function getStaffName(adminId: string): Promise<string> {
  try {
    const r = await db.execute(sql`
      SELECT name, email FROM admin_accounts WHERE id = ${adminId} LIMIT 1
    `);
    const row = r.rows[0] as { name: string; email: string } | undefined;
    return row?.name ?? row?.email ?? adminId;
  } catch {
    return adminId;
  }
}

async function ccAudit(opts: {
  adminId:    string;
  ticketId?:  string;
  customerId?: string;
  action:     string;
  details?:   Record<string, unknown>;
  ip?:        string;
}): Promise<void> {
  try {
    const name = await getStaffName(opts.adminId);
    await db.execute(sql`
      INSERT INTO support_audit_logs
        (ticket_id, customer_id, action, performed_by, performed_by_name, details, ip_address)
      VALUES (
        ${opts.ticketId    ?? null},
        ${opts.customerId  ?? null},
        ${opts.action},
        ${opts.adminId},
        ${name},
        ${JSON.stringify(opts.details ?? {})}::jsonb,
        ${opts.ip ?? null}
      )
    `);
  } catch (err) {
    logger.warn({ err, action: opts.action }, 'CC audit write failed');
  }
}

/** Safe customer shape — never includes any PIN or OTP fields */
function safeCustomer(row: Record<string, unknown>) {
  return {
    id:            row['id'],
    name:          row['name'],
    firstName:     row['first_name'],
    lastName:      row['last_name'],
    username:      row['username'],
    phone:         row['phone'],
    email:         row['email'],
    accountNumber: row['account_number'],
    kycStatus:     row['kyc_status'],
    status:        row['status'],
    createdAt:     row['created_at'],
  };
}

// ── GET /api/admin/cc/search ──────────────────────────────────────────────────

router.get('/cc/search', async (req: Request, res: Response): Promise<void> => {
  const q = ((req.query['q'] as string) ?? '').trim();
  if (!q || q.length < 3) {
    res.status(400).json({ error: 'Query must be at least 3 characters.' });
    return;
  }

  try {
    const isUUID  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q);
    const isPhone = /^\d{7,}$/.test(q.replace(/\D/g, ''));

    let result;
    if (isUUID) {
      result = await db.execute(sql`
        SELECT id, name, first_name, last_name, username, phone, email,
               account_number, kyc_status, status, created_at
        FROM users WHERE id = ${q} LIMIT 1
      `);
    } else if (isPhone) {
      const norm = q.replace(/\D/g, '');
      result = await db.execute(sql`
        SELECT id, name, first_name, last_name, username, phone, email,
               account_number, kyc_status, status, created_at
        FROM users WHERE phone LIKE ${'%' + norm + '%'}
        ORDER BY created_at DESC LIMIT 5
      `);
    } else {
      result = await db.execute(sql`
        SELECT id, name, first_name, last_name, username, phone, email,
               account_number, kyc_status, status, created_at
        FROM users
        WHERE LOWER(name) LIKE ${'%' + q.toLowerCase() + '%'}
           OR LOWER(username) LIKE ${'%' + q.toLowerCase() + '%'}
        ORDER BY created_at DESC LIMIT 5
      `);
    }

    const customers = (result.rows as Record<string, unknown>[]).map(safeCustomer);

    void ccAudit({
      adminId: req.session.adminId,
      action:  'customer_searched',
      details: { query: q, resultsFound: customers.length },
      ip:      clientIp(req),
    });

    res.json({ customers });
  } catch (err) {
    logger.error({ err }, 'CC search error');
    res.status(500).json({ error: 'Search failed.' });
  }
});

// ── GET /api/admin/cc/stats ───────────────────────────────────────────────────

router.get('/cc/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const r = await db.execute(sql`
      SELECT
        COUNT(*)                                                                          AS total,
        COUNT(*) FILTER (WHERE status = 'open')                                          AS open,
        COUNT(*) FILTER (WHERE status = 'pending_verification')                          AS pending_verification,
        COUNT(*) FILTER (WHERE identity_verified = true)                                 AS verified,
        COUNT(*) FILTER (WHERE pin_reset_approved = true
                           AND pin_reset_approved_at::date = CURRENT_DATE)               AS approved_today,
        COUNT(*) FILTER (WHERE status = 'resolved')                                      AS resolved
      FROM support_tickets
    `);
    res.json(r.rows[0] ?? {
      total: 0, open: 0, pending_verification: 0,
      verified: 0, approved_today: 0, resolved: 0,
    });
  } catch (err) {
    logger.error({ err }, 'CC stats error');
    res.status(500).json({ error: 'Stats failed.' });
  }
});

// ── GET /api/admin/cc/tickets ─────────────────────────────────────────────────

router.get('/cc/tickets', async (req: Request, res: Response): Promise<void> => {
  const status = (req.query['status'] as string) ?? 'all';
  const page   = Math.max(1, parseInt((req.query['page'] as string) ?? '1', 10));
  const limit  = 25;
  const offset = (page - 1) * limit;

  try {
    const where = status !== 'all' ? sql`WHERE status = ${status}` : sql``;
    const countR = await db.execute(sql`SELECT COUNT(*) AS total FROM support_tickets ${where}`);
    const total  = parseInt(String((countR.rows[0] as Record<string, unknown>)['total'] ?? '0'), 10);

    const rows = await db.execute(sql`
      SELECT id, ticket_number, customer_id, customer_phone, customer_name,
             reason, status, assigned_staff_name, notes,
             identity_verified, pin_reset_approved, pin_reset_approved_at,
             otp_attempts, otp_send_count, otp_last_sent_at, otp_expiry,
             created_at, updated_at
      FROM support_tickets
      ${where}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    res.json({ tickets: rows.rows, total, page, limit });
  } catch (err) {
    logger.error({ err }, 'CC list tickets error');
    res.status(500).json({ error: 'Failed to load tickets.' });
  }
});

// ── POST /api/admin/cc/tickets ────────────────────────────────────────────────

router.post('/cc/tickets', async (req: Request, res: Response): Promise<void> => {
  const { customerId, reason = 'pin_reset', notes = '' } = req.body as {
    customerId?: string; reason?: string; notes?: string;
  };
  if (!customerId) { res.status(400).json({ error: 'customerId is required.' }); return; }

  try {
    const custR = await db.execute(sql`
      SELECT id, name, phone, status FROM users WHERE id = ${customerId} LIMIT 1
    `);
    const cust = custR.rows[0] as { id: string; name: string; phone: string; status: string } | undefined;
    if (!cust) { res.status(404).json({ error: 'Customer not found.' }); return; }

    // Block if active ticket already exists
    const existing = await db.execute(sql`
      SELECT id, ticket_number FROM support_tickets
      WHERE customer_id = ${customerId}
        AND status NOT IN ('resolved', 'closed')
      LIMIT 1
    `);
    if (existing.rows.length) {
      const ex = existing.rows[0] as { id: string; ticket_number: string };
      res.status(409).json({
        error: 'An open ticket already exists for this customer.',
        existingTicketId: ex.id,
        ticketNumber: ex.ticket_number,
      });
      return;
    }

    const staffName   = await getStaffName(req.session.adminId);
    let ticketNumber  = genTicketNumber();
    const collision   = await db.execute(sql`SELECT id FROM support_tickets WHERE ticket_number = ${ticketNumber} LIMIT 1`);
    if (collision.rows.length) ticketNumber = genTicketNumber();

    const insertR = await db.execute(sql`
      INSERT INTO support_tickets
        (ticket_number, customer_id, customer_phone, customer_name, reason,
         status, assigned_staff_id, assigned_staff_name, notes)
      VALUES (
        ${ticketNumber}, ${cust.id}, ${cust.phone}, ${cust.name},
        ${reason}, 'open', ${req.session.adminId}, ${staffName}, ${notes || null}
      )
      RETURNING id, ticket_number, status, created_at
    `);
    const ticket = insertR.rows[0] as { id: string; ticket_number: string; status: string; created_at: unknown };

    void ccAudit({
      adminId:    req.session.adminId,
      ticketId:   ticket.id,
      customerId: cust.id,
      action:     'ticket_created',
      details:    { ticketNumber, reason, customerPhone: cust.phone },
      ip:         clientIp(req),
    });

    res.status(201).json({ ticket });
  } catch (err) {
    logger.error({ err }, 'CC create ticket error');
    res.status(500).json({ error: 'Failed to create ticket.' });
  }
});

// ── GET /api/admin/cc/tickets/:id ─────────────────────────────────────────────

router.get('/cc/tickets/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const tR = await db.execute(sql`SELECT * FROM support_tickets WHERE id = ${id} LIMIT 1`);
    if (!tR.rows.length) { res.status(404).json({ error: 'Ticket not found.' }); return; }
    const raw = tR.rows[0] as Record<string, unknown>;

    // Customer safe profile (no PIN / OTP fields)
    const cR = await db.execute(sql`
      SELECT id, name, first_name, last_name, username, phone, email,
             account_number, kyc_status, status, created_at
      FROM users WHERE id = ${raw['customer_id']} LIMIT 1
    `);
    const customer = cR.rows[0] ? safeCustomer(cR.rows[0] as Record<string, unknown>) : null;

    // Audit trail for this ticket
    const aR = await db.execute(sql`
      SELECT id, action, performed_by_name, details, ip_address, created_at
      FROM support_audit_logs WHERE ticket_id = ${id}
      ORDER BY created_at ASC LIMIT 100
    `);

    void ccAudit({
      adminId:    req.session.adminId,
      ticketId:   id,
      customerId: String(raw['customer_id']),
      action:     'ticket_viewed',
      details:    { ticketNumber: raw['ticket_number'] },
      ip:         clientIp(req),
    });

    // Strip otp_hash — never send hashed credential to client
    const { otp_hash: _omit, ...safeTicket } = raw;
    res.json({ ticket: safeTicket, customer, auditLogs: aR.rows });
  } catch (err) {
    logger.error({ err }, 'CC get ticket error');
    res.status(500).json({ error: 'Failed to load ticket.' });
  }
});

// ── PATCH /api/admin/cc/tickets/:id ──────────────────────────────────────────

router.patch('/cc/tickets/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { notes, status } = req.body as { notes?: string; status?: string };

  const LOCKED   = ['resolved', 'closed'];
  const MUTABLE  = ['open', 'closed', 'resolved'];

  try {
    const tR = await db.execute(sql`SELECT status FROM support_tickets WHERE id = ${id} LIMIT 1`);
    if (!tR.rows.length) { res.status(404).json({ error: 'Ticket not found.' }); return; }
    const current = (tR.rows[0] as { status: string }).status;

    if (status && LOCKED.includes(current) && status !== current) {
      res.status(409).json({ error: `Cannot change status of a ${current} ticket.` });
      return;
    }
    if (status && !MUTABLE.includes(status)) {
      res.status(400).json({ error: `Status must be one of: ${MUTABLE.join(', ')}` });
      return;
    }

    await db.execute(sql`
      UPDATE support_tickets SET
        notes      = CASE WHEN ${notes !== undefined} THEN ${notes ?? null} ELSE notes END,
        status     = CASE WHEN ${status !== undefined} THEN ${status ?? null} ELSE status END,
        updated_at = NOW()
      WHERE id = ${id}
    `);

    void ccAudit({
      adminId:  req.session.adminId,
      ticketId: id,
      action:   'ticket_updated',
      details:  { fields: { notes: notes !== undefined, status } },
      ip:       clientIp(req),
    });

    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, 'CC patch ticket error');
    res.status(500).json({ error: 'Failed to update ticket.' });
  }
});

// ── POST /api/admin/cc/tickets/:id/send-otp ───────────────────────────────────

router.post('/cc/tickets/:id/send-otp', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  try {
    const tR = await db.execute(sql`
      SELECT id, customer_id, customer_phone, status,
             identity_verified, pin_reset_approved,
             otp_send_count, otp_last_sent_at
      FROM support_tickets WHERE id = ${id} LIMIT 1
    `);
    if (!tR.rows.length) { res.status(404).json({ error: 'Ticket not found.' }); return; }
    const t = tR.rows[0] as {
      id: string; customer_id: string; customer_phone: string; status: string;
      identity_verified: boolean; pin_reset_approved: boolean;
      otp_send_count: number; otp_last_sent_at: string | null;
    };

    if (t.identity_verified) {
      res.status(409).json({ error: 'Identity already verified for this ticket.' });
      return;
    }
    if (['resolved', 'closed', 'approved'].includes(t.status)) {
      res.status(409).json({ error: `Cannot send OTP on a ${t.status} ticket.` });
      return;
    }
    if (t.otp_send_count >= MAX_OTP_SENDS) {
      res.status(429).json({
        error: `Maximum of ${MAX_OTP_SENDS} OTPs reached for this ticket. Close and reopen to reset.`,
      });
      return;
    }
    if (t.otp_last_sent_at) {
      const elapsed  = Date.now() - new Date(t.otp_last_sent_at).getTime();
      const waitSecs = Math.ceil((OTP_COOLDOWN_MS - elapsed) / 1000);
      if (elapsed < OTP_COOLDOWN_MS) {
        res.status(429).json({ error: `Please wait ${waitSecs}s before resending.`, waitSeconds: waitSecs });
        return;
      }
    }

    const otp        = genOTP();
    const otpHash    = await bcrypt.hash(otp, 10);
    const otpExpiry  = new Date(Date.now() + OTP_EXPIRY_MS);
    const newCount   = t.otp_send_count + 1;

    await db.execute(sql`
      UPDATE support_tickets SET
        otp_hash          = ${otpHash},
        otp_expiry        = ${otpExpiry.toISOString()},
        otp_attempts      = 0,
        otp_send_count    = ${newCount},
        otp_last_sent_at  = NOW(),
        status            = 'pending_verification',
        updated_at        = NOW()
      WHERE id = ${id}
    `);

    void ccAudit({
      adminId:    req.session.adminId,
      ticketId:   id,
      customerId: t.customer_id,
      action:     'otp_sent',
      details:    { phone: t.customer_phone, sendCount: newCount },
      ip:         clientIp(req),
    });

    // In production this OTP would be delivered via SMS to t.customer_phone.
    // Returned in dev only — never log it.
    const isDev = process.env['NODE_ENV'] !== 'production';
    logger.info({ ticketId: id, phone: t.customer_phone }, 'Identity OTP generated (plaintext not logged)');

    res.json({
      ok:             true,
      phone:          t.customer_phone,
      expiresAt:      otpExpiry.toISOString(),
      sendsRemaining: MAX_OTP_SENDS - newCount,
      ...(isDev ? { devOtp: otp } : {}),
    });
  } catch (err) {
    logger.error({ err }, 'CC send OTP error');
    res.status(500).json({ error: 'Failed to send OTP.' });
  }
});

// ── POST /api/admin/cc/tickets/:id/verify-otp ─────────────────────────────────

router.post('/cc/tickets/:id/verify-otp', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { otp } = req.body as { otp?: string };

  if (!otp || !/^\d{6}$/.test(otp)) {
    res.status(400).json({ error: 'OTP must be exactly 6 digits.' });
    return;
  }

  try {
    const tR = await db.execute(sql`
      SELECT id, customer_id, customer_name, identity_verified,
             otp_hash, otp_expiry, otp_attempts
      FROM support_tickets WHERE id = ${id} LIMIT 1
    `);
    if (!tR.rows.length) { res.status(404).json({ error: 'Ticket not found.' }); return; }
    const t = tR.rows[0] as {
      id: string; customer_id: string; customer_name: string;
      identity_verified: boolean; otp_hash: string | null;
      otp_expiry: string | null; otp_attempts: number;
    };

    if (t.identity_verified) { res.status(409).json({ error: 'Already verified.' }); return; }
    if (!t.otp_hash || !t.otp_expiry) {
      res.status(400).json({ error: 'No OTP has been sent yet.' }); return;
    }
    if (t.otp_attempts >= MAX_OTP_ATTEMPTS) {
      res.status(429).json({ error: 'Too many failed attempts. Send a new OTP.' }); return;
    }
    if (new Date(t.otp_expiry) < new Date()) {
      res.status(400).json({ error: 'OTP expired. Send a new one.' }); return;
    }

    const match = await bcrypt.compare(otp, t.otp_hash);
    if (!match) {
      const attempts = t.otp_attempts + 1;
      await db.execute(sql`
        UPDATE support_tickets SET otp_attempts = ${attempts}, updated_at = NOW() WHERE id = ${id}
      `);
      void ccAudit({
        adminId:    req.session.adminId,
        ticketId:   id,
        customerId: t.customer_id,
        action:     'otp_verification_failed',
        details:    { attempt: attempts, remaining: MAX_OTP_ATTEMPTS - attempts },
        ip:         clientIp(req),
      });
      res.status(400).json({
        error:             'Incorrect OTP.',
        attemptsRemaining: MAX_OTP_ATTEMPTS - attempts,
      });
      return;
    }

    // ✓ Correct — mark verified, clear OTP
    await db.execute(sql`
      UPDATE support_tickets SET
        identity_verified = true,
        otp_hash          = null,
        otp_expiry        = null,
        status            = 'verified',
        updated_at        = NOW()
      WHERE id = ${id}
    `);
    void ccAudit({
      adminId:    req.session.adminId,
      ticketId:   id,
      customerId: t.customer_id,
      action:     'identity_verified',
      details:    { customerName: t.customer_name },
      ip:         clientIp(req),
    });

    res.json({ ok: true, message: 'Identity successfully verified.' });
  } catch (err) {
    logger.error({ err }, 'CC verify OTP error');
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// ── POST /api/admin/cc/tickets/:id/approve-reset ──────────────────────────────

router.post('/cc/tickets/:id/approve-reset', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { confirm } = req.body as { confirm?: boolean };
  if (!confirm) {
    res.status(400).json({ error: '{ confirm: true } is required to approve a PIN reset.' });
    return;
  }

  try {
    const tR = await db.execute(sql`
      SELECT id, customer_id, customer_phone, customer_name,
             identity_verified, pin_reset_approved, status
      FROM support_tickets WHERE id = ${id} LIMIT 1
    `);
    if (!tR.rows.length) { res.status(404).json({ error: 'Ticket not found.' }); return; }
    const t = tR.rows[0] as {
      id: string; customer_id: string; customer_phone: string; customer_name: string;
      identity_verified: boolean; pin_reset_approved: boolean; status: string;
    };

    if (!t.identity_verified) {
      res.status(403).json({ error: 'Customer identity must be verified before approving a PIN reset.' });
      return;
    }
    if (t.pin_reset_approved) {
      res.status(409).json({ error: 'PIN reset has already been approved for this ticket.' });
      return;
    }
    if (['resolved', 'closed'].includes(t.status)) {
      res.status(409).json({ error: `Cannot approve reset on a ${t.status} ticket.` });
      return;
    }

    // Generate a customer-facing reset OTP (1-hour window)
    const resetOtp     = genOTP();
    const resetOtpHash = await bcrypt.hash(resetOtp, 10);
    const resetExpiry  = new Date(Date.now() + RESET_OTP_EXPIRY_MS);

    // Store hashed on the user — customer uses existing Forgot PIN → enter code flow
    await db.execute(sql`
      UPDATE users SET
        reset_otp_hash   = ${resetOtpHash},
        reset_otp_expiry = ${resetExpiry.toISOString()},
        updated_at       = NOW()
      WHERE id = ${t.customer_id}
    `);

    // Mark ticket approved
    await db.execute(sql`
      UPDATE support_tickets SET
        pin_reset_approved    = true,
        pin_reset_approved_at = NOW(),
        status                = 'approved',
        updated_at            = NOW()
      WHERE id = ${id}
    `);

    void ccAudit({
      adminId:    req.session.adminId,
      ticketId:   id,
      customerId: t.customer_id,
      action:     'pin_reset_approved',
      details:    { customerName: t.customer_name, customerPhone: t.customer_phone },
      ip:         clientIp(req),
    });

    logger.info({ ticketId: id, customerId: t.customer_id }, 'PIN reset approved — OTP not logged');

    // Return reset OTP to CC staff for relay to customer.
    // Customer enters it in: App → Forgot PIN → enter phone → enter this code → new PIN.
    res.json({
      ok:          true,
      resetOtp,
      customerPhone: t.customer_phone,
      expiresAt:   resetExpiry.toISOString(),
      instruction: `Give this 6-digit code to ${t.customer_name}. They should open the GY DATA app, tap "Forgot PIN", enter their phone number (${t.customer_phone}), then enter this code — do NOT tap "Send OTP" again — and create a new PIN. Valid for 1 hour.`,
    });
  } catch (err) {
    logger.error({ err }, 'CC approve reset error');
    res.status(500).json({ error: 'Failed to approve PIN reset.' });
  }
});

// ── GET /api/admin/cc/audit-logs ─────────────────────────────────────────────

router.get('/cc/audit-logs', async (req: Request, res: Response): Promise<void> => {
  const ticketId   = (req.query['ticketId']   as string) ?? null;
  const customerId = (req.query['customerId'] as string) ?? null;
  const page  = Math.max(1, parseInt((req.query['page'] as string) ?? '1', 10));
  const limit = 30;
  const offset = (page - 1) * limit;

  try {
    const where = ticketId
      ? sql`WHERE ticket_id = ${ticketId}`
      : customerId
        ? sql`WHERE customer_id = ${customerId}`
        : sql``;

    const countR = await db.execute(sql`SELECT COUNT(*) AS total FROM support_audit_logs ${where}`);
    const total  = parseInt(String((countR.rows[0] as Record<string, unknown>)['total'] ?? '0'), 10);

    const rows = await db.execute(sql`
      SELECT id, ticket_id, customer_id, action, performed_by, performed_by_name,
             details, ip_address, created_at
      FROM support_audit_logs
      ${where}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    res.json({ logs: rows.rows, total, page, limit });
  } catch (err) {
    logger.error({ err }, 'CC audit logs error');
    res.status(500).json({ error: 'Failed to load audit logs.' });
  }
});

export default router;
