---
status: testing
phase: 30-instant-feedback-cold-start-unblocking
source: [30-VERIFICATION.md]
started: 2026-08-07T01:23:00Z
updated: 2026-08-07T03:55:00Z
---

## Current Test

number: 2
name: Real-device "no flash" + PWA cold-launch confirmation
expected: |
  On a real device/browser: (a) save a settings change on /settings and observe the very
  next navigation for any color/scale flash; (b) cold-launch the installed PWA from a
  home-screen icon (Android/Chrome, and separately iOS Safari). No perceptible flash of a
  mismatched button/reward color or reading scale after a settings save; no white/mismatched
  splash frame during PWA cold launch (iOS Safari ignoring manifest background_color is a
  disclosed, accepted residual risk, not a failure).
awaiting: user response

## Tests

### 1. Dark-mode skeleton visibility across routes
expected: |
  `npm run build && npm start`, toggle Settings → Appearance → Dark, navigate to
  /study, /cards, /habits, /history (ideally with network throttling) and observe the
  loading skeletons. Pulsing skeleton shapes should read as clearly visible placeholders
  against the dark background within ~100ms of navigation — never an empty void or
  outline-only frame. Other bg-surface-3 consumers (Nav, Toast, etc.) should still look
  visually intentional/unchanged.
result: pass

### 2. Real-device "no flash" confirmation (settings + PWA splash)
expected: |
  On a real device/browser: (a) save a settings change on `/settings` and observe the very
  next navigation for any color/scale flash; (b) cold-launch the installed PWA from a
  home-screen icon (Android/Chrome, and separately iOS Safari). No perceptible flash of a
  mismatched button/reward color or reading scale after a settings save; no white/mismatched
  splash frame during PWA cold launch (iOS Safari ignoring manifest background_color is a
  disclosed, accepted residual risk — not a failure of this check).
result: [pending]
note: |
  Previous attempt was blocked before it could observe anything — navigating to /settings
  hit a deterministic production server error (G-30-2). G-30-2 is now fixed and verified
  (30-VERIFICATION.md, re-verification pass, 2026-08-06): app/settings/page.tsx no longer
  mutates cookies from its render body, a permanent regression-guard test forbids
  reintroducing it, and a live e2e run confirms /settings returns 200 with the real
  Settings UI. The underlying visual/device-dependent check this test exists for has
  still never actually been completed by a human — retry it now that the blocker is gone.

## Summary

total: 2
passed: 1
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

- gap_id: G-30-2
  truth: "On a real device/browser, saving a settings change and reloading shows no flash of a mismatched color/scale, and PWA cold launch shows no white/mismatched splash frame."
  status: resolved
  reason: "Fixed by gap-closure plan 30-04: moved the ks_settings cookie backfill out of app/settings/page.tsx's Server Component render body into a genuine Route Handler (app/api/settings/backfill-cookie/route.ts), invoked from components/SettingsClient.tsx's mount effect. Re-verified live in 30-VERIFICATION.md's re-verification pass (2026-08-06): 265/265 unit tests pass incl. a permanent regression guard, 12/12 relevant e2e tests pass, /settings returns 200 with the real Settings UI on a production build."
  severity: blocker
  test: 2
  root_cause: "app/settings/page.tsx's CR-01 backfill (30-REVIEW-FIX.md) calls (await cookies()).set('ks_settings', ...) directly inside the body of SettingsPage, a plain async Server Component (not a Server Action or Route Handler). Next.js's next/headers cookies() only permits .set()/.delete() during the 'action' phase (Server Actions/Route Handlers); calling it during a Server Component's 'render' phase throws ReadonlyRequestCookiesError ('Cookies can only be modified in a Server Action or Route Handler'), which surfaces to the browser as the generic digest-only 'server error' the user hit. Deterministic on every /settings visit — confirmed by live reproduction (matching error digest in both server log and client response)."
  artifacts:
    - path: "app/settings/page.tsx"
      issue: "Lines 33-51 (pre-fix): jar.set(...) called inside a Server Component render body — invalid phase for cookie mutation. Removed by 30-04."
    - path: "app/api/settings/route.ts"
      issue: "Reference pattern (lines 68-85): PUT is a genuine Route Handler using res.cookies.set() on a NextResponse — the valid equivalent the fix followed."
    - path: "app/api/settings/backfill-cookie/route.ts"
      issue: "New in 30-04: the genuine Route Handler the backfill now runs from, following the PUT reference pattern."
  missing: []
  debug_session: ".planning/debug/resolved/settings-page-server-error.md"
