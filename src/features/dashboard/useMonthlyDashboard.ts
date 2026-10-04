import { useCallback, useEffect, useState } from 'react'
import {
  calculateMonthlyExpensesByCategory,
  calculateMonthlyTotalExpenses,
  calculateMonthlyTotalIncome,
} from '../../domain/calculations'
import type { MoneyCents, YearMonth } from '../../domain/models'
import { categoriesRepository, transactionsRepository } from '../../persistence/repositories'
import { useDataRefresh } from '../shared/dataRefresh'
import { localCalendarDate } from '../transactions/transactionHelpers'

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

interface DashboardResult {
  readonly month: YearMonth
  readonly version: number
  readonly summary: MonthlySummary | null
  readonly error: string | null
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
        const [transactions, categories] = await Promise.all([
          transactionsRepository.getForMonth(month),
          categoriesRepository.getAll(),
        ])
        if (!active) return

        const expenses = calculateMonthlyTotalExpenses(transactions, month)
        const income = calculateMonthlyTotalIncome(transactions, month)
        const netCashFlow = income - expenses
        if (!Number.isSafeInteger(netCashFlow)) {
          throw new RangeError('Net cash flow must be safe integer cents.')
        }

        const categoryNames = new Map(categories.map((category) => [category.id, category.name]))
        const categorySpending = Array.from(calculateMonthlyExpensesByCategory(transactions, month), ([categoryId, amount]) => ({
          categoryId,
          name: categoryNames.get(categoryId) ?? 'Unknown category',
          amount,
          // Percentages are display values only; money remains integer cents.
          percentage: expenses === 0 ? 0 : amount / expenses * 100,
          isUnknown: !categoryNames.has(categoryId),
        })).sort((left, right) => (
          right.amount - left.amount || (left.categoryId < right.categoryId ? -1 : left.categoryId > right.categoryId ? 1 : 0)
        ))

        setResult({
          month,
          version: loadVersion,
          summary: { expenses, income, netCashFlow, categorySpending, hasUnknownCategories: categorySpending.some((category) => category.isUnknown) },
          error: null,
        })
      } catch (error) {
        if (!active) return
        setResult({
          month,
          version: loadVersion,
          summary: null,
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
  }
}
