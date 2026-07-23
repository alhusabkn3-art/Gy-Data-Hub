/**
 * /api/whatsapp — WhatsApp Cloud API webhook + outbound messaging.
 *
 * Environment variables required (set when going live):
 *   WHATSAPP_ACCESS_TOKEN          — Meta Graph API bearer token
 *   WHATSAPP_PHONE_NUMBER_ID       — WhatsApp Business phone number ID
 *   WHATSAPP_BUSINESS_ACCOUNT_ID   — WhatsApp Business account ID
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN  — Token you set in Meta Developer console
 *   WHATSAPP_APP_SECRET            — App secret for HMAC-SHA256 signature verification
 *
 * When these vars are not set the webhook still registers successfully but
 * incoming messages are logged and no-op'd (credential-ready mode).
 */
import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { db } from '@workspace/db';
import { sql } from 'drizzle-orm';
import { logger } from '../lib/logger.js';
import { generateSupportReply } from '../lib/ai-support.js';
import { getIo } from '../lib/socket.js';

const router = Router();

const ACCESS_TOKEN    = process.env['WHATSAPP_ACCESS_TOKEN'];
const PHONE_NUMBER_ID = process.env['WHATSAPP_PHONE_NUMBER_ID'];
const VERIFY_TOKEN    = process.env['WHATSAPP_WEBHOOK_VERIFY_TOKEN'];
const APP_SECRET      = process.env['WHATSAPP_APP_SECRET'];

const GRAPH_API_BASE  = 'https://graph.facebook.com/v19.0';

// ── Verify webhook signature from Meta ────────────────────────────────────

function verifySignature(rawBody: string, signature: string): boolean {
  if (!APP_SECRET) return true; // credential-ready: skip verification
  const expected = `sha256=${crypto.createHmac('sha256', APP_SECRET).update(rawBody).digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ── GET /api/whatsapp/webhook — Meta webhook verification challenge ─────────

router.get('/webhook', (req: Request, res: Response): void => {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (!VERIFY_TOKEN) {
    logger.warn('WhatsApp VERIFY_TOKEN not set — rejecting webhook verification');
    res.status(403).send('Forbidden');
    return;
  }

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    logger.info('WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
});

// ── POST /api/whatsapp/webhook — Receive inbound messages from Meta ─────────

router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  // Always respond 200 quickly — Meta retries if we don't.
  res.status(200).send('EVENT_RECEIVED');

  const signature = (req.headers['x-hub-signature-256'] ?? '') as string;
  if (APP_SECRET && !verifySignature(req.rawBody ?? JSON.stringify(req.body), signature)) {
    logger.warn({ signature }, 'WhatsApp webhook signature verification failed — ignoring');
    return;
  }

  try {
    const body = req.body as Record<string, unknown>;
    if (body['object'] !== 'whatsapp_business_account') return;

    const entries = (body['entry'] as Record<string, unknown>[]) ?? [];
    for (const entry of entries) {
      const changes = (entry['changes'] as Record<string, unknown>[]) ?? [];
      for (const change of changes) {
        if (change['field'] !== 'messages') continue;
        const value = change['value'] as Record<string, unknown>;
        const messages = (value['messages'] as Record<string, unknown>[]) ?? [];
        const contacts = (value['contacts'] as Record<string, unknown>[]) ?? [];

        for (const msg of messages) {
          await handleInboundMessage(msg, contacts);
        }
      }
    }
  } catch (err) {
    logger.error({ err }, 'WhatsApp webhook processing error');
  }
});

async function handleInboundMessage(
  msg: Record<string, unknown>,
  contacts: Record<string, unknown>[],
): Promise<void> {
  const waId       = msg['from'] as string;
  const msgId      = msg['id'] as string;
  const msgType    = msg['type'] as string;
  const contact    = contacts.find((c) => (c['wa_id'] as string) === waId);
  const profileName = (contact?.['profile'] as Record<string, unknown>)?.['name'] as string | undefined;

  let textContent = '';
  if (msgType === 'text') {
    textContent = ((msg['text'] as Record<string, unknown>)?.['body'] as string) ?? '';
  } else if (msgType === 'interactive') {
    const interactive = msg['interactive'] as Record<string, unknown>;
    textContent = JSON.stringify(interactive);
  } else {
    textContent = `[${msgType} message]`;
  }

  logger.info({ waId, msgId, msgType, textContent }, 'Inbound WhatsApp message');

  // Deduplicate by whatsapp_msg_id
  const [existingMsg] = await db.execute<{ id: string }>(sql`
    SELECT id FROM messages WHERE whatsapp_msg_id = ${msgId} LIMIT 1
  `);
  if (existingMsg) return; // already processed (Meta retry)

  // Find or create conversation for this WhatsApp contact
  let [conv] = await db.execute<{ id: string; ai_handled: boolean; status: string }>(sql`
    SELECT id, ai_handled, status FROM conversations WHERE whatsapp_wa_id = ${waId} LIMIT 1
  `);

  if (!conv) {
    // Try to match by phone number to a registered user
    const [user] = await db.execute<{ id: string; name: string }>(sql`
      SELECT id, name FROM users WHERE phone = ${waId} OR phone = ${'234' + waId.slice(1)} LIMIT 1
    `);

    const [newConv] = await db.execute<{ id: string; ai_handled: boolean; status: string }>(sql`
      INSERT INTO conversations
        (channel, status, customer_id, customer_name, customer_phone, whatsapp_wa_id, ai_handled)
      VALUES
        ('whatsapp', 'open', ${user?.id ?? null}, ${profileName ?? user?.name ?? 'WhatsApp User'},
         ${waId}, ${waId}, true)
      RETURNING id, ai_handled, status
    `);
    conv = newConv!;
  }

  // Store the inbound message
  await db.execute(sql`
    INSERT INTO messages (conversation_id, content, sender_type, sender_name, channel, whatsapp_msg_id)
    VALUES (${conv.id}, ${textContent}, 'user', ${profileName ?? 'Customer'}, 'whatsapp', ${msgId})
  `);

  // Update conversation last message + unread count
  await db.execute(sql`
    UPDATE conversations
    SET last_message = ${textContent}, last_message_at = NOW(),
        unread_count = unread_count + 1, updated_at = NOW()
    WHERE id = ${conv.id}
  `);

  // Emit to admin socket so inbox updates live
  try {
    getIo().to('admins').emit('conversation:update', {
      conversationId: conv.id,
      channel: 'whatsapp',
      lastMessage: textContent,
      customerName: profileName ?? 'WhatsApp User',
      waId,
    });
  } catch {
    // Socket not yet initialised — ok during startup
  }

  // AI auto-reply when conversation is ai_handled and open/unassigned
  if (conv.ai_handled && conv.status === 'open') {
    await sendAiReply(conv.id, waId, textContent);
  }
}

async function sendAiReply(conversationId: string, waId: string, userMessage: string): Promise<void> {
  try {
    // Fetch last 10 messages for context
    const history = await db.execute<{ content: string; sender_type: string }>(sql`
      SELECT content, sender_type FROM messages
      WHERE conversation_id = ${conversationId}
      ORDER BY created_at DESC LIMIT 10
    `);

    const aiHistory = history.reverse().map((m) => ({
      role: m.sender_type === 'user' ? 'user' as const : 'assistant' as const,
      content: m.content,
    }));

    const { reply, escalation_needed } = await generateSupportReply(aiHistory, userMessage);

    // Store AI reply as message
    const [aiMsg] = await db.execute<{ id: string }>(sql`
      INSERT INTO messages (conversation_id, content, sender_type, sender_name, channel)
      VALUES (${conversationId}, ${reply}, 'ai', 'GY DATA Support', 'whatsapp')
      RETURNING id
    `);

    // Send via WhatsApp Cloud API
    await sendWhatsAppMessage(waId, reply);

    if (escalation_needed) {
      await db.execute(sql`
        UPDATE conversations
        SET ai_handled = false, status = 'open', updated_at = NOW()
        WHERE id = ${conversationId}
      `);
      // Notify admins that this conversation needs human attention
      try {
        getIo().to('admins').emit('conversation:escalated', { conversationId, reason: 'AI detected escalation trigger' });
      } catch { /* socket not ready */ }
    }

    logger.info({ conversationId, waId, escalation_needed }, 'AI reply sent via WhatsApp');
  } catch (err) {
    logger.error({ err, conversationId }, 'AI WhatsApp reply failed');
  }
}

// ── POST /api/whatsapp/send — Send outbound message (admin use) ────────────

router.post('/send', async (req: Request, res: Response): Promise<void> => {
  if (!req.session.isAdmin) {
    res.status(401).json({ error: 'Unauthorised.' });
    return;
  }

  const { to, message, conversationId } = req.body as {
    to?: string; message?: string; conversationId?: string;
  };

  if (!to || !message) {
    res.status(400).json({ error: 'to and message are required.' });
    return;
  }

  try {
    await sendWhatsAppMessage(to, message);

    // Store outbound message if conversationId provided
    if (conversationId) {
      await db.execute(sql`
        INSERT INTO messages (conversation_id, content, sender_type, sender_id, sender_name, channel)
        VALUES (
          ${conversationId}, ${message}, 'admin',
          ${req.session.adminId!}, 'Support Agent', 'whatsapp'
        )
      `);
      await db.execute(sql`
        UPDATE conversations
        SET last_message = ${message}, last_message_at = NOW(), updated_at = NOW(), ai_handled = false
        WHERE id = ${conversationId}
      `);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'POST /whatsapp/send failed');
    res.status(500).json({ error: 'Failed to send WhatsApp message.' });
  }
});

async function sendWhatsAppMessage(to: string, text: string): Promise<void> {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    logger.warn({ to }, 'WhatsApp credentials not set — message not sent (credential-ready mode)');
    return;
  }

  const url = `${GRAPH_API_BASE}/${PHONE_NUMBER_ID}/messages`;
  const body = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: text },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`WhatsApp API error ${response.status}: ${errBody}`);
  }
}

export default router;
