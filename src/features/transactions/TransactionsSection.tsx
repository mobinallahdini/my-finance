import { useMoney } from '../financeSettings/useMoney'
import { useEffect, useRef, useState } from 'react'
import { TransactionFilters } from './TransactionFilters'
import { TransactionForm } from './TransactionForm'
import { TransactionList } from './TransactionList'
import { transactionTypeLabels, type EntryTransaction } from './transactionHelpers'
import { emptyTransactionFilters, filterTransactions } from './transactionFiltering'
import { setTransactionFilters, useTransactionFilterSession } from './useTransactionFilterSession'
import { useTransactions } from './useTransactions'
import './transactions.css'

interface FocusTarget {
  element?: HTMLButtonElement
  transactionId?: string
}

export function TransactionsSection({ startNewTransaction = false }: { startNewTransaction?: boolean }) {
  const { formatAmount, currencyCode } = useMoney()
  const { transactions, accounts, categories, isLoading, isWriting, loadError, reload, saveTransaction, deleteTransaction } = useTransactions()
  const filters = useTransactionFilterSession()
  const [editor, setEditor] = useState<{ transaction?: EntryTransaction } | null>(() => startNewTransaction ? {} : null)
  const [status, setStatus] = useState('')
  const addRef = useRef<HTMLButtonElement>(null)
  const sectionRef = useRef<HTMLElement>(null)
  const opener = useRef<FocusTarget>({})
  const pendingFocus = useRef(false)
  const deleting = useRef(false)
  const busy = isLoading || isWriting
  const filteredTransactions = filterTransactions(transactions, accounts, categories, filters)

  // Writes trigger a read. Restore focus after that read recreates/enables rows.
  useEffect(() => {
    if (editor || busy || !pendingFocus.current) return
    pendingFocus.current = false
    const target = opener.current
    const row = target.transactionId
      ? sectionRef.current?.querySelector<HTMLButtonElement>(`[data-transaction-id="${CSS.escape(target.transactionId)}"]`)
      : null
    const element = target.element?.isConnected && !target.element.disabled ? target.element : row
    const focusTarget = element ?? addRef.current
    focusTarget?.focus()
  }, [editor, busy])

  function openEditor(element: HTMLButtonElement, transaction?: EntryTransaction) {
    opener.current = { element, transactionId: transaction?.id }
    setStatus('')
    setEditor({ transaction })
  }

  function closeEditor() {
    pendingFocus.current = true
    setEditor(null)
  }

  async function handleSave(transaction: EntryTransaction) {
    await saveTransaction(transaction, editor?.transaction !== undefined)
    setStatus(`${transactionTypeLabels[transaction.type]} ${formatAmount(transaction.amount)} on ${transaction.date} saved.`)
    closeEditor()
  }

  async function handleDelete(transaction: EntryTransaction) {
    if (busy || deleting.current) return
    if (!window.confirm(`Delete the ${formatAmount(transaction.amount)} ${transaction.type} on ${transaction.date}? This permanently removes this transaction.`)) return
    deleting.current = true
    try {
      await deleteTransaction(transaction.id)
      setStatus(`${transactionTypeLabels[transaction.type]} ${formatAmount(transaction.amount)} on ${transaction.date} deleted.`)
      closeEditor()
    } finally {
      deleting.current = false
    }
  }

  return (
    <section ref={sectionRef} className="transactions-section" aria-labelledby="transactions-heading">
      <div className="transactions-header">
        <h2 id="transactions-heading" tabIndex={-1}>Transactions</h2>
        <button ref={addRef} className="transaction-primary transaction-add" type="button" aria-haspopup="dialog"
          disabled={isWriting || editor !== null} onClick={(event) => openEditor(event.currentTarget)}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" focusable="false"><path d="M12 5v14M5 12h14" /></svg>
          Add Transaction
        </button>
      </div>
      <TransactionFilters filters={filters} accounts={accounts} categories={categories} onChange={setTransactionFilters} />
      <p className="transaction-status" role="status">{status}</p>
      <div aria-busy={busy}>
        {isLoading && <p className="transaction-loading" role="status">Loading transactions...</p>}
        {!isLoading && !loadError && <p className="transaction-count" role="status">{filteredTransactions.length} of {transactions.length} {transactions.length === 1 ? 'transaction' : 'transactions'}</p>}
        {loadError ? <div className="transaction-recovery">
          <p className="transaction-error" role="alert">{loadError}</p>
          <button type="button" onClick={reload} disabled={busy}>Refresh / Retry</button>
        </div> : !isLoading && transactions.length === 0 ? (
          <div className="transaction-ledger-empty">
            <h3>No transactions yet</h3>
            <p>Record your first expense, income, or transfer.</p>
            <button className="transaction-primary" type="button" aria-haspopup="dialog" onClick={(event) => openEditor(event.currentTarget)}>Add Transaction</button>
          </div>
        ) : transactions.length > 0 && (
          <>
            {filteredTransactions.length === 0 ? <div className="transaction-filter-empty">
              <p>No transactions match these filters.</p>
              <div className="transaction-filter-empty-actions">
                <button type="button" onClick={() => {
                  setTransactionFilters(emptyTransactionFilters())
                  sectionRef.current?.querySelector<HTMLButtonElement>('.transaction-filter-open')?.focus()
                }}>Clear filters</button>
              </div>
            </div>
              : <TransactionList transactions={filteredTransactions} accounts={accounts} categories={categories} disabled={busy}
                onOpen={(transaction, element) => openEditor(element, transaction)} />}
          </>
        )}
      </div>
      <p className="transaction-currency-note">All amounts in {currencyCode}.</p>
      {editor && <TransactionForm key={editor.transaction?.id ?? 'new'} transaction={editor.transaction}
        accounts={accounts} categories={categories} disabled={busy} isLoading={isLoading} loadError={loadError}
        onSave={handleSave} onCancel={closeEditor} onDelete={handleDelete} onRetry={reload} />}
    </section>
  )
}
