import type { ExpenseTransaction, MoneyCents, Transaction } from './models'

export const receiptNumberMaxLength = 200

/** Surrounding whitespace is presentation noise; punctuation and internal spacing are meaningful. */
export function normalizeReceiptNumber(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new RangeError('Receipt number must be text.')
  const receipt = value.trim()
  if (receipt.length > receiptNumberMaxLength) throw new RangeError(`Receipt number must be ${receiptNumberMaxLength} characters or fewer.`)
  return receipt || undefined
}

/** Tax is included in the total paid, never an additional charge. */
export function validateExpenseDetails(transaction: Transaction): void {
  if (transaction.type !== 'expense') {
    if (Object.hasOwn(transaction, 'taxAmountCents') || Object.hasOwn(transaction, 'receiptNumber')) {
      throw new RangeError('Tax / VAT and receipt number are only allowed for Expenses.')
    }
    return
  }
  if (transaction.taxAmountCents !== undefined) {
    if (!Number.isSafeInteger(transaction.taxAmountCents) || transaction.taxAmountCents <= 0) {
      throw new RangeError('Tax / VAT must be positive safe integer cents.')
    }
    if (transaction.taxAmountCents > transaction.amount) throw new RangeError('Tax / VAT must not exceed the total Expense amount.')
  }
  normalizeReceiptNumber(transaction.receiptNumber)
}

/** Only derived for an Expense with tax; never stored or used for balance calculations. */
export function expenseSubtotal(transaction: ExpenseTransaction): MoneyCents | undefined {
  validateExpenseDetails(transaction)
  return transaction.taxAmountCents === undefined ? undefined : transaction.amount - transaction.taxAmountCents
}

export function normalizeExpenseDetails(transaction: Transaction): Transaction {
  validateExpenseDetails(transaction)
  if (transaction.type !== 'expense') return transaction
  const { taxAmountCents, receiptNumber, ...record } = transaction
  const receipt = normalizeReceiptNumber(receiptNumber)
  return { ...record, ...(taxAmountCents === undefined ? {} : { taxAmountCents }), ...(receipt === undefined ? {} : { receiptNumber: receipt }) }
}
