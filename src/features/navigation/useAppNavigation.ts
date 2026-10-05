import { useSyncExternalStore } from 'react'

export type PrimaryDestination = 'home' | 'transactions' | 'accounts' | 'more'
type AccountScreen = `accounts/${string}`
type ObligationScreen = `more/bills-installments/${string}`
export type AppScreen = PrimaryDestination | 'more/categories' | 'more/data-backup' | 'more/bills-installments' | 'transactions/new' | AccountScreen | ObligationScreen

function isObligationScreen(screen: string): screen is ObligationScreen {
  return screen.startsWith('more/bills-installments/') && screen.length > 'more/bills-installments/'.length
}

function isAccountScreen(screen: string): screen is AccountScreen {
  return screen.startsWith('accounts/') && screen.length > 'accounts/'.length
}

function readScreen(): AppScreen {
  const hash = window.location.hash.slice(1).split('?')[0]
  if (isAccountScreen(hash)) return hash
  if (isObligationScreen(hash)) return hash
  switch (hash) {
    case 'transactions':
    case 'transactions/new':
    case 'accounts':
    case 'more':
    case 'more/categories':
    case 'more/data-backup':
    case 'more/bills-installments':
      return hash
    default:
      return 'home'
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange)
  return () => window.removeEventListener('hashchange', onChange)
}

function readObligationMonth() {
  const month = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('month')
  return month && /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : undefined
}

/** Native hash links provide reload persistence and browser Back / Forward. */
export function useAppNavigation() {
  const screen = useSyncExternalStore(subscribe, readScreen)
  const obligationMonth = useSyncExternalStore(subscribe, readObligationMonth)
  const destination: PrimaryDestination = screen === 'more/categories' || screen === 'more/data-backup' || screen === 'more/bills-installments' || isObligationScreen(screen)
    ? 'more'
    : screen === 'transactions/new' ? 'transactions'
    : isAccountScreen(screen) ? 'accounts' : screen
  let accountId: string | undefined
  if (isAccountScreen(screen)) {
    try { accountId = decodeURIComponent(screen.slice('accounts/'.length)) }
    catch { accountId = screen.slice('accounts/'.length) }
  }
  let obligationId: string | undefined
  if (isObligationScreen(screen)) {
    try { obligationId = decodeURIComponent(screen.slice('more/bills-installments/'.length)) }
    catch { obligationId = screen.slice('more/bills-installments/'.length) }
  }
  return { screen, destination, accountId, obligationId, obligationMonth }
}
