# Coding Conventions

**Analysis Date:** 2026-07-10

## Naming Patterns

**Files:**
- `lib/` modules: kebab-case (`lib/card-key.ts`, `lib/sentence-match.ts`, `lib/study-cards.ts`). Exception: hook files use camelCase (`lib/usePullToRefresh.ts`).
- Components: PascalCase filename matching the default export (`components/StudySession.tsx`, `components/AudioButton.tsx`, `components/GlossProvider.tsx`).
- API routes: App Router convention — `app/api/<resource>/route.ts`, nested `app/api/cards/[id]/route.ts`.
- Scripts: `scripts/*.mjs` (plain JS) or `scripts/*.mts` (TypeScript importing `lib/`).
- Tests: `tests/<module-name>.test.ts` mirroring the `lib/` module name.

**Functions:**
- camelCase, verb-first (`normalizeFront`, `sequenceCards`, `getStudyCards`, `computeProficiency`).
- Server-only data pipelines are `get*` (`getStats`, `getActivityData` in `lib/dashboard.ts`).

**Variables:**
- camelCase for locals; SCREAMING_SNAKE_CASE for module-level behavior constants with explanatory comments (`MAX_LESSONS_PER_SYNC`, `URGENCY_SCALE=7`, `MAX_BOOST=3`, `REQUEUE_GAP=4`).

**Types:**
- PascalCase. Prefer `interface` for object shapes; `type` for unions/tuples (`ActiveView = 'cards' | 'reading-practice'`).
- Component props interface is always named `Props` (inline, directly above the component), never `ComponentNameProps`.
- DTO types live in `lib/dto.ts` with a `DTO` suffix (`CardDTO`, `SentenceDTO`, `StatsDTO`). All `DateTime` fields are typed `string` (ISO) — no raw `Date` crosses the RSC→client boundary.

## Code Style

**Formatting:**
- No Prettier config — formatting follows codebase habit: 2-space indent, single quotes, no semicolons in `lib/`/`tests/`, trailing commas.

**Linting:**
- ESLint 9 flat config (`eslint.config.mjs`): `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`. `npm run lint` must pass with zero errors.
- Two rules that bite often:
  - `react-hooks/purity` — no `Date.now()`, no-arg `new Date()`, or `Math.random()` during render. Read time in effects/event handlers, or use a seeded value (`seededShuffle` + `seed` memo in `components/StudySession.tsx`).
  - `react-hooks/set-state-in-effect` — no synchronous `setState` in an effect body; use async callbacks (`fetch().then(setX)`).

## Import Organization

**Order:**
1. External packages (`react`, `next/server`, `@anthropic-ai/sdk`)
2. Intra-project via `@/` alias (`@/lib/prisma`, `@/lib/dto`)
3. Same-directory relative imports (`./`) only

**Path Aliases:**
- `@/*` → project root (`tsconfig.json` paths; mirrored in `vitest.config.ts`).
- No barrel `index.ts` files — always import the source file directly.

## Client/Server Boundary

- Client components declare `'use client'` as the very first line, before imports.
- `app/*/page.tsx` files are thin async RSCs: fetch via Prisma/`lib/` and render exactly one `*Client.tsx` with props. All hooks/state/handlers live in the `*Client.tsx` shell (`components/CardsClient.tsx`, `StudyClient.tsx`, `HomeClient.tsx`, `HabitsClient.tsx`).
- Server-only `lib/` modules carry the comment `// No 'use client' — this module runs server-side only.`
- Shared modules must be pure (no Prisma, no Node builtins): `lib/card-key.ts`, `lib/sequence.ts`, `lib/habit.ts`, `lib/palettes.ts`, `lib/copy.ts`, `lib/known-words.ts`.

## Error Handling

**Patterns:**
- API routes: wrap the body in `try/catch` → `NextResponse.json({ error }, { status: 500 })`; validation returns 400 before business logic.
- Pure `lib/` functions throw on unexpected input; callers handle. `try/catch` in lib code only for graceful recovery (e.g. `getButtonColor()` in `lib/settings.ts` falls back to a default).
- `JSON.parse` is always wrapped in `try/catch` (`getCachedGloss` in `lib/gloss.ts`).
- Degrade-gracefully pattern: `/api/tts` returns 503 when Blob token is missing; `AudioButton` falls back to `window.speechSynthesis`. In `lib/study-cards.ts`, `Promise.allSettled` lets the known-lemmas query fail soft (empty Set + `console.error('[study-cards] …')` log) while pool failure still throws.
- Fire-and-forget writes use `.catch(() => {})` (optimistic review save in `components/StudySession.tsx`).

## Logging

**Framework:** `console` only.

**Patterns:**
- Degradation paths log with a bracketed module prefix, e.g. `[study-cards]` (locked by `tests/study-cards.test.ts`).
- Happy path stays silent.

## Comments

**When to Comment:**
- Explain non-obvious decisions, not what the code does. Regression tests open with a block comment citing the issue ID (e.g. RELIABILITY-01, CR-01, EXTRACT-01).

**JSDoc/TSDoc:**
- Single-source-of-truth lib functions get a full contract block: rules, call sites, "No side-effects" guarantee (see `lib/card-key.ts:normalizeFront`, `lib/sequence.ts` header).
- Deprecations use `/** @deprecated — … */` (e.g. `DEFAULT_BUTTON_COLOR` in `lib/settings.ts`).
- Purity constraints documented inline: `// Must be called from event handlers, not during render.` (`lib/fsrs.ts`).

## Function Design

**Size:** Small pure functions in `lib/`; heavy composition lives in components (`StudySession.tsx` is the largest client component by design).

**Parameters:** Object params for multi-arg pipelines (`getStudyCards(params)`); positional for pure helpers (`sequenceCards(cards, edges, now)` — time is always passed in, never read inside).

**Return Values:** Nullable DB fields are `T | null`; optional props use `?`. Do not conflate the two.

## Module Design

**Exports:**
- Components: `export default function ComponentName`.
- Lib: named exports only (`export function`, `export const`, `export interface`).

**Barrel Files:** None — direct source imports throughout.

## Styling Conventions

- Tailwind CSS v4 via `@import "tailwindcss"` + `@theme inline` in `app/globals.css` (no `tailwind.config.js`).
- Use semantic token utilities (`bg-surface-1/2/3`, `bg-reward`, `bg-reward-soft`, `text-cat-vocab/grammar/phrase`, `--highlight-bg/fg`) — never literal `orange-*`/`blue-*` for semantic roles. Blue is reserved for actions.
- Dark mode: manual System/Light/Dark toggle; `dark:` variant rebound to `[data-theme="dark"]` via `@custom-variant dark`. New dark values must be mirrored in BOTH the `@media (prefers-color-scheme: dark)` block AND `:root[data-theme="dark"]` in `app/globals.css`.
- Card-type badge classes come only from `lib/card-style.ts:typeBadgeClass`.

## Domain Conventions

- Dedup key: always `normalizeFront()` from `lib/card-key.ts` — the single answer to "are two fronts the same item?". Persist via `Card.normalizedFront @unique`.
- Habit dates: use `habitDateStr(hour)` from `lib/habit.ts`, never raw local date, for activity logging.
- New persisted settings go through `lib/settings.ts` + `app/api/settings/route.ts`; theme alone is client-only localStorage.
- Sentence matching/blanking: only via `lib/sentence-match.ts`.

---

*Convention analysis: 2026-07-10*
