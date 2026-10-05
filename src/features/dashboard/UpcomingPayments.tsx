import { useId } from 'react'
import type { YearMonth } from '../../domain/models'
import { calculateObligationMonthSummary } from '../../domain/obligationCalculations'
import type { ObligationMonthState } from '../../domain/obligationCalculations'
import { formatCad } from '../accounts/money'
import { useObligations } from '../obligations/useObligations'
import { dateLabel, monthLabel, statusLabel } from '../obligations/obligationPresentation'
import { useLocalToday } from '../shared/useLocalToday'

function priority(state: ObligationMonthState) {
  if (state.isOverdue) return 0
  switch (state.status) {
    case 'partially_paid': return 1
    case 'due_today': return 2
    case 'due_soon': return 3
    case 'upcoming': return 4
    case 'paid': return 5
    default: return 6
  }
}

export function UpcomingPayments({ month }: { month: YearMonth }) {
  const headingId = useId()
  const { obligations, payments, loading, error, reload } = useObligations()
  const today = useLocalToday()
  const href = (id?: string) => `#more/bills-installments${id === undefined ? '' : `/${encodeURIComponent(id)}`}?month=${month}`
  const names = new Map(obligations.map((obligation) => [obligation.id, obligation.name]))
  let summary
  let calculationError = false
  try { summary = calculateObligationMonthSummary(obligations, payments, month, today) }
  catch { calculationError = true }
  // isDue excludes inactive and pre-start records. Completed installments are
  // a fallback only in a month with a calculated target and no relevant item.
  const eligible = summary?.obligationsDue ?? []
  const relevant = eligible.filter((state) => state.status !== 'completed')
  const visible = [...(relevant.length ? relevant : eligible)]
    .sort((a, b) => priority(a) - priority(b)
      || (a.dueDate ?? '').localeCompare(b.dueDate ?? '')
      || names.get(a.obligationId)!.localeCompare(names.get(b.obligationId)!)
      || a.obligationId.localeCompare(b.obligationId))
    .slice(0, 3)

  return <section className="dashboard-payments" aria-labelledby={headingId} aria-busy={loading}>
    <header className="dashboard-payments-header">
      <h3 id={headingId}>Upcoming payments</h3>
      <a className="dashboard-payments-view-all" href={href()}>View all<span className="dashboard-visually-hidden"> bills and installments for {monthLabel(month)}</span><span aria-hidden="true"> →</span></a>
    </header>
    {loading ? <p className="dashboard-payments-caption" role="status">Loading payments…</p>
      : error || calculationError ? <div className="dashboard-activity-recovery">
        <p className="dashboard-error" role="alert">{error ?? 'Payment amounts could not be calculated safely. Review Bills & Installments, or retry.'}</p>
        <button className="button-quiet" onClick={() => { void reload() }}>Refresh / Retry</button>
      </div> : !visible.length ? <p className="dashboard-payments-caption">No payments due this month.</p>
        : <>
          <p className="dashboard-payments-caption">{formatCad(summary!.remainingTotalDueCents)} remaining this month</p>
          <ul className="dashboard-payments-list" aria-label={`Payments for ${monthLabel(month)}`}>
            {visible.map((state) => <li key={state.obligationId}>
              <a className="dashboard-payment-row" href={href(state.obligationId)} data-obligation-id={state.obligationId}>
                <div className="dashboard-payment-heading"><strong>{names.get(state.obligationId)}</strong>
                  <span className="dashboard-payment-amount">{formatCad(state.status === 'partially_paid' ? state.remainingDueCents : state.expectedAmountCents)}{state.status === 'partially_paid' && <small> left this month</small>}</span>
                </div>
                <div className="dashboard-payment-detail">
                  {state.dueDate && state.status !== 'completed' && <span>Due {dateLabel(state.dueDate)}</span>}
                  <span className="dashboard-payment-status" data-status={state.isOverdue ? 'overdue' : state.status}>{statusLabel(state, today)}</span>
                  {state.installmentBalance && state.status !== 'completed' && <span>{formatCad(state.installmentBalance.remainingAmountCents)} remaining principal</span>}
                </div>
              </a>
            </li>)}
          </ul>
        </>}
  </section>
}
