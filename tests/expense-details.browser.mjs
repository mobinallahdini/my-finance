// Expense tax/receipt editor, persistence, exchange and responsive regressions. Node 24 + Chrome + Vite.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const appURL = process.env.BILLS_APP_URL ?? 'http://127.0.0.1:5173'
const chrome = process.env.CHROME_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome')
const profile = await mkdtemp(join(tmpdir(), 'my-finance-expense-details-'))
const artifacts = await mkdtemp(join(tmpdir(), 'my-finance-expense-details-review-'))
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
    console.error('Failed browser state',await evaluate(`({active:document.activeElement.outerHTML,expanded:document.querySelector('.transaction-details-toggle')?.outerHTML,label:document.querySelector('label[for$="-tax"]')?.textContent,text:document.querySelector('dialog')?.textContent,dialog:document.querySelector('dialog')?.getBoundingClientRect().toJSON(),header:document.querySelector('.backup-dialog-header')?.getBoundingClientRect().toJSON(),body:document.querySelector('.backup-dialog-body')?.getBoundingClientRect().toJSON(),footer:document.querySelector('.backup-dialog-footer')?.getBoundingClientRect().toJSON()})`))
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
const empty={accounts:[{id:'bank',name:'Bank',type:'bank',openingBalance:100000},{id:'card',name:'Card',type:'credit_card',openingBalance:0}],categories:[{id:'food',name:'Food',type:'expense'},{id:'salary',name:'Salary',type:'income'}],transactions:[],obligations:[],obligationPayments:[]}
async function setWorkspace(value) {
  await evaluate(`import('/src/persistence/dataBackup.ts').then(async m=>{await m.replaceWorkspaceSnapshot(${JSON.stringify(value)});(await import('/src/features/shared/dataRefresh.ts')).notifyDataChanged()})`)
  await delay(100)
}
async function navigate(hash,selector) {await evaluate(`location.hash=${JSON.stringify(hash)}`);await wait(`!!document.querySelector(${JSON.stringify(selector)})&&!document.querySelector('[aria-busy="true"]')`);await delay(70)}
async function field(label,value) {
  await evaluate(`(() => {const l=[...document.querySelectorAll('dialog[open] label')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!l)throw new Error('Missing field '+${JSON.stringify(label)});const e=document.getElementById(l.htmlFor);const p=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}))})()`)
  await delay(30)
}
async function save() {await click('Save');await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]')`)}
async function edit(id) {await evaluate(`document.querySelector('[data-transaction-id="${id}"]').click()`);await wait(`!!document.querySelector('dialog[open]')`)}
async function keyboard(key,modifiers=0) {await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key===' '?'Space':key,modifiers,windowsVirtualKeyCode:key==='Tab'?9:key==='Escape'?27:key===' '?32:13});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,modifiers});await delay(70)}
async function inputSearch(value){await evaluate(`(() =>{const e=document.querySelector('.transaction-filters input[type="search"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}))})()`);await delay(80)}
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


  for(const profileType of ['personal','business'])for(const currencyCode of ['CAD','USD','EUR']){
    await setWorkspace({...empty,applicationSettings:{...cadSettings,currencyCode,profileType}})
    await navigate('transactions','.transactions-section')
    await click('Add Transaction');await wait(`!!document.querySelector('dialog[open]')`)
    await check(`document.querySelector('.transaction-details-toggle').getAttribute('aria-expanded')==='false'&&!document.querySelector('.transaction-tax-summary')`,`${profileType} ${currencyCode} optional metadata starts collapsed`)
    await field(`Amount (${currencyCode})`,'115.00');await field('Expense category','food');await field('Account / payment source','bank')
    await evaluate(`document.querySelector('.transaction-details-toggle').focus()`);await keyboard(' ')
    await check(`document.querySelector('.transaction-details-toggle').getAttribute('aria-expanded')==='true'&&document.querySelector('label[for$="-tax"]').textContent==='Tax / VAT (${currencyCode})'`,`${profileType} ${currencyCode} keyboard disclosure and currency label`)
    await field(`Tax / VAT (${currencyCode})`,'15.00');await field('Receipt number (optional)','  INV-2048 /  "'+profileType+'" \u96ea  ')
    await check(`document.querySelector('.transaction-tax-summary').textContent.includes('100.00')&&document.querySelector('.transaction-tax-total').textContent.includes('115.00')&&!document.querySelector('[aria-invalid="true"]')`,`${profileType} ${currencyCode} summary subtracts included tax and emphasizes total`)
    await save()
    const record=(await snapshot()).transactions[0]
    assert.equal(record.amount,11500);assert.equal(record.taxAmountCents,1500);assert.equal(record.receiptNumber,'INV-2048 /  "'+profileType+'" \u96ea')
    results.push(`${profileType} ${currencyCode} editor persists tax and trimmed receipt`)
    await check(`document.querySelector('.transaction-list').textContent.includes('115.00')&&!document.querySelector('.transaction-list').textContent.includes('INV-2048')&&!document.querySelector('.transaction-list').textContent.includes('Tax / VAT')`,`${profileType} ${currencyCode} history stays compact with total paid`)
    await edit(record.id)
    await check(`document.querySelector('input[id$="-tax"]').value==='15.00'&&document.querySelector('input[id$="-receipt"]').value===${JSON.stringify(record.receiptNumber)}&&document.querySelector('.transaction-details-toggle').getAttribute('aria-expanded')==='true'`,`${profileType} ${currencyCode} editing opens preserved metadata`)
    await field(`Amount (${currencyCode})`,'10.00');await click('Save')
    await check(`!!document.querySelector('dialog[open]')&&document.querySelector('input[id$="-tax"]').getAttribute('aria-invalid')==='true'&&document.querySelector('p[id$="-tax-error"]').textContent.includes('must not exceed')&&document.activeElement.id.endsWith('-tax')&&!document.querySelector('.transaction-tax-summary')`,`${profileType} ${currencyCode} lowered total rejects tax, associates error and focuses correction`)
    assert.deepEqual((await snapshot()).transactions[0],record)
    await field(`Tax / VAT (${currencyCode})`,'10.00');await save()
    const changed=(await snapshot()).transactions[0];assert.equal(changed.id,record.id);assert.equal(changed.amount,1000);assert.equal(changed.taxAmountCents,1000)
    results.push(`${profileType} ${currencyCode} tax equal to total saves with stable ID`)
    await edit(record.id);await field(`Tax / VAT (${currencyCode})`,'');await field('Receipt number (optional)','   ');await save()
    const removed=(await snapshot()).transactions[0];assert.equal(removed.id,record.id);assert.ok(!Object.hasOwn(removed,'taxAmountCents'));assert.ok(!Object.hasOwn(removed,'receiptNumber'))
    results.push(`${profileType} ${currencyCode} removing metadata persists absence`)
  }
  await setWorkspace({...empty,applicationSettings:cadSettings})
  await navigate('transactions','.transactions-section')
  await click('Add Transaction');await field('Amount (CAD)','115');await field('Expense category','food');await field('Account / payment source','bank')
  await click('Tax & receipt (optional)');await field('Tax / VAT (CAD)','0');await click('Save')
  await check(`document.querySelector('p[id$="-tax-error"]').textContent.includes('positive')&&document.querySelector('input[id$="-tax"]').getAttribute('aria-describedby').includes('-tax-error')`,'Zero tax is rejected with linked error')
  await field('Tax / VAT (CAD)','15');await field('Receipt number (optional)','x'.repeat(201));await click('Save')
  await check(`document.querySelector('p[id$="-receipt-error"]').textContent.includes('200')&&document.activeElement.id.endsWith('-receipt')`,'Receipt length error focuses the receipt field')
  await field('Receipt number (optional)','INV-2048');await save()
  const taxed=(await snapshot()).transactions[0]
  await click('Add Transaction');await field('Amount (CAD)','20');await field('Expense category','food');await field('Account / payment source','bank');await click('Tax & receipt (optional)');await field('Receipt number (optional)','RBC/45821');await save()
  const receiptOnly=(await snapshot()).transactions.find(t=>t.receiptNumber==='RBC/45821');assert.ok(receiptOnly&&!Object.hasOwn(receiptOnly,'taxAmountCents'));results.push('Receipt-only Expense saves without tax')
  await click('Add Transaction');await field('Amount (CAD)','30');await field('Expense category','food');await field('Account / payment source','bank');await click('Tax & receipt (optional)');await field('Tax / VAT (CAD)','5');await save()
  const taxOnly=(await snapshot()).transactions.find(t=>t.amount===3000);assert.equal(taxOnly.taxAmountCents,500);assert.ok(!Object.hasOwn(taxOnly,'receiptNumber'));results.push('Tax-only Expense saves without receipt')
  await inputSearch('inv-2048')
  await check(`document.querySelectorAll('[data-transaction-id]').length===1&&document.querySelector('[data-transaction-id]').dataset.transactionId===${JSON.stringify(taxed.id)}`,'Receipt search matches case-insensitively')
  await inputSearch('1500');await check(`document.querySelectorAll('[data-transaction-id]').length===0`,'Tax cents are not added to text search');await inputSearch('')
  await click('Add Transaction');await click('Tax & receipt (optional)');await field('Receipt number (optional)','draft')
  await evaluate(`document.querySelector('input[value="income"]').click()`)
  await check(`!document.querySelector('.transaction-receipt-details')`,'Income form has no Expense metadata section')
  await evaluate(`document.querySelector('input[value="transfer"]').click()`)
  await check(`!document.querySelector('.transaction-receipt-details')`,'Transfer form has no Expense metadata section');await click('Cancel')

  for(const type of ['income','transfer'])for(const details of [{taxAmountCents:1},{receiptNumber:'INV'}]){
    const value=type==='income'?{...taxed,id:'bad',type,categoryId:'salary',taxAmountCents:undefined,receiptNumber:undefined}:{id:'bad',type,date:taxed.date,amount:100,fromAccountId:'bank',toAccountId:'card'}
    delete value.taxAmountCents;delete value.receiptNumber;Object.assign(value,details)
    await check(`import('/src/persistence/repositories.ts').then(async m=>{try{await m.transactionsRepository.add(${JSON.stringify(value)});return false}catch(e){return e.message.includes('only allowed')}})`,`${type} repository rejects ${Object.keys(details)[0]}`)
  }
  await check(`import('/src/persistence/repositories.ts').then(async m=>{try{await m.transactionsRepository.add({...${JSON.stringify(taxed)},id:'too-much',taxAmountCents:11501});return false}catch(e){return e.message.includes('must not exceed')}})`,'Repository rejects tax greater than total independently of the editor')
  await check(`(async()=>{const d=await import('/src/persistence/dataBackup.ts'),m=await import('/src/domain/calculations.ts'),s=await d.readApplicationSnapshot();return m.calculateMonthlyTotalExpenses(s.transactions,'2026-10')===16500&&m.calculateAccountBalance(s.accounts[0],s.transactions)===83500})()`,'Persisted tax and receipt never alter expense totals or account balances')
  await navigate('home','.dashboard-summary')
  await check(`document.querySelector('.dashboard-summary').textContent.includes('165.00')&&!document.querySelector('.dashboard-activity').textContent.includes('Tax / VAT')`,'Home shows total expenses and compact activity')
  await navigate('accounts/bank','.account-details-summary')
  await check(`document.querySelector('.account-details-summary').textContent.includes('835.00')&&!document.querySelector('.account-details-activity').textContent.includes('Tax / VAT')`,'Account Details retains the total-paid balance and compact rows')

  await navigate('more/data-backup','.data-backup-section')
  const baseline=await snapshot()
  await evaluate(`document.querySelector('.backup-export-row').click()`)
  const backup=JSON.parse(await downloaded('my-finance-backup-2026-10-05.json'))
  assert.equal(backup.schemaVersion,3);assert.deepEqual(backup.data.transactions,baseline.transactions);results.push('Downloaded v3 JSON preserves exact tax and receipt metadata')
  await setWorkspace({...empty,applicationSettings:cadSettings});await chooseFile(backup);await wait(`!!document.querySelector('dialog[open]')`);await click('Replace current data');await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]')`)
  assert.deepEqual(await snapshot(),baseline);results.push('Full v3 restore preserves exact metadata and all financial records')
  await check(`(async()=>{const d=await import('/src/persistence/dataBackup.ts'),s=await d.readApplicationSnapshot();try{await d.importTransactionBatch([{...s.transactions[0],id:'would-add'}, {...s.transactions[0],id:'invalid-tax',taxAmountCents:999999}],'CAD');return false}catch{return !(await d.readApplicationSnapshot()).transactions.some(t=>t.id==='would-add')}})()`,'A CSV batch containing invalid tax writes no selected rows')
  const csv=await evaluate(`(async()=>{const d=await import('/src/persistence/dataBackup.ts'),c=await import('/src/features/dataBackup/transactionCsv.ts');const s=await d.readApplicationSnapshot();return c.transactionsCsv({...s,transactions:s.transactions.map((t,i)=>({...t,id:'csv-'+i}))},'CAD')})()`)
  const mixed=await evaluate(`(async()=>{const m=await import('/src/features/dataBackup/csv.ts');const [h,...r]=m.parseCsv(${JSON.stringify(csv)});const bad=[...r[0]];bad[h.indexOf('id')]="'invalid";bad[h.indexOf('tax_amount')]='999.00';return m.writeCsv(h,[...r,bad])})()`)
  await chooseFile(mixed,'backup-csv-file','tax-receipt.csv');await wait(`!!document.querySelector('dialog[open]')`)
  await check(`document.querySelector('.backup-csv-counts').textContent.includes('Ready: 3')&&document.querySelector('.backup-csv-counts').textContent.includes('Invalid: 1')`,'CSV preview keeps invalid tax unselectable alongside valid metadata rows')
  await click('Import 3 transactions');await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]')`)
  const imported=(await snapshot()).transactions;assert.equal(imported.length,6);assert.ok(!imported.some(t=>t.id==='invalid'));for(const value of baseline.transactions){const match=imported.find(t=>t.id.startsWith('csv-')&&t.amount===value.amount);assert.equal(match.taxAmountCents,value.taxAmountCents);assert.equal(match.receiptNumber,value.receiptNumber)}results.push('CSV writes only Ready rows and retains exact tax and receipt text')
  await navigate('transactions','.transactions-section');await edit(taxed.id)
  await send('Page.reload');await wait(`!!document.querySelector('.transactions-section')&&!document.querySelector('[aria-busy="true"]')`);await edit(taxed.id)
  await check(`document.querySelector('input[id$="-tax"]').value==='15.00'&&document.querySelector('input[id$="-receipt"]').value==='INV-2048'`,'Metadata survives browser reload and reopening the editor')
  await evaluate(`document.querySelector('.transaction-details-toggle').click();document.querySelector('.transaction-editor-header button[type="submit"]').focus()`);await keyboard('Tab')
  await check(`document.activeElement.id.endsWith('-amount')`,'Collapsed receipt fields are excluded from keyboard navigation')
  await click('Tax & receipt (optional)');await evaluate(`document.querySelector('input[id$="-tax"]').focus()`)
  await check(`!!document.querySelector('input[id$="-tax"]:focus-visible')`,'Tax input retains visible keyboard focus')
  await click('Cancel')
  for(const theme of ['sage','ocean','dark'])for(const [width,font]of [[320,16],[390,16],[1280,16],[320,32],[390,32],[1280,32]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false})
    await evaluate(`import('/src/features/appearance/themePreference.ts').then(m=>m.setTheme('${theme}'));document.documentElement.style.fontSize='${font}px'`)
    await edit(taxed.id);await evaluate(`document.querySelector('input[id$="-tax"]').focus()`)
    await check(`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth&&document.querySelector('.transaction-editor-body').scrollWidth<=document.querySelector('.transaction-editor-body').clientWidth&&document.querySelector('.transaction-editor-header').getBoundingClientRect().bottom<=innerHeight/3&&document.querySelector('.transaction-editor-header h2').getBoundingClientRect().height<160&&document.querySelector('input[id$="-tax"]').getBoundingClientRect().right<=innerWidth`,`${theme} ${width}px ${font===32?'200%':'100%'} expanded optional editor fits and Save stays accessible`)
    await evaluate(`document.querySelector('.transaction-tax-summary').scrollIntoView({block:'end'})`)
    if(width===390&&font===16||theme==='dark'&&width===320&&font===32){const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(artifacts,`${theme}-${width}-${font}-expense-details.png`),Buffer.from(shot.data,'base64'))}
    await click('Cancel')
  }
  assert.deepEqual(errors,[],'No uncaught browser errors')
  await writeFile(join(artifacts,'results.json'),JSON.stringify({checks:results.length,results},null,2))
  console.log(`\n${results.length} Expense tax/receipt browser checks passed. Artifacts: ${artifacts}`)
}finally{
  if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify({id:++sequence,method:'Browser.close'}));await delay(400);socket.close()}
  if(browser.exitCode===null)browser.kill()
  const target=resolve(profile);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('my-finance-expense-details-'))
  await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}
