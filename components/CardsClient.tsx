'use client'

import { useState } from 'react'
import { SlidersHorizontal } from 'lucide-react'
import CardEditor from '@/components/CardEditor'
import LessonRangeFilter, { isFullSpan } from '@/components/LessonRangeFilter'
import HighlightedSentence from '@/components/HighlightedSentence'
import Sheet from '@/components/Sheet'
import SwipeRow from '@/components/SwipeRow'
import { useWordTap } from '@/components/GlossProvider'
import { typeBadgeClass } from '@/lib/card-style'
import type { CardDTO, LessonRefItem } from '@/lib/dto'

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

interface Props {
  initialCards: CardDTO[]
  initialLessons: LessonRefItem[]
}

export default function CardsClient({ initialCards, initialLessons }: Props) {
  const [cards, setCards] = useState<CardDTO[]>(initialCards)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newCard, setNewCard] = useState({ type: 'vocabulary', front: '', back: '', notes: '' })
  const [adding, setAdding] = useState(false)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [activeView, setActiveView] = useState<ActiveView>('cards')

  // Collapsed state for type groups (all open by default)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Lesson range filter state — initialized from server-fetched lessons (no initial-load fetch)
  const [lessons] = useState<LessonRefItem[]>(initialLessons)
  const [filterOpen, setFilterOpen] = useState(false)
  const [lessonFrom, setLessonFrom] = useState(() =>
    initialLessons.length > 0 ? initialLessons[0].orderIndex : 1
  )
  const [lessonTo, setLessonTo] = useState(() =>
    initialLessons.length > 0 ? initialLessons[initialLessons.length - 1].orderIndex : 1
  )

  const maxOrder = lessons.length > 0 ? lessons[lessons.length - 1].orderIndex : 1
  const fullSpan = isFullSpan(lessonFrom, lessonTo, maxOrder)

  // Badge count: how many filter dimensions are active
  const activeFilterCount = (filter !== 'all' ? 1 : 0) + (!fullSpan ? 1 : 0)

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filteredCards = cards.filter((c) => {
    // Lesson range
    if (!fullSpan) {
      if (!c.lesson || c.lesson.orderIndex < lessonFrom || c.lesson.orderIndex > lessonTo) {
        return false
      }
    }
    // Type filter
    if (filter !== 'all' && c.type !== filter) return false
    // Search — check front/back/notes AND sentences
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
      setCards((prev) => prev.filter((c) => c.id !== id))
      if (editingId === id) setEditingId(null)
    } catch (err) {
      console.error('Delete failed (network):', err)
    } finally {
      setDeletingIds((prev) => { const s = new Set(prev); s.delete(id); return s })
    }
  }

  const handleSave = (updated: CardEditorShape) => {
    // Spread preserves all CardDTO fields from `c`; only core editor fields are overwritten.
    // Cast is safe because `c` (CardDTO) dominates the shape — sentence DTO fields survive.
    setCards((prev) =>
      prev.map((c) =>
        c.id === updated.id ? ({ ...c, ...updated } as CardDTO) : c
      )
    )
    setEditingId(null)
  }

  const handleAdd = async () => {
    if (!newCard.front || !newCard.back) return
    setAdding(true)
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newCard, notes: newCard.notes || null }),
      })
      if (!res.ok) throw new Error(`Failed: ${res.status}`)
      const created = await res.json()
      setCards((prev) => [created, ...prev])
      setNewCard({ type: 'vocabulary', front: '', back: '', notes: '' })
      setShowAdd(false)
    } catch (err) {
      console.error('Add card failed:', err)
    } finally {
      setAdding(false)
    }
  }

  const toggleCollapse = (group: string) => {
    setCollapsed((prev) => ({ ...prev, [group]: !prev[group] }))
  }

  // ── Derived views ──────────────────────────────────────────────────────────

  // Group cards by type for the Cards view
  const groupedCards = (() => {
    const groups: { label: string; key: string; cards: CardDTO[] }[] = TYPE_GROUPS.map((t) => ({
      label: t.charAt(0).toUpperCase() + t.slice(1),
      key: t,
      cards: filteredCards.filter((c) => c.type === t),
    }))
    const otherCards = filteredCards.filter((c) => !(TYPE_GROUPS as readonly string[]).includes(c.type))
    if (otherCards.length > 0) groups.push({ label: 'Other', key: 'other', cards: otherCards })
    return groups.filter((g) => g.cards.length > 0)
  })()

  // Flat sentence list for the Reading practice view
  const allSentences = filteredCards.flatMap((c) =>
    (c.sentences ?? []).map((s) => ({ sentence: s, card: c }))
  )

  // Card currently open in the edit Sheet
  const editingCard = editingId ? (cards.find((c) => c.id === editingId) ?? null) : null

  // Tap-to-gloss callback (undefined when GlossProvider not mounted — safe)
  const onWordTap = useWordTap()

  // ── Shared input classes ───────────────────────────────────────────────────
  const inputCls =
    'border border-border bg-surface-1 ' +
    'text-foreground rounded-lg px-3 py-2 text-sm'

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
              ? `Cards (${filteredCards.length})`
              : `Reading practice (${allSentences.length})`}
          </button>
        ))}
      </div>

      {/* ── CARDS VIEW ──────────────────────────────────────────────────────── */}
      {activeView === 'cards' && (
        <>
          {filteredCards.length === 0 && (
            <p className="text-muted text-center py-8">
              {cards.length === 0
                ? 'No cards yet. Sync your Google Doc to get started.'
                : 'No cards match your search.'}
            </p>
          )}

          {groupedCards.map(({ label, key, cards: groupCards }) => (
            <div key={key} className="flex flex-col gap-2 animate-slide-in">
              {/* Group header */}
              <button
                onClick={() => toggleCollapse(key)}
                className="flex items-center gap-2 text-sm font-semibold text-muted hover:text-muted-foreground transition-colors py-1"
              >
                <span className={`text-xs px-2 py-0.5 rounded-full ${typeBadgeClass(key === 'other' ? 'other' : key)}`}>
                  {label}
                </span>
                <span className="text-xs font-normal text-muted">
                  {groupCards.length} card{groupCards.length !== 1 ? 's' : ''}
                </span>
                <span className="ml-auto text-xs opacity-50">{collapsed[key] ? '▶' : '▼'}</span>
              </button>

              {!collapsed[key] && groupCards.map((card) => (
                <SwipeRow
                  key={card.id}
                  onDelete={() => handleDelete(card.id)}
                  deleteLabel="Delete"
                >
                  <div
                    className="bg-surface-1 rounded-xl shadow-sm p-4 flex flex-col gap-2"
                  >
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
                          onClick={() => setEditingId(card.id)}
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
              ))}
            </div>
          ))}
        </>
      )}

      {/* ── READING PRACTICE VIEW ───────────────────────────────────────────── */}
      {activeView === 'reading-practice' && (
        <>
          {allSentences.length === 0 && (
            <p className="text-muted text-center py-8">
              {filteredCards.length === 0
                ? 'No cards match your filter.'
                : 'No example sentences yet. Sync a lesson to generate them.'}
            </p>
          )}

          <div className="flex flex-col gap-3 animate-slide-in">
            {allSentences.map(({ sentence, card }) => (
              <div
                key={sentence.id}
                className="bg-surface-1 rounded-xl shadow-sm p-4 flex flex-col gap-1 cursor-pointer hover:ring-1 hover:ring-button/40 transition-all"
                onClick={() => { setEditingId(card.id); setActiveView('cards') }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    setEditingId(card.id)
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
      <Sheet open={showAdd} onClose={() => setShowAdd(false)} title="Add Card">
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
      <Sheet open={editingId !== null} onClose={() => setEditingId(null)} title="Edit Card">
        {editingCard && (
          <div className="px-2 pb-4">
            <CardEditor
              card={editingCard}
              onSave={handleSave}
              onCancel={() => setEditingId(null)}
            />
          </div>
        )}
      </Sheet>
    </div>
  )
}
