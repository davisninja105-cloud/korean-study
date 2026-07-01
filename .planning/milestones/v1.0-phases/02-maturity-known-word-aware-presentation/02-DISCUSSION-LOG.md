# Phase 2: Maturity- & Known-Word-Aware Presentation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-26
**Phase:** 02-maturity-known-word-aware-presentation
**Areas discussed:** isNewCard threshold, Known-word threshold for sentence ranking

---

## isNewCard Threshold

| Option | Description | Selected |
|--------|-------------|----------|
| State 0 + 1 (New + Learning) | Bare word on every review until the card graduates (state 2). A Learning card is still being drilled — the word isn't consolidated yet. | ✓ |
| State 0 only (first encounter) | Bare word only on the very first review. From the second review onward (Learning state), the sentence front returns. | |

**User's choice:** State 0 + 1 (New + Learning)
**Notes:** Confirmed the plan's spec — isNewCard = !review || state <= 1.

---

| Option | Description | Selected |
|--------|-------------|----------|
| No — sentence front | State 3 (Relearning) keeps sentence-on-front. You've learned this word before; sentence context may help re-anchor the meaning. | ✓ |
| Yes — bare word again | Treat a lapse like starting over. Show the bare word until it re-graduates. | |

**User's choice:** No — sentence front for lapsed (state 3) cards
**Notes:** Only state 0 and 1 trigger bare-word mode. State 3 keeps current behavior.

---

## Known-Word Threshold for Sentence Ranking

| Option | Description | Selected |
|--------|-------------|----------|
| State ≥ 2 (Review + Relearning) | Any card that has ever graduated is treated as 'known enough.' A lapsed card (state 3) was once fully learned. | ✓ |
| State = 2 only (Review strictly) | Only currently-graduated cards count. Stricter threshold, more words scored as unknown. | |

**User's choice:** State ≥ 2 (Review + Relearning)
**Notes:** Matches foundation-first-plan.md spec.

---

| Option | Description | Selected |
|--------|-------------|----------|
| Exclude it (via targetForm param) | countUnknownWords already skips tokens belonging to targetForm. No extra logic needed. | ✓ |
| Explicitly include it | Force-add card's own normalizedFront to knownLemmas before counting. Same practical effect. | |

**User's choice:** Exclude via targetForm parameter
**Notes:** The targetForm exclusion in countUnknownWords already handles this — no extra step.

---

## Claude's Discretion

- **Hint text under bare word:** "Recall the meaning" (matching existing Recall sub-mode pattern) — Claude chose this based on existing UX consistency; user did not select this area for discussion.
- **Back-of-card layout for new cards:** Unchanged from current (sentence → divider → Korean word → meaning). No modification needed.
- **Internal structure of `countUnknownWords`:** Naming, helper shape, exact tokenization details.
- **Test fixture construction in `tests/known-words.test.ts`:** How Korean test strings are built.

## Deferred Ideas

None — discussion stayed within phase scope.
