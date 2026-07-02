---
phase: 14
slug: sync-failure-visibility-caching-performance
status: approved
nyquist_compliant: false
wave_0_complete: true
created: 2026-07-02
---

# Phase 14 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm run test` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~1 second |

---

## Sampling Rate

- **After every task commit:** Run `npm run test`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~1 second

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 14-01-T1 | 01 | 1 | SYNC-01 | T-14-01 | Raw error text never leaks into `failures[]`; only safe category + excerpt | unit | `npm run test` | ✅ `tests/lesson-excerpt.test.ts` | ✅ green |
| 14-01-T2 | 01 | 1 | PERF-01 | T-14-03 | CardDependency edges form correctly (keyToId map built once per request) | manual | — | ❌ | ⚠️ manual-only |
| 14-01-T3 | 01 | 1 | PERF-01 | — | Component lemmas resolve via `normalizeFront` | unit | `npm run test` | ✅ `tests/card-key.test.ts` | ✅ green |
| 14-02-T1 | 02 | 1 | PERF-02 | T-14-04/05/06 | Gloss preload bounded, scoped, crash-safe | manual | — | ❌ | ⚠️ manual-only |
| 14-02-T2 | 02 | 1 | PERF-02 | — | Gloss route uses `normalizeFront` for lookup | unit | `npm run test` | ✅ `tests/card-key.test.ts` | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. No Wave 0 needed — vitest is installed and configured; `tests/lesson-excerpt.test.ts` was added during this validation pass (extracting the pure helper from `app/api/sync/route.ts:28` to `lib/lesson-excerpt.ts`).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Sync route creates correct CardDependency edges at runtime | PERF-01 | Integration endpoint with 3 external dependencies (Google Docs API, Claude extraction API, Prisma/Turso DB). No mock infrastructure exists for any of these. Structural wiring is grep-verified in 14-VERIFICATION.md. | Live sync against tutor's Google Doc; inspect CardDependency table via `node scripts/check-edges.mjs` before/after. Verify: 0 self-edges, edges connect cards with components to prereq cards with components. (Passed in Phase 14 UAT.) |
| Gloss preload returns bounded, scoped, crash-safe data at runtime | PERF-02 | `getGlossCacheEntries` in `lib/gloss.ts` queries Prisma directly. No Prisma mock exists. Core logic (limit=300, `gloss:` prefix filter, JSON.parse try/catch) is grep-verified in 14-SECURITY.md. | Reload page with populated gloss cache; verify a preloaded word resolves with no spinner and no POST after reload. Check Network tab for `GET /api/gloss/preload`. (Passed via Plan 14-02 Task 3 live checkpoint.) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies (lessonExcerpt has unit test; manual-only items have documented rationale)
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (N/A — no Wave 0 needed)
- [x] No watch-mode flags
- [x] Feedback latency < 1s
- [ ] `nyquist_compliant: true` — NOT set (2 manual-only items remain; not fully Nyquist-compliant but accepted with documented rationale)

**Approval:** approved 2026-07-02 (partial — 1 gap filled, 2 manual-only with rationale)
