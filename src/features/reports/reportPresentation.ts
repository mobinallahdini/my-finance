import type { ReportRow } from '../../domain/reporting.ts'
import { transactionTypeLabels } from '../../domain/transactionQuery.ts'
import { accountTypeLabels } from '../accounts/accountLabels.ts'
import { dollarsForInput, formatMoney } from '../accounts/money.ts'
import { signedTransactionAmount } from '../transactions/transactionPresentation.ts'
import type { ReportColumn } from './reportView.ts'

export const reportSummaryMetrics = [
  ['totalIncomeCents', 'Total Income'], ['grossExpensesCents', 'Gross Expenses'], ['refundsCents', 'Refunds'],
  ['netExpensesCents', 'Net Expenses'], ['netCashFlowCents', 'Net Cash Flow'],
  ['transferVolumeCents', 'Transfer Volume'], ['transactionCount', 'Matching transactions'],
] as const
export const reportCashFlowExplanation = 'Net Cash Flow is Income minus Net Expenses. It includes card purchases and excludes Transfers, so it may differ from your bank balance change.'
export const reportAccountGroupingExplanation = 'Transfers appear under both accounts. Group counts and Transfer volumes are not additive; the summary above counts each transaction once.'
export const monetaryReportColumns: readonly ReportColumn[] = ['amountCents', 'taxAmountCents', 'expenseSubtotalCents']

/** Presentation only: normalized engine values, with no filtering or totals. */
export function reportCellText(row: ReportRow, column: ReportColumn, currencyCode: string, decimal = false): string {
  const missing = decimal ? '' : '—'
  const money = (value: number) => decimal ? dollarsForInput(value) : formatMoney(value, currencyCode)
  switch (column) {
    case 'date': return row.date
    case 'type': return transactionTypeLabels[row.type]
    case 'amountCents': return decimal
      ? `${row.type === 'expense' ? '-' : ''}${dollarsForInput(row.amountCents)}`
      : signedTransactionAmount({ type: row.type, amount: row.amountCents }, currencyCode)
    case 'category': return row.category?.name ?? missing
    case 'account': return row.account?.name ?? (row.fromAccount && row.toAccount ? `From ${row.fromAccount.name} → To ${row.toAccount.name}` : missing)
    case 'accountType': return row.accountType ? accountTypeLabels[row.accountType] : missing
    case 'fromAccount': return row.fromAccount?.name ?? missing
    case 'toAccount': return row.toAccount?.name ?? missing
    case 'note': return row.note ?? missing
    case 'taxAmountCents': return row.taxAmountCents === null ? missing : money(row.taxAmountCents)
    case 'expenseSubtotalCents': return row.expenseSubtotalCents === null ? missing : money(row.expenseSubtotalCents)
    case 'receiptNumber': return row.receiptNumber ?? missing
  }
}
