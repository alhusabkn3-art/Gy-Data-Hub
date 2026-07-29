---
name: user_preferences table absent from bootstrap.sql
description: The user_preferences table was defined in the Drizzle schema but missing from bootstrap.sql and from the live DB, causing every user login to fail with 500 after PIN verification.
---

**Rule:** The `user_preferences` table must exist in the DB for `loadFullSession` in `auth.ts` to succeed. Its absence silently converts every correct-PIN login into a 500 → frontend sees "Incorrect PIN".

**Why:** `loadFullSession` queries `userPreferencesTable` unconditionally. A missing table throws a PostgreSQL "relation does not exist" error inside the login route, which returns 500. The frontend `login()` function treats any non-401 as 'wrong_pin'.

**How to apply:**
- The table is now in `db/bootstrap.sql` (added after the notifications block).
- `loadFullSession` now wraps the preferences query in try/catch so a missing or broken table never blocks login — it logs a warning and returns empty preferences.
- When adding new tables referenced in `loadFullSession` or any always-called path, always add them to `bootstrap.sql` immediately.
