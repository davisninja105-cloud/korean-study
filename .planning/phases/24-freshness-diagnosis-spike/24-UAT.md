---
status: testing
phase: 24-freshness-diagnosis-spike
source: [24-VERIFICATION.md]
started: 2026-07-11T09:50:00Z
updated: 2026-07-11T09:50:00Z
---

## Current Test

number: 1
name: Re-verify the 4 back-forward-cell verdicts flagged by CR-01 (`/`, `/study`, `/cards`, `/habits`)
expected: |
  Either confirm the recorded verdicts (Stale-RouterCache for `/`; Stale-ClientShell for `/study`, `/cards`, `/habits`) are accurate despite the about:blank recovery-path ambiguity in scripts/diagnose-freshness.mts, or identify that one or more should be reclassified.
awaiting: user response

## Tests

### 1. Re-verify the 4 back-forward-cell verdicts flagged by CR-01
expected: |
  A code review (24-REVIEW.md CR-01) found that the back-forward cell driver's about:blank
  recovery `page.goto()` (scripts/diagnose-freshness.mts ~lines 828-837) fires after the
  fetch-count evidence baseline (`preLen`) is already captured, contradicting the adjacent
  comment's claim that no corrective re-navigation is used. Whether this recovery path
  actually fired during the accepted diagnosis run (and thus corrupted the fetch-count
  evidence for one or more of the 4 affected cells: `/`, `/study`, `/cards`, `/habits`
  back-forward) cannot be determined from static code — the raw run log was not preserved
  per this plan's scope. This was accepted as-is per explicit user decision during phase
  execution, with a caveat note added to 24-DIAGNOSIS.md's "Notes for Phase 25/26" section
  instructing Phase 25's spec author to independently re-verify these 4 verdicts rather than
  encode them blindly.
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
