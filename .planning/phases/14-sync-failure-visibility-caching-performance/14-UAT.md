---
status: complete
phase: 14-sync-failure-visibility-caching-performance
source: [14-VERIFICATION.md]
started: 2026-07-02T19:35:00Z
updated: "2026-07-02T21:05:36Z"
---

## Current Test

[testing complete]

## Tests

### 1. SYNC-01 live sync against a deliberately-failing lesson

With the dev server running and authenticated, tap Sync in Settings ▸ Advanced against the tutor's Google Doc with a lesson that fails extraction (or yields 0 cards, or fails the DB write).

expected: The SyncPanel failures list shows the lesson's content excerpt (its first non-empty line, ~48 chars, quoted) plus a safe category — e.g. "<first line>…" — extraction failed (will retry on next sync) — NOT 'Lesson 1' and NOT the raw Prisma/extraction error message. The raw error appears only in the server console.
result: pass

### 2. PERF-01 live multi-card sync (CardDependency edge creation)

Tap Sync against a lesson whose cards carry `components` referencing other cards (with components) already in the deck; then inspect the CardDependency table (or trigger a study session that exercises prerequisite ordering).

expected: CardDependency edges form for the common case (card with components → prerequisite card with components; self-edges skipped; link failures non-fatal). Edges match the pre-refactor per-lesson re-query behavior for the common case. (This is the ⚠️ PRESENT_BEHAVIOR_UNVERIFIED truth #4 — structurally wired, DB state transition not exercised by any test.)
result: skipped
reason: "user opted to skip live multi-card sync test"

### 3. PERF-01 WR-01 edge case (optional, lower priority)

Sync a lesson where a pre-existing card X (currently with components) is re-extracted with ZERO components in this sync's UPDATE branch, AND another card Y in the same lesson has components referencing X.

expected: With MAX_LESSONS_PER_SYNC=1 this is limited to intra-lesson forward references. The new code creates edge Y→X (stale keyToId entry); the original post-upsert re-query would NOT have created it (X lost its components → excluded by where:{components:{not:null}}). This is a documented behavior difference (14-REVIEW.md WR-01), not a regression in the common case. If observed, the fix is to add `keyToId.delete(nf)` in the UPDATE branch when card.components.length === 0. This item is OPTIONAL — it is outside the plan 14-01 must_have's explicit "common case" scope.
result: pass

## Summary

total: 3
passed: 2
issues: 0
pending: 0
skipped: 1
blocked: 0

## Gaps
