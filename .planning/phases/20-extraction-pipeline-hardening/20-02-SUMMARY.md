---
phase: 20-extraction-pipeline-hardening
plan: 02
subsystem: api
tags: [extraction, structured-outputs, zod, anthropic-sdk, korean-study]

# Dependency graph
requires:
  - phase: 20-extraction-pipeline-hardening
    provides: "normalizeExtractedCards(rawCards, deckSet) shared pure normalization pipeline + wrapper-shape parseExtractionResponse (Plan 01, EXTRACT-02/03)"
provides:
  - "ExtractionSchema (exported zod schema): z.object({ cards: z.array(ExtractedCardSchema) }) — deliberately permissive, only sentences.min(1) is a real constraint"
  - "extractCardsFromNotes rewritten to pass output_config.format: zodOutputFormat(ExtractionSchema) on the existing stream call, reading message.parsed_output on the happy path"
  - "stream.on('text') accumulator registered before await stream.finalMessage(), enabling truncation salvage through parseExtractionResponse in a catch(AnthropicError) branch"
  - "Refreshed CLAUDE.md 'Exhaustive extraction & dedup' section describing the structured-outputs pipeline"
affects: []

# Tech tracking
tech-stack:
  added: ["zod ^4.3.6 (promoted from transitive @anthropic-ai/sdk peer dep to explicit dependency)"]
  patterns:
    - "Structured outputs (output_config.format + zodOutputFormat) as the request layer; shared pure normalizeExtractedCards as the business-rules layer — schema enforces shape only, code enforces business rules (dedup, blank-safety, component filtering)"
    - "Deliberately permissive zod schemas for LLM structured outputs: only server-enforceable constraints (array minItems 0|1) are encoded; per-card-droppable constraints (string minLength, array maxItems, enum) stay prompt-side + post-hoc coercion, because client-side zod failure is all-or-nothing for the whole response"
    - "stream.on('text') accumulator registered BEFORE awaiting finalMessage() to make truncation salvage reachable, since a resolved-but-rejected structured-output parse means finalMessage() never resolves with a message object on the happy path"

key-files:
  created: []
  modified:
    - package.json
    - package-lock.json
    - lib/extract-cards.ts
    - tests/extract-cards.test.ts
    - CLAUDE.md

key-decisions:
  - "Pinned zod to exactly 4.3.6 (npm install zod@4.3.6) rather than accepting npm's default caret-to-latest-resolved behavior (which wrote ^4.4.3) — keeps package.json's version string matching RESEARCH.md's empirically-verified wire-schema generation exactly, per the plan's explicit acceptance criterion"
  - "Salvage-path failure rethrows the ORIGINAL AnthropicError (not a generic 'no cards found' error) per RESEARCH.md Open Question 1 — preserves the SDK's diagnostic detail in the sync failure report"
  - "Broad instanceof AnthropicError catch (not narrowed to exclude APIError) — a mid-stream connection drop salvages partial cards just like a truncation, which is strictly better than losing them, per RESEARCH.md's recommended branching"
  - "Did not check stop_reason on the parsed_output happy path — a resolved message with non-null parsed_output is complete and schema-valid by construction (server-side constrained decoding), so no separate truncation check is needed there"

patterns-established:
  - "extractCardsFromNotes: stream assigned to a const (not chained into .finalMessage()) so the on('text') accumulator can be registered before the await — the ordering itself is the whole point, not an incidental refactor"

requirements-completed: [EXTRACT-01]

coverage:
  - id: D1
    description: "zodOutputFormat(ExtractionSchema).schema generates the verified wire shape: every object node (root, card item, $defs sentence ref) forces additionalProperties:false, sentences array keeps minItems:1, notes is absent from required"
    requirement: "EXTRACT-01"
    verification:
      - kind: unit
        ref: "tests/extract-cards.test.ts#schema shape (EXTRACT-01) > generates a wire schema where every object node forces additionalProperties:false..."
        status: pass
    human_judgment: false
  - id: D2
    description: "zodOutputFormat(ExtractionSchema).parse throws AnthropicError on truncated JSON and on valid-JSON-but-schema-violating input (empty sentences array) — locks the SDK throw semantics the try/catch branching in extractCardsFromNotes depends on"
    requirement: "EXTRACT-01"
    verification:
      - kind: unit
        ref: "tests/extract-cards.test.ts#schema shape (EXTRACT-01) > throws AnthropicError when parsing mid-card truncated wrapper text"
        status: pass
      - kind: unit
        ref: "tests/extract-cards.test.ts#schema shape (EXTRACT-01) > throws AnthropicError when parsing valid JSON that violates the schema"
        status: pass
    human_judgment: false
  - id: D3
    description: "Happy-path object input (normalizeExtractedCards) and salvaged text input (parseExtractionResponse) produce identical normalized output — the V5 validation pipeline is source-agnostic"
    requirement: "EXTRACT-01"
    verification:
      - kind: unit
        ref: "tests/extract-cards.test.ts#schema shape (EXTRACT-01) > happy-path object input (normalizeExtractedCards) and salvaged text input (parseExtractionResponse) produce identical normalized output"
        status: pass
    human_judgment: false
  - id: D4
    description: "extractCardsFromNotes migrated to output_config.format + zodOutputFormat(ExtractionSchema), reads parsed_output on the happy path, registers stream.on('text') before awaiting finalMessage(), and reaches the salvage parser only through an AnthropicError catch — signature, model, max_tokens, thinking, and system string all unchanged; caller sites (lib/sync.ts, scripts/local-resync.mts) compile untouched"
    requirement: "EXTRACT-01"
    verification:
      - kind: unit
        ref: "npx tsc --noEmit (clean) + npm test (145 passed) + source-order/grep assertions (output_config present, stream.on('text') registered before await stream.finalMessage(), formatting instruction removed, BLANK-SAFETY GUARANTEE retained)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live single-lesson extraction via npx tsx scripts/local-resync.mts produces populated components[], unique normalizedFront values, and blank-safe sentences[0] for every card, with no 400 from the API about schema/optional-field handling (RESEARCH.md assumption A1)"
    verification: []
    human_judgment: true
    rationale: "Requires a live Claude API call and Turso credentials; per the plan this is a phase-end manual check (before /gsd-verify-work), not automatable in this plan's execution — matches Plan 01's D4 deferral pattern"

duration: 8min
completed: 2026-07-06
status: complete
---

# Phase 20 Plan 02: Structured Outputs Migration Summary

**Migrated `extractCardsFromNotes` from "ask for JSON in prose and salvage-parse it" to native Anthropic structured outputs — `output_config.format: zodOutputFormat(ExtractionSchema)` on the existing stream call, reading `message.parsed_output` on the happy path, with truncation salvage reached only through a pre-registered `stream.on('text')` accumulator and an `AnthropicError` catch.**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-06T22:06:05Z
- **Completed:** 2026-07-06T22:13:34Z
- **Tasks:** 2 completed
- **Files modified:** 5

## Accomplishments
- Promoted `zod` from a transitive `@anthropic-ai/sdk` peer dependency to an explicit `^4.3.6` direct dependency (pinned to the exact version RESEARCH.md empirically verified the wire schema against, overriding npm's default caret-to-latest-resolved write of `^4.4.3`)
- Defined a deliberately permissive `ExtractionSchema` export (`z.object({ cards: z.array(ExtractedCardSchema) })`) — verified empirically against the installed SDK that the generated wire schema forces `additionalProperties: false` on every object node (root, card item, and the sentence `$defs` ref), keeps `sentences.minItems: 1` as the one real server-enforced constraint, and omits `notes` from `required`
- Rewrote `extractCardsFromNotes` per the RESEARCH.md-verified branching: `output_config.format` added to the existing stream call; `stream.on('text')` accumulator registered before `await stream.finalMessage()`; happy path reads `message.parsed_output.cards` directly into the shared `normalizeExtractedCards`; a resolved message with null `parsed_output` (zero text blocks) throws a descriptive error including `stop_reason`; the catch branch salvages via `parseExtractionResponse(rawText, deckSet)` on `AnthropicError` with non-empty accumulated text, rethrowing the *original* error if salvage itself fails
- Deleted the now-dead post-response `message.content.find` text-block guard (replaced by the `parsed_output` null check)
- Trimmed only the "Return ONLY a JSON array. No markdown fences..." formatting instruction from the prompt — all semantic sections (exhaustiveness, one-card-per-base-form, component rules, BLANK-SAFETY GUARANTEE, general rules) untouched
- Added 4 schema-shape/drift-guard tests + 1 path-equivalence test to `tests/extract-cards.test.ts` (29 tests total in the file, 145 in the full suite)
- Refreshed CLAUDE.md's "Exhaustive extraction & dedup" section and the `lib/extract-cards.ts` Key files bullet to describe the structured-outputs pipeline instead of the stale bare-JSON-array contract

## Task Commits

Each task was committed atomically, following the plan's TDD (`tdd="true"`) protocol:

1. **Task 1: Add zod dependency, define ExtractionSchema, add schema-shape + SDK-parse-throw drift-guard tests (EXTRACT-01)**
   - `42e4334` (test) - add failing schema-shape + SDK-parse-throw drift-guard tests; promote zod to an explicit dependency (needed for the tests to even resolve `ExtractionSchema`, which did not yet exist — confirmed RED via `npx vitest run`)
   - `7c34581` (feat) - define the permissive `ExtractionSchema` in `lib/extract-cards.ts`; all 4 new tests pass (confirmed GREEN)
2. **Task 2: Migrate extractCardsFromNotes to output_config.format with accumulator + try/catch salvage branching; trim prompt; update CLAUDE.md (EXTRACT-01)**
   - `73e3b45` (test) - add the path-equivalence test (passes immediately — see Deviations; documents/guards a pre-existing Plan-01 invariant rather than exercising new pure-layer behavior)
   - `ce5b93b` (feat) - rewrite `extractCardsFromNotes`'s SDK call + branching, delete the dead post-response guard, trim the prompt's formatting instruction, refresh CLAUDE.md

**Plan metadata:** commit pending (this SUMMARY.md, see final commit below)

## Files Created/Modified
- `package.json` / `package-lock.json` - `zod` promoted to an explicit `^4.3.6` dependency
- `lib/extract-cards.ts` - Added `ExtractionSchema` export (+ module-private `ExtractedSentenceSchema`/`ExtractedCardSchema`); rewrote `extractCardsFromNotes`'s stream call (`output_config.format`), added the `on('text')` accumulator + try/catch branching, deleted the dead post-response text-block guard, trimmed the prompt's "Return ONLY a JSON array" line
- `tests/extract-cards.test.ts` - Added `describe('schema shape (EXTRACT-01)')` (4 tests: wire-schema shape, truncated-text throw, schema-violation throw, unknown-key stripping) plus the path-equivalence test between `normalizeExtractedCards` and `parseExtractionResponse`
- `CLAUDE.md` - Refreshed the "Exhaustive extraction & dedup" architecture paragraph and the `lib/extract-cards.ts` Key files bullet to describe the structured-outputs pipeline

## Decisions Made
- Pinned `zod@4.3.6` exactly (rather than letting npm write whatever caret range it resolved to, which was `^4.4.3`) so `package.json` matches the exact version RESEARCH.md's empirical schema-generation runs verified against — the plan's acceptance criteria specifically named `"zod": "^4.3.6"`.
- Kept the salvage-failure rethrow as the *original* `AnthropicError` rather than a generic error, per RESEARCH.md's Open Question 1 recommendation — preserves the SDK's diagnostic detail (e.g. exact JSON parse position) in `lib/sync.ts`'s per-lesson failure report.
- Left the `instanceof AnthropicError` catch broad (not narrowed to exclude `APIError`) — a mid-stream connection drop salvages whatever cards completed, which RESEARCH.md judged strictly better than losing them entirely.
- Did not add a `stop_reason === 'max_tokens'` branch on the happy path — RESEARCH.md's SDK Behavior Finding #2 confirms truncation never reaches a resolved message when `zodOutputFormat` is used; it always surfaces as a rejected `finalMessage()`, which the catch block already covers.

## Deviations from Plan

None — plan executed exactly as written. One TDD-ordering note (not a deviation from acceptance criteria): the plan's Task 2 behavior block specifies a "path equivalence" test between `normalizeExtractedCards` (object input) and `parseExtractionResponse` (text input). This test passed immediately upon being written, because Plan 01 already extracted `normalizeExtractedCards` as the shared pure pipeline both paths flow through — there is no new pure-layer behavior in Task 2 to make it fail first. This matches the plan's own framing ("Existing suite: all Plan-01 and Task-1 tests remain green — no behavior change to the pure layer"): Task 2's actual behavior change is the SDK-call rewrite in `extractCardsFromNotes`, which is not unit-testable without a live API call and is instead verified via source-order/grep assertions (accumulator-before-await, `output_config` presence, formatting-instruction removal) plus the phase-end manual live check. Committed the test as a regression guard for the invariant, then proceeded straight to the GREEN implementation.

## Issues Encountered
None. TypeScript compiled clean (`npx tsc --noEmit`), the full suite (145 tests, 14 files) passed, and `npm run lint` reported 0 errors (1 pre-existing unrelated warning in `components/StudySession.tsx`, out of scope for this plan).

## User Setup Required

None for this plan's automated portion — no external service configuration required. However, per the plan's phase-end verification step (not part of this plan's automated completion), a **live single-lesson extraction** via `npx tsx scripts/local-resync.mts` should be run before `/gsd-verify-work` closes out Phase 20, requiring `ANTHROPIC_API_KEY` + Turso credentials in `.env`. This confirms:
- No 400 error from the API regarding the optional `notes` field (RESEARCH.md assumption A1)
- Populated `components[]`, unique `normalizedFront` values, and a blank-safe `sentences[0]` for every extracted card

## Next Phase Readiness

- `extractCardsFromNotes` now reads `parsed_output` on the happy path and only reaches the Plan-01 salvage parser through the verified `AnthropicError` catch with pre-accumulated text — EXTRACT-01, EXTRACT-02, and EXTRACT-03 are all wired together end to end.
- The prompt-side contract mismatch flagged at the end of Plan 01 (live prompt asking for a bare JSON array while `parseExtractionResponse` only accepted the wrapper) is now resolved — the prompt no longer asks for any particular JSON formatting, and the structured-outputs `output_config.format` guarantees the `{ cards: [...] }` shape server-side.
- Full test suite (145 tests) and lint (0 errors) are green as of this plan's completion; `npx tsc --noEmit` is clean.
- Phase criterion #4's live half (sample-lesson extraction still dedups by `normalizedFront` and applies `filterComponents` with no regression) is ready to be exercised via the phase-end manual `local-resync.mts` check described above — this was blocked on Plan 02 landing and is now unblocked.

## Self-Check: PASSED

- FOUND: lib/extract-cards.ts
- FOUND: tests/extract-cards.test.ts
- FOUND: package.json (zod ^4.3.6)
- FOUND: CLAUDE.md (refreshed extraction section)
- FOUND: 42e4334 (test — schema-shape + drift-guard tests, RED)
- FOUND: 7c34581 (feat — ExtractionSchema, GREEN)
- FOUND: 73e3b45 (test — path-equivalence test)
- FOUND: ce5b93b (feat — extractCardsFromNotes rewrite + CLAUDE.md refresh)

---
*Phase: 20-extraction-pipeline-hardening*
*Completed: 2026-07-06*
