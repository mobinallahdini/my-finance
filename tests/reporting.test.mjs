import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateFinancialSummary, calculateNetCashFlow } from '../src/domain/financialSummary.ts'
import { createReportFilters, filterTransactions, validateTransactionFilters } from '../src/domain/transactionQuery.ts'
import { prepareFinancialReport } from '../src/domain/reporting.ts'
import { calculateAccountBalance, calculateAvailableCredit, calculateMonthlyExpensesByCategory,
  calculateMonthlyTotalExpenses, calculateMonthlyTotalIncome } from '../src/domain/calculations.ts'
import { filterTransactions as historyFilter, emptyTransactionFilters, filterDraft, validateFilterDraft } from '../src/features/transactions/transactionFiltering.ts'

const accounts = [
  { id: 'bank', name: 'Main Bank', type: 'bank', openingBalance: 100000 },
  { id: 'card', name: 'Visa', type: 'credit_card', openingBalance: 0, creditLimit: 50000 },
  { id: 'cash', name: 'Pocket Cash', type: 'cash', openingBalance: 20000 },
]
const categories = [
  { id: 'food', name: 'Groceries', type: 'expense' },
  { id: 'rent', name: 'Rent', type: 'expense' },
  { id: 'salary', name: 'Salary', type: 'income' },
]
const expense = (extra = {}) => ({ id: 'food-expense', type: 'expense', amount: 10000, date: '2026-10-01',
  accountId: 'bank', categoryId: 'food', note: 'Weekly shopping', ...extra })
const refund = (extra = {}) => ({ id: 'refund', type: 'refund', amount: 2500, date: '2026-10-05',
  accountId: 'card', categoryId: 'food', note: 'Returned item', ...extra })
const income = (extra = {}) => ({ id: 'income', type: 'income', amount: 20000, date: '2026-10-05',
  accountId: 'bank', categoryId: 'salary', ...extra })
const transfer = (extra = {}) => ({ id: 'bank-card', type: 'transfer', amount: 5000, date: '2026-10-05',
  fromAccountId: 'bank', toAccountId: 'card', ...extra })
const standard = [expense(), refund(), income(), transfer()]
const history = [...standard,
  expense({ id: 'cash-expense', accountId: 'cash', date: '2026-09-30', amount: 500 }),
  transfer({ id: 'card-bank', fromAccountId: 'card', toAccountId: 'bank', date: '2026-10-06', amount: 1000 }),
  expense({ id: 'rent-expense', categoryId: 'rent', amount: 2000, date: '2026-10-03' }),
]
const emptySummary = { grossExpensesCents: 0, refundsCents: 0, netExpensesCents: 0, totalIncomeCents: 0,
  netCashFlowCents: 0, transferVolumeCents: 0, transactionCount: 0, expenseCount: 0, refundCount: 0, incomeCount: 0, transferCount: 0 }
const standardSummary = { grossExpensesCents: 10000, refundsCents: 2500, netExpensesCents: 7500, totalIncomeCents: 20000,
  netCashFlowCents: 12500, transferVolumeCents: 5000, transactionCount: 4, expenseCount: 1, refundCount: 1, incomeCount: 1, transferCount: 1 }
function report(transactions = standard, changes = {}) {
  return prepareFinancialReport({ accounts, categories, transactions, filters: createReportFilters(), ...changes })
}
function filtered(filters, transactions = history) {
  return filterTransactions(transactions, accounts, categories, createReportFilters(filters)).map(record => record.id)
}
function freezeDeep(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep)
    Object.freeze(value)
  }
  return value
}

test('Standard report: 100 Expense, 25 Refund, 200 Income, 50 Transfer have distinct metrics and counts', () => {
  assert.deepEqual(report().summary, standardSummary)
  assert.deepEqual(calculateFinancialSummary(standard), standardSummary)
})
test('Refund-only report has negative net Expenses, positive cash flow, and no Income', () => {
  const value = report(standard, { filters: createReportFilters({ types: ['refund'] }) })
  assert.deepEqual(value.summary, { ...emptySummary, refundsCents: 2500, netExpensesCents: -2500,
    netCashFlowCents: 2500, transactionCount: 1, refundCount: 1 })
  assert.equal(value.sourceTransactionCount, 4)
  assert.equal(value.matchedTransactionCount, 1)
})
test('Transfer-only report has volume once and no Income, Expenses, or Refunds', () => {
  assert.deepEqual(report(standard, { filters: createReportFilters({ types: ['transfer'] }) }).summary,
    { ...emptySummary, transferVolumeCents: 5000, transferCount: 1, transactionCount: 1 })
})
test('Credit-card purchases/refunds retain bank, debt and available-credit semantics', () => {
  const transactions = [expense({ accountId: 'card' }), refund(), transfer()]
  const value = report(transactions)
  assert.equal(value.summary.netExpensesCents, 7500)
  assert.equal(value.summary.netCashFlowCents, -7500)
  assert.equal(calculateAccountBalance(accounts[0], transactions), 95000)
  assert.equal(calculateAccountBalance(accounts[1], transactions), 2500)
  assert.equal(calculateAvailableCredit(accounts[1], transactions), 47500)
  assert.notEqual(value.summary.netCashFlowCents, -5000, 'Reporting cash flow is not bank balance movement')
})
test('Cross-month Refund leaves original purchase month intact', () => {
  const transactions = [expense({ date: '2026-09-30' }), refund()]
  const value = report(transactions, { grouping: 'month' })
  assert.deepEqual(value.groups.map(group => [group.month, group.summary.netExpensesCents, group.summary.netCashFlowCents]),
    [['2026-10', -2500, 2500], ['2026-09', 10000, -10000]])
})
test('Included tax is counted once; subtotal is derived and absent tax stays null', () => {
  const value = report([expense({ taxAmountCents: 1500, receiptNumber: 'RC-0001' }), expense({ id: 'untaxed' }), refund()])
  assert.equal(value.summary.grossExpensesCents, 20000)
  assert.equal(value.summary.netExpensesCents, 17500)
  assert.equal(value.rows.find(row => row.id === 'food-expense').expenseSubtotalCents, 8500)
  assert.equal(value.rows.find(row => row.id === 'food-expense').taxAmountCents, 1500)
  for (const id of ['untaxed', 'refund']) {
    const row = value.rows.find(row => row.id === id)
    assert.equal(row.taxAmountCents, null)
    assert.equal(row.expenseSubtotalCents, null)
    assert.equal(row.receiptNumber, null)
  }
  assert.equal(report([expense({ taxAmountCents: 10000 })]).rows[0].expenseSubtotalCents, 0)
})
test('Normalized rows retain source IDs, real internal endpoints and not-applicable nulls', () => {
  const value = report()
  const moved = value.rows.find(row => row.type === 'transfer')
  assert.equal(moved.id, 'bank-card')
  assert.equal(moved.account, null)
  assert.equal(moved.accountType, null)
  assert.equal(moved.category, null)
  assert.equal(moved.fromAccount.id, 'bank')
  assert.equal(moved.fromAccount.type, 'bank')
  assert.equal(moved.toAccount.id, 'card')
  assert.equal(moved.toAccount.type, 'credit_card')
  const spent = value.rows.find(row => row.type === 'expense')
  assert.equal(spent.accountType, 'bank')
  assert.equal(spent.account.name, 'Main Bank')
  assert.equal(spent.category.id, 'food')
  assert.equal(spent.fromAccount, null)
  assert.equal(spent.toAccount, null)
  assert.equal(moved.note, null)
  assert.ok(!Object.hasOwn(spent, 'merchant') && !Object.hasOwn(spent, 'counterparty'))
})

for (const [name, filters, expected] of [
  ['inclusive date boundaries', { dateMode: 'range', fromDate: '2026-10-01', toDate: '2026-10-05' }, ['food-expense', 'refund', 'income', 'bank-card', 'rent-expense']],
  ['single inclusive date', { dateMode: 'range', fromDate: '2026-10-05', toDate: '2026-10-05' }, ['refund', 'income', 'bank-card']],
  ['open start', { dateMode: 'range', toDate: '2026-09-30' }, ['cash-expense']],
  ['open end', { dateMode: 'range', fromDate: '2026-10-06' }, ['card-bank']],
  ['both date bounds open', { dateMode: 'range' }, history.map(record => record.id)],
  ['calendar month', { dateMode: 'month', month: '2026-09' }, ['cash-expense']],
  ['bank account in both Transfer directions', { accountIds: ['bank'] }, ['food-expense', 'income', 'bank-card', 'card-bank', 'rent-expense']],
  ['card account in both Transfer directions', { accountIds: ['card'] }, ['refund', 'bank-card', 'card-bank']],
  ['cash account type', { accountTypes: ['cash'] }, ['cash-expense']],
  ['card account type in both directions', { accountTypes: ['credit_card'] }, ['refund', 'bank-card', 'card-bank']],
  ['account-type OR', { accountTypes: ['bank', 'cash'] }, ['food-expense', 'income', 'bank-card', 'cash-expense', 'card-bank', 'rent-expense']],
  ['Bank A plus Credit Card type never crosses endpoints', { accountIds: ['bank'], accountTypes: ['credit_card'] }, []],
  ['Card B plus Bank type never crosses endpoints', { accountIds: ['card'], accountTypes: ['bank'] }, []],
  ['matching source/receiver bank endpoint', { accountIds: ['bank'], accountTypes: ['bank'], types: ['transfer'] }, ['bank-card', 'card-bank']],
  ['matching receiver/source card endpoint', { accountIds: ['card'], accountTypes: ['credit_card'], types: ['transfer'] }, ['bank-card', 'card-bank']],
  ['zero eligible accounts stays empty', { accountIds: ['cash'], accountTypes: ['bank'] }, []],
  ['unknown selected account stays empty', { accountIds: ['missing'] }, []],
  ['no account restrictions', { accountIds: [], accountTypes: [] }, history.map(record => record.id)],
  ['category excludes Transfers', { categoryIds: ['food'] }, ['food-expense', 'refund', 'cash-expense']],
  ['category OR', { categoryIds: ['food', 'rent'] }, ['food-expense', 'refund', 'cash-expense', 'rent-expense']],
  ['empty categories are unrestricted', { categoryIds: [] }, history.map(record => record.id)],
  ['type selection', { types: ['refund', 'income'] }, ['refund', 'income']],
  ['no selected types', { types: [] }, []],
  ['stored positive amount with inclusive bounds', { minimum: 2500, maximum: 5000 }, ['refund', 'bank-card']],
  ['zero amount bound', { minimum: 0, maximum: 0 }, []],
  ['case-insensitive type search', { query: '  ReFuNd  ' }, ['refund']],
  ['category-name search', { query: 'GROCERIES' }, ['food-expense', 'refund', 'cash-expense']],
  ['account-name search includes both endpoints', { query: 'vIsA' }, ['refund', 'bank-card', 'card-bank']],
  ['note search', { query: 'turned it' }, ['refund']],
  ['AND across groups and OR within selections', { dateMode: 'range', fromDate: '2026-10-01', toDate: '2026-10-05',
    types: ['expense', 'refund'], accountIds: ['bank', 'card'], accountTypes: ['bank', 'credit_card'],
    categoryIds: ['food', 'rent'], minimum: 2500, maximum: 10000, query: 'groceries' }, ['food-expense', 'refund']],
]) test(`Shared filter: ${name}`, () => {
  assert.deepEqual(filtered(filters), expected)
  const value = report(history, { filters: createReportFilters(filters), grouping: 'type' })
  assert.deepEqual(value.rows.map(row => row.id).sort(), [...expected].sort())
  assert.equal(value.summary.transactionCount, expected.length)
  assert.equal(value.groups.reduce((count, group) => count + group.summary.transactionCount, 0), expected.length)
  assert.deepEqual(value.summary, calculateFinancialSummary(history.filter(record => expected.includes(record.id))))
})
test('Receipt search preserves punctuation, leading zeroes, Unicode and case-insensitive matching', () => {
  const transactions = [expense({ receiptNumber: 'Rc-0042 / 雪' }), refund()]
  assert.deepEqual(filtered({ query: 'rc-0042 / 雪' }, transactions), ['food-expense'])
  assert.deepEqual(filtered({ query: '0042' }, transactions), ['food-expense'])
})
test('History uses the exact shared filter function and keeps its input order/record identities', () => {
  assert.equal(historyFilter, filterTransactions)
  const filters = { ...emptyTransactionFilters(), types: ['expense', 'refund'] }
  const result = historyFilter(history, accounts, categories, filters)
  assert.deepEqual(result.map(record => record.id), ['food-expense', 'refund', 'cash-expense', 'rent-expense'])
  assert.equal(result[0], history[0])
})
test('UI draft validation and report validation agree on calendar boundaries and inactive dates', () => {
  const base = { ...emptyTransactionFilters(), dateMode: 'range', fromDate: '2028-02-29', toDate: '2028-02-29' }
  assert.ok(validateFilterDraft(filterDraft(base)).value)
  assert.ok(createReportFilters(base))
  assert.ok(!validateFilterDraft(filterDraft({ ...base, fromDate: '2026-02-29' })).value)
  assert.throws(() => createReportFilters({ ...base, fromDate: '2026-02-29' }), RangeError)
  assert.equal(filtered({ dateMode: 'all', month: 'bad', fromDate: 'bad', toDate: 'bad' }).length, history.length)
})
for (const date of ['2028-02-29', '2000-02-29', '0001-01-01', '9999-12-31']) test(`Calendar date ${date} is inclusive and timezone-independent`, () => {
  const original = process.env.TZ
  try {
    for (const zone of ['America/Toronto', 'Pacific/Kiritimati', 'Pacific/Honolulu']) {
      process.env.TZ = zone
      assert.equal(report([expense({ date })], { filters: createReportFilters({ dateMode: 'range', fromDate: date, toDate: date }) }).rows[0].date, date)
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original }
})
for (const [name, fields] of [
  ['reversed dates', { dateMode: 'range', fromDate: '2026-10-05', toDate: '2026-10-01' }],
  ...['2026-02-29', '1900-02-29', '2026-04-31', '0000-01-01', '2026-1-01', '2026-10-05T00:00:00Z'].map(date => ['invalid date ' + date, { dateMode: 'range', fromDate: date }]),
  ['invalid month', { dateMode: 'month', month: '2026-13' }],
  ['negative amount bound', { minimum: -1 }], ['fractional amount bound', { maximum: 0.5 }],
  ['unsafe amount bound', { minimum: Number.MAX_SAFE_INTEGER + 1 }], ['reversed amounts', { minimum: 2, maximum: 1 }],
  ['unknown type', { types: ['purchase'] }], ['unknown account type', { accountTypes: ['loan'] }],
  ['blank account ID', { accountIds: [' '] }], ['blank category ID', { categoryIds: [''] }],
  ['invalid selection', { types: null }], ['sparse selection', { types: new Array(1) }],
]) test(`Filter validation rejects ${name}`, () => assert.throws(() => createReportFilters(fields), RangeError))
test('prepareFinancialReport defensively validates even a forged validated filter', () => {
  assert.throws(() => report(standard, { filters: { ...createReportFilters(), minimum: 100, maximum: 1 } }), RangeError)
  assert.throws(() => validateTransactionFilters(null), RangeError)
})

test('Type groups have deterministic established type order and exact filtered memberships', () => {
  const value = report(standard, { grouping: 'type' })
  assert.deepEqual(value.groups.map(group => group.key), ['type:expense', 'type:income', 'type:transfer', 'type:refund'])
  assert.deepEqual(value.groups.flatMap(group => group.transactionIds).sort(), standard.map(record => record.id).sort())
})
test('Category groups preserve negative nets and use a non-category Transfers bucket', () => {
  const value = report([expense({ amount: 1000 }), refund(), income(), transfer()], { grouping: 'category' })
  const food = value.groups.find(group => group.key === 'category:food')
  assert.equal(food.summary.netExpensesCents, -1500)
  assert.equal(food.category.id, 'food')
  const moved = value.groups.find(group => group.key === 'transfers')
  assert.equal(moved.category, null)
  assert.equal(moved.summary.transferVolumeCents, 5000)
  assert.deepEqual(moved.transactionIds, ['bank-card'])
  const collision = report([expense({ categoryId: 'transfers' }), transfer()], {
    categories: [...categories, { id: 'transfers', name: 'Transfers', type: 'expense' }], grouping: 'category' })
  assert.equal(new Set(collision.groups.map(group => group.key)).size, 2)
})
test('Account groups reference Transfers twice as memberships but global rows/volume only once', () => {
  const transactions = [...standard, history[5]]
  const value = report(transactions, { grouping: 'account' })
  assert.equal(value.rows.length, 5)
  assert.equal(new Set(value.rows.map(row => row.id)).size, 5)
  assert.equal(value.summary.transferVolumeCents, 6000)
  assert.equal(value.summary.transferCount, 2)
  const bank = value.groups.find(group => group.account.id === 'bank')
  const card = value.groups.find(group => group.account.id === 'card')
  assert.equal(bank.transferInCents, 1000)
  assert.equal(bank.transferOutCents, 5000)
  assert.equal(card.transferInCents, 5000)
  assert.equal(card.transferOutCents, 1000)
  for (const group of value.groups) {
    assert.equal(group.summary.transferVolumeCents, 6000, 'Member summaries are deliberately non-additive across accounts')
    assert.equal(new Set(group.transactionIds).size, group.transactionIds.length)
  }
  const selectedBank = report(transactions, { filters: createReportFilters({ accountIds: ['bank'] }), grouping: 'account' })
  assert.equal(selectedBank.summary.refundsCents, 0)
  assert.deepEqual(selectedBank.groups.find(group => group.account.id === 'card').transactionIds, ['card-bank', 'bank-card'])
})
for (const grouping of ['category', 'account']) test(`${grouping} rename changes labels, not stable IDs, ordering, or totals`, () => {
  const first = report(standard, { grouping })
  const renamed = report(standard, { grouping,
    accounts: accounts.map(account => ({ ...account, name: 'Same renamed name' })),
    categories: categories.map(category => ({ ...category, name: 'Same renamed name' })) })
  assert.deepEqual(renamed.groups.map(group => [group.key, group.transactionIds, group.summary]),
    first.groups.map(group => [group.key, group.transactionIds, group.summary]))
  assert.ok(renamed.groups.filter(group => group.key !== 'transfers').every(group => group.label === 'Same renamed name'))
})
test('Missing references remain identifiable without invented account types or counterparties', () => {
  const value = report([expense({ accountId: 'gone', categoryId: 'gone' }), transfer({ toAccountId: 'gone' })], { grouping: 'category' })
  const spent = value.rows.find(row => row.type === 'expense')
  assert.deepEqual(spent.account, { id: 'gone', name: 'Unavailable account (gone)', type: null, isUnknown: true })
  assert.equal(spent.category.id, 'gone')
  assert.equal(spent.category.isUnknown, true)
  assert.equal(spent.accountType, null)
  assert.equal(value.rows.find(row => row.type === 'transfer').toAccount.id, 'gone')
  assert.equal(report([expense({ accountId: 'gone' })], { filters: createReportFilters({ accountTypes: ['bank'] }) }).rows.length, 0)
  assert.equal(report([expense({ accountId: 'gone' })], { filters: createReportFilters({ accountIds: ['gone'] }) }).rows.length, 1)
})
for (const grouping of ['none', 'type', 'month', 'category', 'account']) test(`Deterministic ${grouping} report ignores source-array ordering`, () => {
  const first = report(history, { grouping })
  const reversed = report([...history].reverse(), { grouping, accounts: [...accounts].reverse(), categories: [...categories].reverse() })
  assert.deepEqual(first, reversed)
  assert.deepEqual(first.rows.map(row => row.id), ['card-bank', 'bank-card', 'income', 'refund', 'rent-expense', 'food-expense', 'cash-expense'])
})
for (const grouping of ['none', 'type', 'month', 'category', 'account']) test(`Empty ${grouping} report has complete zero totals and no groups`, () => {
  const value = report([], { accounts: [], categories: [], grouping })
  assert.deepEqual(value.summary, emptySummary)
  assert.deepEqual(value.rows, [])
  assert.deepEqual(value.groups, [])
})
for (const [type, make] of [['expense', expense], ['refund', refund], ['income', income], ['transfer', transfer]]) {
  test(`Overflow in ${type} accumulation is rejected`, () => {
    assert.throws(() => report([make({ amount: Number.MAX_SAFE_INTEGER }), make({ id: 'overflow', amount: 1 })]), RangeError)
  })
}
test('Net cash flow overflow is rejected in shared summary and Home helper', () => {
  assert.throws(() => report([income({ amount: Number.MAX_SAFE_INTEGER }), refund({ amount: 1 })]), RangeError)
  assert.throws(() => calculateNetCashFlow(Number.MAX_SAFE_INTEGER, -1), RangeError)
})
for (const amount of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) test(`Report rejects invalid cents ${amount}`, () => {
  assert.throws(() => report([expense({ amount })]), RangeError)
})
test('Report rejects invalid source dates, duplicate IDs and transfer endpoints without repairing records', () => {
  assert.throws(() => report([expense({ date: '2026-02-30' })]), RangeError)
  assert.throws(() => report([expense(), expense()]), /Duplicate/)
  assert.throws(() => report(standard, { accounts: [...accounts, accounts[0]] }), /Duplicate/)
  assert.throws(() => report(standard, { categories: [...categories, categories[0]] }), /Duplicate/)
  assert.throws(() => report([transfer({ toAccountId: 'bank' })]), /different accounts/)
  assert.throws(() => report([expense({ id: '' })]), /IDs/)
  assert.throws(() => report(standard, { grouping: 'merchant' }), /grouping/)
})
test('Report snapshots are deeply frozen, JSON-compatible, and detached from every input', () => {
  const source = structuredClone({ accounts, categories, transactions: standard })
  const filterInput = { ...emptyTransactionFilters(), accountIds: ['bank'], types: ['expense', 'transfer'] }
  const before = structuredClone(source), filtersBefore = structuredClone(filterInput)
  const filters = validateTransactionFilters(filterInput)
  const value = prepareFinancialReport({ ...source, filters, grouping: 'account' })
  assert.deepEqual(source, before)
  assert.deepEqual(filterInput, filtersBefore)
  assert.equal(Object.isFrozen(source.accounts[0]), false, 'Do not freeze caller-owned data')
  assert.throws(() => value.rows.push(value.rows[0]), TypeError)
  assert.throws(() => { value.rows[0].fromAccount.name = 'Changed' }, TypeError)
  assert.throws(() => value.groups[0].transactionIds.push('duplicate'), TypeError)
  assert.throws(() => { value.groups[0].summary.netExpensesCents = 0 }, TypeError)
  assert.throws(() => value.filters.accountIds.push('card'), TypeError)
  assert.throws(() => { value.grouping = 'none' }, TypeError)
  source.accounts[0].name = 'Changed after report'
  source.transactions[0].amount = 1
  filterInput.accountIds.push('card')
  assert.equal(value.rows.find(row => row.type === 'expense').account.name, 'Main Bank')
  assert.equal(value.summary.grossExpensesCents, 10000)
  assert.deepEqual(value.filters.accountIds, ['bank'])
  assert.deepEqual(JSON.parse(JSON.stringify(value)), value)
  assert.doesNotThrow(() => report(freezeDeep(structuredClone(standard)), {
    accounts: freezeDeep(structuredClone(accounts)), categories: freezeDeep(structuredClone(categories)) }))
})

const v12 = [
  expense({ id: 'bank-expense' }), expense({ id: 'tax-expense', accountId: 'card', amount: 11500, taxAmountCents: 1500, receiptNumber: '=INV / RC 2048', date: '2026-10-02' }),
  expense({ id: 'cash-expense', accountId: 'cash', categoryId: 'rent', amount: 4000, date: '2026-10-03' }),
  expense({ id: 'september-expense', date: '2026-09-30' }), income({ amount: 200000 }), transfer(),
]
for (const [name, transactions, expectedExpense, expectedIncome, expectedFlow] of [
  ['released fixture', v12, 25500, 200000, 174500],
  ['partial card Refund', [...v12, refund()], 23000, 200000, 177000],
  ['card and bank Refunds', [...v12, refund(), refund({ id: 'bank-refund', accountId: 'bank', amount: 5000 })], 18000, 200000, 182000],
  ['zero net', [expense(), refund({ amount: 10000 })], 0, 0, 0],
  ['negative net', [expense(), refund({ amount: 15000 })], -5000, 0, 5000],
  ['refund only', [refund({ amount: 10000 })], -10000, 0, 10000],
  ['cross-month Refund', [expense({ date: '2026-09-30' }), refund()], -2500, 0, 2500],
]) test(`Exact v1.2 Home financial regression: ${name}`, () => {
  const expenses = calculateMonthlyTotalExpenses(transactions, '2026-10')
  const totalIncome = calculateMonthlyTotalIncome(transactions, '2026-10')
  assert.equal(expenses, expectedExpense)
  assert.equal(totalIncome, expectedIncome)
  assert.equal(calculateNetCashFlow(totalIncome, expenses), expectedFlow)
  const value = report(transactions, { filters: createReportFilters({ dateMode: 'month', month: '2026-10' }), grouping: 'category' })
  assert.equal(value.summary.netExpensesCents, expenses)
  assert.equal(value.summary.totalIncomeCents, totalIncome)
  assert.equal(value.summary.netCashFlowCents, expectedFlow)
  const expectedCategories = [...calculateMonthlyExpensesByCategory(transactions, '2026-10')].sort()
  assert.deepEqual(value.groups.filter(group => group.category?.type === 'expense')
    .map(group => [group.category.id, group.summary.netExpensesCents]).sort(), expectedCategories)
})
test('Released account balances are exactly unchanged after summary extraction', () => {
  assert.equal(calculateAccountBalance(accounts[0], v12), 275000)
  assert.equal(calculateAccountBalance(accounts[1], v12), 6500)
  assert.equal(calculateAccountBalance(accounts[2], v12), 16000)
})
test('Legacy monthly APIs retain independent validation and cancellation/overflow behavior', () => {
  const maximum = Number.MAX_SAFE_INTEGER
  const cancelling = [expense({ amount: maximum }), refund({ amount: maximum }), expense({ id: 'one', amount: 1 })]
  assert.equal(calculateMonthlyTotalExpenses(cancelling, '2026-10'), 1)
  assert.throws(() => report(cancelling), RangeError, 'Full reports cannot represent an unsafe Gross Expenses total')
  assert.equal(calculateMonthlyTotalIncome([income({ amount: maximum }), ...cancelling, transfer({ amount: 0 })], '2026-10'), maximum)
  assert.equal(calculateMonthlyTotalExpenses([expense(), income({ amount: 0 }), transfer({ amount: 0 })], '2026-10'), 10000)
  assert.throws(() => calculateMonthlyTotalExpenses([expense({ amount: maximum }), expense({ id: 'one', amount: 1 }), refund()], '2026-10'), RangeError)
})
test('Large history uses indexed lookups, stable IDs, and shared frozen entity snapshots', context => {
  const size = 100000, entityCount = 2000
  const manyAccounts = Array.from({ length: entityCount }, (_, index) => ({ id: `a${index}`, name: `Account ${index}`, type: 'bank', openingBalance: 0 }))
  const manyCategories = Array.from({ length: entityCount }, (_, index) => ({ id: `c${index}`, name: `Category ${index}`, type: 'expense' }))
  const transactions = Array.from({ length: size }, (_, index) => expense({ id: String(index).padStart(6, '0'), amount: 1,
    accountId: `a${index % entityCount}`, categoryId: `c${index % entityCount}` }))
  const started = performance.now()
  const value = report(transactions, { accounts: manyAccounts, categories: manyCategories, grouping: 'account' })
  context.diagnostic(`Prepared ${size} rows and ${entityCount} account groups in ${(performance.now() - started).toFixed(0)} ms; no timing threshold`)
  assert.equal(value.rows.length, size)
  assert.equal(value.summary.grossExpensesCents, size)
  assert.equal(value.groups.length, entityCount)
  assert.equal(value.rows[0].account, value.rows[entityCount].account)
  assert.equal(transactions[0].id, '000000')
  assert.equal(transactions.at(-1).id, '099999')
})
