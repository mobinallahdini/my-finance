// Spending donut, exact totals, refresh, accessibility and responsive regressions. Node 24 + Chrome + Vite.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const appURL = process.env.BILLS_APP_URL ?? 'http://127.0.0.1:5173'
const chrome = process.env.CHROME_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome')
const profile = await mkdtemp(join(tmpdir(), 'my-finance-spending-donut-'))
const artifacts = await mkdtemp(join(tmpdir(), 'my-finance-spending-donut-review-'))
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
  await evaluate(`(() => {const e=[...document.querySelectorAll(${JSON.stringify(selector)})].find(e=>(e.textContent.trim()===${JSON.stringify(text)}||e.getAttribute('aria-label')===${JSON.stringify(text)})); if(!e)throw new Error('Missing '+${JSON.stringify(text)});e.click()})()`)
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



const settings={id:'application',countryCode:'CA',currencyCode:'CAD',profileType:'personal',fiscalYearStartMonth:1,onboardingCompleted:true}
const empty={accounts:[{id:'bank',name:'Bank',type:'bank',openingBalance:1000000},{id:'card',name:'Card',type:'credit_card',openingBalance:0}],categories:[{id:'rent',name:'Rent',type:'expense'},{id:'food',name:'Groceries',type:'expense'},{id:'out',name:'Eating out',type:'expense'},{id:'salary',name:'Salary',type:'income'}],transactions:[],obligations:[],obligationPayments:[]}
const expense=(id,categoryId,amount,date='2026-10-05',details={})=>({id,type:'expense',categoryId,accountId:'bank',amount,date,...details})
const three={...empty,transactions:[expense('rent','rent',84000),expense('food','food',26000,'2026-10-04',{taxAmountCents:1500,receiptNumber:'INV-2048'}),expense('out','out',10000),expense('november','food',10000,'2026-11-01'),{id:'income',type:'income',categoryId:'salary',accountId:'bank',amount:500000,date:'2026-10-05'},{id:'transfer',type:'transfer',fromAccountId:'bank',toAccountId:'card',amount:500000,date:'2026-10-05'}],obligations:[{id:'bill',type:'bill',name:'Large bill',expectedAmountCents:80000,dueDay:15,startMonth:'2026-01',isActive:true}]}
const many={...empty,categories:[...empty.categories,...Array.from({length:5},(_,i)=>({id:'extra'+i,name:'Extra '+i,type:'expense'}))],transactions:[...three.transactions.filter(t=>t.date.startsWith('2026-10')),...[9000,8000,7000,6000,5000].map((amount,i)=>expense('extra'+i,'extra'+i,amount))]}
async function home(){await evaluate(`location.hash='home'`);await wait(`!!document.querySelector('.dashboard-summary')&&!document.querySelector('.dashboard-status')&&!document.querySelector('[aria-busy="true"]')`);await delay(70)}
async function setWorkspace(data,currencyCode='CAD'){
 await evaluate(`import('/src/persistence/dataBackup.ts').then(async m=>{await m.replaceWorkspaceSnapshot({...${JSON.stringify(data)},applicationSettings:{...${JSON.stringify(settings)},currencyCode:${JSON.stringify(currencyCode)}}});(await import('/src/features/shared/dataRefresh.ts')).notifyDataChanged()})`)
 await home()
}
async function field(label,value){await evaluate(`(()=>{const l=[...document.querySelectorAll('dialog label')].find(e=>e.textContent.trim()===${JSON.stringify(label)});if(!l)throw new Error('Missing field '+${JSON.stringify(label)});const e=document.getElementById(l.htmlFor),p=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}))})()`);await delay(40)}
async function edit(id){await evaluate(`location.hash='transactions'`);await wait(`!!document.querySelector('[data-transaction-id="${id}"]')&&!document.querySelector('[aria-busy="true"]')`);await evaluate(`document.querySelector('[data-transaction-id="${id}"]').click()`);await wait(`!!document.querySelector('dialog[open]')`)}
async function save(){await click('Save');await wait(`!document.querySelector('dialog[open]')&&!document.querySelector('[aria-busy="true"]')`)}
async function names(){return evaluate(`[...document.querySelectorAll('.dashboard-category-name')].map(e=>e.textContent)`)}
async function geometry(){return evaluate(`[...document.querySelectorAll('.spending-donut-slice')].map(e=>[e.getAttribute('stroke-dasharray'),e.getAttribute('stroke-dashoffset')])`)}
async function chartShot(name){await evaluate(`document.querySelector('.dashboard-breakdown').scrollIntoView({block:'start'})`);await delay(50);const shot=await send('Page.captureScreenshot',{format:'png'});await writeFile(join(artifacts,name+'.png'),Buffer.from(shot.data,'base64'))}
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



  await setWorkspace(empty)
  await check(`!document.querySelector('.spending-donut-svg')&&document.querySelector('.dashboard-breakdown .dashboard-empty').textContent.includes('No expenses in October 2026')`,'No expenses retains useful empty state without an empty donut')
  await setWorkspace({...empty,transactions:[expense('only','food',11500,'2026-10-05',{taxAmountCents:1500})]})
  await check(`document.querySelectorAll('.spending-donut-slice').length===1&&document.querySelector('.spending-donut-slice').getAttribute('stroke-dasharray')==='100 0'&&document.querySelector('.spending-donut-total').textContent==='Expenses$115.00'&&document.querySelector('.dashboard-category-percentage').textContent==='100%'`,'One category fills the donut and includes tax once in the total')
  await setWorkspace(three)
  assert.deepEqual(await names(),['Rent','Groceries','Eating out']);results.push('Three named slices descend by monthly expense amount')
  await check(`JSON.stringify([...document.querySelectorAll('.dashboard-category-amount')].map(e=>e.textContent))===JSON.stringify(['$840.00','$260.00','$100.00'])&&JSON.stringify([...document.querySelectorAll('.dashboard-category-percentage')].map(e=>e.textContent))===JSON.stringify(['70%','21.7%','8.3%'])&&document.querySelector('.spending-donut-total dd').textContent==='$1,200.00'`,'Legend retains exact category amounts, one-decimal shares and authoritative total')
  await check(`document.querySelectorAll('.dashboard-category-track,.dashboard-show-categories').length===0&&document.querySelectorAll('.dashboard-category-list').length===1`,'A single compact legend replaces progress bars and hidden-category expansion')
  await check(`document.querySelectorAll('.spending-donut-slice').length===3&&!document.querySelector('.spending-donut-layout').textContent.includes('Salary')&&!document.querySelector('.spending-donut-layout').textContent.includes('Transfer')&&!document.querySelector('.spending-donut-layout').textContent.includes('Large bill')&&!document.querySelector('.spending-donut-layout').textContent.includes('Tax')`,'Income, Transfer, tracking bills and separate tax slices are excluded')
  await check(`(async()=>{const d=await import('/src/persistence/dataBackup.ts'),c=await import('/src/domain/calculations.ts'),s=await d.readApplicationSnapshot();return c.calculateMonthlyTotalExpenses(s.transactions,'2026-10')===120000&&c.calculateMonthlyTotalIncome(s.transactions,'2026-10')===500000&&c.calculateAccountBalance(s.accounts[0],s.transactions)===870000&&document.querySelector('.dashboard-net-amount').textContent==='+$3,800.00'})()`,'Chart leaves monthly financial totals, net cash flow and account balance calculations unchanged')
  const ax=await send('Accessibility.getFullAXTree'),axNames=ax.nodes.filter(n=>!n.ignored).map(n=>n.name?.value)
  for(const text of ['Expenses','$1,200.00','Rent','$840.00','70%','Groceries','$260.00','21.7%','Eating out','$100.00','8.3%'])assert.ok(axNames.includes(text),'Accessible text '+text)
  assert.ok(ax.nodes.some(n=>!n.ignored&&n.role?.value==='list'&&n.name?.value==='Category expenses for October 2026'));results.push('Accessibility tree exposes complete total and semantic legend, independent of SVG geometry')
  await check(`document.querySelector('.spending-donut-svg').getAttribute('aria-hidden')==='true'&&document.querySelector('.spending-donut-svg').getAttribute('focusable')==='false'&&[...document.querySelectorAll('.spending-donut-marker')].every(e=>e.getAttribute('aria-hidden')==='true')`,'SVG and color markers are decorative while HTML carries complete information')
  const october=await geometry();await click('Next month');await wait(`document.querySelector('.spending-donut-total dd')?.textContent==='$100.00'&&!document.querySelector('.dashboard-status')`)
  await check(`document.querySelectorAll('.dashboard-category-row').length===1&&document.querySelector('.dashboard-category-name').textContent==='Groceries'&&document.querySelector('.dashboard-category-percentage').textContent==='100%'&&document.querySelector('.spending-donut-layout').getAttribute('aria-label').includes('November 2026')`,'Month navigation updates total, slices, legend, percentages and accessible month')
  await click('Next month');await wait(`!document.querySelector('.dashboard-status')`)
  await check(`!document.querySelector('.spending-donut-svg')&&document.querySelector('.dashboard-breakdown').textContent.includes('No expenses in December 2026')`,'Month switching to zero removes the chart')
  await click('Previous month');await click('Previous month');await wait(`document.querySelector('.spending-donut-total dd')?.textContent==='$1,200.00'`);assert.deepEqual(await geometry(),october);results.push('Returning to a month restores current geometry without separate chart state')
  await evaluate(`window.__chartRefreshMarker='preserved';import('/src/persistence/repositories.ts').then(async m=>{await m.categoriesRepository.update({id:'food',name:'Fresh groceries',type:'expense'});(await import('/src/features/shared/dataRefresh.ts')).notifyDataChanged()})`)
  await wait(`document.querySelector('.dashboard-breakdown')?.textContent.includes('Fresh groceries')&&!document.querySelector('.dashboard-status')`);assert.deepEqual(await geometry(),october);results.push('Category rename refreshes labels without a reload or monetary/geometry change')
  await evaluate(`location.hash='transactions'`);await wait(`!!document.querySelector('.transaction-add')&&!document.querySelector('[aria-busy="true"]')`);await click('Add Transaction')
  await field('Amount (CAD)','115');await field('Expense category','food');await field('Account / payment source','bank');await click('Tax & receipt (optional)');await field('Tax / VAT (CAD)','15');await save()
  const added=(await snapshot()).transactions.find(t=>t.amount===11500);assert.ok(added);await home()
  await check(`document.querySelector('.spending-donut-total dd').textContent==='$1,315.00'&&[...document.querySelectorAll('.dashboard-category-row')].find(e=>e.textContent.includes('Fresh groceries')).textContent.includes('$375.00')&&window.__chartRefreshMarker==='preserved'`,'Saving an Expense refreshes its category and donut immediately, including tax exactly once')
  await edit(added.id);await field('Amount (CAD)','200');await save();await home()
  await check(`document.querySelector('.spending-donut-total dd').textContent==='$1,400.00'&&[...document.querySelectorAll('.dashboard-category-row')].find(e=>e.textContent.includes('Fresh groceries')).textContent.includes('$460.00')`,'Editing Expense total refreshes the donut and category amount')
  await edit(added.id);await click('Delete transaction');await wait(`!document.querySelector('dialog[open]')`);await home()
  await check(`document.querySelector('.spending-donut-total dd').textContent==='$1,200.00'`,'Deleting Expense restores the current monthly chart automatically')
  await setWorkspace(many)
  assert.deepEqual(await names(),['Rent','Groceries','Eating out','Extra 0','Extra 1','Other']);results.push('Eight categories show exactly five largest names plus Other')
  await check(`document.querySelector('.spending-donut-total dd').textContent==='$1,550.00'&&document.querySelectorAll('.dashboard-category-amount')[5].textContent==='$180.00'&&document.querySelectorAll('.dashboard-category-percentage')[5].textContent==='11.6%'&&document.querySelectorAll('.spending-donut-slice').length===6&&!document.querySelector('.spending-donut-legend').textContent.includes('Extra 2')`,'Other preserves all remaining cents without listing hidden individual categories')
  // Historical orphan data bypasses modern repository reference validation only in this disposable profile.
  await setWorkspace({...empty,transactions:[]})
  await evaluate(`import('/src/persistence/database.ts').then(async m=>{await m.database.transactions.add(${JSON.stringify(expense('orphan','missing',11500))});(await import('/src/features/shared/dataRefresh.ts')).notifyDataChanged()})`);await home()
  await check(`document.querySelector('.dashboard-category-name').textContent==='Unknown category'&&document.querySelector('.dashboard-category-amount').textContent==='$115.00'&&document.querySelector('.dashboard-warning').textContent.includes('Unknown category')`,'Unknown historical category remains a visible slice/legend with its exact amount and warning')
  await setWorkspace(many)
  await evaluate(`import('/src/persistence/database.ts').then(async m=>{await m.database.transactions.add(${JSON.stringify(expense('orphan','missing',1))});(await import('/src/features/shared/dataRefresh.ts')).notifyDataChanged()})`);await home()
  await check(`document.querySelectorAll('.dashboard-category-amount')[4].textContent==='$0.01'&&document.querySelectorAll('.dashboard-category-name')[4].textContent==='Unknown category'&&document.querySelectorAll('.dashboard-category-amount')[5].textContent==='$260.00'&&document.querySelector('.dashboard-warning').textContent.includes('Unknown category')`,'Unknown spending below the top five retains a named slot and exact cent, with other spending conserved')
  for(const currencyCode of ['CAD','USD','EUR']){
    await setWorkspace(three,currencyCode)
    const expected=await evaluate(`import('/src/features/accounts/money.ts').then(m=>m.formatMoney(120000,'${currencyCode}'))`)
    await check(`document.querySelector('.spending-donut-total dd').textContent===${JSON.stringify(expected)}&&document.querySelector('.spending-donut-layout').getAttribute('aria-label').includes('${currencyCode}')&&document.querySelectorAll('.dashboard-category-amount').length===3`,`${currencyCode} uses the centralized formatter and accessible currency context`)
  }
  const longName='A very long category name with spaces and punctuation / '+ 'unbroken'.repeat(12)
  const responsive={...many,categories:many.categories.map(c=>c.id==='rent'?{...c,name:longName}:c)}
  for(const theme of ['sage','ocean','dark'])for(const [width,font]of [[320,16],[390,16],[768,16],[1280,16],[320,32],[390,32],[768,32],[1280,32]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false})
    await evaluate(`import('/src/features/appearance/themePreference.ts').then(m=>m.setTheme('${theme}'));document.documentElement.style.fontSize='${font}px'`)
    await setWorkspace(responsive)
    await check(`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.dashboard-breakdown').scrollWidth<=document.querySelector('.dashboard-breakdown').clientWidth&&document.querySelector('.spending-donut-legend').scrollWidth<=document.querySelector('.spending-donut-legend').clientWidth&&document.querySelector('.spending-donut-figure').getBoundingClientRect().width<=240&&document.querySelector('.spending-donut-total dd').textContent==='$1,550.00'`,`${theme} ${width}px ${font===32?'200%':'100%'} chart and long-name legend fit without horizontal overflow`)
    const colors=await evaluate(`[...document.querySelectorAll('.spending-donut-slice')].map(e=>getComputedStyle(e).stroke)`),markers=await evaluate(`[...document.querySelectorAll('.spending-donut-marker')].map(e=>getComputedStyle(e).backgroundColor)`)
    assert.equal(new Set(colors).size,6);assert.deepEqual(colors,markers);results.push(`${theme} ${width}px ${font===32?'200%':'100%'} six visible category colors match legend markers`)
    await check(`(()=>{const f=document.querySelector('.spending-donut-figure').getBoundingClientRect(),l=document.querySelector('.spending-donut-legend').getBoundingClientRect();return ${font===16&&width>=768?'l.left>=f.right':'l.top>=f.bottom'}})()`,`${theme} ${width}px ${font===32?'200%':'100%'} layout uses side-by-side space or accessible stacked legend`)
    if(width===390&&font===16||theme==='dark'&&width===320&&font===32||theme==='sage'&&width===1280&&font===16)await chartShot(`${theme}-${width}-${font}-donut`)
  }
  for(const currencyCode of ['CAD','USD','EUR'])for(const [width,font]of [[320,16],[390,16],[320,32],[390,32]]){
    await send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await evaluate(`document.documentElement.style.fontSize='${font}px'`)
    await setWorkspace({...empty,transactions:[expense('large','food',Number.MAX_SAFE_INTEGER)]},currencyCode)
    const expected=await evaluate(`import('/src/features/accounts/money.ts').then(m=>m.formatMoney(Number.MAX_SAFE_INTEGER,'${currencyCode}'))`)
    await check(`document.querySelector('.spending-donut-total dd').textContent===${JSON.stringify(expected)}&&document.querySelector('.dashboard-category-amount').textContent===${JSON.stringify(expected)}&&document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.spending-donut-total dd').scrollWidth<=document.querySelector('.spending-donut-total dd').clientWidth&&document.querySelector('.spending-donut-total').scrollHeight<=document.querySelector('.spending-donut-total').clientHeight`,`${currencyCode} maximum exact amount at ${width}px ${font===32?'200%':'100%'} remains complete and readable inside the ring`)
    if(currencyCode==='USD'&&width===320&&font===32)await chartShot('dark-320-200-large-USD')
  }
  assert.deepEqual(errors,[],'No uncaught browser errors')
  await writeFile(join(artifacts,'results.json'),JSON.stringify({checks:results.length,results},null,2))
  console.log(`\n${results.length} Spending donut browser checks passed. Artifacts: ${artifacts}`)
}finally{
  if(socket?.readyState===WebSocket.OPEN){socket.send(JSON.stringify({id:++sequence,method:'Browser.close'}));await delay(400);socket.close()}
  if(browser.exitCode===null)browser.kill()
  const target=resolve(profile);assert.equal(dirname(target),resolve(tmpdir()));assert.ok(basename(target).startsWith('my-finance-spending-donut-'))
  await rm(target,{recursive:true,force:true,maxRetries:10,retryDelay:100})
}
