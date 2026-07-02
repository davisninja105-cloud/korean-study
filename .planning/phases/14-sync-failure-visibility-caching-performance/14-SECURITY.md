---
phase: 14
slug: sync-failure-visibility-caching-performance
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-02
---

# Phase 14 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → `POST /api/sync` | Untrusted JSON body (`documentId`); authenticated by shared-password HMAC cookie (middleware.ts). | JSON `{ documentId }` — low sensitivity (fixed doc ID) |
| server → client (sync response) | `failures[]` array serialized back to SyncPanel; anything placed in it is disclosed to the caller. | Safe category strings + lesson excerpts — low sensitivity |
| client → `GET /api/gloss/preload` | Authenticated by shared-password HMAC cookie; no request body/params — client cannot influence response size. | None (GET, no params) |
| server → client (preload response) | Returns cached gloss entries from Setting table; only `gloss:`-prefixed rows are read. | Gloss lookup results — low sensitivity (user's own data) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-14-01 | Information Disclosure | `failures[]` strings returned to SyncPanel | low | mitigate | SYNC-01 removes raw `msg`/`dbMsg` (extraction/Prisma error text) from client-facing strings; only safe category + lesson excerpt returned. Raw errors stay in `console.error`/`console.warn`. Verified: `app/api/sync/route.ts:114,123,273` — `failures.push` uses safe strings; `console.error`/`console.warn` at `:113,122,261,272,294`. | closed |
| T-14-02 | Information Disclosure | lesson excerpt in `failures[]` | low | accept | The excerpt is the user's OWN Google Doc content shown back to the sole authenticated owner (single-tenant, one shared password). Surfacing it is the intended feature. | closed |
| T-14-03 | Denial of Service | `POST /api/sync` (no rate limit) | low | accept | Rate limiting explicitly Out of Scope (REQUIREMENTS.md); single-tenant shared-password app; Vercel Hobby 60s function timeout + `MAX_LESSONS_PER_SYNC = 1` cap the damage. No new unbounded loop added. | closed |
| T-14-04 | Information Disclosure | `GET /api/gloss/preload` response size | low | mitigate | `getRecentGlosses` uses fixed server-side `take: GLOSS_PRELOAD_LIMIT` (300) with no client-controllable limit. Verified: `lib/gloss.ts:64` (`GLOSS_PRELOAD_LIMIT = 300`), `:91` (`take: limit`). | closed |
| T-14-05 | Information Disclosure | Setting table scoping | low | mitigate | Query filters `where: { key: { startsWith: 'gloss:' } }` so only gloss cache rows are returned; app-config settings never exposed. Verified: `lib/gloss.ts:23` (`CACHE_KEY_PREFIX = 'gloss:'`), `:47,90` (`startsWith: CACHE_KEY_PREFIX`). | closed |
| T-14-06 | Denial of Service | malformed cached JSON | low | mitigate | Each `row.value` `JSON.parse` is wrapped in try/catch (mirroring `getCachedGloss`); corrupt rows skipped + `console.warn`ed, never crashing the preload. Verified: `lib/gloss.ts:32-34` (getCachedGloss try/catch), `:95` (getRecentGlosses try/catch), `app/api/gloss/preload/route.ts:23-26`. | closed |
| T-14-07 | Information Disclosure | gloss cache contents | low | accept | Cached glosses are the sole authenticated user's own prior lookups (single-tenant, one shared password). Returning them to that same user is the intended feature. | closed |
| T-14-SC | Tampering | dependency installs | n/a | accept | No package-manager installs in either plan (14-01 or 14-02) — only edits to existing routes/libs; no supply-chain surface added. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-14-02 | T-14-02 | User's own Google Doc content shown to sole authenticated owner — single-tenant design | Plan 14-01 threat model | 2026-07-02 |
| AR-14-03 | T-14-03 | Rate limiting out of scope; single-tenant, Vercel 60s timeout + MAX_LESSONS_PER_SYNC=1 caps damage | REQUIREMENTS.md | 2026-07-02 |
| AR-14-07 | T-14-07 | User's own gloss lookups returned to same user — single-tenant design | Plan 14-02 threat model | 2026-07-02 |
| AR-14-SC | T-14-SC | No new dependency installs — no supply-chain surface | Plan 14-01/14-02 scope | 2026-07-02 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-02 | 8 | 8 | 0 | gsd-security-auditor (L1 grep, short-circuit: 0 open, plan-authored, ASVS L1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-02
