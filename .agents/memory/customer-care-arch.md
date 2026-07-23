---
name: Customer Care System Architecture
description: Full CC/Support ticket system — DB tables, backend routes, frontend panel, OTP flows, PIN reset approval
---

# Customer Care System

## Database Tables (raw SQL — no Drizzle schema files)
- `support_tickets` — ticket_number (TKT-XXXXXXXX), customer_id, status, otp_hash/expiry/attempts/send_count, identity_verified, pin_reset_approved
- `support_audit_logs` — ticket_id, customer_id, action, performed_by, performed_by_name, details (jsonb), ip_address

## Role: `customer_care`
- Added to `admin_role` pgEnum (via raw ALTER TYPE — already executed)
- Added to `lib/db/src/schema/admin-accounts.ts` adminRoleEnum array
- Added to `artifacts/api-server/src/types/session.d.ts` adminRole union
- ROLE_LABELS/ROLE_COLORS/ROLE_PERMISSIONS updated in adminMockData.ts
- AdminApp: CC staff default to `customerCare` page; blocked from non-CC pages

## Backend: `artifacts/api-server/src/routes/admin-cc.ts`
Mounted at `/api/admin` (via routes/index.ts).
- All routes guarded by `requireCCSession` (any admin role)
- `GET /cc/search?q=` — safe customer lookup (no PIN/OTP fields ever returned)
- `GET /cc/stats` — header counts
- `GET/POST /cc/tickets` — list + create (blocks duplicate open tickets)
- `GET/PATCH /cc/tickets/:id` — detail (strips otp_hash) + update
- `POST /cc/tickets/:id/send-otp` — max 3 sends, 2-min cooldown, 5-min OTP expiry; returns `devOtp` in non-prod
- `POST /cc/tickets/:id/verify-otp` — bcryptjs compare, max 5 attempts; on success sets identity_verified=true, status='verified'
- `POST /cc/tickets/:id/approve-reset` — requires identity_verified; generates 1-hour reset OTP, stores as resetOtpHash on user; returns reset code to CC staff
- `GET /cc/audit-logs` — paginated, filterable by ticketId or customerId

## PIN Reset Integration
- CC approval stores hashed reset OTP in `users.reset_otp_hash` with 1-hour expiry
- Modified `forgot-pin/request` (auth.ts): if valid OTP exists with >5-min remaining (CC-set), does NOT overwrite — returns `{ ok: true }`
- Customer uses existing Forgot PIN flow without clicking "Send OTP" again

**Why:** Preserving CC-set OTPs prevents the customer from accidentally overwriting a CC-generated code by clicking self-service "Send OTP."

## Frontend: `artifacts/gy-data/src/admin/pages/CustomerCarePanel.tsx`
- Split layout: ticket list (left) + detail/create (right) on desktop; single-column mobile
- `CreateTicketForm` — customer search → fill reason/notes → submit (blocks if active ticket exists)
- `TicketDetailView` — customer profile card, OTP flow, approval section, reset code display, audit trail
- Dev mode: `devOtp` shown in amber box; reset code always shown to CC staff
- `AuditLogTab` — paginated full audit log

## AdminLayout nav
- "Customer Care" nav item (Headset icon) added to BASE_NAV, superOnly: false
