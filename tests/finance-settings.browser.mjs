// Single-workspace onboarding, hidden profile compatibility, exact v2 migration and currency safety. Node 24 + Chrome + Vite.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const appURL = process.env.BILLS_APP_URL ?? 'http://127.0.0.1:5173'
const chrome = process.env.CHROME_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome')
const profile = await mkdtemp(join(tmpdir(), 'my-finance-settings-'))
const artifacts = await mkdtemp(join(tmpdir(), 'my-finance-settings-review-'))
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], {windowsHide:true,stdio:'ignore'})
let socket, sequence = 0, launchError, accept = true
const pending = new Map(), results = [], errors = [], confirmations = []
browser.on('error', error => { launchError = error })
function send(method, params = {}) {
  return new Promise((resolvePromise,reject) => { const id=++sequence; pending.set(id,{resolve:resolvePromise,reject}); socket.send(JSON.stringify({id,method,params})) })
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text)
  return response.result.value
}
async function wait(expression) {
  for(let i=0;i<120;i++){ if(await evaluate(expression)) return; await delay(50) }
  throw new Error(`Timed out: ${expression}; ${await evaluate('document.body.textContent.slice(0,1800)')}`)
}
async function check(expression,name) {
  const passed=await evaluate(expression)
  if(!passed){
    console.error('Failed browser state',await evaluate(`({dialog:document.querySelector('dialog')?.getBoundingClientRect().toJSON(),header:document.querySelector('.backup-dialog-header')?.getBoundingClientRect().toJSON(),body:document.querySelector('.backup-dialog-body')?.getBoundingClientRect().toJSON(),footer:document.querySelector('.backup-dialog-footer')?.getBoundingClientRect().toJSON()})`))
    const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(artifacts,'failure.png'),Buffer.from(screenshot.data,'base64'));console.error('Failure screenshot',artifacts)
  }
  assert.ok(passed,name);results.push(name);console.log(`PASS ${name}`)
}
async function click(text,selector='button') {
  await evaluate(`(() => {const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>e.textContent.trim()===${JSON.stringify(text)}); if(!e)throw new Error('Missing '+${JSON.stringify(text)});e.click()})()`)
  await delay(70)
}

async function select(suffix, value) {
  await evaluate(`(() => { const e=document.querySelector('select[id$="-${suffix}"]');e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event('change',{bubbles:true})) })()`)
  await delay(20)
}
async function route(hash, target) {
  await evaluate(`location.hash=${JSON.stringify(hash)}`)
  await wait(`!!document.querySelector(${JSON.stringify(target)}) && !document.querySelector('[aria-busy="true"]')`)
  await delay(60)
}
async function snapshot() { return evaluate(`import('/src/persistence/dataBackup.ts').then(m=>m.readApplicationSnapshot())`) }
async function settings() { return evaluate(`import('/src/persistence/applicationSettings.ts').then(m=>m.bootstrapApplicationSettings())`) }
async function reload(target) {
  await evaluate('window.__reloadMarker=true'); await send('Page.reload')
  await wait(`!window.__reloadMarker && !!document.querySelector(${JSON.stringify(target)}) && !document.querySelector('[aria-busy="true"]')`)
}
const data = {
  accounts: [{id:'bank',name:'Bank',type:'bank',openingBalance:100000},{id:'card',name:'Card',type:'credit_card',openingBalance:50000,creditLimit:100000}],
  categories: [{id:'food',name:'Food',type:'expense'},{id:'salary',name:'Salary',type:'income'}],
  transactions: [{id:'expense',type:'expense',accountId:'bank',categoryId:'food',amount:4275,date:'2026-10-05',note:'Exact note\r\n雪'},
    {id:'income',type:'income',accountId:'bank',categoryId:'salary',amount:200000,date:'2026-10-04'},
    {id:'transfer',type:'transfer',fromAccountId:'bank',toAccountId:'card',amount:10000,date:'2026-10-03'}],
  obligations: [{id:'bill',type:'bill',name:'Mobile bill',expectedAmountCents:10000,dueDay:15,startMonth:'2026-01',isActive:true},
    {id:'installment',type:'installment',name:'Laptop',originalAmountCents:100000,scheduledPaymentCents:20000,dueDay:10,startMonth:'2026-09',isActive:true}],
  obligationPayments: [{id:'payment',obligationId:'bill',dueMonth:'2026-10',paidDate:'2026-10-05',amountCents:4000,note:'Partial 雪'},
    {id:'principal',obligationId:'installment',dueMonth:'2026-09',paidDate:'2026-09-10',amountCents:20000}],
}
try {
  let port
  for(let i=0;i<200;i++){if(launchError)throw launchError;try{port=Number((await readFile(join(profile,'DevToolsActivePort'),'utf8')).split('\n')[0]);break}catch{await delay(50)}}
  assert.ok(port,'Chrome debugger port')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl)
  await new Promise((resolveOpen,reject)=>{socket.onopen=resolveOpen;socket.onerror=reject})
  socket.onmessage=({data:message})=>{
    const response=JSON.parse(message),promise=pending.get(response.id)
    if(promise){pending.delete(response.id);if(response.error)promise.reject(new Error(JSON.stringify(response.error)));else promise.resolve(response.result)}
    if(response.method==='Page.javascriptDialogOpening'){confirmations.push(response.params.message);void send('Page.handleJavaScriptDialog',{accept})}
    if(response.method==='Runtime.exceptionThrown')errors.push(response.params.exceptionDetails.exception?.description ?? response.params.exceptionDetails.text)
  }
  await send('Page.enable');await send('Runtime.enable')
  await send('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:artifacts})

  await send('Emulation.setTimezoneOverride',{timezoneId:'America/Toronto'})
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`
    Object.defineProperty(navigator,'languages',{get:()=>['en-GB']});
    const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-10-05T16:00:00Z']))}static now(){return new OriginalDate('2026-10-05T16:00:00Z').getTime()}};
    window.__startup={loading:false,prematureShell:false};new MutationObserver(()=>{
      if(document.querySelector('.finance-bootstrap [role="status"]'))window.__startup.loading=true;
      if(document.querySelector('.app-shell')&&!window.__setupAllowed)window.__startup.prematureShell=true;
    }).observe(document,{childList:true,subtree:true});`})
  await send('Page.navigate',{url:appURL+'/#home'})
  await wait(`!!document.querySelector('.finance-onboarding')`)
  await check(`window.__startup.loading && !window.__startup.prematureShell && !document.querySelector('.app-shell')`, 'Fresh startup shows loading, then onboarding with no main shell flash')
  assert.equal(await settings(),null,'Empty install does not assume a CAD workspace')
  await check(`document.querySelectorAll('.finance-onboarding select').length===3&&!document.querySelector('.finance-onboarding input[type="radio"]')&&!/Personal|Business|profile type|workspace type/i.test(document.querySelector('.finance-onboarding').textContent)`, 'Fresh onboarding asks only for country, currency and fiscal year start')
  await check(`document.documentElement.dataset.theme==='sage'`, 'Fresh install preserves the default Sage theme')
  await check(`document.querySelector('select[id$="-country"]').value==='GB' && document.querySelector('select[id$="-currency"]').value===''`, 'Region suggestion is editable and currency has no implicit selection')
  await click('Start using My Finance')
  await check(`!!document.querySelector('.finance-onboarding') && !document.querySelector('.app-shell')`, 'Explicit currency selection is required')
  await check(`document.querySelector('select[id$="-country"]').options.length===250 && ![...document.querySelector('select[id$="-currency"]').options].some(e=>['JPY','KWD','BHD'].includes(e.value))`, 'Complete country choices and only supported two-decimal currencies')
  for (const theme of ['sage','ocean','dark']) for (const width of [320,390,1280]) for (const font of [16,32]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false})
    await evaluate(`import('/src/features/appearance/themePreference.ts').then(m=>m.setTheme('${theme}'));document.documentElement.style.fontSize='${font}px'`)
    await check(`document.documentElement.scrollWidth<=innerWidth && document.querySelector('.finance-fields').scrollWidth<=document.querySelector('.finance-fields').clientWidth`, `${theme} onboarding ${width}px ${font===32?'200%':'100%'} has no horizontal overflow`)
    await check(`[...document.querySelectorAll('.finance-onboarding select,.finance-onboarding input')].every(e=>e.labels.length>0)`, 'Onboarding controls have associated labels')
    if(width===390&&font===16||theme==='dark'&&width===320&&font===32) {
      const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true})
      await writeFile(join(artifacts,`${theme}-${width}-${font}-onboarding.png`),Buffer.from(shot.data,'base64'))
    }
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false})
  await evaluate(`document.documentElement.style.fontSize='16px';document.querySelector('.finance-onboarding h1').focus()`)
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
  await check(`document.activeElement.id.endsWith('-country') && document.activeElement.matches(':focus-visible') && parseFloat(getComputedStyle(document.activeElement).outlineWidth)>0`, 'Keyboard enters the logical form order with visible focus')
  await select('country','CA'); await select('currency','USD'); await select('fiscal',4)
  await evaluate(`window.__setupAllowed=true`)
  await click('Start using My Finance')
  await wait(`!!document.querySelector('.dashboard-summary')`)
  assert.deepEqual(await settings(),{id:'application',countryCode:'CA',currencyCode:'USD',profileType:'personal',fiscalYearStartMonth:4,onboardingCompleted:true})
  await reload('.dashboard-summary')
  await check(`!document.querySelector('.finance-onboarding') && document.querySelector('.dashboard-summary').getAttribute('aria-label').includes('USD')`, 'Completed setup survives reload and Home uses the selected currency')
  await evaluate(`import('/src/persistence/dataBackup.ts').then(m=>m.replaceApplicationSnapshot(${JSON.stringify(data)})).then(()=>window.dispatchEvent(new Event('my-finance-data-changed')))`)
  const baseline=await snapshot()
  await route('more','.more-section')
  await check(`!!document.querySelector('a[href="#more/finance-settings"]') && !document.querySelector('.more-section select') && !/workspace type|profile type|Personal|Business/i.test(document.querySelector('.more-section').textContent)`, 'More offers a separate compact Finance settings destination')
  await evaluate(`document.querySelector('a[href="#more/finance-settings"]').click()`)
  await wait(`!!document.querySelector('.finance-settings')`)
  await check(`document.querySelector('select[id$="-country"]').value==='CA' && document.querySelector('select[id$="-currency"]').value==='USD' && !document.querySelector('.finance-settings input[type="radio"]') && document.querySelector('select[id$="-fiscal"]').value==='4'`, 'Finance settings displays the three editable preferences without a profile choice')
  for (const profileType of ['personal','business']) {
    await evaluate(`import('/src/persistence/applicationSettings.ts').then(async m=>m.saveApplicationSettings({...await m.bootstrapApplicationSettings(),countryCode:'CA',profileType:'${profileType}',fiscalYearStartMonth:4}))`)
    const stored=await settings()
    await reload('.finance-settings')
    assert.deepEqual(await settings(),stored,'Startup preserves existing profile metadata without normalization')
    await check(`document.querySelectorAll('.finance-settings select').length===3&&!document.querySelector('.finance-settings input[type="radio"]')&&!/Personal|Business|profile type|workspace type/i.test(document.querySelector('.finance-settings').textContent)`, `${profileType} settings startup exposes only the three meaningful preferences`)
    await select('country','DE');await select('fiscal',7)
    const beforeConfirmations=confirmations.length
    await click('Save settings')
    assert.equal(confirmations.length,beforeConfirmations)
    assert.deepEqual(await settings(),{...stored,countryCode:'DE',fiscalYearStartMonth:7})
    assert.deepEqual(await snapshot(),baseline,'Metadata edits preserve every financial/tracking record')
    results.push(`${profileType} metadata survives country/fiscal edits with no financial changes`)
  }
  await select('currency','EUR'); accept=false
  await click('Save settings')
  assert.equal((await settings()).currencyCode,'USD')
  assert.deepEqual(await snapshot(),baseline)
  assert.match(confirmations.at(-1),/Changing currency changes how existing amounts are labeled and formatted\. Existing values will not be converted\./)
  results.push('Native currency confirmation explains no conversion; cancel preserves currency and all records')
  accept=true; await click('Save settings')
  await wait(`document.querySelector('.finance-settings [role="status"]').textContent.includes('saved')`)
  assert.equal((await settings()).currencyCode,'EUR');assert.equal((await settings()).profileType,'business');assert.deepEqual(await snapshot(),baseline)
  results.push('Confirmed currency change preserves every amount, reference and note')
  for(const theme of ['sage','ocean','dark']) for(const width of [320,390,1280]) for(const font of [16,32]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false})
    await evaluate(`import('/src/features/appearance/themePreference.ts').then(m=>m.setTheme('${theme}'));document.documentElement.style.fontSize='${font}px'`)
    await check(`document.documentElement.scrollWidth<=innerWidth && document.querySelector('.finance-settings').scrollWidth<=document.querySelector('.finance-settings').clientWidth`, `${theme} Finance settings ${width}px ${font===32?'200%':'100%'} has no overflow`)
    if(width===390&&font===16||theme==='dark'&&width===320&&font===32){const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});await writeFile(join(artifacts,`${theme}-${width}-${font}-settings.png`),Buffer.from(shot.data,'base64'))}
  }
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false})
  await evaluate(`document.documentElement.style.fontSize='16px'`)
  for(const currency of ['CAD','USD','EUR','GBP']) {
    await evaluate(`(async()=>{const m=await import('/src/persistence/applicationSettings.ts');const current=await m.bootstrapApplicationSettings();await m.saveApplicationSettings({...current,currencyCode:'${currency}'},current.currencyCode)})()`)
    await route('home','.dashboard-summary')
    await check(`document.querySelector('.dashboard-summary').getAttribute('aria-label').includes('${currency}') && document.querySelector('.dashboard-summary').textContent.includes(new Intl.NumberFormat('en-CA',{style:'currency',currency:'${currency}'}).format(2000))`, `${currency} live settings update reaches Home's totals and accessible label`)
    assert.deepEqual(await snapshot(),baseline)
  }
  await route('transactions','.transactions-section')
  await check(`document.querySelector('.transactions-section').textContent.includes('All amounts in GBP.') && !document.querySelector('.transactions-section').textContent.includes('CAD')`, 'Transaction list and currency note use GBP')
  await route('transactions/new','dialog[open]')
  await check(`[...document.querySelectorAll('dialog label')].some(e=>e.textContent==='Amount (GBP)')`, 'Transaction editor uses the workspace currency')
  await click('Cancel')
  await click('Filters')
  await check(`document.querySelector('dialog').textContent.includes('GBP') && !document.querySelector('dialog').textContent.includes('CAD')`, 'Amount filter labels use GBP')
  await click('Cancel')
  await route('accounts','.accounts-section')
  await check(`document.querySelector('.accounts-section').textContent.includes('GBP') && !document.querySelector('.accounts-section').textContent.includes('CAD')`, 'Account balances use workspace currency')
  await route('accounts/card','.account-details-summary')
  await click('Edit')
  await check(`document.querySelector('dialog').textContent.includes('Opening debt owed (GBP)') && document.querySelector('dialog').textContent.includes('Credit limit (GBP, optional)')`, 'Credit card editor uses GBP for both opening debt and limit')
  await click('Cancel')
  await route('more/bills-installments','.obligations-section')
  await check(`!document.querySelector('.obligations-section').textContent.includes('CAD') && document.querySelector('.obligations-section').textContent.includes('£')`, 'Bills and installments amounts use GBP')
  await click('+ Add')
  await check(`document.querySelector('dialog').textContent.includes('GBP') && !document.querySelector('dialog').textContent.includes('CAD')`, 'Bill editor uses GBP')
  await select('type','installment')
  await check(`document.querySelector('dialog').textContent.includes('Original amount (GBP)') && document.querySelector('dialog').textContent.includes('Scheduled monthly payment (GBP)')`, 'Installment editor uses GBP for original and scheduled amounts')
  await click('Cancel')
  await route('more/bills-installments/bill','.obligation-facts')
  await click('Record payment')
  await check(`document.querySelector('dialog').textContent.includes('Amount (GBP)')`, 'Payment editor uses GBP')
  await click('Cancel')
  await route('more/data-backup','.data-backup-section')
  await check(`[...document.querySelectorAll('.backup-export-row')].filter(e=>e.textContent.includes('CSV')).every(e=>!e.disabled) && !document.querySelector('#backup-csv-file').disabled`, 'Currency-aware CSV operations are available for GBP')
  await evaluate(`document.querySelector('.backup-export-row').click()`)
  let exported
  for(let i=0;i<100;i++){try{exported=JSON.parse(await readFile(join(artifacts,'my-finance-backup-2026-10-05.json'),'utf8'));break}catch{await delay(50)}}
  assert.equal(exported.currency,'GBP');const {applicationSettings:exportedSettings,...exportedRecords}=exported.data;assert.deepEqual(exportedRecords,baseline);assert.deepEqual(exportedSettings,await settings());assert.equal(exported.schemaVersion,3)
  results.push('Downloaded Full Backup v3 retains exact data and all GBP workspace settings')
  await check(`(async()=>{const {importTransactionBatch}=await import('/src/persistence/dataBackup.ts');try{await importTransactionBatch([],'CAD');return false}catch(e){return e.message.includes('This file uses CAD, but this workspace uses GBP.')}})()`, 'Storage guard blocks CAD CSV imports after a workspace currency change')
  await check(`(async()=>{const {database}=await import('/src/persistence/database.ts');const m=await import('/src/persistence/dataBackup.ts');const old=await database.applicationSettings.get('application');const before=await m.readApplicationSnapshot();const original=database.obligationPayments.bulkAdd;database.obligationPayments.bulkAdd=async()=>{throw new Error('Injected restore failure')};let failed=false;try{await m.replaceWorkspaceSnapshot({...${JSON.stringify(data)},applicationSettings:{...(await database.applicationSettings.get('application')),currencyCode:'EUR'}})}catch{failed=true}finally{database.obligationPayments.bulkAdd=original}return failed&&JSON.stringify(await database.applicationSettings.get('application'))===JSON.stringify(old)&&JSON.stringify(await m.readApplicationSnapshot())===JSON.stringify(before)})()`, 'Restore failure rolls back currency and all five financial/tracking stores together')
  await evaluate(`import('/src/persistence/dataBackup.ts').then(async m=>m.replaceWorkspaceSnapshot({...${JSON.stringify(data)},applicationSettings:{...(await (await import('/src/persistence/applicationSettings.ts')).bootstrapApplicationSettings()),currencyCode:'EUR'}}))`)
  await wait(`!document.querySelector('[aria-busy="true"]')`)
  assert.equal((await settings()).currencyCode,'EUR');assert.equal((await settings()).countryCode,'DE');assert.equal((await settings()).fiscalYearStartMonth,7)
  assert.deepEqual(await snapshot(),baseline)
  results.push('Successful restore sets backup currency and keeps local country/profile/fiscal metadata')
  await check(`(async()=>{const m=await import('/src/persistence/applicationSettings.ts');const current=await m.bootstrapApplicationSettings();try{await m.saveApplicationSettings({...current,currencyCode:'USD'},'GBP');return false}catch(e){return e instanceof m.CurrencyChangeConfirmationRequired && (await m.bootstrapApplicationSettings()).currencyCode==='EUR'}})()`, 'Stale currency confirmation cannot bypass a concurrent workspace change')
  // Exercise the actual JSON restore UI with a different supported currency.
  const usdFile={...exported,currency:'USD',data:{...exported.data,applicationSettings:{...exportedSettings,currencyCode:'USD'}}}
  await evaluate(`(() => {const input=document.getElementById('backup-restore-file');const files=new DataTransfer();files.items.add(new File([${JSON.stringify(JSON.stringify(usdFile))}],'usd-backup.json',{type:'application/json'}));input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await wait(`!!document.querySelector('dialog[open]')`)
  await check(`document.querySelector('dialog').textContent.includes('US Dollar') && document.querySelector('dialog').textContent.includes('workspace currency will become USD')`, 'Restore preview displays the backup currency and consequence')
  accept=false; await click('Replace current data')
  assert.equal((await settings()).currencyCode,'EUR');assert.equal((await settings()).profileType,'business');assert.deepEqual(await snapshot(),baseline)
  accept=true; await click('Replace current data')
  await wait(`!document.querySelector('dialog[open]') && !document.querySelector('[aria-busy="true"]')`)
  assert.equal((await settings()).currencyCode,'USD');assert.deepEqual(await snapshot(),baseline)
  assert.match(confirmations.at(-1),/Workspace currency will become USD/)
  results.push('Restore cancellation preserves currency; accepted JSON restore applies currency with exact data')
  // Corrupt settings cause a recoverable bootstrap error, rather than defaulting to CAD.
  await evaluate(`(async()=>{const {database}=await import('/src/persistence/database.ts');await database.applicationSettings.put({...await database.applicationSettings.get('application'),currencyCode:'ZZZ'})})()`)
  await wait(`!!document.querySelector('.finance-bootstrap [role="alert"]')`)
  await check(`!document.querySelector('.app-shell')`, 'Unreadable settings prevent an incorrectly labeled main shell')
  await reload('.finance-bootstrap [role="alert"]')
  await evaluate(`(async()=>{const {database}=await import('/src/persistence/database.ts');await database.applicationSettings.put({id:'application',countryCode:'DE',currencyCode:'EUR',profileType:'personal',fiscalYearStartMonth:7,onboardingCompleted:true})})()`)
  await click('Retry');await wait(`!!document.querySelector('.data-backup-section')`)
  assert.deepEqual(await snapshot(),baseline)
  results.push('Startup error and retry recover without modifying any financial records')
  const blocked=await send('Page.addScriptToEvaluateOnNewDocument',{source:`indexedDB.open=()=>{throw new DOMException('Test storage unavailable','SecurityError')}`})
  await reload('.finance-bootstrap [role="alert"]')
  await check(`!document.querySelector('.app-shell') && document.querySelector('.finance-bootstrap').textContent.includes('Check browser storage')`, 'Unavailable IndexedDB shows a recoverable startup error without a main shell flash')
  await send('Page.removeScriptToEvaluateOnNewDocument',{identifier:blocked.identifier})
  await reload('.data-backup-section');assert.deepEqual(await snapshot(),baseline)
  // An interrupted older setup can also contain hidden business metadata.
  await evaluate(`import('/src/persistence/applicationSettings.ts').then(async m=>m.saveApplicationSettings({...await m.bootstrapApplicationSettings(),profileType:'business',onboardingCompleted:false}))`)
  await wait(`!!document.querySelector('.finance-onboarding')`)
  await check(`document.querySelectorAll('.finance-onboarding select').length===3&&!/Personal|Business|profile type/i.test(document.querySelector('.finance-onboarding').textContent)`, 'Interrupted setup hides existing business metadata')
  await click('Start using My Finance');await wait(`!!document.querySelector('.data-backup-section')`)
  assert.equal((await settings()).profileType,'business');assert.equal((await settings()).onboardingCompleted,true);assert.deepEqual(await snapshot(),baseline)
  results.push('Completing interrupted onboarding preserves business metadata and every financial record')
  // Seed the actual released Dexie v2 schema without importing the app first.
  await send('Page.navigate',{url:appURL+'/src/domain/README.md'})
  await wait(`!document.querySelector('#root')`)
  await evaluate(`(async()=>{const Dexie=(await import('/node_modules/dexie/dist/dexie.mjs')).default;await Dexie.delete('my-finance');const legacy=new Dexie('my-finance');legacy.version(1).stores({accounts:'id',categories:'id, type',transactions:'id, date, type, accountId, fromAccountId, toAccountId, categoryId'});legacy.version(2).stores({obligations:'id, type, startMonth',obligationPayments:'id, obligationId, dueMonth, [obligationId+dueMonth]'});await legacy.open();const data=${JSON.stringify(data)};await legacy.transaction('rw',legacy.tables,async()=>{for(const [name,records]of Object.entries(data))await legacy.table(name).bulkAdd(records)});localStorage.setItem('my-finance-theme','ocean');legacy.close()})()`)
  await send('Page.navigate',{url:appURL+'/#home'})
  await wait(`!!document.querySelector('.dashboard-summary')`)
  const legacy={id:'application',countryCode:'CA',currencyCode:'CAD',profileType:'personal',fiscalYearStartMonth:1,onboardingCompleted:true}
  assert.deepEqual(await settings(),legacy)
  // IDB iteration order is canonical for exact before/after comparison.
  const canonical=Object.fromEntries(Object.entries(data).map(([name,records])=>[name,[...records].sort((a,b)=>a.id.localeCompare(b.id))]))
  assert.deepEqual(await snapshot(),canonical)
  await check(`document.documentElement.dataset.theme==='ocean' && !document.querySelector('.finance-onboarding')`, 'Released v2 dataset skips onboarding and preserves Ocean theme')
  await check(`(async()=>{const {database}=await import('/src/persistence/database.ts');return database.verno===3&&database.tables.length===6&&await database.applicationSettings.count()===1})()`, 'Schema v3 adds exactly one settings store and one legacy-compatible record')
  results.push('Exact v2 migration preserves all five tables, every integer amount, reference and note')
  assert.deepEqual(errors,[],'No uncaught browser exceptions')
  await writeFile(join(artifacts,'results.json'),JSON.stringify({checks:results.length,results},null,2))
  console.log(`\n${results.length} settings browser checks passed; ${confirmations.length} native confirmations. Artifacts: ${artifacts}`)
}finally{
  if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify({id:++sequence,method:'Browser.close'}));await delay(400);socket.close()}
  if(browser.exitCode===null)browser.kill()
  const target=resolve(profile);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('my-finance-settings-'))
  await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}
