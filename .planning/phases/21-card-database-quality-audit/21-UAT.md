---
status: testing
phase: 21-card-database-quality-audit
source: [21-VERIFICATION.md]
started: 2026-07-07T04:10:00Z
updated: 2026-07-07T04:10:00Z
---

## Current Test

number: 1
name: Report readability + plausible counts
expected: |
  Open `.planning/audits/card-audit-2026-07-07.md` and confirm all six check-class sections read clearly with plausible counts for a ~1039-card legacy deck, and that per-finding card ids make the report directly actionable for Phase 22's fix-in-place work.
  Expected: romanization leakage (10 fronts + 3 sentences), 1 zero-safe card (다), 1 zero-sentence card (철), and 2 near-duplicate clusters (보다, 고) are plausible for a Korean-learning legacy deck; every finding line carries a card id in Prisma CUID format (cmqlm…).
awaiting: user response

## Tests

### 1. Report readability + plausible counts

expected: Open `.planning/audits/card-audit-2026-07-07.md` at the end-of-phase review. Confirm all six check-class sections read clearly with plausible counts for a ~1039-card legacy deck, and that per-finding card ids make the report directly actionable for Phase 22's fix-in-place work. Romanization leakage (10 fronts + 3 sentences — mostly grammar-pattern fronts with English descriptive words like "Action verb ~는 + noun" and the "CRT 렌즈" loanword), 1 zero-safe card (다 — "all/completely"), 1 zero-sentence card (철 — "iron"), and 2 near-duplicate clusters (보다, 고) are plausible for a Korean-learning legacy deck. Every finding line carries a card id in Prisma CUID format (cmqlm…).
result: [pending]

### 2. Live smoke test against Turso

expected: Re-run `npx tsx scripts/audit-cards.mts` against the real Turso DB. Confirm exit 0, no Prisma write errors, and a fresh dated report. Console prints the "Read-only audit — no writes to the database." posture line, then per-class `=== Summary ===` blocks with a non-zero total card count, then `process.exit(0)`. The report at `.planning/audits/card-audit-<UTC-date>.md` is (re)written. The script is structurally read-only (grep-provable: only `findMany`, zero write-capable calls), so re-running cannot mutate data.
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
