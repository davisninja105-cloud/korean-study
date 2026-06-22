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

- [ ] **`/api/gloss` route** — `POST { word }` → resolve: (1) exact/normalized match against
  existing cards (`lib/card-key.ts:normalizeFront`); (2) fallback to a Claude call
  (`claude-opus-4-8`) returning `{ dictionaryForm, gloss, partOfSpeech }`; cache results in a
  simple key/value store (Setting-style table or Blob JSON) so repeat taps are instant.
  - **Why:** "Turns every sentence into a mini-reader — directly serves the C1 reading goal" (audit §3).

- [ ] **`components/GlossPopover.tsx`** — small anchored popover (dictionary form, gloss, "add
  as card?" affordance); dismiss on outside tap; `.hangul` for Korean; reduced-motion safe.

- [ ] **Wire tap handling into `HighlightedSentence.tsx`** — split the sentence into tappable
  word spans (Korean word segmentation by whitespace + particle boundaries); tap → fetch gloss →
  show `GlossPopover`. Off in editing contexts.

### P2.2 — Audio (neural cloud TTS) *(audit §3/§11)*

- [ ] **`lib/tts.ts`** — Google Cloud TTS client (reuse the service-account token minting from
  `lib/google-docs.ts`); `synthesize(text, voice='ko-KR-Neural2-A')` → MP3 bytes.

- [ ] **`/api/tts` route with caching** — `GET ?text=…&voice=…`: hash the inputs; if cached in
  Vercel Blob return its URL, else synthesize, store, return. Idempotent; each sentence synth'd once.

- [ ] **Speaker affordance** — a speaker button on the sentence and the target form in
  `HighlightedSentence.tsx` / `StudySession.tsx` (build it as a small `<AudioButton>` so it can be
  reused). `haptic('selection')` on play.
  - **Why:** "Reading + listening together is how reading fluency builds" (audit §3).

- [ ] **Listening / dictation mode** *(addition, stretch)* — a study sub-mode: play the sentence
  audio, learner recalls/types the target — builds the listening half of reading fluency. Reuses
  the fill-blank grading path in `StudySession.tsx`.

### P2.3 — Cards / content management *(audit §7)*

- [ ] **Sticky single search bar + filter Sheet** — collapse the filter stack in
  `app/cards/page.tsx` into one sticky search bar with a filter icon that opens a `Sheet` (reuse
  P1.5) holding the type pills + lesson range. Content shows immediately (zero-friction browse).
  - **Why:** "High cognitive load before the learner has a reason to filter anything" (audit §7).

- [ ] **Swipe-to-delete card rows** — iOS-native swipe gesture on card rows in `app/cards/page.tsx`
  (pointer-based; reveals a delete action), with confirm.

- [ ] **CardEditor as a modal Sheet** — render `components/CardEditor.tsx` inside a `Sheet`
  (slide-up) instead of the in-place blue panel; clear dismiss gesture.
  - **Why:** "The inline blue CardEditor opens in-place and has no clear dismiss gesture" (audit §7).

- [ ] **Rename "sentences" view → "Reading practice"** in `app/cards/page.tsx` (the segmented
  toggle + heading), and promote it visually.
  - **Why:** "This is the bridge to C1 reading — label it prominently" (audit §7).

### P2.4 — Voice, delight & long game *(audit §11)*

- [ ] **Copy voice at missed emotional beats** — comeback after a missed day ("Welcome back —
  your X-day streak is safe."), 100-day note, band-up moment. Centralize warm strings (e.g.
  `lib/copy.ts`) and surface in `app/page.tsx` / `HabitTracker.tsx` / session-complete.
  - **Why:** "The warmth is there in the codebase; it just needs more moments to speak" (audit §11).

- [ ] **Real app icon + identity mark** — design a restrained mark (stylized 한 / geometric);
  regenerate `public/icon-192.png`, `icon-512.png`, `apple-icon.png` + a maskable-safe variant;
  update `app/manifest.ts` `theme_color`/`background_color`.
  - **Why:** "The current icon is a placeholder blue disc" (audit §11).

- [ ] **"My Korean" summary** — a shareable quarterly/milestone stat card (Spotify-Wrapped-style)
  from `computeHabitStats` + `computeProficiency`: *"In 90 days you reviewed 1,240 cards, built a
  24-day streak, and reached B1."* New `app/wrapped/page.tsx` or a shareable component (image export).
  - **Why:** "Both a reward and an organic sharing surface" (audit §11).

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

*(Fill in as tasks land. Format: `[x] TASK — commit abc1234, YYYY-MM-DD`)*
