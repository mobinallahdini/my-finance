import { useCallback, useEffect, useState } from 'react'
import {
  calculateMonthlyExpensesByCategory,
  calculateMonthlyTotalExpenses,
  calculateMonthlyTotalIncome,
} from '../../domain/calculations'
import type { MoneyCents, Transaction, YearMonth } from '../../domain/models'
import { accountsRepository, categoriesRepository, transactionsRepository } from '../../persistence/repositories'
import { useDataRefresh } from '../shared/dataRefresh'
import { compareTransactions, localCalendarDate } from '../transactions/transactionHelpers'
import { spendingDonutTotal } from './spendingDonut'

export interface CategorySpending {
  readonly categoryId: string
  readonly name: string
  readonly amount: MoneyCents
  readonly percentage: number
  readonly isUnknown: boolean
}

export interface MonthlySummary {
  readonly expenses: MoneyCents
  readonly income: MoneyCents
  readonly netCashFlow: MoneyCents
  readonly categorySpending: readonly CategorySpending[]
  readonly hasUnknownCategories: boolean
}

export interface RecentActivityItem {
  readonly id: string
  readonly type: Transaction['type']
  readonly amount: MoneyCents
  readonly title: string
  readonly accountDescription: string
  readonly transferDescription?: string
}

interface DashboardResult {
  readonly month: YearMonth
  readonly version: number
  readonly summary: MonthlySummary | null
  readonly error: string | null
  readonly recentActivity: readonly RecentActivityItem[]
  readonly activityError: string | null
}

export function useMonthlyDashboard() {
  const [month, setMonth] = useState(() => localCalendarDate().slice(0, 7))
  const [loadVersion, setLoadVersion] = useState(0)
  const [result, setResult] = useState<DashboardResult | null>(null)

  const reload = useCallback(() => {
    setLoadVersion((version) => version + 1)
  }, [])

  const selectMonth = useCallback((nextMonth: YearMonth) => {
    setMonth(nextMonth)
    // A fresh version also covers returning to a month before its prior read finishes.
    setLoadVersion((version) => version + 1)
  }, [])

  useDataRefresh(reload)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const [transactions, categories, accounts] = await Promise.all([
          transactionsRepository.getForMonth(month),
          categoriesRepository.getAll(),
          // An account-name read failure must not hide the financial summary.
          accountsRepository.getAll().catch(() => null),
        ])
        if (!active) return

        const expenses = calculateMonthlyTotalExpenses(transactions, month)
        const income = calculateMonthlyTotalIncome(transactions, month)
        const netCashFlow = income - expenses
        if (!Number.isSafeInteger(netCashFlow)) {
          throw new RangeError('Net cash flow must be safe integer cents.')
        }

        const categoryNames = new Map(categories.map((category) => [category.id, category.name]))
        const accountNames = new Map(accounts?.map((account) => [account.id, account.name]))
        const accountName = (id: string) => accountNames.get(id) ?? 'Unknown account'
        const recentActivity: RecentActivityItem[] = [...transactions].sort(compareTransactions).slice(0, 3).map((transaction) => {
          const base = { id: transaction.id, type: transaction.type, amount: transaction.amount }
          if (transaction.type === 'transfer') {
            const from = accountName(transaction.fromAccountId)
            const to = accountName(transaction.toAccountId)
            return { ...base, title: 'Transfer', accountDescription: `${from} → ${to}`, transferDescription: `From ${from} to ${to}` }
          }
          return { ...base, title: categoryNames.get(transaction.categoryId) ?? 'Unknown category', accountDescription: accountName(transaction.accountId) }
        })
        const categoryTotals = calculateMonthlyExpensesByCategory(transactions, month)
        const chartTotal = spendingDonutTotal(Array.from(categoryTotals, ([, amount]) => ({ amount })))
        if (!Number.isSafeInteger(chartTotal - expenses)) throw new RangeError('Excess refunds must be safe integer cents.')
        const categorySpending = Array.from(categoryTotals, ([categoryId, amount]) => ({
          categoryId,
          name: categoryNames.get(categoryId) ?? 'Unknown category',
          amount,
          // Percentages are display values only; money remains integer cents.
          percentage: chartTotal === 0 ? 0 : Math.max(0, amount) / chartTotal * 100,
          isUnknown: !categoryNames.has(categoryId),
        })).sort((left, right) => (
          right.amount - left.amount || (left.categoryId < right.categoryId ? -1 : left.categoryId > right.categoryId ? 1 : 0)
        ))

        setResult({
          month,
          version: loadVersion,
          summary: { expenses, income, netCashFlow, categorySpending, hasUnknownCategories: categorySpending.some((category) => category.isUnknown) },
          error: null,
          recentActivity,
          activityError: accounts === null ? 'Account names could not be loaded from browser storage.' : null,
        })
      } catch (error) {
        if (!active) return
        setResult({
          month,
          version: loadVersion,
          summary: null,
          recentActivity: [],
          activityError: null,
          error: error instanceof RangeError
            ? 'The monthly totals could not be calculated safely. Review the recorded transaction amounts, then use Refresh to retry.'
            : 'The dashboard could not be loaded from browser storage. Check that IndexedDB is available, then use Refresh to retry.',
        })
      }
    }

    void load()
    return () => { active = false }
  }, [month, loadVersion])

  // Old values disappear immediately on selection/refresh, before the effect runs.
  const currentResult = result?.month === month && result.version === loadVersion ? result : null
  return {
    month,
    selectMonth,
    reload,
    isLoading: currentResult === null,
    summary: currentResult?.summary ?? null,
    loadError: currentResult?.error ?? null,
    recentActivity: currentResult?.recentActivity ?? [],
    activityError: currentResult?.activityError ?? null,
  }
}
