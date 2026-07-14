# Requirements: Korean Study — v1.7 Active Recall Study Mode

**Defined:** 2026-07-13
**Core Value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.

## v1 Requirements

### Mode Toggle

- [ ] **MODE-01**: User can toggle between Passive and Active on the /study mode-select screen — a single control replacing today's 3-mode grid (Flashcards/Multiple Choice/Fill-blank) and the Exposure/Recall sub-toggle
- [ ] **MODE-02**: Passive is the default toggle position when the mode-select screen loads

### Active Recall

- [ ] **ACTIVE-01**: In Active mode, a card's front shows the English translation of the selected sentence
- [ ] **ACTIVE-02**: A separate, optional "tap to reveal hint" control shows the card's English "back" gloss (e.g. "using: ~(으)려고") — hidden by default, revealed only on tap, distinct from the main answer reveal
- [ ] **ACTIVE-03**: Tapping the main reveal shows the full Korean sentence with the target expression highlighted, plus audio playback and tap-to-gloss
- [ ] **ACTIVE-04**: User self-grades on the existing FSRS bar (Again/Hard/Good/Easy) after reveal; reveal copy anchors grading to the highlighted target expression, not the whole sentence
- [ ] **ACTIVE-05**: Brand-new cards (FSRS state 0/1) in Active mode degrade to the Passive/exposure experience instead of a full-sentence production prompt; they graduate to full Active production once state ≥ 1

### Cleanup

- [ ] **CLEANUP-01**: Multiple Choice mode fully removed — ModeSelector option, `MultipleChoiceMode.tsx`, distractor-selection logic in `StudySession.tsx`, related tests/e2e locators
- [ ] **CLEANUP-02**: Fill-in-the-Blank retired as a standalone mode — `FillBlankMode.tsx` removed, Exposure/Recall sub-toggle removed, related tests/e2e locators updated
- [ ] **CLEANUP-03**: `Card.distractors` DB column left in place but no longer written — extraction prompt/schema stops requesting distractors (deprecated, like `clozeSentence`/`clozeAnswer`)
- [ ] **CLEANUP-04**: Existing Passive study flow (grading, undo, requeue, audio, tap-to-gloss) has no regressions — full e2e grade-flow suite stays green

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Active Recall Refinements

- **ACTIVE-06**: Remember last-used Passive/Active toggle position in `localStorage` across sessions
- **ACTIVE-07**: Progressive hint escalation (bare target word before full reveal), beyond the single back-gloss hint

## Out of Scope

| Feature | Reason |
|---------|--------|
| Typed input with fuzzy/exact matching | Many-valid-answers problem for free-form sentence production; punishes correct alternate phrasings; conflicts with the app's instant optimistic-grading design |
| LLM equivalence/answer checking | Adds latency to the grade path; v1.2 made grading intentionally instant (synchronous, optimistic) |
| Speech recording / pronunciation scoring | No feature need identified; speaking aloud before reveal requires no app support |
| Per-direction FSRS scheduling (separate state for recognition vs. production) | `Card` stays the single FSRS review unit per existing architectural constraint; shared state across Passive/Active is an accepted tradeoff |
| Dropping the `Card.distractors` DB column | No Turso DDL needed — left in place unused, mirrors how `clozeSentence`/`clozeAnswer` were handled |

## Traceability

Every v1 requirement maps to exactly one phase. Coarse granularity: 2 phases (28–29).

| Requirement | Phase | Status |
|-------------|-------|--------|
| MODE-01 | Phase 28 | Pending |
| MODE-02 | Phase 28 | Pending |
| ACTIVE-01 | Phase 28 | Pending |
| ACTIVE-02 | Phase 28 | Pending |
| ACTIVE-03 | Phase 28 | Pending |
| ACTIVE-04 | Phase 28 | Pending |
| ACTIVE-05 | Phase 28 | Pending |
| CLEANUP-01 | Phase 28 | Pending |
| CLEANUP-02 | Phase 28 | Pending |
| CLEANUP-03 | Phase 29 | Pending |
| CLEANUP-04 | Phase 28 | Pending |

**Coverage:**
- v1 requirements: 11 total
- Mapped to phases: 11 ✓
- Unmapped: 0

**Per-phase distribution:**
- Phase 28 (Active Recall Study Mode): MODE-01, MODE-02, ACTIVE-01, ACTIVE-02, ACTIVE-03, ACTIVE-04, ACTIVE-05, CLEANUP-01, CLEANUP-02, CLEANUP-04 (10)
- Phase 29 (Distractor Write-Side Retirement): CLEANUP-03 (1)

---
*Requirements defined: 2026-07-13*
*Last updated: 2026-07-14 after roadmap creation (Phases 28–29 mapped)*
