import type { Account, Transaction } from '../../domain/models'
import { calculateAccountBalance, calculateAvailableCredit } from '../../domain/calculations'
import { accountTypeLabels } from './accountLabels'
import { formatCad } from './money'

interface AccountListProps {
  accounts: readonly Account[]
  transactions: readonly Transaction[]
  disabled: boolean
  onEdit: (account: Account) => void
  onDelete: (account: Account) => void
}

function AccountBalances({ account, transactions }: Pick<AccountListProps, 'transactions'> & { account: Account }) {
  let balance: number
  let availableCredit: number | undefined
  try {
    balance = calculateAccountBalance(account, transactions)
    availableCredit = account.type === 'credit_card' ? calculateAvailableCredit(account, transactions) : undefined
  } catch {
    return <p className="account-error" role="alert">This balance could not be calculated safely. Review this account’s opening balance and recorded transactions.</p>
  }
  return (
    <dl className="account-balances">
      <div>
        <dt>{account.type === 'credit_card' ? 'Current debt owed' : 'Current balance'}</dt>
        <dd>{formatCad(balance)}</dd>
      </div>
      {account.type === 'credit_card' && (
        <>
          <div><dt>Credit limit</dt><dd>{account.creditLimit === undefined ? 'Not configured' : formatCad(account.creditLimit)}</dd></div>
          {availableCredit !== undefined && <div><dt>Available credit</dt><dd>{formatCad(availableCredit)}</dd></div>}
        </>
      )}
      {balance < 0 && <div className="account-balance-note"><dt>Balance note</dt><dd>{account.type === 'credit_card' ? 'Overpayment / account credit' : 'Deficit / overdraft'}</dd></div>}
      {availableCredit !== undefined && availableCredit < 0 && <div className="account-balance-note"><dt>Credit note</dt><dd>Over credit limit</dd></div>}
    </dl>
  )
}

export function AccountList({ accounts, transactions, disabled, onEdit, onDelete }: AccountListProps) {
  return (
    <ul className="account-list">
      {accounts.map((account) => (
        <li className="account-card" key={account.id}>
          <h3>{account.name}</h3>
          <p className="account-type">{accountTypeLabels[account.type]}</p>
          <AccountBalances account={account} transactions={transactions} />
          <div className="account-actions">
            <button type="button" disabled={disabled} onClick={() => onEdit(account)} aria-label={`Edit ${account.name}`}>Edit</button>
            <button className="account-delete" type="button" disabled={disabled} onClick={() => onDelete(account)} aria-label={`Delete ${account.name}`}>Delete</button>
          </div>
        </li>
      ))}
    </ul>
  )
}
