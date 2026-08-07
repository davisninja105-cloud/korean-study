---
schema_version: 1
open_count: 3
waived_count: 0
fixed_count: 3
total_count: 6
last_updated: 2026-08-07T19:27:17.899Z
---

# Broken Windows Ledger

> Cross-phase defect register. `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 31 | deviation | components/CardsClient.tsx |  | CARDS-02: keyboard Tab navigation does not correctly reach card rows/Edit controls inside the virtualized Vocabulary group (human-verified 2026-08-07, explicitly deferred as non-blocker by user decision) | open |  | 2026-08-07T16:43:20.250Z |  |
| 2 | 31 | stub | components/CardsClient.tsx |  | Reading Practice tab always shows empty state — temporarily sourced from groups.vocabulary.loaded, which never carries sentences post-CARDS-01; real fix (D-07 independent fetch) lands in 31-04 | fixed |  | 2026-08-07T16:43:30.024Z | 2026-08-07T19:27:09.829Z |
| 3 | 31 | stub | components/CardsClient.tsx |  | Search box does not match inside example sentences (client-side-only filter over sentence-free cards); server-side D-05 sentence search lands in 31-02 | fixed |  | 2026-08-07T16:43:36.471Z | 2026-08-07T17:19:51.011Z |
| 4 | 31 | stub | components/FreshnessWatcher.tsx |  | FreshnessWatcher's /cards backstop is inert — its Array.isArray(result) check never matches the new CardsPageDTO object shape, so freshCards never delivers; upsert-merge fix lands in 31-04 | fixed |  | 2026-08-07T16:43:39.044Z | 2026-08-07T19:27:09.948Z |
| 5 | 31 | unmet-truth | components/CardsClient.tsx |  | CARDS-02 all-4-groups auto-load/expand not manually spot-checked against the real ~1056-card production deck (8-card e2e fixture too small to exercise a real second page or the Other group meaningfully) — resolve via manual dev-server check per 31-02-SUMMARY.md D3 | open |  | 2026-08-07T17:19:04.547Z |  |
| 6 | 31 | stub | components/CardsClient.tsx |  | ROADMAP Success Criterion 4 ('a collapsed row still shows its reading-practice/sentence count without loading the sentences themselves') is not implemented — card rows carry no per-card sentence-count badge; CARDS-01's sentences-dropped-from-list-select change removed any such signal and no replacement was scheduled in any of 31-01/31-02/31-03/31-04's task lists | open |  | 2026-08-07T19:27:17.899Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "31",
    "file": "components/CardsClient.tsx",
    "line": null,
    "description": "CARDS-02: keyboard Tab navigation does not correctly reach card rows/Edit controls inside the virtualized Vocabulary group (human-verified 2026-08-07, explicitly deferred as non-blocker by user decision)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T16:43:20.250Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "stub",
    "phase": "31",
    "file": "components/CardsClient.tsx",
    "line": null,
    "description": "Reading Practice tab always shows empty state — temporarily sourced from groups.vocabulary.loaded, which never carries sentences post-CARDS-01; real fix (D-07 independent fetch) lands in 31-04",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-07T16:43:30.024Z",
    "resolved_at": "2026-08-07T19:27:09.829Z"
  },
  {
    "id": 3,
    "kind": "stub",
    "phase": "31",
    "file": "components/CardsClient.tsx",
    "line": null,
    "description": "Search box does not match inside example sentences (client-side-only filter over sentence-free cards); server-side D-05 sentence search lands in 31-02",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-07T16:43:36.471Z",
    "resolved_at": "2026-08-07T17:19:51.011Z"
  },
  {
    "id": 4,
    "kind": "stub",
    "phase": "31",
    "file": "components/FreshnessWatcher.tsx",
    "line": null,
    "description": "FreshnessWatcher's /cards backstop is inert — its Array.isArray(result) check never matches the new CardsPageDTO object shape, so freshCards never delivers; upsert-merge fix lands in 31-04",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-08-07T16:43:39.044Z",
    "resolved_at": "2026-08-07T19:27:09.948Z"
  },
  {
    "id": 5,
    "kind": "unmet-truth",
    "phase": "31",
    "file": "components/CardsClient.tsx",
    "line": null,
    "description": "CARDS-02 all-4-groups auto-load/expand not manually spot-checked against the real ~1056-card production deck (8-card e2e fixture too small to exercise a real second page or the Other group meaningfully) — resolve via manual dev-server check per 31-02-SUMMARY.md D3",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T17:19:04.547Z",
    "resolved_at": null
  },
  {
    "id": 6,
    "kind": "stub",
    "phase": "31",
    "file": "components/CardsClient.tsx",
    "line": null,
    "description": "ROADMAP Success Criterion 4 ('a collapsed row still shows its reading-practice/sentence count without loading the sentences themselves') is not implemented — card rows carry no per-card sentence-count badge; CARDS-01's sentences-dropped-from-list-select change removed any such signal and no replacement was scheduled in any of 31-01/31-02/31-03/31-04's task lists",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-08-07T19:27:17.899Z",
    "resolved_at": null
  }
]
````
