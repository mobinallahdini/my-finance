// Inline categories and Refund editor, IndexedDB, exchange and responsive checks. Node 24 + Chrome + Vite.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const appURL = process.env.BILLS_APP_URL ?? 'http://127.0.0.1:5173'
const chrome = process.env.CHROME_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome')
const profile = await mkdtemp(join(tmpdir(), 'my-finance-transaction-improvements-'))
const artifacts = await mkdtemp(join(tmpdir(), 'my-finance-transaction-improvements-review-'))
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

  const draft = () => evaluate(`Object.fromEntries([...document.querySelectorAll('.transaction-editor-fields input,.transaction-editor-fields select,.transaction-editor-fields textarea')].filter(e=>!e.closest('.transaction-new-category')).map(e=>[e.id.split('-').at(-1),e.value]))`)
  const type = async value => { await evaluate(`document.querySelector('.transaction-segment input[value="${value}"]').click()`);await delay(40) }
  async function createCategory(name, categoryType) {
    await click('+ New category');await field(`New ${categoryType} category name`,name);await click('Save category')
    await wait(`!document.querySelector('.transaction-new-category')&&!document.querySelector('[aria-busy="true"]')`)
    return evaluate(`document.querySelector('select[id$="-category"]').value`)
  }
  for(const transactionType of ['expense','income','refund']){
    await setWorkspace({...empty,categories:[],applicationSettings:cadSettings})
    await navigate('transactions','.transactions-section');await click('Add Transaction');await type(transactionType)
    await check(`document.querySelector('.transaction-editor-header button[type="submit"]').disabled&&!document.querySelector('select[id$="-category"] option[value]:not([value=""])')`,`${transactionType} editor permits category creation with no categories configured`)
    const categoryId=await createCategory('First category',transactionType==='income'?'Income':'Expense')
    await check(`document.querySelector('select[id$="-category"]').value===${JSON.stringify(categoryId)}&&!document.querySelector('.transaction-editor-header button[type="submit"]').disabled`,`${transactionType} first inline category enables transaction save`)
    await click('Cancel');await wait(`!document.querySelector('dialog[open]')`)
    assert.ok((await snapshot()).categories.some(c=>c.id===categoryId));results.push(`${transactionType} category survives canceling a new transaction`)
  }
  await setWorkspace({...empty,applicationSettings:cadSettings})
  await navigate('transactions','.transactions-section');await click('Add Transaction')
  await check(`document.querySelectorAll('.transaction-segment input').length===4`,'Editor offers Expense, Income, Transfer, Refund')
  await field('Amount (CAD)','115.00');await field('Expense category','food');await field('Account / payment source','card')
  await field('Date','2026-10-04');await field('Note (optional)','Keep my draft')
  await click('Tax & receipt (optional)');await field('Tax / VAT (CAD)','15.00');await field('Receipt number (optional)','INV-2048')
  const originalDraft=await draft()
  await click('+ New category')
  await check(`document.activeElement===document.querySelector('.transaction-new-category input')`,'Inline category name receives keyboard focus')
  await check(`document.querySelector('.transaction-editor-header button[type="submit"]').disabled`,'Transaction cannot save an unfinished category flow')
  await click('Save category');await check(`document.querySelector('.transaction-new-category [role="alert"]').textContent.includes('Enter a category name')`,'Empty inline category name is rejected')
  await field('New Expense category name',' fOoD ');await click('Save category')
  await check(`document.querySelector('.transaction-new-category [role="alert"]').textContent.includes('already exists')`,'Inline category uses shared case-insensitive duplicate validation')
  assert.deepEqual(await draft(),originalDraft);results.push('Opening and validation preserve amount/date/account/note/tax/receipt/category')
  await click('Cancel category');assert.deepEqual(await draft(),originalDraft);results.push('Cancel category leaves every transaction draft field unchanged')
  await click('+ New category');await field('New Expense category name','Cancelled by Escape');await keyboard('Escape')
  await check(`!document.querySelector('.transaction-new-category')&&!!document.querySelector('dialog[open]')&&document.activeElement===document.querySelector('.transaction-create-category')`,'Escape closes only inline creation and returns focus to its action')
  assert.deepEqual(await draft(),originalDraft)
  await click('+ New category');await field('New Expense category name','  Travel  ');await keyboard('Enter')
  await wait(`!document.querySelector('.transaction-new-category')&&!document.querySelector('[aria-busy="true"]')`)
  const travelId=await evaluate(`document.querySelector('select[id$="-category"]').value`)
  const categoryOnly=(await snapshot()).categories.find(c=>c.id===travelId)
  assert.deepEqual(categoryOnly,{id:travelId,name:'Travel',type:'expense'});results.push('Enter saves a trimmed Expense category and auto-selects it')
  assert.deepEqual(await draft(),{...originalDraft,category:travelId});results.push('Category success and shared refresh preserve all other draft fields')
  await check(`document.activeElement===document.querySelector('select[id$="-category"]')||document.activeElement===document.querySelector('.transaction-create-category')`,'Focus returns to the category control after refresh')
  await save()
  const savedExpense=(await snapshot()).transactions[0]
  assert.equal(savedExpense.categoryId,travelId);assert.equal(savedExpense.taxAmountCents,1500);assert.equal(savedExpense.receiptNumber,'INV-2048');results.push('Expense persists the new category with exact existing draft metadata')
  await edit(savedExpense.id);await createCategory('Independent category','Expense');await click('Cancel')
  await wait(`!document.querySelector('dialog[open]')`)
  assert.deepEqual((await snapshot()).transactions[0],savedExpense);assert.ok((await snapshot()).categories.some(c=>c.name==='Independent category'));results.push('Cancel editing preserves original transaction and independently saved category')
  await navigate('more/categories','.categories-section')
  await check(`document.querySelector('.categories-section').textContent.includes('Travel')&&document.querySelector('.categories-section').textContent.includes('Independent category')`,'Shared refresh exposes inline-created categories on Categories screen')
  await navigate('transactions','.transactions-section');await click('Filters')
  await evaluate(`[...document.querySelectorAll('.transaction-filter-disclosure summary')].find(e=>e.textContent.startsWith('Categories')).click()`)
  await check(`document.querySelector('dialog').textContent.includes('Travel')&&!!document.querySelector('input[name="types"][value="refund"]')`,'Filters expose created categories and Refund type')
  await click('Cancel')
  await click('Add Transaction');await type('income')
  const incomeCategory=await createCategory('Travel','Income')
  await check(`document.querySelector('select[id$="-category"]').value===${JSON.stringify(incomeCategory)}`,'Income creates and selects an Income category, same name across types allowed')
  assert.equal((await snapshot()).categories.find(c=>c.id===incomeCategory).type,'income')
  await field('Amount (CAD)','200');await field('Destination account','bank');await save()
  await click('Add Transaction');await type('transfer')
  await check(`!document.querySelector('.transaction-create-category')&&!document.querySelector('select[id$="-category"]')`,'Transfer has no category or inline creation')
  await click('Cancel')
  await click('Add Transaction');await type('refund')
  await check(`!document.querySelector('.transaction-receipt-details')&&document.querySelector('label[for$="-account"]').textContent==='Destination account'&&!!document.querySelector('select[id$="-account"] option[value="card"]')`,'Refund uses Expense categories and all destination account types with no tax/receipt UI')
  const returnCategory=await createCategory('Returns','Expense')
  assert.equal((await snapshot()).categories.find(c=>c.id===returnCategory).type,'expense');results.push('Refund creates and selects an Expense category')
  await field('Amount (CAD)','25');await field('Destination account','card');await field('Note (optional)','Merchant refund');await save()
  let savedRefund=(await snapshot()).transactions.find(t=>t.type==='refund')
  assert.equal(savedRefund.amount,2500);assert.equal(savedRefund.accountId,'card');assert.equal(savedRefund.categoryId,returnCategory)
  assert.ok(!Object.hasOwn(savedRefund,'taxAmountCents')&&!Object.hasOwn(savedRefund,'receiptNumber'));results.push('Refund add persists positive cents to a credit-card destination without metadata')
  await check(`(()=>{const row=document.querySelector('[data-transaction-id="${savedRefund.id}"]');return row.textContent.includes('Refund')&&row.textContent.includes('Returns')&&row.textContent.includes('Card')&&row.querySelector('.financial-refund').textContent.startsWith('+')})()`,'History clearly labels Refund, category, account and positive amount with separate styling')
  await edit(savedRefund.id);await field('Amount (CAD)','30');await field('Destination account','bank');await field('Expense category',travelId);await save()
  savedRefund=(await snapshot()).transactions.find(t=>t.id===savedRefund.id)
  assert.equal(savedRefund.amount,3000);assert.equal(savedRefund.accountId,'bank');assert.equal(savedRefund.categoryId,travelId);results.push('Refund edit retains ID and supports bank destination/category changes')
  await inputSearch('refund');await check(`document.querySelectorAll('[data-transaction-id]').length===1`,'History search matches Refund type label');await inputSearch('')
  await edit(savedRefund.id);await click('Delete transaction');await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]')`)
  assert.ok(!(await snapshot()).transactions.some(t=>t.id===savedRefund.id));results.push('Refund deletion removes only that record')

  // Repository invariants run against actual IndexedDB, independently of UI constraints.
  const validRefund={id:'repository-refund',type:'refund',amount:2500,date:'2026-10-05',accountId:'card',categoryId:'food'}
  await evaluate(`import('/src/persistence/repositories.ts').then(m=>m.transactionsRepository.add(${JSON.stringify(validRefund)}))`)
  for(const fields of [{accountId:'missing'},{categoryId:'missing'},{categoryId:'salary'},{amount:0},{amount:-1},{amount:0.5},{amount:Number.MAX_SAFE_INTEGER+1},{date:'2026-02-30'},{note:12},{fromAccountId:'bank'},{toAccountId:'bank'},{taxAmountCents:1},{receiptNumber:'INV'}]){
    for(const method of ['add','update']){
      const candidate={...validRefund,...fields,...(method==='add'?{id:'bad-refund'}:{})}
      const before=await snapshot()
      await check(`import('/src/persistence/repositories.ts').then(async m=>{try{await m.transactionsRepository.${method}(${JSON.stringify(candidate)});return false}catch{return true}})`,`Repository ${method} rejects Refund ${JSON.stringify(fields)}`)
      assert.deepEqual(await snapshot(),before)
    }
  }
  const refundOnly={...empty,transactions:[validRefund],applicationSettings:cadSettings}
  await setWorkspace(refundOnly)
  for(const [method,arg] of [['accountsRepository.delete','card'],['categoriesRepository.delete','food'],['categoriesRepository.update',{...empty.categories[0],type:'income'}],['accountsRepository.update',{...empty.accounts[1],type:'bank'}]]){
    await check(`import('/src/persistence/repositories.ts').then(async m=>{try{await m.${method}(${JSON.stringify(arg)});return false}catch{return true}})`,`Refund-only reference protects ${method}`)
  }
  await check(`import('/src/persistence/repositories.ts').then(async m=>(await m.transactionsRepository.getByType('refund')).length===1&&(await m.transactionsRepository.getByAccount('card'))[0].id==='repository-refund')`,'Existing type and account indexes return Refund without migration')
  await check(`import('/src/persistence/repositories.ts').then(async m=>{try{await m.transactionsRepository.add({...${JSON.stringify(validRefund)},id:'card-income',type:'income',categoryId:'salary'});return false}catch(e){return e.message.includes('bank or cash')}})`,'Income remains prohibited on credit cards')
  await check(`(async()=>{const d=await import('/src/persistence/dataBackup.ts');try{await d.importTransactionBatch([{...${JSON.stringify(validRefund)},id:'would-add'},{...${JSON.stringify(validRefund)},id:'invalid',categoryId:'salary'}],'CAD');return false}catch{return !(await d.readApplicationSnapshot()).transactions.some(t=>t.id==='would-add')}})()`,'Invalid Refund batch rolls back every selected CSV row')
  assert.deepEqual(await snapshot(),{...empty,transactions:[validRefund]});results.push('Rejected repository writes and reference operations preserve all financial data exactly')
  await navigate('accounts/card','.account-details-summary')
  await check(`document.querySelector('.account-details-summary').textContent.includes('25.00')&&document.querySelector('.account-details-activity .financial-refund').textContent.startsWith('+')&&document.querySelector('.account-details-activity').textContent.includes('Refund')`,'Credit-card account activity includes Refund and supports an overpaid balance')
  await navigate('home','.dashboard-summary')
  await check(`document.querySelector('.dashboard-summary').textContent.includes('-$25.00')&&document.querySelector('.dashboard-activity').textContent.includes('Refund')&&document.querySelector('.dashboard-activity .financial-refund').textContent.startsWith('+')`,'Refund-only month shows negative Expenses, improved cash flow and Refund recent activity')
  await check(`!document.querySelector('.spending-donut-svg')&&document.querySelector('.dashboard-breakdown').textContent.includes('Refunds exceed')`,'Refund-only category has no negative donut slice and an explicit explanation')
  const partial={...refundOnly,transactions:[{id:'expense',type:'expense',date:'2026-10-01',amount:10000,accountId:'card',categoryId:'food'},validRefund]}
  await setWorkspace(partial);await wait(`!!document.querySelector('.spending-donut-svg')`)
  await check(`document.querySelector('.spending-donut-total').textContent.includes('75.00')&&document.querySelector('.dashboard-category-amount').textContent.includes('75.00')&&document.querySelector('.dashboard-category-percentage').textContent==='100%'`,'Partial Refund gives exact net Expenses/category spending and 100% donut')
  const overByCategory={...refundOnly,transactions:[{...partial.transactions[0],amount:1000},validRefund,{...partial.transactions[0],id:'rent',categoryId:'rent'}],categories:[...empty.categories,{id:'rent',name:'Rent',type:'expense'}]}
  await setWorkspace(overByCategory);await wait(`!!document.querySelector('.spending-donut-svg')`)
  await check(`document.querySelector('.dashboard-summary').textContent.includes('85.00')&&document.querySelector('.spending-donut-total').textContent.includes('Chart total')&&document.querySelector('.spending-donut-total').textContent.includes('100.00')&&document.querySelector('.dashboard-breakdown').textContent.includes('15.00')&&document.querySelectorAll('.dashboard-category-row').length===1`,'Over-refunded category is excluded; chart total and signed net Expenses difference is explained')

  // Actual download / replace restore / CSV import preserve Refund records and existing records.
  await navigate('more/data-backup','.data-backup-section')
  const baseline=await snapshot()
  await evaluate(`document.querySelector('.backup-export-row').click()`)
  const backup=JSON.parse(await downloaded('my-finance-backup-2026-10-05.json'))
  assert.equal(backup.schemaVersion,3);assert.deepEqual(backup.data.transactions,baseline.transactions);results.push('Downloaded Backup v3 preserves exact Refund and Expense records')
  await setWorkspace({...empty,applicationSettings:cadSettings});await chooseFile(backup);await wait(`!!document.querySelector('dialog[open]')`);await click('Replace current data');await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]')`)
  assert.deepEqual(await snapshot(),baseline);results.push('Backup v3 replacement restore round-trips Refund and all existing data')
  const csv=await evaluate(`(async()=>{const d=await import('/src/persistence/dataBackup.ts'),c=await import('/src/features/dataBackup/transactionCsv.ts');const s=await d.readApplicationSnapshot();return c.transactionsCsv({...s,transactions:[{...s.transactions.find(t=>t.type==='refund'),id:'csv-refund'}]},'CAD')})()`)
  await chooseFile(csv,'backup-csv-file','refund.csv');await wait(`!!document.querySelector('dialog[open]')`)
  await check(`document.querySelector('.backup-csv-counts').textContent.includes('Ready: 1')&&document.querySelector('.backup-preview-list').textContent.includes('Refund')&&document.querySelector('.backup-preview-list .financial-refund').textContent.startsWith('+')`,'CSV preview recognizes Refund and positive account-direction amount')
  await click('Import 1 transaction');await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]')`)
  assert.deepEqual((await snapshot()).transactions.find(t=>t.id==='csv-refund'),{...validRefund,id:'csv-refund'});results.push('Actual CSV import persists exact credit-card Refund')
  await navigate('transactions','.transactions-section');await send('Page.reload');await wait(`!!document.querySelector('.transactions-section')&&!document.querySelector('[aria-busy="true"]')`)
  await edit('csv-refund');await check(`document.querySelector('.transaction-fixed-type').textContent.includes('Refund')&&document.querySelector('select[id$="-account"]').value==='card'`,'Refund survives browser reload and reopens as fixed Refund type');await click('Cancel')

  for(const currencyCode of ['CAD','USD','EUR']){
    await setWorkspace({...empty,applicationSettings:{...cadSettings,currencyCode}})
    await click('Add Transaction');await type('refund');await field(`Amount (${currencyCode})`,'25.99');await field('Expense category','food');await field('Destination account','bank');await save()
    const record=(await snapshot()).transactions[0];assert.equal(record.amount,2599)
    await check(`document.querySelector('.transaction-row-amount').textContent.startsWith('+')&&document.querySelector('.transaction-row-amount').textContent.includes('25.99')`,`${currencyCode} Refund saves exact cents and uses workspace formatting`)
  }
  // Every theme/viewport/text-size combination covers both four-way type control and inline creation.
  await setWorkspace(overByCategory)
  for(const theme of ['sage','ocean','dark'])for(const [width,font] of [[320,16],[390,16],[1280,16],[320,32],[390,32],[1280,32]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:false})
    await evaluate(`import('/src/features/appearance/themePreference.ts').then(m=>m.setTheme('${theme}'));document.documentElement.style.fontSize='${font}px'`)
    await click('Add Transaction')
    await check(`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth&&document.querySelector('.transaction-editor-body').scrollWidth<=document.querySelector('.transaction-editor-body').clientWidth&&[...document.querySelectorAll('.transaction-segment')].every(e=>e.getBoundingClientRect().height>=48)&&document.querySelector('.transaction-editor-header').getBoundingClientRect().bottom<innerHeight/3`,`${theme} ${width}px ${font===32?'200%':'100%'} four types fit with touch targets and reachable Save`)
    await type('refund');await click('+ New category');await field('New Expense category name','Viewport draft')
    await check(`document.querySelector('dialog').scrollWidth<=document.querySelector('dialog').clientWidth&&document.querySelector('.transaction-new-category').scrollWidth<=document.querySelector('.transaction-new-category').clientWidth&&document.querySelector('.transaction-new-category input').getBoundingClientRect().right<=innerWidth&&document.querySelector('.transaction-new-category input:focus-visible')&&[...document.querySelectorAll('.transaction-new-category button')].every(e=>e.getBoundingClientRect().height>=48)`,`${theme} ${width}px ${font===32?'200%':'100%'} inline category fits with visible focus and touch targets`)
    if(width===390&&font===16||theme==='dark'&&width===320&&font===32){const screenshot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(artifacts,`${theme}-${width}-${font}-inline-category.png`),Buffer.from(screenshot.data,'base64'))}
    await keyboard('Tab');await check(`document.activeElement.textContent==='Save category'&&document.activeElement.matches(':focus-visible')`,`${theme} ${width}px ${font===32?'200%':'100%'} keyboard reaches Save category`)
    await keyboard('Escape');await keyboard('Escape');await wait(`!document.querySelector('dialog[open]')`)
    await navigate('home','.dashboard-summary')
    await check(`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.dashboard-breakdown').scrollWidth<=document.querySelector('.dashboard-breakdown').clientWidth&&document.querySelector('.spending-donut-total').textContent.includes('Chart total')&&document.querySelector('.dashboard-breakdown').textContent.includes('85.00')&&document.querySelector('.dashboard-breakdown').textContent.includes('15.00')`,`${theme} ${width}px ${font===32?'200%':'100%'} Refund chart and net-total explanation fit`)
    await navigate('transactions','.transactions-section')
  }
  assert.deepEqual(errors,[],'No uncaught browser errors')
  await writeFile(join(artifacts,'results.json'),JSON.stringify({checks:results.length,results},null,2))
  console.log(`\n${results.length} Transaction improvements browser checks passed. Artifacts: ${artifacts}`)
}finally{
  if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify({id:++sequence,method:'Browser.close'}));await delay(400);socket.close()}
  if(browser.exitCode===null)browser.kill()
  const target=resolve(profile);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('my-finance-transaction-improvements-'))
  await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}

