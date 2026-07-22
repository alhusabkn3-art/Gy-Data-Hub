---
name: Notification Center architecture
description: Layer boundaries, data flow, and extension points for the notification system.
---

## Pattern

```
Server (createNotification helper)
  ↓ fires on every purchase success/failure and wallet fund
REST API (GET/PATCH/DELETE /api/user/notifications/*)
  ↓
AppContext (transformNotification → Notification shape)
  ↓
useNotifications hook  ← ALL UI must go through this hook, never AppContext directly
  ↓
NotificationsScreen / badges
  ↓ (on tap of transaction notification with refId)
TransactionDetailModal (bottom sheet, looks up txn by refId in context.transactions)
```

## Key decisions

- `refreshNotifications()` is called (fire-and-forget via `void`) after every airtime purchase, data purchase, and wallet fund success so the new server-created notification appears immediately.
- `DELETE /api/user/notifications` (clear all) must be declared **before** `DELETE /api/user/notifications/:id` in Express route order or it gets absorbed as a param route.
- `refId` in notifications is a free-text column (not a FK) storing the linked transaction UUID; the UI looks it up in `context.transactions` by id.
- `notifications.ts` helper in api-server is intentionally non-fatal: it logs errors but never throws, so a DB hiccup during notification insert can't break a purchase flow.
- `useNotifications` hook is the swap point: replace its body to migrate to push notifications (FCM/APNs) without touching any UI component.

## Drizzle schema reminder

Any time `lib/db/src/schema/notifications.ts` (or any schema file) is changed, run:
```
cd lib/db && pnpm exec tsc --build
```
before running `tsc --noEmit` in api-server — otherwise the new column types won't resolve.

## Notification type → icon mapping (in NotificationsScreen)

| condition on title (lowercase) | Icon | accent colour |
|---|---|---|
| includes "failed" / "unsuccessful" | XCircle | red |
| includes "pending" | Clock | amber |
| includes "fund" / "funded" / "wallet" | ArrowDownLeft | emerald |
| includes "cashback" / "refund" / "return" / "reversed" | RotateCcw | indigo |
| includes "airtime" | Zap | green |
| includes "data" | Wifi | green |
| (other transaction) | CheckCircle2 | green |
| type === "promo" | Gift | pink |
| type === "security" | ShieldAlert | amber |
| type === "system" | Bell | blue |
