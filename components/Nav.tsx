'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, BookOpen, Layers, Flame, Settings } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

const links: { href: string; label: string; Icon: LucideIcon }[] = [
  { href: '/',        label: 'Home',     Icon: Home },
  { href: '/study',   label: 'Study',    Icon: BookOpen },
  { href: '/cards',   label: 'Cards',    Icon: Layers },
  { href: '/habits',  label: 'Habits',   Icon: Flame },
  { href: '/settings',label: 'Settings', Icon: Settings },
]

export default function Nav() {
  const pathname = usePathname()

  return (
    <>
      {/* ── Top bar: brand always; text links on desktop only ── */}
      <header className="bg-white dark:bg-gray-900 shadow-sm dark:shadow-none dark:border-b dark:border-gray-800 sticky top-0 z-10 pt-[env(safe-area-inset-top)]">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gray-800 dark:text-gray-100">
            Korean Study
          </Link>
          {/* Desktop-only inline links */}
          <nav className="hidden sm:flex gap-1">
            {links.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  pathname === href
                    ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-300'
                    : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      {/* ── Bottom tab bar: mobile only ── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-10 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-2xl mx-auto flex">
          {links.map(({ href, label, Icon }) => {
            const active = pathname === href
            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center gap-1 py-2 text-xs font-medium transition-colors ${
                  active
                    ? 'text-blue-600 dark:text-blue-300'
                    : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'
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
