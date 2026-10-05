import { useLayoutEffect, useRef } from 'react'
import type { PrimaryDestination } from '../features/navigation/useAppNavigation'

const destinations: readonly { id: PrimaryDestination; label: string; path: string }[] = [
  { id: 'home', label: 'Home', path: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z' },
  { id: 'transactions', label: 'Transactions', path: 'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4' },
  { id: 'accounts', label: 'Accounts', path: 'M3 7h18v13H3ZM3 7V4h15v3m-2 6h5m-5 0v4h5' },
  { id: 'more', label: 'More', path: 'M4 5h16M4 12h16M4 19h16' },
]

export function AppNavigation({ active }: { active: PrimaryDestination }) {
  const navigationRef = useRef<HTMLElement>(null)
  useLayoutEffect(() => {
    const navigation = navigationRef.current
    const shell = navigation?.closest<HTMLElement>('.app-shell')
    if (!navigation || !shell) return
    // Wrapped labels at large text sizes can exceed the navigation's minimum height.
    const measure = () => shell.style.setProperty('--navigation-height', `${navigation.getBoundingClientRect().height}px`)
    measure()
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(measure)
    observer?.observe(navigation)
    window.addEventListener('resize', measure)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      shell.style.removeProperty('--navigation-height')
    }
  }, [])
  return (
    <nav ref={navigationRef} className="app-navigation" aria-label="Primary">
      {destinations.map(({ id, label, path }) => (
        <a key={id} className="app-navigation-link" href={`#${id}`}
          aria-current={active === id ? 'page' : undefined}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d={path} />
          </svg>
          <span>{label}</span>
        </a>
      ))}
    </nav>
  )
}
