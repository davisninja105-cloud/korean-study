# Coding Conventions
_Last updated: 2026-06-23_

## Summary

This is a Next.js 16 App Router project written in strict TypeScript with Tailwind CSS v4. Code is organized into `lib/` (pure business logic), `components/` (React UI), and `app/` (routes and API handlers). The codebase enforces a hard distinction between server-only and client-only code, strict React hooks purity rules, and semantic CSS tokens over literal color utilities. ESLint (`eslint-config-next` core-web-vitals + TypeScript) runs with zero errors as the baseline.

---

## File and Folder Naming

- **Files:** `kebab-case` for all `.ts`, `.tsx`, `.mjs`, `.mts` files (e.g., `card-key.ts`, `sentence-match.ts`, `GlossProvider.tsx`).
- **Components:** PascalCase filenames matching the default export (e.g., `Sheet.tsx` exports `Sheet`, `AudioButton.tsx` exports `AudioButton`).
- **API routes:** Next.js App Router convention — `app/api/<resource>/route.ts`; nested resources use `app/api/<resource>/[id]/route.ts`.
- **Scripts:** `scripts/` directory, `.mjs` for plain JS operational scripts, `.mts` for TypeScript scripts that import `lib/` modules (e.g., `local-resync.mts`).
- **Directories:** `kebab-case` throughout (`app/`, `lib/`, `components/`, `scripts/`, `prisma/`).

---

## Component Patterns

### Client vs. Server Boundary

- Client components **always** declare `'use client'` as the very first line — before any imports (e.g., `StudySession.tsx`, `Sheet.tsx`, `GlossProvider.tsx`).
- Server components (page.tsx files, API route handlers) have **no** `'use client'` directive and may call `prisma`, `lib/settings.ts`, or other server-only code directly.
- `lib/` modules that are server-only (Prisma, Anthropic SDK calls) carry a comment: `// No 'use client' — this module runs server-side only.`
- Modules shared across both environments must be pure (no Prisma, no Node builtins). Example: `lib/card-key.ts`, `lib/sequence.ts`, `lib/habit.ts`, `lib/palettes.ts`.

### Props Interfaces

- Props are typed via inline `interface Props { … }` directly above the component function (not `type`).
- The interface is always named `Props`, not `ComponentNameProps`.
- Example from `Sheet.tsx`:
  ```tsx
  interface Props {
    open: boolean
    onClose: () => void
    title?: string
    children: React.ReactNode
  }
  export default function Sheet({ open, onClose, title, children }: Props) { … }
  ```

### Local Types Within Components

- Component-local types (not exported) use `interface` and are declared near the top of the file before the component.
- Example from `StudySession.tsx`:
  ```tsx
  interface Sentence { id: string; korean: string; targetForm: string; translation: string }
  interface Card { id: string; type: string; front: string; … }
  ```

### Default vs. Named Exports

- React components: always `export default function ComponentName`.
- Library functions: named exports (`export function`, `export const`, `export interface`).
- No barrel `index.ts` files — every import references the source file directly.

---

## TypeScript Usage

- **Strict mode is on** (`"strict": true` in `tsconfig.json`). All code must satisfy `noImplicitAny`, `strictNullChecks`, etc.
- **Path alias:** `@/*` maps to the project root. All intra-project imports use `@/` (e.g., `import { prisma } from '@/lib/prisma'`). Relative imports (`./`) are used only within the same directory.
- **Type assertions (`as`):** Used narrowly when reconstructing third-party types (e.g., FSRS), always accompanied by a comment explaining why.
- **Non-null assertions (`!`):** Used only when the null case has been ruled out by preceding logic, never blindly.
- **Interfaces over `type` aliases:** Preferred for object shapes. `type` is used for unions, tuples, and utility-type aliases.
- **`null` vs `undefined`:** Database nullable fields are typed `… | null`. Optional props use `?` (which is `T | undefined`). Do not conflate the two.

---

## CSS and Styling

### Tailwind v4 Utility Classes

- Tailwind v4 is imported via `@import "tailwindcss"` in `app/globals.css` (not a `tailwind.config.js`).
- Custom semantic tokens are registered with `@theme inline` and exposed as Tailwind utilities (e.g., `bg-surface-1`, `text-cat-vocab`, `bg-reward`).
- **Never** use literal color utilities like `bg-orange-500` or `text-blue-400` for semantic roles. Use the token utilities instead.

### Semantic CSS Tokens (defined in `app/globals.css`)

| Token | Purpose |
|---|---|
| `--surface-1` / `bg-surface-1` | Elevated card, sheet, nav — most prominent |
| `--surface-2` / `bg-surface-2` | Quiet recessed strip or tile |
| `--surface-3` / `bg-surface-3` | Deep well / page background |
| `--button` / `--button-foreground` | Action color (user-configurable) |
| `--reward` / `--reward-foreground` | Reward/streak color (user-configurable) |
| `--reward-soft` | Partial-progress tier (bars, heatmap) |
| `--highlight-bg` / `--highlight-fg` | Korean sentence targetForm highlight |
| `--cat-vocab` / `--cat-grammar` / `--cat-phrase` | Card type taxonomy colors |

### Dark Mode

- Dark mode is a **manual toggle** (System / Light / Dark) stored in `localStorage` key `theme`.
- `data-theme="dark"` is set on `<html>` by a pre-paint inline `<script>` in `app/layout.tsx` (no flash; `<html suppressHydrationWarning>`).
- Tailwind's `dark:` variant is rebound to `[data-theme="dark"]` via `@custom-variant dark` in `globals.css`.
- **When adding a dark value:** mirror it in BOTH the `@media (prefers-color-scheme: dark)` `:root` block AND the `:root[data-theme="dark"]` block in `globals.css`.

### Font

- `'Pretendard Variable'` is the primary font (self-hosted WOFF2 in `public/fonts/`). Referenced via `--font-korean` CSS variable.

---

## Import Ordering

Imports within a file follow this order (no enforced blank-line grouping, but convention is consistent):

1. React hooks (`import { useState, useEffect, … } from 'react'`)
2. Next.js utilities (`import { NextRequest, NextResponse } from 'next/server'`)
3. Third-party packages (`import Anthropic from '@anthropic-ai/sdk'`)
4. Internal `lib/` modules (`import { prisma } from '@/lib/prisma'`)
5. Internal `components/` modules (`import Sheet from './Sheet'`)

---

## Error Handling

### API Routes

- All route handlers wrap their body in `try { … } catch (e) { return NextResponse.json({ error: … }, { status: 500 }) }`.
- Validation errors return `{ status: 400 }` with a descriptive message before hitting business logic.
- Example pattern:
  ```ts
  export async function POST(req: NextRequest) {
    try {
      const { documentId } = await req.json()
      if (!documentId) return NextResponse.json({ error: 'documentId is required' }, { status: 400 })
      // …
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 })
    }
  }
  ```

### Library Modules

- Pure library functions throw on unexpected input; callers handle the error.
- `try/catch` in library code is only used when recovering gracefully (e.g., `getButtonColor()` in `lib/settings.ts` catches Prisma errors and returns the default color).
- JSON parse calls are always wrapped in `try/catch` (e.g., `getCachedGloss` in `lib/gloss.ts`).

### LLM / External API Calls

- LLM responses are validated immediately after receipt (check `content[0].type !== 'text'`; regex-extract JSON before `JSON.parse`).
- TTS and Blob failures degrade gracefully: `/api/tts` returns `503` and `AudioButton` falls back to `window.speechSynthesis`.

---

## Async Patterns

- `async/await` throughout — no `.then()` chains except in specific ESLint-safe scenarios (e.g., non-blocking cache writes).
- `Promise.allSettled()` is used when processing a batch where individual failures should not abort the whole batch (e.g., `extractResults` in `app/api/sync/route.ts`).
- Non-blocking writes use `.catch(() => {})` or `.then(() => {})` patterns to avoid the ESLint `no-floating-promises` rule.
- `fetch` in client components always uses `async/await` inside event handlers or `useEffect`, never bare in render.

---

## React Hooks Purity Rules (Critical)

The `eslint-config-next` `react-hooks/purity` rule enforces that render functions are **pure** — no side-effectful calls.

**Forbidden in render / component body:**
- `Date.now()`, `new Date()` (no-arg), `Math.random()` — all are impure.
- Any `setState` call synchronously inside an `useEffect` body.

**Required patterns:**
- Read time in effects or event handlers, or pass a stable value as a prop/seed.
- For deterministic randomness during render, use a seeded pseudo-RNG (see `seededShuffle` in `components/StudySession.tsx`).
- `previewIntervalLabels` in `lib/fsrs.ts` documents this with: `// Must be called from event handlers, not during render.`

---

## Comment and Documentation Style

### JSDoc / Block Comments

- Public library functions that are the single source of truth for a behavior get a leading block comment explaining their contract, inputs, rules, and call sites.
- Example (`lib/card-key.ts`): a full JSDoc block listing rules, the "No side-effects" guarantee, and where the function is used.
- Example (`lib/sequence.ts`): header comment explains the scoring formula, constants, and cycle-safety guarantee before the first line of code.

### Inline Comments

- Used to explain non-obvious decisions, not to restate what the code does.
- Temporal/historical context uses present tense ("A card is still due today iff …").
- Deprecated items are marked with `/** @deprecated — … */` (e.g., `DEFAULT_BUTTON_COLOR` in `lib/settings.ts`).

### Constants

- Module-level constants that affect behavior are declared at the top of the file with an explanatory comment.
  ```ts
  const URGENCY_SCALE = 7   // days overdue per depth level
  const MAX_BOOST     = 3   // max depth levels a card can climb via urgency
  ```

---

## Key Gotchas

1. **Vercel 60s timeout:** The Hobby plan hard-limits serverless functions at 60 seconds regardless of `maxDuration`. Keep each sync to `MAX_LESSONS_PER_SYNC = 1`. Bulk ops must use `scripts/local-resync.mts` locally.

2. **Turso schema migrations:** `prisma db push` and `prisma migrate` do NOT work against Turso (`libsql://`). Schema changes require manual DDL via `@libsql/client executeMultiple()`. See `CLAUDE.md` for the exact procedure.

3. **`normalizedFront` is the dedup key:** `lib/card-key.ts:normalizeFront()` is the single source of truth. Use it whenever checking if two card fronts are the same. The `Card.normalizedFront` column has a `@unique` constraint in the DB.

4. **Habit dates are NOT UTC dates:** Use `habitDateStr(hour)` from `lib/habit.ts` for activity logging, never raw `localDateStr()`. The habit day starts at a configurable hour (default 2 AM).

5. **`splitParticle` is conservative:** The particle splitter in `lib/sentence-match.ts` is intentionally conservative. Known orthographic ambiguity: multi-syllable verb stems + modifier endings (e.g., `기다리는`) can mis-split.

6. **Theme is client-only:** The light/dark theme preference is stored in `localStorage`, not the DB. `buttonColor` and `rewardColor` are DB settings. Do not conflate the two.

7. **`'use client'` placement:** Must be the very first line of the file, before all imports. ESLint enforces this.

8. **Pure modules shared between server and client:** `lib/card-key.ts`, `lib/sequence.ts`, `lib/habit.ts`, `lib/palettes.ts`, `lib/copy.ts`, `lib/proficiency.ts` must remain free of Prisma, Node.js builtins, and any server-only imports.

9. **Lint must stay clean:** `npm run lint` must pass with zero errors before committing. The two rules that bite most often are `react-hooks/purity` and `react-hooks/set-state-in-effect`.
