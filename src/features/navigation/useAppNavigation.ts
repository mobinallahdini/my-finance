import { useSyncExternalStore } from 'react'

export type PrimaryDestination = 'home' | 'transactions' | 'accounts' | 'more'
export type AppScreen = PrimaryDestination | 'more/categories' | 'transactions/new'

function readScreen(): AppScreen {
  const hash = window.location.hash.slice(1)
  switch (hash) {
    case 'transactions':
    case 'transactions/new':
    case 'accounts':
    case 'more':
    case 'more/categories':
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
  const destination: PrimaryDestination = screen === 'more/categories'
    ? 'more'
    : screen === 'transactions/new' ? 'transactions' : screen
  return { screen, destination }
}
