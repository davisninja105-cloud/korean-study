# Codebase Structure

**Analysis Date:** 2026-07-02

## Directory Layout

```
claude-test/                         # Project root
├── app/                             # Next.js App Router
│   ├── api/                         # API route handlers
│   │   ├── activity/route.ts        # POST — study-time tracking
│   │   ├── cards/
│   │   │   ├── route.ts             # GET list / POST create card
│   │   │   ├── due/route.ts         # GET due (or ahead) cards, sequenced
│   │   │   └── [id]/route.ts        # GET / PUT / DELETE single card
│   │   ├── generate/route.ts        # POST — AI practice generation
│   │   ├── gloss/route.ts           # POST — tap-to-gloss lookup
│   │   ├── lessons/route.ts         # GET — all lessons by orderIndex
│   │   ├── login/route.ts           # POST — password auth
│   │   ├── review/
│   │   │   ├── route.ts             # POST — record FSRS review
│   │   │   └── undo/route.ts        # POST — undo last review
│   │   ├── settings/route.ts        # GET / PUT app settings
│   │   ├── stats/route.ts           # GET — aggregate stats for /wrapped
│   │   ├── sync/route.ts            # POST — Google Doc ingest + AI extraction
│   │   └── tts/route.ts             # GET — TTS audio (Vercel Blob cache)
│   ├── generated/                   # Auto-generated — DO NOT EDIT
│   │   └── prisma/                  # Prisma client output (output = ../app/generated/prisma)
│   ├── cards/
│   │   ├── page.tsx                 # /cards — async RSC, fetches cards+lessons, renders CardsClient
│   │   └── loading.tsx              # Navigation skeleton (bg-surface-2 animate-pulse)
│   ├── habits/
│   │   ├── page.tsx                 # /habits — async RSC, fetches activity+masteredCount, renders HabitsClient
│   │   └── loading.tsx              # Navigation skeleton
│   ├── login/page.tsx               # /login — password gate
│   ├── settings/page.tsx            # /settings — app configuration
│   ├── study/
│   │   ├── page.tsx                 # /study — async RSC, fetches CardDTO[]+lessons, renders StudyClient
│   │   └── loading.tsx              # Navigation skeleton
│   ├── wrapped/page.tsx             # /wrapped — "My Korean" summary
│   ├── globals.css                  # Global styles + CSS token definitions
│   ├── layout.tsx                   # Root layout (RSC): theme inject, GlossProvider, Nav
│   ├── manifest.ts                  # PWA web app manifest
│   ├── page.tsx                     # / — async RSC, fetches StatsDTO+ActivityDTO, renders HomeClient
│   └── favicon.ico
├── components/                      # Shared React components (client + RSC)
│   ├── AudioButton.tsx              # Speaker button + fallback to window.speechSynthesis
│   ├── CardEditor.tsx               # Inline card editor (add/edit sentences)
│   ├── CardsClient.tsx              # 'use client' shell for /cards (v1.2 RSC pattern)
│   ├── GlossProvider.tsx            # 'use client' context: tap-to-gloss popover + cache
│   ├── HabitHeatmap.tsx             # Full-history heatmap grid
│   ├── HabitsClient.tsx             # 'use client' shell for /habits (v1.2 RSC pattern)
│   ├── HabitTracker.tsx             # Habit card: streak + ProgressRing + 7-day week strip
│   ├── HighlightedSentence.tsx      # Korean sentence with targetForm highlighted (tap-to-gloss optional)
│   ├── HomeClient.tsx               # 'use client' shell for / (v1.2 RSC pattern)
│   ├── LessonRangeFilter.tsx        # Shared filter UI (used by Cards and Study)
│   ├── MilestoneCelebration.tsx     # Milestone overlay (confetti + badge)
│   ├── ModeSelector.tsx             # Study mode picker + Exposure/Recall toggle
│   ├── Nav.tsx                      # Bottom nav bar (mobile) + top settings gear (all sizes)
│   ├── ProficiencyArc.tsx           # CEFR band badge + progress arc
│   ├── ProgressRing.tsx             # SVG progress ring (parameterized)
│   ├── Sheet.tsx                    # Portal bottom-sheet primitive (modal + drag handle)
│   ├── StatsBar.tsx                 # Secondary stats strip (cards / lessons / CEFR level)
│   ├── StudyClient.tsx              # 'use client' shell for /study (v1.2 RSC pattern)
│   ├── StudySession.tsx             # 3D flashcard + multiple-choice + fill-blank modes
│   ├── SwipeRow.tsx                 # iOS-style swipe-to-reveal delete action (cards page)
│   ├── SyncPanel.tsx                # Google Doc sync UI (lives in Settings ▸ Advanced)
│   └── ThemeWatcher.tsx             # Renders nothing; watches OS color-scheme change
├── lib/                             # Pure business logic + server utilities
│   ├── auth.ts                      # HMAC token computation (stateless, Edge-safe)
│   ├── card-key.ts                  # normalizeFront() — single dedup-key function
│   ├── card-style.ts                # typeBadgeClass() — card-type badge CSS source of truth
│   ├── color.ts                     # readableForeground() — contrast color helper
│   ├── copy.ts                      # Pure warm-copy helpers (comebackMessage, bandUpMessage, etc.)
│   ├── dashboard.ts                 # Server-only: getStats() + getActivityData() (extracted from API for RSC reuse)
│   ├── dto.ts                       # Shared server→client DTO types; every DateTime field typed string (ISO)
│   ├── extract-cards.ts             # Claude Opus prompt: lesson text → typed cards
│   ├── fsrs.ts                      # FSRS spaced-repetition algorithm (ts-fsrs wrapper)
│   ├── generate-practice.ts         # Claude prompt: generate ephemeral practice
│   ├── gloss.ts                     # Claude Haiku prompt: tap-to-gloss lookup + Setting cache helpers
│   ├── google-docs.ts               # Google Docs API v1 fetch + emphasis capture
│   ├── habit.ts                     # Pure streak/freeze/heatmap computation helpers
│   ├── haptics.ts                   # haptic() — navigator.vibrate wrapper, no-op-safe
│   ├── known-words.ts               # countUnknownWords() — pure ranking signal for sentence selection
│   ├── palettes.ts                  # Color palette data (pure, client+server safe)
│   ├── prisma.ts                    # Singleton Prisma client (libSQL adapter)
│   ├── proficiency.ts               # CEFR band mapper; computeProficiency()
│   ├── sentence-match.ts            # Korean substring match/blank safety rules
│   ├── sequence.ts                  # sequenceCards() — foundation-first blended sort
│   ├── settings.ts                  # Server-side DB getters/setters for app settings
│   ├── study-cards.ts               # Server-only: getStudyCards() due-card pipeline (extracted from API for RSC reuse)
│   ├── theme.ts                     # Theme toggle helpers (localStorage-based)
│   ├── tts.ts                       # TTS provider abstraction (Google Cloud or ElevenLabs)
│   └── usePullToRefresh.ts          # Touch pull-to-refresh React hook
├── prisma/
│   └── schema.prisma                # DB schema (7 models: Lesson, Card, Sentence, CardReview, CardDependency, StudyDay, Setting)
├── public/                          # Static assets
│   ├── icon.svg                     # Source icon (한 on brand blue rounded square)
│   ├── icon-192.png                 # PWA icon (rasterized via scripts/gen-icons.mjs)
│   ├── icon-512.png
│   ├── apple-icon.png
│   ├── icon-512-maskable.png        # Maskable safe-zone variant
│   └── fonts/                       # Pretendard Variable (self-hosted WOFF2)
├── scripts/                         # One-time / operational scripts (run locally)
│   ├── local-resync.mts             # Full re-extraction of all lessons (bypasses Vercel 60s timeout)
│   ├── relink-dependencies.mjs      # Rebuild all CardDependency edges retroactively
│   ├── apply-graph-ddl.mjs          # One-time DDL for normalizedFront + CardDependency table
│   ├── apply-sentence-ddl.mjs       # One-time DDL for Sentence table (already applied)
│   ├── add-lesson-order.mjs         # One-time backfill for Lesson.orderIndex (already applied)
│   ├── wipe-card-data.mjs           # Delete all card/lesson/review rows (keeps StudyDay/Setting)
│   ├── find-duplicates.mjs          # Report near-duplicate card fronts (fuzzy dedup audit)
│   ├── full-resync.mjs              # Drive repeated POST /api/sync until remaining=0
│   └── gen-icons.mjs                # Rasterize icon.svg → PNG icon set via sharp
├── tests/                           # Vitest unit tests — pure lib functions only, no DB/API
│   ├── card-key.test.ts
│   ├── habit.test.ts
│   ├── known-words.test.ts
│   ├── proficiency.test.ts
│   ├── sentence-match.test.ts
│   └── sequence.test.ts
├── plans/                           # Feature plans (reference, not consumed at runtime)
│   ├── P0-foundations.md
│   ├── P1-identity-retention.md
│   ├── P2-polish-delight.md
│   └── README.md
├── .planning/                       # GSD planning artifacts
│   └── codebase/                    # Codebase map documents
├── .claude/                         # Claude Code project settings
│   └── settings.local.json
├── .vercel/                         # Vercel project linkage
│   └── project.json
├── CLAUDE.md                        # Claude Code guidance (primary architecture reference)
├── AGENTS.md                        # Agent instructions
├── next.config.ts                   # Next.js config (minimal)
├── eslint.config.mjs                # ESLint (eslint-config-next 16, strict)
├── postcss.config.mjs               # PostCSS (Tailwind v4)
├── tsconfig.json                    # TypeScript config (strict mode, bundler resolution)
├── vitest.config.ts                 # Vitest config
├── package.json                     # Dependencies + scripts
├── package-lock.json
├── next-env.d.ts                    # Next.js type definitions
├── dev.db                           # Local SQLite dev database (gitignored)
├── middleware.ts                    # Auth gate (compiles to .next/server/middleware.js)
└── fixes_needed.txt                 # Informal backlog / audit notes
```

---

## Directory Purposes

### `app/`

Next.js 16 App Router root. Subdirectories with `page.tsx` are routes; `api/` subdirectories with `route.ts` are serverless handlers. Pages are React Server Components by default (no `'use client'` directive). As of v1.2, the four main routes (`/`, `/study`, `/cards`, `/habits`) are thin async RSCs that:

1. Fetch data server-side via Prisma or shared `lib/` functions
2. Serialize any `Date` objects to ISO strings
3. Render exactly one `*Client.tsx` component from `components/` with the data as props

This pattern eliminates empty-state loading flashes and keeps the page itself trivially correct. `loading.tsx` siblings provide Next.js navigation-fallback skeletons for `/study`, `/cards`, `/habits` (shown during client-side route transitions).

### `app/api/`

Thin request handlers. Each `route.ts` file:

1. Validates input (return 400 on bad schema)
2. Calls `lib/` functions or Prisma
3. Serializes response
4. Returns JSON (or 500 on error)

No business logic lives in API routes. Critical logic is extracted to `lib/` so both RSC pages and API routes can share it (see `lib/study-cards.ts:getStudyCards()`, `lib/dashboard.ts`).

### `app/generated/prisma/`

Auto-generated Prisma client. Created by `npx prisma generate`. Never edited by hand. The `output` directive in `prisma/schema.prisma` points here so the client works in the Vercel build environment.

### `components/`

All shared React UI. Flat directory — no sub-grouping by domain. Components that need browser APIs or interactivity declare `'use client'` as the first line. Components that are purely presentational may be RSC-compatible.

**Client shells** (v1.2): `HomeClient.tsx`, `StudyClient.tsx`, `CardsClient.tsx`, `HabitsClient.tsx` are the top-level interactive components for their routes. They receive data as RSC props, manage all state/hooks, and render the rest of the UI.

None of the components in `components/` import from `app/`.

### `lib/`

Business logic, utilities, and server-side helpers. All files are importable from both API routes and RSC pages. No imports from `app/` or `components/`.

**Module categories:**

- **Data models:** `dto.ts` (serialization contract), `card-key.ts` (dedup), `sequence.ts` (sequencing algorithm)
- **Spaced repetition:** `fsrs.ts` (FSRS algorithm)
- **Learning science:** `habit.ts` (streaks/freezes), `proficiency.ts` (CEFR bands), `known-words.ts` (context ranking)
- **I/O & external:** `google-docs.ts` (Google API), `extract-cards.ts` (Claude), `gloss.ts` (Claude), `generate-practice.ts` (Claude), `tts.ts` (TTS provider), `prisma.ts` (DB)
- **UI helpers:** `card-style.ts` (CSS), `color.ts` (contrast), `haptics.ts` (vibration), `theme.ts` (dark mode), `copy.ts` (messages)
- **Auth & config:** `auth.ts` (HMAC), `settings.ts` (DB settings), `palettes.ts` (color data)
- **Server-only pipelines:** `study-cards.ts` (due-card pipeline), `dashboard.ts` (stats/activity pipeline)

### `prisma/`

Contains only `schema.prisma`. Migration files are not used (Turso requires manual DDL); `prisma generate` is the only Prisma command run in CI/build.

### `scripts/`

Operational scripts for one-time migrations and bulk operations that cannot run inside Vercel serverless functions (60s hard timeout). Run locally with `node` or `npx tsx`.

- `local-resync.mts` — Full corpus re-extraction (preferred for bulk syncs)
- `wipe-card-data.mjs` — Nuke all card data (keeps StudyDay + Setting)
- `relink-dependencies.mjs` — Rebuild prerequisite edges after a full resync
- `gen-icons.mjs` — Rasterize SVG icon to PNG set (run after editing `public/icon.svg`)
- `apply-graph-ddl.mjs`, `apply-sentence-ddl.mjs`, `add-lesson-order.mjs` — One-time DDL scripts (already applied)

### `tests/`

Vitest unit tests. One file per pure `lib/` module (`card-key`, `habit`, `known-words`, `proficiency`, `sentence-match`, `sequence`). Scope is deliberately narrow — pure functions with no DB/API dependency only. `npm test` runs `vitest run`; `npm run test:watch` runs in watch mode.

### `plans/`

Markdown design documents for past/current feature work. Not imported at runtime. Kept for historical reference. See `plans/README.md` for overview.

### `public/`

Static files served at `/`. Contains the PWA icon set (rasterized from `public/icon.svg` via `scripts/gen-icons.mjs`) and optional font files.

---

## Naming Conventions

### Files

- `kebab-case` for all `.ts`, `.tsx`, `.mjs`, `.mts` files
  - Examples: `card-key.ts`, `sentence-match.ts`, `study-cards.ts`
  - Exception: Component files are PascalCase if they export a PascalCase component (e.g., `Sheet.tsx` exports `function Sheet()`)

- Directories: `kebab-case` throughout (`app/`, `components/`, `lib/`, `scripts/`, etc.)

### Components

- PascalCase filenames matching the default export
  - Example: `Sheet.tsx` exports `export default function Sheet()`

### API Routes

- Next.js App Router convention: `app/api/<resource>/route.ts`
- Nested resources: `app/api/<resource>/[id]/route.ts`
- Examples: `app/api/cards/route.ts`, `app/api/cards/[id]/route.ts`

### Imports

- Path alias `@/` for all intra-project imports
  - Examples: `import { prisma } from '@/lib/prisma'`, `import { Sheet } from '@/components/Sheet'`
- Relative imports (`./ ../`) only within the same directory
- No barrel `index.ts` files — imports reference the source file directly

---

## Where to Add New Code

### New Feature Endpoint

1. **API route:** `app/api/<feature>/route.ts`
   - Validate input, call `lib/` functions, return JSON
2. **Server-side helper:** `lib/<feature>.ts` (if complex logic)
   - Pure, testable, no side effects
3. **Database schema:** Add model to `prisma/schema.prisma`, run `npx prisma generate`
4. **Tests:** `tests/<feature>.test.ts` for pure lib functions

### New UI Component

1. **Component:** `components/<FeatureName>.tsx`
   - Use PascalCase filename
   - Declare `'use client'` if interactive
2. **Call from:** A page (`app/*/page.tsx`) or another client component
3. **Imports:** From `@/lib` for logic, `@/components` for other UI

### New Page/Route

1. **Page:** `app/<route>/page.tsx` (async RSC, no `'use client'`)
   - Fetch data server-side
   - Serialize `Date` → ISO strings
   - Render one `*Client.tsx` component with props
2. **Client shell:** `components/<FeatureNameClient>.tsx` (PascalCase, starts with `'use client'`)
   - All state, hooks, event handlers
   - No data-fetching in `useEffect` (data arrives as props)
3. **Loading skeleton:** `app/<route>/loading.tsx` (optional; static server component)
   - Use `bg-surface-2 animate-pulse`
   - Mimic the page layout for a smooth visual transition

### New Database Model

1. **Schema:** Add model to `prisma/schema.prisma`
   - Use `@id @default(cuid())` for primary keys
   - Use `DateTime @default(now())` + `@updatedAt` for timestamps
   - Add comments explaining purpose
2. **Generate:** `npx prisma generate` (updates Prisma client in `app/generated/prisma/`)
3. **Turso DDL (if production):** Extract via `npx prisma migrate diff`, run manually against Turso via `@libsql/client`
4. **Queries:** Add getters/setters to `lib/settings.ts` (for app settings) or call Prisma directly in `lib/` functions (for data models)

### New App Setting

1. **Schema:** Add `Setting` row (key/value string pair) to `prisma/schema.prisma` comments
2. **Getter/Setter:** Add to `lib/settings.ts`
   - Example: `export async function getDailyGoalSeconds(): Promise<number>`
   - Read `Setting` table by key, return default on miss
3. **API:** Call the getter/setter from `app/api/settings/route.ts`
4. **Layout injection:** If needed server-side (CSS var, feature flag), call in `app/layout.tsx` and inject as prop/inline style
5. **UI:** Add to `app/settings/page.tsx` form

---

## Special Directories

### `app/generated/`

Auto-generated by Prisma. Never edit manually. Ignore in git? No — it's committed so the build is reproducible without running `prisma generate`.

### `.next/`

Build output; generated by `next build`; gitignored.

### `.vercel/`

Vercel project metadata; committed.

---

## Key File Locations

**Entry Points:**
- `middleware.ts` (project root) — Auth gate; compiles to `.next/server/middleware.js`
- `app/layout.tsx` — Root RSC layout; injects theme CSS vars, mounts `GlossProvider`, `ThemeWatcher`, `Nav`, pre-paint theme script
- `app/page.tsx` — Home dashboard (default `/` route); async RSC → `HomeClient.tsx`
- `app/study/page.tsx` — Study session route; async RSC → `StudyClient.tsx`
- `app/cards/page.tsx` — Cards management; async RSC → `CardsClient.tsx`
- `app/habits/page.tsx` — Habit tracking; async RSC → `HabitsClient.tsx`

**Configuration:**
- `next.config.ts` — Next.js configuration
- `tsconfig.json` — TypeScript compiler options (strict mode, bundler resolution, path alias)
- `eslint.config.mjs` — ESLint rules (eslint-config-next 16, core-web-vitals)
- `postcss.config.mjs` — PostCSS + Tailwind v4
- `app/globals.css` — Global styles + semantic CSS token definitions
- `prisma/schema.prisma` — Database schema (source of truth for Prisma)
- `.env` / `.env.local` — Local environment variables (not committed)

**Schema & Database:**
- `prisma/schema.prisma` — 7 models (Lesson, Card, Sentence, CardReview, CardDependency, StudyDay, Setting)
- `lib/prisma.ts` — Singleton Prisma client (libSQL adapter)
- `lib/dto.ts` — Serialization contract (every `DateTime` typed `string` for RSC→client safety)

**Core Business Logic:**
- `lib/study-cards.ts` — `getStudyCards()` due-card pipeline (used by RSC and API)
- `lib/dashboard.ts` — `getStats()` + `getActivityData()` (used by RSC and API)
- `lib/sequence.ts` — `sequenceCards()` + `selectSessionCards()` (foundation-first ordering)
- `lib/fsrs.ts` — FSRS spaced-repetition algorithm
- `lib/card-key.ts` — `normalizeFront()` dedup function (single source of truth)
- `lib/extract-cards.ts` — Claude Opus prompt for card extraction
- `lib/gloss.ts` — Claude Haiku prompt for tap-to-gloss
- `lib/sentence-match.ts` — Korean substring matching and blank-safety rules

**UI Components (Main Routes):**
- `components/HomeClient.tsx` — Home dashboard (hero + streaks + stats)
- `components/StudyClient.tsx` — Study mode selector + session
- `components/CardsClient.tsx` — Cards list + filter + edit
- `components/HabitsClient.tsx` — Habit heatmap + streaks
- `components/StudySession.tsx` — Flashcard + multiple-choice + fill-blank (3D flip, mastery language grade bar)
- `components/CardEditor.tsx` — Inline card editor (add/edit sentences, live highlight preview)

---

*Structure analysis: 2026-07-02*
