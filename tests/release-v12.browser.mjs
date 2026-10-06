// Actual v1.1.0 production upgrade and v1.2 release regression. Node 24 + Chrome + git + tar.
// Uses only disposable source/browser directories; never imports application source in the browser.
import assert from 'node:assert/strict'
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, mkdir, symlink, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { build } from 'vite'

const profile = await mkdtemp(join(tmpdir(), 'my-finance-v12-profile-'))
const artifacts = await mkdtemp(join(tmpdir(), 'my-finance-v12-review-'))
const run = promisify(execFile)
const oldSource = join(artifacts, 'v1-source'), archive = join(artifacts, 'v1.tar')
await mkdir(oldSource)
await run('git', ['archive', '--format=tar', '--output='+archive, 'v1.1.0'], { windowsHide:true })
await run('tar', ['-xf', archive, '-C', oldSource], { windowsHide:true })
await symlink(resolve('node_modules'), join(oldSource, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
const oldBuild = join(artifacts, 'v1-dist'), currentBuild = resolve('dist')
await build({root:oldSource,configFile:join(oldSource,'vite.config.ts'),build:{outDir:oldBuild,emptyOutDir:true}})
let directory = oldBuild
const oldWorker = await readFile(join(oldBuild,'sw.js'),'utf8'), newWorker = await readFile(join(currentBuild,'sw.js'),'utf8')
assert.notEqual(oldWorker,newWorker,'Released v1.1 and current v1.2 have distinct real asset revisions')
const requests = [], exceptions = [], results = []
const downloadNames = new Map(), completedDownloads = new Set()
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png' }
const server = createServer(async (request, response) => {
  requests.push({ method:request.method, url:request.url })
  const path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
  if (path === '/my-finance') { response.writeHead(301, { Location:'/my-finance/' }); response.end(); return }
  const relative = path.startsWith('/my-finance/') ? path.slice('/my-finance/'.length) : path.slice(1)
  const file = resolve(directory, relative || 'index.html')
  if (!file.startsWith(resolve(directory) + sep)) { response.writeHead(403); response.end(); return }
  try { const content=await readFile(file);response.writeHead(200, { 'Content-Type':mime[extname(file)] ?? 'application/octet-stream', 'Cache-Control':'no-store' }); response.end(content) }
  catch { response.writeHead(404); response.end('Not found') }
})
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen))
const origin = `http://127.0.0.1:${server.address().port}`
const appURL = origin + '/my-finance/'
const chrome = process.env.CHROME_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome')
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide:true, stdio:'ignore' })
let socket, sequence = 0, launchError
browser.on('error', error => { launchError = error })
const pending = new Map()
function send(method, params = {}) {
  return new Promise((resolvePromise, reject) => { const id=++sequence; pending.set(id, { resolve:resolvePromise, reject }); socket.send(JSON.stringify({ id, method, params })) })
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, awaitPromise:true, returnByValue:true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
  return response.result.value
}
async function wait(expression) {
  for (let i=0; i<200; i++) { if (await evaluate(expression)) return; await delay(50) }
  throw new Error(`Timed out: ${expression}; ${await evaluate('document.body?.textContent.slice(0,1600)')}`)
}
async function check(expression, name) { assert.ok(await evaluate(expression), name); results.push(name); console.log(`PASS ${name}`) }
async function click(text, selector = 'button') {
  await evaluate(`(() => { const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)} || e.getAttribute('aria-label')===${JSON.stringify(text)}); if(!e)throw new Error('Missing '+${JSON.stringify(text)}); e.click() })()`)
  await delay(70)
}
async function field(label, value) {
  await evaluate(`(() => { const l=[...document.querySelectorAll('dialog[open] label')].find(l=>l.textContent.trim()===${JSON.stringify(label)});if(!l)throw new Error('Missing field '+${JSON.stringify(label)});const e=document.getElementById(l.htmlFor),p=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true})) })()`)
  await delay(30)
}
const screens = { home:'.dashboard-summary', transactions:'.transaction-count', accounts:'.accounts-section', more:'.more-section', 'more/categories':'.categories-section', 'more/bills-installments':'.obligations-section', 'more/finance-settings':'.finance-settings', 'more/data-backup':'.data-backup-section', 'accounts/bank':'.account-details-summary', 'accounts/card':'.account-details-summary', 'accounts/cash':'.account-details-summary' }
async function route(hash) {
  await evaluate(`location.hash=${JSON.stringify(hash)}`)
  await wait(`!!document.querySelector(${JSON.stringify(screens[hash] ?? '.obligations-section')}) && !document.querySelector('.transaction-loading,.dashboard-status,.account-loading,.category-loading,.obligations-section [role="status"]') && !document.querySelector('[aria-busy="true"]')`)
  await delay(70)
}
async function reload() {
  await evaluate('window.__reloadMarker=true')
  await send('Page.reload')
  await wait(`!window.__reloadMarker && !!document.querySelector('.app-main h2,.finance-onboarding') && !document.querySelector('[aria-busy="true"]')`)
  await delay(100)
}
async function fileInput(value, id = 'backup-restore-file', filename = 'release-review.json') {
  // A real chooser cannot open a disabled input; wait for download/restore work to finish.
  await wait(`!!document.getElementById(${JSON.stringify(id)})&&!document.getElementById(${JSON.stringify(id)}).matches(':disabled')&&!document.querySelector('[aria-busy="true"]')`)
  await evaluate(`(() => {const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(typeof value==='string'?value:JSON.stringify(value))}],${JSON.stringify(filename)},{type:${JSON.stringify(id==='backup-restore-file'?'application/json':'text/csv')}}));const e=document.getElementById(${JSON.stringify(id)});e.files=dt.files;e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await delay(100)
}
const snapshotExpression = `(async()=>{const request=indexedDB.open('my-finance');const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});const names=['accounts','categories','transactions','obligations','obligationPayments'];const tx=db.transaction(names,'readonly');const records=await Promise.all(names.map(name=>new Promise((resolve,reject)=>{const r=tx.objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})));db.close();return Object.fromEntries(names.map((name,i)=>[name,records[i]]))})()`
async function snapshot() { return evaluate(snapshotExpression) }
async function downloaded(name) {
  for(let i=0;i<200;i++) {
    if(completedDownloads.has(name)) {
      const value=await readFile(join(artifacts,name),'utf8')
      assert.ok(value.length, `Completed download ${name} contains data`)
      completedDownloads.delete(name)
      return value
    }
    await delay(50)
  }
  throw new Error(`Download did not complete: ${name}`)
}
const releaseSettings={id:'application',countryCode:'DE',currencyCode:'GBP',profileType:'business',fiscalYearStartMonth:7,onboardingCompleted:true}
const fixture = {
  format:'my-finance-backup',schemaVersion:3,exportedAt:'2026-10-06T16:00:00.000Z',currency:'GBP',kind:'full',
  sections:['accounts','categories','transactions','obligations','obligationPayments','applicationSettings','preferences'],preferences:{theme:'ocean'},
  data:{
    accounts:[{id:'bank',type:'bank',name:'Main Bank RC',openingBalance:100000},{id:'cash',type:'cash',name:'Cash RC',openingBalance:20000},{id:'card',type:'credit_card',name:'RBC Visa RC',openingBalance:0,creditLimit:50000}],
    categories:[{id:'food',type:'expense',name:'Groceries RC'},{id:'transport',type:'expense',name:'Transport RC'},{id:'salary',type:'income',name:'Salary RC'}],
    transactions:[
      {id:'bank-expense',type:'expense',accountId:'bank',categoryId:'food',amount:10000,date:'2026-10-01',note:'Bank recognisable'},
      {id:'tax-expense',type:'expense',accountId:'card',categoryId:'food',amount:11500,date:'2026-10-02',taxAmountCents:1500,receiptNumber:'=INV / RC 2048',note:'Exact receipt note\n\u96ea'},
      {id:'cash-expense',type:'expense',accountId:'cash',categoryId:'transport',amount:4000,date:'2026-10-03'},
      {id:'september-expense',type:'expense',accountId:'bank',categoryId:'food',amount:10000,date:'2026-09-30'},
      {id:'income',type:'income',accountId:'bank',categoryId:'salary',amount:200000,date:'2026-10-04'},
      {id:'payment-transfer',type:'transfer',fromAccountId:'bank',toAccountId:'card',amount:5000,date:'2026-10-05',note:'Payment stays Transfer'},
    ],
    obligations:[{id:'bill',type:'bill',name:'RC mobile',dueDay:1,startMonth:'2026-01',isActive:true,expectedAmountCents:10000},{id:'loan',type:'installment',name:'RC laptop',dueDay:31,startMonth:'2026-09',isActive:true,originalAmountCents:100000,scheduledPaymentCents:15500}],
    obligationPayments:[{id:'bill-partial',obligationId:'bill',dueMonth:'2026-10',paidDate:'2026-10-02',amountCents:4000,note:'Recognisable partial history'},{id:'principal',obligationId:'loan',dueMonth:'2026-09',paidDate:'2026-09-15',amountCents:38000}],
    applicationSettings:releaseSettings,
  },
}
function normalized(data) { return Object.fromEntries(Object.entries(data).map(([name,records])=>[name,[...records].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0)])) }
async function select(suffix,value) {
  await evaluate(`(()=>{const e=document.querySelector('select[id$="-${suffix}"]');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await delay(30)
}
async function settings() {
  return evaluate(`(async()=>{const r=indexedDB.open('my-finance');const db=await new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});if(!db.objectStoreNames.contains('applicationSettings')){db.close();return null}const tx=db.transaction('applicationSettings');const q=tx.objectStore('applicationSettings').get('application');const value=await new Promise((resolve,reject)=>{q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)});db.close();return value})()`)
}
async function restore(value) {
  await route('more/data-backup');await fileInput(value);await wait(`!!document.querySelector('dialog[open]')`)
  await click('Replace current data');await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]')`)
  await delay(100)
}
async function captureFinancialPresentation() {
  await route('home')
  const home=await evaluate(`document.querySelector('.dashboard-summary').textContent`)
  await route('accounts')
  const accounts=await evaluate(`[...document.querySelectorAll('.account-balances')].map(e=>e.textContent)`)
  const details={}
  for(const id of ['bank','card']){await route('accounts/'+id);details[id]=await evaluate(`document.querySelector('.account-details-summary').textContent`)}
  return {home,accounts,details}
}
const fmt=(cents,currency)=>new Intl.NumberFormat('en-CA',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:2}).format(cents/100)
function record(name) {results.push(name);console.log('PASS '+name)}

async function keyboard(key,modifiers=0) {
  const code=key===' '?'Space':key, keys={Tab:9,Escape:27,Enter:13,ArrowRight:39,' ':32}
  await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,windowsVirtualKeyCode:keys[key]})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});await delay(70)
}
async function saveTransaction() {await click('Save');await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]')`)}
async function setType(type) {await evaluate(`document.querySelector('.transaction-segment input[value="${type}"]').click()`);await delay(40)}
async function addRefund(accountId,amount,categoryId='food',note='=RC refund, "exact"\n\u96ea') {
  await route('transactions');await click('Add Transaction');await setType('refund')
  const currency=(await settings()).currencyCode
  await field(`Amount (${currency})`,amount);await field('Expense category',categoryId);await field('Destination account',accountId);await field('Note (optional)',note)
  await saveTransaction()
  return (await snapshot()).transactions.find(t=>t.type==='refund'&&t.accountId===accountId&&t.note===note)
}
async function inlineCategory(name,type='Expense') {
  await click('+ New category');await field(`New ${type} category name`,name);await click('Save category')
  await wait(`!document.querySelector('.transaction-new-category')&&!document.querySelector('[aria-busy="true"]')`)
  return evaluate(`document.querySelector('select[id$="-category"]').value`)
}
async function downloadedBackup() {
  await route('more/data-backup');await evaluate(`document.querySelector('.backup-export-row').click()`)
  const path=join(artifacts,'my-finance-backup-2026-10-06.json'),value=JSON.parse(await downloaded(basename(path)))
  await rm(path);return value
}
async function schema() {
  return evaluate(`(async()=>{const r=indexedDB.open('my-finance'),db=await new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});const names=[...db.objectStoreNames],tx=db.transaction(names);const metadata={version:db.version,stores:names.map(name=>({name,keyPath:tx.objectStore(name).keyPath,indexes:[...tx.objectStore(name).indexNames].map(index=>({name:index,keyPath:tx.objectStore(name).index(index).keyPath,unique:tx.objectStore(name).index(index).unique}))}))};db.close();return metadata})()`)
}
async function checkHome(expenses,income,currency,name) {
  await route('home')
  await check(`document.querySelector('.dashboard-supporting').textContent.includes(${JSON.stringify(fmt(expenses,currency))})&&document.querySelector('.dashboard-supporting').textContent.includes(${JSON.stringify('+'+fmt(income,currency))})&&document.querySelector('.dashboard-net-amount').textContent===${JSON.stringify((income-expenses>0?'+':'')+fmt(income-expenses,currency))}`,name)
}
async function checkAccount(id,balance,currency,name) {
  await route('accounts/'+id)
  await check(`document.querySelector('.account-details-summary .account-primary-balance dd').textContent===${JSON.stringify(fmt(id==='card'&&balance<0?-balance:balance,currency))}`,name)
}

try {
  let port
  for(let i=0;i<200;i++){if(launchError)throw launchError;try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break}catch{await delay(50)}}
  assert.ok(port,'Chrome starts')
  const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl)
  await new Promise((resolveOpen,reject)=>{socket.onopen=resolveOpen;socket.onerror=reject})
  socket.onmessage=({data})=>{
    const response=JSON.parse(data),promise=pending.get(response.id)
    if(promise){pending.delete(response.id);if(response.error)promise.reject(new Error(JSON.stringify(response.error)));else promise.resolve(response.result)}
    if(response.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true})
    if(response.method==='Runtime.exceptionThrown')exceptions.push(response.params.exceptionDetails.exception?.description??response.params.exceptionDetails.text)
    if(response.method==='Browser.downloadWillBegin') {
      downloadNames.set(response.params.guid,response.params.suggestedFilename)
      completedDownloads.delete(response.params.suggestedFilename)
    }
    if(response.method==='Browser.downloadProgress'&&response.params.state==='completed')completedDownloads.add(downloadNames.get(response.params.guid))
  }
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable')
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:artifacts,eventsEnabled:true})
  await send('Emulation.setTimezoneOverride',{timezoneId:'America/Toronto'})
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false})
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-10-06T16:00:00Z']))}static now(){return new OriginalDate('2026-10-06T16:00:00Z').getTime()}};window.__onboardingSeen=false;new MutationObserver(()=>{if(document.querySelector('.finance-onboarding'))window.__onboardingSeen=true}).observe(document,{subtree:true,childList:true})`})
  await send('Page.navigate',{url:appURL+'#more/data-backup'})
  await wait(`!!document.querySelector('.finance-onboarding')`)
  await select('country','DE');await select('currency','GBP');await select('fiscal',7);await click('Start using My Finance')
  await route('more/data-backup');await restore(fixture);await reload()
  await wait(`!!navigator.serviceWorker.controller`)
  const before=normalized(await snapshot()),beforeSettings=await settings(),beforeTheme=await evaluate('({...localStorage})'),beforeSchema=await schema()
  assert.deepEqual(before,normalized(Object.fromEntries(Object.entries(fixture.data).filter(([name])=>name!=='applicationSettings'))))
  assert.deepEqual(beforeSettings,releaseSettings)
  const beforePresentation=await captureFinancialPresentation()
  await checkHome(25500,200000,'GBP','Tagged v1.1 baseline Expenses include authoritative tax-bearing total and exclude Transfers/tracking')
  await checkAccount('bank',275000,'GBP','Tagged v1.1 bank balance includes Expense, Income, Transfer and September history')
  await checkAccount('card',6500,'GBP','Tagged v1.1 credit-card payment remains a Transfer reducing debt')
  const oldAssets=await evaluate(`[...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(e=>e.src||e.href)`)
  await evaluate(`caches.open('unrelated-v12-cache')`)
  await route('transactions');await click('Add Transaction');await field('Amount (GBP)','12.34');await evaluate(`window.__taggedV11=true`)
  directory=currentBuild
  await evaluate(`navigator.serviceWorker.getRegistration().then(r=>r.update())`)
  await wait(`navigator.serviceWorker.getRegistration().then(r=>r.waiting?.state==='installed')`)
  await check(`window.__taggedV11&&!!document.querySelector('dialog[open]')&&document.querySelector('input[id$="-amount"]').value==='12.34'`,'Actual v1.1-to-v1.2 worker waits while the released editor has unsaved data')
  assert.deepEqual(normalized(await snapshot()),before);assert.deepEqual(await settings(),beforeSettings);assert.deepEqual(await evaluate('({...localStorage})'),beforeTheme)
  record('Installing v1.2 changes no v1.1 records, included tax/receipts, settings or theme')
  await click('Cancel');await send('Page.navigate',{url:'about:blank'});await delay(600)
  await send('Page.navigate',{url:appURL+'#home'})
  await wait(`!!document.querySelector('.dashboard-summary')&&!!navigator.serviceWorker.controller`)
  await check(`!window.__taggedV11&&!window.__onboardingSeen&&!document.querySelector('.finance-onboarding')`,'v1.2 activates without onboarding or an old client')
  assert.deepEqual(normalized(await snapshot()),before);assert.deepEqual(await settings(),beforeSettings);assert.deepEqual(await evaluate('({...localStorage})'),beforeTheme);assert.deepEqual(await schema(),beforeSchema)
  record('Actual v1.1 upgrade preserves all six stores, theme, schema version and indexes exactly; no migration')
  const afterPresentation=await captureFinancialPresentation();assert.deepEqual(afterPresentation,beforePresentation)
  record('Dashboard and account list/detail amounts and labels remain identical before any Refund')
  assert.notDeepEqual(await evaluate(`[...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(e=>e.src||e.href)`),oldAssets)
  await check(`caches.keys().then(names=>names.includes('unrelated-v12-cache')&&names.filter(n=>n.startsWith('my-finance-assets:/my-finance/:')).length===1)`,'Activation replaces only obsolete project asset caches')
  await check(`navigator.serviceWorker.getRegistration().then(r=>r.scope===location.origin+'/my-finance/'&&r.active.scriptURL===location.origin+'/my-finance/sw.js')`,'Production service worker remains scoped to /my-finance/')
  await check(`(async()=>{const url=new URL(document.querySelector('link[rel="manifest"]').href),manifest=await(await fetch(url)).json();return url.pathname==='/my-finance/manifest.webmanifest'&&new URL(manifest.start_url,url).pathname==='/my-finance/'&&new URL(manifest.start_url,url).hash==='#home'&&new URL(manifest.scope,url).pathname==='/my-finance/'&&(await Promise.all(manifest.icons.map(async icon=>(await fetch(new URL(icon.src,url))).ok))).every(Boolean)})()`,'Manifest, project scope, #home launch and every icon resolve in the production subpath')
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});await reload()
  assert.deepEqual(normalized(await snapshot()),before);assert.deepEqual(await settings(),beforeSettings)
  await check(`document.documentElement.dataset.theme==='ocean'&&!window.__onboardingSeen`,'Upgraded v1.2 starts offline with non-default settings and saved theme')
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})

  // Exercise currency formatting and inline-category/Refund references through real production UI.
  let inlineRefundBackup
  for(const currency of ['CAD','USD','EUR','GBP']){
    await restore({...fixture,currency,data:{...fixture.data,applicationSettings:{...releaseSettings,currencyCode:currency}}})
    const cardRefund=await addRefund('card','25.00')
    await checkAccount('card',4000,currency,currency+' merchant Refund reduces card debt without becoming Income or Transfer')
    await route('transactions');await click('Add Transaction');await setType('refund')
    await field(`Amount (${currency})`,'25.00');await field('Destination account','bank');await field('Note (optional)','Inline bank return')
    const categoryId=await inlineCategory('  Inline returns RC  ')
    await check(`document.querySelector('select[id$="-category"]').value===${JSON.stringify(categoryId)}&&document.querySelector('input[id$="-amount"]').value==='25.00'&&document.querySelector('select[id$="-account"]').value==='bank'&&document.querySelector('textarea').value==='Inline bank return'`,currency+' inline Refund category is selected without losing the draft')
    await saveTransaction();await addRefund('cash','25.00','food','Cash return RC')
    await checkAccount('bank',277500,currency,currency+' bank Refund increases funds immediately')
    await checkAccount('cash',18500,currency,currency+' cash Refund increases funds immediately')
    await checkHome(18000,200000,currency,currency+' Refunds reduce Expenses while Income stays unchanged and Net Cash Flow improves')
    await check(`document.querySelector('.spending-donut-total dt').textContent==='Chart total'&&document.querySelector('.spending-donut-total dd').textContent===${JSON.stringify(fmt(20500,currency))}&&document.querySelector('.dashboard-breakdown').textContent.includes(${JSON.stringify(fmt(2500,currency))})`,currency+' negative inline category is excluded with an exact chart/net difference explanation')
    await check(`document.querySelector('.dashboard-activity').textContent.includes('Refund')&&[...document.querySelectorAll('.dashboard-activity .financial-refund')].every(e=>e.textContent.startsWith('+'))`,currency+' recent activity identifies Refund with category/account context and positive sign')
    const data=await snapshot(),savedSettings=await settings()
    assert.deepEqual(data.obligations,before.obligations);assert.deepEqual(data.obligationPayments,before.obligationPayments)
    for(const old of before.transactions)assert.deepEqual(data.transactions.find(t=>t.id===old.id),old)
    record(currency+' Refunds preserve every original transaction, tax/receipt, Bill, Installment and payment')
    await route('more/bills-installments')
    await check(`document.querySelector('.obligations-section').textContent.includes(${JSON.stringify(fmt(62000,currency))})&&document.querySelector('.obligations-section').textContent.includes('RC laptop')`,currency+' remaining installment balance and Bills list stay unchanged')
    await route('home');await check(`document.querySelector('.dashboard-payments').textContent.includes('RC laptop')&&document.querySelector('.dashboard-payments').textContent.includes(${JSON.stringify(fmt(6000,currency))})`,currency+' Upcoming Payments excludes Refund and keeps unpaid Bill balance')
    const backup=await downloadedBackup();assert.equal(backup.schemaVersion,3);assert.deepEqual(backup.data,{...data,applicationSettings:savedSettings});assert.deepEqual(backup.preferences,{theme:'ocean'})
    await restore(fixture);await restore(backup)
    assert.deepEqual(normalized(await snapshot()),normalized(data));assert.deepEqual(await settings(),savedSettings)
    record(currency+' Full Backup v3 round-trips inline category, Refund ID/cents/date/note/references and all original stores/settings/theme')
    await route('more/data-backup');await evaluate(`document.querySelectorAll('.backup-export-row')[1].click()`)
    const csvPath=join(artifacts,'my-finance-transactions-2026-10-06.csv'),csv=await downloaded(basename(csvPath));await rm(csvPath)
    await fileInput(csv,'backup-csv-file','refund-rc.csv');await wait(`!!document.querySelector('dialog[open]')`)
    await check(`document.querySelector('.backup-csv-counts').textContent.includes('Duplicate: 9')&&document.querySelector('.backup-dialog-footer button').disabled&&document.querySelector('.backup-preview-list').textContent.includes('Refund')`,currency+' real CSV preview recognizes all Refund duplicates without allowing double import');await click('Cancel')
    const blank={...backup,data:{...backup.data,transactions:[]}}
    await restore(blank);await fileInput(csv,'backup-csv-file','refund-rc.csv');await wait(`!!document.querySelector('dialog[open]')`)
    await check(`document.querySelector('.backup-csv-counts').textContent.includes('Ready: 9')`,currency+' CSV exported after inline creation resolves all Expense category/card references')
    await click('Import 9 transactions');await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]')`)
    assert.deepEqual(normalized(await snapshot()),normalized(data));assert.deepEqual(await settings(),savedSettings)
    record(currency+' actual CSV import recovers every exact Refund, tax-bearing Expense and original transaction')
    assert.ok(data.transactions.find(t=>t.id===cardRefund.id).type==='refund')
    inlineRefundBackup=backup
  }

  // Exact balances and debt/credit wording, including full refund and an overpaid card.
  const simple={...fixture,data:{...fixture.data,accounts:fixture.data.accounts.map(a=>({...a,openingBalance:a.id==='card'?0:100000})),transactions:['bank','cash','card'].map(accountId=>({id:'expense-'+accountId,type:'expense',date:'2026-10-01',amount:10000,categoryId:'food',accountId,...(accountId==='card'?{taxAmountCents:1300,receiptNumber:'Tax stays untouched'}:{})}))}}
  await restore(simple)
  for(const id of ['bank','cash','card'])await addRefund(id,'25.00','food','Quarter return '+id)
  await checkAccount('bank',92500,'GBP','Bank example: 1000 opening - 100 Expense + 25 Refund = 925')
  await checkAccount('cash',92500,'GBP','Cash example: 1000 opening - 100 Expense + 25 Refund = 925')
  await checkAccount('card',7500,'GBP','Card example: 100 Expense - 25 Refund = 75 debt')
  await check(`document.querySelector('.account-details-summary').textContent.includes('Debt owed')&&document.querySelector('.account-details-summary').textContent.includes(${JSON.stringify(fmt(42500,'GBP'))})`,'Card credit limit/available credit correctly track partial Refund')
  await addRefund('card','75.00','food','Full remaining return');await checkAccount('card',0,'GBP','Full card Refund returns debt to zero')
  await addRefund('card','10.00','food','Over return');await checkAccount('card',-1000,'GBP','Over-refund shows exact account credit rather than clamping debt')
  await check(`document.querySelector('.account-details-summary').textContent.includes('Account credit')&&document.querySelector('.account-details-summary').textContent.includes(${JSON.stringify(fmt(51000,'GBP'))})`,'Over-refund leaves credit limit intact and allows available credit above limit')
  assert.deepEqual((await snapshot()).transactions.find(t=>t.id==='expense-card'),simple.data.transactions.find(t=>t.id==='expense-card'))
  record('Refund following tax-bearing Expense changes only total spending; no automatic tax/receipt adjustment')

  const refundRecord={id:'cross-month-refund',type:'refund',amount:2500,date:'2026-10-06',accountId:'bank',categoryId:'food',note:'Previous month return'}
  await restore({...simple,data:{...simple.data,transactions:[{...simple.data.transactions[0],date:'2026-09-30'},refundRecord]}})
  await checkHome(-2500,0,'GBP','October cross-month Refund yields -25 Expenses and +25 cash flow without Income')
  await click('Previous month');await wait(`document.querySelector('.dashboard-summary')?.getAttribute('aria-label').includes('September')&&!document.querySelector('[aria-busy="true"]')`)
  await check(`document.querySelector('.dashboard-supporting').textContent.includes(${JSON.stringify(fmt(10000,'GBP'))})&&document.querySelector('.dashboard-activity').textContent.includes('Expense')&&!document.querySelector('.dashboard-activity').textContent.includes('Refund')`,'September Expense and selected-month recent activity remain unchanged')
  await click('Next month');await wait(`document.querySelector('.dashboard-summary')?.getAttribute('aria-label').includes('October')&&!document.querySelector('[aria-busy="true"]')`)
  await check(`!document.querySelector('.spending-donut-svg')&&document.querySelector('.dashboard-breakdown').textContent.includes('Refunds exceed')`,'Cross-month negative category has no negative donut slice and explains signed Expenses')
  const negative={...simple,data:{...simple.data,transactions:[{...refundRecord,amount:10000}]}}
  await restore(negative);await checkHome(-10000,0,'GBP','Refund-only month: exact -100 Expenses, zero Income, +100 Net Cash Flow')
  for(const theme of ['sage','ocean','dark']){
    await route('more');await evaluate(`document.querySelector('input[value="${theme}"]').click()`)
    for(const [width,font] of [[320,16],[390,16],[1280,16],[320,32],[390,32],[1280,32]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false});await evaluate(`document.documentElement.style.fontSize='${font}px'`)
      const label=`${theme} ${width}px ${font===32?'200%':'100%'}`
      await checkHome(-10000,0,'GBP',label+' negative Expenses and positive cash flow remain readable')
      await check(`document.documentElement.scrollWidth<=innerWidth&&!document.querySelector('.spending-donut-svg')&&document.querySelector('.dashboard-breakdown').textContent.includes(${JSON.stringify(fmt(-10000,'GBP'))})`,label+' refund-only Home has no overflow and never clamps signed totals')
      await route('transactions');await click('Add Transaction')
      await evaluate(`document.querySelector('.transaction-segment input[value="expense"]').focus()`)
      for(const type of ['income','transfer','refund'])await keyboard('ArrowRight')
      await check(`document.querySelector('.transaction-segment input:checked').value==='refund'&&document.querySelector('.transaction-segment:has(input:focus-visible)')!==null&&!document.querySelector('.transaction-receipt-details')`,label+' native keyboard selects Refund with visible focus and no tax/receipt/endpoints')
      await click('+ New category');await check(`document.activeElement===document.querySelector('.transaction-new-category input')&&document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth`,label+' inline category focuses a labelled input without dialog overflow')
      await field('New Expense category name','   ');await click('Save category')
      await check(`document.querySelector('.transaction-new-category [role="alert"]').textContent.includes('Enter a category name')&&document.querySelector('.transaction-new-category input').getAttribute('aria-invalid')==='true'`,label+' whitespace validation is linked and announced')
      await keyboard('Escape');await check(`document.activeElement===document.querySelector('.transaction-create-category')&&!!document.querySelector('dialog[open]')`,label+' Escape restores category-action focus and keeps the transaction editor')
      await click('Cancel');await wait(`!document.querySelector('dialog[open]')`)
      if(width===390&&font===16||theme==='dark'&&width===320&&font===32){await route('home');const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(join(artifacts,`${theme}-${width}-${font}-negative-expenses.png`),Buffer.from(shot.data,'base64'))}
    }
  }

  // New records and settings must also survive a subsequent application-shell update.
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false});await evaluate(`document.documentElement.style.fontSize='16px'`)
  await restore(inlineRefundBackup)
  const saved=normalized(await snapshot()),savedSettings=await settings(),savedTheme=await evaluate('({...localStorage})')
  await route('transactions');await click('Add Transaction');await setType('refund');await field('Amount (GBP)','13.57');await click('+ New category');await field('New Expense category name','Unfinished update draft')
  await evaluate(`window.__initialV12=true`)
  const nextBuild=join(artifacts,'v12-update-dist')
  await build({configFile:resolve('vite.config.ts'),build:{outDir:nextBuild,emptyOutDir:true},plugins:[{name:'v12-update-test-marker',transform(code,id){if(id.endsWith('/src/main.tsx'))return code+'\ndocument.documentElement.dataset.v12Update="verified"\n'}}]})
  directory=nextBuild;await evaluate(`navigator.serviceWorker.getRegistration().then(r=>r.update())`)
  await wait(`navigator.serviceWorker.getRegistration().then(r=>r.waiting?.state==='installed')`)
  await check(`window.__initialV12&&!document.documentElement.dataset.v12Update&&document.querySelector('input[id$="-amount"]').value==='13.57'&&document.querySelector('.transaction-new-category input').value==='Unfinished update draft'`,'Subsequent update waits without losing a Refund or inline-category draft')
  assert.deepEqual(normalized(await snapshot()),saved);assert.deepEqual(await settings(),savedSettings);assert.deepEqual(await evaluate('({...localStorage})'),savedTheme)
  await keyboard('Escape');await click('Cancel');await send('Page.navigate',{url:'about:blank'});await delay(600);await send('Page.navigate',{url:appURL+'#home'})
  await wait(`document.documentElement.dataset.v12Update==='verified'&&!!document.querySelector('.dashboard-summary')&&!!navigator.serviceWorker.controller`)
  assert.deepEqual(normalized(await snapshot()),saved);assert.deepEqual(await settings(),savedSettings);assert.deepEqual(await evaluate('({...localStorage})'),savedTheme)
  record('Subsequent activation preserves Refunds, inline categories, all six stores and theme exactly')
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});await reload()
  assert.deepEqual(normalized(await snapshot()),saved);assert.deepEqual(await settings(),savedSettings)
  await check(`document.documentElement.dataset.v12Update==='verified'&&!window.__onboardingSeen&&document.querySelector('.dashboard-activity').textContent.includes('Refund')`,'Updated production app reopens offline with persisted Refunds, inline categories and completed settings')
  await route('transactions');await click('Add Transaction');await setType('refund');const offlineCategory=await inlineCategory('Offline return category');await field('Amount (GBP)','1.25');await field('Destination account','card');await field('Note (optional)','Offline return');await saveTransaction()
  await reload();await check(`document.querySelector('.transactions-section').textContent.includes('Refund')`,'Refund and inline category creation also work offline and survive reload')
  const offline=await snapshot();assert.ok(offline.categories.some(c=>c.id===offlineCategory));assert.ok(offline.transactions.some(t=>t.type==='refund'&&t.categoryId===offlineCategory&&t.amount===125))
  record('Offline IndexedDB preserves the new Refund/category relationship without network or financial file caching')
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
  await check(`caches.keys().then(async names=>(await Promise.all(names.filter(n=>n.startsWith('my-finance-assets:')).map(async n=>(await(await caches.open(n)).keys()).every(r=>!r.url.endsWith('.csv')&&!r.url.endsWith('.json')&&!r.url.startsWith('blob:'))))).every(Boolean))`,'Imported/exported financial files are absent from project asset caches')

  // A completely empty production database must still support onboarding and first transaction entry.
  await send('Storage.clearDataForOrigin',{origin,storageTypes:'indexeddb,local_storage'});await reload()
  await wait(`!!document.querySelector('.finance-onboarding')`)
  await select('country','CA');await select('currency','CAD');await select('fiscal',4);await click('Start using My Finance')
  await route('home')
  const empty=await snapshot();assert.ok(Object.values(empty).every(records=>records.length===0));assert.deepEqual(await settings(),{id:'application',countryCode:'CA',currencyCode:'CAD',fiscalYearStartMonth:4,profileType:'personal',onboardingCompleted:true})
  record('Empty production install onboards Country/Currency/Fiscal only, persists choices and seeds no data')
  await route('accounts');await click('Add Account');await field('Account name','Fresh bank');await field('Opening balance (CAD)','1000');await saveTransaction()
  await click('Add Account');await field('Account name','Fresh card');await field('Account type','credit_card');await field('Opening debt owed (CAD)','0');await field('Credit limit (CAD, optional)','500');await saveTransaction()
  const freshAccounts=(await snapshot()).accounts,freshBank=freshAccounts.find(a=>a.name==='Fresh bank'),freshCard=freshAccounts.find(a=>a.name==='Fresh card')
  await route('transactions');await click('Add Transaction');await field('Amount (CAD)','100');await field('Account / payment source',freshBank.id);const freshCategory=await inlineCategory('Fresh groceries');await saveTransaction()
  await addRefund(freshCard.id,'25',freshCategory,'Fresh card return')
  const fresh=await snapshot();assert.equal(fresh.transactions.find(t=>t.type==='refund').accountId,freshCard.id)
  await checkHome(7500,0,'CAD','Fresh Expense plus credit-card Refund yields 75 net Expenses without Income')
  await route('accounts');await check(`document.querySelector('.accounts-section').textContent.includes('Account credit')&&document.querySelector('.accounts-section').textContent.includes('$25.00')`,'Fresh credit-card Refund supports account credit from zero debt')
  await reload();assert.deepEqual(normalized(await snapshot()),normalized(fresh));await check(`!window.__onboardingSeen`,'Fresh v1.2 records/settings persist across reload without repeated onboarding')

  const tag=(await run('git',['rev-parse','v1.1.0'],{windowsHide:true})).stdout.trim()
  assert.ok(requests.every(r=>r.method==='GET'));assert.ok(!requests.some(r=>r.url.includes('/src/')||r.url.includes('/@vite/')))
  assert.deepEqual(exceptions,[],'No uncaught production browser exceptions')
  await writeFile(join(artifacts,'results.json'),JSON.stringify({checks:results.length,baselineTag:tag,results,requests,before,beforeSettings,beforeSchema,beforePresentation,afterPresentation},null,2))
  console.log(`\n${results.length} v1.2 release-candidate production checks passed. Artifacts: ${artifacts}`)
}catch(error){
  if(socket?.readyState===WebSocket.OPEN){try{console.error(await evaluate(`({url:location.href,text:document.body?.textContent.slice(0,2500),active:document.activeElement?.outerHTML})`));const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(artifacts,'failure.png'),Buffer.from(shot.data,'base64'))}catch{ /* Browser may have exited. */ }}
  console.error('Review artifacts:',artifacts);throw error
}finally{
  if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify({id:++sequence,method:'Browser.close'}));await delay(400);socket.close()}
  if(browser.exitCode===null)browser.kill()
  server.closeAllConnections();await new Promise(resolveClose=>server.close(resolveClose))
  const target=resolve(profile);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('my-finance-v12-profile-'))
  await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}

