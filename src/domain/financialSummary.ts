import type { MoneyCents, Transaction } from './models.ts'
import { requirePositiveAmount, requireSafeCents } from './money.ts'

export interface FinancialSummary {
  readonly grossExpensesCents: MoneyCents
  readonly refundsCents: MoneyCents
  readonly netExpensesCents: MoneyCents
  readonly totalIncomeCents: MoneyCents
  /** Income minus net Expenses; includes card purchases and excludes Transfers. */
  readonly netCashFlowCents: MoneyCents
  readonly transferVolumeCents: MoneyCents
  readonly transactionCount: number
  readonly expenseCount: number
  readonly refundCount: number
  readonly incomeCount: number
  readonly transferCount: number
}

type SummaryScope = 'all' | 'expenses' | 'income'

/**
 * One reducer owns transaction-type semantics. Restricted scopes preserve the
 * monthly APIs' validation boundaries: unrelated types are never accumulated.
 */
function reduceFinancialTransactions(transactions: readonly Transaction[], scope: SummaryScope) {
  let grossExpensesCents = 0, refundsCents = 0, totalIncomeCents = 0, transferVolumeCents = 0
  let expenseCount = 0, refundCount = 0, incomeCount = 0, transferCount = 0
  const expensesByCategory = new Map<string, MoneyCents>()
  for (const transaction of transactions) {
    const spending = transaction.type === 'expense' || transaction.type === 'refund'
    if ((scope === 'expenses' && !spending) || (scope === 'income' && transaction.type !== 'income')) continue
    const amount = requirePositiveAmount(transaction.amount)
    if (scope === 'expenses') {
      // Preserve signed category accumulation and its existing overflow checks.
      if (transaction.type === 'expense' || transaction.type === 'refund') {
        expensesByCategory.set(transaction.categoryId, requireSafeCents(
          (expensesByCategory.get(transaction.categoryId) ?? 0) + (transaction.type === 'refund' ? -amount : amount),
        ))
      }
      continue
    }
    switch (transaction.type) {
      case 'expense':
        grossExpensesCents = requireSafeCents(grossExpensesCents + amount)
        expenseCount++
        break
      case 'refund':
        refundsCents = requireSafeCents(refundsCents + amount)
        refundCount++
        break
      case 'income':
        totalIncomeCents = requireSafeCents(totalIncomeCents + amount)
        incomeCount++
        break
      case 'transfer':
        transferVolumeCents = requireSafeCents(transferVolumeCents + amount)
        transferCount++
        break
      default:
        throw new RangeError('Invalid transaction type.')
    }
  }
  return { totals: { grossExpensesCents, refundsCents, totalIncomeCents, transferVolumeCents,
    expenseCount, refundCount, incomeCount, transferCount }, expensesByCategory }
}

/** Valid ledger inputs contain each transaction once; tax is already in amount. */
export function calculateFinancialSummary(transactions: readonly Transaction[]): FinancialSummary {
  const { totals } = reduceFinancialTransactions(transactions, 'all')
  const netExpensesCents = requireSafeCents(totals.grossExpensesCents - totals.refundsCents)
  return Object.freeze({ ...totals, netExpensesCents,
    netCashFlowCents: calculateNetCashFlow(totals.totalIncomeCents, netExpensesCents),
    transactionCount: transactions.length })
}

/** Shared with monthly spending; signed zero/negative categories remain present. */
export function calculateExpensesByCategory(transactions: readonly Transaction[]): ReadonlyMap<string, MoneyCents> {
  return reduceFinancialTransactions(transactions, 'expenses').expensesByCategory
}

export function calculateTotalIncome(transactions: readonly Transaction[]): MoneyCents {
  return reduceFinancialTransactions(transactions, 'income').totals.totalIncomeCents
}

/** This reporting metric is not the balance change of a selected bank account. */
export function calculateNetCashFlow(income: MoneyCents, netExpenses: MoneyCents): MoneyCents {
  requireSafeCents(income)
  requireSafeCents(netExpenses)
  const result = income - netExpenses
  if (!Number.isSafeInteger(result)) throw new RangeError('Net cash flow must be safe integer cents.')
  return result
}
