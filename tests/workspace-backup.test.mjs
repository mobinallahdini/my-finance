import assert from 'node:assert/strict'
import test from 'node:test'
import { legacyApplicationSettings } from '../src/domain/financeSettings.ts'
import { createBackup, backupSections, parseFullBackup, validateFullBackup, restoreSnapshot, settingsWereReconstructed } from '../src/features/dataBackup/backupFormat.ts'
import { transactionsCsv, accountsCsv, categoriesCsv, parseTransactionCsv, previewTransactionCsv,
  transactionCsvColumns, legacyTransactionCsvColumns, accountCsvColumns } from '../src/features/dataBackup/transactionCsv.ts'
import { parseCsv, writeCsv } from '../src/features/dataBackup/csv.ts'

const settings = { ...legacyApplicationSettings, countryCode:'DE', currencyCode:'EUR', profileType:'business', fiscalYearStartMonth:7 }
const fixture = () => ({
  accounts:[{id:'bank',name:'=Bank, "quoted"',type:'bank',openingBalance:-12345},{id:'card',name:'Card',type:'credit_card',openingBalance:98765,creditLimit:Number.MAX_SAFE_INTEGER}],
  categories:[{id:'food',name:'@Food',type:'expense'},{id:'salary',name:'Salary',type:'income'}],
  transactions:[{id:'expense',type:'expense',amount:4275,date:'2026-10-05',accountId:'bank',categoryId:'food',note:'=SUM(A1:A2), "雪"\r\nsecond line'},
    {id:'income',type:'income',amount:200000,date:'2026-10-04',accountId:'bank',categoryId:'salary'},
    {id:'transfer',type:'transfer',amount:Number.MAX_SAFE_INTEGER,date:'2026-10-03',fromAccountId:'bank',toAccountId:'card'}],
  obligations:[{id:'bill',type:'bill',name:'Bill',expectedAmountCents:10000,startMonth:'2026-01',dueDay:31,isActive:true},
    {id:'installment',type:'installment',name:'Laptop',originalAmountCents:100000,scheduledPaymentCents:20000,startMonth:'2026-09',dueDay:10,isActive:true}],
  obligationPayments:[{id:'payment',obligationId:'bill',dueMonth:'2026-10',paidDate:'2026-10-05',amountCents:4000,note:'Partial'}],
  applicationSettings:{...settings},
})
const backup = () => createBackup(fixture(),'ocean',undefined,'full',new Date('2026-10-05T16:00:00.000Z'))
function legacyCsv(currency = 'CAD') {
  const rows=parseCsv(transactionsCsv(fixture(),currency))
  return writeCsv(legacyTransactionCsvColumns,rows.slice(1).map(row=>legacyTransactionCsvColumns.map(column=>row[transactionCsvColumns.indexOf(column==='amount_cad'?'amount':column)])))
}
test('V3 export round-trips every workspace field, all records and theme with matching currency', () => {
  const value=fixture(), file=createBackup(value,'dark')
  assert.equal(file.schemaVersion,3);assert.equal(file.currency,'EUR')
  assert.deepEqual(file.sections,[...backupSections]);assert.deepEqual(file.preferences,{theme:'dark'})
  assert.deepEqual(file.data,value);assert.deepEqual(parseFullBackup(JSON.stringify(file)).data,value)
  assert.deepEqual(restoreSnapshot(validateFullBackup(file)),value)
  value.applicationSettings.countryCode='GB';value.transactions[0].amount=1
  assert.equal(file.data.applicationSettings.countryCode,'DE');assert.equal(file.data.transactions[0].amount,4275)
  assert.ok(!Object.hasOwn(file,'filters'))
})
test('V3 serialization preserves the onboarding flag; successful restore completes setup', () => {
  const value=fixture();value.applicationSettings.onboardingCompleted=false
  const file=createBackup(value,'sage')
  assert.equal(file.data.applicationSettings.onboardingCompleted,false)
  assert.equal(validateFullBackup(file).data.applicationSettings.onboardingCompleted,false)
  assert.equal(restoreSnapshot(validateFullBackup(file)).applicationSettings.onboardingCompleted,true)
})
for(const [name,mutate] of [
  ['contradictory metadata', b=>{b.currency='USD'}],
  ['unsupported metadata currency', b=>{b.currency='JPY'}],
  ['unsupported settings currency', b=>{b.data.applicationSettings.currencyCode='KWD'}],
  ['invalid country', b=>{b.data.applicationSettings.countryCode='ZZ'}],
  ['invalid profile', b=>{b.data.applicationSettings.profileType='company'}],
  ['invalid fiscal month', b=>{b.data.applicationSettings.fiscalYearStartMonth=13}],
  ['fractional fiscal month', b=>{b.data.applicationSettings.fiscalYearStartMonth=1.5}],
  ['invalid onboarding flag', b=>{b.data.applicationSettings.onboardingCompleted='true'}],
  ['wrong fixed settings ID', b=>{b.data.applicationSettings.id='other'}],
  ['missing settings', b=>{delete b.data.applicationSettings}],
  ['unsupported settings field', b=>{b.data.applicationSettings.profileId='x'}],
  ['missing settings section', b=>{b.sections=b.sections.filter(s=>s!=='applicationSettings')}],
  ['orphan payment', b=>{b.data.obligationPayments[0].obligationId='missing'}],
  ['credit card income', b=>{b.data.transactions[1].accountId='card'}],
]) test(`V3 rejects ${name} before restoration`,()=>{
  const file=backup();mutate(file);assert.throws(()=>validateFullBackup(file))
})
test('Every Custom JSON selection carries exact workspace settings, with theme optional',()=>{
  for(const section of backupSections.filter(s=>s!=='applicationSettings')) {
    const file=createBackup(fixture(),'ocean',[section],'custom')
    assert.equal(file.schemaVersion,3);assert.equal(file.currency,'EUR')
    assert.ok(file.sections.includes('applicationSettings'));assert.deepEqual(file.data.applicationSettings,settings)
    assert.equal(Object.hasOwn(file,'preferences'),section==='preferences')
  }
  assert.throws(()=>createBackup(fixture(),'sage',[],'custom'),/Select/)
})
test('Legacy v1 reconstructs CA/CAD/personal/January and clears tracking regardless of destination region',()=>{
  const source=backup(),{accounts,categories,transactions}=source.data
  const file={...source,schemaVersion:1,currency:'CAD',sections:['accounts','categories','transactions','preferences'],data:{accounts,categories,transactions}}
  const parsed=validateFullBackup(file),restored=restoreSnapshot(parsed,'DE')
  assert.deepEqual(restored.applicationSettings,legacyApplicationSettings)
  assert.deepEqual(restored.obligations,[]);assert.deepEqual(restored.obligationPayments,[])
  assert.ok(settingsWereReconstructed(parsed))
})
for(const currency of ['CAD','USD','EUR']) test(`Legacy v2 ${currency} reconstructs defaults with the destination's known region`,()=>{
  const source=backup(),{applicationSettings,...data}=source.data
  const file={...source,schemaVersion:2,currency,sections:source.sections.filter(s=>s!=='applicationSettings'),data}
  const parsed=validateFullBackup(file),restored=restoreSnapshot(parsed,'GB')
  assert.deepEqual(restored.applicationSettings,{...legacyApplicationSettings,countryCode:'GB',currencyCode:currency})
  const {applicationSettings:reconstructed,...records}=restored
  assert.deepEqual(records,data);assert.ok(settingsWereReconstructed(parsed))
  assert.equal(restoreSnapshot(parsed).applicationSettings.countryCode,'CA')
  assert.equal(applicationSettings.profileType,'business');assert.equal(reconstructed.profileType,'personal')
})
test('V2 with optional stored settings validates and preserves them instead of guessing defaults',()=>{
  const source=backup(),file={...source,schemaVersion:2,sections:source.sections.filter(s=>s!=='applicationSettings')}
  const parsed=validateFullBackup(file)
  assert.deepEqual(restoreSnapshot(parsed,'GB').applicationSettings,settings)
  assert.equal(settingsWereReconstructed(parsed),false)
  file.currency='USD';assert.throws(()=>validateFullBackup(file),/must agree/)
})
for(const currency of ['CAD','USD','EUR']) test(`${currency} Transactions and Accounts CSV emit neutral amount columns and exact cents`,()=>{
  const value=fixture(),text=transactionsCsv(value,currency),csv=parseCsv(text)
  assert.deepEqual(csv[0],[...transactionCsvColumns]);assert.ok(!csv[0].includes('amount_cad'))
  assert.ok(csv.slice(1).every(row=>row[csv[0].indexOf('currency_code')]===currency))
  assert.equal(csv[1][3],'42.75');assert.equal(csv[3][3],'90071992547409.91')
  const rows=previewTransactionCsv(parseTransactionCsv(text,currency),{...value,transactions:[]},currency)
  assert.ok(rows.every(row=>row.status==='Ready'));assert.deepEqual(rows.map(row=>row.transaction),value.transactions)
  const accounts=parseCsv(accountsCsv(value.accounts,currency))
  assert.deepEqual(accounts[0],[...accountCsvColumns]);assert.equal(accounts[1][3],'-123.45')
  assert.equal(accounts[2][4],'90071992547409.91');assert.equal(accounts[1][5],currency)
  assert.equal(accounts[1][1],"'=Bank, \"quoted\"")
  assert.equal(rows[0].transaction.note,value.transactions[0].note)
})
test('Mismatched CSV is rejected before preview; neither records nor workspace metadata are changed',()=>{
  const value=fixture(),before=structuredClone(value),text=transactionsCsv(value,'USD')
  assert.throws(()=>parseTransactionCsv(text,'CAD'),/This file uses USD, but this workspace uses CAD\./)
  const source=parseTransactionCsv(text,'USD')
  assert.throws(()=>previewTransactionCsv(source,value,'EUR'),/This file uses USD, but this workspace uses EUR\./)
  assert.deepEqual(value,before)
})
test('Mixed, missing and unsupported CSV currencies block the entire file, including invalid rows',()=>{
  const rows=parseCsv(transactionsCsv(fixture(),'USD')),column=rows[0].indexOf('currency_code')
  for(const code of ['EUR','','JPY','KWD','usd','ZZZ']) {
    const copy=structuredClone(rows);copy[2][column]=code
    assert.throws(()=>parseTransactionCsv(writeCsv(copy[0],copy.slice(1)),'USD'))
  }
  rows[2][column]='EUR';rows[2][3]='invalid amount'
  assert.throws(()=>parseTransactionCsv(writeCsv(rows[0],rows.slice(1)),'USD'),/mixed currencies/)
})
test('Legacy amount_cad is always CAD: matching import allowed, USD workspace blocked',()=>{
  const text=legacyCsv(),source=parseTransactionCsv(text,'CAD')
  assert.ok(source.every(row=>row.fields.currency_code==='CAD'))
  const rows=previewTransactionCsv(source,fixture(),'CAD')
  assert.ok(rows.every(row=>row.status==='Duplicate'))
  assert.throws(()=>parseTransactionCsv(text,'USD'),/This file uses CAD, but this workspace uses USD\./)
})
test('Currency-aware CSV preserves ID conflicts, duplicate handling, explicit mapping and protected text',()=>{
  const value=fixture(),source=parseTransactionCsv(transactionsCsv(value,'EUR'),'EUR')
  assert.ok(previewTransactionCsv(source,value,'EUR').every(row=>row.status==='Duplicate'))
  source[0].fields.amount='43.00'
  assert.equal(previewTransactionCsv(source,value,'EUR')[0].status,'Conflict')
  source[0].fields.account_id='missing';source[0].fields.account_name='unknown'
  assert.equal(previewTransactionCsv(source,value,'EUR')[0].status,'Needs mapping')
  const mapped=previewTransactionCsv(source,{...value,transactions:[]},'EUR',{2:{accountId:'bank',categoryId:'food'}})
  assert.equal(mapped[0].status,'Ready');assert.equal(mapped[0].transaction.note,value.transactions[0].note)
})
test('Categories CSV remains byte-for-byte unchanged and contains no currency column',()=>{
  assert.equal(categoriesCsv([{id:'food',name:'Food',type:'expense'}]),`"id","name","type","text_encoding"\r\n"'food","'Food","'expense","my-finance-apostrophe-v1"\r\n`)
})
test('Header-only exports remain valid empty files with no amounts to reinterpret',()=>{
  const empty={accounts:[],categories:[],transactions:[]}
  assert.deepEqual(parseTransactionCsv(transactionsCsv(empty,'EUR'),'USD'),[])
  assert.throws(()=>transactionsCsv(empty,'JPY'))
  assert.throws(()=>accountsCsv([],'KWD'))
})
