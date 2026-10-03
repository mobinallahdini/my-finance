import Dexie, { type Table } from 'dexie'
import type { Account, Category, Transaction } from '../domain/models'

// Internal to persistence: callers should use the repositories, not raw tables.
class FinanceDatabase extends Dexie {
  readonly accounts!: Table<Account, string>
  readonly categories!: Table<Category, string>
  readonly transactions!: Table<Transaction, string>

  constructor() {
    super('my-finance')
    this.version(1).stores({
      accounts: 'id',
      categories: 'id, type',
      transactions: 'id, date, type, accountId, fromAccountId, toAccountId, categoryId',
    })
  }
}

export const database = new FinanceDatabase()
