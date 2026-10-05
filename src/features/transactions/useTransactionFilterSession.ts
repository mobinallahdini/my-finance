import { useSyncExternalStore } from 'react'
import { initialTransactionFilters, type TransactionFilterState } from './transactionFiltering'

// UI-only state for this app session, including Transactions remounts. Reload resets it.
let currentFilters = initialTransactionFilters()
const listeners = new Set<() => void>()
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
function getSnapshot() { return currentFilters }
export function setTransactionFilters(filters: TransactionFilterState) {
  currentFilters = filters
  listeners.forEach((listener) => listener())
}
export function useTransactionFilterSession() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
