# Feature Research

**Domain:** Active-recall / production study mode (L1 English prompt → produce L2 Korean sentence) inside an existing single-user FSRS flashcard app (v1.7 milestone)
**Researched:** 2026-07-13
**Confidence:** MEDIUM (web findings cross-verified across Anki community practice, Glossika/Clozemaster product mechanics, and SRS-community pitfall discussions; per the classify-confidence seam, cross-verified web = MEDIUM)

## Scope Note

This is a **subsequent-milestone** research file; it replaces the v1.6 (freshness/E2E) FEATURES.md, now superseded. Existing features (Passive flashcard exposure, FSRS grade bar, sentence selection, AudioButton, tap-to-gloss, bare-word-first gate) are NOT re-researched — this file maps only the new **Active production mode**, the **Passive/Active toggle**, and the **retirement of Multiple Choice / Fill-in-the-Blank**, plus their dependencies on existing code.

## How Production Exercises Actually Work in Real Products

The canonical production loop — converged on independently by Anki community practice and Glossika's product — is exactly what this milestone proposes:

1. **Prompt:** the native-language sentence (Glossika shows/plays the English sentence once).
2. **Produce:** the learner recalls/says the target sentence mentally or aloud — *before* any reveal.
3. **Reveal:** the full target sentence appears **with native audio** (Glossika plays the target audio twice on reveal).
4. **Self-assess:** difficulty feedback drives scheduling (Glossika's "too hard/too easy"; Anki's Again/Hard/Good/Easy).

Self-graded reveal is not a lazy shortcut — it is the **standard** mechanic for whole-sentence production, because a natural English sentence has *many* correct Korean renderings. Automated scoring requires a many-to-one accepted-answers database (Duolingo's approach, built by a content team) or it punishes correct production. Anki's design explicitly leans on the learner as judge ("Again", not "Wrong"). The known weakness of self-grading is honesty drift ("I was basically right"), and the known mitigation is UX, not tech: force the produce-then-reveal sequence and make the grade bar frame difficulty, not correctness — both of which this app already does.

Two structural facts matter for this app specifically:

- **Production is harder than recognition.** Anki's canonical answer is *separate cards per direction with independent scheduling*. This app deliberately shares one FSRS state per Card (PROJECT.md: "Card stays the review unit"). Consequence: flipping a mature deck to Active will produce a wave of Again/Hard grades and FSRS will compress intervals — this is *self-correcting and correct behavior* (the memory being scheduled is now the production memory), but expect a temporary review-load spike and don't treat it as a bug.
- **Producing a sentence containing a never-seen word is impossible.** The app's own Core Value ("what you're meant to learn is always learnable in the moment") demands a new-card on-ramp inside Active mode — the analog of the existing `showBareFront` gate.

## Feature Landscape

### Table Stakes (The Mode Feels Broken Without These)

| Feature | Why Expected | Complexity | Notes / Dependencies |
|---------|--------------|------------|----------------------|
| English-prompt → tap-to-reveal → self-grade loop | The canonical production mechanic (Anki, Glossika); this IS the feature | LOW | Structurally identical to `FlashcardMode`'s reveal flow with a different front face. Reuse the reveal/grade plumbing; grade bar (`submitReview`, optimistic FSRS, undo, requeue) unchanged |
| Prompt = the **chosen sentence's** `translation` | Consistency with Passive: same least-unknown sentence selection means the Korean you're asked to produce is the one whose context words you know | LOW | Direct reuse of `lib/sentence-selection.ts` (`chosenSentence` + `unknownCount`); every `Sentence` already has `translation` |
| Target cue on the prompt (card's English `back` visible alongside the sentence translation) | The #1 documented pitfall of L1→L2 cards is prompt ambiguity — an English sentence alone doesn't tell you *which* word/grammar point is being tested, especially for grammar cards where the English gives no hint of the pattern | LOW | `card.back` (and `card.type` badge) shown as a sub-line under the English sentence, e.g. "using: ~(으)려고 (intention)". Data already on `CardDTO` |
| Reveal shows full Korean sentence with `targetForm` highlighted + audio button | Glossika plays target audio on every reveal; highlight tells the learner what the tested item was; matches Passive's back-of-card | LOW | Reuse `HighlightedSentence` + `AudioButton` exactly as Passive's back face does |
| Tap-to-gloss on the revealed Korean | Already app-wide on every Korean sentence; its absence in the new mode would read as a regression | LOW | Wire `onWordTap` from `useWordTap()` — same as existing modes |
| New-card on-ramp inside Active (brand-new cards don't get whole-sentence production) | Core Value: producing a sentence around a never-seen word is unlearnable in the moment. Community sequencing consensus is "recognition first, production second" | MEDIUM | The Active analog of `showBareFront`: for state 0/1 cards, degrade the prompt to **word-level production** (English `back` → produce the bare Korean word) or fall back to a Passive-style exposure card for that review. Depends on `card.review.state` (already in DTO) — same signal the existing gate uses |
| Passive/Active toggle replaces the 3-mode grid + Exposure/Recall sub-toggle | Milestone-defined; two-way toggle is simpler than the current grid | LOW–MEDIUM | `ModeSelector` rewrite; `StudyClient` mode plumbing simplifies (delete `MultipleChoiceMode.tsx`, `FillBlankMode.tsx`, distractor selection, their tests). Deletion is easy; the care point is untangling the Exposure/Recall sub-toggle state without disturbing Passive behavior |
| Passive behavior byte-for-byte unchanged | Milestone-defined; Passive is the fallback and the new-card on-ramp | — | Regression risk lives in the ModeSelector/StudySession refactor, not in new code. The e2e grade-flow spec (`e2e/grade-flow.spec.ts`) guards the grade loop |

### Differentiators (Valuable, Cheap for THIS App Because the Parts Exist)

| Feature | Value Proposition | Complexity | Notes / Dependencies |
|---------|-------------------|------------|----------------------|
| Auto-play Korean TTS on reveal | Glossika's reveal *is* audio-first; hearing the answer immediately closes the produce→confirm loop without a second tap | LOW | The reveal tap is a user gesture, so `new Audio(url).play()` inside the handler is iOS-Safari-safe. Reuse `/api/tts` + Blob cache; degrade silently on 503 like `AudioButton` does. Make it a natural default, not a setting |
| Remember last-used toggle position | Single user, one habit; re-selecting Active every session is friction | LOW | `localStorage` (like `theme`) — no DB setting, no API change |
| Progressive hint (one tap shows the bare Korean target word; second tap reveals the full sentence) | Scaffolds the "I know the word but not the conjugation" middle state — the self-grade becomes better calibrated (Hard vs Again) | MEDIUM | Purely client-side; `card.front` is already on the DTO. Adds a third UI state to the card face — defer if the toggle refactor is already touchy |
| Word-level Active for new cards framed as "first production" (distinct visual treatment) | Makes the new-card on-ramp feel intentional rather than inconsistent | LOW | Copy + styling on top of the table-stakes on-ramp |

### Anti-Features (Explicitly Do NOT Build in v1.7)

| Feature | Why Requested | Why Problematic Here | Alternative |
|---------|---------------|----------------------|-------------|
| Typed input with fuzzy/exact answer matching | "Forces genuine retrieval; self-grading can be cheated" | The many-valid-answers problem: one English sentence maps to many correct Korean renderings; Korean agglutination + optional particles + speech-level variation make string matching brittle. Duolingo solves this with a curated accepted-answers DB per sentence — a content pipeline, not a feature. For one user, it punishes correct production | Self-graded reveal (already the FSRS foundation). The produce-before-reveal UX is the honesty mechanism |
| LLM equivalence checking ("is my Korean sentence correct?") | Claude is already wired in; tempting | Adds LLM latency + cost inside the grade loop that v1.2 made deliberately instant (optimistic sync grading); a wrong "incorrect" verdict is worse than no verdict; needs typed input first (see above) | If ever wanted, a *post-reveal, optional, non-blocking* "check my attempt" affordance in a later milestone — never in the grade path |
| Speech recording / pronunciation scoring | Glossika/Clozemaster have record-yourself modes | Whole scoring stack (mic permissions, ko-KR ASR reliability, storage); the existing TTS covers the listening half; speaking aloud before reveal costs nothing and needs no feature | Learner speaks aloud during the produce step; TTS on reveal is the model answer |
| Separate FSRS state per direction (Passive vs Active as two review rows) | Anki's canonical design; production and recognition are different memories | Explicitly out of scope in PROJECT.md ("Card stays the review unit"); doubles daily reviews; requires a Turso manual-DDL migration + touching `CardReview`, `ReviewLog`, undo, history, stats | Accept shared state. FSRS self-corrects: harder Active grades compress intervals. Document the expected transient review-load spike so it isn't misread as a bug |
| Partial-credit scoring (numeric %, per-word diff of attempt vs answer) | "I got 80% of it" | Requires captured input (see typed input); FSRS already encodes partial credit as **Hard** | The 4-grade bar *is* the partial-credit instrument; `formatInterval` mastery copy already frames it |
| Keeping Fill-in-the-Blank as a third toggle option "just in case" | Loss aversion | Defeats the milestone's simplification; blank-production is a strict subset of whole-sentence production; three-way toggle re-complicates ModeSelector | Delete per milestone. Blank-safety machinery (`sentence-match.ts`) stays — Passive Recall-style rendering and extraction still use it |
| New DB columns/settings for the mode | Habit of persisting everything | No server-side behavior differs between Passive and Active — same due queue, same review writes. `Card.distractors` goes deprecated-in-place (established `clozeSentence` pattern), avoiding a Turso DDL entirely | Toggle preference in `localStorage`; zero schema change for the whole milestone |

## Feature Dependencies

```
Passive/Active toggle (ModeSelector rewrite)
    └──requires──> deletion of MultipleChoiceMode / FillBlankMode / Exposure-Recall sub-toggle
                       └──requires──> test cleanup (distractor selection, mode-split tests)

Active mode card face
    ├──requires──> chosenSentence.translation        (lib/sentence-selection.ts — exists)
    ├──requires──> card.back target cue              (CardDTO — exists)
    ├──requires──> HighlightedSentence + AudioButton (exist)
    ├──requires──> FSRS grade bar / submitReview / undo / requeue (exist, unchanged)
    └──requires──> new-card on-ramp (state 0/1 word-level prompt)
                       └──requires──> card.review.state (DTO — exists; same signal as showBareFront)

Auto-play on reveal ──enhances──> Active mode card face   (gesture-gated, degrades silently)
Progressive hint    ──enhances──> Active mode card face   (client-only, deferrable)

Typed-input scoring ──conflicts──> optimistic instant grading (v1.2 UX-01)
Per-direction FSRS  ──conflicts──> "Card stays the review unit" (PROJECT.md Out of Scope)
```

### Dependency Notes

- **Active mode is a sibling of `FlashcardMode`, not a rewrite of the session.** Every hard part (queue, grading, undo, requeue, audio, gloss, sentence choice) already exists and is mode-agnostic after the v1.3 `StudySession` decomposition. The new mode is essentially a new front face + reveal face.
- **The new-card on-ramp depends on the same signals as `showBareFront`** (`review.state`, and optionally `unknownCount`), so no new server annotation is needed — `getStudyCards()` output is already sufficient.
- **Deletion order matters less than toggle-state care:** Multiple Choice / Fill-Blank removal is mechanical; the fragile part is `StudyClient`/`ModeSelector` state simplification without perturbing Passive (guarded by the existing grade-flow e2e spec — extend it with an Active-path variant).
- **Shared FSRS state is a deliberate accepted tradeoff**, not an oversight — record it as a Key Decision so a future "why are my intervals shorter since v1.7?" question has an answer.

## MVP Definition

### Launch With (v1.7)

- [ ] Passive/Active toggle on mode-select (replaces 3-mode grid + Exposure/Recall sub-toggle) — the milestone's spine
- [ ] Active loop: English sentence translation + target cue (card `back`) → tap to reveal Korean sentence (highlighted `targetForm`) + audio + tap-to-gloss → same FSRS grade bar — the canonical production mechanic
- [ ] New-card on-ramp: state 0/1 cards get word-level production (English gloss → bare Korean word), not whole-sentence — Core Value requires it
- [ ] Auto-play TTS on reveal — table-stakes-adjacent (Glossika's reveal is audio-first) and nearly free
- [ ] Multiple Choice fully deleted; Fill-in-the-Blank retired; `distractors` deprecated-in-place; tests updated
- [ ] Passive unchanged, verified by extending the existing grade-flow e2e spec

### Add After Validation (v1.7.x)

- [ ] Remember last-used toggle in `localStorage` — add once the toggle's default (Active) is confirmed as the right daily habit
- [ ] Progressive hint (bare target word before full reveal) — add if self-grading feels miscalibrated on long sentences in real use

### Future Consideration (v2+)

- [ ] Post-reveal optional LLM "check my attempt" — only if typed/spoken capture is ever added; never in the grade path
- [ ] Audio-only prompt variant (listening comprehension direction) — a different skill, different milestone
- [ ] Per-direction scheduling — only if shared-state mis-scheduling is actually *felt*, which for a single learner it likely won't be

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Active reveal loop (prompt/cue/reveal/grade) | HIGH | LOW | P1 |
| Passive/Active toggle + mode deletions | HIGH | MEDIUM | P1 |
| New-card on-ramp (word-level production) | HIGH | MEDIUM | P1 |
| Target cue (card `back` on prompt) | HIGH | LOW | P1 |
| Auto-play TTS on reveal | MEDIUM | LOW | P1 |
| Remember toggle position | MEDIUM | LOW | P2 |
| Progressive hint | MEDIUM | MEDIUM | P2 |
| Typed input / LLM checking / speech scoring / per-direction FSRS | LOW (for this user) | HIGH | P3 (anti-feature this milestone) |

## Competitor Feature Analysis

| Feature | Anki (community practice) | Glossika | Clozemaster / Duolingo | Our Approach |
|---------|---------------------------|----------|------------------------|--------------|
| Production prompt | L1 word or sentence on front; learner-authored | English sentence shown/played once | Cloze blank / typed translation | English sentence translation + explicit target cue (`card.back`) — kills the prompt-ambiguity pitfall their formats suffer from |
| Answer verification | Self-graded reveal (Again/Hard/Good/Easy) | Self-assessed; audio plays on reveal; too-hard/too-easy feedback | Typed exact/fuzzy match against accepted-answers DB | Self-graded reveal on the existing FSRS bar — matches Anki/Glossika, avoids Duolingo's content-pipeline cost |
| Audio on reveal | If the deck author added it | Yes, target audio ×2 — core to the method | Yes | Auto-play via existing TTS + Blob cache |
| Recognition vs production scheduling | Separate cards per direction, independent state | Single item stream | Separate skill tracks | One shared FSRS state per Card — accepted tradeoff; FSRS self-corrects |
| New-item introduction | "Recognition first, production later" sequencing | New items drilled with full support before review reps | Guided lesson before testing | Existing bare-word-first gate extended: word-level production for state 0/1 cards |

## Sources

- [Wordy — Anki for Language Learning (2026)](https://wordy.info/blog/anki-for-language-learning-guide); [Mindgrip — How to Use Anki for Language Learning](https://mindgrip.app/blog/anki-for-language-learning); [Louis Li — Effectively Using Anki Flashcards](https://louisrli.github.io/blog/2023/06/13/effectively-using-anki-flashcards-for-language-learning/); [Sage Pearce-Higgins — Learning languages with Anki flashcards](https://medium.com/@sage.pearcehiggins/learning-languages-with-anki-flashcards-4f537a625cf9); [Morg Systems — English-front production cards](https://morg.systems/Doing-anki-cards-with-English-on-the-front-and-Japanese-on-the-back) — production-card mechanics, self-grading rationale, recognition-first sequencing (MEDIUM, cross-verified)
- [FluentU — Glossika Review](https://www.fluentu.com/blog/reviews/glossika/); [Rhapsody in Lingo — Glossika Method In-depth Review](https://rhapsodyinlingo.com/en/glossika-review/); [All Language Resources — Glossika Review](https://www.alllanguageresources.com/glossika/); [Discover Discomfort — Glossika Review](https://discoverdiscomfort.com/glossika-review-language-learning-app/) — the prompt→recall→reveal-with-audio→self-assess loop (MEDIUM, cross-verified)
- [Clozemaster](https://www.clozemaster.com/); [Langoly — Clozemaster Review](https://www.langoly.com/clozemaster-review/); [FluentU — Clozemaster Review](https://www.fluentu.com/blog/reviews/clozemaster/) — cloze/typed-input mechanics, speaking-mode fallback (MEDIUM)
- [Cadentia — Anki and SRS Guide](https://cadentialearning.com/blog/anki-srs-language-learning-guide); [language-learners.org — SRS flashcard-type dilemmas](https://forum.language-learners.org/viewtopic.php?t=4889); [Sinosplice — Misgivings about SRS](https://www.sinosplice.com/life/archives/2010/06/23/misgivings-about-srs) — many-valid-answers pitfall, prompt ambiguity, self-grading honesty (MEDIUM, cross-verified)
- [Active Recalling — Spaced Repetition Guide](https://activerecalling.com/blog/spaced-repetition-ultimate-guide); [Geoff Ruddock — Three years of Anki](https://geoffruddock.com/reflections-on-three-years-of-spaced-repetition-with-anki/); [Anki Forums — Bidirectional cards](https://forums.ankiweb.net/t/new-feature-bidirectional-cards-for-learning-a-language/34411); [Eric Scott — Context is King](https://medium.com/euthyphroria/inductive-language-learning-with-anki-44e0d6451086) — recognition vs production scheduling, separate-direction card practice (MEDIUM, cross-verified)
- Codebase ground truth: `.planning/PROJECT.md`, `CLAUDE.md` (`FlashcardMode`/`StudySession` decomposition, `lib/sentence-selection.ts`, DTO fields, TTS/gloss infrastructure) (HIGH — curated project source)

---
*Feature research for: Active Recall production mode (v1.7), Korean Study app*
*Researched: 2026-07-13*
