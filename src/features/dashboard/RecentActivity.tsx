import { useMoney } from '../financeSettings/useMoney'
import { useId } from 'react'
import { transactionTypeLabels } from '../transactions/transactionHelpers'
import type { RecentActivityItem } from './useMonthlyDashboard'

export function RecentActivity({ items, monthLabel, error, onRetry }: {
  items: readonly RecentActivityItem[]
  monthLabel: string
  error: string | null
  onRetry: () => void
}) {
  const { formatAmount } = useMoney()
  const headingId = useId()

  return (
    <section className="dashboard-activity" aria-labelledby={headingId}>
      <h3 id={headingId}>Recent Activity</h3>
      {error && <div className="dashboard-activity-recovery">
        <p className="dashboard-error" role="alert">{error}</p>
        <button className="button-quiet" type="button" onClick={onRetry}>Refresh / Retry</button>
      </div>}
      {items.length === 0 ? (
        <p className="dashboard-empty">No transactions in {monthLabel}.</p>
      ) : (
        <ul className="dashboard-activity-list" aria-label={`Latest transactions in ${monthLabel}`}>
          {items.map((item) => (
            <li key={item.id} className="dashboard-activity-row">
              <div className="dashboard-activity-description">
                <span className="dashboard-activity-name">{item.title}</span>
                <span className="dashboard-activity-detail">
                  {item.type === 'transfer' ? <>
                    <span aria-hidden="true">{item.accountDescription}</span>
                    <span className="dashboard-visually-hidden">{item.transferDescription}</span>
                  </> : `${transactionTypeLabels[item.type]} · ${item.accountDescription}`}
                </span>
              </div>
              <span className={`dashboard-activity-amount financial-${item.type === 'transfer' ? 'neutral' : item.type}`}>
                {item.type === 'expense' ? '-' : item.type === 'income' || item.type === 'refund' ? '+' : ''}{formatAmount(item.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <a className="dashboard-view-transactions" href="#transactions">View all transactions <span aria-hidden="true">→</span></a>
    </section>
  )
}
