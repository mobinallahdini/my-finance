import assert from 'node:assert/strict'
import test from 'node:test'
import { calculateMonthlyExpensesByCategory, calculateMonthlyTotalExpenses, calculateMonthlyTotalIncome } from '../src/domain/calculations.ts'
import { spendingDonutTotal, spendingDonutSlices, spendingDonutSegments } from '../src/features/dashboard/spendingDonut.ts'
import { emptyTransactionFilters, filterTransactions } from '../src/features/transactions/transactionFiltering.ts'
import { transactionsCsv, parseTransactionCsv, previewTransactionCsv } from '../src/features/dataBackup/transactionCsv.ts'
import { parseCsv } from '../src/features/dataBackup/csv.ts'
import { createBackup, parseFullBackup, restoreSnapshot } from '../src/features/dataBackup/backupFormat.ts'
import { validateTransaction } from '../src/persistence/validation.ts'
import { transactionRecord } from '../src/persistence/snapshotValidation.ts'

const expense = (categoryId, amount, id = categoryId) => ({id,type:'expense',amount,date:'2026-10-06',accountId:'card',categoryId})
const refund = (categoryId, amount, id = 'refund-'+categoryId) => ({...expense(categoryId,amount,id),type:'refund'})
const settings = currencyCode => ({id:'application',countryCode:'DE',currencyCode,fiscalYearStartMonth:7,profileType:'business',onboardingCompleted:true})
const workspace = currency => ({
  accounts:[{id:'card',name:'RBC Visa',type:'credit_card',openingBalance:0,creditLimit:50000},{id:'bank',name:'Main Bank',type:'bank',openingBalance:100000}],
  categories:[{id:'food',name:'Food',type:'expense'},{id:'salary',name:'Salary',type:'income'}],
  transactions:[{...expense('food',11500),taxAmountCents:1500,receiptNumber:'=INV/RC'},{...refund('food',2500),note:'=SUM(A1:A9), "return"\n\u96ea'}],
  obligations:[],obligationPayments:[],applicationSettings:settings(currency),
})

test('RC Refund validation rejects missing required fields and blank/non-string IDs',()=>{
  for(const field of ['id','type','amount','date','accountId','categoryId']){
    const value=refund('food',2500);delete value[field]
    assert.throws(()=>validateTransaction(value));assert.throws(()=>transactionRecord(value))
  }
  for(const id of ['', '   ', null, 12])assert.throws(()=>validateTransaction({...refund('food',2500),id}))
})
test('RC Refund repository boundary rejects cross-type metadata even when undefined or null',()=>{
  for(const field of ['fromAccountId','toAccountId','taxAmountCents','receiptNumber'])for(const value of [undefined,null]){
    const record={...refund('food',2500),[field]:value}
    assert.throws(()=>validateTransaction(record));assert.throws(()=>transactionRecord(record))
  }
})

for(const [name,transactions,net,chart] of [
  ['tax-bearing Expense/refund',[{...expense('food',11500),taxAmountCents:1500,receiptNumber:'RC'},refund('food',2500)],9000,9000],
  ['zero-net category',[expense('food',10000),refund('food',10000)],0,0],
  ['negative category/positive month',[expense('food',2500),refund('food',5000),expense('rent',10000)],7500,10000],
  ['negative category/zero month',[expense('food',2500),refund('food',5000),expense('rent',2500)],0,2500],
  ['negative category/negative month',[expense('food',2500),refund('food',5000),expense('rent',1000)],-1500,1000],
  ['refund-only negative month',[refund('food',10000)],-10000,0],
  ['many categories/Other/unknown/negative',[...Array.from({length:7},(_,i)=>expense('c'+i,1000*(i+1))),expense('unknown',100),refund('c0',2000)],26100,27100],
])test(`RC donut ${name} preserves signed financial totals and nonnegative exact slices`,()=>{
  const before=structuredClone(transactions),totals=calculateMonthlyExpensesByCategory(transactions,'2026-10')
  const categories=Array.from(totals,([categoryId,amount])=>({categoryId,name:categoryId==='unknown'?'Unknown category':categoryId,amount,isUnknown:categoryId==='unknown'}))
  assert.equal(calculateMonthlyTotalExpenses(transactions,'2026-10'),net)
  assert.equal(calculateMonthlyTotalIncome(transactions,'2026-10'),0)
  const total=spendingDonutTotal(categories),slices=spendingDonutSlices(categories,total),segments=spendingDonutSegments(slices)
  assert.equal(total,chart);assert.equal(slices.reduce((sum,s)=>sum+s.amount,0),chart)
  assert.ok(slices.every(s=>s.amount>0&&s.percentage>=0))
  assert.ok(segments.every(s=>s.length>=0&&s.length<=100&&s.offset>=0&&s.offset<=100))
  if(chart)assert.equal(segments.reduce((sum,s)=>sum+s.length,0),100)
  if(name.startsWith('many')){assert.ok(slices.some(s=>s.isOther));assert.ok(slices.some(s=>s.name==='Unknown category'));assert.ok(!slices.some(s=>s.name==='c0'))}
  assert.deepEqual(transactions,before)
})
for(const currency of ['CAD','USD','EUR','GBP'])test(`RC ${currency} Refund CSV/v3 preserves protected text, metadata, duplicates, conflicts and currency guards`,()=>{
  const value=workspace(currency),before=structuredClone(value)
  const backup=createBackup(value,'ocean');assert.equal(backup.schemaVersion,3)
  assert.deepEqual(restoreSnapshot(parseFullBackup(JSON.stringify(backup))),value)
  const csv=transactionsCsv(value,currency),source=parseTransactionCsv(csv,currency)
  const imported=previewTransactionCsv(source,{...value,transactions:[]},currency)
  assert.ok(imported.every(row=>row.status==='Ready'))
  assert.deepEqual(imported.map(row=>row.transaction).sort((a,b)=>a.id.localeCompare(b.id)),[...value.transactions].sort((a,b)=>a.id.localeCompare(b.id)))
  const [headers,...rows]=parseCsv(csv),refundRow=rows.find(r=>r[headers.indexOf('type')]==="'refund")
  assert.ok(refundRow[headers.indexOf('note')].startsWith("'=SUM"))
  assert.ok(previewTransactionCsv(source,value,currency).every(row=>row.status==='Duplicate'))
  const conflict={...value,transactions:value.transactions.map(t=>t.type==='refund'?{...t,amount:t.amount+1}:t)}
  assert.equal(previewTransactionCsv(source,conflict,currency).find(row=>row.fields.type==='refund').status,'Conflict')
  const mapped=structuredClone(source),row=mapped.find(r=>r.fields.type==='refund')
  row.fields.account_id='old-card';row.fields.account_name='unknown';row.fields.category_id='old-food';row.fields.category_name='unknown'
  assert.equal(previewTransactionCsv(mapped,{...value,transactions:[]},currency).find(r=>r.fields.type==='refund').status,'Needs mapping')
  const ready=previewTransactionCsv(mapped,{...value,transactions:[]},currency,{[row.rowNumber]:{accountId:'card',categoryId:'food'}}).find(r=>r.fields.type==='refund')
  assert.deepEqual(ready.transaction,value.transactions[1])
  assert.throws(()=>parseTransactionCsv(csv,currency==='GBP'?'CAD':'GBP'),/workspace/i)
  assert.deepEqual(value,before)
})
test('RC combined filters use OR within groups and AND across type/account/category/date/amount/search',()=>{
  const value=workspace('CAD')
  value.categories.push({id:'rent',name:'Rent',type:'expense'})
  value.transactions.push({...refund('rent',2500,'second'),accountId:'bank'},refund('food',100,'small'),{...refund('food',2500,'september'),date:'2026-09-30'})
  const filters={...emptyTransactionFilters(),types:['refund','income'],accountIds:['card','bank'],categoryIds:['food','rent'],dateMode:'range',fromDate:'2026-10-01',toDate:'2026-10-31',minimum:2000,maximum:3000,query:'REFUND'}
  assert.deepEqual(filterTransactions(value.transactions,value.accounts,value.categories,filters).map(t=>t.id),['refund-food','second'])
  assert.deepEqual(filterTransactions(value.transactions,value.accounts,value.categories,{...filters,accountIds:['bank']}).map(t=>t.id),['second'])
  assert.deepEqual(filterTransactions(value.transactions,value.accounts,value.categories,{...filters,categoryIds:['food']}).map(t=>t.id),['refund-food'])
})
