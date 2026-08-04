# Gy-Data-Hub — Deploying to Render

This document describes step-by-step Render deployment instructions, required environment variables, webhook URLs, and a post-deployment verification checklist.

---

## Quick overview
We deploy a single Render Web Service built from `artifacts/api-server/Dockerfile`. The Dockerfile builds the frontend (Vite) at `artifacts/gy-data` and the backend (`artifacts/api-server`), copies the frontend `dist` into the server image under `/app/public`, and runs the Express server (`dist/index.mjs`) which will serve both API routes and the built SPA.

---

## Step-by-step Render deployment

1. Push the repository to your `main` branch (or branch configured in Render).
2. In the Render dashboard, create a new service:
   - Type: Web Service
   - Name: gy-data (or your preferred name)
   - Environment: Docker
   - Branch: main
   - Dockerfile Path: `artifacts/api-server/Dockerfile`
   - Instance: choose appropriate plan
   - Health check path: `/health`
   - Auto deploy: enabled (optional)
3. In Render Dashboard > Environment > Environment Variables, add the variables listed below (use real secrets; do NOT commit them to Git).
4. Deploy the service (Render will run the Docker build defined by `artifacts/api-server/Dockerfile`).
5. After the build completes, use Logs (Render console) to confirm server started successfully and that the service passed health checks.

---

## Required Render environment variables

Core / server
- NODE_ENV=production
- PORT=3000
- DATABASE_URL=postgres://<user>:<password>@<host>:<port>/<dbname> (required)
- PGSSLMODE (optional)
- SESSION_SECRET=<long_random_value> (required)
- SESSION_COOKIE_NAME=gyd_sid (optional)
- SESSION_COOKIE_SECURE=true (recommended)
- CORS_ORIGINS=https://yourdomain.com (production allowed origins)
- JWT_SECRET (if used)

Monnify (payment gateway)
- MONNIFY_BASE_URL (optional; default sandbox)
- MONNIFY_API_KEY
- MONNIFY_SECRET_KEY
- MONNIFY_CONTRACT_CODE
- MONNIFY_WEBHOOK_SECRET (if your Monnify webhook uses a secret header)

ClubKonnect (airtime/data provider)
- CLUBKONNECT_USER_ID
- CLUBKONNECT_API_KEY
- CLUBKONNECT_BASE_URL (optional)
- CLUBKONNECT_WEBHOOK_SECRET (if you configure webhooks)

Optional / integrations
- OPENAI_API_KEY (if used)
- SENTRY_DSN (optional)
- WHATSAPP_ACCESS_TOKEN
- WHATSAPP_PHONE_NUMBER_ID
- WHATSAPP_BUSINESS_ACCOUNT_ID
- WHATSAPP_WEBHOOK_VERIFY_TOKEN
- WHATSAPP_APP_SECRET
- ADMIN_EMAIL
- ADMIN_PIN
- LOG_LEVEL (e.g., info, debug)

Note: `.env.example` in repo root contains placeholders for all of the above.

---

## Monnify webhook URL
- Configure Monnify dashboard webhook to:
  - POST to: `https://<your-render-domain>/api/payment/monnify/webhook`
  - The server verifies Monnify HMAC signature using `MONNIFY_SECRET_KEY` (read from env).

---

## ClubKonnect webhook URL
- If ClubKonnect offers webhooks, configure the webhook to:
  - POST to: `https://<your-render-domain>/api/clubkonnect/webhook` (or the route your integration uses)
- Note: this repo’s ClubKonnect client is primarily query-string server calls and a recovery job; verify your desired webhook path if you plan to use push notifications.

---

## Post-deployment verification checklist

1. Health checks and basic endpoints
   - GET `https://<your-render-domain>/health` → 200 OK
   - GET `https://<your-render-domain>/` → returns index.html (SPA served)
   - GET `https://<your-render-domain>/api/clubkonnect/balance` (if ClubKonnect creds set) → returns balance or auth error

2. Database & sessions
   - Confirm Postgres DB reachable via `DATABASE_URL`.
   - Confirm `session` table exists and sessions persist (connect-pg-simple).
   - Test user login/register to verify cookies are set (HttpOnly, Secure).

3. Monnify payment flow (sandbox)
   - Initialize wallet funding via `/api/payment/monnify/initialize`.
   - Confirm `checkoutUrl` is returned and sandbox payment flow can be simulated.
   - Confirm webhook arrives to `/api/payment/monnify/webhook` and signature verifies.
   - Confirm wallet credited only after server-side verifyTransaction returns PAID.

4. ClubKonnect purchase flow
   - Using test creds, perform a data/airtime purchase and confirm:
     - DB transaction created and status updated appropriately (pending -> success/failed).
     - Stuck-transaction recovery job can query provider statuses.

5. Logging / Observability
   - Confirm logs stream in Render and LOG_LEVEL is appropriate.
   - Confirm Sentry (if configured) receives errors.

6. Security checks
   - Confirm `SESSION_SECRET` is long and random.
   - Confirm `SESSION_COOKIE_SECURE=true` and site served over HTTPS.
   - Confirm CORS_ORIGINS is set to production domains.

---

## Troubleshooting common errors

- Docker/build failures: check Render build logs. Common causes:
  - Missing workspace deps, private registries needing auth, or memory limits.
- DB errors: verify `DATABASE_URL`, `PGSSLMODE`, and networking.
- Webhook signature verification errors: ensure raw body is sent and secret matches env var.

---

## Additional notes

- All sensitive values are environment variables; `.env.example` contains placeholders.
- The repo uses a pnpm monorepo; the Docker build uses corepack/pnpm to build both frontend and backend.
- If you prefer a separate frontend service, revert to a two-service configuration and use `artifacts/gy-data/Dockerfile` for the frontend.
- Ensure your DB migrations are applied prior to production traffic.
