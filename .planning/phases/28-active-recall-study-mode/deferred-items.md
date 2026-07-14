# Deferred Items — Phase 28

Pre-existing issues discovered during 28-01 execution that are out of scope
for this plan (not caused by this plan's changes — verified via `git stash`
diff-before/after comparison). Logged per the executor's scope-boundary rule;
not fixed here.

## tsc — `tests/study-cards.test.ts` implicit `any` (2 errors)

```
tests/study-cards.test.ts(167,8): error TS7006: Parameter 'c' implicitly has an 'any' type.
tests/study-cards.test.ts(212,8): error TS7006: Parameter 'c' implicitly has an 'any' type.
```

Present on the pre-28-01 baseline (confirmed via `git stash && npx tsc --noEmit`).
Unrelated to `components/ModeSelector.tsx` / `StudySession.tsx` / `StudyClient.tsx` /
`FlashcardMode.tsx` — file is not in this plan's `files_modified` list.

## ESLint — `react-hooks/exhaustive-deps` warning in `StudySession.tsx`

```
components/StudySession.tsx  warning  The 'cardSentences' logical expression could
make the dependencies of useMemo Hook change on every render. To fix this, wrap the
initialization of 'cardSentences' in its own useMemo() Hook  react-hooks/exhaustive-deps
```

Pre-existing (present on the pre-28-01 baseline at the equivalent line). The code
comment directly above the `chosenIdx` useMemo explicitly documents this as
expected and not to be "fixed": the `?? []` fallback creates a fresh array each
render only on the `realCard === null` path (empty queue), where the memo does
no work-saving but stays correct. `npm run lint` reports 0 errors (this is a
warning only).

## node_modules — worktree had no local install

This worktree's `node_modules` was effectively empty (no `.bin` symlinks) at
the start of 28-01 execution, which broke `e2e/seed.ts`'s `resetToBaseline()`
(`execFileSync` against `node_modules/.bin/tsx`). Resolved by running `npm ci`
against the existing (unmodified) `package-lock.json` — no new packages were
added or changed; this is an environment-provisioning gap in the worktree
setup, not a plan defect. Noting here for visibility in case other parallel
worktrees hit the same gap.
