---
phase: 19
slug: vercel-cron-auto-sync
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-05
---

# Phase 19 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client (SyncPanel) → POST /api/sync | Authenticated request (existing HMAC cookie gate, unchanged) crossing into the sync pipeline. | Lesson text, sync trigger |
| client → PUT /api/settings | Authenticated client can write settings; the new `lastAutoSyncedAt` timestamp must NOT be among the writable fields. | Settings values |
| client → GET /api/settings | Authenticated client reads the timestamp (informational, non-sensitive). | Settings values incl. timestamp |
| Vercel Cron scheduler → GET /api/cron/sync | Vercel auto-attaches `Authorization: Bearer <CRON_SECRET>`; the app must verify it before running the sync. | Cron trigger, no body |
| Public internet → GET /api/cron/sync | Any unauthenticated caller reaching the cron path must be rejected (401) — the path stays inside the auth matcher. | N/A (rejected) |
| app → Claude/Google APIs (via runSync) | An authorized cron run drives paid Claude extraction calls; abuse potential if the secret leaks. | Lesson text → Claude; Doc content ← Google |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-19-01 | Elevation of Privilege | middleware.ts / isValidCronAuth | high | mitigate | Fail-closed predicate in `lib/auth.ts:30-33` — validates only when `cronSecret` is a non-empty string AND header exactly equals `Bearer ${cronSecret}`. `tests/auth.test.ts` covers unset/empty-secret and malformed-header cases; all 126 project tests pass. | closed |
| T-19-03 | Tampering / Info Disclosure | middleware.ts matcher | high | mitigate | Matcher (`middleware.ts:38-43`) negative-lookahead left byte-for-byte unchanged; `/api/cron/sync` is not present in the exclusion list, so it stays behind the auth check. Verified by direct read. | closed |
| T-19-05 | Tampering | app/api/settings/route.ts | medium | mitigate | `lastAutoSyncedAt` is GET-only — absent from the PUT destructure/validation/setter path (`app/api/settings/route.ts:27,41-48`); only `app/api/cron/sync/route.ts` calls `setLastAutoSyncedAt`. Verified by direct read. | closed |
| T-19-02 | Spoofing / DoS | GET /api/cron/sync (leaked/guessed secret → repeated paid Claude runs) | medium | accept | Rate limiting explicitly out of scope per REQUIREMENTS.md (single-tenant, Hobby timeout caps damage). ≥16-char random `CRON_SECRET` is the mitigation, same posture as existing shared-password auth. | closed |
| T-19-06 | Information Disclosure | app/api/cron/sync error responses | low | mitigate | Catch logs server-side (`console.error`) and returns a generic `"Cron sync failed — see server logs"` message; no internal error detail leaked. Verified in `app/api/cron/sync/route.ts`. | closed |
| T-19-04 | Tampering | app/api/sync/route.ts + lib/sync.ts (refactor) | low | mitigate | Pure refactor — no auth/behavior change. `runSync()` takes `documentId` as a trusted parameter, reads no attacker-controlled env/input. Full Vitest suite (126/126) plus manual "Sync now" regression confirmed via UAT test 2 (identical response shape/behavior). | closed |
| T-19-SC | Tampering | npm/pip/cargo installs (all 3 plans) | low | accept | Zero new dependencies across the phase (verified in RESEARCH Package Legitimacy Audit); no install task exists. | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-19-01 | T-19-02 | Rate limiting is out of scope for this single-tenant app; Vercel Hobby's 60s timeout and 1-lesson-per-request cap bound the damage of a leaked/guessed `CRON_SECRET`. The ≥16-char random secret is the primary control. | Plan 03 threat model (accepted at plan time) | 2026-07-05 |
| R-19-02 | T-19-SC | No new dependencies introduced in any of the three phase plans; nothing to audit. | Plan 01/02/03 threat models (accepted at plan time) | 2026-07-05 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-05 | 7 | 7 | 0 | gsd-secure-phase (L1 grep-depth, register authored at plan time — short-circuit per workflow) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-05
