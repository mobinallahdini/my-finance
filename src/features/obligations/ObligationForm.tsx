import { useMoney } from '../financeSettings/useMoney'
import { useId, useState } from 'react'
import type { Obligation } from '../../domain/models'
import { requireCalendarMonth } from '../../domain/calendar'
import { dollarsForInput, parseDollars } from '../accounts/money'
import { ObligationDialog } from './ObligationDialog'

interface Props { obligation?: Obligation; month: string; onClose: () => void; onSave: (obligation: Obligation) => Promise<void> }
export function ObligationForm({ obligation, month, onClose, onSave }: Props) {
  const { currencyCode } = useMoney()
  const prefix = useId()
  const [initial] = useState(() => ({ name: obligation?.name ?? '', type: obligation?.type ?? 'bill',
    amount: obligation ? dollarsForInput(obligation.type === 'bill' ? obligation.expectedAmountCents : obligation.originalAmountCents) : '',
    scheduled: obligation?.type === 'installment' ? dollarsForInput(obligation.scheduledPaymentCents) : '',
    dueDay: String(obligation?.dueDay ?? 15), startMonth: obligation?.startMonth ?? month, note: obligation?.note ?? '', active: obligation?.isActive ?? true }))
  const [fields, setFields] = useState(initial)
  const change = <K extends keyof typeof fields>(key: K, value: typeof fields[K]) => setFields((previous) => ({ ...previous, [key]: value }))
  return <ObligationDialog title={obligation ? 'Edit obligation' : 'Add bill or installment'} dirty={JSON.stringify(fields) !== JSON.stringify(initial)} onClose={onClose} onSubmit={async () => {
    if (!fields.name.trim()) throw new Error('Enter a name.')
    const amount = parseDollars(fields.amount), scheduled = fields.type === 'installment' ? parseDollars(fields.scheduled) : undefined
    if (amount <= 0 || (scheduled !== undefined && scheduled <= 0)) throw new Error('Amounts must be greater than zero.')
    requireCalendarMonth(fields.startMonth)
    const shared = { id: obligation?.id ?? crypto.randomUUID(), name: fields.name.trim(), dueDay: Number(fields.dueDay), startMonth: fields.startMonth,
      isActive: fields.active, ...(fields.note.trim() ? { note: fields.note.trim() } : {}) }
    await onSave(fields.type === 'bill' ? { ...shared, type: 'bill', expectedAmountCents: amount }
      : { ...shared, type: 'installment', originalAmountCents: amount, scheduledPaymentCents: scheduled! })
  }}>
    <div className="obligation-field"><label htmlFor={`${prefix}-type`}>Type</label>
      <select id={`${prefix}-type`} value={fields.type} onChange={(e) => change('type', e.target.value as Obligation['type'])}>
        <option value="bill">Bill</option><option value="installment">Installment</option>
      </select>{obligation && <p>Type and start month changes must preserve payment history.</p>}</div>
    <div className="obligation-field"><label htmlFor={`${prefix}-name`}>Name</label>
      <input id={`${prefix}-name`} required value={fields.name} onChange={(e) => change('name', e.target.value)} /></div>
    <div className="obligation-field"><label htmlFor={`${prefix}-amount`}>{fields.type === 'bill' ? `Expected monthly amount (${currencyCode})` : `Original amount (${currencyCode})`}</label>
      <input id={`${prefix}-amount`} required inputMode="decimal" value={fields.amount} onChange={(e) => change('amount', e.target.value)} /></div>
    {fields.type === 'installment' && <div className="obligation-field"><label htmlFor={`${prefix}-scheduled`}>Scheduled monthly payment ({currencyCode})</label>
      <input id={`${prefix}-scheduled`} required inputMode="decimal" value={fields.scheduled} onChange={(e) => change('scheduled', e.target.value)} /></div>}
    <div className="obligation-field"><label htmlFor={`${prefix}-day`}>Due day (1–31)</label>
      <input id={`${prefix}-day`} type="number" required min="1" max="31" step="1" value={fields.dueDay} onChange={(e) => change('dueDay', e.target.value)} aria-describedby={`${prefix}-day-help`} />
      <p id={`${prefix}-day-help`}>If a month has fewer days, the due date is the last day of that month.</p></div>
    <div className="obligation-field"><label htmlFor={`${prefix}-start`}>Start month</label>
      <input id={`${prefix}-start`} type="month" min="0001-01" max="9999-12" required value={fields.startMonth} onChange={(e) => change('startMonth', e.target.value)} /></div>
    <div className="obligation-field"><label htmlFor={`${prefix}-note`}>Note (optional)</label>
      <textarea id={`${prefix}-note`} rows={3} value={fields.note} onChange={(e) => change('note', e.target.value)} /></div>
    <label className="obligation-checkbox"><input type="checkbox" checked={fields.active} onChange={(e) => change('active', e.target.checked)} /> Active</label>
  </ObligationDialog>
}
