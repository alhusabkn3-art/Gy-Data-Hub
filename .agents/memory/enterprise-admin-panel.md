---
name: Enterprise Admin Panel Build
description: Decisions, bugs fixed, and patterns from the 11-module enterprise upgrade of the GY DATA Super Admin panel
---

## Architecture decisions

**New backend routes:** Always append to `admin-super.ts` (never edit `admin.ts` except for session hooks). All new queries use `db.execute(sql`...`)` — no Drizzle schema imports for new tables.

**Why:** Drizzle tsc build requires lib/db to be built first; raw sql avoids the dependency chain for ad-hoc tables.

**Export pattern:** Client-side CSV via `exportToCsv()` and printable HTML via `exportToHtmlPrint()` in adminApi.ts — no server-side xlsx required.

**Admin login history:** Hooked into `POST /api/admin/session` via fire-and-forget `db.execute().catch(()=>{})`.

**Route ordering:** `/pricing/bulk` MUST be registered before `/pricing/:id` or Express matches 'bulk' as an id.

**2FA QR Code:** Backend returns secret; frontend constructs TOTP URI + uses `https://api.qrserver.com/v1/create-qr-code/` to render QR image. No extra npm package needed.

**Staff notifications:** Logged to admin_audit_logs via `sendTargetedNotification` context function → `/api/admin/notifications/targeted`.

**System settings toggles (Email Alerts, SMS Alerts, Debug Mode, 2FA):** All wired to PATCH /api/admin/settings via `apiUpdateSystemSetting`. Keys: email_alerts, sms_alerts, debug_mode, admin_2fa.

## Critical bugs that were fixed post-launch

**PATCH /staff/:id `undefined` in Drizzle sql template:** Drizzle's `sql` tag does NOT accept `undefined` values — they throw at runtime. Fix: Replace all `undefined` falsy branches in COALESCE ternaries with `null`. Pattern: `${x !== undefined ? val : null}` NOT `${x !== undefined ? val : undefined}`.

**Pricing bulk:** Frontend sends `{ rules: [...] }`, backend expects `{ rules: [...] }` — they match. DO NOT confuse with `{ updates: [...] }`.

**Attendance mark URL:** The API function `apiMarkAttendance` correctly uses `/staff/${staffId}/attendance`. The backend route is `POST /staff/:id/attendance`.

**SendMessageModal:** Originally used fake local `addAnnouncement` + 700ms timeout. Fixed to use `sendTargetedNotification([user.id], title, body)` from AdminContext → real `/api/admin/notifications/targeted` endpoint.

**Silent failure pattern:** All `catch { /* silent */ }` blocks were changed to either `toast.error(...)` (user-triggered actions) or `console.warn(...)` (background context refreshes).

## New tables (raw psql, not Drizzle)
staff_members, staff_attendance, staff_activity_logs, pricing_rules, funding_requests, admin_login_history, admin_sessions — all accessed via `db.execute(sql`...`)` pattern.

## Page inventory (11 modules)
- AdminDashboard — enhanced with Recharts charts, profit analytics, activity feed
- AdminUsers — enhanced with Login History tab, SendMessageModal wired to backend
- WalletManagement — enhanced with CSV export
- AdminNotifications — enhanced with Staff target, announcement banner
- AdminSettings — enhanced with App Branding, Referral/Commission, toggles wired to DB
- FinancialReports — enhanced with export CSV+PDF, profit card
- StaffManagement — new (3 tabs: Directory, Attendance, Activity)
- FinancePage — new (Monnify funding approval queue)
- PricingManagement — new (4 service types, inline editing, bulk save)
- APIManagement — new (config cards, live status check, error/tx logs)
- SecurityPage — new (login history, session revoke, 2FA with real QR)
