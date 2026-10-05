import assert from 'node:assert/strict'
import test from 'node:test'
import { legacyApplicationSettings, validateApplicationSettings } from '../src/domain/financeSettings.ts'
import { countryCodes, currencyCodes } from '../src/domain/financeSettingsCodes.ts'
import { formatMoney, parseDollars, dollarsForInput } from '../src/features/accounts/money.ts'
import { settingsChoices, suggestedCountry } from '../src/features/financeSettings/selectorLabels.ts'
import { createBackup, parseFullBackup } from '../src/features/dataBackup/backupFormat.ts'
import { calculateAccountBalance, calculateAvailableCredit, calculateMonthlyTotalExpenses, calculateMonthlyTotalIncome } from '../src/domain/calculations.ts'

test('Standardized country and currency catalogs have stable unique codes', () => {
  assert.equal(countryCodes.length, 249)
  assert.equal(new Set(countryCodes).size, countryCodes.length)
  assert.equal(new Set(currencyCodes).size, currencyCodes.length)
  assert.ok(countryCodes.every(code => /^[A-Z]{2}$/.test(code)))
  assert.ok(currencyCodes.every(code => /^[A-Z]{3}$/.test(code)))
  for (const currencyCode of ['CAD', 'USD', 'EUR', 'GBP', 'IRR', 'TRY', 'AED']) {
    assert.equal(validateApplicationSettings({ ...legacyApplicationSettings, countryCode: 'DE', currencyCode }).currencyCode, currencyCode)
  }
})
for (const profileType of ['personal', 'business']) {
  test(`Settings validate ${profileType} and all twelve fiscal months independently from country/currency`, () => {
    for (let fiscalYearStartMonth = 1; fiscalYearStartMonth <= 12; fiscalYearStartMonth++) {
      const value = { ...legacyApplicationSettings, countryCode: 'CA', currencyCode: 'USD', profileType, fiscalYearStartMonth }
      assert.deepEqual(validateApplicationSettings(value), value)
    }
  })
}
for (const [field, values] of Object.entries({
  id: ['', 'another-workspace'], countryCode: ['', 'ZZ', 'Canada', 'ca'],
  currencyCode: ['', 'cad', 'ZZZ', 'JPY', 'KWD', 'BHD', 'CLF'],
  profileType: ['company', '', null], fiscalYearStartMonth: [0, 13, 1.5, '1', null],
  onboardingCompleted: ['true', 1, null],
})) for (const value of values) test(`Settings reject ${field}=${JSON.stringify(value)}`, () => {
  assert.throws(() => validateApplicationSettings({ ...legacyApplicationSettings, [field]: value }))
})
test('Settings reject malformed, missing and additional fields', () => {
  for (const value of [null, [], undefined, { ...legacyApplicationSettings, profileId: 'x' }]) assert.throws(() => validateApplicationSettings(value))
  for (const key of Object.keys(legacyApplicationSettings)) {
    const value = { ...legacyApplicationSettings }; delete value[key]
    assert.throws(() => validateApplicationSettings(value))
  }
})
test('Locale region suggestion stays optional; labels fall back to standardized codes', () => {
  assert.equal(suggestedCountry(['en-GB']), 'GB')
  assert.equal(suggestedCountry(['en', 'fa-IR']), 'IR')
  assert.equal(suggestedCountry(['en', 'malformed_locale']), '')
  assert.match(settingsChoices('currency').find(item => item.code === 'USD').label, /USD.*Dollar/i)
  const displayNames = Intl.DisplayNames
  try {
    Intl.DisplayNames = undefined
    assert.ok(settingsChoices('region').some(item => item.label === 'CA — CA'))
    assert.ok(settingsChoices('currency').some(item => item.label === 'EUR — EUR'))
  } finally { Intl.DisplayNames = displayNames }
})
for (const currency of ['CAD', 'USD', 'EUR', 'GBP', 'IRR']) test(`${currency} formatting is exact, including signed cents and safe integer boundaries`, () => {
  const reference = new Intl.NumberFormat('en-CA', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 })
  for (const cents of [0, 1, -1, 120000, -120001]) assert.equal(formatMoney(cents, currency), reference.format(cents / 100))
  assert.match(formatMoney(Number.MAX_SAFE_INTEGER, currency), /90,071,992,547,409\.91/)
  assert.match(formatMoney(-Number.MAX_SAFE_INTEGER, currency), /90,071,992,547,409\.91/)
  for (const cents of [1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => formatMoney(cents, currency))
  assert.equal(parseDollars(dollarsForInput(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER)
})
test('Currency formatting rejects unsupported precision rather than interpreting cents differently', () => {
  assert.throws(() => formatMoney(100, 'JPY'))
  assert.throws(() => formatMoney(100, 'KWD'))
})
test('Backup v3 records and validates workspace currency without changing amounts; v1 remains CAD', () => {
  const snapshot = { accounts: [], categories: [], transactions: [], obligations: [], obligationPayments: [] }
  for (const currency of ['CAD', 'USD', 'EUR', 'GBP']) {
    const backup = createBackup({...snapshot,applicationSettings:{...legacyApplicationSettings,currencyCode:currency}}, 'dark', undefined, 'full', new Date())
    assert.equal(parseFullBackup(JSON.stringify(backup)).currency, currency)
    assert.deepEqual(backup.data, {...snapshot,applicationSettings:{...legacyApplicationSettings,currencyCode:currency}})
  }
  const legacy = { ...createBackup({...snapshot,applicationSettings:legacyApplicationSettings}, 'sage'), schemaVersion: 1, currency: 'USD',
    sections: ['accounts', 'categories', 'transactions', 'preferences'], data: { accounts: [], categories: [], transactions: [] } }
  assert.throws(() => parseFullBackup(JSON.stringify(legacy)), /Version 1.*CAD/)
})
test('Income, expense, Transfer, credit debt and dashboard totals remain integer calculations independent of currency', () => {
  const bank = { id: 'bank', name: 'Bank', type: 'bank', openingBalance: 100000 }
  const card = { id: 'card', name: 'Card', type: 'credit_card', openingBalance: 50000, creditLimit: 100000 }
  const transactions = [
    { id: 'expense', type: 'expense', accountId: 'bank', categoryId: 'food', date: '2026-10-05', amount: 4275 },
    { id: 'income', type: 'income', accountId: 'bank', categoryId: 'salary', date: '2026-10-04', amount: 200000 },
    { id: 'transfer', type: 'transfer', fromAccountId: 'bank', toAccountId: 'card', date: '2026-10-03', amount: 10000 },
  ]
  const before = structuredClone(transactions)
  for (const currency of ['CAD', 'USD', 'EUR', 'GBP']) {
    assert.equal(calculateMonthlyTotalExpenses(transactions, '2026-10'), 4275)
    assert.equal(calculateMonthlyTotalIncome(transactions, '2026-10'), 200000)
    assert.equal(calculateAccountBalance(bank, transactions), 285725)
    assert.equal(calculateAccountBalance(card, transactions), 40000)
    assert.equal(calculateAvailableCredit(card, transactions), 60000)
    transactions.forEach(transaction => formatMoney(transaction.amount, currency))
  }
  assert.deepEqual(transactions, before)
})
