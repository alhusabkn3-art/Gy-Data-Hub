---
name: Enterprise Admin Panel Build
description: Decisions and patterns from the 11-module enterprise upgrade of the GY DATA Super Admin panel
---

## Key decisions

**New backend routes:** Always append to `admin-super.ts` (never edit `admin.ts` except for session hooks). All new queries use `db.execute(sql`...`)` — no Drizzle schema imports for new tables.

**Why:** Drizzle tsc build requires lib/db to be built first; raw sql avoids the dependency chain for ad-hoc tables.

**Frontend subagents:** Use `$kind: 'general'` (not 'build') for write-enabled subagents.

**Export pattern:** Client-side CSV via `exportToCsv()` and printable HTML via `exportToHtmlPrint()` in adminApi.ts — no server-side xlsx required.

**Admin login history:** Hooked into `POST /api/admin/session` via fire-and-forget `db.execute().catch(()=>{})` to avoid breaking login on table errors.

**Route ordering:** `/pricing/bulk` MUST be registered before `/pricing/:id` to avoid Express matching 'bulk' as an id.

**2FA:** Stub implementation — stores secret in system_settings, verifies any 6-digit token. Full TOTP deferred.

**API Management configs:** Reads from system_settings DB with process.env as fallback for Clubkonnect/Monnify secrets.

**New tables (raw psql, not Drizzle):** staff_members, staff_attendance, staff_activity_logs, pricing_rules, funding_requests, admin_login_history, admin_sessions.
