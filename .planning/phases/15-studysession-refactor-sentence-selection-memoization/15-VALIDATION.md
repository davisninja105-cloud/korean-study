---
phase: 15
slug: studysession-refactor-sentence-selection-memoization
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-02
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 (`environment: 'node'`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/sentence-selection.test.ts` |
| **Full suite command** | `npm test` (= `vitest run`) |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/sentence-selection.test.ts`
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green, plus `npm run lint` clean
- **Max feedback latency:** ~5 seconds (Vitest full suite is fast; no watch mode)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | REFACTOR-02 | — | N/A (pure refactor, no new attack surface) | unit | `npx vitest run tests/sentence-selection.test.ts` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 1 | PERF-03 | — | N/A | manual | N/A — see Manual-Only Verifications | N/A | ⬜ pending |
| 15-02-01 | 02 | 2 | REFACTOR-01 | — | N/A | manual | N/A — see Manual-Only Verifications | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/sentence-selection.test.ts` — new file; covers REFACTOR-02 (`selectSentence()` tier pick, hash tie-break, blank-safety override, empty-array and no-safe-sentence edge cases). No existing coverage since the logic currently lives inline in a component render body.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sentence selection recomputes only when `[cardSentences, realCard?.id, reps, needsBlank]` change, not on every unrelated render | PERF-03 | No component-rendering test infrastructure exists (`vitest.config.ts` is `environment: 'node'`; no `@testing-library/react`/jsdom installed — adding it would be new scope beyond this phase) | Code review: confirm the selection call is wrapped in `useMemo` with exactly that dependency array. Optionally instrument with a temporary `console.count` during manual testing to confirm it does not fire on every keystroke/timer tick, then remove the instrumentation before commit. |
| `StudySession` renders each mode through a dedicated `FlashcardMode`/`MultipleChoiceMode`/`FillBlankMode` sub-component, and a live session behaves identically to before (flip, grade, undo, Exposure/Recall toggle, mode switching) | REFACTOR-01 | Same infra gap as above; this is inherently an interactive-session behavior check | Live UAT per Success Criterion 4: start a session in each mode, flip/reveal, grade all four ratings, undo, toggle Exposure↔Recall (flashcard), switch between modes via `/study` mode-select, confirm no regression vs. pre-refactor behavior. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
