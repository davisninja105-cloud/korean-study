# Phase 30: Instant Feedback & Cold-Start Unblocking - Pattern Map

**Mapped:** 2026-08-05
**Files analyzed:** 10 (all modifications — no new files this phase)
**Analogs found:** 10 / 10 (all are self-analogs: every "new" pattern is an in-file or in-repo precedent, per RESEARCH.md's explicit finding that this phase reuses existing patterns exhaustively)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `app/layout.tsx` | provider/layout (RootLayout) | request-response (SSR) + client pre-paint hydration | `app/layout.tsx` itself (existing theme + `--sab` pre-paint `<script>` pattern, lines 64-79) | exact — extending an established in-file pattern |
| `app/api/settings/route.ts` | route (API) | CRUD (settings write) | `app/api/login/route.ts` (cookie-setting route handler, lines 14-23) | role-match (route→cookie), different resource |
| `app/globals.css` | config (CSS tokens) | transform (design token → utility class) | `app/globals.css` itself, `--surface-1/2/3` token block (3-location dark-mirroring pattern) | exact — same file, same pattern shape |
| `app/manifest.ts` | config (PWA manifest) | request-response (static JSON route) | `app/manifest.ts` itself (existing `background_color`/`theme_color` fields) | exact — value-only change |
| `app/study/loading.tsx` | component (skeleton) | request-response (static SSR fallback) | `app/cards/loading.tsx` / `app/habits/loading.tsx` (sibling `loading.tsx` files, identical `bg-surface-3 animate-pulse` convention) | exact |
| `app/cards/loading.tsx` | component (skeleton) | request-response | `app/study/loading.tsx` / `app/habits/loading.tsx` | exact |
| `app/habits/loading.tsx` | component (skeleton) | request-response | `app/study/loading.tsx` / `app/cards/loading.tsx` | exact |
| `app/history/loading.tsx` | component (skeleton) | request-response | `app/study/loading.tsx` / `app/cards/loading.tsx` / `app/habits/loading.tsx` | exact |
| `components/StudyClient.tsx` (skeleton edits) | component (client) | event-driven (client state → render branch) | `components/StudyClient.tsx` itself — the real due-count/button markup (~line 300-316) that the `isFilterLoading` branch (~line 269-272) must dimensionally mirror | exact — sibling block in same file |
| `vercel.json` | config (deploy) | batch (deploy-time, no runtime request) | `vercel.json` itself (existing `crons` array — sibling top-level field) | exact |
| `e2e/perf.spec.ts` | test | batch (CI measurement loop) | `e2e/perf.spec.ts` itself (existing `PAGE_BUDGET_MS` constant + `for...of` loop) | exact — refactor of existing test, not a new pattern |

## Pattern Assignments

### `app/layout.tsx` (provider/layout, request-response + pre-paint hydration)

**Analog:** itself — `app/layout.tsx` lines 46-92 (current, pre-Phase-30)

**Current imports** (lines 1-9):
```typescript
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Nav from '@/components/Nav'
import ThemeWatcher from '@/components/ThemeWatcher'
import FreshnessWatcher from '@/components/FreshnessWatcher'
import { GlossProvider } from '@/components/GlossProvider'
import { getLayoutSettings } from '@/lib/settings'
import { readableForeground } from '@/lib/color'
import './globals.css'
```
`getLayoutSettings` import must be removed (no longer called in `RootLayout`); `readableForeground` moves to being used only inside `app/api/settings/route.ts` (server-side, at cookie-write time), so its import here can also be dropped once `buttonStyle` inline computation is removed.

**Current blocking pattern to remove** (lines 46-59):
```typescript
export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const { buttonColor, rewardColor, readingTextScale: readingScale, readingAid } =
    await getLayoutSettings()
  const buttonStyle = {
    '--button': buttonColor,
    '--button-foreground': readableForeground(buttonColor),
    '--reward': rewardColor,
    '--reward-foreground': readableForeground(rewardColor),
    '--reading-scale': readingScale,
  } as React.CSSProperties
```
Target: drop `async`, drop the `await getLayoutSettings()` call, drop `buttonStyle` — `<html>` renders with CSS `:root` defaults only (which RESEARCH.md confirms already match `DEFAULT_ACTION_COLOR`/`DEFAULT_REWARD_COLOR` from `lib/palettes.ts:10-11`).

**Pre-paint `<script>` pattern to copy exactly** (lines 64-79, the two existing scripts — this IS the pattern the new 3rd script must match structurally):
```typescript
{/* Pre-paint theme resolution — runs during HTML parse, before first paint,
    so a stored/System dark preference never flashes light on load. */}
<script
  dangerouslySetInnerHTML={{
    __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.setAttribute('data-theme',d?'dark':'light');}catch(e){}})();`,
  }}
/>
{/* Pre-paint safe-area-inset-bottom freeze — sets --sab before first paint so
    the main content bottom padding and nav bar are correct on iPhones with a
    home indicator even before React hydration fires. The Nav useEffect guard
    (if !existing) becomes a no-op in the common case. */}
<script
  dangerouslySetInnerHTML={{
    __html: `(function(){try{var tmp=document.createElement('div');tmp.style.paddingBottom='env(safe-area-inset-bottom)';document.body.appendChild(tmp);var sab=getComputedStyle(tmp).paddingBottom;document.body.removeChild(tmp);document.documentElement.style.setProperty('--sab',sab||'0px');}catch(e){}})();`,
  }}
/>
```
**Copy this shape exactly** for the new 3rd script (IIFE, `try{}catch(e){}`, no imports, template-string `__html`, explanatory comment above it): read `document.cookie` for `ks_settings`, `JSON.parse` the decoded value, and call `documentElement.style.setProperty(...)` / `classList.add('hangul-spaced')`. See RESEARCH.md Code Examples § "LAYOUT-01: RootLayout becomes non-async" for the exact target script body.

**`<html>` tag change:** currently `style={buttonStyle} className={...${readingAid ? ' hangul-spaced' : ''}}`. Target: drop the `style` prop entirely (script sets `--button`/`--reward`/`--reading-scale` via `style.setProperty` post-parse instead) and drop the inline `readingAid` ternary from `className` (script does `classList.add('hangul-spaced')` conditionally instead).

---

### `app/api/settings/route.ts` (route/CRUD, cookie write)

**Analog:** `app/api/login/route.ts` lines 14-23 (only other cookie-writing route in the codebase)

**Auth cookie pattern to adapt** (verbatim, lines 14-23):
```typescript
const token = await computeAuthToken()
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

**Current PUT handler to extend** (lines 18-54, full file shown above) — the target adds a `res.cookies.set('ks_settings', ...)` call right before `return res` (reuse `NextResponse.json({...})` result, assign to `const res`, mutate, then return `res` instead of returning the `NextResponse.json(...)` expression directly). Import `readableForeground` from `@/lib/color` (already used in `app/layout.tsx` today — RESEARCH.md notes this computation must move server-side into this route so the client script never re-derives WCAG luminance).

**Critical deviation from the `AUTH_COOKIE` analog:** `httpOnly: false` (not `true`) — the whole point is the pre-paint script must read it via `document.cookie`. Comment this explicitly at the call site per the codebase's "explain deliberate deviations inline" convention (see CLAUDE.md Comment Style). Use `sameSite: 'lax'` (not `'strict'` like `AUTH_COOKIE`) since this is non-CSRF-sensitive.

Full target shape is in RESEARCH.md Code Examples § "PUT /api/settings: write the cookie" — reuse verbatim (already-validated `newColor`/`newReward`/`newScale`/`newAid` values from the existing `Promise.all` destructure, no re-derivation from raw body).

---

### `app/globals.css` (config, dark-token-mirroring)

**Analog:** itself — the existing `--surface-1/2/3` token pattern (3-location + `@theme inline` shape, referenced at lines ~35, 66, 87, 107, 130-133 per RESEARCH.md verification)

**`@theme inline` exposure pattern to copy** (verbatim, lines 130-133):
```css
@theme inline {
  --color-surface-1: var(--surface-1);
  --color-surface-2: var(--surface-2);
  --color-surface-3: var(--surface-3);
}
```
Add sibling line: `--color-skeleton: var(--skeleton-bg);`

**3-location dark-mirroring pattern** — add `--skeleton-bg` to all three blocks (light `:root`, `@media (prefers-color-scheme: dark) { :root { ... } }`, `:root[data-theme="dark"] { ... }`), with the dark value byte-identical between the last two. Exact values locked by CONTEXT.md D-01–D-03 and RESEARCH.md Code Examples § "`--skeleton-bg` token":
```css
:root {
  --skeleton-bg: #f3f4f6; /* light — matches current --surface-3 light value */
}
@media (prefers-color-scheme: dark) {
  :root {
    --skeleton-bg: #1c2030; /* dark — matches current --surface-1 dark value */
  }
}
:root[data-theme="dark"] {
  --skeleton-bg: #1c2030; /* MUST be byte-identical to the @media block above */
}
```

---

### `app/manifest.ts` (config, PWA manifest)

**Analog:** itself — value-only change, no structural change. Current: `background_color: '#f9fafb'`, `theme_color: '#3b82f6'`. Target: both → `'#0b0f1a'` (matches `app/layout.tsx`'s `viewport.themeColor` dark entry at line 42: `{ media: '(prefers-color-scheme: dark)', color: '#0b0f1a' }`). No other fields change.

---

### `app/{study,cards,habits,history}/loading.tsx` (component/skeleton, request-response)

**Analog:** each is the analog for the other three — identical convention across all four files per CLAUDE.md: "static server components (no `'use client'`, no hooks) — Next.js shows these automatically during client-side route transitions. They currently use `bg-surface-3 animate-pulse` exclusively."

**Pattern:** find-and-replace `bg-surface-3` → `bg-skeleton` in every placeholder `<div>` in all four files (in `app/cards/loading.tsx`, this includes the 5 repeated card-row skeleton divs). No structural JSX changes — token swap only. Nothing else in these files changes.

---

### `components/StudyClient.tsx` (component/client, event-driven skeleton)

**Analog:** the file's own real due-count/button markup (~line 300-316), which the `isFilterLoading` skeleton branch (~line 269-272) must dimensionally mirror exactly (D-04, pixel-exact match requirement).

**Current bare-spinner pattern to replace** (~line 269-272, per UI-SPEC.md Component Notes):
```typescript
<div className="h-16 flex items-center justify-center" role="status" aria-label="Loading cards">
  <Loader2 className="w-5 h-5 animate-spin text-muted" />
</div>
```

**Target shape** (UI-SPEC.md Component Notes, exact locked layout):
```typescript
<div className="flex flex-col items-center gap-6 py-6" role="status" aria-label="Loading cards">
  <div className="h-16 flex flex-col items-center justify-center gap-1">
    {/* bar 1: stands in for the text-5xl font-bold due-count number */}
    <div className="h-12 w-16 rounded-lg bg-skeleton animate-pulse" />
    {/* bar 2: stands in for the "card(s) ready" label */}
    <div className="h-4 w-24 rounded bg-skeleton animate-pulse" />
  </div>
  {/* button placeholder: stands in for "Start studying →" */}
  <div className="w-full max-w-sm min-h-14 rounded-2xl bg-skeleton animate-pulse" />
</div>
```
Wrapping `flex flex-col items-center gap-6 py-6` container MUST be identical to the real content's wrapper (~line 300-316) — this is the "nothing shifts" contract (Success Criterion 3 / Pitfall 4). Remove the `Loader2` import if unused elsewhere in the file after this change.

**Also migrate** (token swap only, same convention as the `loading.tsx` files): the two inline `animate-pulse` skeleton blocks at `phase === 'loading'` (~line 237-241) and `phase === 'loading-practice'` (~line 348-353) — `bg-surface-3` → `bg-skeleton`. These are NOT the `isFilterLoading` branch; do not conflate the two edits.

---

### `vercel.json` (config, deploy)

**Analog:** itself — the existing `crons` array is the sibling-field precedent.

**Current shape:**
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "crons": [
    { "path": "/api/cron/sync", "schedule": "0 10 * * *" }
  ]
}
```
**Target:** add a sibling `"regions": ["<vercel-code>"]` field. Value determined by running `turso db show korean-study` (first task, per RESEARCH.md Open Question 1 — not resolvable in a research/pattern-mapping session) and mapping via the Turso↔Vercel table in RESEARCH.md Code Examples § "Turso ↔ Vercel region mapping". Hobby plan supports exactly one region.

---

### `e2e/perf.spec.ts` (test, batch)

**Analog:** itself — refactor of the existing single-constant + loop shape into a per-route map, same test structure otherwise.

**Current shape** (lines 26, 55-56, 66 per RESEARCH.md verification):
```typescript
const PAGE_BUDGET_MS = 3000
for (const route of ['/', '/study', '/cards', '/habits']) {
  test(`page-load budget: ${route}`, async ({ page }) => {
    // ...sampling logic...
    expect(median).toBeLessThan(PAGE_BUDGET_MS)
  })
}
```
**Target shape:**
```typescript
const PAGE_BUDGETS_MS: Record<'/' | '/study' | '/cards' | '/habits', number> = {
  '/': 3000,       // D-06 — unchanged
  '/study': 3000,  // D-06 — unchanged
  '/cards': 3000,  // D-06 — unchanged
  '/habits': 1500, // D-05 — tightened
}
for (const route of Object.keys(PAGE_BUDGETS_MS) as Array<keyof typeof PAGE_BUDGETS_MS>) {
  test(`page-load budget: ${route}`, async ({ page }) => {
    // ...unchanged sampling logic...
    expect(median(samples.map((s) => s.dcl))).toBeLessThan(PAGE_BUDGETS_MS[route])
  })
}
```
Everything else in the file (sampling/median logic) stays unchanged.

---

## Shared Patterns

### Pre-paint `<script>` for flash-free client-only state
**Source:** `app/layout.tsx` lines 64-79 (two existing scripts: theme resolution, `--sab` freeze)
**Apply to:** the new 3rd settings-cookie script in `app/layout.tsx`
```typescript
<script
  dangerouslySetInnerHTML={{
    __html: `(function(){try{ /* ... */ }catch(e){}})();`,
  }}
/>
```
Contract: IIFE, wrapped in `try/catch`, no imports, string-templated, preceded by an explanatory block comment. Never used for sensitive data.

### Route-handler cookie write
**Source:** `app/api/login/route.ts` lines 14-23 (`AUTH_COOKIE`, `httpOnly: true`)
**Apply to:** `app/api/settings/route.ts` PUT handler (`ks_settings`, `httpOnly: false` — deliberate, documented deviation)
```typescript
const res = NextResponse.json({ /* ... */ })
res.cookies.set(NAME, value, {
  httpOnly: /* true for auth, false for ks_settings */,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' /* auth */ | 'lax' /* settings */,
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
})
return res
```

### Dark-mode token mirroring (3-block CSS pattern)
**Source:** `app/globals.css` — existing `--surface-1/2/3`, `--background`, etc.
**Apply to:** new `--skeleton-bg` token
Every color token must be defined in: (1) light `:root`, (2) `@media (prefers-color-scheme: dark) { :root { ... } }`, (3) `:root[data-theme="dark"] { ... }` — blocks (2) and (3) must be byte-identical. Then exposed via `@theme inline { --color-X: var(--X); }`.

### Static `loading.tsx` skeleton convention
**Source:** all four existing `app/*/loading.tsx` files
**Apply to:** same four files, token-swap only (`bg-surface-3` → `bg-skeleton`)
No `'use client'`, no hooks — plain server components using `animate-pulse` + a background-color utility class.

## No Analog Found

None — RESEARCH.md confirms this phase introduces zero new architectural patterns; every deliverable is a direct extension or value-only edit of an existing, already-proven in-repo pattern (pre-paint scripts, route-handler cookies, `@theme inline` tokens, `loading.tsx` convention, `crons`-sibling config field, single-constant→map test refactor).

## Metadata

**Analog search scope:** `app/layout.tsx`, `app/api/settings/route.ts`, `app/api/login/route.ts`, `app/globals.css`, `app/manifest.ts`, `app/{study,cards,habits,history}/loading.tsx`, `components/StudyClient.tsx`, `vercel.json`, `e2e/perf.spec.ts`, `lib/color.ts`, `lib/settings.ts`, `lib/palettes.ts`
**Files scanned:** 13 (all directly read this session or in the upstream RESEARCH.md session with verified line numbers)
**Pattern extraction date:** 2026-08-05
