import { useMoney } from '../financeSettings/useMoney'
import { useId, useState } from 'react'
import type { YearMonth } from '../../domain/models'
import { useMonthlyDashboard } from './useMonthlyDashboard'
import { RecentActivity } from './RecentActivity'
import { SpendingDonutChart } from './SpendingDonutChart'
import { UpcomingPayments } from './UpcomingPayments'
import './dashboard.css'

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Navigate date-only months without Date constructors or UTC conversion. */
function adjacentMonth(month: YearMonth, direction: -1 | 1): YearMonth | undefined {
  const [year, calendarMonth] = month.split('-').map(Number)
  const index = year * 12 + calendarMonth - 1 + direction
  if (index < 12 || index > 9999 * 12 + 11) return undefined
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`
}

export function DashboardSection() {
  const { formatAmount, currencyCode } = useMoney()
  const prefix = useId()
  const { month, selectMonth, reload, isLoading, summary, loadError, recentActivity, activityError } = useMonthlyDashboard()
  const [isMonthPickerOpen, setMonthPickerOpen] = useState(false)
  const previousMonth = adjacentMonth(month, -1)
  const nextMonth = adjacentMonth(month, 1)
  const readableMonth = `${monthNames[Number(month.slice(5)) - 1]} ${Number(month.slice(0, 4))}`

  function changeMonth(next: YearMonth) {
    selectMonth(next)
  }

  return (
    <section className="dashboard-section" aria-labelledby="dashboard-heading">
      <div className="dashboard-home-header">
        <h2 id="dashboard-heading" tabIndex={-1}>Home</h2>
        <div className="dashboard-month-controls" role="group" aria-label="Month navigation">
          <button className="button-quiet dashboard-month-arrow" type="button" aria-label="Previous month" disabled={!previousMonth}
            onClick={() => { if (previousMonth) changeMonth(previousMonth) }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
              aria-hidden="true" focusable="false"><path d="m15 5-7 7 7 7" /></svg>
          </button>
          <button className="button-quiet dashboard-month-label" type="button" aria-label={`Choose month, ${readableMonth}`}
            aria-expanded={isMonthPickerOpen} aria-controls={`${prefix}-month-picker`}
            onClick={() => setMonthPickerOpen((open) => !open)}>
            <span aria-live="polite" aria-atomic="true">{readableMonth}</span>
          </button>
          <button className="button-quiet dashboard-month-arrow" type="button" aria-label="Next month" disabled={!nextMonth}
            onClick={() => { if (nextMonth) changeMonth(nextMonth) }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
              aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7" /></svg>
          </button>
        </div>
      </div>
      <div id={`${prefix}-month-picker`} className="dashboard-month-field" hidden={!isMonthPickerOpen}>
        <label htmlFor={`${prefix}-month`}>Choose month</label>
        <input id={`${prefix}-month`} type="month" value={month} min="0001-01" max="9999-12" required
          onChange={(event) => {
            if (event.currentTarget.value && event.currentTarget.validity.valid) changeMonth(event.currentTarget.value)
          }} />
      </div>
      <div aria-busy={isLoading}>
        {isLoading && <p className="dashboard-status" role="status">Loading summary for {readableMonth}...</p>}
        {loadError && <div className="dashboard-recovery">
          <p className="dashboard-error" role="alert">{loadError}</p>
          <button type="button" disabled={isLoading} onClick={reload}>Refresh / Retry</button>
        </div>}
        {summary && (
          <>
            <div className="dashboard-summary" role="group" aria-label={`Monthly totals for ${readableMonth}, in ${currencyCode}`}>
              <dl className="dashboard-net">
                <dt>Net cash flow</dt>
                <dd className="dashboard-net-value">
                  <span className="dashboard-net-amount">{summary.netCashFlow > 0 ? '+' : ''}{formatAmount(summary.netCashFlow)}</span>
                  <span className="dashboard-net-note">{summary.netCashFlow < 0
                    ? `Expenses exceed income by ${formatAmount(-summary.netCashFlow)}`
                    : summary.netCashFlow > 0 ? `Ahead by ${formatAmount(summary.netCashFlow)} this month` : 'Income and expenses are balanced'}</span>
                </dd>
              </dl>
              <dl className="dashboard-supporting">
                <div><dt>Income</dt><dd>+{formatAmount(summary.income)}</dd></div>
                <div><dt>Expenses</dt><dd>{formatAmount(summary.expenses)}</dd></div>
              </dl>
            </div>
            <div className="dashboard-details">
              <section className="dashboard-breakdown" aria-labelledby={`${prefix}-categories-heading`}>
                <h3 id={`${prefix}-categories-heading`}>Spending by category</h3>
                <p className="dashboard-category-caption">Largest first · share of positive category spending</p>
                {summary.hasUnknownCategories && <p className="dashboard-warning" role="status">Some expense categories could not be found. Unknown category spending remains included in this breakdown. Review Categories and transaction history.</p>}
                {summary.categorySpending.length === 0 ? (
                  <p className="dashboard-empty">No expenses in {readableMonth}. Your spending breakdown will appear here when you record an expense.</p>
                ) : (
                  <SpendingDonutChart categories={summary.categorySpending} total={summary.expenses} monthLabel={readableMonth} />
                )}
              </section>
              <RecentActivity items={recentActivity} monthLabel={readableMonth} error={activityError} onRetry={reload} />
            </div>
          </>
        )}
      </div>
      <UpcomingPayments month={month} />
    </section>
  )
}
