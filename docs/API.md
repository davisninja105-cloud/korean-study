<!-- generated-by: gsd-doc-writer -->
# API Reference

Korean Study exposes a small set of server-side API routes under `app/api/`, all
consumed by the app's own client components (this is a single-tenant personal app —
there is no external/public API surface or client SDK). Every route lives at
`app/api/<resource>/route.ts` (or `app/api/<resource>/[id]/route.ts` for the one
dynamic-segment route) and follows the Next.js App Router route-handler convention
(`export async function GET/POST/PUT/DELETE`).

## Authentication

All API routes are gated by a single shared-password cookie, enforced in
`middleware.ts` (not per-route code). The matcher protects every path except
`/login` and `/api/login`; static/PWA assets are also excluded.

- `POST /api/login` checks the posted password against the `APP_PASSWORD` env var. On
  success it sets an `ks_auth` cookie (`httpOnly`, `sameSite: strict`, `secure` in
  production, 1-year `maxAge`) whose value is `computeAuthToken()` — an
  HMAC-SHA256(`AUTH_SECRET`, fixed message) hex digest computed via Web Crypto
  (`lib/auth.ts`), so the same code runs in both Edge middleware and Node route
  handlers.
- On every subsequent request, `middleware.ts` recomputes the HMAC and compares it to
  the `ks_auth` cookie. If `AUTH_SECRET` is unset, verification fails closed (treated
  as unauthenticated) rather than throwing.
- Unauthenticated requests to any `/api/*` path receive `401 { "error": "Unauthorized" }`
  (page routes instead get a redirect to `/login`).
- There is no per-user identity, API key, or bearer-token scheme — this is a single
  shared password for one user, not a multi-tenant auth system.

To call any endpoint below (other than `/api/login`), the client must first
authenticate and carry the resulting `ks_auth` cookie on subsequent requests
(the browser does this automatically for same-origin `fetch` calls).

## Endpoints Overview

| Method | Path | Description | Auth Required |
|---|---|---|---|
| POST | `/api/login` | Verify the shared password, set the `ks_auth` session cookie | No |
| POST | `/api/sync` | Fetch new lessons from the Google Doc and extract cards via Claude | Yes |
| GET | `/api/cards` | List all cards (with review, lesson, sentences) | Yes |
| POST | `/api/cards` | Create a card manually | Yes |
| PUT | `/api/cards/[id]` | Update a card's fields and/or replace its sentences | Yes |
| DELETE | `/api/cards/[id]` | Delete a card | Yes |
| GET | `/api/cards/due` | Get due (or "ahead") cards, sequenced foundation-first | Yes |
| POST | `/api/review` | Record an FSRS grade for a card | Yes |
| POST | `/api/review/undo` | Revert a card's `CardReview` row to a prior snapshot | Yes |
| POST | `/api/generate` | Generate ephemeral AI practice exercises from a set of cards | Yes |
| POST | `/api/gloss` | Tap-to-gloss lookup for a single Korean word | Yes |
| GET | `/api/gloss/preload` | Bulk-fetch previously-cached gloss entries to warm the client cache | Yes |
| GET | `/api/tts?text=&voice=` | Get (or synthesize + cache) a TTS audio URL for Korean text | Yes |
| POST | `/api/activity` | Increment today's active study time / review count | Yes |
| GET | `/api/activity` | Get recent `StudyDay` records + goal/day-start settings | Yes |
| GET | `/api/lessons` | List all lessons ordered by `orderIndex` | Yes |
| GET | `/api/stats` | Aggregate dashboard stats (total cards, due count, CEFR mastered count, etc.) | Yes |
| GET | `/api/settings` | Get all DB-backed app settings | Yes |
| PUT | `/api/settings` | Update one or more DB-backed app settings | Yes |

## Request/Response Formats

All endpoints exchange JSON. There is no shared response envelope (no `{ data, error }`
wrapper) — success responses return the resource or result object directly; error
responses return `{ "error": string }` with a non-2xx status.

### POST /api/login

```json
// Request
{ "password": "the-shared-app-password" }

// Response 200
{ "ok": true }
// Response 401
{ "error": "Incorrect password" }
```

### POST /api/sync

Body: `{ "documentId": string }` (the Google Doc ID; the client passes
`NEXT_PUBLIC_GOOGLE_DOC_ID`). Processes at most **1 new lesson per call**
(`MAX_LESSONS_PER_SYNC = 1` in `app/api/sync/route.ts`) to stay under the Vercel
Hobby 60s function timeout — call repeatedly until `remaining` is `0`.

```json
// Response 200
{
  "synced": true,
  "newLessons": 1,
  "newCards": 14,
  "remaining": 2,
  "failed": 0,
  "message": "2 more lesson(s) remaining — sync again to continue."
}
```

`failures` (array of strings) is included only when `failed > 0`, each entry naming
the failing lesson by a text excerpt so it can be found in the source Google Doc.

### GET / POST /api/cards

`GET` returns `CardDTO[]` (see `lib/dto.ts`) ordered by `createdAt desc`, each with
`review`, `lesson` (title/createdAt/orderIndex or `null`), and `sentences` included.

`POST` body:

```json
{
  "type": "vocabulary",       // "vocabulary" | "grammar" | "phrase" — required
  "front": "안녕하세요",         // Korean — required, non-empty
  "back": "hello (formal)",   // English — required
  "notes": "optional notes",  // optional
  "sentences": [               // optional
    { "korean": "...", "targetForm": "...", "translation": "..." }
  ]
}
```

Response is the created card, DTO-serialized (all `Date` fields as ISO strings).

### PUT /api/cards/[id]

Body accepts any subset of `type`, `front`, `back`, `notes`, `sentences` — only
provided fields are updated. If `front` changes, `normalizedFront` is recomputed and
kept in sync in the same transaction. If `sentences` is provided, it **replaces** the
card's entire sentence list (delete-all + recreate, in one `$transaction`); omitting
the key leaves existing sentences untouched. Validation returns `400` for a
non-string/empty `front`, a `type` outside `vocabulary`/`grammar`/`phrase`, or a
malformed `sentences` array. A `front` that collides with another card's
`normalizedFront` returns `400` (not `500`) with
`{ "error": "This front already exists (as a different variant of another card)" }`.

### DELETE /api/cards/[id]

No body. `{ "deleted": true }` on success, `404 { "error": "Card not found" }` if the
ID doesn't exist.

### GET /api/cards/due

Query params (all optional):

| Param | Values | Default | Notes |
|---|---|---|---|
| `lessonFrom` | positive integer | — | Filters to cards first introduced at/after this `Lesson.orderIndex` |
| `lessonTo` | positive integer | — | Filters to cards first introduced at/before this `Lesson.orderIndex` |
| `scope` | `due` \| `ahead` | `due` | `ahead` returns up to `sessionSize` not-yet-due cards nearest to becoming due (used by the "Study N more" flow) |

Returns `CardDTO[]`, sequenced foundation-first via `lib/sequence.ts`, each
sentence annotated with `unknownCount` (non-target words the learner hasn't seen yet).
`400` on an invalid range (non-integer, `< 1`, or `lessonFrom > lessonTo`) or invalid
`scope`.

### POST /api/review

```json
// Request
{ "cardId": "clxyz...", "rating": 3 }   // rating: 1=Again, 2=Hard, 3=Good, 4=Easy

// Response 200 — the updated CardReview row (raw Prisma shape, not DTO-serialized)
{
  "id": "...", "cardId": "clxyz...", "state": 2, "stability": 4.9,
  "difficulty": 5.1, "elapsedDays": 3, "scheduledDays": 5, "reps": 4, "lapses": 0,
  "nextReview": "2026-07-07T00:00:00.000Z", "lastReview": "2026-07-02T00:00:00.000Z"
}
```

`400` if `cardId`/`rating` are missing, `cardId` isn't a non-empty string, or
`rating` isn't an integer 1–4. `404` if no `CardReview` exists for `cardId`.

### POST /api/review/undo

```json
// Request
{
  "cardId": "clxyz...",
  "prevState": {
    "state": 1, "stability": 2.1, "difficulty": 5.0, "elapsedDays": 0,
    "scheduledDays": 1, "reps": 3, "lapses": 0,
    "nextReview": "2026-07-03T00:00:00.000Z", "lastReview": null
  }
}

// Response 200
{ "ok": true }
```

Each field in `prevState` is optional — any omitted field keeps its current DB value.
`400` if `cardId` is missing/non-string; `404` if no review row exists for it.

### POST /api/generate

Body: `{ "cards": CardDTO[] }` (max 100). Sends the given cards to Claude
(`lib/generate-practice.ts`) to produce **ephemeral** extra practice — nothing is
persisted to the database.

```json
{ "practice": [ /* generated exercise objects */ ] }
```

### POST /api/gloss

```json
// Request
{ "word": "먹었어요" }

// Response 200
{
  "dictionaryForm": "먹다",
  "gloss": "to eat",
  "partOfSpeech": "vocabulary",
  "source": "corpus",   // "corpus" | "cache" | "llm"
  "cardId": "clxyz..."  // present only when source is "corpus"
}
```

Resolution order: (1) exact `normalizeFront()` corpus match, (2) particle-stem corpus
match (`splitParticle`), (3) `Setting` table cache (`gloss:` prefix), (4) Claude Haiku
fallback (`claude-haiku-4-5-20251001`), whose result is then cached asynchronously.
`400` if `word` is missing or over 50 characters.

### GET /api/gloss/preload

No params — the limit is fixed server-side. Returns previously-cached gloss lookups
so the client can warm its in-memory cache on mount.

```json
{ "entries": [ { "word": "...", "dictionaryForm": "...", "gloss": "...", "partOfSpeech": "...", "source": "cache" } ] }
```

Non-critical: on any internal failure this still returns `200 { "entries": [] }`
rather than an error, so the gloss feature just degrades to per-tap lookups.

### GET /api/tts

Query params: `text` (required, ≤500 chars), `voice` (optional, defaults to the
active provider's default voice).

```json
{ "url": "https://<blob-host>/tts/<hash>.mp3", "cached": true }
```

`400` if `text` is missing or too long. `503` if `KOREAN_BLOB_READ_WRITE_TOKEN` /
`BLOB_READ_WRITE_TOKEN` is unset, or if synthesis itself fails — the client
(`components/AudioButton.tsx`) falls back to `window.speechSynthesis` on any
non-200 response.

### POST / GET /api/activity

`POST` body: `{ "date": "YYYY-MM-DD", "seconds": number, "reviews": number }`.
`date` must be a real calendar date (rejects e.g. `2026-02-31`); `seconds` is clamped
to 0–600 and `reviews` to 0–1000 per call (upserts by incrementing the matching
`StudyDay` row). `400` if `date` is invalid.

`GET` returns `{ days: DayRecord[], dailyGoalSeconds: number, dayStartHour: number }`
(`ActivityDTO`, see `lib/dto.ts`) — the client computes streaks/heatmap from `days`.

### GET /api/lessons

No params. Returns lessons ordered by `orderIndex`:

```json
[
  { "id": "...", "orderIndex": 1, "title": "Lesson synced 7/1/2026", "createdAt": "...", "_count": { "cards": 12 } }
]
```

### GET /api/stats

No params. Returns `StatsDTO`:

```json
{
  "totalCards": 340,
  "dueCards": 18,
  "totalLessons": 22,
  "cardsByType": [ { "type": "vocabulary", "_count": 210 } ],
  "masteredCount": 96
}
```

### GET / PUT /api/settings

`GET` returns all DB-backed settings in one object:

```json
{
  "dailyGoalSeconds": 600,
  "dayStartHour": 2,
  "buttonColor": "#2563eb",
  "rewardColor": "#f59e0b",
  "sessionSize": 20,
  "readingTextScale": 1.0,
  "readingAid": false
}
```

`PUT` accepts any subset of the same keys; only provided keys are updated (others
keep their current value), and the response mirrors the same shape. `400` if none of
the recognized keys are present with the right type. See `docs/CONFIGURATION.md` for
what each setting controls and its valid range/default.

## Error Codes

There is no shared error-handling middleware or centralized error-code file — each
route handler wraps its logic in `try { … } catch { … }` and returns
`NextResponse.json({ error: string }, { status })` directly. Observed status codes:

| Status | Meaning | Example |
|---|---|---|
| 400 | Bad request — missing/invalid fields, out-of-range values | Missing `documentId`, invalid `rating`, invalid lesson range |
| 401 | Unauthorized — bad login password, or missing/invalid `ks_auth` cookie | `middleware.ts` blanket check; `POST /api/login` wrong password |
| 404 | Resource not found | `PUT /api/cards/[id]` on a deleted card (`P2025`), no `CardReview` for a `cardId` |
| 500 | Internal error (DB failure, unexpected exception, missing required env var) | `APP_PASSWORD` unset, Prisma error, Claude extraction failure |
| 503 | Feature temporarily unavailable — external dependency not configured or failing | `/api/tts` when Blob token is missing or synthesis fails |

Several routes deliberately return a **generic** error message on `500` (e.g.
`PUT /api/cards/[id]`, `DELETE /api/cards/[id]`, `POST /api/review`) and log the
real error server-side only, to avoid leaking internal schema or Turso endpoint
details to the client.

## Rate Limits

No rate-limiting library or middleware is present in this codebase (checked
`package.json` dependencies and all `app/api/**` route handlers — no
`express-rate-limit`, `rate-limiter-flexible`, `@upstash/ratelimit`, or hand-rolled
throttling). The only request-size/volume guards are functional, not rate-based:
`/api/generate` caps `cards` at 100 items, `/api/tts` caps `text` at 500 characters,
`/api/gloss` caps `word` at 50 characters, and `/api/sync` caps itself to 1 lesson per
call for timeout reasons (see above) — none of these are per-time-window limits.

<!-- VERIFY: Whether Vercel's platform-level DDoS/abuse protection applies any implicit rate limiting to this deployment — not configurable or visible from the repository. -->
