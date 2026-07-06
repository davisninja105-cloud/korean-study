# Feature Research

**Domain:** LLM-based structured extraction quality auditing (Korean lesson notes → flashcards) — v1.5 "Extraction Quality & Reliability"
**Researched:** 2026-07-05
**Confidence:** MEDIUM overall — codebase-dependency claims are HIGH (verified directly against `lib/extract-cards.ts`, `lib/filter-components.ts`, `lib/card-key.ts`, `lib/sentence-match.ts`); external ecosystem claims are LOW–MEDIUM (single-pass web search, cross-checked against multiple independent sources where noted)

## Scope Note

This is a **subsequent-milestone** research file; it replaces the prior milestone's (v1.4, review-history) FEATURES.md content, which is now superseded. The extraction pipeline itself (exhaustive extraction, `normalizedFront` dedup, `components[]` → `CardDependency` with `filterComponents`, emphasis capture, blank-safety prompt rules) already exists and is NOT re-researched here. This file maps only: (1) the error taxonomy worth auditing, (2) self-audit techniques for new extractions, (3) post-hoc audit patterns for the existing ~500+-card DB.

## Error Taxonomy — What Can Actually Be Wrong

Grounded in both the external literature on LLM structured extraction (errors concentrate in **semantically-sensitive categorical and free-text fields**, while structural/format fields are mostly fine — which matches this pipeline: JSON shape is already guarded, semantics are not) and a direct read of the current pipeline code.

| # | Error category | Detectable how | Currently guarded? |
|---|----------------|----------------|--------------------|
| E1 | **Type miscategorization** (grammar pattern typed `phrase`, collocation typed `vocabulary`, etc.) | Heuristic (front contains `~` or `(으)` → probably grammar) + LLM judge for borderline cases | Only enum membership is validated (`isValidExtractedCard`); semantic correctness is not |
| E2 | **Non-base-form / wrong-lemma fronts** (inflected front like 가요; over- or under-lemmatization; romanization leakage) | Deterministic partial: Hangul-only regex on front, common-ending heuristics (vocab fronts ending 요/어요/았다); LLM judge for true lemma correctness | Prompt-only. `normalizeFront` normalizes formatting; it does not check lemma-ness or Hangul-ness |
| E3 | **Near-duplicates past exact dedup** (notation variants: `~아/어야 하다` vs `~야 되다`; internal spacing `~고 싶다` vs `~고싶다`; same stem, different pattern notation) | Fuzzy key scan — `scripts/find-duplicates.mjs` already does exactly this (strips `~`, all parens) | Exact-match only (`normalizedFront @unique`). Fuzzy scan exists but is manual/ad-hoc |
| E4 | **First sentence not blank-safe** — **verified real gap**: `parseExtractionResponse` filters sentences on `sentenceMatch().found` only; `safeToBlank` is computed by `sentenceMatch` but never consulted at parse time. Worse, dropping a non-verbatim sentence can silently *promote* an unsafe sentence to first position | Fully deterministic: `sentenceMatch(korean, targetForm).safeToBlank` on `orderIndex 0` of every card | **No.** Prompt-guaranteed only. Violation silently degrades Recall + fill-blank modes |
| E5 | **Zero-sentence cards** — the verbatim filter can drop *all* of a card's sentences, persisting a card no study mode can present well | Deterministic: `Sentence` count per card | No count check after filtering |
| E6 | **targetForm verbatim but semantically wrong** (homograph substring; grammar sentence containing the string without exercising the pattern) | LLM judge only — no deterministic signal | No |
| E7 | **Translation quality/register mismatch** (back too broad/narrow; formal gloss on casual phrase; sentence translation not matching the sentence) | LLM judge only | No |
| E8 | **Distractor defects** (< 3 distractors — parse slices to ≤ 3 but never backfills or flags short arrays; distractor synonymous with `back`, breaking multiple-choice) | Deterministic: count + exact-dup check; LLM judge for semantic overlap | Parse tolerates any count 0–3 silently |
| E9 | **components[] real-but-wrong relationships** — `filterComponents` guarantees resolution to *some* deck card, explicitly NOT relationship correctness (documented in `lib/filter-components.ts` header). Also: the `splitParticle` stem fallback can mis-resolve (multi-syllable verb stem + modifier-ending ambiguity), creating a plausible-looking but wrong edge | LLM judge on sampled `CardDependency` edges; deterministic only for self-loops/cycles | Post-v1.4, only edge *existence* is guaranteed, not correctness |
| E10 | **components[] false negatives** (legitimate forward-reference prerequisites dropped because the target card didn't exist yet) | Deterministic: re-run resolution over the full deck — exactly what `relink-dependencies.mjs` / the planned auto-relink does | Partially — v1.5 already commits auto-relink at `remaining=0` |
| E11 | **Coverage misses** (emphasized tutor terms that never got a card; admin/meta text extracted as cards) | Emphasized coverage requires re-deriving doc emphasis — `emphasized[]` is **not persisted** (`Lesson` stores clean body text only). Over-extraction is judge/eyeball territory | No |

## Feature Landscape

### Table Stakes (an "extraction quality" milestone is incomplete without these)

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| **Deterministic DB invariant sweep script** (findings-first, dry-run by default) | Universal first layer in extraction QA: cheap deterministic checks before any model-based scoring. The codebase already has the exact idiom — `scripts/retro-filter-cleanup.mts` (dry-run default, `--apply` to mutate) | LOW–MEDIUM | New `scripts/audit-cards.mts`. Reuses `sentenceMatch` (E4/E5 + verbatim re-check), `normalizeFront` (self-consistency: stored `normalizedFront === normalizeFront(front)`), Hangul/ASCII regex per `lib/card-key.ts` (E2 romanization), distractor checks (E8), type-heuristic flags (E1). Reads Turso via `@libsql/client` per established script pattern |
| **Blank-safety enforcement in the parse pipeline** (E4 fix) | Blank-safety is load-bearing for 2 of 3 study modes and currently prompt-only — verified gap. An audit that finds violations must be paired with the write-path fix or violations recur on every sync | LOW | One change in `parseExtractionResponse` (`lib/extract-cards.ts`): consult `sentenceMatch().safeToBlank`, reorder so a blank-safe sentence is first (or flag the card). Parser is already pure and unit-tested |
| **Zero/short-sentence guard** (E5) | A card with no sentences after filtering is silently broken; trivially checkable at the same touch-point as E4 | LOW | Same touch-point as above |
| **Near-duplicate report over the full deck** (E3) | Duplicate headwords are the most-reported problem in automated flashcard generation; exact-match dedup demonstrably misses notation variants | LOW | Extend/reuse `scripts/find-duplicates.mjs` — already implements the fuzzy key. Promote from ad-hoc to a section of the audit report |
| **Findings report as a reviewable artifact** (grouped by error category, with card ids + fronts) | "Findings-first, then fix" is both the milestone's stated approach and the standard external pattern (audit → human review → apply); auto-mutation without review is the documented anti-pattern | LOW | Markdown/JSON output from the audit script; direct input to the prompt-review step |
| **Prompt review against audit findings** | The point of the audit: each error category with real hits maps to a specific prompt section in `lib/extract-cards.ts` (E1→type definitions, E2→base-form rules, E4→sentence rules, E9→components rules). Findings make prompt edits evidence-based instead of speculative | LOW (review) / MEDIUM (safe rollout) | Depends on the audit report existing first. Prompt changes affect only *future* extractions — existing rows need the post-hoc path |

### Differentiators (valuable, not required for a credible audit)

| Feature | Value Proposition | Complexity | Notes / Dependencies |
|---------|-------------------|------------|----------------------|
| **Batch LLM re-grading of sampled/flagged cards** (LLM-as-judge with a rubric) | Only way to reach the semantic error classes (E1 borderline, E6, E7, E9 relationship-correctness) no deterministic check covers. Standard layered pattern: judge runs *after* deterministic filters, as a precision layer, over a sample — not the whole deck | MEDIUM | Runs locally (`npx tsx`, same as `local-resync.mts`) — never in a request path (Vercel 60 s limit). Haiku (`claude-haiku-4-5`) suffices for E7/E8 register/overlap checks; E9 relationship judgment may want the stronger model. Structured JSON verdicts appended to the findings report |
| **Source-traceability check: sentences vs lesson snapshot** | `Lesson` rows store raw doc text — a deterministic containment check classifies each stored sentence as "copied from lesson" vs "LLM-composed", surfacing likely-hallucinated example sentences at zero LLM cost. The prompt mandates copying lesson sentences when they exist, so composed-when-lesson-had-one is itself a finding | MEDIUM | Depends on `Lesson.rawText` fidelity + `Card.lessonId` (first-introduced lesson). Needs fuzzy containment (whitespace/punct-tolerant); exact substring will under-match |
| **Golden-lesson regression fixture for prompt changes** | Before/after safety net: assert `parseExtractionResponse`-level properties (counts, blank-safety, no romanization) against frozen fixtures whenever the prompt changes. Matches both external revalidation practice and the project's own Phase 17 lesson (persist regression tests) | MEDIUM | Fixture lesson + property assertions in Vitest. Full LLM-in-the-loop runs stay manual/local (cost, nondeterminism) |
| **Audit metrics snapshot per run (drift detection)** | Persisting per-run counts per error category turns one-off audits into a regression signal across prompt/model versions | LOW | Trivial once the audit script exists; value compounds over time |
| **Emphasized-term coverage audit** (E11) | Directly checks the tutor's own "this is important" signal against the deck | MEDIUM–HIGH | Blocked on data: `emphasized[]` is not persisted. Requires re-fetching the Google Doc through `lib/google-docs.ts` at audit time (script-doable) or persisting `emphasized` on `Lesson` (schema change → manual Turso DDL) |

### Anti-Features (plausible-sounding, wrong for this project)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Self-consistency double-extraction** (extract every lesson twice, diff results) | Classic consistency check from the literature | 2× Opus cost per lesson, 2× latency against the 60 s sync budget, and diffs of exhaustive extractions are noisy (ordering, phrasing) — poor signal per dollar for a single-user deck | One-time batch judge pass on existing cards; golden-lesson fixture for prompt changes |
| **In-request (sync-path) LLM judge** | "Validate at write time" instinct | Vercel Hobby 60 s limit already constrains sync to 1 lesson/request; a second model call risks timeouts on dense lessons | Deterministic checks in-request (cheap, e.g. blank-safety); LLM judging offline via local script |
| **Auto-fix: LLM rewrites applied directly to prod cards** | Closes the loop automatically | Destructive writes from unverified judge output; contradicts the milestone's findings-first framing and the project's `--apply`-gated script convention; a wrong "fix" can corrupt FSRS-scheduled cards the learner already knows | Findings report → human review → targeted `--apply` script (or manual CardEditor edits) |
| **Human-review workflow UI** (in-app review queue, approve/reject screens) | Standard in team extraction products | Single-user app; a script-generated report the developer reads *is* the workflow. UI would be the most expensive artifact of the milestone with near-zero marginal value | Markdown findings report + existing `/cards` editor for fixes |
| **Embedding-based semantic dedup service** | Catches paraphrase duplicates fuzzy keys miss | New infra (embedding storage/API) for a ~500-card personal deck; the fuzzy-key scan plus a judge pass over flagged clusters covers the realistic duplicate space | Extend `find-duplicates.mjs`; judge borderline clusters in the batch re-grade |
| **Full wipe + re-extract to "reset" quality after a prompt improvement** | Tempting clean slate | Destroys FSRS review state and `ReviewLog` linkage (recreated cards get new ids — the classic recreate-instead-of-update identity-loss failure); learner loses months of scheduling history | Post-hoc audit + targeted per-card fixes; prompt improvements apply to future lessons only |

## Feature Dependencies

```
Deterministic invariant sweep (audit script)
    └──requires──> existing pure helpers: sentenceMatch / normalizeFront / filterComponents
    └──requires──> Turso script access pattern (retro-filter-cleanup.mts idiom)

Findings report ──requires──> invariant sweep (+ optional: near-dup scan, judge pass)

Prompt review / prompt fixes ──requires──> findings report (evidence-based edits)

Blank-safety parse enforcement (E4/E5 fix)
    └──independent of the audit; pairs with it (audit finds existing rows, fix stops recurrence)

Batch LLM re-grade ──requires──> invariant sweep first (judge only what determinism can't decide)
Source-traceability check ──requires──> Lesson.rawText + Card.lessonId (already in DB)
Emphasized-coverage audit ──requires──> re-fetch doc emphasis OR persist emphasized[] (schema change)
Golden-lesson fixture ──enhances──> prompt review (regression safety on every future edit)
Drift metrics ──requires──> audit script (persists its counters)
```

### Dependency Notes

- **Audit before prompt edits:** the milestone's own framing (findings-first) matches external best practice — prompt changes made without error-frequency data routinely fix rare problems while ignoring common ones.
- **Write-path fix + post-hoc sweep are complements, not substitutes:** fixing `parseExtractionResponse` (E4/E5) protects future syncs; only the DB sweep finds existing violations among the ~500+ persisted cards.
- **`filterComponents` boundary is load-bearing:** its header explicitly scopes it to *existence*, not correctness — E9 auditing belongs to the judge layer (the GRAPH-01 concern), never to widening the deterministic filter (which would reintroduce the false positives v1.4 just removed).

## MVP Definition

### Launch With (this milestone)

- [ ] `scripts/audit-cards.mts` — deterministic sweep (E2 romanization/Hangul, E3 near-dup section, E4 first-sentence blank-safety, E5 zero-sentence, E8 distractor count/dups, normalizedFront self-consistency, E1 heuristic flags) → grouped findings report — *cheap; catches every mechanically-detectable class*
- [ ] Blank-safety + zero-sentence enforcement in `parseExtractionResponse` — *closes the one verified structural gap at the source*
- [ ] Prompt review of `lib/extract-cards.ts` against the findings; apply high-confidence edits — *the milestone's stated deliverable*
- [ ] Apply high-confidence data fixes found (via `--apply`-gated script or CardEditor) — *matches existing convention*

### Add After Validation (if findings warrant)

- [ ] Batch LLM re-grade (local script, sampled) — *trigger: the deterministic sweep leaves significant "can't tell without semantics" flag volume (E1 borderline, E6, E7, E9)*
- [ ] Source-traceability sentence check — *trigger: evidence of composed-sentence quality problems*
- [ ] Golden-lesson regression fixture — *trigger: the prompt actually gets edited this milestone (likely)*

### Future Consideration

- [ ] Emphasized-coverage audit — *blocked on persisting/re-deriving `emphasized[]`; schema change requires manual Turso DDL*
- [ ] Drift-metrics history across audit runs — *value accrues only after ≥ 2 prompt/model versions*

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Deterministic invariant sweep + findings report | HIGH | LOW–MEDIUM | P1 |
| Blank-safety/zero-sentence parse enforcement | HIGH (2 of 3 study modes) | LOW | P1 |
| Prompt review vs findings + high-confidence fixes | HIGH | LOW–MEDIUM | P1 |
| Near-duplicate report (extend find-duplicates.mjs) | MEDIUM | LOW | P1 (folds into sweep) |
| Batch LLM re-grade (sampled, local) | MEDIUM–HIGH | MEDIUM | P2 |
| Golden-lesson regression fixture | MEDIUM | MEDIUM | P2 |
| Source-traceability sentence check | MEDIUM | MEDIUM | P2 |
| Audit drift metrics | LOW–MEDIUM | LOW | P3 |
| Emphasized-coverage audit | MEDIUM | MEDIUM–HIGH | P3 |

## Sources

- Codebase (HIGH confidence, directly verified): `lib/extract-cards.ts` (parse-time validation scope; `safeToBlank` never consulted), `lib/sentence-match.ts` (`safeToBlank` contract), `lib/filter-components.ts` (existence-not-correctness contract, documented in header), `lib/card-key.ts` (`normalizeFront` scope), `scripts/find-duplicates.mjs` + `scripts/retro-filter-cleanup.mts` (existing audit-script idioms), `.planning/PROJECT.md` (v1.4 GRAPH-01..05 history)
- Web (LOW–MEDIUM confidence; cross-checked across ≥ 2 independent sources per claim):
  - LLM extraction error patterns concentrate in categorical/free-text fields; hallucinated values inside well-formed JSON; no intrinsic confidence signal — [Who Fails Where? LLM and Human Error Patterns (arXiv)](https://arxiv.org/pdf/2601.09053), [Classification of LLM Errors in Data Extraction (Medium)](https://farhadinfo.medium.com/classification-of-llm-errors-in-data-extraction-for-systematic-reviews-and-factors-affecting-the-4549f5c68467), [Real-Time Error Detection for LLM Structured Outputs (Cleanlab)](https://cleanlab.ai/blog/tlm-structured-outputs-benchmark/)
  - Layered validation: deterministic checks first, LLM-as-judge as a sampled precision layer, human oversight on disagreement — [What is an LLM-as-a-judge? (Braintrust)](https://www.braintrust.dev/articles/what-is-llm-as-a-judge), [Multi-LLM Verification Pipeline (Emergent Mind)](https://www.emergentmind.com/topics/multi-llm-verification-pipeline)
  - Post-hoc DB auditing: rule-based invariant sweeps + batch LLM revalidation + replication vs source + drift detection — [VALID framework for LLM-extracted EHR data (JCO CCI)](https://ascopubs.org/doi/10.1200/CCI-25-00215), [Evaluating Extracted Invoice Data with LLM-as-a-Judge (Towards AI)](https://towardsai.net/p/machine-learning/from-extraction-to-accuracy-evaluating-extracted-invoice-data-with-llm-as-a-judge), [LLM Data Auditor Framework (Emergent Mind)](https://www.emergentmind.com/topics/llm-data-auditor-framework)
  - Flashcard-generation-specific problems (duplicate headwords, cloze density, base-form issues) — [When AI Flashcards Pollute Your Anki Deck (Substack)](https://evakeiffenheim.substack.com/p/when-ai-flashcards-pollute-your-anki), [Automatically generating Anki flashcards (Medium)](https://medium.com/@andrea.berlingieri42/automatically-generating-anki-flashcards-for-language-learning-using-the-lexicala-api-and-deepl-412846986186)

---
*Feature research for: LLM extraction quality auditing (Korean Study v1.5)*
*Researched: 2026-07-05*
