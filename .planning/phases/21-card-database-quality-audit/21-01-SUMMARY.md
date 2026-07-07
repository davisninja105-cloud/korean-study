---
phase: 21-card-database-quality-audit
plan: 01
subsystem: database
tags: [vitest, audit, korean, pure-module, typescript, tdd]

# Dependency graph
requires:
  - phase: 20-extraction-pipeline-hardening
    provides: production predicates (sentenceMatch, normalizeFront, filterComponents, splitParticle) that define audit truth; post-Phase-20 blank-safety/distractor enforcement the audit measures legacy debt against
provides:
  - lib/audit-checks.ts — pure audit module with 11 named exports covering all six check classes + runAuditChecks aggregator
  - tests/audit-checks.test.ts — 60 Vitest tests covering every exported function with real Korean fixtures
  - AuditFindings interface + supporting entry types — the findings contract Plan 21-02's script consumes
affects:
  - 21-02 (Wave 2 script calls runAuditChecks; imports AuditCardInput/AuditFindings types)
  - 22 (prompt revisions + corpus fixes judged against these exact predicates)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-module adapter over production helpers — audit truth ≡ production truth by structural construction, not reimplemented rules"
    - "TDD RED-GREEN per task — failing tests committed before implementation for each of the three tasks"
    - "try/catch every JSON.parse of untrusted DB columns — malformed rows become findings, never crashes (V5/ASVS L1)"
    - "superNormalize lift from script to lib — the one permitted code lift, with commented-out slash-removal decision preserved verbatim"

key-files:
  created:
    - lib/audit-checks.ts
    - tests/audit-checks.test.ts
  modified: []

key-decisions:
  - "Delegate to production helpers, never reimplement — sentenceMatch for blank-safety, normalizeFront for gloss-stripping + dedup key, filterComponents for stale-components (splitParticle reused transitively)"
  - "superNormalize lifted verbatim from scripts/find-duplicates.mjs:48-62 — the one permitted lift per RESEARCH.md; commented-out slash-removal decision preserved"
  - "Zero-sentence cards routed to zeroSentenceCards section with hasLegacyCloze flag, NOT to blankSafety buckets — Phase 22's fix strategy differs (regenerate vs reorder)"
  - "Stale-components included as summary count only (finding 7) — detailed view already produced by retro-filter-cleanup.mts; avoids duplicating that script's report"
  - "Non-string JSON array entries filtered to strings before passing to filterComponents — defensive against normalizeFront throwing on non-strings; non-strings count as stale"
  - "Distractor duplicate-entries checks string duplicates only — non-string duplicates covered by not-string-array; report once per repeat, not once per duplicate pair"

patterns-established:
  - "Pattern: pure audit module reusing production helpers (lib/audit-checks.ts modeled on lib/filter-components.ts)"
  - "Pattern: TDD RED-GREEN per task for multi-task plans (3 RED commits + 3 GREEN commits)"
  - "Pattern: every finding entry carries card id (STATE.md v1.5 fix-in-place-by-id hard rule)"

requirements-completed: [AUDIT-02]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "Pure audit module with 11 named exports covering all six check classes plus runAuditChecks aggregator"
    requirement: AUDIT-02
    verification:
      - kind: unit
        ref: "tests/audit-checks.test.ts#runAuditChecks (AUDIT-02 — integration)"
        status: pass
      - kind: unit
        ref: "tests/audit-checks.test.ts#classifyBlankSafety (AUDIT-02)"
        status: pass
      - kind: unit
        ref: "tests/audit-checks.test.ts#checkDistractors (AUDIT-02)"
        status: pass
      - kind: unit
        ref: "tests/audit-checks.test.ts#superNormalize (AUDIT-02)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every predicate delegates to a production helper (sentenceMatch, normalizeFront, filterComponents) — zero reimplementation"
    requirement: AUDIT-02
    verification:
      - kind: unit
        ref: "grep -cE helper-reuse import lines (sentenceMatch=1, normalizeFront=1, filterComponents=1)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Malformed JSON in distractors or components produces a finding value, never a thrown error"
    requirement: AUDIT-02
    verification:
      - kind: unit
        ref: "tests/audit-checks.test.ts#checkDistractors > returns [\"malformed-json\"] for unparseable JSON string (never throws)"
        status: pass
      - kind: unit
        ref: "tests/audit-checks.test.ts#countStaleComponents > reports malformed=true without throwing for unparseable JSON"
        status: pass
    human_judgment: false
  - id: D4
    description: "Module purity — no Prisma, fs, Node builtins, or Anthropic SDK imports"
    requirement: AUDIT-02
    verification:
      - kind: unit
        ref: "! grep -E \"^import .*(prisma|anthropic|extract-cards|node:|'fs'|\\\"fs\\\")\" lib/audit-checks.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Full Vitest suite stays green (no regression in existing tests)"
    requirement: AUDIT-02
    verification:
      - kind: unit
        ref: "npm test (209 tests across 15 files, all pass)"
        status: pass
    human_judgment: false

# Metrics
duration: 16 min
completed: 2026-07-07
status: complete
---

# Phase 21 Plan 01: Card Database Quality Audit — Pure Audit Module Summary

**Pure, Vitest-covered `lib/audit-checks.ts` with 11 named exports covering all six audit check classes by delegating to production helpers (sentenceMatch/normalizeFront/filterComponents) — 60 tests, full suite 209 green**

## Performance

- **Duration:** 16 min
- **Started:** 2026-07-07T03:20:53Z
- **Completed:** 2026-07-07T03:36:46Z
- **Tasks:** 3 (each TDD RED→GREEN)
- **Files modified:** 2 (both created)

## Accomplishments
- Created `lib/audit-checks.ts` — the single source of truth for Phase 21 audit predicates, pure (no Prisma/fs/Node builtins/Anthropic SDK), reusing production helpers so audit truth ≡ production truth
- All 11 exported check functions implemented and covered: classifyBlankSafety, notFoundSentenceIndices, frontHasRomanization, sentenceHasRomanization, checkDistractors, normalizedFrontMismatch, frontUntrimmed, superNormalize, clusterNearDuplicates, countStaleComponents, runAuditChecks
- 60 Vitest tests with real Korean fixtures covering every function, all four BlankSafetyClass outcomes, all six DistractorAnomaly literals, the superNormalize parity fixture, and an 8-card integration test wiring every check class together
- Every JSON.parse of untrusted DB columns is try/catch wrapped — malformed rows become findings, never crashes (V5/ASVS L1, threat T-21-03 mitigated)
- `runAuditChecks` aggregator routes zero-sentence cards to a separate section with `hasLegacyCloze` flag (Phase 22 fix-in-place-by-id rule satisfied — every finding carries card id)

## Task Commits

Each task followed TDD RED→GREEN (failing tests committed first, then implementation):

1. **Task 1: Module scaffold + blank-safety classification** — `af5a86b` (test/RED) → `22e4563` (feat/GREEN)
2. **Task 2: Romanization heuristics + distractor anomaly checks** — `59d25ea` (test/RED) → `3680aed` (feat/GREEN)
3. **Task 3: Aggregator + remaining checks (mismatch/superNormalize/clustering/stale-components)** — `d92d348` (test/RED) → `b417568` (feat/GREEN)

## Files Created/Modified
- `lib/audit-checks.ts` — Pure audit module: 11 named exports covering all six check classes + runAuditChecks aggregator; imports only './sentence-match', './card-key', './filter-components'
- `tests/audit-checks.test.ts` — 60 Vitest tests with real Korean fixtures, describe-per-function, (AUDIT-02) referenced in test names

## Exported API (consumed by Plan 21-02's script)

### Types
```typescript
interface AuditSentence { korean: string; targetForm: string; orderIndex: number }
interface AuditCardInput {
  id: string; type: string; front: string; back: string; notes: string | null;
  normalizedFront: string; components: string | null; distractors: string | null;
  clozeSentence: string | null; lessonId: string | null; sentences: AuditSentence[]
}
interface CardRef { id: string; type: string; front: string; back: string }
type BlankSafetyClass = 'zero-sentences' | 'zero-safe' | 'unsafe-first' | 'ok'
type DistractorAnomaly = 'null' | 'malformed-json' | 'not-string-array' | 'count-mismatch' | 'duplicate-entries' | 'equals-back'
interface NearDuplicateCluster { key: string; members: CardRef[] }
interface BlankSafetyNotFoundEntry { card: CardRef; indices: number[] }
interface RomanizationFlaggedSentencesEntry { card: CardRef; indices: number[] }
interface DistractorFindingEntry { card: CardRef; anomalies: DistractorAnomaly[] }
interface NormalizedFrontMismatchEntry { card: CardRef; expected: string; stored: string }
interface ZeroSentenceCardEntry { card: CardRef; hasLegacyCloze: boolean }
interface StaleComponentsSummary { cardsAffected: number; totalStaleEntries: number; malformedCards: CardRef[] }
interface AuditFindings {
  totalCards: number;
  blankSafety: { zeroSafe: CardRef[]; unsafeFirst: CardRef[]; notFound: BlankSafetyNotFoundEntry[] };
  zeroSentenceCards: ZeroSentenceCardEntry[];
  romanization: { flaggedFronts: CardRef[]; flaggedSentences: RomanizationFlaggedSentencesEntry[] };
  distractorFindings: DistractorFindingEntry[];
  normalizedFrontMismatches: NormalizedFrontMismatchEntry[];
  untrimmedFronts: CardRef[];
  nearDuplicateClusters: NearDuplicateCluster[];
  staleComponents: StaleComponentsSummary;
}
```

### Functions
```typescript
classifyBlankSafety(sentences: AuditSentence[]): BlankSafetyClass
notFoundSentenceIndices(sentences: AuditSentence[]): number[]
frontHasRomanization(front: string): boolean
sentenceHasRomanization(korean: string): boolean
checkDistractors(distractors: string | null, back: string): DistractorAnomaly[]
normalizedFrontMismatch(front: string, storedNormalizedFront: string): boolean
frontUntrimmed(front: string): boolean
superNormalize(front: string): string
clusterNearDuplicates(cards: Array<CardRef & { normalizedFront: string }>): NearDuplicateCluster[]
countStaleComponents(components: string | null, deckSet: Set<string>): { stale: number; malformed: boolean }
runAuditChecks(cards: AuditCardInput[]): AuditFindings
```

## Decisions Made
- **Delegate to production helpers, never reimplement**: sentenceMatch for blank-safety, normalizeFront for gloss-stripping + dedup key recompute, filterComponents for stale-components (splitParticle reused transitively). This is the core AUDIT-02 requirement — audit truth is structurally identical to production truth.
- **superNormalize lifted verbatim from scripts/find-duplicates.mjs:48-62**: the one permitted code lift per RESEARCH.md; the commented-out slash-removal decision is preserved verbatim (slashes are meaning-bearing in patterns like 아/어).
- **Zero-sentence cards routed to their own section**: not in blankSafety buckets; carry a `hasLegacyCloze` flag so Phase 22 can use legacy cloze data as a fix source. Phase 22's fix strategy differs from unsafe-first (reorder) vs zero-safe (regenerate).
- **Stale-components as summary count only (finding 7)**: detailed view already produced by retro-filter-cleanup.mts dry-run; avoids duplicating that script's report. `countStaleComponents` returns `{ stale, malformed }` — never throws.
- **Non-string JSON array entries filtered to strings before filterComponents**: defensive against normalizeFront throwing on non-strings; non-strings count as stale (they don't resolve to any real card).
- **Distractor duplicate-entries checks string duplicates only**: non-string duplicates are covered by not-string-array; reported once per repeat (break after first), not once per duplicate pair.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required. The module is pure TypeScript with no runtime dependencies beyond the existing project helpers.

## Next Phase Readiness
- `lib/audit-checks.ts` is complete, pure, and fully covered — ready for Plan 21-02 (Wave 2 script) to consume `runAuditChecks` and the `AuditCardInput`/`AuditFindings` types
- The exported API listed above is the contract Plan 21-02's `scripts/audit-cards.mts` will import via `await import('../lib/audit-checks.js')`
- All six check classes + the optional stale-components summary are wired into the single `runAuditChecks` aggregator; the Wave 2 script is a thin I/O adapter (Prisma read → runAuditChecks → console summary + dated markdown report)
- No blockers or concerns

---
*Phase: 21-card-database-quality-audit*
*Completed: 2026-07-07*

## Self-Check: PASSED

- **Created files exist:** lib/audit-checks.ts ✓, tests/audit-checks.test.ts ✓, 21-01-SUMMARY.md ✓
- **All 6 task commits exist:** af5a86b ✓, 22e4563 ✓, 59d25ea ✓, 3680aed ✓, d92d348 ✓, b417568 ✓
- **Targeted tests:** 60 passed (60)
- **Exported functions:** 11 (≥10 required)
- **Purity grep:** no forbidden imports (prisma/anthropic/extract-cards/node:/fs)
- **Full suite:** 209 tests passed (no regression)
