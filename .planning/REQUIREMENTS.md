# Requirements: Korean Study v1.2 Performance & Snappiness

**Defined:** 2026-06-29
**Core Value:** When you study, what you're meant to learn is always learnable in the moment — prerequisites come first, and new words are shown bare before context.

## v1.2 Requirements

### Loading Skeletons

- [ ] **SKEL-01**: User sees an instant skeleton on navigating to the cards page (no blank flash during route transition)
- [ ] **SKEL-02**: User sees an instant skeleton on navigating to the study page
- [ ] **SKEL-03**: User sees an instant skeleton on navigating to the habits page
- [ ] **SKEL-04**: All skeletons use `bg-surface-2 animate-pulse` design-system tokens (no hardcoded grays)

### Server-Side Data Hydration

- [x] **RSC-01**: Cards page receives initial card list from the server — no "no cards stored yet" flash on first load
- [x] **RSC-02**: Study page receives initial card set from the server — no blank loading phase on first load
- [x] **RSC-03**: Home page receives stats and activity data from the server — no empty hero flash on first load
- [x] **RSC-04**: Habits page receives activity data from the server — no empty heatmap flash on first load
- [x] **RSC-05**: All server-to-client prop boundaries use DTO types (Dates serialized as ISO strings or numbers — no raw Prisma Date objects passed to client components)

### API & DB Optimization

- [x] **DB-01**: `/api/cards/due` runs its three Prisma queries concurrently via `Promise.all` — saves one full Turso round-trip per study session start

### Study Session Interactions

- [x] **UX-01**: Card flip, grade buttons, and audio button during an active study session have no re-fetch or recompute jitter

## Future Requirements

### Performance (deferred)

- **PERF-F1**: Pagination or virtual scroll for the cards list (cards page RSC already removes first-load cost)
- **PERF-F2**: Cross-request `unstable_cache` for DB results (staleness risk outweighs gain for single-user app)
- **PERF-F3**: Move `buttonColor`/`rewardColor` fetch out of `app/layout.tsx` (would require re-architecting pre-paint CSS injection)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Reworking card review units or FSRS algorithm | Core value constraint — out of scope for this app |
| Adding new npm packages | All performance targets achievable with existing Next.js 16 + React 19 stack |
| `unstable_cache` / cross-request caching | Staleness risk; single-user app doesn't benefit |
| Pagination on cards page | RSC conversion eliminates load time; full pagination is a separate project |
| Real-time updates / WebSocket | No requirement for live data; study sessions are atomic |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| SKEL-01 | Phase 9 | Pending |
| SKEL-02 | Phase 9 | Pending |
| SKEL-03 | Phase 9 | Pending |
| SKEL-04 | Phase 9 | Pending |
| RSC-01 | Phase 10 | Complete |
| RSC-05 | Phase 10 | Complete |
| DB-01 | Phase 10 | Complete |
| RSC-02 | Phase 11 | Complete |
| UX-01 | Phase 11 | Complete |
| RSC-03 | Phase 12 | Complete |
| RSC-04 | Phase 12 | Complete |

**Coverage:**

- v1.2 requirements: 11 total
- Mapped to phases: 11
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-29*
*Last updated: 2026-06-29 — traceability aligned to 4-phase roadmap (Phases 9–12)*
