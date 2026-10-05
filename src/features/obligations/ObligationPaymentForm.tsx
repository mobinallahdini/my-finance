import { useMoney } from '../financeSettings/useMoney'
import { useId, useState } from 'react'
import type { Obligation, ObligationPayment } from '../../domain/models'
import { dollarsForInput, parseDollars } from '../accounts/money'
import { ObligationDialog } from './ObligationDialog'
import { paymentDefault } from './obligationPresentation'

interface Props { obligation: Obligation; payments: readonly ObligationPayment[]; month: string; today: string; onClose: () => void; onSave: (payment: ObligationPayment) => Promise<void> }
export function ObligationPaymentForm({ obligation, payments, month, today, onClose, onSave }: Props) {
  const { currencyCode } = useMoney()
  const prefix = useId()
  const [defaults] = useState(() => paymentDefault(obligation, payments, month, today))
  const [initial] = useState(() => ({ amount: defaults.amountCents ? dollarsForInput(defaults.amountCents) : '', dueMonth: defaults.dueMonth, paidDate: today, note: '' }))
  const [fields, setFields] = useState(initial)
  const change = (key: keyof typeof fields, value: string) => setFields((previous) => ({ ...previous, [key]: value }))
  return <ObligationDialog title="Record payment" dirty={JSON.stringify(initial) !== JSON.stringify(fields)} onClose={onClose} onSubmit={async () => {
    const amountCents = parseDollars(fields.amount)
    if (amountCents <= 0) throw new Error('Payment amount must be greater than zero.')
    await onSave({ id: crypto.randomUUID(), obligationId: obligation.id, amountCents, dueMonth: fields.dueMonth, paidDate: fields.paidDate,
      ...(fields.note.trim() ? { note: fields.note.trim() } : {}) })
  }}>
    <p className="obligation-payment-name">{obligation.name}</p>
    <div className="obligation-field"><label htmlFor={`${prefix}-amount`}>Amount ({currencyCode})</label>
      <input id={`${prefix}-amount`} required inputMode="decimal" value={fields.amount} onChange={(e) => change('amount', e.target.value)} />
      {!defaults.amountCents && <p>No balance is currently due. Enter an amount only if you intend to record an additional payment.</p>}</div>
    <div className="obligation-field"><label htmlFor={`${prefix}-month`}>Due month</label>
      <input id={`${prefix}-month`} type="month" required min={obligation.startMonth} max="9999-12" value={fields.dueMonth} onChange={(e) => {
        const dueMonth = e.target.value
        setFields((previous) => ({ ...previous, dueMonth,
          amount: obligation.type === 'bill' && /^\d{4}-(0[1-9]|1[0-2])$/.test(dueMonth) && dueMonth >= obligation.startMonth
            ? dollarsForInput(paymentDefault(obligation, payments, dueMonth, today).amountCents) : previous.amount }))
      }} aria-describedby={`${prefix}-month-help`} />
      <p id={`${prefix}-month-help`}>The month this payment covers. It can differ from the date paid.</p></div>
    <div className="obligation-field"><label htmlFor={`${prefix}-date`}>Paid date</label>
      <input id={`${prefix}-date`} type="date" required min="0001-01-01" max="9999-12-31" value={fields.paidDate} onChange={(e) => change('paidDate', e.target.value)} /></div>
    <div className="obligation-field"><label htmlFor={`${prefix}-note`}>Note (optional)</label>
      <textarea id={`${prefix}-note`} rows={3} value={fields.note} onChange={(e) => change('note', e.target.value)} /></div>
  </ObligationDialog>
}
