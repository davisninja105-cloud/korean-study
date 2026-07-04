'use client'

import { useState } from 'react'
import Link from 'next/link'
import HighlightedSentence from './HighlightedSentence'
import { sentenceMatch } from '@/lib/sentence-match'

interface LocalSentence {
  id: string          // DB id (empty string for new, unsaved sentences)
  korean: string
  targetForm: string
  translation: string
}

interface Card {
  id: string
  type: string
  front: string
  back: string
  notes?: string | null
  sentences?: LocalSentence[]
}

interface Props {
  card: Card
  onSave: (updated: Card) => void
  onCancel: () => void
}

export default function CardEditor({ card, onSave, onCancel }: Props) {
  const [type,  setType]  = useState(card.type)
  const [front, setFront] = useState(card.front)
  const [back,  setBack]  = useState(card.back)
  const [notes, setNotes] = useState(card.notes ?? '')
  const [sentences, setSentences] = useState<LocalSentence[]>(
    (card.sentences ?? []).map((s) => ({ ...s }))
  )
  const [saving, setSaving] = useState(false)

  // ── Sentence helpers ────────────────────────────────────────────────────────
  const addSentence = () => {
    setSentences((prev) => [
      ...prev,
      {
        id: '',           // new — no DB row yet
        korean: '',
        targetForm: front, // auto-fill from card front (most common case)
        translation: '',
      },
    ])
  }

  const updateSentence = (idx: number, field: keyof LocalSentence, value: string) => {
    setSentences((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s
        const updated = { ...s, [field]: value }
        // When korean changes and targetForm still equals the current front,
        // re-confirm it (keeps the auto-fill in sync while the user types the sentence).
        if (field === 'korean' && s.targetForm === front) {
          updated.targetForm = front
        }
        return updated
      })
    )
  }

  const removeSentence = (idx: number) => {
    setSentences((prev) => prev.filter((_, i) => i !== idx))
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          front,
          back,
          notes: notes || null,
          sentences: sentences
            .filter((s) => s.korean.trim() && s.targetForm.trim())
            .map(({ korean, targetForm, translation }) => ({ korean, targetForm, translation })),
        }),
      })
      if (!res.ok) throw new Error(`Save failed: ${res.status}`)
      const updated = await res.json()
      onSave(updated)
    } catch (err) {
      console.error('CardEditor save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  // ── Shared input class ────────────────────────────────────────────────────
  const inputCls = 'border border-border bg-surface-1 text-foreground rounded-lg px-3 py-2 text-sm w-full'

  return (
    <div className="bg-surface-2 rounded-xl p-4 flex flex-col gap-3">
      {/* ── Core fields ── */}
      <select value={type} onChange={(e) => setType(e.target.value)} className={inputCls}>
        <option value="vocabulary">Vocabulary</option>
        <option value="grammar">Grammar</option>
        <option value="phrase">Phrase</option>
      </select>
      <input
        value={front}
        onChange={(e) => setFront(e.target.value)}
        placeholder="Front (Korean)"
        className={`hangul ${inputCls}`}
      />
      <input
        value={back}
        onChange={(e) => setBack(e.target.value)}
        placeholder="Back (English)"
        className={inputCls}
      />
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes (optional)"
        className={inputCls}
        rows={2}
      />

      {/* ── Sentences editor ── */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">
          Example Sentences
        </p>

        {sentences.map((s, idx) => {
          const match = sentenceMatch(s.korean, s.targetForm)

          // Warning state
          const warnNotFound   = s.korean.length > 0 && s.targetForm.length > 0 && !match.found
          const warnUnsafe     = match.found && !match.safeToBlank

          return (
            <div
              key={idx}
              className="bg-surface-1 rounded-lg p-3 flex flex-col gap-2 border border-border"
            >
              {/* Korean sentence */}
              <input
                value={s.korean}
                onChange={(e) => updateSentence(idx, 'korean', e.target.value)}
                placeholder="Korean sentence (e.g. 저는 학교에 가요)"
                className={`hangul ${inputCls}`}
              />

              {/* Target form + delete button */}
              <div className="flex gap-2 items-start">
                <div className="flex-1">
                  <input
                    value={s.targetForm}
                    onChange={(e) => updateSentence(idx, 'targetForm', e.target.value)}
                    placeholder={`Target word (e.g. ${front || '가요'})`}
                    className={`${inputCls} ${
                      warnNotFound
                        ? 'border-red-400 dark:border-red-500 focus:ring-red-300'
                        : warnUnsafe
                        ? 'border-amber-400 dark:border-amber-500 focus:ring-amber-300'
                        : ''
                    }`}
                  />
                  {/* Mismatch warnings */}
                  {warnNotFound && (
                    <p className="text-xs text-red-500 dark:text-red-400 mt-1">
                      Target not found in sentence — won&apos;t highlight or fill blank
                    </p>
                  )}
                  {warnUnsafe && !warnNotFound && (
                    <p className="text-xs text-amber-500 dark:text-amber-400 mt-1">
                      {s.targetForm.length <= 1
                        ? 'Single character — will highlight only (too ambiguous to blank)'
                        : 'Target appears multiple times — will highlight only (can\'t reliably blank)'}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => removeSentence(idx)}
                  className="text-red-400 hover:text-red-600 min-h-11 min-w-11 flex items-center justify-center rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 text-sm shrink-0"
                  title="Remove sentence"
                  aria-label="Remove sentence"
                >
                  ✕
                </button>
              </div>

              {/* Translation */}
              <input
                value={s.translation}
                onChange={(e) => updateSentence(idx, 'translation', e.target.value)}
                placeholder="English translation"
                className={inputCls}
              />

              {/* Live highlight preview */}
              {s.korean.length > 0 && (
                <div className="text-sm text-muted bg-surface-2 rounded px-2 py-1.5 leading-relaxed">
                  <span className="text-xs text-muted mr-1">Preview:</span>
                  <HighlightedSentence korean={s.korean} targetForm={s.targetForm} />
                </div>
              )}
            </div>
          )
        })}

        <button
          onClick={addSentence}
          className="text-sm text-button hover:text-button-hover text-left hover:underline"
        >
          + Add sentence
        </button>
      </div>

      {/* ── Action buttons ── */}
      <div className="flex gap-2 justify-between">
        <Link
          href={`/history?cardId=${card.id}`}
          className="text-sm text-button hover:text-button-hover self-center"
        >
          View history →
        </Link>
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 min-h-11 text-sm text-muted hover:bg-surface-3 rounded-lg"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !front || !back}
            className="bg-button text-button-foreground px-4 py-2 min-h-11 text-sm rounded-lg hover:bg-button-hover disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
