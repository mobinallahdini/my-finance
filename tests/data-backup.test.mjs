import assert from 'node:assert/strict'
import test from 'node:test'
import { createBackup, exportFilename, includedSections, parseFullBackup, restoreSnapshot, validateFullBackup } from '../src/features/dataBackup/backupFormat.ts'
import { calculateInstallmentBalance, calculateObligationMonth } from '../src/domain/obligationCalculations.ts'
import { parseCsv, writeCsv, protectCsvText, unprotectCsvText, csvTextEncoding } from '../src/features/dataBackup/csv.ts'
import { accountsCsv, categoriesCsv, parseTransactionCsv, previewTransactionCsv, transactionsCsv, transactionIdentity,
  transactionCsvColumns } from '../src/features/dataBackup/transactionCsv.ts'

const fixture = () => ({
  accounts: [{ id: 'bank', name: 'Main, "Bank"', type: 'bank', openingBalance: 500000 },
    { id: 'cash', name: 'Cash', type: 'cash', openingBalance: -100 },
    { id: 'card', name: 'Visa', type: 'credit_card', openingBalance: 80000, creditLimit: 200000 }],
  categories: [{ id: 'expense', name: 'Groceries', type: 'expense' }, { id: 'income', name: 'Salary', type: 'income' }],
  transactions: [{ id: 'expense-id', type: 'expense', amount: 4275, date: '2026-10-05', accountId: 'bank', categoryId: 'expense', note: '=SUM(A1:A9), "quoted"\r\nUnicode: \u96ea\nsecond line' },
    { id: 'income-id', type: 'income', amount: 200000, date: '2026-10-04', accountId: 'bank', categoryId: 'income' },
    { id: 'transfer-id', type: 'transfer', amount: 30000, date: '2026-10-03', fromAccountId: 'bank', toAccountId: 'card' }],
})
const applicationFixture = () => ({ ...fixture(),
  obligations: [
    { id:'bill-雪',type:'bill',name:'Mobile',dueDay:31,startMonth:'2026-01',isActive:true,expectedAmountCents:10000,note:'Exact note\r\nwith Unicode: 雪' },
    { id:'installment',type:'installment',name:'Laptop',dueDay:15,startMonth:'2026-09',isActive:true,originalAmountCents:100000,scheduledPaymentCents:15500 },
  ],
  obligationPayments: [
    {id:'bill-pay',obligationId:'bill-雪',dueMonth:'2026-10',paidDate:'2026-11-02',amountCents:4000,note:'Late partial'},
    {id:'principal-pay',obligationId:'installment',dueMonth:'2026-09',paidDate:'2026-09-15',amountCents:38000},
  ],
})
const backup = () => createBackup(applicationFixture(), 'ocean', undefined, 'full', new Date('2026-10-05T14:32:00.000Z'))

test('Full Backup retains exact records, references, notes and theme, without UI state', () => {
  const file = backup()
  assert.equal(file.format, 'my-finance-backup'); assert.equal(file.schemaVersion, 2); assert.equal(file.currency, 'CAD')
  assert.equal(file.exportedAt, '2026-10-05T14:32:00.000Z')
  assert.deepEqual(parseFullBackup(JSON.stringify(file)).data, applicationFixture())
  assert.deepEqual(file.preferences, { theme: 'ocean' })
  assert.deepEqual(Object.keys(file).sort(), ['format', 'schemaVersion', 'exportedAt', 'currency', 'kind', 'sections', 'data', 'preferences'].sort())
  fixture().transactions[0].amount = 1
  assert.equal(file.data.transactions[0].amount, 4275)
})
test('Custom sections explainable dependencies and partial restore rejection', () => {
  assert.deepEqual(includedSections(['transactions']), ['accounts', 'categories', 'transactions'])
  const partial = createBackup(applicationFixture(), 'sage', ['transactions'], 'custom')
  assert.deepEqual(partial.data, fixture()); assert.equal(partial.preferences, undefined)
  assert.throws(() => validateFullBackup(partial), /partial Custom Backup/)
  const complete = createBackup(applicationFixture(), 'dark', ['transactions', 'obligations', 'preferences'], 'custom')
  assert.equal(validateFullBackup(complete).preferences.theme, 'dark')
  const preferences = createBackup(applicationFixture(), 'ocean', ['preferences'], 'custom')
  assert.deepEqual(preferences.data, {}); assert.deepEqual(preferences.sections, ['preferences'])
  assert.throws(() => createBackup(applicationFixture(), 'sage', [], 'custom'), /Select at least/)
})
test('Filenames use local calendar fields, independently of ISO export timestamps', () => {
  const now = new Date(2026, 9, 5, 0, 1)
  for (const kind of ['backup', 'custom-backup', 'transactions', 'accounts', 'categories']) {
    assert.equal(exportFilename(kind, now), `my-finance-${kind}-2026-10-05.${kind.endsWith('backup') ? 'json' : 'csv'}`)
  }
})

const invalidBackups = [
  ['wrong format', b => { b.format = 'other' }], ['unsupported version', b => { b.schemaVersion = 3 }],
  ['wrong currency', b => { b.currency = 'USD' }], ['invalid ISO timestamp', b => { b.exportedAt = 'yesterday' }],
  ['rollover timestamp', b => { b.exportedAt = '2026-02-30T00:00:00.000Z' }], ['invalid theme', b => { b.preferences.theme = 'neon' }],
  ['missing preferences', b => { delete b.preferences }], ['missing accounts', b => { delete b.data.accounts }],
  ['wrong section metadata', b => { b.sections = ['accounts', 'accounts', 'transactions', 'preferences'] }],
  ['duplicate account ID', b => { b.data.accounts.push(b.data.accounts[0]) }], ['duplicate category ID', b => { b.data.categories.push(b.data.categories[0]) }],
  ['duplicate transaction ID', b => { b.data.transactions.push(b.data.transactions[0]) }],
  ['empty ID', b => { b.data.accounts[0].id = ' ' }], ['missing account name', b => { delete b.data.accounts[0].name }],
  ['empty category name', b => { b.data.categories[0].name = '' }], ['invalid account type', b => { b.data.accounts[0].type = 'loan' }],
  ['fractional opening cents', b => { b.data.accounts[0].openingBalance = 1.5 }], ['unsafe cents', b => { b.data.accounts[0].openingBalance = 9007199254740992 }],
  ['negative credit limit', b => { b.data.accounts[2].creditLimit = -1 }], ['limit on bank', b => { b.data.accounts[0].creditLimit = 100 }],
  ['category type', b => { b.data.categories[0].type = 'transfer' }], ['zero amount', b => { b.data.transactions[0].amount = 0 }],
  ['negative amount', b => { b.data.transactions[0].amount = -1 }], ['fractional amount', b => { b.data.transactions[0].amount = 1.5 }],
  ['unsafe amount', b => { b.data.transactions[0].amount = 9007199254740992 }], ['invalid date', b => { b.data.transactions[0].date = '2026-02-30' }],
  ['year zero', b => { b.data.transactions[0].date = '0000-01-01' }], ['date not string', b => { b.data.transactions[0].date = null }],
  ['note not string', b => { b.data.transactions[0].note = 12 }], ['cross type field', b => { b.data.transactions[0].fromAccountId = 'cash' }],
  ['transfer category', b => { b.data.transactions[2].categoryId = 'expense' }], ['same transfer endpoints', b => { b.data.transactions[2].toAccountId = 'bank' }],
  ['missing expense account', b => { b.data.transactions[0].accountId = 'missing' }], ['missing category', b => { b.data.transactions[0].categoryId = 'missing' }],
  ['expense category mismatch', b => { b.data.transactions[0].categoryId = 'income' }], ['income category mismatch', b => { b.data.transactions[1].categoryId = 'expense' }],
  ['income to card', b => { b.data.transactions[1].accountId = 'card' }], ['missing transfer endpoint', b => { b.data.transactions[2].toAccountId = 'missing' }],
  ['unsupported record field', b => { b.data.accounts[0].currentBalance = 99 }], ['unexpected UI state', b => { b.route = 'home' }],
]
for (const [name, change] of invalidBackups) test(`Full Backup rejects ${name}`, () => {
  const b = backup(); change(b); assert.throws(() => validateFullBackup(b))
})
test('Malformed JSON fails cleanly; BOM is supported', () => {
  assert.throws(() => parseFullBackup('{broken'), /not valid JSON/)
  assert.deepEqual(parseFullBackup('\uFEFF' + JSON.stringify(backup())).data, applicationFixture())
})
test('Safe integer boundaries and valid leap dates retain exact cents', () => {
  const b = backup(); b.data.accounts[0].openingBalance = Number.MIN_SAFE_INTEGER
  b.data.accounts[2].creditLimit = Number.MAX_SAFE_INTEGER; b.data.transactions[0].amount = Number.MAX_SAFE_INTEGER
  b.data.transactions[0].date = '2024-02-29'; assert.equal(validateFullBackup(b).data.transactions[0].amount, Number.MAX_SAFE_INTEGER)
})

test('Version 2 preserves tracking IDs, exact cents, history and derived results', () => {
  const data = applicationFixture(), restored = restoreSnapshot(parseFullBackup(JSON.stringify(backup())))
  assert.deepEqual(restored, data)
  assert.equal(calculateInstallmentBalance(restored.obligations[1], restored.obligationPayments).remainingAmountCents, 62000)
  assert.equal(calculateObligationMonth(restored.obligations[0], restored.obligationPayments, '2026-10', '2026-10-05').status, 'partially_paid')
  const paid = [...restored.obligationPayments, {id:'second',obligationId:'bill-雪',dueMonth:'2026-10',paidDate:'2026-10-05',amountCents:6000}]
  assert.equal(calculateObligationMonth(restored.obligations[0], paid, '2026-10', '2026-10-05').status, 'paid')
  assert.deepEqual(Object.keys(restored.obligations[1]).sort(), ['id','type','name','dueDay','startMonth','isActive','originalAmountCents','scheduledPaymentCents'].sort())
})

test('Tracking Custom selection always exports obligations and payments together', () => {
  assert.deepEqual(includedSections(['obligations']), ['obligations','obligationPayments'])
  assert.deepEqual(includedSections(['obligationPayments']), ['obligations','obligationPayments'])
  const data = applicationFixture()
  for (const section of ['obligations','obligationPayments']) {
    const file = createBackup(data, 'dark', [section], 'custom')
    assert.deepEqual(file.data, {obligations:data.obligations,obligationPayments:data.obligationPayments})
    assert.throws(() => validateFullBackup(file), /partial Custom/)
  }
  assert.throws(() => createBackup(data,'sage',['transactions','preferences'],'full'), /every section/)
})

test('Version 1 retains its original graph and normalizes to empty tracking tables for replacement', () => {
  const file = { ...backup(), schemaVersion:1, sections:['accounts','categories','transactions','preferences'], data:fixture() }
  for (const kind of ['full','custom']) {
    file.kind = kind
    const parsed = parseFullBackup(JSON.stringify(file))
    assert.equal(parsed.schemaVersion, 1)
    assert.deepEqual(parsed.data, fixture())
    assert.deepEqual(restoreSnapshot(parsed), {...fixture(),obligations:[],obligationPayments:[]})
    assert.deepEqual(validateFullBackup(parsed), parsed)
  }
  file.data.obligations = []
  assert.throws(() => validateFullBackup(file), /unsupported field/)
})

const invalidTracking = [
  ['missing obligations', b => { delete b.data.obligations }],
  ['missing payments', b => { delete b.data.obligationPayments }],
  ['orphan payment', b => { b.data.obligationPayments[0].obligationId = 'missing' }],
  ['duplicate obligation ID', b => { b.data.obligations.push(b.data.obligations[0]) }],
  ['duplicate payment ID', b => { b.data.obligationPayments.push(b.data.obligationPayments[0]) }],
  ['unsupported obligation type', b => { b.data.obligations[0].type = 'weekly' }],
  ['untrimmed name', b => { b.data.obligations[0].name = ' Mobile ' }],
  ['blank name', b => { b.data.obligations[0].name = ' ' }],
  ['invalid due day', b => { b.data.obligations[0].dueDay = 32 }],
  ['fractional due day', b => { b.data.obligations[0].dueDay = 1.5 }],
  ['invalid start month', b => { b.data.obligations[0].startMonth = '2026-13' }],
  ['year zero', b => { b.data.obligations[0].startMonth = '0000-01' }],
  ['unsafe expected amount', b => { b.data.obligations[0].expectedAmountCents = Number.MAX_SAFE_INTEGER+1 }],
  ['zero original amount', b => { b.data.obligations[1].originalAmountCents = 0 }],
  ['missing scheduled amount', b => { delete b.data.obligations[1].scheduledPaymentCents }],
  ['nonboolean active', b => { b.data.obligations[0].isActive = 'true' }],
  ['cross-type bill field', b => { b.data.obligations[0].originalAmountCents = 100 }],
  ['cross-type installment field', b => { b.data.obligations[1].expectedAmountCents = 100 }],
  ['derived balance', b => { b.data.obligations[1].remainingAmountCents = 100 }],
  ['derived status', b => { b.data.obligations[0].status = 'paid' }],
  ['invalid due month', b => { b.data.obligationPayments[0].dueMonth = '2026-1' }],
  ['pre-start due month', b => { b.data.obligationPayments[0].dueMonth = '2025-12' }],
  ['invalid paid date', b => { b.data.obligationPayments[0].paidDate = '2026-02-30' }],
  ['zero payment', b => { b.data.obligationPayments[0].amountCents = 0 }],
  ['negative payment', b => { b.data.obligationPayments[0].amountCents = -1 }],
  ['fractional payment', b => { b.data.obligationPayments[0].amountCents = 1.5 }],
  ['unsafe payment', b => { b.data.obligationPayments[0].amountCents = Number.MAX_SAFE_INTEGER+1 }],
  ['invalid note', b => { b.data.obligationPayments[0].note = 3 }],
  ['linked transaction', b => { b.data.obligationPayments[0].transactionId = 'expense-id' }],
]
for (const [name, change] of invalidTracking) test(`Version 2 rejects ${name}`, () => {
  const file = backup(); change(file); assert.throws(() => validateFullBackup(file))
})

test('CSV parser handles quoted commas, escaped quotes, CRLF/LF, empty fields, BOM and Unicode', () => {
  const values = [['a,b', '"quoted"', 'line1\r\nline2\nline3', '\u96ea', '', "'literal"]]
  assert.deepEqual(parseCsv('\uFEFF' + writeCsv(['one', 'two', 'three', 'four', 'five', 'six'], values)), [['one', 'two', 'three', 'four', 'five', 'six'], ...values])
  assert.deepEqual(parseCsv('a,b\nc,d\n'), [['a', 'b'], ['c', 'd']])
  assert.deepEqual(parseCsv('""'), [['']]); assert.deepEqual(parseCsv(''), [])
  assert.deepEqual(parseCsv('a,b,'), [['a', 'b', '']])
})
for (const input of ['"unclosed', 'a"b,c', '"closed"oops', '"a" "b"']) test(`CSV rejects malformed quoting ${JSON.stringify(input)}`, () => assert.throws(() => parseCsv(input), /Malformed CSV/))
test('Spreadsheet protection is reversible for all text, including apostrophe-prefixed originals', () => {
  for (const value of ['', '=SUM(1,2)', '+formula', '-formula', '@formula', '\t=HYPERLINK()', '\r=foo', ' \n=bar', "'original", 'plain', '\u96ea']) {
    assert.equal(unprotectCsvText(protectCsvText(value)), value)
    if (value) assert.equal(protectCsvText(value)[0], "'")
  }
})
test('All CSV schemas preserve exact decimals and text, with unused columns blank', () => {
  const data = fixture(); const exported = parseCsv(transactionsCsv(data))
  assert.deepEqual(exported[0], [...transactionCsvColumns]); assert.equal(exported[1][3], '42.75')
  assert.equal(exported[1][8], ''); assert.equal(exported[3][4], ''); assert.equal(exported[3][6], '')
  assert.equal(exported[1].at(-1), csvTextEncoding)
  const accounts = parseCsv(accountsCsv(data.accounts)); assert.equal(accounts[2][3], '-1.00'); assert.equal(accounts[1][4], ''); assert.equal(accounts[3][4], '2000.00')
  assert.deepEqual(parseCsv(categoriesCsv(data.categories))[0], ['id', 'name', 'type', 'text_encoding'])
})
test('Exported CSV re-import classifies exact duplicates including multiline and Unicode notes', () => {
  const data = fixture(); const source = parseTransactionCsv('\uFEFF' + transactionsCsv(data)); const preview = previewTransactionCsv(source, data)
  assert.deepEqual(preview.map(row => row.status), ['Duplicate', 'Duplicate', 'Duplicate'])
  assert.equal(preview[0].transaction.note, data.transactions[0].note)
  assert.deepEqual(preview.map(row => row.transaction), data.transactions)
  assert.deepEqual(previewTransactionCsv(source, { ...data, transactions: [] }).map(row => row.status), ['Ready', 'Ready', 'Ready'])
})
test('ID conflict never changes the original or generates a replacement ID', () => {
  const data = fixture(); const csv = parseTransactionCsv(transactionsCsv(data)); csv[0].fields.amount_cad = '50.00'
  const preview = previewTransactionCsv(csv, data); assert.equal(preview[0].status, 'Conflict')
  assert.equal(preview[0].transaction.id, 'expense-id'); assert.equal(data.transactions[0].amount, 4275)
})
test('Within-file identical IDs skip copies; differing IDs conflict on every occurrence', () => {
  const data = fixture(); const row = parseTransactionCsv(transactionsCsv(data))[0]; const copy = structuredClone(row); copy.rowNumber = 9
  const empty = { ...data, transactions: [] }
  assert.deepEqual(previewTransactionCsv([row, copy], empty).map(row => row.status), ['Ready', 'Duplicate'])
  copy.fields.amount_cad = '99.00'; assert.deepEqual(previewTransactionCsv([row, copy], empty).map(row => row.status), ['Conflict', 'Conflict'])
})
test('Mapping uses exact IDs before names; unique normalized names and category type are fallbacks', () => {
  const data = fixture(); const source = parseTransactionCsv(transactionsCsv(data)); source[0].fields.account_name = 'WRONG NAME'
  assert.equal(previewTransactionCsv(source, data)[0].status, 'Duplicate')
  source[0].fields.account_id = 'old-bank'; source[0].fields.account_name = '  MAIN, "BANK"  '
  source[0].fields.category_id = 'old-category'; source[0].fields.category_name = ' GROCERIES '
  data.categories.push({ id: 'income-groceries', name: 'Groceries', type: 'income' })
  assert.equal(previewTransactionCsv(source, data)[0].status, 'Duplicate')
})
test('Missing/ambiguous references need explicit mapping and never create entities', () => {
  const data = fixture(); const source = parseTransactionCsv(transactionsCsv(data)); source[0].fields.account_id = 'old-bank'
  data.accounts.push({ ...data.accounts[0], id: 'bank-copy' })
  assert.equal(previewTransactionCsv(source, data)[0].status, 'Needs mapping')
  source[0].fields.category_id = 'missing'; source[0].fields.category_name = 'missing'
  const resolved = previewTransactionCsv(source, data, { 2: { accountId: 'bank', categoryId: 'expense' } })
  assert.equal(resolved[0].status, 'Duplicate'); assert.equal(data.accounts.length, 4); assert.equal(data.categories.length, 2)
  const cleared = previewTransactionCsv(source, data, { 2: { accountId: '' } }); assert.equal(cleared[0].status, 'Needs mapping')
})
const invalidCsvRows = [
  ['missing transaction ID', f => { f.id = '' }], ['unknown type', f => { f.type = 'bill' }],
  ['invalid date', f => { f.date = '2026-02-29' }], ['year zero', f => { f.date = '0000-01-01' }],
  ['zero amount', f => { f.amount_cad = '0.00' }], ['negative amount', f => { f.amount_cad = '-1' }],
  ['too many decimals', f => { f.amount_cad = '1.001' }], ['symbol amount', f => { f.amount_cad = '$1.00' }],
  ['comma amount', f => { f.amount_cad = '1,000.00' }], ['unsafe amount', f => { f.amount_cad = '90071992547409.92' }],
  ['category mismatch', f => { f.category_id = 'income' }], ['cross type fields', f => { f.from_account_id = 'cash' }],
]
for (const [name, change] of invalidCsvRows) test(`CSV rejects ${name}`, () => {
  const data = fixture(); const rows = parseTransactionCsv(transactionsCsv(data)); change(rows[0].fields)
  assert.equal(previewTransactionCsv(rows, data)[0].status, 'Invalid')
})
test('CSV rejects income to card, mismatched income category and same transfer endpoints', () => {
  const data = fixture(); const rows = parseTransactionCsv(transactionsCsv(data)); rows[1].fields.account_id = 'card'
  assert.equal(previewTransactionCsv(rows, data)[1].status, 'Invalid')
  rows[1].fields.account_id = 'bank'; rows[1].fields.category_id = 'expense'; assert.equal(previewTransactionCsv(rows, data)[1].status, 'Invalid')
  rows[2].fields.to_account_id = 'bank'; assert.equal(previewTransactionCsv(rows, data)[2].status, 'Invalid')
  rows[2].fields.category_name = 'Groceries'; assert.equal(previewTransactionCsv(rows, data)[2].status, 'Invalid')
})
test('Exact decimal boundary round trips without floating-point rounding', () => {
  const data = fixture(); data.transactions[0].amount = Number.MAX_SAFE_INTEGER
  const rows = parseTransactionCsv(transactionsCsv(data)); assert.equal(rows[0].fields.amount_cad, '90071992547409.91')
  assert.equal(previewTransactionCsv(rows, data)[0].transaction.amount, Number.MAX_SAFE_INTEGER)
})
test('Header/encoding validation never guesses other CSV schemas', () => {
  assert.throws(() => parseTransactionCsv('date,amount\n2026-10-05,1.00'), /documented/)
  const data = parseCsv(transactionsCsv(fixture())); data[1][13] = 'other'
  assert.equal(previewTransactionCsv(parseTransactionCsv(writeCsv(data[0], data.slice(1))), fixture())[0].status, 'Invalid')
  data[1][13] = csvTextEncoding; data[1][0] = '=unsafe-unencoded-id'
  assert.equal(previewTransactionCsv(parseTransactionCsv(writeCsv(data[0], data.slice(1))), fixture())[0].status, 'Invalid')
  data[1].pop(); assert.equal(previewTransactionCsv(parseTransactionCsv(writeCsv(data[0], data.slice(1))), fixture())[0].status, 'Invalid')
})
test('Empty note and absent note are effectively identical, other whitespace is preserved', () => {
  const data = fixture(); const tx = data.transactions[1]
  assert.equal(transactionIdentity(tx), transactionIdentity({ ...tx, note: '' }))
  assert.notEqual(transactionIdentity(tx), transactionIdentity({ ...tx, note: ' ' }))
})
