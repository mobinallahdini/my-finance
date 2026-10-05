import { liveQuery } from 'dexie'
import { applicationSettingsId, legacyApplicationSettings, validateApplicationSettings, type ApplicationSettings } from '../domain/financeSettings.ts'
import { database } from './database'

const dataTables = () => [database.accounts, database.categories, database.transactions, database.obligations, database.obligationPayments]
async function hasData() { return (await Promise.all(dataTables().map(table => table.count()))).some(count => count > 0) }

/** Also covers fresh databases populated before settings bootstrap and interrupted setup. */
export async function bootstrapApplicationSettings(): Promise<ApplicationSettings | null> {
  return database.transaction('rw', database.tables, async () => {
    const existing = await database.applicationSettings.get(applicationSettingsId)
    if (existing) return validateApplicationSettings(existing)
    if (!await hasData()) return null
    const legacy = { ...legacyApplicationSettings }
    await database.applicationSettings.add(legacy)
    return legacy
  })
}
export class CurrencyChangeConfirmationRequired extends Error {
  readonly currencyCode: string
  constructor(currencyCode: string) {
    super('Changing currency changes how existing amounts are labeled and formatted. Existing values will not be converted.')
    this.name = 'CurrencyChangeConfirmationRequired'
    this.currencyCode = currencyCode
  }
}
export async function saveApplicationSettings(value: unknown, confirmedFromCurrency?: string): Promise<ApplicationSettings> {
  const next = validateApplicationSettings(structuredClone(value))
  return database.transaction('rw', database.tables, async () => {
    const existing = await database.applicationSettings.get(applicationSettingsId)
    const current = existing ? validateApplicationSettings(existing) : await hasData() ? legacyApplicationSettings : null
    if (current && current.currencyCode !== next.currencyCode && await hasData() && confirmedFromCurrency !== current.currencyCode) {
      throw new CurrencyChangeConfirmationRequired(current.currencyCode)
    }
    await database.applicationSettings.put(next)
    return next
  })
}
export function observeApplicationSettings(next: (value: ApplicationSettings | null) => void, error: (error: unknown) => void) {
  return liveQuery(async () => {
    const settings = await database.applicationSettings.get(applicationSettingsId)
    return settings ? validateApplicationSettings(settings) : null
  }).subscribe({ next, error })
}
