# Phase 1: Foundation-Aware Session Selection - Context

**Gathered:** 2026-06-25
**Status:** Ready for planning
**Source:** Plan-doc express path (synthesized from `foundation-first-plan.md` Part 1 + `.planning/PROJECT.md` Key Decisions)

<domain>
## Phase Boundary

**In scope (this phase):** Make study-session *selection* prerequisite-coherent. Today
`app/api/cards/due/route.ts` caps to the most-due `sessionSize` cards **before** sequencing and
fetches prerequisite edges only among those already-capped IDs — so a due dependent can enter a
session while its (also-due) prerequisite gets bumped out, and the size cap is never accounted for
during selection. This phase introduces a pure `selectSessionCards` selector that operates over the
whole eligible pool, pulls each chosen card's still-due in-pool prerequisites into the session
(downward-closed under the prerequisite relation), and applies the `sessionSize` cap *during*
selection. The existing `sequenceCards()` reordering stays in place and runs after selection.

This is **Part 1 only** of `foundation-first-plan.md`. The selector is a new pure function alongside
`sequenceCards` in `lib/sequence.ts`; the route is rewired to use it; unit tests cover it.

**Explicitly NOT in this phase (it is Phase 2):** Any presentation change — `lib/known-words.ts`,
`countUnknownWords`, the `unknownCount` sentence annotation in the route, and the bare-word-first /
least-unknown-sentence behavior in `components/StudySession.tsx`. Phase 1 touches no React component
and adds no known-word logic. The route's only change is the selection rewire (Part 1b); the Part 2b
`unknownCount` annotation is deferred to Phase 2.

Brownfield: this is a mature, deployed app. Do not scaffold project/routing/DB — all of that exists.
Follow the conventions in `./.claude/CLAUDE.md` and `./CLAUDE.md`.
</domain>

<decisions>
## Implementation Decisions

Everything below is a **locked decision** confirmed with the user (per `foundation-first-plan.md`
"Decisions confirmed with the user" and the `PROJECT.md` Key Decisions table). Decision IDs (D-NN)
are trackable — each must be reflected in a plan.

- **D-01 — Selection strategy** (covers SEL-01, SEL-05):
Keep the most-due selection priority but **pull prerequisites into the session**: a chosen card always
drags its still-due, in-pool prerequisites in with it, foundations first. Selection and edge-fetching
operate over the **whole eligible pool**, not the already-capped most-due IDs.

- **D-02 — New pure selector `selectSessionCards`** (covers SEL-01, SEL-02, SEL-04):
Add `selectSessionCards(pool, edges, sessionSize, now)` next to `sequenceCards` in `lib/sequence.ts`.
- Reuse the existing `SeqCard` / `SeqEdge` types and the same in-pool adjacency-building + cycle-guard
  pattern already used by `sequenceCards` (the `inSession` set, `prereqs` map filtered to in-pool edges,
  and the `visiting`-set DFS).
- If `pool.length <= sessionSize` → return `pool` unchanged (everything fits).
- Build `poolById` and the in-pool `prereqs` map (only edges whose both endpoints are in the pool).
- **Seeds** = pool sorted most-due-first: `nextReview` ascending, tiebreak `lesson.orderIndex`
  ascending, then `id` lexicographic — preserves today's "most urgent first" selection priority and
  is purity-safe (stable, no `Date.now()`/`Math.random()` in the comparator).
- `addClosure(card)`: DFS guarded by a `visiting` set (cycle-safe, mirrors `sequenceCards`); recurse
  into each in-pool prerequisite **first**, then push the card. This guarantees every card's
  prerequisites precede it in the output — the result is **downward-closed** under the prereq relation.
- Function is **pure**: `now` is a parameter; no impure calls in the body.

- **D-03 — Size cap honored during selection** (covers SEL-03):
Iterate seeds: before starting a seed, `if (result.length >= sessionSize) break;` otherwise
`addClosure(seed)`. Overshoot is bounded to **at most one prerequisite closure** beyond `sessionSize`.
Finish with `return result.slice(0, sessionSize)` — safe because any prefix of a downward-closed list
is still downward-closed (a kept card's prereqs always have a smaller index, so truncation only drops
dependents, never orphans a prerequisite).

- **D-04 — Cycle-safety** (covers SEL-04):
Dependency cycles (if any exist in the data) must never cause infinite recursion or duplicate cards.
Use a `visiting` recursion-stack set plus a "already added" guard so each card is pushed at most once;
a node already on the stack is treated as if its back-edge is absent (same convention as
`sequenceCards`).

- **D-05 — Rewire `app/api/cards/due/route.ts`** (covers SEL-05, SEL-03, SEL-01):
- Drop `take: sessionSize` from the main `findMany`; add a generous safety cap `take: 1000` to bound
  the worst case. Keep the existing `where` (lesson-range clause + due/ahead scope),
  `include` (review, lesson, sentences), and `orderBy: { review: { nextReview: 'asc' } }`.
- Fetch prerequisite edges across the **whole pool** (same query shape: `cardId`/`prerequisiteId`
  both `in` the pool IDs).
- Replace the current `const ordered = sequenceCards(cards, edges, now)` with:
  `const chosen = selectSessionCards(cards, edges, sessionSize, now)` then
  `const ordered = sequenceCards(chosen, edges, now)`. `sequenceCards` already ignores out-of-session
  edges, so passing the whole-pool edge list is safe.
- The empty-result early return and the response shape stay unchanged.

- **D-06 — Lesson-range filter interaction** (informational — accepted scope limit):
With a lesson-range filter active, a prerequisite outside the selected range is not in the pool and
will not be pulled in. This is **accepted** — the user scoped study to those lessons. No special
handling; just do not regress the existing lesson-range `where` clause. *(Out of scope per
REQUIREMENTS.md; not a tracked must-have.)*

- **D-07 — Tests for `selectSessionCards`** (covers QUAL-01):
Extend `tests/sequence.test.ts` (vitest; `npm test` → `vitest run`) with `selectSessionCards` cases:
1. pool ≤ size returns all;
2. a due dependent pulls in its less-due (less-overdue) prerequisite;
3. output is downward-closed **and** capped at `sessionSize`;
4. cycle-safe (a 2-node cycle terminates, no duplicates);
5. overshoot bounded by a single closure.

### Claude's Discretion
- Exact internal helper structure of `selectSessionCards` (naming of locals, whether `addClosure` is
  nested or a closure), as long as it is pure and matches the contract above.
- The precise shape of the safety cap constant (inline `1000` vs a named const) — pick what reads best
  alongside existing code.
- Test fixture construction details (how `SeqCard`/`SeqEdge` fixtures are built), provided all five
  QUAL-01 assertions are present and deterministic.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### The design (authoritative)
- `foundation-first-plan.md` — Part 1 (1a + 1b) is this phase's spec; the "Tests", "Verification",
  and "Files" sections apply (Part 1 rows only). Part 2 is Phase 2 — ignore it here.

### Code to modify / reuse
- `lib/sequence.ts` — add `selectSessionCards`; reuse `SeqCard`, `SeqEdge`, the `inSession`/`prereqs`
  adjacency build, and the `visiting`-set cycle-guard DFS already present for `sequenceCards`.
- `app/api/cards/due/route.ts` — the selection rewire (D-05); current selection at the `findMany`
  `take: sessionSize`, edge fetch, and `sequenceCards` call.
- `tests/sequence.test.ts` — existing `sequenceCards` tests; add `selectSessionCards` cases here.

### Conventions / constraints
- `./.claude/CLAUDE.md` and `./CLAUDE.md` — architecture, lint rules, libSQL/Turso gotchas, scripts.
- `lib/settings.ts` — `getSessionSize()` (already imported by the route).
- `vitest.config.ts` — test runner config.

</canonical_refs>

<specifics>
## Specific Ideas

- `selectSessionCards` signature: `selectSessionCards<T extends SeqCard>(pool: T[], edges: SeqEdge[],
  sessionSize: number, now?: Date): T[]` — mirror `sequenceCards`'s generic + default-`now` shape so
  the two compose cleanly in the route.
- The selector returns the *chosen set* (downward-closed, capped); ordering for display is still
  `sequenceCards`'s job. Keep the two concerns separate.
- Safety cap `take: 1000` on the pool query bounds the Vercel 60s-function worst case; selection +
  edge fetch stay cheap (single edge query over pool IDs).
</specifics>

<deferred>
## Deferred Ideas

Phase 2 (Maturity- & Known-Word-Aware Presentation), per `foundation-first-plan.md` Part 2:
- `lib/known-words.ts` + `countUnknownWords` (PRES-03, QUAL-02)
- `unknownCount` sentence annotation in `app/api/cards/due/route.ts` (Part 2b)
- bare-word-first front + least-unknown sentence pick in `components/StudySession.tsx`
  (PRES-01, PRES-02, PRES-05)
- blank-safety preservation in Recall/fill-blank (PRES-04)
</deferred>

---

*Phase: 01-foundation-aware-session-selection*
*Context gathered: 2026-06-25 via plan-doc express path*
