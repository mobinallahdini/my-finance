import { useId, useState } from 'react'
import type { YearMonth } from '../../domain/models'
import { formatCad } from '../accounts/money'
import { useMonthlyDashboard } from './useMonthlyDashboard'
import { RecentActivity } from './RecentActivity'
import { UpcomingPayments } from './UpcomingPayments'
import './dashboard.css'

const percentageFormatter = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 1 })
const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** Navigate date-only months without Date constructors or UTC conversion. */
function adjacentMonth(month: YearMonth, direction: -1 | 1): YearMonth | undefined {
  const [year, calendarMonth] = month.split('-').map(Number)
  const index = year * 12 + calendarMonth - 1 + direction
  if (index < 12 || index > 9999 * 12 + 11) return undefined
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`
}

export function DashboardSection() {
  const prefix = useId()
  const { month, selectMonth, reload, isLoading, summary, loadError, recentActivity, activityError } = useMonthlyDashboard()
  const [isMonthPickerOpen, setMonthPickerOpen] = useState(false)
  const [expandedMonth, setExpandedMonth] = useState<YearMonth | null>(null)
  const previousMonth = adjacentMonth(month, -1)
  const nextMonth = adjacentMonth(month, 1)
  const readableMonth = `${monthNames[Number(month.slice(5)) - 1]} ${Number(month.slice(0, 4))}`
  const showAllCategories = expandedMonth === month
  const visibleCategories = summary?.categorySpending.slice(0, showAllCategories ? undefined : 5) ?? []

  function changeMonth(next: YearMonth) {
    setExpandedMonth(null)
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
            <div className="dashboard-summary" role="group" aria-label={`Monthly totals for ${readableMonth}, in CAD`}>
              <dl className="dashboard-net">
                <dt>Net cash flow</dt>
                <dd className="dashboard-net-value">
                  <span className="dashboard-net-amount">{summary.netCashFlow > 0 ? '+' : ''}{formatCad(summary.netCashFlow)}</span>
                  <span className="dashboard-net-note">{summary.netCashFlow < 0
                    ? `Expenses exceed income by ${formatCad(-summary.netCashFlow)}`
                    : summary.netCashFlow > 0 ? `Ahead by ${formatCad(summary.netCashFlow)} this month` : 'Income and expenses are balanced'}</span>
                </dd>
              </dl>
              <dl className="dashboard-supporting">
                <div><dt>Income</dt><dd>+{formatCad(summary.income)}</dd></div>
                <div><dt>Expenses</dt><dd>{formatCad(summary.expenses)}</dd></div>
              </dl>
            </div>
            <div className="dashboard-details">
              <section className="dashboard-breakdown" aria-labelledby={`${prefix}-categories-heading`}>
                <h3 id={`${prefix}-categories-heading`}>Spending by category</h3>
                <p className="dashboard-category-caption">Largest first · share of monthly expenses</p>
                {summary.hasUnknownCategories && <p className="dashboard-warning" role="status">Some expense categories could not be found. Their spending is included under "Unknown category". Review Categories and transaction history.</p>}
                {summary.categorySpending.length === 0 ? (
                  <p className="dashboard-empty">No expenses in {readableMonth}. Your spending breakdown will appear here when you record an expense.</p>
                ) : (
                  <>
                    <ul id={`${prefix}-category-list`} className="dashboard-category-list" aria-label={`Spending for ${readableMonth}`}>
                      {visibleCategories.map((category) => (
                        <li key={category.categoryId} className="dashboard-category-row">
                          <div className="dashboard-category-details">
                            <span className="dashboard-category-name">{category.name}</span>
                            <span className="dashboard-category-amount">{formatCad(category.amount)}</span>
                          </div>
                          <div className="dashboard-category-share">
                            <span className="dashboard-category-track" aria-hidden="true">
                              <span style={{ width: `${Math.min(100, Math.max(0, category.percentage))}%` }} />
                            </span>
                            <span className="dashboard-category-percentage">{percentageFormatter.format(category.percentage)}%</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                    {summary.categorySpending.length > 5 && <button className="button-quiet dashboard-show-categories" type="button"
                      aria-expanded={showAllCategories} aria-controls={`${prefix}-category-list`}
                      onClick={() => setExpandedMonth(showAllCategories ? null : month)}>
                      {showAllCategories ? 'Show less' : `Show all ${summary.categorySpending.length} categories`}
                    </button>}
                  </>
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
