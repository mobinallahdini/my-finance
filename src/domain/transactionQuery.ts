import type { Account, Category, MoneyCents, Transaction } from './models.ts'
import { requireCalendarDate, requireCalendarMonth } from './calendar.ts'
import { requireSafeCents } from './money.ts'

export const filterTypes = ['expense', 'income', 'transfer', 'refund'] as const
export const filterAccountTypes = ['bank', 'cash', 'credit_card'] as const
export const transactionTypeLabels: Readonly<Record<Transaction['type'], string>> = {
  expense: 'Expense', income: 'Income', transfer: 'Transfer', refund: 'Refund',
}
export type DateMode = 'month' | 'range' | 'all'
export interface TransactionFilterState {
  readonly query: string
  readonly dateMode: DateMode
  readonly month: string
  readonly fromDate: string
  readonly toDate: string
  readonly minimum: MoneyCents | null
  readonly maximum: MoneyCents | null
  readonly types: readonly Transaction['type'][]
  readonly accountIds: readonly string[]
  /** Absent/empty preserves the existing history filter behavior. */
  readonly accountTypes?: readonly Account['type'][]
  readonly categoryIds: readonly string[]
}
declare const validatedFilters: unique symbol
export type ValidatedTransactionFilters = TransactionFilterState & { readonly [validatedFilters]: true }

function selection<T>(values: readonly T[], valid: (value: T) => boolean): readonly T[] {
  if (!Array.isArray(values)) throw new RangeError('Invalid filter selection.')
  const copy = [...values]
  if (!copy.every(valid)) throw new RangeError('Invalid filter selection.')
  return Object.freeze(copy)
}
function validId(value: string): boolean { return typeof value === 'string' && value.trim().length > 0 }

/** Validate and snapshot active criteria; inactive date fields deliberately do not restrict results. */
export function validateTransactionFilters(filters: TransactionFilterState): ValidatedTransactionFilters {
  if (!filters || typeof filters.query !== 'string' || !['all', 'month', 'range'].includes(filters.dateMode)) {
    throw new RangeError('Invalid transaction filters.')
  }
  if ([filters.month, filters.fromDate, filters.toDate].some(value => typeof value !== 'string')) {
    throw new RangeError('Date filter values must be text.')
  }
  if (filters.dateMode === 'month') requireCalendarMonth(filters.month)
  if (filters.dateMode === 'range') {
    if (typeof filters.fromDate !== 'string' || typeof filters.toDate !== 'string') throw new RangeError('Invalid date range.')
    if (filters.fromDate) requireCalendarDate(filters.fromDate)
    if (filters.toDate) requireCalendarDate(filters.toDate)
    if (filters.fromDate && filters.toDate && filters.fromDate > filters.toDate) throw new RangeError('To date must be on or after From date.')
  }
  for (const amount of [filters.minimum, filters.maximum]) {
    if (amount !== null) {
      requireSafeCents(amount)
      if (amount < 0) throw new RangeError('Amount bounds must be non-negative.')
    }
  }
  if (filters.minimum !== null && filters.maximum !== null && filters.minimum > filters.maximum) {
    throw new RangeError('Maximum amount must be at least the minimum amount.')
  }
  return Object.freeze({ query: filters.query, dateMode: filters.dateMode, month: filters.month,
    fromDate: filters.fromDate, toDate: filters.toDate, minimum: filters.minimum, maximum: filters.maximum,
    types: selection(filters.types, type => filterTypes.includes(type)),
    accountIds: selection(filters.accountIds, validId),
    accountTypes: selection(filters.accountTypes === undefined ? [] : filters.accountTypes, type => filterAccountTypes.includes(type)),
    categoryIds: selection(filters.categoryIds, validId),
  }) as ValidatedTransactionFilters
}

/** No clock or currency dependency: reports default to all dates and all types. */
export function createReportFilters(filters: Partial<TransactionFilterState> = {}): ValidatedTransactionFilters {
  return validateTransactionFilters({ query: '', dateMode: 'all', month: '', fromDate: '', toDate: '',
    minimum: null, maximum: null, types: filterTypes, accountIds: [], categoryIds: [], ...filters })
}

/** AND across groups, OR within selections; account restrictions apply to the same endpoint. */
export function filterTransactions(transactions: readonly Transaction[], accounts: readonly Account[],
  categories: readonly Category[], criteria: TransactionFilterState): Transaction[] {
  const filters = validateTransactionFilters(criteria)
  const accountMap = new Map(accounts.map(account => [account.id, account]))
  const categoryNames = new Map(categories.map(category => [category.id, category.name]))
  const accountName = (id: string) => accountMap.get(id)?.name ?? `Unavailable account (${id})`
  const accountIds = new Set(filters.accountIds), accountTypes = new Set(filters.accountTypes)
  const categoryIds = new Set(filters.categoryIds), types = new Set(filters.types)
  const restrictedAccounts = accountIds.size > 0 || accountTypes.size > 0
  const eligibleAccount = (id: string) => {
    const type = accountMap.get(id)?.type
    return (!accountIds.size || accountIds.has(id)) && (!accountTypes.size || type !== undefined && accountTypes.has(type))
  }
  const query = filters.query.trim().toLowerCase()
  return transactions.filter(transaction => {
    if (!types.has(transaction.type)) return false
    if (filters.dateMode === 'month' && !transaction.date.startsWith(`${filters.month}-`)) return false
    if (filters.dateMode === 'range' && ((filters.fromDate && transaction.date < filters.fromDate)
      || (filters.toDate && transaction.date > filters.toDate))) return false
    if (filters.minimum !== null && transaction.amount < filters.minimum) return false
    if (filters.maximum !== null && transaction.amount > filters.maximum) return false
    if (restrictedAccounts && (transaction.type === 'transfer'
      ? !eligibleAccount(transaction.fromAccountId) && !eligibleAccount(transaction.toAccountId)
      : !eligibleAccount(transaction.accountId))) return false
    if (categoryIds.size && (transaction.type === 'transfer' || !categoryIds.has(transaction.categoryId))) return false
    if (!query) return true
    const text = transaction.type === 'transfer'
      ? [accountName(transaction.fromAccountId), accountName(transaction.toAccountId)]
      : [categoryNames.get(transaction.categoryId) ?? `Unavailable category (${transaction.categoryId})`, accountName(transaction.accountId)]
    text.push(transactionTypeLabels[transaction.type], transaction.note ?? '')
    if (transaction.type === 'expense') text.push(transaction.receiptNumber ?? '')
    return text.some(value => value.toLowerCase().includes(query))
  })
}

/** Date descending, then source ID ascending; no locale, timestamps, or input mutation. */
export function compareTransactions(left: Transaction, right: Transaction): number {
  if (left.date !== right.date) return left.date > right.date ? -1 : 1
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}
