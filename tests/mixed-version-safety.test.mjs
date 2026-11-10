import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { auditLinks, businessData } from './fixtures/mixed-version/prototype.mjs'

function linked(prefix='') {
  return {data:{[prefix+'obligationPayments']:[{id:'payment',transactionId:'expense',amountCents:100,paidDate:'2026-10-01'}],
    [prefix+'transactions']:[{id:'expense',type:'expense',amount:100,date:'2026-10-01'}],paymentOperations:[{id:'operation',paymentId:'payment',transactionId:'expense',lifecycle:'applied'}]}}
}
test('Integrity diagnostics accept a complete fixture and leave its data unchanged',()=>{
  const value=linked(),before=structuredClone(value);assert.deepEqual(auditLinks(value),[]);assert.deepEqual(value,before)
})
test('Missing link after old full-record replacement is detectable even with a surviving operation receipt',()=>{
  const value=linked();delete value.data.obligationPayments[0].transactionId
  assert.deepEqual(auditLinks(value),[{kind:'lost-payment-link',paymentId:'payment'}])
})
test('Old payment deletion is detected as a live receipt without its payment',()=>{
  const value=linked();value.data.obligationPayments=[]
  assert.deepEqual(auditLinks(value),[{kind:'missing-payment',paymentId:'payment'}])
})
test('Old financial transaction deletion is detected independently of the unique link index',()=>{
  const value=linked();value.data.transactions=[]
  assert.deepEqual(auditLinks(value),[{kind:'missing-transaction',paymentId:'payment'}])
})
for(const changed of [{amount:101},{date:'2026-10-02'}])test(`Old transaction modification violates the captured payment agreement: ${JSON.stringify(changed)}`,()=>{
  const value=linked();Object.assign(value.data.transactions[0],changed)
  assert.deepEqual(auditLinks(value),[{kind:'mismatched-transaction',paymentId:'payment'}])
})
test('Duplicate live transaction claims are reported rather than considered consistent',()=>{
  const value=linked();value.data.obligationPayments.push({...value.data.obligationPayments[0],id:'second'})
  assert.ok(auditLinks(value).some(row=>row.kind==='duplicate-link'))
})
test('Diagnostics can read isolated canonical stores without treating legacy guard rows as financial data',()=>{
  const value=linked('v4_');value.data.transactions=[{id:'retirement-marker'}]
  assert.deepEqual(auditLinks(value,'v4_'),[])
  assert.equal(businessData(value,'v4_').transactions[0].id,'expense')
})
test('Independent tracking-only historical payments do not imply missing financial transactions',()=>{
  const value=linked();value.data.obligationPayments.push({id:'historical',obligationId:'partial',amountCents:500})
  assert.deepEqual(auditLinks(value),[])
})
test('A retired operation is not interpreted as a request to recreate a deleted payment',()=>{
  const value=linked();value.data.obligationPayments=[];value.data.paymentOperations[0].lifecycle='retired'
  assert.deepEqual(auditLinks(value),[]);assert.deepEqual(value.data.obligationPayments,[])
})
test('Production entry points do not import or advertise the isolated database prototypes',async()=>{
  const app=await readFile(new URL('../src/App.tsx',import.meta.url),'utf8'),database=await readFile(new URL('../src/persistence/database.ts',import.meta.url),'utf8')
  assert.ok(!app.includes('mixed-version')&&!database.includes('mixed-version'))
  assert.deepEqual([...database.matchAll(/this\.version\((\d+)\)/g)].map(match=>Number(match[1])),[1,2,3])
})
