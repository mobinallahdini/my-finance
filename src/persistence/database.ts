import Dexie, { type Table } from 'dexie'
import type { Account, Category, Obligation, ObligationPayment, Transaction } from '../domain/models'
import { legacyApplicationSettings, applicationSettingsId, type ApplicationSettings } from '../domain/financeSettings.ts'

// Internal to persistence: callers should use the repositories, not raw tables.
class FinanceDatabase extends Dexie {
  readonly accounts!: Table<Account, string>
  readonly categories!: Table<Category, string>
  readonly transactions!: Table<Transaction, string>
  readonly obligations!: Table<Obligation, string>
  readonly obligationPayments!: Table<ObligationPayment, string>
  readonly applicationSettings!: Table<ApplicationSettings, string>

  constructor() {
    super('my-finance')
    this.version(1).stores({
      accounts: 'id',
      categories: 'id, type',
      transactions: 'id, date, type, accountId, fromAccountId, toAccountId, categoryId',
    })
    // Additive upgrade only: retain the original financial schema and all its data.
    this.version(2).stores({
      obligations: 'id, type, startMonth',
      obligationPayments: 'id, obligationId, dueMonth, [obligationId+dueMonth]',
    })
    this.version(3).stores({ applicationSettings: 'id' }).upgrade(async transaction => {
      const counts = await Promise.all(['accounts', 'categories', 'transactions', 'obligations', 'obligationPayments'].map(name => transaction.table(name).count()))
      if (counts.some(count => count > 0) && !await transaction.table('applicationSettings').get(applicationSettingsId)) {
        await transaction.table('applicationSettings').add({ ...legacyApplicationSettings })
      }
    })
  }
}

export const database = new FinanceDatabase()
