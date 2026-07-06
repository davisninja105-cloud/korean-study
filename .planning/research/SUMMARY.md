# Project Research Summary

**Project:** Korean Study — v1.5 Extraction Quality & Reliability
**Domain:** LLM-powered extraction quality auditing & validation over an identity-anchored SRS database
**Researched:** 2026-07-05 to 2026-07-06
**Confidence:** HIGH across all areas

## Executive Summary

v1.5 is a findings-first, pyramid-shaped quality milestone: audit the existing ~511-card deck to surface real extraction errors, review/improve the prompt with evidence in hand, then apply targeted fixes. The stack needs exactly one addition (`zod`, for native structured outputs); the installed Anthropic SDK (0.80.0) already has full support at GA. The real work is the audit-and-fix pipeline, which is designed from the start to avoid the classic mistakes of this kind of retrofit: it treats deterministic checks as the primary signal and reuses production helpers rather than reimplementing them.

The highest-leverage stack change is native structured outputs (`output_config.format` + `zodOutputFormat`), which eliminates malformed-JSON parsing failures at generation time. The existing truncation-salvage parser stays as a fallback for genuine mid-stream cutoffs only — no downstream code changes required beyond adjusting the JSON-depth check for the new wrapper object.

The architectural backbone is a three-stage pipeline (read-only audit → evidence-driven prompt review → dry-run-gated fixes) with one load-bearing pattern: all audit checks live in a pure `lib/audit-checks.ts` module used for both (1) auditing already-persisted cards and (2) validating prompt changes against a small sample. This means "did the prompt fix actually reduce this error class?" is answerable by diffing check counts — no eyeballing required, no full corpus re-run needed.

**Critical risks, each with a concrete mitigation:**
- Delete-and-recreate "fixes" silently wipe FSRS state and `ReviewLog` history via cascades — mitigation: mutate cards in place by `id` (`prisma.card.update`), never delete+create.
- Updating the prompt does not repair existing cards — `contentHash`-based skip means already-synced lessons are never re-extracted, and even a forced re-extract only refreshes a few fields. Existing-card fixes need dedicated dry-run scripts, not a re-sync.
- Prompt phrasing changes can create undetected near-duplicates that slip past the exact-match `normalizedFront` dedup — mitigate with a before/after fuzzy-key diff (reusing `find-duplicates.mjs`'s key).
- Prompt changes to `components[]` phrasing can interact with `filterComponents`'s deck-lookup filter in unexpected ways — validate with a before/after edge-count metric, not just spot checks.
- A naive "auto-relink when `remaining === 0`" trigger is the wrong condition (also fires when a sync legitimately produced zero new lessons, or when a lesson failed) — the correct trigger is `failed === 0 && newLessons > 0`.

## Key Findings

### Recommended Stack

One new dependency: `zod` (`^4.4.3`, the Anthropic SDK's declared peer-dependency range `^3.25.0 || ^4.0.0`). The installed `@anthropic-ai/sdk@0.80.0` already ships `output_config.format`, `zodOutputFormat` (`helpers/zod`), and `parsed_output` on both the plain and streaming (`messages.stream(...).finalMessage()`) response shapes — verified directly against the installed package, not just documentation. This lets `lib/extract-cards.ts` define the card schema in zod and read `message.parsed_output` on the happy path, eliminating fence-stripping/preamble/malformed-JSON failures at generation time.

**Core changes:**
- `zod` (^4.4.3): defines the wire schema; also hardens `isValidExtractedCard`-style guards via `safeParse` on the salvage fallback path — new dependency
- `output_config.format` + `zodOutputFormat`: native structured output, replaces "ask for JSON in text, regex/salvage-parse it" — already available in the installed SDK, no upgrade needed
- Truncation-salvage logic stays, demoted to a true-truncation-only fallback; the `{ cards: [...] }` wrapper shifts `findLastTopLevelCardBoundary`'s depth check from 1 to 2
- `max_tokens` 32000 → 64000 (headroom to reduce truncation at the source)
- Prompt caching: restructure prompt stable-rules-first for future cache-breakpoint readiness, but don't count on hits per-request (real payoff is mainly in `local-resync.mts` bulk runs)
- Not adding: LangChain, vector DBs, queues, ajv/jsonrepair, eval platforms, a second-pass verifier LLM — all explicitly out of scope for a single-tenant hobby app

### Expected Features

**Must have (table stakes for this audit):**
- Deterministic, read-only audit script over the existing DB (blank-safety violations, zero-sentence cards, romanization leakage, distractor-count check, `normalizedFront` self-consistency, near-dup fuzzy scan)
- Blank-safety and zero-sentence enforcement moved from prompt-only into `parseExtractionResponse` itself — currently `parseExtractionResponse` filters sentences only on `sentenceMatch().found`, never consulting the `safeToBlank` flag that already exists in `lib/sentence-match.ts`. This is a verified, real gap: the "first sentence must be blank-safe" guarantee is not code-enforced today.
- Evidence-driven prompt review (concrete failure examples from the audit inform prompt edits, not guesswork)
- Dry-run-by-default fix scripts, following the `retro-filter-cleanup.mts` precedent exactly (`--apply` to mutate)

**Should have (differentiators, worth it if audit volume justifies):**
- Sampled LLM re-grade pass for error classes deterministic checks can't catch (type miscategorization, wrong-but-plausible translations, components[] that are real relationships but semantically wrong)
- Source-traceability check (sentence text actually appears in the source `Lesson.rawContent`) — blocked today because `emphasized[]` spans aren't persisted, so this needs either a doc re-fetch or a small schema addition
- A small "golden lesson" regression fixture to protect prompt changes going forward

**Defer / anti-features:**
- Self-consistency double-extraction (2× Opus cost, doesn't fit the Vercel Hobby budget)
- In-request LLM-as-judge scoring, or any auto-applied LLM-suggested fix
- A review/admin UI — no admin surface exists today; a dated markdown report in `.planning/audits/` is the right scope
- Full wipe-and-re-extract of the corpus — destroys FSRS state and `ReviewLog` identity

### Architecture Approach

A three-stage pipeline, matching the milestone's already-decided sequencing (audit first, then prompt, then bug fixes): (1) a pure `lib/audit-checks.ts` module (no Prisma, unit-testable, importing the *real* production helpers — `sentenceMatch`, `splitParticle`, `normalizeFront`, `filterComponents` — rather than reimplementing them, to avoid the drift already seen once in `dry-run-filter.mjs`) driven by a thin read-only `scripts/audit-cards.mts` (cloning the `retro-filter-cleanup.mts` env-loading pattern) that writes a dated markdown report to `.planning/audits/`; (2) a human-driven prompt review pass against `lib/extract-cards.ts`, informed directly by that report, validated by a new non-persisting `scripts/prompt-eval.mts` that re-runs `extractCardsFromNotes()` against a handful of real `Lesson.rawContent` rows and diffs audit-check counts against a saved baseline — critically, `local-resync.mts` cannot be used for this validation because it skips every already-synced lesson by `contentHash`; (3) targeted, dry-run-gated fix scripts (or direct `CardEditor` edits for one-off semantic cases) that mutate existing cards in place by id.

**Major components:**
1. `lib/audit-checks.ts` — pure, unit-tested deterministic check catalog (~18 checks), shared by both the audit driver and the prompt-validation harness
2. `scripts/audit-cards.mts` — read-only driver, writes `.planning/audits/card-audit-<date>.md`
3. `scripts/prompt-eval.mts` — non-persisting prompt-change validator (baseline vs. after, on a sample of lessons)
4. Targeted fix scripts (dry-run/`--apply`, cloning the Phase 16 `retro-filter-cleanup.mts` contract) for any error class large enough to script; `CardEditor` for one-offs

### Critical Pitfalls

1. **Delete-and-recreate cascades wipe FSRS state and review history** — `Card.id` cascades into `CardReview`, `ReviewLog`, `Sentence`, and both directions of `CardDependency`; no error is raised, the learner just silently loses scheduling state. Avoid: hard rule for the whole milestone — fixes always `prisma.card.update` by id, never delete+create.
2. **Updating the prompt does not repair existing cards** — `contentHash`-based skip means already-synced lessons are never re-extracted, and even a forced re-extract only refreshes `back`/`notes`/`distractors` (sentences only backfill when a card currently has zero; `type` never refreshes). Avoid: plan explicit fix scripts for existing rows; treat the new prompt as prospective-only.
3. **Prompt phrasing drift creates undetected near-duplicates** — a rephrased front can miss the exact `normalizedFront` unique constraint entirely. Avoid: run the existing fuzzy-key logic (`find-duplicates.mjs`) before/after any prompt change that touches front-phrasing conventions.
4. **`components[]` phrasing changes can interact with `filterComponents` in surprising ways** — a prompt change that alters how prerequisite lemmas are phrased changes what the deck-lookup filter resolves. Avoid: capture an edge-count metric before and after any prompt change touching `components[]`.
5. **A naive `remaining === 0` auto-relink trigger is wrong** — it also fires on a sync that produced zero new lessons or that had a failure. Avoid: gate on `failed === 0 && newLessons > 0`, and keep the relink idempotent so it's safe to run more than once.

## Implications for Roadmap

Research suggests a 9-phase structure in strict dependency order (matching the milestone's already-agreed sequencing: DB audit first, then prompt, then the two bug fixes):

### Phase 1: Structured Outputs Foundation
**Rationale:** Unblocks reliable extraction before auditing off of it; independent of the audit itself.
**Delivers:** `zod` added, `lib/extract-cards.ts` wired to `output_config.format`/`zodOutputFormat`, `max_tokens` raised, salvage-parser depth check adjusted for the new wrapper shape.
**Uses:** Anthropic SDK 0.80.0 native structured outputs (already installed).
**Avoids:** No new pitfall — self-contained.

### Phase 2: Audit Checks Module
**Rationale:** The check catalog must exist and be trustworthy (unit-tested against production helpers) before either the audit driver or the prompt-validation harness can use it.
**Delivers:** Pure `lib/audit-checks.ts` (~18 deterministic checks) with full Vitest coverage.
**Implements:** Shared-checks architecture component.

### Phase 3: Audit Driver (Read-Only)
**Rationale:** Produces the evidence that drives every subsequent phase — the critical deliverable of the milestone.
**Delivers:** `scripts/audit-cards.mts` → `.planning/audits/card-audit-<date>.md` report against the live ~511-card deck.
**Addresses:** Deterministic MVP feature set from FEATURES.md.

### Phase 4: Parse-Path Fix (Blank-Safety Enforcement)
**Rationale:** Independent of the audit findings; a real, already-identified structural gap (`safeToBlank` never consulted in `parseExtractionResponse`) that can be fixed in parallel with Phases 2–3.
**Delivers:** `parseExtractionResponse` structurally enforces blank-safety and zero-sentence rejection, not just prompt instruction.
**Avoids:** Pitfall of relying on prompt-only guarantees for something FSRS/study-mode correctness depends on.

### Phase 5: Findings-Driven Prompt Review
**Rationale:** Requires Phase 3's report as concrete input — this is the "review the prompt against current DB findings" step the milestone scoped first.
**Delivers:** Updated `lib/extract-cards.ts` prompt instructions, each edit annotated against the specific audit finding it addresses.

### Phase 6: Prompt Validation
**Rationale:** Must follow Phase 5 directly (validate before trusting); depends on Phase 2's shared checks module.
**Delivers:** `scripts/prompt-eval.mts` — runs the updated prompt against a sample of real lessons, diffs audit-check counts against baseline.
**Avoids:** Pitfall of assuming re-sync validates the prompt (it structurally can't, per Pitfall 2).

### Phase 7: Corpus Fixes
**Rationale:** Only after the prompt is validated does it make sense to spend effort fixing existing rows (otherwise fixes and new prompt could disagree).
**Delivers:** Dry-run-gated fix scripts (or direct `CardEditor` edits) for whichever error classes the audit found at meaningful volume, mutating cards in place by id.
**Avoids:** Pitfall 1 (delete-and-recreate) and Pitfall 3 (undetected near-dupes) explicitly.

### Phase 8: Auto-Relink Forward-Reference Edges (Bug-Fix-2)
**Rationale:** Independent of the audit/prompt work; can land any time after Phase 1.
**Delivers:** Sync completion wires an automatic relink pass gated on `failed === 0 && newLessons > 0`, replacing the manual `relink-dependencies.mjs` invocation.
**Avoids:** The wrong-trigger pitfall identified above.

### Phase 9: Known-Lemmas Degradation Logging (Bug-Fix-1)
**Rationale:** Fully independent, smallest scope — sequenced last since it's unrelated to everything else.
**Delivers:** `lib/study-cards.ts` logs a `[study-cards]`-prefixed reason when the known-lemmas query degrades to an empty Set, preserving the existing `Promise.allSettled` graceful-degradation contract.

### Phase Ordering Rationale

- Stack (Phase 1) is foundational and unblocks trustworthy future extraction, but doesn't block auditing the *existing* deck — it could run in parallel with Phase 2 if desired.
- Audit (2–3) must precede prompt review (5) because the milestone is explicitly findings-first — this ordering was already decided in the milestone summary.
- Prompt review and validation (5–6) are strictly serial: validation depends on having a prompt to validate.
- Corpus fixes (7) come after validated prompt changes so fixes don't fight a still-changing prompt.
- The two bug fixes (8–9) are orthogonal to the audit/prompt track and to each other — sequenced last only because they're independent, not because they're less important.
- Phase 4 (parse-path fix) can run in parallel with Phases 2–3 since it touches a different code path.

### Research Flags

Phases with standard, fully-specified patterns (no additional research-phase needed):
- **All 9 phases** — stack, architecture, and pitfalls are fully specified by this research; no phase surfaced a need for deeper domain research during planning.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | SDK 0.80.0 structured-outputs support verified directly against the installed package, not just docs; zod peer-dep range confirmed via npm registry |
| Features | HIGH | Error taxonomy grounded directly in source (`parseExtractionResponse`, `sentence-match.ts`); each error class maps to a real code location |
| Architecture | HIGH | Three-stage pipeline and shared-checks pattern grounded in three existing script precedents read in full (`retro-filter-cleanup.mts`, `find-duplicates.mjs`, `dry-run-filter.mjs`) |
| Pitfalls | HIGH | All pitfalls verified against direct reads of `lib/sync.ts`, `lib/extract-cards.ts`, `lib/card-key.ts`, `lib/filter-components.ts`, `lib/link-dependencies.ts`, `lib/study-cards.ts`, `prisma/schema.prisma` |

**Overall confidence:** HIGH — codebase-grounded throughout, not inferred from generic LLM-pipeline advice.

### Gaps to Address

- Actual frequency of each audit error class is unknown until Phase 3's sweep runs — this determines whether a Phase 6-style sampled LLM re-grade pass is worth adding as a differentiator.
- Audit rule precision should be calibrated against ~20 hand-checked cards before trusting the full corpus report.
- Near-duplicate *merging* (surviving card absorbing FSRS history from a duplicate) is out of scripted scope for Phase 7 — if the audit finds a large near-dup cluster, that becomes its own phase-level decision during planning.
- Whether `Lesson.rawContent` fidelity (whitespace/punctuation drift from the Google Docs export) supports reliable sentence-containment checking needs a quick empirical spot-check before committing to a source-traceability feature.

## Sources

### Primary (HIGH confidence — direct codebase reads)
- `lib/extract-cards.ts`, `lib/sentence-match.ts`, `lib/sync.ts`, `lib/card-key.ts`, `lib/filter-components.ts`, `lib/link-dependencies.ts`, `lib/study-cards.ts`, `prisma/schema.prisma`, `scripts/retro-filter-cleanup.mts`, `scripts/find-duplicates.mjs`, `scripts/dry-run-filter.mjs`, `scripts/local-resync.mts`, `app/api/cron/sync/route.ts`, `.planning/codebase/CONCERNS.md`
- `node_modules/@anthropic-ai/sdk` (0.80.0) — direct inspection of `output_config`, `zodOutputFormat`, `parsed_output` type definitions
- npm registry — `zod` version/peer-range verification (2026-07-05)

### Secondary (MEDIUM confidence)
- Anthropic API reference docs — structured outputs mechanics, prompt caching minimum-prefix behavior

### Tertiary (LOW confidence — general pattern cross-checks only, not load-bearing)
- Various public write-ups on LLM data-extraction error taxonomies and LLM-as-judge patterns (used only to confirm the error taxonomy is a recognized category, not to source any specific implementation decision)

---
*Research completed: 2026-07-06*
*Ready for roadmap: yes*
