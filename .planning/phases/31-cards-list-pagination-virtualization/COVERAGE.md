# Phase 31 Plan 06 — API Coverage Decision

**Detector re-run against this gap-closure plan's actual scope (2026-08-07):** the plan adds a
Prisma `_count` select field, a DTO field, a UI badge, one new Playwright e2e spec, and a
`.planning/REQUIREMENTS.md` doc-sync edit. No new external API/SDK call, no new provider
integration, no new outbound HTTP client.

No external API integration: this plan touches only in-repo Prisma queries against the existing
`Card`/`Sentence` tables (already-established relations, no schema change), a client-side render
change in an existing component, a new local Playwright spec exercising the app's own
already-existing routes, and a markdown documentation edit. No Anthropic/Claude API, Google Docs
API, ElevenLabs/Google TTS, or Vercel Blob surface is touched.
