import assert from 'node:assert/strict'
import test from 'node:test'
import { expenseSubtotal, normalizeExpenseDetails, receiptNumberMaxLength } from '../src/domain/expenseDetails.ts'
import { validateTransaction } from '../src/persistence/validation.ts'
import { transactionRecord } from '../src/persistence/snapshotValidation.ts'
import { calculateAccountBalance, calculateMonthlyTotalExpenses, calculateMonthlyTotalIncome } from '../src/domain/calculations.ts'
import { createBackup, validateFullBackup, restoreSnapshot } from '../src/features/dataBackup/backupFormat.ts'
import { transactionsCsv, transactionCsvColumns, previousTransactionCsvColumns, legacyTransactionCsvColumns, parseTransactionCsv, previewTransactionCsv } from '../src/features/dataBackup/transactionCsv.ts'
import { parseCsv, writeCsv, protectCsvText } from '../src/features/dataBackup/csv.ts'

const expense = (details = {}) => ({ id:'expense',type:'expense',amount:11500,date:'2026-10-05',accountId:'bank',categoryId:'food',...details })
const settings = {id:'application',countryCode:'CA',currencyCode:'CAD',profileType:'personal',fiscalYearStartMonth:1,onboardingCompleted:true}
const workspace = (transactions = [expense()]) => ({accounts:[{id:'bank',name:'Bank',type:'bank',openingBalance:100000},{id:'card',name:'Card',type:'credit_card',openingBalance:0}],categories:[{id:'food',name:'Food',type:'expense'},{id:'salary',name:'Salary',type:'income'}],transactions,obligations:[],obligationPayments:[],applicationSettings:settings})

for (const details of [{},{taxAmountCents:1500},{taxAmountCents:11500},{receiptNumber:'INV-2026-1042'},{taxAmountCents:1500,receiptNumber:'RBC/45821'}]) {
  test(`Expense metadata validates ${JSON.stringify(details)}`,()=>{
    const value=expense(details);validateTransaction(value);assert.deepEqual(transactionRecord(value),value)
  })
}
for (const tax of [0,-1,11501,0.1,Number.MAX_SAFE_INTEGER+1,NaN,Infinity,'1500',null]) {
  test(`Tax rejects ${String(tax)}`,()=>assert.throws(()=>transactionRecord(expense({taxAmountCents:tax}))))
}
test('Receipt normalization trims only surrounding whitespace and removes blank values without mutation',()=>{
  const value=expense({receiptNumber:'  INV /  1042 - A  '})
  assert.equal(normalizeExpenseDetails(value).receiptNumber,'INV /  1042 - A')
  assert.equal(value.receiptNumber,'  INV /  1042 - A  ')
  assert.equal(transactionRecord(value).receiptNumber,'INV /  1042 - A')
  assert.ok(!Object.hasOwn(transactionRecord(expense({receiptNumber:' \t\n '})),'receiptNumber'))
  assert.equal(transactionRecord(expense({receiptNumber:'12345'})).receiptNumber,'12345')
})
for (const receipt of [null,123,{},'a'.repeat(receiptNumberMaxLength+1)]) test('Invalid receipt '+JSON.stringify(receipt),()=>assert.throws(()=>transactionRecord(expense({receiptNumber:receipt}))))
test('Receipt length boundary and duplicate merchant numbers are permitted',()=>{
  assert.equal(transactionRecord(expense({receiptNumber:'a'.repeat(receiptNumberMaxLength)})).receiptNumber.length,receiptNumberMaxLength)
  assert.equal(createBackup(workspace([expense({receiptNumber:'123'}),expense({id:'other',receiptNumber:'123'})]),'sage').data.transactions.length,2)
})
for (const type of ['income','transfer']) for (const metadata of [{taxAmountCents:1},{receiptNumber:'123'},{taxAmountCents:1,receiptNumber:'123'},{taxAmountCents:undefined},{receiptNumber:undefined}]) {
  test(`${type} rejects expense fields ${Object.keys(metadata)}`,()=>{
    const value=type==='income'?{...expense(),type,categoryId:'salary',...metadata}:{id:'move',type,amount:11500,date:'2026-10-05',fromAccountId:'bank',toAccountId:'card',...metadata}
    assert.throws(()=>validateTransaction(value),/only allowed/);assert.throws(()=>transactionRecord(value))
  })
}
test('Total paid remains authoritative for bank, card, dashboard and income calculations',()=>{
  const value=expense({taxAmountCents:1500,receiptNumber:'INV-2048'}),data=workspace([value])
  assert.equal(expenseSubtotal(value),10000);assert.equal(expenseSubtotal(expense()),undefined)
  assert.equal(expenseSubtotal(expense({taxAmountCents:11500})),0)
  assert.equal(calculateMonthlyTotalExpenses(data.transactions,'2026-10'),11500)
  assert.equal(calculateMonthlyTotalIncome(data.transactions,'2026-10'),0)
  assert.equal(calculateAccountBalance(data.accounts[0],data.transactions),88500)
  assert.equal(calculateAccountBalance(data.accounts[1],[{...value,accountId:'card'}]),11500)
})
test('V3 JSON round trips tax, receipt, theme and settings exactly without subtotal',()=>{
  const data=workspace([expense({taxAmountCents:1500,receiptNumber:'INV / "quoted" \u96ea'})])
  const file=createBackup(data,'dark'),restored=restoreSnapshot(validateFullBackup(JSON.parse(JSON.stringify(file))))
  assert.equal(file.schemaVersion,3);assert.deepEqual(restored,data);assert.equal(file.preferences.theme,'dark')
  assert.ok(!Object.hasOwn(restored.transactions[0],'subtotal'))
})
for (const version of [1,2,3]) test(`Old backup v${version} without optional Expense metadata stays valid`,()=>{
  const current=createBackup(workspace(),'sage')
  if(version<3){delete current.data.applicationSettings;current.sections=current.sections.filter(s=>s!=='applicationSettings')}
  if(version===1){delete current.data.obligations;delete current.data.obligationPayments;current.sections=current.sections.filter(s=>!['obligations','obligationPayments'].includes(s))}
  current.schemaVersion=version
  const restored=restoreSnapshot(validateFullBackup(current));assert.deepEqual(restored.transactions,[expense()])
})
test('V3 invalid Expense metadata and Income misuse fail complete backup validation',()=>{
  for(const value of [expense({taxAmountCents:11501}),expense({receiptNumber:9}),{...expense({taxAmountCents:1}),type:'income',categoryId:'salary'}]){
    const file=createBackup(workspace(),'sage');file.data.transactions=[value];assert.throws(()=>validateFullBackup(file))
  }
})
for (const currency of ['CAD','USD','EUR']) for (const receipt of ['INV-2048','INV /  1042','"quoted", receipt','\u96ea / \u00e9','=SUM(A1:A2)','+formula','-formula','@formula',"'original"]){
  test(`${currency} tax/receipt CSV exact round trip ${receipt}`,()=>{
    const data=workspace([expense({taxAmountCents:1500,receiptNumber:receipt})]),csv=transactionsCsv(data,currency),[header,row]=parseCsv(csv)
    assert.equal(row[header.indexOf('tax_amount')],'15.00');assert.equal(row[header.indexOf('receipt_number')],protectCsvText(receipt))
    const preview=previewTransactionCsv(parseTransactionCsv(csv,currency),{...data,transactions:[]},currency)
    assert.equal(preview[0].status,'Ready');assert.deepEqual(preview[0].transaction,data.transactions[0])
    assert.equal(previewTransactionCsv(parseTransactionCsv(csv,currency),data,currency)[0].status,'Duplicate')
  })
}
test('CSV absent tax and receipt export blank for all three transaction types',()=>{
  const data=workspace([expense(),{...expense(),id:'income',type:'income',categoryId:'salary'},{id:'move',type:'transfer',amount:100,date:'2026-10-05',fromAccountId:'bank',toAccountId:'card'}])
  const [header,...rows]=parseCsv(transactionsCsv(data,'CAD'))
  assert.ok(rows.every(row=>row[header.indexOf('tax_amount')]===''&&row[header.indexOf('receipt_number')]===''))
  assert.deepEqual(previewTransactionCsv(parseTransactionCsv(transactionsCsv(data,'CAD'),'CAD'),{...data,transactions:[]},'CAD').map(r=>r.status),['Ready','Ready','Ready'])
})
for(const columns of [previousTransactionCsvColumns,legacyTransactionCsvColumns]) test(`Legacy ${columns.includes('amount_cad')?'v1.0 CAD':'v1.1 currency-aware'} CSV remains importable without synthesized metadata`,()=>{
  const [header,...rows]=parseCsv(transactionsCsv(workspace(),'CAD'))
  const csv=writeCsv(columns,rows.map(row=>columns.map(c=>row[header.indexOf(c==='amount_cad'?'amount':c)])))
  const preview=previewTransactionCsv(parseTransactionCsv(csv,'CAD'),{...workspace(),transactions:[]},'CAD')
  assert.equal(preview[0].status,'Ready');assert.deepEqual(preview[0].transaction,expense())
})
for(const [type,tax,receipt] of [['expense','0',''],['expense','-1',''],['expense','115.01',''],['expense','1.001',''],['expense','90071992547409.92',''],['expense','NaN',''],['expense','',9],['income','1',''],['income','','INV'],['transfer','1',''],['transfer','','INV']]){
  test(`CSV invalid metadata ${type} ${tax} ${receipt}`,()=>{
    const value=type==='transfer'?{id:'move',type,amount:11500,date:'2026-10-05',fromAccountId:'bank',toAccountId:'card'}:{...expense(),type,categoryId:type==='income'?'salary':'food'}
    const [header,row]=parseCsv(transactionsCsv(workspace([value]),'CAD'))
    row[header.indexOf('tax_amount')]=tax;row[header.indexOf('receipt_number')]=protectCsvText(typeof receipt==='number'?'a'.repeat(201):receipt)
    const preview=previewTransactionCsv(parseTransactionCsv(writeCsv(header,[row]),'CAD'),{...workspace(),transactions:[]},'CAD')
    assert.equal(preview[0].status,'Invalid');assert.equal(preview[0].transaction,undefined)
  })
}
test('Tax and receipt participate in ID conflict detection and repeated-file conflicts',()=>{
  const data=workspace([expense({taxAmountCents:1500,receiptNumber:'INV'})])
  for(const details of [{taxAmountCents:1400,receiptNumber:'INV'},{taxAmountCents:1500,receiptNumber:'OTHER'},{}]){
    const csv=transactionsCsv(workspace([expense(details)]),'CAD')
    assert.equal(previewTransactionCsv(parseTransactionCsv(csv,'CAD'),data,'CAD')[0].status,'Conflict')
  }
  const csv=transactionsCsv(workspace([expense({taxAmountCents:1500}),expense({taxAmountCents:1400})]),'CAD')
  assert.deepEqual(previewTransactionCsv(parseTransactionCsv(csv,'CAD'),{...data,transactions:[]},'CAD').map(r=>r.status),['Conflict','Conflict'])
})
test('Receipt metadata survives explicit CSV mapping, with exact safe-integer tax cents',()=>{
  const data=workspace([expense({amount:Number.MAX_SAFE_INTEGER,taxAmountCents:Number.MAX_SAFE_INTEGER,receiptNumber:'INV'})])
  const source=parseTransactionCsv(transactionsCsv(data,'CAD'),'CAD');source[0].fields.account_id='missing';source[0].fields.account_name='Unknown'
  assert.equal(previewTransactionCsv(source,{...data,transactions:[]},'CAD')[0].status,'Needs mapping')
  const row=previewTransactionCsv(source,{...data,transactions:[]},'CAD',{2:{accountId:'bank'}})[0]
  assert.equal(row.status,'Ready');assert.deepEqual(row.transaction,data.transactions[0])
})
