import { useEffect, useRef, useState } from 'react'
import type { Account } from '../../domain/models'
import { AccountForm } from './AccountForm'
import { AccountList } from './AccountList'
import { AccountDetails } from './AccountDetails'
import { accountTypeLabels } from './accountLabels'
import { useAccounts } from './useAccounts'
import './accounts.css'

export function AccountsSection({ accountId }: { accountId?: string }) {
  const { accounts, transactions, isLoading, isWriting, loadError, reload, saveAccount, deleteAccount } = useAccounts()
  const [editor, setEditor] = useState<{ account?: Account; initialType?: Account['type']; routeAccountId?: string } | null>(null)
  const [status, setStatus] = useState('')
  const addRef = useRef<HTMLButtonElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const opener = useRef<{ element?: HTMLButtonElement; accountId?: string }>({})
  const pendingFocus = useRef(false)
  const deleting = useRef(false)
  const deletedAccount = useRef(false)
  const returnAccountId = useRef(accountId)
  const busy = isLoading || isWriting
  const selectedAccount = accounts.find((account) => account.id === accountId)
  // An accepted Back/Forward closes the editor, even within the Accounts destination.
  if (editor && editor.routeAccountId !== accountId) setEditor(null)

  useEffect(() => {
    // Navigate after the editor has unmounted and removed its dirty-navigation guard.
    if (!editor && deletedAccount.current) {
      deletedAccount.current = false
      window.location.hash = 'accounts'
    }
  }, [editor])

  useEffect(() => {
    if (accountId !== undefined) {
      returnAccountId.current = accountId
      return
    }
    if (busy || editor || returnAccountId.current === undefined) return
    const row = sectionRef.current?.querySelector<HTMLButtonElement>(`[data-account-id="${CSS.escape(returnAccountId.current)}"]`)
    returnAccountId.current = undefined
    const focusTarget = row ?? addRef.current
    focusTarget?.focus({ preventScroll: true })
    // The shell resets destination scroll in its effect; reveal restored focus afterward.
    const frame = window.requestAnimationFrame(() => {
      if (focusTarget?.isConnected && document.activeElement === focusTarget) {
        focusTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      }
    })
    return () => window.cancelAnimationFrame(frame)
  }, [accountId, busy, editor])

  useEffect(() => {
    if (editor || busy || !pendingFocus.current) return
    pendingFocus.current = false
    const target = opener.current
    const surface = target.accountId
      ? sectionRef.current?.querySelector<HTMLButtonElement>(`[data-account-id="${CSS.escape(target.accountId)}"]`)
      : null
    const element = target.element?.isConnected && !target.element.disabled ? target.element : surface
    const focusTarget = element ?? (accountId !== undefined ? editRef.current : addRef.current)
      ?? sectionRef.current?.querySelector<HTMLElement>('h2')
    focusTarget?.focus()
  }, [editor, busy, accountId])

  function openEditor(element: HTMLButtonElement, account?: Account, initialType?: Account['type']) {
    opener.current = { element, accountId: account?.id }
    setEditor({ account, initialType, routeAccountId: accountId })
    setStatus('')
  }

  function closeEditor() {
    pendingFocus.current = true
    setEditor(null)
  }

  async function handleSave(account: Account) {
    await saveAccount(account, editor?.account !== undefined)
    setStatus(`Account “${account.name}” saved.`)
    closeEditor()
  }

  async function handleDelete(account: Account) {
    if (busy || deleting.current) return
    if (!window.confirm(`Delete “${account.name}”? This permanently removes the account. Accounts with transactions cannot be deleted.`)) return
    deleting.current = true
    setStatus('')
    try {
      await deleteAccount(account.id)
      setStatus(`Account “${account.name}” deleted.`)
      deletedAccount.current = accountId !== undefined
      closeEditor()
    } finally {
      deleting.current = false
    }
  }

  return (
    <section ref={sectionRef} className={`accounts-section${accountId !== undefined ? ' account-details-section' : ''}`} aria-labelledby="accounts-heading">
      {accountId !== undefined ? <>
        <a className="account-details-back" href="#accounts"><span aria-hidden="true">←</span> Back to Accounts</a>
        <div className="account-details-header">
          <div className="account-details-title">
            <h2 id="accounts-heading" tabIndex={-1}>{selectedAccount?.name ?? (isLoading || loadError ? 'Account details' : 'Account unavailable')}</h2>
            {selectedAccount && <p className="account-type">{accountTypeLabels[selectedAccount.type]}</p>}
          </div>
          {selectedAccount && <button ref={editRef} className="button-quiet account-details-edit" type="button" aria-haspopup="dialog"
            disabled={busy || editor !== null} onClick={(event) => openEditor(event.currentTarget, selectedAccount)}>Edit</button>}
        </div>
      </> : <div className="accounts-header">
        <h2 id="accounts-heading" tabIndex={-1}>Accounts</h2>
        <button ref={addRef} className="account-primary account-add" type="button" aria-haspopup="dialog"
          disabled={isWriting || editor !== null} onClick={(event) => openEditor(event.currentTarget)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg>
          Add Account
        </button>
      </div>}
      <p className="account-status" role="status">{status}</p>
      <div aria-busy={busy}>
        {isLoading && <p className="account-loading" role="status">Loading accounts…</p>}
        {loadError ? <div className="account-recovery">
          <p className="account-error" role="alert">{loadError}</p>
          <button type="button" disabled={busy} onClick={reload}>Retry</button>
        </div> : accountId !== undefined ? (!isLoading && !selectedAccount && <p className="account-loading">This account no longer exists. Return to Accounts to choose another account.</p>)
          : (!isLoading || accounts.length > 0) && (
          <AccountList accounts={accounts} transactions={transactions} disabled={busy}
            onOpen={(account) => { setStatus(''); window.location.hash = `accounts/${encodeURIComponent(account.id)}` }}
            onAdd={(type, element) => openEditor(element, undefined, type)} />
        )}
      </div>
      {accountId !== undefined && selectedAccount && <AccountDetails key={accountId} account={selectedAccount}
        accounts={accounts} transactions={transactions} isLoading={isLoading} loadError={loadError} />}
      <p className="account-currency-note">All amounts in CAD.</p>
      {editor && <AccountForm key={editor.account?.id ?? 'new'} account={editor.account} initialType={editor.initialType}
        disabled={busy} isLoading={isLoading} loadError={loadError}
        onSave={handleSave} onCancel={closeEditor} onDelete={handleDelete} onRetry={reload} />}
    </section>
  )
}
