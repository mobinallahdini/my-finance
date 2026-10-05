// Real UI checks with isolated IndexedDB, native dialogs, and Chrome's DevTools protocol.
// Node 24 + Chrome + a running Vite server; no automation dependencies.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const appURL = process.env.BILLS_APP_URL ?? 'http://127.0.0.1:5173'
const chrome = process.env.CHROME_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome')
const profile = await mkdtemp(join(tmpdir(), 'my-finance-bills-ui-'))
const artifacts = await mkdtemp(join(tmpdir(), 'my-finance-bills-review-'))
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let launchError, socket, sequence = 0, acceptDialogs = true, confirmations = 0
browser.on('error', (error) => { launchError = error })
const pending = new Map(), failures = [], results = []
function send(method, params = {}) {
  return new Promise((resolvePromise, reject) => {
    const id = ++sequence
    pending.set(id, { resolve: resolvePromise, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? JSON.stringify(response.exceptionDetails))
  return response.result.value
}
async function wait(expression) {
  for (let i = 0; i < 100; i++) { if (await evaluate(expression)) return; await delay(50) }
  console.error('Browser state:', await evaluate(`({hash:location.hash,text:document.body.textContent.slice(0,2200)})`), failures)
  throw new Error(`Timed out: ${expression}`)
}
async function check(expression, name) {
  assert.ok(await evaluate(expression), name)
  results.push(name)
  console.log(`PASS ${name}`)
}
async function click(text, selector = 'button') {
  await evaluate(`(() => { const element = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.textContent.trim() === ${JSON.stringify(text)} || e.getAttribute('aria-label') === ${JSON.stringify(text)}); if (!element) throw new Error('Missing control: ' + ${JSON.stringify(text)}); element.click() })()`)
  await delay(70)
}
async function field(label, value) {
  await evaluate(`(() => { const label = [...document.querySelectorAll('dialog[open] label')].find(e => e.textContent.trim() === ${JSON.stringify(label)}); if (!label) throw new Error('Missing field'); const element = document.getElementById(label.htmlFor); const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true })); })()`)
  await delay(30)
}
async function save() { await click('Save'); await wait(`!document.querySelector('dialog[open]') && !document.querySelector('.obligations-section [role="status"]')`) }
async function route(hash) {
  await evaluate(`location.hash = ${JSON.stringify(hash)}`)
  await wait(`location.hash === ${JSON.stringify('#' + hash)} && !!document.querySelector('.obligations-section') && !document.querySelector('.obligations-section [role="status"]')`)
  await delay(70)
}
async function reloadPage() {
  await evaluate('window.__beforeReload = true')
  await send('Page.reload')
  await wait(`!window.__beforeReload && !!document.querySelector('.obligations-section') && !document.querySelector('.obligations-section [role="status"]')`)
}
async function home() {
  await evaluate(`location.hash = 'home'`)
  await wait(`!!document.querySelector('.dashboard-payments') && !!document.querySelector('.dashboard-summary') && document.querySelector('.dashboard-payments').getAttribute('aria-busy') === 'false' && !document.querySelector('.dashboard-status')`)
}
async function homeMonth(direction) {
  await click(`${direction} month`)
  await wait(`!document.querySelector('.dashboard-status')`)
}
async function trackingUpdate(expression) {
  await evaluate(`(async () => { const { obligationsRepository: obligations, obligationPaymentsRepository: payments } = await import('/src/persistence/repositories.ts'); ${expression}; (await import('/src/features/shared/dataRefresh.ts')).notifyDataChanged() })()`)
  await wait(`document.querySelector('.dashboard-payments').getAttribute('aria-busy') === 'false' && !document.querySelector('.dashboard-status')`)
}
async function homeNames(names, name) {
  await check(`JSON.stringify([...document.querySelectorAll('.dashboard-payment-heading strong')].map(e => e.textContent)) === ${JSON.stringify(JSON.stringify(names))}`, name)
}
async function textCheck(text, name) { await check(`document.querySelector('.obligations-section').textContent.includes(${JSON.stringify(text)})`, name) }
async function key(key, code = key, modifiers = 0) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, windowsVirtualKeyCode: key === 'Tab' ? 9 : key === 'Escape' ? 27 : 13 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers })
  await delay(70)
}
async function add(type, name, amount, day = '1', start = '2026-10', scheduled = '60') {
  await click('+ Add')
  await field('Type', type); await field('Name', name)
  await field(type === 'bill' ? 'Expected monthly amount (CAD)' : 'Original amount (CAD)', amount)
  if (type === 'installment') await field('Scheduled monthly payment (CAD)', scheduled)
  await field('Due day (1–31)', day); await field('Start month', start)
  await save()
  return evaluate(`(async () => { const { obligationsRepository } = await import('/src/persistence/repositories.ts'); return (await obligationsRepository.getAll()).find(o => o.name === ${JSON.stringify(name)}).id })()`)
}
async function payment(amount, paidDate, note) {
  await click('Record payment')
  if (amount !== undefined) await field('Amount (CAD)', amount)
  if (paidDate) await field('Paid date', paidDate)
  if (note) await field('Note (optional)', note)
  await save()
}
async function snapshot() {
  return evaluate(`import('/src/persistence/dataBackup.ts').then(m => m.readFinancialSnapshot())`)
}
try {
  let port
  for (let i = 0; i < 200; i++) {
    if (launchError) throw launchError
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break } catch { await delay(50) }
  }
  assert.ok(port, 'Chrome debugger port')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolveOpen, reject) => { socket.onopen = resolveOpen; socket.onerror = reject })
  socket.onmessage = ({ data }) => {
    const response = JSON.parse(data), promise = pending.get(response.id)
    if (promise) { pending.delete(response.id); if (response.error) promise.reject(new Error(JSON.stringify(response.error))); else promise.resolve(response.result) }
    if (response.method === 'Page.javascriptDialogOpening') { confirmations++; void send('Page.handleJavaScriptDialog', { accept: acceptDialogs }) }
    if (response.method === 'Runtime.exceptionThrown') failures.push(response.params.exceptionDetails.exception?.description ?? response.params.exceptionDetails.text)
  }
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setTimezoneOverride', { timezoneId: 'America/Toronto' })
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `const OriginalDate = Date; window.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : ['2026-10-05T16:00:00Z'])) } static now() { return new OriginalDate('2026-10-05T16:00:00Z').getTime() } };` })
  await send('Page.navigate', { url: `${appURL}/#more` })
  await wait(`!!document.querySelector('.finance-onboarding')`)
  await evaluate(`(() => { for (const [suffix,value] of [['country','CA'],['currency','CAD']]) { const select=document.querySelector('select[id$="-'+suffix+'"]');select.value=value;select.dispatchEvent(new Event('change',{bubbles:true})) } })()`)
  await click('Start using My Finance')
  await wait(`!!document.querySelector('.more-section')`)
  await click('Bills & InstallmentsTrack monthly bills, installments, due dates, and payments', 'a')
  await wait(`!!document.querySelector('.obligations-section') && !document.querySelector('.obligations-section [role="status"]')`)
  await textCheck('No bills or installments yet.', 'More link opens the empty tracking page')
  await check(`document.querySelector('nav a[href="#more"]').getAttribute('aria-current') === 'page'`, 'More remains active')
  await check(`document.getElementById('obligation-month').value === '2026-10'`, 'Initial month is local current month')
  await click('← Back to More', 'a'); await wait(`!!document.querySelector('.more-section')`)
  results.push('Back to More works')
  await send('Page.navigate', { url: `${appURL}/#more/bills-installments` })
  await wait(`!!document.querySelector('.obligations-section') && !document.querySelector('.obligations-section [role="status"]')`)
  await reloadPage()
  results.push('Direct list route and reload work')
  await evaluate(`(async () => { const { accountsRepository, categoriesRepository, transactionsRepository } = await import('/src/persistence/repositories.ts'); await accountsRepository.add({ id:'bank', type:'bank', name:'Existing bank', openingBalance:100000 }); await categoriesRepository.add({ id:'food', type:'expense', name:'Food' }); await transactionsRepository.add({ id:'existing-expense', type:'expense', accountId:'bank', categoryId:'food', amount:2500, date:'2026-10-01' }); await categoriesRepository.add({id:'salary',type:'income',name:'Salary'}); await transactionsRepository.add({id:'existing-income',type:'income',accountId:'bank',categoryId:'salary',amount:250000,date:'2026-10-02'}); })()`)
  const financialBefore = await snapshot()
  await click('+ Add'); await check(`document.activeElement.tagName === 'H2' && !!document.querySelector('dialog[open]')`, 'Dialog has a named initial focus target')
  await key('Tab', 'Tab', 8)
  await check(`document.activeElement.type === 'checkbox'`, 'Shift Tab wraps from heading to last field')
  await key('Tab'); await check(`document.activeElement.textContent === 'Cancel'`, 'Tab wraps inside dialog')
  await key('Escape'); await check(`!document.querySelector('dialog[open]') && document.activeElement.textContent === '+ Add'`, 'Escape closes and restores Add focus')
  const billId = await add('bill', 'Mobile', '100', '1')
  await textCheck('Overdue', 'Bill create shows derived overdue state')
  await evaluate(`document.querySelector('[data-obligation-id=${JSON.stringify(billId)}]').focus()`); await key('Enter')
  await wait(`document.querySelector('h2').textContent === 'Bill Details'`)
  await textCheck('No payments recorded yet.', 'Keyboard row opens Bill Details with empty history')
  await click('Edit'); await field('Name', 'Mobile plan'); await field('Note (optional)', 'Family plan'); await save()
  await textCheck('Mobile plan', 'Edit refreshes the same obligation details')
  await check(`location.hash.endsWith(${JSON.stringify(billId)})`, 'Edit preserves ID')
  await click('Record payment')
  await check(`[...document.querySelectorAll('dialog input')].some(e => e.value === '100.00') && [...document.querySelectorAll('dialog input')].some(e => e.value === '2026-10-05')`, 'Bill default is remaining expected amount and local paid date')
  for (const [amount, expected] of [['0', 'greater than zero'], ['-1', 'positive amount'], ['90071992547409.92', 'safely']]) {
    await field('Amount (CAD)', amount); await click('Save'); await textCheck(expected, `Reject invalid payment amount ${amount}`)
    await check(`!!document.querySelector('dialog[open]')`, 'Rejected amount keeps editor open')
  }
  await field('Amount (CAD)', '40'); await field('Paid date', '2026-11-02'); await field('Note (optional)', 'Late first part'); await save()
  await textCheck('Partially paid · Overdue', 'Partial payment retains overdue timing')
  await textCheck('For October 2026', 'History labels assigned due month')
  await textCheck('Paid November 2, 2026', 'Late payment history labels separate actual paid date')
  await route('more/bills-installments')
  await check(`document.querySelector('.obligation-summary > div:nth-child(2) dd').textContent === '$0.00'`, 'October paid summary excludes a November paid date')
  await click('Next month')
  await check(`document.querySelector('.obligation-summary > div:nth-child(2) dd').textContent === '$40.00'`, 'November paid summary includes the late October payment')
  await click('Previous month'); await route(`more/bills-installments/${billId}`)
  await check(`![...document.querySelectorAll('button')].some(b => b.textContent === 'Delete obligation')`, 'History hides obligation deletion in favor of inactive action')
  await click('Edit'); await field('Type', 'installment'); await field('Scheduled monthly payment (CAD)', '20'); await click('Save')
  await textCheck('Cannot change the type', 'Repository type integrity error remains in editor')
  await field('Type', 'bill'); await field('Start month', '2026-11'); await click('Save')
  await textCheck('start month', 'Repository start-month integrity error remains in editor')
  await click('Cancel')
  await payment()
  await check(`document.querySelector('.obligation-status').textContent === 'Paid'`, 'Second payment completes bill due month')
  await check(`document.querySelectorAll('.obligation-payment-row').length === 2`, 'Multiple payments append history records')
  await check(`document.querySelector('.obligation-payment-row').textContent.includes('November 2')`, 'History orders by paid date newest first')
  await click('Set inactive'); await textCheck('Inactive', 'Bill archive updates selected status')
  await check(`document.querySelectorAll('.obligation-payment-row').length === 2`, 'Archive preserves payment history')
  await click('Set active')
  acceptDialogs = false; await click('Delete'); acceptDialogs = true
  await check(`document.querySelectorAll('.obligation-payment-row').length === 2`, 'Rejecting destructive confirmation preserves payment')
  await click('Delete'); await wait(`document.querySelectorAll('.obligation-payment-row').length === 1`)
  await textCheck('Partially paid', 'Deleting payment recalculates status immediately')
  await check(`document.querySelectorAll('.obligation-payment-row').length === 1`, 'Individual payment deletion removes exactly one record')
  await route('more/bills-installments')
  await check(`document.activeElement.dataset.obligationId === ${JSON.stringify(billId)}`, 'Back to list restores obligation row focus')
  await check(`document.querySelector('.obligation-summary').textContent.includes('$60.00')`, 'Paid summary uses actual date, excludes late November payment')
  await click('Next month'); await check(`document.getElementById('obligation-month').value === '2026-11'`, 'Next month updates context')
  await check(`document.querySelector('.obligation-summary').textContent.includes('$0.00')`, 'Deleted late payment no longer counts in actual November paid summary')
  await click('Previous month'); await check(`document.getElementById('obligation-month').value === '2026-10'`, 'Previous month updates context')
  const installmentId = await add('installment', 'Laptop', '150', '8', '2026-10', '100')
  await textCheck('Due in 3 days', 'Installment uses derived due-soon label')
  await route(`more/bills-installments/${installmentId}`)
  await textCheck('$150.00', 'Installment original and remaining shown')
  await payment('40')
  await textCheck('$110.00', 'Partial installment payment recalculates principal')
  await textCheck('27% of principal paid', 'Progress derives paid principal')
  await payment('70', '2026-10-06'); await textCheck('$40.00', 'Multiple installment payments reduce remaining')
  await click('Record payment'); await check(`[...document.querySelectorAll('dialog input')].some(e => e.value === '40.00')`, 'Final default caps scheduled payment at remaining principal')
  await field('Paid date', '2026-10-07'); await save(); await textCheck('Completed', 'Final installment payment completes')
  await check(`!document.querySelector('.obligation-details-status').textContent.includes('Due')`, 'Completed installment does not show a due date')
  await payment('10', '2026-10-08'); await textCheck('Overpayment', 'Deliberate overpayment is visible')
  await textCheck('$10.00', 'Overpayment retains exact cents')
  await click('Set inactive'); await textCheck('Inactive', 'Installment can be archived with history')
  await click('Set active')
  await click('Delete'); await wait(`document.querySelectorAll('.obligation-payment-row').length === 3`)
  await check(`!document.querySelector('.obligation-facts').textContent.includes('Overpayment')`, 'Deleting overpayment recalculates principal')
  await click('Delete'); await wait(`document.querySelectorAll('.obligation-payment-row').length === 2`)
  await textCheck('$40.00', 'Deleting completion payment restores remaining principal')
  await check(`document.querySelector('.obligation-status').textContent === 'Paid'`, 'Deleting completion restores Paid monthly status with principal remaining')
  await route('more/bills-installments')
  const disposable = await add('bill', 'Disposable', '25')
  await route(`more/bills-installments/${disposable}`); await click('Delete obligation')
  await wait(`location.hash === '#more/bills-installments'`)
  await check(`!document.querySelector('[data-obligation-id=${JSON.stringify(disposable)}]')`, 'Unpaid obligation deletes after confirmation')
  const futureId = await add('bill', 'Future bill', '25', '31', '2027-01')
  await route(`more/bills-installments/${futureId}`); await click('Record payment')
  await check(`document.querySelector('dialog input[type="month"]').value === '2027-01'`, 'Future obligation payment defaults to its start month')
  await key('Escape'); await route('more/bills-installments')
  await add('bill', 'Today bill', '30', '5')
  await add('bill', 'Upcoming bill', '35', '15')
  await add('bill', 'February bill', '50', '31', '2026-01')
  await textCheck('Due today', 'Due-today label comes from domain')
  await textCheck('Upcoming', 'Ordinary upcoming label stays calm')
  await textCheck('Starts January 2027', 'Future-start row displays its start month')
  const protectedId = await add('bill', 'Protected deletion', '10')
  await route(`more/bills-installments/${protectedId}`)
  await evaluate(`import('/src/persistence/repositories.ts').then(m => m.obligationPaymentsRepository.add({id:'concurrent-payment',obligationId:${JSON.stringify(protectedId)},amountCents:100,dueMonth:'2026-10',paidDate:'2026-10-05'}))`)
  await click('Delete obligation')
  await textCheck('Cannot delete an obligation with payment history', 'Concurrent history addition shows authoritative deletion error')
  await check(`import('/src/persistence/repositories.ts').then(async m => !!(await m.obligationsRepository.get(${JSON.stringify(protectedId)})) && (await m.obligationPaymentsRepository.getByObligation(${JSON.stringify(protectedId)})).length === 1)`, 'Rejected deletion retains obligation and payment')
  await evaluate(`import('/src/features/shared/dataRefresh.ts').then(m => m.notifyDataChanged())`)
  await wait(`document.querySelectorAll('.obligation-payment-row').length === 1`)
  await check(`![...document.querySelectorAll('button')].some(b => b.textContent === 'Delete obligation')`, 'Shared event refreshes details after external payment write')
  await route('more/bills-installments')
  const summaryBeforeFilter = await evaluate(`document.querySelector('.obligation-summary').textContent`)
  await click('Installments'); await check(`document.querySelectorAll('.obligation-row').length === 1`, 'Installment filter only changes presentation')
  assert.equal(await evaluate(`document.querySelector('.obligation-summary').textContent`), summaryBeforeFilter)
  await click('All')
  await evaluate(`(() => { const e = document.getElementById('obligation-month'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2026-02'); e.dispatchEvent(new Event('input',{bubbles:true})) })()`)
  await delay(70); await textCheck('Due February 28, 2026', 'Due day 31 uses February month-end fallback')
  await evaluate(`(() => { const e = document.getElementById('obligation-month'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,'2025-12'); e.dispatchEvent(new Event('input',{bubbles:true})) })()`)
  await delay(70); await textCheck('No obligations due in December 2025.', 'Earlier month has compact no-due state')
  await route(`more/bills-installments/${installmentId}`)
  await reloadPage()
  await textCheck('Installment Details', 'Direct details route survives reload')
  await check(`document.getElementById('obligation-month').value === '2026-10'`, 'Reload resets month to local current month')
  await click('Edit'); await field('Name', 'Unsaved laptop')
  acceptDialogs = false; await key('Escape'); await check(`!!document.querySelector('dialog[open]')`, 'Escape can retain dirty editor')
  await evaluate(`location.hash = 'more'`); await delay(70)
  await check(`location.hash.includes(${JSON.stringify(installmentId)}) && !!document.querySelector('dialog[open]')`, 'Rejected browser navigation retains dirty editor and URL')
  acceptDialogs = true; await key('Escape'); await check(`document.activeElement.textContent === 'Edit'`, 'Details editor restores Edit focus')
  assert.deepEqual(await snapshot(), financialBefore, 'UI writes never alter financial tables')
  results.push('All UI writes preserve accounts, categories, transactions')
  // Home tests use the actual mounted preview and keep all older records/history
  // intact (inactive) for the existing Details/theme regression checks below.
  await evaluate(`import('/src/persistence/repositories.ts').then(async m => { for (const item of await m.obligationsRepository.getAll()) await m.obligationsRepository.update({...item,isActive:false}) })`)
  await home()
  await check(`document.querySelector('.dashboard-payments').textContent.includes('No payments due this month.')`, 'Home has compact zero state with View all')
  const financialDOM = await evaluate(`({summary:document.querySelector('.dashboard-summary').textContent,categories:document.querySelector('.dashboard-category-list').textContent})`)
  await check(`document.querySelector('.dashboard-net-amount').textContent === '+$2,475.00' && [...document.querySelectorAll('.dashboard-supporting dd')].map(e=>e.textContent).join('|') === '+$2,500.00|$25.00'`, 'Seeded Home financial totals are income $2500, expense $25, net $2475')
  const homeTimeOrigin = await evaluate('performance.timeOrigin')
  await trackingUpdate(`
    const base = {type:'bill',startMonth:'2026-10',isActive:true,expectedAmountCents:10000};
    for (const record of [
      {...base,id:'home-overdue',name:'Home overdue',dueDay:1},
      {...base,id:'home-partial',name:'Home partial',dueDay:20},
      {...base,id:'home-today',name:'Home today',dueDay:5,expectedAmountCents:5000},
      {...base,id:'home-soon',name:'Home soon',dueDay:8,expectedAmountCents:3000},
      {...base,id:'home-upcoming',name:'Home upcoming',dueDay:15,expectedAmountCents:6500},
      {...base,id:'home-paid',name:'Home paid',dueDay:15,expectedAmountCents:2000},
      {...base,id:'home-inactive',name:'Home inactive',dueDay:1,isActive:false},
      {...base,id:'home-future',name:'Home future',dueDay:31,startMonth:'2026-11',expectedAmountCents:9900},
      {id:'home-installment',type:'installment',name:'Home installment',dueDay:18,startMonth:'2026-09',isActive:true,originalAmountCents:100000,scheduledPaymentCents:15500},
      {id:'home-completed',type:'installment',name:'Home completed',dueDay:10,startMonth:'2026-10',isActive:true,originalAmountCents:10000,scheduledPaymentCents:2500}
    ]) await obligations.add(record);
    for (const record of [
      {id:'home-part-pay',obligationId:'home-partial',amountCents:4000,dueMonth:'2026-10',paidDate:'2026-10-04'},
      {id:'home-paid-pay',obligationId:'home-paid',amountCents:2000,dueMonth:'2026-10',paidDate:'2026-10-04'},
      {id:'home-principal-pay',obligationId:'home-installment',amountCents:38000,dueMonth:'2026-09',paidDate:'2026-09-20'},
      {id:'home-completed-pay',obligationId:'home-completed',amountCents:10000,dueMonth:'2026-10',paidDate:'2026-10-04'}
    ]) await payments.add(record)
  `)
  await homeNames(['Home overdue','Home partial','Home today'], 'Home prioritizes overdue, partially paid, due today and limits to three')
  await check(`document.querySelector('[data-obligation-id="home-partial"] .dashboard-payment-amount').textContent === '$60.00 left this month'`, 'Home partial amount is remaining for selected due month')
  await check(`document.querySelector('[data-obligation-id="home-overdue"] .dashboard-payment-status').textContent === 'Overdue'`, 'Home overdue is communicated in text')
  await check(`document.querySelector('.dashboard-payments-caption').textContent === '$460.00 remaining this month'`, 'Home planning summary uses domain remaining total')
  await check(`!document.querySelector('.dashboard-payments').textContent.includes('Full Backup')`, 'Home contains no backup warning')
  await trackingUpdate(`for(const id of ['home-overdue','home-partial']) await obligations.update({...await obligations.get(id),isActive:false})`)
  await homeNames(['Home today','Home soon','Home upcoming'], 'Home puts due today and due soon before upcoming')
  await check(`document.querySelector('[data-obligation-id="home-soon"] .dashboard-payment-status').textContent === 'Due in 3 days'`, 'Home reuses readable due-soon presentation')
  await trackingUpdate(`await obligations.update({...await obligations.get('home-today'),isActive:false})`)
  await homeNames(['Home soon','Home upcoming','Home installment'], 'Upcoming installment occupies a relevant preview slot')
  await check(`document.querySelector('[data-obligation-id="home-installment"]').textContent.includes('$155.00') && document.querySelector('[data-obligation-id="home-installment"]').textContent.includes('$620.00 remaining principal')`, 'Home installment shows monthly target and remaining principal')
  await trackingUpdate(`await obligations.update({...await obligations.get('home-soon'),isActive:false})`)
  await homeNames(['Home upcoming','Home installment','Home paid'], 'Upcoming precedes fully paid obligations')
  await check(`document.querySelector('[data-obligation-id="home-paid"] .dashboard-payment-status').textContent === 'Paid'`, 'Fully paid bill appears with Paid status')
  await trackingUpdate(`for(const id of ['home-upcoming','home-installment']) await obligations.update({...await obligations.get(id),isActive:false})`)
  await homeNames(['Home paid'], 'Completed does not fill slots while a more relevant item exists')
  await trackingUpdate(`await obligations.update({...await obligations.get('home-paid'),isActive:false})`)
  await homeNames(['Home completed'], 'Completed installment is a fallback when no relevant item remains')
  await check(`document.querySelector('.dashboard-payment-status').textContent === 'Completed' && !document.querySelector('.dashboard-payment-detail').textContent.includes('Due')`, 'Completed fallback has no upcoming or overdue date label')
  await trackingUpdate(`await obligations.update({...await obligations.get('home-completed'),isActive:false})`)
  await check(`document.querySelector('.dashboard-payments').textContent.includes('No payments due this month.')`, 'Inactive and future-start obligations stay out of October')
  await homeMonth('Next')
  await homeNames(['Home future'], 'Changing Home month includes newly started obligations')
  const novemberFinancialDOM = await evaluate(`({summary:document.querySelector('.dashboard-summary').textContent,categories:document.querySelector('.dashboard-category-list')?.textContent ?? null})`)
  await check(`document.querySelector('.dashboard-payment-detail').textContent.includes('Due November 30, 2026')`, 'Home due day 31 uses domain month-end fallback')
  await click('View all bills and installments for November 2026 →', 'a')
  await wait(`!!document.querySelector('.obligations-section') && !document.querySelector('.obligations-section [role="status"]')`)
  await check(`document.getElementById('obligation-month').value === '2026-11' && document.querySelector('nav a[href="#more"]').getAttribute('aria-current') === 'page'`, 'Home View all opens More list in Home month')
  await home(); await homeMonth('Next')
  await evaluate(`document.querySelector('.dashboard-payment-row').focus()`); await key('Enter')
  await wait(`!!document.querySelector('.obligation-facts')`)
  await check(`location.hash.startsWith('#more/bills-installments/home-future?month=2026-11') && document.getElementById('obligation-month').value === '2026-11'`, 'Keyboard Home row opens existing Details with selected month')
  await payment()
  await home(); await homeMonth('Next')
  await check(`document.querySelector('.dashboard-payment-status').textContent === 'Paid'`, 'Home reflects payment recorded through Details')
  assert.deepEqual(await evaluate(`({summary:document.querySelector('.dashboard-summary').textContent,categories:document.querySelector('.dashboard-category-list')?.textContent ?? null})`), novemberFinancialDOM, 'Financial totals remain identical while recorded November payment exists')
  assert.deepEqual(await snapshot(), financialBefore, 'Recording payment creates no financial transaction')
  results.push('Recorded November payment leaves November income/expense/net/category totals and financial records unchanged')
  await evaluate(`document.querySelector('.dashboard-payment-row').click()`); await delay(70)
  await click('Delete'); await wait(`document.querySelectorAll('.obligation-payment-row').length === 0`)
  await home(); await homeMonth('Next')
  await check(`document.querySelector('.dashboard-payment-status').textContent === 'Upcoming'`, 'Home recalculates after payment deletion')
  await evaluate(`document.querySelector('.dashboard-payment-row').click()`); await delay(70)
  await click('Edit'); await field('Name','Home future edited'); await save()
  await home(); await homeMonth('Next')
  await homeNames(['Home future edited'], 'Home reflects obligation edits without reload')
  await trackingUpdate(`await payments.add({id:'home-live-payment',obligationId:'home-future',dueMonth:'2026-11',paidDate:'2026-11-05',amountCents:4000})`)
  await check(`document.querySelector('.dashboard-payment-amount').textContent === '$59.00 left this month' && document.querySelector('.dashboard-payment-status').textContent === 'Partially paid'`, 'Mounted Home refreshes after shared payment event')
  await trackingUpdate(`await payments.delete('home-live-payment')`)
  await check(`document.querySelector('.dashboard-payment-status').textContent === 'Upcoming'`, 'Mounted Home refreshes after shared deletion event')
  await trackingUpdate(`await obligations.update({...await obligations.get('home-future'),isActive:false})`)
  await check(`document.querySelector('.dashboard-payments').textContent.includes('No payments due this month.')`, 'Mounted Home refreshes after archive event')
  await homeMonth('Previous')
  assert.deepEqual(await evaluate(`({summary:document.querySelector('.dashboard-summary').textContent,categories:document.querySelector('.dashboard-category-list').textContent})`), financialDOM, 'Home income/expense/net/category DOM stays identical after tracking operations')
  assert.deepEqual(await snapshot(), financialBefore, 'Home integration never changes financial records')
  assert.equal(await evaluate('performance.timeOrigin'), homeTimeOrigin, 'Home month/navigation/writes require no page reload')
  results.push('Home financial summary, spending categories and underlying tables remain unchanged')
  await trackingUpdate(`for(const id of ['home-overdue','home-partial','home-installment']) await obligations.update({...await obligations.get(id),isActive:true})`)
  for (const theme of ['sage', 'ocean', 'dark']) for (const [width, height, font] of [[320, 760, 16], [390, 844, 16], [1280, 900, 16], [320, 844, 32], [390, 844, 32], [1280, 900, 32]]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
    await evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(theme)}; document.documentElement.style.fontSize = '${font}px'`)
    await home()
    await check(`document.documentElement.scrollWidth <= document.documentElement.clientWidth && document.querySelectorAll('.dashboard-payment-row').length === 3`, `${theme} ${width}px ${font === 32 ? '200%' : '100%'} Home preview has no overflow and at most three rows`)
    await evaluate(`window.scrollTo(0,document.documentElement.scrollHeight)`)
    await check(`(() => { const nav = document.querySelector('.app-navigation'), last = document.querySelector('.dashboard-payments'); return getComputedStyle(nav).position !== 'fixed' || last.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top })()`, 'Home final preview clears bottom navigation')
    await evaluate(`document.querySelector('.dashboard-payment-row').focus()`)
    await check(`document.activeElement.matches('.dashboard-payment-row') && getComputedStyle(document.activeElement).outlineStyle !== 'none' && document.querySelector('.dashboard-payment-status').textContent.trim().length > 0`, 'Home rows have keyboard focus and textual status')
    if ((width === 390 && font === 16) || (theme === 'sage' && width === 1280 && font === 16) || (theme === 'dark' && width === 320 && font === 32)) {
      const screenshot = await send('Page.captureScreenshot', { format:'png' })
      await writeFile(join(artifacts, `${theme}-${width}-${font}-home.png`), Buffer.from(screenshot.data,'base64'))
    }
    await route('more/bills-installments')
    await check(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`, `${theme} ${width}px ${font === 32 ? '200%' : '100%'} list has no horizontal overflow`)
    await evaluate(`window.scrollTo(0,document.documentElement.scrollHeight)`)
    await check(`(() => { const nav = document.querySelector('.app-navigation'); const last = document.querySelector('.obligation-list:last-child'); return !nav || getComputedStyle(nav).position !== 'fixed' || !last || last.getBoundingClientRect().bottom <= nav.getBoundingClientRect().top })()`, `${theme} ${width}px final rows clear bottom navigation`)
    await route(`more/bills-installments/${installmentId}`)
    await check(`document.documentElement.scrollWidth <= document.documentElement.clientWidth`, `${theme} ${width}px ${font === 32 ? '200%' : '100%'} details have no horizontal overflow`)
    await click('Edit')
    await check(`(() => { const body = document.querySelector('.obligation-editor-body'), header = document.querySelector('.obligation-editor-header'); return body.clientHeight > 150 && header.getBoundingClientRect().bottom < innerHeight && document.querySelector('dialog').scrollWidth <= document.querySelector('dialog').clientWidth })()`, `${theme} ${width}px ${font === 32 ? '200%' : '100%'} editor scrolls with visible actions`)
    await check(`(() => { const buttons = [...document.querySelectorAll('.obligation-editor-header button')]; const a = buttons[0].getBoundingClientRect(), b = buttons[1].getBoundingClientRect(); return buttons.every(e => e.scrollWidth <= e.clientWidth) && (a.right <= b.left || a.bottom <= b.top) })()`, 'Editor action labels fit without overlap')
    await evaluate(`document.querySelector('textarea').focus()`)
    await check(`document.activeElement.getBoundingClientRect().bottom <= document.querySelector('dialog').getBoundingClientRect().bottom`, 'Final editor field remains reachable')
    if ((theme === 'sage' && width === 390 && font === 16) || (theme === 'dark' && width === 320 && font === 32)) {
      const screenshot = await send('Page.captureScreenshot', { format: 'png' })
      await writeFile(join(artifacts, `${theme}-${width}-${font}-editor.png`), Buffer.from(screenshot.data, 'base64'))
    }
    await click('Cancel')
    if (width === 390 && font === 16) {
      await route('more/bills-installments')
      const screenshot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      await writeFile(join(artifacts, `${theme}-list.png`), Buffer.from(screenshot.data, 'base64'))
    }
  }
  assert.ok(confirmations >= 10, 'Native destructive/discard confirmations exercised')
  assert.deepEqual(failures, [], 'No uncaught browser errors')
  console.log(`\n${results.length} UI browser checks passed; ${confirmations} native confirmations. Screenshots: ${artifacts}`)
} finally {
  if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify({ id: ++sequence, method: 'Browser.close' })); await delay(400); socket.close() }
  if (browser.exitCode === null) browser.kill()
  const target = resolve(profile)
  assert.equal(dirname(target), resolve(tmpdir()))
  assert.ok(basename(target).startsWith('my-finance-bills-ui-'))
  await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}
