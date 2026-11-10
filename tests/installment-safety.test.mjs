import assert from 'node:assert/strict'
import test from 'node:test'
import * as financial from '../src/domain/calculations.ts'
import * as obligations from '../src/domain/obligationCalculations.ts'
import { calculateFinancialSummary } from '../src/domain/financialSummary.ts'
import { validateWorkspaceSnapshot } from '../src/persistence/snapshotValidation.ts'
import { validateObligationPayment } from '../src/domain/obligationValidation.ts'
import { validateTransactionReferences } from '../src/persistence/validation.ts'
import { parseFullBackup, restoreSnapshot, createBackup } from '../src/features/dataBackup/backupFormat.ts'
import { historical, canonicalRecords, deriveHistoricalBaseline, expectedHistoricalBaseline, historicalBackup } from './helpers/installmentBaseline.mjs'

const data = historical.workspace
test('Synthetic historical fixture passes current strict graph validation unchanged', () => {
  assert.deepEqual(validateWorkspaceSnapshot(structuredClone(data)), data)
  assert.equal(historical.release.tag, 'v1.2.0')
  assert.ok(data.obligationPayments.every(row => Object.keys(row).every(key => ['id','obligationId','dueMonth','paidDate','amountCents','note'].includes(key))))
})
test('Complete machine-readable baseline matches independent exact expected values', () => {
  const before = structuredClone(data)
  assert.deepEqual(deriveHistoricalBaseline(data, financial, obligations), expectedHistoricalBaseline())
  assert.deepEqual(data, before)
})
for (const account of data.accounts) test(`Historical ${account.id}: opening, derived balance and optional credit limit`, () => {
  assert.equal(account.openingBalance, historical.expected.openingBalancesCents[account.id])
  assert.equal(financial.calculateAccountBalance(account, data.transactions), historical.expected.accountBalancesCents[account.id])
  if (account.type === 'credit_card') assert.equal(financial.calculateAvailableCredit(account, data.transactions) ?? null, historical.expected.availableCreditCents[account.id])
})
for (const row of data.obligations.filter(row => row.type === 'installment')) test(`Historical ${row.id}: paid, remaining, overpayment and completion`, () => {
  assert.deepEqual(obligations.calculateInstallmentBalance(row, data.obligationPayments), historical.expected.installments[row.id])
})
for (const month of Object.keys(historical.expected.obligationMonths)) test(`Historical ${month}: assignment and actual paid date remain distinct`, () => {
  const actual = deriveHistoricalBaseline(data, financial, obligations)
  assert.deepEqual(actual.obligationMonths[month], historical.expected.obligationMonths[month])
  assert.deepEqual(actual.monthlyFinancial[month], historical.expected.monthlyFinancial[month])
})
test('No financial effect is inferred from missing links, even for late or overpaid historical payments', () => {
  const before = structuredClone(data.transactions)
  for (const row of data.obligations) obligations.calculateObligationMonth(row, data.obligationPayments, '2026-10', historical.today)
  assert.deepEqual(data.transactions, before)
  assert.deepEqual(calculateFinancialSummary(data.transactions), {
    grossExpensesCents: 41600, refundsCents: 13000, netExpensesCents: 28600, totalIncomeCents: 301000,
    netCashFlowCents: 272400, transferVolumeCents: 27000, transactionCount: 13,
    expenseCount: 5, incomeCount: 2, refundCount: 3, transferCount: 3,
  })
})
for (const version of [1,2,3]) for (const storedSettings of version === 2 ? [false,true] : [false]) {
  test(`Full Backup v${version}${storedSettings ? ' with optional settings' : ''} restores only represented records without creating links`, () => {
    const backup = historicalBackup(version, storedSettings), parsed = parseFullBackup(JSON.stringify(backup)), restored = restoreSnapshot(parsed, 'DE')
    assert.deepEqual(restored.transactions, backup.data.transactions)
    assert.deepEqual(restored.accounts, data.accounts)
    assert.deepEqual(restored.categories, data.categories)
    assert.deepEqual(restored.obligationPayments, version === 1 ? [] : data.obligationPayments)
    assert.equal(restored.applicationSettings.currencyCode, version === 1 ? 'CAD' : 'GBP')
    assert.equal(restored.applicationSettings.onboardingCompleted, true)
    assert.equal(parsed.preferences.theme, historical.theme)
    const expected = version === 3 ? historical.expected.accountBalancesCents : historical.expected.preRefundLegacyBalancesCents
    for (const account of restored.accounts) assert.equal(financial.calculateAccountBalance(account, restored.transactions), expected[account.id])
  })
}
test('Full Backup v3 round-trips all historical financial/tracking metadata and settings', () => {
  const file = createBackup(data, historical.theme)
  assert.equal(file.schemaVersion, 3)
  assert.deepEqual(canonicalRecords(restoreSnapshot(parseFullBackup(JSON.stringify(file)))) , canonicalRecords(data))
})
for (const field of ['transactionId','creationOperationId','financialMode','linkOwnership','revision']) test(`v1.2 payment validation still rejects future field ${field}`, () => {
  assert.throws(() => validateObligationPayment({ ...data.obligationPayments[0], [field]: 'not-supported-yet' }), /Unsupported|cross-type/)
})
test('Existing financial validation still rejects Income to credit cards and Refund tax metadata', () => {
  const accounts = new Map(data.accounts.map(row => [row.id,row])), categories = new Map(data.categories.map(row => [row.id,row]))
  assert.throws(() => validateTransactionReferences({ ...data.transactions[0], accountId: 'card-debt' }, accounts, categories), /Income.*bank or cash/)
  const bad = structuredClone(data); bad.transactions.find(row => row.type === 'refund').taxAmountCents = 1
  assert.throws(() => validateWorkspaceSnapshot(bad), /unsupported|only allowed/i)
})
