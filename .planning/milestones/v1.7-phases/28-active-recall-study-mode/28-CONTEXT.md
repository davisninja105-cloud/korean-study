# Phase 28: Active Recall Study Mode - Context

**Gathered:** 2026-07-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the /study 3-mode grid (Flashcards / Multiple Choice / Fill-in-the-Blank) and the Exposure/Recall sub-toggle with a single Passive/Active toggle (Passive default). Retire Multiple Choice and standalone Fill-in-the-Blank entirely (files, session state, tests, e2e locators). Add the Active production mode: English sentence prompt → tap-to-reveal Korean (highlighted target, audio, tap-to-gloss) → self-grade on the existing FSRS bar. Remove old modes first via a `StudyMode` type-narrowing pass so the compiler enumerates stale references, then extend `FlashcardMode` with the Active front-face branch into the smaller surface.

**Not in scope:** distractor write-side retirement (Phase 29 — extraction prompt/schema/DTO/audit changes). `Card.distractors` DB column stays in place but this phase doesn't touch the extraction pipeline.

</domain>

<decisions>
## Implementation Decisions

### Reveal audio & example-cycling
- **D-01:** Korean sentence audio in Active stays **tap-to-play** (`AudioButton`, same as every other sentence surface in the app) — no auto-play on reveal. No new pattern to build.
- **D-02:** "See another example →" is **hidden entirely** in Active mode. The revealed answer must stay pinned to the sentence the English prompt was translated from — cycling would show a different Korean sentence than what was just translated (research Pitfall 10).

### New-card transparency
- **D-03:** When a state 0/1 card degrades to the Passive/exposure face inside an Active session (per locked ACTIVE-05), the UI stays **silent** — no "New" badge or explanatory copy. Matches the existing precedent where Recall silently degrades to Exposure when a word isn't blank-safe.

### AI practice questions in Active
- **D-04:** The "Include AI-generated practice questions" checkbox on the mode-select screen stays **available in both Passive and Active**. `PracticeCard`s have no `sentences` field, so in Active they always render via the word-level production fallback (English gloss → produce the Korean word) — the same fallback path as zero-sentence real cards (research Pitfall 10). No special-casing needed to hide the checkbox per mode.

### Toggle wording
- **D-05:** The mode-select toggle uses literal **"Passive" / "Active"** labels — matches ROADMAP.md/REQUIREMENTS.md wording exactly, no translation layer between docs and UI copy. (Considered and rejected: "Review/Practice", "Recognize/Produce" — both add jargon or drift from the docs without a clear benefit the user wanted.)

### Carried forward from REQUIREMENTS.md / ROADMAP.md / research (already locked — do not re-litigate)
- **D-06 (MODE-01/02):** Single Passive/Active toggle replaces the 3-mode grid and Exposure/Recall sub-toggle; Passive is the default position on load.
- **D-07 (ACTIVE-01/03):** Active front = English translation of the selected sentence. Tapping the main reveal flips to the full Korean sentence, target expression highlighted via `HighlightedSentence`, plus audio and tap-to-gloss.
- **D-08 (ACTIVE-02):** A separate, optional "tap to reveal hint" control shows the card's English back gloss (`card.back`) — hidden by default, revealed only on tap, distinct from and preceding the main answer reveal.
- **D-09 (ACTIVE-04):** Self-grade on the existing Again/Hard/Good/Easy bar after reveal. Reveal copy must anchor grading to the **highlighted target expression**, not whole-sentence accuracy (research Pitfall 3 — grading whole-sentence fumbles corrupts FSRS state for the wrong signal).
- **D-10 (ACTIVE-05):** New-card gate is **Passive degrade**, not a word-level production prompt: state 0/1 cards render the Passive/exposure face (bare word or sentence, per the existing `showBareFront` logic) for that review, graduating to full Active production once state ≥ 1. This is the *default-card* new-card path; the word-level prompt (D-04 above) is reserved for the zero-sentence fallback (practice cards, and any real card with no sentences), per research Pitfall 10's "convenient same code path" framing — these are two distinct fallbacks, not one.
- **D-11 (CLEANUP-01/02):** Multiple Choice fully removed (`ModeSelector` option, `MultipleChoiceMode.tsx`, distractor-selection logic in `StudySession.tsx`, tests/e2e locators). Fill-in-the-Blank retired as a standalone mode (`FillBlankMode.tsx` removed, Exposure/Recall sub-toggle removed).
- **D-12 (CLEANUP-04):** Existing Passive flow (grading, undo, requeue, audio, tap-to-gloss) must show no regressions; full e2e grade-flow suite stays green.
- **D-13 (research Pitfall 2):** Active passes `needsBlank: false` into `selectSentence()` — same as Exposure. Blank-safety is irrelevant when the whole sentence is hidden; passing `true` silently picks a different (wrong) sentence than Passive would for the same card. Assert parity: for a card whose least-unknown sentence is blank-unsafe, Active and Passive select the same index.
- **D-14 (research Pitfall 5):** Delete modes by narrowing the `StudyMode` type first (removing `'multiple-choice'` and `'fill-blank'` from the union) and letting `tsc` enumerate every stale reference (`mcOptions`, `seededShuffle`, `MC_ADVANCE_MS`, `mcSelected`, `fillInput`, `normalizeAnswer`, `advanceTimer`, `FlashcardSubMode`, `recallBlanked`), rather than manual grep-deletion. One atomic type change across `ModeSelector` → `StudyClient` → `StudySession` → `FlashcardMode` in the same commit.
- **D-15 (research Pitfall 10):** Active prompt derivation must be a pure, total function `(card, chosenSentence, isNewCard) → prompt descriptor`, unit-tested for null-sentence, new-card, and practice-card inputs. The revealed answer pins to `chosenSentence` (never `displayedSentence`, which no longer exists in Active per D-02).
- **D-16 (research, Integration Gotchas):** `FreshnessWatcher`'s gated prop-adoption blocks in `StudyClient` (`prevInitialCards`, `prevFreshStudy`) gate on `phase === 'select-mode'`, not on study mode — leave both byte-identical during the refactor; they were hard-won in v1.6 and are unrelated to this phase's changes.

### Claude's Discretion
- Exact visual layout/spacing/animation of the Active front/back faces, the hint-reveal control's placement and micro-interaction, and toggle visual styling (segmented control vs. switch, etc.) — phase has `UI hint: yes` in ROADMAP.md, so a follow-up `/gsd-ui-phase 28` is expected to produce a UI-SPEC.md with these specifics. This discussion intentionally stayed at the product/behavior level.
- Whether `FlashcardMode.tsx` gains an Active branch in place vs. a new dedicated Active face component — research flags this as an add-active planning decision contingent on how much flip/measure/grade-bar structure is shared (>70% reuse threshold suggested); left to the planner.
- Exact wording of the grade-anchoring reveal copy (e.g. "Grade yourself on the highlighted expression — different word order or phrasing is fine") — direction is locked (D-09), exact copy is Claude's call, informed by the app's existing warm-copy voice.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap (locked)
- `.planning/REQUIREMENTS.md` — MODE-01/02, ACTIVE-01..05, CLEANUP-01/02/04 (v1 requirements for this phase); v2 deferred items (ACTIVE-06/07); Out-of-Scope table
- `.planning/ROADMAP.md` §Phase 28 — goal, success criteria, `UI hint: yes`

### Research (HIGH confidence, grounded in direct code reads)
- `.planning/research/PITFALLS.md` — Pitfall 1 (new-card gate — now resolved as D-10), Pitfall 2 (`needsBlank` — D-13), Pitfall 3 (self-grading the sentence vs. the card), Pitfall 5 (type-narrowing deletion — D-14), Pitfall 10 (prompt/answer mismatch, zero-sentence fallback — D-15), Technical Debt Patterns table, Integration Gotchas table (D-16), Recommended phase order section
- `.planning/research/ARCHITECTURE.md`, `.planning/research/FEATURES.md`, `.planning/research/STACK.md`, `.planning/research/SUMMARY.md` — broader v1.7 research context (not re-read line-by-line for this discussion; consult if planner needs more depth)

### State / accumulated decisions
- `.planning/STATE.md` §Accumulated Context → Decisions — v1.7 roadmap shaping rationale (why 2 phases not 3, why distractor retirement is separate, product decisions baked into scope before this discussion)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/FlashcardMode.tsx` — presentational, owns no session state; front-face already branches on `showBareFront` / `chosenSentence` / `recallBlanked`. Active's front-face branch slots into this existing conditional structure (or a sibling component, per planner's call — see Claude's Discretion).
- `components/HighlightedSentence.tsx` — renders targetForm highlight + tap-to-gloss; reused as-is for the Active reveal.
- `components/AudioButton.tsx` — tap-to-play speaker button; reused as-is (D-01 rules out a new auto-play variant).
- `lib/sentence-selection.ts:selectSentence()` — single source of truth for sentence picking; Active calls it with `needsBlank: false` (D-13), same call site pattern as the memoized `chosenIdx` in `StudySession.tsx:395-398`.
- `lib/fsrs.ts:previewIntervalLabels()` — grade-bar hint computation; already event-handler-safe (computed in `handleReveal`), unchanged for Active.
- `components/GlossProvider.tsx:useWordTap()` — tap-to-gloss hook; already wired into `FlashcardMode` via `onWordTap`.

### Established Patterns
- Presentational mode components own no state (`StudySession.tsx` retains queue/undo/measurement refs); `useWordTap()` is the only hook permitted in a mode component (v1.3 refactor convention, `FlashcardMode.tsx` header comment).
- Derived values (`showBareFront`, `isNewCard`, `chosenIdx`) are computed in `StudySession.tsx` render from `queue[0]` so they automatically reflect post-grade/requeue state — the Active new-card gate (D-10) must follow the same pattern, not a one-time snapshot.
- `react-hooks/purity` — no `Date.now()`/`Math.random()` in render; grade-bar hints and any new derived Active state must stay pure or move into event handlers.

### Integration Points
- `components/ModeSelector.tsx` — currently exports `StudyMode = 'flashcard' | 'multiple-choice' | 'fill-blank'` and `FlashcardSubMode = 'exposure' | 'recall'`; both types collapse under the Passive/Active toggle (D-06, D-14). `onSelect` callback signature threads through `StudyClient` → `StudySession`.
- `components/StudySession.tsx:174-181` — `Props.mode`/`flashcardSubMode` and the `StudyItem` union (`{ kind: 'real' | 'practice' }`) are the integration seam; Active must be representable for both real `Card`s and `PracticeCard`s (D-04, D-15).
- `e2e/grade-flow.spec.ts` — currently drives `mode-flashcard` testid and Exposure-default assumptions; needs explicit updating to pick a mode deliberately (research Integration Gotchas table) since seed cards are state-0 and would otherwise hit the Active new-card gate.

</code_context>

<specifics>
## Specific Ideas

No additional specific references or "I want it like X" examples beyond the decisions captured above — the discussion resolved the open product questions research flagged (Pitfalls 1/10's gate shape, cycling behavior, audio behavior) plus two app-feel questions (new-card silence, toggle wording) that weren't pre-decided in REQUIREMENTS.md.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. (v2 deferred items ACTIVE-06 "remember toggle position" and ACTIVE-07 "progressive hint escalation" were already deferred in REQUIREMENTS.md before this discussion, not raised fresh here.)

</deferred>

---

*Phase: 28-active-recall-study-mode*
*Context gathered: 2026-07-14*
