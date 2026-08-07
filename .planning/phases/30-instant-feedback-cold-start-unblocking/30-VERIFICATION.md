---
phase: 30-instant-feedback-cold-start-unblocking
verified: 2026-08-06T18:25:00Z
status: human_needed
score: 9/9 must-haves verified
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Toggle Settings → Appearance → Dark, then visit /study, /cards, /habits, /history on a throttled connection and confirm the pulsing skeleton shapes (route-level loading.tsx + StudyClient's isFilterLoading skeleton) are clearly visible against the dark background within ~100ms of navigation — never an empty void or outline-only frame."
    expected: "Skeleton shapes read as pulsing placeholders distinct from the surrounding page background in dark mode on all 4 routes; Nav.tsx/Toast.tsx/other unrelated bg-surface-3 consumers still look visually intentional (unchanged)."
    why_human: "tests/skeleton-token.test.ts proves the CSS token values are numerically distinct (#1c2030 vs #0b0f1a); it cannot observe rendered-pixel visibility or perceived contrast. Both 30-02-SUMMARY.md and the plan's own <verification> section flag this as a manual `npm run build && npm start` visual check that was not performed by the executor."
  - test: "On a real device (iOS Safari home-screen launch and Android/Chrome PWA install), cold-launch the app and observe the splash screen transition, and separately reload a page after a settings save on a real device/browser."
    expected: "No perceptible flash of a mismatched color at any point — dark splash consistently through to first paint (Android/Chrome), and no visible jump of button/reward color or reading-scale on the very next navigation after a settings save."
    why_human: "e2e/settings-flash.spec.ts and tests/manifest.test.ts prove the DOM-attribute/config mechanics (computed style, class list, config values) but cannot observe a sub-frame visual flash. Both the 30-01-PLAN.md must_haves (LAYOUT-01 UI-SPEC row) and 30-03-PLAN.md must_haves (PERCEPT-02 UI-SPEC row, iOS Safari ignores manifest background_color) explicitly flag this as needing a real-device/manual confirmation beyond automated coverage."
---

# Phase 30: Instant Feedback & Cold-Start Unblocking Verification Report

**Phase Goal:** Make waiting visible everywhere and strip the two avoidable costs from the cold path — a blocking DB read in `RootLayout` and a possible cross-region hop to Turso. This is the cheapest work in the milestone and the largest single improvement in felt speed; it also establishes the re-measurement baseline every later phase is judged against.
**Verified:** 2026-08-06T18:25:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `RootLayout` (`app/layout.tsx`) is a plain, non-async function with zero `await` calls and no `getLayoutSettings` import — no blocking DB read on the cold path (LAYOUT-01) | ✓ VERIFIED | Source read confirms `export default function RootLayout(` with no `async`; `grep -c "getLayoutSettings" app/layout.tsx` = 0; `tests/root-layout-sync.test.ts` (3 tests) pass — `npm test -- root-layout-sync` green |
| 2 | `PUT /api/settings` writes a non-httpOnly `ks_settings` cookie carrying the validated button/reward/reading values, read by a 3rd pre-paint `<script>` in `app/layout.tsx` that applies `--button`/`--reward`/`--reading-scale`/`hangul-spaced` before first paint, with no flash on a fresh navigation after a save | ✓ VERIFIED | `app/api/settings/route.ts:68-86` confirmed cookie write (no double-encoding — fixed same-plan); `app/layout.tsx:90-94` confirmed pre-paint script; `e2e/settings-flash.spec.ts` (save→reload→computed-style/class assertions) passes live: `npx playwright test e2e/settings-flash.spec.ts` → 2/2 passed |
| 3 | Dark-mode `--skeleton-bg` token exists in all 3 required `globals.css` locations, byte-identical across both dark blocks, and numerically distinct from dark `--background` (PERCEPT-01) | ✓ VERIFIED | `grep -c "\-\-skeleton-bg:" app/globals.css` = 3 (values: `#f3f4f6` light, `#1c2030` dark ×2, distinct from `#0b0f1a` background); `--color-skeleton: var(--skeleton-bg)` present once in `@theme inline`; `tests/skeleton-token.test.ts` (5 tests) pass |
| 4 | All 4 route-level `loading.tsx` files + `StudyClient.tsx`'s 2 inline pulse blocks use `bg-skeleton` exclusively, zero remaining `bg-surface-3` in those 6 locations, all other `bg-surface-3` consumers untouched | ✓ VERIFIED | Per-file grep counts match plan exactly: study=3, cards=8, habits=9, history=3 `bg-skeleton`, 0 `bg-surface-3` in all 4; `StudyClient.tsx` = 10 `bg-skeleton` + 1 remaining (intentional, non-loading) `bg-surface-3` |
| 5 | `isFilterLoading` branch in `StudyClient.tsx` renders a content-shaped skeleton (byte-identical wrapper to real content) instead of a bare spinner, with zero layout shift and no `studyCards.length` reference inside it (PERCEPT-03) | ✓ VERIFIED | `data-testid="filter-loading-skeleton"` present; `Loader2` import fully removed (`grep -c "Loader2"` = 0); `e2e/study-filter-skeleton.spec.ts` (bounding-box comparison) passes live |
| 6 | `app/manifest.ts`'s `background_color`/`theme_color` both equal `'#0b0f1a'`, matching the dark chrome already declared in `app/layout.tsx`'s `viewport.themeColor` and dark `--background` (PERCEPT-02) | ✓ VERIFIED | Source confirms both values `'#0b0f1a'`; `tests/manifest.test.ts` (3 tests, including a full snapshot of unrelated fields) passes |
| 7 | `vercel.json`'s `regions` field is pinned to the Vercel code matching Turso's actual live primary region for `korean-study` (REGION-01) | ✓ VERIFIED | Live `turso db show korean-study` (run independently during this verification) returns `LOCATION: aws-us-west-2`; `vercel.json` contains `"regions": ["pdx1"]`; `pdx1` (Portland, OR) runs on AWS `us-west-2` — an exact infrastructure match, not just nearest-geography |
| 8 | `e2e/perf.spec.ts`'s per-route `PAGE_BUDGETS_MS` map tightens `/habits` to 1500ms while holding `/`, `/study`, `/cards` at 3000ms, and `/habits` passes under the tightened budget (re-measurement baseline) | ✓ VERIFIED | `grep` confirms map + per-route indexing in the loop/assertion; live run: `npx playwright test e2e/perf.spec.ts` → 8/8 passed, `/habits` dcl samples 17–30ms (well under 1500ms) |
| 9 | `ks_settings` cookie is never consulted by any server-side authorization/identity logic — `middleware.ts`'s `ks_auth` gate remains the sole access-control mechanism (prohibition, LAYOUT-01) | ✓ VERIFIED | `grep -rn "ks_settings" app/ components/ middleware.ts lib/` returns hits only in `app/layout.tsx`, `app/settings/page.tsx`, `app/api/settings/route.ts` — never `middleware.ts` |

**Score:** 9/9 truths verified (0 present-but-behavior-unverified)

### Code Review Regression (CR-01) — Fix Verified Landed

`30-REVIEW.md` found one Critical issue: `RootLayout` no longer reads the DB, so the only writer of `ks_settings` was `PUT /api/settings` — any session with pre-existing, DB-persisted custom settings (from before this cookie mechanism shipped) would silently see CSS defaults everywhere until it happened to `PUT` again. `30-REVIEW-FIX.md` claims this was fixed by having `app/settings/page.tsx` re-seed the cookie from `getAllSettings()` on every `/settings` visit. Verified landed:

- `app/settings/page.tsx:33-51` — confirmed: uses `cookies()` from `next/headers`, sets `ks_settings` with the same shape/options as the `PUT` handler, sourced from the already-fetched `getAllSettings()` result (no extra DB round trip).
- `app/layout.tsx`'s pre-paint script comment block (lines 68-89) and `app/settings/page.tsx`'s comment block both explicitly document the **remaining known gap**: a session that never visits `/settings` or issues a `PUT` after this deploy keeps seeing CSS defaults indefinitely. This residual gap was a deliberate, reasoned scope decision (Edge-runtime/Prisma-in-middleware constraint), not a silently dropped fix — documented in both code comments and `30-REVIEW-FIX.md`. Treated here as an accepted, disclosed risk rather than a blocking gap, since SC4's literal wording ("a saved settings change... still applies on the next navigation") is satisfied for the going-forward path, and the partial backfill closes the gap for any session that revisits Settings (the natural entry point for changing these values).

Other review findings (WR-01, WR-02, WR-03) also verified landed:
- **WR-01** (manifest light-theme trade-off undocumented): `app/manifest.ts:10-21` now carries an explanatory comment; values intentionally unchanged (reviewer only asked for disclosure, not a value change).
- **WR-02** (`getLayoutSettings()` dead code): confirmed deleted from `lib/settings.ts` — `grep -rn "getLayoutSettings"` across the repo returns zero hits outside the negative-assertion test.
- **WR-03** (impure `setPhase` updater in `StudyClient.tsx`): confirmed replaced with a `phaseRef` + `useEffect` pattern (`components/StudyClient.tsx:54-55`, `96`) — the side-effecting calls no longer live inside the `setPhase` functional updater.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/layout.tsx` | Non-async `RootLayout`, 3rd pre-paint script | ✓ VERIFIED | Confirmed by source read + unit test |
| `app/api/settings/route.ts` | `PUT` writes `ks_settings` cookie | ✓ VERIFIED | Confirmed by source read + e2e |
| `app/settings/page.tsx` | CR-01 cookie reseed on visit | ✓ VERIFIED | Confirmed by source read |
| `tests/root-layout-sync.test.ts` | Static source-text assertions | ✓ VERIFIED | 3/3 tests pass |
| `e2e/settings-flash.spec.ts` | No-flash behavioral proof | ✓ VERIFIED | 2/2 tests pass live |
| `app/globals.css` | `--skeleton-bg` token, 3 locations + `@theme inline` | ✓ VERIFIED | Confirmed by grep + unit test |
| `app/{study,cards,habits,history}/loading.tsx` | `bg-skeleton` migration | ✓ VERIFIED | Exact per-file counts match plan |
| `components/StudyClient.tsx` | Content-shaped skeleton, `bg-skeleton` migration, `Loader2` removed | ✓ VERIFIED | Confirmed by grep + e2e |
| `tests/skeleton-token.test.ts` | Unit coverage | ✓ VERIFIED | 5/5 tests pass |
| `e2e/study-filter-skeleton.spec.ts` | Bounding-box no-shift proof | ✓ VERIFIED | 1/1 test passes live |
| `app/manifest.ts` | Dark-matched colors | ✓ VERIFIED | Confirmed by source read + unit test |
| `tests/manifest.test.ts` | Unit coverage | ✓ VERIFIED | 3/3 tests pass |
| `vercel.json` | `regions` pinned to Turso's actual region | ✓ VERIFIED | Live `turso db show` cross-checked during this verification |
| `e2e/perf.spec.ts` | Per-route budget map, `/habits` tightened | ✓ VERIFIED | 8/8 tests pass live, `/habits` well under 1500ms |
| `lib/settings.ts` | `getLayoutSettings()` removed (WR-02) | ✓ VERIFIED | Confirmed deleted, no remaining callers |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `app/api/settings/route.ts` (cookie write) | `app/layout.tsx` (pre-paint script) | Shared `ks_settings` JSON shape (`buttonColor`/`buttonFg`/`rewardColor`/`rewardFg`/`readingTextScale`/`readingAid`) | ✓ WIRED | Both sides read/write the same field names; e2e proves round-trip |
| `app/settings/page.tsx` (cookie reseed) | `app/layout.tsx` (pre-paint script) | Same `ks_settings` shape | ✓ WIRED | Source confirmed identical shape/options to the `PUT` writer |
| `middleware.ts` (`ks_auth` gate) | `ks_settings` cookie | Must never consult it | ✓ NOT_WIRED (by design — this is a prohibition, correctly unwired) | `grep` confirms zero references in `middleware.ts` |
| `vercel.json` `regions` | Turso `korean-study` primary location | Live lookup → infra match | ✓ WIRED | `aws-us-west-2` (Turso) ↔ `pdx1` (Vercel, AWS `us-west-2`) — exact match, independently re-verified |

### Behavioral Spot-Checks / Test Runs

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Unit suite (targeted) | `npm test -- root-layout-sync skeleton-token manifest` | 3 files, 11 tests passed | ✓ PASS |
| Full unit suite (regression) | `npm test` | 22 files, 259 tests passed | ✓ PASS |
| Lint | `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`StudySession.tsx`, untouched by this phase) | ✓ PASS |
| e2e — settings flash, filter skeleton, perf budgets | `npx playwright test e2e/settings-flash.spec.ts e2e/study-filter-skeleton.spec.ts e2e/perf.spec.ts` | 11/11 tests passed (incl. `/habits` dcl 17–30ms, well under new 1500ms budget) | ✓ PASS |
| Live Turso region lookup (independent re-verification) | `turso db show korean-study` | `LOCATION: aws-us-west-2`, matches `vercel.json`'s `pdx1` per documented AWS-infra mapping | ✓ PASS |
| `ks_settings` never used for auth | `grep -rn "ks_settings" app/ components/ middleware.ts lib/` | Hits only in the 3 owning files | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| LAYOUT-01 | 30-01-PLAN.md | `RootLayout` renders synchronously; settings apply on next navigation with no flash | ✓ SATISFIED | Truths 1, 2, 9 above; REQUIREMENTS.md already marks this Complete |
| PERCEPT-01 | 30-02-PLAN.md | Dark-mode skeletons visibly distinct from background | ✓ SATISFIED (mechanism) / human_needed (visual) | Truth 3, 4 verified structurally; actual rendered-pixel visibility flagged for human check (see Human Verification) |
| PERCEPT-03 | 30-02-PLAN.md | Content-shaped lesson-filter skeleton, no layout shift | ✓ SATISFIED | Truth 5, live e2e pass |
| PERCEPT-02 | 30-03-PLAN.md | PWA manifest colors match dark theme | ✓ SATISFIED (mechanism) / human_needed (device) | Truth 6 verified structurally; real-device splash confirmation flagged for human check |
| REGION-01 | 30-03-PLAN.md | Vercel region matches Turso primary region | ✓ SATISFIED | Truth 7, independently re-verified live |

**Note:** `.planning/REQUIREMENTS.md`'s checkbox list and per-requirement status table currently show PERCEPT-01/02/03 and REGION-01 as `[ ]` / "Pending" (only LAYOUT-01 is checked/"Complete"). All 5 IDs declared across the phase's 3 plans are accounted for in REQUIREMENTS.md (no orphaned IDs), but the document has not yet been updated to reflect this phase's completion — expected to be updated as part of phase close-out, not a code gap.

### Anti-Patterns Found

None. Scanned all 13 files modified across the phase plus the 5 files touched by the review-fix pass for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER` and stub-shaped patterns — zero hits.

### Human Verification Required

1. **Dark-mode skeleton visibility across routes**
   **Test:** `npm run build && npm start`, toggle Settings → Appearance → Dark, navigate to `/study`, `/cards`, `/habits`, `/history` (ideally with network throttling) and observe the loading skeletons.
   **Expected:** Pulsing skeleton shapes clearly visible against the dark background within ~100ms of navigation — never an empty void or outline-only frame; other `bg-surface-3` consumers (Nav, Toast, etc.) still look visually intentional/unchanged.
   **Why human:** `tests/skeleton-token.test.ts` proves the two colors are numerically distinct; it cannot observe rendered contrast/perceived visibility. Both `30-02-SUMMARY.md` and the plan's own `<verification>` block explicitly flag this manual check as not performed by the executor.

2. **Real-device "no flash" confirmation (settings + PWA splash)**
   **Test:** On a real device/browser: (a) save a settings change and immediately reload on the next navigation; (b) cold-launch the installed PWA from a home-screen icon (Android/Chrome and, separately, iOS Safari).
   **Expected:** No perceptible flash of a mismatched button/reward color or reading scale after a settings save; no white/mismatched splash frame at any point during PWA cold launch.
   **Why human:** DOM-attribute assertions (`e2e/settings-flash.spec.ts`) and manifest unit tests prove the underlying mechanics but cannot observe a sub-frame visual flash. Both `30-01-PLAN.md`'s must_haves (backstop-tagged UI-SPEC row) and `30-03-PLAN.md`'s must_haves (PERCEPT-02 UI-SPEC row, noting iOS Safari ignores manifest `background_color`) explicitly call for this real-device pass.

### Gaps Summary

No blocking gaps. All 9 derived observable truths (roadmap Success Criteria 1–5 plus the LAYOUT-01/PERCEPT-01/PERCEPT-03/PERCEPT-02/REGION-01 must_haves from the 3 plans) are structurally and behaviorally verified against the actual codebase — source reads, unit tests (11 new + 259 total passing), and live e2e runs (11/11 passing, including a fresh, independent `turso db show` region cross-check) all confirm the claims in 30-01/02/03-SUMMARY.md and 30-REVIEW-FIX.md. The one Critical code-review regression (CR-01) has its fix landed and verified in the actual source; the small residual gap it left is deliberately scoped, documented in code comments and 30-REVIEW-FIX.md, and does not contradict the phase's literal success criteria.

Status is `human_needed` rather than `passed` solely because two of the phase's own truths are inherently visual/device-dependent (dark-mode skeleton contrast, and real-device flash-free cold launch/reload) — the plans themselves flagged these as needing a held-out human/manual check beyond automated coverage, and the phase's own SUMMARY.md documents that this manual pass was not performed by the executor. No code changes are being requested; this is a request for a human UAT pass before the phase is considered fully closed.

---

_Verified: 2026-08-06T18:25:00Z_
_Verifier: Claude (gsd-verifier)_
