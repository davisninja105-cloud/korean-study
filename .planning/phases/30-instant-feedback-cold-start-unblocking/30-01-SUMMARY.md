---
phase: 30-instant-feedback-cold-start-unblocking
plan: 01
subsystem: ui
tags: [nextjs, app-router, cookies, css-custom-properties, settings, layout]

requires: []
provides:
  - "RootLayout in app/layout.tsx is a plain (non-async) function with zero await calls"
  - "PUT /api/settings writes a non-httpOnly ks_settings cookie mirroring the validated button/reward/reading settings"
  - "A 3rd pre-paint <script> in app/layout.tsx applies --button/--button-foreground/--reward/--reward-foreground/--reading-scale and hangul-spaced from the ks_settings cookie before first paint"
affects: [30-02, settings-ui, root-layout]

actuals:
  tokens: 2661
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Pre-paint <script dangerouslySetInnerHTML> cookie-read pattern (3rd instance in app/layout.tsx, matching the existing theme-resolution and --sab-freeze scripts) — cookie write co-located with the validated DB write in the owning route, cookie read + CSS custom property application happens client-side before first paint, all wrapped in try/catch so a malformed/missing cookie silently falls through to CSS :root defaults"

key-files:
  created:
    - tests/root-layout-sync.test.ts
    - e2e/settings-flash.spec.ts
  modified:
    - app/layout.tsx
    - app/api/settings/route.ts

key-decisions:
  - "ks_settings cookie value is NOT manually encodeURIComponent()'d in the route handler — Next's res.cookies.set() already percent-encodes the Set-Cookie value via the standard `cookie` package's serialize(); a manual encode double-encodes it, which the client's single decodeURIComponent() cannot reverse (found via this plan's own e2e verification, fixed same task)."
  - "httpOnly: false on ks_settings is a deliberate, documented deviation from the ks_auth (AUTH_COOKIE) convention — the cookie carries only cosmetic UI preference data (hex colors, a float scale, a boolean), never anything auth/session-related, and middleware.ts's ks_auth gate remains the sole access-control mechanism (verified: grep for ks_settings only hits app/layout.tsx and app/api/settings/route.ts)."

patterns-established:
  - "Settings-cookie pre-paint pattern: any future setting that needs to render correctly on the very first paint after being saved (no async server round trip, no flash) should extend the ks_settings cookie payload and the corresponding pre-paint <script> block, not add a new cookie."

requirements-completed: [LAYOUT-01]

coverage:
  - id: D1
    description: "RootLayout renders synchronously — exported as a plain (non-async) function with no await in its body, and no longer imports getLayoutSettings"
    requirement: "LAYOUT-01"
    verification:
      - kind: unit
        ref: "tests/root-layout-sync.test.ts#app/layout.tsx RootLayout — synchronous render (LAYOUT-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "PUT /api/settings writes a non-httpOnly ks_settings cookie (JSON-encoded buttonColor/buttonFg/rewardColor/rewardFg/readingTextScale/readingAid) alongside its existing Setting-table writes"
    requirement: "LAYOUT-01"
    verification:
      - kind: e2e
        ref: "e2e/settings-flash.spec.ts#saved settings persist via a non-httpOnly cookie, applied before hydration on the next navigation"
        status: pass
    human_judgment: false
  - id: D3
    description: "A saved settings change (button/reward color, reading scale, reading aid) applies to the <html> element's computed CSS custom properties/class list on the very next navigation (hard reload) with no flash of the previous/default value"
    requirement: "LAYOUT-01"
    verification:
      - kind: e2e
        ref: "e2e/settings-flash.spec.ts#saved settings persist via a non-httpOnly cookie, applied before hydration on the next navigation"
        status: pass
    human_judgment: true
    rationale: "The e2e spec proves the DOM-attribute mechanics (computed style + class list post-reload) automatically, but the plan's own must_haves flags the visual 'no flash' truth as needing a held-out check beyond code review — a real-device/manual confirmation at UAT per the UI-SPEC's own note, since a DOM assertion cannot observe a sub-frame visual flash the way a human eye or a video-frame capture can."

duration: ~25min
completed: 2026-08-06
status: complete
---

# Phase 30 Plan 01: RootLayout Synchronous Render + Settings-Cookie Pre-Paint Script Summary

**RootLayout dropped `async`/`await getLayoutSettings()` entirely; a non-httpOnly `ks_settings` cookie written by `PUT /api/settings` is read by a new 3rd pre-paint `<script>` that applies button/reward colors, reading scale, and the reading-aid class before first paint — no DB round trip on the cold path, no color flash on the next navigation.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-06T17:27:56-07:00
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments
- `RootLayout` in `app/layout.tsx` is now a plain, non-async function — the one blocking DB read on the cold path (`await getLayoutSettings()`) is gone, along with the `buttonStyle` object and the `getLayoutSettings`/`readableForeground` imports.
- A 3rd pre-paint `<script>` (matching the existing theme-resolution and `--sab`-freeze scripts already in the file) reads the `ks_settings` cookie via a regex + `decodeURIComponent` + `JSON.parse`, and applies `--button`, `--button-foreground`, `--reward`, `--reward-foreground`, `--reading-scale`, and the `hangul-spaced` class directly to `document.documentElement` before first paint — all wrapped in a single `try{}catch(e){}` so a missing/malformed cookie silently falls through to the CSS `:root` defaults (which already match `DEFAULT_ACTION_COLOR`/`DEFAULT_REWARD_COLOR`).
- `PUT /api/settings` now writes the `ks_settings` cookie (non-httpOnly, `sameSite: 'lax'`, 1-year `maxAge`) alongside its existing `Setting`-table writes, carrying only the validated (not raw request-body) button/reward/reading values.
- `tests/root-layout-sync.test.ts` (3 static source-text assertions) and `e2e/settings-flash.spec.ts` (2 behavioral tests: cookie readability + post-reload computed-style/class assertions) both pass, along with the full existing 251-test Vitest suite and `npm run lint` (0 errors).

## Task Commits

Each task was committed atomically:

1. **Task 1: RootLayout synchronous render + settings-cookie pre-paint script (LAYOUT-01)** - `d8ea09b` (feat)
2. **Task 2: e2e verification — settings save survives a fresh navigation with no flash** - `643606e` (test, includes a same-task bug fix — see Deviations)

_Task 2's commit also carries the Task 1 bug fix discovered during its own e2e verification (double-encoded cookie value) — both changes landed together since the fix was found and applied inside the same verification pass, not as a separate follow-up task._

## Files Created/Modified
- `app/layout.tsx` - `RootLayout` de-asyncified; new 3rd pre-paint `<script>` block reads `ks_settings` cookie and applies CSS custom properties + `hangul-spaced` class
- `app/api/settings/route.ts` - `PUT` handler writes the `ks_settings` cookie (JSON payload, not manually URI-encoded — see Deviations) after its existing `Promise.all` DB writes
- `tests/root-layout-sync.test.ts` - new Vitest file, static source-text assertions (no `async`, no `await`, no `getLayoutSettings` import)
- `e2e/settings-flash.spec.ts` - new Playwright spec, cookie-readability + post-reload computed-style/class assertions, plus a cleanup test resetting to default colors

## Decisions Made
- Cookie payload is NOT manually `encodeURIComponent()`'d before being handed to `res.cookies.set()` — Next.js's cookie serializer (the standard `cookie` package under the hood) already percent-encodes the value when building the `Set-Cookie` header. Manually encoding first produced a double-encoded value that the client's single `decodeURIComponent()` could not reverse into valid JSON, silently breaking the entire mechanism (`--button`/`--reward` stayed at CSS defaults after reload). Found during Task 2's own e2e run, fixed in the same commit.
- `httpOnly: false` on `ks_settings` kept as specified in the plan — documented inline in `app/api/settings/route.ts`, and verified via `grep -rln "ks_settings" app/ components/ middleware.ts lib/` returning only the two owning files (T-30-03 mitigation confirmed).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed double URL-encoding of the `ks_settings` cookie value**
- **Found during:** Task 2 (e2e verification — the "applied before hydration on the next navigation" assertion failed: `--button` stayed at `#3b82f6` instead of the saved `#111111` after reload)
- **Issue:** `app/api/settings/route.ts`'s `PUT` handler called `encodeURIComponent(JSON.stringify(...))` before passing the value to `res.cookies.set()`. Next.js's cookie serializer independently percent-encodes the value it's given, so the stored cookie ended up double-encoded (e.g. `%257B` instead of `%7B`). The pre-paint script's single `decodeURIComponent()` call left a still-percent-encoded string, which `JSON.parse` could not parse — the parse threw inside the script's `try/catch`, silently falling through to CSS defaults every time, exactly the flash the plan set out to eliminate.
- **Fix:** Removed the manual `encodeURIComponent()` call in the route handler; pass the raw `JSON.stringify(...)` string directly to `res.cookies.set()`. The client's existing single `decodeURIComponent()` now correctly reverses Next's one layer of automatic encoding.
- **Files modified:** `app/api/settings/route.ts`
- **Verification:** `e2e/settings-flash.spec.ts` re-run after the fix — all 3 tests (setup + save/reload assertions + cleanup) pass; `--button`, `--reward`, `--reading-scale`, and `hangul-spaced` all confirmed on the actual `<html>` computed style/class list after a real page reload, not just a source-code read.
- **Committed in:** `643606e` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The plan's literal action text specified the manual `encodeURIComponent()` call that caused this bug — the fix was necessary for the plan's own `must_haves` truth ("A saved settings change... is reflected... immediately after a fresh navigation... with no code path in which the previous/default value renders first and then jumps") to actually hold. No scope creep; the fix stayed inside the two files the plan already scoped.

## Issues Encountered
- This worktree's `node_modules/` was not populated (only tool caches present) and Playwright's Chromium browser binary was not yet downloaded — both are one-time local environment setup gaps, not code issues. Resolved by running `npm install` (materializes the already-pinned `package-lock.json` dependencies, including `tsx` which `e2e/seed.ts`'s `resetToBaseline()` shells out to) and `npx playwright install chromium`. No package.json/package-lock.json changes resulted; these commands only materialized already-declared dependencies.

## Next Phase Readiness
- `RootLayout`'s cold-path DB read is eliminated; the `ks_settings` cookie + pre-paint script pattern is now available for any future setting that needs flash-free application on first paint.
- The plan's own held-out truth (D3 above) still recommends a real-device/manual "no flash" confirmation at UAT time, per the UI-SPEC's note — the automated DOM-assertion coverage in `e2e/settings-flash.spec.ts` is in place, but a human visual pass is the appropriate final check for the actual flash-perception claim.
- No blockers for subsequent plans in this phase.

---
*Phase: 30-instant-feedback-cold-start-unblocking*
*Completed: 2026-08-06*

## Self-Check: PASSED

- FOUND: app/layout.tsx
- FOUND: app/api/settings/route.ts
- FOUND: tests/root-layout-sync.test.ts
- FOUND: e2e/settings-flash.spec.ts
- FOUND commit: d8ea09b (Task 1)
- FOUND commit: 643606e (Task 2 + bug fix)
