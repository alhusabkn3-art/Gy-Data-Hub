---
name: Router ordering & shared-path middleware
description: Express routers mounted at the same base path (/admin) — blanket middleware intercepts ALL sub-paths, not just routes defined in that router.
---

## The Rule
When multiple routers are mounted at the same base path (`app.use("/admin", routerA)`, `app.use("/admin", routerB)`), any `router.use(middleware)` inside routerA runs for ALL `/admin/*` requests — even those destined for routerB — if routerA is mounted first and the middleware calls `res.status(403).send()` instead of `next()`.

## Why It Matters
The project has `admin-super.ts` with `router.use(requireSuperAdmin)` and `admin-finance.ts` with `router.use(requireFinanceOrSuperAdmin)`, both mounted at `/admin`. This blocked CC staff and finance staff from accessing their own routes.

## The Fix Applied
1. Reorder mounts so specialized routers (CC, Finance, SupportInbox) come BEFORE admin-super.
2. Mount support-inbox at `/admin/support-inbox` (not `/admin`) to avoid finance middleware interception.
3. Apply CC middleware path-specifically: `router.use('/cc', requireCCSession)` instead of `router.use(requireCCSession)` so finance staff hitting `/admin/finance/*` don't trigger CC auth.

## How to Apply
- When adding a new router at `/admin`, check whether its middleware would block other routers sharing the same base.
- Prefer path-specific middleware (`router.use('/specific-prefix', middleware)`) over blanket `router.use(middleware)` when sharing a base path.
- Mount order in `routes/index.ts` is authoritative: CC → Inbox → Finance → admin-super.
