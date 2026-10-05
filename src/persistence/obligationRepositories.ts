import type { Obligation, ObligationPayment, YearMonth } from '../domain/models'
import { database } from './database'
import { requireId, validateMonth, validateObligation, validateObligationPayment, validateObligationPaymentReference } from './validation'

/** All history-sensitive operations lock both new tables, including across tabs. */
export const obligationsRepository = {
  async add(obligation: Obligation): Promise<string> {
    const record = structuredClone(obligation)
    validateObligation(record)
    return database.obligations.add(record)
  },
  async get(id: string): Promise<Obligation | undefined> {
    requireId(id)
    return database.obligations.get(id)
  },
  async getAll(): Promise<Obligation[]> {
    return database.obligations.toArray()
  },
  async getByType(type: Obligation['type']): Promise<Obligation[]> {
    if (type !== 'bill' && type !== 'installment') throw new RangeError('Invalid obligation type.')
    return database.obligations.where('type').equals(type).toArray()
  },
  async update(obligation: Obligation): Promise<void> {
    const record = structuredClone(obligation)
    validateObligation(record)
    await database.transaction('rw', database.obligations, database.obligationPayments, async () => {
      const existing = await database.obligations.get(record.id)
      if (!existing) throw new Error(`Obligation does not exist: ${record.id}`)
      const payments = await database.obligationPayments.where('obligationId').equals(record.id).toArray()
      if (existing.type !== record.type && payments.length) throw new Error('Cannot change the type of an obligation with payment history. Mark it inactive instead.')
      for (const payment of payments) validateObligationPaymentReference(payment, record)
      await database.obligations.put(record)
    })
  },
  async delete(id: string): Promise<void> {
    requireId(id)
    await database.transaction('rw', database.obligations, database.obligationPayments, async () => {
      if (await database.obligationPayments.where('obligationId').equals(id).count()) {
        throw new Error('Cannot delete an obligation with payment history. Mark it inactive instead.')
      }
      await database.obligations.delete(id)
    })
  },
}

async function writePayment(payment: ObligationPayment, update: boolean): Promise<string> {
  const record = structuredClone(payment)
  validateObligationPayment(record)
  return database.transaction('rw', database.obligations, database.obligationPayments, async () => {
    if (update && !(await database.obligationPayments.get(record.id))) throw new Error(`Obligation payment does not exist: ${record.id}`)
    validateObligationPaymentReference(record, await database.obligations.get(record.obligationId))
    return update ? database.obligationPayments.put(record) : database.obligationPayments.add(record)
  })
}

export const obligationPaymentsRepository = {
  async add(payment: ObligationPayment): Promise<string> {
    return writePayment(payment, false)
  },
  async get(id: string): Promise<ObligationPayment | undefined> {
    requireId(id)
    return database.obligationPayments.get(id)
  },
  async getAll(): Promise<ObligationPayment[]> {
    return database.obligationPayments.toArray()
  },
  async getByObligation(obligationId: string): Promise<ObligationPayment[]> {
    requireId(obligationId)
    return database.obligationPayments.where('obligationId').equals(obligationId).toArray()
  },
  async getForMonth(month: YearMonth, obligationId?: string): Promise<ObligationPayment[]> {
    validateMonth(month)
    if (obligationId === undefined) return database.obligationPayments.where('dueMonth').equals(month).toArray()
    requireId(obligationId)
    return database.obligationPayments.where('[obligationId+dueMonth]').equals([obligationId, month]).toArray()
  },
  async update(payment: ObligationPayment): Promise<void> {
    await writePayment(payment, true)
  },
  async delete(id: string): Promise<void> {
    requireId(id)
    await database.obligationPayments.delete(id)
  },
}
