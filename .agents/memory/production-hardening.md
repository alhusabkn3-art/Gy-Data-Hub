---
name: Production hardening — all items complete
description: Full list of security and reliability fixes applied during production readiness sprint. Reference for future maintenance.
---

## What was done

### Security fixes applied
- **Session fixation**: `req.session.regenerate()` called before setting `userId` on login AND register. Helper `regenerateSession(req)` wraps callback in Promise.
- **CORS whitelist**: `app.ts` reads `CORS_ORIGINS` env var (comma-separated). In `NODE_ENV=production`, only listed origins pass. In dev, all origins pass.
- **Socket.io auth**: `io.engine.use(sessionMiddleware)` shares the Express session with sockets. `join` events validated against `socket.request.session.userId`; `join:admin` against `session.adminId + session.isAdmin`.
- **Price validation fail-closed**: `validateDataPrice()` catch block now returns `{ valid: false }` — never `{ valid: true }` on DB error.
- **Email validation**: `isValidEmail()` regex check on register; name length 2–100; PIN exactly 6 digits; username 4–15 letters.
- **Check-pin rate limit**: dedicated `rateLimit(10/15min)` on `/api/user/check-pin` in `app.ts`.
- **WhatsApp signature mandatory**: In production, missing `WHATSAPP_APP_SECRET` causes ALL webhook POSTs to return 403. In dev, warning is logged and requests pass.
- **Startup env validation**: `validateEnv()` in `lib/session-store.ts` checks required vars on startup; warns on optional missing vars; warns on insecure ADMIN_PIN in production.

### Database migrations applied (all idempotent)
24 new indexes on: transactions, wallet_ledger, funding_requests, notifications, transaction_reversals, admin_login_history, admin_sessions, users (email unique partial), pricing_rules, messages, conversations, session.
- `wallets` non-negative balance CHECK constraint added.
- `conversations.human_claimed_at TIMESTAMP WITH TIME ZONE` column added.

### Reliability
- **Stuck transaction recovery**: runs 10s after startup + every 15min. Finds pending data/airtime transactions >15min old, refunds wallet via `FOR UPDATE` transaction, logs to `wallet_ledger`.
- **WhatsApp outbound retry**: 10s `AbortController` timeout + one automatic retry after 2s.
- **Human lock on WhatsApp conv**: when admin replies, sets `human_claimed_at = NOW()` → AI stops auto-replying.
- **Media escalation**: image/audio/video/document inbound messages auto-escalate to human support.
- **AI auto-escalation after 6 messages**: prevents infinite AI loops.

### Shared session architecture
`lib/session-store.ts` exports `sessionStore`, `sessionMiddleware`, `validateEnv()`. Both `app.ts` and `index.ts` import from it. This is what enables Socket.io to read the same session as Express.

### Known pattern: db.execute() RowList
In esbuild bundles, `db.execute()` returns a postgres.js `RowList`. Use `Array.from(result)` before `for...of` to ensure reliable iteration.

**Why:** The postgres.js RowList is array-like but may not satisfy Symbol.iterator in all bundled contexts. `Array.from()` is always safe.

## Output files
- `PRODUCTION_READINESS_REPORT.md` — READY verdict with full details, limitations, post-deploy checklist
- `artifacts/api-server/REQUIRED_ENV.md` — complete env var reference with sources
