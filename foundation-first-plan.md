# Foundation-first study: fix selection + presentation

## Context

The app sequences flashcards "foundation-first" — a card like **eat** / **apple** should be
studied before the card whose sentence is *"I eat apples."* Two design gaps undermine this:

1. **Selection isn't foundation-aware.** `app/api/cards/due/route.ts:42-56` selects the *most-due*
   `sessionSize` cards (`orderBy nextReview asc`, `take: sessionSize`) **first**, then
   `sequenceCards()` only *reorders* that fixed set (`route.ts:66-75`). Prerequisite edges are
   even fetched *only among the already-capped IDs* (`route.ts:66-73`). Result: a due dependent can
   be pulled into the session while its (also-due) prerequisite is bumped out — so the
   "foundation-first" promise is just a reshuffle of a possibly-incoherent set, and the session-size
   cap is never accounted for during selection.

2. **Sentence-first presentation ignores maturity and known-words.** `components/StudySession.tsx:546-582`
   shows an example sentence on the flashcard front whenever the card has sentences (gated only by
   "has sentences vs. not"). The sentence is chosen by pure rotation (`hashStr(id)+reps`,
   `StudySession.tsx:302-322`) with no regard for whether the card is brand-new or whether the
   *other* words in the sentence are already learned. A new **apple** card is shown buried in
   *"Johnny likes apples"* — words like *likes* may be unknown, directly conflicting with building a
   foundation before context.

**Outcome wanted:** (a) sessions are prerequisite-coherent — a dependent never appears without its
still-unlearned prerequisites; (b) new words are introduced bare first, with the example sentence as
back-of-card context, and whenever a sentence is shown it prefers one whose other words are known.

Decisions confirmed with the user:
- **Selection:** *Pull in prerequisites* — keep most-due selection but always drag a chosen card's
  still-due prerequisites into the session (foundations first).
- **Presentation:** *Bare word first for new cards* **+** *prefer known-word sentences*.

---

## Part 1 — Foundation-aware session selection

### 1a. New pure selector in `lib/sequence.ts`
Add `selectSessionCards(pool, edges, sessionSize, now)` next to `sequenceCards` (reuse `SeqCard`,
`SeqEdge`, and the same in-pool adjacency-building + cycle-guard pattern at `lib/sequence.ts:54-81`):

- If `pool.length <= sessionSize` → return `pool` (everything fits).
- Build `poolById` and the in-pool `prereqs` map (same filter as `sequence.ts:59-63`).
- **Seeds** = pool sorted most-due-first (`nextReview asc`, tiebreak `lesson.orderIndex`, then `id`) —
  preserves today's "most urgent first" selection priority.
- `addClosure(card)`: DFS with a `visiting` set (cycle-safe like `sequence.ts:70-81`) — recurse into
  each in-pool prerequisite first, then push the card. This guarantees **every card's prerequisites
  precede it** in the output (the result is downward-closed under the prereq relation).
- Iterate seeds: before starting a seed, `if (result.length >= sessionSize) break;` else
  `addClosure(seed)`. Overshoot is bounded by one closure.
- `return result.slice(0, sessionSize)` — safe because any prefix of a downward-closed list is still
  downward-closed (a kept card's prereqs always have smaller index, so truncation only drops
  dependents, never orphans a prereq).

### 1b. Rewire `app/api/cards/due/route.ts`
- Drop `take: sessionSize` from the main `findMany` (add a generous safety cap `take: 1000` to bound
  worst case); keep `orderBy: { review: { nextReview: 'asc' } }` and the existing `where`/`include`.
- Fetch edges across the **whole pool** (same query shape, `cardId`/`prerequisiteId` in pool IDs).
- Replace `route.ts:75` with: `const chosen = selectSessionCards(pool, edges, sessionSize, now)`
  then `const ordered = sequenceCards(chosen, edges, now)` (`sequenceCards` already ignores
  out-of-session edges, so passing all pool edges is fine).
- **Note (expected):** with a lesson-range filter active, a prerequisite outside the selected range
  isn't in the pool and won't be pulled in — acceptable, the user scoped to those lessons.

---

## Part 2 — Maturity- & known-word-aware presentation

### 2a. Known-word burden helper — new `lib/known-words.ts` (pure)
- `countUnknownWords(korean, targetForm, knownLemmas: Set<string>): number` — tokenize the sentence
  on whitespace; for each token, resolve via `normalizeFront(token)` (`lib/card-key.ts`), then fall
  back to the `splitParticle` stem (`lib/sentence-match.ts`); skip tokens belonging to `targetForm`;
  count tokens whose resolved lemma is **not** in `knownLemmas`. Mirrors the tap-to-gloss resolution
  order already used in `components/HighlightedSentence.tsx`.
- Tokenization is imperfect for Korean (acknowledged in CLAUDE.md re: `splitParticle`); this is a
  *ranking* signal only, never correctness-critical.

### 2b. Server: annotate sentences with `unknownCount` in `app/api/cards/due/route.ts`
- After `ordered`, query learned cards once:
  `prisma.card.findMany({ where: { review: { state: { gte: 2 } } }, select: { normalizedFront: true } })`
  (FSRS state ≥ 2 = Review/Relearning = "known"; confirm enum in `lib/fsrs.ts`). Build
  `knownLemmas = new Set(...)`.
- For each card's each sentence, set `s.unknownCount = countUnknownWords(s.korean, s.targetForm, knownLemmas)`
  before `NextResponse.json`. Trivial cost (≤ sessionSize × 3 sentences).

### 2c. Client: prefer least-unknown sentence + bare-word-first for new cards — `components/StudySession.tsx`
- Add optional `unknownCount?: number` to the client `Sentence`/`Card` type.
- **Least-unknown selection** (replaces the bare rotation at `StudySession.tsx:302-322`): compute
  `minUnknown` across `cardSentences`; candidate indices = those at `minUnknown`; pick within that
  tier by the existing rotation `(hashStr(id)+reps) % candidates.length` (keeps variety once words are
  known), then apply the current blank-safe override when `needsBlank` (`sequence.ts`/`route` blank
  rules preserved — `StudySession.tsx:309-319`).
- **Bare-word-first gate (Mechanism 1):** derive `isNewCard` = no `review` row, or `review.state` is
  New/Learning (0/1). Add
  `showBareFront = mode === 'flashcard' && flashcardSubMode === 'exposure' && isNewCard && !!chosenSentence`.
  Change the front-face condition (`StudySession.tsx:546`) to render the **bare-word block**
  (existing `:573-582`) when `showBareFront`, else the sentence block. The **back face already shows
  the sentence as context** (keys on `chosenSentence`, `:590-634`) — so a new card flips from bare
  word → meaning + (now least-unknown) example sentence. Add a small "Recall the meaning" prompt under
  the bare word for parity.
- **Scope:** applies to the default flashcard **Exposure** path. Recall and fill-blank are explicit
  user opt-ins into blanking and keep showing a sentence — but they also benefit from the
  least-unknown pick. Multiple-choice already shows the bare word (`:666`) — unchanged.
- Card height auto-remeasures via the existing `useLayoutEffect`, so the shorter bare front is fine.

---

## Tests
- `tests/sequence.test.ts` — add `selectSessionCards`: (1) pool ≤ size returns all; (2) a due
  dependent pulls in its less-due prerequisite; (3) output is downward-closed and capped at
  `sessionSize`; (4) cycle-safe; (5) overshoot bounded by one closure.
- `tests/known-words.test.ts` (new) — `countUnknownWords`: counts unknown tokens, excludes the
  target form, resolves particle stems, respects the known set, all-known → 0.

## Verification
1. `npm test` — pure selector + known-word helpers pass.
2. `npm run lint` && `npm run build` — clean (watch `react-hooks/purity`: keep all new sentence/
   maturity logic pure in render; read no `Date.now()`).
3. Manual (`npm run dev`): seed/identify a due dependent whose prerequisite is also due but less
   overdue → confirm the prerequisite now appears in the session and is shown first. Start a session
   with a brand-new card → front shows the bare word, flip shows meaning + the least-unknown example
   sentence; a matured card still shows sentence-on-front.

## Files
- `lib/sequence.ts` — add `selectSessionCards` (pure).
- `lib/known-words.ts` — new, `countUnknownWords` (pure).
- `app/api/cards/due/route.ts` — foundation-aware selection + `unknownCount` annotation.
- `components/StudySession.tsx` — least-unknown sentence pick + bare-word-first front gate.
- `tests/sequence.test.ts`, `tests/known-words.test.ts` — coverage.
