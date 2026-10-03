import { useRef, useState } from 'react'
import { calculateMonthlyTotalExpenses } from '../../domain/calculations'
import type { ExpenseTransaction } from '../../domain/models'
import { formatCad } from '../accounts/money'
import { ExpenseForm } from './ExpenseForm'
import { ExpenseList } from './ExpenseList'
import { expenseWriteError, localCalendarDate } from './expenseHelpers'
import { useExpenses } from './useExpenses'
import './transactions.css'

function MonthlySpending({ expenses }: { expenses: readonly ExpenseTransaction[] }) {
  const month = localCalendarDate().slice(0, 7)
  let total: number
  try {
    total = calculateMonthlyTotalExpenses(expenses, month)
  } catch {
    return <p className="expense-error" role="alert">Spending for {month} could not be calculated safely. Review the recorded expense amounts.</p>
  }
  return <p className="expense-monthly">Spending for {month}: <strong>{formatCad(total)}</strong></p>
}

export function TransactionsSection() {
  const { expenses, accounts, categories, isLoading, isWriting, loadError, reload, saveExpense, deleteExpense } = useExpenses()
  const [editor, setEditor] = useState<{ expense?: ExpenseTransaction } | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const deleting = useRef(false)
  const busy = isLoading || isWriting
  const canCreate = accounts.length > 0 && categories.length > 0 && !loadError

  function openEditor(expense?: ExpenseTransaction) {
    setEditor({ expense })
    setActionError(null)
    setStatus('')
  }

  function closeEditor() {
    setEditor(null)
    headingRef.current?.focus()
  }

  async function handleSave(expense: ExpenseTransaction) {
    await saveExpense(expense, editor?.expense !== undefined)
    setEditor(null)
    setStatus(`Expense ${formatCad(expense.amount)} on ${expense.date} saved.`)
    headingRef.current?.focus()
  }

  async function handleDelete(expense: ExpenseTransaction) {
    if (busy || deleting.current) return
    if (!window.confirm(`Delete the ${formatCad(expense.amount)} expense on ${expense.date}? This permanently removes this transaction.`)) return
    deleting.current = true
    setActionError(null)
    setStatus('')
    try {
      await deleteExpense(expense.id)
      setStatus(`Expense ${formatCad(expense.amount)} on ${expense.date} deleted.`)
      headingRef.current?.focus()
    } catch (error) {
      setActionError(expenseWriteError(error))
    } finally {
      deleting.current = false
    }
  }

  return (
    <section className="transactions-section" aria-labelledby="transactions-heading">
      <div className="transactions-header">
        <h2 ref={headingRef} id="transactions-heading" tabIndex={-1}>Transactions</h2>
        <div className="expense-actions">
          <button type="button" disabled={busy} onClick={() => { setActionError(null); setStatus(''); reload() }}>Refresh</button>
          <button className="expense-primary" type="button" disabled={busy || !canCreate || editor !== null}
            onClick={() => openEditor()}>Add expense</button>
        </div>
      </div>
      <p>Record expenses and view your history. All amounts are in CAD and stored in this browser.</p>
      <p className="expense-status" role="status">{status}</p>
      {actionError && <p className="expense-error" role="alert">{actionError}</p>}
      {!isLoading && !loadError && (
        <>
          {accounts.length === 0 && <p className="expenses-empty">Create an account in the Accounts section before adding an expense.</p>}
          {categories.length === 0 && <p className="expenses-empty">Create an Expense category in the Categories section before adding an expense.</p>}
        </>
      )}
      {editor && <ExpenseForm key={editor.expense?.id ?? 'new'} expense={editor.expense} accounts={accounts} categories={categories}
        disabled={busy} canSave={Boolean(canCreate)} onSave={handleSave} onCancel={closeEditor} />}
      <div aria-busy={busy}>
        {isLoading && <p role="status">Loading expenses...</p>}
        {loadError && <p className="expense-error" role="alert">{loadError}</p>}
        {!isLoading && !loadError && (
          <>
            <MonthlySpending expenses={expenses} />
            <h3 className="expense-history-heading">Expense history</h3>
            <p>All recorded expenses, newest date first.</p>
            <ExpenseList expenses={expenses} accounts={accounts} categories={categories} disabled={busy || editor !== null}
              onEdit={openEditor} onDelete={(expense) => { void handleDelete(expense) }} />
          </>
        )}
      </div>
    </section>
  )
}
