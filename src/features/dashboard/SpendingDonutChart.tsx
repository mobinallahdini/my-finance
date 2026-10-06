import type { MoneyCents } from '../../domain/models'
import { useMoney } from '../financeSettings/useMoney'
import type { CategorySpending } from './useMonthlyDashboard'
import { spendingDonutSegments, spendingDonutSlices, spendingDonutTotal, spendingPercentage } from './spendingDonut'

export function SpendingDonutChart({ categories, total, monthLabel }: {
  categories: readonly CategorySpending[]
  total: MoneyCents
  monthLabel: string
}) {
  const { formatAmount, currencyCode } = useMoney()
  const chartTotal = spendingDonutTotal(categories)
  const excessRefunds = chartTotal - total
  if (chartTotal === 0) return <p className="dashboard-empty">No positive category spending this month.
    {excessRefunds > 0 && ` Refunds exceed category spending by ${formatAmount(excessRefunds)}. Net Expenses are ${formatAmount(total)}.`}</p>
  const slices = spendingDonutSlices(categories, chartTotal)
  const segments = spendingDonutSegments(slices)
  const formattedTotal = formatAmount(chartTotal)

  return (
    <>
    {excessRefunds > 0 && <p className="dashboard-category-caption">Refunds exceed spending in some categories by {formatAmount(excessRefunds)}.
      {' '}The chart shows positive category totals ({formattedTotal}); net Expenses are {formatAmount(total)}.</p>}
    <div className="spending-donut-layout" role="group" aria-label={`Expense distribution for ${monthLabel}, in ${currencyCode}`}>
      <div className="spending-donut-figure">
        <svg className="spending-donut-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
          <circle className="spending-donut-track" cx="50" cy="50" r="45" strokeWidth="10" />
          {segments.map((segment, index) => (
            <circle key={segment.key} className="spending-donut-slice" data-color={index + 1}
              cx="50" cy="50" r="45" strokeWidth="10" pathLength="100"
              strokeDasharray={`${segment.length} ${100 - segment.length}`} strokeDashoffset={-segment.offset}
              transform="rotate(-90 50 50)" />
          ))}
        </svg>
        <dl className={`spending-donut-total${formattedTotal.length > 16 ? ' spending-donut-total-long' : ''}`}>
          <dt>{excessRefunds > 0 ? 'Chart total' : 'Expenses'}</dt>
          <dd>{formattedTotal}</dd>
        </dl>
      </div>
      <ul className="dashboard-category-list spending-donut-legend" aria-label={`Category expenses for ${monthLabel}`}>
        {slices.map((slice, index) => (
          <li key={slice.key} className="dashboard-category-row" data-slice-key={slice.key}>
            <span className="spending-donut-marker" data-color={index + 1} aria-hidden="true" />
            <div className="dashboard-category-details">
              <span className="dashboard-category-name">{slice.name}</span>
              <span className="spending-donut-legend-values">
                <span className="dashboard-category-amount">{formatAmount(slice.amount)}</span>
                <span aria-hidden="true"> · </span>
                <span className="dashboard-category-percentage">{spendingPercentage(slice.percentage)}</span>
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
    </>
  )
}
