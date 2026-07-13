---
phase: 27-e2e-coverage-performance-validation
fixed_at: 2026-07-13T18:53:56Z
review_path: .planning/phases/27-e2e-coverage-performance-validation/27-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 27: Code Review Fix Report

**Fixed at:** 2026-07-13T18:53:56Z
**Source review:** .planning/phases/27-e2e-coverage-performance-validation/27-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (Warning tier; Info findings out of scope per `critical_warning` fix scope)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: `POST /api/review/undo` does not restore `lastReview` to `null` when undoing a card's first-ever review

**Files modified:** `app/api/review/undo/route.ts`
**Commit:** 83f7755
**Applied fix:** Replaced the truthiness ternary (`prevState.lastReview ? new Date(...) : exists.lastReview`) with a presence check (`'lastReview' in prevState`) that correctly distinguishes "the previous value was legitimately `null`" from "the field was absent." When present but `null`, the update now writes `null` instead of falling through to the row's current (post-grade) `lastReview` value. Applied exactly as suggested in REVIEW.md, since the current source matched the reviewer's cited code verbatim.

### WR-02: `POST /api/review/undo` has no top-level try/catch or `prevState` shape validation

**Files modified:** `app/api/review/undo/route.ts`
**Commit:** c6147e3
**Applied fix:** Wrapped `req.json()` in its own try/catch returning a `400 Invalid JSON body` on parse failure (matching the sibling `/api/review` route's pattern). Added an explicit `prevState` shape check (`null`/`undefined`/non-object → `400 prevState required`) before `prevState` is destructured and used. Wrapped the existing `findUnique`/`update` logic in a second try/catch that logs the error server-side and returns a generic `500 Failed to undo review`, consistent with the project's documented Error Handling convention in `.claude/CLAUDE.md`. Applied on top of the WR-01 fix (same file, sequential commits) rather than the review's literal snippet, since the review's own snippet included a `// ...existing findUnique/update logic...` placeholder standing in for the WR-01-updated `lastReview` logic.

## Skipped Issues

None — both in-scope findings were fixed.

---

_Fixed: 2026-07-13T18:53:56Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
