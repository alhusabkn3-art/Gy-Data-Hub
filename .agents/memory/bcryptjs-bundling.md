---
name: bcrypt vs bcryptjs in api-server
description: Must use bcryptjs (pure JS) not bcrypt (native binary) in the esbuild bundle
---

## Rule
Always install and import `bcryptjs`, never `bcrypt`, in `artifacts/api-server`.

**Why:** `bcrypt` is a native Node.js addon. It is in the `external` list in `artifacts/api-server/build.mjs`, which means esbuild will NOT bundle it — it remains a runtime `require('bcrypt')` that would need to be in `node_modules` at the dist output location. This fails in production. `bcryptjs` is a pure-JS drop-in replacement that bundles cleanly.

**How to apply:** Import as `import bcrypt from 'bcryptjs'`. The API is identical to `bcrypt`. Types: `@types/bcryptjs`.
