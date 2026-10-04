import { useId } from 'react'
import type { YearMonth } from '../../domain/models'
import { formatCad } from '../accounts/money'
import { useMonthlyDashboard } from './useMonthlyDashboard'
import './dashboard.css'

const percentageFormatter = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 1 })

/** Navigate date-only months without Date constructors or UTC conversion. */
function adjacentMonth(month: YearMonth, direction: -1 | 1): YearMonth | undefined {
  const [year, calendarMonth] = month.split('-').map(Number)
  const index = year * 12 + calendarMonth - 1 + direction
  if (index < 12 || index > 9999 * 12 + 11) return undefined
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`
}

export function DashboardSection() {
  const prefix = useId()
  const { month, selectMonth, reload, isLoading, summary, loadError } = useMonthlyDashboard()
  const previousMonth = adjacentMonth(month, -1)
  const nextMonth = adjacentMonth(month, 1)

  return (
    <section className="dashboard-section" aria-labelledby="dashboard-heading">
      <h2 id="dashboard-heading">Dashboard</h2>
      <p>Your monthly income and spending, in CAD. Transfers are excluded.</p>
      <div className="dashboard-month-controls">
        <button type="button" aria-label="Previous month" disabled={!previousMonth}
          onClick={() => { if (previousMonth) selectMonth(previousMonth) }}>Previous</button>
        <div className="dashboard-month-field">
          <label htmlFor={`${prefix}-month`}>Month</label>
          <input id={`${prefix}-month`} type="month" value={month} min="0001-01" max="9999-12" required
            onChange={(event) => {
              if (event.currentTarget.value && event.currentTarget.validity.valid) selectMonth(event.currentTarget.value)
            }} />
        </div>
        <button type="button" aria-label="Next month" disabled={!nextMonth}
          onClick={() => { if (nextMonth) selectMonth(nextMonth) }}>Next</button>
        <button type="button" disabled={isLoading} onClick={reload}>Refresh</button>
      </div>
      <div aria-busy={isLoading}>
        {isLoading && <p className="dashboard-status" role="status">Loading dashboard for {month}...</p>}
        {loadError && <p className="dashboard-error" role="alert">{loadError}</p>}
        {summary && (
          <>
            <dl className="dashboard-summary" aria-label={`Monthly totals for ${month}`}>
              <div><dt>Total Expenses</dt><dd>{formatCad(summary.expenses)}</dd></div>
              <div><dt>Total Income</dt><dd>{formatCad(summary.income)}</dd></div>
              <div>
                <dt>Net Cash Flow</dt>
                <dd>
                  {formatCad(summary.netCashFlow)}
                  <span className="dashboard-net-note">{summary.netCashFlow < 0
                    ? 'Expenses exceeded income.'
                    : summary.netCashFlow > 0 ? 'Income exceeded expenses.' : 'Income and expenses are equal.'}</span>
                </dd>
              </div>
            </dl>
            <section className="dashboard-breakdown" aria-labelledby={`${prefix}-categories-heading`}>
              <h3 id={`${prefix}-categories-heading`}>Expenses by category</h3>
              {summary.hasUnknownCategories && <p className="dashboard-warning" role="status">Some expense categories could not be found. Their spending is included under "Unknown category". Review Categories and transaction history.</p>}
              {summary.categorySpending.length === 0 ? (
                <p className="dashboard-empty">No expense spending for {month}. Expenses by category will appear here when you record an expense in this month.</p>
              ) : (
                <table className="dashboard-category-table">
                  <caption>Spending for {month}, largest amount first. Shares are rounded to one decimal place.</caption>
                  <thead><tr><th scope="col">Category</th><th scope="col">Amount</th><th scope="col">Share</th></tr></thead>
                  <tbody>
                    {summary.categorySpending.map((category) => (
                      <tr key={category.categoryId}>
                        <th scope="row">{category.name}</th>
                        <td>{formatCad(category.amount)}</td>
                        <td>{percentageFormatter.format(category.percentage)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>
    </section>
  )
}
