import { calendarDayNumber } from '../../domain/calendar'
import type { ObligationMonthState } from '../../domain/obligationCalculations'
import type { Obligation, ObligationPayment } from '../../domain/models'
import { calculateObligationMonth } from '../../domain/obligationCalculations'

const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export function monthLabel(month: string) {
  return `${months[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)}`
}
export function dateLabel(date: string) {
  return `${months[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`
}
export function statusLabel(state: ObligationMonthState, today: string) {
  switch (state.status) {
    case 'due_soon': {
      const days = calendarDayNumber(state.dueDate!) - calendarDayNumber(today)
      return `Due in ${days} ${days === 1 ? 'day' : 'days'}`
    }
    case 'due_today': return 'Due today'
    case 'partially_paid': return state.isOverdue ? 'Partially paid · Overdue' : 'Partially paid'
    case 'paid': return 'Paid'
    case 'completed': return 'Completed'
    case 'inactive': return 'Inactive'
    case 'overdue': return 'Overdue'
    default: return 'Upcoming'
  }
}
export function paymentDefault(obligation: Obligation, payments: readonly ObligationPayment[], month: string, today: string) {
  const dueMonth = month < obligation.startMonth ? obligation.startMonth : month
  const state = calculateObligationMonth(obligation, payments, dueMonth, today)
  return { dueMonth, amountCents: obligation.type === 'bill'
    ? Math.max(0, obligation.expectedAmountCents - state.paidAmountCents)
    : Math.min(obligation.scheduledPaymentCents, state.installmentBalance!.remainingAmountCents) }
}
export function writeError(error: unknown) {
  return error instanceof Error ? error.message : 'Could not save changes. Please try again.'
}
