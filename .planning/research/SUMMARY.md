# Project Research Summary

**Project:** Korean Study v1.7 Active Recall Study Mode  
**Domain:** Spaced-repetition production-exercise integration into existing FSRS flashcard app  
**Researched:** 2026-07-13 to 2026-07-14  
**Confidence:** HIGH — research grounded in direct codebase inspection + Anki/FSRS community consensus

## Executive Summary

The v1.7 Active Recall mode is a **refinement that simplifies the app, not a greenfield feature**. Research confirms zero new dependencies are needed: the entire feature composes from existing primitives (FlashcardMode structure, FSRS grading, sentence selection, audio, tap-to-gloss). The Active Recall mechanic — English sentence prompt → tap to reveal Korean + audio → self-grade on the FSRS bar — is the canonical production-exercise pattern used by Anki, Glossika, and Clozemaster. This app already has every component; the work is integration and deletion.

The core complexity is **not building Active, it is unwinding the existing modes correctly**. Multiple Choice and Fill-in-the-Blank modes account for ~250 lines of session state (`mcOptions`, `seed`, `fillInput`, `advanceTimer`, keyboard branches, distractor selection) woven throughout the 837-line `StudySession.tsx`. Deleting these while preserving the queue/undo/requeue core requires a deliberate type-narrowing pass before implementation — research recommends "remove-modes → add-active → cleanup" ordering to let the compiler enumerate stale references instead of manual grep-deletion.

The single critical new design element is the **new-card gate for Active mode** (Pitfall 1). Producing a full Korean sentence containing a never-seen word violates the app's Core Value ("what you're meant to learn is always learnable in the moment"). Research recommends either word-level production prompts for state 0/1 cards, or degrading those cards to Passive exposure — flagged for user discussion before planning, not a code detail.

## Key Findings

### Recommended Stack

**Zero new dependencies. All components already installed and verified at source.**

The Active Recall reveal-then-self-grade UI pattern has no established React library — every production app (Anki, Synapse, Quanta) builds it from local components atop an SRS scheduler. This codebase already has the scheduler (`ts-fsrs` 5.3.1), the flip-card container (3D CSS + dynamic height via `useLayoutEffect`), the action bar (4-button FSRS grade), and the Korean sentence rendering (with highlight and tap-to-gloss). Active mode is a ~200-line extension of `FlashcardMode.tsx` that reuses the back face and grade bar byte-for-byte, swapping only the front face from Korean sentence → English `chosenSentence.translation`.

**Integration points:**
- `components/FlashcardMode.tsx` — extend with `mode: 'active-recall'` prop, add English-prompt front branch
- `components/StudySession.tsx` — add `'active-recall'` to `StudyMode` union, dispatch to FlashcardMode, extend keyboard grading condition
- `components/ModeSelector.tsx` — replace 3-mode grid + Exposure/Recall sub-toggle with binary Passive/Active toggle
- Deletion targets: `MultipleChoiceMode.tsx`, `FillBlankMode.tsx` (removal inventory in ARCHITECTURE.md is complete and verified)

### Expected Features

**Must have (table stakes):**
- English sentence translation shown as front-face prompt (reuses existing `chosenSentence.translation` field)
- Tap-to-reveal displays full Korean sentence with `targetForm` highlighted via `HighlightedSentence` + audio
- Self-graded on existing FSRS bar (Again/Hard/Good/Easy) — no typed input or auto-scoring
- Target-word clarification visible on prompt (card's English `back` gloss shown as sub-line, e.g. "using: ~(으)려고")
- Optimistic grading unchanged (client-side FSRS, fire-and-forget API save)

**New design requirement (critical):**
- New-card gate for Active mode (state 0/1 cards shown word-level production prompt or degraded to Passive — pending user discussion). Producing full sentences around never-seen words violates Core Value.

**Should have (competitive, P1 but lower risk):**
- Auto-play Korean TTS on reveal (Glossika's model, reuses existing `/api/tts` + Blob cache)
- "Grade yourself on the **highlighted expression**" copy on reveal (anchors grading to the target item, not whole-sentence perfection)
- Tap-to-gloss wired to revealed Korean (no glossing on English prompt)

**Defer (v1.7.x):**
- Remember last-used toggle in `localStorage` (add once Active default is validated)
- Progressive hint (bare target word before full reveal)

**Anti-features (explicitly NOT in v1.7):**
- Typed input with fuzzy/exact matching (many-valid-answers problem; punishes correct production)
- LLM equivalence checking (adds latency to grade path; v1.2 made grading intentionally instant)
- Speech recording / pronunciation scoring (speaking aloud before reveal needs no feature)
- Per-direction FSRS scheduling (explicitly out of scope per PROJECT.md; shared state is accepted tradeoff)

### Architecture Approach

Active Recall integrates as a new `StudyMode` value — the union narrows from `'flashcard' | 'multiple-choice' | 'fill-blank'` to `'flashcard' | 'active-recall'`, with `FlashcardSubMode` (`'exposure' | 'recall'`) deleted entirely. The Passive/Active choice becomes a single UI toggle in `ModeSelector` (Active is the default). At the component level, `FlashcardMode.tsx` is **extended with the active branch, not cloned** — the back face, grade bar, flip animation, and undo/requeue contract are byte-identical between modes; only the front face changes from Korean sentence → English translation (or `card.back` fallback for zero-sentence cards).

The queue/grading core in `StudySession.tsx` is entirely mode-agnostic — Active inherits every guarantee (optimistic grading, requeue-at-gap, undo snapshots, keyboard shortcuts, dynamic card height) as long as it interacts only through the existing `handleReveal` and `submitReview` callbacks. The FSRS state is unchanged (one review per Card, production and recognition share state — an accepted tradeoff per research and PROJECT.md).

### Critical Pitfalls

**Pitfall 1: Active mode silently inverts foundation-first for brand-new cards**  
Without explicit gating, state-0 cards show full-sentence production prompts for never-seen words, violating Core Value. How to avoid: Implement new-card gate (word-level production or Passive degrade for state 0/1); unit-test; confirmed as highest-risk asymmetry.

**Pitfall 2: Wiring Active through `needsBlank` machinery changes sentence selection**  
Blank-safety constraints don't apply to Active (entire sentence hidden). Passing `needsBlank: true` silently picks wrong sentence. How to avoid: Active always `needsBlank: false`; unit-test parity with Passive.

**Pitfall 3: Self-grading sentence instead of card, corrupting FSRS state**  
Unmarked reveals encourage grading whole-sentence perfection, mis-scheduling target word. How to avoid: Render via `HighlightedSentence` with grade-criterion copy ("grade the **highlighted expression**").

**Pitfall 5: Deleting modes by file-removal instead of type-narrowing**  
Dead-code branches and orphaned lifecycle refs left behind (mcOptions, seed, fillInput, advanceTimer). How to avoid: Narrow `StudyMode` type first; let `tsc` enumerate stale refs. Delete per mode atomically.

**Pitfall 8: Half-retiring distractor chain**  
Incomplete removal across prompt/schema/sync/tests leaves warn spam or extraction overhead. How to avoid: Retire atomically across all 4 sites in one commit; validate with `scripts/prompt-eval.mts`.

## Implications for Roadmap

Research recommends a three-phase structure based on dependencies and risk mitigation:

### Phase 1: Remove Old Modes (Type-Narrowing & Cleanup)

**Rationale:** Type-narrow first; compiler enumerates stale references instead of manual grep-deletion. Shrinks the 837-line `StudySession` integration surface so Active lands in simpler code.

**Delivers:**
- `StudyMode` union narrowed to `'flashcard' | 'active-recall'`
- `FlashcardSubMode` deleted throughout codebase
- `MultipleChoiceMode.tsx` and `FillBlankMode.tsx` files removed
- Mode-specific session state removed (mcOptions, seed, fillInput, advanceTimer, keyboard branches)
- `ModeSelector` rewritten with binary Passive/Active toggle (Active default)
- e2e grade-flow spec updated, full suite green

**Avoids:** Pitfalls 5 (orphaned code), 6 (accidental AI-practice badge deletion)

**Research flags:** None — mechanical refactoring with compiler feedback.

### Phase 2: Add Active Recall Mode (Feature Implementation)

**Rationale:** New modes integrate easier after old ones deleted. Focus on new-card gate design (Pitfall 1) and reveal clarity (Pitfall 3) — feature-specific risks.

**Delivers:**
- `'active-recall'` added to `StudyMode` union
- `FlashcardMode.tsx` extended with active front-face branch
- New-card gate implemented (word-level or Passive degrade, per discuss-phase decision)
- Reveal renders `HighlightedSentence` + grade-criterion copy
- Auto-play TTS on reveal
- Active e2e spec (seed with known-state cards, English prompt → reveal → grade flow)
- Passive verified unchanged via extended grade-flow spec

**Avoids:** Pitfalls 1, 2, 3, 7, 9, 10 (with unit tests + e2e coverage)

**Research flags:**
- **New-card gate design:** Confirm word-level vs Passive degrade in discuss-phase
- **Reveal copy effectiveness:** Manual UAT to verify "grade the highlighted expression" prevents whole-sentence mis-grading

### Phase 3: Clean Up Write-Side & Docs (Distractor Retirement)

**Rationale:** Cleanup after feature stable. Retire distractor generation pipeline (no longer needed for any mode). Update read-side, refresh docs.

**Delivers:**
- `lib/extract-cards.ts` prompt and zod schema updated (no distractors)
- `lib/sync.ts` distractor-write branches removed
- `lib/dto.ts` drops `distractors` from `CardDTO`
- `lib/audit-checks.ts` distractor class 4 removed
- `tests/extract-cards.test.ts` distractor assertions removed
- `CLAUDE.md` and `.planning/codebase/*.md` refreshed
- `Card.distractors` column marked deprecated-in-place

**Avoids:** Pitfall 8 (half-retired chain)

**Research flags:** None — standard cleanup following established pattern.

### Phase Ordering Rationale

1. **Remove first** → smaller surface for Add (837 → ~600 lines). Type-narrowing makes compiler the deletion checklist.
2. **Add requires design decision** (new-card gate). Defer to Phase 2 discuss-phase; Phase 1 removes blocker.
3. **Cleanup post-stabilization.** Distractor retirement is four-site atomic change; verify after Active tested.

Each phase independently deployable + verifiable.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct source inspection: FlashcardMode.tsx (262L), StudySession.tsx (837L), integration points verified at line level |
| Features | MEDIUM-HIGH | Glossika/Anki pattern cross-verified; must-have list grounded in source (DTO fields, audio/gloss exist); anti-features confirmed out of scope |
| Architecture | HIGH | Complete removal inventory (files, symbols, line numbers) verified against current source; dispatch shape and ref threading explicit |
| Pitfalls | HIGH | Ten pitfalls analyzed via codebase reads; recovery strategies detailed; phase mapping prevents each |

**Overall confidence: HIGH**

### Gaps to Address

1. **New-card gate design** — research recommends two shapes (word-level or Passive degrade), but choice is user preference. Action: confirm in `/gsd-discuss-phase` before Phase 2 planning.

2. **Reveal copy empirical validation** — Anki/FSRS guidance suggests highlighting + copy prevents honesty drift, but single user may differ. Action: manual UAT in Phase 2; low-risk iteration.

3. **Performance at scale** — research assumes 20-card session, ~500-card deck. Action: if deck grows, re-check memoization pattern in post-Phase-2 UAT.

## Sources

### Primary (HIGH confidence)

- Direct source inspection: STACK.md, ARCHITECTURE.md, PITFALLS.md research files (line-by-line codebase verification)
- `.planning/PROJECT.md` — v1.7 scope, Core Value, Card=review-unit boundary
- `CLAUDE.md` — REFACTOR-01 convention, RSC-05 DTO boundary, study-mode architecture

### Secondary (MEDIUM confidence)

- Anki/FSRS self-grading practice (community consensus across multiple guides)
- Glossika product reviews (production-exercise flow validation)
- Anki language-learning guides (recognition-first sequencing, many-valid-answers pitfall)

---

**Research completed:** 2026-07-14  
**Status:** Ready for Phase 1 planning + discuss-phase on new-card gate design  
**Next step:** Commit all research files, proceed to roadmap definition
