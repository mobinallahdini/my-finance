import type { Transaction } from '../domain/models'
import { database } from './database'
import { transactionRecord, validateFinancialSnapshot, type FinancialSnapshot } from './snapshotValidation.ts'
import { validateTransactionReferences } from './validation.ts'

/** A single read transaction prevents exporting a mixture of different database states. */
export async function readFinancialSnapshot(): Promise<FinancialSnapshot> {
  return database.transaction('r', database.accounts, database.categories, database.transactions, async () => {
    const [accounts, categories, transactions] = await Promise.all([
      database.accounts.toArray(), database.categories.toArray(), database.transactions.toArray(),
    ])
    return { accounts, categories, transactions }
  })
}

export async function replaceFinancialSnapshot(value: unknown): Promise<void> {
  // Copy before validating so a caller cannot mutate records while the operation awaits storage.
  const snapshot = validateFinancialSnapshot(structuredClone(value))
  await database.transaction('rw', database.accounts, database.categories, database.transactions, async () => {
    await database.transactions.clear()
    await database.categories.clear()
    await database.accounts.clear()
    await database.accounts.bulkAdd(snapshot.accounts)
    await database.categories.bulkAdd(snapshot.categories)
    await database.transactions.bulkAdd(snapshot.transactions)
  })
}

export async function importTransactionBatch(values: readonly Transaction[]): Promise<number> {
  const transactions = structuredClone(values).map(transactionRecord)
  const ids = new Set(transactions.map((transaction) => transaction.id))
  if (ids.size !== transactions.length) throw new Error('The selected batch contains repeated transaction IDs. Review the preview.')
  return database.transaction('rw', database.accounts, database.categories, database.transactions, async () => {
    const [accounts, categories, existing] = await Promise.all([
      database.accounts.toArray(), database.categories.toArray(), database.transactions.bulkGet([...ids]),
    ])
    if (existing.some(Boolean)) throw new Error('Current data changed: a selected transaction ID already exists. Nothing was imported. Review the updated preview.')
    const accountMap = new Map(accounts.map((record) => [record.id, record]))
    const categoryMap = new Map(categories.map((record) => [record.id, record]))
    // Revalidate every selected record against current references under the same write lock.
    for (const transaction of transactions) validateTransactionReferences(transaction, accountMap, categoryMap)
    await database.transactions.bulkAdd(transactions)
    return transactions.length
  })
}
