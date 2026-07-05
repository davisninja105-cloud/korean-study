<!-- refreshed: 2026-07-05 -->
# Architecture

**Analysis Date:** 2026-07-05

## System Overview

```text
┌──────────────────────────────────────────────────────────────┐
│                    Next.js 16 App Router                     │
│            Pages: / /study /cards /habits /settings           │
│            API: /api/sync /api/cards /api/review /api/tts     │
└────────────────────────┬─────────────────────────────────────┘
                         │ RSC fetch / API calls
                         ▼
┌──────────────────────────────────────────────────────────────┐
│                 Middleware (Auth Gate)                        │
│         middleware.ts — HMAC cookie validation                │
│    Protects: pages + API; Allows: /login + static assets      │
└────────────────────────┬─────────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
   ┌─────────────┐  ┌──────────────┐  ┌──────────┐
   │  RSC Pages  │  │  API Routes  │  │  Scripts │
   │  (thin)     │  │  (thin)      │  │  (CLI)   │
   └────┬────────┘  └──────┬───────┘  └──────────┘
        │                   │
        └───────┬───────────┘
                │
                ▼
    ┌─────────────────────────────────┐
    │   lib/ (Pure Business Logic)    │
    │  ├── card-key.ts (dedup)        │
    │  ├── sequence.ts (ordering)     │
    │  ├── fsrs.ts (scheduling)       │
    │  ├── study-cards.ts (pipeline)  │
    │  ├── extract-cards.ts (Claude)  │
    │  ├── known-words.ts (ranking)   │
    │  ├── gloss.ts (tap lookup)      │
    │  ├── tts.ts (audio)             │
    │  ├── auth.ts (HMAC)             │
    │  └── 30+ more…                  │
    └──────────┬──────────────────────┘
               │
               ▼
    ┌──────────────────────────────────┐
    │  Prisma ORM + libSQL Adapter    │
    │  (Turso in prod, SQLite in dev)  │
    └──────────┬───────────────────────┘
               │
               ▼
    ┌──────────────────────────────────┐
    │   External Services              │
    │  ├── Google Docs API (sync)      │
    │  ├── Claude API (extract + gloss)│
    │  ├── ElevenLabs TTS (audio)      │
    │  ├── Vercel Blob (cache)         │
    │  └── Vercel Cron (auto-sync)     │
    └──────────────────────────────────┘
```

## Component Responsibilities

| Component | File(s) | Responsibility |
|-----------|---------|-----------------|
| Middleware | `middleware.ts` | HMAC cookie validation; auth gate; 401/redirect |
| RSC Pages | `app/*/page.tsx` | Fetch data server-side via Prisma/lib; serialize to DTOs; render one client shell |
| API Routes | `app/api/**/route.ts` | Validate input; delegate to lib/Prisma; serialize response; 400/500 error handling |
| Client Shells | `components/*Client.tsx` | State mgmt, event handlers, re-fetch logic, localStorage (StudyClient, CardsClient, HomeClient, HabitsClient) |
| Study UI | `components/Study*.tsx`, `components/Flashcard*.tsx`, etc. | 3D flip, grade buttons, sentence display, audio, gloss integration |
| Core Components | `components/Sheet.tsx`, `components/ProgressRing.tsx`, etc. | Reusable UI primitives |
| Pure Library | `lib/*.ts` (30+ files) | Domain logic: sequencing, FSRS, dedup, auth, settings, external service calls |
| Database Layer | `lib/prisma.ts`, `prisma/schema.prisma` | Prisma client singleton, 7 models, Turso/SQLite |

## Pattern Overview

**Overall:** Server-first RSC (React Server Components) architecture with a strict DTO serialization boundary.

**Key Characteristics:**
- **RSC-first data fetching:** Pages fetch data server-side via Prisma; no client-side `useEffect` data loading
- **DTO boundary (RSC-05):** All `Date` fields serialized to ISO strings before crossing server→client props (`lib/dto.ts`)
- **Shared pipelines:** Complex logic extracted to `lib/` so both RSC pages and API routes call identical code (DRY)
- **Pure lib layer:** Core business logic is side-effect-free, reusable in server + client + tests
- **No initial-load skeleton:** RSC hydration delivers data in initial HTML; client shells start in "ready" state
- **Optimistic grading:** Study review is fully client-side + synchronous; DB save is fire-and-forget background task
- **Foundation-first ordering:** FSRS blended with prerequisite graph for learning-first sequencing
- **No barrel files:** All imports reference source files directly (e.g., `@/lib/card-key`, not `@/lib`)

## Layers

**Middleware Layer:**
- Purpose: Authenticate every request; gate protected pages and APIs
- Location: `middleware.ts`
- Contains: HMAC token validation via Web Crypto (Edge-safe)
- Depends on: `lib/auth.ts`; Next.js `NextRequest`/`NextResponse`
- Used by: Next.js edge runtime (compiles to `.next/server/middleware.js`)
- Logic: Extract auth cookie; recompute HMAC; validate; allow `/login`, `/api/login`, static assets; redirect/401 for others

**RSC Page Layer:**
- Purpose: Fetch live DB state, serialize to DTOs, render interactive client shell
- Location: `app/*/page.tsx` (`/`, `/study`, `/cards`, `/habits`, `/settings`, `/login`, `/wrapped`)
- Contains: Async server components; Prisma queries; date serialization; prop passing to client shells
- Depends on: Prisma, `lib/study-cards.ts`, `lib/dashboard.ts`, `lib/settings.ts`, `components/*Client.tsx`
- Used by: Browser navigation; all user-facing routes
- Pattern: Thin RSC (5–20 lines): fetch + serialize + render `<SomethingClient initialData={...} />`

**API Layer:**
- Purpose: HTTP request handlers for CRUD, sync, reviews, gloss, TTS, settings
- Location: `app/api/**/route.ts` (20+ endpoints)
- Contains: Request validation (400 on bad schema), business logic delegation, response serialization, error handling (500)
- Depends on: `lib/`, Prisma, Next.js request/response types
- Used by: Client-side `fetch()`, background tasks, cron jobs, external webhooks
- Key routes: `/sync`, `/cards`, `/cards/[id]`, `/cards/due`, `/review`, `/review/undo`, `/gloss`, `/tts`, `/activity`, `/stats`, `/settings`, `/generate`, `/lessons`

**Client Shell Layer:**
- Purpose: Manage React state, interactivity, re-fetch logic; hydrate RSC-provided data
- Location: `components/*Client.tsx` (`StudyClient`, `CardsClient`, `HomeClient`, `HabitsClient`)
- Contains: `'use client'` directive; React hooks; event handlers; localStorage; fetch calls for re-fetch on filter change
- Depends on: `lib/` pure modules; child components; API routes via `fetch()`
- Used by: RSC pages as sole rendered child
- Pattern: Start directly in "ready" state with RSC-provided `initialCards`/`initialStats`; never show blank loading on first paint

**Study UI Layer:**
- Purpose: Render three study modes (flashcard, multiple-choice, fill-blank) with full interactivity
- Location: `components/StudySession.tsx` (main state machine), `components/FlashcardMode.tsx`, `components/MultipleChoiceMode.tsx`, `components/FillBlankMode.tsx`
- Contains: 3D card flip with dynamic height, grade buttons, sentence display, audio play, gloss tap integration
- Depends on: `lib/fsrs.ts`, `lib/sequence.ts`, `lib/known-words.ts`, `lib/sentence-match.ts`, `lib/habit.ts`, `components/AudioButton.tsx`, `components/HighlightedSentence.tsx`
- Used by: `StudyClient.tsx`
- Key features: Optimistic grading (sync), mastery-language grade bar, shown-sentence selection (least-unknown first)

**Business Logic Layer (Pure):**
- Purpose: Reusable, side-effect-free functions; safe in server + client + tests
- Location: `lib/*.ts` (30+ modules)
- Contains:
  - **Sequencing:** `sequence.ts` (foundation-first blended sort), `sentence-selection.ts` (pick least-unknown sentence)
  - **FSRS:** `fsrs.ts` (ts-fsrs wrapper for spaced-repetition scheduling)
  - **Dedup:** `card-key.ts` (normalizeFront() — single source of truth for card equality)
  - **Extraction:** `extract-cards.ts` (Claude Opus prompt), `link-dependencies.ts` (resolve components → edges)
  - **Learning science:** `habit.ts` (streaks/freezes), `proficiency.ts` (CEFR bands), `known-words.ts` (context ranking)
  - **Context:** `sentence-match.ts` (Korean substring safety), `filter-components.ts` (filter prerequisite lemmas)
  - **External:** `google-docs.ts` (Docs API), `gloss.ts` (Haiku prompt), `generate-practice.ts` (Opus prompt), `tts.ts` (provider abstraction)
  - **Auth & config:** `auth.ts` (HMAC), `settings.ts` (DB getters/setters), `palettes.ts` (color data)
  - **Server-only:** `study-cards.ts` (due-card pipeline), `dashboard.ts` (stats/activity pipeline)
  - **UI helpers:** `card-style.ts`, `color.ts`, `copy.ts`, `theme.ts`, `haptics.ts`
- Depends on: Anthropic SDK (only `extract-cards.ts`, `gloss.ts`, `generate-practice.ts`); Prisma (only `settings.ts`, `sync.ts`); ts-fsrs (only `fsrs.ts`)
- Used by: Pages, API routes, client shells, tests
- Pattern: Pure functions with no impure imports; `now` is a parameter (never `Date.now()` in body)

**Database Layer:**
- Purpose: Data persistence and schema definition
- Location: `lib/prisma.ts` (singleton), `prisma/schema.prisma` (schema source of truth)
- Contains: Prisma client with libSQL adapter; 7 models: Lesson, Card, Sentence, CardReview, CardDependency, StudyDay, Setting
- Depends on: `@prisma/client`, `@prisma/adapter-libsql`, `@libsql/client` (Turso in production)
- Used by: All data-access code
- Key constraints: No `prisma migrate` or `prisma db push` (Turso incompatibility); manual DDL required

## Data Flow

### Primary Request Path (Study Session)

1. **Page Load** → `app/study/page.tsx` (RSC, async, ~15 lines)
   - Calls `getStudyCards({ scope: 'due', lessonFrom: null, lessonTo: null })`
   - Calls `prisma.lesson.findMany()` concurrently
   - Serializes all `Date` → ISO strings
   - Renders `<StudyClient initialCards={cards} initialLessons={lessons} />`

2. **Data Pipeline** → `lib/study-cards.ts:getStudyCards()`
   - **Query 1 (concurrent):** Fetch eligible pool (CardReview.nextReview ≤ now, lesson range, take 1000)
   - **Query 2 (concurrent):** Fetch known-lemmas set (Card with state ≥ 1; non-critical — fails gracefully)
   - **Query 3 (sequential, depends on pool IDs):** Fetch prerequisite edges (CardDependency rows)
   - **Selection:** `selectSessionCards()` → downward-closed subset (all prereqs included, capped at sessionSize)
   - **Sequencing:** `sequenceCards()` → foundation-first: score = depth − urgencyBoost; sort ascending
   - **Annotation:** For each card, for each sentence: `countUnknownWords()` → unknownCount field
   - **Serialization:** All Prisma `Date` → `.toISOString()`; return `CardDTO[]`

3. **Client Hydration** → `components/StudyClient.tsx` (client shell, starts in `'select-mode'`)
   - Receives `initialCards` + `initialLessons` as props
   - Never shows blank loading state (data arrived in HTML)
   - User taps study button → mounts `StudySession.tsx` with `key={sessionKey}` (fresh instance)

4. **Study Session** → `components/StudySession.tsx` (main state machine)
   - Iterates through cards in server order (foundation-first)
   - Current card → render Flashcard/MC/Fill-Blank mode based on `mode` + `flashcardSubMode` props
   - User grades → `submitReview()` (synchronous):
     - Compute updated FSRS via `reviewCard()` from `lib/fsrs.ts`
     - Update card state optimistically (mutate `queue[0]`)
     - Call `setQueue()` to trigger re-render and advance to next card
     - Fire-and-forget `POST /api/review` background save (`.catch(() => {})`, never awaited)
   - Session ends → show score + "Study N more" button → `setPhase('complete')`

5. **Review Persistence** → `app/api/review/route.ts` (background, async)
   - Receives `{ cardId, rating }` from background fetch
   - Validates input
   - Looks up CardReview via `cardId`
   - Applies `reviewCard()` algorithm → new FSRS state
   - Updates CardReview row (synchronously, single transaction)
   - Appends ReviewLog row (audit trail, append-only)
   - Returns 200 (client doesn't wait, no error recovery)

### Secondary Flow (Content Ingestion / Sync)

1. **User Triggers Sync** (Home pull-to-refresh or Settings → Advanced → Sync button)
   - Calls `POST /api/sync { documentId }` from `HomeClient` or `SyncPanel`

2. **Sync Route** → `app/api/sync/route.ts` (backend, ~25 lines)
   - Calls `runSync(documentId)` from `lib/sync.ts`
   - Wraps in try/catch; returns result or 500

3. **Sync Pipeline** → `lib/sync.ts:runSync()`
   - **Fetch:** `lib/google-docs.ts:fetchGoogleDoc()` → reads "수업 노트" tab, captures bold/underline/highlighted emphasis spans per run
   - **Split:** Splits text by `<hr>` (horizontal rule) → `Lesson[]`
   - **Hash:** SHA-256 hash each lesson text; compare to existing Lesson.contentHash in DB
   - **Filter:** Keep only new lessons (contentHash not in DB)
   - **Loop (per new lesson, max 1 per request):**
     - Send lesson text + emphasized terms + existing card fronts (for dedup hint) to Claude Opus via `lib/extract-cards.ts`
     - Claude returns `{ type, front, back, notes, sentences[], components[] }`
     - Validate: ≥1 card extracted
     - **Create Lesson:** Insert with `orderIndex = max + 1` (stable position)
     - **Upsert Cards:** For each card: upsert by `normalizedFront` (DB enforces @unique); create Sentence rows (CASCADE on delete)
     - **Resolve Dependencies:** Extract `Card.components` lemmas → resolve via `lib/link-dependencies.ts` → create CardDependency edges (two-phase link, sequential)
   - **Report:** Return `{ newCards, totalCards, remaining }`
   - **Backlog:** If `remaining > 0`, user taps sync again to drain one more lesson

### Tertiary Flow (Tap-to-Gloss)

1. **User Taps Word** in `HighlightedSentence.tsx` (Korean sentence component)
   - Component detects tap via `useWordTap()` hook from `GlossProvider` context
   - Calls `showGloss(word, anchorRect)` callback

2. **Resolution Order** → `components/GlossProvider.tsx`
   - **1. Corpus Lookup:** `normalizeFront(word)` → in-memory card search (instant hit if word is a known card)
   - **2. Stem Fallback:** `splitParticle(word)` → try base form without case marker (e.g., "없이" → "없음")
   - **3. Cache Lookup:** Check Setting table with key `gloss:<normalizedWord>` (JSON `GlossResult`; non-critical)
   - **4. LLM Fallback:** POST to `/api/gloss` → `lib/gloss.ts` → `claude-haiku-4-5-20251001` (max 256 tokens; returns `{ lemma, gloss, partOfSpeech, example? }`)

3. **Cache Write** (non-blocking, parallel to popover display)
   - `setCachedGloss(word, result)` → writes to Setting table via Prisma
   - No await; client shows result immediately

4. **Popover Display** → `GlossProvider` portal
   - Shows dictionary form (lemma), gloss, part of speech
   - "Add as card?" button → POST to `/api/cards` (create new card)
   - Dismiss on outside click or Escape

### Quaternary Flow (Text-to-Speech)

1. **User Taps Speaker Icon** on card front or sentence
   - `AudioButton.tsx` receives `text` + `voice` props
   - Calls `GET /api/tts?text=<urlencoded>&voice=<voice>`

2. **TTS Route** → `app/api/tts/route.ts`
   - Hash `(provider, voice, text)` → cache key
   - **Cache Check:** `head()` to Vercel Blob for existing MP3
     - Hit → return stable public URL
   - **Cache Miss:** Synthesize via `activeTtsProvider` (ElevenLabs by default, or Google Cloud)
     - Call provider API
     - `put()` MP3 to Vercel Blob
     - Return public URL
   - **No token:** Return 503; client degrades gracefully

3. **Audio Playback** → `AudioButton.tsx`
   - On 200: `new Audio(url).play()`; haptic feedback
   - On 503: Fall back to `window.speechSynthesis` (ko-KR, rate 0.9)
   - On error: Silence; no crash

## Key Abstractions

**Card:**
- Purpose: Atomic review unit (one FSRS card)
- Location: `prisma/schema.prisma` Card model
- Key fields: front (Korean), back (English), type (vocab/grammar/phrase), normalizedFront (@unique dedup key), components (JSON lemma list)
- Dedup: `normalizedFront` via `lib/card-key.ts:normalizeFront()` (strips English glosses, NFC-normalizes, collapses whitespace)
- Relations: CardReview (1:1), Sentence (1:many), CardDependency (1:many as cardId)

**Sentence:**
- Purpose: Example context for a card (presentation only; Card is the FSRS review unit)
- Location: `prisma/schema.prisma` Sentence model
- Key fields: korean (full sentence), targetForm (highlighted substring to blank), translation, orderIndex (0–2)
- 1–3 per card; rotates across reviews to avoid repetition
- Blank-safety: First sentence guaranteed 2+ char targetForm, exactly one occurrence (checked at extract time)

**CardDependency:**
- Purpose: Directed prerequisite edge; card A is built from card B
- Location: `prisma/schema.prisma` CardDependency model
- Created at sync: Card.components lemmas → fuzzy-matched against normalizedFront → edge creation via `lib/link-dependencies.ts`
- Used at study: `selectSessionCards()` ensures prerequisites included; `sequenceCards()` sorts foundation-first
- Cycle-safe: DFS in `sequence.ts` tracks visited-stack; cycles contribute 0 to depth (treated as if edge doesn't exist for ordering)

**CardReview:**
- Purpose: FSRS state for a single card (current snapshot)
- Location: `prisma/schema.prisma` CardReview model (1:1 with Card)
- Key fields: state (0–3), stability, difficulty, elapsedDays, scheduledDays, reps, lapses, nextReview (DateTime), lastReview (nullable)
- Updated by: `lib/fsrs.ts:reviewCard()` → persisted to DB by `POST /api/review`
- Used by: `lib/study-cards.ts` to query due/ahead cards (CardReview.nextReview ≤/> now)

**ReviewLog:**
- Purpose: Append-only audit trail of every individual review (HIST-01)
- Location: `prisma/schema.prisma` ReviewLog model (many:1 with Card)
- Key fields: idempotencyKey (@unique), rating (1–4), resulting FSRS snapshot (state, stability, difficulty, etc.)
- Append-only: Never updated or deleted (except cascading on card delete)
- Used by: Undo (restore pre-review CardReview from latest ReviewLog row), audit

**StudyDay:**
- Purpose: Per-day active study time tracking for habit streaks and heatmap
- Location: `prisma/schema.prisma` StudyDay model
- Key fields: date (user-local "YYYY-MM-DD"), seconds (accumulated), reviews (count), updatedAt
- Unique key: `date @unique`
- Incremented by: `POST /api/activity` during study sessions
- Used by: `components/HabitTracker`, `components/HabitHeatmap`, `/habits` page

**Setting:**
- Purpose: Generic key/value app settings + gloss lookup cache
- Location: `prisma/schema.prisma` Setting model
- Keys: dailyGoalSeconds, habitDayStartHour, sessionSize, readingTextScale, readingAid, buttonColor, rewardColor
- Gloss cache: Keys prefixed `gloss:` store JSON `GlossResult` (non-critical; re-fetch on miss)
- Accessed via: `lib/settings.ts` getters/setters

**DTO (Data Transfer Object):**
- Purpose: Serialization contract for crossing RSC→client boundary
- Location: `lib/dto.ts`
- Rule: All Prisma `DateTime` fields typed as `string` (ISO format)
- Implementations: `CardDTO`, `ReviewDTO`, `SentenceDTO`, `ReviewLogDTO`, `LessonDTO`, `LessonRefDTO`, `StatsDTO`, `ActivityDTO`
- Pattern: RSC page serializes Prisma objects before props (e.g., `app/cards/page.tsx` lines 30–49)

## Entry Points

**Web App (Vercel):**
- Location: `app/layout.tsx` (root RSC)
- Triggers: Browser loads `https://korean-study-five.vercel.app`
- Responsibilities: Pre-paint theme script (avoids flash), global styles, GlossProvider context, ThemeWatcher, Nav

**Home Page:**
- Location: `app/page.tsx` (RSC) → `components/HomeClient.tsx` (client shell)
- Triggers: Navigate to `/` or tap "Home" tab
- Data: `getStats()` + `getActivityData()` (concurrent)
- Displays: Hero (due count), HabitTracker, StatsBar, ProficiencyArc

**Study Page:**
- Location: `app/study/page.tsx` (RSC) → `components/StudyClient.tsx` (client shell)
- Triggers: Navigate to `/study` or tap "Study" tab
- Data: `getStudyCards({ scope: 'due', ... })` + lessons
- Displays: Mode selector, LessonRangeFilter, StudySession (once mode selected)

**Cards Page:**
- Location: `app/cards/page.tsx` (RSC) → `components/CardsClient.tsx` (client shell)
- Triggers: Navigate to `/cards` or tap "Cards" tab
- Data: All cards (no limit) + lessons
- Displays: Searchable list, filter sheet, add/edit/delete via CardEditor sheet

**Habits Page:**
- Location: `app/habits/page.tsx` (RSC) → `components/HabitsClient.tsx` (client shell)
- Triggers: Navigate to `/habits` or tap "Habits" tab
- Data: Activity + masteredCount (concurrent)
- Displays: Streak hero, totals, full heatmap, ProficiencyArc

**Settings Page:**
- Location: `app/settings/page.tsx`
- Triggers: Tap settings gear icon (top-right Nav)
- Displays: Theme toggle, daily goal, habit day-start hour, session size, reading text scale, reading aid, app colors, advanced (sync)

**Login Page:**
- Location: `app/login/page.tsx`
- Triggers: Unauthenticated request (middleware redirects)
- Displays: Password input form; POSTs to `/api/login`

**API: Sync**
- Route: `POST /api/sync`
- Triggers: Home pull-to-refresh or Settings → Advanced → Sync button
- Payload: `{ documentId }`
- Business logic: `lib/sync.ts:runSync()`
- Returns: `{ synced: true, newLessons, newCards, remaining }`

**API: Cards CRUD**
- Routes: `GET /api/cards`, `POST /api/cards`, `PUT /api/cards/[id]`, `DELETE /api/cards/[id]`
- Triggers: Cards page list/add/edit/delete
- Business logic: Prisma (direct), plus transaction wrapper for updates (WR-03: sentence replace in single txn)

**API: Due Cards**
- Route: `GET /api/cards/due?scope=due|ahead&lessonFrom=N&lessonTo=N`
- Triggers: Study page on load; re-fetch on LessonRangeFilter change
- Business logic: Same as `lib/study-cards.ts:getStudyCards()`

**API: Review**
- Route: `POST /api/review`
- Triggers: Background save during study (fire-and-forget from StudySession)
- Payload: `{ cardId, rating }`
- Business logic: Look up CardReview, apply `lib/fsrs.ts:reviewCard()`, update + append ReviewLog

**API: Review Undo**
- Route: `POST /api/review/undo`
- Triggers: Undo button in StudySession
- Business logic: Find latest ReviewLog for a card, restore CardReview to pre-review state

**API: Gloss**
- Route: `POST /api/gloss`
- Triggers: Tap-to-gloss from HighlightedSentence
- Payload: `{ word }`
- Business logic: `lib/gloss.ts:getGlossResult()` (corpus → stem → cache → LLM)

**API: TTS**
- Route: `GET /api/tts?text=...&voice=...`
- Triggers: Tap speaker icon (AudioButton)
- Business logic: Blob cache → synthesize → return URL

**API: Activity**
- Routes: `GET /api/activity`, `POST /api/activity`
- Triggers: Home/Habits page (GET); StudySession increment (POST)
- Business logic: Increment StudyDay or fetch activity rows

**API: Settings**
- Routes: `GET /api/settings`, `PUT /api/settings`
- Triggers: Settings page form change
- Business logic: Delegate to `lib/settings.ts` getters/setters

**Cron: Auto-Sync (Vercel Cron)**
- Route: `POST /api/cron/sync`
- Triggers: Vercel Cron schedule (e.g., daily)
- Auth: Bearer token in Authorization header (checked by middleware separately)
- Business logic: Same as `POST /api/sync` (calls `lib/sync.ts:runSync()`)

## Architectural Constraints

- **Vercel Hobby 60 s hard timeout:** `maxDuration = 300` in route code has no effect. Each `/api/sync` processes ≤1 lesson (MAX_LESSONS_PER_SYNC). Bulk re-extractions run locally via `scripts/local-resync.mts`.

- **Turso / libSQL:** `prisma db push` and `prisma migrate` fail against `libsql://` (P1013 error). Schema changes require manual DDL via `@libsql/client:executeMultiple()` and a throwaway script that reads DATABASE_URL from `.env`.

- **Single-tenant:** No user model, no multi-tenancy. Auth is one shared APP_PASSWORD; all users share the same deck.

- **No background workers:** All processing is request-driven. No cron jobs (except Vercel Cron), no job queues, no async tasks. Sync is user-triggered or Vercel-cron-triggered.

- **ESLint strict mode:** 
  - `react-hooks/purity`: No `Date.now()`, `new Date()`, `Math.random()` during render
  - `react-hooks/set-state-in-effect`: No synchronous `setState` in effect bodies
  - All code must pass `npm run lint` with zero errors

- **No circular imports:** ESLint enforces. `app/` does not import from `components/`; `components/` does not import from `app/`.

- **Optimistic grading:** Study review is fully client-side; DB save is background task. Client must assume success and advance queue immediately (no undo recovery for lost saves).

## Anti-Patterns

### Using `new Date()` or `Date.now()` in Render

**What happens:** Component calls `new Date()` during render, creating a different timestamp on every render cycle.

**Why it's wrong:** Violates React purity guarantees. ESLint `react-hooks/purity` rejects. Tests become flaky (every render creates new state).

**Do this instead:** 
- Read time in event handlers or effects: `useEffect(() => setNow(Date.now()), [])`
- Pass `now` as a parameter from server
- For deterministic render-time randomness, use seeded pseudo-RNG (see `seededShuffle()` in `components/StudySession.tsx` line 68)

### Calling `setState` Synchronously in Effect Body

**What happens:** State updates fire on every render cycle, causing infinite loops or race conditions.

**Why it's wrong:** ESLint `react-hooks/set-state-in-effect` forbids. Breaks dependency tracking; causes layout thrashing.

**Do this instead:**
```typescript
// ✓ Correct — setState is in an async callback
useEffect(() => {
  fetch('/api/data').then(setData)
}, [])

// ✗ Wrong — setState is synchronous in effect body
useEffect(() => {
  setData(initialValue)
}, [])
```

### Adding New Settings Outside `lib/settings.ts`

**What happens:** A new app setting is plumbed directly in an API route or component, bypassing centralized getters/setters.

**Why it's wrong:** No single source of truth for defaults. Settings logic scatters across the codebase. Hard to maintain.

**Do this instead:**
1. Add getter/setter to `lib/settings.ts` (e.g., `export async function getDailyGoal()`)
2. Call in `app/layout.tsx` (if injected server-side) or `app/api/settings/route.ts`
3. Wire GET/PUT in settings API route
4. Add UI to `app/settings/page.tsx` form

### Using Raw `localDateStr()` for Activity Logging

**What happens:** Code uses `new Date().toLocaleDateString()` (OS-local calendar) instead of `habitDateStr(hour)`.

**Why it's wrong:** User's habit day doesn't align with OS midnight (e.g., habit day starts at 2 AM). Streak tracking breaks.

**Do this instead:**
- Always import `habitDateStr` from `lib/habit.ts`
- Call `habitDateStr(dayStartHour)` to compute user-local habit-date string "YYYY-MM-DD"
- Use for all StudyDay date tracking

## Error Handling

**Strategy:** Synchronous validation (400) → early return. Async failures (500) with detail in server logs.

**Patterns:**

- **API Routes:** Wrap body in `try { … } catch (e) { console.error(e); return NextResponse.json({ error: 'msg' }, { status: 500 }) }`

- **Input Validation:** Type/shape checks return 400 before business logic touches Prisma
  - Example: `if (typeof data.front !== 'string') return 400`
  - Prevents generic 500 errors from malformed input

- **Prisma Errors:** Throw and catch at top level; client sees generic 500; full error in server logs

- **LLM/External API:** Validate response immediately after receipt
  - Check `content[0].type === 'text'`
  - Regex-extract JSON before `JSON.parse`
  - Throw on parse error; 500 to client

- **Non-critical Operations:** Graceful degradation
  - Known-lemmas fetch failure → empty Set (unknownCount degrades to max but no crash)
  - TTS fetch failure (no Blob token) → return 503; client falls back to `window.speechSynthesis`
  - Gloss cache miss → LLM fallback (not an error, just slower)

- **Auth Failures:** Fail closed
  - Missing/invalid cookie → 401 for API, redirect to `/login` for pages
  - No recovery or degradation

## Cross-Cutting Concerns

**Logging:** Console-only (`console.log`, `console.error`, `console.warn`). Production logs visible in Vercel dashboard.

**Validation:**
- API routes validate schema before calling lib/Prisma (400 on bad data)
- Business logic assumes validated input
- Sentence validation: targetForm must be a substring of korean (checked at extract + edit time)

**Authentication:** Middleware gate + stateless HMAC cookie via Web Crypto (Edge-safe). No sessions table, no JWT, no state. One password shared by all users.

**Authorization:** Single-user app; no per-card or per-user access control.

**Transactions:**
- Card + sentence updates wrap in Prisma transaction (WR-03): ensure normalizedFront + sentences stay in sync
- Review save is idempotent via ReviewLog.idempotencyKey (HIST-02): safe to replay lost-response retries without double-applying

---

*Architecture analysis: 2026-07-05*
