import { useEffect, useRef, useState } from 'react'
import type { Obligation } from '../../domain/models'
import { calculateObligationMonthSummary } from '../../domain/obligationCalculations'
import type { ObligationMonthState, ObligationMonthSummary } from '../../domain/obligationCalculations'
import { nextCalendarMonth } from '../../domain/calendar'
import { obligationsRepository, obligationPaymentsRepository } from '../../persistence/repositories'
import { formatCad } from '../accounts/money'
import { localCalendarDate } from '../transactions/transactionHelpers'
import { notifyDataChanged } from '../shared/dataRefresh'
import { useLocalToday } from '../shared/useLocalToday'
import { ObligationForm } from './ObligationForm'
import { ObligationPaymentForm } from './ObligationPaymentForm'
import { dateLabel, monthLabel, statusLabel, writeError } from './obligationPresentation'
import { useObligations } from './useObligations'
import './obligations.css'

type Editor = { kind: 'obligation'; obligation?: Obligation; route?: string } | { kind: 'payment'; obligation: Obligation; route: string }

function Progress({ obligation, state }: { obligation: Obligation; state: ObligationMonthState }) {
  if (obligation.type !== 'installment') return null
  const paid = Math.min(state.installmentBalance!.totalPaidCents, obligation.originalAmountCents)
  const percent = Math.round(paid / obligation.originalAmountCents * 100)
  return <div className="obligation-progress">
    <progress value={paid} max={obligation.originalAmountCents} aria-label={`${obligation.name}: ${percent}% of principal paid`} />
    <span>{percent}% of principal paid</span>
  </div>
}
function Status({ state, today }: { state: ObligationMonthState; today: string }) {
  return <span className="obligation-status" data-status={state.isOverdue ? 'overdue' : state.status}>{statusLabel(state, today)}</span>
}
function Due({ obligation, state, month }: { obligation: Obligation; state: ObligationMonthState; month: string }) {
  if (state.status === 'completed') return null
  return <span>{state.dueDate ? `Due ${dateLabel(state.dueDate)}`
    : month < obligation.startMonth ? `Starts ${monthLabel(obligation.startMonth)} · Due day ${obligation.dueDay}`
    : `Due day ${obligation.dueDay}`}</span>
}

export function ObligationsSection({ obligationId, initialMonth }: { obligationId?: string; initialMonth?: string }) {
  const { obligations, payments, loading, error: loadError, reload } = useObligations()
  const today = useLocalToday()
  const [month, setMonth] = useState(() => initialMonth ?? localCalendarDate().slice(0, 7))
  const [filter, setFilter] = useState<'all' | Obligation['type']>('all')
  const [editor, setEditor] = useState<Editor | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const section = useRef<HTMLElement>(null)
  const trigger = useRef<HTMLElement | null>(null)
  const restore = useRef(false)
  const priorId = useRef(obligationId)
  const writing = useRef(false)
  if (editor && editor.route !== obligationId) setEditor(null)
  useEffect(() => {
    if (editor || loading) return
    const returnedId = priorId.current !== obligationId && obligationId === undefined ? priorId.current : undefined
    priorId.current = obligationId
    if (!restore.current && !returnedId) return
    restore.current = false
    const frame = requestAnimationFrame(() => {
      const row = Array.from(section.current?.querySelectorAll<HTMLElement>('[data-obligation-id]') ?? []).find((node) => node.dataset.obligationId === returnedId)
      const target = returnedId ? row : trigger.current?.isConnected ? trigger.current : null
      ;(target ?? section.current?.querySelector<HTMLElement>('[data-main-action], h2'))?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [editor, loading, obligationId])
  let summary: ObligationMonthSummary | undefined
  let calculationError: string | undefined
  try { summary = calculateObligationMonthSummary(obligations, payments, month, today) }
  catch (caught) { calculationError = writeError(caught) }
  const obligation = obligations.find((item) => item.id === obligationId)
  const state = summary?.states.find((item) => item.obligationId === obligationId)
  const history = payments.filter((payment) => payment.obligationId === obligationId)
    .map((payment, index) => ({ payment, index }))
    .sort((a, b) => b.payment.paidDate.localeCompare(a.payment.paidDate) || b.index - a.index)
    .map(({ payment }) => payment)
  function openEditor(next: Editor, source: HTMLElement) { trigger.current = source; setError(null); setEditor(next) }
  function closeEditor() { restore.current = true; setEditor(null) }
  async function write(action: () => Promise<unknown>) {
    if (writing.current) throw new Error('A change is already being saved. Please wait.')
    writing.current = true
    setBusy(true)
    setError(null)
    try { await action(); notifyDataChanged() }
    finally { writing.current = false; setBusy(false) }
  }
  async function action(work: () => Promise<unknown>) {
    try { await write(work) }
    catch (caught) { setError(writeError(caught)) }
  }
  function previousMonth() {
    const year = Number(month.slice(0, 4)), number = Number(month.slice(5))
    return number === 1 ? `${String(year - 1).padStart(4, '0')}-12` : `${month.slice(0, 4)}-${String(number - 1).padStart(2, '0')}`
  }
  const visibleEditor = editor && editor.route === obligationId ? editor : null
  return <>
    <a className="more-back-link" href={obligationId === undefined ? '#more' : '#more/bills-installments'}>
      <span aria-hidden="true">←</span> {obligationId === undefined ? 'Back to More' : 'Bills & Installments'}
    </a>
    <section ref={section} className="obligations-section" aria-labelledby="obligations-heading" aria-busy={busy}>
      <header className="obligation-page-header">
        <h2 id="obligations-heading" tabIndex={-1}>{obligationId === undefined ? 'Bills & Installments' : obligation?.type === 'installment' ? 'Installment Details' : 'Bill Details'}</h2>
        {obligationId === undefined && <button className="button-primary" data-main-action disabled={loading || Boolean(loadError || calculationError)} onClick={(event) => openEditor({ kind: 'obligation' }, event.currentTarget)}>+ Add</button>}
        {obligation && <button data-main-action disabled={busy || loading} onClick={(event) => openEditor({ kind: 'obligation', obligation, route: obligationId }, event.currentTarget)}>Edit</button>}
      </header>
      <p className="obligation-backup-note">Bills &amp; Installments are not included in Full Backup yet.</p>
      <div className="obligation-month" role="group" aria-label="Selected month">
        <button aria-label="Previous month" disabled={month === '0001-01'} onClick={() => setMonth(previousMonth())}>‹</button>
        <div><label htmlFor="obligation-month">{monthLabel(month)}</label>
          <input id="obligation-month" aria-label="Select month" type="month" min="0001-01" max="9999-12" value={month}
            onChange={(event) => { if (/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value)) setMonth(event.target.value) }} /></div>
        <button aria-label="Next month" disabled={month === '9999-12'} onClick={() => setMonth(nextCalendarMonth(month)!)}>›</button>
      </div>
      {loading && <p role="status" className="obligation-muted">Loading bills and payments…</p>}
      {(loadError || calculationError) && <div role="alert"><p className="obligation-error">{loadError ?? calculationError}</p><button onClick={() => { void reload() }}>Retry</button></div>}
      {error && <p className="obligation-error" role="alert">{error}</p>}
      {!loadError && !calculationError && summary && (obligationId === undefined ? <>
        <dl className="obligation-summary" aria-label={`${monthLabel(month)} summary`}>
          <div><dt>Due this month</dt><dd>{formatCad(summary.expectedTotalDueCents)}</dd><small>{formatCad(summary.remainingTotalDueCents)} left to pay</small></div>
          <div><dt>Paid this month</dt><dd>{formatCad(summary.paidDuringMonthCents)}</dd><small>By actual paid date</small></div>
          <div><dt>Overdue</dt><dd>{summary.overdueObligations.length}</dd><small>In selected month</small></div>
        </dl>
        <div className="obligation-filters" role="group" aria-label="Filter obligations">
          {(['all', 'bill', 'installment'] as const).map((value) => <button key={value} aria-pressed={filter === value} onClick={() => setFilter(value)}>{value === 'all' ? 'All' : value === 'bill' ? 'Bills' : 'Installments'}</button>)}
        </div>
        {!loading && !obligations.length && <p>No bills or installments yet.</p>}
        {!loading && obligations.length > 0 && !summary.obligationsDue.some((item) => item.status !== 'completed') && <p className="obligation-muted">No obligations due in {monthLabel(month)}.</p>}
        {(['bill', 'installment'] as const).filter((type) => filter === 'all' || filter === type).map((type) => {
          const items = obligations.filter((item) => item.type === type).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
          if (!items.length) return null
          return <div className="obligation-group" key={type}><h3>{type === 'bill' ? 'Bills' : 'Installments'}</h3>
            <ul className="obligation-list">{items.map((item) => {
              const monthly = summary.states.find((value) => value.obligationId === item.id)!
              return <li key={item.id}><a className="obligation-row" href={`#more/bills-installments/${encodeURIComponent(item.id)}`} data-obligation-id={item.id}>
                <div className="obligation-row-heading"><strong>{item.name}</strong><span className="obligation-money">{formatCad(item.type === 'bill' ? item.expectedAmountCents : item.scheduledPaymentCents)}<small> / month</small></span></div>
                {item.type === 'installment' && <><span className="obligation-muted">{formatCad(monthly.installmentBalance!.remainingAmountCents)} remaining</span><Progress obligation={item} state={monthly} /></>}
                <div className="obligation-row-meta"><Due obligation={item} state={monthly} month={month} /><Status state={monthly} today={today} /></div>
              </a></li>
            })}</ul></div>
        })}
        {!loading && obligations.length > 0 && filter !== 'all' && !obligations.some((item) => item.type === filter) && <p className="obligation-muted">No {filter === 'bill' ? 'bills' : 'installments'} yet.</p>}
      </> : obligation && state ? <>
        <h3 className="obligation-name">{obligation.name}</h3>
        <div className="obligation-details-status"><Status state={state} today={today} /><Due obligation={obligation} state={state} month={month} /></div>
        <dl className="obligation-facts">
          {obligation.type === 'bill' ? <div><dt>Expected monthly amount</dt><dd>{formatCad(obligation.expectedAmountCents)}</dd></div> : <>
            <div><dt>Original amount</dt><dd>{formatCad(obligation.originalAmountCents)}</dd></div>
            <div><dt>Scheduled monthly payment</dt><dd>{formatCad(obligation.scheduledPaymentCents)}</dd></div>
            <div><dt>Total paid</dt><dd>{formatCad(state.installmentBalance!.totalPaidCents)}</dd></div>
            <div><dt>Remaining balance</dt><dd>{formatCad(state.installmentBalance!.remainingAmountCents)}</dd></div>
            {state.installmentBalance!.overpaymentCents > 0 && <div><dt>Overpayment</dt><dd>{formatCad(state.installmentBalance!.overpaymentCents)}</dd></div>}
          </>}
          <div><dt>Paid toward {monthLabel(month)}</dt><dd>{formatCad(state.paidAmountCents)}</dd></div>
          <div><dt>Due day</dt><dd>{obligation.dueDay}</dd></div>
          <div><dt>Start month</dt><dd>{monthLabel(obligation.startMonth)}</dd></div>
          <div><dt>Active</dt><dd>{obligation.isActive ? 'Yes' : 'No · Inactive'}</dd></div>
        </dl>
        <Progress obligation={obligation} state={state} />
        {obligation.note && <div className="obligation-note"><h3>Note</h3><p>{obligation.note}</p></div>}
        <div className="obligation-actions">
          <button className="button-primary" disabled={busy || loading} onClick={(event) => openEditor({ kind: 'payment', obligation, route: obligation.id }, event.currentTarget)}>Record payment</button>
          <button disabled={busy || loading} onClick={() => { void action(() => obligationsRepository.update({ ...obligation, isActive: !obligation.isActive })) }}>{obligation.isActive ? 'Set inactive' : 'Set active'}</button>
          {!history.length && <button className="button-quiet button-destructive" disabled={busy || loading} onClick={() => {
            if (window.confirm(`Delete “${obligation.name}”? This cannot be undone.`)) void action(async () => {
              await obligationsRepository.delete(obligation.id)
              window.location.hash = 'more/bills-installments'
            })
          }}>Delete obligation</button>}
        </div>
        <div className="obligation-history"><h3>Payment history</h3>
          {!history.length && <p className="obligation-muted">No payments recorded yet.</p>}
          <ul>{history.map((payment) => <li key={payment.id} className="obligation-payment-row">
            <div><strong className="obligation-money">{formatCad(payment.amountCents)}</strong><span>For {monthLabel(payment.dueMonth)}</span><span>Paid {dateLabel(payment.paidDate)}</span>{payment.note && <p>{payment.note}</p>}</div>
            <button className="button-quiet button-destructive" disabled={busy || loading} aria-label={`Delete ${formatCad(payment.amountCents)} payment paid ${dateLabel(payment.paidDate)}`} onClick={() => {
              if (window.confirm(`Delete this ${formatCad(payment.amountCents)} payment? The balance and status will be recalculated.`)) void action(async () => {
                await obligationPaymentsRepository.delete(payment.id)
                restore.current = true; trigger.current = null
              })
            }}>Delete</button>
          </li>)}</ul>
        </div>
      </> : !loading && <p>This obligation could not be found. Return to Bills &amp; Installments.</p>)}
      {visibleEditor?.kind === 'obligation' && <ObligationForm obligation={visibleEditor.obligation} month={month} onClose={closeEditor} onSave={async (record) => {
        await write(() => visibleEditor.obligation ? obligationsRepository.update(record) : obligationsRepository.add(record))
        closeEditor()
      }} />}
      {visibleEditor?.kind === 'payment' && <ObligationPaymentForm obligation={visibleEditor.obligation} payments={payments} month={month} today={today} onClose={closeEditor} onSave={async (payment) => {
        await write(() => obligationPaymentsRepository.add(payment)); closeEditor()
      }} />}
    </section>
  </>
}
