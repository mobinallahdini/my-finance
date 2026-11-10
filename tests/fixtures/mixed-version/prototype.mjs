// TEST ONLY. Native IndexedDB prototypes, never imported by production code.
// These names are safe only inside the harness's disposable loopback profiles.
export const stores = ['accounts','categories','transactions','obligations','obligationPayments','applicationSettings']
export const prefix = 'v4_'
export const guardField = '__my_finance_retired_v4__'
function localOnly() {
  if (!['127.0.0.1','localhost'].includes(location.hostname)) throw new Error('Compatibility fixtures require a loopback origin.')
}
function event(type, detail = {}) { (globalThis.__prototypeEvents ??= []).push({type,...detail}) }
export async function readDatabase(name = 'my-finance') {
  localOnly()
  return new Promise((resolve,reject) => {
    const request=indexedDB.open(name)
    request.onupgradeneeded=()=>{request.transaction.abort();reject(new Error('Read requires an existing fixture database.'))}
    request.onerror=()=>reject(request.error)
    request.onsuccess=()=>{
      const db=request.result,names=Array.from(db.objectStoreNames),data={},schema=[]
      const tx=db.transaction(names,'readonly')
      for(const name of names){const store=tx.objectStore(name),get=store.getAll();get.onsuccess=()=>{data[name]=get.result}
        schema.push({name,keyPath:store.keyPath,indexes:Array.from(store.indexNames).map(name=>{const index=store.index(name);return {name,keyPath:index.keyPath,unique:index.unique,multiEntry:index.multiEntry}})})}
      tx.oncomplete=()=>{const version=db.version;db.close();resolve({name,version,data,schema})}
      tx.onabort=()=>{db.close();reject(tx.error)}
    }
  })
}
export function businessData(state, storePrefix = '') {
  return Object.fromEntries(stores.map(name=>[name,state.data[storePrefix+name]??[]]))
}
function addLinksIndex(store) {
  store.createIndex('transactionId','transactionId',{unique:true})
  store.createIndex('creationOperationId','creationOperationId',{unique:true})
}
/** Mode additive is the 5A proposal; guarded/rename-only are competing storage prototypes. */
export async function upgrade({mode='additive',failAfter=0,failure='AbortError',holdBeforeCommit=false}={}) {
  localOnly()
  if(!['additive','guarded','rename-only'].includes(mode))throw new Error('Unknown test prototype')
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('my-finance',40)
    request.onblocked=()=>event('blocked',{mode})
    request.onerror=()=>reject(request.error)
    request.onupgradeneeded=upgradeEvent=>{
      const db=request.result,tx=request.transaction
      if(upgradeEvent.oldVersion!==30){tx.abort();return}
      const control=db.createObjectStore('applicationControl',{keyPath:'id'})
      control.add({id:'workspace',epoch:crypto.randomUUID(),mode,stage:'committed'})
      db.createObjectStore('paymentOperations',{keyPath:'id'}).createIndex('paymentId','paymentId')
      let steps=0
      function checkpoint(){
        steps++;event('migration-step',{mode,step:steps})
        if(failAfter===steps){event('injected-failure',{name:failure});tx.abort();return false}
        return true
      }
      if(mode==='additive'){
        addLinksIndex(tx.objectStore('obligationPayments'))
        if(!checkpoint())return
      }else{
        for(const name of stores){
          const original=tx.objectStore(name)
          const indexes=Array.from(original.indexNames).map(name=>{const index=original.index(name);return {name,keyPath:index.keyPath,unique:index.unique,multiEntry:index.multiEntry}})
          original.name=prefix+name
          if(mode==='guarded'){
            const guard=db.createObjectStore(name,{keyPath:[guardField,'id']})
            for(const index of indexes)guard.createIndex(index.name,index.keyPath,{unique:index.unique,multiEntry:index.multiEntry})
            // Counts as data in the old bootstrap, causing its attempted settings
            // write to fail on the guard key. This marker is UX support, not the fence.
            if(name==='accounts')guard.add({[guardField]:'retired',id:'__retired__'})
          }
          if(!checkpoint())return
        }
        addLinksIndex(tx.objectStore(prefix+'obligationPayments'))
      }
      if(holdBeforeCommit){
        globalThis.__holdUpgrade=true;event('held-upgrade',{mode})
        const keepAlive=()=>{const get=control.get('workspace');get.onsuccess=()=>{if(globalThis.__holdUpgrade)keepAlive()}}
        keepAlive()
      }
    }
    request.onsuccess=()=>{
      const db=request.result,names=Array.from(db.objectStoreNames),expected=mode==='additive'?'':prefix
      if(!names.includes('applicationControl')||!names.includes('paymentOperations')||!stores.every(name=>names.includes(expected+name))){db.close();reject(new Error('PrototypeLayoutMismatch'));return}
      const tx=db.transaction([...stores.map(name=>expected+name),'applicationControl','paymentOperations',...(mode==='guarded'?stores:[])],'readonly')
      const get=tx.objectStore('applicationControl').get('workspace');let matches=true
      get.onsuccess=()=>{matches=matches&&get.result?.mode===mode&&get.result?.stage==='committed'&&typeof get.result?.epoch==='string'&&get.result.epoch.length>0}
      if(mode==='guarded'){
        for(const name of stores){
          if(JSON.stringify(tx.objectStore(name).keyPath)!==JSON.stringify([guardField,'id']))matches=false
          if(tx.objectStore(prefix+name).keyPath!=='id')matches=false
        }
        const payments=tx.objectStore(prefix+'obligationPayments')
        for(const name of ['transactionId','creationOperationId'])if(!payments.indexNames.contains(name)||!payments.index(name).unique||payments.index(name).keyPath!==name)matches=false
        for(const name of ['applicationControl','paymentOperations'])if(tx.objectStore(name).keyPath!=='id')matches=false
      }
      tx.oncomplete=()=>{const version=db.version;db.close();if(!matches){reject(new Error('PrototypeLayoutMismatch'));return}event('upgraded',{mode,version});resolve(true)}
      tx.onabort=()=>{db.close();reject(tx.error)}
    }
  })
}
async function openExisting(name) {
  localOnly()
  return new Promise((resolve,reject)=>{const request=indexedDB.open(name);request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result)})
}
/** Explicit fixture setup after migration: link existing transactions, post no money. */
export async function seedLinks({name='my-finance',storePrefix=''}={}) {
  const db=await openExisting(name)
  return new Promise((resolve,reject)=>{
    const tx=db.transaction([storePrefix+'obligations',storePrefix+'obligationPayments','paymentOperations'],'readwrite')
    tx.objectStore(storePrefix+'obligations').add({id:'v13-installment',type:'installment',name:'Synthetic prototype only',originalAmountCents:100000,scheduledPaymentCents:25000,dueDay:15,startMonth:'2026-10',isActive:true})
    for(const [id,transactionId,amountCents,paidDate,financialMode]of [
      ['v13-expense-payment','card-purchase',25000,'2026-10-03','expense'],
      ['v13-transfer-payment','repay-debt',20000,'2026-10-04','card_transfer'],
    ]){
      tx.objectStore('paymentOperations').add({id:'operation-'+id,paymentId:id,transactionId,lifecycle:'applied'})
      tx.objectStore(storePrefix+'obligationPayments').add({id,obligationId:'v13-installment',dueMonth:'2026-10',paidDate,amountCents,
        transactionId,creationOperationId:'operation-'+id,financialMode,linkOwnership:'existing_transaction',revision:0})
    }
    tx.oncomplete=()=>{db.close();resolve(true)};tx.onabort=()=>{db.close();reject(tx.error)}
  })
}
export async function claimDuplicate({name='my-finance',storePrefix=''}={}) {
  const db=await openExisting(name)
  return new Promise((resolve,reject)=>{
    const tx=db.transaction([storePrefix+'obligationPayments','paymentOperations'],'readwrite')
    tx.objectStore('paymentOperations').add({id:'duplicate-operation',paymentId:'duplicate-payment',transactionId:'card-purchase',lifecycle:'applied'})
    tx.objectStore(storePrefix+'obligationPayments').add({id:'duplicate-payment',obligationId:'v13-installment',dueMonth:'2026-10',paidDate:'2026-10-03',amountCents:25000,
      transactionId:'card-purchase',creationOperationId:'duplicate-operation',financialMode:'expense',linkOwnership:'existing_transaction'})
    tx.oncomplete=()=>{db.close();resolve(true)};tx.onabort=()=>{db.close();reject(tx.error)}
  })
}
/** Read-only integrity diagnostics for the proposed fixture links, not a repairer. */
export function auditLinks(state,storePrefix='') {
  const data=businessData(state,storePrefix),payments=new Map(data.obligationPayments.map(row=>[row.id,row])),transactions=new Map(data.transactions.map(row=>[row.id,row]))
  const problems=[],claimed=new Set()
  for(const payment of payments.values())if(payment.transactionId){
    if(claimed.has(payment.transactionId))problems.push({kind:'duplicate-link',paymentId:payment.id})
    claimed.add(payment.transactionId)
    const transaction=transactions.get(payment.transactionId)
    if(!transaction)problems.push({kind:'missing-transaction',paymentId:payment.id})
    else if(transaction.amount!==payment.amountCents||transaction.date!==payment.paidDate)problems.push({kind:'mismatched-transaction',paymentId:payment.id})
  }
  for(const receipt of state.data.paymentOperations??[])if(receipt.lifecycle==='applied'){
    const payment=payments.get(receipt.paymentId)
    if(!payment)problems.push({kind:'missing-payment',paymentId:receipt.paymentId})
    else if(payment.transactionId!==receipt.transactionId)problems.push({kind:'lost-payment-link',paymentId:receipt.paymentId})
  }
  return problems
}
function canonical(data){return JSON.stringify(Object.fromEntries(stores.map(name=>[name,(data[name]??[]).map(row=>Object.fromEntries(Object.entries(row).sort(([a],[b])=>a<b?-1:a>b?1:0))).sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)])))}
/** Alternative two-database copy. Deliberately does NOT claim to retire the source. */
export async function copyToNamespace() {
  localOnly()
  const source=await readDatabase(),input=businessData(source),sourceCanonical=canonical(input)
  const db=await new Promise((resolve,reject)=>{
    const request=indexedDB.open('my-finance-v4-prototype',40)
    request.onupgradeneeded=()=>{
      for(const name of stores)request.result.createObjectStore(name,{keyPath:'id'})
      addLinksIndex(request.transaction.objectStore('obligationPayments'))
      request.result.createObjectStore('paymentOperations',{keyPath:'id'})
      request.result.createObjectStore('applicationControl',{keyPath:'id'})
    }
    request.onerror=()=>reject(request.error);request.onsuccess=()=>resolve(request.result)
  })
  return new Promise((resolve,reject)=>{
    const tx=db.transaction([...stores,'applicationControl'],'readwrite'),control=tx.objectStore('applicationControl'),get=control.get('workspace')
    let conflict=false
    get.onsuccess=()=>{
      if(get.result){if(get.result.sourceCanonical!==sourceCanonical){conflict=true;tx.abort()}return}
      for(const name of stores)for(const row of input[name])tx.objectStore(name).add(row)
      control.add({id:'workspace',sourceCanonical,stage:'copied',epoch:crypto.randomUUID()})
    }
    tx.oncomplete=()=>{db.close();resolve(true)};tx.onabort=()=>{db.close();reject(conflict?new Error('MigrationSourceChanged'):tx.error)}
  })
}
/** Smoke-test binding a new Dexie client only AFTER the native gate completes. */
export async function bindCanonicalDexie() {
  localOnly()
  const Dexie=(await import('/node_modules/dexie/dist/dexie.mjs')).default
  const legacy={accounts:'id',categories:'id, type',transactions:'id, date, type, accountId, fromAccountId, toAccountId, categoryId',
    obligations:'id, type, startMonth',obligationPayments:'id, obligationId, dueMonth, [obligationId+dueMonth]',applicationSettings:'id'}
  const schema={applicationControl:'id',paymentOperations:'id, paymentId'}
  for(const [name,definition]of Object.entries(legacy)){
    schema[name]=definition.replace(/^id/,`[${guardField}+id]`)
    schema[prefix+name]=definition+(name==='obligationPayments'?', &transactionId, &creationOperationId':'')
  }
  const db=new Dexie('my-finance');db.version(4).stores(schema);await db.open()
  const data=await db.transaction('r',stores.map(name=>db.table(prefix+name)),async()=>{
    const data={};for(const name of stores)data[name]=await db.table(prefix+name).toArray();return data
  })
  const version=db.backendDB().version;db.close();return {version,data}
}
