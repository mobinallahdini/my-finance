// Reports UI, engine parity, read-only storage and responsive accessibility.
// Node 24 + Chrome; fixtures live only in a disposable browser profile.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { createServer, normalizePath, preview } from 'vite'
import { prepareFinancialReport } from '../src/domain/reporting.ts'
import { createReportFilters } from '../src/domain/transactionQuery.ts'
import { formatMoney } from '../src/features/accounts/money.ts'
import { signedTransactionAmount } from '../src/features/transactions/transactionPresentation.ts'

const profile = await mkdtemp(join(tmpdir(), 'my-finance-reports-profile-'))
const artifacts = await mkdtemp(join(tmpdir(), 'my-finance-reports-review-'))
const chrome = process.env.CHROME_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome')
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let socket, sequence = 0, launchError, development, production, currency = 'CAD'
const pending = new Map(), results = [], exceptions = []
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
async function settled() {
  await wait(`!!document.querySelector('.report-content[aria-busy="false"]')`)
  await evaluate(`new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))`)
}
async function check(expression, name) {
  assert.ok(await evaluate(`Boolean(${expression})`), name); results.push(name); console.log(`PASS ${name}`)
}
async function click(selector) {
  await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error('Missing '+${JSON.stringify(selector)}); element.click() })()`)
  await evaluate(`new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))`)
}
async function field(selector, value) {
  await evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (!element) throw new Error('Missing field '+${JSON.stringify(selector)})
    const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)})
    element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }))
  })()`)
  await evaluate(`new Promise(done => requestAnimationFrame(() => requestAnimationFrame(() => done(true))))`)
}
async function key(value, modifiers = 0) {
  const keyCode = { Tab: 9, Enter: 13, Escape: 27, ' ': 32 }[value]
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: value, code: value === ' ' ? 'Space' : value, windowsVirtualKeyCode: keyCode, modifiers,
    ...(value === 'Enter' ? { text: '\r' } : {}) })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: value, code: value === ' ' ? 'Space' : value, windowsVirtualKeyCode: keyCode, modifiers })
}
const base = {
  accounts: [{ id: 'bank', name: 'Main Bank', type: 'bank', openingBalance: 100000 },
    { id: 'card', name: 'Visa', type: 'credit_card', openingBalance: 0, creditLimit: 50000 },
    { id: 'cash', name: 'Pocket Cash', type: 'cash', openingBalance: 20000 }],
  categories: [{ id: 'food', name: 'Groceries', type: 'expense' }, { id: 'rent', name: 'Rent', type: 'expense' },
    { id: 'salary', name: 'Salary', type: 'income' }],
  transactions: [
    { id: 'tax-expense', type: 'expense', accountId: 'bank', categoryId: 'food', amount: 11500, taxAmountCents: 1500,
      receiptNumber: 'RC-0042 / 雪', date: '2026-10-01', note: 'Weekly shopping\nA long receipt note with all details available for review.' },
    { id: 'card-refund', type: 'refund', accountId: 'card', categoryId: 'food', amount: 2500, date: '2026-10-05', note: 'Returned item' },
    { id: 'income', type: 'income', accountId: 'bank', categoryId: 'salary', amount: 200000, date: '2026-10-04' },
    { id: 'bank-card', type: 'transfer', fromAccountId: 'bank', toAccountId: 'card', amount: 5000, date: '2026-10-03' },
    { id: 'card-bank', type: 'transfer', fromAccountId: 'card', toAccountId: 'bank', amount: 750, date: '2026-10-02' },
    { id: 'september', type: 'expense', accountId: 'cash', categoryId: 'food', amount: 4000, date: '2026-09-30' },
    { id: 'last-year', type: 'expense', accountId: 'bank', categoryId: 'food', amount: 1000, date: '2025-12-31' },
    ...Array.from({ length: 60 }, (_, i) => ({ id: `history-${String(i).padStart(3, '0')}`, type: 'expense',
      accountId: ['bank', 'cash', 'card'][i % 3], categoryId: 'rent', amount: 100 + i, date: '2026-10-05', note: `History ${i}` })),
  ], obligations: [], obligationPayments: [],
  applicationSettings: { id: 'application', countryCode: 'CA', currencyCode: 'CAD', profileType: 'personal', fiscalYearStartMonth: 1, onboardingCompleted: true },
}
let data = structuredClone(base)
let filters = createReportFilters({ dateMode: 'month', month: '2026-10' }), grouping = 'none', groupKey = null
function expected() { return prepareFinancialReport({ ...data, filters, grouping }) }
async function snapshot() {
  return evaluate(`new Promise((resolveSnapshot, reject) => {
    const request = indexedDB.open('my-finance'); request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result, names = Array.from(database.objectStoreNames).sort(), data = {};
      const transaction = database.transaction(names, 'readonly');
      const schema = names.map(name => { const store = transaction.objectStore(name), read = store.getAll();
        read.onsuccess = () => { data[name] = read.result };
        return { name, primary: store.keyPath, indexes: Array.from(store.indexNames).map(id => {
          const index = store.index(id); return { name: index.name, key: index.keyPath, unique: index.unique }
        }) };
      });
      transaction.oncomplete = () => { const version = database.version; database.close(); resolveSnapshot({ version, data, schema }) };
      transaction.onabort = () => { database.close(); reject(transaction.error) };
    };
  })`)
}
async function seed(value) {
  data = structuredClone(value); currency = data.applicationSettings.currencyCode
  await evaluate(`(async () => { const backup = await import('/src/persistence/dataBackup.ts');
    await backup.replaceWorkspaceSnapshot(${JSON.stringify(data)});
    (await import('/src/features/shared/dataRefresh.ts')).notifyDataChanged(); window.__reportWrites = [] })()`)
  await settled()
  await wait(`document.querySelector('.report-currency').textContent === ${JSON.stringify(currency)}`)
}
async function compare(name, page = 0) {
  await settled()
  const report = expected()
  const actual = await evaluate(`Object.fromEntries([...document.querySelectorAll('[data-metric]')].map(element => [element.dataset.metric, element.textContent]))`)
  for (const [metric, value] of Object.entries(report.summary)) {
    if (!Object.hasOwn(actual, metric)) continue
    assert.equal(actual[metric], metric === 'transactionCount' ? String(value) : formatMoney(value, currency), `${name}: ${metric}`)
  }
  assert.equal(Object.keys(actual).length, 7, 'All required report metrics are present')
  const group = grouping === 'none' ? undefined : report.groups.find(item => item.key === groupKey) ?? report.groups[0]
  const sourceRows = group ? group.transactionIds.map(id => report.rows.find(row => row.id === id)) : report.rows
  const visibleRows = sourceRows.slice(page * 25, page * 25 + 25)
  const ids = await evaluate(`[...document.querySelectorAll('[data-report-row]')].filter(element => element.getClientRects().length).map(element => element.dataset.reportRow)`)
  assert.deepEqual(ids, visibleRows.map(row => row.id), `${name}: exact engine row IDs and ordering`)
  const amounts = await evaluate(`[...document.querySelectorAll('[data-report-row]')].filter(element => element.getClientRects().length).map(element => element.querySelector('[data-column="amountCents"]').textContent)`)
  assert.deepEqual(amounts, visibleRows.map(row => signedTransactionAmount({ type: row.type, amount: row.amountCents }, currency)), `${name}: exact formatted row amounts`)
  if (group) {
    const values = await evaluate(`Object.fromEntries([...document.querySelectorAll('[data-group-metric]')].map(element => [element.dataset.groupMetric, element.textContent]))`)
    for (const [metric, text] of Object.entries(values)) {
      assert.equal(text, formatMoney(Object.hasOwn(group, metric) ? group[metric] : group.summary[metric], currency), `${name}: group ${metric}`)
    }
  }
  await check(`document.querySelector('.report-count').textContent === ${JSON.stringify(`${report.matchedTransactionCount} of ${report.sourceTransactionCount} transactions match your filters.`)}`, name)
}
async function choosePreset(value) {
  await field('#report-period', value)
  filters = createReportFilters({ ...filters, month: '2026-10', fromDate: '', toDate: '',
    ...(value === 'month' ? { dateMode: 'month' } : value === 'year' ? { dateMode: 'range', fromDate: '2026-01-01', toDate: '2026-12-31' } : { dateMode: 'all' }) })
  groupKey = null
}
async function apply(criteria) {
  await click('.report-toolbar-actions button')
  await wait(`!!document.querySelector('dialog[open]')`)
  await click('.transaction-filter-clear-draft')
  if (criteria.dateMode) {
    await field('dialog select[name="dateMode"]', criteria.dateMode)
    for (const name of ['month', 'fromDate', 'toDate']) if (Object.hasOwn(criteria, name)) await field(`dialog input[name="${name}"]`, criteria[name])
  }
  if (criteria.query) await field('dialog input[type="search"]', criteria.query)
  for (const [group, values] of Object.entries(criteria).filter(([group]) => ['types', 'accountIds', 'accountTypes', 'categoryIds'].includes(group))) {
    await evaluate(`(() => {
      for (const disclosure of document.querySelectorAll('dialog details')) disclosure.open = true
      for (const input of document.querySelectorAll('dialog input[name="${group}"]')) {
        const wanted = ${JSON.stringify(values)}.includes(input.value)
        if (input.checked !== wanted) input.click()
      }
    })()`)
  }
  for (const name of ['minimum', 'maximum']) if (criteria[name] !== undefined) await field(`dialog input[name="${name}"]`, String(criteria[name] / 100))
  await click('dialog button[type="submit"]')
  await wait(`!document.querySelector('dialog[open]')`)
  filters = createReportFilters(criteria); groupKey = null
}

try {
  development = await createServer({ server: { host: '127.0.0.1', port: 0 }, plugins: [{
    name: 'reports-test-preparation-counter', enforce: 'pre',
    transform(source, id) {
      if (id.split('?')[0] === normalizePath(resolve('src/domain/reporting.ts'))) {
        return source.replace('export function prepareFinancialReport(query: ReportQuery): PreparedReport {',
          'export function prepareFinancialReport(query: ReportQuery): PreparedReport { if (typeof window !== "undefined") window.__reportPreparations = (window.__reportPreparations ?? 0) + 1;')
      }
      // Delay before opening the real snapshot transaction, preserving its actual
      // read semantics instead of artificially keeping an IndexedDB transaction idle.
      if (id.split('?')[0] === normalizePath(resolve('src/persistence/dataBackup.ts'))) {
        return source.replace('export async function readFinancialSnapshot(): Promise<FinancialSnapshot> {',
          'export async function readFinancialSnapshot(): Promise<FinancialSnapshot> { if (typeof window !== "undefined" && window.__reportReadGate) await window.__reportReadGate;')
      }
    },
  }] })
  await development.listen()
  let port
  for (let i = 0; i < 200; i++) {
    if (launchError) throw launchError
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break }
    catch { await delay(50) }
  }
  assert.ok(port, 'Chrome debugging port')
  const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolveOpen, reject) => { socket.onopen = resolveOpen; socket.onerror = reject })
  socket.onmessage = ({ data: message }) => {
    const response = JSON.parse(message), promise = pending.get(response.id)
    if (promise) { pending.delete(response.id); if (response.error) promise.reject(new Error(JSON.stringify(response.error))); else promise.resolve(response.result) }
    if (response.method === 'Runtime.exceptionThrown') exceptions.push(response.params.exceptionDetails.exception?.description ?? response.params.exceptionDetails.text)
  }
  await send('Page.enable'); await send('Runtime.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Emulation.setTimezoneOverride', { timezoneId: 'America/Toronto' })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    const OriginalDate = Date;
    window.Date = class extends OriginalDate { constructor(...args) { super(...(args.length ? args : ['2026-10-05T16:00:00Z'])) }
      static now() { return new OriginalDate('2026-10-05T16:00:00Z').getTime() } };
    window.__reportWrites = [];
    for (const method of ['add','put','delete','clear']) {
      const original = IDBObjectStore.prototype[method];
      IDBObjectStore.prototype[method] = function (...args) { window.__reportWrites.push(this.name + ':' + method); return original.apply(this, args) };
    }
  ` })
  const url = `http://127.0.0.1:${development.httpServer.address().port}/`
  await send('Page.navigate', { url: url + 'src/domain/README.md' })
  await wait(`location.origin === ${JSON.stringify(new URL(url).origin)} && document.readyState === 'complete'`)
  // Fixture setup happens before the application mounts; all subsequent Reports actions are monitored.
  await evaluate(`import('/src/persistence/dataBackup.ts').then(module => module.replaceWorkspaceSnapshot(${JSON.stringify(data)}))`)
  await send('Page.navigate', { url: url + '#more' })
  await wait(`!!document.querySelector('.more-section')`)
  const baseline = await snapshot()
  await evaluate('window.__reportWrites = []')
  await click('.more-category-link[href="#more/reports"]')
  await compare('More → Financial Reports loads stored data through the engine')
  await check(`location.hash === '#more/reports' && document.title === 'Financial Reports | My Finance' &&
    document.querySelectorAll('.app-navigation-link').length === 4 && document.querySelector('.app-navigation-link[aria-current="page"]').getAttribute('href') === '#more'`, 'Reports keeps four primary destinations with More active')
  await check(`JSON.stringify([...document.querySelectorAll('.report-table th')].map(element => element.dataset.column)) === JSON.stringify(['date','type','category','account','amountCents'])`, 'Default columns include Date, Type, Category, Account and Amount')
  const prepares = await evaluate('window.__reportPreparations')
  await click('.report-pagination button:last-child')
  await compare('Pagination uses the same report and preserves all global totals', 1)
  await check(`window.__reportPreparations === ${prepares} && document.activeElement.id === 'report-results-heading' &&
    document.querySelectorAll('.report-table tbody tr').length <= 25`, 'Page changes do not prepare another report and move focus to results')
  await click('.report-pagination button:last-child'); await compare('Final page stays bounded and keeps the same complete summary', 2)
  await check(`document.querySelector('.report-pagination button:last-child').disabled && window.__reportPreparations === ${prepares}`, 'Final-page navigation neither overflows nor recomputes the report')
  await click('.report-pagination button:first-child'); await click('.report-pagination button:first-child')
  await choosePreset('year'); await compare('Current year uses inclusive local-calendar dates')
  await choosePreset('all'); await compare('All Time removes only date restrictions')
  await field('#report-period', 'custom')
  await field('#report-from', '10000-01-01'); await click('.report-dates button')
  await check(`document.activeElement.id === 'report-from' && document.activeElement.getAttribute('aria-invalid') === 'true' &&
    document.activeElement.getAttribute('aria-describedby').includes('report-date-error')`, 'An invalid Start Date is focused and associated with its accessible error')
  await field('#report-from', '2026-10-05'); await field('#report-to', '2026-10-01')
  await click('.report-dates button')
  await check(`!!document.querySelector('#report-date-error[role="alert"]') && document.activeElement.id === 'report-to'`, 'Invalid custom range is accessible and focuses its correction')
  await compare('Invalid date draft does not change the active report')
  await field('#report-from', '2026-10-01'); await field('#report-to', '2026-10-01'); await click('.report-dates button')
  filters = createReportFilters({ dateMode: 'range', fromDate: '2026-10-01', toDate: '2026-10-01' })
  await compare('Custom dates include both boundaries')
  await click('.report-toolbar-actions button'); await field('dialog input[type="search"]', 'draft that must be discarded')
  await key('Escape'); await wait(`!document.querySelector('dialog[open]')`)
  await compare('Cancel/Escape preserves active filters')
  await check(`document.activeElement === document.querySelector('.report-toolbar-actions button')`, 'Filter dialog restores focus to its opening button')

  for (const [name, criteria] of [
    ['Refund-only negative Net Expenses and positive Net Cash Flow', { types: ['refund'] }],
    ['Income-only report keeps Refunds separate', { types: ['income'] }],
    ['Empty type selection gives zero matches', { types: [] }],
    ['Expense type includes credit-card purchases', { types: ['expense'], accountTypes: ['credit_card'] }],
    ['Account filter', { accountIds: ['cash'] }], ['Account-type filter', { accountTypes: ['credit_card'] }],
    ['Cash account-type filter', { accountTypes: ['cash'] }],
    ['Same-endpoint restriction excludes Bank + Credit Card in both directions', { types: ['transfer'], accountIds: ['bank'], accountTypes: ['credit_card'] }],
    ['Same-endpoint matching includes both Transfer directions', { types: ['transfer'], accountIds: ['card'], accountTypes: ['credit_card'] }],
    ['Category filter excludes Transfers', { categoryIds: ['food'] }],
    ['Inclusive positive amount bounds', { minimum: 2500, maximum: 5000 }],
    ['Search finds receipt numbers with Unicode', { query: 'rc-0042 / 雪' }],
    ['Search finds notes', { query: 'returned item' }],
    ['Search finds accounts and Transfer endpoints', { query: 'visa' }],
    ['Combined AND/OR filters', { types: ['expense', 'refund'], accountIds: ['bank', 'card'], accountTypes: ['bank', 'credit_card'], categoryIds: ['food'], minimum: 2000, maximum: 12000 }],
  ]) { await apply(criteria); await compare(name) }
  await click('.report-toolbar-actions button'); await click('.transaction-filter-clear-draft')
  await click('dialog button:first-child'); await wait(`!document.querySelector('dialog[open]')`)
  await compare('Clearing a filter draft then Cancel keeps active criteria')
  await click('.report-active-filters > button'); filters = createReportFilters()
  await compare('Clear All removes dates, search and every selection')
  await apply({ types: ['refund'] })
  await evaluate(`location.hash = 'more'`); await wait(`!!document.querySelector('.more-section')`)
  await evaluate('history.back()'); await wait(`!!document.querySelector('.reports-section')`); await compare('Browser Back restores Reports and its session filters')
  await evaluate('history.forward()'); await wait(`!!document.querySelector('.more-section')`)
  await click('.more-category-link[href="#more/reports"]'); await compare('Navigation back into Reports preserves its active filters')

  await click('.report-columns summary')
  await evaluate(`document.querySelector('input[name="reportColumns"][value="note"]').focus()`)
  await key(' ')
  await check(`document.querySelector('input[name="reportColumns"][value="note"]').checked && document.querySelector('.report-table th[data-column="note"]')`, 'Keyboard Space toggles a labelled column checkbox')
  await evaluate(`location.hash = 'more'`); await wait(`!!document.querySelector('.more-section')`)
  await evaluate('history.back()'); await settled()
  await check(`document.querySelector('.report-table th[data-column="note"]')`, 'Visible columns survive same-session navigation')
  await click('.report-columns summary'); await click('.report-columns button')
  const beforeColumns = await evaluate('window.__reportPreparations')
  for (const column of ['fromAccount', 'toAccount', 'accountType', 'note', 'taxAmountCents', 'expenseSubtotalCents', 'receiptNumber']) await click(`input[name="reportColumns"][value="${column}"]`)
  await check(`document.querySelectorAll('.report-table th').length === 12 && window.__reportPreparations === ${beforeColumns}`, 'Column customization exposes all normalized fields without recalculating')
  await apply({ query: 'RC-0042' }); await compare('Optional tax and subtotal use the original included Expense amount')
  await check(`document.querySelector('.report-table td[data-column="taxAmountCents"]').textContent === ${JSON.stringify(formatMoney(1500, currency))} &&
    document.querySelector('.report-table td[data-column="receiptNumber"]').textContent === 'RC-0042 / 雪'`, 'Tax and receipt columns display actual normalized metadata')
  await apply({ types: ['refund'] })
  await check(`document.querySelector('.report-table td[data-column="taxAmountCents"]').textContent === '—'`, 'Missing/inapplicable tax remains a dash, not recorded zero')
  await apply({ types: ['transfer'] }); await compare('Transfer-only global volume counts each Transfer once')
  await check(`document.querySelector('.report-table td[data-column="fromAccount"]').textContent === 'Main Bank' &&
    document.querySelector('.report-table td[data-column="toAccount"]').textContent === 'Visa'`, 'Transfer columns show real internal endpoints')
  await apply({})
  for (const mode of ['month', 'category', 'account', 'type', 'none']) {
    grouping = mode; groupKey = null; await field('#report-grouping', mode)
    await compare(`Engine grouping by ${mode}`)
    if (mode === 'account') {
      await check(`document.querySelector('.report-group-note').textContent.includes('not additive') &&
        document.querySelector('[data-group-metric="transferInCents"]') && document.querySelector('[data-group-metric="transferOutCents"]')`, 'Account grouping labels Transfer In/Out and non-additive counts')
      groupKey = expected().groups.at(-1).key; const count = await evaluate('window.__reportPreparations')
      await field('#report-group', groupKey); await compare('Selecting another account group keeps global summary unique')
      await check(`window.__reportPreparations === ${count}`, 'Selecting a prepared group does not rerun the engine')
    }
  }
  await click('.report-columns button')
  await check(`document.querySelectorAll('input[name="reportColumns"]:checked').length === 5 && document.querySelector('input[value="amountCents"]').disabled`, 'Restore defaults works and Amount remains meaningful')
  for (const column of ['date', 'type', 'category', 'account']) await click(`input[name="reportColumns"][value="${column}"]`)
  await check(`document.querySelectorAll('.report-table th').length === 1 && document.querySelector('.report-table th').dataset.column === 'amountCents'`, 'All optional columns can be hidden while Amount stays visible')
  await click('.report-columns button')
  assert.deepEqual(await snapshot(), baseline, 'All Reports exploration preserves every stored record, settings and schema')
  await check(`window.__reportWrites.length === 0`, 'Reports navigation, filtering, columns, grouping and pagination issue no IndexedDB writes')

  await evaluate(`(() => { window.__reportReadGate = new Promise(resolveRead => {
    window.__releaseReportRead = () => { window.__reportReadGate = null; resolveRead() }
  }) })()`)
  await click('.report-refresh')
  await check(`document.querySelector('.report-content').getAttribute('aria-busy') === 'true' && !document.querySelector('[data-metric]')`, 'Loading refresh hides stale totals instead of presenting them as current')
  await evaluate('window.__releaseReportRead()'); await compare('Refresh completes a coherent read-only snapshot')
  await evaluate(`import('/src/persistence/database.ts').then(({database}) => {
    window.__originalReportRead = database.transactions.toArray;
    database.transactions.toArray = async () => { throw new Error('Injected read failure') } })`)
  await click('.report-refresh'); await wait(`!!document.querySelector('.report-state[role="alert"]')`)
  await check(`!document.querySelector('[data-metric]') && document.querySelector('.report-state').textContent.includes('Refresh')`, 'Read errors are recoverable without stale financial values')
  await evaluate(`import('/src/persistence/database.ts').then(({database}) => { database.transactions.toArray = window.__originalReportRead })`)
  await click('.report-state button'); await compare('Retry recovers the report without changing records')
  assert.deepEqual(await snapshot(), baseline)
  await evaluate(`import('/src/persistence/database.ts').then(({database}) => { database.transactions.toArray = async () => [
    ${JSON.stringify({ ...base.transactions[0], amount: Number.MAX_SAFE_INTEGER })},
    {id:'overflow',type:'expense',accountId:'bank',categoryId:'food',date:'2026-10-01',amount:1} ] })`)
  await click('.report-refresh'); await wait(`!!document.querySelector('.report-state[role="alert"]')`)
  await check(`!document.querySelector('[data-metric]') && document.querySelector('.report-state').textContent.includes('safely')`, 'Unsafe report totals produce a recoverable error, never partial figures')
  await evaluate(`import('/src/persistence/database.ts').then(({database}) => { database.transactions.toArray = window.__originalReportRead })`)
  await click('.report-state button'); await compare('A valid snapshot recovers after a calculation error')

  for (const code of ['USD', 'EUR', 'GBP']) {
    await seed({ ...base, applicationSettings: { ...base.applicationSettings, currencyCode: code } })
    await compare(`${code} uses current workspace formatting with unchanged integer amounts`)
  }
  const empty = { ...data, accounts: [], categories: [], transactions: [] }
  await seed(empty); await compare('Empty workspace has exact zero summary')
  await check(`document.querySelector('.report-state h3').textContent === 'No transactions yet'`, 'Empty database has a distinct accessible state')
  await seed({ ...base, applicationSettings: { ...base.applicationSettings, currencyCode: 'GBP' } })
  await apply({ query: 'not present in any transaction' }); await compare('No matching transactions keeps an exact zero summary')
  await check(`document.querySelector('.report-state h3').textContent === 'No matching transactions'`, 'No-match state differs from empty database')
  await click('.report-state button'); filters = createReportFilters()
  const addition = { ...base.transactions[0], id: 'external-addition', receiptNumber: 'OTHER', amount: 17000 }
  await evaluate(`import('/src/persistence/repositories.ts').then(module => module.transactionsRepository.add(${JSON.stringify(addition)}))`)
  await check(`document.querySelector('.report-count').textContent.includes('67 of 67')`, 'Unnotified changes do not claim automatic cross-tab synchronization')
  data.transactions.push(addition)
  await click('.report-refresh'); await compare('Manual Refresh sees an unnotified local database change')
  const notified = { ...addition, id: 'notified-addition' }
  await evaluate(`import('/src/persistence/repositories.ts').then(async module => { await module.transactionsRepository.add(${JSON.stringify(notified)});
    (await import('/src/features/shared/dataRefresh.ts')).notifyDataChanged() })`)
  data.transactions.push(notified)
  await wait(`document.querySelector('.report-count')?.textContent.includes('69 of 69')`)
  await compare('Shared data-refresh notifications refresh the report')

  // All optional fields, exact maximum-safe money, every required viewport/theme/text size.
  await seed({ ...data, transactions: [{ ...base.transactions[0], amount: Number.MAX_SAFE_INTEGER }] })
  await apply({ query: 'RC-0042' })
  await click('.report-columns summary')
  for (const column of ['fromAccount', 'toAccount', 'accountType', 'note', 'taxAmountCents', 'expenseSubtotalCents', 'receiptNumber']) await click(`input[name="reportColumns"][value="${column}"]`)
  for (const theme of ['sage', 'ocean', 'dark']) for (const width of [320, 390, 820, 1280]) for (const font of [16, 32]) {
    await send('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: false })
    await evaluate(`import('/src/features/appearance/themePreference.ts').then(module => module.setTheme('${theme}')); document.documentElement.style.fontSize = '${font}px'`)
    await compare(`${theme} ${width}px ${font === 32 ? '200%' : '100%'} matches the prepared report`)
    await check(`document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.report-overview,.report-toolbar,.report-columns,.report-card')]
      .every(element => element.getBoundingClientRect().right <= innerWidth)`, `${theme} ${width}px ${font}px has no uncontrolled horizontal overflow`)
    await check(`(() => { const cards = document.querySelector('.report-cards'); const table = document.querySelector('.report-table-scroll');
      return innerWidth < 1024 ? cards.getClientRects().length > 0 && table.getClientRects().length === 0
        && cards.querySelector('[data-column="receiptNumber"]').textContent === 'RC-0042 / 雪' : table.getClientRects().length > 0 && cards.getClientRects().length === 0 })()`, `${theme} ${width}px ${font}px has the correct table/card presentation and accessible optional fields`)
    await click('.report-toolbar-actions button')
    await check(`document.activeElement.matches('dialog input[type="search"]') && document.querySelector('dialog').scrollWidth <= document.querySelector('dialog').clientWidth`, `${theme} ${width}px ${font}px filter dialog fits and focuses a labelled field`)
    await key('Tab'); await check(`document.activeElement.matches(':focus-visible') && parseFloat(getComputedStyle(document.activeElement).outlineWidth) > 0`, `${theme} ${width}px ${font}px keyboard focus remains visible`)
    await key('Escape'); await wait(`!document.querySelector('dialog[open]')`)
    await check(`document.activeElement === document.querySelector('.report-toolbar-actions button')`, `${theme} ${width}px ${font}px Escape restores filter focus`)
    if (font === 16 && (theme === 'sage' && width === 1280 || theme === 'ocean' && width === 390) || theme === 'dark' && width === 320 && font === 32) {
      const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
      await writeFile(join(artifacts, `${theme}-${width}-${font}.png`), Buffer.from(shot.data, 'base64'))
    }
  }
  await evaluate(`document.documentElement.style.fontSize = '16px'`)
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false })
  const stored = await snapshot()
  await send('Page.reload'); await wait(`!!document.querySelector('[data-metric]')`)
  filters = createReportFilters({ dateMode: 'month', month: '2026-10' }); grouping = 'none'; groupKey = null
  await compare('Reload preserves the deep-link route and initializes session-only controls')
  assert.deepEqual(await snapshot(), stored)
  await check(`location.hash === '#more/reports' && document.querySelectorAll('.report-table th').length === 5 && window.__reportWrites.length === 0`, 'Reload writes no preferences or financial records')

  // Production smoke test uses the built app with no development-module imports.
  production = await preview({ preview: { host: '127.0.0.1', port: 0 } })
  const productionURL = `http://127.0.0.1:${production.httpServer.address().port}/#more/reports`
  await send('Page.navigate', { url: productionURL }); await wait(`!!document.querySelector('.finance-onboarding')`)
  await field('select[id$="-country"]', 'CA'); await field('select[id$="-currency"]', 'CAD'); await click('.finance-save')
  await settled()
  await check(`location.hash === '#more/reports' && document.querySelector('.report-state h3').textContent === 'No transactions yet' &&
    document.querySelectorAll('.app-navigation-link').length === 4`, 'Production direct deep link survives onboarding and renders read-only empty Reports')
  await send('Page.reload'); await wait(`!!document.querySelector('.report-state')`)
  await check(`location.hash === '#more/reports' && !document.querySelector('.finance-onboarding')`, 'Production Reports reload remains navigable')
  await evaluate(`location.hash = 'more/data-backup'`)
  await wait(`!!document.querySelector('#backup-restore-file:not(:disabled)')`)
  const fullBackup = { format: 'my-finance-backup', schemaVersion: 3, exportedAt: '2026-10-05T16:00:00.000Z',
    currency: data.applicationSettings.currencyCode, kind: 'full',
    sections: ['accounts','categories','transactions','obligations','obligationPayments','applicationSettings','preferences'],
    data, preferences: { theme: 'sage' } }
  await evaluate(`(() => { const transfer = new DataTransfer(); transfer.items.add(new File([${JSON.stringify(JSON.stringify(fullBackup))}], 'fixture.json', {type:'application/json'}));
    const input = document.querySelector('#backup-restore-file'); input.files = transfer.files; input.dispatchEvent(new Event('change',{bubbles:true})) })()`)
  await wait(`!!document.querySelector('.backup-confirm-restore')`)
  // Explicit test-fixture restoration in the disposable profile, outside Reports.
  await evaluate(`window.confirm = () => true`); await click('.backup-confirm-restore')
  await wait(`!document.querySelector('dialog[open]') && !document.querySelector('[aria-busy="true"]')`)
  await evaluate(`window.__reportWrites = []; location.hash = 'more/reports'`)
  await compare('Production populated Reports agrees with the prepared engine result')
  const productionStored = await snapshot()
  await wait(`navigator.serviceWorker.getRegistration().then(registration => registration?.active?.state === 'activated')`)
  await send('Page.reload'); await wait(`!!document.querySelector('[data-metric]') && !!navigator.serviceWorker.controller`)
  await send('Network.enable')
  await send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  await send('Page.reload'); await wait(`!!document.querySelector('[data-metric]')`)
  await compare('Production Reports, including the separate route chunk, works offline')
  assert.deepEqual(await snapshot(), productionStored)
  await check(`window.__reportWrites.length === 0`, 'Production/offline Reports leaves records, settings and schema intact')
  await send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 })
  assert.deepEqual(exceptions, [], 'No uncaught browser exceptions')
  await writeFile(join(artifacts, 'results.json'), JSON.stringify({ checks: results.length, results }, null, 2))
  console.log(`\n${results.length} Financial Reports browser checks passed. Artifacts: ${artifacts}`)
} catch (error) {
  if (socket?.readyState === WebSocket.OPEN) {
    console.error(await evaluate(`({url: location.href, active: document.activeElement?.outerHTML, text: document.body?.textContent.slice(0,2500)})`))
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true })
    await writeFile(join(artifacts, 'failure.png'), Buffer.from(shot.data, 'base64'))
  }
  console.error('Review artifacts:', artifacts)
  throw error
} finally {
  if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify({ id: ++sequence, method: 'Browser.close' })); socket.close() }
  if (browser.exitCode === null) browser.kill()
  if (development) await development.close()
  if (production) { production.httpServer.closeAllConnections(); await new Promise(resolveClose => production.httpServer.close(resolveClose)) }
  const target = resolve(profile); assert.equal(dirname(target), resolve(tmpdir())); assert.ok(basename(target).startsWith('my-finance-reports-profile-'))
  await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}
