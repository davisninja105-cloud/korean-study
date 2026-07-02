# Architecture
_Last updated: 2026-07-01 (v1.2 Performance & Snappiness)_

## Summary

Korean Study is a Next.js 16 App Router application for spaced-repetition Korean language learning. It is structured as a single-tenant PWA (one user behind a shared password) with server-side React components, a Next.js API layer, Prisma over libSQL/Turso as the database, and Claude (Anthropic) as the AI backbone for card extraction, practice generation, and tap-to-gloss. The architecture is request-driven with no background workers; all AI and sync operations are triggered by user actions and processed inside Vercel serverless functions. As of v1.2, every main route (`/cards`, `/study`, `/`, `/habits`) follows an **RSC + client-shell + DTO** pattern: the `page.tsx` is a thin async server component that fetches initial data and hands it to exactly one `*Client.tsx` component as props, eliminating the empty-state/blank-loading flash that a `'use client'`-with-`useEffect` page would otherwise show on first paint.

---

## System Overview

```text
┌──────────────────────────────────────────────────────────────────┐
│                    Next.js App Router (RSC)                       │
│   app/page.tsx  app/study/  app/cards/  app/habits/  app/wrapped │
│   app/settings/ app/login/                                        │
└────────────────────────┬─────────────────────────────────────────┘
                         │ fetch / Server Actions
                         ▼
┌──────────────────────────────────────────────────────────────────┐
│                    Next.js API Routes  (app/api/)                 │
│  /sync  /cards  /cards/due  /cards/[id]  /review  /review/undo   │
│  /generate  /gloss  /tts  /activity  /lessons  /stats  /settings │
│  /login                                                           │
└───────┬────────────────┬──────────────┬───────────────┬──────────┘
        │                │              │               │
        ▼                ▼              ▼               ▼
┌──────────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────┐
│  lib/ (pure) │  │  Prisma ORM  │  │  Claude  │  │  External    │
│  fsrs.ts     │  │  lib/prisma  │  │  API     │  │  Services    │
│  sequence.ts │  │  (libSQL     │  │ (Opus +  │  │  Google Docs │
│  card-key.ts │  │  adapter)    │  │  Haiku)  │  │  ElevenLabs  │
│  habit.ts    │  └──────┬───────┘  └──────────┘  │  Vercel Blob │
│  sentence-   │         │                         └──────────────┘
│  match.ts    │         ▼
│  auth.ts     │  ┌──────────────┐
│  settings.ts │  │  Turso DB    │
│  ...         │  │  (libsql://) │
└──────────────┘  └──────────────┘
```

---

## Authentication

**Model:** Single shared-password gate.

- `middleware.ts` (compiled to `.next/server/middleware.js`) intercepts all requests. It allows `/login`, `/api/login`, and PWA/static assets; everything else requires a valid auth cookie.
- `lib/auth.ts` provides `computeAuthToken()` — HMAC-SHA256(`AUTH_SECRET`, fixed message string). The cookie stores this token; middleware recomputes and compares. No sessions table; stateless.
- Login flow: `POST /api/login/route.ts` checks the posted password against `APP_PASSWORD`, sets the HMAC cookie on success.
- Auth cookie name: `ks_auth`. Uses Web Crypto so the same code runs in Edge middleware and Node route handlers.

---

## Data Flow

### 1. Content Ingestion (Sync)

```
User taps "sync" (pull-to-refresh on Home, or Settings ▸ Advanced)
  → POST /api/sync  (app/api/sync/route.ts)
    → lib/google-docs.ts: fetches Google Doc tab "수업 노트" via Docs API v1
        returns { text, emphasized }[] — one entry per lesson (split at <hr>)
    → SHA-256 hash each lesson text; query DB for already-processed hashes
    → For each new lesson (max 1 per request per MAX_LESSONS_PER_SYNC):
        → lib/extract-cards.ts: sends lesson text + emphasized terms + existing
            normalizedFronts to claude-opus-4-8 (adaptive thinking, streaming)
        → Returns typed Card objects with sentences[] and components[]
        → Prisma upsert by normalizedFront (DB-enforced dedup via @unique)
        → Resolves components[] lemmas → CardDependency edges (two-phase link)
    → Returns { synced, newLessons, newCards, remaining }
    → Client repeats if remaining > 0
```

### 2. Study Session

```
User opens /study
  → app/study/page.tsx (async RSC, no 'use client')
      → Promise.all([ getStudyCards({scope:'due',...}), prisma.lesson.findMany() ])
      → renders <StudyClient initialCards initialLessons> — no loading phase

  → lib/study-cards.ts: getStudyCards()
      → Promise.allSettled([ pool fetch (cards WHERE nextReview <= now,
          filtered by lesson range, take 1000), knownLemmas fetch (state >= 1) ])
          pool reject → throw (500); knownLemmas reject → empty Set (degrade)
      → CardDependency edges among pool IDs (sequential — depends on pool)
      → selectSessionCards() — downward-closed prerequisite selection, capped
      → lib/sequence.ts: sequenceCards() — blended depth+urgency sort
      → lib/known-words.ts: annotate each sentence with unknownCount
      → serialize: all Date fields → ISO strings (lib/dto.ts CardDTO contract)
      → Returns reordered CardDTO[] with sentences and FSRS state

  → components/StudyClient.tsx starts in 'select-mode' (props, not fetch)
      → Lesson-range filter change re-calls GET /api/cards/due (delegates to
          the same getStudyCards()) with isFilterLoading spinner, not a phase change
      → components/StudySession.tsx renders cards in server-supplied order
          → submitReview is synchronous: reviewCard() computes FSRS client-side,
              queue advances immediately; POST /api/review fires fire-and-forget
          → POST /api/review/undo available to restore previous state
          → POST /api/activity increments StudyDay.seconds / reviews
```

### 3. Tap-to-Gloss

```
User taps a word in a Korean sentence (HighlightedSentence.tsx)
  → useWordTap() from GlossProvider context
  → Resolution order:
      1. normalizeFront(word) → exact Card lookup (in-memory, instant)
      2. Stem fallback via splitParticle
      3. Setting table cache (key prefix "gloss:")
      4. POST /api/gloss → lib/gloss.ts → claude-haiku-4-5-20251001
  → GlossProvider renders anchored popover with dictionary form + gloss
  → "Add as card?" → POST /api/cards
```

### 4. Text-to-Speech

```
AudioButton taps on sentence or card front
  → GET /api/tts?text=&voice=
      → Hash (provider.id, voice, text) → check Vercel Blob (head())
      → Cache hit: return stable public Blob URL
      → Cache miss: lib/tts.ts → activeTtsProvider.synthesize()
          → ElevenLabs (eleven_multilingual_v2) or Google Neural2
          → put() to Vercel Blob → return URL
  → new Audio(url).play() in browser
  → Fallback: window.speechSynthesis (ko-KR) on non-200
```

### 5. AI Practice Generation

```
POST /api/generate
  → lib/generate-practice.ts → Claude API (model from lib context)
  → Returns ephemeral extra exercises (not persisted to DB)
```

---

## Module Boundaries

### `lib/` — Pure Business Logic

All modules in `lib/` are side-effect-free or explicitly named for their single external dependency. They do not import from `app/` or `components/`.

| File | Responsibility |
|------|---------------|
| `lib/auth.ts` | HMAC token computation; usable in Edge + Node |
| `lib/card-key.ts` | `normalizeFront()` — single dedup-key function |
| `lib/card-style.ts` | `typeBadgeClass()` — card-type badge CSS source of truth |
| `lib/color.ts` | `readableForeground()` — contrast color helper |
| `lib/copy.ts` | Pure warm-copy string helpers; no side effects |
| `lib/dashboard.ts` *(v1.2)* | Server-only: `getStats()` + `getActivityData()`, shared by RSC pages and GET API routes |
| `lib/dto.ts` *(v1.2)* | Shared server→client DTO types; every `DateTime` field typed `string` (ISO) — the RSC serialization contract |
| `lib/extract-cards.ts` | Claude Opus prompt for lesson → cards extraction |
| `lib/fsrs.ts` | FSRS spaced-repetition algorithm (ts-fsrs wrapper) |
| `lib/generate-practice.ts` | Claude prompt for ephemeral practice generation |
| `lib/gloss.ts` | Haiku gloss prompt + Setting-table cache helpers |
| `lib/google-docs.ts` | Google Docs API v1 fetch + emphasis capture |
| `lib/habit.ts` | Pure streak/freeze/heatmap computation helpers |
| `lib/haptics.ts` | `haptic()` — `navigator.vibrate` wrapper, no-op-safe |
| `lib/known-words.ts` | `countUnknownWords()` — pure ranking signal for sentence selection |
| `lib/palettes.ts` | Color palette data — pure, client+server safe |
| `lib/prisma.ts` | Singleton Prisma client (libSQL adapter) |
| `lib/proficiency.ts` | CEFR band mapper; `computeProficiency()` |
| `lib/sentence-match.ts` | Korean substring match/blank safety rules |
| `lib/sequence.ts` | `sequenceCards()` — foundation-first blended sort |
| `lib/settings.ts` | Server-side DB getters/setters for all app settings |
| `lib/study-cards.ts` *(v1.2)* | Server-only: `getStudyCards()` due-card pipeline, shared by the study RSC page and `GET /api/cards/due` |
| `lib/theme.ts` | Theme toggle helpers (localStorage-based) |
| `lib/tts.ts` | TTS provider abstraction + two provider implementations |
| `lib/usePullToRefresh.ts` | Touch pull-to-refresh React hook |

### `app/api/` — API Route Handlers

Thin handlers: validate input, call `lib/` functions, query Prisma, return JSON. No business logic lives here.

| Route | Method(s) | Purpose |
|-------|-----------|---------|
| `/api/sync` | POST | Ingest new Google Doc lessons → extract cards |
| `/api/cards` | GET, POST | List all cards; create a card |
| `/api/cards/due` | GET | Due (or ahead-scope) cards, sequenced — delegates to `lib/study-cards.ts:getStudyCards()` |
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

Components are `'use client'` unless they contain no interactivity. They import from `lib/` and call API routes via `fetch`. They do not import from `app/`.

Key component groups:

- **Page shells (v1.2 RSC pattern):** `CardsClient.tsx`, `StudyClient.tsx`, `HomeClient.tsx`, `HabitsClient.tsx` — each owns all interactivity for its route, initialized from server-fetched props (no initial-load `useEffect`)
- **Study:** `StudySession.tsx`, `ModeSelector.tsx`, `HighlightedSentence.tsx`, `AudioButton.tsx`
- **Cards management:** `CardEditor.tsx`, `SwipeRow.tsx`, `LessonRangeFilter.tsx`
- **Habit/stats:** `HabitTracker.tsx`, `HabitHeatmap.tsx`, `MilestoneCelebration.tsx`, `ProficiencyArc.tsx`, `ProgressRing.tsx`, `StatsBar.tsx`
- **Layout/shell:** `Nav.tsx`, `Sheet.tsx`, `ThemeWatcher.tsx`, `GlossProvider.tsx`, `SyncPanel.tsx`

### `app/` — Page Routes (RSC)

Pages are React Server Components by default. As of v1.2, the four main routes (`/`, `/study`, `/cards`, `/habits`) are thin async RSCs: they fetch data directly (Prisma via `lib/dashboard.ts` / `lib/study-cards.ts`, or `lib/settings`) and render exactly one `*Client.tsx` component with the results as props — no hooks, no `'use client'`, no other logic. They do not import from each other. `app/*/loading.tsx` files (static server components, `bg-surface-2 animate-pulse`) are the Next.js fallback shown during client-side navigation to these routes.

| Route | Page (RSC) | Client shell |
|-------|-----------|--------------|
| `/` | Home — fetches `StatsDTO` + `ActivityDTO` | `HomeClient.tsx`: hero + HabitTracker + StatsBar + ProficiencyArc |
| `/study` | Study — fetches `CardDTO[]` + lessons | `StudyClient.tsx`: mode selector + StudySession, starts in `select-mode` |
| `/cards` | Cards — fetches `CardDTO[]` + lessons | `CardsClient.tsx`: filterable list + CardEditor sheet |
| `/habits` | Habits — fetches `ActivityDTO` + masteredCount | `HabitsClient.tsx`: heatmap + streaks + ProficiencyArc |
| `/settings` | App settings: theme + colors + goal + sync | *(not yet RSC-converted)* |
| `/wrapped` | "My Korean" summary: CEFR arc + stats + share | *(not yet RSC-converted)* |
| `/login` | Password login form | — |

---

## Database Schema Overview

Seven models in `prisma/schema.prisma`. Prisma client is generated to `app/generated/prisma/` and accessed via the singleton in `lib/prisma.ts`.

```
Lesson  (1) ──< Card (N)
Card    (1) ──< Sentence (N)
Card    (1) ──< CardReview (1)
Card    (N) ──< CardDependency >── Card (N)   [prerequisite graph]
StudyDay    (standalone, keyed by habit-date string)
Setting     (key/value store; also holds gloss: cache entries)
```

- `Card.normalizedFront` is `@unique` — enforces dedup at the DB level.
- `Card.components` (JSON string[]) stores raw Claude-returned prerequisite lemmas; resolved to `CardDependency` rows at sync time.
- `StudyDay.date` uses the user-local habit-day string `"YYYY-MM-DD"` (not UTC), computed via `habitDateStr(hour)` from `lib/habit.ts`.
- `Setting` doubles as a gloss lookup cache (`gloss:<normalizedWord>` prefix keys).

---

## Key Design Patterns

**Foundation-first sequencing:** `lib/sequence.ts` implements a blended score `depth − urgencyBoost` where `depth` is the longest in-session prerequisite chain (DFS, cycle-safe) and `urgencyBoost` rewards overdue cards. Cards are sorted ascending by score — foundations come first, but severely overdue cards can leapfrog up to 3 prerequisite levels.

**Dedup via normalizedFront:** `lib/card-key.ts:normalizeFront()` strips trailing English glosses in parens, NFC-normalizes, collapses whitespace. This is the single source of truth for "are two card fronts the same item?" Used by sync upsert, card editor, scripts, and gloss resolution.

**Sentence-centric presentation:** `Sentence` rows are purely presentational. The FSRS review unit is `Card`. Sentences rotate across reviews via `(hashStr(card.id) + reps) % sentences.length` — purity-safe (no `Math.random()`).

**TTS provider abstraction:** `lib/tts.ts` exports a `TtsProvider` interface. Adding a new TTS provider requires only a new implementation + env var flip; call sites (`app/api/tts/route.ts`) never change.

**Color system:** Semantic CSS tokens (`--surface-1/2/3`, `--reward`, `--button`, `--cat-*`, `--highlight-bg/fg`) defined in `app/globals.css`. Blue is reserved for actions; card-type colors (indigo/violet/teal) are off the primary action color. Two user-configurable accents (`buttonColor`, `rewardColor`) are DB settings injected as `style` on `<html>` at server render.

**Theme without flash:** A pre-paint inline `<script>` in `app/layout.tsx` reads `localStorage('theme')` and sets `data-theme` on `<html>` before first paint. Tailwind's `dark:` variant is rebound to `[data-theme="dark"]` via `@custom-variant dark`. The OS `@media` block stays as a no-JS fallback.

**RSC + client-shell + DTO (v1.2):** Every main route's `page.tsx` is a thin async server component (no hooks, no `'use client'`) that fetches its data via a shared `lib/` pipeline function and renders exactly one `*Client.tsx` component with the result as props. This eliminates first-paint empty-state flashes without introducing per-page fetch logic duplication — the same `lib/` function (`getStudyCards`, `getStats`, `getActivityData`) also backs the legacy GET API route used for client-side re-fetches (e.g. the lesson-range filter). The DTO boundary (`lib/dto.ts`) is the enforcement point: every `DateTime` field must be `.toISOString()`'d before the prop crosses into the client component, or Next.js throws a serialization error at runtime.

**Concurrent non-critical queries via `Promise.allSettled`:** Where a request has one critical query (must succeed or the request fails) and one non-critical query (a ranking/annotation signal), the two run concurrently via `Promise.allSettled` rather than `Promise.all` — a non-critical failure degrades gracefully (e.g. empty known-lemmas Set) instead of failing the whole request. Established in `lib/study-cards.ts`.

---

## Architectural Constraints

- **Vercel Hobby 60 s timeout:** `maxDuration = 300` in route code has no effect. Each `/api/sync` processes exactly 1 lesson (`MAX_LESSONS_PER_SYNC = 1`). Bulk operations must run locally via `scripts/local-resync.mts`.
- **Turso / libSQL:** `prisma db push` and `prisma migrate` do not work against `libsql://`. Schema changes require manual DDL via `@libsql/client` `executeMultiple()`.
- **Single-tenant:** No user model, no multi-tenancy. Auth is a single shared password.
- **No background workers:** All processing is triggered by user actions.
- **ESLint strict mode:** `react-hooks/purity` forbids `Date.now()` / `Math.random()` in render. `react-hooks/set-state-in-effect` forbids synchronous `setState` in effect bodies. Lint must pass clean.

---

## Anti-Patterns

### Raw `localDateStr()` for activity logging

**What happens:** Using UTC or raw local date for StudyDay entries.
**Why it's wrong:** The habit day may start at a configurable hour (e.g. 2 AM), not midnight. Using the wrong date string corrupts streak data.
**Do this instead:** Always call `habitDateStr(hour)` from `lib/habit.ts` when writing or reading `StudyDay.date`.

### `Math.random()` / `Date.now()` in render or module scope

**What happens:** Calling impure functions at the top of a component or directly in JSX.
**Why it's wrong:** ESLint `react-hooks/purity` will fail; values also differ between server and client, causing hydration mismatches.
**Do this instead:** Read time/randomness in `useEffect`, event handlers, or via seeded values (see `seededShuffle` and the `seed` memo in `components/StudySession.tsx`).

### Adding new settings outside `lib/settings.ts`

**What happens:** Directly querying `prisma.setting.findUnique` in route handlers or components for a new setting.
**Why it's wrong:** Bypasses the single source of truth; defaults and types become scattered.
**Do this instead:** Add a getter/setter to `lib/settings.ts`, then plumb it through `app/api/settings/route.ts`.

---

*Architecture analysis: 2026-06-23 — updated 2026-07-01 for v1.2 (RSC + client-shell + DTO hydration pattern)*
