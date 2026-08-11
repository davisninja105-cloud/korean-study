# Phase 35: Service Worker & Offline Review Queue - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-10
**Phase:** 35-service-worker-offline-review-queue
**Areas discussed:** Offline study-pool readiness, Degraded features offline, App-update behavior, Offline queue visibility

---

## Offline study-pool readiness

| Option | Description | Selected |
|--------|-------------|----------|
| Rely on Phase 34's cache as-is | No new prefetch logic — whatever session was last loaded/cached while online is what's available offline | |
| Proactively warm a fuller pool | New logic to pre-fetch a due-card buffer beyond what mode-select naturally touches | ✓ |

**User's choice:** Proactively warm a fuller pool
**Notes:** Follow-up narrowed the warm's trigger, size, and filter scope.

| Option | Description | Selected |
|--------|-------------|----------|
| On every Home page mount | Piggyback on HomeClient.tsx's existing mount effect | ✓ |
| Only right after a successful sync completes | Ties warming to "data actually changed" | |
| Both: on Home mount AND after sync | Belt-and-suspenders | |

**User's choice:** On every Home page mount

| Option | Description | Selected |
|--------|-------------|----------|
| Just the due session | Same getStudyCards() call /study makes, scope='due', capped at sessionSize | ✓ |
| Due + ahead (bigger buffer) | Also fetch the study-ahead pool for a longer offline stretch | |

**User's choice:** Just the due session

| Option | Description | Selected |
|--------|-------------|----------|
| Unfiltered "everything" pool | Simplest, matches default /study behavior, no new state plumbing | ✓ |
| Respect the last-used /study filter | Requires persisting filter state between HomeClient and StudyClient | |

**User's choice:** Unfiltered "everything" pool

---

## Degraded features offline

| Option | Description | Selected |
|--------|-------------|----------|
| Leave as-is | Existing generic gloss error message already covers offline reasonably | ✓ |
| Add offline-specific copy | Differentiate "unavailable offline" from generic not-found | |

**User's choice:** Leave as-is

| Option | Description | Selected |
|--------|-------------|----------|
| Out of scope | OFFLINE-01/02/03 are about shell + review queue, not card creation | ✓ |
| Fix the false-positive only (no queueing) | Stop optimistically showing "Added" before the POST resolves | |

**User's choice:** Out of scope
**Notes:** Found during discussion (not a pre-existing known issue): GlossProvider.tsx's "Add as card?" always shows "Added" even if the POST silently fails offline.

---

## App-update behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Toast prompt: "Update available — tap to refresh" | Reuses Toast.tsx; tap calls skipWaiting()+reload; never interrupts a session uninvited | ✓ |
| Silent apply on next natural reopen | No visible prompt; SW takes over on next full close/reopen | |
| Force reload immediately when idle | Auto-reload when the app isn't mid-card | |

**User's choice:** Toast prompt: "Update available — tap to refresh"

| Option | Description | Selected |
|--------|-------------|----------|
| Apply on next relaunch regardless of dismiss | Dismissing just means "not right now"; update still applies on next full close/reopen | ✓ |
| Dismiss = stay on this version until re-prompted | Old SW keeps control until the user explicitly taps update | |

**User's choice:** Apply on next relaunch regardless of dismiss

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — explicit registration.update() on foreground/online | Hooks the same visibilitychange/pageshow/online boundaries FreshnessWatcher already uses | ✓ |
| No — rely on the browser's built-in check | Simpler, but a long-backgrounded PWA might miss the update prompt | |

**User's choice:** Yes — explicit registration.update() on foreground/online

---

## Offline queue visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Fully silent — the existing Offline pill is enough | No new UI; matches the app's established optimistic/silent review-save philosophy | ✓ |
| Live count next to the Offline pill | e.g. "Offline · 3 pending" | |
| One-time toast when the flush completes | "3 reviews synced" toast, no persistent counter | |

**User's choice:** Fully silent — the existing Offline pill is enough

| Option | Description | Selected |
|--------|-------------|----------|
| Toast on permanent failure | Consistent with REVIEW-04's toast-only-after-retries-exhausted precedent | ✓ |
| Stay fully silent, always | No signal even on a permanent failure | |

**User's choice:** Toast on permanent failure

---

## Claude's Discretion

- Service worker implementation approach (hand-rolled vs. Workbox/Serwist), weighed against Next.js 16 Turbopack compatibility
- Exact file/location for SW registration + update-check + update-toast wiring
- The service worker's own cache-versioning scheme (reuse `/api/version`'s `buildId` vs. a separate token)
- Exact offline-queue flush ordering (sequential vs. parallel-with-locking)

## Deferred Ideas

- `GlossProvider.tsx`'s "Add as card?" false-positive on a failed/offline POST — future small fix, not this phase
- Offline-specific copy in the tap-to-gloss popover — declined, revisit only if it becomes a real point of confusion
- A live "N pending sync" queued-review indicator — declined in favor of full silence, revisit if real usage suggests anxiety about whether grading "took"
- Proactively warming a bigger "due + ahead" buffer beyond a single session — declined as unnecessary scope for a first offline pass
