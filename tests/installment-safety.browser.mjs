// Real v1.2 production -> candidate baseline; synthetic data and disposable profiles only.
import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { createServer as httpServer } from 'node:http'
import { runInNewContext } from 'node:vm'
import { setTimeout as delay } from 'node:timers/promises'
import { build, createServer } from 'vite'
import * as financial from '../src/domain/calculations.ts'
import * as obligations from '../src/domain/obligationCalculations.ts'
import { historical, businessStores, canonicalRecords, deriveHistoricalBaseline, expectedHistoricalBaseline, historicalBackup } from './helpers/installmentBaseline.mjs'
import { verifyUpgradedOfflineReports } from './helpers/reportingUpgrade.mjs'

const profile = await mkdtemp(join(tmpdir(), 'my-finance-installment-safety-profile-'))
const artifacts = await mkdtemp(join(tmpdir(), 'my-finance-installment-safety-review-'))
const run = promisify(execFile), source = join(artifacts, 'v12-source'), archive = join(artifacts, 'v12.tar'), releasedBuild = join(artifacts, 'v12-dist')
const expectedDexieVersion = Number(process.env.INSTALLMENT_EXPECTED_DEXIE_VERSION ?? 3)
assert.ok(Number.isInteger(expectedDexieVersion) && expectedDexieVersion >= 3)
const results = [], exceptions = [], connections = []
let browser, production, development, directory = releasedBuild
function passed(name) { results.push(name); console.log(`PASS ${name}`) }
function connection(url) {
  const socket = new WebSocket(url), pending = new Map(); let sequence = 0
  const opened = new Promise((resolveOpen,reject) => { socket.onopen=resolveOpen; socket.onerror=reject })
  socket.onmessage = ({data}) => {
    const response=JSON.parse(data), promise=pending.get(response.id)
    if(promise){pending.delete(response.id);if(response.error)promise.reject(new Error(JSON.stringify(response.error)));else promise.resolve(response.result)}
    if(response.method==='Runtime.exceptionThrown')exceptions.push(response.params.exceptionDetails.exception?.description??response.params.exceptionDetails.text)
  }
  const client={socket,async send(method,params={}){await opened;return new Promise((resolvePromise,reject)=>{const id=++sequence;pending.set(id,{resolve:resolvePromise,reject});socket.send(JSON.stringify({id,method,params}))})}}
  connections.push(client); return client
}
async function evaluate(client, expression) {
  const response=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})
  if(response.exceptionDetails)throw new Error(response.exceptionDetails.exception?.description??response.exceptionDetails.text)
  return response.result.value
}
async function wait(client, expression) {
  for(let i=0;i<300;i++){if(await evaluate(client,expression))return;await delay(50)}
  throw new Error('Timed out: '+expression)
}
async function check(client, expression, name) { assert.ok(await evaluate(client,`Boolean(${expression})`),name);passed(name) }
async function navigate(client,url){await client.send('Page.navigate',{url});await wait(client,`document.readyState==='complete' && location.href===${JSON.stringify(url)}`)}
async function stored(client) {
  return evaluate(client,`new Promise((resolveSnapshot,reject)=>{
    const request=indexedDB.open('my-finance');request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const db=request.result,names=Array.from(db.objectStoreNames).sort(),data={};const tx=db.transaction(names,'readonly');
      const schema=names.map(name=>{const store=tx.objectStore(name),get=store.getAll();get.onsuccess=()=>{data[name]=get.result};
        return {name,keyPath:store.keyPath,autoIncrement:store.autoIncrement,indexes:Array.from(store.indexNames).map(name=>{const index=store.index(name);return {name,keyPath:index.keyPath,unique:index.unique,multiEntry:index.multiEntry}})};
      });tx.oncomplete=()=>{const version=db.version;db.close();resolveSnapshot({version,schema,data,preferences:{...localStorage}})};tx.onabort=()=>{db.close();reject(tx.error)};
    };
  })`)
}
function workspace(snapshot){return {...snapshot.data,applicationSettings:snapshot.data.applicationSettings?.[0]}}
async function seedReleasedDatabase(client, expectedNativeVersion = historical.release.nativeVersion) {
  await evaluate(client,`new Promise((done,reject)=>{
    const request=indexedDB.open('my-finance');request.onerror=()=>reject(request.error);request.onsuccess=()=>{
      const db=request.result;if(db.version!==${expectedNativeVersion})throw new Error('Unexpected fixture database version');
      const input=${JSON.stringify(canonicalRecords(historical.workspace))},names=Object.keys(input),tx=db.transaction(names,'readwrite');
      for(const name of names)for(const row of input[name])tx.objectStore(name).add(row);
      tx.oncomplete=()=>{db.close();localStorage.setItem('my-finance-theme',${JSON.stringify(historical.theme)});localStorage.setItem('safety-sentinel','synthetic-only');done(true)};
      tx.onabort=()=>{db.close();reject(tx.error)};
    };
  })`)
}
async function ready(client,selector) {
  await wait(client,`!!document.querySelector(${JSON.stringify(selector)}) && !document.querySelector('[aria-busy="true"], .account-loading, .dashboard-status, .obligations-section [role="status"]')`)
  await evaluate(client,'new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(()=>done(true))))')
}
async function presentation(client,appUrl) {
  const output={}
  for(const [key,hash,selector] of [['home','home','.dashboard-summary'],['accounts','accounts','.accounts-section'],
    ['obligations','more/bills-installments','.obligation-summary'],...['partial','completed','overpaid','inactive'].map(id=>[id,'more/bills-installments/'+id,'.obligation-facts'])]){
    await evaluate(client,`location.hash=${JSON.stringify(hash)}`);await ready(client,selector)
    output[key]=await evaluate(client,key==='accounts'
      ? `[...document.querySelectorAll('.account-balances')].map(element=>element.textContent)`
      : `document.querySelector(${JSON.stringify(selector)}).textContent`)
  }
  assert.ok(appUrl)
  return output
}
function compareHistorical(snapshot, label) {
  assert.deepEqual(canonicalRecords(snapshot.data),canonicalRecords(historical.workspace),label+': all original records and optional fields')
  assert.deepEqual(deriveHistoricalBaseline(workspace(snapshot),financial,obligations),expectedHistoricalBaseline(),label+': exact account and tracking values')
  assert.equal(snapshot.preferences['my-finance-theme'],historical.theme)
  assert.equal(snapshot.preferences['safety-sentinel'],'synthetic-only')
  passed(label)
}
try {
  const commit=(await run('git',['rev-parse',historical.release.tag+'^{commit}'],{windowsHide:true})).stdout.trim()
  assert.equal(commit,historical.release.commit,'Historical fixture is pinned to the actual immutable release commit')
  await mkdir(source);await run('git',['archive','--format=tar','--output='+archive,historical.release.tag],{windowsHide:true})
  await run('tar',['-xf',archive,'-C',source],{windowsHide:true})
  await symlink(resolve('node_modules'),join(source,'node_modules'),process.platform==='win32'?'junction':'dir')
  const releasedFinancial=await import(pathToFileURL(join(source,'src/domain/calculations.ts'))),releasedObligations=await import(pathToFileURL(join(source,'src/domain/obligationCalculations.ts')))
  const releasedValidation=await import(pathToFileURL(join(source,'src/persistence/snapshotValidation.ts'))),releasedBackup=await import(pathToFileURL(join(source,'src/features/dataBackup/backupFormat.ts')))
  assert.deepEqual(releasedValidation.validateWorkspaceSnapshot(structuredClone(historical.workspace)),historical.workspace)
  assert.deepEqual(deriveHistoricalBaseline(historical.workspace,releasedFinancial,releasedObligations),expectedHistoricalBaseline())
  passed('Fixture and independently fixed expectations validate against the actual released v1.2.0 modules')
  for(const version of [1,2,3]){
    const backup=historicalBackup(version);const restored=releasedBackup.restoreSnapshot(releasedBackup.parseFullBackup(JSON.stringify(backup)),'DE')
    assert.deepEqual(restored.transactions,backup.data.transactions);assert.deepEqual(restored.obligationPayments,backup.data.obligationPayments??[])
    passed(`Full Backup v${version} compatibility projection is accepted by the actual v1.2.0 parser`)
  }
  const databaseSource=await readFile(join(source,'src/persistence/database.ts'),'utf8')
  const schemas=Object.fromEntries([...databaseSource.matchAll(/this\.version\((\d+)\)\.stores\((\{[\s\S]*?\})\)/g)].map(match=>[match[1],runInNewContext('('+match[2]+')')]))
  assert.deepEqual(Object.keys(schemas),['1','2','3'])
  await build({root:source,configFile:join(source,'vite.config.ts'),build:{outDir:releasedBuild,emptyOutDir:true}})
  const oldWorker=await readFile(join(releasedBuild,'sw.js'),'utf8'),newWorker=await readFile(resolve('dist/sw.js'),'utf8')
  assert.notEqual(oldWorker,newWorker,'Upgrade exercises different real application asset revisions')
  const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'}
  production=httpServer(async(request,response)=>{
    const url=new URL(request.url,'http://localhost')
    if(url.pathname==='/safety-probe.html'){response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});response.end('<!doctype html><title>Disposable safety probe</title>');return}
    const file=resolve(directory,url.pathname.replace(/^\/my-finance\//,'')||'index.html')
    if(!file.startsWith(resolve(directory)+sep)){response.writeHead(403);response.end();return}
    try{const content=await readFile(file);response.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});response.end(content)}catch{response.writeHead(404);response.end()}
  })
  await new Promise(done=>production.listen(0,'127.0.0.1',done))
  const origin=`http://127.0.0.1:${production.address().port}`,appUrl=origin+'/my-finance/'
  const chrome=process.env.CHROME_BIN??(process.platform==='win32'?'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe':'google-chrome')
  browser=spawn(chrome,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-extensions','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:'ignore'})
  let launchError,port;browser.on('error',error=>{launchError=error})
  for(let i=0;i<200;i++){if(launchError)throw launchError;try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break}catch{await delay(50)}}
  assert.ok(port)
  const debug=`http://127.0.0.1:${port}`,pages=await(await fetch(debug+'/json/list')).json(),client=connection(pages.find(page=>page.type==='page').webSocketDebuggerUrl)
  const browserClient=connection((await(await fetch(debug+'/json/version')).json()).webSocketDebuggerUrl)
  await client.send('Page.enable');await client.send('Runtime.enable');await client.send('Emulation.setTimezoneOverride',{timezoneId:'America/Toronto'})
  await client.send('Page.addScriptToEvaluateOnNewDocument',{source:`
    const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-10-20T16:00:00Z']))}};
    window.__safetyWrites=[];window.__onboardingSeen=false;
    for(const method of ['add','put','delete','clear']){const original=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(...args){window.__safetyWrites.push(this.name+':'+method);return original.apply(this,args)}}
    new MutationObserver(()=>{if(document.querySelector('.finance-onboarding'))window.__onboardingSeen=true}).observe(document,{subtree:true,childList:true});
  `})
  await navigate(client,appUrl+'#home');await wait(client,`!!document.querySelector('.finance-onboarding')`)
  const created=await stored(client)
  assert.equal(created.version,30);assert.deepEqual(created.schema.map(row=>row.name),[...businessStores].sort())
  passed('Actual released production app creates the genuine v3/native-30 six-store database')
  await navigate(client,origin+'/safety-probe.html');await seedReleasedDatabase(client)
  await navigate(client,appUrl+'#home');await ready(client,'.dashboard-summary')
  await wait(client,`navigator.serviceWorker.getRegistration().then(registration=>registration?.active?.state==='activated')`)
  await client.send('Page.reload');await ready(client,'.dashboard-summary');await wait(client,'!!navigator.serviceWorker.controller')
  const before=await stored(client);compareHistorical(before,'Released v1.2 database contains the complete historical fixture with exact derived values')
  const beforePresentation=await presentation(client,appUrl)
  await check(client,`!window.__onboardingSeen && window.__safetyWrites.length===0`,'Released app reads historical payments without onboarding reset or financial writes')
  // Keep a second real old app client open while the candidate worker installs.
  const peerTarget=await client.send('Target.createTarget',{url:appUrl+'#accounts'})
  const peerPages=await(await fetch(debug+'/json/list')).json(),peer=connection(peerPages.find(page=>page.id===peerTarget.targetId).webSocketDebuggerUrl)
  await peer.send('Page.enable');await ready(peer,'.accounts-section')
  directory=resolve('dist');await evaluate(client,'navigator.serviceWorker.getRegistration().then(registration=>registration.update())')
  await wait(client,`navigator.serviceWorker.getRegistration().then(registration=>registration?.waiting?.state==='installed')`)
  compareHistorical(await stored(client),'Installing candidate code with two old PWA clients changes no historical records')
  await navigate(client,origin+'/safety-probe.html')
  await check(peer,`navigator.serviceWorker.getRegistration().then(registration=>!!registration.waiting)`,'A second old PWA tab prevents worker activation after the first leaves')
  await client.send('Target.closeTarget',{targetId:peerTarget.targetId});peer.socket.close()
  await wait(client,`navigator.serviceWorker.getRegistration(${JSON.stringify(appUrl)}).then(registration=>registration?.active?.state==='activated'&&!registration.waiting&&!registration.installing)`)
  await navigate(client,appUrl+'#home');await ready(client,'.dashboard-summary')
  const after=await stored(client);compareHistorical(after,'Candidate startup preserves all transactions, payments, balances, principal, categories and settings')
  assert.deepEqual(after.preferences,before.preferences)
  assert.equal(after.version,expectedDexieVersion*10)
  for(const oldStore of before.schema){const current=after.schema.find(row=>row.name===oldStore.name);assert.ok(current);assert.equal(current.keyPath,oldStore.keyPath);for(const index of oldStore.indexes)assert.deepEqual(current.indexes.find(row=>row.name===index.name),index)}
  passed('Declared candidate schema version and every historical primary key/index remain correct')
  const afterPresentation=await presentation(client,appUrl);assert.deepEqual(afterPresentation,beforePresentation)
  passed('Released and candidate UI show identical Home, card debt/credit, bill and installment values')
  await check(client,`!window.__onboardingSeen && window.__safetyWrites.length===0 && localStorage.getItem('my-finance-theme')==='ocean'`,'Upgrade needs no manual backup, creates no financial records, preserves theme and skips onboarding')
  const currentAssets=await evaluate(client,`[...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(element=>element.src||element.href)`)
  assert.ok(currentAssets.some(url=>url.includes('/assets/')))
  await evaluate(client,`location.hash='more/reports'`);await ready(client,'.report-overview')
  passed('Candidate-specific Financial Reports route proves the new application shell is active')
  await client.send('Network.enable');await client.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1})
  await client.send('Page.reload');await ready(client,'.report-overview');compareHistorical(await stored(client),'Offline candidate reload preserves the historical baseline')
  await verifyUpgradedOfflineReports({client,evaluate:expression=>evaluate(client,expression),wait:expression=>wait(client,expression),stored:()=>stored(client),passed,artifacts})
  await client.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
  // Current repositories, failure rollback and library compatibility probes use another origin.
  development=await createServer({server:{host:'127.0.0.1',port:0}});await development.listen()
  const devUrl=`http://127.0.0.1:${development.httpServer.address().port}/`
  await navigate(client,devUrl+'src/domain/README.md');await evaluate(client,`import('/src/persistence/database.ts').then(module=>module.database.open()).then(()=>true)`)
  await seedReleasedDatabase(client,expectedDexieVersion*10)
  const tracking=await evaluate(client,`(async()=>{
    const {database}=await import('/src/persistence/database.ts'),{obligationPaymentsRepository:payments}=await import('/src/persistence/obligationRepositories.ts');
    const financial=()=>database.transaction('r',database.accounts,database.categories,database.transactions,async()=>({accounts:await database.accounts.toArray(),categories:await database.categories.toArray(),transactions:await database.transactions.toArray()}));
    const original=await financial(),output=[];const equal=(left,right)=>JSON.stringify(left)===JSON.stringify(right);
    const record={id:'new-tracking-only',obligationId:'partial',dueMonth:'2026-10',paidDate:'2026-10-22',amountCents:4000};
    await payments.add(record);output.push(equal(await financial(),original));
    try{await payments.add(record);output.push(false)}catch(error){output.push(error.name==='ConstraintError')}
    await payments.update({...record,amountCents:5000,paidDate:'2026-11-10'});output.push(equal(await financial(),original));
    try{await payments.update({...record,transactionId:'card-purchase'});output.push(false)}catch{output.push(equal(await payments.get(record.id),{...record,amountCents:5000,paidDate:'2026-11-10'}))}
    await payments.delete(record.id);await payments.delete(record.id);output.push(equal(await financial(),original));
    return output;
  })()`)
  assert.ok(tracking.every(Boolean));passed('Tracking-only add/update/delete, duplicate IDs and rejected future links leave the financial ledger unchanged')
  compareHistorical(await stored(client),'Tracking-only lifecycle restores the original complete baseline')
  for(const failure of ['AbortError','QuotaExceededError']){
    const outcome=await evaluate(client,`(async()=>{
      const {database}=await import('/src/persistence/database.ts'),backup=await import('/src/persistence/dataBackup.ts');
      const before=await backup.readBackupSource(),original=database.obligationPayments.bulkAdd;
      database.obligationPayments.bulkAdd=function(rows){return original.call(this,rows).then(()=>{throw new DOMException('Injected test-only failure','${failure}')})};
      let rejected=false;try{await backup.replaceWorkspaceSnapshot({...before.snapshot,accounts:before.snapshot.accounts.map(row=>({...row,openingBalance:row.openingBalance+1})),applicationSettings:{...before.snapshot.applicationSettings,countryCode:'CA'}})}catch{rejected=true}finally{database.obligationPayments.bulkAdd=original}
      return rejected;
    })()`)
    assert.ok(outcome);compareHistorical(await stored(client),`Injected ${failure} after restore writes rolls all six stores and settings back`)
  }
  const probe=await evaluate(client,`(async()=>{
    const Dexie=(await import('/node_modules/dexie/dist/dexie.mjs')).default;
    const old=new Dexie('installment-compatibility-probe');old.version(1).stores({items:'id'});await old.open();await old.items.add({id:'record',amount:1});
    const current=new Dexie('installment-compatibility-probe');current.version(1).stores({items:'id'});current.version(2).stores({items:'id,&futureLink',receipts:'id'});await current.open();
    await current.items.put({id:'record',amount:1,futureLink:'preserve-me'});await current.receipts.add({id:'receipt',recordId:'record'});
    await old.items.put({id:'record',amount:2});const item=await current.items.get('record'),receipt=await current.receipts.get('receipt');
    await old.items.delete('record');
    const result={oldCanWriteNewerDatabase:item.amount===2,oldPutErasesUnknownField:!Object.hasOwn(item,'futureLink'),receiptSurvives:receipt.id==='receipt',
      uniqueLinkIndex:current.items.schema.idxByName.futureLink.unique,oldCanDeleteLinkedRecord:!(await current.items.get('record')),receiptOrphaned:!!(await current.receipts.get('receipt')),nativeVersion:current.backendDB().version};
    old.close();current.close();return result;
  })()`)
  assert.deepEqual(probe,{oldCanWriteNewerDatabase:true,oldPutErasesUnknownField:true,receiptSurvives:true,uniqueLinkIndex:true,oldCanDeleteLinkedRecord:true,receiptOrphaned:true,nativeVersion:20})
  passed('Generic disposable probe proves old Dexie can reopen a newer database and erase unknown fields: versionchange alone is not a write fence')
  // Exercise the actual released v1/v2 declarations in isolated browser contexts.
  for(const version of [1,2]){
    const context=await browserClient.send('Target.createBrowserContext'),target=await browserClient.send('Target.createTarget',{url:devUrl+'src/domain/README.md',browserContextId:context.browserContextId})
    const entries=await(await fetch(debug+'/json/list')).json(),legacy=connection(entries.find(page=>page.id===target.targetId).webSocketDebuggerUrl)
    await legacy.send('Page.enable');await wait(legacy,`document.readyState==='complete' && location.href===${JSON.stringify(devUrl+'src/domain/README.md')}`)
    const legacyData=historicalBackup(version).data
    await evaluate(legacy,`(async()=>{
      const Dexie=(await import('/node_modules/dexie/dist/dexie.mjs')).default,db=new Dexie('my-finance'),schemas=${JSON.stringify(schemas)};
      for(let version=1;version<=${version};version++)db.version(version).stores(schemas[version]);await db.open();
      const fixture=${JSON.stringify(legacyData)};await db.transaction('rw',db.tables,async()=>{for(const [name,rows]of Object.entries(fixture))await db.table(name).bulkAdd(rows)});
      db.close();localStorage.setItem('my-finance-theme','dark');return true;
    })()`)
    const legacyBefore=await stored(legacy)
    await evaluate(legacy,`import('/src/persistence/applicationSettings.ts').then(module=>module.bootstrapApplicationSettings()).then(()=>true)`)
    const legacyAfter=await stored(legacy)
    for(const name of Object.keys(legacyBefore.data))assert.deepEqual(legacyAfter.data[name],legacyBefore.data[name])
    assert.equal(legacyAfter.version,expectedDexieVersion*10);assert.equal(legacyAfter.preferences['my-finance-theme'],'dark')
    assert.equal(legacyAfter.data.applicationSettings[0].onboardingCompleted,true)
    assert.equal(legacyAfter.data.applicationSettings[0].currencyCode,'CAD')
    assert.deepEqual(legacyAfter.data.obligationPayments,version===1?[]:legacyBefore.data.obligationPayments)
    for(const account of legacyData.accounts)assert.equal(financial.calculateAccountBalance(account,legacyAfter.data.transactions),historical.expected.preRefundLegacyBalancesCents[account.id])
    passed(`Released schema ${version} -> candidate preserves all represented records and balances, adds legacy settings, and never infers payments or transactions`)
    await browserClient.send('Target.disposeBrowserContext',{browserContextId:context.browserContextId});legacy.socket.close()
  }
  assert.deepEqual(exceptions,[],'No uncaught application exceptions')
  const digest=value=>createHash('sha256').update(JSON.stringify(canonicalRecords(value))).digest('hex')
  const hashes={expected:digest(historical.workspace),released:digest(before.data),candidate:digest(after.data)}
  assert.equal(hashes.released,hashes.expected);assert.equal(hashes.candidate,hashes.expected)
  await writeFile(join(artifacts,'baseline.json'),JSON.stringify({format:historical.format,release:historical.release,candidateDexieVersion:expectedDexieVersion,
    canonicalRecordsSha256:hashes,expected:expectedHistoricalBaseline(),released:before,candidate:after,releasedPresentation:beforePresentation,candidatePresentation:afterPresentation,compatibilityProbe:probe},null,2))
  await writeFile(join(artifacts,'results.json'),JSON.stringify({checks:results.length,results},null,2))
  console.log(`\n${results.length} historical installment safety browser checks passed. Artifacts: ${artifacts}`)
}catch(error){console.error('Safety artifacts:',artifacts);throw error}
finally{
  for(const client of connections)if(client.socket.readyState===WebSocket.OPEN)client.socket.close()
  if(browser?.exitCode===null)browser.kill()
  if(development)await development.close()
  if(production){production.closeAllConnections();await new Promise(done=>production.close(done))}
  const target=resolve(profile);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('my-finance-installment-safety-profile-'))
  await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}
