import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type SubmitEvent } from 'react'
import type { Account, Category } from '../../domain/models'
import { accountTypeLabels } from '../accounts/accountLabels'
import { transactionTypeLabels } from './transactionHelpers'
import {
  emptyTransactionFilters, filterDraft, filterTypes, validateFilterDraft,
  type DateMode, type FilterErrors, type FilterField, type TransactionFilterState,
} from './transactionFiltering'

function toggleSelection<T extends string>(selected: readonly T[], value: T): T[] {
  return selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]
}

export function TransactionFilterPanel({ filters, accounts, categories, onApply, onCancel }: {
  filters: TransactionFilterState
  accounts: readonly Account[]
  categories: readonly Category[]
  onApply: (filters: TransactionFilterState) => void
  onCancel: () => void
}) {
  const prefix = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState(() => filterDraft(filters))
  const [errors, setErrors] = useState<FilterErrors>({})
  useLayoutEffect(() => {
    const dialog = dialogRef.current!
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    dialog.querySelector<HTMLSelectElement>('select')?.focus()
    return () => { dialog.close(); document.body.style.overflow = oldOverflow }
  }, [])

  function changeField(field: FilterField, value: string) {
    setDraft((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: undefined }))
  }
  function apply(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = validateFilterDraft(draft)
    // Native date fields can contain incomplete text while their canonical value is empty.
    for (const field of ['month', 'fromDate', 'toDate'] as const) {
      const input = event.currentTarget.elements.namedItem(field)
      if (input instanceof HTMLInputElement && !input.validity.valid) {
        result.errors[field] = field === 'month' ? 'Choose a valid month.' : 'Enter a valid calendar date.'
      }
    }
    if (Object.keys(result.errors).length) {
      setErrors(result.errors)
      const input = Array.from(event.currentTarget.elements).find((control) => (
        control instanceof HTMLInputElement && result.errors[control.name as FilterField]
      ))
      if (input instanceof HTMLElement) input.focus()
      return
    }
    if (result.value) onApply(result.value)
  }
  function containFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary',
    )).filter((element) => element.getClientRects().length)
    const first = targets[0]
    const last = targets.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  function field(name: FilterField, label: string, type: 'month' | 'date' | 'text') {
    return (
      <div className="transaction-field">
        <label htmlFor={`${prefix}-${name}`}>{label}</label>
        <input id={`${prefix}-${name}`} name={name} type={type} value={draft[name]}
          inputMode={type === 'text' ? 'decimal' : undefined} autoComplete="off"
          min={type === 'month' ? '0001-01' : type === 'date' ? '0001-01-01' : undefined}
          max={type === 'month' ? '9999-12' : type === 'date' ? '9999-12-31' : undefined}
          required={type === 'month'} aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${prefix}-${name}-error` : undefined}
          onChange={(event) => changeField(name, event.currentTarget.value)} />
        {errors[name] && <p className="transaction-error" id={`${prefix}-${name}-error`}>{errors[name]}</p>}
      </div>
    )
  }
  function selectIds(group: 'accountIds' | 'categoryIds', id: string) {
    setDraft((current) => ({ ...current, [group]: toggleSelection(current[group], id) }))
  }
  function setDateMode(dateMode: DateMode) {
    setDraft((current) => ({ ...current, dateMode }))
    setErrors((current) => ({ minimum: current.minimum, maximum: current.maximum }))
  }
  function clearDraft() {
    setDraft(filterDraft({ ...emptyTransactionFilters(), query: draft.query }))
    setErrors({})
  }
  const selectedCount = (ids: readonly string[]) => ids.length ? `${ids.length} selected` : 'Any'
  return (
    <dialog ref={dialogRef} className="transaction-editor transaction-filter-dialog" aria-labelledby={`${prefix}-heading`}
      onKeyDown={containFocus} onCancel={(event) => { event.preventDefault(); onCancel() }}>
      <form className="transaction-form transaction-filter-form" onSubmit={apply} noValidate>
        <header className="transaction-editor-header">
          <button type="button" className="button-quiet" onClick={onCancel}>Cancel</button>
          <h2 id={`${prefix}-heading`} tabIndex={-1}>Filters</h2>
          <button className="transaction-primary" type="submit">Apply filters</button>
        </header>
        <div className="transaction-editor-body transaction-filter-body">
          <fieldset className="transaction-filter-group">
            <legend>Date</legend>
            <div className="transaction-field">
              <label htmlFor={`${prefix}-date-mode`}>Date mode</label>
              <select id={`${prefix}-date-mode`} name="dateMode" value={draft.dateMode}
                onChange={(event) => setDateMode(event.currentTarget.value as DateMode)}>
                <option value="month">Month</option><option value="range">Custom range</option><option value="all">All dates</option>
              </select>
            </div>
            {draft.dateMode === 'month' && field('month', 'Month', 'month')}
            {draft.dateMode === 'range' && <div className="transaction-filter-pair">
              {field('fromDate', 'From date (optional)', 'date')}{field('toDate', 'To date (optional)', 'date')}
            </div>}
          </fieldset>
          <fieldset className="transaction-filter-group">
            <legend>Amount (CAD)</legend>
            <p className="transaction-filter-help">Match the amount regardless of its displayed sign. Leave either bound blank for no limit.</p>
            <div className="transaction-filter-pair">
              {field('minimum', 'Minimum amount', 'text')}{field('maximum', 'Maximum amount', 'text')}
            </div>
          </fieldset>
          <fieldset className="transaction-filter-group">
            <legend>Transaction type</legend>
            <div className="transaction-filter-types">
              {filterTypes.map((type) => <label className="transaction-filter-check" key={type}>
                <input type="checkbox" name="types" value={type} checked={draft.types.includes(type)}
                  onChange={() => setDraft((current) => ({ ...current, types: toggleSelection(current.types, type) }))} />
                <span>{transactionTypeLabels[type]}</span>
              </label>)}
            </div>
          </fieldset>
          <details className="transaction-filter-disclosure">
            <summary>Accounts <span>{selectedCount(draft.accountIds)}</span></summary>
            <fieldset className="transaction-filter-group">
              <legend className="transaction-sr-only">Filter by account</legend>
              {accounts.length ? accounts.map((account) => <label className="transaction-filter-check" key={account.id}>
                <input type="checkbox" name="accountIds" value={account.id} checked={draft.accountIds.includes(account.id)}
                  onChange={() => selectIds('accountIds', account.id)} />
                <span>{account.name}<span className="transaction-filter-entity-type">{accountTypeLabels[account.type]}</span></span>
              </label>) : <p className="transaction-filter-help">No accounts available.</p>}
            </fieldset>
          </details>
          <details className="transaction-filter-disclosure">
            <summary>Categories <span>{selectedCount(draft.categoryIds)}</span></summary>
            <fieldset className="transaction-filter-group">
              <legend className="transaction-sr-only">Filter by category</legend>
              {(['expense', 'income'] as const).map((type) => {
                const choices = categories.filter((category) => category.type === type)
                return <div className="transaction-filter-category-group" key={type}>
                  <h3>{transactionTypeLabels[type]}</h3>
                  {choices.length ? choices.map((category) => <label className="transaction-filter-check" key={category.id}>
                    <input type="checkbox" name="categoryIds" value={category.id} checked={draft.categoryIds.includes(category.id)}
                      onChange={() => selectIds('categoryIds', category.id)} />
                    <span>{category.name}</span>
                  </label>) : <p className="transaction-filter-help">No {type} categories available.</p>}
                </div>
              })}
            </fieldset>
          </details>
          {Object.values(errors).some(Boolean) && <p className="transaction-error" role="alert">Review the marked fields. Your active filters have not changed.</p>}
          <button type="button" className="button-quiet transaction-filter-clear-draft" onClick={clearDraft}>Clear advanced filters</button>
        </div>
      </form>
    </dialog>
  )
}
