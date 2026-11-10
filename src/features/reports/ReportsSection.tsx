import { useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react'
import { prepareFinancialReport } from '../../domain/reporting'
import { createReportFilters, type TransactionFilterState } from '../../domain/transactionQuery'
import { useMoney } from '../financeSettings/useMoney'
import { useLocalToday } from '../shared/useLocalToday'
import { accountTypeLabels } from '../accounts/accountLabels'
import { TransactionFilterPanel } from '../transactions/TransactionFilterPanel'
import { filterChips, removeFilterGroup } from '../transactions/transactionFiltering'
import { reportColumns, defaultReportColumns, reportPeriod, reportPeriodFilters, reportDateRange, type ReportColumn, type ReportPeriod } from './reportView'
import { useReportSnapshot } from './useReportSnapshot'
import { useReportsSession, updateReportsSession } from './useReportsSession'
import { ReportResults, ReportSummary } from './ReportResults'
import '../transactions/transactions.css'
import '../transactions/transactionFilters.css'
import './reports.css'

export function ReportsSection() {
  const view = useReportsSession()
  const { snapshot, isLoading, error, refresh } = useReportSnapshot()
  const { currencyCode } = useMoney()
  const today = useLocalToday()
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filterButton = useRef<HTMLButtonElement>(null)
  const restoreFilterFocus = useRef(false)
  const [dates, setDates] = useState<ReturnType<typeof reportDateRange> | null>(null)
  const [dateError, setDateError] = useState('')
  const dateEnd = useRef<HTMLInputElement>(null)
  const result = useMemo(() => {
    if (!snapshot) return { report: null, error: null }
    try { return { report: prepareFinancialReport({ ...snapshot, filters: view.filters, grouping: view.grouping }), error: null } }
    catch { return { report: null, error: 'Your report could not be calculated safely. Review the recorded amounts or adjust your filters, then refresh.' } }
  }, [snapshot, view.filters, view.grouping])
  useEffect(() => {
    if (!filtersOpen && restoreFilterFocus.current) { restoreFilterFocus.current = false; filterButton.current?.focus() }
  }, [filtersOpen])
  const period = dates ? 'custom' : reportPeriod(view.filters, today)
  const dateValues = dates ?? reportDateRange(view.filters)
  const accounts = snapshot?.accounts ?? [], categories = snapshot?.categories ?? []
  const chips = filterChips(view.filters, accounts, categories, currencyCode)
  function applyFilters(filters: TransactionFilterState) {
    updateReportsSession({ filters: createReportFilters(filters), groupKey: null })
    setDates(null); setDateError('')
  }
  function closeFilters() { restoreFilterFocus.current = true; setFiltersOpen(false) }
  function clearAll() { applyFilters(createReportFilters()); filterButton.current?.focus() }
  function applyDates(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const invalid = event.currentTarget.querySelector<HTMLInputElement>('input:invalid')
    if (invalid) { setDateError('Enter a valid calendar date.'); invalid.focus(); return }
    try { applyFilters(createReportFilters({ ...view.filters, dateMode: 'range', ...dateValues })) }
    catch (caught) { setDateError(caught instanceof Error ? caught.message : 'Review the dates.'); dateEnd.current?.focus() }
  }
  function toggleColumn(column: ReportColumn) {
    if (column === 'amountCents') return
    updateReportsSession({ columns: view.columns.includes(column) ? view.columns.filter(value => value !== column) : [...view.columns, column] })
  }
  return <>
        <button className="button-quiet report-refresh" type="button" onClick={refresh} disabled={isLoading}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true" focusable="false"><path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 13 3M18 18a8 8 0 0 1-13-3" /></svg>Refresh
        </button>
      <div className="report-toolbar">
        <div className="report-field report-period"><label htmlFor="report-period">Period</label>
          <select id="report-period" value={period} onChange={event => {
            const next = event.target.value as ReportPeriod
            setDateError('')
            if (next === 'custom') setDates(reportDateRange(view.filters))
            else applyFilters(reportPeriodFilters(view.filters, next, today))
          }}><option value="month">Current month</option><option value="year">Current year</option>
            <option value="all">All time</option><option value="custom">Custom date range</option></select>
        </div>
        <div className="report-toolbar-actions"><button ref={filterButton} className="button-primary" type="button" aria-haspopup="dialog"
          onClick={() => setFiltersOpen(true)} disabled={!snapshot}>Filters</button>
          <span className="report-currency">{currencyCode}</span>
        </div>
        {period === 'custom' && <form className="report-dates" onSubmit={applyDates} noValidate>
          <div className="report-field"><label htmlFor="report-from">Start Date</label><input id="report-from" type="date" min="0001-01-01" max="9999-12-31"
            value={dateValues.fromDate} onChange={event => { setDates({ ...dateValues, fromDate: event.target.value }); setDateError('') }} aria-invalid={!!dateError}
            aria-describedby={`report-date-help${dateError ? ' report-date-error' : ''}`} /></div>
          <div className="report-field"><label htmlFor="report-to">End Date</label><input ref={dateEnd} id="report-to" type="date" min="0001-01-01" max="9999-12-31"
            value={dateValues.toDate} onChange={event => { setDates({ ...dateValues, toDate: event.target.value }); setDateError('') }} aria-invalid={!!dateError}
            aria-describedby={`report-date-help${dateError ? ' report-date-error' : ''}`} /></div>
          <button type="submit">Apply dates</button>
          <p id="report-date-help">Dates are inclusive. Leave either date blank for no limit.</p>
          {dateError && <p id="report-date-error" className="report-error" role="alert">{dateError}</p>}
        </form>}
      </div>
      <div className="report-active-filters" aria-label="Active report filters">
        <ul>{chips.map(chip => <li key={chip.group}><button type="button" onClick={() => { applyFilters(removeFilterGroup(view.filters, chip.group)); filterButton.current?.focus() }}
          aria-label={`Remove ${chip.label} filter`}>{chip.label}<span aria-hidden="true"> ×</span></button></li>)}
          {!!view.filters.accountTypes?.length && <li><button type="button" onClick={() => { applyFilters({ ...view.filters, accountTypes: [] }); filterButton.current?.focus() }}
            aria-label="Remove account types filter">{view.filters.accountTypes.map(type => accountTypeLabels[type]).join(' + ')}<span aria-hidden="true"> ×</span></button></li>}
        </ul>
        {chips.length || view.filters.accountTypes?.length ? <button className="button-quiet" type="button" onClick={clearAll}>Clear All</button>
          : <span>All dates · All types · All accounts</span>}
      </div>
      <details className="report-columns"><summary>Columns</summary>
        <p>Choose the fields to show. Amount is always shown.</p>
        <fieldset><legend className="report-sr-only">Visible report columns</legend>
          {reportColumns.map(([column, label]) => <label className="transaction-filter-check" key={column}>
            <input type="checkbox" name="reportColumns" value={column} checked={view.columns.includes(column)} disabled={column === 'amountCents'}
              onChange={() => toggleColumn(column)} /><span>{label}</span>
          </label>)}
        </fieldset><button type="button" onClick={() => updateReportsSession({ columns: defaultReportColumns })}>Restore default columns</button>
      </details>
      <div className="report-content" aria-busy={isLoading}>
        {isLoading && <p className="report-loading" role="status">Loading your report…</p>}
        {(error || result.error) && <div className="report-state" role="alert"><h3>Report unavailable</h3><p>{error ?? result.error}</p>
          <button type="button" onClick={refresh}>Refresh / Retry</button></div>}
        {result.report && <>
          <p className="report-count" role="status">{result.report.matchedTransactionCount} of {result.report.sourceTransactionCount} transactions match your filters.</p>
          <ReportSummary report={result.report} />
          {result.report.sourceTransactionCount === 0 ? <div className="report-state"><h3>No transactions yet</h3><p>Your reports will appear here once you have recorded transactions.</p></div>
            : result.report.matchedTransactionCount === 0 ? <div className="report-state"><h3>No matching transactions</h3><p>Try a different period or clear your filters.</p><button type="button" onClick={clearAll}>Clear All</button></div>
              : <ReportResults report={result.report} view={view} />}
          <p className="report-currency-note">All amounts in {currencyCode}. This report does not change your records.</p>
        </>}
      </div>
      {filtersOpen && <TransactionFilterPanel reportMode filters={view.filters} accounts={accounts} categories={categories}
        onCancel={closeFilters} onApply={filters => { applyFilters(filters); closeFilters() }} />}
  </>
}
