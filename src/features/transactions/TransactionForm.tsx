import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type SubmitEvent } from 'react'
import type { Account, Category } from '../../domain/models'
import { accountTypeLabels } from '../accounts/accountLabels'
import { dollarsForInput, parseDollars } from '../accounts/money'
import { isEligibleAccount, localCalendarDate, transactionTypeLabels, transactionWriteError, type EntryTransaction } from './transactionHelpers'
import { TransactionTypeControl } from './TransactionTypeControl'

interface TransactionFormProps {
  transaction?: EntryTransaction
  accounts: readonly Account[]
  categories: readonly Category[]
  disabled: boolean
  isLoading: boolean
  loadError: string | null
  onSave: (transaction: EntryTransaction) => Promise<void>
  onCancel: () => void
  onDelete: (transaction: EntryTransaction) => Promise<void>
  onRetry: () => void
}

type Field = 'amount' | 'date' | 'category' | 'account' | 'fromAccount' | 'toAccount'
type FieldErrors = Partial<Record<Field, string>>

export function TransactionForm({ transaction, accounts, categories, disabled, isLoading, loadError, onSave, onCancel, onDelete, onRetry }: TransactionFormProps) {
  const [initial] = useState(() => ({
    type: transaction?.type ?? 'expense' as EntryTransaction['type'],
    amount: transaction ? dollarsForInput(transaction.amount) : '',
    date: transaction?.date ?? localCalendarDate(),
    categoryId: transaction?.type !== 'transfer' ? transaction?.categoryId ?? '' : '',
    accountId: transaction?.type !== 'transfer' ? transaction?.accountId ?? '' : '',
    fromAccountId: transaction?.type === 'transfer' ? transaction.fromAccountId : '',
    toAccountId: transaction?.type === 'transfer' ? transaction.toAccountId : '',
    note: transaction?.note ?? '',
  }))
  const [transactionType, setTransactionType] = useState(initial.type)
  const isTransfer = transactionType === 'transfer'
  const typeLabel = transactionTypeLabels[transactionType]
  const eligibleAccounts = accounts.filter((account) => isEligibleAccount(account, transactionType))
  const matchingCategories = categories.filter((category) => category.type === transactionType)
  const prefix = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const amountRef = useRef<HTMLInputElement>(null)
  const dateRef = useRef<HTMLInputElement>(null)
  const categoryRef = useRef<HTMLSelectElement>(null)
  const accountRef = useRef<HTMLSelectElement>(null)
  const fromAccountRef = useRef<HTMLSelectElement>(null)
  const toAccountRef = useRef<HTMLSelectElement>(null)
  const submitting = useRef(false)
  const navigationAllowed = useRef(false)
  const editorURL = useRef(window.location.href)
  const [amount, setAmount] = useState(initial.amount)
  const [date, setDate] = useState(initial.date)
  const [categoryId, setCategoryId] = useState(initial.categoryId)
  const [accountId, setAccountId] = useState(initial.accountId)
  const [fromAccountId, setFromAccountId] = useState(initial.fromAccountId)
  const [toAccountId, setToAccountId] = useState(initial.toAccountId)
  const [note, setNote] = useState(initial.note)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)

  const dirty = transactionType !== initial.type || amount !== initial.amount || date !== initial.date
    || categoryId !== initial.categoryId || accountId !== initial.accountId
    || fromAccountId !== initial.fromAccountId || toAccountId !== initial.toAccountId || note !== initial.note
  const canSave = !loadError && (isTransfer ? accounts.length >= 2 : eligibleAccounts.length > 0 && matchingCategories.length > 0)

  useLayoutEffect(() => {
    const dialog = dialogRef.current!
    const oldOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    dialog.querySelector<HTMLElement>('h2')?.focus()
    return () => {
      dialog.close()
      document.body.style.overflow = oldOverflow
    }
  }, [])

  useEffect(() => {
    if (disabled) return
    amountRef.current?.focus()
  }, [disabled])

  useLayoutEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if ((!dirty && !submitting.current) || navigationAllowed.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    function guardNavigation(event: Event) {
      // Ignore opening/restored hashes. Popstate precedes the hash notification.
      if (navigationAllowed.current || window.location.href === editorURL.current) return
      if (disabled || submitting.current || (dirty && !window.confirm('Discard unsaved transaction changes? Your changes will be lost.'))) {
        // Restore the URL before the app's hash subscriber reads it.
        window.history.replaceState(window.history.state, '', editorURL.current)
        event.stopImmediatePropagation()
      } else navigationAllowed.current = true
    }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('hashchange', guardNavigation, true)
    window.addEventListener('popstate', guardNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('hashchange', guardNavigation, true)
      window.removeEventListener('popstate', guardNavigation, true)
    }
  }, [dirty, disabled])

  function confirmDiscard() {
    return !dirty || window.confirm('Discard unsaved transaction changes? Your changes will be lost.')
  }

  function requestClose() {
    if (disabled || submitting.current || !confirmDiscard()) return
    onCancel()
  }

  function containKeyboardFocus(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab') return
    const targets = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]',
    ))
    const first = targets[0]
    const last = targets.at(-1)
    if (!first) {
      event.preventDefault()
      event.currentTarget.querySelector<HTMLElement>('h2')?.focus()
    } else if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function leaveForSetup(event: MouseEvent<HTMLAnchorElement>) {
    if (disabled || submitting.current) {
      event.preventDefault()
      return
    }
    // Opening setup in another tab does not depart from this editor.
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return
    if (!confirmDiscard()) event.preventDefault()
    else navigationAllowed.current = true
  }

  function switchType(next: EntryTransaction['type']) {
    if (transaction || next === transactionType) return
    setTransactionType(next)
    setCategoryId('')
    setAccountId('')
    setFromAccountId('')
    setToAccountId('')
    setErrors({})
    setSaveError(null)
  }

  async function handleDelete() {
    if (!transaction || disabled || submitting.current) return
    submitting.current = true
    setSaveError(null)
    try {
      await onDelete(transaction)
    } catch (error) {
      setSaveError(transactionWriteError(error))
    } finally {
      submitting.current = false
    }
  }

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
      if (amountCents <= 0) nextErrors.amount = `Enter ${transactionType === 'transfer' ? 'a' : 'an'} ${transactionType} amount greater than zero.`
    } catch (error) {
      nextErrors.amount = (error as Error).message
    }
    if (isTransfer) {
      if (!accounts.some((account) => account.id === fromAccountId)) {
        nextErrors.fromAccount = 'Choose an existing From account.'
      }
      if (!accounts.some((account) => account.id === toAccountId)) {
        nextErrors.toAccount = 'Choose an existing To account.'
      }
      if (fromAccountId && fromAccountId === toAccountId) {
        nextErrors.toAccount = 'Choose a different To account. Transfers require two different accounts.'
      }
    } else {
      if (!matchingCategories.some((category) => category.id === categoryId)) {
        nextErrors.category = `Choose an existing ${transactionType} category.`
      }
      if (!eligibleAccounts.some((account) => account.id === accountId)) {
        nextErrors.account = transactionType === 'income'
          ? 'Choose an existing bank or cash account. Income cannot be deposited into a credit card.'
          : 'Choose an existing bank, cash, or credit card account.'
      }
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
      else if (nextErrors.account) accountRef.current?.focus()
      else if (nextErrors.fromAccount) fromAccountRef.current?.focus()
      else toAccountRef.current?.focus()
      return
    }

    submitting.current = true
    try {
      const trimmedNote = note.trim()
      const base = {
        id: transaction?.id ?? crypto.randomUUID(),
        amount: amountCents,
        date,
        ...(trimmedNote ? { note: trimmedNote } : {}),
      }
      const record: EntryTransaction = transactionType === 'transfer'
        ? { ...base, type: 'transfer', fromAccountId, toAccountId }
        : { ...base, type: transactionType, categoryId, accountId }
      await onSave(record)
    } catch (error) {
      setSaveError(transactionWriteError(error))
    } finally {
      submitting.current = false
    }
  }

  return (
    <dialog ref={dialogRef} className="transaction-editor" aria-labelledby={`${prefix}-heading`}
      onKeyDown={containKeyboardFocus} onCancel={(event) => { event.preventDefault(); requestClose() }}>
      <form className="transaction-form" onSubmit={handleSubmit} noValidate aria-busy={disabled}>
        <header className="transaction-editor-header">
          <button className="button-quiet" type="button" disabled={disabled} onClick={requestClose}>Cancel</button>
          <h2 id={`${prefix}-heading`} tabIndex={-1}>{transaction ? 'Edit transaction' : 'New transaction'}</h2>
          <button className="transaction-primary" type="submit" disabled={disabled || !canSave}>Save</button>
        </header>
        <div className="transaction-editor-body" onFocusCapture={(event) => {
          const field = event.target
          if (field instanceof HTMLElement && field.matches('input, select, textarea')) {
            field.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          }
        }}>
          {transaction ? <p className="transaction-fixed-type">{typeLabel} <span>· Type is fixed when editing</span></p> : (
            <TransactionTypeControl value={transactionType} options={['expense', 'income', 'transfer']}
              label="New transaction type" disabled={disabled} onChange={switchType} />
          )}
          {isLoading && <p className="transaction-loading" role="status">Loading accounts and categories...</p>}
          {loadError && <div className="transaction-recovery">
            <p className="transaction-error" role="alert">{loadError}</p>
            <button type="button" disabled={disabled} onClick={onRetry}>Refresh / Retry</button>
          </div>}
          {!isLoading && !loadError && !canSave && <div className="transaction-prerequisites" role="status">
            {isTransfer ? <p>Transfers need two distinct accounts. <a href="#accounts" onClick={leaveForSetup}>Set up accounts</a>.</p> : <>
              {eligibleAccounts.length === 0 && <p>{transactionType === 'income' ? 'Income needs a bank or cash account. Credit cards cannot receive income.' : 'Expenses need an account.'} <a href="#accounts" onClick={leaveForSetup}>Set up accounts</a>.</p>}
              {matchingCategories.length === 0 && <p>{typeLabel} needs a matching category. <a href="#more/categories" onClick={leaveForSetup}>Set up categories</a>.</p>}
            </>}
          </div>}
          <fieldset className="transaction-editor-fields" disabled={disabled}>
            <div className="transaction-field">
              <label htmlFor={`${prefix}-amount`}>Amount (CAD)</label>
              <input ref={amountRef} autoFocus id={`${prefix}-amount`} type="text" inputMode="decimal" value={amount} required
                onChange={(event) => { setAmount(event.target.value); clearError('amount') }}
                aria-invalid={Boolean(errors.amount)}
                aria-describedby={`${prefix}-amount-help${errors.amount ? ` ${prefix}-amount-error` : ''}`} />
              <p id={`${prefix}-amount-help`}>Enter dollars greater than zero, such as 42.75, with at most two decimal places.</p>
              {errors.amount && <p className="transaction-error" id={`${prefix}-amount-error`}>{errors.amount}</p>}
            </div>
            {isTransfer ? (
              <>
                <div className="transaction-field">
                  <label htmlFor={`${prefix}-from-account`}>From account</label>
                  <select ref={fromAccountRef} id={`${prefix}-from-account`} value={fromAccountId} required
                    onChange={(event) => {
                      const nextId = event.target.value
                      setFromAccountId(nextId)
                      if (nextId === toAccountId) setToAccountId('')
                      clearError('fromAccount')
                      clearError('toAccount')
                    }}
                    aria-invalid={Boolean(errors.fromAccount)} aria-describedby={errors.fromAccount ? `${prefix}-from-account-error` : undefined}>
                    <option value="">Choose a From account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id} disabled={account.id === toAccountId}>
                        {account.name} ({accountTypeLabels[account.type]})
                      </option>
                    ))}
                  </select>
                  {errors.fromAccount && <p className="transaction-error" id={`${prefix}-from-account-error`}>{errors.fromAccount}</p>}
                </div>
                <div className="transaction-field">
                  <label htmlFor={`${prefix}-to-account`}>To account</label>
                  <select ref={toAccountRef} id={`${prefix}-to-account`} value={toAccountId} required
                    onChange={(event) => {
                      const nextId = event.target.value
                      setToAccountId(nextId)
                      if (nextId === fromAccountId) setFromAccountId('')
                      clearError('fromAccount')
                      clearError('toAccount')
                    }}
                    aria-invalid={Boolean(errors.toAccount)} aria-describedby={`${prefix}-to-account-help${errors.toAccount ? ` ${prefix}-to-account-error` : ''}`}>
                    <option value="">Choose a To account</option>
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id} disabled={account.id === fromAccountId}>
                        {account.name} ({accountTypeLabels[account.type]})
                      </option>
                    ))}
                  </select>
                  <p id={`${prefix}-to-account-help`}>Choose a different account. A transfer into a credit card reduces its debt.</p>
                  {errors.toAccount && <p className="transaction-error" id={`${prefix}-to-account-error`}>{errors.toAccount}</p>}
                </div>
              </>
            ) : (
              <>
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
              </>
            )}
            <div className="transaction-field">
              <label htmlFor={`${prefix}-date`}>Date</label>
              <input ref={dateRef} id={`${prefix}-date`} type="date" min="0001-01-01" max="9999-12-31" value={date} required
                onChange={(event) => { setDate(event.target.value); clearError('date') }}
                aria-invalid={Boolean(errors.date)} aria-describedby={errors.date ? `${prefix}-date-error` : undefined} />
              {errors.date && <p className="transaction-error" id={`${prefix}-date-error`}>{errors.date}</p>}
            </div>
            <div className="transaction-field">
              <label htmlFor={`${prefix}-note`}>Note (optional)</label>
              <textarea id={`${prefix}-note`} rows={3} value={note}
                onChange={(event) => { setNote(event.target.value); setSaveError(null) }} />
            </div>
          </fieldset>
          {Object.values(errors).some(Boolean) && <p className="transaction-error" role="alert">Please correct the marked fields.</p>}
          {saveError && <p className="transaction-error" role="alert">{saveError}</p>}
          {transaction && <div className="transaction-editor-delete">
            <button className="button-quiet button-destructive" type="button" disabled={disabled} onClick={() => { void handleDelete() }}>Delete transaction</button>
          </div>}
        </div>
      </form>
    </dialog>
  )
}
