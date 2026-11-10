import type { Account, CalendarDate, Category, MoneyCents, Transaction, YearMonth } from './models.ts'
import { requireCalendarDate } from './calendar.ts'
import { expenseSubtotal, validateExpenseDetails } from './expenseDetails.ts'
import { calculateFinancialSummary, type FinancialSummary } from './financialSummary.ts'
import { requirePositiveAmount, requireSafeCents } from './money.ts'
import { compareTransactions, filterAccountTypes, filterTransactions, filterTypes,
  transactionTypeLabels, validateTransactionFilters, type ValidatedTransactionFilters } from './transactionQuery.ts'

export type ReportGrouping = 'none' | 'type' | 'category' | 'month' | 'account'
export interface ReportQuery {
  readonly accounts: readonly Account[]
  readonly categories: readonly Category[]
  readonly transactions: readonly Transaction[]
  readonly filters: ValidatedTransactionFilters
  readonly grouping?: ReportGrouping
}
export interface ReportAccount {
  readonly id: string
  readonly name: string
  readonly type: Account['type'] | null
  readonly isUnknown: boolean
}
export interface ReportCategory {
  readonly id: string
  readonly name: string
  readonly type: Category['type'] | null
  readonly isUnknown: boolean
}
export interface ReportRow {
  readonly id: string
  readonly date: CalendarDate
  readonly type: Transaction['type']
  readonly amountCents: MoneyCents
  readonly category: ReportCategory | null
  readonly account: ReportAccount | null
  readonly fromAccount: ReportAccount | null
  readonly toAccount: ReportAccount | null
  /** Transfers expose each endpoint's type instead of inventing a single type. */
  readonly accountType: Account['type'] | null
  readonly note: string | null
  readonly taxAmountCents: MoneyCents | null
  readonly expenseSubtotalCents: MoneyCents | null
  readonly receiptNumber: string | null
}
interface ReportGroupBase {
  readonly key: string
  readonly label: string
  /** Membership refers to global rows; records are not copied into groups. */
  readonly transactionIds: readonly string[]
  readonly summary: FinancialSummary
}
type GroupIdentity =
  | { readonly kind: 'type'; readonly transactionType: Transaction['type'] }
  | { readonly kind: 'month'; readonly month: YearMonth }
  | { readonly kind: 'category'; readonly category: ReportCategory | null }
  | { readonly kind: 'account'; readonly account: ReportAccount }
export type ReportGroup = ReportGroupBase & (Exclude<GroupIdentity, { kind: 'account' }> | {
  readonly kind: 'account'
  readonly account: ReportAccount
  /** Positive endpoint volumes, separate from the member-transaction summary. */
  readonly transferInCents: MoneyCents
  readonly transferOutCents: MoneyCents
})
export interface PreparedReport {
  readonly filters: ValidatedTransactionFilters
  readonly grouping: ReportGrouping
  readonly sourceTransactionCount: number
  readonly matchedTransactionCount: number
  readonly rows: readonly ReportRow[]
  readonly summary: FinancialSummary
  readonly groups: readonly ReportGroup[]
}

function requireId(id: string): void {
  if (typeof id !== 'string' || !id.trim()) throw new RangeError('Report source IDs must be non-empty strings.')
}
function recordsById<T extends { readonly id: string }>(records: readonly T[]): Map<string, T> {
  const result = new Map<string, T>()
  for (const record of records) {
    requireId(record.id)
    if (result.has(record.id)) throw new RangeError(`Duplicate report source ID: ${record.id}.`)
    result.set(record.id, record)
  }
  return result
}
/** Guard calculation inputs without repairing, normalizing, or persisting them. */
function validateReportTransaction(transaction: Transaction): void {
  requireCalendarDate(transaction.date)
  requirePositiveAmount(transaction.amount)
  if (!filterTypes.includes(transaction.type)) throw new RangeError('Invalid transaction type.')
  validateExpenseDetails(transaction)
  if (transaction.note !== undefined && typeof transaction.note !== 'string') throw new RangeError('Transaction note must be text.')
  if (transaction.type === 'transfer') {
    requireId(transaction.fromAccountId)
    requireId(transaction.toAccountId)
    if (transaction.fromAccountId === transaction.toAccountId) throw new RangeError('A transfer must use two different accounts.')
    if (transaction.accountId !== undefined || transaction.categoryId !== undefined) throw new RangeError('Transfers cannot have an accountId or categoryId.')
  } else {
    requireId(transaction.accountId)
    requireId(transaction.categoryId)
    if (transaction.fromAccountId !== undefined || transaction.toAccountId !== undefined) throw new RangeError('Categorized transactions cannot have transfer endpoints.')
  }
}

/** Build one frozen report from one filtered transaction set, without I/O or clocks. */
export function prepareFinancialReport(query: ReportQuery): PreparedReport {
  const grouping = query.grouping ?? 'none'
  if (!['none', 'type', 'category', 'month', 'account'].includes(grouping)) throw new RangeError('Invalid report grouping.')
  const filters = validateTransactionFilters(query.filters)
  const accounts = recordsById(query.accounts), categories = recordsById(query.categories)
  recordsById(query.transactions) // Repeated IDs must never silently double financial totals.
  for (const transaction of query.transactions) validateReportTransaction(transaction)
  for (const account of accounts.values()) {
    if (typeof account.name !== 'string' || !filterAccountTypes.includes(account.type)) throw new RangeError('Invalid report account.')
  }
  for (const category of categories.values()) {
    if (typeof category.name !== 'string' || !['expense', 'income'].includes(category.type)) throw new RangeError('Invalid report category.')
  }
  const accountSnapshots = new Map<string, ReportAccount>(), categorySnapshots = new Map<string, ReportCategory>()
  function account(id: string): ReportAccount {
    let snapshot = accountSnapshots.get(id)
    if (!snapshot) {
      const record = accounts.get(id)
      snapshot = Object.freeze({ id, name: record?.name ?? `Unavailable account (${id})`,
        type: record?.type ?? null, isUnknown: !record })
      accountSnapshots.set(id, snapshot)
    }
    return snapshot
  }
  function category(id: string): ReportCategory {
    let snapshot = categorySnapshots.get(id)
    if (!snapshot) {
      const record = categories.get(id)
      snapshot = Object.freeze({ id, name: record?.name ?? `Unavailable category (${id})`,
        type: record?.type ?? null, isUnknown: !record })
      categorySnapshots.set(id, snapshot)
    }
    return snapshot
  }
  const transactions = filterTransactions(query.transactions, query.accounts, query.categories, filters).sort(compareTransactions)
  const rows = Object.freeze(transactions.map((transaction): ReportRow => Object.freeze({
    id: transaction.id, date: transaction.date, type: transaction.type, amountCents: transaction.amount,
    category: transaction.type === 'transfer' ? null : category(transaction.categoryId),
    account: transaction.type === 'transfer' ? null : account(transaction.accountId),
    fromAccount: transaction.type === 'transfer' ? account(transaction.fromAccountId) : null,
    toAccount: transaction.type === 'transfer' ? account(transaction.toAccountId) : null,
    accountType: transaction.type === 'transfer' ? null : account(transaction.accountId).type,
    note: transaction.note ?? null,
    taxAmountCents: transaction.type === 'expense' ? transaction.taxAmountCents ?? null : null,
    expenseSubtotalCents: transaction.type === 'expense' ? expenseSubtotal(transaction) ?? null : null,
    receiptNumber: transaction.type === 'expense' ? transaction.receiptNumber ?? null : null,
  })))
  // This global summary is never formed by adding account-group summaries.
  const summary = calculateFinancialSummary(transactions)
  interface GroupBuilder {
    key: string
    label: string
    identity: GroupIdentity
    transactions: Transaction[]
    transferInCents: MoneyCents
    transferOutCents: MoneyCents
  }
  const builders = new Map<string, GroupBuilder>()
  function include(key: string, label: string, identity: GroupIdentity, transaction: Transaction) {
    let builder = builders.get(key)
    if (!builder) {
      builder = { key, label, identity, transactions: [], transferInCents: 0, transferOutCents: 0 }
      builders.set(key, builder)
    }
    builder.transactions.push(transaction)
    if (identity.kind === 'account' && transaction.type === 'transfer') {
      if (transaction.toAccountId === identity.account.id) builder.transferInCents = requireSafeCents(builder.transferInCents + transaction.amount)
      else builder.transferOutCents = requireSafeCents(builder.transferOutCents + transaction.amount)
    }
  }
  for (const transaction of transactions) {
    switch (grouping) {
      case 'none': break
      case 'type':
        include(`type:${transaction.type}`, transactionTypeLabels[transaction.type], { kind: 'type', transactionType: transaction.type }, transaction)
        break
      case 'month': {
        const month = transaction.date.slice(0, 7)
        include(`month:${month}`, month, { kind: 'month', month }, transaction)
        break
      }
      case 'category': {
        const value = transaction.type === 'transfer' ? null : category(transaction.categoryId)
        include(value ? `category:${value.id}` : 'transfers', value?.name ?? 'Transfers', { kind: 'category', category: value }, transaction)
        break
      }
      case 'account':
        for (const id of transaction.type === 'transfer' ? [transaction.fromAccountId, transaction.toAccountId] : [transaction.accountId]) {
          const value = account(id)
          include(`account:${id}`, value.name, { kind: 'account', account: value }, transaction)
        }
        break
    }
  }
  const compareKeys = (left: string, right: string) => left < right ? -1 : left > right ? 1 : 0
  const orderedGroups = [...builders.values()].sort((left, right) => {
    if (left.identity.kind === 'type' && right.identity.kind === 'type') {
      return filterTypes.indexOf(left.identity.transactionType) - filterTypes.indexOf(right.identity.transactionType)
    }
    if (grouping === 'month') return compareKeys(right.key, left.key)
    return compareKeys(left.key, right.key)
  })
  const groups = Object.freeze(orderedGroups.map((builder): ReportGroup => {
    const base = { key: builder.key, label: builder.label,
      transactionIds: Object.freeze(builder.transactions.map(transaction => transaction.id)),
      summary: calculateFinancialSummary(builder.transactions) }
    return builder.identity.kind === 'account'
      ? Object.freeze({ ...base, ...builder.identity, transferInCents: builder.transferInCents, transferOutCents: builder.transferOutCents })
      : Object.freeze({ ...base, ...builder.identity })
  }))
  return Object.freeze({ filters, grouping, sourceTransactionCount: query.transactions.length,
    matchedTransactionCount: transactions.length, rows, summary, groups })
}
