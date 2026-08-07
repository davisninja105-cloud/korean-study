---
status: diagnosed
trigger: "G-31-2: On mobile, the Cards/Reading Practice segmented toggle (and possibly the sticky search/filter header) scrolls out of view when the user scrolls down a group's list, making it impossible to switch tabs without first scrolling back to the top."
created: 2026-08-07T00:00:00Z
updated: 2026-08-07T00:15:00Z
---

## Current Focus

hypothesis: CONFIRMED — the Cards/Reading Practice segmented toggle `<div>` in components/CardsClient.tsx (~line 1337) has no `sticky`/`fixed` positioning at all; only the search+filter bar above it (~line 1292) carries `sticky top-0 z-10`. On a short mobile viewport the toggle scrolls out of the viewport with the card rows, leaving no way to switch tabs without scrolling back to the top.
test: n/a — root-cause-only mode, no fix applied
expecting: n/a
next_action: none — diagnosis complete, returning ROOT CAUSE FOUND to caller

## Symptoms

expected: Scroll partway down the Cards tab's Vocabulary group, switch to Reading Practice, scroll it, switch back to Cards. Both views restore their exact pre-switch scroll offset; neither view re-fetches or loses already-loaded rows.
actual: "this isn't possible on mobile, the Reading Practice and Cards headers disappear when you scroll" — sticky top bar (search input + view toggle) scrolls off-screen when scrolling down within the Vocabulary group, so the user cannot switch tabs without first scrolling back to the top.
errors: None reported
reproduction: Test 2 in Phase 31 UAT (.planning/phases/31-cards-list-pagination-virtualization/31-UAT.md) — on a mobile viewport, open /cards, scroll down within the Vocabulary group so the sticky top bar (search input + view toggle) scrolls off-screen, then try to tap into Reading Practice.
started: Discovered during UAT for phase 31 (cards list pagination/virtualization), 2026-08-07 — need to determine if this is a phase 31 regression or pre-existing

## Eliminated

- hypothesis: This is a regression introduced by Phase 31's virtualization work (a sticky class was accidentally dropped from the toggle when the DOM structure was reshaped for react-virtuoso).
  evidence: Diffed CardsClient.tsx against pre-Phase-31 commit `fbcc95e` (last commit before `6cedee0 feat(31-01)`). The pre-Phase-31 markup has the IDENTICAL structure — `sticky top-0 z-10` only on the search+action bar div, and the view-toggle div (`<div className="flex bg-surface-3 rounded-lg p-1 self-start">`) has never carried any sticky/fixed class, going back to the file's introduction. The toggle was never sticky at any point in git history.
  timestamp: 2026-08-07T00:10:00Z

- hypothesis: An ancestor container (layout.tsx `<main>`, `<body>`, FreshnessWatcher/GlossProvider wrappers) has `overflow:hidden`/`overflow:auto`/a `transform` that breaks the sticky containing-block for everything inside `/cards`, causing BOTH the search bar and the toggle to fail to stick.
  evidence: Read app/layout.tsx fully — `<body className="min-h-full flex flex-col">` and `<main className="flex-1 max-w-2xl mx-auto w-full px-4 pt-8 pb-...">` have no overflow/transform/filter/contain/will-change properties. FreshnessWatcher.tsx and GlossProvider.tsx render no extra wrapping `<div>` with such properties around `{children}` (FreshnessWatcher is a context-only wrapper; GlossProvider's own portal-rendered popover doesn't wrap the tree). grep for "sticky\|overflow" in app/globals.css returned zero matches — no global CSS overrides `.sticky` behavior or sets overflow on `html`/`body`. Ruled out as a contributing cause to the specific reported symptom (see note below on a related-but-distinct z-index collision).
  timestamp: 2026-08-07T00:12:00Z

## Evidence

- timestamp: 2026-08-07T00:05:00Z
  checked: components/CardsClient.tsx full render output (lines 1288-1360)
  found: |
    Two adjacent top-level elements after the outer `<div className="flex flex-col gap-4">`:
      1. `<div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-background border-b border-border/60">` — the search input + filter icon + Add Card button. HAS sticky positioning.
      2. `<div className="flex bg-surface-3 rounded-lg p-1 self-start">` — the "Cards (N)" / "Reading practice" segmented toggle rendered by `switchView()`. NO sticky/fixed class — a plain in-flow block.
    Below both sits the (now window-scrolled, virtualized) `<Virtuoso useWindowScroll data={rows} .../>` card list.
  implication: As the page scrolls down within the Virtuoso-rendered, window-scrolling card list, the toggle (item 2) scrolls up and out of the viewport along with the card rows, because nothing pins it. The search bar (item 1) is correctly marked sticky and should remain visible on its own. This matches the reported symptom precisely — the user describes the "Reading Practice and Cards headers" (the toggle's two labels) disappearing, which is exactly what an un-stickied toggle does.

- timestamp: 2026-08-07T00:08:00Z
  checked: git history of components/CardsClient.tsx — `git show fbcc95e:components/CardsClient.tsx` (last commit before Phase 31's first commit `6cedee0`)
  found: Identical sticky/non-sticky split existed pre-Phase-31 — sticky search bar, non-sticky view-toggle div, directly above a plain (non-virtualized) card list rendered in normal document flow under window scroll.
  implication: The missing sticky positioning on the toggle is NOT a regression introduced by Phase 31's pagination/virtualization work. It is a pre-existing structural gap. What Phase 31 changed is scale: the Vocabulary group now auto-loads hundreds of rows via cursor pagination + `react-virtuoso`, so a mobile user now routinely scrolls far enough, and far more easily/quickly, to lose the toggle — previously this may rarely have been exercised or noticed with smaller decks. Phase 31's own D-08 UAT test ("scroll partway down... then switch tabs") is precisely the workflow that surfaces this now-blocking gap.

- timestamp: 2026-08-07T00:14:00Z
  checked: components/Nav.tsx (root layout's persistent nav) and app/layout.tsx
  found: |
    Nav.tsx's top `<header>` (brand name + settings gear, visible at ALL viewport sizes including mobile) is ALSO `sticky top-0 z-10` and renders as a DOM sibling BEFORE `<main>{children}</main>` in app/layout.tsx. CardsClient's own search+action bar is a second, separate `sticky top-0 z-10` element rendered inside `<main>`, i.e. AFTER the Nav header in DOM order.
  implication: This is a secondary, distinct issue from the primary bug — two independent sticky elements both anchored to `top: 0` (rather than the second being offset by the first header's height, e.g. `top-14`) means that once scrolled, CardsClient's search bar's stuck position visually collides/overlaps with Nav's header instead of docking neatly beneath it. Because the search bar paints later in DOM order (same z-index, same stacking level) it visually covers the Nav header once both are pinned. This does not itself explain "headers disappear" (the search bar itself does remain visible — it just overlaps Nav's header) — it's a related layering rough edge worth fixing alongside the primary bug, not the cause of the reported symptom.

## Resolution

root_cause: "The Cards/Reading Practice segmented view-toggle `<div>` in components/CardsClient.tsx (~line 1337, `<div className=\"flex bg-surface-3 rounded-lg p-1 self-start\">`) has no `position: sticky` (or fixed) styling — only the search+filter bar directly above it (~line 1292) carries `sticky top-0 z-10`. On a mobile viewport, as the user scrolls down within a group's (now virtualized, window-scrolled via react-virtuoso `useWindowScroll`) card list, the toggle scrolls out of the viewport along with the list content, leaving no way to switch to Reading Practice (or back to Cards) without first scrolling all the way back to the top. Confirmed via git history (commit fbcc95e, pre-Phase-31) that this non-sticky structure predates Phase 31 — it is not a virtualization regression, but Phase 31's pagination/auto-load work (hundreds of rows now load into the Vocabulary group) makes deep scrolling routine on mobile, surfacing this pre-existing structural gap as a blocking issue exactly where the D-08 UAT test (scroll partway down, then switch tabs) exercises it. A secondary, distinct rough edge was also found: CardsClient's sticky search bar and Nav.tsx's persistent top `<header>` are both independently `sticky top-0` (not stacked with an offset), causing them to visually overlap once both are pinned — worth addressing in the same fix pass but not the cause of the reported symptom."
fix: (not applied — goal: find_root_cause_only)
verification: (not applicable — root-cause-only mode)
files_changed: []
