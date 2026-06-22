# P0 — Foundations

> **Tier goal:** Make the highest-traffic surfaces feel *right* before anything else.
> Beautiful retention mechanics on a shaky visual foundation still feel wrong. P0 lays
> down a shared primitive layer (tokens, motion, haptics) that every P1/P2 task consumes,
> then applies it to Korean typography, the study loop, the habit system, and a visible
> C1 proficiency arc.

---

## North star (P0 slice)

A learner taps "Study now," sees their Korean card in a real Korean typeface at a
generous size, flips it with a satisfying 3D motion, taps a grade with haptic feedback
and a mastery phrase ("memory strengthening → 4 days"), and on finishing sees a confetti
burst, their habit ring close, and their current CEFR band on the long road to C1.

---

## Dependencies

**None upstream.** P0 builds the base from scratch.

Internal order is strict: **P0.0 → P0.1 → P0.2 → P0.3 → P0.4.** P0.0 defines the tokens
and helpers every later task uses.

---

## Key constraints (P0-relevant)

- **Tailwind v4, no `tailwind.config`.** All design tokens live in `app/globals.css`
  inside `:root {}` and `@theme inline {}`. New tokens slot into those two blocks.
- **Pretendard is not in `next/font/google`** — self-host the variable woff2 + `@font-face`.
- **`react-hooks/purity` is strict:** no `Date.now()` / `Math.random()` / bare `new Date()`
  in render. Time/confetti logic goes in a `useEffect` or event handler.
- **iOS PWA does not support `navigator.vibrate`.** The haptics helper guards the call and
  fails silently (works on Android/desktop; ready for a future native shell).
- **Streak forgiveness must be pure / derived** from existing `StudyDay` history — no
  schema change. `prisma/schema.prisma` is untouched in P0.
- **Lint is the gate.** `npm run lint` must be green before each commit.

---

## Tasks

### P0.0 — Foundation primitives *(do first; everything depends on it)*

- [x] **CSS design tokens** — add to `app/globals.css` `:root {}` and `@theme inline {}`:
  - `--font-korean: 'Pretendard Variable', 'Apple SD Gothic Neo', sans-serif`
  - Surface tiers (light): `--surface-1:#ffffff`, `--surface-2:#f9fafb`, `--surface-3:#f3f4f6`
  - Surface tiers (dark, inside the existing `@media (prefers-color-scheme: dark)`): `--surface-1:#1c2030`, `--surface-2:#141824`, `--surface-3:#0b0f1a`
  - Reward (warm): `--reward:#f97316`, `--reward-foreground:#ffffff`
  - Highlight (AA): `--highlight-bg:#fde68a`, `--highlight-fg:#78350f`
  - Category: `--cat-vocab:#6366f1` (indigo), `--cat-grammar:#8b5cf6` (violet), `--cat-phrase:#14b8a6` (teal)
  - Map all in `@theme inline`: `--color-surface-1/2/3`, `--color-reward`, `--color-reward-foreground`, `--color-highlight-bg`, `--color-highlight-fg`, `--color-cat-vocab/grammar/phrase`.
  - **Why:** Single source of truth; every P0+ task consumes these. **Acceptance:** `bg-surface-1`, `text-reward`, `bg-highlight-bg`, `text-cat-vocab` compile in `npm run build`.

- [x] **Motion primitives** — add to `app/globals.css`: `@keyframes cardFlip`, `ringFill`,
  `burst`; base classes `.card-flip-container/-front/-back` (perspective, preserve-3d,
  backface-hidden); `.animate-burst`. Wrap every keyframe + animation utility in
  `@media (prefers-reduced-motion: reduce)` that disables motion (opacity-only fallback).
  - **Why:** One motion system; P0.2 + P0.3 consume it. **Acceptance:** reduced-motion suppresses all animation.

- [x] **`lib/haptics.ts`** — new file exporting `haptic('selection'|'success'|'impact-light'|'impact-heavy')`
  over `navigator.vibrate`, guarded (`if (!navigator.vibrate) return`).
  - **Why:** Centralized, no-op-safe on iOS Safari/desktop. **Acceptance:** calling it on iOS throws nothing.

- [x] **Install `canvas-confetti`** — `npm i canvas-confetti` + `npm i -D @types/canvas-confetti`.
  Dynamic-import on trigger so it never blocks the bundle.
  - **Why:** P0.2 session-complete + P0.3 milestones need a burst. **Acceptance:** `npm run build` green.

### P0.1 — Korean typography *(audit §1)*

- [x] **Self-host Pretendard variable font** — `public/fonts/PretendardVariable.woff2` +
  `@font-face` in `app/globals.css` (`font-weight:100 900; font-display:swap`). The
  `--font-korean` token now resolves to it; `Apple SD Gothic Neo` is the iOS fallback.
  - **Why:** Hangul currently falls through Geist (Latin-only) → Arial → OS default; inconsistent everywhere. **Acceptance:** on desktop Chrome, Korean computes to Pretendard Variable.

- [x] **`.hangul` + `.hangul-gloss` utilities** in `app/globals.css` `@layer utilities`:
  `.hangul` = `font-family:var(--font-korean); line-height:1.65; letter-spacing:0.01em;
  word-break:keep-all`. `.hangul-gloss` = Geist, `font-size:0.75em; opacity:0.65`.
  - **Why:** Hangul needs ~1.6–1.7 leading; English glosses should read as subordinate.

- [x] **Apply `.hangul` to all Korean surfaces** — `components/HighlightedSentence.tsx`
  (span + wrap translations in `.hangul-gloss`); `components/StudySession.tsx` (card fronts
  L594/L612/L538/L568) and **raise the no-sentence hero from `text-4xl` to `text-5xl`** (~48 px);
  `components/CardEditor.tsx` (front input + sentence Korean fields).
  - **Why:** Consistent Pretendard + correct leading on every Korean surface; the card front is the most-seen surface.

- [x] **Reading-size control** (`readingTextScale`, 0.9–1.4): add getter/setter in
  `lib/settings.ts`; wire through `app/api/settings/route.ts` (GET + PUT branch); inject
  `--reading-scale` on `<html>` in `app/layout.tsx` (same pattern as `--button`); use
  `calc(1rem * var(--reading-scale,1))` on `.hangul` sentence text in `app/globals.css`; add
  a slider in `app/settings/page.tsx` with live preview.
  - **Why:** Long C1-level sentences need adjustable text; respects Dynamic Type (rem-based).

### P0.2 — Study loop *(audit §4)*

- [x] **3D card flip** — wrap the card block (`components/StudySession.tsx` ~L521) in the
  `.card-flip-container` structure (front/back faces, `rotateY(180deg)`, spring,
  `backface-visibility:hidden`) toggled by `revealed`. Reduced-motion → keep `.animate-reveal` fade.
  - **Why:** A real flip defines the kinesthetic feel of the app (audit §4). **Acceptance:** smooth flip on reveal; fade under reduced-motion.

- [x] **Restyle the 4-grade bar** (keep all 4 FSRS grades) in `components/StudySession.tsx`
  (~L711–730) + the fill-blank 2-button bar (L750–761):
  - Extend `lib/fsrs.ts:formatInterval()` to return **mastery-language** copy ("Memory
    strengthening → Xd", "Long-term memory → Xw", "Mastered — next in Xmo") plus a short form.
  - "Good" visually primary; "Again" softer warning; "Hard"/"Easy" tertiary. Move "Easy" off
    `blue-100` (accent collision) → teal. All buttons `min-h-14`. `haptic('selection')` on tap. Keep keyboard 1–4.
  - **Why:** "Right information, wrong presentation… frame intervals as mastery language" (audit §4).

- [x] **`components/ProgressRing.tsx`** — new reusable SVG ring (props: `pct`, `size`,
  `strokeWidth`, `color`, required `aria-label`); animates via `ringFill`; reduced-motion
  jumps to final. Replace the linear bar in `StudySession.tsx` (L513–518) with the ring + keep the text stat line.
  - **Why:** "Progress is a stat, not a shape. A ring that closes is one of the most effective habit mechanics" (audit §4).

- [x] **Session-complete moment** — rework `app/study/page.tsx` complete phase (L256–294):
  warm rotating heading; confetti burst (dynamic import in an effect; reduced-motion guard);
  today's goal `ProgressRing` closing with `haptic('impact-heavy')`; prominent streak in
  `--reward`; keep the 3 stat tiles but restyle as supporting detail (`--surface-2`, smaller).
  - **Why:** "Make it a real emotional beat… right now it is three small stat tiles" (audit §4).

### P0.3 — Habit & progression core *(audit §5, labeled P0)*

- [x] **Streak forgiveness** — extend `lib/habit.ts`: `computeFreezeBudget(metSet, todayStr)`
  (1 freeze per fully-met 7-day block in last 90 days); `computeStreaks()` accepts a
  `freezeBudget` and bridges a single missed day (decrement budget) while walking back.
  At-risk nudge in `components/HabitTracker.tsx` ("Keep your Xd streak — study today")
  styled with `--reward`.
  - **Why:** "One missed day wipes the streak — the #1 churn moment in every habit app" (audit §5). Pure derivation = no schema change. **Acceptance:** 7 met + 1 missed → streak holds; 8 met + 2 missed → breaks.

- [x] **Habit ring** — replace the goal bar in `components/HabitTracker.tsx` (L112–121) and
  `app/habits/page.tsx` (L128–136) with `<ProgressRing color="var(--reward)">`. On
  `pct>=100`: `haptic('impact-heavy')` + small confetti burst (reduced-motion guarded).
  - **Why:** "A ring that closes is the primary daily reward trigger" (audit §5).

- [x] **Milestone celebrations** — `components/MilestoneCelebration.tsx` (full-screen overlay:
  confetti, milestone badge, personal stat summary, warm copy, dismiss). Add
  `checkMilestone(current, previous)` to `lib/habit.ts` (7/30/100/365); trigger in
  `HabitTracker.tsx` when previous < threshold ≤ current.
  - **Why:** "At 7/30/100/365 days, nothing happens — the 🔥 increments silently" (audit §5).

- [x] **Heatmap insight line** — `lib/habit.ts:computeHabitInsight(days, todayStr, goal)`
  returning one true sentence ("You've studied X days in a row." / "…X of the last 90 days."
  / "Your best study day is Tuesday."); render below the heatmap in `app/habits/page.tsx`.
  - **Why:** "Data without narrative is just squares" (audit §5).

### P0.4 — Proficiency ladder *(vocab-count heuristic)*

- [x] **`lib/proficiency.ts`** — pure: `CEFR_BANDS` (A1 0–500, A2 500–1200, B1 1200–2500,
  B2 2500–4500, C1 4500–8000, C1+ 8000+) and `computeProficiency(masteredCount)` →
  `{ band, label, masteredCount, withinBandPct, nextBand }`.
  - **Why:** Zero-infra path to a visible C1 arc using existing FSRS state.

- [x] **`/api/stats` adds `masteredCount`** — in `app/api/stats/route.ts`, count
  `prisma.cardReview` where `state=2 AND scheduledDays>=21`; add to JSON.
  - **Why:** Client needs the number to render the arc without a dedicated API.

- [x] **`components/ProficiencyArc.tsx`** — current band badge, labeled arc to next band,
  "Xk mastered / Xk for [next band]", with C1 always visible at the far end. Indigo
  (`--cat-vocab`) fill.

- [x] **Mount `ProficiencyArc`** on Home (`app/page.tsx`, below the habit card) and Habits
  (`app/habits/page.tsx`, below the streak hero).
  - **Why:** "Make the destination (C1) feel real and close enough to pull learners forward across years" (north star).

---

## Verification

1. `npm run lint` — zero errors. 2. `npm run build` — succeeds.
3. `npm run dev` → iPhone viewport (Chrome DevTools):
   - [x] Korean computes to Pretendard Variable; flashcard hero is ≥48 px.
   - [x] "Show Answer" → 3D flip; reduced-motion → fade.
   - [x] Grade buttons show mastery phrases; "Good" dominant; "Easy" not blue.
   - [x] Progress ring fills as cards are graded.
   - [x] Session-complete shows confetti + streak + ring; reduced-motion → no confetti.
   - [x] Habit ring on Home + Habits.
   - [x] Seed `dev.db`: 7 met + 1 missed StudyDay → streak holds; 8 met + 2 missed → breaks.
   - [x] Seed 6 days then add day 7 → 7-day milestone overlay appears.
   - [x] Heatmap insight line + proficiency arc render with the correct band.

---

## Progress log

- [x] P0.0 — Foundation primitives (tokens, motion, haptics, canvas-confetti) — commit 28f5511, 2026-06-21
- [x] P0.1 — Korean typography (Pretendard, .hangul utilities, reading scale) — commit 28f5511, 2026-06-21
- [x] P0.2 — Study loop (3D flip, mastery-language grade bar, ProgressRing, session-complete) — commit 28f5511, 2026-06-21
- [x] P0.2 — Card flip overflow fix (grid stacking) — commit 57e9a2d, 2026-06-21
- [x] P0.2 — Dynamic card height on flip (useLayoutEffect measurement) — commit 067fcd5, 2026-06-21
- [x] P0.3 — Habit & progression core (streak forgiveness, habit ring, milestones, heatmap insight) — commit 28f5511, 2026-06-21
- [x] P0.4 — Proficiency ladder (lib/proficiency.ts, /api/stats masteredCount, ProficiencyArc) — commit 28f5511, 2026-06-21
