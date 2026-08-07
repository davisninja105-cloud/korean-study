---
phase: 30-instant-feedback-cold-start-unblocking
plan: 04
subsystem: settings
tags: [nextjs, cookies, server-components, route-handlers, playwright, vitest, g-30-2]

# Dependency graph
requires:
  - phase: 30-instant-feedback-cold-start-unblocking
    provides: "CR-01's ks_settings cookie backfill mechanism (30-REVIEW-FIX.md), whose render-body implementation this plan corrects; the root-cause diagnosis in .planning/debug/settings-page-server-error.md"
provides:
  - "A valid, always-succeeding /settings production render (G-30-2 closed)"
  - "POST /api/settings/backfill-cookie — reusable pattern for cookie-only, zero-DB Route Handlers invoked from a client mount effect"
  - "Permanent regression-guard unit test forbidding render-body cookie mutation anywhere in app/settings/page.tsx"
affects: [settings, layout-01, cookie-backfill]

# Actuals (#2632)
actuals:
  tokens: 3181
  tasks: 2
  commits: 2

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cookie-only Route Handler pattern: a POST endpoint that mutates only a non-httpOnly cosmetic cookie, takes zero DB calls, and is invoked fire-and-forget from a client component's mount effect — used when a Server Component needs to re-seed a cookie but cannot call cookies().set() itself (render phase forbids mutation; only Server Actions/Route Handlers can)."

key-files:
  created:
    - app/api/settings/backfill-cookie/route.ts
    - tests/settings-backfill-cookie-route.test.ts
    - tests/settings-page-render-safety.test.ts
  modified:
    - app/settings/page.tsx
    - components/SettingsClient.tsx
    - e2e/settings-flash.spec.ts

key-decisions:
  - "Moved the ks_settings cookie backfill out of app/settings/page.tsx's render body entirely, into a new zero-DB POST /api/settings/backfill-cookie Route Handler, invoked from components/SettingsClient.tsx's mount effect using the initial* props the page already fetched — preserves CR-01's re-seed-on-every-visit intent without a render-phase cookies().set() call."
  - "The new Route Handler validates its body the same way PUT /api/settings does (typeof checks, 400 on any missing/invalid field) before touching cookies, and writes the identical cookie shape/options PUT /api/settings already produces — no drift between the two writers."
  - "SettingsClient's new mount effect is a separate useEffect from the existing theme-resolution effect, keyed to the initial* props (not the mutable state), fire-and-forget with .catch(() => {}) — matches the project's established non-blocking background-write convention."

requirements-completed: [LAYOUT-01]

coverage:
  - id: D1
    description: "POST /api/settings/backfill-cookie writes the ks_settings cookie from caller-supplied values with the exact shape/options PUT /api/settings already uses, and makes zero DB calls"
    requirement: "LAYOUT-01"
    verification:
      - kind: unit
        ref: "tests/settings-backfill-cookie-route.test.ts#POST /api/settings/backfill-cookie > sets the ks_settings cookie with the caller-supplied values"
        status: pass
      - kind: unit
        ref: "tests/settings-backfill-cookie-route.test.ts#POST /api/settings/backfill-cookie > returns 400 and sets no cookie when a required field is missing"
        status: pass
    human_judgment: false
  - id: D2
    description: "app/settings/page.tsx no longer mutates cookies from its render body (the G-30-2 bug class); getAllSettings() and the new route's cookie write remain intact"
    requirement: "LAYOUT-01"
    verification:
      - kind: unit
        ref: "tests/settings-page-render-safety.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "/settings genuinely loads (200 + real Settings heading) on a production build and the mount-effect cookie backfill lands"
    requirement: "LAYOUT-01"
    verification:
      - kind: e2e
        ref: "e2e/settings-flash.spec.ts#GET /settings renders the real Settings UI, not a server error (G-30-2 regression guard)"
        status: pass
      - kind: manual_procedural
        ref: "npm run build && npm start against a throwaway local SQLite DB, authenticated via POST /api/login, then GET /settings — returned 200 with the real Settings UI (Appearance, goal, session size, reading aid, App colors, Advanced/sync sections all present), matching the exact reproduction .planning/debug/settings-page-server-error.md used"
        status: pass
    human_judgment: false

# Metrics
duration: ~35min
completed: 2026-08-07
status: complete
---

# Phase 30 Plan 04: Fix G-30-2 (/settings server error) Summary

**Moved the CR-01 `ks_settings` cookie backfill out of `app/settings/page.tsx`'s Server Component render body — which threw `ReadonlyRequestCookiesError` on every production visit — into a new zero-DB `POST /api/settings/backfill-cookie` Route Handler invoked from `SettingsClient`'s mount effect, closing the deterministic 500 that blocked Phase 30 UAT.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-07 (session start)
- **Completed:** 2026-08-07T03:48:22Z
- **Tasks:** 2/2 completed
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `/settings` now returns HTTP 200 and renders the real Settings UI on every visit in production — confirmed both via an automated e2e test and a manual `npm run build && npm start` reproduction against a throwaway local SQLite DB, mirroring the exact steps `.planning/debug/settings-page-server-error.md` used to reproduce the crash.
- CR-01's original "re-seed `ks_settings` on every `/settings` visit" intent is fully preserved — just relocated to a valid action-phase Route Handler (`POST /api/settings/backfill-cookie`) that makes zero new DB calls, invoked fire-and-forget from `SettingsClient`'s mount effect.
- `app/settings/page.tsx` still calls `getAllSettings()` and passes real values straight through to `SettingsClient` — no new client round trip gates the page's own first-paint render (LAYOUT-01's non-goal preserved).
- Added a permanent regression-guard unit test (`tests/settings-page-render-safety.test.ts`) that will fail the test suite if render-body cookie mutation is ever reintroduced into `app/settings/page.tsx`, plus a unit test proving the new route's cookie contract and an e2e test proving the fix end-to-end.

## Task Commits

Each task was committed atomically:

1. **Task 1: Move ks_settings backfill into a valid Route Handler + wire it from the client shell** - `8f021f1` (fix)
2. **Task 2: Regression-guard unit test + e2e proof that /settings loads (closes G-30-2)** - `25a7f52` (test)

_No plan-metadata commit in this worktree — the orchestrator commits STATE.md/ROADMAP.md/this SUMMARY.md centrally after all wave agents complete._

## Files Created/Modified
- `app/api/settings/backfill-cookie/route.ts` - New POST Route Handler; validates body, writes `ks_settings` cookie only, zero Prisma/DB access
- `app/settings/page.tsx` - Removed the render-body `cookies().set()` block; `getAllSettings()` fetch and prop-passing to `SettingsClient` unchanged
- `components/SettingsClient.tsx` - New mount effect fires `POST /api/settings/backfill-cookie` with the `initial*` props, fire-and-forget
- `tests/settings-backfill-cookie-route.test.ts` - Unit test: valid body sets the cookie with correct shape/options; missing field returns 400 + no cookie
- `tests/settings-page-render-safety.test.ts` - Permanent regression guard: no `cookies().set(` pattern or `next/headers` cookies import in `app/settings/page.tsx`; `getAllSettings()` and the new route's `res.cookies.set(` stay intact
- `e2e/settings-flash.spec.ts` - Added a test asserting `/settings` returns 200, renders the real heading, and the cookie backfill lands

## Decisions Made
- Kept the new route's validation and cookie-write shape byte-identical to `PUT /api/settings`'s existing pattern (same field-by-field `typeof` checks, same cookie options object) so there is no drift between the two writers of `ks_settings`.
- Placed the new mount effect as a second, independent `useEffect` in `SettingsClient.tsx` (not merged with the existing theme-resolution effect) per the plan's explicit instruction, keyed to the `initial*` props rather than the mutable state — this call exists purely to re-seed the cookie from what the server rendered, not to react to user edits.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Explanatory comment in `app/settings/page.tsx` tripped the plan's own acceptance-criteria grep**
- **Found during:** Task 1
- **Issue:** The plan's acceptance criteria require `grep -Ec "\.set\(|\.delete\(" app/settings/page.tsx` to return 0 (no cookie-mutation call remains). My first draft of the replacement comment explaining *why* the code moved used the literal phrases "cookies().set() call" and "calling .set() from a Server Component's render body" — prose that itself matched the grep pattern, even though it was inert comment text, not a real mutation call.
- **Fix:** Reworded the comment to describe the removed code as "a direct render-body cookie-jar mutation" / "mutating a cookie from a Server Component's render body" instead of naming the literal `.set(` syntax, satisfying both the plan's explicit allowance ("a prose mention of the word 'cookie' ... is fine") and its literal grep check.
- **Files modified:** `app/settings/page.tsx`
- **Verification:** `grep -Ec "\.set\(|\.delete\(" app/settings/page.tsx` now returns 0
- **Committed in:** `8f021f1` (part of Task 1 commit)

**2. [Rule 3 - Blocking] Playwright e2e run failed with `spawnSync .../node_modules/.bin/tsx ENOENT`**
- **Found during:** Task 2 verification
- **Issue:** This worktree's `node_modules` was incomplete (only `.cache`/`.vite` directories present, no installed packages or `.bin/` symlinks) — `npm test`/`npm run lint`/`tsc` had been silently resolving packages by walking up to the parent repo's `node_modules`, but `e2e/seed.ts`'s `resetToBaseline()` uses an explicit `path.resolve(process.cwd(), 'node_modules', '.bin', 'tsx')`, which bypassed that upward resolution and failed. This blocked the plan's required `npx playwright test e2e/settings-flash.spec.ts` verification (unrelated to any code change in this plan).
- **Fix:** Ran `npm install` in the worktree (using the worktree's own committed `package-lock.json`, no new/altered dependencies) to populate a complete local `node_modules`, then re-ran the e2e suite.
- **Files modified:** None (node_modules is gitignored; no source changes)
- **Verification:** `npx playwright test e2e/settings-flash.spec.ts` subsequently ran all 4 tests
- **Committed in:** N/A (environment-only fix, nothing to commit)

**3. [Rule 1 - Bug] New e2e test's `waitForResponse` raced the mount-effect POST and timed out**
- **Found during:** Task 2 verification
- **Issue:** The first draft called `page.waitForResponse(...)` *after* `page.goto('/settings')` and the heading-visibility assertion — but `SettingsClient`'s mount effect fires the backfill POST almost immediately after mount, so by the time the listener was registered the response had often already occurred, and Playwright's `waitForResponse` only observes events after it is called. The test hit its 30s timeout.
- **Fix:** Moved the `page.waitForResponse(...)` call to start listening *before* `page.goto('/settings')`, awaiting the resulting promise after the heading assertion — standard Playwright event-registration-before-trigger pattern.
- **Files modified:** `e2e/settings-flash.spec.ts`
- **Verification:** `npx playwright test e2e/settings-flash.spec.ts` — all 4 tests pass
- **Committed in:** `25a7f52` (part of Task 2 commit)

---

**Total deviations:** 3 (2 auto-fixed bugs, 1 blocking environment fix)
**Impact on plan:** All fixes were necessary to satisfy the plan's own verification requirements; no scope creep, no production behavior changed beyond what the plan specified.

## Issues Encountered

The plan's Task 1 acceptance criterion `grep -c "getAllSettings" app/settings/page.tsx returns 1` cannot be satisfied while `getAllSettings` remains both imported and called in the same file — that pattern always yields 2 matching lines (the `import { getAllSettings } from ...` line and the `await getAllSettings()` call line), confirmed identical in the pre-fix version of the file (`git show f443cbf:app/settings/page.tsx | grep -c getAllSettings` also returns 2). This is a minor inaccuracy in the plan's acceptance-criteria wording, not a behavioral gap — the underlying intent ("server-side settings fetch preserved, unchanged render path") is fully met and verified by `tests/settings-page-render-safety.test.ts`'s `getAllSettings()` assertion.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

G-30-2 is closed. `/settings` is fully usable in production. This was the sole remaining blocker from Phase 30 UAT — the phase's outstanding gap-closure work is complete pending orchestrator wave verification.

---
*Phase: 30-instant-feedback-cold-start-unblocking*
*Completed: 2026-08-07*
