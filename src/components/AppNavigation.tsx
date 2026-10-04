import type { PrimaryDestination } from '../features/navigation/useAppNavigation'

const destinations: readonly { id: PrimaryDestination; label: string; path: string }[] = [
  { id: 'home', label: 'Home', path: 'm3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z' },
  { id: 'transactions', label: 'Transactions', path: 'M4 7h16m-4-4 4 4-4 4M20 17H4m4-4-4 4 4 4' },
  { id: 'accounts', label: 'Accounts', path: 'M3 7h18v13H3ZM3 7V4h15v3m-2 6h5m-5 0v4h5' },
  { id: 'more', label: 'More', path: 'M4 5h16M4 12h16M4 19h16' },
]

export function AppNavigation({ active }: { active: PrimaryDestination }) {
  return (
    <nav className="app-navigation" aria-label="Primary">
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
