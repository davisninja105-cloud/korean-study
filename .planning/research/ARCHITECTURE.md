# Architecture Research

**Domain:** Active Recall (production-mode) study exercise integration into an existing Next.js 16 study session architecture (v1.7 milestone)
**Researched:** 2026-07-13
**Confidence:** HIGH — every claim below was verified by reading the current source files directly (line numbers cited are from today's working tree at commit `b6488a2`). No external/web research was needed; this is a pure codebase-integration question.

This file supersedes the 2026-07-10 ARCHITECTURE.md (v1.6 milestone — freshness/E2E; all shipped). It is scoped to v1.7: **Passive/Active toggle, new Active Recall mode, deletion of Multiple Choice and standalone Fill-in-the-Blank**.

---

## Core Recommendation (the question's main fork)

**Model Active as a new `StudyMode` value — narrow the union to `'flashcard' | 'active-recall'` and delete `FlashcardSubMode` entirely. At the component level, do NOT create a new mode component: extend `FlashcardMode.tsx` with the mode as a prop, replacing the current `flashcardSubMode` prop 1:1.**

### Why a `StudyMode` value, not an orthogonal sub-axis

The end state has exactly **one user-facing choice**: Passive vs Active. Modeling that as a sub-axis inside `'flashcard'` would leave `StudyMode` a vestigial single-valued union (`'flashcard'` only) plus a second axis carrying the real decision — two type axes for one UI choice. The existing `Exposure | Recall` sub-toggle only existed because it shared 90% of flashcard rendering *while three top-level modes also existed*; both of those conditions disappear in this milestone (Recall is retired along with Fill-in-the-Blank, which Active supersedes).

Concretely, everything in `StudySession.tsx` that must distinguish the two behaviors already keys off `mode`:

- the header label (`mode.replace('-', ' ')`, line 747 — renders "active recall" for free),
- the keyboard handler branches (`handleKeyDown`, lines 691–728),
- the `needsBlank` derivation (lines 386–388),
- the mode dispatch block (lines 786–834).

Adding a union value is mechanical at every one of those sites. The Passive/Active toggle in `ModeSelector` then maps directly: **Passive → `'flashcard'`, Active → `'active-recall'`** (Active pre-selected — it is the new default per the milestone goal). Keeping the literal `'flashcard'` (rather than renaming to `'passive'`) minimizes churn in `StudyClient.tsx`, the e2e specs, and the header label.

### Why extend `FlashcardMode.tsx` rather than add `ActiveRecallMode.tsx`

The REFACTOR-01 convention (one presentational component per mode, parent owns all state) *permits* a new component, but Active Recall's render tree is ~85% identical to the flashcard's:

- **The revealed face of Active IS the current back face of `FlashcardMode`** (lines 131–197): Korean sentence via `HighlightedSentence` + `AudioButton`, `card.front` + audio, `card.back`, translation, notes, "See another example →" cycling. Nothing new to build there.
- **The grade bar is byte-identical** (lines 203–259): Show Answer → Again/Hard/Good/Easy with FSRS interval hints, `againBtnRef` focus target, `data-testid="grade-*"`.
- **The 3D flip + dynamic height machinery is parent-owned and threaded via refs** (`frontRef`/`backRef`/`cardHeight` measured by the `useLayoutEffect` at StudySession lines 363–366) — a clone would re-thread the identical props.

A separate `ActiveRecallMode.tsx` would be a ~200-line clone whose back face and action bar drift from `FlashcardMode`'s over time. The front face of `FlashcardMode` already branches three ways (`showBareFront` / recall-blanked / sentence, lines 83–127); this milestone **deletes the recall branch and adds an active branch**, so the branch count stays flat.

**Prop change:** replace `flashcardSubMode: FlashcardSubMode` with `mode: StudyMode` (or `active: boolean`) on `FlashcardMode`'s `Props`. Delete the `recallBlanked` prop.

---

## Integration Point for "English shown, Korean fully hidden"

**This is NOT a blanking problem — do not route it through `lib/sentence-match.ts` / `blankSentence` / `HighlightedSentence`.** Those exist to blank/highlight the `targetForm` *substring inside* a Korean sentence. Active hides the entire Korean sentence, so the front face is simply:

```tsx
// New front-face branch in FlashcardMode.tsx (mode === 'active-recall'):
<p className="text-2xl text-foreground font-medium text-center">
  {chosenSentence.translation}
</p>
<p className="text-xs text-muted text-center">Say it in Korean</p>
```

Plain text render of `chosenSentence.translation` — a field every `Sentence` row has (required column, `prisma/schema.prisma`). Key wiring details, all verified against current source:

| Concern | Integration point | What changes |
|---------|-------------------|--------------|
| Which sentence's translation to show | `selectSentence()` call in `StudySession.tsx` line 395–398 | Nothing structural. Pass `needsBlank = false` for active (no blanking happens). Least-unknown ranking remains valuable: fewest-unknown-words = most producible sentence. |
| `needsBlank` derivation | `StudySession.tsx` lines 386–388 | Becomes constant `false` after fill-blank + Recall removal — collapse the expression, keep the `selectSentence` signature (see Removal Inventory note on `lib/sentence-selection.ts`). |
| Revealed face | `FlashcardMode.tsx` back face, lines 131–197 | **Zero changes.** Already renders Korean sentence + `AudioButton` + word + meaning + translation + notes + example cycling. This satisfies "tap to reveal shows the Korean sentence + audio" outright. |
| Audio on the FRONT face | New active branch | **Omit `AudioButton` on the active front** — TTS speaks Korean, which would leak the answer before reveal. (Passive fronts keep theirs.) |
| No-sentence fallback | The `: (` else-branch pattern already in `FlashcardMode` front face (lines 117–127) | Active cards with zero sentences (and all AI `PracticeCard`s, which never have sentences) fall back to prompting with `card.back` (the English meaning) — "What's the Korean for: *{card.back}*". Mirrors `FillBlankMode`'s existing `"Type the Korean for:"` fallback (FillBlankMode lines 72–77). |
| Tap-to-gloss | `useWordTap()` in FlashcardMode (line 71) | Unchanged — only wired to Korean sentences on the revealed face, which is exactly where you want it in Active. Nothing to gloss on an English front. |
| Reveal action | `handleReveal` in `StudySession.tsx` lines 681–689 | **Zero changes.** Sets `revealed`, computes `previewIntervalLabels` hints, focuses `againBtnRef` — all mode-agnostic. |
| Grading | `submitReview` lines 469–615 | **Zero changes.** See invariants section. |

### Open design question to resolve in discuss-phase (flagged, with recommendation)

**What does Active show for a brand-new card (FSRS state ≤ 1)?** Producing a full Korean sentence from English for a never-seen word violates the project's Core Value ("what you're meant to learn is always learnable in the moment"). The Passive path solves this with the `showBareFront` gate (lines 428–433). Recommendation: mirror it — when `isNewCard` (already computed at line 419), the active front prompts with `card.back` (produce the *word*, not the sentence); matured cards get the sentence translation. This is one extra condition reusing the existing `isNewCard` derivation. Per the user's stated preference for confirming optional scope, treat this as a discuss-phase decision, not a bundled default.

---

## Invariants That Must Be Preserved (and why they survive untouched)

The queue/grading core in `StudySession.tsx` is **entirely mode-agnostic** — Active inherits every guarantee as long as it interacts only through `handleReveal` and `submitReview` (which the `FlashcardMode` reuse guarantees, since those are the only callbacks it receives):

| Invariant | Where it lives | Active-mode impact |
|-----------|----------------|--------------------|
| Optimistic grading (client-side FSRS via `reviewCard()`, fire-and-forget `postReviewWithRetry`) | `submitReview` lines 496–584 | None — `onGrade={submitReview}` is the same prop Active receives. |
| `REQUEUE_GAP = 4` re-insertion of sub-day cards | lines 592–595 | None — computed from the FSRS result, not the mode. |
| Undo snapshot (`undoRef` captured *before* queue advance, atomic mount-guarded restore, in-flight-retry abort) | lines 221–229, 565–567, 622–669 | None — snapshot shape has no mode-specific fields. The `setMcSelected(null)` / `setFillInput('')` resets in the advance block (lines 611–612) get deleted *with* their state; nothing else references them. |
| `learningSteps` round-trip (Phase 27 FSRS bug fix) | lines 515, 536 | None — untouched by mode work. |
| "Card N of Total" honesty under requeue (`seenCardIdsRef`) | lines 233–234, 485–491 | None. |
| Dynamic card height + 3D flip | `useLayoutEffect` lines 363–366 + threaded `frontRef`/`backRef` | None if FlashcardMode is reused — the refs measure whatever face renders. |
| Keyboard grading (1–4 after reveal) | `handleKeyDown` lines 713–718 | One-line change: the `mode === 'flashcard'` condition extends to `active-recall` (or becomes unconditional once only two flashcard-shaped modes remain). The MC (702–711, 723–727) and fill-blank (719–722) branches are deleted. |
| Purity rules (`react-hooks/purity`) | throughout | The active front branch is pure render of existing props — no new time/randomness reads anywhere. Note: deleting `mcOptions` also deletes the *only* consumer of the `seed` useMemo (lines 185–194) and `seededShuffle` (lines 71–85) — remove both, and fix the now-stale comment at lines 201–203. |

---

## Removal Inventory (exact files + symbols, verified)

### A. Delete outright
| File | Notes |
|------|-------|
| `components/MultipleChoiceMode.tsx` | Sole importer is `StudySession.tsx`. |
| `components/FillBlankMode.tsx` | Sole importer is `StudySession.tsx`. Active supersedes it (per milestone). |

### B. `components/StudySession.tsx` — strip these symbols
`MC_ADVANCE_MS` (58), `normalizeAnswer` (64–66), `seededShuffle` (71–85), `seed` useMemo (185–194), `mcOptions` useMemo (315–349, the "~lines 315-348" the milestone names), `mcSelected` + `fillInput` state (212–213), `advanceTimer` ref + cleanup effect (259–261), `advanceMc` (617–620), `mcRating` (671), `handleMcSelect` (674–679), keyboard MC/fill branches (702–711, 719–727), MC/fill dispatch branches (807–834), fill-blank deriveds `chosenMatch`/`useChosenForFill`/`fillSentence`/`fillTranslation`/`fillAnswer`/`fillCorrect` (441–461), `recallBlanked` (447–449), `needsBlank` (386–388 → pass `false`), `flashcardSubMode` prop (177, 181), `showBareFront`'s `flashcardSubMode === 'exposure'` clause (430 → `mode === 'flashcard'`), `distractors` field on the local `Card` interface (31), imports of `MultipleChoiceMode`, `FillBlankMode`, `sentenceMatch`, `blankSentence` (7–9).

### C. `components/ModeSelector.tsx` — rewrite
- `StudyMode` → `'flashcard' | 'active-recall'`; **delete `FlashcardSubMode`** (exported type — also imported by `StudySession.tsx` line 4, `FlashcardMode.tsx` line 25, `StudyClient.tsx` line 5).
- 3-card grid + sub-toggle → Passive/Active binary toggle; `onSelect(mode, includeAI)` (drop 3rd param). Active listed/selected first (new default).
- **Keep `data-testid="mode-flashcard"` on the Passive option and add `mode-active-recall`** — `e2e/grade-flow.spec.ts:40` clicks `mode-flashcard`.

### D. `components/StudyClient.tsx`
Drop `flashcardSubMode` state (35) + its `StudySession` prop (366); default `mode` state to `'active-recall'` (34); update `handleModeSelect` signature (177–180).

### E. `components/FlashcardMode.tsx`
Drop `flashcardSubMode`/`recallBlanked` props + the recall front branch (91–97); add the active front branch (translation prompt + no-sentence/new-card fallback); rename prop per recommendation above.

### F. Write-side distractor deprecation (column stays; writes stop)
| File | Lines | Change |
|------|-------|--------|
| `lib/extract-cards.ts` | 33 (zod schema), 51 (interface), 118 (system prompt "multiple-choice, fill-in-the-blank"), 178–179 (prompt rule), 417–430 (normalize + IN-01 warn) | Remove `distractors` end-to-end; reword system prompt to the two remaining presentation modes. Cheaper prompt, fewer output tokens. |
| `lib/sync.ts` | 165–166, 190, 219 | Remove `distractorsJson` build + create/update payload fields. |
| `scripts/local-resync.mts` | 114, 131, 151 | Same removal. |
| `scripts/reextract-lesson.mjs` | 84, 111, 177, 209, 217 | Legacy one-off with its own inline prompt (not in CLAUDE.md's script inventory) — update to match or delete. |

**Do NOT drop the `distractors` column from `prisma/schema.prisma`** — milestone explicitly leaves it (like `clozeSentence`), and Turso DDL is manual/hazardous anyway.

### G. Read-side DTO cleanup (recommended in-scope: no reader remains)
| File | Change |
|------|--------|
| `lib/dto.ts:64` | Remove `distractors` from `CardDTO`. |
| `lib/cards-list.ts:26` | Remove `distractors: true` from `cardSelect`; rewrite the lines 10–15 comment (it explicitly justifies keeping it *because of* MC — that justification dies with MC). |
| `lib/study-cards.ts` | The final full-card fetch (~line 130+) must satisfy `CardDTO`; adjust with the DTO change. |
| `tests/study-cards.test.ts:62` | Drop fixture field. |

### H. Tests
| File | Change |
|------|--------|
| `tests/extract-cards.test.ts` | Remove ~35 `distractors:` fixture lines, the "distractors sliced" assertions (247–300 region), and the IN-01 filtering test — alongside the `extract-cards.ts` change, same commit. |
| `tests/audit-checks.test.ts` + `lib/audit-checks.ts` + `scripts/audit-cards.mts` | **Required, easy to miss:** `checkDistractors(null)` returns `['null']` (audit-checks.ts:236) and null-distractor cards land in `distractorFindings` (verified: test at line 159 + fixture card A at 456–459/562). Once extraction stops writing distractors, **every new card would flag a distractor anomaly**, drowning future audits in noise. Remove check class 4 (`DistractorAnomaly`, `checkDistractors`, `distractorFindings`) and the audit-script sections at audit-cards.mts:143/223–227/334. |
| `e2e/grade-flow.spec.ts:40` | `mode-flashcard` click — survives if testid kept (rec. C); the comment "(D-03 Exposure default)" needs updating. |
| `e2e/freshness-gate.spec.ts:47` | `getByRole('button', { name: /Flashcards/ })` — update to the new Passive label/testid. |

### I. Keep — do not delete (easy false positives)
| Item | Why it stays |
|------|--------------|
| `lib/card-style.ts:18` `'fill-blank'` badge entry | It styles the AI **practice-card `type`** (`lib/generate-practice.ts` emits `'example-sentence' \| 'fill-blank' \| 'transformation'`), not the study mode. `typeBadgeClass(currentCard.type)` hits it for practice items. `lib/generate-practice.ts` itself is untouched by this milestone. |
| `lib/sentence-selection.ts` `selectSentence(..., needsBlank)` | Pure, unit-tested; keep the signature, pass `false` from the app. Update its doc comments (lines 14–24, 44–48 reference fill-blank/Recall/`mcOptions` distractor seeding — `hashStr` remains used by sentence tie-breaking and `displayedSentence` rotation). Param removal is optional later cleanup, not this milestone. |
| `lib/sentence-match.ts` / `HighlightedSentence.tsx` | Still used by the revealed face highlighting, `CardEditor`, and extraction blank-safety. Only `StudySession`'s *imports* of `sentenceMatch`/`blankSentence` go away; update the stale "Used by" doc comment at sentence-match.ts:7. |
| Blank-safety in `lib/extract-cards.ts` (`normalizeExtractedCards` safe-first partition) | Constraint says "preserve existing blank-safety rules" — it protects data quality for `CardEditor` and any future mode; independent of fill-blank the UI mode. |
| `app/api/*` routes | Verified: no non-generated `app/` code reads or writes `distractors`. No route changes needed at all. |

Docs to refresh at milestone close (standard checklist): `CLAUDE.md` ("three study modes", `distractors` mentions, StudySession key-file entry), `.planning/codebase/*.md`.

---

## Recommended Build Order (each stage independently deployable + verifiable)

The ordering principle: **add-before-remove on the client, client-before-write-side overall.** Extraction continuing to write distractors during stages 1–3 is harmless (deprecated column); removing the write side first while MC was still selectable would be the only broken intermediate state — so it goes last.

**Stage 1 — Wire Active end-to-end (old modes fully intact).**
Add `'active-recall'` to the `StudyMode` union; add the mode prop + active front branch to `FlashcardMode`; `StudySession` dispatches `'active-recall'` to `FlashcardMode` and extends the keyboard `mode === 'flashcard'` grading condition. Nothing removed yet — Passive/MC/fill-blank behavior byte-identical.
*Verify:* `npm run lint`, `npm test`, e2e suite green unchanged; manual dev session in Active (reveal, grade, requeue on Again, undo, audio on reveal).

**Stage 2 — ModeSelector/StudyClient toggle rewrite.**
Replace the grid + sub-toggle with the Passive/Active toggle (Active default); simplify `onSelect`; keep `mode-flashcard` testid, add `mode-active-recall`. This removes *UI access* to MC/fill-blank while their code still compiles — the safe intermediate.
*Verify:* update `e2e/grade-flow.spec.ts` comment + `e2e/freshness-gate.spec.ts` locator; full e2e run; manual check both toggle positions + AI-practice checkbox.

**Stage 3 — Client-side deletion.**
Delete `MultipleChoiceMode.tsx`, `FillBlankMode.tsx`, `FlashcardSubMode`, and every Section-B symbol; **narrow the `StudyMode` union in the same commit** — `tsc` + ESLint's unused-import/var rules then enumerate every straggler mechanically (use the compiler as the removal checklist). Delete the recall branch from `FlashcardMode`.
*Verify:* `npm run lint` (strict — will catch dead imports), `npm test`, `npm run build`, full e2e; manual regression of Passive (bare-word-first gate for new cards, sentence-front for matured, example cycling, undo).

**Stage 4 — Write-side distractor deprecation.**
Section F changes + `tests/extract-cards.test.ts` updates in one commit (tests and prompt must move together).
*Verify:* `npm test`; optionally `scripts/prompt-eval.mts` (the v1.5 non-persisting eval harness) against a real lesson to confirm extraction output shape.

**Stage 5 — Read-side + audit cleanup.**
Sections G + H (DTO field, `cards-list` select, audit-checks class 4).
*Verify:* `npm test`, `npm run build`, e2e smoke (CardDTO shape flows through `/cards` and `/study` first paint).

---

## Anti-Patterns to Avoid

1. **Routing Active through the blanking machinery.** `blankSentence`/`sentenceMatch` blank a substring; Active hides the whole sentence. Forcing it through blank-safety would wrongly exclude sentences whose `targetForm` is single-char/multi-occurrence — sentences that are perfectly fine Active prompts.
2. **`AudioButton` on the Active front.** TTS reads the Korean answer aloud pre-reveal.
3. **Cloning `FlashcardMode` into `ActiveRecallMode.tsx`.** ~200 duplicated lines (back face + grade bar) that will drift. The "each mode owns its full action bar" convention (RESEARCH Pitfall 3, in-file docs) was about *not building a shared-slot abstraction across genuinely different bars* — MC's bar (single Next) vs flashcard's (4 grades). Active's bar is *identical* to flashcard's, so reuse-via-prop is the convention-consistent move, not a violation.
4. **Removing the write side before the UI.** MC reading empty distractors mid-migration would silently degrade to the scraped-answers fallback pool — a worse product in the interim for zero benefit.
5. **Leaving audit check class 4 alive after Stage 4.** Every newly-extracted card audits as a `'null'` distractor anomaly forever (verified behavior, audit-checks.ts:236).
6. **Dropping the DB column.** Turso schema changes are manual DDL; milestone explicitly keeps the column deprecated-in-place.
7. **Impure render additions.** The active branch must stay pure (no `Date.now()`; `isNewCard`/`chosenSentence` are already pure deriveds — reuse them).

---

## Open Questions for discuss-phase / plan-phase

1. **New-card Active prompt** (word-production via `card.back` vs always sentence translation) — recommendation above; needs user confirmation since it shapes the Core Value's Active-mode analog.
2. **Retiring Recall confirms retiring its blank-front behavior entirely** — the milestone text implies it ("toggle replaces … the old Exposure/Recall sub-toggle"), but confirm the user doesn't want Recall's word-blank behavior folded into Active somehow.
3. **Toggle UI shape** — segmented control inside the existing `Sheet` (mirroring the current sub-toggle styling at ModeSelector lines 42–66) vs two large option cards. Cosmetic; either preserves `onSelect` flow.
4. **Scope of Stage 5** (DTO/audit cleanup) — recommended in-scope (no reader remains, prevents audit noise), but it's the most deferrable stage if the milestone needs trimming.

## Sources

- Direct source reads (2026-07-13): `components/StudySession.tsx`, `ModeSelector.tsx`, `StudyClient.tsx`, `FlashcardMode.tsx`, `MultipleChoiceMode.tsx`, `FillBlankMode.tsx`, `lib/sentence-selection.ts`, `lib/sentence-match.ts` (header), `lib/extract-cards.ts` (grep-verified lines), `lib/sync.ts`, `lib/cards-list.ts`, `lib/study-cards.ts`, `lib/dto.ts`, `lib/card-style.ts`, `lib/audit-checks.ts`, `lib/generate-practice.ts`, `scripts/{local-resync.mts,reextract-lesson.mjs,audit-cards.mts}`, `tests/{extract-cards,study-cards,audit-checks}.test.ts`, `e2e/{grade-flow,freshness-gate}.spec.ts`, `prisma` schema (via generated client), `.planning/PROJECT.md` — confidence HIGH (first-party source of truth).
