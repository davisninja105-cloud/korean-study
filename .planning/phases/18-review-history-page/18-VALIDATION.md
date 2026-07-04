---
phase: 18
slug: review-history-page
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-04
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 (installed; `npm test` → `vitest run`) |
| **Config file** | `vitest.config.ts` (environment: `'node'`) |
| **Quick run command** | `npx vitest run tests/review-history.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds (pure-function unit tests only, no DB/API integration tests in this project's existing suite) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/review-history.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite green + a manual scroll-through UAT against a seeded local `dev.db` (cursor pagination and RSC-first-paint guarantees have no live-DB test harness in this project)
- **Max feedback latency:** ~5 seconds (unit tests); manual UAT is a one-time end-of-phase gate, not per-task

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 18-01-0N | 01 | 1 | HIST-04 | — | Grade name + mastery phrase mapping for a review log row is pure and correct | unit | `npx vitest run tests/review-history.test.ts -t "gradeName"` | ❌ Wave 0 | ⬜ pending |
| 18-01-0N | 01 | 1 | HIST-05 | V5 Input Validation | `cardId`/`cursor` query params are validated (non-empty, bounded length) before reaching Prisma | unit (if `where`-clause construction is factored into a pure helper) | `npx vitest run tests/review-history.test.ts -t "where clause"` | ❌ Wave 0 | ⬜ pending |
| — | — | — | HIST-04 | — | Cursor/orderBy query shape produces stable, non-duplicated pagination across 2+ pages | manual-only | N/A — scroll-through UAT against seeded local `dev.db` | N/A | ⬜ pending |
| — | — | — | HIST-06 | — | Undo never mutates/deletes `ReviewLog` rows | code inspection (already verified by Phase 17 — `app/api/review/undo/route.ts` has no `reviewLog` reference); regression check that this phase's new query adds no undo-awareness | manual/code review | N/A | ⬜ pending |
| — | — | — | HIST-07 | — | History page shows real data on first server-rendered paint, no loading flash | manual-only | `npm run build && npm start` then load `/history` and inspect (per CLAUDE.md's documented `next dev` vs `next start` gotcha) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/review-history.test.ts` — covers HIST-04 (grade name + mastery phrase mapping) and, if `where`-clause construction is factored into a pure helper, HIST-05
- No framework install needed — Vitest already configured and working

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cursor pagination has no duplicate/skipped rows across 2+ scroll-loaded pages | HIST-04 | No live-DB test harness exists in this project's current test setup (existing suite covers only pure `lib/` functions) | Seed local `dev.db` with 50+ `ReviewLog` rows, load `/history`, scroll through 2+ pages, confirm no `ReviewLog.id` appears twice and no row is skipped |
| History page shows real data on first server-rendered paint, no loading flash | HIST-07 | Structural RSC guarantee, not unit-testable; `next dev` masks this (per CLAUDE.md) | `npm run build && npm start`, load `/history` directly (not via client nav), confirm rows are present in the initial HTML with no skeleton/blank flash |
| Undo leaves history unmarked/unchanged | HIST-06 | Requires a live review + undo cycle against real DB state | Grade a card, undo it, open `/history`, confirm the review still appears exactly as recorded (no "undone" marker, no removal) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s (unit); manual UAT is a one-time phase-gate exception per Research's noted absence of a live-DB test harness
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
