---
phase: 19
slug: vercel-cron-auto-sync
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-04
---

# Phase 19 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 |
| **Config file** | `vitest.config.ts` (environment: node, `@/*` alias) |
| **Quick run command** | `npx vitest run tests/auth.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~3 seconds (pure lib tests only) |

Note: This repo restricts Vitest to pure `lib/` functions (no DB/API mocking convention). The single high-value automated test this phase adds is `tests/auth.test.ts` for `isValidCronAuth`. Refactor/persistence/UI tasks are gated by `npm run build` + `npm run lint` + the full `npm test` suite (regression), plus the manual-only checks below.

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/auth.test.ts` (once it exists — Wave 0 / Plan 03 Task 1), else `npm run build && npm run lint`
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite green + the 3 manual checks below
- **Max feedback latency:** ~30 seconds (build) / ~3 seconds (unit)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 19-01-01 | 01 | 1 | SYNC-02 | T-19-04 | Pure refactor — runSync() reads no attacker-controlled input | build | `npm run build && npm run lint` | ✅ | ⬜ pending |
| 19-01-02 | 01 | 1 | SYNC-02 | T-19-04 | Manual sync response shape unchanged | build+suite | `npm run build && npm run lint && npm test` | ✅ | ⬜ pending |
| 19-02-01 | 02 | 1 | SYNC-04 | — | Setting persisted, no schema change | build | `npm run build && npm run lint` | ✅ | ⬜ pending |
| 19-02-02 | 02 | 1 | SYNC-04 | T-19-05 | lastAutoSyncedAt GET-only, not PUT-settable | build | `npm run build && npm run lint` | ✅ | ⬜ pending |
| 19-02-03 | 02 | 1 | SYNC-04 | — | Timestamp displayed, purity clean | build | `npm run build && npm run lint` | ✅ | ⬜ pending |
| 19-03-01 | 03 | 2 | SYNC-03 | T-19-01 | isValidCronAuth fails closed when secret unset/empty | unit | `npx vitest run tests/auth.test.ts` | ❌ W0 | ⬜ pending |
| 19-03-02 | 03 | 2 | SYNC-03 | T-19-01 / T-19-03 | Bearer branch fails closed; matcher unchanged | build | `npm run build && npm run lint` | ✅ | ⬜ pending |
| 19-03-03 | 03 | 2 | SYNC-02 | T-19-06 | 1-lesson cron; timestamp only after runSync resolves | build+suite | `npm run build && npm run lint && npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/auth.test.ts` — new file (Plan 03 Task 1, TDD RED-first), covers SYNC-03's `isValidCronAuth` including the explicit fail-closed cases (`cronSecret` undefined and empty string → false regardless of header). Highest-value automated test this phase can add — the fail-open anti-pattern is the named risk.
- No fixture/mock infrastructure needed — `isValidCronAuth` is a pure function (string/undefined in, boolean out), consistent with every other tested `lib/` module in this repo.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `GET /api/cron/sync` triggers runSync() and stays on the 1-lesson path | SYNC-02 | No DB-mocking test convention in this repo (CLAUDE.md restricts Vitest to pure lib functions) | With CRON_SECRET + NEXT_PUBLIC_GOOGLE_DOC_ID set locally: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync`; inspect response `newLessons <= 1` |
| Manual `POST /api/sync` behavior unchanged after runSync() extraction | SYNC-02 | Pure refactor regression; route has no existing test coverage | Settings ▸ Advanced ▸ Sync now; confirm identical response shape (synced/newLessons/newCards/remaining/failed) to pre-refactor |
| `lastAutoSyncedAt` persists and round-trips through GET /api/settings | SYNC-04 | Prisma-backed setting; no unit-test convention (matches every other setting) | Trigger the cron route manually, then `curl http://localhost:3000/api/settings \| jq .lastAutoSyncedAt` shows a fresh ISO timestamp; confirm it renders in Settings ▸ Advanced |
| Middleware fails closed at runtime when CRON_SECRET unset | SYNC-03 | Requires a running server + env manipulation | Unset CRON_SECRET locally; `curl -H "Authorization: Bearer x" http://localhost:3000/api/cron/sync` returns 401 |
| Scheduled cron actually fires daily in Production | SYNC-02 | Vercel cron cannot run under `next dev`/`vercel dev` (RESEARCH Pitfall 2); Production-only | After deploy + CRON_SECRET set in Vercel Production: confirm the job under Dashboard → Cron Jobs and check its first invocation log after the scheduled UTC time |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has a build/lint/test or unit command)
- [x] Wave 0 covers all MISSING references (`tests/auth.test.ts` created RED-first in Plan 03 Task 1)
- [x] No watch-mode flags (all commands use `run` / one-shot)
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-04
