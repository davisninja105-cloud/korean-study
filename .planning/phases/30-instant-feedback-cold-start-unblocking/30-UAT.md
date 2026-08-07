---
status: diagnosed
phase: 30-instant-feedback-cold-start-unblocking
source: [30-VERIFICATION.md]
started: 2026-08-07T01:23:00Z
updated: 2026-08-07T02:58:00Z
---

## Current Test

[testing complete]

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
  On a real device/browser: (a) save a settings change and immediately reload on the
  next navigation; (b) cold-launch the installed PWA from a home-screen icon
  (Android/Chrome and, separately, iOS Safari). No perceptible flash of a mismatched
  button/reward color or reading scale after a settings save; no white/mismatched splash
  frame at any point during PWA cold launch (note: iOS Safari ignores the manifest's
  background_color entirely, so iOS relies on the existing body background CSS rather
  than this phase's manifest fix — a residual iOS flash risk is expected and not a
  failure of this check).
result: issue
reported: "I can't naviate to the settings page. I get an error that says \"This page coudldn't load. A server error occurred. Reload to try again. Error 183329348\""
severity: blocker

## Summary

total: 2
passed: 1
issues: 1
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-30-2
  truth: "On a real device/browser, saving a settings change and reloading shows no flash of a mismatched color/scale, and PWA cold launch shows no white/mismatched splash frame."
  status: failed
  reason: "User reported: I can't naviate to the settings page. I get an error that says \"This page coudldn't load. A server error occurred. Reload to try again. Error 183329348\""
  severity: blocker
  test: 2
  root_cause: "app/settings/page.tsx's CR-01 backfill (30-REVIEW-FIX.md) calls (await cookies()).set('ks_settings', ...) directly inside the body of SettingsPage, a plain async Server Component (not a Server Action or Route Handler). Next.js's next/headers cookies() only permits .set()/.delete() during the 'action' phase (Server Actions/Route Handlers); calling it during a Server Component's 'render' phase throws ReadonlyRequestCookiesError ('Cookies can only be modified in a Server Action or Route Handler'), which surfaces to the browser as the generic digest-only 'server error' the user hit. Deterministic on every /settings visit — confirmed by live reproduction (matching error digest in both server log and client response)."
  artifacts:
    - path: "app/settings/page.tsx"
      issue: "Lines 33-51: jar.set(...) called inside a Server Component render body — invalid phase for cookie mutation."
    - path: "app/api/settings/route.ts"
      issue: "Reference pattern (lines 68-85): PUT is a genuine Route Handler using res.cookies.set() on a NextResponse — the valid equivalent the fix should follow."
  missing:
    - "Move the ks_settings cookie backfill out of the Server Component render path — e.g. a Server Action or Route Handler invoked once from the /settings client shell on mount — reusing the already-fetched getAllSettings() result (no new DB query needed)."
  debug_session: ".planning/debug/settings-page-server-error.md"
