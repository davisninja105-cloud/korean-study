---
phase: 35-service-worker-offline-review-queue
plan: 02
subsystem: offline-study-session
tags: [offline, local-storage, indexeddb, service-worker, home-warm, playwright, vitest]
dependency-graph:
  requires:
    - "public/sw.js (35-01) — versioned shell precache + navigation offline fallback, warms /study's document automatically at install time"
    - "lib/local-cache.ts (Phase 34) — fetchCacheContext/readCache/writeCache IndexedDB route cache"
  provides:
    - "lib/local-cache.ts: fetchCacheContextOrLastKnown() + LAST_CONTEXT_KEY — localStorage-backed cache-context fallback for offline cold launch"
    - "components/HomeClient.tsx: mount-time proactive warm of the due study pool into the 'study' cache entry"
  affects:
    - "components/HabitsClient.tsx, components/StudyClient.tsx, components/CardsClient.tsx, components/SettingsClient.tsx — all fetchCacheContext() call sites switched to the last-known fallback"
tech-stack:
  added: []
  patterns:
    - "localStorage last-known-value fallback in front of a live version-check read, validated by shape before trust"
    - "fire-and-forget mount-time warm write-through, gated on a 'stale' context marker"
key-files:
  created:
    - e2e/sw-offline-study-session.spec.ts
  modified:
    - lib/local-cache.ts
    - components/HomeClient.tsx
    - components/StudyClient.tsx
    - components/CardsClient.tsx
    - components/HabitsClient.tsx
    - components/SettingsClient.tsx
    - tests/local-cache.test.ts
decisions:
  - "fetchCacheContextOrLastKnown() is additive, not a replacement for fetchCacheContext() — the original function is kept and reused internally as the live-read step, since it's still the right shape for a 'live-only, no fallback' need"
  - "The recovered fallback context is marked stale:true rather than silently indistinguishable from a live read, so the Home-mount warm can skip writing a cache entry stamped with a version it never actually observed live"
  - "IndexedDB verification in the new Playwright spec checks indexedDB.databases() before ever calling indexedDB.open() with an explicit version — opening with version 1 before the app's own getDb() has run would create an empty database at that version and permanently starve the real upgrade callback of ever creating the 'routes' object store"
metrics:
  duration: "~1 hour"
  completed: 2026-08-10
status: complete
actuals:
  tokens: 7213
  tasks: 3
  commits: 3
---

# Phase 35 Plan 2: Last-Known Cache Context & Offline Study-Pool Warm Summary

Closes the two remaining OFFLINE-02 gaps behind Phase 35's versioned service worker (35-01): a genuine cold offline launch could still never reach the IndexedDB route cache (every `*Client.tsx` mount effect died the instant `/api/version` was unreachable, since the buildId that names the cache database only ever came from that live read), and the study pool was never warmed until someone actually visited `/study`. This plan adds a `localStorage`-backed last-known `{version, buildId}` fallback and a Home-mount warm of the due session, then proves both together with a genuine cold `page.goto('/study')` while offline.

## What Was Built

**Task 1 — Last-known cache context:**
- `lib/local-cache.ts`: widened `CacheContext` with an optional `stale` field; added `LAST_CONTEXT_KEY` (`'ks-last-cache-context'`) and `fetchCacheContextOrLastKnown()` — tries the live `fetchCacheContext()` first (persisting `{version, buildId}` to `localStorage` on success), and on failure reads the stored pair back, returning it (marked `stale: true`) ONLY when it parses to an object with two string fields; any parse failure, missing key, shape mismatch, or absent `localStorage` resolves to `null`.
- Replaced `fetchCacheContext()` with `fetchCacheContextOrLastKnown()` at all 12 call sites: 3 in `HabitsClient.tsx`, 3 in `StudyClient.tsx`, 3 in `CardsClient.tsx`, 2 in `HomeClient.tsx`, 1 in `SettingsClient.tsx`. No other behavior changed — the existing null-guard, cancellation guards, and revalidation conditions are untouched.
- `tests/local-cache.test.ts`: 9 new tests under a Map-backed `localStorage` stand-in covering all seven documented paths (live success, subsequent-failure-returns-stale, nothing-stored, malformed JSON, missing field, non-string fields, live-overwrites-stale) plus the absent-`localStorage` no-throw guarantee.

**Task 2 — Home-mount study-pool warm:**
- `components/HomeClient.tsx`: inserted a fire-and-forget warm immediately after the mount effect's cache context resolves and before Home's own revalidation branch — fetches `/api/cards/due?scope=due` (no lesson-range params, D-03/D-04), writes the parsed array through `writeCache(buildId, 'study', cards, version)` on success, and is skipped entirely when the resolved context is `stale` (no trustworthy version to stamp, no network to fetch over). Never awaited, never sets state.

**Task 3 — Playwright cold-offline-session proof:**
- `e2e/sw-offline-study-session.spec.ts`: warms only the Home route online (never `/study`), confirms the service worker is active and the page is worker-controlled, then polls (from inside the page) until `/study`'s document is in the shell cache AND the `study` key exists in the IndexedDB route cache. Goes offline, does a genuine `page.goto('/study')`, asserts the response is ok, mode-select renders with `FIXTURE.dueCards` (3) shown, then runs a full flashcard session through to the completion screen — asserting a genuinely different second-card front (real queue advance, not just a repainted screen) and zero page errors throughout.

## Deviations from Plan

None — plan executed as written.

## Environment Note (not a plan deviation)

This worktree had no local `node_modules` (git worktrees don't get their own install) and no generated Prisma client. `npx prisma generate` and `npm ci` were run locally to enable the Vitest suite and a genuine production-build Playwright run for verification — a one-time environment setup, not a plan file change, matching 35-01-SUMMARY.md's identical finding.

## Verification Performed

- `npm run lint` — 0 errors, 2 pre-existing unrelated warnings (`CardsClient.tsx`, `StudySession.tsx`, both present before this plan per 35-01-SUMMARY.md), 0 new warnings.
- `npx vitest run tests/local-cache.test.ts` — 29/29 passed (20 pre-existing + 9 new).
- `npx vitest run` (full suite) — 387/387 passed across 34 files, no regressions.
- `npx playwright test e2e/sw-offline-study-session.spec.ts` — 2/2 passed (auth setup + the new spec), against a genuine production build with a seeded isolated test DB.
- `npx playwright test e2e/sw-shell-offline.spec.ts e2e/local-cache-offline.spec.ts` — 9/9 passed, confirming no regression to Phase 35 Plan 1's or Phase 34's existing offline coverage.

## Self-Check: PASSED

- `lib/local-cache.ts`, `components/HomeClient.tsx`, `components/StudyClient.tsx`, `components/CardsClient.tsx`, `components/HabitsClient.tsx`, `components/SettingsClient.tsx`, `tests/local-cache.test.ts`, `e2e/sw-offline-study-session.spec.ts` — all FOUND on disk.
- Commits `95f5774`, `385b4ff`, `6f40f7e` — all FOUND in `git log`.
