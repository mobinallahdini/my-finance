import { useId } from 'react'
import type { Account, Category } from '../../domain/models'
import { isEligibleAccount, transactionTypeLabels, type EntryTransaction } from './transactionHelpers'
import { readableTransactionDate, signedTransactionAmount } from './transactionPresentation'

export function TransactionList({ transactions, accounts, categories, disabled, onOpen, accountContext = false }: {
  transactions: readonly EntryTransaction[]
  accounts: readonly Account[]
  categories: readonly Category[]
  disabled: boolean
  onOpen?: (transaction: EntryTransaction, opener: HTMLButtonElement) => void
  accountContext?: boolean
}) {
  const prefix = useId()
  const DateHeading = accountContext ? 'h4' : 'h3'
  const accountNames = new Map(accounts.map((account) => [account.id, account.name]))
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]))
  const accountName = (id: string) => accountNames.get(id) ?? `Unavailable account (${id})`
  const groups = new Map<string, EntryTransaction[]>()
  // Filtering preserves the existing date-descending, ID-ascending history order.
  for (const transaction of transactions) {
    const group = groups.get(transaction.date) ?? []
    group.push(transaction)
    groups.set(transaction.date, group)
  }

  return (
    <div className="transaction-history">
      {Array.from(groups, ([date, records]) => (
        <section key={date} className="transaction-date-group" aria-labelledby={`${prefix}-${date}`}>
          <DateHeading id={`${prefix}-${date}`}><time dateTime={date}>{readableTransactionDate(date)}</time></DateHeading>
          <ul className="transaction-list">
            {records.map((transaction) => {
              const content = <>
                <span className="transaction-row-main">
                  <span className="transaction-row-title">{transaction.type === 'transfer' ? 'Transfer' : categoryNames.get(transaction.categoryId) ?? `Unavailable category (${transaction.categoryId})`}</span>
                  <span className={`transaction-row-amount financial-${transaction.type === 'transfer' ? 'neutral' : transaction.type}`}>{signedTransactionAmount(transaction)}</span>
                </span>
                <span className="transaction-row-detail">
                  {transaction.type === 'transfer' ? <>
                    <span aria-hidden="true">{accountName(transaction.fromAccountId)} → {accountName(transaction.toAccountId)}</span>
                    <span className="transaction-sr-only">From {accountName(transaction.fromAccountId)} to {accountName(transaction.toAccountId)}</span>
                  </> : accountContext ? transactionTypeLabels[transaction.type]
                    : `${transactionTypeLabels[transaction.type]} · ${accountName(transaction.accountId)}`}
                </span>
                {transaction.type === 'income' && accounts.some((account) => account.id === transaction.accountId && !isEligibleAccount(account, 'income')) && (
                  <span className="transaction-row-warning">This income uses an ineligible account.{onOpen && ' Open to choose a bank or cash destination.'}</span>
                )}
              </>
              return <li key={transaction.id}>
                {onOpen ? <button className="transaction-row" type="button" disabled={disabled}
                  data-transaction-id={transaction.id} onClick={(event) => onOpen(transaction, event.currentTarget)}
                  aria-haspopup="dialog">{content}</button>
                  : <div className="transaction-row" data-transaction-id={transaction.id}>{content}</div>}
              </li>
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}
