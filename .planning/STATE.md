---
gsd_state_version: 1.0
milestone: v1.8
milestone_name: Perceived & Real Performance
current_phase: 33
current_phase_name: version-gated-freshness-backstop
status: executing
stopped_at: Phase 31 UI-SPEC approved
last_updated: "2026-08-09T00:28:24.424Z"
last_activity: 2026-08-08
last_activity_desc: Phase 32 complete, transitioned to Phase 33
progress:
  total_phases: 6
  completed_phases: 3
  total_plans: 17
  completed_plans: 15
  percent: 50
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-06)

**Core value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.
**Current focus:** Phase 33 — version-gated-freshness-backstop

## Current Position

Phase: 33 (version-gated-freshness-backstop) — EXECUTING
Plan: 1 of 2
Status: Executing Phase 33
Last activity: 2026-08-08 — Phase 33 execution started

## Performance Metrics

**Velocity:**

- Prior milestone (v1.7): 2 plans across 1 executed phase (28); Phase 29 archived unexecuted
- Prior milestone (v1.6): 14 plans across 4 phases (24–27), 3 days
- Prior milestone (v1.5): 9 plans across 4 phases (20–23)

**Recent Trend:** —

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full decision log lives in PROJECT.md Key Decisions table and .planning/RETROSPECTIVE.md.

v1.8 roadmap shaping decisions (2026-08-05):

- **P3.0 + P3.1 + P3.5 consolidated into Phase 30.** All three are sub-day tiers on the same cold-path deliverable (feedback within 100ms + nothing avoidable blocking first paint), and none requires architecture the others don't. Splitting them would produce three phases whose success criteria read as tasks. Follows the v1.7 precedent of consolidating a research-suggested split into delivery-coherent phases. P3.5 (region pin) is order-independent — the source plan's strict P3.0→P3.5 sequence is a "may ship independently in this order" statement, not a constraint that forbids grouping.
- **P3.2, P3.3, P3.4 each kept as their own phase (31/32/33).** Each is substantial (half-day to a full day), touches a distinct subsystem (cards list query + client, study-cards pipeline, freshness backstop), and has a self-contained user-observable outcome.
- **P3.6 and P3.7 kept separate (Phases 34/35) despite P3.7 depending on P3.6.** They deliver different user-facing capabilities: Phase 34 is cache-for-speed (instant repeat visits), Phase 35 is offline usability (airplane-mode study + queued reviews that land exactly once). Merging them would produce a multi-day phase whose success criteria span two unrelated failure modes.
- **P3.8 (TTS prefetch) excluded** — explicitly optional in the source plan; tracked as v2 AUDIO-01 in REQUIREMENTS.md.
- **CLEANUP-03 (v1.7 Phase 29) deliberately not folded into v1.8** — distinct subsystem (extraction pipeline, not performance). Remains open and unscheduled.
- **Re-measurement phrasing:** success criteria reference the existing `e2e/perf.spec.ts` median-of-5 budgets at tightened thresholds rather than the source plan's manual ffmpeg frame-diff methodology, which is too heavyweight for automated phase verification. The on-device baseline table stays in ROADMAP.md as the intent anchor.

Phase 30 decisions (2026-08-06):

- **RootLayout unblocked via a `ks_settings` cookie mirror, not a re-architected DB read.** `PUT /api/settings` writes a non-httpOnly cookie carrying only the already-validated button/reward/reading values; a 3rd pre-paint `<script>` applies it before first paint. `httpOnly: false` is deliberate — cosmetic data only, `ks_auth` untouched.
- **New `--skeleton-bg` token instead of raising dark `--surface-3`.** Isolates the fix from `--surface-3`'s 17+ other consumers (Nav, Toast, etc.); reuses the existing dark `--surface-1` shade, no new color invented. Supersedes the original raise-`--surface-3` plan noted below.
- **G-30-2 fixed:** the CR-01 cookie backfill was calling `cookies().set()` from a Server Component's render body (invalid in Next.js 16.2.1 — action-phase only), causing a deterministic production 500 on every `/settings` visit. Moved to a genuine zero-DB `POST /api/settings/backfill-cookie` Route Handler invoked from `SettingsClient.tsx`'s mount effect; a permanent regression-guard test now forbids reintroducing render-body cookie mutation.
- **Vercel region pinned to `pdx1`** via a live `turso db show korean-study` lookup (not guessed) — confirmed an exact AWS `us-west-2` infrastructure match to Turso's reported primary region.

### Pending Todos

None open.

### Blockers/Concerns

- [Phase 33/34] Do NOT delete the `FreshnessWatcher` backstop. It works around a real, unfixed Next.js 16.2.1 Suspense/Segment-Cache bug where routes with a `loading.tsx` fetch a fresh RSC payload and never apply it. Narrow only; re-test after any Next upgrade.
- [Phase 34/35] iOS/WebKit has no Background Sync API. Any deferred flush must fire on the `online` event or on app foreground — registering `sync`/`periodicsync` will silently never fire.
- [Phase 34] Local-first reintroduces the staleness class that `force-dynamic` + `FreshnessWatcher` were added to fix. The five staleness rules from the source plan (classify writes by origin, version-check never TTL, replace layers don't add one, key by build ID, ship a manual escape hatch) are non-negotiable design constraints, not suggestions.
- [carried from v1.7] CLEANUP-03 (distractor write-side retirement) open and unscheduled — Pitfall 8: retire the chain atomically across prompt/schema/DTO/audit/tests in one pass.
- [carried from v1.3] `app/api/review/undo/route.ts` still lacks try/catch — out of scope; deferred candidate.
- [carried from v1.5] 거/게 romanization-flagged card fronts (post-audit cron arrivals) — out of scope; open for a future audit/fix pass.
- [Phase 30 security review] `POST /api/settings/backfill-cookie` type-checks its body but doesn't re-run `HEX_RE` hex-format validation like `PUT /api/settings` does (T-30-10 in `30-SECURITY.md`) — closed as low-severity/self-only (auth-gated, consumed only via `style.setProperty()`, never `innerHTML`/`eval`), but a real asymmetry with the sibling route worth tightening if touched again.

## Deferred Items

Carried forward, informational only:

| Category | Item | Status |
|----------|------|--------|
| cleanup | CLEANUP-03 distractor write-side retirement (v1.7 Phase 29, archived unexecuted) | Open, unscheduled |
| performance | AUDIO-01 / P3.8 TTS prefetch for study sessions | Deferred to v2 |
| hardening | `app/api/review/undo/route.ts` missing try/catch (deferred in Phase 13) | Open |
| feature | Card retirement/mastery flag (MASTERY-01) | Deferred to v2 |
| quality | 거/게 romanization-flagged fronts (post-audit cron arrivals) | Open for future audit/fix pass |
| e2e-v2 | Cards CRUD spec (E2E-08), stubbed sync-route coverage (E2E-09), WebKit project (E2E-10) | Deferred to v2 |
| feature | Remember last-used Passive/Active toggle in localStorage (ACTIVE-06); progressive hint escalation (ACTIVE-07) | Deferred to v2 |
| hardening | `FreshnessWatcher` JSON backstop request-sequencing race (WR-01) — no observed occurrence across 44+ e2e runs; may be resolved incidentally by Phase 33 | Open, non-blocking |
| hardening | `POST /api/settings/backfill-cookie` hex-format validation gap (T-30-10) — type-check only, no `HEX_RE` re-check | Open, non-blocking |

## Session Continuity

Last session: 2026-08-07T06:34:14.777Z
Stopped at: Phase 31 UI-SPEC approved
Resume file: /Users/main/Documents/claude-test/.planning/phases/31-cards-list-pagination-virtualization/31-UI-SPEC.md

## Operator Next Steps

- Plan Phase 31 with `/gsd-plan-phase 31` (Cards List Pagination & Virtualization — P3.2)
- Re-measure the baseline table in ROADMAP.md now that Phase 30 has landed, before Phase 31 work begins
