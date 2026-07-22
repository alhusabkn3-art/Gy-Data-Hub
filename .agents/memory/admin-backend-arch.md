---
name: Admin backend architecture
description: How admin API endpoints are secured and how admin context fetches real data
---

## Admin session security

- `POST /api/admin/session` — validates email+pin, sets `req.session.isAdmin = true`
- All `/api/admin/*` data endpoints use `requireAdmin` middleware checking `req.session.isAdmin`
- Credentials validated against `ADMIN_EMAIL` / `ADMIN_PIN` env vars (default: admin@gyd.com / 125125)
- Session type extended in `artifacts/api-server/src/types/session.d.ts` with `isAdmin?: boolean`

**Why:** Admin routes share the same session store as customer routes. This avoids a separate auth system while keeping full separation — customer sessions never gain admin access.

## AdminContext dual-auth flow

Frontend `adminLogin()`:
1. Fast local check against `adminCredentials` (same default values)
2. Calls `POST /api/admin/session` to establish backend session
3. If backend rejects → login fails even if local check passed
4. On success → parallel fetch of stats + revenue + services + users + transactions

**Why:** Local check keeps UX snappy; backend session is required for all data endpoints.

## Admin data endpoints

All at `/api/admin/*`:
- `GET /stats` — aggregate counts from users/wallets/transactions tables
- `GET /revenue/weekly` — last 7 days, grouped by day, service txns only
- `GET /services` — breakdown by txn type with success/pending/failed counts
- `GET /users?search&status&kyc&page&limit=50` — paginated, LEFT JOIN wallets+transactions
- `GET /transactions?search&status&type&page&limit=50` — paginated, JOIN users
- `PATCH /users/:id/status` — suspend or activate a user

## Frontend loading pattern

- `stats: AdminStats | null` — null until loaded, drives skeleton display
- `isLoading && !stats` → show skeletons (first load)
- `isLoading && stats` → stale data still shown (refresh)
- Empty states shown when arrays are length 0 after loading completes

## Dynamic SQL with Drizzle

Use incremental `sql` template literal composition for dynamic WHERE clauses:
```ts
let cond = sql`1=1`;
if (search) cond = sql`${cond} AND u.name ILIKE ${`%${search}%`}`;
if (status !== 'all') cond = sql`${cond} AND u.status = ${status}`;
```
This is safe (parameterized) and avoids raw string interpolation.

## Service display config

`SERVICE_CONFIG` in adminMockData.ts maps type → { label, icon, color }.
Real counts come from backend. Never hardcode transaction counts or revenue in the frontend.
