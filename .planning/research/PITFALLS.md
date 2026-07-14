# Pitfalls Research

**Domain:** Adding an Active Recall (English→Korean production) study mode to an existing sentence-centric FSRS app, while deleting Multiple Choice and standalone Fill-in-the-Blank (v1.7 Active Recall Study Mode)
**Researched:** 2026-07-13
**Confidence:** HIGH for code-integration pitfalls (grounded in direct reads of `components/StudySession.tsx`, `lib/sentence-selection.ts`, `lib/sentence-match.ts`, `components/ModeSelector.tsx`, `components/StudyClient.tsx`, `components/FlashcardMode.tsx`, `lib/fsrs.ts`, `lib/extract-cards.ts`, `lib/sync.ts`, `lib/card-style.ts`, `lib/generate-practice.ts`, `e2e/grade-flow.spec.ts`); MEDIUM for FSRS/self-grading domain claims (Anki/FSRS community guidance, cross-checked against how this app actually persists review state)

**Phase legend used throughout** (matches the milestone's natural decomposition):
- **add-active** — build the Active production mode + Passive/Active toggle
- **remove-modes** — delete MultipleChoiceMode, FillBlankMode, the Exposure/Recall sub-toggle, and all dead session state
- **cleanup** — retire distractor generation in the extraction pipeline, update tests/e2e/docs

## Critical Pitfalls

### Pitfall 1: Active mode silently inverts foundation-first for brand-new cards — it needs its own gate, not `showBareFront`

**What goes wrong:**
The existing bare-word-first gate is hard-scoped to Passive: `showBareFront = mode === 'flashcard' && flashcardSubMode === 'exposure' && isNewCard && (chosenSentence?.unknownCount ?? 0) > 0` (`StudySession.tsx:428`). Active mode doesn't match that gate, so with no new logic a brand-new card (state 0/1) in Active shows "Translate: *I went to school with my friend yesterday*" — asking the learner to **produce a full Korean sentence containing a word they have never seen**, plus context words they may have only *seen once*. That is a direct violation of the project's Core Value ("what you're meant to learn is always learnable in the moment"), and since the milestone makes Active the **default**, every new card hits it.

Two distinct sub-problems hide here:
1. **The target word itself is unknown** — no amount of sentence selection fixes an unproducible target.
2. **`unknownCount` is a recognition signal, not a production signal.** The known-word threshold is FSRS state ≥ 1 ("seen at least once", PROJECT.md Key Decisions). One prior *exposure* makes a word readable context; it does not make it producible. Least-unknown ranking is still the right sentence pick for Active, but `unknownCount === 0` must not be interpreted as "the learner can produce this sentence."

**Why it happens:**
The bare-word-first machinery looks reusable ("it already handles new cards"), so the natural move is to extend the existing gate with `|| mode === 'active'`. But the gate's *output* is wrong for Active: bare Korean word on the front is an *exposure* treatment; Active's front is English. The analog for Active is a different artifact entirely — e.g. prompt with the card's English gloss (`card.back`) and ask the learner to produce **the word**, or degrade state-0/1 cards to the Passive exposure presentation for that review.

**How to avoid:**
Design the Active new-card gate as an explicit, named decision before implementation (this is a product decision, not a code detail — per the user's plan-first preference). Two defensible shapes:
- **Word-level production prompt:** for `isNewCard`, front = `card.back` (the English gloss) → "produce the Korean word"; sentence-level production only once state ≥ 2. Mirrors the existing bare-word-first philosophy in production form.
- **Passive degrade:** state 0/1 cards render the Passive exposure face even inside an Active session (precedent: Recall already degrades to Exposure when `recallBlanked === null`).
Either way, compute it as a new pure derived value (e.g. `activePromptLevel: 'word' | 'sentence'`) next to `showBareFront`, from the same inputs (`isNewCard`, `chosenSentence`), and unit-test it. Note the gate must read state from the **requeued** card (`updatedItem` carries the post-grade review back into the queue), which works automatically only if derived from `queue[0]` in render like `showBareFront` is today.

**Warning signs:**
- The Active front renders `chosenSentence.translation` unconditionally with no `isNewCard` branch anywhere in the diff
- No decision recorded about what a state-0 card shows in Active
- A dev-session test where a freshly-synced lesson's cards are studied in Active and the first thing shown is a full-sentence translation prompt

**Phase to address:** add-active (gate design is the first plan of the phase)

---

### Pitfall 2: Wiring Active through the existing `needsBlank`/Recall machinery changes which sentence gets picked

**What goes wrong:**
Active "replaces" Recall and Fill-blank, so the tempting implementation is to reuse their plumbing — set `needsBlank = true` for Active, or model Active as a new `flashcardSubMode`. But blank-safety is **irrelevant** to Active: the entire Korean sentence is hidden, so there is nothing to blank. If Active passes `needsBlank = true`, `selectSentence()` applies the blank-safe override (step 4) and silently picks a *different sentence* than Passive would for the same card — the learner gets prompted with a translation of a sentence chosen for a constraint that doesn't apply, and cards whose best (least-unknown) sentence is "unsafe" get a worse prompt for no reason. Conversely, the `recallBlanked === null → degrade to Exposure` path can misfire if Active is routed through the Recall branch of `FlashcardMode`.

**Why it happens:**
`needsBlank` currently means "this mode hides the targetForm," and Active also hides things — the semantic looks adjacent. And the Recall sub-mode's front ("hide part of the sentence") looks like a milder version of Active's front ("hide all of it").

**How to avoid:**
Active passes `needsBlank = false` into `selectSentence()` — same as Exposure. Assert this in a unit test: for a card whose least-unknown sentence is blank-unsafe, Active and Passive must select the **same index**. Bonus correctness property worth encoding: the sentence a learner is asked to produce in Active should be the same sentence they'd have been shown in Passive (least-unknown pick), so the two modes reinforce the same example. Also note the memoized `chosenIdx` has `needsBlank` in its dep array (`StudySession.tsx:395-398`) — once MC/fill-blank are gone and Recall is retired, `needsBlank` should collapse to a constant `false` and eventually disappear rather than linger as a dead parameter.

**Warning signs:**
- `needsBlank` computed as `mode === 'active' || …` anywhere
- Active implemented as a third `FlashcardSubMode` value instead of a top-level mode
- `blankSentence()`/`recallBlanked` referenced from the Active render path

**Phase to address:** add-active

---

### Pitfall 3: Self-grading the *sentence* instead of the *card* — corrupting FSRS state for the wrong item

**What goes wrong:**
`Card` is the FSRS review unit (explicitly out of scope to change). In Active, the learner produces a whole sentence and then judges "did I get it right?" If the reveal presents the Korean sentence as an undifferentiated answer, the learner will grade **whole-sentence accuracy** — pressing Again because they fumbled a context particle or word order, even though they produced the card's target item perfectly. Those lapses accumulate on the card's `CardReview` state (stability drops, lapses increment, the card loops in relearning), scheduling the *target word* as forgotten when it wasn't. Multiply across a session and Active quietly degrades the whole deck's scheduling. The inverse failure also exists: grading Good because "the gist was right" when the targetForm itself was wrong.

**Why it happens:**
Nothing in a bare reveal tells the learner *what the grade is about*. Exposure mode already solves this with copy ("Recall the meaning of the highlighted part") plus the `HighlightedSentence` targetForm marker — Active needs the equivalent, and it's easy to omit because the reveal "looks done" without it.

**How to avoid:**
The Active reveal must render the Korean sentence through `HighlightedSentence` (targetForm marked, tap-to-gloss wired like every other sentence surface) and carry explicit grade-anchoring copy: e.g. "Grade yourself on the **highlighted expression** — different word order or phrasing is fine." Keep `previewIntervalLabels` hints on the grade bar unchanged (they're computed in `handleReveal`, event-handler-safe). Related domain point (MEDIUM confidence, consistent with FSRS community guidance): grading familiarity instead of retrieval is the classic self-grade failure — the production flow actually *helps* here because the learner must commit to an answer before reveal, but only if the UI doesn't offer a reveal-first shortcut; keep the reveal a deliberate tap, exactly like today's Show Answer.

**Warning signs:**
- Active reveal renders `chosenSentence.korean` as plain text instead of `HighlightedSentence`
- No copy near the grade bar explaining the grading criterion
- User feedback that intervals feel wrong / cards keep coming back after Active sessions

**Phase to address:** add-active (the reveal design), with copy in the same plan — not deferred to polish

---

### Pitfall 4: Re-adding automatic correctness checking to a mode that exists because automatic checking failed

**What goes wrong:**
Fill-blank has `normalizeAnswer()` exact-match comparison and a correct/incorrect verdict; it's being retired partly because typed exact-match is a poor fit. A "translate this sentence" exercise has *many* valid Korean renderings (politeness level, word order, particle choices, synonyms) — any string comparison, fuzzy match, or LLM-judged verdict either rejects correct answers (frustration + dishonest Again grades) or adds an LLM round-trip to every reveal (latency + cost + a new failure mode on the study loop's hot path, which v1.2 worked hard to make instant). The optimistic-grading contract (`submitReview` is synchronous; FSRS computed client-side; save fire-and-forget) leaves no room for an async correctness verdict before grading.

**Why it happens:**
Self-grading feels "soft," and the deleted modes both had objective verdicts (`mcRating`, `fillCorrect`) — there's gravitational pull toward keeping *some* automated check. Also `stats.correct` is currently fed by `isCorrect = rating >= 3`, which tempts someone to want a "real" correctness source.

**How to avoid:**
Active is pure self-grade on the existing 4-button FSRS bar, full stop — same as Exposure. `isCorrect = rating >= 3` carries over unchanged. If production-answer feedback is ever wanted, that's a future milestone (and would go through the ephemeral `/api/generate`-style path, never the grading path). Record this as an explicit non-goal in the phase spec so it doesn't creep in at execution (matches the user's confirm-optional-scope preference).

**Warning signs:**
- A text input appearing in the Active mockup
- Any `fetch` between reveal and grade in the Active flow
- `normalizeAnswer` surviving the fill-blank deletion because "Active might use it"

**Phase to address:** add-active (as a written non-goal); remove-modes (delete `normalizeAnswer` and `fillCorrect` outright)

---

### Pitfall 5: Deleting modes by removing files instead of narrowing the type — the dispatch's `else` branch and a graveyard of dead session state

**What goes wrong:**
`StudySession`'s mode dispatch is a ternary chain whose **final `else` is `FillBlankMode`** (`StudySession.tsx:786-834`). Delete MC first while keeping the ternary shape and any non-flashcard mode value silently renders fill-blank. Worse, the mode-specific state is woven through the 837-line parent, not the sub-components: `mcOptions` useMemo, the `seed` useMemo (used **only** by `mcOptions`), `seededShuffle` (only caller: `mcOptions`), `MC_ADVANCE_MS`, `advanceTimer` + its cleanup effect, `mcSelected`/`fillInput` state (both reset in `submitReview`'s advance block), `advanceMc`, `handleMcSelect`, `mcRating`, `normalizeAnswer`, `fillSentence`/`fillTranslation`/`fillAnswer`/`fillCorrect`/`useChosenForFill`/`chosenMatch`, and three per-mode branches in `handleKeyDown` (MC's 1–4 option select, fill-blank's 1/3-only grading, MC's Enter-to-advance). Leaving any of these behind is not just clutter — `advanceTimer` is a live `setTimeout` lifecycle, and orphaned reset calls in `submitReview` reference deleted state setters.

**Why it happens:**
The v1.3 refactor deliberately kept all session state in the parent (mode components are presentational), so "delete the component file" removes ~100 lines of a mode that actually occupies ~250 lines across the parent.

**How to avoid:**
Narrow the type **first**: change `StudyMode` in `ModeSelector.tsx` to the new union (whatever it becomes — e.g. `'passive' | 'active'`) and let `tsc`/ESLint enumerate every stale reference — the compiler becomes the deletion checklist. Then delete in one atomic commit per mode: component file + parent state + derived values + keyboard branch + reset calls. After deletion, grep for the dead identifiers (`mcOptions`, `seededShuffle`, `MC_ADVANCE_MS`, `fillInput`, `normalizeAnswer`, `advanceTimer`) — zero hits expected in `components/`. The queue/undo/requeue pipeline (`submitReview`, `handleUndo`, `REQUEUE_GAP`, `postReviewWithRetry`) is mode-agnostic and must be verifiably untouched — the grade-flow e2e spec is the regression net for exactly this.

**Warning signs:**
- `npm run build` passes but grep still finds `seededShuffle` or `MC_ADVANCE_MS`
- A ternary dispatch surviving with an `else` branch after only two modes exist
- `submitReview`'s advance block still calling `setFillInput('')`/`setMcSelected(null)` for deleted state

**Phase to address:** remove-modes

---

### Pitfall 6: Grep-deleting "fill-blank" nukes a *different* fill-blank — the AI-practice card type

**What goes wrong:**
The string `'fill-blank'` names **two unrelated concepts** in this codebase: (a) the study mode being deleted, and (b) an AI-practice card *type* generated by `lib/generate-practice.ts` (`type: 'example-sentence' | 'fill-blank' | 'transformation'`) and styled by `lib/card-style.ts`'s `TYPE_BADGE_CLASS['fill-blank']` (orange badge). A search-and-destroy pass on "fill-blank" deletes the badge entry and/or mangles the practice-generation prompt, breaking AI practice rendering — a feature that is *not* in this milestone's scope. Similarly, "multiple-choice" appears in `lib/audit-checks.ts` comments/test rationale about distractor anomalies (legacy-data checks that should survive).

**Why it happens:**
Identical string, different domain. The mode and the practice-card type were named independently.

**How to avoid:**
Scope deletions by *symbol*, not string: the mode lives in `StudyMode`, `ModeSelector`, `StudySession`, `FillBlankMode.tsx`. Explicitly list the survivors in the removal plan: `lib/generate-practice.ts` (untouched), `lib/card-style.ts` badge entries (untouched), `lib/audit-checks.ts` distractor checks (untouched — the column still holds legacy data worth auditing). Separately, decide how `PracticeCard`s render in Active: they have no sentences and no FSRS state; today they flow through the flashcard faces via the no-sentence fallback. Simplest correct answer: practice items always render the Passive face regardless of session mode (they're ungraded-into-FSRS extras; `undoRef` is already nulled for them).

**Warning signs:**
- `lib/card-style.ts` or `lib/generate-practice.ts` appearing in the remove-modes diff
- AI practice cards rendering with the gray default badge after the milestone
- Distractor audit tests deleted "because multiple choice is gone"

**Phase to address:** remove-modes (survivor list in the plan); cleanup (verify)

---

### Pitfall 7: The e2e suite and its seed assumptions break the moment ModeSelector changes

**What goes wrong:**
`e2e/grade-flow.spec.ts` clicks `page.getByTestId('mode-flashcard')` and its whole loop design encodes Exposure-mode behavior ("Exposure is the default sub-mode (D-03)"); the milestone replaces the 3-mode grid + sub-toggle with a Passive/Active toggle, so that testid and flow disappear. Additionally, the e2e seed creates **brand-new cards** (first grade treated as new — see the spec's own header comment), which is precisely the population Pitfall 1's gate treats specially: if Active becomes the default and the spec is naively updated to "click through the default mode," it now exercises the new-card Active gate, and its reveal/grade assertions (`reveal-btn`, `grade-good` testids) may not match the new face. The freshness-gate specs also assert against `/study`'s select-mode surface (`due-count`, `start-studying-btn`) — lower risk, but the mode sheet flow is in the path.

**Why it happens:**
The e2e suite is one milestone old; this is the first UI change since it was written, so there's no habit yet of treating `data-testid` contracts as part of the change surface.

**How to avoid:**
Treat testids as an API: inventory every `data-testid` the specs consume (`mode-flashcard`, `reveal-btn`, `grade-*`, `start-studying-btn`, `due-count`, `session-complete-heading`, `card-front-word`, `study-more-btn`) and decide per-id: keep, rename, or replace. Update `grade-flow.spec.ts` in the **same phase** as the ModeSelector rewrite — an intentionally-red intermediate state is fine within a phase but the phase can't close red. Add one new Active-flow spec (prompt shown in English → reveal shows Korean → grade) since Active is now the default path real usage takes; reuse the existing bounded loop-until-complete pattern (never a fixed grade count — the FSRS learning-step nondeterminism lesson from Phase 27).

**Warning signs:**
- `npx playwright test` not run after the ModeSelector rewrite
- A "temporary" `test.skip` on grade-flow that survives the milestone
- New Active UI shipping with zero e2e coverage while the deleted modes' coverage was the only session coverage

**Phase to address:** remove-modes (grade-flow update travels with the ModeSelector change); add-active (new Active spec)

---

### Pitfall 8: Half-retiring distractors — the four-site pipeline change that looks like a one-liner

**What goes wrong:**
"`Card.distractors` no longer written" touches a coordinated chain, and partial edits each fail differently:
1. **`lib/extract-cards.ts` prompt** demands "EXACTLY 3 plausible-but-wrong English meanings" per card — leave it and every sync keeps paying Opus tokens (and adaptive-thinking time) to generate data nobody reads, on a route already squeezed under the 60s Vercel limit.
2. **`ExtractionSchema` (zod)** has `distractors: z.array(z.string())` as a required field feeding native structured outputs — remove it from the prompt but not the schema and the model is *forced* by the output format to fabricate distractors anyway (structured outputs constrain generation to the schema); remove it from the schema but not `normalizeExtractedCards` and the warn-on-`<3` check (`extract-cards.ts:425-427`) fires on every card.
3. **`lib/sync.ts`** builds `distractorsJson` and writes it in both the create and update branches (lines 165–219) — the actual "stop writing" site.
4. **`tests/extract-cards.test.ts`** encodes the current shape and will go red on any of the above.
Also: the truncation-salvage path (`parseExtractionResponse`) parses whatever raw shape the model emitted — it must tolerate cards *with or without* a distractors key during the transition.

**Why it happens:**
The milestone phrasing ("column left in place, not written") sounds like deleting one `distractors:` line in sync.ts. The precedent (`clozeSentence`/`clozeAnswer` deprecation) predates structured outputs, so there's no prior example of retiring a *schema* field.

**How to avoid:**
One cleanup plan owning all four sites atomically: drop the field from prompt + zod schema + `normalizeExtractedCards` + sync writes + tests in a single commit; mark `Card.distractors` with the same `@deprecated`-style doc comment pattern as the cloze columns in `prisma/schema.prisma` and `lib/dto.ts` (`CardDTO.distractors` stays — the column is still selected by `lib/cards-list.ts`; its comment there already anticipates this). Validate with the existing non-persisting eval script pattern (`scripts/prompt-eval.mts`) before trusting the changed extraction schema against a real lesson — schema changes to structured outputs are exactly what that script exists for. Keep `lib/audit-checks.ts`'s distractor anomaly class (it audits legacy rows) but downgrade its findings to informational in the report copy.

**Warning signs:**
- Sync logs full of "has N distractor(s), expected 3" warnings post-change
- Extraction latency unchanged after "removing" distractors (prompt still asks for them)
- A red `extract-cards.test.ts` "fixed" by re-adding the schema field instead of updating the test

**Phase to address:** cleanup

---

### Pitfall 9: Lint traps specific to the new reveal UI (`react-hooks/purity`, `set-state-in-effect`, and the parent-owned refs contract)

**What goes wrong:**
Three concrete traps for a new `ActiveMode` (or extended `FlashcardMode`):
1. **Purity:** `previewIntervalLabels()` calls `new Date()` — it is documented "must be called from event handlers, not during render" and today runs only inside `handleReveal`. Any new "compute hints for the Active grade bar" code that lifts it into render or a `useMemo` violates `react-hooks/purity`. Same for any per-card prompt variety: must use the existing `hashStr(cardId) + reps` seeded pattern, never `Math.random()`.
2. **set-state-in-effect:** the natural "auto-play the sentence audio when revealed" feature written as `useEffect(() => { if (revealed) play() }, [revealed])` combines a side effect keyed on state with (typically) a `setPlaying` call — the exact shape the lint rule and this codebase's conventions forbid. Audio start belongs in `handleReveal` (event handler), or is simply omitted — `AudioButton` is already tap-to-play and mounted next to every Korean sentence.
3. **The measurement-refs contract:** the parent's `useLayoutEffect` measures `frontRef`/`backRef` to drive the 3D flip's dynamic height (`StudySession.tsx:363-366`). If the Active face doesn't attach the threaded `frontRef`/`backRef` (or a new mode component doesn't accept them), `cardHeight` sticks at the 220px default and long prompts/answers clip — a visual bug that only shows on real multi-line content, not short test cards. Similarly `againBtnRef` must land on the Again button or the reveal-focus a11y behavior (WR-02) silently dies. Mode components own **no session state** (REFACTOR-01 contract) — the only hook allowed is `useWordTap()`.

**Why it happens:**
All three constraints are invisible in the sub-component's own file — they're contracts with the parent, documented in comments a new file won't inherit.

**How to avoid:**
Start the new mode component from `FlashcardMode.tsx` as the template (it threads all three refs and demonstrates the `useWordTap`-only hook rule). Run `npm run lint` before UAT, not after. Verify dynamic height with a real long-translation card in the dev DB, not the e2e fixture.

**Warning signs:**
- `previewIntervalLabels` appearing outside `handleReveal`
- Any `useEffect` in the new mode component
- Cards visually clipping on long sentences in Active only

**Phase to address:** add-active

---

### Pitfall 10: Prompt/answer mismatch — the reveal must pin `chosenSentence`, and zero-sentence cards need a defined prompt

**What goes wrong:**
Two edge paths inherited from the flashcard back-face:
1. **Example cycling:** the revealed back renders `displayedSentence` (which "See another example →" advances via `exampleOffset`), while the Active *prompt* was `chosenSentence.translation`. If Active reuses the back-face as-is, one tap of the cycle button makes the displayed Korean answer a *different sentence* than the English the learner just translated — actively confusing in a production mode. Either hide the cycle button in Active or make cycling advance the prompt for the *next* presentation only.
2. **No sentences:** `chosenSentence` is null for sentence-less cards (`chosenIdx === -1`) and for all `PracticeCard`s. Passive falls back to the bare-word face; Active has no defined fallback — `chosenSentence.translation` is a null-deref or a blank front. The natural fallback is the word-level production prompt from Pitfall 1 (`card.back` → produce the word), which conveniently makes the zero-sentence case and the new-card case the same code path.

**Why it happens:**
These paths are invisible in the happy-path design ("show translation, reveal sentence") and the current deck mostly has 1–3 sentences per card — but the extraction pipeline only *code-enforces* ≥1 blank-safe sentence for persisted cards, practice cards have zero, and one zero-sentence card already existed once (fixed in v1.5).

**How to avoid:**
Make the Active prompt derivation total: a pure function from `(card, chosenSentence, isNewCard)` → prompt descriptor, unit-tested for null-sentence, new-card, and practice-card inputs. Pin the revealed answer to `chosenSentence` (not `displayedSentence`) in Active.

**Warning signs:**
- `displayedSentence` referenced in the Active reveal
- No test for `sentences: []` in the new prompt-selection helper
- "See another example →" visible under an Active reveal

**Phase to address:** add-active

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Leave `Card.distractors` column + `CardDTO.distractors` in place, unwritten | No Turso DDL (painful here — no `prisma migrate`), matches cloze-column precedent | Trivial — dead column, documented deprecation | Always (this is the plan; document it in schema comment) |
| Keep extraction generating distractors "for now", only stop the sync write | Smaller diff, no zod/prompt/eval work | Opus tokens + latency on every sync forever; structured outputs *force* generation of schema fields | Never — retire the whole chain in cleanup (Pitfall 8) |
| Keep `StudyMode` as a 3-value union with dead branches "until Active stabilizes" | Avoids type-ripple during add-active | Silent `else`-branch dispatch to FillBlank (Pitfall 5); every future reader re-learns which modes are real | Never past the remove-modes phase |
| Keep `needsBlank`/`selectSentence`'s blank-override parameter after Recall/fill-blank are gone | `lib/sentence-selection.ts` and its tests untouched | A dead parameter in the single source of truth for sentence picking; future callers guess wrong | Acceptable within the milestone; remove in cleanup with its tests updated |
| Reuse `FlashcardMode.tsx` with more conditional props instead of a dedicated Active face | One less file | The component already has 4-way front-face branching; +Active makes it unreadable and re-entangles what v1.3 decoupled | Acceptable only if the Active face shares >70% of the flip/measure/grade-bar structure — decide in add-active planning, don't drift into it |
| Skip a new Active e2e spec ("grade-flow covers the session machinery") | Faster phase close | The default study path of the app has zero automated coverage; grade-flow now covers the *non-default* mode | Never — Active is the new default |

## Integration Gotchas

Internal seams this milestone crosses (no new external services):

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `lib/sentence-selection.ts` (`selectSentence`) | Passing `needsBlank: true` for Active; or bypassing `selectSentence` with ad-hoc pick logic in the new mode | Active = `needsBlank: false`; same least-unknown pick as Passive; keep the memoized `chosenIdx` as the single call site |
| `StudySession` queue/undo pipeline | Touching `submitReview`/`handleUndo`/`postReviewWithRetry` while deleting modes (they reference `setFillInput`/`setMcSelected` in the advance block) | Delete the mode-state resets surgically; queue/requeue/undo/idempotency-key logic is mode-agnostic and must diff-out clean except those reset lines |
| `ModeSelector` → `StudyClient` → `StudySession` prop chain | Renaming the mode union in one file and adapting the others "later"; leaving `flashcardSubMode` threading half-removed | One atomic type change; `handleModeSelect` signature, `StudyClient` state, `StudySession` Props, and `FlashcardMode` props all in the same commit |
| `FreshnessWatcher` gated prop adoption in `StudyClient` | Assuming the adoption gates care about mode (they gate on `phase === 'select-mode'`) and "fixing" them during the refactor | Leave both gate blocks (`prevInitialCards`, `prevFreshStudy`) byte-identical — they're phase-gated, not mode-gated, and were hard-won in v1.6 |
| `e2e/grade-flow.spec.ts` + seed fixture | Updating the spec's clicks but not its assumptions (seed cards are state-0 new cards → they hit the Active new-card gate if Active is default) | Decide which mode the spec drives explicitly; add an Active spec against known-state fixture cards |
| Anthropic structured outputs (`ExtractionSchema`) | Removing distractors from the prompt but not the zod schema (model still forced to emit them) or vice versa (warn spam) | Prompt + schema + normalizer + sync write + tests in one commit; validate with `scripts/prompt-eval.mts` before trusting it (Pitfall 8) |
| TTS / `AudioButton` | Auto-playing the answer audio via an effect on `revealed` (lint + convention violation) | Reuse tap-to-play `AudioButton` next to the revealed sentence; if auto-play is wanted, trigger inside `handleReveal` |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Adding an LLM/translation-check call between reveal and grade | Grade bar feels laggy; violates the v1.2 optimistic-grading win | Pitfall 4 — Active is pure self-grade, zero network on the grade path | Immediately, on every card |
| Recomputing prompt selection every render instead of extending the existing memo pattern | No visible symptom at 20-card sessions; wasted `sentenceMatch` scans | Derive the Active prompt from the already-memoized `chosenIdx`; any new selection logic goes in the pure lib + `useMemo` | Only at pathological deck sizes — but the memo pattern is a codebase convention regardless (PERF-03) |
| e2e perf budgets tripping after ModeSelector rewrite | `e2e/perf.spec.ts` reds that look unrelated to the milestone | Run the full e2e suite (not just grade-flow) at each phase close; budgets are median-of-5 and generous | Unlikely — but a red budget is signal, not noise, per Phase 27's falsifiability discipline |

## Security Mistakes

Nothing in this milestone adds attack surface (no new routes, no new inputs, no new env). One hygiene item:

| Mistake | Risk | Prevention |
|---------|------|------------|
| Deleting the `distractors` JSON.parse try/catch guard patterns while removing `mcOptions`, then later re-reading the column elsewhere unguarded | Corrupt legacy JSON row crashes a render | The column keeps legacy data; if anything ever re-reads it, it must re-wrap in try/catch (existing convention). Cleanup should leave `lib/audit-checks.ts`'s hardened parser as the only reader |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Full-sentence production prompt on a never-seen word (Pitfall 1) | Un-answerable card; violates the app's core promise; trains dishonest "Good" grades | Word-level prompt or Passive degrade for state 0/1 cards — explicit gate |
| No grading criterion on the Active reveal (Pitfall 3) | Learner grades whole-sentence perfection → over-lapsing → deck feels punishing | Highlight targetForm + "grade the highlighted expression" copy |
| Grading copy that implies exact-match ("Was your answer correct?") | Learner pressing Again for valid alternative phrasings | Copy acknowledging production variance: "different phrasing is fine" |
| Losing the Exposure/Recall mental model without explanation | Existing single user has habits around the sub-toggle; Recall's word-blank drill disappears | The Passive/Active toggle descriptions should do the work the old mode grid's `desc` lines did ("word shown, tap to reveal" vs "translate from English"); one-line framing, not a tutorial |
| English prompt rendered in Korean-optimized typography | Subtle: `hangul-sentence` class (line-height 1.7, Korean font stack) applied to English text looks off | Active front is English — use the app's standard text styles, keep `hangul`/`hangul-sentence` classes for the revealed Korean only |
| "See another example →" visible in Active reveal (Pitfall 10) | Answer no longer matches the prompt just translated | Pin reveal to `chosenSentence`; hide cycling in Active |

## "Looks Done But Isn't" Checklist

- [ ] **Active new-card gate:** demo works on matured cards — verify with a **freshly-synced, never-reviewed** card that the prompt degrades per the recorded decision (Pitfall 1)
- [ ] **Sentence pick parity:** for a card whose least-unknown sentence is blank-unsafe, Active picks the same sentence as Passive — unit test exists (Pitfall 2)
- [ ] **Reveal anchoring:** revealed Korean goes through `HighlightedSentence` with grade-criterion copy, and `againBtnRef` focus + `frontRef`/`backRef` measurement still work (Pitfalls 3, 9)
- [ ] **Requeued cards:** grade a new card Again in Active → it returns ~4 cards later → its prompt reflects the **updated** review state, not the pre-grade snapshot
- [ ] **Undo in Active:** undo after an Active grade restores the un-revealed front (the `revealed=false` snapshot behavior) — exercised manually, since HIST-03-style coverage is thin here
- [ ] **Dead-symbol sweep:** grep for `mcOptions`, `seededShuffle`, `MC_ADVANCE_MS`, `mcSelected`, `fillInput`, `normalizeAnswer`, `advanceTimer`, `FlashcardSubMode`, `recallBlanked` → zero hits in `components/` post-removal (Pitfall 5)
- [ ] **Survivors intact:** `lib/generate-practice.ts`, `lib/card-style.ts` badge map, `lib/audit-checks.ts` distractor checks unchanged (Pitfall 6)
- [ ] **Distractor chain:** prompt, zod schema, `normalizeExtractedCards`, `sync.ts` writes, and `tests/extract-cards.test.ts` all changed together; `scripts/prompt-eval.mts` run against a real lesson (Pitfall 8)
- [ ] **Full e2e suite green** (smoke + freshness + grade-flow + perf), not just the specs that were edited (Pitfall 7)
- [ ] **Docs refreshed:** `CLAUDE.md` and `.planning/codebase/*.md` describe three modes + Exposure/Recall in ~15 places — milestone-close doc refresh is load-bearing this time, not cosmetic
- [ ] **Zero-sentence + practice cards render in Active** without null-deref (Pitfall 10)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| FSRS state polluted by mis-graded Active reviews (Pitfall 3 shipped) | MEDIUM | `ReviewLog` is append-only with per-review state — identify affected cards by date range; no automated rollback exists, but low volume (single user) allows manual re-grading or accepting FSRS's self-correction over subsequent reviews. Fix the copy/highlight first |
| Deleted a survivor (badge entry / practice prompt / audit check) | LOW | Git revert of the specific hunk; all three are pure code with tests |
| Structured-outputs schema change breaks extraction | LOW-MEDIUM | Extraction is sync-time only (daily cron + manual); revert the schema commit; `parseExtractionResponse` salvage path and per-lesson failure reporting already contain the blast radius; `contentHash` idempotency means re-sync is safe |
| Active default frustrates real study (new-card gate wrong) | LOW | The toggle keeps Passive one tap away; adjust the gate constant (state threshold) — it's a pure derived value by design |
| e2e suite red at phase close | LOW | Specs and UI changed in the same phase (Pitfall 7 prevention); worst case, the diff that broke them is the same phase's diff — no archaeology |

## Pitfall-to-Phase Mapping

Recommended phase order: **remove-modes → add-active → cleanup.** Deleting first shrinks the 837-line `StudySession` integration surface Active must land in (no `mcOptions`/`seed`/fill state to work around), and the type-narrowing pass (Pitfall 5) produces the definitive stale-reference inventory before new code is written. The e2e suite stays meaningful throughout: grade-flow is updated with the ModeSelector change, the Active spec lands with Active. If the roadmap instead adds Active first, Pitfalls 2 and 5 get strictly harder (Active must coexist with the machinery it replaces).

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1 — Active inverts foundation-first for new cards | add-active | Unit test on the gate + manual UAT with a never-reviewed card |
| 2 — Active wired through `needsBlank`/Recall | add-active | Sentence-pick parity unit test (Active idx === Passive idx) |
| 3 — Grading the sentence, not the card | add-active | Reveal renders `HighlightedSentence` + criterion copy; UAT check |
| 4 — Auto-correctness creep | add-active | Written non-goal in SPEC; no fetch between reveal and grade in the diff |
| 5 — File-deletion instead of type-narrowing | remove-modes | tsc-driven inventory; dead-symbol grep = 0 hits |
| 6 — Grep-delete hits AI-practice "fill-blank" | remove-modes | Survivor files absent from diff; AI practice badge renders |
| 7 — e2e breaks with ModeSelector | remove-modes + add-active | Full Playwright suite green at each phase close |
| 8 — Half-retired distractor chain | cleanup | Single atomic commit across 4 sites; `prompt-eval.mts` run; sync logs clean |
| 9 — Purity / set-state-in-effect / refs contract | add-active | `npm run lint` clean; long-sentence height check in dev |
| 10 — Prompt/answer mismatch + null sentence | add-active | Total-function unit tests (null sentence, practice card, new card) |

## Sources

- Direct code reads (HIGH confidence): `components/StudySession.tsx`, `components/StudyClient.tsx`, `components/ModeSelector.tsx`, `components/FlashcardMode.tsx`, `components/MultipleChoiceMode.tsx`, `components/FillBlankMode.tsx`, `lib/sentence-selection.ts`, `lib/sentence-match.ts`, `lib/fsrs.ts`, `lib/extract-cards.ts`, `lib/sync.ts`, `lib/card-style.ts`, `lib/generate-practice.ts`, `lib/audit-checks.ts`, `lib/cards-list.ts`, `lib/dto.ts`, `e2e/grade-flow.spec.ts` — all claims about gates, memo deps, dispatch shape, testids, and the distractor pipeline verified against source on 2026-07-13
- `.planning/PROJECT.md` (HIGH): Core Value, known-threshold decision (state ≥ 1), v1.7 milestone scope, `Card` = review unit out-of-scope boundary, optimistic-grading and REFACTOR-01 decisions
- FSRS/Anki self-grading guidance (MEDIUM): [Anki FSRS FAQ](https://faqs.ankiweb.net/frequently-asked-questions-about-fsrs.html) (dishonest grades → mis-scheduling; Hard is a passing grade), [fsrs4anki tutorial](https://github.com/open-spaced-repetition/fsrs4anki/blob/main/docs/tutorial.md), [Migaku — Spaced Repetition in 2026](https://migaku.com/blog/language-fun/spaced-repetition-in-2026-how-it-actually-works) (grading familiarity vs. retrieval — commit to an answer before reveal)

---
*Pitfalls research for: v1.7 Active Recall Study Mode (add production mode, remove Multiple Choice + Fill-in-the-Blank)*
*Researched: 2026-07-13*
