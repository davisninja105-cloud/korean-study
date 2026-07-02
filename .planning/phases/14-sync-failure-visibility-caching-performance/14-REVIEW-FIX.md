---
phase: 14-sync-failure-visibility-caching-performance
fix_scope: all
iteration: 1
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
fixed_at: 2026-07-02T19:52:31Z
review_path: .planning/phases/14-sync-failure-visibility-caching-performance/14-REVIEW.md
---

# Phase 14: Code Review Fix Report

## Summary

All 4 in-scope findings (2 warnings, 2 info) were fixed and committed
atomically — one commit per finding, each staging only the source files
relevant to that finding (no `.planning/` artifacts staged).

The fixes address:

- **WR-01** — a stale-`keyToId`-entry behavior difference in the sync route's
  two-phase dependency-linking logic (a card that lost its components remained
  resolvable as a prerequisite, diverging from the original post-upsert
  re-query).
- **WR-02** — an information-disclosure in the sync route's outer `catch`
  (raw `err.message` was returned to the client, inconsistent with the phase's
  SYNC-01 sanitization goal).
- **IN-01** — a variable-shadowing maintenance hazard (inner `const created`
  Card row shadowed the outer `let created` lesson counter).
- **IN-02** — a misleading function name/docstring (`getRecentGlosses` implied
  recency ordering that the timestamp-less `Setting` table cannot provide).

**Verification:** Each fix was verified via Tier 1 (re-read modified section —
fix present, surrounding code intact) and Tier 2 (`tsc --noEmit -p tsconfig.json`).
No new type errors were introduced by any fix. The only `tsc` errors observed
are pre-existing and environmental — the worktree lacks the generated Prisma
client (`app/generated/prisma`, produced by `prisma generate` at build time and
not committed to git), so Prisma-typed queries resolve to `any`, producing
implicit-`any` errors in unrelated files and at `app/api/sync/route.ts:71`
(`.map((c) => c.normalizedFront)`). The error count was stable at 22 before and
after each fix, confirming none of the changes introduced new errors. The
`lib/gloss.ts` and `app/api/gloss/preload/route.ts` files produced zero `tsc`
errors after the IN-02 rename.

## Fixes Applied

### WR-01: Stale `keyToId` entries cause behavior difference in CardDependency edge creation

- **Commit:** ab92534
- **Action:** Added an `else` clause in the UPDATE branch of the upsert loop
  that calls `keyToId.delete(nf)` when `card.components.length === 0`. A card
  that loses its components (DB column set to `null`) is now removed from the
  lookup map so it is no longer resolvable as a prerequisite for the remainder
  of the request — matching the original post-upsert re-query's
  `where: { components: { not: null } }` semantics. The comment from the
  REVIEW.md fix snippet is included (necessary for clarity: explains *why* the
  delete is needed and ties it to the original re-query behavior).
- **Files changed:** `app/api/sync/route.ts`

### WR-02: Outer catch leaks raw error message to client (information disclosure)

- **Commit:** 9f0800e
- **Action:** Replaced the raw `err.message` 500 response with a generic
  `'Sync failed — see server logs for details'` message. The full error is now
  logged server-side via `console.error('Sync error:', err)` (logs the whole
  `err` object, not just `.message`, matching the REVIEW.md snippet). This
  closes the information-disclosure surface that the phase's SYNC-01 inner-
  failure sanitization did not cover.
- **Files changed:** `app/api/sync/route.ts`

### IN-01: Variable shadowing — `const created` shadows outer `let created`

- **Commit:** 6fdb978
- **Action:** Renamed the inner `const created = await prisma.card.create({...})`
  (the created Card row) to `newCard` and updated its two `.id` references
  (`keyToId.set(nf, newCard.id)` and
  `linkTargets.push({ id: newCard.id, components: card.components })`). The
  outer lesson counter `let created = 0` (used for `orderIndex` at line 132:
  `orderBase + (++created)`) and `createdThisLesson` were left untouched —
  verified by grepping all `created` / `newCard` references post-edit.
- **Files changed:** `app/api/sync/route.ts`

### IN-02: `getRecentGlosses` returns rows in undefined (insertion) order, not recency order

- **Commit:** 4a96234
- **Action:** Renamed `getRecentGlosses` → `getGlossCacheEntries` and updated
  the docstring to clarify that rows are returned in the DB's natural
  (insertion) order — NOT recency order (the `Setting` model has no timestamp
  column). Updated both call sites in `app/api/gloss/preload/route.ts` (the
  import and the invocation). Chose the rename option per the task constraint:
  adding an `updatedAt` column would require a Prisma migration, which is out
  of scope for a code-review fix. Verified no stale `getRecentGlosses`
  references remain in `app/`, `lib/`, or `components/` source (the only
  remaining references are in `.planning/` planning artifacts, which were
  intentionally left untouched).
- **Files changed:** `lib/gloss.ts`, `app/api/gloss/preload/route.ts`

## Skipped

None — all 4 in-scope findings were fixed and committed.

---

_Fixed: 2026-07-02T19:52:31Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
