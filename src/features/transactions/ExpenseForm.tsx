import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react'
import type { Account, Category, ExpenseTransaction } from '../../domain/models'
import { accountTypeLabels } from '../accounts/accountLabels'
import { dollarsForInput, parseDollars } from '../accounts/money'
import { expenseWriteError, localCalendarDate } from './expenseHelpers'

interface ExpenseFormProps {
  expense?: ExpenseTransaction
  accounts: readonly Account[]
  categories: readonly Category[]
  disabled: boolean
  canSave: boolean
  onSave: (expense: ExpenseTransaction) => Promise<void>
  onCancel: () => void
}

type Field = 'amount' | 'date' | 'category' | 'account'
type FieldErrors = Partial<Record<Field, string>>

export function ExpenseForm({ expense, accounts, categories, disabled, canSave, onSave, onCancel }: ExpenseFormProps) {
  const prefix = useId()
  const amountRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const categoryRef = useRef<HTMLSelectElement>(null)
  const accountRef = useRef<HTMLSelectElement>(null)
  const submitting = useRef(false)
  const [amount, setAmount] = useState(() => expense ? dollarsForInput(expense.amount) : '')
  const [date, setDate] = useState(() => expense?.date ?? localCalendarDate())
  const [categoryId, setCategoryId] = useState(expense?.categoryId ?? '')
  const [accountId, setAccountId] = useState(expense?.accountId ?? '')
  const [note, setNote] = useState(expense?.note ?? '')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => { amountRef.current?.focus() }, [])

  function clearError(field: Field) {
    setErrors((current) => ({ ...current, [field]: undefined }))
    setSaveError(null)
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || !canSave || submitting.current) return
    setSaveError(null)
    const nextErrors: FieldErrors = {}
    let amountCents = 0
    try {
      amountCents = parseDollars(amount, true)
      if (amountCents <= 0) nextErrors.amount = 'Enter an expense amount greater than zero.'
    } catch (error) {
      nextErrors.amount = (error as Error).message
    }
    if (!categories.some((category) => category.id === categoryId && category.type === 'expense')) {
      nextErrors.category = 'Choose an existing expense category.'
    }
    if (!accounts.some((account) => account.id === accountId)) {
      nextErrors.account = 'Choose an existing bank, cash, or credit card account.'
    }
    if (!date) nextErrors.date = 'Choose a date.'
    else if (!dateRef.current?.validity.valid) {
      nextErrors.date = 'Choose a valid calendar date between years 0001 and 9999.'
    }

    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) {
      if (nextErrors.amount) amountRef.current?.focus()
      else if (nextErrors.date) dateRef.current?.focus()
      else if (nextErrors.category) categoryRef.current?.focus()
      else accountRef.current?.focus()
      return
    }

    submitting.current = true
    try {
      const trimmedNote = note.trim()
      const record: ExpenseTransaction = {
        id: expense?.id ?? crypto.randomUUID(),
        type: 'expense',
        amount: amountCents,
        date,
        categoryId,
        accountId,
        ...(trimmedNote ? { note: trimmedNote } : {}),
      }
      await onSave(record)
    } catch (error) {
      setSaveError(expenseWriteError(error))
    } finally {
      submitting.current = false
    }
  }

  return (
    <form className="expense-form" onSubmit={handleSubmit} noValidate aria-labelledby={`${prefix}-heading`}>
      <h3 id={`${prefix}-heading`}>{expense ? 'Edit expense' : 'Add expense'}</h3>
      <fieldset disabled={disabled}>
        <div className="expense-field">
          <label htmlFor={`${prefix}-amount`}>Amount (CAD)</label>
          <input ref={amountRef} id={`${prefix}-amount`} type="text" inputMode="decimal" value={amount} required
            onChange={(event) => { setAmount(event.target.value); clearError('amount') }}
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={`${prefix}-amount-help${errors.amount ? ` ${prefix}-amount-error` : ''}`} />
          <p id={`${prefix}-amount-help`}>Enter dollars greater than zero, such as 42.75, with at most two decimal places.</p>
          {errors.amount && <p className="expense-error" id={`${prefix}-amount-error`}>{errors.amount}</p>}
        </div>
        <div className="expense-field">
          <label htmlFor={`${prefix}-date`}>Date</label>
          <input ref={dateRef} id={`${prefix}-date`} type="date" min="0001-01-01" max="9999-12-31" value={date} required
            onChange={(event) => { setDate(event.target.value); clearError('date') }}
            aria-invalid={Boolean(errors.date)} aria-describedby={errors.date ? `${prefix}-date-error` : undefined} />
          {errors.date && <p className="expense-error" id={`${prefix}-date-error`}>{errors.date}</p>}
        </div>
        <div className="expense-field">
          <label htmlFor={`${prefix}-category`}>Expense category</label>
          <select ref={categoryRef} id={`${prefix}-category`} value={categoryId} required
            onChange={(event) => { setCategoryId(event.target.value); clearError('category') }}
            aria-invalid={Boolean(errors.category)} aria-describedby={errors.category ? `${prefix}-category-error` : undefined}>
            <option value="">Choose an expense category</option>
            {categories.filter((category) => category.type === 'expense').map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          {errors.category && <p className="expense-error" id={`${prefix}-category-error`}>{errors.category}</p>}
        </div>
        <div className="expense-field">
          <label htmlFor={`${prefix}-account`}>Account / payment source</label>
          <select ref={accountRef} id={`${prefix}-account`} value={accountId} required
            onChange={(event) => { setAccountId(event.target.value); clearError('account') }}
            aria-invalid={Boolean(errors.account)} aria-describedby={errors.account ? `${prefix}-account-error` : undefined}>
            <option value="">Choose an account</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name} ({accountTypeLabels[account.type]})</option>
            ))}
          </select>
          {errors.account && <p className="expense-error" id={`${prefix}-account-error`}>{errors.account}</p>}
        </div>
        <div className="expense-field">
          <label htmlFor={`${prefix}-note`}>Note (optional)</label>
          <textarea id={`${prefix}-note`} rows={3} value={note}
            onChange={(event) => { setNote(event.target.value); setSaveError(null) }} />
        </div>
        <div className="expense-actions">
          <button className="expense-primary" type="submit" disabled={!canSave}>{disabled ? 'Please wait...' : 'Save expense'}</button>
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
      </fieldset>
      {Object.values(errors).some(Boolean) && <p className="expense-error" role="alert">Please correct the marked fields.</p>}
      {saveError && <p className="expense-error" role="alert">{saveError}</p>}
    </form>
  )
}
