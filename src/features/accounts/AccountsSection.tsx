import { useEffect, useRef, useState } from 'react'
import type { Account } from '../../domain/models'
import { AccountForm } from './AccountForm'
import { AccountList } from './AccountList'
import { useAccounts } from './useAccounts'
import './accounts.css'

export function AccountsSection() {
  const { accounts, transactions, isLoading, isWriting, loadError, reload, saveAccount, deleteAccount } = useAccounts()
  const [editor, setEditor] = useState<{ account?: Account; initialType?: Account['type'] } | null>(null)
  const [status, setStatus] = useState('')
  const addRef = useRef<HTMLButtonElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const opener = useRef<{ element?: HTMLButtonElement; accountId?: string }>({})
  const pendingFocus = useRef(false)
  const deleting = useRef(false)
  const busy = isLoading || isWriting

  useEffect(() => {
    if (editor || busy || !pendingFocus.current) return
    pendingFocus.current = false
    const target = opener.current
    const surface = target.accountId
      ? sectionRef.current?.querySelector<HTMLButtonElement>(`[data-account-id="${CSS.escape(target.accountId)}"]`)
      : null
    const element = target.element?.isConnected && !target.element.disabled ? target.element : surface
    const focusTarget = element ?? addRef.current
    focusTarget?.focus()
  }, [editor, busy])

  function openEditor(element: HTMLButtonElement, account?: Account, initialType?: Account['type']) {
    opener.current = { element, accountId: account?.id }
    setEditor({ account, initialType })
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
      closeEditor()
    } finally {
      deleting.current = false
    }
  }

  return (
    <section ref={sectionRef} className="accounts-section" aria-labelledby="accounts-heading">
      <div className="accounts-header">
        <h2 id="accounts-heading" tabIndex={-1}>Accounts</h2>
        <button ref={addRef} className="account-primary account-add" type="button" aria-haspopup="dialog"
          disabled={isWriting || editor !== null} onClick={(event) => openEditor(event.currentTarget)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg>
          Add Account
        </button>
      </div>
      <p className="account-status" role="status">{status}</p>
      <div aria-busy={busy}>
        {isLoading && <p className="account-loading" role="status">Loading accounts…</p>}
        {loadError ? <div className="account-recovery">
          <p className="account-error" role="alert">{loadError}</p>
          <button type="button" disabled={busy} onClick={reload}>Retry</button>
        </div> : (!isLoading || accounts.length > 0) && (
          <AccountList accounts={accounts} transactions={transactions} disabled={busy}
            onOpen={(account, element) => openEditor(element, account)}
            onAdd={(type, element) => openEditor(element, undefined, type)} />
        )}
      </div>
      <p className="account-currency-note">All amounts in CAD.</p>
      {editor && <AccountForm key={editor.account?.id ?? 'new'} account={editor.account} initialType={editor.initialType}
        disabled={busy} isLoading={isLoading} loadError={loadError}
        onSave={handleSave} onCancel={closeEditor} onDelete={handleDelete} onRetry={reload} />}
    </section>
  )
}
