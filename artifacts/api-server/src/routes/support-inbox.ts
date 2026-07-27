/**
 * /api/admin/support-inbox — Unified support inbox for admin/supervisor/technical_support.
 *
 * Manages conversations across WhatsApp and in-app chat channels.
 * All mutating actions are available to super_admin, admin, supervisor, technical_support.
 * Finance role is read-only and excluded from this router.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { getIo } from '../lib/socket.js';

const router = Router();

// ── Auth guard ─────────────────────────────────────────────────────────────

const INBOX_ROLES = new Set(['super_admin', 'admin', 'supervisor', 'technical_support', 'customer_care']);

function requireInboxAccess(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.isAdmin || !req.session.adminId) {
    res.status(401).json({ error: 'Unauthorised.' });
    return;
  }
  if (!INBOX_ROLES.has(req.session.adminRole ?? '')) {
    res.status(403).json({ error: 'Inbox access denied for your role.' });
    return;
  }
  next();
}

router.use(requireInboxAccess);

// ── GET /admin/support-inbox/conversations ────────────────────────────────

router.get('/conversations', async (req: Request, res: Response): Promise<void> => {
  try {
    const page   = Math.max(1, parseInt(String(req.query['page'] ?? '1')));
    const limit  = Math.min(100, Math.max(1, parseInt(String(req.query['limit'] ?? '30'))));
    const offset = (page - 1) * limit;
    const status  = req.query['status'] as string | undefined;
    const channel = req.query['channel'] as string | undefined;
    const mine    = req.query['mine'] === 'true';
    const adminId = req.session.adminId!;

    const rows = (await db.execute<Record<string, unknown>>(sql`
      SELECT
        c.*,
        a.name AS assigned_staff_name,
        a.email AS assigned_staff_email
      FROM conversations c
      LEFT JOIN admin_accounts a ON a.id = c.assigned_staff_id
      WHERE 1=1
        ${status  ? sql`AND c.status = ${status}` : sql``}
        ${channel ? sql`AND c.channel = ${channel}` : sql``}
        ${mine    ? sql`AND c.assigned_staff_id = ${adminId}::uuid` : sql``}
      ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `)).rows;

    const countRow = (await db.execute<{ total: string }>(sql`
      SELECT COUNT(*)::text AS total FROM conversations c
      WHERE 1=1
        ${status  ? sql`AND c.status = ${status}` : sql``}
        ${channel ? sql`AND c.channel = ${channel}` : sql``}
        ${mine    ? sql`AND c.assigned_staff_id = ${adminId}::uuid` : sql``}
    `)).rows[0];

    res.json({
      conversations: rows,
      pagination: {
        page,
        limit,
        total: parseInt(countRow?.total ?? '0'),
        totalPages: Math.ceil(parseInt(countRow?.total ?? '0') / limit),
      },
    });
  } catch (err) {
    logger.error({ err }, 'GET /support-inbox/conversations failed');
    res.status(500).json({ error: 'Failed to load conversations.' });
  }
});

// ── GET /admin/support-inbox/conversations/:id ────────────────────────────

router.get('/conversations/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const conv = (await db.execute<Record<string, unknown>>(sql`
      SELECT c.*, a.name AS assigned_staff_name
      FROM conversations c
      LEFT JOIN admin_accounts a ON a.id = c.assigned_staff_id
      WHERE c.id = ${id}::uuid
    `)).rows[0];

    if (!conv) { res.status(404).json({ error: 'Conversation not found.' }); return; }

    const messages = (await db.execute<Record<string, unknown>>(sql`
      SELECT * FROM messages
      WHERE conversation_id = ${id}::uuid
      ORDER BY created_at ASC
    `)).rows;

    // Mark as read (reset unread count)
    await db.execute(sql`
      UPDATE conversations SET unread_count = 0 WHERE id = ${id}::uuid
    `);

    res.json({ conversation: conv, messages });
  } catch (err) {
    logger.error({ err }, 'GET /support-inbox/conversations/:id failed');
    res.status(500).json({ error: 'Failed to load conversation.' });
  }
});

// ── POST /admin/support-inbox/conversations/:id/assign ────────────────────

router.post('/conversations/:id/assign', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { staff_id } = req.body as { staff_id?: string };
    const adminId = req.session.adminId!;

    await db.execute(sql`
      UPDATE conversations
      SET assigned_staff_id = ${staff_id ? sql`${staff_id}::uuid` : sql`NULL`},
          status = ${staff_id ? 'assigned' : 'open'},
          ai_handled = false,
          updated_at = NOW()
      WHERE id = ${id}::uuid
    `);

    try {
      getIo().to('admins').emit('conversation:assigned', { conversationId: id, staffId: staff_id ?? null });
      if (staff_id) getIo().to(`admin:${staff_id}`).emit('conversation:new_assignment', { conversationId: id });
    } catch { /* socket not ready */ }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'POST /support-inbox/conversations/:id/assign failed');
    res.status(500).json({ error: 'Failed to assign conversation.' });
  }
});

// ── POST /admin/support-inbox/conversations/:id/resolve ───────────────────

router.post('/conversations/:id/resolve', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    await db.execute(sql`
      UPDATE conversations
      SET status = 'resolved', updated_at = NOW()
      WHERE id = ${id}::uuid
    `);

    try {
      getIo().to('admins').emit('conversation:resolved', { conversationId: id });
      getIo().to(`conversation:${id}`).emit('conversation:resolved', { conversationId: id });
    } catch { /* socket not ready */ }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'POST /support-inbox/conversations/:id/resolve failed');
    res.status(500).json({ error: 'Failed to resolve conversation.' });
  }
});

// ── POST /admin/support-inbox/conversations/:id/messages ─────────────────

router.post('/conversations/:id/messages', async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { content } = req.body as { content?: string };
    const adminId = req.session.adminId!;

    if (!content?.trim()) {
      res.status(400).json({ error: 'content is required.' });
      return;
    }

    const conv = (await db.execute<{
      id: string;
      channel: string;
      customer_id: string | null;
      customer_phone: string;
      whatsapp_wa_id: string;
    }>(sql`
      SELECT id, channel, customer_id, customer_phone, whatsapp_wa_id FROM conversations WHERE id = ${id}::uuid
    `)).rows[0];
    if (!conv) { res.status(404).json({ error: 'Conversation not found.' }); return; }

    // Get sender name
    const admin = (await db.execute<{ name: string }>(sql`
      SELECT name FROM admin_accounts WHERE id = ${adminId}::uuid
    `)).rows[0];

    const newMsg = (await db.execute<Record<string, unknown>>(sql`
      INSERT INTO messages (conversation_id, content, sender_type, sender_id, sender_name, channel)
      VALUES (${id}::uuid, ${content.trim()}, 'admin', ${adminId}::uuid, ${admin?.name ?? 'Support Agent'}, ${conv.channel})
      RETURNING *
    `)).rows[0];

    await db.execute(sql`
      UPDATE conversations
      SET last_message = ${content.trim()}, last_message_at = NOW(), updated_at = NOW(), ai_handled = false
      WHERE id = ${id}::uuid
    `);

    // If WhatsApp conversation, send outbound message
    if (conv.channel === 'whatsapp' && conv.whatsapp_wa_id) {
      const ACCESS_TOKEN    = process.env['WHATSAPP_ACCESS_TOKEN'];
      const PHONE_NUMBER_ID = process.env['WHATSAPP_PHONE_NUMBER_ID'];
      if (ACCESS_TOKEN && PHONE_NUMBER_ID) {
        try {
          await fetch(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: conv.whatsapp_wa_id,
              type: 'text',
              text: { body: content.trim() },
            }),
          });
        } catch (err) {
          logger.warn({ err }, 'Failed to deliver WhatsApp reply from inbox');
        }
      }
    }

    // Emit real-time to conversation room + user room
    try {
      const io = getIo();
      io.to(`conversation:${id}`).emit('message:new', newMsg);
      io.to('admins').emit('conversation:update', { conversationId: id, lastMessage: content.trim() });
      if (conv['customer_id']) io.to(`user:${conv['customer_id']}`).emit('message:new', newMsg);
    } catch { /* socket not ready */ }

    res.json({ success: true, message: newMsg });
  } catch (err) {
    logger.error({ err }, 'POST /support-inbox/conversations/:id/messages failed');
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

// ── GET /admin/support-inbox/stats ────────────────────────────────────────

router.get('/stats', async (_req: Request, res: Response): Promise<void> => {
  try {
    const stats = (await db.execute<Record<string, string>>(sql`
      SELECT
        COUNT(*)::text AS total,
        COUNT(CASE WHEN status = 'open' THEN 1 END)::text AS open_count,
        COUNT(CASE WHEN status = 'assigned' THEN 1 END)::text AS assigned_count,
        COUNT(CASE WHEN status = 'resolved' THEN 1 END)::text AS resolved_count,
        COUNT(CASE WHEN status = 'open' AND ai_handled THEN 1 END)::text AS ai_handled_count,
        COUNT(CASE WHEN channel = 'whatsapp' THEN 1 END)::text AS whatsapp_count,
        COUNT(CASE WHEN channel = 'in_app' THEN 1 END)::text AS in_app_count,
        SUM(unread_count)::text AS total_unread
      FROM conversations
    `)).rows[0];
    res.json(stats ?? {});
  } catch (err) {
    logger.error({ err }, 'GET /support-inbox/stats failed');
    res.status(500).json({ error: 'Failed to load inbox stats.' });
  }
});

export default router;
