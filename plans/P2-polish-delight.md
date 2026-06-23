# P2 — Polish & Delight

> **Tier goal:** Separate "good" from "best-in-class." Turn every example sentence into a
> mini-reader (tap-to-gloss + audio — the concrete bridge to C1 reading), make content
> management iOS-native, and give the app a real identity and long-game rewards.

---

## North star (P2 slice)

A learner reading a Korean example sentence taps an unfamiliar word → an inline gloss with
its dictionary form appears; taps the speaker → hears a natural Korean neural voice; and at
the end of the quarter receives a shareable "My Korean" card: *"In 90 days you reviewed
1,240 cards, held a 24-day streak, and reached B1."* The app feels like a product they're
proud to keep.

---

## Dependencies

**P2 requires P0 and P1 complete.** Specifically:

| Upstream deliverable | Tier | Used by |
|---|---|---|
| `components/Sheet.tsx` | P1.5 | P2.3 filter sheet + CardEditor sheet |
| Token layer + motion system | P0.0 | all P2 UI |
| `lib/haptics.ts` + `canvas-confetti` | P0.0 | P2.4 celebrations |
| `components/ProficiencyArc` / `lib/proficiency.ts` | P0.4 | P2.4 "My Korean" summary |
| `lib/habit.ts:computeHabitStats` | existing | P2.4 "My Korean" summary |
| Google service-account auth (`lib/google-docs.ts`) | existing | P2.2 reuses for Cloud TTS |

---

## Key constraints (P2-relevant)

- **TTS = Google Cloud Text-to-Speech (ko-KR Neural2).** Reuse the existing
  `google-auth-library` + `GOOGLE_SERVICE_ACCOUNT_KEY` from `lib/google-docs.ts`; enable the
  TTS API in the Google project and add the `cloud-platform` (or TTS) scope when minting the token.
- **Cache TTS aggressively** — each unique `(text, voice)` is synthesized once, keyed by a
  hash, then served from cache. **Prefer Vercel Blob** for the audio bytes over a DB table
  (avoids the Turso DDL dance; small MP3s ~10–30 KB). The `/api/tts` route returns a stable URL.
- **Vercel 60 s function limit** — single-sentence synth is fast (well under the limit); no batching needed.
- **Tap-to-gloss source order:** the app's own corpus first (match a tapped word to an
  existing card via `normalizeFront`/`components` from `lib/card-key.ts`), then an LLM/dictionary
  fallback for unknowns — cache every lookup.
- **App icon** — current `public/icon-*.png` are ~1–4 KB placeholder discs; replace with a real
  mark + maskable safe-zone variant; update `app/manifest.ts` `theme_color`.

---

## Tasks

### P2.1 — Tap-to-gloss *(audit §3)*

- [x] **`/api/gloss` route** — `POST { word }` → resolve: (1) exact/normalized match against
  existing cards (`lib/card-key.ts:normalizeFront`); (2) fallback to a Claude call
  (`claude-haiku-4-5-20251001`) returning `{ dictionaryForm, gloss, partOfSpeech }`; cache results
  in Setting table under `gloss:` prefix so repeat taps are instant.
  - **Why:** "Turns every sentence into a mini-reader — directly serves the C1 reading goal" (audit §3).

- [x] **`components/GlossProvider.tsx`** — global context + anchored popover (dictionary form, gloss,
  "add as card?" affordance); dismiss on outside tap; `.hangul` for Korean; reduced-motion safe.
  Exposes `useWordTap()` hook.

- [x] **Wire tap handling into `HighlightedSentence.tsx`** — tappable word spans via `TappableSegment`;
  tap → shows `GlossPopover` via context. Off when `onWordTap` not provided. Wired in
  `StudySession.tsx` and `app/cards/page.tsx`.

### P2.2 — Audio (neural cloud TTS) *(audit §3/§11)*

- [x] **`lib/tts.ts`** — `TtsProvider` interface + `googleNeural2Provider` (reuses service-account
  token minting from `lib/google-docs.ts`, `cloud-platform` scope). `activeTtsProvider` chosen
  by `TTS_PROVIDER` env (default: `'google'`). Provider-swappable — call sites never change.

- [x] **`/api/tts` route with caching** — `GET ?text=…&voice=…`: hash of `(provider, voice, text)`;
  checks Vercel Blob (`head()`); hit → returns cached URL; miss → synthesizes, `put()` to Blob.
  Reads `KOREAN_BLOB_READ_WRITE_TOKEN` (falls back to `BLOB_READ_WRITE_TOKEN`); 503 when unset.

- [x] **`components/AudioButton.tsx`** — speaker/stop/loading states; `haptic('selection')` on play;
  fetches `/api/tts` → `new Audio(url).play()`; falls back to `window.speechSynthesis` (ko-KR)
  when TTS API returns non-200. Wired into `StudySession.tsx`: sentence + card front on all modes.
  - **Why:** "Reading + listening together is how reading fluency builds" (audit §3).
  - **Active provider:** ElevenLabs (`TTS_PROVIDER=elevenlabs`, `eleven_multilingual_v2`).
    Google Neural2 also ships; swap via `TTS_PROVIDER` env. Public Blob store required
    (`KOREAN_BLOB_READ_WRITE_TOKEN` in `.env.local` + Vercel env).

- [ ] **Listening / dictation mode** *(stretch — confirm before adding)* — play sentence audio, learner types the target.

### P2.3 — Cards / content management *(audit §7)*

- [x] **Sticky single search bar + filter Sheet** — collapsed filter in `app/cards/page.tsx` into
  sticky search bar + filter icon opening a `Sheet` with type pills + `LessonRangeFilter`.

- [x] **Swipe-to-delete card rows** — `components/SwipeRow.tsx`; pointer-based; reveals Delete action;
  calls existing `handleDelete` confirm.

- [x] **CardEditor as a modal Sheet** — `CardEditor` renders inside a `Sheet` keyed by `editingId`;
  add-card form similarly sheeted.

- [x] **Rename "sentences" view → "Reading practice"** — `ActiveView` type + labels updated.

### P2.4 — Voice, delight & long game *(audit §11)*

- [x] **Copy voice at missed emotional beats** — `lib/copy.ts` (`comebackMessage`, `bandUpMessage`,
  `sessionCompleteMessage`, `hundredDayMessage`, `atRiskMessage`). Wired into `HabitTracker.tsx`
  (freeze-bridged comeback pill) and `app/page.tsx` (band-up banner + confetti).

- [x] **Real app icon + identity mark** — `public/icon.svg` (한 on brand blue rounded-square);
  `scripts/gen-icons.mjs` rasterizes to `icon-192.png`, `icon-512.png`, `apple-icon.png`,
  `icon-512-maskable.png`. `app/manifest.ts` updated.

- [x] **"My Korean" summary** — `app/wrapped/page.tsx`; fetches `/api/activity` + `/api/stats`;
  renders streak + CEFR band + all-time stats + next milestone. Share via `navigator.share` /
  clipboard fallback. Entry points on Home + Habits pages.

### P2 additions (mine)

- [ ] **Leech handling** — flag frequently-lapsed cards (high `lapses`); surface a gentle tip /
  extra exposure in study; optionally a "tricky cards" filter on the Cards page.

- [ ] **PWA offline study** *(stretch)* — a service worker + cached due-card payload so a session
  works on a commute; queue reviews and flush on reconnect. Non-trivial given the API-driven loop.

- [ ] **Progress export/backup** — a Settings action to export cards + review history + study days
  as JSON (longevity/insurance for a multi-year habit).

---

## Verification

1. `npm run lint && npm run build` — clean.
2. `npm run dev` → iPhone viewport:
   - [ ] Tapping a sentence word shows a gloss popover (corpus hit instant; unknown word falls back to LLM, then caches).
   - [ ] Speaker button plays Korean neural audio; replay serves from cache (no second synth — verify in network tab / Blob).
   - [ ] Optional listening/dictation mode plays audio and grades a typed answer.
   - [ ] Cards page shows content immediately; filters live in a bottom Sheet; swipe-to-delete works; CardEditor opens as a sheet; the view reads "Reading practice."
   - [ ] App icon is the real mark (check installed PWA + maskable in Chrome DevTools → Application → Manifest).
   - [ ] "My Korean" summary renders accurate totals and current band; export produces valid JSON.

---

## Progress log

- [x] P2.3 — Cards page: sticky search + filter Sheet, SwipeRow, CardEditor Sheet, "Reading practice" rename — 2026-06-22
- [x] P2.1 — Tap-to-gloss: `/api/gloss`, `lib/gloss.ts`, `GlossProvider.tsx`, `HighlightedSentence.tsx` wiring — 2026-06-22
- [x] P2.4 — `lib/copy.ts`, app icon (`public/icon.svg` + PNGs), `app/wrapped/page.tsx`, Home/Habits entry points, HabitTracker comeback pill — 2026-06-22
- [x] P2.2 — `lib/tts.ts`, `/api/tts`, `AudioButton.tsx`, wired into StudySession (sentence + front on all modes) — 2026-06-22
- [x] **Color pairing** — `lib/palettes.ts` (6 complementary pairings), `rewardColor` DB setting, both accents injected server-side in `app/layout.tsx`, `--reward-soft` derived shade, Settings **App colors** section (palette grid + Customize disclosure), 4 partial-tier literal-orange bypasses fixed — 2026-06-23
