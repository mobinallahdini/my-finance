import { useRef, useState } from 'react'
import type { Account } from '../../domain/models'
import { AccountForm } from './AccountForm'
import { AccountList } from './AccountList'
import { accountWriteError } from './accountLabels'
import { useAccounts } from './useAccounts'
import './accounts.css'

export function AccountsSection() {
  const { accounts, transactions, isLoading, isWriting, loadError, reload, saveAccount, deleteAccount } = useAccounts()
  const [editor, setEditor] = useState<{ account?: Account } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const deleting = useRef(false)
  const busy = isLoading || isWriting

  function openEditor(account?: Account) {
    setEditor({ account })
    setActionError(null)
    setStatus('')
  }

  function closeEditor() {
    setEditor(null)
    headingRef.current?.focus()
  }

  async function handleSave(account: Account) {
    await saveAccount(account, editor?.account !== undefined)
    setEditor(null)
    setStatus(`Account “${account.name}” saved.`)
    // The list reloads after a write; focus its stable heading meanwhile.
    headingRef.current?.focus()
  }

  async function handleDelete(account: Account) {
    if (busy || deleting.current) return
    if (!window.confirm(`Delete “${account.name}”? This permanently removes the account. Accounts with transactions cannot be deleted.`)) return
    deleting.current = true
    setActionError(null)
    setStatus('')
    try {
      await deleteAccount(account.id)
      setStatus(`Account “${account.name}” deleted.`)
      headingRef.current?.focus()
    } catch (error) {
      setActionError(accountWriteError(error))
    } finally {
      deleting.current = false
    }
  }

  return (
    <section className="accounts-section" aria-labelledby="accounts-heading">
      <div className="accounts-header">
        <h2 ref={headingRef} id="accounts-heading" tabIndex={-1}>Accounts</h2>
        <div className="account-actions">
          <button type="button" disabled={busy || editor !== null} onClick={reload}>Refresh</button>
          <button className="account-primary" type="button" disabled={busy || Boolean(loadError) || editor !== null}
            onClick={() => openEditor()}>Add account</button>
        </div>
      </div>
      <p>Manage your accounts. All amounts are in CAD and stored in this browser.</p>
      <p className="account-status" role="status">{status}</p>
      {actionError && <p className="account-error" role="alert">{actionError}</p>}
      {editor && <AccountForm key={editor.account?.id ?? 'new'} account={editor.account} disabled={busy}
        onSave={handleSave} onCancel={closeEditor} />}
      <div aria-busy={busy}>
        {isLoading && <p role="status">Loading accounts…</p>}
        {loadError && <p className="account-error" role="alert">{loadError} Use Refresh to retry.</p>}
        {!isLoading && !loadError && (
          accounts.length === 0
            ? <p className="accounts-empty">No accounts yet. Add a bank, cash, or credit card account to get started.</p>
            : <AccountList accounts={accounts} transactions={transactions} disabled={busy || editor !== null}
              onEdit={openEditor} onDelete={(account) => { void handleDelete(account) }} />
        )}
      </div>
    </section>
  )
}
