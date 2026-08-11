'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Virtuoso, type VirtuosoHandle, type StateSnapshot } from 'react-virtuoso'
import CardEditor from '@/components/CardEditor'
import LessonRangeFilter, { isFullSpan } from '@/components/LessonRangeFilter'
import HighlightedSentence from '@/components/HighlightedSentence'
import Sheet from '@/components/Sheet'
import SwipeRow from '@/components/SwipeRow'
import { useWordTap } from '@/components/GlossProvider'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { typeBadgeClass } from '@/lib/card-style'
import {
  fetchCacheContextOrLastKnown,
  readCache,
  writeCache,
  patchCachedCard,
  removeCachedCard,
  insertCachedCard,
  type CardsCachePayload,
} from '@/lib/local-cache'
import { usePullToRefresh, PULL_THRESHOLD } from '@/lib/usePullToRefresh'
import { haptic } from '@/lib/haptics'
import type {
  CardDTO,
  CardsPageDTO,
  GroupCountsDTO,
  LessonRefItem,
  SentenceDTO,
  SentencePageDTO,
} from '@/lib/dto'

type ActiveView = 'cards' | 'reading-practice'

// Minimal type matching CardEditor's local Card interface (structural duck-typing).
// The editor only touches id/type/front/back/notes/sentences; the rest of CardDTO
// is preserved via the spread in handleSave.
interface CardEditorShape {
  id: string
  type: string
  front: string
  back: string
  notes?: string | null
  // WR-04: the on-wire PUT response (what CardEditor's onSave actually hands
  // back) carries full SentenceDTO fields, but the duck-typed shape only
  // guarantees {id, korean, targetForm, translation} — the rest are declared
  // optional so handleSave can use them when present and reconstruct sane
  // fallbacks when not, instead of spreading an incomplete shape with an
  // unchecked `as CardDTO` cast.
  sentences?: {
    id: string
    korean: string
    targetForm: string
    translation: string
    cardId?: string
    orderIndex?: number
    createdAt?: string
    updatedAt?: string
  }[]
}

// Canonical type groups. Any type not in the first three goes to "other".
const TYPE_GROUPS = ['vocabulary', 'grammar', 'phrase'] as const
type GroupKey = (typeof TYPE_GROUPS)[number] | 'other'
const GROUP_KEYS: GroupKey[] = [...TYPE_GROUPS, 'other']
const PAGE_SIZE = 30
const SCROLL_LOAD_PROXIMITY = 5 // rows-from-boundary before auto-load fires (31-RESEARCH Pattern 3 / A4)

// Copywriting Contract strings (31-UI-SPEC.md) — defined as JS string
// constants (not inline JSX text) so an apostrophe/quote-carrying string can
// be rendered via a `{}` expression instead of raw JSX text. `react/no-
// unescaped-entities` only flags literal ' " > } characters written directly
// as JSX children, not characters inside a JS string referenced via `{}` —
// this keeps `npm run lint` clean while keeping every copy string an exact,
// grep-able literal (phase verification greps for these verbatim).
const COPY = {
  loadingMore: 'Loading more…',
  endOfList: "You've reached the end.",
  batchLoadError: "Couldn't load more cards. Check your connection and try again.",
  filterNoMatches: 'No cards match this filter.',
  queryError: "Couldn't search right now. Try again.",
  deleteError: "Couldn't delete this card. Check your connection and try again.",
  noCardsAtAll: 'No cards yet. Sync your Google Doc to get started.',
  noSentencesYet: 'No example sentences yet. Sync a lesson to generate them.',
  noSentencesFilterMatch: 'No example sentences match your filter.',
  editSentencesLoadError: "Couldn't load this card's sentences. Try again.",
} as const

const noResultsFor = (query: string): string => `No results for "${query}".`

interface GroupState {
  loaded: CardDTO[]
  nextCursor: string | null
  hasMore: boolean
  loading: boolean
  error: string | null
}

const EMPTY_GROUP_STATE: GroupState = { loaded: [], nextCursor: null, hasMore: false, loading: false, error: null }

interface SearchState {
  loaded: CardDTO[]
  nextCursor: string | null
  hasMore: boolean
  querying: boolean // a NEW query (debounce-settled term/filter/lesson change) is in flight
  loadingMore: boolean // a next-page (scroll-triggered) fetch is in flight
  loadMoreError: string | null
}

const EMPTY_SEARCH_STATE: SearchState = {
  loaded: [],
  nextCursor: null,
  hasMore: false,
  querying: false,
  loadingMore: false,
  loadMoreError: null,
}

// D-07's independent Reading Practice fetch state — Sentence (not Card) is
// the row unit, sourced from GET /api/cards/sentences (lib/cards-list.ts
// getSentencesPage), never derived from whatever page of the Cards tab's
// Vocabulary group happens to be loaded (the 31-01 interim this plan
// replaces). `loading` covers BOTH the initial page fetch and a
// scroll-triggered next-page append — distinguished at render time by
// whether `loaded` is already non-empty.
interface ReadingPracticeState {
  loaded: (SentenceDTO & { card: CardDTO })[]
  nextCursor: string | null
  hasMore: boolean
  loading: boolean
  error: string | null
}

const EMPTY_READING_STATE: ReadingPracticeState = {
  loaded: [],
  nextCursor: null,
  hasMore: false,
  loading: false,
  error: null,
}

// Composed-row shape for the single flat <Virtuoso> instance (31-RESEARCH.md
// Pattern 2). Group headers, skeleton placeholders, and status captions are
// all just rows, not a separate library API — this is what lets the grouped
// browse view (D-01/D-02) and the flattened search view (D-06) share one list.
type Row =
  | { kind: 'header'; groupKey: GroupKey; label: string; count: number; collapsed: boolean }
  | { kind: 'card'; groupKey: GroupKey; card: CardDTO }
  | { kind: 'skeleton'; sectionKey: string; skeletonId: number }
  | { kind: 'status'; sectionKey: string; status: 'loading-more' | 'end' | 'error' }

// Reading Practice's own composed-row shape (D-07) — a flat sentence
// stream, never type-grouped, so there's no 'header' variant here.
type ReadingRow =
  | { kind: 'sentence'; sentence: SentenceDTO & { card: CardDTO } }
  | { kind: 'skeleton'; skeletonId: number }
  | { kind: 'status'; status: 'loading-more' | 'end' | 'error' }

function labelForGroup(key: GroupKey): string {
  return key === 'other' ? 'Other' : key.charAt(0).toUpperCase() + key.slice(1)
}

// Full-deck count for a UI group key, sourced from the server-aggregated
// groupCounts — NEVER from the length of whatever happens to be loaded
// client-side (CARDS-01 prohibition). 'other' sums every type not in the
// three canonical buckets.
function countForGroup(groupCounts: GroupCountsDTO, key: GroupKey): number {
  if (key === 'other') {
    return groupCounts.byType
      .filter((g) => !(TYPE_GROUPS as readonly string[]).includes(g.type))
      .reduce((sum, g) => sum + g._count, 0)
  }
  return groupCounts.byType.find((g) => g.type === key)?._count ?? 0
}

function groupKeyForType(type: string): GroupKey {
  return (TYPE_GROUPS as readonly string[]).includes(type) ? (type as GroupKey) : 'other'
}

function skeletonRows(sectionKey: string, n: number): Row[] {
  return Array.from({ length: n }, (_, i) => ({ kind: 'skeleton' as const, sectionKey, skeletonId: i }))
}

type CardsPageResponse = CardsPageDTO & { groupCounts?: GroupCountsDTO }

// Server-side fetch for a single page of cards (CARDS-01/CARDS-03) — every
// filtering/search decision this component makes originates from this call,
// never from an in-memory re-filter of an already-loaded array.
async function fetchCardsPage(params: {
  type: string
  cursor: string | null
  search: string | null
  lessonFrom: number | null
  lessonTo: number | null
  take: number
}): Promise<CardsPageResponse> {
  const qs = new URLSearchParams()
  qs.set('type', params.type)
  if (params.cursor) qs.set('cursor', params.cursor)
  if (params.search) qs.set('search', params.search)
  if (params.lessonFrom !== null) qs.set('lessonFrom', String(params.lessonFrom))
  if (params.lessonTo !== null) qs.set('lessonTo', String(params.lessonTo))
  qs.set('take', String(params.take))
  const res = await fetch(`/api/cards?${qs.toString()}`)
  if (!res.ok) throw new Error(`Failed: ${res.status}`)
  return res.json()
}

// D-07 — Reading Practice's own independent fetch, entirely separate from
// fetchCardsPage above. Shares the search/lesson-range params (a single
// search box and Filter Sheet drive both views) but intentionally ignores
// the type-pill filter — Reading Practice is a flat sentence stream, not
// type-grouped (must_haves.truths backstop item).
async function fetchSentencesPage(params: {
  cursor: string | null
  search: string | null
  lessonFrom: number | null
  lessonTo: number | null
  take: number
}): Promise<SentencePageDTO> {
  const qs = new URLSearchParams()
  if (params.cursor) qs.set('cursor', params.cursor)
  if (params.search) qs.set('search', params.search)
  if (params.lessonFrom !== null) qs.set('lessonFrom', String(params.lessonFrom))
  if (params.lessonTo !== null) qs.set('lessonTo', String(params.lessonTo))
  qs.set('take', String(params.take))
  const res = await fetch(`/api/cards/sentences?${qs.toString()}`)
  if (!res.ok) throw new Error(`Failed: ${res.status}`)
  return res.json()
}

interface Props {
  initialCardsPage: CardsPageDTO
  initialGroupCounts: GroupCountsDTO
  initialLessons: LessonRefItem[]
}

export default function CardsClient({ initialCardsPage, initialGroupCounts, initialLessons }: Props) {
  // Per-group cursor state — one entry per type-group, independently
  // paginated/loaded/collapsed (D-01/D-02/D-03). Only `vocabulary` starts
  // populated (from the SSR-provided initialCardsPage); Grammar/Phrase/Other
  // fetch lazily on first expand (Task 2 below).
  const [groups, setGroups] = useState<Record<GroupKey, GroupState>>({
    vocabulary: {
      loaded: initialCardsPage.cards,
      nextCursor: initialCardsPage.nextCursor,
      hasMore: initialCardsPage.hasMore,
      loading: false,
      error: null,
    },
    grammar: { ...EMPTY_GROUP_STATE },
    phrase: { ...EMPTY_GROUP_STATE },
    other: { ...EMPTY_GROUP_STATE },
  })
  const [groupCounts, setGroupCounts] = useState<GroupCountsDTO>(initialGroupCounts)

  // Only Vocabulary starts expanded (D-02).
  const [collapsed, setCollapsed] = useState<Record<GroupKey, boolean>>({
    vocabulary: false,
    grammar: true,
    phrase: true,
    other: true,
  })

  // ── Search (raw input + debounced + server-driven flattened results) ────
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 300)
  const searchActive = debouncedSearch.length > 0
  const [searchResults, setSearchResults] = useState<SearchState>(EMPTY_SEARCH_STATE)

  // ── Committed filter/lesson-range (drives every server fetch) vs. the
  // Filter Sheet's own pending edits (drives only the Sheet's UI) — D-06/
  // CARDS-03 require server round trips, so a filter change is only applied
  // (re-issues the query) when the user taps "Done", not on every pill tap.
  const [filter, setFilter] = useState<string>('all')
  const [pendingFilter, setPendingFilter] = useState<string>('all')
  const [lessons] = useState<LessonRefItem[]>(initialLessons)
  const [lessonFrom, setLessonFrom] = useState(() =>
    initialLessons.length > 0 ? initialLessons[0].orderIndex : 1
  )
  const [lessonTo, setLessonTo] = useState(() =>
    initialLessons.length > 0 ? initialLessons[initialLessons.length - 1].orderIndex : 1
  )
  const [pendingLessonFrom, setPendingLessonFrom] = useState(lessonFrom)
  const [pendingLessonTo, setPendingLessonTo] = useState(lessonTo)
  const [filterOpen, setFilterOpen] = useState(false)

  const [showAdd, setShowAdd] = useState(false)
  const [newCard, setNewCard] = useState({ type: 'vocabulary', front: '', back: '', notes: '' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [activeView, setActiveView] = useState<ActiveView>('cards')

  // ── Reading Practice (D-07 independent fetch, D-08 tab-state preservation) ──
  const [readingPractice, setReadingPractice] = useState<ReadingPracticeState>(EMPTY_READING_STATE)
  // Stale-response guard, mirroring filterGenerationRef below — a search/
  // lesson-range change while a Reading Practice fetch is in flight must not
  // let the superseded response overwrite newer results.
  const readingPracticeGenerationRef = useRef(0)
  // Fetched lazily, exactly once, the first time the user switches to the
  // Reading Practice tab (mirrors a collapsed Cards group's expand-on-tap
  // gate) — never re-fetched merely by switching tabs (D-08).
  const readingPracticeVisitedRef = useRef(false)

  // D-08: react-virtuoso's own documented snapshot/restore pair for
  // preserving scroll position across the conditional-mount/unmount that
  // happens when `activeView` toggles (31-RESEARCH.md Pattern 4) — a
  // `display:none`-hidden mounted Virtuoso risks broken height
  // computation on unhide, so the officially-supported approach is used
  // instead. The `groups`/`readingPractice` row DATA already survives the
  // toggle regardless, since it lives in this component's own state, not
  // inside the <Virtuoso> subtree.
  const cardsVirtuosoRef = useRef<VirtuosoHandle>(null)
  const [cardsSnapshot, setCardsSnapshot] = useState<StateSnapshot | undefined>(undefined)
  const readingVirtuosoRef = useRef<VirtuosoHandle>(null)
  const [readingSnapshot, setReadingSnapshot] = useState<StateSnapshot | undefined>(undefined)

  // Route-local pull-to-refresh failure (LOCAL-04, Task 3) — distinct state,
  // distinct copy from queryError/COPY.batchLoadError below; a gesture
  // failure is a different user action from a search or scroll-continuation
  // failure.
  const [refreshError, setRefreshError] = useState(false)

  // Shared error for a failed SEARCH request or a failed FILTER-COMMIT
  // request (Done-triggered first-page refresh) — both surface the same
  // "Couldn't search right now. Try again." copy per the must_haves backstop
  // (distinct from an ordinary scroll-triggered batch-load failure, which
  // stays inline per-group with "Couldn't load more cards…" copy).
  const [queryError, setQueryError] = useState<string | null>(null)

  // WR-06: a failed delete previously only `console.error`'d — the swiped
  // row just silently reappeared with no explanation. Mirrors the
  // queryError banner pattern (own state, own copy, dismissible), but kept
  // separate since "Try again" for a delete means retrying THAT specific
  // card's delete, not re-running the current query.
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // Edit sheet state. CardsClient no longer holds sentences for any loaded
  // list row (CARDS-01 drops `sentences` from the list query's `select`) —
  // CardEditor's handleSave unconditionally PUTs whatever `sentences` array
  // it was seeded with, and the PUT handler treats ANY array (including [])
  // as "replace all sentences". Opening the editor with a sentence-free
  // CardDTO and saving any field would therefore silently delete every real
  // Sentence row for that card. Fix: fetch the full card (with real
  // sentences) via GET /api/cards/[id] before CardEditor ever mounts.
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingDetail, setEditingDetail] = useState<CardDTO | null>(null)
  const [editingDetailLoading, setEditingDetailLoading] = useState(false)
  const [editingDetailError, setEditingDetailError] = useState(false)
  // Task 2 (E4): the already-in-memory front/back/notes/type — seeded from
  // whichever loaded row the user tapped "Edit" on — so those fields render
  // editable IMMEDIATELY on sheet-open, with no wait for the sentences
  // fetch. Only the sentence-editor section is gated on `editingDetail`
  // resolving; these core fields never are. `null` only in the defensive
  // case where no matching loaded summary can be found (shouldn't normally
  // happen — `openEdit` is always called from an already-rendered row).
  const [editingDraft, setEditingDraft] = useState<{
    type: string
    front: string
    back: string
    notes: string
  } | null>(null)
  // Race guard: an in-flight fetch for a since-closed/reopened id must never
  // clobber a newer id's state. Read at async-completion time (not a stale
  // render-time closure) — same pattern as StudyClient.tsx's phaseRef.
  const editingIdRef = useRef<string | null>(null)

  // Looks up the already-loaded summary CardDTO for `id` across every
  // client-held row source (grouped browse, flattened search results,
  // Reading Practice's own sentence rows) — this is what lets the Edit
  // sheet render front/back/notes/type instantly, before GET /api/cards/[id]
  // resolves.
  const findLoadedCardSummary = (id: string): CardDTO | undefined => {
    for (const key of GROUP_KEYS) {
      const found = groups[key].loaded.find((c) => c.id === id)
      if (found) return found
    }
    const foundSearch = searchResults.loaded.find((c) => c.id === id)
    if (foundSearch) return foundSearch
    const foundReading = readingPractice.loaded.find((s) => s.card.id === id)
    if (foundReading) return foundReading.card
    return undefined
  }

  const fetchEditingDetail = (id: string) => {
    editingIdRef.current = id
    setEditingDetailError(false)
    setEditingDetailLoading(true)
    fetch(`/api/cards/${id}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: CardDTO) => {
        if (editingIdRef.current !== id) return
        setEditingDetail(data)
      })
      .catch(() => {
        if (editingIdRef.current !== id) return
        setEditingDetailError(true)
      })
      .finally(() => {
        if (editingIdRef.current !== id) return
        setEditingDetailLoading(false)
      })
  }

  const openEdit = (id: string) => {
    const summary = findLoadedCardSummary(id)
    setEditingId(id)
    setEditingDetail(null)
    setEditingDraft(
      summary
        ? { type: summary.type, front: summary.front, back: summary.back, notes: summary.notes ?? '' }
        : null
    )
    fetchEditingDetail(id)
  }

  const closeEdit = () => {
    editingIdRef.current = null
    setEditingId(null)
    setEditingDetail(null)
    setEditingDetailError(false)
    setEditingDraft(null)
  }

  const maxOrder = lessons.length > 0 ? lessons[lessons.length - 1].orderIndex : 1
  const fullSpan = isFullSpan(lessonFrom, lessonTo, maxOrder)
  const pendingFullSpan = isFullSpan(pendingLessonFrom, pendingLessonTo, maxOrder)

  // Badge count: how many COMMITTED filter dimensions are active (not the
  // Sheet's unsaved pending edits).
  const activeFilterCount = (filter !== 'all' ? 1 : 0) + (!fullSpan ? 1 : 0)
  const pendingActiveCount = (pendingFilter !== 'all' ? 1 : 0) + (!pendingFullSpan ? 1 : 0)
  const hasActiveClientQuery = searchActive || filter !== 'all' || !fullSpan

  // Gated adoption of a fresh initialCardsPage (26-01-PLAN.md design decision
  // 4d, extended to the per-group shape). FreshnessWatcher's router.refresh()
  // re-delivers initialCardsPage/initialGroupCounts with new object
  // references at every boundary refresh. Never adopt a payload that arrived
  // while a sheet was open — see the original rationale preserved verbatim
  // below. 31-02 addition: also never adopt while a client-side search/
  // filter/lesson-range query is active — initialCardsPage/initialGroupCounts
  // are always the server's UNFILTERED default page-1 view (the RSC page has
  // no knowledge of client-side filter state), so blindly adopting it while
  // the user has a filtered view open would silently overwrite their
  // filtered results with the wrong (unfiltered) data — a real regression
  // this plan's server-side-filtering change would otherwise introduce.
  const [prevInitialCardsPage, setPrevInitialCardsPage] = useState(initialCardsPage)
  if (initialCardsPage !== prevInitialCardsPage) {
    setPrevInitialCardsPage(initialCardsPage)
    if (editingId === null && !showAdd && !adding && deletingIds.size === 0 && !hasActiveClientQuery) {
      setGroups((prev) => ({
        ...prev,
        vocabulary: {
          loaded: initialCardsPage.cards,
          nextCursor: initialCardsPage.nextCursor,
          hasMore: initialCardsPage.hasMore,
          loading: false,
          error: null,
        },
      }))
    }
  }

  const [prevInitialGroupCounts, setPrevInitialGroupCounts] = useState(initialGroupCounts)
  if (initialGroupCounts !== prevInitialGroupCounts) {
    setPrevInitialGroupCounts(initialGroupCounts)
    if (editingId === null && !showAdd && !adding && deletingIds.size === 0 && !hasActiveClientQuery) {
      setGroupCounts(initialGroupCounts)
    }
  }

  // ── Local-first cache (Phase 34, LOCAL-01/02/03/04/05) ───────────────────
  // Replaces the retired JSON-backstop hook this file used to consume from
  // FreshnessWatcher.tsx (D-00 rule 3) — the cache-read + version-checked
  // revalidation below is the same "second, Suspense-independent delivery
  // path" purpose, now owned by this file instead. The /api/version value +
  // buildId this mount observed are held in refs (not state) so the
  // write-through call sites in handleSave/handleDelete/handleAdd and the
  // persistence effect below never need a second fetch.
  const versionRef = useRef<string | null>(null)
  const buildIdRef = useRef<string | null>(null)
  const [isRevalidating, setIsRevalidating] = useState(false)
  // Flips true once the mount effect has resolved fetchCacheContextOrLastKnown() and
  // populated versionRef/buildIdRef. A plain ref write does NOT re-trigger
  // the persistence effect below (refs aren't reactive) — without this state
  // flag, a true cold start (no prior cache entry, so the mount effect never
  // calls setGroups/setGroupCounts) would never write ANYTHING to the cache
  // until some unrelated later interaction happened to change groups/
  // groupCounts. Included in the persistence effect's dep array precisely so
  // its very first successful write can fire off of THIS flag alone.
  const [cacheReady, setCacheReady] = useState(false)

  // Kept in sync on every render (a plain assignment, not a setState call —
  // safe outside an effect) so an async continuation resolving mid-flight
  // (the mount effect below awaits the cache context/entry reads and N group
  // fetches) reads the INTERACTION STATE AT THE MOMENT OF ADOPTION, not a
  // stale closure captured at mount. Same four-part guard this file already
  // uses for RSC-prop adoption (prevInitialCardsPage/prevInitialGroupCounts
  // above), extended with !hasActiveClientQuery so a filtered/searched view
  // is never overwritten by the unfiltered cached entry.
  const canAdoptCacheRef = useRef(false)
  canAdoptCacheRef.current =
    editingId === null && !showAdd && !adding && deletingIds.size === 0 && !hasActiveClientQuery

  // Live mirror of `groups`, kept in sync via a plain (non-setState)
  // assignment on every render — same idiom as `canAdoptCacheRef` just above.
  // Lets the boundary-event revalidation below (Rule 2 auto-add, see
  // 34-05-SUMMARY.md Deviations) read "what's currently loaded" without
  // depending on `groups` itself, which would otherwise force a brand-new
  // listener registration on every group-content change.
  const groupsRef = useRef(groups)
  groupsRef.current = groups

  // Shared revalidation body (mirrors HabitsClient.tsx's/StudyClient.tsx's
  // `revalidate`, 34-01/34-02-PLAN.md precedent — added here as a Rule 2
  // auto-add during 34-05's FreshnessWatcher narrowing, see SUMMARY
  // Deviations): fetches, per already-loaded group, exactly that group's
  // current row count (D-05 — never a full-deck fetch), applies the SAME
  // discard guard the mount effect already uses (canAdoptCacheRef), then
  // writes the merged snapshot through to the cache regardless of whether
  // adoption was rejected.
  const revalidate = useCallback(async (buildId: string, version: string, cancelledRef: { current: boolean }) => {
    setIsRevalidating(true)
    try {
      const sourceGroups = groupsRef.current
      const loadedLenFor = (key: GroupKey) => sourceGroups[key]?.loaded.length ?? 0
      const keysToRevalidate = GROUP_KEYS.filter((key) => loadedLenFor(key) > 0)
      const fetchResults = await Promise.all(
        keysToRevalidate.map(async (key) => {
          const page = await fetchCardsPage({
            type: key,
            cursor: null,
            search: null,
            lessonFrom: null,
            lessonTo: null,
            take: loadedLenFor(key),
          })
          return { key, page }
        })
      )
      if (cancelledRef.current) return
      if (canAdoptCacheRef.current) {
        let latestCounts: GroupCountsDTO | undefined
        for (const { key, page } of fetchResults) {
          applyGroupPage(key, page, 'replace')
          if (page.groupCounts) latestCounts = page.groupCounts
        }
        if (latestCounts) setGroupCounts(latestCounts)
      }
    } catch {
      // Silent — the already-painted cached (or RSC) rows stand (UI-SPEC E3
      // error). No error copy for a background revalidation failure.
    } finally {
      if (!cancelledRef.current) setIsRevalidating(false)
    }
  }, [])

  // Cache-first mount read + version-checked revalidation (LOCAL-01/02/05).
  // Paints the session-accumulated groups from IndexedDB before GET
  // /api/cards resolves; revalidates only when GET /api/version reports a
  // different value than the one the cache entry was written with (D-00
  // rule 2 — never on elapsed time), and only for groups that already have
  // loaded rows (D-05 — never a full-deck fetch).
  useEffect(() => {
    const cancelledRef = { current: false }
    ;(async () => {
      const ctx = await fetchCacheContextOrLastKnown()
      if (cancelledRef.current || !ctx) return // offline cold path — RSC props already rendered
      const { version, buildId } = ctx
      versionRef.current = version
      buildIdRef.current = buildId
      setCacheReady(true)

      const cached = await readCache<CardsCachePayload>(buildId, 'cards')
      if (cancelledRef.current) return

      if (cached && canAdoptCacheRef.current) {
        const adopted: Record<GroupKey, GroupState> = { ...groupsRef.current }
        for (const key of GROUP_KEYS) {
          const g = cached.data.groups[key]
          adopted[key] = g ? { ...g, loading: false, error: null } : { ...EMPTY_GROUP_STATE }
        }
        setGroups(adopted)
        // React batches this setGroups call rather than applying it
        // synchronously — seed groupsRef directly so the revalidate() call
        // just below (still in this same synchronous block, no intervening
        // render) reads the just-adopted cached groups, not the stale
        // pre-adoption ref value.
        groupsRef.current = adopted
        setGroupCounts(cached.data.groupCounts)
        setCollapsed((prev) => {
          const next = { ...prev }
          for (const key of GROUP_KEYS) {
            const g = cached.data.groups[key]
            if (g && g.loaded.length > 0) next[key] = false
          }
          return next
        })
      }

      // Revalidate only when there's an EXISTING stale entry to correct.
      // A true cold start (no entry at all) deliberately skips this fetch —
      // the just-rendered initialCardsPage RSC props are already the
      // freshest possible data for a first-ever visit, so an immediate
      // client-side re-fetch of the exact same page would be pure waste (and
      // would regress Phase 31's cards-tab-switch-scroll.spec.ts, which
      // asserts zero /api/cards requests across a tab-switch flow with no
      // prior cache — see this plan's SUMMARY Deviations).
      if (cached && cached.dataVersion !== version) {
        await revalidate(buildId, version, cancelledRef)
      }
    })()
    return () => { cancelledRef.current = true }
  }, [revalidate])

  // Boundary-event revalidation (Rule 2 auto-add — see 34-05-SUMMARY.md
  // Deviations): /cards has its own app/cards/loading.tsx, making it one of
  // the exact routes affected by the same real, unfixed Next.js 16.2.1
  // RSC-application flake 34-01-SUMMARY.md's Deviation #2 found and fixed for
  // /habits, and 34-02-SUMMARY.md replicated for /study — a boundary-
  // triggered router.refresh() can fetch a fresh RSC payload on the server
  // but silently fail to apply it to the already-mounted client tree. Before
  // this fix, /cards had NO revalidation trigger on visibilitychange/
  // popstate/pageshow at all (only a mount-time check), which the retired
  // FreshnessWatcher JSON backstop used to cover for. Mirrors
  // HabitsClient.tsx's/StudyClient.tsx's second effect exactly: re-checks
  // /api/version on the same three events, with the same 300ms coalesce
  // guard.
  useEffect(() => {
    const cancelledRef = { current: false }
    const lastCheckRef = { current: 0 }
    const check = () => {
      const now = Date.now()
      if (now - lastCheckRef.current < 300) return
      lastCheckRef.current = now
      ;(async () => {
        const ctx = await fetchCacheContextOrLastKnown()
        if (cancelledRef.current || !ctx) return
        if (ctx.version !== versionRef.current) {
          buildIdRef.current = ctx.buildId
          await revalidate(ctx.buildId, ctx.version, cancelledRef)
          if (!cancelledRef.current) versionRef.current = ctx.version
        }
      })()
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') check()
    }
    const onPopState = () => { setTimeout(check, 0) }
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) check() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('popstate', onPopState)
    window.addEventListener('pageshow', onPageShow)
    return () => {
      cancelledRef.current = true
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('popstate', onPopState)
      window.removeEventListener('pageshow', onPageShow)
    }
  }, [revalidate])

  // Group-snapshot persistence effect (D-05 accumulation): whenever the
  // session-accumulated groups/groupCounts change AND no client-side query
  // is active AND no group is mid-fetch, write the current snapshot through
  // to the cache. Writes only — never a setState call — so this can never
  // itself trigger the loop it depends on. A filtered/searched view is never
  // persisted as the default browse view (T-34-11).
  useEffect(() => {
    if (hasActiveClientQuery) return
    const buildId = buildIdRef.current
    const version = versionRef.current
    if (!buildId || !version) return
    if (GROUP_KEYS.some((key) => groups[key].loading)) return
    const strippedGroups: CardsCachePayload['groups'] = {}
    for (const key of GROUP_KEYS) {
      strippedGroups[key] = {
        loaded: groups[key].loaded,
        nextCursor: groups[key].nextCursor,
        hasMore: groups[key].hasMore,
      }
    }
    void writeCache(buildId, 'cards', { groups: strippedGroups, groupCounts }, version)
    // cacheReady is intentionally a dependency (not just a guard read via
    // ref) — see its declaration comment above: it's what lets a true cold
    // start's first write fire off of the mount effect resolving alone,
    // without requiring groups/groupCounts to ALSO change from some
    // unrelated later interaction.
  }, [groups, groupCounts, hasActiveClientQuery, cacheReady])

  // ── Stale-response / out-of-order-response guards (CARDS-03) ────────────
  // A strictly later request advances these refs past whatever an earlier,
  // slower response captured in its closure — so a late-resolving response
  // is silently discarded instead of overwriting newer results.
  const searchSeqRef = useRef(0)
  const filterGenerationRef = useRef(0)
  // Tracks the {filter, lessonFrom, lessonTo} the grouped (non-search) view
  // was last actually fetched under, so clearing the search box alone
  // re-hydrates the existing grouped state instead of re-fetching it.
  const lastGroupedParamsRef = useRef<{ filter: string; lessonFrom: number; lessonTo: number } | null>(null)
  const didMountRef = useRef(false)
  // Tracks whether the PREVIOUS runQuery() invocation was in search mode, so
  // a search→non-search transition (clearing the search box) can force a
  // grouped refetch even when {filter, lessonFrom, lessonTo} never changed —
  // otherwise groupCounts stays stuck at the search-narrowed values (CR-01).
  const wasSearchActiveRef = useRef(false)

  // ── Mutation helpers ─────────────────────────────────────────────────────
  const bumpGroupCount = (type: string, delta: number) => {
    setGroupCounts((prev) => {
      const idx = prev.byType.findIndex((g) => g.type === type)
      const byType =
        idx >= 0
          ? prev.byType.map((g, i) => (i === idx ? { ...g, _count: g._count + delta } : g))
          : [...prev.byType, { type, _count: delta }]
      return { byType, total: prev.total + delta }
    })
  }

  const applyGroupPage = (key: GroupKey, page: CardsPageDTO, mode: 'replace' | 'append') => {
    setGroups((prev) => ({
      ...prev,
      [key]: {
        loaded: mode === 'replace' ? page.cards : [...prev[key].loaded, ...page.cards],
        nextCursor: page.nextCursor,
        hasMore: page.hasMore,
        loading: false,
        error: null,
      },
    }))
  }

  // Ordinary batch fetch (expand-on-tap first page, or scroll-triggered next
  // page) — a failure surfaces INLINE in that group's own row ("Couldn't
  // load more cards…", Task 2's copy), and already-loaded rows above it stay
  // untouched (partial-failure-tolerant).
  const fetchGroupPage = (key: GroupKey, cursor: string | null, mode: 'replace' | 'append') => {
    const generation = filterGenerationRef.current
    setGroups((prev) => ({ ...prev, [key]: { ...prev[key], loading: true, error: null } }))
    fetchCardsPage({
      type: key,
      cursor,
      search: null,
      lessonFrom: fullSpan ? null : lessonFrom,
      lessonTo: fullSpan ? null : lessonTo,
      take: PAGE_SIZE,
    })
      .then((page) => {
        if (filterGenerationRef.current !== generation) return // superseded by a newer filter/lesson-range commit
        applyGroupPage(key, page, mode)
        if (page.groupCounts) setGroupCounts(page.groupCounts)
      })
      .catch(() => {
        if (filterGenerationRef.current !== generation) return
        setGroups((prev) => ({ ...prev, [key]: { ...prev[key], loading: false, error: COPY.batchLoadError } }))
      })
  }

  const fetchGroupNextPage = (key: GroupKey) => {
    const g = groups[key]
    if (!g || g.loading || !g.hasMore) return
    fetchGroupPage(key, g.nextCursor, 'append')
  }

  const retryGroupFetch = (key: GroupKey) => {
    const g = groups[key]
    if (!g) return
    fetchGroupPage(key, g.loaded.length === 0 ? null : g.nextCursor, g.loaded.length === 0 ? 'replace' : 'append')
  }

  // Filter-commit-triggered first-page fetch (Done button) — a failure here
  // surfaces the SHARED "Couldn't search right now…" banner instead of an
  // inline per-group error, per the must_haves backstop resolving E7's
  // ambiguity (a filter-commit failure must not stall silently or look like
  // an ordinary scroll-continuation failure).
  const fetchGroupPageForFilterCommit = (key: GroupKey, generation: number) => {
    setGroups((prev) => ({ ...prev, [key]: { ...prev[key], loading: true, error: null } }))
    fetchCardsPage({
      type: key,
      cursor: null,
      search: null,
      lessonFrom: fullSpan ? null : lessonFrom,
      lessonTo: fullSpan ? null : lessonTo,
      take: PAGE_SIZE,
    })
      .then((page) => {
        if (filterGenerationRef.current !== generation) return
        applyGroupPage(key, page, 'replace')
        if (page.groupCounts) setGroupCounts(page.groupCounts)
      })
      .catch(() => {
        if (filterGenerationRef.current !== generation) return
        setGroups((prev) => ({ ...prev, [key]: { ...prev[key], loading: false } }))
        setQueryError(COPY.queryError)
      })
  }

  // Expand-on-tap (Task 2/D-02): a collapsed group that has never loaded any
  // rows fetches its first page the moment it's expanded. Re-expanding a
  // group that already has loaded rows never refetches (D-04 continuity).
  const toggleCollapse = (key: GroupKey) => {
    const wasCollapsed = collapsed[key]
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))
    if (wasCollapsed) {
      const g = groups[key]
      if (g.loaded.length === 0 && !g.loading) {
        fetchGroupPage(key, null, 'replace')
      }
    }
  }

  // ── Route-local pull-to-refresh (LOCAL-04, D-04, D-05, Task 3) ──────────
  // NOT parameterised with, and never sharing code with, Home's handleSync —
  // this bypasses BOTH the IndexedDB read and the /api/version comparison
  // (unconditional fetch) and never calls POST /api/sync. Bounded strictly to
  // what the session already loaded: one fetchCardsPage per group with
  // loaded.length > 0, at that group's exact current loaded.length — never a
  // single unbounded query (RESEARCH Pitfall 5, T-34-13).
  const handleRefresh = useCallback(async () => {
    haptic('impact-light')
    setRefreshError(false)
    try {
      const ctx = await fetchCacheContextOrLastKnown() // stamps the write only — not a gate
      filterGenerationRef.current += 1
      const generation = filterGenerationRef.current
      const keys = GROUP_KEYS.filter((key) => groups[key].loaded.length > 0)
      const fetchResults = await Promise.all(
        keys.map(async (key) => {
          const page = await fetchCardsPage({
            type: key,
            cursor: null,
            search: null,
            lessonFrom: fullSpan ? null : lessonFrom,
            lessonTo: fullSpan ? null : lessonTo,
            take: groups[key].loaded.length,
          })
          return { key, page }
        })
      )
      if (filterGenerationRef.current !== generation) return // superseded by a newer filter/lesson-range commit
      let latestCounts: GroupCountsDTO | undefined
      for (const { key, page } of fetchResults) {
        applyGroupPage(key, page, 'replace')
        if (page.groupCounts) latestCounts = page.groupCounts
      }
      if (latestCounts) setGroupCounts(latestCounts)

      if (ctx) {
        versionRef.current = ctx.version
        buildIdRef.current = ctx.buildId
        const freshByKey = new Map(fetchResults.map(({ key, page }) => [key, page]))
        const strippedGroups: CardsCachePayload['groups'] = {}
        for (const key of GROUP_KEYS) {
          const fresh = freshByKey.get(key)
          strippedGroups[key] = fresh
            ? { loaded: fresh.cards, nextCursor: fresh.nextCursor, hasMore: fresh.hasMore }
            : { loaded: groups[key].loaded, nextCursor: groups[key].nextCursor, hasMore: groups[key].hasMore }
        }
        await writeCache(
          ctx.buildId,
          'cards',
          { groups: strippedGroups, groupCounts: latestCounts ?? groupCounts },
          ctx.version
        )
      }
    } catch {
      setRefreshError(true)
    }
  }, [groups, groupCounts, fullSpan, lessonFrom, lessonTo, filter])

  const { pullDistance, refreshing } = usePullToRefresh(handleRefresh)

  const fetchSearchNextPage = () => {
    if (searchResults.loadingMore || searchResults.querying || !searchResults.hasMore) return
    const seq = ++searchSeqRef.current
    setSearchResults((prev) => ({ ...prev, loadingMore: true, loadMoreError: null }))
    fetchCardsPage({
      type: filter,
      cursor: searchResults.nextCursor,
      search: debouncedSearch,
      lessonFrom: fullSpan ? null : lessonFrom,
      lessonTo: fullSpan ? null : lessonTo,
      take: PAGE_SIZE,
    })
      .then((page) => {
        if (searchSeqRef.current !== seq) return
        setSearchResults((prev) => ({
          loaded: [...prev.loaded, ...page.cards],
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          querying: false,
          loadingMore: false,
          loadMoreError: null,
        }))
      })
      .catch(() => {
        if (searchSeqRef.current !== seq) return
        setSearchResults((prev) => ({ ...prev, loadingMore: false, loadMoreError: COPY.batchLoadError }))
      })
  }

  // ── Reading Practice fetch (D-07) ────────────────────────────────────────
  // Entirely independent of the Cards tab's `groups`/`searchResults` state —
  // sourced from GET /api/cards/sentences (Sentence, not Card, is the row
  // unit), covering the full deck regardless of what's currently loaded in
  // the Cards tab. `mode: 'replace'` resets to a fresh first page (initial
  // visit, or a search/lesson-filter change); `'append'` is the
  // scroll-triggered next-page fetch.
  const fetchReadingPracticePage = (cursor: string | null, mode: 'replace' | 'append') => {
    const generation = ++readingPracticeGenerationRef.current
    setReadingPractice((prev) => ({ ...prev, loading: true, error: null }))
    fetchSentencesPage({
      cursor,
      search: searchActive ? debouncedSearch : null,
      lessonFrom: fullSpan ? null : lessonFrom,
      lessonTo: fullSpan ? null : lessonTo,
      take: PAGE_SIZE,
    })
      .then((page) => {
        if (readingPracticeGenerationRef.current !== generation) return // superseded by a newer search/lesson-range change
        setReadingPractice((prev) => ({
          loaded: mode === 'replace' ? page.sentences : [...prev.loaded, ...page.sentences],
          nextCursor: page.nextCursor,
          hasMore: page.hasMore,
          loading: false,
          error: null,
        }))
      })
      .catch(() => {
        if (readingPracticeGenerationRef.current !== generation) return
        setReadingPractice((prev) => ({ ...prev, loading: false, error: COPY.batchLoadError }))
      })
  }

  const fetchReadingPracticeNextPage = () => {
    if (readingPractice.loading || !readingPractice.hasMore) return
    fetchReadingPracticePage(readingPractice.nextCursor, 'append')
  }

  const retryReadingPracticeFetch = () => {
    fetchReadingPracticePage(
      readingPractice.loaded.length === 0 ? null : readingPractice.nextCursor,
      readingPractice.loaded.length === 0 ? 'replace' : 'append'
    )
  }

  // D-08: capture the currently-mounted view's scroll/measured-size snapshot
  // BEFORE the conditional-render swap unmounts it, then switch. Loaded row
  // DATA (`groups`/`readingPractice`) already survives regardless (it lives
  // in this component's own state), so only the Virtuoso-internal
  // scroll-position snapshot needs this explicit save/restore pair.
  const switchView = (view: ActiveView) => {
    if (view === activeView) return
    if (activeView === 'cards') {
      cardsVirtuosoRef.current?.getState((s) => setCardsSnapshot(s))
    } else {
      readingVirtuosoRef.current?.getState((s) => setReadingSnapshot(s))
    }
    setActiveView(view)
    if (view === 'reading-practice' && !readingPracticeVisitedRef.current) {
      readingPracticeVisitedRef.current = true
      fetchReadingPracticePage(null, 'replace')
    }
  }

  // ── The single query-runner (Task 1 + Task 3) ────────────────────────────
  // Branches on whether a search term is active. Search mode fetches ONE
  // flattened `type=<filter>&search=…` page (D-06) and never touches grouped
  // state. Grouped mode resets and refetches every currently-relevant
  // (type-filtered) group's first page, but ONLY for groups that are
  // currently expanded — a collapsed group's fetch still happens lazily on
  // its own expand-on-tap gate. `force` bypasses the "nothing actually
  // changed" skip so the "Try again" retry link always re-issues the request.
  const runQuery = (opts?: { force?: boolean }) => {
    const effLessonFrom = fullSpan ? null : lessonFrom
    const effLessonTo = fullSpan ? null : lessonTo
    const searchJustCleared = wasSearchActiveRef.current && !searchActive
    wasSearchActiveRef.current = searchActive

    if (searchActive) {
      setQueryError(null)
      const seq = ++searchSeqRef.current
      setSearchResults((prev) => ({ ...prev, querying: true, loadMoreError: null }))
      fetchCardsPage({
        type: filter,
        cursor: null,
        search: debouncedSearch,
        lessonFrom: effLessonFrom,
        lessonTo: effLessonTo,
        take: PAGE_SIZE,
      })
        .then((page) => {
          if (searchSeqRef.current !== seq) return
          setSearchResults({
            loaded: page.cards,
            nextCursor: page.nextCursor,
            hasMore: page.hasMore,
            querying: false,
            loadingMore: false,
            loadMoreError: null,
          })
          if (page.groupCounts) setGroupCounts(page.groupCounts)
        })
        .catch(() => {
          if (searchSeqRef.current !== seq) return
          setSearchResults((prev) => ({ ...prev, querying: false }))
          setQueryError(COPY.queryError)
        })
      return
    }

    // Grouped mode.
    const params = { filter, lessonFrom, lessonTo }
    const last = lastGroupedParamsRef.current
    const unchanged =
      !opts?.force &&
      !searchJustCleared &&
      !!last &&
      last.filter === params.filter &&
      last.lessonFrom === params.lessonFrom &&
      last.lessonTo === params.lessonTo
    if (unchanged) return
    lastGroupedParamsRef.current = params
    setQueryError(null)

    const generation = ++filterGenerationRef.current
    // Reset every group so a stale/irrelevant group never shows
    // filter-mismatched rows if later expanded.
    setGroups({
      vocabulary: { ...EMPTY_GROUP_STATE },
      grammar: { ...EMPTY_GROUP_STATE },
      phrase: { ...EMPTY_GROUP_STATE },
      other: { ...EMPTY_GROUP_STATE },
    })

    const relevant: GroupKey[] = filter === 'all' ? GROUP_KEYS : [filter as GroupKey]
    const expandedRelevant = relevant.filter((key) => !collapsed[key])

    if (expandedRelevant.length === 0) {
      // Nothing needs a row-fetch (e.g. narrowed to a still-collapsed
      // group), but header counts still need refreshing for the new
      // lesson-range/search scope.
      fetchCardsPage({ type: 'all', cursor: null, search: null, lessonFrom: effLessonFrom, lessonTo: effLessonTo, take: 1 })
        .then((page) => {
          if (filterGenerationRef.current === generation && page.groupCounts) setGroupCounts(page.groupCounts)
        })
        .catch(() => {})
      return
    }

    for (const key of expandedRelevant) {
      fetchGroupPageForFilterCommit(key, generation)
    }
  }

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true
      lastGroupedParamsRef.current = { filter, lessonFrom, lessonTo }
      return
    }
    runQuery()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filter, lessonFrom, lessonTo, fullSpan])

  // Reading Practice's own independent refetch (D-07/D-08) — a search or
  // lesson-range change re-issues its own first-page fetch, but ONLY once
  // the tab has been visited at least once (switchView's lazy first-fetch
  // gate above); the type-pill `filter` is deliberately NOT a dependency
  // here (Reading Practice ignores it — flat sentence stream, not
  // type-grouped). Runs independent of `didMountRef` since it has its own
  // "has this ever fetched" gate (`readingPracticeVisitedRef`).
  useEffect(() => {
    if (!readingPracticeVisitedRef.current) return
    fetchReadingPracticePage(null, 'replace')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, lessonFrom, lessonTo, fullSpan])

  // ── Filter Sheet open/commit (two-tier: pending edits vs. committed) ────
  const openFilterSheet = () => {
    setPendingFilter(filter)
    setPendingLessonFrom(lessonFrom)
    setPendingLessonTo(lessonTo)
    setFilterOpen(true)
  }

  const commitFilter = () => {
    setFilter(pendingFilter)
    setLessonFrom(pendingLessonFrom)
    setLessonTo(pendingLessonTo)
    // E6-adjacent: narrowing to exactly one type is a pointless filter if
    // that group stays collapsed — auto-expand it so the user sees results.
    if (pendingFilter !== 'all') {
      setCollapsed((prev) => ({ ...prev, [pendingFilter as GroupKey]: false }))
    }
    setFilterOpen(false)
  }

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (deletingIds.has(id)) return
    if (!confirm('Delete this card?')) return
    setDeletingIds((prev) => new Set(prev).add(id))
    setDeleteError(null)
    try {
      const res = await fetch(`/api/cards/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        // WR-06: surface the failure — the swiped row otherwise just
        // silently reappears with no explanation.
        console.error('Delete failed:', res.status)
        setDeleteError(COPY.deleteError)
        return
      }
      let deletedType: string | null = null
      setGroups((prev) => {
        const next = { ...prev }
        for (const key of GROUP_KEYS) {
          const found = next[key].loaded.find((c) => c.id === id)
          if (found) {
            deletedType = found.type
            next[key] = { ...next[key], loaded: next[key].loaded.filter((c) => c.id !== id) }
          }
        }
        return next
      })
      setSearchResults((prev) => {
        const found = prev.loaded.find((c) => c.id === id)
        if (found) deletedType = deletedType ?? found.type
        return { ...prev, loaded: prev.loaded.filter((c) => c.id !== id) }
      })
      // WR-03: prune any now-orphaned Reading Practice row(s) for the
      // deleted card — readingPractice state deliberately survives tab
      // switches (D-08), so without this a stale row referencing the
      // deleted card would persist until a full page reload.
      setReadingPractice((prev) =>
        prev.loaded.some((s) => s.card.id === id)
          ? { ...prev, loaded: prev.loaded.filter((s) => s.card.id !== id) }
          : prev
      )
      if (deletedType) bumpGroupCount(deletedType, -1)
      // Write-through (LOCAL-03/T-34-10): keeps the cached `cards` entry
      // consistent with this optimistic delete. Never called on the failure
      // branch above — the row stays on screen there, so the cache must too.
      if (buildIdRef.current) void removeCachedCard(buildIdRef.current, id)
      if (editingId === id) closeEdit()
    } catch (err) {
      console.error('Delete failed (network):', err)
      setDeleteError(COPY.deleteError)
    } finally {
      setDeletingIds((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const handleSave = (updated: CardEditorShape) => {
    // WR-04: reconstruct the full SentenceDTO shape explicitly (cardId/
    // orderIndex/createdAt/updatedAt) instead of spreading `updated`
    // wholesale over `c` with an unchecked `as CardDTO` cast.
    // CardEditorShape.sentences only guarantees {id, korean, targetForm,
    // translation} — the extra fields are present in the real PUT response
    // at runtime but aren't part of the declared type, so we use them when
    // present and fall back to sane reconstructed values when not.
    const merge = (c: CardDTO): CardDTO => ({
      ...c,
      type: updated.type,
      front: updated.front,
      back: updated.back,
      notes: updated.notes ?? null,
      sentences: (updated.sentences ?? []).map((s, i) => ({
        id: s.id,
        cardId: s.cardId ?? c.id,
        korean: s.korean,
        targetForm: s.targetForm,
        translation: s.translation,
        orderIndex: s.orderIndex ?? i,
        createdAt: s.createdAt ?? new Date().toISOString(),
        updatedAt: s.updatedAt ?? new Date().toISOString(),
      })),
      // CR-03: recompute from the freshly-saved sentences array on every
      // save — renderCardRow's `card.sentenceCount ?? card.sentences.length`
      // fallback only yields to sentences.length when sentenceCount is
      // null/undefined, so without this the badge stays stuck at whatever
      // count the original list fetch cached, even after a sentence
      // add/remove.
      sentenceCount: (updated.sentences ?? []).length,
    })
    // CR-02: resolve which bucket the card is CURRENTLY loaded in (if any)
    // before mutating state, so a type-changing save relocates it into
    // groupKeyForType(updated.type)'s bucket instead of patching it in place
    // inside its old bucket.
    const oldKeyEntry = GROUP_KEYS.map((key) => ({
      key,
      card: groups[key].loaded.find((c) => c.id === updated.id),
    })).find((e) => e.card)
    const newKey = groupKeyForType(updated.type)
    // CR-02: relocating into a destination bucket that has never been
    // fetched (or was confirmed empty) must not splice in a lone row —
    // that leaves `hasMore: false` with a non-empty `loaded`, permanently
    // hiding any other real cards of that type. Trigger a real first-page
    // fetch of the destination group instead; it will include this
    // just-saved card (the PUT above has already persisted it).
    const relocating = !!oldKeyEntry && oldKeyEntry.key !== newKey
    const newGroupNeedsRealFetch =
      relocating && groups[newKey].loaded.length === 0 && !groups[newKey].loading
    setGroups((prev) => {
      const next = { ...prev }
      for (const key of GROUP_KEYS) {
        next[key] = { ...next[key], loaded: next[key].loaded.filter((c) => c.id !== updated.id) }
      }
      if (oldKeyEntry?.card && !newGroupNeedsRealFetch) {
        next[newKey] = { ...next[newKey], loaded: [merge(oldKeyEntry.card), ...next[newKey].loaded] }
      }
      return next
    })
    if (newGroupNeedsRealFetch) {
      fetchGroupPage(newKey, null, 'replace')
    }
    // A same-type resave (or a card whose current bucket lookup came up
    // empty) must not touch counts at all.
    if (oldKeyEntry && oldKeyEntry.key !== newKey) {
      bumpGroupCount(oldKeyEntry.card!.type, -1)
      bumpGroupCount(updated.type, 1)
    }
    setSearchResults((prev) => ({
      ...prev,
      loaded: prev.loaded.map((c) => (c.id === updated.id ? merge(c) : c)),
    }))
    // WR-03: patch any already-loaded Reading Practice row(s) for this card
    // — readingPractice state deliberately survives tab switches (D-08), so
    // without this an edited card's sentence text (or other card fields)
    // would show stale data until a full page reload. Matched by the
    // sentence's own `id` (present on every existing LocalSentence), not
    // index, since sentences may be reordered/added/removed in the editor.
    setReadingPractice((prev) => {
      if (!prev.loaded.some((s) => s.card.id === updated.id)) return prev
      const updatedSentencesById = new Map((updated.sentences ?? []).map((s) => [s.id, s]))
      return {
        ...prev,
        loaded: prev.loaded.map((row) => {
          if (row.card.id !== updated.id) return row
          const matched = updatedSentencesById.get(row.id)
          return {
            ...row,
            card: merge(row.card),
            ...(matched
              ? { korean: matched.korean, targetForm: matched.targetForm, translation: matched.translation }
              : {}),
          }
        }),
      }
    })
    // Write-through (LOCAL-03) — mandatory, not an optimisation: PUT
    // /api/cards/[id] does NOT call bumpDataVersion(), so background
    // version-check revalidation can never correct this entry on its own
    // (RESEARCH Pitfall 3, T-34-10). Passing `merge` — the exact function the
    // state updates above already used — is what makes this literally the
    // same transformation, not a re-derived one, and what keeps a
    // type-changing save's relocate-not-duplicate behavior consistent
    // between the cache and component state.
    if (buildIdRef.current) void patchCachedCard(buildIdRef.current, updated.id, merge)
    closeEdit()
  }

  const handleAdd = async () => {
    if (!newCard.front || !newCard.back) return
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newCard, notes: newCard.notes || null }),
      })
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const created: CardDTO = await res.json()
      const groupKey = groupKeyForType(created.type)
      // CR-02: a group that has never been fetched (or was confirmed empty
      // by a real fetch) has `loaded: []`. Splicing the lone new card
      // directly into it would leave `hasMore: false` with a non-empty
      // `loaded`, permanently hiding any other real cards of this type
      // (toggleCollapse only fetches when `loaded.length === 0`, which is no
      // longer true after this insert). Trigger a real first-page fetch
      // instead — it will naturally include the just-created card.
      if (groups[groupKey].loaded.length === 0 && !groups[groupKey].loading) {
        fetchGroupPage(groupKey, null, 'replace')
      } else {
        setGroups((prev) => ({
          ...prev,
          [groupKey]: { ...prev[groupKey], loaded: [created, ...prev[groupKey].loaded] },
        }))
      }
      // E6 zero-one-many: auto-expand the target group so the user sees
      // confirmation their card was saved, even if it was collapsed.
      setCollapsed((prev) => ({ ...prev, [groupKey]: false }))
      bumpGroupCount(created.type, 1)
      // Write-through (LOCAL-03): insertCachedCard owns the "only insert
      // into a group that already has loaded rows" decision itself, so this
      // call site stays uniform regardless of which branch above ran.
      if (buildIdRef.current) void insertCachedCard(buildIdRef.current, created)
      setNewCard({ type: 'vocabulary', front: '', back: '', notes: '' })
      setShowAdd(false)
    } catch (err) {
      console.error('Add card failed:', err)
      setAddError('Could not save card. Please try again.')
    } finally {
      setAdding(false)
    }
  }

  // ── Derived views ──────────────────────────────────────────────────────────

  // Composed rows for the single flat <Virtuoso> instance — grouped browse
  // view (D-01/D-02) or flattened search view (D-06), never both at once.
  const relevantGroups: GroupKey[] = filter === 'all' ? GROUP_KEYS : [filter as GroupKey]

  const composeGroupedRows = (): Row[] =>
    relevantGroups.flatMap((key) => {
      const count = countForGroup(groupCounts, key)
      if (count === 0) return []
      const isCollapsed = collapsed[key]
      const header: Row = { kind: 'header', groupKey: key, label: labelForGroup(key), count, collapsed: isCollapsed }
      if (isCollapsed) return [header]
      const g = groups[key]
      const cardRows: Row[] = g.loaded.map((card) => ({ kind: 'card', groupKey: key, card }))
      const tail: Row[] = []
      if (g.loaded.length === 0 && g.loading) {
        tail.push(...skeletonRows(key, 4))
      } else if (g.error) {
        tail.push({ kind: 'status', sectionKey: key, status: 'error' })
      } else if (g.loading) {
        tail.push({ kind: 'status', sectionKey: key, status: 'loading-more' })
        tail.push(...skeletonRows(key, 3))
      } else if (!g.hasMore && g.loaded.length > 0) {
        tail.push({ kind: 'status', sectionKey: key, status: 'end' })
      }
      return [header, ...cardRows, ...tail]
    })

  const composeSearchRows = (): Row[] => {
    if (searchResults.loaded.length === 0 && searchResults.querying) {
      return skeletonRows('search', 4)
    }
    const cardRows: Row[] = searchResults.loaded.map((card) => ({
      kind: 'card',
      groupKey: groupKeyForType(card.type),
      card,
    }))
    const tail: Row[] = []
    if (searchResults.loadMoreError) {
      tail.push({ kind: 'status', sectionKey: 'search', status: 'error' })
    } else if (searchResults.loadingMore) {
      tail.push({ kind: 'status', sectionKey: 'search', status: 'loading-more' })
      tail.push(...skeletonRows('search', 3))
    } else if (!searchResults.querying && !searchResults.hasMore && searchResults.loaded.length > 0) {
      tail.push({ kind: 'status', sectionKey: 'search', status: 'end' })
    }
    return [...cardRows, ...tail]
  }

  const rows: Row[] = searchActive ? composeSearchRows() : composeGroupedRows()

  const retryStatusRow = (sectionKey: string) => {
    if (sectionKey === 'search') {
      fetchSearchNextPage()
    } else {
      retryGroupFetch(sectionKey as GroupKey)
    }
  }

  // Auto-load-on-scroll (D-03, Task 2 Pattern 3): fires independent of
  // whether the whole list reached bottom — only the group/section owning
  // the currently-visible bottom row is checked against its own boundary.
  const handleRangeChanged = ({ endIndex }: { endIndex: number }) => {
    if (searchActive) {
      if (searchResults.loadingMore || searchResults.querying || !searchResults.hasMore) return
      let lastCardIndex = -1
      rows.forEach((r, i) => { if (r.kind === 'card') lastCardIndex = i })
      if (lastCardIndex >= 0 && endIndex >= lastCardIndex - SCROLL_LOAD_PROXIMITY) fetchSearchNextPage()
      return
    }
    const visibleRow = rows[endIndex]
    if (!visibleRow) return
    const key: GroupKey | undefined =
      visibleRow.kind === 'header' || visibleRow.kind === 'card'
        ? visibleRow.groupKey
        : (visibleRow.sectionKey as GroupKey)
    if (!key) return
    const g = groups[key]
    if (!g || collapsed[key] || g.loading || !g.hasMore) return
    let lastCardIndex = -1
    rows.forEach((r, i) => { if (r.kind === 'card' && r.groupKey === key) lastCardIndex = i })
    if (lastCardIndex >= 0 && endIndex >= lastCardIndex - SCROLL_LOAD_PROXIMITY) fetchGroupNextPage(key)
  }

  // Composed rows for Reading Practice's own <Virtuoso> instance (D-07) —
  // a flat sentence stream, never type-grouped (no header rows), mirroring
  // the Cards tab's skeleton/status row composition pattern.
  const composeReadingRows = (): ReadingRow[] => {
    if (readingPractice.loaded.length === 0 && readingPractice.loading) {
      return Array.from({ length: 4 }, (_, i) => ({ kind: 'skeleton' as const, skeletonId: i }))
    }
    const sentenceRows: ReadingRow[] = readingPractice.loaded.map((s) => ({ kind: 'sentence', sentence: s }))
    const tail: ReadingRow[] = []
    if (readingPractice.error) {
      tail.push({ kind: 'status', status: 'error' })
    } else if (readingPractice.loading) {
      tail.push({ kind: 'status', status: 'loading-more' })
      tail.push(...Array.from({ length: 3 }, (_, i) => ({ kind: 'skeleton' as const, skeletonId: i })))
    } else if (!readingPractice.hasMore && readingPractice.loaded.length > 0) {
      tail.push({ kind: 'status', status: 'end' })
    }
    return [...sentenceRows, ...tail]
  }

  const readingRows: ReadingRow[] = composeReadingRows()
  const readingHasActiveFilter = searchActive || !fullSpan

  const handleReadingRangeChanged = ({ endIndex }: { endIndex: number }) => {
    if (readingPractice.loading || !readingPractice.hasMore) return
    let lastSentenceIndex = -1
    readingRows.forEach((r, i) => { if (r.kind === 'sentence') lastSentenceIndex = i })
    if (lastSentenceIndex >= 0 && endIndex >= lastSentenceIndex - SCROLL_LOAD_PROXIMITY) {
      fetchReadingPracticeNextPage()
    }
  }

  // Tap-to-gloss callback (undefined when GlossProvider not mounted — safe)
  const onWordTap = useWordTap()

  // ── Shared input classes ───────────────────────────────────────────────────
  const inputCls =
    'border border-border bg-surface-1 ' +
    'text-foreground rounded-lg px-3 py-2 text-sm'

  const renderCardRow = (card: CardDTO) => {
    const sentenceCount = card.sentenceCount ?? card.sentences.length
    return (
    <div className="pb-2">
      <SwipeRow onDelete={() => handleDelete(card.id)} deleteLabel="Delete">
        <div className="bg-surface-1 rounded-xl shadow-sm p-4 flex flex-col gap-2">
          {/* Card header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${typeBadgeClass(card.type)}`}>
                {card.type}
              </span>
              {card.lesson && (
                <span className="text-xs text-muted">
                  Lesson {card.lesson.orderIndex}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <span className="text-xs text-muted mr-1">
                {sentenceCount} sentence{sentenceCount !== 1 ? 's' : ''}
              </span>
              {card.review && (
                <span className="text-xs text-muted mr-1">
                  {card.review.reps} review{card.review.reps !== 1 ? 's' : ''}
                </span>
              )}
              <button
                onClick={() => openEdit(card.id)}
                className="text-sm text-button hover:text-button-hover px-3 min-h-11 inline-flex items-center rounded-md hover:bg-button-soft"
              >
                Edit
              </button>
            </div>
          </div>

          {/* Word / pattern */}
          <p className="font-bold text-foreground hangul">{card.front}</p>
          <p className="text-muted">{card.back}</p>
          {card.notes && (
            <p className="text-sm text-muted italic">{card.notes}</p>
          )}
          {/* WR-05: the "Example sentences" preview that used to render here
              was removed — getCardsPage/getCardsGroupCounts (CARDS-01)
              deliberately drop `sentences` from the list query for every
              normally-loaded row, so `card.sentences` was only ever
              non-empty for the one card just edited in the current session
              (via handleSave's merge()). That made the preview confusing/
              inconsistent UI (a random card shows a sentence preview, every
              other card in the same list doesn't) rather than functioning,
              general-purpose UI. The "N sentences" count badge above (from
              the always-present `sentenceCount`) remains the source of truth
              for sentence presence in this list; full sentence text is
              available via Edit or the Reading Practice tab. */}
        </div>
      </SwipeRow>
    </div>
    )
  }

  const renderRow = (row: Row) => {
    if (row.kind === 'header') {
      return (
        <div className="pt-3 pb-1">
          <button
            onClick={() => toggleCollapse(row.groupKey)}
            className="flex items-center gap-2 text-sm font-semibold text-muted hover:text-muted-foreground transition-colors py-1 w-full text-left"
          >
            <span className={`text-xs px-2 py-0.5 rounded-full ${typeBadgeClass(row.groupKey)}`}>
              {row.label}
            </span>
            <span className="text-xs font-normal text-muted">
              {row.count} card{row.count !== 1 ? 's' : ''}
            </span>
            <span className="ml-auto text-xs opacity-50">{row.collapsed ? '▶' : '▼'}</span>
          </button>
        </div>
      )
    }
    if (row.kind === 'card') return renderCardRow(row.card)
    if (row.kind === 'skeleton') {
      return (
        <div className="pb-2">
          <div className="bg-skeleton rounded-xl p-4 h-24 animate-pulse" />
        </div>
      )
    }
    // status row
    if (row.status === 'loading-more') {
      return <p className="text-xs text-muted text-center py-2">{COPY.loadingMore}</p>
    }
    if (row.status === 'end') {
      return <p className="text-xs text-muted text-center py-3">{COPY.endOfList}</p>
    }
    return (
      <div className="text-center py-3 flex flex-col gap-1 items-center">
        <p className="text-sm text-muted">{COPY.batchLoadError}</p>
        <button
          onClick={() => retryStatusRow(row.sectionKey)}
          className="text-sm font-semibold text-button hover:underline"
        >
          Try again
        </button>
      </div>
    )
  }

  const renderReadingRow = (row: ReadingRow) => {
    if (row.kind === 'skeleton') {
      return (
        <div className="pb-2">
          <div className="bg-skeleton rounded-xl p-4 h-24 animate-pulse" />
        </div>
      )
    }
    if (row.kind === 'status') {
      if (row.status === 'loading-more') {
        return <p className="text-xs text-muted text-center py-2">{COPY.loadingMore}</p>
      }
      if (row.status === 'end') {
        return <p className="text-xs text-muted text-center py-3">{COPY.endOfList}</p>
      }
      return (
        <div className="text-center py-3 flex flex-col gap-1 items-center">
          <p className="text-sm text-muted">{COPY.batchLoadError}</p>
          <button
            onClick={retryReadingPracticeFetch}
            className="text-sm font-semibold text-button hover:underline"
          >
            Try again
          </button>
        </div>
      )
    }
    // sentence row
    const { sentence } = row
    const { card } = sentence
    return (
      <div className="pb-3">
        <div
          className="bg-surface-1 rounded-xl shadow-sm p-4 flex flex-col gap-1 cursor-pointer hover:ring-1 hover:ring-button/40 transition-all"
          onClick={() => { openEdit(card.id); switchView('cards') }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              openEdit(card.id)
              switchView('cards')
            }
          }}
        >
          {/* Sentence */}
          <HighlightedSentence
            korean={sentence.korean}
            targetForm={sentence.targetForm}
            cardType={card.type}
            className="text-base text-foreground font-medium leading-relaxed"
            onWordTap={onWordTap}
          />
          {sentence.translation && (
            <p className="text-sm text-muted italic">{sentence.translation}</p>
          )}
          {/* Parent card reference */}
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${typeBadgeClass(card.type)}`}>
              {card.type}
            </span>
            <span className="text-xs text-muted">
              {card.front} — {card.back}
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Route-local pull-to-refresh indicator (D-03/D-04) — ABOVE the
          sticky header so it pushes content rather than overlaying the
          search bar. Deliberately distinct copy from Home's "Pull to
          sync"/"Syncing…" (D-04's locked wording distinction). ──────────── */}
      {(pullDistance > 0 || refreshing) && (
        <div
          className="flex items-center justify-center overflow-hidden text-xs text-muted"
          style={{ height: refreshing ? 28 : pullDistance }}
        >
          {refreshing ? 'Refreshing…' : pullDistance >= PULL_THRESHOLD ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}
      {refreshError && !refreshing && pullDistance === 0 && (
        <p className="text-center text-sm text-muted">
          Couldn&apos;t refresh. Check your connection and try again.{' '}
          <button type="button" onClick={handleRefresh} className="text-button font-semibold">
            Try again
          </button>
        </p>
      )}

      {/* ── Background-revalidation pill (D-01) ── */}
      {isRevalidating && (
        <div
          role="status"
          aria-live="polite"
          className="fixed left-1/2 -translate-x-1/2 z-[5] flex items-center gap-1.5 bg-surface-1 border border-border text-muted text-xs px-2 py-1 rounded-full shadow-sm"
          style={{ top: 'calc(var(--nav-height, 68px) + 8px)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-muted animate-pulse" aria-hidden="true" />
          Updating…
        </div>
      )}

      {/* ── Sticky search + action bar + view toggle (merged into one pinned
          unit, G-31-2/31-05-PLAN.md Task 3) — docks beneath Nav's actual
          measured height via --nav-height (Task 2) instead of colliding
          with it at a duplicated top-0. ────────────────────────────────── */}
      <div
        className="sticky z-10 -mx-4 px-4 pt-3 pb-3 bg-background border-b border-border/60 flex flex-col gap-3"
        style={{ top: 'var(--nav-height, 68px)' }}
      >
        <div className="flex gap-2 items-center">
          <div className="relative flex-1 min-w-0">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search cards or sentences…"
              className={`w-full ${inputCls}`}
            />
            {searchActive && searchResults.querying && (
              <span
                aria-hidden="true"
                className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-button border-t-transparent rounded-full animate-spin"
              />
            )}
          </div>

          {/* Filter toggle */}
          <button
            onClick={openFilterSheet}
            aria-label={`Filters${activeFilterCount > 0 ? ` (${activeFilterCount} active)` : ''}`}
            className="relative min-h-11 min-w-11 flex items-center justify-center rounded-lg bg-surface-1 hover:bg-surface-2 border border-border transition-colors shrink-0"
          >
            <SlidersHorizontal
              className={`w-4 h-4 ${activeFilterCount > 0 ? 'text-button' : 'text-muted'}`}
            />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-button text-button-foreground text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>

          {/* Add card */}
          <button
            onClick={() => setShowAdd(true)}
            className="bg-button text-button-foreground px-3 py-2 min-h-11 text-sm rounded-lg hover:bg-button-hover shrink-0"
          >
            Add Card
          </button>
        </div>

        {/* ── View toggle: Cards | Reading practice ─────────────────────────── */}
        <div className="flex bg-surface-3 rounded-lg p-1 self-start">
          {(['cards', 'reading-practice'] as ActiveView[]).map((v) => (
            <button
              key={v}
              onClick={() => switchView(v)}
              aria-pressed={activeView === v}
              className={`px-4 py-1.5 text-sm font-medium rounded-md min-h-[44px] flex items-center transition-colors ${
                activeView === v
                  ? 'bg-surface-1 text-foreground shadow-sm'
                  : 'text-muted hover:text-muted-foreground'
              }`}
            >
              {/* Reading practice intentionally shows no count — D-07 sources
                  it from an independent paginated endpoint with no groupCounts-
                  equivalent aggregate; showing "loaded so far" would repeat the
                  exact loaded-array-length false-total mistake CARDS-01's
                  groupCounts invariant exists to prevent (31-RESEARCH.md
                  Pitfall 2). */}
              {v === 'cards' ? `Cards (${groupCounts.total})` : 'Reading practice'}
            </button>
          ))}
        </div>
      </div>

      {/* ── CARDS VIEW ──────────────────────────────────────────────────────── */}
      {activeView === 'cards' && (
        <>
          {queryError && (
            <div className="text-center py-4 flex flex-col gap-2 items-center">
              <p className="text-sm text-muted">{queryError}</p>
              <button
                onClick={() => runQuery({ force: true })}
                className="text-sm font-semibold text-button hover:underline"
              >
                Try again
              </button>
            </div>
          )}

          {/* WR-06: dismissible banner for a failed delete — reuses the
              queryError banner's visual pattern, but its own state (a
              delete failure isn't a search failure, and "try again" here
              just clears the banner rather than re-running the query). */}
          {deleteError && (
            <div className="text-center py-4 flex flex-col gap-2 items-center">
              <p className="text-sm text-red-500 dark:text-red-400">{deleteError}</p>
              <button
                onClick={() => setDeleteError(null)}
                className="text-sm font-semibold text-button hover:underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {!searchActive && rows.length === 0 && !queryError && (
            <p className="text-muted text-center py-8">
              {activeFilterCount > 0 ? COPY.filterNoMatches : COPY.noCardsAtAll}
            </p>
          )}
          {searchActive && !searchResults.querying && searchResults.loaded.length === 0 && !queryError && (
            <p className="text-muted text-center py-8">{noResultsFor(debouncedSearch)}</p>
          )}

          {rows.length > 0 && (
            <div className={searchActive && searchResults.querying ? 'opacity-60 transition-opacity' : ''}>
              <Virtuoso
                ref={cardsVirtuosoRef}
                restoreStateFrom={cardsSnapshot}
                useWindowScroll
                data={rows}
                computeItemKey={(_, row) =>
                  row.kind === 'card'
                    ? row.card.id
                    : row.kind === 'header'
                      ? `header-${row.groupKey}`
                      : `${row.kind}-${row.sectionKey}-${row.kind === 'skeleton' ? row.skeletonId : row.status}`
                }
                itemContent={(_, row) => renderRow(row)}
                rangeChanged={handleRangeChanged}
              />
            </div>
          )}
        </>
      )}

      {/* ── READING PRACTICE VIEW (D-07 independent fetch) ──────────────────── */}
      {activeView === 'reading-practice' && (
        <>
          {readingRows.length === 0 && !readingPractice.loading && (
            <p className="text-muted text-center py-8">
              {readingHasActiveFilter ? COPY.noSentencesFilterMatch : COPY.noSentencesYet}
            </p>
          )}

          {readingRows.length > 0 && (
            <Virtuoso
              ref={readingVirtuosoRef}
              restoreStateFrom={readingSnapshot}
              useWindowScroll
              data={readingRows}
              computeItemKey={(_, row) =>
                row.kind === 'sentence' ? row.sentence.id : `${row.kind}-${row.kind === 'skeleton' ? row.skeletonId : row.status}`
              }
              itemContent={(_, row) => renderReadingRow(row)}
              rangeChanged={handleReadingRangeChanged}
            />
          )}
        </>
      )}

      {/* ── FILTER SHEET ────────────────────────────────────────────────────── */}
      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filters">
        <div className="px-4 pb-6 flex flex-col gap-5">
          {/* Card type */}
          <div>
            <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
              Card type
            </p>
            <div className="flex gap-2 flex-wrap">
              {['all', 'vocabulary', 'grammar', 'phrase'].map((f) => (
                <button
                  key={f}
                  onClick={() => setPendingFilter(f)}
                  className={`px-3 py-2 min-h-11 text-sm rounded-lg capitalize ${
                    pendingFilter === f
                      ? 'bg-button-soft text-button font-medium'
                      : 'bg-surface-2 text-muted hover:bg-surface-3'
                  }`}
                >
                  {f === 'all' ? 'All types' : f}
                </button>
              ))}
            </div>
          </div>

          {/* Lesson range */}
          {lessons.length >= 2 && (
            <div>
              <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-3">
                Lesson range
              </p>
              <LessonRangeFilter
                lessons={lessons}
                from={pendingLessonFrom}
                to={pendingLessonTo}
                onChange={(f, t) => { setPendingLessonFrom(f); setPendingLessonTo(t) }}
              />
            </div>
          )}

          {/* Clear all */}
          {pendingActiveCount > 0 && (
            <button
              onClick={() => {
                setPendingFilter('all')
                setPendingLessonFrom(lessons[0]?.orderIndex ?? 1)
                setPendingLessonTo(lessons[lessons.length - 1]?.orderIndex ?? maxOrder)
              }}
              className="text-sm text-red-500 dark:text-red-400 hover:underline text-left self-start"
            >
              Clear all filters
            </button>
          )}

          {/* Done */}
          <button
            onClick={commitFilter}
            className="w-full bg-button text-button-foreground py-3 min-h-11 text-sm font-medium rounded-xl hover:bg-button-hover"
          >
            Done
          </button>
        </div>
      </Sheet>

      {/* ── ADD CARD SHEET ──────────────────────────────────────────────────── */}
      <Sheet open={showAdd} onClose={() => { setShowAdd(false); setAddError(null) }} title="Add Card">
        <div className="px-4 pb-6 flex flex-col gap-3">
          <select
            value={newCard.type}
            onChange={(e) => setNewCard({ ...newCard, type: e.target.value })}
            className={inputCls}
          >
            <option value="vocabulary">Vocabulary</option>
            <option value="grammar">Grammar</option>
            <option value="phrase">Phrase</option>
          </select>
          <input
            value={newCard.front}
            onChange={(e) => setNewCard({ ...newCard, front: e.target.value })}
            placeholder="Front (Korean)"
            className={`hangul ${inputCls}`}
          />
          <input
            value={newCard.back}
            onChange={(e) => setNewCard({ ...newCard, back: e.target.value })}
            placeholder="Back (English)"
            className={inputCls}
          />
          <input
            value={newCard.notes}
            onChange={(e) => setNewCard({ ...newCard, notes: e.target.value })}
            placeholder="Notes (optional)"
            className={inputCls}
          />
          {addError && (
            <p className="text-sm text-red-500 dark:text-red-400">{addError}</p>
          )}
          <button
            onClick={handleAdd}
            disabled={adding || !newCard.front || !newCard.back}
            className="w-full bg-button text-button-foreground py-3 min-h-11 text-sm font-medium rounded-xl hover:bg-button-hover disabled:opacity-50 mt-1"
          >
            {adding ? 'Adding…' : 'Add Card'}
          </button>
        </div>
      </Sheet>

      {/* ── EDIT CARD SHEET ─────────────────────────────────────────────────── */}
      {/* Task 2 (E4): front/back/notes/type render editable IMMEDIATELY from
          the already-in-memory summary (`editingDraft`) — only the sentence
          editor section waits on GET /api/cards/[id]. Once that resolves,
          the full CardEditor mounts, seeded with the draft's live values so
          any edits typed during the wait are never lost. */}
      <Sheet open={editingId !== null} onClose={closeEdit} title="Edit Card">
        {editingId !== null && (
          <div className="px-2 pb-4">
            {!editingDetailLoading && !editingDetailError && editingDetail && editingDraft && (
              <CardEditor
                card={{ ...editingDetail, ...editingDraft }}
                onSave={handleSave}
                onCancel={closeEdit}
              />
            )}

            {(editingDetailLoading || editingDetailError) && editingDraft && (
              <div className="bg-surface-2 rounded-xl p-4 flex flex-col gap-3">
                {/* Core fields — editable right away, no wait for sentences */}
                <select
                  value={editingDraft.type}
                  onChange={(e) => setEditingDraft({ ...editingDraft, type: e.target.value })}
                  className={inputCls}
                >
                  <option value="vocabulary">Vocabulary</option>
                  <option value="grammar">Grammar</option>
                  <option value="phrase">Phrase</option>
                </select>
                <input
                  value={editingDraft.front}
                  onChange={(e) => setEditingDraft({ ...editingDraft, front: e.target.value })}
                  placeholder="Front (Korean)"
                  className={`hangul ${inputCls}`}
                />
                <input
                  value={editingDraft.back}
                  onChange={(e) => setEditingDraft({ ...editingDraft, back: e.target.value })}
                  placeholder="Back (English)"
                  className={inputCls}
                />
                <textarea
                  value={editingDraft.notes}
                  onChange={(e) => setEditingDraft({ ...editingDraft, notes: e.target.value })}
                  placeholder="Notes (optional)"
                  className={inputCls}
                  rows={2}
                />

                {/* Sentence editor section — loading placeholder or retry */}
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-muted uppercase tracking-wide">
                    Example Sentences
                  </p>
                  {editingDetailLoading && (
                    <div className="flex flex-col gap-2">
                      {[0, 1].map((i) => (
                        <div
                          key={i}
                          className="bg-surface-1 rounded-lg p-3 flex flex-col gap-2 border border-border"
                        >
                          <div className="h-9 bg-skeleton rounded animate-pulse" />
                          <div className="h-9 bg-skeleton rounded animate-pulse" />
                          <div className="h-9 bg-skeleton rounded animate-pulse" />
                        </div>
                      ))}
                    </div>
                  )}
                  {editingDetailError && (
                    <div className="text-center py-4 flex flex-col gap-2 items-center">
                      <p className="text-sm text-muted">{COPY.editSentencesLoadError}</p>
                      <button
                        onClick={() => fetchEditingDetail(editingId)}
                        className="text-sm font-semibold text-button hover:underline"
                      >
                        Try again
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Defensive fallback — editingDraft could only be null if
                openEdit's summary lookup failed to find the tapped row
                (shouldn't normally happen, since openEdit is always called
                from an already-rendered row). */}
            {!editingDraft && (
              <>
                {editingDetailLoading && (
                  <p className="text-sm text-muted text-center py-6">Loading…</p>
                )}
                {!editingDetailLoading && editingDetailError && (
                  <div className="text-center py-6 flex flex-col gap-2 items-center">
                    <p className="text-sm text-muted">{COPY.editSentencesLoadError}</p>
                    <button
                      onClick={() => fetchEditingDetail(editingId)}
                      className="text-sm font-semibold text-button hover:underline"
                    >
                      Try again
                    </button>
                  </div>
                )}
                {!editingDetailLoading && !editingDetailError && editingDetail && (
                  <CardEditor card={editingDetail} onSave={handleSave} onCancel={closeEdit} />
                )}
              </>
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}
