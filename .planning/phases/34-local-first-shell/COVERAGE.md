# Phase 34 — API Coverage Decision

No external API integration: the phase adds a browser-native IndexedDB cache
(`lib/local-cache.ts`, via the `idb` wrapper) in front of this app's own already-shipped
internal route handlers — `GET /api/version`, `/api/stats`, `/api/activity`, `/api/cards`,
`/api/cards/due`, `/api/sync`, `PUT /api/settings` — plus the `navigator.onLine` browser
event pair. No third-party SDK, service, or provider surface is introduced, so no
INTEGRATE/OPT-OUT capability matrix applies.

**Detection basis:** `34-RESEARCH.md` §Architectural Responsibility Map lists every
capability in scope as `Browser / Client` or `API / Backend`, with the only backend change
being a `buildId` field read from `process.env.VERCEL_GIT_COMMIT_SHA` inside the existing
`app/api/version/route.ts`. `34-CONTEXT.md` §Phase Boundary confirms the same scope and
places service-worker precaching in Phase 35.

**Packages installed:** `idb` 8.0.3 (runtime), `fake-indexeddb` (dev-only) — both audited
`OK` in `34-RESEARCH.md` §Package Legitimacy Audit; neither is an API client.
