# Requirements: Korean Study — v1.5 Extraction Quality & Reliability

**Defined:** 2026-07-06
**Core Value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.

## v1.5 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Extraction Reliability

- [ ] **EXTRACT-01**: Extraction uses native structured outputs (zod schema + `output_config.format`/`zodOutputFormat`) instead of asking for JSON in a text response and regex/salvage-parsing it
- [ ] **EXTRACT-02**: Truncation-salvage logic is preserved as a fallback for genuine mid-stream cutoffs, adjusted for the new `{ cards: [...] }` response wrapper shape
- [ ] **EXTRACT-03**: `parseExtractionResponse` structurally enforces blank-safety (consults `safeToBlank`, not just `sentenceMatch().found`) and rejects zero-sentence cards, rather than relying on prompt instruction alone

### Extraction Quality Audit

- [ ] **AUDIT-01**: A read-only script audits the existing card database (blank-safety violations, zero-sentence cards, romanization leakage, distractor-count anomalies, `normalizedFront` inconsistency, near-duplicate clusters) and produces a dated findings report
- [ ] **AUDIT-02**: Audit checks are implemented as a pure, unit-tested module that reuses production helpers (`sentenceMatch`, `splitParticle`, `normalizeFront`, `filterComponents`) rather than reimplementing them

### Findings-Driven Prompt Review

- [ ] **PROMPT-01**: The `extract-cards.ts` prompt is reviewed against the current card schema/capabilities and the audit findings; instructions are updated to address identified error classes
- [ ] **PROMPT-02**: Prompt changes are validated against a sample of real lessons (diffing audit-check counts before/after) without re-running the full corpus, before being considered final

### Corpus Fixes

- [ ] **FIX-01**: High-confidence quality issues found by the audit are corrected in the existing database via dry-run-gated scripts (or `CardEditor` for one-offs), mutating cards in place by `id` — never delete+recreate
- [ ] **FIX-02**: Fix scripts follow the existing dry-run-by-default / `--apply` pattern established by `retro-filter-cleanup.mts`

### Reliability Bugs

- [ ] **RELIABILITY-01**: `lib/study-cards.ts` logs when the known-lemmas query fails and degrades to an empty Set, so the silent ranking-signal degradation becomes visible
- [ ] **RELIABILITY-02**: Forward-reference `CardDependency` edges are automatically relinked when a sync completes with no failures and at least one new lesson processed (`failed === 0 && newLessons > 0`), replacing the manual `relink-dependencies.mjs` invocation
- [ ] **RELIABILITY-03**: The auto-relink pass is idempotent — safe to run after every qualifying sync without creating duplicate or incorrect edges

## Future Requirements

Deferred to a future release. Tracked but not in this milestone's roadmap.

### Extraction Quality (P2 differentiators)

- **EXTRACT-FUT-01**: Sampled LLM re-grade pass for error classes deterministic checks can't catch (type miscategorization, wrong-but-plausible translations, semantically-wrong `components[]`)
- **EXTRACT-FUT-02**: Source-traceability check (sentence text verified against source `Lesson.rawContent`) — blocked today because `emphasized[]` spans aren't persisted
- **EXTRACT-FUT-03**: A "golden lesson" regression fixture to protect prompt changes going forward

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Sentence-match particle-splitting ambiguity fix (CONCERNS.md Known Bug #1) | Accepted orthographic limitation with no real fix path absent a morphological analyzer; impact is cosmetic (highlight tinting only), never FSRS correctness |
| Self-consistency double-extraction (2x Opus calls per lesson) | Doesn't fit the Vercel Hobby 60s budget or single-tenant cost profile |
| In-request LLM-as-judge scoring or auto-applied LLM-suggested fixes | Unbounded cost/risk; audit findings must be human-reviewed before any fix is applied |
| Admin/review UI for audit findings | No admin surface exists today; a dated markdown report is sufficient for a single-developer app |
| Full wipe-and-re-extract of the corpus | Destroys FSRS review state and `ReviewLog` history — fixes must mutate in place |
| Near-duplicate card *merging* (absorbing FSRS history from a duplicate into the survivor) | Out of scripted scope this milestone; becomes its own decision if the audit finds a large cluster |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| EXTRACT-01 | TBD | Pending |
| EXTRACT-02 | TBD | Pending |
| EXTRACT-03 | TBD | Pending |
| AUDIT-01 | TBD | Pending |
| AUDIT-02 | TBD | Pending |
| PROMPT-01 | TBD | Pending |
| PROMPT-02 | TBD | Pending |
| FIX-01 | TBD | Pending |
| FIX-02 | TBD | Pending |
| RELIABILITY-01 | TBD | Pending |
| RELIABILITY-02 | TBD | Pending |
| RELIABILITY-03 | TBD | Pending |

**Coverage:**
- v1.5 requirements: 12 total
- Mapped to phases: 0 (pending roadmap creation)
- Unmapped: 12 ⚠️ (will be resolved by `/gsd-roadmapper`)

---
*Requirements defined: 2026-07-06*
*Last updated: 2026-07-06 after initial definition*
