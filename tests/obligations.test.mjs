import assert from 'node:assert/strict'
import test from 'node:test'
import { calendarDayNumber, daysInCalendarMonth, nextCalendarMonth, requireCalendarDate, requireCalendarMonth } from '../src/domain/calendar.ts'
import { validateObligation, validateObligationPayment, validateObligationPaymentReference } from '../src/domain/obligationValidation.ts'
import { calculateInstallmentBalance, calculateNextObligationDueDate, calculateObligationMonth, calculateObligationMonthSummary, calculateObligationStatus, obligationDueSoonDays, resolveObligationDueDate } from '../src/domain/obligationCalculations.ts'
import { calculateAccountBalance, calculateMonthlyTotalExpenses, calculateMonthlyTotalIncome } from '../src/domain/calculations.ts'

const bill = (extra = {}) => ({ id: 'bill', type: 'bill', name: 'Mobile', dueDay: 15, startMonth: '2026-10', isActive: true, expectedAmountCents: 8000, ...extra })
const installment = (extra = {}) => ({ id: 'installment', type: 'installment', name: 'Phone financing', dueDay: 31, startMonth: '2026-10', isActive: true, originalAmountCents: 100000, scheduledPaymentCents: 20000, ...extra })
const payment = (extra = {}) => ({ id: 'payment', obligationId: 'bill', dueMonth: '2026-10', paidDate: '2026-10-15', amountCents: 8000, ...extra })
const installmentPayment = (extra = {}) => payment({ id: 'installment-payment', obligationId: 'installment', amountCents: 20000, ...extra })
const month = (record = bill(), payments = [], today = '2026-10-05', dueMonth = '2026-10') => calculateObligationMonth(record, payments, dueMonth, today)

for (const [dueMonth, dueDay, expected] of [
  ['2026-01', 15, '2026-01-15'], ['2026-01', 31, '2026-01-31'], ['2026-02', 31, '2026-02-28'],
  ['2028-02', 31, '2028-02-29'], ['2026-04', 31, '2026-04-30'], ['2000-02', 31, '2000-02-29'],
  ['1900-02', 31, '1900-02-28'], ['0001-02', 31, '0001-02-28'], ['9999-12', 31, '9999-12-31'],
]) test(`Monthly due date ${dueMonth}, day ${dueDay}`, () => assert.equal(resolveObligationDueDate(dueMonth, dueDay), expected))

for (const [today, status] of [['2026-10-09', 'upcoming'], ['2026-10-10', 'due_soon'], ['2026-10-14', 'due_soon'], ['2026-10-15', 'due_today'], ['2026-10-16', 'overdue']]) {
  test(`Bill status on ${today}: ${status}`, () => {
    assert.equal(obligationDueSoonDays, 5); assert.equal(calculateObligationStatus(bill(), [], today), status)
    assert.equal(month(bill(), [], today).isOverdue, status === 'overdue')
  })
}
test('Fixed monthly bill reports expected, paid, remaining, and paid status', () => {
  assert.deepEqual(month(bill(), [payment()], '2026-10-20'), {
    obligationId: 'bill', dueMonth: '2026-10', dueDate: '2026-10-15', isDue: true,
    expectedAmountCents: 8000, paidAmountCents: 8000, remainingDueCents: 0,
    status: 'paid', timingStatus: 'overdue', isOverdue: false, installmentBalance: undefined,
  })
  assert.equal(month(bill(), [payment({ amountCents: 9000 })]).status, 'paid')
})
test('Partial bill payments aggregate and retain overdue timing separately', () => {
  const payments = [payment({ amountCents: 2000 }), payment({ id: 'second', amountCents: 1000 })]
  const result = month(bill(), payments, '2026-10-20')
  assert.equal(result.status, 'partially_paid'); assert.equal(result.paidAmountCents, 3000)
  assert.equal(result.remainingDueCents, 5000); assert.equal(result.timingStatus, 'overdue'); assert.equal(result.isOverdue, true)
  assert.equal(month(bill(), [payment({ ...payments[0], obligationId: 'another' })]).paidAmountCents, 0)
})
test('Bill payments only satisfy their assigned dueMonth, regardless of paidDate', () => {
  const late = payment({ paidDate: '2026-11-02' })
  validateObligationPayment(late); validateObligationPaymentReference(late, bill())
  assert.equal(month(bill(), [late]).status, 'paid')
  assert.equal(month(bill(), [late], '2026-11-15', '2026-11').status, 'due_today')
})
test('Future start month creates no earlier due amount or date', () => {
  const record = bill({ startMonth: '2026-11' })
  const result = month(record)
  assert.equal(result.status, 'upcoming'); assert.equal(result.isDue, false)
  assert.equal(result.dueDate, undefined); assert.equal(result.expectedAmountCents, 0)
  assert.equal(calculateNextObligationDueDate(record, [], '2026-10-30'), '2026-11-15')
  assert.equal(month(record, [], '2026-11-15', '2026-11').status, 'due_today')
})
test('Inactive bill keeps payments but is not due/upcoming/overdue', () => {
  const result = month(bill({ isActive: false }), [payment({ amountCents: 1000 })], '2026-10-20')
  assert.equal(result.status, 'inactive'); assert.equal(result.isDue, false); assert.equal(result.isOverdue, false)
  assert.equal(result.paidAmountCents, 1000); assert.equal(result.remainingDueCents, 0)
  assert.equal(calculateNextObligationDueDate(bill({ isActive: false }), [], '2026-10-05'), undefined)
})
test('Installment without payments retains original amount and monthly schedule', () => {
  const result = month(installment())
  assert.deepEqual(result.installmentBalance, { totalPaidCents: 0, remainingAmountCents: 100000, overpaymentCents: 0, isCompleted: false })
  assert.equal(result.expectedAmountCents, 20000); assert.equal(result.remainingDueCents, 20000); assert.equal(result.status, 'upcoming')
})
test('One scheduled installment payment satisfies its month without completing balance', () => {
  const result = month(installment(), [installmentPayment()])
  assert.equal(result.status, 'paid'); assert.equal(result.remainingDueCents, 0)
  assert.equal(result.installmentBalance.remainingAmountCents, 80000)
  assert.equal(calculateNextObligationDueDate(installment(), [installmentPayment()], '2026-10-05'), '2026-11-30')
})
test('Partial and multiple installment payments determine month status', () => {
  const first = installmentPayment({ amountCents: 5000 })
  const partial = month(installment(), [first], '2026-11-02')
  assert.equal(partial.status, 'partially_paid'); assert.equal(partial.remainingDueCents, 15000); assert.equal(partial.isOverdue, true)
  const payments = [first, installmentPayment({ id: 'second', amountCents: 15000 })]
  assert.equal(month(installment(), payments).status, 'paid')
  assert.equal(calculateInstallmentBalance(installment(), payments).remainingAmountCents, 80000)
})
test('Final installment monthly target is capped to remaining principal', () => {
  const payments = [installmentPayment({ dueMonth: '2026-10', amountCents: 90000 })]
  const result = month(installment(), payments, '2026-11-20', '2026-11')
  assert.equal(result.expectedAmountCents, 10000); assert.equal(result.remainingDueCents, 10000)
  assert.equal(calculateNextObligationDueDate(installment(), payments, '2026-11-20'), '2026-11-30')
})
test('Exact completion and overpayment are derived, without mutating payments', () => {
  for (const [amountCents, overpaymentCents] of [[100000, 0], [105000, 5000]]) {
    const payments = [installmentPayment({ amountCents })], before = structuredClone(payments)
    assert.deepEqual(calculateInstallmentBalance(installment(), payments), { totalPaidCents: amountCents, remainingAmountCents: 0, overpaymentCents, isCompleted: true })
    assert.equal(month(installment(), payments).status, 'completed')
    assert.equal(month(installment(), payments).remainingDueCents, 0)
    assert.equal(calculateNextObligationDueDate(installment(), payments, '2026-10-01'), undefined)
    assert.deepEqual(payments, before)
    assert.equal(month(installment(), payments, '2026-11-20', '2026-11').isDue, false)
  }
})
test('Inactive installment retains its derived balance and overrides completed status', () => {
  const record = installment({ isActive: false })
  assert.equal(month(record, [installmentPayment()]).status, 'inactive')
  assert.equal(month(record, [installmentPayment()]).installmentBalance.remainingAmountCents, 80000)
  assert.equal(month(record, [installmentPayment({ amountCents: 100000 })]).status, 'inactive')
})
test('Next relevant date retains overdue current month, skips prepaid months, and crosses years', () => {
  assert.equal(calculateNextObligationDueDate(bill(), [], '2026-10-20'), '2026-10-15')
  assert.equal(calculateNextObligationDueDate(bill({ startMonth: '2026-01' }), [], '2026-10-20'), '2026-10-15')
  const payments = [payment(), payment({ id: 'nov', dueMonth: '2026-11' })]
  assert.equal(calculateNextObligationDueDate(bill(), payments, '2026-10-20'), '2026-12-15')
  assert.equal(calculateNextObligationDueDate(bill({ startMonth: '2026-12' }), [payment({ dueMonth: '2026-12' })], '2026-12-30'), '2027-01-15')
})
test('Calendar upper boundary returns undefined once the last supported month is paid', () => {
  const record = bill({ startMonth: '9999-12', dueDay: 31 })
  assert.equal(calculateNextObligationDueDate(record, [], '9999-12-01'), '9999-12-31')
  assert.equal(calculateNextObligationDueDate(record, [payment({ dueMonth: '9999-12', paidDate: '9999-12-31' })], '9999-12-31'), undefined)
  assert.equal(nextCalendarMonth('9999-12'), undefined)
})
test('Monthly summary isolates expectations, allocation-based actual payments, and overdue partials', () => {
  const paused = bill({ id: 'paused', isActive: false }), future = bill({ id: 'future', startMonth: '2026-11' })
  const payments = [payment({ amountCents: 1000, paidDate: '2026-11-02' }), installmentPayment({ amountCents: 5000 }), payment({ id: 'paused-pay', obligationId: 'paused', amountCents: 2500 })]
  const result = calculateObligationMonthSummary([bill(), installment(), paused, future], payments, '2026-10', '2026-11-02')
  assert.equal(result.states.length, 4); assert.equal(result.obligationsDue.length, 2)
  assert.equal(result.expectedTotalDueCents, 28000); assert.equal(result.totalPaidCents, 8500); assert.equal(result.remainingTotalDueCents, 22000)
  assert.equal(result.paidDuringMonthCents, 7500)
  const november = calculateObligationMonthSummary([bill(), installment(), paused, future], payments, '2026-11', '2026-11-02')
  assert.equal(november.totalPaidCents, 0); assert.equal(november.paidDuringMonthCents, 1000)
  assert.deepEqual(result.overdueObligations.map((state) => state.obligationId), ['bill', 'installment'])
  assert.deepEqual(calculateObligationMonthSummary([], [], '2026-10', '2026-10-05'), { month: '2026-10', states: [], obligationsDue: [], expectedTotalDueCents: 0, totalPaidCents: 0, paidDuringMonthCents: 0, remainingTotalDueCents: 0, overdueObligations: [] })
})
test('Completion-month payments remain visible in summary; future installment months are excluded', () => {
  const payments = [installmentPayment({ amountCents: 100000 })]
  const october = calculateObligationMonthSummary([installment()], payments, '2026-10', '2026-10-05')
  assert.equal(october.totalPaidCents, 100000); assert.equal(october.expectedTotalDueCents, 20000); assert.equal(october.remainingTotalDueCents, 0)
  assert.equal(calculateObligationMonthSummary([installment()], payments, '2026-11', '2026-11-05').obligationsDue.length, 0)
})
test('Prepayments count regardless of today; current snapshot reserves amounts assigned to other months', () => {
  const payments = [installmentPayment({ dueMonth: '2026-11', paidDate: '2026-11-30', amountCents: 95000 })]
  assert.equal(month(installment(), payments).expectedAmountCents, 5000)
  assert.equal(month(installment(), payments).installmentBalance.remainingAmountCents, 5000)
})
test('Safe integer boundaries, aggregate overflow, and unrelated payments', () => {
  const record = installment({ originalAmountCents: Number.MAX_SAFE_INTEGER, scheduledPaymentCents: Number.MAX_SAFE_INTEGER })
  assert.equal(calculateInstallmentBalance(record, [installmentPayment({ amountCents: Number.MAX_SAFE_INTEGER })]).remainingAmountCents, 0)
  assert.throws(() => calculateInstallmentBalance(record, [installmentPayment({ amountCents: Number.MAX_SAFE_INTEGER }), installmentPayment({ id: 'overflow', amountCents: 1 })]), /safe integer/)
  assert.throws(() => calculateObligationMonthSummary([bill({ expectedAmountCents: Number.MAX_SAFE_INTEGER }), bill({ id: 'other', expectedAmountCents: 1 })], [], '2026-10', '2026-10-05'), /safe integer/)
  assert.equal(calculateInstallmentBalance(installment(), [payment()]).totalPaidCents, 0)
})
test('Duplicate IDs and missing/before-start references cannot silently skew calculations', () => {
  assert.throws(() => month(bill(), [payment(), payment()]), /unique/)
  assert.throws(() => calculateObligationMonthSummary([bill(), bill()], [], '2026-10', '2026-10-05'), /unique/)
  assert.throws(() => calculateObligationMonthSummary([], [payment()], '2026-10', '2026-10-05'), /does not exist/)
  assert.throws(() => month(bill(), [payment({ dueMonth: '2026-09' })]), /start month/)
})
test('Pure calculations are deterministic, immutable, and timezone independent', () => {
  const record = installment(), payments = [installmentPayment({ amountCents: 5000 })]
  const before = JSON.stringify([record, payments]), original = process.env.TZ
  try {
    for (const zone of ['America/Toronto', 'Asia/Tehran', 'Pacific/Kiritimati', 'Pacific/Honolulu']) {
      process.env.TZ = zone
      assert.equal(resolveObligationDueDate('2028-02', 31), '2028-02-29')
      assert.equal(calculateObligationStatus(bill({ dueDay: 1, startMonth: '2026-01' }), [], '2026-03-28', '2026-04'), 'due_soon')
      assert.deepEqual(month(record, payments), month(record, payments))
    }
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original }
  assert.equal(JSON.stringify([record, payments]), before)
})
test('Calendar arithmetic counts actual days through leap years, centuries, and DST months', () => {
  assert.equal(calendarDayNumber('2028-03-01') - calendarDayNumber('2028-02-28'), 2)
  assert.equal(calendarDayNumber('1900-03-01') - calendarDayNumber('1900-02-28'), 1)
  assert.equal(calendarDayNumber('2026-03-09') - calendarDayNumber('2026-03-08'), 1)
  assert.equal(calendarDayNumber('0001-01-01'), 1)
  assert.equal(nextCalendarMonth('0001-12'), '0002-01')
})
test('Obligations and payments do not participate in account balances or income/expenses', () => {
  const account = { id: 'bank', name: 'Bank', type: 'bank', openingBalance: 10000 }
  const transactions = [{ id: 'expense', type: 'expense', accountId: 'bank', categoryId: 'food', amount: 2500, date: '2026-10-05' }]
  const before = [calculateAccountBalance(account, transactions), calculateMonthlyTotalExpenses(transactions, '2026-10'), calculateMonthlyTotalIncome(transactions, '2026-10')]
  calculateObligationMonthSummary([bill(), installment()], [payment(), installmentPayment()], '2026-10', '2026-10-05')
  assert.deepEqual(before, [7500, 2500, 0]); assert.deepEqual(before, [calculateAccountBalance(account, transactions), calculateMonthlyTotalExpenses(transactions, '2026-10'), calculateMonthlyTotalIncome(transactions, '2026-10')])
})

const invalidObligations = [
  ['empty ID', r => { r.id = ' ' }], ['unsupported type', r => { r.type = 'weekly' }], ['blank name', r => { r.name = ' ' }], ['untrimmed name', r => { r.name = ' Mobile' }],
  ['fractional due day', r => { r.dueDay = 1.5 }], ['zero due day', r => { r.dueDay = 0 }], ['due day 32', r => { r.dueDay = 32 }], ['string due day', r => { r.dueDay = '15' }],
  ['bad month', r => { r.startMonth = '2026-13' }], ['year zero', r => { r.startMonth = '0000-01' }], ['numeric month', r => { r.startMonth = 202610 }],
  ['nonboolean active', r => { r.isActive = 1 }], ['invalid note', r => { r.note = {} }], ['missing bill amount', r => { delete r.expectedAmountCents }],
  ['zero bill amount', r => { r.expectedAmountCents = 0 }], ['negative bill amount', r => { r.expectedAmountCents = -1 }], ['fractional bill amount', r => { r.expectedAmountCents = 1.5 }],
  ['unsafe bill amount', r => { r.expectedAmountCents = Number.MAX_SAFE_INTEGER + 1 }], ['string bill amount', r => { r.expectedAmountCents = '8000' }],
  ['cross type original amount', r => { r.originalAmountCents = 100000 }], ['cross type schedule', r => { r.scheduledPaymentCents = undefined }],
  ['mutable remaining', r => { r.remainingAmountCents = 1 }], ['mutable completed', r => { r.completed = true }], ['transaction linkage', r => { r.transactionId = 'tx' }],
]
for (const [name, mutate] of invalidObligations) test(`Obligation validation rejects ${name}`, () => {
  const record = bill(); mutate(record); assert.throws(() => validateObligation(record), RangeError)
})
for (const field of ['originalAmountCents', 'scheduledPaymentCents']) for (const value of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, undefined]) {
  test(`Installment rejects ${field} = ${value}`, () => assert.throws(() => validateObligation(installment({ [field]: value })), RangeError))
}
test('Installment rejects bill fields; valid records and large schedules are accepted', () => {
  assert.throws(() => validateObligation(installment({ expectedAmountCents: 1 })), /cross-type/)
  validateObligation(bill()); validateObligation(installment({ scheduledPaymentCents: 200000 }))
  assert.equal(month(installment({ scheduledPaymentCents: 200000 })).expectedAmountCents, 100000)
})
const invalidPayments = [
  ['empty ID', r => { r.id = '' }], ['empty reference', r => { r.obligationId = '' }], ['invalid month', r => { r.dueMonth = '2026-00' }],
  ['invalid date', r => { r.paidDate = '2026-02-29' }], ['rollover date', r => { r.paidDate = '2026-04-31' }], ['year zero', r => { r.paidDate = '0000-01-01' }],
  ['timestamp date', r => { r.paidDate = '2026-10-05T00:00:00Z' }], ['numeric date', r => { r.paidDate = 20261005 }], ['zero amount', r => { r.amountCents = 0 }],
  ['negative amount', r => { r.amountCents = -1 }], ['fractional amount', r => { r.amountCents = 1.5 }], ['unsafe amount', r => { r.amountCents = Number.MAX_SAFE_INTEGER + 1 }],
  ['invalid note', r => { r.note = 5 }], ['cross type field', r => { r.originalAmountCents = 10 }], ['transaction ID', r => { r.transactionId = 'tx' }],
]
for (const [name, mutate] of invalidPayments) test(`Payment validation rejects ${name}`, () => {
  const record = payment(); mutate(record); assert.throws(() => validateObligationPayment(record), RangeError)
})
test('Payment reference validation permits late/early dates and inactive history, rejects missing/pre-start references', () => {
  for (const paidDate of ['2026-09-30', '2026-11-02', '2028-02-29']) {
    const record = payment({ paidDate }); validateObligationPayment(record); validateObligationPaymentReference(record, bill({ isActive: false }))
  }
  assert.throws(() => validateObligationPaymentReference(payment(), undefined), /does not exist/)
  assert.throws(() => validateObligationPaymentReference(payment(), installment()), /does not exist/)
  assert.throws(() => validateObligationPaymentReference(payment({ dueMonth: '2026-09' }), bill()), /start month/)
})
for (const value of ['', '0000-01', '2026-13', '2026-1', '10000-01', null, 202610]) {
  test(`Calendar rejects month ${value}`, () => { assert.throws(() => requireCalendarMonth(value)); assert.throws(() => daysInCalendarMonth(value)) })
}
for (const value of ['', '0000-01-01', '2026-02-30', '2026-10-00', '2026-1-01', '10000-01-01', null, 20261005]) {
  test(`Calendar rejects date ${value}`, () => assert.throws(() => requireCalendarDate(value)))
}
test('Calculations validate explicit month/today and dueDay inputs', () => {
  assert.throws(() => month(bill(), [], '2026-02-30'))
  assert.throws(() => month(bill(), [], '2026-10-05', '2026-13'))
  for (const day of [0, -1, 32, 1.5, NaN]) assert.throws(() => resolveObligationDueDate('2026-10', day))
})
