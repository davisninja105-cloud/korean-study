---
status: complete
phase: 23-reliability-bug-fixes
source: [23-01-SUMMARY.md, 23-02-SUMMARY.md, 23-VERIFICATION.md]
started: 2026-07-10T19:35:43Z
updated: 2026-07-10T21:28:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Known-lemmas query failure logs a [study-cards]-prefixed console.error with the rejection reason before degrading to the empty Set
expected: Known-lemmas query failure logs a [study-cards]-prefixed console.error with the rejection reason before degrading to the empty Set
result: pass
source: automated
coverage_id: D1

### 2. Pool-query failure still throws Error('Database error') so the route 500s — existing contract unchanged
expected: Pool-query failure still throws Error('Database error') so the route 500s — existing contract unchanged
result: pass
source: automated
coverage_id: D2

### 3. Happy path emits no [study-cards]-prefixed console.error when both queries fulfill — zero behavior change on the clean path
expected: Happy path emits no [study-cards]-prefixed console.error when both queries fulfill — zero behavior change on the clean path
result: pass
source: automated
coverage_id: D3

### 4. computeMissingEdges pure resolver-diff delegates resolution to resolveDependencyEdges and is idempotent at the pure layer — a second call against the same deck with the first run's result returns [] (RELIABILITY-03 pure layer)
expected: computeMissingEdges pure resolver-diff delegates resolution to resolveDependencyEdges and is idempotent at the pure layer — a second call against the same deck with the first run's result returns [] (RELIABILITY-03 pure layer)
result: pass
source: automated
coverage_id: D1

### 5. relinkAllDependencies server helper + runSync auto-relink hook: a sync completing with failed === 0 && newLessons > 0 relinks forward-reference edges across the WHOLE deck automatically (RELIABILITY-02); cron inherits with zero route changes
expected: relinkAllDependencies server helper + runSync auto-relink hook: a sync completing with failed === 0 && newLessons > 0 relinks forward-reference edges across the WHOLE deck automatically (RELIABILITY-02); cron inherits with zero route changes
result: pass
source: automated
coverage_id: D2

### 6. Real-DB double-run idempotency: a second consecutive relinkAllDependencies() returns edgesCreated: 0 with unchanged CardDependency.count() against the real schema with @@unique present (RELIABILITY-03 DB layer)
expected: Real-DB double-run idempotency: a second consecutive relinkAllDependencies() returns edgesCreated: 0 with unchanged CardDependency.count() against the real schema with @@unique present (RELIABILITY-03 DB layer)
result: pass
source: automated
coverage_id: D3

### 7. Script consolidation: exactly one resolution implementation remains; the old scripts/relink-dependencies.mjs is deleted (replaced by a thin .mts wrapper), and local-resync's final relink pass delegates to the shared helper
expected: Script consolidation: exactly one resolution implementation remains; the old scripts/relink-dependencies.mjs is deleted (replaced by a thin .mts wrapper), and local-resync's final relink pass delegates to the shared helper
result: pass
source: automated
coverage_id: D4

### 8. Relink-failure non-fatal invariant in runSync
expected: The sync's failed count stays 0 when the relink pass throws; the catch logs `[sync] auto-relink failed (non-fatal...)` and leaves all sync accounting untouched; relinkedEdges is absent.
result: pass
verified_by: code inspection (option a) — catch block at lib/sync.ts:338-345 contains only a local relinkMsg binding + console.warn; no assignment to failures/newLessons/newCards/failed; relinkedEdges stays undefined so the conditional spread at line 355 omits it; failed stays failures.length (0 per gate)

## Summary

total: 8
passed: 8
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
