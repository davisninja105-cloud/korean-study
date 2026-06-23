# Korean Study

A personal, iPhone-first Korean spaced-repetition app. It syncs a Google Doc of
tutoring notes, uses Claude to exhaustively extract study cards (vocabulary, grammar,
phrases) with natural example sentences, and drills them with FSRS scheduling — built to
make a daily habit stick and make the multi-year climb to C1 reading feel visible.

**Live:** https://korean-study-five.vercel.app

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Prisma 7 + libSQL
(SQLite local / Turso prod) · Claude API (`claude-opus-4-8`) · Google Docs API v1 ·
lucide-react.

## Develop

```bash
npm run dev     # http://localhost:3000
npm run lint    # ESLint (strict — keep clean)
npm run build   # production build (runs `prisma generate` first)
```

Needs a `.env` / `.env.local` — see **Environment Variables** in `CLAUDE.md`:
`ANTHROPIC_API_KEY`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `NEXT_PUBLIC_GOOGLE_DOC_ID`,
`DATABASE_URL`, `DATABASE_AUTH_TOKEN`, `APP_PASSWORD`, `AUTH_SECRET`.

## Deploy

`git push origin main` → GitHub triggers a Vercel production deploy. The same Prisma code
runs against the local SQLite file and hosted Turso, so no provider switch is needed.
Schema changes need the libSQL DDL workflow (not `prisma db push`) — see `CLAUDE.md`.

## Docs

- **`CLAUDE.md`** — architecture, data flow, conventions, and gotchas. Start here.
- **`plans/`** — the design-overhaul roadmap: the `fixes_needed.txt` audit translated into
  tiered plans. **P0 (foundations)** and **P1 (identity & retention)** are complete and
  deployed; **P2 (polish & delight)** is next.
