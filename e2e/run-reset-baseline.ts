/**
 * CLI wrapper for e2e/seed.ts's resetToBaselineDirect(). Invoked via `tsx`
 * as a subprocess spawned from resetToBaseline() (e2e/seed.ts) — spec files
 * that import resetToBaseline() run inside Playwright's own worker process,
 * where a dynamic import() of lib/prisma.ts (which transitively imports the
 * ESM-only, `import.meta`-using Prisma-generated `app/generated/prisma/
 * client.ts`) throws `SyntaxError: Cannot use 'import.meta' outside a
 * module` — Node's native ESM-to-CJS translator bridge that Playwright's
 * worker hands dynamic imports off to cannot load an import.meta-using
 * module as CJS. `tsx` resolves this correctly (same pattern as
 * e2e/run-global-setup.ts). See e2e/seed.ts's resetToBaseline() doc comment
 * for the full finding.
 */

import { resetToBaselineDirect } from './seed'

resetToBaselineDirect().catch((err) => {
  console.error(err)
  process.exit(1)
})
