// Actual v1.0.0 production upgrade and v1.1 release regression. Node 24 + Chrome + git + tar.
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

const profile = await mkdtemp(join(tmpdir(), 'my-finance-release-profile-'))
const artifacts = await mkdtemp(join(tmpdir(), 'my-finance-release-review-'))
const run = promisify(execFile)
const oldSource = join(artifacts, 'v1-source'), archive = join(artifacts, 'v1.tar')
await mkdir(oldSource)
await run('git', ['archive', '--format=tar', '--output='+archive, 'v1.0.0'], { windowsHide:true })
await run('tar', ['-xf', archive, '-C', oldSource], { windowsHide:true })
await symlink(resolve('node_modules'), join(oldSource, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
const oldBuild = join(artifacts, 'v1-dist'), currentBuild = resolve('dist')
await build({root:oldSource,configFile:join(oldSource,'vite.config.ts'),build:{outDir:oldBuild,emptyOutDir:true}})
let directory = oldBuild
const oldWorker = await readFile(join(oldBuild,'sw.js'),'utf8'), newWorker = await readFile(join(currentBuild,'sw.js'),'utf8')
assert.notEqual(oldWorker,newWorker,'Released v1.0 and current v1.1 have distinct real asset revisions')
const requests = [], exceptions = [], results = []
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
const screens = { home:'.dashboard-summary', transactions:'.transaction-count', accounts:'.accounts-section', more:'.more-section', 'more/categories':'.categories-section', 'more/bills-installments':'.obligations-section', 'more/finance-settings':'.finance-settings', 'more/data-backup':'.data-backup-section', 'accounts/bank':'.account-details-summary', 'accounts/card':'.account-details-summary' }
async function route(hash) {
  await evaluate(`location.hash=${JSON.stringify(hash)}`)
  await wait(`!!document.querySelector(${JSON.stringify(screens[hash] ?? '.obligations-section')}) && !document.querySelector('.transaction-loading,.dashboard-status,.account-loading,.category-loading,.obligations-section [role="status"]') && !document.querySelector('[aria-busy="true"]')`)
  await delay(70)
}
async function reload() {
  await evaluate('window.__reloadMarker=true')
  await send('Page.reload')
  await wait(`!window.__reloadMarker && !!document.querySelector('.app-main h2') && !document.querySelector('[aria-busy="true"]')`)
  await delay(100)
}
async function fileInput(value, id = 'backup-restore-file', filename = 'release-review.json') {
  await evaluate(`(() => {const dt=new DataTransfer();dt.items.add(new File([${JSON.stringify(typeof value==='string'?value:JSON.stringify(value))}],${JSON.stringify(filename)},{type:${JSON.stringify(id==='backup-restore-file'?'application/json':'text/csv')}}));const e=document.getElementById(${JSON.stringify(id)});e.files=dt.files;e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await delay(100)
}
const snapshotExpression = `(async()=>{const request=indexedDB.open('my-finance');const db=await new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});const names=['accounts','categories','transactions','obligations','obligationPayments'];const tx=db.transaction(names,'readonly');const records=await Promise.all(names.map(name=>new Promise((resolve,reject)=>{const r=tx.objectStore(name).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})));db.close();return Object.fromEntries(names.map((name,i)=>[name,records[i]]))})()`
async function snapshot() { return evaluate(snapshotExpression) }
async function downloaded(name) { for(let i=0;i<120;i++){try{return await readFile(join(artifacts,name),'utf8')}catch{await delay(50)}} throw new Error(`Missing download ${name}`) }
const fixture = {
  format:'my-finance-backup', schemaVersion:2, exportedAt:'2026-10-05T16:00:00.000Z', currency:'CAD', kind:'full',
  sections:['accounts','categories','transactions','obligations','obligationPayments','preferences'], preferences:{theme:'dark'},
  data:{
    accounts:[{id:'bank',type:'bank',name:'Release bank',openingBalance:500000},{id:'card',type:'credit_card',name:'Release Visa',openingBalance:10000,creditLimit:100000}],
    categories:[{id:'food',type:'expense',name:'Food'},{id:'salary',type:'income',name:'Salary'}],
    transactions:[{id:'expense-雪',type:'expense',accountId:'bank',categoryId:'food',amount:2500,date:'2026-10-02',note:'Exact release note\nline two'},{id:'income',type:'income',accountId:'bank',categoryId:'salary',amount:250000,date:'2026-10-01'},{id:'transfer',type:'transfer',fromAccountId:'bank',toAccountId:'card',amount:5000,date:'2026-10-03'}],
    obligations:[{id:'bill',type:'bill',name:'Release mobile',dueDay:1,startMonth:'2026-01',isActive:true,expectedAmountCents:10000},{id:'loan',type:'installment',name:'Release laptop',dueDay:31,startMonth:'2026-09',isActive:true,originalAmountCents:100000,scheduledPaymentCents:15500}],
    obligationPayments:[{id:'bill-partial',obligationId:'bill',dueMonth:'2026-10',paidDate:'2026-10-02',amountCents:4000,note:'Recognizable partial history'},{id:'principal',obligationId:'loan',dueMonth:'2026-09',paidDate:'2026-09-15',amountCents:38000}],
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
  }
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable')
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:artifacts})
  await send('Emulation.setTimezoneOverride',{timezoneId:'America/Toronto'})
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false})
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-10-05T16:00:00Z']))}static now(){return new OriginalDate('2026-10-05T16:00:00Z').getTime()}};window.__onboardingSeen=false;new MutationObserver(()=>{if(document.querySelector('.finance-onboarding'))window.__onboardingSeen=true}).observe(document,{subtree:true,childList:true})`})
  await send('Page.navigate',{url:appURL+'#more/data-backup'})
  await wait(`!!document.querySelector('.data-backup-section')&&!document.querySelector('[aria-busy="true"]')`)
  await wait(`navigator.serviceWorker.getRegistration().then(r=>r?.active?.state==='activated')`)
  await restore(fixture)
  await route('more');await evaluate(`document.querySelector('input[value="ocean"]').click()`)
  await reload();await wait(`!!navigator.serviceWorker.controller`)
  const before=normalized(await snapshot()),preferencesBefore=await evaluate('({...localStorage})')
  assert.deepEqual(before,normalized(fixture.data));assert.equal(await settings(),null)
  record('Actual tagged v1.0 production build contains all recognizable financial/tracking records and no settings store')
  const beforePresentation=await captureFinancialPresentation()
  await route('home')
  await check(`document.querySelector('.dashboard-net-amount').textContent==='+$2,475.00'&&document.querySelector('.dashboard-supporting').textContent.includes('$25.00')`,'V1.0 baseline totals exclude Transfer and tracking payments')
  const oldAssets=await evaluate(`[...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(e=>e.src||e.href)`)
  const cacheBefore=await evaluate(`caches.keys()`)
  await evaluate(`caches.open('unrelated-release-cache')`)
  await route('transactions');await click('Add Transaction');await field('Amount (CAD)','12.34')
  await evaluate(`window.__v10Window=true`)
  directory=currentBuild
  await evaluate(`navigator.serviceWorker.getRegistration().then(r=>r.update())`)
  await wait(`navigator.serviceWorker.getRegistration().then(r=>r.waiting?.state==='installed')`)
  await check(`window.__v10Window===true&&!!document.querySelector('dialog[open]')&&document.querySelector('dialog input[inputmode="decimal"]').value==='12.34'`,'Real v1.1 assets wait without reloading v1.0 or losing a dirty editor')
  assert.deepEqual(normalized(await snapshot()),before);assert.equal(await settings(),null);assert.deepEqual(await evaluate('({...localStorage})'),preferencesBefore)
  record('Installing the actual v1.0-to-v1.1 worker update changes no data or theme')
  await click('Cancel');await send('Page.navigate',{url:'about:blank'});await delay(600)
  await send('Page.navigate',{url:appURL+'#home'})
  await wait(`!!document.querySelector('.dashboard-summary')&&!!navigator.serviceWorker.controller`)
  await check(`!window.__v10Window&&!window.__onboardingSeen&&!document.querySelector('.finance-onboarding')`,'Upgrade activates v1.1 without showing onboarding')
  const upgradedSettings=await settings()
  assert.deepEqual(upgradedSettings,{id:'application',countryCode:'CA',currencyCode:'CAD',profileType:'personal',fiscalYearStartMonth:1,onboardingCompleted:true})
  assert.deepEqual(normalized(await snapshot()),before);assert.deepEqual(await evaluate('({...localStorage})'),preferencesBefore)
  record('Upgrade adds only CA/CAD/January completed settings and preserves every integer, ID, date, reference and note')
  const afterPresentation=await captureFinancialPresentation()
  assert.deepEqual(afterPresentation,beforePresentation)
  record('All rendered account balances, Account Details, and dashboard totals match v1.0 exactly')
  const newAssets=await evaluate(`[...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(e=>e.src||e.href)`)
  assert.notDeepEqual(newAssets,oldAssets)
  const cacheAfter=await evaluate('caches.keys()')
  assert.equal(cacheAfter.filter(n=>n.startsWith('my-finance-assets:/my-finance/:')).length,1)
  assert.ok(cacheAfter.includes('unrelated-release-cache'));assert.ok(!cacheAfter.includes(cacheBefore.find(n=>n.startsWith('my-finance-assets:/my-finance/:'))))
  record('New hashed assets activate and only obsolete app caches are removed')
  await route('home');await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});await reload()
  await check(`document.documentElement.dataset.theme==='ocean'&&document.querySelector('.dashboard-payments').textContent.includes('Release laptop')`,'Upgraded v1.1 starts offline with original theme and tracking data')
  assert.deepEqual(normalized(await snapshot()),before);assert.deepEqual(await settings(),upgradedSettings)
  record('Offline IndexedDB access preserves all six stores exactly after actual release upgrade')
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
  await route('transactions');await evaluate(`document.querySelector('[data-transaction-id="expense-\u96ea"]').click()`)
  await wait(`!!document.querySelector('dialog[open]')`)
  await field('Amount (CAD)','115.00');await click('Tax & receipt (optional)');await field('Tax / VAT (CAD)','15.00');await field('Receipt number (optional)','=INV / release 2048')
  await check(`document.querySelector('.transaction-tax-summary').textContent.includes('$100.00')&&document.querySelector('.transaction-tax-summary').textContent.includes('$15.00')&&document.querySelector('.transaction-tax-total').textContent.includes('$115.00')`,'Tax example shows 100 subtotal, 15 included tax, and 115 authoritative total')
  await click('Save');await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]')`)
  const taxed=normalized(await snapshot()),expense=taxed.transactions.find(t=>t.type==='expense')
  assert.equal(expense.amount,11500);assert.equal(expense.taxAmountCents,1500);assert.equal(expense.receiptNumber,'=INV / release 2048')
  record('Actual editor persists exact total, included tax, and protected receipt text')
  for(const currency of ['CAD','USD','EUR','GBP']){
    await route('more/finance-settings');await select('currency',currency);await select('country','DE');await select('fiscal',7)
    await click('Save settings');await wait(`document.querySelector('.finance-settings [role="status"]').textContent.includes('saved')`)
    const selected=await settings()
    assert.equal(selected.currencyCode,currency);assert.equal(selected.countryCode,'DE');assert.equal(selected.fiscalYearStartMonth,7)
    assert.deepEqual(normalized(await snapshot()),taxed)
    record(currency+' confirmed settings edit preserves every financial/tracking record')
    await route('home')
    await check(`document.querySelector('.dashboard-summary').getAttribute('aria-label').includes('${currency}')&&document.querySelector('.dashboard-net-amount').textContent===${JSON.stringify('+'+fmt(238500,currency))}&&document.querySelector('.dashboard-supporting').textContent.includes(${JSON.stringify(fmt(11500,currency))})`,currency+' Home expenses use total paid once and currency updates immediately')
    await check(`document.querySelector('.spending-donut-total dd').textContent===${JSON.stringify(fmt(11500,currency))}&&document.querySelectorAll('.spending-donut-slice').length===1`,currency+' donut includes every expense cent without a separate tax or tracking slice')
    await check(`document.querySelector('.dashboard-payments').textContent.includes(${JSON.stringify(fmt(6000,currency))})&&document.querySelector('.dashboard-payments').textContent.includes(${JSON.stringify(fmt(15500,currency))})`,currency+' Upcoming Payments uses the same currency and partial-payment balance')
    await route('transactions')
    await check(`[...document.querySelectorAll('.transaction-list')].some(e=>e.textContent.includes(${JSON.stringify(fmt(11500,currency))}))&&document.querySelector('.transactions-section').textContent.includes('All amounts in ${currency}.')`,currency+' Transactions amounts and currency note agree')
    await click('Filters');await check(`document.querySelector('dialog').textContent.includes('Amount (${currency})')`,currency+' amount filters use the selected currency');await click('Cancel')
    await evaluate(`document.querySelector('[data-transaction-id="expense-\u96ea"]').click()`);await wait(`!!document.querySelector('dialog[open]')`)
    await check(`document.querySelector('dialog').textContent.includes('Tax / VAT (${currency})')&&document.querySelector('input[id$="-tax"]').value==='15.00'&&document.querySelector('.transaction-tax-total').textContent.includes(${JSON.stringify(fmt(11500,currency))})`,currency+' Tax / VAT editor preserves numeric values and reformats the breakdown');await click('Cancel')
    await route('accounts');await check(`document.querySelector('.accounts-section').textContent.includes(${JSON.stringify(fmt(733500,currency))})`,currency+' Account list applies 115 total-paid movement once')
    await route('accounts/bank');await check(`document.querySelector('.account-details-summary').textContent.includes(${JSON.stringify(fmt(733500,currency))})`,currency+' Account Details matches unchanged balance calculation')
    await route('more/bills-installments');await check(`[...document.querySelectorAll('.obligation-list')].map(e=>e.textContent).join(' ').includes(${JSON.stringify(fmt(10000,currency))})&&[...document.querySelectorAll('.obligation-list')].map(e=>e.textContent).join(' ').includes(${JSON.stringify(fmt(15500,currency))})&&[...document.querySelectorAll('.obligation-list')].map(e=>e.textContent).join(' ').includes(${JSON.stringify(fmt(62000,currency))})`,currency+' Bills, scheduled payments and remaining principal share the selected currency')
    await evaluate(`location.hash='more/bills-installments/bill'`);await wait(`!!document.querySelector('.obligation-facts')`);await click('Record payment')
    await check(`document.querySelector('dialog').textContent.includes('Amount (${currency})')`,currency+' tracking payment form uses the selected currency');await click('Cancel')
    await route('more/data-backup');await evaluate(`document.querySelector('.backup-export-row').click()`)
    const backup=JSON.parse(await downloaded('my-finance-backup-2026-10-05.json'))
    const expected={...taxed,applicationSettings:selected}
    assert.equal(backup.currency,currency);assert.equal(backup.schemaVersion,3);assert.deepEqual(backup.data,expected);assert.deepEqual(backup.preferences,{theme:'ocean'})
    await fileInput(backup);await wait(`!!document.querySelector('dialog[open]')`)
    await check(`document.querySelector('.backup-workspace').textContent.includes('${currency}')&&!/Personal|Business|profile type/i.test(document.querySelector('.backup-workspace').textContent)`,currency+' Backup preview uses readable currency and no profile choice');await click('Cancel')
    // A different valid destination makes restoration prove settings/theme replacement too.
    await restore({...backup,currency:'CAD',data:{...backup.data,applicationSettings:{...selected,countryCode:'CA',currencyCode:'CAD',fiscalYearStartMonth:1}},preferences:{theme:'dark'}})
    await restore(backup)
    assert.deepEqual(normalized(await snapshot()),taxed);assert.deepEqual(await settings(),selected)
    assert.equal(await evaluate(`localStorage.getItem('my-finance-theme')`),'ocean')
    record(currency+' production v3 round-trip restores country/currency/fiscal, all records, tax/receipt and theme exactly')
    // Remove the last download so subsequent iterations cannot read a stale file.
    await rm(join(artifacts,'my-finance-backup-2026-10-05.json'))
  }
  for(const theme of ['sage','ocean','dark']){
    await route('more');await evaluate(`document.querySelector('input[value="${theme}"]').click()`)
    for(const [width,font]of [[320,16],[390,16],[1280,16],[320,32],[390,32],[1280,32]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false})
      await evaluate(`document.documentElement.style.fontSize='${font}px'`)
      for(const hash of ['home','transactions','accounts','accounts/bank','more','more/categories','more/finance-settings','more/data-backup','more/bills-installments']){
        await route(hash)
        const name=`${theme} ${width}px ${font===32?'200%':'100%'} ${hash}`
        await check(`document.documentElement.scrollWidth<=innerWidth`,name+' has no horizontal overflow')
        await evaluate(`window.scrollTo(0,document.documentElement.scrollHeight)`)
        await check(`(()=>{const nav=document.querySelector('.app-navigation'),main=document.querySelector('.app-main');return getComputedStyle(nav).position!=='fixed'||main.getBoundingClientRect().bottom<=nav.getBoundingClientRect().top})()`,name+' final content clears navigation')
        await check(`!!document.querySelector('.app-main h2')&&document.querySelector('.app-main h2').tabIndex===-1`,name+' retains the keyboard route-heading target')
        if((width===390&&font===16&&['more','accounts/bank','more/categories'].includes(hash))||(width===320&&font===32&&hash==='accounts')){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(join(artifacts,`${theme}-${width}-${font}-${hash.replaceAll('/','-')}.png`),Buffer.from(shot.data,'base64'))}
      }
    }
  }
  assert.deepEqual(normalized(await snapshot()),taxed)
  await route('more/finance-settings')
  await check(`document.querySelectorAll('.finance-settings select').length===3&&!/Personal|Business|profile type|workspace type/i.test(document.querySelector('.finance-settings').textContent)`,'Release exposes only Country / Region, Currency and Fiscal year start')

  // Non-default settings must survive subsequent updates too, not just legacy defaults.
  const settingsBeforeUpdate=await settings(),themeBeforeUpdate=await evaluate('({...localStorage})')
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false})
  await evaluate(`document.documentElement.style.fontSize='16px'`)
  await route('transactions');await click('Add Transaction');await field('Amount (GBP)','12.34')
  await evaluate(`window.__existingV11=true`)
  const nextBuild=join(artifacts,'v11-update-dist')
  await build({configFile:resolve('vite.config.ts'),build:{outDir:nextBuild,emptyOutDir:true},plugins:[{name:'settings-update-test-marker',transform(code,id){if(id.endsWith('/src/main.tsx'))return code+'\ndocument.documentElement.dataset.settingsUpdate="verified"\n'}}]})
  directory=nextBuild
  await evaluate(`navigator.serviceWorker.getRegistration().then(r=>r.update())`)
  await wait(`navigator.serviceWorker.getRegistration().then(r=>r.waiting?.state==='installed')`)
  await check(`window.__existingV11&&!document.documentElement.dataset.settingsUpdate&&document.querySelector('dialog input[inputmode="decimal"]').value==='12.34'`,'Subsequent v1.1 update also waits for an open editor')
  assert.deepEqual(await settings(),settingsBeforeUpdate);assert.deepEqual(normalized(await snapshot()),taxed);assert.deepEqual(await evaluate('({...localStorage})'),themeBeforeUpdate)
  record('Installing a new v1.1 worker preserves non-default settings and all financial/tracking stores')
  await click('Cancel');await send('Page.navigate',{url:'about:blank'});await delay(600)
  await send('Page.navigate',{url:appURL+'#home'})
  await wait(`document.documentElement.dataset.settingsUpdate==='verified'&&!!document.querySelector('.dashboard-summary')&&!!navigator.serviceWorker.controller`)
  assert.deepEqual(await settings(),settingsBeforeUpdate);assert.deepEqual(normalized(await snapshot()),taxed);assert.deepEqual(await evaluate('({...localStorage})'),themeBeforeUpdate)
  await check(`!window.__onboardingSeen&&document.querySelector('.dashboard-summary').getAttribute('aria-label').includes('GBP')`,'Updated v1.1 keeps DE/GBP/July/completed settings and skips onboarding')
  record('Activation preserves applicationSettings, every financial/tracking table and localStorage theme exactly')
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});await reload()
  assert.deepEqual(await settings(),settingsBeforeUpdate);assert.deepEqual(normalized(await snapshot()),taxed)
  await check(`document.documentElement.dataset.settingsUpdate==='verified'&&document.documentElement.dataset.theme==='dark'&&document.querySelector('.dashboard-summary').getAttribute('aria-label').includes('GBP')`,'Updated build reopens offline with non-default currency/fiscal settings and saved theme')
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
  const tag=(await run('git',['rev-parse','v1.0.0'],{windowsHide:true})).stdout.trim()
  const report={checks:results.length,baselineTag:tag,results,requests,before,upgradedSettings,beforePresentation,afterPresentation}
  await writeFile(join(artifacts,'results.json'),JSON.stringify(report,null,2))
  assert.ok(requests.every(r=>r.method==='GET'));assert.ok(!requests.some(r=>r.url.includes('/src/')||r.url.includes('/@vite/')))
  assert.deepEqual(exceptions,[],'No uncaught browser exceptions')
  console.log(`\n${results.length} release-candidate browser checks passed. Artifacts: ${artifacts}`)
}catch(error){
  if(socket?.readyState===WebSocket.OPEN){try{console.error(await evaluate(`({url:location.href,text:document.body?.textContent.slice(0,2500)})`));const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(artifacts,'failure.png'),Buffer.from(shot.data,'base64'))}catch{ /* Browser may have exited. */ }}
  console.error('Review artifacts:',artifacts);throw error
}finally{
  if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify({id:++sequence,method:'Browser.close'}));await delay(400);socket.close()}
  if(browser.exitCode===null)browser.kill()
  server.closeAllConnections();await new Promise(resolveClose=>server.close(resolveClose))
  const target=resolve(profile);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('my-finance-release-profile-'))
  await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}
