# Deferred Items — Phase 24

Out-of-scope issues discovered during execution but not fixed (SCOPE BOUNDARY:
only auto-fix issues directly caused by the current task's changes).

## Plan 24-01

- **`npx tsc --noEmit` pre-existing errors in `tests/study-cards.test.ts`** (lines 132, 169:
  `Parameter 'c' implicitly has an 'any' type`) — predate this plan (last touched in Phase 23,
  commit `59a584a`), unrelated to `scripts/diagnose-freshness.mts`. Confirmed these two errors
  are the *only* `tsc --noEmit` errors remaining after running `npx prisma generate` (which was
  needed to resolve the `@/app/generated/prisma/client` module-not-found errors that appear in a
  fresh worktree before the Prisma client is generated — not a real bug, just a generated-output
  gitignore artifact). Not fixed here; out of this plan's file scope (`package.json`,
  `package-lock.json`, `scripts/diagnose-freshness.mts` only).
