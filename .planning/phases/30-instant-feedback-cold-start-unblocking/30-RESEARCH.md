# Phase 30: Instant Feedback & Cold-Start Unblocking - Research

**Researched:** 2026-08-05
**Domain:** Next.js 16 App Router perceived-performance (skeletons, PWA manifest) + cold-path architecture (synchronous RootLayout, Vercel/Turso region pinning)
**Confidence:** HIGH (codebase claims verified by direct file reads; Next.js/Vercel mechanics verified against official docs; Turso primary-region value itself is unverifiable in this sandboxed session — flagged as an Open Question, not guessed)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01: New dedicated `--skeleton-bg` token, not raising `--surface-3`.** In dark mode `--surface-3` (`#0b0f1a`) currently equals `--background` (`#0b0f1a`), making every skeleton invisible. But `bg-surface-3` is also used in 17+ non-skeleton places found by grep across the codebase — `Nav.tsx` tab hover, `Toast.tsx`/`GlossProvider.tsx` close-button hover/active, `ProficiencyArc.tsx`'s progress-bar track, `HabitTracker.tsx`'s empty-day week-strip cells, `CardEditor.tsx`'s cancel-button hover, `Sheet.tsx`, `HabitHeatmap.tsx`, `AudioButton.tsx`, `ModeSelector.tsx`, and more. A new, isolated `--skeleton-bg` token used only by skeleton consumers avoids that blast radius entirely.
- **D-02: Dark value = the current `--surface-1` value (`#1c2030`).**
- **D-03: Light value = the current `--surface-3` value (`#f3f4f6`), and light-mode skeletons switch to the new token too.** Must be added to BOTH the `@media (prefers-color-scheme: dark)` block and the `:root[data-theme="dark"]` block in `globals.css`.
- **Consumers to migrate from `bg-surface-3` to `bg-skeleton`:** `app/study/loading.tsx`, `app/cards/loading.tsx`, `app/habits/loading.tsx`, `app/history/loading.tsx`, and the two inline skeleton blocks in `components/StudyClient.tsx` (lines ~238–240 and ~349–352). All other `bg-surface-3` usages are explicitly left unchanged.
- **D-04: Pixel-exact match, not a generic shimmer block** for the lesson-filter skeleton. Replace `StudyClient.tsx`'s `isFilterLoading` bare `Loader2` spinner with: (1) the same `h-16` slot containing two pulsing `bg-skeleton` bars positioned where the due-count number and label render, (2) a `min-h-14 rounded-2xl bg-skeleton` pulse matching the real "Start studying →" button's exact shape/height.
- **D-05: `/habits` page-load budget tightens from 3000ms to 1500ms.**
- **D-06: `/`, `/study`, `/cards` stay at 3000ms in this phase.** Their real bottlenecks aren't touched until Phases 31/32.
- **Implementation note:** `PAGE_BUDGET_MS` is currently one shared constant in a loop over all four routes — achieving D-05/D-06 requires a per-route budget map.
- **D-07: Claude looks up the Turso primary region itself** (`turso` CLI at `/opt/homebrew/bin/turso`; `turso db show korean-study` or inspect `DATABASE_URL`'s host) rather than asking the user.
- **D-08: Pin via `vercel.json`'s `regions` field**, not a Vercel-dashboard-only setting. `vercel.json` currently has no `regions` field (only `crons`).
- **PWA manifest colors (locked by ROADMAP.md wording, not discretionary):** `app/manifest.ts`'s `background_color` and `theme_color` must both change to `'#0b0f1a'` — the dark value already declared in `app/layout.tsx`'s `viewport.themeColor` dark entry.

### Claude's Discretion
- **The exact `RootLayout` mechanism for removing the blocking `await getLayoutSettings()` DB read (LAYOUT-01)** while still applying settings changes correctly on the next navigation with no color flash — not a user-facing gray area; an architectural/technical decision for research/planning. `lib/settings.ts:getLayoutSettings()` is the current blocking call (returns `buttonColor`, `rewardColor`, `readingTextScale`, `readingAid`), invoked from `app/layout.tsx`'s `async function RootLayout`. Candidates flagged for research: a settings cookie set on save (read synchronously in a non-async layout), a cached/tagged read (Next.js 16 `use cache`/`cacheLife`/`cacheTag`), or another approach — resolved in this document's Summary/Architecture Patterns/Code Examples sections.
- Exact pixel sizing/positioning of the two pulsing bars inside the due-count skeleton slot (D-04) — shape is locked (two bars, one for the number, one for the label, within the existing `h-16` slot); exact widths/heights are an implementation detail.
- Whether the region lookup happens via `turso db show` output parsing or a direct read of `DATABASE_URL`'s host — either is fine; whichever is more reliable to script.

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope. No scope-creep suggestions arose.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PERCEPT-01 | Dark-mode skeleton screens (`/study`, `/cards`, `/habits`, `/history`) are visibly distinct from the background, not the same color as `--background` | Architecture Patterns (Pattern 3, `@theme inline` token) + Code Examples (`--skeleton-bg` token, all 3 required `globals.css` blocks verified with exact line numbers) + Pitfall 3 (mirroring gotcha) + Validation Architecture (new `tests/skeleton-token.test.ts`) |
| PERCEPT-02 | PWA cold launch shows no white flash — `app/manifest.ts` `background_color`/`theme_color` match the dark theme | Code Examples (manifest color values) + Pitfall 6 (iOS Safari ignores manifest `background_color` — important caveat for UAT) + Validation Architecture (new `tests/manifest.test.ts`) |
| PERCEPT-03 | Applying a lesson-range filter on `/study` shows a content-shaped skeleton instead of a bare spinner, with no layout shift when data lands | Architecture Patterns (Recommended Project Structure) + Pitfall 4 (skeleton/real-content drift) + Validation Architecture (new `e2e/study-filter-skeleton.spec.ts`); exact target markup is in `30-UI-SPEC.md`'s Component Notes (already locked, not re-derived here) |
| LAYOUT-01 | `RootLayout` renders synchronously — no `await` DB read blocks the initial HTML response; settings changes still apply on next navigation | This is the phase's central research question — see Summary, Architectural Responsibility Map, Alternatives Considered, Pattern 1 & 2, Anti-Patterns, Pitfalls 1–2, Code Examples (full `RootLayout` + `PUT /api/settings` target shapes), Open Question 2, Security Domain (V4/V5/V14) |
| REGION-01 | Vercel function region matches the Turso primary region | Code Examples (Turso↔Vercel region mapping table, `vercel.json` target shape) + Pitfall 7 (region-code format mismatch) + Open Question 1 (actual region value unverified in this session — explicit pre-flight step required) + Environment Availability (`turso` CLI auth gap) |
</phase_requirements>

## Summary

This phase is almost entirely mechanical **except for one real architectural decision**: how `RootLayout` stops awaiting a DB read while still applying saved button/reward-color, reading-scale, and reading-aid settings correctly. Research resolves that decision with high confidence: **a non-httpOnly settings cookie, written by the `PUT /api/settings` route handler, read by a third pre-paint `<script>` tag in `app/layout.tsx`** — the same pattern already proven twice in this exact file (theme resolution, `--sab` freeze). This is the only candidate that satisfies the locked, literal wording of Success Criterion 4 ("`RootLayout` is no longer `async`"): Next.js 15+ made `cookies()`/`headers()` async Dynamic APIs with no synchronous escape hatch for Server Components, so any approach that reads settings *inside* `RootLayout`'s server render — including a `"use cache"`-wrapped `getLayoutSettings()` — necessarily keeps `RootLayout` (or a `use()`-consuming boundary inside it) async or Suspense-gated. Reading the value from a cookie in client-side JS, before first paint, sidesteps the async requirement entirely because it never touches `next/headers` in the render path.

The four remaining deliverables (dark-mode skeleton token, lesson-filter skeleton fidelity, PWA manifest colors, Vercel region pin) are direct, low-risk implementations of decisions already locked in CONTEXT.md/UI-SPEC.md — research here is confirmatory (verifying the exact current code shapes to change) plus two important **caveats** worth flagging to the planner: (1) this codebase already fought and solved a *related* staleness problem (`FreshnessWatcher`, `e2e/freshness-router-cache.spec.ts`) — its existence is strong independent confirmation that Next's Router Cache does **not** refetch shared layouts on ordinary client-side navigation, which is exactly why the cookie+script approach (not a "wait for next server render" approach) is required; (2) **iOS Safari ignores the manifest's `background_color` entirely** for home-screen launch — PERCEPT-02's manifest-color fix is correct and matches the locked wording, but the planner/user should know it fully solves the flash on Android/Chrome PWA installs while iOS's white-frame risk (this project's primary target platform, per CLAUDE.md's iOS/WebKit focus) is only partially addressed by manifest colors alone; the existing `body { background: var(--background) }` CSS is what actually protects iOS once the stylesheet parses.

**Primary recommendation:** Implement the settings-cookie + pre-paint-script mechanism for LAYOUT-01 (detailed in Code Examples below); implement all four other deliverables exactly as locked in CONTEXT.md/UI-SPEC.md; run `turso db show korean-study` at plan/execute time (not resolvable in this research session — see Open Questions) before writing `vercel.json`'s `regions` field.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dark-mode skeleton visibility (`--skeleton-bg` token) | CDN / Static (CSS, `globals.css`) | Browser / Client (Tailwind utility applied via className) | Pure CSS custom-property addition; no runtime logic |
| Lesson-filter content-shaped skeleton | Browser / Client (`StudyClient.tsx`, `'use client'`) | — | Purely a client-state-driven render branch (`isFilterLoading`); no server involvement |
| PWA cold-launch color match | CDN / Static (`app/manifest.ts`, statically generated at build) | Browser / Client (OS/browser splash renderer consumes the manifest) | Manifest is a build-time static JSON route; the actual paint decision happens in the OS/browser shell, outside app control |
| `RootLayout` synchronous render (LAYOUT-01) | Frontend Server (SSR) — must stop blocking on Backend/DB tier | Browser / Client (pre-paint `<script>` applies the cookie-sourced style before hydration) | The fix moves work OUT of the SSR tier (no DB call) and INTO the client tier (script reads a cookie) — this is a tier reassignment, not just an optimization, and must be called out to the planner so tasks aren't misassigned back into a server-only mechanism |
| Settings persistence (cookie write on save) | API / Backend (`PUT /api/settings` route handler) | — | Route handlers are the only place that can set outgoing cookies in this codebase (mirrors `POST /api/login`'s `res.cookies.set()` pattern) |
| Vercel function region pin (REGION-01) | CDN / Static (`vercel.json`, deploy-time config) | — | Not a runtime code path — a static deployment-config file read by Vercel's build/deploy pipeline |
| `/habits` perf budget tightening | — (test infrastructure, not app code) | — | Lives entirely in `e2e/perf.spec.ts`; not part of the Browser/Server/DB tier map |

## Standard Stack

No new runtime dependencies are introduced by this phase. All five deliverables are implemented with the project's existing stack (Next.js 16 App Router primitives, Tailwind v4 `@theme inline`, plain `Set-Cookie` via `NextResponse.cookies.set()`, static `vercel.json`). See Package Legitimacy Audit below — table is empty by design.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.1 `[VERIFIED: package.json]` | App Router, `loading.tsx` convention, `manifest.ts`, route handlers | Already the project's framework; no alternative considered |
| react / react-dom | 19.2.4 `[VERIFIED: package.json]` | Server Components, `'use client'` boundary | Already the project's runtime |
| tailwindcss | 4.2.2 `[VERIFIED: .claude/CLAUDE.md Technology Stack §Styling]` | `@theme inline` token exposure, `animate-pulse` utility | Already the project's styling system |

### Supporting
No supporting libraries needed — every change is either a CSS token, a plain `<script>` tag, a `NextResponse.cookies.set()` call, or a static JSON config field, all of which are native platform/framework primitives.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Settings cookie + pre-paint script | Next.js 16 `"use cache"` + `cacheTag`/`updateTag` on `getLayoutSettings()` | Rejected — requires `cacheComponents: true` in `next.config.ts` (a project-wide experimental opt-in, out of scope for "cheapest phase in the milestone"), and calling a cached async function from `RootLayout` still requires either `await` (keeps `RootLayout` `async`, violating the literal locked wording of Success Criterion 4) or a `use()`-based Suspense boundary around the `<html>`-styling logic (adds complexity for no benefit — the value doesn't change often enough to need per-request cache machinery). `[CITED: nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents]` |
| Settings cookie + pre-paint script | Keep `RootLayout` `async`, but batch the DB read behind `React.cache()`/`unstable_cache()` (memoize per-request only) | Rejected — `unstable_cache()` still requires an `await` inside `RootLayout`, and per-request memoization does nothing for the "don't block on Turso" goal since the very first read of a cold Lambda still round-trips to the DB. Does not satisfy "no longer `async`" either. |
| Settings cookie + pre-paint script | Middleware injects settings into a custom response header, RootLayout reads via `headers()` | Rejected — `headers()` is exactly as async as `cookies()` `[CITED: nextjs.org/docs/messages/sync-dynamic-apis]`; no advantage over reading the cookie directly, and adds an unnecessary middleware round-trip on every request. |
| Raising `--surface-3` for skeleton visibility | New dedicated `--skeleton-bg` token | Rejected by the user during discuss-phase (D-01) — confirmed via `grep` that `bg-surface-3` has 20 non-skeleton consuming files / 52 occurrences in this codebase `[VERIFIED: grep -rln "bg-surface-3" app/ components/, this session]`; raising it would require a design-audit pass across all 20 files. |

**Installation:** None — no new packages.

**Version verification:** `next` 16.2.1 and `react`/`react-dom` 19.2.4 confirmed directly from `package.json` `[VERIFIED: package.json]`. No package installs are part of this phase's plan.

## Package Legitimacy Audit

**Not applicable — this phase introduces zero new npm/pip/cargo dependencies.** Every deliverable (skeleton token, manifest colors, settings cookie, region pin, perf-budget map) is implemented with code/config already present in the stack. No `npm view`/`package-legitimacy check` run was needed.

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
COLD LAUNCH (PWA icon tap, or hard reload)
  │
  ▼
Browser/OS reads app/manifest.ts (static)  ──► background_color/theme_color paint
  │ (Android/Chrome: prevents white splash. iOS Safari: IGNORED — see Pitfall 6)
  ▼
Server: RootLayout renders (NOT async — zero DB/Turso calls)
  │  - <html> gets CSS-default --button/--reward/--reading-scale (matches DB defaults)
  │  - <body> ships with 3 pre-paint <script> tags: theme, --sab, [NEW] settings-cookie
  ▼
HTML byte 1 reaches browser — parse begins immediately, no Turso wait
  │
  ▼
Browser parses <script> tags in document order (before first paint):
  1. theme script         → sets data-theme attribute
  2. --sab script          → sets --sab custom property
  3. [NEW] settings script → reads document.cookie 'ks_settings',
                              calls documentElement.style.setProperty(...),
                              toggles .hangul-spaced class
  ▼
First paint — correct colors/scale/aid, no flash (script ran before paint)
  ▼
React hydrates — client components (SettingsClient, StudyClient, etc.) take over


SETTINGS SAVE FLOW
  │
  ▼
SettingsClient.tsx: instant local DOM mutation (existing, unchanged)
  │  documentElement.style.setProperty('--button', hex) — live preview, same tab
  ▼
PUT /api/settings (route handler)
  │  1. existing: writes to Setting table (Prisma/Turso) — unchanged
  │  2. [NEW]: res.cookies.set('ks_settings', <encoded 4 values>, {...})
  ▼
Response returns — cookie now present for the NEXT fresh/hard page load
  (same-tab soft <Link> navigation already correct via step 1's live DOM mutation,
   which persists because <html>/<body> are not remounted by client-side routing)


REGION PIN (deploy-time, no runtime request path)
  │
  ▼
vercel.json { "regions": ["<vercel-code>"] }  ──►  Vercel deploy pipeline pins the
                                                     function's execution region
                                                     to match Turso's primary region
                                                     (looked up via `turso db show`)
```

### Recommended Project Structure
No new files/folders. Modified files only:
```
app/
├── layout.tsx              # RootLayout de-asyncified; 3rd pre-paint <script> added
├── manifest.ts              # background_color/theme_color → '#0b0f1a'
├── globals.css               # + --skeleton-bg token (3 blocks) + @theme inline entry
├── study/loading.tsx          # bg-surface-3 → bg-skeleton
├── cards/loading.tsx          # bg-surface-3 → bg-skeleton
├── habits/loading.tsx         # bg-surface-3 → bg-skeleton
├── history/loading.tsx        # bg-surface-3 → bg-skeleton
└── api/settings/route.ts      # PUT handler sets 'ks_settings' cookie
components/
└── StudyClient.tsx            # isFilterLoading skeleton rewrite (D-04); 2 inline pulse blocks → bg-skeleton
lib/
└── settings.ts                # unchanged (still the DB source of truth; cookie is a paint-time cache, not a replacement)
vercel.json                     # + "regions": ["<code>"]
e2e/
└── perf.spec.ts                # PAGE_BUDGET_MS → per-route budget map (D-05/D-06)
```

### Pattern 1: Pre-paint `<script>` for flash-free client-only state
**What:** A `dangerouslySetInnerHTML` `<script>` tag placed early in `<body>`, wrapped in `try{}catch(e){}`, that reads a client-visible signal (localStorage or a non-httpOnly cookie) and mutates the DOM (`setAttribute`, `style.setProperty`, `classList`) *before* React hydrates.
**When to use:** Any value that (a) must be correct on the very first paint of a fresh/hard page load, (b) is not sensitive (never for auth tokens — those stay `httpOnly`), and (c) cannot be resolved server-side without a blocking data-tier call.
**Example (already in this codebase, informative precedent — `app/layout.tsx` lines 66-79, verbatim):**
```typescript
// Source: app/layout.tsx (current, pre-Phase-30) — VERIFIED: app/layout.tsx:66-79
<script
  dangerouslySetInnerHTML={{
    __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`,
  }}
/>
<script
  dangerouslySetInnerHTML={{
    __html: `(function(){try{var tmp=document.createElement('div');tmp.style.paddingBottom='env(safe-area-inset-bottom)';document.body.appendChild(tmp);var sab=getComputedStyle(tmp).paddingBottom;document.body.removeChild(tmp);document.documentElement.style.setProperty('--sab',sab||'0px');}catch(e){}})();`,
  }}
/>
```
The new settings script follows this exact shape (IIFE, `try/catch`, no imports, string-templated). This is the pattern LAYOUT-01 extends — not a new invention.

### Pattern 2: Route-handler cookie write mirrors existing auth pattern
**What:** `NextResponse.cookies.set(name, value, options)` inside a `POST`/`PUT` route handler.
**When to use:** Whenever a Route Handler needs to persist a client-readable value across page loads without a DB round trip on every subsequent render.
**Example (already in this codebase — `app/api/login/route.ts` lines 15-22, verbatim):**
```typescript
// Source: app/api/login/route.ts:15-22 — VERIFIED: app/api/login/route.ts:15-22
const res = NextResponse.json({ ok: true })
res.cookies.set(AUTH_COOKIE, token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  path: '/',
  maxAge: 60 * 60 * 24 * 365, // 1 year
})
return res
```
**Critical deviation for the new `ks_settings` cookie:** `httpOnly: true` MUST become `httpOnly: false` — the whole point is that the pre-paint `<script>` (client JS) must be able to read it via `document.cookie`. This is a deliberate, documented exception to the auth cookie's `httpOnly` convention, not an oversight — flag it explicitly in the plan/PR so it doesn't get "fixed" back to `httpOnly: true` by a future security pass. The value stored is non-secret UI preference data (hex colors, a float, a boolean), never anything auth-related.

### Pattern 3: `@theme inline` token exposure (existing, reuse exactly)
**What:** Tailwind v4's `@theme inline` block maps a CSS custom property to a generated utility-class family.
**Example (current codebase — `app/globals.css` lines 120-133, verbatim):**
```css
/* Source: app/globals.css:130-133 — VERIFIED: app/globals.css:130-133 */
@theme inline {
  --color-surface-1: var(--surface-1);
  --color-surface-2: var(--surface-2);
  --color-surface-3: var(--surface-3);
}
```
New token follows identically: `--color-skeleton: var(--skeleton-bg);` → generates `bg-skeleton`, `text-skeleton`, etc. No gotchas found with `animate-pulse` + custom `@theme inline` tokens — `animate-pulse` only toggles `opacity`, it has no color-value dependency, so any `bg-*` utility (custom-token-backed or not) works identically under it. `[ASSUMED — verified by reading the existing `animate-pulse` usages already applied to `bg-surface-3` in this exact codebase, which is functionally identical to the new `bg-skeleton` case; no external doc citation found or needed for this specific claim]`

### Anti-Patterns to Avoid
- **Reading the settings cookie via `next/headers` inside `RootLayout`:** Will force `RootLayout` to be `async` (or Suspense-gated), directly violating the locked wording of Success Criterion 4. The cookie exists specifically to be read *client-side*, not server-side.
- **Using `"use cache"` without enabling `cacheComponents: true`:** Silently has no effect / is a build error in this Next 16.2.1 project, since the flag is not currently set in `next.config.ts` `[VERIFIED: next.config.ts — read this session, contains no `cacheComponents` or `experimental` block]`. Do not add this flag as a side effect of this phase — it's a project-wide behavior change requiring its own review, out of scope for "the cheapest phase in the milestone."
- **Assuming a `<Link>` navigation re-executes `RootLayout` server-side:** It does not, by default, in this Next.js version — shared layouts persist across partial-rendering navigations in Next 15/16 `[CITED: nextjs.org/docs/15/app/guides/caching — "shared layout data won't be refetched from the server to continue to support partial rendering... Layouts are cached and reused on navigation (partial rendering). This behavior persists regardless of the staleTimes configuration."]`. This project's own `e2e/freshness-router-cache.spec.ts` and `FreshnessWatcher` component exist specifically because ordinary navigation does NOT trigger fresh server data by default `[VERIFIED: e2e/freshness-router-cache.spec.ts:1-11, components/FreshnessWatcher.tsx — read this session]` — treat this as strong in-repo confirmation, not just an external doc claim.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reading a cookie value before hydration | A custom cookie-parsing library | Plain `document.cookie.split('; ')` string parsing inside the existing pre-paint-script pattern | The value set is small (4 fields), first-party, and the existing theme/`--sab` scripts already establish the "tiny inline parser, no deps" convention for this exact spot in the codebase |
| Region-to-region latency mapping | A custom Turso↔Vercel region-code translation table maintained long-term | A one-time lookup at plan/execute time (`turso db show` + the Vercel region-list table in this doc), hardcoded into `vercel.json` | Region pinning is a one-time deploy-config decision, not a runtime concern — no ongoing maintenance burden justifies a mapping abstraction |

**Key insight:** Every deliverable in this phase is deliberately "boring" — reusing patterns and tokens already proven in this exact codebase (pre-paint scripts, `@theme inline`, `NextResponse.cookies.set()`, static `vercel.json` fields). The one place a plan could over-engineer is LAYOUT-01 — resist any temptation to introduce a new caching abstraction (`use cache`, a custom memoization layer, a KV store) when the existing script pattern already solves the exact class of problem this data belongs to (client-visible, cosmetic, must-be-correct-before-paint).

## Common Pitfalls

### Pitfall 1: Believing "no longer `async`" is negotiable
**What goes wrong:** A plan proposes keeping `RootLayout` `async` but wrapping the DB call in `unstable_cache()`/`"use cache"` "since it's not really blocking on Turso anymore, just on the cache."
**Why it happens:** The cache-based approaches genuinely do reduce/eliminate the *Turso* round trip on warm paths, which can look like it satisfies the spirit of LAYOUT-01. But Success Criterion 4's wording is explicit and two-part: "no longer `async`" AND "awaits no DB read" — both are locked, not just the DB-latency outcome.
**How to avoid:** Treat "RootLayout is a plain (non-async) function" as a hard constraint the plan must satisfy structurally, not just behaviorally. Verify with a literal read of the function signature during code review — `export default function RootLayout(` with no `async` keyword.
**Warning signs:** Any plan step that says "wrap `getLayoutSettings()` in `unstable_cache`/`"use cache"` and keep the await in `RootLayout`."

### Pitfall 2: Forgetting the `httpOnly: false` deviation gets "fixed" later
**What goes wrong:** A future security-focused pass (or this project's own `code_review` agent, since `security_enforcement: true` is on) sees a non-`httpOnly` cookie and "corrects" it to match the `ks_auth` convention, silently breaking the pre-paint script's `document.cookie` read.
**Why it happens:** `httpOnly: true` is the safe default everywhere else in this codebase (the only other cookie, `ks_auth`, is `httpOnly: true`), so pattern-matching naturally pulls toward it.
**How to avoid:** Comment the deviation explicitly at the `res.cookies.set()` call site (e.g., `// Deliberately NOT httpOnly — the pre-paint <script> in app/layout.tsx must read this via document.cookie`), matching this codebase's established "explain deliberate deviations inline" convention (see CLAUDE.md's Comment Style section).
**Warning signs:** A lint/review pass flags "insecure cookie" on `ks_settings` without context.

### Pitfall 3: `--skeleton-bg` defined in only 1 or 2 of the 3 required `globals.css` blocks
**What goes wrong:** The token works correctly under System/OS-dark (the `@media` block) but breaks under the manual "Dark" toggle (the `:root[data-theme="dark"]` block), or vice versa — this exact bug class is already flagged as a Phase 30 blocker in STATE.md.
**Why it happens:** `globals.css` intentionally duplicates every dark-mode token across two blocks (`@media (prefers-color-scheme: dark)` for OS-default and `:root[data-theme="dark"]` for the manual override) — easy to update one and forget the other.
**How to avoid:** Grep for the token name after editing (`grep -n "skeleton" app/globals.css`) and confirm exactly 3 occurrences of the color-value definition (`:root` light, `@media` dark, `[data-theme="dark"]` dark) plus 1 `@theme inline` exposure line, matching the pattern already verified for `--surface-1/2/3` in this session (`[VERIFIED: app/globals.css:33,66,87 (surface-1 as reference precedent)]`).
**Warning signs:** Skeleton is visible with System theme set to Dark but invisible after manually toggling Settings→Appearance→Dark (or vice versa).

### Pitfall 4: `isFilterLoading` skeleton drifts from the real content it stands in for
**What goes wrong:** A future edit to the real due-count/button markup (~`StudyClient.tsx` line 300-316) isn't mirrored in the skeleton (~line 269-272), reintroducing the layout shift PERCEPT-03 exists to fix.
**Why it happens:** The two blocks are visually similar but structurally independent JSX — no shared component enforces parity.
**How to avoid:** The UI-SPEC's Component Notes section (already read this session) provides the exact target markup; the plan should note this as a "these two blocks must be edited together" comment at both sites, or (stronger) extract a tiny shared wrapper component if this proves to drift in future phases — not required for this phase, but worth flagging as a review checkpoint.
**Warning signs:** `git diff` touching the real due-count JSX without a matching diff in the `isFilterLoading` branch.

### Pitfall 5: `PAGE_BUDGET_MS` per-route refactor breaks the `for` loop's shared variable capture
**What goes wrong:** Converting the single `PAGE_BUDGET_MS` constant + `for (const route of [...])` loop (current shape, `e2e/perf.spec.ts` lines 26, 55-56, 66 — verified this session) into a per-route budget map done carelessly (e.g., closing over a mutable loop variable) can silently apply the wrong budget to the wrong route.
**Why it happens:** JavaScript `for...of` with `const route` is loop-safe already (block-scoped), but a map lookup keyed by `route` needs a matching entry for all 4 routes or `undefined` will make every assertion `toBeLessThan(undefined)`, which is always `false` (test fails loudly) — actually safe, but confusing to debug if the map is incomplete.
**How to avoid:** Use a typed `Record<string, number>` (or a small array of `{route, budget}` pairs) covering exactly `/`, `/study`, `/cards`, `/habits`, with a TypeScript compile check ensuring all 4 keys are present (e.g., `satisfies Record<'/'|'/study'|'/cards'|'/habits', number>`).
**Warning signs:** A perf test for one route silently uses `NaN`/`undefined` as its budget.

### Pitfall 6: Assuming manifest color changes fully fix white-flash on iOS
**What goes wrong:** PERCEPT-02 ships (manifest colors match dark theme), team considers "no white frame at any point" fully verified after testing only on Android/Chrome or desktop, but the iOS home-screen PWA (this project's primary real-world usage context, per CLAUDE.md's iOS/WebKit-focused conventions — home-indicator safe-area handling, `apple-icon.png`, no Background Sync API) still shows a brief native white flash on cold launch.
**Why it happens:** iOS Safari does not use the Web App Manifest's `background_color` for its home-screen launch splash at all — it currently relies on proprietary `apple-touch-startup-image` `<link>` tags (which this project does not define) `[CITED: developer.apple.com/forums/thread/733490; web.dev/learn/pwa/enhancements — "Safari on iOS and iPadOS currently ignore this field" re: background_color]`.
**How to avoid:** Implement PERCEPT-02 exactly as locked (manifest colors matching dark theme) — this is still correct and required, and it demonstrably helps Android/Chrome. For iOS specifically, the *actual* protection against a flash comes from the pre-existing `body { background: var(--background) }` CSS rule (`[VERIFIED: app/globals.css:155-156]`) taking effect the instant the stylesheet parses — verify Success Criterion 2 on a real iOS device during UAT, and if a residual flash is observed there, treat it as a known platform limitation to note (not a regression to chase within this phase) rather than something the manifest change alone can close. `apple-touch-startup-image` generation is out of scope (not in CONTEXT.md's decisions or UI-SPEC).
**Warning signs:** UAT tester on iPhone reports "still see a flash for a split second" after PERCEPT-02 ships, while Android testers report clean launches.

### Pitfall 7: Region code format mismatch between Turso and Vercel
**What goes wrong:** Turso's location codes (`iad`, `sjc`, `fra`, `lhr`, `ams`, `syd`, etc. — Fly.io-derived, no trailing digit) `[CITED: docs.turso.tech/cli/db/locations]` are copy-pasted directly into `vercel.json`'s `regions` array, which expects Vercel's own codes (`iad1`, `sfo1`, `fra1`, `lhr1`, etc. — trailing digit, and NOT always the same 3-letter prefix, e.g., Turso's `sjc` has no exact Vercel equivalent).
**Why it happens:** The two platforms' codes look superficially similar (both inherited loosely from airport codes) but are distinct enumerations.
**How to avoid:** Use the explicit mapping table below (Code Examples section) rather than assuming a 1:1 string match; when Turso's code has no exact Vercel match (e.g., `sjc`), pick the geographically nearest Vercel region from the official list.
**Warning signs:** `vercel.json` deploy fails validation, or deploys successfully but to a region far from Turso's primary (defeats REGION-01's purpose).

## Code Examples

### LAYOUT-01: `RootLayout` becomes non-async
```typescript
// app/layout.tsx — target shape after LAYOUT-01
// (buttonStyle removed; CSS :root defaults in globals.css already match
// DEFAULT_ACTION_COLOR/DEFAULT_REWARD_COLOR — VERIFIED this session:
// lib/palettes.ts:10-11 `export const DEFAULT_ACTION_COLOR = '#3b82f6'` /
// `DEFAULT_REWARD_COLOR = '#f97316'` match app/globals.css:24,38
// `--button: #3b82f6` / `--reward: #f97316` exactly)

export default function RootLayout({   // no `async`
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: /* existing theme script, unchanged */ '' }} />
        <script dangerouslySetInnerHTML={{ __html: /* existing --sab script, unchanged */ '' }} />
        {/* NEW: pre-paint settings-cookie script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{
              var m=document.cookie.match(/(?:^|; )ks_settings=([^;]*)/);
              if(!m)return;
              var v=JSON.parse(decodeURIComponent(m[1]));
              var h=document.documentElement;
              if(v.buttonColor){h.style.setProperty('--button',v.buttonColor);h.style.setProperty('--button-foreground',v.buttonFg);}
              if(v.rewardColor){h.style.setProperty('--reward',v.rewardColor);h.style.setProperty('--reward-foreground',v.rewardFg);}
              if(v.readingTextScale){h.style.setProperty('--reading-scale',String(v.readingTextScale));}
              if(v.readingAid){h.classList.add('hangul-spaced');}
            }catch(e){}})();`,
          }}
        />
        <ThemeWatcher />
        <FreshnessWatcher>{/* ...unchanged... */}</FreshnessWatcher>
      </body>
    </html>
  )
}
```
Note: `buttonFg`/`rewardFg` (the pre-computed `readableForeground()` output) should be stored IN the cookie payload at save time (computed server-side in the route handler, which already imports `readableForeground` — see `lib/color.ts`), not recomputed in the inline script, to avoid duplicating the WCAG-luminance algorithm in two places.

### PUT /api/settings: write the cookie
```typescript
// app/api/settings/route.ts — PUT handler, additive change
import { readableForeground } from '@/lib/color'

export async function PUT(req: NextRequest) {
  // ...existing body parsing + Promise.all(...) unchanged...
  const res = NextResponse.json({ /* ...existing fields... */ })
  res.cookies.set('ks_settings', encodeURIComponent(JSON.stringify({
    buttonColor: newColor,
    buttonFg: readableForeground(newColor),
    rewardColor: newReward,
    rewardFg: readableForeground(newReward),
    readingTextScale: newScale,
    readingAid: newAid,
  })), {
    httpOnly: false, // Deliberate — see Pitfall 2. Non-secret UI preference data only.
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  })
  return res
}
```

### Turso ↔ Vercel region mapping (for REGION-01)
```
# Step 1 — find Turso's primary region (run at plan/execute time; NOT run in this
# research session — turso CLI here is unauthenticated, see Open Questions):
turso db show korean-study
# Look for the "Database Instances" table; the row with TYPE=primary names the
# region in its LOCATION column (Turso's 3-letter code, e.g. "iad", "sjc", "fra").
# Fallback / cross-check: turso db show korean-study --url
#   (does NOT reliably encode region in the hostname for non-AWS-migrated DBs —
#   use only as a sanity check, not the primary source)

# Step 2 — map to the nearest Vercel region code:
```
| Turso code (Fly.io-derived) `[CITED: docs.turso.tech/cli/db/locations]` | Vercel code `[CITED: vercel.com/docs/regions]` | Notes |
|---|---|---|
| `iad` | `iad1` | Exact match (Washington, D.C.) |
| `fra` | `fra1` | Exact match (Frankfurt) |
| `lhr` | `lhr1` | Exact match (London) |
| `cdg` | `cdg1` | Exact match (Paris) |
| `syd` | `syd1` | Exact match (Sydney) |
| `sin` | `sin1` | Exact match (Singapore) |
| `hkg` | `hkg1` | Exact match (Hong Kong) |
| `gru` | `gru1` | Exact match (São Paulo) |
| `arn` | `arn1` | Exact match (Stockholm) |
| `yul` | `yul1` | Exact match (Montréal) |
| `bom` | `bom1` | Exact match (Mumbai) |
| `sjc` | `sfo1` (nearest — no exact Vercel match) | Both San Francisco Bay Area |
| `nrt` | `hnd1` (nearest — no exact Vercel match) | Both Tokyo |
| `ams` | `dub1` or `fra1` (nearest — no exact Vercel match) | No Amsterdam Vercel region; pick by proximity to actual users |

```json
// vercel.json — additive field, sibling to existing "crons"
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "regions": ["<vercel-code-from-table-above>"],
  "crons": [
    { "path": "/api/cron/sync", "schedule": "0 10 * * *" }
  ]
}
```
`[VERIFIED: vercel.json — read this session, current content is exactly the `crons`-only object shown as the "before" state above]`. Hobby plan supports exactly one region `[CITED: vercel.com/docs/functions/configuring-functions/region — "Hobby: Single region"]`.

### `e2e/perf.spec.ts`: per-route budget map (D-05/D-06)
```typescript
// Current (verified this session, e2e/perf.spec.ts:26,55-56):
//   const PAGE_BUDGET_MS = 3000
//   for (const route of ['/', '/study', '/cards', '/habits']) {
//     test(`page-load budget: ${route}`, ...) { ... expect(median).toBeLessThan(PAGE_BUDGET_MS) }
//   }

// Target shape:
const PAGE_BUDGETS_MS: Record<'/' | '/study' | '/cards' | '/habits', number> = {
  '/': 3000,       // D-06 — unchanged, real bottleneck not fixed until Phase 31/32
  '/study': 3000,  // D-06 — unchanged
  '/cards': 3000,  // D-06 — unchanged
  '/habits': 1500, // D-05 — tightened; cleanest pure-round-trip signal
}
for (const route of Object.keys(PAGE_BUDGETS_MS) as Array<keyof typeof PAGE_BUDGETS_MS>) {
  test(`page-load budget: ${route}`, async ({ page }) => {
    // ...unchanged sampling logic...
    expect(median(samples.map((s) => s.dcl))).toBeLessThan(PAGE_BUDGETS_MS[route])
  })
}
```

### `--skeleton-bg` token (D-01–D-03)
```css
/* app/globals.css — 3 required locations + 1 @theme inline exposure */
:root {
  /* ...existing... */
  --skeleton-bg: #f3f4f6; /* light — matches current --surface-3 light value */
}
@media (prefers-color-scheme: dark) {
  :root {
    /* ...existing... */
    --skeleton-bg: #1c2030; /* dark — matches current --surface-1 dark value */
  }
}
:root[data-theme="dark"] {
  /* ...existing... */
  --skeleton-bg: #1c2030; /* MUST be byte-identical to the @media block above */
}
@theme inline {
  /* ...existing... */
  --color-skeleton: var(--skeleton-bg);
}
```
Values verified against current `--surface-1`/`--surface-3` definitions: light `--surface-3: #f3f4f6` at `app/globals.css:35,107`; dark `--surface-1: #1c2030` at `app/globals.css:66,87` `[VERIFIED: app/globals.css:35,66,87,107 — read this session]`.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Synchronous `cookies()`/`headers()` in Server Components (backwards-compat path) | Async-only Dynamic APIs | Next.js 15 (2024), carried into 16 | Any server-side cookie read now requires `await`, which is exactly why this phase's LAYOUT-01 mechanism must be client-side (a pre-paint script), not server-side |
| `unstable_cache()` / ad hoc `fetch()` cache options | `"use cache"` directive + `cacheComponents: true` (replaces `experimental.dynamicIO`/`experimental.useCache`) | Next.js 16 | Available in this project's Next version but NOT enabled (`next.config.ts` has no `cacheComponents` flag) — considered and rejected for LAYOUT-01, see Alternatives Considered |
| Vercel Hobby: single fixed default region (`iad1`), no user choice | Hobby customers can select their preferred single region via `vercel.json` `regions` or dashboard | Documented in a 2026 Vercel changelog (surfaced during WebSearch this session) `[CITED: vercel.com/changelog/hobby-customers-can-now-select-their-preferred-region-for-serverless]` | Confirms REGION-01 (single-region pin) is fully supported on this project's Hobby plan — no plan upgrade required |

**Deprecated/outdated:** None directly relevant — all findings reflect current (2026) Next.js 16.2.1 / Vercel platform behavior.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `animate-pulse` has no interaction issues with custom `@theme inline`-registered color tokens | Pattern 3 | Low — reasoned from `animate-pulse`'s documented opacity-only mechanism plus the fact this exact combination (`animate-pulse` + `bg-surface-3`, itself a `@theme inline` token) already works in the current codebase; if wrong, symptom would be immediately visible (skeleton doesn't pulse) and trivially fixable |
| A2 | The Turso primary region for `korean-study` could not be determined in this research session (CLI unauthenticated in sandbox) | Open Questions / Code Examples (region mapping) | Medium — if the planner/executor skips actually running `turso db show korean-study` and guesses a region, REGION-01 could pin to the wrong Vercel region, silently reintroducing (not fixing) the cross-region latency this phase exists to remove. Flagged explicitly below as a required pre-flight step, not left implicit. |

## Open Questions

1. **What is `korean-study`'s actual Turso primary region?**
   - What we know: The lookup method (`turso db show korean-study`, reading the `TYPE=primary` row's `LOCATION` column) and the Turso→Vercel code-mapping table (Code Examples above).
   - What's unclear: The actual value — this research session's `turso` CLI is installed (`/opt/homebrew/bin/turso`, confirmed `[VERIFIED: which turso, this session]`) but **not authenticated** (`turso db show`/`db list` both return "You are not logged in" `[VERIFIED: turso db list, this session]`), and reading `.env`'s `DATABASE_URL` value directly was not attempted further than confirming the key exists (`grep -c` only, per this session's sandboxing) since the hostname format for this project's specific Turso tier (classic vs. AWS-migrated) is not itself confirmable from this session either.
   - Recommendation: The planner should insert this as the **first task** in the region-pin plan/wave: `turso auth login` (if not already authenticated in the real dev environment) → `turso db show korean-study` → record the primary region → consult the mapping table above → write `vercel.json`. This is a `checkpoint:human-verify`-worthy step only in the sense that it requires an authenticated terminal session the researcher doesn't have — not because the data is risky, just because it's unverifiable here.

2. **Does a `<Link>`-based soft navigation between this app's own routes ever re-execute `RootLayout` server-side today (pre-Phase-30), or does the current "async RootLayout" implementation already only take effect on hard reloads?**
   - What we know: Next.js 15/16's default partial-rendering behavior does NOT refetch shared layouts on ordinary navigation `[CITED: nextjs.org/docs/15/app/guides/caching]`, and this project's own `FreshnessWatcher`/`e2e/freshness-router-cache.spec.ts` exist specifically because page-level segments also don't auto-refresh without an explicit `router.refresh()` trigger `[VERIFIED: components/FreshnessWatcher.tsx, e2e/freshness-router-cache.spec.ts — read this session]`.
   - What's unclear: Whether `RootLayout` specifically (as opposed to page segments) was ever actually being refetched by ordinary soft navigation in this app's current shipped behavior — if it wasn't, then "settings apply on next navigation" was arguably already only true for hard reloads even before this phase, meaning the new cookie+script mechanism doesn't need to handle a soft-nav case beyond what `SettingsClient.tsx`'s existing live-DOM-mutation already covers.
   - Recommendation: Not blocking — the cookie+script design satisfies BOTH interpretations correctly (fresh/hard loads get the correct value from the script; same-tab soft navigation already gets the correct value from `SettingsClient.tsx`'s pre-existing direct DOM mutation, which persists because `<html>`/`<body>` aren't remounted by client routing). No task should depend on resolving this ambiguity further; UAT should simply verify the literal UI-SPEC row's held-out check ("save → navigate → no flash") across BOTH a soft `<Link>` navigation and a hard reload, since both are cheap to test and the design already covers both.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `turso` CLI | REGION-01 (region lookup) | ✓ (installed) / ✗ (not authenticated in this research session) | unknown — `--version` not run | Run `turso auth login` in the actual dev/execute environment before the region-pin task; this is expected to succeed there since STATE.md/CONTEXT.md both state the CLI is the user's confirmed, normally-authenticated tool |
| Vercel CLI | REGION-01 (optional verification) | Not probed this session | — | `vercel.json` is the source of truth per D-08; CLI verification (`vercel --regions`) is optional, not required |
| Next.js dev/build toolchain | All 5 requirements | ✓ | 16.2.1 `[VERIFIED: package.json]` | — |

**Missing dependencies with no fallback:** none — the one gap (turso auth) has a clear, low-effort fallback (log in at execute time).

**Missing dependencies with fallback:** `turso` CLI authentication (see above).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (unit, `npm test`) `[VERIFIED: package.json scripts.test = "vitest run"]` + Playwright (e2e, `npm run test:e2e`) `[VERIFIED: package.json scripts.test:e2e = "playwright test"]` |
| Config file | `vitest.config.ts` (unit); `playwright.config.ts` (e2e, prod-build server on port 3100, isolated SQLite test DB) `[VERIFIED: playwright.config.ts:21-24 — read this session]` |
| Quick run command | `npm test -- <pattern>` (unit); `npx playwright test <file>` (e2e) |
| Full suite command | `npm test` / `npm run test:e2e` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERCEPT-01 | `bg-skeleton` resolves to a visibly-distinct color from `--background` in dark mode, across all 4 `loading.tsx` files + 2 `StudyClient.tsx` inline states | unit (pure value check — no DOM needed, just parse `globals.css` custom properties or assert the two hex values differ) | new test, e.g. `tests/skeleton-token.test.ts` | ❌ Wave 0 |
| PERCEPT-02 | `app/manifest.ts` returns `background_color`/`theme_color` both `'#0b0f1a'` | unit (call the exported `manifest()` function directly — it's a pure function, no Next runtime needed) | `npx vitest run tests/manifest.test.ts` | ❌ Wave 0 |
| PERCEPT-03 | `isFilterLoading` skeleton occupies the same `h-16`/`min-h-14` slot as real content, no shift | e2e (bounding-box comparison before/after `isFilterLoading` flips, or structural `data-testid` presence check) | new spec, e.g. `e2e/study-filter-skeleton.spec.ts` | ❌ Wave 0 |
| LAYOUT-01 | `RootLayout` is not `async`; a saved settings change survives a fresh navigation with no flash | unit (static check: `app/layout.tsx`'s `RootLayout` export is a plain function, e.g. via source-text assertion or a lightweight AST check) + e2e (save a setting, hard-reload, assert the pre-paint script applied the value before any hydration-driven change is observable) | unit: new `tests/root-layout-sync.test.ts`; e2e: extend an existing settings-flow spec or add `e2e/settings-flash.spec.ts` | ❌ Wave 0 (both) |
| REGION-01 | `/habits` median DCL < 1500ms; other 3 routes stay < 3000ms | e2e (existing) | `npx playwright test e2e/perf.spec.ts` | ✅ (needs the D-05/D-06 budget-map edit, not a new file) |

### Sampling Rate
- **Per task commit:** `npm test -- <touched-file-pattern>` (unit tests are fast, no DB/API needed per CLAUDE.md's `npm test` description)
- **Per wave merge:** `npm run test:e2e` (full Playwright suite — this project's e2e harness runs against an isolated prod-build server + throwaway SQLite DB, so it's safe to run in full without touching the real dev DB)
- **Phase gate:** Full suite green (`npm test && npm run test:e2e`) before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/skeleton-token.test.ts` — covers PERCEPT-01 (light/dark `--skeleton-bg` value assertions; can read `app/globals.css` as text and regex-extract, matching this project's existing pure-function-testing style — no jsdom needed)
- [ ] `tests/manifest.test.ts` — covers PERCEPT-02 (direct call to `manifest()` export)
- [ ] `tests/root-layout-sync.test.ts` — covers LAYOUT-01's structural half ("not async")
- [ ] `e2e/study-filter-skeleton.spec.ts` — covers PERCEPT-03
- [ ] `e2e/settings-flash.spec.ts` (or an addition to an existing settings e2e spec, if one exists — not confirmed present this session) — covers LAYOUT-01's behavioral half ("no flash on next navigation")

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | This phase does not touch `ks_auth`/login; the new `ks_settings` cookie is a separate, deliberately non-`httpOnly`, non-sensitive cookie — see V4/V14 below for why this is safe |
| V3 Session Management | no | `ks_settings` is not a session token; it carries no identity or auth claim, only cosmetic UI preferences (hex colors, a float scale, a boolean) |
| V4 Access Control | yes | The `ks_settings` cookie MUST NOT be trusted as an authorization signal anywhere — it is read only for paint-time CSS values. `middleware.ts`'s existing `ks_auth`-based gate is untouched and remains the sole access-control mechanism `[VERIFIED: middleware.ts — read this session, unaffected by this phase's changes]` |
| V5 Input Validation | yes | The pre-paint script's cookie parse MUST be wrapped in `try/catch` (matching the existing theme/`--sab` scripts' convention) so a malformed/tampered `ks_settings` cookie value degrades silently to CSS defaults rather than throwing and blocking page render. The route handler should also continue validating hex-color format server-side before writing to both the DB and the cookie (existing `HEX_RE` regex in `lib/settings.ts` already does this for the DB write path — the cookie write should reuse the same already-validated/clamped values, not re-derive from raw request body) |
| V6 Cryptography | no | No cryptographic operation is introduced; `ks_settings` is plaintext (non-sensitive by design) |
| V14 Configuration | yes | `vercel.json`'s new `regions` field and the cookie's `secure`/`sameSite` flags are both deployment/security configuration. Mirror the existing `ks_auth` cookie's `secure: process.env.NODE_ENV === 'production'` pattern exactly; use `sameSite: 'lax'` (not `'strict'`) since this cookie has no CSRF-sensitive use, and `'lax'` avoids any edge case where a same-site top-level navigation might otherwise drop it (not that this matters functionally here, but it's the more conventional default for non-auth cookies) |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Cookie tampering (`ks_settings` value edited by the end user via browser devtools) | Tampering | Low severity by design — worst case is a broken/default paint (wrong button color, wrong reading scale), never a privilege or data-access change, because the cookie is read only by a `try/catch`-wrapped paint script and never trusted by any server-side logic or `middleware.ts`. No server-side validation of the cookie's contents is needed beyond the client script's defensive `try/catch` (V5 above) — this is a UI-cosmetic value, not a security boundary. |
| Cookie injection via XSS (a hypothetical future XSS bug reading/writing `document.cookie`) | Information Disclosure / Tampering | `ks_settings` is deliberately scoped to non-sensitive data specifically so that even a worst-case XSS read/write of this particular cookie has no security consequence (unlike `ks_auth`, which stays `httpOnly` and is unaffected by this phase) |

## Sources

### Primary (HIGH confidence)
- `app/layout.tsx`, `lib/settings.ts`, `app/manifest.ts`, `vercel.json`, `e2e/perf.spec.ts`, `app/globals.css`, `components/StudyClient.tsx`, `app/*/loading.tsx`, `app/api/settings/route.ts`, `app/api/login/route.ts`, `lib/auth.ts`, `lib/color.ts`, `lib/palettes.ts`, `middleware.ts`, `next.config.ts`, `package.json`, `playwright.config.ts`, `e2e/freshness-router-cache.spec.ts`, `components/FreshnessWatcher.tsx` — all read directly in this session (VERIFIED tags throughout cite exact line ranges)
- `.planning/phases/30-instant-feedback-cold-start-unblocking/30-CONTEXT.md`, `30-UI-SPEC.md`, `30-DISCUSSION-LOG.md`, `.planning/REQUIREMENTS.md`, `.planning/STATE.md` — read directly this session

### Secondary (MEDIUM confidence — WebSearch/WebFetch cross-checked against official docs)
- nextjs.org/docs/messages/sync-dynamic-apis — cookies()/headers() async requirement
- nextjs.org/docs/15/app/guides/caching — shared-layout non-refetch behavior on partial rendering
- nextjs.org/docs/app/api-reference/config/next-config-js/cacheComponents — `"use cache"` requires opt-in flag
- vercel.com/docs/functions/configuring-functions/region — `regions` field syntax, Hobby single-region limit
- vercel.com/docs/regions — full Vercel region-code list
- docs.turso.tech/cli/db/show, docs.turso.tech/cli/db/locations — Turso CLI region-lookup commands
- developer.apple.com/forums/thread/733490, web.dev/learn/pwa/enhancements — iOS Safari ignores manifest `background_color`
- vercel.com/changelog/hobby-customers-can-now-select-their-preferred-region-for-serverless — Hobby region-selection availability

### Tertiary (LOW confidence)
- None retained — all WebSearch findings in this document were cross-checked against at least one official-docs source before being cited.

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new dependencies; every mechanism verified against project source
- Architecture (LAYOUT-01 mechanism): HIGH — the cookie+script recommendation is derived from (a) the literal, locked wording of Success Criterion 4, (b) verified Next.js async-Dynamic-API constraints, and (c) an exact, already-shipped precedent pattern in this same file
- Region pin (REGION-01): MEDIUM — mechanism (`vercel.json` `regions` field) is HIGH confidence; the actual Turso primary-region *value* is unverified (Open Question 1) because this research session's `turso` CLI is unauthenticated
- Pitfalls: HIGH — all 7 are either directly reasoned from verified codebase state or backed by an official-docs citation

**Research date:** 2026-08-05
**Valid until:** 30 days (stable stack; Next.js caching primitives are the fastest-moving part of this research and worth re-checking if this phase's execution slips past ~2026-09-05)
