# Roadmap: Korean Study — Foundation-First Study

## Milestones

- ✅ **v1.0 Foundation-First Study** — Phases 1–2 (shipped 2026-06-26)
- ✅ **v1.1 UI/UX Polish** — Phases 3–8 + 8.1 (shipped 2026-06-29)
- ✅ **v1.2 Performance & Snappiness** — Phases 9–12 (shipped 2026-07-01)
- ✅ **v1.3 Reliability & Hardening** — Phases 13–15 (shipped 2026-07-03)
- ✅ **v1.4 Knowledge Graph Quality & History** — Phases 16–19 (shipped 2026-07-05)
- ✅ **v1.5 Extraction Quality & Reliability** — Phases 20–23 (shipped 2026-07-10)
- ✅ **v1.6 Freshness, Performance & E2E Testing** — Phases 24–27 (shipped 2026-07-14)
- 🚧 **v1.7 Active Recall Study Mode** — Phases 28–29 (in progress)

## Phases

<details>
<summary>✅ v1.0 Foundation-First Study (Phases 1–2) — SHIPPED 2026-06-26</summary>

- [x] Phase 1: Foundation-Aware Session Selection (1/1 plans) — completed 2026-06-26
- [x] Phase 2: Maturity- & Known-Word-Aware Presentation (2/2 plans) — completed 2026-06-26

See `.planning/milestones/v1.0-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.1 UI/UX Polish (Phases 3–8 + 8.1) — SHIPPED 2026-06-29</summary>

- [x] Phase 3: UI/UX Audit (1/1 plans) — completed 2026-06-27
- [x] Phase 4: Design System Tokens & Sweep (3/3 plans) — completed 2026-06-27
- [x] Phase 5: Study Session Polish (2/2 plans) — completed 2026-06-28
- [x] Phase 6: Home Dashboard Polish (1/1 plan) — completed 2026-06-28
- [x] Phase 7: Secondary Screens & Navigation (2/2 plans) — completed 2026-06-29
- [x] Phase 8: Accessibility & PWA Baseline (2/2 plans) — completed 2026-06-29
- [x] Phase 8.1: Close gap NAV-01 — extend --sab to Sheet.tsx + StudySession.tsx (1/1 inline fix) — completed 2026-06-29

See `.planning/milestones/v1.1-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.2 Performance & Snappiness (Phases 9–12) — SHIPPED 2026-07-01</summary>

- [x] Phase 9: Skeleton Loading Screens (1/1 plans) — completed 2026-06-29
- [x] Phase 10: Cards Hydration + API Parallelization (2/2 plans) — completed 2026-06-30
- [x] Phase 11: Study Page Hydration & Interaction Polish (3/3 plans) — completed 2026-06-30
- [x] Phase 12: Home & Habits Hydration (3/3 plans) — completed 2026-07-01

See `.planning/milestones/v1.2-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.3 Reliability & Hardening (Phases 13–15) — SHIPPED 2026-07-03</summary>

- [x] Phase 13: Review API Hardening & Save Reliability (2/2 plans) — completed 2026-07-02
- [x] Phase 14: Sync Failure Visibility & Caching Performance (2/2 plans) — completed 2026-07-02
- [x] Phase 15: StudySession Refactor & Sentence-Selection Memoization (2/2 plans) — completed 2026-07-03

See `.planning/milestones/v1.3-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.4 Knowledge Graph Quality & History (Phases 16–19) — SHIPPED 2026-07-05</summary>

- [x] Phase 16: Components[] Filter Fix (4/4 plans) — completed 2026-07-03
- [x] Phase 17: ReviewLog Schema & Idempotent Write Path (5/5 plans) — completed 2026-07-05
- [x] Phase 18: Review History Page (3/3 plans) — completed 2026-07-04
- [x] Phase 19: Vercel Cron Auto-Sync (3/3 plans) — completed 2026-07-05

See `.planning/milestones/v1.4-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.5 Extraction Quality & Reliability (Phases 20–23) — SHIPPED 2026-07-10</summary>

- [x] Phase 20: Extraction Pipeline Hardening (2/2 plans) — completed 2026-07-06
- [x] Phase 21: Card Database Quality Audit (2/2 plans) — completed 2026-07-07
- [x] Phase 22: Findings-Driven Prompt Improvement & Corpus Fixes (3/3 plans) — completed 2026-07-10
- [x] Phase 23: Reliability Bug Fixes (2/2 plans) — completed 2026-07-10

See `.planning/milestones/v1.5-ROADMAP.md` for full phase details.

</details>

<details>
<summary>✅ v1.6 Freshness, Performance & E2E Testing (Phases 24–27) — SHIPPED 2026-07-14</summary>

- [x] Phase 24: Freshness Diagnosis Spike (2/2 plans) — completed 2026-07-11
- [x] Phase 25: E2E Test Infrastructure & Baselines (3/3 plans) — completed 2026-07-12
- [x] Phase 26: Freshness Fix (6/6 plans) — completed 2026-07-13
- [x] Phase 27: E2E Coverage & Performance Validation (3/3 plans) — completed 2026-07-13

See `.planning/milestones/v1.6-ROADMAP.md` for full phase details.

</details>

### 🚧 v1.7 Active Recall Study Mode (In Progress)

**Milestone Goal:** Give the study session a real active-recall path — a Passive/Active toggle on the mode-select screen that swaps flashcard exposure for a "translate the English sentence" production exercise — while retiring Multiple Choice and the standalone Fill-in-the-Blank mode and the now-unused distractor generation pipeline.

## Phase Details

### Phase 28: Active Recall Study Mode

**Goal**: Replace the /study 3-mode grid (Flashcards / Multiple Choice / Fill-in-the-Blank) and the Exposure/Recall sub-toggle with a single Passive/Active toggle (Passive default), retire Multiple Choice and standalone Fill-in-the-Blank entirely, and add the Active production mode (English sentence prompt → tap-to-reveal Korean + audio → self-grade). Remove the old modes first via a `StudyMode` type-narrowing pass so the compiler enumerates stale references, then extend `FlashcardMode` with the Active front-face branch into the smaller surface.
**Depends on**: Nothing (first phase of v1.7)
**Requirements**: MODE-01, MODE-02, ACTIVE-01, ACTIVE-02, ACTIVE-03, ACTIVE-04, ACTIVE-05, CLEANUP-01, CLEANUP-02, CLEANUP-04
**Success Criteria** (what must be TRUE):

  1. On /study, the user sees one Passive/Active toggle — no 3-mode grid, no Multiple Choice, no standalone Fill-in-the-Blank, no Exposure/Recall sub-toggle — and it opens on Passive by default.
  2. In Active mode the card front shows the selected sentence's English translation; tapping the main reveal flips to the full Korean sentence with the target expression highlighted, plus audio playback and tap-to-gloss.
  3. An optional "tap to reveal hint" control (hidden until tapped) surfaces the card's English back gloss, separate from and preceding the main answer reveal.
  4. After revealing, the user self-grades on the existing Again/Hard/Good/Easy bar, with reveal copy anchoring the grade to the highlighted target expression rather than the whole sentence.
  5. A brand-new card (FSRS state 0/1) selected in Active mode falls back to the Passive/exposure experience (bare word / sentence shown) and graduates to full Active production once state ≥ 1; the existing Passive flow (grade, undo, requeue, audio, tap-to-gloss) shows no regressions and the e2e grade-flow suite stays green.

**Plans**: 2/2 plans complete

- [x] 28-01-PLAN.md
- [x] 28-02-PLAN.md

**UI hint**: yes

### Phase 29: Distractor Write-Side Retirement

**Goal**: Now that no study mode consumes distractors, stop requesting and writing them across the extraction/write pipeline and its checks — atomically across all sites in one pass — leaving the `Card.distractors` DB column in place but unused (deprecated like `clozeSentence`/`clozeAnswer`). Refresh the project docs to describe the two-mode study model.
**Depends on**: Phase 28
**Requirements**: CLEANUP-03
**Success Criteria** (what must be TRUE):

  1. A fresh sync/extraction produces cards with no distractor data — the extraction prompt and zod schema no longer request distractors, validated non-persistently via `scripts/prompt-eval.mts`.
  2. No code path writes `Card.distractors`; the column remains in the DB unused, and distractor references are removed across the write side (`CardDTO` drops `distractors`, `lib/audit-checks.ts` drops the distractor check class, `extract-cards` tests drop distractor assertions) with the full test suite green.
  3. `CLAUDE.md` and `.planning/codebase/*.md` accurately describe the retired distractor pipeline and the two-mode (Passive/Active) study model.

**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → ... → 27 (all complete) → 28 → 29.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation-Aware Session Selection | v1.0 | 1/1 | Complete | 2026-06-26 |
| 2. Maturity- & Known-Word-Aware Presentation | v1.0 | 2/2 | Complete | 2026-06-26 |
| 3. UI/UX Audit | v1.1 | 1/1 | Complete | 2026-06-27 |
| 4. Design System Tokens & Sweep | v1.1 | 3/3 | Complete | 2026-06-27 |
| 5. Study Session Polish | v1.1 | 2/2 | Complete | 2026-06-28 |
| 6. Home Dashboard Polish | v1.1 | 1/1 | Complete | 2026-06-28 |
| 7. Secondary Screens & Navigation | v1.1 | 2/2 | Complete | 2026-06-29 |
| 8. Accessibility & PWA Baseline | v1.1 | 2/2 | Complete | 2026-06-29 |
| 8.1. Close gap: NAV-01 --sab extension | v1.1 | 1/1 | Complete | 2026-06-29 |
| 9. Skeleton Loading Screens | v1.2 | 1/1 | Complete | 2026-06-29 |
| 10. Cards Hydration + API Parallelization | v1.2 | 2/2 | Complete | 2026-06-30 |
| 11. Study Page Hydration & Interaction Polish | v1.2 | 3/3 | Complete | 2026-06-30 |
| 12. Home & Habits Hydration | v1.2 | 3/3 | Complete | 2026-07-01 |
| 13. Review API Hardening & Save Reliability | v1.3 | 2/2 | Complete | 2026-07-02 |
| 14. Sync Failure Visibility & Caching Performance | v1.3 | 2/2 | Complete | 2026-07-02 |
| 15. StudySession Refactor & Sentence-Selection Memoization | v1.3 | 2/2 | Complete | 2026-07-03 |
| 16. Components[] Filter Fix | v1.4 | 4/4 | Complete | 2026-07-03 |
| 17. ReviewLog Schema & Idempotent Write Path | v1.4 | 5/5 | Complete | 2026-07-05 |
| 18. Review History Page | v1.4 | 3/3 | Complete | 2026-07-04 |
| 19. Vercel Cron Auto-Sync | v1.4 | 3/3 | Complete | 2026-07-05 |
| 20. Extraction Pipeline Hardening | v1.5 | 2/2 | Complete | 2026-07-06 |
| 21. Card Database Quality Audit | v1.5 | 2/2 | Complete | 2026-07-07 |
| 22. Findings-Driven Prompt Improvement & Corpus Fixes | v1.5 | 3/3 | Complete | 2026-07-10 |
| 23. Reliability Bug Fixes | v1.5 | 2/2 | Complete | 2026-07-10 |
| 24. Freshness Diagnosis Spike | v1.6 | 2/2 | Complete | 2026-07-11 |
| 25. E2E Test Infrastructure & Baselines | v1.6 | 3/3 | Complete | 2026-07-12 |
| 26. Freshness Fix | v1.6 | 6/6 | Complete | 2026-07-13 |
| 27. E2E Coverage & Performance Validation | v1.6 | 3/3 | Complete | 2026-07-13 |
| 28. Active Recall Study Mode | v1.7 | 2/2 | Complete   | 2026-07-14 |
| 29. Distractor Write-Side Retirement | v1.7 | 0/TBD | Not started | - |

---
*Last updated: 2026-07-14 — v1.7 Active Recall Study Mode roadmap created (Phases 28–29, coarse granularity, 11/11 requirements mapped).*
