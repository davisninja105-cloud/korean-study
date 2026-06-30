---
phase: 10-cards-hydration-api-parallelization
verified: 2026-06-30T02:00:00Z
status: human_needed
score: 4/6 must-haves verified
behavior_unverified: 2
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Open http://localhost:3000/cards in a production build (npm run build && npm run start) with a hard reload and disabled cache. Observe first paint."
    expected: "The real card list renders with the page — the 'No cards yet. Sync your Google Doc to get started.' empty-state text never flashes before the list appears."
    why_human: "RSC empty-state-flash is a paint-timing race that only surfaces in a production build; automated grep cannot observe first-paint rendering order."
  - test: "Open Browser DevTools Console on http://localhost:3000/cards after a hard reload in a production build."
    expected: "No error message containing 'Only plain objects can be passed to Client Components' and no 'Date objects are not supported' error."
    why_human: "Next.js serialization errors surface at runtime in the browser console; they do not appear at compile time or in grep output."
behavior_unverified_items:
  - truth: "On first paint, the cards page shows the user's real card list — the 'No cards yet' empty state never flashes when the DB has cards (RSC-01)"
    test: "Production build hard reload of http://localhost:3000/cards"
    expected: "Real card list present in initial HTML; empty-state div never visible before hydration"
    why_human: "RSC vs. useEffect timing is a runtime paint property; file-level grep shows state initialization from props but cannot prove it beats first paint"
  - truth: "No raw Prisma Date object crosses the server→client boundary — every DateTime field is serialized to an ISO string via DTO types (RSC-05)"
    test: "Check browser DevTools console on production build of /cards"
    expected: "Zero serialization errors; all date fields in props are strings"
    why_human: "Code inspection confirms .toISOString() is called on all 7 DateTime fields, but runtime correctness (no missing fields) requires a browser-console check"
---

# Phase 10: Cards Hydration + API Parallelization Verification Report

**Phase Goal:** The cards page renders its real card list on first paint (no empty-state flash), and study sessions start faster because `/api/cards/due` no longer waits on serial round-trips. This phase also establishes the RSC + client-shell + DTO pattern that the later page conversions reuse.
**Verified:** 2026-06-30T02:00:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | On first paint, the cards page shows the user's real card list — no empty-state flash when DB has cards (RSC-01 / SC#1) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `app/cards/page.tsx` is an `async` server component (no `'use client'`); `cards` state in `CardsClient` is initialized from prop `useState<CardDTO[]>(initialCards)` (line 37). Structural path exists for server-side data to arrive in initial HTML. Runtime flash behavior requires human validation in a production build. |
| 2 | Search, filter, edit, delete, add, view toggle, swipe-delete, tap-to-gloss, and group collapse all work (SC#2) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | All handlers and JSX from the original page are present in `CardsClient.tsx`: `handleDelete` (line 91), `handleSave` (line 102), `handleAdd` (line 113), `toggleCollapse` (line 134), `filteredCards` derivation (line 66), `groupedCards` (line 141), `allSentences` (line 153), `Sheet` for filters/edit/add (lines 391, 455, 495), `SwipeRow` (line 256), `HighlightedSentence` with `onWordTap` (lines 313, 365). No useEffect for initial load. Behavioral correctness requires human walkthrough. |
| 3 | No raw Prisma Date object crosses the server→client boundary — all DateTime fields serialized to ISO strings (RSC-05 / SC#3) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | `grep -c "toISOString" app/cards/page.tsx` returns **7** — one per DateTime field: `Card.createdAt`, `Card.updatedAt`, `Lesson.createdAt`, `CardReview.nextReview`, `CardReview.lastReview`, `Sentence.createdAt`, `Sentence.updatedAt`. All DTO interfaces (`CardDTO`, `SentenceDTO`, `ReviewDTO`, `LessonRefDTO`) type these fields as `string`. Code path is complete. Runtime absence of serialization errors requires browser console check in a production build. |
| 4 | Pool-fetch and known-lemmas queries in `/api/cards/due` run concurrently via Promise.allSettled (DB-01 / SC#4) | ✓ VERIFIED | `Promise.allSettled` at line 46 of `app/api/cards/due/route.ts` wraps both the pool query (`prisma.card.findMany` with `review/lesson/sentences` include) and the known-lemmas query (`prisma.card.findMany` with `select: { normalizedFront: true }`). The edge query (`cardDependency.findMany`) is still sequential after `cards` is assigned (line 88) — correct, as it depends on pool IDs. |
| 5 | Pool rejection returns 500; known-lemmas rejection degrades to empty Set — graceful degradation (SC#5) | ✓ VERIFIED | Line 74: `if (poolResult.status === 'rejected') { return NextResponse.json({ error: 'Database error' }, { status: 500 }) }`. Line 100–103: `knownLemmas = new Set(knownRowsResult.status === 'fulfilled' ? knownRowsResult.value.map(r => r.normalizedFront) : [])`. Whole handler is wrapped in `try/catch` (lines 8 and 116–118). |
| 6 | Output semantics identical to serial implementation on happy path — ordering and unknownCount annotation unchanged | ✓ VERIFIED | `selectSessionCards` → `sequenceCards` → annotation loop (lines 96–113) are unchanged from the serial version. `knownLemmas` Set feeds `countUnknownWords` identically. Final response is `NextResponse.json(ordered)`. No reordering of query results — `Promise.allSettled` preserves array order by index. |

**Score:** 3/6 truths presence-verified + 3/6 behavior-present-unverified = 3 verified (no test exercises the paint behavior or serialization at runtime)

Correction per scoring rules: VERIFIED truths are #4, #5, #6 = 3 truths fully verified. Truths #1, #2, #3 are ⚠️ PRESENT_BEHAVIOR_UNVERIFIED (code is present and wired; runtime behavior requires human check).

**Score: 3/6 verified | behavior_unverified: 3**

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `app/cards/page.tsx` | Async server component, no `'use client'`, imports prisma + CardsClient | ✓ VERIFIED | First non-empty line is `import { prisma }...` (no `'use client'`); `export default async function CardsPage()` at line 62; `Promise.all` for two Prisma queries; serializes 7 DateTime fields. |
| `components/CardsClient.tsx` | `'use client'` first line, no initial-load useEffect, state from props | ✓ VERIFIED | Line 1: `'use client'`; `useState<CardDTO[]>(initialCards)` at line 37; `grep useEffect` returns no matches; lazy initializers for `lessonFrom`/`lessonTo` (lines 52–57). |
| Inline DTO types in `app/cards/page.tsx` | `CardDTO`, `SentenceDTO`, `ReviewDTO`, `LessonRefDTO`, `LessonRefItem` | ✓ VERIFIED | All five interfaces exported from `app/cards/page.tsx` (lines 8–60); all DateTime fields typed as `string`. |
| `app/api/cards/due/route.ts` | Pool + known-lemmas via Promise.allSettled; graceful degradation | ✓ VERIFIED | See truth #4 and #5 above. |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `app/cards/page.tsx` | `components/CardsClient.tsx` | Props `initialCards: CardDTO[]`, `initialLessons: LessonRefItem[]` | ✓ WIRED | `return <CardsClient initialCards={cardDTOs} initialLessons={lessons} />` at line 100 of page.tsx; CardsClient `Props` interface matches. |
| `CardsClient.tsx` state | `initialCards` prop | `useState<CardDTO[]>(initialCards)` — no initial-load useEffect | ✓ WIRED | Line 37; lazy initializers for lessonFrom/lessonTo at lines 52–57. |
| `Promise.allSettled([pool, knownLemmas])` | Sequential edge query | Pool result unwrapped before edge query filters by `cards.map(c => c.id)` | ✓ WIRED | Pool assigned to `cards` (line 77); `ids = cards.map(c => c.id)` (line 87); edge query uses `{ in: ids }`. |
| `knownRowsResult` | `knownLemmas` Set | Ternary on `status === 'fulfilled'` or `[]` fallback | ✓ WIRED | Lines 100–103. |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `CardsClient.tsx` | `cards` (line 37) | `initialCards` prop from `app/cards/page.tsx` Prisma `card.findMany` | Yes — `prisma.card.findMany` with review/lesson/sentences include | ✓ FLOWING |
| `CardsClient.tsx` | `lessons` (line 50) | `initialLessons` prop from `app/cards/page.tsx` Prisma `lesson.findMany` | Yes — `prisma.lesson.findMany` ordered by orderIndex | ✓ FLOWING |
| `app/api/cards/due/route.ts` | `cards` pool (line 77) | `prisma.card.findMany` with due/ahead scope filter | Yes — real DB query | ✓ FLOWING |
| `app/api/cards/due/route.ts` | `knownLemmas` Set (line 100) | `prisma.card.findMany` where state ≥ 1 | Yes, with graceful empty-Set fallback on failure | ✓ FLOWING |

---

### Behavioral Spot-Checks

Step 7b: SKIPPED — behavioral truths #1, #2, #3 require a running production server (next build + next start) plus browser inspection. No named unit tests exist for RSC paint timing or Next.js serialization; these are inherently manual runtime checks. The runnable portion (route compilation) was confirmed via commit evidence (`npm run build` exits 0 per 10-02-SUMMARY).

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| RSC-01 | 10-01-PLAN.md | Cards page receives initial card list from server; no "no cards stored yet" flash | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Structural path verified; first-paint behavior needs human check |
| RSC-05 | 10-01-PLAN.md | All server→client boundaries use DTO types; no raw Prisma Dates | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | 7x `.toISOString()` calls verified; runtime absence of errors needs browser check |
| DB-01 | 10-02-PLAN.md | `/api/cards/due` runs pool + known-lemmas queries concurrently | ✓ SATISFIED | `Promise.allSettled` verified in route; graceful degradation verified |

Note: REQUIREMENTS.md states DB-01 uses `Promise.all` — the implementation correctly uses `Promise.allSettled` instead, which is strictly better (graceful degradation). This is an improvement over the stated requirement wording, not a deviation from the intent.

---

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `app/api/cards/due/route.ts` | 9 | `try {` block with inconsistent indentation (body is at wrong indent level vs surrounding code) | ℹ️ Info | Visual inconsistency only — no behavioral impact. The `try/catch` wraps the full handler body correctly. |

No TBD/FIXME/XXX markers found in modified files. No stub patterns (empty returns, placeholder JSX) found. No hardcoded empty data passed as props.

**Note on `loadCards()` removal:** The PLAN and the first version of SUMMARY claimed `loadCards()` (a `fetch('/api/cards').then(setCards)` refetch) would be preserved as the post-mutation refresh path. Commit `9335250` removed it as dead code — all mutation handlers (delete at line 93, add at line 117, save via `handleSave` at line 102) use optimistic state updates directly instead of a full refetch. This is a deviation from the plan's stated architecture, but the acceptance criterion's *intent* (post-mutation state reflects actual DB state) is satisfied: delete removes the row from state, add prepends the API-returned card, and save merges the editor shape onto the existing CardDTO. The deviation is cleaner than the plan's approach — no stale-refetch risk.

---

### Human Verification Required

#### 1. RSC-01: No empty-state flash on first paint

**Test:** Run `npm run build && npm run start`. Navigate to `http://localhost:3000/cards` with a hard reload (Shift+Reload or disabled cache in DevTools).
**Expected:** The real card list (if DB has cards) renders in the initial HTML — you must NOT see the "No cards yet. Sync your Google Doc to get started." empty-state text flash before the list appears.
**Why human:** RSC paint timing is a browser-observable property. The structural path (async server component passing initialCards to CardsClient's useState) is wired correctly per code inspection, but whether the list arrives before React hydration paints the initial DOM can only be confirmed visually in a production build (Next.js dev mode does not exercise RSC the same way).

#### 2. RSC-05: No serialization errors in browser console

**Test:** On the production build at `http://localhost:3000/cards`, open DevTools Console and check for errors on page load.
**Expected:** Zero errors containing "Only plain objects can be passed to Client Components" or "Date objects are not supported in Client Components."
**Why human:** Next.js serialization errors surface at runtime in the browser console. Code inspection confirms all 7 DateTime fields call `.toISOString()` before the boundary, but a missed field or an edge case (e.g., a card with no review, no lesson) would only be caught by a browser-side runtime check.

#### 3. Interaction preservation

**Test:** On the production build, exercise all interaction types: type in the search box, open the filter Sheet and change type/lesson range, toggle "Reading practice" / "Cards" views, edit a card, delete a card (confirm the browser-native `Delete this card?` dialog appears), add a card, swipe a row left to reveal the Delete action, tap a Korean sentence word for the gloss popover, collapse a type-group header.
**Expected:** All interactions behave identically to the pre-conversion cards page.
**Why human:** Interaction preservation after a refactor of this scope (all interactivity moved from page.tsx to CardsClient.tsx) requires hands-on UI verification. Each interaction type involves different state paths and event handlers.

---

### Gaps Summary

No hard gaps were found. All implementation artifacts exist, are substantive, and are correctly wired. The three outstanding items are behavior-unverified truths that require a human runtime check in a production build:

1. RSC-01 (paint timing) — code path present; runtime flash behavior unverifiable by grep
2. RSC-05 (serialization) — 7x `.toISOString()` present; runtime absence of errors needs browser console check
3. Interaction preservation — all handlers present; end-to-end behavior needs human walkthrough

Per the 10-01-SUMMARY, a human checkpoint (Task 3) was completed during execution and returned "APPROVED." The SUMMARY's human verification section documents passing this checkpoint. However, per verification protocol, SUMMARY.md claims are not evidence — independent human confirmation via the steps above is required before this phase can be marked fully passed.

---

_Verified: 2026-06-30T02:00:00Z_
_Verifier: Claude (gsd-verifier)_
