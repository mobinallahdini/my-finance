import { useSyncExternalStore } from 'react'
import { createReportFilters } from '../../domain/transactionQuery'
import { localCalendarDate } from '../transactions/transactionHelpers'
import { defaultReportColumns, reportPeriodFilters, type ReportView } from './reportView'

// UI-only session state. No IndexedDB, localStorage, URL, or financial writes.
let current: ReportView | undefined
const listeners = new Set<() => void>()
function getSnapshot(): ReportView {
  current ??= { filters: reportPeriodFilters(createReportFilters(), 'month', localCalendarDate()),
    columns: defaultReportColumns, grouping: 'none', groupKey: null }
  return current
}
function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export function updateReportsSession(change: Partial<ReportView>) {
  current = { ...getSnapshot(), ...change }
  listeners.forEach(listener => listener())
}
export function useReportsSession() { return useSyncExternalStore(subscribe, getSnapshot, getSnapshot) }
