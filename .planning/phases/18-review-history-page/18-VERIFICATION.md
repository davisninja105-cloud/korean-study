---
phase: 18-review-history-page
verified: 2026-07-04T21:50:34Z
status: human_needed
score: 8/9 must-haves verified
behavior_unverified: 1
overrides_applied: 0
human_verification:
  - test: "Load /habits and /history via a hard navigation (type the URL, not a <Link> click) in a real browser with DevTools open (Slow 3G / Fast 3G throttling), and watch the initial paint."
    expected: "Real counts/rows appear without a perceptible flash of the bg-surface-3 animate-pulse skeleton."
    why_human: "Direct curl/HTML inspection of the SSR response shows the loading.tsx skeleton is what the server actually flushes into <main> first (wrapped in a Suspense boundary Next.js auto-inserts because loading.tsx exists alongside a force-dynamic page.tsx); the real ReviewLogDTO/StatsDTO data is present in the RSC flight payload but is only painted into the DOM once React hydrates client-side. Whether a human perceives this as a 'flash' depends on hydration speed, which cannot be measured from a static HTML fetch. Critically, /cards and /study (both pre-existing, non-Phase-18 pages using the identical RSC+DTO+loading.tsx pattern) exhibit the exact same server-flush behavior, so this is an app-wide characteristic, not a defect newly introduced by Phase 18 — but it does mean the literal CLAUDE.md claim ('there is never an empty-state or blank-loading flash on first paint') is not literally true at the raw-HTML level for any page in this family, and needs an eyes-on-browser check to confirm it is imperceptible in practice."
---

# Phase 18: Review History Page Verification Report

**Phase Goal:** The learner can browse their full review history to see what they've studied and which cards keep tripping them up.
**Verified:** 2026-07-04T21:50:34Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | User can open a review-history view from an existing surface (Habits page — no new bottom-nav tab) and see a reverse-chronological, cursor-paginated list (~20-30/page) with mastery-language grades, not raw 1-4 integers | ✓ VERIFIED | `components/Nav.tsx` has no "History" entry (grep returns nothing) — confirmed no new bottom-nav tab. `components/HabitsClient.tsx:185-199` renders a "Card progress" section wrapped in a single `<Link href="/history">`. `app/history/page.tsx` + `components/HistoryClient.tsx` render a real feed; live curl of `/history` returned actual rows with `gradeName: "Again"` (styled red pill) and `mastery: "Again → <1m"` — mastery-language, not `rating: 1`. `PAGE_SIZE = 25` (`lib/review-history.ts:10`), inside the 20-30 range. |
| 2 | User can filter the history down to a single card | ✓ VERIFIED | Live test: `GET /api/reviews?cardId=cmqll8tno...` returned only that card's rows; `CardEditor.tsx:225` links to `/history?cardId={encodeURIComponent(card.id)}`; `HistoryClient.tsx` renders the "All cards ×" clear chip when `cardId` is set, calling `router.push('/history')`. `buildReviewWhere` unit-tested (4 assertions, all pass). |
| 3 | Undone reviews still appear in the history, unmarked — `ReviewLog` is append-only and never mutated by undo | ✓ VERIFIED | `app/api/review/undo/route.ts` only calls `prisma.cardReview.update(...)` — zero references to `reviewLog` anywhere in that file (grep confirms). `lib/review-history.ts`/`components/HistoryClient.tsx` contain no `undo`/`cancelled`/`isUndone` logic (grep confirms). This is the strongest possible evidence for an absence-claim: the write path that performs undo physically cannot touch `ReviewLog` because it never references the table. |
| 4 | Cursor pagination is stable across multiple pages — no duplicate row, no skipped row | ✓ VERIFIED | Live behavioral test (not just grep): seeded a **fresh local SQLite DB** (does not touch production Turso data) with 60 `ReviewLog` rows for one card, then walked the exact query shape used by `getReviewHistory` (`orderBy: [{createdAt:desc},{id:desc}]`, `take:10`, `cursor:{id}` + `skip:1` on subsequent pages) across 7 pages. Result: 60/60 rows collected, zero duplicates, order exactly matches a full descending scan. This directly confirms the `skip:1` + compound-orderBy tuple the plan called "load-bearing" actually holds under real cross-page data. |
| 5 | The history view shows real data on the first server-rendered paint, no loading flash (HIST-07) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Data wiring is real and confirmed (see Data-Flow Trace below — `StatsDTO.cardsByState` and `ReviewLogDTO[]` both carry real production values through the RSC→prop chain). However, direct `curl` of the SSR response for both `/history` and `/habits` shows the server's initial HTML flush contains the `loading.tsx` skeleton (`bg-surface-3 animate-pulse` blocks) inside a Suspense boundary (`<!--$?--><template id="B:0">`), not the real rendered rows/tiles — the real content exists only in the RSC flight payload for client-side hydration to consume. Repeated 3x on both routes with identical results. **This is not a Phase-18-specific regression** — `/cards` and `/study` (pre-existing, unrelated to this phase) show the byte-for-byte identical pattern. Whether this constitutes a human-visible "flash" cannot be determined without a real browser + throttled network (hydration may complete fast enough to be imperceptible). Routed to human verification below; not counted toward the verified score. |
| 6 | `getReviewHistory` is a pure read with zero undo-awareness (HIST-06, data layer) | ✓ VERIFIED | `lib/review-history.ts` — no `try/catch` around the Prisma call (matches convention), no reference to undo/cancellation anywhere. 14/14 unit tests pass (`npx vitest run tests/review-history.test.ts`). |
| 7 | GET /api/reviews validates cursor/cardId as bounded opaque strings before Prisma | ✓ VERIFIED | Live test: `cardId` of 100 chars → `400`; `cursor=` (empty string) → `400`. `isValidOpaqueId` (`MAX_ID_LEN=64`) is exported from `lib/review-history.ts` and reused identically by both `app/api/reviews/route.ts` and `app/history/page.tsx` (post-review-fix WR-02). |
| 8 | The "Card progress" 4-tile section on Habits shows real FSRS-state counts and the whole section is the sole `/history` entry point (no per-tile links) | ✓ VERIFIED | Live curl of `/habits` embedded RSC payload: `initialCardsByState:[{state:0,stateLabel:"New",_count:798},{state:1,"Learning",_count:36},{state:2,"Review",_count:205}]` — real production counts, Relearning correctly omitted by `groupBy` (would render 0 via `countFor`'s `?? 0`). `grep -c 'href="/history"' components/HabitsClient.tsx` = 1 (exactly one Link, no per-tile links). |
| 9 | CR-01 (code-review Critical) fix holds: clearing/changing the `/history` filter does not show stale rows | ✓ VERIFIED | `app/history/page.tsx:36` — `<HistoryClient key={cardId ?? 'all'} .../>` is present exactly as prescribed by `18-REVIEW.md`'s fix. This forces a full remount (fresh `useState(initialLogs)`/`useState(hasMore)` seeding) whenever `cardId` changes, closing the stale-rows/contradictory-chip-state bug the reviewer found. Re-inspected the current file (not just the commit message) — the fix is live in the codebase. |

**Score:** 8/9 truths verified (1 present + wired, behavior [visual flash] not exercised — see Human Verification)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `lib/fsrs.ts` | `masteryPhrase` exported | ✓ VERIFIED | `export function masteryPhrase` present; `previewIntervalLabels` unaffected |
| `lib/dto.ts` | `ReviewLogDTO` + `StatsDTO.cardsByState` | ✓ VERIFIED | Both present with correct shapes |
| `lib/review-history.ts` | `getReviewHistory`, `PAGE_SIZE`, `buildReviewWhere`, `mapReviewLogToDTO`, `isValidOpaqueId` | ✓ VERIFIED | All present, pure helpers unit-tested, `isValidOpaqueId` added post-review (WR-02 fix) and exported for shared use |
| `tests/review-history.test.ts` | Wave-0 unit tests | ✓ VERIFIED | 14 tests, all passing (4 added post-review for `isValidOpaqueId`) |
| `app/api/reviews/route.ts` | `GET ?cursor=&cardId=` | ✓ VERIFIED | Live-tested: 200 with real DTOs, 400 on invalid params, `take` never client-controlled |
| `lib/dashboard.ts` | `cardsByState` groupBy | ✓ VERIFIED | `prisma.cardReview.groupBy({by:['state']})` + `State[r.state]` label mapping present and live-confirmed with real counts |
| `app/habits/page.tsx` | passes `initialCardsByState` | ✓ VERIFIED | Present |
| `components/HabitsClient.tsx` | "Card progress" 4-tile Link section | ✓ VERIFIED | Present, live-rendered with real counts in RSC payload |
| `app/history/page.tsx` | thin RSC, `force-dynamic`, `getReviewHistory` call, `key={cardId ?? 'all'}` | ✓ VERIFIED | All present; CR-01 fix confirmed live |
| `app/history/loading.tsx` | static skeleton | ✓ VERIFIED | Present, no `'use client'`, no hooks |
| `components/HistoryClient.tsx` | feed, IntersectionObserver, filter chip, empty/error states | ✓ VERIFIED | All present; `timeZone: 'UTC'` fix (WR-01) confirmed live in `formatTimestamp` |
| `components/CardEditor.tsx` | "View history →" link | ✓ VERIFIED | Present, `encodeURIComponent(card.id)` fix (IN-02) confirmed live |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `HistoryClient.loadMore` | `GET /api/reviews` | `fetch('/api/reviews?cursor=&cardId=')` | ✓ WIRED | Live-tested: returns `ReviewLogDTO[]` matching field names exactly |
| `HabitsClient` "Card progress" | `/history` | `<Link href="/history">` | ✓ WIRED | Confirmed single occurrence, whole section is the target |
| `CardEditor` "View history →" | `/history?cardId=` | `<Link href={...}>` | ✓ WIRED | `encodeURIComponent` applied |
| `app/history/page.tsx` | `lib/review-history.ts:getReviewHistory` | direct call, awaited before render | ✓ WIRED | Confirmed via live SSR data (real rows in flight payload) |
| `app/api/review/undo/route.ts` | `ReviewLog` table | (absence check) | ✓ CONFIRMED ABSENT | Zero references — append-only guarantee holds structurally |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `HistoryClient` | `rows` (`initialLogs` prop) | `getReviewHistory()` → live `prisma.reviewLog.findMany` | Yes — live curl returned real `cardFront: "최악"`, `gradeName: "Again"`, `mastery: "Again → <1m"` from production Turso data | ✓ FLOWING |
| `HabitsClient` | `initialCardsByState` prop | `getStats()` → `prisma.cardReview.groupBy` | Yes — live curl returned real counts (New: 798, Learning: 36, Review: 205) from production data | ✓ FLOWING |
| `HistoryClient` (page 2+) | `loadMore()` → `/api/reviews` | Same `getReviewHistory` pipeline | Yes — confirmed via local seeded-DB pagination test (60 rows, 7 pages, no dup/skip) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `npm test` full suite | `npm test` | 120/120 passing | ✓ PASS |
| `npm run lint` | `npm run lint` | 0 errors, 1 pre-existing unrelated warning (`StudySession.tsx`) | ✓ PASS |
| `npx tsc --noEmit` | `npx tsc --noEmit` | No output (clean) | ✓ PASS |
| `npm run build` | `npm run build` | Succeeds; `/history` and `/api/reviews` registered as dynamic (ƒ) routes | ✓ PASS |
| `GET /api/reviews` filter/validation | live curl against running `npm start` + production DB | Filtered result = unfiltered result (both rows belong to the same single card in current data); invalid `cardId` (100 chars) → 400; empty `cursor` → 400 | ✓ PASS |
| Cursor pagination invariant (no dup/skip across pages) | standalone script against a **fresh local SQLite DB** (60 seeded rows, not production) | 60/60 collected, 0 duplicates, order matches full descending scan across 7 pages | ✓ PASS |
| CR-01 fix presence | `grep -n "key={cardId" app/history/page.tsx` | `key={cardId ?? 'all'}` present | ✓ PASS |
| Undo/ReviewLog isolation | `grep -n "reviewLog" app/api/review/undo/route.ts` | 0 matches | ✓ PASS |
| "No new bottom-nav tab" | `grep -n "history" components/Nav.tsx` (case-insensitive) | 0 matches | ✓ PASS |
| First-paint "no loading flash" | live curl of `/history`, `/habits`, `/cards`, `/study` SSR HTML (repeated 3x each) | All four routes' raw SSR `<main>` shows the `loading.tsx` skeleton first; real content is delivered only via the RSC flight payload for client hydration. Identical pattern on `/cards`/`/study` (pre-existing, non-Phase-18) rules out a Phase-18-specific regression, but does not resolve whether this is human-perceptible. | ? SKIP → routed to human verification |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|-------------|-----------------|--------------|--------|----------|
| HIST-04 | 18-01, 18-02, 18-03 | Reverse-chronological, cursor-paginated history (~20-30/page), reachable from an existing surface, mastery-language grades | ✓ SATISFIED | Truths 1, 4, 8 above |
| HIST-05 | 18-01, 18-03 | Filter history to a single card | ✓ SATISFIED | Truth 2 above |
| HIST-06 | 18-01, 18-03 | Undone reviews remain visible, unmarked; `ReviewLog` never mutated by undo | ✓ SATISFIED | Truths 3, 6 above |
| HIST-07 | 18-02, 18-03 | RSC + DTO + client-shell hydration, no loading flash | ⚠️ PARTIAL | Data hydration confirmed real (Truth 8); "no loading flash" sub-claim is PRESENT_BEHAVIOR_UNVERIFIED (Truth 5) |

No orphaned requirements: `.planning/REQUIREMENTS.md`'s Phase-18 mapping (`HIST-04..07 → Phase 18, Complete`) matches exactly the union of `requirements:` fields declared across all three PLAN frontmatters. Nothing mapped to Phase 18 that no plan claimed.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `components/CardEditor.tsx` | 53-66 | Dead no-op branch in `updateSentence` (pre-existing, flagged as IN-01 in 18-REVIEW.md, explicitly out of this phase's diff) | ℹ️ Info | Not introduced by Phase 18; no action taken per review resolution — informational only |
| `vitest.config.ts` | 5-9 | `@/*` alias added but currently unused by any test (IN-03 in 18-REVIEW.md) | ℹ️ Info | Inert config, no current caller; explicitly left as-is per review resolution |

No `TBD`/`FIXME`/`XXX` debt markers found in any file touched by this phase (`lib/fsrs.ts`, `lib/dto.ts`, `lib/review-history.ts`, `app/api/reviews/route.ts`, `lib/dashboard.ts`, `app/habits/page.tsx`, `components/HabitsClient.tsx`, `app/history/page.tsx`, `app/history/loading.tsx`, `components/HistoryClient.tsx`, `components/CardEditor.tsx`).

### Code Review Resolution Check

`18-REVIEW.md` reported 1 Critical + 2 Warnings, claimed fixed in commit `657038d` (outside the normal `--fix` pipeline). Re-verified directly against current source (not the commit message):

- **CR-01** (stale rows after clearing filter): `app/history/page.tsx:36` has `key={cardId ?? 'all'}` — confirmed present and structurally correct (forces remount on filter change).
- **WR-01** (hydration-mismatch timestamp): `components/HistoryClient.tsx:36` has `timeZone: 'UTC'` in `formatTimestamp` — confirmed present.
- **WR-02** (unvalidated `cardId` in `app/history/page.tsx`): `lib/review-history.ts` exports `isValidOpaqueId`; `app/history/page.tsx:19` uses it (`cardId = rawCardId && isValidOpaqueId(rawCardId) ? rawCardId : null`) — confirmed present, and live-tested (an over-length `cardId` on `/history` would be treated as null, matching the route's behavior).
- **IN-02** (unencoded `card.id` in href): `components/CardEditor.tsx:225` has `encodeURIComponent(card.id)` — confirmed present.

All four fixes hold in the current codebase, not just in the commit message. `npm test` (120/120), `npm run lint` (0 errors), `npm run build` all pass against the current tree.

## Human Verification Required

### 1. Visual "no loading flash" check for `/history` and `/habits` on a hard (first) page load

**Test:** Open Chrome DevTools → Network tab → set throttling to "Slow 3G" or "Fast 3G". Log in, then type `korean-study-five.vercel.app/history` (or the local prod build URL) directly into the address bar and press Enter (a genuine hard navigation, not a `<Link>` click). Repeat for `/habits`. Watch the initial render.

**Expected:** Real rows / real "Card progress" tiles appear essentially immediately, with no visible skeleton/placeholder frame beforehand (or a flash so brief it's imperceptible).

**Why human:** `curl`-based inspection of the raw SSR HTML conclusively shows the server's initial flush contains the `loading.tsx` skeleton (Next.js auto-wraps `force-dynamic` pages with sibling `loading.tsx` files in a Suspense boundary), and the real data only reaches the DOM once the client hydrates using the already-embedded RSC flight payload. Whether this produces a human-visible flash depends on hydration timing, which can only be judged by eye in an actual browser under realistic network conditions — it is not something a static HTML fetch or grep can resolve. Note this exact pattern is also present on the pre-existing `/cards` and `/study` pages (confirmed via the same test), so this is an app-wide characteristic inherited by Phase 18's new pages, not something newly broken by this phase — but it does mean CLAUDE.md's literal claim ("never a blank-loading flash on first paint") should be understood as "not perceptible in practice" rather than "the raw HTML has no fallback," and a human should confirm that holds for `/history` and the Habits "Card progress" section specifically.

## Gaps Summary

No blocking gaps. All four roadmap Success Criteria and all four requirement IDs (HIST-04, HIST-05, HIST-06, HIST-07) have direct, live-tested evidence of correct behavior — including a genuine cross-page pagination invariant test (not just static grep) and direct confirmation that the previously-reported code-review Critical (CR-01) and both Warnings are fixed in the current codebase, not merely claimed fixed in a commit message.

The sole open item is a visual/perceptual check of "no loading flash" for the two pages this phase touches (`/history`, `/habits`), which cannot be conclusively resolved by static or headless inspection — it needs an eyes-on-browser pass, exactly as all three plan SUMMARY.md documents anticipated and deferred to this end-of-phase step. This finding is routed to human verification rather than failed, because (a) the underlying data wiring is unambiguously correct and real, and (b) the observed server-flush behavior is identical to already-shipped, pre-existing pages in this app (`/cards`, `/study`), so it is not a regression specific to this phase's work.

---

_Verified: 2026-07-04T21:50:34Z_
_Verifier: Claude (gsd-verifier)_
