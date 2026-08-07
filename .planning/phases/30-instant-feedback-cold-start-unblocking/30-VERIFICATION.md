---
phase: 30-instant-feedback-cold-start-unblocking
verified: 2026-08-06T22:45:00Z
status: human_needed
score: 10/10 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 9/9
  gaps_closed:
    - "G-30-2: /settings threw a deterministic server error (ReadonlyRequestCookiesError) on every production visit because CR-01's cookie backfill called cookies().set() from app/settings/page.tsx's Server Component render body. Fixed by moving the backfill into a genuine Route Handler (app/api/settings/backfill-cookie/route.ts) invoked from components/SettingsClient.tsx's mount effect."
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "On a real device/browser (iOS Safari home-screen launch and Android/Chrome PWA install): (a) save a settings change on /settings and immediately navigate away and back, observing whether button/reward color or reading scale flashes; (b) cold-launch the installed PWA from a home-screen icon."
    expected: "No perceptible flash of a mismatched button/reward color or reading scale after a settings save; no white/mismatched splash frame at any point during PWA cold launch (iOS Safari ignoring manifest background_color is a disclosed, accepted residual risk — not a failure of this check)."
    why_human: "This is the same check UAT Test 2 attempted and never actually completed — it was blocked by G-30-2's server error before the visual flash behavior could be observed at all. Now that G-30-2 is fixed (confirmed by a live e2e run + unit regression guard in this verification pass), the underlying visual/device-dependent behavior the check was designed to observe has still never been confirmed by a human on a real device. tests/settings-page-render-safety.test.ts and e2e/settings-flash.spec.ts prove the DOM-attribute/route mechanics but cannot observe a sub-frame visual flash or a real PWA splash transition."
---

# Phase 30: Instant Feedback & Cold-Start Unblocking Verification Report

**Phase Goal:** Make waiting visible everywhere and strip the two avoidable costs from the cold path — a blocking DB read in `RootLayout` and a possible cross-region hop to Turso. This is the cheapest work in the milestone and the largest single improvement in felt speed; it also establishes the re-measurement baseline every later phase is judged against.
**Verified:** 2026-08-06T22:45:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (30-04, fixing G-30-2 found in UAT)

## Re-Verification Summary

UAT (`30-UAT.md`) ran against the previous (9/9, `human_needed`) verification: Test 1 (dark-mode skeleton visibility) **passed**. Test 2 (real-device no-flash confirmation) **could not even begin** — the user hit a deterministic production server error navigating to `/settings` ("This page couldn't load. A server error occurred."), diagnosed as gap **G-30-2** and root-caused in `.planning/debug/settings-page-server-error.md`: CR-01's cookie-backfill fix (`30-REVIEW-FIX.md`) called `cookies().set()` directly inside `app/settings/page.tsx`'s Server Component render body — a phase Next.js 16.2.1 forbids (`ReadonlyRequestCookiesError`, thrown on every request).

Gap-closure plan `30-04` moved the backfill into a genuine Route Handler (`app/api/settings/backfill-cookie/route.ts`), invoked from `components/SettingsClient.tsx`'s mount effect using the already-fetched `initial*` props — preserving CR-01's re-seed-on-every-visit intent without ever calling `cookies().set()` from render. This re-verification independently confirms the fix landed and re-checks all 5 roadmap success criteria plus the phase's other must-haves for regressions.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `RootLayout` (`app/layout.tsx`) is a plain, non-async function with zero `await` calls and no `getLayoutSettings` import — no blocking DB read on the cold path (LAYOUT-01) | ✓ VERIFIED | `grep -n "^export default function RootLayout"` matches (still non-async); `grep -rn "getLayoutSettings" app/ lib/ components/` returns 0 hits repo-wide; untouched by 30-04 |
| 2 | `PUT /api/settings` and `POST /api/settings/backfill-cookie` write a non-httpOnly `ks_settings` cookie carrying the validated button/reward/reading values, read by a 3rd pre-paint `<script>` in `app/layout.tsx`, with no flash on a fresh navigation after a save | ✓ VERIFIED | Live run (this session): `npx playwright test e2e/settings-flash.spec.ts` → 3/3 passed, incl. the cookie round-trip + computed-style assertions |
| 3 | **G-30-2 is closed**: navigating to `/settings` on an authenticated session, on a production build, returns HTTP 200 and renders the real Settings UI — never the "This page couldn't load. A server error occurred." error boundary | ✓ VERIFIED | `app/settings/page.tsx` no longer contains any `cookies().set()`/`.delete()` call (confirmed by source read); live e2e run (this session, against the prod-build harness on port 3100, the same environment class the debug session reproduced the crash in): `e2e/settings-flash.spec.ts`'s "GET /settings renders the real Settings UI, not a server error (G-30-2 regression guard)" test passed — 200 status, "Settings" heading visible, backfill POST observed; `tests/settings-page-render-safety.test.ts` (permanent regression guard) passes |
| 4 | Dark-mode `--skeleton-bg` token exists in all 3 required `globals.css` locations, byte-identical across both dark blocks, numerically distinct from dark `--background` (PERCEPT-01) | ✓ VERIFIED | `tests/skeleton-token.test.ts` (5 tests) pass; untouched by 30-04; UAT Test 1 (human) independently confirmed visible pulsing skeletons across all 4 routes in dark mode |
| 5 | All 4 route-level `loading.tsx` files + `StudyClient.tsx`'s inline pulse blocks use `bg-skeleton` exclusively, zero remaining `bg-surface-3` in those locations | ✓ VERIFIED | Live grep (this session): study=3, cards=8, habits=9, history=3 `bg-skeleton`, 0 `bg-surface-3` in all 4 `loading.tsx` files |
| 6 | `isFilterLoading` branch in `StudyClient.tsx` renders a content-shaped skeleton instead of a bare spinner, with zero layout shift (PERCEPT-03) | ✓ VERIFIED | Live run (this session): `e2e/study-filter-skeleton.spec.ts` (bounding-box comparison) passed |
| 7 | `app/manifest.ts`'s `background_color`/`theme_color` both equal `'#0b0f1a'`, matching the dark chrome (PERCEPT-02) | ✓ VERIFIED | Live grep confirms both values `'#0b0f1a'`; `tests/manifest.test.ts` passes; untouched by 30-04 |
| 8 | `vercel.json`'s `regions` field is pinned to the Vercel region matching Turso's actual live primary region for `korean-study` (REGION-01) | ✓ VERIFIED (carried forward — infra fact, re-confirmed structurally) | `vercel.json` still contains `"regions": ["pdx1"]`; unchanged by 30-04; previously independently cross-checked against live `turso db show korean-study` (`aws-us-west-2` ↔ `pdx1`) in the initial verification pass |
| 9 | `e2e/perf.spec.ts`'s per-route budget map tightens `/habits` to 1500ms while holding `/`, `/study`, `/cards` at 3000ms, and `/habits` passes under the tightened budget (re-measurement baseline) | ✓ VERIFIED | Live run (this session): `npx playwright test e2e/perf.spec.ts` → 8/8 passed, `/habits` dcl samples 17–32ms, well under 1500ms |
| 10 | `ks_settings` cookie is never consulted by any server-side authorization/identity logic — `middleware.ts`'s `ks_auth` gate remains the sole access-control mechanism (prohibition, LAYOUT-01) | ✓ VERIFIED | `grep -rn "ks_settings" app/ components/ middleware.ts lib/` (this session) returns hits only in `app/layout.tsx`, `app/settings/page.tsx`, `app/api/settings/route.ts`, `app/api/settings/backfill-cookie/route.ts` — never `middleware.ts` |

**Score:** 10/10 truths verified (0 present-but-behavior-unverified)

### Required Artifacts (30-04 additions)

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/api/settings/backfill-cookie/route.ts` | New POST Route Handler, sets `ks_settings` cookie only, zero DB access | ✓ VERIFIED | Source read confirms: no Prisma import, validates 4 fields (400 on missing), writes cookie via `res.cookies.set()` (valid action-phase API) |
| `app/settings/page.tsx` | CR-01's render-body `cookies().set()` call removed; `getAllSettings()` fetch unchanged | ✓ VERIFIED | Source read confirms zero `.set(`/`.delete(` calls; still `await getAllSettings()` and passes `initial*` props to `SettingsClient` |
| `components/SettingsClient.tsx` | New mount effect fires `POST /api/settings/backfill-cookie` fire-and-forget | ✓ VERIFIED | Source read confirms independent `useEffect` keyed to `initial*` props, `.catch(() => {})` |
| `tests/settings-backfill-cookie-route.test.ts` | Unit coverage of the new route's cookie contract | ✓ VERIFIED | Live run (this session): 2/2 pass |
| `tests/settings-page-render-safety.test.ts` | Permanent regression guard — no render-body cookie mutation | ✓ VERIFIED | Live run (this session): passes |
| `e2e/settings-flash.spec.ts` | Extended with a direct G-30-2 regression-guard test | ✓ VERIFIED | Live run (this session): 3/3 pass, incl. the new "renders the real Settings UI, not a server error" test |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/api/settings/backfill-cookie/route.ts` (cookie write) | `app/layout.tsx` (pre-paint script) | Same `ks_settings` JSON shape (`buttonColor`/`buttonFg`/`rewardColor`/`rewardFg`/`readingTextScale`/`readingAid`) as `PUT /api/settings` | ✓ WIRED | Field names identical to `PUT` handler; e2e round-trip confirms |
| `components/SettingsClient.tsx` (mount effect) | `app/api/settings/backfill-cookie/route.ts` | `fetch('/api/settings/backfill-cookie', { method: 'POST', ... })` | ✓ WIRED | Source confirmed; live e2e observes the response (`page.waitForResponse`) |
| `middleware.ts` (`ks_auth` gate) | new `backfill-cookie` route | Auth matcher covers it automatically (no new public-path exemption added) | ✓ WIRED (protected) | `middleware.ts` matcher unchanged by 30-04; route requires the existing session cookie like any other `/api/*` route |

### Behavioral Spot-Checks / Test Runs (this verification session)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Targeted unit tests (30-04 + carried-forward) | `npm test -- settings-backfill-cookie-route settings-page-render-safety root-layout-sync skeleton-token manifest` | 5 files, 17 tests passed | ✓ PASS |
| Full unit suite (regression) | `npm test` | 24 files, 265 tests passed | ✓ PASS |
| Lint | `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`StudySession.tsx`) | ✓ PASS |
| e2e — settings flash (incl. G-30-2 regression guard), filter skeleton, perf budgets | `npx playwright test e2e/settings-flash.spec.ts e2e/study-filter-skeleton.spec.ts e2e/perf.spec.ts` | 12/12 tests passed (incl. `GET /settings renders the real Settings UI, not a server error`, and `/habits` dcl 17–32ms) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LAYOUT-01 | 30-01-PLAN.md, 30-04-PLAN.md | `RootLayout` renders synchronously; settings apply on next navigation with no flash; G-30-2 closed | ✓ SATISFIED | Truths 1, 2, 3, 10; REQUIREMENTS.md marks Complete |
| PERCEPT-01 | 30-02-PLAN.md | Dark-mode skeletons visibly distinct from background | ✓ SATISFIED | Truth 4; UAT Test 1 human-confirmed pass |
| PERCEPT-03 | 30-02-PLAN.md | Content-shaped lesson-filter skeleton, no layout shift | ✓ SATISFIED | Truth 6, live e2e pass |
| PERCEPT-02 | 30-03-PLAN.md | PWA manifest colors match dark theme | ✓ SATISFIED (mechanism) / human_needed (device) | Truth 7 verified structurally; real-device splash confirmation still outstanding (see Human Verification) |
| REGION-01 | 30-03-PLAN.md | Vercel region matches Turso primary region | ✓ SATISFIED | Truth 8, carried forward from prior independent live check |

All 5 requirement IDs declared across the phase's 4 plans (30-01 through 30-04) are accounted for — no orphaned IDs. `.planning/REQUIREMENTS.md`'s checkbox list still shows PERCEPT-01/02/03 and REGION-01 as `[ ]`/"Pending" (only LAYOUT-01 checked) — expected to be updated at phase close-out, not a code gap (unchanged observation from the prior verification pass).

### Outstanding Code-Review Findings (not phase-blocking, flagged for developer decision)

A fresh code review (`30-REVIEW.md`, reviewing all 22 files touched across the whole phase including 30-04's new files) ran **after** the G-30-2 fix and found **0 critical / 3 warning / 1 info**, status `issues_found`. None of these contradict the roadmap's 5 success criteria as literally worded, so they do not block this verification's `human_needed` disposition, but they are unresolved and worth a deliberate accept/fix decision:

- **WR-01** — `POST /api/settings/backfill-cookie` accepts and persists unvalidated color/scale values into the cookie (shape-only `typeof` checks, no hex/range clamping via `lib/settings.ts`'s parsers, unlike `PUT /api/settings`). Latent under the intended call path (`SettingsClient` only ever sends already-validated `initial*` props) but exploitable by any authenticated direct caller of the endpoint.
- **WR-02** — No server-side or no-JS fallback for DB-configured colors: with JavaScript disabled, or on any session with a customized DB color but no `ks_settings` cookie yet (new device, cleared cookies, first load after this deploy), the app silently renders default colors until the user visits `/settings` or re-saves. This is a sharper restatement of the residual gap the prior verification already treated as an accepted, disclosed risk (documented in-code and in `30-REVIEW-FIX.md`) — not a new regression, but the no-JS case is newly called out.
- **WR-03** — `StudyClient`'s lesson-range filter re-fetch (`loadDue`) has no request-sequencing guard; two rapid filter applies within `select-mode` can resolve out of order, and the stale response can silently overwrite the newer one. Pre-existing (introduced with the PERCEPT-03 filter-skeleton work in 30-02), newly surfaced by this second review pass — not a G-30-2 regression.
- **IN-01** — PWA manifest colors are pinned to dark for all users regardless of their actual System/Light/Dark choice — already disclosed as an accepted tradeoff, tracked here so it isn't lost.

**Recommendation:** none of these need to gate this phase's closure (they don't falsify SC1–SC5), but WR-01 and WR-02 in particular should get a deliberate decision (fix now vs. explicitly deferred) before or shortly after shipping, since WR-01 is a real input-validation gap on an authenticated endpoint and WR-02 sharpens a known gap with a previously-undisclosed no-JS case.

### Anti-Patterns Found

None in the 30-04 gap-closure files themselves (`app/api/settings/backfill-cookie/route.ts`, `app/settings/page.tsx`, `components/SettingsClient.tsx`, `tests/settings-backfill-cookie-route.test.ts`, `tests/settings-page-render-safety.test.ts`, `e2e/settings-flash.spec.ts`) — scanned for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and stub-shaped patterns, zero hits. See the Outstanding Code-Review Findings section above for the (non-blocking) warnings the latest full-phase review surfaced.

### Human Verification Required

1. **Real-device "no flash" + PWA cold-launch confirmation**
   **Test:** On a real device/browser: (a) save a settings change on `/settings` and observe the very next navigation for any color/scale flash; (b) cold-launch the installed PWA from a home-screen icon (Android/Chrome, and separately iOS Safari).
   **Expected:** No perceptible flash of a mismatched button/reward color or reading scale after a settings save; no white/mismatched splash frame during PWA cold launch (iOS Safari ignoring manifest `background_color` is a disclosed, accepted residual risk, not a failure).
   **Why human:** This is the exact check UAT Test 2 attempted and never completed — it was blocked by G-30-2's server error before any flash behavior could be observed. G-30-2 is now closed (verified live in this session via `e2e/settings-flash.spec.ts`'s regression-guard test and `tests/settings-page-render-safety.test.ts`), which removes the blocker, but the underlying visual/device-dependent behavior itself has still never actually been observed by a human. Automated tests prove the DOM-attribute/route mechanics, not sub-frame visual flash or real device splash transitions.

(UAT Test 1 — dark-mode skeleton visibility — already passed via human confirmation in `30-UAT.md` and is not re-requested here.)

### Gaps Summary

No blocking gaps. **G-30-2 is confirmed closed**: `app/settings/page.tsx` no longer contains any cookie-mutation call, a permanent regression-guard unit test (`tests/settings-page-render-safety.test.ts`) forbids reintroducing it, and a live e2e run in this verification session (against the production-build harness, the same environment class the original crash was reproduced in) confirms `GET /settings` returns 200 and renders the real Settings UI. All 10 derived observable truths (roadmap Success Criteria 1–5 plus the LAYOUT-01/PERCEPT-01/PERCEPT-03/PERCEPT-02/REGION-01 must-haves, plus the G-30-2 closure truth) are verified structurally and behaviorally — 265/265 unit tests pass, 12/12 relevant e2e tests pass live, lint is clean.

Status remains `human_needed` rather than `passed` for exactly one reason, carried forward and narrowed from the prior pass: the real-device "no flash" + PWA cold-launch check is inherently visual/device-dependent and has still never actually been completed by a human — the previous attempt was blocked by G-30-2 before it could observe anything. (The other previously-outstanding human item, dark-mode skeleton visibility, has since passed UAT and is closed.) A fresh code review also surfaced three non-blocking warnings (WR-01/02/03) and one info item that don't falsify any success criterion but merit a deliberate accept/fix decision — see Outstanding Code-Review Findings above.

---

_Verified: 2026-08-06T22:45:00Z_
_Verifier: Claude (gsd-verifier)_
