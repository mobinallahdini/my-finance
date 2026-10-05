import { useMoney } from '../financeSettings/useMoney'
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type SubmitEvent } from 'react'
import type { Account } from '../../domain/models'
import { accountTypeLabels, accountWriteError } from './accountLabels'
import { dollarsForInput, parseDollars } from './money'

interface AccountFormProps {
  account?: Account
  initialType?: Account['type']
  disabled: boolean
  isLoading: boolean
  loadError: string | null
  onSave: (account: Account) => Promise<void>
  onCancel: () => void
  onDelete: (account: Account) => Promise<void>
  onRetry: () => void
}

type FieldErrors = Partial<Record<'name' | 'openingBalance' | 'creditLimit', string>>

export function AccountForm({ account, initialType, disabled, isLoading, loadError, onSave, onCancel, onDelete, onRetry }: AccountFormProps) {
  const { currencyCode } = useMoney()
  const prefix = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const errorRef = useRef<HTMLParagraphElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const balanceRef = useRef<HTMLInputElement>(null)
  const limitRef = useRef<HTMLInputElement>(null)
  const submitting = useRef(false)
  const navigationAllowed = useRef(false)
  const editorURL = useRef(window.location.href)
  const [initial] = useState(() => ({
    name: account?.name ?? '',
    type: account?.type ?? initialType ?? 'bank',
    openingBalance: dollarsForInput(account?.openingBalance ?? 0),
    creditLimit: account?.creditLimit === undefined ? '' : dollarsForInput(account.creditLimit),
  }))
  const [name, setName] = useState(initial.name)
  const [type, setType] = useState<Account['type']>(initial.type)
  const [openingBalance, setOpeningBalance] = useState(initial.openingBalance)
  const [creditLimit, setCreditLimit] = useState(initial.creditLimit)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)
  const isCard = type === 'credit_card'

  const dirty = name !== initial.name || type !== initial.type
    || openingBalance !== initial.openingBalance || creditLimit !== initial.creditLimit

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
    if (disabled || errorRef.current) return
    nameRef.current?.focus()
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
      if (disabled || submitting.current || (dirty && !window.confirm('Discard unsaved account changes? Your changes will be lost.'))) {
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
    return !dirty || window.confirm('Discard unsaved account changes? Your changes will be lost.')
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

  useEffect(() => {
    if (!saveError) return
    errorRef.current?.focus()
    errorRef.current?.scrollIntoView({ block: 'nearest' })
  }, [saveError])

  function clearError(field: keyof FieldErrors) {
    setErrors((current) => {
      const next = { ...current }
      delete next[field]
      return next
    })
    setSaveError(null)
  }

  async function handleDelete() {
    if (!account || disabled || submitting.current) return
    submitting.current = true
    setSaveError(null)
    try {
      await onDelete(account)
    } catch (error) {
      setSaveError(accountWriteError(error))
    } finally {
      submitting.current = false
    }
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault()
    if (disabled || loadError || submitting.current) return
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
    <dialog ref={dialogRef} className="account-editor" aria-labelledby={`${prefix}-heading`}
      onKeyDown={containKeyboardFocus} onCancel={(event) => { event.preventDefault(); requestClose() }}>
      <form className="account-form" onSubmit={handleSubmit} noValidate aria-busy={disabled}>
        <header className="account-editor-header">
          <button className="button-quiet" type="button" disabled={disabled} onClick={requestClose}>Cancel</button>
          <h2 id={`${prefix}-heading`} tabIndex={-1}>{account ? 'Edit account' : 'New account'}</h2>
          <button className="account-primary" type="submit" disabled={disabled || Boolean(loadError)}>Save</button>
        </header>
        <div className="account-editor-body" onFocusCapture={(event) => {
          const field = event.target
          if (field instanceof HTMLElement && field.matches('input, select')) {
            field.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          }
        }}>
          {isLoading && <p className="account-loading" role="status">Loading accounts...</p>}
          {loadError && <div className="account-recovery">
            <p className="account-error" role="alert">{loadError}</p>
            <button type="button" disabled={disabled} onClick={onRetry}>Retry</button>
          </div>}
          <fieldset disabled={disabled}>
            <div className="account-field">
              <label htmlFor={`${prefix}-name`}>Account name</label>
              <input ref={nameRef} id={`${prefix}-name`} value={name} required
                onChange={(event) => { setName(event.target.value); clearError('name') }}
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
                {isCard ? `Opening debt owed (${currencyCode})` : `Opening balance (${currencyCode})`}
              </label>
              <input ref={balanceRef} id={`${prefix}-balance`} type="text" inputMode="decimal"
                value={openingBalance} required onChange={(event) => { setOpeningBalance(event.target.value); clearError('openingBalance') }}
                aria-invalid={Boolean(errors.openingBalance)}
                aria-describedby={`${prefix}-balance-help${errors.openingBalance ? ` ${prefix}-balance-error` : ''}`} />
              <p id={`${prefix}-balance-help`}>
                {isCard
                  ? 'Debt before recorded transactions. Use a negative amount for account credit.'
                  : 'Balance before recorded transactions. Use a negative amount for an overdraft or deficit.'}
              </p>
              {errors.openingBalance && <p className="account-error" id={`${prefix}-balance-error`}>{errors.openingBalance}</p>}
            </div>
            {isCard && (
              <div className="account-field">
                <label htmlFor={`${prefix}-limit`}>Credit limit ({currencyCode}, optional)</label>
                <input ref={limitRef} id={`${prefix}-limit`} type="text" inputMode="decimal" value={creditLimit}
                  onChange={(event) => { setCreditLimit(event.target.value); clearError('creditLimit') }} aria-invalid={Boolean(errors.creditLimit)}
                  aria-describedby={`${prefix}-limit-help${errors.creditLimit ? ` ${prefix}-limit-error` : ''}`} />
                <p id={`${prefix}-limit-help`}>Enter zero or a positive amount. Leave blank if no limit is configured.</p>
                {errors.creditLimit && <p className="account-error" id={`${prefix}-limit-error`}>{errors.creditLimit}</p>}
              </div>
            )}
          </fieldset>
          {Object.keys(errors).length > 0 && <p className="account-error" role="alert">Please correct the marked fields.</p>}
          {saveError && <p ref={errorRef} className="account-error" role="alert" tabIndex={-1}>{saveError}</p>}
          {account && <div className="account-editor-delete">
            <button className="button-quiet button-destructive" type="button" disabled={disabled}
              onClick={() => { void handleDelete() }}>Delete account</button>
          </div>}
        </div>
      </form>
    </dialog>
  )
}
