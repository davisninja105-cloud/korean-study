# Phase 28: Active Recall Study Mode - Research

**Researched:** 2026-07-14
**Domain:** React 19 / Next.js 16 client-side study-mode refactor (mode removal + new production mode) in an existing FSRS app
**Confidence:** HIGH — every code claim below was re-verified against current source on 2026-07-14 (direct file reads of `StudySession.tsx`, `FlashcardMode.tsx`, `ModeSelector.tsx`, `StudyClient.tsx`, `lib/sentence-selection.ts`, `lib/fsrs.ts`, `e2e/grade-flow.spec.ts`, `e2e/seed.ts`, `e2e/fixture.ts`, `playwright.config.ts`, `vitest.config.ts`)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Reveal audio & example-cycling
- **D-01:** Korean sentence audio in Active stays **tap-to-play** (`AudioButton`, same as every other sentence surface in the app) — no auto-play on reveal. No new pattern to build.
- **D-02:** "See another example →" is **hidden entirely** in Active mode. The revealed answer must stay pinned to the sentence the English prompt was translated from — cycling would show a different Korean sentence than what was just translated (research Pitfall 10).

#### New-card transparency
- **D-03:** When a state 0/1 card degrades to the Passive/exposure face inside an Active session (per locked ACTIVE-05), the UI stays **silent** — no "New" badge or explanatory copy. Matches the existing precedent where Recall silently degrades to Exposure when a word isn't blank-safe.

#### AI practice questions in Active
- **D-04:** The "Include AI-generated practice questions" checkbox on the mode-select screen stays **available in both Passive and Active**. `PracticeCard`s have no `sentences` field, so in Active they always render via the word-level production fallback (English gloss → produce the Korean word) — the same fallback path as zero-sentence real cards (research Pitfall 10). No special-casing needed to hide the checkbox per mode.

#### Toggle wording
- **D-05:** The mode-select toggle uses literal **"Passive" / "Active"** labels — matches ROADMAP.md/REQUIREMENTS.md wording exactly, no translation layer between docs and UI copy. (Considered and rejected: "Review/Practice", "Recognize/Produce" — both add jargon or drift from the docs without a clear benefit the user wanted.)

#### Carried forward from REQUIREMENTS.md / ROADMAP.md / research (already locked — do not re-litigate)
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
- Exact visual layout/spacing/animation of the Active front/back faces, the hint-reveal control's placement and micro-interaction, and toggle visual styling (segmented control vs. switch, etc.) — phase has `UI hint: yes` in ROADMAP.md, so a follow-up `/gsd-ui-phase 28` is expected to produce a UI-SPEC.md with these specifics. This discussion intentionally stayed at the product/behavior level. **(Note: 28-UI-SPEC.md now exists and resolves most of this — see Architecture Patterns below.)**
- Whether `FlashcardMode.tsx` gains an Active branch in place vs. a new dedicated Active face component — research flags this as an add-active planning decision contingent on how much flip/measure/grade-bar structure is shared (>70% reuse threshold suggested); left to the planner. **(Resolved by measurement below: extend in place.)**
- Exact wording of the grade-anchoring reveal copy (e.g. "Grade yourself on the highlighted expression — different word order or phrasing is fine") — direction is locked (D-09), exact copy is Claude's call, informed by the app's existing warm-copy voice. **(28-UI-SPEC.md's Copywriting Contract now specifies: "Grade yourself on the highlighted expression — wording or word order can differ.")**

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. (v2 deferred items ACTIVE-06 "remember toggle position" and ACTIVE-07 "progressive hint escalation" were already deferred in REQUIREMENTS.md before this discussion, not raised fresh here.)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MODE-01 | Single Passive/Active toggle replaces 3-mode grid + Exposure/Recall sub-toggle | `ModeSelector.tsx` verified: `StudyMode` union at line 5, `FlashcardSubMode` at line 6, 3-mode grid at lines 13–17/28–68, sub-toggle at 40–66; 28-UI-SPEC.md §Component Notes 1 specifies the replacement segmented control verbatim |
| MODE-02 | Passive is default toggle position on load | Existing precedent: `useState<FlashcardSubMode>('exposure')` (ModeSelector.tsx:21); same pattern with `useState<StudyMode>('passive')` |
| ACTIVE-01 | Active front shows English translation of selected sentence | `chosenSentence.translation` exists on `Sentence` (StudySession.tsx:17–23); prompt derivation via new pure function (D-15) — see Code Examples |
| ACTIVE-02 | Tap-to-reveal hint shows `card.back`, hidden by default, distinct from main reveal | Hint state must be **parent-owned** in `StudySession` (mode components own no state — REFACTOR-01, FlashcardMode.tsx header comment; inner `key={cursor}` div does NOT remount FlashcardMode itself) — see Pitfall N-4 |
| ACTIVE-03 | Main reveal shows Korean sentence, target highlighted, audio, tap-to-gloss | `HighlightedSentence` + `AudioButton` + `useWordTap()` all reusable as-is (verified in FlashcardMode.tsx:100–115); pin to `chosenSentence`, not `displayedSentence` (D-15) |
| ACTIVE-04 | Self-grade on existing FSRS bar, copy anchors to target expression | Grade bar (FlashcardMode.tsx:203–259) reused verbatim; `previewIntervalLabels` already event-handler-safe in `handleReveal` (StudySession.tsx:681–689); anchoring caption copy locked in UI-SPEC |
| ACTIVE-05 | State 0/1 cards degrade to Passive/exposure; graduate to production after learning | `isNewCard = !realCard?.review \|\| (state ?? 0) <= 1` (StudySession.tsx:419) is the existing gate input; degrade reuses the exposure front-face branches verbatim — see Pitfall N-2 for the requirement-wording contradiction ("≥ 1" vs "state 0/1") |
| CLEANUP-01 | Multiple Choice fully removed | Removal inventory verified line-exact — see "Verified Code Claims & Drift" table; dead symbols enumerated |
| CLEANUP-02 | Fill-blank retired; Exposure/Recall sub-toggle removed | Same inventory; `needsBlank` collapses to constant `false` after removal (StudySession.tsx:386–388) — keep `selectSentence`'s param this milestone per debt table |
| CLEANUP-04 | Passive flow no regressions; grade-flow e2e stays green | Queue/undo/requeue pipeline (`submitReview`, `handleUndo`, `postReviewWithRetry`, `REQUEUE_GAP`) is mode-agnostic except two reset lines (StudySession.tsx:611–612); grade-flow spec update travels with ModeSelector change |
</phase_requirements>

## Summary

This phase is a **subtractive refactor plus one new front-face branch** — zero new dependencies, zero new routes, zero schema changes. The milestone research (`.planning/research/PITFALLS.md` etc.) is unusually thorough and was re-verified line-by-line against current source: **every structural claim holds**, with three findings the planner must know about: (1) minor line-number drift in one CONTEXT.md reference (Props is at StudySession.tsx:173–179, not 174–181 — cosmetic), (2) a **factual drift in the e2e seed description**: seeded due cards are `state=1`, not `state=0` as both PITFALLS.md and CONTEXT.md say — the conclusion (they hit the new-card gate) still holds, but it means **the current fixture has no due card that can exercise true Active production** (state ≥ 2 + due), which shapes the new e2e spec, and (3) `.planning/research/SUMMARY.md` predates REQUIREMENTS/CONTEXT and contradicts them in three places (Active-as-default, auto-play-on-reveal, union naming) — the planner must treat CONTEXT.md as authoritative wherever they conflict.

The one genuinely open discretion item — extend `FlashcardMode.tsx` vs. a sibling `ActiveMode.tsx` — is resolved here by measurement: after the sub-mode removal deletes the `recall` branch, the Active variant shares ~80% of FlashcardMode's structure (the entire 57-line action bar, the flip/measure scaffolding, the type badge, and most of the back face), which clears the >70% reuse threshold. **Recommendation: extend `FlashcardMode` in place with a `studyMode: 'passive' | 'active'` prop.**

**Primary recommendation:** Two-plan phase: Plan 1 = type-narrow `StudyMode` to `'passive' | 'active'`, delete MC/fill-blank/sub-toggle and all dead session state, rewrite `ModeSelector` as the toggle, update `grade-flow.spec.ts` in the same commit; Plan 2 = pure `lib/active-prompt.ts` derivation (unit-tested first), the Active front/back branch in `FlashcardMode`, parent-owned hint state, and a new `e2e/active-flow.spec.ts` with a state-promotion mutate helper.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Passive/Active toggle + mode selection | Browser/Client (`ModeSelector`, `StudyClient`) | — | Pure UI state; mode never persists (ACTIVE-06 deferred to v2) |
| Active prompt derivation | Client-safe pure lib (`lib/active-prompt.ts`, new) | — | Must be pure/total per D-15; render-safe (react-hooks/purity); mirrors `lib/sentence-selection.ts` convention |
| Sentence selection | Client-safe pure lib (`lib/sentence-selection.ts`) | — | Existing single source of truth; Active calls with `needsBlank: false` (D-13) |
| FSRS grading | Client (`lib/fsrs.ts` via `submitReview`) | API `/api/review` (fire-and-forget persist) | Optimistic grading contract (v1.2) — untouched by this phase |
| Reveal/hint/flip UI | Browser/Client (`FlashcardMode`) | — | Presentational; parent owns all state (REFACTOR-01) |
| Audio, tap-to-gloss | Client components (`AudioButton`, `GlossProvider`) | API `/api/tts`, `/api/gloss` | Reused as-is; no changes |

No server tier, API route, or DB change is touched by this phase. (`Card.distractors` write-side is Phase 29.)

## Standard Stack

### Core (all already installed — verified in package.json/lockfile; no installs this phase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| React / Next.js | 19.2.4 / 16.2.1 | Client components under App Router | Existing stack [VERIFIED: codebase] |
| ts-fsrs | ^5.3.1 | FSRS grading (`lib/fsrs.ts`) | Unchanged by this phase [VERIFIED: codebase] |
| lucide-react | 1.17.0 | `Lightbulb` icon for hint control (per UI-SPEC) | Already a dependency; icon set used in Nav [VERIFIED: codebase] |
| vitest | ^4.1.9 | Unit tests (`npm test`) | Existing test runner [VERIFIED: codebase] |
| @playwright/test | ^1.61.1 | E2E suite (port 3100, isolated file DB) | Existing harness [VERIFIED: codebase] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Extending `FlashcardMode` in place | New sibling `ActiveMode.tsx` | Sibling duplicates the 57-line grade bar + refs contract + flip scaffolding (~80% of the file); rejected — see Architecture Patterns §Pattern 2 |
| Parent-owned `hintRevealed` state | Local `useState` in FlashcardMode | Violates REFACTOR-01 ("mode components own no state; only `useWordTap()`") AND is a real bug: FlashcardMode isn't remounted per card (only the inner `key={cursor}` div is), so local hint state would leak across cards |

**Installation:** none — zero new packages.

## Package Legitimacy Audit

No new packages are installed by this phase. All libraries referenced above are existing, pinned dependencies already in `package-lock.json`.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Verified Code Claims & Drift

This phase's CONTEXT.md and the milestone PITFALLS.md cite specific lines. All were re-checked against current source (2026-07-14):

| Claim (source) | Current Source | Verdict |
|----------------|----------------|---------|
| `Props.mode`/`flashcardSubMode` + `StudyItem` union at "StudySession.tsx:174-181" (CONTEXT) | `StudyItem` union at **169–171**; `Props` at **173–179** (`mode` 176, `flashcardSubMode` 177) | ✅ Holds, ~2-line drift (cosmetic) |
| `chosenIdx` memo at StudySession.tsx:395-398 (CONTEXT, PITFALLS P2) | Exactly lines **395–398**, deps `[cardSentences, realCard?.id, realCard?.review?.reps, needsBlank]` | ✅ Exact |
| `showBareFront` gate at :428 (PITFALLS P1) | Lines **428–433**; note the quote in P1 omits one clause — the real gate also requires `cardSentences.length > 0` | ✅ Holds (quote slightly incomplete) |
| Mode dispatch ternary, final `else` = FillBlankMode, at :786-834 (PITFALLS P5) | Exactly lines **786–834** | ✅ Exact |
| Dead-symbol inventory (D-14) | All verified present: `MC_ADVANCE_MS` :58, `normalizeAnswer` :65–67, `seededShuffle` :71–85, `fillInput`/`mcSelected` :212–213, `advanceTimer` :260–261, `mcOptions` :318–349, `seed` memo :185–194, fill derivations :440–461, `mcRating` :671, `handleMcSelect` :676–679, `advanceMc` :617–620, keyboard branches :702–726, reset calls in `submitReview` :611–612, `recallBlanked` :447–449, `chosenMatch` :441–443 | ✅ Complete |
| `needsBlank` computed at mode level (P2) | Lines **386–388**: `mode === 'fill-blank' \|\| (mode === 'flashcard' && flashcardSubMode === 'recall')` — collapses to constant `false` post-removal | ✅ Exact |
| e2e seed cards are "state-0 new cards" (PITFALLS P7, CONTEXT integration point) | **DRIFT:** `e2e/seed.ts:108` creates due cards with `state: 1` (`lastReview` absent). Since `isNewCard` is `state <= 1`, they still hit the Active new-card gate — conclusion holds — **but no due card in the fixture can exercise true Active production** (mastered cards are state 2 with `nextReview` 30 days out, deliberately never due) | ⚠️ Factual drift; shapes the new e2e spec (see Validation Architecture) |
| `lib/sentence-selection.ts:selectSentence()` single source, blank-override step 4 (CONTEXT) | Verified: :66–91; `hashStr` exported :51–58 (also imported by StudySession **only for `mcOptions` seeding** — that import dies with MC) | ✅ Exact |
| `previewIntervalLabels` event-handler-only (P9) | Verified `lib/fsrs.ts:55–58` calls `new Date()`; called only in `handleReveal` (StudySession.tsx:685) | ✅ Exact |
| grade-flow spec drives `mode-flashcard` testid + Exposure default (P7) | Verified `e2e/grade-flow.spec.ts:39–40`; full spec testid inventory: `start-studying-btn`, `mode-flashcard`, `reveal-btn`, `grade-good`, `card-front-word`, `session-complete-heading`, `study-more-btn`; plus `due-count` in `smoke.spec.ts:33,40` and `session-complete-heading` in 2 other specs | ✅ Exact |
| FreshnessWatcher gates in StudyClient gate on `phase === 'select-mode'` (D-16) | Verified: `prevInitialCards` block :135–142, `prevFreshStudy` block :155–168 — both gate on phase + `isFilterLoading` + `isFullSpan`, never on mode | ✅ Exact — leave byte-identical |
| `.planning/research/SUMMARY.md` guidance | **SUPERSEDED in 3 places** by REQUIREMENTS/CONTEXT: says "Active is the default" (now Passive, MODE-02); lists "auto-play TTS on reveal" as should-have (rejected, D-01); suggests union `'flashcard' \| 'active-recall'` (see Pattern 1 — recommend `'passive' \| 'active'`, D-05 alignment) | ⚠️ Planner: CONTEXT.md wins on conflict |

Additional verified facts the planner needs:
- `StudySession`'s local `Card` interface carries `distractors?: string | null` (:31), read only by `mcOptions` (:326) — drop the field from this local interface during removal. `CardDTO.distractors` stays (Phase 29 owns the DTO).
- Imports that die with removal: `hashStr` (only `mcOptions`), `sentenceMatch`/`blankSentence` from `lib/sentence-match` (only `chosenMatch`/recall/fill), `MultipleChoiceMode`, `FillBlankMode`, `FlashcardSubMode`.
- Session header renders the mode label via `mode.replace('-', ' ')` with `capitalize` (:746–748) — after narrowing it renders "Passive"/"Active" correctly with zero changes, but verify visually.
- `handleKeyDown` (:691–728): post-removal, the `if (mode === 'flashcard')` guard on 1–4 grading must become mode-agnostic (both Passive and Active grade via 1–4); pre-reveal Space/Enter reveal is already mode-agnostic.
- `ModeSelector` heading "Choose Study Mode" (:25) and the Sheet title "Study options" (StudyClient.tsx:323) — heading copy likely wants updating to match the new single-toggle surface; UI-SPEC doesn't mandate a heading change (planner's copy call, keep warm voice).

## Architecture Patterns

### System Architecture Diagram

```
User taps "Start studying →" (StudyClient, select-mode phase)
        │
        ▼
  Sheet → ModeSelector [REWRITTEN]
  ┌──────────────────────────────┐
  │ [Passive]  [Active]  toggle  │  default: Passive (MODE-02)
  │ [ ] Include AI practice      │  available in BOTH modes (D-04)
  └──────────────┬───────────────┘
                 │ onSelect(mode: 'passive'|'active', includeAI)
                 ▼
  StudyClient.handleModeSelect ──(optional)──► POST /api/generate (AI practice)
                 │ setMode, setPhase('studying')
                 ▼
  StudySession (parent — owns ALL session state)
  ├─ queue/undo/requeue/toast pipeline ........ UNTOUCHED (CLEANUP-04)
  ├─ chosenIdx = selectSentence(…, needsBlank=false) ... needsBlank now constant (D-13)
  ├─ isNewCard = !review || state <= 1 ........ existing (:419)
  ├─ activePrompt = deriveActivePrompt(card, chosenSentence, isNewCard, isPractice) [NEW pure lib]
  ├─ hintRevealed state [NEW] — reset in submitReview + handleUndo
  │
  ▼ single dispatch (ternary chain GONE — one component)
  FlashcardMode (studyMode prop: 'passive' | 'active')
  ├─ FRONT: passive faces (bare word / sentence / no-sentence)  ← degrade target (D-10)
  │         + active faces: English prompt + hint pill + instruction caption
  │           OR word-production prompt (card.back) for zero-sentence/practice (D-04)
  ├─ BACK:  HighlightedSentence(chosenSentence) + AudioButton + anchor caption (Active)
  │         existing back w/ displayedSentence + cycle button (Passive only, D-02)
  └─ ACTION BAR: Show Answer → Again/Hard/Good/Easy ... byte-identical both modes
                 │ onGrade(rating)
                 ▼
  submitReview → local FSRS (reviewCard) → requeue decision → fire-and-forget POST /api/review
```

### Pattern 1: Type-narrow first, delete second (D-14 — the removal sequence)

**What:** Change `ModeSelector.tsx`'s exports in one edit — `export type StudyMode = 'passive' | 'active'`, delete `FlashcardSubMode` — then let `tsc` enumerate every stale reference across `StudyClient` → `StudySession` → `FlashcardMode`. Delete component files (`MultipleChoiceMode.tsx` 106 lines, `FillBlankMode.tsx` 137 lines) plus all parent state in the same atomic commit.

**Union naming:** recommend `'passive' | 'active'` (not SUMMARY.md's `'flashcard' | 'active-recall'`) — it matches the D-05 UI labels exactly, makes the header label render correctly for free via the existing `mode.replace('-',' ')`, and eliminates `flashcardSubMode` threading entirely rather than keeping a vestigial `'flashcard'` value.

**Post-removal invariants to encode in verification:**
- `grep -rn "mcOptions\|seededShuffle\|MC_ADVANCE_MS\|mcSelected\|fillInput\|normalizeAnswer\|advanceTimer\|FlashcardSubMode\|recallBlanked" components/` → zero hits
- Survivors untouched: `lib/generate-practice.ts` (`'fill-blank'` practice-card **type**), `lib/card-style.ts` badge map, `lib/audit-checks.ts` distractor checks (Pitfall 6 — same string, different domain)
- `needsBlank` in `StudySession` collapses to literal `false` at the `selectSentence` call; `selectSentence`'s parameter and its tests stay this milestone (accepted debt per PITFALLS Technical Debt table)

### Pattern 2: Extend FlashcardMode in place (discretion item — RESOLVED by measurement)

Measured shared structure (current FlashcardMode.tsx, 262 lines):

| Block | Lines | Reused by Active? |
|-------|-------|-------------------|
| Flip container + `key={cursor}` + face scaffolding + refs (`frontRef`/`backRef`) | ~74–82, 128–131, 197–200 (~20) | ✅ verbatim — parent's `useLayoutEffect` measurement contract (:363–366 in StudySession) requires these refs |
| Type badge (front + back) | ~6 | ✅ verbatim |
| Front-face branches | 83–127 (~45) | Partially — exposure branches reused verbatim as the D-10 degrade target; `recall` branch **deleted** in Plan 1; Active adds ~2 new branches (~35 lines: English prompt + hint pill + caption; word-production fallback) |
| Back face | 130–196 (~66) | Mostly — Active pins `chosenSentence` instead of `displayedSentence`, hides cycle button (D-02), adds anchor caption; structure (hr, word block, gloss, notes) shared |
| Sticky action bar (Show Answer + 4 grade buttons + `againBtnRef` + testids) | 202–259 (57) | ✅ byte-identical |

Shared ≈ 80% > the 70% threshold → **extend in place** with a `studyMode: 'passive' | 'active'` prop (plus `activePrompt`, `hintRevealed`, `onToggleHint` props). A sibling component would duplicate the action bar, refs contract, and testids — the exact contracts Pitfall 9 warns are invisible from a new file. The readability concern in the debt table assumed the 4-way front branching *including recall*; with recall deleted first, net branching complexity stays flat.

### Pattern 3: Pure prompt derivation with explicit precedence (D-15 — subtle, get the order right)

The three Active faces have a **precedence order that matters** because inputs overlap (a practice card is also "new" by the existing `isNewCard` computation, since `realCard` is null → `!realCard?.review` is true):

1. **Practice card** (`item.kind === 'practice'`) → **word-production** face (front = `card.back` English gloss, reveal = `card.front` Korean + audio). D-04: practice cards *always* take this path — they have no FSRS state, so the new-card gate must not capture them.
2. **Real card, `isNewCard`** (state ≤ 1) → **passive-degrade** face (render the existing exposure front exactly: `showBareFront`-style bare word when `unknownCount > 0` and sentences exist, else sentence-front, else no-sentence bare word). Checked BEFORE the zero-sentence fallback — a new real card with zero sentences must degrade (exposure), not get a production prompt for a never-seen word (Core Value).
3. **Real card, matured, `chosenSentence === null`** → **word-production** face (same shape as 1).
4. **Real card, matured, has sentence** → **sentence-production** face (front = `chosenSentence.translation`; reveal pins `chosenSentence`).

Encode this as `lib/active-prompt.ts` (pure, client-safe, no Prisma — mirrors `lib/sequence.ts`/`lib/sentence-selection.ts` conventions) and unit-test all four rows plus the practice-precedes-new-card ordering explicitly.

### Pattern 4: Parent-owned hint state (REFACTOR-01 compliance + correctness)

`hintRevealed` must live in `StudySession` (like `revealed`), passed down as a prop with an `onToggleHint` callback:
- FlashcardMode is **not** remounted per card — only its inner `div key={cursor}` is (FlashcardMode.tsx:75). A local `useState` would leak hint state across cards.
- Reset points: `submitReview`'s advance block (alongside `setRevealed(false)`, :610–614 — where `setFillInput`/`setMcSelected` are being deleted, add `setHintRevealed(false)`) and `handleUndo`'s restore (:667, alongside `setRevealed(false)`).
- The only hook permitted in FlashcardMode remains `useWordTap()`.

### Anti-Patterns to Avoid
- **`needsBlank: true` for Active** (D-13) — silently changes sentence pick; parity unit test required.
- **`displayedSentence` in the Active back** (D-15/D-02) — prompt/answer mismatch; pin `chosenSentence`, pass `hasMultipleSentences={false}` or branch on `studyMode` to hide the cycle button.
- **Auto-play audio via `useEffect(() => { if (revealed) play() })`** — D-01 rules out auto-play entirely; even if revisited later, it belongs in `handleReveal`, never an effect (react-hooks/set-state-in-effect).
- **`previewIntervalLabels` in render/useMemo** — calls `new Date()`; must stay inside `handleReveal` (react-hooks/purity).
- **Any fetch between reveal and grade** (Pitfall 4) — Active is pure self-grade; written non-goal.
- **Grep-deleting the string "fill-blank"** (Pitfall 6) — the AI-practice card *type* and `lib/card-style.ts` badge entry must survive.
- **`hangul-sentence` class on the English prompt** (PITFALLS UX table) — English front uses standard text styles; Korean classes only on the reveal.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sentence picking for Active | Ad-hoc pick logic in the new branch | `selectSentence(…, false)` via the existing memoized `chosenIdx` | Single source of truth; parity with Passive is a locked requirement (D-13) |
| Target highlighting in the reveal | Custom mark/span logic | `HighlightedSentence` (props: `korean`, `targetForm`, `cardType`, `className`, `onWordTap`) | Handles particle tinting, gloss taps, 1-char safety — verified reusable as-is |
| Audio on the reveal | New auto-play wrapper | `AudioButton` (tap-to-play) | D-01 locked; component handles loading/playing/speechSynthesis fallback |
| Grade-bar interval hints | New hint computation for Active | Existing `intervalHints` state + `previewIntervalLabels` in `handleReveal` | Already event-handler-safe and mode-agnostic |
| Answer correctness | Any string/LLM comparison | 4-button self-grade, `isCorrect = rating >= 3` unchanged | Out-of-scope table in REQUIREMENTS; optimistic-grading contract |
| Prompt variety/randomness | `Math.random()` | Existing `hashStr(id) + reps` rotation inside `selectSentence` | react-hooks/purity; already gives cross-review variety |

**Key insight:** everything Active needs already exists as a verified primitive; the only genuinely new code is `lib/active-prompt.ts` (~40 lines pure) + ~70 lines of JSX branches + the toggle.

## Runtime State Inventory

Refactor-phase inventory (mode removal). All categories checked explicitly:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `Card.distractors` column holds legacy JSON (read today only by `mcOptions`, which is deleted, and `lib/audit-checks.ts`, which survives). `CardReview` FSRS rows untouched. | None this phase — column stays; write-side is Phase 29 (CLEANUP-03). Ensure `lib/audit-checks.ts` remains the only reader post-removal. |
| Live service config | None — verified: no n8n/cron/external service references study modes. The daily audit cron (if any) touches extraction, not study UI. | None |
| OS-registered state | None — no schedulers/process managers reference mode names. | None ("None — verified by grep across scripts/ and repo") |
| Secrets/env vars | None — no env var names a study mode. | None |
| Build artifacts | `.next/` build cache regenerates; e2e prod-build server (port 3100) rebuilds per run via `webServer.command`. | None — `npm run build` in phase gate covers it |

## Common Pitfalls

The milestone PITFALLS.md covers this phase's domain thoroughly (Pitfalls 1–7, 9, 10 apply; 8 is Phase 29). Rather than restate them, below are the **net-new findings from this verification pass**:

### Pitfall N-1: The e2e fixture cannot exercise Active production without a new helper
**What goes wrong:** Seeded due cards are `state=1` (`e2e/seed.ts:108`) — *every* due card in the fixture hits the ACTIVE-05 degrade. A naive `active-flow.spec.ts` that toggles Active and starts a session will only ever see Passive faces and would pass vacuously without testing production at all.
**Why it happens:** PITFALLS/CONTEXT describe the seed as "state-0 new cards"; the true state (1) is still ≤ 1, so nobody noticed the production path is unreachable. Mastered cards (state 2) are pinned 30 days out specifically so they never enter the due pool (seed.ts:114–117 comment).
**How to avoid:** Add a mutate helper (precedent: `e2e/helpers/mutate.ts`, already used by grade-flow's DB backstop) that promotes one seeded due card to `state: 2` (keep `nextReview` in the past) inside the new spec's `beforeAll` **after** `resetToBaseline()`. This avoids touching `FIXTURE.dueCards = 3`, which `smoke.spec.ts` due-count assertions and the freshness specs derive from — reseeding would ripple.
**Bonus:** the degrade path itself is testable with the *unmutated* state-1 cards: assert the Active session shows the exposure face for them (silent, no badge — D-03).
**Warning signs:** an Active spec that never asserts an English-text front; `FIXTURE` counts changing in the diff.

### Pitfall N-2: ACTIVE-05's "graduate once state ≥ 1" contradicts its own "state 0/1 degrade"
**What goes wrong:** Implemented literally, "graduate at state ≥ 1" would degrade only state-0 cards — but the existing, verified gate input is `isNewCard = !review || state <= 1` (StudySession.tsx:419), and the requirement's opening clause says "state 0/1 ... degrade". Success criterion 5 repeats the same wording tension.
**How to avoid:** Use the existing `isNewCard` semantics (degrade at state ≤ 1, produce at state ≥ 2). This matches PROJECT.md's known-word threshold philosophy, D-10's "per the existing `showBareFront` logic", and PITFALLS Pitfall 1's analysis (one *exposure* ≠ producible). Record the interpretation in the plan so verification doesn't flag it as a deviation.
**Warning signs:** a gate written as `state >= 1` graduating Learning-state cards into production.

### Pitfall N-3: The requeued-card gate must be re-derived per render — and now it changes faces mid-session
**What goes wrong:** In Active, a state-1 card graded Good enough times graduates to state 2 *within the session* (the requeue carries `updatedItem` with post-grade review state back into the queue, StudySession.tsx:525–543). Its next appearance must render the **production** face, not a cached degrade. Conversely a lapsed card must keep degrading.
**How to avoid:** Derive `activePrompt` from `queue[0]` in render exactly like `showBareFront`/`isNewCard` are today (CONTEXT Established Patterns). Never snapshot it. The "Looks Done But Isn't" checklist item "requeued cards reflect updated state" now has a *visible* face-change consequence in Active — good manual UAT target.

### Pitfall N-4: Hint state placement (see Pattern 4)
Local `useState` in FlashcardMode both violates REFACTOR-01 and leaks hint state across cards (component not remounted per card). Parent-owned, reset on advance **and** undo.

### Pitfall N-5: New e2e file ordering + self-reset convention
`active-flow.spec.ts` sorts alphabetically **first** in the suite. Every existing spec self-resets to baseline in `beforeAll` (grade-flow.spec.ts:33–35; smoke.spec.ts per its header), so ordering is safe — but the new spec MUST follow the same convention (call `resetToBaseline()` then its own mutation), and must use the bounded loop-until-complete pattern, never fixed grade counts (FSRS learning-step nondeterminism, grade-flow header rationale). Also run `perf.spec.ts` budgets at phase close — they exercise the select-mode surface being rewritten.

### Pitfall N-6: UI-SPEC leaves the Active back-face content set ambiguous
28-UI-SPEC.md §Component Notes 2 specifies the Active back as "Korean sentence via HighlightedSentence + AudioButton, then the grade-anchoring caption" — it neither includes nor excludes the existing back-face word block (`card.front` + `card.back` gloss + notes, FlashcardMode.tsx:154–170). Recommendation: **keep the word/gloss block** (it reinforces exactly the target expression the grade anchors to, and reuses `card-front-word`, the testid grade-flow's content-anchored assertions depend on) but drop `displayedSentence.translation` (redundant — it *was* the prompt). Flagged as Open Question 2 for the planner to settle in the plan, not at execution.

## Code Examples

All from verified current source or direct derivations of it.

### The type narrowing (Plan 1, first edit)
```typescript
// components/ModeSelector.tsx — Source: current file lines 5–6, narrowed per D-14
export type StudyMode = 'passive' | 'active'
// FlashcardSubMode: DELETED — tsc now enumerates every stale reference:
// StudyClient.tsx:5,35,177,180,366 · StudySession.tsx:4,177,181,388,430,796
// FlashcardMode.tsx:25,37,58,91 · e2e/grade-flow.spec.ts:40 (testid)
```

### Active prompt derivation (new pure lib — D-15, precedence per Pattern 3)
```typescript
// lib/active-prompt.ts — pure, client-safe (convention: lib/sentence-selection.ts)
export type ActiveFace =
  | { face: 'passive-degrade' }                      // real card, state <= 1 (D-10)
  | { face: 'word-production'; prompt: string }      // practice card OR matured zero-sentence (D-04)
  | { face: 'sentence-production'; prompt: string }  // matured card with a chosen sentence

export function deriveActiveFace(
  card: { front: string; back: string },
  chosenSentence: { translation: string } | null,
  isNewCard: boolean,
  isPractice: boolean,
): ActiveFace {
  if (isPractice) return { face: 'word-production', prompt: card.back }   // BEFORE new-card check —
  if (isNewCard) return { face: 'passive-degrade' }                       // practice cards are "new" by
  if (!chosenSentence) return { face: 'word-production', prompt: card.back } // isNewCard's computation
  return { face: 'sentence-production', prompt: chosenSentence.translation }
}
```

### Sentence-pick parity test (D-13 — extends tests/sentence-selection.test.ts)
```typescript
// tests/sentence-selection.test.ts — fixture builder already exists (:7–9)
it('Active (needsBlank=false) picks the same index as Passive when the least-unknown sentence is blank-unsafe', () => {
  const sentences = [
    sentence('나는 가요 가요', '가요', 0),  // least-unknown but blank-UNSAFE (target twice)
    sentence('학교에 갑니다', '갑니다', 2), // blank-safe but worse tier
  ]
  const passiveIdx = selectSentence(sentences, 'card-p', 0, false)
  const activeIdx  = selectSentence(sentences, 'card-p', 0, false) // Active MUST also pass false
  expect(activeIdx).toBe(passiveIdx)
  expect(activeIdx).toBe(0) // and NOT the blank-safe override pick (index 1)
})
```

### Session-state additions in StudySession (Pattern 4)
```typescript
// components/StudySession.tsx — alongside existing revealed state (:211)
const [hintRevealed, setHintRevealed] = useState(false)
// submitReview advance block (:608–614): setFillInput/setMcSelected DELETED, add:
setHintRevealed(false)
// handleUndo restore (:662–668), alongside setRevealed(false):
setHintRevealed(false)
// keyboard grading (:713): `if (mode === 'flashcard')` → applies to both modes now
```

### FlashcardMode Active front branch (shape only — UI-SPEC owns styling)
```tsx
// components/FlashcardMode.tsx front face — new branch alongside existing ones
{studyMode === 'active' && activeFace.face !== 'passive-degrade' ? (
  <>
    <p className="font-medium text-center text-2xl text-foreground">{activeFace.prompt}</p>
    {/* NO hangul-sentence class — English text (PITFALLS UX table) */}
    <button onClick={onToggleHint} className="inline-flex items-center gap-1 py-2 px-3 text-button">
      <Lightbulb className="w-4 h-4" />{hintRevealed ? null : 'Show hint'}
    </button>
    {hintRevealed && <p className="text-base italic text-muted-foreground">Hint: {card.back}</p>}
    <p className="text-xs text-muted text-center">Translate this, then reveal</p>
  </>
) : /* existing exposure branches — the degrade target, unchanged */}
```

## State of the Art

| Old Approach (this codebase, pre-28) | Current Approach (post-28) | When Changed | Impact |
|--------------------------------------|---------------------------|--------------|--------|
| 3-mode grid + Exposure/Recall sub-toggle | Single Passive/Active toggle | This phase | `StudyMode` union narrows; `FlashcardSubMode` deleted; ~250 lines of MC/fill session state removed from the 837-line parent |
| `needsBlank` mode-derived | Constant `false` (param survives in lib this milestone) | This phase | `chosenIdx` memo deps simplify; full removal deferred (accepted debt) |
| Objective verdicts (`mcRating`, `fillCorrect`) | Pure self-grade only, `isCorrect = rating >= 3` | This phase | Written non-goal: no correctness checking on the grade path |

**Deprecated/outdated within project docs:** `.planning/research/SUMMARY.md` §Architecture Approach (Active default, auto-play, `'active-recall'` naming) — superseded by REQUIREMENTS.md + 28-CONTEXT.md. CLAUDE.md and `.planning/codebase/*.md` describe three modes in ~15 places — milestone-close doc refresh is load-bearing (PITFALLS checklist).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ACTIVE-05's "graduate once state ≥ 1" is a wording slip for "beyond Learning (state ≥ 2)", i.e. existing `isNewCard` (state ≤ 1) semantics apply | Pitfall N-2 | If the user literally wants state-1 cards in production, the gate is one constant — but it would put once-seen words into full-sentence production, against PITFALLS Pitfall 1's own analysis and D-10's `showBareFront` framing. Confirm at plan approval. |
| A2 | Active back face keeps the `card.front`/`card.back` word block (drops only the redundant translation line) | Pitfall N-6 / Open Q2 | Purely presentational; if wrong, a small JSX diff — but it affects whether `card-front-word` testid exists in Active for e2e content anchoring |

All other claims in this document are `[VERIFIED: codebase read]` — no external sources were needed (zero new dependencies; domain research pre-existed at milestone level and was re-verified against source).

## Open Questions

1. **How does the new Active e2e spec obtain a production-eligible card?**
   - What we know: fixture due cards are state 1 (all degrade); mastered cards are never due by design.
   - Recommendation: mutate-helper promotion (state 1 → 2, `nextReview` past) inside `active-flow.spec.ts`'s `beforeAll` after `resetToBaseline()` — avoids `FIXTURE.dueCards` ripple into smoke/freshness specs. (Pitfall N-1; planner should make this an explicit task.)
2. **Active back-face content set** — keep word/gloss block, drop translation line? (Pitfall N-6, Assumption A2.) Recommend: keep block; settle in plan.
3. **ModeSelector heading copy** — "Choose Study Mode" reads oddly above a two-segment toggle. UI-SPEC is silent. Recommend a light copy touch in the same plan as the toggle (Claude's discretion per CONTEXT).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | dev/build/tests | ✓ | 25.8.2 | — |
| Vitest | unit tests | ✓ | ^4.1.9 (`npm test`) | — |
| Playwright | e2e suite | ✓ | 1.61.1 (browsers previously installed — suite ran 44+ times in v1.6) | — |
| Local prod build (port 3100, file: SQLite) | e2e harness | ✓ | self-provisioned by `playwright.config.ts` webServer | — |

**Missing dependencies with no fallback:** none. No external services, APIs, or new env vars are touched by this phase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (unit, node env, `e2e/**` excluded) + Playwright 1.61.1 (e2e, port 3100, workers:1, isolated file DB, `resetToBaseline()` convention) |
| Config file | `vitest.config.ts`, `playwright.config.ts` |
| Quick run command | `npx vitest run tests/<file>.test.ts` (~2–5 s) |
| Full suite command | `npm test` (all unit) · `npx playwright test` (full e2e incl. perf budgets) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MODE-01 | Toggle replaces grid; no `mode-flashcard`/`mode-multiple-choice`/`mode-fill-blank` testids; toggle drives session | e2e | `npx playwright test e2e/grade-flow.spec.ts e2e/active-flow.spec.ts` | ❌ Wave 0 (grade-flow update + new spec) |
| MODE-02 | Passive selected by default on sheet open | e2e | assert selected-segment state before any tap in updated `grade-flow.spec.ts` | ❌ Wave 0 (same file) |
| ACTIVE-01 | Sentence-production front = `chosenSentence.translation` | unit + e2e | `npx vitest run tests/active-prompt.test.ts` + English-front assertion in `active-flow.spec.ts` | ❌ Wave 0 |
| ACTIVE-02 | Hint hidden → tap → `Hint: {card.back}`; distinct from main reveal; resets on advance/undo | e2e (+ manual UAT for feel) | hint-flow steps in `active-flow.spec.ts` (needs a `hint-toggle` testid) | ❌ Wave 0 |
| ACTIVE-03 | Reveal = Korean via HighlightedSentence + audio + gloss, pinned to `chosenSentence` | unit (pinning via `deriveActiveFace` + no `displayedSentence` in Active render) + e2e (reveal shows the Korean of the prompted sentence) | `npx vitest run tests/active-prompt.test.ts` + `active-flow.spec.ts` | ❌ Wave 0 |
| ACTIVE-04 | Grade bar after reveal; anchoring caption present; FSRS math unchanged | e2e (`grade-good` visible + caption text) ; FSRS covered by existing `tests/review-route.test.ts`/fsrs paths unchanged | `active-flow.spec.ts` | ❌ Wave 0 |
| ACTIVE-05 | State ≤ 1 degrades silently to exposure face; state ≥ 2 gets production; requeued card re-derives face | unit (all 4 `deriveActiveFace` rows + precedence) + e2e (unmutated state-1 card shows exposure face in Active; mutated state-2 card shows English prompt) | `npx vitest run tests/active-prompt.test.ts` + `active-flow.spec.ts` (mutate helper promotes one card) | ❌ Wave 0 |
| CLEANUP-01/02 | MC/fill-blank/sub-toggle fully removed; survivors intact | build + grep + unit | `npx tsc --noEmit && npm run lint` + dead-symbol grep = 0 hits in `components/` + `npx vitest run tests/card-key.test.ts tests/audit-checks.test.ts` (survivors green) | ✅ (tsc/lint/grep exist; survivor tests exist) |
| CLEANUP-04 | Passive flow unregressed | e2e | `npx playwright test e2e/grade-flow.spec.ts` (updated, drives Passive explicitly) + full suite at gate | ❌ Wave 0 (update) |
| D-13 | Sentence-pick parity when least-unknown sentence is blank-unsafe | unit | `npx vitest run tests/sentence-selection.test.ts` | ❌ Wave 0 (extend existing file) |

Success criteria 1–5 map: SC1 → MODE-01/02 rows; SC2 → ACTIVE-01/03; SC3 → ACTIVE-02; SC4 → ACTIVE-04; SC5 → ACTIVE-05 + CLEANUP-04.

### Sampling Rate
- **Per task commit:** `npx vitest run tests/active-prompt.test.ts tests/sentence-selection.test.ts` + `npm run lint`
- **Per wave merge:** `npm test && npm run build` (tsc via next build; lint clean is a project hard rule)
- **Phase gate:** `npm test && npx playwright test` — **full** e2e suite (smoke + freshness×4 + grade-flow + active-flow + perf), not just edited specs (PITFALLS Pitfall 7 / perf budgets)

### Wave 0 Gaps
- [ ] `tests/active-prompt.test.ts` — covers ACTIVE-01/03/05 + D-15 (null sentence, practice card, new card, precedence order)
- [ ] `tests/sentence-selection.test.ts` parity case — covers D-13 (extend existing file; fixture builder at :7–9 reusable)
- [ ] `e2e/active-flow.spec.ts` — covers MODE-01, ACTIVE-01..05; `beforeAll: resetToBaseline()` + state-promotion mutation; bounded loop-until-complete pattern (never fixed grade counts)
- [ ] `e2e/helpers/mutate.ts` extension — promote one seeded due card to `state: 2` (keep `nextReview` past) without touching `FIXTURE` counts
- [ ] `e2e/grade-flow.spec.ts` update — replace `mode-flashcard` testid with explicit Passive-toggle interaction; travels in the same plan as the ModeSelector rewrite (an intermediate red state within the phase is fine; the phase cannot close red)
- Framework install: none — both harnesses exist and are green as of v1.6 close

## Security Domain

`security_enforcement: true` (config), but this phase adds **no attack surface**: no new routes, no new inputs, no new env vars, no schema changes. Middleware auth gate untouched.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | Existing HMAC cookie gate (`middleware.ts`, `lib/auth.ts`) — not touched |
| V3 Session Management | no (unchanged) | Stateless cookie — not touched |
| V4 Access Control | no | Single-tenant app |
| V5 Input Validation | yes (narrow) | The hint/reveal renders `card.back` / `chosenSentence.translation` as React text nodes (auto-escaped) — no `dangerouslySetInnerHTML` anywhere in the diff |
| V6 Cryptography | no | None touched |

### Known Threat Patterns for this change

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Corrupt legacy `Card.distractors` JSON crashing a render after `mcOptions`'s try/catch is deleted | DoS (render crash) | Post-removal, `lib/audit-checks.ts`'s hardened parser must be the **only** reader of the column (verified survivor); nothing in the new Active code reads `distractors` |

## Project Constraints (from CLAUDE.md)

Directives the planner must honor (extracted from `./CLAUDE.md` + `./.claude/CLAUDE.md`):
- **ESLint strict, must stay clean:** `react-hooks/purity` (no `Date.now()`/`Math.random()`/no-arg `new Date()` in render — affects `previewIntervalLabels`, any prompt variety) and `react-hooks/set-state-in-effect` (no sync setState in effect bodies — rules out effect-driven auto-play even if D-01 hadn't).
- **RSC/DTO boundary:** `app/study/page.tsx` stays a thin async RSC; all new state/handlers live in `StudyClient`/`StudySession`. No raw `Date` across the boundary (no new DTO fields this phase anyway).
- **Client/server module purity:** new `lib/active-prompt.ts` must be pure (no Prisma/Node builtins) — client+server safe, like `lib/sequence.ts`.
- **Component conventions:** `'use client'` first line; `interface Props`; default-export components; `@/` imports; kebab-case lib files.
- **Color/typography tokens:** semantic tokens only (`bg-surface-1`, `text-button`, etc.); blue reserved for actions; UI-SPEC's color contract locks the toggle to the neutral selected-pill convention.
- **No romanization** on any card-front surface (unchanged, but the hint renders English `card.back` — that's a gloss, permitted).
- **Deploy:** `git push origin main` auto-deploys; no Vercel-timeout concerns (no server work in this phase).
- **Docs refresh:** CLAUDE.md + `.planning/codebase/*.md` describe 3 modes in ~15 places — refresh at milestone close (load-bearing per PITFALLS checklist).
- **GSD workflow enforcement:** all edits through GSD commands (this phase: `/gsd-plan-phase` → `/gsd-execute-phase`).

## Sources

### Primary (HIGH confidence — direct code reads, 2026-07-14)
- `components/StudySession.tsx` (837 lines, full read) — gates, memos, dispatch, queue/undo pipeline, keyboard handler, reset points
- `components/FlashcardMode.tsx`, `components/ModeSelector.tsx`, `components/StudyClient.tsx` (full reads) — props threading, branch structure, FreshnessWatcher gates, reuse measurement
- `lib/sentence-selection.ts`, `lib/fsrs.ts` (previewIntervalLabels) — selection algorithm, purity contracts
- `e2e/grade-flow.spec.ts`, `e2e/seed.ts` (state greps), `e2e/fixture.ts`, `playwright.config.ts`, `vitest.config.ts` — testid inventory, seed states, harness invariants
- `.planning/phases/28-active-recall-study-mode/28-CONTEXT.md`, `28-UI-SPEC.md` — locked decisions + design contract
- `.planning/research/PITFALLS.md` (full read, re-verified), `.planning/research/SUMMARY.md` (skimmed; drift documented), `.planning/REQUIREMENTS.md`, `.planning/STATE.md`

### Secondary / Tertiary
None needed — no external research performed (zero new dependencies; FSRS self-grading domain claims inherited from PITFALLS.md at its stated MEDIUM confidence).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new packages; all versions read from package.json
- Architecture: HIGH — every integration seam read directly; reuse measurement done on current source
- Pitfalls: HIGH for code-integration items (verified line-exact); MEDIUM for the FSRS self-grading domain framing (inherited from PITFALLS.md's cited Anki/FSRS community sources)

**Research date:** 2026-07-14
**Valid until:** ~2026-08-14 for the domain content; the line-number references are valid **only until Plan 1's deletion pass executes** — plans should cite symbols, not line numbers, for anything executed after the type-narrowing commit
