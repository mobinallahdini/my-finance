// Explicit downloads and Chromium's native PDF renderer; all data is disposable.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, readdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer, normalizePath, preview } from 'vite'
import { prepareFinancialReport } from '../src/domain/reporting.ts'
import { createReportFilters } from '../src/domain/transactionQuery.ts'
import { dollarsForInput, formatMoney } from '../src/features/accounts/money.ts'
import { parseCsv, unprotectCsvText } from '../src/features/dataBackup/csv.ts'
import { createBackup } from '../src/features/dataBackup/backupFormat.ts'
import { reportSummaryMetrics } from '../src/features/reports/reportPresentation.ts'

const profile = await mkdtemp(join(tmpdir(), 'my-finance-report-exports-profile-'))
const artifacts = await mkdtemp(join(tmpdir(), 'my-finance-report-exports-review-'))
const chrome = process.env.CHROME_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome')
const browser = spawn(chrome, ['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check',
  '--disable-extensions','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0, launchError, development, production
const pending = new Map(), results = [], exceptions = [], requests = []
browser.on('error', error => { launchError = error })
function send(method, params = {}) {
  return new Promise((resolvePromise, reject) => {
    const id = ++sequence; pending.set(id, { resolve: resolvePromise, reject }); socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
  return response.result.value
}
async function wait(expression) {
  for (let i = 0; i < 240; i++) { if (await evaluate(expression)) return; await delay(50) }
  throw new Error(`Timed out: ${expression}`)
}
async function frame() { await evaluate('new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))') }
async function settled() { await wait(`!!document.querySelector('.report-content[aria-busy="false"] [data-metric]')`); await frame() }
async function check(expression, name) { assert.ok(await evaluate(`Boolean(${expression})`), name); results.push(name); console.log(`PASS ${name}`) }
function passed(name) { results.push(name); console.log(`PASS ${name}`) }
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`); await frame() }
async function field(selector, value) {
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)}), prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype,'value').set.call(element,${JSON.stringify(value)});
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input',{bubbles:true}));
  })()`); await frame()
}
async function key(value) {
  const keyCode = { Tab: 9, Enter: 13, Escape: 27, ' ': 32 }[value]
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:value,code:value === ' ' ? 'Space' : value,windowsVirtualKeyCode:keyCode,...(value === 'Enter' ? {text:'\r'} : {})})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:value,code:value === ' ' ? 'Space' : value,windowsVirtualKeyCode:keyCode}); await frame()
}
const base = {
  accounts: [{id:'bank',name:'Main, "Bank"',type:'bank',openingBalance:100000},{id:'card',name:'=Visa()',type:'credit_card',openingBalance:0,creditLimit:50000}],
  categories: [{id:'food',name:'@Groceries',type:'expense'},{id:'salary',name:'Salary',type:'income'}],
  transactions: [
    {id:'receipt',type:'expense',date:'2026-10-05',amount:11500,accountId:'card',categoryId:'food',taxAmountCents:1500,receiptNumber:'+RC-0042 / 雪',note:'=SUM(1,2)\r\n"quoted", 雪'},
    {id:'refund',type:'refund',date:'2026-10-04',amount:25000,accountId:'card',categoryId:'food',note:'Returned'},
    {id:'income',type:'income',date:'2026-10-03',amount:100000,accountId:'bank',categoryId:'salary'},
    {id:'transfer',type:'transfer',date:'2026-10-02',amount:5000,fromAccountId:'bank',toAccountId:'card'},
    {id:'no-tax',type:'expense',date:'2026-10-01',amount:101,accountId:'bank',categoryId:'food'},
    {id:'zero-subtotal',type:'expense',date:'2026-09-30',amount:100,accountId:'bank',categoryId:'food',taxAmountCents:100},
    ...Array.from({length:65},(_,i)=>({id:`history-${String(i).padStart(3,'0')}`,type:'expense',date:'2026-09-01',amount:1+i,accountId:'bank',categoryId:'food',note:`History ${i}`})),
  ], obligations: [], obligationPayments: [],
  applicationSettings:{id:'application',countryCode:'CA',currencyCode:'EUR',profileType:'personal',fiscalYearStartMonth:1,onboardingCompleted:true},
}
let data = structuredClone(base), filters = createReportFilters(), grouping = 'none'
function expected() { return prepareFinancialReport({...data,filters,grouping}) }
async function snapshot() {
  return evaluate(`new Promise((resolveSnapshot,reject)=>{
    const request=indexedDB.open('my-finance'); request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const database=request.result,names=Array.from(database.objectStoreNames).sort(),data={};
      const transaction=database.transaction(names,'readonly');
      const schema=names.map(name=>{const store=transaction.objectStore(name),read=store.getAll();read.onsuccess=()=>{data[name]=read.result};
        return {name,key:store.keyPath,indexes:Array.from(store.indexNames).map(id=>{const index=store.index(id);return {name:index.name,key:index.keyPath,unique:index.unique}})};
      });transaction.oncomplete=()=>{const version=database.version;database.close();resolveSnapshot({version,schema,data})};transaction.onabort=()=>reject(transaction.error);
    };
  })`)
}
async function seed(value) {
  data = structuredClone(value)
  await evaluate(`import('/src/persistence/dataBackup.ts').then(async module=>{
    await module.replaceWorkspaceSnapshot(${JSON.stringify(data)});(await import('/src/features/shared/dataRefresh.ts')).notifyDataChanged();window.__exportWrites=[];
  })`); await settled()
  await wait(`document.querySelector('.report-currency').textContent === ${JSON.stringify(data.applicationSettings.currencyCode)}`)
}
async function apply(criteria) {
  await click('.report-toolbar-actions button'); await wait(`!!document.querySelector('dialog[open]')`)
  await click('.transaction-filter-clear-draft')
  if (criteria.query) await field('dialog input[type="search"]',criteria.query)
  if (criteria.types) await evaluate(`document.querySelectorAll('dialog input[name="types"]').forEach(input=>{if(input.checked!==${JSON.stringify(criteria.types)}.includes(input.value))input.click()})`)
  await click('dialog button[type="submit"]'); filters=createReportFilters(criteria); await settled()
}
async function csv(action = 'rows', keyboard = false) {
  const directory = await mkdtemp(join(artifacts, 'csv-'))
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory })
  const selector = `.report-export-actions button:nth-child(${action === 'rows' ? 1 : 2})`
  if (keyboard) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`); await key('Enter') }
  else await click(selector)
  for (let i=0;i<240;i++) {
    const filenames=(await readdir(directory)).filter(name=>name.endsWith('.csv'))
    if(filenames.length) return {filename:filenames[0],rows:parseCsv(await readFile(join(directory,filenames[0]),'utf8'))}
    await delay(50)
  }
  throw new Error('CSV download did not complete')
}
async function preparePrint() { await click('.report-export-actions button:nth-child(3)'); await wait(`!!document.querySelector('.report-print')`) }
async function finishPrint() { await evaluate(`window.dispatchEvent(new Event('afterprint'))`); await wait(`!document.querySelector('.report-print')`); await frame() }
async function verifySummaryCsv(name) {
  const {rows:[headers,...rows]}=await csv('summary'), report=expected()
  assert.equal(headers.length,7);assert.ok(rows.every(row=>row.length===7))
  const global=rows.filter(row=>unprotectCsvText(row[0])==='global')
  assert.equal(global.length,7)
  for(const [key,label] of reportSummaryMetrics) assert.equal(global.find(row=>unprotectCsvText(row[3])===label)[4],key==='transactionCount'?String(report.summary[key]):dollarsForInput(report.summary[key]))
  passed(name)
}
try {
  development=await createServer({server:{host:'127.0.0.1',port:0},plugins:[{name:'export-preparation-counter',enforce:'pre',transform(source,id){
    if(id.split('?')[0]===normalizePath(resolve('src/domain/reporting.ts')))return source.replace('export function prepareFinancialReport(query: ReportQuery): PreparedReport {','export function prepareFinancialReport(query: ReportQuery): PreparedReport { if(typeof window!=="undefined")window.__exportPreparations=(window.__exportPreparations??0)+1;')
    if(id.split('?')[0]===normalizePath(resolve('src/persistence/dataBackup.ts')))return source.replace('export async function readFinancialSnapshot(): Promise<FinancialSnapshot> {','export async function readFinancialSnapshot(): Promise<FinancialSnapshot> { if(typeof window!=="undefined"&&window.__exportReadGate)await window.__exportReadGate;')
  }}]});await development.listen()
  let port
  for(let i=0;i<200;i++){if(launchError)throw launchError;try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break}catch{await delay(50)}}
  assert.ok(port)
  const pages=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket=new WebSocket(pages.find(page=>page.type==='page').webSocketDebuggerUrl)
  await new Promise((resolveOpen,reject)=>{socket.onopen=resolveOpen;socket.onerror=reject})
  socket.onmessage=({data:message})=>{const response=JSON.parse(message),promise=pending.get(response.id);
    if(promise){pending.delete(response.id);if(response.error)promise.reject(new Error(JSON.stringify(response.error)));else promise.resolve(response.result)}
    if(response.method==='Runtime.exceptionThrown')exceptions.push(response.params.exceptionDetails.exception?.description??response.params.exceptionDetails.text)
    if(response.method==='Network.requestWillBeSent')requests.push({url:response.params.request.url,method:response.params.request.method})
  }
  await send('Page.enable');await send('Runtime.enable');await send('Network.enable')
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:artifacts})
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false})
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    window.__exportWrites=[];window.__nativePrintRequests=0;window.print=()=>{window.__nativePrintRequests++};window.__exportUrls=new Set();
    const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
    URL.createObjectURL=blob=>{const url=create(blob);window.__exportUrls.add(url);return url};URL.revokeObjectURL=url=>{window.__exportUrls.delete(url);revoke(url)};
    for(const method of ['add','put','delete','clear']){const original=IDBObjectStore.prototype[method];IDBObjectStore.prototype[method]=function(...args){window.__exportWrites.push(this.name+':'+method);return original.apply(this,args)}};
  `})
  const url=`http://127.0.0.1:${development.httpServer.address().port}/`
  await send('Page.navigate',{url:url+'src/domain/README.md'});await wait(`document.readyState==='complete'`)
  await evaluate(`import('/src/persistence/dataBackup.ts').then(module=>module.replaceWorkspaceSnapshot(${JSON.stringify(data)}))`)
  await send('Page.navigate',{url:url+'#more/reports'});await settled()
  await field('#report-period','all');await settled()
  await evaluate(`window.__exportReadGate=new Promise(resolve=>window.__releaseExportRead=resolve);true`)
  await click('.report-refresh')
  await check(`[...document.querySelectorAll('.report-export-actions button')].every(button=>button.disabled) && !document.querySelector('[data-metric]')`, 'Loading disables every export action and hides stale report values')
  await evaluate(`window.__releaseExportRead();window.__exportReadGate=null`);await settled()
  const baseline=await snapshot(),prepares=await evaluate('window.__exportPreparations')
  await evaluate('window.__exportWrites=[]')
  await check(`!document.querySelector('.report-print') && document.activeElement.id!=='reports-heading'`,'Initial deep link creates no print DOM and does not move heading focus')
  assert.equal((await readdir(artifacts)).length,0);passed('No files download without an explicit action')
  await click('.report-pagination button:last-child')
  let download=await csv('rows',true)
  assert.equal(download.rows.length,expected().rows.length+1)
  assert.equal(download.rows[0].length,8)
  assert.deepEqual(download.rows.slice(1).map(row=>unprotectCsvText(row[0])),expected().rows.map(row=>row.date))
  assert.equal(download.rows[1][4],'-115.00')
  passed('Keyboard CSV export includes all 71 filtered rows across pagination in engine order')
  await check(`window.__exportPreparations===${prepares}`,'Exporting and pagination do not re-run report preparation')
  await verifySummaryCsv('Summary CSV matches all seven visible engine totals exactly')
  await click('.report-columns summary')
  for(const key of ['accountType','fromAccount','toAccount','note','taxAmountCents','expenseSubtotalCents','receiptNumber'])await click(`input[value="${key}"][name="reportColumns"]`)
  download=await csv()
  const [headers,...rows]=download.rows
  assert.deepEqual(headers, ['Date','Type','Category','Account','Account type','From Account','To Account','Note','Tax/VAT (EUR)','Expense subtotal (EUR)','Receipt number','Amount (EUR)','currency_code','report_format','text_encoding'])
  assert.ok(rows.every(row=>row.length===headers.length))
  assert.equal(unprotectCsvText(rows[0][7]),base.transactions[0].note)
  assert.equal(rows[0][7],"'"+base.transactions[0].note)
  assert.equal(unprotectCsvText(rows[0][10]),base.transactions[0].receiptNumber)
  assert.equal(rows[0][8],'15.00');assert.equal(rows[4][8],'');assert.equal(rows[5][9],'0.00')
  assert.equal(unprotectCsvText(rows[3][5]),base.accounts[0].name);assert.equal(unprotectCsvText(rows[3][6]),base.accounts[1].name)
  passed('Downloaded CSV respects all selected columns, quoting, multiline Unicode, formula protection, tax and endpoints')
  await field('#report-period','custom');await field('#report-from','2027-01-01');await field('#report-to','2027-02-01')
  assert.equal((await csv()).rows.length,72);passed('Unapplied custom-date drafts do not change exported rows')
  await preparePrint()
  await check(`document.querySelectorAll('[data-print-row]').length===71 && document.querySelector('.report-print header').textContent.includes('All time') &&
    !document.querySelector('.report-print').textContent.includes('2027-01-01')`,'Print uses applied dates and every row, regardless of the visible page')
  assert.deepEqual(await evaluate(`[...document.querySelectorAll('[data-print-column]')].filter(element=>element.tagName==='TH').map(element=>element.dataset.printColumn)`),headers.slice(0,12).map((_,i)=>['date','type','category','account','accountType','fromAccount','toAccount','note','taxAmountCents','expenseSubtotalCents','receiptNumber','amountCents'][i]))
  passed('Print column order matches the visible table and downloaded CSV')
  const printMetrics=await evaluate(`Object.fromEntries([...document.querySelectorAll('[data-print-metric]')].map(element=>[element.dataset.printMetric,element.textContent]))`)
  for(const [key] of reportSummaryMetrics)assert.equal(printMetrics[key],key==='transactionCount'?String(expected().summary[key]):formatMoney(expected().summary[key],'EUR'))
  passed('Print metrics equal the same PreparedReport and workspace currency')
  await send('Emulation.setEmulatedMedia',{media:'print'})
  await check(`getComputedStyle(document.querySelector('#root')).display==='none' && getComputedStyle(document.querySelector('.report-print')).display==='block' &&
    getComputedStyle(document.body).backgroundColor==='rgb(255, 255, 255)' && !document.querySelector('.report-print button, .report-print nav, .report-print dialog')`,'Print media excludes the application and controls on a clean white background')
  await check(`getComputedStyle(document.querySelector('.report-print thead')).display==='table-header-group' &&
    getComputedStyle(document.querySelector('.report-print tr')).breakInside==='avoid'`,'Print repeats table headings and avoids breaking normal rows')
  const pdf=await send('Page.printToPDF',{preferCSSPageSize:true,printBackground:false,displayHeaderFooter:false})
  const pdfBytes=Buffer.from(pdf.data,'base64');assert.equal(pdfBytes.subarray(0,5).toString(),'%PDF-')
  assert.ok((pdfBytes.toString('latin1').match(/\/Type\s*\/Page\b/g)||[]).length>1,'All rows produce multiple real PDF pages')
  await writeFile(join(artifacts,'financial-report.pdf'),pdfBytes)
  passed('Native Chromium Save-as-PDF rendering produces a complete multipage PDF artifact')
  await send('Emulation.setEmulatedMedia',{media:''})
  await finishPrint()
  await check(`document.activeElement===document.querySelector('.report-export-actions button:nth-child(3)') && window.__nativePrintRequests===1`,'Print action calls window.print exactly once in Strict Mode and restores focus afterward')
  await click('.report-toolbar-actions button');await field('dialog input[type="search"]','unapplied search');await key('Escape')
  assert.equal((await csv()).rows.length,72);passed('Cancelled filter-dialog drafts never affect downloads')
  await apply({query:'=SUM'})
  await click('.report-toolbar-actions button');await field('dialog input[type="search"]','draft only');await key('Escape')
  await evaluate(`document.querySelector('.report-export-actions button:nth-child(3)').focus()`);await key(' ')
  await wait(`!!document.querySelector('.report-print')`)
  await check(`document.querySelector('.report-print-filters').textContent.includes('=SUM') && !document.querySelector('.report-print').textContent.includes('draft only') && document.querySelectorAll('[data-print-row]').length===1`, 'Keyboard printing captures the applied search rather than a cancelled draft')
  await finishPrint()
  await apply({types:['refund']});await verifySummaryCsv('Refund-only CSV preserves negative Net Expenses and positive cash flow without Income')
  await preparePrint();await check(`document.querySelector('[data-print-metric="netExpensesCents"]').textContent==='-€250.00' && document.querySelectorAll('[data-print-row]').length===1`,'Refund-only print preserves negative expenses');await finishPrint()
  await apply({query:'does not exist'})
  assert.equal((await csv()).rows.length,1);await verifySummaryCsv('Zero-match summary CSV contains seven zero metrics')
  await preparePrint();await check(`document.querySelectorAll('[data-print-row]').length===0 && document.querySelector('.report-print').textContent.includes('No matching transactions.')`,'Zero-match printing has headers, totals and an explicit empty state');await finishPrint()
  await apply({});await field('#report-grouping','account');grouping='account'
  await field('#report-group',await evaluate(`document.querySelector('#report-group option:last-child').value`))
  assert.equal((await csv()).rows.length,72);passed('Selecting an account group does not narrow the complete report export')
  await preparePrint()
  await check(`document.querySelectorAll('[data-print-row]').length===71 && document.querySelectorAll('[data-print-group]').length===2 &&
    document.querySelector('.report-print').textContent.includes('not additive') && document.querySelector('.report-print-groups').textContent.includes('Transfer In') &&
    document.querySelector('.report-print-groups').textContent.includes('Transfer Out')`,'Account-group print shows engine summaries and transfer directions without duplicated detail rows')
  await finishPrint();await verifySummaryCsv('Grouped summary CSV retains global totals independently of non-additive groups')
  for(const currency of ['USD','GBP']){
    await seed({...base,applicationSettings:{...base.applicationSettings,currencyCode:currency}})
    const result=await csv();assert.ok(result.rows[0].includes(`Amount (${currency})`));assert.ok(result.rows.slice(1).every(row=>row.at(-3)===currency))
    passed(`${currency} exports retain workspace currency and exact decimal amounts`)
  }
  for(const theme of ['sage','ocean','dark'])for(const width of [320,390,820,1280])for(const font of [16,32]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false})
    await evaluate(`import('/src/features/appearance/themePreference.ts').then(module=>module.setTheme('${theme}'));document.documentElement.style.fontSize='${font}px'`)
    await check(`document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('.report-export-actions button')].every(button=>{
      const rect=button.getBoundingClientRect();return rect.width>=44&&rect.height>=44&&rect.left>=0&&rect.right<=innerWidth
    })`,`${theme} ${width}px ${font===32?'200%':'100%'} export controls fit with usable targets`)
    await evaluate(`document.querySelector('.report-export-actions button').focus()`);await key('Tab')
    await check(`document.activeElement===document.querySelector('.report-export-actions button:nth-child(2)') && getComputedStyle(document.activeElement).outlineStyle!=='none'`,`${theme} ${width}px ${font}px exports have visible keyboard focus`)
  }
  await send('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});await evaluate(`document.documentElement.style.fontSize='16px'`)
  await preparePrint();await send('Emulation.setEmulatedMedia',{media:'print'});await evaluate('window.scrollTo(0,0)');await frame()
  const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(artifacts,'print-preview.png'),Buffer.from(screenshot.data,'base64'))
  await check(`getComputedStyle(document.querySelector('.report-print')).color==='rgb(0, 0, 0)' && getComputedStyle(document.body).backgroundColor==='rgb(255, 255, 255)'`,'Dark theme still prints black text on white')
  await send('Emulation.setEmulatedMedia',{media:''});await finishPrint()
  await seed(base);assert.deepEqual(await snapshot(),baseline)
  await check(`window.__exportWrites.length===0`,'All downloads and prints leave every store, setting, index and balance unchanged')
  await wait(`window.__exportUrls.size===0`);passed('Generated Blob URLs are revoked after downloading')
  await evaluate(`window.__originalCreateUrl=URL.createObjectURL;URL.createObjectURL=()=>{throw new Error('Simulated download failure')}`)
  await click('.report-export-actions button:first-child')
  await check(`!!document.querySelector('.report-exports [role="alert"]') && !document.querySelector('.report-export-actions button').disabled`, 'Download failures leave a recoverable accessible error')
  await evaluate('URL.createObjectURL=window.__originalCreateUrl')
  const large={...base,transactions:Array.from({length:2001},(_,i)=>({...base.transactions[2],id:'large-'+i,amount:1}))}
  await seed(large)
  await evaluate(`window.__confirmCount=0;window.confirm=()=>{window.__confirmCount++;return false}`)
  const calls=await evaluate('window.__nativePrintRequests')
  await click('.report-export-actions button:nth-child(3)')
  await check(`window.__confirmCount===1 && !document.querySelector('.report-print') && window.__nativePrintRequests===${calls}`,'Large print cancellation creates no full print DOM and omits no downloaded data')
  assert.equal((await csv()).rows.length,2002);passed('Large CSV export is complete without pagination or print limits')
  await evaluate('window.confirm=()=>true');await preparePrint()
  await check(`document.querySelectorAll('[data-print-row]').length===2001`,'Confirmed large printing includes all 2,001 rows without silent truncation')
  await click('.report-exports button:not([disabled]):last-child')
  await check(`!document.querySelector('.report-print') && !document.querySelector('.report-export-actions button').disabled`,'Close print view recovers when the browser does not dispatch afterprint')
  await evaluate(`window.print=()=>{throw new Error('Simulated unavailable printing')}`)
  await click('.report-export-actions button:nth-child(3)')
  await check(`!document.querySelector('.report-print') && !!document.querySelector('.report-exports [role="alert"]') && !document.querySelector('.report-export-actions button').disabled`,'Unavailable printing leaves a recoverable accessible error and removes financial DOM')
  await seed({...base,transactions:[]})
  assert.equal((await csv()).rows.length,1);passed('Empty workspace export remains a valid header-only report CSV')
  assert.ok(requests.every(request=>{
    const target=new URL(request.url)
    return request.method==='GET' && (['blob:','data:'].includes(target.protocol)||['127.0.0.1','localhost'].includes(target.hostname))
  }), 'No report uploads or external export services')
  passed('All report operations stay local with no uploads')
  // Production: explicit fixture restore through the established UI, then offline exports.
  production=await preview({preview:{host:'127.0.0.1',port:0,strictPort:false}})
  const productionUrl=`http://127.0.0.1:${production.httpServer.address().port}/`
  await send('Page.navigate',{url:productionUrl+'#more/reports'});await wait(`!!document.querySelector('.finance-onboarding')`)
  await field('select[id$="-country"]','CA');await field('select[id$="-currency"]','EUR');await click('.finance-save');await settled()
  await evaluate(`location.hash='more/data-backup'`);await wait(`!!document.querySelector('#backup-restore-file')`)
  const backup=createBackup(base,'sage')
  await evaluate(`(()=>{const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(JSON.stringify(backup))}],'fixture.json',{type:'application/json'}));const input=document.querySelector('#backup-restore-file');input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));window.confirm=()=>true})()`)
  await wait(`!!document.querySelector('.backup-confirm-restore')`);await click('.backup-confirm-restore');await wait(`!document.querySelector('dialog[open]')`)
  await evaluate(`location.hash='more/reports'`);await settled();await field('#report-period','all')
  await wait(`navigator.serviceWorker.getRegistration().then(registration=>registration?.active?.state==='activated')`)
  await send('Page.reload');await settled();await wait('!!navigator.serviceWorker.controller');await field('#report-period','all')
  const productionBaseline=await snapshot();await evaluate('window.__exportWrites=[]')
  await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1})
  assert.equal((await csv()).rows.length,72);passed('Production offline CSV downloads include every matching row')
  await preparePrint();assert.equal(await evaluate(`document.querySelectorAll('[data-print-row]').length`),71)
  const offlinePdf=await send('Page.printToPDF',{preferCSSPageSize:true});await writeFile(join(artifacts,'offline-financial-report.pdf'),Buffer.from(offlinePdf.data,'base64'))
  await finishPrint();passed('Production native PDF rendering works entirely offline')
  assert.deepEqual(await snapshot(),productionBaseline);await check('window.__exportWrites.length===0','Production offline exports preserve all financial and workspace records')
  await check(`caches.keys().then(async names=>(await Promise.all(names.map(name=>caches.open(name).then(cache=>cache.keys())))).flat().every(request=>!request.url.startsWith('blob:')&&!request.url.endsWith('.csv')&&!request.url.endsWith('.pdf')))`, 'Generated CSV/PDF files never enter the service-worker asset cache')
  assert.deepEqual(exceptions,[],'No uncaught application exceptions')
  await writeFile(join(artifacts,'results.json'),JSON.stringify({checks:results.length,results},null,2))
  console.log(`\n${results.length} report export browser checks passed. Artifacts: ${artifacts}`)
} catch(error) {
  console.error('Review artifacts:',artifacts)
  if(socket?.readyState===WebSocket.OPEN){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(join(artifacts,'failure.png'),Buffer.from(shot.data,'base64'))}
  throw error
} finally {
  if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify({id:++sequence,method:'Browser.close'}));socket.close()}
  if(browser.exitCode===null)browser.kill()
  if(development)await development.close()
  if(production){production.httpServer.closeAllConnections();await new Promise(resolveClose=>production.httpServer.close(resolveClose))}
  const target=resolve(profile);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('my-finance-report-exports-profile-'))
  await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}
