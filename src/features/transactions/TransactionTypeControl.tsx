import { useId } from 'react'
import { transactionTypeLabels, type EntryTransaction } from './transactionHelpers'

export type TransactionTypeFilter = 'all' | EntryTransaction['type']
const labels: Record<TransactionTypeFilter, string> = { all: 'All', ...transactionTypeLabels }

export function TransactionTypeControl<T extends TransactionTypeFilter>({ value, options, label, disabled, onChange }: {
  value: T
  options: readonly T[]
  label: string
  disabled?: boolean
  onChange: (value: T) => void
}) {
  const name = useId()
  return (
    <fieldset className="transaction-segmented" disabled={disabled}>
      <legend className="transaction-sr-only">{label}</legend>
      {options.map((type) => (
        <label key={type} className="transaction-segment">
          <input type="radio" name={name} value={type} checked={value === type} onChange={() => onChange(type)} />
          <span>{labels[type]}</span>
        </label>
      ))}
    </fieldset>
  )
}
