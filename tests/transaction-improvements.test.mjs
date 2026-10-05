import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateAccountBalance, calculateAvailableCredit, calculateMonthlyExpensesByCategory, calculateMonthlyTotalExpenses, calculateMonthlyTotalIncome } from '../src/domain/calculations.ts'
import { validateTransaction, validateTransactionReferences } from '../src/persistence/validation.ts'
import { transactionRecord } from '../src/persistence/snapshotValidation.ts'
import { spendingDonutTotal, spendingDonutSlices, spendingDonutSegments } from '../src/features/dashboard/spendingDonut.ts'
import { emptyTransactionFilters, filterTransactions, filterChips } from '../src/features/transactions/transactionFiltering.ts'
import { isEligibleAccount } from '../src/features/transactions/transactionHelpers.ts'
import { signedTransactionAmount } from '../src/features/transactions/transactionPresentation.ts'
import { createBackup, parseFullBackup, restoreSnapshot } from '../src/features/dataBackup/backupFormat.ts'
import { transactionsCsv, parseTransactionCsv, previewTransactionCsv, previousTransactionCsvColumns, legacyTransactionCsvColumns } from '../src/features/dataBackup/transactionCsv.ts'
import { parseCsv, writeCsv, protectCsvText } from '../src/features/dataBackup/csv.ts'
import { categoryNameError } from '../src/features/categories/categoryHelpers.ts'

const settings = { id:'application',countryCode:'CA',currencyCode:'CAD',profileType:'personal',fiscalYearStartMonth:1,onboardingCompleted:true }
const accounts = ['bank','cash','credit_card'].map(type => ({ id:type,name:type,type,openingBalance:0,...(type==='credit_card'?{creditLimit:20000}:{}) }))
const categories = [{id:'food',name:'Food',type:'expense'},{id:'rent',name:'Rent',type:'expense'},{id:'salary',name:'Salary',type:'income'}]
const expense = (fields = {}) => ({ id:'expense',type:'expense',amount:10000,date:'2026-10-01',accountId:'bank',categoryId:'food',...fields })
const refund = (fields = {}) => ({ id:'refund',type:'refund',amount:2500,date:'2026-10-05',accountId:'bank',categoryId:'food',...fields })
const workspace = transactions => ({accounts,categories,transactions,obligations:[],obligationPayments:[],applicationSettings:settings})
const validate = value => {validateTransaction(value);validateTransactionReferences(value,new Map(accounts.map(a=>[a.id,a])),new Map(categories.map(c=>[c.id,c])))}

for (const account of accounts) for (const amount of [2500,10000,15000]) test(`${account.type} partial/full/over refund ${amount} returns money without changing opening balance`,()=>{
  const transactions=[expense({accountId:account.id}),refund({accountId:account.id,amount})],before=structuredClone(transactions)
  const expected=account.type==='credit_card'?10000-amount:amount-10000
  assert.equal(calculateAccountBalance(account,transactions),expected)
  if(account.type==='credit_card')assert.equal(calculateAvailableCredit(account,transactions),20000-expected)
  assert.equal(account.openingBalance,0);assert.deepEqual(transactions,before);validate(transactions[1])
})
test('Refund reduces monthly and category expenses without income; cash flow improves through lower spending',()=>{
  const transactions=[expense(),refund(),{...expense(),id:'income',type:'income',categoryId:'salary',amount:20000}]
  const before=structuredClone(transactions)
  assert.equal(calculateMonthlyTotalExpenses(transactions,'2026-10'),7500)
  assert.equal(calculateMonthlyExpensesByCategory(transactions,'2026-10').get('food'),7500)
  assert.equal(calculateMonthlyTotalIncome(transactions,'2026-10'),20000)
  assert.equal(calculateMonthlyTotalIncome(transactions,'2026-10')-calculateMonthlyTotalExpenses(transactions,'2026-10'),12500)
  assert.deepEqual(transactions,before)
})
test('Cross-month refunds leave the original expense month intact and allow negative current net Expenses',()=>{
  const transactions=[expense({date:'2026-09-30'}),refund()]
  assert.equal(calculateMonthlyTotalExpenses(transactions,'2026-09'),10000)
  assert.equal(calculateMonthlyTotalExpenses(transactions,'2026-10'),-2500)
  assert.equal(calculateMonthlyExpensesByCategory(transactions,'2026-10').get('food'),-2500)
  assert.equal(calculateMonthlyTotalIncome(transactions,'2026-10'),0)
})
for(const totalRefund of [10000,15000])test(`Net expenses and category totals are not clamped with refund ${totalRefund}`,()=>{
  const transactions=[expense(),refund({amount:totalRefund})]
  assert.equal(calculateMonthlyTotalExpenses(transactions,'2026-10'),10000-totalRefund)
  assert.equal(calculateMonthlyExpensesByCategory(transactions,'2026-10').get('food'),10000-totalRefund)
})
test('Donut excludes nonpositive category nets and uses positive chart total independently of net Expenses',()=>{
  const categories=[{categoryId:'food',name:'Food',amount:-5000,isUnknown:false},{categoryId:'rent',name:'Rent',amount:10000,isUnknown:false},{categoryId:'zero',name:'Zero',amount:0,isUnknown:false}]
  const before=structuredClone(categories),chartTotal=spendingDonutTotal(categories),slices=spendingDonutSlices(categories,chartTotal)
  assert.equal(chartTotal,10000);assert.equal(chartTotal-5000,5000)
  assert.deepEqual(slices.map(s=>[s.name,s.amount,s.percentage]),[['Rent',10000,100]])
  assert.deepEqual(spendingDonutSegments(slices),[{key:'category:rent',length:100,offset:0}]);assert.deepEqual(categories,before)
  assert.equal(spendingDonutTotal([categories[0]]),0);assert.deepEqual(spendingDonutSlices([categories[0]],0),[])
})
test('Unsafe financial and chart accumulation is rejected rather than rounded or clamped',()=>{
  const maximum=Number.MAX_SAFE_INTEGER
  assert.throws(()=>calculateMonthlyTotalExpenses([refund({amount:maximum}),refund({id:'second',amount:1})],'2026-10'),RangeError)
  assert.throws(()=>calculateAccountBalance({...accounts[0],openingBalance:maximum},[refund({amount:1})]),RangeError)
  assert.throws(()=>spendingDonutTotal([{amount:maximum},{amount:1}]),RangeError)
})
for(const fields of [{amount:0},{amount:-1},{amount:0.5},{amount:Number.MAX_SAFE_INTEGER+1},{amount:NaN},{amount:Infinity},{date:'2026-02-30'},{date:'0000-01-01'},{accountId:''},{categoryId:''},{note:12},{fromAccountId:'cash'},{toAccountId:'cash'},{taxAmountCents:1},{receiptNumber:'receipt'}])test(`Refund shape rejects ${JSON.stringify(fields)}`,()=>{
  assert.throws(()=>validateTransaction(refund(fields)));assert.throws(()=>transactionRecord(refund(fields)))
})
for(const fields of [{accountId:'missing'},{categoryId:'missing'},{categoryId:'salary'}])test(`Refund reference rejects ${JSON.stringify(fields)}`,()=>assert.throws(()=>validate(refund(fields))))
test('Refund has no optional tax/receipt fields, including explicitly present undefined fields in snapshots',()=>{
  for(const key of ['taxAmountCents','receiptNumber','fromAccountId','toAccountId'])assert.throws(()=>transactionRecord(refund({[key]:undefined})))
  assert.deepEqual(transactionRecord(refund({note:'Merchant return'})),refund({note:'Merchant return'}))
})
test('Income stays bank/cash only; card payment stays Transfer and is excluded from spending',()=>{
  const income={...expense(),type:'income',categoryId:'salary',accountId:'credit_card'}
  assert.throws(()=>validate(income),/bank or cash/)
  assert.equal(isEligibleAccount(accounts[2],'income'),false);assert.equal(isEligibleAccount(accounts[2],'refund'),true)
  const transfer={id:'payment',type:'transfer',amount:2500,date:'2026-10-05',fromAccountId:'bank',toAccountId:'credit_card'};validate(transfer)
  assert.equal(calculateMonthlyTotalExpenses([expense({accountId:'credit_card'}),transfer],'2026-10'),10000)
  assert.equal(calculateAccountBalance(accounts[2],[expense({accountId:'credit_card'}),transfer]),7500)
})

const filterRecords=[expense(),refund({accountId:'credit_card',note:'Merchant return'}),refund({id:'other',categoryId:'rent',date:'2026-09-30',amount:100}),{...expense(),id:'income',type:'income',categoryId:'salary'}]
for(const [name,changes,ids] of [
  ['type',{types:['refund']},['refund','other']],['search label',{query:'rEfUnD'},['refund','other']],['account',{accountIds:['credit_card']},['refund']],
  ['category',{categoryIds:['food'],types:['refund']},['refund']],['month',{dateMode:'month',month:'2026-10',types:['refund']},['refund']],
  ['date range',{dateMode:'range',fromDate:'2026-10-05',toDate:'2026-10-05'},['refund']],['amount bounds',{minimum:2000,maximum:2500},['refund']],
  ['search note',{query:'merchant'},['refund']],['search account',{query:'credit_card'},['refund']],['search category',{query:'rent'},['other']]
])test(`Refund filter ${name}`,()=>assert.deepEqual(filterTransactions(filterRecords,accounts,categories,{...emptyTransactionFilters(),...changes}).map(t=>t.id),ids))
for(const currency of ['CAD','USD','EUR'])test(`${currency} refund sign, filter chip, v3 backup and CSV round-trip`,()=>{
  const value=workspace([expense(),refund({accountId:'credit_card',note:'Return, "exact"\ntext'})]);value.applicationSettings={...settings,currencyCode:currency}
  const before=structuredClone(value),backup=createBackup(value,'dark'),restored=restoreSnapshot(parseFullBackup(JSON.stringify(backup)))
  assert.equal(backup.schemaVersion,3);assert.deepEqual(restored,value);assert.deepEqual(value,before)
  assert.ok(signedTransactionAmount(value.transactions[1],currency).startsWith('+'))
  assert.ok(filterChips({...emptyTransactionFilters(),types:['refund']},accounts,categories,currency).some(c=>c.label.includes('Refund')))
  const csv=transactionsCsv(value,currency),source=parseTransactionCsv(csv,currency),rows=previewTransactionCsv(source,{...value,transactions:[]},currency)
  assert.ok(rows.every(row=>row.status==='Ready'));assert.deepEqual(rows.map(row=>row.transaction).sort((a,b)=>a.id.localeCompare(b.id)),value.transactions)
  const record=source.find(row=>row.fields.type==='refund').fields
  for(const field of ['from_account_id','from_account_name','to_account_id','to_account_name','tax_amount','receipt_number'])assert.equal(record[field],'')
  assert.equal(record.category_id,'food');assert.equal(record.account_id,'credit_card')
})
for(const [field,value] of [['category_id','salary'],['account_id','missing'],['amount','0'],['from_account_id','cash'],['to_account_name','Cash'],['tax_amount','1.00'],['receipt_number',"'receipt"]])test(`CSV rejects or requires explicit mapping for bad Refund ${field}`,()=>{
  const snapshot=workspace([refund({accountId:'credit_card'})]),[headers,record]=parseCsv(transactionsCsv(snapshot,'CAD'))
  record[headers.indexOf(field)]=['amount','tax_amount'].includes(field)?value:protectCsvText(value)
  if(field==='account_id')record[headers.indexOf('account_name')]=''
  const [row]=previewTransactionCsv(parseTransactionCsv(writeCsv(headers,[record]),'CAD'),{...snapshot,transactions:[]},'CAD')
  assert.equal(row.status,field==='account_id'?'Needs mapping':'Invalid')
})
test('CSV maps Refund category names only to Expense, with explicit Income mapping rejected',()=>{
  const snapshot=workspace([refund()]),source=parseTransactionCsv(transactionsCsv(snapshot,'CAD'),'CAD')
  source[0].fields.category_id='missing';source[0].fields.category_name=' Food '
  assert.equal(previewTransactionCsv(source,{...snapshot,transactions:[]},'CAD')[0].transaction.categoryId,'food')
  assert.equal(previewTransactionCsv(source,{...snapshot,transactions:[]},'CAD',{2:{categoryId:'salary'}})[0].status,'Invalid')
})
for(const columns of [previousTransactionCsvColumns,legacyTransactionCsvColumns])test(`Older CSV header ${columns.includes('amount_cad')?'amount_cad':'amount'} remains compatible`,()=>{
  const snapshot=workspace([expense()]),[headers,record]=parseCsv(transactionsCsv(snapshot,'CAD'))
  const csv=writeCsv(columns,[columns.map(c=>record[headers.indexOf(c==='amount_cad'?'amount':c)])])
  assert.deepEqual(previewTransactionCsv(parseTransactionCsv(csv,'CAD'),{...snapshot,transactions:[]},'CAD')[0].transaction,expense())
})
for(const version of [1,2,3])test(`Older v${version} backup without Refund remains unchanged`,()=>{
  const snapshot=workspace([expense()]),backup=createBackup(snapshot,'sage')
  if(version<3){backup.schemaVersion=version;delete backup.data.applicationSettings;backup.sections=backup.sections.filter(s=>s!=='applicationSettings')}
  if(version===1){delete backup.data.obligations;delete backup.data.obligationPayments;backup.sections=backup.sections.filter(s=>!['obligations','obligationPayments'].includes(s))}
  assert.deepEqual(restoreSnapshot(parseFullBackup(JSON.stringify(backup))).transactions,snapshot.transactions)
})
test('Shared category name rules trim, reject empty/same-type duplicates and allow cross-type names',()=>{
  assert.ok(categoryNameError('  ','expense',categories))
  assert.ok(categoryNameError(' fOoD ','expense',categories))
  assert.equal(categoryNameError(' Food ','income',categories),null)
  assert.equal(categoryNameError(' New ','expense',categories),null)
})
