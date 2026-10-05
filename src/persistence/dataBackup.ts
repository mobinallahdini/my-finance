import type { Transaction } from '../domain/models'
import { applicationSettingsId, legacyApplicationSettings, validateApplicationSettings, validateCurrencyCode } from '../domain/financeSettings'
import { database } from './database'
import { transactionRecord, validateApplicationSnapshot, type ApplicationSnapshot, type FinancialSnapshot } from './snapshotValidation.ts'
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
export async function replaceApplicationSnapshot(value: unknown, currencyCode?: string): Promise<void> {
  const snapshot = validateApplicationSnapshot(structuredClone(value))
  if (currencyCode !== undefined) validateCurrencyCode(currencyCode)
  await database.transaction('rw', database.tables, async () => {
    if (currencyCode !== undefined) {
      const existing = await database.applicationSettings.get(applicationSettingsId)
      const settings = existing ? validateApplicationSettings(existing) : legacyApplicationSettings
      await database.applicationSettings.put({ ...settings, currencyCode, onboardingCompleted: true })
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
    return { snapshot: await readApplicationSnapshot(), currencyCode: settings.currencyCode }
  })
}

export async function importTransactionBatch(values: readonly Transaction[]): Promise<number> {
  const transactions = structuredClone(values).map(transactionRecord)
  const ids = new Set(transactions.map((transaction) => transaction.id))
  if (ids.size !== transactions.length) throw new Error('The selected batch contains repeated transaction IDs. Review the preview.')
  return database.transaction('rw', database.accounts, database.categories, database.transactions, database.applicationSettings, async () => {
    const settings = await database.applicationSettings.get(applicationSettingsId)
    if (settings && validateApplicationSettings(settings).currencyCode !== 'CAD') {
      throw new Error('This CSV format uses CAD. Currency-aware CSV support will be added in the next step.')
    }
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
