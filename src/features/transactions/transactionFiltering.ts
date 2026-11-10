import type { Account, Category } from '../../domain/models'
import { requireCalendarDate, requireCalendarMonth } from '../../domain/calendar.ts'
import { filterTypes, type TransactionFilterState } from '../../domain/transactionQuery.ts'
export { filterTypes, filterTransactions } from '../../domain/transactionQuery.ts'
export type { DateMode, TransactionFilterState } from '../../domain/transactionQuery.ts'
import { dollarsForInput, formatMoney, parseDollars } from '../accounts/money.ts'
import { localCalendarDate, transactionTypeLabels } from './transactionHelpers.ts'
import { readableMonth } from './transactionPresentation.ts'

export interface TransactionFilterDraft extends Omit<TransactionFilterState, 'minimum' | 'maximum'> {
  minimum: string
  maximum: string
}
export type FilterField = 'month' | 'fromDate' | 'toDate' | 'minimum' | 'maximum'
export type FilterErrors = Partial<Record<FilterField, string>>
export type FilterGroup = 'query' | 'date' | 'amount' | 'types' | 'accounts' | 'categories'

/** History starts in the current local month; Clear removes every restriction. */
export function emptyTransactionFilters(): TransactionFilterState {
  return {
    query: '', dateMode: 'all', month: localCalendarDate().slice(0, 7), fromDate: '', toDate: '',
    minimum: null, maximum: null, types: [...filterTypes], accountIds: [], categoryIds: [],
  }
}
export function initialTransactionFilters(): TransactionFilterState {
  return { ...emptyTransactionFilters(), dateMode: 'month' }
}
export function filterDraft(filters: TransactionFilterState): TransactionFilterDraft {
  return {
    ...filters,
    minimum: filters.minimum === null ? '' : dollarsForInput(filters.minimum),
    maximum: filters.maximum === null ? '' : dollarsForInput(filters.maximum),
  }
}

function validMonth(value: string): boolean {
  try { requireCalendarMonth(value); return true }
  catch { return false }
}
function validDate(value: string): boolean {
  try { requireCalendarDate(value); return true }
  catch { return false }
}
export function validateFilterDraft(draft: TransactionFilterDraft): { value: TransactionFilterState | null; errors: FilterErrors } {
  const errors: FilterErrors = {}
  if (draft.dateMode === 'month' && !validMonth(draft.month)) errors.month = 'Choose a valid month.'
  if (draft.dateMode === 'range') {
    for (const field of ['fromDate', 'toDate'] as const) {
      if (draft[field] && !validDate(draft[field])) errors[field] = 'Enter a valid calendar date.'
    }
    if (!errors.fromDate && !errors.toDate && draft.fromDate && draft.toDate && draft.fromDate > draft.toDate) {
      errors.toDate = 'To date must be on or after From date.'
    }
  }
  const amounts: { minimum: number | null; maximum: number | null } = { minimum: null, maximum: null }
  for (const field of ['minimum', 'maximum'] as const) {
    if (!draft[field].trim()) continue
    try { amounts[field] = parseDollars(draft[field]) }
    catch (error) { errors[field] = error instanceof Error ? error.message : 'Enter zero or a positive amount.' }
  }
  if (!errors.minimum && !errors.maximum && amounts.minimum !== null && amounts.maximum !== null && amounts.minimum > amounts.maximum) {
    errors.maximum = 'Maximum amount must be at least the minimum amount.'
  }
  return { value: Object.keys(errors).length ? null : { ...draft, ...amounts }, errors }
}

export function filterChips(filters: TransactionFilterState, accounts: readonly Account[], categories: readonly Category[], currencyCode: string): { group: FilterGroup; label: string }[] {
  const chips: { group: FilterGroup; label: string }[] = []
  if (filters.dateMode === 'month') chips.push({ group: 'date', label: readableMonth(filters.month) })
  if (filters.dateMode === 'range' && (filters.fromDate || filters.toDate)) {
    const label = filters.fromDate && filters.toDate ? `${filters.fromDate} – ${filters.toDate}`
      : filters.fromDate ? `From ${filters.fromDate}` : `Through ${filters.toDate}`
    chips.push({ group: 'date', label })
  }
  if (filters.query.trim()) chips.push({ group: 'query', label: `Search: “${filters.query.trim()}”` })
  if (filters.minimum !== null || filters.maximum !== null) {
    const label = filters.minimum !== null && filters.maximum !== null ? `${formatMoney(filters.minimum, currencyCode)} – ${formatMoney(filters.maximum, currencyCode)}`
      : filters.minimum !== null ? `At least ${formatMoney(filters.minimum, currencyCode)}` : `Up to ${formatMoney(filters.maximum!, currencyCode)}`
    chips.push({ group: 'amount', label })
  }
  if (filters.types.length !== filterTypes.length) {
    chips.push({ group: 'types', label: filterTypes.filter((type) => filters.types.includes(type)).map((type) => transactionTypeLabels[type]).join(' + ') || 'No types' })
  }
  if (filters.accountIds.length) {
    const id = filters.accountIds[0]
    chips.push({ group: 'accounts', label: filters.accountIds.length > 1 ? `${filters.accountIds.length} accounts`
      : accounts.find((account) => account.id === id)?.name ?? `Unavailable account (${id})` })
  }
  if (filters.categoryIds.length) {
    const category = categories.find((item) => item.id === filters.categoryIds[0])
    chips.push({ group: 'categories', label: filters.categoryIds.length > 1 ? `${filters.categoryIds.length} categories`
      : category ? `${category.name} · ${transactionTypeLabels[category.type]}` : `Unavailable category (${filters.categoryIds[0]})` })
  }
  return chips
}
export function removeFilterGroup(filters: TransactionFilterState, group: FilterGroup): TransactionFilterState {
  switch (group) {
    case 'query': return { ...filters, query: '' }
    case 'date': return { ...filters, dateMode: 'all', fromDate: '', toDate: '' }
    case 'amount': return { ...filters, minimum: null, maximum: null }
    case 'types': return { ...filters, types: [...filterTypes] }
    case 'accounts': return { ...filters, accountIds: [] }
    case 'categories': return { ...filters, categoryIds: [] }
  }
}
