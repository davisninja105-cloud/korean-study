---
phase: 12
slug: home-habits-hydration
status: verified

# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)

threats_open: 0
asvs_level: 1
created: 2026-07-01
---

# Phase 12 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → API (GET /api/stats, GET /api/activity) | Existing auth gate (`middleware.ts` `ks_auth` cookie) unchanged; routes now delegate to `lib/dashboard.ts` | StatsDTO / ActivityDTO JSON — identical shape to pre-phase responses |
| RSC server → `lib/dashboard.ts` | Server-internal call (behind the same auth gate); no new boundary | Same DTOs, passed as React props instead of over HTTP |
| client → home RSC (GET /) | Existing auth gate unchanged; RSC runs server-side behind the gate | Rendered HTML + serialized DTO props |
| client → habits RSC (GET /habits) | Existing auth gate unchanged; RSC runs server-side behind the gate | Rendered HTML + serialized DTO props |
| HomeClient → /api/stats + /api/activity (post-sync refetch) | Existing GET routes (now delegated to `lib/dashboard.ts`); called only from `handleSync` after pull-to-refresh | Same DTOs as initial RSC load |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-12-01 | Information Disclosure | `lib/dashboard.ts` RSC→client prop serialization | low | mitigate | `StatsDTO`/`ActivityDTO` (`lib/dto.ts`) expose only fields the pre-existing `/api/stats`+`/api/activity` GET routes already returned — verified field-for-field against `lib/dashboard.ts`. No new data crosses the boundary. | closed |
| T-12-02 | Information Disclosure | `lib/dashboard.ts` accidentally imported client-side | low | mitigate | `// No 'use client' — this module runs server-side only.` guard comment present (confirmed at top of file); module imports `prisma` (Node-only), which fails at build time if client-imported — defense in depth. | closed |
| T-12-03 | Tampering | npm package installs | low | accept | Phase 12 installed zero packages — confirmed no `package.json` changes in any Phase 12 commit (`git log -- package.json` shows last touch predates this phase). | closed |
| T-12-04 | Information Disclosure | `HomeClient` receives server-fetched stats/activity via DTO props | low | mitigate | Props typed `StatsDTO`/`ActivityDTO` — verified in `components/HomeClient.tsx` Props interface; only fields already served by the GET routes. RSC fetch runs behind the auth gate. | closed |
| T-12-05 | Tampering | Band-up confetti fires on stale/manipulated `localStorage['lastBand']` | low | accept | `localStorage` is client-trusted by design (unchanged since v1.1). Worst case of tampering is a missed/duplicate celebration banner — UX-only, no security impact. | closed |
| T-12-06 | Information Disclosure | `HabitTracker` self-fetch fallback path leaks `/api/activity` when props absent | low | accept | Defensive fallback (D-09) only triggers when `initialDays`/`initialToday`/`initialGoal` are all `undefined` — verified guard `if (initialDays !== undefined && initialToday !== undefined && initialGoal !== undefined)` in `components/HabitTracker.tsx`. On Home, props are always provided, so self-fetch is skipped. Fallback path is unchanged v1.1 behavior for isolated component use. | closed |
| T-12-07 | Information Disclosure | `HabitsClient` receives server-fetched days/goal/dayStartHour/masteredCount via DTO props | low | mitigate | `DayRecord.date` is a `YYYY-MM-DD` string, not a `DateTime` — verified in `lib/habit.ts` interface — so no `Date` object crosses the RSC→client boundary (RSC-05). Only data already served by `GET /api/activity`+`/api/stats`. | closed |
| T-12-08 | Repudiation | Stale habits data after studying in another tab | low | accept | Habits has no client refetch (D-04) — data is a server-render snapshot, an accepted tradeoff documented in `12-CONTEXT.md` ("Stale home data freshness"). Fresh data loads on next navigation; pull-to-refresh on Home is the manual-refresh path. No TTL/auto-refresh in this phase. | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-12-01 | T-12-03 | Zero new npm packages installed this phase — no supply-chain surface added. | gsd-secure-phase (automated, L1 grep-depth) | 2026-07-01 |
| R-12-02 | T-12-05 | `localStorage['lastBand']` is inherently client-trusted; worst case is a UX-only missed/duplicate celebration, no data exposure or integrity impact. | gsd-secure-phase (automated, L1 grep-depth) | 2026-07-01 |
| R-12-03 | T-12-06 | `HabitTracker` self-fetch fallback is unchanged v1.1 behavior, gated to only fire when all three initial props are absent (verified in code); Home always supplies props. | gsd-secure-phase (automated, L1 grep-depth) | 2026-07-01 |
| R-12-04 | T-12-08 | Stale-habits-after-cross-tab-study is a documented, intentional tradeoff (12-CONTEXT.md) — no auto-refresh/TTL scoped for this phase. | gsd-secure-phase (automated, L1 grep-depth) | 2026-07-01 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-01 | 8 | 8 | 0 | gsd-secure-phase (L1 grep-depth verification; asvs_level 1, register authored at plan time — auditor spawn short-circuited per Step 3 rule) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-01
