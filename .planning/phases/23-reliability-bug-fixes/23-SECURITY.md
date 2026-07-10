---
phase: 23
slug: reliability-bug-fixes
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-10
---

# Phase 23 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| DB driver → server log | Driver rejection reasons written to server logs (Vercel) — server-generated, not user-controlled | Driver error object (low sensitivity) |
| LLM extraction → Card.components (DB) | Claude-generated component strings stored and later drive automatic edge writes | LLM-generated text (medium sensitivity — trusted source) |
| Sync request path → full-deck DB write pass | New automatic write pass runs inside auth-gated sync request | CardDependency edges (internal graph data) |

No new user-input boundary: `lessonFrom`/`lessonTo` request params are NOT interpolated into log messages (log-injection surface avoided by construction).

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-23-01 | Information Disclosure | console.error in lib/study-cards.ts | low | mitigate | Log ONLY the fixed `[study-cards]` prefix message and knownRowsResult.reason (driver error). Never log card fronts, lesson-range params, DATABASE_URL, or auth tokens. Server-side only, single-tenant, auth-gated. | closed |
| T-23-02 | Repudiation | silent known-lemmas degradation | low | mitigate | The prefixed `[study-cards]` log creates the missing audit trail for a previously invisible failure mode. | closed |
| T-23-03 | Tampering | relinkAllDependencies createMany | low | mitigate | Edges only connect two EXISTING card ids via exact normalizeFront match; unresolvable components dropped (link-dependencies.ts:76); self-references dropped (link-dependencies.ts:77); writes CardDependency rows only — never Card/Sentence/Lesson, never deletes. | closed |
| T-23-04 | Denial of Service | full-deck relink inside 60s Vercel budget | low | mitigate | Bounded: exactly 2 reads + at most 1 createMany (relink-dependencies.ts:46,49,59) regardless of deck size; runs at most once per sync, only when failed === 0 && newLessons > 0. | closed |
| T-23-05 | Tampering (race) | read-diff-write window between concurrent syncs | low | mitigate | `@@unique([cardId, prerequisiteId])` backstops duplicates (schema:132); conflicting createMany throws → caught non-fatal in runSync hook → retried next qualifying sync. Single-tenant app makes window negligible. | closed |
| T-23-06 | Repudiation | silent automatic DB writes | low | mitigate | Every pass emits `[sync] auto-relink:` log with counts (sync.ts:335); SyncResult.relinkedEdges surfaces count in API response (sync.ts:32,355); failures emit prefixed console.warn (sync.ts:342). | closed |
| T-23-07 | Information Disclosure | relink logs / test fixtures | low | mitigate | Logs contain only counts and error object — never DATABASE_URL, auth tokens, or card content. DB test uses throwaway temp-file SQLite DB, restores env in afterAll. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

No accepted risks.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-10 | 7 | 7 | 0 | gsd-security-auditor (L1 grep-depth, short-circuit: ASVS L1, all low severity, register authored at plan time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-10
