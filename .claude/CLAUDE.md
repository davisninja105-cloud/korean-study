<!-- GSD:project-start source:PROJECT.md -->

## Project

**Korean Study — Foundation-First Study**

A personal Korean spaced-repetition study app (Next.js + Prisma/Turso, Claude-powered card extraction from a tutor's Google Doc, FSRS scheduling, sentence-centric study, TTS, tap-to-gloss, habit tracking). This milestone makes the app's existing "foundation-first" promise real: a learner should never be quizzed on a word before its building blocks, and a brand-new word should be introduced on its own before being wrapped in a sentence.

**Core Value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context. If everything else fails, this must hold.

### Constraints

- **Tech stack**: Next.js 16 / React 19 / Prisma 7 + libSQL (Turso) — must fit existing architecture and conventions in `CLAUDE.md`
- **Lint**: `react-hooks/purity` — all new sentence/maturity logic must stay pure in render (no `Date.now()`/`Math.random()` during render); lint must stay clean
- **Deploy**: Vercel Hobby 60s function limit — selection/annotation work must stay cheap (bounded pool query, ≤ sessionSize × 3 sentence scans)
- **Compatibility**: `sequenceCards()` already ignores out-of-session edges, so passing whole-pool edges is safe; preserve existing blank-safety rules

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Summary

## Languages & Runtime

| Item | Version | Notes |
|------|---------|-------|
| TypeScript | 5.9.3 | Strict mode; `moduleResolution: bundler` |
| JavaScript (ESM) | — | Scripts in `scripts/` use `.mjs`/`.mts` |
| Node.js | 25.8.2 (dev) | No engine pin in `package.json`; Vercel uses its own Node version |
| npm | 11.11.1 | `package-lock.json` lockfileVersion 3 present |

## Frameworks

| Framework | Version | Role |
|-----------|---------|------|
| Next.js | 16.2.1 | Full-stack React framework; App Router; serverless API routes |
| React | 19.2.4 | UI rendering |
| React DOM | 19.2.4 | DOM renderer |

- App Router (`app/` directory with `page.tsx`, `layout.tsx`, `route.ts`)
- Server Components by default; `'use client'` directive on interactive components
- `middleware.ts` for auth gating at the edge
- `app/manifest.ts` for PWA manifest generation

## Styling

| Tool | Version | Notes |
|------|---------|-------|
| Tailwind CSS | 4.2.2 | v4 syntax; configured via `@theme inline` in `app/globals.css` |
| `@tailwindcss/postcss` | 4.x | PostCSS integration (config: `postcss.config.mjs`) |

## Database

| Tool | Version | Role |
|------|---------|------|
| Prisma | 7.6.0 | ORM / schema management / client generation |
| `@prisma/client` | 7.6.0 | Generated query client |
| `@prisma/adapter-libsql` | 7.6.0 | Prisma → libSQL driver adapter |
| `@libsql/client` | 0.17.2 | Low-level libSQL client (Turso wire protocol) |

## Key Libraries

| Package | Version | Purpose |
|---------|---------|---------|
| `@anthropic-ai/sdk` | 0.80.0 | Claude API client (extraction, gloss, practice generation) |
| `ts-fsrs` | 5.3.1 | FSRS spaced-repetition algorithm (`lib/fsrs.ts`) |
| `@vercel/blob` | 2.4.1 | Vercel Blob storage for TTS audio cache |
| `google-auth-library` | 10.7.0 | OAuth2 token minting for Google Docs API |
| `lucide-react` | 1.17.0 | Icon set (nav, UI chrome) |
| `canvas-confetti` | 1.9.4 | Celebration animations (milestone, band-up) |
| `dotenv` | 17.3.1 | `.env` loading for local scripts |
| `sharp` | 0.34.5 | devDep — rasterizes `public/icon.svg` to PNG icon set via `scripts/gen-icons.mjs` |

## Build & Tooling

| Tool | Version / File | Purpose |
|------|---------------|---------|
| `next build` | — | Production build; runs `prisma generate` first (via `prebuild` in `scripts`) |
| `next dev` | — | Dev server at `http://localhost:3000` with hot reload |
| `prisma generate` | — | Regenerates Prisma client from `prisma/schema.prisma` |
| `npx tsx` | — | Runs `.mts` scripts (e.g., `scripts/local-resync.mts`) |
| PostCSS | `postcss.config.mjs` | Processes Tailwind v4 |

## Linting

| Tool | Version | Config |
|------|---------|--------|
| ESLint | 9.x | `eslint.config.mjs` |
| `eslint-config-next` | 16.2.1 | `core-web-vitals` + `typescript` rule sets |

- `react-hooks/purity` — no impure calls (`Date.now()`, `Math.random()`) during render
- `react-hooks/set-state-in-effect` — no synchronous `setState` in effect bodies

## TypeScript Configuration

| Option | Value |
|--------|-------|
| `target` | `ES2017` |
| `strict` | `true` |
| `module` | `esnext` |
| `moduleResolution` | `bundler` |
| `paths` | `@/*` → `./*` (root alias) |
| `jsx` | `react-jsx` |
| `incremental` | `true` |

## Testing

## PWA / Assets

- `app/manifest.ts` — Next.js manifest route (PWA)
- `public/icon.svg` — Source icon (한 on brand-blue rounded square)
- `scripts/gen-icons.mjs` — Generates `icon-192.png`, `icon-512.png`, `apple-icon.png`, `icon-512-maskable.png` from SVG via `sharp`

## Scripts (`scripts/`)

| Script | Purpose |
|--------|---------|
| `local-resync.mts` | Full re-extraction of all lessons (bypasses Vercel 60s timeout) |
| `wipe-card-data.mjs` | Deletes all card/lesson/review data |
| `apply-graph-ddl.mjs` | One-time DDL for `CardDependency` table |
| `relink-dependencies.mjs` | Retroactively rebuilds `CardDependency` edges |
| `find-duplicates.mjs` | Fuzzy scan for near-duplicate card fronts |
| `full-resync.mjs` | Drives repeated `POST /api/sync` until `remaining=0` |
| `gen-icons.mjs` | Rasterizes SVG icon to PNG set |

## Notable Config Files

| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js config (currently minimal / default) |
| `tsconfig.json` | TypeScript compiler options |
| `eslint.config.mjs` | ESLint flat config |
| `postcss.config.mjs` | PostCSS with `@tailwindcss/postcss` |
| `prisma/schema.prisma` | Database schema (source of truth) |
| `.env` / `.env.local` | Local environment variables (not committed) |
| `middleware.ts` | Edge middleware for auth gating |
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Summary

## File and Folder Naming

- **Files:** `kebab-case` for all `.ts`, `.tsx`, `.mjs`, `.mts` files (e.g., `card-key.ts`, `sentence-match.ts`, `GlossProvider.tsx`).
- **Components:** PascalCase filenames matching the default export (e.g., `Sheet.tsx` exports `Sheet`, `AudioButton.tsx` exports `AudioButton`).
- **API routes:** Next.js App Router convention — `app/api/<resource>/route.ts`; nested resources use `app/api/<resource>/[id]/route.ts`.
- **Scripts:** `scripts/` directory, `.mjs` for plain JS operational scripts, `.mts` for TypeScript scripts that import `lib/` modules (e.g., `local-resync.mts`).
- **Directories:** `kebab-case` throughout (`app/`, `lib/`, `components/`, `scripts/`, `prisma/`).

## Component Patterns

### Client vs. Server Boundary

- Client components **always** declare `'use client'` as the very first line — before any imports (e.g., `StudySession.tsx`, `Sheet.tsx`, `GlossProvider.tsx`).
- Server components (page.tsx files, API route handlers) have **no** `'use client'` directive and may call `prisma`, `lib/settings.ts`, or other server-only code directly.
- `lib/` modules that are server-only (Prisma, Anthropic SDK calls) carry a comment: `// No 'use client' — this module runs server-side only.`
- Modules shared across both environments must be pure (no Prisma, no Node builtins). Example: `lib/card-key.ts`, `lib/sequence.ts`, `lib/habit.ts`, `lib/palettes.ts`.

### Props Interfaces

- Props are typed via inline `interface Props { … }` directly above the component function (not `type`).
- The interface is always named `Props`, not `ComponentNameProps`.
- Example from `Sheet.tsx`:

### Local Types Within Components

- Component-local types (not exported) use `interface` and are declared near the top of the file before the component.
- Example from `StudySession.tsx`:

### Default vs. Named Exports

- React components: always `export default function ComponentName`.
- Library functions: named exports (`export function`, `export const`, `export interface`).
- No barrel `index.ts` files — every import references the source file directly.

## TypeScript Usage

- **Strict mode is on** (`"strict": true` in `tsconfig.json`). All code must satisfy `noImplicitAny`, `strictNullChecks`, etc.
- **Path alias:** `@/*` maps to the project root. All intra-project imports use `@/` (e.g., `import { prisma } from '@/lib/prisma'`). Relative imports (`./`) are used only within the same directory.
- **Type assertions (`as`):** Used narrowly when reconstructing third-party types (e.g., FSRS), always accompanied by a comment explaining why.
- **Non-null assertions (`!`):** Used only when the null case has been ruled out by preceding logic, never blindly.
- **Interfaces over `type` aliases:** Preferred for object shapes. `type` is used for unions, tuples, and utility-type aliases.
- **`null` vs `undefined`:** Database nullable fields are typed `… | null`. Optional props use `?` (which is `T | undefined`). Do not conflate the two.

## CSS and Styling

### Tailwind v4 Utility Classes

- Tailwind v4 is imported via `@import "tailwindcss"` in `app/globals.css` (not a `tailwind.config.js`).
- Custom semantic tokens are registered with `@theme inline` and exposed as Tailwind utilities (e.g., `bg-surface-1`, `text-cat-vocab`, `bg-reward`).
- **Never** use literal color utilities like `bg-orange-500` or `text-blue-400` for semantic roles. Use the token utilities instead.

### Semantic CSS Tokens (defined in `app/globals.css`)

| Token | Purpose |
|---|---|
| `--surface-1` / `bg-surface-1` | Elevated card, sheet, nav — most prominent |
| `--surface-2` / `bg-surface-2` | Quiet recessed strip or tile |
| `--surface-3` / `bg-surface-3` | Deep well / page background |
| `--button` / `--button-foreground` | Action color (user-configurable) |
| `--reward` / `--reward-foreground` | Reward/streak color (user-configurable) |
| `--reward-soft` | Partial-progress tier (bars, heatmap) |
| `--highlight-bg` / `--highlight-fg` | Korean sentence targetForm highlight |
| `--cat-vocab` / `--cat-grammar` / `--cat-phrase` | Card type taxonomy colors |

### Dark Mode

- Dark mode is a **manual toggle** (System / Light / Dark) stored in `localStorage` key `theme`.
- `data-theme="dark"` is set on `<html>` by a pre-paint inline `<script>` in `app/layout.tsx` (no flash; `<html suppressHydrationWarning>`).
- Tailwind's `dark:` variant is rebound to `[data-theme="dark"]` via `@custom-variant dark` in `globals.css`.
- **When adding a dark value:** mirror it in BOTH the `@media (prefers-color-scheme: dark)` `:root` block AND the `:root[data-theme="dark"]` block in `globals.css`.

### Font

- `'Pretendard Variable'` is the primary font (self-hosted WOFF2 in `public/fonts/`). Referenced via `--font-korean` CSS variable.

## Import Ordering

## Error Handling

### API Routes

- All route handlers wrap their body in `try { … } catch (e) { return NextResponse.json({ error: … }, { status: 500 }) }`.
- Validation errors return `{ status: 400 }` with a descriptive message before hitting business logic.
- Example pattern:

### Library Modules

- Pure library functions throw on unexpected input; callers handle the error.
- `try/catch` in library code is only used when recovering gracefully (e.g., `getButtonColor()` in `lib/settings.ts` catches Prisma errors and returns the default color).
- JSON parse calls are always wrapped in `try/catch` (e.g., `getCachedGloss` in `lib/gloss.ts`).

### LLM / External API Calls

- LLM responses are validated immediately after receipt (check `content[0].type !== 'text'`; regex-extract JSON before `JSON.parse`).
- TTS and Blob failures degrade gracefully: `/api/tts` returns `503` and `AudioButton` falls back to `window.speechSynthesis`.

## Async Patterns

- `async/await` throughout — no `.then()` chains except in specific ESLint-safe scenarios (e.g., non-blocking cache writes).
- `Promise.allSettled()` is used when processing a batch where individual failures should not abort the whole batch (e.g., `extractResults` in `app/api/sync/route.ts`).
- Non-blocking writes use `.catch(() => {})` or `.then(() => {})` patterns to avoid the ESLint `no-floating-promises` rule.
- `fetch` in client components always uses `async/await` inside event handlers or `useEffect`, never bare in render.

## React Hooks Purity Rules (Critical)

- `Date.now()`, `new Date()` (no-arg), `Math.random()` — all are impure.
- Any `setState` call synchronously inside an `useEffect` body.
- Read time in effects or event handlers, or pass a stable value as a prop/seed.
- For deterministic randomness during render, use a seeded pseudo-RNG (see `seededShuffle` in `components/StudySession.tsx`).
- `previewIntervalLabels` in `lib/fsrs.ts` documents this with: `// Must be called from event handlers, not during render.`

## Comment and Documentation Style

### JSDoc / Block Comments

- Public library functions that are the single source of truth for a behavior get a leading block comment explaining their contract, inputs, rules, and call sites.
- Example (`lib/card-key.ts`): a full JSDoc block listing rules, the "No side-effects" guarantee, and where the function is used.
- Example (`lib/sequence.ts`): header comment explains the scoring formula, constants, and cycle-safety guarantee before the first line of code.

### Inline Comments

- Used to explain non-obvious decisions, not to restate what the code does.
- Temporal/historical context uses present tense ("A card is still due today iff …").
- Deprecated items are marked with `/** @deprecated — … */` (e.g., `DEFAULT_BUTTON_COLOR` in `lib/settings.ts`).

### Constants

- Module-level constants that affect behavior are declared at the top of the file with an explanatory comment.

## Key Gotchas

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## Summary

## System Overview

```text

```

## Authentication

- `middleware.ts` (compiled to `.next/server/middleware.js`) intercepts all requests. It allows `/login`, `/api/login`, and PWA/static assets; everything else requires a valid auth cookie.
- `lib/auth.ts` provides `computeAuthToken()` — HMAC-SHA256(`AUTH_SECRET`, fixed message string). The cookie stores this token; middleware recomputes and compares. No sessions table; stateless.
- Login flow: `POST /api/login/route.ts` checks the posted password against `APP_PASSWORD`, sets the HMAC cookie on success.
- Auth cookie name: `ks_auth`. Uses Web Crypto so the same code runs in Edge middleware and Node route handlers.

## Data Flow

### 1. Content Ingestion (Sync)

```

```

### 2. Study Session

```

```

### 3. Tap-to-Gloss

```

```

### 4. Text-to-Speech

```

```

### 5. AI Practice Generation

```

```

## Module Boundaries

### `lib/` — Pure Business Logic

| File | Responsibility |
|------|---------------|
| `lib/auth.ts` | HMAC token computation; usable in Edge + Node |
| `lib/card-key.ts` | `normalizeFront()` — single dedup-key function |
| `lib/card-style.ts` | `typeBadgeClass()` — card-type badge CSS source of truth |
| `lib/color.ts` | `readableForeground()` — contrast color helper |
| `lib/copy.ts` | Pure warm-copy string helpers; no side effects |
| `lib/extract-cards.ts` | Claude Opus prompt for lesson → cards extraction |
| `lib/fsrs.ts` | FSRS spaced-repetition algorithm (ts-fsrs wrapper) |
| `lib/generate-practice.ts` | Claude prompt for ephemeral practice generation |
| `lib/gloss.ts` | Haiku gloss prompt + Setting-table cache helpers |
| `lib/google-docs.ts` | Google Docs API v1 fetch + emphasis capture |
| `lib/habit.ts` | Pure streak/freeze/heatmap computation helpers |
| `lib/haptics.ts` | `haptic()` — `navigator.vibrate` wrapper, no-op-safe |
| `lib/palettes.ts` | Color palette data — pure, client+server safe |
| `lib/prisma.ts` | Singleton Prisma client (libSQL adapter) |
| `lib/proficiency.ts` | CEFR band mapper; `computeProficiency()` |
| `lib/sentence-match.ts` | Korean substring match/blank safety rules |
| `lib/sequence.ts` | `sequenceCards()` — foundation-first blended sort |
| `lib/settings.ts` | Server-side DB getters/setters for all app settings |
| `lib/theme.ts` | Theme toggle helpers (localStorage-based) |
| `lib/tts.ts` | TTS provider abstraction + two provider implementations |
| `lib/usePullToRefresh.ts` | Touch pull-to-refresh React hook |

### `app/api/` — API Route Handlers

| Route | Method(s) | Purpose |
|-------|-----------|---------|
| `/api/sync` | POST | Ingest new Google Doc lessons → extract cards |
| `/api/cards` | GET, POST | List all cards; create a card |
| `/api/cards/due` | GET | Due (or ahead-scope) cards, sequenced |
| `/api/cards/[id]` | GET, PUT, DELETE | Single card CRUD |
| `/api/review` | POST | Record FSRS review answer |
| `/api/review/undo` | POST | Undo last review |
| `/api/generate` | POST | Generate ephemeral AI practice |
| `/api/gloss` | POST | Tap-to-gloss lookup |
| `/api/tts` | GET | TTS audio (Blob cache) |
| `/api/activity` | POST | Increment StudyDay time/reviews |
| `/api/lessons` | GET | List all lessons ordered by orderIndex |
| `/api/stats` | GET | Aggregate stats for /wrapped |
| `/api/settings` | GET, PUT | App settings (DB-backed) |
| `/api/login` | POST | Password auth → set HMAC cookie |

### `components/` — UI Primitives and Compositions

- **Study:** `StudySession.tsx`, `ModeSelector.tsx`, `HighlightedSentence.tsx`, `AudioButton.tsx`
- **Cards management:** `CardEditor.tsx`, `SwipeRow.tsx`, `LessonRangeFilter.tsx`
- **Habit/stats:** `HabitTracker.tsx`, `HabitHeatmap.tsx`, `MilestoneCelebration.tsx`, `ProficiencyArc.tsx`, `ProgressRing.tsx`, `StatsBar.tsx`
- **Layout/shell:** `Nav.tsx`, `Sheet.tsx`, `ThemeWatcher.tsx`, `GlossProvider.tsx`, `SyncPanel.tsx`

### `app/` — Page Routes (RSC)

| Route | Page |
|-------|------|
| `/` | Home: hero + HabitTracker + StatsBar + ProficiencyArc |
| `/study` | Study: mode selector + StudySession |
| `/cards` | Cards: filterable list + CardEditor sheet |
| `/habits` | Full habit stats: heatmap + streaks + ProficiencyArc |
| `/settings` | App settings: theme + colors + goal + sync |
| `/wrapped` | "My Korean" summary: CEFR arc + stats + share |
| `/login` | Password login form |

## Database Schema Overview

```

```

- `Card.normalizedFront` is `@unique` — enforces dedup at the DB level.
- `Card.components` (JSON string[]) stores raw Claude-returned prerequisite lemmas; resolved to `CardDependency` rows at sync time.
- `StudyDay.date` uses the user-local habit-day string `"YYYY-MM-DD"` (not UTC), computed via `habitDateStr(hour)` from `lib/habit.ts`.
- `Setting` doubles as a gloss lookup cache (`gloss:<normalizedWord>` prefix keys).

## Key Design Patterns

## Architectural Constraints

- **Vercel Hobby 60 s timeout:** `maxDuration = 300` in route code has no effect. Each `/api/sync` processes exactly 1 lesson (`MAX_LESSONS_PER_SYNC = 1`). Bulk operations must run locally via `scripts/local-resync.mts`.
- **Turso / libSQL:** `prisma db push` and `prisma migrate` do not work against `libsql://`. Schema changes require manual DDL via `@libsql/client` `executeMultiple()`.
- **Single-tenant:** No user model, no multi-tenancy. Auth is a single shared password.
- **No background workers:** All processing is triggered by user actions.
- **ESLint strict mode:** `react-hooks/purity` forbids `Date.now()` / `Math.random()` in render. `react-hooks/set-state-in-effect` forbids synchronous `setState` in effect bodies. Lint must pass clean.

## Anti-Patterns

### Raw `localDateStr()` for activity logging

### `Math.random()` / `Date.now()` in render or module scope

### Adding new settings outside `lib/settings.ts`

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
