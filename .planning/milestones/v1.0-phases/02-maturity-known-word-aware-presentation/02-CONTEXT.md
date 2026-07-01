# Phase 2: Maturity- & Known-Word-Aware Presentation - Context

**Gathered:** 2026-06-26
**Status:** Ready for planning

<domain>
## Phase Boundary

**In scope (this phase):** Fix presentation so (a) brand-new cards arrive as a bare Korean word on the flashcard front in Exposure mode — not buried in a sentence — and (b) whenever a sentence is shown it prefers the one with the fewest unknown words (least-unknown ranking). Two touch points: a server-side `unknownCount` annotation added to each sentence in `app/api/cards/due/route.ts`, and the sentence-selection + bare-word-first gate in `components/StudySession.tsx`. A new pure helper `lib/known-words.ts` (`countUnknownWords`) provides the ranking signal and gets its own unit tests.

**Explicitly NOT in this phase:** Any session-selection changes (Phase 1, done). No FSRS algorithm changes. No changes to Recall or fill-blank flows beyond benefiting from least-unknown sentence pick (those are explicit blanking opt-ins). No changes to multiple-choice (already shows bare word). No attempt at perfect Korean tokenization — `countUnknownWords` is a ranking signal only.

Brownfield: this is a mature, deployed app. Follow conventions in `./.claude/CLAUDE.md` and `./CLAUDE.md`. Do not scaffold project/routing/DB.

</domain>

<decisions>
## Implementation Decisions

### isNewCard Threshold (covers PRES-01, PRES-02)

- **D-01 — isNewCard = state 0 (New) OR state 1 (Learning):** Bare-word-first applies to every review until the card graduates to state 2 (Review). A Learning card is still being drilled; showing the sentence on the front would be a crutch before the word is consolidated.
  - Derivation: `const isNewCard = !realCard?.review || (realCard.review.state ?? 0) <= 1`
  - `review` is already returned by the API (included in the `cards/due` response).

- **D-02 — State 3 (Relearning) keeps sentence-on-front:** A lapsed card has been learned before; showing it in sentence context when relearning may help re-anchor the meaning. No bare-word treatment for state 3.

- **D-03 — showBareFront gate:** `showBareFront = mode === 'flashcard' && flashcardSubMode === 'exposure' && isNewCard && cardSentences.length > 0`. Change the front-face condition in `StudySession.tsx:546` to render the bare-word block when `showBareFront`, else current behavior. The back face is unchanged — it already shows sentence → divider → Korean word → meaning → notes.

### Known-Word Threshold for Sentence Ranking (covers PRES-03, QUAL-02)

- **D-04 — FSRS state ≥ 2 counts as "known":** Both Review (state 2) and Relearning (state 3) cards are treated as known for the purpose of ranking sentences. A lapsed card was once fully learned; its word probably isn't a blocker even if recently forgotten.
  - Server query: `prisma.card.findMany({ where: { review: { state: { gte: 2 } } }, select: { normalizedFront: true } })`

- **D-05 — Target word excluded via `targetForm` parameter:** `countUnknownWords(korean, targetForm, knownLemmas)` already skips tokens belonging to `targetForm`. The card's own word is never counted as an unknown. No need to force-add it to `knownLemmas`.

### Claude's Discretion

- **Hint text under bare word:** Plan specified "Recall the meaning" — matching the existing Recall sub-mode prompt pattern (`StudySession.tsx:552`). Claude may use this or "Recall the meaning" in the same `text-xs text-gray-500` style.
- **Internal structure of `countUnknownWords`:** Naming of locals, helper function shape, exact tokenization details — as long as it is pure, reuses `normalizeFront` + `splitParticle`, excludes `targetForm`, and produces a count.
- **Test fixture details in `tests/known-words.test.ts`:** How Korean test strings are constructed; as long as all QUAL-02 cases are present and deterministic.
- **`unknownCount` type on client Sentence:** `unknownCount?: number` (optional, mirrors server annotation).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The design (authoritative)
- `foundation-first-plan.md` Part 2 (§2a, §2b, §2c, Tests, Verification, Files) — this phase's spec; Part 1 is Phase 1 (done, ignore). The "Files" section lists exactly what to modify.

### Requirements
- `.planning/REQUIREMENTS.md` — PRES-01 through PRES-05, QUAL-02, QUAL-03, QUAL-04 are this phase's requirements.
- `.planning/phases/02-maturity-known-word-aware-presentation/02-CONTEXT.md` — decisions in this file.

### Code to modify
- `app/api/cards/due/route.ts` — add `unknownCount` annotation after `ordered` (§2b); query learned cards once; annotate each sentence.
- `components/StudySession.tsx` — sentence-selection (replace `chosenIdx` rotation at lines ~302-322 with least-unknown pick); add `showBareFront` gate at front-face condition (line ~546).
- `lib/known-words.ts` — NEW pure module; `countUnknownWords(korean, targetForm, knownLemmas)`.
- `tests/known-words.test.ts` — NEW unit tests for `countUnknownWords` (QUAL-02 cases).

### Code to reuse
- `lib/card-key.ts` → `normalizeFront` — for lemma resolution in `countUnknownWords`
- `lib/sentence-match.ts` → `splitParticle` — for particle-stem fallback in token resolution
- `tests/sequence.test.ts` — reference for Vitest test style (same runner: `npm test` → `vitest run`)

### Conventions / constraints
- `./.claude/CLAUDE.md` and `./CLAUDE.md` — architecture, lint rules (`react-hooks/purity`), libSQL/Turso gotchas
- `vitest.config.ts` — test runner config

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/card-key.ts:normalizeFront` — strips English glosses, NFC-normalizes, collapses whitespace. Used as the DB dedup key and must be the same resolution step in `countUnknownWords`.
- `lib/sentence-match.ts:splitParticle` — conservative particle splitter for Korean tokens. Mirrors the tap-to-gloss resolution order. Already documented as "orthographic ambiguity accepted."
- `components/StudySession.tsx` bare-word block (lines ~573-582) — the existing no-sentence branch (`<p className="hangul text-5xl ...">`) is exactly the bare-word front we need; `showBareFront` re-routes to it.

### Established Patterns
- `react-hooks/purity` — `countUnknownWords` and all sentence-selection logic must remain pure in render: no `Date.now()`, no `Math.random()`. The `knownLemmas` Set flows down from the API as data, not computed in render.
- `unknownCount` is a server-side annotation on each `Sentence` object in the JSON response — the client reads it as data, never recomputes it.
- Blank-safety rules are preserved: `needsBlank` → override to first blank-safe sentence (lines ~306-319 in StudySession). The least-unknown pick replaces the `rotationIdx` selection within the safe-to-blank pool when `needsBlank` is true.

### Integration Points
- `app/api/cards/due/route.ts` after `const ordered = sequenceCards(...)` — add known-lemma query + `unknownCount` annotation before `NextResponse.json`.
- `components/StudySession.tsx` sentence-selection block (lines ~291-322) — `chosenIdx` computation is the replacement target; add `showBareFront` derived value nearby.
- The `Card` type in `StudySession.tsx` (line ~29) already carries `review?: { state?: number | null, reps?: number | null }` — `isNewCard` reads `state` from there, no API change needed.

</code_context>

<specifics>
## Specific Ideas

- `showBareFront` derivation (pure, in render): `const isNewCard = !realCard?.review || (realCard.review.state ?? 0) <= 1; const showBareFront = mode === 'flashcard' && flashcardSubMode === 'exposure' && isNewCard && cardSentences.length > 0`
- Least-unknown sentence selection (replaces bare `rotationIdx`):
  1. Compute `minUnknown = Math.min(...cardSentences.map(s => s.unknownCount ?? Infinity))`
  2. Collect candidate indices at `minUnknown`
  3. Pick within that tier: `candidates[(hashStr(realCard.id) + reps) % candidates.length]`
  4. Override with blank-safe index when `needsBlank` (preserve existing blank-safety)
- `countUnknownWords` resolution order per token: `normalizeFront(token)` → if not in `knownLemmas`, try `splitParticle(token).stem` → if stem in `knownLemmas`, count as known. Skip token if it belongs to `targetForm`.
- Known-lemma query runs once after `ordered`: `prisma.card.findMany({ where: { review: { state: { gte: 2 } } }, select: { normalizedFront: true } })` → `new Set(rows.map(r => r.normalizedFront))`. Trivial cost at session sizes (≤ sessionSize × 3 sentence scans).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-maturity-known-word-aware-presentation*
*Context gathered: 2026-06-26*
