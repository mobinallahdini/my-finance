import type { CalendarDate, Installment, MoneyCents, Obligation, ObligationPayment, YearMonth } from './models.ts'
import { calendarDayNumber, daysInCalendarMonth, nextCalendarMonth, requireCalendarDate, requireCalendarMonth } from './calendar.ts'
import { requireDueDay, validateObligation, validateObligationPayment, validateObligationPaymentReference } from './obligationValidation.ts'

export const obligationDueSoonDays = 5
export type ObligationStatus = 'upcoming' | 'due_soon' | 'due_today' | 'overdue' | 'paid' | 'partially_paid' | 'completed' | 'inactive'
export type ObligationTimingStatus = 'upcoming' | 'due_soon' | 'due_today' | 'overdue'

export interface InstallmentBalance {
  readonly totalPaidCents: MoneyCents
  readonly remainingAmountCents: MoneyCents
  readonly overpaymentCents: MoneyCents
  readonly isCompleted: boolean
}
export interface ObligationMonthState {
  readonly obligationId: string
  readonly dueMonth: YearMonth
  readonly dueDate: CalendarDate | undefined
  readonly isDue: boolean
  readonly expectedAmountCents: MoneyCents
  readonly paidAmountCents: MoneyCents
  readonly remainingDueCents: MoneyCents
  readonly status: ObligationStatus
  /** Separate timing preserves the fact that a partial payment can also be overdue. */
  readonly timingStatus: ObligationTimingStatus | undefined
  readonly isOverdue: boolean
  readonly installmentBalance: InstallmentBalance | undefined
}
export interface ObligationMonthSummary {
  readonly month: YearMonth
  readonly states: readonly ObligationMonthState[]
  readonly obligationsDue: readonly ObligationMonthState[]
  readonly expectedTotalDueCents: MoneyCents
  /** Assigned dueMonth, including payments on completed/inactive obligations. */
  readonly totalPaidCents: MoneyCents
  /** Actual paidDate calendar month, regardless of which due month was covered. */
  readonly paidDuringMonthCents: MoneyCents
  readonly remainingTotalDueCents: MoneyCents
  readonly overdueObligations: readonly ObligationMonthState[]
}

function safeAdd(left: MoneyCents, right: MoneyCents): MoneyCents {
  const sum = left + right
  if (!Number.isSafeInteger(sum)) throw new RangeError('Obligation totals must remain safe integer cents.')
  return sum
}
function paymentTotals(obligation: Obligation, payments: readonly ObligationPayment[]) {
  validateObligation(obligation)
  const monthly = new Map<YearMonth, MoneyCents>(), ids = new Set<string>()
  let total = 0
  for (const payment of payments) {
    if (payment.obligationId !== obligation.id) continue
    validateObligationPayment(payment)
    validateObligationPaymentReference(payment, obligation)
    if (ids.has(payment.id)) throw new RangeError('Payment IDs must be unique in calculation inputs.')
    ids.add(payment.id)
    total = safeAdd(total, payment.amountCents)
    monthly.set(payment.dueMonth, safeAdd(monthly.get(payment.dueMonth) ?? 0, payment.amountCents))
  }
  return { total, monthly }
}
function balance(original: MoneyCents, paid: MoneyCents): InstallmentBalance {
  return {
    totalPaidCents: paid,
    remainingAmountCents: Math.max(0, original - paid),
    overpaymentCents: Math.max(0, paid - original),
    isCompleted: paid >= original,
  }
}

export function calculateInstallmentBalance(installment: Installment, payments: readonly ObligationPayment[]): InstallmentBalance {
  if (installment.type !== 'installment') throw new RangeError('An installment is required for a remaining balance.')
  return balance(installment.originalAmountCents, paymentTotals(installment, payments).total)
}

/** dueDay 31 becomes the last calendar day in a shorter month. */
export function resolveObligationDueDate(month: YearMonth, dueDay: number): CalendarDate {
  requireDueDay(dueDay)
  return `${month}-${String(Math.min(dueDay, daysInCalendarMonth(month))).padStart(2, '0')}`
}
function timing(dueDate: CalendarDate, today: CalendarDate): ObligationTimingStatus {
  const distance = calendarDayNumber(dueDate) - calendarDayNumber(today)
  return distance < 0 ? 'overdue' : distance === 0 ? 'due_today' : distance <= obligationDueSoonDays ? 'due_soon' : 'upcoming'
}
function monthState(obligation: Obligation, totals: ReturnType<typeof paymentTotals>, month: YearMonth, today: CalendarDate): ObligationMonthState {
  const paid = totals.monthly.get(month) ?? 0
  const installment = obligation.type === 'installment' ? balance(obligation.originalAmountCents, totals.total) : undefined
  // Current snapshot: reserve all payments assigned to OTHER months before this month's target.
  const target = obligation.type === 'bill' ? obligation.expectedAmountCents
    : Math.min(obligation.scheduledPaymentCents, Math.max(0, obligation.originalAmountCents - (totals.total - paid)))
  const isDue = obligation.isActive && month >= obligation.startMonth && target > 0
  const dueDate = isDue ? resolveObligationDueDate(month, obligation.dueDay) : undefined
  const expected = isDue ? target : 0
  const remaining = Math.max(0, expected - paid)
  const timingStatus = dueDate && !installment?.isCompleted ? timing(dueDate, today) : undefined
  let status: ObligationStatus
  if (!obligation.isActive) status = 'inactive'
  else if (installment?.isCompleted) status = 'completed'
  else if (!isDue) status = 'upcoming'
  else if (!remaining) status = 'paid'
  else if (paid > 0) status = 'partially_paid'
  else status = timingStatus!
  return {
    obligationId: obligation.id, dueMonth: month, dueDate, isDue,
    expectedAmountCents: expected, paidAmountCents: paid, remainingDueCents: remaining,
    status, timingStatus, isOverdue: remaining > 0 && timingStatus === 'overdue', installmentBalance: installment,
  }
}

/** today controls timing only; all supplied recorded payments count, with no implicit clock/cutoff. */
export function calculateObligationMonth(obligation: Obligation, payments: readonly ObligationPayment[], month: YearMonth, today: CalendarDate): ObligationMonthState {
  requireCalendarMonth(month)
  requireCalendarDate(today)
  return monthState(obligation, paymentTotals(obligation, payments), month, today)
}

export function calculateObligationStatus(obligation: Obligation, payments: readonly ObligationPayment[], today: CalendarDate, month: YearMonth = today.slice(0, 7)): ObligationStatus {
  return calculateObligationMonth(obligation, payments, month, today).status
}

/** Current/start month if unpaid (even overdue); otherwise skip paid months. Prior months are not searched. */
export function calculateNextObligationDueDate(obligation: Obligation, payments: readonly ObligationPayment[], today: CalendarDate): CalendarDate | undefined {
  requireCalendarDate(today)
  const totals = paymentTotals(obligation, payments)
  if (!obligation.isActive || (obligation.type === 'installment' && totals.total >= obligation.originalAmountCents)) return undefined
  let month: YearMonth | undefined = today.slice(0, 7) < obligation.startMonth ? obligation.startMonth : today.slice(0, 7)
  while (month) {
    const state = monthState(obligation, totals, month, today)
    if (state.remainingDueCents > 0) return state.dueDate
    month = nextCalendarMonth(month)
  }
  return undefined
}

export function calculateObligationMonthSummary(obligations: readonly Obligation[], payments: readonly ObligationPayment[], month: YearMonth, today: CalendarDate): ObligationMonthSummary {
  requireCalendarMonth(month)
  requireCalendarDate(today)
  const references = new Map<string, Obligation>()
  for (const obligation of obligations) {
    validateObligation(obligation)
    if (references.has(obligation.id)) throw new RangeError('Obligation IDs must be unique in calculation inputs.')
    references.set(obligation.id, obligation)
  }
  const paymentIds = new Set<string>()
  for (const payment of payments) {
    validateObligationPayment(payment)
    validateObligationPaymentReference(payment, references.get(payment.obligationId))
    if (paymentIds.has(payment.id)) throw new RangeError('Payment IDs must be unique in calculation inputs.')
    paymentIds.add(payment.id)
  }
  const states = obligations.map((obligation) => monthState(obligation, paymentTotals(obligation, payments), month, today))
  const obligationsDue = states.filter((state) => state.isDue)
  const sum = (values: readonly number[]) => values.reduce(safeAdd, 0)
  return {
    month, states, obligationsDue,
    expectedTotalDueCents: sum(obligationsDue.map((state) => state.expectedAmountCents)),
    totalPaidCents: sum(states.map((state) => state.paidAmountCents)),
    paidDuringMonthCents: sum(payments.filter((payment) => payment.paidDate.slice(0, 7) === month).map((payment) => payment.amountCents)),
    remainingTotalDueCents: sum(obligationsDue.map((state) => state.remainingDueCents)),
    overdueObligations: obligationsDue.filter((state) => state.isOverdue),
  }
}
