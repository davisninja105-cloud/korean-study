'use client'

import { useEffect, useState } from 'react'
import CardEditor from '@/components/CardEditor'
import LessonRangeFilter, { isFullSpan, type LessonItem } from '@/components/LessonRangeFilter'
import HighlightedSentence from '@/components/HighlightedSentence'
import { typeBadgeClass } from '@/lib/card-style'

interface Sentence {
  id: string
  korean: string
  targetForm: string
  translation: string
  orderIndex?: number
}

interface Card {
  id: string
  type: string
  front: string
  back: string
  notes?: string | null
  sentences?: Sentence[]
  review?: { reps: number; lapses: number } | null
  lesson?: { title: string; orderIndex: number } | null
}

type ActiveView = 'cards' | 'sentences'

// Canonical type groups. Any type not in the first three goes to "other".
const TYPE_GROUPS = ['vocabulary', 'grammar', 'phrase'] as const

export default function CardsPage() {
  const [cards, setCards] = useState<Card[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newCard, setNewCard] = useState({ type: 'vocabulary', front: '', back: '', notes: '' })
  const [adding, setAdding] = useState(false)
  const [activeView, setActiveView] = useState<ActiveView>('cards')

  // Collapsed state for type groups (all open by default)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  // Lesson range filter state
  const [lessons, setLessons] = useState<LessonItem[]>([])
  const [lessonFrom, setLessonFrom] = useState(1)
  const [lessonTo, setLessonTo] = useState(1)

  const loadCards = () => {
    fetch('/api/cards')
      .then((r) => r.json())
      .then(setCards)
  }

  useEffect(() => {
    loadCards()
    fetch('/api/lessons')
      .then((r) => r.json())
      .then((data: LessonItem[]) => {
        setLessons(data)
        if (data.length > 0) {
          setLessonFrom(data[0].orderIndex)
          setLessonTo(data[data.length - 1].orderIndex)
        }
      })
  }, [])

  const maxOrder = lessons.length > 0 ? lessons[lessons.length - 1].orderIndex : 1
  const fullSpan = isFullSpan(lessonFrom, lessonTo, maxOrder)

  // ── Filtering ──────────────────────────────────────────────────────────────
  // Search now matches front, back, notes, and any sentence text.
  const filteredCards = cards.filter((c) => {
    // Lesson range
    if (!fullSpan) {
      if (!c.lesson || c.lesson.orderIndex < lessonFrom || c.lesson.orderIndex > lessonTo) {
        return false
      }
    }
    // Type filter (applied in both views via parent card type)
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
    if (!confirm('Delete this card?')) return
    await fetch(`/api/cards/${id}`, { method: 'DELETE' })
    setCards((prev) => prev.filter((c) => c.id !== id))
  }

  const handleSave = (updated: Card) => {
    setCards((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)))
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
      const created = await res.json()
      setCards((prev) => [created, ...prev])
      setNewCard({ type: 'vocabulary', front: '', back: '', notes: '' })
      setShowAdd(false)
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
    const groups: { label: string; key: string; cards: Card[] }[] = TYPE_GROUPS.map((t) => ({
      label: t.charAt(0).toUpperCase() + t.slice(1),
      key: t,
      cards: filteredCards.filter((c) => c.type === t),
    }))
    const otherCards = filteredCards.filter((c) => !(TYPE_GROUPS as readonly string[]).includes(c.type))
    if (otherCards.length > 0) groups.push({ label: 'Other', key: 'other', cards: otherCards })
    return groups.filter((g) => g.cards.length > 0)
  })()

  // Flat sentence list for the Sentences view (filter already applied via filteredCards)
  const allSentences = filteredCards.flatMap((c) =>
    (c.sentences ?? []).map((s) => ({ sentence: s, card: c }))
  )

  // ── Shared input classes ───────────────────────────────────────────────────
  const inputCls = 'border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-lg px-3 py-2 text-sm'

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200">
          {activeView === 'cards'
            ? `All Cards (${filteredCards.length})`
            : `All Sentences (${allSentences.length})`}
        </h2>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-button text-button-foreground px-4 py-2 min-h-11 text-sm rounded-lg hover:bg-button-hover"
        >
          {showAdd ? 'Cancel' : 'Add Card'}
        </button>
      </div>

      {/* Add card form */}
      {showAdd && (
        <div className="bg-surface-1 rounded-xl shadow-sm p-4 flex flex-col gap-3">
          <select value={newCard.type} onChange={(e) => setNewCard({ ...newCard, type: e.target.value })} className={inputCls}>
            <option value="vocabulary">Vocabulary</option>
            <option value="grammar">Grammar</option>
            <option value="phrase">Phrase</option>
          </select>
          <input value={newCard.front} onChange={(e) => setNewCard({ ...newCard, front: e.target.value })} placeholder="Front (Korean)" className={inputCls} />
          <input value={newCard.back}  onChange={(e) => setNewCard({ ...newCard, back:  e.target.value })} placeholder="Back (English)"  className={inputCls} />
          <input value={newCard.notes} onChange={(e) => setNewCard({ ...newCard, notes: e.target.value })} placeholder="Notes (optional)" className={inputCls} />
          <button onClick={handleAdd} disabled={adding || !newCard.front || !newCard.back} className="bg-green-500 text-white px-4 py-2 min-h-11 text-sm rounded-lg hover:bg-green-600 disabled:opacity-50">
            {adding ? 'Adding...' : 'Add Card'}
          </button>
        </div>
      )}

      {/* View toggle: Cards | Sentences */}
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1 self-start">
        {(['cards', 'sentences'] as ActiveView[]).map((v) => (
          <button
            key={v}
            onClick={() => setActiveView(v)}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors capitalize ${
              activeView === v
                ? 'bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-100 shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {/* Filters (search + type pills + lesson range) */}
      <div className="flex gap-2 flex-wrap">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search cards or sentences..."
          className={`flex-1 min-w-[150px] ${inputCls}`}
        />
        {['all', 'vocabulary', 'grammar', 'phrase'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-2 min-h-11 text-sm rounded-lg capitalize ${
              filter === f ? 'bg-button-soft text-button font-medium' : 'bg-surface-1 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {f}
          </button>
        ))}
      </div>
      <LessonRangeFilter
        lessons={lessons}
        from={lessonFrom}
        to={lessonTo}
        onChange={(f, t) => { setLessonFrom(f); setLessonTo(t) }}
      />

      {/* ── CARDS VIEW ──────────────────────────────────────────────────────── */}
      {activeView === 'cards' && (
        <>
          {filteredCards.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              {cards.length === 0 ? 'No cards yet. Sync your Google Doc to get started.' : 'No cards match your search.'}
            </p>
          )}

          {groupedCards.map(({ label, key, cards: groupCards }) => (
            <div key={key} className="flex flex-col gap-2">
              {/* Group header */}
              <button
                onClick={() => toggleCollapse(key)}
                className="flex items-center gap-2 text-sm font-semibold text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors py-1"
              >
                <span className={`text-xs px-2 py-0.5 rounded-full ${typeBadgeClass(key === 'other' ? 'other' : key)}`}>
                  {label}
                </span>
                <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
                  {groupCards.length} card{groupCards.length !== 1 ? 's' : ''}
                </span>
                <span className="ml-auto text-xs opacity-50">{collapsed[key] ? '▶' : '▼'}</span>
              </button>

              {!collapsed[key] && groupCards.map((card, i) => (
                <div key={card.id}>
                  {editingId === card.id ? (
                    <CardEditor card={card} onSave={handleSave} onCancel={() => setEditingId(null)} />
                  ) : (
                    <div
                      className="bg-surface-1 rounded-xl shadow-sm p-4 flex flex-col gap-2 animate-slide-in"
                      style={{ animationDelay: `${Math.min(i * 25, 250)}ms` }}
                    >
                      {/* Card header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-1 rounded-full ${typeBadgeClass(card.type)}`}>
                            {card.type}
                          </span>
                          {card.lesson && (
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              Lesson {card.lesson.orderIndex}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {card.review && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">
                              {card.review.reps} review{card.review.reps !== 1 ? 's' : ''}
                            </span>
                          )}
                          <button onClick={() => setEditingId(card.id)} className="text-sm text-button hover:text-button-hover px-3 min-h-11 inline-flex items-center rounded-md hover:bg-button-soft">
                            Edit
                          </button>
                          <button onClick={() => handleDelete(card.id)} className="text-sm text-red-400 hover:text-red-600 px-3 min-h-11 inline-flex items-center rounded-md hover:bg-red-50 dark:hover:bg-red-500/10">
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Word / pattern */}
                      <p className="font-bold text-gray-800 dark:text-gray-100">{card.front}</p>
                      <p className="text-gray-500 dark:text-gray-400">{card.back}</p>
                      {card.notes && <p className="text-sm text-gray-500 dark:text-gray-400 italic">{card.notes}</p>}

                      {/* Example sentences — indented with left border */}
                      {(card.sentences ?? []).length > 0 && (
                        <div className="flex flex-col gap-1.5 mt-1 pl-3 border-l-2" style={{ borderColor: 'var(--highlight-bg)' }}>
                          {(card.sentences ?? []).map((s) => (
                            <div key={s.id}>
                              <HighlightedSentence
                                korean={s.korean}
                                targetForm={s.targetForm}
                                cardType={card.type}
                                className="text-sm text-gray-700 dark:text-gray-200"
                              />
                              {s.translation && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 italic">{s.translation}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </>
      )}

      {/* ── SENTENCES VIEW ──────────────────────────────────────────────────── */}
      {activeView === 'sentences' && (
        <>
          {allSentences.length === 0 && (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">
              {filteredCards.length === 0
                ? 'No cards match your filter.'
                : 'No example sentences yet. Sync a lesson to generate them.'}
            </p>
          )}

          <div className="flex flex-col gap-3">
            {allSentences.map(({ sentence, card }, i) => (
              <div
                key={sentence.id}
                className="bg-surface-1 rounded-xl shadow-sm p-4 flex flex-col gap-1 cursor-pointer hover:ring-1 hover:ring-button/40 transition-all animate-slide-in"
                style={{ animationDelay: `${Math.min(i * 25, 250)}ms` }}
                onClick={() => { setEditingId(card.id); setActiveView('cards') }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setEditingId(card.id); setActiveView('cards') } }}
              >
                {/* Sentence */}
                <HighlightedSentence
                  korean={sentence.korean}
                  targetForm={sentence.targetForm}
                  cardType={card.type}
                  className="text-base text-gray-800 dark:text-gray-100 font-medium leading-relaxed"
                />
                {sentence.translation && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 italic">{sentence.translation}</p>
                )}
                {/* Parent card reference */}
                <div className="flex items-center gap-2 mt-1">
                  <span className={`text-xs font-semibold px-1.5 py-0.5 rounded-full ${typeBadgeClass(card.type)}`}>
                    {card.type}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {card.front} — {card.back}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
