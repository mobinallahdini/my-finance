import { useId, useState } from 'react'
import { adjacentMonth, readableMonth } from './transactionPresentation'
import { TransactionTypeControl, type TransactionTypeFilter } from './TransactionTypeControl'

export function TransactionFilters({ month, allDates, type, onMonthChange, onAllDatesChange, onTypeChange }: {
  month: string
  allDates: boolean
  type: TransactionTypeFilter
  onMonthChange: (month: string) => void
  onAllDatesChange: (allDates: boolean) => void
  onTypeChange: (type: TransactionTypeFilter) => void
}) {
  const prefix = useId()
  const [pickerOpen, setPickerOpen] = useState(false)
  const previous = adjacentMonth(month, -1)
  const next = adjacentMonth(month, 1)
  return (
    <div className="transaction-filters" role="group" aria-label="History filters">
      <div className="transaction-date-filter">
        <div className="transaction-month-navigation" role="group" aria-label="History month">
          <button className="button-quiet transaction-month-arrow" type="button" aria-label="Previous month"
            disabled={allDates || !previous} onClick={() => { if (previous) onMonthChange(previous) }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false"><path d="m15 5-7 7 7 7" /></svg>
          </button>
          <button className="button-quiet transaction-month-label" type="button" aria-controls={`${prefix}-picker`}
            aria-expanded={pickerOpen} aria-label={`Choose history month, ${allDates ? 'all dates' : readableMonth(month)}`}
            onClick={() => setPickerOpen((open) => !open)}>{allDates ? 'All dates' : readableMonth(month)}</button>
          <button className="button-quiet transaction-month-arrow" type="button" aria-label="Next month"
            disabled={allDates || !next} onClick={() => { if (next) onMonthChange(next) }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false"><path d="m9 5 7 7-7 7" /></svg>
          </button>
        </div>
        <button className="button-quiet transaction-all-dates" type="button" aria-pressed={allDates}
          onClick={() => onAllDatesChange(!allDates)}>{allDates ? 'By month' : 'All dates'}</button>
      </div>
      <div id={`${prefix}-picker`} className="transaction-month-picker" hidden={!pickerOpen}>
        <label htmlFor={`${prefix}-month`}>History month</label>
        <input id={`${prefix}-month`} type="month" value={month} min="0001-01" max="9999-12" required
          onChange={(event) => {
            if (event.currentTarget.value && event.currentTarget.validity.valid) onMonthChange(event.currentTarget.value)
          }} />
      </div>
      <TransactionTypeControl label="Filter by transaction type" value={type} options={['all', 'expense', 'income', 'transfer']} onChange={onTypeChange} />
    </div>
  )
}
