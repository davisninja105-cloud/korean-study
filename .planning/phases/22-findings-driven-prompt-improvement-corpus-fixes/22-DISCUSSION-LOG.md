# Phase 22: Findings-Driven Prompt Improvement & Corpus Fixes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 22-findings-driven-prompt-improvement-corpus-fixes
**Areas discussed:** Single-char unsafe cards, Romanization front format, Near-dup clusters, Prompt-eval sample design

---

## Single-char unsafe cards

| Option | Description | Selected |
|--------|-------------|----------|
| Delete outright | Remove both cards (다, 철) and their FSRS/ReviewLog rows | |
| Accept Exposure/MC-only | Leave both as-is; Recall/fill-blank silently degrade | |
| You decide at execution | Executor investigates graceful-degradation behavior first | |

**User's choice:** Free text — "I want to revisit the 2+ char rule, it seems too strict and it seems like it will skip over a lot of words."

**Follow-up:**

| Option | Description | Selected |
|--------|-------------|----------|
| Word-boundary-aware fix | sentenceMatch treats isolated 1-char tokens as safeToBlank; embedded ones stay unsafe | ✓ |
| Keep the ban, stop rejecting the card | Keep sentenceMatch as-is; stop dropping zero-safe cards at extraction | |
| Keep as-is entirely | No rule change | |

**User's choice:** Word-boundary-aware fix (recommended).

**Notes:** Verified live DB before finalizing — 다's two existing sentences already have 다 isolated between spaces (becomes safe as-is, no rewrite needed). 철 has zero sentences and, as a noun, will almost always carry a glued-on particle (철은/철이/철로) with no space, so it stays unsafe under the new rule too.

**Follow-up 2 (철 specifically):**

| Option | Description | Selected |
|--------|-------------|----------|
| Write an isolated-token sentence | Force an unnatural label-style construction so 철 becomes safe | |
| Accept Exposure/MC-only for this one card | Write natural sentences (철은/철로/etc.); no Recall/fill-blank for this card | ✓ |
| You decide at execution | Executor tries isolated construction first, falls back if unnatural | |

**User's choice:** Accept Exposure/MC-only for this one card.

---

## Romanization front format

**Sino-Korean root fronts (5 cards: 소/고/식/용/료):**

| Option | Description | Selected |
|--------|-------------|----------|
| Split into two parens | e.g. "소 (작을 소) (small)" — both readings kept, English isolated in its own paren | |
| Drop the English word | e.g. "소 (작을 소)" — rely on "back" field alone | ✓ |
| You decide per-card | Executor picks per card | |

**User's choice:** Drop the English word.

**Grammar modifier-pattern fronts (4 cards):**

| Option | Description | Selected |
|--------|-------------|----------|
| Bare-pattern-first | e.g. "~는 (present modifier)" — matches existing grammar-front convention | |
| Keep the English label, shortened | Keep descriptive label but move English to a strippable trailing paren | |
| You decide per-card | Executor picks per card | |

**User's choice:** Free text — "I want to remove the english descriptive labels from the front of all grammar cards present and future, and make sure the descriptive english is only on the back." (Broader than the 3 presented options — a general convention change, not just for the 4 flagged cards.)

**Follow-up (collision risk surfaced during resolution):**

| Option | Description | Selected |
|--------|-------------|----------|
| Korean grammar-term tag | e.g. "동사 ~(으)ㄴ" vs "형용사 ~(으)ㄴ" | ✓ |
| Keep a minimal English tag only when needed | Narrow exception for genuine collisions | |
| You decide at execution | Executor picks a disambiguation scheme | |

**User's choice:** Korean grammar-term tag (recommended).

**Notes:** Two of the four flagged fronts share the identical bare marker "~(으)ㄴ" (action-verb past modifier vs descriptive-verb present modifier) — removing English entirely would collide them on `Card.normalizedFront @unique`. Resolved by using Hangul grammar terminology (동사/형용사) as the disambiguator instead of English.

**CRT loanword front:**

| Option | Description | Selected |
|--------|-------------|----------|
| Accept as a loanword exception | Leave "CRT 렌즈" as-is; document the exception class in the prompt | ✓ |
| Rewrite the sentences instead, keep front | Same front decision, but flag the 3 sentences for separate handling | |
| You decide at execution | Executor judges case-by-case | |

**User's choice:** Accept as a loanword exception (recommended).

**Follow-up (3 flagged sentences, checked live DB):**

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — accept as loanword exceptions too | Same reasoning as the CRT front; DST/CRT are real acronyms in natural use | ✓ |
| No — sentences should be Korean-only | Rewrite the 3 sentences to avoid the bare acronym | |

**User's choice:** Yes — accept as loanword exceptions too.

**Notes:** Checked the actual sentence text for all 3 flagged sentences — all are the same embedded-acronym pattern (DST, DST, CRT) as the front decision, not distinct romanization violations.

---

## Near-dup clusters

| Option | Description | Selected |
|--------|-------------|----------|
| No action — confirmed false positives | Mark reviewed-not-duplicate; no DB change | ✓ |
| Add disambiguating detail to plain fronts | Lightweight gloss added to 보다/고 for Cards-list clarity | |
| You decide at execution | Executor judges per cluster | |

**User's choice:** No action — confirmed false positives (recommended).

**Notes:** 보다 (vocab, "to see/watch") vs ~보다(더) (grammar, "more than") and 고 (vocab, Sino-Korean "high/top") vs ~고 (grammar, "and" connector) are homonyms that only collide because `superNormalize()` strips punctuation — not true duplicates.

---

## Prompt-eval sample design

**Sample composition:**

| Option | Description | Selected |
|--------|-------------|----------|
| Targeted lessons | Lessons containing Sino-Korean root vocab, modifier-grammar patterns, loanword-acronym content | ✓ |
| Random N-lesson sample | N lessons at random | |
| You decide at execution | Executor picks a reasonable sample | |

**User's choice:** Targeted lessons (recommended).

**Pass bar:**

| Option | Description | Selected |
|--------|-------------|----------|
| Must improve, not necessarily hit zero | Targeted audit-check counts must measurably drop vs baseline | ✓ |
| Must hit zero for the targeted classes | Stricter — 0 flags required before shipping | |
| You decide at execution | Executor sets the bar based on what the sample shows | |

**User's choice:** Must improve, not necessarily hit zero (recommended).

---

## Claude's Discretion

- 철's exact sentence wording — any natural sentence using 철은/철이/철로/etc. is acceptable.
- Whether to phase the `sentenceMatch()` word-boundary logic as one diff or split further.
- Exact Korean grammar-term tags beyond 동사/형용사 if further collisions surface during execution.
- Which specific original lessons map to the targeted prompt-eval sample.

## Deferred Ideas

None — discussion stayed within phase scope.
