import type { Account, Category } from '../../domain/models.ts'
import type { PreparedReport, ReportGroup } from '../../domain/reporting.ts'
import { filterTypes, transactionTypeLabels } from '../../domain/transactionQuery.ts'
import { validateCurrencyCode } from '../../domain/financeSettings.ts'
import { dollarsForInput } from '../accounts/money.ts'
import { accountTypeLabels } from '../accounts/accountLabels.ts'
import { csvTextEncoding, protectCsvText, writeCsv } from '../dataBackup/csv.ts'
import { readableMonth } from '../transactions/transactionPresentation.ts'
import { localCalendarDate } from '../transactions/transactionHelpers.ts'
import { reportDateRange, visibleReportColumns, type ReportColumn } from './reportView.ts'
import { monetaryReportColumns, reportAccountGroupingExplanation, reportCashFlowExplanation, reportCellText, reportSummaryMetrics } from './reportPresentation.ts'

export const reportExportFormat = 'my-finance-report-v1'
export const largePrintRowCount = 2000
export const reportGroupingLabels = { none: 'None', month: 'Month', category: 'Category', account: 'Account', type: 'Transaction Type' } as const
export function reportGroupLabel(group: ReportGroup) { return group.kind === 'month' ? readableMonth(group.month) : group.label }

export interface ReportExport {
  readonly report: PreparedReport
  readonly columns: ReturnType<typeof visibleReportColumns>
  readonly currencyCode: string
  readonly generatedAt: string
  readonly dateRange: string
  readonly filters: readonly (readonly [string, string])[]
}

/** Capture applied criteria and small display metadata; retain the frozen report. */
export function createReportExport(report: PreparedReport, selected: readonly ReportColumn[], currencyCode: string,
  accounts: readonly Account[], categories: readonly Category[], now = new Date()): ReportExport {
  validateCurrencyCode(currencyCode)
  const filters = report.filters
  const range = reportDateRange(filters)
  const dateRange = filters.dateMode === 'all' || (!range.fromDate && !range.toDate) ? 'All time'
    : `${range.fromDate || 'No start limit'} through ${range.toDate || 'No end limit'} (inclusive)`
  const accountNames = new Map(accounts.map(item => [item.id, item.name]))
  const categoryNames = new Map(categories.map(item => [item.id, `${item.name} (${transactionTypeLabels[item.type]})`]))
  return { report, columns: visibleReportColumns(selected), currencyCode, generatedAt: now.toISOString(), dateRange,
    filters: [
      ['Transaction types', filters.types.length === filterTypes.length ? 'All types' : filters.types.map(type => transactionTypeLabels[type]).join(' OR ') || 'No types'],
      ['Accounts', filters.accountIds.map(id => accountNames.get(id) ?? `Unavailable account (${id})`).join(' OR ') || 'All accounts'],
      ['Account types', filters.accountTypes?.map(type => accountTypeLabels[type]).join(' OR ') || 'All account types'],
      ['Categories', filters.categoryIds.map(id => categoryNames.get(id) ?? `Unavailable category (${id})`).join(' OR ') || 'All categories'],
      ['Amount range', `${filters.minimum === null ? 'No minimum' : dollarsForInput(filters.minimum)} to ${filters.maximum === null ? 'No maximum' : dollarsForInput(filters.maximum)} ${currencyCode} (unsigned transaction amount)`],
      ['Search', filters.query.trim() || 'Any text'],
    ] }
}

/** Rectangular report data, deliberately separate from the restorable ledger CSV. */
export function reportRowsCsv(context: ReportExport): string {
  const { report, columns, currencyCode } = context
  return writeCsv([...columns.map(([key, label]) => monetaryReportColumns.includes(key) ? `${label} (${currencyCode})` : label),
    'currency_code', 'report_format', 'text_encoding'], report.rows.map(row => [
    ...columns.map(([key]) => {
      const value = reportCellText(row, key, currencyCode, true)
      return monetaryReportColumns.includes(key) ? value : protectCsvText(value)
    }), currencyCode, reportExportFormat, csvTextEncoding,
  ]))
}

/** Metadata and summary share a separate, uniform key/value table. */
export function reportSummaryCsv(context: ReportExport): string {
  const { report, currencyCode } = context
  const rows: string[][] = []
  function append(scope: string, key: string, group: string, field: string, value: string, numeric = false) {
    rows.push([protectCsvText(scope), protectCsvText(key), protectCsvText(group), protectCsvText(field),
      numeric ? value : protectCsvText(value), currencyCode, csvTextEncoding])
  }
  for (const [field, value] of [
    ['Format', reportExportFormat], ['Generated at (UTC)', context.generatedAt], ['Date range', context.dateRange],
    ['Grouping', reportGroupingLabels[report.grouping]], ['Columns', context.columns.map(([, label]) => label).join(', ')],
    ['Amount convention', 'Expenses are negative; Income and Refunds are positive; Transfers show positive volume.'],
    ['Net Cash Flow convention', reportCashFlowExplanation],
    ...(report.grouping === 'account' ? [['Account grouping', reportAccountGroupingExplanation]] : []),
    ...context.filters,
  ]) append('metadata', '', '', field, value)
  for (const [key, label] of reportSummaryMetrics) append('global', '', '', label,
    key === 'transactionCount' ? String(report.summary[key]) : dollarsForInput(report.summary[key]), true)
  for (const group of report.groups) {
    for (const [key, label] of reportSummaryMetrics) append('group', group.key, reportGroupLabel(group), label,
      key === 'transactionCount' ? String(group.summary[key]) : dollarsForInput(group.summary[key]), true)
    if (group.kind === 'account') {
      append('group', group.key, reportGroupLabel(group), 'Transfer In', dollarsForInput(group.transferInCents), true)
      append('group', group.key, reportGroupLabel(group), 'Transfer Out', dollarsForInput(group.transferOutCents), true)
    }
  }
  return writeCsv(['scope', 'group_key', 'group', 'field', 'value', 'currency_code', 'text_encoding'], rows)
}

export function reportExportFilename(kind: 'rows' | 'summary', now = new Date()) {
  return `my-finance-report-${kind}-${localCalendarDate(now)}.csv`
}

/** Same Blob-download lifecycle as Data & Backup; files never enter persistence. */
export function downloadReportCsv(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url; link.download = filename
  try { document.body.append(link); link.click() }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000) }
}
