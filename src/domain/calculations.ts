import type {
  Account,
  CreditCardAccount,
  MoneyCents,
  Transaction,
  YearMonth,
} from './models'

function requireSafeCents(value: MoneyCents): MoneyCents {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError('Money must be expressed as safe integer cents.')
  }
  return value
}

function requirePositiveAmount(amount: MoneyCents): MoneyCents {
  requireSafeCents(amount)
  if (amount <= 0) {
    throw new RangeError('Transaction amounts must be positive.')
  }
  return amount
}

function requireValidMonth(month: YearMonth): void {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || month.startsWith('0000')) {
    throw new RangeError('Month must use YYYY-MM format with a year from 0001 to 9999.')
  }
}

/** Positive means available money for bank/cash, debt owed for credit cards. */
export function calculateAccountBalance(
  account: Account,
  transactions: readonly Transaction[],
): MoneyCents {
  let balance = requireSafeCents(account.openingBalance)
  const direction = account.type === 'credit_card' ? -1 : 1

  for (const transaction of transactions) {
    let change: MoneyCents

    if (transaction.type === 'transfer') {
      if (
        transaction.fromAccountId !== account.id &&
        transaction.toAccountId !== account.id
      ) {
        continue
      }
      if (transaction.fromAccountId === transaction.toAccountId) {
        throw new RangeError('A transfer must use two different accounts.')
      }
      const amount = requirePositiveAmount(transaction.amount)
      change = transaction.toAccountId === account.id ? amount : -amount
    } else {
      if (transaction.accountId !== account.id) continue
      const amount = requirePositiveAmount(transaction.amount)
      change = transaction.type === 'income' || transaction.type === 'refund' ? amount : -amount
    }

    balance = requireSafeCents(balance + direction * change)
  }

  return balance
}

/** Undefined means no limit is configured; values are deliberately not clamped. */
export function calculateAvailableCredit(
  account: CreditCardAccount,
  transactions: readonly Transaction[],
): MoneyCents | undefined {
  if (account.creditLimit === undefined) return undefined

  const limit = requireSafeCents(account.creditLimit)
  if (limit < 0) {
    throw new RangeError('Credit limits must be non-negative.')
  }
  return requireSafeCents(limit - calculateAccountBalance(account, transactions))
}

/** Totals are keyed by category ID, preserving user-editable category names. */
export function calculateMonthlyExpensesByCategory(
  transactions: readonly Transaction[],
  month: YearMonth,
): ReadonlyMap<string, MoneyCents> {
  requireValidMonth(month)

  const totals = new Map<string, MoneyCents>()
  for (const transaction of transactions) {
    if ((transaction.type !== 'expense' && transaction.type !== 'refund') || !transaction.date.startsWith(`${month}-`)) {
      continue
    }
    const amount = requirePositiveAmount(transaction.amount)
    totals.set(
      transaction.categoryId,
      requireSafeCents((totals.get(transaction.categoryId) ?? 0) + (transaction.type === 'refund' ? -amount : amount)),
    )
  }
  return totals
}

export function calculateMonthlyTotalExpenses(
  transactions: readonly Transaction[],
  month: YearMonth,
): MoneyCents {
  let total = 0
  for (const amount of calculateMonthlyExpensesByCategory(transactions, month).values()) {
    total = requireSafeCents(total + amount)
  }
  return total
}

/** Income only, matching the stored calendar month without timezone conversion. */
export function calculateMonthlyTotalIncome(
  transactions: readonly Transaction[],
  month: YearMonth,
): MoneyCents {
  requireValidMonth(month)
  let total = 0
  for (const transaction of transactions) {
    if (transaction.type !== 'income' || !transaction.date.startsWith(`${month}-`)) {
      continue
    }
    total = requireSafeCents(total + requirePositiveAmount(transaction.amount))
  }
  return total
}
