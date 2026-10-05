import { useState } from 'react'
import type { Account, Transaction } from '../../domain/models'
import { useCategories } from '../categories/useCategories'
import { TransactionFilters } from '../transactions/TransactionFilters'
import { TransactionList } from '../transactions/TransactionList'
import { emptyTransactionFilters, filterTransactions } from '../transactions/transactionFiltering'
import { compareTransactions } from '../transactions/transactionHelpers'
import { AccountBalances } from './AccountBalances'
import './accountDetails.css'

export function AccountDetails({ account, accounts, transactions, isLoading, loadError }: {
  account: Account
  accounts: readonly Account[]
  transactions: readonly Transaction[]
  isLoading: boolean
  loadError: string | null
}) {
  const { categories, isLoading: categoriesLoading, loadError: categoriesError, reload } = useCategories()
  const [filters, setFilters] = useState(emptyTransactionFilters)
  // UI filters never contain the account constraint. Clear/removal cannot lift it.
  const history = filterTransactions([...transactions].sort(compareTransactions), accounts, categories,
    { ...emptyTransactionFilters(), accountIds: [account.id] })
  const filtered = filterTransactions(history, accounts, categories, { ...filters, accountIds: [account.id] })

  // Keep local filters through shared reloads, but do not present failed reads as current balances.
  if (loadError) return null
  return (
    <>
      <div className="account-details-summary" role="group" aria-label="Account financial summary">
        <AccountBalances account={account} transactions={transactions} />
      </div>
      <section className="transactions-section account-details-activity" aria-labelledby="account-activity-heading"
        aria-busy={isLoading || categoriesLoading}>
        <h3 id="account-activity-heading">Transactions</h3>
        {history.length > 0 && <TransactionFilters filters={filters} accounts={accounts} categories={categories} onChange={setFilters} showAccountFilter={false} />}
        {categoriesError ? <div className="transaction-recovery">
          <p className="transaction-error" role="alert">{categoriesError}</p>
          <button type="button" onClick={reload}>Refresh / Retry</button>
        </div> : categoriesLoading ? <p className="transaction-loading" role="status">Loading transaction categories…</p>
          : history.length === 0 ? <p className="account-activity-empty">No transactions recorded for this account yet.</p> : <>
            <p className="transaction-count" role="status">{filtered.length} of {history.length} {history.length === 1 ? 'transaction' : 'transactions'}</p>
            {filtered.length ? <TransactionList transactions={filtered} accounts={accounts} categories={categories}
              disabled={isLoading} accountContext /> : <div className="transaction-filter-empty">
              <p>No transactions match these filters.</p>
              <div className="transaction-filter-empty-actions">
                <button type="button" onClick={(event) => {
                  setFilters(emptyTransactionFilters())
                  event.currentTarget.closest('section')?.querySelector<HTMLButtonElement>('.transaction-filter-open')?.focus()
                }}>Clear filters</button>
              </div>
            </div>}
          </>}
      </section>
    </>
  )
}
