# External Integrations
_Last updated: 2026-06-23_

## Summary

The app integrates with five external services: Anthropic Claude (AI card extraction, tap-to-gloss, practice generation), Google Docs API (source lesson content), ElevenLabs TTS (Korean audio synthesis), Vercel Blob (TTS audio cache), and Turso/libSQL (hosted SQLite database). Authentication is a custom HMAC session-cookie gate — no third-party auth provider. Deployment is on Vercel with auto-deploy from GitHub `main`.

---

## AI / LLM

### Anthropic Claude
- **SDK:** `@anthropic-ai/sdk` 0.80.0
- **Models used:**
  - `claude-opus-4-8` — exhaustive card extraction from lesson text (`lib/extract-cards.ts`); uses `thinking: { type: 'adaptive' }` and streams via `.finalMessage()`
  - `claude-haiku-4-5-20251001` — tap-to-gloss single-word lookups (`lib/gloss.ts`); max 256 tokens, JSON response; fast/cheap
  - `claude-opus-4-8` — practice exercise generation (`lib/generate-practice.ts`)
- **Auth env var:** `ANTHROPIC_API_KEY`
- **API endpoints used:** `/v1/messages` (via SDK)
- **No webhook / callback** — all calls are synchronous request/response

---

## Google Docs API

- **Purpose:** Fetches the `수업 노트` (lesson notes) tab from a shared Google Doc as the source of lesson content
- **Auth:** Service account OAuth2 via `google-auth-library` 10.7.0; token minted with `documents.readonly` scope
- **Client:** `lib/google-docs.ts` — mints access token from service account JSON, calls Docs API v1 REST endpoint
- **API version:** Google Docs API v1
- **Env vars:**
  - `GOOGLE_SERVICE_ACCOUNT_KEY` — full service account JSON (single-line string); used for both Docs API and Google TTS
  - `NEXT_PUBLIC_GOOGLE_DOC_ID` — the target Google Doc ID (public env var, safe to expose to client)
- **Data captured:** Text content, `textStyle` emphasis (bold/underline/backgroundColor) per text run; returns `{ text, emphasized }[]` per lesson

---

## Text-to-Speech

### ElevenLabs (active provider)
- **Purpose:** Korean audio synthesis for flashcard sentences and card fronts
- **Model:** `eleven_multilingual_v2`
- **Env var:** `ELEVENLABS_API_KEY`
- **Implementation:** `lib/tts.ts` — `elevenLabsProvider` implementing `TtsProvider` interface
- **Activation:** `TTS_PROVIDER=elevenlabs` env var (currently active)

### Google Cloud TTS (alternate provider)
- **Purpose:** Alternative Korean TTS — `ko-KR-Neural2-A` voice
- **Scope:** `cloud-platform` (reuses `GOOGLE_SERVICE_ACCOUNT_KEY`)
- **Implementation:** `lib/tts.ts` — `googleNeural2Provider`
- **Activation:** `TTS_PROVIDER=google` (default when env var absent)
- **Requirement:** Cloud Text-to-Speech API must be enabled on the GCP project

**Provider abstraction:** `lib/tts.ts` exports `TtsProvider` interface + `activeTtsProvider`. Switching providers requires only an env var change — no call-site changes.

**API endpoint:** `app/api/tts/route.ts` — `GET ?text=&voice=`; hashes `(provider.id, voice, text)` → checks Vercel Blob cache; miss → synthesizes → stores in Blob → returns public URL. Returns 503 when blob token is unset; client (`components/AudioButton.tsx`) falls back to `window.speechSynthesis`.

---

## Database

### Turso (production)
- **Type:** Hosted libSQL (SQLite-compatible)
- **Client:** `@libsql/client` 0.17.2 via `@prisma/adapter-libsql` 0.7.6
- **ORM:** Prisma 7.6.0
- **Connection env vars:**
  - `DATABASE_URL` — `libsql://…` (Turso endpoint)
  - `DATABASE_AUTH_TOKEN` — Turso auth token
- **Prisma client singleton:** `lib/prisma.ts`
- **Schema:** `prisma/schema.prisma`
- **DDL management:** Manual via `@libsql/client` scripts (NOT `prisma migrate`); see `scripts/apply-graph-ddl.mjs`
- **Shell access:** `turso db shell korean-study`

### Local SQLite (development)
- Same Prisma client; `DATABASE_URL=file:./dev.db`; no auth token needed

---

## File / Blob Storage

### Vercel Blob
- **Purpose:** Caches synthesized TTS audio (MP3) to avoid re-synthesizing on every request
- **SDK:** `@vercel/blob` 2.4.1
- **Store type:** Must be a **public** Blob store (audio URLs returned directly to clients)
- **Env vars:**
  - `KOREAN_BLOB_READ_WRITE_TOKEN` — primary token (project-specific Blob store)
  - `BLOB_READ_WRITE_TOKEN` — fallback token
- **Cache key:** Hash of `(provider.id, voice, text)` → filename in Blob
- **Degradation:** When token is absent, `/api/tts` returns 503 and `AudioButton` falls back to browser speech synthesis

---

## Hosting & Deployment

### Vercel
- **Project:** `jason-d-28-projects/korean-study`
- **URL:** `https://korean-study-five.vercel.app`
- **Plan:** Hobby (hard 60s serverless function timeout — `maxDuration` setting has no effect)
- **Deploy trigger:** Push to `main` on GitHub → automatic Vercel deploy
- **Manual deploy:** `npx vercel --prod` (CLI at `/opt/homebrew/bin/vercel`)
- **Runtime:** Serverless (Next.js App Router API routes)

---

## Authentication

- **Type:** Custom single-password gate (no third-party auth provider)
- **Implementation:** `middleware.ts` guards all routes except `/login`, `/api/login`, static assets, and PWA assets
- **Session:** HMAC-signed cookie via Web Crypto (`lib/auth.ts`)
- **Env vars:**
  - `APP_PASSWORD` — the login password
  - `AUTH_SECRET` — random string used to sign the session cookie (HMAC key)

---

## Environment Variables Reference

| Variable | Service | Required | Purpose |
|----------|---------|----------|---------|
| `ANTHROPIC_API_KEY` | Anthropic | Yes | Claude API authentication |
| `GOOGLE_SERVICE_ACCOUNT_KEY` | Google | Yes | Full service account JSON for Docs API + (optional) Cloud TTS |
| `NEXT_PUBLIC_GOOGLE_DOC_ID` | Google | Yes | Target Google Doc ID (safe to expose client-side) |
| `DATABASE_URL` | Turso / SQLite | Yes | `libsql://…` in prod, `file:./dev.db` in dev |
| `DATABASE_AUTH_TOKEN` | Turso | Prod only | Turso auth token (not needed for local `file:` DB) |
| `APP_PASSWORD` | Auth | Yes | Login password for the app |
| `AUTH_SECRET` | Auth | Yes | HMAC signing key for session cookie |
| `TTS_PROVIDER` | TTS | No | `'elevenlabs'` or `'google'`; defaults to `'google'` |
| `ELEVENLABS_API_KEY` | ElevenLabs | When `TTS_PROVIDER=elevenlabs` | ElevenLabs API key |
| `KOREAN_BLOB_READ_WRITE_TOKEN` | Vercel Blob | Recommended | Primary Blob store token for TTS cache |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob | Fallback | Secondary Blob token if `KOREAN_BLOB_READ_WRITE_TOKEN` absent |

---

## Webhooks & Callbacks

**Incoming:** None — all external service calls are outbound request/response.

**Outgoing:** None — no webhooks sent to external services.

---

## Monitoring & Observability

- **Error tracking:** None (no Sentry, Datadog, etc.)
- **Logging:** `console.log` / `console.error` only; visible in Vercel function logs
- **Analytics:** None

---

## CI/CD

- **CI pipeline:** None (no GitHub Actions, no automated tests)
- **Deploy:** GitHub `main` → Vercel auto-deploy
- **Schema migrations:** Manual scripts run locally against Turso before or after code deploy
