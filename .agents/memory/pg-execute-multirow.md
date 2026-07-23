---
name: node-postgres execute multi-row access
description: db.execute() returns Promise<QueryResult>; .rows must be accessed on the resolved value, not the Promise.
---

## The Rule
`db.execute<T>(sql`...`)` returns `Promise<pg.QueryResult<T>>`.

- **Single-row**: `const x = (await db.execute<T>(sql`...`)).rows[0];`
- **Multi-row**: `const rows = (await db.execute<T>(sql`...`)).rows;`

## What NOT to Write
```typescript
// WRONG — .rows accessed on Promise, returns undefined
const rows = await db.execute<T>(sql`...`).rows;

// WRONG — destructuring a QueryResult (not iterable)
const [x] = await db.execute<T>(sql`...`);
```

## Why It Matters
`await db.execute(...).rows` parses as `await (db.execute(...).rows)` — accessing `.rows` on the Promise object (before awaiting), which returns `undefined`. Then `await undefined` = `undefined`. All finance routes returned 500 or empty data due to this bug.

## How to Apply
- Always wrap the entire `db.execute()` call in parens before `await`: `(await db.execute(...))`.
- For `tx.execute()` inside transactions: same pattern.
- INSERT/UPDATE/DELETE without result collection can use bare `await db.execute(...)`.
- admin-cc.ts already uses `.rows` pattern correctly throughout (reference implementation).
