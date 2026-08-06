---
phase: 28
slug: active-recall-study-mode
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-13
---

# Phase 28 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 (unit, node env, `e2e/**` excluded) + Playwright 1.61.1 (e2e, port 3100, workers:1, isolated file `:` SQLite DB, `resetToBaseline()` convention) |
| **Config file** | `vitest.config.ts`, `playwright.config.ts` |
| **Quick run command** | `npx vitest run tests/<file>.test.ts` |
| **Full suite command** | `npm test` (all unit) · `npx playwright test` (full e2e, including perf budgets) |
| **Estimated runtime** | ~5s unit quick run · ~90s full unit suite · ~3-5min full e2e suite |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/active-prompt.test.ts tests/sentence-selection.test.ts` + `npm run lint`
- **After every plan wave:** Run `npm test && npm run build` (tsc via `next build`; lint clean is a project hard rule)
- **Before `/gsd-verify-work`:** `npm test && npx playwright test` — full e2e suite (smoke + freshness×4 + grade-flow + active-flow + perf), not just edited specs
- **Max feedback latency:** ~5s (unit quick run)

---

## Per-Task Verification Map

*Task IDs are assigned by the planner; this table seeds each requirement's test coverage so the planner can slot in Task ID/Plan/Wave once plans exist. Update this table (or let `/gsd-verify-work` cross-reference RESEARCH.md's Phase Requirements → Test Map) after planning.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | MODE-01 | — | Toggle replaces grid; no `mode-flashcard`/`mode-multiple-choice`/`mode-fill-blank` testids | e2e | `npx playwright test e2e/grade-flow.spec.ts e2e/active-flow.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | MODE-02 | — | Passive selected by default on sheet open | e2e | assert selected-segment state in updated `grade-flow.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ACTIVE-01 | — | Sentence-production front = `chosenSentence.translation` | unit + e2e | `npx vitest run tests/active-prompt.test.ts` + English-front assertion in `active-flow.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ACTIVE-02 | — | Hint hidden → tap → `Hint: {card.back}`; resets on advance/undo | e2e (+ manual UAT) | hint-flow steps in `active-flow.spec.ts` (`hint-toggle` testid) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ACTIVE-03 | — | Reveal = Korean via HighlightedSentence + audio + gloss, pinned to `chosenSentence` | unit + e2e | `npx vitest run tests/active-prompt.test.ts` + `active-flow.spec.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ACTIVE-04 | — | Grade bar after reveal; anchoring caption present; FSRS math unchanged | e2e | `active-flow.spec.ts` (`grade-good` visible + caption text) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | ACTIVE-05 | — | State ≤1 degrades silently to exposure; state ≥2 gets production; requeued card re-derives face | unit + e2e | `npx vitest run tests/active-prompt.test.ts` + `active-flow.spec.ts` (mutate helper) | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | CLEANUP-01 | — | Multiple Choice fully removed; survivors intact | build + grep + unit | `npx tsc --noEmit && npm run lint` + dead-symbol grep = 0 hits | ✅ | ⬜ pending |
| TBD | TBD | TBD | CLEANUP-02 | — | Fill-blank/sub-toggle removed; survivors intact | build + grep + unit | same as CLEANUP-01 | ✅ | ⬜ pending |
| TBD | TBD | TBD | CLEANUP-04 | — | Passive flow unregressed | e2e | `npx playwright test e2e/grade-flow.spec.ts` (updated) + full suite at gate | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | D-13 (parity) | — | Sentence-pick parity Active vs Passive when least-unknown sentence is blank-unsafe | unit | `npx vitest run tests/sentence-selection.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/active-prompt.test.ts` — covers ACTIVE-01/03/05 + D-15 (null sentence, practice card, new card, precedence order: practice-before-new-card)
- [ ] `tests/sentence-selection.test.ts` parity case — covers D-13 (extend existing file; fixture builder at :7–9 reusable)
- [ ] `e2e/active-flow.spec.ts` — covers MODE-01, ACTIVE-01..05; `beforeAll: resetToBaseline()` + state-promotion mutation; bounded loop-until-complete pattern (never fixed grade counts)
- [ ] `e2e/helpers/mutate.ts` extension — promote one seeded due card to `state: 2` (keep `nextReview` in the past) without touching `FIXTURE` counts
- [ ] `e2e/grade-flow.spec.ts` update — replace `mode-flashcard` testid with explicit Passive-toggle interaction; travels in the same plan as the ModeSelector rewrite

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Requeued card visibly changes face mid-session (state 1→2 during a session shows exposure→production) | ACTIVE-05 | Visual/UX confirmation of a state transition that's mechanically covered by unit tests but worth eyeballing (research Pitfall N-3) | In dev, grade a state-1 card Good/Easy repeatedly in Active mode until it requeues at state ≥2; confirm the re-shown card renders the English-prompt production face, not the exposure face |
| Hint control placement/micro-interaction feel | ACTIVE-02 | UI-SPEC governs exact styling; "feels right" is subjective | Manual tap-through in dev per UI-SPEC Component Notes |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s (unit quick run)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
