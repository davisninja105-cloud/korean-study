---
phase: 30
slug: instant-feedback-cold-start-unblocking
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-07
---

# Phase 30 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser (`document.cookie`) → `app/layout.tsx` pre-paint script | Script trusts the `ks_settings` cookie's shape only after a `try/catch`-wrapped `JSON.parse`; malformed input degrades silently, never throws/blocks render | Non-secret UI preference values (hex colors, float scale, boolean) |
| Authenticated client → `PUT /api/settings` | Existing `middleware.ts` `ks_auth` gate protects this route; unchanged by this phase | Validated settings values → `ks_settings` cookie write |
| Authenticated client → `POST /api/settings/backfill-cookie` | Same `middleware.ts` `ks_auth` gate (matcher excludes only `/login`, `/api/login`, static assets); no new exemption added | Caller-supplied button/reward/reading values → `ks_settings` cookie re-seed |
| Deploy pipeline (Vercel build) → `vercel.json` | Static, version-controlled config read at deploy time; no runtime request path | `regions` field (compute region pin) |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-30-01 | Tampering | `app/api/settings/route.ts` (`ks_settings` cookie write) | low | mitigate | `PUT` writes only the `HEX_RE`-validated *return values* of `setButtonColor`/`setRewardColor`/`setReadingTextScale`/`setReadingAid` into the cookie, never the raw request body (confirmed: `lib/settings.ts` `HEX_RE.test(hex)` gates every color setter) | closed |
| T-30-02 | Information Disclosure | `ks_settings` cookie (non-httpOnly, readable via `document.cookie`) | low | accept | Cookie deliberately carries only non-secret UI preference data — never auth/session-related; `ks_auth` stays `httpOnly` and is unaffected | closed |
| T-30-03 | Elevation of Privilege | `ks_settings` cookie mistakenly trusted as an authorization/identity signal | medium | mitigate | `middleware.ts`'s `ks_auth`-based gate remains the sole access-control mechanism; `grep -rn "ks_settings"` across `app/`, `components/`, `middleware.ts`, `lib/` confirms every hit is confined to `app/layout.tsx` (read-only consumer), `app/settings/page.tsx` (comment only), `app/api/settings/route.ts`, `app/api/settings/backfill-cookie/route.ts`, and `components/SettingsClient.tsx` (comment) — zero hits in `middleware.ts` | closed |
| T-30-04 | Denial of Service (minor) | Pre-paint `<script>` cookie parse throwing and blocking first paint | low | mitigate | Confirmed: the entire parse-and-apply block in `app/layout.tsx` is wrapped in a single outer `try{}catch(e){}`, matching the file's two other pre-paint scripts — any parse failure is a silent no-op | closed |
| T-30-05 | Tampering | `app/globals.css` `--skeleton-bg` value | low | accept | Static CSS custom property, no user input, no injection vector | closed |
| T-30-06 | Denial of Service (minor) | `page.route` delay in `e2e/study-filter-skeleton.spec.ts` | low | accept | Test-only artificial delay via Playwright route interception; no production code path | closed |
| T-30-07 | Tampering | `vercel.json` `regions` field | low | mitigate | Version-controlled, reviewable via git diff/PR before deploy; a bad edit can only shift compute region, never grant access — confirmed the file is git-tracked | closed |
| T-30-08 | Configuration (region misconfiguration) | REGION-01's Turso↔Vercel code mapping | medium | mitigate | Confirmed via 30-03-SUMMARY.md: region resolved through a **live** `turso db show korean-study` lookup (not hardcoded/guessed), `turso auth whoami` re-verified live, `pdx1` cross-checked as an exact AWS `us-west-2` infrastructure match to Turso's reported region | closed |
| T-30-09 | Tampering | `app/manifest.ts` color values (static, build-time) | low | accept | Static literal values, no user input path, cosmetic-only impact if wrong | closed |
| T-30-10 | Tampering | `POST /api/settings/backfill-cookie` (client-supplied `buttonColor`/`rewardColor`/`readingTextScale`/`readingAid`) | low | mitigate | Confirmed: route requires the existing `ks_auth` session (covered by `middleware.ts`'s matcher — no new exemption); body is type-checked (`typeof`) before use; values are only ever consumed via `style.setProperty()`/`classList.add()` in the pre-paint script (never `innerHTML`/`eval`) — an authenticated client can at most corrupt their own cosmetic theme. Note: unlike `PUT /api/settings`, this route does not re-run `HEX_RE` format validation on `buttonColor`/`rewardColor` before writing (type-check only) — accepted as sufficient given the safe `setProperty`-only consumption path and self-only blast radius | closed |
| T-30-11 | Information Disclosure | Non-httpOnly `ks_settings` cookie written by the new backfill route | low | accept | Same accepted-risk profile as T-30-02 — cosmetic-only data, unchanged from the already-shipped `PUT /api/settings` cookie write | closed |
| T-30-12 | Elevation of Privilege | New backfill route mistakenly treated as an auth/identity write path by future code | low | mitigate | Confirmed via the same `ks_settings` grep as T-30-03: the route touches only `ks_settings`, never `ks_auth`; `middleware.ts`'s gate and matcher are unchanged | closed |

*Status: open · closed · open — below {block_on} threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` (`high`) count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-30-01 | T-30-02, T-30-11 | Non-httpOnly `ks_settings` cookie deliberately carries only cosmetic UI preference data (hex colors, float scale, boolean flag) — never auth/session-related. A hypothetical future XSS reading this specific cookie learns nothing sensitive; `ks_auth` remains `httpOnly` and unaffected. | Plan authors (30-01-PLAN.md, 30-04-PLAN.md) | 2026-08-07 |
| AR-30-02 | T-30-05, T-30-09 | Static, build-time-only values (CSS custom property default, manifest color literals) with no user input path — a wrong value is cosmetic-only, not a security issue. | Plan authors (30-02-PLAN.md, 30-03-PLAN.md) | 2026-08-07 |
| AR-30-03 | T-30-06 | Playwright `page.route` delay exists only inside a test spec file; no production runtime attack surface. | Plan authors (30-02-PLAN.md) | 2026-08-07 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-07 | 12 | 12 | 0 | /gsd-secure-phase orchestrator (L1 grep-depth, ASVS level 1, plan-time register — auditor short-circuit per workflow Step 3) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-07
