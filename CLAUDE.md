# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server at http://localhost:3000
npm run build        # Production build (runs `prisma generate` first)
npm run lint         # ESLint
npx prisma generate  # Regenerate Prisma client after schema changes
vercel --prod        # Deploy to production (CLI deploy from local; NOT on GitHub yet)
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

**Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4, Prisma 7 + libSQL (SQLite/Turso), Claude API (claude-sonnet-4-6), Google Docs API v1, lucide-react (nav icons).

**Data flow:**
1. User triggers sync → `POST /api/sync` fetches the Google Doc via `lib/google-docs.ts` (reads **only the `수업 노트` tab** through the Docs API v1), splits it into lessons at horizontal rules, hashes each to detect new content, sends new lesson text + the existing deck's fronts to Claude via `lib/extract-cards.ts`, stores `Lesson` + `Card` + `Sentence[]` + `CardReview` rows. Processes up to `MAX_LESSONS_PER_SYNC` (4) lessons per request and reports `remaining` so a backlog is drained over repeated taps (keeps each call under the serverless timeout). Each new `Lesson` gets a stable `orderIndex` (max existing + position in batch) so lessons are numbered correctly even when created in parallel.
2. Study session → `GET /api/cards/due` returns cards (with sentences included) where `CardReview.nextReview <= now`, optionally filtered by `lessonFrom`/`lessonTo` (lesson range by `orderIndex`) and `scope` (`due` default | `ahead` for nearest-due-first not-yet-due cards). Both scopes are capped server-side at `sessionSize` (default 20, user-configurable). After each answer, `POST /api/review` runs the FSRS algorithm (`lib/fsrs.ts`) and updates the review schedule. Study-ahead cards are real reviews — FSRS reschedules them normally.
3. AI practice → `POST /api/generate` sends due cards to Claude via `lib/generate-practice.ts` to create ephemeral extra exercises (not persisted).

**Sentence-centric learning (Sentence refactor, 2026-06):** Cards now carry `Sentence[]` — 1–3 natural Korean example sentences, each storing `korean` (full sentence), `targetForm` (exact surface form to highlight/blank), and `translation`. Sentences are **presentation context only** — `Card` remains the FSRS review unit. `lib/sentence-match.ts` is the single source of truth for substring matching/blanking (handles 1-char/multi-occurrence safety rules). `components/HighlightedSentence.tsx` renders the highlighted span. Study flashcards show words/grammar **in sentence context**; the shown sentence rotates across reviews via `(hashStr(card.id) + reps) % sentences.length` (purity-safe). The flashcard mode has an **Exposure** (word shown highlighted; default) / **Recall** (word blanked; retrieve first) sub-toggle. **Blank-safety:** Recall and fill-blank require a "blank-safe" sentence — one whose `targetForm` is 2+ characters and appears exactly once. When rotation lands on an unsafe sentence for those modes, `StudySession` prefers the first blank-safe sentence instead (the prompt guarantees index 0 is blank-safe; Exposure always rotates freely). Fill-blank prefers the `Sentence.targetForm` for blanking, with legacy-cloze and plain-input fallbacks. Grammar cards get varied lexical fillers (가면/먹으면/보면 pattern) so the learner abstracts the rule.

**Card extraction heuristic & per-mode content:** `lib/extract-cards.ts` applies an explicit, curated heuristic (make cards for new vocab / grammar patterns / set phrases / irregular forms; skip known greetings, admin/meta text, English asides; dedup against the whole deck via `existingFronts`). For each card Claude pre-generates: `distractors` (JSON array of 3 wrong English meanings for multiple-choice) and `sentences[]` (1–3 example sentences preferring real lesson-doc sentences verbatim; grammar cards get lexically-varied fillers). **Blank-safety guarantee:** the first sentence for every card must be blank-safe (targetForm 2+ characters, single occurrence) — if the doc's sentences aren't, a safe one is composed and listed first. `sentenceMatch` is used as a defensive filter in the normalizer to drop any sentence where `targetForm` isn't verbatim in `korean`. `components/StudySession.tsx` consumes these. Legacy `clozeSentence`/`clozeAnswer`/`clozeTranslation` columns are kept but no longer written; new cards use `Sentence` rows.

**No romanization:** card fronts must be Hangul, never Latin-letter romanization (e.g. `(kkujunhada)`). Short **English clarifying glosses** in parentheses are fine and wanted (e.g. `~(으)로 (direction particle)`). The extract prompt enforces this; existing cards were already stripped of romanization while keeping glosses.

**Auth:** A single shared-password gate. `middleware.ts` guards all pages/APIs except `/login`, `/api/login`, and static/PWA assets; `lib/auth.ts` issues/verifies an HMAC session cookie (Web Crypto). Configured via `APP_PASSWORD` and `AUTH_SECRET`.

**Key files:**
- `lib/fsrs.ts` — FSRS spaced repetition algorithm via ts-fsrs (Grade 1–4 → updated stability/difficulty)
- `lib/extract-cards.ts` — Claude prompt that parses lesson notes into typed cards + example sentences
- `lib/sentence-match.ts` — Pure helper for locating `targetForm` in a Korean sentence (safe-to-blank rules); single source of truth used by StudySession, HighlightedSentence, CardEditor
- `lib/google-docs.ts` — Fetches the `수업 노트` tab via Docs API v1, splits by horizontal rules into lesson sections
- `lib/generate-practice.ts` — Claude prompt that generates extra practice from existing cards
- `lib/settings.ts` — Server-side getters/setters for all app settings (`dailyGoalSeconds`, `habitDayStartHour`, `sessionSize`)
- `lib/habit.ts` — Pure habit-tracking helpers: `computeStreaks`, `computeHabitStats`, `shiftDate`, `habitDateStr`, `formatDuration`, `nextHabitDayStart`
- `components/HighlightedSentence.tsx` — Pure component; renders a Korean sentence with `targetForm` highlighted; used by StudySession, Cards tab, CardEditor
- `components/StudySession.tsx` — All three study modes (flashcard, multiple-choice, fill-blank); sentence-aware flashcard with Exposure/Recall sub-mode; sentences rotate across reviews via `(hashStr(id) + reps) % len`; seeds shuffle from card IDs (purity-safe); key prop triggers remount between study-ahead batches. Uses a **mutable queue** (`queue[0]` = current card): after each grade, the `/api/review` response `nextReview` is checked against `nextHabitDayStart` — if still due today, the card is re-inserted 4 positions back (REQUEUE_GAP) with its fresh FSRS state; otherwise it's dropped. Session ends when the queue drains. Undo restores queue + stats snapshots.
- `components/ModeSelector.tsx` — Mode picker + Exposure/Recall sub-toggle for Flashcards
- `components/HabitTracker.tsx` — Dashboard habit card: streak + today's progress bar + 7-day week-strip; taps through to `/habits`
- `components/HabitHeatmap.tsx` — Reusable full-history heatmap grid (extracted from HabitTracker, parameterized by `weeks`)
- `components/LessonRangeFilter.tsx` — Shared "Lessons [From] – [To] / All" filter used by Cards and Study pages; renders nothing if fewer than 2 lessons
- `components/Nav.tsx` — Bottom tab bar on mobile (lucide-react icons); inline text links on desktop (`sm+`)
- `components/SyncPanel.tsx` — UI for triggering a Google Doc sync
- `components/CardEditor.tsx` — Inline card editing with full sentence editor (add/edit/delete, live highlight preview, auto-fill targetForm, mismatch warning)
- `app/habits/page.tsx` — Dedicated habit stats page: streak hero, all-time totals, averages/consistency, 30-day trend bars, full heatmap
- `app/settings/page.tsx` — Dedicated settings page (daily goal, habit day-start hour, session size); add new settings here

**Database (Prisma + libSQL):**
- `Lesson` → raw doc snapshot per section + contentHash for dedup + **`orderIndex` (Int, 1-based)** for stable lesson numbering. Migration already applied to Turso; `scripts/add-lesson-order.mjs` was the one-time backfill script (don't re-run). New lessons get `max(orderIndex) + i + 1` on sync.
- `Card` → front (Korean), back (English), type (vocabulary/grammar/phrase), notes, `distractors` (JSON). `lessonId` is nullable — manually-added cards have no lesson. `clozeSentence`/`clozeAnswer`/`clozeTranslation` are **deprecated columns** (kept in DB, no longer written — superseded by `Sentence` rows).
- `Sentence` → example sentence attached to a `Card` (CASCADE delete). Fields: `korean` (full sentence, no blank), `targetForm` (exact surface form to highlight/blank — must be a verbatim substring of `korean`), `translation` (English), `orderIndex` (0-based within a card). 1–3 per card. No separate FSRS state — presentation context only. Shown sentence rotates across reviews: `(hashStr(card.id) + reps) % sentences.length`. `scripts/apply-sentence-ddl.mjs` created the table (one-time). `scripts/backfill-sentences.mjs` backfilled from legacy cloze columns (one-time, don't re-run).
- `CardReview` → FSRS state per card (stability, difficulty, state, reps, lapses, nextReview)
- `StudyDay` → per-day active study time (`date` = user-local habit-day "YYYY-MM-DD", `seconds`, `reviews`) for the habit streak/heatmap
- `Setting` → generic key/value app settings: `dailyGoalSeconds` (goal in seconds), `habitDayStartHour` (int 0–23, default 2 = 2am), `sessionSize` (int 5–100, default 20 — cards drawn per session)

**Habit tracking:** `components/StudySession.tsx` measures active study time (visible + non-idle) and flushes increments to `POST /api/activity` (keyed by the client's **habit-day** date). The dashboard `HabitTracker` shows a compact **7-day week strip** (dots, goal-met/partial/miss, today ringed) — tapping it opens `/habits`. `app/habits/page.tsx` is the full-detail page: streak hero, all-time totals (including `reviews` per day, now surfaced), averages/consistency, 30-day trend bars, and a `<HabitHeatmap weeks={26}>`. All stats compute client-side from `GET /api/activity` (`{ days, dailyGoalSeconds, dayStartHour }`) via `lib/habit.ts` (`computeStreaks`, `computeHabitStats`). A **habit-day** starts at `dayStartHour` (default 2am) — use `habitDateStr(hour)` from `lib/habit.ts` wherever you need "today as a habit date"; never use raw `localDateStr()` for activity logging. Both `dailyGoalSeconds` and `dayStartHour` are user-configurable via `GET/PUT /api/settings`. The Settings page (`/settings`) owns all goal/preference editing.

**Lesson filtering:** `GET /api/lessons` returns all lessons ordered by `orderIndex`. Both the Cards page and the Study page share `components/LessonRangeFilter.tsx` ("Lessons N – M / All"). Cards page filters client-side; Study page passes `?lessonFrom=&lessonTo=` to `/api/cards/due` server-side. Unassigned cards (`lessonId = null`) are included only under the full "everything" span.

**Study-ahead:** After clearing due cards, the completion screen and "no cards due" empty state both offer "Study N more →" (N = `sessionSize`). This calls `GET /api/cards/due?scope=ahead` (optionally with a lesson range), which returns up to `sessionSize` not-yet-due cards nearest to becoming due. These are real reviews — FSRS reschedules them. Each batch remounts `StudySession` via `key={sessionKey}` so the shuffle seed and habit timer reset cleanly.

The app uses the **libSQL adapter** (`lib/prisma.ts`), so the same code runs against a local SQLite file in dev and **hosted Turso** in production — no schema/provider change needed.

## Deployment (Vercel + Turso)

Live at **https://korean-study-five.vercel.app** (Vercel project `jason-d-28-projects/korean-study`), DB on Turso. GitHub pushes to `main` trigger automatic Vercel deploys. For a manual CLI deploy: `npx vercel --prod`. The upload occasionally fails with a transient TLS "bad record mac" — just retry.

Initial provisioning (already done; for reference):
1. Turso: `turso db create korean-study`, then `turso db show --url …` and `turso db tokens create …` → `DATABASE_URL` (libsql://…) and `DATABASE_AUTH_TOKEN`.
2. Apply schema to Turso via the libSQL DDL method above (NOT `prisma db push`).
3. Vercel: set all env vars (below), including `GOOGLE_SERVICE_ACCOUNT_KEY` (full JSON).

## Environment Variables

Local dev uses `.env` / `.env.local`. Required keys:
- `ANTHROPIC_API_KEY`
- `GOOGLE_SERVICE_ACCOUNT_KEY` — the full service-account JSON (single line). The Docs API needs OAuth2, not an API key; `lib/google-docs.ts` mints a read-only (`documents.readonly`) access token from this via `google-auth-library`. The target Doc must be readable by the service account (link-view or explicitly shared).
- `NEXT_PUBLIC_GOOGLE_DOC_ID`
- `DATABASE_URL` (libsql://… for Turso; `file:./dev.db` for a purely local DB) and `DATABASE_AUTH_TOKEN` (Turso)
- `APP_PASSWORD` (the login password) and `AUTH_SECRET` (random string for signing the auth cookie)

## Gotchas / conventions

- **ESLint is strict** (`eslint-config-next` 16). Two rules bite often:
  - `react-hooks/purity` — no impure calls during render (`Date.now()`, `Math.random()`, no-arg `new Date()`). Read time/randomness in effects/event handlers, or via a seeded value (see `seededShuffle` and the `seed` memo in `StudySession.tsx`).
  - `react-hooks/set-state-in-effect` — don't call `setState` synchronously in an effect body; do it inside async callbacks (`fetch().then(setX)`) or handlers.
- **Lint is clean** (`npm run lint` passes with zero errors). Keep new code clean.
- **Git:** commits are on `main` and auto-deploy to Vercel on push.
- **Vercel CLI:** installed globally at `/opt/homebrew/bin/vercel`. If it's ever missing, `npm i -g vercel`. The `APP_PASSWORD` for the login page is in `.env.local`.
