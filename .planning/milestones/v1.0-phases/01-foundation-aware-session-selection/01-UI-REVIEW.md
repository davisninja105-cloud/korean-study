# Phase 01 — UI Review

**Audited:** 2026-06-26  
**Baseline:** Abstract 6-pillar standards (no UI-SPEC.md; Phase 01 is backend-only)  
**Screenshots:** Not captured (no UI code changes; code-only audit)  
**Phase Type:** Backend-only algorithmic phase (no React components, no Tailwind, no visual changes)

---

## Summary

Phase 01 implements a backend session-selection algorithm (`selectSessionCards`) that operates over the whole eligible pool before the size cap, ensuring cards pulled into a study session always have their prerequisites also present and ordered first. This is a pure algorithmic change with **no new UI code**, but it affects the data shape returned from `/api/cards/due`, which feeds directly into `StudySession.tsx`.

**Critical Finding:** A field-shape regression was caught and fixed post-implementation (CR-01 in the SUMMARY). The tests and route now correctly read `nextReview` from the Prisma `review` relation (the real shape the route produces), not a flattened `card.nextReview` field that doesn't exist in production. This fix ensures the seed sort, urgency boost, and tiebreaks all read the correct data.

---

## Pillar Scores

| Pillar | Score | Key Finding |
|--------|-------|-------------|
| 1. Copywriting | 4/4 | No UI text or labels added. No copywriting contract to assess. |
| 2. Visuals | 4/4 | No visual components added. Data ordering affects visual presentation, but sort logic is correct. |
| 3. Color | 4/4 | No color classes, tokens, or theming changes. No CSS added. |
| 4. Typography | 4/4 | No font sizes, weights, or text styling added. No Tailwind classes. |
| 5. Spacing | 4/4 | No spacing utilities or layout changes. No gaps, padding, or margins added. |
| 6. Experience Design | 3/4 | **Data-contract regression fixed post-implementation** — field-shape bug would have caused wrong card ordering in production (CR-01). All other state handling preserved. |

**Overall: 23/24**

---

## Top 3 Priority Fixes

1. **RESOLVED (CR-01):** `nextReview` field-shape regression — fixed in commit `b354d0c`. The selector and sequencer now correctly read `card.review?.nextReview` (the real Prisma shape the route produces with `include: { review: true }`) instead of the flattened `card.nextReview`. This fix is **essential** and was correctly applied post-review. No action needed; already committed.

2. **No additional UI-specific issues found.** Backend algorithm is pure, cycle-safe, and composition with `sequenceCards` is correct. Response JSON shape, empty-result early return, lesson-range filtering, and error handling are all unchanged.

3. **Monitor in production:** Verify that cards now appear in a foundation-first order during study sessions. If a session ever contains a card whose prerequisites are missing, that indicates a data-layer issue (e.g., missing dependency edges or a pool-query regression). As of this audit, no such issue is present in the code.

---

## Detailed Findings

### Pillar 1: Copywriting (4/4)

**Status:** No copywriting added.

- Phase 01 is backend-only; no React components or UI text.
- The route's validation error messages and response shape are unchanged from before.
- No CTA labels, empty/error state copy, or user-facing strings are new.
- No findings.

### Pillar 2: Visuals (4/4)

**Status:** No visual changes. Data ordering is correct.

- No React components, no HTML elements, no visual hierarchy changes.
- The route returns data in a new order (foundation-first), which affects what the user sees on screen. This is intentional and correct.
- `StudySession.tsx` line 130–131 confirms: "Server already returns cards in foundation-first blended order (lib/sequence.ts). Preserve that order — do NOT shuffle here."
- The ordering logic in `selectSessionCards` (lines 183–196 of `lib/sequence.ts`) is:
  - Most-due-first seed sort (nextReview ascending)
  - Within-tier tiebreaks: lesson orderIndex, then id (stable, deterministic)
  - Pure: no Date.now()/Math.random() in comparator
- DFS closure in `addClosure()` (lines 206–219) ensures prerequisites are recursed-first, so they appear before dependents in the result. Cycle-safe via `visiting` recursion-stack guard.
- No visual defects introduced.

### Pillar 3: Color (4/4)

**Status:** No color changes.

- No Tailwind color classes added or modified.
- No CSS custom property tokens added.
- No theming interaction.
- No findings.

### Pillar 4: Typography (4/4)

**Status:** No typography changes.

- No font sizes, weights, or text styling.
- No Tailwind text utilities.
- No findings.

### Pillar 5: Spacing (4/4)

**Status:** No spacing changes.

- No padding, margin, gap, or layout utilities added.
- No Tailwind spacing classes.
- No findings.

### Pillar 6: Experience Design (3/4)

**Status:** Critical field-shape regression was caught and fixed. All other state handling is preserved.

#### Finding 1: **BLOCKER (Fixed in CR-01)** — Field-shape regression in seed sort

**Severity:** Was BLOCKER; now RESOLVED.

**Issue:** The three planned task commits (494d044, 57af011, 60890a3) implemented `selectSessionCards` correctly, but the tests and route both had a critical mismatch with the real Prisma data shape:

- The route fetches cards with `include: { review: true }` (line 50–51 of `app/api/cards/due/route.ts`), so the due date lives at `card.review.nextReview`.
- The test fixture used a flattened shape: `return { id, review: { nextReview } }` (line 11 of original `tests/sequence.test.ts`), which correctly matches the Prisma relation.
- **BUT** both the selector and sequencer then read `card.nextReview` directly (line 131 of the original `lib/sequence.ts` and line 187 in the original selector implementation), which is `undefined` for every real card produced by the route.

**Impact:** In production, the seed sort would have collapsed to lesson orderIndex and id only (the tiebreaks), so the "most-due-first" priority never fired and the prerequisite-pulling behavior would not prioritize overdue dependents correctly. SEL-01 ("less-due prerequisite is pulled into the session") would fail with real data.

**Fix (CR-01, commit b354d0c):**
- Added a pure helper function `nextReviewMs(card: SeqCard): number` (lines 84–88 of `lib/sequence.ts`) that reads `card.review?.nextReview ?? card.nextReview` (relation-first, fallback). This is the single source of truth.
- Updated `sequenceCards` to call `nextReviewMs(card)` in urgencyBoost (line 131) and tiebreak (line 149).
- Updated `selectSessionCards` seed sort to call `nextReviewMs(a)` and `nextReviewMs(b)` (lines 187–189).
- The route is unchanged (no flattening at the boundary), so the JSON response shape is still byte-identical.
- Test fixture now explicitly documents the Prisma relation shape (lines 7–10 of tests/sequence.test.ts), and a new test "prioritizes the most-due card as seed" (lines 95–105) was added to discriminate the bug.

**Verification:** `npm test` (53 pass), `npm run lint` (clean), `npm run build` (clean). All five `selectSessionCards` unit cases pass with real Prisma shape data.

**Status:** This fix is **essential and correctly applied**. No further action needed; already committed and verified.

#### Finding 2: **Non-blocking insight** — Data contract is stable

- The route's `findMany` query, `include` clause, `select` for edges, and `NextResponse.json(ordered)` response are all unchanged.
- StudySession consumes `cards: Card[]` where each card has `id, type, front, back, review?, sentences?[]` (lines 23–42 of `components/StudySession.tsx`).
- All required fields are present in the route's response.
- The route now adds an `unknownCount` property to each sentence (lines 87–94 of `app/api/cards/due/route.ts`), which StudySession accepts as an optional field (line 20: `unknownCount?: number`). This is forward-compatible.
- No data-shape regression remains.

#### Finding 3: **Non-blocking (accepted scope)** — Lesson-range filter interaction

- Decision D-06 in the CONTEXT.md states: "With a lesson-range filter active, a prerequisite outside the selected range is not in the pool and will not be pulled in. This is accepted — the user scoped study to those lessons."
- The route's `lessonClause` (lines 32–36) is unchanged.
- No special handling needed; this is expected behavior.
- Not a defect, but a documented limitation of scope.

---

## Files Audited

- `lib/sequence.ts` — Added `selectSessionCards` selector function (lines 155–231) and helper `nextReviewMs` (lines 84–88). Both are pure. Reuses existing `SeqCard`/`SeqEdge` types and cycle-guard pattern from `sequenceCards`.
- `app/api/cards/due/route.ts` — Rewired to fetch `take: 1000` pool (line 56), whole-pool edges (lines 67–73), and compose `selectSessionCards` then `sequenceCards` (lines 75–76). Response shape and validation unchanged.
- `tests/sequence.test.ts` — Added `selectSessionCards` import (line 2) and five unit cases (lines 67–125). Test fixture corrected to real Prisma shape (lines 7–10); existing `sequenceCards` tests and `card()` fixture helper untouched.
- `app/layout.tsx` — No changes (GlossProvider and ThemeWatcher still mounted as documented in CLAUDE.md).
- `components/StudySession.tsx` — No changes. Consumes `card.review?.nextReview` indirectly via the ordered array from the route; no direct field access to fix.

---

## Registry Safety Audit

- `components.json` does not exist; no shadcn/ui components are registered.
- No third-party UI registries or packages were added in this phase.
- Registry audit: not applicable.

---

## Conclusion

**Phase 01 is complete and correct.** The backend session selector is implemented, unit-tested, and integrated into the route. A critical field-shape regression was caught by code review and fixed in CR-01 (commit b354d0c). The data contract between `/api/cards/due` and `StudySession.tsx` remains stable. All verification steps (test, lint, build) pass. The algorithm is pure, cycle-safe, and delivers the foundation-first promise at the selection layer.

No UI changes were made. No UI regressions detected. The phase is ready for Phase 2 (Maturity- & Known-Word-Aware Presentation), which will add `unknownCount` annotation and the bare-word-first/least-unknown-sentence behavior in `StudySession.tsx`.
