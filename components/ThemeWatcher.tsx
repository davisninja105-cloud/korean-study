'use client'

import { useEffect } from 'react'
import { getStoredTheme, applyTheme } from '@/lib/theme'

/**
 * Re-applies the resolved theme when the OS color scheme changes *while in
 * System mode*. The pre-paint script in app/layout.tsx handles the initial
 * paint; this keeps a tab open in System mode in sync if the user flips their
 * OS appearance. Renders nothing.
 */
export default function ThemeWatcher() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      if (getStoredTheme() === 'system') applyTheme('system')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return null
}
