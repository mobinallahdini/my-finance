import type { Account, Category, Transaction, YearMonth } from '../domain/models'
import { database } from './database'
import {
  requireId,
  validateAccount,
  validateCategory,
  validateMonth,
  validateTransaction,
} from './validation'

async function accountIsReferenced(id: string): Promise<boolean> {
  for (const index of ['accountId', 'fromAccountId', 'toAccountId']) {
    if (await database.transactions.where(index).equals(id).count()) return true
  }
  return false
}

async function categoryIsReferenced(id: string): Promise<boolean> {
  return (await database.transactions.where('categoryId').equals(id).count()) > 0
}

async function requireAccount(id: string): Promise<void> {
  if (!(await database.accounts.get(id))) {
    throw new Error(`Account does not exist: ${id}`)
  }
}

async function validateReferences(transaction: Transaction): Promise<void> {
  if (transaction.type === 'transfer') {
    await requireAccount(transaction.fromAccountId)
    await requireAccount(transaction.toAccountId)
  } else {
    await requireAccount(transaction.accountId)
    const category = await database.categories.get(transaction.categoryId)
    if (!category) throw new Error(`Category does not exist: ${transaction.categoryId}`)
    if (category.type !== transaction.type) {
      throw new Error('Transaction and category types must match.')
    }
  }
}

export const accountsRepository = {
  async add(account: Account): Promise<string> {
    const record = structuredClone(account)
    validateAccount(record)
    return database.accounts.add(record)
  },
  async get(id: string): Promise<Account | undefined> {
    requireId(id)
    return database.accounts.get(id)
  },
  async getAll(): Promise<Account[]> {
    return database.accounts.toArray()
  },
  async update(account: Account): Promise<void> {
    const record = structuredClone(account)
    validateAccount(record)
    await database.transaction('rw', database.accounts, database.transactions, async () => {
      const existing = await database.accounts.get(record.id)
      if (!existing) throw new Error(`Account does not exist: ${record.id}`)
      if (existing.type !== record.type && await accountIsReferenced(record.id)) {
        throw new Error('Cannot change the type of an account referenced by transactions.')
      }
      await database.accounts.put(record)
    })
  },
  async delete(id: string): Promise<void> {
    requireId(id)
    await database.transaction('rw', database.accounts, database.transactions, async () => {
      if (await accountIsReferenced(id)) {
        throw new Error('Cannot delete an account referenced by transactions.')
      }
      await database.accounts.delete(id)
    })
  },
}

export const categoriesRepository = {
  async add(category: Category): Promise<string> {
    const record = structuredClone(category)
    validateCategory(record)
    return database.categories.add(record)
  },
  async get(id: string): Promise<Category | undefined> {
    requireId(id)
    return database.categories.get(id)
  },
  async getAll(): Promise<Category[]> {
    return database.categories.toArray()
  },
  async getByType(type: Category['type']): Promise<Category[]> {
    return database.categories.where('type').equals(type).toArray()
  },
  async update(category: Category): Promise<void> {
    const record = structuredClone(category)
    validateCategory(record)
    await database.transaction('rw', database.categories, database.transactions, async () => {
      const existing = await database.categories.get(record.id)
      if (!existing) throw new Error(`Category does not exist: ${record.id}`)
      if (existing.type !== record.type && await categoryIsReferenced(record.id)) {
        throw new Error('Cannot change the type of a category referenced by transactions.')
      }
      await database.categories.put(record)
    })
  },
  async delete(id: string): Promise<void> {
    requireId(id)
    await database.transaction('rw', database.categories, database.transactions, async () => {
      if (await categoryIsReferenced(id)) {
        throw new Error('Cannot delete a category referenced by transactions.')
      }
      await database.categories.delete(id)
    })
  },
}

async function writeTransaction(transaction: Transaction, update: boolean): Promise<string> {
  const record = structuredClone(transaction)
  validateTransaction(record)
  return database.transaction(
    'rw', database.accounts, database.categories, database.transactions,
    async () => {
      if (update && !(await database.transactions.get(record.id))) {
        throw new Error(`Transaction does not exist: ${record.id}`)
      }
      await validateReferences(record)
      return update ? database.transactions.put(record) : database.transactions.add(record)
    },
  )
}

export const transactionsRepository = {
  async add(transaction: Transaction): Promise<string> {
    return writeTransaction(transaction, false)
  },
  async get(id: string): Promise<Transaction | undefined> {
    requireId(id)
    return database.transactions.get(id)
  },
  async getAll(): Promise<Transaction[]> {
    return database.transactions.toArray()
  },
  async getByType(type: Transaction['type']): Promise<Transaction[]> {
    return database.transactions.where('type').equals(type).toArray()
  },
  async getByAccount(accountId: string): Promise<Transaction[]> {
    requireId(accountId)
    return database.transactions
      .where('accountId').equals(accountId)
      .or('fromAccountId').equals(accountId)
      .or('toAccountId').equals(accountId)
      .toArray()
  },
  async getForMonth(month: YearMonth): Promise<Transaction[]> {
    validateMonth(month)
    return database.transactions.where('date')
      .between(`${month}-01`, `${month}-31`, true, true).toArray()
  },
  async update(transaction: Transaction): Promise<void> {
    await writeTransaction(transaction, true)
  },
  async delete(id: string): Promise<void> {
    requireId(id)
    await database.transactions.delete(id)
  },
}
