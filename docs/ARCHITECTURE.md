<!-- generated-by: gsd-doc-writer -->
# Architecture

Korean Study is a personal Korean-language spaced-repetition app. It ingests lesson
notes from a tutor's Google Doc, uses Claude to extract flashcards (vocabulary,
grammar, phrases) with example sentences and a prerequisite graph, then schedules
review of those cards with FSRS — sequenced so a learner always sees a word's
building blocks before the word itself. It is a single-tenant, password-gated Next.js
app deployed on Vercel with a Turso (libSQL) database.

## System Overview

The system is a server-centric Next.js 16 App Router application: React Server
Components fetch data directly from Prisma/Turso and pass it as props to client
"shell" components, which own all interactivity. Business logic (FSRS scheduling,
prerequisite sequencing, dedup keys, Korean text matching) lives in pure,
side-effect-free `lib/` modules shared by both server pages and API routes. External
services — Claude (card extraction, tap-to-gloss), Google Docs API (lesson source),
and a TTS provider (ElevenLabs or Google Neural2) with Vercel Blob caching — are
called only from server-side code, never directly from the browser.

## Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Browser (client components)                      │
│   HomeClient · StudyClient → StudySession · CardsClient · Habits-    │
│   Client · GlossProvider · AudioButton · Nav                         │
└───────────────────────────────┬───────────────────────────────────┘
                                 │ fetch (JSON)
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Next.js App Router (server)                       │
│                                                                       │
│  RSC pages (app/*/page.tsx)         API routes (app/api/*/route.ts) │
│  fetch data via lib/ + Prisma       validate → lib/ + Prisma → JSON │
│         │                                    │                       │
│         └───────────────┬────────────────────┘                       │
│                          ▼                                           │
│              lib/ — pure business logic                              │
│              fsrs.ts · sequence.ts · card-key.ts · sentence-match.ts │
│              known-words.ts · sentence-selection.ts · habit.ts · …   │
│                          │                                           │
│         ┌────────────────┼─────────────────┬─────────────────┐      │
│         ▼                ▼                 ▼                 ▼      │
│  lib/prisma.ts     lib/extract-cards.ts  lib/google-docs.ts  lib/tts.ts│
│  (Prisma +         lib/generate-practice.ts  (Google Docs   (ElevenLabs/│
│   libSQL adapter)  lib/gloss.ts (Claude)      API v1)        Google + │
│         │                                                    Blob)   │
│         ▼                                                            │
│  Turso DB (libsql://)                                                │
└─────────────────────────────────────────────────────────────────────┘

middleware.ts (Edge) — HMAC cookie gate — wraps every request above
```

## Data Flow

### 1. Content ingestion (sync)

1. User triggers a sync (Home pull-to-refresh, or Settings → Advanced).
2. `POST /api/sync` calls `lib/google-docs.ts` to fetch the `수업 노트` tab of the
   configured Google Doc, splitting it into lessons at horizontal rules and capturing
   bold/underline/highlight spans per lesson as an `emphasized[]` list.
3. Each lesson body is hashed (`contentHash`) to detect content that hasn't been
   synced yet.
4. For up to `MAX_LESSONS_PER_SYNC = 1` new lesson per request (to stay under
   Vercel's 60s function limit), the lesson text, emphasized terms, and the existing
   deck's normalized fronts are sent to Claude (`claude-opus-4-8`, adaptive thinking,
   streamed) via `lib/extract-cards.ts`. Extraction is exhaustive — every distinct
   word, grammar pattern, or phrase taught becomes a card.
5. Cards are upserted by `normalizedFront` (DB-enforced unique dedup key from
   `lib/card-key.ts`). `Sentence` rows (1–3 per card) are created alongside.
6. After all upserts, each card's `components[]` prerequisite lemmas are resolved to
   `CardDependency` edges against other cards' `normalizedFront` values.
7. The response reports `remaining` so the client can re-trigger sync until the
   backlog drains. Bulk re-extraction of the whole doc runs locally via
   `scripts/local-resync.mts` (bypasses the Vercel timeout).

### 2. Study session

1. `app/study/page.tsx` (an async RSC) calls `getStudyCards()`
   (`lib/study-cards.ts`) and `prisma.lesson.findMany()` server-side, then renders
   `StudyClient` with the results as props — no client-side loading phase on first
   paint.
2. `getStudyCards()` fetches the eligible card pool (`CardReview.nextReview <= now`,
   optionally filtered by lesson range and `scope`) and the "known lemmas" set
   concurrently via `Promise.allSettled` (pool failure is fatal; known-lemmas failure
   degrades to an empty set).
3. `selectSessionCards()` (`lib/sequence.ts`) picks a downward-closed set of cards
   (prerequisites pulled in before the size cap is applied); `sequenceCards()`
   reorders them foundation-first using a blended score `depth − urgencyBoost`.
4. Every sentence is annotated with `unknownCount` via `lib/known-words.ts`, and all
   Prisma `Date` fields are serialized to ISO strings per the DTO contract
   (`lib/dto.ts`) before the data reaches the client.
5. `StudySession.tsx` consumes cards in server order. Grading is optimistic: FSRS is
   computed client-side (`lib/fsrs.ts:reviewCard()`) and the queue advances
   immediately; `POST /api/review` persists the result in the background
   (fire-and-forget).
6. `GET /api/cards/due` calls the same `getStudyCards()` function, used when the
   client re-fetches after changing the lesson-range filter.

### 3. Tap-to-gloss

1. Tapping a word in a Korean sentence (`components/HighlightedSentence.tsx`) calls
   `useWordTap()` from `components/GlossProvider.tsx`.
2. Resolution order: exact `normalizeFront()` match against existing cards → particle
   stem fallback → `Setting` table cache (`gloss:` key prefix) → LLM fallback via
   `POST /api/gloss` (`claude-haiku-4-5-20251001`, single-word lookups).
3. A successful LLM lookup is cached back to the `Setting` table (non-blocking
   write). `GET /api/gloss/preload` warms the client's in-memory cache with
   previously-resolved entries on mount so repeat lookups are instant.

### 4. Text-to-speech

`GET /api/tts?text=&voice=` hashes `(provider id, voice, text)`, checks Vercel Blob
for a cached MP3, and on a miss synthesizes audio via the active `TtsProvider`
(`lib/tts.ts` — ElevenLabs or Google Neural2, chosen by the `TTS_PROVIDER` env var)
and stores it in Blob. `components/AudioButton.tsx` plays the returned URL and falls
back to `window.speechSynthesis` if the API returns a non-200 (e.g. Blob token
unset).

### 5. AI practice generation

`POST /api/generate` sends a batch of due cards to Claude via
`lib/generate-practice.ts` to produce ephemeral extra exercises. Nothing here is
persisted to the database.

## Key Abstractions

- **`CardDTO` / `SentenceDTO` / `ReviewDTO` / `LessonDTO` / `StatsDTO` /
  `ActivityDTO`** (`lib/dto.ts`) — the single serialization contract for every value
  that crosses the RSC-to-client prop boundary. Every `DateTime` field is typed
  `string` (ISO), never a raw `Date`.
- **`normalizeFront(front)`** (`lib/card-key.ts`) — pure dedup-key function: strips
  trailing English glosses in parentheses, NFC-normalizes, collapses whitespace.
  Backs `Card.normalizedFront @unique` and is reused by sync upserts, the card
  editor, and operational scripts.
- **`sequenceCards()` / `selectSessionCards()`** (`lib/sequence.ts`) — the
  foundation-first session builder. `selectSessionCards` expands a seed set downward
  through the prerequisite graph before applying the size cap; `sequenceCards` sorts
  ascending by `depth − urgencyBoost` (urgency capped via `URGENCY_SCALE`/
  `MAX_BOOST`). Cycle-safe visited-stack DFS.
- **`reviewCard()`** (`lib/fsrs.ts`) — wraps `ts-fsrs` to turn a grade (1–4) into an
  updated `CardReview` state (stability, difficulty, next review date).
  `formatInterval()` renders the result as mastery-language copy.
- **`sentenceMatch()`** (`lib/sentence-match.ts`) — single source of truth for
  locating a card's `targetForm` inside a Korean sentence and deciding whether it is
  safe to blank (length/uniqueness rules), used by both the study UI and the card
  editor.
- **`pickSentence()`-style selection** (`lib/sentence-selection.ts`) — chooses which
  of a card's 1–3 example sentences to show: least-unknown tier first, tie-broken by
  a per-card hash rotation that varies with review count, with a blank-safety
  override for Recall/fill-blank modes.
- **`TtsProvider` interface** (`lib/tts.ts`) — swappable TTS backend; adding a
  provider means a new implementation plus an env flip, call sites never change.

## Directory Structure Rationale

- **`app/`** — Next.js App Router routes. Each top-level route (`/`, `/study`,
  `/cards`, `/habits`, `/settings`, `/wrapped`, `/login`) has a thin async
  `page.tsx` (RSC, data-fetch only, no hooks) that renders exactly one
  `*Client.tsx` component from `components/`.
- **`app/api/`** — REST-style API route handlers (`sync`, `cards`, `cards/due`,
  `cards/[id]`, `review`, `review/undo`, `generate`, `gloss`, `gloss/preload`, `tts`,
  `activity`, `lessons`, `stats`, `settings`, `login`). Handlers validate input,
  delegate to `lib/`/Prisma, and return JSON; no business logic lives in routes
  themselves.
- **`lib/`** — Business logic. Pure, dependency-free modules (e.g. `card-key.ts`,
  `sequence.ts`, `sentence-match.ts`, `habit.ts`, `palettes.ts`) are safe to import
  from both server and client code; server-only modules that touch Prisma or the
  Anthropic/Google SDKs (`prisma.ts`, `extract-cards.ts`, `google-docs.ts`,
  `study-cards.ts`, `dashboard.ts`) are only ever imported from `app/` or
  `app/api/`.
- **`components/`** — UI. Presentational/interactive React components; the
  `*Client.tsx` files (`StudyClient`, `CardsClient`, `HomeClient`, `HabitsClient`)
  are the client-side shells rendered by their matching RSC page and own all
  `'use client'` state for that route.
- **`prisma/`** — `schema.prisma`, the single source of truth for the database
  shape (7 models: `Lesson`, `Card`, `Sentence`, `CardReview`, `CardDependency`,
  `StudyDay`, `Setting`).
- **`scripts/`** — One-time or operational scripts run locally against Turso
  (`local-resync.mts`, `wipe-card-data.mjs`, `apply-graph-ddl.mjs`,
  `relink-dependencies.mjs`, `find-duplicates.mjs`, `full-resync.mjs`,
  `gen-icons.mjs`) — used for bulk operations that would exceed Vercel's function
  timeout, or one-off schema/data migrations against the libSQL database.
  `tests/` — Vitest unit tests for pure `lib/` functions (no DB or API dependency).
- **`middleware.ts`** — Edge middleware; the single authentication gate in front of
  every page and API route except `/login` and `/api/login`.

## Database Schema Overview

Seven Prisma models, backed by Turso (libSQL) in production and a local SQLite file
in development, accessed through the same `@prisma/adapter-libsql`-backed client
(`lib/prisma.ts`):

- **`Lesson`** — a raw doc snapshot per section, deduped by `contentHash`, ordered by
  a stable `orderIndex`.
- **`Card`** — a flashcard (`type`: vocabulary/grammar/phrase; `front`/`back`;
  `normalizedFront @unique` dedup key; `components` — JSON string array of
  prerequisite lemmas; `lessonId` = the lesson where the card was first introduced).
  `clozeSentence`/`clozeAnswer`/`clozeTranslation` are deprecated columns retained
  for backward compatibility but no longer written.
- **`Sentence`** — 1–3 example sentences per card (`korean`, `targetForm`,
  `translation`, `orderIndex`), cascade-deleted with their card.
- **`CardDependency`** — a directed prerequisite edge (`cardId` is built from
  `prerequisiteId`), unique per pair, resolved from `Card.components` at sync time.
- **`CardReview`** — one-to-one FSRS state per card (stability, difficulty, state,
  reps, lapses, `nextReview`).
- **`StudyDay`** — per-user-local-day active study time and review count, keyed by a
  `"YYYY-MM-DD"` habit-day string (not raw UTC date).
- **`Setting`** — generic key/value app settings (theme colors, goal seconds,
  session size, etc.) and, under a `gloss:` key prefix, the tap-to-gloss lookup
  cache.

## Architectural Constraints

- **Vercel Hobby plan hard-limits serverless functions to 60 seconds**, regardless
  of any `maxDuration` setting in route code. `/api/sync` therefore processes at
  most one lesson per request; bulk re-extraction runs locally via
  `scripts/local-resync.mts`, which has no such limit.
- **Turso (`libsql://`) does not support `prisma db push` / `prisma migrate`**
  (schema-engine limitation, error P1013). Schema changes require editing
  `schema.prisma`, running `prisma generate`, generating DDL with
  `prisma migrate diff --from-empty --to-schema … --script`, and applying only the
  new statements against Turso via `@libsql/client`'s `executeMultiple()`.
- **Single-tenant, one shared password.** There is no user model or per-user data
  isolation; `middleware.ts` gates the whole app behind one HMAC-signed cookie.
- **No background workers or queues.** All processing (sync, extraction, gloss,
  TTS) is triggered synchronously by a user action inside a request handler.
