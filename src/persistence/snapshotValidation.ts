import type { Account, Category, Obligation, ObligationPayment, Transaction } from '../domain/models'
import { validateAccount, validateCategory, validateTransaction, validateTransactionReferences } from './validation.ts'
import { validateObligation, validateObligationPayment, validateObligationPaymentReference } from '../domain/obligationValidation.ts'

export interface FinancialSnapshot {
  accounts: Account[]
  categories: Category[]
  transactions: Transaction[]
}
export interface ApplicationSnapshot extends FinancialSnapshot {
  obligations: Obligation[]
  obligationPayments: ObligationPayment[]
}

export function objectRecord(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`)
  return value as Record<string, unknown>
}
export function knownFields(value: Record<string, unknown>, fields: readonly string[], label: string) {
  for (const key of Object.keys(value)) {
    if (!fields.includes(key)) throw new Error(`${label} contains an unsupported field: ${key}.`)
  }
}
function text(value: unknown, label: string, nonempty = false) {
  if (typeof value !== 'string' || (nonempty && !value.trim())) throw new Error(`${label} must be ${nonempty ? 'a non-empty' : 'a'} string.`)
}
function accountRecord(value: unknown): Account {
  const record = objectRecord(value, 'Account')
  knownFields(record, ['id', 'name', 'type', 'openingBalance', 'creditLimit'], 'Account')
  text(record.name, 'Account name', true)
  validateAccount(record as unknown as Account)
  return record as unknown as Account
}
function categoryRecord(value: unknown): Category {
  const record = objectRecord(value, 'Category')
  knownFields(record, ['id', 'name', 'type'], 'Category')
  text(record.name, 'Category name', true)
  validateCategory(record as unknown as Category)
  return record as unknown as Category
}
export function transactionRecord(value: unknown): Transaction {
  const record = objectRecord(value, 'Transaction')
  knownFields(record, ['id', 'type', 'amount', 'date', 'note', ...(record.type === 'transfer'
    ? ['fromAccountId', 'toAccountId'] : ['accountId', 'categoryId'])], 'Transaction')
  text(record.date, 'Transaction date')
  if (record.note !== undefined) text(record.note, 'Transaction note')
  validateTransaction(record as unknown as Transaction)
  return record as unknown as Transaction
}
function records<T extends { id: string }>(value: unknown, label: string, validate: (record: unknown) => T): T[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array.`)
  const ids = new Set<string>()
  return value.map((record, index) => {
    try {
      const result = validate(record)
      if (ids.has(result.id)) throw new Error(`Duplicate ID: ${result.id}.`)
      ids.add(result.id)
      return result
    } catch (error) {
      throw new Error(`${label}, record ${index + 1}: ${error instanceof Error ? error.message : 'Invalid record.'}`, { cause: error })
    }
  })
}

/** Boundary checks protect untrusted files; business rules come from persistence validation. */
export function validateFinancialSnapshot(value: unknown): FinancialSnapshot {
  const data = objectRecord(value, 'Financial data')
  knownFields(data, ['accounts', 'categories', 'transactions'], 'Financial data')
  const accounts = records(data.accounts, 'Accounts', accountRecord)
  const categories = records(data.categories, 'Categories', categoryRecord)
  const transactions = records(data.transactions, 'Transactions', transactionRecord)
  const accountMap = new Map(accounts.map((record) => [record.id, record]))
  const categoryMap = new Map(categories.map((record) => [record.id, record]))
  for (const transaction of transactions) {
    try { validateTransactionReferences(transaction, accountMap, categoryMap) }
    catch (error) { throw new Error(`Transaction ${transaction.id}: ${error instanceof Error ? error.message : 'Invalid references.'}`, { cause: error }) }
  }
  return { accounts, categories, transactions }
}

/** Validate both complete graphs without adding any derived obligation state. */
export function validateApplicationSnapshot(value: unknown): ApplicationSnapshot {
  const data = objectRecord(value, 'Application data')
  knownFields(data, ['accounts', 'categories', 'transactions', 'obligations', 'obligationPayments'], 'Application data')
  const financial = validateFinancialSnapshot({ accounts: data.accounts, categories: data.categories, transactions: data.transactions })
  const obligations = records(data.obligations, 'Bills & Installments', (value) => {
    const obligation = objectRecord(value, 'Obligation') as unknown as Obligation
    validateObligation(obligation)
    return obligation
  })
  const obligationPayments = records(data.obligationPayments, 'Recorded payments', (value) => {
    const payment = objectRecord(value, 'Obligation payment') as unknown as ObligationPayment
    validateObligationPayment(payment)
    return payment
  })
  const obligationMap = new Map(obligations.map((record) => [record.id, record]))
  for (const payment of obligationPayments) {
    try { validateObligationPaymentReference(payment, obligationMap.get(payment.obligationId)) }
    catch (error) { throw new Error(`Payment ${payment.id}: ${error instanceof Error ? error.message : 'Invalid reference.'}`, { cause: error }) }
  }
  return { ...financial, obligations, obligationPayments }
}
