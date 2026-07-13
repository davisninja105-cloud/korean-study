'use client'

import { useState } from 'react'

export type StudyMode = 'flashcard' | 'multiple-choice' | 'fill-blank'
export type FlashcardSubMode = 'exposure' | 'recall'

interface Props {
  cardCount: number
  onSelect: (mode: StudyMode, includeAI: boolean, flashcardSubMode: FlashcardSubMode) => void
}

const modes: { value: StudyMode; label: string; desc: string }[] = [
  { value: 'flashcard',        label: 'Flashcards',       desc: 'Reveal and self-rate' },
  { value: 'multiple-choice',  label: 'Multiple Choice',  desc: 'Pick the correct meaning' },
  { value: 'fill-blank',       label: 'Fill in the Blank', desc: 'Fill in the sentence' },
]

export default function ModeSelector({ cardCount, onSelect }: Props) {
  const [includeAI, setIncludeAI] = useState(false)
  const [flashcardSubMode, setFlashcardSubMode] = useState<FlashcardSubMode>('exposure')

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <h2 className="text-2xl font-bold text-foreground">Choose Study Mode</h2>
      <p className="text-muted">{cardCount} card{cardCount !== 1 ? 's' : ''} due for review</p>

      <div className="grid grid-cols-1 gap-4 w-full max-w-sm">
        {modes.map((mode) => (
          <div key={mode.value}>
            <button
              data-testid={`mode-${mode.value}`}
              onClick={() => onSelect(mode.value, includeAI, flashcardSubMode)}
              className="w-full flex flex-col items-center bg-surface-1 border-2 border-border rounded-xl p-5 font-semibold text-foreground hover:border-button hover:bg-button-soft transition-colors text-lg"
            >
              {mode.label}
              <span className="text-sm text-muted mt-1 font-normal">{mode.desc}</span>
            </button>

            {/* Exposure / Recall sub-toggle — only shown under Flashcards */}
            {mode.value === 'flashcard' && (
              <div className="flex gap-1 mt-2 bg-surface-3 rounded-lg p-1">
                <button
                  onClick={() => setFlashcardSubMode('exposure')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    flashcardSubMode === 'exposure'
                      ? 'bg-surface-1 text-foreground shadow-sm'
                      : 'text-muted hover:text-muted-foreground'
                  }`}
                >
                  Exposure
                  <span className="block text-[10px] font-normal opacity-70">word shown in sentence</span>
                </button>
                <button
                  onClick={() => setFlashcardSubMode('recall')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    flashcardSubMode === 'recall'
                      ? 'bg-surface-1 text-foreground shadow-sm'
                      : 'text-muted hover:text-muted-foreground'
                  }`}
                >
                  Recall
                  <span className="block text-[10px] font-normal opacity-70">word blanked — retrieve first</span>
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
        <input
          type="checkbox"
          checked={includeAI}
          onChange={(e) => setIncludeAI(e.target.checked)}
          className="rounded"
        />
        Include AI-generated practice questions
      </label>
    </div>
  )
}
