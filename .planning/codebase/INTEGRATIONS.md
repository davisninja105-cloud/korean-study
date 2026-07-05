# External Integrations

**Analysis Date:** 2026-07-05

## APIs & External Services

**AI/LLM — Anthropic Claude:**
- `claude-opus-4-8` with adaptive thinking — exhaustive lesson content → study cards
  - Endpoint: `messages.stream()` in `lib/extract-cards.ts`
  - Input: lesson text + emphasized spans (bold/underline/highlight from Google Docs)
  - Output: JSON array of cards (front, back, type, sentences, distractors, component lemmas)
  - Used by: `POST /api/sync` for content ingestion
  - Max tokens: 32,000
  - Environment: `ANTHROPIC_API_KEY`

- `claude-haiku-4-5-20251001` — single Korean word → dictionary form + gloss
  - Endpoint: `messages.create()` in `lib/gloss.ts`
  - Input: word string (max 50 chars)
  - Output: JSON (dictionaryForm, gloss, partOfSpeech; max 256 tokens)
  - Used by: `POST /api/gloss` (tap-to-gloss on sentences)
  - Caching: results stored in Prisma `Setting` table with `gloss:` prefix (max 2,000 entries)
  - Environment: `ANTHROPIC_API_KEY`

- `claude-sonnet-4-6` — study cards → ephemeral practice exercises
  - Endpoint: `messages.create()` in `lib/generate-practice.ts`
  - Input: array of cards (front, back, type)
  - Output: JSON array of practice items (example-sentence, fill-blank, transformation)
  - Used by: `POST /api/generate`
  - Max tokens: 4,096
  - Environment: `ANTHROPIC_API_KEY`

**Document API — Google Docs API v1:**
- Purpose: Fetch lesson content from shared Google Doc (`수업 노트` tab only)
- Auth: OAuth2 service account via `google-auth-library` 10.7.0
  - Scope: `https://www.googleapis.com/auth/documents.readonly`
  - Credentials: `GOOGLE_SERVICE_ACCOUNT_KEY` (full JSON, single line in env)
- Client: `lib/google-docs.ts` → `fetchGoogleDoc(documentId)`
- Data captured: text + textStyle emphasis (bold, underline, backgroundColor) per run
- Returns: `{ text, emphasized }[]` per lesson section (split at horizontal rules)
- Environment: `GOOGLE_SERVICE_ACCOUNT_KEY`, `NEXT_PUBLIC_GOOGLE_DOC_ID`

**Text-to-Speech (Swappable Provider):**
- **Google Cloud Text-to-Speech (Neural2)** — Currently disabled, available as fallback
  - Model: `ko-KR-Neural2-A` (Korean voice)
  - Auth: `GOOGLE_SERVICE_ACCOUNT_KEY` with `cloud-platform` scope
  - Setup: Requires Cloud Text-to-Speech API enabled on the GCP project
  - Endpoint: `https://texttospeech.googleapis.com/v1/text:synthesize`
  - Provider ID: `google-neural2`
  - Implementation: `lib/tts.ts` → `googleNeural2Provider`

- **ElevenLabs** — Currently active TTS provider
  - Model: `eleven_multilingual_v2`
  - Auth: `ELEVENLABS_API_KEY`
  - Default voice: `pNInz6obpgDQGcFmaJgB` (Adam — clear multilingual voice)
  - Endpoint: `https://api.elevenlabs.io/v1/text-to-speech/{voice}`
  - Provider ID: `elevenlabs`
  - Implementation: `lib/tts.ts` → `elevenLabsProvider`

- Configuration: `TTS_PROVIDER` env var (default: `'google'`, currently set to `'elevenlabs'`)
- Audio output: MP3, cached in Vercel Blob after first synthesis
- Used by: `GET /api/tts` endpoint, `components/AudioButton.tsx` in study sessions

## Data Storage

**Databases:**
- **Production:** Turso (libSQL/SQLite hosting)
  - Connection: `libsql://…` in `DATABASE_URL`
  - Auth: `DATABASE_AUTH_TOKEN` (Turso token)
  - ORM: Prisma 7.6.0 + `@prisma/adapter-libsql` 7.6.0
  - Client: `@libsql/client` 0.17.2
  - Constraint: NO `prisma db push` / `prisma migrate` — DDL applied manually via `@libsql/client.executeMultiple()`
  - Scripts: `scripts/apply-graph-ddl.mjs`, `scripts/apply-sentence-ddl.mjs` for one-time schema updates

- **Development:** Local SQLite
  - Connection: `file:./prisma/dev.db` in `DATABASE_URL`
  - Same Prisma setup; no auth token

**File Storage:**
- **Vercel Blob** (TTS audio cache)
  - Store type: **public** (unsigned client-side GET access)
  - Cache key: SHA256 hash of `(provider.id, voice, text)` (deterministic, first 24 chars)
  - Stored path: `tts/{hash}.mp3`
  - Authentication: `KOREAN_BLOB_READ_WRITE_TOKEN` (preferred) or `BLOB_READ_WRITE_TOKEN` (fallback)
  - Client: `@vercel/blob` 2.4.1
  - Degradation: returns 503 when token absent; client falls back to `window.speechSynthesis`

**Caching:**
- **Tap-to-gloss results:** Prisma `Setting` table with `gloss:` prefix keys
  - Max entries: 2,000
  - Resolution order: (1) corpus lookup by normalizedFront, (2) cache hit, (3) LLM fallback
  - Preload: `GET /api/gloss/preload` returns up to 300 cached entries at client mount

- **TTS audio:** Vercel Blob with deterministic cache key
  - Lookup: `head()` before synthesis; cache hit returns stable public URL
  - No re-synthesis for identical (provider, voice, text) tuples

## Authentication & Identity

**Auth Provider:**
- Custom HMAC-SHA256 session cookie (no third-party provider)
  - Implementation: `lib/auth.ts` using Web Crypto API (runs in Edge + Node)
  - Cookie name: `ks_auth`
  - Middleware: `middleware.ts` (Edge) validates on every request
  - Flow: `POST /api/login` checks password → creates HMAC token → sets cookie
  - Credentials: 
    - `AUTH_SECRET` (random string for HMAC signing)
    - `APP_PASSWORD` (login password, checked in `app/api/login/route.ts`)
    - `CRON_SECRET` (bearer token for Vercel Cron, validated in `middleware.ts`)
  - Single-user (shared password, no user model)

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Datadog, etc.)
- Manual error handling in all route handlers with try/catch

**Logs:**
- Approach: `console.log()` / `console.error()` / `console.warn()` → Vercel function logs
- Vercel dashboard captures and archives logs automatically
- Notable log sites:
  - `app/api/sync/route.ts` — lesson extraction results and failures
  - `app/api/cron/sync/route.ts` — daily cron trigger and completion status
  - `lib/gloss.ts` — corrupt cache row warnings
  - `app/api/tts/route.ts` — TTS synthesis and Blob failures

## CI/CD & Deployment

**Hosting:**
- **Vercel** (serverless)
  - Project: `korean-study` at https://korean-study-five.vercel.app
  - Plan: Hobby (60s hard timeout on functions, regardless of `maxDuration` setting)
  - Deploy: GitHub `main` → auto-deploy (no manual step required)
  - Alt: `npx vercel --prod` (manual CLI deploy)

**Cron Jobs:**
- **Vercel Cron** (configured in `vercel.json`)
  - Schedule: `0 10 * * *` (10:00 UTC daily)
  - Endpoint: `GET /api/cron/sync`
  - Auth: Bearer token check via `CRON_SECRET` (middleware enforces)
  - Purpose: Incremental sync of new lessons from Google Doc
  - Note: Still processes 1 lesson per call due to Vercel 60s timeout

**Database Migrations:**
- NOT via `prisma db push` (does not work with libSQL)
- Manual approach:
  1. Edit `prisma/schema.prisma`
  2. Generate DDL: `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`
  3. Run against Turso via `@libsql/client` `executeMultiple()` (local script)

**Bulk Operations (Local, bypasses 60s timeout):**
- `npx tsx scripts/local-resync.mts` — re-extract all lessons
- `npx tsx scripts/relink-dependencies.mjs` — rebuild CardDependency edges
- `npx tsx scripts/wipe-card-data.mjs` — clear all card/lesson/review data
- `npx tsx scripts/find-duplicates.mjs` — fuzzy scan for duplicate fronts

**CI Pipeline:**
- None (no GitHub Actions, no automated test gates)
- ESLint runs locally: `npm run lint` (must pass clean)
- Tests run locally: `npm test` (Vitest)
- No gating on push; developer responsibility

## Webhooks & Callbacks

**Incoming:**
- `GET /api/cron/sync` — Vercel Cron trigger (daily at 10:00 UTC)
  - Auth: Bearer token in Authorization header
  - Response: JSON with `{ lessonsProcessed, remaining, failures? }`
  - Middleware ensures unauthorized requests return 401 (not redirect)

**Outgoing:**
- None (this is a read-only learner app; no webhooks to external services)

**Manual User-Initiated:**
- `POST /api/sync` — User tap to trigger incremental sync (processes 1 lesson per call)
- `POST /api/generate` — Generate ephemeral practice exercises for current session
- `GET /api/tts?text=&voice=` — Fetch or synthesize Korean audio
- `POST /api/gloss` — Look up a Korean word (corpus → cache → LLM)
- `POST /api/activity` — Log study time/review count to habit tracker
- `POST /api/review` — Record spaced-repetition grade (optimistically applied client-side, async save)

---

*Integration audit: 2026-07-05*
