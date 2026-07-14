# Phase 28: Active Recall Study Mode - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-14
**Phase:** 28-active-recall-study-mode
**Areas discussed:** Reveal audio & example-cycling, New-card transparency, AI practice questions in Active, Toggle wording

---

## Reveal audio & example-cycling

**Q1: Should the Korean sentence audio auto-play on reveal in Active mode, or stay tap-to-play?**

| Option | Description | Selected |
|--------|-------------|----------|
| Tap-to-play | Consistent with every existing AudioButton in the app. No new auto-play pattern to build. | ✓ |
| Auto-play on reveal | Plays automatically the instant the answer is revealed. New pattern; must trigger inside `handleReveal`, not an effect. | |

**User's choice:** Tap-to-play
**Notes:** Recommended option chosen without discussion — consistency with existing app convention.

**Q2: What should "See another example →" do in Active mode?**

| Option | Description | Selected |
|--------|-------------|----------|
| Hide it entirely | Active reveal shows only the pinned sentence — no cycling control at all. | ✓ |
| Keep it, affects next card only | Button stays visible but only changes the sentence picked next time this card comes up. | |

**User's choice:** Hide it entirely
**Notes:** Avoids prompt/answer mismatch risk flagged in research Pitfall 10.

---

## New-card transparency

**Q: When a state 0/1 card degrades to the Passive/exposure face inside an Active session, should the UI signal that this card is special, or stay silent?**

| Option | Description | Selected |
|--------|-------------|----------|
| Silent | Card looks like a normal Passive-style reveal — no extra copy or badge. | ✓ |
| Small explanatory note | A label like "New — building recognition first" appears on the card. | |

**User's choice:** Silent
**Notes:** Matches existing precedent — Recall already silently degrades to Exposure when a word isn't blank-safe.

---

## AI practice questions in Active

**Q: Should the "Include AI-generated practice questions" checkbox still be offered in Active mode, given PracticeCards have no sentences?**

| Option | Description | Selected |
|--------|-------------|----------|
| Keep available in both modes | Practice cards render the word-level prompt fallback in Active — no special-casing. | ✓ |
| Hide/disable in Active | Checkbox only shows under Passive. | |

**User's choice:** Keep available in both modes
**Notes:** Same fallback path as zero-sentence real cards (research Pitfall 10) — no extra logic needed to gate the checkbox by mode.

---

## Toggle wording

**Q: Should the mode-select toggle use literal "Passive/Active" wording, or warmer/more descriptive copy?**

| Option | Description | Selected |
|--------|-------------|----------|
| Passive / Active | Literal, matches ROADMAP.md/REQUIREMENTS.md exactly. | ✓ |
| Review / Practice | Warmer, learner-facing framing consistent with lib/copy.ts voice. | |
| Recognize / Produce | Names the cognitive skill each mode tests; more jargon-y. | |

**User's choice:** Passive / Active
**Notes:** No translation layer needed between docs and UI copy.

---

## Claude's Discretion

- Exact visual layout/spacing/animation of Active front/back faces, hint-reveal control placement, and toggle visual styling — deferred to a follow-up `/gsd-ui-phase 28` (phase has `UI hint: yes`).
- Whether `FlashcardMode.tsx` gains an Active branch in place vs. a new dedicated Active face component — left to the planner, contingent on shared-structure ratio.
- Exact wording of grade-anchoring reveal copy — direction locked by ACTIVE-04, exact phrasing is Claude's call.

## Deferred Ideas

None raised during this discussion. (ACTIVE-06 "remember toggle position" and ACTIVE-07 "progressive hint escalation" were already deferred to v2 in REQUIREMENTS.md prior to this session.)
