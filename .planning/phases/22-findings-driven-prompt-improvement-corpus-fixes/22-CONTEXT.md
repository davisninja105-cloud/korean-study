# Phase 22: Findings-Driven Prompt Improvement & Corpus Fixes - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Act on the Phase 21 audit findings (`.planning/audits/card-audit-2026-07-07.md`) end-to-end:

1. Revise the `extract-cards.ts` prompt against the audit's evidence, with each edit annotated to the specific error class it addresses (PROMPT-01)
2. Validate the revised prompt on a targeted sample of real lessons via a non-persisting `scripts/prompt-eval.mts`, diffing audit-check counts before/after (PROMPT-02)
3. Correct the high-confidence existing-card issues in place by `id` — never delete+recreate (FIX-01)
4. Fix scripts default to dry-run, require `--apply` to write, matching `retro-filter-cleanup.mts` (FIX-02)

The audit found a small, concrete finding set (1039 cards scanned): 1 permanently-unsafe legacy card, 1 zero-sentence card, 13 romanization leaks (10 fronts + 3 sentences), 2 near-duplicate clusters. Zero distractor anomalies, zero normalizedFront inconsistencies, zero stale-components. This phase's corpus-fix scope is bounded to these findings.

</domain>

<decisions>
## Implementation Decisions

### Single-char blank-safety rule (scope expansion beyond the original audit fix)

- **D-01:** `lib/sentence-match.ts`'s `sentenceMatch()` blank-safety rule (`targetForm.length <= 1` → always unsafe) is being revisited. The real risk it guards against is substring-match ambiguity (a lone character can match inside an unrelated word's ending, e.g. target 다 matching inside 왔다), not syllable count — the current rule over-corrects by banning ALL single-character targets, silently dropping real single-syllable vocabulary at extraction time (Phase 20's EXTRACT-03 rejects any card with zero blank-safe sentences).
- **D-02:** Fix: make `sentenceMatch()` word-boundary-aware for 1-char targets. A single-character targetForm becomes `safeToBlank: true` when it is an isolated token — non-Hangul (space/punctuation/string-edge) on both sides — rather than embedded inside a longer word. This is additive: existing 2+-char behavior is unchanged. Every call site imports this one module (`components/HighlightedSentence.tsx`, `components/StudySession.tsx`, `components/CardEditor.tsx`) so blanking, highlighting, and the CardEditor preview all inherit the fix automatically — no call-site changes needed, only the predicate itself.
- **D-03:** Verified against the live DB before locking this in: card 다 ("all/completely", id `cmqlm1w0u014k0gsa6eydclfd`) has two existing sentences ("지난 모든 시즌을 다 봤어요.", "밥을 다 먹었어요.") where 다 already sits isolated between spaces with no other occurrence in the string — it becomes blank-safe **as-is** under the new rule, no sentence rewrite needed. This card needs NO fix beyond the `sentenceMatch()` change landing.
- **D-04:** Card 철 ("iron root", id `cmqlmqdoa02430gsax79l6oza`) is zero-sentence and needs brand-new sentences written. But as a noun, natural Korean sentences almost always glue a particle directly onto it with no space (철은/철이/철로) — so even under the new word-boundary rule, natural sentences will still leave 철 embedded (unsafe). **Decision: accept Exposure/multiple-choice-only for this one card.** Write natural sentences (e.g. using 철은/철로 forms) without forcing an artificial isolated-token construction; this card simply never gets Recall/fill-blank mode, same functional outcome as before the rule change, but it's no longer a zero-sentence card and studies fine in the other two modes.
- **D-05:** This `sentenceMatch()` change is a root-cause fix to a shared "single source of truth" module, not scope creep — it directly resolves why these audit-flagged legacy cards are unfixable under the current rule, and prevents the same silent-drop from recurring for future single-syllable vocabulary.

### Romanization leakage fix strategy (feeds both PROMPT-01 and FIX-01)

- **D-06 (Sino-Korean root fronts — 5 cards: 소/고/식/용/료):** Drop the English word from the front entirely. Rewrite e.g. `"소 (작을 소, small)"` → `"소 (작을 소)"`. Rely on the `back` field alone for the English meaning. Apply the same convention going forward in the prompt for Sino-Korean root vocabulary cards.
- **D-07 (Grammar modifier-pattern fronts — 4 cards, all currently full English descriptive labels like `"Action verb ~는 + noun (present modifier)"`):** Remove English descriptive labels from grammar-card fronts **entirely, present and future** — descriptive English lives only on the `back` field, never the front. This is a broader convention change beyond just these 4 flagged cards; apply it as the general grammar-front rule in the revised prompt.
- **D-08 (Collision risk found while resolving D-07):** Two of the four modifier fronts share the identical bare marker `~(으)ㄴ` — one for action-verb PAST modifier (먹은) and one for descriptive-verb PRESENT modifier (작은). These are different grammar points that happen to share notation; removing English entirely would collide them into the same literal front string, which `Card.normalizedFront @unique` would reject (or silently misclassify if collision handling differs). **Decision: disambiguate with a Korean grammar-term tag, not English** — e.g. `"동사 ~(으)ㄴ"` (verb) vs `"형용사 ~(으)ㄴ"` (adjective/descriptive verb). Stays Hangul-only, satisfies "no English on front," and is real Korean grammar terminology appropriate for a Korean-immersion learner. Apply this disambiguation pattern generally: whenever two distinct grammar points would otherwise collide on the same bare marker, use a short Hangul grammar-term prefix, not an English word.
- **D-09 (Loanword/acronym exception — "CRT 렌즈" front, and 3 flagged sentences containing DST/CRT):** Accept these as a documented loanword exception, not a fix target. CRT and DST are real English acronyms used untranslated in natural Korean speech (like PC방) — not romanization. Decision applies consistently to both fronts and sentences (checked the 3 flagged sentences directly: "주말에 DST가 시작됐어요.", "사람들이 DST를 싫어해요."/"네, 엄청 싫어해요.", "저는 밤에 CRT 렌즈를 껴요." — all the same embedded-acronym pattern). **No DB change for these.** Add this as an explicit exception class in the revised prompt (untranslated English acronyms/loanwords used in real Korean usage are allowed inline) so future extractions and the audit's romanization check don't over-flag similar terms. The audit will keep reporting these — that's an accepted, documented false positive, not a bug to chase to zero.

### Near-duplicate clusters — confirmed false positives, no action

- **D-10:** Both clusters found (보다 "to see/watch" vs ~보다 (더) "more than" comparison particle; 고 "high/top" Sino-Korean root vs ~고 "and" listing connector) are homonyms — genuinely different meaning/POS that only collide because `superNormalize()` strips punctuation/parens before fuzzy-grouping. **No DB action.** Mark both clusters as reviewed-not-duplicate in the Phase 22 fix report so they don't get re-investigated in a future audit pass.

### Prompt-eval validation sample (PROMPT-02)

- **D-11:** `scripts/prompt-eval.mts` should re-run extraction against a **targeted lesson sample**, not a random or full-corpus sample: specifically, the original lessons whose notes actually contain the taught content behind the fixed error classes — Sino-Korean root vocabulary, modifier-pattern grammar (~는/~(으)ㄴ/~(으)ㄹ forms), and at least one loanword/acronym-containing lesson (DST/CRT) — so the before/after diff directly exercises what the prompt change targets. A handful of lessons, not the full ~1039-card deck.
- **D-12:** Pass bar: **"must improve, not necessarily hit zero."** LLM extraction isn't perfectly deterministic — require the targeted audit-check counts (romanization flags, zero-safe/zero-sentence cards) to measurably drop in the sample re-extraction compared to the saved baseline, not necessarily reach exactly 0 on every run.

### Claude's Discretion
- 철's exact sentence wording (D-04) — any natural sentence(s) using 철은/철이/철로/etc. is acceptable; no specific phrasing was locked.
- Whether to phase the `sentenceMatch()` word-boundary logic as one self-contained diff or split further — left to the planner/executor.
- Exact wording of the Korean grammar-term tags beyond 동사/형용사 (D-08) if additional collisions are discovered during execution that weren't in the original 4 flagged fronts.
- Which specific original lessons map to the targeted sample (D-11) — identify by finding the lesson(s) that produced the flagged cards' source content; not enumerated here.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Audit findings (source of truth for every fix target)
- `.planning/audits/card-audit-2026-07-07.md` — the dated Phase 21 report; every finding carries the card id needed for in-place fixes. Referenced sections: Blank-safety violations, Zero-sentence cards, Romanization leakage, Near-duplicate clusters.

### Extraction pipeline (PROMPT-01 target)
- `lib/extract-cards.ts` — the prompt to revise; contains the current SENTENCE RULES / front-format instructions that need updating per D-06/D-07/D-08/D-09.
- `lib/audit-checks.ts` — single source of truth for what each audit-check class actually measures (`frontHasRomanization`, `sentenceHasRomanization`, `superNormalize`, `classifyBlankSafety`); the prompt-eval diff (PROMPT-02) should reuse these same functions, not reimplement checks.
- `lib/card-key.ts` — `normalizeFront()`; defines exactly which trailing-paren content gets stripped as an "English gloss" — governs whether D-06/D-07 rewrites actually clear the romanization flag.
- `lib/sentence-match.ts` — `sentenceMatch()`; the module being changed per D-01/D-02. Used by `components/HighlightedSentence.tsx`, `components/StudySession.tsx`, `components/CardEditor.tsx` — verify all three still behave correctly after the word-boundary change.

### Corpus fix pattern (FIX-01/FIX-02 target)
- `scripts/retro-filter-cleanup.mts` — the established dry-run-by-default / `--apply` pattern every new fix script must follow (see STATE.md v1.5 hard rule: mutate in place by `id`, never delete+recreate).
- `components/CardEditor.tsx` — the one-off manual fix path for the small number of legacy cards (다, 철, and the 10 romanization fronts) rather than writing throwaway one-shot scripts for each.

### Project-level constraints
- `.planning/PROJECT.md` — Constraints section (Vercel Hobby 60s limit, react-hooks/purity, tech stack) and Key Decisions table (prior fix-script conventions).
- `.planning/REQUIREMENTS.md` — PROMPT-01/02, FIX-01/02 requirement text and the Out of Scope table (near-duplicate *merging* is explicitly out of scope this milestone — consistent with D-10's "no action" outcome).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/audit-checks.ts` exports every classification function needed to measure before/after counts for `prompt-eval.mts` (`frontHasRomanization`, `sentenceHasRomanization`, `classifyBlankSafety`, `clusterNearDuplicates`) — reuse directly, don't reimplement.
- `scripts/retro-filter-cleanup.mts` is the template for any new fix script's dry-run/--apply/reporting structure (env-loading preamble, dynamic imports, chunked `$transaction` writes, always-print report regardless of mode).
- `components/CardEditor.tsx` already has live highlight preview + mismatch warning — suitable for the dozen or so one-off legacy-card fixes without writing new scripts for each.

### Established Patterns
- Env-loading preamble for `.mts` scripts: `dotenv.config()` for `.env` then `.env.local` (override), BEFORE any dynamic `import()` of `lib/` modules that read `process.env` at module init — static imports are hoisted in ESM and would see stale env (see `scripts/retro-filter-cleanup.mts:27-41`, `scripts/local-resync.mts`).
- Dry-run-by-default fix scripts: `const APPLY = process.argv.includes('--apply')`; always print the full report; only perform writes inside `if (APPLY)`.
- `Card.normalizedFront @unique` is a real DB constraint — any front rewrite (D-06/D-07/D-08) must be checked against the live deck for collisions before writing, same discipline `retro-filter-cleanup.mts` uses for `CardDependency` edges.

### Integration Points
- `sentenceMatch()` changes (D-01/D-02) touch three consuming components — must verify manually (or via existing tests) that highlighting, fill-blank, and CardEditor preview all still work correctly for both the newly-safe isolated single-char case and the still-unsafe embedded case.
- Front rewrites (D-06/D-07/D-08/D-09) update `Card.front` AND must recompute+update `Card.normalizedFront` together (per CLAUDE.md: "When editing a card's front, the `[id]/route.ts` update also sets `normalizedFront`") — a fix script or CardEditor edit must not update one without the other.

</code_context>

<specifics>
## Specific Ideas

- The user wants ALL grammar-card fronts (not just the 4 flagged ones) to drop English descriptive labels going forward — this is a general prompt convention change, broader than the minimum needed to clear the 4 audit findings (D-07).
- Korean grammar terminology (동사/형용사 style tags) is the preferred disambiguation mechanism over English, consistent with the "no English on front" decision (D-08).
- CRT/DST-style untranslated loanword acronyms are explicitly accepted as authentic Korean usage, not treated as bugs — this should become a durable prompt instruction, not just a one-time audit dismissal (D-09).

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope. The `sentenceMatch()` word-boundary change (D-01/D-02) was surfaced as a scope question but resolved as an in-scope root-cause fix rather than deferred, since it's what makes the audit's own "regenerate" fix strategy for 다/철 actually achievable.

</deferred>

---

*Phase: 22-findings-driven-prompt-improvement-corpus-fixes*
*Context gathered: 2026-07-07*
