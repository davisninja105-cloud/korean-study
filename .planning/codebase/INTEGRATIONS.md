# External Integrations

**Analysis Date:** 2026-07-02

## APIs & External Services

**AI/LLM — Anthropic Claude:**
- `claude-opus-4-8` with adaptive thinking — exhaustive lesson content → study cards
  - Endpoint: `messages.stream()` in `lib/extract-cards.ts`
  - Input: lesson text + emphasized spans (bold/underline/highlight from Google Docs)
  - Output: JSON array of cards (front, back, type, sentences, distractors, component lemmas)
  - Used by: `POST /api/sync` for content ingestion
  - Environment: `ANTHROPIC_API_KEY`

- `claude-haiku-4-5-20251001` — single Korean word → dictionary form + gloss
  - Endpoint: `messages.create()` in `lib/gloss.ts`
  - Input: word string (max 50 chars)
  - Output: JSON (dictionaryForm, gloss, partOfSpeech; max 256 tokens)
  - Used by: `POST /api/gloss` (tap-to-gloss on sentences)
  - Caching: results stored in Prisma `Setting` table with `gloss:` prefix (max 2000 entries)
  - Environment: `ANTHROPIC_API_KEY`

- `claude-sonnet-4-6` — study cards → ephemeral practice exercises
  - Endpoint: `messages.create()` in `lib/generate-practice.ts`
  - Input: array of cards (front, back, type)
  - Output: JSON array of practice items (example-sentence, fill-blank, transformation)
  - Used by: `POST /api/generate`
  - Environment: `ANTHROPIC_API_KEY`

**Document API — Google Docs API v1:**
- Purpose: Fetch lesson content from shared Google Doc (`수업 노트` tab only)
- Auth: OAuth2 service account via `google-auth-library` 10.7.0
  - Scope: `https://www.googleapis.com/auth/documents.readonly`
  - Credentials: `GOOGLE_SERVICE_ACCOUNT_KEY` (full JSON, single line)
- Client: `lib/google-docs.ts` → `fetchGoogleDoc(documentId)`
- Data captured: text + textStyle emphasis (bold, underline, backgroundColor) per run
- Returns: `{ text, emphasized }[]` per lesson section (split at horizontal rules)
- Environment: `GOOGLE_SERVICE_ACCOUNT_KEY`, `NEXT_PUBLIC_GOOGLE_DOC_ID`

## Data Storage

**Databases:**
- Turso (production) — libSQL/SQLite hosted
  - Connection: `libsql://…` in `DATABASE_URL`
  - Auth: `DATABASE_AUTH_TOKEN` (Turso token)
  - ORM: Prisma 7.6.0 + `@prisma/adapter-libsql`
  - Client: `@libsql/client` 0.17.2
  - Constraint: NO `prisma db push` / `prisma migrate` — DDL applied manually via `@libsql/client.executeMultiple()`

- Local SQLite (development)
  - Connection: `file:./prisma/dev.db` in `DATABASE_URL`
  - Same Prisma setup; no auth token

**File Storage:**
- Vercel Blob (TTS audio cache)
  - Store type: **public** (unsigned client-side GET access)
  - Cache key: SHA256 hash of `(provider.id, voice, text)`
  - Stored path: `tts/{hash}.mp3`
  - Authentication: `KOREAN_BLOB_READ_WRITE_TOKEN` or `BLOB_READ_WRITE_TOKEN` (fallback)
  - Degradation: returns 503 when token absent; client falls back to `window.speechSynthesis`

**Caching:**
- Tap-to-gloss results: Prisma `Setting` table (`gloss:<normalizedWord>` prefix keys; max 2000 entries)
- TTS audio: Vercel Blob (deterministic cache key, public access)

## Authentication & Identity

**Auth Provider:**
- Custom HMAC-SHA256 session cookie (no third-party provider)
  - Implementation: `lib/auth.ts` using Web Crypto API
  - Cookie name: `ks_auth`
  - Middleware: `middleware.ts` (Edge) validates on every request
  - Flow: `POST /api/login` checks password → creates HMAC → sets cookie
  - Credentials: `AUTH_SECRET` (HMAC key) + `APP_PASSWORD` (login password)
  - Single-user (shared password, no user model)

## Monitoring & Observability

**Error Tracking:**
- None (no Sentry, Datadog, etc.)

**Logs:**
- Approach: `console.log()` / `console.error()` → Vercel function logs
- Vercel dashboard captures and archives logs automatically

## CI/CD & Deployment

**Hosting:**
- Vercel (serverless)
  - Project: `korean-study` (https://korean-study-five.vercel.app)
  - Plan: Hobby (60s hard timeout on functions)
  - Deploy: GitHub `main` → auto-deploy (no manual CI/CD pipeline)

**CI Pipeline:**
- None (no GitHub Actions, no automated test gates)
- ESLint runs locally before commit; must pass clean

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

---

*Integration audit: 2026-07-02*
