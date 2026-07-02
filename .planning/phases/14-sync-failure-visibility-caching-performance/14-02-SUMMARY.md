---
phase: 14-sync-failure-visibility-caching-performance
plan: 02
subsystem: api
tags: [prisma, nextjs-api-route, react, gloss, performance, caching]

# Dependency graph
requires:
  - phase: 02-maturity-known-word-aware-presentation
    provides: "the existing tap-to-gloss cache infrastructure — `gloss:`-prefixed rows in the Setting table written by `setCachedGloss(normalizeFront(word), entry)` and the pure `normalizeFront` helper in lib/card-key — that this plan reads back in bulk and keys the client cache against"
provides:
  - "Bounded `getRecentGlosses(limit?)` bulk reader in lib/gloss.ts — `gloss:`-scoped, `take:`-bounded, try/catch per row (PERF-02 server half)"
  - "`GET /api/gloss/preload` route returning `{ entries: [{ word, entry }] }` bounded server-side, `{ entries: [] }` on error (never a 500)"
  - "`GLOSS_PRELOAD_LIMIT` (300) exported constant — fixed server-side bound, never client-controllable"
  - "Mount-time DB→ref cache preload in GlossProvider (`useEffect(..., [])` → `cache.current.set`) — no setState in effect body (PERF-02 client half)"
  - "Cache key alignment: client in-memory map keyed by `normalizeFront(raw)`, matching the DB `gloss:<normalizeFront(word)>` key so a preloaded entry is a hit on the next tap"
affects: [15, gloss-cache, study-session-perf, tap-to-gloss]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mount-time DB→ref cache preload: a `useEffect(..., [])` warms a `useRef<Map>` from a bounded server endpoint, writing to the ref ONLY (no setState in the effect body) so it is `react-hooks/set-state-in-effect` safe and StrictMode-double-invoke-harmless (idempotent Map writes); rendering is never gated on the preload"
    - "Cache key normalization alignment: the client in-memory cache key (`normalizeFront(raw)`) is the SAME form the server uses to key the persistent DB cache (`gloss:<normalizeFront(word)>`), so a row preloaded from the DB is a hit on the next tap of the same word — a mismatch here is the silent failure mode only a live reload can catch"

key-files:
  created:
    - app/api/gloss/preload/route.ts
  modified:
    - lib/gloss.ts
    - components/GlossProvider.tsx

key-decisions:
  - "Gloss preload keyed by `normalizeFront(raw)` on the client to match the server DB key `gloss:<normalizeFront(word)>` — the load-bearing alignment that makes a preloaded entry a HIT on the next tap; `raw` (display word + POST body) is kept separate from `cacheKey` so server-side resolution is unchanged."
  - "Mount preload effect writes to `cache.current` (a ref) ONLY — no setState in the effect body — so it is `react-hooks/set-state-in-effect` safe; React StrictMode double-invoke is harmless because `Map.set` is idempotent. Rendering is never gated on preload resolving; the popover works from the first tap whether or not preload has landed."
  - "Preload endpoint is bounded + gloss-scoped: fixed server-side `take: GLOSS_PRELOAD_LIMIT` (300) with NO client-controllable limit param (threat T-14-04), and `where: { key: { startsWith: 'gloss:' } }` so app-config settings (buttonColor, dailyGoalSeconds, sessionSize, habitDayStartHour) are never read or serialized (threat T-14-05)."
  - "Preload failure degrades to `{ entries: [] }` (not a 500) — non-critical: the gloss feature still fetches per-tap on a cache miss, so the client never needs to special-case a preload error."
  - "Each preloaded row's `value` is `JSON.parse`d inside a try/catch that skips + `console.warn`s malformed entries (mirroring `getCachedGloss`) — a corrupt cache row never crashes the preload (threat T-14-06)."
  - "No new npm dependencies, no schema changes — the reader/route/effect use existing Prisma, Next, React, and the pure `normalizeFront` helper; the `Setting` table already stores `gloss:`-prefixed rows (threat T-14-SC accepted)."

patterns-established:
  - "Mount-time DB→ref cache preload (ref-only writes, no setState in effect) for instant first-interaction hits without blocking render."
  - "Cache key normalization alignment between a client in-memory map and the persistent DB cache so a preloaded entry is a hit, not a no-op."

requirements-completed: [PERF-02]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Server half (PERF-02): a bounded `getRecentGlosses(limit)` reader in lib/gloss.ts queries `prisma.setting.findMany({ where: { key: { startsWith: 'gloss:' } }, take: limit })`, JSON.parses each row inside a try/catch (skip+warn malformed), and returns `{ word, entry }[]`; exposed via `GET /api/gloss/preload` which returns `{ entries: [...] }` and degrades to `{ entries: [] }` on error (never a 500, no client-supplied limit). Only `gloss:`-prefixed rows are read; the payload is bounded to GLOSS_PRELOAD_LIMIT (300) even as the cache approaches MAX_GLOSS_CACHE_ENTRIES (2000)."
    requirement: PERF-02
    verification:
      - kind: other
        ref: "npm run build (route + lib typecheck clean, `/api/gloss/preload` registered in route table, exit 0); npm run lint (zero errors); grep asserts `getRecentGlosses`+`startsWith`+`take:` in lib/gloss.ts and `GET` handler + `getRecentGlosses` import in app/api/gloss/preload/route.ts"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 checkpoint (operator 'approved'): `GET /api/gloss/preload` fired exactly once on load and returned entries that populated `cache.current` — proven by the post-reload cache HIT on a previously-glossed word with no `POST /api/gloss`"
        status: pass
    human_judgment: false
  - id: D2
    description: "Client half (PERF-02): GlossProvider imports `normalizeFront` from `@/lib/card-key`; `showGloss` splits `raw` (display + POST body) from `cacheKey = normalizeFront(raw)` (cache get/set key, matching the DB `gloss:<normalizeFront(word)>` key); a mount `useEffect(..., [])` fetches `/api/gloss/preload` and populates `cache.current` from `data.entries` with a `.catch` (silent, non-fatal), writing to the ref ONLY (no setState in the effect body). A previously-glossed word resolves instantly on a fresh load with no spinner and no `POST /api/gloss`; a never-before-seen word still fetches via POST (fallback intact)."
    requirement: PERF-02
    verification:
      - kind: other
        ref: "npm run build (clean, exit 0); npm run lint (zero errors — `react-hooks/set-state-in-effect` respected); grep asserts `gloss/preload`+`normalizeFront`+`cache.current.set` in components/GlossProvider.tsx"
        status: pass
      - kind: manual_procedural
        ref: "Task 3 checkpoint (operator 'approved', gate=blocking): after a full reload, a previously-resolved word showed its gloss immediately with NO 'Looking up…' spinner and NO `POST /api/gloss` in the Network tab (served from the preloaded cache); exactly one `GET /api/gloss/preload` fired on load; a brand-new word still showed the spinner and fired `POST /api/gloss` (fallback path intact); no console errors"
        status: pass
    human_judgment: false

# Metrics
duration: 7min
completed: 2026-07-02
status: complete
---

# Phase 14 Plan 02: Gloss Cache Preload (PERF-02) Summary

**Mount-time preload of the persistent DB gloss cache into GlossProvider's in-memory map (keyed by `normalizeFront` to match the DB key) so previously-glossed words resolve instantly on a fresh load with no LLM round-trip.**

## Performance

- **Duration:** ~7 min implementation (Tasks 1–2); Task 3 was a live-verify checkpoint, operator-approved separately
- **Started:** 2026-07-02T18:44:00Z
- **Completed:** 2026-07-02T19:01:00Z
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify, gate=blocking)
- **Files modified:** 3 (`lib/gloss.ts`, `app/api/gloss/preload/route.ts` [new], `components/GlossProvider.tsx`)

## Accomplishments
- PERF-02 (server half): a bounded, gloss-scoped `getRecentGlosses(limit)` reader in `lib/gloss.ts` reads up to `GLOSS_PRELOAD_LIMIT` (300) `gloss:`-prefixed Setting rows — never app-config settings, never unbounded — and is exposed via `GET /api/gloss/preload`, which degrades to `{ entries: [] }` on error (non-critical; the gloss feature still works per-tap).
- PERF-02 (client half): `GlossProvider` preloads that DB cache into its in-memory `Map` ref on mount (`useEffect(..., [])` → `cache.current.set`, ref-only, no setState in the effect body — `react-hooks/set-state-in-effect` safe; StrictMode double-invoke harmless).
- Cache key alignment: the client cache key is now `normalizeFront(raw)`, the SAME form the server uses for the DB key `gloss:<normalizeFront(word)>` — so a preloaded entry is a HIT on the next tap of that word. `raw` (display word + POST body) is kept separate so server-side resolution is unchanged.
- Live-verify (Task 3, operator "approved"): a previously-glossed word resolved instantly after a full reload (no spinner, no `POST /api/gloss` — exactly one `GET /api/gloss/preload` on load); a brand-new word still fetched via POST (fallback intact); no console errors.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add bounded `getRecentGlosses()` reader + `GET /api/gloss/preload` route (PERF-02 server half)** — `1b9e47e` (feat)
2. **Task 2: Preload DB gloss cache on mount + align in-memory cache key with DB key (PERF-02 client half)** — `b08b8e6` (feat)
3. **Task 3: Live verification that preloaded glosses resolve instantly on fresh load (PERF-02)** — checkpoint:human-verify (gate=blocking) — **operator replied "approved"**; no source changes (verification-only task). A previously-glossed word resolved instantly post-reload (no spinner, no `POST /api/gloss`); a new word still fetched via POST; no console errors. The prod server used for verification (PID 63035) was stopped by the orchestrator.

**Plan metadata:** _follows in the final docs commit (this pass)._

## Files Created/Modified
- `app/api/gloss/preload/route.ts` — NEW authenticated `GET` handler; calls `getRecentGlosses()`, returns `NextResponse.json({ entries })` on success and `{ entries: [] }` on error (try/catch, `console.error` server-side). No request body/query params — limit is fixed server-side. JSDoc documents the PERF-02 intent + threat T-14-04/05 mitigations.
- `lib/gloss.ts` — added `export const GLOSS_PRELOAD_LIMIT = 300` and `export async function getRecentGlosses(limit = GLOSS_PRELOAD_LIMIT)`: `prisma.setting.findMany({ where: { key: { startsWith: CACHE_KEY_PREFIX } }, take: limit })`, then per-row `JSON.parse` inside try/catch (skip + `console.warn` malformed, mirroring `getCachedGloss`), returning `{ word: row.key.slice(prefix.length), entry }[]`. `getCachedGloss`/`setCachedGloss`/`lookupViaLLM` untouched.
- `components/GlossProvider.tsx` — new `import { normalizeFront } from '@/lib/card-key'`; new mount `useEffect(..., [])` that fetches `/api/gloss/preload` and populates `cache.current` from `data.entries ?? []` (ref-only writes, `.catch(() => {})` non-fatal); `showGloss` now splits `const raw = word.trim()` (guard + display + POST body) from `const cacheKey = normalizeFront(raw)` (used for both `cache.current.get` and `cache.current.set`), aligning the in-memory key with the DB key. Types, `handleAddCard`, `handleClose`, popover UI, and portal mount unchanged.

## Decisions Made
- **Client cache key = `normalizeFront(raw)`** (matching the DB key `gloss:<normalizeFront(word)>`) — the load-bearing alignment that makes a preloaded entry a HIT. `raw` is kept for the popover `word` field and the `/api/gloss` POST body so server-side resolution is unchanged.
- **Mount preload writes to `cache.current` (a ref) ONLY** — no setState in the effect body → `react-hooks/set-state-in-effect` safe; React StrictMode double-invoke is harmless (idempotent `Map.set`). Rendering is never gated on preload resolving; the popover works from the first tap whether or not preload has landed.
- **Endpoint bounded + gloss-scoped** — fixed server-side `take: GLOSS_PRELOAD_LIMIT` (300) with no client-controllable limit param (T-14-04), and `startsWith: 'gloss:'` so app-config settings are never read/serialized (T-14-05).
- **Preload failure → `{ entries: [] }`, not a 500** — non-critical: gloss still fetches per-tap on a cache miss, so the client never special-cases a preload error.
- **Per-row `JSON.parse` in try/catch** (skip + `console.warn` malformed, mirroring `getCachedGloss`) — a corrupt cache row never crashes the preload (T-14-06).
- **No new npm deps, no schema changes** — reader/route/effect use existing Prisma, Next, React, and the pure `normalizeFront` helper; the `Setting` table already stores `gloss:` rows (T-14-SC accepted).

## Deviations from Plan

None — plan executed exactly as written. Both implementation tasks followed their `<action>` blocks verbatim; no Rule 1–4 deviations were triggered. Build and lint stayed clean after each task; no auto-fixes were needed. Task 3 was the planned `checkpoint:human-verify` (gate=blocking) — the operator replied "approved", confirming the load-bearing runtime behavior (preloaded cache HIT under the normalized key with no network round-trip; new-word fallback intact) that no static check can catch.

## Issues Encountered

None. The AGENTS.md `nextjs-agent-rules` directive ("This is NOT the Next.js you know — read `node_modules/next/dist/docs/` before writing Next.js code") was honored by the prior executor: the Next.js 16 Route Handler reference was consulted before adding `GET /api/gloss/preload`, confirming the `export async function GET()` + `NextResponse.json` pattern is unchanged in this version. This plan's edits are a standard route handler + a pure lib reader + a client `useEffect`/`useCallback` — no deprecated Next.js API surface touched.

## User Setup Required

None — no external service configuration, no new env vars, no new dependencies. Pure source-only addition (one new route + one new lib reader + one client effect).

## Next Phase Readiness
- Phase 14 is complete (2/2 plans): SYNC-01 + PERF-01 (plan 14-01) and PERF-02 (plan 14-02) all satisfied. All three Phase 14 requirements are met.
- Phase 15 (StudySession refactor & sentence-selection memoization) is unblocked — this plan touched `components/GlossProvider.tsx` / `lib/gloss.ts` / `app/api/gloss/preload/route.ts`, none of which Phase 15's `components/StudySession.tsx` refactor touches.
- End-of-phase UAT (optional, `human_verify_mode: end-of-phase` in config): the Task 3 checkpoint already live-verified the PERF-02 runtime behavior (preloaded cache hit, fallback intact, no console errors). A phase-close UAT could additionally exercise a sync against the tutor's Google Doc to confirm the plan 14-01 SyncPanel excerpt rendering (SYNC-01) and CardDependency edge creation (PERF-01) live — deferred to the phase verifier.

---
*Phase: 14-sync-failure-visibility-caching-performance*
*Completed: 2026-07-02*

## Self-Check: PASSED

- `app/api/gloss/preload/route.ts` — FOUND (new file present on disk, `GET` handler exports `getRecentGlosses` import + try/catch + `{ entries: [] }` error path)
- `lib/gloss.ts` — FOUND (exports `getRecentGlosses` + `GLOSS_PRELOAD_LIMIT`; query uses `startsWith: CACHE_KEY_PREFIX` + `take: limit`; per-row try/catch `JSON.parse`)
- `components/GlossProvider.tsx` — FOUND (`normalizeFront` import + mount `useEffect(..., [])` → `/api/gloss/preload` → `cache.current.set`; `showGloss` keys get/set by `cacheKey = normalizeFront(raw)`)
- `.planning/phases/14-sync-failure-visibility-caching-performance/14-02-SUMMARY.md` — FOUND
- Commit `1b9e47e` (Task 1, PERF-02 server half) — FOUND in git log
- Commit `b08b8e6` (Task 2, PERF-02 client half) — FOUND in git log
- `npm run build` — PASSED (`✓ Compiled successfully in 2.6s`; `✓ Generating static pages (25/25)`; exit 0; `/api/gloss/preload` registered in route table)
- `npm run lint` — PASSED (eslint: zero errors; `react-hooks/set-state-in-effect` respected)
- Source greps — PASSED: `getRecentGlosses`(1)/`startsWith`(3)/`take:`(2) in lib/gloss.ts; `getRecentGlosses`(2) in app/api/gloss/preload/route.ts; `gloss/preload`(1)/`normalizeFront`(3)/`cache.current.set`(2) in components/GlossProvider.tsx
