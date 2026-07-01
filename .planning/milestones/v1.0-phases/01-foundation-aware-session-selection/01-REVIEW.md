---
phase: 01-foundation-aware-session-selection
reviewed: 2026-06-25T23:30:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - lib/sequence.ts
  - tests/sequence.test.ts
  - app/api/cards/due/route.ts
findings:
  critical: 1
  warning: 4
  info: 3
  total: 8
status: resolved
resolution:
  resolved_at: 2026-06-25T23:35:00Z
  fix_commit: b354d0c
  critical_resolved: 1
  warnings_resolved: 1
  dispositioned: "WR-02/WR-03 accepted (theoretical/scale, single-user app); WR-04/IN-01/IN-02/IN-03 minor (IN-02 incidentally resolved by the nextReviewMs helper)"
---

# Phase 1: Code Review Report

**Reviewed:** 2026-06-25T23:30:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** resolved (CR-01 + WR-01 fixed in b354d0c; see Resolution below)

## Resolution (post-review, 2026-06-25)

**CR-01 (Critical) — FIXED in `b354d0c`.** Rather than flattening at the route boundary
(the reviewer's suggestion, which would duplicate `nextReview` into the JSON response and
change the response shape the plan requires to stay identical), the pure functions now read
the due date from the `review` relation. A module-private `nextReviewMs(card)` helper reads
`card.review?.nextReview ?? card.nextReview` (relation-first, flat fallback) and is used by
`selectSessionCards`'s seed sort, `sequenceCards`'s `urgencyBoost`, and the `sequenceCards`
tiebreak. The route is unchanged — response shape preserved.

**WR-01 (test fidelity) — FIXED in `b354d0c`.** The `card()` fixture now builds the real
Prisma shape `{ id, review: { nextReview } }`, so all cases exercise the relation path. Added
a discriminating seed-priority test ("prioritizes the most-due card as seed…") whose ids are
reverse-alphabetical to due-ness — it fails under the bug (id tiebreak picks `'aaa'`) and
passes with the fix (most-due picks `'zzz'`). The existing `sequenceCards` "urgency promotes"
test now also guards the urgency path against the relation shape. `npm test` 53 pass.

**IN-02 — incidentally resolved:** the triplicated date-coercion is now centralized in
`nextReviewMs`.

**Dispositioned (not changed):**
- **WR-02** (null `nextReview` sorts as most-urgent): both route scopes (`due`/`ahead`) require
  a matching `review` row via the `where` clause, so a null `nextReview` cannot reach the
  sequencer here. Behavior left as-is (returns 0); documented footgun for hypothetical reuse.
- **WR-03** (`take: 1000` can truncate closure for >1000 due cards): accepted v1 DoS bound per
  the plan's threat model (T-01-01). Unrealistic for a single-user study app; revisit if decks
  ever approach that scale.
- **WR-04 / IN-01 / IN-03:** cosmetic. `void now` (IN-01) is intentional per the plan
  (signature parity); `inPool`/`poolById` (WR-04) and the route comment (IN-03) left untouched
  to keep the fix surgical.

## Summary

Phase 1 adds a pure `selectSessionCards` selector to `lib/sequence.ts`, five unit
tests, and rewires `GET /api/cards/due` to fetch a bounded pool (`take: 1000`) and
run `selectSessionCards` before `sequenceCards`. The closure algorithm itself
(downward-closure, bounded overshoot, cycle-safety) is correct and well-tested in
isolation, and the route preserves its validation, lesson-range clause, empty-result
early return, and JSON response shape.

However, there is a **field-shape mismatch** that defeats the entire purpose of the
phase: both `selectSessionCards` and `sequenceCards` read `card.nextReview`, but the
Prisma `Card` objects the route passes carry the due date on the nested
`card.review.nextReview` relation. `card.nextReview` is `undefined` for every real
card, so the new selector's seed-priority sort and the existing urgency boost both
collapse to a constant. This is a pre-existing latent bug in `sequenceCards`, but
Phase 1 makes it load-bearing: `selectSessionCards` is now the gatekeeper deciding
*which* cards enter the session, and that decision is driven entirely by the broken
field. The unit tests pass because they construct synthetic cards with `nextReview`
flattened onto the card — a shape the route never produces — so they cannot catch it.

The core value promise ("foundation-first; what you study is learnable in the moment")
still holds structurally (closure ordering is correct), but the *seed selection* —
which due cards make the cut when the pool exceeds `sessionSize` — is effectively
arbitrary (falls through to `lesson.orderIndex` then `id`), not most-due-first.

## Critical Issues

### CR-01: `nextReview` is read off the wrong object — every card's due date is `undefined` at runtime

**File:** `lib/sequence.ts:110`, `lib/sequence.ts:127-128`, `lib/sequence.ts:167-168`; `app/api/cards/due/route.ts:74-75`

**Issue:**
The route fetches cards with `include: { review: true, ... }`. In the Prisma schema,
`nextReview` is a column on `CardReview` (`prisma/schema.prisma:81`), exposed as the
optional relation `Card.review` (`CardReview?`). So each object passed to the
sequencer is shaped `{ id, front, ..., review: { nextReview, ... }, lesson: {...} }`.
There is **no** `nextReview` property directly on the card.

Both functions read `card.nextReview` (not `card.review.nextReview`):
- `selectSessionCards` seed sort (`lib/sequence.ts:167-168`) — `a.nextReview` is
  `undefined`, so `nrA`/`nrB` both fall to `0` and **every card ties on due date**.
  Seed priority then degrades to `lesson.orderIndex` then `id` — i.e. the "most
  overdue cards seed first" guarantee in the docstring/comments is silently false.
- `sequenceCards` urgency boost (`lib/sequence.ts:110`) — `nr` is `undefined`,
  `urgencyBoost` returns `0` for every card, so the "overdue card can leapfrog a
  prerequisite" behavior never fires in production.

Because `SeqCard.nextReview` is typed optional (`nextReview?: Date | string | null`),
TypeScript strict mode does **not** flag the missing property — the bug is invisible
at compile time. The rest of the codebase reads the field correctly from the nested
relation (e.g. `components/StudySession.tsx:385` uses `updatedReview?.nextReview`),
confirming `nextReview` genuinely lives under `review`, not on the card.

Impact: the phase's headline behavior (most-due-first session selection blended with
overdue-urgency) does not work against real data. The session is filled by
lesson/id order among the (DB-pre-sorted) pool rather than by urgency.

**Fix:** Map the nested field onto the shape the pure functions expect at the route
boundary, OR teach the functions to read the relation. Preferred (keep lib functions
pure and decoupled from Prisma shape) — flatten at the call site:

```ts
// app/api/cards/due/route.ts
const seqInput = cards.map((c) => ({ ...c, nextReview: c.review?.nextReview ?? null }))
const chosen  = selectSessionCards(seqInput, edges, sessionSize, now)
const ordered = sequenceCards(chosen, edges, now)
return NextResponse.json(ordered)
```

(Note `NextResponse.json(ordered)` then includes the duplicated top-level
`nextReview` plus the nested `review.nextReview`; confirm the client tolerates the
extra field, or strip it before responding.)

Add a regression test that feeds the **route's actual card shape**
(`{ id, review: { nextReview } }`) through `selectSessionCards`/`sequenceCards` and
asserts most-due-first ordering — see WR-01.

## Warnings

### WR-01: Unit tests exercise a card shape the route never produces

**File:** `tests/sequence.test.ts:4-8`

**Issue:**
The `card()` helper builds `{ id, nextReview }` — `nextReview` flattened directly onto
the card. The production caller (`app/api/cards/due/route.ts`) passes Prisma objects
where the due date is at `review.nextReview`. The tests therefore pass while the real
integration is broken (CR-01). This is the test-fidelity gap that let the critical bug
ship green. The five `selectSessionCards` tests prove the *closure algorithm* but
prove nothing about the *seed-priority sort* as wired.

**Fix:** Add at least one test using the route's real shape, e.g.:

```ts
function realCard(id: string, daysOverdue = 0): SeqCard {
  const nr = new Date(NOW.getTime() - daysOverdue * 86_400_000)
  return { id, review: { nextReview: nr } } as unknown as SeqCard // current shape
}
// assert selectSessionCards picks the most-overdue cards first
```

Once CR-01 is fixed, this test should pass; today it would fail, exposing the bug.

### WR-02: Seed sort treats `null`/missing `nextReview` as epoch 0 (most-urgent), not least

**File:** `lib/sequence.ts:166-168`

**Issue:**
`const nrA = a.nextReview ? (...) : 0`. A card with no due date sorts to timestamp `0`
(1970), i.e. **most** urgent — it seeds first and pulls its prerequisite closure
ahead of genuinely-overdue cards. Combined with CR-01 (where *every* card currently
resolves to `0`), this is academic today, but after CR-01 is fixed any card with a
genuinely null `nextReview` would be wrongly prioritized as maximally overdue. The
route's `where` clause currently requires a matching `review`, so nulls shouldn't
reach here in the `due`/`ahead` paths — but the pure function makes no such guarantee
and is documented as reusable.

**Fix:** Decide the intended semantics explicitly. If "no due date" should sort last
(least urgent), use `Number.POSITIVE_INFINITY` as the fallback:

```ts
const nrA = a.nextReview ? toMs(a.nextReview) : Number.POSITIVE_INFINITY
```

Document the chosen convention in the docstring (it currently says
"null/undefined → 0, i.e. most urgent" — which is a footgun, not a feature).

### WR-03: `take: 1000` silently truncates the pool, breaking downward-closure for cards beyond the cap

**File:** `app/api/cards/due/route.ts:55`

**Issue:**
The pool is capped at 1000 cards ordered by `review.nextReview asc`. If a learner has
>1000 due cards, prerequisite edges to cards ranked 1001+ are dropped from the `edges`
query (it filters `prerequisiteId: { in: ids }` where `ids` is only the first 1000).
A selected dependent could then have a real prerequisite that exists in the DB but was
truncated out of the pool — violating the "never quizzed on a word before its building
blocks" core promise precisely in the heavy-backlog case the cap is meant to protect.
The truncation is silent (no log, no `remaining` signal to the client).

**Fix:** This is acceptable as a v1 safety bound, but make the failure mode explicit:
(a) order the pool so prerequisites are favorably included (e.g. also pull in by
dependency), or (b) at minimum document that closure is only guaranteed within the
1000-card window and log/telemetry when the cap is hit. Given the Vercel 60s limit,
a defensible short-term fix is a comment + a `console.warn` when `cards.length === 1000`
so the truncation is observable.

### WR-04: `poolById` map is built but `inPool` set duplicates its membership role

**File:** `lib/sequence.ts:150-151`, `lib/sequence.ts:158`, `lib/sequence.ts:190`

**Issue:** Minor robustness/consistency point bordering correctness: the adjacency
build uses `inPool.has(...)` (line 158) while `addClosure` resolves prereqs via
`poolById.get(pId)` (line 190). The two structures are derived from the same `pool`
so they stay consistent, but `inPool` is redundant — `poolById.has(id)` answers the
same question. Carrying two parallel membership structures invites drift if one is
later filtered differently. Not a live bug.

**Fix:** Drop `inPool` and use `poolById.has(e.cardId) && poolById.has(e.prerequisiteId)`
in the adjacency filter. Single source of truth for "is this id in the pool".

## Info

### IN-01: `void now` parameter is dead — `now` is accepted but never used by `selectSessionCards`

**File:** `lib/sequence.ts:139`, `lib/sequence.ts:144-147`

**Issue:** `selectSessionCards` takes `now` purely "for purity parity" and discards it
via `void now`. This is a code smell: a parameter that exists only to be ignored. It
also masks the CR-01 problem — a reader assumes `now` drives urgency-aware selection,
but selection is now/`nextReview`-independent. Once CR-01 is fixed you may legitimately
want `now` (e.g. to compute days-overdue for seed ranking rather than raw timestamp).

**Fix:** Either remove the parameter (and the misleading docstring lines about it) or
actually use it. If kept for signature symmetry with `sequenceCards`, change the
comment to state plainly that selection is independent of `now`.

### IN-02: Duplicated `nextReview` timestamp-parsing expression across three sites

**File:** `lib/sequence.ts:127-128`, `lib/sequence.ts:167-168`

**Issue:** The ternary `typeof nr === 'string' ? new Date(nr).getTime() : nr.getTime()`
is copy-pasted three times. Duplication of the date-coercion logic is the kind of thing
that let CR-01 diverge silently — a single helper would have made the field-shape
assumption explicit and fixable in one place.

**Fix:** Extract a module-private `function toMs(nr: Date | string | null | undefined): number`
and use it everywhere (and decide the null-fallback per WR-02).

### IN-03: Route comment claims `sequenceCards` makes whole-pool edges "safe" — true, but selection edges are not whole-pool-safe

**File:** `app/api/cards/due/route.ts:62-64`

**Issue:** The comment justifies passing the full edge list because "sequenceCards
ignores out-of-session edges." That is correct for `sequenceCards`, but the same edge
list is also passed to `selectSessionCards`, whose correctness depends on the pool
being downward-closeable within the fetched window — which `take: 1000` can violate
(WR-03). The comment understates the constraint.

**Fix:** Expand the comment to note that closure completeness is bounded by the
1000-card fetch window, cross-referencing the cap rationale.

---

_Reviewed: 2026-06-25T23:30:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
