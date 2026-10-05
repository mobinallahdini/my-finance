import assert from 'node:assert/strict'
import test from 'node:test'
import { spendingDonutSlices, spendingDonutSegments, spendingPercentage } from '../src/features/dashboard/spendingDonut.ts'
import { calculateMonthlyExpensesByCategory, calculateMonthlyTotalExpenses, calculateMonthlyTotalIncome, calculateAccountBalance } from '../src/domain/calculations.ts'

const category=(id,amount,total,name=id)=>({categoryId:id,name,amount,percentage:amount/total*100,isUnknown:false})
test('Zero expenses has no slices or geometry',()=>{
  assert.deepEqual(spendingDonutSlices([],0),[]);assert.deepEqual(spendingDonutSegments([]),[])
})
test('One category retains exact amount and displays 100% with a full ring',()=>{
  const slices=spendingDonutSlices([category('Food',11500,11500)],11500)
  assert.equal(slices[0].amount,11500);assert.equal(spendingPercentage(slices[0].percentage),'100%')
  assert.deepEqual(spendingDonutSegments(slices),[{key:'category:Food',length:100,offset:0}])
})
test('Three categories descend by cents, retain exact amounts, and reuse one-decimal display percentages',()=>{
  const input=[category('Groceries',26000,120000),category('Eating out',10000,120000),category('Rent',84000,120000)]
  const before=structuredClone(input),slices=spendingDonutSlices(input,120000)
  assert.deepEqual(slices.map(s=>s.name),['Rent','Groceries','Eating out'])
  assert.deepEqual(slices.map(s=>s.amount),[84000,26000,10000])
  assert.deepEqual(slices.map(s=>spendingPercentage(s.percentage)),['70%','21.7%','8.3%'])
  assert.deepEqual(input,before)
})
for(const count of [5,6,8,100])test(`${count} categories preserve every cent with at most five names and Other`,()=>{
  const total=count*(count+1)/2,input=Array.from({length:count},(_,i)=>category(String(i),i+1,total))
  const slices=spendingDonutSlices(input,total)
  assert.equal(slices.length,Math.min(count,6));assert.equal(slices.reduce((sum,s)=>sum+s.amount,0),total)
  assert.deepEqual(slices.filter(s=>!s.isOther).map(s=>s.amount),input.slice(-5).reverse().map(c=>c.amount))
  if(count>5){const other=slices.at(-1);assert.equal(other.name,'Other');assert.equal(other.amount,(count-5)*(count-4)/2);assert.equal(other.percentage,other.amount/total*100)}
})
test('Category ties are deterministic and names cannot collide with the structural Other key',()=>{
  const slices=spendingDonutSlices(['f','e','d','c','b','a'].map(id=>category(id,1,6,'Other')),6)
  assert.deepEqual(slices.slice(0,5).map(s=>s.key),['category:a','category:b','category:c','category:d','category:e'])
  assert.equal(new Set(slices.map(s=>s.key)).size,6)
})
test('Unknown category retains exact amounts and a named slot even below the five largest',()=>{
  const unknown={...category('missing',11500,11500,'Unknown category'),isUnknown:true}
  assert.deepEqual(spendingDonutSlices([unknown],11500).map(s=>[s.name,s.amount]),[['Unknown category',11500]])
  const slices=spendingDonutSlices([unknown,...[1,2,3,4,5].map(i=>category('c'+i,20000,111500))],111500)
  assert.equal(slices.at(-2).name,'Unknown category');assert.equal(slices.at(-2).amount,11500)
  assert.equal(slices.at(-1).amount,20000);assert.equal(slices.at(-1).name,'Other')
  assert.equal(slices.reduce((sum,s)=>sum+s.amount,0),111500)
})
test('Category rename changes the label while preserving geometry and cents',()=>{
  const first=spendingDonutSlices([category('food',11500,11500,'Food')],11500)
  const renamed=spendingDonutSlices([category('food',11500,11500,'Groceries')],11500)
  assert.equal(renamed[0].name,'Groceries');assert.deepEqual(spendingDonutSegments(first),spendingDonutSegments(renamed));assert.equal(renamed[0].amount,11500)
})
test('Rounding percentages never adjusts monetary amounts to force a 100% display sum',()=>{
  const slices=spendingDonutSlices(['a','b','c'].map(id=>category(id,1,3)),3)
  assert.deepEqual(slices.map(s=>spendingPercentage(s.percentage)),['33.3%','33.3%','33.3%'])
  assert.equal(slices.reduce((sum,s)=>sum+s.amount,0),3)
  assert.equal(spendingDonutSegments(slices).reduce((sum,s)=>sum+s.length,0),100)
})
test('Safe-integer limit and tiny shares have finite bounded geometry while exact cents are retained',()=>{
  const total=Number.MAX_SAFE_INTEGER,input=[category('large',total-5,total),...[1,2,3,4,5].map(i=>category('small'+i,1,total))]
  const slices=spendingDonutSlices(input,total),segments=spendingDonutSegments(slices)
  assert.equal(slices.reduce((sum,s)=>sum+s.amount,0),total);assert.equal(slices.at(-1).amount,1)
  assert.ok(segments.every(s=>Number.isFinite(s.length)&&Number.isFinite(s.offset)&&s.length>=0&&s.length<=100&&s.offset>=0&&s.offset<=100))
  assert.equal(segments.reduce((sum,s)=>sum+s.length,0),100)
})
test('Chart uses the existing category aggregation: tax is included once, Income/Transfer/other-month spending excluded',()=>{
  const expense={id:'paid',type:'expense',accountId:'bank',categoryId:'food',amount:11500,taxAmountCents:1500,date:'2026-10-05'}
  const transactions=[expense,{id:'income',type:'income',accountId:'bank',categoryId:'salary',amount:50000,date:'2026-10-05'},
    {id:'transfer',type:'transfer',fromAccountId:'bank',toAccountId:'card',amount:10000,date:'2026-10-05'},
    {...expense,id:'next-month',amount:20000,date:'2026-11-05'}]
  const total=calculateMonthlyTotalExpenses(transactions,'2026-10')
  const categories=Array.from(calculateMonthlyExpensesByCategory(transactions,'2026-10'),([id,amount])=>category(id,amount,total))
  const slices=spendingDonutSlices(categories,total)
  assert.equal(total,11500);assert.deepEqual(slices.map(s=>[s.name,s.amount]),[['food',11500]])
  assert.equal(calculateMonthlyTotalIncome(transactions,'2026-10'),50000)
  assert.equal(calculateAccountBalance({id:'bank',name:'Bank',type:'bank',openingBalance:100000},transactions),108500)
  const november=calculateMonthlyTotalExpenses(transactions,'2026-11');assert.equal(november,20000)
})
