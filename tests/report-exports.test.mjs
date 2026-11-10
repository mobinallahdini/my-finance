import assert from 'node:assert/strict'
import test from 'node:test'
import { prepareFinancialReport } from '../src/domain/reporting.ts'
import { createReportFilters } from '../src/domain/transactionQuery.ts'
import { parseCsv, unprotectCsvText, csvTextEncoding } from '../src/features/dataBackup/csv.ts'
import { parseTransactionCsv } from '../src/features/dataBackup/transactionCsv.ts'
import { createReportExport, reportExportFilename, reportRowsCsv, reportSummaryCsv } from '../src/features/reports/reportExport.ts'
import { reportCellText, reportSummaryMetrics } from '../src/features/reports/reportPresentation.ts'
import { reportColumns, defaultReportColumns } from '../src/features/reports/reportView.ts'
import { dollarsForInput } from '../src/features/accounts/money.ts'

const accounts = [{ id: 'bank', name: 'Main, "Bank"', type: 'bank', openingBalance: 0 },
  { id: 'card', name: '=CARD()', type: 'credit_card', openingBalance: 0 }]
const categories = [{ id: 'food', name: '@Food', type: 'expense' }, { id: 'salary', name: 'Salary', type: 'income' }]
const transactions = [
  { id: 'expense', type: 'expense', date: '2026-10-05', amount: 11500, accountId: 'card', categoryId: 'food', taxAmountCents: 1500,
    note: '=SUM(1,2)\r\n"Receipt", 雪', receiptNumber: '+RC-0042' },
  { id: 'refund', type: 'refund', date: '2026-10-04', amount: 25000, accountId: 'card', categoryId: 'food', note: '-Refund' },
  { id: 'income', type: 'income', date: '2026-10-03', amount: 100000, accountId: 'bank', categoryId: 'salary' },
  { id: 'transfer', type: 'transfer', date: '2026-10-02', amount: 2000, fromAccountId: 'bank', toAccountId: 'card' },
  { id: 'no-tax', type: 'expense', date: '2026-10-01', amount: 101, accountId: 'bank', categoryId: 'food' },
  { id: 'all-tax', type: 'expense', date: '2026-09-30', amount: 100, accountId: 'bank', categoryId: 'food', taxAmountCents: 100 },
]
const now = new Date('2026-11-10T17:15:30Z')
function context({ filters = createReportFilters(), grouping = 'none', rows = transactions, columns = reportColumns.map(([key]) => key), currency = 'EUR' } = {}) {
  const report = prepareFinancialReport({ accounts, categories, transactions: rows, filters, grouping })
  return createReportExport(report, columns, currency, accounts, categories, now)
}
function detail(value) {
  const [headers, ...rows] = parseCsv(reportRowsCsv(value))
  for (const row of rows) assert.equal(row.length, headers.length, 'CSV stays rectangular')
  return { headers, rows, objects: rows.map(row => Object.fromEntries(headers.map((header, index) => [header, row[index]]))) }
}
function summary(value) {
  const [headers, ...rows] = parseCsv(reportSummaryCsv(value))
  assert.ok(rows.every(row => row.length === headers.length))
  return rows.map(row => Object.fromEntries(headers.map((header, i) => [header, ['scope','group_key','group','field'].includes(header) ? unprotectCsvText(row[i]) : row[i]])))
}

test('CSV preserves complete deterministic engine ordering, all fields and rectangular metadata', () => {
  const value = context(), csv = detail(value)
  assert.deepEqual(csv.headers, [...reportColumns.map(([key, label]) => ['amountCents','taxAmountCents','expenseSubtotalCents'].includes(key) ? `${label} (EUR)` : label), 'currency_code','report_format','text_encoding'])
  assert.deepEqual(csv.objects.map(row => unprotectCsvText(row.Date)), value.report.rows.map(row => row.date))
  assert.ok(csv.objects.every(row => row.currency_code === 'EUR' && row.report_format === 'my-finance-report-v1' && row.text_encoding === csvTextEncoding))
  assert.equal(reportRowsCsv(value), reportRowsCsv(value))
})
test('Selected columns follow the current screen order regardless of toggle order', () => {
  const csv = detail(context({ columns: ['amountCents','note','date'] }))
  assert.deepEqual(csv.headers, ['Date','Note','Amount (EUR)','currency_code','report_format','text_encoding'])
  assert.deepEqual(detail(context({ columns: defaultReportColumns })).headers.slice(0,5), ['Date','Type','Category','Account','Amount (EUR)'])
})
test('Applied date/type/account endpoint predicates are reused, without another filter', () => {
  const value = context({ filters: createReportFilters({ dateMode: 'range', fromDate: '2026-10-02', toDate: '2026-10-05', types: ['transfer'], accountIds: ['bank'], accountTypes: ['bank'] }) })
  assert.equal(detail(value).rows.length, value.report.matchedTransactionCount)
  assert.equal(detail(value).rows.length, 1)
  assert.ok(value.dateRange.includes('2026-10-02 through 2026-10-05'))
})
test('Quoting, Unicode, receipt text and original CR/LF survive report CSV exactly', () => {
  const row = detail(context()).objects[0]
  assert.equal(unprotectCsvText(row.Note), transactions[0].note)
  assert.equal(unprotectCsvText(row['Receipt number']), '+RC-0042')
  assert.equal(unprotectCsvText(row.Account), '=CARD()')
})
for (const text of ['=HYPERLINK("evil")', '+cmd', '-2+3', '@SUM(A1)', '\t=1+1', '\r=1', "'literal", '  =1+1']) {
  test(`Spreadsheet formula protection covers every text field: ${JSON.stringify(text)}`, () => {
    const value = context({ rows: [{ ...transactions[0], note: text, receiptNumber: text.trim() }] })
    const row = detail(value).objects[0]
    assert.equal(row.Note, "'" + text)
    assert.equal(unprotectCsvText(row.Note), text)
    assert.ok(row.Category.startsWith("'"))
    assert.ok(row['Receipt number'].startsWith("'"))
  })
}
for (const cents of [1, 10, 101, 11500, Number.MAX_SAFE_INTEGER]) {
  test(`Integer cents serialize exactly at ${cents}`, () => {
    const row = { ...transactions[0], amount: cents }; delete row.taxAmountCents
    const csv = detail(context({ rows: [row] })).objects[0]
    assert.equal(csv['Amount (EUR)'], '-' + dollarsForInput(cents))
  })
}
test('Expense signs, Refunds and negative Net Expenses retain reporting semantics', () => {
  const value = context({ filters: createReportFilters({ types: ['refund'] }) }), csv = detail(value)
  assert.equal(csv.objects[0]['Amount (EUR)'], '250.00')
  const global = summary(value).filter(row => row.scope === 'global')
  assert.equal(global.find(row => row.field === 'Net Expenses').value, '-250.00')
  assert.equal(global.find(row => row.field === 'Net Cash Flow').value, '250.00')
  assert.equal(global.find(row => row.field === 'Total Income').value, '0.00')
})
test('Transfer endpoints are actual internal accounts, with volume once globally', () => {
  const value = context({ grouping: 'account' }), row = detail(value).objects[3]
  assert.equal(unprotectCsvText(row['From Account']), accounts[0].name)
  assert.equal(unprotectCsvText(row['To Account']), accounts[1].name)
  assert.equal(row['Amount (EUR)'], '20.00')
  assert.equal(summary(value).find(row => row.scope === 'global' && row.field === 'Transfer Volume').value, '20.00')
  assert.equal(summary(value).filter(row => row.scope === 'group' && ['Transfer In','Transfer Out'].includes(row.field)).length, 4)
})
test('Missing tax is blank, recorded tax is decimal, and zero subtotal remains zero', () => {
  const rows = detail(context()).objects
  assert.equal(rows[0]['Tax/VAT (EUR)'], '15.00')
  assert.equal(rows[4]['Tax/VAT (EUR)'], '')
  assert.equal(rows[5]['Expense subtotal (EUR)'], '0.00')
  assert.equal(rows[1]['Receipt number'], '')
  assert.equal(reportCellText({ ...context().report.rows[0], taxAmountCents: 0 }, 'taxAmountCents', 'EUR', true), '0.00')
})
for (const currency of ['CAD','USD','EUR','GBP']) {
  test(`Workspace currency ${currency} is explicit without decimal rounding`, () => {
    const value = context({ currency }), row = detail(value)
    assert.ok(row.headers.includes(`Amount (${currency})`))
    assert.equal(row.objects[0][`Amount (${currency})`], '-115.00')
    assert.ok(row.objects.every(row => row.currency_code === currency))
  })
}
test('Unsupported currency is rejected without relabeling report values', () => {
  assert.throws(() => context({ currency: 'JPY' }), /supported two-decimal currency/)
})
test('Zero-match data is header-only; summary still contains all seven engine totals', () => {
  const value = context({ filters: createReportFilters({ query: 'no such transaction' }) })
  assert.equal(detail(value).rows.length, 0)
  assert.equal(summary(value).filter(row => row.scope === 'global').length, 7)
  assert.ok(summary(value).filter(row => row.scope === 'global').every(row => Number(row.value) === 0))
})
for (const grouping of ['none','month','category','account','type']) {
  test(`Global and group summary CSV exactly matches PreparedReport: ${grouping}`, () => {
    const value = context({ grouping }), rows = summary(value)
    for (const [key, label] of reportSummaryMetrics) assert.equal(rows.find(row => row.scope === 'global' && row.field === label).value,
      key === 'transactionCount' ? String(value.report.summary[key]) : dollarsForInput(value.report.summary[key]))
    for (const group of value.report.groups) for (const [key, label] of reportSummaryMetrics) assert.equal(
      rows.find(row => row.scope === 'group' && row.group_key === group.key && row.field === label).value,
      key === 'transactionCount' ? String(group.summary[key]) : dollarsForInput(group.summary[key]))
  })
}
test('Summary metadata describes the applied filters, including all selected names and endpoints', () => {
  const filters = createReportFilters({ dateMode: 'range', fromDate: '2026-10-01', query: '=danger',
    accountIds: ['bank','card'], accountTypes: ['bank','credit_card'], categoryIds: ['food'], minimum: 1, maximum: 50000 })
  const metadata = summary(context({ filters })).filter(row => row.scope === 'metadata')
  const get = name => unprotectCsvText(metadata.find(row => row.field === name).value)
  assert.equal(get('Generated at (UTC)'), now.toISOString())
  assert.equal(get('Search'), '=danger')
  assert.equal(get('Accounts'), accounts.map(row => row.name).join(' OR '))
  assert.equal(get('Account types'), 'Bank OR Credit Card')
  assert.equal(get('Date range'), '2026-10-01 through No end limit (inclusive)')
  assert.ok(get('Amount range').includes('0.01 to 500.00 EUR'))
})
test('Report CSV cannot be mistaken for a restorable Transactions CSV', () => {
  assert.throws(() => parseTransactionCsv(reportRowsCsv(context()), 'EUR'), /Transactions CSV/)
  assert.throws(() => parseTransactionCsv(reportSummaryCsv(context()), 'EUR'), /Transactions CSV/)
})
test('10,000 rows export completely without mutating or re-preparing the frozen result', () => {
  const rows = Array.from({ length: 10000 }, (_, i) => ({ ...transactions[2], id: `large-${i}`, amount: 1 }))
  const value = context({ rows, columns: defaultReportColumns }), reference = value.report
  assert.equal(detail(value).rows.length, 10000)
  assert.strictEqual(value.report, reference)
  assert.ok(Object.isFrozen(value.report) && Object.isFrozen(value.report.rows))
  assert.equal(value.report.summary.totalIncomeCents, 10000)
})
test('Export filenames use the local calendar, with separate report identities', () => {
  const local = new Date(2026, 10, 10, 23, 30)
  assert.equal(reportExportFilename('rows', local), 'my-finance-report-rows-2026-11-10.csv')
  assert.equal(reportExportFilename('summary', local), 'my-finance-report-summary-2026-11-10.csv')
})
