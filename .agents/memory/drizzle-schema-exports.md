---
name: Drizzle schema named exports and TypeScript project references
description: api-server tsc requires lib/db to be built first before schema table exports resolve
---

## Rule
When adding new Drizzle schema files to `lib/db/src/schema/`, run `pnpm --filter @workspace/db exec tsc --build` before running `pnpm --filter @workspace/api-server exec tsc --noEmit`.

**Why:** The api-server's `tsconfig.json` uses TypeScript project references (`"references": [{ "path": "../../lib/db" }]`). The lib/db package has `"composite": true` and `"emitDeclarationOnly": true`. TypeScript uses the pre-built `.d.ts` files (in `lib/db/dist/`) to resolve types for the api-server. If new schema files are added but lib/db hasn't been rebuilt, the api-server sees stale type information and reports "has no exported member" for the new table exports.

**How to apply:** After editing any file in `lib/db/src/schema/`, run `tsc --build` on lib/db first, then typecheck api-server.
