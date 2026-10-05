import type { Account, Category, Transaction, YearMonth } from '../domain/models'

export function requireId(id: string): void {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new RangeError('IDs must be non-empty strings.')
  }
}

function requireSafeCents(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError('Money must be expressed as safe integer cents.')
  }
}

export function validateAccount(account: Account): void {
  requireId(account.id)
  requireSafeCents(account.openingBalance)
  if (!['bank', 'cash', 'credit_card'].includes(account.type)) {
    throw new RangeError('Invalid account type.')
  }
  if (account.creditLimit !== undefined) {
    if (account.type !== 'credit_card') {
      throw new RangeError('Only credit cards may have a credit limit.')
    }
    requireSafeCents(account.creditLimit)
    if (account.creditLimit < 0) {
      throw new RangeError('Credit limits must be non-negative.')
    }
  }
}

export function validateCategory(category: Category): void {
  requireId(category.id)
  if (category.type !== 'expense' && category.type !== 'income') {
    throw new RangeError('Invalid category type.')
  }
}

export function validateMonth(month: YearMonth): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith('0000')) {
    throw new RangeError('Month must use YYYY-MM format with a year from 0001 to 9999.')
  }
}

function validateDate(date: string): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date)) {
    throw new RangeError('Date must be a valid calendar date in YYYY-MM-DD format.')
  }
  validateMonth(date.slice(0, 7))
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  const day = Number(date.slice(8, 10))
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (day < 1 || day > days[month - 1]) {
    throw new RangeError('Date must be a valid calendar date in YYYY-MM-DD format.')
  }
}

export function validateTransaction(transaction: Transaction): void {
  requireId(transaction.id)
  requireSafeCents(transaction.amount)
  if (transaction.amount <= 0) {
    throw new RangeError('Transaction amounts must be positive.')
  }
  validateDate(transaction.date)
  if (transaction.type === 'transfer') {
    requireId(transaction.fromAccountId)
    requireId(transaction.toAccountId)
    if (transaction.fromAccountId === transaction.toAccountId) {
      throw new RangeError('A transfer must use two different accounts.')
    }
    if (transaction.accountId !== undefined || transaction.categoryId !== undefined) {
      throw new RangeError('Transfers cannot have an accountId or categoryId.')
    }
  } else if (transaction.type === 'expense' || transaction.type === 'income') {
    requireId(transaction.accountId)
    requireId(transaction.categoryId)
    if (transaction.fromAccountId !== undefined || transaction.toAccountId !== undefined) {
      throw new RangeError('Expenses and income cannot have transfer account fields.')
    }
  } else {
    throw new RangeError('Invalid transaction type.')
  }
}

/** One reference policy for normal writes, validated restores, and CSV imports. */
export function validateTransactionReferences(
  transaction: Transaction,
  accounts: ReadonlyMap<string, Account>,
  categories: ReadonlyMap<string, Category>,
): void {
  function account(id: string) {
    const record = accounts.get(id)
    if (!record) throw new Error(`Account does not exist: ${id}`)
    return record
  }
  if (transaction.type === 'transfer') {
    account(transaction.fromAccountId)
    account(transaction.toAccountId)
  } else {
    const target = account(transaction.accountId)
    if (transaction.type === 'income' && target.type !== 'bank' && target.type !== 'cash') {
      throw new RangeError('Income must target a bank or cash account. Credit-card payments must be recorded as transfers.')
    }
    const category = categories.get(transaction.categoryId)
    if (!category) throw new Error(`Category does not exist: ${transaction.categoryId}`)
    if (category.type !== transaction.type) throw new Error('Transaction and category types must match.')
  }
}
