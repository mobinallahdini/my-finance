import { daysInCalendarMonth } from '../../domain/calendar.ts'
import { createReportFilters, type TransactionFilterState } from '../../domain/transactionQuery.ts'
import type { ReportGrouping } from '../../domain/reporting'
import type { ValidatedTransactionFilters } from '../../domain/transactionQuery'

export const reportColumns = [
  ['date', 'Date'], ['type', 'Type'], ['category', 'Category'], ['account', 'Account'],
  ['accountType', 'Account type'], ['fromAccount', 'From Account'], ['toAccount', 'To Account'],
  ['note', 'Note'], ['taxAmountCents', 'Tax/VAT'], ['expenseSubtotalCents', 'Expense subtotal'],
  ['receiptNumber', 'Receipt number'], ['amountCents', 'Amount'],
] as const
export type ReportColumn = typeof reportColumns[number][0]
export const defaultReportColumns: readonly ReportColumn[] = ['date', 'type', 'category', 'account', 'amountCents']
export const reportPageSize = 25
/** The screen defines the ordering; every output uses this same selection. */
export function visibleReportColumns(selected: readonly ReportColumn[]) {
  return reportColumns.filter(([key]) => selected.includes(key))
}
export type ReportPeriod = 'month' | 'year' | 'all' | 'custom'
export interface ReportView {
  readonly filters: ValidatedTransactionFilters
  readonly columns: readonly ReportColumn[]
  readonly grouping: ReportGrouping
  readonly groupKey: string | null
}

/** Presentation presets use local calendar strings; the domain validates them. */
export function reportPeriodFilters(filters: TransactionFilterState, period: Exclude<ReportPeriod, 'custom'>, today: string) {
  const year = today.slice(0, 4)
  return createReportFilters({ ...filters, month: today.slice(0, 7), fromDate: '', toDate: '',
    ...(period === 'month' ? { dateMode: 'month' } : period === 'year'
      ? { dateMode: 'range', fromDate: `${year}-01-01`, toDate: `${year}-12-31` } : { dateMode: 'all' }) })
}
export function reportPeriod(filters: TransactionFilterState, today: string): ReportPeriod {
  if (filters.dateMode === 'all') return 'all'
  if (filters.dateMode === 'month' && filters.month === today.slice(0, 7)) return 'month'
  if (filters.dateMode === 'range' && filters.fromDate === `${today.slice(0, 4)}-01-01`
    && filters.toDate === `${today.slice(0, 4)}-12-31`) return 'year'
  return 'custom'
}
export function reportDateRange(filters: TransactionFilterState) {
  return filters.dateMode === 'month'
    ? { fromDate: `${filters.month}-01`, toDate: `${filters.month}-${daysInCalendarMonth(filters.month)}` }
    : { fromDate: filters.fromDate, toDate: filters.toDate }
}
