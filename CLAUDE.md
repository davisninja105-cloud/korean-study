# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build (runs `prisma generate` first)
npm run lint         # ESLint
npx prisma generate  # Regenerate Prisma client after schema changes
git push origin main # Deploy to production (GitHub → Vercel auto-deploy)
```

### Schema changes (IMPORTANT — Turso gotcha)
`prisma db push` / `prisma migrate` do **NOT** work against Turso (`libsql://` → error P1013;
the schema engine only speaks `file:`/postgres). To apply a schema change:
1. Edit `prisma/schema.prisma`, then `npx prisma generate`.
2. Generate DDL: `npx prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`
   (note: the flag is `--to-schema`, not `--to-schema-datamodel`).
3. Run **only the new** `CREATE TABLE`/`ALTER` statements against Turso via the `@libsql/client`
   `executeMultiple()` (a tiny throwaway script that reads `DATABASE_URL`/`DATABASE_AUTH_TOKEN`
   from `.env`). Inspect data the same way, or with `turso db shell korean-study`.
   (`prisma studio` also can't connect to `libsql://`.)

## Architecture

**Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Prisma 7 + libSQL (SQLite/Turso), Claude API (**claude-opus-4-8** with adaptive thinking), Google Docs API v1, lucide-react (nav icons).

**Data flow:**
1. User triggers sync → `POST /api/sync` fetches the Google Doc via `lib/google-docs.ts` (reads **only the `수업 노트` tab**; now also captures bold/underline/highlighted spans as an `emphasized[]` list per lesson). Splits into lessons at horizontal rules, hashes each to detect new content. Sends lesson text + emphasized terms + existing deck's normalized fronts to Claude via `lib/extract-cards.ts`. **Exhaustive extraction** — every word, grammar pattern, and phrase becomes a card. Upserts cards by `normalizedFront` (real DB dedup). Processes **1 lesson per request** (`MAX_LESSONS_PER_SYNC = 1`) to stay under the 60 s Vercel function timeout. Reports `remaining` so the backlog drains over repeated sync taps. After all upserts, resolves each card's `components[]` lemmas → `CardDependency` edges (two-phase link). For **bulk re-extraction** (all lessons at once), use `npx tsx scripts/local-resync.mts` — runs locally with no timeout.
2. Study session → `GET /api/cards/due` returns cards where `CardReview.nextReview <= now`, optionally filtered by `lessonFrom`/`lessonTo` and `scope` (`due` | `ahead`). Capped at `sessionSize`. After the FSRS-ordered `take`, fetches `CardDependency` edges among the selected card IDs and runs `sequenceCards()` from `lib/sequence.ts` to reorder for foundation-first learning. Returns the reordered list. `StudySession` consumes it **in server order** (no client shuffle). After each answer, `POST /api/review` runs FSRS and updates the schedule.
3. AI practice → `POST /api/generate` sends due cards to Claude via `lib/generate-practice.ts` to create ephemeral extra exercises (not persisted).

**Knowledge graph (2026-06 refactor):** Every card stores `components` (JSON string[] of base-form Hangul lemmas it is *built from* — the prerequisites). At sync time these are resolved to `CardDependency` edges. At study time, `GET /api/cards/due` fetches the in-session edges and passes them to `sequenceCards()` (`lib/sequence.ts`), which applies a **blended weighted score**: `score = depth − urgencyBoost`, sort ascending. `depth` = longest in-session prereq chain; `urgencyBoost = min(daysOverdue / 7, 3)`. Foundations come first; a card overdue by 3+ weeks can leapfrog up to 3 prerequisite levels. Cycle-safe (visited-stack DFS). Pure, testable.

**Doc emphasis capture:** `lib/google-docs.ts` now reads `textStyle` (bold / underline / backgroundColor) per text run and returns `{ text, emphasized }[]` per lesson. `emphasized` is a deduped list of the explicitly highlighted spans — these are passed to the extraction prompt as a "MUST make a card for each" signal. Body text stays clean (no inline markers) so `targetForm` substring matching is unaffected.

**Exhaustive extraction & dedup:**  `lib/extract-cards.ts` uses `claude-opus-4-8` with `thinking: { type: 'adaptive' }` and streams the response (`.finalMessage()`). Prompt is **exhaustive** — every distinct item taught becomes a card (one card per base form; conjugations go in `notes`). Function words get a card only when the lesson explicitly teaches them; otherwise they appear only in `components`. Each card has a new `components: string[]` field. `lib/card-key.ts` exports `normalizeFront(front)` — strips English glosses in trailing parens, NFC-normalizes, collapses whitespace — used as the DB unique key. Real dedup is enforced by `Card.normalizedFront @unique`; Claude's hint list is a secondary courtesy signal. When editing a card's front, the `[id]/route.ts` update also sets `normalizedFront`.

**Sentence-centric learning:** Cards carry `Sentence[]` — 1–3 natural Korean example sentences, each storing `korean` (full sentence), `targetForm` (exact surface form to highlight/blank), and `translation`. Sentences are **presentation context only** — `Card` remains the FSRS review unit. `lib/sentence-match.ts` is the single source of truth for substring matching/blanking (handles 1-char/multi-occurrence safety rules). `components/HighlightedSentence.tsx` renders the highlighted span. The shown sentence rotates across reviews via `(hashStr(card.id) + reps) % sentences.length` (purity-safe). The flashcard mode has an **Exposure** (word shown highlighted; default) / **Recall** (word blanked) sub-toggle. **Blank-safety:** the first sentence for every card must be blank-safe (targetForm 2+ characters, appears exactly once) — the prompt guarantees this.

**No romanization:** card fronts must be Hangul, never Latin-letter romanization (e.g. `(kkujunhada)`). Short **English clarifying glosses** in parentheses are fine (e.g. `~(으)로 (direction particle)`). `normalizeFront` strips these glosses when computing the dedup key.

**Color system & theming (2026-06 P1):** Card-type taxonomy is recolored off the primary action color — vocabulary→indigo, grammar→violet, phrase→teal (`lib/card-style.ts:typeBadgeClass` is the single source for type badges; **blue is reserved for actions**). Semantic CSS tokens live in `app/globals.css`: `--surface-1/2/3` (**surface-1** = elevated card/sheet/nav, most prominent in both themes; **surface-2** = quiet recessed strip/tile; **surface-3** = deep well), `--reward` (warm orange for streaks/goal/celebration), `--highlight-bg/fg` (the sentence marker), `--cat-vocab/grammar/phrase`. Tokens are exposed as Tailwind utilities via `@theme inline` (e.g. `bg-surface-1`, `text-cat-vocab`, `bg-reward`). Stat/habit displays use these — never literal `blue-*`. **Dark mode is a manual System/Light/Dark toggle:** a pre-paint `<script>` in `app/layout.tsx` resolves the choice (from `localStorage` key `theme`; absent = System) and sets `data-theme` on `<html>` before first paint (no flash; `<html suppressHydrationWarning>`). Tailwind's `dark:` variant is rebound to `[data-theme="dark"]` via `@custom-variant dark` in `globals.css`; the OS `@media (prefers-color-scheme: dark)` block stays as a no-JS fallback for the CSS variables. **When adding a dark value, mirror it in BOTH the media-query `:root` block and the `:root[data-theme="dark"]` block.** `lib/theme.ts` (`getStoredTheme`/`applyTheme`/`resolveTheme`) + `components/ThemeWatcher.tsx` (live OS-change sync) drive the Settings ▸ Appearance control. Theme is **client-only (localStorage), not a DB Setting**; `buttonColor` (DB) and `--reading-scale` / `hangul-spaced` (reading aid) are still injected as an inline `style`/class on `<html>` server-side in `layout.tsx`.

**Auth:** A single shared-password gate. `middleware.ts` guards all pages/APIs except `/login`, `/api/login`, and static/PWA assets; `lib/auth.ts` issues/verifies an HMAC session cookie (Web Crypto). Configured via `APP_PASSWORD` and `AUTH_SECRET`.

**Key files:**
- `lib/fsrs.ts` — FSRS spaced repetition algorithm via ts-fsrs (Grade 1–4 → updated stability/difficulty). `formatInterval()` returns **mastery-language** copy ("Memory strengthening → Xd", "Long-term memory → Xw", "Mastered — next in Xmo") used by the grade bar.
- `lib/extract-cards.ts` — Claude prompt that parses lesson notes into typed cards + example sentences + components[]. Model: claude-opus-4-8, adaptive thinking, streaming. **Exhaustive** — every distinct item gets a card.
- `lib/card-key.ts` — `normalizeFront(front)`: pure dedup-key helper; single source of truth for "are two fronts the same item?" Used by sync upsert, card editor, and scripts.
- `lib/sequence.ts` — `sequenceCards(cards, edges, now)`: pure blended-score foundation-first sequencer. Constants: `URGENCY_SCALE=7`, `MAX_BOOST=3`. Cycle-safe DFS depth computation.
- `lib/sentence-match.ts` — Pure helper for locating `targetForm` in a Korean sentence (safe-to-blank rules); single source of truth used by StudySession, HighlightedSentence, CardEditor
- `lib/google-docs.ts` — Fetches the `수업 노트` tab via Docs API v1; captures `textStyle` emphasis (bold/underline/highlight) per run; returns `{ text, emphasized }[]`
- `lib/generate-practice.ts` — Claude prompt that generates extra practice from existing cards
- `lib/settings.ts` — Server-side getters/setters for all DB app settings (`dailyGoalSeconds`, `habitDayStartHour`, `sessionSize`, `readingTextScale`, `readingAid`, `buttonColor`). Add new persisted settings here, then plumb GET/PUT in `app/api/settings/route.ts`.
- `lib/card-style.ts` — `typeBadgeClass(type)`: single source for card-type badge classes (indigo/violet/teal off the primary). Used by `app/cards/page.tsx` + `components/StudySession.tsx`.
- `lib/theme.ts` — manual theme helper: `getStoredTheme`/`applyTheme`/`resolveTheme` (localStorage `theme`; sets `data-theme` on `<html>`). Pairs with the pre-paint script in `layout.tsx`.
- `lib/usePullToRefresh.ts` — touch pull-to-refresh hook (engages only at scroll-top, with resistance; returns `{ pullDistance, refreshing }`). Mounted on Home → `POST /api/sync`. Pass a stable (useCallback) `onRefresh`.
- `lib/habit.ts` — Pure habit-tracking helpers: `computeStreaks` (with freeze-budget bridging), `computeFreezeBudget`, `computeHabitStats`, `checkMilestone`, `shiftDate`, `habitDateStr`, `formatDuration`, `nextHabitDayStart`
- `lib/haptics.ts` — `haptic('selection'|'success'|'impact-light'|'impact-heavy')` over `navigator.vibrate`; no-op-safe on iOS Safari.
- `lib/proficiency.ts` — Pure CEFR band mapper: `CEFR_BANDS` (A1 0–500 … C1+ 8000+), `computeProficiency(masteredCount)` → `{ band, label, masteredCount, withinBandPct, nextBand }`.
- `components/StudySession.tsx` — All three study modes (flashcard, multiple-choice, fill-blank). 3D flip with **dynamic card height** (`useLayoutEffect` measures each face; height and rotation transition simultaneously). Mastery-language grade bar with haptics. Consumes cards **in server order** (foundation-first). Mutable queue (`queue[0]` = current card); REQUEUE_GAP=4; undo restores snapshots.
- `components/HighlightedSentence.tsx` — Pure component; renders a Korean sentence with `targetForm` in a bespoke `--highlight-bg/fg` marker. Accepts `cardType`; for `grammar` cards it tints the trailing particle (via `splitParticle` in `lib/sentence-match.ts`) distinctly from the stem. `splitParticle` is **conservative** — single-char case markers (은/는/이/가/을/를/에/…) only split off a 2+ syllable stem (so 없이/라는/같이 stay whole), multi-char particles (에서/부터/으로/…) split freely, and auxiliary 도/만/나 are excluded (collide with 먹어도/하지만/그러나). It can still mis-split a multi-syllable verb stem + modifier ending (기다리는) — an orthographic ambiguity.
- `components/ModeSelector.tsx` — Mode picker + Exposure/Recall sub-toggle for Flashcards
- `components/ProgressRing.tsx` — Reusable SVG ring (`pct`, `size`, `strokeWidth`, `color`, required `aria-label`); fill animates via the `.ring-fill` class (`ringFill` keyframe + dashoffset transition), gated by the globals.css `prefers-reduced-motion` block.
- `components/Sheet.tsx` — Portal bottom-sheet primitive (`open`/`onClose`/`title`): spring slide-up + blurred backdrop, drag handle, Escape/backdrop close, focus trap, body-scroll lock, `role="dialog"`; reduced-motion → crossfade. Used by the Study page (ModeSelector + LessonRangeFilter).
- `components/ThemeWatcher.tsx` — Renders nothing; re-applies the resolved theme on OS color-scheme change while in System mode.
- `components/HabitTracker.tsx` — Dashboard habit card: streak + ProgressRing + 7-day week-strip; freeze-budget nudge; ring-close triggers haptic + confetti.
- `components/HabitHeatmap.tsx` — Reusable full-history heatmap grid (parameterized by `weeks`)
- `components/MilestoneCelebration.tsx` — Full-screen overlay: confetti, milestone badge (7/30/100/365 days), personal stat summary, warm copy, dismiss.
- `components/ProficiencyArc.tsx` — Current CEFR band badge + labeled arc to next band; indigo fill; mounts on Home and Habits pages.
- `components/LessonRangeFilter.tsx` — Shared "Lessons [From] – [To] / All" filter used by Cards and Study pages
- `components/Nav.tsx` — 4-tab bottom bar on mobile (Home/Study/Cards/Habits, lucide icons) + a top-right Settings gear (all sizes); inline links on desktop (`sm+`). Tab tap fires `haptic('selection')`; `aria-current="page"` on the active tab; bars use `bg-surface-1/95 backdrop-blur-md saturate-150`.
- `components/StatsBar.tsx` — Quiet 3-col secondary stats strip on Home (cards / lessons / CEFR level); `surface-2`, no shadow. The actionable due count lives in the Home hero, not here.
- `components/SyncPanel.tsx` — UI for triggering a Google Doc sync; surfaces per-lesson failure details with retry guidance. **Lives in Settings ▸ Advanced** (removed from Home; Home triggers the same sync via pull-to-refresh).
- `components/CardEditor.tsx` — Inline card editing with full sentence editor (add/edit/delete, live highlight preview, auto-fill targetForm, mismatch warning)
- `app/page.tsx` — Home dashboard: hero (effect-only time greeting, large `--reward` due count, primary Study CTA), quiet `StatsBar` strip, `HabitTracker`, `ProficiencyArc`; pull-to-refresh → sync (`lib/usePullToRefresh.ts`).
- `app/habits/page.tsx` — Dedicated habit stats page: streak hero, all-time totals, averages/consistency, 30-day trend bars, full heatmap, heatmap insight line, ProficiencyArc
- `app/settings/page.tsx` — Dedicated settings page: Appearance (System/Light/Dark theme), daily goal, habit day-start hour, session size, reading text size, reading aid, button color, and a collapsible **Advanced** section housing the Google Doc sync. Add new settings here (theme is localStorage; the rest are DB settings via `lib/settings.ts`).

**Database (Prisma + libSQL):**
- `Lesson` → raw doc snapshot per section + contentHash for dedup + **`orderIndex` (Int, 1-based)** for stable lesson numbering. New lessons get `max(orderIndex) + 1` on sync.
- `Card` → front (Korean), back (English), type (vocabulary/grammar/phrase), notes, `distractors` (JSON), **`normalizedFront String @unique`** (dedup key via `normalizeFront()`), **`components String?`** (JSON string[] of prerequisite lemmas). `lessonId` = the lesson where this card was **first introduced** (never overwritten on re-sync). `clozeSentence`/`clozeAnswer`/`clozeTranslation` are **deprecated columns** (kept in DB, no longer written).
- `Sentence` → example sentence attached to a `Card` (CASCADE delete). Fields: `korean`, `targetForm`, `translation`, `orderIndex` (0-based). 1–3 per card.
- **`CardDependency`** *(new 2026-06)* → directed prerequisite edge: `cardId` is built from `prerequisiteId`. `@@unique([cardId, prerequisiteId])`. Created at sync time by resolving `Card.components` lemmas → matching `normalizedFront`. Scripts: `apply-graph-ddl.mjs` (one-time DDL), `relink-dependencies.mjs` (full retroactive relink after a corpus-wide resync).
- `CardReview` → FSRS state per card (stability, difficulty, state, reps, lapses, nextReview)
- `StudyDay` → per-day active study time (`date` = user-local habit-day "YYYY-MM-DD", `seconds`, `reviews`)
- `Setting` → generic key/value app settings: `dailyGoalSeconds`, `habitDayStartHour` (int 0–23, default 2), `sessionSize` (int 5–100, default 20), `readingTextScale` (0.9–1.4), `readingAid` ('0'/'1'), `buttonColor` (hex). NB: the light/dark **theme** is client-only (localStorage), not stored here.

**Habit tracking:** `components/StudySession.tsx` measures active study time and flushes increments to `POST /api/activity` (keyed by the client's **habit-day** date). Use `habitDateStr(hour)` from `lib/habit.ts` wherever you need "today as a habit date"; never use raw `localDateStr()` for activity logging.

**Lesson filtering:** `GET /api/lessons` returns all lessons ordered by `orderIndex`. Both the Cards page and the Study page share `components/LessonRangeFilter.tsx`. Cards page filters client-side; Study page passes `?lessonFrom=&lessonTo=` to `/api/cards/due` server-side. Unassigned cards (`lessonId = null`) are included only under the full "everything" span.

**Study-ahead:** After clearing due cards, the completion screen offers "Study N more →". This calls `GET /api/cards/due?scope=ahead`, which returns up to `sessionSize` not-yet-due cards nearest to becoming due, also sequenced foundation-first. These are real FSRS reviews.

The app uses the **libSQL adapter** (`lib/prisma.ts`), so the same code runs against a local SQLite file in dev and **hosted Turso** in production.

## Deployment (Vercel + Turso + GitHub)

Live at **https://korean-study-five.vercel.app** (Vercel project `jason-d-28-projects/korean-study`), DB on Turso. **GitHub pushes to `main` trigger automatic Vercel deploys** — `git push origin main` is the normal deploy path. Manual CLI deploy also works: `npx vercel --prod`. The upload occasionally fails with a transient TLS "bad record mac" — just retry.

**Vercel function timeout:** The Hobby plan hard-limits serverless functions at **60 seconds** regardless of the `maxDuration` setting. Each sync call processes 1 lesson (`MAX_LESSONS_PER_SYNC = 1`). For bulk initial syncs (all lessons at once), run locally: `npx tsx scripts/local-resync.mts` — uses the same lib code but runs on the local machine with no timeout.

Initial provisioning (already done; for reference):
1. Turso: `turso db create korean-study`, then `turso db show --url …` and `turso db tokens create …` → `DATABASE_URL` (libsql://…) and `DATABASE_AUTH_TOKEN`.
2. Apply schema to Turso via the libSQL DDL method above (NOT `prisma db push`).
3. Vercel: set all env vars (below), including `GOOGLE_SERVICE_ACCOUNT_KEY` (full JSON).

## Scripts (`scripts/`)

One-time / operational scripts — run locally against Turso via `@libsql/client` or `npx tsx`:

- `apply-graph-ddl.mjs` — Adds `normalizedFront`, `components` columns to `Card` and creates `CardDependency` table. Run ONCE after a clean wipe (UNIQUE index requires an empty table).
- `wipe-card-data.mjs` — Deletes all `CardDependency`, `Sentence`, `CardReview`, `Card`, `Lesson` rows. Keeps `StudyDay` and `Setting`. Safe to re-run.
- `local-resync.mts` — Full re-extraction of all lessons locally (bypasses 60 s Vercel timeout). Run with `npx tsx scripts/local-resync.mts`. Idempotent — skips already-synced lessons by contentHash.
- `relink-dependencies.mjs` — Retroactively rebuilds all `CardDependency` edges from stored `components`. Useful after a full resync to catch cross-lesson forward references. Idempotent.
- `find-duplicates.mjs` — Scans all cards for near-duplicate fronts using a fuzzy key (strips `~`, all parens). Reports any groups of 2+ for manual review.
- `full-resync.mjs` — Drives repeated `POST /api/sync` calls against the live URL until `remaining=0`. Use for incremental syncs; prefer `local-resync.mts` for bulk.
- `apply-sentence-ddl.mjs` — One-time DDL that created the `Sentence` table (already applied, do not re-run).
- `add-lesson-order.mjs` — One-time backfill that added `orderIndex` to existing lessons (already applied, do not re-run).

## Environment Variables

Local dev uses `.env` / `.env.local`. Required keys:
- `ANTHROPIC_API_KEY`
- `GOOGLE_SERVICE_ACCOUNT_KEY` — the full service-account JSON (single line). The Docs API needs OAuth2, not an API key; `lib/google-docs.ts` mints a read-only (`documents.readonly`) access token from this via `google-auth-library`. The target Doc must be readable by the service account (link-view or explicitly shared).
- `NEXT_PUBLIC_GOOGLE_DOC_ID`
- `DATABASE_URL` (libsql://… for Turso; `file:./dev.db` for a purely local DB) and `DATABASE_AUTH_TOKEN` (Turso)
- `APP_PASSWORD` (the login password) and `AUTH_SECRET` (random string for signing the auth cookie)

## Gotchas / conventions

- **Vercel function timeout is 60 s hard limit on Hobby plan** — `maxDuration = 300` in the route code has no effect on Hobby. Keep each sync request to 1 lesson. Use `local-resync.mts` for bulk operations.
- **ESLint is strict** (`eslint-config-next` 16). Two rules bite often:
  - `react-hooks/purity` — no impure calls during render (`Date.now()`, `Math.random()`, no-arg `new Date()`). Read time/randomness in effects/event handlers, or via a seeded value (see `seededShuffle` and the `seed` memo in `StudySession.tsx`).
  - `react-hooks/set-state-in-effect` — don't call `setState` synchronously in an effect body; do it inside async callbacks (`fetch().then(setX)`) or handlers.
- **Lint is clean** (`npm run lint` passes with zero errors). Keep new code clean.
- **Git:** commits are on `main` and auto-deploy to Vercel on push to GitHub.
- **`local-resync.mts` env loading:** it uses dynamic `import()` for lib modules so that `dotenv.config()` runs before Prisma/Anthropic read `process.env`. Static `import` statements are hoisted in ESM and would pick up the wrong `DATABASE_URL`.
- **Vercel CLI:** installed globally at `/opt/homebrew/bin/vercel`. If it's ever missing, `npm i -g vercel`. The `APP_PASSWORD` for the login page is in `.env.local`.
