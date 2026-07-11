/**
 * Tab/PWA resume simulator (D-08). Exact verbatim port of
 * scripts/diagnose-freshness.mts:468-477 — overrides BOTH `document.hidden`
 * AND `document.visibilityState` before dispatching a `visibilitychange`
 * event, since `StudySession.tsx`'s existing listener reads
 * `visibilityState` specifically (25-RESEARCH.md Pitfall 2), while other
 * resume-detection code (if any) might read `hidden`. Overriding only one
 * property would under-simulate a real resume for whichever code path reads
 * the other.
 */

import type { Page } from '@playwright/test'

export async function simulateResume(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'hidden', { value: h, configurable: true })
    Object.defineProperty(document, 'visibilityState', {
      value: h ? 'hidden' : 'visible',
      configurable: true,
    })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)
}
