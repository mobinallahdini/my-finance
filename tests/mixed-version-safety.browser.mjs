// Compatibility investigation. Exit 2 means an observed unsafe/unproven release gate.
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, mkdir, readFile, writeFile, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, sep, extname } from 'node:path'
import { createHash } from 'node:crypto'
import { createServer as httpServer } from 'node:http'
import { createServer, build } from 'vite'
import { historical, businessStores, canonicalRecords, deriveHistoricalBaseline, expectedHistoricalBaseline } from './helpers/installmentBaseline.mjs'
import { launchCompatibilityBrowser } from './helpers/compatibilityBrowser.mjs'
import * as financial from '../src/domain/calculations.ts'
import * as obligations from '../src/domain/obligationCalculations.ts'
import { auditLinks, businessData } from './fixtures/mixed-version/prototype.mjs'

const artifacts=await mkdtemp(join(tmpdir(),'my-finance-mixed-version-review-')),source=join(artifacts,'v12-source'),archive=join(artifacts,'v12.tar'),releasedBuild=join(artifacts,'v12-dist')
const run=promisify(execFile),prototype=await readFile(resolve('tests/fixtures/mixed-version/prototype.mjs'),'utf8')
const observations=[],checks=[],snapshots={};let browser,development,production,directory=releasedBuild
function checked(value,name){assert.ok(value,name);checks.push(name);console.log('CHECK '+name)}
function observed(classification,name,evidence){observations.push({classification,name,evidence});console.log(classification+' — '+name)}
const digest=data=>createHash('sha256').update(JSON.stringify(canonicalRecords(data))).digest('hex')
const fixtureData=canonicalRecords(historical.workspace),fixtureHash=digest(historical.workspace)
function originalRows(data){return Object.fromEntries(businessStores.map(name=>[name,(data[name]??[]).filter(row=>fixtureData[name].some(original=>original.id===row.id))]))}
function baseline(state,storePrefix='',label='Historical baseline'){
  const data=businessData(state,storePrefix),original=originalRows(data)
  assert.deepEqual(canonicalRecords(original),fixtureData,label)
  assert.equal(digest(original),fixtureHash)
  assert.deepEqual(deriveHistoricalBaseline({...original,applicationSettings:original.applicationSettings[0]},financial,obligations),expectedHistoricalBaseline())
  checked(true,label)
}
async function proto(page){await page.run(`window.__prototypeEvents=[];window.proto=await import('/__compat/prototype.mjs')`)}
async function state(page,name='my-finance'){return page.evaluate(`proto.readDatabase(${JSON.stringify(name)})`)}
async function outcome(page,expression){return page.evaluate(`(async()=>{try{return {ok:true,value:await (${expression})}}catch(error){return {ok:false,name:error.name,message:error.message}}})()`)}
async function oldClient(contextId,url){
  const page=await browser.page(url,contextId)
  await page.run(`
    window.__openEvents=[];const nativeOpen=indexedDB.open.bind(indexedDB);
    indexedDB.open=function(...args){const request=nativeOpen(...args);window.__openEvents.push({kind:'request',database:args[0],version:args[1]??null});
      request.addEventListener('error',()=>window.__openEvents.push({kind:'error',name:request.error?.name,message:request.error?.message}));
      request.addEventListener('success',()=>window.__openEvents.push({kind:'opened',version:request.result.version}));return request};
    window.old={...(await import('/src/persistence/repositories.ts')),...(await import('/src/persistence/dataBackup.ts')),...(await import('/src/persistence/applicationSettings.ts')),...(await import('/src/persistence/database.ts'))};
    window.__oldMemory=crypto.randomUUID();old.database.on('versionchange',event=>{window.__openEvents.push({kind:'versionchange',oldVersion:event.oldVersion,newVersion:event.newVersion})});true
  `)
  return page
}
async function scenario(){
  const contextId=await browser.context(),url=`http://127.0.0.1:${development.httpServer.address().port}/src/domain/README.md`
  const old=await oldClient(contextId,url)
  await old.run(`await old.replaceWorkspaceSnapshot(${JSON.stringify(historical.workspace)});localStorage.setItem('my-finance-theme','ocean')`)
  const next=await browser.page(url,contextId);await proto(next)
  baseline(await state(next),'','Actual v1.2 repositories created the exact schema-v3 fixture')
  return {contextId,url,old,next}
}
function oldShape(payment){return Object.fromEntries(Object.entries(payment).filter(([key])=>['id','obligationId','dueMonth','paidDate','amountCents','note'].includes(key)))}
async function unchangedCanonical(page,before,label){const after=await state(page);assert.deepEqual(businessData(after,'v4_'),businessData(before,'v4_'));assert.deepEqual(after.data.paymentOperations,before.data.paymentOperations);assert.deepEqual(auditLinks(after,'v4_'),[]);checked(true,label)}
async function field(page,selector,value){await page.run(`const input=document.querySelector(${JSON.stringify(selector)});if(!input)throw new Error('Missing test field');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}))`)}
async function click(page,selector){await page.run(`document.querySelector(${JSON.stringify(selector)}).click()`)}
async function navigate(page,url){await page.send('Page.navigate',{url});await browser.wait(page,`location.href===${JSON.stringify(url)}&&document.readyState==='complete'`)}
async function waitUi(page,selector){await browser.wait(page,`!!document.querySelector(${JSON.stringify(selector)})&&!document.querySelector('[aria-busy="true"],.transaction-loading,.dashboard-status,.account-loading')`)}
try{
  assert.equal((await run('git',['rev-parse','v1.2.0^{commit}'],{windowsHide:true})).stdout.trim(),historical.release.commit)
  await mkdir(source);await run('git',['archive','--format=tar','--output='+archive,'v1.2.0'],{windowsHide:true});await run('tar',['-xf',archive,'-C',source],{windowsHide:true})
  const releaseLock=JSON.parse(await readFile(join(source,'package-lock.json'),'utf8')),installed=JSON.parse(await readFile(resolve('node_modules/dexie/package.json'),'utf8'))
  assert.equal(installed.version,releaseLock.packages['node_modules/dexie'].version)
  checked(true,'Exact v1.2.0 commit and installed Dexie 4.4.6 match the released lockfile')
  await symlink(resolve('node_modules'),join(source,'node_modules'),process.platform==='win32'?'junction':'dir')
  development=await createServer({root:source,cacheDir:join(source,'.compatibility-vite-cache'),configFile:join(source,'vite.config.ts'),server:{host:'127.0.0.1',port:0},plugins:[{name:'isolated-prototype',configureServer(server){server.middlewares.use('/__compat/prototype.mjs',(_request,response)=>{response.setHeader('Content-Type','application/javascript');response.end(prototype)})}}]})
  await development.listen();browser=await launchCompatibilityBrowser()
  const environment=await browser.admin.send('Browser.getVersion')

  // A: exact 5A additive proposal, attacked by unchanged released repositories.
  {
    const s=await scenario(),memory=await s.old.evaluate('__oldMemory')
    await s.next.evaluate(`proto.upgrade({mode:'additive'})`)
    baseline(await state(s.next),'','Additive v4 migration itself preserves every historical record and exact balance')
    const nativeOlder=await outcome(s.old,`new Promise((done,reject)=>{const request=indexedDB.open('my-finance',30);request.onerror=event=>{event.preventDefault();reject(request.error)};request.onsuccess=()=>{request.result.close();done(true)}})`)
    checked(!nativeOlder.ok&&nativeOlder.name==='VersionError','A raw explicit native-v3 open rejects, but that rejection does not fence Dexie fallback')
    const wrongLayout=await outcome(s.next,`proto.upgrade({mode:'guarded'})`)
    checked(!wrongLayout.ok&&wrongLayout.message==='PrototypeLayoutMismatch','A matching native version with the wrong layout is rejected instead of being mistaken for completed migration')
    await s.next.evaluate('proto.seedLinks()');let linked=await state(s.next)
    assert.deepEqual(auditLinks(linked),[]);checked(true,'Explicit post-migration fixture links existing Expense and Card Transfer without new transactions')
    const duplicate=await outcome(s.next,'proto.claimDuplicate()')
    checked(!duplicate.ok&&duplicate.name==='ConstraintError','Additive unique transaction index rejects a simultaneous duplicate claim atomically')
    await s.next.run(`window.__lockGate=new Promise(done=>window.__releaseLock=done);window.__lease=navigator.locks.request('my-finance-v4-writer',async()=>{window.__lockHeld=true;await __lockGate})`)
    await browser.wait(s.next,'!!window.__lockHeld')
    const historicalEdit=await outcome(s.old,`old.obligationPaymentsRepository.update(${JSON.stringify({...historical.workspace.obligationPayments[0],note:'explicit old-client correction'})})`)
    checked(historicalEdit.ok,'An already-open released client writes after native version 30 -> 40')
    checked(historicalEdit.ok&&await s.next.evaluate('__lockHeld===true'),'An exclusive Web Lock held by new code does not stop the unchanged old repository writer')
    await s.next.run('__releaseLock()')
    checked(await s.old.evaluate(`__oldMemory===${JSON.stringify(memory)}`),'IndexedDB versionchange does not destroy old in-memory application code')
    const events=await s.old.evaluate('__openEvents')
    checked(events.some(event=>event.name==='VersionError')&&events.some(event=>event.kind==='opened'&&event.version===40),'Actual released Dexie catches VersionError and reopens the newer database')
    const spread=await outcome(s.old,`old.obligationPaymentsRepository.get('v13-expense-payment').then(payment=>old.obligationPaymentsRepository.update({...payment,note:'old spread'}))`)
    checked(!spread.ok&&spread.name==='RangeError','Old strict validation rejects a read-and-spread payment containing unknown link fields')
    const transactionEdit=await outcome(s.old,`old.transactionsRepository.update(${JSON.stringify({...historical.workspace.transactions.find(row=>row.id==='card-purchase'),amount:25001})})`)
    linked=await state(s.next)
    checked(transactionEdit.ok&&auditLinks(linked).some(problem=>problem.kind==='mismatched-transaction'),'Old financial edit bypasses payment/transaction amount consistency')
    const replacement=oldShape(linked.data.obligationPayments.find(row=>row.id==='v13-expense-payment'))
    const replace=await outcome(s.old,`old.obligationPaymentsRepository.update(${JSON.stringify({...replacement,note:'reconstructed v1.2 shape'})})`)
    linked=await state(s.next)
    checked(replace.ok&&auditLinks(linked).some(problem=>problem.kind==='lost-payment-link'),'Actual old full-record replacement silently removes optional links and their unique-index entry')
    const reclaimed=await outcome(s.next,'proto.claimDuplicate()')
    checked(reclaimed.ok,'Erasing the link frees its unique key for another payment while the original receipt survives')
    const paymentDelete=await outcome(s.old,`old.obligationPaymentsRepository.delete('v13-transfer-payment')`)
    checked(paymentDelete.ok&&auditLinks(await state(s.next)).some(problem=>problem.kind==='missing-payment'),'Released payment deletion leaves a live operation receipt orphaned')
    const transactionDelete=await outcome(s.old,`old.transactionsRepository.delete('card-purchase')`)
    checked(transactionDelete.ok&&auditLinks(await state(s.next)).some(problem=>problem.kind==='missing-transaction'),'Released transaction deletion removes a financial record still claimed by a payment')
    const reopen=await outcome(s.old,`(async()=>{old.database.close();await old.database.open();return old.database.backendDB().version})()`)
    checked(reopen.ok&&reopen.value===40,'Explicit old-client close and reopen also accepts the newer native schema')
    await s.old.send('Network.enable');await s.old.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1})
    const offline=await outcome(s.old,`old.obligationPaymentsRepository.update(${JSON.stringify({...historical.workspace.obligationPayments[1],note:'offline old-client correction'})})`)
    checked(offline.ok,'Already loaded old repository code remains writable offline after additive upgrade')
    await s.old.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
    const restore=await outcome(s.old,`old.replaceWorkspaceSnapshot(${JSON.stringify(historical.workspace)})`)
    checked(restore.ok&&auditLinks(await state(s.next)).some(problem=>problem.kind==='missing-payment'),'Actual released full restore bypasses the new operation/link graph')
    snapshots.additive={events,nativeOlder,spread,historicalEdit,transactionEdit,replace,paymentDelete,transactionDelete,reopen,offline,restore,state:await state(s.next)}
    observed('PROVEN UNSAFE','Additive schema number + optional links + unique index + new-code-only flag',{events,violations:auditLinks(snapshots.additive.state)})
    await browser.dispose(s.contextId)
  }

  // B: a separate database protects its own records but leaves a writable old ledger.
  {
    const s=await scenario();await s.next.evaluate('proto.copyToNamespace()')
    const copied=await state(s.next,'my-finance-v4-prototype');baseline(copied,'','Versioned database copy preserves the original fixture before competing writes')
    await s.next.evaluate(`proto.seedLinks({name:'my-finance-v4-prototype'})`)
    const before=await state(s.next,'my-finance-v4-prototype')
    await s.old.evaluate(`old.transactionsRepository.update(${JSON.stringify({...historical.workspace.transactions[1],amount:11501})})`)
    const sourceState=await state(s.next),targetState=await state(s.next,'my-finance-v4-prototype')
    assert.deepEqual(targetState,before)
    checked(digest(sourceState.data)!==digest(originalRows(targetState.data)),'Old v1.2 writes cannot reach the new DB but silently diverge from its copied financial history')
    const retry=await outcome(s.next,'proto.copyToNamespace()')
    checked(!retry.ok&&retry.message==='MigrationSourceChanged','Namespace migration retry detects source divergence instead of overwriting linked destination data')
    snapshots.namespace={source:sourceState,target:targetState,retry}
    observed('PROVEN UNSAFE','Database namespace alone does not provide lossless single-ledger cutover',{targetProtected:true,splitBrain:true,retry})
    await browser.dispose(s.contextId)
  }

  // C: rename-only is insufficient because old Dexie can recreate its known tables.
  {
    const s=await scenario();await s.next.evaluate(`proto.upgrade({mode:'rename-only'})`)
    baseline(await state(s.next),'v4_','Atomic native store rename preserves original business records')
    const create=await outcome(s.old,`old.accountsRepository.add({id:'old-competing-bank',name:'Synthetic competing ledger',type:'bank',openingBalance:1})`)
    const after=await state(s.next)
    checked(create.ok&&after.data.accounts.some(row=>row.id==='old-competing-bank'),'Old Dexie schema repair recreates missing legacy stores and permits a competing ledger')
    snapshots.renameOnly={create,state:after,events:await s.old.evaluate('__openEvents')}
    observed('PROVEN UNSAFE','Removing old store names without write guards permits schema repair and split brain',{nativeVersion:after.version,create})
    await browser.dispose(s.contextId)
  }

  // D: one native versionchange transaction moves data and leaves unwritable legacy stores.
  {
    const s=await scenario()
    await s.old.run(`window.__blocker=await new Promise((done,reject)=>{const request=indexedDB.open('my-finance');request.onsuccess=()=>done(request.result);request.onerror=()=>reject(request.error)});__blocker.onversionchange=()=>{window.__blockedVersionchange=true}`)
    await s.next.run(`window.__migration=proto.upgrade({mode:'guarded'}).then(()=>{window.__migrationDone=true},error=>{window.__migrationError=error.name})`)
    await browser.wait(s.next,`__prototypeEvents.some(event=>event.type==='blocked')`)
    checked(await s.old.evaluate('__blocker.version===30&&__blockedVersionchange'),'An uncooperative open native connection blocks cutover without partially upgrading it')
    await s.old.run('__blocker.close()');await browser.wait(s.next,'!!window.__migrationDone')
    baseline(await state(s.next),'v4_','Guarded atomic cutover preserves original IDs, metadata, principal, balances and settings')
    await s.next.evaluate(`proto.seedLinks({storePrefix:'v4_'})`);const before=await state(s.next)
    assert.deepEqual(auditLinks(before,'v4_'),[])
    const binding=await s.next.evaluate('proto.bindCanonicalDexie()')
    assert.equal(binding.version,40);assert.deepEqual(binding.data,businessData(before,'v4_'))
    checked(true,'A prototype v4 Dexie client binds canonical stores after the native gate without schema repair')
    const attempts=[
      ['historical payment edit',`old.obligationPaymentsRepository.update(${JSON.stringify({...historical.workspace.obligationPayments[0],note:'must not reach canonical'})})`],
      ['linked payment replacement',`old.obligationPaymentsRepository.update(${JSON.stringify({id:'v13-expense-payment',obligationId:'v13-installment',dueMonth:'2026-10',paidDate:'2026-10-03',amountCents:25000})})`],
      ['historical transaction edit',`old.transactionsRepository.update(${JSON.stringify({...historical.workspace.transactions[1],amount:11501})})`],
      ['linked transaction deletion',`old.transactionsRepository.delete('card-purchase')`],
      ['linked payment deletion',`old.obligationPaymentsRepository.delete('v13-expense-payment')`],
      ['new account',`old.accountsRepository.add({id:'old-account',name:'Synthetic blocked',type:'bank',openingBalance:1})`],
      ['new category',`old.categoriesRepository.add({id:'old-category',name:'Synthetic blocked',type:'expense'})`],
      ['new obligation',`old.obligationsRepository.add(${JSON.stringify({...historical.workspace.obligations[0],id:'old-obligation'})})`],
      ['new financial transaction',`old.transactionsRepository.add(${JSON.stringify({...historical.workspace.transactions[1],id:'old-transaction'})})`],
      ['settings save',`old.saveApplicationSettings(${JSON.stringify(historical.workspace.applicationSettings)})`],
      ['confirmed settings save',`old.saveApplicationSettings(${JSON.stringify(historical.workspace.applicationSettings)},'CAD')`],
      ['CSV batch import',`old.importTransactionBatch([${JSON.stringify({...historical.workspace.transactions[1],id:'old-import'})}],'GBP')`],
      ['full workspace replacement restore',`old.replaceWorkspaceSnapshot(${JSON.stringify(historical.workspace)})`],
    ],outcomes=[]
    for(const [name,expression]of attempts){const result=await outcome(s.old,expression);outcomes.push({operation:name,...result});await unchangedCanonical(s.next,before,'Canonical graph survives actual released '+name)}
    checked(outcomes.some(row=>row.operation==='new account'&&!row.ok&&row.name==='DataError'),'Old native write failures are recorded instead of being treated as successful deductions')
    await s.old.run('old.database.close();await old.database.open()')
    await unchangedCanonical(s.next,before,'Old explicit close/reopen does not remove the structural guard')
    const reopened=await oldClient(s.contextId,s.url)
    await outcome(reopened,`old.transactionsRepository.delete('repay-debt')`)
    await unchangedCanonical(s.next,before,'A newly opened actual old client cannot delete the canonical Card Transfer')
    const duplicate=await outcome(s.next,`proto.claimDuplicate({storePrefix:'v4_'})`)
    checked(!duplicate.ok&&duplicate.name==='ConstraintError','Canonical unique link constraint still rejects duplicate claims after old-client attacks')
    await unchangedCanonical(s.next,before,'Failed duplicate claim rolls back its operation receipt as well as payment')
    const emptyRestore=await outcome(s.old,`old.replaceApplicationSnapshot({accounts:[],categories:[],transactions:[],obligations:[],obligationPayments:[]})`)
    await unchangedCanonical(s.next,before,'Even a successful old empty restore can clear only compatibility stores')
    snapshots.guarded={outcomes,duplicate,emptyRestore,state:await state(s.next),events:await s.old.evaluate('__openEvents')}
    observed('PROVEN SAFE','Guarded canonical store isolation against the tested v1.2 repository matrix',{scope:'Observed Chromium/Dexie/tag only; production integration remains unproven',outcomes})
    await browser.dispose(s.contextId)
  }

  // Abort/retry and actual tab interruption of the native cutover transaction.
  for(const failAfter of [1,3,6]){
    const s=await scenario(),before=await state(s.next),failed=await outcome(s.next,`proto.upgrade({mode:'guarded',failAfter:${failAfter},failure:'AbortError'})`)
    const aborted=await state(s.next)
    checked(!failed.ok&&aborted.version===30&&digest(aborted.data)===fixtureHash,`Abort after rename ${failAfter} restores native v3 and the complete fixture hash`)
    assert.deepEqual(aborted,before)
    await s.next.evaluate(`proto.upgrade({mode:'guarded'})`);baseline(await state(s.next),'v4_',`Retry after abort ${failAfter} preserves all historical derived values`)
    const once=await state(s.next);await s.next.evaluate(`proto.upgrade({mode:'guarded'})`);assert.deepEqual(await state(s.next),once)
    checked(true,`Repeated completed cutover ${failAfter} neither reseeds nor reposts financial records`)
    await browser.dispose(s.contextId)
  }
  {
    const s=await scenario()
    await s.next.run(`window.__pending=proto.upgrade({mode:'guarded',holdBeforeCommit:true}).catch(()=>false)`)
    await browser.wait(s.next,`__prototypeEvents.some(event=>event.type==='held-upgrade')`)
    await browser.admin.send('Target.closeTarget',{targetId:s.next.targetId})
    const replacement=await browser.page(s.url,s.contextId);await proto(replacement)
    const after=await state(replacement)
    checked(after.version===30&&digest(after.data)===fixtureHash,'Closing the upgrading browser tab rolls back the unfinished versionchange transaction')
    await replacement.evaluate(`proto.upgrade({mode:'guarded'})`);baseline(await state(replacement),'v4_','A fresh tab safely retries an interrupted migration without posting money')
    snapshots.interruption={beforeRetry:after,afterRetry:await state(replacement)}
    await browser.dispose(s.contextId)
  }

  // A committed old write must finish before native cutover; no stale copied snapshot.
  {
    const s=await scenario(),payment={...historical.workspace.obligationPayments[0],note:'Committed immediately before native cutover'}
    await s.old.run(`window.__writerGate=new Promise(done=>window.__releaseWriter=done);window.__writer=old.database.transaction('rw',old.database.obligations,old.database.obligationPayments,async()=>{
      await old.obligationPaymentsRepository.update(${JSON.stringify(payment)});window.__writerReady=true;await old.database.constructor.waitFor(window.__writerGate)
    }).then(()=>{window.__writerDone=true})`)
    await browser.wait(s.old,'!!window.__writerReady')
    await s.next.run(`window.__cutover=proto.upgrade({mode:'guarded'}).then(()=>{window.__cutoverDone=true})`)
    await browser.wait(s.old,`__openEvents.some(event=>event.kind==='versionchange')`)
    checked(!await s.next.evaluate('!!window.__cutoverDone'),'Native cutover waits for an in-flight real v1.2 write transaction')
    await s.old.run('__releaseWriter()');await browser.wait(s.old,'!!window.__writerDone');await browser.wait(s.next,'!!window.__cutoverDone')
    const expected=structuredClone(historical.workspace);expected.obligationPayments[0]=payment
    const actual=businessData(await state(s.next),'v4_');assert.deepEqual(canonicalRecords(actual),canonicalRecords(expected))
    assert.deepEqual(deriveHistoricalBaseline({...actual,applicationSettings:actual.applicationSettings[0]},financial,obligations),expectedHistoricalBaseline())
    checked(true,'Cutover includes the last committed old payment correction and preserves exact financial/principal values')
    snapshots.inFlightWriter={expectedHash:digest(expected),actualHash:digest(actual),state:await state(s.next)}
    await browser.dispose(s.contextId)
  }
  {
    const s=await scenario(),peer=await browser.page(s.url,s.contextId);await proto(peer)
    await s.next.run(`window.__first=proto.upgrade({mode:'guarded',holdBeforeCommit:true}).then(()=>{window.__firstDone=true})`)
    await browser.wait(s.next,`__prototypeEvents.some(event=>event.type==='held-upgrade')`)
    await peer.run(`window.__second=proto.upgrade({mode:'guarded'}).then(()=>{window.__secondDone=true})`)
    checked(!await peer.evaluate('!!window.__secondDone'),'A second new tab cannot commit a second cutover while the first upgrade is pending')
    await s.next.run('window.__holdUpgrade=false');await browser.wait(s.next,'!!window.__firstDone');await browser.wait(peer,'!!window.__secondDone')
    baseline(await state(peer),'v4_','Concurrent new clients converge on one committed canonical fixture')
    checked(!await peer.evaluate(`__prototypeEvents.some(event=>event.type==='migration-step')`),'The second upgrader observes completion without replaying migration steps')
    snapshots.concurrentUpgraders=await state(peer);await browser.dispose(s.contextId)
  }

  // Production/PWA checks are appended below. Never infer a DB fence from asset activation.
  const previousNodeEnv=process.env.NODE_ENV;process.env.NODE_ENV='production'
  try{await build({root:source,configFile:join(source,'vite.config.ts'),build:{outDir:releasedBuild,emptyOutDir:true}})}finally{if(previousNodeEnv===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=previousNodeEnv}
  const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.png':'image/png'}
  production=httpServer(async(request,response)=>{
    const path=new URL(request.url,'http://localhost').pathname
    if(path==='/node_modules/dexie/dist/dexie.mjs'){response.writeHead(200,{'Content-Type':'application/javascript'});response.end(await readFile(resolve('node_modules/dexie/dist/dexie.mjs'),'utf8'));return}
    if(path==='/__compat/prototype.mjs'){response.writeHead(200,{'Content-Type':'application/javascript'});response.end(prototype);return}
    if(path==='/prototype.html'){response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});response.end('<!doctype html><title>Disposable prototype</title><script type="module">import * as proto from "/__compat/prototype.mjs";window.proto=proto;window.__prototypeReady=true</script>');return}
    const file=resolve(directory,path.replace(/^\/my-finance\//,'')||'index.html')
    if(!file.startsWith(resolve(directory)+sep)){response.writeHead(403);response.end();return}
    try{const content=await readFile(file);response.writeHead(200,{'Content-Type':mime[extname(file)]??'application/octet-stream','Cache-Control':'no-store'});response.end(content)}catch{response.writeHead(404);response.end()}
  });await new Promise(done=>production.listen(0,'127.0.0.1',done))
  const pwaOrigin=`http://127.0.0.1:${production.address().port}`,appUrl=pwaOrigin+'/my-finance/'
  async function releasedPwa(){
    directory=releasedBuild
    const contextId=await browser.context(),page=await browser.page(pwaOrigin+'/prototype.html',contextId)
    await page.send('Emulation.setTimezoneOverride',{timezoneId:'America/Toronto'})
    await page.send('Page.addScriptToEvaluateOnNewDocument',{source:`const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-10-20T16:00:00Z']))}}`})
    await navigate(page,appUrl+'#home');await waitUi(page,'.finance-onboarding')
    await navigate(page,pwaOrigin+'/prototype.html');await browser.wait(page,'!!window.__prototypeReady')
    await page.evaluate(`new Promise((done,reject)=>{const request=indexedDB.open('my-finance');request.onerror=()=>reject(request.error);request.onsuccess=()=>{
      const db=request.result;if(db.version!==30)throw new Error('Expected genuine released v3 database');const input=${JSON.stringify(fixtureData)},tx=db.transaction(Object.keys(input),'readwrite');
      for(const [name,rows]of Object.entries(input))for(const row of rows)tx.objectStore(name).add(row);
      tx.oncomplete=()=>{db.close();localStorage.setItem('my-finance-theme','ocean');done(true)};tx.onabort=()=>{db.close();reject(tx.error)};
    }})`)
    await navigate(page,appUrl+'#home');await waitUi(page,'.dashboard-summary')
    await browser.wait(page,`navigator.serviceWorker.getRegistration().then(registration=>registration?.active?.state==='activated')`)
    await page.send('Page.reload');await waitUi(page,'.dashboard-summary');await browser.wait(page,'!!navigator.serviceWorker.controller')
    await page.run('window.__oldMemory=true')
    const next=await browser.page(pwaOrigin+'/prototype.html',contextId);await browser.wait(next,'!!window.__prototypeReady')
    return {contextId,page,next}
  }
  {
    const p=await releasedPwa(),peer=await browser.page(appUrl+'#accounts',p.contextId);await waitUi(peer,'.accounts-section')
    const oldAssets=await p.page.evaluate(`[...document.querySelectorAll('script[src]')].map(script=>script.src)`)
    await p.next.evaluate(`proto.upgrade({mode:'additive'})`);baseline(await state(p.next),'','Actual production v1.2 remains open while an uncontrolled prototype upgrades its database')
    await p.next.evaluate('proto.seedLinks()')
    directory=resolve('dist')
    await p.page.evaluate('navigator.serviceWorker.getRegistration().then(registration=>registration.update())')
    await browser.wait(p.page,`navigator.serviceWorker.getRegistration().then(registration=>registration?.waiting?.state==='installed')`)
    checked(await p.page.evaluate('__oldMemory===true'),'New deployed PWA assets wait while the old compiled app remains in memory')
    // Deliberate debugger-only activation, never added to the application worker.
    await p.page.send('ServiceWorker.enable');await p.page.send('ServiceWorker.skipWaiting',{scopeURL:appUrl})
    await browser.wait(p.page,`navigator.serviceWorker.getRegistration().then(registration=>registration?.active?.state==='activated'&&!registration.waiting)`)
    assert.deepEqual(await p.page.evaluate(`[...document.querySelectorAll('script[src]')].map(script=>script.src)`),oldAssets)
    checked(await p.page.evaluate('__oldMemory===true'),'Debugger-forced new worker activation does not replace old JavaScript or its loaded assets')
    await p.page.send('Network.enable');await p.page.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1})
    await p.page.run(`location.hash='transactions'`);await waitUi(p.page,'[data-transaction-id="card-purchase"]')
    await click(p.page,'[data-transaction-id="card-purchase"]');await waitUi(p.page,'dialog[open]')
    await field(p.page,'dialog input[id$="-amount"]','250.01');await click(p.page,'dialog button[type="submit"]')
    await browser.wait(p.page,`!document.querySelector('dialog[open]')`)
    const changed=await state(p.next)
    checked(changed.data.transactions.find(row=>row.id==='card-purchase').amount===25001&&auditLinks(changed).some(problem=>problem.kind==='mismatched-transaction'),
      'Actual old production UI edits a linked Expense offline after new-worker activation, breaking link consistency')
    checked(await p.page.evaluate('__oldMemory===true'),'The unsafe offline write came from the still-running released application')
    await p.page.send('Page.reload');await waitUi(p.page,'.transactions-section')
    await p.page.run(`location.hash='more/reports'`);await waitUi(p.page,'.report-overview')
    checked(!await p.page.evaluate('!!window.__oldMemory'),'Offline browser reload uses the new cached application shell, without repairing the damaged link')
    checked(auditLinks(await state(p.next)).some(problem=>problem.kind==='mismatched-transaction'),'New assets and reload do not reconcile or enforce the existing payment link')
    await p.page.send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
    snapshots.pwaAdditive={oldAssets,afterUnsafeOldUiWrite:changed,afterNewReload:await state(p.next)}
    observed('PROVEN UNSAFE','Waiting/activated service worker is not a database fence',{offlineOldProductionUiWrite:true,activation:'Debugger-forced, not application behavior'})
    await browser.dispose(p.contextId)
  }
  {
    const p=await releasedPwa()
    await p.page.run(`location.hash='transactions'`);await waitUi(p.page,'[data-transaction-id="card-purchase"]')
    await click(p.page,'[data-transaction-id="card-purchase"]');await waitUi(p.page,'dialog[open]');await field(p.page,'dialog input[id$="-amount"]','250.01')
    await p.next.evaluate(`proto.upgrade({mode:'guarded'})`);await p.next.evaluate(`proto.seedLinks({storePrefix:'v4_'})`)
    const before=await state(p.next)
    const beforeSave=await p.page.evaluate(`({dialog:!!document.querySelector('dialog[open]'),amount:document.querySelector('dialog input[id$="-amount"]')?.value,bootstrap:!!document.querySelector('.finance-bootstrap [role="alert"]'),onboarding:!!document.querySelector('.finance-onboarding')})`)
    if(beforeSave.dialog){
      await click(p.page,'dialog button[type="submit"]');await browser.wait(p.page,`!!document.querySelector('dialog [role="alert"],.finance-bootstrap [role="alert"]')`)
      checked(await p.page.evaluate(`document.querySelector('dialog input[id$="-amount"]')?.value==='250.01'`),'Old dirty transaction editor reports a blocked save and retains its draft')
    }else checked(beforeSave.bootstrap||beforeSave.onboarding,'Actual old UI fails closed after canonical cutover; its recovery screen is recorded')
    await unchangedCanonical(p.next,before,'Actual compiled v1.2 editor cannot modify canonical linked data after guarded cutover')
    await p.page.send('Network.enable');await p.page.send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1})
    await p.page.send('Page.reload');await waitUi(p.page,'.finance-bootstrap [role="alert"]')
    checked(!await p.page.evaluate(`!!document.querySelector('.finance-onboarding')`),'Offline cached v1.2 reload encounters the retirement guard instead of resetting onboarding')
    await unchangedCanonical(p.next,before,'Offline old-client reopen preserves canonical records and both valid links')
    const binding=await p.next.evaluate('proto.bindCanonicalDexie()')
    assert.equal(binding.version,40);assert.deepEqual(binding.data,businessData(before,'v4_'))
    checked(true,'An online new prototype client still reads the complete canonical ledger while the offline old app is blocked')
    snapshots.pwaGuarded={beforeSave,oldRecovery:await p.page.evaluate(`document.querySelector('.finance-bootstrap').textContent`),canonical:await state(p.next)}
    await browser.dispose(p.contextId)
  }

  const report={release:historical.release,environment,dexieVersion:installed.version,fixtureHash,checks:checks.length,checkNames:checks,observations,snapshots,
    workerEvents:browser.events.filter(event=>event.method.startsWith('ServiceWorker.')),
    safetyGates:{additiveProposal:'PROVEN UNSAFE',namespaceOnly:'PROVEN UNSAFE',guardedRepositoryMatrix:'PROVEN SAFE (tested Chromium paths only)',productionRelease:'UNPROVEN'},artifacts}
  await writeFile(join(artifacts,'report.json'),JSON.stringify(report,null,2))
  console.log(`\n${checks.length} investigation assertions verified. Additive/namespace safety gates FAILED; production release remains UNPROVEN. Artifacts: ${artifacts}`)
  process.exitCode=2
}catch(error){await writeFile(join(artifacts,'partial-report.json'),JSON.stringify({checks,observations,snapshots,error:String(error)},null,2));console.error('Compatibility artifacts:',artifacts);throw error}
finally{if(browser)await browser.close();if(development)await development.close();if(production){production.closeAllConnections();await new Promise(done=>production.close(done))}}
