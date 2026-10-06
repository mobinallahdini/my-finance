import type { MoneyCents } from '../../domain/models'
import type { CategorySpending } from './useMonthlyDashboard'

export interface SpendingSlice {
  readonly key: string
  readonly name: string
  readonly amount: MoneyCents
  readonly percentage: number
  readonly isOther: boolean
}

/** Presentation only: negative category nets have no slice; financial totals remain signed. */
export function spendingDonutTotal(categories: readonly Pick<CategorySpending, 'amount'>[]): MoneyCents {
  let total = 0
  for (const category of categories) {
    if (!Number.isSafeInteger(category.amount)) throw new RangeError('Category spending must be safe integer cents.')
    total += Math.max(0, category.amount)
    if (!Number.isSafeInteger(total)) throw new RangeError('Chart total must be safe integer cents.')
  }
  return total
}

/** Presentation grouping only: inputs are the dashboard's already-derived category totals. */
export function spendingDonutSlices(categories: readonly CategorySpending[], total: MoneyCents): SpendingSlice[] {
  const sorted = categories.filter(category => category.amount > 0)
    .map(category => ({ ...category, percentage: total === 0 ? 0 : category.amount / total * 100 }))
    .sort((a, b) => b.amount - a.amount || (a.categoryId < b.categoryId ? -1 : a.categoryId > b.categoryId ? 1 : 0))
  let named = sorted.slice(0, 5)
  const unknown = sorted.find(category => category.isUnknown)
  // Keep unresolved historical spending identifiable rather than hiding every Unknown label in Other.
  if (unknown && !named.some(category => category.isUnknown)) named = [...sorted.slice(0, 4), unknown]
  const namedIds = new Set(named.map(category => category.categoryId))
  const remaining = sorted.filter(category => !namedIds.has(category.categoryId))
  const slices = named.map(category => ({ key: `category:${category.categoryId}`, name: category.name,
    amount: category.amount, percentage: category.percentage, isOther: false }))
  if (remaining.length) {
    // This only combines existing category amounts; the supplied monthly total stays authoritative.
    const amount = remaining.reduce((sum, category) => sum + category.amount, 0)
    slices.push({ key: 'other', name: 'Other', amount, percentage: total === 0 ? 0 : amount / total * 100, isOther: true })
  }
  return slices
}

const percentageFormatter = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 1 })
export function spendingPercentage(percentage: number): string {
  return `${percentageFormatter.format(percentage)}%`
}

/** Floating-point percentages only affect SVG geometry, never amounts or stored data. */
export function spendingDonutSegments(slices: readonly SpendingSlice[]) {
  let offset = 0
  return slices.map((slice, index) => {
    const length = Math.min(100 - offset, Math.max(0, index === slices.length - 1 ? 100 - offset : slice.percentage))
    const segment = { key: slice.key, length, offset }
    offset += length
    return segment
  })
}
