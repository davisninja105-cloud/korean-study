'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, BookOpen, Layers, Flame, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { haptic } from '@/lib/haptics'

const links: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: '/',       label: 'Home',   Icon: Home },
  { href: '/study',  label: 'Study',  Icon: BookOpen },
  { href: '/cards',  label: 'Cards',  Icon: Layers },
  { href: '/habits', label: 'Habits', Icon: Flame },
]

export default function Nav() {
  const pathname = usePathname()
  const settingsActive = pathname === '/settings'

  return (
    <>
      {/* ── Top bar: brand + settings gear (all sizes); inline links on desktop ── */}
      <header className="bg-surface-1/95 backdrop-blur-md saturate-150 shadow-sm dark:shadow-none dark:border-b dark:border-border sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <Link href="/" className="text-xl font-bold text-foreground">
            Korean Study
          </Link>
          <div className="flex items-center gap-1">
            {/* Desktop-only inline links */}
            <nav className="hidden sm:flex gap-1">
              {links.map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={pathname === href ? 'page' : undefined}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    pathname === href
                      ? 'bg-button-soft text-button'
                      : 'text-muted hover:bg-surface-3'
                  }`}
                >
                  {label}
                </Link>
              ))}
            </nav>
            {/* Settings gear — visible on all sizes (iOS convention for a focused app) */}
            <Link
              href="/settings"
              aria-label="Settings"
              aria-current={settingsActive ? 'page' : undefined}
              className={`flex items-center justify-center min-h-11 min-w-11 rounded-lg active:opacity-70 transition-colors ${
                settingsActive
                  ? 'bg-button-soft text-button'
                  : 'text-muted hover:bg-surface-3'
              }`}
            >
              <Settings className="w-5 h-5" strokeWidth={settingsActive ? 2.5 : 1.75} />
            </Link>
          </div>
        </div>
      </header>

      {/* ── Bottom tab bar: mobile only ── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-10 bg-surface-1/95 backdrop-blur-md saturate-150 border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="max-w-2xl mx-auto flex">
          {links.map(({ href, label, Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? 'page' : undefined}
                onClick={() => haptic('selection')}
                className={`flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium min-h-[44px] active:opacity-70 transition-colors ${
                  active
                    ? 'text-button'
                    : 'text-muted hover:text-muted-foreground'
                }`}
              >
                <Icon className="w-5 h-5" strokeWidth={active ? 2.5 : 1.75} />
                {label}
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
