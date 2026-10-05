import { useSyncExternalStore } from 'react'

export type PrimaryDestination = 'home' | 'transactions' | 'accounts' | 'more'
type AccountScreen = `accounts/${string}`
export type AppScreen = PrimaryDestination | 'more/categories' | 'more/data-backup' | 'transactions/new' | AccountScreen

function isAccountScreen(screen: string): screen is AccountScreen {
  return screen.startsWith('accounts/') && screen.length > 'accounts/'.length
}

function readScreen(): AppScreen {
  const hash = window.location.hash.slice(1)
  if (isAccountScreen(hash)) return hash
  switch (hash) {
    case 'transactions':
    case 'transactions/new':
    case 'accounts':
    case 'more':
    case 'more/categories':
    case 'more/data-backup':
      return hash
    default:
      return 'home'
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

/** Native hash links provide reload persistence and browser Back / Forward. */
export function useAppNavigation() {
  const screen = useSyncExternalStore(subscribe, readScreen)
  const destination: PrimaryDestination = screen === 'more/categories' || screen === 'more/data-backup'
    ? 'more'
    : screen === 'transactions/new' ? 'transactions'
    : isAccountScreen(screen) ? 'accounts' : screen
  let accountId: string | undefined
  if (isAccountScreen(screen)) {
    try { accountId = decodeURIComponent(screen.slice('accounts/'.length)) }
    catch { accountId = screen.slice('accounts/'.length) }
  }
  return { screen, destination, accountId }
}
