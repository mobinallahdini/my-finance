// End-to-end JSON backup/restore and real IndexedDB rollback. Node 24 + Chrome + Vite.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const appURL = process.env.BILLS_APP_URL ?? 'http://127.0.0.1:5173'
const chrome = process.env.CHROME_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome')
const profile = await mkdtemp(join(tmpdir(), 'my-finance-backup-v2-'))
const artifacts = await mkdtemp(join(tmpdir(), 'my-finance-backup-review-'))
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
async function route(hash) {
  await evaluate(`location.hash=${JSON.stringify(hash)}`)
  const target = hash === 'home' ? '.dashboard-payments' : hash.startsWith('more/bills') ? '.obligations-section' : '.data-backup-section'
  await wait(`!!document.querySelector(${JSON.stringify(target)}) && document.querySelector(${JSON.stringify(target)}).getAttribute('aria-busy')!=='true'`)
  await delay(70)
}
async function chooseFile(file, id='backup-restore-file', name='review.json') {
  await evaluate(`(() => {const transfer=new DataTransfer(); transfer.items.add(new File([${JSON.stringify(typeof file==='string'?file:JSON.stringify(file))}],${JSON.stringify(name)},{type:${JSON.stringify(id==='backup-restore-file'?'application/json':'text/csv')}}));const e=document.getElementById(${JSON.stringify(id)});e.files=transfer.files;e.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await delay(80)
}
async function snapshot() { return evaluate(`import('/src/persistence/dataBackup.ts').then(m=>m.readApplicationSnapshot())`) }
async function replace(value) {
  await evaluate(`import('/src/persistence/dataBackup.ts').then(async m=>{await m.replaceApplicationSnapshot(${JSON.stringify(value)});(await import('/src/features/shared/dataRefresh.ts')).notifyDataChanged()})`)
  await delay(70)
}
async function downloaded(filename) {
  for(let i=0;i<120;i++){try{return await readFile(join(artifacts,filename),'utf8')}catch{await delay(50)}}
  throw new Error(`Download missing: ${filename}`)
}
const data = {
  accounts:[{id:'bank',name:'Main bank',type:'bank',openingBalance:500000},{id:'card',name:'Visa',type:'credit_card',openingBalance:10000,creditLimit:100000}],
  categories:[{id:'food',name:'Food',type:'expense'},{id:'salary',name:'Salary',type:'income'}],
  transactions:[{id:'income',type:'income',accountId:'bank',categoryId:'salary',amount:250000,date:'2026-10-01'},{id:'expense',type:'expense',accountId:'bank',categoryId:'food',amount:2500,date:'2026-10-02'},{id:'transfer',type:'transfer',fromAccountId:'bank',toAccountId:'card',amount:5000,date:'2026-10-03'}],
  obligations:[
    {id:'bill-partial',type:'bill',name:'Mobile partial',dueDay:1,startMonth:'2026-01',isActive:true,expectedAmountCents:10000,note:'Notes stay exact\r\n雪'},
    {id:'bill-paid',type:'bill',name:'Internet paid',dueDay:15,startMonth:'2026-10',isActive:true,expectedAmountCents:6500},
    {id:'installment',type:'installment',name:'Laptop',dueDay:31,startMonth:'2026-09',isActive:true,originalAmountCents:100000,scheduledPaymentCents:15500},
  ],
  obligationPayments:[
    {id:'late-partial',obligationId:'bill-partial',dueMonth:'2026-10',paidDate:'2026-11-02',amountCents:4000,note:'Late payment'},
    {id:'fully-paid',obligationId:'bill-paid',dueMonth:'2026-10',paidDate:'2026-10-04',amountCents:6500},
    {id:'principal',obligationId:'installment',dueMonth:'2026-09',paidDate:'2026-09-15',amountCents:38000},
  ],
}
const empty = {accounts:[],categories:[],transactions:[],obligations:[],obligationPayments:[]}
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
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false})
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-10-05T16:00:00Z']))}static now(){return new OriginalDate('2026-10-05T16:00:00Z').getTime()}}`})
  await send('Page.navigate',{url:`${appURL}/#more/data-backup`})
  await wait(`!!document.querySelector('.finance-onboarding')`)
  await evaluate(`(() => { for (const [suffix,value] of [['country','CA'],['currency','CAD']]) { const select=document.querySelector('select[id$="-'+suffix+'"]');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true})) } })()`)
  await click('Start using My Finance')
  await wait(`!!document.querySelector('.data-backup-section') && document.querySelector('.data-backup-section').getAttribute('aria-busy')==='false'`)
  await replace(data)
  await evaluate(`import('/src/features/appearance/themePreference.ts').then(m=>m.setTheme('ocean'))`)
  const baseline = await snapshot()
  await route('home')
  const homeBefore = await evaluate(`({payments:document.querySelector('.dashboard-payments').textContent,financial:document.querySelector('.dashboard-summary').textContent,categories:document.querySelector('.dashboard-category-list').textContent})`)
  await route('more/data-backup')
  await evaluate(`document.querySelector('.backup-export-row').click()`)
  const file = JSON.parse(await downloaded('my-finance-backup-2026-10-05.json'))
  assert.equal(file.schemaVersion,2);assert.deepEqual(file.data,baseline);assert.deepEqual(file.preferences,{theme:'ocean'})
  results.push('Downloaded Full Backup v2 contains every exact financial/tracking record and theme')
  await click('Custom BackupChoose which sections to includeJSON')
  await evaluate(`document.querySelector('input[value="obligations"]').click()`)
  await check(`document.querySelector('dialog').textContent.includes('recorded payments together') && !document.querySelector('input[value="obligationPayments"]')`, 'Custom UI groups obligations and payments into one explained selection')
  await click('Download JSON')
  const custom=JSON.parse(await downloaded('my-finance-custom-backup-2026-10-05.json'))
  assert.deepEqual(custom.sections,['obligations','obligationPayments']);assert.deepEqual(custom.data,{obligations:baseline.obligations,obligationPayments:baseline.obligationPayments})
  results.push('Downloaded Custom Backup includes both tracking tables')
  await click('Custom BackupChoose which sections to includeJSON')
  await evaluate(`document.querySelector('input[value="transactions"]').click()`)
  await check(`document.querySelector('input[value="accounts"]').checked && document.querySelector('input[value="accounts"]').disabled && document.querySelector('input[value="categories"]').checked && document.querySelector('dialog').textContent.includes('automatically include all Accounts and Categories')`, 'Existing Custom transaction dependency inclusion remains visible')
  await click('Cancel')
  for(const [kind,filename] of [['TransactionsAll transaction historyCSV','transactions'],['AccountsOpening balances and credit limitsCSV','accounts'],['CategoriesIncome and expense categoriesCSV','categories']]){
    await click(kind)
    const csv=await downloaded(`my-finance-${filename}-2026-10-05.csv`)
    const expected=await evaluate(`import('/src/features/dataBackup/transactionCsv.ts').then(m=>m.${filename==='transactions'?'transactionsCsv':filename==='accounts'?'accountsCsv':'categoriesCsv'}(${JSON.stringify(filename==='transactions'?baseline:baseline[filename])}))`)
    assert.equal(csv,expected);results.push(`${filename} CSV download remains unchanged`)
  }
  await replace(empty)
  await chooseFile(file)
  await wait(`!!document.querySelector('dialog[open]')`)
  await check(`(() => {const d=[...document.querySelectorAll('.backup-restore-summary > div')];return d.find(e=>e.querySelector('dt').textContent==='Bills & Installments').querySelector('dd').textContent==='3' && d.find(e=>e.querySelector('dt').textContent==='Recorded payments').querySelector('dd').textContent==='3'})()`, 'V2 preview shows obligation and payment counts')
  accept=false;await click('Replace current data');accept=true
  assert.deepEqual(await snapshot(),empty,'Cancel restore confirmation writes nothing')
  await click('Replace current data')
  await wait(`!document.querySelector('dialog[open]') && document.querySelector('.data-backup-section').getAttribute('aria-busy')==='false'`)
  assert.deepEqual(await snapshot(),baseline,'UI v2 restore replaces all five tables exactly')
  await check(`document.documentElement.dataset.theme==='ocean' && localStorage.getItem('my-finance-theme')==='ocean'`, 'Restored theme applies and persists')
  await route('more/bills-installments')
  await check(`document.querySelectorAll('.obligation-row').length===3 && !document.querySelector('.obligations-section').textContent.includes('not included in Full Backup')`, 'Restored list updates and temporary warning is removed')
  await route('more/bills-installments/bill-partial')
  await check(`document.querySelector('.obligation-status').textContent==='Partially paid · Overdue' && document.querySelector('.obligation-payment-row').textContent.includes('For October 2026') && document.querySelector('.obligation-payment-row').textContent.includes('Paid November 2, 2026')`, 'Restored late partial bill history and status match')
  await route('more/bills-installments/bill-paid')
  await check(`document.querySelector('.obligation-status').textContent==='Paid'`, 'Restored fully paid bill status matches')
  await route('more/bills-installments/installment')
  await check(`document.querySelector('.obligation-facts').textContent.includes('$620.00') && document.querySelectorAll('.obligation-payment-row').length===1`, 'Restored installment principal and history match')
  await route('home')
  assert.deepEqual(await evaluate(`({payments:document.querySelector('.dashboard-payments').textContent,financial:document.querySelector('.dashboard-summary').textContent,categories:document.querySelector('.dashboard-category-list').textContent})`),homeBefore,'Home upcoming payments and financial totals match before/after restore')
  results.push('Home planning and financial screens match after v2 restore without browser reload')
  // Reject a broken graph before any clear/write, and exercise a genuine late
  // bulk-write rejection after all stores were cleared and some were inserted.
  await check(`(async()=>{const m=await import('/src/persistence/dataBackup.ts');const before=await m.readApplicationSnapshot();const broken=structuredClone(before);broken.obligationPayments[0].obligationId='missing';let rejected=false;try{await m.replaceApplicationSnapshot(broken)}catch{rejected=true}return rejected && JSON.stringify(await m.readApplicationSnapshot())===JSON.stringify(before)})()`, 'Invalid payment graph rejects before mutating any table')
  await check(`(async()=>{const {database}=await import('/src/persistence/database.ts');const m=await import('/src/persistence/dataBackup.ts');const before=await m.readApplicationSnapshot();const original=database.obligationPayments.bulkAdd;let reachedLastStore=false;database.obligationPayments.bulkAdd=async function(records){reachedLastStore=true;await original.call(this,records);throw new Error('Injected final-store failure')};let rejected=false;try{await m.replaceApplicationSnapshot(${JSON.stringify({...data,accounts:data.accounts.map(record=>({...record,name:'Replacement '+record.name}))})})}catch{rejected=true}finally{database.obligationPayments.bulkAdd=original}return rejected && reachedLastStore && JSON.stringify(await m.readApplicationSnapshot())===JSON.stringify(before)})()`, 'Actual final-store failure rolls back all five clears and all writes')
  await check(`(async()=>{const m=await import('/src/persistence/dataBackup.ts');const replacement=${JSON.stringify(baseline)};const promise=m.replaceApplicationSnapshot(replacement);replacement.obligations[0].name='Mutated after call';await promise;return JSON.stringify(await m.readApplicationSnapshot())===JSON.stringify(${JSON.stringify(baseline)})})()`, 'Restore copies caller data before awaiting storage')
  await check(`(async()=>{const {database}=await import('/src/persistence/database.ts');return database.verno===3 && database.tables.length===6})()`, 'Restore preserves the version 3 schema and settings table')
  const legacy={...file,schemaVersion:1,sections:['accounts','categories','transactions','preferences'],data:{accounts:baseline.accounts,categories:baseline.categories,transactions:baseline.transactions},preferences:{theme:'sage'}}
  await route('more/data-backup');await chooseFile(legacy)
  await check(`document.querySelector('dialog').textContent.includes('Not included in this backup version') && document.querySelector('dialog').textContent.includes('will remove all current bills, installments, and recorded payments')`, 'V1 preview explicitly warns tracking data will be removed')
  await click('Replace current data');await wait(`!document.querySelector('dialog[open]') && document.querySelector('.data-backup-section').getAttribute('aria-busy')==='false'`)
  assert.deepEqual(await snapshot(),{...legacy.data,obligations:[],obligationPayments:[]},'V1 replaces finances and clears both tracking tables')
  assert.ok(confirmations.some(message=>message.includes('version 1 backup contains no Bills & Installments')),'V1 destructive confirmation repeats replacement consequence')
  await route('home');await check(`document.querySelector('.dashboard-payments').textContent.includes('No payments due this month.')`, 'Home refreshes to empty planning state after v1 restore')
  await route('more/bills-installments');await check(`document.querySelector('.obligations-section').textContent.includes('No bills or installments yet.')`, 'V1 restore list contains no silently preserved obligations')
  await route('more/data-backup')
  const invalid=structuredClone(file);invalid.data.obligationPayments[0].dueMonth='2025-12'
  const beforeInvalid=await snapshot();await chooseFile(invalid)
  await check(`!document.querySelector('dialog[open]') && document.querySelector('.backup-error').textContent.includes('start month')`, 'Invalid v2 file is rejected before preview or writes')
  assert.deepEqual(await snapshot(),beforeInvalid)
  await replace(baseline)
  for(const theme of ['sage','ocean','dark'])for(const [width,height,font] of [[320,760,16],[390,844,16],[1280,900,16],[320,844,32],[390,844,32],[1280,900,32]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false})
    await evaluate(`import('/src/features/appearance/themePreference.ts').then(m=>m.setTheme(${JSON.stringify(theme)}));document.documentElement.style.fontSize='${font}px'`)
    await check(`document.documentElement.scrollWidth<=document.documentElement.clientWidth`, `${theme} ${width}px ${font===32?'200%':'100%'} backup page has no horizontal overflow`)
    await evaluate(`window.scrollTo(0,document.documentElement.scrollHeight)`)
    await check(`(()=>{const nav=document.querySelector('.app-navigation'),section=document.querySelector('.data-backup-section');return getComputedStyle(nav).position!=='fixed' || section.getBoundingClientRect().bottom<=nav.getBoundingClientRect().top})()`, 'Backup final content clears bottom navigation')
    for(const version of [file,legacy]){
      await chooseFile(version)
      await check(`(()=>{const dialog=document.querySelector('dialog[open]'),body=document.querySelector('.backup-dialog-body'),button=document.querySelector('.backup-dialog-footer button');return !!dialog && dialog.scrollWidth<=dialog.clientWidth && body.clientHeight>150 && button.getBoundingClientRect().bottom<=innerHeight})()`, `${theme} ${width}px ${font===32?'200%':'100%'} v${version.schemaVersion} preview scrolls with accessible action`)
      await evaluate(`document.querySelector('.backup-dialog-footer button').focus()`)
      await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
      await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9})
      await check(`document.activeElement.textContent==='Cancel'`, 'Preview keyboard focus stays contained')
      if((width===390&&font===16)||(theme==='dark'&&width===320&&font===32)){
        const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(artifacts,`${theme}-${width}-${font}-v${version.schemaVersion}.png`),Buffer.from(screenshot.data,'base64'))
      }
      await click('Cancel')
      await check(`document.activeElement.id==='backup-restore-file'`, 'Preview cancellation restores file control focus')
    }
    await click('Custom BackupChoose which sections to includeJSON')
    await check(`document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth && document.querySelector('.backup-dialog-body').clientHeight>150`, 'Custom selection fits and scrolls at every theme/text size')
    await click('Cancel')
  }
  assert.deepEqual(errors,[],'No uncaught browser exceptions')
  console.log(`\n${results.length} backup browser checks passed. Downloads/screenshots: ${artifacts}`)
}finally{
  if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify({id:++sequence,method:'Browser.close'}));await delay(400);socket.close()}
  if(browser.exitCode===null)browser.kill()
  const target=resolve(profile);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('my-finance-backup-v2-'))
  await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}
