# Architecture

**Analysis Date:** 2026-07-02

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

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| **Auth Middleware** | HMAC cookie validation, request gating | `middleware.ts` |
| **RSC Pages** | Fetch initial data server-side, render one `*Client` component | `app/page.tsx`, `app/study/page.tsx`, `app/cards/page.tsx`, `app/habits/page.tsx` |
| **Client Shells** | All state, interactivity, event handlers | `components/*Client.tsx` |
| **Business Logic** | Pure functions, algorithms, data transformations | `lib/` |
| **API Routes** | Request validation, DB queries via Prisma, response formatting | `app/api/*/route.ts` |
| **UI Components** | Presentational + interactive primitives | `components/` |

---

## Pattern Overview

**Overall:** Three-tier server-centric architecture with a strict RSC/DTO boundary.

**Key Characteristics:**
- **Server-first data fetching:** Pages (RSCs) fetch data directly via Prisma and shared `lib/` pipelines; no `useEffect` data-loading on the client
- **DTO serialization contract:** All `Date` objects are serialized to ISO strings before crossing the RSC→client prop boundary (`lib/dto.ts`)
- **Shared pipeline logic:** Data-fetching logic (`lib/study-cards.ts`, `lib/dashboard.ts`) is extracted from API routes so RSC pages and the API call the same code — single source of truth
- **Pure library modules:** All algorithms and business logic live in `lib/` and are side-effect-free (testable, safe to call from server or client)
- **No data-loading skeleton on first paint:** RSC hydration delivers initial data in the HTML; client shells start directly in their "ready" state (`'select-mode'` for study, populated list for cards)

---

## Layers

**Network & Auth Layer:**
- Location: `middleware.ts`, `lib/auth.ts`, `app/api/login/route.ts`
- Purpose: Protect all routes behind a single shared-password HMAC gate
- Contains: Edge middleware that validates HMAC cookie on every request
- Depends on: Web Crypto API (Edge-compatible)
- Used by: All pages, all API routes

**Data Fetching & Coordination Layer:**
- Location: `app/*/page.tsx` (RSC pages), `lib/study-cards.ts`, `lib/dashboard.ts`
- Purpose: Orchestrate data pipelines; fetch from Prisma, call pure lib functions, serialize to DTOs
- Contains: `getStudyCards()`, `getStats()`, `getActivityData()` — server-only functions extracted to `lib/`
- Depends on: Prisma, `lib/` utilities, settings
- Used by: RSC pages, API routes (`/api/cards/due`, `/api/stats`, `/api/activity`)

**Business Logic & Algorithms Layer:**
- Location: `lib/`
- Purpose: Pure, testable functions for domain logic
- Contains: FSRS scheduling (`fsrs.ts`), foundation-first sequencing (`sequence.ts`), card dedup (`card-key.ts`), spaced-repetition scoring, habit tracking, Korean text utilities
- Depends on: Nothing (no I/O, no side effects)
- Used by: Data layer, client components (for display logic)

**Persistence Layer:**
- Location: `lib/prisma.ts`, `prisma/schema.prisma`, Turso database
- Purpose: Data storage and schema definition
- Contains: Singleton Prisma client, 7 models (Lesson, Card, Sentence, CardReview, CardDependency, StudyDay, Setting)
- Depends on: libSQL wire protocol (Turso/libsql://)
- Used by: Data-fetching layer, API routes

**API Layer:**
- Location: `app/api/*/route.ts`
- Purpose: HTTP request handlers; validate input, delegate to lib/Prisma, return JSON
- Contains: Thin wrappers around business logic (no logic lives here)
- Depends on: `lib/`, Prisma, Next.js request/response types
- Used by: Client-side fetch calls, external webhooks

**UI Layer (Client):**
- Location: `components/`, client shells (`*Client.tsx`)
- Purpose: Render UI, handle user events, manage session-local state
- Contains: React hooks, event handlers, CSS-in-JS via Tailwind
- Depends on: `lib/` for pure logic, API routes for persistence
- Used by: Browser

---

## Data Flow

### Primary Request Path: Study Session

1. **Page Load** (`app/study/page.tsx` — RSC, ~8 lines)
   - Calls `getStudyCards({ scope: 'due', lessonFrom: null, lessonTo: null })`
   - Calls `prisma.lesson.findMany()`
   - Renders `<StudyClient initialCards={...} initialLessons={...} />`

2. **Data Pipeline** (`lib/study-cards.ts:getStudyCards()`)
   - Query 1 (concurrent): Fetch eligible cards (WHERE `nextReview <= now`, lesson range, take 1000)
   - Query 2 (concurrent): Fetch known lemmas (state ≥ 1, for context ranking)
   - Query 3 (sequential, depends on pool IDs): Fetch prerequisite edges within the pool
   - `selectSessionCards()` → downward-closed subset capped at sessionSize
   - `sequenceCards()` → foundation-first blended sort: `depth − urgencyBoost`
   - Annotate sentences with `unknownCount` via `countUnknownWords()`
   - Serialize all `Date` → ISO strings (DTO contract, `lib/dto.ts`)
   - Return `CardDTO[]`

3. **Client Interactivity** (`components/StudyClient.tsx`)
   - Receives `initialCards` as props; starts directly in `'select-mode'` (no `loading` phase)
   - User selects mode → `StudySession.tsx` renders
   - Grading: `submitReview()` computes FSRS client-side (`reviewCard()` from `lib/fsrs.ts`), advances queue immediately
   - Background: `POST /api/review` fires fire-and-forget (no await)
   - Session ends → `handleComplete()` shows score + "Study N more" option

4. **Background Persistence** (`app/api/review/route.ts`)
   - Receives `{ cardId, rating }`
   - Looks up `CardReview`, applies `reviewCard()` algorithm, updates DB
   - Returns updated `CardReview` JSON (client doesn't wait)

### Secondary Flow: Content Ingestion (Sync)

1. **User Initiates** (Home pull-to-refresh or Settings ▸ Advanced)
   - Calls `POST /api/sync` with `documentId`

2. **Fetch & Hash** (`app/api/sync/route.ts`)
   - `lib/google-docs.ts:fetchGoogleDoc()` → fetches "수업 노트" tab
   - Returns `{ text, emphasized }[]` (one per `<hr>`-separated lesson)
   - Hash each lesson text via SHA-256; filter to new lessons only

3. **Extract Cards** (for each new lesson, max 1 per request)
   - `lib/extract-cards.ts` → prompts `claude-opus-4-8` with adaptive thinking
   - Sends: lesson text, emphasized spans, existing normalized fronts (for dedup hint)
   - Receives: `Card[]` with `{ type, front, back, notes, sentences[], components[] }`
   - Validates: ≥1 card extracted

4. **Persist & Link**
   - Create `Lesson` row (orderIndex = max + 1)
   - Upsert `Card[]` by `normalizedFront` (DB enforces uniqueness)
   - Create `Sentence` rows (CASCADE on card delete)
   - Resolve `Card.components[]` lemmas → `CardDependency` edges (two-phase link, sequential)

5. **Report** → `{ synced: true, newLessons, newCards, remaining }`
   - If `remaining > 0`, user taps sync again to drain backlog

### Tertiary Flow: Tap-to-Gloss

1. **User taps word** in `HighlightedSentence.tsx`
2. **Resolution order** (via `useWordTap()` in `GlossProvider` context):
   - Exact lookup: `normalizeFront(word)` → in-memory Card search (instant)
   - Stem fallback: `splitParticle(word)` → try base form
   - Cache lookup: `Setting` table, key `gloss:<normalizedWord>` (JSON `GlossResult`)
   - LLM fallback: `POST /api/gloss` → `lib/gloss.ts` → `claude-haiku-4-5-20251001`
3. **Cache write** (non-blocking) via `setCachedGloss()`
4. **Popover display** with dictionary form, gloss, POS, and "Add as card?" button

---

## State Management

**Server-side (RSC/Prisma):**
- Single source of truth: Turso database
- Queried fresh on each page load
- Shared pipeline logic ensures consistency

**Client-side (React hooks):**
- Session-local state only: current card index, grading results, open sheets
- Optimistic UI: grade button → immediate queue advance, background API call
- Never stores study cards or review state (could diverge from server)

---

## Key Abstractions

**CardDTO:**
- Purpose: Serialization contract for Card + review state + sentences crossing the RSC→client boundary
- Example: `app/cards/page.tsx` serializes all Prisma `Date` fields to ISO strings before passing to `CardsClient`
- Pattern: Every route that serves data to a client component defines and uses a `*DTO` type

**Foundation-First Sequencing:**
- Purpose: Learner sees prerequisites before dependents, blended with urgency
- Examples: `lib/sequence.ts:sequenceCards()`, `lib/sequence.ts:selectSessionCards()`
- Pattern: `score = depth − urgencyBoost`; sort ascending; cycle-safe DFS

**Normalized Front:**
- Purpose: Dedup key for cards (strips English gloss in parens, NFC-normalizes, collapses whitespace)
- Examples: `lib/card-key.ts:normalizeFront()`, DB `Card.normalizedFront @unique`, gloss cache prefix
- Pattern: Single source of truth; used by sync upsert, card editor, dedup scripts

---

## Entry Points

**Web Request (Middleware):**
- Location: `middleware.ts`
- Triggers: Every HTTP request to the app
- Responsibilities: HMAC cookie validation; redirect to `/login` if unauthenticated; allow `/api/login` and static assets

**Page Render (RSC):**
- Location: `app/page.tsx`, `app/study/page.tsx`, `app/cards/page.tsx`, `app/habits/page.tsx`
- Triggers: User navigates to route (or refresh)
- Responsibilities: Fetch data server-side, serialize to DTO, render one `*Client.tsx` component with props

**API Route:**
- Location: `app/api/*/route.ts`
- Triggers: Client fetch call or external webhook
- Responsibilities: Validate input (400 on bad data), call `lib/`/Prisma, return JSON; catch errors (500)

**Background Process:**
- Location: `components/StudySession.tsx:submitReview()` → `POST /api/review` (fire-and-forget)
- Triggers: User submits grade on flashcard
- Responsibilities: Persist review to DB; no wait, no error handling (client assumes success and advances queue)

---

## Architectural Constraints

- **Vercel Hobby 60s timeout:** `maxDuration = 300` in route code has no effect. Each `/api/sync` processes ≤1 lesson. Bulk operations run locally via `scripts/local-resync.mts`.
- **Turso / libSQL:** `prisma db push` and `prisma migrate` do not work against `libsql://`. Schema changes require manual DDL via `@libsql/client` `executeMultiple()`.
- **Single-tenant:** No user model, no multi-tenancy. Auth is one shared password.
- **No background workers:** All processing is request-driven. No cron, no job queue.
- **React purity (ESLint strict mode):** `react-hooks/purity` forbids `Date.now()` / `Math.random()` during render. Must use seeded randomness or pass time as a parameter.
- **No circular imports:** `app/` does not import from `components/`; `components/` does not import from `app/`.

---

## Anti-Patterns

### Using Raw `new Date()` or `Date.now()` in Render

**What happens:** Component re-renders with different timestamps each time, breaking React's purity guarantee.

**Why it's wrong:** ESLint (`react-hooks/purity`) will fail the build. More importantly, it makes the component non-deterministic and hard to test.

**Do this instead:** Read time in an event handler or `useEffect`. For deterministic behavior during render (e.g., sentence rotation in `StudySession.tsx`), use a seeded pseudo-RNG keyed on session-immutable data (see `seededShuffle()` in `StudySession.tsx`, which seeds on `sessionKey`).

### Calling `setState` Directly in an Effect Body

**What happens:** State updates run on every render cycle, causing infinite loops or duplicate effects.

**Why it's wrong:** ESLint (`react-hooks/set-state-in-effect`) forbids synchronous `setState` in effect bodies. It breaks dependency-tracking and causes layout thrashing.

**Do this instead:** Use `.then()` or `.catch()` callbacks inside async calls:
```typescript
useEffect(() => {
  fetch('/api/data').then(setData) // ✓ OK — setState is in a callback
}, [])
```

### Persisting New Settings Outside `lib/settings.ts`

**What happens:** Settings logic scattered across API routes and components; multiple sources of truth.

**Why it's wrong:** Changes are hard to coordinate; new settings require updating multiple files and tests.

**Do this instead:** Add a getter/setter to `lib/settings.ts`, then call it from `app/api/settings/route.ts` and `app/layout.tsx` (if the setting needs to be injected server-side).

---

## Error Handling

**Strategy:** Fail-open for non-critical operations; fail-closed for critical ones.

**Patterns:**
- **Critical (pool fetch):** Throws on DB error; client gets HTTP 500
- **Non-critical (known-lemmas fetch):** Rejected promise → empty Set; session continues with degraded ranking
- **LLM calls:** Validation after receipt (check `content[0].type`, regex-extract JSON); throw on parse error
- **TTS/Blob failures:** Return 503; client falls back to browser speech synthesis
- **Auth:** Fail closed — missing/invalid cookie → 401 for API, redirect to `/login` for pages

---

## Cross-Cutting Concerns

**Logging:** Console-only (dev-local via `console.error`, `console.warn`, `console.log`). Production logs go to Vercel's built-in function logs.

**Validation:** Input validation happens at the API route entry point (400 on bad schema). Business logic assumes validated input.

**Authentication:** Middleware gate + stateless HMAC cookie. No sessions table, no JWT. One password shared by all users (single-tenant).

---

*Architecture analysis: 2026-07-02*
