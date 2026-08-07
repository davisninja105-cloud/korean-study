'use client'

import { useEffect, useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Virtuoso } from 'react-virtuoso'
import CardEditor from '@/components/CardEditor'
import LessonRangeFilter, { isFullSpan } from '@/components/LessonRangeFilter'
import HighlightedSentence from '@/components/HighlightedSentence'
import Sheet from '@/components/Sheet'
import SwipeRow from '@/components/SwipeRow'
import { useWordTap } from '@/components/GlossProvider'
import { useFreshPayload } from '@/components/FreshnessWatcher'
import { useDebouncedValue } from '@/lib/useDebouncedValue'
import { typeBadgeClass } from '@/lib/card-style'
import type { CardDTO, CardsPageDTO, GroupCountsDTO, LessonRefItem } from '@/lib/dto'

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
  sentences?: { id: string; korean: string; targetForm: string; translation: string }[]
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
  noCardsAtAll: 'No cards yet. Sync your Google Doc to get started.',
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

// Composed-row shape for the single flat <Virtuoso> instance (31-RESEARCH.md
// Pattern 2). Group headers, skeleton placeholders, and status captions are
// all just rows, not a separate library API — this is what lets the grouped
// browse view (D-01/D-02) and the flattened search view (D-06) share one list.
type Row =
  | { kind: 'header'; groupKey: GroupKey; label: string; count: number; collapsed: boolean }
  | { kind: 'card'; groupKey: GroupKey; card: CardDTO }
  | { kind: 'skeleton'; sectionKey: string; skeletonId: number }
  | { kind: 'status'; sectionKey: string; status: 'loading-more' | 'end' | 'error' }

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

  // Shared error for a failed SEARCH request or a failed FILTER-COMMIT
  // request (Done-triggered first-page refresh) — both surface the same
  // "Couldn't search right now. Try again." copy per the must_haves backstop
  // (distinct from an ordinary scroll-triggered batch-load failure, which
  // stays inline per-group with "Couldn't load more cards…" copy).
  const [queryError, setQueryError] = useState<string | null>(null)

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
  // Race guard: an in-flight fetch for a since-closed/reopened id must never
  // clobber a newer id's state. Read at async-completion time (not a stale
  // render-time closure) — same pattern as StudyClient.tsx's phaseRef.
  const editingIdRef = useRef<string | null>(null)

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
    setEditingId(id)
    setEditingDetail(null)
    fetchEditingDetail(id)
  }

  const closeEdit = () => {
    editingIdRef.current = null
    setEditingId(null)
    setEditingDetail(null)
    setEditingDetailError(false)
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

  // JSON backstop delivery (26-05-PLAN.md) — Suspense-independent second
  // delivery path for the card list. KNOWN INTERIM GAP (31-RESEARCH.md
  // Pitfall 1, deferred to 31-04): FreshnessWatcher's `/cards` backstop still
  // fetches the OLD full-array shape and gates on `Array.isArray(result)`,
  // which is always false against the new CardsPageDTO object — so
  // `freshCards` never actually delivers on this page today. This handler is
  // kept (harmless no-op) so the wiring below activates for free once
  // FreshnessWatcher's `/cards` branch is fixed to emit an upsert-only merge
  // instead of a wholesale replace. Also guarded against an active
  // client-side query for the same reason as the block above.
  const { cards: freshCards } = useFreshPayload()
  const [prevFreshCards, setPrevFreshCards] = useState(freshCards)
  if (freshCards !== prevFreshCards) {
    setPrevFreshCards(freshCards)
    if (
      freshCards !== null &&
      editingId === null &&
      !showAdd &&
      !adding &&
      deletingIds.size === 0 &&
      !hasActiveClientQuery
    ) {
      setGroups((prev) => ({ ...prev, vocabulary: { ...prev.vocabulary, loaded: freshCards } }))
    }
  }

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
    try {
      const res = await fetch(`/api/cards/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        console.error('Delete failed:', res.status)
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
      if (deletedType) bumpGroupCount(deletedType, -1)
      if (editingId === id) closeEdit()
    } catch (err) {
      console.error('Delete failed (network):', err)
    } finally {
      setDeletingIds((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const handleSave = (updated: CardEditorShape) => {
    // Spread preserves all CardDTO fields from `c`; only core editor fields
    // (now including the real `sentences`, fetched via GET /api/cards/[id]
    // before the editor mounted) are overwritten.
    const merge = (c: CardDTO) => ({ ...c, ...updated }) as CardDTO
    setGroups((prev) => {
      const next = { ...prev }
      for (const key of GROUP_KEYS) {
        if (next[key].loaded.some((c) => c.id === updated.id)) {
          next[key] = { ...next[key], loaded: next[key].loaded.map((c) => (c.id === updated.id ? merge(c) : c)) }
        }
      }
      return next
    })
    setSearchResults((prev) => ({
      ...prev,
      loaded: prev.loaded.map((c) => (c.id === updated.id ? merge(c) : c)),
    }))
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
      setGroups((prev) => ({
        ...prev,
        [groupKey]: { ...prev[groupKey], loaded: [created, ...prev[groupKey].loaded] },
      }))
      // E6 zero-one-many: auto-expand the target group so the user sees
      // confirmation their card was saved, even if it was collapsed.
      setCollapsed((prev) => ({ ...prev, [groupKey]: false }))
      bumpGroupCount(created.type, 1)
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

  // Flat sentence list for the Reading practice view. INTERIM (unchanged
  // scope boundary from 31-01 — Reading Practice's own dedicated fetch is
  // 31-04's D-07 scope, not this plan's): sourced from the Vocabulary
  // group's loaded cards, which never carry sentences post-CARDS-01 — so
  // this tab shows its "no example sentences" empty state until then.
  const allSentences = groups.vocabulary.loaded.flatMap((c) =>
    (c.sentences ?? []).map((s) => ({ sentence: s, card: c }))
  )

  // Tap-to-gloss callback (undefined when GlossProvider not mounted — safe)
  const onWordTap = useWordTap()

  // ── Shared input classes ───────────────────────────────────────────────────
  const inputCls =
    'border border-border bg-surface-1 ' +
    'text-foreground rounded-lg px-3 py-2 text-sm'

  const renderCardRow = (card: CardDTO) => (
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

          {/* Example sentences — indented with left border */}
          {(card.sentences ?? []).length > 0 && (
            <div
              className="flex flex-col gap-1.5 mt-1 pl-3 border-l-2"
              style={{ borderColor: 'var(--highlight-bg)' }}
            >
              {(card.sentences ?? []).map((s) => (
                <div key={s.id}>
                  <HighlightedSentence
                    korean={s.korean}
                    targetForm={s.targetForm}
                    cardType={card.type}
                    className="text-sm text-muted-foreground"
                    onWordTap={onWordTap}
                  />
                  {s.translation && (
                    <p className="text-xs text-muted italic">
                      {s.translation}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SwipeRow>
    </div>
  )

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

  return (
    <div className="flex flex-col gap-4">

      {/* ── Sticky search + action bar ──────────────────────────────────────── */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-background border-b border-border/60">
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
      </div>

      {/* ── View toggle: Cards | Reading practice ───────────────────────────── */}
      <div className="flex bg-surface-3 rounded-lg p-1 self-start">
        {(['cards', 'reading-practice'] as ActiveView[]).map((v) => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            aria-pressed={activeView === v}
            className={`px-4 py-1.5 text-sm font-medium rounded-md min-h-[44px] flex items-center transition-colors ${
              activeView === v
                ? 'bg-surface-1 text-foreground shadow-sm'
                : 'text-muted hover:text-muted-foreground'
            }`}
          >
            {v === 'cards'
              ? `Cards (${groupCounts.total})`
              : `Reading practice (${allSentences.length})`}
          </button>
        ))}
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

      {/* ── READING PRACTICE VIEW ───────────────────────────────────────────── */}
      {activeView === 'reading-practice' && (
        <>
          {allSentences.length === 0 && (
            <p className="text-muted text-center py-8">
              {groups.vocabulary.loaded.length === 0
                ? COPY.filterNoMatches
                : 'No example sentences yet. Sync a lesson to generate them.'}
            </p>
          )}

          <div className="flex flex-col gap-3 animate-slide-in">
            {allSentences.map(({ sentence, card }) => (
              <div
                key={sentence.id}
                className="bg-surface-1 rounded-xl shadow-sm p-4 flex flex-col gap-1 cursor-pointer hover:ring-1 hover:ring-button/40 transition-all"
                onClick={() => { openEdit(card.id); setActiveView('cards') }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    openEdit(card.id)
                    setActiveView('cards')
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
            ))}
          </div>
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
      <Sheet open={editingId !== null} onClose={closeEdit} title="Edit Card">
        {editingId !== null && (
          <div className="px-2 pb-4">
            {editingDetailLoading && (
              <p className="text-sm text-muted text-center py-6">Loading…</p>
            )}
            {!editingDetailLoading && editingDetailError && (
              <div className="text-center py-6 flex flex-col gap-2 items-center">
                <p className="text-sm text-muted">
                  Couldn&apos;t load this card&apos;s sentences. Try again.
                </p>
                <button
                  onClick={() => fetchEditingDetail(editingId)}
                  className="text-sm font-semibold text-button hover:underline"
                >
                  Try again
                </button>
              </div>
            )}
            {!editingDetailLoading && !editingDetailError && editingDetail && (
              <CardEditor
                card={editingDetail}
                onSave={handleSave}
                onCancel={closeEdit}
              />
            )}
          </div>
        )}
      </Sheet>
    </div>
  )
}
