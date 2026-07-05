# Coding Conventions

**Analysis Date:** 2026-07-05

## Naming Patterns

**Files:**
- All TypeScript/JavaScript files use `kebab-case`: `card-key.ts`, `sentence-match.ts`, `extract-cards.ts`, `AudioButton.tsx`, `StudySession.tsx`
- Test files: source name + `.test.ts` suffix, same directory structure: `lib/card-key.ts` → `tests/card-key.test.ts`
- Directories: `kebab-case` throughout (`app/`, `lib/`, `components/`, `tests/`, `scripts/`, `prisma/`)

**Functions:**
- `camelCase` for all functions: `normalizeFront()`, `sequenceCards()`, `extractCardsFromNotes()`, `habitDateStr()`
- Exported functions: `export function name()` (named exports, no barrel files)
- Private functions: no special prefix, scoped to module

**Variables:**
- `camelCase` for all variable names: `nowMs`, `dayMs`, `inPool`, `visiting`, `previouslyFocused`
- Module-level constants: `UPPER_SNAKE_CASE` with explanatory comment
  - Example (`lib/sequence.ts`): `const URGENCY_SCALE = 7`, `const MAX_BOOST = 3`
  - Example (`lib/gloss.ts`): `const CACHE_KEY_PREFIX = 'gloss:'`, `const MAX_GLOSS_CACHE_ENTRIES = 2000`

**Types:**
- Props interfaces: always named exactly `Props` (not `ComponentNameProps`)
  - Example (`components/Sheet.tsx`): `interface Props { open: boolean; onClose: () => void; title?: string; children: React.ReactNode }`
- Exported types: `export interface TypeName`
- Local component types: `interface` keyword, declared near top before component
  - Example (`components/StudySession.tsx`): `interface Sentence { id: string; korean: string; … }`
- Prefer `interface` over `type` alias for object shapes; use `type` for unions and utility types

## Code Style

**Formatting:**
- ESLint (`eslint.config.mjs`) enforces Next.js core-web-vitals + TypeScript rules
- No `.prettierrc` present; formatting follows ESLint defaults
- Indentation: 2 spaces (ESLint + Next.js standard)
- Line length: no hard limit enforced, but code aims for readability

**Linting:**
- ESLint 9.x via flat config (`eslint.config.mjs`)
- Active rulesets: `eslint-config-next/core-web-vitals` + `eslint-config-next/typescript`
- Critical rules (must stay clean):
  - `react-hooks/purity` — forbids impure calls during render (`Date.now()`, `Math.random()`, bare `new Date()`)
  - `react-hooks/set-state-in-effect` — forbids synchronous `setState` in effect bodies (must be inside async callbacks or handlers)
  - `no-floating-promises` — all promises must be awaited or explicitly ignored with `.catch(() => {})`
- **Lint must pass clean:** `npm run lint` exits 0 with zero errors

**TypeScript:**
- Strict mode enabled (`"strict": true` in `tsconfig.json`)
- Module resolution: `bundler` (supports `@/` root alias and modern imports)
- Path alias `@/*` maps to project root; always use `@/` for intra-project imports
  - Example: `import { prisma } from '@/lib/prisma'`
  - Use relative imports (`./`) only within the same directory
- Type assertions (`as`) used narrowly with explanatory comment (e.g., `as Grade`)
- Non-null assertions (`!`) only when null case ruled out by preceding logic

## Import Organization

**Order (observed pattern):**
1. External framework/library imports (`react`, `next`, `@anthropic-ai/sdk`, etc.)
2. Internal library imports (`@/lib/…`)
3. Internal component imports (`@/components/…`)
4. Relative imports (`./ `) within same directory
5. Type imports (rarely separated; included above)

**Path Aliases:**
- `@/` = project root
- All intra-project imports must use `@/` (never relative across directories)
- Example file: `components/StudySession.tsx` imports:
  ```typescript
  import { habitDateStr, DEFAULT_DAY_START_HOUR } from '@/lib/habit'
  import FlashcardMode from './FlashcardMode'          // same directory → relative
  import { sentenceMatch } from '@/lib/sentence-match'  // cross-directory → @/
  ```

**No Barrel Files:**
- No `index.ts` or `index.tsx` files in `lib/`, `components/`, etc.
- Every import references the source file directly: `import { normalizeFront } from '@/lib/card-key'` (not `from '@/lib'`)

## Client vs. Server Boundary

**Client Components:**
- Declare `'use client'` as the very first line, before any imports
- Never import Prisma, server-only libraries, or API helpers
- Examples: `components/StudySession.tsx`, `components/Sheet.tsx`, `components/GlossProvider.tsx`

**Server Components & API Routes:**
- No `'use client'` directive
- Can call `prisma`, `lib/settings.ts`, or other server-only code directly
- Examples: `app/page.tsx`, `app/api/cards/route.ts`, `app/api/sync/route.ts`

**Server-Only Modules:**
- Marked with a comment at the top: `// No 'use client' — this module runs server-side only.`
- Example: `lib/gloss.ts`, `lib/google-docs.ts`, `lib/extract-cards.ts`

**Pure/Shared Modules:**
- No `'use client'` directive
- No Prisma, Node builtins, or server-only libraries
- Safe to import and call from both client and server contexts
- Examples: `lib/card-key.ts`, `lib/sequence.ts`, `lib/habit.ts`, `lib/palettes.ts`, `lib/sentence-match.ts`

## Error Handling

**API Route Handlers:**
- Wrap request body parsing in `try/catch`:
  ```typescript
  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  ```
- Validation errors: return `{ status: 400 }` with descriptive message before business logic
- Server errors: return `{ status: 500 }` with optional error detail
- Sentinel errors for short-circuiting (e.g., `class CardReviewNotFoundError extends Error {}`)

**Library Modules:**
- Pure library functions throw on unexpected input; callers handle the error
- `try/catch` in library code only when recovering gracefully (e.g., `getButtonColor()` in `lib/settings.ts` catches Prisma errors and returns default)
- JSON parse always wrapped: `try { return JSON.parse(value) } catch { return null }`

**LLM / External API Calls:**
- Validate response immediately after receipt (check `content[0].type`, extract JSON before `JSON.parse`)
- TTS and Blob failures degrade gracefully: `/api/tts` returns 503, `AudioButton` falls back to browser speech

**Type Guards Instead of Assertions:**
- Example (`app/api/review/route.ts`):
  ```typescript
  function isGrade(n: unknown): n is Grade {
    return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 4
  }
  if (!isGrade(rating)) {
    return NextResponse.json({ error: 'rating must be 1–4' }, { status: 400 })
  }
  ```
  Compiler enforces the relationship; avoids blind `as Grade` casts.

## Logging

**Framework:** `console` methods only (`console.log`, `console.warn`, `console.error`)

**Patterns:**
- Warnings for recoverable issues: `console.warn('Failed to parse cached gloss for', normalizedWord, err)`
- No structured logging framework used
- Debug output: use `console.log` during development, clean before commit
- Error context: include relevant variable state in the log message

## Comments and Documentation

### Public Functions: Full JSDoc Block

Every exported function that is a single source of truth carries a leading block comment:
- Opening line: one-sentence purpose
- "Used by:" list (files that call it)
- "Rules:" numbered list (contract/behavior)
- "No side-effects" guarantee (if applicable)

Example (`lib/card-key.ts`):
```typescript
/**
 * Pure dedup-key helper — single source of truth for "are two card fronts
 * the same item?"
 *
 * Used by:
 *  - lib/extract-cards.ts   (normalizer, to populate normalizedFront)
 *  - app/api/sync/route.ts  (upsert WHERE clause + component-resolution map)
 *
 * Rules:
 *  1. NFC-normalize Unicode so 갈 == 갈 regardless of composition.
 *  2. Trim and collapse internal whitespace.
 *  3. Strip an English clarifying gloss in trailing parentheses
 *     (e.g. "~(으)면 (if/when)" → "~(으)면")
 *     BUT keep Hangul-only or mixed Hangul+punctuation parens intact
 *
 * No side-effects, no imports. Safe to call in server AND client contexts.
 */
export function normalizeFront(front: string): string { … }
```

### Inline Comments

- Explain non-obvious decisions, not what the code does
- Use present tense: "A card is still due today iff …"
- Reference constants by name: "See REQUEUE_GAP = 4 above"

Example (`components/StudySession.tsx`):
```typescript
// Normalize answers for forgiving fill-in-the-blank comparison.
function normalizeAnswer(s: string): string {
  return s.trim().replace(/\s+/g, ' ')
}

// How many cards ahead a re-queued card is inserted. Keeps a lapsed card from
// reappearing immediately when other cards are available.
const REQUEUE_GAP = 4
```

### Deprecated Items

Mark with `/** @deprecated — … */`:
```typescript
/** @deprecated — use buttonColor from lib/settings instead */
const DEFAULT_BUTTON_COLOR = '#4F46E5'
```

### Temporal Language

Use present tense only. Never historical ("was", "used to") or future ("will be") in code comments.

## Async Patterns

**async/await throughout** — no `.then()` chains except in non-blocking write patterns

**Concurrent Operations:**
- Use `Promise.allSettled()` when processing a batch where individual failures should not abort the whole batch
- Example: due-card pool + known-lemmas set fetched concurrently; pool failure throws (500), known-lemmas failure degrades to empty Set

**Non-blocking Writes:**
- Pattern: `promise.catch(() => {})` or `.then(() => {})` to satisfy ESLint `no-floating-promises`
- Example: `POST /api/review` is fire-and-forget after optimistic client update
  ```typescript
  // Optimistic: update client state immediately
  submitReview(card, rating)
  
  // Background save: not awaited, not blocking
  fetch('/api/review', { … }).catch(() => {})
  ```

**Server-Side async:**
- All database queries are `await`ed
- Example: RSC fetches via `await Promise.all([getStats(), getActivityData()])`

## React Hooks Purity (Critical)

**Impure functions forbidden during render:**
- `Date.now()` — read time in effects/handlers or pass as prop
- `new Date()` (no-arg) — same as above
- `Math.random()` — use seeded PRNG for deterministic render

**Patterns for deterministic randomness:**
- Seed from stable value (card ID hash): `seededShuffle(array, hashStr(cardId))`
- Example:
  ```typescript
  // Deterministic (pure) shuffle so it can run during render
  function seededShuffle<T>(arr: T[], seed: number): T[] {
    let s = seed >>> 0
    const rand = () => { /* LCG implementation */ }
    // ... shuffle using rand()
  }
  ```

**State in Effects:**
- Never call `setState` synchronously in effect body
- Pattern: state update inside async callback or handler
  ```typescript
  useEffect(() => {
    fetch('/api/data').then(setData)  // ✓ inside .then()
  }, [])
  ```

**Lazy Initializer for Reduced-Motion Awareness:**
- `useState` with lazy initializer to read CSS at runtime, not on every render
  ```typescript
  const [prefersReducedMotion] = useState(() => 
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
  ```

## Tailwind CSS v4

**Semantic Tokens (defined in `app/globals.css`):**
- Never use literal color utilities like `bg-orange-500` or `text-blue-400`
- Use registered token utilities instead:
  - `--surface-1` / `bg-surface-1` (elevated: cards, sheets, nav)
  - `--surface-2` / `bg-surface-2` (recessed: strips, tiles)
  - `--surface-3` / `bg-surface-3` (deep: page background)
  - `--button` / `--button-foreground` (action color, user-configurable)
  - `--reward` / `--reward-foreground` (streak/goal color, user-configurable)
  - `--reward-soft` (partial progress: bars, heatmap cells)
  - `--highlight-bg` / `--highlight-fg` (Korean sentence targetForm marker)
  - `--cat-vocab` / `--cat-grammar` / `--cat-phrase` (card-type taxonomy)

**Dark Mode:**
- Manual toggle (System / Light / Dark) stored in `localStorage` key `theme`
- `data-theme="dark"` set on `<html>` by pre-paint script in `app/layout.tsx`
- Tailwind's `dark:` variant rebound to `[data-theme="dark"]` via `@custom-variant dark`
- **When adding a dark value: mirror it in BOTH**:
  1. `@media (prefers-color-scheme: dark)` `:root` block
  2. `:root[data-theme="dark"]` block

## Component Patterns

**Props Interface:**
```typescript
interface Props {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
}

export default function ComponentName({ open, onClose, title, children }: Props) {
  // …
}
```

**Refs with TypeScript:**
```typescript
const panelRef = useRef<HTMLDivElement>(null)
const previouslyFocused = useRef<HTMLElement | null>(null)
```

**useLayoutEffect for Measuring:**
- Used when component height depends on content (e.g., 3D flip card)
- Runs synchronously after DOM paint, before browser repaint

---

*Convention analysis: 2026-07-05*
