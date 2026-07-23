---
name: Shared session middleware
description: lib/session-store.ts exports the session middleware used by both Express and Socket.io to share authenticated session state for socket auth.
---

## Architecture
`artifacts/api-server/src/lib/session-store.ts` exports:
- `sessionStore` — the `connect-pg-simple` PgStore instance (shared between Express and the internal Drizzle pool)
- `sessionMiddleware` — the express-session instance configured with the shared store
- `validateEnv()` — startup environment variable validation

## How Express uses it
`app.ts`:
```typescript
import { sessionMiddleware } from './lib/session-store.js';
app.use(sessionMiddleware);
```

## How Socket.io uses it
`index.ts`:
```typescript
import { sessionMiddleware } from './lib/session-store.js';
const io = initSocket(httpServer);
io.engine.use(sessionMiddleware); // same middleware instance = same session cookie parsing
```

Then in socket event handlers:
```typescript
const sess = (socket.request as any).session;
if (sess?.userId !== claimedUserId) return; // IDOR prevention
```

## Why
Using `io.engine.use()` (not `io.use()`) ensures the session is parsed at the HTTP upgrade level, making `socket.request.session` available before any Socket.io event fires. Using the SAME `sessionMiddleware` instance means the same session store, secret, and cookie name — so the frontend's `gyd_sid` cookie is read by both Express routes and Socket.io connections.
