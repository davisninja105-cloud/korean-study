---
status: testing
phase: 30-instant-feedback-cold-start-unblocking
source: [30-VERIFICATION.md]
started: 2026-08-07T01:23:00Z
updated: 2026-08-07T01:23:00Z
---

## Current Test

number: 1
name: Dark-mode skeleton visibility across routes
expected: |
  Pulsing skeleton shapes clearly visible against the dark background within ~100ms of
  navigation on /study, /cards, /habits, /history — never an empty void or outline-only
  frame; other bg-surface-3 consumers (Nav, Toast, etc.) still look visually
  intentional/unchanged.
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
result: [pending]

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
result: [pending]

## Summary

total: 2
passed: 0
issues: 0
pending: 2
skipped: 0
blocked: 0

## Gaps
