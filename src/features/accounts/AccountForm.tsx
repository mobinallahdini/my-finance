import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react'
import type { Account } from '../../domain/models'
import { accountTypeLabels, accountWriteError } from './accountLabels'
import { dollarsForInput, parseDollars } from './money'

interface AccountFormProps {
  account?: Account
  disabled: boolean
  onSave: (account: Account) => Promise<void>
  onCancel: () => void
}

type FieldErrors = Partial<Record<'name' | 'openingBalance' | 'creditLimit', string>>

export function AccountForm({ account, disabled, onSave, onCancel }: AccountFormProps) {
  const prefix = useId()
  const nameRef = useRef<HTMLInputElement>(null)
  const balanceRef = useRef<HTMLInputElement>(null)
  const limitRef = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const [name, setName] = useState(account?.name ?? '')
  const [type, setType] = useState<Account['type']>(account?.type ?? 'bank')
  const [openingBalance, setOpeningBalance] = useState(() => dollarsForInput(account?.openingBalance ?? 0))
  const [creditLimit, setCreditLimit] = useState(() => account?.creditLimit === undefined ? '' : dollarsForInput(account.creditLimit))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const isCard = type === 'credit_card'

  useEffect(() => { nameRef.current?.focus() }, [])

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || submitting.current) return
    setSaveError(null)
    const nextErrors: FieldErrors = {}
    if (!name.trim()) nextErrors.name = 'Enter an account name.'

    let balanceCents = 0
    let limitCents: number | undefined
    try {
      balanceCents = parseDollars(openingBalance, true)
    } catch (error) {
      nextErrors.openingBalance = (error as Error).message
    }
    if (isCard && creditLimit.trim()) {
      try {
        limitCents = parseDollars(creditLimit)
      } catch (error) {
        nextErrors.creditLimit = (error as Error).message
      }
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      if (nextErrors.name) nameRef.current?.focus()
      else if (nextErrors.openingBalance) balanceRef.current?.focus()
      else limitRef.current?.focus()
      return
    }

    submitting.current = true
    try {
      const base = {
        id: account?.id ?? crypto.randomUUID(),
        name: name.trim(),
        openingBalance: balanceCents,
      }
      const record: Account = type === 'credit_card'
        ? { ...base, type: 'credit_card', ...(limitCents === undefined ? {} : { creditLimit: limitCents }) }
        : { ...base, type }
      await onSave(record)
    } catch (error) {
      setSaveError(accountWriteError(error))
    } finally {
      submitting.current = false
    }
  }

  return (
    <form className="account-form" onSubmit={handleSubmit} noValidate aria-labelledby={`${prefix}-heading`}>
      <h3 id={`${prefix}-heading`}>{account ? 'Edit account' : 'Add account'}</h3>
      <fieldset disabled={disabled}>
        <div className="account-field">
          <label htmlFor={`${prefix}-name`}>Account name</label>
          <input ref={nameRef} id={`${prefix}-name`} value={name} required
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? `${prefix}-name-error` : undefined} />
          {errors.name && <p className="account-error" id={`${prefix}-name-error`}>{errors.name}</p>}
        </div>
        <div className="account-field">
          <label htmlFor={`${prefix}-type`}>Account type</label>
          <select id={`${prefix}-type`} value={type}
            onChange={(event) => { setType(event.target.value as Account['type']); setErrors({}); setSaveError(null) }}
            aria-describedby={account ? `${prefix}-type-help` : undefined}>
            {Object.entries(accountTypeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          {account && <p id={`${prefix}-type-help`}>Accounts with transactions cannot change type.</p>}
        </div>
        <div className="account-field">
          <label htmlFor={`${prefix}-balance`}>
            {isCard ? 'Opening debt owed (CAD)' : 'Opening balance (CAD)'}
          </label>
          <input ref={balanceRef} id={`${prefix}-balance`} type="text" inputMode="decimal"
            value={openingBalance} required onChange={(event) => setOpeningBalance(event.target.value)}
            aria-invalid={Boolean(errors.openingBalance)}
            aria-describedby={`${prefix}-balance-help${errors.openingBalance ? ` ${prefix}-balance-error` : ''}`} />
          <p id={`${prefix}-balance-help`}>
            {isCard
              ? 'Enter the debt you owed before recorded transactions, not your available credit. Use a negative amount only for an overpayment (account credit).'
              : 'Enter the money available before recorded transactions. Use a negative amount only for a deficit or overdraft.'}
            {' '}Use dollars, such as 2000 or 12.34.
          </p>
          {errors.openingBalance && <p className="account-error" id={`${prefix}-balance-error`}>{errors.openingBalance}</p>}
        </div>
        {isCard && (
          <div className="account-field">
            <label htmlFor={`${prefix}-limit`}>Credit limit (CAD, optional)</label>
            <input ref={limitRef} id={`${prefix}-limit`} type="text" inputMode="decimal" value={creditLimit}
              onChange={(event) => setCreditLimit(event.target.value)} aria-invalid={Boolean(errors.creditLimit)}
              aria-describedby={`${prefix}-limit-help${errors.creditLimit ? ` ${prefix}-limit-error` : ''}`} />
            <p id={`${prefix}-limit-help`}>Enter zero or a positive amount. Leave blank if no limit is configured.</p>
            {errors.creditLimit && <p className="account-error" id={`${prefix}-limit-error`}>{errors.creditLimit}</p>}
          </div>
        )}
        <div className="account-actions">
          <button className="account-primary" type="submit">{disabled ? 'Saving…' : 'Save account'}</button>
          <button type="button" onClick={onCancel}>Cancel</button>
        </div>
      </fieldset>
      {Object.keys(errors).length > 0 && <p className="account-error" role="alert">Please correct the marked fields.</p>}
      {saveError && <p className="account-error" role="alert">{saveError}</p>}
    </form>
  )
}
