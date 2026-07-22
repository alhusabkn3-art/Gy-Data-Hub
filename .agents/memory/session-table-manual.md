---
name: Session table must be created manually
description: connect-pg-simple's createTableIfMissing silently fails in esbuild-bundled ESM output
---

## Rule
Do NOT rely on `createTableIfMissing: true` in the `connect-pg-simple` store config when using the api-server's esbuild bundle.

**Why:** `connect-pg-simple` reads its `table.sql` file with a relative `fs.readFileSync(path.join(__dirname, ...))` call. After esbuild bundles everything into a single `.mjs`, `__dirname` points to the `dist/` directory where the SQL file doesn't exist. The `createTableIfMissing` call silently does nothing — no error is thrown, no table is created, but sessions still appear to start (the `Set-Cookie` header is sent). Sessions are silently dropped on the next request because `store.set()` fails.

**How to apply:** Create the session table once via raw SQL (psql or a migration). The correct DDL is:
```sql
CREATE TABLE IF NOT EXISTS "session" (
  "sid"    varchar NOT NULL COLLATE "default",
  "sess"   json    NOT NULL,
  "expire" timestamp(6) NOT NULL,
  CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE
);
CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");
```
