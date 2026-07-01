# Phase 06: Home Dashboard Polish — Research

**Researched:** 2026-06-27
**Domain:** React component state management, Tailwind v4 CSS tokens, Next.js App Router client components
**Confidence:** HIGH

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HOME-01 | Home hero has three visually distinct states: (a) cards due, (b) goal already met today, (c) all cards reviewed but goal not yet met | State logic defined in UI-SPEC; activity API response shape confirmed; habitDateStr purity pattern confirmed |
| HOME-02 | Time-of-day greeting is visually prominent on the home hero (not just a small subtitle) | Current code confirmed as `text-sm text-muted`; UI-SPEC prescribes `text-xl font-medium text-foreground` |
| HOME-03 | Home page visual hierarchy reads clearly at a glance: due count → primary CTA → secondary stats strip | UI-SPEC layout contract confirmed; due count `text-6xl`, CTA `min-h-14`, stats below |
</phase_requirements>

---

## Summary

Phase 6 modifies a single file — `app/page.tsx` — to implement three visually distinct hero states, elevate the greeting typography, and add active-press states to two interactive elements. The change set is tightly bounded: no new files, no new packages, no new CSS tokens.

The current page fetches only `/api/stats` on mount. This phase adds a second parallel fetch to `/api/activity` to determine whether the daily goal has already been met today. The hero state (A/B/C) is computed purely in a `useEffect` after both fetches resolve, using `habitDateStr(hour)` (called in the effect, not render) to identify "today" in the habit-day sense.

All design decisions are locked in the approved UI-SPEC.md. Research confirms the spec is internally consistent with the existing codebase: all tokens referenced (`text-reward`, `bg-reward-soft`, `bg-surface-1`, `text-muted`, `text-foreground`, `bg-button`, `bg-button-hover`) exist in `app/globals.css`; the `/api/activity` response shape matches what the spec expects; and `habitDateStr` is already correctly exported from `lib/habit.ts` with the signature `(dayStartHour: number, d?: Date) => string`.

**Primary recommendation:** Implement as a single plan touching only `app/page.tsx`. The three-state hero replaces the existing two-branch conditional; the second fetch is added alongside the existing stats fetch using the `.then(setX)` pattern already established in `loadStats`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Hero state computation (A/B/C) | Browser / Client | — | Pure derived state from two API responses; lives inside `useEffect` in `app/page.tsx` |
| Goal-met detection | Browser / Client | API / Backend | Client reads `activityData.dailyGoalSeconds` + today's seconds from `/api/activity` response |
| Daily activity data | API / Backend | Database | `/api/activity GET` already exists; returns `{ days, dailyGoalSeconds, dayStartHour }` |
| Stats data (dueCards) | API / Backend | Database | `/api/stats GET` already exists; no changes needed |
| Greeting text | Browser / Client | — | Hour-based, read in `useEffect` to respect `react-hooks/purity`; set via `.then(setGreeting)` |
| Token-escape confirmation | Browser / Client | — | Grep confirms zero `text-gray-*` remain in `app/page.tsx`; F-06 already resolved by Phase 4 |

---

## Standard Stack

### Core
No new packages. All implementation uses existing dependencies.

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| React | 19.2.4 | `useEffect`, `useState`, `useCallback` — already imported | Existing |
| Next.js | 16.2.1 | App Router `'use client'` component | Existing |
| Tailwind CSS v4 | 4.2.2 | All utility classes via `@theme inline` tokens | Existing |

### Supporting
| Library | Purpose | Where Used |
|---------|---------|------------|
| `lib/habit.ts` → `habitDateStr` | Converts current time to habit-day date string | Called inside `useEffect`, not render |
| `lib/copy.ts` → `bandUpMessage` | Existing band-up banner copy | Already used; no changes |
| `lib/haptics.ts` → `haptic` | Pull-to-refresh haptic | Already used; no changes |
| `lib/proficiency.ts` → `computeProficiency` | CEFR band detection | Already used; no changes |
| `lib/usePullToRefresh` | Touch pull-to-refresh hook | Already used; no changes |

**Installation:** None required.

---

## Package Legitimacy Audit

No external packages are added in this phase.

| Package | Registry | Verdict | Disposition |
|---------|----------|---------|-------------|
| (none) | — | — | Not applicable |

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious:** none

---

## Architecture Patterns

### System Architecture Diagram

```
User opens app
      │
      ▼
app/page.tsx (client component)
      │
      ├── useEffect on mount
      │     ├── fetch('/api/stats') ──→ Stats API ──→ DB
      │     │     └── .then(setStats)
      │     ├── fetch('/api/activity') ──→ Activity API ──→ DB
      │     │     └── .then(setActivityData)
      │     └── Promise.resolve().then(() => setGreeting(g))
      │           (hour read in effect, not render)
      │
      ▼
  Both state variables populated?
      │
      ├── No  → render skeleton <div h-28 animate-pulse>
      │
      └── Yes → compute heroState in effect:
                  todayStr = habitDateStr(activityData.dayStartHour)
                  todaySeconds = activityData.days.find(d => d.date === todayStr)?.seconds ?? 0
                  goalMet = todaySeconds >= activityData.dailyGoalSeconds && dailyGoalSeconds > 0
                  
                  State A: stats.dueCards > 0
                  State B: dueCards === 0 && goalMet
                  State C: dueCards === 0 && !goalMet
                  
                  → render hero variant A, B, or C
```

### Component Structure (app/page.tsx only)

```
app/page.tsx
├── interface Stats { totalCards, dueCards, totalLessons, masteredCount }
├── interface ActivityData { days, dailyGoalSeconds, dayStartHour }  ← NEW
├── type HeroState = 'loading' | 'A' | 'B' | 'C'                     ← NEW
├── state: stats, activityData, heroState, greeting, syncMsg, bandUpMsg
├── loadStats() callback — fetches /api/stats, triggers band-up detection
├── loadActivity() callback — fetches /api/activity              ← NEW
├── useEffect — calls both, computes heroState after both resolve  ← MODIFIED
├── handleSync callback — existing, calls loadStats after sync
└── JSX:
    ├── Pull-to-refresh indicator
    ├── Sync feedback message
    ├── Band-up banner (with active: state added to dismiss button) ← F-07 fix
    ├── Hero section (three-state conditional)                      ← MAIN CHANGE
    │   ├── Greeting (text-xl font-medium text-foreground)          ← HOME-02
    │   ├── State A: due count + "Study now →"
    │   ├── State B: checkmark icon + "Goal met today" + "Study ahead →"
    │   └── State C: "All caught up" + supporting copy + "Study ahead →"
    ├── StatsBar
    ├── HabitTracker
    ├── ProficiencyArc
    └── "My Korean" link card (with active: state added)           ← F-07 fix
```

### Pattern 1: Parallel Fetches with .then(setX) pattern

**What:** Two fetch calls in a single `useEffect`, each flowing their result through `.then(setX)` callbacks. A derived state variable is computed only when both are non-null.

**When to use:** Required by `react-hooks/set-state-in-effect` ESLint rule — synchronous `setState` calls inside `useEffect` bodies are forbidden; results must flow through async callbacks.

**Example:**
```typescript
// Source: app/page.tsx (existing loadStats pattern, extended)
// CORRECT — uses .then(setX) callback pattern
const loadActivity = useCallback(() => {
  fetch('/api/activity')
    .then((r) => r.json())
    .then((data: ActivityData) => setActivityData(data))
    .catch(() => {})
}, [])

useEffect(() => {
  loadStats()
  loadActivity()
  const h = new Date().getHours()
  const g = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  Promise.resolve().then(() => setGreeting(g))
}, [loadStats, loadActivity])
```
[ASSUMED — based on existing codebase pattern in app/page.tsx lines 29–60]

### Pattern 2: habitDateStr purity pattern

**What:** `habitDateStr(hour)` from `lib/habit.ts` calls `new Date()` internally (when no `d` argument is provided). `new Date()` is impure and cannot be called during render. The function must be called inside `useEffect` or event handlers.

**When to use:** Any time the component needs to know "what is today's habit-day string".

**Example:**
```typescript
// Source: lib/habit.ts:42
export function habitDateStr(dayStartHour: number, d: Date = new Date()): string {
  return localDateStr(new Date(d.getTime() - dayStartHour * 3_600_000))
}

// Correct usage — called inside useEffect only, result stored in state
useEffect(() => {
  if (!activityData) return
  const todayStr = habitDateStr(activityData.dayStartHour)  // ← inside effect, safe
  const todaySeconds = activityData.days.find(d => d.date === todayStr)?.seconds ?? 0
  const goalMet = todaySeconds >= activityData.dailyGoalSeconds && activityData.dailyGoalSeconds > 0
  // ...
}, [activityData, stats])
```
[VERIFIED: app/page.tsx existing greeting pattern; lib/habit.ts line 42]

### Pattern 3: Hero state as derived state

**What:** `HeroState` is computed from the combination of `stats` and `activityData`. Rather than computing it inline in JSX (which could invoke `habitDateStr` during render), it's computed in a `useEffect` that watches both state variables and stores the result in a separate `heroState` state variable.

**When to use:** Whenever state derivation requires impure operations (time reading) or depends on multiple async data sources.

**Example:**
```typescript
// State variable
const [heroState, setHeroState] = useState<'loading' | 'A' | 'B' | 'C'>('loading')

// Derivation effect — runs when both fetches resolve
useEffect(() => {
  if (!stats || !activityData) return
  const todayStr = habitDateStr(activityData.dayStartHour)
  const todaySeconds = activityData.days.find(d => d.date === todayStr)?.seconds ?? 0
  const goalMet = todaySeconds >= activityData.dailyGoalSeconds && activityData.dailyGoalSeconds > 0
  if (stats.dueCards > 0) {
    setHeroState('A')
  } else if (goalMet) {
    setHeroState('B')
  } else {
    setHeroState('C')
  }
}, [stats, activityData])
```
[ASSUMED — derived from UI-SPEC.md data requirements section and existing codebase patterns]

### Anti-Patterns to Avoid

- **Calling `habitDateStr()` in render or JSX:** This calls `new Date()` which is impure; ESLint `react-hooks/purity` will fail. Always call inside `useEffect`.
- **Synchronous `setState` inside `useEffect` body:** `react-hooks/set-state-in-effect` requires async callback pattern. Both fetch results must flow through `.then(setX)`.
- **Inlining hero state computation in JSX ternary:** Goal-met logic requires `habitDateStr` which is impure. Move to a dedicated `useEffect`.
- **Adding new CSS tokens for state-B background:** `--reward-soft` already exists as a `color-mix` token. Use `bg-reward-soft` or `bg-reward/10` inline. Do not add new CSS classes.
- **Showing state A "loading" skeleton for only one fetch:** If only `stats` is null but `activityData` has resolved (or vice versa), the skeleton should still show — both must be non-null before rendering the hero.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Daily goal seconds | Custom settings fetch | `/api/activity` response already includes `dailyGoalSeconds` | Activity endpoint returns settings alongside data; no second call needed |
| Today's habit date | `new Date().toISOString().slice(0,10)` | `habitDateStr(dayStartHour)` from `lib/habit.ts` | Handles the habit-day offset (day starts at configurable hour, default 2am); plain date math is wrong at 1am |
| "Goal met" detection | Re-implementing seconds sum | `activityData.days.find(d => d.date === todayStr)?.seconds ?? 0` | Days are pre-aggregated server-side; client only needs to find today's row |
| Icon for state B | SVG from scratch | lucide-react `CheckCircle` or `CheckCircle2` | lucide-react is already installed; no new dependency |

**Key insight:** The activity API was designed to give clients everything they need for streak/goal display in a single call. Using it as the goal-detection source avoids duplicating the `dailyGoalSeconds` setting lookup.

---

## Common Pitfalls

### Pitfall 1: heroState shows 'B' when dailyGoalSeconds is 0

**What goes wrong:** A user who has never configured a daily goal has `dailyGoalSeconds = 0`. The condition `todaySeconds >= 0` is always true, so the hero immediately shows "Goal met today" with zero seconds studied.

**Why it happens:** The UI-SPEC includes a guard: `activityData.dailyGoalSeconds > 0`. Omitting this guard means any session with zero goal shows as goal-met.

**How to avoid:** Always include the `dailyGoalSeconds > 0` guard in the `goalMet` computation:
```typescript
const goalMet = todaySeconds >= activityData.dailyGoalSeconds && activityData.dailyGoalSeconds > 0
```

**Warning signs:** Hero shows state B immediately on first app launch before any study.

---

### Pitfall 2: loadStats refetch after sync doesn't update heroState

**What goes wrong:** After a pull-to-refresh sync, `loadStats()` is called (updating `stats`). If `activityData` is not also refreshed, `heroState` might not recompute correctly (e.g., if the sync added cards that are now due).

**Why it happens:** The derivation `useEffect` depends on `[stats, activityData]`. If only `stats` changes, heroState will recompute — but it needs the current `activityData` in closure. This is fine as long as `activityData` is not stale. Since activity data changes very slowly (only when studying), a one-time fetch on mount is sufficient; no need to refetch after sync.

**How to avoid:** Keep `loadActivity` as mount-only. The `loadStats` callback (already called after sync) correctly updates `stats`, which triggers heroState recomputation with the cached `activityData`.

---

### Pitfall 3: Greeting rendered before effect runs (hydration flash)

**What goes wrong:** On the initial render, `greeting` is `''`. The greeting element renders nothing, then snaps into view after the microtask resolves. This is a minor but visible flash.

**Why it happens:** The greeting is set via `Promise.resolve().then(() => setGreeting(g))` — one microtask after the effect fires. This is required by `react-hooks/set-state-in-effect`.

**How to avoid:** The current pattern (inherited from existing code) already handles this correctly — greeting only renders when truthy (`{greeting && <p>…</p>}`). The blank-to-text transition is imperceptible. No change needed.

**Warning signs:** Only if the greeting appears then disappears (would indicate a state reset issue, not this pitfall).

---

### Pitfall 4: active: states omitted from CTA Link element

**What goes wrong:** The UI-SPEC requires `active:scale-[0.98] active:opacity-90` on the primary CTA Link (note: this is a Phase 8 requirement pre-implemented here per the spec). Omitting it means the CTA button has no tactile feedback on mobile, where `:hover` never fires.

**Why it happens:** Tailwind `active:` variants on `<Link>` elements work correctly — `<Link>` renders as `<a>`, which supports CSS `:active`. The only risk is forgetting to add it.

**How to avoid:** Add `active:scale-[0.98] active:opacity-90 transition-transform` to the CTA Link in all three hero state branches.

---

### Pitfall 5: State B tint uses bg-reward-soft but leaks outside the panel border

**What goes wrong:** The UI-SPEC specifies the state B tint is achieved via an **inner div** (`bg-reward/10 rounded-xl`) wrapping the content, so the outer card border stays `bg-surface-1`. If `bg-reward-soft` is applied directly to the outer panel `<section>`, the rounded corners of the panel will show the tint blending with `bg-surface-3` behind it — defeating the card-within-card visual.

**Why it happens:** `--reward-soft` is `color-mix(in srgb, var(--reward) 40%, transparent)` — it has transparency and will composite with whatever is behind it.

**How to avoid:** Apply the tint to an inner wrapper div, not the outer `<section>`:
```tsx
// CORRECT
<section className="bg-surface-1 rounded-2xl shadow-md p-6 flex flex-col gap-4">
  <div className="bg-reward/10 rounded-xl p-4 flex flex-col gap-3">
    {/* state B content */}
  </div>
</section>
```

---

## Code Examples

Verified patterns from existing codebase:

### Existing fetch pattern (loadStats — source of truth for new loadActivity)
```typescript
// Source: app/page.tsx lines 29–50
const loadStats = useCallback(() => {
  fetch('/api/stats')
    .then((r) => r.json())
    .then((data: Stats) => {
      setStats(data)
      // ... band-up detection
    })
    .catch(() => {})
}, [])
```
[VERIFIED: app/page.tsx lines 29–50]

### /api/activity response shape
```typescript
// Source: app/api/activity/route.ts lines 27–37
// GET /api/activity returns:
{
  days: Array<{ date: string, seconds: number, reviews: number }>,
  dailyGoalSeconds: number,   // from getDailyGoalSeconds()
  dayStartHour: number        // from getDayStartHour()
}
```
[VERIFIED: app/api/activity/route.ts lines 26–37]

### habitDateStr signature
```typescript
// Source: lib/habit.ts line 42
export function habitDateStr(dayStartHour: number, d: Date = new Date()): string {
  return localDateStr(new Date(d.getTime() - dayStartHour * 3_600_000))
}
// Calling `habitDateStr(2)` at 1:30am returns yesterday's date string — CORRECT
// Calling `habitDateStr(2)` at 3:00am returns today's date string — CORRECT
```
[VERIFIED: lib/habit.ts line 42]

### Greeting hour logic (existing)
```typescript
// Source: app/page.tsx lines 57–59
const h = new Date().getHours()
const g = h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
Promise.resolve().then(() => setGreeting(g))
```
[VERIFIED: app/page.tsx lines 57–59]

### Token availability confirmation
```
bg-reward-soft    → --reward-soft: color-mix(in srgb, var(--reward) 40%, transparent)  [globals.css line 36]
text-reward       → --color-reward: var(--reward)                                       [globals.css line 128]
bg-surface-1      → --color-surface-1: var(--surface-1)                                [globals.css line 122]
text-muted        → --color-muted: var(--muted)                                        [globals.css line 141]
text-foreground   → --color-foreground: var(--foreground)                              [globals.css line 113]
bg-button         → --color-button: var(--button)                                      [globals.css line 114]
bg-button-hover   → --color-button-hover: var(--button-hover)                         [globals.css line 115]
```
[VERIFIED: app/globals.css lines 111–144]

### Token escape confirmation (F-06 already fixed by Phase 4)
```
grep 'text-gray\|bg-gray\|border-gray\|bg-white' app/page.tsx → (no output)
```
[VERIFIED: grep result confirmed zero matches]

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Two hero states (due vs. all-caught-up) | Three hero states (A: due, B: goal-met, C: caught-up no goal) | Learner gets accurate situational awareness; "all caught up" no longer conflates "done and finished" with "done but keep going" |
| Greeting as `text-sm text-muted` caption | Greeting as `text-xl font-medium text-foreground` section header | Greeting anchors the page, not footnotes it |
| Static "All caught up ✓" heading | State B with reward-soft tint + checkmark icon | Visual celebration reinforces the habit loop at the goal-met moment |

**Deprecated/outdated in this phase:**
- Two-branch hero conditional (`stats.dueCards > 0 ? StateA : StateB`): replaced with three-state `heroState` variable
- `text-sm text-muted` greeting: elevated to `text-xl font-medium text-foreground`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `heroState` is stored as a separate state variable computed in a dedicated `useEffect([stats, activityData])` | Architecture Patterns, Pattern 3 | Low risk — alternative is inline JSX ternary but that requires calling `habitDateStr` in render (violates purity rule). The `useEffect` pattern is the only ESLint-compliant approach. |
| A2 | `loadActivity` is a mount-only fetch (not called after sync) | Common Pitfalls, Pitfall 2 | Low risk — activity data only changes during active study (not during sync). Stale activity data after a sync has no effect on heroState if dueCards changed (State A wins). |
| A3 | lucide-react `CheckCircle` or `CheckCircle2` is used as the state B reward icon | Don't Hand-Roll | Low risk — lucide-react 1.17.0 is installed; either icon name is valid. Exact icon choice is planner/executor discretion. |

**If this table is empty:** N/A — three low-risk assumptions documented above.

---

## Open Questions

1. **Should `loadActivity` be called after sync (alongside `loadStats`)?**
   - What we know: Sync adds/updates cards and triggers a stats refresh. Activity data does not change during sync.
   - What's unclear: Whether there's a timing edge case where a sync completes during an active study session, changing `dueCards` but not `activityData`.
   - Recommendation: Do not call `loadActivity` after sync. The heroState derivation effect handles the `stats` update correctly without refreshing activity data.

2. **Which lucide-react icon for state B checkmark?**
   - What we know: lucide-react 1.17.0 is installed; `CheckCircle`, `CheckCircle2`, and `Check` are all available.
   - What's unclear: No icon is specified in the UI-SPEC beyond "a single large checkmark or ring icon in `text-reward` at `text-4xl`".
   - Recommendation: Use `CheckCircle2` (filled circle with check) for maximum visual weight at `text-4xl`.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 6 is a pure code change to `app/page.tsx` with no new external dependencies. All required APIs (`/api/stats`, `/api/activity`) are already deployed and operational.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (via `npm test`) |
| Config file | vitest.config.ts or package.json scripts |
| Quick run command | `npm test` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HOME-01 | Hero renders State A when dueCards > 0 | manual-only | — | N/A |
| HOME-01 | Hero renders State B when dueCards === 0 and goal met | manual-only | — | N/A |
| HOME-01 | Hero renders State C when dueCards === 0 and goal not met | manual-only | — | N/A |
| HOME-02 | Greeting renders at text-xl font-medium text-foreground | manual-only | — | N/A |
| HOME-03 | Visual hierarchy: count → CTA → stats strip | manual-only | — | N/A |

**Note:** `app/page.tsx` is a `'use client'` component that fetches live APIs and renders conditional UI. Pure unit tests are not practical for the hero state logic here since the logic is tightly coupled to two fetch calls. The correct validation approach is manual inspection in the browser across three scenarios:
1. Open app with cards due (normal morning state)
2. Open app after completing all due cards, goal met
3. Open app after completing all due cards, goal not yet met

The purity helpers in `lib/habit.ts` (already pure/tested) cover the `habitDateStr` logic. The goal-met computation is a two-line conditional — not a testing candidate separately from the component.

### Wave 0 Gaps
- None — existing test infrastructure (Vitest) covers pure lib functions; the home page change requires manual verification only.

---

## Security Domain

This phase makes no authentication, authorization, or data-handling changes. The `/api/activity` endpoint is already guarded by `middleware.ts` (same auth cookie gate as all other API routes). No new attack surface is introduced.

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | — |
| V3 Session Management | no | — |
| V4 Access Control | no | — |
| V5 Input Validation | no | No user input in this phase |
| V6 Cryptography | no | — |

---

## Sources

### Primary (HIGH confidence)
- `app/page.tsx` — Current Home page implementation; confirmed state shape, fetch patterns, purity compliance
- `app/api/activity/route.ts` — Confirmed GET response shape: `{ days, dailyGoalSeconds, dayStartHour }`
- `app/api/stats/route.ts` — Confirmed `dueCards` field is returned
- `lib/habit.ts` — Confirmed `habitDateStr(dayStartHour, d?)` signature; purity requirement documented in function
- `app/globals.css` — Confirmed all required tokens exist: `reward-soft`, `reward`, `surface-1`, `muted`, `foreground`, `button`, `button-hover`
- `.planning/phases/06-home-dashboard-polish/06-UI-SPEC.md` — Approved design contract; all typography, color, copy, and interaction decisions locked

### Secondary (MEDIUM confidence)
- `.planning/ui-reviews/audit.md` — F-06 (token escapes), F-07 (active states), F-08 (greeting typography) findings confirmed from code evidence

### Tertiary (LOW confidence)
- None — all claims verified from source files in this session.

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all existing dependencies confirmed
- Architecture: HIGH — fetch patterns, purity rules, and API shapes all verified from source
- Pitfalls: HIGH — derived from ESLint rules documented in CLAUDE.md and confirmed in existing code
- Token availability: HIGH — verified against app/globals.css

**Research date:** 2026-06-27
**Valid until:** 2026-07-27 (stable codebase; tokens and API shapes unlikely to change)
