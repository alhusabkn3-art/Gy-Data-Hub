---
name: Backend hardening — all gaps filled
description: Complete list of what was added/fixed when hardening the api-server backend across Tasks 18/19/20/21 scope.
---

## What was added

### DB schema
- `conversations` table — WhatsApp + in-app chat, with `whatsapp_wa_id`, `ai_handled`, `assigned_staff_id` etc.
- `messages` table — per-conversation messages, `sender_type` = user/admin/ai/system
- `ALTER TYPE admin_role ADD VALUE 'supervisor'` + `'technical_support'`
- `ALTER TABLE admin_accounts ADD COLUMN phone / department`
- All other 15 tables (wallet_ledger, transaction_reversals, etc.) were already created by a previous migration session.

### New packages (added to api-server)
- `socket.io` — real-time WebSocket server
- `openai` — GPT-4o AI support assistant
- `express-rate-limit` — rate limiting

### New files
| File | Purpose |
|---|---|
| `src/lib/socket.ts` | Socket.io singleton (`initSocket`, `getIo`) |
| `src/lib/ai-support.ts` | OpenAI GPT-4o with strict support prompt + escalation detection |
| `src/routes/whatsapp.ts` | Meta webhook verify + receive + `/send`; AI auto-reply; credential-ready mode |
| `src/routes/support-inbox.ts` | Admin unified inbox: conversations CRUD, assign, resolve, reply |
| `src/routes/support-chat.ts` | Customer-facing in-app chat: start conv, send message, AI reply, poll |
| `src/routes/admin-finance.ts` | Finance/super-admin: overview, pricing audit log, transactions, funding requests |

### Updated files
| File | Change |
|---|---|
| `src/index.ts` | `http.createServer` + `initSocket`; socket auth/room join events |
| `src/app.ts` | `express-rate-limit` for auth/purchase/webhook/support/whatsapp |
| `src/lib/session.d.ts` | Added `finance \| supervisor \| technical_support` to `adminRole` union |
| `src/routes/index.ts` | Mounted all 5 new routers |
| `src/routes/admin.ts` | Added `from`, `to`, `phone` query filters to `GET /admin/transactions` |
| `src/routes/admin-super.ts` | Added `pricingAuditLog()` helper; pricing POST/PATCH/PATCH-bulk/DELETE now log diffs to `pricing_audit_logs` |
| `src/routes/purchase.ts` | `GET /purchase/pricing` (public); `validateDataPrice()` enforces DB price ±₦1 on data purchases; stores `cost_price` in transaction |

## Key invariants

**Price enforcement:** `validateDataPrice` looks up `pricing_rules` by `plan_id + network + service_type='data'`. If no rule found → allows unmanaged plan through. If rule found but `enabled=false` → 400. If price mismatch > ₦1 → 409 `price_mismatch` with `expectedPrice`.

**AI support (credential-ready):** `OPENAI_API_KEY` defaults to `'replit'` for Replit AI proxy. When WhatsApp creds (`WHATSAPP_ACCESS_TOKEN`, etc.) are not set, messages are received/processed but outbound send is no-op'd with a log warning.

**Socket rooms:** `user:{userId}`, `admin:{adminId}`, `admins` (broadcast), `conversation:{id}`.

**Finance role:** Read-only — `admin-finance.ts` uses `requireFinanceOrSuperAdmin`; no write access to pricing or wallets.

**Pricing audit:** Every POST/PATCH/DELETE on `pricing_rules` inserts a diff row in `pricing_audit_logs` via `pricingAuditLog()` helper (fire-and-forget with `void`).

**Rate limits:** auth 10/15min, purchase 30/min, monnify webhook 200/min, whatsapp webhook 500/min, support chat 60/min.
