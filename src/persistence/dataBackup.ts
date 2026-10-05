import type { Transaction } from '../domain/models'
import { applicationSettingsId, requireMatchingCurrency, validateApplicationSettings, validateCurrencyCode, type ApplicationSettings } from '../domain/financeSettings'
import { database } from './database'
import { transactionRecord, validateWorkspaceSnapshot, validateApplicationSnapshot, type ApplicationSnapshot, type FinancialSnapshot } from './snapshotValidation.ts'
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

/** Canonical JSON export reads all five stores under one snapshot lock. */
export async function readApplicationSnapshot(): Promise<ApplicationSnapshot> {
  return database.transaction('r', database.tables, async () => {
    const [accounts, categories, transactions, obligations, obligationPayments] = await Promise.all([
      database.accounts.toArray(), database.categories.toArray(), database.transactions.toArray(),
      database.obligations.toArray(), database.obligationPayments.toArray(),
    ])
    return { accounts, categories, transactions, obligations, obligationPayments }
  })
}

/** Replacement restore is indivisible across financial and tracking records. */
export async function replaceApplicationSnapshot(value: unknown): Promise<void> {
  const snapshot = validateApplicationSnapshot(structuredClone(value))
  await writeSnapshot(snapshot)
}

/** All six stores commit together; validate the complete graph before opening the write transaction. */
export async function replaceWorkspaceSnapshot(value: unknown): Promise<void> {
  const snapshot = validateWorkspaceSnapshot(structuredClone(value))
  await writeSnapshot(snapshot, snapshot.applicationSettings)
}

async function writeSnapshot(snapshot: ApplicationSnapshot, settings?: ApplicationSettings) {
  await database.transaction('rw', database.tables, async () => {
    if (settings) {
      await database.applicationSettings.clear()
      await database.applicationSettings.add(settings)
    }
    await database.obligationPayments.clear()
    await database.transactions.clear()
    await database.obligations.clear()
    await database.categories.clear()
    await database.accounts.clear()
    await database.accounts.bulkAdd(snapshot.accounts)
    await database.categories.bulkAdd(snapshot.categories)
    await database.transactions.bulkAdd(snapshot.transactions)
    await database.obligations.bulkAdd(snapshot.obligations)
    await database.obligationPayments.bulkAdd(snapshot.obligationPayments)
  })
}

/** Currency and amounts must come from the same database state, including across tabs. */
export async function readBackupSource() {
  return database.transaction('r', database.tables, async () => {
    const settings = validateApplicationSettings(await database.applicationSettings.get(applicationSettingsId))
    if (!settings.onboardingCompleted) throw new Error('Complete workspace setup before exporting.')
    return { snapshot: { ...await readApplicationSnapshot(), applicationSettings: settings }, currencyCode: settings.currencyCode }
  })
}

export async function importTransactionBatch(values: readonly Transaction[], currencyCode: string): Promise<number> {
  validateCurrencyCode(currencyCode)
  const transactions = structuredClone(values).map(transactionRecord)
  const ids = new Set(transactions.map((transaction) => transaction.id))
  if (ids.size !== transactions.length) throw new Error('The selected batch contains repeated transaction IDs. Review the preview.')
  return database.transaction('rw', database.accounts, database.categories, database.transactions, database.applicationSettings, async () => {
    const settings = validateApplicationSettings(await database.applicationSettings.get(applicationSettingsId))
    if (!settings.onboardingCompleted) throw new Error('Complete workspace setup before importing.')
    requireMatchingCurrency(currencyCode, settings.currencyCode)
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
