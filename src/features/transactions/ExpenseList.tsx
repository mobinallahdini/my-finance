import type { Account, Category, ExpenseTransaction } from '../../domain/models'
import { formatCad } from '../accounts/money'

interface ExpenseListProps {
  expenses: readonly ExpenseTransaction[]
  accounts: readonly Account[]
  categories: readonly Category[]
  disabled: boolean
  onEdit: (expense: ExpenseTransaction) => void
  onDelete: (expense: ExpenseTransaction) => void
}

export function ExpenseList({ expenses, accounts, categories, disabled, onEdit, onDelete }: ExpenseListProps) {
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]))
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]))

  if (expenses.length === 0) {
    return <p className="expenses-empty">No expenses yet. Add an expense to start your transaction history.</p>
  }

  return (
    <ul className="expense-list">
      {expenses.map((expense) => (
        <li className="expense-card" key={expense.id}>
          <div className="expense-card-header">
            <h4>{categoryNames.get(expense.categoryId) ?? `Unavailable category (${expense.categoryId})`}</h4>
            <strong>{formatCad(expense.amount)}</strong>
          </div>
          <dl className="expense-details">
            <div><dt>Date</dt><dd><time dateTime={expense.date}>{expense.date}</time></dd></div>
            <div><dt>Account</dt><dd>{accountNames.get(expense.accountId) ?? `Unavailable account (${expense.accountId})`}</dd></div>
          </dl>
          {expense.note && <p className="expense-note">{expense.note}</p>}
          <div className="expense-actions">
            <button type="button" disabled={disabled} onClick={() => onEdit(expense)}
              aria-label={`Edit expense ${formatCad(expense.amount)} on ${expense.date}`}>Edit</button>
            <button className="expense-delete" type="button" disabled={disabled} onClick={() => onDelete(expense)}
              aria-label={`Delete expense ${formatCad(expense.amount)} on ${expense.date}`}>Delete</button>
          </div>
        </li>
      ))}
    </ul>
  )
}
