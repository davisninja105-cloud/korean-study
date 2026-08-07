---
status: diagnosed
trigger: |
  DATA_START
  Investigate issue: settings-page-server-error

  Summary: Navigating to /settings on the production build (`npm run build && npm start`)
  throws a client-visible "This page couldn't load. A server error occurred." error —
  the page fails to render entirely.
  DATA_END
created: 2026-08-06T00:00:00Z
updated: 2026-08-06T00:00:00Z
---

## Current Focus

CONFIRMED. Root cause reproduced live with the exact digest-style error the user reported.
See Evidence and Resolution below. Mode is find_root_cause_only — no fix applied.

## Symptoms

expected: /settings loads normally, showing the Settings UI (Appearance, goal, colors, etc.)
actual: Page fails with a Next.js error overlay: "This page couldn't load. A server error
occurred. Reload to try again. Error 183329348"
errors: Client-facing generic Next.js error boundary message (digest-style error id, no
stack shown to the browser). Server-side terminal log for `next start` did NOT show an
error at the time this was first observed (may need to reproduce live to capture the
actual stack).
reproduction: Build and start the app in production mode (`npm run build && npm start`),
log in with the app password, navigate to /settings.
started: Discovered during UAT of phase 30 (instant-feedback-cold-start-unblocking),
Test 2 ("Real-device no-flash confirmation"). Phase 30's CR-01 review-fix added a
backfill to app/settings/page.tsx that re-seeds the ks_settings cookie on every visit
to /settings, sourced from getAllSettings().

## Eliminated

- hypothesis: getAllSettings() (or readableForeground()) throws, unrelated to the cookie
  mutation.
  evidence: Read lib/settings.ts in full — getAllSettings() is a single batched
  prisma.setting.findMany() with no throw path for missing rows (parse* helpers all have
  safe defaults); the two try/catch-wrapped getters (getButtonColor/getRewardColor) aren't
  even on this call path since getAllSettings() uses the batched map, not those individual
  getters. The live reproduction's captured stack trace (see Evidence) points directly at
  the cookies().set() call, not at any Prisma/settings code, definitively ruling this out.
  timestamp: 2026-08-06T00:00:00Z

## Evidence

- timestamp: 2026-08-06T00:00:00Z
  checked: node_modules/next/dist/server/web/spec-extension/adapters/request-cookies.js
  found: `createCookiesWithMutableAccessCheck()` wraps `.set()`/`.delete()` with
  `ensureCookiesAreStillMutable()`, which throws `ReadonlyRequestCookiesError` ("Cookies
  can only be modified in a Server Action or Route Handler...") unless
  `requestStore.phase === 'action'`. A plain Server Component's render (including one
  marked `export const dynamic = 'force-dynamic'`) executes in the 'render' phase, not
  'action' — `force-dynamic` only affects prerendering/caching, not the action/render
  phase gate.
  implication: Confirms the mechanism the orchestrator hypothesis described is real and
  present in the exact Next.js version this project uses (16.2.1). `app/settings/page.tsx`
  is a plain `export default async function SettingsPage()` with no `'use server'` and is
  not a Route Handler, so any `.set()` call inside its body will always throw at request
  time, on every visit to /settings, deterministically (not intermittent).

- timestamp: 2026-08-06T00:00:00Z
  checked: Live reproduction — `npm install`, `npx prisma db push --url file:./prisma/dev-debug.db
  --accept-data-loss` (throwaway local SQLite DB), `npm run build` with dummy
  DATABASE_URL/AUTH_SECRET/APP_PASSWORD/NEXT_PUBLIC_GOOGLE_DOC_ID, `npm start` on port 3099,
  then `POST /api/login` (200, ks_auth cookie set) followed by `GET /settings` with that
  cookie.
  found: `GET /settings` returned `HTTP/1.1 500 Internal Server Error` with response body
  containing exactly `8:E{"digest":"3506834993"}` — the same generic digest-only error
  shape the user reported ("Error 183329348", a different digest but same class of opaque
  numeric-digest client error). The `next start` terminal simultaneously logged:
  ```
  ⨯ Error: Cookies can only be modified in a Server Action or Route Handler. Read more:
  https://nextjs.org/docs/app/api-reference/functions/cookies#options
      at j (.next/server/chunks/ssr/..._08.e~19._.js:4:23762) {
    digest: '3506834993'
  }
  ```
  implication: Direct, unambiguous confirmation. The digest in the server log matches the
  digest returned to the client byte-for-byte, proving this exact throw is the one
  surfaced by the error boundary as the generic "This page couldn't load" message. Build
  succeeds (force-dynamic defers the cookie-mutation code to request time, so it never
  runs during static generation) — the failure is 100% reproducible on every live request
  to /settings, which matches phase 30 UAT's observation that the page "fails to render
  entirely."

## Resolution

root_cause: |
  `app/settings/page.tsx`'s CR-01 backfill (added in the phase 30 review-fix pass) calls
  `(await cookies()).set('ks_settings', ..., {...})` directly inside the body of
  `SettingsPage`, a plain async Server Component (`export default async function
  SettingsPage()` — no `'use server'`, not a Route Handler, `export const dynamic =
  'force-dynamic'` does not change this). Next.js's `next/headers` `cookies()` only permits
  `.set()`/`.delete()` mutation when the current request is in the 'action' phase (Server
  Actions or Route Handlers, e.g. `app/api/settings/route.ts`'s `PUT` — which correctly
  uses `res.cookies.set()` on a `NextResponse`, a different, always-valid API). Calling
  `.set()` during a Server Component's 'render' phase throws
  `ReadonlyRequestCookiesError` ("Cookies can only be modified in a Server Action or Route
  Handler"), which Next.js's root error boundary catches and surfaces to the client as the
  generic digest-only "This page couldn't load. A server error occurred." message — exactly
  matching the user's report. This is 100% deterministic on every visit to /settings, not
  intermittent, and was not caught by phase 30's own verification because 30-VERIFICATION.md's
  CR-01 check was a source read (confirming the cookie payload/options shape matched
  PUT /api/settings) rather than an actual live navigation to /settings on a production build.
fix: (not applied — goal is find_root_cause_only)
verification: |
  Live-reproduced on a throwaway local SQLite DB + dummy env vars, production build
  (`npm run build && npm start`), authenticated via POST /api/login, then GET /settings.
  Server returned 500 with digest 3506834993; next start terminal logged the exact
  ReadonlyRequestCookiesError with the same digest, stack-tracing into the compiled
  chunk that contains app/settings/page.tsx's render function.
files_changed: []
