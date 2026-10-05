import { useId } from 'react'
import type { Account, Transaction } from '../../domain/models'
import { AccountBalances } from './AccountBalances'
import { accountTypeLabels } from './accountLabels'

interface AccountListProps {
  accounts: readonly Account[]
  transactions: readonly Transaction[]
  disabled: boolean
  onOpen: (account: Account, opener: HTMLButtonElement) => void
  onAdd: (type: Account['type'], opener: HTMLButtonElement) => void
}

function AccountCard({ account, transactions, disabled, onOpen }: Pick<AccountListProps, 'transactions' | 'disabled' | 'onOpen'> & { account: Account }) {
  const prefix = useId()
  return (
    <li className="account-card">
      <h4 id={`${prefix}-name`}>{account.name}</h4>
      <p className="account-type">{accountTypeLabels[account.type]}</p>
      <div id={`${prefix}-balances`}><AccountBalances account={account} transactions={transactions} /></div>
      <button className="account-open" type="button" aria-label={`View ${account.name} account details`} aria-describedby={`${prefix}-balances`}
        data-account-id={account.id} disabled={disabled}
        onClick={(event) => onOpen(account, event.currentTarget)} />
    </li>
  )
}

export function AccountList({ accounts, transactions, disabled, onOpen, onAdd }: AccountListProps) {
  // Retain name ordering and resolve equal names by ID for a stable presentation.
  const orderedAccounts = [...accounts].sort((left, right) => left.name.localeCompare(right.name)
    || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
  const groups = [
    { id: 'bank-cash', title: 'Bank & Cash', type: 'bank' as const, accounts: orderedAccounts.filter((account) => account.type !== 'credit_card') },
    { id: 'credit-cards', title: 'Credit Cards', type: 'credit_card' as const, accounts: orderedAccounts.filter((account) => account.type === 'credit_card') },
  ]
  return (
    <div className="account-groups">
      {groups.map((group) => (
        <section key={group.id} className="account-group" aria-labelledby={`accounts-${group.id}`}>
          <h3 id={`accounts-${group.id}`}>{group.title}</h3>
          {group.accounts.length === 0 ? <div className="account-group-empty">
            <p>{group.type === 'bank' ? 'No bank or cash accounts yet.' : 'No credit cards yet.'}</p>
            <button className="button-quiet" type="button" disabled={disabled} aria-haspopup="dialog"
              onClick={(event) => onAdd(group.type, event.currentTarget)}>
              {group.type === 'bank' ? 'Add bank or cash account' : 'Add credit card'}
            </button>
          </div> : <ul className="account-list">
            {group.accounts.map((account) => <AccountCard key={account.id} account={account}
              transactions={transactions} disabled={disabled} onOpen={onOpen} />)}
          </ul>}
        </section>
      ))}
    </div>
  )
}
