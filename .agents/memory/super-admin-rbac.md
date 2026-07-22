---
name: Super Admin RBAC architecture
description: How role-based access control is implemented for the GY DATA admin dashboard — DB tables, session fields, middleware, seeding, and frontend gating.
---

## Rule
The admin system uses two persistent DB tables (`admin_accounts`, `admin_audit_logs`) and two roles (`super_admin`, `admin`). Roles are enforced server-side via `requireSuperAdmin` middleware. The frontend uses the role only for UI gating.

**Why:** The prior system was purely in-memory (reset on restart). The user explicitly required backend enforcement, not just frontend hiding.

## How to apply
- All admin logins go through `POST /api/admin/session` → validates against `admin_accounts` table using bcryptjs
- Session stores `adminId` (string) and `adminRole` ('super_admin' | 'admin')
- `requireAdmin` middleware: checks `req.session.isAdmin`
- `requireSuperAdmin` middleware: additionally checks `req.session.adminRole === 'super_admin'`
- Super-admin-only routes: `GET/POST/PATCH/DELETE /api/admin/admins/*` and `GET /api/admin/audit-logs`
- Super admin is auto-seeded from ADMIN_EMAIL/ADMIN_PIN env vars on first login attempt if no record exists

## Key decisions
- bcryptjs (not bcrypt) is used for PIN hashing — bcrypt native is in esbuild externals and won't bundle
- `req.session.adminId` needs `!` non-null assertion in route handlers (safe since `requireAdmin` runs first)
- Dynamic Drizzle `.set()` calls use `Partial<InsertAdminAccount>` type cast, NOT `Parameters<...>[0]`
- Super admin account cannot be deleted or demoted via API (enforced server-side)
- Admin cannot self-disable or self-delete (enforced server-side)
- Audit log `adminEmail` field is denormalised — audit history survives account deletion

## Frontend gating
- `AdminContext` exposes `adminRole` and `isSuperAdmin` derived from login response
- Sidebar filters nav items via `superOnly` flag on each nav item — only super_admin sees "Admin Management" and "Audit Logs"
- Both pages (`AdminManagement`, `AdminAuditLogs`) show a "Super Admin Access Required" lock screen if role check fails — belt-and-suspenders
- `AdminApp.tsx` `navigate()` function blocks routing to super-admin pages for non-super-admins

## Self-profile endpoints (any admin)
- `PATCH /api/admin/me` — update own name/email
- `PATCH /api/admin/me/pin` — change own PIN (verifies current PIN server-side, not client-side)
- `AdminSettings.tsx` uses `changeOwnPin` and `updateOwnProfile` from context — no in-memory comparison
