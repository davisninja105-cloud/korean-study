'use client'

/**
 * AudioButton
 * ===========
 * Plays Korean text-to-speech audio via /api/tts (Google Cloud Neural2).
 *
 * Fallback: if /api/tts returns a 503 (Cloud TTS or Blob not yet configured),
 * falls back silently to the browser's built-in speechSynthesis with a ko-KR
 * voice. This means audio works in development before cloud infra is wired.
 *
 * Usage:
 *   <AudioButton text="안녕하세요" aria-label="Play: 안녕하세요" />
 */

import { useCallback, useRef, useState } from 'react'
import { haptic } from '@/lib/haptics'

type PlayState = 'idle' | 'loading' | 'playing' | 'error'

interface Props {
  text: string
  voice?: string
  /** aria-label for the button. Required for accessibility. */
  'aria-label': string
  className?: string
  size?: 'sm' | 'md'
}

/** Speak text via browser speechSynthesis (ko-KR). No-op if not supported. */
function speakFallback(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      resolve()
      return
    }
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'ko-KR'
    utter.rate = 0.9
    const voices = window.speechSynthesis.getVoices()
    const koVoice = voices.find((v) => v.lang.startsWith('ko'))
    if (koVoice) utter.voice = koVoice
    utter.onend = () => resolve()
    utter.onerror = () => resolve()
    window.speechSynthesis.speak(utter)
  })
}

export default function AudioButton({
  text,
  voice,
  'aria-label': ariaLabel,
  className = '',
  size = 'md',
}: Props) {
  const [state, setState] = useState<PlayState>('idle')
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const play = useCallback(async () => {
    if (state === 'loading') return
    haptic('selection')
    setState('loading')

    try {
      const params = new URLSearchParams({ text, ...(voice ? { voice } : {}) })
      const res = await fetch(`/api/tts?${params}`)

      if (!res.ok) {
        // Cloud TTS not ready — fall back to browser speech
        setState('idle')
        await speakFallback(text)
        return
      }

      const data = (await res.json()) as { url: string }
      // Stop previous audio
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.src = ''
      }
      const audio = new Audio(data.url)
      audioRef.current = audio
      setState('playing')
      audio.onended = () => setState('idle')
      audio.onerror = () => setState('idle')
      await audio.play()
    } catch {
      // Network/API error — fall back to browser speech
      setState('idle')
      await speakFallback(text)
    }
  }, [state, text, voice])

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'
  const btnBase = `min-h-11 min-w-11 flex items-center justify-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-button/50 ${className}`

  if (state === 'loading') {
    return (
      <button
        disabled
        aria-label="Loading audio…"
        className={`${btnBase} opacity-60 cursor-wait`}
      >
        <span className={`inline-block border-2 border-button border-t-transparent rounded-full animate-spin ${iconSize}`} />
      </button>
    )
  }

  if (state === 'playing') {
    return (
      <button
        onClick={() => {
          audioRef.current?.pause()
          if (audioRef.current) audioRef.current.currentTime = 0
          setState('idle')
        }}
        aria-label="Stop audio"
        className={`${btnBase} text-button hover:bg-button-soft`}
      >
        {/* Stop icon */}
        <svg viewBox="0 0 16 16" fill="currentColor" className={iconSize} aria-hidden="true">
          <rect x="3" y="3" width="10" height="10" rx="1" />
        </svg>
      </button>
    )
  }

  return (
    <button
      onClick={play}
      aria-label={ariaLabel}
      className={`${btnBase} text-muted hover:text-muted-foreground hover:bg-surface-3`}
    >
      {/* Speaker icon */}
      <svg viewBox="0 0 16 16" fill="currentColor" className={iconSize} aria-hidden="true">
        <path d="M9 2.5a.5.5 0 0 0-.854-.354L4.793 5.5H2.5A1.5 1.5 0 0 0 1 7v2a1.5 1.5 0 0 0 1.5 1.5h2.293l3.353 3.354A.5.5 0 0 0 9 13.5V2.5z" />
        <path d="M11.293 4.707a1 1 0 0 1 1.414 0A5 5 0 0 1 14 8a5 5 0 0 1-1.293 3.293 1 1 0 0 1-1.414-1.414A3 3 0 0 0 12 8a3 3 0 0 0-.707-1.879 1 1 0 0 1 0-1.414z" />
      </svg>
    </button>
  )
}
