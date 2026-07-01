---
phase: 02-maturity-known-word-aware-presentation
plan: 02
subsystem: ui
tags: [react, nextjs, prisma, fsrs, korean, spaced-repetition]

requires:
  - phase: 02-maturity-known-word-aware-presentation/02-01
    provides: countUnknownWords helper used to annotate sentences

provides:
  - Server annotates each sentence with unknownCount (words not yet seen by learner)
  - New cards show bare word when context words unknown; sentence when context words known
  - Least-unknown sentence selected for display; tie-broken by hashStr rotation
  - Blank-safety and matured/multiple-choice behavior unchanged

affects: [study-session, cards-due-api]

tech-stack:
  added: []
  patterns:
    - unknownCount annotation: server-side per-sentence signal, client reads only
    - showBareFront gate: computed after chosenSentence to access unknownCount

key-files:
  created: []
  modified:
    - app/api/cards/due/route.ts
    - components/StudySession.tsx

key-decisions:
  - "Known threshold = FSRS state >= 1 (seen at least once), not >= 2 — so one prior review unlocks in-context presentation"
  - "showBareFront requires unknownCount > 0 on the chosen sentence — if context is readable, new card gets sentence immediately"
  - "No 'Recall the meaning' hint on bare-word front — cleaner presentation"
  - "unknownCount is a session snapshot (computed at GET /api/cards/due time); within-session card state changes do not update it"
  - "Within-session ordering from Phase 1 (foundation-first) handles the within-session case; cross-session unknownCount handles the between-session case"

patterns-established:
  - "Session-snapshot annotation: annotate server response once at request time; client never recomputes"

requirements-completed: [PRES-01, PRES-02, PRES-03, PRES-04, PRES-05, QUAL-03, QUAL-04]

coverage:
  - id: D1
    description: "Server annotates each sentence with unknownCount via a single known-lemma query (state >= 1) per request"
    requirement: PRES-03
    verification:
      - kind: integration
        ref: "grep countUnknownWords app/api/cards/due/route.ts — import and call present; build passes"
        status: pass
    human_judgment: false
  - id: D2
    description: "New card shows bare word when best sentence has unknownCount > 0; shows sentence when unknownCount === 0"
    requirement: PRES-01
    verification:
      - kind: manual_procedural
        ref: "Task 3 walkthrough — developer confirmed in dev session"
        status: pass
    human_judgment: true
    rationale: "Presentation behavior depends on FSRS state of real cards; unit tests cannot replicate the full session context"
  - id: D3
    description: "Least-unknown sentence selected; ties broken by hashStr(id)+reps rotation"
    requirement: PRES-03
    verification:
      - kind: manual_procedural
        ref: "Task 3 walkthrough — sentence selection confirmed readable"
        status: pass
    human_judgment: true
    rationale: "Requires real card corpus with multiple sentences and known/unknown words to verify ranking"
  - id: D4
    description: "Matured cards (state 2/3), multiple-choice, Recall, and fill-blank unchanged — no regressions"
    requirement: PRES-05
    verification:
      - kind: manual_procedural
        ref: "Task 3 walkthrough — regressions confirmed absent"
        status: pass
    human_judgment: true
    rationale: "Regression check requires real study session across multiple modes"

duration: 45min
completed: 2026-06-26
status: complete
---

# Phase 02: Maturity Known-Word-Aware Presentation — Plan 02 Summary

**Server-annotated unknownCount per sentence + client bare-word-first gate that shows sentences when context is already known**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-06-26
- **Tasks:** 3 (2 code + 1 human checkpoint)
- **Files modified:** 2

## Accomplishments

- `app/api/cards/due/route.ts` queries cards with FSRS state ≥ 1 once per request and annotates every returned sentence with `unknownCount` (words the learner hasn't seen yet)
- `components/StudySession.tsx` introduces `showBareFront`: new/learning cards (state 0/1) show the bare Korean word when their best sentence still contains unknown words; once context is learnable, the sentence is shown directly — even on the first encounter
- Least-unknown sentence selection (`chosenIdx`) replaces the old rotation — picks the sentence with fewest unknown words, ties broken by `hashStr(id) + reps` for variety
- Blank-safety override, matured cards, multiple-choice, Recall, and fill-blank are all unchanged

## Task Commits

1. **Task 1: Annotate sentences with unknownCount in due-cards API** — `d0ed8fe`
2. **Task 2: Bare-word-first gate + least-unknown sentence pick** — `6a0ab0b`
3. **Revised: known threshold → state ≥ 1, remove hint copy, unknownCount > 0 gate** — `adb1394`
4. **Task 3: Human checkpoint approved** — verified in dev session

## Files Created/Modified

- `app/api/cards/due/route.ts` — known-lemma query (state ≥ 1) + unknownCount annotation loop
- `components/StudySession.tsx` — `unknownCount?: number` on Sentence type; `showBareFront` gate; least-unknown `chosenIdx`

## Decisions Made

- **Known = state ≥ 1 (not ≥ 2):** One prior encounter is enough for a word to count as context. Changed from the original plan's state ≥ 2 after user discussion — "seen at least once" better matches the intent.
- **showBareFront requires unknownCount > 0:** If the best sentence is fully readable (all context words known), show the sentence immediately even for a new card. Only go bare when context words are still unfamiliar.
- **No hint text on bare-word front:** Removed "Recall the meaning" hint — cleaner presentation.
- **Session snapshot:** `unknownCount` is computed once at session load, not updated as cards are reviewed. Within-session transitions don't occur; Phase 1's ordering handles the within-session prerequisite case.

## Deviations from Plan

### Post-checkpoint revision

**Behavior change after human verify:**
- **Issue:** Original `showBareFront` showed bare word for ALL new cards regardless of sentence readability. User wanted: show sentence immediately when context words are already known.
- **Fix:** Added `&& (chosenSentence?.unknownCount ?? 0) > 0` to `showBareFront`; moved `showBareFront` to after `chosenSentence` definition to access the count. Changed known threshold from state ≥ 2 → ≥ 1. Removed "Recall the meaning" hint.
- **Committed in:** `adb1394`

## Issues Encountered

None beyond the behavior refinement above.

## Next Phase Readiness

Phase 2 complete. Both promises of the Foundation-First milestone are now delivered:
- Phase 1: prerequisites come first in the session (sequencing)
- Phase 2: new words are shown bare or in-context based on sentence readability (presentation)

---
*Phase: 02-maturity-known-word-aware-presentation*
*Completed: 2026-06-26*
