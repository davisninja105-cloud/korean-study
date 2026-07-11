/**
 * Retry-safe per-route DOM readers (D-05, D-09). Ported from
 * scripts/diagnose-freshness.mts:481-568, trimmed per 25-RESEARCH.md
 * "Ambiguity 3" (selector fragility vs. semantic-token anchoring). Shared by
 * e2e/smoke.spec.ts (this plan) and Plan 03's freshness-regression specs —
 * every reader below resolves to a plain string and never throws, so callers
 * can call expect() on the result directly.
 */

import type { Page } from '@playwright/test'

/**
 * Robust "is this locator showing up" check. A bare `.count()` snapshot
 * check is a single synchronous DOM query — it does NOT retry, so a reader
 * called a beat too early (React still mid-commit after an App Router
 * soft-navigation transition, which this app wraps in startTransition) can
 * observe zero matches even though the exact same element is present a few
 * milliseconds later. `waitFor({ state: 'visible' })` uses Playwright's real
 * actionability polling loop instead of a single snapshot, giving the
 * transition time to settle while still resolving to `false` (not throwing)
 * if the element genuinely never appears — preserving the non-throwing
 * contract every reader below depends on.
 */
export async function waitVisible(locator: ReturnType<Page['locator']>, timeout = 5000): Promise<boolean> {
  try {
    await locator.first().waitFor({ state: 'visible', timeout })
    return true
  } catch {
    return false
  }
}

/**
 * Debug aid: when a reader can't locate its expected DOM anchor, dump the
 * page's URL + a truncated body-text snapshot so "(unrecognized state)" is
 * diagnosable evidence rather than an opaque dead end.
 */
export async function dumpUnrecognizedState(page: Page, readerName: string): Promise<void> {
  const url = page.url()
  const bodyText = (await page.locator('body').innerText().catch(() => '(could not read body)')).slice(0, 400)
  console.log(`    [debug] ${readerName}: unrecognized state at url=${url}`)
  console.log(`    [debug] ${readerName}: body text snapshot: ${JSON.stringify(bodyText)}`)
}

/**
 * Home due-count reader. Selector TRIMMED per Ambiguity 3: anchors on
 * `span.text-reward` only (drops `.text-6xl`, a presentational class not
 * part of this project's documented semantic-token contract — CLAUDE.md
 * "Color system & theming").
 */
export async function readHomeState(page: Page): Promise<string> {
  const countLocator = page.locator('span.text-reward')
  if (await waitVisible(countLocator)) {
    return ((await countLocator.first().textContent({ timeout: 10_000 })) ?? '').trim()
  }
  if (await waitVisible(page.getByText('Goal met today'), 1500)) return 'zero-due-state'
  if (await waitVisible(page.getByText('All caught up'), 1500)) return 'zero-due-state'
  await dumpUnrecognizedState(page, 'readHomeState')
  return '(unrecognized state)'
}

/**
 * Study select-mode due-count reader.
 *
 * KNOWN-FRAGILE LOCATOR (25-RESEARCH.md Ambiguity 3): `p.text-5xl.font-bold.
 * animate-reveal` is 100% presentational — no semantic-token class
 * (text-reward / bg-surface-*) exists on this element per
 * components/StudyClient.tsx:251, so this locator has no stable-token
 * anchor to fall back to and stays a straight port. Accepted as a known
 * limitation for this phase; a future phase adding `data-testid` attributes
 * would close this gap cleanly.
 */
export async function readStudySelectModeState(page: Page): Promise<string> {
  const countLocator = page.locator('p.text-5xl.font-bold.animate-reveal')
  if (await waitVisible(countLocator)) {
    return ((await countLocator.first().textContent({ timeout: 10_000 })) ?? '').trim()
  }
  if (
    await waitVisible(
      page.getByText(/No cards due for review right now\.|All caught up in this range!/),
      1500
    )
  ) {
    return 'zero-due-state'
  }
  await dumpUnrecognizedState(page, 'readStudySelectModeState')
  return '(unrecognized state)'
}

/**
 * Cards toggle reader. Already role-based, zero class dependency — no trim
 * needed per Ambiguity 3.
 */
export async function readCardsCount(page: Page): Promise<string> {
  const btn = page.getByRole('button', { name: /^Cards \(\d+\)$/ })
  if (!(await waitVisible(btn))) {
    await dumpUnrecognizedState(page, 'readCardsCount')
    return '(unrecognized state)'
  }
  return ((await btn.first().textContent({ timeout: 10_000 })) ?? '').trim()
}

/**
 * Habits mastered-count reader. Anchors on the Proficiency panel root
 * (`bg-surface-1` semantic token + `hasText: 'Proficiency'`), then the sole
 * `p.text-2xl.font-bold` inside it — the band label at
 * components/ProficiencyArc.tsx:73 is a `<span>`, not a `<p>`, so it cannot
 * collide with this locator.
 */
export async function readHabitsMasteredCount(page: Page): Promise<string> {
  const root = page
    .locator('div.bg-surface-1.rounded-2xl.shadow-md.p-6.flex.flex-col.gap-4', { hasText: 'Proficiency' })
    .first()
  if (!(await waitVisible(root))) {
    await dumpUnrecognizedState(page, 'readHabitsMasteredCount (root)')
    return '(unrecognized state)'
  }
  const el = root.locator('p.text-2xl.font-bold').first()
  if (!(await waitVisible(el))) {
    await dumpUnrecognizedState(page, 'readHabitsMasteredCount (el)')
    return '(unrecognized state)'
  }
  return ((await el.textContent({ timeout: 10_000 })) ?? '').trim()
}
