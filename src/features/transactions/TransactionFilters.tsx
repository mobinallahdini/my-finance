import { useEffect, useId, useRef, useState } from 'react'
import type { Account, Category } from '../../domain/models'
import { TransactionFilterPanel } from './TransactionFilterPanel'
import { emptyTransactionFilters, filterChips, removeFilterGroup, type TransactionFilterState } from './transactionFiltering'
import './transactionFilters.css'

export function TransactionFilters({ filters, accounts, categories, onChange }: {
  filters: TransactionFilterState
  accounts: readonly Account[]
  categories: readonly Category[]
  onChange: (filters: TransactionFilterState) => void
}) {
  const prefix = useId()
  const [panelOpen, setPanelOpen] = useState(false)
  const filterButtonRef = useRef<HTMLButtonElement>(null)
  const pendingFocus = useRef(false)
  const chips = filterChips(filters, accounts, categories)

  useEffect(() => {
    if (panelOpen || !pendingFocus.current) return
    pendingFocus.current = false
    filterButtonRef.current?.focus()
  }, [panelOpen])

  function closePanel() {
    pendingFocus.current = true
    setPanelOpen(false)
  }

  return (
    <div className="transaction-filters" role="group" aria-label="Transaction filters">
      <div className="transaction-filter-toolbar">
        <label className="transaction-sr-only" htmlFor={`${prefix}-search`}>Search transactions</label>
        <input id={`${prefix}-search`} type="search" value={filters.query} placeholder="Search transactions"
          onChange={(event) => onChange({ ...filters, query: event.currentTarget.value })} />
        <button ref={filterButtonRef} className="transaction-filter-open" type="button" aria-haspopup="dialog"
          onClick={() => setPanelOpen(true)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
            strokeLinecap="round" aria-hidden="true" focusable="false"><path d="M4 6h16M7 12h10M10 18h4" /></svg>
          Filters
        </button>
      </div>
      <div className="transaction-filter-summary">
        {chips.length ? <>
          <ul className="transaction-filter-chips" aria-label="Active filters">
            {chips.map(({ group, label }) => <li key={group}>
              <button className="transaction-filter-chip" type="button" aria-label={`Remove ${label} filter`}
                onClick={() => { onChange(removeFilterGroup(filters, group)); filterButtonRef.current?.focus() }}>
                <span>{label}</span><span aria-hidden="true">×</span>
              </button>
            </li>)}
          </ul>
          <button className="button-quiet transaction-filter-clear" type="button"
            onClick={() => { onChange(emptyTransactionFilters()); filterButtonRef.current?.focus() }}>Clear all</button>
        </> : <span className="transaction-filter-context">All dates · All types</span>}
      </div>
      {panelOpen && <TransactionFilterPanel filters={filters} accounts={accounts} categories={categories}
        onCancel={closePanel} onApply={(next) => { onChange(next); closePanel() }} />}
    </div>
  )
}
