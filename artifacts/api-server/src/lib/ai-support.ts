/**
 * AI Support Assistant — OpenAI GPT-4o via Replit AI Integrations proxy.
 *
 * Provides automated first-response for customer support conversations.
 * Strictly prohibited from revealing internal system details, making
 * financial commitments, or impersonating human agents.
 */
import OpenAI from 'openai';
import { logger } from './logger.js';

const SYSTEM_PROMPT = `You are a helpful customer support assistant for GY DATA, a Nigerian data and airtime top-up platform.

CAPABILITIES:
- Answer questions about our services: data plans, airtime top-up, wallet funding, transaction history.
- Guide users through common issues: how to fund wallet, how to purchase data, how to check balance.
- Explain transaction statuses and help users understand their transaction history.
- Provide general information about supported networks (MTN, Airtel, Glo, 9mobile).

STRICT RULES — NEVER VIOLATE:
1. NEVER reveal internal system details, source code, database structure, or admin credentials.
2. NEVER promise refunds, credits, or financial compensation — escalate these to a human agent.
3. NEVER impersonate a human agent. If asked directly "are you human?", answer honestly.
4. NEVER share other users' data or account information.
5. NEVER perform account actions (reset PIN, credit wallet, change email) — direct users to the app.
6. NEVER make up transaction details — only work with information provided in the conversation.
7. If a request is outside your capabilities, say so and offer to connect the user with a human agent.

ESCALATION TRIGGERS (respond with escalation_needed=true):
- PIN/account recovery requests
- Refund/reversal requests
- Fraud or unauthorized transaction claims
- Technical issues not resolved after 2 attempts
- Abusive or distressed users

Keep responses concise (under 200 words), friendly, and professional.
Respond in the same language the user writes in (English or Nigerian Pidgin).`;

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    // Use Replit AI Integrations proxy when OPENAI_API_KEY is not explicitly set.
    const apiKey = process.env['OPENAI_API_KEY'] ?? 'replit';
    const baseURL = process.env['OPENAI_API_KEY']
      ? undefined
      : 'https://replit-openai-proxy.replit.com/v1';

    client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  }
  return client;
}

export interface AiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AiResponse {
  reply: string;
  escalation_needed: boolean;
  tokens_used?: number;
}

/**
 * Generate an AI support reply given conversation history.
 * Returns { reply, escalation_needed } — callers decide what to do with escalation_needed.
 */
export async function generateSupportReply(
  history: AiMessage[],
  userMessage: string,
): Promise<AiResponse> {
  try {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...history.slice(-10).map((m) => ({ role: m.role, content: m.content })), // last 10 for context window
      { role: 'user', content: userMessage },
    ];

    const completion = await getClient().chat.completions.create({
      model: 'gpt-4o',
      messages,
      max_tokens: 400,
      temperature: 0.4,
    });

    const reply = completion.choices[0]?.message?.content?.trim() ?? 'I\'m sorry, I was unable to generate a response. Please try again.';
    const tokensUsed = completion.usage?.total_tokens;

    // Simple heuristic for escalation detection.
    const escalationKeywords = /refund|reversal|unauthorized|fraud|stolen|not received|pin reset|recover.*account|escalat|speak.*human|talk.*agent/i;
    const escalation_needed = escalationKeywords.test(userMessage) || escalationKeywords.test(reply);

    return { reply, escalation_needed, tokens_used: tokensUsed };
  } catch (err) {
    logger.error({ err }, 'AI support reply generation failed');
    return {
      reply: 'I\'m having trouble connecting right now. Please try again in a moment or ask to speak with a human agent.',
      escalation_needed: true,
    };
  }
}
