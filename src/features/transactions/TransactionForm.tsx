import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react'
import type { Account, Category } from '../../domain/models'
import { accountTypeLabels } from '../accounts/accountLabels'
import { dollarsForInput, parseDollars } from '../accounts/money'
import { isEligibleAccount, localCalendarDate, transactionTypeLabels, transactionWriteError, type EntryTransaction } from './transactionHelpers'

interface TransactionFormProps {
  transaction?: EntryTransaction
  type: EntryTransaction['type']
  accounts: readonly Account[]
  categories: readonly Category[]
  disabled: boolean
  canSave: boolean
  onSave: (transaction: EntryTransaction) => Promise<void>
  onCancel: () => void
}

type Field = 'amount' | 'date' | 'category' | 'account'
type FieldErrors = Partial<Record<Field, string>>

export function TransactionForm({ transaction, type, accounts, categories, disabled, canSave, onSave, onCancel }: TransactionFormProps) {
  const transactionType = transaction?.type ?? type
  const typeLabel = transactionTypeLabels[transactionType]
  const eligibleAccounts = accounts.filter((account) => isEligibleAccount(account, transactionType))
  const matchingCategories = categories.filter((category) => category.type === transactionType)
  const prefix = useId()
  const amountRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const categoryRef = useRef<HTMLSelectElement>(null)
  const accountRef = useRef<HTMLSelectElement>(null)
  const submitting = useRef(false)
  const [amount, setAmount] = useState(() => transaction ? dollarsForInput(transaction.amount) : '')
  const [date, setDate] = useState(() => transaction?.date ?? localCalendarDate())
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '')
  const [accountId, setAccountId] = useState(transaction?.accountId ?? '')
  const [note, setNote] = useState(transaction?.note ?? '')
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
      if (amountCents <= 0) nextErrors.amount = `Enter an ${transactionType} amount greater than zero.`
    } catch (error) {
      nextErrors.amount = (error as Error).message
    }
    if (!matchingCategories.some((category) => category.id === categoryId)) {
      nextErrors.category = `Choose an existing ${transactionType} category.`
    }
    if (!eligibleAccounts.some((account) => account.id === accountId)) {
      nextErrors.account = transactionType === 'income'
        ? 'Choose an existing bank or cash account. Income cannot be deposited into a credit card.'
        : 'Choose an existing bank, cash, or credit card account.'
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
      const record: EntryTransaction = {
        id: transaction?.id ?? crypto.randomUUID(),
        type: transactionType,
        amount: amountCents,
        date,
        categoryId,
        accountId,
        ...(trimmedNote ? { note: trimmedNote } : {}),
      }
      await onSave(record)
    } catch (error) {
      setSaveError(transactionWriteError(error))
    } finally {
      submitting.current = false
    }
  }

  return (
    <form className="transaction-form" onSubmit={handleSubmit} noValidate aria-labelledby={`${prefix}-heading`}>
      <h3 id={`${prefix}-heading`}>{transaction ? 'Edit' : 'Add'} {transactionType}</h3>
      <fieldset disabled={disabled}>
        <div className="transaction-field">
          <label htmlFor={`${prefix}-amount`}>Amount (CAD)</label>
          <input ref={amountRef} id={`${prefix}-amount`} type="text" inputMode="decimal" value={amount} required
            onChange={(event) => { setAmount(event.target.value); clearError('amount') }}
            aria-invalid={Boolean(errors.amount)}
            aria-describedby={`${prefix}-amount-help${errors.amount ? ` ${prefix}-amount-error` : ''}`} />
          <p id={`${prefix}-amount-help`}>Enter dollars greater than zero, such as 42.75, with at most two decimal places.</p>
          {errors.amount && <p className="transaction-error" id={`${prefix}-amount-error`}>{errors.amount}</p>}
        </div>
        <div className="transaction-field">
          <label htmlFor={`${prefix}-date`}>Date</label>
          <input ref={dateRef} id={`${prefix}-date`} type="date" min="0001-01-01" max="9999-12-31" value={date} required
            onChange={(event) => { setDate(event.target.value); clearError('date') }}
            aria-invalid={Boolean(errors.date)} aria-describedby={errors.date ? `${prefix}-date-error` : undefined} />
          {errors.date && <p className="transaction-error" id={`${prefix}-date-error`}>{errors.date}</p>}
        </div>
        <div className="transaction-field">
          <label htmlFor={`${prefix}-category`}>{typeLabel} category</label>
          <select ref={categoryRef} id={`${prefix}-category`} value={categoryId} required
            onChange={(event) => { setCategoryId(event.target.value); clearError('category') }}
            aria-invalid={Boolean(errors.category)} aria-describedby={errors.category ? `${prefix}-category-error` : undefined}>
            <option value="">Choose an {transactionType} category</option>
            {matchingCategories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
          {errors.category && <p className="transaction-error" id={`${prefix}-category-error`}>{errors.category}</p>}
        </div>
        <div className="transaction-field">
          <label htmlFor={`${prefix}-account`}>{transactionType === 'income' ? 'Destination account' : 'Account / payment source'}</label>
          <select ref={accountRef} id={`${prefix}-account`} value={accountId} required
            onChange={(event) => { setAccountId(event.target.value); clearError('account') }}
            aria-invalid={Boolean(errors.account)}
            aria-describedby={`${transactionType === 'income' ? `${prefix}-account-help` : ''}${errors.account ? ` ${prefix}-account-error` : ''}`.trim() || undefined}>
            <option value="">Choose an account</option>
            {eligibleAccounts.map((account) => (
              <option key={account.id} value={account.id}>{account.name} ({accountTypeLabels[account.type]})</option>
            ))}
          </select>
          {transactionType === 'income' && <p id={`${prefix}-account-help`}>Income goes into a bank or cash account. A credit card payment is a transfer.</p>}
          {errors.account && <p className="transaction-error" id={`${prefix}-account-error`}>{errors.account}</p>}
        </div>
        <div className="transaction-field">
          <label htmlFor={`${prefix}-note`}>Note (optional)</label>
          <textarea id={`${prefix}-note`} rows={3} value={note}
            onChange={(event) => { setNote(event.target.value); setSaveError(null) }} />
        </div>
        <div className="transaction-actions">
          <button className="transaction-primary" type="submit" disabled={!canSave}>{disabled ? 'Please wait...' : `Save ${transactionType}`}</button>
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
      </fieldset>
      {Object.values(errors).some(Boolean) && <p className="transaction-error" role="alert">Please correct the marked fields.</p>}
      {saveError && <p className="transaction-error" role="alert">{saveError}</p>}
    </form>
  )
}
