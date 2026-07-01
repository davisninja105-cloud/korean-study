---
phase: 02-maturity-known-word-aware-presentation
plan: "01"
subsystem: known-word-ranking
tags: [tdd, pure-lib, korean-nlp, ranking]
status: complete

dependency_graph:
  requires: []
  provides: [countUnknownWords]
  affects: [app/api/cards/due/route.ts]

tech_stack:
  added: []
  patterns: [vitest-tdd, pure-lib-module, relative-lib-imports]

key_files:
  created:
    - lib/known-words.ts
    - tests/known-words.test.ts
  modified:
    - tests/known-words.test.ts

decisions:
  - "Use relative imports (./card-key, ./sentence-match) in lib/known-words.ts — vitest runner does not resolve @/ alias without explicit config, and existing pure lib files do not cross-import each other via @/"
  - "Use relative import (../lib/known-words) in test file — matches pattern of all existing test files"
  - "targetForm exclusion via token equality (token === targetForm) per D-05"
  - "splitParticle stem fallback: normalize the stem before checking knownLemmas"

metrics:
  duration_seconds: 155
  completed_date: "2026-06-26"
  tasks_completed: 2
  files_created: 2
---

# Phase 02 Plan 01: Known-Word Ranking Helper Summary

## One-Liner

Pure `countUnknownWords` helper that tokenizes a Korean sentence and counts non-target tokens not resolvable in a known-lemma Set via `normalizeFront` + `splitParticle` stem fallback.

## What Was Built

`lib/known-words.ts` — a new pure module (no side effects, no `'use client'`) exporting a single named function:

```typescript
countUnknownWords(korean: string, targetForm: string, knownLemmas: Set<string>): number
```

Algorithm per whitespace token:
1. Skip if token equals `targetForm` (card's own word, per D-05)
2. `normalizeFront(token)` → check `knownLemmas` → known if found
3. `splitParticle(token).stem` → `normalizeFront(stem)` → check `knownLemmas` → known if found
4. Otherwise: increment unknown count

`tests/known-words.test.ts` — five Vitest cases covering all QUAL-02 requirements:
- Counts unknown tokens (count = number of non-target tokens not in knownLemmas)
- Excludes targetForm from count (even when target is not in knownLemmas)
- Resolves particle stems via `splitParticle` (e.g. 학교에서 → stem 학교 → known)
- Returns 0 when all non-target tokens are known
- Returns 0 for empty sentence

## TDD Gate Compliance

- RED commit: `472d1b0` — `test(02-01): add failing countUnknownWords tests`
- GREEN commit: `e911c1b` — `feat(02-01): implement countUnknownWords known-word ranking helper`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] vitest path alias @/ not configured**
- **Found during:** Task 2 (GREEN) — after creating `lib/known-words.ts` with `@/lib/card-key` and `@/lib/sentence-match` imports
- **Issue:** vitest runner does not resolve the `@/` path alias (only tsconfig + Next.js resolve it). Running `npm test -- known-words` failed with "Cannot find package '@/lib/card-key'"
- **Fix:** Switched `lib/known-words.ts` imports to relative (`./card-key`, `./sentence-match`) — matches the pattern of all other pure lib files that don't cross-import via `@/`. Also updated the test import from `@/lib/known-words` to `../lib/known-words`, consistent with all five existing test files.
- **Files modified:** `lib/known-words.ts`, `tests/known-words.test.ts`
- **Commit:** `e911c1b`

The plan's PATTERNS.md specified `@/` imports as the pattern for `lib/known-words.ts`. However, inspection of the actual codebase revealed that pure lib files (`lib/card-key.ts`, `lib/sentence-match.ts`, `lib/sequence.ts`) have no cross-imports — each is standalone. The `@/` alias is used only in server-side lib files that import Prisma/Anthropic. Using relative imports is consistent with the existing testable pure-module convention and does not affect any caller (the API route in Plan 02 will use `@/lib/known-words` which resolves correctly in Next.js context).

## Known Stubs

None — `countUnknownWords` is fully implemented. No hardcoded values, no placeholders.

## Threat Flags

None — pure function, no I/O, no new attack surface.

## Self-Check

Verified:
- `lib/known-words.ts` exists: FOUND
- `tests/known-words.test.ts` exists: FOUND
- RED commit `472d1b0`: FOUND
- GREEN commit `e911c1b`: FOUND
- `npm test -- known-words`: 5/5 PASSED
- `npm run lint`: CLEAN

## Self-Check: PASSED
