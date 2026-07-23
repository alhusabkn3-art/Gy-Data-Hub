---
name: Drizzle execute RowList iteration
description: db.execute() returns a postgres.js RowList that must be wrapped in Array.from() before for-of in esbuild bundles.
---

## Rule
When iterating over the result of `db.execute(sql`...`)` with `for...of`, always wrap with `Array.from()` first:

```typescript
const rawRows = await db.execute<MyType>(sql`SELECT ...`);
const rows = Array.from(rawRows); // safe to for-of
for (const row of rows) { ... }
```

## Why
`db.execute()` with the postgres.js Drizzle driver returns a `RowList`, which is array-like (supports index access and `.length`) but may not satisfy `Symbol.iterator` reliably after esbuild bundling. The result is a `TypeError: stuckRows is not iterable` at runtime.

Destructuring (`const [first] = await db.execute(...)`) works fine because it uses index access, not the iterator protocol.

## How to apply
Any time you write a `for...of` loop over a `db.execute()` result, wrap with `Array.from()`. Single-element destructuring is fine without the wrapper.
