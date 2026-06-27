# Features Research: UI/UX Polish

**Project:** Korean Study — v1.1 UI/UX Polish
**Domain:** Mobile-first PWA habit/study app (SRS flashcards, streak tracking, language learning)
**Researched:** 2026-06-26
**Confidence:** MEDIUM (web research cross-checked across multiple sources)

---

## Table Stakes (must-have for a polished feel)

Features users expect from any polished mobile habit/study app. Missing = app feels unfinished or amateur.

| Feature | Impact | Notes |
|---------|--------|-------|
| Safe area insets | HIGH | `viewport-fit=cover` + `env(safe-area-inset-*)` — without this, content clips under iPhone notch/home indicator. Affects Nav bar and bottom-anchored CTAs. |
| 44px minimum touch targets | HIGH | Apple HIG requirement. Every button, pill, and interactive element needs 44×44px tap zone (use padding, not inflate visual size). 8px gap between adjacent targets. |
| `:active` state feedback | HIGH | Every tappable element needs an immediate visual response on press — background shift, scale, or opacity. Without it the app feels dead and unresponsive. |
| Remove `-webkit-tap-highlight-color` | HIGH | The blue flash on tap that browsers show by default is an instant "this is a website, not an app" signal. Set to `transparent` globally. |
| `prefers-reduced-motion` gating | HIGH | All non-essential animations must be wrapped with `motion-safe:` Tailwind variant or CSS media query. Required for accessibility and Play Store / App Store review compliance. |
| Progress feedback during session | HIGH | Users need to know how far through the session they are. A simple count ("Card 4 of 20") or progress bar is required — Anki's absence of this is a top complaint. |
| Answer reveal state clarity | HIGH | The "front of card → reveal → grade" flow needs unambiguous visual states. Users must never be confused about whether they've revealed the answer yet. |
| Session completion screen | HIGH | Study session must have a distinct end state — not just abruptly stopping. Shows stats (correct/reviewed), positive message, next action. Already partially built (`sessionCompleteMessage`). |
| Encouraging error/wrong-answer state | HIGH | Wrong answers must feel safe, not punishing. Duolingo's principle: no red error screens, only gentle feedback. This is core to the "warm" goal. |
| Readable Korean sentence typography | HIGH | Korean glyphs need `line-height: 1.6+` (vs 1.5 for Latin). The sentence-centric learning model means Korean sentences are front-and-center — they must be beautiful and readable. |
| 8px spacing grid | MEDIUM | All spacing in multiples of 4/8 (4, 8, 12, 16, 24, 32, 48px). Creates instant visual consistency without effort. Currently missing in some sections. |
| 16px page edge padding | MEDIUM | Mobile content should never touch screen edges. 16px minimum horizontal padding throughout. |
| Scroll momentum on iOS | MEDIUM | Any scrollable list needs `-webkit-overflow-scrolling: touch` on iOS. Without it, scroll feels sticky and non-native. |
| Loading states (not spinner) | MEDIUM | When cards are loading, show a skeleton that matches the card layout — perceived 2× faster than a spinner. Critical for first-load UX on slow connections. |
| Empty state when 0 cards due | MEDIUM | Home and study pages need a purposeful "nothing due" state — not a blank screen. Should feel celebratory (all done for today!), not broken. |
| Dark mode completeness | MEDIUM | App already has dark mode toggle. Table stakes is that it works correctly — no light-mode colors leaking through, no flash on load. Already implemented but needs audit pass. |

---

## Differentiators (would meaningfully elevate the app)

Features that are not expected but would create genuine delight and the "warm app" feeling the user described.

| Feature | Impact | Notes |
|---------|--------|-------|
| Time-of-day greeting | HIGH | "Good morning" / "Good evening" on the home hero makes the app feel alive and personal. Already partially implemented (`comebackMessage` exists) but could be extended. Critical for "morning ritual" feel. |
| Answer grade haptic distinction | HIGH | Different haptic patterns for correct vs. needs-review answers. Vibrate API already used (`lib/haptics.ts`). Adding a second pattern (e.g. double-pulse for wrong) makes grading tactile and satisfying. |
| "Day complete" hero state | HIGH | When 0 cards due AND today's goal is met, the home hero should show a celebration state — different color, icon, message. Currently shows the same due-count hero but with 0. The delta between "nothing due" and "goal met" should be visible. |
| Smooth card flip animation | HIGH | 3D flip already exists in StudySession. Making it feel premium: 300ms duration, `ease-out` (fast start, slow land), no layout shift during flip. Currently confirmed to exist — audit for jank. |
| Progress ring fill animation | MEDIUM | `ProgressRing` already uses `ringFill` keyframe. The delight comes from the ring animating from previous value to new value on session complete — not just appearing. |
| Correct-answer micro-celebration | MEDIUM | After a "Good" or "Easy" grade, a small burst of color or subtle particles. Does not need to be as loud as confetti — just enough to register "that felt good". Canvas-confetti already in the project. |
| Streak-protection anxiety relief | MEDIUM | When a user opens the app and their streak is at risk (haven't studied today), the home should surface a gentle nudge. `atRiskMessage` already exists in `lib/copy.ts` — needs a visual treatment to match. |
| Card type color in study session | MEDIUM | Currently vocabulary/grammar/phrase color badges exist on the cards browse page (`typeBadgeClass`). In the study session itself, the card type could be subtly visible — gives learner context ("this is a grammar pattern, not a vocab word"). |
| Transition between cards | MEDIUM | Smooth slide or fade when moving from one card to the next. Currently the next card appears abruptly. A 150ms slide-left on advance feels native-quality. |
| Session summary with breakdown | MEDIUM | Session complete screen could show "12 vocabulary, 5 grammar, 3 phrases" instead of just total count. Learner understands what they studied. |
| Pull-to-refresh visual indicator | LOW | Already implemented (`usePullToRefresh`). Polish: a custom spinner or Korean character spinning instead of browser default. |
| Warm copy throughout | LOW | `lib/copy.ts` has helper functions. Needs audit to ensure they're used consistently — grade bar labels already use mastery language ("Memory strengthening", "Mastered"). Extend to more surfaces. |

---

## Anti-Features (tempting but wrong for this app)

| Anti-Feature | Why to Avoid |
|--------------|--------------|
| RPG gamification (Habitica-style XP, coins, quests) | This is a personal tool for a serious language learner with a real tutor. RPG elements would undermine the app's identity — it's a study tool, not a game. The existing CEFR band system is the right level of gamification. |
| Leaderboards / social comparison | Single-user personal app. Social features would add auth complexity with zero benefit. |
| Streak-freeze purchase mechanics | The app already has freeze tokens. Making them purchasable (like Duolingo) is wrong for a personal tool where the user can just edit the DB. |
| Push notifications | PWA push requires service worker + permission flow + backend scheduling. Complexity vastly outweighs benefit for a personal single-user app. |
| Sound effects on answer | Would require careful implementation to not be annoying. Haptics already cover this. Sound effects add `<audio>` complexity, autoplay policy headaches, and are off by default on most devices. Not worth it. |
| Custom mascot / character | Adding a Duo-style character requires ongoing illustration work and doesn't fit the app's aesthetic. The warm copy in `lib/copy.ts` achieves the same emotional effect in text. |
| Animated onboarding / tutorial | Single-user app — the user built it and knows how it works. |
| Deck browsing / organization UI | Already have the Cards page with filter. Adding Anki-style deck nesting would be huge scope creep for one user. |
| Review heatmap on study page | Already on Habits page. Duplicating it elsewhere adds visual noise. |
| Multiple user profiles | Single-user tool. |

---

## Study Session Specific

UX patterns for the core daily loop — the highest-priority surface.

### Card Flip & State Machine

The flashcard session has three visible states: **Exposure front** (question), **Exposure back / Recall sentence** (after tap to reveal), **Grade buttons** (after reveal). Each state transition must be visually unambiguous:

- Exposure → Reveal: card flip animation (already implemented). Audit: is the flip direction consistent? Does it feel 300ms + ease-out? Any layout shift on flip?
- Reveal → Next card: lateral slide (new). Card exits left, next enters from right. 150ms, transform only (no layout).
- Grade button visual: the 4 buttons (Again/Hard/Good/Easy) need distinct color weight. "Good" and "Easy" should feel warm/positive; "Again" should be neutral, not red/alarming.

### Progress Indicator

A progress bar or "N / Total" counter at the top of the session. Critical because:
- Users feel anxiety without knowing where they are in the session
- Seeing "16 / 20" creates motivated "almost done" push
- Implementation: a thin stripe (`h-1`) at top of session area, animated width change.

### Answer Feedback

Wrong answer (grade "Again" or "Hard"):
- No red flash, no alarm.
- A brief shake or bounce on the card, a neutral/muted color on the grade button.
- Copy: already uses "mastery language" — keep that.

Correct answer (grade "Good" or "Easy"):
- Subtle warm pulse or brief color wash on the card (100ms, opacity only — stays under performance budget).
- Grade button activates with its positive color.

### Bare-Word vs. Sentence Front

The existing bare-word-first gate is a UX differentiator. The visual treatment should reinforce what's happening:
- Bare word front: larger type size (the word is the whole card), centered vertically.
- Sentence front: sentence rendered with `HighlightedSentence` (already exists), slightly smaller type, more breathing room.
- The transition between bare-word and sentence (as learner progresses) should feel like a natural upgrade, not an unexplained change.

### Session Size & Cognitive Load

FSRS sessions default to `sessionSize` (20 cards). Research confirms 5–10 min sessions work best for retention. The session indicator helps users self-regulate. Do not show "500 cards due" as a scary number — show only the session batch.

### Mode Selector (Flashcard / Multiple Choice / Fill Blank)

Already implemented in `ModeSelector.tsx`. Polish: the mode selector should not take up visual space during the study session itself — it belongs in the pre-session setup. Consider hiding it after session starts (except in a subtle accessible location).

---

## Home Dashboard Specific

The home screen is the "morning ritual" surface. What the user sees first determines whether they feel motivated or pressured.

### Hero Section (above the fold)

The due-count hero is the single most important element. Research pattern from Streaks + Duolingo:
- **One big number** — the due card count, large type, `--reward` color when > 0.
- **One CTA** — "Study" button, full-width or near-full-width, below the number.
- **No competition** — nothing else above the fold should pull attention.

Current state: the home has "effect-only time greeting, large `--reward` due count, primary Study CTA" — this is the right skeleton. Polish = make the number truly heroic (e.g. 72px+ on mobile, reward color, slight weight difference), and ensure the CTA is immediately tappable (full-width, tall enough — 56px+).

### Three Hero States

The hero should have three distinct visual modes:
1. **Cards due** (N > 0): warm accent number + "Study now" CTA in button color. This is the call to action.
2. **Goal met, nothing due**: celebration state — e.g. green check, "All done today!" message, "Study ahead →" as secondary link. `sessionCompleteMessage` from `lib/copy.ts` can source copy.
3. **New user / no cards**: onboarding nudge — but for this single-user app, this state shouldn't occur after setup.

### Streak Display

Streak is the habit-forming core metric. Research: users treat streak as identity ("I'm a 47-day streak person"). The streak display needs:
- Prominent placement (second element after the hero CTA, or woven into it).
- A visual that communicates continuity (the existing `HabitTracker` ring).
- Warm color (`--reward`) for the streak number, not the primary action color.
- On freeze-bridged days: `comebackMessage` with green pill (already implemented in `HabitTracker.tsx`).

### Cognitive Load Hierarchy

The home has: hero (due count + CTA) → HabitTracker → StatsBar → ProficiencyArc. This is good hierarchy. The risk is visual clutter if each section has equal visual weight. Recommendations:
- `StatsBar` should be genuinely quiet — `text-xs`, `surface-2` background, no shadow.
- `ProficiencyArc` is motivating secondary content — keep it below HabitTracker, let it breathe with padding.
- If the home page has more than 3 visible sections before scrolling, it's too much.

### Time-of-Day Personalization

The "effect-only time greeting" note in CLAUDE.md suggests this exists but may be plain text. Elevate it:
- "Good morning" 5am–12pm / "Good afternoon" 12pm–5pm / "Good evening" 5pm–10pm / "Night owl 🌙" 10pm+.
- Display name or just warm address ("Let's study" works).
- This is client-only logic (`Date` in effect), already pattern-established.

---

## Technology Implications

### Animation Strategy: CSS-first, no new deps

**Recommendation:** Do not add Framer Motion. Reasons:
- Next.js 15+ App Router has known lifecycle issues with `AnimatePresence` — components unmount/remount abruptly during navigation, breaking Framer's exit animations.
- CSS `transform`/`opacity` transitions at `duration-150` to `duration-300` are compositor-thread operations — 60fps on all devices, zero JS overhead.
- Tailwind v4 `@theme` `@keyframes` + `--animate-*` variables handle custom keyframes natively.
- `tailwindcss-animate` (already used via shadcn/ui patterns) adds `animate-in`, `fade-in`, `slide-in-from-*` classes — covers all needed enter/exit patterns.

**What to use:**
- `transition` + `duration-200` + `ease-out` for button hovers, mode switches, state changes.
- `@keyframes` in `globals.css` for custom sequences (card pulse, celebration flash).
- The existing `ringFill` keyframe pattern is the right template.
- Canvas-confetti (already installed) for milestone moments.

### Korean Typography

Pretendard Variable (already in use as `--font-korean`) is the right font — handles both scripts. Specific additions needed:
- `word-break: keep-all` on Korean text containers — prevents mid-syllable line breaks.
- `line-height: 1.65` on sentence display elements (current may be too tight).
- `font-feature-settings: "kern" 1` for tighter kerning at display sizes.
