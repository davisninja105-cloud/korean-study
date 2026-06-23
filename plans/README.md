# Korean Study — Overhaul Plans

> **North star:** Build the iPhone app that makes a daily Korean habit feel inevitable
> and makes the multi-year climb to C1 reading feel visible, achievable, and worth
> celebrating every single day.

These plans translate the `fixes_needed.txt` design audit into three **isolated,
self-contained** action plans — one per priority tier. Each can be read and executed on
its own. They are **living documents**: check off tasks as they land and update the
dashboard below so progress survives across sessions.

---

## The four big decisions

| Question | Answer | Impact |
|---|---|---|
| **Read tab (graded passages)** | Skip for now | Nav stays 4 tabs; focus entirely on the existing study loop, habit, and polish. |
| **Grading bar redesign** | Keep 4, restyle | Keep Again/Hard/Good/Easy; improve hierarchy, mastery-language copy, haptics, remove the accent collision on "Easy." |
| **Proficiency ladder (A1→C1)** | Vocab-count heuristic | Pure mapping mastered-card count → CEFR band using Korean vocabulary thresholds. No schema change. |
| **Audio (TTS)** | Neural cloud TTS | Google Cloud TTS (ko-KR Neural2), reusing the existing `google-auth-library` service account. Cached per sentence. |

---

## Status dashboard

| Plan | Tier | Status | Progress |
|---|---|---|---|
| [P0 — Foundations](./P0-foundations.md) | P0 | ✅ Complete | 20 / 20 tasks |
| [P1 — Identity & Retention](./P1-identity-retention.md) | P1 | ✅ Complete (deployed 2026-06-22) | 23 / 25 tasks · 2 descoped |
| [P2 — Polish & Delight](./P2-polish-delight.md) | P2 | ✅ Complete (deployed TBD) | 14 / 14 tasks · 1 stretch descoped |

> **P1 descoped (by request):** the *7-day review forecast* and the *"Builds on" prerequisite
> chips* were left out; *pull-to-refresh* was kept. See the P1 doc's progress log.

**Checkbox legend (used in every plan doc):**
`- [ ]` todo · `- [~]` in progress · `- [x]` done · `- [!]` blocked

**Update rule:** When a task in any plan doc is completed, check it off in that file AND
bump the progress count in this table.

---

## Execution sequence

1. **P0 first, top to bottom.** P0.0 (foundation primitives) must land before all other
   P0 work, because every later task consumes those tokens, keyframes, and helpers.
2. **P1 after P0 is green.** P1 extends and applies the P0 token/motion system broadly.
3. **P2 after P1.** P2 builds on the `Sheet` component, motion system, and color tokens
   from P0/P1.

Between tiers: run `npm run lint && npm run build` (must be clean) and do a manual
walkthrough on an iPhone viewport in both light and dark mode.

Deploy to production via `git push origin main` (GitHub → Vercel auto-deploy), only when
asked. Never force-push to `main`.

---

## Why this order serves the goal

- **Habit first, reading second.** A learner only reaches C1 if they keep showing up.
  P0 makes the daily loop feel rewarding (flip, ring, celebration) and forgiving (streak
  freeze) so the habit survives bad days. The proficiency arc makes the long climb
  visible from day one.
- **Identity second.** P1 makes the app feel built *for* Korean (typography is P0; color
  identity, dark mode, and iOS-native motion are P1) so it earns daily loyalty.
- **Reading depth last.** P2's tap-to-gloss + audio turn every example sentence into a
  mini-reader — the concrete bridge toward C1 reading — once the foundation is solid.
