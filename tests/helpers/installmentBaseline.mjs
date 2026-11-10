import { readFile } from 'node:fs/promises'

export const historical = JSON.parse(await readFile(new URL('../fixtures/v12-installments.json', import.meta.url), 'utf8'))
export const businessStores = ['accounts', 'categories', 'transactions', 'obligations', 'obligationPayments', 'applicationSettings']
export function canonicalRecords(data) {
  return Object.fromEntries(businessStores.map(name => [name, (name === 'applicationSettings'
    ? (Array.isArray(data[name]) ? data[name] : data[name] ? [data[name]] : []) : data[name] ?? [])
    .map(record => Object.fromEntries(Object.entries(structuredClone(record)).sort(([left],[right]) => left < right ? -1 : left > right ? 1 : 0)))
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)]))
}
/** Only projects production calculations. Expected numbers live independently in JSON. */
export function deriveHistoricalBaseline(data, financial, obligations) {
  const { accounts, transactions, obligationPayments: payments } = data
  const monthlyFinancial = Object.fromEntries(Object.keys(historical.expected.monthlyFinancial).map(month => [month, {
    expensesCents: financial.calculateMonthlyTotalExpenses(transactions, month),
    incomeCents: financial.calculateMonthlyTotalIncome(transactions, month),
  }]))
  const obligationMonths = Object.fromEntries(Object.keys(historical.expected.obligationMonths).map(month => {
    const summary = obligations.calculateObligationMonthSummary(data.obligations, payments, month, historical.today)
    return [month, { expectedTotalDueCents: summary.expectedTotalDueCents, totalPaidCents: summary.totalPaidCents,
      paidDuringMonthCents: summary.paidDuringMonthCents, remainingTotalDueCents: summary.remainingTotalDueCents,
      overdueIds: summary.overdueObligations.map(state => state.obligationId).sort() }]
  }))
  return {
    recordCounts: Object.fromEntries(Object.entries(canonicalRecords(data)).map(([name, rows]) => [name, rows.length])),
    transactionCounts: Object.fromEntries(['expense','income','transfer','refund'].map(type => [type, transactions.filter(row => row.type === type).length])),
    openingBalancesCents: Object.fromEntries(accounts.map(account => [account.id, account.openingBalance])),
    accountBalancesCents: Object.fromEntries(accounts.map(account => [account.id, financial.calculateAccountBalance(account, transactions)])),
    availableCreditCents: Object.fromEntries(accounts.filter(account => account.type === 'credit_card').map(account => [account.id, financial.calculateAvailableCredit(account, transactions) ?? null])),
    monthlyFinancial,
    installments: Object.fromEntries(data.obligations.filter(row => row.type === 'installment').map(row => [row.id, obligations.calculateInstallmentBalance(row, payments)])),
    obligationMonths,
    octoberStates: Object.fromEntries(data.obligations.map(row => {
      const state = obligations.calculateObligationMonth(row, payments, '2026-10', historical.today)
      return [row.id, Object.fromEntries(['expectedAmountCents','paidAmountCents','remainingDueCents','status','isOverdue'].map(key => [key, state[key]]))]
    })),
    nextDueDates: Object.fromEntries(data.obligations.map(row => [row.id, obligations.calculateNextObligationDueDate(row, payments, historical.today) ?? null])),
  }
}
export function expectedHistoricalBaseline() {
  const { preRefundLegacyBalancesCents: _legacy, ...expected } = historical.expected
  return expected
}
/** Synthetic compatibility projections, not a claim that a past binary exported newer types. */
export function historicalBackup(version, storedV2Settings = false) {
  const data = structuredClone(historical.workspace)
  if (version < 3) data.transactions = data.transactions.filter(row => row.type !== 'refund')
  if (version === 1) {
    for (const row of data.transactions) { delete row.taxAmountCents; delete row.receiptNumber }
    delete data.obligations; delete data.obligationPayments
  }
  if (version < 3 && !storedV2Settings) delete data.applicationSettings
  const sections = ['accounts','categories','transactions', ...(version > 1 ? ['obligations','obligationPayments'] : []),
    ...(version === 3 || storedV2Settings ? ['applicationSettings'] : []), 'preferences']
  return { format: 'my-finance-backup', schemaVersion: version, kind: 'full',
    exportedAt: '2026-10-20T16:00:00.000Z', currency: version === 1 ? 'CAD' : 'GBP',
    sections, data, preferences: { theme: historical.theme } }
}
