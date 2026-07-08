# Roadmap: Korean Study — Foundation-First Study

## Milestones

- ✅ **v1.0 Foundation-First Study** — Phases 1–2 (shipped 2026-06-26)
- ✅ **v1.1 UI/UX Polish** — Phases 3–8 + 8.1 (shipped 2026-06-29)
- ✅ **v1.2 Performance & Snappiness** — Phases 9–12 (shipped 2026-07-01)
- ✅ **v1.3 Reliability & Hardening** — Phases 13–15 (shipped 2026-07-03)
- ✅ **v1.4 Knowledge Graph Quality & History** — Phases 16–19 (shipped 2026-07-05)
- 🚧 **v1.5 Extraction Quality & Reliability** — Phases 20–23 (in progress)

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

### 🚧 v1.5 Extraction Quality & Reliability (In Progress)

**Milestone Goal:** Audit the extraction pipeline for card-quality issues (findings-first), harden the extraction code path so it produces well-formed, study-safe cards by construction, act on the audit evidence by improving and validating the prompt and fixing existing cards in place, then close two known reliability bugs from `CONCERNS.md`.

- [x] **Phase 20: Extraction Pipeline Hardening** - Native structured outputs + code-enforced blank-safety in the extraction path (completed 2026-07-06)
- [x] **Phase 21: Card Database Quality Audit** - Read-only deterministic audit of the live deck → dated findings report (completed 2026-07-07)
- [ ] **Phase 22: Findings-Driven Prompt Improvement & Corpus Fixes** - Revise/validate the prompt against the audit, then fix existing cards in place
- [ ] **Phase 23: Reliability Bug Fixes** - Log silent known-lemmas degradation; auto-relink forward-reference edges after clean sync

## Phase Details

### Phase 20: Extraction Pipeline Hardening

**Goal**: The card-extraction code path produces well-formed, study-safe cards by construction — native structured outputs replace text-JSON parsing, and blank-safety / zero-sentence rules are code-enforced rather than left to prompt instruction.
**Depends on**: Nothing (independent of the audit; lands first per research — good early/parallel candidate)
**Requirements**: EXTRACT-01, EXTRACT-02, EXTRACT-03
**Success Criteria** (what must be TRUE):

  1. `extractCardsFromNotes()` returns cards via native structured outputs (a zod schema + `output_config.format` / `zodOutputFormat`), reading `parsed_output` on the happy path instead of regex/salvage-parsing a text response
  2. A genuine mid-stream truncation still salvages the completed cards, with the salvage parser's JSON-depth check adjusted for the new `{ cards: [...] }` wrapper shape
  3. `parseExtractionResponse` rejects zero-sentence cards and drops sentences that fail `safeToBlank` (not merely `sentenceMatch().found`), so no card reaches the DB without a code-verified blank-safe first sentence
  4. Extraction over a sample lesson still dedups by `normalizedFront` and applies the `filterComponents` deck-lookup filter — no regression versus current output

**Plans**: 2/2 plans complete

Plans:
**Wave 1**

- [x] 20-01-PLAN.md — Wrapper-aware salvage parser + shared normalizeExtractedCards + code-enforced blank-safety (EXTRACT-02, EXTRACT-03)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 20-02-PLAN.md — Native structured outputs via zodOutputFormat/output_config with salvage fallback branching (EXTRACT-01)

**UI hint**: no

### Phase 21: Card Database Quality Audit

**Goal**: A trustworthy, read-only audit surfaces the real extraction-error classes present in the existing ~511-card deck, producing the dated evidence report that every downstream prompt/fix decision depends on.
**Depends on**: Nothing (independent of Phase 20 — touches a different code path; may run in parallel)
**Requirements**: AUDIT-01, AUDIT-02
**Success Criteria** (what must be TRUE):

  1. A read-only script runs against the live deck and writes a dated findings report to `.planning/audits/card-audit-<date>.md`
  2. The report covers blank-safety violations, zero-sentence cards, romanization leakage, distractor-count anomalies, `normalizedFront` inconsistency, and near-duplicate clusters
  3. All audit checks live in a pure, Vitest-covered `lib/audit-checks.ts` module that reuses production helpers (`sentenceMatch`, `splitParticle`, `normalizeFront`, `filterComponents`) rather than reimplementing them
  4. Running the audit mutates no data — it is verifiably read-only (no writes to the DB)

**Plans**: 2/2 plans complete

Plans:
**Wave 1**

- [x] 21-01-PLAN.md — Pure `lib/audit-checks.ts` module + Vitest coverage for all six check classes (AUDIT-02)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 21-02-PLAN.md — Read-only `scripts/audit-cards.mts` + live-deck run producing the dated `.planning/audits/` report (AUDIT-01)

**UI hint**: no

### Phase 22: Findings-Driven Prompt Improvement & Corpus Fixes

**Goal**: The audit findings are acted on end-to-end — the extraction prompt is revised against the evidence and validated on real lessons (before it is trusted), then high-confidence existing-card issues are corrected in place.
**Depends on**: Phase 21 (audit report + shared checks module drive the prompt review and the before/after validation) and Phase 20 (validation re-runs the hardened extraction path)
**Requirements**: PROMPT-01, PROMPT-02, FIX-01, FIX-02
**Success Criteria** (what must be TRUE):

  1. The `extract-cards.ts` prompt is revised against the current card schema and the audit report, with each edit annotated to the specific error class it addresses
  2. A non-persisting `scripts/prompt-eval.mts` re-runs extraction on a sample of real lessons and diffs audit-check counts against a saved baseline, showing the targeted error classes drop before the prompt is considered final (no full-corpus re-run required)
  3. High-confidence quality issues are corrected in the database by mutating cards in place by `id` (dry-run-gated scripts, or `CardEditor` for one-offs) — never delete-and-recreate, preserving FSRS state and `ReviewLog` history
  4. Every fix script defaults to dry-run and requires an explicit `--apply` flag to write, matching the `retro-filter-cleanup.mts` pattern

**Plans**: 1/3 plans executed

Plans:
**Wave 1**

- [x] 22-01-PLAN.md — Word-boundary-aware single-char blank-safety in sentenceMatch + test matrix (D-01/D-02; resolves the 다 zero-safe finding with no DB change)

**Wave 2** *(blocked on Wave 1)*

- [ ] 22-02-PLAN.md — prompt-eval.mts + pre-edit baseline → annotated prompt revision → after-run diff PASS per D-12 (PROMPT-01, PROMPT-02)

**Wave 3** *(blocked on Wave 2; has blocking human checkpoint before --apply)*

- [ ] 22-03-PLAN.md — Dry-run-gated fix-corpus script: 9 front rewrites in place by id + 철 sentences, post-fix audit re-run, fix report with accepted residuals (FIX-01, FIX-02)

**UI hint**: no

### Phase 23: Reliability Bug Fixes

**Goal**: Two known reliability gaps from `CONCERNS.md` are closed — silent known-lemmas degradation becomes observable, and forward-reference dependency edges relink automatically after a clean sync, retiring the manual `relink-dependencies.mjs` step.
**Depends on**: Nothing (orthogonal to the audit/prompt/extraction track and self-contained; ordered last only because it is independent)
**Requirements**: RELIABILITY-01, RELIABILITY-02, RELIABILITY-03
**Success Criteria** (what must be TRUE):

  1. When the known-lemmas query fails in `lib/study-cards.ts`, a `[study-cards]`-prefixed reason is logged before the code degrades to an empty Set — the existing `Promise.allSettled` graceful-degradation contract is preserved (a pool-query failure still 500s)
  2. A sync that completes with `failed === 0 && newLessons > 0` automatically relinks forward-reference `CardDependency` edges, replacing the manual `relink-dependencies.mjs` invocation
  3. The auto-relink pass is idempotent — running it after every qualifying sync produces no duplicate or incorrect edges

**Plans**: TBD
**UI hint**: no

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 8.1 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 → 23

Within v1.5, the audit/prompt track is strictly serial (21 → 22); Phase 20 (extraction hardening) and Phase 23 (reliability bugs) are independent and may land anywhere in the sequence.

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
| 20. Extraction Pipeline Hardening | v1.5 | 2/2 | Complete   | 2026-07-06 |
| 21. Card Database Quality Audit | v1.5 | 2/2 | Complete   | 2026-07-07 |
| 22. Findings-Driven Prompt Improvement & Corpus Fixes | v1.5 | 1/3 | In Progress|  |
| 23. Reliability Bug Fixes | v1.5 | 0/TBD | Not started | - |

---
*Last updated: 2026-07-06 — v1.5 roadmap created (Phases 20–23), 12/12 requirements mapped, coarse granularity*
