// Workspace JSON/CSV currency safety and six-store rollback. Node 24 + Chrome + Vite.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const appURL = process.env.BILLS_APP_URL ?? 'http://127.0.0.1:5173'
const chrome = process.env.CHROME_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome')
const profile = await mkdtemp(join(tmpdir(), 'my-finance-workspace-backup-'))
const artifacts = await mkdtemp(join(tmpdir(), 'my-finance-workspace-backup-review-'))
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
  const target = hash === 'home' ? '.dashboard-payments' : hash === 'more/finance-settings' ? '.finance-settings' : hash === 'accounts/bank' ? '.account-details-summary' : hash.startsWith('more/bills') ? '.obligations-section' : '.data-backup-section'
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

const cadSettings={id:'application',countryCode:'CA',currencyCode:'CAD',profileType:'personal',fiscalYearStartMonth:1,onboardingCompleted:true}
const usdSettings={...cadSettings,countryCode:'GB',currencyCode:'USD',profileType:'business',fiscalYearStartMonth:4}
const data={
  accounts:[{id:'bank',name:'Bank',type:'bank',openingBalance:100000},{id:'card',name:'Card',type:'credit_card',openingBalance:50000,creditLimit:100000}],
  categories:[{id:'food',name:'Food',type:'expense'},{id:'salary',name:'Salary',type:'income'}],
  transactions:[{id:'expense',type:'expense',accountId:'bank',categoryId:'food',amount:4275,date:'2026-10-05',note:'=SUM(A1:A2), "雪"\r\nline'},
    {id:'income',type:'income',accountId:'bank',categoryId:'salary',amount:200000,date:'2026-10-04'},
    {id:'transfer',type:'transfer',fromAccountId:'bank',toAccountId:'card',amount:10000,date:'2026-10-03'}],
  obligations:[{id:'bill',type:'bill',name:'Phone',expectedAmountCents:10000,dueDay:15,startMonth:'2026-01',isActive:true},
    {id:'installment',type:'installment',name:'Laptop',originalAmountCents:100000,scheduledPaymentCents:20000,dueDay:10,startMonth:'2026-09',isActive:true}],
  obligationPayments:[{id:'partial',obligationId:'bill',dueMonth:'2026-10',paidDate:'2026-10-05',amountCents:4000}],
}
async function settings() {return evaluate(`import('/src/persistence/applicationSettings.ts').then(m=>m.bootstrapApplicationSettings())`)}
async function workspace() {return evaluate(`import('/src/persistence/dataBackup.ts').then(async m=>(await m.readBackupSource()).snapshot)`)}
async function setWorkspace(value) {
  await evaluate(`import('/src/persistence/dataBackup.ts').then(async m=>{await m.replaceWorkspaceSnapshot(${JSON.stringify(value)});(await import('/src/features/shared/dataRefresh.ts')).notifyDataChanged()})`)
  await wait(`!document.querySelector('[aria-busy="true"]')`);await delay(60)
}
async function currency(code) {
  await evaluate(`import('/src/persistence/applicationSettings.ts').then(async m=>{const value=await m.bootstrapApplicationSettings();await m.saveApplicationSettings({...value,currencyCode:${JSON.stringify(code)}},value.currencyCode)})`)
  await delay(100)
}
async function uploadCsv(text) {await chooseFile(text,'backup-csv-file','currency-review.csv')}
async function restoreFile(file) {
  await chooseFile(file);await wait(`!!document.querySelector('dialog[open]')`)
  await click('Replace current data');await wait(`!document.querySelector('dialog[open]') && !document.querySelector('[aria-busy="true"]')`);await delay(80)
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
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:false})
  await send('Page.addScriptToEvaluateOnNewDocument',{source:`const OriginalDate=Date;window.Date=class extends OriginalDate{constructor(...args){super(...(args.length?args:['2026-10-05T16:00:00Z']))}static now(){return new OriginalDate('2026-10-05T16:00:00Z').getTime()}}`})
  await send('Page.navigate',{url:`${appURL}/#more/data-backup`})
  await wait(`!!document.querySelector('.finance-onboarding')`)
  await evaluate(`(() => { for (const [suffix,value] of [['country','CA'],['currency','CAD']]) { const select=document.querySelector('select[id$="-'+suffix+'"]');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true})) } })()`)
  await click('Start using My Finance')
  await wait(`!!document.querySelector('.data-backup-section') && document.querySelector('.data-backup-section').getAttribute('aria-busy')==='false'`)

  await setWorkspace({...data,applicationSettings:usdSettings})
  const baseline=await workspace()
  await evaluate(`import('/src/features/appearance/themePreference.ts').then(m=>m.setTheme('ocean'))`)
  await evaluate(`document.querySelector('.backup-export-row').click()`)
  const file=JSON.parse(await downloaded('my-finance-backup-2026-10-05.json'))
  assert.equal(file.schemaVersion,3);assert.equal(file.currency,'USD');assert.deepEqual(file.data,baseline);assert.deepEqual(file.preferences,{theme:'ocean'})
  results.push('Downloaded v3 Full Backup includes all six stores and theme with consistent USD metadata')
  await check(`[...document.querySelectorAll('.backup-export-row')].every(e=>!e.disabled)&&!document.getElementById('backup-csv-file').disabled`, 'USD workspace enables every JSON and CSV action')
  let usdCsv
  for(const [text,kind]of [['TransactionsAll transaction historyCSV','transactions'],['AccountsOpening balances and credit limitsCSV','accounts'],['CategoriesIncome and expense categoriesCSV','categories']]) {
    await click(text)
    const csv=await downloaded(`my-finance-${kind}-2026-10-05.csv`)
    const rows=await evaluate(`import('/src/features/dataBackup/csv.ts').then(m=>m.parseCsv(${JSON.stringify(csv)}))`)
    if(kind==='categories') assert.deepEqual(rows[0],['id','name','type','text_encoding'])
    else {
      assert.ok(rows[0].includes('currency_code'));assert.ok(rows.slice(1).every(row=>row[rows[0].indexOf('currency_code')]==='USD'))
      assert.ok(!rows[0].some(value=>value.endsWith('_cad')))
    }
    if(kind==='transactions') usdCsv=csv
    results.push(`Downloaded ${kind} CSV preserves its documented currency-aware schema`)
  }
  await click('Custom BackupChoose which sections to includeJSON')
  await evaluate(`document.querySelector('input[value="preferences"]').click()`)
  await check(`document.querySelector('dialog').textContent.includes('Workspace settings and currency are always included')&&!document.querySelector('input[value="applicationSettings"]')`, 'Custom JSON always includes workspace interpretation without a removable checkbox')
  await click('Download JSON')
  const custom=JSON.parse(await downloaded('my-finance-custom-backup-2026-10-05.json'))
  assert.deepEqual(custom.data,{applicationSettings:usdSettings});assert.deepEqual(custom.sections,['applicationSettings','preferences'])
  results.push('Preferences-only Custom Backup still preserves exact structural settings')

  await currency('EUR')
  await uploadCsv(usdCsv)
  await check(`!document.querySelector('dialog[open]')&&document.querySelector('.backup-error').textContent.includes('This file uses USD, but this workspace uses EUR.')`, 'Currency mismatch blocks preview before transaction selection')
  const mismatchedBefore=await workspace()
  await currency('USD')
  await uploadCsv(usdCsv);await wait(`!!document.querySelector('dialog[open]')`)
  await check(`document.querySelector('.backup-csv-counts').textContent.includes('Duplicate: 3')&&document.querySelector('dialog').textContent.includes('US$42.75')`, 'Matching USD CSV preview formats exact amounts and recognizes duplicates')
  await click('Cancel')
  const mixed=await evaluate(`import('/src/features/dataBackup/csv.ts').then(m=>{const [headers,...rows]=m.parseCsv(${JSON.stringify(usdCsv)});rows[1][headers.indexOf('currency_code')]='EUR';return m.writeCsv(headers,rows)})`)
  await uploadCsv(mixed)
  await check(`!document.querySelector('dialog[open]')&&document.querySelector('.backup-error').textContent.includes('mixed currencies')`, 'Mixed currencies block the whole file')
  const legacy=await evaluate(`(async()=>{const m=await import('/src/features/dataBackup/transactionCsv.ts'),c=await import('/src/features/dataBackup/csv.ts');const [headers,...rows]=c.parseCsv(${JSON.stringify(usdCsv)});return c.writeCsv(m.legacyTransactionCsvColumns,rows.map(row=>m.legacyTransactionCsvColumns.map(field=>row[headers.indexOf(field==='amount_cad'?'amount':field)])))})()`)
  await uploadCsv(legacy)
  await check(`!document.querySelector('dialog[open]')&&document.querySelector('.backup-error').textContent.includes('This file uses CAD, but this workspace uses USD.')`, 'Legacy amount_cad CSV is blocked in a USD workspace')
  await currency('CAD');await uploadCsv(legacy);await wait(`!!document.querySelector('dialog[open]')`)
  await check(`document.querySelector('.backup-csv-counts').textContent.includes('Duplicate: 3')`, 'Legacy amount_cad CSV remains importable in a CAD workspace')
  await click('Cancel');await currency('USD')
  assert.deepEqual(await snapshot(),baseline && Object.fromEntries(Object.entries(baseline).filter(([name])=>name!=='applicationSettings')))
  assert.equal(mismatchedBefore.applicationSettings.currencyCode,'EUR')

  const added=data.transactions.map(record=>({...record,id:'import-'+record.id}))
  const readyCsv=await evaluate(`import('/src/features/dataBackup/transactionCsv.ts').then(m=>m.transactionsCsv({...${JSON.stringify(data)},transactions:${JSON.stringify(added)}},'USD'))`)
  await uploadCsv(readyCsv);await wait(`!!document.querySelector('dialog[open]')`)
  await check(`document.querySelector('.backup-csv-counts').textContent.includes('Ready: 3')`, 'USD expense, income and Transfer rows validate before import')
  await currency('EUR')
  await check(`document.querySelector('.backup-error').textContent.includes('This file uses USD, but this workspace uses EUR.') && document.querySelector('.backup-dialog-footer button').disabled`, 'Currency changed during preview blocks selection and import')
  const staleBefore=await workspace()
  await check(`(async()=>{const m=await import('/src/persistence/dataBackup.ts');try{await m.importTransactionBatch(${JSON.stringify(added)},'USD');return false}catch(e){return e.message==='This file uses USD, but this workspace uses EUR.'}})()`, 'Storage transaction rechecks CSV currency after preview')
  assert.deepEqual(await workspace(),staleBefore)
  await currency('USD');await wait(`document.querySelector('.backup-csv-counts').textContent.includes('Ready: 3')`)
  await click('Import 3 transactions');await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]')`)
  const imported=await snapshot();assert.equal(imported.transactions.length,6)
  for(const record of added) assert.deepEqual(imported.transactions.find(value=>value.id===record.id),record)
  assert.deepEqual(await settings(),usdSettings)
  results.push('Matching USD CSV imports exact Expense/Income/Transfer values without changing settings')
  await chooseFile(file);await wait(`!!document.querySelector('dialog[open]')`)
  await check(`document.querySelectorAll('.backup-workspace dt').length===3&&!/Personal|Business|profile type/i.test(document.querySelector('.backup-workspace').textContent)`, 'Existing business v3 backup preview exposes only meaningful settings')
  await click('Replace current data');await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]')`);await delay(80)
  assert.deepEqual(await workspace(),baseline)
  assert.equal((await settings()).profileType,'business')
  assert.ok(!/profile type|Personal|Business/i.test(confirmations.at(-1)),'Restore confirmation does not expose internal profile metadata')
  results.push('V3 business metadata round-trips exactly without UI or confirmation exposure')

  const eurSettings={...usdSettings,countryCode:'DE',currencyCode:'EUR',profileType:'personal',fiscalYearStartMonth:7}
  const replacement={...file,currency:'EUR',data:{...file.data,applicationSettings:eurSettings},preferences:{theme:'dark'}}
  await chooseFile(replacement);await wait(`!!document.querySelector('dialog[open]')`)
  await check(`document.querySelector('#restore-workspace-heading').textContent==='Workspace'&&document.querySelector('.backup-workspace').textContent.includes('Germany')&&document.querySelector('.backup-workspace').textContent.includes('Euro')&&!/Personal|Business|profile type/i.test(document.querySelector('.backup-workspace').textContent)&&document.querySelector('.backup-workspace').textContent.includes('July')`, 'V3 restore preview shows readable country, currency and fiscal month without profile type')
  accept=false;await click('Replace current data');accept=true
  assert.deepEqual(await workspace(),baseline,'Cancel preserves all six stores')
  await click('Replace current data');await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]')`);await delay(70)
  assert.deepEqual(await settings(),eurSettings)
  await check(`document.documentElement.dataset.theme==='dark'&&!document.querySelector('.finance-onboarding')`, 'V3 restores theme and leaves setup complete without reloading')
  await route('home')
  await check(`document.querySelector('.dashboard-summary').getAttribute('aria-label').includes('EUR')&&document.querySelector('.dashboard-summary').textContent.includes('€2,000.00')`, 'Restored EUR workspace updates Home totals immediately')
  await route('accounts/bank')
  await check(`document.querySelector('.account-details-summary').textContent.includes('€2,857.25')`, 'Account Details recalculates with unchanged values and restored currency')
  await route('more/finance-settings')
  await check(`document.querySelector('select[id$="-country"]').value==='DE'&&document.querySelector('select[id$="-currency"]').value==='EUR'&&!document.querySelector('.finance-settings input[type="radio"]')&&document.querySelector('select[id$="-fiscal"]').value==='7'`, 'All restored Finance Settings values display without a reload')
  await route('more/data-backup')
  const beforeFailure=await workspace(),beforeTheme=await evaluate(`localStorage.getItem('my-finance-theme')`)
  await check(`(async()=>{const {database}=await import('/src/persistence/database.ts'),m=await import('/src/persistence/dataBackup.ts');const before=(await m.readBackupSource()).snapshot;const original=database.obligationPayments.bulkAdd;let reached=false;database.obligationPayments.bulkAdd=async function(records){reached=true;await original.call(this,records);throw new Error('Injected final-store failure')};let rejected=false;try{await m.replaceWorkspaceSnapshot(${JSON.stringify(baseline)})}catch{rejected=true}finally{database.obligationPayments.bulkAdd=original}return rejected&&reached&&JSON.stringify((await m.readBackupSource()).snapshot)===JSON.stringify(before)})()`, 'Final-store failure rolls back all six clears/writes, including replaced settings')
  assert.deepEqual(await workspace(),beforeFailure);assert.equal(await evaluate(`localStorage.getItem('my-finance-theme')`),beforeTheme)
  await check(`(async()=>{const {database}=await import('/src/persistence/database.ts'),m=await import('/src/persistence/dataBackup.ts');const before=(await m.readBackupSource()).snapshot;const original=database.applicationSettings.add;database.applicationSettings.add=async function(record){await original.call(this,record);throw new Error('Injected settings failure')};let rejected=false;try{await m.replaceWorkspaceSnapshot(${JSON.stringify(baseline)})}catch{rejected=true}finally{database.applicationSettings.add=original}return rejected&&JSON.stringify((await m.readBackupSource()).snapshot)===JSON.stringify(before)})()`, 'Settings write failure preserves the entire previous workspace')
  const contradictory={...replacement,currency:'USD'}
  await chooseFile(contradictory)
  await check(`!document.querySelector('dialog[open]')&&document.querySelector('.backup-error').textContent.includes('must agree')`, 'Contradictory JSON currency metadata is blocked before preview or writes')
  assert.deepEqual(await workspace(),beforeFailure)
  await check(`(async()=>{const m=await import('/src/persistence/dataBackup.ts');const value=${JSON.stringify(baseline)};const promise=m.replaceWorkspaceSnapshot(value);value.applicationSettings.currencyCode='EUR';value.transactions[0].amount=1;await promise;return (await m.readBackupSource()).snapshot.applicationSettings.currencyCode==='USD'&&(await m.readApplicationSnapshot()).transactions.find(t=>t.id==='expense').amount===4275})()`, 'Restore snapshots mutable caller records and settings before awaiting storage')

  // Theme storage is deliberately outside the successful database transaction.
  await evaluate(`window.__originalSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='my-finance-theme')throw new DOMException('Blocked','QuotaExceededError');return window.__originalSetItem.call(this,key,value)}`)
  await restoreFile(replacement)
  await check(`document.querySelector('.backup-feedback').textContent.includes('All data and workspace settings restored')&&document.querySelector('.backup-feedback').textContent.includes('preference could not be saved')&&document.documentElement.dataset.theme==='dark'`, 'Theme preference failure reports database/settings success and session appearance')
  assert.deepEqual(await settings(),eurSettings)
  await evaluate(`Storage.prototype.setItem=window.__originalSetItem;delete window.__originalSetItem`)

  const {applicationSettings,...records}=file.data
  const v2={...file,schemaVersion:2,sections:file.sections.filter(section=>section!=='applicationSettings'),data:records}
  await chooseFile(v2);await wait(`!!document.querySelector('dialog[open]')`)
  await check(`document.querySelector('.backup-workspace').textContent.includes('Your current Country / Region is used')&&document.querySelector('.backup-workspace').textContent.includes('January')&&!/Personal|Business|profile type/i.test(document.querySelector('.backup-workspace').textContent)`, 'Legacy v2 preview explains visible country and January defaults without profile type')
  await click('Replace current data');await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]')`);await delay(60)
  assert.deepEqual(await settings(),{...cadSettings,countryCode:'DE',currencyCode:'USD'})
  assert.equal(applicationSettings.countryCode,'GB');assert.deepEqual(await snapshot(),records)
  const v1={...file,schemaVersion:1,currency:'CAD',sections:['accounts','categories','transactions','preferences'],data:{accounts:records.accounts,categories:records.categories,transactions:records.transactions}}
  await chooseFile(v1);await wait(`!!document.querySelector('dialog[open]')`)
  await check(`document.querySelector('.backup-workspace').textContent.includes('Canada')&&!/Personal|Business|profile type/i.test(document.querySelector('.backup-workspace').textContent)&&document.querySelector('.backup-workspace').textContent.includes('January')`, 'Legacy v1 preview explains Canadian defaults')
  await click('Replace current data');await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]')`);await delay(60)
  assert.deepEqual(await settings(),cadSettings);assert.deepEqual(await snapshot(),{...v1.data,obligations:[],obligationPayments:[]})
  await check(`!document.querySelector('.finance-onboarding')&&!!document.querySelector('.app-shell')`, 'V1/v2 compatibility restores completed setup and skips onboarding')
  results.push('Both legacy formats restore exact records with documented settings defaults')

  // Preview readability uses the same existing modal layout in every theme/viewport.
  for(const theme of ['sage','ocean','dark'])for(const [width,font]of [[320,16],[390,16],[1280,16],[320,32],[390,32],[1280,32]]) {
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false})
    await evaluate(`import('/src/features/appearance/themePreference.ts').then(m=>m.setTheme('${theme}'));document.documentElement.style.fontSize='${font}px'`)
    await chooseFile(file);await wait(`!!document.querySelector('dialog[open]')`)
    await check(`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth&&document.querySelector('.backup-dialog-footer').getBoundingClientRect().bottom<=innerHeight`, `${theme} ${width}px ${font===32?'200%':'100%'} workspace preview fits with accessible action`)
    if(width===390&&font===16||theme==='dark'&&width===320&&font===32){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(artifacts,`${theme}-${width}-${font}-workspace-preview.png`),Buffer.from(shot.data,'base64'))}
    await click('Cancel')
  }
  assert.deepEqual(errors,[],'No uncaught browser errors')
  await writeFile(join(artifacts,'results.json'),JSON.stringify({checks:results.length,results},null,2))
  console.log(`\n${results.length} workspace backup/CSV browser checks passed. Artifacts: ${artifacts}`)

}finally{
  if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify({id:++sequence,method:'Browser.close'}));await delay(400);socket.close()}
  if(browser.exitCode===null)browser.kill()
  const target=resolve(profile);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('my-finance-workspace-backup-'))
  await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}
