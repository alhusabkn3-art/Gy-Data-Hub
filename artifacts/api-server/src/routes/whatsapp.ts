/**
 * /api/whatsapp — WhatsApp Cloud API webhook + outbound messaging.
 *
 * Environment variables required:
 *   WHATSAPP_ACCESS_TOKEN          — Meta Graph API bearer token
 *   WHATSAPP_PHONE_NUMBER_ID       — WhatsApp Business phone number ID
 *   WHATSAPP_BUSINESS_ACCOUNT_ID   — WhatsApp Business account ID
 *   WHATSAPP_WEBHOOK_VERIFY_TOKEN  — Token you set in Meta Developer console
 *   WHATSAPP_APP_SECRET            — App secret for HMAC-SHA256 signature verification
 *                                    (REQUIRED in production — missing = all webhooks rejected)
 *
 * Security:
 *   - In production, WHATSAPP_APP_SECRET is required. Missing = 403 for all webhook POSTs.
 *   - Signature verification uses crypto.timingSafeEqual to prevent timing attacks.
 *   - Inbound messages are deduplicated by whatsapp_msg_id (handles Meta retries).
 *   - Outgoing messages have a 10 s timeout and one automatic retry.
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
const IS_PRODUCTION   = process.env['NODE_ENV'] === 'production';

const GRAPH_API_BASE  = 'https://graph.facebook.com/v19.0';
const WA_MSG_MAX_CHARS = 4096; // WhatsApp text message limit

// ── Signature verification ────────────────────────────────────────────────────
//
// In PRODUCTION: APP_SECRET is required. Requests without a valid signature are
// rejected immediately. This prevents webhook spoofing.
// In DEVELOPMENT: If APP_SECRET is not set, verification is skipped (dev mode).

function verifySignature(rawBody: string, signature: string): boolean {
  if (!APP_SECRET) {
    if (IS_PRODUCTION) {
      // Production without secret = reject everything (fail secure)
      logger.error('WHATSAPP_APP_SECRET is not set in production — all webhook requests rejected');
      return false;
    }
    // Development without secret = allow (dev convenience)
    logger.warn('WhatsApp signature verification skipped (development mode, APP_SECRET not set)');
    return true;
  }
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
    logger.info('WhatsApp webhook verified successfully');
    res.status(200).send(challenge);
  } else {
    logger.warn({ mode, tokenMatch: token === VERIFY_TOKEN }, 'WhatsApp webhook verification failed');
    res.status(403).send('Forbidden');
  }
});

// ── POST /api/whatsapp/webhook — Receive inbound messages from Meta ─────────

router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  // Always respond 200 quickly — Meta retries if we don't acknowledge promptly.
  res.status(200).send('EVENT_RECEIVED');

  const signature = (req.headers['x-hub-signature-256'] ?? '') as string;
  const rawBody   = (req as Request & { rawBody?: string }).rawBody ?? JSON.stringify(req.body);

  if (!verifySignature(rawBody, signature)) {
    logger.warn({ signature: signature.slice(0, 20) }, 'WhatsApp webhook rejected: signature mismatch or missing APP_SECRET');
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
        const value    = change['value'] as Record<string, unknown>;
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
  const waId        = msg['from'] as string;
  const msgId       = msg['id'] as string;
  const msgType     = msg['type'] as string;
  const contact     = contacts.find((c) => (c['wa_id'] as string) === waId);
  const profileName = (contact?.['profile'] as Record<string, unknown>)?.['name'] as string | undefined;

  // Map message type to text content
  let textContent = '';
  let isMedia     = false;

  if (msgType === 'text') {
    textContent = ((msg['text'] as Record<string, unknown>)?.['body'] as string) ?? '';
  } else if (msgType === 'interactive') {
    const interactive = msg['interactive'] as Record<string, unknown>;
    const buttonReply = (interactive?.['button_reply'] as Record<string, unknown>)?.['title'] as string | undefined;
    const listReply   = (interactive?.['list_reply'] as Record<string, unknown>)?.['title'] as string | undefined;
    textContent = buttonReply ?? listReply ?? JSON.stringify(interactive);
  } else {
    // Media/other message types — acknowledge and escalate
    isMedia = true;
    const typeLabels: Record<string, string> = {
      image: '[Image received]', document: '[Document received]',
      audio: '[Audio received]', video: '[Video received]',
      sticker: '[Sticker received]', location: '[Location received]',
    };
    textContent = typeLabels[msgType] ?? `[${msgType} message]`;
  }

  logger.info({ waId, msgId, msgType }, 'Inbound WhatsApp message');

  // ── Deduplication: prevent double-processing on Meta retries ─────────────
  const [existingMsg] = await db.execute<{ id: string }>(sql`
    SELECT id FROM messages WHERE whatsapp_msg_id = ${msgId} LIMIT 1
  `);
  if (existingMsg) {
    logger.debug({ msgId }, 'Duplicate WhatsApp message — skipping (already processed)');
    return;
  }

  // ── Find or create conversation ───────────────────────────────────────────
  let [conv] = await db.execute<{ id: string; ai_handled: boolean; status: string; human_claimed_at: string | null }>(sql`
    SELECT id, ai_handled, status, human_claimed_at FROM conversations WHERE whatsapp_wa_id = ${waId} LIMIT 1
  `);

  if (!conv) {
    const [user] = await db.execute<{ id: string; name: string }>(sql`
      SELECT id, name FROM users WHERE phone = ${waId} OR phone = ${'234' + waId.slice(1)} LIMIT 1
    `);
    const [newConv] = await db.execute<{ id: string; ai_handled: boolean; status: string; human_claimed_at: string | null }>(sql`
      INSERT INTO conversations
        (channel, status, customer_id, customer_name, customer_phone, whatsapp_wa_id, ai_handled)
      VALUES
        ('whatsapp', 'open', ${user?.id ?? null}, ${profileName ?? user?.name ?? 'WhatsApp User'},
         ${waId}, ${waId}, true)
      RETURNING id, ai_handled, status, human_claimed_at
    `);
    conv = newConv!;
  }

  // ── Store inbound message ─────────────────────────────────────────────────
  await db.execute(sql`
    INSERT INTO messages (conversation_id, content, sender_type, sender_name, channel, whatsapp_msg_id)
    VALUES (${conv.id}, ${textContent}, 'user', ${profileName ?? 'Customer'}, 'whatsapp', ${msgId})
  `);

  await db.execute(sql`
    UPDATE conversations
    SET last_message = ${textContent}, last_message_at = NOW(),
        unread_count = unread_count + 1, updated_at = NOW()
    WHERE id = ${conv.id}
  `);

  // Notify admin socket
  try {
    getIo().to('admins').emit('conversation:update', {
      conversationId: conv.id, channel: 'whatsapp',
      lastMessage: textContent, customerName: profileName ?? 'WhatsApp User', waId,
    });
  } catch { /* Socket not ready */ }

  // ── Media → auto-escalate (no AI reply for media) ────────────────────────
  if (isMedia) {
    await escalateConversation(conv.id, waId, 'Customer sent a media message requiring human review');
    await sendWhatsAppMessageWithRetry(
      waId,
      'Thank you for your message. Our support team will review it and respond shortly.'
    );
    return;
  }

  // ── Check message count for auto-escalation ───────────────────────────────
  const [msgCount] = await db.execute<{ count: string }>(sql`
    SELECT COUNT(*)::text AS count FROM messages
    WHERE conversation_id = ${conv.id} AND sender_type = 'user'
  `);
  const userMsgCount = parseInt(msgCount?.count ?? '0');

  // Auto-escalate after 6 unanswered user messages in a conversation
  if (userMsgCount >= 6 && conv.ai_handled && !conv.human_claimed_at) {
    await escalateConversation(conv.id, waId, `Customer sent ${userMsgCount} messages without resolution`);
    await sendWhatsAppMessageWithRetry(
      waId,
      'Your request has been escalated to our support team. A staff member will respond within a few minutes.'
    );
    return;
  }

  // ── AI auto-reply — only if NOT human-claimed and ai_handled ─────────────
  if (conv.ai_handled && !conv.human_claimed_at && conv.status === 'open') {
    await sendAiReply(conv.id, waId, textContent);
  }
}

async function escalateConversation(conversationId: string, waId: string, reason: string): Promise<void> {
  await db.execute(sql`
    UPDATE conversations
    SET ai_handled = false, status = 'open', updated_at = NOW()
    WHERE id = ${conversationId}
  `);
  try {
    getIo().to('admins').emit('conversation:escalated', { conversationId, waId, reason });
  } catch { /* Socket not ready */ }
  logger.info({ conversationId, reason }, 'Conversation escalated to human support');
}

async function sendAiReply(conversationId: string, waId: string, userMessage: string): Promise<void> {
  try {
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

    await db.execute(sql`
      INSERT INTO messages (conversation_id, content, sender_type, sender_name, channel)
      VALUES (${conversationId}, ${reply}, 'ai', 'GY DATA Support', 'whatsapp')
    `);

    await sendWhatsAppMessageWithRetry(waId, reply);

    if (escalation_needed) {
      await escalateConversation(conversationId, waId, 'AI detected escalation trigger in conversation');
      await sendWhatsAppMessageWithRetry(
        waId,
        'Your request has been passed to our support team. A staff member will respond within a few minutes.'
      );
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

  // Validate message length (WhatsApp limit)
  if (message.length > WA_MSG_MAX_CHARS) {
    res.status(400).json({ error: `Message cannot exceed ${WA_MSG_MAX_CHARS} characters.` });
    return;
  }

  // Basic E.164 phone number validation
  if (!/^\+?\d{7,15}$/.test(to.replace(/\s/g, ''))) {
    res.status(400).json({ error: 'Invalid phone number format.' });
    return;
  }

  try {
    await sendWhatsAppMessageWithRetry(to, message);

    if (conversationId) {
      await db.execute(sql`
        INSERT INTO messages (conversation_id, content, sender_type, sender_id, sender_name, channel)
        VALUES (${conversationId}, ${message}, 'admin', ${req.session.adminId!}, 'Support Agent', 'whatsapp')
      `);
      // Human staff replied → lock conversation from AI and set human_claimed_at
      await db.execute(sql`
        UPDATE conversations
        SET last_message = ${message}, last_message_at = NOW(), updated_at = NOW(),
            ai_handled = false,
            human_claimed_at = COALESCE(human_claimed_at, NOW())
        WHERE id = ${conversationId}
      `);
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'POST /whatsapp/send failed');
    res.status(500).json({ error: 'Failed to send WhatsApp message.' });
  }
});

// ── Internal: send with timeout + one retry ───────────────────────────────────

async function sendWhatsAppMessageWithRetry(to: string, text: string, attempt = 1): Promise<void> {
  if (!ACCESS_TOKEN || !PHONE_NUMBER_ID) {
    logger.warn({ to }, 'WhatsApp credentials not configured — message not sent');
    return;
  }

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 10_000); // 10 s timeout

  try {
    const url  = `${GRAPH_API_BASE}/${PHONE_NUMBER_ID}/messages`;
    const body = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: false, body: text.slice(0, WA_MSG_MAX_CHARS) },
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`WhatsApp API error ${response.status}: ${errBody}`);
    }
  } catch (err) {
    if (attempt < 2) {
      logger.warn({ to, attempt }, 'WhatsApp send failed — retrying once');
      await new Promise(r => setTimeout(r, 2000));
      return sendWhatsAppMessageWithRetry(to, text, attempt + 1);
    }
    logger.error({ err, to }, 'WhatsApp message delivery failed after retry');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export default router;
