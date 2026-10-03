import type { ExpenseTransaction } from '../../domain/models'

/** Use local calendar fields, never an ISO/UTC timestamp, for date-only values. */
export function localCalendarDate(today = new Date()): string {
  const year = String(today.getFullYear()).padStart(4, '0')
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** IDs provide a stable tie-breaker; the model has no creation timestamp. */
export function compareExpenses(left: ExpenseTransaction, right: ExpenseTransaction): number {
  if (left.date !== right.date) return left.date > right.date ? -1 : 1
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0
}

export function expenseWriteError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.startsWith('Account does not exist:')) {
      return 'The selected account no longer exists. Refresh the transactions section and choose an existing account.'
    }
    if (error.message.startsWith('Category does not exist:')
      || error.message === 'Transaction and category types must match.') {
      return 'The selected category is no longer an available expense category. Refresh the transactions section and choose an expense category.'
    }
    if (error.message.startsWith('Transaction does not exist:')) {
      return 'This expense no longer exists. Cancel editing and refresh the transaction history.'
    }
    if (error instanceof RangeError) return error.message
    if (error.name === 'ConstraintError') {
      return 'An expense with this ID already exists. Cancel editing and try adding the expense again.'
    }
  }
  return 'The expense could not be saved or deleted. Check that browser storage is available and try again.'
}
