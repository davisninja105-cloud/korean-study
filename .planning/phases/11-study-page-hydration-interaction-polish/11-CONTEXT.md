# Phase 11: Study Page Hydration & Interaction Polish - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate the blank loading phase on the study page's first load (RSC-02), and make grade-button grading feel instant during an active study session (UX-01). No new capabilities — this is a performance and interaction polish phase within the existing study flow.

**Requirements (from ROADMAP.md):**
- **RSC-02**: Study page receives initial card set from the server — no blank loading phase on first load
- **UX-01**: Card flip, grade buttons, and audio button during an active study session have no re-fetch or recompute jitter

**Success criteria (from ROADMAP.md):**
1. On first load, the study page lands directly on the mode-select screen with the correct due-card count — no blank "loading" phase
2. The lesson-range filter still re-fetches and re-sequences cards correctly after the initial server render
3. During an active session, flipping a card, tapping a grade button, and pressing the audio button respond immediately with no visible jitter or re-fetch
4. The session-complete screen and the "study ahead" flow continue to work end-to-end

</domain>

<decisions>
## Implementation Decisions

### RSC Architecture — Initial Load (RSC-02)

- **D-01: Full card set fetched server-side.** The RSC page fetches the full initial card set (not just due count) plus lessons — same data as `/api/cards/due` today. Mode-select appears instantly with the correct due count, and tapping Start is also instant (cards already loaded, no further fetch needed).

- **D-02: Shared logic extracted to `lib/study-cards.ts`.** The pool-fetch + edge-fetch + knownLemmas + `selectSessionCards` + `sequenceCards` + annotation pipeline currently in `app/api/cards/due/route.ts` must be extracted into a server-only function in `lib/study-cards.ts`. Both the RSC page AND the API route call this shared function. This is the clean DRY approach — no duplication, no maintenance burden.

- **D-03: Default scope is full span (all lessons).** Server fetches cards across the full lesson span on first load. Consistent with current behavior.

- **D-04: `StudyClient` starts in `'select-mode'` when `initialCards` is provided.** The phase state machine initializes as `'select-mode'` (not `'loading'`) when `initialCards` is non-empty. Tapping a mode immediately enters `'studying'` — no re-fetch on session start.

- **D-05: DTO types extracted to `lib/dto.ts`.** Phase 10 kept DTO types inline in `app/cards/page.tsx`. Now that the study page is a second RSC consumer, extract shared DTO types (`CardDTO`, `SentenceDTO`, `ReviewDTO`, `LessonDTO`) to `lib/dto.ts`. Both `app/cards/page.tsx` and `app/study/page.tsx` import from there.

### Lesson Filter Re-fetch Behavior

- **D-06: Mode-select stays visible with a spinner in the due-count area during filter re-fetch.** When the user changes the lesson range filter, the mode-select screen stays visible (does not go back to `phase='loading'` / blank). The large due-count number is replaced by a small spinner while the new card count/set loads. On resolve, the count updates in place.

- **D-07: Full span is the default initial lesson range.** No per-user preference needed — first/last lesson orderIndex from server defines the initial range.

### Interaction Polish (UX-01) — Optimistic Grade

- **D-08: Optimistic grade advance — queue moves immediately, API saves in background.** The root cause of grade-button jitter is `await fetch('/api/review')` blocking `setQueue`. Fix: call `reviewCard(card.review, rating)` from `lib/fsrs.ts` client-side immediately, compute `requeue` decision locally, advance the queue (`setQueue`) right away, then fire `POST /api/review` in the background (no await).

- **D-09: Silent failure for background save.** If the background `POST /api/review` fails, the session continues uninterrupted. No toast or error surface. Single-user personal app — very low risk, one review not recorded is acceptable.

- **D-10: Undo remains functional.** Undo snapshot is captured before the optimistic queue advance (same as today). Undo restores the pre-grade visual state. If the background save had already succeeded, the DB and UI will be back in sync on undo.

- **D-11: Audio loading state is acceptable — no prefetch.** The speaker icon's idle→loading→playing transition is fine as-is. UX-01 is fully covered by the grade-button optimistic fix. No audio prefetch work in this phase.

- **D-12: Card flip is already instant — no work needed.** The 3D flip is pure CSS animation (no fetch). Only grade buttons required a fix.

### Claude's Discretion

- Structure of `StudyClient` component (name, file location): follow the `CardsClient` pattern from Phase 10 — `'use client'`, accepts `initialCards` / `initialLessons` props, all interactivity inside.
- Spinner implementation for the filter re-fetch: use a simple inline SVG or Tailwind `animate-spin` on a Lucide icon; match the design system.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Requirements
- `.planning/REQUIREMENTS.md` — RSC-02, UX-01 requirement text; RSC-05 DTO contract (already enforced)
- `.planning/ROADMAP.md` §Phase 11 — Goal, success criteria, dependencies

### Prior Phase Patterns (MANDATORY — Phase 11 reuses these)
- `.planning/phases/10-cards-hydration-api-parallelization/10-RESEARCH.md` — Complete RSC + client shell + DTO pattern documentation; Promise.allSettled parallelization pattern; DTO type definitions; pitfalls (Date serialization, useEffect double-fetch, Promise.allSettled checks)
- `.planning/phases/10-cards-hydration-api-parallelization/10-01-PLAN.md` — Concrete plan for RSC conversion (CardsPage → CardsClient); DTO extraction steps; the exact structural pattern to replicate for StudyPage

### Key Source Files
- `app/study/page.tsx` — Current `'use client'` study page (436 lines); full phase state machine; lesson + card fetch logic; `loadDue`, `startAhead`, `handleModeSelect`, `handleComplete`
- `app/api/cards/due/route.ts` — The route whose logic gets extracted to `lib/study-cards.ts`; pool query + edge query + knownLemmas + Promise.allSettled + selectSessionCards + sequenceCards + annotation
- `lib/fsrs.ts` — `reviewCard(review, rating)` — the function to call client-side for optimistic grade compute; `previewIntervalLabels` for grade bar; `Rating`, `State` exports
- `lib/sequence.ts` — `selectSessionCards`, `sequenceCards` — called by the extracted `lib/study-cards.ts`
- `lib/known-words.ts` — `countUnknownWords` — called by the extracted `lib/study-cards.ts` for sentence annotation
- `components/StudySession.tsx` — `submitReview` function (grade handler, lines ~397–465) — the `await fetch('/api/review')` that blocks queue advance is the jitter root cause
- `app/cards/page.tsx` — RSC reference implementation from Phase 10; DTO types to be moved to `lib/dto.ts`

### Project Conventions
- `CLAUDE.md` — All project conventions: `'use client'` must be first line; DTO pattern (no raw Prisma Dates across boundary); `interface Props` naming; semantic tokens only; dark mode mirror rule; lint rules

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/fsrs.ts:reviewCard()` — Pure FSRS computation; takes current review state + rating, returns full next-state object including `nextReview: Date`. Used by `/api/review/route.ts` server-side; for D-08, called client-side in `submitReview` to enable optimistic advance.
- `lib/dto.ts` (to be created) — Extract `CardDTO`, `SentenceDTO`, `ReviewDTO`, `LessonDTO`, `LessonRefDTO` from `app/cards/page.tsx`. Both `app/cards/page.tsx` and the new `app/study/page.tsx` import from here.
- `components/ModeSelector.tsx`, `components/LessonRangeFilter.tsx`, `components/Sheet.tsx` — Already `'use client'`; stay as-is in `StudyClient`.
- `lib/habit.ts:nextHabitDayStart()` — Still needed in `StudyClient` for the re-queue boundary check (now computed locally via `reviewCard`).

### Established Patterns
- **RSC + client shell + DTO** (Phase 10): `app/study/page.tsx` becomes an `async` server component; fetches via `lib/study-cards.ts`; serializes to DTO; renders `<StudyClient initialCards={...} initialLessons={...} />`. `StudyClient` starts in `'select-mode'` when `initialCards.length > 0`.
- **Promise.allSettled for parallel queries** (Phase 10): Pool and knownLemmas queries are already parallelized in `/api/cards/due`. The extracted `lib/study-cards.ts` preserves this structure.
- **Optimistic UI via client-side FSRS** (new in Phase 11): `submitReview` calls `reviewCard()` locally, advances queue, fires background POST. Pattern: compute → update local state → `.catch(() => {})` fire-and-forget.
- **Filter re-fetch spinner**: Introduce a `isFilterLoading: boolean` state in `StudyClient`. When `true` and `phase === 'select-mode'`, replace the due-count number with `animate-spin` indicator. On `loadDue` resolve, set back to `false`.

### Integration Points
- `lib/study-cards.ts` → called by `app/study/page.tsx` (RSC, server-side) AND `app/api/cards/due/route.ts` (still serves client-side re-fetches for lesson filter changes and study-ahead flow)
- `StudyClient` → receives `initialCards: CardDTO[]` and `initialLessons: LessonDTO[]` from the RSC page; all existing interactivity (mode select, filter sheet, session, complete screen, undo, study-ahead) stays inside `StudyClient`
- `lib/dto.ts` → imported by `app/cards/page.tsx`, `app/study/page.tsx`, `components/CardsClient.tsx` (if it imports types), and `app/api/cards/due/route.ts` (for consistent type shapes)

</code_context>

<specifics>
## Specific Ideas

- **Filter re-fetch spinner placement:** In the mode-select screen, the large due-count number (currently `<span className="text-5xl font-bold ...">`) should be replaced by a small centered spinner when `isFilterLoading` is true. Use `<Loader2 className="animate-spin" />` from lucide-react (already a project dependency) or an inline `border-t-2 animate-spin rounded-full` div — consistent with existing loading patterns.

- **`lib/study-cards.ts` signature concept:** The shared function should accept the same query parameters as the current route handler (`lessonFrom?`, `lessonTo?`, `scope: 'due' | 'ahead'`, `sessionSize`) and return `CardDTO[]` (already serialized). The RSC page calls it with the default full-span params; the API route calls it with user-provided params and streams the response.

- **`submitReview` refactor sketch:**
  ```
  const submitReview = (rating: number) => {  // no longer async
    const current = queue[0]
    if (!current) return
    haptic(...)
    // 1. Compute FSRS result locally
    const updated = current.kind === 'real' ? reviewCard(current.card.review, rating) : null
    const requeue = updated ? new Date(updated.nextReview) < nextHabitDayStart(...) : false
    const updatedItem = updated ? { ...current, card: { ...current.card, review: updated } } : current
    // 2. Advance queue immediately
    const nextQueue = requeue ? [...] : rest
    setQueue(nextQueue)
    // 3. Fire API in background (no await)
    if (current.kind === 'real') {
      fetch('/api/review', { method: 'POST', ... }).catch(() => {})
    }
  }
  ```

</specifics>

<deferred>
## Deferred Ideas

- **Audio prefetch** — Prefetching TTS audio for the current card while it's being shown. Not needed; audio loading state is acceptable. Consider for a future polish phase if users request it.
- **Stale card freshness on session start** — Re-fetching cards when the page has been open for a while (cards may become due while idle). Out of scope for Phase 11; accepted trade-off of the pre-loaded approach.

</deferred>

---

*Phase: 11-study-page-hydration-interaction-polish*
*Context gathered: 2026-06-30*
