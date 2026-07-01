# Phase 1: Foundation-Aware Session Selection - Pattern Map

**Mapped:** 2026-06-25
**Files analyzed:** 3
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `lib/sequence.ts` (add `selectSessionCards`) | utility | transform | `sequenceCards` in same file (lines 43–107) | exact — same types, same DFS cycle-guard pattern |
| `app/api/cards/due/route.ts` (modify selection block) | API route | request-response | same file's current selection block (lines 42–75) | exact — rewire of existing code |
| `tests/sequence.test.ts` (add cases) | test | — | `sequenceCards` describe block in same file (lines 12–61) | exact — same vitest fixture style |

---

## Pattern Assignments

### `lib/sequence.ts` — add `selectSessionCards`

**Analog:** `sequenceCards` in `lib/sequence.ts` (lines 43–107)

**Function signature to mirror** (lines 43–47):
```typescript
export function sequenceCards<T extends SeqCard>(
  cards: T[],
  edges: SeqEdge[],
  now: Date = new Date()
): T[]
```
Mirror the generic `<T extends SeqCard>` constraint and the `now: Date = new Date()` default. The new function:
```typescript
export function selectSessionCards<T extends SeqCard>(
  pool: T[],
  edges: SeqEdge[],
  sessionSize: number,
  now: Date = new Date()
): T[]
```

**Early-exit guard** (mirror of lines 48–49):
```typescript
  if (cards.length === 0) return cards
```
For `selectSessionCards`:
```typescript
  if (pool.length <= sessionSize) return pool
```

**`inSession` set + `prereqs` adjacency map** (lines 54–63) — copy this pattern verbatim, scoping to pool:
```typescript
  const inSession = new Set(cards.map((c) => c.id))

  const prereqs = new Map<string, Set<string>>()
  for (const c of cards) prereqs.set(c.id, new Set())
  for (const e of edges) {
    if (inSession.has(e.cardId) && inSession.has(e.prerequisiteId)) {
      prereqs.get(e.cardId)!.add(e.prerequisiteId)
    }
  }
```
In `selectSessionCards` rename `cards` → `pool` and `inSession` → `inPool`:
```typescript
  const inPool = new Set(pool.map((c) => c.id))
  const poolById = new Map(pool.map((c) => [c.id, c]))

  const prereqs = new Map<string, Set<string>>()
  for (const c of pool) prereqs.set(c.id, new Set())
  for (const e of edges) {
    if (inPool.has(e.cardId) && inPool.has(e.prerequisiteId)) {
      prereqs.get(e.cardId)!.add(e.prerequisiteId)
    }
  }
```

**Cycle-guard DFS pattern** (lines 67–81) — the `visiting` set + recursive depth helper:
```typescript
  const depthMemo = new Map<string, number>()
  const visiting  = new Set<string>()

  function depth(id: string): number {
    if (depthMemo.has(id)) return depthMemo.get(id)!
    if (visiting.has(id)) return 0   // cycle: treat as no contribution
    visiting.add(id)
    let d = 0
    for (const pId of prereqs.get(id) ?? []) {
      d = Math.max(d, depth(pId) + 1)
    }
    visiting.delete(id)
    depthMemo.set(id, d)
    return d
  }
```
For `selectSessionCards`, replace the `depth` DFS with an `addClosure` DFS using the same `visiting` guard and a `result`/`added` accumulator:
```typescript
  const result: T[] = []
  const added   = new Set<string>()
  const visiting = new Set<string>()

  function addClosure(card: T): void {
    if (added.has(card.id) || visiting.has(card.id)) return
    visiting.add(card.id)
    for (const pId of prereqs.get(card.id) ?? []) {
      const prereq = poolById.get(pId)
      if (prereq) addClosure(prereq)
    }
    visiting.delete(card.id)
    if (!added.has(card.id)) {
      added.add(card.id)
      result.push(card)
    }
  }
```

**Seed sort** — pure, purity-rule-safe (no `Date.now()` in comparator; `now` is the parameter). Mirror the tiebreak order used in `sequenceCards` lines 97–105 but applied to seed selection:
```typescript
  const seeds = [...pool].sort((a, b) => {
    // Most-due first: nextReview ascending
    const nrA = a.nextReview ? (typeof a.nextReview === 'string' ? new Date(a.nextReview).getTime() : a.nextReview.getTime()) : 0
    const nrB = b.nextReview ? (typeof b.nextReview === 'string' ? new Date(b.nextReview).getTime() : b.nextReview.getTime()) : 0
    if (nrA !== nrB) return nrA - nrB
    // Tiebreak: lesson orderIndex ascending
    const loA = a.lesson?.orderIndex ?? 0
    const loB = b.lesson?.orderIndex ?? 0
    if (loA !== loB) return loA - loB
    // Tiebreak: id lexicographic — stable, purity-safe
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })
```

**Size cap loop + final slice** (D-03):
```typescript
  for (const seed of seeds) {
    if (result.length >= sessionSize) break
    addClosure(seed)
  }
  return result.slice(0, sessionSize)
```

**Purity rule** — file-level comment must mirror the existing header comment style (lines 1–27). Add a block comment above `selectSessionCards` explaining the contract, the downward-closure guarantee, the overshoot bound, and `now` as a parameter (same pattern as the existing module-level JSDoc).

---

### `app/api/cards/due/route.ts` — rewire selection block

**Analog:** same file, lines 1–78

**Import line to update** (line 4):
```typescript
import { sequenceCards } from '@/lib/sequence'
```
Change to:
```typescript
import { sequenceCards, selectSessionCards } from '@/lib/sequence'
```

**`findMany` block to modify** (lines 42–56) — change only `take`:
```typescript
    // Before:
    take: sessionSize,

    // After (safety cap; selection is now done in selectSessionCards):
    take: 1000,
```
All other fields (`where`, `include`, `orderBy`) stay identical.

**Edge query to widen** (lines 66–73) — `ids` now comes from the whole pool, not a capped set. No query change needed beyond the variable already covering all fetched cards. However, remove the comment "restricted to the in-session card set" since the pool is now wider — update to reflect whole-pool semantics:
```typescript
  // Fetch prerequisite edges across the whole pool.
  // sequenceCards ignores out-of-session edges, so passing the full pool edge
  // list to both selectSessionCards and sequenceCards is safe.
  const ids = cards.map((c) => c.id)
  const edges = await prisma.cardDependency.findMany({
    where: {
      cardId:         { in: ids },
      prerequisiteId: { in: ids },
    },
    select: { cardId: true, prerequisiteId: true },
  })
```

**Selection + sequencing lines to replace** (line 75):
```typescript
  // Before:
  const ordered = sequenceCards(cards, edges, now)

  // After:
  const chosen  = selectSessionCards(cards, edges, sessionSize, now)
  const ordered = sequenceCards(chosen, edges, now)
```

**Lines that stay unchanged:** validation block (lines 18–28), `lessonClause` build (lines 32–35), `getSessionSize()` call (line 37), empty-result early return (lines 58–60), `NextResponse.json(ordered)` (line 77).

---

### `tests/sequence.test.ts` — add `selectSessionCards` cases

**Analog:** `sequenceCards` describe block in same file (lines 1–61)

**Import line to extend** (line 2):
```typescript
import { sequenceCards, SeqCard, SeqEdge } from '../lib/sequence'
```
Change to:
```typescript
import { sequenceCards, selectSessionCards, SeqCard, SeqEdge } from '../lib/sequence'
```

**`card()` fixture helper** (lines 4–8) — reuse as-is for `selectSessionCards` tests:
```typescript
function card(id: string, daysOverdue = 0): SeqCard {
  const now = new Date('2026-06-23T12:00:00Z')
  const nextReview = new Date(now.getTime() - daysOverdue * 86_400_000)
  return { id, nextReview }
}

const NOW = new Date('2026-06-23T12:00:00Z')
```

**Test describe block to add** — mirror the existing `describe('sequenceCards', ...)` style:
```typescript
describe('selectSessionCards', () => {
  it('returns all cards when pool <= sessionSize', () => { … })
  it('pulls a less-due prerequisite into the session with its dependent', () => { … })
  it('output is downward-closed and capped at sessionSize', () => { … })
  it('handles 2-node cycle without infinite loop or duplicate cards', () => { … })
  it('overshoot is bounded by at most one prerequisite closure', () => { … })
})
```

**Cycle test pattern** (mirror of lines 42–52):
```typescript
  it('handles 2-node cycle without infinite loop or duplicate cards', () => {
    const a = card('a')
    const b = card('b')
    const edges: SeqEdge[] = [
      { cardId: 'a', prerequisiteId: 'b' },
      { cardId: 'b', prerequisiteId: 'a' },
    ]
    const result = selectSessionCards([a, b], edges, 10, NOW)
    expect(result).toHaveLength(2)
    // no duplicates
    const ids = result.map((c) => c.id)
    expect(new Set(ids).size).toBe(2)
  })
```

**Edge-ignoring test pattern** (mirror of lines 54–60) for downward-closure + cap:
```typescript
  it('output is downward-closed and capped at sessionSize', () => {
    // Build a pool of 5 cards where card 'e' depends on 'a','b','c','d'
    const pool = ['a','b','c','d','e'].map((id) => card(id, 0))
    const edges: SeqEdge[] = [
      { cardId: 'e', prerequisiteId: 'a' },
      { cardId: 'e', prerequisiteId: 'b' },
      { cardId: 'e', prerequisiteId: 'c' },
      { cardId: 'e', prerequisiteId: 'd' },
    ]
    const result = selectSessionCards(pool, edges, 3, NOW)
    expect(result.length).toBeLessThanOrEqual(4) // at most sessionSize + one closure overshoot
    // every prerequisite of a returned card is also returned
    const resultIds = new Set(result.map((c) => c.id))
    for (const c of result) {
      for (const e of edges.filter((e) => e.cardId === c.id)) {
        if (resultIds.has(e.cardId)) {
          expect(resultIds.has(e.prerequisiteId)).toBe(true)
        }
      }
    }
  })
```

---

## Shared Patterns

### Purity constraint — no impure calls in function body
**Source:** `lib/sequence.ts` module-level comment (lines 24–27) and `CLAUDE.md` purity rules
**Apply to:** `selectSessionCards` body and its `addClosure` inner function
- `now` must be a parameter with `= new Date()` default — never call `new Date()` inside the body.
- No `Date.now()`, no `Math.random()` anywhere in the function or its closures.
- The seed sort comparator reads `now.getTime()` (captured from parameter at call site, not in the comparator itself).

### `@/` import alias
**Source:** `app/api/cards/due/route.ts` line 4, CLAUDE.md conventions
**Apply to:** any new imports in `lib/sequence.ts` (none needed) and the updated route import line.
```typescript
import { sequenceCards, selectSessionCards } from '@/lib/sequence'
```

### Non-null assertion `!` on Map lookups after explicit set
**Source:** `lib/sequence.ts` line 62
```typescript
prereqs.get(e.cardId)!.add(e.prerequisiteId)
```
Use `!` only when the `set()` call immediately precedes and guarantees presence. The `poolById.get(pId)` lookup returns `T | undefined` — use an `if (prereq)` guard instead (safer; see `addClosure` pattern above).

---

## No Analog Found

None. All three files have exact same-file analogs.

---

## Metadata

**Analog search scope:** `lib/sequence.ts`, `app/api/cards/due/route.ts`, `tests/sequence.test.ts`
**Files scanned:** 3
**Pattern extraction date:** 2026-06-25
