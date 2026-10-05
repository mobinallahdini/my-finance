// Production-only release checks. Node 24 + Chrome; no development imports or dependencies.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { mkdtemp, readFile, writeFile, cp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { build } from 'vite'
import { parseCsv, writeCsv } from '../src/features/dataBackup/csv.ts'

const profile = await mkdtemp(join(tmpdir(), 'my-finance-pwa-profile-'))
const artifacts = await mkdtemp(join(tmpdir(), 'my-finance-pwa-review-'))
let directory = join(artifacts, 'build-a')
await cp(resolve('dist'), directory, { recursive: true })
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
const screens = { home:'.dashboard-summary', transactions:'.transaction-count', accounts:'.accounts-section', more:'.more-section', 'more/categories':'.categories-section', 'more/bills-installments':'.obligations-section', 'more/finance-settings':'.finance-settings', 'more/data-backup':'.data-backup-section' }
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
try {
  let port
  for(let i=0;i<200;i++){if(launchError)throw launchError;try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break}catch{await delay(50)}}
  assert.ok(port, 'Chrome starts')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  const protocol = await (await fetch(`http://127.0.0.1:${port}/json/protocol`)).json()
  socket = new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl)
  await new Promise((resolveOpen,reject)=>{socket.onopen=resolveOpen;socket.onerror=reject})
  socket.onmessage=({data})=>{
    const response=JSON.parse(data),promise=pending.get(response.id)
    if(promise){pending.delete(response.id);if(response.error)promise.reject(new Error(JSON.stringify(response.error)));else promise.resolve(response.result)}
    if(response.method==='Page.javascriptDialogOpening')void send('Page.handleJavaScriptDialog',{accept:true})
    if(response.method==='Runtime.exceptionThrown')exceptions.push(response.params.exceptionDetails.exception?.description ?? response.params.exceptionDetails.text)
  }
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable')
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:artifacts})
  await send('Emulation.setTimezoneOverride',{timezoneId:'America/Toronto'})
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false})
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-10-05T16:00:00Z']))}static now(){return new OriginalDate('2026-10-05T16:00:00Z').getTime()}};document.addEventListener('readystatechange',()=>{if(document.readyState==='interactive')window.__startupAppearance={theme:document.documentElement.dataset.theme,background:getComputedStyle(document.documentElement).backgroundColor,colorScheme:getComputedStyle(document.documentElement).colorScheme}})`})
  await send('Page.navigate',{url:appURL+'#more/data-backup'})
  await wait(`!!document.querySelector('.finance-onboarding')`)
  await evaluate(`(() => { for (const [suffix,value] of [['country','CA'],['currency','CAD']]) { const select=document.querySelector('select[id$="-'+suffix+'"]');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true})) } })()`)
  await click('Start using My Finance')
  await wait(`!!document.querySelector('.data-backup-section') && !document.querySelector('[aria-busy="true"]')`)
  await wait(`(async()=>{const r=await navigator.serviceWorker.getRegistration();return r?.active?.state==='activated'})()`)
  results.push('Production worker installs and activates under a subdirectory')
  const manifest=await send('Page.getAppManifest')
  assert.deepEqual(manifest.errors,[]);const parsed=JSON.parse(manifest.data)
  assert.equal(parsed.name,'My Finance');assert.equal(parsed.short_name,'My Finance');assert.equal(parsed.display,'standalone')
  assert.equal(new URL(parsed.start_url,manifest.url).href,appURL+'#home');assert.equal(new URL(parsed.scope,manifest.url).href,appURL)
  results.push('Browser recognizes manifest with relative launch URL/scope and standalone display')
  const installability=await send('Page.getInstallabilityErrors')
  assert.deepEqual(installability.installabilityErrors,[],'Chrome reports no installability errors');results.push('Chrome installability diagnostics pass')
  await check(`(async()=>{for(const [file,size] of [['icon-192.png',192],['icon-512.png',512],['maskable-512.png',512],['apple-touch-icon.png',180]]){const image=new Image();image.src='icons/'+file;await image.decode();if(image.naturalWidth!==size || image.naturalHeight!==size)return false}return true})()`, 'All four PNG icons decode at the intended dimensions')
  await check(`(async()=>{const image=new Image();image.src='icons/maskable-512.png';await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const context=canvas.getContext('2d');context.drawImage(image,0,0);const pixels=context.getImageData(0,0,512,512).data;let mark=0;for(let y=0;y<512;y++)for(let x=0;x<512;x++){const i=(y*512+x)*4;if(pixels[i+3]!==255)return false;if(pixels[i]>200&&pixels[i+1]>200&&pixels[i+2]>200){mark++;if((x-256)**2+(y-256)**2>204.8**2)return false}}return mark>5000})()`, 'Maskable PNG is fully opaque and keeps the bars within its safe circle')
  await check(`document.querySelector('meta[name="apple-mobile-web-app-capable"]').content==='yes' && document.querySelector('meta[name="viewport"]').content.includes('viewport-fit=cover')`, 'iOS standalone and safe-area metadata are present')
  await fileInput(fixture);await click('Replace current data');await wait(`!document.querySelector('dialog[open]') && !document.querySelector('[aria-busy="true"]')`)
  assert.deepEqual(normalized(await snapshot()),normalized(fixture.data));results.push('Full v2 Restore in production seeds all five exact tables')
  await route('home');await check(`document.querySelector('.dashboard-net-amount').textContent==='+$2,475.00' && document.querySelector('.dashboard-supporting').textContent.includes('+$2,500.00') && document.querySelector('.dashboard-supporting').textContent.includes('$25.00')`, 'Production dashboard excludes transfers from income/expenses/net cash flow')
  await check(`document.querySelector('.dashboard-payments').textContent.includes('Release mobile') && document.querySelector('.dashboard-payments').textContent.includes('Release laptop')`, 'Home Upcoming Payments reads restored tracking data')
  const homeBefore=await evaluate(`document.querySelector('.dashboard-section').textContent`)
  await route('accounts');await check(`document.querySelector('[data-account-id="bank"]').closest('li').textContent.includes('$7,425.00') && document.querySelector('[data-account-id="card"]').closest('li').textContent.includes('$50.00')`, 'Production bank and credit-card balances retain expense/income/transfer semantics')
  await route('more/bills-installments/bill');await check(`document.querySelector('.obligations-section').textContent.includes('Partial') && document.querySelector('.obligations-section').textContent.includes('Recognizable partial history')`, 'Bill partial status and payment history survive production restore')
  await route('more/bills-installments/loan');await check(`document.querySelector('.obligations-section').textContent.includes('$620.00') && document.querySelector('.obligations-section').textContent.includes('$380.00')`, 'Installment remaining principal and history match')
  await route('transactions');await click('Filters');await check(`!!document.querySelector('dialog[open]')`, 'Advanced filters open in production')
  await evaluate(`for(const input of document.querySelectorAll('dialog input[name="types"]'))if(input.checked !== (input.value==='expense'))input.click()`);await click('Apply filters')
  await check(`document.querySelector('.transaction-count').textContent==='1 of 3 transactions'`, 'Type filter returns exact expected transaction count')
  await click('Clear all')
  await route('more/data-backup');await evaluate(`document.querySelector('.backup-export-row').click()`)
  const exported=JSON.parse(await downloaded('my-finance-backup-2026-10-05.json'))
  assert.equal(exported.schemaVersion,3);const {applicationSettings,...exportedRecords}=exported.data;assert.deepEqual(normalized(exportedRecords),normalized(fixture.data));assert.deepEqual(applicationSettings,{id:'application',countryCode:'CA',currencyCode:'CAD',profileType:'personal',fiscalYearStartMonth:1,onboardingCompleted:true});assert.deepEqual(exported.preferences,{theme:'dark'});results.push('Production Full Backup download preserves every record and theme')
  await evaluate(`document.querySelectorAll('.backup-export-row')[1].click()`)
  const csv=await downloaded('my-finance-transactions-2026-10-05.csv')
  assert.ok(csv.includes('expense-雪'));assert.ok(csv.includes('25.00'));results.push('Production Transactions CSV downloads exact IDs/cents')
  await reload();await check(`!!navigator.serviceWorker.controller`, 'Normal production reload is controlled by the worker')
  await evaluate(`caches.open('unrelated-application-cache').then(c=>c.put('unrelated',new Response('keep')))`)
  const cacheBefore=await evaluate(`caches.keys()`)
  const allowed=new Set(JSON.parse((await readFile(join(directory,'sw.js'),'utf8')).match(/const files = (\[[^\n]+\])/)[1]).map(file=>appURL+file))
  const cacheURLs=await evaluate(`(async()=>{const names=await caches.keys();const cache=await caches.open(names.find(n=>n.startsWith('my-finance-assets:/my-finance/:')));return(await cache.keys()).map(r=>r.url)})()`)
  assert.deepEqual(new Set(cacheURLs),allowed);results.push('Cache contains only shell, hashed assets, manifest, and icons; no financial files')
  await check(`(async()=>{await fetch('review-backup.json').catch(()=>{});await fetch('review-import.csv').catch(()=>{});const url=URL.createObjectURL(new Blob(['private export']));const text=await(await fetch(url)).text();URL.revokeObjectURL(url);return text==='private export' && (await Promise.all((await caches.keys()).filter(n=>n.startsWith('my-finance-assets:')).map(async n=>(await(await caches.open(n)).keys()).every(r=>!r.url.includes('review-backup')&&!r.url.includes('review-import')&&!r.url.startsWith('blob:'))))).every(Boolean)})()`, 'Unknown backup/import paths and user Blob URLs bypass asset caching')
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1})
  await reload();await check(`!!document.querySelector('.data-backup-section') && !!navigator.serviceWorker.controller`, 'Production offline reload serves cached shell and hashed assets')
  assert.deepEqual(normalized(await snapshot()),normalized(fixture.data));results.push('Offline IndexedDB retains exact financial and obligation data')
  for(const hash of Object.keys(screens)){await route(hash);await check(`!!document.querySelector(${JSON.stringify(screens[hash])}) && !document.querySelector('[role="alert"]')`, `${hash} loads offline without storage errors`)}
  await route('home');assert.equal(await evaluate(`document.querySelector('.dashboard-section').textContent`),homeBefore);results.push('Offline Home totals and Upcoming Payments match online state')
  await send('Page.navigate',{url:appURL+'index.html#home'});await wait(`!!document.querySelector('.dashboard-summary') && !!navigator.serviceWorker.controller`)
  results.push('Explicit index.html launch also works offline with hash navigation')
  const metadataBackup=structuredClone(exported),originalExpense=metadataBackup.data.transactions.find(t=>t.type==='expense')
  originalExpense.taxAmountCents=500;originalExpense.receiptNumber='INV / offline \u96ea'
  await route('more/data-backup');await fileInput(metadataBackup);await click('Replace current data');await wait(`!document.querySelector('dialog[open]') && !document.querySelector('[aria-busy="true"]')`)
  const offlineMetadata=(await snapshot()).transactions.find(t=>t.id===originalExpense.id)
  assert.equal(offlineMetadata.taxAmountCents,500);assert.equal(offlineMetadata.receiptNumber,originalExpense.receiptNumber)
  results.push('Offline v3 restore preserves Expense tax and receipt metadata')
  await fileInput(exported);await click('Replace current data');await wait(`!document.querySelector('dialog[open]') && !document.querySelector('[aria-busy="true"]')`)
  await fileInput(csv,'backup-csv-file','release-transactions.csv')
  await check(`document.querySelector('.backup-csv-counts').textContent.includes('Duplicate: 3') && document.querySelector('.backup-dialog-footer button').disabled`, 'Offline CSV import recognizes existing rows without duplicating them')
  await click('Cancel')
  let importCsv=csv.replace('expense-雪','imported-expense')
    .replace("\"'income\",\"'income\"", "\"'imported-income\",\"'income\"")
    .replace("\"'transfer\",\"'transfer\"", "\"'imported-transfer\",\"'transfer\"")
  const csvMatrix=parseCsv(importCsv),csvHeader=csvMatrix[0],csvExpense=csvMatrix.slice(1).find(row=>row[csvHeader.indexOf('type')]==="'expense")
  csvExpense[csvHeader.indexOf('tax_amount')]='5.00';csvExpense[csvHeader.indexOf('receipt_number')]="'=INV / offline"
  importCsv=writeCsv(csvHeader,csvMatrix.slice(1))
  await fileInput(importCsv,'backup-csv-file','release-new-transactions.csv')
  await check(`document.querySelector('.backup-csv-counts').textContent.includes('Ready: 3')`, 'Offline CSV preview validates new expense, income, and transfer rows')
  await click('Import 3 transactions');await wait(`!document.querySelector('dialog[open]') && !document.querySelector('[aria-busy="true"]')`)
  const offlineImported=(await snapshot()).transactions
  assert.equal(offlineImported.length,6);results.push('Offline CSV import commits all three financial variants')
  const importedExpense=offlineImported.find(t=>t.id==='imported-expense')
  assert.equal(importedExpense.taxAmountCents,500);assert.equal(importedExpense.receiptNumber,'=INV / offline')
  results.push('Offline CSV import preserves exact tax and protected receipt metadata')
  await fileInput(exported);await click('Replace current data');await wait(`!document.querySelector('dialog[open]') && !document.querySelector('[aria-busy="true"]')`)
  assert.deepEqual(normalized(await snapshot()),normalized(fixture.data));results.push('Offline Full Restore replaces finances and tracking correctly')
  await route('transactions')
  for(const [type,amount] of [['Expense','1.23'],['Income','4.56'],['Transfer','7.89']]){
    await click('Add Transaction');if(type!=='Expense')await click(type,'label')
    await field('Amount (CAD)',amount)
    if(type==='Transfer'){await field('From account','bank');await field('To account','card')}
    else{await field(type+' category',type==='Expense'?'food':'salary');await field(type==='Income'?'Destination account':'Account / payment source','bank')}
    await field('Note (optional)','Offline editor '+type);await click('Save');await wait(`!document.querySelector('dialog[open]')`)
    const record=(await snapshot()).transactions.find(r=>r.note==='Offline editor '+type)
    assert.equal(record.amount,Math.round(Number(amount)*100));assert.equal(record.type,type.toLowerCase());results.push(`${type} editor saves exact cents offline`)
  }
  await route('more/data-backup');await fileInput(exported);await click('Replace current data');await wait(`!document.querySelector('dialog[open]') && !document.querySelector('[aria-busy="true"]')`)
  for(const [theme,color] of [['sage','rgb(244, 247, 246)'],['ocean','rgb(242, 246, 250)'],['dark','rgb(17, 27, 36)']]){
    await route('more');await evaluate(`document.querySelector('input[value="${theme}"]').click()`);await reload()
    await check(`window.__startupAppearance.theme==='${theme}' && window.__startupAppearance.background==='${color}' && document.documentElement.dataset.theme==='${theme}'`, `${theme} applies before module rendering on offline startup`)
    for(const [width,height,font] of [[320,760,16],[390,844,16],[1280,900,16],[320,844,32],[390,844,32],[1280,900,32]]){
      await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false})
      await evaluate(`document.documentElement.style.fontSize='${font}px'`)
      for(const hash of ['home','transactions','accounts','more/bills-installments','more/finance-settings','more/data-backup']){
        await route(hash);await check(`document.documentElement.scrollWidth<=document.documentElement.clientWidth`, `${theme} ${width}px ${font===32?'200%':'100%'} ${hash} fits`)
      }
      await evaluate(`window.scrollTo(0,document.documentElement.scrollHeight)`)
      await check(`(()=>{const nav=document.querySelector('.app-navigation'),main=document.querySelector('.app-main');return getComputedStyle(nav).position!=='fixed'||main.getBoundingClientRect().bottom<=nav.getBoundingClientRect().top})()`, 'Final content clears fixed navigation')
      await fileInput(exported);await check(`(()=>{const d=document.querySelector('dialog[open]'),body=document.querySelector('.backup-dialog-body');return !!d && d.scrollWidth<=d.clientWidth && body.clientHeight>150 && document.querySelector('.backup-dialog-footer').getBoundingClientRect().bottom<=innerHeight})()`, 'Production restore dialog scrolls with accessible footer')
      await click('Cancel');await route('transactions');await click('Add Transaction')
      await check(`(()=>{const d=document.querySelector('dialog[open]');return !!d && d.scrollWidth<=d.clientWidth && d.getBoundingClientRect().bottom<=innerHeight})()`, 'Production transaction editor fits')
      await click('Cancel')
      if(width===390&&font===16){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(artifacts,theme+'-offline.png'),Buffer.from(shot.data,'base64'))}
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:420,deviceScaleFactor:1,mobile:false})
  await evaluate(`document.documentElement.style.fontSize='16px'`);await click('Add Transaction')
  await check(`document.querySelector('dialog[open]').getBoundingClientRect().bottom<=innerHeight && document.activeElement.tagName==='INPUT'`, 'Editor retains focused input in a reduced keyboard-sized viewport')
  await click('Cancel')
  if(protocol.domains.find(d=>d.domain==='Emulation').commands.some(c=>c.name==='setSafeAreaInsetsOverride')){
    await send('Emulation.setDeviceMetricsOverride',{width:700,height:500,deviceScaleFactor:1,mobile:false})
    await send('Emulation.setSafeAreaInsetsOverride',{insets:{top:24,bottom:20,left:36,right:36}})
    await route('home')
    await check(`parseFloat(getComputedStyle(document.querySelector('.app-shell')).paddingTop)>=24 && parseFloat(getComputedStyle(document.querySelector('.app-shell')).paddingLeft)>=36 && parseFloat(getComputedStyle(document.querySelector('.app-navigation')).paddingBottom)>=20`, 'Emulated cutouts keep shell and navigation inside safe areas')
    await route('transactions');await click('Add Transaction')
    await check(`parseFloat(getComputedStyle(document.querySelector('.transaction-editor-header')).paddingLeft)>=36 && parseFloat(getComputedStyle(document.querySelector('.transaction-editor-body')).paddingRight)>=36`, 'Full-screen editor honors landscape side cutouts')
    await click('Cancel');await route('more/data-backup');await fileInput(exported)
    await check(`parseFloat(getComputedStyle(document.querySelector('.backup-dialog-header')).paddingLeft)>=36 && parseFloat(getComputedStyle(document.querySelector('.backup-dialog-footer')).paddingRight)>=36`, 'Backup preview honors landscape side cutouts')
    await click('Cancel');await send('Emulation.setSafeAreaInsetsOverride',{insets:{top:0,bottom:0,left:0,right:0}})
  }else console.log('Browser does not expose safe-area emulation; physical cutout review remains.')
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
  await route('more');await evaluate(`document.querySelector('input[value="dark"]').click()`)
  const exactBefore=await snapshot(), preferencesBefore=await evaluate(`({...localStorage})`)
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false})
  await route('transactions');await click('Add Transaction');await field('Amount (CAD)','12.34')
  await evaluate(`window.__openBuild='A'`)
  const buildB=join(artifacts,'build-b')
  await build({configFile:resolve('vite.config.ts'),build:{outDir:buildB,emptyOutDir:true},plugins:[{name:'release-lifecycle-test-marker',transform(code,id){if(id.endsWith('/src/main.tsx'))return code+'\ndocument.documentElement.dataset.releaseCheck="B"\n'}}]})
  assert.notEqual(await readFile(join(directory,'sw.js'),'utf8'),await readFile(join(buildB,'sw.js'),'utf8'),'Real rebuild produces a new revision and asset graph')
  directory=buildB
  await evaluate(`navigator.serviceWorker.getRegistration().then(r=>r.update())`)
  await wait(`navigator.serviceWorker.getRegistration().then(r=>r.waiting?.state==='installed')`)
  await check(`window.__openBuild==='A' && !document.documentElement.dataset.releaseCheck && !!document.querySelector('dialog[open]') && document.querySelector('dialog input[inputmode="decimal"]').value==='12.34'`, 'Build B waits without reloading build A or destroying a dirty editor')
  assert.deepEqual(await snapshot(),exactBefore);assert.deepEqual(await evaluate(`({...localStorage})`),preferencesBefore);results.push('Installing the update preserves exact IndexedDB and preferences')
  await click('Cancel')
  // Navigating away releases the last controlled client, like closing every app window.
  await send('Page.navigate',{url:'about:blank'});await delay(500)
  await send('Page.navigate',{url:appURL+'#home'})
  await wait(`document.documentElement.dataset.releaseCheck==='B' && !!document.querySelector('.dashboard-summary') && !!navigator.serviceWorker.controller`)
  assert.deepEqual(await snapshot(),exactBefore);assert.deepEqual(await evaluate(`({...localStorage})`),preferencesBefore);results.push('Build B activates after all old app clients leave and retains exact five-table data/theme')
  const cacheAfter=await evaluate('caches.keys()')
  assert.ok(cacheAfter.includes('unrelated-application-cache'));assert.equal(cacheAfter.filter(n=>n.startsWith('my-finance-assets:/my-finance/:')).length,1)
  assert.ok(!cacheAfter.includes(cacheBefore.find(n=>n.startsWith('my-finance-assets:/my-finance/:'))));results.push('Activation removes only old application asset caches and preserves unrelated caches')
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});await reload()
  await check(`document.documentElement.dataset.releaseCheck==='B' && document.querySelector('.dashboard-payments').textContent.includes('Release laptop')`, 'Updated build reopens offline with preserved data')
  await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1})
  await send('Network.setBlockedURLs',{urls:[origin+'/sw.js']})
  await send('Page.navigate',{url:origin+'/#home'});await wait(`!!document.querySelector('.dashboard-summary')`)
  await delay(200)
  await check(`!document.querySelector('[role="alert"]') && document.querySelector('.dashboard-payments').textContent.includes('Release laptop')`, 'Blocked service-worker registration leaves the ordinary app and local data usable')
  await send('Network.setBlockedURLs',{urls:[]});await reload()
  await wait(`navigator.serviceWorker.getRegistration().then(r=>r?.scope===${JSON.stringify(origin+'/')} && r.active?.state==='activated')`)
  results.push('Same production build also registers successfully at the hosting root')
  assert.ok(requests.every(r=>r.method==='GET'),'No financial POST or upload requests')
  assert.ok(!requests.some(r=>r.url.includes('/src/') || r.url.includes('/@vite/')),'Production never requests a development module')
  assert.deepEqual(exceptions,[],'No uncaught browser exceptions')
  await writeFile(join(artifacts,'results.json'),JSON.stringify({checks:results.length,results,requests},null,2))
  console.log(`\n${results.length} production/PWA browser checks passed. Artifacts: ${artifacts}`)
} catch(error) {
  if(socket?.readyState===WebSocket.OPEN){try{console.error(await evaluate(`({url:location.href,text:document.body?.textContent.slice(0,2500)})`));const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(artifacts,'failure.png'),Buffer.from(shot.data,'base64'))}catch{ /* Browser may have exited. */ }}
  console.error('Review artifacts:',artifacts);throw error
} finally {
  if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify({id:++sequence,method:'Browser.close'}));await delay(400);socket.close()}
  if(browser.exitCode===null)browser.kill()
  server.closeAllConnections();await new Promise(resolveClose=>server.close(resolveClose))
  const target=resolve(profile);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('my-finance-pwa-profile-'))
  await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}
