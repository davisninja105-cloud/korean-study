---
phase: 21
slug: card-database-quality-audit
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-06
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 |
| **Config file** | `vitest.config.ts` (node environment, `@` → repo root alias) |
| **Quick run command** | `npx vitest run tests/audit-checks.test.ts` |
| **Full suite command** | `npm test` (= `vitest run`; 145 tests green as of Phase 20 close) |
| **Estimated runtime** | ~5 seconds (pure functions, no DB) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/audit-checks.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green, plus one live run of `npx tsx scripts/audit-cards.mts` producing a report and a grep confirming zero write-capable Prisma calls
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 1 | AUDIT-02 | V5 — malformed JSON treated as finding, not crash | Blank-safety classification (zero-sentences / zero-safe / unsafe-first / ok) matches `sentenceMatch` semantics | unit | `npx vitest run tests/audit-checks.test.ts` | ❌ W0 | ⬜ pending |
| 21-01-02 | 01 | 1 | AUDIT-02 | — | Romanization checks: gloss-paren fronts NOT flagged; Latin-in-korean flagged | unit | `npx vitest run tests/audit-checks.test.ts` | ❌ W0 | ⬜ pending |
| 21-01-03 | 01 | 1 | AUDIT-02 | V5 — malformed distractors JSON handled via try/catch | Distractor anomaly detection: null / malformed JSON / count≠3 / dup / equals-back | unit | `npx vitest run tests/audit-checks.test.ts` | ❌ W0 | ⬜ pending |
| 21-01-04 | 01 | 1 | AUDIT-02 | — | `normalizedFront` mismatch recompute against current `normalizeFront` | unit | `npx vitest run tests/audit-checks.test.ts` | ❌ W0 | ⬜ pending |
| 21-01-05 | 01 | 1 | AUDIT-02 | — | `superNormalize` clustering parity with `find-duplicates.mjs` behavior (`~(으)면` vs `(으)면` cluster together) | unit | `npx vitest run tests/audit-checks.test.ts` | ❌ W0 | ⬜ pending |
| 21-02-01 | 02 | 2 | AUDIT-01 | Tampering — accidental production write | Script runs end-to-end against live deck, writes dated report, DB untouched (structural grep: zero `create/update/upsert/delete/executeRaw` Prisma calls) | manual + grep | `npx tsx scripts/audit-cards.mts` then `grep -E 'prisma\.\w+\.(create\|update\|upsert\|delete\|executeRaw)' scripts/audit-cards.mts lib/audit-checks.ts` (expect zero hits) | manual (needs Turso creds) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/audit-checks.test.ts` — stubs/tests for AUDIT-02 (all pure check functions: blank-safety classification, romanization heuristics, distractor anomalies, normalizedFront mismatch, superNormalize clustering)
- Framework install: none — Vitest already configured, no Wave 0 install needed

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|--------------------|
| Live-deck audit run produces a correct, readable dated report | AUDIT-01 | Requires real Turso credentials and the actual ~511-card corpus; report content quality (readability, correct counts) is a human judgment call, not assertable in a unit test | Run `npx tsx scripts/audit-cards.mts`, confirm `.planning/audits/card-audit-<date>.md` is created, open it and confirm all six check classes have sections with plausible counts and card `id`s |
| Read-only guarantee holds under the real DB | AUDIT-01 | Structural grep is the primary automated check, but confirming the script actually completes against live Turso without error is a manual smoke test | Run the script once against the real `DATABASE_URL`; confirm exit code 0 and no Prisma write errors/logs |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
