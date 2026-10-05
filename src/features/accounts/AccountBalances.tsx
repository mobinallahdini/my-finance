import { useMoney } from '../financeSettings/useMoney'
import type { Account, Transaction } from '../../domain/models'
import { calculateAccountBalance, calculateAvailableCredit } from '../../domain/calculations'

/** Shared presentation keeps the list and details on the same financial semantics. */
export function AccountBalances({ account, transactions }: { account: Account; transactions: readonly Transaction[] }) {
  const { formatAmount } = useMoney()
  let balance: number
  let availableCredit: number | undefined
  try {
    balance = calculateAccountBalance(account, transactions)
    availableCredit = account.type === 'credit_card' ? calculateAvailableCredit(account, transactions) : undefined
  } catch {
    return <p className="account-error" role="alert">This balance could not be calculated safely. Review this account's opening balance and recorded transactions.</p>
  }
  const isCard = account.type === 'credit_card'
  const isOverdraft = !isCard && balance < 0
  const primaryLabel = isCard ? (balance < 0 ? 'Account credit' : 'Debt owed')
    : isOverdraft ? (account.type === 'bank' ? 'Overdraft' : 'Negative balance') : 'Current balance'
  return (
    <>
      <dl className="account-balances">
        <div className={`account-primary-balance${isOverdraft ? ' financial-danger' : ''}`}>
          <dt>{primaryLabel}</dt>
          <dd className={isCard ? (balance < 0 ? 'financial-positive' : 'financial-debt') : undefined}>
            {formatAmount(isCard && balance < 0 ? -balance : balance)}
          </dd>
        </div>
        {isCard && account.creditLimit !== undefined && <>
          <div className="account-supporting-balance"><dt>Credit limit</dt><dd>{formatAmount(account.creditLimit)}</dd></div>
          {availableCredit !== undefined && (
            <div className={`account-supporting-balance${availableCredit < 0 ? ' financial-danger' : ''}`}>
              <dt>{availableCredit < 0 ? 'Over limit by' : 'Available credit'}</dt>
              <dd>{formatAmount(availableCredit < 0 ? -availableCredit : availableCredit)}</dd>
            </div>
          )}
        </>}
      </dl>
      {isCard && account.creditLimit === undefined && <p className="account-limit-note">Credit limit not set</p>}
    </>
  )
}
