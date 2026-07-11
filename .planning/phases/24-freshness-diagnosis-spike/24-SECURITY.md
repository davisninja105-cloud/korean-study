---
phase: 24
slug: freshness-diagnosis-spike
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-07-11
---

# Phase 24 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| script → npm registry | Third-party package code (playwright) enters the dev environment at install time | package code |
| script → database | The script holds a live Prisma connection with mutators that write mid-run; must remain pinned to an isolated `file:` DB, never the real Turso instance | DB read/write |
| script → local prod server | Auth cookie crosses here, derived from a throwaway secret; evidence logs must not carry real secrets | auth cookie, request/response bodies |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-24-SC | Tampering | npm install of `playwright` devDep | high | mitigate | Blocking human checkpoint (Plan 24-01 Task 1) confirmed microsoft/playwright + download volume on npmjs.com before install proceeded (24-01-SUMMARY.md) | closed |
| T-24-01 | Tampering | `diagnose-freshness.mts` DB target (incl. mid-run mutators added in Plan 24-02) | high | mitigate | `assertLocalDb()` hard-fail guard (scripts/diagnose-freshness.mts:42-49) rejects any `libsql://` URL, runs at script start and again on `childEnv` immediately before the server spawn; `DATABASE_URL` is pinned in-process to the `file:` test path (line 54), never read from `.env` for this script. Verified present and unmodified in current code. | closed |
| T-24-02 | Information Disclosure | `AUTH_SECRET`/`APP_PASSWORD` handling + evidence logs (`--log-requests` mode logs the `ks_auth` cookie) | medium / low | mitigate / accept | Throwaway literal secrets (`THROWAWAY_SECRET`, `THROWAWAY_APP_PASSWORD`, lines 33-34) assigned directly to `process.env`, so real `.env`/`.env.local` secrets are never loaded into this script or its child server process. The logged cookie is an HMAC of the throwaway secret only — worthless outside the local diagnosis run — and the run log is never committed. | closed |
| T-24-03 | Information Disclosure | `scripts/.tmp/24-diagnosis.db` commit hygiene | low | accept | Synthetic fixture data only; path is covered by the repo's blanket `*.db` gitignore rule plus an explicit `/scripts/.tmp/` entry (verified in `.gitignore:36,57`). | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-24-01 | T-24-02 (evidence-log cookie exposure) | Logged `ks_auth` value is an HMAC of a throwaway per-run secret, valid only against the ephemeral local diagnosis server; run logs are never committed | User (via Plan 24-01/24-02 threat model, accept disposition) | 2026-07-10 |
| AR-24-02 | T-24-03 (fixture DB commit hygiene) | Synthetic data only, already gitignored | User (via Plan 24-01 threat model, accept disposition) | 2026-07-10 |

*Accepted risks do not resurface in future audit runs.*

**Non-blocking informational note (below block_on threshold, not part of the formal register):** `24-REVIEW.md` flags three low-severity warnings in this throwaway script that were not part of the PLAN-time threat register and remain unfixed as of this audit — `assertLocalDb()` is a deny-list rather than an allow-list (WR-01), the diagnostic `next start` server binds to all interfaces (`0.0.0.0`) with hardcoded low-entropy credentials for the run duration (WR-02), and WAL sidecar files aren't cleaned up on fresh-run DB reset (WR-03). REVIEW.md itself assesses all three as low severity (isolated fixture data, LAN-only, ephemeral run) and this script is throwaway/diagnostic — it is not part of the shipped app and Phase 24 has already completed its diagnostic purpose. Recorded here for traceability only; does not affect `threats_open`.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-07-11 | 4 | 4 | 0 | /gsd-secure-phase (orchestrator, short-circuit path — ASVS L1, register authored at plan time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-07-11
