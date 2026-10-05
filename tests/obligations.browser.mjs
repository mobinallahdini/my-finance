// Real IndexedDB/Dexie checks in an automatically created, isolated Chrome profile.
// No browser automation dependencies. Requires Node 24, Chrome/Chromium, and Vite.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const appURL = process.env.BILLS_APP_URL ?? 'http://127.0.0.1:5173'
const chrome = process.env.CHROME_BIN ?? (process.platform === 'win32' ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe' : 'google-chrome')
const profile = await mkdtemp(join(tmpdir(), 'my-finance-obligations-'))
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' })
let launchError, socket, sequence = 0
browser.on('error', (error) => { launchError = error })
const pending = new Map()
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
async function browserChecks() {
  const results = []
  function check(condition, name) { if (!condition) throw new Error(name); results.push(name) }
  const equal = (actual, expected, name) => check(JSON.stringify(actual) === JSON.stringify(expected), name)
  async function rejects(action, pattern, name) {
    let caught
    try { await action() } catch (error) { caught = error }
    check(caught && pattern.test(`${caught.name}: ${caught.message}`), name)
  }
  const Dexie = (await import('/node_modules/dexie/dist/dexie.mjs')).default
  const financial = {
    accounts: [{ id: 'bank', name: 'Main Bank', type: 'bank', openingBalance: 100000 }, { id: 'cash', name: 'Cash', type: 'cash', openingBalance: -100 }, { id: 'card', name: 'RBC Visa', type: 'credit_card', openingBalance: 50000, creditLimit: 100000 }],
    categories: [{ id: 'food', name: 'Groceries', type: 'expense' }, { id: 'salary', name: 'Salary', type: 'income' }],
    transactions: [{ id: 'expense', type: 'expense', accountId: 'card', categoryId: 'food', amount: 4275, date: '2026-10-05', note: 'Existing expense' }, { id: 'income', type: 'income', accountId: 'bank', categoryId: 'salary', amount: 200000, date: '2026-10-04' }, { id: 'transfer', type: 'transfer', fromAccountId: 'bank', toAccountId: 'card', amount: 10000, date: '2026-10-03' }],
  }
  // The application module has not been imported: seed the exact deployed version 1 first.
  const legacy = new Dexie('my-finance')
  legacy.version(1).stores({ accounts: 'id', categories: 'id, type', transactions: 'id, date, type, accountId, fromAccountId, toAccountId, categoryId' })
  await legacy.open()
  await legacy.transaction('rw', legacy.tables, async () => {
    await legacy.table('accounts').bulkAdd(financial.accounts)
    await legacy.table('categories').bulkAdd(financial.categories)
    await legacy.table('transactions').bulkAdd(financial.transactions)
  })
  localStorage.setItem('my-finance-theme', 'ocean')
  const before = { accounts: await legacy.table('accounts').toArray(), categories: await legacy.table('categories').toArray(), transactions: await legacy.table('transactions').toArray() }
  legacy.close()
  const { database } = await import('/src/persistence/database.ts')
  const { obligationsRepository: obligations, obligationPaymentsRepository: payments, accountsRepository, categoriesRepository, transactionsRepository } = await import('/src/persistence/repositories.ts')
  const { readFinancialSnapshot, replaceApplicationSnapshot, readApplicationSnapshot } = await import('/src/persistence/dataBackup.ts')
  const { calculateInstallmentBalance, calculateObligationMonth } = await import('/src/domain/obligationCalculations.ts')
  const { calculateAccountBalance, calculateMonthlyTotalExpenses, calculateMonthlyTotalIncome } = await import('/src/domain/calculations.ts')
  const { createBackup } = await import('/src/features/dataBackup/backupFormat.ts')
  await database.open()
  check(database.verno === 3, 'Dexie upgrades the seeded database from version 1 to version 3')
  equal(await readFinancialSnapshot(), before, 'Upgrade preserves every account/category/transaction field')
  equal(database.tables.map((table) => table.name).sort(), ['accounts', 'categories', 'transactions', 'obligations', 'obligationPayments', 'applicationSettings'].sort(), 'Upgrade adds the independent tracking and settings tables')
  equal(await obligations.getAll(), [], 'Upgrade seeds no obligations')
  equal(await payments.getAll(), [], 'Upgrade seeds no payments')
  check(localStorage.getItem('my-finance-theme') === 'ocean', 'Upgrade preserves theme preference')
  equal(database.obligations.schema.indexes.map((index) => index.name), ['type', 'startMonth'], 'Obligation type/startMonth indexes exist')
  equal(database.obligationPayments.schema.indexes.map((index) => index.name), ['obligationId', 'dueMonth', '[obligationId+dueMonth]'], 'Payment reference/month/compound indexes exist')
  const baselineTotals = [calculateAccountBalance(before.accounts.find(a => a.id === 'bank'), before.transactions), calculateMonthlyTotalExpenses(before.transactions, '2026-10'), calculateMonthlyTotalIncome(before.transactions, '2026-10')]
  const bill = { id: 'bill', type: 'bill', name: 'Mobile', dueDay: 15, startMonth: '2026-10', isActive: true, expectedAmountCents: 8000, note: 'Monthly bill' }
  const installment = { id: 'installment', type: 'installment', name: 'Phone financing', dueDay: 31, startMonth: '2026-10', isActive: true, originalAmountCents: 100000, scheduledPaymentCents: 20000 }
  check(await obligations.add(bill) === 'bill', 'Add returns the caller-supplied bill ID')
  equal(await obligations.get('bill'), bill, 'Bill persists and round-trips exactly')
  await obligations.add(installment); equal(await obligations.get('installment'), installment, 'Installment persists and round-trips exactly')
  check((await obligations.getAll()).length === 2, 'getAll retrieves both obligation variants')
  equal((await obligations.getByType('bill')).map(r => r.id), ['bill'], 'getByType uses the obligation type index')
  await rejects(() => obligations.add(bill), /ConstraintError/, 'Duplicate obligation IDs reject without replacement')
  await rejects(() => obligations.update({ ...bill, id: 'missing' }), /does not exist/, 'Updating a missing obligation cannot upsert')
  check(await obligations.get('missing') === undefined, 'Get missing obligation returns undefined')
  const edited = { ...bill, name: 'Mobile plan', expectedAmountCents: 9000 }; delete edited.note
  await obligations.update(edited); equal(await obligations.get('bill'), edited, 'Update replaces the complete obligation and removes omitted note')
  await obligations.update(bill)
  const snap = { ...bill, id: 'snapshot' }, write = obligations.add(snap)
  snap.name = 'Mutated after calling add'; snap.expectedAmountCents = 1
  await write; check((await obligations.get('snapshot')).name === 'Mobile', 'Obligation writes snapshot mutable caller input before awaiting')
  await obligations.delete('snapshot'); check(await obligations.get('snapshot') === undefined, 'Obligation without payment history can be deleted')
  await obligations.delete('snapshot'); check(true, 'Deleting an absent obligation is idempotent')
  const partial = { id: 'partial', obligationId: 'bill', dueMonth: '2026-10', paidDate: '2026-11-02', amountCents: 3000, note: 'Late partial payment' }
  await payments.add(partial); equal(await payments.get('partial'), partial, 'Late payment persists with separate dueMonth and paidDate')
  const second = { ...partial, id: 'second', paidDate: '2026-10-20', amountCents: 5000 }
  await payments.add(second)
  equal((await payments.getByObligation('bill')).map(r => r.id).sort(), ['partial', 'second'], 'Multiple partial payments for one obligation/month are supported')
  const instPayment = { ...partial, id: 'inst-pay', obligationId: 'installment', amountCents: 20000 }
  await payments.add(instPayment)
  check((await payments.getForMonth('2026-10')).length === 3, 'getForMonth retrieves payments assigned to the due month')
  check((await payments.getForMonth('2026-11')).length === 0, 'paidDate month does not affect dueMonth queries')
  check((await payments.getForMonth('2026-10', 'bill')).length === 2, 'Compound query restricts month to one obligation')
  check((await payments.getAll()).length === 3, 'Payment getAll retrieves independent records')
  check(calculateObligationMonth(bill, await payments.getByObligation('bill'), '2026-10', '2026-11-03').status === 'paid', 'Persisted partial bill payments sum to paid status')
  equal(calculateInstallmentBalance(installment, await payments.getByObligation('installment')), { totalPaidCents: 20000, remainingAmountCents: 80000, overpaymentCents: 0, isCompleted: false }, 'Persisted installment balance is derived')
  await rejects(() => payments.add(partial), /ConstraintError/, 'Duplicate payment IDs reject without replacement')
  await rejects(() => payments.update({ ...partial, id: 'missing' }), /does not exist/, 'Updating missing payment cannot upsert')
  check(await payments.get('missing') === undefined, 'Get missing payment returns undefined')
  const corrected = { ...partial, amountCents: 2500, paidDate: '2026-11-03' }; delete corrected.note
  await payments.update(corrected); equal(await payments.get('partial'), corrected, 'Payment correction replaces the record and optional note')
  await payments.update(partial)
  await rejects(() => payments.add({ ...partial, id: 'orphan', obligationId: 'missing' }), /does not exist/, 'Payment add rejects missing obligation reference')
  await rejects(() => payments.update({ ...partial, obligationId: 'missing' }), /does not exist/, 'Payment update rejects missing obligation reference')
  equal(await payments.get('partial'), partial, 'Rejected payment update leaves the existing record intact')
  await rejects(() => payments.add({ ...partial, id: 'early', dueMonth: '2026-09' }), /start month/, 'Payment dueMonth cannot precede startMonth')
  await rejects(() => payments.add({ ...partial, id: 'invalid-date', paidDate: '2026-02-30' }), /calendar date/, 'Persistence rejects invalid payment dates')
  await rejects(() => payments.add({ ...partial, id: 'zero', amountCents: 0 }), /positive safe/, 'Persistence rejects zero payment amounts')
  await rejects(() => payments.add({ ...partial, id: 'unsafe', amountCents: Number.MAX_SAFE_INTEGER + 1 }), /positive safe/, 'Persistence rejects unsafe payment amounts')
  await rejects(() => payments.add({ ...partial, id: 'linked', transactionId: 'expense' }), /cross-type/, 'Payments cannot store transaction links')
  for (const [change, pattern, name] of [
    [{ dueDay: 32 }, /Due day/, 'Invalid due day'], [{ expectedAmountCents: 0 }, /positive safe/, 'Zero bill amount'],
    [{ name: ' ' }, /name/, 'Blank name'], [{ isActive: 1 }, /boolean/, 'Nonboolean active flag'],
    [{ originalAmountCents: 1 }, /cross-type/, 'Discriminated union cross-fields'], [{ remainingAmountCents: 1 }, /cross-type/, 'Mutable balance field'],
  ]) await rejects(() => obligations.add({ ...bill, ...change, id: `invalid-${name}` }), pattern, `Persistence rejects ${name.toLowerCase()}`)
  await rejects(() => obligations.delete('bill'), /payment history/, 'History protects an obligation from hard deletion')
  await rejects(() => obligations.update({ ...bill, startMonth: '2026-11' }), /start month/, 'Start-month edit cannot invalidate existing payments')
  await rejects(() => obligations.update({ ...installment, id: 'bill' }), /type.*payment history/, 'Type cannot change while payment history exists')
  equal(await obligations.get('bill'), bill, 'Rejected obligation updates are atomic')
  await obligations.update({ ...bill, isActive: false })
  check((await payments.getByObligation('bill')).length === 2, 'Deactivation retains all payment history')
  await payments.add({ ...partial, id: 'archived-correction', amountCents: 1000 }); check(true, 'Inactive obligations accept explicit historical payments')
  await payments.delete('archived-correction'); await obligations.update(bill)
  await obligations.update({ ...installment, originalAmountCents: 15000 })
  check(calculateInstallmentBalance(await obligations.get('installment'), await payments.getByObligation('installment')).overpaymentCents === 5000, 'Principal edits expose overpayment without rewriting recorded payments')
  await obligations.update(installment)
  const moving = { ...partial, id: 'moving', amountCents: 1 }
  await payments.add(moving); await payments.update({ ...moving, obligationId: 'installment' })
  check((await payments.get('moving')).obligationId === 'installment', 'Payment correction can reassign to another valid obligation')
  await payments.delete('moving')
  const captured = { ...partial, id: 'captured' }, paymentWrite = payments.add(captured)
  captured.amountCents = 1; await paymentWrite
  check((await payments.get('captured')).amountCents === 3000, 'Payment writes snapshot mutable caller input')
  await payments.delete('captured'); await payments.delete('captured'); check(true, 'Explicit payment deletion is idempotent')
  // A second same-origin realm imports the real repositories, using a distinct Dexie connection.
  const frame = document.createElement('iframe'); frame.src = '/src/domain/README.md'; document.body.append(frame)
  await new Promise(resolveFrame => { frame.onload = resolveFrame })
  const peer = await frame.contentWindow.eval('import("/src/persistence/repositories.ts")')
  for (const mode of ['delete', 'start', 'type']) for (let index = 0; index < 4; index++) {
    const record = { ...bill, id: `race-${mode}-${index}` }, pay = { ...partial, id: `race-pay-${mode}-${index}`, obligationId: record.id }
    await obligations.add(record)
    const competing = () => mode === 'delete' ? peer.obligationsRepository.delete(record.id)
      : peer.obligationsRepository.update(mode === 'start' ? { ...record, startMonth: '2026-11' } : { ...installment, id: record.id })
    const outcomes = await Promise.allSettled(index % 2 ? [payments.add(pay), competing()] : [competing(), payments.add(pay)])
    const saved = await obligations.get(record.id), savedPay = await payments.get(pay.id)
    if (mode === 'type') {
      // Changing type BEFORE the first payment is valid; changing it AFTER payment must reject.
      const editOutcome = outcomes[index % 2 ? 1 : 0]
      check(savedPay && saved && saved.type === (editOutcome.status === 'fulfilled' ? 'installment' : 'bill'), `Concurrent type change is applied only before payment history (${index + 1})`)
    } else check(outcomes.some(outcome => outcome.status === 'rejected'), `Concurrent ${mode} and payment write cannot both bypass integrity (${index + 1})`)
    check(!savedPay || (saved && saved.startMonth <= savedPay.dueMonth), `Cross-connection ${mode} leaves no orphan or inconsistent history (${index + 1})`)
    await payments.delete(pay.id); await obligations.delete(record.id)
  }
  await frame.contentWindow.eval('import("/src/persistence/database.ts").then(({database}) => database.close())'); frame.remove()
  const after = await readFinancialSnapshot()
  equal(after, before, 'Every obligation/payment operation leaves financial tables untouched')
  equal([calculateAccountBalance(after.accounts.find(a => a.id === 'bank'), after.transactions), calculateMonthlyTotalExpenses(after.transactions, '2026-10'), calculateMonthlyTotalIncome(after.transactions, '2026-10')], baselineTotals, 'Account balances and dashboard income/expense calculations remain unchanged')
  equal(await accountsRepository.getAll(), before.accounts, 'Existing accounts repository still works after upgrade')
  equal(await categoriesRepository.getAll(), before.categories, 'Existing categories repository still works after upgrade')
  equal(await transactionsRepository.getAll(), before.transactions, 'Existing transactions repository still works after upgrade')
  check((await transactionsRepository.getForMonth('2026-10')).length === 3, 'Original transaction month index survives upgrade')
  check((await transactionsRepository.getByAccount('card')).length === 2, 'Original account/transfer indexes survive upgrade')
  check((await categoriesRepository.getByType('income')).length === 1, 'Original category type index survives upgrade')
  const backup = createBackup({...await readApplicationSnapshot(),applicationSettings:await database.applicationSettings.get('application')}, 'ocean', undefined, 'full', new Date('2026-10-05T12:00:00Z'))
  check(backup.schemaVersion === 3, 'Full Backup exports schemaVersion 3')
  equal(Object.keys(backup.data).sort(), ['accounts', 'categories', 'transactions', 'obligations', 'obligationPayments', 'applicationSettings'].sort(), 'Schema v3 backup includes every data table and workspace settings')
  const obligationSnapshot = await obligations.getAll(), paymentSnapshot = await payments.getAll()
  await replaceApplicationSnapshot({ ...before, obligations: obligationSnapshot, obligationPayments: paymentSnapshot })
  equal(await obligations.getAll(), obligationSnapshot, 'Application restore retains every included obligation')
  equal(await payments.getAll(), paymentSnapshot, 'Application restore retains every included payment')
  await payments.delete('partial'); await payments.delete('second'); await obligations.delete('bill')
  check(await obligations.get('bill') === undefined, 'Obligation can be deleted after explicit removal of all payments')
  equal(await payments.getByObligation('bill'), [], 'Explicit deletes leave no payment history behind')
  database.close(); await database.open()
  equal(await obligations.get('installment'), installment, 'Obligation survives closing and reopening IndexedDB')
  equal(await payments.get('inst-pay'), instPayment, 'Payment survives closing and reopening IndexedDB')
  equal(await readFinancialSnapshot(), before, 'Financial data survives reopening the upgraded database')
  await database.delete(); await database.open()
  check(database.verno === 3 && database.tables.length === 6, 'Fresh installation creates the complete version 3 schema')
  equal(await Promise.all(database.tables.map(table => table.count())), [0, 0, 0, 0, 0, 0], 'Fresh installation creates no sample financial or obligation records')
  database.close()
  return results
}

try {
  let port
  for (let attempt = 0; attempt < 200; attempt++) {
    if (launchError) throw launchError
    try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); break } catch { await delay(50) }
  }
  assert.ok(port, 'Chrome did not expose its debugging port')
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
  socket = new WebSocket(targets.find(target => target.type === 'page').webSocketDebuggerUrl)
  await new Promise((resolveOpen, reject) => { socket.onopen = resolveOpen; socket.onerror = reject })
  socket.onmessage = ({ data }) => {
    const response = JSON.parse(data), promise = pending.get(response.id)
    if (promise) { pending.delete(response.id); if (response.error) promise.reject(new Error(JSON.stringify(response.error))); else promise.resolve(response.result) }
  }
  await send('Page.enable')
  await send('Page.navigate', { url: `${appURL}/src/domain/README.md` })
  for (let attempt = 0; attempt < 100; attempt++) { if (await evaluate(`location.origin === ${JSON.stringify(new URL(appURL).origin)} && document.readyState === 'complete'`)) break; await delay(50) }
  const results = await evaluate(`(${browserChecks.toString()})()`)
  for (const result of results) console.log(`PASS ${result}`)
  console.log(`\n${results.length} real-browser persistence checks passed in an isolated profile.`)
} finally {
  if (socket?.readyState === WebSocket.OPEN) { socket.send(JSON.stringify({ id: ++sequence, method: 'Browser.close' })); await delay(400); socket.close() }
  if (browser.exitCode === null) browser.kill()
  // Verify the resolved target before any recursive cleanup on Windows.
  const target = resolve(profile)
  assert.equal(dirname(target), resolve(tmpdir()))
  assert.ok(basename(target).startsWith('my-finance-obligations-'))
  await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 })
}
