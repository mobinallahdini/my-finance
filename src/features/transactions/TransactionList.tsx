import type { Account, Category } from '../../domain/models'
import { formatCad } from '../accounts/money'
import { isEligibleAccount, transactionTypeLabels, type EntryTransaction } from './transactionHelpers'

interface TransactionListProps {
  transactions: readonly EntryTransaction[]
  accounts: readonly Account[]
  categories: readonly Category[]
  disabled: boolean
  onEdit: (transaction: EntryTransaction) => void
  onDelete: (transaction: EntryTransaction) => void
}

export function TransactionList({ transactions, accounts, categories, disabled, onEdit, onDelete }: TransactionListProps) {
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]))
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]))

  if (transactions.length === 0) {
    return <p className="transactions-empty">No transactions yet. Choose a type and add a transaction to start your history.</p>
  }

  return (
    <ul className="transaction-list">
      {transactions.map((transaction) => (
        <li className="transaction-card" key={transaction.id}>
          <div className="transaction-card-header">
            <h4>{transaction.type === 'transfer' ? 'Transfer' : categoryNames.get(transaction.categoryId) ?? `Unavailable category (${transaction.categoryId})`}</h4>
            <strong>{formatCad(transaction.amount)}</strong>
          </div>
          <p className={`transaction-type transaction-type-${transaction.type}`}>{transactionTypeLabels[transaction.type]}</p>
          <dl className="transaction-details">
            <div><dt>Date</dt><dd><time dateTime={transaction.date}>{transaction.date}</time></dd></div>
            {transaction.type === 'transfer' ? (
              <>
                <div><dt>From account</dt><dd>{accountNames.get(transaction.fromAccountId) ?? `Unavailable account (${transaction.fromAccountId})`}</dd></div>
                <div><dt>To account</dt><dd>{accountNames.get(transaction.toAccountId) ?? `Unavailable account (${transaction.toAccountId})`}</dd></div>
              </>
            ) : (
              <div><dt>{transaction.type === 'income' ? 'Destination account' : 'Account'}</dt><dd>{accountNames.get(transaction.accountId) ?? `Unavailable account (${transaction.accountId})`}</dd></div>
            )}
          </dl>
          {transaction.type === 'income' && accounts.some((account) => account.id === transaction.accountId && !isEligibleAccount(account, 'income')) && (
            <p className="transaction-error">This income uses an ineligible account. Edit it to choose a bank or cash destination.</p>
          )}
          {transaction.note && <p className="transaction-note">{transaction.note}</p>}
          <div className="transaction-actions">
            <button type="button" disabled={disabled} onClick={() => onEdit(transaction)}
              aria-label={`Edit ${transaction.type} ${formatCad(transaction.amount)} on ${transaction.date}`}>Edit</button>
            <button className="transaction-delete" type="button" disabled={disabled} onClick={() => onDelete(transaction)}
              aria-label={`Delete ${transaction.type} ${formatCad(transaction.amount)} on ${transaction.date}`}>Delete</button>
          </div>
        </li>
      ))}
    </ul>
  )
}
