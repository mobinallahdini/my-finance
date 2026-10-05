import type { Obligation, ObligationPayment } from './models.ts'
import { requireCalendarDate, requireCalendarMonth } from './calendar.ts'

function requireRecord(value: unknown): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new RangeError('An obligation or payment must be a record.')
}
function requireId(id: string): void {
  if (typeof id !== 'string' || !id.trim()) throw new RangeError('IDs must be non-empty strings.')
}
function requireFields(record: object, fields: readonly string[]): void {
  if (Object.keys(record).some((field) => !fields.includes(field))) throw new RangeError('Unsupported or cross-type obligation/payment fields.')
}
function requireNote(note: unknown): void {
  if (note !== undefined && typeof note !== 'string') throw new RangeError('Note must be a string when supplied.')
}
export function requirePositiveObligationCents(amount: number): void {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new RangeError('Obligation and payment amounts must be positive safe integer cents.')
}
export function requireDueDay(dueDay: number): void {
  if (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31) throw new RangeError('Due day must be an integer from 1 to 31.')
}

export function validateObligation(obligation: Obligation): void {
  requireRecord(obligation)
  requireId(obligation.id)
  if (typeof obligation.name !== 'string' || !obligation.name.trim() || obligation.name !== obligation.name.trim()) {
    throw new RangeError('Obligation name must be non-empty and trimmed.')
  }
  requireDueDay(obligation.dueDay)
  requireCalendarMonth(obligation.startMonth)
  if (typeof obligation.isActive !== 'boolean') throw new RangeError('isActive must be a boolean.')
  requireNote(obligation.note)
  const shared = ['id', 'type', 'name', 'dueDay', 'startMonth', 'note', 'isActive']
  if (obligation.type === 'bill') {
    requireFields(obligation, [...shared, 'expectedAmountCents'])
    requirePositiveObligationCents(obligation.expectedAmountCents)
  } else if (obligation.type === 'installment') {
    requireFields(obligation, [...shared, 'originalAmountCents', 'scheduledPaymentCents'])
    requirePositiveObligationCents(obligation.originalAmountCents)
    requirePositiveObligationCents(obligation.scheduledPaymentCents)
  } else throw new RangeError('Invalid obligation type.')
}

/** Shape validation is pure; reference validation is shared by calculations and repositories. */
export function validateObligationPayment(payment: ObligationPayment): void {
  requireRecord(payment)
  requireFields(payment, ['id', 'obligationId', 'dueMonth', 'paidDate', 'amountCents', 'note'])
  requireId(payment.id)
  requireId(payment.obligationId)
  requireCalendarMonth(payment.dueMonth)
  requireCalendarDate(payment.paidDate)
  requirePositiveObligationCents(payment.amountCents)
  requireNote(payment.note)
}

export function validateObligationPaymentReference(payment: ObligationPayment, obligation: Obligation | undefined): void {
  if (!obligation || obligation.id !== payment.obligationId) throw new Error(`Obligation does not exist: ${payment.obligationId}`)
  if (payment.dueMonth < obligation.startMonth) throw new RangeError('Payment due month cannot precede the obligation start month.')
  // paidDate may be before or after dueMonth; inactive records can receive historical corrections.
}
