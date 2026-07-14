'use client'

import { useState } from 'react'

export type StudyMode = 'passive' | 'active'

interface Props {
  cardCount: number
  onSelect: (mode: StudyMode, includeAI: boolean) => void
}

export default function ModeSelector({ cardCount, onSelect }: Props) {
  const [mode, setMode] = useState<StudyMode>('passive') // MODE-02 — no unselected flash
  const [includeAI, setIncludeAI] = useState(false)

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <h2 className="text-2xl font-bold text-foreground">How do you want to study?</h2>
      <p className="text-muted">{cardCount} card{cardCount !== 1 ? 's' : ''} due for review</p>

      {/* Passive / Active segmented toggle */}
      <div className="flex gap-2 bg-surface-3 rounded-lg p-1 w-full max-w-sm">
        <button
          data-testid="mode-passive"
          aria-pressed={mode === 'passive'}
          onClick={() => setMode('passive')}
          className={`flex-1 py-3 px-4 rounded-md transition-colors ${
            mode === 'passive'
              ? 'bg-surface-1 text-foreground shadow-sm'
              : 'text-muted hover:text-muted-foreground'
          }`}
        >
          <span className="block text-sm font-semibold">Passive</span>
          <span className="block text-xs font-normal opacity-70">recognize &amp; review</span>
        </button>
        <button
          data-testid="mode-active"
          aria-pressed={mode === 'active'}
          onClick={() => setMode('active')}
          className={`flex-1 py-3 px-4 rounded-md transition-colors ${
            mode === 'active'
              ? 'bg-surface-1 text-foreground shadow-sm'
              : 'text-muted hover:text-muted-foreground'
          }`}
        >
          <span className="block text-sm font-semibold">Active</span>
          <span className="block text-xs font-normal opacity-70">produce from English</span>
        </button>
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

      <button
        data-testid="begin-session-btn"
        onClick={() => onSelect(mode, includeAI)}
        className="w-full max-w-sm min-h-11 bg-button text-button-foreground rounded-lg font-medium hover:bg-button-hover transition-colors"
      >
        Start session
      </button>
    </div>
  )
}
