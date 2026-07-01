# Phase 11: Study Page Hydration & Interaction Polish - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-30
**Phase:** 11-study-page-hydration-interaction-polish
**Areas discussed:** Interaction Jitter (UX-01), Lesson Filter Re-fetch, Initial Load Strategy

---

## Interaction Jitter (UX-01)

| Option | Description | Selected |
|--------|-------------|----------|
| Card flip feels laggy | 3D flip animation stutters | |
| Grade buttons are slow to respond | After tapping grade, pause before next card | ✓ |
| Audio button lags | /api/tts fetch delay | |
| No jitter observed — UX-01 just needs verification | Session already feels instant | |

**User's choice:** Grade buttons are slow to respond.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Optimistic — next card immediately | Compute FSRS client-side, advance queue instantly, POST in background | ✓ |
| Keep await but show a spinner | Brief loading state on grade buttons | |

**User's choice:** Optimistic — next card immediately.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Silent failure — personal app, very low risk | Fire-and-forget POST; failed saves are silent | ✓ |
| Toast on failure | Brief non-blocking toast if background save fails | |

**User's choice:** Silent failure.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Grade fix is enough — audio loading state is fine | Speaker icon idle→loading→playing transition is acceptable | ✓ |
| Also want audio prefetch | Prefetch TTS while card is showing | |

**User's choice:** Grade fix is enough — audio loading state is fine.

---

## Lesson Filter Re-fetch

| Option | Description | Selected |
|--------|-------------|----------|
| Same as today — brief loading state is fine | Filter change goes through phase='loading' briefly | |
| Keep mode-select visible with a spinner or dim overlay | Mode-select stays on screen; subtle loading indicator overlays | ✓ |
| Optimistic — show previous count grayed while fetching | Old count shown grayed out until new one arrives | |

**User's choice:** Keep mode-select visible with a spinner or dim overlay.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Spinner inside the due-count area | Large due-count number replaced by small spinner | ✓ |
| Dim overlay on the whole mode-select card | Semi-transparent overlay covers entire panel with centered spinner | |

**User's choice:** Spinner inside the due-count area.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Full span (all lessons) — same as today | Server fetches full span as default | ✓ |
| User decides — you decide | Claude picks most reasonable default | |

**User's choice:** Full span (all lessons) — same as today.

---

## Initial Load Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Full card set + lessons | RSC runs same logic as /api/cards/due; mode-select and Start both instant | ✓ |
| Due count + lessons only | Lightweight count query; Start still triggers a fetch | |

**User's choice:** Full card set + lessons.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Extract to lib/study-cards.ts | Shared server-only function called by RSC and API route | ✓ |
| Duplicate the logic in the RSC page | Copy query logic into app/study/page.tsx | |
| You decide | Claude picks best structure | |

**User's choice:** Extract to lib/study-cards.ts.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Cards are pre-loaded; tapping Start begins immediately | StudyClient starts in 'select-mode'; no fetch on session start | ✓ |
| Cards are pre-loaded but still fetch on Start | Re-fetch for freshness | |

**User's choice:** Cards are pre-loaded; tapping Start begins immediately.

---

## Claude's Discretion

- Structure of `StudyClient` component: follow `CardsClient` pattern from Phase 10
- Spinner implementation for filter re-fetch: Lucide `Loader2` with `animate-spin` or equivalent
- DTO location in `lib/dto.ts` was not selected for discussion (user skipped it) — defaulting to Phase 10 recommendation: extract to `lib/dto.ts` since a second RSC page now needs the types

## Deferred Ideas

- **Audio prefetch** — TTS prefetch while card is showing; noted but not wanted in this phase
- **Stale card freshness** — Re-fetch when page has been open for a while; out of scope, accepted trade-off
