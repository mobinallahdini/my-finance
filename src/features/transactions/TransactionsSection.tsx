import { useRef, useState } from 'react'
import { calculateMonthlyTotalExpenses, calculateMonthlyTotalIncome } from '../../domain/calculations'
import { formatCad } from '../accounts/money'
import { TransactionForm } from './TransactionForm'
import { TransactionList } from './TransactionList'
import { isEligibleAccount, localCalendarDate, transactionTypeLabels, transactionWriteError, type EntryTransaction } from './transactionHelpers'
import { useTransactions } from './useTransactions'
import './transactions.css'

function MonthlyTotal({ transactions, month, type }: {
  transactions: readonly EntryTransaction[]
  month: string
  type: 'expense' | 'income'
}) {
  const label = type === 'expense' ? 'Spending' : 'Income'
  let total: number
  try {
    total = type === 'expense'
      ? calculateMonthlyTotalExpenses(transactions, month)
      : calculateMonthlyTotalIncome(transactions, month)
  } catch {
    return <p className="transaction-error" role="alert">{label} for {month} could not be calculated safely. Review the recorded {type} amounts.</p>
  }
  return <p>{label} for {month}: <strong>{formatCad(total)}</strong></p>
}

export function TransactionsSection({ startNewTransaction = false }: { startNewTransaction?: boolean }) {
  const { transactions, accounts, categories, isLoading, isWriting, loadError, reload, saveTransaction, deleteTransaction } = useTransactions()
  const [entryType, setEntryType] = useState<EntryTransaction['type']>('expense')
  const [editor, setEditor] = useState<{ transaction?: EntryTransaction } | null>(() => startNewTransaction ? {} : null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const deleting = useRef(false)
  const busy = isLoading || isWriting
  const eligibleAccounts = accounts.filter((account) => isEligibleAccount(account, entryType))
  const matchingCategories = categories.filter((category) => category.type === entryType)
  const canCreate = !loadError && (entryType === 'transfer'
    ? accounts.length >= 2
    : eligibleAccounts.length > 0 && matchingCategories.length > 0)
  const month = localCalendarDate().slice(0, 7)

  function openEditor(transaction?: EntryTransaction) {
    if (transaction) setEntryType(transaction.type)
    setEditor({ transaction })
    setActionError(null)
    setStatus('')
  }

  function closeEditor() {
    setEditor(null)
    headingRef.current?.focus()
  }

  async function handleSave(transaction: EntryTransaction) {
    await saveTransaction(transaction, editor?.transaction !== undefined)
    setEditor(null)
    setStatus(`${transactionTypeLabels[transaction.type]} ${formatCad(transaction.amount)} on ${transaction.date} saved.`)
    headingRef.current?.focus()
  }

  async function handleDelete(transaction: EntryTransaction) {
    if (busy || deleting.current) return
    if (!window.confirm(`Delete the ${formatCad(transaction.amount)} ${transaction.type} on ${transaction.date}? This permanently removes this transaction.`)) return
    deleting.current = true
    setActionError(null)
    setStatus('')
    try {
      await deleteTransaction(transaction.id)
      setStatus(`${transactionTypeLabels[transaction.type]} ${formatCad(transaction.amount)} on ${transaction.date} deleted.`)
      headingRef.current?.focus()
    } catch (error) {
      setActionError(transactionWriteError(error))
    } finally {
      deleting.current = false
    }
  }

  return (
    <section className="transactions-section" aria-labelledby="transactions-heading">
      <div className="transactions-header">
        <h2 ref={headingRef} id="transactions-heading" tabIndex={-1}>Transactions</h2>
        <div className="transaction-actions">
          <button type="button" disabled={busy} onClick={() => { setActionError(null); setStatus(''); reload() }}>Refresh</button>
          <button className="transaction-primary" type="button" disabled={busy || !canCreate || editor !== null}
            onClick={() => openEditor()}>Add {entryType}</button>
        </div>
      </div>
      <p>Record expenses, income, and transfers. All amounts are in CAD and stored in this browser.</p>
      <fieldset className="transaction-type-picker" disabled={busy || editor !== null}>
        <legend>Transaction type</legend>
        {(['expense', 'income', 'transfer'] as const).map((type) => (
          <label className="transaction-type-choice" key={type}>
            <input type="radio" name="transaction-type" value={type} checked={entryType === type}
              onChange={() => { setEntryType(type); setActionError(null); setStatus('') }} />
            {transactionTypeLabels[type]}
          </label>
        ))}
      </fieldset>
      <p className="transaction-status" role="status">{status}</p>
      {actionError && <p className="transaction-error" role="alert">{actionError}</p>}
      {!isLoading && !loadError && (
        <>
          {entryType === 'transfer' ? (
            accounts.length < 2 && <p className="transactions-empty">Create at least two accounts in the Accounts section before adding a transfer. No category is needed.</p>
          ) : (
            <>
              {eligibleAccounts.length === 0 && <p className="transactions-empty">{entryType === 'income'
                ? 'Create a bank or cash account in the Accounts section before adding income. Credit cards cannot receive income.'
                : 'Create an account in the Accounts section before adding an expense.'}</p>}
              {matchingCategories.length === 0 && <p className="transactions-empty">Create an {transactionTypeLabels[entryType]} category in the Categories section before adding {entryType}.</p>}
            </>
          )}
        </>
      )}
      {editor && !isLoading && <TransactionForm key={editor.transaction?.id ?? `new-${entryType}`} transaction={editor.transaction}
        type={entryType} accounts={accounts} categories={categories}
        disabled={busy} canSave={canCreate} onSave={handleSave} onCancel={closeEditor} />}
      <div aria-busy={busy}>
        {isLoading && <p role="status">Loading transactions...</p>}
        {loadError && <p className="transaction-error" role="alert">{loadError}</p>}
        {!isLoading && !loadError && (
          <>
            <div className="transaction-monthly" role="group" aria-label="Current month totals">
              <MonthlyTotal transactions={transactions} month={month} type="expense" />
              <MonthlyTotal transactions={transactions} month={month} type="income" />
            </div>
            <h3 className="transaction-history-heading">Transaction history</h3>
            <p>All recorded expenses, income, and transfers, newest date first.</p>
            <TransactionList transactions={transactions} accounts={accounts} categories={categories} disabled={busy || editor !== null}
              onEdit={openEditor} onDelete={(transaction) => { void handleDelete(transaction) }} />
          </>
        )}
      </div>
    </section>
  )
}
