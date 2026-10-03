import { useCallback, useEffect, useState } from 'react'
import type { Account, Category, ExpenseTransaction } from '../../domain/models'
import { accountsRepository, categoriesRepository, transactionsRepository } from '../../persistence/repositories'
import { notifyDataChanged, useDataRefresh } from '../shared/dataRefresh'
import { compareExpenses } from './expenseHelpers'

export function useExpenses() {
  const [expenses, setExpenses] = useState<ExpenseTransaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isWriting, setIsWriting] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loadVersion, setLoadVersion] = useState(0)

  const reload = useCallback(() => {
    setLoadError(null)
    setIsLoading(true)
    setLoadVersion((version) => version + 1)
  }, [])

  useDataRefresh(reload)

  useEffect(() => {
    let active = true

    async function load() {
      try {
        const [loadedTransactions, loadedAccounts, loadedCategories] = await Promise.all([
          transactionsRepository.getByType('expense'),
          accountsRepository.getAll(),
          categoriesRepository.getByType('expense'),
        ])
        if (!active) return
        setExpenses(loadedTransactions.filter((transaction): transaction is ExpenseTransaction => (
          transaction.type === 'expense'
        )).sort(compareExpenses))
        setAccounts(loadedAccounts.sort((left, right) => left.name.localeCompare(right.name)))
        setCategories(loadedCategories.sort((left, right) => left.name.localeCompare(right.name)))
      } catch {
        if (active) {
          setLoadError('Expenses, accounts, and expense categories could not be loaded from browser storage. Check that IndexedDB is available, then use Refresh to retry.')
        }
      } finally {
        if (active) setIsLoading(false)
      }
    }

    void load()
    return () => { active = false }
  }, [loadVersion])

  async function write(action: () => Promise<unknown>) {
    setIsWriting(true)
    try {
      await action()
      // A committed write stays successful even if a subsequent feature read fails.
      notifyDataChanged()
    } finally {
      setIsWriting(false)
    }
  }

  async function saveExpense(expense: ExpenseTransaction, editing: boolean) {
    // The repository rechecks persisted references and category type atomically.
    await write(() => editing
      ? transactionsRepository.update(expense)
      : transactionsRepository.add(expense))
  }

  async function deleteExpense(id: string) {
    await write(() => transactionsRepository.delete(id))
  }

  return { expenses, accounts, categories, isLoading, isWriting, loadError, reload, saveExpense, deleteExpense }
}
