---
phase: 06
slug: home-dashboard-polish
status: verified
threats_open: 0
asvs_level: 1
created: 2026-06-28
---

# Phase 06 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| client → /api/activity (GET) | Activity data fetched on Home page mount | Study session seconds + review counts; already auth-gated by `middleware.ts` (ks_auth HMAC cookie). No new boundary introduced. |
| client → /api/stats (GET) | Existing stats endpoint; unchanged this phase | Aggregate card/review counts; same auth gate. |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-06-01 | Information Disclosure | /api/activity GET response rendered on Home | low | accept | Endpoint already guarded by shared-password auth cookie via `middleware.ts`; single-tenant app; data is the user's own study seconds — no PII or sensitive data exposed. | closed |
| T-06-02 | Tampering | npm/pip/cargo package installs | n/a | accept | No package installs in this phase (PLAN Package Legitimacy Audit: none). No supply-chain checkpoint required. | closed |
| T-06-03 | Denial of Service | Extra `/api/activity` fetch on mount | low | accept | One additional read-only GET per page mount, mount-only (not re-fetched on sync per PLAN Pitfall 2). Negligible load; no loop or polling. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (`high`) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-06-01 | T-06-01 | Single-tenant personal study app; /api/activity is already auth-gated; data (study seconds) carries no sensitive personal information beyond the user's own usage patterns. | developer | 2026-06-28 |
| AR-06-02 | T-06-02 | No new packages installed this phase; supply-chain risk is non-applicable. | developer | 2026-06-28 |
| AR-06-03 | T-06-03 | One read-only mount-only GET adds negligible server load; no amplification or loop possible. | developer | 2026-06-28 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-06-28 | 3 | 3 | 0 | gsd-secure-phase (L1 short-circuit; register_authored_at_plan_time: true; asvs_level: 1; all threats accepted at plan time) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-06-28
