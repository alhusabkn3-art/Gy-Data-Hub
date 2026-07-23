/**
 * /api/support — Customer-facing in-app support chat.
 *
 * Authenticated customers can open and send messages in their own
 * support conversation. AI auto-replies; escalates to human when needed.
 */
import { Router, type Request, type Response } from 'express';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { generateSupportReply } from '../lib/ai-support.js';
import { getIo } from '../lib/socket.js';
import { requireAuth } from './user.js';

const router = Router();
router.use(requireAuth);

// ── GET /api/support/conversation ─────────────────────────────────────────
// Get the current user's open/active conversation (or null if none).

router.get('/conversation', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.session.userId!;

    const [conv] = await db.execute<Record<string, unknown>>(sql`
      SELECT c.*, a.name AS assigned_staff_name
      FROM conversations c
      LEFT JOIN admin_accounts a ON a.id = c.assigned_staff_id
      WHERE c.customer_id = ${userId}::uuid
        AND c.channel = 'in_app'
        AND c.status NOT IN ('closed')
      ORDER BY c.created_at DESC
      LIMIT 1
    `);

    if (!conv) {
      res.json({ conversation: null, messages: [] });
      return;
    }

    const messages = await db.execute<Record<string, unknown>>(sql`
      SELECT * FROM messages
      WHERE conversation_id = ${conv['id']}::uuid
      ORDER BY created_at ASC
    `);

    res.json({ conversation: conv, messages });
  } catch (err) {
    logger.error({ err }, 'GET /support/conversation failed');
    res.status(500).json({ error: 'Failed to load conversation.' });
  }
});

// ── POST /api/support/conversation ───────────────────────────────────────
// Start a new support conversation (or reopen if closed).

router.post('/conversation', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const { subject } = req.body as { subject?: string };

    // Fetch user info
    const [user] = await db.execute<{ name: string; phone: string }>(sql`
      SELECT name, phone FROM users WHERE id = ${userId}::uuid
    `);
    if (!user) { res.status(404).json({ error: 'User not found.' }); return; }

    // Check for an active conversation
    const [existing] = await db.execute<{ id: string }>(sql`
      SELECT id FROM conversations
      WHERE customer_id = ${userId}::uuid AND channel = 'in_app' AND status NOT IN ('closed')
      LIMIT 1
    `);

    if (existing) {
      res.json({ conversationId: existing.id, existing: true });
      return;
    }

    const [conv] = await db.execute<{ id: string }>(sql`
      INSERT INTO conversations
        (channel, status, customer_id, customer_name, customer_phone, ai_handled, subject)
      VALUES ('in_app', 'open', ${userId}::uuid, ${user.name}, ${user.phone}, true, ${subject ?? 'Customer Support'})
      RETURNING id
    `);

    // Emit to admins so inbox updates live
    try {
      getIo().to('admins').emit('conversation:new', {
        conversationId: conv!.id,
        channel: 'in_app',
        customerName: user.name,
        customerPhone: user.phone,
      });
    } catch { /* socket not ready */ }

    res.json({ conversationId: conv!.id, existing: false });
  } catch (err) {
    logger.error({ err }, 'POST /support/conversation failed');
    res.status(500).json({ error: 'Failed to start conversation.' });
  }
});

// ── POST /api/support/conversation/message ───────────────────────────────
// Send a message and get an AI reply.

router.post('/conversation/message', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const { content } = req.body as { content?: string };

    if (!content?.trim()) {
      res.status(400).json({ error: 'content is required.' });
      return;
    }

    // Get active conversation
    const [conv] = await db.execute<{ id: string; ai_handled: boolean; status: string }>(sql`
      SELECT id, ai_handled, status FROM conversations
      WHERE customer_id = ${userId}::uuid AND channel = 'in_app' AND status NOT IN ('closed')
      LIMIT 1
    `);

    if (!conv) {
      res.status(404).json({ error: 'No active conversation found. Start one first.' });
      return;
    }

    const [user] = await db.execute<{ name: string }>(sql`SELECT name FROM users WHERE id = ${userId}::uuid`);

    // Insert customer message
    const [customerMsg] = await db.execute<Record<string, unknown>>(sql`
      INSERT INTO messages (conversation_id, content, sender_type, sender_id, sender_name, channel)
      VALUES (${conv.id}::uuid, ${content.trim()}, 'user', ${userId}::uuid, ${user?.name ?? 'Customer'}, 'in_app')
      RETURNING *
    `);

    await db.execute(sql`
      UPDATE conversations
      SET last_message = ${content.trim()}, last_message_at = NOW(),
          unread_count = unread_count + 1, updated_at = NOW()
      WHERE id = ${conv.id}::uuid
    `);

    // Notify admins real-time
    try {
      getIo().to('admins').emit('conversation:update', {
        conversationId: conv.id,
        lastMessage: content.trim(),
        senderType: 'user',
      });
    } catch { /* socket not ready */ }

    let aiReply: string | null = null;
    let escalated = false;

    // Generate AI reply when ai_handled is true
    if (conv.ai_handled) {
      const history = await db.execute<{ content: string; sender_type: string }>(sql`
        SELECT content, sender_type FROM messages
        WHERE conversation_id = ${conv.id}::uuid
        ORDER BY created_at DESC LIMIT 10
      `);

      const aiHistory = history.reverse().map((m) => ({
        role: m.sender_type === 'user' ? 'user' as const : 'assistant' as const,
        content: m.content,
      }));

      const { reply, escalation_needed } = await generateSupportReply(aiHistory, content.trim());
      aiReply = reply;
      escalated = escalation_needed;

      // Store AI message
      const [aiMsg] = await db.execute<Record<string, unknown>>(sql`
        INSERT INTO messages (conversation_id, content, sender_type, sender_name, channel)
        VALUES (${conv.id}::uuid, ${reply}, 'ai', 'GY DATA Support', 'in_app')
        RETURNING *
      `);

      await db.execute(sql`
        UPDATE conversations SET last_message = ${reply}, last_message_at = NOW(), updated_at = NOW()
        WHERE id = ${conv.id}::uuid
      `);

      if (escalation_needed) {
        await db.execute(sql`
          UPDATE conversations
          SET ai_handled = false, status = 'open', updated_at = NOW()
          WHERE id = ${conv.id}::uuid
        `);
        try {
          getIo().to('admins').emit('conversation:escalated', {
            conversationId: conv.id,
            reason: 'AI escalation trigger',
            channel: 'in_app',
          });
        } catch { /* socket not ready */ }
      }

      // Emit AI message to user
      try {
        getIo().to(`user:${userId}`).emit('message:new', aiMsg);
        getIo().to(`conversation:${conv.id}`).emit('message:new', aiMsg);
      } catch { /* socket not ready */ }
    }

    res.json({
      success: true,
      message: customerMsg,
      ai_reply: aiReply,
      escalated,
    });
  } catch (err) {
    logger.error({ err }, 'POST /support/conversation/message failed');
    res.status(500).json({ error: 'Failed to send message.' });
  }
});

// ── GET /api/support/conversation/messages ────────────────────────────────
// Poll for messages in the active conversation.

router.get('/conversation/messages', async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.session.userId!;
    const after  = req.query['after'] as string | undefined; // ISO timestamp for polling

    const [conv] = await db.execute<{ id: string }>(sql`
      SELECT id FROM conversations
      WHERE customer_id = ${userId}::uuid AND channel = 'in_app' AND status NOT IN ('closed')
      LIMIT 1
    `);
    if (!conv) { res.json({ messages: [] }); return; }

    const messages = await db.execute<Record<string, unknown>>(sql`
      SELECT * FROM messages
      WHERE conversation_id = ${conv.id}::uuid
        ${after ? sql`AND created_at > ${after}::timestamptz` : sql``}
      ORDER BY created_at ASC
    `);

    res.json({ messages, conversationId: conv.id });
  } catch (err) {
    logger.error({ err }, 'GET /support/conversation/messages failed');
    res.status(500).json({ error: 'Failed to load messages.' });
  }
});

export default router;
