# Phase 35: Service Worker & Offline Review Queue - Context

**Gathered:** 2026-08-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Turn "fast" (Phase 34) into "works without a network":

1. **A versioned service worker precaches the app shell** — JS/CSS bundles, `public/fonts/`, and the icon set. Static assets serve cache-first; `/api/*` serves network-first. A new deploy must replace the cached shell, never keep serving stale JS.
2. **A study session runs entirely on cached cards in airplane mode** — launching the installed PWA with no network must land on a usable mode-select screen and let a full session be graded.
3. **Reviews taken offline persist to IndexedDB and flush exactly once** when the app returns online or is reopened in the foreground — reusing `postReviewWithRetry`'s existing idempotency-key discipline, never the (nonexistent on iOS) Background Sync API.

**Not in scope:** Phase 34's IndexedDB route-DTO cache (already shipped — this phase builds on top of it, doesn't rebuild it). Card-creation offline support (see D-06). Offline-specific copy in the tap-to-gloss popover (see D-05). TTS prefetch (P3.8, explicitly excluded from this milestone).

</domain>

<decisions>
## Implementation Decisions

### Non-negotiable constraint (carried in, not discussed — architecture risk, not a product choice)

- **D-00: The offline review queue's IndexedDB storage must NOT live inside the buildId-namespaced `ks-cache-<buildId>` database `lib/local-cache.ts` (Phase 34) already opens.** That database is deliberately opened fresh (old buildId's database is simply never reopened again) on every new buildId — Phase 34's own D-00 rule 4. That is exactly the trigger a review queue must survive: a deploy landing while a device is offline with unflushed reviews must not silently orphan them in a database keyed to a buildId the app will never open again. The queue needs its own database (or at minimum its own non-buildId-keyed store), opened independently of the version-check/build-ID cache-invalidation logic that governs the route-DTO cache. — **Reversibility:** one-way — if built inside the buildId-namespaced DB and shipped, a real deploy during a real offline session could silently lose already-graded reviews before anyone notices; there's no way to recover data already lost that way after the fact.
  - **Why this wasn't asked as a question:** there is no genuine tradeoff here — building it any other way risks silent data loss for the exact scenario (offline study, deploy lands, reconnect) this phase exists to make safe. Recorded as a locked constraint per the same "carried in" convention Phase 34 used for its own D-00 non-negotiable rules.

### Offline study-pool readiness
- **D-01: Phase 35 adds new proactive prefetch logic for the offline study pool — it does not rely solely on whatever Phase 34's existing per-route cache already captured from the last `/study` visit.** — **Reversibility:** reversible — this is additive fetch logic, not a schema/architecture commitment.
  - **Why:** the user explicitly chose robustness over minimalism here — offline readiness for `/study` should not depend on having happened to open `/study` recently.
- **D-02: The warm runs on every `HomeClient.tsx` mount**, not tied to sync completion. Home is the app's default landing screen and is visited far more often than `/study`, so piggybacking there (alongside the existing `loadStats`/`loadActivity` mount effect) keeps the offline pool fresh from ordinary use without a dedicated new trigger.
- **D-03: The warm fetches exactly the due session** — the same `getStudyCards()` call `/study` already makes (`scope='due'`, capped at `sessionSize`, default 20) — not a bigger "due + ahead" buffer. Matches SC2's "a full study session" literally; a bigger buffer was explicitly declined as scope beyond what OFFLINE-02 asks for.
- **D-04: The warm always fetches the plain, unfiltered "everything" due pool** — it does not read or respect a lesson-range filter the user may have set on `/study`. Avoids new filter-state plumbing between `HomeClient.tsx` and `StudyClient.tsx`, which don't share state today.

### Degraded features offline
- **D-05: TTS and tap-to-gloss keep their existing behavior unchanged.** `AudioButton.tsx`'s `speechSynthesis` fallback is untouched. `GlossProvider.tsx`'s existing generic `"Couldn't find a gloss for X"` message (shown identically on both a genuine not-found and a network/offline failure — confirmed by reading the component) is accepted as-is; no offline-specific copy is added.
  - **Why:** the existing message already says *something* (no crash, no silent failure) — differentiating "offline" from "not found" is gloss-feature polish outside what OFFLINE-01/02/03 ask for.
- **D-06: The `GlossProvider.tsx` "Add as card?" false-positive is explicitly out of scope.** (Found during discussion: tapping "Add as card?" always flips to an "Added" state even when the underlying `POST /api/cards` silently fails — e.g. offline — so the card was never actually created.) Not fixed, not queued in this phase. See Deferred Ideas.

### App-update behavior
- **D-07: A new-deploy-ready state surfaces via a `Toast` ("Update available — tap to refresh"), reusing `components/Toast.tsx`.** Tapping it calls `skipWaiting()` + reload. The service worker must never force-reload the page unprompted, especially mid-study-session.
- **D-08: Dismissing the toast without tapping does not pin the device to the old version.** The waiting service worker still takes over the next time the app is fully closed and relaunched, regardless of dismiss. Bounds staleness to "however long the current session/tab stays open," never indefinite. — **Reversibility:** reversible — purely a `skipWaiting()` timing/trigger choice.
- **D-09: The service worker update check is explicitly triggered (`registration.update()`) on the same foreground-boundary events `components/FreshnessWatcher.tsx` already listens for** (`visibilitychange`/`pageshow`/`online`) — not left to the browser's default per-navigation check alone. Keeps the update-detection cadence consistent with how this codebase already handles "check for change at real resume boundaries," and catches an update the moment a long-backgrounded PWA session resumes rather than waiting for a full navigation to happen to occur.

### Offline queue visibility
- **D-10: Queued-but-not-yet-flushed offline reviews get no new UI.** The existing "Offline" pill (`Nav.tsx`, shipped Phase 34) is the only signal a user gets; reviews queue and flush invisibly on reconnect. — **Reversibility:** reversible — purely additive UI could be layered on later without touching the queue's storage/flush mechanics.
  - **Why:** matches this app's already-established review-save philosophy — grading advances instantly, the background `POST /api/review` save is invisible, and a toast appears *only* when something has actually gone wrong (REVIEW-04's "toast only after retries exhausted" precedent). A live pending-count would be new UI surface area inconsistent with that existing minimalism.
- **D-11: If a queued review ultimately fails to flush permanently** (a 4xx after reconnecting — e.g. the card was deleted while the device was offline), that surfaces via a `Toast`, consistent with REVIEW-04's existing "toast only after retries exhausted" precedent. A silently-dropped offline review would be a real (if rare) data-loss surprise the user has no way to notice otherwise.

### Claude's Discretion
- **Service worker implementation approach** (hand-rolled `Cache`/`fetch` event handling vs. a library like Workbox/Serwist) — no such dependency exists in `package.json` today (confirmed: zero hits for `workbox|serwist|next-pwa`). Research's call, weighed against Next.js 16's Turbopack build (verify library Turbopack-compatibility before committing) and this project's general-but-not-absolute preference for fewer new dependencies (already broken twice in Phase 34 for `idb`/`react-virtuoso` when hand-rolling was materially worse).
- **Exact file/location for the SW registration + update-check + update-toast wiring** (a new `lib/service-worker.ts` + a small mount component/provider, vs. folding into `Nav.tsx` or `FreshnessWatcher.tsx` directly) — architecture call, not a product decision. The codebase's convention of "one small owning file per concern" (e.g. `lib/local-cache.ts`, `lib/usePullToRefresh.ts`) is the relevant precedent.
- **The service worker's own cache-versioning scheme** — whether it keys its `CACHE_NAME` off the same `buildId` `GET /api/version` already exposes (Phase 34), or maintains its own separate version token. Reusing `buildId` avoids inventing a second versioning concept but is a technical integration detail for research to confirm against how service worker registration actually observes a new deploy.
- **Exact offline-queue flush ordering** (strictly sequential to preserve per-card FSRS chronology if the same card was graded twice offline, vs. parallel-with-per-card-locking) — not discussed as a user preference; the source doc's "keep the existing idempotency key so a double flush is harmless" already covers the exactly-once guarantee, ordering-within-a-card is an implementation detail.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap (locked)
- `.planning/REQUIREMENTS.md` §Offline Support (P3.7) — OFFLINE-01, OFFLINE-02, OFFLINE-03 full requirement text
- `.planning/ROADMAP.md` §Phase 35 — Goal, 4 Success Criteria, `Depends on: Phase 34`
- `.planning/ROADMAP.md` §v1.8 milestone-wide constraints (lines ~128-134) — iOS/WebKit standalone PWA is the only target with **no Background Sync API** (any deferred flush must fire on `online` or app-foreground, never rely on background registration); do-not-delete-`FreshnessWatcher`; `react-hooks/purity` strict; no `prisma/schema.prisma` changes needed through Phase 35; Tailwind dark-value mirroring rule (if any new UI token is added)

### Source design doc (background only — fully reflected in REQUIREMENTS.md/ROADMAP.md already)
- `/Users/main/Documents/travel-fun/lag_remediation_plan.md` §P3.7 "Service worker and app shell" (lines 371-396, outside this repo) — origin of "ship a versioned cache name and a clear invalidation path — a stale SW serving stale JS is a worse failure mode than a slow app," the network-first-`/api/*`/cache-first-static split, and "keep the existing idempotency key so a double flush is harmless." Read directly if any ambiguity remains after REQUIREMENTS.md/ROADMAP.md — no new architecture beyond what's already captured there.

### State / accumulated decisions
- `.planning/STATE.md` §Blockers/Concerns — the `[Phase 34/35] iOS/WebKit has no Background Sync API` entry; the do-not-delete-`FreshnessWatcher` entry
- `.planning/STATE.md` §Accumulated Context → Decisions — why P3.6/P3.7 are kept as separate phases (34 = speed via cache, 35 = offline usability)

### Project conventions
- `CLAUDE.md` §RSC server hydration + DTO pattern — the `app/*/page.tsx` / `*Client.tsx` boundary the new Home-mount warm-fetch (D-01–D-04) must live inside (`HomeClient.tsx`), not a new page
- `CLAUDE.md` §Gotchas/conventions — `react-hooks/purity` (no `Date.now()`/`new Date()`/`Math.random()` in render — relevant to any queue-entry timestamp or update-check timer)
- `CLAUDE.md` on `components/StudySession.tsx` — `postReviewWithRetry`'s exact retry/backoff/idempotency-key/permanent-vs-network-failure distinction; the offline queue extends this mechanism (queue-on-permanent-offline-failure), never reimplements it in parallel
- `CLAUDE.md` on `components/FreshnessWatcher.tsx` — the `visibilitychange`/`popstate`/`pageshow` foreground-boundary event pattern D-09 reuses for the SW update check
- `CLAUDE.md` on `components/Toast.tsx` — the existing `role="status" aria-live="polite"` component D-07/D-11 reuse for the update prompt and the permanent-flush-failure notice
- `CLAUDE.md` on `lib/local-cache.ts` (Phase 34) — the buildId-namespaced IndexedDB pattern the review queue's own storage must deliberately NOT inherit unmodified (D-00)

### Prior phase precedent
- `.planning/phases/34-local-first-shell/34-CONTEXT.md` — origin of the "carried in, not discussed, non-negotiable rule" convention this phase's D-00 follows; also documents the five staleness rules (version-check never TTL, build-ID keying, etc.) the review queue's storage design should stay consistent with in spirit
- `.planning/phases/34-local-first-shell/34-PATTERNS.md` — pattern map showing exactly how `lib/local-cache.ts`, the four `*Client.tsx` shells, and `Nav.tsx`'s Offline pill are wired today (describes shipped Phase 34 code; the file itself was still uncommitted as of this session's `git status` but reflects real, executed code)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/local-cache.ts` (Phase 34) — existing buildId-namespaced IndexedDB wrapper (`idb` dependency) with `readCache`/`writeCache`/`patchStudyCard`/etc. The offline review **queue** needs its own database per D-00 — do not extend this module's existing `ks-cache-<buildId>` store — but the `idb`-based wrapper *style* (lazy per-purpose DB open, safe-fallback-to-undefined on any IndexedDB failure) is still the right pattern to mirror for the new queue module.
- `components/StudySession.tsx`'s `postReviewWithRetry` (lines 85-140) — the exact retry/backoff/idempotency-key/permanent-vs-network-failure-distinction logic (`SaveFailureReason = 'network' | 'permanent'`) OFFLINE-03 extends: a `'network'`-classified failure while offline is the trigger to enqueue instead of exhausting retries into a toast.
- `components/Toast.tsx` — reused for both D-07 (update-available prompt) and D-11 (permanent flush failure)
- `components/FreshnessWatcher.tsx` — the `visibilitychange`/`popstate`/`pageshow` event-listener pattern D-09 reuses for the SW update check
- `components/Nav.tsx`'s existing `isOffline` (`navigator.onLine` + `online`/`offline` listeners, added Phase 34) — the exact event pattern the queue-flush trigger (SC4: "the `online` event and the app returning to the foreground") should reuse or sit beside, not reinvent
- `app/manifest.ts` — `background_color`/`theme_color`/`icons` already correct (Phase 30); the SW's precache list needs these icon files plus `public/fonts/*`
- `components/GlossProvider.tsx`'s existing error-state handling (loading → `error: true` → `"Couldn't find a gloss for X"`) — confirmed by reading the component to already degrade reasonably offline; D-05 keeps this untouched
- `app/api/version/route.ts` — already returns `{ version, buildId }` (Phase 34); Claude's Discretion above flags this as the likely source for the SW's own cache-versioning scheme

### Established Patterns
- RSC + client-shell + DTO pattern — the Home-mount warm fetch (D-01/D-02) belongs inside `HomeClient.tsx`'s existing mount effect, not a new page or route
- `react-hooks/purity` — no `Date.now()`/`new Date()`/`Math.random()` in render; any queue-entry timestamp write or update-check scheduling belongs in an effect or event handler
- Cancellation-guarded async mount effects (`let cancelled = false` / `if (cancelled) return`) — established in `FreshnessWatcher.tsx`/`HomeClient.tsx`; the new warm-fetch effect should follow the same idiom
- Bounded silent-retry with permanent-vs-network failure distinction (`postReviewWithRetry`) — the direct model for how the offline queue should decide "enqueue" vs. "let the existing retry-then-toast path handle it"

### Integration Points
- `components/HomeClient.tsx`'s mount effect — where the study-pool warm fetch (D-01–D-04) hooks in, alongside the existing `loadStats`/`loadActivity` calls
- `components/StudySession.tsx`'s `submitReview` — where offline detection + "queue instead of POST" logic hooks in, parallel to the existing `postReviewWithRetry` call site (line ~483)
- `components/Nav.tsx` — home of the existing Offline pill (D-10 keeps it as the only offline signal); also a candidate location for the SW registration/update-check listeners, though the exact file is Claude's Discretion
- `app/api/version/route.ts` (`buildId` field, Phase 34) — the natural source for the SW's own cache-versioning scheme (Claude's Discretion)
- `app/api/review/route.ts` — already fully idempotent via `idempotencyKey` (transaction-scoped `ReviewLog` unique constraint + P2002/`isUniqueConstraintError` catch) — **no server-side changes needed** for OFFLINE-03; the queue purely needs to keep calling this same endpoint with the same idempotency key on flush

</code_context>

<specifics>
## Specific Ideas

No additional specific references beyond the decisions above — discussion covered all 4 gray areas the user selected (offline study-pool readiness, degraded features offline, app-update behavior, offline queue visibility). The roadmap-locked success criteria (precache list, cache-first/network-first split, exactly-once flush verified against `ReviewLog`/the review counter rather than the UI, `online` + app-foreground flush triggers, no Background Sync API) were treated as locked requirements, not discussable gray areas.

</specifics>

<deferred>
## Deferred Ideas

- **`GlossProvider.tsx`'s "Add as card?" false-positive** (always shows "Added" even when the underlying `POST /api/cards` silently fails, e.g. offline) — explicitly declined for this phase (D-06); a small, contained future fix (stop optimistically showing "Added" before the POST resolves) if it's ever worth doing, distinct from adding full offline queueing for card creation.
- **Offline-specific copy in the tap-to-gloss popover** ("Unavailable offline" vs. the existing generic "Couldn't find a gloss") — considered and declined (D-05); revisit only if it becomes a real point of confusion in practice.
- **A live "N pending sync" queued-review indicator** — considered and declined in favor of full silence (D-10); revisit if force-quit/offline usage in practice makes users anxious about whether grading actually "took."
- **Proactively warming a bigger "due + ahead" buffer** (beyond the single due session, D-03) — considered and declined as unnecessary scope for a first offline pass; revisit if real offline usage spans multiple sessions per outage (e.g. a long flight).

</deferred>

---

*Phase: 35-service-worker-offline-review-queue*
*Context gathered: 2026-08-10*
