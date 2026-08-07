'use client'

import { useRef, useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import { Virtuoso } from 'react-virtuoso'
import CardEditor from '@/components/CardEditor'
import LessonRangeFilter, { isFullSpan } from '@/components/LessonRangeFilter'
import HighlightedSentence from '@/components/HighlightedSentence'
import Sheet from '@/components/Sheet'
import SwipeRow from '@/components/SwipeRow'
import { useWordTap } from '@/components/GlossProvider'
import { useFreshPayload } from '@/components/FreshnessWatcher'
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

interface GroupState {
  loaded: CardDTO[]
  nextCursor: string | null
  hasMore: boolean
  loading: boolean
}

// Composed-row shape for the single flat <Virtuoso> instance (31-RESEARCH.md
// Pattern 2). Group headers are just rows, not a separate library API — this
// is what lets the Vocabulary group (expanded, virtualized) and the
// Grammar/Phrase/Other groups (collapsed, header-only) share one list.
type Row =
  | { kind: 'header'; groupKey: GroupKey; label: string; count: number; collapsed: boolean }
  | { kind: 'card'; groupKey: GroupKey; card: CardDTO }

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

interface Props {
  initialCardsPage: CardsPageDTO
  initialGroupCounts: GroupCountsDTO
  initialLessons: LessonRefItem[]
}

export default function CardsClient({ initialCardsPage, initialGroupCounts, initialLessons }: Props) {
  // Per-group cursor state. For THIS plan (31-01, the phase's tracer) only
  // `vocabulary` is ever populated/expanded — Grammar/Phrase/Other render a
  // collapsed header-only row (their real server-aggregated count, zero
  // rows fetched), matching D-02's default. Auto-load-on-scroll (D-03),
  // tap-to-expand-with-fetch, and server-side search/filter (CARDS-03) are
  // explicitly out of scope for this plan — they land in 31-02.
  const [groups, setGroups] = useState<Record<GroupKey, GroupState>>({
    vocabulary: {
      loaded: initialCardsPage.cards,
      nextCursor: initialCardsPage.nextCursor,
      hasMore: initialCardsPage.hasMore,
      loading: false,
    },
    grammar: { loaded: [], nextCursor: null, hasMore: false, loading: false },
    phrase: { loaded: [], nextCursor: null, hasMore: false, loading: false },
    other: { loaded: [], nextCursor: null, hasMore: false, loading: false },
  })
  const [groupCounts, setGroupCounts] = useState<GroupCountsDTO>(initialGroupCounts)

  // Only Vocabulary starts expanded (D-02). Tapping a collapsed header still
  // just flips this flag — no fetch is wired for Grammar/Phrase/Other yet,
  // so expanding one shows zero rows beneath its header until 31-02 adds
  // per-group expand-with-fetch.
  const [collapsed, setCollapsed] = useState<Record<GroupKey, boolean>>({
    vocabulary: false,
    grammar: true,
    phrase: true,
    other: true,
  })
  const toggleCollapse = (key: GroupKey) => setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }))

  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newCard, setNewCard] = useState({ type: 'vocabulary', front: '', back: '', notes: '' })
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [activeView, setActiveView] = useState<ActiveView>('cards')

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

  // Lesson range filter state — initialized from server-fetched lessons (no initial-load fetch)
  const [lessons] = useState<LessonRefItem[]>(initialLessons)
  const [filterOpen, setFilterOpen] = useState(false)
  const [lessonFrom, setLessonFrom] = useState(() =>
    initialLessons.length > 0 ? initialLessons[0].orderIndex : 1
  )
  const [lessonTo, setLessonTo] = useState(() =>
    initialLessons.length > 0 ? initialLessons[initialLessons.length - 1].orderIndex : 1
  )

  // Gated adoption of a fresh initialCardsPage (26-01-PLAN.md design decision
  // 4d, extended to the per-group shape). FreshnessWatcher's router.refresh()
  // re-delivers initialCardsPage/initialGroupCounts with new object
  // references at every boundary refresh. Never adopt a payload that arrived
  // while a sheet was open — see the original rationale preserved verbatim
  // below. Only the `vocabulary` group's page-1 data is replaced wholesale
  // here (it's the only group this plan's RSC page re-fetches); Grammar/
  // Phrase/Other stay untouched.
  const [prevInitialCardsPage, setPrevInitialCardsPage] = useState(initialCardsPage)
  if (initialCardsPage !== prevInitialCardsPage) {
    setPrevInitialCardsPage(initialCardsPage)
    if (editingId === null && !showAdd && !adding && deletingIds.size === 0) {
      setGroups((prev) => ({
        ...prev,
        vocabulary: {
          loaded: initialCardsPage.cards,
          nextCursor: initialCardsPage.nextCursor,
          hasMore: initialCardsPage.hasMore,
          loading: false,
        },
      }))
    }
  }

  const [prevInitialGroupCounts, setPrevInitialGroupCounts] = useState(initialGroupCounts)
  if (initialGroupCounts !== prevInitialGroupCounts) {
    setPrevInitialGroupCounts(initialGroupCounts)
    if (editingId === null && !showAdd && !adding && deletingIds.size === 0) {
      setGroupCounts(initialGroupCounts)
    }
  }

  // JSON backstop delivery (26-05-PLAN.md) — Suspense-independent second
  // delivery path for the card list. KNOWN INTERIM GAP (31-RESEARCH.md
  // Pitfall 1, deferred to a later plan in this phase): FreshnessWatcher's
  // `/cards` backstop still fetches the OLD full-array shape and gates on
  // `Array.isArray(result)`, which is always false against the new
  // CardsPageDTO object — so `freshCards` never actually delivers on this
  // page today. This handler is kept (harmless no-op) so the wiring below
  // activates for free once FreshnessWatcher's `/cards` branch is fixed to
  // emit an upsert-only merge instead of a wholesale replace.
  const { cards: freshCards } = useFreshPayload()
  const [prevFreshCards, setPrevFreshCards] = useState(freshCards)
  if (freshCards !== prevFreshCards) {
    setPrevFreshCards(freshCards)
    if (freshCards !== null && editingId === null && !showAdd && !adding && deletingIds.size === 0) {
      setGroups((prev) => ({ ...prev, vocabulary: { ...prev.vocabulary, loaded: freshCards } }))
    }
  }

  const maxOrder = lessons.length > 0 ? lessons[lessons.length - 1].orderIndex : 1
  const fullSpan = isFullSpan(lessonFrom, lessonTo, maxOrder)

  // Badge count: how many filter dimensions are active
  const activeFilterCount = (filter !== 'all' ? 1 : 0) + (!fullSpan ? 1 : 0)

  // ── Filtering (INTERIM — client-side, Vocabulary group only) ────────────────
  // CARDS-03 requires this to run server-side against the full deck; that
  // rewrite lands in 31-02. Kept here, unadapted, per this plan's explicit
  // scope note, purely so the Vocabulary group and the Reading practice tab
  // still have a data source this task. `matchesSentence` is currently inert
  // — every loaded card's `sentences` is `[]` (dropped per CARDS-01) — until
  // server-side sentence search (D-05) lands.
  const filteredVocabCards = groups.vocabulary.loaded.filter((c) => {
    if (!fullSpan) {
      if (!c.lesson || c.lesson.orderIndex < lessonFrom || c.lesson.orderIndex > lessonTo) {
        return false
      }
    }
    if (filter !== 'all' && c.type !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      const matchesCard =
        c.front.toLowerCase().includes(q) ||
        c.back.toLowerCase().includes(q) ||
        (c.notes?.toLowerCase().includes(q) ?? false)
      const matchesSentence = (c.sentences ?? []).some(
        (s) => s.korean.toLowerCase().includes(q) || s.translation.toLowerCase().includes(q)
      )
      if (!matchesCard && !matchesSentence) return false
    }
    return true
  })

  // ── Mutation helpers ─────────────────────────────────────────────────────────
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

  const groupKeyForType = (type: string): GroupKey =>
    (TYPE_GROUPS as readonly string[]).includes(type) ? (type as GroupKey) : 'other'

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
    setGroups((prev) => {
      const next = { ...prev }
      for (const key of GROUP_KEYS) {
        if (next[key].loaded.some((c) => c.id === updated.id)) {
          next[key] = {
            ...next[key],
            loaded: next[key].loaded.map((c) =>
              c.id === updated.id ? ({ ...c, ...updated } as CardDTO) : c
            ),
          }
        }
      }
      return next
    })
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

  // Composed rows for the single flat <Virtuoso> instance. A group with a
  // real server-aggregated count of 0 is omitted entirely (matches the old
  // groupedCards.filter(g => g.cards.length > 0) behavior).
  const rows: Row[] = GROUP_KEYS.flatMap((key) => {
    const count = countForGroup(groupCounts, key)
    if (count === 0) return []
    const isCollapsed = collapsed[key]
    const header: Row = { kind: 'header', groupKey: key, label: labelForGroup(key), count, collapsed: isCollapsed }
    if (isCollapsed) return [header]
    const loadedCards = key === 'vocabulary' ? filteredVocabCards : groups[key].loaded
    const cardRows: Row[] = loadedCards.map((card) => ({ kind: 'card', groupKey: key, card }))
    return [header, ...cardRows]
  })

  // Flat sentence list for the Reading practice view. INTERIM (this plan
  // only, per 31-01-PLAN.md Task 2): sourced from the Vocabulary group's
  // loaded cards, which never carry sentences post-CARDS-01 — so this tab
  // shows its "no example sentences" empty state until 31-04's dedicated
  // Reading Practice fetch (D-07) lands.
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
    return renderCardRow(row.card)
  }

  return (
    <div className="flex flex-col gap-4">

      {/* ── Sticky search + action bar ──────────────────────────────────────── */}
      <div className="sticky top-0 z-10 -mx-4 px-4 py-3 bg-background border-b border-border/60">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search cards or sentences…"
            className={`flex-1 min-w-0 ${inputCls}`}
          />

          {/* Filter toggle */}
          <button
            onClick={() => setFilterOpen(true)}
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
          {groupCounts.total === 0 && (
            <p className="text-muted text-center py-8">
              No cards yet. Sync your Google Doc to get started.
            </p>
          )}
          {groupCounts.total > 0 && filteredVocabCards.length === 0 && groups.vocabulary.loaded.length > 0 && (
            <p className="text-muted text-center py-8">
              No cards match your search.
            </p>
          )}

          {rows.length > 0 && (
            <Virtuoso
              useWindowScroll
              data={rows}
              computeItemKey={(_, row) => (row.kind === 'card' ? row.card.id : `header-${row.groupKey}`)}
              itemContent={(_, row) => renderRow(row)}
            />
          )}
        </>
      )}

      {/* ── READING PRACTICE VIEW ───────────────────────────────────────────── */}
      {activeView === 'reading-practice' && (
        <>
          {allSentences.length === 0 && (
            <p className="text-muted text-center py-8">
              {filteredVocabCards.length === 0
                ? 'No cards match your filter.'
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
                  onClick={() => setFilter(f)}
                  className={`px-3 py-2 min-h-11 text-sm rounded-lg capitalize ${
                    filter === f
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
                from={lessonFrom}
                to={lessonTo}
                onChange={(f, t) => { setLessonFrom(f); setLessonTo(t) }}
              />
            </div>
          )}

          {/* Clear all */}
          {activeFilterCount > 0 && (
            <button
              onClick={() => {
                setFilter('all')
                setLessonFrom(lessons[0]?.orderIndex ?? 1)
                setLessonTo(lessons[lessons.length - 1]?.orderIndex ?? maxOrder)
              }}
              className="text-sm text-red-500 dark:text-red-400 hover:underline text-left self-start"
            >
              Clear all filters
            </button>
          )}

          {/* Done */}
          <button
            onClick={() => setFilterOpen(false)}
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
