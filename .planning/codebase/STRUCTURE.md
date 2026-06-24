# Codebase Structure
_Last updated: 2026-06-23_

## Summary

Korean Study is a Next.js 16 App Router monorepo (single app, no workspaces). Source code is organized into three top-level directories: `app/` (pages and API routes), `components/` (shared React UI), and `lib/` (pure business logic and server utilities). Configuration, scripts, and schema files live at the project root. The database client is generated into `app/generated/prisma/` and is not manually edited.

---

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
│   ├── cards/page.tsx               # /cards — card library
│   ├── habits/page.tsx              # /habits — full habit stats
│   ├── login/page.tsx               # /login — password gate
│   ├── settings/page.tsx            # /settings — app configuration
│   ├── study/page.tsx               # /study — active study session
│   ├── wrapped/page.tsx             # /wrapped — "My Korean" summary
│   ├── globals.css                  # Global styles + CSS token definitions
│   ├── layout.tsx                   # Root layout (RSC): theme inject, GlossProvider, Nav
│   ├── manifest.ts                  # PWA web app manifest
│   ├── page.tsx                     # / — Home dashboard
│   └── favicon.ico
├── components/                      # Shared React components (client + RSC)
│   ├── AudioButton.tsx
│   ├── CardEditor.tsx
│   ├── GlossProvider.tsx
│   ├── HabitHeatmap.tsx
│   ├── HabitTracker.tsx
│   ├── HighlightedSentence.tsx
│   ├── LessonRangeFilter.tsx
│   ├── MilestoneCelebration.tsx
│   ├── ModeSelector.tsx
│   ├── Nav.tsx
│   ├── ProficiencyArc.tsx
│   ├── ProgressRing.tsx
│   ├── Sheet.tsx
│   ├── StatsBar.tsx
│   ├── StudySession.tsx
│   ├── SwipeRow.tsx
│   ├── SyncPanel.tsx
│   └── ThemeWatcher.tsx
├── lib/                             # Pure business logic + server utilities
│   ├── auth.ts
│   ├── card-key.ts
│   ├── card-style.ts
│   ├── color.ts
│   ├── copy.ts
│   ├── extract-cards.ts
│   ├── fsrs.ts
│   ├── generate-practice.ts
│   ├── gloss.ts
│   ├── google-docs.ts
│   ├── habit.ts
│   ├── haptics.ts
│   ├── palettes.ts
│   ├── prisma.ts
│   ├── proficiency.ts
│   ├── sentence-match.ts
│   ├── sequence.ts
│   ├── settings.ts
│   ├── theme.ts
│   ├── tts.ts
│   └── usePullToRefresh.ts
├── prisma/
│   └── schema.prisma                # DB schema (7 models)
├── public/                          # Static assets
│   ├── icon.svg                     # Source icon (한 on brand blue)
│   ├── icon-192.png                 # PWA icon
│   ├── icon-512.png
│   ├── apple-icon.png
│   └── icon-512-maskable.png
├── scripts/                         # One-time / operational scripts (run locally)
│   ├── local-resync.mts             # Full re-extraction of all lessons (bypasses Vercel timeout)
│   ├── relink-dependencies.mjs      # Rebuild all CardDependency edges
│   ├── apply-graph-ddl.mjs          # One-time DDL for normalizedFront + CardDependency
│   ├── apply-sentence-ddl.mjs       # One-time DDL for Sentence table (already applied)
│   ├── add-lesson-order.mjs         # One-time backfill for Lesson.orderIndex (already applied)
│   ├── wipe-card-data.mjs           # Delete all card/lesson/review rows (keeps StudyDay/Setting)
│   ├── find-duplicates.mjs          # Report near-duplicate card fronts
│   ├── full-resync.mjs              # Drive repeated POST /api/sync until remaining=0
│   └── gen-icons.mjs                # Rasterize icon.svg → PNG icon set via sharp
├── plans/                           # Feature plans (reference, not consumed at runtime)
│   ├── P0-foundations.md
│   ├── P1-identity-retention.md
│   ├── P2-polish-delight.md
│   └── README.md
├── .planning/                       # GSD planning artifacts
│   └── codebase/                    # Codebase map documents (this file)
├── .claude/                         # Claude Code project settings
│   └── settings.local.json
├── .vercel/                         # Vercel project linkage
│   └── project.json
├── CLAUDE.md                        # Claude Code guidance (primary architecture reference)
├── AGENTS.md                        # Agent instructions
├── next.config.ts                   # Next.js config (minimal)
├── eslint.config.mjs                # ESLint (eslint-config-next 16, strict)
├── postcss.config.mjs               # PostCSS (Tailwind v4)
├── tsconfig.json                    # TypeScript config
├── package.json
├── package-lock.json
├── next-env.d.ts
├── dev.db                           # Local SQLite dev database
└── fixes_needed.txt                 # Informal backlog / audit notes
```

---

## Directory Purposes

### `app/`

Next.js 16 App Router root. Each subdirectory containing `page.tsx` is a route; `api/` subdirectories with `route.ts` are serverless function handlers. Pages are React Server Components by default; they fetch data directly (Prisma, `lib/settings`) without going through the API layer.

### `app/generated/prisma/`

Auto-generated Prisma client. Created by `npx prisma generate`. Never edited by hand. The `output` directive in `prisma/schema.prisma` points here so the client works in the Vercel build environment.

### `components/`

All shared React UI. Flat directory — no sub-grouping by domain. Components that need browser APIs or interactivity declare `'use client'`. Components that are purely presentational may be RSC-compatible. None import from `app/`.

### `lib/`

Business logic, utilities, and server-side helpers. All files are importable from both API routes and RSC pages. `lib/prisma.ts` exports the Prisma singleton. AI prompt functions (`extract-cards.ts`, `generate-practice.ts`, `gloss.ts`) live here and are called from API routes.

### `prisma/`

Contains only `schema.prisma`. Migration files are not used (Turso requires manual DDL); `prisma generate` is the only Prisma command run in CI/build.

### `scripts/`

Operational scripts for one-time migrations and bulk operations that cannot run inside Vercel serverless functions (60 s hard timeout). Run locally with `node` or `npx tsx`. Use `scripts/local-resync.mts` for full corpus re-extraction.

### `plans/`

Markdown design documents for past/current feature work. Not imported at runtime. Kept for historical reference.

### `public/`

Static files served at `/`. Contains the PWA icon set generated by `scripts/gen-icons.mjs` from `public/icon.svg`.

---

## Key File Locations

**Entry Points:**
- `app/layout.tsx` — Root RSC layout: injects theme CSS vars, mounts `GlossProvider`, `ThemeWatcher`, `Nav`, pre-paint theme script
- `app/page.tsx` — Home dashboard (default route)
- `app/study/page.tsx` — Study session route
- `middleware.ts` — Auth gate (compiled; source not present in root but active via `.next/server/middleware.js`)

**Schema & DB:**
- `prisma/schema.prisma` — Single source of truth for all DB models
- `lib/prisma.ts` — Singleton Prisma client with libSQL adapter
- `app/generated/prisma/` — Generated client (do not edit)

**Core Business Logic:**
- `lib/sequence.ts` — Foundation-first card sequencer
- `lib/fsrs.ts` — FSRS algorithm
- `lib/extract-cards.ts` — Claude Opus card extraction prompt
- `lib/card-key.ts` — `normalizeFront()` dedup key
- `lib/settings.ts` — All DB-backed app settings getters/setters
- `lib/tts.ts` — TTS provider abstraction

**Styles:**
- `app/globals.css` — CSS token definitions (`--surface-1/2/3`, `--reward`, `--button`, `--cat-*`, `--highlight-bg/fg`), Tailwind `@theme inline` utilities, dark mode variants, `prefers-reduced-motion` blocks

**Config:**
- `next.config.ts` — Minimal (no custom config currently)
- `eslint.config.mjs` — `eslint-config-next` 16; strict
- `tsconfig.json` — Path alias `@/` → project root
- `postcss.config.mjs` — Tailwind CSS v4

---

## Naming Conventions

**Files:**
- `kebab-case.ts` for all files in `lib/` and `scripts/`
- `PascalCase.tsx` for all React components in `components/`
- `route.ts` for all API handlers (Next.js convention)
- `page.tsx` for all page components (Next.js convention)

**Directories:**
- Route segments in `app/` use `kebab-case` (e.g. `cards/`, `review/`, `cards/due/`)
- Dynamic segments use `[param]` notation (e.g. `cards/[id]/`)

---

## Where to Add New Code

**New page/route:**
- Create `app/<route-name>/page.tsx` (RSC by default)
- If it needs client interactivity, extract logic to a `'use client'` component in `components/`

**New API endpoint:**
- Create `app/api/<endpoint>/route.ts`
- Business logic goes in `lib/`, not inline in the route handler
- Validate with `middleware.ts` auth automatically (no per-route auth needed)

**New shared UI component:**
- Add to `components/<ComponentName>.tsx`
- Add `'use client'` directive if it uses hooks, browser APIs, or event handlers

**New business logic / utility:**
- Add to `lib/<purpose>.ts`
- Keep it pure (no side effects, no Prisma) if possible; name it clearly
- If it's a server-only DB helper, keep it in `lib/` and import only from API routes or RSC pages

**New DB-persisted setting:**
- Add getter/setter to `lib/settings.ts`
- Add GET/PUT handling in `app/api/settings/route.ts`
- Expose in `app/settings/page.tsx`

**New card type badge:**
- Update `lib/card-style.ts:typeBadgeClass()` — single source of truth

**New TTS provider:**
- Implement `TtsProvider` interface in `lib/tts.ts`
- Set `TTS_PROVIDER` env var to activate; call sites unchanged

**Operational / migration script:**
- Add to `scripts/` as `.mjs` or `.mts`
- Use `@libsql/client` directly for DDL (Prisma migrate does not work against Turso)

---

## Special Directories

**`app/generated/`:**
- Purpose: Auto-generated Prisma client
- Generated: Yes (`npx prisma generate`)
- Committed: Yes (required for Vercel builds — no generate step in build by default; `package.json` `build` script runs `prisma generate` first)

**`.next/`:**
- Purpose: Next.js build output and dev server cache
- Generated: Yes
- Committed: No

**`.planning/`:**
- Purpose: GSD planning artifacts and codebase maps
- Generated: By GSD tooling
- Committed: Yes (planning reference)

**`dev.db`:**
- Purpose: Local SQLite database for development
- Generated: Yes (on first `prisma db push` or DDL run against local file)
- Committed: No (in `.gitignore`)

---

*Structure analysis: 2026-06-23*
