# GY DATA

A Nigerian data/airtime purchase platform. Users fund a wallet and use it to buy mobile data, airtime, electricity, cable TV, and other VTU (Value Top-Up) services.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React 19 + Vite 7 + Tailwind CSS v4 + shadcn/ui |
| Backend | Express 5 + Socket.io + Pino logging |
| Database | PostgreSQL via Drizzle ORM |
| Monorepo | pnpm workspaces |

## Artifacts

- **`artifacts/gy-data`** — React/Vite web app (preview path: `/`)
- **`artifacts/api-server`** — Express API server (preview path: `/api`, port: `8080`)

## Libraries

- **`lib/db`** — Drizzle schema + postgres.js client
- **`lib/api-zod`** — Zod validators shared between API and frontend
- **`lib/api-spec`** — OpenAPI spec + Orval codegen config
- **`lib/api-client-react`** — Auto-generated React Query hooks

## Running locally

Dependencies are installed with `pnpm install` from the workspace root.

Both workflows start automatically:
- **API Server**: `PORT=8080 pnpm --filter @workspace/api-server run dev`
- **Web**: `PORT=24579 pnpm --filter @workspace/gy-data run dev`

## Database setup

On a fresh environment, run:
```bash
psql "$DATABASE_URL" -f db/bootstrap.sql
```

Then start the API server — it seeds the super-admin account on first boot using `ADMIN_EMAIL` and `ADMIN_PIN` env vars.

## Required environment variables

See `artifacts/api-server/REQUIRED_ENV.md` for the full list.

**Must-have to start:**
- `SESSION_SECRET` — random 32+ char string
- `DATABASE_URL` — PostgreSQL connection string

**Optional (features disabled without them):**
- `MONNIFY_*` — wallet funding via Monnify
- `CLUBKONNECT_*` — data/airtime purchases
- `WHATSAPP_*` — WhatsApp notifications
- `OPENAI_API_KEY` — AI support assistant
- `ADMIN_EMAIL` / `ADMIN_PIN` — super-admin bootstrap credentials

## User preferences

- Keep the existing monorepo structure — do not restructure or migrate to a different stack
