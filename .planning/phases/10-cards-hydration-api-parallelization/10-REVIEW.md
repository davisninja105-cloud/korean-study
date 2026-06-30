---
phase: 10-cards-hydration-api-parallelization
reviewed: 2026-06-30T01:12:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - components/CardsClient.tsx
  - app/cards/page.tsx
  - app/api/cards/due/route.ts
findings:
  critical: 1
  warning: 3
  info: 1
  total: 5
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-06-30T01:12:00Z
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Three files reviewed: the RSC cards page (`app/cards/page.tsx`) that hydrates the client in one
`Promise.all` call, the client component (`components/CardsClient.tsx`) that owns all interactive
card list logic, and the due-cards API route (`app/api/cards/due/route.ts`) which introduces
`Promise.allSettled` for parallel pool + known-lemmas fetches.

The architecture is sound. The parallelization in both the page and the API route is correct.
The `Promise.allSettled` degradation path for `knownLemmas` is well-designed. One critical
deviation from the project's own `CLAUDE.md` convention is present in the adjacent
`app/api/cards/[id]/route.ts` (called by client-side save/delete), and two warning-level issues
exist in the client component's error handling.

---

## Critical Issues

### CR-01: `PUT /api/cards/[id]` and `DELETE /api/cards/[id]` have no `try/catch`

**File:** `app/api/cards/[id]/route.ts:7` (PUT), `app/api/cards/[id]/route.ts:55` (DELETE)

**Issue:** Both handlers contain zero error handling. CLAUDE.md explicitly mandates: "All route
handlers wrap their body in `try { … } catch (e) { return NextResponse.json({ error: … }, { status: 500 }) }`."
Concrete failure paths in the PUT handler that are currently unhandled:

- `req.json()` throws `SyntaxError` on a malformed body — Next.js returns a raw 500 with no
  JSON body, so `CardEditor.handleSave`'s `if (!res.ok) throw new Error(...)` fires but the
  caller has no error to display.
- `prisma.card.update({ where: { id } })` throws `PrismaClientKnownRequestError` (code P2025)
  when the card was deleted by another tab between the client click and the request arriving.
- `findUniqueOrThrow` at line 47 throws `P2025` in the same race.
- `prisma.$transaction([deleteMany, ...creates])` throws on constraint violation.

For DELETE, `prisma.card.delete()` throws P2025 if the card is already gone (e.g., double-tap
after the confirm dialog — the confirm fires once per click; two rapid taps can get through
because `handleDelete` in `CardsClient` has no in-flight guard, covered separately in WR-02).

**Fix:**

```typescript
// PUT handler
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const data = await req.json()
    // ... existing body ...
    return NextResponse.json(card)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// DELETE handler
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await prisma.card.delete({ where: { id } })
    return NextResponse.json({ deleted: true })
  } catch (e) {
    return NextResponse.json({ error: 'Delete failed' }, { status: 500 })
  }
}
```

---

## Warnings

### WR-01: `handleDelete` in `CardsClient` has no `try/catch` — network errors are unhandled

**File:** `components/CardsClient.tsx:91`

**Issue:** `handleDelete` is an `async` function that calls `fetch(...)` without a `try/catch`.
A network failure (e.g. offline, server restart) throws an unhandled rejection that propagates
to the browser console with no user feedback. The `handleAdd` function at line 113 correctly
wraps its fetch in `try/catch` — `handleDelete` should match that pattern.

**Fix:**
```typescript
const handleDelete = async (id: string) => {
  if (!confirm('Delete this card?')) return
  try {
    const res = await fetch(`/api/cards/${id}`, { method: 'DELETE' })
    if (!res.ok) {
      console.error('Delete failed:', res.status)
      return
    }
    setCards((prev) => prev.filter((c) => c.id !== id))
    if (editingId === id) setEditingId(null)
  } catch (err) {
    console.error('Delete failed (network):', err)
  }
}
```

### WR-02: `handleDelete` has no in-flight guard — rapid double-tap can fire two DELETE requests

**File:** `components/CardsClient.tsx:91`

**Issue:** `handleAdd` uses an `adding` state flag to disable the button during the request
(line 486: `disabled={adding || !newCard.front || !newCard.back}`). `handleDelete` has no
equivalent guard. The `confirm()` dialog appears synchronously before the request, so a user
who quickly taps Delete again (before the server responds and the card is removed from local
state) bypasses the guard and sends a second `DELETE /api/cards/:id`. The second request hits
a card that is already gone — the server throws P2025 (currently unhandled, see CR-01) —
and the uncaught rejection surfaces in the browser console.

**Fix:** Track a deleting-in-flight set:

```typescript
const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())

const handleDelete = async (id: string) => {
  if (deletingIds.has(id)) return
  if (!confirm('Delete this card?')) return
  setDeletingIds((prev) => new Set(prev).add(id))
  try {
    const res = await fetch(`/api/cards/${id}`, { method: 'DELETE' })
    if (!res.ok) { console.error('Delete failed:', res.status); return }
    setCards((prev) => prev.filter((c) => c.id !== id))
    if (editingId === id) setEditingId(null)
  } catch (err) {
    console.error('Delete failed (network):', err)
  } finally {
    setDeletingIds((prev) => { const s = new Set(prev); s.delete(id); return s })
  }
}
```

### WR-03: `parseInt` silently truncates float and mixed-value query params in `lessonFrom`/`lessonTo`

**File:** `app/api/cards/due/route.ts:17-24`

**Issue:** `parseInt('1.5', 10)` returns `1` and `Number.isInteger(1)` is `true`, so
`?lessonFrom=1.5` passes validation and is silently treated as `lessonFrom=1`. Likewise,
`?lessonFrom=1abc` parses to `1` and passes. The validation at line 21 is intended to reject
non-integers, but `parseInt` already strips the non-integer part before the check runs — so
the check only catches `NaN` (empty string) and negative values. A caller who passes `1.5`
expecting a 400 gets a 200 with truncated behaviour.

While no known caller sends float values today, the validation contract is misleading and
could mask bugs in future callers.

**Fix:** Validate the raw string before parsing:

```typescript
const INTEGER_RE = /^[1-9]\d*$/

const lessonFrom = fromParam !== null
  ? (INTEGER_RE.test(fromParam) ? parseInt(fromParam, 10) : NaN)
  : null
const lessonTo = toParam !== null
  ? (INTEGER_RE.test(toParam) ? parseInt(toParam, 10) : NaN)
  : null

if (
  (lessonFrom !== null && (isNaN(lessonFrom) || lessonFrom < 1)) ||
  (lessonTo   !== null && (isNaN(lessonTo)   || lessonTo   < 1)) ||
  (lessonFrom !== null && lessonTo !== null && lessonFrom > lessonTo)
) {
  return NextResponse.json({ error: 'invalid lesson range' }, { status: 400 })
}
```

---

## Info

### IN-01: Duplicate delete affordance on each card row

**File:** `components/CardsClient.tsx:256-295`

**Issue:** Each card row is wrapped in `SwipeRow` (which reveals a red Delete action on
swipe, line 258) AND also contains an explicit visible "Delete" button in the card header
(line 290-293). Both call `handleDelete(card.id)` and both show the `confirm()` dialog.
This results in two paths to delete the same card in the same visual context, which is
redundant and may cause user confusion (two different gestures, same result).

**Fix:** Consider removing the explicit Delete button from the card header and relying solely
on the swipe gesture for deletion, keeping the `Edit` button as the primary visible action.
Or remove the swipe reveal and keep only the explicit button. Whichever is chosen, one path
is sufficient.

---

_Reviewed: 2026-06-30T01:12:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
